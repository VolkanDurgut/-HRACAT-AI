/**
 * lib/urun-konteyner-dagilimi.ts
 *
 * "Hangi urunden kac konteyner yuklendi?" (muhasebe talebi, 14.10.2026,
 * IHR-2026-0094: 2 konteyner ALL PURPOSE BOUHO @465 + 2 konteyner PREMIUM
 * Ble d'Or @490). Fatura Talimati PDF'i ve mail metni AYNI fonksiyonu kullanir.
 *
 * Eslestirme kurali Packing List ile ayni: konteynerin MARKASI, urun adinin
 * icinde geciyorsa ("PREMIUM QUALITY WHEAT FLOUR (Ble d'Or BRAND)") konteyner
 * o urune aittir (buyuk/kucuk harf ve ' / ’ farki yok sayilir).
 *
 *  - Marka tek bir urun satirini gosteriyorsa: kesin sayi.
 *  - Ayni marka birden fazla satirda geciyorsa (0092: 5 SAAD @460 + 5 SAAD
 *    @483, fark sadece proforma/fiyat): o markanin konteynerleri satirlarin
 *    MIKTARINA (MTS) gore paylastirilir -> "tahmini" isaretlenir.
 *  - Tek urunlu dosyada tum konteynerler o urundur.
 *  - Hicbir konteynerde eslesen marka yoksa (marka girilmemis): miktara gore
 *    paylastirilir, "tahmini".
 *  - Bazilari eslesip bazilari eslesmiyorsa eslesmeyenler AYRICA bildirilir
 *    (sessizce bir urune yazilmaz).
 * Sistemdeki hicbir veriyi DEGISTIRMEZ (saf fonksiyon).
 */
import { kalemMiktari } from "@/lib/sayi-oku";

export type UrunKonteynerSatiri = {
  /** Kac konteyner (yuklenmis / eklenmis konteynerlerden). */
  konteyner: number;
  /** true = marka ile kesin degil, miktara gore paylastirildi. */
  tahmini: boolean;
  /** Bu satira atanan konteynerlerin net agirlik toplami (kesin eslesmede). */
  netKg: number | null;
};

export type UrunKonteynerDagilimi = {
  satirlar: UrunKonteynerSatiri[];
  /** Hicbir urune baglanamayan konteyner sayisi (uyari icin). */
  eslesmeyen: number;
  toplamKonteyner: number;
};

type UrunLike = { urun_adi?: string | null; description?: string | null; miktar_mts?: unknown; quantity?: unknown };
type KonteynerLike = { marka?: string | null; net_agirlik_kg?: number | null };

function normal(s: unknown): string {
  return String(s ?? "")
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** n adedi agirliklara gore tam sayilara boler (en buyuk kalan yontemi). */
function oransalBol(n: number, agirliklar: number[]): number[] {
  const toplam = agirliklar.reduce((s, a) => s + (a > 0 ? a : 0), 0);
  if (n <= 0 || agirliklar.length === 0) return agirliklar.map(() => 0);
  const w = toplam > 0 ? agirliklar.map((a) => (a > 0 ? a : 0)) : agirliklar.map(() => 1);
  const t = w.reduce((s, a) => s + a, 0);
  const ham = w.map((a) => (n * a) / t);
  const tam = ham.map((h) => Math.floor(h));
  let kalan = n - tam.reduce((s, a) => s + a, 0);
  const sira = ham.map((h, i) => ({ i, k: h - Math.floor(h) })).sort((a, b) => b.k - a.k || a.i - b.i);
  for (const { i } of sira) {
    if (kalan <= 0) break;
    tam[i] += 1;
    kalan -= 1;
  }
  return tam;
}

export function urunKonteynerDagilimi(urunler: UrunLike[], konteynerler: KonteynerLike[]): UrunKonteynerDagilimi {
  const adlar = urunler.map((u) => normal(u.urun_adi || u.description));
  const miktarlar = urunler.map((u) => kalemMiktari(u));
  const satirlar: UrunKonteynerSatiri[] = urunler.map(() => ({ konteyner: 0, tahmini: false, netKg: 0 }));
  const toplamKonteyner = konteynerler.length;
  if (urunler.length === 0) return { satirlar, eslesmeyen: toplamKonteyner, toplamKonteyner };

  if (urunler.length === 1) {
    satirlar[0] = { konteyner: toplamKonteyner, tahmini: false, netKg: konteynerler.reduce((s, k) => s + (k.net_agirlik_kg || 0), 0) };
    return { satirlar, eslesmeyen: 0, toplamKonteyner };
  }

  // Markaya gore grupla: marka -> bu markayi iceren satirlar
  const markaGruplari = new Map<string, { satirlar: number[]; konteynerler: KonteynerLike[] }>();
  const eslesmeyenler: KonteynerLike[] = [];
  for (const k of konteynerler) {
    const m = normal(k.marka);
    const icerenler = m ? adlar.map((ad, i) => (ad.includes(m) ? i : -1)).filter((i) => i >= 0) : [];
    if (icerenler.length === 0) {
      eslesmeyenler.push(k);
      continue;
    }
    const g = markaGruplari.get(m) || { satirlar: icerenler, konteynerler: [] };
    g.konteynerler.push(k);
    markaGruplari.set(m, g);
  }

  markaGruplari.forEach((g) => {
    if (g.satirlar.length === 1) {
      const i = g.satirlar[0];
      satirlar[i].konteyner += g.konteynerler.length;
      satirlar[i].netKg = (satirlar[i].netKg || 0) + g.konteynerler.reduce((s, k) => s + (k.net_agirlik_kg || 0), 0);
    } else {
      const paylar = oransalBol(g.konteynerler.length, g.satirlar.map((i) => miktarlar[i]));
      g.satirlar.forEach((i, j) => {
        satirlar[i].konteyner += paylar[j];
        satirlar[i].tahmini = true;
        satirlar[i].netKg = null;
      });
    }
  });

  let eslesmeyen = 0;
  if (markaGruplari.size === 0 && eslesmeyenler.length > 0) {
    // Hicbir konteynerde eslesen marka yok: miktara gore paylastir
    const paylar = oransalBol(eslesmeyenler.length, miktarlar);
    paylar.forEach((p, i) => {
      satirlar[i] = { konteyner: p, tahmini: true, netKg: null };
    });
  } else {
    eslesmeyen = eslesmeyenler.length;
  }
  return { satirlar, eslesmeyen, toplamKonteyner };
}

/** "2 konteyner" / "2 konteyner (miktara gore)" - mail ve PDF ortak metni (ASCII). */
export function konteynerAdetYazi(s: UrunKonteynerSatiri): string {
  return `${s.konteyner} konteyner${s.tahmini ? " (miktara gore)" : ""}`;
}
