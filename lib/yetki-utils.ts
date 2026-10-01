/**
 * Kullanicinin sayfa_yetkileri'ne gore erisebilecegi ILK sayfayi dondurur.
 * Yetkisiz bir sayfaya erisim denemesinde buraya yonlendirilir - boylece
 * ornegin sadece "kantar" yetkisi olan bir kullanici /panel'e girmeye
 * calistiginda, hicbir yetkisi olmayan baska bir sayfaya (ve oradan da
 * baska birine) atlayip SONSUZ DONGUYE girme riski olmadan doğrudan
 * kendi gercek anasayfasina (/kantar) yonlendirilir.
 *
 * Hicbir sayfaya yetkisi yoksa null doner. Bu durumda cagiran kod
 * YONLENDIRME YAPMAMALIDIR (01.10.2026): "/" ana sayfasi girisli kullaniciyi
 * tekrar bir uygulama sayfasina gonderdigi icin sonsuz bir yonlendirme
 * dongusu ve bitmeyen bir yukleniyor ekrani olusuyordu. Bunun yerine
 * components/app-shell.tsx "Erisim yetkiniz yok" ekranini gosterir.
 *
 * ONEMLI: Bu fonksiyon sadece yetkiler veritabanindan YUKLENDIKTEN sonra
 * (useAuth().loading === false) cagrilmali - yuklenirken tum yetkiler
 * gecici olarak kapali gorunur.
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
    { key: "draft_onay", yol: "/draft-onay" },
  ];
  for (const { key, yol } of oncelikSirasi) {
    if (sayfaYetkileri[key]) return yol;
  }
  return null;
}