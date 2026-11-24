/**
 * ANA PANEL > FILO VE BUGDAY DENKLEMI (23.11.2026 aksam). Saf hesap (veri / ag yok); test: tests/panel-filo-plani.test.ts.
 *
 * Kullanici: "Ic piyasaya bak: kac araba bizim arabalarimizdan ayrilan olmus? Bu adam ne yapmis; daha iyisi yapilabilir
 * miydi, bundan sonrasi icin nasil ilerlenir? Ne kadar arabayi bugdaya ne durumda ayirdiginin planini, denklemini kur.
 * Olceklenmeliyiz. Bugday satiyoruz, bugday aliyoruz; TMO'dan fabrikaya bugday cekiyoruz, bir de satis siparisleri var."
 *
 * Veri: panel_filo_durumu (migration 20261123200000). Filo koda yazilmaz (konteyner tasimis + en az 3 is yapmis plakalar).
 * DENKLEM (her is gunu):
 *   bos arac      = filo - kullanilmayan arac - konteyner araci (Gunluk yukleme plani, tur suresine gore)
 *   satis seferi  = acik ic satislardan (nakliye bizde) kalan sefer, once bunlar (musteriye soz verilmis)
 *   bugday seferi = (bos arac - satis araci) x arac basi gunluk sefer (gecmis: filonun alis seferi / arac-gun)
 *   bugday tonu   = bugday seferi x sefer basina ortalama ton (gecmis)
 * Acik alislar (TMO / ajans) kucuk kalandan buyuge bu tonla doldurulur -> her alisin tahmini bitis gunu ve termin uyarisi.
 * Gelecek gunlerde konteyner araci = max(plandaki arac, son 14 is gunu ortalamasi): plan yalniz bugun bilinen booking'leri
 * icerir; ilerideki bos gunler "konteyner yok" demek degildir (24.11.2026 duzeltme: 27.11-08.12 arasi 0 konteyner sayiliyordu).
 * Bugun: kantarda ilk tartimi yapilmis (ikinci tartimi bekleyen) filo araci "kantarda" sayilir, bosta degil (24.11.2026).
 * Gecmis ("ne yapilmis"): son 14 is gununde bosta kalan arac-gun ve o gunlerle tasinabilecek bugday (kullanilmayan arac
 * ayrica gosterilir, kacan kapasiteye sayilmaz: arizali / izinli olabilir).
 */
import { isGunuMu, sonrakiIsGunu, type YuklemePlani } from "@/lib/panel/gunluk-yukleme";

export type FiloGunKaydi = { gun: string; plaka: string; konteyner: number; alis: number; sevk: number };
export type FiloAlis = { no: string; tedarikci: string | null; urun: string | null; hedefKg: number; gelenKg: number; sefer: number; sonTeslim: string | null; termin: string | null };
export type FiloSatis = { no: string; musteri: string | null; urun: string | null; hedefTur: string | null; hedefKg: number | null; hedefArac: number | null; gidenKg: number; sefer: number };
export type FiloVerisi = {
  bugun: string; filo: string[]; gunler: FiloGunKaydi[]; alislar: FiloAlis[]; satislar: FiloSatis[];
  verim: { sefer: number; aracGun: number; ortKg: number };
  /** 24.11.2026: kantarda su an ikinci tartimi bekleyen plakalar (normallestirilmis) */
  kantarda: string[];
};

const sayi = (v: unknown, d = 0) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? d : Number(v));
const metin = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const tarih = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const dizi = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : []);

export function filoVerisiHazirla(ham: unknown): FiloVerisi | null {
  const r = (ham && typeof ham === "object" ? ham : null) as Record<string, unknown> | null;
  const bugun = tarih(r?.bugun);
  if (!r || !bugun) return null;
  const filo = (Array.isArray(r.filo) ? r.filo : []).map(metin).filter((x): x is string => !!x);
  const v = (r.verim && typeof r.verim === "object" ? r.verim : {}) as Record<string, unknown>;
  return {
    bugun, filo,
    gunler: dizi(r.gunler).map((g) => ({ gun: tarih(g.gun) || "", plaka: metin(g.plaka) || "", konteyner: sayi(g.konteyner), alis: sayi(g.alis), sevk: sayi(g.sevk) }))
      .filter((g) => g.gun && g.plaka),
    alislar: dizi(r.alislar).map((a) => ({
      no: metin(a.no) || "—", tedarikci: metin(a.tedarikci), urun: metin(a.urun), hedefKg: sayi(a.hedef_kg), gelenKg: sayi(a.gelen_kg),
      sefer: sayi(a.sefer), sonTeslim: tarih(a.son_teslim), termin: tarih(a.termin),
    })),
    satislar: dizi(r.satislar).map((s) => ({
      no: metin(s.no) || "—", musteri: metin(s.musteri), urun: metin(s.urun), hedefTur: metin(s.hedef_tur),
      hedefKg: s.hedef_kg === null || s.hedef_kg === undefined ? null : sayi(s.hedef_kg), hedefArac: s.hedef_arac === null || s.hedef_arac === undefined ? null : sayi(s.hedef_arac),
      gidenKg: sayi(s.giden_kg), sefer: sayi(s.sefer),
    })),
    verim: { sefer: sayi(v.sefer), aracGun: sayi(v.arac_gun), ortKg: sayi(v.ort_kg) },
    kantarda: (Array.isArray(r.kantarda) ? r.kantarda : []).map(metin).filter((x): x is string => !!x),
  };
}

