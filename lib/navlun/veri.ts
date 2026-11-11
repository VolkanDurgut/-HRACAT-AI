/**
 * NAVLUN BILDIRIMI - veri erisimi (10.11.2026). Okuma RLS ile ("analiz" ya da "proformalar" yetkisi);
 * tek yazma: hata kuyrugu cozumu (navlun_hata_coz RPC). Migration: 20261110150000_navlun_bildirimi.sql
 */
import { supabase } from "@/lib/supabase";
import type { NavlunSatiri } from "@/lib/navlun/ozet";

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
};

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
  return { satirlar, okunamayanlar: (ok || []) as OkunamayanMesaj[], sonOkuma: (son && son[0]?.updated_at) || null };
}

export async function navlunHataCoz(id: string, islem: "duzelt" | "yoksay", tutar?: number, ekipman?: string, armator?: string): Promise<void> {
  const { error } = await supabase.rpc("navlun_hata_coz", {
    p_id: id, p_islem: islem, p_tutar: tutar ?? null, p_ekipman: ekipman || "20DC", p_armator: armator || null,
  });
  if (error) throw new Error(error.message);
}
