"use client";
import React, { useEffect, useState, useCallback } from "react";
import { Dosya, Rezervasyon, Konteyner, FumigationAyari } from "@/lib/supabase";
import { supabase, getGuvenliDosyaUrl } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { useAuth } from "@/lib/auth-context";
import { FileText, Pencil, Loader2, Eye, CheckCircle2 } from "lucide-react";
import InfoTooltip from "@/components/info-tooltip";
import { buildCommercialInvoiceHtml } from "@/lib/invoice-builder";
import { buildPackingListHtml } from "@/lib/packing-list-builder";
import { buildFumigationHtml } from "@/lib/fumigation-builder";
import { draftFiligranEkle, draftFiligranKaldir } from "@/lib/watermark";
import {
  checkCommercialInvoiceReadiness,
  checkPackingListReadiness,
  checkFumigationReadiness,
} from "@/lib/document-readiness";
import FumigationAyarModal from "@/components/fumigation-ayar-modal";
import { ConfirmDialog } from "@/components/confirm-dialog";

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

// Uc evrak turunun sabit meta bilgisi - hem ilk uretimde hem "Orijinali Olustur"
// akisinda AYNI storage yolunu/adini yeniden turetmek icin kullanilir.
const EVRAK_META: Record<"ci" | "pl" | "fc", { evrakTipi: string; siraNo: number; evrakKisa: string; evrakAdi: string }> = {
  ci: { evrakTipi: "commercial_invoice", siraNo: 1, evrakKisa: "commercial_invoice", evrakAdi: "COMMERCIAL INVOICE" },
  pl: { evrakTipi: "packing_list", siraNo: 2, evrakKisa: "packing_list", evrakAdi: "PACKING LIST" },
  fc: { evrakTipi: "fumigation", siraNo: 8, evrakKisa: "fumigation", evrakAdi: "FUMIGATION" },
};

type EvrakDurumu = { durum: "taslak" | "orijinal"; dosya_url: string; dosya_adi: string } | null;

type Props = {
  dosya: Dosya;
  rezervasyonlar: Rezervasyon[];
  konteynerler: Konteyner[];
  show?: "ci" | "pl" | "fc" | "both";
};

