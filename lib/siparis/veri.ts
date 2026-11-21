/**
 * SIPARIS LISTESI + YUKLEME PLANI - veri erisimi (11.11.2026).
 * Okuma: siparis_listesi() / yukleme_plani() RPC ("proformalar" veya "analiz" yetkisi).
 * Yazma: on odeme isareti - siparis_on_odeme_isaretle; Excel aktarimlari - yukleme_plani_aktar /
 * siparis_listesi_aktar (hepsi "proformalar" yetkisi).
 */
import { dagitimOku, type OnOdemeDagitimi } from "@/lib/on-odeme";
import { odemeAlindiMi } from "@/lib/odeme-takibi";
import type { BakiyeBilgisi } from "@/lib/siparis/odeme";
import type { BekleyenDurum } from "@/lib/siparis/plan-bekleyen";
import { supabase } from "@/lib/supabase";
import { planNormalize, siparisNormalize, type PlanSatiri, type SiparisSatiri } from "@/lib/siparis/liste";
import { aktarimSatiri, type PlanExcelSatiri, type PlanMevcut } from "@/lib/siparis/plan-excel";
import type { SiparisAktarimSatiri, SiparisMevcut, SiparisSistemBilgisi } from "@/lib/siparis/siparis-excel";

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

/**
 * 12.11.2026 SATIR SILME (siparis_satiri_sil): Excel'den gelen satir (excel:) ya da dosyasi acilmamis proforma (proforma:).
 * Ihracat dosyasi acilmis satir (dosya:) silinmez. Donus: silinen proforma no.
 */
export const siparisSilinebilir = (anahtar: string) => anahtar.startsWith("excel:") || anahtar.startsWith("proforma:");
export async function siparisSatiriSil(anahtar: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("siparis_satiri_sil", { p_anahtar: anahtar });
  if (error) throw new Error(error.message);
  return ((data || {}) as { proforma_no?: string | null }).proforma_no ?? null;
}

/** On odeme: alindi=true icin tutar zorunlu (siparis_on_odeme_kaydet). oran = proformadaki on odeme yuzdesi (bossa odeme
 *  sartindan okunur); karsilik = odeme siparis dovizinden farkli geldiyse siparis dovizindeki tutari (16.11.2026). */
export async function onOdemeKaydet(proformaNo: string, alindi: boolean, tutar?: number, para = "USD", tarih?: string,
  ek: { oran?: number | null; karsilik?: number | null } = {}): Promise<OnOdemeDagitimi | null> {
  const { data, error } = await supabase.rpc("siparis_on_odeme_kaydet", {
    p_proforma_no: proformaNo, p_alindi: alindi, p_tutar: alindi ? tutar ?? null : null, p_para_birimi: para, p_tarih: alindi ? tarih ?? null : null,
    p_oran: alindi ? ek.oran ?? null : null, p_karsilik: alindi ? ek.karsilik ?? null : null,
  });
  if (error) throw new Error(error.message);
  return dagitimOku((data as { dagitim?: unknown } | null)?.dagitim);
}

/** Proformanin on odeme dagilimi (sevkiyat dosyalarina düşen paylar; yazmaz). */
export async function onOdemeDagilimiOku(proformaNo: string): Promise<OnOdemeDagitimi | null> {
  const { data, error } = await supabase.rpc("siparis_on_odeme_dagilimi", { p_proforma_no: proformaNo });
  if (error) throw new Error(error.message);
  return dagitimOku(data);
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
  const sutunlar = "id,sira,proforma_no,proforma_tarihi,firma,urun,birim_fiyat,miktar_mt,tutar,konteyner,liman,bl_no,marka,paketleme,durum,bakiye_odendi,bakiye_tutar";
  const sonuc: SiparisMevcut[] = [];
  for (let bas = 0; ; bas += 1000) {
    const { data, error } = await supabase.from("siparis_defteri").select(sutunlar).order("sira", { nullsFirst: false }).range(bas, bas + 999);
    if (error) throw new Error(error.message);
    const say = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
    sonuc.push(...((data || []) as Record<string, unknown>[]).map((r) => ({
      ...(r as unknown as SiparisMevcut), birim_fiyat: say(r.birim_fiyat), miktar_mt: say(r.miktar_mt), tutar: say(r.tutar), konteyner: say(r.konteyner), sira: say(r.sira),
      bakiye_tutar: say(r.bakiye_tutar),
    })));
    if (!data || data.length < 1000) break;
  }
  return sonuc;
}

