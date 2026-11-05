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

// ---------------------------------------------------------------------------
// FATURA BASINA KAP / NET / BRUT (05.11.2026). Kullanici: "Bu dagilimli fatura icin kap, net ve
// brut bilgilerini de eklemeliyiz." (ornek: 1. fatura 1.582 kap / 79.100 net / 79.258,20 brut;
// 2. fatura 3.418 kap / 170.900 net / 171.241,80 brut.)
// - Kap: her kalemin kg'i / ambalaj kg'i ("50 KG" -> 50). Ambalaj okunamayan kalem varsa kap yazilmaz.
// - Brut: konteynerlerin brut / net ORANI (ornek 250.500 / 250.000 = 1,002 -> cuval basina 50,1 kg);
//   son fatura kalani alir -> faturalarin brut toplami konteyner brut toplamina BIREBIR esit.
//   Konteyner net / brut yoksa brut yazilmaz (tahmin yok).
// ---------------------------------------------------------------------------

export type ParcaAgirligi = { kap: number | null; net: number; brut: number | null };

/** "50 KG", "25kg", "50 KG PP BAGS" -> 50; okunamazsa null. */
export function ambalajKg(ambalaj: string | null | undefined): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*KG/i.exec(String(ambalaj ?? ""));
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parcaAgirliklari(parcalar: Pick<FaturaParcasi, "kg" | "kalemler">[], toplamNetKg: number, toplamBrutKg: number): ParcaAgirligi[] {
  const oran = toplamNetKg > 0 && toplamBrutKg >= toplamNetKg ? toplamBrutKg / toplamNetKg : null;
  const parcaNetToplam = parcalar.reduce((t, p) => t + p.kg, 0);
  // Faturalar konteynerlerin tamamini kapsiyorsa son fatura kalan brutu alir (toplam birebir)
  const tamKapsam = oran !== null && Math.abs(parcaNetToplam - toplamNetKg) < 0.5;
  let kalanBrut = toplamBrutKg;
  return parcalar.map((p, i) => {
    let kap: number | null = 0;
    for (const k of p.kalemler) {
      const a = ambalajKg(k.ambalaj);
      if (a === null || kap === null) { kap = null; continue; }
      kap += k.kg / a;
    }
    if (kap !== null) kap = Math.abs(kap - Math.round(kap)) < 0.001 ? Math.round(kap) : Math.round(kap * 100) / 100;
    let brut: number | null = null;
    if (oran !== null) {
      brut = tamKapsam && i === parcalar.length - 1 ? yuvarla(kalanBrut) : yuvarla(p.kg * oran);
      kalanBrut = yuvarla(kalanBrut - brut);
    }
    return { kap, net: p.kg, brut };
  });
}

/** "Kap 1.582 · Net 79.100 KG · Brüt 79.258,20 KG" (bilinmeyen alan yazilmaz). */
export function parcaAgirlikMetni(a: ParcaAgirligi, ascii = false): string {
  // Kesirli ise iki hane ("79.258,20"), tam sayi ise hanesiz ("1.582")
  const s = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
  return [
    a.kap !== null ? `Kap ${s(a.kap)}` : null,
    `Net ${s(a.net)} KG`,
    a.brut !== null ? `${ascii ? "Brut" : "Brüt"} ${s(a.brut)} KG` : null,
  ].filter(Boolean).join(" · ");
}
