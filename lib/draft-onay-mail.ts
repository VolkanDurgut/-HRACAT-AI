import { Dosya, Rezervasyon } from "@/lib/supabase";
import { formatCutoffTarih, formatCutoffSaat } from "@/lib/cutoff-utils";

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
    `- Please find draft shipment documents as attachment , kindly waiting your approval or amendment request within 48 hours in order to prepare the originals. Unless we receive any feedback within 48 hours, it will be deemed approved.`
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
 * Cut-off yaklasirken musteriye gonderilen DRAFT ONAY HATIRLATMA maili
 * (talep: 01.10.2026). Ayni alici (ham_veri.alici_email) ve ayni CC listesi;
 * konu, orijinal draft mailinin konusuna "REMINDER" eklenmis halidir ki
 * musterinin mail istemcisinde ayni konuya yakin dursun. Cut-off saatleri
 * Turkiye saatiyle (GMT+3) ham okunarak yazilir (bkz. lib/cutoff-utils.ts).
 */
export type DraftHatirlatmaBilgisi = {
  proformaNo: string | null;
  bookingNo: string | null;
  aliciEmail: string | null;
  talimatCutoff: string | null;
  beyannameCutoff: string | null;
  /** 48 saatlik yanit suresinin bittigi an (lib/draft-onay-sure.ts). Verilirse
   *  mail bu sureyi ve "deemed approved" kuralini hatirlatir. */
  yanitSonuMs?: number | null;
};

function cutoffMetni(deger: string | null): string | null {
  if (!deger) return null;
  const tarih = formatCutoffTarih(deger);
  const saat = formatCutoffSaat(deger);
  return saat === "-" ? tarih : `${tarih} ${saat} (Turkey time, GMT+3)`;
}

export function buildDraftHatirlatmaKonu(b: DraftHatirlatmaBilgisi): string {
  const proforma = b.proformaNo?.trim() || "-";
  const booking = b.bookingNo?.trim() || "-";
  // 48 saat hatirlatmasi (talep: 01.10.2026): konu, musteriye giden ilk draft
  // mailinin konusunun (buildDraftOnayKonu) birebir "RE:" li halidir. mailto
  // var olan bir maili YANITLAYAMAZ, hep yeni ileti acar; ama Outlook / Gmail
  // gibi istemciler konusu ayni (RE: haric) iletileri ayni konusmada gruplar.
  if (b.yanitSonuMs) return `RE: UNEX // DRAFT APPROVAL OF LOADING DOCUMENTS // ${proforma}// ${booking}`;
  return `UNEX // REMINDER: DRAFT APPROVAL OF LOADING DOCUMENTS // ${proforma}// ${booking}`;
}

/**
 * 48 saatlik onay suresinden kalan saat, mail metni icin (en yakin tam saat,
 * en az 1). Uygulama geneli bildirim son 10 saatte geldigi icin bildirimden
 * hemen sonra basilirsa metin "10 hours" der; daha erken basilirsa gercek
 * kalan sureyi yazar - musteriye asla yanlis bir sure soylenmez.
 */
function kalanSaatMetni(yanitSonuMs: number, simdi: number): { sayi: number; birim: string } {
  const sayi = Math.max(1, Math.round((yanitSonuMs - simdi) / (60 * 60 * 1000)));
  return { sayi, birim: sayi === 1 ? "hour" : "hours" };
}

export function buildDraftHatirlatmaMetni(b: DraftHatirlatmaBilgisi, simdi: number = Date.now()): string {
  const satirlar = [
    `• Booking Number: ${b.bookingNo?.trim() || "-"}`,
    `• Proforma Number: ${b.proformaNo?.trim() || "-"}`,
  ];
  const talimat = cutoffMetni(b.talimatCutoff);
  const beyan = cutoffMetni(b.beyannameCutoff);
  if (talimat) satirlar.push(`• Shipping Instruction Cut-off: ${talimat}`);
  if (beyan) satirlar.push(`• Customs Declaration Cut-off: ${beyan}`);
  if (b.yanitSonuMs) {
    // Kullanicinin verdigi metin (talep: 01.10.2026), kalan sure dinamik.
    // Sondaki bos satirlar: mailto ile acilan iletiye Outlook varsayilan
    // imzayi EKLEMEZ (mailto'da imza parametresi yok); kullanici imzayi
    // Ileti > Imza ile buraya ekler.
    const { sayi, birim } = kalanSaatMetni(b.yanitSonuMs, simdi);
    const kalanFiil = sayi === 1 ? "remains" : "remain";
    return (
      `Dear Valued Partners,\n\n` +
      `This is a kind reminder regarding the draft shipment documents we sent for your approval.\n\n` +
      `Please note that ${sayi} ${birim} ${kalanFiil} until the 48-hour approval period expires. Kindly send us your approval or any amendment requests within this period.\n\n` +
      `If we do not receive any feedback within the remaining ${sayi} ${birim}, the documents will be deemed approved, and the originals will be prepared accordingly.\n\n` +
      `Thank you for your prompt attention.\n\n`
    );
  }
  return (
    `Dear Valuable Partners,\n\n` +
    `This is a kind reminder regarding the draft shipment documents we have sent for your approval.\n\n` +
    satirlar.join("\n") +
    `\n\n- As the cut-off is approaching, kindly send us your approval or amendment request at your earliest convenience so that we can prepare the original documents on time and avoid any delay in the shipment.`
  );
}

export function buildDraftHatirlatmaMailtoUrl(b: DraftHatirlatmaBilgisi): string {
  const cc = DRAFT_ONAY_CC_LISTESI.join(",");
  return `mailto:${encodeURIComponent(b.aliciEmail || "")}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(buildDraftHatirlatmaKonu(b))}&body=${encodeURIComponent(buildDraftHatirlatmaMetni(b))}`;
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