/**
 * Iki DIIB'e bolunen yukleme -> fatura talimatindaki fatura parcalari (04.11.2026). Saf modul.
 * Kullanici: DIIB'in kalani yetmeyince "tam bir sekilde kapatabilmek icin 2 ayri fatura
 * olusturuluyor" (orn. CRISA 250.000 kg = 79.100 kg 04219 + 170.900 kg 02576).
 *
 * Kalemler faturalara SIRAYLA dagitilir (1. fatura once 1. kalemden dolar; bir kalem iki faturaya
 * bolunebilir). Birim fiyatlar degismez. Tutarlar kurusa yuvarlanir; bir kalemin son parcasi kalem
 * toplamindan kalani alir, boylece faturalarin toplami proforma toplamina BIREBIR esit olur.
 * FOB: her faturanin CIF payi oraninda (fatura talimatindaki oransal FOB ile ayni); son fatura kalani alir.
 */
import { kalemMiktari, sayiOku } from "@/lib/sayi-oku";

export type TalimatParcaGirdisi = { sira: number; belgeNo: string; belgeTarihi: string | null; kg: number; faturaNo: string | null };
export type FaturaKalemi = { ad: string; ambalaj: string | null; kg: number; birimKg: number; tutar: number };
export type FaturaParcasi = TalimatParcaGirdisi & { kalemler: FaturaKalemi[]; tutar: number; fobTutar: number | null };

const yuvarla = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Bolunme parcalarinin toplami urun kalemlerinin toplamindan farkli mi (0,5 kg tolerans)? */
export function bolunmeUyumsuz(urunKg: number, parcalar: { kg: number }[]): boolean {
  if (parcalar.length < 2) return false;
  return Math.abs(parcalar.reduce((t, p) => t + p.kg, 0) - urunKg) > 0.5;
}
/** Urun kalemlerinin toplam kg'i (talimat uyarisi icin). */
export function urunToplamKg(urunler: unknown): number {
  return Math.round((Array.isArray(urunler) ? urunler : []).reduce((t: number, u) => t + kalemMiktari(u as { miktar_mts?: unknown; quantity?: unknown }) * 1000, 0) * 100) / 100;
}

export function faturaBolunmesi(urunler: unknown, parcalar: TalimatParcaGirdisi[], toplamFob: number | null): FaturaParcasi[] {
  const sirali = [...parcalar].sort((a, b) => a.sira - b.sira);
  if (sirali.length < 2) return [];
  const kalemler = (Array.isArray(urunler) ? urunler : []).map((u) => {
    const r = u as Record<string, unknown>;
    const kg = Math.round(kalemMiktari(r as { miktar_mts?: unknown; quantity?: unknown }) * 1000 * 100) / 100;
    const birimMt = sayiOku(r.birim_fiyat_usd ?? r.unit_price);
    const toplam = sayiOku(r.toplam_tutar_usd ?? r.total_amount) || yuvarla(kg / 1000 * birimMt);
    return { ad: String(r.urun_adi ?? r.description ?? "Urun"), ambalaj: (r.ambalaj_boyutu ?? r.packaging_size ?? null) as string | null, kg, birimKg: birimMt / 1000, toplam, kalanKg: kg, kalanTutar: toplam };
  }).filter((k) => k.kg > 0);
  // Bolunme toplami urun miktarina esit degilse (orn. kismi yukleme: proforma 375 MT, yuklenen 250.000 kg)
  // YANLIS fatura yazmamak icin bolunme uygulanmaz; arayuz uyarir (bolunmeUyumsuz).
  if (bolunmeUyumsuz(kalemler.reduce((t, k) => t + k.kg, 0), sirali)) return [];

  const sonuc: FaturaParcasi[] = sirali.map((p) => ({ ...p, kalemler: [], tutar: 0, fobTutar: null }));
  let ki = 0;
  sonuc.forEach((p, pi) => {
    let ihtiyac = p.kg;
    const sonParca = pi === sonuc.length - 1;
    while (ki < kalemler.length && (ihtiyac > 0.004 || sonParca)) {
      const k = kalemler[ki];
      const al = sonParca ? k.kalanKg : Math.min(k.kalanKg, ihtiyac);
      const kalemBitti = Math.abs(k.kalanKg - al) < 0.005;
      const tutar = kalemBitti ? yuvarla(k.kalanTutar) : yuvarla(al * k.birimKg);
      if (al > 0) p.kalemler.push({ ad: k.ad, ambalaj: k.ambalaj, kg: Math.round(al * 100) / 100, birimKg: k.birimKg, tutar });
      k.kalanKg = Math.round((k.kalanKg - al) * 100) / 100;
      k.kalanTutar = yuvarla(k.kalanTutar - tutar);
      ihtiyac = Math.round((ihtiyac - al) * 100) / 100;
      if (kalemBitti) ki++;
      else if (!sonParca) break;
    }
    p.tutar = yuvarla(p.kalemler.reduce((t, k) => t + k.tutar, 0));
  });
  if (toplamFob !== null) {
    const toplamCif = sonuc.reduce((t, p) => t + p.tutar, 0);
    let kalan = yuvarla(toplamFob);
    sonuc.forEach((p, i) => {
      p.fobTutar = i === sonuc.length - 1 ? yuvarla(kalan) : (toplamCif > 0 ? yuvarla(toplamFob * p.tutar / toplamCif) : 0);
      kalan = yuvarla(kalan - p.fobTutar);
    });
  }
  return sonuc;
}
