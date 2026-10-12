import jsPDF from "jspdf";
import { INTER_REGULAR_BASE64, INTER_SEMIBOLD_BASE64, INTER_BOLD_BASE64 } from "@/lib/fonts/inter-tr-base64";
import { UNEX_LOGO_BASE64 } from "@/lib/images/unex-logo-base64";
import { SERTIFIKA_LOGOLARI_BASE64, SERTIFIKA_LOGOLARI_ORAN } from "@/lib/images/sertifika-logolari-base64";
import {
  FORM_SIRKET,
  GECERLILIK_GUN,
  IcFiyatFormu,
  SIPARIS_SURECI,
  SIPARIS_SURECI_NOTU,
  fiyatYazi,
  formDosyaAdi,
  formSartlari,
  gunYazi,
  kdvYazi,
  onayZamaniYazi,
  vadeYazi,
} from "@/lib/ic-piyasa/fiyat-formu";
import { formOzelGunleri, ozelGunTarihYazi, trGunu } from "@/lib/ic-piyasa/ozel-gunler";

/**
 * YAN MAMUL FIYAT BILGILENDIRME FORMU - kurumsal tasarim (revize 12.10.2026).
 *
 * Revize 12.10.2026 (kullanicinin ornek formu esas alindi, marka renkleriyle):
 *   - Lacivert ust bant: SOLDA logo karosu + baslik, SAGDA firma kase bilgileri
 *     (unvan, adres, telefon, e-posta, vergi) - gercek Unex bilgileri.
 *   - Koyu bilgi seridi: Form No / Onay / Gecerlilik / Donem.
 *   - "Sayin Musterimiz / Is Ortagimiz" hitap kutusu + satis iletisim.
 *   - Ozel gun bandi (lib/ic-piyasa/ozel-gunler.ts): formun haftasina denk
 *     gelen milli / dini bayram, kandil, yilbasi.
 *   - Urun ve fiyat tablosu (BUYUK fiyat + "TL/kg · + KDV").
 *   - Bilgilendirme ve sevkiyat sartlari (formSartlari, 4 madde).
 *   - Siparis sureci zaman cizelgesi (SIPARIS_SURECI, 4 adim) - kase / imza
 *     alani YOK (kullanici karari: her iki taraf icin de kaldirildi).
 * Yazi tipi Inter 400/600/700 (vektor, aranabilir). Sigmazsa bolum bir sonraki
 * sayfaya gecer (tek sayfaya sikistirma YOK), her sayfada ust ve alt bilgi.
 * Onizlemede "ONIZLEME" filigrani.
 *
 * Kullanici kararlari: baslikta "Ic Piyasa" yazisi YOK (11.10 + 12.10.2026).
 */

type RGB = [number, number, number];
const LACIVERT: RGB = [40, 52, 116]; // #283474
const LACIVERT_KOYU: RGB = [27, 35, 82];
const SEFTALI: RGB = [244, 160, 124]; // #F4A07C
const SEFTALI_KOYU: RGB = [190, 98, 58];
const SEFTALI_ZEMIN: RGB = [253, 242, 236];
const MUREKKEP: RGB = [29, 35, 51];
const GOVDE: RGB = [74, 81, 99];
const SOLUK: RGB = [118, 126, 143];
const CIZGI: RGB = [226, 229, 237];
const KART_ZEMIN: RGB = [247, 248, 251];
const BANT_ACIK: RGB = [196, 203, 230];
const BEYAZ: RGB = [255, 255, 255];

const SAYFA_G = 210;
const SAYFA_Y = 297;
const KENAR = 16;
const ICERIK_G = SAYFA_G - KENAR * 2;
const ALT_BILGI_Y = 267; // alt bilginin ust cizgisi
const SAYFA_SONU = ALT_BILGI_Y - 4; // icerik bu cizgiyi gecmez
const DEVAM_UST = 30; // devam sayfalarinda icerigin basladigi y

// Urun tablosu sutunlari (mm)
const SUTUN = {
  urun: KENAR + 5,
  vade: KENAR + 74,
  odeme: KENAR + 94,
  teslim: KENAR + 119,
  fiyatSag: SAYFA_G - KENAR - 5,
};

type Yazi = "r" | "s" | "b";

