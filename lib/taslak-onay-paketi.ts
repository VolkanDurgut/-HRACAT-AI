import JSZip from "jszip";
import { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { buildCommercialInvoiceHtml } from "@/lib/invoice-builder";
import { buildPackingListHtml } from "@/lib/packing-list-builder";
import { buildCertificateOfOriginHtml } from "@/lib/certificate-of-origin-builder";
import { buildPhytosanitaryCertificateHtml } from "@/lib/phytosanitary-certificate-builder";
import { buildHealthCertificateHtml } from "@/lib/health-certificate-builder";
import { draftFiligranEkle } from "@/lib/watermark";
import { htmlToPdfBlob } from "@/lib/html-to-pdf";

function guvenliParca(ham: string | null | undefined, yedek: string): string {
  return (ham || yedek).trim().replace(/[\/\\:*?"<>|]/g, "");
}

function guvenliDosyaAdi(ham: string | null | undefined, yedek: string): string {
  return (ham || yedek).replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Musteri onayina gonderilecek taslak evrak paketini hazirlar:
 *  1) Commercial Invoice  - taze uretilip DRAFT filigranlanir
 *  2) Packing List        - taze uretilip DRAFT filigranlanir
 *  3) Draft BL             - zaten sisteme yuklenmis dosyanin kendisi (oldugu gibi)
 * Ucu de tek bir .zip dosyasi olarak tarayicida indirilir.
 */
export async function indirTaslakOnayPaketi(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[],
  draftBlUrl: string
): Promise<void> {
  const zip = new JSZip();
  const dosyaKisaAd = guvenliDosyaAdi(dosya.dosya_no, "dosya");
  const bookingNo = guvenliParca(rezervasyonlar[0]?.booking_no, "BOOKING");
  const proformaNo = guvenliParca(dosya.proforma_no, "PROFORMA");

  const ciHtml = draftFiligranEkle(buildCommercialInvoiceHtml(dosya, rezervasyonlar, konteynerler));
  const ciPdf = await htmlToPdfBlob(ciHtml);
  zip.file(`DRAFT- 1- INVOICE- ${bookingNo}- ${proformaNo}.pdf`, ciPdf);

  const plHtml = draftFiligranEkle(buildPackingListHtml(dosya, rezervasyonlar, konteynerler));
  const plPdf = await htmlToPdfBlob(plHtml);
  zip.file(`DRAFT- 2- PACKING- ${bookingNo}- ${proformaNo}.pdf`, plPdf);

  const blRes = await fetch(draftBlUrl);
  if (!blRes.ok) throw new Error("Draft BL dosyası indirilemedi.");
  const blBlob = await blRes.blob();
  zip.file(`DRAFT- 3- BL- ${bookingNo}- ${proformaNo}.pdf`, blBlob);

  const cooHtml = buildCertificateOfOriginHtml(dosya, rezervasyonlar, konteynerler);
  const cooPdf = await htmlToPdfBlob(cooHtml);
  zip.file(`DRAFT- 4- COO- ${bookingNo}- ${proformaNo}.pdf`, cooPdf);

  const phytoHtml = buildPhytosanitaryCertificateHtml(dosya, rezervasyonlar, konteynerler);
  const phytoPdf = await htmlToPdfBlob(phytoHtml);
  zip.file(`DRAFT- 5- PHYTO- ${bookingNo}- ${proformaNo}.pdf`, phytoPdf);

  const healthHtml = buildHealthCertificateHtml(dosya, rezervasyonlar, konteynerler);
  const healthPdf = await htmlToPdfBlob(healthHtml);
  zip.file(`DRAFT- 6- HEALTH- ${bookingNo}- ${proformaNo}.pdf`, healthPdf);

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Taslak_Onay_Paketi_${dosyaKisaAd}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}