/**
 * KANTAR PANELI · IHRACAT SUTUNU SEKMELERI (16.11.2026). Kontrol Merkezi / Pazar / Ana Panel / Siparis Listesi duzeni:
 * sabit ust (sayaclar + eksik dolum seridi) + iki sekme (?sekme=aktif|tamamlanan) + ?dosya= suzme.
 *  - Aktif dolumlar (varsayilan): dolumu bitmemis sevkiyat kartlari (+ istege bagli tamamlananlar) ve DBA bekleyen tablo.
 *  - DBA tamamlanan: tamamlanan konteyner tablosu (gun filtresi + arama).
 * Kantar terminalinde musteri adi YOK (yalniz kod); baglantilar yalniz ilgili sayfa yetkisi olana.
 * Saf fonksiyonlar - tests/kantar-gorunum.test.ts.
 */
import type { SevkiyatOzeti } from "@/lib/kantar-sevkiyat";

export type KantarSekme = "aktif" | "tamamlanan";
export const VARSAYILAN_KANTAR_SEKMESI: KantarSekme = "aktif";

export function kantarSekmesi(v: string | null | undefined): KantarSekme | null {
  const x = (v || "").trim().toLowerCase();
  return x === "aktif" || x === "tamamlanan" ? x : null;
}

/** Dolumu bitmemis (rezervasyonu olan) sevkiyatlar: uyari seridi. Rezervasyonu olmayan (toplam 0) seritte yer almaz. */
export type EksikDolum = { dosya_id: string; dosya_no: string; dolu: number; toplam: number; bekleyen: number };
export function eksikDolumlar(s: Pick<SevkiyatOzeti, "dosya_id" | "dosya_no" | "dolu" | "toplam" | "durum">[]): EksikDolum[] {
  return s
    .filter((x) => x.toplam > 0 && x.durum !== "tamamlandi")
    .map((x) => ({ dosya_id: x.dosya_id, dosya_no: x.dosya_no, dolu: x.dolu, toplam: x.toplam, bekleyen: Math.max(0, x.toplam - x.dolu) }));
}

/** Aktif sekmede gorunen kartlar: tamamlanmamislar; anahtar aciksa hepsi. Arama varsa tamamlananlar da (aranan bulunsun). */
export function gorunenSevkiyatlar<T extends Pick<SevkiyatOzeti, "durum">>(s: T[], tamamlananlariGoster: boolean, aramaVar: boolean): T[] {
  return tamamlananlariGoster || aramaVar ? s : s.filter((x) => x.durum !== "tamamlandi");
}

/** Ana Panel'de satir vurgusu (Ana Panel yetkisi gerekir; kantar operatorunde yok). */
export function panelDosyaYolu(dosyaNo: string | null | undefined): string | null {
  const no = (dosyaNo || "").trim();
  return no ? `/panel?dosya=${encodeURIComponent(no)}` : null;
}

/** Ana Panel -> Kantar Paneli: dosyanin konteynerleri suzulmus acilir (Kantar yetkisi gerekir). */
export function kantarDosyaYolu(dosyaNo: string | null | undefined): string | null {
  const no = (dosyaNo || "").trim();
  return no ? `/kantar?dosya=${encodeURIComponent(no)}` : null;
}
