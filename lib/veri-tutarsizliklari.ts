/**
 * Kontrol Merkezi "Veri Tutarsızlıkları" (16.11.2026). Kaynak: veri_tutarsizliklari() RPC (salt okunur; hiçbir veriyi
 * değiştirmez). Migration 20261116210000_veri_tutarliligi.sql.
 */
import { supabase } from "@/lib/supabase";

export type TutarsizlikTuru = "etd_farki" | "cift_siparis" | "navlunsuz_booking" | "bekleyen_siparis" | "kaynak_eski";
export type Tutarsizlik = { tur: TutarsizlikTuru; onem: "yuksek" | "orta" | "bilgi"; baslik: string; ayrinti: string; baglanti: string | null };
export type TutarsizlikOzeti = { tarih: string; plan_son: string | null; siparis_son: string | null; navlun_son: string | null; kalemler: Tutarsizlik[] };

export const TUR_BASLIGI: Record<TutarsizlikTuru, string> = {
  kaynak_eski: "Güncel olmayan kaynak",
  etd_farki: "Plan ile rezervasyon ETD farkı",
  cift_siparis: "Aynı sipariş iki numarayla",
  navlunsuz_booking: "Navlunu bilinmeyen booking",
  bekleyen_siparis: "Uzun süredir booking bekleyen",
};
const SIRA: TutarsizlikTuru[] = ["kaynak_eski", "bekleyen_siparis", "navlunsuz_booking", "etd_farki", "cift_siparis"];

export async function tutarsizliklariOku(): Promise<TutarsizlikOzeti> {
  const { data, error } = await supabase.rpc("veri_tutarsizliklari");
  if (error) throw new Error(error.message);
  return tutarsizlikOzetiOku(data);
}

/** RPC cevabını güvenli tipe çevirir; bilinmeyen tür atılır. */
export function tutarsizlikOzetiOku(ham: unknown): TutarsizlikOzeti {
  const h = (ham && typeof ham === "object" ? ham : {}) as Record<string, unknown>;
  const metin = (v: unknown) => (typeof v === "string" ? v : null);
  const kalemler = (Array.isArray(h.kalemler) ? h.kalemler : [])
    .map((k) => k as Record<string, unknown>)
    .filter((k) => SIRA.includes(k.tur as TutarsizlikTuru))
    .map((k) => ({ tur: k.tur as TutarsizlikTuru, onem: (k.onem === "yuksek" || k.onem === "bilgi" ? k.onem : "orta") as Tutarsizlik["onem"],
      baslik: metin(k.baslik) || "—", ayrinti: metin(k.ayrinti) || "", baglanti: metin(k.baglanti) }));
  return { tarih: metin(h.tarih) || "", plan_son: metin(h.plan_son), siparis_son: metin(h.siparis_son), navlun_son: metin(h.navlun_son), kalemler };
}

/** Türe göre gruplar (önemli olan önce). */
export function tutarsizlikGruplari(k: Tutarsizlik[]): { tur: TutarsizlikTuru; kalemler: Tutarsizlik[] }[] {
  return SIRA.map((tur) => ({ tur, kalemler: k.filter((x) => x.tur === tur) })).filter((g) => g.kalemler.length > 0);
}
