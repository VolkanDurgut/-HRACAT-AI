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
};

/** Yukleme planindan gerceklesen navlun (PlanSatiri'nin ilgili alanlari) */
export type GerceklesenNavlun = {
  varis_limani: string | null;
  acente: string | null;
  navlun: number | null;
  navlun_para: string | null;
  etd: string | null;
};

export type NavlunHucresi = { tutar: number; para: string; ekipman: string; tarih: string; kaynak: "teklif" | "gerceklesen" };

export type NavlunBlogu = {
  ad: string;
  /** "YYYY-MM", eski -> yeni */
  aylar: string[];
  /** liman anahtari -> ay -> hucre */
  hucreler: Map<string, Map<string, NavlunHucresi>>;
  /** liman anahtari -> son free time (gun) */
  freeTime: Map<string, number>;
  /** liman anahtari -> son transit suresi (gun, "46-48") */
  transit: Map<string, string>;
  limanSayisi: number;
};

export type NavlunLimani = { anahtar: string; ad: string; hedef: { tutar: number; para: string; tarih: string } | null };

export type NavlunTablosu = { tarih: string; limanlar: NavlunLimani[]; bloklar: NavlunBlogu[]; gerceklesenVar: boolean };

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
const LIMAN_ESLER: Record<string, string> = { MALDIVES: "MALE", "DAR ES SELAM": "DAR ES SALAAM" };

