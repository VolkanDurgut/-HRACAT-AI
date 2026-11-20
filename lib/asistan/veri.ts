/**
 * Yonetici Asistani - veri erisimi (21.11.2026). Hepsi yalniz yonetici (RPC icinde e-posta kontrolu):
 * yonetici_asistani() okuma, asistan_isaretle() "Gonderdim", asistan_isaret_geri_al() geri al.
 */
import { supabase } from "@/lib/supabase";
import { asistanVerisiNormalize, type AsistanVerisi, type GorevTuru } from "@/lib/asistan/gorunum";

export async function asistanVerisiOku(): Promise<AsistanVerisi> {
  const { data, error } = await supabase.rpc("yonetici_asistani");
  if (error) throw new Error(error.message);
  return asistanVerisiNormalize(data);
}

export async function gorevIsaretle(anahtar: string, tur: GorevTuru, ozet: string): Promise<void> {
  const { error } = await supabase.rpc("asistan_isaretle", { p_anahtar: anahtar, p_tur: tur, p_ozet: ozet.slice(0, 500) });
  if (error) throw new Error(error.message);
}

export async function gorevIsaretiniGeriAl(anahtar: string): Promise<void> {
  const { error } = await supabase.rpc("asistan_isaret_geri_al", { p_anahtar: anahtar });
  if (error) throw new Error(error.message);
}
