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
  [/\bone(\s*line)?\b(?!\s*(?:bir|tane))/, "ONE"],
  [/\boocl\b/i, "OOCL"],
  [/\bturkon\b/i, "Turkon"],
  [/\bakkon\b/i, "Akkon"],
  [/\bculines\b/i, "Culines"],
  [/\bevergreen\b/i, "Evergreen"],
  [/\bcosco\b/i, "COSCO"],
  [/\bzim\b/i, "ZIM"],
  [/\batako\b/i, "Atako"],
  [/\badmiral\b/i, "Admiral"],
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
  for (const [r, ad] of ARMATORLER) if (new RegExp(r.source, r.flags.includes("i") ? r.flags : r.flags + "i").test(s)) return ad;
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
    if (/^FR\.\d/.test(p) || /DENIZCILIK|DENİZCİLİK/.test(p)) continue;
    // "ASYAPORT - BINGAZI" -> "BINGAZI" (POL - POD)
    if (p.includes(" - ")) p = p.split(" - ").pop()!.trim();
    if (KONU_GURULTU.has(p) || KONU_GURULTU.has(p.replace(/İ/g, "I"))) continue;
    adaylar.push(p);
  }
  return adaylar.length ? adaylar[adaylar.length - 1] : null;
}

/** Govdeden alintiyi ve imzayi at; yalnizca yeni yazilan kismi birak. */
export function yeniKisim(govde: string): string {
  let t = govde.replace(/\r/g, "");
  const kes = [
    /\n\s*From:\s/i, /\n\s*Kimden:\s/i, /\n-{2,}\s*Original Message/i,
    /\n\s*Gönderen:\s/i, /\n.{0,120}şunları yazdı/i, /\n.{0,120}wrote:/i,
    /\n\s*>/, /\n_{8,}/,
    /\n\s*Booking onayı verildikten sonra/i,
    /\n\s*Best Regards|\n\s*Saygılarımla|\n\s*Brgds|\n\s*İyi Çalışmalar\s*&/i,
  ];
  for (const r of kes) {
    const m = t.search(r);
    if (m > 0) t = t.slice(0, m);
  }
  return t.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/[’`´]/g, "'").trim();
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

export function freeTimeBul(s: string): number | null {
  const m = s.match(/(\d{1,2})\s*(?:gün|gun|days?)\s*(?:ft\b|free|frfee)/i)
    || s.match(/(\d{1,2})\s*(?:calendar\s*)?days?\s*free/i)
    || s.match(/(\d{1,2})\s*free\s*var/i)
    || s.match(/(?:free\s*time|frfee\s*time|\bft\b)(?:\s*[–-]\s*merged)?\s*[:\-–]?\s*(?:bt\s*)?(\d{1,2})(?![.\/\d])/i)
    || s.match(/(?:free\s*time|\bft\b)[^\d\n]{0,25}?(\d{1,2})\s*(?:gün|gun|days?)/i)
    // 11.11.2026: demuraj / serbest gun yazimlari ("14 DEM + 3 DET", "Demuraj serbest süre: 21", "21 gün serbest", "free days 14")
    || s.match(/(\d{1,2})\s*(?:gün|gun|days?)?\s*DEM(?:URRAGE|URAJ)?\b(?!\s*tarife)/i)
    || s.match(/demura(?:j|ge)\s*(?:serbest\s*s[üu]re(?:si)?)?\s*[:\-–]?\s*(\d{1,2})\s*(?:gün|gun|days?)?(?!\s*saat)\b/i)
    || s.match(/(\d{1,2})\s*(?:gün|gun|days?)\s*serbest/i)
    || s.match(/free\s*days?\s*[:\-–]?\s*(\d{1,2})\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 60 ? n : null;
}

/**
 * Transit suresi (11.11.2026): "Transit süre 46-48 gün", "TT: 85-105 gün", "Transit time: 35 days", "T/T 30 days",
 * "seyir süresi 28 gün", "35 days transit". Gun ifadesi ZORUNLU (kosul maddelerindeki "transit sureler..." sayisizdir).
 * Metinde birbirinden farkli birden fazla deger varsa (rota basina farkli) belirsiz -> null.
 */
export function transitBul(s: string): string | null {
  const r = /(?:transit\s*(?:time|s[üu]re(?:si)?)?|t\/t|\btt\b|seyir\s*s[üu]re(?:si)?|sailing\s*time)\s*[:\-–]?\s*(?:yakla[şs][ıi]k|approx\.?|abt\.?|~|ort(?:alama)?\.?)?\s*(\d{1,3}(?:\s*[-–\/]\s*\d{1,3})?)\s*(?:gün|gun|days?|g\b)|(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)\s*(?:gün|gun|days?)\s*(?:transit|t\/t)/gi;
  const gor = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = r.exec(s))) {
    const ham = (m[1] || m[2]).replace(/\s+/g, "").replace(/[–\/]/g, "-");
    const [a, b] = ham.split("-").map(Number);
    if (!(a >= 1 && a <= 150) || (b !== undefined && !(b >= a && b <= 180))) continue;
    gor.add(ham);
  }
  // Etiketli alan, birimsiz: "Tahmini Transit Süre : 28" (Link teklif formu)
  if (!gor.size) {
    const e = s.match(/transit\s*(?:time|s[üu]re(?:si)?)\s*:\s*(\d{1,3})\b(?!\s*(?:saat|hour|%|usd|\$|[.,]\d))/i);
    if (e && Number(e[1]) >= 1 && Number(e[1]) <= 150) gor.add(e[1]);
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

/** USD'ye bitisik tum tutarlari bul (her biri icin ekipman). */
function tutarlar(s: string, siki = false): Array<{ tutar: number; ekipman: string | null; i: number }> {
  const sonuc: Array<{ tutar: number; ekipman: string | null; i: number }> = [];
  const r = /(?:usd|\$)\s*[:\-–]?\s*([\d][\d.,]*)|([\d][\d.,]*)\s*(?:usd|\$)/gi;
  let m: RegExpExecArray | null;
  while ((m = r.exec(s))) {
    const n = sayi(m[1] || m[2]);
    if (!makulMu(n)) continue;
    const cevre = s.slice(Math.max(0, m.index - 25), m.index + m[0].length + 25);
    // masraf / ceza / kdv'li kalemler navlun degildir
    if (/masraf|ücret|ucret|ceza|kdv|fee\b|demuraj|detention|surcharge/i.test(s.slice(Math.max(0, m.index - 60), m.index + m[0].length + 30))) continue;
    if (siki) {
      const once = s.slice(Math.max(0, m.index - 60), m.index);
      if (!NAVLUN_KELIME.test(once) || YAN_MASRAF.test(s.slice(Math.max(0, m.index - 30), m.index))) continue;
    }
    // Ekipman: once fiyatin hemen ONCESINDE ("20DC: 1625 USD"), yoksa cevresinde ("Usd 875/20dc")
    const sonra = s.slice(m.index + m[0].length, m.index + m[0].length + 14);
    const egik = /^\s*\//.test(sonra) ? ekipmanBul(sonra.replace(/^\s*\//, "")) : null;      // "Usd 875/20dc"
    const onceki = ekipmanBul(s.slice(Math.max(0, m.index - 25), m.index));                    // "20DC: 1625 USD"
    sonuc.push({ tutar: n, ekipman: egik ?? onceki ?? ekipmanBul(cevre), i: m.index });
  }
  return sonuc;
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
function tekArmator(s: string): string | null {
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
  const belirsiz = ftSay > 1;                           // rota/armator basina farkli FT: armator ve FT yazilmaz
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
      out.push({ liman: bas[k].liman, tutar: tut[j] as number, ekipman: ekip[j] as string, armator: belirsiz ? null : tekArmator(yorum), ft: belirsiz ? null : ftYapisal(yorum), gec: gecM ? gecM[1] : null, lokal });
    }
  }
  return out.length ? out : null;
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
      || duz.match(/anla[şs]ma\s*(?:fiyat(?:ımız|imiz|ı|i)?|navlun(?:umuz)?|rakam(?:ımız|imiz)?)\s*[:\-]?\s*([\d][\d.,]*)\s*(?:usd|\$)/i);
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

  const tablo = dikeyTablo(yeni, siki);
  if (tablo) {
    for (const r of tablo) ekle("teklif", { liman: r.liman, tutar: r.tutar, ekipman: r.ekipman ?? "20DC", armator: r.armator, free_time_gun: r.ft, transit_gun: r.tt, gecerlilik: r.gec, lokal_dahil: /lokaller[İI]?\s*\n?\s*DAH[İI]L/i.test(yeni) || null, pol: "AMBARLI" });
    return olaylar;
  }

  const ft = freeTimeBul(duz), gec = gecerlilikBul(duz), pol = polBul(yeni);
  const lokal = /lokaller(?:i)?\s*dahil|all\s*in|pol lokaller dahil/i.test(duz) ? true : (/\+\s*lokaller/i.test(duz) ? false : null);
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

  const t = tutarlar(duz, siki);
  const pod = (yeni.match(/POD\s*[:\-]?\s*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-z .]{2,25}?)(?:\s+(?:FREE|VALIDITY|Hat)|\n|$)/) || [])[1];
  // Konudaki liman esas; govdedeki POD yalniz konu limansizsa. Liman yoksa (genel tarife) fiyat yazilmaz.
  const limanSec = liman0 ?? (pod && !/AMBARLI|ASYAPORT|KUMPORT|FREE|TIME|VALIDITY/i.test(pod) ? buyukTr(pod.trim()) : null);
  if (t.length && limanSec) {
    // ayni mesajda 20 ve 40 ayri fiyatlar olabilir; ekipman basina ilkini al
    const gor = new Set<string>();
    for (const x of t) {
      const ekip = x.ekipman ?? "20DC";
      if (gor.has(ekip)) continue;
      gor.add(ekip);
      ekle(destek ? "karsi_teklif" : "teklif", {
        liman: limanSec,
        tutar: x.tutar, ekipman: ekip, armator: armatorBul(duz, x.i), free_time_gun: ft, gecerlilik: gec, lokal_dahil: lokal, pol,
      });
    }
    return olaylar;
  }
  if (t.length) return olaylar;

  const ekVar = (m.ekler || []).some((e) => /\.(pdf|xlsx?|docx?)$/i.test(e));
  if (/(?:ekte(?:dir|ki)|aşağıdaki gibidir|ekli mailde)/i.test(duz) && /teklif|fiyat|navlun|price|rate/i.test(duz + " " + (ekVar ? "teklif" : ""))) ekle("ek_teklif", { free_time_gun: ft, gecerlilik: gec, armator: armatorBul(duz) });
  return olaylar;
}