const buyuk = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleUpperCase("tr-TR");
export function sirketAdi(s: string): string {
  const u = buyuk(s);
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
function limanKey(liman: string | null, anahtar?: string | null): string | null {
  const k = anahtar || limanAnahtari(liman);
  return k ? LIMAN_ESLER[k] || k : null;
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
  const bloklar = new Map<string, NavlunBlogu>();
  const blok = (ad: string) => {
    let b = bloklar.get(ad);
    if (!b) { b = { ad, aylar: [], hucreler: new Map(), freeTime: new Map(), transit: new Map(), limanSayisi: 0 }; bloklar.set(ad, b); }
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
    if (!o.acente) continue;
    let tutar = o.tutar, para = o.para_birimi || "USD";
    if (o.tur === "hedef_kabul") { const h = hedef.get(k); if (!h) continue; tutar = h.tutar; para = h.para; }
    else if (o.tur !== "teklif" && o.tur !== "karsi_teklif") continue;
    if (!tutar || tutar <= 0) continue;
    const b = blok(blokAdi(o.acente, o.armator));
    yaz(b, k, { tutar, para, ekipman: (o.ekipman || "20DC").toUpperCase(), tarih: o.tarih, kaynak: "teklif" });
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
    .map(([anahtar, v]) => ({ anahtar, ad: v.ad, hedef: hedef.get(anahtar) ?? null }))
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
export type GuncelEnIyi = {
  liman: string; blok: string; tutar: number; tarih: string; freeTime: number | null; transit: string | null; hedef: number | null; teklifSayisi: number;
  /** Limana EN SON gelen teklif (hangi acenteden olursa olsun) - her raporda en son alinan rakam (11.11.2026) */
  son: { blok: string; tutar: number; tarih: string } | null;
};
export function guncelEnIyiler(t: NavlunTablosu, gun = 60): GuncelEnIyi[] {
  const sinir = new Date(Date.parse(`${t.tarih}T12:00:00Z`) - gun * 86400000).toISOString().slice(0, 10);
  const out: GuncelEnIyi[] = [];
  for (const l of t.limanlar) {
    let en: GuncelEnIyi | null = null;
    let sonGelen: GuncelEnIyi["son"] = null;
    let sayi = 0;
    for (const b of t.bloklar) {
      const m = b.hucreler.get(l.anahtar);
      if (!m) continue;
      const son = Array.from(m.values()).filter((h) => h.kaynak === "teklif" && h.ekipman === "20DC" && h.para === "USD" && h.tarih.slice(0, 10) >= sinir)
        .sort((a, c) => c.tarih.localeCompare(a.tarih))[0];
      if (!son) continue;
      sayi++;
      if (!sonGelen || son.tarih > sonGelen.tarih) sonGelen = { blok: b.ad, tutar: son.tutar, tarih: son.tarih };
      if (!en || son.tutar < en.tutar) en = { liman: l.ad, blok: b.ad, tutar: son.tutar, tarih: son.tarih, freeTime: b.freeTime.get(l.anahtar) ?? null, transit: b.transit.get(l.anahtar) ?? null, hedef: l.hedef?.tutar ?? null, teklifSayisi: 0, son: null };
    }
    if (en) out.push({ ...en, teklifSayisi: sayi, son: sonGelen });
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

const usd = (n: number) => `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} $`;
export const NAVLUN_TABLOSU_URL = "https://ihracatasistanim.com";

export function navlunTablosuKonusu(t: NavlunTablosu, sirketAdi = "Unex Gıda"): string {
  return `${sirketAdi} Navlun Tablosu · ${tarihTr(t.tarih)} · ${t.limanlar.length} liman · ${t.bloklar.length} acente/hat`;
}

export type NavlunRaporSecenek = {
  /** Bir onceki raporun gonderim ani: bu andan sonra gelen teklifler "YENI" isaretlenir ve ayri listelenir */
  oncekiIso?: string | null;
  /** "Sabah raporu" / "Akşam raporu" */
  oturumEtiketi?: string | null;
};

/**
 * Mail tablosu satiri (11.11.2026, kullanici: "her zaman guncel navlun fiyatlari ayni tasarimda; hepsini tek sayfaya
 * sigdir, siki tablo"): TUM limanlar. En iyi = her blogun SON 20'DC USD teklifi; son 60 gunde teklif varsa yalniz onlar,
 * yoksa en son teklif (eski = gri). Son = limana en son gelen teklif (hangi acenteden olursa olsun).
 */
export type LimanSatiri = {
  liman: string; enIyi: { blok: string; tutar: number; tarih: string } | null; eski: boolean;
  freeTime: number | null; transit: string | null; hedef: number | null;
  son: { blok: string; tutar: number; tarih: string } | null; teklifSayisi: number;
};
export function limanSatirlari(t: NavlunTablosu, gun = 60): LimanSatiri[] {
  const sinir = new Date(Date.parse(`${t.tarih}T12:00:00Z`) - gun * 86400000).toISOString().slice(0, 10);
  return t.limanlar.map((l) => {
    const sonlar: { b: NavlunBlogu; h: NavlunHucresi }[] = [];
    for (const b of t.bloklar) {
      const m = b.hucreler.get(l.anahtar);
      if (!m) continue;
      const h = Array.from(m.values()).filter((x) => x.kaynak === "teklif" && x.ekipman === "20DC" && x.para === "USD").sort((x, y) => y.tarih.localeCompare(x.tarih))[0];
      if (h) sonlar.push({ b, h });
    }
    const guncel = sonlar.filter((x) => x.h.tarih.slice(0, 10) >= sinir);
    const havuz = guncel.length ? guncel : sonlar;
    const en = havuz.sort((x, y) => x.h.tutar - y.h.tutar)[0];
    const sonGelen = [...sonlar].sort((x, y) => y.h.tarih.localeCompare(x.h.tarih))[0];
    return {
      liman: l.ad, enIyi: en ? { blok: en.b.ad, tutar: en.h.tutar, tarih: en.h.tarih } : null, eski: !guncel.length && !!en,
      freeTime: en ? en.b.freeTime.get(l.anahtar) ?? null : null, transit: en ? en.b.transit.get(l.anahtar) ?? null : null,
      hedef: l.hedef?.para === "USD" ? l.hedef.tutar : null,
      son: sonGelen ? { blok: sonGelen.b.ad, tutar: sonGelen.h.tutar, tarih: sonGelen.h.tarih } : null, teklifSayisi: guncel.length,
    };
  }).filter((x) => x.enIyi).sort((a, b) => (a.eski ? 1 : 0) - (b.eski ? 1 : 0) || a.liman.localeCompare(b.liman, "tr"));
}

export function navlunTablosuHtml(t: NavlunTablosu, sirketAdi = "Unex Gıda", secenek: NavlunRaporSecenek = {}): string {
  const satirlar = limanSatirlari(t);
  const sinir = secenek.oncekiIso || new Date(Date.parse(`${t.tarih}T12:00:00Z`) - 48 * 3600000).toISOString();
  const yeniler = sonTeklifler(t, sinir, 200);
  const kisa = (iso: string) => { const d = new Date(Date.parse(iso) + 3 * 3600000).toISOString(); return `${d.slice(8, 10)}.${d.slice(5, 7)}`; };
  const kes = (x: string, n: number) => (x.length > n ? `${x.slice(0, n - 1)}…` : x);
  const guncel = satirlar.filter((x) => !x.eski);
  const altinda = guncel.filter((x) => x.hedef !== null && x.enIyi!.tutar <= x.hedef!);
  const ustunde = guncel.filter((x) => x.hedef !== null && x.enIyi!.tutar > x.hedef!).sort((a, b) => (b.enIyi!.tutar - b.hedef!) - (a.enIyi!.tutar - a.hedef!));
  const ucuz = [...guncel].sort((a, b) => a.enIyi!.tutar - b.enIyi!.tutar);

  const m: string[] = [];
  m.push(`<b>${satirlar.length}</b> limanda fiyat var; <b>${guncel.length}</b> limanda son 60 günde teklif alındı (${t.bloklar.length} acente / hat).`);
  if (yeniler.length) {
    const ilk = yeniler.slice(0, 3).map((x) => `${esc(x.liman)} ${x.para === "USD" ? usd(x.tutar) : `${x.tutar} ${esc(x.para)}`} (${esc(x.blok)})`).join(", ");
    m.push(`${secenek.oncekiIso ? "Son rapordan beri" : "Son 48 saatte"} <b>${yeniler.length}</b> yeni teklif: ${ilk}${yeniler.length > 3 ? ` ve ${yeniler.length - 3} tane daha` : ""}.`);
  } else m.push(`${secenek.oncekiIso ? "Son rapordan beri" : "Son 48 saatte"} yeni teklif gelmedi; rakamlar en son alınan tekliflerdir.`);
  if (altinda.length || ustunde.length) m.push(`Hedefimiz olan limanlardan <b>${altinda.length}</b> tanesinde en iyi teklif hedefte ya da altında${ustunde.length ? `; ${ustunde.length} tanesinde üstünde (en büyük fark ${esc(ustunde[0].liman)} +${usd(ustunde[0].enIyi!.tutar - ustunde[0].hedef!)})` : ""}.`);
  if (ucuz.length > 1) m.push(`En uygun 20'DC: ${esc(ucuz[0].liman)} ${usd(ucuz[0].enIyi!.tutar)} · en yüksek: ${esc(ucuz[ucuz.length - 1].liman)} ${usd(ucuz[ucuz.length - 1].enIyi!.tutar)}.`);
  const ftYok = guncel.filter((x) => x.freeTime === null).length;
  if (ftYok) m.push(`${ftYok} limanın en iyi teklifinde free time yazılmamış (acenteden teyit edilmeli).`);

  const yeniRozet = `<span style="display:inline-block;margin-left:3px;padding:0 4px;border-radius:3px;background:#DCFCE7;color:#166534;font-size:8.5px;font-weight:bold">YENİ</span>`;
  const tablo = sikiTablo(
    [{ ad: "Liman" }, { ad: "En iyi 20'DC", sag: true }, { ad: "Acente / Hat" }, { ad: "FT", sag: true }, { ad: "TT", sag: true }, { ad: "Hedef", sag: true }, { ad: "Son gelen" }],
    satirlar.map((x) => {
      const gri = x.eski ? "color:#94A3B8;" : "";
      const fark = x.hedef !== null && !x.eski ? x.enIyi!.tutar - x.hedef : null;
      return [
        `<b style="${gri}">${esc(kes(x.liman, 22))}</b>`,
        `<b style="color:${x.eski ? "#94A3B8" : "#047857"}">${usd(x.enIyi!.tutar)}</b>${x.eski ? ` <span style="font-size:9.5px">(${kisa(x.enIyi!.tarih)})</span>` : ""}`,
        `<span style="${gri}">${esc(kes(x.enIyi!.blok, 18))}</span>`,
        x.freeTime !== null ? `${x.freeTime}` : `<span style="color:#CBD5E1">-</span>`,
        x.transit ? esc(x.transit) : `<span style="color:#CBD5E1">-</span>`,
        x.hedef !== null ? `<span style="color:${fark === null ? "#64748B" : fark <= 0 ? "#047857" : "#B45309"}">${usd(x.hedef)}</span>` : `<span style="color:#CBD5E1">-</span>`,
        x.son ? `${usd(x.son.tutar)} <span style="color:#64748B">· ${esc(kes(x.son.blok, 12))} · ${kisa(x.son.tarih)}</span>${x.son.tarih > sinir ? yeniRozet : ""}` : "-",
      ];
    }),
    `Güncel navlun fiyatları · ${satirlar.length} liman`,
  );
  return raporKabugu({
    sirketAdi, baslik: "Navlun Raporu", tarih: tarihTr(t.tarih), oturum: secenek.oturumEtiketi || null,
    ozetAlt: "Acentelerin navlun teklifleri ve yükleme planındaki gerçekleşen navluna göre",
    maddeler: m, ekBolum: tablo,
    dugme: { metin: "Navlun Bildirimi'ni aç", yol: "/navlun" },
    dipnot: `En iyi = son 60 günde her acentenin son 20'DC teklifi içinde en düşüğü (gri = 60 günden eski). Yeşil hedef = teklif hedefte/altında.<br>Ekteki Excel operasyonun navlun tablosu düzeninde. Her gün 08:00 ve 17:00 · müşteriye gitmez.`,
  });
}
