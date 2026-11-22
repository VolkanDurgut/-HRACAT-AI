/**
 * ANA PANEL - GUNLUK YUKLEME HEDEFI (23.11.2026). Saf hesap (veri / ag yok); test: tests/panel-gunluk-yukleme.test.ts.
 *
 * Kullanici: "Gunluk yuklenmesi gereken konteyner sayisini da hesaplayabilmeli. Talimat cut-off = konsimento talimatinin
 * gonderilmesi; butun konteynerler alindiginda talimat en erken gonderilir - o tarihe kadar butun konteynerler alinmis
 * olmali. Beyanname = butun konteynerlerin dolu sekilde iceri giris yapmis olmasi. Gunluk yukleme hesaplanmali."
 *
 * Kurallar (her biri mevcut kayitlardan):
 *  - Bos alim  : rezervasyon adedi - eklenen konteyner ("alinan"); TALIMAT cut-off gunune kadar hepsi alinmis olmali
 *                (talimat / draft BL / beyanname verilmisse alim tamam sayilir).
 *  - Yukleme   : rezervasyon adedi - DBA'li konteyner ("dolu"); hedef = BEYANNAME cut-off'undan bir onceki is gunu
 *                (gecmiste son dolu konteyner cut-off'tan ortada ~2 gun once; cut-off gunu yalniz son care). Beyanname
 *                verilmisse yukleme tamam.
 *  - Pencere   : bos ekipman tarihinden once alinamaz / yuklenemez; tarih yoksa hedeften en fazla PENCERE_IS_GUNU once.
 *  - Is gunleri ve kapasite GECMISTEN (son 75 gun DBA tartim gunleri): hic yukleme yapilmayan hafta gunu (Pazar) plan disi;
 *    gunluk ortalama / %75 / en yuksek -> gereken hiz bunlarla karsilastirilir.
 *  - Plan: en yakin hedef once (EDF), her gun ayni hizla; gereken hiz = tum hedeflerin tutturuldugu EN DUSUK gunluk adet.
 * Cut-off'lar duvar saati olarak saklanir (lib/cutoff-utils.ts): gun = metnin ilk 10 karakteri.
 */
export const PENCERE_IS_GUNU = 5;
export const GECMIS_GUN = 75;
const VARSAYILAN_IS_GUNLERI = [1, 2, 3, 4, 5, 6]; // Pzt-Cmt (0 = Pazar)
const HIZ_UST_SINIR = 200;

export type YuklemeIsi = {
  anahtar: string;
  etiket: string;
  dosyaNo: string | null;
  toplam: number;
  alinan: number;
  dolu: number;
  /** Bugun tartilan (DBA) konteyner - bugunun hedefine eklenir */
  bugunDolu: number;
  talimatTarihi: string | null;
  beyanTarihi: string | null;
  ekipmanTarihi: string | null;
  talimatTamam: boolean;
  beyanTamam: boolean;
  /** Dosya acik mi (acilmamis booking'de alinan / dolu takip edilemez) */
  takipli: boolean;
};

export type Kapasite = { gunSayisi: number; ortalama: number; p75: number; max: number; isGunleri: number[] };

export type GunIsi = { anahtar: string; etiket: string; yukle: number; al: number };
export type GunPlani = { tarih: string; yukle: number; al: number; isler: GunIsi[] };
export type IsOzeti = { bugunYukle: number; bugunAl: number; hedefGun: string; alimSonGun: string | null; gecikme: boolean };
export type YuklemePlani = {
  bugun: string;
  isGunuMu: boolean;
  gunler: GunPlani[];
  gerekenHiz: number;
  bugunHedef: number;
  bugunYuklenen: number;
  bugunAl: number;
  risk: "normal" | "yuksek" | "asiyor" | "bilinmiyor";
  ozetler: Record<string, IsOzeti>;
  /** Beyanname cut-off'u olmayan (plan disi) isler */
  plansiz: string[];
  /** Dosyasi acilmamis (alinan / dolu takip edilemez) isler */
  takipsiz: string[];
  /** Hedef gunu gecmis / bugun cut-off gunu olan isler */
  gecikenler: string[];
};

