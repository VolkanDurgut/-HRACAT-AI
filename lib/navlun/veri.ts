/**
 * NAVLUN BILDIRIMI - veri erisimi (10.11.2026). Okuma RLS ile ("navlun", "analiz" ya da "proformalar" yetkisi);
 * tek yazma: hata kuyrugu cozumu (navlun_hata_coz RPC). Migration: 20261110150000_navlun_bildirimi.sql
 */
import { supabase } from "@/lib/supabase";
import type { NavlunSatiri, SunucuDegerlendirmesi } from "@/lib/navlun/ozet";
import { baglamKur, type AcenteHafizasi, type GerceklesenKanit, type KarsilastirmaBaglami, type LimanKurali } from "@/lib/navlun/karsilastirma";
import { limanAnahtari } from "@/lib/liman-anahtari";
import { esleriYukle, type AdEsi } from "@/supabase/functions/_shared/navlun-tablosu";
import type { NavlunTeklifi } from "@/lib/siparis/plan-bekleyen";

export type OkunamayanMesaj = {
  id: string;
  konu: string | null;
  acente: string | null;
  liman: string | null;
  tarih: string;
  kaynak: string;
  ozet: string | null;
};

export type NavlunVerisi = {
  satirlar: NavlunSatiri[];
  okunamayanlar: OkunamayanMesaj[];
  sonOkuma: string | null;
  /** 13.11.2026: acente hafizasi + rezervasyondan ogrenilen + liman kurallari (okunamazsa null: yalniz mail metni) */
  baglam: KarsilastirmaBaglami | null;
  /** Baglam okunamadiysa nedeni (sayfada uyari) */
  baglamHatasi: string | null;
  /** 24.11.2026: "Teklif olabilecek mailler" (ayni okumada; bolum kendi verisini cekmez) */
  adaylar: TeklifAdayi[];
  adayHatasi: string | null;
};

/**
 * Karsilastirma baglami: acente hafizasi (navlun_acente_hafizasi), liman kurallari (navlun_liman_kurallari) ve
 * rezervasyon kanitlari (yukleme plani: konteyner basi navlun + lokal). Teklifler satirlar'dan.
 */
async function baglamOku(satirlar: NavlunSatiri[]): Promise<KarsilastirmaBaglami> {
  const [h, k, p] = await Promise.all([
    supabase.from("navlun_acente_hafizasi").select("acente_anahtar,acente_ad,lokal,lokal_20,lokal_40,ek_kont,guven,kanit"),
    supabase.from("navlun_liman_kurallari").select("liman_anahtar,temel,aciklama"),
    supabase.from("sevkiyat_plani").select("acente,varis_limani,etd,navlun_kont,lokal_kont,navlun_para").not("navlun_kont", "is", null).limit(5000),
  ]);
  if (h.error) throw new Error(`Acente hafızası okunamadı: ${h.error.message}`);
  if (k.error) throw new Error(`Liman kuralları okunamadı: ${k.error.message}`);
  if (p.error) throw new Error(`Yükleme planı okunamadı: ${p.error.message}`);
  const hafiza = ((h.data || []) as AcenteHafizasi[]).map((x) => ({
    ...x, lokal_20: x.lokal_20 == null ? null : Number(x.lokal_20), lokal_40: x.lokal_40 == null ? null : Number(x.lokal_40), ek_kont: Number(x.ek_kont || 0),
  }));
  const gerceklesen: GerceklesenKanit[] = ((p.data || []) as { acente: string | null; varis_limani: string | null; etd: string | null; navlun_kont: number | string | null; lokal_kont: number | string | null; navlun_para: string | null }[])
    .map((x) => ({ acente: x.acente, liman_anahtar: limanAnahtari(x.varis_limani), etd: x.etd, navlun: x.navlun_kont == null ? null : Number(x.navlun_kont),
      lokal: x.lokal_kont == null ? null : Number(x.lokal_kont), para: x.navlun_para }));
  const teklifler = satirlar.filter((s) => (s.tur === "teklif" || s.tur === "karsi_teklif") && s.tutar)
    .map((s) => ({ acente: s.acente, tutar: s.tutar as number, para_birimi: s.para_birimi, ekipman: s.ekipman, lokal_dahil: s.lokal_dahil, liman_anahtar: s.liman_anahtar, tarih: s.tarih }));
  return baglamKur(hafiza, (k.data || []) as LimanKurali[], teklifler, gerceklesen);
}

