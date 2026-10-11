import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ROBOTO_TR_BASE64 } from "@/lib/fonts/roboto-tr-base64";
import { UNEX_LOGO_BASE64 } from "@/lib/images/unex-logo-base64";
import { UNEX_ANTET_IKONLARI_BASE64 } from "@/lib/images/unex-antet-ikonlari-base64";
import { SERTIFIKA_LOGOLARI_BASE64, SERTIFIKA_LOGOLARI_ORAN } from "@/lib/images/sertifika-logolari-base64";
import {
  FORM_SIRKET,
  GECERLILIK_GUN,
  IcFiyatFormu,
  fiyatYazi,
  formDosyaAdi,
  gunYazi,
  hitapYazi,
  onayZamaniYazi,
  vadeYazi,
} from "@/lib/ic-piyasa/fiyat-formu";

/**
 * YAN MAMUL FIYAT BILGILENDIRME FORMU PDF'i (11.10.2026).
 *
 * Tasarim Fatura Talimati'ndan (lib/fatura-talimati-pdf-builder.ts) alindi:
 * sol ustte logo + lacivert baslik, alti cizgi, konu satiri, basligi renkli
 * "kart" tablolar, tek sayfa (icerik uzarsa olcek kuculur). Altta Unex antet
 * adres blogu (sigorta talimati ile ayni) + sertifika logolari.
 *
 * Kullanici karari (11.10.2026): "Ic Piyasa" yazisi, satis sartlari ve
 * kase/imza formda YOK. Gecerlilik = onay tarihi + 3 gun (sunucuda hesaplanir).
 * Metin vektor (aranabilir, keskin); Turkce karakterler gomulu Roboto ile.
 * Bu belge TURKCE'dir (yurt ici musteriye gider) - "PDF icerikleri Ingilizce"
 * kuralinin bilincli istisnasi (sigorta talimati gibi).
 */

const LACIVERT: [number, number, number] = [40, 52, 116]; // #283474 (logo)
const SEFTALI: [number, number, number] = [244, 160, 124]; // #F4A07C (logo)
const GRI: [number, number, number] = [110, 110, 110];
const KOYU: [number, number, number] = [30, 30, 30];
const MAVI: [number, number, number] = [5, 99, 193];

