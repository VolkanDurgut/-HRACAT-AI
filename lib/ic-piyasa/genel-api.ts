/**
 * Girissiz sayfalar (musteri takip /takip/[token], lojistik cikis /cikis/[token])
 * icin "ic-piyasa" edge function cagrisi (12.10.2026). Oturum gerektirmez;
 * yetki 32 haneli tahmin edilemez token ile. Veritabanina dogrudan erisim YOK.
 */
export type GenelCevap<T> = { ok: true; veri: T } | { ok: false; hata: string; durum: number };

export async function icPiyasaCagir<T>(govde: Record<string, unknown>): Promise<GenelCevap<T>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anahtar = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    const res = await fetch(`${url}/functions/v1/ic-piyasa`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anahtar || "", Authorization: `Bearer ${anahtar}` },
      body: JSON.stringify(govde),
    });
    const veri = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, hata: (veri as { hata?: string }).hata || "Beklenmeyen bir hata oluştu.", durum: res.status };
    return { ok: true, veri: veri as T };
  } catch {
    return { ok: false, hata: "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.", durum: 0 };
  }
}

export const tokenBicimiGecerli = (t: string | undefined) => !!t && /^[0-9a-f]{32}$/.test(t);

/** "12.10.2026 14:05" (Turkiye saati) */
export function trTarihSaat(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "14:05" (Turkiye saati) */
export function trSaat(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
}

/** Ayni gun mu (Turkiye)? */
export function trBugunMu(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const f = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  return f(new Date(iso)) === f(new Date());
}
