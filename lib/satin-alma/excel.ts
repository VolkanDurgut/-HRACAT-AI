import JSZip from "jszip";
import { BIRIMLER, KATEGORILER, tedarikciDuzelt, urunNorm, type Birim, type Kategori } from "@/supabase/functions/_shared/satin-alma";

/**
 * Satin alma - Excel'den yukle (31.10.2026)
 * ----------------------------------------------------------------------------
 * Kullanici: "Her hafta persembe gunu siparis veriliyor. Bugunun listesi ektedir."
 * Ornek: "30.10.2026 Alisveris Listesi.xlsx" -> baslik satiri
 *   Miktar | Birim | Birim | Kategori | Tedarikci / Not
 * (IKINCI "Birim" sutunu aslinda URUN ADI). Bu yuzden sutunlar ADA GORE degil,
 * baslik + ICERIGE gore bulunur: ayni adli iki sutundan degerleri birime cevrilebilen
 * birim, digeri urun sayilir.
 *
 * SAF kisim (izgaradan kalem cikarma) Node'da test edilir; XLSX okuma jszip + basit
 * XML ayristirma (DOMParser gerektirmez). Yapay zeka YOK. Supheli satir SESSIZCE
 * ATLANMAZ: `sorun` ile isaretlenir, kullanici onizlemede duzeltir.
 * ============================================================================
 */

export type ExcelSatiri = {
  sira: number; // Excel satir numarasi (1'den)
  /** Urun hucresinin adresi ("C3", "I12"): yan yana bloklarda satir no tek basina benzersiz degil */
  hucre: string;
  urun: string;
  miktar: number | null;
  birim: Birim | null;
  birimHam: string;
  kategori: Kategori;
  kategoriHam: string;
  tedarikci: string | null;
  aciklama: string;
  sorun: string | null;
  /** Satirin geldigi blok basligindan okunan tedarikci (yoksa null) */
  blok: string | null;
};

export type ExcelBlogu = { ad: string | null; hucre: string; kalem: number };
export type ExcelSonucu = { baslik: string | null; satirlar: ExcelSatiri[]; uyarilar: string[]; bloklar: ExcelBlogu[] };

/** Karsilastirma anahtari (TR harf katlama + kucuk harf). */
const k = (s: unknown) => urunNorm(String(s ?? ""));

const BIRIM_ESLER: Record<string, Birim> = {
  adet: "adet", ad: "adet", tane: "adet", pcs: "adet", piece: "adet",
  paket: "paket", pk: "paket", pkt: "paket",
  koli: "koli", kl: "koli",
  kutu: "kutu",
  top: "top",
  kg: "kg", kilo: "kg", kilogram: "kg",
  gr: "gr", g: "gr", gram: "gr",
  litre: "litre", lt: "litre", l: "litre",
  metre: "metre", m: "metre", mt: "metre",
  takim: "takim",
  kova: "kova",
  bidon: "bidon",
  sise: "sise",
  kavanoz: "kavanoz", kvnz: "kavanoz",
  diger: "diger",
};

/** "Kg", "KG.", "kilo" -> "kg"; bilinmiyorsa null. */
export function birimTani(ham: unknown): Birim | null {
  const a = k(ham).replace(/\s+/g, "").replace(/\.$/, "");
  if (!a) return null;
  const b = BIRIM_ESLER[a];
  return b && b in BIRIMLER ? b : null;
}

/** Excel kategori metni -> sistem kategorisi. Bilinmeyen -> "diger" (sorun degil). */
export function kategoriTani(ham: unknown): Kategori {
  const a = k(ham);
  if (!a) return "mutfak";
  if (/temizlik|hijyen|deterjan/.test(a)) return "temizlik";
  if (/kirtasiye|ofis|kagit a4|toner/.test(a)) return "kirtasiye";
  if (/elektronik|bilgisayar|donanim/.test(a)) return "elektronik";
  if (/is guvenligi|isg|koruyucu/.test(a)) return "is_guvenligi";
  if (/gida|manav|mutfak|baharat|\bsos\b|\bet\b|tavuk|icecek|kahvalti|\bsut\b|sarkuteri|meyve|sebze/.test(a)) return "mutfak";
  if (/diger/.test(a)) return "diger";
  return "diger";
}

