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
  urun: string;
  miktar: number | null;
  birim: Birim | null;
  birimHam: string;
  kategori: Kategori;
  kategoriHam: string;
  tedarikci: string | null;
  aciklama: string;
  sorun: string | null;
};

export type ExcelSonucu = { baslik: string | null; satirlar: ExcelSatiri[]; uyarilar: string[] };

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
  diger: "diger",
};

/** "Kg", "KG.", "kilo" -> "kg"; bilinmiyorsa null. */
export function birimTani(ham: unknown): Birim | null {
  const a = k(ham).replace(/\s+/g, "");
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

const hucre = (r: unknown[], i: number) => (i >= 0 && i < r.length && r[i] != null ? String(r[i]).trim() : "");

/** Izgaradan (satir x sutun, ham degerler) alisveris listesi kalemleri. */
export function alisverisListesiCoz(izgara: unknown[][]): ExcelSonucu {
  const uyarilar: string[] = [];
  // Baslik satiri: "Miktar" iceren ilk satir (ilk 15 satirda)
  let bas = -1;
  for (let i = 0; i < Math.min(izgara.length, 15); i++) {
    if ((izgara[i] || []).some((c) => /^miktar/.test(k(c)))) { bas = i; break; }
  }
  if (bas < 0) return { baslik: null, satirlar: [], uyarilar: ["Başlık satırı bulunamadı: listede “Miktar” sütunu olmalı."] };
  const baslik = izgara.slice(0, bas).flat().map((c) => String(c ?? "").trim()).find((c) => c) || null;
  const basliklar = (izgara[bas] || []).map((c) => k(c));
  const veri = izgara.slice(bas + 1);

  const ilk = (re: RegExp, haric: number[] = []) => basliklar.findIndex((b, i) => re.test(b) && !haric.includes(i));
  const miktarS = ilk(/^miktar/);
  const kategoriS = ilk(/^kategori|^grup/);
  const tedarikciS = ilk(/tedarik|firma|market|nereden/);
  const notS = ilk(/^not$|^aciklama/, [tedarikciS]);
  // Birim / urun: adayi "birim" basliklilar + "urun/malzeme/ad" basliklilar
  const birimAdaylari = basliklar.map((b, i) => (/^birim/.test(b) ? i : -1)).filter((i) => i >= 0);
  const birimOrani = (s: number) => {
    const dolu = veri.map((r) => hucre(r || [], s)).filter(Boolean);
    return dolu.length ? dolu.filter((v) => birimTani(v)).length / dolu.length : 0;
  };
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
    // Basliksiz urun sutunu: metin agirlikli, birim olmayan ilk sutun
    const kullanilan = [miktarS, birimS, kategoriS, tedarikciS, notS];
    urunS = basliklar.findIndex((_, s) => !kullanilan.includes(s) && birimOrani(s) < 0.5 && veri.some((r) => /[a-zçğıöşü]/i.test(hucre(r || [], s))));
  }
  if (urunS < 0) return { baslik, satirlar: [], uyarilar: ["Ürün adı sütunu bulunamadı."] };
  if (birimS < 0) uyarilar.push("Birim sütunu bulunamadı; her satırda birimi seçin.");

  const satirlar: ExcelSatiri[] = [];
  veri.forEach((r, j) => {
    const satir = r || [];
    const urun = hucre(satir, urunS).replace(/\s+/g, " ").slice(0, 200);
    const miktarHam = miktarS >= 0 ? satir[miktarS] : null;
    if (!urun && (miktarHam == null || String(miktarHam).trim() === "")) return; // bos satir
    const birimHam = birimS >= 0 ? hucre(satir, birimS) : "";
    const miktar = miktarCoz(miktarHam);
    const birim = birimTani(birimHam);
    const kategoriHam = kategoriS >= 0 ? hucre(satir, kategoriS) : "";
    // Tedarikci / Not: "NOT: X" -> aciklama; digeri tedarikci
    let tedarikci: string | null = null;
    let aciklama = notS >= 0 ? hucre(satir, notS) : "";
    const tHam = tedarikciS >= 0 ? hucre(satir, tedarikciS) : "";
    const notEslesme = /^\s*not\s*[:\-]\s*(.*)$/i.exec(tHam);
    if (notEslesme) aciklama = [aciklama, notEslesme[1].trim()].filter(Boolean).join(" · ");
    else if (tHam) tedarikci = tedarikciDuzelt(tHam);
    let sorun: string | null = null;
    if (urun.length < 2) sorun = "Ürün adı yok";
    else if (miktar === null) sorun = `Miktar okunamadı (${String(miktarHam ?? "boş")})`;
    else if (!birim) sorun = birimHam ? `Bilinmeyen birim: ${birimHam}` : "Birim yok";
    satirlar.push({
      sira: bas + j + 2, urun, miktar, birim, birimHam, kategori: kategoriTani(kategoriHam), kategoriHam,
      tedarikci, aciklama: aciklama.slice(0, 500), sorun,
    });
  });
  if (!satirlar.length) uyarilar.push("Listede kalem bulunamadı.");
  return { baslik, satirlar, uyarilar };
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

export async function xlsxIzgara(veri: ArrayBuffer | Uint8Array): Promise<unknown[][]> {
  const zip = await JSZip.loadAsync(veri);
  const oku = (yol: string) => zip.file(yol)?.async("string") ?? Promise.resolve(null);
  // Ilk sayfanin yolu: workbook.xml -> rels
  let sayfaYolu = "xl/worksheets/sheet1.xml";
  const wb = await oku("xl/workbook.xml");
  const rels = await oku("xl/_rels/workbook.xml.rels");
  const rid = wb ? /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1] : undefined;
  if (rid && rels) {
    const hedef = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
      ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1];
    if (hedef) sayfaYolu = hedef.startsWith("/") ? hedef.slice(1) : `xl/${hedef.replace(/^\.\//, "")}`;
  }
  const sayfa = await oku(sayfaYolu);
  if (!sayfa) throw new Error("Excel sayfası okunamadı.");
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
  return Array.from({ length: izgara.length }, (_, i) => izgara[i] ?? []);
}

/** Tarayicida secilen dosya -> alisveris listesi. */
export async function excelDosyasiOku(dosya: File): Promise<ExcelSonucu> {
  if (!/\.xlsx$/i.test(dosya.name)) throw new Error("Yalnızca .xlsx dosyası yüklenebilir (Excel'de “Farklı kaydet → Excel Çalışma Kitabı”).");
  if (dosya.size > AZAMI_BOYUT) throw new Error("Dosya 10 MB'dan büyük.");
  let izgara: unknown[][];
  try { izgara = await xlsxIzgara(await dosya.arrayBuffer()); }
  catch { throw new Error("Excel dosyası okunamadı. Dosyanın bozuk olmadığından emin olun."); }
  return alisverisListesiCoz(izgara);
}
