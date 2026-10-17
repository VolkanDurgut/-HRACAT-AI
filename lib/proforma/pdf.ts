/**
 * PROFORMA PDF (17.10.2026) - "DRAFT_Proforma__Contract.xlsx" sablonunun
 * vektor (jsPDF) karsiligi. 3 sayfa: Proforma Invoice / Sales Contract /
 * Special Conditions.
 *
 * Olculer DOGRUDAN sablondan: sutun genisligi (karakter) x 5,25 = pt (Excel
 * 7 px/karakter, 0,75 pt/px), satir yukseklikleri pt, kenar bosluklari
 * (sol 0,25 in, ust 0,75 in; ust/alt bilgi 0,3 in), dolgu tonlari (tema
 * beyazi -%5 / -%15 / -%25 / -%35 = F2F2F2 / D9D9D9 / BFBFBF / A6A6A6),
 * ince / kalin cizgiler, logo ve imza konumlari. Yazi tipi: Aptos Narrow
 * yerine Roboto Condensed (harf genislikleri neredeyse ayni).
 *
 * Icerik hesaplanmaz: lib/proforma/belge.ts -> ProformaBelgesi cizilir.
 * Uzun metinde satir yuksekligi buyur (gerekirse yazi kuculur); sayfaya
 * sigmayan blok sonraki sayfaya gecer (sayfa numarasi "x/N" sonda yazilir).
 */
import jsPDF from "jspdf";
import { ROBOTO_CONDENSED_BOLD_BASE64, ROBOTO_CONDENSED_REGULAR_BASE64 } from "@/lib/fonts/roboto-condensed-base64";
import { IMZA_HARUN, LOGO_UNEX } from "@/lib/imzalar";
import { BANKA_PRESETLERI, SABIT_HESAP_ADI } from "@/lib/bankalar";
import { SATICI } from "@/lib/proforma/sabitler";
import { genelSayiYaz, paraSimgesi, paraYaz, type ProformaBelgesi } from "@/lib/proforma/belge";

// ---------------------------------------------------------------- olculer ---
const SAYFA_G = 595.28;
const SAYFA_Y = 841.89;
const SOL = 18; // 0,25 in
const UST = 54; // 0,75 in
const ALT_SINIR = SAYFA_Y - 54; // alt kenar 0,75 in
const BASLIK_UST = 21.6; // ust bilgi 0,3 in
const ALTBILGI_ALT = SAYFA_Y - 21.6; // alt bilgi 0,3 in
const C = 5.25; // 1 karakter genisligi = 5,25 pt

const KOL1 = [8.78, 6.44, 8.11, 8.33, 8.78, 8.777, 10.44, 10.66, 8.78, 7.0].map((w) => w * C); // A..J
const KOL2 = [8.78, 8.777, 12.44, 8.78, 8.777, 8.777, 8.777, 8.777, 8.777, 7.44, 8.78].map((w) => w * C); // A..K

const GRI_05: RGB = [242, 242, 242];
const GRI_15: RGB = [217, 217, 217];
const GRI_25: RGB = [191, 191, 191];
const GRI_35: RGB = [166, 166, 166];
const SIYAH: RGB = [0, 0, 0];
const KOYU: RGB = [26, 26, 26];
const KIRMIZI: RGB = [255, 0, 0];
const INCE = 0.5;
const KALIN = 1.5;
const PAD = 2.25;

type RGB = [number, number, number];
type Hiza = "left" | "center" | "right";

/** Logo PNG'si 400x400; gorunur alan (29,59)-(371,341). */
const LOGO_PX = 400;
const LOGO_GORUNUR = { x: 29, y: 59, w: 342, h: 282 };
const IMZA_ORAN = 209 / 320;

// ------------------------------------------------------------ yardimcilar ---
const kx = (kol: number[], i: number) => SOL + kol.slice(0, i).reduce((s, w) => s + w, 0);
const kw = (kol: number[], i: number, j: number) => kol.slice(i, j + 1).reduce((s, w) => s + w, 0);

function yeniBelge(): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  doc.addFileToVFS("RobotoCondensed-Regular.ttf", ROBOTO_CONDENSED_REGULAR_BASE64);
  doc.addFont("RobotoCondensed-Regular.ttf", "RC", "normal");
  doc.addFileToVFS("RobotoCondensed-Bold.ttf", ROBOTO_CONDENSED_BOLD_BASE64);
  doc.addFont("RobotoCondensed-Bold.ttf", "RC", "bold");
  doc.setFont("RC", "normal");
  doc.setLineHeightFactor(1.15);
  return doc;
}

