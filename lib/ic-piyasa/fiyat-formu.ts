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

/**
 * Panelde duzenlenen guncel satir (ic_fiyat_kalemleri).
 * Revize 14.10.2026: her urunun PESIN ve VADELI fiyati ayri tutulur
 * (migration 20261014100000); vade_gun sadece vadeli fiyata aittir. Eski
 * birim_fiyat / odeme sutunlari veritabaninda durur ama panel kullanmaz.
 */
export type IcFiyatKalemi = {
  id: string;
  company_id: string;
  sira: number;
  urun: string;
  ambalaj: string | null;
  pesin_fiyat: number | null;
  vadeli_fiyat: number | null;
  /** Vadeli fiyatin vadesi (gun). */
  vade_gun: number | null;
  teslim: string | null;
  /** true = fiyata KDV dahil, false = KDV hariç (+ KDV). Migration 20261011230000. */
  kdv_dahil: boolean;
  /** Ozel sutun degerleri {sutunId: metin} (migration 20261015100000). */
  ozel_degerler?: Record<string, string> | null;
  guncelleme: string;
};

/**
 * Onaylanan formda dondurulmus satir (ic_fiyat_formlari.kalemler, jsonb).
 * Iki kusak vardir; okurken HER ZAMAN kalemFiyatlari() kullanilir:
 *  - 14.10.2026 sonrasi: pesin_fiyat / vadeli_fiyat (+ vade_gun = vadeli vadesi)
 *  - oncesi (FBF-2026-0001): tek birim_fiyat + vade_gun (0 = pesin) + odeme
 */
export type FormKalemi = {
  urun: string;
  ambalaj: string;
  pesin_fiyat?: number | null;
  vadeli_fiyat?: number | null;
  vade_gun: number | null;
  teslim: string;
  /** Eski formlarda (11.10.2026 oncesi) alan yok -> KDV haric sayilir. */
  kdv_dahil?: boolean;
  /** Sadece eski formlarda. */
  birim_fiyat?: number;
  /** Sadece eski formlarda (artik formda gosterilmez). */
  odeme?: string;
  /** Ozel sutun degerleri {sutunId: metin} (15.10.2026). */
  ozel?: Record<string, string>;
};

/**
 * Form 14.10.2026 oncesi (tek fiyatli) bicimde mi onaylandi? Onaylanan form
 * DEGISTIRILEMEZ ilkesi geregi bu formlar PDF / gorselde GONDERILDIGI HALIYLE
 * (Vade / Odeme / Birim Fiyat) cizilir; bos "Pesin" sutunu gosterilmez.
 */
export function eskiBicimForm(form: { kalemler: FormKalemi[] }): boolean {
  return form.kalemler.length > 0 && form.kalemler.every((k) => !("pesin_fiyat" in k) && !("vadeli_fiyat" in k));
}

/** Bir form kaleminin fiyatlari (eski/yeni kusak ayni bicimde). */
export type KalemFiyatlari = { pesin: number | null; vadeli: number | null; vadeGun: number | null };

function sayiVeyaNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function kalemFiyatlari(k: FormKalemi): KalemFiyatlari {
  if ("pesin_fiyat" in k || "vadeli_fiyat" in k) {
    const vadeli = sayiVeyaNull(k.vadeli_fiyat);
    return { pesin: sayiVeyaNull(k.pesin_fiyat), vadeli, vadeGun: vadeli !== null ? k.vade_gun ?? null : null };
  }
  // Eski kusak: tek fiyat; vade 0 ise pesin, degilse o vadenin vadeli fiyati
  const birim = sayiVeyaNull(k.birim_fiyat);
  if (k.vade_gun === 0) return { pesin: birim, vadeli: null, vadeGun: null };
  return { pesin: null, vadeli: birim, vadeGun: birim !== null ? k.vade_gun ?? null : null };
}

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
  /** Onay anindaki iletisim (migration 20261014110000); eski formlarda null. */
  iletisim?: FormIletisim | null;
  /** Onay anindaki sartlar, {KDV} cozulmus (migration 20261014130000); eski formlarda null. */
  sartlar?: string[] | null;
  /** Onay anindaki sutun duzeni (migration 20261015100000); eski formlarda null = tum standart sutunlar. */
  sutunlar?: SutunAyari | null;
};

