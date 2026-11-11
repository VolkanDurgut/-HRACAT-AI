/**
 * SIPARIS LISTESI + YUKLEME PLANI - veri erisimi (11.11.2026).
 * Okuma: siparis_listesi() / yukleme_plani() RPC ("proformalar" veya "analiz" yetkisi).
 * Tek yazma: on odeme isareti - siparis_on_odeme_isaretle ("proformalar" yetkisi).
 */
import { supabase } from "@/lib/supabase";
import { planNormalize, siparisNormalize, type PlanSatiri, type SiparisSatiri } from "@/lib/siparis/liste";

export async function siparisListesiOku(): Promise<SiparisSatiri[]> {
  const { data, error } = await supabase.rpc("siparis_listesi");
  if (error) throw new Error(error.message);
  return ((data || []) as Record<string, unknown>[]).map(siparisNormalize);
}

export async function yuklemePlaniOku(): Promise<PlanSatiri[]> {
  const { data, error } = await supabase.rpc("yukleme_plani");
  if (error) throw new Error(error.message);
  return ((data || []) as Record<string, unknown>[]).map(planNormalize);
}

export async function onOdemeIsaretle(proformaNo: string, alindi: boolean): Promise<void> {
  const { error } = await supabase.rpc("siparis_on_odeme_isaretle", { p_proforma_no: proformaNo, p_alindi: alindi });
  if (error) throw new Error(error.message);
}