/** 20 | "20" | "2,5" | "1.000" -> sayi (>0, <=1e6, 2 ondalik); degilse null. */
export function miktarCoz(ham: unknown): number | null {
  if (typeof ham === "number") return Number.isFinite(ham) && ham > 0 && ham <= 1_000_000 ? Math.round(ham * 100) / 100 : null;
  let t = String(ham ?? "").trim().replace(/\s/g, "");
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Math.round(Number(t) * 100) / 100;
  return n > 0 && n <= 1_000_000 ? n : null;
}

const hucre = (r: unknown[] | undefined, i: number) => (r && i >= 0 && i < r.length && r[i] != null ? String(r[i]).trim() : "");

/** 0 -> "A", 26 -> "AA" */
export function sutunHarfi(s: number): string {
  let n = s + 1;
  let t = "";
  while (n > 0) { const m = (n - 1) % 26; t = String.fromCharCode(65 + m) + t; n = Math.floor((n - 1) / 26); }
  return t;
}
const adres = (r: number, s: number) => `${sutunHarfi(s)}${r + 1}`;

/** Blok / bant basliginda tedarikci olmayan genel ifadeler */
const GENEL_BASLIK = /^(genel( ihtiyac(lar)?)?|ihtiyac(lar)?|liste|siparis( listesi)?|haftalik( liste)?|diger|mutfak|ofis|toplam|tedarikci)$/;

/**
 * Blok / bant basligindan tedarikci adi:
 *  "ALIŞVERİŞ LİSTESİ (30.10.2026)      CEM MARKET" -> "CEM MARKET"
 *  "TAKOZLAR  ·  12 kalem" -> "TAKOZLAR";  "14.11.2026 Alışveriş Listesi" -> null
 *  "GENEL İHTİYAÇLAR" -> null (tedarikci degil)
 */
export function baslikTedarikcisi(ham: unknown): string | null {
  let t = String(ham ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  t = t
    .replace(/AL[IİıiI][SŞsş]\s*VER[IİıiI][SŞsş]\s*L[IİıiI]STES[IİıiI]/gi, " ")
    .replace(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/g, " ")
    .replace(/[·•|\-–—]?\s*\d+\s*kalem\b/gi, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/^[\s·•|:\-–—()]+|[\s·•|:\-–—()]+$/g, "")
    .replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 80) return null;
  if (!/[a-zçğıöşü]/i.test(t)) return null;
  if (GENEL_BASLIK.test(k(t))) return null;
  return tedarikciDuzelt(t);
}

/**
 * "Tedarikçi / Not" hucresi (21.11.2026): "CEM MARKET · 1 mi 2 mi? Teyit" ->
 * { tedarikci: "CEM MARKET", not: "1 mi 2 mi? Teyit" }. Ayirici: · • | (bosluklu).
 * Ayirici yoksa hucrenin tamami tedarikcidir. Not yazildigi gibi korunur (buyuk harfe cevrilmez).
 */
export function tedarikciNotAyir(ham: unknown): { tedarikci: string | null; not: string } {
  const t = String(ham ?? "").replace(/\s+/g, " ").trim();
  const m = /^(.+?)\s+[·•|]\s+(.+)$/.exec(t);
  if (!m) return { tedarikci: tedarikciDuzelt(t), not: "" };
  return { tedarikci: tedarikciDuzelt(m[1]), not: m[2].trim().slice(0, 300) };
}

const BASLIK_DIGER = /^birim|^urun|^malzeme|^ad$|^adi|^tanim|^kategori|^tedarik/;

type Blok = { r: number; bas: number; son: number; bitis: number; ad: string | null };