/** Formun "Siparis ve bilgi" iletisim kisisi (panelden duzenlenir, 14.10.2026). */
export type FormIletisim = { ad: string; telefon: string; whatsapp: boolean; eposta: string | null };

/** Form kayitlari icin secilecek sutunlar (tek yerde; iletisim dahil). */
export const FORM_SUTUNLARI = "id, company_id, form_no, alici, onay_zamani, gecerlilik_bitis, kalemler, olusturan_email, iletisim, sartlar, sutunlar";

/** Gecerlilik suresi (gun). Sunucudaki tetikleyiciyle AYNI olmalidir
 *  (migration 20261011200000: onay gunu + 3). */
export const GECERLILIK_GUN = 3;

/** Is emrindeki odeme sekli (fiyat tablosunda / formda artik yok, 14.10.2026). */
export const ODEME_SECENEKLERI = ["Nakit / Havale", "Çek", "Kredi Kartı"];
export const TESLIM_SECENEKLERI = ["Fabrika Teslim", "Adrese Teslim"];
export const AMBALAJ_SECENEKLERI = ["Dökme", "30 kg Çuval", "35 kg Çuval"];
/** Is emri vadesi (0 = Pesin). */
export const VADE_SECENEKLERI = [0, 7, 10, 15, 20, 30, 45, 60];
/** Fiyat tablosunda vadeli fiyatin vadesi (pesin ayri sutun oldugu icin 0 yok). */
export const VADELI_VADE_SECENEKLERI = VADE_SECENEKLERI.filter((g) => g > 0);

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

/** Ayar girilmemisse ve 14.10.2026 oncesi formlarda kullanilan bilgi. */
export const VARSAYILAN_ILETISIM: FormIletisim = {
  ad: FORM_SIRKET.iletisimAd,
  telefon: FORM_SIRKET.iletisimTel,
  whatsapp: true,
  eposta: FORM_SIRKET.iletisimEposta,
};

/** Herhangi bir kaynaktan (form.iletisim / ayar) gecerli iletisim; bozuksa varsayilan. */
export function iletisimOku(v: unknown): FormIletisim {
  if (!v || typeof v !== "object") return VARSAYILAN_ILETISIM;
  const o = v as Record<string, unknown>;
  const ad = typeof o.ad === "string" ? o.ad.trim() : "";
  const telefon = typeof o.telefon === "string" ? o.telefon.trim() : "";
  if (!ad || !telefon) return VARSAYILAN_ILETISIM;
  const eposta = typeof o.eposta === "string" && o.eposta.trim() ? o.eposta.trim() : null;
  return { ad, telefon, whatsapp: o.whatsapp !== false, eposta };
}

/** "Burak Tuncay  ·  0541 339 60 04 (WhatsApp)  ·  buraktuncay@unex.com.tr" */
export function iletisimSatiri(i: FormIletisim, ayrac = "  ·  "): string {
  return [i.ad, `${i.telefon}${i.whatsapp ? " (WhatsApp)" : ""}`, i.eposta].filter(Boolean).join(ayrac);
}

/** Panel dogrulamasi (DB kisitlariyla AYNI kural). Hata metni ya da null. */
export function iletisimHatasi(i: { ad: string; telefon: string; eposta: string }): string | null {
  const ad = i.ad.trim();
  if (ad.length < 2 || ad.length > 80) return "Ad soyad 2-80 karakter olmalı.";
  const tel = i.telefon.trim();
  if (!/^[0-9+() -]{7,25}$/.test(tel) || tel.replace(/\D/g, "").length < 7) return "Telefon geçersiz. Örnek: 0541 339 60 04";
  const e = i.eposta.trim();
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "E-posta adresi geçersiz.";
  return null;
}

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
 * SUTUN DUZENI (15.10.2026, Burak Bey istegi): standart sutunlar formda
 * gosterilir / gizlenir, en fazla 3 ozel (serbest metin) sutun eklenir.
 * Guncel ayar ic_piyasa_ayarlari.form_sutunlari; onayda forma dondurulur
 * (ic_fiyat_formlari.sutunlar). NULL = varsayilan (her sey gorunur, ozel yok)
 * -> eski formlar birebir ayni cizilir. Urun her zaman gorunur; pesin ve
 * vadeli fiyattan en az biri gorunur kalmalidir.
 */
