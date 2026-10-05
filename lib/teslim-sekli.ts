/**
 * Teslim sekli (Incoterm) yardimcilari (05.10.2026).
 *
 * FOB / FCA / FAS / EXW teslimlerde ana navlunu ALICI oder; bizim navlun
 * tutarimiz olmaz. Bu teslimlerde rezervasyon formunda Navlun ve Lokal
 * Masraf ZORUNLU DEGILDIR (kullanici: IHR-2026-0090, FOB - "navlun tutari
 * yok, rezervasyonu tamamlatmiyor"). Girilirse yine kaydedilir.
 *
 * teslim_sekli serbest metin ("FOB", "FOB AMBARLI", "fob - Mersin" ...);
 * kelime olarak aranir, buyuk/kucuk harf fark etmez.
 */
const NAVLUNU_ALICI_ODER = /\b(FOB|FCA|FAS|EXW)\b/;

export function navlunAliciyaAitMi(teslimSekli: string | null | undefined): boolean {
  if (!teslimSekli) return false;
  return NAVLUNU_ALICI_ODER.test(teslimSekli.toLocaleUpperCase("en-US"));
}
