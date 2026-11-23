/**
 * SIPARIS BILDIRIM FORMU - lojistik secim sayfasi (/siparis-formu-sec/[token]) -> edge "siparis-formu" (23.11.2026).
 * Girissiz; yetki maildeki 32 haneli token (3 gun). Veritabanina dogrudan erisim YOK.
 */
import type { LojistikSatiri } from "@/supabase/functions/_shared/siparis-formu-lojistik";

export type SecimBilgisi = {
  tarih: string;
  liste_tarihi: string;
  /** true: secilen formlar yalniz test adresine gider, isaret kaydedilmez */
  test: boolean;
  satirlar: LojistikSatiri[];
  islenen: { booking: string | null; durum: "gonderildi" | "test" | "isaretlendi"; zaman: string }[];
  alicilar: string[];
  cc: string[];
};
export type SecimSonucu = { booking: string; gonderildi?: boolean; isaretlendi?: boolean; test?: boolean; atlandi?: string };
export type Cevap<T> = { ok: true; veri: T } | { ok: false; hata: string };

async function cagir<T>(govde: Record<string, unknown>): Promise<Cevap<T>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anahtar = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  try {
    const res = await fetch(`${url}/functions/v1/siparis-formu`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anahtar, Authorization: `Bearer ${anahtar}` },
      body: JSON.stringify(govde),
    });
    const veri = (await res.json().catch(() => ({}))) as { ok?: boolean; hata?: string };
    if (!res.ok || veri.ok === false) return { ok: false, hata: veri.hata || "Beklenmeyen bir hata oluştu." };
    return { ok: true, veri: veri as T };
  } catch {
    return { ok: false, hata: "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin." };
  }
}

export const secimBilgisi = (token: string) => cagir<SecimBilgisi>({ islem: "lojistik_bilgi", token });
export const formlariGonder = (token: string, bookingler: string[]) =>
  cagir<{ test: boolean; sonuclar: SecimSonucu[]; alici: string[] }>({ islem: "lojistik_gonder", token, bookingler });
export const gonderildiIsaretle = (token: string, bookingler: string[]) =>
  cagir<{ test: boolean; sonuclar: SecimSonucu[] }>({ islem: "lojistik_kapat", token, bookingler });

