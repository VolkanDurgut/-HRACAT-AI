/**
 * PAZAR (UNEX Satis) CRM - veri okuma (10.11.2026). Tablolar istemciye SADECE okunur (RLS: "pazar"
 * yetkisi + ayni sirket); yazma yalniz RPC (pazar_fuar_aktar) ve tetikleyicilerle (siparis -> musteri).
 * Migration: supabase/migrations/20261110040000_pazar_crm.sql
 */
import { supabase } from "@/lib/supabase";
import type { FuarFirma } from "@/lib/pazar/fuar";

export type PazarDurum = "potansiyel" | "musteri";
export type PazarFirma = {
  id: string;
  ad: string;
  anahtar: string;
  ulke: string | null;
  ulke_kaynagi: "excel" | "telefon" | "eposta" | "elle" | null;
  durum: PazarDurum;
  kaynak: "fuar" | "siparis" | "elle";
  alici_adi: string | null;
  musteri_olma_tarihi: string | null;
  created_at: string;
};
export type PazarKisi = {
  id: string;
  firma_id: string;
  ad: string | null;
  eposta: string | null;
  eposta_gecerli: boolean;
  telefonlar: string[];
  whatsapp: string | null;
};
export type PazarKatilim = { id: string; firma_id: string; fuar: string; yil: number | null; donem: string | null; etiket: string };
export type PazarVerisi = { firmalar: PazarFirma[]; kisiler: PazarKisi[]; katilimlar: PazarKatilim[] };

const SAYFA = 1000;

/** PostgREST satir sinirini asmak icin sayfali okuma (id sirasiyla, kararli). */
async function hepsi<T>(tablo: string, kolonlar: string): Promise<T[]> {
  const sonuc: T[] = [];
  for (let bas = 0; bas < 50000; bas += SAYFA) {
    const { data, error } = await supabase.from(tablo).select(kolonlar).order("id").range(bas, bas + SAYFA - 1);
    if (error) throw new Error(error.message);
    const satirlar = (data || []) as unknown as T[];
    sonuc.push(...satirlar);
    if (satirlar.length < SAYFA) break;
  }
  return sonuc;
}

export async function pazarVerisiOku(): Promise<PazarVerisi> {
  const [firmalar, kisiler, katilimlar] = await Promise.all([
    hepsi<PazarFirma>("pazar_firmalar", "id,ad,anahtar,ulke,ulke_kaynagi,durum,kaynak,alici_adi,musteri_olma_tarihi,created_at"),
    hepsi<PazarKisi>("pazar_kisiler", "id,firma_id,ad,eposta,eposta_gecerli,telefonlar,whatsapp"),
    hepsi<PazarKatilim>("pazar_fuar_katilimlari", "id,firma_id,fuar,yil,donem,etiket"),
  ]);
  return { firmalar, kisiler, katilimlar };
}

/** Firma adlari -> sunucudaki birlestirme anahtarlari (pazar_anahtar; ayni sira). */
export async function pazarAnahtarlari(adlar: string[]): Promise<string[]> {
  const sonuc: string[] = [];
  for (let i = 0; i < adlar.length; i += 2000) {
    const parca = adlar.slice(i, i + 2000);
    const { data, error } = await supabase.rpc("pazar_anahtarlar", { p_adlar: parca });
    if (error) throw new Error(error.message);
    const a = (data || []) as string[];
    if (a.length !== parca.length) throw new Error("Anahtar listesi eksik döndü.");
    sonuc.push(...a);
  }
  return sonuc;
}

export type AktarmaSonucu = {
  firma: number;
  yeni_firma: number;
  guncellenen_firma: number;
  musteri_eslesen: number;
  yeni_kisi: number;
  yeni_katilim: number;
};

export async function fuarListesiAktar(dosyaAdi: string, firmalar: FuarFirma[]): Promise<AktarmaSonucu> {
  const govde = firmalar.map((f) => ({
    ad: f.ad,
    ulke: f.ulke,
    ulke_kaynagi: f.ulke_kaynagi,
    ulke_ham: f.ulke_ham,
    kisiler: f.kisiler,
    katilimlar: f.katilimlar,
  }));
  const { data, error } = await supabase.rpc("pazar_fuar_aktar", { p_dosya_adi: dosyaAdi, p_firmalar: govde });
  if (error) throw new Error(error.message);
  return data as AktarmaSonucu;
}

/** "BİRLEŞİK ARAP EMİRLİKLERİ" -> "Birleşik Arap Emirlikleri" (ekranda). */
export function ulkeGosterim(ulke: string | null | undefined): string {
  if (!ulke) return "";
  return ulke.toLocaleLowerCase("tr-TR").split(/(\s+|-)/).map((p) => (p ? p.charAt(0).toLocaleUpperCase("tr-TR") + p.slice(1) : p)).join("");
}
