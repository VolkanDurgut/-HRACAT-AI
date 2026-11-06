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

/**
 * SAYFA BEKLEME (06.11.2026). Kullanici: "Unex gecisinden sonra gelen loader animasyonu kaldirilsin."
 * Sayfanin ilk verisi yuklenirken sayfa burada "bekliyorum" der (components/sayfa-yukleniyor.tsx);
 * gecis perdesi, yol degistikten sonra bekleyen kalmayana kadar (en fazla BEKLEME_UST_MS) kalkmaz.
 * Boylece perde kalktiginda sayfa dolu gelir, ayrica bir yukleniyor animasyonu gorunmez.
 */
export const SAYFA_BEKLEME_DEGISTI = "ihracatai:sayfa-bekleme";
let bekleyenSayisi = 0;

/** Bekleme kaydi ekler; donen fonksiyon kaydi birakir (birden fazla cagrilsa da bir kez dusulur). */
export function sayfaBeklemeEkle(): () => void {
  bekleyenSayisi++;
  let birakildi = false;
  return () => {
    if (birakildi) return;
    birakildi = true;
    bekleyenSayisi = Math.max(0, bekleyenSayisi - 1);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(SAYFA_BEKLEME_DEGISTI));
  };
}

/** Ilk verisini bekleyen sayfa / bolum sayisi. */
export function sayfaBekleyenSayisi(): number {
  return bekleyenSayisi;
}
