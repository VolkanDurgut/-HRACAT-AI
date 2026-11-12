/**
 * Rapor alicilari (11.11.2026). Kullanici: "Rapor alicilari ve canli / test secimi Ayarlar'dan yonetilsin."
 * Kaynak: rapor_alicilari tablosu (Ayarlar > Rapor Alicilari; migration 20261111190000). Satir yoksa edge'in eski
 * secret'larina (yedek) duser. Canli ama alicisi bos rapor canli SAYILMAZ (test adresine gider).
 * 11.11.2026 aksam: fatura_onay / fatura_dagitim listeleri (edge fatura-onay); liste basina en fazla 10 adres.
 * 12.11.2026: CC listesi (rapor_alicilari.cc) ve tum mail turleri (VGM, konsimento hatirlatma, DIIB, gunluk ihracat raporu,
 *   pazar gorev, satin alma talebi, musteri durum raporu). Kullanici: "Butun raporlar orada gozuksun; ALICI - CC ayarlanabilsin."
 *   Canli / test anahtari yalniz TEST_MODLU raporlarda anlamlidir; digerlerinde (zaten canli) yalniz alici + CC okunur.
 */
export type RaporTuru =
  | "siparis" | "navlun" | "fatura_onay" | "fatura_dagitim" | "musteri_durum"
  | "gunluk_ihracat" | "diib" | "vgm" | "konsimento_hatirlatma" | "pazar_gorev" | "satin_alma";
/** canli: canli VE en az bir alici. canliIsaret: yalniz anahtar (alicisi raporun kendisinden gelen musteri durum raporu icin). */
export type RaporAyari = { canli: boolean; canliIsaret: boolean; alicilar: string[]; cc: string[]; kaynak: "ayar" | "secret" };

const EPOSTA_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
export const gecerliAdresler = (l: unknown): string[] =>
  Array.from(new Set((Array.isArray(l) ? l : []).map((a) => String(a).trim().toLowerCase()).filter((a) => EPOSTA_RE.test(a)))).slice(0, 10);

export async function raporAyari(
  url: string, basliklar: Record<string, string>, companyId: string, rapor: RaporTuru, yedek: { canli: boolean; alicilar: string[]; cc?: string[] },
): Promise<RaporAyari> {
  const yedekAyar = (): RaporAyari => ({ alicilar: yedek.alicilar, cc: (yedek.cc || []).filter((a) => !yedek.alicilar.includes(a)), canli: yedek.canli && yedek.alicilar.length > 0, canliIsaret: yedek.canli, kaynak: "secret" });
  const res = await fetch(`${url}/rest/v1/rapor_alicilari?select=alicilar,cc,canli&company_id=eq.${companyId}&rapor=eq.${rapor}`, { headers: basliklar });
  if (!res.ok) { await res.body?.cancel(); return yedekAyar(); }
  const satir = ((await res.json()) as { alicilar: unknown; cc: unknown; canli: boolean }[])[0];
  if (!satir) return yedekAyar();
  const alicilar = gecerliAdresler(satir.alicilar);
  const cc = gecerliAdresler(satir.cc).filter((a) => !alicilar.includes(a));
  return { canli: satir.canli === true && alicilar.length > 0, canliIsaret: satir.canli === true, alicilar, cc, kaynak: "ayar" };
}
