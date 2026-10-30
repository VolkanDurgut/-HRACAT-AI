import { trSayiOku } from "./irsaliye-oku";

/**
 * Ic Piyasa - ALIS siparisleri ve teslim alinan araclar (30.10.2026).
 * Veri: migration 20261030100000_ic_alis.sql. Yetki: "ic_alis" sayfa yetkisi
 * (fiyat / tedarikci). Kantarci SADECE kantar_ic_alis_* fonksiyonlariyla
 * (fiyatsiz) calisir.
 */

export type AlisDurum = "acik" | "tamamlandi" | "iptal";
export type AlisTeslim = "adresten" | "fabrika";
export type ParaBirimi = "TRY" | "USD" | "EUR";

export type IcTedarikci = {
  id: string;
  company_id: string;
  unvan: string;
  kisa_ad: string | null;
  vergi_dairesi: string | null;
  vergi_no: string | null;
  adres: string | null;
  yetkili_ad: string | null;
  telefon: string | null;
  eposta: string | null;
  notlar: string | null;
  aktif: boolean;
  olusturma: string;
};

export type IcAlisSiparisi = {
  id: string;
  company_id: string;
  alis_no: string;
  tedarikci_id: string;
  siparis_tarihi: string;
  urun: string;
  urun_kodu: string | null;
  depo: string | null;
  tedarikci_siparis_no: string | null;
  miktar_kg: number;
  birim_fiyat: number | null;
  para_birimi: ParaBirimi;
  kdv_dahil: boolean;
  vade_gun: number | null;
  termin: string | null;
  teslim: AlisTeslim;
  notlar: string | null;
  durum: AlisDurum;
  kapanis_zamani: string | null;
  olusturan_email: string | null;
  olusturma: string;
};

export type IcAlisTeslim = {
  id: string;
  alis_id: string;
  plaka: string | null;
  dorse_plaka: string | null;
  net_kg: number;
  teslim_zamani: string;
  irsaliye_no: string | null;
  irsaliye_tarihi: string | null;
  ettn: string | null;
  irsaliye_dosya_yolu: string | null;
  irsaliye_dosya_adi: string | null;
  sevk_id: string | null;
  gecmis: boolean;
  elle_duzeltildi: boolean;
  uyarilar: string[];
  notlar: string | null;
  girilen_email: string | null;
  olusturma: string;
};

/** kantar_ic_alis_siparisleri() - fiyatsiz */
export type KantarAlisSiparisi = {
  id: string;
  alis_no: string;
  tedarikci: string;
  depo: string | null;
  urun: string;
  urun_kodu: string | null;
  teslim: AlisTeslim;
  miktar_kg: number;
  alinan_kg: number;
  alinan_arac: number;
  termin: string | null;
  siparis_tarihi: string;
};

/** kantar_ic_alis_son_teslimler() */
export type KantarAlisTeslim = {
  id: string;
  alis_no: string;
  tedarikci: string;
  urun: string;
  plaka: string | null;
  dorse_plaka: string | null;
  net_kg: number;
  irsaliye_no: string | null;
  irsaliye_dosya_yolu: string | null;
  dogrudan_is_emri_no: string | null;
  uyari_var: boolean;
  gecmis: boolean;
  girilen_email: string | null;
  teslim_zamani: string;
  olusturma: string;
};

export const ALIS_DURUM_ETIKET: Record<AlisDurum, string> = {
  acik: "Açık",
  tamamlandi: "Tamamlandı",
  iptal: "İptal",
};

/** Lojistik Excel'indeki yazimla ayni ("TESLİM / ALIM" sutunu). */
export const ALIS_TESLIM_ETIKET: Record<AlisTeslim, string> = {
  adresten: "Adresten",
  fabrika: "Fabrikaya teslim",
};

export const PARA_SEMBOL: Record<ParaBirimi, string> = { TRY: "TL", USD: "USD", EUR: "EUR" };

/** "BUĞDAY" + "1222" -> "BUĞDAY (1222)" (Excel'deki "MALZEME AÇIKLAMASI" yazimi) */
export function alisUrunYazi(a: { urun: string; urun_kodu?: string | null }): string {
  return a.urun_kodu ? `${a.urun} (${a.urun_kodu})` : a.urun;
}

