/**
 * Proforma Yukle: sistem proformasini tarayicida, yapay zekasiz okur (06.11.2026; hesap: okuma.ts).
 * PDF bilgisi + metni unpdf ile (fatura okumasiyla ayni kutuphane), kayitli taslak `proformalar`
 * tablosundan (RLS: yalniz kendi sirketi). Hata olursa sessizce "sistem_disi" doner: cagiran
 * mevcut yapay zeka okumasina gecer, akis hicbir durumda bu adim yuzunden durmaz.
 */
import { supabase } from "@/lib/supabase";
import { taslakNormalle } from "@/lib/proforma/belge";
import { sistemProformaNo, sistemProformasiCoz, sistemUretimiMi, type SistemOkumaSonucu } from "@/lib/proforma/okuma";

async function pdfBilgisi(dosya: File): Promise<{ baslik: string | null; olusturan: string | null; metin: string } | null> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await dosya.arrayBuffer()));
    const meta = await pdf.getMetadata().catch(() => null);
    const info = (meta?.info || {}) as { Title?: unknown; Creator?: unknown };
    const { text } = await extractText(pdf, { mergePages: true });
    return {
      baslik: typeof info.Title === "string" ? info.Title : null,
      olusturan: typeof info.Creator === "string" ? info.Creator : null,
      metin: Array.isArray(text) ? text.join("\n") : text,
    };
  } catch {
    return null;
  }
}

export async function sistemProformasiOku(dosya: File, companyId: string | null): Promise<SistemOkumaSonucu> {
  if (!companyId) return { tur: "sistem_disi" };
  const pdf = await pdfBilgisi(dosya);
  if (!pdf) return { tur: "sistem_disi" };
  const no = sistemProformaNo(pdf.baslik, pdf.metin);
  if (!no || !sistemUretimiMi(pdf.olusturan)) return { tur: "sistem_disi" };
  try {
    const { data, error } = await supabase.from("proformalar").select("taslak")
      .eq("company_id", companyId).eq("proforma_no", no).maybeSingle();
    if (error) return { tur: "sistem_disi" };
    const taslak = data ? taslakNormalle((data as { taslak: unknown }).taslak) : null;
    return sistemProformasiCoz(pdf, () => taslak);
  } catch {
    return { tur: "sistem_disi" };
  }
}
