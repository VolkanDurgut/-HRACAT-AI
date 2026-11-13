/**
 * Cut-off saatleri (lib/cutoff-utils.ts). Ders: talimat_cutoff / beyanname_cutoff veritabaninda "+00" etiketli ama
 * deger TURKIYE yerel saatidir. new Date(...) ile okumak 3 saat kaydiriyordu (16:00 -> 19:00; 22:00 -> ertesi gun).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  beyannameCutoffTamamMi, cutoffKalanMs, cutoffZamanMs, formatCutoffSaat, formatCutoffTarih, formatKalanSure,
  talimatCutoffTamamMi, TURKIYE_UTC_OFSET_MS,
} from "@/lib/cutoff-utils";

test("saat metinden ham okunur (16:00 girilen 19:00 gorunmez)", () => {
  assert.equal(formatCutoffSaat("2026-10-05T16:00:00+00:00"), "16:00");
  assert.equal(formatCutoffSaat("2026-10-05T16:00:00+00"), "16:00");
  assert.equal(formatCutoffSaat("2026-10-05"), "-");
  assert.equal(formatCutoffSaat(null), "-");
});

test("gec saatteki cut-off ertesi gune kaymaz (05.10 22:00 -> 05.10)", () => {
  assert.equal(formatCutoffTarih("2026-10-05T22:00:00+00:00"), new Date(2026, 9, 5).toLocaleDateString("tr-TR"));
  assert.equal(formatCutoffTarih("2026-10-05T23:59:00+00"), new Date(2026, 9, 5).toLocaleDateString("tr-TR"));
  assert.equal(formatCutoffTarih(null), "-");
});

test("cut-off ani Turkiye saati (UTC+3), bilgisayar saat dilimine bagli degil", () => {
  assert.equal(TURKIYE_UTC_OFSET_MS, 3 * 3600_000);
  assert.equal(cutoffZamanMs("2026-10-05T16:00:00+00:00"), Date.UTC(2026, 9, 5, 13, 0, 0));
  // saat yoksa gun sonu 23:59
  assert.equal(cutoffZamanMs("2026-10-05"), Date.UTC(2026, 9, 5, 20, 59, 0));
  assert.equal(cutoffZamanMs("gecersiz"), null);
  assert.equal(cutoffZamanMs(null), null);
});

test("kalan sure ve bicimi", () => {
  const simdi = Date.UTC(2026, 9, 5, 3, 0, 0); // 06:00 TR
  assert.equal(cutoffKalanMs("2026-10-05T16:00:00+00", simdi), 10 * 3600_000);
  assert.equal(cutoffKalanMs(null, simdi), null);
  assert.equal(formatKalanSure(10 * 3600_000 - 1000), "09:59:59");
  assert.equal(formatKalanSure((4 * 86400 + 3600 + 36 * 60 + 12) * 1000), "4g 01:36:12");
  assert.equal(formatKalanSure(-61_000), "00:01:01");
});

test("tamamlanan cut-off kurallari (talimat: konsimento ya da draft BL; beyanname: beyanname dosyasi)", () => {
  assert.equal(talimatCutoffTamamMi({ konsimento_dosya_url: "x" }), true);
  assert.equal(talimatCutoffTamamMi({ draft_bl_dosya_url: "x" }), true);
  assert.equal(talimatCutoffTamamMi({}), false);
  assert.equal(talimatCutoffTamamMi(null), false);
  assert.equal(beyannameCutoffTamamMi({ beyanname_dosya_url: "x" }), true);
  assert.equal(beyannameCutoffTamamMi({ konsimento_dosya_url: "x" }), false);
});