function font(doc: jsPDF, boy: number, kalin = false, renk: RGB = SIYAH) {
  doc.setFont("RC", kalin ? "bold" : "normal");
  doc.setFontSize(boy);
  doc.setTextColor(renk[0], renk[1], renk[2]);
}

function dolgu(doc: jsPDF, x: number, y: number, w: number, h: number, r: RGB) {
  doc.setFillColor(r[0], r[1], r[2]);
  doc.rect(x, y, w, h, "F");
}

function cizgi(doc: jsPDF, x1: number, y1: number, x2: number, y2: number, kalinlik = INCE) {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(kalinlik);
  doc.line(x1, y1, x2, y2);
}

const satirAraligi = (boy: number) => boy * 1.17;

/** Metni kutuya sar; sigmazsa yaziyi en fazla `enKucuk`e kadar kucult. */
function sar(doc: jsPDF, metin: string, w: number, h: number, boy: number, kalin: boolean, enKucuk = boy) {
  let b = boy;
  for (;;) {
    font(doc, b, kalin);
    const satirlar: string[] = [];
    for (const parca of metin.split("\n")) satirlar.push(...(doc.splitTextToSize(parca, Math.max(10, w)) as string[]));
    if (satirlar.length * satirAraligi(b) <= h + 0.5 || b <= enKucuk) return { satirlar, boy: b };
    b = Math.max(enKucuk, Math.round((b - 0.5) * 2) / 2);
  }
}

/** Gerekli yukseklik (sarilmis satir sayisi x satir araligi). */
function yukseklik(doc: jsPDF, metin: string, w: number, boy: number, kalin: boolean) {
  font(doc, boy, kalin);
  let n = 0;
  for (const parca of metin.split("\n")) n += (doc.splitTextToSize(parca, Math.max(10, w)) as string[]).length;
  return n * satirAraligi(boy);
}

type HucreSecenek = {
  boy: number;
  kalin?: boolean;
  hiza?: Hiza;
  dikey?: "ust" | "orta" | "alt";
  enKucuk?: number;
  renk?: RGB;
  dolgu?: RGB;
  alticizgi?: boolean;
};

/** Excel hucresi gibi: dolgu + sarilmis metin, yatay / dikey hizali. */
function hucre(doc: jsPDF, metin: string, x: number, y: number, w: number, h: number, o: HucreSecenek) {
  if (o.dolgu) dolgu(doc, x, y, w, h, o.dolgu);
  const icW = w - 2 * PAD;
  const { satirlar, boy } = sar(doc, metin, icW, h - 2, o.boy, !!o.kalin, o.enKucuk ?? o.boy);
  font(doc, boy, !!o.kalin, o.renk || SIYAH);
  const ara = satirAraligi(boy);
  const blok = satirlar.length * ara;
  const dikey = o.dikey || "orta";
  let ty = dikey === "ust" ? y + 1.5 : dikey === "alt" ? y + h - blok - 1 : y + (h - blok) / 2;
  const hiza = o.hiza || "left";
  for (const s of satirlar) {
    const tx = hiza === "left" ? x + PAD : hiza === "right" ? x + w - PAD : x + w / 2;
    // jsPDF taban cizgisi: ust + yazi boyunun ~%80'i
    doc.text(s, tx, ty + ara / 2 + boy * 0.35, { align: hiza });
    if (o.alticizgi) {
      const tw = doc.getTextWidth(s);
      const sx = hiza === "left" ? tx : hiza === "right" ? tx - tw : tx - tw / 2;
      const by = ty + ara / 2 + boy * 0.35 + 1.2;
      doc.setDrawColor(...(o.renk || SIYAH));
      doc.setLineWidth(0.6);
      doc.line(sx, by, sx + tw, by);
    }
    ty += ara;
  }
}