export default function EvrakOlusturButtons({ dosya, rezervasyonlar, konteynerler, show = "both" }: Props) {
  const { showToast } = useToast();
  const { companyId } = useAuth(); // SaaS: şirket bazlı izolasyon için company_id kaynağı
  const [fumigationAyar, setFumigationAyar] = useState<FumigationAyari | null>(null);
  const [ayarModalAcik, setAyarModalAcik] = useState(false);
  // Hangi evrak hazirlaniyor: "ci" | "pl" | "fc" | null (her buton kendi loading'ini gosterir)
  const [yukleniyor, setYukleniyor] = useState<"ci" | "pl" | "fc" | null>(null);
  // "Orijinali Olustur" islemi icin ayri, evrak_tipi bazli loading durumu
  const [orijinalYukleniyor, setOrijinalYukleniyor] = useState<Record<string, boolean>>({});
  // Her evrak_tipi icin mevcut kayit durumu (taslak/orijinal/hic yok)
  const [durumlar, setDurumlar] = useState<Record<string, EvrakDurumu>>({});
  // ORIJINAL onaylanmis bir evragi yanlislikla tekrar taslaga cevirmeyi
  // onlemek icin: bu durumda once onay istenir.
  const [yenidenTaslakConfirm, setYenidenTaslakConfirm] = useState<"ci" | "pl" | "fc" | null>(null);

  const ciHazirlik = checkCommercialInvoiceReadiness(dosya, rezervasyonlar, konteynerler);
  const plHazirlik = checkPackingListReadiness(dosya, rezervasyonlar, konteynerler);
  const fcHazirlik = checkFumigationReadiness(dosya, rezervasyonlar, konteynerler);

  // Musteri bazli fumigation ayarlarini yukle
  useEffect(() => {
    if (!dosya.alici_firma) return;
    const fetchAyar = async () => {
      if (!companyId) return; // Şirket bilinmeden fumigation ayarı çekme
      const { data } = await supabase
        .from("fumigation_ayarlari")
        .select("*")
        .eq("alici_firma", dosya.alici_firma)
        .eq("company_id", companyId) // SaaS: şirket bazlı izolasyon
        .maybeSingle();
      if (data) setFumigationAyar(data);
    };
    fetchAyar();
  }, [dosya.alici_firma, companyId]);

  // Mevcut evrak durumlarini (taslak/orijinal) yukle - hem ilk acilista hem
  // bir islemden sonra tazelemek icin.
  const durumlariYukle = useCallback(async () => {
    if (!companyId) return;
    const { data } = await supabase
      .from("dosya_evraklari")
      .select("evrak_tipi, durum, dosya_url, dosya_adi")
      .eq("dosya_id", dosya.id)
      .eq("company_id", companyId)
      .in("evrak_tipi", ["commercial_invoice", "packing_list", "fumigation"]);

    const map: Record<string, EvrakDurumu> = {};
    (data || []).forEach((kayit: any) => {
      map[kayit.evrak_tipi] = { durum: kayit.durum, dosya_url: kayit.dosya_url, dosya_adi: kayit.dosya_adi };
    });
    setDurumlar(map);
  }, [dosya.id, companyId]);

  useEffect(() => {
    durumlariYukle();
  }, [durumlariYukle]);

  const kaydetVeAc = async (html: string, evrakTipi: string, storageAdi: string, gosterilenAd: string, durum: "taslak" | "orijinal") => {
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
      if (!companyId) {
        // Şirket bilgisi yoksa arşive yazma (NULL company_id kaydı oluşmasın); evrak yine de açılır.
        console.warn("companyId yok, evrak arşive kaydedilmedi ama açılıyor.");
        acBlobIle();
        return;
      }
      const blob = new Blob([guncelHtml], { type: "text/html; charset=utf-8" });
      const storagePath = `${dosya.id}/${storageAdi}`;

      const { error: uploadError } = await supabase.storage
        .from("evraklar")
        .upload(storagePath, blob, { contentType: "text/html; charset=utf-8", upsert: true });

      if (uploadError) {
        console.error("Storage yukleme hatasi:", uploadError);
        showToast("Evrak arşive kaydedilemedi ama açılıyor.", "error");
      } else {
        const dosyaUrl = await getGuvenliDosyaUrl("evraklar", storagePath);

        const { data: mevcutKayit } = await supabase
          .from("dosya_evraklari")
          .select("id")
          .eq("dosya_id", dosya.id)
          .eq("evrak_tipi", evrakTipi)
          .eq("company_id", companyId) // SaaS: şirket bazlı izolasyon
          .maybeSingle();

        if (mevcutKayit) {
          await supabase.from("dosya_evraklari").update({
            dosya_url: dosyaUrl,
            dosya_adi: gosterilenAd,
            yukleme_tarihi: new Date().toISOString(),
            durum,
          }).eq("id", mevcutKayit.id).eq("company_id", companyId); // SaaS: update de şirkete kilitli
        } else {
          await supabase.from("dosya_evraklari").insert({            dosya_id: dosya.id,
            evrak_tipi: evrakTipi,
            dosya_url: dosyaUrl,
            dosya_adi: gosterilenAd,
            yukleme_tarihi: new Date().toISOString(),
            durum,
            company_id: companyId, // SaaS: yeni kayda şirket mührü
          });
        }
        await durumlariYukle();
      }
    } catch (err) {
      console.error("Evrak kaydetme hatasi:", err);
      showToast("Evrak arşive kaydedilemedi ama açılıyor. Lütfen tekrar deneyin.", "error");
    }

    // Arsivleme sonucu ne olursa olsun evrak her zaman acilir.    acBlobIle();
  };

  const handleOlustur = async (tip: "ci" | "pl" | "fc") => {
    if (yukleniyor) return; // Cift tiklama koruması
    setYukleniyor(tip);
    try {
      const meta = EVRAK_META[tip];
      let htmlHam: string;
      if (tip === "ci") htmlHam = buildCommercialInvoiceHtml(dosya, rezervasyonlar, konteynerler);
      else if (tip === "pl") htmlHam = buildPackingListHtml(dosya, rezervasyonlar, konteynerler);
      else htmlHam = buildFumigationHtml(dosya, rezervasyonlar, konteynerler, fumigationAyar);

      // Ilk uretim HER ZAMAN taslak (DRAFT filigranli) olarak kaydedilir.
      // Musteri onayindan sonra "Orijinali Olustur" ile filigran kaldirilir.
      const htmlTaslak = draftFiligranEkle(htmlHam);
      await kaydetVeAc(htmlTaslak, meta.evrakTipi,
        storageDosyaAdi(meta.siraNo, meta.evrakKisa, dosya, rezervasyonlar),
        gosterilecekDosyaAdi(meta.siraNo, meta.evrakAdi, dosya, rezervasyonlar),
        "taslak");
    } catch (err) {
      console.error("Evrak olusturma hatasi:", err);
      showToast("Evrak oluşturulamadı.", "error");
    } finally {
      setYukleniyor(null);
    }
  };

  // "Orijinali Olustur": musterinin onayladigi TASLAGIN AYNISINI alip sadece
  // filigranini kaldirir - sifirdan yeniden URETMEZ. Boylece gonderilen orijinal,
  // onaylanan taslaktan asla farkli olmaz (ihracat/gumruk/banka evraklarinda
  // bu tutarlilik kritik onemde).
  const handleOrijinalYap = async (tip: "ci" | "pl" | "fc") => {
    const meta = EVRAK_META[tip];
    const mevcut = durumlar[meta.evrakTipi];
    if (!mevcut || mevcut.durum !== "taslak" || orijinalYukleniyor[meta.evrakTipi]) return;

    setOrijinalYukleniyor((prev) => ({ ...prev, [meta.evrakTipi]: true }));
    try {
      const res = await fetch(mevcut.dosya_url);
      if (!res.ok) throw new Error("Taslak evrak indirilemedi.");
      const htmlTaslak = await res.text();
      const htmlTemiz = draftFiligranKaldir(htmlTaslak);

      await kaydetVeAc(htmlTemiz, meta.evrakTipi,
        storageDosyaAdi(meta.siraNo, meta.evrakKisa, dosya, rezervasyonlar),
        gosterilecekDosyaAdi(meta.siraNo, meta.evrakAdi, dosya, rezervasyonlar),
        "orijinal");
      showToast(`${meta.evrakAdi} orijinal (filigransız) hale getirildi.`, "success");
    } catch (err) {
      console.error("Orijinal yapma hatasi:", err);
      showToast("Evrak orijinal hale getirilemedi.", "error");
    } finally {
      setOrijinalYukleniyor((prev) => ({ ...prev, [meta.evrakTipi]: false }));
    }
  };

  // "Olustur"/"Taslagi Yenile" butonuna tiklandiginda cagrilir. Eger evrak
  // zaten ORIJINAL (onaylanmis) durumdaysa, dogrudan yeniden uretmez -
  // once kullanicidan acik bir onay ister. Boylece muhasebe/ihracat personeli
  // yanlislikla onaylanmis bir evragi tekrar DRAFT filigranli hale
  // dondurmez (bu, gumruk/banka surecinde ciddi karisikliga yol acabilir).
  const handleOlusturTiklandi = (tip: "ci" | "pl" | "fc") => {
    const meta = EVRAK_META[tip];
    const kayit = durumlar[meta.evrakTipi];
    if (kayit?.durum === "orijinal") {
      setYenidenTaslakConfirm(tip);
    } else {
      handleOlustur(tip);
    }
  };

  const btnClass = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 transition-colors";
  const btnClassMuted = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 transition-colors";
  const iconBtnClass = "inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors";

  /** Uc evrak turu icin ortak render mantigi: hazir degilse uyari, hazirsa
   * durum rozeti + Olustur/Yeniden Olustur + Orijinali Olustur butonlari. */
  const renderEvrakButonlari = (tip: "ci" | "pl" | "fc", hazirlik: { hazir: boolean; eksikler: string[] }, etiket: string) => {
    if (!hazirlik.hazir) {
      return (
        <InfoTooltip variant="warning" position="bottom" align="right" width="w-64" size={14}>
          <span className="font-semibold text-amber-600">{etiket} eksik bilgiler:</span> {hazirlik.eksikler.join(", ")}
        </InfoTooltip>
      );
    }
    const meta = EVRAK_META[tip];
    const kayit = durumlar[meta.evrakTipi];
    const buOrijinalYukleniyor = !!orijinalYukleniyor[meta.evrakTipi];

    return (
      <div className="flex items-center gap-1.5">
        {kayit && (
          <>
            <span
              className={
                "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold " +
                (kayit.durum === "taslak" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200")
              }
            >
              {kayit.durum === "taslak" ? "TASLAK" : <><CheckCircle2 size={10} /> ORİJİNAL</>}
            </span>
            <a href={kayit.dosya_url} target="_blank" rel="noopener noreferrer" className={iconBtnClass} title="Mevcut evrağı görüntüle">
              <Eye size={14} />
            </a>
          </>
        )}
        <button
          onClick={() => handleOlusturTiklandi(tip)}
          disabled={yukleniyor !== null}
          title={kayit?.durum === "orijinal" ? "Dikkat: Onaylanmış orijinali tekrar taslağa çevirir" : undefined}
          className={(kayit?.durum === "orijinal" ? btnClassMuted : btnClass) + " disabled:opacity-60 disabled:cursor-not-allowed"}
        >
          {yukleniyor === tip ? (
            <><Loader2 size={12} className="animate-spin" /> Hazırlanıyor...</>
          ) : kayit?.durum === "orijinal" ? (
            <><FileText size={12} /> Yeniden Taslak Oluştur</>
          ) : (
            <><FileText size={12} /> {kayit ? "Taslağı Yenile" : etiket}</>
          )}
        </button>
        {kayit?.durum === "taslak" && (
          <button
            onClick={() => handleOrijinalYap(tip)}
            disabled={buOrijinalYukleniyor}
            title="Müşteri onayı alındıktan sonra filigransız orijinali oluşturur"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {buOrijinalYukleniyor ? (
              <><Loader2 size={12} className="animate-spin" /> Oluşturuluyor...</>
            ) : (
              <><CheckCircle2 size={12} /> Orijinali Oluştur</>
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      {show === "both" ? (
        // Dar alanlarda (ör. Ihracatlar hizli onizleme paneli) uc evrak turu
        // ayni satirda sikisip karismasin diye her biri kendi etiketli
        // satirinda, alt alta gosterilir.
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-medium shrink-0" style={{ color: "#94a3b8" }}>Commercial Invoice</span>
            {renderEvrakButonlari("ci", ciHazirlik, "Commercial Invoice")}
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-medium shrink-0" style={{ color: "#94a3b8" }}>Packing List</span>
            {renderEvrakButonlari("pl", plHazirlik, "Packing List")}
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-medium shrink-0" style={{ color: "#94a3b8" }}>Fumigation Cert.</span>
            <div className="flex items-center gap-1.5">
              {renderEvrakButonlari("fc", fcHazirlik, "Fumigation Cert.")}
              <button onClick={() => setAyarModalAcik(true)} className={iconBtnClass} title="Fumigasyon ayarlarını düzenle">
                <Pencil size={13} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Dosya detay sayfasinda oldugu gibi TEK bir evrak turu icin kompakt gosterim -
        // burada ust satirda zaten evrak adi ayrica gosterildigi icin tekrar etiketlenmez.
        <div className="flex items-center gap-2 flex-wrap">
          {show === "ci" && renderEvrakButonlari("ci", ciHazirlik, "Commercial Invoice")}
          {show === "pl" && renderEvrakButonlari("pl", plHazirlik, "Packing List")}
          {show === "fc" && (
            <div className="flex items-center gap-1.5">
              {renderEvrakButonlari("fc", fcHazirlik, "Fumigation Cert.")}
              <button onClick={() => setAyarModalAcik(true)} className={iconBtnClass} title="Fumigasyon ayarlarını düzenle">
                <Pencil size={13} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Kullaniciya surecin nasil isledigini hatirlatan, gosterisiz bir ipucu */}
      {Object.keys(durumlar).length === 0 && (ciHazirlik.hazir || plHazirlik.hazir || fcHazirlik.hazir) && (
        <p className="text-[11px] mt-1.5" style={{ color: "#94a3b8" }}>
          İşlem sırası: önce <strong>Oluştur</strong> ile taslağı (DRAFT filigranlı) hazırlayın → müşteriye onaya gönderin → onay gelince <strong>Orijinali Oluştur</strong> butonuna basın.
        </p>
      )}

      {/* Fumigation ayar modali */}
      {dosya.alici_firma && (
        <FumigationAyarModal
          aliciFirma={dosya.alici_firma}
          open={ayarModalAcik}
          onClose={() => setAyarModalAcik(false)}
          onSaved={(ayar) => setFumigationAyar(ayar)}
        />
      )}

      {/* Orijinal onayli bir evragi tekrar taslaga cevirme onayi */}
      <ConfirmDialog
        open={yenidenTaslakConfirm !== null}
        onOpenChange={(open) => { if (!open) setYenidenTaslakConfirm(null); }}
        title="Onaylanmış orijinali taslağa çevir?"
        description="Bu evrak zaten ORİJİNAL olarak onaylanmış ve muhtemelen müşteriye gönderilmiş durumda. Yeniden oluşturursanız DRAFT filigranlı hale döner ve tekrar müşteri onayı gerekir. Emin misiniz?"
        confirmLabel="Evet, Yeniden Taslak Yap"
        cancelLabel="Vazgeç"
        onConfirm={() => {
          const tip = yenidenTaslakConfirm;
          setYenidenTaslakConfirm(null);
          if (tip) handleOlustur(tip);
        }}
        destructive
      />
    </>
  );
}