export const STANDART_SUTUNLAR = [
  { anahtar: "ambalaj", etiket: "Ambalaj" },
  { anahtar: "pesin", etiket: "Peşin Fiyat" },
  { anahtar: "vadeli", etiket: "Vadeli Fiyat" },
  { anahtar: "vade", etiket: "Vade" },
  { anahtar: "kdv", etiket: "KDV" },
  { anahtar: "teslim", etiket: "Teslim" },
] as const;
export type StandartSutun = (typeof STANDART_SUTUNLAR)[number]["anahtar"];
export type OzelSutun = { id: string; baslik: string };
export type SutunAyari = { gizli: StandartSutun[]; ozel: OzelSutun[] };

export const OZEL_SUTUN_EN_COK = 3;
export const OZEL_BASLIK_MAX = 24;
export const OZEL_DEGER_MAX = 40;
export const VARSAYILAN_SUTUNLAR: SutunAyari = { gizli: [], ozel: [] };

const STANDART_ANAHTARLAR = STANDART_SUTUNLAR.map((s) => s.anahtar) as readonly string[];

/** Herhangi bir kaynaktan (ayar / form) gecerli sutun ayari; bozuksa varsayilan. */
export function sutunAyariOku(v: unknown): SutunAyari {
  if (!v || typeof v !== "object") return VARSAYILAN_SUTUNLAR;
  const o = v as { gizli?: unknown; ozel?: unknown };
  const gizli = Array.isArray(o.gizli)
    ? (Array.from(new Set(o.gizli.filter((g): g is StandartSutun => typeof g === "string" && STANDART_ANAHTARLAR.includes(g)))))
    : [];
  const ozel = Array.isArray(o.ozel)
    ? o.ozel
        .filter((x): x is OzelSutun => !!x && typeof x === "object" && typeof (x as OzelSutun).id === "string" && typeof (x as OzelSutun).baslik === "string")
        .map((x) => ({ id: x.id, baslik: x.baslik.trim() }))
        .filter((x) => x.id && x.baslik)
        .slice(0, OZEL_SUTUN_EN_COK)
    : [];
  // Iki fiyat da gizliyse ayar gecersiz -> fiyatlar gorunur kalir
  const gecerliGizli = gizli.includes("pesin") && gizli.includes("vadeli") ? gizli.filter((g) => g !== "pesin" && g !== "vadeli") : gizli;
  return { gizli: gecerliGizli, ozel };
}

export function sutunGorunur(ayar: SutunAyari | null | undefined, anahtar: StandartSutun): boolean {
  return !(ayar?.gizli || []).includes(anahtar);
}

/** Varsayilan duzen mi? (her sey gorunur, ozel sutun yok) */
export function varsayilanSutunMu(ayar: SutunAyari | null | undefined): boolean {
  return !ayar || ((ayar.gizli || []).length === 0 && (ayar.ozel || []).length === 0);
}

/** Panel dogrulamasi (DB kisitiyla AYNI kural). Hata metni ya da null. */
export function sutunAyariHatasi(ayar: SutunAyari): string | null {
  if (ayar.gizli.includes("pesin") && ayar.gizli.includes("vadeli")) return "Peşin ve vadeli fiyattan en az biri formda görünmeli.";
  if (ayar.ozel.length > OZEL_SUTUN_EN_COK) return `En fazla ${OZEL_SUTUN_EN_COK} özel sütun eklenebilir.`;
  const adlar = new Set<string>();
  for (const o of ayar.ozel) {
    const b = o.baslik.trim();
    if (b.length < 2 || b.length > OZEL_BASLIK_MAX) return `Sütun başlığı 2-${OZEL_BASLIK_MAX} karakter olmalı ("${b || "boş"}").`;
    const k = b.toLocaleLowerCase("tr");
    if (adlar.has(k)) return `"${b}" başlığı iki kez kullanılmış.`;
    adlar.add(k);
  }
  return null;
}

/** Ozel sutun degerini (kaydetmeye hazir) temizler. */
export function ozelDegerTemizle(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, OZEL_DEGER_MAX) : "";
}

/** Formun sutun duzeni: dondurulmus hali, yoksa varsayilan. */
export function formSutunlari(form: { sutunlar?: SutunAyari | null }): SutunAyari {
  return sutunAyariOku(form.sutunlar);
}

