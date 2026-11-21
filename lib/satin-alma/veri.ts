import { supabase } from "@/lib/supabase";

/**
 * Satin alma veritabani okumalari (21.11.2026). CLAUDE.md: yeni sorgular yalniz burada.
 * Tablolar istemciye SADECE okunur (RLS: "satin_alma" yetkisi); yazmalar edge function ile.
 */
export type TopluSatiri = {
  id: string;
  toplu_no: string;
  test: boolean;
  olusturma: string;
  olusturan_email: string | null;
  onay_maili: "gonderildi" | "hata" | null;
  onay_maili_hata: string | null;
};

/** Haftalik toplu listeler (son 100). */
export async function topluListeleriOku(companyId: string): Promise<{ veri: TopluSatiri[]; hata: string | null }> {
  const { data, error } = await supabase
    .from("satin_alma_toplu")
    .select("id, toplu_no, test, olusturma, olusturan_email, onay_maili, onay_maili_hata")
    .eq("company_id", companyId)
    .order("olusturma", { ascending: false })
    .limit(100);
  return { veri: (data || []) as TopluSatiri[], hata: error ? error.message : null };
}
