/**
 * HAT TAKIP Asama 4 (28.11.2026): Sefer Ara ekrani + musteri gorseli icin SAF bicimlendirme.
 * Tarihler LIMANIN YEREL saatiyle gosterilir: Hapag zamani ofsetiyle verir ("2026-12-05T22:00:00+03:00" Istanbul,
 * "2026-12-31T20:00:00Z" Tema) -> yazili tarih / saat aynen kullanilir (saat dilimi cevrilmez).
 * Test: tests/hat-sefer.test.ts.
 */
import type { Sefer } from "@/supabase/functions/_shared/hat-sefer";

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/;
const AY_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const AY_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const GUN_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GUN_TR = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

/** Limanin yerel tarihi: { y, a (0-11), g, saat "HH:MM" | null, haftaGunu (0 Pazar) } */
export function yerelTarih(iso: string | null | undefined) {
  const m = iso ? ISO.exec(iso) : null;
  if (!m) return null;
  const y = Number(m[1]), a = Number(m[2]) - 1, g = Number(m[3]);
  const haftaGunu = new Date(Date.UTC(y, a, g)).getUTCDay();
  return { y, a, g, saat: m[4] ? `${m[4]}:${m[5]}` : null, haftaGunu, gun: `${m[1]}-${m[2]}-${m[3]}` };
}

/** "05 Dec 2026" (EN, musteri) / "05 Ara 2026" (TR, ekran). haftaGunu: "Sat, 05 Dec 2026". */
export function tarihYaz(iso: string | null | undefined, dil: "en" | "tr" = "tr", haftaGunu = false): string {
  const t = yerelTarih(iso);
  if (!t) return "—";
  const ay = (dil === "en" ? AY_EN : AY_TR)[t.a];
  const s = `${String(t.g).padStart(2, "0")} ${ay} ${t.y}`;
  return haftaGunu ? `${(dil === "en" ? GUN_EN : GUN_TR)[t.haftaGunu]}, ${s}` : s;
}

/** "05.12 15:00" kisa (cut-off gibi). */
export function kisaZaman(iso: string | null | undefined): string {
  const t = yerelTarih(iso);
  if (!t) return "—";
  return `${String(t.g).padStart(2, "0")}.${String(t.a + 1).padStart(2, "0")}${t.saat ? ` ${t.saat}` : ""}`;
}

/** Doküman cut-off'u (yoksa konteyner cut-off'u) gecti mi? Gecen sefer musteri gorseline varsayilan olarak girmez. */
export function cutoffGecti(s: Sefer, simdi: number = Date.now()): boolean {
  const z = s.cutoff.dokuman ?? s.cutoff.konteyner ?? s.cutoff.vgm;
  if (!z) return s.kalkis ? Date.parse(s.kalkis) <= simdi : false;
  const t = Date.parse(z);
  return !Number.isNaN(t) && t <= simdi;
}

/** Varsayilan secim: cut-off'u gecmemis ilk N sefer. */
export function varsayilanSecim(liste: Sefer[], adet = 6, simdi: number = Date.now()): string[] {
  return liste.filter((s) => !cutoffGecti(s, simdi)).slice(0, adet).map((s) => s.anahtar);
}

/** Aktarma yazisi: "Direct" / "via Port Said" / "via Tanger Med, Pointe-Noire" (EN) ya da TR. */
export function aktarmaYazisi(s: Sefer, dil: "en" | "tr" = "tr"): string {
  if (!s.aktarmalar.length) return dil === "en" ? "Direct" : "Direkt";
  const adlar = s.aktarmalar.map((a) => basHarf(a.ad) || a.kod || "?");
  return dil === "en" ? `via ${adlar.join(", ")}` : `${adlar.join(", ")} aktarmalı`;
}

/** "PORT SAID" -> "Port Said" (Hapag adlari buyuk harf). */
export function basHarf(ad: string | null | undefined): string {
  if (!ad) return "";
  return ad.toLowerCase().replace(/(^|[\s\-/(])([a-zçğıöşü])/g, (_, a: string, b: string) => a + b.toUpperCase());
}
