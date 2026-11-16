/**
 * NAVLUN TABLOSU (11.11.2026) - operasyonun elle tuttugu "NAVLUN TABLOSU" Excel'iyle AYNI duzen, sistemdeki veriden.
 * SAF: veri yok, ag yok. Web (Navlun Bildirimi > Excel indir) ve edge (navlun-tablosu, test maili) AYNI dosyayi uretir.
 *
 * Sablon (operasyonun dosyasi): satirlar = liman (B: PORT), C: HEDEF; her acente / armator icin bir blok
 * (2. satirda birlestirilmis ad), blokta ay sutunlari (fiyat alinan aylar) + TRANSIT + FREE TIME.
 *
 * Kaynaklar (yalniz sistemde olan bilgi; tahmin YOK):
 *  - navlun_teklifleri: acentelerin mail teklifleri (teklif / karsi teklif / "hedefiniz uygundur"), hedefimiz, free time.
 *  - yukleme plani: gerceklesen navlun (rezervasyonu yapilmis yuklemenin konteyner basi navlunu, ETD ayi) - YESIL KALIN.
 * TRANSIT / FREE TIME: acentenin o limana SON yazdigi deger (mail metni, PDF / gorsel teklif; 11.11.2026'dan beri transit de okunur).
 * Hucre = o ay icin o blogun 20'DC fiyati (ayni ayda birden fazlaysa EN SON). 20'DC yoksa 40'HC metin olarak yazilir.
 */
import { limanAnahtari } from "./liman-anahtari.ts";
import { XS, sutunHarfi, type XlsxHucre, type XlsxSayfa } from "./xlsx-yaz.ts";
import { esc, raporKabugu, sikiTablo } from "./rapor-kabugu.ts";
import { enIyiSec, karsilastir, type Karsilastirma, type KarsilastirmaBaglami } from "./navlun-karsilastirma.ts";

export type NavlunOlayi = {
  tur: string;
  liman: string | null;
  liman_anahtar: string | null;
  acente: string | null;
  armator: string | null;
  tutar: number | null;
  para_birimi: string | null;
  ekipman: string | null;
  free_time_gun: number | null;
  transit_gun?: string | null;
  tarih: string;
  /** 12.11.2026 booking eslestirmesi: olayin geldigi mailin konusu (kabul maili hangi yazismada / kac konteyner) */
  konu?: string | null;
  /** 13.11.2026: teklif metninde lokal dahil (true) / haric (false) yaziyor mu */
  lokal_dahil?: boolean | null;
};

/** Yukleme planindan gerceklesen navlun (PlanSatiri'nin ilgili alanlari) */
export type GerceklesenNavlun = {
  varis_limani: string | null;
  acente: string | null;
  navlun: number | null;
  navlun_para: string | null;
  etd: string | null;
};

export type NavlunHucresi = {
  tutar: number; para: string; ekipman: string; tarih: string; kaynak: "teklif" | "gerceklesen";
  /** 13.11.2026: karsilastirma icin (teklif hucrelerinde) */
  acente?: string | null; lokal_dahil?: boolean | null;
};

export type NavlunBlogu = {
  ad: string;
  /** "YYYY-MM", eski -> yeni */
  aylar: string[];
  /** liman anahtari -> ay -> hucre */
  hucreler: Map<string, Map<string, NavlunHucresi>>;
  /** liman anahtari -> TUM teklifler (13.11.2026: ayni ayda gerceklesen navlun hucreyi alsa da teklif "en iyi" hesabinda kalir) */
  teklifler: Map<string, NavlunHucresi[]>;
  /** liman anahtari -> son free time (gun) */
  freeTime: Map<string, number>;
  /** liman anahtari -> son transit suresi (gun, "46-48") */
  transit: Map<string, string>;
  limanSayisi: number;
};

export type NavlunLimani = {
  anahtar: string; ad: string; hedef: { tutar: number; para: string; tarih: string } | null;
  /** 12.11.2026: bizim acenteye yazdigimiz son anlasma ("Navlun bedeli X olmak uzere" / "Anlasma fiyatimiz X usd") */
  kabul?: { tutar: number; para: string; tarih: string; armator: string | null } | null;
};

export type NavlunTablosu = {
  tarih: string; limanlar: NavlunLimani[]; bloklar: NavlunBlogu[]; gerceklesenVar: boolean;
  /** 13.11.2026: acente hafizasi + rezervasyondan ogrenilen + liman kurallari. Yoksa yalniz mail metni (belirsiz en iyi secilmez). */
  baglam?: KarsilastirmaBaglami | null;
};

const AYLAR = ["OCAK", "ŞUBAT", "MART", "NİSAN", "MAYIS", "HAZİRAN", "TEMMUZ", "AĞUSTOS", "EYLÜL", "EKİM", "KASIM", "ARALIK"];

/** Ayni sirketin farkli yazimlari (plan Excel'i ve mail okuyucusu farkli yaziyor). Yalniz gosterim / gruplama. */
const AD_ESLER: [RegExp, string][] = [
  [/^(KUEHNE|K\s*\+\s*N\b)/, "KUEHNE+NAGEL"],
  [/^CMA/, "CMA-CGM"],
  [/^HAPAG/, "HAPAG"],
  [/^MAA?ERSK/, "MAERSK"],
  [/^Z[İI]M\b/, "ZIM"],
  [/^AKKON/, "AKKON"],
  [/^ONE(\s+LINE)?$/, "ONE"],
  [/^EVERGREEN/, "EVERGREEN"],
];
/** Ayni limanin plan / mail yazimlari (limanAnahtari'na ek; yalniz bu tablo icin) */
// 16.11.2026: sistem proformasi "DAR SALAAM" yaziyor (rapor "teklif yok" dedi); SQL siparis_liman_anahtar ile ayni esler.
const LIMAN_ESLER: Record<string, string> = {
  MALDIVES: "MALE", "DAR ES SELAM": "DAR ES SALAAM", "DAR SALAAM": "DAR ES SALAAM", "DAR ES SALAM": "DAR ES SALAAM", "DARESSALAAM": "DAR ES SALAAM",
};

const buyuk = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleUpperCase("tr-TR");
/** Acente / hat adlari Latin: Ingilizce buyuk harf (13.11.2026: "Link" -> "LINK", "LİNK" degil). */
export function sirketAdi(s: string): string {
  const u = s.trim().replace(/\s+/g, " ").toUpperCase();
  for (const [re, ad] of AD_ESLER) if (re.test(u)) return ad;
  return u;
}
/** "DRAFT" + "Maersk" -> "DRAFT - MAERSK"; acente = armator -> tek ad */
export function blokAdi(acente: string, armator: string | null): string {
  const a = sirketAdi(acente);
  const b = armator && armator.trim() ? sirketAdi(armator) : null;
  return !b || b === a ? a : `${a} - ${b}`;
}
/** Plan Excel'indeki "DRAFT/CMA" -> acente DRAFT, armator CMA */
export function planBlokAdi(acente: string): string {
  const [a, ...b] = acente.split("/");
  return blokAdi(a, b.join("/") || null);
}
/** 16.11.2026: liman / firma es sozlugu (ad_esleri tablosu). Bos kalirsa yukaridaki sabit esler aynen calisir. */
const SOZLUK: { liman: Record<string, string>; firma: Record<string, string> } = { liman: {}, firma: {} };
export type AdEsi = { tur: string; kaynak: string; hedef: string };
export function esleriYukle(esler: AdEsi[]): void {
  SOZLUK.liman = {}; SOZLUK.firma = {};
  for (const e of esler) if ((e.tur === "liman" || e.tur === "firma") && e.kaynak && e.hedef) SOZLUK[e.tur][e.kaynak] = e.hedef;
}
/** SQL siparis_firma_anahtar ile ayni: Turkce harf sadelestirme, harf/rakam disi atilir, buyuk harf. */
export function firmaAnahtari(m: string | null | undefined): string {
  const tr: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "C", Ğ: "G", İ: "I", Ö: "O", Ş: "S", Ü: "U", â: "a", Â: "A", î: "i", Î: "I", û: "u", Û: "U", é: "e", É: "E" };
  const k = (m || "").replace(/[çğıöşüÇĞİÖŞÜâÂîÎûÛéÉ]/g, (h) => tr[h] || h).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return SOZLUK.firma[k] || k;
}
function limanKey(liman: string | null, anahtar?: string | null): string | null {
  const k = anahtar || limanAnahtari(liman);
  return k ? SOZLUK.liman[k] || LIMAN_ESLER[k] || k : null;
}
/** Istanbul saatiyle "YYYY-MM" */
const ayAnahtari = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(0, 7) : new Date(Date.parse(iso) + 3 * 3600000).toISOString().slice(0, 7));

