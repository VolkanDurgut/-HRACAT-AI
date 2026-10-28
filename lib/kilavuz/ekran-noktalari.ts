// OTOMATIK URETILDI (28.10.2026) - kilavuz ekran goruntulerindeki isaret noktalari.
// Kaynak: KURGUSAL demo verisiyle Playwright cekimi (gercek musteri verisi YOK).
// Degerler ekranin yuzdesi: x, y, w (genislik), h (yukseklik).
export type EkranNoktasi = { x: number; y: number; w: number; h: number };
export const EKRAN_NOKTALARI: Record<string, Record<string, EkranNoktasi>> = {
  "panel": {
    menu: { x: 0.9, y: 9.11, w: 15.42, h: 73.67 },
    kartlar: { x: 18.33, y: 10.33, w: 80, h: 13.39 },
    filtre: { x: 69.44, y: 2.67, w: 28.89, h: 3.33 },
    satir: { x: 18.4, y: 30.44, w: 79.86, h: 8.17 },
    rapor: { x: 49.58, y: 16.67, w: 7.01, h: 3.11 },
    sorun: { x: 87.78, y: 91.78, w: 10.83, h: 6 },
  },
  "proforma-olustur": {
    musteri: { x: 18.33, y: 10.56, w: 46.67, h: 55.89 },
    urunler: { x: 18.33, y: 68.22, w: 46.67, h: 31.78 },
    onizleme: { x: 66.39, y: 10.56, w: 31.94, h: 81.22 },
    // odeme: ELLE (28.10.2026) - onizlemedeki PDF'in PACKAGING / SHIPMENT / PAYMENT TERMS satirlari
    odeme: { x: 67.4, y: 43.7, w: 24, h: 8.6 },
  },
  "proforma-yukle": {
    asistan: { x: 18.33, y: 10.78, w: 62.22, h: 57.61 },
    birak: { x: 18.33, y: 10.78, w: 62.22, h: 57.61 },
    oku: { x: 20.35, y: 57.33, w: 58.19, h: 4.89 },
  },
  "dosya-proforma": {
    baslik: { x: 20.56, y: 2.67, w: 24.79, h: 5.44 },
    sekmeler: { x: 18.33, y: 10.78, w: 10.21, h: 4.56 },
    taraflar: { x: 18.33, y: 18.11, w: 25.93, h: 40.44 },
    urunler: { x: 18.33, y: 60.33, w: 25.93, h: 30.89 },
    banka: { x: 45.37, y: 18.11, w: 25.93, h: 80.33 },
    kapat: { x: 89.31, y: 2.67, w: 9.03, h: 4 },
  },
  "dosya-rezervasyon": {
    kart: { x: 18.33, y: 18.11, w: 71.11, h: 31.61 },
    cutoff: { x: 43.24, y: 29.11, w: 21.37, h: 19.17 },
    yeni: { x: 18.33, y: 52.39, w: 14.38, h: 4.44 },
  },
  "dosya-konteyner": {
    ust: { x: 18.4, y: 21, w: 79.86, h: 6.11 },
    tablo: { x: 18.4, y: 27.11, w: 80.88, h: 72.89 },
    dba: { x: 83.93, y: 31.5, w: 5.69, h: 9.44 },
    butonlar: { x: 74.38, y: 7.56, w: 23.96, h: 3.33 },
  },
  "dosya-evrak": {
    fatura: { x: 19.51, y: 29, w: 37.08, h: 34.88 },
    konsimento: { x: 19.51, y: 80.99, w: 37.08, h: 19.01 },
    evraklar: { x: 58.89, y: 18.11, w: 39.44, h: 61.81 },
    uyari: { x: 77.22, y: 28.44, w: 16.39, h: 3.24 },
  },
  "dosya-evrak-2": {
    draftbl: { x: 18.33, y: 5.86, w: 39.44, h: 47.65 },
    beyanname: { x: 18.33, y: 55.29, w: 39.44, h: 44.71 },
  },
  "kantar": {
    sekme: { x: 10, y: 9, w: 39.72, h: 6.06 },
    ara: { x: 10, y: 24, w: 79.72, h: 4.67 },
    sayac: { x: 10, y: 30.44, w: 79.72, h: 9.56 },
    sevkiyat: { x: 10, y: 46.06, w: 39.44, h: 17.69 },
    kod: { x: 18.24, y: 47.94, w: 2.33, h: 2.33 },
  },
  "kantar-dba": {
    satir: { x: 10.07, y: 31.53, w: 79.58, h: 6 },
    musteri: { x: 52.29, y: 31.53, w: 9.5, h: 6 },
    yukle: { x: 82.99, y: 31.53, w: 6.67, h: 6 },
  },
  "etd-eta": {
    sayac: { x: 18.33, y: 10.33, w: 26.11, h: 9.56 },
    ara: { x: 18.33, y: 22.11, w: 63.13, h: 4.22 },
    tablo: { x: 18.4, y: 28.22, w: 79.86, h: 71.78 },
  },
  "draft-onay": {
    sekmeler: { x: 18.33, y: 14.33, w: 25.63, h: 5.11 },
    evraklar: { x: 40.45, y: 25.28, w: 13.79, h: 7.39 },
    durum: { x: 61.21, y: 25.28, w: 13.06, h: 7.39 },
    aksiyon: { x: 74.27, y: 25.28, w: 23.99, h: 7.39 },
  },
  "ihracatlar": {
    siparis: { x: 20, y: 10.78, w: 13.17, h: 2.22 },
    devam: { x: 86.32, y: 16.33, w: 10.83, h: 3.56 },
    arsiv: { x: 18.33, y: 50.78, w: 80, h: 4.67 },
  },
  "kontrol-merkezi": {
    filtre: { x: 74.17, y: 2.67, w: 24.17, h: 3.33 },
    kpi: { x: 18.33, y: 10.33, w: 80, h: 19.11 },
    grafik: { x: 18.33, y: 31.22, w: 52.96, h: 37.28 },
    ozet: { x: 72.41, y: 31.22, w: 25.93, h: 37.28 },
    harita: { x: 18.33, y: 70.28, w: 52.96, h: 29.72 },
  },
  "ic-piyasa": {
    sekmeler: { x: 18.33, y: 10.33, w: 33.13, h: 4.67 },
    sayaclar: { x: 18.33, y: 17.22, w: 80, h: 10.94 },
    emir: { x: 18.4, y: 41, w: 79.86, h: 7.22 },
    yeni: { x: 85.14, y: 2.78, w: 13.19, h: 4 },
  },
  "satin-alma": {
    sekmeler: { x: 18.33, y: 10.33, w: 45.42, h: 4.67 },
    liste: { x: 18.33, y: 17.22, w: 80, h: 49.33 },
    karar: { x: 85.97, y: 30.02, w: 10.9, h: 3.33 },
    not: { x: 18.33, y: 17.22, w: 80, h: 82.78 },
  },
};