const SAYFA = 1000;

export async function navlunVerisiOku(gun = 120): Promise<NavlunVerisi> {
  const bas = new Date(Date.now() - gun * 86400000).toISOString();
  const satirlar: NavlunSatiri[] = [];
  for (let i = 0; i < 10; i++) {
    const { data, error } = await supabase
      .from("navlun_teklifleri")
      .select("id,mesaj_id,tur,liman,liman_anahtar,acente,armator,tutar,para_birimi,ekipman,free_time_gun,transit_gun,gecerlilik,lokal_dahil,kaynak,tarih")
      .gte("tarih", bas)
      .order("tarih", { ascending: true })
      .order("id", { ascending: true })
      .range(i * SAYFA, i * SAYFA + SAYFA - 1);
    if (error) throw new Error(error.message);
    satirlar.push(...((data || []) as NavlunSatiri[]).map((s) => ({ ...s, tutar: s.tutar == null ? null : Number(s.tutar) })));
    if (!data || data.length < SAYFA) break;
  }
  // 24.11.2026: geri kalan okumalar BIRLIKTE (sirayla degil); teklif degerlendirmesi sunucudan (tek hesap yeri)
  const [okR, sonR, eslerR, degR, adayR] = await Promise.all([
    supabase.from("navlun_mesajlari").select("id,konu,acente,liman,tarih,kaynak,ozet").eq("durum", "okunamadi").order("tarih", { ascending: false }).limit(200),
    supabase.from("navlun_mesajlari").select("updated_at").order("updated_at", { ascending: false }).limit(1),
    supabase.from("ad_esleri").select("tur,kaynak,hedef"),
    supabase.from("navlun_teklif_degerlendirme")
      .select("teklif_id,toplam_usd,lokal,ek,lokal_durum,metin,dayanak,celiski,yaklasik,durum,en_iyi,gecerlilik_bitis").limit(10000),
    supabase.rpc("navlun_teklif_adaylari"),
  ]);
  const { data: ok, error: e2 } = okR;
  if (e2) throw new Error(e2.message);
  const { data: son, error: e3 } = sonR;
  if (e3) throw new Error(e3.message);
  // Degerlendirme okunamazsa sayfa eski yoldan (tarayicida) hesaplar
  if (!degR.error) {
    const sayi = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
    const harita = new Map<string, SunucuDegerlendirmesi>();
    for (const d of (degR.data || []) as Record<string, unknown>[]) {
      harita.set(String(d.teklif_id), {
        toplam_usd: Number(d.toplam_usd), lokal: sayi(d.lokal), ek: Number(d.ek || 0), lokal_durum: d.lokal_durum as SunucuDegerlendirmesi["lokal_durum"],
        metin: (d.metin as string) || null, dayanak: (d.dayanak as string) || null, celiski: (d.celiski as string) || null, yaklasik: !!d.yaklasik,
        durum: d.durum as SunucuDegerlendirmesi["durum"], en_iyi: !!d.en_iyi, gecerlilik_bitis: (d.gecerlilik_bitis as string) || null,
      });
    }
    for (const s of satirlar) if (s.id && (s.tur === "teklif" || s.tur === "karsi_teklif")) s.degerlendirme = harita.get(s.id) ?? null;
  }
  // 16.11.2026 liman / firma es sozlugu (Excel indir tablosu edge raporuyla ayni eslesmeyi kullansin); okunamazsa sabit esler
  const { data: esler } = eslerR;
  esleriYukle((esler || []) as AdEsi[]);
  // Baglam okunamazsa sayfa yine acilir; lokali belirsiz teklifler en iyi sayilmaz (guvenli taraf) ve uyari gosterilir
  let baglam: KarsilastirmaBaglami | null = null;
  let baglamHatasi: string | null = null;
  try { baglam = await baglamOku(satirlar); } catch (e) { baglamHatasi = e instanceof Error ? e.message : "Karşılaştırma bilgisi okunamadı."; }
  return { satirlar, okunamayanlar: (ok || []) as OkunamayanMesaj[], sonOkuma: (son && son[0]?.updated_at) || null, baglam, baglamHatasi,
    adaylar: adayR.error ? [] : ((adayR.data || []) as TeklifAdayi[]), adayHatasi: adayR.error ? adayR.error.message : null };
}

