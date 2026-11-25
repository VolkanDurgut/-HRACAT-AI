// ============================================================================
// VGM RAPORU PDF CIZIMI (10.11.2026) - uygulama ("VGM Indir") ve vgm-rapor edge fonksiyonu AYNI cizimi kullanir.
// Saf modul: jsPDF / autoTable disaridan verilir (uygulama npm paketini, edge npm: specifier'ini kullanir).
// Turkce karakterler icin Roboto (OFL-1.1) gomulur; "bold" da ayni dosyaya baglanir (yedek fonta dusmesin).
// ============================================================================

export type VgmPdfKonteyneri = { no: string | null; vgm: number | null; tare: number | null };
export type VgmPdfVerisi = {
  dosyaNo: string | null;
  bookingNo: string | null;
  gemi: string | null;
  yuklemeLimani: string | null;
  varisLimani: string | null;
  konteynerler: VgmPdfKonteyneri[];
  /** Alt bilgi zamani, hazir metin ("10.11.2026 09:15:00"). */
  olusturma: string;
};

// deno-lint-ignore no-explicit-any
type JsPdfBelgesi = any;
// deno-lint-ignore no-explicit-any
type AutoTable = (doc: JsPdfBelgesi, ayar: any) => void;

/** SOLAS VGM Metot 2 aciklamasi: her satirda ayni, sabit metin. */
export const VGM_METHOD_METNI = "Weight of cargo added to container's tare weight";

/** Dosya adi icin guvenli kisa ad. */
export function vgmPdfDosyaAdi(dosyaNo: string | null | undefined): string {
  return `VGM_Raporu_${(dosyaNo || "dosya").replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
}

/** Logo (PNG base64 + piksel olcusu); 25.11.2026 (kullanici: "VGM raporu icin Unex logosu eklemeliyiz"). */
export type VgmPdfLogo = { base64: string; en: number; boy: number };

/** Yatay A4 VGM raporunu verilen jsPDF belgesine cizer. logo verilirse sag ust koseye (22 mm genislik) yerlestirilir. */
export function vgmPdfCiz(doc: JsPdfBelgesi, autoTable: AutoTable, fontBase64: string, v: VgmPdfVerisi, logo?: VgmPdfLogo | null): void {
  doc.addFileToVFS("Roboto-Regular.ttf", fontBase64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFont("Roboto-Regular.ttf", "Roboto", "bold");
  doc.setFont("Roboto");

  if (logo && logo.base64 && logo.en > 0 && logo.boy > 0) {
    const genislik = 22;
    const yukseklik = (genislik * logo.boy) / logo.en;
    doc.addImage(logo.base64, "PNG", doc.internal.pageSize.getWidth() - 14 - genislik, 8, genislik, yukseklik);
  }

  doc.setFontSize(16);
  doc.text("VGM Raporu", 14, 18);

  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  let y = 27;
  const bilgiSatiri = (label: string, deger: string) => {
    doc.text(`${label}: ${deger}`, 14, y);
    y += 5.5;
  };
  bilgiSatiri("Booking No", v.bookingNo || "-");
  bilgiSatiri("Gemi Adı", v.gemi || "-");
  bilgiSatiri("Yükleme Limanı", v.yuklemeLimani || "-");
  bilgiSatiri("Varış Limanı", v.varisLimani || "-");
  doc.setTextColor(0, 0, 0);

  const kg = (n: number) => `${n.toLocaleString("tr-TR")} KG`;
  const rows = v.konteynerler.map((k) => {
    // "Weight" = kargo net agirligi = VGM - Tare (SOLAS formatinda boyle tanimlanir)
    const weight = k.vgm != null && k.tare != null ? k.vgm - k.tare : null;
    return [
      k.no || "-",
      weight != null ? kg(weight) : "-",
      k.tare != null ? kg(k.tare) : "-",
      k.vgm != null ? kg(k.vgm) : "-",
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
  doc.text(`Oluşturulma: ${v.olusturma}`, 14, sayfaYuksekligi - 10);
}
