/**
 * GUNLUK IC PIYASA RAPORU (04.11.2026). SAF: ag / veritabani yok - edge function ic-gunluk-rapor
 * veriyi getirir; burada yalniz hesap + HTML uretilir (Node ile test edilir).
 * Kullanici: "Gunluk ihracat raporu gibi gunluk ic piyasa raporu olusturulmasini istiyorum. Bugun
 * yuklenenler ve bugun gelenler seklinde olabilir." + siparis kapanis e-postasi kaldirildi; bugun
 * kapanan siparisler bu raporda.
 * Gorunum ihracat gunluk raporu / kapanis raporuyla AYNI dil (logo, lacivert #283474 + seftali
 * #F4A07C, ozet kutulari, lacivert tablo basliklari, tablo tabanli + satir ici stil).
 * Yuklenen = arac toplami + siparisler arasi devir (is emirleri / kantar ile ayni kural).
 * Kalan / fazla / kapanis sonucu TEK YERDE: mesaj-sablonlari.ts (kalanMetni, teslimFarki).
 * FIYAT YOK (sirket ici ekip raporu; fiyat ayri yetki). Musteriye GITMEZ.
 * 04.11.2026 aksam: gunde 3 kez (ihracat raporuyla ayni duzen, 15 dk sonra): SABAH 09:15 = DUNUN raporu,
 * OGLE 12:15 ve AKSAM 17:15 = bugunun (o ana kadar). Kullanici: "Bundan sonraki gunlerde sabah ogle aksam".
 */
import { SITE_ADRESI, kalanMetni, teslimFarki } from "./mesaj-sablonlari.ts";

export type RaporIsEmri = {
  id: string; is_emri_no: string; durum: string; urun: string; ambalaj: string | null; teslim: string | null;
  hedef_tur: "kg" | "arac"; hedef_kg: number | string | null; hedef_arac: number | null;
  devir_kg?: number | string | null; kapanis_zamani: string | null; olusturma: string;
  musteri: string; musteri_kisa: string | null;
  /** 13.11.2026: musteri bazinda ozet + Irsaliye Evreni baglantisi */
  musteri_id?: string | null;
};
export type RaporSevk = {
  id: string; is_emri_id: string; plaka: string; dorse_plaka: string | null; net_kg: number | string;
  irsaliye_no: string | null; irsaliye_tarihi: string | null; olusturma: string;
  cikis_durumu: string | null; cikis_zamani: string | null; gecmis?: boolean | null;
  /** 06.11.2026: varsa raporda "İrsaliye İncele" baglantisi (belge adresi maile YAZILMAZ). */
  irsaliye_dosya_yolu?: string | null;
};
export type RaporAlis = {
  id: string; alis_no: string; durum: string; urun: string; depo: string | null; miktar_kg: number | string;
  tedarikci: string; tedarikci_kisa: string | null; kapanis_zamani: string | null;
  /** 13.11.2026: tedarikci bazinda ozet + Irsaliye Evreni baglantisi */
  tedarikci_id?: string | null;
};
export type RaporTeslim = {
  id: string; alis_id: string; plaka: string | null; dorse_plaka: string | null; net_kg: number | string;
  teslim_zamani: string | null; irsaliye_no: string | null; irsaliye_tarihi: string | null; olusturma: string;
  sevk_id: string | null; gecmis?: boolean | null;
  irsaliye_dosya_yolu?: string | null;
};

/**
 * Irsaliye No hucresi (06.11.2026, kullanici: "irsaliye numarasinda 'İrsaliye İncele' ile irsaliyeyi
 * gosterebilmeliyiz"): numara + uygulamadaki /belge/irsaliye sayfasina baglanti (giris gerekir; belge
 * adresi maile yazilmaz). sorgu: "s=<sevk id>" | "a=<alis teslim id>"; belge yoksa yalniz numara.
 */
export function irsaliyeHucresi(no: string | null, sorgu: string | null): string {
  const numara = `<span style="font-family:monospace;font-size:11px">${esc(no || "-")}</span>`;
  if (!sorgu || !/^[sa]=[0-9a-f-]{36}$/i.test(sorgu)) return numara;
  return `${numara}<br><a href="${SITE_ADRESI}/belge/irsaliye?${sorgu}" style="display:inline-block;margin-top:3px;font-size:11px;font-weight:bold;color:#1D4ED8;text-decoration:none;border:1px solid #BFDBFE;background:#EFF6FF;border-radius:3px;padding:1px 6px;white-space:nowrap">İrsaliye İncele &rsaquo;</a>`;
}

/**
 * IRSALIYE EVRENI (13.11.2026, kullanici: "Ipsala Ajans toplam gelen, Luleburgaz Ajans toplam gelen tonaj ve arac sayisi ile
 * belirtilmeli; Irsaliye Incele tikladiginda ilgili irsaliyeleri inceleyebilecegi bir evren karsilamali, tek ekranda").
 * /belge/irsaliyeler?tur=alis|satis&gun=YYYY-MM-DD[&k=<tedarikci / musteri id>][&odak=<teslim / sevk id>]
 * k yoksa o gunun tum araclari; odak verilirse ekran o belgeyle acilir. Giris gerekir; belge adresi maile YAZILMAZ.
 */
const UUID_DESEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function irsaliyeEvreniYolu(tur: "alis" | "satis", gun: string, k?: string | null, odak?: string | null): string {
  const q = [`tur=${tur}`, `gun=${/^\d{4}-\d{2}-\d{2}$/.test(gun) ? gun : ""}`];
  if (k && UUID_DESEN.test(k)) q.push(`k=${k}`);
  if (odak && UUID_DESEN.test(odak)) q.push(`odak=${odak}`);
  return `${SITE_ADRESI}/belge/irsaliyeler?${q.join("&")}`;
}
const evrenDugmesi = (yol: string, metin: string) =>
  `<a href="${yol}" style="display:inline-block;margin-top:3px;font-size:11px;font-weight:bold;color:#1D4ED8;text-decoration:none;border:1px solid #BFDBFE;background:#EFF6FF;border-radius:3px;padding:1px 6px;white-space:nowrap">${metin} &rsaquo;</a>`;
