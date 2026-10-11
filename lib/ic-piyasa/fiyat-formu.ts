/**
 * lib/ic-piyasa/fiyat-formu.ts
 *
 * Ic Piyasa - Yan Mamul Fiyat Bilgilendirme Formu: tipler, sabitler ve saf
 * bicimlendirme fonksiyonlari (11.10.2026). Panel (app/ic-piyasa), PDF
 * (fiyat-formu-pdf-builder.ts) ve telefon gorseli (fiyat-formu-gorsel.ts)
 * AYNI fonksiyonlari kullanir; boylece ekrandaki tablo ile PDF/gorsel
 * birbirinden sapamaz.
 *
 * Ihracat tarafiyla hicbir baglantisi yoktur.
 */

/** Panelde duzenlenen guncel satir (ic_fiyat_kalemleri). */
export type IcFiyatKalemi = {
  id: string;
  company_id: string;
  sira: number;
  urun: string;
  ambalaj: string | null;
  birim_fiyat: number | null;
  vade_gun: number | null; // 0 = Pesin
  odeme: string | null;
  teslim: string | null;
  /** true = fiyata KDV dahil, false = KDV hariç (+ KDV). Migration 20261011230000. */
  kdv_dahil: boolean;
  guncelleme: string;
};

/** Onaylanan formda dondurulmus satir (ic_fiyat_formlari.kalemler). */
export type FormKalemi = {
  urun: string;
  ambalaj: string;
  birim_fiyat: number;
  vade_gun: number;
  odeme: string;
  teslim: string;
  /** Eski formlarda (11.10.2026 oncesi) alan yok -> KDV haric sayilir. */
  kdv_dahil?: boolean;
};

/** Onaylanmis form (ic_fiyat_formlari). */
export type IcFiyatFormu = {
  id: string;
  company_id: string;
  form_no: string;
  alici: string | null;
  onay_zamani: string;
  gecerlilik_bitis: string; // YYYY-MM-DD
  kalemler: FormKalemi[];
  olusturan_email: string | null;
};

/** Gecerlilik suresi (gun). Sunucudaki tetikleyiciyle AYNI olmalidir
 *  (migration 20261011200000: onay gunu + 3). */
export const GECERLILIK_GUN = 3;

export const ODEME_SECENEKLERI = ["Nakit / Havale", "Çek", "Kredi Kartı"];
export const TESLIM_SECENEKLERI = ["Fabrika Teslim", "Adrese Teslim"];
export const AMBALAJ_SECENEKLERI = ["Dökme", "30 kg Çuval", "35 kg Çuval"];
export const VADE_SECENEKLERI = [0, 7, 10, 15, 20, 30, 45, 60];

/** Panel bossa tek tikla yuklenen baslangic listesi (siparis raporundaki
 *  yan mamuller; fiyatlar BOS gelir, Burak Bey doldurur). */
export const BASLANGIC_URUNLERI: { urun: string; ambalaj: string }[] = [
  { urun: "Kepek", ambalaj: "Dökme" },
  { urun: "Razmol", ambalaj: "Dökme" },
  { urun: "Razmol", ambalaj: "30 kg Çuval" },
  { urun: "Bonkalit", ambalaj: "Dökme" },
  { urun: "Kırık Buğday", ambalaj: "Dökme" },
  { urun: "Kavuz", ambalaj: "Dökme" },
];

/** Formda yer alan sabit sirket bilgileri (Unex antet / sigorta talimati ile ayni). */
export const FORM_SIRKET = {
  unvan: "UNEX GIDA SANAYİ VE TİCARET LİMİTED ŞİRKETİ",
  adres1: "İstiklal Mah. Cemal Ünlü Saraç Cad. No:20",
  adres2: "Süleymanpaşa / Tekirdağ / Türkiye",
  tel: "+90 282 440 0 870",
  faks: "+90 282 440 0 869",
  eposta: "info@unex.com.tr",
  web: "www.unex.com.tr",
  vergi: "Süleymanpaşa V.D. 8920645297",
  iletisim: "Burak Tuncay · 0541 339 60 04 (WhatsApp)",
  iletisimAd: "Burak Tuncay",
  iletisimTel: "0541 339 60 04",
  iletisimEposta: "buraktuncay@unex.com.tr",
};

