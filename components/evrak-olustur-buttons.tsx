"use client";
import React, { useEffect, useState, useCallback } from "react";
import { Dosya, Rezervasyon, Konteyner, FumigationAyari, KaliteSertifikasiAyari } from "@/lib/supabase";
import { supabase, getGuvenliDosyaUrl, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { useAuth } from "@/lib/auth-context";
import { FileText, Pencil, Loader2, CheckCircle2 } from "lucide-react";
import InfoTooltip from "@/components/info-tooltip";
import { buildCommercialInvoiceHtml } from "@/lib/invoice-builder";
import { buildPackingListHtml } from "@/lib/packing-list-builder";
import { buildFumigationHtml } from "@/lib/fumigation-builder";
import { buildKaliteSertifikasiHtml } from "@/lib/kalite-sertifikasi-builder";
import { buildCertificateOfOriginHtml } from "@/lib/certificate-of-origin-builder";
import { buildPhytosanitaryCertificateHtml } from "@/lib/phytosanitary-certificate-builder";
import { buildHealthCertificateHtml } from "@/lib/health-certificate-builder";
import { draftFiligranEkle } from "@/lib/watermark";
import { htmlToPdfBlob } from "@/lib/html-to-pdf";
import { buildEvrakPdfDosyaAdi, EVRAK_KISA_KODLARI } from "@/lib/evrak-dosya-adi";
import {
  checkCommercialInvoiceReadiness,
  checkPackingListReadiness,
  checkFumigationReadiness,
  checkCertificateOfOriginReadiness,
  checkPhytosanitaryCertificateReadiness,
  checkHealthCertificateReadiness,
  checkKaliteSertifikasiReadiness,
} from "@/lib/document-readiness";
import FumigationAyarModal from "@/components/fumigation-ayar-modal";
import KaliteSertifikasiAyarModal from "@/components/kalite-sertifikasi-ayar-modal";
import EctnDegerleriModal, { EctnOverrideDegerleri } from "@/components/ectn-degerleri-modal";
import { ConfirmDialog } from "@/components/confirm-dialog";

/** Turkce karakterleri Latin karsiliklariyla degistirir. */
function turkceSadelestir(metin: string): string {
  const map: Record<string, string> = {
    "ı": "i", "İ": "I", "ş": "s", "Ş": "S", "ğ": "g", "Ğ": "G",
    "ü": "u", "Ü": "U", "ö": "o", "Ö": "O", "ç": "c", "Ç": "C",
  };
  return metin.split("").map((ch) => map[ch] ?? ch).join("");
}

// Uc evrak turunun sabit meta bilgisi - hem ilk uretimde hem "Orijinali Olustur"
// akisinda AYNI dosya adini/storage yolunu yeniden turetmek icin kullanilir.
// evrakAdi sadece hazirlik uyarisi (InfoTooltip) basliginda kullanilir; PDF
// dosya adi artik lib/evrak-dosya-adi.ts -> buildEvrakPdfDosyaAdi ile uretilir
// (Taslak Onay Paketi'yle BIREBIR AYNI kural - talep: 01.10.2026).
const EVRAK_META: Record<"ci" | "pl" | "coo" | "phyto" | "health" | "fc" | "qc", { evrakTipi: string; siraNo: number; evrakAdi: string }> = {
  ci:  { evrakTipi: "commercial_invoice",     siraNo: 1, evrakAdi: "COMMERCIAL INVOICE" },
  pl:  { evrakTipi: "packing_list",           siraNo: 2, evrakAdi: "PACKING LIST" },
  coo:   { evrakTipi: "certificate_of_origin",  siraNo: 4, evrakAdi: "CERTIFICATE OF ORIGIN" },
  phyto:  { evrakTipi: "phytosanitary",          siraNo: 5, evrakAdi: "PHYTOSANITARY CERTIFICATE" },
  health: { evrakTipi: "health_certificate",     siraNo: 6, evrakAdi: "HEALTH CERTIFICATE" },
  qc:    { evrakTipi: "quality_certificate",    siraNo: 7, evrakAdi: "QUALITY CERTIFICATE" },
  fc:    { evrakTipi: "fumigation",             siraNo: 8, evrakAdi: "FUMIGATION" },
};

type EvrakDurumu = { durum: "taslak" | "orijinal"; dosya_url: string; dosya_adi: string } | null;

type Props = {
  dosya: Dosya;
  rezervasyonlar: Rezervasyon[];
  konteynerler: Konteyner[];
  show?: "ci" | "pl" | "coo" | "phyto" | "health" | "fc" | "qc" | "both";
};

export default function EvrakOlusturButtons({ dosya, rezervasyonlar, konteynerler, show = "both" }: Props) {
  const { showToast } = useToast();
  const { companyId } = useAuth(); // SaaS: şirket bazlı izolasyon için company_id kaynağı
  const [fumigationAyar, setFumigationAyar] = useState<FumigationAyari | null>(null);
  const [ayarModalAcik, setAyarModalAcik] = useState(false);
  const [kaliteAyar, setKaliteAyar] = useState<KaliteSertifikasiAyari | null>(null);
  const [kaliteAyarModalAcik, setKaliteAyarModalAcik] = useState(false);
  // ECTN basvurusu isaretlendiyse Commercial Invoice'a TOTAL FOB/FREIGHT/
  // TOTAL CFR satirlari eklenir (talep: 28.09.2026). Yerel state - dosya
  // prop'u disaridan (parent) yenilenmeden ONCE bile bir sonraki Draft/
  // Orijinal tiklamasinda hemen yeni degeri kullanabilmek icin.
  const dosyaEctnBasvurusu = !!dosya.ectn_basvurusu;
  const [ectnBasvurusu, setEctnBasvurusu] = useState<boolean>(dosyaEctnBasvurusu);
  useEffect(() => { setEctnBasvurusu(dosyaEctnBasvurusu); }, [dosya.id, dosyaEctnBasvurusu]);
  // ECTN satirlarinin manuel girilmis degerleri (talep: 28.09.2026). NULL ise
  // otomatik hesaplanir - bkz. lib/invoice-builder.ts. "Duzenle" modalindan
  // kaydedilince buradaki yerel state de aninda guncellenir, boylece dosya
  // prop'u disaridan yenilenmeden once bile bir sonraki Draft/Orijinal
  // tiklamasi guncel degerleri kullanir.
  const dosyaEctnFobOverride = dosya.ectn_fob_override ?? null;
  const dosyaEctnFreightOverride = dosya.ectn_freight_override ?? null;
  const dosyaEctnCfrOverride = dosya.ectn_cfr_override ?? null;
  // INSURANCE'in otomatik hesaplamasi YOK (talep: 29.09.2026) - sadece elle
  // girilen deger var, digerleriyle ayni "yerel state" mantigiyla tutulur.
  const dosyaEctnInsuranceOverride = dosya.ectn_insurance_override ?? null;
  // TOTAL CFR/CIF satirinin etiketi icin manuel override (talep: 30.09.2026)
  // - NULL ise otomatik secilir: sigorta girilmisse "TOTAL CIF", girilmemisse
  // "TOTAL CFR" - bkz. lib/invoice-builder.ts -> hesaplaEctnGosterilenDegerler.
  const dosyaEctnCfrEtiketOverride = dosya.ectn_cfr_etiket_override ?? null;
  const [ectnFobOverride, setEctnFobOverride] = useState<number | null>(dosyaEctnFobOverride);
  const [ectnFreightOverride, setEctnFreightOverride] = useState<number | null>(dosyaEctnFreightOverride);
  const [ectnCfrOverride, setEctnCfrOverride] = useState<number | null>(dosyaEctnCfrOverride);
  const [ectnInsuranceOverride, setEctnInsuranceOverride] = useState<number | null>(dosyaEctnInsuranceOverride);
  const [ectnCfrEtiketOverride, setEctnCfrEtiketOverride] = useState<string | null>(dosyaEctnCfrEtiketOverride);
  useEffect(() => {
    setEctnFobOverride(dosyaEctnFobOverride);
    setEctnFreightOverride(dosyaEctnFreightOverride);
    setEctnCfrOverride(dosyaEctnCfrOverride);
    setEctnInsuranceOverride(dosyaEctnInsuranceOverride);
  }, [dosya.id, dosyaEctnFobOverride, dosyaEctnFreightOverride, dosyaEctnCfrOverride, dosyaEctnInsuranceOverride]);
  const [ectnModalAcik, setEctnModalAcik] = useState(false);
  // "ci-taslak" | "ci-orijinal" | "pl-taslak" ... formatinda - hangi butonun yuklendigini gosterir
  const [yukleniyor, setYukleniyor] = useState<string | null>(null);
  // Her evrak_tipi icin mevcut kayit durumu (taslak/orijinal/hic yok)
  const [durumlar, setDurumlar] = useState<Record<string, EvrakDurumu>>({});
  // ORIJINAL onaylanmis bir evragi yanlislikla tekrar taslaga cevirmeyi
  // onlemek icin: bu durumda once onay istenir.
  const [yenidenTaslakConfirm, setYenidenTaslakConfirm] = useState<"ci" | "pl" | "coo" | "phyto" | "health" | "fc" | "qc" | null>(null);

  const ciHazirlik  = checkCommercialInvoiceReadiness(dosya, rezervasyonlar, konteynerler);
  const plHazirlik  = checkPackingListReadiness(dosya, rezervasyonlar, konteynerler);
  const cooHazirlik   = checkCertificateOfOriginReadiness(dosya, rezervasyonlar, konteynerler);
  const phytoHazirlik  = checkPhytosanitaryCertificateReadiness(dosya, rezervasyonlar, konteynerler);
  const healthHazirlik = checkHealthCertificateReadiness(dosya, rezervasyonlar, konteynerler);
  const fcHazirlik    = checkFumigationReadiness(dosya, rezervasyonlar, konteynerler);
  const qcHazirlik    = checkKaliteSertifikasiReadiness(dosya, rezervasyonlar, konteynerler);

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

  // Musteri bazli kalite sertifikasi ayarlarini yukle (fumigation_ayarlari ile ayni desen)
  useEffect(() => {
    if (!dosya.alici_firma) return;
    const fetchAyar = async () => {
      if (!companyId) return;
      const { data } = await supabase
        .from("kalite_sertifikasi_ayarlari")
        .select("*")
        .eq("alici_firma", dosya.alici_firma)
        .eq("company_id", companyId)
        .maybeSingle();
      if (data) setKaliteAyar(data);
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
      .in("evrak_tipi", ["commercial_invoice", "packing_list", "certificate_of_origin", "phytosanitary", "health_certificate", "fumigation", "quality_certificate"]);

    const map: Record<string, EvrakDurumu> = {};
    (data || []).forEach((kayit: any) => {
      map[kayit.evrak_tipi] = { durum: kayit.durum, dosya_url: kayit.dosya_url, dosya_adi: kayit.dosya_adi };
    });
    setDurumlar(map);
  }, [dosya.id, companyId]);

  useEffect(() => {
    durumlariYukle();
  }, [durumlariYukle]);

  // Butona basildigi an gercek bir PDF olarak INDIRILIR (talep: 01.10.2026 -
  // "konteynerler sekmesindeki Fatura Talimatı gibi hizli indirme yapsin").
  // Dosya adi, Taslak Onay Paketi'yle (lib/taslak-onay-paketi.ts) BIREBIR
  // AYNI kuralla uretilir: "DRAFT- <no>- <KISA>- <booking>- <proforma>.pdf".
  // Sonuc (01.10.2026): "arsivlendi" = indirildi + arsiv kaydi dogrulandi;
  // "sadece_indirildi" = PDF indi ama arsiv/durum kaydi tutulamadi (kirmizi
  // uyari zaten gosterildi); "basarisiz" = PDF hic uretilemedi. Eskiden her
  // durumda yesil "indirildi" mesaji da gosteriliyordu.
  const kaydetVeAc = async (htmlHam: string, evrakTipi: string, pdfDosyaAdi: string, durum: "taslak" | "orijinal"): Promise<"arsivlendi" | "sadece_indirildi" | "basarisiz"> => {
    let pdfBlob: Blob;
    try {
      pdfBlob = await htmlToPdfBlob(htmlHam);
    } catch (err) {
      console.error("PDF olusturma hatasi:", err);
      showToast("PDF oluşturulamadı. Lütfen tekrar deneyin.", "error");
      return "basarisiz";
    }

    const indir = () => {
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfDosyaAdi;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    };

    let arsivlendi = false;
    try {
      if (!companyId) {
        showToast("Oturum bilgisi eksik: evrak arşive kaydedilmedi ama indiriliyor.", "error");
        indir();
        return "sadece_indirildi";
      }
      // Storage anahtari icin bosluk/Turkce karakter icermeyen guvenli bir
      // slug kullanilir - kullaniciya gosterilen/indirilen ad (pdfDosyaAdi)
      // degismez, sadece storage'daki dosya YOLU sadelestirilir.
      const storageAdi = turkceSadelestir(pdfDosyaAdi).replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/_+/g, "_");
      const storagePath = `${dosya.id}/${storageAdi}`;

      const { error: uploadError } = await supabase.storage
        .from("evraklar")
        .upload(storagePath, pdfBlob, { contentType: "application/pdf", upsert: true, cacheControl: "0" });

      if (uploadError) {
        console.error("Storage yukleme hatasi:", uploadError);
        showToast("Evrak arşive kaydedilemedi ama indiriliyor.", "error");
      } else {
        const dosyaUrl = await getGuvenliDosyaUrl("evraklar", storagePath);

        const { data: mevcutKayit } = await supabase
          .from("dosya_evraklari")
          .select("id")
          .eq("dosya_id", dosya.id)
          .eq("evrak_tipi", evrakTipi)
          .eq("company_id", companyId)
          .maybeSingle();

        const kayit = mevcutKayit
          ? await supabase.from("dosya_evraklari").update({
              dosya_url: dosyaUrl,
              dosya_adi: pdfDosyaAdi,
              yukleme_tarihi: new Date().toISOString(),
              durum,
            }).eq("id", mevcutKayit.id).eq("company_id", companyId).select("id")
          : await supabase.from("dosya_evraklari").insert({
              dosya_id: dosya.id,
              evrak_tipi: evrakTipi,
              dosya_url: dosyaUrl,
              dosya_adi: pdfDosyaAdi,
              yukleme_tarihi: new Date().toISOString(),
              durum,
              company_id: companyId,
            }).select("id");
        const kayitHatasi = yazmaHatasi(kayit.error, kayit.data);
        if (kayitHatasi) {
          showToast(`Evrak indiriliyor ancak arşiv/durum kaydı tutulamadı: ${kayitHatasi}`, "error");
        } else {
          arsivlendi = true;
        }
        await durumlariYukle();
      }
    } catch (err) {
      console.error("Evrak kaydetme hatasi:", err);
      showToast("Evrak arşive kaydedilemedi ama indiriliyor. Lütfen tekrar deneyin.", "error");
    }

    // Arsivleme sonucu ne olursa olsun PDF her zaman indirilir.
    indir();
    return arsivlendi ? "arsivlendi" : "sadece_indirildi";
  };

  // Draft VE Orijinal, HER ZAMAN ayni kaynaktan (dosya/rezervasyon/konteyner
  // verisinden) taze olarak uretilir - tek fark filigran eklenip eklenmemesi.
  // Boylece iki ayri, birbirinden bagimsiz ve her zaman guvenilir buton olur.
  const uretVeKaydet = async (tip: "ci" | "pl" | "coo" | "phyto" | "health" | "fc" | "qc", durum: "taslak" | "orijinal") => {
    if (yukleniyor) return; // Cift tiklama koruması
    setYukleniyor(`${tip}-${durum}`);
    try {
      const meta = EVRAK_META[tip];
      let htmlHam: string;
      if (tip === "ci") htmlHam = buildCommercialInvoiceHtml({
        ...dosya,
        ectn_basvurusu: ectnBasvurusu,
        ectn_fob_override: ectnFobOverride,
        ectn_freight_override: ectnFreightOverride,
        ectn_cfr_override: ectnCfrOverride,
        ectn_insurance_override: ectnInsuranceOverride,
        ectn_cfr_etiket_override: ectnCfrEtiketOverride,
      } as Dosya, rezervasyonlar, konteynerler);
      else if (tip === "pl") htmlHam = buildPackingListHtml(dosya, rezervasyonlar, konteynerler);
      else if (tip === "coo") htmlHam = buildCertificateOfOriginHtml(dosya, rezervasyonlar, konteynerler);
      else if (tip === "phyto") htmlHam = buildPhytosanitaryCertificateHtml(dosya, rezervasyonlar, konteynerler);
      else if (tip === "health") htmlHam = buildHealthCertificateHtml(dosya, rezervasyonlar, konteynerler);
      else if (tip === "qc") htmlHam = buildKaliteSertifikasiHtml(dosya, rezervasyonlar, konteynerler, kaliteAyar);
      else htmlHam = buildFumigationHtml(dosya, rezervasyonlar, konteynerler, fumigationAyar);

      const filigranliTurler: Array<typeof tip> = ["ci", "pl", "fc", "qc"];
      const html = durum === "taslak" && filigranliTurler.includes(tip) ? draftFiligranEkle(htmlHam) : htmlHam;
      const pdfDosyaAdi = buildEvrakPdfDosyaAdi(durum, meta.siraNo, EVRAK_KISA_KODLARI[tip], dosya, rezervasyonlar);
      const sonuc = await kaydetVeAc(html, meta.evrakTipi, pdfDosyaAdi, durum);
      if (sonuc === "arsivlendi") showToast(`${meta.evrakAdi} ${durum === "taslak" ? "taslak (filigranlı)" : "orijinal (filigransız)"} PDF olarak indirildi.`, "success");
    } catch (err) {
      console.error("Evrak olusturma hatasi:", err);
      showToast("Evrak oluşturulamadı.", "error");
    } finally {
      setYukleniyor(null);
    }
  };

  // Butona tiklandiginda cagrilir. Eger evrak zaten ORIJINAL (onaylanmis)
  // durumdaysa ve kullanici DRAFT'a basarsa, dogrudan uretmez - once acik
  // bir onay ister. Boylece muhasebe/ihracat personeli yanlislikla
  // onaylanmis bir evragi tekrar filigranli hale dondurmez (gumruk/banka
  // surecinde ciddi karisikliga yol acabilir).
  const handleEctnToggle = async (value: boolean) => {
    const onceki = ectnBasvurusu;
    setEctnBasvurusu(value); // aninda yansit - butonlar hep guncel degeri kullanir
    if (!companyId) return;
    const { data, error } = await supabase.from("ihracat_dosyalari").update({ ectn_basvurusu: value }).eq("id", dosya.id).eq("company_id", companyId).select("id");
    const hata = yazmaHatasi(error, data);
    if (hata) {
      setEctnBasvurusu(onceki); // basarisizsa geri al
      showToast(`ECTN ayarı kaydedilemedi: ${hata}`, "error");
    }
  };

  const handleTiklandi = (tip: "ci" | "pl" | "coo" | "phyto" | "health" | "fc" | "qc", durum: "taslak" | "orijinal") => {
    const meta = EVRAK_META[tip];
    const kayit = durumlar[meta.evrakTipi];
    if (durum === "taslak" && kayit?.durum === "orijinal") {
      setYenidenTaslakConfirm(tip);
    } else {
      uretVeKaydet(tip, durum);
    }
  };

  const btnClass = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-colors";
  const iconBtnClass = "inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-white/5 transition-colors";

  /** Uc evrak turu icin ortak render mantigi: hazir degilse uyari, hazirsa
   * durum rozeti + Draft + Orijinal butonlari. */
  const renderEvrakButonlari = (tip: "ci" | "pl" | "coo" | "phyto" | "health" | "fc" | "qc", hazirlik: { hazir: boolean; eksikler: string[] }, etiket: string) => {
    if (!hazirlik.hazir) {
      return (
        <InfoTooltip variant="warning" position="bottom" align="right" width="w-64" size={14}>
          <span className="font-semibold text-amber-400">{etiket} eksik bilgiler:</span> {hazirlik.eksikler.join(", ")}
        </InfoTooltip>
      );
    }
    const meta = EVRAK_META[tip];
    const kayit = durumlar[meta.evrakTipi];

    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => handleTiklandi(tip, "taslak")}
          disabled={yukleniyor !== null}
          title={kayit?.durum === "orijinal" ? "Dikkat: Onaylanmış orijinali tekrar taslağa (filigranlı) çevirir" : "Filigranlı taslağı PDF olarak indirir"}
          className={btnClass + " disabled:opacity-60 disabled:cursor-not-allowed"}
        >
          {yukleniyor === `${tip}-taslak` ? (
            <><Loader2 size={12} className="animate-spin" /> Hazırlanıyor...</>
          ) : (
            <><FileText size={12} /> Draft</>
          )}
        </button>
        <button
          onClick={() => handleTiklandi(tip, "orijinal")}
          disabled={yukleniyor !== null}
          title="Filigransız orijinal evrağı PDF olarak indirir"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 hover:border-sky-500/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {yukleniyor === `${tip}-orijinal` ? (
            <><Loader2 size={12} className="animate-spin" /> Hazırlanıyor...</>
          ) : (
            <><CheckCircle2 size={12} /> Orijinal</>
          )}
        </button>
      </div>
    );
  };

  /** ECTN basvurusu isaretleme kutusu - sadece Commercial Invoice'in yaninda
   * gosterilir (talep: 28.09.2026). Isaretliyken yaninda cikan kalem ikonu,
   * ECTN satirlarinin degerlerini elle duzeltme modalini acar. */
  const ectnCheckbox = (
    <div className="inline-flex items-center gap-1">
      <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer select-none" style={{ color: "#94a3b8" }} title="İşaretlenirse Commercial Invoice'a TOTAL FOB / FREIGHT / TOTAL CFR satırları eklenir">
        <input type="checkbox" checked={ectnBasvurusu} onChange={(e) => handleEctnToggle(e.target.checked)} className="w-3.5 h-3.5" />
        ECTN başvurusu yapılacak
      </label>
      {ectnBasvurusu && (
        <button
          type="button"
          onClick={() => setEctnModalAcik(true)}
          className="inline-flex items-center justify-center w-5 h-5 rounded text-slate-400 hover:text-emerald-400 hover:bg-white/5 transition-colors"
          title="ECTN tutarlarını (TOTAL FOB / FREIGHT / TOTAL CFR) elle düzenle"
        >
          <Pencil size={11} />
        </button>
      )}
    </div>
  );

  return (
    <>
      {show === "both" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium w-[132px] shrink-0" style={{ color: "#94a3b8" }}>Commercial Invoice</span>
            {renderEvrakButonlari("ci", ciHazirlik, "Commercial Invoice")}
            {ectnCheckbox}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium w-[132px] shrink-0" style={{ color: "#94a3b8" }}>Packing List</span>
            {renderEvrakButonlari("pl", plHazirlik, "Packing List")}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium w-[132px] shrink-0" style={{ color: "#94a3b8" }}>Certificate of Origin</span>
            {renderEvrakButonlari("coo", cooHazirlik, "Certificate of Origin")}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium w-[132px] shrink-0" style={{ color: "#94a3b8" }}>Phytosanitary Cert.</span>
            {renderEvrakButonlari("phyto", phytoHazirlik, "Phytosanitary Certificate")}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium w-[132px] shrink-0" style={{ color: "#94a3b8" }}>Health Cert.</span>
            {renderEvrakButonlari("health", healthHazirlik, "Health Certificate")}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium w-[132px] shrink-0" style={{ color: "#94a3b8" }}>Quality Cert.</span>
            <div className="flex items-center gap-1.5">
              {renderEvrakButonlari("qc", qcHazirlik, "Quality Cert.")}
              <button onClick={() => setKaliteAyarModalAcik(true)} className={iconBtnClass} title="Kalite sertifikası ayarlarını düzenle">
                <Pencil size={13} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium w-[132px] shrink-0" style={{ color: "#94a3b8" }}>Fumigation Cert.</span>
            <div className="flex items-center gap-1.5">
              {renderEvrakButonlari("fc", fcHazirlik, "Fumigation Cert.")}
              <button onClick={() => setAyarModalAcik(true)} className={iconBtnClass} title="Fumigasyon ayarlarını düzenle">
                <Pencil size={13} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          {show === "ci" && (<>{renderEvrakButonlari("ci", ciHazirlik, "Commercial Invoice")}{ectnCheckbox}</>)}
          {show === "pl" && renderEvrakButonlari("pl", plHazirlik, "Packing List")}
          {show === "coo" && renderEvrakButonlari("coo", cooHazirlik, "Certificate of Origin")}
          {show === "phyto" && renderEvrakButonlari("phyto", phytoHazirlik, "Phytosanitary Certificate")}
          {show === "health" && renderEvrakButonlari("health", healthHazirlik, "Health Certificate")}
          {show === "qc" && (
            <div className="flex items-center gap-1.5">
              {renderEvrakButonlari("qc", qcHazirlik, "Quality Cert.")}
              <button onClick={() => setKaliteAyarModalAcik(true)} className={iconBtnClass} title="Kalite sertifikası ayarlarını düzenle">
                <Pencil size={13} />
              </button>
            </div>
          )}
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

      {show === "both" && Object.keys(durumlar).length === 0 && (ciHazirlik.hazir || plHazirlik.hazir || cooHazirlik.hazir || phytoHazirlik.hazir || healthHazirlik.hazir || fcHazirlik.hazir || qcHazirlik.hazir) && (
        <p className="text-[11px] mt-1.5" style={{ color: "#94a3b8" }}>
          İşlem sırası: önce <strong>Draft</strong> ile filigranlı taslağı hazırlayın → müşteriye onaya gönderin → onay gelince <strong>Orijinal</strong> butonuna basın.
        </p>
      )}

      {dosya.alici_firma && (
        <FumigationAyarModal
          aliciFirma={dosya.alici_firma}
          open={ayarModalAcik}
          onClose={() => setAyarModalAcik(false)}
          onSaved={(ayar) => setFumigationAyar(ayar)}
        />
      )}

      {dosya.alici_firma && (
        <KaliteSertifikasiAyarModal
          aliciFirma={dosya.alici_firma}
          open={kaliteAyarModalAcik}
          onClose={() => setKaliteAyarModalAcik(false)}
          onSaved={(ayar) => setKaliteAyar(ayar)}
        />
      )}

      <EctnDegerleriModal
        dosya={{
          ...dosya,
          ectn_fob_override: ectnFobOverride,
          ectn_freight_override: ectnFreightOverride,
          ectn_cfr_override: ectnCfrOverride,
          ectn_insurance_override: ectnInsuranceOverride,
          ectn_cfr_etiket_override: ectnCfrEtiketOverride,
        } as Dosya}
        rezervasyonlar={rezervasyonlar}
        open={ectnModalAcik}
        onClose={() => setEctnModalAcik(false)}
        onSaved={(payload: EctnOverrideDegerleri) => {
          setEctnFobOverride(payload.ectn_fob_override);
          setEctnFreightOverride(payload.ectn_freight_override);
          setEctnCfrOverride(payload.ectn_cfr_override);
          setEctnInsuranceOverride(payload.ectn_insurance_override);
          setEctnCfrEtiketOverride(payload.ectn_cfr_etiket_override);
        }}
      />

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
          if (tip) uretVeKaydet(tip, "taslak");
        }}
        destructive
      />
    </>
  );
}