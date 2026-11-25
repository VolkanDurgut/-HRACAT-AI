import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { ROBOTO_TR_BASE64 } from "@/lib/fonts/roboto-tr-base64";
import { vgmPdfCiz, vgmPdfDosyaAdi, type VgmPdfVerisi } from "@/supabase/functions/_shared/vgm-pdf";
import { UNEX_LOGO_VGM_BASE64, UNEX_LOGO_VGM_BOY, UNEX_LOGO_VGM_EN } from "@/supabase/functions/_shared/unex-logo-vgm-base64";

/** Dosya + rezervasyon + konteynerlerden VGM PDF verisi (uygulama ve mail ayni icerik). */
export function vgmPdfVerisi(dosya: Dosya, rezervasyonlar: Rezervasyon[], konteynerler: Konteyner[], olusturma: string): VgmPdfVerisi {
  const rez = rezervasyonlar[0];
  return {
    dosyaNo: dosya.dosya_no,
    bookingNo: rez?.booking_no || null,
    gemi: rez?.gemi_adi || null,
    yuklemeLimani: rez?.yuklenme_limani || dosya.yuklenme_limani || null,
    varisLimani: dosya.varis_limani || null,
    konteynerler: konteynerler.map((k) => ({ no: k.konteyner_no, vgm: k.vgm_kg, tare: k.tare_kg })),
    olusturma,
  };
}

/**
 * VGM raporunu (Container / Weight / Tare / VGM / Method tablosu) gercek bir PDF
 * dosyasi olarak uretir ve tarayicida indirir. Cizim: supabase/functions/_shared/vgm-pdf.ts
 * (10.11.2026'dan beri vgm-rapor maili de ayni cizimi ekler).
 */
export function indirVgmPdf(dosya: Dosya, rezervasyonlar: Rezervasyon[], konteynerler: Konteyner[]): void {
  // Yatay (landscape) - 5 kolonlu SOLAS VGM formatinin rahat sigmasi icin
  const doc = new jsPDF({ orientation: "landscape" });
  vgmPdfCiz(doc, autoTable, ROBOTO_TR_BASE64, vgmPdfVerisi(dosya, rezervasyonlar, konteynerler, new Date().toLocaleString("tr-TR")),
    { base64: UNEX_LOGO_VGM_BASE64, en: UNEX_LOGO_VGM_EN, boy: UNEX_LOGO_VGM_BOY });
  doc.save(vgmPdfDosyaAdi(dosya.dosya_no));
}
