import jsPDF from "jspdf";
import { INTER_REGULAR_BASE64, INTER_SEMIBOLD_BASE64, INTER_BOLD_BASE64 } from "@/lib/fonts/inter-tr-base64";
import { UNEX_LOGO_BASE64 } from "@/lib/images/unex-logo-base64";
import { SERTIFIKA_LOGOLARI_BASE64, SERTIFIKA_LOGOLARI_ORAN } from "@/lib/images/sertifika-logolari-base64";
import {
  FORM_SIRKET,
  GECERLILIK_GUN,
  IcFiyatFormu,
  fiyatYazi,
  formDosyaAdi,
  gunYazi,
  hitapYazi,
  kdvYazi,
  onayZamaniYazi,
  vadeYazi,
} from "@/lib/ic-piyasa/fiyat-formu";

/**
 * YAN MAMUL FIYAT BILGILENDIRME FORMU - kurumsal tasarim (revize 11.10.2026).
 *
 * Kullanici: "Fatura talimati gibi oldu; bu bir fiyat bilgilendirme formu,
 * kurumsal, profesyonel, ikna edici bir tasarim dili olmali." Bu yuzden evrak
 * (grid tablo) dili yerine marka dili:
 *   - Lacivert ust bant + logo karosu + seftali serit (logonun iki rengi)
 *   - 3 bilgi karti: Onay tarihi / Gecerlilik / Satis iletisim
 *   - Kisisel hitap, sade (cizgisiz) urun tablosu, BUYUK fiyat + "TL/kg · + KDV"
 *   - Gecerlilik bilgi kutusu, kurumsal alt bilgi + sertifikalar
 * Yazi tipi gercek Inter 400/600/700 (lib/fonts/inter-tr-base64.ts); metin
 * vektor (keskin, aranabilir). Urun cok olursa sayfa kendiliginden bolunur,
 * her sayfada ust bilgi ve alt bilgi tekrar eder. Onizlemede "ONIZLEME"
 * filigrani basilir (yanlislikla musteriye gonderilmesin).
 *
 * Kullanici kararlari (11.10.2026): "Ic Piyasa" yazisi, satis sartlari ve
 * kase/imza YOK. Gecerlilik = onay gunu + 3 gun (sunucuda hesaplanir).
 */

type RGB = [number, number, number];
const LACIVERT: RGB = [40, 52, 116]; // #283474
const LACIVERT_KOYU: RGB = [27, 35, 82];
const SEFTALI: RGB = [244, 160, 124]; // #F4A07C
const SEFTALI_ZEMIN: RGB = [253, 242, 236];
const MUREKKEP: RGB = [29, 35, 51];
const GOVDE: RGB = [74, 81, 99];
const SOLUK: RGB = [118, 126, 143];
const CIZGI: RGB = [226, 229, 237];
const KART_ZEMIN: RGB = [247, 248, 251];
const BANT_ACIK: RGB = [196, 203, 230];

const SAYFA_G = 210;
const SAYFA_Y = 297;
const KENAR = 16;
const ICERIK_G = SAYFA_G - KENAR * 2;
const ALT_BILGI_Y = 262; // alt bilginin ust cizgisi

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

function yazi(
  doc: jsPDF,
  metin: string | string[],
  x: number,
  y: number,
  o: { tip?: Yazi; boy: number; renk: RGB; hiza?: "left" | "right" | "center"; aralik?: number; genislik?: number }
) {
  doc.setFont(o.tip === "b" ? "InterBold" : o.tip === "s" ? "InterSemi" : "Inter", "normal");
  doc.setFontSize(o.boy);
  doc.setTextColor(...o.renk);
  const secenek: Record<string, unknown> = {};
  if (o.hiza && o.hiza !== "left") secenek.align = o.hiza;
  if (o.aralik) secenek.charSpace = o.aralik;
  if (o.genislik) secenek.maxWidth = o.genislik;
  doc.text(metin, x, y, secenek);
}