export function ayEtiketi(ay: string, yilli: boolean): string {
  const ad = AYLAR[Number(ay.slice(5, 7)) - 1] || ay;
  return yilli ? `${ad} ${ay.slice(2, 4)}` : ad;
}

export function navlunTablosuHesapla(olaylar: NavlunOlayi[], gerceklesen: GerceklesenNavlun[], tarih: string): NavlunTablosu {
  const limanAd = new Map<string, { ad: string; tarih: string }>();
  const adYaz = (k: string, ad: string, t: string) => { const e = limanAd.get(k); if (!e || t >= e.tarih) limanAd.set(k, { ad: buyuk(ad), tarih: t }); };
  const hedef = new Map<string, NavlunLimani["hedef"]>();
  const kabul = new Map<string, NonNullable<NavlunLimani["kabul"]>>();
  const bloklar = new Map<string, NavlunBlogu>();
  const blok = (ad: string) => {
    let b = bloklar.get(ad);
    if (!b) { b = { ad, aylar: [], hucreler: new Map(), teklifler: new Map(), freeTime: new Map(), transit: new Map(), limanSayisi: 0 }; bloklar.set(ad, b); }
    return b;
  };
  const yaz = (b: NavlunBlogu, k: string, h: NavlunHucresi) => {
    const ay = ayAnahtari(h.tarih);
    let m = b.hucreler.get(k);
    if (!m) { m = new Map(); b.hucreler.set(k, m); }
    const e = m.get(ay);
    const yirmi = (x: NavlunHucresi) => x.ekipman === "20DC";
    // 20'DC her zaman 40'HC'den once; ayni sinifta en son tarih
    if (!e || (yirmi(h) && !yirmi(e)) || (yirmi(h) === yirmi(e) && h.tarih >= e.tarih)) m.set(ay, h);
  };

  const sirali = [...olaylar].sort((a, b) => a.tarih.localeCompare(b.tarih));
  for (const o of sirali) {
    const k = limanKey(o.liman, o.liman_anahtar);
    if (!k) continue;
    if (o.liman) adYaz(k, o.liman, o.tarih);
    if (o.tur === "hedef" && o.tutar) { hedef.set(k, { tutar: o.tutar, para: o.para_birimi || "USD", tarih: o.tarih }); continue; }
    if (o.tur === "kabul" && o.tutar) { kabul.set(k, { tutar: o.tutar, para: o.para_birimi || "USD", tarih: o.tarih, armator: o.armator }); continue; }
    if (!o.acente) continue;
    let tutar = o.tutar, para = o.para_birimi || "USD";
    if (o.tur === "hedef_kabul") { const h = hedef.get(k); if (!h) continue; tutar = h.tutar; para = h.para; }
    else if (o.tur !== "teklif" && o.tur !== "karsi_teklif") continue;
    if (!tutar || tutar <= 0) continue;
    const b = blok(blokAdi(o.acente, o.armator));
    const th: NavlunHucresi = { tutar, para, ekipman: (o.ekipman || "20DC").toUpperCase(), tarih: o.tarih, kaynak: "teklif",
      acente: o.acente, lokal_dahil: o.tur === "hedef_kabul" ? true : o.lokal_dahil ?? null };
    yaz(b, k, th);
    b.teklifler.set(k, [...(b.teklifler.get(k) || []), th]);
    if (o.free_time_gun != null) b.freeTime.set(k, o.free_time_gun);
    if (o.transit_gun) b.transit.set(k, o.transit_gun);
  }
  let gerceklesenVar = false;
  for (const g of gerceklesen) {
    const k = limanKey(g.varis_limani);
    if (!k || !g.etd) continue;
    if (g.varis_limani) adYaz(k, g.varis_limani, "0000");   // mail yazimi varsa o kalir
    if (!g.acente || !g.navlun || g.navlun <= 0) continue;
    gerceklesenVar = true;
    yaz(blok(planBlokAdi(g.acente)), k, { tutar: g.navlun, para: g.navlun_para || "USD", ekipman: "20DC", tarih: g.etd.slice(0, 10), kaynak: "gerceklesen" });
  }

  const liste = Array.from(bloklar.values()).filter((b) => b.hucreler.size);
  for (const b of liste) {
    const aylar = new Set<string>();
    b.hucreler.forEach((m) => m.forEach((_, ay) => aylar.add(ay)));
    b.aylar = Array.from(aylar).sort();
    b.limanSayisi = b.hucreler.size;
  }
  liste.sort((a, b) => b.limanSayisi - a.limanSayisi || a.ad.localeCompare(b.ad, "tr"));
  const limanlar: NavlunLimani[] = Array.from(limanAd.entries())
    .map(([anahtar, v]) => ({ anahtar, ad: v.ad, hedef: hedef.get(anahtar) ?? null, kabul: kabul.get(anahtar) ?? null }))
    .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  return { tarih, limanlar, bloklar: liste, gerceklesenVar };
}

