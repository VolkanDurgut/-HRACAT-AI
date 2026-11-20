import { test } from "node:test";
import assert from "node:assert/strict";
import { beyannameKarsilastir, grupBeklenenBirlestir, type BeyannameBeklenen, type BeyannameOkunan } from "@/lib/beyanname-kontrol";

// Kurgusal veri (repo herkese acik)
const bos: BeyannameBeklenen = {
  faturaNolari: [], faturaTarihi: null, toplamTutar: null, paraBirimi: null, teslimSekli: null, varisLimani: null, aliciFirma: null,
  gemiler: [], konteynerler: [], netKg: null, diibler: [],
};
const dosya = (konts: string[], tutar: number, net: number, para = "USD"): BeyannameBeklenen => ({
  ...bos, faturaNolari: ["ORN2026000000770"], toplamTutar: tutar, paraBirimi: para, gemiler: ["ORNEK STAR"], konteynerler: konts, netKg: net,
  diibler: [{ anahtar: "2026-D1-1", belgeNo: "2026 D1 1" }],
});
const okunan = (p: Partial<BeyannameOkunan>): BeyannameOkunan => ({
  beyannameNo: "26ORN1", faturalar: [], faturaTarihi: null, toplamBedel: null, doviz: null, konteynerler: [], konteynerAdaylari: [],
  kalemNet: null, kalemKonteyner: null, devamToplamNet: null, devamVar: false, diibler: [], gemi: null, incoterm: null, bulunduguYer: null, metin: "", ...p,
} as BeyannameOkunan);

test("grup beklenen: tutar, konteyner, net, gemi, DIIB toplanir; tekrar edenler bir kez", () => {
  const g = grupBeklenenBirlestir(dosya(["AAAU1111111"], 46125, 75000), [dosya(["BBBU2222222", "CCCU3333333"], 30750, 50000), dosya(["DDDU4444444"], 15375, 25000)]);
  assert.equal(g.toplamTutar, 92250);
  assert.deepEqual(g.konteynerler, ["AAAU1111111", "BBBU2222222", "CCCU3333333", "DDDU4444444"]);
  assert.equal(g.netKg, 150000);
  assert.deepEqual(g.gemiler, ["ORNEK STAR"]);
  assert.equal(g.diibler.length, 1);
  assert.deepEqual(g.faturaNolari, ["ORN2026000000770"]);
  assert.equal(g.grupDosyaSayisi, 3);
});

test("grup beklenen: farkli para birimi ya da eksik net -> o alan karsilastirilmaz; tek dosya aynen", () => {
  const g = grupBeklenenBirlestir(dosya(["AAAU1111111"], 100, 1), [dosya(["BBBU2222222"], 200, 2, "EUR")]);
  assert.equal(g.toplamTutar, null);
  const g2 = grupBeklenenBirlestir(dosya(["AAAU1111111"], 100, 1), [{ ...dosya(["BBBU2222222"], 200, 2), netKg: null }]);
  assert.equal(g2.netKg, null);
  const tek = dosya(["AAAU1111111"], 100, 1);
  assert.equal(grupBeklenenBirlestir(tek, []), tek);
});

test("karsilastir: grup toplamiyla uyumlu + bilgi satiri; gemi sefer kodu; bulunamayan ulke bilgi", () => {
  const b = grupBeklenenBirlestir(dosya(["AAAU1111111"], 46125, 75000), [dosya(["BBBU2222222"], 30750, 50000)]);
  const r = beyannameKarsilastir(okunan({ toplamBedel: 76875, doviz: "USD", konteynerler: ["AAAU1111111", "BBBU2222222"], devamToplamNet: 125000, gemi: "ORNEK STAR BSM" }),
    { ...b, varisLimani: "MUTSAMUDU PORT" });
  const k = Object.fromEntries(r.kontroller.map((x) => [x.alan, x]));
  assert.equal(k["Birleşik fatura"].durum, "bilgi");
  assert.equal(k["Toplam fatura bedeli"].durum, "uyumlu");
  assert.equal(k["Konteynerler"].durum, "uyumlu");
  assert.equal(k["Net ağırlık (toplam)"].durum, "uyumlu");
  assert.equal(k["Gemi"].durum, "uyumlu");
  if (k["Gideceği ülke"]) assert.equal(k["Gideceği ülke"].durum, "bilgi");
  assert.equal(r.grup_dosya_sayisi, 2);
  assert.equal(r.uyumlu, true);
});

test("karsilastir: gercek farklar yine uyusmuyor; tek dosyada grup bilgisi yok", () => {
  const r = beyannameKarsilastir(okunan({ toplamBedel: 199875, doviz: "USD", konteynerler: ["AAAU1111111", "XXXU9999999"], gemi: "BASKA GEMI" }), dosya(["AAAU1111111"], 46125, 75000));
  const k = Object.fromEntries(r.kontroller.map((x) => [x.alan, x]));
  assert.equal(k["Toplam fatura bedeli"].durum, "uyusmuyor");
  assert.equal(k["Konteynerler"].durum, "uyusmuyor");
  assert.equal(k["Gemi"].durum, "uyusmuyor");
  assert.equal(k["Birleşik fatura"], undefined);
  assert.equal(r.grup_dosya_sayisi, undefined);
  assert.equal(r.uyumlu, false);
});
