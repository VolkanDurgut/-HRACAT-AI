/**
 * HAT TAKIP Asama 4 (28.11.2026): bir ekran ogesini PNG'ye cevirip panoya kopyalama / indirme ("ekran goruntusu almis gibi").
 * html2canvas projede zaten var (lib/html-to-pdf.ts). Yalniz tarayicida calisir; dinamik import (sunucu paketine girmez).
 * Panoya resim yazma Chrome / Edge / Safari'de desteklenir; desteklenmezse ya da izin verilmezse PNG indirilir.
 */

/** Ogeyi 2x cozunurlukte PNG'ye cevirir (beyaz zemin). */
export async function ogeyiPngYap(oge: HTMLElement): Promise<Blob> {
  const html2canvas = (await import("html2canvas")).default;
  const tuval = await html2canvas(oge, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
  return await new Promise<Blob>((coz, red) => tuval.toBlob((b) => (b ? coz(b) : red(new Error("Görsel oluşturulamadı."))), "image/png"));
}

export function pngIndir(blob: Blob, dosyaAdi: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dosyaAdi.endsWith(".png") ? dosyaAdi : `${dosyaAdi}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Panoya kopyalar; olmazsa indirir. Donus: "kopyalandi" | "indirildi".
 * ClipboardItem'a Promise verilir (Safari kullanici hareketi icinde ister; Chrome da kabul eder).
 */
export async function pngKopyalaYaDaIndir(oge: HTMLElement, dosyaAdi: string): Promise<"kopyalandi" | "indirildi"> {
  const uretim = ogeyiPngYap(oge);
  const pano = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  const Oge = typeof window !== "undefined" ? (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem : undefined;
  if (pano?.write && Oge) {
    try {
      await pano.write([new Oge({ "image/png": uretim })]);
      return "kopyalandi";
    } catch {
      /* izin yok / desteklenmiyor -> indir */
    }
  }
  pngIndir(await uretim, dosyaAdi);
  return "indirildi";
}

/** Dosya adi: sefer-programi_TRIST-GHTEM_2026-11-28.png */
export function gorselDosyaAdi(pol: string, pod: string, gun: string): string {
  const temiz = (s: string) => s.replace(/[^A-Za-z0-9-]/g, "");
  return `sefer-programi_${temiz(pol)}-${temiz(pod)}_${temiz(gun)}.png`;
}