/** 21.11.2026 Excel aktarimi "sistem esas" bilgisi: sistem proformalari + dosyasi olan defter satirlarinin booking'i. */
export async function siparisSistemBilgisiOku(): Promise<SiparisSistemBilgisi> {
  const [p, l] = await Promise.all([
    supabase.from("proformalar").select("proforma_no").limit(5000),
    supabase.rpc("siparis_listesi"),
  ]);
  if (p.error) throw new Error(p.error.message);
  if (l.error) throw new Error(l.error.message);
  const dosyalar = new Map<string, { dosya_no: string; booking: string | null }>();
  for (const r of (l.data || []) as { anahtar: string; dosya_no: string | null; booking_no: string | null }[]) {
    if (r.anahtar?.startsWith("excel:") && r.dosya_no) dosyalar.set(r.anahtar.slice(6), { dosya_no: r.dosya_no, booking: r.booking_no });
  }
  return { proformalar: ((p.data || []) as { proforma_no: string | null }[]).map((x) => x.proforma_no || "").filter(Boolean), dosyalar };
}

/**
 * 21.11.2026 KALAN ODEME girdisi (siparis_bakiye_durumu): Excel "Bakiye" sutunu + sistem dosyalarinin konsimento durumu.
 * Dosya "odendi" = tum rezervasyonlarinin konsimentosu odeme alindi (Telex / Seawaybill / Vesaik; lib/odeme-takibi.ts).
 */
export async function bakiyeDurumuOku(): Promise<BakiyeBilgisi> {
  const { data, error } = await supabase.rpc("siparis_bakiye_durumu");
  if (error) throw new Error(error.message);
  const d = (data || {}) as { defter?: { anahtar: string; odendi: boolean | null; tutar: number | string | null }[]; dosyalar?: { dosya_no: string; konsimento: (string | null)[] | null }[] };
  const defter = new Map<string, { odendi: boolean | null; tutar: number | null }>();
  for (const r of d.defter || []) defter.set(r.anahtar, { odendi: r.odendi ?? null, tutar: r.tutar === null || r.tutar === undefined || r.tutar === "" ? null : Number(r.tutar) });
  const dosyaOdendi = new Map<string, boolean>();
  for (const r of d.dosyalar || []) {
    const k = r.konsimento || [];
    dosyaOdendi.set(r.dosya_no, k.length > 0 && k.every((x) => odemeAlindiMi(x)));
  }
  return { defter, dosyaOdendi };
}

/** 21.11.2026 Yukleme Plani rezervasyon bekleyenler: proforma basina sistem proformasi / rezervasyonsuz acik dosya / siparis takibi. */
export async function planBekleyenDurumlariOku(proformalar: string[]): Promise<Map<string, BekleyenDurum>> {
  const liste = Array.from(new Set(proformalar.map((p) => p.trim()).filter(Boolean))).slice(0, 500);
  const harita = new Map<string, BekleyenDurum>();
  if (!liste.length) return harita;
  const { data, error } = await supabase.rpc("plan_bekleyen_aksiyonlari", { p_proformalar: liste });
  if (error) throw new Error(error.message);
  for (const r of (data || []) as BekleyenDurum[]) if (r && r.proforma_no) harita.set(r.proforma_no, { ...r, proforma_id: r.proforma_id || null, dosya: r.dosya || null, ana_siparis: r.ana_siparis || null });
  return harita;
}

