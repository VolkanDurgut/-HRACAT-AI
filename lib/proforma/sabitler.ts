/**
 * PROFORMA OLUSTURUCU - sabit metinler ve yardimcilar (17.10.2026).
 *
 * Kaynak: kullanicinin paylastigi "DRAFT_Proforma__Contract.xlsx" taslagi.
 * Metinler AYNEN alindi; sadece KESIN yazim hatalari duzeltildi (kullanici
 * karari 17.10.2026): "ets" -> "etc.", "incountry" -> "in country",
 * "legalvenue" -> "legal venue", "eﬀected" (bitisik harf) -> "effected",
 * noktadan sonra eksik bosluk, cift bosluk, bas/son bosluk.
 * Anlami etkileyen hicbir kelimeye dokunulmadi.
 *
 * Sirket bazli ayar (proforma_ayarlari) NULL ise bu varsayilanlar kullanilir.
 * Saf modul: React / Supabase importu yok (tsx ile test edilir).
 */

export const SATICI = {
  unvan: "UNEX GIDA SAN. VE TIC. LTD. STI.",
  adres: "ISTIKLAL MAHALLESI CEMAL UNLU SARAC CADDESI NO: 20 SULEYMANPASA / TEKIRDAG / TURKIYE",
} as const;

/** SPECIAL CONDITIONS (3. sayfa) - 11 madde. */
export const VARSAYILAN_OZEL_SARTLAR: string[] = [
  "All import duties, taxes, levies, present or future in country of destination and certificates which is not mentioned above shipment documents should be for buyer's account.",
  "All export duties, taxes, levies etc. present or future in country of export/origin should be for seller's account.",
  "Weight / Quality / Condition are final and binding at time and place of loading as per certificate(s), issued by Seller’s laboratory. Buyers have the option to nominate their own GAFTA approved surveyor for quality and weight control but have no right to interfere in loading operation. Weight will be determined by Factory scale.",
  "In the case of any disagreement or arbitration, the legal venue will be Tekirdag courts",
  "Seller has the right to hold the shipment or cancel this contract if any delay of payment for earlier shipments occur/happen after arrival of shipments at final destination",
  "No telex release / Seaway bill / Air courier shipment documents before Seller duly received payment to Seller’s account. Payment to be considered effected once funds are safely received in the Seller's bank account. It is clear to the Buyers and the Sellers that the payment and time of payment are essential conditions of the contract",
  "Weight shortage:\nAny weight shortage over 0.5% at discharge port will be for Sellers’ account. Shortage quantity to be according to shore scale figures and confirmed by any GAFTA approved surveyor’s certificate. Any shortage below 0.5% to BL weight will be for the account of Buyers",
  "Drafts of shipping documents to be confirmed by the Buyer before loading completion, Buyers will confirm within 1 business day, if not so done, original documents will be issued basis initial DI, not contradicting contract terms/ latest version of drafts presented to Buyers. The documents will then be accepted and paid by Buyers. Any re-issuance, if requested to be for Buyers time and account.",
  "Demurrage: 10 days free time at discharging port",
  "General conditions:\nAll other terms, conditions and rules, not in contradiction with the above contained in Form 48 of GAFTA of which the parties admit that they have knowledge and notice, apply to this transaction and the details above given shall be taken as having been written into such form in the appropriate places",
  "All the bank charges in all transactions are on sender’s account and must be stated as bank charges: OUR",
];

/**
 * SHIPPING DOCUMENTS (2. sayfa) - taslaktaki sira. Numara basilirken eklenir.
 * "Insurance Policy" SADECE CIF / CIP teslimde basilir (kullanici karari 17.10.2026).
 */
export const VARSAYILAN_EVRAKLAR: string[] = [
  "Commercial Invoice by the Sellers",
  "Packing List by the Sellers",
  "Full Set of Bill of Lading 3 Original marked Freight Prepaid",
  "Certificate of Origin issued by Chamber of Commerce",
  "Phytosanitary Certificate issued by the Ministry of Agriculture and Rural Affairs",
  "Health Certificate issued by the Ministry of Agriculture and Rural Affairs",
  "Fumigation Certificate issued by the Sellers",
  "Photographic Loading Report issued by UNEX",
  "Quality And Weight Certificate issued by the UNEX",
  "Insurance Policy",
];

/** 1. sayfa alt bilgi (taslak: sayfa altligi). */
export const VARSAYILAN_ALT_BILGI: string[] = [
  "ALL BANK CHARGES IN ALL TRANSACTIONS ARE ON SENDER’S ACCOUNT AND MUST BE STATED AS BANK CHARGES : OUR",
  "QUALITY,QUANTITY AND CONDITION OF THE CARGO IS FINAL AT LOADING PORT",
  "GOODS ARE OF TURKISH ORIGIN",
];

/** 2-3. sayfa sag ust: sablonun kendi surum bilgisi (proforma tarihi DEGIL). */
export const VARSAYILAN_UST_BILGI = { tarih: "28/09/26", revizyon: "01" } as const;

export const TESLIM_SEKILLERI = ["CIF", "CFR", "FOB", "CIP", "CPT", "FCA", "EXW", "DAP"] as const;

/** Sigorta satici tarafindaysa (CIF / CIP) "Insurance" evraki listede kalir. */
export function sigortaSatictaMi(teslimSekli: string | null | undefined): boolean {
  const t = String(teslimSekli || "").trim().toUpperCase();
  return t === "CIF" || t === "CIP";
}

