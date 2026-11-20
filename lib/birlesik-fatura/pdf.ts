/**
 * BIRLESIK FATURA - fatura talimati PDF'i (19.11.2026). Tek dosyalik talimatla (lib/fatura-talimati-pdf-builder.ts) ayni
 * kart tasarimi: logo, lacivert basliklar, bolumler, tek sayfaya sigana kadar kuculme. Icerik: ./model.ts.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ROBOTO_TR_BASE64 } from "@/lib/fonts/roboto-tr-base64";
import { UNEX_LOGO_BASE64 } from "@/lib/images/unex-logo-base64";
import { formatCurrency, formatBirimFiyatKg, formatFobBirimFiyatKg, formatCutoffSaat, formatCutoffTarihUzun, ulkeAyikla } from "@/lib/cutoff-utils";
import { gidecegiUlke, dosyaTicaretUlkesi, TICARET_ULKESI_BELIRSIZ } from "@/lib/ulke-bul";
import { bayrakPng } from "@/lib/bayraklar";
import { birlesikKonu, type BirlesikFaturaModeli } from "@/lib/birlesik-fatura/model";

const LACIVERT: [number, number, number] = [30, 42, 74];
const GRI: [number, number, number] = [110, 110, 110];
const TURUNCU: [number, number, number] = [180, 110, 20];
type Satir = [string, string | number | null | undefined];

const sayiTr = (n: number, k = 3) => n.toLocaleString("tr-TR", { maximumFractionDigits: k });

export function beyannameSuresi(m: BirlesikFaturaModeli): string | null {
  return m.beyannameCutoff ? `${formatCutoffTarihUzun(m.beyannameCutoff)} ${formatCutoffSaat(m.beyannameCutoff)}` : null;
}

function ciz(m: BirlesikFaturaModeli, olcek: number, on: boolean, bayrak: string | null): { doc: jsPDF; sayfa: number } {
  const doc = new jsPDF();
  doc.addFileToVFS("Roboto-Regular.ttf", ROBOTO_TR_BASE64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFont("Roboto-Regular.ttf", "Roboto", "bold");
  doc.setFont("Roboto");
  const pb = m.paraBirimi;
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - marginX * 2;

  doc.addImage(UNEX_LOGO_BASE64, "PNG", marginX, 10, 16, 16);
  doc.setFont("Roboto", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...LACIVERT);
  doc.text(on ? "FATURA TALIMATI - BIRLESIK FATURA (ON TALIMAT)" : "FATURA TALIMATI - BIRLESIK FATURA", marginX + 20, 17);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRI);
  doc.text(m.saticiFirma || "", marginX + 20, 22.5);
  doc.setDrawColor(...LACIVERT);
  doc.setLineWidth(0.6);
  doc.line(marginX, 29, pageWidth - marginX, 29);
  doc.setFontSize(8.5 * olcek);
  doc.text(birlesikKonu(m, on).replace(/ - /g, "  |  "), marginX, 34);

  let y = 39;
  const fontBoyu = 8 * olcek;
  const hucreDolgu = 1.3 * olcek;
  const ara = Math.max(1.2, 3 * olcek);
  const altMargin = Math.max(3, 10 * olcek);

  // Ust bilgi kutusu: tek fatura + (varsa) farklar / eksikler
  const notlar = [
    `${m.dosyaSayisi} dosya (${m.dosyalar.map((d) => d.dosyaNo).join(", ")}) ayni musteri ve ayni gemiye aittir: TEK FATURA kesilecektir.`,
    ...(on ? [`Konteyner bilgileri eksik: ${m.eksikDosyalar.join(", ")}. Agirlik ve konteyner bilgileri belirlenince ayrica bildirilecektir.`] : []),
    ...m.farklar.map((f) => `Dikkat: ${f}`),
  ];
  doc.setFontSize(7.8 * Math.max(olcek, 0.8));
  const satirlar = notlar.flatMap((n) => doc.splitTextToSize(n, contentWidth - 6) as string[]);
  const kutuH = 4 + satirlar.length * 3.6 * Math.max(olcek, 0.8);
  doc.setFillColor(255, 247, 230);
  doc.setDrawColor(214, 140, 30);
  doc.setLineWidth(0.4);
  doc.rect(marginX, y - 1.5, contentWidth, kutuH, "FD");
  doc.setTextColor(140, 80, 0);
  satirlar.forEach((s, i) => doc.text(s, marginX + 3, y + 2.5 + i * 3.6 * Math.max(olcek, 0.8)));
  y += kutuH + 2;

  const bayrakG = 4.5 * olcek, bayrakY = 3 * olcek, bayrakBosluk = 1.6 * olcek;
  const bolum = (baslik: string, s: Satir[], bayrakSatiri: string | null = null) => {
    const rows = s.filter((r): r is [string, string | number] => r[1] !== null && r[1] !== undefined && r[1] !== "" && r[1] !== "-");
    if (!rows.length) return;
    const bayrakli = (row: { raw: unknown }) => !!bayrak && !!bayrakSatiri && Array.isArray(row.raw) && row.raw[0] === bayrakSatiri;
    autoTable(doc, {
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 1 && bayrakli(d.row)) {
          const pad = d.cell.styles.cellPadding as number;
          d.cell.styles.cellPadding = { top: pad, right: pad, bottom: pad, left: pad + bayrakG + bayrakBosluk };
        }
      },
      didDrawCell: (d) => {
        if (d.section === "body" && d.column.index === 1 && bayrakli(d.row) && bayrak) {
          try { doc.addImage(bayrak, "PNG", d.cell.x + hucreDolgu, d.cell.y + (d.cell.height - bayrakY) / 2, bayrakG, bayrakY); } catch { /* bayraksiz */ }
        }
      },
      startY: y,
      head: [[{ content: baslik, colSpan: 2 }]],
      body: rows.map(([l, v]) => [l, String(v)]),
      theme: "grid",
      styles: { font: "Roboto", fontSize: fontBoyu, cellPadding: hucreDolgu, textColor: [30, 30, 30], lineColor: [210, 210, 210], lineWidth: 0.15 },
      headStyles: { fillColor: LACIVERT, textColor: 255, fontStyle: "bold", fontSize: fontBoyu + 0.5 },
      columnStyles: { 0: { cellWidth: 48, fontStyle: "bold", textColor: [70, 70, 70] }, 1: { cellWidth: contentWidth - 48 } },
      margin: { left: marginX, right: marginX, bottom: altMargin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + ara;
  };

  bolum("DOSYA BILGILERI", [
    ["Alici Firma", m.aliciFirma],
    ["Satici Firma", m.saticiFirma],
    ["Dosyalar", m.dosyalar.map((d) => d.dosyaNo).join(", ")],
    ["Proforma No", m.dosyalar.map((d) => d.proformaNo).filter(Boolean).join(", ")],
    ["Lot No", m.dosyalar.map((d) => d.lotNo).filter(Boolean).join(", ")],
    ["Marka", m.markalar],
    ["Ambalaj", m.ambalaj],
    ["Net Agirlik", m.toplam.net ? `${sayiTr(m.toplam.net, 2)} KG` : null],
    ["Brut Agirlik", m.toplam.brut ? `${sayiTr(m.toplam.brut, 2)} KG` : null],
  ]);
  bolum("LOJISTIK BILGILERI", [
    ["Yukleme Limani", m.yuklemeLimani],
    ["Varis Limani", m.varisLimani],
    ["Gidecegi Ulke", gidecegiUlke(m.varisLimani) ?? ulkeAyikla(m.varisLimani)],
    ["Ticaret Yapilan Ulke", dosyaTicaretUlkesi(m.ticaretUlkesiElle, m.aliciAdresi) ?? TICARET_ULKESI_BELIRSIZ],
    ["Teslim Sekli", m.teslimSekli],
    ["Odeme Sekli", m.odemeSekli],
    ["Gemi Adi", m.gemi],
    ["Acente", m.acente],
    ["Booking No", m.dosyalar.map((d) => d.bookingNo).filter(Boolean).join(", ")],
    ["Beyanname Teslim Suresi", beyannameSuresi(m)],
  ], "Ticaret Yapilan Ulke");
  bolum("MALIYET VE BANKA BILGILERI", [
    ["Navlun (Konteyner Basina)", m.navlunBirim],
    ["Toplam Navlun Fiyati", m.toplam.netNavlun !== null ? formatCurrency(m.toplam.netNavlun, pb) : null],
    ["Lokal Masraflar (Konteyner Basina)", m.lokalBirim],
    ["Araci Banka", m.banka],
  ]);

  // Tek faturanin kalemleri
  const gri = { fillColor: [235, 235, 235] as [number, number, number], textColor: [30, 30, 30] as [number, number, number], fontStyle: "normal" as const };
  autoTable(doc, {
    startY: y,
    head: [
      [{ content: "FATURA KALEMLERI (TEK FATURA)", colSpan: 6 }],
      [
        { content: "Urun", styles: gri }, { content: "Ambalaj", styles: gri }, { content: "Konteyner", styles: { ...gri, halign: "center" } },
        { content: "Miktar (MTS)", styles: { ...gri, halign: "center" } }, { content: `CIF Birim Fiyat (${pb}/KG)`, styles: gri }, { content: `FOB Birim Fiyat (${pb}/KG)`, styles: gri },
      ],
    ],
    body: m.kalemler.map((k) => m.fiyatlarFob
      ? [k.ad, k.ambalaj || "-", String(k.konteyner || "-"), sayiTr(k.mt), "-", formatBirimFiyatKg(k.cifBirimMt)]
      : [k.ad, k.ambalaj || "-", String(k.konteyner || "-"), sayiTr(k.mt), formatBirimFiyatKg(k.cifBirimMt), k.fobBirimMt !== null ? formatFobBirimFiyatKg(k.fobBirimMt) : "-"]),
    foot: [[
      "Toplam", "",
      { content: String(m.toplam.konteyner || "-"), styles: { halign: "center" } },
      { content: m.toplam.mt ? sayiTr(m.toplam.mt) : "-", styles: { halign: "center" } },
      m.fiyatlarFob ? "-" : `${formatCurrency(m.toplam.cif, pb)} ${pb}`,
      m.fiyatlarFob ? `${formatCurrency(m.toplam.cif, pb)} ${pb}` : m.toplam.fob !== null ? `${formatCurrency(m.toplam.fob, pb)} ${pb}` : "-",
    ]],
    theme: "grid",
    styles: { font: "Roboto", fontSize: fontBoyu, cellPadding: hucreDolgu },
    columnStyles: { 2: { halign: "center", cellWidth: 20 }, 3: { halign: "center", cellWidth: 22 } },
    headStyles: { fillColor: LACIVERT, textColor: 255, fontStyle: "bold", fontSize: fontBoyu + 0.5 },
    footStyles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "bold", fontSize: fontBoyu },
    margin: { left: marginX, right: marginX, bottom: altMargin },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + ara;

  // Dosya dagilimi (bilgi)
  autoTable(doc, {
    startY: y,
    head: [
      [{ content: `DOSYA DAGILIMI (${m.dosyaSayisi} DOSYA - BILGI ICIN)`, colSpan: 7 }],
      ["Dosya", "Proforma No", "Booking No", "Konteyner", "Miktar (MTS)", m.fiyatlarFob ? "Tutar (FOB)" : "Tutar (CIF)", "Tutar (FOB)"].map((b, i) => ({ content: b, styles: { ...gri, halign: (i >= 3 ? "right" : "left") as "right" | "left" } })),
    ],
    body: m.dosyalar.map((d) => [
      d.dosyaNo, d.proformaNo || "-", d.bookingNo || "-", String(d.konteyner), sayiTr(d.mt),
      formatCurrency(d.cif, pb), m.fiyatlarFob ? formatCurrency(d.cif, pb) : d.fob !== null ? formatCurrency(d.fob, pb) : "-",
    ]),
    foot: [[
      "Toplam", "", "",
      { content: String(m.toplam.konteyner), styles: { halign: "right" } },
      { content: sayiTr(m.toplam.mt), styles: { halign: "right" } },
      { content: formatCurrency(m.toplam.cif, pb), styles: { halign: "right" } },
      { content: m.fiyatlarFob ? formatCurrency(m.toplam.cif, pb) : m.toplam.fob !== null ? formatCurrency(m.toplam.fob, pb) : "-", styles: { halign: "right" } },
    ]],
    theme: "grid",
    styles: { font: "Roboto", fontSize: fontBoyu, cellPadding: hucreDolgu },
    columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
    headStyles: { fillColor: TURUNCU, textColor: 255, fontStyle: "bold", fontSize: fontBoyu + 0.5 },
    footStyles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "bold", fontSize: fontBoyu },
    margin: { left: marginX, right: marginX, bottom: altMargin },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + ara;

  if (m.konteynerler.length) {
    const r = (k: unknown) => k as Record<string, unknown>;
    const s = (v: unknown) => { const n = parseFloat(String(v ?? "")); return Number.isFinite(n) && n ? n.toLocaleString("tr-TR") : "-"; };
    autoTable(doc, {
      startY: y,
      head: [
        [{ content: `KONTEYNER BILGILERI (${m.konteynerler.length} adet)`, colSpan: 10 }],
        ["#", "Dosya", "Konteyner No", "Muhur No", "Tip", "Marka", "Kap", "Net (KG)", "Brut (KG)", "VGM (KG)"],
      ],
      body: m.konteynerler.map((k, i) => [i + 1, k.dosyaNo, k.konteyner_no, k.muhur_no || "-", k.tip || "-", String(r(k).marka || "-"), s(r(k).pieces), s(k.net_agirlik_kg), s(r(k).brut_agirlik_kg), s(r(k).vgm_kg)]),
      foot: [["", "", "", "", "", "TOPLAM", m.toplam.kap ? sayiTr(m.toplam.kap, 0) : "", m.toplam.net ? `${sayiTr(m.toplam.net, 2)} KG` : "", m.toplam.brut ? `${sayiTr(m.toplam.brut, 2)} KG` : "", m.toplam.vgm ? sayiTr(m.toplam.vgm, 2) : ""]],
      theme: "grid",
      styles: { font: "Roboto", fontSize: fontBoyu - 0.5, cellPadding: Math.max(0.3, hucreDolgu - 0.2), halign: "center", minCellHeight: 0 },
      headStyles: { fillColor: LACIVERT, textColor: 255, fontStyle: "bold", fontSize: fontBoyu },
      footStyles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "bold", fontSize: fontBoyu - 0.5 },
      columnStyles: { 0: { cellWidth: 7 }, 1: { cellWidth: 23 }, 2: { cellWidth: 25 }, 5: { halign: "left" } },
      margin: { left: marginX, right: marginX, bottom: altMargin },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + ara;
  }

  bolum("EVRAK VE TARIH BILGILERI", [
    ["Beyanname No", m.beyannameNo],
    ["BL No", m.blNo],
    ["Diib Bilgisi", m.diib],
    ["Uretim Tarihi", m.uretim],
    ["Son Kullanim Tarihi", m.skt],
  ]);
  return { doc, sayfa: doc.getNumberOfPages() };
}

export function birlesikTalimatPdfOlustur(m: BirlesikFaturaModeli, on = false, bayrak: string | null = null): jsPDF {
  let olcek = 1.0;
  let s = ciz(m, olcek, on, bayrak);
  while (s.sayfa > 1 && olcek > 0.5) {
    olcek = Math.round((olcek - 0.02) * 100) / 100;
    s = ciz(m, olcek, on, bayrak);
  }
  return s.doc;
}

export const birlesikPdfAdi = (m: BirlesikFaturaModeli, on = false) =>
  `Fatura_Talimati_Birlesik_${(m.dosyalar[0]?.dosyaNo || "dosya").replace(/[^a-zA-Z0-9_-]/g, "_")}_${m.dosyaSayisi}_dosya${on ? "-ON" : ""}.pdf`;

export async function birlesikTalimatPdfUret(m: BirlesikFaturaModeli, on = false): Promise<{ blob: Blob; ad: string }> {
  const bayrak = await bayrakPng(dosyaTicaretUlkesi(m.ticaretUlkesiElle, m.aliciAdresi));
  return { blob: birlesikTalimatPdfOlustur(m, on, bayrak).output("blob"), ad: birlesikPdfAdi(m, on) };
}

export async function indirBirlesikTalimatPdf(m: BirlesikFaturaModeli, on = false): Promise<void> {
  const bayrak = await bayrakPng(dosyaTicaretUlkesi(m.ticaretUlkesiElle, m.aliciAdresi));
  birlesikTalimatPdfOlustur(m, on, bayrak).save(birlesikPdfAdi(m, on));
}