const tarihTr = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Sablondaki duzen: A bos, B PORT, C HEDEF, D'den itibaren bloklar; 2. satir blok adi, 3. satir ay / TRANSIT / FREE TIME. */
export function navlunTablosuSayfasi(t: NavlunTablosu, ad = "NAVLUN TABLOSU"): XlsxSayfa {
  const tumAylar = new Set<string>();
  for (const b of t.bloklar) for (const ay of b.aylar) tumAylar.add(ay);
  const yilli = new Set(Array.from(tumAylar).map((a) => a.slice(0, 4))).size > 1;

  const s1: (XlsxHucre | null)[] = [null, { v: `UNEX NAVLUN TABLOSU · ${tarihTr(t.tarih)}`, s: XS.sayfaBasligi }];
  const s2: (XlsxHucre | null)[] = [null, { v: "", s: XS.navBaslik }, { v: "HEDEF", s: XS.navBaslik }];
  const s3: (XlsxHucre | null)[] = [null, { v: "PORT", s: XS.navBaslik }, { v: "", s: XS.navBaslik }];
  const birlestir = ["C2:C3"];
  const genislik = [2, 27, 11];
  let sutun = 3;
  t.bloklar.forEach((b, i) => {
    const A = i % 2 === 0;
    const bas = sutun;
    const n = b.aylar.length + 2;
    for (let j = 0; j < n; j++) {
      s2.push({ v: j === 0 ? b.ad : "", s: A ? XS.navBlokA : XS.navBlokB });
      const etiket = j < b.aylar.length ? ayEtiketi(b.aylar[j], yilli) : j === b.aylar.length ? "TRANSIT" : "FREE TIME";
      s3.push({ v: etiket, s: A ? XS.navAyA : XS.navAyB });
      genislik.push(j < b.aylar.length ? 11 : 10);
    }
    sutun += n;
    if (n > 1) birlestir.push(`${sutunHarfi(bas)}2:${sutunHarfi(sutun - 1)}2`);
  });

  const satirlar: (XlsxHucre | null)[][] = [s1, s2, s3];
  for (const l of t.limanlar) {
    const r: (XlsxHucre | null)[] = [null, { v: l.ad, s: XS.metin },
      l.hedef ? (l.hedef.para === "USD" ? { v: l.hedef.tutar, s: XS.navHedef } : { v: `${l.hedef.tutar} ${l.hedef.para}`, s: XS.navBaslik }) : { v: "", s: XS.metin }];
    t.bloklar.forEach((b, i) => {
      const A = i % 2 === 0;
      const m = b.hucreler.get(l.anahtar);
      for (const ay of b.aylar) {
        const h = m?.get(ay);
        if (!h) { r.push({ v: "", s: A ? XS.navOrtaA : XS.navOrtaB }); continue; }
        if (h.para === "USD" && h.ekipman === "20DC") {
          r.push({ v: h.tutar, s: h.kaynak === "gerceklesen" ? (A ? XS.navGercekA : XS.navGercekB) : (A ? XS.navTutarA : XS.navTutarB) });
        } else {
          const para = h.para === "USD" ? "$" : h.para === "EUR" ? "€" : h.para;
          r.push({ v: `${h.ekipman === "20DC" ? "" : `${h.ekipman} `}${h.tutar} ${para}`, s: A ? XS.navOrtaA : XS.navOrtaB });
        }
      }
      const tt = b.transit.get(l.anahtar);
      r.push({ v: tt ? (/^\d+$/.test(tt) ? Number(tt) : tt) : "", s: A ? XS.navOrtaA : XS.navOrtaB });
      const ft = b.freeTime.get(l.anahtar);
      r.push({ v: ft ?? "", s: A ? XS.navOrtaA : XS.navOrtaB });
    });
    satirlar.push(r);
  }
  if (!t.limanlar.length) satirlar.push([null, { v: "Sistemde navlun bilgisi yok.", s: XS.not }]);
  satirlar.push([]);
  const not = (v: string) => satirlar.push([null, { v, s: XS.not }]);
  not("Kaynak: acentelerin navlun talebi yazışmalarındaki teklifler (Navlun Bildirimi) — hücre: o ay alınan SON 20'DC fiyatı (USD).");
  if (t.gerceklesenVar) not("Yeşil kalın: gerçekleşen navlun (yükleme planı, rezervasyonu yapılmış yükleme, konteyner başı; ETD ayı).");
  not("HEDEF: operasyonun acenteye yazdığı son hedef fiyat (\"hedef rakamımız …\") · FREE TIME / TRANSIT: acentenin teklifinde yazdığı gün (boş = teklifte belirtilmemiş).");
  not(`Oluşturma: ${tarihTr(t.tarih)} · İhracat AI`);
  return { ad, sutunGenislik: genislik, satirlar, birlestir, dondur: "D4" };
}

/** Mail ozeti icin: limanda guncel (son 60 gun) en iyi 20'DC teklif */
/** Teklif hucresinin karsilastirma tutari (lib/navlun ile ayni hesap). */
export function hucreKarsilastir(h: NavlunHucresi, limanAnahtar: string, baglam: KarsilastirmaBaglami | null | undefined): Karsilastirma {
  return karsilastir({ acente: h.acente ?? null, tutar: h.tutar, ekipman: h.ekipman, lokal_dahil: h.lokal_dahil ?? null, liman_anahtar: limanAnahtar }, baglam ?? null);
}

export type GuncelEnIyi = {
  /** tutar = karsilastirma tutari (navlun + lokal + ek); metin = "340 + lokal 356 = 696" */
  liman: string; blok: string; tutar: number; tarih: string; freeTime: number | null; transit: string | null; hedef: number | null; teklifSayisi: number;
  metin?: string;
  /** Limana EN SON gelen teklif (hangi acenteden olursa olsun) - her raporda en son alinan rakam (11.11.2026) */
  son: { blok: string; tutar: number; tarih: string } | null;
};
export function guncelEnIyiler(t: NavlunTablosu, gun = 60): GuncelEnIyi[] {
  const sinir = new Date(Date.parse(`${t.tarih}T12:00:00Z`) - gun * 86400000).toISOString().slice(0, 10);
  const out: GuncelEnIyi[] = [];
  for (const l of t.limanlar) {
    let sonGelen: GuncelEnIyi["son"] = null;
    let sayi = 0;
    const adaylar: { b: NavlunBlogu; h: NavlunHucresi; k: Karsilastirma }[] = [];
    for (const b of t.bloklar) {
      const m = b.teklifler.get(l.anahtar);
      if (!m) continue;
      const son = m.filter((h) => h.kaynak === "teklif" && h.ekipman === "20DC" && h.para === "USD" && h.tarih.slice(0, 10) >= sinir)
        .sort((a, c) => c.tarih.localeCompare(a.tarih))[0];
      if (!son) continue;
      sayi++;
      if (!sonGelen || son.tarih > sonGelen.tarih) sonGelen = { blok: b.ad, tutar: son.tutar, tarih: son.tarih };
      adaylar.push({ b, h: son, k: hucreKarsilastir(son, l.anahtar, t.baglam) });
    }
    // 13.11.2026: yalniz lokali kesin teklifler arasinda en dusuk karsilastirma tutari
    const { enIyi } = enIyiSec(adaylar, (x) => x.k);
    if (enIyi) out.push({ liman: l.ad, blok: enIyi.b.ad, tutar: enIyi.k.toplam, metin: enIyi.k.metin, tarih: enIyi.h.tarih, freeTime: enIyi.b.freeTime.get(l.anahtar) ?? null,
      transit: enIyi.b.transit.get(l.anahtar) ?? null, hedef: l.hedef?.tutar ?? null, teklifSayisi: sayi, son: sonGelen });
  }
  return out.sort((a, b) => a.liman.localeCompare(b.liman, "tr"));
}

/** Belirli andan sonra gelen teklifler (en yeni ustte) - raporun "son rapordan beri gelenler" bolumu. */
export type SonTeklif = { liman: string; blok: string; tutar: number; para: string; ekipman: string; tarih: string; freeTime: number | null; transit: string | null };
export function sonTeklifler(t: NavlunTablosu, sonraIso: string, adet = 30): SonTeklif[] {
  const out: SonTeklif[] = [];
  const adlar = new Map(t.limanlar.map((l) => [l.anahtar, l.ad]));
  for (const b of t.bloklar) {
    b.hucreler.forEach((m, k) => m.forEach((h) => {
      if (h.kaynak !== "teklif" || h.tarih <= sonraIso) return;
      out.push({ liman: adlar.get(k) || k, blok: b.ad, tutar: h.tutar, para: h.para, ekipman: h.ekipman, tarih: h.tarih, freeTime: b.freeTime.get(k) ?? null, transit: b.transit.get(k) ?? null });
    }));
  }
  return out.sort((a, b) => b.tarih.localeCompare(a.tarih)).slice(0, adet);
}

/**
 * NAVLUN SATIN ALMA LISTESI (12.11.2026, kullanici: "Navlun raporu icin navlun odeme / satin alma listesi; guncel yukleme
 * planimizla orantili olmali. Navlun icin yapilan satin alimi tespit edemez miyiz?").
 * Satir = yukleme planindaki rezervasyonu alinmis (booking'li) ve ETD'si bugun ya da ileride (ETD'siz olanlar en sonda) yukleme.
 * Navlun kaynagi (tahmin YOK):
 *   1) plan / dosya: yukleme planindaki konteyner basi navlun (dosya acildiysa dosyadan)
 *   2) anlasma maili: bizden acenteye giden kabul ("Anlasma fiyatimiz X usd", "Navlun bedeli X olmak uzere"); ayni liman,
 *      hat uyumlu, ETD'den once ve en fazla 90 gun once yazilmis EN SON kabul
 *   3) yoksa "belirsiz" (toplam disi; operasyon tamamlar)
 * Ayrica limanin bugunku en iyi teklifi (karsilastirma) ve rezervasyon bekleyen on odemeli siparisler.
 */
