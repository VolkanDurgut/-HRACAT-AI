/**
 * Ana Panel gunluk yukleme hedefi (23.11.2026): kapasite, is gunleri, gereken hiz, EDF plani, bos alim, gecikme.
 * Veriler KURGUSALDIR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingIsi, dosyaIsi, gunEtiketi, kapasiteHesapla, oncekiIsGunu, sonrakiIsGunu, yuklemePlaniKur, type Kapasite, type YuklemeIsi,
} from "@/lib/panel/gunluk-yukleme";

const PZT_CMT = [1, 2, 3, 4, 5, 6];
const KAP: Kapasite = { gunSayisi: 58, ortalama: 5.6, p75: 7, max: 13, isGunleri: PZT_CMT };
const is = (anahtar: string, ek: Partial<YuklemeIsi>): YuklemeIsi => ({
  anahtar, etiket: anahtar, dosyaNo: null, toplam: 0, alinan: 0, dolu: 0, bugunDolu: 0, talimatTarihi: null, beyanTarihi: null,
  ekipmanTarihi: null, talimatTamam: false, beyanTamam: false, takipli: true, ...ek,
});

// 23.11.2026 Pazartesi
const HAFTA = [
  is("A", { toplam: 2, alinan: 1, talimatTarihi: "2026-11-23", beyanTarihi: "2026-11-24", ekipmanTarihi: "2026-11-21" }),
  is("B", { toplam: 2, alinan: 2, dolu: 1, talimatTamam: true, talimatTarihi: "2026-11-23", beyanTarihi: "2026-11-24" }),
  is("C", { toplam: 2, alinan: 2, dolu: 1, talimatTarihi: "2026-11-24", beyanTarihi: "2026-11-25" }),
  is("D", { toplam: 10, talimatTarihi: "2026-11-26", beyanTarihi: "2026-11-26", ekipmanTarihi: "2026-11-23", takipli: false }),
  is("E", { toplam: 3, talimatTarihi: "2026-11-27", beyanTarihi: "2026-11-27", ekipmanTarihi: "2026-11-21" }),
  is("F", { toplam: 6, alinan: 3, talimatTarihi: "2026-11-26", beyanTarihi: "2026-11-27", ekipmanTarihi: "2026-11-20" }),
];

test("is gunu yardimcilari: Pazar atlanir", () => {
  assert.equal(oncekiIsGunu("2026-11-23", PZT_CMT), "2026-11-21"); // Pzt -> Cmt
  assert.equal(sonrakiIsGunu("2026-11-22", PZT_CMT), "2026-11-23"); // Paz -> Pzt
  assert.equal(gunEtiketi("2026-11-23"), "Pzt 23.11");
});

test("kapasite: gecmis gunlerden ortalama / %75 / en yuksek; hic yukleme olmayan Pazar is gunu sayilmaz", () => {
  const gunler: string[] = [];
  // 3 hafta Pzt-Cmt, her gun 4-8 konteyner
  const baslar = ["2026-11-02", "2026-11-09", "2026-11-16"];
  for (const b of baslar) for (let i = 0; i < 6; i++) {
    const g = new Date(Date.parse(`${b}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
    for (let k = 0; k < 4 + (i % 5); k++) gunler.push(g);
  }
  const k = kapasiteHesapla(gunler);
  assert.equal(k.gunSayisi, 18);
  assert.deepEqual(k.isGunleri, PZT_CMT);
  assert.equal(k.max, 8);
  assert.equal(k.p75, 7);
  assert.equal(kapasiteHesapla([]).gunSayisi, 0);
  assert.deepEqual(kapasiteHesapla(["2026-11-22"]).isGunleri, PZT_CMT, "veri azsa Pzt-Cmt");
});

test("plan: gereken hiz = hedefleri tutturan en dusuk gunluk adet; en yakin hedef once", () => {
  const p = yuklemePlaniKur(HAFTA, KAP, "2026-11-23");
  assert.equal(p.gerekenHiz, 6);
  assert.deepEqual(p.gunler.map((g) => [g.tarih, g.yukle, g.al]), [
    ["2026-11-23", 6, 3], ["2026-11-24", 6, 6], ["2026-11-25", 6, 3], ["2026-11-26", 5, 5],
  ]);
  assert.deepEqual(p.gunler[0].isler.map((x) => [x.anahtar, x.yukle, x.al]), [["D", 2, 2], ["A", 2, 1], ["B", 1, 0], ["C", 1, 0]]);
  assert.equal(p.bugunHedef, 6);
  assert.equal(p.bugunAl, 3);
  assert.equal(p.risk, "normal");
  assert.deepEqual(p.takipsiz, ["D"]);
  assert.deepEqual(p.ozetler.A, { bugunYukle: 2, bugunAl: 1, hedefGun: "2026-11-23", alimSonGun: "2026-11-23", gecikme: false });
  assert.equal(p.ozetler.F.hedefGun, "2026-11-26");
});

test("bugun yuklenenler hedefe eklenir; beyannamesi verilen / tamamlanan plana girmez; cut-off'suz plansiz", () => {
  const p = yuklemePlaniKur([
    is("Y", { toplam: 2, alinan: 2, dolu: 1, bugunDolu: 1, talimatTamam: true, beyanTarihi: "2026-11-25" }),
    is("T", { toplam: 2, alinan: 2, dolu: 2, beyanTarihi: "2026-11-25" }),
    is("V", { toplam: 2, beyanTamam: true, beyanTarihi: "2026-11-25" }),
    is("P", { toplam: 10, takipli: false }),
  ], KAP, "2026-11-23");
  assert.equal(p.bugunYuklenen, 1);
  assert.equal(p.bugunHedef, 2, "1 yuklendi + 1 plan");
  assert.deepEqual(Object.keys(p.ozetler), ["Y"]);
  assert.deepEqual(p.plansiz, ["P"]);
});

test("gecikme: hedef gunu gecmis is bugune alinir ve isaretlenir; Pazar gunu plan Pazartesi'den baslar", () => {
  const p = yuklemePlaniKur([is("G", { toplam: 3, alinan: 3, talimatTamam: true, beyanTarihi: "2026-11-23" })], KAP, "2026-11-23");
  assert.deepEqual(p.gecikenler, ["G"]);
  assert.equal(p.gunler[0].tarih, "2026-11-23");
  assert.equal(p.gunler[0].yukle, 3);
  const pazar = yuklemePlaniKur([is("H", { toplam: 2, alinan: 2, talimatTamam: true, beyanTarihi: "2026-11-25" })], KAP, "2026-11-22");
  assert.equal(pazar.isGunuMu, false);
  assert.equal(pazar.bugunHedef, 0);
  assert.equal(pazar.gunler[0].tarih, "2026-11-23");
});

test("risk: hiz %75'i asarsa yuksek, en yuksek gunu asarsa asiyor; gecmis az ise bilinmiyor", () => {
  const yogun = [is("Z", { toplam: 20, alinan: 20, talimatTamam: true, beyanTarihi: "2026-11-25" })]; // 2 gunde 20 -> 10/gun
  assert.equal(yuklemePlaniKur(yogun, KAP, "2026-11-23").gerekenHiz, 10);
  assert.equal(yuklemePlaniKur(yogun, KAP, "2026-11-23").risk, "yuksek");
  assert.equal(yuklemePlaniKur(yogun, { ...KAP, max: 9 }, "2026-11-23").risk, "asiyor");
  assert.equal(yuklemePlaniKur(yogun, { ...KAP, gunSayisi: 3 }, "2026-11-23").risk, "bilinmiyor");
});

test("ekipman tarihi: bos ekipman gelmeden plan baslamaz; tarih yoksa hedeften en fazla 5 is gunu once", () => {
  const p = yuklemePlaniKur([is("K", { toplam: 2, beyanTarihi: "2026-12-14", talimatTarihi: "2026-12-11", ekipmanTarihi: "2026-12-09" })], KAP, "2026-11-23");
  assert.equal(p.gunler[0].tarih, "2026-12-09");
  const q = yuklemePlaniKur([is("L", { toplam: 2, beyanTarihi: "2026-12-14" })], KAP, "2026-11-23");
  assert.equal(q.gunler[0].tarih, "2026-12-07", "hedef Cmt 12.12; 5 is gunu geriye Pzt 07.12");
});

test("girdiler: dosya ve dosyasi acilmamis booking", () => {
  const d = dosyaIsi({
    id: "x", dosya_no: "IHR-DEMO-1", alici_firma: "DEMO", konsimento_dosya_url: "k",
    rezervasyonlar: [{ konteyner_adedi: 3, talimat_cutoff: "2026-11-26T10:00:00+00:00", beyanname_cutoff: "2026-11-27T12:00:00+00:00", ekipman_alim_tarihi: "2026-11-21" }],
    konteynerler: [{ dba_dosya_url: "a" }, { dba_dosya_url: null }],
  }, 1)!;
  assert.deepEqual([d.toplam, d.alinan, d.dolu, d.bugunDolu, d.talimatTarihi, d.beyanTarihi, d.talimatTamam], [3, 2, 1, 1, "2026-11-26", "2026-11-27", true]);
  assert.equal(dosyaIsi({ id: "y", dosya_no: null, alici_firma: null, rezervasyonlar: [], konteynerler: [] }, 0), null);
  const b = bookingIsi({ anahtar: "excel:1", musteri: "DEMO", konteyner: 5, talimat_cutoff: "2026-11-26T10:00:00+00:00", beyan_cutoff: null, bos_ekipman_tarihi: "2026-11-23" })!;
  assert.deepEqual([b.anahtar, b.toplam, b.takipli, b.talimatTarihi, b.beyanTarihi], ["is:excel:1", 5, false, "2026-11-26", null]);
});
