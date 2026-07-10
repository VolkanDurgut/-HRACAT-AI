"use client";
import React, { useEffect, useState } from "react";
import { Dosya, Rezervasyon, Konteyner, FumigationAyari } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { FileText, Pencil } from "lucide-react";
import InfoTooltip from "@/components/info-tooltip";
import { buildCommercialInvoiceHtml } from "@/lib/invoice-builder";
import { buildPackingListHtml } from "@/lib/packing-list-builder";
import { buildFumigationHtml } from "@/lib/fumigation-builder";
import {
  checkCommercialInvoiceReadiness,
  checkPackingListReadiness,
  checkFumigationReadiness,
} from "@/lib/document-readiness";
import FumigationAyarModal from "@/components/fumigation-ayar-modal";

/** Turkce karakterleri Latin karsiliklariyla degistirir. */
function turkceSadelestir(metin: string): string {
  const map: Record<string, string> = {
    "ı": "i", "İ": "I", "ş": "s", "Ş": "S", "ğ": "g", "Ğ": "G",
    "ü": "u", "Ü": "U", "ö": "o", "Ö": "O", "ç": "c", "Ç": "C",
  };
  return metin.split("").map((ch) => map[ch] ?? ch).join("");
}

/** Kullaniciya gosterilen okunakli ad: bosluklu, Turkce sadelestirilmis.
 * Ornek: "1- COMMERCIAL INVOICE- FIRMA- BOOKING.html" */
