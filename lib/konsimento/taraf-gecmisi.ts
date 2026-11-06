// ============================================================================
// KONSIMENTO TARAF GECMISI - musteri adi altinda hatirlanan consignee / notify (06.11.2026)
// ============================================================================
// Kullanici: "Musteri adi altinda notify / consignee hatirlanmali. Ama secili olarak son tercih ettigi
// notify ve consignee gelmeli." Kaynak: ayni sirketin ayni alici_firma'li (buyuk harf, bosluk sade)
// dosyalari; en yeni once, ayni metin bir kez. Secili deger = dosyanin kendi alanlari (yeni dosyada
// tetikleyici en son sevkiyattan doldurur: migration 20261106160000).
// ============================================================================

import { supabase } from "@/lib/supabase";

export type TarafSecenegi = { metin: string; dosyaNo: string; tarih: string | null };
export type TarafGecmisi = { consigneeler: TarafSecenegi[]; notifyler: TarafSecenegi[] };

export const aliciAnahtari = (s: string | null | undefined) => (s || "").trim().replace(/\s+/g, " ").toLocaleUpperCase("en-US");
const metinAnahtari = (s: string) => s.toLocaleUpperCase("en-US").replace(/[^A-Z0-9]+/g, "");

type Satir = { id: string; dosya_no: string | null; alici_firma: string | null; consignee: string | null; notify: unknown; olusturma_tarihi: string | null };

/** Saf: satirlardan tekil secenekler (en yeni once). */
export function tarafSecenekleri(satirlar: Satir[], alici: string, haricId?: string): TarafGecmisi {
  const anahtar = aliciAnahtari(alici);
  const uygun = satirlar
    .filter((s) => s.id !== haricId && aliciAnahtari(s.alici_firma) === anahtar)
    .sort((a, b) => (b.olusturma_tarihi || "").localeCompare(a.olusturma_tarihi || "") || (b.dosya_no || "").localeCompare(a.dosya_no || ""));
  const consigneeler: TarafSecenegi[] = []; const notifyler: TarafSecenegi[] = [];
  const ekle = (liste: TarafSecenegi[], metin: unknown, s: Satir) => {
    const m = typeof metin === "string" ? metin.replace(/\r/g, "").trim() : "";
    if (!m || liste.some((x) => metinAnahtari(x.metin) === metinAnahtari(m))) return;
    liste.push({ metin: m, dosyaNo: s.dosya_no || "-", tarih: s.olusturma_tarihi });
  };
  for (const s of uygun) {
    ekle(consigneeler, s.consignee, s);
    if (Array.isArray(s.notify)) for (const n of s.notify) ekle(notifyler, n, s);
  }
  return { consigneeler, notifyler };
}

/** Musterinin onceki dosyalarindan secenekler (RLS: kullanicinin gorebildigi dosyalar). */
export async function tarafGecmisiGetir(companyId: string, alici: string | null, haricId?: string): Promise<TarafGecmisi> {
  const a = (alici || "").trim();
  if (!a) return { consigneeler: [], notifyler: [] };
  // ilike ile aday satirlar (joker karakterler kacisli); kesin eslesme istemcide (bosluk / harf sade)
  const desen = a.replace(/[\\%_]/g, (c) => `\\${c}`).split(/\s+/).join("%");
  const { data } = await supabase.from("ihracat_dosyalari")
    .select("id, dosya_no, alici_firma, consignee, notify:ham_veri->notify, olusturma_tarihi")
    .eq("company_id", companyId).ilike("alici_firma", `%${desen}%`)
    .order("olusturma_tarihi", { ascending: false }).limit(60);
  return tarafSecenekleri((data || []) as Satir[], a, haricId);
}
