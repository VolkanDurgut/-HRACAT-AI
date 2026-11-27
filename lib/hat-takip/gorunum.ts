/**
 * HAT TAKIP - sayfa gorunum kurallari (27.11.2026, Asama 1). Saf fonksiyonlar; test: tests/hat-takip.test.ts.
 * Olay yorumlama TEK YER: supabase/functions/_shared/hat-takip.ts (edge ile ortak).
 */
import { enIyiOlay, etaFarkiGun, istanbulGunu, type HatOlayi } from "@/supabase/functions/_shared/hat-takip";

export const SINIF_ETIKETI: Record<string, string> = { ACT: "Gerçekleşen", EST: "Tahmini", PLN: "Planlanan" };
export const DURUM_ETIKETI: Record<string, string> = {
  bekliyor: "Sırada", tamam: "Güncel", bulunamadi: "Hapag'da bulunamadı", hata: "Hata",
};

export type FarkSeviyesi = "yok" | "ayni" | "uyari" | "kritik";

/** Sistem ETA'si ile hat ETA'si: 0 gun ayni, 1-2 gun uyari, 3+ gun kritik; biri yoksa "yok". */
export function etaKarsilastir(sistemEta: string | null, hatEta: string | null): { fark: number | null; seviye: FarkSeviyesi } {
  const fark = etaFarkiGun(sistemEta, hatEta);
  if (fark === null) return { fark: null, seviye: "yok" };
  const m = Math.abs(fark);
  return { fark, seviye: m === 0 ? "ayni" : m >= 3 ? "kritik" : "uyari" };
}

/** "+2 gün" / "-1 gün" / "aynı" */
export function farkYazi(fark: number | null): string {
  if (fark === null) return "—";
  if (fark === 0) return "aynı";
  return `${fark > 0 ? "+" : "−"}${Math.abs(fark)} gün`;
}

/** ISO zaman -> Istanbul "GG.AA.YYYY SS:DD" (saat yoksa / gece yarisiysa da yazar). */
export function trZaman(iso: string | null, saatli = true): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t + 3 * 3600_000).toISOString();
  const gun = `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
  return saatli ? `${gun} ${d.slice(11, 16)}` : gun;
}

/** Sistem ETA'si (YYYY-MM-DD) -> "GG.AA.YYYY" */
export function trGun(gun: string | null): string {
  if (!gun || !/^\d{4}-\d{2}-\d{2}/.test(gun)) return "—";
  return `${gun.slice(8, 10)}.${gun.slice(5, 7)}.${gun.slice(0, 4)}`;
}

/** Son guncellemeden bu yana: "12 dk once" / "3 sa once" / "2 gun once" */
export function onceYazi(iso: string | null, simdi: number = Date.now()): string {
  if (!iso) return "henüz sorgulanmadı";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const dk = Math.max(0, Math.round((simdi - t) / 60_000));
  if (dk < 60) return `${dk} dk önce`;
  const sa = Math.round(dk / 60);
  if (sa < 48) return `${sa} sa önce`;
  return `${Math.round(sa / 24)} gün önce`;
}

/** Gemi hareketleri: her liman + kalkis / varis icin en guvenilir olay (aktarma limanlari dahil), zaman sirasinda. */
export function gemiHareketleri(olaylar: HatOlayi[]): HatOlayi[] {
  const gruplar = new Map<string, HatOlayi[]>();
  for (const o of olaylar) {
    if (o.tur !== "TRANSPORT" || (o.kod !== "DEPA" && o.kod !== "ARRI") || !o.zaman) continue;
    const k = `${o.kod}|${o.yer ?? ""}|${o.gemi ?? ""}`;
    gruplar.set(k, [...(gruplar.get(k) ?? []), o]);
  }
  return Array.from(gruplar.values())
    .map((l) => enIyiOlay(l))
    .filter((o): o is HatOlayi => !!o)
    .sort((a, b) => Date.parse(a.zaman as string) - Date.parse(b.zaman as string) || (a.kod === "ARRI" ? -1 : 1));
}

export { istanbulGunu };