export type PlanNavlunSatiri = GerceklesenNavlun & {
  kaynak: string | null; booking_no: string | null; musteri: string | null; konteyner: number | null; dosya_no: string | null;
  /** Excel'deki hafta (ETD'si bos satirda: yalniz bu hafta / ileride ise listelenir; eski kayit girmez) */
  hafta?: number | null; yil?: number | null;
};

/** Lojistigin hafta kurali (Pazar baslar, 1 Ocak'i iceren hafta 1) - siparis-liste.ts haftaNo ile ayni. */
function haftaSirasi(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const gun = Math.round((Date.UTC(y, Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) - Date.UTC(y, 0, 1)) / 86400000);
  return y * 100 + Math.floor((gun + new Date(Date.UTC(y, 0, 1)).getUTCDay()) / 7) + 1;
}
export type SatinAlmaSatiri = {
  etd: string | null; booking: string; musteri: string | null; liman: string; limanAnahtar: string; blok: string; konteyner: number;
  navlun: number | null; para: string; toplam: number | null;
  kaynak: "dosya" | "plan" | "anlasma" | "belirsiz"; kaynakTarih: string | null;
  /** Anlasma maili ile nasil eslesti: booking no ayni yazismada / rezervasyon talebi (liman + konteyner) / yalniz liman */
  eslesme: "booking" | "rezervasyon" | "liman" | null;
  enIyi: { tutar: number; blok: string } | null;
};
/** Rezervasyon bekleyen (on odemesi alinmis, booking'i yok) siparis: navlunu henuz satin alinmadi (12.11.2026). */
export type BekleyenSatiri = { musteri: string | null; liman: string; limanAnahtar: string | null; konteyner: number; siparis: number; enIyi: { tutar: number; blok: string } | null;
  /** Guncel teklif yoksa limandaki son anlasma (bizden acenteye giden kabul) - bilgi amacli */
  anlasma: { tutar: number; tarih: string } | null };
export type NavlunSatinAlma = {
  satirlar: SatinAlmaSatiri[];
  toplam: Record<string, number>; konteyner: number; belirsiz: number;
  bekleyen: { siparis: number; konteyner: number };
  /** 12.11.2026 kullanici: "Rezervasyon bekleyen musteriler alt kisimda kendi basligi altinda" */
  bekleyenler: BekleyenSatiri[];
  /** 16.11.2026: navlun alinacak / alinmis limanlardan son 30 gunde en fazla TEK acenteden teklif olanlar ("yeni talep acin") */
  tekTeklif: TekTeklifLimani[];
};
export type TekTeklifLimani = {
  liman: string; limanAnahtar: string; bekleyenKont: number; bookingKont: number;
  /** Son 30 gunde 20'DC USD teklif veren acente / hat bloklari (0 ya da 1) */
  acenteler: string[]; enIyi: { tutar: number; blok: string } | null; sonTeklif: string | null;
};
/** Bir limanda son `gun` gunde 20'DC USD teklif veren bloklar (acente / hat) ve en son teklif tarihi. */
export function limanTeklifVerenleri(t: NavlunTablosu, anahtar: string, gun = 30): { bloklar: string[]; son: string | null } {
  const sinir = new Date(Date.parse(`${t.tarih}T12:00:00Z`) - gun * 86400000).toISOString().slice(0, 10);
  const bloklar: string[] = [];
  let son: string | null = null;
  for (const b of t.bloklar) {
    const h = (b.teklifler.get(anahtar) || []).filter((x) => x.kaynak === "teklif" && x.ekipman === "20DC" && x.para === "USD");
    for (const x of h) if (!son || x.tarih > son) son = x.tarih;
    if (h.some((x) => x.tarih.slice(0, 10) >= sinir)) bloklar.push(b.ad);
  }
  return { bloklar, son };
}

/** Konudaki booking numaralari ("123456789 + 987654321", "ABC1234567", "XYZAB12345678"). */
export function konuBookingleri(konu: string | null | undefined): string[] {
  return Array.from(new Set((buyuk(konu || "").match(/\b[A-Z]{0,8}\d{7,12}\b/g) || [])));
}
/** Yazisma anahtari: RE/FW onekleri ve booking numarali parcalar atilmis konu ("UNEX // <LIMAN> // NAVLUN TALEBİ HK."). */
export function yazismaAnahtari(konu: string | null | undefined): string {
  return buyuk(konu || "").replace(/^((RE|FW|FWD|YNT|TR)\s*:\s*)+/i, "").split("//").map((x) => x.trim())
    .filter((x) => x && !/^[A-Z]{0,8}\d{7,12}(\s*\+\s*[A-Z]{0,8}\d{7,12})*$/.test(x)).join(" // ");
}
/** Konudaki konteyner adedi ("8*20 DC" -> 8). */
export function konuKonteyner(konu: string | null | undefined): number | null {
  const m = buyuk(konu || "").match(/(?:^|\/\/)\s*(\d{1,3})\s*[*X×]\s*(?:20|40|45)\b/);
  return m ? Number(m[1]) : null;
}