function belgeOlustur(): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.addFileToVFS("Inter-Regular.ttf", INTER_REGULAR_BASE64);
  doc.addFont("Inter-Regular.ttf", "Inter", "normal");
  doc.addFileToVFS("Inter-SemiBold.ttf", INTER_SEMIBOLD_BASE64);
  doc.addFont("Inter-SemiBold.ttf", "InterSemi", "normal");
  doc.addFileToVFS("Inter-Bold.ttf", INTER_BOLD_BASE64);
  doc.addFont("Inter-Bold.ttf", "InterBold", "normal");
  doc.setFont("Inter", "normal");
  doc.setLineHeightFactor(1.35);
  return doc;
}

function fontSec(doc: jsPDF, tip: Yazi | undefined, boy: number) {
  doc.setFont(tip === "b" ? "InterBold" : tip === "s" ? "InterSemi" : "Inter", "normal");
  doc.setFontSize(boy);
}

function yazi(
  doc: jsPDF,
  metin: string | string[],
  x: number,
  y: number,
  o: { tip?: Yazi; boy: number; renk: RGB; hiza?: "left" | "right" | "center"; aralik?: number; genislik?: number }
) {
  fontSec(doc, o.tip, o.boy);
  doc.setTextColor(...o.renk);
  const secenek: Record<string, unknown> = {};
  if (o.hiza && o.hiza !== "left") secenek.align = o.hiza;
  if (o.aralik) secenek.charSpace = o.aralik;
  if (o.genislik) secenek.maxWidth = o.genislik;
  doc.text(metin, x, y, secenek);
}

/** Metni verilen genislige boler (o fontla). */
function bol(doc: jsPDF, metin: string, genislik: number, tip: Yazi, boy: number): string[] {
  fontSec(doc, tip, boy);
  return doc.splitTextToSize(metin, genislik) as string[];
}

function genislikOlc(doc: jsPDF, metin: string, tip: Yazi, boy: number, aralik = 0): number {
  fontSec(doc, tip, boy);
  return doc.getTextWidth(metin) + aralik * Math.max(metin.length - 1, 0);
}

function saydamlik(doc: jsPDF, oran: number) {
  const D = doc as unknown as { GState: new (o: { opacity: number }) => unknown; setGState: (g: unknown) => void };
  D.setGState(new D.GState({ opacity: oran }));
}

/** Bolum basligi: seftali cubuk + aralikli buyuk harf + (istege bagli) sag aciklama. */
function bolumBasligi(doc: jsPDF, y: number, baslik: string, sag?: string) {
  doc.setFillColor(...SEFTALI);
  doc.rect(KENAR, y - 3.4, 1.2, 4.6, "F");
  yazi(doc, baslik, KENAR + 3.6, y, { tip: "s", boy: 8, renk: LACIVERT, aralik: 0.6 });
  if (sag) yazi(doc, sag, SAYFA_G - KENAR, y, { tip: "r", boy: 7.6, renk: SOLUK, hiza: "right" });
}

// ---------------------------------------------------------------------------
// Ust bant: logo + baslik (sol), firma kase bilgileri (sag)
// ---------------------------------------------------------------------------
const BANT_Y = 42;