function ciz(form: IcFiyatFormu, olcek: number): { doc: jsPDF; sayfaSayisi: number } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.addFileToVFS("Roboto-Regular.ttf", ROBOTO_TR_BASE64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFont("Roboto-Regular.ttf", "Roboto", "bold");
  doc.setFont("Roboto", "normal");

  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginX * 2;
  const altBilgiY = pageHeight - 27; // antet blogunun ust siniri
  const fontBoyu = 9 * olcek;
  const hucreDolgu = 1.8 * olcek;
  const bosluk = Math.max(2, 5 * olcek);

  // --- BASLIK: logo + baslik + unvan (Fatura Talimati duzeni) ---
  doc.addImage(UNEX_LOGO_BASE64, "PNG", marginX, 10, 17, 17);
  doc.setFont("Roboto", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...LACIVERT);
  doc.text("YAN MAMUL FİYAT BİLGİLENDİRME FORMU", marginX + 21, 17.5);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRI);
  doc.text(FORM_SIRKET.unvan, marginX + 21, 23);

  // Sag ust: form no (buyuk, tek bakista)
  doc.setFontSize(8);
  doc.text("FORM NO", pageWidth - marginX, 15, { align: "right" });
  doc.setFontSize(12);
  doc.setTextColor(...LACIVERT);
  doc.text(form.form_no, pageWidth - marginX, 21, { align: "right" });

  doc.setDrawColor(...LACIVERT);
  doc.setLineWidth(0.6);
  doc.line(marginX, 30, pageWidth - marginX, 30);
  doc.setDrawColor(...SEFTALI);
  doc.setLineWidth(1.2);
  doc.line(marginX, 31.3, marginX + 40, 31.3);

  let y = 37;

  // --- FORM BILGILERI karti (Etiket : Deger) ---
  const gecerlilik = `${gunYazi(form.gecerlilik_bitis)} tarihine kadar (onaydan itibaren ${GECERLILIK_GUN} gün)`;
  const bilgiler: [string, string][] = [
    ["Form No", form.form_no],
    ["Onay Tarihi", onayZamaniYazi(form.onay_zamani)],
    ["Geçerlilik", gecerlilik],
  ];
  if (form.alici?.trim()) bilgiler.splice(1, 0, ["Alıcı", form.alici.trim()]);
  bilgiler.push(["İletişim", FORM_SIRKET.iletisim]);
  autoTable(doc, {
    startY: y,
    head: [[{ content: "FORM BİLGİLERİ", colSpan: 2 }]],
    body: bilgiler,
    theme: "grid",
    styles: { font: "Roboto", fontSize: fontBoyu, cellPadding: hucreDolgu, textColor: KOYU, lineColor: [210, 210, 210], lineWidth: 0.15 },
    headStyles: { fillColor: LACIVERT, textColor: 255, fontStyle: "bold", fontSize: fontBoyu + 0.5 },
    columnStyles: { 0: { cellWidth: 40, textColor: [70, 70, 70] }, 1: { cellWidth: contentWidth - 40 } },
    margin: { left: marginX, right: marginX, bottom: pageHeight - altBilgiY + 4 },
  });
  y = (doc as any).lastAutoTable.finalY + bosluk;

  // --- Hitap ---
  doc.setFontSize(10 * Math.max(olcek, 0.85));
  doc.setTextColor(...KOYU);
  doc.text(hitapYazi(form.alici), marginX, y + 3);
  doc.setFontSize(9.5 * Math.max(olcek, 0.85));
  const giris = doc.splitTextToSize(
    `${onayZamaniYazi(form.onay_zamani).slice(0, 10)} tarihinden itibaren geçerli olmak üzere yan mamul fiyatlarımız aşağıda bilgilerinize sunulmuştur. İyi çalışmalar dileriz.`,
    contentWidth
  );
  doc.text(giris, marginX, y + 8.5);
  y += 8.5 + giris.length * 4.6 + bosluk * 0.6;

  // --- URUN VE FIYAT BILGILERI ---
  const altBaslik = (metin: string, hizala: "left" | "center" | "right" = "left") => ({
    content: metin,
    styles: { fillColor: [235, 235, 235] as [number, number, number], textColor: KOYU, fontStyle: "normal" as const, halign: hizala },
  });
  autoTable(doc, {
    startY: y,
    head: [
      [{ content: "ÜRÜN VE FİYAT BİLGİLERİ", colSpan: 7 }],
      [
        altBaslik("#", "center"),
        altBaslik("Ürün"),
        altBaslik("Ambalaj"),
        altBaslik("Birim Fiyat (TL/KG)", "right"),
        altBaslik("Vade", "center"),
        altBaslik("Ödeme"),
        altBaslik("Teslim"),
      ],
    ],
    body: form.kalemler.map((k, i) => [
      String(i + 1),
      k.urun,
      k.ambalaj,
      fiyatYazi(k.birim_fiyat),
      vadeYazi(k.vade_gun),
      k.odeme,
      k.teslim,
    ]),
    theme: "grid",
    styles: { font: "Roboto", fontSize: fontBoyu + 0.5, cellPadding: hucreDolgu + 0.4, textColor: KOYU, lineColor: [210, 210, 210], lineWidth: 0.15, valign: "middle" },
    headStyles: { fillColor: LACIVERT, textColor: 255, fontStyle: "bold", fontSize: fontBoyu + 0.5 },
    alternateRowStyles: { fillColor: [247, 248, 251] },
    columnStyles: {
      0: { cellWidth: 8, halign: "center", textColor: GRI },
      1: { cellWidth: 36, textColor: LACIVERT },
      2: { cellWidth: 26 },
      3: { cellWidth: 36, halign: "right", fontSize: fontBoyu + 2 },
      4: { cellWidth: 18, halign: "center" },
      5: { cellWidth: 28 },
      6: { cellWidth: contentWidth - 152 },
    },
    margin: { left: marginX, right: marginX, bottom: pageHeight - altBilgiY + 4 },
  });
  y = (doc as any).lastAutoTable.finalY + 4;
  doc.setFontSize(8.5);
  doc.setTextColor(...LACIVERT);
  doc.text("Birim fiyatlara KDV dahil değildir.", pageWidth - marginX, y, { align: "right" });

  // --- ALT BILGI: Unex antet adres blogu (sigorta talimati ile ayni) ---
  const satirY = (i: number) => altBilgiY + 4 + i * 4.6;
  doc.setDrawColor(...[220, 220, 220] as [number, number, number]);
  doc.setLineWidth(0.2);
  doc.line(marginX, altBilgiY, pageWidth - marginX, altBilgiY);
  UNEX_ANTET_IKONLARI_BASE64.forEach((ikon, i) => {
    doc.addImage(ikon, "PNG", marginX + 0.2, satirY(i) - 3.1, 2.4, 3.2);
  });
  doc.setDrawColor(...SEFTALI);
  doc.setLineWidth(0.3);
  doc.line(marginX + 0.6, satirY(2) + 0.2, marginX + 0.6, satirY(4) + 1);
  const altX = marginX + 4;
  doc.setFontSize(8.5);
  doc.setTextColor(...KOYU);
  doc.text("UNEX GIDA SAN. VE TİC. LTD. ŞTİ.", altX, satirY(0));
  doc.setTextColor(...GRI);
  doc.text(FORM_SIRKET.adres1, altX, satirY(1));
  doc.text(`${FORM_SIRKET.adres2}  ·  ${FORM_SIRKET.vergi}`, altX, satirY(2));
  let x = altX;
  const parca = (metin: string, renk: [number, number, number]) => {
    doc.setTextColor(...renk);
    doc.text(metin, x, satirY(3));
    x += doc.getTextWidth(metin);
  };
  parca("T ", SEFTALI); parca(`${FORM_SIRKET.tel}   `, GRI); parca("F ", SEFTALI); parca(FORM_SIRKET.faks, GRI);
  x = altX;
  doc.setTextColor(...MAVI);
  doc.textWithLink(FORM_SIRKET.eposta, x, satirY(4), { url: `mailto:${FORM_SIRKET.eposta}` });
  x += doc.getTextWidth(FORM_SIRKET.eposta);
  doc.setTextColor(...GRI);
  doc.text("  –  ", x, satirY(4));
  x += doc.getTextWidth("  –  ");
  doc.setTextColor(...MAVI);
  doc.textWithLink(FORM_SIRKET.web, x, satirY(4), { url: `http://${FORM_SIRKET.web}` });

  // Sertifika logolari (sag alt)
  const sertG = 62;
  const sertY = sertG / SERTIFIKA_LOGOLARI_ORAN;
  doc.addImage(SERTIFIKA_LOGOLARI_BASE64, "PNG", pageWidth - marginX - sertG, altBilgiY + 3.5, sertG, sertY);
  doc.setFontSize(7);
  doc.setTextColor(...GRI);
  doc.text(`${form.form_no}  ·  ${gunYazi(form.gecerlilik_bitis)} tarihine kadar geçerlidir`, pageWidth - marginX, altBilgiY + 5.5 + sertY + 3, { align: "right" });

  return { doc, sayfaSayisi: doc.getNumberOfPages() };
}

/** Formu tek sayfaya sigan en buyuk olcekle uretir (Fatura Talimati ile ayni yontem). */
export function fiyatFormuPdfOlustur(form: IcFiyatFormu): jsPDF {
  let olcek = 1.0;
  let sonuc = ciz(form, olcek);
  while (sonuc.sayfaSayisi > 1 && olcek > 0.5) {
    olcek = Math.round((olcek - 0.04) * 100) / 100;
    sonuc = ciz(form, olcek);
  }
  return sonuc.doc;
}

export function indirFiyatFormuPdf(form: IcFiyatFormu): void {
  fiyatFormuPdfOlustur(form).save(`${formDosyaAdi(form.form_no)}.pdf`);
}
