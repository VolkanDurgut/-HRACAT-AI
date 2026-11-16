/**
 * ORTAK TURKCE ARAMA (16.11.2026, ERP ortak kit). Sayfalarda ayri ayri yazilmis uc kural tek yerde; davranis AYNEN korunur:
 *  - trBuyuk: buyuk harf (tr) + "İ" -> "I"   (Siparis Listesi, Navlun haritasi). "i", "ı", "I", "İ" -> "I".
 *  - trKucuk: kucuk harf (tr) + "ı" -> "i"   (Pazar). "i", "ı", "I", "İ" -> "i".
 * Ikisi de i / ı farkini yok sayar; c / ş / ğ / ö / ü ayri harf kalir. Test: tests/erp-kit.test.ts.
 */
export const trBuyuk = (s: string) => s.toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
export const trKucuk = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/ı/g, "i");

/** Metin aranani iceriyor mu (Turkce harf duyarsiz; bos arama her seyi kapsar). */
export function trIcerir(metin: string | null | undefined, aranan: string): boolean {
  const q = trBuyuk(aranan.trim());
  return !q || (!!metin && trBuyuk(metin).includes(q));
}
