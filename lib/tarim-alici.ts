/**
 * lib/tarim-alici.ts
 *
 * Tarim il mudurlugu evraklari (4 Certificate of Origin, 5 Phytosanitary,
 * 6 Health Certificate) icin ALICI metni (28.10.2026, kullanici: "4-5-6
 * numarali tarim il evraklarinda TO ORDER kullanmamaliyiz. Onun yerine NOTIFY
 * bilgisi kullanmaliyiz").
 *
 * Kural (veriyi DEGISTIRMEZ, yalniz bu uc belgede gosterim):
 *  - dosya.consignee "TO ORDER" turundeyse ("To Order", "TO THE ORDER OF ..."
 *    dahil) yerine NOTIFY yazilir: ham_veri.notify dizisinin ILK dolu kaydi
 *    (birinci notify = gercek alici; ikinci kayit genelde acente / "also
 *    notify" olur - ornek IHR-2026-0091). "SAME AS CONSIGNEE" gibi kayitlar
 *    atlanir.
 *  - Notify yoksa: alici_firma + alici_adresi (fumigation / kalite belgesinin
 *    eski dosya yedegiyle ayni kaynak).
 *  - O da yoksa null -> belgede "-" ve hazirlik kontrolu "Notify" eksigi verir;
 *    "TO ORDER" HICBIR durumda bu uc belgeye yazilmaz.
 *  - Consignee gercek bir firma ise AYNEN kullanilir (onceki davranis).
 * Packing List / Commercial Invoice / Draft BL / Fumigation / Quality bu
 * kuraldan etkilenmez (konsimentodaki consignee orada dogru bilgidir).
 */

import type { Dosya } from "@/lib/supabase";

const TO_ORDER = /^\s*TO\s+(?:THE\s+)?ORDER\b/i;
const AYNI_KONSINYE = /^\s*(?:SAME\s+AS\s+CONSIGNEE|AS\s+PER\s+CONSIGNEE|N\/?A|-+)\s*\.?\s*$/i;

export function consigneeToOrderMu(consignee: string | null | undefined): boolean {
  return !!consignee && TO_ORDER.test(consignee);
}

function ilkNotify(hamVeri: unknown): string | null {
  const dizi = (hamVeri as { notify?: unknown } | null | undefined)?.notify;
  if (!Array.isArray(dizi)) return null;
  for (const n of dizi) {
    const metin = typeof n === "string" ? n.trim() : "";
    if (metin && !AYNI_KONSINYE.test(metin) && !TO_ORDER.test(metin)) return metin;
  }
  return null;
}

/**
 * 24.11.2026 (kullanici: "Mense belgesinde telefon mail bilgileri genel olarak yer almamali. 4-5-6 numarali
 * evraklar icin. Cunku sigmiyor."): alici metninden telefon / faks / WhatsApp numaralari ve e-posta adresleri
 * (etiketleriyle) cikarilir; firma adi, adres, vergi no (TIN/NIF/VAT) kalir. Veri DEGISMEZ, yalniz gosterim.
 */
const ETIKET_TEL = String.raw`(?:TEL(?:EFONO|EPHONE|EFON)?(?:\s*(?:OFFICE|NO|NR))?|PHONE(?:\s*(?:NUMBER|NO))?|MOBILE|MOB|GSM|CELL?(?:ULAR)?|WHATSAPP|FAX|T|NUMBER)`;
const TEL_DEGERI = String.raw`[+*(]?\d[\d \t().\/+*-]{5,}\d`;
const rakamSayisi = (t: string) => (t.match(/\d/g) || []).length;

export function iletisimBilgisiniCikar(metin: string): string {
  let s = metin.replace(/\r/g, "");
  // 1) e-posta adresleri
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, " ");
  // 2) etiketli telefon / faks (deger en az 7 rakam)
  s = s.replace(new RegExp(String.raw`\b${ETIKET_TEL}[ \t]*[.:]?[ \t]*(${TEL_DEGERI})`, "gi"), (tam, deger: string) => (rakamSayisi(deger) >= 7 ? " " : tam));
  // 3) etiketsiz uluslararasi numaralar (+ / * / 00 ile baslayan, en az 7 rakam)
  s = s.replace(new RegExp(String.raw`(^|[ \t,;\/])((?:\+|\*|00)[ \t]?\d[\d \t().\/-]{5,}\d)`, "gm"), (tam, on: string, deger: string) => (rakamSayisi(deger) >= 7 ? on + " " : tam));
  // 4) degeri kalmayan etiketler ("EMAIL:", "TEL:", "WHATSAPP:")
  s = s.replace(/\bE[- ]?MAILS?(?:[ \t]*ID)?[ \t]*[:.]?/gi, " ");
  // irtibat kisisi ("CONTACTO: <ad>") de iletisim bilgisidir
  s = s.replace(/\bCONTACT(?:O|S)?(?:[ \t]*PERSON)?[ \t]*:[^\n,]*/gi, " ");
  s = s.replace(new RegExp(String.raw`\b(?:TEL(?:EFONO|EPHONE)?(?:[ \t]*(?:OFFICE|NO))?|PHONE(?:[ \t]*NUMBER)?|MOBILE|GSM|WHATSAPP|FAX)[ \t]*[.:][ \t]*(?=$|[,;\/ \t]*(?:$|[,;\/]))`, "gim"), " ");
  // 5) satir temizligi: kalan ayiraclar, cift bosluk, bos satir
  const ilk = metin.replace(/\r/g, "").split("\n");
  return s
    .split("\n")
    .map((satir, i) => (satir === ilk[i] ? satir.trim() : satir
      .replace(/(?:\s*[,;\/]\s*){2,}/g, ", ")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s,;\/:-]+|[\s,;\/:-]+$/g, "")
      .trim()))
    .filter((satir) => satir.length > 0)
    .join("\n");
}

/** 4-5-6 numarali evraklarda alici kutusuna yazilacak metin (yoksa null). Telefon / e-posta cikarilmis. */
export function tarimBelgesiAlicisi(dosya: Pick<Dosya, "consignee" | "ham_veri" | "alici_firma" | "alici_adresi">): string | null {
  const ham = tarimBelgesiAlicisiHam(dosya);
  if (!ham) return null;
  return iletisimBilgisiniCikar(ham) || ham;
}

function tarimBelgesiAlicisiHam(dosya: Pick<Dosya, "consignee" | "ham_veri" | "alici_firma" | "alici_adresi">): string | null {
  const consignee = (dosya.consignee ?? "").trim();
  if (consignee && !consigneeToOrderMu(consignee)) return consignee;
  const notify = ilkNotify(dosya.ham_veri);
  if (notify) return notify;
  const firma = (dosya.alici_firma ?? "").trim();
  if (firma && !consigneeToOrderMu(firma)) {
    const adres = (dosya.alici_adresi ?? "").trim();
    return adres ? `${firma}\n${adres}` : firma;
  }
  return null;
}

/** Hazirlik kontrolu icin eksik etiketi (yoksa null). */
export function tarimBelgesiAliciEksigi(dosya: Pick<Dosya, "consignee" | "ham_veri" | "alici_firma" | "alici_adresi">): string | null {
  if (!dosya.consignee) return "Consignee (konşimento talimatı eklenmemiş)";
  if (tarimBelgesiAlicisi(dosya)) return null;
  return "Notify (consignee TO ORDER; notify bilgisi yok)";
}
