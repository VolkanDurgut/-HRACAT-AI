/**
 * PROVA OZETI (22.11.2026, test ortami - lib/ortam.ts). Dosya acma adiminda veritabanina yazmadan gosterilecek
 * kalem listesi. Saf; test: tests/booking-siparis-takibi.test.ts.
 */
import { sayiOku, kalemMiktari } from "@/lib/sayi-oku";

export type ProvaKalemi = { urun: string; mts: number; tutar: number | null };

/** urun_detaylari (proformadan okunan ya da Sevkiyat Seciminden gelen) -> prova kalemleri. */
export function provaKalemleri(kalemler: unknown): ProvaKalemi[] {
  if (!Array.isArray(kalemler)) return [];
  return kalemler.map((ham) => {
    const u = (ham || {}) as Record<string, unknown>;
    const urun = String(u.urun_adi || u.description || "—");
    const tutarHam = u.toplam_tutar_usd ?? u.toplam_tutar ?? u.amount;
    const tutar = tutarHam === undefined || tutarHam === null || tutarHam === "" ? null : sayiOku(tutarHam);
    return { urun, mts: Math.round(kalemMiktari(u as { miktar_mts?: unknown }) * 100) / 100, tutar: tutar !== null && Number.isFinite(tutar) ? tutar : null };
  });
}