/** tumKonular: TUM navlun maillerinin konulari (olay cikmayan acente yazismalari dahil; booking no cogu zaman orada gecer). */
export function navlunSatinAlma(t: NavlunTablosu, plan: PlanNavlunSatiri[], olaylar: NavlunOlayi[], tumKonular: (string | null)[] = []): NavlunSatinAlma {
  const enIyiler = new Map(limanSatirlari(t).filter((x) => !x.eski).map((x) => [x.liman, x.enIyi]));
  const adlar = new Map(t.limanlar.map((l) => [l.anahtar, l.ad]));
  const kabuller = olaylar.filter((o) => o.tur === "kabul" && o.tutar && o.tutar > 0)
    .map((o) => ({ k: limanKey(o.liman, o.liman_anahtar), tutar: o.tutar as number, para: o.para_birimi || "USD", tarih: o.tarih, armator: o.armator ? sirketAdi(o.armator) : null,
      yazisma: yazismaAnahtari(o.konu), rezervasyon: /REZERVASYON\s*TALEB/.test(buyuk(o.konu || "")), kont: konuKonteyner(o.konu) }))
    .sort((a, b) => b.tarih.localeCompare(a.tarih));
  // Booking no -> gectigi yazismalar (tum navlun maillerinin konularindan; ornek "UNEX // <LIMAN> // NAVLUN TALEBI HK. //123456789")
  const bookingYazisma = new Map<string, Set<string>>();
  for (const konu of [...tumKonular, ...olaylar.map((o) => o.konu ?? null)]) for (const b of konuBookingleri(konu)) {
    if (!bookingYazisma.has(b)) bookingYazisma.set(b, new Set());
    bookingYazisma.get(b)!.add(yazismaAnahtari(konu));
  }
  const satirlar: SatinAlmaSatiri[] = [];
  for (const p of plan) {
    if (p.kaynak === "siparis") continue;
    const booking = (p.booking_no || "").trim();
    const etd = p.etd ? p.etd.slice(0, 10) : null;
    if (!booking || (etd && etd < t.tarih)) continue;
    // ETD'si bos: yalniz haftasi bu hafta / ileride olan (Excel'de tarihi okunamamis eski kayit listeye girmez)
    if (!etd && !(p.hafta && p.yil && p.yil * 100 + p.hafta >= haftaSirasi(t.tarih))) continue;
    const k = limanKey(p.varis_limani);
    if (!k) continue;
    const blok = p.acente ? planBlokAdi(p.acente) : "-";
    const kont = p.konteyner || 0;
    let navlun: number | null = p.navlun && p.navlun > 0 ? p.navlun : null;
    let para = p.navlun_para || "USD";
    let kaynak: SatinAlmaSatiri["kaynak"] = navlun ? (p.dosya_no ? "dosya" : "plan") : "belirsiz";
    let kaynakTarih: string | null = null;
    let eslesme: SatinAlmaSatiri["eslesme"] = null;
    if (!navlun) {
      // Eslesme onceligi (12.11.2026): 1) booking no ayni yazismada gecen anlasma  2) ayni liman + ayni konteyner adetli
      // rezervasyon talebi  3) ayni limandaki son anlasma. Hepsinde: ETD'den once, en fazla 90 gun once, hat uyumlu.
      const sinir = etd ? new Date(Date.parse(`${etd}T12:00:00Z`) - 90 * 86400000).toISOString() : null;
      const adaylar = kabuller.filter((x) => x.k === k && (!etd || x.tarih.slice(0, 10) <= etd) && (!sinir || x.tarih >= sinir)
        && (!x.armator || blok.split(" - ").some((b) => b === x.armator || b.startsWith(x.armator!) || x.armator!.startsWith(b))));
      const yazismalar = bookingYazisma.get(buyuk(booking)) || new Set<string>();
      const secilen: [typeof adaylar[number] | undefined, SatinAlmaSatiri["eslesme"]][] = [
        [adaylar.find((x) => yazismalar.has(x.yazisma)), "booking"],
        [adaylar.find((x) => x.rezervasyon && x.kont !== null && x.kont === kont), "rezervasyon"],
        [adaylar[0], "liman"],
      ];
      const bulunan = secilen.find(([x]) => !!x);
      if (bulunan && bulunan[0]) { const u = bulunan[0]; navlun = u.tutar; para = u.para; kaynak = "anlasma"; kaynakTarih = u.tarih; eslesme = bulunan[1]; }
    }
    const ad = adlar.get(k) || (p.varis_limani || k).toLocaleUpperCase("tr-TR");
    const e = enIyiler.get(ad);
    satirlar.push({
      etd, booking, musteri: p.musteri, liman: ad, limanAnahtar: k, blok, konteyner: kont, navlun, para,
      toplam: navlun !== null ? navlun * kont : null, kaynak, kaynakTarih, eslesme, enIyi: e ? { tutar: e.tutar, blok: e.blok } : null,
    });
  }
  // Rezervasyon bekleyenler: yukleme_plani_veri 'siparis' satirlari = siparis_listesi_veri'de "on_odeme_alindi" kalanlar.
  // 13.11.2026: booking'i planda olan siparis VERITABANINDA "rezervasyonlu" sayilir (migration 20261113010000; sayfa, siparis
  // raporu ve bu rapor ayni kurali gorur). 12.11'deki rapor ici musteri+liman dusumu kaldirildi (ayni proformadaki baska
  // siparisin booking'ini de sayiyordu).
  const musteriAnahtari = (m: string | null) => firmaAnahtari(m);   // 16.11.2026: SQL ile ayni anahtar + es sozlugu
  let bekleyenSiparis = 0, bekleyenKont = 0;
  const bekleyenler: BekleyenSatiri[] = [];
  for (const p of plan) {
    if (p.kaynak !== "siparis") continue;
    const bk = limanKey(p.varis_limani);
    const kont = p.konteyner || 0;
    bekleyenSiparis++; bekleyenKont += kont;
    const bad = bk ? adlar.get(bk) || (p.varis_limani || bk).toLocaleUpperCase("tr-TR") : (p.varis_limani || "-").toLocaleUpperCase("tr-TR");
    const be = enIyiler.get(bad);
    // Ayni musteri + ayni liman tek satir (orn. 11 ayri siparis -> "11 sipariş")
    // 16.11.2026: ayni firmanin kisa / uzun yazimi ("COOL LINK" / "COOL LINK& MARKETING PTE LTD") tek satir: biri digerinin basi
    const ayniFirma = (x: string, y: string) => x === y || (Math.min(x.length, y.length) >= 6 && (x.startsWith(y) || y.startsWith(x)));
    const var_ = bekleyenler.find((b) => b.limanAnahtar === bk && b.liman === bad && ayniFirma(musteriAnahtari(b.musteri), musteriAnahtari(p.musteri)));
    if (var_) { var_.konteyner += kont; var_.siparis++; continue; }
    const kb = bk ? t.limanlar.find((l) => l.anahtar === bk)?.kabul : null;
    bekleyenler.push({ musteri: p.musteri, liman: bad, limanAnahtar: bk, konteyner: kont, siparis: 1, enIyi: be ? { tutar: be.tutar, blok: be.blok } : null,
      anlasma: kb && kb.para === "USD" ? { tutar: kb.tutar, tarih: kb.tarih } : null });
  }
  satirlar.sort((a, b) => (a.etd || "9999").localeCompare(b.etd || "9999") || a.liman.localeCompare(b.liman, "tr") || a.booking.localeCompare(b.booking));
  // 16.11.2026 (CEO onerisi, kullanici onayi): talebi olan limanda (rezervasyon bekleyen ya da yaklasan booking) son 30 gunde
  // en fazla tek acenteden teklif varsa uyari: karar tek teklifle veriliyor, yeni navlun talebi acilmali.
  const talep = new Map<string, { liman: string; bekleyen: number; booking: number }>();
  for (const b of bekleyenler) if (b.limanAnahtar) {
    const x = talep.get(b.limanAnahtar) || { liman: b.liman, bekleyen: 0, booking: 0 }; x.bekleyen += b.konteyner; talep.set(b.limanAnahtar, x);
  }
  for (const x of satirlar) {
    const y = talep.get(x.limanAnahtar) || { liman: x.liman, bekleyen: 0, booking: 0 }; y.booking += x.konteyner; talep.set(x.limanAnahtar, y);
  }
  const tekTeklif: TekTeklifLimani[] = [];
  for (const [k, v] of Array.from(talep.entries())) {
    const tv = limanTeklifVerenleri(t, k, 30);
    if (tv.bloklar.length > 1) continue;
    const e = enIyiler.get(v.liman);
    tekTeklif.push({ liman: v.liman, limanAnahtar: k, bekleyenKont: v.bekleyen, bookingKont: v.booking, acenteler: tv.bloklar,
      enIyi: e ? { tutar: e.tutar, blok: e.blok } : null, sonTeklif: tv.son });
  }
  tekTeklif.sort((a, b) => (b.bekleyenKont + b.bookingKont) - (a.bekleyenKont + a.bookingKont) || a.liman.localeCompare(b.liman, "tr"));
  const toplam: Record<string, number> = {};
  for (const x of satirlar) if (x.toplam !== null) toplam[x.para] = (toplam[x.para] || 0) + x.toplam;
  return {
    satirlar, toplam, konteyner: satirlar.reduce((a, x) => a + x.konteyner, 0), belirsiz: satirlar.filter((x) => x.kaynak === "belirsiz").length,
    bekleyen: { siparis: bekleyenSiparis, konteyner: bekleyenKont },
    bekleyenler: bekleyenler.sort((a, b) => a.liman.localeCompare(b.liman, "tr") || (a.musteri || "").localeCompare(b.musteri || "", "tr")),
    tekTeklif,
  };
}

/** "UNEX NAVLUN SATIN ALMA LİSTESİ · 12.11.2026" - Excel basligi ve ek dosya adi (12.11.2026 kullanici). */
export const satinAlmaBasligi = (tarih: string) => `UNEX NAVLUN SATIN ALMA LİSTESİ · ${tarihTr(tarih)}`;

