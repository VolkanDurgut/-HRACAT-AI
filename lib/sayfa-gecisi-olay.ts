/**
 * Sayfa gecisi olaylari (06.11.2026). components/sayfa-gecisi.tsx yayinlar; sayfa basligindaki yazi
 * animasyonu (YaziAnimasyonu gecisiBekle) dinler: perde arkasinda yazmasin, perde kalkinca yazsin.
 * Ayri dosya: yazi-animasyonu <-> sayfa-gecisi dongusel import olmasin.
 */
export const SAYFA_GECISI_BITTI = "ihracatai:sayfa-gecisi-bitti";
/** Gecis surerken <html data-sg-faz="cikis|giris"> */
export const SG_FAZ_OZNITELIGI = "sgFaz";

/** Gecis perdesi su an ekranda mi (cikis ya da giris fazi). */
export function sayfaGecisiSuruyor(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.documentElement.dataset[SG_FAZ_OZNITELIGI];
}
