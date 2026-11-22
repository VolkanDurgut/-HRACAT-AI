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
 *
 * 23.11.2026 gece (kullanici kurallari): "Talimat cut-off'u icin tartim gerekmez; rezervasyon kadar konteyner numarasi
 * yeterli (bos alinmis olmali). Talimat tarihi sabittir. Ekipman alim tarihi ve ardiyesiz giris rezervasyonda belirtilir;
 * ardiyesiz giris degisebilir." + "50'lik 1,5 saatte, 25'lik 3-3,5 saatte doluyor."
 *  - EN AZ (sert): beyanname cut-off'u - YOL_KAPI_SAAT (fabrika -> Ambarli ~2 sa + kapi ~1 sa) - dolum suresi (cuvala gore)
 *    gunun YUKLEME_BASLANGIC_SAAT'inden once kaliyorsa son gun bir onceki is gunu. "Bugun en az" = bundan sonra gunde en
 *    fazla gecmisin en yuksek gunu kadar yuklense bile bugun yuklenmesi ZORUNLU olan adet.
 *  - ONERILEN: hedef beyanname gunundan bir onceki is gunu (sert son gunu gecemez), dengeli hiz.
 *  - Ardiyesiz giris: yukleme en erken ardiyesiz girisin bir onceki is gunu (ertesi gun limana girer); sert son gune
 *    sigmiyorsa ardiye riski isaretlenir (kural yumusak).
 */
export const PENCERE_IS_GUNU = 5;
/**
 * 23.11.2026 ARAC (kullanici: "Konteyner yuklemelerinde disariya araba tasirmaya calis. Tarihlere yetisebildigimiz an
 * kenara bosa araba cikartmaya calis."): cut-off'lar tutturulurken GUNLUK ARAC SAYISI en aza indirilir, kalan araclar
 * bosa cikar (dis is / ic piyasa). Tur = fabrikaya yol + dolum + limana yol + kapi; arac gunde ARAC_GUNLUK_SAAT calisir.
 * Dorse degismez: her tur tek konteyner (bosu depodan alir, fabrikada doldurur, limana birakir).
 */
export const FILO_ARAC = 8;
/** Kullanici: "8 saat calisiyorlar, bazen mesai oluyor." Normal gun 8 sa (tur basina 1 arac); mesaiyle en fazla ~13 sa. */
export const ARAC_GUNLUK_SAAT = 8;
export const MESAI_GUNLUK_SAAT = 13;
export const YOL_SAAT = 2;
export const KAPI_SAAT = 1;
/** Bir konteynerin tur suresi (saat): 25 kg ~8,5; 50 kg ~6,5. */
export function turSaati(cuvalKg: 25 | 50 | null | undefined): number {
  return YOL_SAAT + dolumSaati(cuvalKg) + YOL_SAAT + KAPI_SAAT;
}
/** Turlari araclara yerlestirir (buyukten kucuge, ilk sigan arac); gereken arac sayisi. */
export function aracIhtiyaci(turlar: number[], gunlukSaat: number = ARAC_GUNLUK_SAAT): number {
  const kalan: number[] = [];
  for (const t of [...turlar].sort((a, b) => b - a)) {
    const i = kalan.findIndex((k) => k + 1e-9 >= t);
    if (i >= 0) kalan[i] -= t; else kalan.push(Math.max(0, gunlukSaat - t));
  }
  return kalan.length;
}
export const YOL_KAPI_SAAT = 3;
export const YUKLEME_BASLANGIC_SAAT = 7;
const VARSAYILAN_GUNLUK_TAVAN = 13;
/** Konteyner dolum suresi (saat): 50 kg cuval ~1,5; 25 kg ~3-3,5; bilinmiyorsa uzun olan (temkinli). */
export function dolumSaati(cuvalKg: 25 | 50 | null | undefined): number {
  return cuvalKg === 50 ? 1.5 : 3.5;
}
/** Ambalaj metinlerinden cuval tipi: yalniz 50 KG -> 50, 25 KG gecen -> 25 (karisikta yavas olan), yoksa null. */
export function cuvalKgOku(...metinler: (string | null | undefined)[]): 25 | 50 | null {
  const m = metinler.filter(Boolean).join(" ");
  const k25 = /\b25\s*KG/i.test(m);
  const k50 = /\b50\s*KG/i.test(m);
  return k25 ? 25 : k50 ? 50 : null;
}
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
  /** Duvar saati "YYYY-MM-DDTHH:MM" (saat bazli son tartim / bos alim saati icin) */
  talimatZaman?: string | null;
  beyanZaman?: string | null;
  ardiyesizTarihi?: string | null;
  cuvalKg?: 25 | 50 | null;
};

