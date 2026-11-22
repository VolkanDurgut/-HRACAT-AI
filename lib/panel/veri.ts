/**
 * Ana Panel veritabani sorgulari (22.11.2026'dan itibaren yeni sorgular burada; CLAUDE.md kurali).
 */
import { supabase } from "@/lib/supabase";
import { isEmirleriHazirla, type IsEmriSatiri } from "@/lib/panel/is-emirleri";

/** Dosyasi henuz acilmamis is emirleri (rezervasyonlu + on odemesi alinmis). panel_is_emirleri ~1 sn; seyrek cagrilir. */
export async function isEmirleriOku(): Promise<{ rezervasyonlu: IsEmriSatiri[]; onOdeme: IsEmriSatiri[] }> {
  const { data, error } = await supabase.rpc("panel_is_emirleri");
  if (error) throw new Error(error.message);
  return isEmirleriHazirla(data as { satirlar?: unknown; aksiyonlar?: unknown });
}
