/**
 * Ana Panel 23.11.2026 aksam: dolu gostergesi, sabah plani / gerceklesen, filo ve bugday denklemi.
 * Veriler KURGUSALDIR (plakalar, tedarikci ve musteri adlari uydurmadir).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { kapasiteHesapla, sabahKarsilastirmasi, type Kapasite, type YuklemeIsi } from "@/lib/panel/gunluk-yukleme";
import { doluDurumu } from "@/lib/panel/is-listesi";
import { filoPlaniKur, filoVerisiHazirla, gunDagilimi, VARSAYILAN_SEFER_ARAC_GUN } from "@/lib/panel/filo-plani";

const PZT_CMT = [1, 2, 3, 4, 5, 6];
const KAP: Kapasite = { gunSayisi: 58, ortalama: 5.6, p75: 7, max: 13, isGunleri: PZT_CMT };
const is = (anahtar: string, ek: Partial<YuklemeIsi>): YuklemeIsi => ({
  anahtar, etiket: anahtar, dosyaNo: null, toplam: 0, alinan: 0, dolu: 0, bugunDolu: 0, talimatTarihi: null, beyanTarihi: null,
  ekipmanTarihi: null, talimatTamam: false, beyanTamam: false, takipli: true, ...ek,
});

test("doluDurumu: tam / kismi / yok", () => {
  assert.equal(doluDurumu({ toplam: 2, alinan: 2, dolu: 2, kalan: 0 }), "tam");
  assert.equal(doluDurumu({ toplam: 6, alinan: 4, dolu: 1, kalan: 5 }), "kismi");
  assert.equal(doluDurumu({ toplam: 6, alinan: 4, dolu: 0, kalan: 6 }), "kismi");
  assert.equal(doluDurumu({ toplam: 3, alinan: 0, dolu: 0, kalan: 3 }), "yok");
  assert.equal(doluDurumu({ toplam: 0, alinan: 0, dolu: 0, kalan: 0 }), "yok");
});

// 23.11.2026 Pazartesi aksami: bugun 5 tartim yapildi
const AKSAM = [
  is("A", { toplam: 2, alinan: 2, dolu: 2, bugunDolu: 2, talimatTamam: true, beyanTarihi: "2026-11-24", beyanZaman: "2026-11-24T10:00", ardiyesizTarihi: "2026-11-22" }),
  // B: beyanname aksam verildi; sabah verilmemis sayilmali (yoksa sabah planinda gorunmez)
  is("B", { toplam: 2, alinan: 2, dolu: 2, bugunDolu: 1, talimatTamam: true, beyanTamam: true, beyanTarihi: "2026-11-24", beyanZaman: "2026-11-24T14:00" }),
  is("C", { toplam: 2, alinan: 2, dolu: 2, bugunDolu: 1, talimatTamam: true, beyanTarihi: "2026-11-25", beyanZaman: "2026-11-25T10:00", cuvalKg: 25 }),
  is("D", { toplam: 3, beyanTarihi: "2026-11-27", beyanZaman: "2026-11-27T10:00", talimatTarihi: "2026-11-27", ekipmanTarihi: "2026-11-21" }),
  // E: ardiyesiz giris 25.11 -> plan Salidan baslar; bugun 1 yuklendi = plan disi
  is("E", { toplam: 6, alinan: 4, dolu: 1, bugunDolu: 1, beyanTarihi: "2026-11-27", beyanZaman: "2026-11-27T14:00", talimatTarihi: "2026-11-26", ardiyesizTarihi: "2026-11-25", ekipmanTarihi: "2026-11-20", cuvalKg: 25 }),
  // K1/K2: dosyasi acilmamis booking (tartim sisteme dusemez)
  is("K1", { toplam: 5, takipli: false, beyanTarihi: "2026-11-26", beyanZaman: "2026-11-26T12:00", talimatTarihi: "2026-11-26", ekipmanTarihi: "2026-11-23" }),
  is("K2", { toplam: 5, takipli: false, beyanTarihi: "2026-11-26", beyanZaman: "2026-11-26T12:00", talimatTarihi: "2026-11-26", ekipmanTarihi: "2026-11-23" }),
];

test("sabah plani yeniden kurulur: hedef sabit, eksik ve plan disi nedenleriyle", () => {
  const k = sabahKarsilastirmasi(AKSAM, KAP, "2026-11-23")!;
  assert.equal(k.sabahHedef, 6);
  assert.equal(k.yapilan, 5);
  assert.equal(k.eksik, 1);
  const by = Object.fromEntries(k.satirlar.map((s) => [s.anahtar, s]));
  assert.deepEqual([by.A.plan, by.A.yapilan], [2, 2]);
  assert.deepEqual([by.B.plan, by.B.yapilan], [1, 1]);
  assert.deepEqual([by.C.plan, by.C.yapilan], [1, 1]);
  assert.equal(by.E.neden, "plan_disi");
  assert.equal(k.satirlar[0].neden, "takipsiz"); // en buyuk eksik ustte
  assert.equal(k.satirlar[0].plan - k.satirlar[0].yapilan, 2);
  assert.equal(by.D, undefined); // planda yok, yapilmadi -> listede yok
});

test("sabah plani: is gunu degilse null", () => {
  assert.equal(sabahKarsilastirmasi(AKSAM, KAP, "2026-11-22"), null);
  assert.equal(kapasiteHesapla([]).gunSayisi, 0);
});

const HAM = {
  bugun: "2026-11-23",
  filo: ["TEST-01", "TEST-02", "TEST-03", "TEST-04", "TEST-05", "TEST-06", "TEST-07", "TEST-08"],
  gunler: [
    // bugun: 5 konteyner, 1 arac 2 ic satis, 1 arac ic satis + bugday, 08 hic yok
    ...["01", "02", "03", "04", "05"].map((n) => ({ gun: "2026-11-23", plaka: `TEST-${n}`, konteyner: 1, alis: 0, sevk: 0 })),
    { gun: "2026-11-23", plaka: "TEST-06", konteyner: 0, alis: 0, sevk: 2 },
    { gun: "2026-11-23", plaka: "TEST-07", konteyner: 0, alis: 1, sevk: 1 },
    // gecen hafta: her gun 4 konteyner + 06 bugday; 07 bosta
    ...["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"].flatMap((g) => [
      ...["01", "02", "03", "04"].map((n) => ({ gun: g, plaka: `TEST-${n}`, konteyner: 1, alis: 0, sevk: 0 })),
      { gun: g, plaka: "TEST-06", konteyner: 0, alis: 2, sevk: 0 },
      { gun: g, plaka: "TEST-05", konteyner: 0, alis: 0, sevk: 1 },
    ]),
    { gun: "2026-11-09", plaka: "TEST-08", konteyner: 1, alis: 0, sevk: 0 },
  ],
  alislar: [
    { no: "AS-K1", tedarikci: "KURGU TMO", urun: "Buğday", hedef_kg: 500000, gelen_kg: 100000, sefer: 4, son_teslim: "2026-11-10", termin: "2026-11-17" },
    { no: "AS-K2", tedarikci: "KURGU AJANS", urun: "Buğday", hedef_kg: 50000, gelen_kg: 50000, sefer: 2, son_teslim: "2026-11-20", termin: null },
  ],
  satislar: [{ no: "IE-K1", musteri: "KURGU YEM", urun: "Kepek", hedef_tur: "kg", hedef_kg: 100000, hedef_arac: null, giden_kg: 50000, sefer: 2 }],
  verim: { sefer: 60, arac_gun: 48, ort_kg: 25000 },
};

test("filoVerisiHazirla: bozuk girdi null, alanlar normallenir", () => {
  assert.equal(filoVerisiHazirla(null), null);
  assert.equal(filoVerisiHazirla({ filo: [] }), null);
  const v = filoVerisiHazirla(HAM)!;
  assert.equal(v.filo.length, 8);
  assert.equal(v.alislar[0].hedefKg, 500000);
  assert.equal(v.satislar[0].hedefKg, 100000);
});

test("gunDagilimi: konteyner > bugday > ic satis > bosta", () => {
  const v = filoVerisiHazirla(HAM)!;
  const d = gunDagilimi(v, "2026-11-23");
  assert.equal(d.konteyner.length, 5);
  assert.deepEqual(d.bugday, ["TEST-07"]);
  assert.deepEqual(d.satis, ["TEST-06"]);
  assert.deepEqual(d.bosta, ["TEST-08"]);
});

test("filoPlaniKur: kullanilmayan arac, gecmis bosta, denklem ve alis bitisi", () => {
  const v = filoVerisiHazirla(HAM)!;
  // plan: Sal 6 konteyner araci, Car 6, Per 5; sonrasi gecmis ortalamasi
  const plan = { gunler: [
    { tarih: "2026-11-24", yukle: 6, al: 0, isler: [], dolumSaat: 0, arac: 6, aracMesaili: 6 },
    { tarih: "2026-11-25", yukle: 6, al: 0, isler: [], dolumSaat: 0, arac: 6, aracMesaili: 6 },
    { tarih: "2026-11-26", yukle: 5, al: 0, isler: [], dolumSaat: 0, arac: 5, aracMesaili: 5 },
  ] };
  const p = filoPlaniKur(v, plan, PZT_CMT);
  assert.deepEqual(p.kullanilmayan.map((k) => k.plaka), ["TEST-08"]);
  assert.equal(p.kullanilmayan[0].sonIs, "2026-11-09");
  assert.equal(p.seferAracGun, 1.25);
  assert.equal(p.seferKg, 25000);
  // gecmis 14 is gunu: 6 gun veri; her gun 07 bosta (08 kullanilmayan sayilmaz) + veri olmayan 8 gunde 7 arac bosta
  assert.equal(p.gecmis.gunSayisi, 14);
  assert.equal(p.gecmis.bugdayAracGun, 6);
  assert.equal(p.gecmis.bostaAracGun, 6 * 1 + 8 * 7);
  // satis: kalan 50 t / 25 t = 2 sefer, once
  assert.equal(p.satisKalanSefer, 2);
  const sal = p.gunler[0];
  assert.equal(sal.tarih, "2026-11-24");
  // aktif filo 7: 6 konteyner -> 1 bos; 1 x 1,25 = 1 satis seferi -> bugdaya 0
  assert.deepEqual([sal.konteynerArac, sal.satisArac, sal.bugdayArac], [6, 1, 0]);
  const per = p.gunler[2];
  assert.equal(per.konteynerArac, 5);
  assert.equal(per.bugdayArac, 2);
  assert.equal(per.bugdaySefer, 2.5);
  // plan penceresi sonrasi tahmini (gecmis ortalamasi)
  assert.equal(p.gunler[3].tahmini, true);
  // tek acik alis (AS-K2 tamamlanmis): 400 t kalan, termin gecti, terminini kacirir, bir gun bulunur
  assert.equal(p.alislar.length, 1);
  assert.equal(p.alislar[0].kalanKg, 400000);
  assert.equal(p.alislar[0].kalanSefer, 16);
  assert.equal(p.alislar[0].terminGecti, true);
  assert.equal(p.alislar[0].terminiKacirir, true);
  assert.ok(p.alislar[0].bitis && p.alislar[0].bitis > "2026-11-26");
  assert.equal(p.tumBitis, p.alislar[0].bitis);
});

test("filoPlaniKur: gecmis az ise varsayilan verim", () => {
  const v = filoVerisiHazirla({ ...HAM, verim: { sefer: 3, arac_gun: 2, ort_kg: 30000 } })!;
  const p = filoPlaniKur(v, { gunler: [] }, PZT_CMT);
  assert.equal(p.seferAracGun, VARSAYILAN_SEFER_ARAC_GUN);
  assert.equal(p.seferKg, 25000);
});

test("24.11 duzeltme: gelecek gunlerde konteyner araci en az gecmis ortalamasi; kantardaki arac bosta sayilmaz", () => {
  const v = filoVerisiHazirla({ ...HAM, kantarda: ["TEST-07"] })!;
  // plan yalniz Sal; sonraki gunler planda bos -> ortalama (2) kullanilir, "0 konteyner" sayilmaz
  const p = filoPlaniKur(v, { gunler: [{ tarih: "2026-11-24", yukle: 6, al: 0, isler: [], dolumSaat: 0, arac: 6, aracMesaili: 6 }] }, PZT_CMT);
  assert.equal(p.gunler[0].konteynerArac, 6);
  assert.equal(p.gunler[0].tahmini, false);
  assert.equal(p.gunler[1].konteynerArac, p.gecmis.ortKonteynerArac);
  assert.equal(p.gunler[1].tahmini, true);
  // bugun: TEST-07 bugun bugday yaptigi icin bugday'da kalir; kantarda listesi yalniz bos araci etkiler
  const v2 = filoVerisiHazirla({ ...HAM, gunler: HAM.gunler.filter((g) => !(g.gun === "2026-11-23" && g.plaka === "TEST-07")), kantarda: ["TEST-07"] })!;
  const d = gunDagilimi(v2, "2026-11-23", v2.kantarda);
  assert.deepEqual(d.kantarda, ["TEST-07"]);
  assert.ok(!d.bosta.includes("TEST-07"));
});

test("sabah plani: ayni musterinin iki booking'i tek satir", () => {
  const ikiBooking = [
    is("K1", { etiket: "KURGU MUSTERI", toplam: 5, takipli: false, beyanTarihi: "2026-11-26", beyanZaman: "2026-11-26T12:00", talimatTarihi: "2026-11-26", ekipmanTarihi: "2026-11-23" }),
    is("K2", { etiket: "KURGU MUSTERI", toplam: 5, takipli: false, beyanTarihi: "2026-11-26", beyanZaman: "2026-11-26T12:00", talimatTarihi: "2026-11-26", ekipmanTarihi: "2026-11-23" }),
  ];
  const k = sabahKarsilastirmasi(ikiBooking, KAP, "2026-11-23")!;
  assert.equal(k.satirlar.length, 1);
  assert.equal(k.satirlar[0].etiket, "KURGU MUSTERI");
  assert.equal(k.satirlar[0].plan, k.sabahHedef);
  assert.equal(k.satirlar[0].neden, "takipsiz");
});
