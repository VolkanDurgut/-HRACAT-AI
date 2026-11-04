/**
 * GUMRUK BEYANNAMESI -> beyanname (tescil) numarasi (04.11.2026). YAPAY ZEKA YOK.
 * Kullanici: "Yuklenen beyannameden beyanname numarasi alinabilir."
 * Beyanname PDF'leri gercek metin katmanli; numara bicimi 8 hane gumruk idaresi + "EX" +
 * 8 hane sira (orn. 26343100EX00057957). Metin tarayicida pdf.js (unpdf, irsaliye okuma ile ayni
 * paket) ile cikarilir. Belgede ayni numara birden cok gecebilir; FARKLI iki numara cikarsa
 * belirsiz sayilir (null) - yanlis numara yazmaktansa yazmamak.
 */

/** Metindeki beyanname numarasi (tek ve belirgin degilse null). */
export function beyannameNoBul(metin: string): string | null {
  const bulunan = new Map<string, number>();
  for (const m of Array.from((metin || "").toUpperCase().matchAll(/(?<![0-9])(\d{8})\s?EX\s?(\d{8,9})(?![0-9])/g))) {
    const no = `${m[1]}EX${m[2]}`;
    bulunan.set(no, (bulunan.get(no) || 0) + 1);
  }
  if (bulunan.size === 1) return Array.from(bulunan.keys())[0];
  return null;
}

/** PDF dosyasindan beyanname numarasi; okunamazsa null. Gorsel (jpg/png) beyannamede null. */
export async function beyannameNoOku(veri: ArrayBuffer | Uint8Array): Promise<string | null> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    // Kopya: pdf.js Node Buffer kabul etmez ve verdigi diziyi devralir (cagiranin dizisi bozulmasin)
    const pdf = await getDocumentProxy(new Uint8Array(veri));
    const { text } = await extractText(pdf, { mergePages: true });
    return beyannameNoBul(Array.isArray(text) ? text.join("\n") : text);
  } catch {
    return null;
  }
}