function anaBaslik(doc: jsPDF) {
  doc.setFillColor(...LACIVERT);
  doc.rect(0, 0, SAYFA_G, BANT_Y, "F");
  saydamlik(doc, 0.06);
  doc.setFillColor(255, 255, 255);
  doc.circle(SAYFA_G + 4, -6, 26, "F");
  saydamlik(doc, 1);
  doc.setFillColor(...SEFTALI);
  doc.rect(0, BANT_Y, SAYFA_G, 2, "F");

  // Logo karosu
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(KENAR, 7, 28, 28, 4, 4, "F");
  doc.addImage(UNEX_LOGO_BASE64, "PNG", KENAR + 2.5, 9.5, 23, 23);

  // Sag: kase bilgileri (sağa yasli)
  const sag = SAYFA_G - KENAR;
  const unvanBoy = 7.4;
  const satirBoy = 6.7;
  const kaseSatirlari = [
    FORM_SIRKET.adres1,
    FORM_SIRKET.adres2,
    `T ${FORM_SIRKET.tel}  ·  F ${FORM_SIRKET.faks}`,
    `${FORM_SIRKET.eposta}  ·  ${FORM_SIRKET.web}`,
    FORM_SIRKET.vergi,
  ];
  const unvanSatirlari = bol(doc, FORM_SIRKET.unvan, 66, "b", unvanBoy);
  const kaseG = Math.max(
    ...unvanSatirlari.map((s) => genislikOlc(doc, s, "b", unvanBoy)),
    ...kaseSatirlari.map((s) => genislikOlc(doc, s, "r", satirBoy))
  );
  const kaseX = sag - kaseG;
  let ky = 11.4;
  unvanSatirlari.forEach((s) => {
    yazi(doc, s, sag, ky, { tip: "b", boy: unvanBoy, renk: BEYAZ, hiza: "right" });
    ky += 3.5;
  });
  ky += 0.6;
  kaseSatirlari.forEach((s) => {
    yazi(doc, s, sag, ky, { tip: "r", boy: satirBoy, renk: BANT_ACIK, hiza: "right" });
    ky += 3.45;
  });

  // Sol: baslik (kase blogunun soluna sigacak boyda)
  const x = KENAR + 34;
  const azami = kaseX - 7 - x;
  let baslikBoy = 17;
  while (baslikBoy > 12 && genislikOlc(doc, "Fiyat Bilgilendirme Formu", "b", baslikBoy) > azami) baslikBoy -= 0.5;
  yazi(doc, "UNEX GIDA", x, 15, { tip: "s", boy: 7.6, renk: SEFTALI, aralik: 1.1 });
  yazi(doc, "Fiyat Bilgilendirme Formu", x, 23.8, { tip: "b", boy: baslikBoy, renk: BEYAZ });
  yazi(doc, "Yan Mamul Ürünler", x, 30.4, { tip: "r", boy: 9.6, renk: BANT_ACIK });

  // Ince dikey ayrac (baslik ile kase arasinda)
  saydamlik(doc, 0.25);
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.25);
  doc.line(kaseX - 4, 9, kaseX - 4, 33);
  saydamlik(doc, 1);
}

/** Devam sayfalarinin ince ust bandi. */
function kisaBaslik(doc: jsPDF, form: IcFiyatFormu) {
  doc.setFillColor(...LACIVERT);
  doc.rect(0, 0, SAYFA_G, 20, "F");
  doc.setFillColor(...SEFTALI);
  doc.rect(0, 20, SAYFA_G, 1.4, "F");
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(KENAR, 4, 12, 12, 2, 2, "F");
  doc.addImage(UNEX_LOGO_BASE64, "PNG", KENAR + 1, 5, 10, 10);
  yazi(doc, "Fiyat Bilgilendirme Formu", KENAR + 16, 12.3, { tip: "b", boy: 11, renk: BEYAZ });
  yazi(doc, `${form.form_no} · devam`, SAYFA_G - KENAR, 12.3, { tip: "s", boy: 8.5, renk: BANT_ACIK, hiza: "right" });
}

// ---------------------------------------------------------------------------
// Bilgi seridi: Form No / Onay / Gecerlilik / Donem
// ---------------------------------------------------------------------------
function bilgiSeridi(doc: jsPDF, form: IcFiyatFormu, y: number): number {
  const h = 12.5;
  doc.setFillColor(...LACIVERT_KOYU);
  doc.roundedRect(KENAR, y, ICERIK_G, h, 2, 2, "F");
  const onay = onayZamaniYazi(form.onay_zamani);
  const hucreler: { etiket: string; deger: string; vurgu?: boolean }[] = [
    { etiket: "FORM NO", deger: form.form_no },
    { etiket: "ONAY TARİHİ", deger: onay.slice(0, 10) },
    { etiket: "GEÇERLİLİK", deger: `${gunYazi(form.gecerlilik_bitis)} tarihine kadar`, vurgu: true },
    { etiket: "DÖNEM", deger: "Haftalık Bilgilendirme" },
  ];
  const g = ICERIK_G / hucreler.length;
  hucreler.forEach((c, i) => {
    const x = KENAR + i * g + 5;
    yazi(doc, c.etiket, x, y + 4.9, { tip: "s", boy: 6.1, renk: SEFTALI, aralik: 0.45 });
    yazi(doc, c.deger, x, y + 9.6, { tip: "b", boy: 8.4, renk: c.vurgu ? BEYAZ : BEYAZ });
    if (i > 0) {
      saydamlik(doc, 0.18);
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.2);
      doc.line(KENAR + i * g, y + 2.8, KENAR + i * g, y + h - 2.8);
      saydamlik(doc, 1);
    }
  });
  return y + h;
}