/** Alis siparisi kalan durumu (Acik Alis tablosu, ozetler ve arac satirlari AYNI fonksiyonu kullanir). */
export type KalanDurumu = { metin: string; durum: "kalan" | "fazla" | "tamam" | "kapandi" };
export function alisKalanDurumu(kalanKg: number): KalanDurumu {
  if (kalanKg > 0) return { metin: `Kalan ${ton(kalanKg)}`, durum: "kalan" };
  if (kalanKg < 0) return { metin: `Fazla ${ton(-kalanKg)}`, durum: "fazla" };
  return { metin: "Tamam", durum: "tamam" };
}
const KAPANDI: KalanDurumu = { metin: "Kapandı", durum: "kapandi" };

/** ISO -> Turkiye takvim gunu "YYYY-MM-DD" */
export function trGun(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
}
export const trBugun = (simdi = new Date()) => simdi.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
const n = (x: unknown) => Number(x || 0);
const yuvarla = (x: number) => Math.round(x * 100) / 100;
/** Satis araci hangi gun yuklendi: irsaliye tarihi, yoksa kantar kaydi. */
export const sevkGunu = (s: Pick<RaporSevk, "irsaliye_tarihi" | "olusturma">) => trGun(s.irsaliye_tarihi || s.olusturma);
/** Alis araci hangi gun geldi: teslim zamani, yoksa irsaliye, yoksa kayit. */
export const teslimGunu = (t: Pick<RaporTeslim, "teslim_zamani" | "irsaliye_tarihi" | "olusturma">) => trGun(t.teslim_zamani || t.irsaliye_tarihi || t.olusturma);

export type IcGunlukRapor = {
  tarih: string;
  yuklenen: { sevk: RaporSevk; emir: RaporIsEmri | null }[];
  gelen: { teslim: RaporTeslim; alis: RaporAlis | null; dogrudanIsEmri: string | null }[];
  acikSatis: { emir: RaporIsEmri; yuklenenKg: number; devirKg: number; arac: number; bugunArac: number; kalan: { metin: string; durum: "kalan" | "fazla" | "tamam" } }[];
  acikAlis: { alis: RaporAlis; alinanKg: number; arac: number; bugunArac: number; kalanKg: number }[];
  kapanan: { emir: RaporIsEmri; yuklenenKg: number; arac: number; sonuc: "tam" | "eksik" | "fazla"; metin: string }[];
  ozet: {
    yuklenenArac: number; yuklenenKg: number; gelenArac: number; gelenKg: number;
    acikSatis: number; acikSatisKalanKg: number; acikAlis: number; acikAlisKalanKg: number; kapanan: number;
  };
};

export function icGunlukRaporHesapla(tarih: string, emirler: RaporIsEmri[], sevkler: RaporSevk[], alislar: RaporAlis[], teslimler: RaporTeslim[]): IcGunlukRapor {
  const emirMap = new Map(emirler.map((e) => [e.id, e]));
  const alisMap = new Map(alislar.map((a) => [a.id, a]));
  const sevkMap = new Map(sevkler.map((s) => [s.id, s]));
  const emirSevk = new Map<string, RaporSevk[]>();
  sevkler.forEach((s) => emirSevk.set(s.is_emri_id, [...(emirSevk.get(s.is_emri_id) || []), s]));
  const alisTeslim = new Map<string, RaporTeslim[]>();
  teslimler.forEach((t) => alisTeslim.set(t.alis_id, [...(alisTeslim.get(t.alis_id) || []), t]));
  const emirKg = (e: RaporIsEmri) => yuvarla((emirSevk.get(e.id) || []).reduce((t, s) => t + n(s.net_kg), 0) + n(e.devir_kg));
  const zaman = (s: RaporSevk) => s.irsaliye_tarihi || s.olusturma;

  const yuklenen = sevkler.filter((s) => sevkGunu(s) === tarih)
    .sort((a, b) => zaman(a).localeCompare(zaman(b)))
    .map((s) => ({ sevk: s, emir: emirMap.get(s.is_emri_id) || null }));
  const tz = (t: RaporTeslim) => t.teslim_zamani || t.irsaliye_tarihi || t.olusturma;
  const gelen = teslimler.filter((t) => teslimGunu(t) === tarih)
    .sort((a, b) => tz(a).localeCompare(tz(b)))
    .map((t) => {
      const s = t.sevk_id ? sevkMap.get(t.sevk_id) : undefined;
      return { teslim: t, alis: alisMap.get(t.alis_id) || null, dogrudanIsEmri: s ? emirMap.get(s.is_emri_id)?.is_emri_no ?? null : (t.sevk_id ? "satış" : null) };
    });

  const acikSatis = emirler.filter((e) => e.durum === "acik").map((e) => {
    const ss = emirSevk.get(e.id) || [];
    const kg = emirKg(e);
    const hedef = e.hedef_tur === "kg" ? n(e.hedef_kg) : n(e.hedef_arac);
    return { emir: e, yuklenenKg: kg, devirKg: n(e.devir_kg), arac: ss.length, bugunArac: ss.filter((s) => sevkGunu(s) === tarih).length, kalan: kalanMetni(e.hedef_tur, hedef, kg, ss.length) };
  }).sort((a, b) => b.bugunArac - a.bugunArac || a.emir.is_emri_no.localeCompare(b.emir.is_emri_no));

  const acikAlis = alislar.filter((a) => a.durum === "acik").map((a) => {
    const tt = alisTeslim.get(a.id) || [];
    const kg = yuvarla(tt.reduce((t, x) => t + n(x.net_kg), 0));
    return { alis: a, alinanKg: kg, arac: tt.filter((x) => !x.gecmis).length, bugunArac: tt.filter((x) => teslimGunu(x) === tarih).length, kalanKg: yuvarla(n(a.miktar_kg) - kg) };
  }).sort((a, b) => b.bugunArac - a.bugunArac || a.alis.alis_no.localeCompare(b.alis.alis_no));

  const kapanan = emirler.filter((e) => e.durum === "tamamlandi" && trGun(e.kapanis_zamani) === tarih).map((e) => {
    const ss = emirSevk.get(e.id) || [];
    const kg = emirKg(e);
    const f = teslimFarki(e.hedef_tur, e.hedef_tur === "kg" ? n(e.hedef_kg) : n(e.hedef_arac), kg, ss.length);
    return { emir: e, yuklenenKg: kg, arac: ss.length, sonuc: f.sonuc, metin: f.metin };
  });

  return {
    tarih, yuklenen, gelen, acikSatis, acikAlis, kapanan,
    ozet: {
      yuklenenArac: yuklenen.length, yuklenenKg: yuvarla(yuklenen.reduce((t, x) => t + n(x.sevk.net_kg), 0)),
      gelenArac: gelen.length, gelenKg: yuvarla(gelen.reduce((t, x) => t + n(x.teslim.net_kg), 0)),
      acikSatis: acikSatis.length,
      acikSatisKalanKg: yuvarla(acikSatis.filter((x) => x.emir.hedef_tur === "kg").reduce((t, x) => t + Math.max(0, n(x.emir.hedef_kg) - x.yuklenenKg), 0)),
      acikAlis: acikAlis.length, acikAlisKalanKg: yuvarla(acikAlis.reduce((t, x) => t + Math.max(0, x.kalanKg), 0)),
      kapanan: kapanan.length,
    },
  };
}