/** Birim fiyat: "13,85 TL/kg"; para birimi TRY degilse "0,2420 USD/kg" (4 hane). */
export function alisFiyatYazi(fiyat: number | null | undefined, para: ParaBirimi = "TRY"): string {
  if (fiyat === null || fiyat === undefined || Number.isNaN(Number(fiyat))) return "-";
  const n = Number(fiyat);
  const hane = para === "TRY" ? 2 : 4;
  return `${n.toLocaleString("tr-TR", { minimumFractionDigits: hane, maximumFractionDigits: 4 })} ${PARA_SEMBOL[para]}/kg`;
}

/** Tutar (para birimiyle): "5.540.000,00 TL" */
export function alisTutarYazi(tutar: number | null | undefined, para: ParaBirimi = "TRY"): string {
  if (tutar === null || tutar === undefined || Number.isNaN(Number(tutar))) return "-";
  return `${Number(tutar).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${PARA_SEMBOL[para]}`;
}

/** Excel'deki vade yazimi: 0 -> "PEŞİN", 15 -> "15 GÜN", bos -> "" */
export function vadeExcelYazi(g: number | null | undefined): string {
  if (g === null || g === undefined) return "";
  return g === 0 ? "PEŞİN" : `${g} GÜN`;
}

/** Teslim alinan / bekleyen. Bekleyen asla negatif yazilmaz (fazlasi ayri). */
export function alisIlerleme(miktarKg: number, alinanKg: number): { bekleyen: number; fazla: number; oran: number } {
  const m = Number(miktarKg) || 0;
  const a = Number(alinanKg) || 0;
  return { bekleyen: Math.max(0, m - a), fazla: Math.max(0, a - m), oran: m > 0 ? a / m : 0 };
}

/**
 * Siparis fiilen bitti mi (kapatmaya hazir)? Kantar tartimi ile siparis
 * miktari birkac ton fark edebilir (27.10: Havsa 700 ton -> 1.940 kg kaldi).
 * Kural: kalan <= %1 veya kalan <= 2.000 kg.
 */
export function alisKapatmayaHazir(miktarKg: number, alinanKg: number): boolean {
  const { bekleyen } = alisIlerleme(miktarKg, alinanKg);
  return bekleyen <= Math.max(2000, Number(miktarKg) * 0.01);
}

/** "2026-10-27" -> "27.10.2026" (saat dilimi kaymasi olmadan) */
export function gunTR(isoGun: string | null | undefined): string {
  if (!isoGun) return "-";
  const [y, m, d] = isoGun.slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}.${y}` : "-";
}

/** Bugunun TR takvim gunu "YYYY-MM-DD" */
export function bugunTRIso(simdi: Date = new Date()): string {
  return simdi.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

/** Alis tarafi Supabase hatalarini kullaniciya uygun hale getirir. */
export function alisHataMesaji(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e);
  if (/uq_ic_tedarikciler_unvan/i.test(m)) return "Bu ünvanla kayıtlı bir tedarikçi zaten var.";
  if (/uq_ic_tedarikciler_vergi_no/i.test(m)) return "Bu vergi numarasıyla kayıtlı bir tedarikçi zaten var.";
  if (/ic_tedarikciler_vergi_no_check/i.test(m)) return "Vergi no 10 (VKN) veya 11 (TCKN) haneli olmalı.";
  if (/ic_tedarikciler_telefon_check/i.test(m)) return "Telefon numarası geçersiz.";
  if (/ic_alis_siparisleri_tedarikci_id_fkey/i.test(m)) return "Bu tedarikçiye ait alış siparişi var; silinemez. Pasife alabilirsiniz.";
  if (/ic_alis_teslimler_alis_id_fkey/i.test(m)) return "Bu siparişe teslim girilmiş; silinemez. İptal edebilir ya da kapatabilirsiniz.";
  if (/permission denied/i.test(m)) return "Bu işlem için yetkiniz yok.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.";
  return m;
}

/**
 * Lojistik Excel'inde teslim alinan miktar formulle tutulur: "=87620+165940+195280".
 * Her terim bir parti. "87.620 + 165.940" de okunur. Gecersiz terim -> null.
 */
export function formulTerimleri(metin: string): number[] | null {
  const s = metin.trim().replace(/^=\s*\+?/, "");
  if (!s) return null;
  const parcalar = s.split("+").map((p) => p.trim()).filter(Boolean);
  const sayilar = parcalar.map((p) => trSayiOku(p));
  if (!sayilar.length || sayilar.some((n) => n === null || n <= 0)) return null;
  return sayilar as number[];
}
