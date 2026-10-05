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

/**
 * Commercial Invoice "SHIPMENT TERMS" satirinda teslim seklinin YANINA
 * yazilacak liman (05.10.2026). Incoterm kurali: FOB / FCA / FAS / EXW
 * YUKLEME yerine gore yazilir ("FOB AMBARLI PORT"), CIF / CFR vb. VARIS
 * limanina gore ("CIF DJIBOUTI PORT"). Eskiden her zaman varis limani
 * ekleniyordu → FOB dosyada "FOB Mariel Port, Cuba" gibi yanlis bir ifade
 * cikiyordu (IHR-2026-0076; BIRRAKA 5 FCL incelemesi).
 * - FOB grubu, teslim seklinde zaten yer yaziyorsa ("FOB AMBARLI") → ""
 *   (tekrar etmesin), sadece "FOB" ise → yukleme limani (yoksa "").
 * - Diger teslim sekilleri → varis limani (DAVRANIS DEGISMEDI).
 */
export function teslimSekliLimani(
  teslimSekli: string | null | undefined,
  yuklemeLimani: string | null | undefined,
  varisLimani: string | null | undefined
): string {
  if (!navlunAliciyaAitMi(teslimSekli)) return varisLimani || "";
  const sadeceKod = /^\s*(FOB|FCA|FAS|EXW)\s*$/.test(String(teslimSekli).toLocaleUpperCase("en-US"));
  return sadeceKod ? yuklemeLimani || "" : "";
}
