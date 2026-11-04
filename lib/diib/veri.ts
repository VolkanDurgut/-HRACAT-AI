/**
 * DIIB verisini okur (dosya sayfasi karti ve fatura talimati icin; 04.11.2026).
 * RLS: "ihracatlar" yetkisi yoksa bos doner (kart gizlenir, talimat bolunmesiz kalir).
 */
import { supabase } from "@/lib/supabase";
import type { DiibBelgesi, DiibBolunmesi, DiibDosyasi, DiibKaydi } from "@/lib/diib/hesap";
import type { TalimatParcaGirdisi } from "@/lib/diib/bolunme-talimat";

export const DIIB_DOSYA_KOLONLARI = "id, dosya_no, durum, fatura_no, fatura_tarihi, beyanname_no, alici_firma, urun_detaylari, toplam_tutar, para_birimi, diib_no";

export type DiibVerisi = { belgeler: DiibBelgesi[]; kayitlar: DiibKaydi[]; dosyalar: DiibDosyasi[]; bolunmeler: DiibBolunmesi[] };

export async function diibVerisiGetir(companyId: string): Promise<DiibVerisi | null> {
  const [b, k, d, bo] = await Promise.all([
    supabase.from("diib_belgeleri").select("*").eq("company_id", companyId).order("kullanim_sirasi"),
    supabase.from("diib_ihracatlari").select("*").eq("company_id", companyId).limit(5000),
    supabase.from("ihracat_dosyalari").select(DIIB_DOSYA_KOLONLARI).eq("company_id", companyId).limit(3000),
    supabase.from("diib_dosya_bolunmeleri").select("*").eq("company_id", companyId),
  ]);
  if (b.error || k.error || d.error || bo.error) return null;
  return {
    belgeler: (b.data || []) as DiibBelgesi[], kayitlar: (k.data || []) as DiibKaydi[],
    dosyalar: (d.data || []) as unknown as DiibDosyasi[], bolunmeler: (bo.data || []) as DiibBolunmesi[],
  };
}

/** Bir dosyanin kayitli bolunmesi (fatura talimati icin); 2'den az parca ya da hata -> []. */
export async function dosyaBolunmesiGetir(companyId: string, dosyaId: string): Promise<TalimatParcaGirdisi[]> {
  const bo = await supabase.from("diib_dosya_bolunmeleri").select("sira, diib_id, miktar_kg, fatura_no").eq("company_id", companyId).eq("dosya_id", dosyaId);
  if (bo.error || !bo.data || bo.data.length < 2) return [];
  const ids = Array.from(new Set(bo.data.map((x) => x.diib_id as string)));
  const b = await supabase.from("diib_belgeleri").select("id, belge_no, belge_tarihi").eq("company_id", companyId).in("id", ids);
  if (b.error || !b.data) return [];
  const belge = new Map(b.data.map((x) => [x.id as string, x as { belge_no: string; belge_tarihi: string | null }]));
  return bo.data.map((x) => ({
    sira: Number(x.sira), belgeNo: belge.get(x.diib_id as string)?.belge_no ?? "-", belgeTarihi: belge.get(x.diib_id as string)?.belge_tarihi ?? null,
    kg: Number(x.miktar_kg), faturaNo: (x.fatura_no as string | null) ?? null,
  })).sort((a, c) => a.sira - c.sira);
}

/** Bolunme degisince ayni sayfadaki fatura talimati bolumu yeniden okusun. */
export const DIIB_BOLUNME_OLAYI = "diib-bolunme-degisti";
