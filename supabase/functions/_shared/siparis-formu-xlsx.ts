/**
 * SIPARIS BILDIRIM FORMU - Excel (18.11.2026). Kullanicinin "Sipariş Bildirim Formu" sablonunun (Sayfa1, A1:D32) birebir
 * duzeni: A1 logo, B1:D1 baslik, 2-13. satirlar etiket / deger (C10:C13 + D10:D13 urun spekleri), A14:D32 cuval gorseli.
 * SAF: Office Open XML parcalarini uretir (resimler dahil); zip'leme cagirana kalir (edge: npm:jszip, web: jszip).
 */
import { EKSIK, SAG_ALANLAR, SOL_ALANLAR, type FormModeli } from "./siparis-formu.ts";

export type XlsxParcasi = { yol: string; icerik: string | Uint8Array };
export type FormGorseli = { veri: Uint8Array; tur: "png" | "jpeg" };

const kacis = (s: string) =>
  Array.from(s).filter((ch) => { const k = ch.charCodeAt(0); return k >= 32 || k === 9 || k === 10 || k === 13; }).join("")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** PNG / JPEG piksel boyutu; okunamazsa null. */
export function gorselBoyutu(b: Uint8Array): { en: number; boy: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const en = (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19];
    const boy = (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23];
    return en > 0 && boy > 0 ? { en, boy } : null;
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const uzunluk = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        const boy = (b[i + 5] << 8) | b[i + 6];
        const en = (b[i + 7] << 8) | b[i + 8];
        return en > 0 && boy > 0 ? { en, boy } : null;
      }
      i += 2 + uzunluk;
    }
  }
  return null;
}
export function gorselTuru(b: Uint8Array): "png" | "jpeg" | null {
  if (b.length > 4 && b[0] === 0x89 && b[1] === 0x50) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return "jpeg";
  return null;
}

// Sablon olculeri
const SUTUNLAR = [26.21875, 22.5546875, 26.109375, 27.44140625];
const EMU_PX = 9525;
const sutunPx = (gen: number) => Math.round(gen * 7 + 5);
const SATIR_PX = 20;
const GORSEL_ILK_SATIR = 14; // A14
const GORSEL_SON_SATIR = 32; // D32

const STILLER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFC00000"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
const S = { etiket: 1, deger: 2, baslik: 3, bos: 4, eksik: 5, spek: 6 } as const;

function hucre(ref: string, deger: string | null, stil: number): string {
  if (deger === null || deger === "") return `<c r="${ref}" s="${stil}"/>`;
  return `<c r="${ref}" s="${stil}" t="inlineStr"><is><t xml:space="preserve">${kacis(deger)}</t></is></c>`;
}

