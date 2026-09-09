import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { ROBOTO_TR_BASE64 } from "@/lib/fonts/roboto-tr-base64";

/** Dosya adi icin guvenli (Turkce karakter/bosluk icermeyen) kisa ad uretir. */
function guvenliDosyaAdi(dosyaNo: string | null | undefined): string {
  const ham = dosyaNo || "dosya";
  return ham.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * VGM raporunu (Konteyner No / Plaka / VGM / Tare tablosu) gercek bir PDF
 * dosyasi olarak uretir ve tarayicida indirir. Turkce karakterlerin dogru
 * gorunmesi icin Roboto fontu (Latin + Latin-Ext, Google Fonts OFL-1.1)
 * PDF'e gomulur - varsayilan jsPDF fontlari Turkce'yi desteklemez.
 */
export function indirVgmPdf(dosya: Dosya, rezervasyonlar: Rezervasyon[], konteynerler: Konteyner[]): void {
  // Yatay (landscape) - 5 kolonlu SOLAS VGM formatinin rahat sigmasi icin
  const doc = new jsPDF({ orientation: "landscape" });

  doc.addFileToVFS("Roboto-Regular.ttf", ROBOTO_TR_BASE64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  // "bold" varyanti da AYNI dosyaya baglaniyor (gercek kalin hali yok, ama
  // jsPDF/autoTable bazi hucrelerde varsayilan olarak "bold" arayabiliyor -
  // bu kayit olmazsa sessizce Turkce'yi desteklemeyen bir yedek fonta
  // dusup ç/ğ/ı/ş/ö/ü karakterlerini bozabilir).
  doc.addFont("Roboto-Regular.ttf", "Roboto", "bold");
  doc.setFont("Roboto");

  const rez = rezervasyonlar[0];

  doc.setFontSize(16);
  doc.text("VGM Raporu", 14, 18);

  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  let y = 27;
  const bilgiSatiri = (label: string, deger: string) => {
    doc.text(`${label}: ${deger}`, 14, y);
    y += 5.5;
  };
  bilgiSatiri("Booking No", rez?.booking_no || "-");
  bilgiSatiri("Gemi Adı", rez?.gemi_adi || "-");
  bilgiSatiri("Yükleme Limanı", dosya.yuklenme_limani || rez?.yuklenme_limani || "-");
  bilgiSatiri("Varış Limanı", dosya.varis_limani || "-");
  doc.setTextColor(0, 0, 0);

  // SOLAS VGM Metot 2 aciklamasi: her satirda ayni, sabit metin.
  const VGM_METHOD_METNI = "Weight of cargo added to container's tare weight";

  const rows = konteynerler.map((k) => {
    // "Weight" = kargo net agirligi = VGM - Tare (SOLAS formatinda boyle tanimlanir)
    const weight = k.vgm_kg != null && k.tare_kg != null ? k.vgm_kg - k.tare_kg : null;
    return [
      k.konteyner_no || "-",
      weight != null ? `${weight.toLocaleString("tr-TR")} KG` : "-",
      k.tare_kg != null ? `${k.tare_kg.toLocaleString("tr-TR")} KG` : "-",
      k.vgm_kg != null ? `${k.vgm_kg.toLocaleString("tr-TR")} KG` : "-",
      VGM_METHOD_METNI,
    ];
  });

  autoTable(doc, {
    startY: y + 4,
    head: [["Container number", "Weight", "Tare weight", "VGM", "VGM method"]],
    body: rows,
    styles: { font: "Roboto", fontSize: 10, cellPadding: 3 },
    headStyles: { font: "Roboto", fillColor: [16, 71, 92], textColor: 255, fontStyle: "normal" },
    theme: "grid",
  });

  const sayfaYuksekligi = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Oluşturulma: ${new Date().toLocaleString("tr-TR")}`,
    14,
    sayfaYuksekligi - 10
  );

  doc.save(`VGM_Raporu_${guvenliDosyaAdi(dosya.dosya_no)}.pdf`);
}