export function sigortaEvrakiMi(metin: string): boolean {
  return /\binsurance\b/i.test(metin);
}

/** Teslim sekline gore basilacak evraklar (CIF/CIP disinda sigorta cikar). */
export function teslimeGoreEvraklar(evraklar: string[], teslimSekli: string | null | undefined): string[] {
  return sigortaSatictaMi(teslimSekli) ? evraklar : evraklar.filter((e) => !sigortaEvrakiMi(e));
}

/**
 * Kesin yazim hatalari (gecmis proformalarda tekrar eden). Kelime sinirli,
 * BUYUK harf korunur. Anlam degistiren duzeltme YOK.
 */
const DUZELTMELER: [RegExp, string][] = [
  [/\bAGAISNT\b/g, "AGAINST"],
  [/\bAgaisnt\b/g, "Against"],
  [/\bagaisnt\b/g, "against"],
  [/\bMESSAEGE\b/g, "MESSAGE"],
  [/\bmessaege\b/g, "message"],
  [/\bWTHIN\b/g, "WITHIN"],
  [/\bwthin\b/g, "within"],
  [/\bCertficate\b/g, "Certificate"],
  [/\bCERTFICATE\b/g, "CERTIFICATE"],
];

export function yazimDuzelt(metin: string | null | undefined): string {
  let s = String(metin || "");
  for (const [re, yeni] of DUZELTMELER) s = s.replace(re, yeni);
  return s.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([,.])/g, "$1").trim();
}

/**
 * Alici kodu onerisi (UNEX + KOD + GGAAYY): unvanin anlamli ilk 3 kelimesinin
 * bas harfleri; 3 kelime yoksa ilk kelimeden tamamlanir. Mevcut kodlarla
 * cakisirsa son harf degistirilerek bos kod aranir.
 */
const DOLGU = new Set(["THE", "AND", "OF", "&", "LTD", "LTD.", "LIMITED", "SARL", "SARLU", "SA", "S.A", "SL", "SA.", "PTE", "CO", "CO.", "INC", "LLC", "EURL", "DE", "C.V", "CV"]);

export function aliciKoduOner(unvan: string, mevcut: Iterable<string> = []): string {
  const temiz = String(unvan || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z0-9& .]/g, " ");
  const kelimeler = temiz.split(/\s+/).filter((k) => k && !DOLGU.has(k) && /[A-Z]/.test(k)).map((k) => k.replace(/[^A-Z]/g, "")).filter(Boolean);
  let kod = kelimeler.slice(0, 3).map((k) => k[0]).join("");
  if (kod.length < 3 && kelimeler[0]) kod = (kod + kelimeler[0].slice(1)).slice(0, 3);
  kod = (kod + "XXX").slice(0, 3);
  const dolu = new Set(Array.from(mevcut, (k) => k.toUpperCase()));
  if (!dolu.has(kod)) return kod;
  for (const h of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const aday = kod.slice(0, 2) + h;
    if (!dolu.has(aday)) return aday;
  }
  return kod + "2";
}

/**
 * "Djibouti Port, Djibouti" -> "DJIBOUTI PORT" (virgulden onceki kisim, buyuk harf).
 * Ingilizce belgeye yazilacagi icin aksan / Turkce harf sadelestirilir ("SİNGAPUR" -> "SINGAPUR").
 */
export function limanAdi(varisLimani: string | null | undefined): string {
  const ilk = String(varisLimani || "").split(",")[0].replace(/\s+/g, " ").trim();
  const sade = ilk.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").toLocaleUpperCase("en-US");
  // Virgulsuz "DJIBOUTI PORT DJIBOUTI" / "COTONOU PORT BENIN" -> ulke kismi atilir.
  // ("PORT LOUIS" / "PORT SUDAN" gibi PORT ile BASLAYAN adlara dokunulmaz.)
  const m = sade.match(/^(.+?\sPORT)\s+\S.*$/);
  return m ? m[1] : sade;
}

/** Teslim ifadesi onerisi (taslaktaki bicim): "CIF" + "DJIBOUTI PORT" -> "CIF DJIBOUTI PORT BASIS". */
export function teslimIfadesiOner(teslimSekli: string | null | undefined, liman: string | null | undefined): string {
  const govde = [String(teslimSekli || "").trim().toUpperCase(), String(liman || "").trim().toLocaleUpperCase("en-US")].filter(Boolean).join(" ");
  return govde ? `${govde} BASIS` : "";
}

/** "DESCRIPTION OF GOODS" = urun + (MARKA BRAND). Siparis takibinin marka eslesmesiyle uyumlu. */
export function urunAciklamasi(urun: string, marka: string | null | undefined): string {
  const u = String(urun || "").trim();
  const m = String(marka || "").trim().toLocaleUpperCase("en-US").replace(/\s+BRAND$/i, "");
  return m ? `${u} (${m} BRAND)` : u;
}

/** "ALL PURPOSE WHEAT FLOUR(ASLI BRAND)" -> { urun: "ALL PURPOSE WHEAT FLOUR", marka: "ASLI" } */
export function urunVeMarkaAyir(aciklama: string): { urun: string; marka: string | null } {
  const s = String(aciklama || "").trim();
  const m = s.match(/^(.*?)\s*\(([^()]*\bBRAND)\)\s*$/i);
  if (!m) return { urun: s, marka: null };
  const marka = m[2].replace(/\bBRAND\b/i, "").trim();
  return { urun: m[1].trim(), marka: marka ? marka.toLocaleUpperCase("en-US") : null };
}
