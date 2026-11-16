/**
 * Kontrol Merkezi tablolari (16.11.2026) - lib/analiz-tablolar.ts. Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { acenteFiltrele, limanPerformansi, limanSirala, navlunNotu, type AcenteOzeti } from "@/lib/analiz-tablolar";

const lt = (tutar: number, konteyner: number, adet: number, mts: number, teslim: string[] = ["CIF"]) =>
  ({ tutar, konteyner, adet, mts, yazimlar: new Set(["x"]), teslim: new Set(teslim) });

test("liman performansi: pay, birim fiyat, transit birlesir", () => {
  const s = limanPerformansi(
    { ORNEKA: lt(100000, 30, 3, 200, ["CIF", "CFR"]), ORNEKB: lt(50000, 10, 1, 0), ORNEKC: lt(0, 0, 1, 25) },
    { ORNEKA: { toplam: 90, adet: 3, enAz: 25, enCok: 35 } },
  );
  const a = s.find((x) => x.liman === "ORNEKA")!;
  assert.equal(a.pay, 0.75);
  assert.equal(a.birimFiyat, 500);
  assert.deepEqual(a.teslim, ["CFR", "CIF"]);
  assert.deepEqual(a.transit, { ortalama: 30, enAz: 25, enCok: 35, adet: 3 });
  assert.equal(s.find((x) => x.liman === "ORNEKB")!.birimFiyat, null, "miktar yoksa birim fiyat yok");
  assert.equal(s.find((x) => x.liman === "ORNEKC")!.transit, null);
  assert.deepEqual(limanPerformansi({}, {}), []);
});

test("siralama: bos degerler her iki yonde en altta", () => {
  const s = limanPerformansi(
    { A: lt(100, 5, 1, 1), B: lt(300, 20, 2, 1), C: lt(200, 10, 1, 0) },
    { A: { toplam: 40, adet: 1, enAz: 40, enCok: 40 }, B: { toplam: 20, adet: 1, enAz: 20, enCok: 20 } },
  );
  assert.deepEqual(limanSirala(s, "konteyner", false).map((x) => x.liman), ["B", "C", "A"]);
  assert.deepEqual(limanSirala(s, "birimFiyat", true).map((x) => x.liman), ["A", "B", "C"]);
  assert.deepEqual(limanSirala(s, "birimFiyat", false).map((x) => x.liman), ["B", "A", "C"]);
  assert.deepEqual(limanSirala(s, "transit", false).map((x) => x.liman), ["A", "B", "C"]);
  assert.deepEqual(limanSirala(s, "liman", true).map((x) => x.liman), ["A", "B", "C"]);
});

const ln = (liman: string, son: number | null, ek: Partial<Parameters<typeof navlunNotu>[0]> = {}) => ({
  liman, paraBirimi: "USD", son, sonDosyaNo: "IHR-1", enAz: son, enCok: son, ortalama: son, lokalSon: null, konteyner: 4, dosya: 1, navlunsuz: 0, aliciOder: false, ...ek,
});
const acenteler: AcenteOzeti[] = [
  { ad: "ORNEK HAT", konteyner: 30, pay: 0.6, rezervasyon: 5, limanlar: [ln("DAR ES SALAAM", 1780), ln("ORNEKPORT", 900)] },
  { ad: "IKINCI HAT", konteyner: 20, pay: 0.4, rezervasyon: 2, limanlar: [ln("ORNEKPORT", 950)] },
];

test("acente filtresi + liman aramasi (Turkce harf duyarsiz), baslik toplamlari degismez", () => {
  assert.equal(acenteFiltrele(acenteler, "", "").length, 2);
  assert.deepEqual(acenteFiltrele(acenteler, "IKINCI HAT", "").map((a) => a.ad), ["IKINCI HAT"]);
  const r = acenteFiltrele(acenteler, "", "dar es");
  assert.deepEqual(r.map((a) => a.ad), ["ORNEK HAT"]);
  assert.equal(r[0].limanlar.length, 1);
  assert.equal(r[0].konteyner, 30);
  assert.equal(acenteFiltrele(acenteler, "", "ornekport").length, 2);
  assert.equal(acenteFiltrele(acenteler, "", "yokport").length, 0);
});

test("navlun notu", () => {
  assert.equal(navlunNotu(ln("A", null, { aliciOder: true, navlunsuz: 1 })), "Navlun alıcıya ait (FOB)");
  assert.equal(navlunNotu(ln("A", null, { navlunsuz: 1 })), "Navlun girilmemiş");
  assert.equal(navlunNotu(ln("A", 1000, { navlunsuz: 2 })), "2 dosyada navlun yok");
  assert.equal(navlunNotu(ln("A", 1000)), "");
});