// ---------------------------------------------------------------------------
// Hitap kutusu
// ---------------------------------------------------------------------------
function hitapKutusu(doc: jsPDF, form: IcFiyatFormu, y: number): number {
  const ic = ICERIK_G - 12;
  const alici = (form.alici || "").trim();
  const onay = onayZamaniYazi(form.onay_zamani).slice(0, 10);
  const giris = bol(
    doc,
    `Güncel yan mamul fiyatlarımız aşağıda bilgilerinize sunulmuştur. Fiyatlar ${onay} tarihinden itibaren ${GECERLILIK_GUN} gün, ${gunYazi(form.gecerlilik_bitis)} tarihine kadar geçerlidir. Siparişleriniz için bizimle iletişime geçebilirsiniz.`,
    ic,
    "r",
    8.7
  );
  const aliciSatirlari = alici ? bol(doc, alici, ic, "b", 10.5) : [];
  const h = 6.6 + aliciSatirlari.length * 4.8 + giris.length * 3.9 + 3.2;
  doc.setFillColor(...KART_ZEMIN);
  doc.setDrawColor(...CIZGI);
  doc.setLineWidth(0.2);
  doc.roundedRect(KENAR, y, ICERIK_G, h, 2.2, 2.2, "FD");
  doc.setFillColor(...SEFTALI);
  doc.rect(KENAR, y + 3, 1.3, h - 6, "F");
  let iy = y + 5.6;
  yazi(doc, "SAYIN MÜŞTERİMİZ / İŞ ORTAĞIMIZ", KENAR + 6, iy, { tip: "s", boy: 6.8, renk: SOLUK, aralik: 0.5 });
  iy += 1.2;
  aliciSatirlari.forEach((s) => {
    iy += 4.8;
    yazi(doc, s, KENAR + 6, iy, { tip: "b", boy: 10.5, renk: LACIVERT });
  });
  iy += 4.6;
  yazi(doc, giris, KENAR + 6, iy, { tip: "r", boy: 8.7, renk: GOVDE });
  return y + h;
}

// ---------------------------------------------------------------------------
// Ozel gun bandi
// ---------------------------------------------------------------------------
const OZEL_SATIR = 4.1; // mesaj satir araligi
const OZEL_ARA = 1.6; // iki gun arasi

function ozelGunBandi(doc: jsPDF, form: IcFiyatFormu, y: number): number {
  const gunler = formOzelGunleri(trGunu(form.onay_zamani));
  if (!gunler.length) return y;
  const mesajlar = gunler.map((g) => bol(doc, g.mesaj, ICERIK_G - 50, "s", 8.8));
  const icerik = mesajlar.reduce((t, m) => t + m.length * OZEL_SATIR, 0) + (gunler.length - 1) * OZEL_ARA;
  const h = Math.max(10, icerik + 5.2);
  doc.setFillColor(...SEFTALI_ZEMIN);
  doc.roundedRect(KENAR, y, ICERIK_G, h, 2.2, 2.2, "F");
  // Dekor: lacivert disk icinde seftali halka (kutlama rozeti)
  const cx = KENAR + 7.5;
  const cy = y + h / 2;
  doc.setFillColor(...LACIVERT);
  doc.circle(cx, cy, 3.6, "F");
  doc.setDrawColor(...SEFTALI);
  doc.setLineWidth(0.6);
  doc.circle(cx, cy, 2.1, "S");
  doc.setFillColor(...SEFTALI);
  doc.circle(cx, cy, 0.8, "F");
  let sy = y + (h - icerik) / 2 + 3.1;
  gunler.forEach((g, i) => {
    yazi(doc, mesajlar[i], KENAR + 14, sy, { tip: "s", boy: 8.8, renk: LACIVERT });
    yazi(doc, ozelGunTarihYazi(g), SAYFA_G - KENAR - 5, sy, { tip: "s", boy: 7.3, renk: SEFTALI_KOYU, hiza: "right" });
    sy += mesajlar[i].length * OZEL_SATIR + OZEL_ARA;
  });
  return y + h;
}