/** Baslik satirlarindaki "Miktar" hucrelerinden bloklari bulur (yan yana ve alt alta). */
function bloklariBul(izgara: unknown[][]): Blok[] {
  const bloklar: Blok[] = [];
  izgara.forEach((satir, r) => {
    const s = satir || [];
    let i = 0;
    while (i < s.length) {
      if (!hucre(s, i)) { i++; continue; }
      let j = i;
      while (j + 1 < s.length && hucre(s, j + 1)) j++;
      // [i, j] bitisik dolu hucre kosusu
      const miktarlar: number[] = [];
      for (let c = i; c <= j; c++) if (/^miktar/.test(k(s[c]))) miktarlar.push(c);
      if (miktarlar.length) {
        // Birden cok "Miktar" bitisikse: ilk segmentteki konum sabit kabul edilerek bolunur
        const ofset = miktarlar[0] - i;
        miktarlar.forEach((m, n) => {
          const bas = Math.max(i, m - ofset);
          const son = n + 1 < miktarlar.length ? Math.max(bas, miktarlar[n + 1] - ofset - 1) : j;
          let digerBaslik = false;
          for (let c = bas; c <= son; c++) if (c !== m && BASLIK_DIGER.test(k(s[c]))) digerBaslik = true;
          if (digerBaslik) bloklar.push({ r, bas, son, bitis: izgara.length, ad: null });
        });
      }
      i = j + 1;
    }
  });
  // Blok govdesi: ayni sutunlarla kesisen bir sonraki baslik satirina kadar
  for (const b of bloklar) {
    const sonraki = bloklar.filter((x) => x.r > b.r && x.bas <= b.son && x.son >= b.bas).map((x) => x.r);
    if (sonraki.length) b.bitis = Math.min(...sonraki);
  }
  return bloklar.sort((a, b) => a.bas - b.bas || a.r - b.r);
}

/** Blok icindeki dolu metin hucreleri (adres + deger) */
const blokMetinleri = (satir: unknown[] | undefined, b: Blok) => {
  const m: { s: number; v: string }[] = [];
  for (let s = b.bas; s <= b.son; s++) { const v = hucre(satir, s); if (v) m.push({ s, v }); }
  return m;
};

