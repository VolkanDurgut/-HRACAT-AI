/**
 * SIPARIS LISTESI + YUKLEME PLANI - veri erisimi (11.11.2026).
 * Okuma: siparis_listesi() / yukleme_plani() RPC ("proformalar" veya "analiz" yetkisi).
 * Yazma: on odeme isareti - siparis_on_odeme_isaretle; yukleme plani Excel aktarimi - yukleme_plani_aktar
 * (ikisi de "proformalar" yetkisi).
 */
import { supabase } from "@/lib/supabase";
import { planNormalize, siparisNormalize, type PlanSatiri, type SiparisSatiri } from "@/lib/siparis/liste";
import { aktarimSatiri, type PlanExcelSatiri, type PlanMevcut } from "@/lib/siparis/plan-excel";

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

export async function onOdemeIsaretle(proformaNo: string, alindi: boolean): Promise<void> {
  const { error } = await supabase.rpc("siparis_on_odeme_isaretle", { p_proforma_no: proformaNo, p_alindi: alindi });
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
