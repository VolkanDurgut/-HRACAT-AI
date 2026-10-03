/**
 * Urun kalemlerindeki miktar / fiyat degerlerini guvenli sayiya cevirir
 * (duzeltme: 03.10.2026).
 *
 * Kok neden: Kalemler hem "252.45" hem de elle girilmis "252,45" bicimiyle
 * kayitli olabiliyor. parseFloat("252,45") === 252 - virgulden sonrasi
 * sessizce kayboluyordu (UNEXESF201125 siparisinde "Kalan 3,35 MTS" bundan
 * cikti; dogrusu 2,90). Kural:
 *   - sayi tipindeyse oldugu gibi
 *   - sadece virgul varsa ("252,45")        -> virgul ondalik ayirici
 *   - hem nokta hem virgul varsa ("1.250,5") -> nokta binlik, virgul ondalik
 *   - sadece nokta varsa ("252.45")          -> eski davranisla AYNI (parseFloat)
 * Okunamayan / bos deger 0 doner.
 */
export function sayiOku(deger: unknown): number {
  if (typeof deger === "number") return Number.isFinite(deger) ? deger : 0;
  if (deger === null || deger === undefined) return 0;
  let s = String(deger).trim().replace(/\s+/g, "");
  if (!s) return 0;
  if (s.includes(",")) {
    s = s.includes(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", ".");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Bir urun kaleminin MTS miktari (yeni "miktar_mts" ya da eski "quantity" alani). */
export function kalemMiktari(u: { miktar_mts?: unknown; quantity?: unknown } | null | undefined): number {
  if (!u) return 0;
  return sayiOku(u.miktar_mts || u.quantity || 0);
}