// ---------------------------------------------------------------- gorunum
const LACIVERT = "#283474";
const MARKA_TURUNCU = "#F4A07C";
export const IC_RAPOR_UYGULAMA_URL = "https://ihracatasistanim.com";
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sayi = (x: number, en = 0) => x.toLocaleString("tr-TR", { maximumFractionDigits: en });
const ton = (kg: number) => `${sayi(kg / 1000, 3)} ton`;
const saat = (iso: string | null | undefined) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
};
export const tarihTR = (g: string) => `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}`;
const musteriAdi = (e: RaporIsEmri | null) => (e ? (e.musteri_kisa || "").trim() || e.musteri : "-");
const urunAdi = (u: string, ambalaj?: string | null) => `${u}${ambalaj ? ` (${ambalaj})` : ""}`;

export type IcRaporOturumu = "sabah" | "ogle" | "aksam";
export const IC_RAPOR_OTURUMLARI: IcRaporOturumu[] = ["sabah", "ogle", "aksam"];
/** Turkiye saati (saat, dakika). Ihracat raporu 09:00 / 12:00 / 17:00 -> ic piyasa 15 dk sonra. */
export const IC_RAPOR_SAATI: Record<IcRaporOturumu, [number, number]> = { sabah: [9, 15], ogle: [12, 15], aksam: [17, 15] };
const OTURUM_AD: Record<IcRaporOturumu, string> = { sabah: "Sabah", ogle: "Öğle", aksam: "Akşam" };
export const icRaporSaatYazi = (o: IcRaporOturumu) => `${String(IC_RAPOR_SAATI[o][0]).padStart(2, "0")}:${String(IC_RAPOR_SAATI[o][1]).padStart(2, "0")}`;
/** Sabah raporu DUNU anlatir ("Dün"); ogle / aksam bugunu. */
const gunAdi = (o: IcRaporOturumu) => (o === "sabah" ? "Dün" : "Bugün");

export function icGunlukRaporKonusu(r: IcGunlukRapor, sirketAdi = "Unex Gıda", oturum: IcRaporOturumu = "aksam"): string {
  const o = r.ozet;
  const parcalar = [`Yüklenen ${o.yuklenenArac} araç · ${ton(o.yuklenenKg)}`, `Gelen ${o.gelenArac} araç · ${ton(o.gelenKg)}`];
  if (o.kapanan) parcalar.push(`${o.kapanan} sipariş kapandı`);
  return `${sirketAdi} İç Piyasa Raporu — ${tarihTR(r.tarih)} ${oturum === "sabah" ? "(Dün)" : OTURUM_AD[oturum]} | ${parcalar.join(" | ")}`;
}

const CIKIS: Record<string, [string, string]> = {
  cikti: ["Yola çıktı", "#047857"],
  bugun_degil: ["Bugün çıkmayacak", "#B45309"],
};

/** gruplu (13.11.2026): sade rapor (Satis / Alis; musteri / tedarikci basligi altinda siparisler, kalan, Irsaliye Evreni). Onaya kadar yalniz test maili. */
export type IcRaporSecenek = { gruplu?: boolean };

/**
 * SADE RAPOR (13.11.2026, kullanici: "Satis ve alis olarak ikiye ayiracaksin. Musteri ismi - kalan, Arac, Bugun, Kalan,
 * Irsaliyeler ... Irsaliyeleri incele butonlari olacak ... Rapor ip gibi olmali. Ayni basliktaki alt alta gozukmeli.")
 * Iki bolum (Satis / Alis), her biri TEK tablo: musteri / tedarikci basligi, altinda siparisleri alt alta.
 * Arac / Bugun = o gunun araclari ve tonaji; Kalan = siparisin kalani (Acik Satis / Alis ile ayni hesap).
 * Gunun araci olan + acik olan butun siparisler listelenir (kalan eksiksiz gorunsun); araci olmayan "-".
 */
// 14.11.2026 (kullanici: "HEDEF - KALAN GIBI GOZUKMELI"): her sipariste Hedef ve Toplam (yuklenen / alinan) da gorunur; Hedef - Toplam = Kalan.
// toplamKg null = bilinmiyor (kapanmis / acik listesinde olmayan siparis).
type SadeSiparis = { no: string; urun: string; arac: number; kg: number; belge: number; kalan: KalanDurumu; kalanKg: number; kalanArac: number; hedefKg: number; hedefArac: number; toplamKg: number | null };
type SadeGrup = { k: string | null; ad: string; siparisler: SadeSiparis[]; arac: number; kg: number; belge: number; kalanKg: number; kalanArac: number; hedefKg: number; hedefArac: number; toplamKg: number | null };

function sadeGrupla(liste: { k: string | null; ad: string; s: SadeSiparis }[]): SadeGrup[] {
  const m = new Map<string, SadeGrup>();
  for (const { k, ad, s } of liste) {
    const key = k || `ad:${ad}`;
    const g: SadeGrup = m.get(key) || { k, ad, siparisler: [], arac: 0, kg: 0, belge: 0, kalanKg: 0, kalanArac: 0, hedefKg: 0, hedefArac: 0, toplamKg: 0 };
    g.siparisler.push(s);
    g.hedefKg = yuvarla(g.hedefKg + s.hedefKg); g.hedefArac += s.hedefArac;
    g.toplamKg = g.toplamKg === null || s.toplamKg === null ? null : yuvarla(g.toplamKg + s.toplamKg);
    g.arac += s.arac; g.kg = yuvarla(g.kg + s.kg); g.belge += s.belge;
    g.kalanKg = yuvarla(g.kalanKg + s.kalanKg); g.kalanArac += s.kalanArac;
    m.set(key, g);
  }
  const gruplar = Array.from(m.values());
  gruplar.forEach((g) => g.siparisler.sort((a, b) => b.kg - a.kg || a.no.localeCompare(b.no)));
  return gruplar.sort((a, b) => b.kg - a.kg || b.kalanKg - a.kalanKg || a.ad.localeCompare(b.ad, "tr"));
}

