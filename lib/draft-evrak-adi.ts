/** Draft Evrak Seti saf yardimcilari (24.11.2026; testli, bagimliliksiz). Bkz. lib/draft-evrak-seti.ts */

/** lib/taslak-onay-paketi.ts -> guvenliParca ile AYNI (dosya adi paketle birebir olsun) */
function guvenliParca(ham: string | null | undefined, yedek: string): string {
  return (ham || yedek).trim().replace(/\s*\/\s*/g, "-").replace(/[\/\\:*?"<>|]/g, "");
}

export function draftEkAdi(sira: number, kod: string, dosya: { proforma_no: string | null }, rezervasyonlar: { booking_no: string | null }[]): string {
  return `DRAFT- ${sira}- ${kod}- ${guvenliParca(rezervasyonlar[0]?.booking_no, "BOOKING")}- ${guvenliParca(dosya.proforma_no, "PROFORMA")}.pdf`;
}

/** Uint8Array -> base64 (parcali; buyuk dosyada yigin tasmaz) */
export function baytBase64(b: Uint8Array): string {
  let s = "";
  const parca = 0x8000;
  for (let i = 0; i < b.length; i += parca) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + parca)));
  return btoa(s);
}

