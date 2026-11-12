/**
 * Giris sonrasi donus (06.11.2026): e-postadaki "İrsaliye İncele" gibi baglantilar oturum yokken
 * giris ekranina duser; giristen sonra kullanici o belgeye geri getirilir. Yalniz /belge/ yollari
 * saklanir (acik yonlendirme yok). 11.11.2026: fatura talimati onay maili (/fatura-onay?id=...) da. 12.11.2026: navlun raporundaki
 * "Diger navlun fiyatlari" / liman baglantisi (/navlun?liman=...). sessionStorage: sekme kapaninca silinir.
 */
const ANAHTAR = "ihracatai.girisSonrasi";
const IZINLI = /^\/(?:belge\/[a-z-]+|fatura-onay|navlun)(\?[A-Za-z0-9=&_%.+-]*)?$/;

export function girisSonrasiKaydet(yol: string) {
  try { if (IZINLI.test(yol)) sessionStorage.setItem(ANAHTAR, yol); } catch { /* yok */ }
}

/** Kayitli donus yolu (silmez: giris ekranindaki iki yonlendirme de ayni hedefi gorsun); yoksa null. */
export function girisSonrasiAl(): string | null {
  try {
    const y = sessionStorage.getItem(ANAHTAR);
    return y && IZINLI.test(y) ? y : null;
  } catch { return null; }
}

/** Belge sayfasi acilinca kayit silinir. */
export function girisSonrasiTemizle() {
  try { sessionStorage.removeItem(ANAHTAR); } catch { /* yok */ }
}