/** Satis: gunun araclari + acik siparisler, musteri bazinda. */
export function sadeSatisGruplari(r: IcGunlukRapor): SadeGrup[] {
  const acik = new Map(r.acikSatis.map((x) => [x.emir.id, x]));
  const sip = new Map<string, { e: RaporIsEmri; s: SadeSiparis }>();
  const ekle = (e: RaporIsEmri) => {
    if (sip.has(e.id)) return sip.get(e.id)!;
    const a = acik.get(e.id);
    const kgHedef = e.hedef_tur === "kg";
    const x = {
      e, s: {
        no: e.is_emri_no, urun: urunAdi(e.urun, e.ambalaj), arac: 0, kg: 0, belge: 0,
        kalan: a ? { metin: a.kalan.metin, durum: a.kalan.durum } : KAPANDI,
        kalanKg: a && kgHedef ? Math.max(0, yuvarla(n(e.hedef_kg) - a.yuklenenKg)) : 0,
        kalanArac: a && !kgHedef ? Math.max(0, n(e.hedef_arac) - a.arac) : 0,
        hedefKg: kgHedef ? n(e.hedef_kg) : 0, hedefArac: kgHedef ? 0 : n(e.hedef_arac), toplamKg: a ? a.yuklenenKg : null,
      },
    };
    sip.set(e.id, x);
    return x;
  };
  r.acikSatis.forEach((x) => ekle(x.emir));
  r.yuklenen.forEach(({ sevk, emir }) => {
    if (!emir) return;
    const x = ekle(emir);
    x.s.arac += 1; x.s.kg = yuvarla(x.s.kg + n(sevk.net_kg)); if (sevk.irsaliye_dosya_yolu) x.s.belge += 1;
  });
  return sadeGrupla(Array.from(sip.values()).map(({ e, s }) => ({ k: e.musteri_id ?? null, ad: musteriAdi(e), s })));
}

/** Alis: gunun teslimleri + acik alislar, tedarikci bazinda. */
export function sadeAlisGruplari(r: IcGunlukRapor): SadeGrup[] {
  const acik = new Map(r.acikAlis.map((x) => [x.alis.id, x]));
  const sip = new Map<string, { a: RaporAlis; s: SadeSiparis }>();
  const ekle = (a: RaporAlis) => {
    if (sip.has(a.id)) return sip.get(a.id)!;
    const x = acik.get(a.id);
    const y = {
      a, s: {
        no: a.alis_no, urun: `${a.urun}${a.depo ? ` · ${a.depo}` : ""}`, arac: 0, kg: 0, belge: 0,
        kalan: x ? alisKalanDurumu(x.kalanKg) : KAPANDI, kalanKg: x ? Math.max(0, x.kalanKg) : 0, kalanArac: 0,
        hedefKg: n(a.miktar_kg), hedefArac: 0, toplamKg: x ? x.alinanKg : null,
      },
    };
    sip.set(a.id, y);
    return y;
  };
  r.acikAlis.forEach((x) => ekle(x.alis));
  r.gelen.forEach(({ teslim, alis }) => {
    if (!alis) return;
    const y = ekle(alis);
    y.s.arac += 1; y.s.kg = yuvarla(y.s.kg + n(teslim.net_kg)); if (teslim.irsaliye_dosya_yolu) y.s.belge += 1;
  });
  return sadeGrupla(Array.from(sip.values()).map(({ a, s }) => ({ k: a.tedarikci_id ?? null, ad: (a.tedarikci_kisa || "").trim() || a.tedarikci, s })));
}