function gosterilecekDosyaAdi(siraNo: number, evrakAdi: string, dosya: Dosya, rezervasyonlar: Rezervasyon[]): string {
  const firma = turkceSadelestir(dosya.alici_firma || dosya.dosya_no || "FIRMA");
  const bookingNo = rezervasyonlar[0]?.booking_no || "";
  const parcalar = [`${siraNo}- ${evrakAdi}`, firma];
  if (bookingNo) parcalar.push(turkceSadelestir(bookingNo));
  return parcalar.join("- ").replace(/[\/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim() + ".html";
}

/** Storage yolu icin sade ad: boslukluk yok, sadece alfanumerik + _ + -. */
function storageDosyaAdi(siraNo: number, evrakKisa: string, dosya: Dosya, rezervasyonlar: Rezervasyon[]): string {
  const firma = turkceSadelestir(dosya.alici_firma || dosya.dosya_no || "firma");
  const bookingNo = rezervasyonlar[0]?.booking_no || "";
  const ham = [`${siraNo}`, evrakKisa, firma, bookingNo].filter(Boolean).join("_");
  return turkceSadelestir(ham).replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") + ".html";
}

type Props = {
  dosya: Dosya;
  rezervasyonlar: Rezervasyon[];
  konteynerler: Konteyner[];
  show?: "ci" | "pl" | "fc" | "both";
};

export default function EvrakOlusturButtons({ dosya, rezervasyonlar, konteynerler, show = "both" }: Props) {
  const { showToast } = useToast();
  const [fumigationAyar, setFumigationAyar] = useState<FumigationAyari | null>(null);
  const [ayarModalAcik, setAyarModalAcik] = useState(false);

  const ciHazirlik = checkCommercialInvoiceReadiness(dosya, rezervasyonlar, konteynerler);
  const plHazirlik = checkPackingListReadiness(dosya, rezervasyonlar, konteynerler);
  const fcHazirlik = checkFumigationReadiness(dosya, rezervasyonlar, konteynerler);

  // Musteri bazli fumigation ayarlarini yukle
  useEffect(() => {
    if (!dosya.alici_firma) return;
    const fetchAyar = async () => {
      const { data } = await supabase
        .from("fumigation_ayarlari")
        .select("*")
        .eq("alici_firma", dosya.alici_firma)
        .single();
      if (data) setFumigationAyar(data);
    };
    fetchAyar();
  }, [dosya.alici_firma]);

  const kaydetVeAc = async (html: string, evrakTipi: string, storageAdi: string, gosterilenAd: string) => {
    const temizIsim = gosterilenAd.replace(".html", "");
    const guncelHtml = html.replace(/<title>.*?<\/title>/i, `<title>${temizIsim}</title>`);

    // Evragi her zaman Blob URL ile ac. Bu yontem:
    //  - render'i garanti eder (content-type text/html, storage davranisindan bagimsiz),
    //  - Ctrl+P'de dosya adini dogru gosterir (gercek bir blob: URL'i, <title>'dan gelir),
    //  - storage/internet yavas olsa bile aninda acilir.
    const acBlobIle = () => {
      const blob = new Blob([guncelHtml], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        showToast("Açılır pencere engellendi. Lütfen tarayıcı ayarlarından izin verin.", "error");
      }
      // Bellek sizmasini onlemek icin bir sure sonra blob URL'ini serbest birak.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    };

    // Arsivleme: evragi Supabase Storage'a kaydet + dosya_evraklari kaydini guncelle.
    // Bu adim basarisiz olsa bile (asagida) evrak yine de acilir.
    try {
      const blob = new Blob([guncelHtml], { type: "text/html; charset=utf-8" });
      const storagePath = `${dosya.id}/${storageAdi}`;

      const { error: uploadError } = await supabase.storage
        .from("evraklar")
        .upload(storagePath, blob, { contentType: "text/html; charset=utf-8", upsert: true });

      if (uploadError) {
        console.error("Storage yukleme hatasi:", uploadError);
        showToast("Evrak arşive kaydedilemedi ama açılıyor.", "error");
      } else {
        const { data: urlData } = supabase.storage.from("evraklar").getPublicUrl(storagePath);

        const { data: mevcutKayit } = await supabase
          .from("dosya_evraklari")
          .select("id")
          .eq("dosya_id", dosya.id)
          .eq("evrak_tipi", evrakTipi)
          .single();

        if (mevcutKayit) {
          await supabase.from("dosya_evraklari").update({
            dosya_url: urlData.publicUrl,
            dosya_adi: gosterilenAd,
            yukleme_tarihi: new Date().toISOString(),
          }).eq("id", mevcutKayit.id);
        } else {
          await supabase.from("dosya_evraklari").insert({
            dosya_id: dosya.id,
            evrak_tipi: evrakTipi,
            dosya_url: urlData.publicUrl,
            dosya_adi: gosterilenAd,
            yukleme_tarihi: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.error("Evrak kaydetme hatasi:", err);
    }

    // Arsivleme sonucu ne olursa olsun evrak her zaman acilir.
    acBlobIle();
  };

  const handleCommercialInvoiceOlustur = () => {
    const html = buildCommercialInvoiceHtml(dosya, rezervasyonlar, konteynerler);
    kaydetVeAc(html, "commercial_invoice",
      storageDosyaAdi(1, "commercial_invoice", dosya, rezervasyonlar),
      gosterilecekDosyaAdi(1, "COMMERCIAL INVOICE", dosya, rezervasyonlar));
  };

  const handlePackingListOlustur = () => {
    const html = buildPackingListHtml(dosya, rezervasyonlar, konteynerler);
    kaydetVeAc(html, "packing_list",
      storageDosyaAdi(2, "packing_list", dosya, rezervasyonlar),
      gosterilecekDosyaAdi(2, "PACKING LIST", dosya, rezervasyonlar));
  };

  const handleFumigationOlustur = () => {
    const html = buildFumigationHtml(dosya, rezervasyonlar, konteynerler, fumigationAyar);
    kaydetVeAc(html, "fumigation",
      storageDosyaAdi(8, "fumigation", dosya, rezervasyonlar),
      gosterilecekDosyaAdi(8, "FUMIGATION", dosya, rezervasyonlar));
  };

  const btnClass = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors";
  const iconBtnClass = "inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors";

  return (
    <>
      <div className="flex items-center gap-1">
        {(show === "ci" || show === "both") && (
          ciHazirlik.hazir ? (
            <button onClick={handleCommercialInvoiceOlustur} className={btnClass}>
              <FileText size={12} /> Commercial Invoice
            </button>
          ) : (
            <InfoTooltip variant="warning" position="bottom" width="w-64" size={14}>
              <span className="font-semibold text-amber-600">Commercial Invoice eksik bilgiler:</span> {ciHazirlik.eksikler.join(", ")}
            </InfoTooltip>
          )
        )}
        {(show === "pl" || show === "both") && (
          plHazirlik.hazir ? (
            <button onClick={handlePackingListOlustur} className={btnClass}>
              <FileText size={12} /> Packing List
            </button>
          ) : (
            <InfoTooltip variant="warning" position="bottom" width="w-64" size={14}>
              <span className="font-semibold text-amber-600">Packing List eksik bilgiler:</span> {plHazirlik.eksikler.join(", ")}
            </InfoTooltip>
          )
        )}
        {(show === "fc" || show === "both") && (
          <div className="flex items-center gap-1">
            {fcHazirlik.hazir ? (
              <button onClick={handleFumigationOlustur} className={btnClass}>
                <FileText size={12} /> Fumigation Cert.
              </button>
            ) : (
              <InfoTooltip variant="warning" position="bottom" width="w-64" size={14}>
                <span className="font-semibold text-amber-600">Fumigation Certificate eksik bilgiler:</span> {fcHazirlik.eksikler.join(", ")}
              </InfoTooltip>
            )}
            {/* Kalem butonu - her zaman görünür, ayar modalını açar */}
            <button
              onClick={() => setAyarModalAcik(true)}
              className={iconBtnClass}
              title="Fumigasyon ayarlarını düzenle"
            >
              <Pencil size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Fumigation ayar modali */}
      {dosya.alici_firma && (
        <FumigationAyarModal
          aliciFirma={dosya.alici_firma}
          open={ayarModalAcik}
          onClose={() => setAyarModalAcik(false)}
          onSaved={(ayar) => setFumigationAyar(ayar)}
        />
      )}
    </>
  );
}
