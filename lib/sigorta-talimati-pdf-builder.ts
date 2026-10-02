import jsPDF from "jspdf";
import { ROBOTO_TR_BASE64 } from "@/lib/fonts/roboto-tr-base64";
import { UNEX_LOGO_BASE64 } from "@/lib/images/unex-logo-base64";
import { UNEX_ANTET_IKONLARI_BASE64 } from "@/lib/images/unex-antet-ikonlari-base64";
import {
  SigortaTalimatiAlanlari,
  SIGORTA_SABIT_GONDERICI,
  SIGORTA_SABIT_MALIN_CINSI,
  SIGORTA_SABIT_TASIMA_SEKLI,
  sigortaTalimatiTarihi,
} from "@/lib/sigorta-talimati";

/**
 * YÜK SİGORTASI TALİMATI PDF'i (talep: 02.10.2026). Yerlesim kullanicinin
 * verdigi Word sablonundan olculdu: sol ustte logo, ortada baslik, sagda
 * tarih, "ETIKET : DEGER" satirlari, altta yuk/agirlik satirlari ve sol altta
 * UNEX antet adres blogu. Metin jsPDF ile VEKTOR cizilir (Fatura Talimati
 * gibi) - keskin ve aranabilir; Turkce karakterler gomulu Roboto ile.
 * Bu belge TURKCE'dir (sigorta acentesine gider), diger PDF evraklarinin
 * "Ingilizce icerik" kuralinin bilincli istisnasi.
 */

const SIYAH: [number, number, number] = [20, 20, 20];
const TURUNCU: [number, number, number] = [240, 140, 100];
const MAVI: [number, number, number] = [5, 99, 193];
const GRI: [number, number, number] = [60, 60, 60];

const ETIKET_X = 21.5;
const IKI_NOKTA_X = 66;
const DEGER_X = 72;
const SAG_KENAR = 190;

export function buildSigortaTalimatiPdf(alanlar: SigortaTalimatiAlanlari, tarih: string = sigortaTalimatiTarihi()): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.addFileToVFS("Roboto-Regular.ttf", ROBOTO_TR_BASE64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFont("Roboto-Regular.ttf", "Roboto", "bold");
  doc.setFont("Roboto", "normal");
  doc.setTextColor(...SIYAH);

  // --- Antet: logo ---
  doc.addImage(UNEX_LOGO_BASE64, "PNG", 17, 6, 34, 34);

  // --- Baslik ve tarih ---
  doc.setFontSize(12.5);
  doc.setFont("Roboto", "bold");
  // Sablonda baslik sayfanin tam ortasinda degil, metin blogunun ortasinda.
  doc.text("YÜK SİGORTASI TALİMATI", 92, 54, { align: "center" });
  doc.setFont("Roboto", "normal");
  doc.setFontSize(11);
  doc.text(`TARİH: ${tarih}`, SAG_KENAR, 64, { align: "right" });

  // --- ETIKET : DEGER satirlari ---
  const satirlar: [string, string][] = [
    ["GÖNDERİCİ FİRMA", SIGORTA_SABIT_GONDERICI],
    ["MALIN CİNSİ", SIGORTA_SABIT_MALIN_CINSI],
    ["MAL BEDELİ", alanlar.malBedeli],
    ["GİDECEĞİ YER", alanlar.gidecegiYer],
    ["TAŞIMA ŞEKLİ", SIGORTA_SABIT_TASIMA_SEKLI],
    ["GEMİ ADI", alanlar.gemiAdi],
    ["SEFER NO", alanlar.seferNo],
    ["TESLİM ŞEKLİ", alanlar.teslimSekli],
    ["GEMİ KALKIŞI", alanlar.gemiKalkisi],
    ["TAŞIYICI ACENTE", alanlar.tasiyiciAcente],
    ["KONŞİMENTO NO", alanlar.konsimentoNo],
  ];

  doc.setFontSize(11);
  const satirAraligi = 10.5;
  const degerGenisligi = SAG_KENAR - DEGER_X;
  let y = 76;
  satirlar.forEach(([etiket, deger]) => {
    doc.text(etiket, ETIKET_X, y);
    doc.text(":", IKI_NOKTA_X, y);
    const parcalar = doc.splitTextToSize((deger || "-").trim() || "-", degerGenisligi) as string[];
    doc.text(parcalar, DEGER_X, y);
    y += satirAraligi + (parcalar.length - 1) * 5;
  });

  // --- Yuk ve agirlik satirlari ---
  y += 1;
  const altSatirlar = [alanlar.yukSatiri, alanlar.agirlikSatiri].map((s) => s.trim()).filter(Boolean);
  altSatirlar.forEach((s) => {
    const parcalar = doc.splitTextToSize(s, SAG_KENAR - ETIKET_X) as string[];
    doc.text(parcalar, ETIKET_X - 0.5, y);
    y += parcalar.length * 5.2;
  });

  // --- Alt bilgi (antet adres blogu) ---
  const altY = 272;
  const satirY = (i: number) => altY + i * 4.9;
  UNEX_ANTET_IKONLARI_BASE64.forEach((ikon, i) => {
    doc.addImage(ikon, "PNG", 17.2, satirY(i) - 3.3, 2.6, 3.4);
  });
  // Ikonlarin altinda devam eden ince turuncu cizgi (antetteki gibi)
  doc.setDrawColor(...TURUNCU);
  doc.setLineWidth(0.3);
  doc.line(17.6, satirY(2) + 0.2, 17.6, satirY(4) + 1);
  const altX = 21;
  doc.setFontSize(9);
  doc.setFont("Roboto", "bold");
  doc.setTextColor(...SIYAH);
  doc.text("UNEX GIDA SAN VE TIC. LTD. STI.", altX, satirY(0));
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...GRI);
  doc.text("İstiklal Mah. Cemal Ünlüsaraç Cad. No:20", altX, satirY(1));
  doc.text("Süleymanpaşa/Tekirdağ/Türkiye", altX, satirY(2));
  // "T +90 ...  F +90 ..." - T ve F harfleri turuncu (antetteki gibi)
  let x = altX;
  const parca = (metin: string, renk: [number, number, number]) => {
    doc.setTextColor(...renk);
    doc.text(metin, x, satirY(3));
    x += doc.getTextWidth(metin);
  };
  parca("T", TURUNCU); parca("+90 282 440 0 870  ", GRI); parca("F", TURUNCU); parca("+90 282 440 0 869", GRI);
  // E-posta ve web - tiklanabilir
  x = altX;
  doc.setTextColor(...MAVI);
  const eposta = "info@unex.com.tr";
  doc.textWithLink(eposta, x, satirY(4), { url: "mailto:info@unex.com.tr" });
  const epostaW = doc.getTextWidth(eposta);
  doc.setDrawColor(...MAVI); doc.setLineWidth(0.15);
  doc.line(x, satirY(4) + 0.5, x + epostaW, satirY(4) + 0.5);
  x += epostaW;
  doc.setTextColor(...GRI);
  doc.text(" – ", x, satirY(4));
  x += doc.getTextWidth(" – ");
  doc.setTextColor(...MAVI);
  const web = "www.unex.com.tr";
  doc.textWithLink(web, x, satirY(4), { url: "http://www.unex.com.tr" });
  doc.line(x, satirY(4) + 0.5, x + doc.getTextWidth(web), satirY(4) + 0.5);

  return doc;
}

export function indirSigortaTalimatiPdf(alanlar: SigortaTalimatiAlanlari, dosyaAdi: string): void {
  buildSigortaTalimatiPdf(alanlar).save(dosyaAdi);
}