// ---------------------------------------------------------------- tarih yardimcilari (YYYY-MM-DD, UTC gece yarisi)
const gunMs = (t: string) => Date.parse(`${t}T00:00:00Z`);
const tarihOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const haftaGunu = (t: string) => new Date(gunMs(t)).getUTCDay();
const ekle = (t: string, n: number) => tarihOf(gunMs(t) + n * 86400000);
export const gunKismi = (v: string | null | undefined): string | null => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export function isGunuMu(t: string, isGunleri: number[]): boolean {
  return isGunleri.includes(haftaGunu(t));
}
/** t ve sonrasi ilk is gunu. */
export function sonrakiIsGunu(t: string, isGunleri: number[]): string {
  let x = t;
  for (let i = 0; i < 8 && !isGunuMu(x, isGunleri); i++) x = ekle(x, 1);
  return x;
}
/** t'den ONCEKI (t haric) son is gunu. */
export function oncekiIsGunu(t: string, isGunleri: number[]): string {
  let x = ekle(t, -1);
  for (let i = 0; i < 8 && !isGunuMu(x, isGunleri); i++) x = ekle(x, -1);
  return x;
}
/** t ve oncesi son is gunu. */
function enGecIsGunu(t: string, isGunleri: number[]): string {
  return isGunuMu(t, isGunleri) ? t : oncekiIsGunu(t, isGunleri);
}
function isGunleriArasi(bas: string, bit: string, isGunleri: number[]): string[] {
  const out: string[] = [];
  for (let x = bas; x <= bit && out.length < 400; x = ekle(x, 1)) if (isGunuMu(x, isGunleri)) out.push(x);
  return out;
}
/** bit'ten geriye n is gunu (bit dahil degil); en az bas. */
function geriIsGunu(bit: string, n: number, isGunleri: number[]): string {
  let x = bit;
  for (let i = 0; i < n; i++) x = oncekiIsGunu(x, isGunleri);
  return x;
}

// ---------------------------------------------------------------- kapasite
/**
 * Gecmis yukleme gunlerinden (her DBA'li konteynerin tartim gunu, YYYY-MM-DD) kapasite. Is gunleri: gecmiste en az 3
 * farkli gun yukleme yapilan hafta gunleri; veri azsa Pzt-Cmt.
 */
export function kapasiteHesapla(yuklemeGunleri: string[]): Kapasite {
  const say = new Map<string, number>();
  for (const g of yuklemeGunleri) if (gunKismi(g)) say.set(g.slice(0, 10), (say.get(g.slice(0, 10)) || 0) + 1);
  const adetler = Array.from(say.values()).sort((a, b) => a - b);
  const haftaSay = new Map<number, number>();
  for (const g of Array.from(say.keys())) haftaSay.set(haftaGunu(g), (haftaSay.get(haftaGunu(g)) || 0) + 1);
  const gecmisIsGunleri = Array.from(haftaSay.entries()).filter(([, n]) => n >= 3).map(([h]) => h).sort();
  const isGunleri = adetler.length >= 10 && gecmisIsGunleri.length >= 3 ? gecmisIsGunleri : VARSAYILAN_IS_GUNLERI;
  if (adetler.length === 0) return { gunSayisi: 0, ortalama: 0, p75: 0, max: 0, isGunleri };
  const ortalama = Math.round((adetler.reduce((a, b) => a + b, 0) / adetler.length) * 10) / 10;
  const p75 = adetler[Math.min(adetler.length - 1, Math.ceil(adetler.length * 0.75) - 1)];
  return { gunSayisi: adetler.length, ortalama, p75, max: adetler[adetler.length - 1], isGunleri };
}

