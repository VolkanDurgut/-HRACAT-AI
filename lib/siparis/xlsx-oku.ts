/**
 * lib/siparis/xlsx-oku.ts — Excel (.xlsx / .xlsm) dosyasini TARAYICIDA ham hucrelere cevirir (11.11.2026).
 * Dosya sunucuya yuklenmez; makro calismaz; yalniz hucre degerleri (formullerin kayitli sonucu) ve istenirse
 * hucre dolgu rengi okunur. Yukleme plani ve siparis listesi aktarimi ortak kullanir.
 */

export type HucreDegeri = string | number | null;
/** Bir sayfanin satirlari: [excel satir no, hucreler (0 = A sutunu), satirin A hucresinin dolgu rengi (RRGGBB / null)] */
export type HamSatir = [number, HucreDegeri[], string | null];
export type HamSayfa = { ad: string; satirlar: HamSatir[] };

const ENBUYUK_BOYUT = 15 * 1024 * 1024;

function sutunNo(ref: string): number {
  const harf = (ref.match(/^[A-Z]+/) || [""])[0];
  let n = 0;
  for (const c of harf) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}
function elemanlar(kok: Document | Element, ad: string): Element[] {
  return Array.from(kok.getElementsByTagNameNS("*", ad));
}
function cocuk(el: Element, ad: string): Element | null {
  return Array.from(el.children).find((c) => c.localName === ad) || null;
}
function metinIcerik(el: Element): string {
  return elemanlar(el, "t").filter((t) => !(t.parentElement && t.parentElement.localName === "rPh")).map((t) => t.textContent || "").join("");
}

/** Excel'in varsayilan tema renkleri (Office): tema dolgusu rengi tahmini icin */
const TEMA = ["FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47"];

export async function xlsxHamOku(dosya: File | Blob, secenek: { sayfa: (ad: string) => boolean; sutun?: number; renk?: boolean; mantiksal?: boolean }): Promise<HamSayfa[]> {
  if (dosya.size > ENBUYUK_BOYUT) throw new Error("Dosya 15 MB'tan büyük.");
  const JSZip = (await import("jszip")).default;
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try { zip = await JSZip.loadAsync(await dosya.arrayBuffer()); }
  catch { throw new Error("Dosya okunamadı. Lütfen .xlsx veya .xlsm Excel dosyası seçin."); }
  const oku = async (yol: string) => zip.file(yol)?.async("string") ?? null;
  const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");
  const wbMetin = await oku("xl/workbook.xml");
  const relMetin = await oku("xl/_rels/workbook.xml.rels");
  if (!wbMetin || !relMetin) throw new Error("Bu dosya bir Excel çalışma kitabı değil.");
  const rels = new Map<string, string>();
  for (const r of elemanlar(xml(relMetin), "Relationship")) rels.set(r.getAttribute("Id") || "", (r.getAttribute("Target") || "").replace(/^\/?xl\//, "").replace(/^\//, ""));
  const paylasilan: string[] = [];
  const ssMetin = await oku("xl/sharedStrings.xml");
  if (ssMetin) for (const si of elemanlar(xml(ssMetin), "si")) paylasilan.push(metinIcerik(si));

  // Stil -> dolgu rengi (yalniz istenirse)
  const stilRengi: (string | null)[] = [];
  if (secenek.renk) {
    const stMetin = await oku("xl/styles.xml");
    if (stMetin) {
      const st = xml(stMetin);
      const dolgular: (string | null)[] = [];
      const fills = elemanlar(st, "fills")[0];
      if (fills) for (const f of Array.from(fills.children)) {
        const p = cocuk(f, "patternFill");
        const fg = p && p.getAttribute("patternType") === "solid" ? cocuk(p, "fgColor") : null;
        let renk: string | null = null;
        if (fg?.getAttribute("rgb")) renk = (fg.getAttribute("rgb") || "").slice(-6).toUpperCase();
        else if (fg?.getAttribute("theme")) renk = TEMA[Number(fg.getAttribute("theme"))] ?? null;
        dolgular.push(renk);
      }
      const xfs = elemanlar(st, "cellXfs")[0];
      if (xfs) for (const xf of Array.from(xfs.children)) stilRengi.push(dolgular[Number(xf.getAttribute("fillId") || 0)] ?? null);
    }
  }

  const enCok = secenek.sutun ?? 20;
  const sayfalar: HamSayfa[] = [];
  for (const s of elemanlar(xml(wbMetin), "sheet")) {
    const ad = (s.getAttribute("name") || "").trim();
    if (!secenek.sayfa(ad)) continue;
    const rid = s.getAttribute("r:id") || s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || "";
    const yol = rels.get(rid);
    const sh = yol ? await oku(`xl/${yol}`) : null;
    if (!sh) continue;
    const satirlar: HamSatir[] = [];
    for (const row of elemanlar(xml(sh), "row")) {
      const no = Number(row.getAttribute("r"));
      const hucreler: HucreDegeri[] = [];
      let dolu = false;
      let renk: string | null = null;
      for (const c of elemanlar(row, "c")) {
        const i = sutunNo(c.getAttribute("r") || "");
        if (i < 0 || i >= enCok) continue;
        if (i === 0 && secenek.renk) renk = stilRengi[Number(c.getAttribute("s") || 0)] ?? null;
        const t = c.getAttribute("t") || "n";
        const v = elemanlar(c, "v")[0]?.textContent ?? null;
        let d: HucreDegeri = null;
        if (t === "s") d = v !== null ? paylasilan[Number(v)] ?? null : null;
        else if (t === "inlineStr") d = metinIcerik(c);
        else if (t === "str") d = v;
        // 21.11.2026: onay kutusu / DOGRU-YANLIS hucresi ("Ön Ödeme" sutunu) istenirse "TRUE" / "FALSE"
        else if (t === "b") d = secenek.mantiksal && v !== null ? (v === "1" ? "TRUE" : "FALSE") : null;
        else if (t === "e") d = null;
        else d = v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
        if (d !== null && d !== "") dolu = true;
        hucreler[i] = d;
      }
      if (dolu) satirlar.push([no, hucreler, renk]);
    }
    satirlar.sort((a, b) => a[0] - b[0]);
    sayfalar.push({ ad, satirlar });
  }
  return sayfalar;
}

export function baslikAnahtari(s: string): string {
  return s
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ö/g, "O").replace(/Ç/g, "C")
    .replace(/[^A-Z0-9]/g, "");
}
