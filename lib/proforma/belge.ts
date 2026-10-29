/**
 * PROFORMA OLUSTURUCU - belge verisi ve otomatik doldurma (17.10.2026).
 *
 * Tek ekranlik "Yeni Proforma" bu modulu kullanir: musteri secilince son
 * proformanin / son dosyanin bilgileri gelir, urun satirlarindan toplamlar,
 * paketleme satiri, marka satiri ve ikinci kutu (ADVANCE / DEPOSIT / BALANCE)
 * onerilir. PDF (lib/proforma/pdf.ts) SADECE bu modulun urettigi
 * `ProformaBelgesi` nesnesini cizer - hesap PDF'te tekrar yapilmaz.
 *
 * Saf modul (React / Supabase yok; tsx ile test edilir).
 */
import { bankaAnahtariTahmin, type BankaAnahtari } from "@/lib/bankalar";
import { musteriAdaylari, unvanAnahtari, urunAdaylari, type GecmisDosya } from "@/lib/proforma/gecmis";
import type { IhracatMusteri, IhracatUrun } from "@/lib/proforma/kayit";
import {
  VARSAYILAN_EVRAKLAR,
  teslimeGoreEvraklar,
  urunAciklamasi,
  urunVeMarkaAyir,
  yazimDuzelt,
} from "@/lib/proforma/sabitler";

export const FCL_MTS = 25;
export const GECERLILIK_GUN = 4;

export type ParaBirimi = "USD" | "EUR";
export type IkinciKutuEtiketi = "ADVANCE PAYMENT" | "DEPOSIT PAYMENT" | "BALANCE PAYMENT";
export const IKINCI_KUTU_ETIKETLERI: IkinciKutuEtiketi[] = ["ADVANCE PAYMENT", "DEPOSIT PAYMENT", "BALANCE PAYMENT"];

/** Ekrandaki urun satiri (sayilar metin olarak tutulur; "252,45" yazilabilsin). */
export type KalemTaslak = { urun: string; marka: string; ambalajKg: string; mts: string; fiyat: string };

export const BOS_KALEM: KalemTaslak = { urun: "", marka: "", ambalajKg: "25", mts: "", fiyat: "" };

/** Ekranin tamami (formun durumu). */
export type ProformaTaslak = {
  musteriAnahtari: string | null; // secilen listedeki musteri (unvan anahtari); null = yeni / elle
  kod: string;
  unvan: string;
  adres: string;
  ilgiliKisi: string;
  proformaNo: string;
  proformaNoElle: boolean;
  tarih: string; // YYYY-MM-DD
  kalemler: KalemTaslak[];
  teslimIfadesi: string;
  teslimSekli: string;
  sevkiyat: string;
  odeme: string;
  banka: BankaAnahtari | "";
  paraBirimi: ParaBirimi;
  ikinciEtiket: IkinciKutuEtiketi;
  ikinciTutar: string;
  ikinciElle: boolean;
  paketleme: string;
  paketlemeElle: boolean;
  markaSatiri: string;
  markaElle: boolean;
  evraklar: string[];
};

/** Musteri listesindeki bir secenek: secilince forma yazilacak her sey. */
export type MusteriSecenegi = {
  anahtar: string;
  kod: string;
  unvan: string;
  kaynak: "kart" | "gecmis";
  ozet: string; // listede gri yazi: "Djibouti · son: UNEXCCS160926"
  adres: string;
  ilgiliKisi: string;
  teslimSekli: string;
  teslimIfadesi: string;
  sevkiyat: string;
  odeme: string;
  banka: BankaAnahtari | "";
  paraBirimi: ParaBirimi;
  evraklar: string[] | null; // null = varsayilan liste
  kalemler: KalemTaslak[]; // son dosyadaki urunler (bos olabilir)
  sonProforma: string | null;
};

// ------------------------------------------------------------------ sayi ---

