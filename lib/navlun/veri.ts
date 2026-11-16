/**
 * NAVLUN BILDIRIMI - veri erisimi (10.11.2026). Okuma RLS ile ("navlun", "analiz" ya da "proformalar" yetkisi);
 * tek yazma: hata kuyrugu cozumu (navlun_hata_coz RPC). Migration: 20261110150000_navlun_bildirimi.sql
 */
import { supabase } from "@/lib/supabase";
import type { NavlunSatiri } from "@/lib/navlun/ozet";
import { baglamKur, type AcenteHafizasi, type GerceklesenKanit, type KarsilastirmaBaglami, type LimanKurali } from "@/lib/navlun/karsilastirma";
import { limanAnahtari } from "@/lib/liman-anahtari";

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
      .select("mesaj_id,tur,liman,liman_anahtar,acente,armator,tutar,para_birimi,ekipman,free_time_gun,transit_gun,gecerlilik,lokal_dahil,kaynak,tarih")
      .gte("tarih", bas)
      .order("tarih", { ascending: true })
      .order("id", { ascending: true })
      .range(i * SAYFA, i * SAYFA + SAYFA - 1);
    if (error) throw new Error(error.message);
    satirlar.push(...((data || []) as NavlunSatiri[]).map((s) => ({ ...s, tutar: s.tutar == null ? null : Number(s.tutar) })));
    if (!data || data.length < SAYFA) break;
  }
  const { data: ok, error: e2 } = await supabase
    .from("navlun_mesajlari")
    .select("id,konu,acente,liman,tarih,kaynak,ozet")
    .eq("durum", "okunamadi")
    .order("tarih", { ascending: false })
    .limit(200);
  if (e2) throw new Error(e2.message);
  const { data: son, error: e3 } = await supabase.from("navlun_mesajlari").select("updated_at").order("updated_at", { ascending: false }).limit(1);
  if (e3) throw new Error(e3.message);
  // Baglam okunamazsa sayfa yine acilir; lokali belirsiz teklifler en iyi sayilmaz (guvenli taraf) ve uyari gosterilir
  let baglam: KarsilastirmaBaglami | null = null;
  let baglamHatasi: string | null = null;
  try { baglam = await baglamOku(satirlar); } catch (e) { baglamHatasi = e instanceof Error ? e.message : "Karşılaştırma bilgisi okunamadı."; }
  return { satirlar, okunamayanlar: (ok || []) as OkunamayanMesaj[], sonOkuma: (son && son[0]?.updated_at) || null, baglam, baglamHatasi };
}

export async function navlunHataCoz(id: string, islem: "duzelt" | "yoksay", tutar?: number, ekipman?: string, armator?: string): Promise<void> {
  const { error } = await supabase.rpc("navlun_hata_coz", {
    p_id: id, p_islem: islem, p_tutar: tutar ?? null, p_ekipman: ekipman || "20DC", p_armator: armator || null,
  });
  if (error) throw new Error(error.message);
}
