/**
 * En kucuk .xlsx yazici - SAF cekirdek (11.11.2026'da lib/xlsx-yaz.ts'den tasindi; web ve edge (siparis-rapor) ORTAK).
 * Bagimlilik yok: Office Open XML parcalarini uretir, zip'leme cagirana kalir.
 */
/** Stil kimlikleri (styles.xml cellXfs sirasi ile AYNI). */
export const XS = {
  varsayilan: 0,
  baslik: 1,
  tabloBaslik: 2,
  metin: 3,
  tamSayi: 4,
  ondalik: 5,
  tarih: 6,
  metinYesil: 7,
  tamSayiYesil: 8,
  ondalikYesil: 9,
  tarihYesil: 10,
  not: 11,
  toplamMetin: 12,
  toplamTamSayi: 13,
  toplamOndalik: 14,
  // Navlun tablosu (11.11.2026): acente bloklari sirayla A / B dolgu (operasyonun tablosundaki gibi)
  navBlokA: 15,
  navBlokB: 16,
  navAyA: 17,
  navAyB: 18,
  navTutarA: 19,
  navTutarB: 20,
  navOrtaA: 21,
  navOrtaB: 22,
  navGercekA: 23,
  navGercekB: 24,
  navHedef: 25,
  navBaslik: 26,
  sayfaBasligi: 27,
  // 23.11.2026 (operasyon tablosuyla karsilastirma: Evergreen 340 / ZIM 2964 cikis lokali HARIC): "$340 +lokal" turuncu italik
  navLokalHaricA: 28,
  navLokalHaricB: 29,
} as const;

export type XlsxHucre = { v: string | number | Date | null | undefined; s?: number };
export type XlsxSayfa = {
  ad: string;
  sutunGenislik?: number[];
  satirlar: (XlsxHucre | null)[][];
  /** "A1:N1" gibi */
  birlestir?: string[];
  /** Dondurulan ilk serbest hucre ("D4" -> A:C sutunlari ve 1-3 satirlari sabit) */
  dondur?: string;
  /**
   * 23.11.2026 (kullanici: "Excel tablo halinde; ilk kaldigi yer karsilamali; basliklar gorunmeli"):
   * filtre: Excel filtre dugmeleri ("A1:P200"); baslangic: dosya acildiginda gorunen / secili ilk hucre ("A152");
   * yazdirBaslik: her basili sayfada tekrarlanan satirlar ("1:1").
   */
  filtre?: string;
  baslangic?: string;
  yazdirBaslik?: string;
};

