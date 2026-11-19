// NAVLUN BILDIRIMI - mail okuyucu (saf fonksiyonlar, yapay zeka yok, veri yok).
//
// Girdi: operasyonun "<LIMAN> // NAVLUN TALEBI" yazismalarindaki TEK bir mesaj
// (konu, gonderen, govde). Cikti: o mesajdan cikan navlun olaylari.
//
// Olay turleri:
//   teklif        acente fiyat verdi (liman, tutar, ekipman, armator, free time, gecerlilik)
//   karsi_teklif  acente "X usd olarak destek olabilirim" dedi
//   hedef         bizim taraf hedef fiyat verdi ("Hedef rakami X")
//   hedef_soru    acente hedef sordu
//   kabul         bizim taraf "Navlun bedeli X olmak uzere ... booking" dedi
//   servis_yok    acentenin o limana servisi/kontrati yok
//   yer_yok       gemiler dolu
//   ek_teklif     fiyat metinde degil, ekte/gorselde (PDF okuyucu gerekir)
//   hedef_kabul   acente "hedefiniz uygundur" dedi (tutar = son hedefimiz, toplayici baglar)
//
// Not: Bu dosya gercek musteri/acente verisi icermez.

export type NavlunOlayTuru =
  | "teklif" | "karsi_teklif" | "hedef" | "hedef_soru" | "kabul"
  | "servis_yok" | "yer_yok" | "ek_teklif" | "hedef_kabul";

export interface NavlunOlay {
  tur: NavlunOlayTuru;
  liman: string | null;        // POD (konu veya govdeden)
  tutar: number | null;        // USD / konteyner
  ekipman: string | null;      // 20DC | 40HC | 40DC
  armator: string | null;
  free_time_gun: number | null;
  /** Transit suresi (gun) ham: "35" ya da "46-48" (11.11.2026) */
  transit_gun: string | null;
  gecerlilik: string | null;   // ham metin (30.11 / 30.11.2026)
  lokal_dahil: boolean | null;
  pol: string | null;
  /** 19.11.2026: yalniz USD disi (EUR) tarife satirlarinda; yoksa USD */
  para_birimi?: "USD" | "EUR";
}

export interface NavlunMesaj {
  konu: string;
  gonderen: string;            // e-posta adresi
  govde: string;               // duz metin (alinti dahil olabilir)
  ekler?: string[];            // dosya adlari
}

const BIZIM_ALAN = "unex.com.tr";

// Acente alan adi -> gorunen ad tablosu REPODA TUTULMAZ (ucuncu taraf bilgisi);
// canlida veritabanindan okunup parametre olarak verilir.
export type AcenteTablosu = Record<string, string>;

const ARMATORLER: Array<[RegExp, string]> = [
  [/\bmaersk\b/i, "Maersk"],
  [/\bmsc\b/i, "MSC"],
  [/\bcma(\s*cgm)?\b/i, "CMA CGM"],
  [/\bhapag|\bhapaq/i, "Hapag-Lloyd"],
  // 19.11.2026 (acente teklifinde "Hat:ONE" MSC sanildi; form yorumundaki "FT 5 DAYS - ONE" okunmadi): eski desen yalniz kucuk "one" yakaliyordu
  // (Ingilizce "one" kelimesi). Buyuk harf ONE armatordur (BIR / TANE / CONTAINER degilse); "One line" / "Ocean Network Express" her yazimda.
  [/\bONE\b(?!\s*(?:B[İI]R|TANE|CONTAINER|CNTR|BL\b|WAY\b))/, "ONE"],
  [/\bone[\s-]*line\b|\bocean\s*network\s*express\b/i, "ONE"],
  [/\boocl\b/i, "OOCL"],
  [/\bturkon\b/i, "Turkon"],
  [/\bakkon\b/i, "Akkon"],
  [/\bculines\b/i, "Culines"],
  [/\bevergreen\b/i, "Evergreen"],
  [/\bcosco\b/i, "COSCO"],
  [/\bzim\b/i, "ZIM"],
  [/\batako\b/i, "Atako"],
  [/\badmiral\b/i, "Admiral"],
  [/\bmarguisa\b/i, "Marguisa"],
];

// Konudan atilacak kelimeler
const KONU_GURULTU = new Set([
  "UNEX", "RE", "FW", "FWD", "YNT", "MSC", "UNEX GIDA", "IHRACAT", "HK", "HK.",
  "AMERIKA", "AMERİKA", "ANGOLA", "SEYCHELLES ISLAND", "SEYCHELLES ISLANDS",
]);

export function acenteAdi(gonderen: string, acenteler: AcenteTablosu): string | null {
  const alan = (gonderen.split("@")[1] || "").toLowerCase().trim();
  if (!alan) return null;
  if (acenteler[alan]) return acenteler[alan];
  const k = Object.keys(acenteler).find((a) => alan.endsWith("." + a));
  return k ? acenteler[k] : null;
}

/** Metinde gecen armator (ARMATORLER tablosundan), yoksa null. */
export function armatorAdi(s: string): string | null {
  // 19.11.2026: bayraklar oldugu gibi (buyuk harf ONE deseni bilerek buyuk/kucuk harf duyarli)
  for (const [r, ad] of ARMATORLER) if (r.test(s)) return ad;
  return null;
}

export function bizdenMi(gonderen: string): boolean {
  return gonderen.toLowerCase().trim().endsWith("@" + BIZIM_ALAN);
}

function buyukTr(s: string): string {
  return s.replace(/i/g, "İ").replace(/ı/g, "I").toUpperCase();
}

