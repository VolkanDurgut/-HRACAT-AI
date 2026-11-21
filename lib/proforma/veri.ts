/**
 * Proforma Olustur sayfasinin veritabani sorgulari (21.11.2026'dan itibaren yeni sorgular burada; CLAUDE.md kurali).
 */
import { supabase } from "@/lib/supabase";
import { silinenNormalle, type SilinenProforma } from "@/lib/proforma/silinen";

/** Silinen proformalar (denetim kaydindan; ayni numarayla yeniden var olanlar haric). */
export async function silinenProformalarOku(limit = 300): Promise<SilinenProforma[]> {
  const { data, error } = await supabase.rpc("proforma_silinenler", { p_limit: limit });
  if (error) throw new Error(error.message);
  return ((data || []) as Record<string, unknown>[]).map(silinenNormalle).filter((x): x is SilinenProforma => x !== null);
}

/** Silinen proformayi ayni numarayla geri yukler; Siparis Listesi'nde yeniden "Onay bekleyen" olur. */
export async function proformaGeriYukle(denetimId: string): Promise<{ id: string; proforma_no: string }> {
  const { data, error } = await supabase.rpc("proforma_geri_yukle", { p_denetim: denetimId });
  if (error) throw new Error(error.message);
  const d = (data || {}) as { id?: string; proforma_no?: string };
  if (!d.id || !d.proforma_no) throw new Error("Geri yükleme sonucu okunamadı.");
  return { id: d.id, proforma_no: d.proforma_no };
}
