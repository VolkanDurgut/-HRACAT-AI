/**
 * lib/xlsx-oku.ts — Genel .xlsx / .xlsm okuyucu, TARAYICIDA (10.11.2026).
 * lib/etd-excel.ts ile ayni yontem (jszip + DOMParser): makrolar CALISTIRILMAZ, dosya
 * sunucuya yuklenmez; yalniz hucre degerleri okunur. Sayfalar calisma kitabindaki sirayla doner.
 * etd-excel.ts'e dokunulmadi (calisan akisi bozmamak icin); yeni okuyucular bunu kullanir.
 */

export type HucreDegeri = string | number | null;
/** satirlar[i] = Excel'deki (i+1). satir; satirlar[i][j] = j. sutun (A=0). Bos satirlar [] olur. */
export type XlsxSayfasi = { ad: string; satirlar: HucreDegeri[][] };

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

function metinIcerik(el: Element): string {
  return elemanlar(el, "t").filter((t) => !(t.parentElement && t.parentElement.localName === "rPh")).map((t) => t.textContent || "").join("");
}

export async function xlsxSayfalariOku(dosya: File | Blob): Promise<XlsxSayfasi[]> {
  if (dosya.size > ENBUYUK_BOYUT) throw new Error("Dosya 15 MB'tan büyük.");
  const JSZip = (await import("jszip")).default;
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(await dosya.arrayBuffer());
  } catch {
    throw new Error("Dosya okunamadı. Lütfen .xlsx veya .xlsm Excel dosyası seçin.");
  }
  const oku = async (yol: string) => zip.file(yol)?.async("string") ?? null;
  const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");

  const wbMetin = await oku("xl/workbook.xml");
  const relMetin = await oku("xl/_rels/workbook.xml.rels");
  if (!wbMetin || !relMetin) throw new Error("Bu dosya bir Excel çalışma kitabı değil.");

  const rels = new Map<string, string>();
  for (const r of elemanlar(xml(relMetin), "Relationship")) {
    const hedef = (r.getAttribute("Target") || "").replace(/^\/?xl\//, "").replace(/^\//, "");
    rels.set(r.getAttribute("Id") || "", hedef);
  }

  const paylasilan: string[] = [];
  const ssMetin = await oku("xl/sharedStrings.xml");
  if (ssMetin) for (const si of elemanlar(xml(ssMetin), "si")) paylasilan.push(metinIcerik(si));

  const sonuc: XlsxSayfasi[] = [];
  for (const s of elemanlar(xml(wbMetin), "sheet")) {
    const ad = (s.getAttribute("name") || "").trim();
    const rid = s.getAttribute("r:id") || s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || "";
    const yol = rels.get(rid);
    const shMetin = yol ? await oku(`xl/${yol}`) : null;
    if (!shMetin) continue;
    const satirlar: HucreDegeri[][] = [];
    for (const row of elemanlar(xml(shMetin), "row")) {
      const no = Number(row.getAttribute("r"));
      if (!Number.isFinite(no) || no < 1 || no > 100000) continue;
      const hucreler: HucreDegeri[] = [];
      for (const c of elemanlar(row, "c")) {
        const t = c.getAttribute("t") || "n";
        const v = elemanlar(c, "v")[0]?.textContent ?? null;
        let deger: HucreDegeri = null;
        if (t === "s") deger = v !== null ? paylasilan[Number(v)] ?? null : null;
        else if (t === "inlineStr") deger = metinIcerik(c);
        else if (t === "str" || t === "e") deger = v;
        else if (t === "b") deger = v === "1" ? "TRUE" : "FALSE";
        else deger = v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
        const sutun = sutunNo(c.getAttribute("r") || "");
        if (sutun >= 0 && sutun < 200) hucreler[sutun] = deger;
      }
      while (satirlar.length < no - 1) satirlar.push([]);
      satirlar[no - 1] = hucreler;
    }
    sonuc.push({ ad, satirlar });
  }
  if (sonuc.length === 0) throw new Error("Excel'de okunabilir sayfa bulunamadı.");
  return sonuc;
}
