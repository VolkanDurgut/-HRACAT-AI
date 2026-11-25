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

// ---------------------------------------------------------------------------
// 26.11.2026 YENIDEN TASARIM: tam genislikte UC ANA SEKME (yan yana iki sutun kalkti).
//   ?sekme=gemi|yurtici|ihracat  (eski ?sekme=aktif|tamamlanan -> ihracat + ?ih=)
//   ?gemi=<gemi-slug>  ?yi=satis|alis  ?ih=aktif|tamamlanan  ?dosya=<no> (Ana Panel'den: ihracat + arama)
// ---------------------------------------------------------------------------
export type KantarAnaSekme = "gemi" | "yurtici" | "ihracat";
export type KantarYiSekme = "satis" | "alis";

export function kantarAnaSekmesi(v: string | null | undefined): KantarAnaSekme | null {
  const x = (v || "").trim().toLowerCase();
  if (x === "gemi" || x === "yurtici" || x === "ihracat") return x;
  // Eski adresler (?sekme=aktif|tamamlanan) ihracat sekmesine
  if (x === "aktif" || x === "tamamlanan") return "ihracat";
  return null;
}

export function kantarYiSekmesi(v: string | null | undefined): KantarYiSekme | null {
  const x = (v || "").trim().toLowerCase();
  return x === "satis" || x === "alis" ? x : null;
}

/** Acilista gosterilecek ana sekme: adres (gecerliyse ve sekme varsa) > ?dosya (ihracat) > acik gemi varsa gemi > yurt ici. */
export function baslangicAnaSekmesi(p: { adres: KantarAnaSekme | null; dosyaVar: boolean; gemiVar: boolean }): KantarAnaSekme {
  if (p.dosyaVar) return "ihracat";
  if (p.adres && (p.adres !== "gemi" || p.gemiVar)) return p.adres;
  return p.gemiVar ? "gemi" : "yurtici";
}

/** "MV SEA KURGU" -> "sea-kurgu" (adres icin; MV / M/V on eki atilir, Turkce harf -> ASCII) */
export function gemiSlug(gemiAdi: string): string {
  return gemiAdi
    .replace(/^\s*(M\s*\/\s*V|MV|M\.V\.)\.?\s+/i, "")
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (h) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" } as Record<string, string>)[h])
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Arama: nesnenin metin / sayi alanlarinda (Turkce harf ve bosluk duyarsiz) gecer mi. Bos arama -> true. */
export function aramaUyar(o: Record<string, unknown>, arama: string): boolean {
  const duz = (s: string) => s.toLocaleLowerCase("tr").replace(/[çğıöşü]/g, (h) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" } as Record<string, string>)[h]).replace(/\s+/g, "");
  const q = duz(arama || "");
  if (!q) return true;
  return Object.values(o).some((v) => (typeof v === "string" || typeof v === "number") && duz(String(v)).includes(q));
}
