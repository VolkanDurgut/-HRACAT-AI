/** Kantar Paneli canli kantar bilgisi - veri okuma (24.11.2026). Hesap / tipler: lib/kantar-canli.ts. */
import { supabase } from "@/lib/supabase";
import { kantarCanliHazirla, type KantarCanli } from "@/lib/kantar-canli";

/** kantar_canli (migration 20261124120000, salt okunur). Yetki yoksa / fonksiyon yoksa null: bolumler gizli kalir, sayfa bozulmaz. */
export async function kantarCanliOku(): Promise<KantarCanli | null> {
  const { data, error } = await supabase.rpc("kantar_canli");
  if (error) return null;
  return kantarCanliHazirla(data);
}