/** Navlun raporunun Excel eki: navlun satin alma listesi + rezervasyon bekleyen musteriler. */
export function satinAlmaSayfasi(sa: NavlunSatinAlma, tarih: string, ad = "NAVLUN SATIN ALMA"): XlsxSayfa {
  const KAYNAK: Record<SatinAlmaSatiri["kaynak"], string> = { dosya: "Dosya", plan: "Yükleme planı", anlasma: "Anlaşma maili", belirsiz: "Navlun bilgisi yok" };
  const ESLESME: Record<NonNullable<SatinAlmaSatiri["eslesme"]>, string> = { booking: "booking no aynı yazışmada", rezervasyon: "rezervasyon talebi (liman + konteyner)", liman: "aynı limandaki son anlaşma" };
  const satirlar: (XlsxHucre | null)[][] = [
    [{ v: satinAlmaBasligi(tarih), s: XS.sayfaBasligi }],
    ["ETD", "BOOKING", "MÜŞTERİ", "VARIŞ LİMANI", "ACENTE / HAT", "KONT.", "NAVLUN / KONT.", "TOPLAM NAVLUN", "PARA", "KAYNAK", "GÜNCEL EN İYİ 20'DC"].map((v) => ({ v, s: XS.tabloBaslik })),
  ];
  for (const x of sa.satirlar) {
    satirlar.push([
      { v: x.etd ? new Date(`${x.etd}T12:00:00`) : "ETD yok", s: x.etd ? XS.tarih : XS.metin }, { v: x.booking, s: XS.metin }, { v: x.musteri || "", s: XS.metin },
      { v: x.liman, s: XS.metin }, { v: x.blok, s: XS.metin }, { v: x.konteyner, s: XS.tamSayi },
      { v: x.navlun, s: XS.tamSayi }, { v: x.toplam, s: XS.tamSayi }, { v: x.para, s: XS.metin },
      { v: KAYNAK[x.kaynak] + (x.eslesme ? ` · ${ESLESME[x.eslesme]}` : "") + (x.kaynakTarih ? ` (${tarihTr(x.kaynakTarih.slice(0, 10))})` : ""), s: XS.metin },
      { v: x.enIyi ? `${x.enIyi.tutar} $ · ${x.enIyi.blok}` : "", s: XS.metin },
    ]);
  }
  const top = Object.entries(sa.toplam).map(([p, v]) => `${v.toLocaleString("tr-TR")} ${p}`).join(" + ");
  satirlar.push([{ v: "TOPLAM", s: XS.toplamMetin }, { v: "", s: XS.toplamMetin }, { v: "", s: XS.toplamMetin }, { v: "", s: XS.toplamMetin }, { v: "", s: XS.toplamMetin },
    { v: sa.konteyner, s: XS.toplamTamSayi }, { v: "", s: XS.toplamMetin }, { v: top || "-", s: XS.toplamMetin }, { v: "", s: XS.toplamMetin }, { v: sa.belirsiz ? `${sa.belirsiz} booking navlunsuz` : "", s: XS.toplamMetin }, { v: "", s: XS.toplamMetin }]);
  satirlar.push([]);
  satirlar.push([{ v: "Satır = yükleme planında booking'i alınmış, ETD'si bugün / ileride yükleme. Navlun: dosya / yükleme planı; yoksa acenteye yazılan son anlaşma maili. Tahmin yoktur.", s: XS.not }]);
  const birlestir = ["A1:K1"];
  if (sa.bekleyenler.length) {
    satirlar.push([]);
    satirlar.push([{ v: `REZERVASYON BEKLEYEN MÜŞTERİLER · ${sa.bekleyen.siparis} sipariş · ${sa.bekleyen.konteyner} kont. (ön ödemesi alındı, navlunu henüz satın alınmadı)`, s: XS.baslik }]);
    birlestir.push(`A${satirlar.length}:K${satirlar.length}`);
    // Sutunlar ust tabloyla hizali: C musteri, D liman, E en iyi teklifin acentesi, F kont., G guncel en iyi 20'DC
    satirlar.push(["", "", "MÜŞTERİ", "VARIŞ LİMANI", "EN İYİ TEKLİF (ACENTE / HAT)", "KONT.", "GÜNCEL EN İYİ 20'DC"].map((v) => ({ v, s: XS.tabloBaslik })));
    for (const b of sa.bekleyenler) {
      satirlar.push([{ v: "", s: XS.metin }, { v: "", s: XS.metin }, { v: `${b.musteri || ""}${b.siparis > 1 ? ` (${b.siparis} sipariş)` : ""}`, s: XS.metin }, { v: b.liman, s: XS.metin },
        { v: b.enIyi ? b.enIyi.blok : b.anlasma ? `teklif yok · son anlaşma ${tarihTr(b.anlasma.tarih.slice(0, 10))}` : "teklif yok", s: XS.metin }, { v: b.konteyner, s: XS.tamSayi },
        { v: b.enIyi ? b.enIyi.tutar : b.anlasma ? b.anlasma.tutar : null, s: XS.tamSayi }]);
    }
  }
  return { ad, sutunGenislik: [11, 17, 26, 18, 22, 7, 14, 14, 7, 22, 22], satirlar, birlestir, dondur: "A3" };
}

const usd = (n: number) => `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} $`;
export const NAVLUN_TABLOSU_URL = "https://ihracatasistanim.com";

/** Toplu navlun tablosu ekinin adi (Navlun Bildirimi > "Excel indir" ile ayni ad); 13.11.2026: her gunku navlun mailinin ikinci eki. */
export const navlunTablosuDosyaAdi = (tarih: string) => `Navlun_Tablosu_${tarihTr(tarih)}.xlsx`;

export function navlunTablosuKonusu(t: NavlunTablosu, sirketAdi = "Unex Gıda", sa?: NavlunSatinAlma | null): string {
  if (sa) {
    const top = Object.entries(sa.toplam).map(([p, v]) => (p === "USD" ? usd(v) : `${v.toLocaleString("tr-TR")} ${p}`)).join(" + ");
    return `${sirketAdi} Navlun Raporu · ${tarihTr(t.tarih)} · ${sa.satirlar.length} booking · ${sa.konteyner} kont.${top ? ` · ${top} navlun` : ""}`;
  }
  return `${sirketAdi} Navlun Tablosu · ${tarihTr(t.tarih)} · ${t.limanlar.length} liman · ${t.bloklar.length} acente/hat`;
}

export type NavlunRaporSecenek = {
  /** Bir onceki raporun gonderim ani: bu andan sonra gelen teklifler "YENI" isaretlenir ve ayri listelenir */
  oncekiIso?: string | null;
  /** "Sabah raporu" / "Akşam raporu" */
  oturumEtiketi?: string | null;
  /** 12.11.2026: navlun satin alma listesi (verilirse mailin ana bolumu budur; tum fiyatlar "Diger navlun fiyatlari" ile sayfada) */
  satinAlma?: NavlunSatinAlma | null;
};

/**
 * Mail tablosu satiri (11.11.2026, kullanici: "her zaman guncel navlun fiyatlari ayni tasarimda; hepsini tek sayfaya
 * sigdir, siki tablo"): TUM limanlar. En iyi = her blogun SON 20'DC USD teklifi; son 60 gunde teklif varsa yalniz onlar,
 * yoksa en son teklif (eski = gri). Son = limana en son gelen teklif (hangi acenteden olursa olsun).
 */