function icRaporSadeHtml(r: IcGunlukRapor, sirketAdi: string, olusturmaIso: string, oturum: IcRaporOturumu): string {
  const G = gunAdi(oturum);
  const RENK = { kalan: "#B45309", fazla: LACIVERT, tamam: "#047857", kapandi: "#047857" } as const;
  const kalanYazi = (kg: number, arac: number) => [kg > 0 ? ton(kg) : "", arac > 0 ? `${arac} araç` : ""].filter(Boolean).join(" + ");
  const th = (t: string, sag = false) => `<th style="background:${LACIVERT};color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:8px 10px;text-align:${sag ? "right" : "left"};font-weight:bold;white-space:nowrap">${t}</th>`;
  const hucre = (t: string, st = "") => `<td style="padding:7px 10px;font-size:12px;color:#1E293B;vertical-align:middle;${st}">${t}</td>`;

  const bolumHtml = (tur: "satis" | "alis", gruplar: SadeGrup[]) => {
    const etiket = tur === "satis" ? "Müşteri" : "Tedarikçi";
    const renk = tur === "satis" ? "#047857" : LACIVERT;
    const arac = gruplar.reduce((t, x) => t + x.arac, 0);
    const kg = yuvarla(gruplar.reduce((t, x) => t + x.kg, 0));
    const kKg = yuvarla(gruplar.reduce((t, x) => t + x.kalanKg, 0));
    const kAr = gruplar.reduce((t, x) => t + x.kalanArac, 0);
    const hKg = yuvarla(gruplar.reduce((t, x) => t + x.hedefKg, 0));
    const hAr = gruplar.reduce((t, x) => t + x.hedefArac, 0);
    const tKg = gruplar.some((x) => x.toplamKg === null) ? null : yuvarla(gruplar.reduce((t, x) => t + (x.toplamKg || 0), 0));
    const hedefYazi = (kg: number, ar: number) => kalanYazi(kg, ar) || "-";
    const toplamYazi = (kg: number | null) => (kg === null ? "-" : ton(kg));
    const satirlar = gruplar.map((x, gi) => {
      const ust = gi ? "border-top:2px solid #CBD5E1;" : "";
      const dugme = x.belge
        ? evrenDugmesi(irsaliyeEvreniYolu(tur, r.tarih, x.k), `İrsaliyeleri İncele (${x.belge})`)
        : `<span style="font-size:11px;color:#94A3B8">-</span>`;
      const kalanTop = kalanYazi(x.kalanKg, x.kalanArac);
      const baslik = `<tr style="background:#F1F3FA">${hucre(`<b style="color:${LACIVERT};font-size:13px">${esc(x.ad)}</b>`, ust)}${hucre(`<b>${hedefYazi(x.hedefKg, x.hedefArac)}</b>`, `${ust}text-align:right;white-space:nowrap`)}${hucre(x.arac ? `<b>${x.arac}</b>` : "-", `${ust}text-align:right;white-space:nowrap`)}${hucre(x.kg ? `<b style="color:${renk}">${ton(x.kg)}</b>` : "-", `${ust}text-align:right;white-space:nowrap`)}${hucre(`<b>${toplamYazi(x.toplamKg)}</b>`, `${ust}text-align:right;white-space:nowrap`)}${hucre(kalanTop ? `<b style="color:#B45309">${kalanTop}</b>` : `<span style="color:#047857;font-weight:bold">Kapandı</span>`, `${ust}text-align:right;white-space:nowrap`)}${hucre(dugme, `${ust}text-align:right;white-space:nowrap`)}</tr>`;
      const alt = x.siparisler.map((s) => `<tr>${hucre(`<span style="color:#94A3B8">&#8627;</span> <span style="color:#334155">${esc(s.no)}</span> <span style="color:#94A3B8;font-size:11px">· ${esc(s.urun)}</span>`, "padding-left:18px;border-top:1px solid #EEF0F4")}${hucre(hedefYazi(s.hedefKg, s.hedefArac), "text-align:right;white-space:nowrap;color:#475569;border-top:1px solid #EEF0F4")}${hucre(s.arac ? String(s.arac) : `<span style="color:#CBD5E1">-</span>`, "text-align:right;color:#475569;border-top:1px solid #EEF0F4")}${hucre(s.kg ? ton(s.kg) : `<span style="color:#CBD5E1">-</span>`, "text-align:right;white-space:nowrap;color:#475569;border-top:1px solid #EEF0F4")}${hucre(toplamYazi(s.toplamKg), "text-align:right;white-space:nowrap;color:#475569;border-top:1px solid #EEF0F4")}${hucre(`<span style="color:${RENK[s.kalan.durum]};font-weight:bold;font-size:11px">${esc(s.kalan.metin)}</span>`, "text-align:right;white-space:nowrap;border-top:1px solid #EEF0F4")}${hucre("", "border-top:1px solid #EEF0F4")}</tr>`).join("");
      return baslik + alt;
    }).join("");
    const top = `<tr>${hucre(`<b>TOPLAM — ${gruplar.length} ${etiket.toLowerCase()}</b>`, "border-top:3px solid #283474;font-size:11px;color:#475569")}${hucre(`<b>${hedefYazi(hKg, hAr)}</b>`, "border-top:3px solid #283474;text-align:right;white-space:nowrap")}${hucre(`<b>${arac}</b>`, "border-top:3px solid #283474;text-align:right")}${hucre(`<b style="color:${renk}">${ton(kg)}</b>`, "border-top:3px solid #283474;text-align:right;white-space:nowrap")}${hucre(`<b>${toplamYazi(tKg)}</b>`, "border-top:3px solid #283474;text-align:right;white-space:nowrap")}${hucre(`<b style="color:#B45309">${kalanYazi(kKg, kAr) || "-"}</b>`, "border-top:3px solid #283474;text-align:right;white-space:nowrap")}${hucre("", "border-top:3px solid #283474")}</tr>`;
    const govde = gruplar.length ? satirlar + top : `<tr><td colspan="7" style="padding:12px 10px;color:#94A3B8;font-style:italic;font-size:12px">${tur === "satis" ? `${G} yükleme yok, açık satış siparişi yok.` : `${G} teslim alma yok, açık alış siparişi yok.`}</td></tr>`;
    return `<div style="margin:26px 0 8px;font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${LACIVERT};border-left:4px solid ${MARKA_TURUNCU};padding-left:8px">${tur === "satis" ? "Satış" : "Alış"}<span style="float:right;font-weight:normal;text-transform:none;letter-spacing:0;font-size:12px;color:#64748B">${G.toLowerCase()} ${arac} araç · ${ton(kg)}${kKg > 0 || kAr > 0 ? ` · <b style="color:#B45309">kalan ${kalanYazi(kKg, kAr)}</b>` : ""}</span></div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E2E8F0"><tr>${th(`${etiket} · sipariş`)}${th("Hedef", true)}${th("Araç", true)}${th(G, true)}${th(tur === "satis" ? "Yüklenen" : "Alınan", true)}${th("Kalan", true)}${th("İrsaliyeler", true)}</tr>${govde}</table>`;
  };

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>İç Piyasa Günlük Rapor</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:20px 0"><tr><td align="center">
<table role="presentation" width="760" cellpadding="0" cellspacing="0" style="max-width:760px;width:100%;background:#fff;border-radius:6px;padding:24px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:4px solid ${LACIVERT};padding-bottom:10px"><tr>
    <td style="width:56px;vertical-align:middle"><img src="${IC_RAPOR_UYGULAMA_URL}/images/logo.png" width="48" height="48" alt="${esc(sirketAdi)}" style="display:block;width:48px;height:48px;border:0"></td>
    <td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold;color:${LACIVERT}">${esc(sirketAdi)} İç Piyasa</div><div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#64748B;text-transform:uppercase">Günlük Rapor · Satış ve Alış</div></td>
    <td style="text-align:right"><div style="font-size:14px;font-weight:bold;color:${LACIVERT}">${esc(tarihTR(r.tarih))}</div><div style="font-size:11px;color:#94A3B8">${OTURUM_AD[oturum]} raporu${oturum === "sabah" ? " (dün)" : ""} · ${esc(saat(olusturmaIso))}</div></td>
  </tr></table>

  ${bolumHtml("satis", sadeSatisGruplari(r))}

  ${bolumHtml("alis", sadeAlisGruplari(r))}

  <div style="margin-top:24px;text-align:center">
    <a href="${IC_RAPOR_UYGULAMA_URL}/ic-piyasa/is-emirleri" style="display:inline-block;background:#10B981;color:#fff;text-decoration:none;font-size:13px;font-weight:bold;padding:10px 18px;border-radius:6px">İç piyasayı uygulamada aç</a>
  </div>
  <div style="margin-top:16px;font-size:11px;color:#94A3B8;text-align:center;line-height:1.5">Araç / ${G}: ${G.toLowerCase()} yüklenen (satış) ve teslim alınan (alış) araçlar. Hedef: sipariş miktarı · Yüklenen / Alınan: siparişe bugüne kadar giden toplam (araçlar + siparişler arası devir) · Kalan = Hedef − Yüklenen / Alınan.<br>İrsaliyeleri İncele: o müşterinin / tedarikçinin ${G.toLowerCase()}kü bütün irsaliyeleri tek ekranda açılır (uygulamaya giriş gerekir).<br>Her gün ${icRaporSaatYazi("sabah")} (dünün raporu), ${icRaporSaatYazi("ogle")} ve ${icRaporSaatYazi("aksam")}'te gönderilir · müşteriye gitmez · alıcılar: İç Piyasa › Bildirimler › Ayarlar.</div>
</td></tr></table>
</td></tr></table></body></html>`;
}

/**
 * GUNUN ARACLARI SIPARIS BAZINDA (14.11.2026, kullanici: "Tedarikci alis tek bir satir gozuksun, plaka yerine arac sayisi,
 * net yerine toplam net ve irsaliyeleri incele. Alis ve satis bu sekilde olmali."). Eski gorunum korunur; yalniz
 * "Yuklenenler" / "Gelenler" tablolari arac arac degil, siparis (alis / is emri) basina TEK satir.
 * Siralama: ilk aracin saatine gore. belge = irsaliye dosyasi olan arac sayisi (Irsaliyeleri Incele dugmesi).
 */
export type GunSatiri = { anahtar: string; k: string | null; ad: string; no: string; urun: string; arac: number; kg: number; belge: number; ilk: string; son: string; cikti: number; dogrudan: string[] };
function gunGrupla(liste: { anahtar: string; k: string | null; ad: string; no: string; urun: string; kg: number; belge: boolean; zaman: string; cikti: boolean; dogrudan: string | null }[]): GunSatiri[] {
  const m = new Map<string, GunSatiri>();
  for (const x of liste) {
    const g = m.get(x.anahtar) || { anahtar: x.anahtar, k: x.k, ad: x.ad, no: x.no, urun: x.urun, arac: 0, kg: 0, belge: 0, ilk: x.zaman, son: x.zaman, cikti: 0, dogrudan: [] };
    g.arac += 1; g.kg = yuvarla(g.kg + x.kg); if (x.belge) g.belge += 1; if (x.cikti) g.cikti += 1;
    if (x.zaman < g.ilk) g.ilk = x.zaman;
    if (x.zaman > g.son) g.son = x.zaman;
    if (x.dogrudan && !g.dogrudan.includes(x.dogrudan)) g.dogrudan.push(x.dogrudan);
    m.set(x.anahtar, g);
  }
  return Array.from(m.values()).sort((a, b) => a.ilk.localeCompare(b.ilk) || a.no.localeCompare(b.no));
}
export function yuklenenSiparisSatirlari(r: IcGunlukRapor): GunSatiri[] {
  return gunGrupla(r.yuklenen.map(({ sevk: s, emir: e }) => ({
    anahtar: e?.id || `sevk:${s.is_emri_id}`, k: e?.musteri_id ?? null, ad: musteriAdi(e), no: e?.is_emri_no || "-",
    urun: e ? urunAdi(e.urun, e.ambalaj) : "-", kg: n(s.net_kg), belge: !!s.irsaliye_dosya_yolu,
    zaman: s.irsaliye_tarihi || s.olusturma, cikti: s.cikis_durumu === "cikti", dogrudan: null,
  })));
}
export function gelenSiparisSatirlari(r: IcGunlukRapor): GunSatiri[] {
  return gunGrupla(r.gelen.map(({ teslim: t, alis: a, dogrudanIsEmri }) => ({
    anahtar: a?.id || `alis:${t.alis_id}`, k: a?.tedarikci_id ?? null, ad: a ? (a.tedarikci_kisa || "").trim() || a.tedarikci : "-",
    no: a?.alis_no || "-", urun: a ? `${a.urun}${a.depo ? ` · ${a.depo}` : ""}` : "-", kg: n(t.net_kg), belge: !!t.irsaliye_dosya_yolu,
    zaman: t.teslim_zamani || t.irsaliye_tarihi || t.olusturma, cikti: false, dogrudan: dogrudanIsEmri,
  })));
}

export function icGunlukRaporHtml(r: IcGunlukRapor, sirketAdi = "Unex Gıda", olusturmaIso = new Date().toISOString(), oturum: IcRaporOturumu = "aksam", secenek: IcRaporSecenek = {}): string {
  // gruplu (test, onaya kadar): sade rapor. Asagisi ESKI gorunum, degismedi (zamanlanmis rapor).
  if (secenek.gruplu === true) return icRaporSadeHtml(r, sirketAdi, olusturmaIso, oturum);
  const G = gunAdi(oturum);
  const g = G === "Dün" ? "dün" : "bugün";
  const th = (t: string, sag = false) => `<th style="background:${LACIVERT};color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:7px 8px;text-align:${sag ? "right" : "left"};font-weight:bold;white-space:nowrap">${t}</th>`;
  const td = (t: string, st = "") => `<td style="padding:6px 8px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#1E293B;vertical-align:top;${st}">${t}</td>`;
  const kutu = (etiket: string, deger: string, alt: string, renk: string) =>
    `<td style="width:23.5%;vertical-align:top;border:1px solid #E2E8F0;border-top:3px solid ${renk};border-radius:4px;padding:8px 10px"><div style="font-size:10px;font-weight:bold;color:#64748B;text-transform:uppercase">${etiket}</div><div style="font-size:20px;font-weight:bold;color:${renk};line-height:1.25">${deger}</div><div style="font-size:11px;color:#475569;line-height:1.4">${alt}</div></td>`;
  const arasi = `<td style="width:2%;font-size:0;line-height:0">&nbsp;</td>`;
  const bolum = (t: string, sag = "") => `<div style="margin:24px 0 8px;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${LACIVERT};border-left:4px solid ${MARKA_TURUNCU};padding-left:8px">${t}${sag ? `<span style="float:right;font-weight:normal;text-transform:none;letter-spacing:0;color:#64748B">${sag}</span>` : ""}</div>`;
  const bos = (cols: number, metin: string) => `<tr><td colspan="${cols}" style="padding:10px 8px;color:#94A3B8;font-style:italic;font-size:12px;border-bottom:1px solid #E2E8F0">${metin}</td></tr>`;
  const toplam = (cols: number, etiket: string, deger: string) => `<tr><td colspan="${cols - 1}" style="padding:8px;font-size:11px;font-weight:bold;color:#475569;border-top:2px solid #CBD5E1">${etiket}</td><td style="padding:8px;font-size:11px;font-weight:bold;text-align:right;border-top:2px solid #CBD5E1;white-space:nowrap">${deger}</td></tr>`;
  const tablo = (baslik: string, govde: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>${baslik}</tr>${govde}</table>`;
  const o = r.ozet;

  // Ozet kutulari
  const kutular = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-collapse:separate"><tr>
    ${kutu(`${G} Yüklenen`, `${o.yuklenenArac} araç`, `${ton(o.yuklenenKg)} · satış`, "#047857")}${arasi}
    ${kutu(`${G} Gelen`, `${o.gelenArac} araç`, `${ton(o.gelenKg)} · alış`, LACIVERT)}${arasi}
    ${kutu("Açık Satış", `${o.acikSatis} sipariş`, `kalan ${ton(o.acikSatisKalanKg)}`, "#B45309")}${arasi}
    ${kutu("Açık Alış", `${o.acikAlis} sipariş`, `teslim alınacak ${ton(o.acikAlisKalanKg)}`, "#475569")}
  </tr></table>`;

  // Gunun araclari: siparis basina TEK satir (14.11.2026) - arac sayisi, toplam net, Irsaliyeleri Incele
  const saatAraligi = (x: GunSatiri) => (saat(x.ilk) === saat(x.son) ? saat(x.ilk) : `${saat(x.ilk)}–${saat(x.son)}`);
  const dugme = (tur: "satis" | "alis", x: GunSatiri) => (x.belge
    ? evrenDugmesi(irsaliyeEvreniYolu(tur, r.tarih, x.k), `İrsaliyeleri İncele (${x.belge})`)
    : `<span style="color:#94A3B8;font-size:11px">İrsaliye yüklenmedi</span>`);
  const ad = (x: GunSatiri) => `<b>${esc(x.ad)}</b><br><span style="color:#64748B;font-size:11px">${esc(x.no)} · ${esc(x.urun)}</span>`;

  // Bugun yuklenenler (satis)
  const yGrup = yuklenenSiparisSatirlari(r);
  const yRows = yGrup.map((x, i) => {
    const durum = x.cikti === x.arac ? `<span style="color:#047857;font-weight:bold">Yola çıktı</span>`
      : x.cikti ? `<span style="color:#047857;font-weight:bold">${x.cikti} çıktı</span> <span style="color:#64748B">· ${x.arac - x.cikti} bekliyor</span>`
      : `<span style="color:#64748B">Çıkış bekliyor</span>`;
    return `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${td(saatAraligi(x), "color:#64748B;white-space:nowrap")}${td(ad(x))}${td(`<b>${x.arac}</b>`, "text-align:right;white-space:nowrap")}${td(dugme("satis", x), "white-space:nowrap")}${td(durum, "font-size:11px;white-space:nowrap")}${td(sayi(x.kg), "text-align:right;font-weight:bold;white-space:nowrap")}</tr>`;
  }).join("");
  const yTablo = tablo(`${th("Saat")}${th("Müşteri · Sipariş")}${th("Araç", true)}${th("İrsaliyeler")}${th("Durum")}${th("Toplam Net (kg)", true)}`,
    yGrup.length ? yRows + toplam(6, `TOPLAM — ${yGrup.length} sipariş · ${o.yuklenenArac} araç`, `${sayi(o.yuklenenKg)} kg`) : bos(6, `${G} satış aracı yüklenmedi.`));

  // Bugun gelenler (alis)
  const gGrup = gelenSiparisSatirlari(r);
  const gRows = gGrup.map((x, i) =>
    `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${td(saatAraligi(x), "color:#64748B;white-space:nowrap")}${td(`${ad(x)}${x.dogrudan.length ? `<br><span style="color:#B45309;font-size:11px;font-weight:bold">Doğrudan müşteriye · ${esc(x.dogrudan.join(", "))}</span>` : ""}`)}${td(`<b>${x.arac}</b>`, "text-align:right;white-space:nowrap")}${td(dugme("alis", x), "white-space:nowrap")}${td(sayi(x.kg), "text-align:right;font-weight:bold;white-space:nowrap")}</tr>`).join("");
  const gTablo = tablo(`${th("Saat")}${th("Tedarikçi · Alış")}${th("Araç", true)}${th("İrsaliyeler")}${th("Toplam Net (kg)", true)}`,
    gGrup.length ? gRows + toplam(5, `TOPLAM — ${gGrup.length} alış · ${o.gelenArac} araç`, `${sayi(o.gelenKg)} kg`) : bos(5, `${G} alış aracı gelmedi.`));

  // Acik satis siparisleri
  const KALAN_RENK = { kalan: "#B45309", fazla: LACIVERT, tamam: "#047857" } as const;
  const sRows = r.acikSatis.map((x, i) => {
    const e = x.emir;
    const hedef = e.hedef_tur === "kg" ? `${sayi(n(e.hedef_kg))} kg` : `${e.hedef_arac ?? 0} araç`;
    const devir = x.devirKg ? `<br><span style="color:#64748B;font-size:10px">devir ${x.devirKg > 0 ? "+" : "−"}${sayi(Math.abs(x.devirKg))} kg dahil</span>` : "";
    return `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${td(`<b>${esc(e.is_emri_no)}</b>`, "white-space:nowrap")}${td(`${esc(musteriAdi(e))}<br><span style="color:#64748B;font-size:11px">${esc(urunAdi(e.urun, e.ambalaj))}${e.teslim ? ` · ${esc(e.teslim)}` : ""}</span>`)}${td(hedef, "text-align:right;white-space:nowrap")}${td(`${sayi(x.yuklenenKg)} kg${devir}`, "text-align:right;white-space:nowrap")}${td(`${x.arac}${x.bugunArac ? ` <span style="color:#047857;font-weight:bold">(+${x.bugunArac} ${g})</span>` : ""}`, "text-align:right;white-space:nowrap")}${td(`<span style="color:${KALAN_RENK[x.kalan.durum]};font-weight:bold">${esc(x.kalan.metin)}</span>`, "white-space:nowrap")}</tr>`;
  }).join("");
  const sTablo = tablo(`${th("Sipariş")}${th("Müşteri · Ürün")}${th("Hedef", true)}${th("Yüklenen", true)}${th("Araç", true)}${th("Durum")}`,
    sRows || bos(6, "Açık satış siparişi yok."));

  // Acik alis siparisleri
  const aRows = r.acikAlis.map((x, i) => {
    const a = x.alis;
    const kalan = x.kalanKg > 0 ? `<span style="color:#B45309;font-weight:bold">Kalan ${ton(x.kalanKg)}</span>` : x.kalanKg < 0 ? `<span style="color:${LACIVERT};font-weight:bold">Fazla ${ton(-x.kalanKg)}</span>` : `<span style="color:#047857;font-weight:bold">Tamam</span>`;
    return `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${td(`<b>${esc(a.alis_no)}</b>`, "white-space:nowrap")}${td(`${esc((a.tedarikci_kisa || "").trim() || a.tedarikci)}<br><span style="color:#64748B;font-size:11px">${esc(a.urun)}${a.depo ? ` · ${esc(a.depo)}` : ""}</span>`)}${td(`${sayi(n(a.miktar_kg))} kg`, "text-align:right;white-space:nowrap")}${td(`${sayi(x.alinanKg)} kg`, "text-align:right;white-space:nowrap")}${td(`${x.arac}${x.bugunArac ? ` <span style="color:#047857;font-weight:bold">(+${x.bugunArac} ${g})</span>` : ""}`, "text-align:right;white-space:nowrap")}${td(kalan, "white-space:nowrap")}</tr>`;
  }).join("");
  const aTablo = tablo(`${th("Alış")}${th("Tedarikçi · Ürün")}${th("Sipariş", true)}${th("Teslim alınan", true)}${th("Araç", true)}${th("Durum")}`,
    aRows || bos(6, "Açık alış siparişi yok."));

  // Bugun kapanan siparisler
  const SONUC_RENK = { tam: "#047857", eksik: "#B45309", fazla: LACIVERT } as const;
  const kRows = r.kapanan.map((x, i) => {
    const e = x.emir;
    const hedef = e.hedef_tur === "kg" ? `${sayi(n(e.hedef_kg))} kg` : `${e.hedef_arac ?? 0} araç`;
    return `<tr style="${i % 2 ? "background:#F8FAFC" : ""}">${td(`<b>${esc(e.is_emri_no)}</b>`, "white-space:nowrap")}${td(`${esc(musteriAdi(e))}<br><span style="color:#64748B;font-size:11px">${esc(urunAdi(e.urun, e.ambalaj))}</span>`)}${td(hedef, "text-align:right;white-space:nowrap")}${td(`${sayi(x.yuklenenKg)} kg · ${x.arac} araç`, "text-align:right;white-space:nowrap")}${td(`<span style="color:${SONUC_RENK[x.sonuc]};font-weight:bold">${esc(x.metin)}</span>`, "white-space:nowrap")}</tr>`;
  }).join("");
  const kBolum = r.kapanan.length
    ? bolum(`${G} Kapanan Siparişler`, `${r.kapanan.length} sipariş`) + tablo(`${th("Sipariş")}${th("Müşteri · Ürün")}${th("Hedef", true)}${th("Gerçekleşen", true)}${th("Sonuç")}`, kRows)
    : "";

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>İç Piyasa Günlük Rapor</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:20px 0"><tr><td align="center">
<table role="presentation" width="760" cellpadding="0" cellspacing="0" style="max-width:760px;width:100%;background:#fff;border-radius:6px;padding:24px">
<tr><td>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:4px solid ${LACIVERT};padding-bottom:10px"><tr>
    <td style="width:56px;vertical-align:middle"><img src="${IC_RAPOR_UYGULAMA_URL}/images/logo.png" width="48" height="48" alt="${esc(sirketAdi)}" style="display:block;width:48px;height:48px;border:0"></td>
    <td style="vertical-align:middle"><div style="font-size:18px;font-weight:bold;color:${LACIVERT}">${esc(sirketAdi)} İç Piyasa</div><div style="font-size:11px;font-weight:bold;letter-spacing:1.5px;color:#64748B;text-transform:uppercase">Günlük Rapor · Yükleme ve Teslim Alma</div></td>
    <td style="text-align:right"><div style="font-size:14px;font-weight:bold;color:${LACIVERT}">${esc(tarihTR(r.tarih))}</div><div style="font-size:11px;color:#94A3B8">${OTURUM_AD[oturum]} raporu${oturum === "sabah" ? " (dün)" : ""} · ${esc(saat(olusturmaIso))}</div></td>
  </tr></table>
  ${kutular}

  ${bolum(`${G} Yüklenenler — Satış`, `${o.yuklenenArac} araç · ${ton(o.yuklenenKg)}`)}
  ${yTablo}

  ${bolum(`${G} Gelenler — Alış`, `${o.gelenArac} araç · ${ton(o.gelenKg)}`)}
  ${gTablo}

  ${kBolum}

  ${bolum("Açık Satış Siparişleri", `${o.acikSatis} sipariş`)}
  ${sTablo}

  ${bolum("Açık Alış Siparişleri", `${o.acikAlis} sipariş`)}
  ${aTablo}

  <div style="margin-top:24px;text-align:center">
    <a href="${IC_RAPOR_UYGULAMA_URL}/ic-piyasa/is-emirleri" style="display:inline-block;background:#10B981;color:#fff;text-decoration:none;font-size:13px;font-weight:bold;padding:10px 18px;border-radius:6px">İç piyasayı uygulamada aç</a>
  </div>
  <div style="margin-top:16px;font-size:11px;color:#94A3B8;text-align:center;line-height:1.5">Yüklenenler / Gelenler: her sipariş tek satır · Araç: o siparişe ${g} giden araç sayısı · Toplam Net: araçların net toplamı · Saat: ilk–son araç.<br>İrsaliyeleri İncele: o müşterinin / tedarikçinin ${g}kü irsaliyeleri tek ekranda açılır (uygulamaya giriş gerekir). Yüklenen miktar: araçların net toplamı + siparişler arası devir.<br>Her gün ${icRaporSaatYazi("sabah")} (dünün raporu), ${icRaporSaatYazi("ogle")} ve ${icRaporSaatYazi("aksam")}'te gönderilir · müşteriye gitmez · alıcılar: İç Piyasa › Bildirimler › Ayarlar.</div>
</td></tr></table>
</td></tr></table></body></html>`;
}
