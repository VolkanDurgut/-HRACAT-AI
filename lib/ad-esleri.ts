/**
 * Liman ve firma eş sözlüğü (16.11.2026). Tablo: ad_esleri (migration 20261116210000_veri_tutarliligi.sql).
 * Kullanıldığı yerler: sipariş ↔ yükleme planı eşleşmesi (siparis_listesi_veri), navlun tablosu / raporu (edge
 * navlun-tablosu), Kontrol Merkezi tutarsızlık kontrolleri. Evrak kontrolleri BİLEREK kullanmaz (birebir yazım arar).
 */
import { supabase } from "@/lib/supabase";

export type AdEsiTuru = "liman" | "firma";
export type AdEsiKaydi = { id: string; tur: AdEsiTuru; kaynak: string; hedef: string; kaynak_ad: string; hedef_ad: string; ekleyen: string | null; created_at: string };

export async function adEsleriOku(): Promise<AdEsiKaydi[]> {
  const { data, error } = await supabase.from("ad_esleri").select("id,tur,kaynak,hedef,kaynak_ad,hedef_ad,ekleyen,created_at").order("tur").order("hedef").order("kaynak");
  if (error) throw new Error(error.message);
  return (data || []) as AdEsiKaydi[];
}

export async function adEsiKaydet(tur: AdEsiTuru, yazim: string, dogru: string): Promise<void> {
  const { error } = await supabase.rpc("ad_esi_kaydet", { p_tur: tur, p_yazim: yazim, p_dogru: dogru });
  if (error) throw new Error(error.message);
}

export async function adEsiSil(id: string): Promise<void> {
  const { error } = await supabase.rpc("ad_esi_sil", { p_id: id });
  if (error) throw new Error(error.message);
}

/** Aynı doğru ada bağlı yazımları gruplar (ekranda "DAR ES SALAAM ← DAR SALAAM, DAR ES SELAM"). */
export function esGruplari(liste: AdEsiKaydi[], tur: AdEsiTuru): { hedef: string; hedefAd: string; esler: AdEsiKaydi[] }[] {
  const m = new Map<string, { hedef: string; hedefAd: string; esler: AdEsiKaydi[] }>();
  for (const e of liste) {
    if (e.tur !== tur) continue;
    const g = m.get(e.hedef) || { hedef: e.hedef, hedefAd: e.hedef_ad, esler: [] };
    g.esler.push(e);
    m.set(e.hedef, g);
  }
  return Array.from(m.values()).sort((a, b) => a.hedef.localeCompare(b.hedef, "tr"));
}