/** Izgaradan (satir x sutun, ham degerler) alisveris listesi kalemleri. */
export function alisverisListesiCoz(izgara: unknown[][]): ExcelSonucu {
  const uyarilar: string[] = [];
  const bloklar = bloklariBul(izgara);
  if (!bloklar.length) {
    return { baslik: null, satirlar: [], uyarilar: ["Başlık satırı bulunamadı: listede “Miktar”, “Birim” ve “Ürün” sütunları olmalı."], bloklar: [] };
  }
  const okunan = new Set<string>();
  const oku = (r: number, s: number) => okunan.add(`${r}:${s}`);
  const ilkBaslikSatiri = Math.min(...bloklar.map((b) => b.r));

  // Dosya basligi: ilk baslik satirindan onceki ilk dolu metin
  let baslik: string | null = null;
  for (let r = 0; r < ilkBaslikSatiri && !baslik; r++) {
    const s = izgara[r] || [];
    for (let c = 0; c < s.length; c++) { const v = hucre(s, c); if (v) { baslik = v.replace(/\s+/g, " ").slice(0, 120); break; } }
  }

  // Blok basliklari: baslik satirinin hemen ustundeki (en fazla 4 satir) metin satiri
  for (const b of bloklar) {
    for (let r = b.r - 1; r >= Math.max(0, b.r - 4); r--) {
      // Blok sutunlari + hicbir blogun sutununa dusmeyen hucreler ("GENEL IHTIYACLAR" A2, blok B'den baslar)
      const m = blokMetinleri(izgara[r], b);
      (izgara[r] || []).forEach((_, c) => {
        const v = hucre(izgara[r], c);
        if (v && (c < b.bas || c > b.son) && !bloklar.some((x) => c >= x.bas && c <= x.son)) m.push({ s: c, v });
      });
      m.sort((x, y) => x.s - y.s);
      if (!m.length) continue;
      const veriGibi = m.length >= 2 && m.some((x) => miktarCoz(x.v) !== null);
      const baskaBaslik = bloklar.some((x) => x.r === r && x.bas <= b.son && x.son >= b.bas);
      if (!veriGibi && !baskaBaslik) {
        b.ad = baslikTedarikcisi(m.map((x) => x.v).join(" "));
        m.forEach((x) => oku(r, x.s));
      }
      break;
    }
  }
  // Dosya basligi hucresi okunmus sayilir
  for (let r = 0; r < ilkBaslikSatiri; r++) { const s = izgara[r] || []; for (let c = 0; c < s.length; c++) if (hucre(s, c) && baslik && hucre(s, c).replace(/\s+/g, " ").startsWith(baslik.slice(0, 40))) oku(r, c); }

  const satirlar: ExcelSatiri[] = [];
  const blokOzeti: ExcelBlogu[] = [];
  for (const b of bloklar) {
    for (let s = b.bas; s <= b.son; s++) oku(b.r, s);
    const basliklar: string[] = [];
    for (let s = b.bas; s <= b.son; s++) basliklar[s] = k((izgara[b.r] || [])[s]);
    const sutunlar = Array.from({ length: b.son - b.bas + 1 }, (_, i) => b.bas + i);
    const veri = izgara.slice(b.r + 1, b.bitis);
    const ilk = (re: RegExp, haric: number[] = []) => sutunlar.find((s) => re.test(basliklar[s]) && !haric.includes(s)) ?? -1;
    const miktarS = ilk(/^miktar/);
    const kategoriS = ilk(/^kategori|^grup/);
    const tedarikciS = ilk(/tedarik|firma|market|nereden/);
    const notS = ilk(/^not$|^aciklama/, [tedarikciS]);
    const birimOrani = (s: number) => {
      const dolu = veri.map((r) => hucre(r, s)).filter(Boolean);
      return dolu.length ? dolu.filter((v) => birimTani(v)).length / dolu.length : 0;
    };
    const birimAdaylari = sutunlar.filter((s) => /^birim/.test(basliklar[s]));
    let birimS = -1;
    let urunS = ilk(/^urun|^malzeme|^ad$|^adi|^tanim|^aciklama urun/);
    if (birimAdaylari.length) {
      birimS = birimAdaylari.reduce((en, s) => (birimOrani(s) > birimOrani(en) ? s : en), birimAdaylari[0]);
      if (urunS < 0) {
        const diger = birimAdaylari.filter((s) => s !== birimS && birimOrani(s) < 0.5);
        if (diger.length) urunS = diger[0];
      }
    }
    if (urunS < 0) {
      const kullanilan = [miktarS, birimS, kategoriS, tedarikciS, notS];
      urunS = sutunlar.find((s) => !kullanilan.includes(s) && birimOrani(s) < 0.5 && veri.some((r) => /[a-zçğıöşü]/i.test(hucre(r, s)))) ?? -1;
    }
    const blokAdi = b.ad ? `“${b.ad}” bloğu` : `${adres(b.r, b.bas)} bloğu`;
    if (urunS < 0) { uyarilar.push(`${blokAdi}: ürün adı sütunu bulunamadı, okunmadı.`); continue; }

    let bant: string | null = null; // blok icindeki ara baslik (14.11 bant duzeni: "TAKOZLAR · 12 kalem")
    let sayac = 0;
    veri.forEach((satir, j) => {
      const r = b.r + 1 + j;
      const m = blokMetinleri(satir, b);
      if (!m.length) return; // bos satir
      const urun = hucre(satir, urunS).replace(/\s+/g, " ").slice(0, 200);
      const miktarHam = miktarS >= 0 ? (satir || [])[miktarS] : null;
      let miktar = miktarCoz(miktarHam);
      // "20 kg", "60 Adet", "500 gr": miktar ve birim ayni hucrede
      let birimEk = "";
      const bitisik = miktar === null && typeof miktarHam === "string" ? /^\s*(\d[\d.,]*)\s*([^\d\s'’].{0,20})$/.exec(miktarHam) : null;
      if (bitisik && miktarCoz(bitisik[1]) !== null) { miktar = miktarCoz(bitisik[1]); birimEk = bitisik[2].trim(); }
      const metin = m.map((x) => x.v).join(" ");
      // Ara baslik satiri: urun bos ve miktar sayi degil; ya da "Alisveris listesi" / "· n kalem" iceren tek hucre
      const araBaslik = (!urun && miktar === null)
        || (miktar === null && m.length === 1 && (/alisveris\s*listesi/.test(k(metin)) || /\d+\s*kalem\s*$/i.test(metin)));
      m.forEach((x) => oku(r, x.s));
      if (araBaslik) { bant = baslikTedarikcisi(metin); return; }
      const birimHam = (birimS >= 0 ? hucre(satir, birimS) : "") || birimEk;
      const birim = birimTani(birimHam);
      const kategoriHam = kategoriS >= 0 ? hucre(satir, kategoriS) : "";
      // Tedarikci / Not: "NOT: X" -> aciklama; digeri tedarikci. Bos ise bant / blok basligi.
      let tedarikci: string | null = null;
      let aciklama = notS >= 0 ? hucre(satir, notS) : "";
      const tHam = tedarikciS >= 0 ? hucre(satir, tedarikciS) : "";
      const notEslesme = /^\s*not\s*[:\-]\s*(.*)$/i.exec(tHam);
      if (notEslesme) aciklama = [aciklama, notEslesme[1].trim()].filter(Boolean).join(" · ");
      else if (tHam) {
        // 21.11.2026: "TAKOZLAR · Miktar yok" -> tedarikci TAKOZLAR + not "Miktar yok"
        // (not tedarikci adina yapisip ayri bir tedarikci grubu olusturuyordu)
        const ayrik = tedarikciNotAyir(tHam);
        tedarikci = ayrik.tedarikci;
        if (ayrik.not) aciklama = [aciklama, ayrik.not].filter(Boolean).join(" · ");
      }
      if (!tedarikci) tedarikci = bant || b.ad;
      let sorun: string | null = null;
      if (urun.length < 2) sorun = "Ürün adı yok";
      else if (miktar === null) sorun = `Miktar okunamadı (${String(miktarHam ?? "").trim() || "boş"})`;
      else if (!birim) sorun = birimHam ? `Bilinmeyen birim: ${birimHam}` : "Birim yok";
      satirlar.push({
        sira: r + 1, hucre: adres(r, urunS), urun, miktar, birim, birimHam, kategori: kategoriTani(kategoriHam), kategoriHam,
        tedarikci, aciklama: aciklama.slice(0, 500), sorun, blok: b.ad,
      });
      sayac++;
    });
    if (birimS < 0 && satirlar.slice(satirlar.length - sayac).some((x) => !x.birim)) uyarilar.push(`${blokAdi}: birim sütunu bulunamadı; birimi olmayan satırlarda birimi seçin.`);
    blokOzeti.push({ ad: b.ad, hucre: adres(b.r, b.bas), kalem: sayac });
  }

  // Hicbir bloga girmeyen dolu hucreler: SESSIZCE ATLANMAZ
  const disarida: string[] = [];
  izgara.forEach((satir, r) => (satir || []).forEach((_, s) => {
    const v = hucre(satir, s);
    if (v && !okunan.has(`${r}:${s}`)) disarida.push(`${adres(r, s)} “${v.length > 30 ? `${v.slice(0, 30)}…` : v}”`);
  }));
  if (disarida.length) {
    uyarilar.push(`${disarida.length} hücre hiçbir listeye ait olmadığı için okunmadı: ${disarida.slice(0, 4).join(", ")}${disarida.length > 4 ? "…" : ""}. Bu kalemler gerekiyorsa üstüne “Miktar · Birim · Ürün” başlığı ekleyin ya da elle girin.`);
  }
  if (!satirlar.length) uyarilar.push("Listede kalem bulunamadı.");
  return { baslik, satirlar, uyarilar, bloklar: blokOzeti };
}

// ---------------------------------------------------------------------------
// XLSX -> izgara (ilk sayfa). jszip + duzenli ifade (DOMParser yok; Node'da da calisir).
// ---------------------------------------------------------------------------
const AZAMI_BOYUT = 10 * 1024 * 1024;

const xmlCoz = (s: string) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, "&");

/** <si> ya da <is> icindeki tum <t> metinleri (zengin metin parcalari birlesir). */
const metinTopla = (xml: string) => Array.from(xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)).map((m) => xmlCoz(m[1])).join("");

