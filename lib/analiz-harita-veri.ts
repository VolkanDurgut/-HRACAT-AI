/**
 * Kontrol Merkezi > Sevkiyat Haritasi veri okuma (17.11.2026). Yukleme plani (sevkiyat_plani) satirlari: sistemde
 * ihracat dosyasi acilmamis booking'ler de haritada gorunsun ("Butun limanlar gozukmeli"). Hesap: lib/sevkiyat-aktif.ts.
 * RLS: sevkiyat_plani_oku (proformalar / analiz / navlun sayfa yetkisi). Yetki yoksa bos liste (harita dosyalarla calisir).
 */
import { supabase } from "@/lib/supabase";
import type { PlanHaritaSatiri } from "@/lib/sevkiyat-aktif";

export async function haritaPlaniOku(): Promise<PlanHaritaSatiri[]> {
  const sonuc: PlanHaritaSatiri[] = [];
  for (let bas = 0; ; bas += 1000) {
    const { data, error } = await supabase
      .from("sevkiyat_plani")
      .select("id,booking_no,varis_limani,liman,etd,konteyner,dosya_id,rezervasyon_id")
      .order("id")
      .range(bas, bas + 999);
    if (error) return sonuc;
    sonuc.push(...((data || []) as PlanHaritaSatiri[]));
    if (!data || data.length < 1000) break;
  }
  return sonuc;
}