/** "252,45" / "1.250,50" / "1250.5" / "1,250.50" -> sayi (gecersiz -> NaN). */
export function sayiCoz(s: string | number | null | undefined): number {
  if (typeof s === "number") return Number.isFinite(s) ? s : NaN;
  let t = String(s ?? "").trim().replace(/\s/g, "");
  if (!t) return NaN;
  const sonVirgul = t.lastIndexOf(",");
  const sonNokta = t.lastIndexOf(".");
  if (sonVirgul > -1 && sonNokta > -1) {
    // Hangisi sondaysa ondalik ayiricidir
    t = sonVirgul > sonNokta ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (sonVirgul > -1) {
    t = t.replace(",", ".");
  } else if (sonNokta > -1 && /^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ""); // "50.000" = elli bin (TR binlik)
  }
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN;
  return parseFloat(t);
}

const yuvarla = (n: number, b = 2) => Math.round(n * 10 ** b) / 10 ** b;

/** TR bicim: 352500 -> "352.500,00" */
export function paraYaz(n: number, ondalik = 2): string {
  const [tam, kes] = Math.abs(n).toFixed(ondalik).split(".");
  const t = tam.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${t}${ondalik ? "," + kes : ""}`;
}

/** Excel "General": gereksiz sifir yok -> 375 / 252,45 */
export function genelSayiYaz(n: number): string {
  const r = yuvarla(n, 3);
  return Number.isInteger(r) ? paraYaz(r, 0) : paraYaz(r, 3).replace(/0+$/, "");
}

export const paraSimgesi = (p: ParaBirimi) => (p === "EUR" ? "€" : "$");

// ------------------------------------------------------------------ tarih ---

export function bugunISO(simdi = new Date()): string {
  // Turkiye saatiyle bugun
  const tr = new Date(simdi.getTime() + 3 * 3600_000);
  return tr.toISOString().slice(0, 10);
}

export function isoGunEkle(iso: string, gun: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + gun);
  return d.toISOString().slice(0, 10);
}

/** "2026-10-17" -> "17.10.2026" (gercek proformadaki bicim gg.aa.yyyy; 29.10.2026) */
export const tarihYaz = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
};

/** UNEX + KOD + GGAAYY -> "UNEXCCS171026" */
export function proformaNoOner(kod: string, iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  const k = String(kod || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!m || !k) return "";
  return `UNEX${k}${m[3]}${m[2]}${m[1].slice(2)}`;
}

// ---------------------------------------------------------------- kalemler ---

export type HesapliKalem = {
  urun: string;
  marka: string;
  aciklama: string; // "PREMIUM QUALITY WHEAT FLOUR (SAAD BRAND)"
  ambalajKg: number;
  mts: number;
  fiyat: number;
  tutar: number;
  cuval: number;
};

/** Gecerli (urun + miktar + fiyat dolu) satirlar, hesaplanmis. */
export function kalemleriHesapla(kalemler: KalemTaslak[]): HesapliKalem[] {
  const sonuc: HesapliKalem[] = [];
  for (const k of kalemler) {
    const urun = String(k.urun || "").replace(/\s+/g, " ").trim();
    const mts = sayiCoz(k.mts);
    const fiyat = sayiCoz(k.fiyat);
    const kg = sayiCoz(k.ambalajKg);
    if (!urun || !(mts > 0) || !(fiyat > 0)) continue;
    const marka = String(k.marka || "").trim().toLocaleUpperCase("en-US").replace(/\s+BRAND$/i, "");
    const ambalajKg = kg > 0 ? kg : 0;
    sonuc.push({
      urun,
      marka,
      aciklama: urunAciklamasi(urun, marka),
      ambalajKg,
      mts,
      fiyat,
      tutar: yuvarla(mts * fiyat),
      cuval: ambalajKg > 0 ? Math.round((mts * 1000) / ambalajKg) : 0,
    });
  }
  return sonuc;
}

export function toplamlar(kalemler: HesapliKalem[]) {
  const mts = yuvarla(kalemler.reduce((s, k) => s + k.mts, 0), 3);
  const tutar = yuvarla(kalemler.reduce((s, k) => s + k.tutar, 0));
  return { mts, tutar, fcl: yuvarla(mts / FCL_MTS, 2), cuval: kalemler.reduce((s, k) => s + k.cuval, 0) };
}

/** "15.000 PIECES OF 25 KG PP BAGS (ASLI BRAND) // 15.000 PIECES OF 25 KG PP BAGS (SAAD BRAND)" */
export function paketlemeOner(kalemler: HesapliKalem[]): string {
  const markali = kalemler.some((k) => k.marka);
  return kalemler
    .filter((k) => k.cuval > 0)
    .map((k) => `${paraYaz(k.cuval, 0)} PIECES OF ${genelSayiYaz(k.ambalajKg)} KG PP BAGS${markali && k.marka ? ` (${k.marka} BRAND)` : ""}`)
    .join(" // ");
}

/** "SAAD BRAND" / "ASLI BRAND & SAAD BRAND" (tekrarsiz, ilk gorulme sirasi) */
export function markaSatiriOner(kalemler: HesapliKalem[]): string {
  const markalar: string[] = [];
  for (const k of kalemler) if (k.marka && !markalar.includes(k.marka)) markalar.push(k.marka);
  return markalar.map((m) => `${m} BRAND`).join(" & ");
}

/**
 * Ikinci kutu onerisi (1. sayfa sag, "DEPOSIT / ADVANCE / BALANCE PAYMENT"):
 *  - "%30 ADVANCE" / "30% ADVANCE"     -> ADVANCE PAYMENT = toplam x %30
 *  - "50.000 USD DEPOSIT" / "20.000 USD ADVANCE" -> o tutar, o etiket
 *  - diger                             -> BALANCE PAYMENT = toplam
 */
export function ikinciKutuOner(odeme: string, toplam: number): { etiket: IkinciKutuEtiketi; tutar: number } {
  const o = String(odeme || "").toUpperCase();
  const yuzde = /%\s*(\d{1,3}(?:[.,]\d+)?)|(\d{1,3}(?:[.,]\d+)?)\s*%/.exec(o);
  const avansYuzde = yuzde && /ADVANCE|DOWN\s*PAYMENT|DEPOSIT|PREPAYMENT/.test(o) && !/%\s*100\b|\b100\s*%/.test(o);
  if (avansYuzde) {
    const oran = sayiCoz(yuzde[1] || yuzde[2]);
    if (oran > 0 && oran < 100) return { etiket: "ADVANCE PAYMENT", tutar: yuvarla((toplam * oran) / 100) };
  }
  // "50.000 USD DEPOSIT" / "10.980 USD PAYMENT ADVANCE PAYMENT" (para birimiyle kelime arasinda en fazla 2 kelime)
  const sabit = /((?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,2})?)\s*(?:USD|EUR|\$|€)\s+(?:[A-Z]+\s+){0,2}?(DEPOSIT|ADVANCE)/.exec(o);
  if (sabit) {
    const tutar = sayiCoz(sabit[1]);
    if (tutar > 0) return { etiket: sabit[2] === "DEPOSIT" ? "DEPOSIT PAYMENT" : "ADVANCE PAYMENT", tutar };
  }
  return { etiket: "BALANCE PAYMENT", tutar: toplam };
}

// ----------------------------------------------------------- musteri listesi ---

const metin = (s: unknown) => String(s ?? "").trim();

function dosyaKalemleri(dosya: GecmisDosya | undefined): KalemTaslak[] {
  const ham = Array.isArray(dosya?.urun_detaylari) ? (dosya!.urun_detaylari as Record<string, unknown>[]) : [];
  return ham
    .map((k) => {
      const ad = metin(k.urun_adi || k.description).replace(/\s+/g, " ");
      const { urun, marka } = urunVeMarkaAyir(ad);
      const kg = sayiCoz(metin(k.ambalaj_boyutu || k.packaging_size).match(/\d+(?:[.,]\d+)?/)?.[0] || "");
      const mts = sayiCoz(metin(k.miktar_mts ?? k.quantity));
      const fiyat = sayiCoz(metin(k.birim_fiyat_usd ?? k.unit_price));
      return {
        urun,
        marka: marka || "",
        ambalajKg: kg > 0 ? genelSayiYaz(kg) : "25",
        mts: mts > 0 ? genelSayiYaz(mts) : "",
        fiyat: fiyat > 0 ? genelSayiYaz(fiyat) : "",
      };
    })
    .filter((k) => k.urun);
}

/**
 * Musteri secenekleri: kayitli kartlar (oncelikli) + gecmis dosyalardaki
 * kartsiz alicilar. Her secenekte forma yazilacak tum bilgiler hazir.
 * Kartli musteride adres / ilgili kisi / sartlar KARTTAN, urunler en son
 * dosyadan gelir.
 */
export function musteriSecenekleri(kartlar: IhracatMusteri[], dosyalar: GecmisDosya[]): MusteriSecenegi[] {
  const sonDosya = new Map<string, GecmisDosya>();
  for (const d of [...dosyalar].sort((a, b) => metin(b.olusturma_tarihi).localeCompare(metin(a.olusturma_tarihi)))) {
    const k = unvanAnahtari(d.alici_firma);
    if (k && !sonDosya.has(k)) sonDosya.set(k, d);
  }
  const ozetYap = (liman: string, son: string | null) => [liman, son ? `son: ${son}` : ""].filter(Boolean).join(" · ");
  const secenekler: MusteriSecenegi[] = [];
  const kartli = new Set<string>();
  for (const m of kartlar.filter((x) => x.aktif)) {
    const a = unvanAnahtari(m.unvan);
    kartli.add(a);
    const d = sonDosya.get(a);
    secenekler.push({
      anahtar: a,
      kod: m.kod,
      unvan: m.unvan,
      kaynak: "kart",
      ozet: ozetYap(metin(m.varis_limani), metin(d?.proforma_no) || null),
      adres: metin(m.adres),
      ilgiliKisi: metin(m.ilgili_kisi),
      teslimSekli: metin(m.teslim_sekli).toUpperCase(),
      teslimIfadesi: metin(m.teslim_ifadesi),
      sevkiyat: metin(m.sevkiyat_metni),
      odeme: metin(m.odeme_sekli),
      banka: m.banka || "",
      paraBirimi: m.para_birimi === "EUR" ? "EUR" : "USD",
      evraklar: m.evraklar && m.evraklar.length ? m.evraklar : null,
      kalemler: dosyaKalemleri(d),
      sonProforma: metin(d?.proforma_no) || null,
    });
  }
  const adaylar = musteriAdaylari(
    dosyalar.filter((d) => !kartli.has(unvanAnahtari(d.alici_firma))),
    kartlar.map((k) => k.kod)
  );
  for (const a of adaylar) {
    const anahtar = unvanAnahtari(a.unvan);
    const d = sonDosya.get(anahtar);
    secenekler.push({
      anahtar,
      kod: a.kod,
      unvan: a.unvan,
      kaynak: "gecmis",
      ozet: ozetYap(metin(a.varis_limani), a.sonProforma),
      adres: metin(a.adres),
      ilgiliKisi: metin(a.ilgili_kisi),
      teslimSekli: metin(a.teslim_sekli),
      teslimIfadesi: metin(a.teslim_ifadesi),
      sevkiyat: metin(a.sevkiyat_metni),
      odeme: metin(a.odeme_sekli),
      banka: a.banka || bankaAnahtariTahmin(d?.banka) || "",
      paraBirimi: a.para_birimi,
      evraklar: a.evraklar,
      kalemler: dosyaKalemleri(d),
      sonProforma: a.sonProforma,
    });
  }
  return secenekler.sort((x, y) => x.unvan.localeCompare(y.unvan, "en"));
}

/** Urun ad onerileri: kutuphane (sirayla) + gecmis (kullanima gore), tekrarsiz. */
export function urunOnerileri(kutuphane: IhracatUrun[], dosyalar: GecmisDosya[]): { ad: string; kg: number }[] {
  const liste: { ad: string; kg: number }[] = [];
  const gorulen = new Set<string>();
  const ekle = (ad: string, kg: number) => {
    const k = ad.toLocaleUpperCase("en-US");
    if (!ad || gorulen.has(k)) return;
    gorulen.add(k);
    liste.push({ ad, kg });
  };
  for (const u of [...kutuphane].filter((x) => x.aktif).sort((a, b) => a.sira - b.sira)) ekle(u.ad, Number(u.varsayilan_ambalaj_kg) || 25);
  for (const u of urunAdaylari(dosyalar)) ekle(u.ad, u.varsayilan_ambalaj_kg);
  return liste;
}

/** Gecmisteki markalar (alfabetik). */
export function markaOnerileri(dosyalar: GecmisDosya[]): string[] {
  const s = new Set<string>();
  for (const d of dosyalar) {
    for (const k of Array.isArray(d.urun_detaylari) ? (d.urun_detaylari as Record<string, unknown>[]) : []) {
      const { marka } = urunVeMarkaAyir(metin(k.urun_adi || k.description));
      if (marka) s.add(marka);
    }
  }
  return Array.from(s).sort();
}

// ------------------------------------------------------------- taslak islem ---

export function bosTaslak(tarih = bugunISO()): ProformaTaslak {
  return {
    musteriAnahtari: null,
    kod: "",
    unvan: "",
    adres: "",
    ilgiliKisi: "",
    proformaNo: "",
    proformaNoElle: false,
    tarih,
    kalemler: [{ ...BOS_KALEM }],
    teslimIfadesi: "",
    teslimSekli: "",
    sevkiyat: "",
    odeme: "",
    banka: "",
    paraBirimi: "USD",
    ikinciEtiket: "BALANCE PAYMENT",
    ikinciTutar: "",
    ikinciElle: false,
    paketleme: "",
    paketlemeElle: false,
    markaSatiri: "",
    markaElle: false,
    evraklar: [...VARSAYILAN_EVRAKLAR],
  };
}

/** Musteri secilince: tum alanlar o musterinin son bilgileriyle dolar (tarih korunur). */
export function musteriUygula(t: ProformaTaslak, m: MusteriSecenegi, varsayilanEvraklar: string[]): ProformaTaslak {
  return otomatikAlanlar({
    ...t,
    musteriAnahtari: m.anahtar,
    kod: m.kod,
    unvan: m.unvan,
    adres: m.adres,
    ilgiliKisi: m.ilgiliKisi,
    proformaNoElle: false,
    kalemler: m.kalemler.length ? m.kalemler.map((k) => ({ ...k })) : [{ ...BOS_KALEM }],
    teslimIfadesi: m.teslimIfadesi,
    teslimSekli: m.teslimSekli,
    sevkiyat: m.sevkiyat,
    odeme: m.odeme,
    banka: m.banka,
    paraBirimi: m.paraBirimi,
    ikinciElle: false,
    paketlemeElle: false,
    markaElle: false,
    evraklar: [...(m.evraklar || varsayilanEvraklar)],
  });
}

/** Elle degistirilmemis otomatik alanlari (no, paketleme, marka, ikinci kutu) yeniden hesaplar. */
export function otomatikAlanlar(t: ProformaTaslak): ProformaTaslak {
  const k = kalemleriHesapla(t.kalemler);
  const top = toplamlar(k);
  const y = { ...t };
  if (!y.proformaNoElle) y.proformaNo = proformaNoOner(y.kod, y.tarih);
  if (!y.paketlemeElle) y.paketleme = paketlemeOner(k);
  if (!y.markaElle) y.markaSatiri = markaSatiriOner(k);
  if (!y.ikinciElle) {
    const o = ikinciKutuOner(y.odeme, top.tutar);
    y.ikinciEtiket = o.etiket;
    y.ikinciTutar = top.tutar > 0 ? paraYaz(o.tutar) : "";
  }
  return y;
}

/** Teslim ifadesinden teslim sekli: "CIF DJIBOUTI PORT BASIS" -> "CIF" */
export function teslimSekliBul(teslimIfadesi: string, yedek = ""): string {
  const m = /^\s*(CIF|CFR|FOB|CIP|CPT|FCA|EXW|DAP|DDP|FAS|C&F|CNF)\b/i.exec(teslimIfadesi || "");
  return (m ? m[1] : yedek).toUpperCase();
}

// ------------------------------------------------------------ PDF belgesi ---

/** PDF'e giden, tamamen hesaplanmis belge. */
export type ProformaBelgesi = {
  proformaNo: string;
  tarih: string; // dd/mm/yyyy
  gecerlilik: string; // dd/mm/yyyy
  alici: { unvan: string; adres: string };
  ilgiliKisi: string;
  paketleme: string;
  teslimIfadesi: string;
  sevkiyat: string;
  odeme: string;
  kalemler: HesapliKalem[];
  toplam: number;
  toplamMts: number;
  ikinci: { etiket: string; tutar: number };
  markaSatiri: string;
  paraBirimi: ParaBirimi;
  banka: BankaAnahtari;
  evraklar: string[];
  ozelSartlar: string[];
  altBilgi: string[];
  ustBilgi: { tarih: string; revizyon: string };
  imzali: boolean;
};

/**
 * Sales Contract (sayfa 2) QUANTITY / COMMODITY / UNIT PRICE satirlari (29.10.2026, kullanici:
 * "Quantity niye 1) 100 2) 25 yaziyor; ayni urun iki kere yaziyor"). Orijinal proformadaki gibi:
 *  - QUANTITY: TOPLAM miktar ("125 METRIC TONE"); kalem dokumu 1. sayfa tablosunda zaten var.
 *  - COMMODITY: ayni urun TEK sefer (buyuk/kucuk harf, bosluk farki yok sayilir); farkli urunler " & ".
 *  - UNIT PRICE: tek fiyat -> "410 USD PER TONE"; tek urun + farkli fiyatlar -> "410 USD & 413 USD
 *    PER TONE" (orijinal: "475 USD & 500 USD PER TONE"); farkli urun + farkli fiyat -> her urun kendi
 *    satirinda "URUN: 410 USD PER TONE" (hangi fiyat hangi urun karismasin).
 */
export function sozlesmeSatirlari(kalemler: HesapliKalem[], paraBirimi: ParaBirimi, toplamMts: number) {
  const anahtar = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();
  const urunler: string[] = [];
  for (const k of kalemler) {
    const a = k.aciklama.replace(/\s+/g, " ").trim();
    if (a && !urunler.some((u) => anahtar(u) === anahtar(a))) urunler.push(a);
  }
  const fiyatlar: number[] = [];
  for (const k of kalemler) if (!fiyatlar.some((f) => Math.abs(f - k.fiyat) < 0.0001)) fiyatlar.push(k.fiyat);
  const fy = (n: number) => `${genelSayiYaz(n)} ${paraBirimi}`;
  let birimFiyat: string;
  if (fiyatlar.length <= 1) birimFiyat = `${fy(fiyatlar[0] ?? 0)} PER TONE`;
  else if (urunler.length <= 1) birimFiyat = `${fiyatlar.map(fy).join(" & ")} PER TONE`;
  else {
    const satirlar: string[] = [];
    for (const k of kalemler) {
      const s = `${k.aciklama.replace(/\s+/g, " ").trim()}: ${fy(k.fiyat)} PER TONE`;
      if (!satirlar.some((x) => anahtar(x) === anahtar(s))) satirlar.push(s);
    }
    birimFiyat = satirlar.join("\n");
  }
  return { miktar: `${genelSayiYaz(toplamMts)} METRIC TONE`, emtia: urunler.join(" & "), birimFiyat };
}

export type Eksik = { alan: string; mesaj: string };

/** Indirmeden once eksikler (bos liste = hazir). */
export function eksikler(t: ProformaTaslak): Eksik[] {
  const e: Eksik[] = [];
  if (!t.unvan.trim()) e.push({ alan: "musteri", mesaj: "Müşteri seçin veya ünvan yazın" });
  if (!/^[A-Z0-9-/ ]{4,40}$/i.test(t.proformaNo.trim())) e.push({ alan: "no", mesaj: "Proforma numarası eksik (müşteri kodu gerekli)" });
  const hesapli = kalemleriHesapla(t.kalemler);
  if (!hesapli.length) e.push({ alan: "urun", mesaj: "En az bir ürün satırı (ürün, miktar, fiyat)" });
  const yarim = t.kalemler.some((k) => {
    const dolu = [k.urun, k.mts, k.fiyat].filter((x) => String(x || "").trim()).length;
    return dolu > 0 && dolu < 3;
  });
  if (yarim) e.push({ alan: "urun", mesaj: "Yarım kalmış ürün satırı var (ürün, miktar ve fiyat birlikte)" });
  if (t.kalemler.some((k) => String(k.mts || "").trim() && !(sayiCoz(k.mts) > 0))) e.push({ alan: "urun", mesaj: "Miktar sayı olmalı (örn. 250 veya 252,45)" });
  if (t.kalemler.some((k) => String(k.fiyat || "").trim() && !(sayiCoz(k.fiyat) > 0))) e.push({ alan: "urun", mesaj: "Fiyat sayı olmalı (örn. 483 veya 457,50)" });
  if (!t.teslimIfadesi.trim()) e.push({ alan: "teslim", mesaj: "Teslim (Shipment Terms) boş" });
  if (!t.odeme.trim()) e.push({ alan: "odeme", mesaj: "Ödeme (Payment Terms) boş" });
  if (!t.banka) e.push({ alan: "banka", mesaj: "Banka seçin" });
  if (String(t.ikinciTutar || "").trim() && !(sayiCoz(t.ikinciTutar) >= 0)) e.push({ alan: "ikinci", mesaj: "Ödeme kutusu tutarı sayı olmalı" });
  return e;
}

export function belgeOlustur(
  t: ProformaTaslak,
  sablon: { ozelSartlar: string[]; altBilgi: string[]; ustBilgi: { tarih: string; revizyon: string } },
  imzali = false
): ProformaBelgesi {
  const kalemler = kalemleriHesapla(t.kalemler);
  const top = toplamlar(kalemler);
  const ikinciTutar = sayiCoz(t.ikinciTutar);
  const teslimSekli = teslimSekliBul(t.teslimIfadesi, t.teslimSekli);
  return {
    proformaNo: t.proformaNo.trim().toUpperCase(),
    tarih: tarihYaz(t.tarih),
    gecerlilik: tarihYaz(isoGunEkle(t.tarih, GECERLILIK_GUN)),
    alici: { unvan: t.unvan.replace(/\s+/g, " ").trim().toUpperCase(), adres: t.adres.trim().toUpperCase() },
    ilgiliKisi: t.ilgiliKisi.trim(),
    paketleme: t.paketleme.trim(),
    teslimIfadesi: yazimDuzelt(t.teslimIfadesi).toUpperCase(),
    sevkiyat: yazimDuzelt(t.sevkiyat).toUpperCase(),
    odeme: yazimDuzelt(t.odeme).toUpperCase(),
    kalemler,
    toplam: top.tutar,
    toplamMts: top.mts,
    ikinci: { etiket: t.ikinciEtiket, tutar: Number.isFinite(ikinciTutar) && ikinciTutar >= 0 ? ikinciTutar : top.tutar },
    markaSatiri: t.markaSatiri.trim().toUpperCase(),
    paraBirimi: t.paraBirimi,
    banka: (t.banka || "denizbank") as BankaAnahtari,
    evraklar: teslimeGoreEvraklar(t.evraklar.map((e) => e.trim()).filter(Boolean), teslimSekli),
    ozelSartlar: sablon.ozelSartlar,
    altBilgi: sablon.altBilgi,
    ustBilgi: sablon.ustBilgi,
    imzali,
  };
}