/** XML 1.0'da gecersiz kontrol karakterlerini atar (TAB, LF, CR kalir). */
const xmlTemiz = (s: string) => Array.from(s).filter((ch) => { const k = ch.charCodeAt(0); return k >= 32 || k === 9 || k === 10 || k === 13; }).join("");
export const kacis = (s: string) => xmlTemiz(s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"));

export function sutunHarfi(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** JS Date (veya "YYYY-MM-DD") -> Excel seri gunu (1900 sistemi, saat dilimi etkisiz). */
export function excelGunu(d: Date | string): number {
  if (typeof d === "string") {
    const [y, m, g] = d.slice(0, 10).split("-").map(Number);
    return (Date.UTC(y, m - 1, g) - Date.UTC(1899, 11, 30)) / 86400000;
  }
  return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;
}

/** Excel sayfa adi: en fazla 31 karakter, : \ / ? * [ ] yok. */
export function sayfaAdi(ad: string): string {
  return (ad.replace(/[:\\/?*[\]]/g, "-").trim() || "Sayfa").slice(0, 31);
}

export function sayfaXml(s: XlsxSayfa): string {
  const cols = s.sutunGenislik?.length
    ? `<cols>${s.sutunGenislik.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const rows = s.satirlar.map((satir, r) => {
    const hucreler = satir.map((h, c) => {
      if (!h) return "";
      const ref = `${sutunHarfi(c)}${r + 1}`;
      const st = h.s ?? 0;
      const v = h.v;
      if (v === null || v === undefined || v === "") return st ? `<c r="${ref}" s="${st}"/>` : "";
      if (v instanceof Date) return `<c r="${ref}" s="${st}"><v>${excelGunu(v)}</v></c>`;
      if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}" s="${st}"><v>${v}</v></c>` : `<c r="${ref}" s="${st}"/>`;
      return `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${kacis(String(v))}</t></is></c>`;
    }).join("");
    return `<row r="${r + 1}">${hucreler}</row>`;
  }).join("");
  const dm = s.dondur ? s.dondur.match(/^([A-Z]+)(\d+)$/) : null;
  const xSplit = dm ? dm[1].split("").reduce((t, h) => t * 26 + h.charCodeAt(0) - 64, 0) - 1 : 0;
  const ySplit = dm ? Number(dm[2]) - 1 : 0;
  // Acilis yeri: dondurulmus bolmede alt bolmenin ilk gorunen hucresi; donmamis sayfada sayfanin sol ust hucresi
  const bm = s.baslangic ? s.baslangic.match(/^([A-Z]+)(\d+)$/) : null;
  const basSatir = bm ? Math.max(Number(bm[2]), ySplit + 1) : 0;
  const ustSol = dm ? `${dm[1]}${bm ? basSatir : dm[2]}` : null;
  const aktifBolme = xSplit && ySplit ? "bottomRight" : xSplit ? "topRight" : "bottomLeft";
  const secim = bm ? `<selection${dm && (xSplit > 0 || ySplit > 0) ? ` pane="${aktifBolme}"` : ""} activeCell="${bm[1]}${basSatir}" sqref="${bm[1]}${basSatir}"/>` : "";
  const pane = dm && (xSplit > 0 || ySplit > 0)
    ? `<pane${xSplit ? ` xSplit="${xSplit}"` : ""}${ySplit ? ` ySplit="${ySplit}"` : ""} topLeftCell="${ustSol}" activePane="${aktifBolme}" state="frozen"/>`
    : "";
  const gorunum = `${pane}${secim}`;
  const viewUst = !pane && bm ? ` topLeftCell="${bm[1]}${basSatir}"` : "";
  const filtre = s.filtre && /^[A-Z]+\d+:[A-Z]+\d+$/.test(s.filtre) ? `<autoFilter ref="${s.filtre}"/>` : "";
  const merge = s.birlestir?.length ? `<mergeCells count="${s.birlestir.length}">${s.birlestir.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0" zoomScale="90" zoomScaleNormal="90"${viewUst}${gorunum ? `>${gorunum}</sheetView>` : "/>"}</sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>${filtre}${merge}<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

export const STIL_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="5"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0.00##"/><numFmt numFmtId="166" formatCode="dd\\.mm\\.yyyy"/><numFmt numFmtId="167" formatCode="&quot;$&quot;#,##0"/><numFmt numFmtId="168" formatCode="&quot;$&quot;#,##0&quot; +lokal&quot;"/></numFmts>
<fonts count="7"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="12"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font><font><i/><sz val="9"/><color rgb="FF555555"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FF047857"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF283474"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FFC2410C"/><name val="Calibri"/></font></fonts>
<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF92D050"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF808080"/></left><right style="thin"><color rgb="FF808080"/></right><top style="thin"><color rgb="FF808080"/></top><bottom style="thin"><color rgb="FF808080"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="30">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="165" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="166" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="164" fontId="2" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="165" fontId="2" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="167" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="167" fontId="0" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="167" fontId="4" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="167" fontId="4" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="167" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="168" fontId="6" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="168" fontId="6" fillId="6" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;


/** Filtre ve yazdirma basligi icin Excel'in gizli tanimli adlari (filtre dugmeleri ve basliklarin her sayfada basilmasi). */
function tanimliAdlar(sayfalar: XlsxSayfa[], adlar: string[]): string {
  const mutlak = (ref: string) => ref.split(":").map((x) => x.replace(/^([A-Z]+)(\d+)$/, "$$$1$$$2")).join(":");
  const tirnak = (ad: string) => `'${ad.replace(/'/g, "''")}'`;
  const liste: string[] = [];
  sayfalar.forEach((s, i) => {
    if (s.filtre && /^[A-Z]+\d+:[A-Z]+\d+$/.test(s.filtre)) liste.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${kacis(`${tirnak(adlar[i])}!${mutlak(s.filtre)}`)}</definedName>`);
    const yb = s.yazdirBaslik?.match(/^(\d+):(\d+)$/);
    if (yb) liste.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${kacis(`${tirnak(adlar[i])}!$${yb[1]}:$${yb[2]}`)}</definedName>`);
  });
  return liste.length ? `<definedNames>${liste.join("")}</definedNames>` : "";
}

/** .xlsx paketinin dosyalari (yol + icerik). Paketleme (zip) cagirana kalir: web'de jszip, edge'de npm:jszip. */
export function xlsxParcalari(sayfalar: XlsxSayfa[]): { yol: string; icerik: string }[] {
  const adlar = sayfalar.map((s) => sayfaAdi(s.ad));
  const p: { yol: string; icerik: string }[] = [];
  const file = (yol: string, icerik: string) => p.push({ yol, icerik });
  file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${adlar.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${adlar.map((a, i) => `<sheet name="${kacis(a)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${tanimliAdlar(sayfalar, adlar)}</workbook>`);
  file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${adlar.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${adlar.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  file("xl/styles.xml", STIL_XML);
  sayfalar.forEach((s, i) => file(`xl/worksheets/sheet${i + 1}.xml`, sayfaXml(s)));
  return p;
}
