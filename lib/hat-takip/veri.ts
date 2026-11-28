/**
 * HAT TAKIP - veri erisimi (27.11.2026, Asama 1: deneme modu). SALT OKUMA: hat_takip_kayitlari + hat_olaylari
 * (RLS: kendi sirketi + "etd_eta" yetkisi). Yazma yalniz edge hat-takip (service_role). Migration: 20261127150000_hat_takip.sql
 */
import { supabase } from "@/lib/supabase";
import type { HatOlayi } from "@/supabase/functions/_shared/hat-takip";
import type { HatEtaOzeti } from "@/lib/hat-takip/eta-uyari";

export type TakipSatiri = {
  id: string;
  booking_no: string;
  aktif: boolean;
  durum: "bekliyor" | "tamam" | "bulunamadi" | "hata";
  son_sorgu: string | null;
  son_basari: string | null;
  son_hata: string | null;
  olay_sayisi: number;
  konteyner_sayisi: number;
  hat_etd: string | null;
  hat_etd_sinif: string | null;
  hat_eta: string | null;
  hat_eta_sinif: string | null;
  pol: string | null;
  pod: string | null;
  gemi: string | null;
  sefer: string | null;
  rezervasyon: {
    id: string;
    eta: string | null;
    gemi_kalkis_tarihi: string | null;
    gemi_adi: string | null;
    sefer_no: string | null;
    konteyner_adedi: number | null;
    acente_ismi: string | null;
    dosya: { id: string; dosya_no: string | null; varis_limani: string | null } | null;
  } | null;
};

const KAYIT_ALANLARI =
  "id,booking_no,aktif,durum,son_sorgu,son_basari,son_hata,olay_sayisi,konteyner_sayisi,hat_etd,hat_etd_sinif,hat_eta,hat_eta_sinif,pol,pod,gemi,sefer," +
  "rezervasyonlar(id,eta,gemi_kalkis_tarihi,gemi_adi,sefer_no,konteyner_adedi,acente_ismi,ihracat_dosyalari(id,dosya_no,varis_limani))";

type HamDosya = { id: string; dosya_no: string | null; varis_limani: string | null };
type HamRez = Omit<NonNullable<TakipSatiri["rezervasyon"]>, "dosya"> & { ihracat_dosyalari: HamDosya | HamDosya[] | null };
type HamKayit = Omit<TakipSatiri, "rezervasyon"> & { rezervasyonlar: HamRez | HamRez[] | null };
const tek = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Aktif takipteki booking'ler (Hapag ETA'sina gore, en yakin varis once). */
export async function hatTakipListesiOku(): Promise<TakipSatiri[]> {
  const { data, error } = await supabase
    .from("hat_takip_kayitlari")
    .select(KAYIT_ALANLARI)
    .eq("aktif", true)
    .order("hat_eta", { ascending: true, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(`Hat takip listesi okunamadı: ${error.message}`);
  return ((data || []) as unknown as HamKayit[]).map(({ rezervasyonlar, ...k }) => {
    const r = tek(rezervasyonlar);
    return {
      ...k,
      olay_sayisi: Number(k.olay_sayisi || 0),
      konteyner_sayisi: Number(k.konteyner_sayisi || 0),
      rezervasyon: r
        ? { id: r.id, eta: r.eta, gemi_kalkis_tarihi: r.gemi_kalkis_tarihi, gemi_adi: r.gemi_adi, sefer_no: r.sefer_no,
            konteyner_adedi: r.konteyner_adedi, acente_ismi: r.acente_ismi, dosya: tek(r.ihracat_dosyalari) }
        : null,
    };
  });
}

type HamOzetDosya = { dosya_no: string | null; alici_firma: string | null };
type HamOzetRez = { eta: string | null; dosya_id: string | null; ihracat_dosyalari: HamOzetDosya | HamOzetDosya[] | null };
type HamOzet = Omit<HatEtaOzeti, "sistem_eta" | "dosya_id" | "dosya_no" | "alici_firma"> & { rezervasyonlar: HamOzetRez | HamOzetRez[] | null };

/**
 * Asama 2 (28.11.2026): ETD/ETA ekrani ve Ana Panel uyarisi icin aktif takiplerin kisa ozeti (SALT OKUMA).
 * RLS: "etd_eta" yetkisi olmayan kullaniciya bos liste doner. Cagiranlar hatayi yutar; ana ekran etkilenmez.
 */
export async function hatEtaOzetleriOku(): Promise<HatEtaOzeti[]> {
  const { data, error } = await supabase
    .from("hat_takip_kayitlari")
    .select("rezervasyon_id,booking_no,durum,son_sorgu,hat_eta,hat_eta_sinif,gemi,sefer,rezervasyonlar(eta,dosya_id,ihracat_dosyalari(dosya_no,alici_firma))")
    .eq("aktif", true)
    .limit(500);
  if (error) throw new Error(`Hat ETA özeti okunamadı: ${error.message}`);
  return ((data || []) as unknown as HamOzet[]).map(({ rezervasyonlar, ...k }) => {
    const r = tek(rezervasyonlar);
    const d = tek(r?.ihracat_dosyalari);
    return { ...k, sistem_eta: r?.eta ?? null, dosya_id: r?.dosya_id ?? null, dosya_no: d?.dosya_no ?? null, alici_firma: d?.alici_firma ?? null };
  });
}

type HamOlay = {
  olay_anahtari: string; olay_turu: string; olay_kodu: string | null; sinif: string | null; olay_zamani: string | null;
  olusma_zamani: string | null; konteyner: string | null; bos_dolu: string | null; yer_kodu: string | null; yer_adi: string | null;
  gemi: string | null; imo: string | null; sefer: string | null;
};

/** Bir booking'in kayitli olaylari (ortak yorumlayicinin bekledigi bicimde). */
export async function hatOlaylariOku(takipId: string): Promise<HatOlayi[]> {
  const { data, error } = await supabase
    .from("hat_olaylari")
    .select("olay_anahtari,olay_turu,olay_kodu,sinif,olay_zamani,olusma_zamani,konteyner,bos_dolu,yer_kodu,yer_adi,gemi,imo,sefer")
    .eq("takip_id", takipId)
    .order("olay_zamani", { ascending: true })
    .limit(2000);
  if (error) throw new Error(`Olaylar okunamadı: ${error.message}`);
  return ((data || []) as HamOlay[]).map((o) => ({
    anahtar: o.olay_anahtari, tur: o.olay_turu, kod: o.olay_kodu, sinif: o.sinif, zaman: o.olay_zamani, olusma: o.olusma_zamani,
    konteyner: o.konteyner, bos_dolu: o.bos_dolu, yer: o.yer_kodu, yer_adi: o.yer_adi, gemi: o.gemi, imo: o.imo, sefer: o.sefer,
  }));
}