// ---------------------------------------------------------------- plan
type Hazir = {
  is: YuklemeIsi; kalanYukle: number; kalanAl: number; bosHazir: number;
  hedef: string; alimSon: string | null; erken: string; gecikme: boolean;
};

function hazirla(is: YuklemeIsi, bas: string, isGunleri: number[]): Hazir | null {
  const kalanYukle = is.beyanTamam ? 0 : Math.max(0, is.toplam - is.dolu);
  const alimTamam = is.talimatTamam || is.beyanTamam;
  const kalanAl = alimTamam ? 0 : Math.max(0, is.toplam - is.alinan);
  if (kalanYukle === 0 && kalanAl === 0) return null;
  const beyan = gunKismi(is.beyanTarihi);
  if (!beyan) return null;
  let gecikme = false;
  // Hedef: beyanname gunundan bir onceki is gunu; gecmisse cut-off gunu (son care), o da gecmisse bugun
  let hedef = oncekiIsGunu(beyan, isGunleri);
  if (hedef < bas) { gecikme = true; hedef = beyan >= bas ? sonrakiIsGunu(bas, isGunleri) : bas; }
  const talimat = gunKismi(is.talimatTarihi);
  let alimSon = talimat ? enGecIsGunu(talimat, isGunleri) : null;
  if (alimSon && alimSon < bas) { if (kalanAl > 0) gecikme = true; alimSon = bas; }
  const ekipman = gunKismi(is.ekipmanTarihi);
  let erken = ekipman ? sonrakiIsGunu(ekipman, isGunleri) : geriIsGunu(hedef, PENCERE_IS_GUNU, isGunleri);
  if (erken < bas) erken = bas;
  if (erken > hedef) { hedef = erken; gecikme = true; }
  return { is, kalanYukle, kalanAl, bosHazir: alimTamam ? kalanYukle : Math.max(0, is.alinan - is.dolu), hedef, alimSon, erken, gecikme };
}

type Atama = Map<string, Map<string, number>>; // gun -> anahtar -> yukle

function simule(hazir: Hazir[], gunler: string[], hiz: number): Atama | null {
  const kalan = new Map(hazir.map((h) => [h.is.anahtar, h.kalanYukle]));
  const sirali = [...hazir].sort((a, b) => a.hedef.localeCompare(b.hedef) || (a.alimSon || "9").localeCompare(b.alimSon || "9") || a.is.anahtar.localeCompare(b.is.anahtar));
  const atama: Atama = new Map();
  for (const g of gunler) {
    let c = hiz;
    const gun = new Map<string, number>();
    for (const h of sirali) {
      if (c <= 0) break;
      const k = kalan.get(h.is.anahtar) || 0;
      if (k <= 0 || h.erken > g) continue;
      const al = Math.min(c, k);
      gun.set(h.is.anahtar, al);
      kalan.set(h.is.anahtar, k - al);
      c -= al;
    }
    atama.set(g, gun);
    for (const h of sirali) if (h.hedef === g && (kalan.get(h.is.anahtar) || 0) > 0) return null;
  }
  return Array.from(kalan.values()).some((k) => k > 0) ? null : atama;
}