/** Konudan varis limanini cikar: "RE: UNEX // AMERIKA // BOSTON // NAVLUN TALEBI HK." -> "BOSTON" */
export function konudanLiman(konu: string): string | null {
  const parcalar = konu.split("//").map((p) => p.replace(/^\s*(re|fw|fwd|ynt)\s*:\s*/i, "").trim());
  const adaylar: string[] = [];
  for (const p0 of parcalar) {
    let p = buyukTr(p0).replace(/\s+/g, " ").trim();
    if (!p) continue;
    if (/NAVLUN|TALEB|TAELB|PROGRAM|TEKLIF|BOOKING|REZERVASYON/.test(p)) continue;
    if (/^[A-Z]?\d{6,}$/.test(p)) continue;           // booking no
    if (/^[\d\s+,&/.-]+$/.test(p)) continue;           // booking listesi: "277725875 + 277709899"
    if (/^\d+\s*[*X×]\s*(?:20|40|45)\s*'?\s*(?:DC|DV|GP|HC|HQ|RF)?\.?$/.test(p)) continue;   // "8*20 DC" (rezervasyon talebi konusu, 12.11.2026)
    if (/^FR\.\d/.test(p) || /DENIZCILIK|DENİZCİLİK/.test(p)) continue;
    // "ASYAPORT - BINGAZI" -> "BINGAZI" (POL - POD)
    if (p.includes(" - ")) p = p.split(" - ").pop()!.trim();
    if (KONU_GURULTU.has(p) || KONU_GURULTU.has(p.replace(/İ/g, "I"))) continue;
    adaylar.push(p);
  }
  return adaylar.length ? adaylar[adaylar.length - 1] : null;
}

/** Govdeden alintiyi ve imzayi at; yalnizca yeni yazilan kismi birak. */
export function yeniKisim(govde: string, imzaDahil = false): string {
  let t = govde.replace(/\r/g, "");
  const kes = [
    /\n\s*From:\s/i, /\n\s*Kimden:\s/i, /\n-{2,}\s*Original Message/i,
    /\n\s*Gönderen:\s/i, /\n.{0,120}şunları yazdı/i, /\n.{0,120}wrote:/i,
    /\n\s*>/, /\n_{8,}/,
    /\n\s*Booking onayı verildikten sonra/i,
  ];
  for (const r of kes) {
    const m = t.search(r);
    if (m > 0) t = t.slice(0, m);
  }
  // imzaDahil (12.11.2026): imzadan SONRA yazilan teklif notu ("Saygilarimla ... ONE LINE, FT 5 DAYS") icin yalniz alinti kesilir
  if (!imzaDahil) t = imzadanKes(t);
  return t.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/[’`´]/g, "'").trim();
}

const IMZA = /\n\s*(?:Best Regards|Saygılarımla|Brgds|İyi Çalışmalar\s*&)/gi;
const FIYAT_IZI = /(?:usd|\$|eur|€)\s*[:\-–]?\s*\d|\d[\d.,]*\s*(?:usd|\$|eur|€)/i;
/**
 * Imzadan kes. 19.11.2026 (bir acentenin DURBAN teklifi okunamadi): acente teklifi selamlamadaki "Saygılarımla,"dan SONRA yazmis
 * ("...rica eder, iyi calismalar dilerim. Saygılarımla,\n\nAMBARLI - DURBAN\n20 DC : 750 USD ... Best Regards"). Ardindaki 300
 * karakterde fiyat olan imza kelimesi kesim noktasi sayilmaz; bir sonraki imza kelimesine bakilir.
 */
function imzadanKes(t: string): string {
  for (const m of t.matchAll(IMZA)) {
    const i = m.index ?? 0;
    if (i <= 0) continue;
    if (FIYAT_IZI.test(t.slice(i + m[0].length, i + m[0].length + 300))) continue;
    return t.slice(0, i);
  }
  return t;
}

function sayi(s: string): number | null {
  const temiz = s.replace(/[^\d.,]/g, "");
  if (!temiz) return null;
  // 2,220 / 2.220 binlik ayirici; 1625,50 ondalik (nadir)
  let n: number;
  if (/^\d{1,3}([.,]\d{3})+$/.test(temiz)) n = Number(temiz.replace(/[.,]/g, ""));
  else n = Number(temiz.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function makulMu(n: number | null): n is number {
  return n != null && n >= 50 && n <= 20000;
}

function ekipmanBul(s: string): string | null {
  const t = s.toUpperCase().replace(/\s+/g, "");
  if (/40'?(HC|HQ)/.test(t)) return "40HC";
  if (/40'?(DC|DV|GP)?\b/.test(t) && !/20/.test(t)) return "40DC";
  if (/2D0C|20'?(DC|DV|GP|ALL|')|20\b|1\*20/.test(t)) return "20DC";
  return null;
}

function armatorBul(s: string, yakin?: number): string | null {
  let en: { ad: string; d: number } | null = null;
  for (const [r, ad] of ARMATORLER) {
    const g = new RegExp(r.source, r.flags.includes("g") ? r.flags : r.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(s))) {
      const d = yakin == null ? m.index : Math.abs(m.index - yakin);
      if (!en || d < en.d) en = { ad, d };
    }
  }
  return en ? en.ad : null;
}

/**
 * Varis limanindaki serbest gun (free time). 12.11.2026: yukleme tarafindaki kurallar ("Export detention kuralimiz ETD - 14 gun",
 * "bos alim gununden ... 14 gun free time dusulerek export detention") free time SAYILMAZ; "14 free" yazimi eklendi.
 */
const FT_DESENLERI: RegExp[] = [
  // 19.11.2026 (acente: "14 MERGED free time var Hat / Cma Tt/ 46 gün" -> free time 46 yaziliyordu): "N merged / combined free"
  /(\d{1,2})\s*(?:gün|gun|days?)?\s*(?:merged|combined|kombine)\s*(?:free|ft\b)/gi,
  /(\d{1,2})\s*(?:gün|gun|days?)\s*(?:standa?r[td]\s*)?(?:ft\b|free|frfee)/gi,
  /(\d{1,2})\s*(?:calendar\s*)?days?\s*free/gi,
  // 17.11.2026 ("Varis limaninda 13 gun DND free time" okunmuyordu): DND / D&D / combined araya girer
  /(\d{1,2})\s*(?:gün|gun|days?)\s*(?:dnd|d\s*&\s*d|dem\s*\/\s*det|combined|kombine)\s*(?:ft\b|free)/gi,
  /(\d{1,2})\s*free\s*var/gi,
  // 19.11.2026 (acente takip cevabi: "Bu teklife 14 gun verebiliriz"): teklife verilen gun free time'dir
  /teklif(?:e|imize)\s*(\d{1,2})\s*(?:gün|gun|days?)\s*(?:free\s*(?:time)?\s*)?(?:verebil|veriyor|tan[ıi]ml)/gi,
  // 19.11.2026 (acente teklifi "MAERSK USD1850 FT10" free time bos kaldi): bitisik "FT10"
  /\bft(\d{1,2})(?![\d.\/])/gi,
  /(?:free\s*time|frfee\s*time|\bft\b)(?:\s*[–-]\s*merged)?\s*[:\-–]?\s*(?:bt\s*)?(\d{1,2})(?![.\/\d])/gi,
  // 19.11.2026: arada transit etiketi (tt / t/t / transit) varsa sayi transit suresidir, free time degil
  /(?:free\s*time|\bft\b)(?:(?!\btt\b|\bt\/t\b|transit)[^\d\n]){0,25}?(\d{1,2})\s*(?:gün|gun|days?)/gi,
  // 11.11.2026: demuraj / serbest gun yazimlari ("14 DEM + 3 DET", "Demuraj serbest süre: 21", "21 gün serbest", "free days 14")
  /(\d{1,2})\s*(?:gün|gun|days?)?\s*DEM(?:URRAGE|URAJ)?\b(?!\s*tarife)/gi,
  /demura(?:j|ge)\s*(?:serbest\s*s[üu]re(?:si)?)?\s*[:\-–]?\s*(\d{1,2})\s*(?:gün|gun|days?)?(?!\s*saat)\b/gi,
  /(\d{1,2})\s*(?:gün|gun|days?)\s*serbest/gi,
  /free\s*days?\s*[:\-–]?\s*(\d{1,2})\b/gi,
  // 12.11.2026: "kontrat 14 free" (gun kelimesi yok)
  /(?<![\d'*x\/.,])(\d{1,2})\s*free\b(?!\s*(?:time|days?|var|gün|gun))/gi,
];
/** Eslesmenin cevresi yukleme tarafi (export detention / bos ekipman) kuraliysa free time degildir. */
const FT_YUKLEME_TARAFI = /export\s*det|export\s*demur|ihracat\s*(?:det|demur)|origin\s*(?:det|demur|free)|bo[şs]\s*(?:konteyner|ekipman)\s*al[ıi]m|ETD\s*\(?(?:ETS)?\)?\s*[–-]\s*\d/i;

/** Eslesmenin icinde gectigi cumle (". " / ";" / satir sonu ile ayrilir; "30.11" gibi tarihler bolunmez). */
function cumle(s: string, bas: number, bit: number): string {
  const once = s.slice(0, bas);
  const b = Math.max(once.search(/(?:[.!?;]\s|\n)(?!.*(?:[.!?;]\s|\n))/s) + 1, 0);
  const sonra = s.slice(bit).search(/[.!?;]\s|\n/);
  return s.slice(b, sonra < 0 ? s.length : bit + sonra);
}

/**
 * Fiyata bitisik free time (17.11.2026): "1550USD / 21FT", "USD 1450 / 14 FT", "1450$ - 14 free", "USD2020 // FT9". Yalniz fiyatin
 * hemen ardindaki ilk 30 karakterde ve "/" "//" "-" "," ile ayrilmissa. 20 / 40 / 45 konteyner boyu da olabilir ("1550USD / 20FT"
 * = 20'lik basina) -> okunmaz (null). i: fiyat eslesmesinin basladigi konum.
 */
/** Konumdaki fiyat, ayni satirda "?" ile biten bir soru cumlesinin icinde mi ("65-70 usd all in mi bu ?"). */
export function soruCumlesinde(s: string, i: number): boolean {
  const kalan = s.slice(i);
  const son = kalan.search(/\n|[.!](?:\s|$)|\?/);
  return son >= 0 && kalan[son] === "?";
}

export function bitisikFt(s: string, i: number): number | null {
  const m = s.slice(i, i + 30).match(/^(?:(?:usd|\$)\s*[\d.,]+|[\d.,]+\s*(?:usd|\$))\s*[\/,\-–]{1,2}\s*(?:(\d{1,2})\s*(?:ft|free(?:\s*time)?|gün\s*free|days?\s*free)\b|(?:ft|free\s*time)\s*[:\-]?\s*(\d{1,2})(?![\d.,]))/i);
  if (!m) return null;
  // 17.11.2026 (Esna MOMBASA: "USD2020 // FT9 // 24"): FT once yazilirsa ("FT9", "FT 21") konteyner boyu karismaz
  if (m[2]) { const n = Number(m[2]); return n >= 1 && n <= 60 ? n : null; }
  const n = Number(m[1]);
  return n >= 1 && n <= 60 && n !== 20 && n !== 40 && n !== 45 ? n : null;
}

export function freeTimeBul(s: string): number | null {
  for (const r of FT_DESENLERI) {
    for (const m of s.matchAll(r)) {
      const i = m.index ?? 0;
      if (FT_YUKLEME_TARAFI.test(cumle(s, i, i + m[0].length))) continue;
      const n = Number(m[1]);
      if (n >= 1 && n <= 60) return n;
    }
  }
  return null;
}

/**
 * Transit suresi (11.11.2026): "Transit süre 46-48 gün", "TT: 85-105 gün", "Transit time: 35 days", "T/T 30 days",
 * "seyir süresi 28 gün", "35 days transit". Kosul maddelerindeki "transit sureler..." sayisizdir, okunmaz.
 * Metinde birbirinden farkli birden fazla deger varsa (rota basina farkli) belirsiz -> null.
 */
// 13.11.2026 (kullanici: "Bazi acenteler 'tt' olarak cevap veriyor, onlari da okuyabilmeliyiz"): etiket ile sayi arasinda
// dolgu kelimeler ("tt ISE 44 gun", "TT TAHMINI OLARAK 60 gibi", "tahmini MINIMUM TT 90") ve "Transit SUREMIZI 50/55 gun".
// 17.11.2026: "TT45" bitisik yazim ve "tt/41 gün" da okunur (Esna: "USD3330 // FT14 // TT45").
// Acik etiketlerde (tt, t/t, transit time / sure, seyir suresi) gun birimi ZORUNLU DEGIL; yalniz "transit" kelimesinde zorunlu.
const TT_DOLGU = "(?:\\s*(?:[:\\-–=~\\/]|ise|da|de|ise\\s+de|tahmini(?:\\s+olarak)?|tahminen|olarak|ortalama|ort\\.?|yakla[şs][ıi]k|approx\\.?|abt\\.?|about|around|est(?:imated)?\\.?|min(?:imum)?\\.?|max(?:imum)?\\.?|en\\s+az|en\\s+fazla|civar[ıi]))*\\s*";
const TT_SAYI = "(\\d{1,3}(?:\\s*[-–\\/]\\s*\\d{1,3})?)";
const TT_DEGIL = "(?!\\s*(?:%|usd|\\$|eur|saat|hours?|[.,]\\d|\\d|(?:gün|gun|days?)?\\s*(?:free|ft\\b|dem|det|serbest)))";
const TT_ACIK = new RegExp(`(?:transit\\s*(?:time|s[üu]re\\w*)|\\bt\\/t\\b|\\btt(?![a-zçğıöşü])|seyir\\s*s[üu]re\\w*|sailing\\s*time)${TT_DOLGU}${TT_SAYI}${TT_DEGIL}`, "gi");
const TT_BIRIMLI = new RegExp(`\\btransit\\b${TT_DOLGU}${TT_SAYI}\\s*(?:gün|gun|days?)\\b|(\\d{1,3}(?:\\s*[-–]\\s*\\d{1,3})?)\\s*(?:gün|gun|days?)\\s*(?:transit|t\\/t)`, "gi");
// 17.11.2026 ("(ORNEKLIMAN aktarmalı 40-42DAYS )"): aktarma notundaki gun araligi transit suredir
const TT_AKTARMA = /aktarmal[ıi]\s*(\d{1,3}\s*[-–]\s*\d{1,3})\s*(?:days?|g[üu]n)/gi;
// 19.11.2026 (acente takip cevabi: "36 gun via Port Klang"): "N gun via <aktarma>" transit suredir
const TT_VIA = /(?<![\d.,])(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)\s*(?:gün|gun|days?)\s*via\b/gi;
// "Odeme: TT 30 gun" gibi odeme kosulu transit degildir
const TT_ODEME = /(?:ödeme|odeme|payment|vade|pe[şs]in|advance)[^\n]{0,20}$/i;

export function transitBul(s: string): string | null {
  const gor = new Set<string>();
  for (const r of [TT_ACIK, TT_BIRIMLI, TT_AKTARMA, TT_VIA]) {
    for (const m of s.matchAll(r)) {
      if (TT_ODEME.test(s.slice(Math.max(0, (m.index ?? 0) - 25), m.index ?? 0))) continue;
      const ham = (m[1] || m[2]).replace(/\s+/g, "").replace(/[–\/]/g, "-");
      const [a, b] = ham.split("-").map(Number);
      if (!(a >= 1 && a <= 150) || (b !== undefined && !(b >= a && b <= 180))) continue;
      gor.add(ham);
    }
  }
  return gor.size === 1 ? [...gor][0] : null;
}

function gecerlilikBul(s: string): string | null {
  const m = s.match(/(?:validity|geçerlilik|gecerlilik|geçerli(?:dir)?|gecerlidir)[^\d\n]{0,25}(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/i)
    || s.match(/(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)\s*(?:geçerli|gecerli)/i);
  return m ? m[1] : null;
}

/**
 * Yukleme limani: YALNIZ Ambarli ya da Asyaport (11.11.2026 kullanici: "Biz sadece Ambarli ve Asyaport ile
 * calisiyoruz"). Eskiden POL'den sonraki ilk kelime aliniyordu ve "TRIST / BOSTON / JAKARTA" gibi yanlis
 * degerler yaziliyordu; artik ikisinden biri degilse bos (null).
 */
export function polNormal(ham: string | null | undefined): "AMBARLI" | "ASYAPORT" | null {
  if (!ham) return null;
  const u = ham.toLocaleUpperCase("tr-TR");
  if (/ASYA\s*PORT|TEK[İI]RDA[GĞ]/.test(u)) return "ASYAPORT";
  if (/AMBARL[Iİ]/.test(u)) return "AMBARLI";
  return null;
}

function polBul(s: string): string | null {
  const m = s.match(/POL\s*[:\-]?\s*([^\n]{3,40})/);
  return m ? polNormal(m[1].split(/\bPOD\b/i)[0]) : null;
}

function bos(): Omit<NavlunOlay, "tur"> {
  return { liman: null, tutar: null, ekipman: null, armator: null, free_time_gun: null, transit_gun: null, gecerlilik: null, lokal_dahil: null, pol: null };
}

// Ekten (PDF / OCR) okumada: fiyat yalniz navlun kelimesinin yaninda kabul edilir; yan masraf kodlari elenir.
const NAVLUN_KELIME = /freight|navlun|ocean|o\/f|all\s*-?\s*in|deniz\s*nakliye|rate/i;
const YAN_MASRAF = /\b(thc|bl|b\/l|isps|vgm|ens|ams|seal|doc(?:umentation)?|ebs|caf|baf|lss|pss|gri|ecs|ets|cic|imo|telex|handling|muhur|mühür)\b/i;

const EK_KALEM_ONCE = /fark[ıi]?\s*[:\-]?\s*(?:usd|\$)?\s*$|\b(?:imo|pss|gri|vgm|telex|obl)\b[^\n]{0,8}$|art[ıi][şs][ıi]?\s*[:\-]?\s*(?:usd|\$)?\s*$|etiket/i;
const EK_KALEM_SONRA = /^\s*(?:[.,]\s*-)?\s*(?:\+\s*kdv\s*)?(?:pss|gri|art[ıi][şs]|zam\b|fark)/i;
const EGIK = /^\s*(?:[.,]\s*-?\s*|-\s*)?\//;

const MASRAF = /masraf|ücret|ucret|ceza|kdv|fee\b|demuraj|detention|surcharge/i;
// 17.11.2026 (acente "armator spot ekrani ... Total Maliyet: N USD" diye kiyas yazdi; maliyet teklif sanildi):
// acentenin kiyas icin yazdigi maliyet / spot ekrani fiyati kendi teklifi degildir.
const MALIYET = /maliyet|spot\s*ekran|total\s*cost|cost\s*price/i;
// Kalem siniri: baska bir tutar ("+ USD 30", "USD", "$") ya da satir sonu. Tek basina "+" sinir DEGIL ("USD 50+Kdv").
const KALEM_SINIRI = /\+\s*(?=(?:usd|\$|\d))|\busd\b|\$|\n/gi;

/** Tutarin kendi kalem cevresi: once en fazla 60, sonra 30 karakter; araya giren baska kalem (yeni tutar, satir) keser. */
export function kalemCevresi(s: string, bas: number, son: number): string {
  let once = s.slice(Math.max(0, bas - 60), bas);
  const sinirlar = Array.from(once.matchAll(KALEM_SINIRI));
  if (sinirlar.length) { const x = sinirlar[sinirlar.length - 1]; once = once.slice((x.index ?? 0) + x[0].length); }
  // "masraflari dahil" pencere sinirinda bolunmesin: once genis dilimde temizle, sonra 30 karaktere kirp
  let sonra = s.slice(son, son + 60).replace(/masraf(?:lar)?[ıi]?\s+dahil/gi, "").slice(0, 30);
  const k = sonra.search(/\+\s*(?=(?:usd|\$|\d))|\busd\b|\$|\n/i);
  if (k >= 0) sonra = sonra.slice(0, k);
  return (once + s.slice(bas, son) + sonra).replace(/masraf(?:lar)?[ıi]?\s+dahil/gi, "");
}

/** USD'ye bitisik tum tutarlari bul (her biri icin ekipman). */
function tutarlar(s: string, siki = false): Array<{ tutar: number; ekipman: string | null; i: number }> {
  const sonuc: Array<{ tutar: number; ekipman: string | null; i: number }> = [];
  const r = /(?:usd|\$)\s*[:\-–]?\s*([\d][\d.,]*)|([\d][\d.,]*)\s*(?:usd|\$)/gi;
  let m: RegExpExecArray | null;
  // 19.11.2026 (acente teklifi: "EIS masrafi usd 250.- /20' & usd 300.- /40'" -> 300 40'lik navlun sanildi): masraf sayilan
  // tutarin ARDINDAN "&" / "," / "ve" ile siralanan tutar ayni masraf kalemidir.
  let masrafSonu = -1;
  while ((m = r.exec(s))) {
    const n = sayi(m[1] || m[2]);
    if (!makulMu(n)) continue;
    if (masrafSonu >= 0 && m.index - masrafSonu <= 25 && /^[^\n]*?(?:&|,|\bve\b)\s*$/i.test(s.slice(masrafSonu, m.index))) { masrafSonu = m.index + m[0].length; continue; }
    const cevre = s.slice(Math.max(0, m.index - 25), m.index + m[0].length + 25);
    // masraf / ceza / kdv'li kalemler navlun degildir. 16.11.2026 (Imagesa Malabo teklifi okunmadi): bakilan cevre
    // BU tutarla sinirli -> sonraki kalem ("USD 3350 / 20'DC + USD 30 ENS FEE / BL") ya da onceki kalem bu tutari
    // masraf yapmaz; "liman masraflari dahil" bir masraf kalemi degil, lokal dahil bilgisidir.
    if (MASRAF.test(kalemCevresi(s, m.index, m.index + m[0].length))) { masrafSonu = m.index + m[0].length; continue; }
    if (MALIYET.test(cumle(s, m.index, m.index + m[0].length))) continue;
    // 13.11.2026: ek kalem / artis navlun degildir ("IMO lokal farki USD 165", "$200 PSS artisi", "VGM USD 45")
    if (EK_KALEM_ONCE.test(s.slice(Math.max(0, m.index - 25), m.index)) || EK_KALEM_SONRA.test(s.slice(m.index + m[0].length, m.index + m[0].length + 20))) continue;
    if (siki) {
      const once = s.slice(Math.max(0, m.index - 60), m.index);
      if (!NAVLUN_KELIME.test(once) || YAN_MASRAF.test(s.slice(Math.max(0, m.index - 30), m.index))) continue;
    }
    // Ekipman: once fiyatin hemen ONCESINDE ("20DC: 1625 USD"), yoksa cevresinde ("Usd 875/20dc")
    const sonra = s.slice(m.index + m[0].length, m.index + m[0].length + 14);
    const egik = EGIK.test(sonra) ? ekipmanBul(sonra.replace(EGIK, "")) : null;      // "Usd 875/20dc", "USD 2000 .-/20'dv"
    const onceki = ekipmanBul(s.slice(Math.max(0, m.index - 25), m.index));                    // "20DC: 1625 USD"
    // 17.11.2026 ("Navlun Usd 850.- 20' dv  Navlun Usd 1250.- 40' dv& hc" -> ikinci tutar da 20'lik sanilip atlaniyordu):
    // fiyatin HEMEN ardindaki ekipman ("1250.- 40' dv") onceki satirin ekipmanindan once gelir
    const bitisik = /^[\s.,\-–]*\d{2}\s*'/.test(sonra) ? ekipmanBul(sonra.replace(/^[\s.,\-–]*/, "").slice(0, 9)) : null;
    sonuc.push({ tutar: n, ekipman: egik ?? bitisik ?? onceki ?? ekipmanBul(cevre), i: m.index });
  }
  return sonuc;
}

/** Metindeki farkli navlun tutarlari (masraf / ek kalem haric, gevsek okuma). Alintidaki genel tarifeyi tanimak icin. */
export function tutarAdaylari(metin: string): number[] {
  return [...new Set(tutarlar(metin.replace(/&#39;/g, "'").replace(/[’`´]/g, "'").replace(/\s+/g, " ")).map((x) => x.tutar))];
}