export type LimanSatiri = {
  /** enIyi.tutar = karsilastirma tutari (navlun + lokal + ek), metin = aciklama; belirsiz = lokali kesin olmayan daha ucuz teklif */
  liman: string; enIyi: { blok: string; tutar: number; tarih: string; metin?: string } | null; eski: boolean;
  belirsiz?: { blok: string; tutar: number; tarih: string; metin: string } | null;
  freeTime: number | null; transit: string | null; hedef: number | null;
  son: { blok: string; tutar: number; tarih: string } | null; teklifSayisi: number;
  /** Son anlasilan navlun (bizden giden kabul maili), 12.11.2026 */
  anlasilan: { tutar: number; tarih: string } | null;
};
export function limanSatirlari(t: NavlunTablosu, gun = 60): LimanSatiri[] {
  const sinir = new Date(Date.parse(`${t.tarih}T12:00:00Z`) - gun * 86400000).toISOString().slice(0, 10);
  return t.limanlar.map((l) => {
    const sonlar: { b: NavlunBlogu; h: NavlunHucresi }[] = [];
    for (const b of t.bloklar) {
      const m = b.teklifler.get(l.anahtar);
      if (!m) continue;
      const h = m.filter((x) => x.kaynak === "teklif" && x.ekipman === "20DC" && x.para === "USD").sort((x, y) => y.tarih.localeCompare(x.tarih))[0];
      if (h) sonlar.push({ b, h });
    }
    const guncel = sonlar.filter((x) => x.h.tarih.slice(0, 10) >= sinir);
    const havuz = (guncel.length ? guncel : sonlar).map((x) => ({ ...x, k: hucreKarsilastir(x.h, l.anahtar, t.baglam) }));
    // 13.11.2026: en iyi = lokali kesin teklifler arasinda en dusuk karsilastirma tutari (Beyrut: 340 + lokal 356 = 696)
    const secim = enIyiSec(havuz, (x) => x.k);
    const en = secim.enIyi;
    const bel = secim.belirsiz && (!en || secim.belirsiz.k.toplam < en.k.toplam) ? secim.belirsiz : null;
    const sonGelen = [...sonlar].sort((x, y) => y.h.tarih.localeCompare(x.h.tarih))[0];
    return {
      liman: l.ad, enIyi: en ? { blok: en.b.ad, tutar: en.k.toplam, tarih: en.h.tarih, metin: en.k.metin } : null, eski: !guncel.length && !!(en || bel),
      belirsiz: bel ? { blok: bel.b.ad, tutar: bel.h.tutar, tarih: bel.h.tarih, metin: bel.k.metin } : null,
      freeTime: en ? en.b.freeTime.get(l.anahtar) ?? null : null, transit: en ? en.b.transit.get(l.anahtar) ?? null : null,
      hedef: l.hedef?.para === "USD" ? l.hedef.tutar : null,
      anlasilan: l.kabul && l.kabul.para === "USD" ? { tutar: l.kabul.tutar, tarih: l.kabul.tarih } : null,
      son: sonGelen ? { blok: sonGelen.b.ad, tutar: sonGelen.h.tutar, tarih: sonGelen.h.tarih } : null, teklifSayisi: guncel.length,
    };
  }).filter((x) => x.enIyi || x.belirsiz).sort((a, b) => (a.eski ? 1 : 0) - (b.eski ? 1 : 0) || a.liman.localeCompare(b.liman, "tr"));
}

export function navlunTablosuHtml(t: NavlunTablosu, sirketAdi = "Unex Gıda", secenek: NavlunRaporSecenek = {}): string {
  const satirlar = limanSatirlari(t);
  const sinir = secenek.oncekiIso || new Date(Date.parse(`${t.tarih}T12:00:00Z`) - 48 * 3600000).toISOString();
  const kisa = (iso: string) => { const d = new Date(Date.parse(iso) + 3 * 3600000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)}`; };
  const kes = (x: string, n: number) => (x.length > n ? `${x.slice(0, n - 1)}…` : x);

  const yeniRozet = `<span style="display:inline-block;margin-left:3px;padding:0 4px;border-radius:3px;background:#DCFCE7;color:#166534;font-size:8.5px;font-weight:bold">YENİ</span>`;
  const tablo = sikiTablo(
    [{ ad: "Liman" }, { ad: "En iyi 20'DC", sag: true }, { ad: "Acente / Hat" }, { ad: "FT", sag: true }, { ad: "TT", sag: true }, { ad: "Hedef", sag: true }, { ad: "Anlaşılan", sag: true }, { ad: "Son gelen" }],
    satirlar.map((x) => {
      const gri = x.eski ? "color:#94A3B8;" : "";
      const fark = x.hedef !== null && !x.eski && x.enIyi ? x.enIyi.tutar - x.hedef : null;
      // 13.11.2026: en iyi = lokal dahil karsilastirma tutari; lokali belirsiz (daha ucuz) teklif ayrica yazilir, en iyi sayilmaz
      const enIyiHucre = x.enIyi
        ? `<b style="color:${x.eski ? "#94A3B8" : "#047857"}">${usd(x.enIyi.tutar)}</b>${x.eski ? ` <span style="font-size:9.5px">(${kisa(x.enIyi.tarih)})</span>` : ""}`
          + (x.enIyi.metin && x.enIyi.metin !== "lokal dahil" ? `<br><span style="font-size:9.5px;color:#64748B">${esc(x.enIyi.metin)}</span>` : "")
        : "";
      const belirsizHucre = x.belirsiz ? `<span style="font-size:9.5px;color:#7C3AED">${x.enIyi ? "" : "? "}${usd(x.belirsiz.tutar)} ${esc(kes(x.belirsiz.blok, 12))}: ${esc(x.belirsiz.metin)}</span>` : "";
      return [
        `<b style="${gri}">${esc(kes(x.liman, 22))}</b>`,
        [enIyiHucre, belirsizHucre].filter(Boolean).join("<br>"),
        x.enIyi ? `<span style="${gri}">${esc(kes(x.enIyi.blok, 18))}</span>` : `<span style="color:#7C3AED">lokal belirsiz</span>`,
        x.freeTime !== null ? `${x.freeTime}` : `<span style="color:#CBD5E1">-</span>`,
        x.transit ? esc(x.transit) : `<span style="color:#CBD5E1">-</span>`,
        x.hedef !== null ? `<span style="color:${fark === null ? "#64748B" : fark <= 0 ? "#047857" : "#B45309"}">${usd(x.hedef)}</span>` : `<span style="color:#CBD5E1">-</span>`,
        x.anlasilan ? `<b style="color:#283474">${usd(x.anlasilan.tutar)}</b> <span style="color:#64748B">· ${kisa(x.anlasilan.tarih)}</span>` : `<span style="color:#CBD5E1">-</span>`,
        x.son ? `${usd(x.son.tutar)} <span style="color:#64748B">· ${esc(kes(x.son.blok, 12))} · ${kisa(x.son.tarih)}</span>${x.son.tarih > sinir ? yeniRozet : ""}` : "-",
      ];
    }),
    `Güncel navlun fiyatları · ${satirlar.length} liman`,
  );
  const sa = secenek.satinAlma;
  if (sa) {
    // 12.11.2026: mailin ana bolumu navlun satin alma listesi; tum limanlarin fiyatlari "Diger navlun fiyatlari" ile sayfada
    return raporKabugu({
      sirketAdi, baslik: "Navlun Raporu", tarih: tarihTr(t.tarih), oturum: secenek.oturumEtiketi || null,
      ozetAlt: "", maddeler: [], ozetYok: true, ekBolum: satinAlmaHtml(sa),
      dugme: { metin: "Navlun Evreni", yol: "/navlun" },
      dipnot: `Satın alınan = yükleme planında booking'i alınmış, ETD'si bugün / ileride yükleme; navlun dosya / yükleme planından, yoksa acenteye yazdığımız son anlaşma mailinden (tahmin yok). Güncel en iyi = son 60 günün en düşük 20'DC teklifi; karşılaştırma lokal dahil (navlun + çıkış lokali + VGM / mühür, KDV hariç; acente hafızası), lokali belirsiz teklif en iyi sayılmaz.<br>Ekte iki Excel: ${satinAlmaBasligi(t.tarih)} ve ${navlunTablosuDosyaAdi(t.tarih)} (bütün navlunlar; Navlun Bildirimi › Excel indir ile aynı). Her gün 17:00 · müşteriye gitmez.`,
    });
  }
  return raporKabugu({
    sirketAdi, baslik: "Navlun Raporu", tarih: tarihTr(t.tarih), oturum: secenek.oturumEtiketi || null,
    // 12.11.2026 kullanici: "Navlun raporundan otomatik ozet kismini kaldiralim." -> yalniz guncel fiyat tablosu
    ozetAlt: "", maddeler: [], ozetYok: true, ekBolum: tablo,
    dugme: { metin: "Navlun Bildirimi'ni aç", yol: "/navlun" },
    dipnot: `En iyi = son 60 günde her acentenin son 20'DC teklifi içinde lokal dahil karşılaştırma tutarı en düşük olanı (navlun + çıkış lokali + VGM / mühür, KDV hariç; acente hafızası); lokali belirsiz teklif en iyi sayılmaz (mor). Gri = 60 günden eski. Yeşil hedef = teklif hedefte/altında. Anlaşılan = acenteye yazdığımız son anlaşma fiyatı.<br>Ekteki Excel operasyonun navlun tablosu düzeninde. Her gün 08:00 ve 17:00 · müşteriye gitmez.`,
  });
}