export function yuklemePlaniKur(isler: YuklemeIsi[], kapasite: Kapasite, bugun: string): YuklemePlani {
  const isGunleri = kapasite.isGunleri.length ? kapasite.isGunleri : VARSAYILAN_IS_GUNLERI;
  const isGunuBugun = isGunuMu(bugun, isGunleri);
  const bas = sonrakiIsGunu(bugun, isGunleri);
  const plansiz: string[] = [];
  const hazir: Hazir[] = [];
  for (const is of isler) {
    const h = hazirla(is, bas, isGunleri);
    if (h) hazir.push(h);
    else if (!gunKismi(is.beyanTarihi) && !is.beyanTamam && is.toplam > Math.max(is.dolu, 0)) plansiz.push(is.anahtar);
  }
  const son = hazir.reduce((m, h) => (h.hedef > m ? h.hedef : m), bas);
  const gunler = isGunleriArasi(bas, son, isGunleri);
  // En dusuk gunluk hiz (alt sinir: herhangi bir hedefe kadar birikenin gun sayisina orani)
  let atama: Atama | null = null;
  let hiz = 0;
  const toplamYukle = hazir.reduce((t, h) => t + h.kalanYukle, 0);
  if (toplamYukle > 0) {
    for (hiz = 1; hiz <= HIZ_UST_SINIR; hiz++) { atama = simule(hazir, gunler, hiz); if (atama) break; }
    if (!atama) { hiz = HIZ_UST_SINIR; atama = simule(hazir, gunler, Number.MAX_SAFE_INTEGER) || new Map(); }
  } else atama = new Map();

  // Bos alim: yuklemeden once (oncelik zaten alinmis bos), talimat gunune kadar tamamlanir
  const alimlar = new Map<string, Map<string, number>>(); // gun -> anahtar -> al
  const alimEkle = (g: string, a: string, n: number) => { if (n <= 0) return; const m = alimlar.get(g) || new Map(); m.set(a, (m.get(a) || 0) + n); alimlar.set(g, m); };
  for (const h of hazir) {
    let bos = h.bosHazir;
    let kalanAl = h.kalanAl;
    const alimSinir = h.alimSon || h.hedef;
    for (const g of gunler) {
      if (kalanAl <= 0) break;
      const y = atama.get(g)?.get(h.is.anahtar) || 0;
      const gerek = Math.max(0, y - bos);
      bos = Math.max(0, bos - y);
      if (gerek > 0) { const n = Math.min(gerek, kalanAl); alimEkle(g <= alimSinir ? g : alimSinir < bas ? bas : alimSinir, h.is.anahtar, n); kalanAl -= n; }
    }
    // Yuklenmeyecek olsa da talimat icin alinmasi gereken kalan bos: talimat gununde (en erken pencere icinde)
    if (kalanAl > 0) alimEkle(alimSinir < h.erken ? h.erken : alimSinir, h.is.anahtar, kalanAl);
  }

  const etiket = new Map(isler.map((i) => [i.anahtar, i.etiket]));
  const tumGunler = Array.from(new Set([...Array.from(atama.keys()), ...Array.from(alimlar.keys())])).sort();
  const planGunleri: GunPlani[] = tumGunler.map((g) => {
    const y = atama!.get(g) || new Map<string, number>();
    const a = alimlar.get(g) || new Map<string, number>();
    const anahtarlar = Array.from(new Set([...Array.from(y.keys()), ...Array.from(a.keys())]));
    const isler2 = anahtarlar.map((k) => ({ anahtar: k, etiket: etiket.get(k) || k, yukle: y.get(k) || 0, al: a.get(k) || 0 }))
      .filter((x) => x.yukle > 0 || x.al > 0).sort((p, q) => q.yukle - p.yukle || q.al - p.al || p.etiket.localeCompare(q.etiket, "tr"));
    return { tarih: g, yukle: isler2.reduce((t, x) => t + x.yukle, 0), al: isler2.reduce((t, x) => t + x.al, 0), isler: isler2 };
  }).filter((g) => g.yukle > 0 || g.al > 0);

  const bugunPlan = isGunuBugun ? planGunleri.find((g) => g.tarih === bugun) : undefined;
  const bugunYuklenen = isler.reduce((t, i) => t + Math.max(0, i.bugunDolu), 0);
  const ozetler: Record<string, IsOzeti> = {};
  for (const h of hazir) {
    const b = bugunPlan?.isler.find((x) => x.anahtar === h.is.anahtar);
    ozetler[h.is.anahtar] = { bugunYukle: b?.yukle || 0, bugunAl: b?.al || 0, hedefGun: h.hedef, alimSonGun: h.kalanAl > 0 ? h.alimSon : null, gecikme: h.gecikme };
  }
  const risk: YuklemePlani["risk"] = kapasite.gunSayisi < 10 || hiz === 0 ? (hiz === 0 ? "normal" : "bilinmiyor")
    : hiz <= kapasite.p75 ? "normal" : hiz <= kapasite.max ? "yuksek" : "asiyor";
  return {
    bugun, isGunuMu: isGunuBugun, gunler: planGunleri, gerekenHiz: hiz,
    bugunHedef: (bugunPlan?.yukle || 0) + (isGunuBugun ? bugunYuklenen : 0), bugunYuklenen, bugunAl: bugunPlan?.al || 0,
    risk, ozetler, plansiz,
    takipsiz: isler.filter((i) => !i.takipli && hazir.some((h) => h.is.anahtar === i.anahtar)).map((i) => i.anahtar),
    gecikenler: hazir.filter((h) => h.gecikme).map((h) => h.is.anahtar),
  };
}