/**
 * Panel satirinin forma girmeye hazir olup olmadigini soyler. Eksik varsa
 * kullaniciya gosterilecek Turkce aciklama dondurur, yoksa null.
 */
export function satirEksigi(
  k: Pick<IcFiyatKalemi, "urun" | "ambalaj" | "pesin_fiyat" | "vadeli_fiyat" | "vade_gun" | "teslim">,
  ayar: SutunAyari | null = null
): string | null {
  // Formda gizlenen sutun zorunlu degildir (15.10.2026)
  const gor = (a: StandartSutun) => sutunGorunur(ayar, a);
  const eksik: string[] = [];
  const pesin = gor("pesin") ? sayiVeyaNull(k.pesin_fiyat) : null;
  const vadeli = gor("vadeli") ? sayiVeyaNull(k.vadeli_fiyat) : null;
  if (!k.urun?.trim()) eksik.push("ürün");
  if (gor("ambalaj") && !k.ambalaj?.trim()) eksik.push("ambalaj");
  if (pesin === null && vadeli === null) {
    eksik.push(gor("pesin") && gor("vadeli") ? "peşin veya vadeli fiyat" : gor("pesin") ? "peşin fiyat" : "vadeli fiyat");
  }
  if (vadeli !== null && gor("vade") && !(Number(k.vade_gun) > 0)) eksik.push("vadeli fiyatın vadesi");
  if (gor("teslim") && !k.teslim?.trim()) eksik.push("teslim");
  return eksik.length ? eksik.join(", ") : null;
}

/** Panel satirlarini formda dondurulecek bicime cevirir (sira korunur). */
export function formKalemleri(satirlar: IcFiyatKalemi[], ayar: SutunAyari | null = null): FormKalemi[] {
  const gor = (a: StandartSutun) => sutunGorunur(ayar, a);
  const ozelSutunlar = ayar?.ozel || [];
  return [...satirlar]
    .sort((a, b) => a.sira - b.sira)
    .map((k) => {
      // Formda gizlenen fiyat forma girmez (is emri de o fiyati onermesin)
      const vadeli = gor("vadeli") ? sayiVeyaNull(k.vadeli_fiyat) : null;
      const vadeGun = vadeli !== null && k.vade_gun !== null && Number(k.vade_gun) > 0 ? Number(k.vade_gun) : null;
      const kalem: FormKalemi = {
        urun: k.urun.trim(),
        ambalaj: (k.ambalaj || "").trim(),
        pesin_fiyat: gor("pesin") ? sayiVeyaNull(k.pesin_fiyat) : null,
        vadeli_fiyat: vadeli,
        // Vade sadece vadeli fiyat varsa anlamlidir (gizliyse de is emri icin saklanir)
        vade_gun: vadeGun,
        teslim: (k.teslim || "").trim(),
        kdv_dahil: !!k.kdv_dahil,
      };
      if (ozelSutunlar.length) {
        kalem.ozel = Object.fromEntries(ozelSutunlar.map((o) => [o.id, ozelDegerTemizle(k.ozel_degerler?.[o.id])]));
      }
      return kalem;
    });
}

/**
 * Bilgilendirme ve sevkiyat sartlari (kullanici metni 12.10.2026; panelden
 * duzenlenebilir 14.10.2026 - ic_piyasa_ayarlari.form_sartlari).
 * "{KDV}" yazilan yere formdaki urunlerin KDV secimine gore cumle gelir
 * (satirlarla celismesin diye). Onaylanan formda maddeler {KDV} COZULMUS
 * halde dondurulur (ic_fiyat_formlari.sartlar); PDF once ona bakar.
 */
export const KDV_YER_TUTUCU = "{KDV}";
export const SART_EN_AZ = 1;
export const SART_EN_COK = 8;
export const SART_MIN_KARAKTER = 5;
export const SART_MAX_KARAKTER = 500;

export const VARSAYILAN_SARTLAR: string[] = [
  "İşbu form nihai bir bağlayıcı teklif olmayıp, sektörel fiyat bilgilendirmesi mahiyetindedir.",
  `${KDV_YER_TUTUCU} Sevkiyat ve nakliye detayları sipariş onayında kesinleştirilir.`,
  "Geçerlilik süresi içinde onaylanan siparişlerde formdaki fiyatlar uygulanır; süre sonrasında sevkiyat günündeki günlük rayiç fiyatlar geçerlidir.",
  "Ödemeler mutabık kalınan ödeme protokolü çerçevesinde fatura tarihindeki koşullar esas alınarak tahsil edilir.",
];

