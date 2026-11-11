/**
 * Konteyner icerigi (11.11.2026). Bir konteynerde birden fazla urun / cuval olabilir
 * (ornek: 600 cuval A urunu + 400 cuval B urunu ayni konteynerde). konteynerler.kalemler (jsonb) bu dokumu tutar:
 *   [{ urun, marka, pieces, net_kg }]
 * Bos / null: eski davranis (urun konteynerin markasindan bulunur; Packing List'te tek satir).
 * Tek kalem: konteynerin urunu acikca secilmis demektir (marka urun adinda gecmese de).
 * SAF: veri yok.
 */
export type KonteynerKalemi = { urun: string; marka: string | null; pieces: number | null; net_kg: number | null };

export const EN_FAZLA_KALEM = 6;

const sayi = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** jsonb -> temiz kalem listesi (urunu bos kalemler atilir). */
export function kalemleriOku(v: unknown): KonteynerKalemi[] {
  if (!Array.isArray(v)) return [];
  const out: KonteynerKalemi[] = [];
  for (const x of v.slice(0, EN_FAZLA_KALEM)) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const urun = typeof r.urun === "string" ? r.urun.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    if (!urun) continue;
    const marka = typeof r.marka === "string" && r.marka.trim() ? r.marka.trim().slice(0, 80) : null;
    out.push({ urun, marka, pieces: sayi(r.pieces), net_kg: sayi(r.net_kg) });
  }
  return out;
}

export type IcerikKontrolu = { pieces: number; netKg: number; piecesFark: number | null; netFark: number | null; tamam: boolean };

/** Kalem toplamlari konteynerin kap adedi / net agirligiyla tutuyor mu (kayit oncesi uyari). */
export function icerikKontrolu(kalemler: KonteynerKalemi[], konteyner: { pieces?: number | null; net_agirlik_kg?: number | null }): IcerikKontrolu {
  const pieces = kalemler.reduce((t, k) => t + (k.pieces || 0), 0);
  const netKg = Math.round(kalemler.reduce((t, k) => t + (k.net_kg || 0), 0) * 100) / 100;
  const piecesFark = konteyner.pieces ? pieces - konteyner.pieces : null;
  const netFark = konteyner.net_agirlik_kg ? Math.round((netKg - Number(konteyner.net_agirlik_kg)) * 100) / 100 : null;
  const tamam = kalemler.length <= 1 || ((piecesFark === null || piecesFark === 0) && (netFark === null || Math.abs(netFark) < 0.5));
  return { pieces, netKg, piecesFark, netFark, tamam };
}

/** Proformadaki urun adlari (tekil, sirali) - kalem urun secenekleri. */
export function urunSecenekleri(urunDetaylari: unknown): string[] {
  const liste = Array.isArray(urunDetaylari) ? urunDetaylari : [];
  const out: string[] = [];
  for (const u of liste) {
    const r = (u || {}) as Record<string, unknown>;
    const ad = String(r.urun_adi || r.description || "").replace(/\s+/g, " ").trim();
    if (ad && !out.includes(ad)) out.push(ad);
  }
  return out;
}
