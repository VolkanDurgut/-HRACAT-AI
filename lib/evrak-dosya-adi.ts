/**
 * lib/evrak-dosya-adi.ts
 *
 * "Draft"/"Orijinal" butonlarina basildiginda indirilen PDF'lerin dosya adi
 * kuralini tek yerden uretir (talep: 01.10.2026 - "dosya isimleri Taslak
 * Onay Paketi'nde ayarladigimiz gibi birebir ayni olmali").
 *
 * Kural, lib/taslak-onay-paketi.ts'teki ZIP paketinin isimlendirmesiyle
 * BIREBIR AYNIDIR:
 *   "<DURUM_ONEKI>- <siraNo>- <KISA_KOD>- <bookingNo>- <proformaNo>.pdf"
 * Ornek: "DRAFT- 1- INVOICE- BOOKING123- PRO456.pdf"
 *        "ORIJINAL- 7- QUALITY- BOOKING123- PRO456.pdf"
 */

/** Dosya adina girecek bir parcayi guvenli hale getirir (path'i bozacak
 * karakterleri temizler) - lib/taslak-onay-paketi.ts -> guvenliParca ile
 * ayni mantik. */
function guvenliParca(ham: string | null | undefined, yedek: string): string {
  // Iki proforma "A / B" bicimindeyse (lib/coklu-no.ts) dosya adinda "A-B" olur
  return (ham || yedek).trim().replace(/\s*\/\s*/g, "-").replace(/[\/\\:*?"<>|]/g, "");
}

/** Her evrak turu icin Taslak Onay Paketi'nde kullanilan kisa kod. */
export const EVRAK_KISA_KODLARI = {
  ci: "INVOICE",
  pl: "PACKING",
  coo: "COO",
  phyto: "PHYTO",
  health: "HEALTH",
  qc: "QUALITY",
  fc: "FUMIGATION",
} as const;

export function buildEvrakPdfDosyaAdi(
  durum: "taslak" | "orijinal",
  siraNo: number,
  kisaKod: string,
  dosya: { proforma_no: string | null },
  rezervasyonlar: { booking_no: string | null }[]
): string {
  const durumOneki = durum === "taslak" ? "DRAFT" : "ORIJINAL";
  const bookingNo = guvenliParca(rezervasyonlar[0]?.booking_no, "BOOKING");
  const proformaNo = guvenliParca(dosya.proforma_no, "PROFORMA");
  return `${durumOneki}- ${siraNo}- ${kisaKod}- ${bookingNo}- ${proformaNo}.pdf`;
}
