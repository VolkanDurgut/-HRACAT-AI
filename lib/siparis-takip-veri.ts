import { supabase } from "@/lib/supabase";
import type { TakipDosyasi, TakipKonteyneri } from "@/lib/siparis-takip";

/**
 * Siparis takibi icin gereken dosya + konteyner verisini ceker (07.10.2026).
 * Bir dosya kalemi BASKA bir siparise etiketlenebildigi icin (kalem.siparis_id)
 * sadece ana_siparis_id'si eslesen dosyalar yetmez: ayni alicinin dosyalari da
 * okunur (etiketler ayni alici icinde verilir - Urun Detaylari karti).
 * Okuma hatasinda null doner (cagiran eski veriyi korur / ilerleme gostermez).
 */
export async function siparisTakipVerisiGetir(
  companyId: string,
  siparisler: { id: string; alici_firma: string | null }[]
): Promise<{ dosyalar: TakipDosyasi[]; konteynerler: TakipKonteyneri[] } | null> {
  if (siparisler.length === 0) return { dosyalar: [], konteynerler: [] };
  const idler = siparisler.map((s) => s.id);
  const alicilar = Array.from(new Set(siparisler.map((s) => s.alici_firma).filter((a): a is string => !!a)));
  const alanlar = "id, ana_siparis_id, durum, urun_detaylari";

  const [bagli, aliciya] = await Promise.all([
    supabase.from("ihracat_dosyalari").select(alanlar).eq("company_id", companyId).in("ana_siparis_id", idler),
    alicilar.length > 0
      ? supabase.from("ihracat_dosyalari").select(alanlar).eq("company_id", companyId).in("alici_firma", alicilar)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (bagli.error || aliciya.error) return null;

  const harita = new Map<string, TakipDosyasi>();
  for (const d of [...(bagli.data || []), ...(aliciya.data || [])] as TakipDosyasi[]) harita.set(d.id, d);
  const dosyalar = Array.from(harita.values());
  if (dosyalar.length === 0) return { dosyalar, konteynerler: [] };

  const { data: konteynerler, error } = await supabase
    .from("konteynerler")
    .select("dosya_id, dba_dosya_url")
    .eq("company_id", companyId)
    .in("dosya_id", dosyalar.map((d) => d.id));
  if (error) return null;
  return { dosyalar, konteynerler: (konteynerler || []) as TakipKonteyneri[] };
}
