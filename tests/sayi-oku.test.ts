/**
 * sayiOku / kalemMiktari (lib/sayi-oku.ts). Ders (03.10.2026): parseFloat("252,45") === 252; virgulden sonrasi sessizce
 * kayboluyordu ve bir siparisin kalani yanlis cikti.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { kalemMiktari, sayiOku } from "@/lib/sayi-oku";

test("virgul ondalik ayirici", () => {
  assert.equal(sayiOku("252,45"), 252.45);
  assert.equal(sayiOku(" 2,9 "), 2.9);
});

test("nokta binlik + virgul ondalik", () => {
  assert.equal(sayiOku("1.250,5"), 1250.5);
  assert.equal(sayiOku("7.178.000,25"), 7178000.25);
});

test("yalniz nokta: eski davranis (ondalik)", () => {
  assert.equal(sayiOku("252.45"), 252.45);
  assert.equal(sayiOku("0.475"), 0.475);
});

test("sayi, bos ve gecersiz", () => {
  assert.equal(sayiOku(12.5), 12.5);
  assert.equal(sayiOku(Number.NaN), 0);
  assert.equal(sayiOku(Number.POSITIVE_INFINITY), 0);
  assert.equal(sayiOku(null), 0);
  assert.equal(sayiOku(undefined), 0);
  assert.equal(sayiOku(""), 0);
  assert.equal(sayiOku("abc"), 0);
});

test("kalem miktari: miktar_mts, yoksa eski quantity", () => {
  assert.equal(kalemMiktari({ miktar_mts: "252,45" }), 252.45);
  assert.equal(kalemMiktari({ quantity: "100" }), 100);
  assert.equal(kalemMiktari({ miktar_mts: 0, quantity: 5 }), 5);
  assert.equal(kalemMiktari(null), 0);
});