export type Kapasite = { gunSayisi: number; ortalama: number; p75: number; max: number; isGunleri: number[] };

export type GunIsi = { anahtar: string; etiket: string; yukle: number; al: number };
export type GunPlani = { tarih: string; yukle: number; al: number; isler: GunIsi[]; dolumSaat: number; arac: number; aracMesaili: number };
export type IsOzeti = {
  bugunYukle: number; bugunAl: number; hedefGun: string; alimSonGun: string | null; gecikme: boolean;
  /** Sert son yukleme gunu (saat bazli) */
  sonGun?: string;
  /** Bos alim son saati (talimat cut-off'u, "HH:MM") - alim son gunu bugunse gosterilir */
  alimSonSaat?: string | null;
  /** Bos alimin son gunu bugun mu (vurgu) */
  alimSonBugun?: boolean;
  ardiyeRiski?: boolean;
};
export type YuklemePlani = {
  bugun: string;
  isGunuMu: boolean;
  gunler: GunPlani[];
  gerekenHiz: number;
  bugunHedef: number;
  bugunYuklenen: number;
  bugunAl: number;
  /** Bugun (ya da ilk is gunu) yuklenmesi ZORUNLU kalan adet: yapilmazsa beyanname cut-off'u kacar */
  bugunEnAz: number;
  /** Ardiyesiz giristen once limana girmesi kacinilmaz isler */
  ardiyeRiskleri: string[];
  /** Arac: filo, bugun gereken (bugun yuklenenler dahil), bugun bosa cikabilecek, en yogun gun */
  filo: number;
  bugunArac: number;
  bosArac: number;
  enCokArac: number;
  /** Mesaiyle (gunde ~13 sa; 50 kg'da arac basi 2 tur) bugun gereken arac */
  bugunAracMesaili: number;
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
  hedef: string; sonGun: string; alimSon: string | null; erken: string; gecikme: boolean; ardiyeRiski: boolean;
};

