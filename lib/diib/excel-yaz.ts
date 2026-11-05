/**
 * DIIB takibini Burak Bey'in Excel BICIMINDE disari verir (04.11.2026). Veri sistemden gelir;
 * Excel'den iceri hicbir sey ALINMAZ. 06.11.2026: XML uretimi _shared/diib-excel.ts'te (17:00 DIIB
 * raporu e-postasi da ayni dosyayi ekler); burada yalniz jszip ile paketlenir.
 */
import JSZip from "jszip";
import type { DiibOzeti, DiibSatiri } from "@/lib/diib/hesap";
import { diibExcelDosyalari } from "@/supabase/functions/_shared/diib-excel";

export async function diibExcelOlustur(ozetler: DiibOzeti[], satirlar: DiibSatiri[]): Promise<Blob> {
  const zip = new JSZip();
  for (const f of diibExcelDosyalari(ozetler, satirlar)) zip.file(f.yol, f.icerik);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
