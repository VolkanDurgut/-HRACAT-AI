/**
 * DOVIZ KURU (24.11.2026) - navlun karsilastirmasinda USD disi tutarlari (EUR teklif, TL konsimento ucreti) USD'ye cevirmek icin.
 * Kaynak: TCMB gunluk kurlar (today.xml), doviz satis. Yalniz SIRALAMA icindir; cevrilen toplam ekranda "≈" ile isaretlenir.
 * Okunamazsa navlun-kalem.ts VARSAYILAN_KUR kullanilir (tarih: "varsayılan").
 */
import { VARSAYILAN_KUR, type Kur } from "./navlun-kalem.ts";

/** TCMB today.xml -> { EUR: EUR/USD, TRY: TRY/USD } (saf) */
export function tcmbKurOku(xml: string): Kur | null {
  const satis = (kod: string): number | null => {
    const m = xml.match(new RegExp(`<Currency[^>]*CurrencyCode="${kod}"[^>]*>[\\s\\S]*?<ForexSelling>([\\d.]+)</ForexSelling>`));
    const v = m ? Number(m[1]) : NaN;
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const usd = satis("USD"), eur = satis("EUR");
  if (!usd || !eur) return null;
  const tarih = (xml.match(/Tarih="([\d.]+)"/) || [])[1] || "TCMB";
  const eurUsd = Math.round((eur / usd) * 10000) / 10000;
  if (!(eurUsd > 0.7 && eurUsd < 2)) return null;
  return { EUR: eurUsd, TRY: Math.round((1 / usd) * 1e6) / 1e6, tarih: `TCMB ${tarih}` };
}

export async function guncelKur(): Promise<Kur> {
  try {
    const ac = new AbortController();
    const zaman = setTimeout(() => ac.abort(), 5000);
    const res = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml", { signal: ac.signal });
    clearTimeout(zaman);
    if (res.ok) { const k = tcmbKurOku(await res.text()); if (k) return k; }
  } catch (e) { console.error("doviz-kur: TCMB okunamadi", e instanceof Error ? e.message : e); }
  return VARSAYILAN_KUR;
}