function saydamlik(doc: jsPDF, oran: number) {
  const D = doc as unknown as { GState: new (o: { opacity: number }) => unknown; setGState: (g: unknown) => void };
  D.setGState(new D.GState({ opacity: oran }));
}

/** Ilk sayfanin buyuk ust bandi. */
function anaBaslik(doc: jsPDF, form: IcFiyatFormu) {
  doc.setFillColor(...LACIVERT);
  doc.rect(0, 0, SAYFA_G, 50, "F");
  // Hafif dekoratif halkalar (bandin sag ustu)
  saydamlik(doc, 0.07);
  doc.setFillColor(255, 255, 255);
  doc.circle(SAYFA_G - 6, 4, 34, "F");
  doc.circle(SAYFA_G - 46, 54, 20, "F");
  saydamlik(doc, 1);
  doc.setFillColor(...SEFTALI);
  doc.rect(0, 50, SAYFA_G, 2.2, "F");

  // Logo karosu
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(KENAR, 11, 28, 28, 4, 4, "F");
  doc.addImage(UNEX_LOGO_BASE64, "PNG", KENAR + 2.5, 13.5, 23, 23);

  const x = KENAR + 35;
  yazi(doc, "UNEX GIDA", x, 19, { tip: "s", boy: 8, renk: SEFTALI, aralik: 1.1 });
  yazi(doc, "Fiyat Bilgilendirme Formu", x, 29.5, { tip: "b", boy: 21, renk: [255, 255, 255] });
  yazi(doc, "Yan Mamul Ürünler", x, 36.8, { tip: "r", boy: 10.5, renk: BANT_ACIK });

  const sag = SAYFA_G - KENAR;
  yazi(doc, "FORM NO", sag, 19, { tip: "s", boy: 7.2, renk: SEFTALI, hiza: "right" });
  yazi(doc, form.form_no, sag, 26.5, { tip: "b", boy: 13, renk: [255, 255, 255], hiza: "right" });
  yazi(doc, onayZamaniYazi(form.onay_zamani).slice(0, 10), sag, 33, { tip: "r", boy: 8.5, renk: BANT_ACIK, hiza: "right" });
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
  yazi(doc, "Fiyat Bilgilendirme Formu", KENAR + 16, 12.3, { tip: "b", boy: 11, renk: [255, 255, 255] });
  yazi(doc, `${form.form_no} · devam`, SAYFA_G - KENAR, 12.3, { tip: "s", boy: 8.5, renk: BANT_ACIK, hiza: "right" });
}

function bilgiKartlari(doc: jsPDF, form: IcFiyatFormu, y: number) {
  const bosluk = 5;
  const g = (ICERIK_G - bosluk * 2) / 3;
  const h = 21;
  const onay = onayZamaniYazi(form.onay_zamani);
  const kartlar = [
    { etiket: "ONAY TARİHİ", deger: onay.slice(0, 10), alt: `Saat ${onay.slice(11)}`, vurgu: false },
    { etiket: "GEÇERLİLİK", deger: gunYazi(form.gecerlilik_bitis), alt: `tarihine kadar · ${GECERLILIK_GUN} gün`, vurgu: true },
    { etiket: "SATIŞ İLETİŞİM", deger: FORM_SIRKET.iletisimAd, alt: `${FORM_SIRKET.iletisimTel} · WhatsApp`, vurgu: false },
  ];
  kartlar.forEach((k, i) => {
    const x = KENAR + i * (g + bosluk);
    doc.setFillColor(...(k.vurgu ? SEFTALI_ZEMIN : KART_ZEMIN));
    doc.setDrawColor(...CIZGI);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, g, h, 2.2, 2.2, "FD");
    if (k.vurgu) {
      doc.setFillColor(...SEFTALI);
      doc.rect(x, y + 3, 1.3, h - 6, "F");
    }
    yazi(doc, k.etiket, x + 5, y + 6.6, { tip: "s", boy: 6.8, renk: SOLUK, aralik: 0.5 });
    yazi(doc, k.deger, x + 5, y + 13.4, { tip: "b", boy: 12, renk: LACIVERT });
    yazi(doc, k.alt, x + 5, y + 17.8, { tip: "r", boy: 7.6, renk: SOLUK });
  });
  return y + h;
}

