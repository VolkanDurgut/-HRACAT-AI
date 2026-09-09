import JSZip from "jszip";
import { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { buildCommercialInvoiceHtml } from "@/lib/invoice-builder";
import { buildPackingListHtml } from "@/lib/packing-list-builder";
import { draftFiligranEkle } from "@/lib/watermark";
import { htmlToPdfBlob } from "@/lib/html-to-pdf";

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

  const ciHtml = draftFiligranEkle(buildCommercialInvoiceHtml(dosya, rezervasyonlar, konteynerler));
  const ciPdf = await htmlToPdfBlob(ciHtml);
  zip.file(`1_Commercial_Invoice_DRAFT_${dosyaKisaAd}.pdf`, ciPdf);

  const plHtml = draftFiligranEkle(buildPackingListHtml(dosya, rezervasyonlar, konteynerler));
  const plPdf = await htmlToPdfBlob(plHtml);
  zip.file(`2_Packing_List_DRAFT_${dosyaKisaAd}.pdf`, plPdf);

  const blRes = await fetch(draftBlUrl);
  if (!blRes.ok) throw new Error("Draft BL dosyası indirilemedi.");
  const blBlob = await blRes.blob();
  zip.file(`3_Draft_BL_${dosyaKisaAd}.pdf`, blBlob);

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