/** Gecmis az ise varsayilan: arac basi gunde 1,25 sefer, sefer basi 25 t. */
export const VARSAYILAN_SEFER_ARAC_GUN = 1.25;
export const VARSAYILAN_SEFER_KG = 25000;
const GECMIS_IS_GUNU = 14;
const KULLANILMAYAN_IS_GUNU = 7;
const UFUK_IS_GUNU = 60;

export type GunDagilimi = { konteyner: string[]; bugday: string[]; satis: string[]; kantarda: string[]; bosta: string[] };

/** Bir gunde filonun dagilimi: konteyner tasiyan > bugday (alis) > ic satis > kantarda (yalniz bugun) > bosta (her arac tek sinifta). */
export function gunDagilimi(v: Pick<FiloVerisi, "filo" | "gunler">, gun: string, kantarda: string[] = []): GunDagilimi {
  const d: GunDagilimi = { konteyner: [], bugday: [], satis: [], kantarda: [], bosta: [] };
  const kantar = new Set(kantarda);
  for (const p of v.filo) {
    const k = v.gunler.find((g) => g.gun === gun && g.plaka === p);
    if (k && k.konteyner > 0) d.konteyner.push(p);
    else if (k && k.alis > 0) d.bugday.push(p);
    else if (k && k.sevk > 0) d.satis.push(p);
    else if (kantar.has(p)) d.kantarda.push(p);
    else d.bosta.push(p);
  }
  return d;
}

const gunMs = (t: string) => Date.parse(`${t}T00:00:00Z`);
const ekle = (t: string, n: number) => new Date(gunMs(t) + n * 86400000).toISOString().slice(0, 10);
/** bugunden ONCEKI son n is gunu (eskiden yeniye). */
function oncekiIsGunleri(bugun: string, n: number, isGunleri: number[]): string[] {
  const out: string[] = [];
  for (let x = ekle(bugun, -1); out.length < n && x > ekle(bugun, -40); x = ekle(x, -1)) if (isGunuMu(x, isGunleri)) out.unshift(x);
  return out;
}

export type FiloPlanGunu = { tarih: string; konteynerArac: number; satisArac: number; bugdayArac: number; bugdaySefer: number; bugdayTon: number; tahmini: boolean };
export type AlisBitisi = FiloAlis & { kalanKg: number; kalanSefer: number; terminGecti: boolean; bitis: string | null; terminiKacirir: boolean };
export type FiloPlani = {
  filoSayisi: number;
  bugun: GunDagilimi;
  kullanilmayan: { plaka: string; sonIs: string | null }[];
  seferAracGun: number; seferKg: number;
  gecmis: { gunSayisi: number; bostaAracGun: number; bugdayAracGun: number; olasiSefer: number; olasiTon: number; ortKonteynerArac: number };
  gunler: FiloPlanGunu[];
  satisKalanSefer: number;
  alislar: AlisBitisi[];
  toplamKalanKg: number;
  tumBitis: string | null;
};