/** KDV durumu metni: true -> "KDV Dahil", false/yok -> "+ KDV". */
export function kdvYazi(dahil: boolean | null | undefined): string {
  return dahil ? "KDV Dahil" : "+ KDV";
}

/** 13.15 -> "13,15" */
export function fiyatYazi(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 0 -> "Peşin", 30 -> "30 Gün" */
export function vadeYazi(g: number | null | undefined): string {
  if (g === null || g === undefined) return "-";
  return g === 0 ? "Peşin" : `${g} Gün`;
}

/** "2026-10-15" -> "15.10.2026" (saat dilimi kaymasi olmadan, metinden). */
export function gunYazi(isoGun: string | null | undefined): string {
  if (!isoGun) return "-";
  const [y, m, d] = isoGun.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** Zaman damgasini Turkiye saatiyle "12.10.2026 09:14" yazar. */
export function onayZamaniYazi(ts: string): string {
  const d = new Date(ts);
  const tarih = d.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" });
  const saat = d.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
  return `${tarih} ${saat}`;
}

/** Turkiye takvimine gore bugunun tarihi (YYYY-MM-DD). */
export function bugunTR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

/** Form hala gecerli mi? (gecerlilik_bitis gunu dahil) */
export function formGecerliMi(gecerlilikBitis: string): boolean {
  return bugunTR() <= gecerlilikBitis.slice(0, 10);
}

/** Alici bossa genel hitap. */
export function hitapYazi(alici: string | null | undefined): string {
  const a = (alici || "").trim();
  return a ? `Sayın ${a},` : "Sayın Müşterimiz,";
}

/**
 * Panel satirinin forma girmeye hazir olup olmadigini soyler. Eksik varsa
 * kullaniciya gosterilecek Turkce aciklama dondurur, yoksa null.
 */
export function satirEksigi(k: Pick<IcFiyatKalemi, "urun" | "ambalaj" | "birim_fiyat" | "vade_gun" | "odeme" | "teslim">): string | null {
  const eksik: string[] = [];
  if (!k.urun?.trim()) eksik.push("ürün");
  if (!k.ambalaj?.trim()) eksik.push("ambalaj");
  if (k.birim_fiyat === null || k.birim_fiyat === undefined || !(k.birim_fiyat > 0)) eksik.push("birim fiyat");
  if (k.vade_gun === null || k.vade_gun === undefined) eksik.push("vade");
  if (!k.odeme?.trim()) eksik.push("ödeme");
  if (!k.teslim?.trim()) eksik.push("teslim");
  return eksik.length ? eksik.join(", ") : null;
}

/** Panel satirlarini formda dondurulecek bicime cevirir (sira korunur). */
export function formKalemleri(satirlar: IcFiyatKalemi[]): FormKalemi[] {
  return [...satirlar]
    .sort((a, b) => a.sira - b.sira)
    .map((k) => ({
      urun: k.urun.trim(),
      ambalaj: (k.ambalaj || "").trim(),
      birim_fiyat: Number(k.birim_fiyat),
      vade_gun: Number(k.vade_gun),
      odeme: (k.odeme || "").trim(),
      teslim: (k.teslim || "").trim(),
      kdv_dahil: !!k.kdv_dahil,
    }));
}

/** Dosya adi: "FBF-2026-0001_Fiyat_Bilgilendirme_Formu" */
export function formDosyaAdi(formNo: string): string {
  return `${formNo.replace(/[^a-zA-Z0-9_-]/g, "_")}_Fiyat_Bilgilendirme_Formu`;
}
