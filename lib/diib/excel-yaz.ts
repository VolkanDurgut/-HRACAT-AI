/**
 * DIIB takibini Burak Bey'in Excel BICIMINDE disari verir (04.11.2026). Saf modul (jszip).
 * Kullanici: "Sistem bunu kendi takip etmeli ve ayni formu doldurabilmeli." Veri sistemden gelir;
 * Excel'den iceri hicbir sey ALINMAZ. Sayfalar: GENEL TABLO + her DIIB icin "2026 D2-04219"
 * (IHRACAT bolumu: FATURA NO | BEYANNAME NO | FT TARIHI | CARI UNVANI | STOK ADI | MIKTAR |
 * BIRIM FIYAT | TUTARI; altinda GERCEKLESEN / ONGORULEN / KALAN IHRACAT). Ithalat kismi YOK.
 */
import JSZip from "jszip";
import { sayiOku } from "@/lib/sayi-oku";
import type { DiibOzeti, DiibSatiri } from "@/lib/diib/hesap";

type Hucre = { v: string | number | null; s?: number };
const S = { metin: 0, baslik: 1, tarih: 2, kg: 3, fiyat: 4, para: 5, kgKalin: 6, paraKalin: 7 } as const;

const kacis = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sutun = (i: number) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
/** "yyyy-mm-dd" -> Excel tarih seri numarasi */
const tarihSeri = (iso: string) => {
  const [y, a, g] = iso.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(y, a - 1, g) - Date.UTC(1899, 11, 30)) / 86400000);
};

function sayfaXml(satirlar: (Hucre | null)[][], genislikler: number[]): string {
  const rows = satirlar.map((r, ri) => {
    const cells = r.map((h, ci) => {
      if (!h || h.v === null || h.v === "") return "";
      const ref = `${sutun(ci)}${ri + 1}`;
      const st = h.s ? ` s="${h.s}"` : "";
      if (typeof h.v === "number") return `<c r="${ref}"${st}><v>${h.v}</v></c>`;
      return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${kacis(h.v)}</t></is></c>`;
    }).join("");
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join("");
  const cols = genislikler.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>`;
}

const STILLER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.000##"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EBF2"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Excel sayfa adi: / \ ? * [ ] : yok, en fazla 31 karakter, tekil. */
function sayfaAdi(ad: string, kullanilan: Set<string>): string {
  let a = ad.replace(/[/\\?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "DIIB";
  let n = 2;
  const kok = a;
  while (kullanilan.has(a.toLocaleUpperCase("tr-TR"))) a = `${kok.slice(0, 28)} ${n++}`;
  kullanilan.add(a.toLocaleUpperCase("tr-TR"));
  return a;
}

export async function diibExcelOlustur(ozetler: DiibOzeti[], satirlar: DiibSatiri[]): Promise<Blob> {
  const kullanilan = new Set<string>(["GENEL TABLO"]);
  const sayfalar: { ad: string; xml: string }[] = [];
  const T = (v: string | number | null, s: number = S.metin): Hucre => ({ v, s });

  // GENEL TABLO
  const genel: (Hucre | null)[][] = [
    [T("DİİB NO", S.baslik), T("TARİH", S.baslik), T("İTHALAT İZNİ (KG)", S.baslik), T("İHRACAT TAAHHÜDÜ (KG)", S.baslik), T("GERÇEKLEŞEN İHRACAT (KG)", S.baslik), T("KALAN İHRACAT (KG)", S.baslik), T("TUTAR (USD)", S.baslik), T("HAK EDİLEN İTHALAT (KG)", S.baslik)],
  ];
  let tT = 0, tG = 0, tK = 0, tTu = 0, tH = 0, tI = 0;
  for (const o of ozetler) {
    const izin = sayiOku(o.belge.ithalat_izin_kg);
    genel.push([T(o.belge.belge_no), o.belge.belge_tarihi ? T(tarihSeri(o.belge.belge_tarihi), S.tarih) : null, T(izin, S.kg), T(o.taahhutKg, S.kg), T(o.gerceklesenKg, S.kg), T(Math.max(0, o.kalanKg), S.kg), T(o.tutar, S.para), T(Math.round(o.hakEdilenIthalatKg), S.kg)]);
    tT += o.taahhutKg; tG += o.gerceklesenKg; tK += Math.max(0, o.kalanKg); tTu += o.tutar; tH += Math.round(o.hakEdilenIthalatKg); tI += izin;
  }
  genel.push([], [T("TOPLAM", S.baslik), null, T(tI, S.kgKalin), T(tT, S.kgKalin), T(tG, S.kgKalin), T(tK, S.kgKalin), T(Math.round(tTu * 100) / 100, S.paraKalin), T(tH, S.kgKalin)]);
  sayfalar.push({ ad: "GENEL TABLO", xml: sayfaXml(genel, [22, 12, 20, 24, 26, 20, 18, 26]) });

  // Her DIIB: Excel'deki IHRACAT bolumu
  for (const o of ozetler) {
    const s = satirlar.filter((x) => x.diibId === o.belge.id);
    const r: (Hucre | null)[][] = [
      [T("İHRACAT", S.baslik), null, null, T(o.belge.belge_no, S.baslik)],
      [],
      ["FATURA NO", "BEYANNAME NO", "FT TARİHİ", "CARİ UNVANI", "STOK ADI", "MİKTAR", "BİRİM FİYAT", "TUTARI"].map((b) => T(b, S.baslik)),
    ];
    if (o.devirKg > 0) r.push([T("SİSTEM ÖNCESİ (DEVİR)"), null, null, null, T("BUĞDAY UNU"), T(o.devirKg, S.kg), o.devirKg ? T(Math.round(o.devirTutar / o.devirKg * 100000) / 100000, S.fiyat) : null, T(o.devirTutar, S.para)]);
    for (const x of s) {
      r.push([T(x.faturaNo), T(x.beyannameNo), x.faturaTarihi ? T(tarihSeri(x.faturaTarihi), S.tarih) : null, T(x.cari), T(x.stokAdi), T(x.miktarKg, S.kg), x.birimFiyat !== null ? T(x.birimFiyat, S.fiyat) : null, T(x.tutar, S.para)]);
    }
    r.push([], [null, null, null, null, T("GERÇEKLEŞEN İHRACAT", S.baslik), T(o.gerceklesenKg, S.kgKalin), o.ortalamaFiyat !== null ? T(o.ortalamaFiyat, S.fiyat) : null, T(o.tutar, S.paraKalin)]);
    r.push([null, null, null, null, T("ÖNGÖRÜLEN İHRACAT", S.baslik), T(o.taahhutKg, S.kgKalin)]);
    r.push([null, null, null, null, T("KALAN İHRACAT", S.baslik), T(o.kalanKg, S.kgKalin)]);
    r.push([null, null, null, null, T("HAK EDİLEN İTHALAT", S.baslik), T(Math.round(o.hakEdilenIthalatKg), S.kgKalin)]);
    sayfalar.push({ ad: sayfaAdi(o.belge.belge_no, kullanilan), xml: sayfaXml(r, [24, 24, 12, 34, 24, 14, 12, 16]) });
  }

  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sayfalar.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sayfalar.map((s, i) => `<sheet name="${kacis(s.ad)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sayfalar.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sayfalar.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", STILLER);
  sayfalar.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, s.xml));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