function sayfaXml(m: FormModeli, cizimVar: boolean, cuvalVar: boolean): string {
  const a = m.alanlar;
  const satirlar: string[] = [];
  // 1: logo (A1) + baslik (B1:D1)
  satirlar.push(`<row r="1" ht="79.8" customHeight="1">${hucre("A1", null, S.bos)}${hucre("B1", "SİPARİŞ BİLDİRİM FORMU", S.baslik)}${hucre("C1", null, S.baslik)}${hucre("D1", null, S.baslik)}</row>`);
  for (let i = 0; i < 12; i++) {
    const r = i + 2;
    const [solK, solE] = SOL_ALANLAR[i];
    const solD = a[solK];
    let sag = "";
    if (i < 8) {
      const [sagK, sagE] = SAG_ALANLAR[i];
      const sagD = a[sagK];
      sag = hucre(`C${r}`, sagE, S.etiket) + hucre(`D${r}`, sagD || EKSIK, sagD ? S.deger : S.eksik);
    } else if (i === 8) {
      const [sagK, sagE] = SAG_ALANLAR[8];
      const sagD = a[sagK];
      sag = hucre(`C${r}`, sagE, S.etiket) + hucre(`D${r}`, sagD || EKSIK, sagD ? S.spek : S.eksik);
    } else {
      sag = hucre(`C${r}`, null, S.etiket) + hucre(`D${r}`, null, S.spek);
    }
    satirlar.push(`<row r="${r}">${hucre(`A${r}`, solE, S.etiket)}${hucre(`B${r}`, solD || EKSIK, solD ? S.deger : S.eksik)}${sag}</row>`);
  }
  // 14-32: cuval gorseli alani (A14:D32); gorsel Excel'e GIRMEDIYSE (girilmemis ya da depodan okunamamis) A14'te uyari
  for (let r = GORSEL_ILK_SATIR; r <= GORSEL_SON_SATIR; r++) {
    const icerik = r === GORSEL_ILK_SATIR && !cuvalVar ? `ÇUVAL GÖRSELİ ${EKSIK}` : null;
    satirlar.push(`<row r="${r}">${hucre(`A${r}`, icerik, icerik ? S.eksik : S.bos)}${hucre(`B${r}`, null, S.bos)}${hucre(`C${r}`, null, S.bos)}${hucre(`D${r}`, null, S.bos)}</row>`);
  }
  const sutunlar = SUTUNLAR.map((g, i) => `<col min="${i + 1}" max="${i + 1}" width="${g}" customWidth="1"/>`).join("");
  const birlesik = ["B1:D1", "C10:C13", "D10:D13", `A${GORSEL_ILK_SATIR}:D${GORSEL_SON_SATIR}`];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:D${GORSEL_SON_SATIR}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>
<cols>${sutunlar}</cols><sheetData>${satirlar.join("")}</sheetData>
<mergeCells count="${birlesik.length}">${birlesik.map((b) => `<mergeCell ref="${b}"/>`).join("")}</mergeCells>
<pageMargins left="0.5" right="0.5" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="portrait" fitToHeight="1" fitToWidth="1"/>${cizimVar ? `<drawing r:id="rId1"/>` : ""}
</worksheet>`;
}

function resimXml(id: number, ad: string, rel: string, sutun: number, sutunOff: number, satir: number, satirOff: number, en: number, boy: number): string {
  return `<xdr:oneCellAnchor><xdr:from><xdr:col>${sutun}</xdr:col><xdr:colOff>${sutunOff}</xdr:colOff><xdr:row>${satir}</xdr:row><xdr:rowOff>${satirOff}</xdr:rowOff></xdr:from><xdr:ext cx="${en}" cy="${boy}"/>
<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${ad}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>
<xdr:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${en}" cy="${boy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
}

/** Kutuya oran korunarak sigdir (px). */
function sigdir(en: number, boy: number, kutuEn: number, kutuBoy: number): { en: number; boy: number } {
  const oran = Math.min(kutuEn / en, kutuBoy / boy);
  return { en: Math.max(1, Math.round(en * oran)), boy: Math.max(1, Math.round(boy * oran)) };
}

export function siparisFormuXlsx(m: FormModeli, logo: FormGorseli | null, cuval: FormGorseli | null): XlsxParcasi[] {
  const resimler: { gorsel: FormGorseli; xml: (id: number, rel: string) => string }[] = [];
  if (logo) {
    const bo = gorselBoyutu(logo.veri);
    if (bo) {
      const k = sigdir(bo.en, bo.boy, sutunPx(SUTUNLAR[0]) - 30, 79.8 * (4 / 3) - 14);
      resimler.push({ gorsel: logo, xml: (id, rel) => resimXml(id, "Logo", rel, 0, Math.round(((sutunPx(SUTUNLAR[0]) - k.en) / 2) * EMU_PX), 0, 7 * EMU_PX, k.en * EMU_PX, k.boy * EMU_PX) });
    }
  }
  if (cuval) {
    const bo = gorselBoyutu(cuval.veri);
    if (bo) {
      const kutuEn = SUTUNLAR.reduce((t, g) => t + sutunPx(g), 0) - 24;
      const kutuBoy = (GORSEL_SON_SATIR - GORSEL_ILK_SATIR + 1) * SATIR_PX - 16;
      const k = sigdir(bo.en, bo.boy, kutuEn, kutuBoy);
      const solBosluk = Math.round((kutuEn + 24 - k.en) / 2);
      const ustBosluk = Math.round((kutuBoy + 16 - k.boy) / 2);
      resimler.push({ gorsel: cuval, xml: (id, rel) => resimXml(id, "Cuval", rel, 0, solBosluk * EMU_PX, GORSEL_ILK_SATIR - 1, ustBosluk * EMU_PX, k.en * EMU_PX, k.boy * EMU_PX) });
    }
  }
  const cizimVar = resimler.length > 0;
  const cuvalVar = resimler.some((r) => r.gorsel === cuval);
  const parcalar: XlsxParcasi[] = [];
  const turler = new Set(resimler.map((r) => r.gorsel.tur));
  parcalar.push({
    yol: "[Content_Types].xml",
    icerik: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${turler.has("png") ? `<Default Extension="png" ContentType="image/png"/>` : ""}${turler.has("jpeg") ? `<Default Extension="jpeg" ContentType="image/jpeg"/>` : ""}
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${cizimVar ? `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : ""}</Types>`,
  });
  parcalar.push({ yol: "_rels/.rels", icerik: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
  parcalar.push({ yol: "xl/workbook.xml", icerik: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sayfa1" sheetId="1" r:id="rId1"/></sheets></workbook>` });
  parcalar.push({ yol: "xl/_rels/workbook.xml.rels", icerik: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
  parcalar.push({ yol: "xl/styles.xml", icerik: STILLER });
  parcalar.push({ yol: "xl/worksheets/sheet1.xml", icerik: sayfaXml(m, cizimVar, cuvalVar) });
  if (cizimVar) {
    parcalar.push({ yol: "xl/worksheets/_rels/sheet1.xml.rels", icerik: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>` });
    const iliskiler: string[] = [];
    const ciz: string[] = [];
    resimler.forEach((r, i) => {
      const ad = `image${i + 1}.${r.gorsel.tur}`;
      parcalar.push({ yol: `xl/media/${ad}`, icerik: r.gorsel.veri });
      iliskiler.push(`<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${ad}"/>`);
      ciz.push(r.xml(i + 2, `rId${i + 1}`));
    });
    parcalar.push({ yol: "xl/drawings/_rels/drawing1.xml.rels", icerik: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${iliskiler.join("")}</Relationships>` });
    parcalar.push({ yol: "xl/drawings/drawing1.xml", icerik: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${ciz.join("")}</xdr:wsDr>` });
  }
  return parcalar;
}