export async function siparisAktar(dosyaAdi: string, satirlar: SiparisAktarimSatiri[]): Promise<{ eklenen: number; guncellenen: number; ayni: number }> {
  const { data, error } = await supabase.rpc("siparis_listesi_aktar", { p_dosya_adi: dosyaAdi.slice(0, 200), p_satirlar: satirlar });
  if (error) throw new Error(error.message);
  return data as { eklenen: number; guncellenen: number; ayni: number };
}

/** 16.11.2026 "Ayni siparis" eslestirmesi: sistem proformasi <-> Excel satiri (siparis_eslesmeleri). */
export type EslesmeAdayi = { anahtar: string; proforma_no: string | null; proforma_tarihi: string | null; firma: string | null; miktar_mt: number | null;
  tutar: number | null; para_birimi: string | null; konteyner: number | null; liman: string | null; durum: string | null; bl_no: string | null; puan: number };

export async function eslesmeAdaylariOku(proformaNo: string): Promise<EslesmeAdayi[]> {
  const { data, error } = await supabase.rpc("siparis_eslesme_adaylari", { p_proforma_no: proformaNo });
  if (error) throw new Error(error.message);
  const sayi = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  return ((data || []) as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as EslesmeAdayi), miktar_mt: sayi(r.miktar_mt), tutar: sayi(r.tutar), konteyner: sayi(r.konteyner), puan: Number(r.puan || 0),
  }));
}
export async function siparisEslestir(proformaNo: string, defterAnahtar: string): Promise<void> {
  const { error } = await supabase.rpc("siparis_eslestir", { p_proforma_no: proformaNo, p_defter_anahtar: defterAnahtar });
  if (error) throw new Error(error.message);
}
export async function siparisEslesmeKaldir(proformaNo: string): Promise<void> {
  const { error } = await supabase.rpc("siparis_eslesme_kaldir", { p_proforma_no: proformaNo });
  if (error) throw new Error(error.message);
}

/** "Onay geldi" - imzali proforma ile onay (17.11.2026; siparis_onay_imzali). Tutar yok; siparis "Rezervasyon bekleyen"e
 *  gecer. Daha once girilmis on odeme tutari veritabaninda korunur. tarih: YYYY-AA-GG (bos = bugun). */
export async function onayImzaliKaydet(proformaNo: string, tarih?: string): Promise<void> {
  const { error } = await supabase.rpc("siparis_onay_imzali", { p_proforma_no: proformaNo, p_tarih: tarih || null });
  if (error) throw new Error(error.message);
}

/**
 * 21.11.2026 (Faz 4, sistem esas): sistemde hic karsiligi olmayan aktif Excel satirlari (proforma, dosya, elle eslesme
 * yok). Bunlarin durumu yalniz Excel'den gelir; Siparis Listesi seridinde gosterilir. RPC: siparis_eslesmeyenler().
 */
export type EslesmeyenSatir = {
  anahtar: string; proforma_no: string | null; proforma_tarihi: string | null; firma: string | null; miktar_mt: number | null;
  konteyner: number | null; liman: string | null; durum: SiparisSatiri["durum"]; booking_no: string | null; bl_no: string | null;
};
export async function eslesmeyenleriOku(): Promise<EslesmeyenSatir[]> {
  const { data, error } = await supabase.rpc("siparis_eslesmeyenler");
  if (error) throw new Error(error.message);
  return ((data || []) as Record<string, unknown>[]).map((r) => ({
    anahtar: String(r.anahtar || ""), proforma_no: (r.proforma_no as string) || null, proforma_tarihi: (r.proforma_tarihi as string) || null,
    firma: (r.firma as string) || null, miktar_mt: r.miktar_mt === null || r.miktar_mt === undefined ? null : Number(r.miktar_mt),
    konteyner: r.konteyner === null || r.konteyner === undefined ? null : Number(r.konteyner), liman: (r.liman as string) || null,
    durum: r.durum as SiparisSatiri["durum"], booking_no: (r.booking_no as string) || null, bl_no: (r.bl_no as string) || null,
  })).filter((r) => r.anahtar);
}
