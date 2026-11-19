/**
 * CUVAL GORSELINDEN URETIM / SKT OKUMA (18.11.2026). Kullanici: "Uretim ve tuketim tarihini gorselden okuyamaz miyiz? Ucretsiz
 * olacak sekilde." -> Tarayicida Tesseract (acik kaynak OCR, ucretsiz, sunucuya / yapay zeka servisine gitmez). Ilk kullanimda
 * OCR motoru ve Ingilizce dil verisi (jsdelivr) indirilir, sonra tarayici onbellegindedir.
 * Gecisler: 1) gorsel (gri, en fazla 2000 px)  2) 3 kat buyutulmus (kucuk yazi)  3) ters renk (koyu zemin uzerine acik yazi).
 * Iki tarih de bulununca durur. Tarih ayiklama (anahtar kelime + tutarlilik): _shared/siparis-formu.ts cuvalTarihleriniAyikla.
 * 19.11.2026: okunan ham metin de dondurulur (cuvaldaki lot: cuvalLotunuAyikla).
 */
import { cuvalTarihleriniAyikla, type CuvalTarihleri } from "@/supabase/functions/_shared/siparis-formu";

export type CuvalOcrSonucu = { tarihler: CuvalTarihleri; gecis: number; metin: string };

async function hazirla(kaynak: Blob, olcek: number, azami: number, ters: boolean): Promise<Blob> {
  const bmp = await createImageBitmap(kaynak);
  const oran = Math.min(olcek, azami / Math.max(bmp.width, bmp.height));
  const en = Math.max(1, Math.round(bmp.width * oran));
  const boy = Math.max(1, Math.round(bmp.height * oran));
  const tuval = document.createElement("canvas");
  tuval.width = en;
  tuval.height = boy;
  const c = tuval.getContext("2d", { willReadFrequently: true });
  if (!c) throw new Error("Görsel işlenemedi.");
  c.fillStyle = "#FFFFFF";
  c.fillRect(0, 0, en, boy);
  c.imageSmoothingQuality = "high";
  c.drawImage(bmp, 0, 0, en, boy);
  bmp.close?.();
  const v = c.getImageData(0, 0, en, boy);
  const p = v.data;
  for (let i = 0; i < p.length; i += 4) {
    const g = Math.round(p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114);
    const x = ters ? 255 - g : g;
    p[i] = x; p[i + 1] = x; p[i + 2] = x;
  }
  c.putImageData(v, 0, 0);
  return await new Promise<Blob>((ok, hata) => tuval.toBlob((b) => (b ? ok(b) : hata(new Error("Görsel işlenemedi."))), "image/png"));
}

export async function cuvalTarihleriniOku(kaynak: Blob, ilerleme?: (mesaj: string) => void): Promise<CuvalOcrSonucu> {
  // Tarayici paketi (dist): sunucu derlemesine Node isci kodu girmez
  const { createWorker } = (await import(/* webpackChunkName: "tesseract" */ "tesseract.js/dist/tesseract.esm.min.js")).default;
  ilerleme?.("OCR hazırlanıyor…");
  const isci = await createWorker("eng");
  try {
    const gecisler: { olcek: number; azami: number; ters: boolean; ad: string }[] = [
      { olcek: 1, azami: 2000, ters: false, ad: "Görsel okunuyor…" },
      { olcek: 3, azami: 4200, ters: false, ad: "Küçük yazı için büyütülüyor…" },
      { olcek: 3, azami: 4200, ters: true, ad: "Koyu zemin için ters çevriliyor…" },
    ];
    let sonuc: CuvalTarihleri = { uretim: null, skt: null };
    const metinler: string[] = [];
    for (let i = 0; i < gecisler.length; i++) {
      const g = gecisler[i];
      ilerleme?.(g.ad);
      const { data } = await isci.recognize(await hazirla(kaynak, g.olcek, g.azami, g.ters));
      metinler.push(data.text || "");
      const t = cuvalTarihleriniAyikla(data.text || "");
      // Bir geciste ikisi birden bulunduysa o gecis esas (ayni satir grubundan, tutarli); degilse eksik olani tamamla
      if (t.uretim && t.skt) return { tarihler: t, gecis: i + 1, metin: metinler.join("\n") };
      sonuc = { uretim: sonuc.uretim || t.uretim, skt: sonuc.skt || t.skt };
    }
    // Farkli gecislerden birlesen sonuc yine tutarlilik kontrolunden gecer
    if (sonuc.uretim && sonuc.skt) {
      const k = cuvalTarihleriniAyikla(`PRODUCTION DATE: ${sonuc.uretim.metin}\nEXPIRY DATE: ${sonuc.skt.metin}`);
      return { tarihler: k, gecis: gecisler.length, metin: metinler.join("\n") };
    }
    return { tarihler: sonuc, gecis: gecisler.length, metin: metinler.join("\n") };
  } finally {
    await isci.terminate();
  }
}
