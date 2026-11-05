/**
 * Giris sonrasi donus (06.11.2026): e-postadaki "İrsaliye İncele" gibi baglantilar oturum yokken
 * giris ekranina duser; giristen sonra kullanici o belgeye geri getirilir. Yalniz /belge/ yollari
 * saklanir (acik yonlendirme yok). sessionStorage: sekme kapaninca silinir.
 */
const ANAHTAR = "ihracatai.girisSonrasi";

export function girisSonrasiKaydet(yol: string) {
  try { if (/^\/belge\/[a-z-]+(\?[A-Za-z0-9=&_-]*)?$/.test(yol)) sessionStorage.setItem(ANAHTAR, yol); } catch { /* yok */ }
}

/** Kayitli donus yolu (silmez: giris ekranindaki iki yonlendirme de ayni hedefi gorsun); yoksa null. */
export function girisSonrasiAl(): string | null {
  try {
    const y = sessionStorage.getItem(ANAHTAR);
    return y && /^\/belge\/[a-z-]+(\?[A-Za-z0-9=&_-]*)?$/.test(y) ? y : null;
  } catch { return null; }
}

/** Belge sayfasi acilinca kayit silinir. */
export function girisSonrasiTemizle() {
  try { sessionStorage.removeItem(ANAHTAR); } catch { /* yok */ }
}
