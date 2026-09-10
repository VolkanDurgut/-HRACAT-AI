import jsPDF from "jspdf";
import { ROBOTO_TR_BASE64 } from "@/lib/fonts/roboto-tr-base64";

/** Dosya adi icin guvenli (Turkce karakter/bosluk icermeyen) kisa ad uretir. */
function guvenliDosyaAdi(dosyaNo: string | null | undefined): string {
  const ham = dosyaNo || "dosya";
  return ham.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Fatura Talimati ekranindaki (mail ile gonderilecek olanla BIREBIR AYNI)
 * metni, tek sayfalik gercek bir PDF olarak uretir ve tarayicida indirir.
 * Icerik uzunsa (cok konteyner/urun varsa) yazi boyutu, tek sayfaya sigana
 * kadar kademeli olarak kucultulur - asla ikinci sayfaya tasmaz.
 * Turkce karakterlerin dogru gorunmesi icin Roboto fontu gomulur (VGM
 * raporundaki ile ayni font/teknik).
 */
export function indirFaturaTalimatiPdf(dosyaNo: string | null | undefined, konu: string, metin: string): void {
  const doc = new jsPDF(); // dikey (portrait) A4, mm birimi - varsayilan

  doc.addFileToVFS("Roboto-Regular.ttf", ROBOTO_TR_BASE64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFont("Roboto-Regular.ttf", "Roboto", "bold");
  doc.setFont("Roboto");

  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - marginX * 2;
  const altSinir = pageHeight - 12; // alt bosluk payi

  // Baslik
  doc.setFont("Roboto", "bold");
  doc.setFontSize(15);
  doc.setTextColor(0, 0, 0);
  doc.text("Fatura Talimati", marginX, 16);

  // Konu (varsa), basligin altinda gri/kucuk
  let govdeBaslangicY = 24;
  if (konu) {
    doc.setFont("Roboto", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(konu, marginX, 22);
    govdeBaslangicY = 28;
  }

  // Govde metnini, TEK SAYFAYA sigacak sekilde, gerekirse yazi boyutunu
  // kademeli kuculterek hazirla (once dene, sigmiyorsa kucult, tekrar dene).
  let fontSize = 9.5;
  const minFontSize = 6;
  let satirlar: string[] = [];
  let satirYuksekligi = 0;

  while (fontSize >= minFontSize) {
    doc.setFont("Roboto", "normal");
    doc.setFontSize(fontSize);
    satirlar = doc.splitTextToSize(metin, usableWidth);
    satirYuksekligi = fontSize * 0.5; // mm - VGM raporundaki 10pt/5.5mm oranina yakin
    const gerekliYukseklik = satirlar.length * satirYuksekligi;
    if (govdeBaslangicY + gerekliYukseklik <= altSinir) break;
    fontSize -= 0.25;
  }

  doc.setFont("Roboto", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(20, 20, 20);
  let y = govdeBaslangicY;
  for (const satir of satirlar) {
    doc.text(satir, marginX, y);
    y += satirYuksekligi;
  }

  doc.save(`Fatura_Talimati_${guvenliDosyaAdi(dosyaNo)}.pdf`);
}