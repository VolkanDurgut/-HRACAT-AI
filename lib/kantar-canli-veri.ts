/** Kantar Paneli canli kantar bilgisi - veri okuma (24.11.2026). Hesap / tipler: lib/kantar-canli.ts. */
import { supabase } from "@/lib/supabase";
import { kantarCanliHazirla, type KantarCanli } from "@/lib/kantar-canli";

/** kantar_canli (migration 20261124120000, salt okunur). Yetki yoksa / fonksiyon yoksa null: bolumler gizli kalir, sayfa bozulmaz. */
export async function kantarCanliOku(): Promise<KantarCanli | null> {
  const { data, error } = await supabase.rpc("kantar_canli");
  if (error) return null;
  return kantarCanliHazirla(data);
}

/**
 * 26.11.2026 Kantar Paneli ana sekme sayilari (yalniz secili sekme cizilir; sayilar burada hafif sorgularla).
 * Fonksiyon yoksa / yetki yoksa o sayi null (sekme gizlenir ya da "–").
 */
export type KantarSekmeSayilari = { satis: number | null; alis: number | null; gemi: number | null; gemiler: { id: string; gemi_adi: string }[] };
export async function kantarSekmeSayilariOku(): Promise<KantarSekmeSayilari> {
  const [s, a, g] = await Promise.all([
    supabase.rpc("kantar_ic_is_emirleri"),
    supabase.rpc("kantar_ic_alis_siparisleri"),
    supabase.rpc("kantar_gemi_tahliyeleri"),
  ]);
  const gemiler = g.error ? [] : ((g.data || []) as { id: string; gemi_adi: string }[]).map((x) => ({ id: x.id, gemi_adi: x.gemi_adi }));
  return {
    satis: s.error ? null : (s.data || []).length,
    alis: a.error ? null : (a.data || []).length,
    gemi: g.error ? null : gemiler.length,
    gemiler,
  };
}

/** Eslesmeyen tartimi acik gemiye bagla (migration 20261126000000). */
export async function tartimiGemiyeBagla(gemiId: string, kayitNo: number) {
  return supabase.rpc("ic_gemi_tartim_bagla", { p_gemi: gemiId, p_kayit_no: kayitNo });
}
