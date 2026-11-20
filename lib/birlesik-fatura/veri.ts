/**
 * BIRLESIK FATURA - veri erisimi (19.11.2026). Grup: fatura_gruplari / fatura_grubu_dosyalari (migration 20261119110000;
 * sirket kullanicilari yalniz okur). Birlestirme / cikarma yalniz RPC ile (ayni musteri + ayni gemi-sefer + acik ve
 * faturasiz dosya kosulu veritabaninda dogrulanir).
 */
import { supabase, type Dosya, type Konteyner, type Rezervasyon } from "@/lib/supabase";
import { dosyaBolunmesiGetir } from "@/lib/diib/veri";
import type { GrupUyesi } from "@/lib/birlesik-fatura/model";

export type BirlesikAday = { id: string; dosya_no: string | null; proforma_no: string | null; grup_id: string | null; konteyner: number; booking_no: string | null };
export type BirlesikDurum = { grup_id: string | null; uyeler: { id: string; dosya_no: string | null }[]; adaylar: BirlesikAday[] };

/** Birlesik fatura grubu degistiginde (dosya sayfasindaki talimat dugmeleri yeniden okur). */
export const BIRLESIK_FATURA_OLAYI = "birlesik-fatura-degisti";

export async function birlesikDurumGetir(dosyaId: string): Promise<BirlesikDurum> {
  const { data, error } = await supabase.rpc("birlesik_fatura_adaylari", { p_dosya: dosyaId });
  if (error) throw new Error(error.message || "Birleşik fatura bilgisi okunamadı.");
  const d = (data || {}) as Partial<BirlesikDurum>;
  return { grup_id: d.grup_id || null, uyeler: d.uyeler || [], adaylar: d.adaylar || [] };
}

export async function birlestir(dosyaId: string, digerleri: string[]): Promise<string> {
  const { data, error } = await supabase.rpc("birlesik_fatura_kur", { p_dosya: dosyaId, p_digerleri: digerleri });
  if (error) throw new Error(error.message || "Birleştirilemedi.");
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BIRLESIK_FATURA_OLAYI));
  return String(data);
}

export async function gruptanCikar(dosyaId: string): Promise<void> {
  const { error } = await supabase.rpc("birlesik_fatura_cikar", { p_dosya: dosyaId });
  if (error) throw new Error(error.message || "Gruptan çıkarılamadı.");
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BIRLESIK_FATURA_OLAYI));
}

/**
 * Dosya bir birlesik faturadaysa gruptaki BUTUN dosyalar (dosya + rezervasyon + konteyner) ve DIIB bolunmesi olanlar;
 * grupta degilse null. Tablo henuz yoksa (migration oncesi) da null: tek dosyalik talimat eskisi gibi calisir.
 */
export async function grupUyeleriniGetir(companyId: string, dosyaId: string): Promise<{ grupId: string; uyeler: GrupUyesi[]; bolunmeliDosyalar: string[] } | null> {
  const g = await supabase.from("fatura_grubu_dosyalari").select("grup_id").eq("dosya_id", dosyaId).maybeSingle();
  if (g.error || !g.data?.grup_id) return null;
  const grupId = g.data.grup_id as string;
  const u = await supabase.from("fatura_grubu_dosyalari").select("dosya_id").eq("grup_id", grupId);
  if (u.error || !u.data || u.data.length < 2) return null;
  const ids = u.data.map((x) => x.dosya_id as string);
  const [d, r, k] = await Promise.all([
    supabase.from("ihracat_dosyalari").select("*").eq("company_id", companyId).in("id", ids),
    supabase.from("rezervasyonlar").select("*").eq("company_id", companyId).in("dosya_id", ids).order("olusturma_tarihi", { ascending: true }).order("id", { ascending: true }),
    supabase.from("konteynerler").select("*").eq("company_id", companyId).in("dosya_id", ids).order("olusturma_tarihi", { ascending: true }).order("id", { ascending: true }),
  ]);
  if (d.error || r.error || k.error) throw new Error((d.error || r.error || k.error)?.message || "Birleşik fatura dosyaları okunamadı.");
  const dosyalar = (d.data || []) as Dosya[];
  if (dosyalar.length !== ids.length) throw new Error("Birleşik faturadaki dosyaların bazıları okunamadı (yetki).");
  const uyeler: GrupUyesi[] = dosyalar.map((dosya) => ({
    dosya,
    rezervasyonlar: ((r.data || []) as Rezervasyon[]).filter((x) => x.dosya_id === dosya.id),
    konteynerler: ((k.data || []) as Konteyner[]).filter((x) => x.dosya_id === dosya.id),
  }));
  const bolunmeliDosyalar: string[] = [];
  for (const x of uyeler) {
    if ((await dosyaBolunmesiGetir(companyId, x.dosya.id)).length >= 2) bolunmeliDosyalar.push(x.dosya.dosya_no || x.dosya.id);
  }
  return { grupId, uyeler, bolunmeliDosyalar };
}

/** Birlesik talimat maili acildi: gruptaki BUTUN dosyalar "fatura talimati gonderildi" (konsimento beklentisi baslar). Sorun metni ya da null. */
export async function grupTalimatiGonderildi(companyId: string, ids: string[], metin: string): Promise<string | null> {
  const { data, error } = await supabase.from("ihracat_dosyalari").update({ fatura_talimati_gonderildi: true, fatura_talimati_metni: metin })
    .in("id", ids).eq("company_id", companyId).select("id");
  if (error) return `kaydedilemedi: ${error.message}`;
  return (data || []).length === ids.length ? null : `yalnız ${(data || []).length}/${ids.length} dosyada kaydedildi`;
}

/** 20.11.2026 birlesik fatura yukleme: ayni fatura alanlari gruptaki BUTUN dosyalara yazilir. Sorun metni ya da null. */
export type GrupFaturaAlanlari = {
  fatura_dosya_url: string | null; fatura_dosya_adi: string | null; fatura_yukleme_tarihi: string | null;
  fatura_kontrol_sonucu: unknown; fatura_no?: string | null; fatura_tarihi?: string | null;
};
export async function grupFaturasiYaz(companyId: string, ids: string[], alanlar: GrupFaturaAlanlari): Promise<string | null> {
  const { data, error } = await supabase.from("ihracat_dosyalari").update(alanlar).in("id", ids).eq("company_id", companyId).select("id");
  if (error) return error.message;
  return (data || []).length === ids.length ? null : `yalnız ${(data || []).length}/${ids.length} dosyaya yazılabildi`;
}

/** Gruptaki dosyalarin su anki fatura PDF adresleri (yeniden yuklemede eskiyi silmek icin). */
export async function grupFaturaAdresleri(companyId: string, ids: string[]): Promise<string[]> {
  const { data } = await supabase.from("ihracat_dosyalari").select("fatura_dosya_url").in("id", ids).eq("company_id", companyId);
  return Array.from(new Set((data || []).map((x) => x.fatura_dosya_url as string | null).filter((x): x is string => !!x)));
}

/** Depodaki fatura PDF'i hala bir dosyada kullaniliyor mu (birlesik faturada ayni PDF birden cok dosyada durur). */
export async function faturaAdresiKullaniliyor(companyId: string, url: string): Promise<boolean> {
  const yol = /\/object\/(?:sign|public)\/[^/]+\/([^?]+)/.exec(url)?.[1];
  if (!yol) return true; // emin degilsek silmeyiz
  const { data, error } = await supabase.from("ihracat_dosyalari").select("id").eq("company_id", companyId).like("fatura_dosya_url", `%${yol}%`).limit(1);
  return error ? true : (data || []).length > 0;
}