// ---------------------------------------------------------------- girdiler
type PlanDosyasi = {
  id: string; dosya_no: string | null; alici_firma: string | null;
  konsimento_dosya_url?: string | null; draft_bl_dosya_url?: string | null; beyanname_dosya_url?: string | null;
  rezervasyonlar: { konteyner_adedi?: number | null; talimat_cutoff: string | null; beyanname_cutoff: string | null; ekipman_alim_tarihi?: string | null }[];
  konteynerler: { dba_dosya_url?: string | null }[];
};
const enErken = (xs: (string | null | undefined)[]) => xs.map(gunKismi).filter((x): x is string => !!x).sort()[0] || null;

/** Acik dosya -> yukleme isi (rezervasyonsuz dosya plana girmez: adet / cut-off yok). bugunDolu: bugun tartilanlar. */
export function dosyaIsi(d: PlanDosyasi, bugunDolu: number): YuklemeIsi | null {
  const toplam = d.rezervasyonlar.reduce((t, r) => t + (r.konteyner_adedi || 0), 0);
  if (d.rezervasyonlar.length === 0 || toplam <= 0) return null;
  return {
    anahtar: `dosya:${d.id}`, etiket: d.alici_firma || d.dosya_no || "—", dosyaNo: d.dosya_no,
    toplam, alinan: d.konteynerler.length, dolu: d.konteynerler.filter((k) => !!k.dba_dosya_url).length, bugunDolu,
    talimatTarihi: enErken(d.rezervasyonlar.map((r) => r.talimat_cutoff)), beyanTarihi: enErken(d.rezervasyonlar.map((r) => r.beyanname_cutoff)),
    ekipmanTarihi: enErken(d.rezervasyonlar.map((r) => r.ekipman_alim_tarihi)),
    talimatTamam: !!(d.konsimento_dosya_url || d.draft_bl_dosya_url), beyanTamam: !!d.beyanname_dosya_url, takipli: true,
  };
}

/** Dosyasi acilmamis booking (Yukleme Plani): alinan / dolu 0 sayilir, takip edilemez. */
export function bookingIsi(s: { anahtar: string; musteri: string | null; konteyner: number | null; talimat_cutoff: string | null; beyan_cutoff: string | null; bos_ekipman_tarihi: string | null }): YuklemeIsi | null {
  if (!s.konteyner || s.konteyner <= 0) return null;
  return {
    anahtar: `is:${s.anahtar}`, etiket: s.musteri || "—", dosyaNo: null, toplam: s.konteyner, alinan: 0, dolu: 0, bugunDolu: 0,
    talimatTarihi: gunKismi(s.talimat_cutoff), beyanTarihi: gunKismi(s.beyan_cutoff), ekipmanTarihi: gunKismi(s.bos_ekipman_tarihi),
    talimatTamam: false, beyanTamam: false, takipli: false,
  };
}

const GUN_ADI = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
/** "Pzt 23.11" */
export function gunEtiketi(t: string): string {
  return `${GUN_ADI[haftaGunu(t)]} ${t.slice(8, 10)}.${t.slice(5, 7)}`;
}