/**
 * Mail: iki bolum (12.11.2026 kullanici): ustte "Satin Alinan Navlunlar" (musteri dahil), altta "Rezervasyon Bekleyen Musteriler".
 * Liman adi /navlun?liman= baglantisi (o limanin masasi acilir).
 */
export function satinAlmaHtml(sa: NavlunSatinAlma): string {
  const kisa = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
  const kes = (x: string, n: number) => (x.length > n ? `${x.slice(0, n - 1)}…` : x);
  const para = (v: number, p: string) => (p === "USD" ? usd(v) : `${v.toLocaleString("tr-TR")} ${p}`);
  const KAYNAK: Record<SatinAlmaSatiri["kaynak"], string> = { dosya: "dosya", plan: "plan", anlasma: "anlaşma", belirsiz: "" };
  const ESLESME: Record<NonNullable<SatinAlmaSatiri["eslesme"]>, string> = { booking: "booking", rezervasyon: "rez.", liman: "liman" };
  const gri = (h: string) => `<span style="color:#CBD5E1">${h}</span>`;
  const limanLink = (ad: string, k: string | null) => k
    ? `<a href="${NAVLUN_TABLOSU_URL}/navlun?liman=${encodeURIComponent(k)}" style="color:#283474;font-weight:bold;text-decoration:none">${esc(kes(ad, 15))}</a>`
    : `<b style="color:#283474">${esc(kes(ad, 15))}</b>`;
  const bolum = (baslik: string, alt: string, renk: string) =>
    `<div style="margin:16px 0 6px;padding:6px 10px;border-left:4px solid ${renk};background:#F8FAFC;border-radius:3px"><span style="font-size:13px;font-weight:bold;color:#283474">${baslik}</span><span style="font-size:11px;color:#64748B"> &nbsp;·&nbsp; ${alt}</span></div>`;

  const top = Object.entries(sa.toplam).map(([p, v]) => para(v, p)).join(" + ");
  const ust = bolum("Satın Alınan Navlunlar", `${sa.satirlar.length} booking · ${sa.konteyner} konteyner${top ? ` · toplam <b style="color:#283474">${top}</b>` : ""}`, "#10B981")
    + (sa.satirlar.length ? sikiTablo(
      [{ ad: "ETD" }, { ad: "Müşteri" }, { ad: "Liman" }, { ad: "Acente / Hat" }, { ad: "Kont", sag: true }, { ad: "Navlun", sag: true }, { ad: "Toplam", sag: true }, { ad: "En iyi", sag: true }],
      sa.satirlar.map((x) => [
        x.etd ? kisa(x.etd) : gri("ETD yok"),
        `<span title="${esc(x.booking)}">${esc(kes(x.musteri || "-", 18))}</span>`,
        limanLink(x.liman, x.limanAnahtar),
        esc(kes(x.blok, 14)),
        `${x.konteyner}`,
        x.navlun !== null ? `${para(x.navlun, x.para)}${KAYNAK[x.kaynak] ? ` <span style="color:#94A3B8;font-size:9.5px">${KAYNAK[x.kaynak]}${x.eslesme ? ` · ${ESLESME[x.eslesme]}` : ""}</span>` : ""}` : `<span style="color:#B45309">bilgi yok</span>`,
        x.toplam !== null ? `<b>${para(x.toplam, x.para)}</b>` : gri("-"),
        x.enIyi ? `<span style="color:${x.navlun !== null && x.enIyi.tutar < x.navlun ? "#B45309" : "#047857"}">${usd(x.enIyi.tutar)}</span>` : gri("-"),
      ]),
    ) : `<div style="font-size:12px;color:#64748B">Yükleme planında ETD'si bugün / ileride booking yok.</div>`)
    + (sa.belirsiz ? `<div style="margin-top:5px;font-size:11.5px;color:#B45309">${sa.belirsiz} booking'in navlunu sistemde yok (dosya / yükleme planı / anlaşma maili).</div>` : "");

  const tekSet = new Set((sa.tekTeklif || []).map((x) => x.limanAnahtar));
  const alt = bolum("Rezervasyon Bekleyen Müşteriler", `${sa.bekleyen.siparis} sipariş · ${sa.bekleyen.konteyner} konteyner · ön ödemesi alındı, navlunu henüz satın alınmadı`, "#F4A07C")
    + (sa.bekleyenler.length ? sikiTablo(
      [{ ad: "Müşteri" }, { ad: "Varış limanı" }, { ad: "Kont", sag: true }, { ad: "Güncel en iyi 20'DC", sag: true }, { ad: "Acente / Hat" }],
      sa.bekleyenler.map((b) => [
        `${esc(kes(b.musteri || "-", 28))}${b.siparis > 1 ? ` <span style="color:#94A3B8;font-size:9.5px">${b.siparis} sipariş</span>` : ""}`,
        limanLink(b.liman, b.limanAnahtar) + (tekSet.has(b.limanAnahtar || "") ? ` <span style="color:#B45309;font-size:9.5px">tek teklif</span>` : ""),
        `${b.konteyner}`,
        b.enIyi ? `<b style="color:#047857">${usd(b.enIyi.tutar)}</b>` : b.anlasma ? `<span style="color:#283474">${usd(b.anlasma.tutar)}</span>` : gri("teklif yok"),
        b.enIyi ? esc(kes(b.enIyi.blok, 18)) : b.anlasma ? `<span style="color:#64748B">son anlaşma · ${kisa(b.anlasma.tarih.slice(0, 10))}</span>` : gri("-"),
      ]),
    ) : `<div style="font-size:12px;color:#64748B">Rezervasyon bekleyen sipariş yok.</div>`);
  const tek = sa.tekTeklif || [];
  const uc = tek.length ? bolum("Tek Teklifle Karar Verilen Limanlar", `${tek.length} liman · son 30 günde en fazla bir acenteden 20'DC teklif var — yeni navlun talebi açın`, "#F59E0B")
    + sikiTablo(
      [{ ad: "Varış limanı" }, { ad: "Bekleyen kont", sag: true }, { ad: "Yaklaşan booking kont", sag: true }, { ad: "Teklif veren (30 gün)" }, { ad: "Güncel en iyi", sag: true }],
      tek.map((x) => [
        limanLink(x.liman, x.limanAnahtar),
        x.bekleyenKont ? `<b>${x.bekleyenKont}</b>` : gri("-"),
        x.bookingKont ? `${x.bookingKont}` : gri("-"),
        x.acenteler.length ? esc(kes(x.acenteler[0], 18)) : `<span style="color:#B45309">teklif yok${x.sonTeklif ? ` · son ${kisa(x.sonTeklif.slice(0, 10))}` : ""}</span>`,
        x.enIyi ? usd(x.enIyi.tutar) : gri("-"),
      ]),
    ) : "";
  return ust + alt + uc;
}
