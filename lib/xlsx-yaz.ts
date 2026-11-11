/**
 * En kucuk .xlsx yazici (30.10.2026). Yeni paket YOK: mevcut jszip ile Office Open XML paketlenir.
 * Cekirdek (stiller, sayfa XML'i) 11.11.2026'dan beri TEK YERDE: supabase/functions/_shared/xlsx-yaz.ts
 * (siparis raporu maili de ayni dosyayi uretir).
 */
import JSZip from "jszip";
import { xlsxParcalari, type XlsxSayfa } from "@/supabase/functions/_shared/xlsx-yaz";

export { XS, sutunHarfi, excelGunu, sayfaAdi, type XlsxHucre, type XlsxSayfa } from "@/supabase/functions/_shared/xlsx-yaz";

/** .xlsx dosyasini Blob olarak uretir. */
export async function xlsxOlustur(sayfalar: XlsxSayfa[]): Promise<Blob> {
  const zip = new JSZip();
  for (const f of xlsxParcalari(sayfalar)) zip.file(f.yol, f.icerik);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", compression: "DEFLATE" });
}