/** Metindeki tum navlun tutari adaylari (masraf kalemleri haric). Ekten okumada belirsizlik kontrolu icin. */
export function fiyatAdaylari(metin: string): Array<{ tutar: number; ekipman: string }> {
  return tutarlar(metin.replace(/\s+/g, " "), true).map((x) => ({ tutar: x.tutar, ekipman: x.ekipman ?? "20DC" }));
}

/** Dikey tablo (Horoz tipi): BASLIK satiri, ardindan her liman icin bir deger. */
function dikeyTablo(s: string, siki = false): Array<{ liman: string; tutar: number; ekipman: string | null; armator: string | null; ft: number | null; tt: string | null; gec: string | null }> | null {
  const satir = s.split("\n").map((x) => x.trim()).filter(Boolean);
  const pod = satir.findIndex((x) => /TESL[İI]MAT L[İI]MANI|\(POD\)/i.test(x));
  const nav = satir.findIndex((x) => /^NAVLUN$/i.test(x));
  if (pod < 0 || nav < 0) return null;
  const baslikMi = (x: string) => /ADRES|L[İI]MAN|S[ÜU]RE|^NAVLUN$|^HAT$|GE[ÇC]ERL|^VGM$|TA[ŞS]IMA|LOKAL|INCOTERM|FREE T|MASRAF/i.test(x);
  const limanlar: string[] = [];
  for (let i = pod + 1; i < satir.length && i <= pod + 6 && !baslikMi(satir[i]); i++) limanlar.push(satir[i]);
  const kac = limanlar.length;
  if (!kac) return null;
  const al = (bas: RegExp) => {
    const k = satir.findIndex((x) => bas.test(x));
    return k < 0 ? [] : satir.slice(k + 1, k + 1 + kac);
  };
  const navlun = satir.slice(nav + 1, nav + 1 + kac);
  const hat = al(/^HAT$/i), ft = al(/^FREE T[İI]ME$/i), gec = al(/^GE[ÇC]ERL[İI]L[İI]K$/i);
  const tr = al(/^(?:ORTALAMA\s+)?TRANS[İI]T\s*S[ÜU]RE(?:S[İI])?$/i);
  const out = [];
  for (let i = 0; i < kac; i++) {
    const t = tutarlar("NAVLUN " + (navlun[i] || ""), siki)[0];
    if (!t) continue;
    out.push({ liman: buyukTr(limanlar[i]), tutar: t.tutar, ekipman: t.ekipman ?? ekipmanBul(navlun[i]), armator: armatorBul(hat[i] || ""), ft: freeTimeBul("ft " + (ft[i] || "")), tt: transitBul("transit " + (tr[i] || "")), gec: gec[i] || null });
  }
  return out.length ? out : null;
}

