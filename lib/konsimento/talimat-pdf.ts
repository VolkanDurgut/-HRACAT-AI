// ============================================================================
// KONSIMENTO TALIMATI PDF (06.11.2026) - acente sablonuna gore
// ============================================================================
// Model: lib/konsimento/talimat.ts. Gorunum kullanicinin ornek formlarina gore:
//   standart -> DRAFT/MAERSK formu (sari baslik, etiket | deger tablosu, navlun bloklari, konteyner tablosu)
//   akkon    -> AKKON LINES formu (ust bilgi + kutular, 2 sayfa, beyan + tarih / imza satiri)
// Yazi tipi Inter (Turkce karakterlerin TAMAMI var; gomulu Carlito alt kumesinde ş/ğ/ı/İ yok).
// "msc_web" icin PDF URETILMEZ (talimat MSC web sitesinden girilir).
// ============================================================================

import jsPDF from "jspdf";
import autoTable, { type CellInput } from "jspdf-autotable";
import { INTER_REGULAR_BASE64, INTER_BOLD_BASE64 } from "@/lib/fonts/inter-tr-base64";
import { sayiTr, UNEX_TELEFON, type TalimatModeli } from "@/lib/konsimento/talimat";

const SARI: [number, number, number] = [255, 255, 0];
const YESIL: [number, number, number] = [146, 208, 80];
const SIYAH: [number, number, number] = [0, 0, 0];

function yeniBelge(): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  doc.addFileToVFS("Inter-Regular.ttf", INTER_REGULAR_BASE64);
  doc.addFont("Inter-Regular.ttf", "CAL", "normal");
  doc.addFileToVFS("Inter-Bold.ttf", INTER_BOLD_BASE64);
  doc.addFont("Inter-Bold.ttf", "CAL", "bold");
  doc.setFont("CAL", "normal");
  doc.setLineHeightFactor(1.15);
  return doc;
}

type Hucre = CellInput;

// ---------------------------------------------------------------------------
// STANDART (DRAFT / MAERSK)
// ---------------------------------------------------------------------------
function standart(doc: jsPDF, m: TalimatModeli) {
  const sol = 40, gen = 515;
  const etiket = (t: string, ek: Record<string, unknown> = {}): Hucre => ({ content: t, styles: { fontStyle: "bold", ...ek } });
  const deger = (t: string, ek: Record<string, unknown> = {}): Hucre => ({ content: t, styles: { ...ek } });
  const bos: Hucre[] = [{ content: "", colSpan: 2, styles: { minCellHeight: 5, cellPadding: 0 } }];
  const navlunSatiri = (baslik: string, odeme: string, taraf: string, renk: [number, number, number]) => [
    [etiket(baslik, { fillColor: renk }), deger(odeme, { fontStyle: "bold" })],
    [etiket("INVOICE and CREDIT PARTY (FATURA KIME KESILECEK)", { fillColor: renk }), deger(taraf)],
  ];
  const body: Hucre[][] = [
    [{ content: "SHIPPING INSTRUCTION (KONŞİMENTO TALİMATI)", colSpan: 2, styles: { fillColor: SARI, fontStyle: "bold", halign: "center", fontSize: 9.5 } }],
    [etiket("BOOKING NUMBER (KONSIMENTO NUMARASI)"), deger(m.booking)],
    [etiket("SHIPPER (YUKLEYICI)"), deger(m.shipper.join("\n"), { minCellHeight: 52 })],
    [etiket("CONSIGNEE (ALICI)"), deger(m.consignee, { minCellHeight: 62 })],
    [etiket("NOTIFY (IHBAR ADRESI)"), deger(m.notify.join("\n\n"), { minCellHeight: 62 })],
    [etiket("VESSEL NAME AND VOYAGE (GEMI ADI VE SEFERI)"), deger(m.gemi)],
    [etiket("DESCRIPTION OF GOODS(MAL TANIMI)"), deger(m.malEn.join("\n"))],
    [etiket("HS CODE(GTIP NUMARASI/ HTS CODE)"), deger(m.gtip)],
    [etiket("MARKS / NUMBERS (MARKA / NUMARALAR)"), deger("")],
    [etiket("PLACE OF RECEIPT (ALINDIGI YER)"), deger("")],
    [etiket("PORT OF LOADING (YUKLEME LIMANI)"), deger(m.pol)],
    [etiket("PORT OF DISCHARGE (BOSALTMA LIMANI)"), deger(m.pod)],
    [etiket("PLACE OF DELIVERY (TESIM YERI)"), deger("")],
    [etiket("TYPE OF BL (KONSIMENTO TIPI)"), deger(m.blTipi)],
    bos,
    ...navlunSatiri("SEA FREIGHT (NAVLUN)", m.navlun, m.navlunFaturaTarafi, SARI),
    bos,
    ...navlunSatiri("LOCAL CHARGES (YUKLEME LIMAN MASRAFLARI )", "PREPAID", "UNEX GIDA SAN. VE TIC.LTD.STI", SARI),
    bos,
    ...navlunSatiri("DESTINATION CHARGES (BOSALTMA LIMANI MASRAFLARI)", "COLLECT", "", YESIL),
    bos,
  ];
  autoTable(doc, {
    startY: 40, margin: { left: sol, right: 595 - sol - gen }, tableWidth: gen, theme: "grid", body,
    styles: { font: "CAL", fontSize: 7.3, textColor: SIYAH, lineColor: SIYAH, lineWidth: 0.5, cellPadding: { top: 2, bottom: 2, left: 4, right: 4 }, valign: "middle" },
    columnStyles: { 0: { cellWidth: 245 }, 1: { cellWidth: gen - 245 } },
  });
  // Konteyner tablosu (ayni genislik, sari baslik)
  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const bas = (t: string) => ({ content: t, styles: { fillColor: SARI, fontStyle: "bold" as const, halign: "center" as const } });
  autoTable(doc, {
    startY: y, margin: { left: sol, right: 595 - sol - gen }, tableWidth: gen, theme: "grid",
    head: [[bas("CONTAINER NO (KONTEYNER NO)"), bas("TYPE OF\nCONT.\n(KONT. TIPI)"), bas("SEAL NO\n(MÜHÜR NO)"), bas("PIECE\n(ADET)"), bas("NET WEIGHT\n(NET AĞIRLIK)"), bas("GROSS WEIGHT\n(BRUT AGIRLIK)")]],
    body: [
      ...m.konteynerler.map((k) => [k.no, k.tip, k.muhur, String(k.kap || ""), String(k.net || ""), String(k.brut || "")]),
      [{ content: "", colSpan: 6, styles: { minCellHeight: 8, cellPadding: 0 } }],
      [{ content: "TOTAL", colSpan: 3, styles: { fontStyle: "bold", halign: "center" } },
        { content: sayiTr(m.toplamKap, 2), styles: { fontStyle: "bold" } }, { content: sayiTr(m.toplamNet, 2), styles: { fontStyle: "bold" } }, { content: sayiTr(m.toplamBrut, 2), styles: { fontStyle: "bold" } }],
    ],
    styles: { font: "CAL", fontSize: 7.3, textColor: SIYAH, lineColor: SIYAH, lineWidth: 0.5, halign: "center", cellPadding: 2, valign: "middle" },
    headStyles: { textColor: SIYAH, fontSize: 6.8, lineColor: SIYAH, lineWidth: 0.5 },
    columnStyles: { 0: { cellWidth: 200 }, 1: { cellWidth: 52 }, 2: { cellWidth: 95 }, 3: { cellWidth: 48 }, 4: { cellWidth: 60 }, 5: { cellWidth: gen - 455 } },
  });
}