/** Sablondaki "@* \:" bicimi: etiket solda, ":" hucrenin sag kenarinda. */
function etiket(doc: jsPDF, metin: string, x: number, y: number, w: number, h: number, boy: number, o: { dolgu?: RGB; renk?: RGB } = {}) {
  if (o.dolgu) dolgu(doc, x, y, w, h, o.dolgu);
  // Dar sutunda etiket ":" ile cakismasin: sigana kadar kucult (Excel'de kesilirdi)
  let b = boy;
  font(doc, b, true, o.renk || SIYAH);
  while (b > 7.5 && doc.getTextWidth(metin) + doc.getTextWidth(" :") + 2 * PAD > w) {
    b -= 0.5;
    font(doc, b, true, o.renk || SIYAH);
  }
  const by = y + h / 2 + boy * 0.35;
  doc.text(metin, x + PAD, by);
  doc.text(":", x + w - PAD, by, { align: "right" });
}

function logoCiz(doc: jsPDF, x: number, y: number, kutuW: number, kutuH: number) {
  const olcek = Math.min(kutuW / LOGO_GORUNUR.w, kutuH / LOGO_GORUNUR.h);
  const gw = LOGO_GORUNUR.w * olcek;
  const gh = LOGO_GORUNUR.h * olcek;
  const ox = x + (kutuW - gw) / 2 - LOGO_GORUNUR.x * olcek;
  const oy = y + (kutuH - gh) / 2 - LOGO_GORUNUR.y * olcek;
  doc.addImage(LOGO_UNEX, "PNG", ox, oy, LOGO_PX * olcek, LOGO_PX * olcek, "UNEX_LOGO", "FAST");
}

function imzaCiz(doc: jsPDF, b: ProformaBelgesi, x: number, y: number, w: number) {
  if (!b.imzali) return;
  doc.addImage(IMZA_HARUN, "PNG", x, y, w, w * IMZA_ORAN, "IMZA_HARUN", "FAST");
}

/** 2. ve sonraki sayfalarin ust bilgisi: logo / SALES CONTRACT / Date - Revision. */
function ustBilgi(doc: jsPDF, b: ProformaBelgesi) {
  logoCiz(doc, SOL, BASLIK_UST, 72, 64.2);
  font(doc, 20, true);
  doc.text("SALES CONTRACT", SAYFA_G / 2, BASLIK_UST + 18, { align: "center" });
  font(doc, 11, false);
  const sag = SAYFA_G - SOL - 14;
  doc.text(`Date: ${b.ustBilgi.tarih}`, sag, BASLIK_UST + 10, { align: "right" });
  doc.text(`Revision nº: ${b.ustBilgi.revizyon}`, sag, BASLIK_UST + 23, { align: "right" });
}

function altBilgiler(doc: jsPDF, b: ProformaBelgesi) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    if (i === 1) {
      font(doc, 8, true);
      const satirlar = b.altBilgi;
      const ara = 9.6;
      satirlar.forEach((s, k) => doc.text(s, SAYFA_G / 2, ALTBILGI_ALT - (satirlar.length - 1 - k) * ara, { align: "center", maxWidth: SAYFA_G - 2 * SOL - 70 }));
    }
    font(doc, 11, true);
    doc.text(`Page ${i}/${n}`, SAYFA_G - SOL, ALTBILGI_ALT, { align: "right" });
  }
}

const tutarYaz = (n: number, b: ProformaBelgesi) => `${paraYaz(n)} ${paraSimgesi(b.paraBirimi)}`; // "352.500,00 $"
const kutuTutarYaz = (n: number, b: ProformaBelgesi) => `${paraSimgesi(b.paraBirimi)} ${paraYaz(n)}`; // "$ 352.500,00"

function bankaSatirlari(b: ProformaBelgesi): [string, string][] {
  const bk = BANKA_PRESETLERI.find((x) => x.anahtar === b.banka) || BANKA_PRESETLERI[0];
  return [
    ["ACCOUNT TITLE", SABIT_HESAP_ADI],
    ["BANK NAME", bk.banka],
    ["SWIFT CODE", bk.swift],
    ["ACCOUNT NUMBER (USD)", bk.usd.hesap_numarasi],
    ["IBAN NO (USD)", bk.usd.iban],
    ["ACCOUNT NUMBER (EUR)", bk.eur.hesap_numarasi],
    ["IBAN NO (EUR)", bk.eur.iban],
  ];
}

/** Banka tablosu (sayfa 1: A..J kolonu KOL1, sayfa 3: KOL2). */
function bankaTablosu(doc: jsPDF, b: ProformaBelgesi, kol: number[], y: number, satirH = 14.4) {
  const x = SOL;
  const etiketW = kw(kol, 0, 2);
  const tumW = kw(kol, 0, 9);
  for (const [et, deger] of bankaSatirlari(b)) {
    dolgu(doc, x, y, tumW, satirH, GRI_05);
    etiket(doc, et, x, y, etiketW, satirH, 9);
    hucre(doc, deger, x + etiketW, y, tumW - etiketW, satirH, { boy: 10, enKucuk: 8 });
    cizgi(doc, x, y, x + tumW, y);
    cizgi(doc, x, y + satirH, x + tumW, y + satirH);
    y += satirH;
  }
  return y;
}

