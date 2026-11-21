/**
 * SILINEN PROFORMALAR (21.11.2026) - saf yardimcilar (veri / ag yok; tests/proforma-silinen.test.ts).
 *
 * Kullanici: "Siparis listesinde olurda bir musteriden onay gelmezse silinme islemi yapildiginda silinen proformalar
 * musteri bazinda kayit altinda olmali. Ve ilgili revizeyi yapip tekrardan aktif hale getirebilmeli. Bazi musteriler
 * daha sonradan cevap verdikleri olabiliyor."
 *
 * Kaynak: proformalar tablosunun denetim kaydi (silinen satir taslagiyla; proforma_silinenler RPC). Ayni numarayla
 * yeniden olusturulan / geri yuklenen proforma listede yer almaz.
 */
import { trBuyuk } from "@/lib/tr-arama";

export type SilinenProforma = {
  denetim_id: string;
  proforma_no: string;
  alici_unvan: string;
  tarih: string | null;
  para_birimi: string;
  toplam: number | null;
  toplam_mts: number | null;
  silinme: string;
  silen: string | null;
  urunler: string | null;
};

export type SilinenMusteri = {
  anahtar: string;
  unvan: string;
  proformalar: SilinenProforma[];
  /** Para birimi -> toplam tutar */
  toplam: Record<string, number>;
  mts: number;
  sonSilinme: string;
};

/** Musteri anahtari: buyuk harf, noktalama / bosluk farki yok sayilir ("Birraka Impex S.L." = "BIRRAKA IMPEX SL"). */
export const musteriAnahtari = (unvan: string | null | undefined) => trBuyuk((unvan || "").trim()).replace(/[^\p{L}\p{N}]+/gu, "");

export function silinenNormalle(r: Record<string, unknown>): SilinenProforma | null {
  const no = typeof r.proforma_no === "string" ? r.proforma_no : "";
  const id = typeof r.denetim_id === "string" ? r.denetim_id : "";
  if (!no || !id) return null;
  const sayi = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    denetim_id: id, proforma_no: no, alici_unvan: typeof r.alici_unvan === "string" && r.alici_unvan.trim() ? r.alici_unvan : "—",
    tarih: typeof r.tarih === "string" ? r.tarih : null, para_birimi: typeof r.para_birimi === "string" ? r.para_birimi : "USD",
    toplam: sayi(r.toplam), toplam_mts: sayi(r.toplam_mts), silinme: String(r.silinme || ""),
    silen: typeof r.silen === "string" && r.silen ? r.silen : null, urunler: typeof r.urunler === "string" && r.urunler ? r.urunler : null,
  };
}

/** Musteri bazinda gruplar: en son silinen musteri ustte, grup icinde en son silinen ustte. Arama: proforma no / unvan / urun. */
export function silinenleriGrupla(liste: SilinenProforma[], arama = ""): SilinenMusteri[] {
  const q = trBuyuk(arama.trim());
  const harita = new Map<string, SilinenMusteri>();
  for (const p of liste) {
    if (q && !trBuyuk(`${p.proforma_no} ${p.alici_unvan} ${p.urunler || ""}`).includes(q)) continue;
    const k = musteriAnahtari(p.alici_unvan) || p.proforma_no;
    let g = harita.get(k);
    if (!g) { g = { anahtar: k, unvan: p.alici_unvan, proformalar: [], toplam: {}, mts: 0, sonSilinme: p.silinme }; harita.set(k, g); }
    g.proformalar.push(p);
    if (p.toplam !== null) g.toplam[p.para_birimi] = Math.round(((g.toplam[p.para_birimi] || 0) + p.toplam) * 100) / 100;
    g.mts = Math.round((g.mts + (p.toplam_mts || 0)) * 1000) / 1000;
    if (p.silinme > g.sonSilinme) g.sonSilinme = p.silinme;
  }
  const gruplar = Array.from(harita.values());
  for (const g of gruplar) g.proformalar.sort((a, b) => b.silinme.localeCompare(a.silinme));
  return gruplar.sort((a, b) => b.sonSilinme.localeCompare(a.sonSilinme) || a.unvan.localeCompare(b.unvan, "tr"));
}
