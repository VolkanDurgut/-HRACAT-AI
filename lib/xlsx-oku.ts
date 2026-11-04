/**
 * Kucuk .xlsx okuyucu - TUM SAYFALAR (04.11.2026, DIIB Excel'i icin).
 * lib/satin-alma/excel.ts'deki xlsxIzgara ile ayni yontem (jszip + duzenli ifade; formul
 * hucrelerinde Excel'in KAYDETTIGI son deger <v> okunur). Satin alma okuyucusu bilerek
 * DEGISTIRILMEDI (calisan akis bozulmasin).
 */
import JSZip from "jszip";

const xmlCoz = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
const metinTopla = (xml: string) => Array.from(xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)).map((m) => xmlCoz(m[1])).join("");
const sutunNo = (ref: string) => {
  const harf = /^([A-Z]+)/.exec(ref)?.[1] || "A";
  return harf.split("").reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;
};

export type XlsxSayfasi = { ad: string; izgara: unknown[][] };

function izgaraCoz(sayfa: string, ortak: string[]): unknown[][] {
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

export async function xlsxSayfalari(veri: ArrayBuffer | Uint8Array): Promise<XlsxSayfasi[]> {
  const zip = await JSZip.loadAsync(veri);
  const oku = (yol: string) => zip.file(yol)?.async("string") ?? Promise.resolve(null);
  const wb = await oku("xl/workbook.xml");
  const rels = (await oku("xl/_rels/workbook.xml.rels")) || "";
  if (!wb) throw new Error("Excel çalışma kitabı okunamadı.");
  const ortakXml = await oku("xl/sharedStrings.xml");
  const ortak = ortakXml ? Array.from(ortakXml.matchAll(/<si>([\s\S]*?)<\/si>/g)).map((m) => metinTopla(m[1])) : [];
  const sonuc: XlsxSayfasi[] = [];
  for (const m of Array.from(wb.matchAll(/<sheet\b([^>]*)\/?>/g))) {
    const ad = xmlCoz(/\bname="([^"]*)"/.exec(m[1])?.[1] || "");
    const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1];
    if (!rid) continue;
    const hedef = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
      ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(rels)?.[1];
    if (!hedef) continue;
    const yol = hedef.startsWith("/") ? hedef.slice(1) : `xl/${hedef.replace(/^\.\//, "")}`;
    const xml = await oku(yol);
    if (xml) sonuc.push({ ad, izgara: izgaraCoz(xml, ortak) });
  }
  return sonuc;
}

/** Excel tarih seri numarasi (1900 sistemi) ya da "dd.mm.yyyy" -> "yyyy-mm-dd". */
export function excelTarihi(d: unknown): string | null {
  if (typeof d === "number" && d > 20000 && d < 80000) {
    const t = new Date(Date.UTC(1899, 11, 30) + Math.round(d) * 86400000);
    return t.toISOString().slice(0, 10);
  }
  const m = /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(String(d ?? ""));
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ""));
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}
