/** Arsiv Gmail etiketleme betigi (docs/apps-script/etiket.gs) siniflama kurallari (24.11.2026). Konular kurgusaldir. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const baglam: Record<string, unknown> = {};
vm.createContext(baglam);
vm.runInContext(fs.readFileSync("docs/apps-script/etiket.gs", "utf8"), baglam);
const bul = (konu: string, gonderen = "kurgu@unex.com.tr") => {
  const r = (baglam.etiketBul as (k: string, g: string) => { ana: string; alt: string })(konu, gonderen);
  return `${r.ana}/${r.alt}`;
};

test("ana gruplar ve alt gruplar", () => {
  assert.equal(bul("UNEX // ORNEKLIMAN // NAVLUN TALEBİ HK."), "2-Booking-Acente/Navlun-Talebi");
  assert.equal(bul("BOOKING CONFIRMATION KRGBK0001 / UNEX / 6*20DV / KENDI-VGM MUSTERI"), "2-Booking-Acente/Booking");
  assert.equal(bul("2026/0001 // UNEX // MARPORT - ORNEK // 5*20 DC // KRGBK0001 // CFR"), "2-Booking-Acente/Booking");
  assert.equal(bul("UNEX // BUSSINESS AGREEMENT KRGPRO01 // 3 X 20 DC // ORNEK"), "1-Siparis-Proforma/Sozlesme-Proforma");
  assert.equal(bul("2*20 DC / ORNEK SİPARİŞ BİLDİRİM FORMU / KRGBK0001"), "1-Siparis-Proforma/Siparis-Formu");
  assert.equal(bul("UNEX // ORNEK // GEMİ PROGRAMI HK. // KRGBK0001"), "6-Gemi-ETA/Gemi-Programi-Cutoff");
  assert.equal(bul("ETD-ETA GÜNCEL RAPOR 21.11.2026"), "6-Gemi-ETA/ETD-ETA");
  assert.equal(bul("FATURA VE BEYANNAME TALİMATI HAKKINDA // ORNEK // KRGBK0001"), "8-Gumruk/Fatura-Beyanname-Talimati");
  assert.equal(bul("UNEX // KRGBK0001 // BEYANNAME HK."), "8-Gumruk/Beyanname");
  assert.equal(bul("UNEX // SHIPPING DOCUMENTS: ORNEK // KRGBK0001 // 4x20 DC"), "4-Evrak/Sevkiyat-Evraklari");
  assert.equal(bul("UNEX // DRAFT APPROVAL OF LOADING DOCUMENTS // KRGPRO01 // KRGBK0001"), "4-Evrak/Draft-Onay");
  assert.equal(bul("ECTN Başvuru Talebi / ORNEK - Ref: KRGBK0001"), "4-Evrak/Sertifika-ECTN");
  assert.equal(bul("Ornek Line : Certified True Copy of Bill of Lading 000000001"), "3-Konsimento-DraftBL/BL-Kopya-Telex");
  assert.equal(bul("DRAFT - SH0001 // 5x20 ORNEK FOB"), "3-Konsimento-DraftBL/Draft-BL");
  assert.equal(bul("Fwd: Missing Verified Gross Mass"), "7-Yukleme-Lojistik/VGM");
  assert.equal(bul("UNEX GIDA - ORNEK TMO DEPO: 0000 - buğday irsaliyeleri"), "7-Yukleme-Lojistik/TMO-Irsaliye");
  assert.equal(bul("UNEX // ORNEK // KRGBK0001 // EKİPMAN ALIMI VE ARDİYESİZ GİRİŞ HK."), "7-Yukleme-Lojistik/Ekipman-Konteyner");
});

test("oncelik: odeme / fatura / booking onayi genel kaliplardan once", () => {
  // "SHIPPING DOCUMENTS" yanitinda odeme bildirimi -> odeme
  assert.equal(bul("USD 100,000/- ON 23.11.2026 FOR UNEX Re: UNEX // SHIPPING DOCUMENTS: ORNEK"), "5-Odeme-Banka/Musteri-Odeme");
  assert.equal(bul("Payment Reminder - Booking No: KRGBK0001"), "5-Odeme-Banka/Musteri-Odeme");
  assert.equal(bul("***INVOICE*** E00001 // SHIPMENTS AVAILABLE NEXT VESSEL"), "5-Odeme-Banka/Acente-Fatura");
  assert.equal(bul("RE: FW: Ynt: UNEX // ORNEK // NAVLUN TALEBİ HK."), "2-Booking-Acente/Navlun-Talebi");
});

test("gonderene gore ve bos kalmama", () => {
  assert.equal(bul("[Rapor] Navlun Raporu · 23.11.2026", "Unex AI <bildirim@ihracatasistanim.com>"), "9-Diger/Unex-AI");
  assert.equal(bul("[TEST] [Önemli] Draft Evrak Seti · KRGPRO01", "x@example.com"), "9-Diger/Unex-AI");
  assert.equal(bul("ORNEK LINE - UNEX GIDA IS GELISTIRME HK", "kurgu@hlag.com"), "2-Booking-Acente/Acente-Yazisma");
  assert.equal(bul("Hesap güvenlik kodu", "account-security-noreply@example.com"), "9-Diger/Hesap-Test");
  assert.equal(bul("2026 bakım sözleşmesi", "kurgu@example.com"), "9-Diger/Siniflanmayan");
  assert.equal(bul("", ""), "9-Diger/Siniflanmayan");
});