/** Urunlerin KDV secimine gore cumle. */
export function kdvCumlesi(kalemler: FormKalemi[]): string {
  const hepsiDahil = kalemler.length > 0 && kalemler.every((k) => k.kdv_dahil);
  const hicbiriDahil = kalemler.every((k) => !k.kdv_dahil);
  return hepsiDahil
    ? "Fiyatlarımıza KDV dahildir."
    : hicbiriDahil
    ? "Fiyatlarımıza KDV dahil değildir."
    : "Fiyatlardaki KDV durumu her ürünün altında ayrıca belirtilmiştir.";
}

/** Sablon maddelerini forma yazilacak hale getirir ({KDV} cozulur, bosluklar temizlenir). */
export function sartlariCoz(sablon: string[] | null | undefined, kalemler: FormKalemi[]): string[] {
  const kaynak = sablon && sablon.length ? sablon : VARSAYILAN_SARTLAR;
  const kdv = kdvCumlesi(kalemler);
  return kaynak
    .map((m) => m.split(KDV_YER_TUTUCU).join(kdv).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Formun sartlari: onaylanirken dondurulmus hali, yoksa (eski form) varsayilan. */
export function formSartlari(form: { kalemler: FormKalemi[]; sartlar?: string[] | null }): string[] {
  if (Array.isArray(form.sartlar) && form.sartlar.length) return form.sartlar;
  return sartlariCoz(null, form.kalemler);
}

/** Panel dogrulamasi (DB kisitiyla AYNI kural). Hata metni ya da null. */
export function sartlarHatasi(maddeler: string[]): string | null {
  const temiz = maddeler.map((m) => m.trim());
  if (temiz.length < SART_EN_AZ) return "En az bir madde olmalı.";
  if (temiz.length > SART_EN_COK) return `En fazla ${SART_EN_COK} madde eklenebilir.`;
  for (let i = 0; i < temiz.length; i++) {
    const n = temiz[i].length;
    if (n < SART_MIN_KARAKTER) return `${i + 1}. madde çok kısa (en az ${SART_MIN_KARAKTER} karakter).`;
    if (n > SART_MAX_KARAKTER) return `${i + 1}. madde çok uzun (en fazla ${SART_MAX_KARAKTER} karakter, şu an ${n}).`;
  }
  return null;
}

/** Ayardan okunan degeri dogrular; bozuk/bos ise null (= varsayilan). */
export function sartSablonuOku(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || !v.every((x) => typeof x === "string")) return null;
  return sartlarHatasi(v as string[]) ? null : (v as string[]).map((m) => m.trim());
}

/**
 * Siparis sureci (formda zaman cizelgesi). Sistemdeki gercek akisla birebir:
 * is emri -> siparis_alindi; kantar + e-Irsaliye; lojistik cikis onayi ->
 * arac_yola_cikti; is emri kapatilinca -> siparis_tamamlandi (takip sayfasi).
 */
export const SIPARIS_SURECI: { baslik: string; aciklama: string }[] = [
  { baslik: "Sipariş Onayı", aciklama: "Siparişiniz kayda alınır; sipariş numaranız ve size özel takip bağlantınız WhatsApp ile iletilir." },
  { baslik: "Yükleme ve Tartım", aciklama: "Ürününüz fabrikamızda yüklenir, kantarda tartılır ve e-İrsaliyesi düzenlenir." },
  { baslik: "Yola Çıkış", aciklama: "Araç yola çıktığında plaka, net miktar ve irsaliye numarası WhatsApp ile bildirilir." },
  { baslik: "Teslim ve Kapanış", aciklama: "Sipariş tamamlandığında sevkiyat özeti iletilir; tüm irsaliyeler takip sayfanızda yer alır." },
];
export const SIPARIS_SURECI_NOTU = "Siparişinizi size özel takip bağlantısından 7/24 izleyebilir, irsaliyelerinize anında ulaşabilirsiniz.";

/** Dosya adi: "FBF-2026-0001_Fiyat_Bilgilendirme_Formu" */
export function formDosyaAdi(formNo: string): string {
  return `${formNo.replace(/[^a-zA-Z0-9_-]/g, "_")}_Fiyat_Bilgilendirme_Formu`;
}
