/**
 * 25.11.2026: Ic Piyasa > Gemi Tahliye - rapor hesabi, liman listesi ayristirma, Excel sayfalari. Veriler KURGUDUR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GemiAlici, GemiArac, GemiTahliye, aracFarki, bekleyenDurumu, gemiRaporu, limanBekliyorMu, limanListesiAyristir, araclariSirala } from "@/lib/ic-piyasa/gemi-tahliye";
import { gemiRaporSayfalari, gemiRaporDosyaAdi } from "@/lib/ic-piyasa/gemi-tahliye-xlsx";

const gemi: GemiTahliye = {
  id: "g1", company_id: "c", gemi_adi: "MV KURGU YILDIZ", satici: "KURGU SATICI", tahliye_limani: "KURGU LIMANI", urun: "Buğday", kalite: null,
  bl_kg: 200000, baslangic: null, durum: "acik", kapanis_zamani: null, notlar: null, olusturan_email: null, olusturma: "2026-11-25T08:00:00Z",
};
const alicilar: GemiAlici[] = [
  { id: "a1", gemi_id: "g1", firma: "KURGU ALICI A", miktar_kg: 60000, notlar: null, olusturma: "1" },
  { id: "a2", gemi_id: "g1", firma: "KURGU ALICI B", miktar_kg: 30000, notlar: null, olusturma: "2" },
];
let n = 0;
const arac = (tarih: string, plaka: string, liman: number, teslim: number | null, alici: string | null): GemiArac => ({
  id: `x${++n}`, gemi_id: "g1", alici_id: alici, tarih, plaka, liman_kg: liman, teslim_kg: teslim, kaynak: alici ? "ofis" : "kantar",
  uyarilar: [], notlar: null, girilen_email: null, olusturma: `2026-11-25T10:${String(n).padStart(2, "0")}:00Z`,
});
const araclar: GemiArac[] = [
  arac("2026-11-25", "34 KRG 001", 29000, 28960, null),
  arac("2026-11-25", "34 KRG 002", 30000, 30000, null),
  arac("2026-11-26", "34 KRG 001", 28000, 27940, null),
  arac("2026-11-25", "34 KRG 101", 31000, null, "a1"),
  arac("2026-11-26", "34 KRG 102", 30000, null, "a1"),
  arac("2026-11-26", "34 KRG 201", 31000, null, "a2"),
];

test("Gemi raporu: gelen / yuzde / UNEX fark ve fire yalniz UNEX araclarindan", () => {
  const r = gemiRaporu(gemi, alicilar, araclar);
  assert.equal(r.gelenKg, 179000);
  assert.equal(r.gelenArac, 6);
  assert.equal(Math.round(r.yuzde * 100) / 100, 89.5);
  assert.equal(r.kalanKg, 21000);
  assert.equal(r.unexLimanKg, 87000);
  assert.equal(r.unexTeslimKg, 86900);
  assert.equal(r.unexFarkKg, -100);
  assert.equal(Math.round((r.firePct ?? 0) * 1000) / 1000, 0.115);
  // Kalan arac: sablondaki (=gelen/ortalama = gelen arac sayisi) hatasi yok; kalan / ortalama yukari
  assert.equal(r.kalanAracTahmini, Math.ceil(21000 / (179000 / 6)));
  assert.deepEqual(r.yerler.map((y) => [y.ad, y.limanKg, y.arac, y.kalanKg]), [
    ["UNEX GIDA", 87000, 3, null], ["KURGU ALICI A", 61000, 2, -1000], ["KURGU ALICI B", 31000, 1, -1000],
  ]);
  assert.deepEqual(r.gunler.map((g) => [g.tarih, g.arac]), [["2026-11-26", 3], ["2026-11-25", 3]]);
});

test("Gemi raporu: arac yokken bolme hatasi yok", () => {
  const r = gemiRaporu(gemi, [], []);
  assert.equal(r.gelenKg, 0);
  assert.equal(r.kalanAracTahmini, null);
  assert.equal(r.firePct, null);
  assert.equal(r.yuzde, 0);
});

test("Arac sirasi: tarih, sonra giris sirasi", () => {
  const s = araclariSirala(araclar);
  assert.deepEqual(s.slice(0, 3).map((a) => a.plaka), ["34 KRG 001", "34 KRG 002", "34 KRG 101"]);
});

test("Liman listesi: sablon satiri, tek bosluklu plaka, TAB, binlik nokta, baslik ve hatalar", () => {
  const metin = [
    "TARİH\tPLAKA\tLİMAN\tGİTTİĞİ YER\tGEMİ İSMİ",
    "20.11.2026\t34KRG301\t26400\tKURGU ALICI A\tMV KURGU YILDIZ",
    "34 KRG 302 30.960",
    "34 KRG 1234 25800",
    "21/11/26;34KRG303;29,5",
    "34KRG304 999999",
    "31.02.2026 34KRG305 28000",
    "",
    "kurgu yok",
  ].join("\n");
  const { satirlar, hatalar } = limanListesiAyristir(metin, "2026-11-25");
  assert.deepEqual(satirlar.map((s) => [s.tarih, s.plaka, s.liman_kg]), [
    ["2026-11-20", "34 KRG 301", 26400],
    ["2026-11-25", "34 KRG 302", 30960],
    ["2026-11-25", "34 KRG 1234", 25800],
  ]);
  assert.deepEqual(hatalar.map((h) => h.satir), [5, 6, 7, 9]);
  assert.match(hatalar[0].hata, /ton mu/);
  assert.match(hatalar[1].hata, /60\.000/);
  assert.match(hatalar[2].hata, /Tarih/);
});

test("Excel: ana sayfa + UNEX + her alici; toplamlar ve ozet", () => {
  const s = gemiRaporSayfalari(gemi, alicilar, araclar);
  assert.deepEqual(s.map((x) => x.ad), ["MV KURGU YILDIZ", "MV KURGU YILDIZ- UNEX", "MV KURGU YILDIZ- KURGU ALICI A", "MV KURGU YILDIZ- KURGU ALICI B"]);
  const ana = s[0].satirlar;
  assert.deepEqual(ana[0]?.map((h) => h?.v), ["TARİH", "PLAKA", "LİMAN", "TESLİM", "FARK", "GİTTİĞİ YER", "GEMİ İSMİ"]);
  // satis aracinda teslim / fark bos
  const satis = ana.find((r) => r[1]?.v === "34 KRG 101");
  assert.equal(satis?.[3]?.v, null);
  assert.equal(satis?.[5]?.v, "KURGU ALICI A");
  const toplam = ana.find((r) => r[0]?.v === "TOPLAM");
  assert.deepEqual(toplam?.slice(1, 5).map((h) => h?.v), ["6 araç", 179000, 86900, -100]);
  const yuzde = ana.find((r) => r[1]?.v === "%");
  assert.equal(yuzde?.[2]?.v, 89.5);
  assert.ok(s.every((x) => x.ad.length <= 31));
});

test("Excel: uzun / ayni kisaltmali sayfa adlari benzersiz ve <= 31", () => {
  const uzun = [
    { id: "u1", gemi_id: "g1", firma: "KURGU COK UZUN ALICI FIRMA ADI TICARET 1", miktar_kg: 1, notlar: null, olusturma: "1" },
    { id: "u2", gemi_id: "g1", firma: "KURGU COK UZUN ALICI FIRMA ADI TICARET 2", miktar_kg: 1, notlar: null, olusturma: "2" },
  ];
  const ad = gemiRaporSayfalari(gemi, uzun, []).map((x) => x.ad);
  assert.equal(new Set(ad.map((a) => a.toUpperCase())).size, ad.length);
  assert.ok(ad.every((a) => a.length <= 31));
});

test("Excel dosya adi ASCII", () => {
  assert.equal(gemiRaporDosyaAdi({ gemi_adi: "MV ÇİĞ ÖRNEK" }, "2026-11-25"), "25.11.2026_MV_CIG_ORNEK_TAHLIYE_RAPORU.xlsx");
});

test("Iki asama: yoldaki UNEX araci fark / fire'ye girmez, ayri sayilir", () => {
  const ek = [...araclar, arac("2026-11-26", "34 KRG 003", 30000, null, null)];
  const r = gemiRaporu(gemi, alicilar, ek);
  assert.equal(r.yoldaArac, 1);
  assert.equal(r.yoldaKg, 30000);
  assert.equal(r.unexLimanKg, 117000);
  assert.equal(r.unexTeslimliLimanKg, 87000);
  assert.equal(r.unexFarkKg, -100);
  assert.equal(Math.round((r.firePct ?? 0) * 1000) / 1000, 0.115);
  assert.equal(r.yerler[0].yoldaArac, 1);
  const s = gemiRaporSayfalari(gemi, alicilar, ek);
  const satir = s[0].satirlar.find((x) => x[1]?.v === "34 KRG 003");
  assert.equal(satir?.[3]?.v, null);
  assert.equal(satir?.[4]?.v, null);
  assert.equal(satir?.[5]?.v, "UNEX GIDA (tartım bekliyor)");
  assert.ok(s[0].satirlar.some((x) => x[1]?.v === "Yolda (tartım bekleyen)" && x[2]?.v === 30000));
});

test("Fabrika esasli: liman fisi bekleyen otomatik arac gelene kantar kg ile girer, fark / fireye girmez", () => {
  const bekleyen: GemiArac = { ...arac("2026-11-26", "34 KRG 004", 0, 26500, null), liman_kg: null, kaynak: "otomatik" };
  const ek = [...araclar, bekleyen];
  const r = gemiRaporu(gemi, alicilar, ek);
  assert.equal(r.gelenKg, 179000 + 26500);
  assert.equal(r.gelenArac, 7);
  assert.equal(r.limanBekleyenArac, 1);
  assert.equal(r.limanBekleyenKg, 26500);
  assert.equal(r.unexLimanKg, 87000);
  assert.equal(r.unexTeslimKg, 86900 + 26500);
  assert.equal(r.unexEslesmisTeslimKg, 86900);
  assert.equal(r.unexFarkKg, -100);
  assert.equal(Math.round((r.firePct ?? 0) * 1000) / 1000, 0.115);
  assert.equal(r.yoldaArac, 0);
  assert.equal(aracFarki(bekleyen), null);
  assert.equal(limanBekliyorMu(bekleyen), true);
  const s = gemiRaporSayfalari(gemi, alicilar, ek);
  const satir = s[0].satirlar.find((x) => x[1]?.v === "34 KRG 004");
  assert.equal(satir?.[2]?.v, null);
  assert.equal(satir?.[3]?.v, 26500);
  assert.equal(satir?.[4]?.v, null);
  assert.equal(satir?.[5]?.v, "UNEX GIDA (liman fişi bekleniyor)");
  // Ana sayfa TOPLAM satirinin LIMAN sutunu yalniz liman agirliklari (179.000)
  const toplam = s[0].satirlar.find((x) => x[0]?.v === "TOPLAM");
  assert.equal(toplam?.[2]?.v, 179000);
  assert.ok(s[0].satirlar.some((x) => x[1]?.v === "Liman fişi bekleyen" && x[2]?.v === 26500));
});

test("bekleyenDurumu: aday yok -> excel, aday var -> onay, kaldirildi -> kapali", () => {
  const f = { fis_id: "f", fis_kodu: "K1", plaka: "34 KRG 9", net_kg: 1, cikis: "", net_fark: 40, dolu_fark: 90, dakika: 20, puan: 0 };
  assert.equal(bekleyenDurumu({ adaylar: [], kapali: false }), "excel");
  assert.equal(bekleyenDurumu({ adaylar: [f], kapali: false }), "onay");
  assert.equal(bekleyenDurumu({ adaylar: [f], kapali: true }), "kapali");
});