function aliciMetni(b: ProformaBelgesi) {
  return [b.alici.unvan, b.alici.adres].filter(Boolean).join("\n");
}

// ================================================================ SAYFA 1 ===
/**
 * Sayfa 1. `sik`: 0 = sablon olculeri; 1 = bos satirlar daralir, satirlar
 * icerige gore alcalir; 2 = ayrica yazi 1 pt kuculur (cok urunlu / uzun
 * metinli proforma tek sayfaya sigsin). Donus: icerigin (imza dahil) bittigi y.
 */
function sayfa1(doc: jsPDF, b: ProformaBelgesi, sik = 0): number {
  const K = KOL1;
  const x = (i: number) => kx(K, i);
  const w = (i: number, j: number) => kw(K, i, j);
  const TUM = w(0, 9);
  let y = UST;

  // Logo: G sutunu + 48,6 pt, 1. satir + 4,1 pt; 119,4 x 107,4 pt. 9. satira
  // (satici adi) binmesin: sikistirmada 1-8. satirlar kisalir, logo da kuculur.
  const satir1_8 = 14.4 + 29.1 + (sik ? 6 : 10.8 + 12.6) + 14.4 * 3;
  logoCiz(doc, x(6) + 48.6, y + 4.1, 119.4, Math.min(107.4, satir1_8 - 4.1 - 1));

  y += 14.4; // satir 1
  // 2-3: Proforma Invoice
  hucre(doc, "Proforma Invoice", x(0), y, w(0, 4), 29.1, { boy: 20, kalin: true, hiza: "center", dolgu: GRI_15 });
  y += 29.1 + (sik ? 6 : 10.8 + 12.6); // satir 4-5

  // 6-8: DATE / PROFORMA NUM / VALIDITY
  const bilgi: [string, string, number][] = [
    ["DATE", b.tarih, 11],
    ["PROFORMA NUM", b.proformaNo, 11],
    ["VALIDITY", b.gecerlilik, 10],
  ];
  for (const [et, deger, boy] of bilgi) {
    etiket(doc, et, x(0), y, w(0, 1), 14.4, boy, { renk: et === "VALIDITY" ? KOYU : SIYAH });
    hucre(doc, deger, x(2), y, w(2, 5), 14.4, { boy: 9, kalin: true });
    y += 14.4;
  }
  // 9: satici adi (G:J)
  hucre(doc, SATICI.unvan, x(6), y, w(6, 9), 14.4, { boy: 11, kalin: true, hiza: "center", dikey: "alt" });
  y += 14.4;
  // 10: BUYER
  etiket(doc, "BUYER", x(0), y, w(0, 1), 14.4, 11);
  y += 14.4;
  // 11-14: alici (A:E) | satici adresi (G:J 11-12), TOTAL etiketi (13), toplam kutusu (14-15)
  const y11 = y;
  hucre(doc, aliciMetni(b), x(0), y11, w(0, 4), 58.95, { boy: 9, kalin: true, dikey: "ust", enKucuk: 7 });
  hucre(doc, SATICI.adres, x(6), y11, w(6, 9), 30.15, { boy: 9, kalin: true, hiza: "center", dikey: "ust", enKucuk: 7.5 });
  hucre(doc, `TOTAL ${b.teslimIfadesi}`, x(6), y11 + 30.15, w(6, 9), 14.4, { boy: 8.5, kalin: true, hiza: "center", dikey: "alt", enKucuk: 7 });
  hucre(doc, kutuTutarYaz(b.toplam, b), x(6), y11 + 44.55, w(6, 9), 28.95, { boy: 12, kalin: true, hiza: "center", dolgu: GRI_35 });
  y = y11 + 58.95;
  // 15: ATTENTION TO
  etiket(doc, "ATTENTION TO", x(0), y, w(0, 1), 14.55, 11);
  y += 14.55;
  // 16-21: ilgili kisi (A:E) | ikinci kutu etiketi (17), tutar (18-19)
  const y16 = y;
  // Sagdaki ikinci kutu 57,75 pt ister; sikistirmada ilgili kisi blogu icerige gore
  const ilgiliH = sik ? Math.max(57.75, yukseklik(doc, b.ilgiliKisi, w(0, 4) - 2 * PAD, 9, true) + 4) : 14.55 + 14.4 * 4 + 12;
  hucre(doc, b.ilgiliKisi, x(0), y16, w(0, 4), ilgiliH, { boy: 9, kalin: true, dikey: "ust", enKucuk: 7 });
  cizgi(doc, x(0), y16 + ilgiliH, x(5), y16 + ilgiliH, KALIN);
  hucre(doc, b.ikinci.etiket, x(6), y16 + 14.55, w(6, 9), 14.4, { boy: 8.5, kalin: true, hiza: "center" });
  hucre(doc, kutuTutarYaz(b.ikinci.tutar, b), x(6), y16 + 28.95, w(6, 9), 28.8, { boy: 12, kalin: true, hiza: "center", dolgu: GRI_15 });
  y = y16 + ilgiliH;

  // 22-25: PACKAGING / SHIPMENT TERMS / SHIPMENT METHOD / PAYMENT TERMS
  const degerW = w(3, 9) - 2 * PAD;
  const dg = sik >= 2 ? 8 : 9;
  const satirlar: [string, string, number][] = [
    ["PACKAGING", b.paketleme, sik ? 16 : 22.8],
    ["SHIPMENT TERMS", b.teslimIfadesi, sik ? 16 : 22.8],
    ["SHIPMENT METHOD", b.sevkiyat, sik ? 16 : 22.8],
    ["PAYMENT TERMS", b.odeme, sik ? 20 : 31.8],
  ];
  cizgi(doc, x(0), y, x(0) + TUM, y, KALIN);
  satirlar.forEach(([et, deger, h0], i) => {
    const h = Math.max(h0, yukseklik(doc, deger, degerW, dg, false) + 4);
    etiket(doc, et, x(0), y, w(0, 2), h, 11, { dolgu: GRI_05 });
    hucre(doc, deger, x(3), y, w(3, 9), h, { boy: dg });
    y += h;
    cizgi(doc, x(0), y, x(0) + TUM, y, i === satirlar.length - 1 ? KALIN : INCE);
  });
  y += sik ? 5 : 10.8; // 26

  // 27: tablo basligi
  const ust = y;
  const kolonlar: [number, number, string][] = [
    [0, 3, "DESCRIPTION OF GOODS"],
    [4, 5, "PACKAGING SIZE"],
    [6, 6, "QUANTITY\n(MTS)"],
    [7, 7, `UNIT PRICE\n(${b.paraBirimi}/MTS)`],
    [8, 9, "TOTAL AMOUNT"],
  ];
  const baslikH = sik >= 2 ? 26 : 35.55;
  for (const [i, j, t] of kolonlar) hucre(doc, t, x(i), y, w(i, j), baslikH, { boy: sik >= 2 ? 9 : 10, kalin: true, hiza: "center", dolgu: GRI_25 });
  y += baslikH;
  // 28: urunler (tek urunde 27 pt; coklu urunde satir basina en az 18 pt)
  const tekH = b.kalemler.length <= 1 ? 27 : sik ? 14.4 : 18;
  const ug = sik >= 2 ? 8 : 9;
  for (const k of b.kalemler) {
    const h = Math.max(tekH, yukseklik(doc, k.aciklama, w(0, 3) - 2 * PAD, ug, false) + 4);
    hucre(doc, k.aciklama, x(0), y, w(0, 3), h, { boy: ug, hiza: "center", dolgu: GRI_05 });
    hucre(doc, k.ambalajKg > 0 ? `${genelSayiYaz(k.ambalajKg)} KG` : "", x(4), y, w(4, 5), h, { boy: ug, hiza: "center" });
    hucre(doc, paraYaz(k.mts), x(6), y, w(6, 6), h, { boy: ug, hiza: "center" });
    hucre(doc, paraYaz(k.fiyat), x(7), y, w(7, 7), h, { boy: ug, hiza: "center" });
    hucre(doc, tutarYaz(k.tutar, b), x(8), y, w(8, 9), h, { boy: ug, hiza: "center", dolgu: GRI_05 });
    y += h;
    cizgi(doc, x(0), y, x(0) + TUM, y);
  }
  // tablo cizgileri
  cizgi(doc, x(0), ust, x(0) + TUM, ust, KALIN);
  cizgi(doc, x(0), ust + baslikH, x(0) + TUM, ust + baslikH);
  for (const i of [0, 4, 6, 7, 8, 10]) cizgi(doc, x(i), ust, x(i), y, INCE);
  cizgi(doc, x(0), ust, x(0), ust + baslikH, KALIN);

  // 29-30: TOTAL ... / ikinci kutu
  const toplamSatirlari: [string, number, RGB | undefined][] = [
    [`TOTAL ${b.teslimIfadesi}`, b.toplam, GRI_05],
    [b.ikinci.etiket, b.ikinci.tutar, undefined],
  ];
  for (const [et, tutar, d] of toplamSatirlari) {
    hucre(doc, et, x(0), y, w(0, 7), 14.4, { boy: 11, kalin: true, hiza: "right", enKucuk: 8 });
    hucre(doc, tutarYaz(tutar, b), x(8), y, w(8, 9), 14.4, { boy: 9, hiza: "center", dolgu: d });
    cizgi(doc, x(8), y, x(8), y + 14.4, KALIN);
    cizgi(doc, x(10), y, x(10), y + 14.4);
    cizgi(doc, x(8), y + 14.4, x(10), y + 14.4);
    y += 14.4;
  }
  y += sik ? 5 : 9.6; // 31

  // 32-38: banka
  y = bankaTablosu(doc, b, K, y, sik >= 2 ? 12.6 : 14.4);
  y += sik ? 5 : 10.2; // 39

  // 40-42: imza bolumu
  hucre(doc, "SIGNED BY", x(0), y, w(0, 4), 14.4, { boy: 11, kalin: true, hiza: "center", renk: KIRMIZI, alticizgi: true });
  hucre(doc, "APPROVAL OF CUSTOMER", x(5), y, w(5, 9), 14.4, { boy: 11, kalin: true, hiza: "center", renk: KIRMIZI, alticizgi: true });
  y += 14.4;
  hucre(doc, SATICI.unvan, x(0), y, w(0, 4), 14.4, { boy: 11, kalin: true, hiza: "center" });
  hucre(doc, aliciMetni(b), x(5), y, w(5, 9), 28.8, { boy: 11, kalin: true, hiza: "center", dikey: "ust", enKucuk: 8 });
  y += 14.4;
  const imzaW = sik >= 2 ? 88 : 101.4;
  imzaCiz(doc, b, x(0) + 48, y + 1.8, imzaW);
  return Math.max(y + 14.4, y + 1.8 + imzaW * IMZA_ORAN);
}