export function filoPlaniKur(v: FiloVerisi, plan: Pick<YuklemePlani, "gunler">, isGunleri: number[]): FiloPlani {
  const bugun = v.bugun;
  const seferAracGun = v.verim.aracGun >= 10 && v.verim.sefer > 0 ? Math.round((v.verim.sefer / v.verim.aracGun) * 100) / 100 : VARSAYILAN_SEFER_ARAC_GUN;
  const seferKg = v.verim.sefer >= 10 && v.verim.ortKg > 0 ? v.verim.ortKg : VARSAYILAN_SEFER_KG;

  // Kullanilmayan arac: son KULLANILMAYAN_IS_GUNU is gununde (bugun dahil) hic isi yok
  const yakin = new Set([...oncekiIsGunleri(bugun, KULLANILMAYAN_IS_GUNU - 1, isGunleri), bugun]);
  const kantardaSet = new Set(v.kantarda || []);
  const sonIs = (p: string) => v.gunler.filter((g) => g.plaka === p && (g.konteyner + g.alis + g.sevk) > 0).map((g) => g.gun).sort().pop() || null;
  const kullanilmayan = v.filo.filter((p) => !kantardaSet.has(p) && !v.gunler.some((g) => g.plaka === p && yakin.has(g.gun) && (g.konteyner + g.alis + g.sevk) > 0))
    .map((p) => ({ plaka: p, sonIs: sonIs(p) }));
  const kullanilmayanSet = new Set(kullanilmayan.map((k) => k.plaka));
  const aktifFilo = Math.max(0, v.filo.length - kullanilmayan.length);

  // Gecmis: son 14 is gunu (bugun haric)
  const gecmisGunler = oncekiIsGunleri(bugun, GECMIS_IS_GUNU, isGunleri);
  let bostaAracGun = 0, bugdayAracGun = 0, konteynerAracToplam = 0;
  for (const g of gecmisGunler) {
    const d = gunDagilimi(v, g);
    bostaAracGun += d.bosta.filter((p) => !kullanilmayanSet.has(p)).length;
    bugdayAracGun += d.bugday.length;
    konteynerAracToplam += d.konteyner.length;
  }
  const ortKonteynerArac = gecmisGunler.length ? Math.round(konteynerAracToplam / gecmisGunler.length) : 0;
  const olasiSefer = Math.floor(bostaAracGun * seferAracGun);

  // Ic satis (nakliye bizde) kalan sefer
  const satisKalanSefer = v.satislar.reduce((t, s) => {
    if (s.hedefTur === "arac" && s.hedefArac !== null) return t + Math.max(0, s.hedefArac - s.sefer);
    if (s.hedefKg !== null) return t + Math.ceil(Math.max(0, s.hedefKg - s.gidenKg) / seferKg);
    return t;
  }, 0);

  // Onumuzdeki is gunleri: konteyner araci = max(plan, gecmis ortalamasi); bugun dahil degil (gun suruyor)
  const planArac = new Map(plan.gunler.map((g) => [g.tarih, g.arac]));
  const gunler: FiloPlanGunu[] = [];
  let satisKalan = satisKalanSefer;
  for (let x = sonrakiIsGunu(ekle(bugun, 1), isGunleri), i = 0; i < UFUK_IS_GUNU; x = sonrakiIsGunu(ekle(x, 1), isGunleri), i++) {
    const planli = planArac.get(x) || 0;
    const tahmini = ortKonteynerArac > planli;
    const konteynerArac = Math.min(aktifFilo, Math.max(planli, ortKonteynerArac));
    const bos = Math.max(0, aktifFilo - konteynerArac);
    const satisSefer = Math.min(satisKalan, Math.floor(bos * seferAracGun));
    satisKalan -= satisSefer;
    const satisArac = Math.min(bos, Math.ceil(satisSefer / seferAracGun));
    const bugdayArac = bos - satisArac;
    const bugdaySefer = Math.floor(bugdayArac * seferAracGun * 10) / 10;
    gunler.push({ tarih: x, konteynerArac, satisArac, bugdayArac, bugdaySefer, bugdayTon: Math.round((bugdaySefer * seferKg) / 100) / 10, tahmini });
  }

  // Acik alislar termin sirasiyla bugday tonuyla doldurulur
  const sirali = [...v.alislar].map((a) => ({ ...a, kalanKg: Math.max(0, a.hedefKg - a.gelenKg) }))
    .filter((a) => a.kalanKg > 0)
    // 24.11.2026: kucuk kalanlar once (birkac tonluk alis 1.600 t'luk alisin bitmesini beklemiyormus gibi gorunmesin);
    // buyuk alisin bitisi bu yuzden yalniz birkac ton kayar. Termin uyarisi her alis icin ayri.
    .sort((a, b) => a.kalanKg - b.kalanKg || (a.termin || "9999").localeCompare(b.termin || "9999") || a.no.localeCompare(b.no));
  const alislar: AlisBitisi[] = [];
  let gi = 0;
  let gunKalanKg = gunler[0] ? gunler[0].bugdayTon * 1000 : 0;
  for (const a of sirali) {
    let ihtiyac = a.kalanKg;
    let bitis: string | null = null;
    while (ihtiyac > 0 && gi < gunler.length) {
      const al = Math.min(ihtiyac, gunKalanKg);
      ihtiyac -= al; gunKalanKg -= al;
      if (ihtiyac <= 0) { bitis = gunler[gi].tarih; break; }
      gi += 1; gunKalanKg = gunler[gi] ? gunler[gi].bugdayTon * 1000 : 0;
    }
    const terminGecti = !!a.termin && a.termin < bugun;
    alislar.push({ ...a, kalanSefer: Math.ceil(a.kalanKg / seferKg), terminGecti, bitis, terminiKacirir: !!a.termin && (bitis === null || bitis > a.termin) });
  }
  const toplamKalanKg = alislar.reduce((t, a) => t + a.kalanKg, 0);
  return {
    filoSayisi: v.filo.length, bugun: gunDagilimi(v, bugun, v.kantarda || []), kullanilmayan, seferAracGun, seferKg,
    gecmis: { gunSayisi: gecmisGunler.length, bostaAracGun, bugdayAracGun, olasiSefer, olasiTon: Math.round((olasiSefer * seferKg) / 1000), ortKonteynerArac },
    gunler, satisKalanSefer, alislar, toplamKalanKg,
    tumBitis: alislar.length === 0 ? null : alislar.some((a) => a.bitis === null) ? null : alislar.map((a) => a.bitis as string).sort().pop() || null,
  };
}
