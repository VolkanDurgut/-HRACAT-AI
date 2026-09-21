import { Dosya, Rezervasyon } from "@/lib/supabase";

/**
 * Draft Onay Gönderim akışında CC'ye eklenecek sabit iç ekip adresleri.
 * Tüm dosyalarda aynı - degistirilmesi gerekirse SADECE burasi guncellenir.
 */
export const DRAFT_ONAY_CC_LISTESI = [
  "bbt@unex.com.tr",
  "operation@unex.com.tr",
  "export@unex.com.tr",
];

function proformaNoAl(dosya: Dosya): string {
  return dosya.proforma_no?.trim() || "-";
}

function bookingNoAl(rezervasyonlar: Rezervasyon[]): string {
  return rezervasyonlar[0]?.booking_no?.trim() || "-";
}

/**
 * Mail konusu. Sabit kisim ile proforma/booking no birlestirilir.
 * Ornek: "UNEX // DRAFT APPROVAL OF LOADING DOCUMENTS // UNEXCME131125R// ISB1870849"
 */
export function buildDraftOnayKonu(dosya: Dosya, rezervasyonlar: Rezervasyon[]): string {
  const proformaNo = proformaNoAl(dosya);
  const bookingNo = bookingNoAl(rezervasyonlar);
  return `UNEX // DRAFT APPROVAL OF LOADING DOCUMENTS // ${proformaNo}// ${bookingNo}`;
}

/**
 * Mail govde metni. Sabit ingilizce sablon, sadece Booking/Proforma No
 * dosyadan/rezervasyondan cekilir.
 */
export function buildDraftOnayMetni(dosya: Dosya, rezervasyonlar: Rezervasyon[]): string {
  const proformaNo = proformaNoAl(dosya);
  const bookingNo = bookingNoAl(rezervasyonlar);
  return (
    `Dear Valuable Partners,\n\n` +
    `• Booking Number: ${bookingNo}\n` +
    `• Proforma Number: ${proformaNo}\n\n` +
    `- Please find draft shipment documents as attachment , kindly waiting your approval or amendment request within 48 hours in order to prepare the originals.`
  );
}

/**
 * Musterinin dosyada kayitli e-posta adresini dondurur (ham_veri.alici_email).
 * Diger mail ozelliklerinde (taraflar-card, taslak-evrak-mail-section) de
 * ayni kaynak kullanilir.
 */
export function draftOnayAliciEmailAl(dosya: Dosya): string {
  return ((dosya.ham_veri as any)?.alici_email as string) || "";
}

/**
 * TO = musterinin dosyada kayitli e-postasi, CC = sabit ic ekip listesi,
 * Konu ve govde otomatik dolu bir mailto: linki uretir. Dosya eki tarayici
 * guvenligi nedeniyle otomatik eklenemez - kullanici "Paketi Indir" ile
 * indirdigi ZIP'i, acilan mail taslagina surukle-birakla ekler.
 */
export function buildDraftOnayMailtoUrl(dosya: Dosya, rezervasyonlar: Rezervasyon[]): string {
  const alici = draftOnayAliciEmailAl(dosya);
  const konu = buildDraftOnayKonu(dosya, rezervasyonlar);
  const metin = buildDraftOnayMetni(dosya, rezervasyonlar);
  const cc = DRAFT_ONAY_CC_LISTESI.join(",");
  return `mailto:${encodeURIComponent(alici)}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(konu)}&body=${encodeURIComponent(metin)}`;
}