const sutunNo = (ref: string) => {
  const harf = /^([A-Z]+)/.exec(ref)?.[1] || "A";
  return harf.split("").reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;
};

export type XlsxOkuma = { izgara: unknown[][]; sayfa: string; digerDoluSayfalar: string[] };

/** Ilk sayfanin izgarasi + dolu olan diger sayfalarin adlari (sessizce atlanmasin diye). */
export async function xlsxOku(veri: ArrayBuffer | Uint8Array): Promise<XlsxOkuma> {
  const zip = await JSZip.loadAsync(veri);
  const oku = (yol: string): Promise<string | null> => zip.file(yol)?.async("string") ?? Promise.resolve(null);
  const wb = await oku("xl/workbook.xml");
  const rels = await oku("xl/_rels/workbook.xml.rels");
  const sayfalar = wb ? Array.from(wb.matchAll(/<sheet\b([^>]*)\/?>/g)).map((m) => ({
    ad: xmlCoz(/\bname="([^"]*)"/.exec(m[1])?.[1] || ""),
    rid: /\br:id="([^"]+)"/.exec(m[1])?.[1],
  })) : [];
  const yolu = (rid: string | undefined) => {
    if (!rid || !rels) return null;
    const hedef = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
      ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1];
    return hedef ? (hedef.startsWith("/") ? hedef.slice(1) : `xl/${hedef.replace(/^\.\//, "")}`) : null;
  };
  const sayfaYolu = yolu(sayfalar[0]?.rid) || "xl/worksheets/sheet1.xml";
  const sayfa = await oku(sayfaYolu);
  if (!sayfa) throw new Error("Excel sayfası okunamadı.");
  const digerDoluSayfalar: string[] = [];
  for (const d of sayfalar.slice(1)) {
    const y = yolu(d.rid);
    const xml = y ? await oku(y) : null;
    if (xml && /<v>[^<]|<is>/.test(xml)) digerDoluSayfalar.push(d.ad || "?");
  }
  const ortakXml = await oku("xl/sharedStrings.xml");
  const ortak = ortakXml ? Array.from(ortakXml.matchAll(/<si>([\s\S]*?)<\/si>/g)).map((m) => metinTopla(m[1])) : [];

  const izgara: unknown[][] = [];
  for (const satir of Array.from(sayfa.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g))) {
    const rNo = Number(/\br="(\d+)"/.exec(satir[1])?.[1] || izgara.length + 1) - 1;
    const hucreler: unknown[] = [];
    for (const c of Array.from(satir[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g))) {
      const nit = c[1];
      const ic = c[2] || "";
      const ref = /\br="([A-Z]+\d+)"/.exec(nit)?.[1];
      const s = ref ? sutunNo(ref) : hucreler.length;
      const tur = /\bt="([^"]+)"/.exec(nit)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(ic)?.[1];
      let deger: unknown = null;
      if (tur === "s") deger = v != null ? ortak[Number(v)] ?? null : null;
      else if (tur === "inlineStr") deger = metinTopla(ic);
      else if (tur === "str" || tur === "e") deger = v != null ? xmlCoz(v) : null;
      else if (tur === "b") deger = v === "1";
      else if (v != null) deger = Number.isFinite(Number(v)) ? Number(v) : xmlCoz(v);
      hucreler[s] = deger;
    }
    izgara[rNo] = Array.from({ length: hucreler.length }, (_, i) => hucreler[i] ?? null);
  }
  return { izgara: Array.from({ length: izgara.length }, (_, i) => izgara[i] ?? []), sayfa: sayfalar[0]?.ad || "", digerDoluSayfalar };
}