// ============================================================== SAYFA 2-3 ===
/** Sayfa 2 (sozlesme). `sik` sayfa 1'deki gibi. Donus: icerigin bittigi y (tasarsa Infinity). */
function sayfa2(doc: jsPDF, b: ProformaBelgesi, sik = 0): number {
  const K = KOL2;
  const x = (i: number) => kx(K, i);
  const w = (i: number, j: number) => kw(K, i, j);
  const TUM = w(0, 9);
  const ilkSayfa = doc.getNumberOfPages();
  ustBilgi(doc, b);
  let y = sik ? BASLIK_UST + 64.2 + 8 : UST + 14.4 * 3; // 1-3 bos

  // 4: SELLER / DATE
  etiket(doc, "SELLER", x(0), y, w(0, 0), 14.4, 11);
  hucre(doc, "DATE :", x(6), y, w(6, 6), 14.4, { boy: 11, kalin: true, hiza: "right" });
  hucre(doc, b.tarih, x(7), y, w(7, 8), 14.4, { boy: 10, kalin: true });
  y += 14.4;
  // 5-9: satici | PROFORMA NUM
  hucre(doc, "PROFORMA NUM :", x(4), y, w(4, 6), 14.4, { boy: 11, kalin: true, hiza: "right" });
  hucre(doc, b.proformaNo, x(7), y, w(7, 8), 14.4, { boy: 10, kalin: true });
  hucre(doc, SATICI.unvan, x(0), y, w(0, 3), 14.4, { boy: 11, kalin: true });
  hucre(doc, SATICI.adres, x(0), y + 14.4, w(0, 3), 14.4 * 4, { boy: 9, kalin: true, dikey: "ust" });
  y += sik ? 14.4 * 3 + 4 : 14.4 * 5 + 14.4; // 5-9 + 10

  // 11: BUYER / ATTENTION TO
  etiket(doc, "BUYER", x(0), y, w(0, 0), 14.4, 11);
  etiket(doc, "ATTENTION TO", x(5), y, w(5, 6), 14.4, 11);
  y += 14.4;
  // 12-17
  const blokH = sik
    ? Math.max(30, yukseklik(doc, aliciMetni(b), w(0, 3) - 2 * PAD, 10, true) + 4, yukseklik(doc, b.ilgiliKisi, w(5, 8) - 2 * PAD, 9, true) + 4)
    : 14.55 + 14.4 * 5;
  hucre(doc, aliciMetni(b), x(0), y, w(0, 3), blokH, { boy: 10, kalin: true, dikey: "ust", enKucuk: 7.5 });
  hucre(doc, b.ilgiliKisi, x(5), y, w(5, 8), blokH, { boy: 9, kalin: true, dikey: "ust", enKucuk: 7 });
  y += blokH + (sik ? 6 : 15); // + 18
  cizgi(doc, x(0), y, x(0) + TUM, y, KALIN);

  // 19-29: sozlesme satirlari (her urun kendi satirinda)
  const coklu = b.kalemler.length > 1;
  const no = (i: number) => (coklu ? `${i + 1}) ` : "");
  const alanlar: [string, string, number?][] = [
    ["QUANTITY", b.kalemler.map((k, i) => `${no(i)}${genelSayiYaz(k.mts)} METRIC TONE`).join("\n")],
    ["COMMODITY", b.kalemler.map((k, i) => `${no(i)}${k.aciklama}`).join("\n")],
    ["ORIGIN", "TURKISH"],
    ["PACKING", b.paketleme],
    ["BRAND & MARKING", b.markaSatiri],
    ["SHIPMENT", b.sevkiyat],
    ["PORT OF DESTINATION", b.teslimIfadesi, 9],
    ["UNIT PRICE", b.kalemler.map((k, i) => `${no(i)}${genelSayiYaz(k.fiyat)} ${b.paraBirimi} PER TONE`).join("\n")],
    ["TOTAL CONT VALUE", tutarYaz(b.toplam, b)],
    ["PAYMENT", b.odeme],
  ];
  const degerW = w(2, 9) - 2 * PAD;
  const ag = sik >= 2 ? 9 : 10;
  alanlar.forEach(([et, deger, etBoy], i) => {
    const son = i === alanlar.length - 1;
    const h = Math.max(son ? (sik ? 22 : 34.8) : sik ? 15.5 : 19.8, yukseklik(doc, deger, degerW, ag, false) + (sik ? 4 : 6));
    dolgu(doc, x(0), y, TUM, h, GRI_15);
    etiket(doc, et, x(0), y, w(0, 1), h, etBoy || 11);
    hucre(doc, deger, x(2), y, w(2, 9), h, { boy: ag });
    y += h;
    cizgi(doc, x(0), y, x(0) + TUM, y, son ? KALIN : INCE);
  });
  y += sik ? 10 : 23.55;

  // 31: SHIPPING DOCUMENTS
  hucre(doc, "SHIPPING DOCUMENTS :", x(0), y, w(0, 2), 13.95, { boy: 11, kalin: true, dolgu: GRI_15 });
  y += 13.95 + (sik ? 4 : 9);
  const evrakUst = y;
  const eg = sik >= 2 ? 10 : 11;
  const evrakH = sik ? 13 : 14.4;
  b.evraklar.forEach((e, i) => {
    const t = `${i + 1}. ${e}`;
    // Sablonda evrak metni bos hucrelere tasar (A..J); imza sag altta kalir
    const h = Math.max(evrakH, yukseklik(doc, t, w(0, 9) - 2 * PAD, eg, false) + 2);
    if (y + h > ALT_SINIR) {
      doc.addPage();
      ustBilgi(doc, b);
      y = BASLIK_UST + 64.2 + 10;
    }
    hucre(doc, t, x(0), y, w(0, 9), h, { boy: eg });
    y += h;
  });
  // Imza: H sutunu + 3 pt, 39. satir (7. evrak satiri) + 7,8 pt; sayfa altina tasmaz
  const imzaW = sik >= 2 ? 105 : 123.6;
  const imzaH = imzaW * IMZA_ORAN;
  const ayniSayfa = doc.getNumberOfPages() === ilkSayfa;
  const imzaY = ayniSayfa ? Math.min(evrakUst + evrakH * 6 + 7.8, SAYFA_Y - 40 - imzaH) : Math.min(y + 6, SAYFA_Y - 40 - imzaH);
  imzaCiz(doc, b, x(7) + 3, imzaY, imzaW);
  return ayniSayfa ? Math.max(y, imzaY + imzaH) : Infinity;
}

