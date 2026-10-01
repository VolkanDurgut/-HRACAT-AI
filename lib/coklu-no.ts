/**
 * Birden fazla Proforma No / Lot No (talep: 01.10.2026).
 *
 * Bazi sevkiyatlar iki proformayi (ve iki lotu) birlikte tasir. Veritabaninda
 * ayri kolon ACILMADI: ikinci numara mevcut `proforma_no` / `lot_no` metin
 * alanina " / " ayiriciyla yazilir ("UNEXCCS270826 / UNEXBFB090926"). Boylece
 * bu alanlari kullanan HER yer (Fatura Talimati ekran/PDF/mail, CI/PL LOT NO,
 * CoO/Phyto/Health LOT NR, Quality/Fumigation REPORT NR, mail konulari,
 * arama) ek kod gerekmeden ikisini birlikte gosterir. Tek numarali kayitlar
 * hic degismez.
 *
 * Duzenleme arayuzu her numarayi ayri kutuda gosterir (components/coklu-no-girisi.tsx);
 * bu dosya parcala/birlestir islerini TEK yerde toplar.
 */
export const NO_AYIRICI = " / ";
export const AZAMI_NO_SAYISI = 2;

/** "A / B" -> ["A", "B"]; bos/null -> []. Fazladan bosluklar temizlenir. */
export function noParcala(deger: string | null | undefined): string[] {
  if (!deger) return [];
  return deger
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
}

/** ["A", "B", ""] -> "A / B"; hic dolu parca yoksa null (kolon bosaltilir). */
export function noBirlestir(parcalar: string[]): string | null {
  const temiz = parcalar.map((p) => p.trim()).filter(Boolean);
  return temiz.length > 0 ? temiz.join(NO_AYIRICI) : null;
}
