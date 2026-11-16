/**
 * Fatura talimati FOB birim fiyati: TON BASINA ESIT DUSUM (16.11.2026).
 * Ekibin elle hesabi (IHR-2026-0115): navlun 1.850 / 25 t = 74, lokal 400 / 25 t = 16 ->
 * 490 - 74 + 16 = 432 FOB, 470 - 74 + 16 = 412 FOB. Toplam FOB 62.800 (eski oransal hesapla ayni).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fobBirimFiyati, hesaplaFobFreightCifToplamlari, tonBasiNetNavlun } from "@/lib/cutoff-utils";
import { faturaBolunmesi } from "@/lib/diib/bolunme-talimat";

const dosya0115 = {
  urun_detaylari: [
    { description: "PREMIUM GRADE WHEAT FLOUR (DEGSAN)", quantity: 50, unit_price: 490, total_amount: 24500 },
    { description: "ALL PURPOSE FLOUR (GOUMANE)", quantity: 100, unit_price: 470, total_amount: 47000 },
  ],
  navlun_tutari: 1850, lokal_masraf_tutari: 400, teslim_sekli: "CIF",
};

test("IHR-2026-0115: 490 -> 432, 470 -> 412 (ekibin elle hesabi), toplam FOB 62.800", () => {
  const { toplamCif, toplamFob } = hesaplaFobFreightCifToplamlari(dosya0115, 6);
  assert.equal(toplamCif, 71500);
  assert.equal(toplamFob, 62800);
  assert.equal(tonBasiNetNavlun(toplamCif, toplamFob, 150), 58);
  const d = fobBirimFiyati(490, toplamCif, toplamFob, 150)!;
  const g = fobBirimFiyati(470, toplamCif, toplamFob, 150)!;
  assert.ok(Math.abs(d - 432) < 1e-9);
  assert.ok(Math.abs(g - 412) < 1e-9);
  // kalemler x miktar = toplam FOB (birebir)
  assert.ok(Math.abs(d * 50 + g * 100 - toplamFob!) < 1e-6);
});

test("25 t'dan az yuklenen konteyner: toplam tonaja bolunur (sabit 25 degil)", () => {
  // 4 konteyner, toplam 96 t (24 t/konteyner): net navlun 4 x 1.450 = 5.800 -> 60,4167 $/t
  const dosya = { urun_detaylari: [{ quantity: 96, unit_price: 500, total_amount: 48000 }], navlun_tutari: 1850, lokal_masraf_tutari: 400, teslim_sekli: "CIF" };
  const { toplamCif, toplamFob } = hesaplaFobFreightCifToplamlari(dosya, 4);
  const f = fobBirimFiyati(500, toplamCif, toplamFob, 96)!;
  assert.ok(Math.abs(f * 96 - toplamFob!) < 1e-6);
  assert.ok(Math.abs(f - (500 - 5800 / 96)) < 1e-9);
});

test("FOB teslim: dusum yok; miktar yoksa eski oransal hesap", () => {
  const fobDosya = { ...dosya0115, teslim_sekli: "FOB" };
  const { toplamCif, toplamFob } = hesaplaFobFreightCifToplamlari(fobDosya, 6);
  assert.equal(toplamFob, toplamCif);
  assert.equal(fobBirimFiyati(490, toplamCif, toplamFob, 150), 490);
  assert.ok(Math.abs(fobBirimFiyati(490, 71500, 62800)! - 490 * 62800 / 71500) < 1e-9);
  assert.equal(fobBirimFiyati(490, 71500, null, 150), null);
});

test("fatura bolunmesi: her faturanin FOB'u kg payina dusen net navlunla, toplam birebir", () => {
  const parcalar = faturaBolunmesi(dosya0115.urun_detaylari, [
    { sira: 1, belgeNo: "A", belgeTarihi: null, kg: 60000, faturaNo: null },
    { sira: 2, belgeNo: "B", belgeTarihi: null, kg: 90000, faturaNo: null },
  ], 62800);
  assert.equal(parcalar.length, 2);
  // 1. fatura: 50.000 kg x 0,490 + 10.000 kg x 0,470 = 29.200 CIF; FOB = 29.200 - 60 t x 58 = 25.720
  assert.equal(parcalar[0].tutar, 29200);
  assert.equal(parcalar[0].fobTutar, 25720);
  assert.equal(parcalar[1].fobTutar, 62800 - 25720);
});
