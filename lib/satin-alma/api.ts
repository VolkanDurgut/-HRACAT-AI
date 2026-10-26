import { supabase } from "@/lib/supabase";

/**
 * "satin-alma" edge function cagrisi (26.10.2026).
 *  - Girissiz departman sayfasi (/talep/[token]): oturum yok, yetki 32 haneli token.
 *  - Uygulama ici (/satin-alma): oturumdaki kullanicinin JWT'si gonderilir;
 *    "satin_alma" yetkisi veritabaninda kontrol edilir.
 */
export type SaCevap<T> = { ok: true; veri: T } | { ok: false; hata: string; durum: number };

export async function satinAlmaCagir<T>(govde: Record<string, unknown>, oturumla = false): Promise<SaCevap<T>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anahtar = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  let yetki = `Bearer ${anahtar}`;
  if (oturumla) {
    const { data } = await supabase.auth.getSession();
    const jeton = data?.session?.access_token;
    if (!jeton) return { ok: false, hata: "Oturum bulunamadı. Lütfen yeniden giriş yapın.", durum: 401 };
    yetki = `Bearer ${jeton}`;
  }
  try {
    const res = await fetch(`${url}/functions/v1/satin-alma`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anahtar, Authorization: yetki },
      body: JSON.stringify(govde),
    });
    const veri = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, hata: (veri as { hata?: string }).hata || "Beklenmeyen bir hata oluştu.", durum: res.status };
    return { ok: true, veri: veri as T };
  } catch {
    return { ok: false, hata: "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.", durum: 0 };
  }
}

/** "2,5" / "2.5" / " 10 " -> sayi; gecersizse null (en fazla 2 ondalik, > 0). */
export function miktarOku(deger: string): number | null {
  const t = (deger || "").trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 1_000_000 ? n : null;
}
