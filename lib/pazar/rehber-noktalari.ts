// OTOMATIK URETILDI (10.11.2026) - PAZAR Satis Rehberi ekran goruntulerindeki isaret noktalari.
// Kaynak: KURGUSAL mock veriyle Playwright cekimi (gercek musteri verisi YOK); degerler ekranin yuzdesi.
import type { EkranNoktasi } from "@/lib/kilavuz/ekran-noktalari";

export const REHBER_NOKTALARI: Record<string, Record<string, EkranNoktasi>> = {
  "pazar-mail": {
    kart: { x: 23.89, y: 21.51, w: 52.22, h: 16 },
    basla: { x: 44.89, y: 38.96, w: 10.21, h: 7.11 },
    liste: { x: 23.89, y: 47.79, w: 52.22, h: 15.94 },
  },
  "gorev-ust": {
    firma: { x: 25.14, y: 7.33, w: 49.72, h: 21.58 },
    adimlar: { x: 26.6, y: 21.47, w: 46.81, h: 5.11 },
    sahip: { x: 25.14, y: 29.36, w: 49.72, h: 6.44 },
    kime: { x: 25.14, y: 36.25, w: 49.72, h: 16.44 },
  },
  "gorev-cevap": {
    cevap: { x: 25.14, y: 7.33, w: 49.72, h: 15.78 },
    oneri: { x: 26.32, y: 16.78, w: 47.36, h: 4.44 },
  },
  "gorev-mesaj": {
    sablonlar: { x: 48.43, y: 6.81, w: 24.98, h: 5.11 },
    metin: { x: 26.6, y: 14.14, w: 46.81, h: 37.78 },
  },
  "gorev-gonderdim": {
    outlook: { x: 26.6, y: 41.64, w: 11.55, h: 6.22 },
    gonderdim: { x: 26.6, y: 54.14, w: 46.81, h: 8.22 },
  },
  "gorev-whatsapp": {
    numaralar: { x: 37.87, y: 52.97, w: 18.34, h: 6.22 },
    kopyala: { x: 55.93, y: 52.97, w: 11.58, h: 6.22 },
  },
  "gorev-sonuc": {
    sonuclar: { x: 26.6, y: 49.58, w: 46.81, h: 5.33 },
    atla: { x: 26.6, y: 55.36, w: 46.81, h: 22.72 },
    siradaki: { x: 25.14, y: 80.86, w: 49.72, h: 12.67 },
  },
  "pazar-takip": {
    bugun: { x: 17.92, y: 20.28, w: 80.83, h: 42.33 },
    cevaplar: { x: 17.92, y: 63.5, w: 80.83, h: 15.44 },
    surec: { x: 17.92, y: 79.83, w: 80.83, h: 14.22 },
  },
};
