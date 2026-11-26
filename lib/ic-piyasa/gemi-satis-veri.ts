/**
 * Gemiden satis (26.11.2026; migration 20261126120000) - veri okuma.
 * Is emri `gemi_id` ile bir gemi tahliyesine baglanir; alici araci limanda gemiden yukler,
 * irsaliyesi (ya da elle plaka + tonaj) is emrine girilir ve gemi tahliye tonajina eklenir.
 */
import { supabase } from "@/lib/supabase";
import type { GemiIsEmri, GemiIsEmriSevk } from "@/lib/ic-piyasa/gemi-tahliye";
import type { GemiSecenegi } from "@/lib/kantar-gorunum";
export type { GemiSecenegi };
export { teslimYerindenGemi } from "@/lib/kantar-gorunum";

/** Is emri formundaki "Gemiden satis" listesi (en yeni 50 tahliye). Okunamazsa bos liste: form bozulmaz. */
export async function gemiSecenekleriOku(companyId: string): Promise<GemiSecenegi[]> {
  const { data, error } = await supabase.from("ic_gemi_tahliyeleri").select("id, gemi_adi, durum")
    .eq("company_id", companyId).order("olusturma", { ascending: false }).limit(50);
  return error ? [] : ((data || []) as GemiSecenegi[]);
}

/** gemi_id -> gemi adi (is emirleri listesindeki rozet). Okunamazsa bos: rozet "Gemi" yazar. */
export async function gemiAdlariOku(companyId: string, idler: string[]): Promise<Record<string, string>> {
  if (!idler.length) return {};
  const { data, error } = await supabase.from("ic_gemi_tahliyeleri").select("id, gemi_adi").eq("company_id", companyId).in("id", idler);
  if (error) return {};
  return Object.fromEntries(((data || []) as { id: string; gemi_adi: string }[]).map((g) => [g.id, g.gemi_adi]));
}


/**
 * Ofis gemi sayfasi: gemiye bagli is emirleri + sevkleri (rapor / Excel'e "yer" ve "arac" olarak eklenir;
 * birlestirme: gemi-tahliye.ts isEmriSatislariniEkle). Okunamazsa bos: eski rapor aynen calisir.
 */
export async function gemiIsEmriSatislariOku(companyId: string, gemiId: string): Promise<{ emirler: GemiIsEmri[]; sevkler: GemiIsEmriSevk[] }> {
  const e = await supabase.from("ic_is_emirleri").select("id, is_emri_no, hedef_tur, hedef_kg, olusturma, ic_musteriler(unvan)")
    .eq("company_id", companyId).eq("gemi_id", gemiId).neq("durum", "iptal").order("olusturma");
  if (e.error || !e.data?.length) return { emirler: [], sevkler: [] };
  type Satir = { id: string; is_emri_no: string; hedef_tur: "kg" | "arac"; hedef_kg: number | null; olusturma: string; ic_musteriler: { unvan: string } | { unvan: string }[] | null };
  const emirler: GemiIsEmri[] = (e.data as unknown as Satir[]).map((x) => {
    const m = Array.isArray(x.ic_musteriler) ? x.ic_musteriler[0] : x.ic_musteriler;
    return { id: x.id, is_emri_no: x.is_emri_no, firma: m?.unvan || x.is_emri_no, hedef_tur: x.hedef_tur, hedef_kg: x.hedef_kg, olusturma: x.olusturma };
  });
  const s = await supabase.from("ic_sevkler").select("id, is_emri_id, plaka, net_kg, irsaliye_no, irsaliye_tarihi, irsaliye_dosya_yolu, girilen_email, olusturma")
    .eq("company_id", companyId).in("is_emri_id", emirler.map((x) => x.id)).order("olusturma").limit(5000);
  return { emirler, sevkler: s.error ? [] : ((s.data || []) as GemiIsEmriSevk[]) };
}

/**
 * Kantar Paneli › Yurt Ici › Satis: arac (sevk) ekle - kantar_ic_sevk_ekle (kuru kontrol p_kaydet=false).
 * 26.11.2026: `elle: true` + bos irsaliye_dosya_yolu = irsaliyesiz elle giris (gemiden satis vb.).
 */
export async function kantarIcSevkEkle(veri: Record<string, unknown>, kaydet: boolean) {
  return supabase.rpc("kantar_ic_sevk_ekle", { p_veri: veri, p_kaydet: kaydet });
}