function sayfa3(doc: jsPDF, b: ProformaBelgesi) {
  const K = KOL2;
  const x = (i: number) => kx(K, i);
  const w = (i: number, j: number) => kw(K, i, j);
  doc.addPage();
  ustBilgi(doc, b);
  // Ust bilgi logosu 85,8 pt'de biter; baslik ona binmesin (Excel'de 48. satir)
  let y = Math.max(UST + 24.6, BASLIK_UST + 64.2 + 10);

  hucre(doc, "SPECIAL CONDITIONS", x(0), y, w(0, 3), 24.45, { boy: 20, kalin: true, dolgu: GRI_15 });
  y += 24.45;
  const genis = w(0, 10);
  for (const madde of b.ozelSartlar) {
    const h = Math.max(14.4, yukseklik(doc, madde, genis - 2 * PAD, 10, false) + 5);
    if (y + h > ALT_SINIR) {
      doc.addPage();
      ustBilgi(doc, b);
      y = BASLIK_UST + 64.2 + 10;
    }
    hucre(doc, madde, x(0), y, genis, h, { boy: 10 });
    y += h;
  }
  y += 28.2 + 14.4; // 61-62

  // 63-75: banka + imza bolumu bir arada kalsin
  const bankaBlokH = 14.4 + 14.4 + 7 * 14.4 + 14.4 + 15.6 + 28.8 + 70;
  if (y + bankaBlokH > SAYFA_Y - 30) {
    doc.addPage();
    ustBilgi(doc, b);
    y = BASLIK_UST + 64.2 + 10;
  }
  hucre(doc, "ALL PAYMENT TO BE MADE OUT TO THE FOLLOWING SELLER'S BANK ACCOUNT", x(0), y, w(0, 9), 14.4, { boy: 11, kalin: true, hiza: "center", dolgu: GRI_05 });
  y += 14.4 + 14.4;
  y = bankaTablosu(doc, b, K, y);
  y += 14.4;
  hucre(doc, "SIGNED BY", x(0), y, w(0, 4), 15.6, { boy: 12, kalin: true, hiza: "center", renk: KIRMIZI, alticizgi: true });
  hucre(doc, "APPROVAL OF CUSTOMER", x(5), y, w(5, 9), 15.6, { boy: 12, kalin: true, hiza: "center", renk: KIRMIZI, alticizgi: true });
  y += 15.6;
  hucre(doc, SATICI.unvan, x(0), y, w(0, 4), 14.4, { boy: 11, kalin: true, hiza: "center" });
  hucre(doc, aliciMetni(b), x(5), y, w(5, 9), 28.8, { boy: 11, kalin: true, hiza: "center", dikey: "ust", enKucuk: 8 });
  imzaCiz(doc, b, x(1) + 37.2, y + 13.2, 103.8);
}

// ================================================================== disari ===
export function proformaPdf(b: ProformaBelgesi): jsPDF {
  const doc = yeniBelge();
  doc.setProperties({ title: `Proforma ${b.proformaNo}`, subject: "Proforma Invoice / Sales Contract", author: SATICI.unvan, creator: "İhracat AI" });
  // Once deneme cizimiyle en az sikistirma kademesi bulunur (bos belgeye ciz, olc)
  const sinir = ALTBILGI_ALT - 8 - 9.6 * Math.max(0, b.altBilgi.length - 1) - 10;
  let s1 = 0;
  while (s1 < 2 && sayfa1(yeniBelge(), b, s1) > sinir) s1++;
  let s2 = 0;
  while (s2 < 2 && sayfa2(yeniBelge(), b, s2) > SAYFA_Y - 36) s2++;
  sayfa1(doc, b, s1);
  doc.addPage();
  sayfa2(doc, b, s2);
  sayfa3(doc, b);
  altBilgiler(doc, b);
  return doc;
}

export const proformaDosyaAdi = (b: ProformaBelgesi) =>
  `${(b.proformaNo || "PROFORMA").replace(/[^A-Z0-9-]+/gi, "_")}${b.imzali ? "" : "-TASLAK"}.pdf`;