/** Geriye uyum: yalniz ilk sayfanin izgarasi. */
export async function xlsxIzgara(veri: ArrayBuffer | Uint8Array): Promise<unknown[][]> {
  return (await xlsxOku(veri)).izgara;
}

/** Tarayicida secilen dosya -> alisveris listesi. */
export async function excelDosyasiOku(dosya: File): Promise<ExcelSonucu> {
  if (!/\.xlsx$/i.test(dosya.name)) throw new Error("Yalnızca .xlsx dosyası yüklenebilir (Excel'de “Farklı kaydet → Excel Çalışma Kitabı”).");
  if (dosya.size > AZAMI_BOYUT) throw new Error("Dosya 10 MB'dan büyük.");
  let o: XlsxOkuma;
  try { o = await xlsxOku(await dosya.arrayBuffer()); }
  catch { throw new Error("Excel dosyası okunamadı. Dosyanın bozuk olmadığından emin olun."); }
  const sonuc = alisverisListesiCoz(o.izgara);
  if (o.digerDoluSayfalar.length) {
    sonuc.uyarilar.push(`Dosyada başka dolu sayfa var (${o.digerDoluSayfalar.map((a) => `“${a}”`).join(", ")}); yalnız ilk sayfa${o.sayfa ? ` “${o.sayfa}”` : ""} okundu.`);
  }
  return sonuc;
}
