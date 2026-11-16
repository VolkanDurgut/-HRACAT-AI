/**
 * ADRES (URL) DURUMU (16.11.2026, ERP ortak kit). Sekme / filtre adreste tutulur (?sekme=, ?filtre=); degisince adres
 * guncellenir ama tarayici gecmisi kirletilmez (replaceState). Bes sayfada ayni kod tekrar ediyordu.
 * urlGuncelle saf (test: tests/erp-kit.test.ts); adresiGuncelle tarayicida uygular.
 */

/** href'e degisimleri uygular: null / "" -> parametre silinir. sil: ayrica silinecek eski parametreler (or. "filter"). */
export function urlGuncelle(href: string, degisim: Record<string, string | null>, sil: string[] = []): string {
  const u = new URL(href);
  for (const [k, v] of Object.entries(degisim)) { if (v === null || v === "") u.searchParams.delete(k); else u.searchParams.set(k, v); }
  for (const k of sil) u.searchParams.delete(k);
  return u.toString();
}

/** Tarayicida adresi gunceller (gecmise yeni kayit eklemez). Sunucuda / hata durumunda sessizce gecer. */
export function adresiGuncelle(degisim: Record<string, string | null>, sil: string[] = []): void {
  try { window.history.replaceState(window.history.state, "", urlGuncelle(window.location.href, degisim, sil)); } catch { /* yok */ }
}

/** Adresten bir parametre (sunucuda / hata durumunda null). */
export function adresParametresi(ad: string): string | null {
  try { return new URLSearchParams(window.location.search).get(ad); } catch { return null; }
}
