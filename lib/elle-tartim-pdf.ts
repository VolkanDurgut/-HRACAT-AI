import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ROBOTO_TR_BASE64 } from "@/lib/fonts/roboto-tr-base64";
import type { ElleTartimKaydi } from "@/lib/elle-tartim";

const kg = (n: number) => `${n.toLocaleString("tr-TR")} KG`;

/**
 * Elle girilen tartim kaydinin PDF'i (DBA yerine konteynere baglanir).
 * Resmi DBA OLMADIGI ust bantta acikca yazar. Turkce icin Roboto gomulur
 * (vgm-pdf-builder ile ayni yontem).
 */
export function elleTartimPdf(kayit: ElleTartimKaydi, dosyaNo: string | null, muhurNo: string | null): Blob {
  const doc = new jsPDF();
  doc.addFileToVFS("Roboto-Regular.ttf", ROBOTO_TR_BASE64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFont("Roboto-Regular.ttf", "Roboto", "bold");
  doc.setFont("Roboto");

  doc.setFontSize(16);
  doc.setTextColor(40, 52, 116);
  doc.text("ELLE GİRİLEN TARTIM KAYDI", 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Konteyner ${kayit.konteyner_no}${dosyaNo ? ` · Dosya ${dosyaNo}` : ""}`, 14, 27);

  // Uyari bandi
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(217, 119, 6);
  doc.roundedRect(14, 32, 182, 17, 2, 2, "FD");
  doc.setTextColor(146, 64, 14);
  doc.setFontSize(10);
  doc.text("Bu belge resmî DBA (Doğrulanmış Brüt Ağırlık) belgesi DEĞİLDİR.", 18, 39);
  doc.setFontSize(9);
  doc.text("DBA belgesi sisteme yüklenemediği için tartım bilgileri İhracat AI'a elle girilmiştir.", 18, 45);

  const satirlar: [string, string][] = [
    ["Konteyner no", kayit.konteyner_no],
    ["Mühür no", muhurNo || "-"],
    ["Araç plakası", kayit.arac_plaka],
    ["Tartım yeri", kayit.tartim_yeri],
    ["Giriş tarihi - saati", kayit.giris_tarih_saat || "-"],
    ["Çıkış (tartım) tarihi - saati", kayit.tartim_tarih_saat],
    ["Konteyner darası", kg(kayit.konteyner_dara_kg)],
    ["Net yük", kg(kayit.net_yuk_kg)],
    ["VGM (doğrulanmış brüt ağırlık)", `${kg(kayit.dogrulanmis_brut_agirlik_kg)}${kayit.vgm_hesaplanan ? "  (net + dara)" : ""}`],
    ["Liman belge no", kayit.liman_belge_no || "-"],
    ["Açıklama", kayit.aciklama || "-"],
    ["Kaydeden", kayit.kaydeden || "-"],
    ["Kayıt zamanı", new Date(kayit.kayit_zamani).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })],
  ];
  autoTable(doc, {
    startY: 56,
    body: satirlar,
    styles: { font: "Roboto", fontSize: 10, cellPadding: 3, textColor: [30, 41, 59] },
    columnStyles: { 0: { cellWidth: 70, textColor: [100, 116, 139] } },
    theme: "grid",
  });

  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("İhracat AI · ihracatasistanim.com", 14, doc.internal.pageSize.getHeight() - 10);
  return doc.output("blob");
}
