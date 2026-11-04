/**
 * DIIB verisini okur (dosya sayfasi karti ve fatura talimati icin; 04.11.2026).
 * RLS: "ihracatlar" yetkisi yoksa bos doner (kart gizlenir, talimat bolunmesiz kalir).
 */
import { supabase } from "@/lib/supabase";
import type { BekleyenSira, DiibBelgesi, DiibBolunmesi, DiibDosyasi, DiibKaydi } from "@/lib/diib/hesap";
import type { TalimatParcaGirdisi } from "@/lib/diib/bolunme-talimat";

export const DIIB_DOSYA_KOLONLARI = "id, dosya_no, durum, fatura_no, fatura_tarihi, beyanname_no, beyanname_dosya_url, alici_firma, urun_detaylari, toplam_tutar, para_birimi, diib_no";

export type DiibVerisi = { belgeler: DiibBelgesi[]; kayitlar: DiibKaydi[]; dosyalar: DiibDosyasi[]; bolunmeler: DiibBolunmesi[] };

/**
 * Dosya basina yuklenen konteyner net toplami: TUM konteynerlerde net > 0 ise toplam, degilse null
 * (eksik tartim -> proforma miktari kullanilir; bkz. diibMiktari).
 */
export async function yuklenenKgleri(companyId: string): Promise<Record<string, number | null> | null> {
  // Sayfali (PostgREST tek istekte en fazla 1000 satir doner)
  const satirlar: { dosya_id: string | null; net_agirlik_kg: number | string | null }[] = [];
  for (let bas = 0; bas < 50000; bas += 1000) {
    const r = await supabase.from("konteynerler").select("id, dosya_id, net_agirlik_kg").eq("company_id", companyId).order("id").range(bas, bas + 999);
    if (r.error || !r.data) return null;
    satirlar.push(...(r.data as typeof satirlar));
    if (r.data.length < 1000) break;
  }
  const top: Record<string, { adet: number; dolu: number; kg: number }> = {};
  for (const x of satirlar) {
    if (!x.dosya_id) continue;
    const t = (top[x.dosya_id] ||= { adet: 0, dolu: 0, kg: 0 });
    const n = Number(x.net_agirlik_kg);
    t.adet++;
    if (Number.isFinite(n) && n > 0) { t.dolu++; t.kg += n; }
  }
  const sonuc: Record<string, number | null> = {};
  for (const [id, t] of Object.entries(top)) sonuc[id] = t.adet > 0 && t.dolu === t.adet ? Math.round(t.kg * 100) / 100 : null;
  return sonuc;
}

/** Dosyalara yuklenen kg'i ekler (okunamazsa dosyalar oldugu gibi: proforma miktari). */
export function yuklenenEkle(dosyalar: DiibDosyasi[], yk: Record<string, number | null> | null): DiibDosyasi[] {
  return yk ? dosyalar.map((d) => ({ ...d, yuklenenKg: yk[d.id] ?? null })) : dosyalar;
}

export async function diibVerisiGetir(companyId: string): Promise<DiibVerisi | null> {
  const [b, k, d, bo, yk] = await Promise.all([
    supabase.from("diib_belgeleri").select("*").eq("company_id", companyId).order("kullanim_sirasi"),
    supabase.from("diib_ihracatlari").select("*").eq("company_id", companyId).limit(5000),
    supabase.from("ihracat_dosyalari").select(DIIB_DOSYA_KOLONLARI).eq("company_id", companyId).limit(3000),
    supabase.from("diib_dosya_bolunmeleri").select("*").eq("company_id", companyId),
    yuklenenKgleri(companyId),
  ]);
  if (b.error || k.error || d.error || bo.error) return null;
  return {
    belgeler: (b.data || []) as DiibBelgesi[], kayitlar: (k.data || []) as DiibKaydi[],
    dosyalar: yuklenenEkle((d.data || []) as unknown as DiibDosyasi[], yk), bolunmeler: (bo.data || []) as DiibBolunmesi[],
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

/**
 * Faturasi kesilmemis dosyalarin sira bilgisi (rezervasyon: beyan cut-off, gemi kalkis). Dosyanin birden
 * fazla rezervasyonu varsa en erkeni. Okunamazsa bos -> sira dosya no'ya gore.
 */
export async function bekleyenSiraGetir(companyId: string, dosyaIdleri: string[]): Promise<Record<string, BekleyenSira>> {
  if (!dosyaIdleri.length) return {};
  const r = await supabase.from("rezervasyonlar").select("dosya_id, talimat_cutoff, beyanname_cutoff, gemi_kalkis_tarihi").eq("company_id", companyId).in("dosya_id", dosyaIdleri);
  if (r.error || !r.data) return {};
  const sonuc: Record<string, BekleyenSira> = {};
  for (const x of r.data as { dosya_id: string; talimat_cutoff: string | null; beyanname_cutoff: string | null; gemi_kalkis_tarihi: string | null }[]) {
    const eski = sonuc[x.dosya_id];
    const enErken = (a: string | null | undefined, b: string | null) => (!a ? b : !b ? a : a < b ? a : b) ?? null;
    sonuc[x.dosya_id] = { talimatCutoff: enErken(eski?.talimatCutoff, x.talimat_cutoff), beyanCutoff: enErken(eski?.beyanCutoff, x.beyanname_cutoff), etd: enErken(eski?.etd, x.gemi_kalkis_tarihi) };
  }
  return sonuc;
}

/** Bolunme degisince ayni sayfadaki fatura talimati bolumu yeniden okusun. */
export const DIIB_BOLUNME_OLAYI = "diib-bolunme-degisti";
