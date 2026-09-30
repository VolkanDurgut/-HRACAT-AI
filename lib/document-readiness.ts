import { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";

export type ReadinessResult = {
  hazir: boolean;
  eksikler: string[];
};

/**
 * Commercial Invoice icin gerekli tum alanlarin dolu olup olmadigini kontrol eder.
 * Eksik alan varsa Turkce, okunabilir isimleriyle listeler.
 */
export function checkCommercialInvoiceReadiness(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[]
): ReadinessResult {
  const eksikler: string[] = [];

  if (!dosya.fatura_no) eksikler.push("Fatura No");
  if (!dosya.fatura_tarihi) eksikler.push("Fatura Tarihi");
  if (!dosya.alici_firma) eksikler.push("Alıcı Firma");
  if (!dosya.alici_adresi) eksikler.push("Alıcı Adresi");
  if (!dosya.consignee) eksikler.push("Consignee (konşimento talimatı eklenmemiş)");
  if (!dosya.hesap_adi) eksikler.push("Hesap Adı");
  if (!dosya.banka) eksikler.push("Banka");
  if (!dosya.swift) eksikler.push("SWIFT Kodu");
  if (!dosya.iban) eksikler.push("IBAN");

  const urunler = dosya.urun_detaylari || [];
  if (urunler.length === 0) eksikler.push("Ürün Detayları");

  return { hazir: eksikler.length === 0, eksikler };
}

/**
 * Packing List icin gerekli tum alanlarin dolu olup olmadigini kontrol eder.
 * Her konteynerin Net/Brut/Pieces alanlari ayri ayri kontrol edilir.
 */
export function checkPackingListReadiness(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[]
): ReadinessResult {
  const eksikler: string[] = [];

  if (!dosya.fatura_no) eksikler.push("Fatura No");
  if (!dosya.fatura_tarihi) eksikler.push("Fatura Tarihi");
  if (!dosya.consignee) eksikler.push("Consignee (konşimento talimatı eklenmemiş)");

  const rez = rezervasyonlar[0];
  if (!rez?.gemi_adi) eksikler.push("Gemi Adı");
  if (!rez?.sefer_no) eksikler.push("Sefer No");

  if (konteynerler.length === 0) {
    eksikler.push("Konteyner Bilgileri");
  } else {
    const eksikNet    = konteynerler.some((k) => !k.net_agirlik_kg);
    const eksikBrut   = konteynerler.some((k) => !k.brut_agirlik_kg);
    const eksikPieces = konteynerler.some((k) => !k.pieces);
    if (eksikNet)    eksikler.push("Net Ağırlık (bir veya daha fazla konteynerde eksik)");
    if (eksikBrut)   eksikler.push("Brüt Ağırlık (bir veya daha fazla konteynerde eksik)");
    if (eksikPieces) eksikler.push("Kap Adedi (bir veya daha fazla konteynerde eksik)");
  }

  return { hazir: eksikler.length === 0, eksikler };
}

/**
 * Certificate of Origin (Menşe Şahadetnamesi) icin gerekli tum alanlarin
 * dolu olup olmadigini kontrol eder.
 */
export function checkCertificateOfOriginReadiness(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[]
): ReadinessResult {
  const eksikler: string[] = [];

  if (!dosya.consignee) eksikler.push("Consignee (konşimento talimatı eklenmemiş)");
  if (!dosya.urun_tanimi) eksikler.push("Ürün Tanımı");
  if (!dosya.detayli_ambalaj && !dosya.ambalaj) eksikler.push("Ambalaj");
  if (!dosya.lot_no) eksikler.push("Lot No");

  const rez = rezervasyonlar[0];
  if (!rez?.booking_no) eksikler.push("Booking No (Rezervasyon No)");

  if (konteynerler.length === 0) {
    eksikler.push("Konteyner Bilgileri");
  } else {
    const eksikNet  = konteynerler.some((k) => !k.net_agirlik_kg);
    const eksikBrut = konteynerler.some((k) => !(k as any).brut_agirlik_kg);
    if (eksikNet)  eksikler.push("Net Ağırlık (bir veya daha fazla konteynerde eksik)");
    if (eksikBrut) eksikler.push("Brüt Ağırlık (bir veya daha fazla konteynerde eksik)");
  }

  return { hazir: eksikler.length === 0, eksikler };
}

/**
 * Phytosanitary Certificate (Bitki Sağlığı Sertifikası) icin gerekli tum
 * alanlarin dolu olup olmadigini kontrol eder.
 */
export function checkPhytosanitaryCertificateReadiness(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[]
): ReadinessResult {
  const eksikler: string[] = [];

  if (!dosya.consignee) eksikler.push("Consignee (konşimento talimatı eklenmemiş)");
  if (!dosya.urun_tanimi) eksikler.push("Ürün Tanımı");
  if (!dosya.detayli_ambalaj && !dosya.ambalaj) eksikler.push("Ambalaj");
  if (!dosya.lot_no) eksikler.push("Lot No");
  if (!dosya.yuklenme_limani && !rezervasyonlar[0]?.yuklenme_limani) eksikler.push("Yükleme Limanı");

  const rez = rezervasyonlar[0];
  if (!rez?.booking_no) eksikler.push("Booking No (Rezervasyon No)");
  if (!rez?.gemi_adi) eksikler.push("Gemi Adı");
  if (!rez?.sefer_no) eksikler.push("Sefer No");

  if (konteynerler.length === 0) {
    eksikler.push("Konteyner Bilgileri");
  } else {
    const eksikNet  = konteynerler.some((k) => !k.net_agirlik_kg);
    const eksikBrut = konteynerler.some((k) => !(k as any).brut_agirlik_kg);
    if (eksikNet)  eksikler.push("Net Ağırlık (bir veya daha fazla konteynerde eksik)");
    if (eksikBrut) eksikler.push("Brüt Ağırlık (bir veya daha fazla konteynerde eksik)");
  }

  return { hazir: eksikler.length === 0, eksikler };
}

/**
 * Health Certificate (Sağlık Sertifikası) icin gerekli tum alanlarin dolu
 * olup olmadigini kontrol eder.
 */
export function checkHealthCertificateReadiness(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[]
): ReadinessResult {
  const eksikler: string[] = [];

  if (!dosya.consignee) eksikler.push("Consignee (konşimento talimatı eklenmemiş)");
  if (!dosya.lot_no) eksikler.push("Lot No");
  if (!dosya.son_kullanim_tarihi) eksikler.push("Son Kullanım Tarihi");
  if (!dosya.ambalaj) eksikler.push("Ambalaj");
  if (!dosya.yuklenme_limani && !rezervasyonlar[0]?.yuklenme_limani) eksikler.push("Yükleme Limanı");

  if (konteynerler.length === 0) {
    eksikler.push("Konteyner Bilgileri");
  } else {
    const eksikNet = konteynerler.some((k) => !k.net_agirlik_kg);
    if (eksikNet) eksikler.push("Net Ağırlık (bir veya daha fazla konteynerde eksik)");
  }

  return { hazir: eksikler.length === 0, eksikler };
}

/**
 * Fumigation Certificate icin gerekli tum alanlarin dolu olup olmadigini kontrol eder.
 * Konteyner Net/Brut agirlik alanlari ayri ayri kontrol edilir.
 * Not: Fumigasyon detaylari (fumigant, doz, tarihler vb.) ham_veri uzerinden gelir
 * ve isteğe bagli kabul edilir — varsayilan degerler builder tarafindan kullanilir.
 */
export function checkFumigationReadiness(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[]
): ReadinessResult {
  const eksikler: string[] = [];

  if (!dosya.proforma_no)    eksikler.push("Proforma No (Rapor No)");
  if (!dosya.fatura_tarihi)  eksikler.push("Fatura Tarihi");
  if (!dosya.consignee)      eksikler.push("Consignee");
  if (!dosya.yuklenme_limani && !rezervasyonlar[0]?.yuklenme_limani) eksikler.push("Yükleme Limanı");
  if (!dosya.varis_limani)   eksikler.push("Varış Limanı");
  if (!dosya.urun_tanimi)    eksikler.push("Ürün Tanımı");

  const rez = rezervasyonlar[0];
  if (!rez?.gemi_adi)  eksikler.push("Gemi Adı");
  if (!rez?.sefer_no)  eksikler.push("Sefer No");

  if (konteynerler.length === 0) {
    eksikler.push("Konteyner Bilgileri");
  } else {
    const eksikNet  = konteynerler.some((k) => !k.net_agirlik_kg);
    const eksikBrut = konteynerler.some((k) => !k.brut_agirlik_kg);
    if (eksikNet)  eksikler.push("Net Ağırlık (bir veya daha fazla konteynerde eksik)");
    if (eksikBrut) eksikler.push("Brüt Ağırlık (bir veya daha fazla konteynerde eksik)");
  }

  return { hazir: eksikler.length === 0, eksikler };
}
/**
 * Quality / Condition Certificate icin gerekli tum alanlarin dolu olup
 * olmadigini kontrol eder.
 * Not: PARAMETER/SPECIFICATION/RESULTS/METHODS tablosu (musteri bazli
 * kalite_sertifikasi_ayarlari) isteğe bagli kabul edilir - kayit yoksa
 * builder ornek belgedeki varsayilan degerleri kullanir (bkz.
 * lib/kalite-sertifikasi-builder.ts -> VARSAYILAN_KALITE_PARAMETRELERI).
 */
export function checkKaliteSertifikasiReadiness(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[]
): ReadinessResult {
  const eksikler: string[] = [];

  if (!dosya.fatura_tarihi)     eksikler.push("Fatura Tarihi");
  if (!dosya.consignee)         eksikler.push("Consignee");
  if (!dosya.urun_tanimi)       eksikler.push("Ürün Tanımı");
  if (!dosya.bl_no)             eksikler.push("B/L No");
  if (!dosya.yuklenme_limani && !rezervasyonlar[0]?.yuklenme_limani) eksikler.push("Yükleme Limanı");
  if (!dosya.varis_limani)      eksikler.push("Varış Limanı");
  if (!dosya.uretim_tarihi)     eksikler.push("Üretim Tarihi");
  if (!dosya.son_kullanim_tarihi) eksikler.push("Son Kullanım Tarihi");

  const rez = rezervasyonlar[0];
  if (!rez?.gemi_adi) eksikler.push("Gemi Adı");
  if (!rez?.sefer_no) eksikler.push("Sefer No");

  if (konteynerler.length === 0) {
    eksikler.push("Konteyner Bilgileri");
  } else {
    const eksikBrut = konteynerler.some((k) => !k.brut_agirlik_kg);
    if (eksikBrut) eksikler.push("Brüt Ağırlık (bir veya daha fazla konteynerde eksik)");
  }

  return { hazir: eksikler.length === 0, eksikler };
}
