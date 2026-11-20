/**
 * Yonetici Asistani - veri erisimi (21.11.2026). Hepsi yalniz yonetici (RPC icinde e-posta kontrolu):
 * yonetici_asistani() okuma, asistan_isaretle() "Gonderdim", asistan_isaret_geri_al() geri al.
 * Sabah ozet onizleme / test: edge asistan-ozet ({deneme: true} mail gondermez; {test: true} yalniz test adresine).
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

export async function ozetMailiCagir(govde: { deneme: true } | { test: true }): Promise<{ konu?: string; html?: string; gonderildi?: boolean; alici?: string[]; hata?: string }> {
  const { data, error } = await supabase.functions.invoke("asistan-ozet", { body: govde });
  if (error) {
    let mesaj = error.message;
    try { const c = await (error as { context?: Response }).context?.json(); if (c?.hata || c?.error) mesaj = c.hata || c.error; } catch { /* metin */ }
    throw new Error(mesaj);
  }
  return (data || {}) as { konu?: string; html?: string; gonderildi?: boolean; alici?: string[] };
}
