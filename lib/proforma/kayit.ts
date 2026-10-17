/**
 * PROFORMA OLUSTURUCU - kayit katmani (17.10.2026).
 * Tablo tipleri (ihracat_musterileri / ihracat_urunleri / proforma_ayarlari),
 * form taslagi <-> kayit donusumu, dogrulama ve kullaniciya gosterilecek hata
 * metinleri. Kurallar veritabanindaki CHECK / UNIQUE kisitlariyla AYNI; ekranda
 * once burada yakalanir, veritabani son guvencedir.
 *
 * Saf modul (React / Supabase importu yok; tsx ile test edilir).
 */
import type { BankaAnahtari } from "@/lib/bankalar";

export type IhracatMusteri = {
  id: string;
  company_id: string;
  kod: string;
  unvan: string;
  adres: string | null;
  ilgili_kisi: string | null;
  eposta: string | null;
  teslim_sekli: string | null;
  varis_limani: string | null;
  teslim_ifadesi: string | null;
  banka: BankaAnahtari | null;
  para_birimi: "USD" | "EUR";
  odeme_sekli: string | null;
  sevkiyat_metni: string | null;
  evraklar: string[] | null;
  notlar: string | null;
  aktif: boolean;
  created_at: string;
  updated_at: string;
};

export type IhracatUrun = {
  id: string;
  company_id: string;
  ad: string;
  varsayilan_ambalaj_kg: number;
  sira: number;
  aktif: boolean;
  created_at: string;
  updated_at: string;
};

export type ProformaAyar = {
  company_id: string;
  ozel_sartlar: string[] | null;
  evraklar: string[] | null;
  alt_bilgi: string[] | null;
  ust_bilgi_tarih: string | null;
  ust_bilgi_revizyon: string | null;
  updated_at: string;
};

// ---------------------------------------------------------------- musteri ---

export type MusteriTaslak = {
  kod: string;
  unvan: string;
  adres: string;
  ilgili_kisi: string;
  eposta: string;
  teslim_sekli: string;
  varis_limani: string;
  teslim_ifadesi: string;
  banka: BankaAnahtari | "";
  para_birimi: "USD" | "EUR";
  odeme_sekli: string;
  sevkiyat_metni: string;
  /** false = sablondaki varsayilan evrak listesi kullanilir (kayitta NULL) */
  ozelEvrak: boolean;
  evraklar: string[];
  notlar: string;
  aktif: boolean;
};

export const BOS_MUSTERI: MusteriTaslak = {
  kod: "", unvan: "", adres: "", ilgili_kisi: "", eposta: "", teslim_sekli: "CIF", varis_limani: "",
  teslim_ifadesi: "", banka: "", para_birimi: "USD", odeme_sekli: "", sevkiyat_metni: "",
  ozelEvrak: false, evraklar: [], notlar: "", aktif: true,
};

export function musteridenTaslak(m: IhracatMusteri): MusteriTaslak {
  return {
    kod: m.kod, unvan: m.unvan, adres: m.adres || "", ilgili_kisi: m.ilgili_kisi || "", eposta: m.eposta || "",
    teslim_sekli: m.teslim_sekli || "", varis_limani: m.varis_limani || "", teslim_ifadesi: m.teslim_ifadesi || "",
    banka: m.banka || "", para_birimi: m.para_birimi === "EUR" ? "EUR" : "USD", odeme_sekli: m.odeme_sekli || "",
    sevkiyat_metni: m.sevkiyat_metni || "", ozelEvrak: Array.isArray(m.evraklar) && m.evraklar.length > 0,
    evraklar: Array.isArray(m.evraklar) ? m.evraklar : [], notlar: m.notlar || "", aktif: m.aktif,
  };
}

/** Kod alani: sadece A-Z (Turkce harf / rakam / bosluk atilir), en fazla 6. */
export const kodTemizle = (s: string) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);

const metin = (s: string): string | null => {
  const t = String(s || "").replace(/\r\n/g, "\n").split("\n").map((x) => x.replace(/[ \t]+$/g, "")).join("\n").trim();
  return t ? t : null;
};

/** Cok satirli metin listesi (evrak / ozel sart / alt bilgi) - bos satirlar atilir. */
export function listeTemizle(liste: string[]): string[] {
  return liste.map((x) => String(x || "").replace(/\r\n/g, "\n").trim()).filter((x) => x.length > 0);
}

const EPOSTA_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** "a@x.com; b@y.com , c@z.com" -> "a@x.com, b@y.com, c@z.com" | hata */
export function epostaListesi(s: string): { deger: string | null } | { hata: string } {
  const parcalar = String(s || "").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  if (!parcalar.length) return { deger: null };
  const hatali = parcalar.find((p) => !EPOSTA_RE.test(p));
  if (hatali) return { hata: `E-posta adresi geçersiz: ${hatali}` };
  return { deger: Array.from(new Set(parcalar.map((p) => p.toLowerCase()))).join(", ") };
}

export type MusteriKaydi = Omit<IhracatMusteri, "id" | "company_id" | "created_at" | "updated_at">;