function tabloBasligi(doc: jsPDF, y: number): number {
  const h = 9;
  doc.setFillColor(...LACIVERT);
  doc.roundedRect(KENAR, y, ICERIK_G, h, 1.8, 1.8, "F");
  doc.rect(KENAR, y + h - 2, ICERIK_G, 2, "F");
  const ty = y + 5.9;
  const b = { tip: "s" as Yazi, boy: 7.2, renk: [255, 255, 255] as RGB };
  yazi(doc, "ÜRÜN / AMBALAJ", SUTUN.urun, ty, b);
  yazi(doc, "VADE", SUTUN.vade, ty, b);
  yazi(doc, "ÖDEME", SUTUN.odeme, ty, b);
  yazi(doc, "TESLİM", SUTUN.teslim, ty, b);
  yazi(doc, "BİRİM FİYAT", SUTUN.fiyatSag, ty, { ...b, hiza: "right" });
  return y + h;
}

function altBilgi(doc: jsPDF, form: IcFiyatFormu, sayfa: number, toplam: number) {
  doc.setDrawColor(...CIZGI);
  doc.setLineWidth(0.3);
  doc.line(KENAR, ALT_BILGI_Y, SAYFA_G - KENAR, ALT_BILGI_Y);
  let y = ALT_BILGI_Y + 6;
  yazi(doc, FORM_SIRKET.unvan, KENAR, y, { tip: "s", boy: 7.8, renk: LACIVERT });
  const satirlar = [
    `${FORM_SIRKET.adres1}, ${FORM_SIRKET.adres2}`,
    `T ${FORM_SIRKET.tel}   ·   F ${FORM_SIRKET.faks}`,
    `${FORM_SIRKET.eposta}   ·   ${FORM_SIRKET.web}   ·   ${FORM_SIRKET.vergi}`,
  ];
  satirlar.forEach((s) => {
    y += 4.1;
    yazi(doc, s, KENAR, y, { tip: "r", boy: 7.1, renk: SOLUK });
  });
  const sertG = 54;
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

export function fiyatFormuPdfOlustur(form: IcFiyatFormu): jsPDF {
  const doc = belgeOlustur();
  const onizleme = form.form_no === "ÖNİZLEME";
  anaBaslik(doc, form);

  let y = bilgiKartlari(doc, form, 62) + 11;

  // Hitap + giris
  yazi(doc, hitapYazi(form.alici), KENAR, y, { tip: "s", boy: 11, renk: MUREKKEP, genislik: ICERIK_G });
  doc.setFont("InterSemi", "normal");
  doc.setFontSize(11);
  y += (doc.splitTextToSize(hitapYazi(form.alici), ICERIK_G) as string[]).length * 5.2;
  doc.setFont("Inter", "normal");
  doc.setFontSize(9.4);
  const giris = doc.splitTextToSize(
    `Güncel yan mamul fiyatlarımız aşağıda bilgilerinize sunulmuştur. Fiyatlar ${onayZamaniYazi(form.onay_zamani).slice(0, 10)} tarihinden itibaren ${GECERLILIK_GUN} gün geçerlidir. İyi çalışmalar dileriz.`,
    ICERIK_G
  ) as string[];
  yazi(doc, giris, KENAR, y + 0.5, { tip: "r", boy: 9.4, renk: GOVDE });
  y += giris.length * 4.6 + 8;

  // Bolum basligi
  doc.setFillColor(...SEFTALI);
  doc.rect(KENAR, y - 3.4, 1.2, 4.6, "F");
  yazi(doc, "ÜRÜN VE FİYAT LİSTESİ", KENAR + 3.6, y, { tip: "s", boy: 8, renk: LACIVERT, aralik: 0.6 });
  yazi(doc, "Birim fiyatlar TL / kg", SAYFA_G - KENAR, y, { tip: "r", boy: 7.6, renk: SOLUK, hiza: "right" });
  y = tabloBasligi(doc, y + 3.5);

  // Satirlar (cok satirda sayfa bolunur)
  const satirH = 15.5;
  const kutuH = 18;
  const sayfaSonu = ALT_BILGI_Y - 6;
  form.kalemler.forEach((k, i) => {
    const sonSatir = i === form.kalemler.length - 1;
    const gereken = satirH + (sonSatir ? kutuH + 10 : 0);
    if (y + gereken > sayfaSonu) {
      doc.addPage();
      kisaBaslik(doc, form);
      y = tabloBasligi(doc, 30);
    }
    if (i % 2 === 1) {
      doc.setFillColor(250, 251, 253);
      doc.rect(KENAR, y, ICERIK_G, satirH, "F");
    }
    yazi(doc, k.urun, SUTUN.urun, y + 6.8, { tip: "s", boy: 11, renk: LACIVERT });
    yazi(doc, k.ambalaj, SUTUN.urun, y + 11.6, { tip: "r", boy: 8.2, renk: SOLUK });
    yazi(doc, vadeYazi(k.vade_gun), SUTUN.vade, y + 9.2, { tip: "r", boy: 9.3, renk: MUREKKEP });
    yazi(doc, k.odeme, SUTUN.odeme, y + 9.2, { tip: "r", boy: 9.3, renk: MUREKKEP });
    yazi(doc, k.teslim, SUTUN.teslim, y + 9.2, { tip: "r", boy: 9.3, renk: MUREKKEP });
    yazi(doc, fiyatYazi(k.birim_fiyat), SUTUN.fiyatSag, y + 8.4, { tip: "b", boy: 15, renk: MUREKKEP, hiza: "right" });
    yazi(doc, `TL/kg · ${kdvYazi(k.kdv_dahil)}`, SUTUN.fiyatSag, y + 12.6, {
      tip: "s",
      boy: 6.9,
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

  // KDV notu
  const hepsiDahil = form.kalemler.every((k) => k.kdv_dahil);
  const hicbiriDahil = form.kalemler.every((k) => !k.kdv_dahil);
  const kdvNotu = hepsiDahil
    ? "Tüm birim fiyatlara KDV dahildir."
    : hicbiriDahil
    ? "Birim fiyatlara KDV dahil değildir."
    : "KDV durumu her ürünün fiyatının altında belirtilmiştir.";
  yazi(doc, kdvNotu, SAYFA_G - KENAR, y + 4.8, { tip: "r", boy: 7.6, renk: SOLUK, hiza: "right" });
  y += 10;

  // Gecerlilik / iletisim kutusu
  doc.setFillColor(...SEFTALI_ZEMIN);
  doc.roundedRect(KENAR, y, ICERIK_G, kutuH, 2.2, 2.2, "F");
  doc.setFillColor(...SEFTALI);
  doc.rect(KENAR, y + 3, 1.3, kutuH - 6, "F");
  yazi(
    doc,
    `Fiyatlar ${onayZamaniYazi(form.onay_zamani).slice(0, 10)} tarihinde onaylanmış olup ${gunYazi(form.gecerlilik_bitis)} tarihine kadar geçerlidir.`,
    KENAR + 6,
    y + 7.3,
    { tip: "s", boy: 9.3, renk: LACIVERT }
  );
  yazi(
    doc,
    `Sipariş ve bilgi için: ${FORM_SIRKET.iletisimAd}  ·  ${FORM_SIRKET.iletisimTel}  ·  ${FORM_SIRKET.iletisimEposta}`,
    KENAR + 6,
    y + 12.9,
    { tip: "r", boy: 8.4, renk: GOVDE }
  );

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