// Kendisi armator olan acenteler: armator yazmasa da teklif o hattindir
const HAT_ACENTE = new Set(["MSC", "ONE", "Akkon", "Culines", "Evergreen", "Hapag-Lloyd", "Maersk", "CMA CGM", "Arkas", "OOCL", "COSCO", "ZIM", "Turkon"]);

// ---------------------------------------------------------------------------
// Bilinen teklif formlari (PDF / OCR): sabit yerlesimli belgelerden dogrudan okuma.
// Genel "siki" okumadan once denenir; form taninmazsa null doner ve genel yol calisir.
// ---------------------------------------------------------------------------

const EKIPMAN_KOD: Array<[RegExp, string]> = [
  [/^(?:40\s*(?:HC|HQ|HCD|HIGH\s*CUBE))$/i, "40HC"],
  [/^(?:40\s*(?:GE|GP|DC|DV|STANDARD\s*DRY|DRY))$/i, "40DC"],
  [/^(?:20\s*(?:GE|GP|DC|DV|STANDARD\s*DRY|DRY))$/i, "20DC"],
];
function ekipmanKod(s: string): string | null {
  const t = s.trim().replace(/\s+/g, " ");
  for (const [r, k] of EKIPMAN_KOD) if (r.test(t)) return k;
  return null;
}

