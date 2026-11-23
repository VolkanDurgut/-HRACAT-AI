/**
 * Booking'e gore siparis takibi (22.11.2026): karar, secim dagitimi, adres eki, panel aksiyonu, prova, ortam.
 * Veriler KURGUSALDIR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingParametresi, bookingAdresEki, bookingKarari, bookingSecimleri, secimFclToplami, secimdenKalemler, secimMts,
} from "@/lib/siparis-devam";
import { bookingliAksiyon, isEmirleriHazirla, type IsEmri } from "@/lib/panel/is-emirleri";
import { provaKalemleri } from "@/lib/prova";
import { ortamCoz } from "@/lib/ortam";
import type { SiparisKalemDurumu } from "@/lib/siparis-takip";

const kalem = (marka: string, acikMts: number, ek: Partial<SiparisKalemDurumu> = {}): SiparisKalemDurumu => ({
  urunAdi: `DEMO WHEAT FLOUR(${marka} BRAND)`, marka, ambalajKg: 25, birimFiyat: 400, ambalajBoyutu: "25 KG",
  siparisMts: acikMts, dosyalananMts: 0, sevkMts: 0, fazlaMts: 0, kalanMts: acikMts, acikMts, ...ek,
});

test("bookingParametresi: gecerli / bozuk / makul disi", () => {
  assert.deepEqual(bookingParametresi(" DEMOBK1 ", "10"), { no: "DEMOBK1", fcl: 10 });
  assert.equal(bookingParametresi("", "10"), null);
  assert.equal(bookingParametresi("DEMOBK1", null), null);
  assert.equal(bookingParametresi("DEMOBK1", "0"), null);
  assert.equal(bookingParametresi("DEMOBK1", "2.5"), null);
  assert.equal(bookingParametresi("DEMOBK1", "abc"), null);
  assert.equal(bookingParametresi("DEMOBK1", "201"), null);
  assert.equal(bookingParametresi("X".repeat(41), "5"), null);
});

test("bookingAdresEki: kodlanir; konteyner yoksa bos", () => {
  assert.equal(bookingAdresEki("DEMO BK/1", 5), "&booking=DEMO%20BK%2F1&fcl=5");
  assert.equal(bookingAdresEki("DEMOBK1", null), "");
  assert.equal(bookingAdresEki(null, 5), "");
});

test("bookingKarari: 750 MTS proforma + 10 FCL booking -> takip, bu dosya 250 MTS", () => {
  const k = bookingKarari(750, 10);
  assert.equal(k.tur, "takip");
  if (k.tur === "belirsiz") return;
  assert.equal(k.hedefFcl, 30);
  assert.equal(k.sevkiyatMts, 250);
});

test("bookingKarari: esit ve kusurat toleransi tek; buyuk booking fazla; bozuk girdi belirsiz", () => {
  assert.equal(bookingKarari(125, 5).tur, "tek");
  assert.equal(bookingKarari(252.45, 10).tur, "tek"); // 10,1 FCL
  const t = bookingKarari(252.45, 10);
  if (t.tur !== "belirsiz") assert.equal(t.sevkiyatMts, 252.45); // tek: proformanin KESIN miktari
  assert.equal(bookingKarari(262.5, 10).tur, "tek"); // 10,5 FCL - sinirda
  assert.equal(bookingKarari(275, 10).tur, "takip"); // 11 FCL
  assert.equal(bookingKarari(125, 6).tur, "fazla");
  assert.equal(bookingKarari(0, 5).tur, "belirsiz");
  assert.equal(bookingKarari(125, 0).tur, "belirsiz");
  assert.equal(bookingKarari(Number.NaN, 5).tur, "belirsiz");
});

test("bookingSecimleri: tek kalem -> booking FCL'i; kalan acikta", () => {
  const s = bookingSecimleri([kalem("DEMOA", 750)], 10);
  assert.equal(s[0].secili, true);
  assert.equal(s[0].fcl, 10);
  assert.equal(secimMts(s[0]), 250);
  assert.equal(secimFclToplami(s), 10);
  assert.equal(secimdenKalemler(s)[0].miktar_mts, "250.00");
});

test("bookingSecimleri: cok marka sirayla dagitilir, tam karsilanan kalem KESIN miktar; acigi olmayan atlanir", () => {
  const s = bookingSecimleri([kalem("DEMOA", 0), kalem("DEMOB", 102.5), kalem("DEMOC", 250)], 6);
  assert.deepEqual(s.map((x) => [x.secili, x.fcl]), [[false, 0], [true, 4.1], [true, 1.9]]);
  assert.equal(secimMts(s[1]), 102.5);
  assert.equal(secimMts(s[2]), 47.5);
  assert.equal(secimFclToplami(s), 6);
});

test("bookingSecimleri: booking acik miktardan buyukse artan dagitilmaz (pencere uyarir)", () => {
  const s = bookingSecimleri([kalem("DEMOA", 50)], 5);
  assert.equal(s[0].fcl, 2);
  assert.equal(secimFclToplami(s), 2);
});

const rezSatir = (ek: Partial<IsEmri> = {}): IsEmri => ({
  tur: "rezervasyonlu", anahtar: "excel:x", musteri: "DEMO", proforma_no: "DEMOOMG091126", booking_no: "DEMOBK1", konteyner: 10,
  cinsi: null, varis_limani: null, cuval_markasi: null, ambalaj: null, acente: null, liman: null, ekipman: null, bos_ekipman_tarihi: null,
  ardiyesiz_giris: null, talimat_cutoff: null, beyan_cutoff: null, etd: null, gemi: null, sefer: null, on_odeme_tarihi: null, ...ek,
});

test("bookingliAksiyon: Dosya ac / Sevkiyat ac booking eki alir; diger aksiyonlar ve on odeme aynen", () => {
  const dosya = { tur: "dosya_ac" as const, etiket: "Dosya aç", href: "/yeni-dosya?proforma=p-1&otomatik=1", aciklama: "" };
  const sevk = { tur: "sevkiyat" as const, etiket: "Sevkiyat aç", href: "/ihracatlar?siparis=DEMOOMG091126", aciklama: "" };
  const rez = { tur: "rezervasyon" as const, etiket: "Rezervasyon ekle", href: "/dosya/f-1?tab=rezervasyon&action=new", aciklama: "" };
  assert.equal(bookingliAksiyon(rezSatir(), dosya).href, "/yeni-dosya?proforma=p-1&otomatik=1&booking=DEMOBK1&fcl=10");
  assert.equal(bookingliAksiyon(rezSatir(), sevk).href, "/ihracatlar?siparis=DEMOOMG091126&booking=DEMOBK1&fcl=10");
  assert.equal(bookingliAksiyon(rezSatir(), rez).href, rez.href);
  assert.equal(bookingliAksiyon(rezSatir({ tur: "on_odeme" }), dosya).href, dosya.href);
  assert.equal(bookingliAksiyon(rezSatir({ konteyner: null }), dosya).href, dosya.href);
});

test("isEmirleriHazirla: rezervasyonlu Dosya ac adresinde booking ve konteyner", () => {
  const h = isEmirleriHazirla({
    satirlar: [{ tur: "rezervasyonlu", anahtar: "excel:1", musteri: "DEMO", proforma_no: "DEMOOMG091126", booking_no: "DEMOBK1", konteyner: 10, etd: "2026-12-18" }],
    aksiyonlar: [{ proforma_no: "DEMOOMG091126", proforma_id: "p-1", dosya: null, ana_siparis: null }],
  });
  assert.equal(h.rezervasyonlu[0].aksiyon.href, "/yeni-dosya?proforma=p-1&otomatik=1&booking=DEMOBK1&fcl=10");
});

test("provaKalemleri: proforma / secim kalemleri; bozuk girdi", () => {
  assert.deepEqual(provaKalemleri([{ urun_adi: "DEMO FLOUR", miktar_mts: "250.00", toplam_tutar_usd: "100000.00" }]),
    [{ urun: "DEMO FLOUR", mts: 250, tutar: 100000 }]);
  assert.deepEqual(provaKalemleri([{ description: "DEMO", quantity: "1.250,5" }]), [{ urun: "DEMO", mts: 1250.5, tutar: null }]);
  assert.deepEqual(provaKalemleri(null), []);
});

test("ortamCoz: yalniz tam 'test' test sayilir", () => {
  assert.equal(ortamCoz("test"), "test");
  assert.equal(ortamCoz(" test "), "test");
  assert.equal(ortamCoz("canli"), "canli");
  assert.equal(ortamCoz(undefined), "canli");
  assert.equal(ortamCoz("TEST-x"), "canli");
});
