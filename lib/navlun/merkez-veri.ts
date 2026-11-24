/**
 * NAVLUN MERKEZI - TEK VERI OKUMASI (24.11.2026, Asama 2). Yeni ekranin tum sekmeleri bu okumanin sonucunu paylasir;
 * hicbir kart kendi verisini ayrica cekmez. Hesap SUNUCUDA (edge navlun-bildirimi "degerlendir"); burada yalniz okunur.
 * Okuma RLS ile ("navlun" / "analiz" / "proformalar"). Tek yazma: navlun_kontrol_isle RPC (Kontrol sekmesi; iz birakir).
 */
import { supabase } from "@/lib/supabase";
import type { OkunamayanMesaj, TeklifAdayi } from "@/lib/navlun/veri";
import type { AcenteHafiza, DegerlendirmeSatiri, GerceklesenSatiri, HedefKabul, KontrolHedefi, KontrolIslemi, KontrolIslemTuru, MerkezVerisi } from "@/lib/navlun/merkez";

const sayi = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));

type HamDegerlendirme = Record<string, unknown> & { navlun_teklifleri: Record<string, unknown> | Record<string, unknown>[] | null };

export async function navlunMerkezVerisiOku(): Promise<MerkezVerisi> {
  const bas = new Date(Date.now() - 150 * 86400000).toISOString();
  const islemBas = new Date(Date.now() - 365 * 86400000).toISOString();
  const [d, g, i, o, a, hk, h] = await Promise.all([
    supabase.from("navlun_teklif_degerlendirme")
      .select("teklif_id,liman_anahtar,acente,ekipman,tutar,para,toplam_usd,lokal,ek,lokal_durum,metin,dayanak,celiski,yaklasik,gecerlilik_bitis,gecerlilik_kaynagi,durum,en_iyi,hesap_zamani,navlun_teklifleri(liman,armator,free_time_gun,transit_gun,tarih,kaynak)")
      .limit(5000),
    supabase.from("navlun_gerceklesen_kontrol")
      .select("sevkiyat_id,booking_no,acente,liman_anahtar,etd,referans_tarih,gercek,para,teklif_tutar,teklif_para,teklif_tarih,fark,durum,aciklama")
      .order("etd", { ascending: false }).limit(5000),
    supabase.from("navlun_kontrol_islemleri")
      .select("id,hedef_tur,hedef_id,islem,onceki,sonraki,gerekce,kullanici_eposta,zaman")
      .gte("zaman", islemBas).order("zaman", { ascending: false }).limit(2000),
    supabase.from("navlun_mesajlari").select("id,konu,acente,liman,tarih,kaynak,ozet").eq("durum", "okunamadi").order("tarih", { ascending: false }).limit(200),
    supabase.rpc("navlun_teklif_adaylari"),
    supabase.from("navlun_teklifleri").select("liman_anahtar,tur,tutar,armator,tarih").in("tur", ["hedef", "kabul"]).gte("tarih", bas).limit(5000),
    supabase.from("navlun_acente_hafizasi").select("acente_anahtar,acente_ad,lokal,lokal_20,lokal_40,ek_kont,guven,kanit,kaynak"),
  ]);
  // Ana tablo okunamazsa ekran acilmaz; digerleri uyariyla bos gecer
  if (d.error) throw new Error(`Navlun değerlendirmesi okunamadı: ${d.error.message}`);
  const uyarilar: string[] = [];
  const al = <T,>(r: { data: unknown; error: { message: string } | null }, ad: string): T[] => {
    if (r.error) { uyarilar.push(`${ad} okunamadı: ${r.error.message}`); return []; }
    return (r.data || []) as T[];
  };
  let hesapZamani: string | null = null;
  const degerlendirme: DegerlendirmeSatiri[] = ((d.data || []) as unknown as HamDegerlendirme[]).map((x) => {
    // Coktan bire iliski tek nesne doner; istemci tipi dizi sanabilir
    const t = (Array.isArray(x.navlun_teklifleri) ? x.navlun_teklifleri[0] : x.navlun_teklifleri) || {};
    const hz = x.hesap_zamani as string;
    if (hz && (!hesapZamani || hz > hesapZamani)) hesapZamani = hz;
    return {
      teklif_id: String(x.teklif_id), liman_anahtar: (x.liman_anahtar as string) || null, acente: (x.acente as string) || null, ekipman: (x.ekipman as string) || null,
      tutar: Number(x.tutar), para: String(x.para || "USD"), toplam_usd: Number(x.toplam_usd), lokal: sayi(x.lokal), ek: Number(x.ek || 0),
      lokal_durum: x.lokal_durum as DegerlendirmeSatiri["lokal_durum"], metin: (x.metin as string) || null, dayanak: (x.dayanak as string) || null,
      celiski: (x.celiski as string) || null, yaklasik: !!x.yaklasik, gecerlilik_bitis: String(x.gecerlilik_bitis),
      gecerlilik_kaynagi: x.gecerlilik_kaynagi as DegerlendirmeSatiri["gecerlilik_kaynagi"], durum: x.durum as DegerlendirmeSatiri["durum"], en_iyi: !!x.en_iyi,
      liman: (t.liman as string) || null, armator: (t.armator as string) || null, free_time_gun: sayi(t.free_time_gun),
      transit_gun: t.transit_gun == null ? null : String(t.transit_gun), tarih: String(t.tarih || ""), kaynak: (t.kaynak as string) || null,
    };
  }).filter((x) => x.tarih);
  const gerceklesen = al<Record<string, unknown>>(g, "Gerçekleşen navlun kontrolü").map((x) => ({
    sevkiyat_id: String(x.sevkiyat_id), booking_no: (x.booking_no as string) || null, acente: (x.acente as string) || null, liman_anahtar: (x.liman_anahtar as string) || null,
    etd: (x.etd as string) || null, referans_tarih: (x.referans_tarih as string) || null, gercek: Number(x.gercek), para: String(x.para || "USD"),
    teklif_tutar: sayi(x.teklif_tutar), teklif_para: (x.teklif_para as string) || null, teklif_tarih: (x.teklif_tarih as string) || null, fark: sayi(x.fark),
    durum: x.durum as GerceklesenSatiri["durum"], aciklama: (x.aciklama as string) || null,
  }));
  const hafiza = al<Record<string, unknown>>(h, "Acente hafızası").map((x) => ({
    acente_anahtar: String(x.acente_anahtar), acente_ad: String(x.acente_ad), lokal: x.lokal as AcenteHafiza["lokal"], lokal_20: sayi(x.lokal_20), lokal_40: sayi(x.lokal_40),
    ek_kont: Number(x.ek_kont || 0), guven: String(x.guven || ""), kanit: String(x.kanit || ""), kaynak: String(x.kaynak || ""),
  }));
  return {
    degerlendirme, gerceklesen,
    islemler: al<KontrolIslemi>(i, "İşlem kaydı"),
    okunamayanlar: al<OkunamayanMesaj>(o, "Okunamayan mailler"),
    adaylar: al<TeklifAdayi>(a, "Teklif olabilecek mailler"),
    hedefKabul: al<Record<string, unknown>>(hk, "Hedef / kabul").map((x) => ({
      liman_anahtar: (x.liman_anahtar as string) || null, tur: x.tur as HedefKabul["tur"], tutar: sayi(x.tutar), armator: (x.armator as string) || null, tarih: String(x.tarih),
    })),
    hafiza, hesapZamani, uyarilar,
  };
}

/** Kontrol islemi (Duzelt ve Kaydet / Olduğu Gibi Onayla / Yoksay / Kural olarak ogret). Doner: yeniden hesap tetiklendi mi. */
export async function kontrolIsle(hedefTur: KontrolHedefi, hedefId: string, islem: KontrolIslemTuru, veri: Record<string, unknown> = {}, gerekce?: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("navlun_kontrol_isle", {
    p_hedef_tur: hedefTur, p_hedef_id: hedefId, p_islem: islem, p_veri: veri, p_gerekce: gerekce?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return !!(data as { yeniden_hesap?: boolean } | null)?.yeniden_hesap;
}