export async function navlunHataCoz(id: string, islem: "duzelt" | "yoksay", tutar?: number, ekipman?: string, armator?: string, acente?: string): Promise<void> {
  const { error } = await supabase.rpc("navlun_hata_coz", {
    p_id: id, p_islem: islem, p_tutar: tutar ?? null, p_ekipman: ekipman || "20DC", p_armator: armator || null, p_acente: acente || null,
  });
  if (error) throw new Error(error.message);
}

/** 16.11.2026: fiyati okunamamis acente cevaplari (metninde tutar gecen ya da tanimadigimiz alan adindan gelen). */
/** 17.11.2026: denetim - okunmus mailde kayitli olmayan tutar da listeye duser; neden metni RPC'den gelir. */
export type TeklifAdayi = { id: string; konu: string | null; acente: string | null; alan: string; liman: string | null; tarih: string; metin: string; neden?: string | null };

/** 16.11.2026 "Yeniden oku": Apps Script bir sonraki calismasinda bu tarihten itibaren yazismalari sayfa sayfa yeniden okur. */
export type YenidenOkuma = { id: string; baslangic: string; durum: "bekliyor" | "isleniyor" | "tamam" | "iptal"; konum: number; gonderilen: number; yeni: number;
  istek_zamani: string; son_ilerleme: string | null; isteyen: string | null };
export async function yenidenOkumaDurumu(): Promise<YenidenOkuma | null> {
  const { data, error } = await supabase.from("navlun_yeniden_okuma")
    .select("id,baslangic,durum,konum,gonderilen,yeni,istek_zamani,son_ilerleme,isteyen").order("istek_zamani", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return ((data || [])[0] as YenidenOkuma | undefined) || null;
}
export async function yenidenOkumaIste(tarih: string): Promise<void> {
  const { error } = await supabase.rpc("navlun_yeniden_oku_iste", { p_tarih: tarih });
  if (error) throw new Error(error.message);
}
export async function yenidenOkumaIptal(): Promise<void> {
  const { error } = await supabase.rpc("navlun_yeniden_oku_iptal");
  if (error) throw new Error(error.message);
}

/**
 * 21.11.2026 Yukleme Plani "Rezervasyon bekleyen siparisler" paneli: son acente teklifleri (varsayilan 120 gun; RLS
 * "proformalar" / "analiz" / "navlun"). Liman eslesmesi ve acente basina son teklif: lib/siparis/plan-bekleyen.ts.
 */
export async function sonNavlunTeklifleriOku(gun = 120): Promise<NavlunTeklifi[]> {
  const bas = new Date(Date.now() - gun * 86400000).toISOString();
  const { data, error } = await supabase
    .from("navlun_teklifleri")
    .select("tur,liman,liman_anahtar,acente,tutar,para_birimi,ekipman,free_time_gun,transit_gun,tarih")
    .in("tur", ["teklif", "karsi_teklif"])
    .gte("tarih", bas)
    .order("tarih", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  return ((data || []) as Record<string, unknown>[]).map((r) => ({
    tur: String(r.tur || ""), liman: (r.liman as string) || null, liman_anahtar: (r.liman_anahtar as string) || null, acente: (r.acente as string) || null,
    tutar: r.tutar === null || r.tutar === undefined ? null : Number(r.tutar), para_birimi: (r.para_birimi as string) || null,
    ekipman: (r.ekipman as string) || null, free_time_gun: r.free_time_gun === null || r.free_time_gun === undefined ? null : Number(r.free_time_gun),
    transit_gun: r.transit_gun === null || r.transit_gun === undefined ? null : String(r.transit_gun), tarih: String(r.tarih || ""),
  }));
}
