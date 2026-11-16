/**
 * PAZAR (UNEX Satis) CRM - veri okuma (10.11.2026). Tablolar istemciye SADECE okunur (RLS: "pazar"
 * yetkisi + ayni sirket); yazma yalniz RPC (pazar_fuar_aktar) ve tetikleyicilerle (siparis -> musteri).
 * Migration: supabase/migrations/20261110040000_pazar_crm.sql
 */
import { supabase } from "@/lib/supabase";
import type { FuarFirma } from "@/lib/pazar/fuar";
import type { ListeFirma } from "@/lib/pazar/liste";

export type PazarDurum = "potansiyel" | "musteri";
export type PazarFirma = {
  id: string;
  ad: string;
  anahtar: string;
  ulke: string | null;
  ulke_kaynagi: "excel" | "telefon" | "eposta" | "elle" | null;
  durum: PazarDurum;
  kaynak: "fuar" | "siparis" | "elle" | "liste";
  /** Rehber listesi adi ("Şafak Bey listesi"; kaynak = liste, 16.11.2026). */
  kaynak_etiket: string | null;
  alici_adi: string | null;
  musteri_olma_tarihi: string | null;
  created_at: string;
  /** Birlestirilmis (farkli yazilmis) adlarin anahtarlari (3.2). */
  ek_anahtarlar: string[];
  notlar: string | null;
  /** 3.4 gorusme sureci (pazar_gorev_isle). */
  crm_asama: "yeni" | "sorgulandi" | "hatirlatma1" | "hatirlatma2" | "sessiz" | "cevap" | "teklif" | "siparis" | "ilgilenmiyor";
  sonraki_adim: string | null;
  bekleme_bitis: string | null;
  son_temas: string | null;
};
export type PazarTemas = {
  id: string;
  firma_id: string;
  adim: "sorgulama" | "hatirlatma1" | "hatirlatma2" | "sonuc" | "atla";
  kanal: "eposta" | "whatsapp" | null;
  sonuc: "cevap" | "teklif" | "siparis" | "ilgilenmiyor" | null;
  alici: string | null;
  konu: string | null;
  isleyen: string | null;
  olusturma: string;
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
export type PazarVerisi = { firmalar: PazarFirma[]; kisiler: PazarKisi[]; katilimlar: PazarKatilim[]; temaslar: PazarTemas[] };

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
  const [firmalar, kisiler, katilimlar, temaslar] = await Promise.all([
    hepsi<PazarFirma>("pazar_firmalar", "id,ad,anahtar,ulke,ulke_kaynagi,durum,kaynak,kaynak_etiket,alici_adi,musteri_olma_tarihi,created_at,ek_anahtarlar,notlar,crm_asama,sonraki_adim,bekleme_bitis,son_temas"),
    hepsi<PazarKisi>("pazar_kisiler", "id,firma_id,ad,eposta,eposta_gecerli,telefonlar,whatsapp"),
    hepsi<PazarKatilim>("pazar_fuar_katilimlari", "id,firma_id,fuar,yil,donem,etiket"),
    hepsi<PazarTemas>("pazar_temaslar", "id,firma_id,adim,kanal,sonuc,alici,konu,isleyen,olusturma"),
  ]);
  return { firmalar, kisiler, katilimlar, temaslar };
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

/** Rehber listesi (ulke sayfali; lib/pazar/liste.ts) -> pazar_liste_aktar (migration 20261116110000). */
export async function rehberListesiAktar(dosyaAdi: string, etiket: string, firmalar: ListeFirma[]): Promise<AktarmaSonucu> {
  const govde = firmalar.map((f) => ({ ad: f.ad, ulke: f.ulke, ulke_kaynagi: f.ulke_kaynagi, ulke_ham: f.ulke_ham, notlar: f.notlar, kisiler: f.kisiler }));
  const { data, error } = await supabase.rpc("pazar_liste_aktar", { p_dosya_adi: dosyaAdi, p_etiket: etiket, p_firmalar: govde });
  if (error) throw new Error(error.message);
  return data as AktarmaSonucu;
}

/** "BİRLEŞİK ARAP EMİRLİKLERİ" -> "Birleşik Arap Emirlikleri" (ekranda). */
export function ulkeGosterim(ulke: string | null | undefined): string {
  if (!ulke) return "";
  return ulke.toLocaleLowerCase("tr-TR").split(/(\s+|-)/).map((p) => (p ? p.charAt(0).toLocaleUpperCase("tr-TR") + p.slice(1) : p)).join("");
}

// ---------------------------------------------------------------------------
// 3.2 Musterilerimiz karti + firma karti (10.11.2026)
// ---------------------------------------------------------------------------

export type MusteriDosyasi = {
  id: string;
  anahtar: string;
  dosya_no: string | null;
  durum: string | null;
  olusturma_tarihi: string | null;
  varis_limani: string | null;
  alici_adresi: string | null;
  ana_siparis_id: string | null;
  urun_detaylari: unknown;
  toplam_konteyner: number | null;
  proforma_no: string | null;
  /** 16.11.2026 (migration 20261116240000): Musterilerimiz "Toplam hacim" (Kontrol Merkezi ile ayni kaynak) */
  toplam_tutar?: number | string | null;
  para_birimi?: string | null;
};
export type MusteriAnaSiparisi = {
  id: string;
  anahtar: string;
  proforma_no: string | null;
  urun_tanimi: string | null;
  toplam_mts: number | null;
  urun_detaylari_master: unknown;
  tamamlandi: boolean | null;
  olusturma_tarihi: string | null;
};
export type MusteriSiparisVerisi = {
  dosyalar: MusteriDosyasi[];
  rezervasyonlar: { dosya_id: string; konteyner_adedi: number | null }[];
  konteynerler: { dosya_id: string; dba_dosya_url: string | null }[];
  ana_siparisler: MusteriAnaSiparisi[];
};

/** Musteri firmalarinin dosya / rezervasyon / acik siparis verisi (salt okunur RPC; kopyalanmaz). */
export async function pazarMusteriSiparisleri(): Promise<MusteriSiparisVerisi> {
  const { data, error } = await supabase.rpc("pazar_musteri_siparisleri");
  if (error) throw new Error(error.message);
  const v = (data || {}) as Partial<MusteriSiparisVerisi>;
  return { dosyalar: v.dosyalar || [], rezervasyonlar: v.rezervasyonlar || [], konteynerler: v.konteynerler || [], ana_siparisler: v.ana_siparisler || [] };
}

export async function pazarFirmaGuncelle(firmaId: string, ulke: string | null, notlar: string | null): Promise<void> {
  const { error } = await supabase.rpc("pazar_firma_guncelle", { p_firma: firmaId, p_ulke: ulke, p_notlar: notlar });
  if (error) throw new Error(error.message);
}

export async function pazarKisiKaydet(g: { firmaId: string; kisiId: string | null; ad: string; eposta: string; telefon: string; whatsapp: string }): Promise<void> {
  const { error } = await supabase.rpc("pazar_kisi_kaydet", {
    p_firma: g.firmaId, p_kisi: g.kisiId, p_ad: g.ad, p_eposta: g.eposta, p_telefon: g.telefon, p_whatsapp: g.whatsapp,
  });
  if (error) throw new Error(error.message);
}

/** Ayni firmanin farkli yazilmis iki kaydini birlestirir (kaynak silinir, hedefe tasinir). */
export async function pazarFirmaBirlestir(kaynakId: string, hedefId: string): Promise<void> {
  const { error } = await supabase.rpc("pazar_firma_birlestir", { p_kaynak: kaynakId, p_hedef: hedefId });
  if (error) throw new Error(error.message);
}

// ---- Takip (Burak Bey ekrani, 10.11.2026; migration 20261110100000) ----
export type PazarEkip = { kod: string; eposta: string; hitap: string | null; sira: number; aktif: boolean };
export type PazarGelen = {
  id: string; firma_id: string; gonderen: string; konu: string | null; ozet: string | null; tarih: string;
  tur: "cevap" | "otomatik"; oneri: "teklif" | "siparis" | "ilgilenmiyor" | null;
};
export type TakipGorev = {
  tarih: string; atanan: string | null; sira: number; neden: "hatirlatma1" | "hatirlatma2" | "siparissiz" | "potansiyel";
  durum: "bekliyor" | "yapildi" | "atlandi"; isleyen: string | null; tamamlanma: string | null; firma_id: string;
  son: { adim: PazarTemas["adim"]; kanal: PazarTemas["kanal"]; sonuc: PazarTemas["sonuc"]; konu: string | null; olusturma: string } | null;
};
export type TakipVerisi = { bugun: string; ekip: PazarEkip[]; gelenler: PazarGelen[]; gorevler: TakipGorev[] };

/** Takip (yonetici paneli): ekip, son 30 gunun gelen cevaplari ve gorevleri (token'siz RPC; 16.11.2026: 7 -> 30 gun). */
export async function pazarTakipOku(): Promise<TakipVerisi> {
  const otuzGun = new Date(Date.now() - 30 * 86400000).toISOString();
  const [ekip, gelen, takip] = await Promise.all([
    supabase.from("pazar_ekip").select("kod,eposta,hitap,sira,aktif").order("sira"),
    supabase.from("pazar_gelenler").select("id,firma_id,gonderen,konu,ozet,tarih,tur,oneri").gte("tarih", otuzGun).order("tarih", { ascending: false }).limit(300),
    supabase.rpc("pazar_takip", { p_gun: 30 }),
  ]);
  if (ekip.error) throw new Error(ekip.error.message);
  if (gelen.error) throw new Error(gelen.error.message);
  if (takip.error) throw new Error(takip.error.message);
  const t = (takip.data || {}) as { bugun?: string; gorevler?: TakipGorev[] };
  return {
    bugun: t.bugun || new Date().toISOString().slice(0, 10),
    ekip: ((ekip.data || []) as PazarEkip[]).filter((e) => e.aktif),
    gelenler: (gelen.data || []) as PazarGelen[],
    gorevler: t.gorevler || [],
  };
}