export function musteriKaydiHazirla(t: MusteriTaslak): { kayit: MusteriKaydi } | { hata: string } {
  const kod = kodTemizle(t.kod);
  if (!/^[A-Z]{2,6}$/.test(kod)) return { hata: "Alıcı kodu 2-6 harf olmalı (örn. CCS). Proforma no: UNEX + KOD + tarih." };
  const unvan = String(t.unvan || "").replace(/\s+/g, " ").trim();
  if (unvan.length < 2 || unvan.length > 200) return { hata: "Ünvan 2-200 karakter olmalı." };
  const ep = epostaListesi(t.eposta);
  if ("hata" in ep) return ep;
  let evraklar: string[] | null = null;
  if (t.ozelEvrak) {
    evraklar = listeTemizle(t.evraklar);
    if (evraklar.length === 0) return { hata: "Özel evrak listesi boş olamaz. Varsayılan listeyi kullanmak için seçimi kaldırın." };
    if (evraklar.length > 30) return { hata: "En fazla 30 evrak girilebilir." };
    if (evraklar.some((e) => e.length > 1000)) return { hata: "Evrak satırı en fazla 1000 karakter olabilir." };
  }
  if (t.banka && !["denizbank", "vakifbank", "ziraat"].includes(t.banka)) return { hata: "Banka seçimi geçersiz." };
  const teslim = String(t.teslim_sekli || "").trim().toUpperCase();
  return {
    kayit: {
      kod,
      unvan,
      adres: metin(t.adres),
      ilgili_kisi: metin(t.ilgili_kisi),
      eposta: ep.deger,
      teslim_sekli: teslim || null,
      varis_limani: metin(t.varis_limani)?.toLocaleUpperCase("en-US") ?? null,
      teslim_ifadesi: metin(t.teslim_ifadesi),
      banka: t.banka || null,
      para_birimi: t.para_birimi === "EUR" ? "EUR" : "USD",
      odeme_sekli: metin(t.odeme_sekli),
      sevkiyat_metni: metin(t.sevkiyat_metni),
      evraklar,
      notlar: metin(t.notlar),
      aktif: !!t.aktif,
    },
  };
}

// ------------------------------------------------------------------- urun ---

export function urunKaydiHazirla(ad: string, kg: string | number): { kayit: { ad: string; varsayilan_ambalaj_kg: number } } | { hata: string } {
  const a = String(ad || "").replace(/\s+/g, " ").trim();
  if (a.length < 2 || a.length > 300) return { hata: "Ürün adı 2-300 karakter olmalı." };
  if (/\([^()]*\bBRAND\)\s*$/i.test(a)) return { hata: "Marka ürün adına yazılmaz; proformada her satırda ayrı seçilir. \"(... BRAND)\" kısmını silin." };
  const n = typeof kg === "number" ? kg : parseFloat(String(kg || "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 1000) return { hata: "Varsayılan ambalaj 0-1000 kg arasında olmalı." };
  return { kayit: { ad: a, varsayilan_ambalaj_kg: Math.round(n * 1000) / 1000 } };
}

// ----------------------------------------------------------------- sablon ---

export const UST_BILGI_SINIR = { tarih: 20, revizyon: 10 } as const;

export function sablonListesiDogrula(ad: string, liste: string[], enaz: number, encok: number): string | null {
  const l = listeTemizle(liste);
  if (l.length < enaz) return `${ad}: en az ${enaz} satır olmalı.`;
  if (l.length > encok) return `${ad}: en fazla ${encok} satır olabilir.`;
  if (l.some((x) => x.length > 1000)) return `${ad}: bir satır en fazla 1000 karakter olabilir.`;
  return null;
}

/** Ayni metin varsayilanla birebir ayniysa NULL kaydedilir (varsayilan guncellenirse otomatik izler). */
export function varsayilanaEsitseNull(liste: string[], varsayilan: readonly string[]): string[] | null {
  const l = listeTemizle(liste);
  return l.length === varsayilan.length && l.every((x, i) => x === varsayilan[i]) ? null : l;
}

// ------------------------------------------------------------------ hata ---

export function proformaHataMesaji(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e);
  if (/ihracat_musterileri_kod_tekil/i.test(m)) return "Bu alıcı kodu başka bir müşteride kullanılıyor.";
  if (/ihracat_musterileri_unvan_tekil/i.test(m)) return "Bu ünvanla kayıtlı bir müşteri zaten var.";
  if (/ihracat_musterileri_kod_check/i.test(m)) return "Alıcı kodu 2-6 büyük harf olmalı.";
  if (/ihracat_musterileri_unvan_check/i.test(m)) return "Ünvan 2-200 karakter olmalı.";
  if (/ihracat_musterileri_evraklar_check/i.test(m)) return "Evrak listesi 1-30 satır olmalı.";
  if (/ihracat_urunleri_ad_tekil/i.test(m)) return "Bu ürün kütüphanede zaten var.";
  if (/ihracat_urunleri_(ad|ambalaj)_check/i.test(m)) return "Ürün adı 2-300 karakter, ambalaj 0-1000 kg olmalı.";
  if (/proforma_ayarlari_\w+_check/i.test(m)) return "Şablon metni sınırların dışında (satır sayısı / uzunluk).";
  if (/relation .*(ihracat_musterileri|ihracat_urunleri|proforma_ayarlari).* does not exist|Could not find the table/i.test(m))
    return "Proforma tabloları henüz oluşturulmamış. Veritabanı güncellemesinin (SQL) çalıştırılması gerekiyor.";
  if (/row-level security|permission denied/i.test(m)) return "Bu işlem için yetkiniz yok.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.";
  return m;
}
