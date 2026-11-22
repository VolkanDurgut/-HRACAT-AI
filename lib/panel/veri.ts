/**
 * Ana Panel veritabani sorgulari (22.11.2026'dan itibaren yeni sorgular burada; CLAUDE.md kurali).
 */
import { supabase } from "@/lib/supabase";
import { isEmirleriHazirla, type IsEmriSatiri } from "@/lib/panel/is-emirleri";
import { odemeBekleyenleriHazirla, type OdemeBekleyen } from "@/lib/panel/is-listesi";
import { GECMIS_GUN } from "@/lib/panel/gunluk-yukleme";
import { efektifTartimBilgisi } from "@/lib/cutoff-utils";

/** Dosyasi henuz acilmamis is emirleri (rezervasyonlu + on odemesi alinmis). panel_is_emirleri ~1 sn; seyrek cagrilir. */
export async function isEmirleriOku(): Promise<{ rezervasyonlu: IsEmriSatiri[]; onOdeme: IsEmriSatiri[] }> {
  const { data, error } = await supabase.rpc("panel_is_emirleri");
  if (error) throw new Error(error.message);
  return isEmirleriHazirla(data as { satirlar?: unknown; aksiyonlar?: unknown });
}

/**
 * 23.11.2026 Tek is listesi: odeme bekleyen siparisler (Siparis Listesi "Onay bekleyen"; panel_odeme_bekleyenleri,
 * migration 20261123090000, ~0,8 sn). is emirleriyle AYNI anda (paralel) okunur.
 */
export async function odemeBekleyenleriOku(): Promise<OdemeBekleyen[]> {
  const { data, error } = await supabase.rpc("panel_odeme_bekleyenleri");
  if (error) throw new Error(error.message);
  return odemeBekleyenleriHazirla(data);
}

/**
 * 23.11.2026 Gunluk yukleme hedefi: son GECMIS_GUN gunde DBA'si yuklenen konteynerlerin TARTIM gunleri (Bugun Yuklenen
 * sayaciyla ayni kural: efektifTartimBilgisi). Kapasite ve is gunleri bundan (lib/panel/gunluk-yukleme.ts).
 */
export async function yuklemeGecmisiOku(companyId: string): Promise<string[]> {
  const bas = new Date(Date.now() - GECMIS_GUN * 86400000).toISOString();
  const { data, error } = await supabase.from("konteynerler")
    .select("dba_yukleme_tarihi, tartim:dba_kontrol_sonucu->>tartim_tarih_saat")
    .eq("company_id", companyId).not("dba_dosya_url", "is", null).gte("dba_yukleme_tarihi", bas)
    .limit(5000);
  if (error) throw new Error(error.message);
  return ((data || []) as { dba_yukleme_tarihi: string | null; tartim: string | null }[])
    .map((k) => efektifTartimBilgisi({ tartim_tarih_saat: k.tartim || undefined }, k.dba_yukleme_tarihi)?.gun || null)
    .filter((g): g is string => !!g);
}