// ---------------------------------------------------------------------------
// Urun tablosu
// ---------------------------------------------------------------------------
function tabloBasligi(doc: jsPDF, y: number): number {
  const h = 8.5;
  doc.setFillColor(...LACIVERT);
  doc.roundedRect(KENAR, y, ICERIK_G, h, 1.8, 1.8, "F");
  doc.rect(KENAR, y + h - 2, ICERIK_G, 2, "F");
  const ty = y + 5.6;
  const b = { tip: "s" as Yazi, boy: 7, renk: BEYAZ };
  yazi(doc, "ÜRÜN / AMBALAJ", SUTUN.urun, ty, b);
  yazi(doc, "VADE", SUTUN.vade, ty, b);
  yazi(doc, "ÖDEME", SUTUN.odeme, ty, b);
  yazi(doc, "TESLİM", SUTUN.teslim, ty, b);
  yazi(doc, "BİRİM FİYAT", SUTUN.fiyatSag, ty, { ...b, hiza: "right" });
  return y + h;
}

// ---------------------------------------------------------------------------
// Sartlar kutusu
// ---------------------------------------------------------------------------
function sartlarOlcu(doc: jsPDF, form: IcFiyatFormu): { satirlar: string[][]; h: number } {
  const satirlar = formSartlari(form.kalemler).map((m) => bol(doc, m, ICERIK_G - 17, "r", 7.9));
  const h = 9.4 + satirlar.reduce((s, m) => s + m.length * 3.55 + 0.9, 0) + 2.2;
  return { satirlar, h };
}

function sartlarKutusu(doc: jsPDF, form: IcFiyatFormu, y: number): number {
  const { satirlar, h } = sartlarOlcu(doc, form);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...CIZGI);
  doc.setLineWidth(0.25);
  doc.roundedRect(KENAR, y, ICERIK_G, h, 2.2, 2.2, "FD");
  yazi(doc, "BİLGİLENDİRME VE SEVKİYAT ŞARTLARI", KENAR + 5, y + 6, { tip: "s", boy: 7.4, renk: LACIVERT, aralik: 0.5 });
  let iy = y + 11.2;
  satirlar.forEach((m, i) => {
    yazi(doc, `${i + 1}.`, KENAR + 5, iy, { tip: "s", boy: 7.9, renk: SEFTALI_KOYU });
    yazi(doc, m, KENAR + 10, iy, { tip: "r", boy: 7.9, renk: GOVDE });
    iy += m.length * 3.55 + 0.9;
  });
  return y + h;
}

// ---------------------------------------------------------------------------
// Siparis sureci zaman cizelgesi
// ---------------------------------------------------------------------------
function surecOlcu(doc: jsPDF): { aciklamalar: string[][]; h: number } {
  const g = ICERIK_G / SIPARIS_SURECI.length;
  const aciklamalar = SIPARIS_SURECI.map((a) => bol(doc, a.aciklama, g - 4, "r", 7));
  const enUzun = Math.max(...aciklamalar.map((a) => a.length));
  // baslik satiri + daire + adim basligi + aciklama + not satiri
  const h = 6 + 9 + 4.6 + enUzun * 3.1 + 9;
  return { aciklamalar, h };
}

