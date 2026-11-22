/**
 * Ana Panel gunluk yukleme hedefi (23.11.2026): kapasite, is gunleri, gereken hiz, EDF plani, bos alim, gecikme.
 * Veriler KURGUSALDIR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingIsi, cuvalKgOku, dolumSaati, dosyaIsi, gunEtiketi, kapasiteHesapla, oncekiIsGunu, sertSonGun, sonrakiIsGunu, yuklemePlaniKur,
  type Kapasite, type YuklemeIsi,
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
  assert.deepEqual(p.ozetler.A, { bugunYukle: 2, bugunAl: 1, hedefGun: "2026-11-23", alimSonGun: "2026-11-23", gecikme: false, sonGun: "2026-11-23", ardiyeRiski: false, alimSonSaat: null });
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
  // Hiz 1/gun: bugunun payi (1) zaten yuklendi; kalan 1 hedef gunu Sal 24.11'e
  assert.equal(p.bugunHedef, 1);
  assert.deepEqual(p.gunler.map((g) => [g.tarih, g.yukle]), [["2026-11-24", 1]]);
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

test("gun icinde yukledikce bugunun hedefi SABIT kalir, kalan azalir (yeniden hesapta hedef buyumez)", () => {
  const sabah = yuklemePlaniKur(HAFTA, KAP, "2026-11-23");
  assert.equal(sabah.bugunHedef, 6);
  // Ogleden sonra: A 2, B 1, C 1, D'den 2 yuklendi (D dosyasi acilmis gibi takipli)
  const ogle = yuklemePlaniKur(HAFTA.map((x) => {
    if (x.anahtar === "A") return { ...x, alinan: 2, dolu: 2, bugunDolu: 2 };
    if (x.anahtar === "B") return { ...x, dolu: 2, bugunDolu: 1 };
    if (x.anahtar === "C") return { ...x, dolu: 2, bugunDolu: 1 };
    if (x.anahtar === "D") return { ...x, alinan: 2, dolu: 2, bugunDolu: 2, takipli: true };
    return x;
  }), KAP, "2026-11-23");
  assert.equal(ogle.bugunYuklenen, 6);
  assert.equal(ogle.bugunHedef, 6, "6/6 - hedef buyumedi");
  assert.equal(ogle.gerekenHiz, 6);
  assert.deepEqual(ogle.gunler.map((g) => [g.tarih, g.yukle]), [["2026-11-24", 6], ["2026-11-25", 6], ["2026-11-26", 5]]);
  // Fazla yukleme: bugun 8 -> sonraki gunlerin yuku azalir
  const fazla = yuklemePlaniKur(HAFTA.map((x) => (x.anahtar === "D" ? { ...x, alinan: 4, dolu: 4, bugunDolu: 4, takipli: true } : x.anahtar === "A" ? { ...x, alinan: 2, dolu: 2, bugunDolu: 2 } : x.anahtar === "B" ? { ...x, dolu: 2, bugunDolu: 1 } : x.anahtar === "C" ? { ...x, dolu: 2, bugunDolu: 1 } : x)), KAP, "2026-11-23");
  assert.equal(fazla.bugunYuklenen, 8);
  assert.equal(fazla.bugunHedef, 8);
  assert.equal(fazla.gunler.reduce((t, g) => t + g.yukle, 0), 15);
});

// ---------------------------------------------------------------- 23.11.2026 gece: saat bazli son gun, cuval, ardiye, en az
test("cuval ve dolum: 50 kg 1,5 sa; 25 kg (ya da karisik / bilinmiyor) 3,5 sa", () => {
  assert.equal(cuvalKgOku("50 KG"), 50);
  assert.equal(cuvalKgOku("PP BAG", "2.000 PIECES OF 25 KG PP BAGS"), 25);
  assert.equal(cuvalKgOku("1*20DC 25KG PP + 1*20DC50KG PP"), 25, "karisikta yavas olan");
  assert.equal(cuvalKgOku("PP BAG"), null);
  assert.equal(dolumSaati(50), 1.5);
  assert.equal(dolumSaati(null), 3.5);
});

test("sert son gun: beyanname saati - 3 sa yol/kapi - dolum >= 07:00 ise ayni gun, degilse onceki is gunu", () => {
  assert.equal(sertSonGun("2026-11-24", "2026-11-24T10:00", 25, PZT_CMT), "2026-11-23", "10:00 - 3 - 3,5 = 03:30");
  assert.equal(sertSonGun("2026-11-24", "2026-11-24T14:00", 25, PZT_CMT), "2026-11-24", "14:00 - 6,5 = 07:30");
  assert.equal(sertSonGun("2026-11-26", "2026-11-26T12:00", 50, PZT_CMT), "2026-11-26", "12:00 - 4,5 = 07:30");
  assert.equal(sertSonGun("2026-11-23", "2026-11-23T12:00", 25, PZT_CMT), "2026-11-21", "Pzt 05:30 -> Cmt");
  assert.equal(sertSonGun("2026-11-24", null, 25, PZT_CMT), "2026-11-23", "saat yoksa temkinli");
});

// Gercek haftaya benzer (kurgusal adlar): Pzt 23.11
const GERCEK = [
  is("BK", { toplam: 2, alinan: 1, cuvalKg: 25, talimatTarihi: "2026-11-23", talimatZaman: "2026-11-23T15:00", beyanTarihi: "2026-11-24", beyanZaman: "2026-11-24T10:00", ekipmanTarihi: "2026-11-21", ardiyesizTarihi: "2026-11-22" }),
  is("SO", { toplam: 2, alinan: 2, dolu: 1, talimatTamam: true, cuvalKg: 25, beyanTarihi: "2026-11-24", beyanZaman: "2026-11-24T14:00" }),
  is("CL", { toplam: 2, alinan: 2, dolu: 1, cuvalKg: 25, talimatTarihi: "2026-11-24", talimatZaman: "2026-11-24T16:00", beyanTarihi: "2026-11-25", beyanZaman: "2026-11-25T10:00" }),
  is("CR", { toplam: 10, takipli: false, cuvalKg: 50, talimatTarihi: "2026-11-26", talimatZaman: "2026-11-26T10:00", beyanTarihi: "2026-11-26", beyanZaman: "2026-11-26T12:00", ekipmanTarihi: "2026-11-23", ardiyesizTarihi: "2026-11-23" }),
  is("AQ", { toplam: 3, cuvalKg: 25, talimatTarihi: "2026-11-27", talimatZaman: "2026-11-27T10:00", beyanTarihi: "2026-11-27", beyanZaman: "2026-11-27T10:00", ekipmanTarihi: "2026-11-21", ardiyesizTarihi: "2026-11-21" }),
  is("BS", { toplam: 6, alinan: 3, cuvalKg: 25, talimatTarihi: "2026-11-26", talimatZaman: "2026-11-26T12:00", beyanTarihi: "2026-11-27", beyanZaman: "2026-11-27T14:00", ekipmanTarihi: "2026-11-20", ardiyesizTarihi: "2026-11-25" }),
];

test("gercek hafta: bugun en az 2 (yalniz BK'nin sert son gunu bugun), onerilen 6; ardiyesiz giristen once yukleme yok", () => {
  const p = yuklemePlaniKur(GERCEK, KAP, "2026-11-23");
  assert.equal(p.bugunEnAz, 2);
  assert.equal(p.bugunHedef, 6);
  assert.equal(p.gerekenHiz, 6);
  assert.deepEqual(p.gunler.map((g) => [g.tarih, g.yukle]), [["2026-11-23", 6], ["2026-11-24", 6], ["2026-11-25", 6], ["2026-11-26", 5]]);
  // BS: ardiyesiz 25.11 -> en erken Sal 24.11 yukleme; Pzt'de BS yok
  assert.equal(p.gunler[0].isler.some((x) => x.anahtar === "BS" && x.yukle > 0), false);
  assert.equal(p.ozetler.SO.sonGun, "2026-11-24", "14:00 beyanname: Sal sabah yetisir");
  assert.equal(p.ozetler.CR.sonGun, "2026-11-26", "50 kg hizli: Per sabah yetisir");
  assert.equal(p.ozetler.BK.alimSonSaat, "15:00");
  assert.equal(p.gunler[0].dolumSaat, 4 * 3.5 + 2 * 1.5);
  assert.deepEqual(p.ardiyeRiskleri, []);
});

test("ardiye riski: ardiyesiz giris sert son gunden sonraysa isaretlenir, plan yine yapilir", () => {
  const p = yuklemePlaniKur([is("AR", { toplam: 2, alinan: 2, talimatTamam: true, cuvalKg: 50, beyanTarihi: "2026-11-25", beyanZaman: "2026-11-25T12:00", ardiyesizTarihi: "2026-11-27" })], KAP, "2026-11-23");
  assert.deepEqual(p.ardiyeRiskleri, ["AR"]);
  assert.equal(p.gunler.reduce((t, g) => t + g.yukle, 0), 2);
});