/** "YYYY-MM-DDTHH:MM..." -> gunun dakikasi (duvar saati); saat yoksa null. */
function gunDakikasi(v: string | null | undefined): number | null {
  const m = (v || "").match(/^\d{4}-\d{2}-\d{2}[T ](\d{2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export const zamanKismi = (v: string | null | undefined): string | null =>
  v && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v) ? `${v.slice(0, 10)}T${v.slice(11, 16)}` : null;

/**
 * Sert son yukleme gunu: beyanname saati - (yol + kapi) - dolum >= yukleme baslangici ise beyanname gunu (is gunuyse),
 * degilse bir onceki is gunu. Saat bilinmiyorsa temkinli: bir onceki is gunu.
 */
export function sertSonGun(beyanGun: string, beyanZaman: string | null | undefined, cuvalKg: 25 | 50 | null | undefined, isGunleri: number[]): string {
  const dk = gunKismi(beyanZaman) === beyanGun ? gunDakikasi(beyanZaman) : null;
  if (dk === null) return oncekiIsGunu(beyanGun, isGunleri);
  const baslangic = dk - (YOL_KAPI_SAAT + dolumSaati(cuvalKg)) * 60;
  return isGunuMu(beyanGun, isGunleri) && baslangic >= YUKLEME_BASLANGIC_SAAT * 60 ? beyanGun : oncekiIsGunu(beyanGun, isGunleri);
}

function hazirla(is: YuklemeIsi, bas: string, isGunleri: number[]): Hazir | null {
  const kalanYukle = is.beyanTamam ? 0 : Math.max(0, is.toplam - is.dolu);
  const alimTamam = is.talimatTamam || is.beyanTamam;
  const kalanAl = alimTamam ? 0 : Math.max(0, is.toplam - is.alinan);
  if (kalanYukle === 0 && kalanAl === 0) return null;
  const beyan = gunKismi(is.beyanTarihi);
  if (!beyan) return null;
  let gecikme = false;
  let ardiyeRiski = false;
  // Sert son gun (saat bazli); gecmisse cut-off kacti / kaciyor -> ilk is gunu, isaretli
  let sonGun = sertSonGun(beyan, is.beyanZaman, is.cuvalKg, isGunleri);
  if (sonGun < bas) { gecikme = true; sonGun = bas; }
  // Onerilen hedef: beyanname gunundan bir onceki is gunu; sert son gunu gecemez
  let hedef = oncekiIsGunu(beyan, isGunleri);
  if (hedef < bas) hedef = bas;
  if (hedef > sonGun) hedef = sonGun;
  const talimat = gunKismi(is.talimatTarihi);
  let alimSon = talimat ? enGecIsGunu(talimat, isGunleri) : null;
  if (alimSon && alimSon < bas) { if (kalanAl > 0) gecikme = true; alimSon = bas; }
  const ekipman = gunKismi(is.ekipmanTarihi);
  let erken = ekipman ? sonrakiIsGunu(ekipman, isGunleri) : geriIsGunu(hedef, PENCERE_IS_GUNU, isGunleri);
  if (erken < bas) erken = bas;
  // Ardiyesiz giris (yumusak): yukleme en erken bir onceki is gunu; sert son gune sigmiyorsa ardiye riski
  const ard = gunKismi(is.ardiyesizTarihi);
  if (ard && kalanYukle > 0) {
    const ardErken = oncekiIsGunu(ard, isGunleri);
    if (ardErken > erken) { if (ardErken <= sonGun) erken = ardErken; else ardiyeRiski = true; }
  }
  if (erken > hedef) { hedef = erken; if (hedef > sonGun) gecikme = true; }
  return { is, kalanYukle, kalanAl, bosHazir: alimTamam ? kalanYukle : Math.max(0, is.alinan - is.dolu), hedef, sonGun, alimSon, erken, gecikme, ardiyeRiski };
}

type Atama = Map<string, Map<string, number>>; // gun -> anahtar -> yukle

/**
 * bugunYapilan: bugun zaten yuklenen (tartilan) adet - bugunun kotasindan duser. Yoksa yukledikce kalan azalir ama
 * bugunun hedefi buyurdu (6 yukle -> yeniden hesap -> "bugun 5 daha"). Hedef gun icinde SABIT kalir.
 */
function simule(hazir: Hazir[], gunler: string[], hiz: number, bugun: string, bugunYapilan: number): Atama | null {
  const kalan = new Map(hazir.map((h) => [h.is.anahtar, h.kalanYukle]));
  const sirali = [...hazir].sort((a, b) => a.hedef.localeCompare(b.hedef) || (a.alimSon || "9").localeCompare(b.alimSon || "9") || a.is.anahtar.localeCompare(b.is.anahtar));
  const atama: Atama = new Map();
  for (const g of gunler) {
    let c = g === bugun ? Math.max(0, hiz - bugunYapilan) : hiz;
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
  const bugunYapilan = isGunuMu(bugun, isGunleri) ? isler.reduce((t, i) => t + Math.max(0, i.bugunDolu), 0) : 0;
  const tur = new Map(isler.map((i) => [i.anahtar, turSaati(i.cuvalKg)]));
  const bugunTurlari = isGunuMu(bugun, isGunleri) ? isler.flatMap((i) => Array(Math.max(0, i.bugunDolu)).fill(turSaati(i.cuvalKg)) as number[]) : [];
  const gunTurlari = (a: Atama, g: string) => {
    const t = Array.from(a.get(g)?.entries() || []).flatMap(([k, n]) => Array(n).fill(tur.get(k) || turSaati(null)) as number[]);
    return g === bugun ? [...t, ...bugunTurlari] : t;
  };
  const gunAraci = (a: Atama, g: string, saat: number = ARAC_GUNLUK_SAAT) => aracIhtiyaci(gunTurlari(a, g), saat);
  // Secim olcusu: once normal mesaide en yogun gunun araci, sonra mesaili (ayni arac sayisinda mesai ihtiyaci az olan)
  const enCok = (a: Atama) => Array.from(a.keys()).reduce((m, g) => Math.max(m, gunAraci(a, g) * 100 + gunAraci(a, g, MESAI_GUNLUK_SAAT)), 0);
  if (toplamYukle > 0) {
    for (hiz = Math.max(1, bugunYapilan); hiz <= HIZ_UST_SINIR; hiz++) { atama = simule(hazir, gunler, hiz, bugun, bugunYapilan); if (atama) break; }
    if (!atama) { hiz = HIZ_UST_SINIR; atama = simule(hazir, gunler, Number.MAX_SAFE_INTEGER, bugun, 0) || new Map(); }
    else {
      // Arac: en dusuk hizdan baslayip birkac hiz dene; en yogun gunun ARAC sayisi en az olan plani sec (esitlikte dusuk hiz).
      // 25 kg (1 tur/gun) ve 50 kg (2 tur/gun) farki yuzunden ayni konteyner sayisi farkli arac ister.
      let enIyi = { a: atama, h: hiz, arac: enCok(atama) };
      for (let h = hiz + 1; h <= hiz + 4; h++) {
        const a = simule(hazir, gunler, h, bugun, bugunYapilan);
        if (!a) continue;
        const ar = enCok(a);
        if (ar < enIyi.arac) enIyi = { a, h, arac: ar };
      }
      atama = enIyi.a;
      hiz = enIyi.h;
    }
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
  const dolum = new Map(isler.map((i) => [i.anahtar, dolumSaati(i.cuvalKg)]));
  const tumGunler = Array.from(new Set([...Array.from(atama.keys()), ...Array.from(alimlar.keys())])).sort();
  const planGunleri: GunPlani[] = tumGunler.map((g) => {
    const y = atama!.get(g) || new Map<string, number>();
    const a = alimlar.get(g) || new Map<string, number>();
    const anahtarlar = Array.from(new Set([...Array.from(y.keys()), ...Array.from(a.keys())]));
    const isler2 = anahtarlar.map((k) => ({ anahtar: k, etiket: etiket.get(k) || k, yukle: y.get(k) || 0, al: a.get(k) || 0 }))
      .filter((x) => x.yukle > 0 || x.al > 0).sort((p, q) => q.yukle - p.yukle || q.al - p.al || p.etiket.localeCompare(q.etiket, "tr"));
    return {
      tarih: g, yukle: isler2.reduce((t, x) => t + x.yukle, 0), al: isler2.reduce((t, x) => t + x.al, 0), isler: isler2,
      dolumSaat: Math.round(isler2.reduce((t, x) => t + x.yukle * (dolum.get(x.anahtar) || dolumSaati(null)), 0) * 10) / 10,
      arac: gunAraci(atama!, g),
      aracMesaili: gunAraci(atama!, g, MESAI_GUNLUK_SAAT),
    };
  }).filter((g) => g.yukle > 0 || g.al > 0);

  const bugunPlan = isGunuBugun ? planGunleri.find((g) => g.tarih === bugun) : undefined;
  const bugunYuklenen = isler.reduce((t, i) => t + Math.max(0, i.bugunDolu), 0);
  const ozetler: Record<string, IsOzeti> = {};
  for (const h of hazir) {
    const b = bugunPlan?.isler.find((x) => x.anahtar === h.is.anahtar);
    const talimatSaat = zamanKismi(h.is.talimatZaman);
    ozetler[h.is.anahtar] = {
      bugunYukle: b?.yukle || 0, bugunAl: b?.al || 0, hedefGun: h.hedef, alimSonGun: h.kalanAl > 0 ? h.alimSon : null, gecikme: h.gecikme,
      sonGun: h.sonGun, ardiyeRiski: h.ardiyeRiski,
      // 23.11.2026 duzeltme: saat yalniz son alim gunu BUGUNSE yalin ("15:00"); ileri gunde gun etiketiyle ("Per 26.11 10:00")
      alimSonSaat: h.kalanAl > 0 && talimatSaat && talimatSaat.slice(0, 10) === h.alimSon
        ? (h.alimSon === bugun ? talimatSaat.slice(11, 16) : `${gunEtiketi(h.alimSon)} ${talimatSaat.slice(11, 16)}`) : null,
      alimSonBugun: h.kalanAl > 0 && h.alimSon === bugun,
    };
  }
  // En az: bugunden sonra her is gunu gecmisin en yuksek gunu kadar yuklense bile bugun yuklenmesi ZORUNLU olan adet
  const tavan = kapasite.gunSayisi >= 10 && kapasite.max > 0 ? kapasite.max : VARSAYILAN_GUNLUK_TAVAN;
  let bugunEnAz = 0;
  for (const d of Array.from(new Set(hazir.map((h) => h.sonGun))).sort()) {
    const vade = hazir.filter((h) => h.sonGun <= d).reduce((t, h) => t + h.kalanYukle, 0);
    const sonraki = isGunleriArasi(ekle(bas, 1), d, isGunleri).length;
    bugunEnAz = Math.max(bugunEnAz, vade - sonraki * tavan);
  }
  const risk: YuklemePlani["risk"] = kapasite.gunSayisi < 10 || hiz === 0 ? (hiz === 0 ? "normal" : "bilinmiyor")
    : hiz <= kapasite.p75 ? "normal" : hiz <= kapasite.max ? "yuksek" : "asiyor";
  return {
    bugun, isGunuMu: isGunuBugun, gunler: planGunleri, gerekenHiz: hiz,
    bugunHedef: (bugunPlan?.yukle || 0) + (isGunuBugun ? bugunYuklenen : 0), bugunYuklenen, bugunAl: bugunPlan?.al || 0,
    bugunEnAz, ardiyeRiskleri: hazir.filter((h) => h.ardiyeRiski).map((h) => h.is.anahtar),
    filo: FILO_ARAC,
    bugunArac: isGunuBugun ? (bugunPlan?.arac ?? aracIhtiyaci(bugunTurlari)) : 0,
    bosArac: isGunuBugun ? Math.max(0, FILO_ARAC - (bugunPlan?.arac ?? aracIhtiyaci(bugunTurlari))) : FILO_ARAC,
    enCokArac: planGunleri.reduce((m, g) => Math.max(m, g.arac), 0),
    bugunAracMesaili: isGunuBugun ? (bugunPlan?.aracMesaili ?? aracIhtiyaci(bugunTurlari, MESAI_GUNLUK_SAAT)) : 0,
    risk, ozetler, plansiz,
    takipsiz: isler.filter((i) => !i.takipli && hazir.some((h) => h.is.anahtar === i.anahtar)).map((i) => i.anahtar),
    gecikenler: hazir.filter((h) => h.gecikme).map((h) => h.is.anahtar),
  };
}

// ---------------------------------------------------------------- girdiler
type PlanDosyasi = {
  id: string; dosya_no: string | null; alici_firma: string | null;
  konsimento_dosya_url?: string | null; draft_bl_dosya_url?: string | null; beyanname_dosya_url?: string | null;
  ambalaj?: string | null; detayli_ambalaj?: string | null;
  rezervasyonlar: { konteyner_adedi?: number | null; talimat_cutoff: string | null; beyanname_cutoff: string | null; ekipman_alim_tarihi?: string | null; ardiyesiz_giris?: string | null }[];
  konteynerler: { dba_dosya_url?: string | null }[];
};
const enErken = (xs: (string | null | undefined)[]) => xs.map(gunKismi).filter((x): x is string => !!x).sort()[0] || null;
const enErkenZaman = (xs: (string | null | undefined)[]) => xs.map(zamanKismi).filter((x): x is string => !!x).sort()[0] || null;

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
    talimatZaman: enErkenZaman(d.rezervasyonlar.map((r) => r.talimat_cutoff)), beyanZaman: enErkenZaman(d.rezervasyonlar.map((r) => r.beyanname_cutoff)),
    ardiyesizTarihi: enErken(d.rezervasyonlar.map((r) => r.ardiyesiz_giris)), cuvalKg: cuvalKgOku(d.ambalaj, d.detayli_ambalaj),
  };
}

/** Dosyasi acilmamis booking (Yukleme Plani): alinan / dolu 0 sayilir, takip edilemez. */
export function bookingIsi(s: {
  anahtar: string; musteri: string | null; konteyner: number | null; talimat_cutoff: string | null; beyan_cutoff: string | null; bos_ekipman_tarihi: string | null;
  ardiyesiz_giris?: string | null; ambalaj?: string | null;
}): YuklemeIsi | null {
  if (!s.konteyner || s.konteyner <= 0) return null;
  return {
    anahtar: `is:${s.anahtar}`, etiket: s.musteri || "—", dosyaNo: null, toplam: s.konteyner, alinan: 0, dolu: 0, bugunDolu: 0,
    talimatTarihi: gunKismi(s.talimat_cutoff), beyanTarihi: gunKismi(s.beyan_cutoff), ekipmanTarihi: gunKismi(s.bos_ekipman_tarihi),
    talimatTamam: false, beyanTamam: false, takipli: false,
    talimatZaman: zamanKismi(s.talimat_cutoff), beyanZaman: zamanKismi(s.beyan_cutoff), ardiyesizTarihi: gunKismi(s.ardiyesiz_giris), cuvalKg: cuvalKgOku(s.ambalaj),
  };
}

const GUN_ADI = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
/** "Pzt 23.11" */
export function gunEtiketi(t: string): string {
  return `${GUN_ADI[haftaGunu(t)]} ${t.slice(8, 10)}.${t.slice(5, 7)}`;
}
