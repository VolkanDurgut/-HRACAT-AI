/**
 * Rapor alicilari (11.11.2026). Kullanici: "Rapor alicilari ve canli / test secimi Ayarlar'dan yonetilsin."
 * Kaynak: rapor_alicilari tablosu (Ayarlar > Rapor Alicilari; migration 20261111190000). Satir yoksa edge'in eski
 * secret'larina (yedek) duser. Canli ama alicisi bos rapor canli SAYILMAZ (test adresine gider).
 */
export type RaporTuru = "siparis" | "navlun" | "musteri_ozet";
export type RaporAyari = { canli: boolean; alicilar: string[]; kaynak: "ayar" | "secret" };

const EPOSTA_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
export const gecerliAdresler = (l: unknown): string[] =>
  Array.from(new Set((Array.isArray(l) ? l : []).map((a) => String(a).trim().toLowerCase()).filter((a) => EPOSTA_RE.test(a)))).slice(0, 6);

export async function raporAyari(
  url: string, basliklar: Record<string, string>, companyId: string, rapor: RaporTuru, yedek: { canli: boolean; alicilar: string[] },
): Promise<RaporAyari> {
  const res = await fetch(`${url}/rest/v1/rapor_alicilari?select=alicilar,canli&company_id=eq.${companyId}&rapor=eq.${rapor}`, { headers: basliklar });
  if (!res.ok) { await res.body?.cancel(); return { ...yedek, canli: yedek.canli && yedek.alicilar.length > 0, kaynak: "secret" }; }
  const satir = ((await res.json()) as { alicilar: unknown; canli: boolean }[])[0];
  if (!satir) return { ...yedek, canli: yedek.canli && yedek.alicilar.length > 0, kaynak: "secret" };
  const alicilar = gecerliAdresler(satir.alicilar);
  return { canli: satir.canli === true && alicilar.length > 0, alicilar, kaynak: "ayar" };
}
