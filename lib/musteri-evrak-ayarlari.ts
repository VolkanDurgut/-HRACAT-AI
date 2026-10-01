import { supabase, Dosya, FumigationAyari, KaliteSertifikasiAyari } from "@/lib/supabase";

/**
 * Quality / Condition Certificate ve Fumigation Certificate, diger evraklardan
 * farkli olarak MUSTERIYE (alici_firma) OZEL ayarlarla uretilir:
 *   - fumigation_ayarlari        -> fumigant, doz, sicaklik, saatler...
 *   - kalite_sertifikasi_ayarlari -> PARAMETER/SPECIFICATION/RESULTS tablosu
 * Ayar yoksa builder'lar varsayilan degerleri kullanir.
 *
 * Dosya detayindaki Draft/Orijinal butonlari (components/evrak-olustur-buttons.tsx)
 * bu ayarlari zaten okuyor. Draft Onay sayfasi ve Taslak Onay Paketi de AYNI
 * ayarlarla uretmeli, yoksa ayni evrak iki yerde farkli icerikle cikar
 * (01.10.2026).
 */
export type MusteriEvrakAyarlari = {
  fumigationAyar: FumigationAyari | null;
  kaliteAyar: KaliteSertifikasiAyari | null;
};

export const BOS_MUSTERI_EVRAK_AYARLARI: MusteriEvrakAyarlari = { fumigationAyar: null, kaliteAyar: null };

/** Tek bir musterinin (alici_firma) ayarlarini getirir. */
export async function musteriEvrakAyarlariniGetir(companyId: string, aliciFirma: string | null): Promise<MusteriEvrakAyarlari> {
  if (!companyId || !aliciFirma) return BOS_MUSTERI_EVRAK_AYARLARI;
  const [fum, kal] = await Promise.all([
    supabase.from("fumigation_ayarlari").select("*").eq("company_id", companyId).eq("alici_firma", aliciFirma).maybeSingle(),
    supabase.from("kalite_sertifikasi_ayarlari").select("*").eq("company_id", companyId).eq("alici_firma", aliciFirma).maybeSingle(),
  ]);
  return {
    fumigationAyar: (fum.data as FumigationAyari | null) ?? null,
    kaliteAyar: (kal.data as KaliteSertifikasiAyari | null) ?? null,
  };
}

/** Birden fazla musterinin ayarlarini tek seferde getirir (alici_firma -> ayarlar). */
export async function musteriEvrakAyarlariniTopluGetir(
  companyId: string,
  aliciFirmalar: string[]
): Promise<Record<string, MusteriEvrakAyarlari>> {
  const firmalar = Array.from(new Set(aliciFirmalar.filter(Boolean)));
  const sonuc: Record<string, MusteriEvrakAyarlari> = {};
  if (!companyId || firmalar.length === 0) return sonuc;
  const [fum, kal] = await Promise.all([
    supabase.from("fumigation_ayarlari").select("*").eq("company_id", companyId).in("alici_firma", firmalar),
    supabase.from("kalite_sertifikasi_ayarlari").select("*").eq("company_id", companyId).in("alici_firma", firmalar),
  ]);
  for (const f of firmalar) sonuc[f] = { fumigationAyar: null, kaliteAyar: null };
  for (const a of (fum.data as FumigationAyari[] | null) || []) {
    if (sonuc[a.alici_firma]) sonuc[a.alici_firma].fumigationAyar = a;
  }
  for (const a of (kal.data as KaliteSertifikasiAyari[] | null) || []) {
    if (sonuc[a.alici_firma]) sonuc[a.alici_firma].kaliteAyar = a;
  }
  return sonuc;
}

/**
 * Musterinin proformada istedigi evrak listesinde (sevkiyat_evraklari) bu evrak
 * var mi? Dosya detayindaki evrak listesiyle (app/dosya/[id]/page.tsx ->
 * evrakEslestir) AYNI kural: metinde anahtar kelime geciyor mu.
 */
export function dosyaEvrakIstiyorMu(dosya: Dosya, anahtar: "Quality" | "Fumigation"): boolean {
  const evraklar = (dosya.sevkiyat_evraklari as string[] | null) || [];
  return evraklar.some((e) => typeof e === "string" && e.toLowerCase().includes(anahtar.toLowerCase()));
}
