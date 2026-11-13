/**
 * limanAnahtari (lib/liman-anahtari.ts). Ders (01.10.2026): ayni liman farkli yazimlarla kaydediliyordu; analiz
 * listeleri boluyordu. Anahtar yalniz gruplama / gosterim icindir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { limanAnahtari, sadelestir } from "@/lib/liman-anahtari";

test("ayni limanin farkli yazimlari tek anahtar", () => {
  const yazimlar = [
    "DJIBOUTI PORT, DJIBOUTI", "Djibouti Port, Djibouti", "DJIBOUTI PORT DJIBOUTI",
    "Djibouti Port, Republic of Djibouti", "DJIBOUTI PORT", "Cibuti",
  ];
  for (const y of yazimlar) assert.equal(limanAnahtari(y), "DJIBOUTI", y);
});

test("Turkce yazim Ingilizceye: SINGAPUR -> SINGAPORE", () => {
  assert.equal(limanAnahtari("SİNGAPUR"), "SINGAPORE");
  assert.equal(limanAnahtari("Singapore Port, Singapore"), "SINGAPORE");
});

test("Turkce karakterler sadelestirilir", () => {
  assert.equal(sadelestir("İzmir Limanı"), "IZMIR LIMANI");
  assert.equal(sadelestir("çğöşü"), "CGOSU");
  assert.equal(limanAnahtari("Mersin Limanı"), "MERSIN");
});

test("bos deger null", () => {
  assert.equal(limanAnahtari(""), null);
  assert.equal(limanAnahtari("   "), null);
  assert.equal(limanAnahtari(null), null);
});