/** Bir metin parcasindaki tek armator (birden fazla farkli armator varsa null). */
export function tekArmator(s: string): string | null {
  const gor = new Set<string>();
  for (const [r, ad] of ARMATORLER) if (new RegExp(r.source, r.flags).test(s)) gor.add(ad);
  return gor.size === 1 ? [...gor][0] : null;
}

function ftYapisal(s: string): number | null {
  const m = s.match(/\bFT\s*(\d{1,2})(?:\s*\+\s*\d{1,2})?\s*days?/i)
    || s.match(/(\d{1,2})\s*days?\s*(?:pod\s*|dest(?:ination)?\s*)?free/i)
    || s.match(/free\s*time\s*[:\-]?\s*(\d{1,2})\s*days?/i)
    || s.match(/serbest\s*s[üu]re\s*:?\s*(\d{1,2})\b(?!\s*saat)/i);
  return m ? Number(m[1]) : null;
}

type YapisalSatir = { liman: string | null; tutar: number; ekipman: string; armator: string | null; ft: number | null; gec: string | null; lokal: boolean | null };

/** Kuehne+Nagel tipi teklif: "Ambarli M -> X Port -> Port ... 20GE ... Rate Total USD 1,475.00" (birden fazla rota olabilir). */
function knFormu(d: string): YapisalSatir[] | null {
  const rota = /→\s*([A-Za-zÇĞİÖŞÜçğıöşü .'\-]{2,40}?)\s+Port\s*→\s*Port\b/g;
  const bas: Array<{ liman: string; i: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = rota.exec(d))) bas.push({ liman: buyukTr(m[1].trim()), i: m.index });
  if (!bas.length) return null;
  const yorumI = d.search(/Pricing Comment/i);
  const yorum = yorumI >= 0 ? d.slice(yorumI, yorumI + 400) : "";
  const ftSay = (yorum.match(/\bFT\s*\d|\d{1,2}\s*days?\s*(?:pod\s*)?free|free\s*time\s*\d/gi) || []).length;
  // 19.11.2026 (iki rotali form teklifi: "FT 14 DAYS - MAERSK FT 5 DAYS - ONE" -> armator bos, Jakarta FT 14 yaziliyordu):
  // rota sayisi kadar "FT N DAYS - ARMATOR" cifti varsa sirayla rotalara verilir. Sayi tutmazsa eskisi gibi yazilmaz.
  const ciftler = [...yorum.matchAll(/\bFT\s*(\d{1,2})\s*DAYS?\s*[-–]\s*([A-Za-z][A-Za-z\- ]{1,30}?)(?=\s+FT\b|\s+Sayfa\b|\s*$|\s*[.,;])/gi)]
    .map((x) => ({ ft: Number(x[1]), armator: armatorAdi(x[2]) }));
  const roteBasina = ciftler.length > 1 && ciftler.length === bas.length && ciftler.every((c) => c.armator);
  const belirsiz = ftSay > 1 && !roteBasina;            // rota/armator basina farkli FT: armator ve FT yazilmaz
  const gecM = d.match(/Ge[çc]erlilik S[üu]resi\s*\d{1,2}\.\d{1,2}\.\d{4}\s*-\s*(\d{1,2}\.\d{1,2}\.\d{4})/i);
  const lokal = /Including[:\s]*O?THC\s*\+\s*POL\s*Locals/i.test(yorum) ? true : null;
  const out: YapisalSatir[] = [];
  for (let k = 0; k < bas.length; k++) {
    const son = k + 1 < bas.length ? bas[k + 1].i : (yorumI > bas[k].i ? yorumI : d.length);
    const parca = d.slice(bas[k].i, son);
    const blok = parca.match(/Services\s+Curr\s+((?:(?:20|40|45)\s*(?:GE|GP|DC|DV|HC|HQ)\s*)+)[\s\-]*Rate\s+Total\s+((?:USD\s*[\d.,]+\s*)+)/i);
    if (!blok) return null;                             // form bozuk: genel yola birak
    const ekip = blok[1].trim().split(/\s+(?=\d)/).map(ekipmanKod);
    const tut = [...blok[2].matchAll(/USD\s*([\d.,]+)/gi)].map((x) => sayi(x[1].replace(/\.\d{2}$/, "")));
    if (ekip.length !== tut.length || ekip.some((e) => !e) || tut.some((t) => !makulMu(t))) return null;
    for (let j = 0; j < ekip.length; j++) {
      const c = roteBasina ? ciftler[k] : null;
      out.push({ liman: bas[k].liman, tutar: tut[j] as number, ekipman: ekip[j] as string, armator: c ? c.armator : belirsiz ? null : tekArmator(yorum), ft: c ? c.ft : belirsiz ? null : ftYapisal(yorum), gec: gecM ? gecM[1] : null, lokal });
    }
  }
  return out.length ? out : null;
}

/**
 * 19.11.2026 (elle duzeltilen form tekliflerinde armator bos, tabloda armatorsuz ayri acente sutunu):
 * ek teklif formunun yorum alanindaki ("Pricing Comment ... Carrier Hapag", "Hat: CMA", "FT 14 DAYS DETANTION MAERSK") tek armator.
 */
export function ekYorumArmatoru(ekMetin: string): string | null {
  const d = (ekMetin || "").replace(/\s+/g, " ");
  const i = d.search(/Pricing Comment/i);
  return i >= 0 ? tekArmator(d.slice(i, i + 400)) : null;
}

/** Link tipi teklif: "Tahliye Limani : X ... Hat : Y ... 20 Standard Dry ... HERSEY DAHIL TASIMA FIYATI 0 2450 USD". */
function linkFormu(d: string): YapisalSatir[] | null {
  const fiyat = [...d.matchAll(/HER[ŞS]EY DAH[İI]L TA[ŞS]IMA F[İI]YATI\s+(?:\d{1,2}\s+)?([\d.,]+)\s*USD/gi)].map((x) => sayi(x[1]));
  if (!fiyat.length || fiyat.some((t) => !makulMu(t))) return null;
  const ekip = [...d.matchAll(/\b((?:20|40)\s*(?:Standard\s*Dry|High\s*Cube|HC|DC))\b/gi)].map((x) => ekipmanKod(x[1]));
  if (ekip.length !== fiyat.length || ekip.some((e) => !e)) return null;
  const tah = d.match(/Tahliye Liman[ıi]\s*:\s*([A-Za-zÇĞİÖŞÜçğıöşü .'\-]{2,40}?)\s*,/i);
  const ds = d.match(/Demuraj Serbest S[üu]re\s*:\s*(\d{1,2})\b/i);
  return fiyat.map((t, j) => ({
    liman: tah ? buyukTr(tah[1].trim()) : null, tutar: t as number, ekipman: ekip[j] as string,
    armator: tekArmator(d), ft: ds ? Number(ds[1]) : null, gec: null, lokal: true,     // "hersey dahil"
  }));
}

/**
 * Ek metni bilinen bir teklif formuysa olaylari dondur; degilse null (genel okuma denenir).
 * Tek rotali teklifte liman konudan alinir (sayfadaki liman kartlari konu limaniyla eslesir).
 */
export function ekFormuOku(ekMetin: string, konu: string): NavlunOlay[] | null {
  const d = ekMetin.replace(/\s+/g, " ");
  const satir = knFormu(d) ?? linkFormu(d);
  if (!satir) return null;
  const lim = konudanLiman(konu);
  const konuLiman = lim && !/&|,/.test(lim) && lim.length <= 30 ? lim : null;
  const limanSayisi = new Set(satir.map((x) => x.liman ?? "")).size;
  return satir.map((x) => ({
    ...bos(), tur: "teklif" as const,
    liman: limanSayisi === 1 ? (konuLiman ?? x.liman) : (x.liman ?? konuLiman),
    tutar: x.tutar, ekipman: x.ekipman, armator: x.armator, free_time_gun: x.ft, gecerlilik: x.gec, lokal_dahil: x.lokal,
  }));
}

/**
 * Tek mesajdan navlun olaylarini cikar. Fiyatli olaylara (ve "fiyat ekte"ye) mesajdaki transit suresi eklenir
 * (11.11.2026; mesajda tek deger varsa).
 */
// 17.11.2026 (cok limanli genel tarife okunmuyordu): "LIMAN (ULKE) USD 1234" satirlari.
// En az 3 satir varsa genel tarife: her liman ayri teklif. Bolum basligindaki "Free time: 14 Days" o bolumun free time'i,
// "For <Liman> 21 Days" o limana ozel. 19.11.2026 (MSC listesinde LA GUAIRA / PUERTO CABELLO EUR 2810 kayboluyordu):
// EUR satirlar da yazilir (para_birimi EUR; tablo hucresi "2810 €", en iyi karsilastirmasi yalniz USD).
// Liman adlari sistemdeki yazima cevrilir (DAR ES SALAAM -> DAR ES SELAM ...); yoksa oldugu gibi buyuk harf.
const TARIFE_ADLARI: Record<string, string> = {
  "DAR ES SALAAM": "DAR ES SELAM", MOGADISHU: "MOGADİŞU", BENGHAZI: "BİNGAZİ", BEIRUT: "BEYRUT", SINGAPORE: "SİNGAPUR",
};
type TarifeSatiri = { liman: string; tutar: number; ekipman: string; ft: number | null; gec: string | null; para: "USD" | "EUR" };
export function tarifeSatirlari(yeni: string): TarifeSatiri[] | null {
  const bulunan: TarifeSatiri[] = [];
  let ft: number | null = null, gec: string | null = null, ekipman = "20DC";
  let ozel: Record<string, number> = {};
  // HTML tablodan gelen metinde hucreler ayri satirdadir, arada bos satir da olabilir ("LIMAN (ULKE)\n\nUSD\n\n1940"): tek satira toplanir
  const duz = yeni
    .replace(/\)[ \t]*(?:\r?\n[ \t]*)+(USD|EUR)[ \t]*(?:\r?\n[ \t]*)+(\d)/g, ") $1 $2")
    .replace(/^([ \t]*currency)[ \t]*(?:\r?\n[ \t]*)+(\d{2}[ \t]*[A-Z]{2})[ \t]*$/gim, "$1 $2");
  for (const ham of duz.split("\n")) {
    const s = ham.trim();
    const bas = s.match(/free\s*time\s*[:\-]?\s*(\d{1,2})\s*days?/i);
    if (bas) {
      ft = Number(bas[1]);
      ozel = {};
      for (const o of s.matchAll(/for\s+([A-Za-z .]{3,25}?)\s+(\d{1,2})\s*days?/gi)) ozel[buyukTr(o[1].trim()).replace(/İ/g, "I")] = Number(o[2]);
      const v = s.match(/validity\s*[:\-]?\s*(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})/i);
      if (v) gec = v[1];
    }
    const e = s.match(/^currency\s+(.+)$/i);
    if (e) ekipman = ekipmanBul(e[1]) ?? ekipman;
    const m = s.match(/^([A-Z][A-Z .'-]{2,30}?)\s*\(([A-Z][A-Z .'-]{2,30})\)\s*(USD|EUR)\s*([\d][\d.,]*)\s*$/);
    if (!m) continue;
    const n = sayi(m[4]);
    if (!makulMu(n)) continue;
    const ad = buyukTr(m[1].trim());
    bulunan.push({ liman: TARIFE_ADLARI[ad] ?? ad, tutar: n, ekipman, ft: ozel[ad.replace(/İ/g, "I")] ?? ft, gec, para: m[3] === "EUR" ? "EUR" : "USD" });
  }
  return bulunan.length >= 3 ? bulunan : null;
}

/**
 * Mesajdaki lokal dahil / haric bilgisi. 16.11.2026: "liman masraflari dahil" / "local charges included" dahil demektir.
 * 17.11.2026 (MSC SINGAPUR): standart sart metnindeki kosullu "Ayrica belirtilmedigi muddetce ... dahil degildir" acik
 * "lokaller dahildir"i ezmez. 19.11.2026 (MSC genel listesi): acik ifade YOKSA kosullu cumle varsayilandir -> haric.
 */
export function lokalDurumu(duz: string): boolean | null {
  const haric = [...duz.matchAll(/(?:lokaller(?:i)?|masraf(?:lar)?[ıi]?)\s*dahil\s*de[ğg]il|local\s*charges\s*(?:not\s*incl|excl)/gi)];
  const kosullu = (x: RegExpMatchArray) => /belirtilmedi[ğg]i|belirtilmedik[çc]e|aksi\s*belirtil|unless/i.test(duz.slice(Math.max(0, (x.index ?? 0) - 120), x.index ?? 0));
  if (haric.some((x) => !kosullu(x))) return false;
  if (/lokaller(?:i)?\s*dahil(?!\s*de[ğg]il)|all\s*in|pol lokaller dahil|(?:liman|lokal|pol)\s*masraf(?:lar)?[ıi]?\s*dahil(?!\s*de[ğg]il)|local\s*charges\s*incl/i.test(duz)) return true;
  if (/\+\s*lokaller/i.test(duz)) return false;
  return haric.length ? false : null;
}

export function navlunMesajOku(m: NavlunMesaj, acenteler: AcenteTablosu, secenek: { ek?: boolean } = {}): NavlunOlay[] {
  const olaylar = navlunMesajOkuIc(m, acenteler, secenek);
  if (!olaylar.some((o) => TRANSITLI.has(o.tur))) return olaylar;
  const tt = transitBul(yeniKisim(m.govde || "").replace(/\s+/g, " "));
  return tt ? olaylar.map((o) => (TRANSITLI.has(o.tur) && !o.transit_gun ? { ...o, transit_gun: tt } : o)) : olaylar;
}
const TRANSITLI = new Set<NavlunOlayTuru>(["teklif", "karsi_teklif", "ek_teklif"]);

function navlunMesajOkuIc(m: NavlunMesaj, acenteler: AcenteTablosu, secenek: { ek?: boolean } = {}): NavlunOlay[] {
  const siki = !!secenek.ek;
  const lim = konudanLiman(m.konu);
  // Genel tarife konulari ("WAF & RELAY & ...") tek liman degildir
  const liman0 = lim && !/&|,/.test(lim) && lim.length <= 30 ? lim : null;
  const yeni = yeniKisim(m.govde || "");
  const duz = yeni.replace(/\s+/g, " ");
  const olaylar: NavlunOlay[] = [];
  const hat = acenteAdi(m.gonderen, acenteler);
  const ekle = (tur: NavlunOlayTuru, x: Partial<NavlunOlay> = {}) => {
    const o: NavlunOlay = { ...bos(), liman: liman0, ...x, tur };
    if (!o.armator && hat && HAT_ACENTE.has(hat) && !bizdenMi(m.gonderen)) o.armator = hat;
    olaylar.push(o);
  };

  if (bizdenMi(m.gonderen)) {
    const h = duz.match(/hedef(?:\s*(?:rakam(?:ı|i)?|fiyat(?:ı|i)?|imiz))?\s*(?:olarak)?[^\d]{0,30}?([\d][\d.,]*)\s*(?:usd|\$)?/i);
    if (h && /hedef/i.test(duz) && makulMu(sayi(h[1]))) ekle("hedef", { tutar: sayi(h[1]), ekipman: ekipmanBul(duz) ?? "20DC" });
    // Kabul: "Navlun bedeli X olmak uzere ... booking" ya da (12.11.2026) "Anlasma fiyatimiz X usd all in"
    const k = duz.match(/navlun\s*(?:bedeli|rakam(?:ı|i))\s*([\d][\d.,]*)\s*(?:usd|\$)?\s*olmak üzere/i)
      || duz.match(/anla[şs]ma\s*(?:fiyat(?:ımız|imiz|ı|i)?|navlun(?:umuz)?|rakam(?:ımız|imiz)?)\s*[:\-]?\s*([\d][\d.,]*)\s*(?:usd|\$)/i)
      // 16.11.2026: "Konu booking icin navlun bedelini 1780 usd olarak dikkate aliyoruz" (Dar es Salaam, raporda "bilgi yok" kaldi)
      || duz.match(/navlun\s*(?:bedel(?:i|ini)|rakam(?:ı|i|ını|ini)|fiyat(?:ı|i|ını|ini))\s*([\d][\d.,]*)\s*(?:usd|\$)\s*olarak\s*(?:dikkate\s*al|kabul\s*ed|onayl)/i);
    if (k && makulMu(sayi(k[1]))) ekle("kabul", { tutar: sayi(k[1]), ekipman: "20DC", armator: armatorBul(duz) });
    return olaylar;
  }

  if (!hat) return olaylar; // liman/terminal vb. -> navlun degil
  // Rezervasyonu alinmis is: operasyon yazismasi (fon, ekipman, dolu giris) -> navlun teklifi degil
  if (/\bB?\d{8,}\s*\/\//.test(m.konu) || /rezervasyonunuz alınm|rez(?:ervasyon)? formu|föy(?:ler)? ektedir|booking(?:ler)? (?:hazır|ekte|girişleri)/i.test(duz)) return olaylar;

  if (/servis(?:imiz)?\s*(?:mevcut değil|bulunmamakta)|kontrat(?:ımız)?\s*bulunmamakta|özel rakam(?:ımız|imiz)?\s*bulunmamakta|ozel rakamimiz bulunmamaktadir/i.test(duz)) {
    ekle("servis_yok");
    return olaylar;
  }
  if (/gemileri dolu|yer (?:yok|bulunmamakta)|no space/i.test(duz)) ekle("yer_yok");
  if (/hedef(?:iniz)?\s*(?:var\s*m[ıi]|mevcut\s*mu|ifyat|fiyat)/i.test(duz) && !/hedefiniz uygundur/i.test(duz)) ekle("hedef_soru");
  if (/hedef(?:iniz)?\s*uygun/i.test(duz)) { ekle("hedef_kabul"); return olaylar; }

  const tarife = tarifeSatirlari(yeni);
  if (tarife) {
    // 19.11.2026: liste sart metnindeki lokal bilgisi satirlara yazilir (MSC listesi: "Ayrica belirtilmedigi muddetce ... lokal
    // masraflari dahil degildir" -> haric). Onceden null kaliyor, acente hafizasindaki "MSC lokal dahil" uygulanip ucuz gorunuyordu.
    const lokalT = lokalDurumu(yeni.replace(/\s+/g, " "));
    for (const r of tarife) ekle("teklif", { liman: r.liman, tutar: r.tutar, ekipman: r.ekipman, free_time_gun: r.ft, gecerlilik: r.gec, lokal_dahil: lokalT, pol: polBul(yeni), ...(r.para === "EUR" ? { para_birimi: "EUR" as const } : {}) });
    return olaylar;
  }

  const tablo = dikeyTablo(yeni, siki);
  if (tablo) {
    for (const r of tablo) ekle("teklif", { liman: r.liman, tutar: r.tutar, ekipman: r.ekipman ?? "20DC", armator: r.armator, free_time_gun: r.ft, transit_gun: r.tt, gecerlilik: r.gec, lokal_dahil: /lokaller[İI]?\s*\n?\s*DAH[İI]L/i.test(yeni) || null, pol: "AMBARLI" });
    return olaylar;
  }

  const ft = freeTimeBul(duz), gec = gecerlilikBul(duz), pol = polBul(yeni);
  // 16.11.2026: "liman masraflari dahil" / "local charges included" da lokal dahil demektir
  // 17.11.2026 (MSC SINGAPUR: "lokaller dahildir" yazmasina ragmen lokal haric gorunuyordu): standart sart metnindeki
  // "Ayrica belirtilmedigi muddetce ... lokal masraflari dahil degildir" kosullu cumledir; acik ifadeyi ezmez.
  const lokal = lokalDurumu(duz);
  const destek = /destek ol(?:abil|uyor)/i.test(duz);

  // Satir bazli coklu liman: "Istanbul – Jakarta :USD340/20all in"
  const satirlar = yeni.split("\n");
  let satirdan = 0;
  for (const s of satirlar) {
    const mm = s.match(/^\s*[A-Za-zÇĞİÖŞÜçğıöşü]+\s*[–-]\s*([A-Za-zÇĞİÖŞÜçğıöşü/ ]+?)\s*:\s*(?:usd)\s*([\d][\d.,]*)/i);
    if (mm && makulMu(sayi(mm[2]))) {
      for (const lim of mm[1].split("/")) ekle("teklif", { liman: buyukTr(lim.trim()), tutar: sayi(mm[2]), ekipman: ekipmanBul(s) ?? "20DC", armator: armatorBul(yeni), free_time_gun: ft, lokal_dahil: /all\s*in/i.test(s) || lokal });
      satirdan++;
    }
  }
  if (satirdan) return olaylar;

  // 17.11.2026 (OOCL SINGAPUR: "65-70 usd all in mi bu 2X20lik icin ?" teklif 70 sayilip en iyi fiyat gibi gorunuyordu):
  // fiyat soru cumlesindeyse (ayni satirda "?" ile bitiyor) acente teklif vermiyor, fiyati soruyor -> teklif degil.
  const tHam = tutarlar(duz, siki);
  // 19.11.2026 (acente: "Usd 425/20dc\n\nMaersk\n\n...\n\nHedef var midir?" teklif kayboluyordu): duz metinde satir sonu yok, sonraki
  // satirdaki soru fiyatin cumlesi saniliyordu. Ayni uzunlukta, satir sonlarini koruyan kopya (indisler duz ile ayni).
  const duzSatirli = yeni.replace(/\s+/g, (w) => (w.includes("\n") ? "\n" : " "));
  const t = tHam.filter((x) => !soruCumlesinde(duzSatirli, x.i));
  if (tHam.length && !t.length) {
    if (!olaylar.some((o) => o.tur === "hedef_soru")) ekle("hedef_soru");
    return olaylar;
  }
  const pod = (yeni.match(/POD\s*[:\-]?\s*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-z .]{2,25}?)(?:\s+(?:FREE|VALIDITY|Hat)|\n|$)/) || [])[1];
  // Konudaki liman esas; govdedeki POD yalniz konu limansizsa. Liman yoksa (genel tarife) fiyat yazilmaz.
  const limanSec = liman0 ?? (pod && !/AMBARLI|ASYAPORT|KUMPORT|FREE|TIME|VALIDITY/i.test(pod) ? buyukTr(pod.trim()) : null);
  // 16.11.2026: "POD : BATA & MALABO" -> ayni fiyat her iki liman icin (konudaki liman listede ise ya da konuda liman yoksa)
  const podCoklu = (yeni.match(/POD\s*[:\-]?\s*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ .]{1,25}(?:\s*(?:&|\/|,)\s*[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ .]{1,25})+)\s*(?:\n|$)/) || [])[1];
  const podListesi = podCoklu ? podCoklu.split(/\s*(?:&|\/|,)\s*/).map((x) => buyukTr(x.trim())).filter((x) => x && !/AMBARLI|ASYAPORT|KUMPORT/.test(x)) : [];
  const limanlar = podListesi.length > 1 && (!liman0 || podListesi.includes(buyukTr(liman0))) ? podListesi : limanSec ? [limanSec] : [];
  // Armator mail metninde yoksa imzadaki tek armator ("As agent for Marguisa Shipping Lines")
  const imzaArmator = tekArmator(yeniKisim(m.govde || "", true).slice(yeni.length));
  if (t.length && limanlar.length) {
    // ayni mesajda 20 ve 40 ayri fiyatlar olabilir; ekipman basina ilkini al.
    // 17.11.2026 (Esna TEMA: "Hapag; 1550USD / 21FT  Maersk; 1450USD / 14FT" -> yalniz Hapag okunuyordu): ayni ekipmanda
    // FARKLI armatorlu fiyatlar ayri tekliftir (anahtar = ekipman + fiyatin yanindaki armator). Ayni armatorun tekrar
    // eden fiyati (ya da armatorsuz) eskisi gibi tek. Fiyata bitisik free time ("USD / 21FT") o teklifin free time'idir.
    const gor = new Set<string>();
    for (const x of t) {
      const ekip = x.ekipman ?? "20DC";
      const arm = armatorBul(duz, x.i) ?? imzaArmator;
      const anahtar = `${ekip}|${arm ?? ""}`;
      if (gor.has(anahtar) || (!arm && [...gor].some((g) => g.startsWith(`${ekip}|`)))) continue;
      gor.add(anahtar);
      for (const l of limanlar) {
        ekle(destek ? "karsi_teklif" : "teklif", {
          liman: l,
          tutar: x.tutar, ekipman: ekip, armator: arm, free_time_gun: bitisikFt(duz, x.i) ?? ft, gecerlilik: gec, lokal_dahil: lokal, pol,
        });
      }
    }
    return olaylar;
  }
  if (t.length) return olaylar;

  const ekVar = (m.ekler || []).some((e) => /\.(pdf|xlsx?|docx?)$/i.test(e));
  if (/(?:ekte(?:dir|ki)|aşağıdaki gibidir|ekli mailde)/i.test(duz) && /teklif|fiyat|navlun|price|rate/i.test(duz + " " + (ekVar ? "teklif" : ""))) ekle("ek_teklif", { free_time_gun: ft, gecerlilik: gec, armator: armatorBul(duz) });
  return olaylar;
}