function siparisSureci(doc: jsPDF, y: number): number {
  const { aciklamalar, h } = surecOlcu(doc);
  bolumBasligi(doc, y + 3.4, "SİPARİŞ SÜRECİ", "Her adımda WhatsApp ile bilgilendirilirsiniz");
  const g = ICERIK_G / SIPARIS_SURECI.length;
  const cy = y + 10.6;
  const r = 3.9;
  // Baglanti cizgisi (ilk daireden son daireye)
  doc.setDrawColor(...BANT_ACIK);
  doc.setLineWidth(0.6);
  doc.line(KENAR + r + 1, cy, KENAR + (SIPARIS_SURECI.length - 1) * g + r + 1, cy);
  SIPARIS_SURECI.forEach((a, i) => {
    const x = KENAR + i * g;
    const cx = x + r + 1;
    doc.setFillColor(...(i === SIPARIS_SURECI.length - 1 ? SEFTALI : LACIVERT));
    doc.circle(cx, cy, r, "F");
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.8);
    doc.circle(cx, cy, r, "S");
    yazi(doc, String(i + 1), cx, cy + 1.3, { tip: "b", boy: 8.8, renk: BEYAZ, hiza: "center" });
    yazi(doc, a.baslik, x + 1, cy + 8.6, { tip: "b", boy: 8.4, renk: LACIVERT });
    yazi(doc, aciklamalar[i], x + 1, cy + 12.6, { tip: "r", boy: 7, renk: GOVDE });
  });
  const ny = y + h - 1.4;
  doc.setFillColor(...SEFTALI_ZEMIN);
  doc.roundedRect(KENAR, ny - 4.2, ICERIK_G, 6.2, 1.6, 1.6, "F");
  yazi(doc, SIPARIS_SURECI_NOTU, KENAR + 4, ny, { tip: "s", boy: 7.4, renk: LACIVERT });
  return y + h + 1;
}

// ---------------------------------------------------------------------------
// Alt bilgi
// ---------------------------------------------------------------------------
function altBilgi(doc: jsPDF, form: IcFiyatFormu, sayfa: number, toplam: number) {
  doc.setDrawColor(...CIZGI);
  doc.setLineWidth(0.3);
  doc.line(KENAR, ALT_BILGI_Y, SAYFA_G - KENAR, ALT_BILGI_Y);
  yazi(doc, "SİPARİŞ VE BİLGİ", KENAR, ALT_BILGI_Y + 5.4, { tip: "s", boy: 6.6, renk: SOLUK, aralik: 0.5 });
  yazi(doc, `${FORM_SIRKET.iletisimAd}  ·  ${FORM_SIRKET.iletisimTel} (WhatsApp)  ·  ${FORM_SIRKET.iletisimEposta}`, KENAR, ALT_BILGI_Y + 10, {
    tip: "s",
    boy: 8.2,
    renk: LACIVERT,
  });
  yazi(doc, `${FORM_SIRKET.unvan}  ·  ${FORM_SIRKET.web}`, KENAR, ALT_BILGI_Y + 14.4, { tip: "r", boy: 6.6, renk: SOLUK });
  const sertG = 48;
  const sertY = sertG / SERTIFIKA_LOGOLARI_ORAN;
  doc.addImage(SERTIFIKA_LOGOLARI_BASE64, "PNG", SAYFA_G - KENAR - sertG, ALT_BILGI_Y + 4, sertG, sertY);

  // En alt bant
  doc.setFillColor(...LACIVERT_KOYU);
  doc.rect(0, SAYFA_Y - 7, SAYFA_G, 7, "F");
  yazi(doc, form.form_no, KENAR, SAYFA_Y - 2.6, { tip: "s", boy: 7, renk: BANT_ACIK });
  yazi(doc, `Sayfa ${sayfa} / ${toplam}`, SAYFA_G / 2, SAYFA_Y - 2.6, { tip: "r", boy: 7, renk: BANT_ACIK, hiza: "center" });
  yazi(doc, FORM_SIRKET.web, SAYFA_G - KENAR, SAYFA_Y - 2.6, { tip: "s", boy: 7, renk: BANT_ACIK, hiza: "right" });
}

function onizlemeFiligrani(doc: jsPDF) {
  saydamlik(doc, 0.06);
  yazi(doc, "ÖNİZLEME", SAYFA_G / 2, SAYFA_Y / 2 + 20, { tip: "b", boy: 92, renk: LACIVERT, hiza: "center" });
  saydamlik(doc, 1);
}

