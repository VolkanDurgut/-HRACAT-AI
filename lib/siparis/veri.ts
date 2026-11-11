/**
 * SIPARIS LISTESI + YUKLEME PLANI - veri erisimi (11.11.2026).
 * Okuma: siparis_listesi() / yukleme_plani() RPC ("proformalar" veya "analiz" yetkisi).
 * Yazma: on odeme isareti - siparis_on_odeme_isaretle; Excel aktarimlari - yukleme_plani_aktar /
 * siparis_listesi_aktar (hepsi "proformalar" yetkisi).
 */
import { supabase } from "@/lib/supabase";
import { planNormalize, siparisNormalize, type PlanSatiri, type SiparisSatiri } from "@/lib/siparis/liste";
import { aktarimSatiri, type PlanExcelSatiri, type PlanMevcut } from "@/lib/siparis/plan-excel";
import type { SiparisAktarimSatiri, SiparisMevcut } from "@/lib/siparis/siparis-excel";

export async function siparisListesiOku(): Promise<SiparisSatiri[]> {
  const { data, error } = await supabase.rpc("siparis_listesi");
  if (error) throw new Error(error.message);
  return ((data || []) as Record<string, unknown>[]).map(siparisNormalize);
}

export async function yuklemePlaniOku(): Promise<PlanSatiri[]> {
  const { data, error } = await supabase.rpc("yukleme_plani");
  if (error) throw new Error(error.message);
  return ((data || []) as Record<string, unknown>[]).map(planNormalize);
}

/** On odeme: alindi=true icin tutar zorunlu (siparis_on_odeme_kaydet). */
export async function onOdemeKaydet(proformaNo: string, alindi: boolean, tutar?: number, para = "USD", tarih?: string): Promise<void> {
  const { error } = await supabase.rpc("siparis_on_odeme_kaydet", {
    p_proforma_no: proformaNo, p_alindi: alindi, p_tutar: alindi ? tutar ?? null : null, p_para_birimi: para, p_tarih: alindi ? tarih ?? null : null,
  });
  if (error) throw new Error(error.message);
}

/** Excel aktarimi onizlemesi icin sistemdeki plan kayitlari (RLS: "proformalar" veya "analiz"). */
export async function planKayitlariOku(): Promise<PlanMevcut[]> {
  const sutunlar = "id,booking_no,yil,hafta,hafta_baslik,sira,musteri,cinsi,konteyner,varis_limani,cuval_markasi,ambalaj,acente,liman,ekipman,"
    + "bos_ekipman_tarihi,ardiyesiz_giris,talimat_cutoff,beyan_cutoff,etd,gemi,sefer,kalemler,rezervasyon_id";
  const sonuc: PlanMevcut[] = [];
  for (let bas = 0; ; bas += 1000) {
    const { data, error } = await supabase.from("sevkiyat_plani").select(sutunlar).order("booking_no").range(bas, bas + 999);
    if (error) throw new Error(error.message);
    sonuc.push(...((data || []) as unknown as PlanMevcut[]));
    if (!data || data.length < 1000) break;
  }
  return sonuc;
}

export async function planAktar(dosyaAdi: string, satirlar: PlanExcelSatiri[]): Promise<{ eklenen: number; guncellenen: number; ayni: number }> {
  const { data, error } = await supabase.rpc("yukleme_plani_aktar", { p_dosya_adi: dosyaAdi.slice(0, 200), p_satirlar: satirlar.map(aktarimSatiri) });
  if (error) throw new Error(error.message);
  return data as { eklenen: number; guncellenen: number; ayni: number };
}

/** Siparis listesi Excel aktarimi onizlemesi icin siparis_defteri kayitlari (RLS: "proformalar" veya "analiz"). */
export async function siparisKayitlariOku(): Promise<SiparisMevcut[]> {
  const sutunlar = "id,sira,proforma_no,proforma_tarihi,firma,urun,birim_fiyat,miktar_mt,tutar,konteyner,liman,bl_no,marka,paketleme,durum";
  const sonuc: SiparisMevcut[] = [];
  for (let bas = 0; ; bas += 1000) {
    const { data, error } = await supabase.from("siparis_defteri").select(sutunlar).order("sira", { nullsFirst: false }).range(bas, bas + 999);
    if (error) throw new Error(error.message);
    const say = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
    sonuc.push(...((data || []) as Record<string, unknown>[]).map((r) => ({
      ...(r as unknown as SiparisMevcut), birim_fiyat: say(r.birim_fiyat), miktar_mt: say(r.miktar_mt), tutar: say(r.tutar), konteyner: say(r.konteyner), sira: say(r.sira),
    })));
    if (!data || data.length < 1000) break;
  }
  return sonuc;
}

export async function siparisAktar(dosyaAdi: string, satirlar: SiparisAktarimSatiri[]): Promise<{ eklenen: number; guncellenen: number; ayni: number }> {
  const { data, error } = await supabase.rpc("siparis_listesi_aktar", { p_dosya_adi: dosyaAdi.slice(0, 200), p_satirlar: satirlar });
  if (error) throw new Error(error.message);
  return data as { eklenen: number; guncellenen: number; ayni: number };
}
