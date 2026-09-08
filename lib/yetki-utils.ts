/**
 * Kullanicinin sayfa_yetkileri'ne gore erisebilecegi ILK sayfayi dondurur.
 * Yetkisiz bir sayfaya erisim denemesinde buraya yonlendirilir - boylece
 * ornegin sadece "kantar" yetkisi olan bir kullanici /panel'e girmeye
 * calistiginda, hicbir yetkisi olmayan baska bir sayfaya (ve oradan da
 * baska birine) atlayip SONSUZ DONGUYE girme riski olmadan doğrudan
 * kendi gercek anasayfasina (/kantar) yonlendirilir.
 *
 * Hicbir sayfaya yetkisi yoksa null doner - bu durumda cagiran kod
 * yetki-gerektirmeyen notr bir sayfaya (ör. "/") yonlendirmelidir.
 */
export function ilkErisilebilirSayfa(sayfaYetkileri: Record<string, boolean> | undefined | null): string | null {
  if (!sayfaYetkileri) return null;
  const oncelikSirasi: { key: string; yol: string }[] = [
    { key: "dashboard", yol: "/dashboard" },
    { key: "panel", yol: "/panel" },
    { key: "kantar", yol: "/kantar" },
    { key: "ihracatlar", yol: "/ihracatlar" },
    { key: "analiz", yol: "/analiz" },
    { key: "yeni_dosya", yol: "/yeni-dosya" },
    { key: "etd_eta", yol: "/etd-eta" },
  ];
  for (const { key, yol } of oncelikSirasi) {
    if (sayfaYetkileri[key]) return yol;
  }
  return null;
}