// ---------------------------------------------------------------------------
// AKKON LINES
// ---------------------------------------------------------------------------
const AKKON_UST = [
  "AKKON DENİZCİLİK NAKLİYAT VE TİCARET A.Ş.",
  "Kısıklı Mah. Alemdağ Cad. No:17/1 Üsküdar, İstanbul Tel: 0216 5203035 Faks: 0216 5203037",
  "info@akkonlines.com / www.akkonlines.com",
];
const AKKON_BEYAN = "Yukarıdaki beyanımızın doğruluğunu, beyanımızdaki farklılık nedeni ile resmi kurumlara ve 3. şahıslara karşı doğabilecek sorumluluğun tarafımıza ait olduğunu beyan ve taahhüt ederiz.";

function akkon(doc: jsPDF, m: TalimatModeli) {
  const sol = 58, gen = 480, sag = sol + gen;
  const ust = () => {
    doc.setFont("CAL", "bold"); doc.setFontSize(12.5); doc.text(AKKON_UST[0], 297.5, 52, { align: "center" });
    doc.setFont("CAL", "normal"); doc.setFontSize(9); doc.text(AKKON_UST[1], 297.5, 64, { align: "center" });
    doc.text(AKKON_UST[2], 297.5, 75, { align: "center" });
    doc.setFont("CAL", "bold"); doc.setFontSize(14);
    doc.text("KONİŞMENTO TALİMAT FORMU / BILL OF LADING INSTRUCTION FORM", 297.5, 95, { align: "center" });
  };
  const alt = () => {
    doc.setFont("CAL", "normal"); doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(AKKON_BEYAN, gen) as string[], sol, 770);
    doc.text(`Tarih        ${m.tarih}`, sol, 805);
    doc.text("Ad Soyad / Kaşe / İmza :", 360, 805);
  };
  /** Cerceveli kutu: satirlar [etiket, deger] ya da duz metin; deger cok satirli olabilir. */
  const kutu = (y: number, icerik: ([string, string] | string)[], minH = 0): number => {
    doc.setFontSize(9);
    let yy = y + 16;
    for (const s of icerik) {
      if (typeof s === "string") {
        doc.setFont("CAL", "bold");
        for (const l of doc.splitTextToSize(s, gen - 20) as string[]) { doc.text(l, sol + 8, yy); yy += 11.5; }
        yy += 4;
      } else {
        const [et, de] = s;
        doc.setFont("CAL", "bold"); doc.text(et, sol + 8, yy);
        const sat = de ? (doc.splitTextToSize(de, gen - 220) as string[]) : [""];
        doc.text(`: ${sat[0]}`, sol + 200, yy);
        for (const l of sat.slice(1)) { yy += 11.5; doc.text(l, sol + 207, yy); }
        yy += 17;
      }
    }
    const h = Math.max(yy - y, minH);
    doc.setLineWidth(0.6); doc.rect(sol, y, gen, h);
    return y + h;
  };
  const blok = (y: number, baslik: string, metin: string, minH: number): number => {
    doc.setFontSize(9); doc.setFont("CAL", "bold");
    doc.text(baslik, sol + 8, y + 12); if (baslik.length < 32) doc.text(":", sol + 200, y + 12);
    let yy = y + 24;
    for (const l of metin.split("\n").flatMap((x) => doc.splitTextToSize(x, gen - 20) as string[])) { doc.text(l, sol + 8, yy); yy += 11.2; }
    const h = Math.max(yy - y + 4, minH);
    doc.setLineWidth(0.6); doc.rect(sol, y, gen, h);
    return y + h;
  };

  // --- Sayfa 1: taraflar + gemi / limanlar
  ust();
  let y = 112;
  y = kutu(y, [m.shipper.join("\n"), ["TELEFON NO (PHONE NO)", UNEX_TELEFON]], 120) + 18;
  y = blok(y, "ALICI (CONSIGNEE)", m.consignee, 90);
  y = blok(y, "İHBAR (NOTIFY PARTY)", m.notify.join("\n\n"), 90) + 18;
  kutu(y, [["GEMİ / SEFER (vessel/voyage)", m.gemi], ["YÜKLEME LİMANI (port of loading)", m.pol], ["TAHLİYE LİMANI (port of discharge)", m.pod], ["KONTEYNER NO / Mühür No", "(Cntr No / Seal No)"]], 120);
  alt();

  // --- Sayfa 2: mal tanimi + konteynerler + navlun + gumruk musaviri
  doc.addPage(); ust();
  y = kutu(112, [
    ["MAL TANIMI (TÜRKÇE)*", ""], m.malTr.join("\n"),
    ["Description of Goods (English)*", ""], m.malEn.join("\n"),
    ["HS CODES / GTIP NO", m.gtip],
    ["Beyanname No (Customs Doc No)", m.beyannameNo],
    ["KAP ADEDİ VE CİNSİ", `${m.ambalajEn}\nTOTAL ${sayiTr(m.toplamKap)} PIECES`],
    ["BRÜT AĞIRLIK (kgs)", `${sayiTr(m.toplamBrut)} KGS`],
  ]);
  autoTable(doc, {
    startY: y + 4, margin: { left: sol + 8, right: 595 - sag + 8 }, theme: "grid",
    head: [["KONTEYNER NUMARASI", "MÜHÜR NO", "KAP", "NET", "BRÜT"]],
    body: m.konteynerler.map((k) => [k.no, k.muhur, String(k.kap || ""), String(k.net || ""), String(k.brut || "")]),
    styles: { font: "CAL", fontStyle: "bold", fontSize: 10, textColor: SIYAH, lineColor: SIYAH, lineWidth: 0.6, halign: "center", cellPadding: 2.2 },
    headStyles: { fillColor: [255, 255, 255], textColor: SIYAH, fontSize: 9 },
    columnStyles: { 0: { cellWidth: 158 }, 1: { cellWidth: 140 }, 2: { cellWidth: 56 }, 3: { cellWidth: 50 }, 4: { cellWidth: 60 } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  y = kutu(y, [
    ["NAVLUN (freight)", `PREPAID ( ${m.navlun === "PREPAID" ? "X" : "  "} )          COLLECT ( ${m.navlun === "COLLECT" ? "X" : "  "} )`],
    ["ÖZEL İBARELER (remarks)", m.ozelIbare],
    ["KONŞİMENTO ADEDİ (number of b/l)", `ORIGINAL ( ${m.blOrijinal} )          COPY ( ${m.blKopya} )`],
  ]) + 8;
  if (m.gumrukMusaviri) blok(y, "Gümrük Müşaviri TEL/FAX (customs broker tel/fax)", m.gumrukMusaviri, 60);
  alt();
}

/** Talimat PDF'i (msc_web icin null). */
export function talimatPdf(m: TalimatModeli): Blob | null {
  if (m.sablon === "msc_web") return null;
  const doc = yeniBelge();
  doc.setProperties({ title: `Konşimento Talimatı ${m.booking || m.dosyaNo}`, creator: "İhracat AI" }); // disariya giden evrak; isim degisikliginde bilincli olarak korundu (20.11.2026)
  if (m.sablon === "akkon") akkon(doc, m); else standart(doc, m);
  return doc.output("blob");
}