// ---------------------------------------------------------------------------
export function fiyatFormuPdfOlustur(form: IcFiyatFormu): jsPDF {
  const doc = belgeOlustur();
  const onizleme = form.form_no === "ÖNİZLEME";
  anaBaslik(doc);

  let y = bilgiSeridi(doc, form, BANT_Y + 5.5) + 4.5;
  y = hitapKutusu(doc, form, y) + 4;
  const ozelSonrasi = ozelGunBandi(doc, form, y);
  if (ozelSonrasi > y) y = ozelSonrasi + 3;

  /** Gerekirse yeni sayfa acar; yeni y'yi dondurur. */
  const yerAc = (gereken: number, tabloyla = false): number => {
    if (y + gereken <= SAYFA_SONU) return y;
    doc.addPage();
    kisaBaslik(doc, form);
    return tabloyla ? tabloBasligi(doc, DEVAM_UST) : DEVAM_UST;
  };

  // Urun tablosu (cok satirda sayfa bolunur). Form tek sayfaya birkac mm ile
  // sigmiyorsa satirlar hafifce sikisir (11 -> en az 10 mm); daha uzun
  // listede sayfa bolunur (tek sayfaya zorla sikistirma YOK).
  const sabit = 4 + 3.2 + 8.5 + 4.5 + sartlarOlcu(doc, form).h + 4.5 + surecOlcu(doc).h;
  const satirH = [11, 10.5, 10].find((h) => y + sabit + form.kalemler.length * h <= SAYFA_SONU) ?? 11;
  const kay = (satirH - 11) / 2; // metinleri satirin ortasinda tut
  y = yerAc(8 + 8.5 + satirH);
  y += 4;
  bolumBasligi(doc, y, "ÜRÜN VE FİYAT LİSTESİ", "Birim fiyatlar TL / kg");
  y = tabloBasligi(doc, y + 3.2);
  form.kalemler.forEach((k, i) => {
    y = yerAc(satirH, true);
    if (i % 2 === 1) {
      doc.setFillColor(250, 251, 253);
      doc.rect(KENAR, y, ICERIK_G, satirH, "F");
    }
    yazi(doc, k.urun, SUTUN.urun, y + 5 + kay, { tip: "s", boy: 10.4, renk: LACIVERT });
    yazi(doc, k.ambalaj, SUTUN.urun, y + 8.9 + kay, { tip: "r", boy: 7.8, renk: SOLUK });
    yazi(doc, vadeYazi(k.vade_gun), SUTUN.vade, y + 6.9 + kay, { tip: "r", boy: 9, renk: MUREKKEP });
    yazi(doc, k.odeme, SUTUN.odeme, y + 6.9 + kay, { tip: "r", boy: 9, renk: MUREKKEP });
    yazi(doc, k.teslim, SUTUN.teslim, y + 6.9 + kay, { tip: "r", boy: 9, renk: MUREKKEP });
    yazi(doc, fiyatYazi(k.birim_fiyat), SUTUN.fiyatSag, y + 6.1 + kay, { tip: "b", boy: 13, renk: MUREKKEP, hiza: "right" });
    yazi(doc, `TL/kg · ${kdvYazi(k.kdv_dahil)}`, SUTUN.fiyatSag, y + 9.5 + kay, {
      tip: "s",
      boy: 6.6,
      renk: k.kdv_dahil ? LACIVERT : SOLUK,
      hiza: "right",
    });
    y += satirH;
    doc.setDrawColor(...CIZGI);
    doc.setLineWidth(0.2);
    doc.line(KENAR, y, SAYFA_G - KENAR, y);
  });
  doc.setDrawColor(...LACIVERT);
  doc.setLineWidth(0.5);
  doc.line(KENAR, y, SAYFA_G - KENAR, y);
  y += 4.5;

  // Sartlar
  y = yerAc(sartlarOlcu(doc, form).h);
  y = sartlarKutusu(doc, form, y) + 4.5;

  // Siparis sureci
  y = yerAc(surecOlcu(doc).h);
  y = siparisSureci(doc, y);

  // Her sayfaya alt bilgi (+ onizleme filigrani)
  const toplam = doc.getNumberOfPages();
  for (let s = 1; s <= toplam; s++) {
    doc.setPage(s);
    altBilgi(doc, form, s, toplam);
    if (onizleme) onizlemeFiligrani(doc);
  }
  return doc;
}

export function indirFiyatFormuPdf(form: IcFiyatFormu): void {
  fiyatFormuPdfOlustur(form).save(`${formDosyaAdi(form.form_no)}.pdf`);
}
