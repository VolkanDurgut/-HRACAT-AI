/**
 * Belgelerde marka uyumu (16.11.2026, IHR-2026-0113 vakasi): urun aciklamasindaki eski "(X BRAND)" dosyanin tek
 * gercek markasina uyarlanir. Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gercekMarkalar, markayaUyarla } from "@/lib/urun-tanimi";
import { buildCommercialInvoiceHtml } from "@/lib/invoice-builder";
import { buildPackingListHtml } from "@/lib/packing-list-builder";

test("gercek markalar: konteyner markalari once; yoksa dosya.marka bolunur; cuval notu ve BRAND atilir", () => {
  assert.deepEqual(gercekMarkalar("ORNEKA BRAND", ["ORNEKB", "ornekb", null]), ["ORNEKB"]);
  assert.deepEqual(gercekMarkalar("ORNEKA & ORNEKB BRAND", []), ["ORNEKA", "ORNEKB"]);
  assert.deepEqual(gercekMarkalar(null, ["ORNEKA", "ORNEKA (KRAFT)"]), ["ORNEKA"]);
});

test("markayaUyarla: tek gercek marka + tek farkli parantez -> degisir; aksi halde dokunulmaz", () => {
  const ac = "PREMIUM QUALITY WHEAT FLOUR (ESKIMARKA BRAND)";
  assert.equal(markayaUyarla(ac, ["YENIMARKA"]), "PREMIUM QUALITY WHEAT FLOUR (YENIMARKA BRAND)");
  assert.equal(markayaUyarla("6.000 PIECES OF 25 KG PP BAGS (ESKIMARKA BRAND)", ["YENIMARKA"]), "6.000 PIECES OF 25 KG PP BAGS (YENIMARKA BRAND)");
  assert.equal(markayaUyarla("ALL PURPOSE WHEAT FLOUR(ORNEKA BRAND)", ["orneka"]), "ALL PURPOSE WHEAT FLOUR(ORNEKA BRAND)", "ayni marka");
  assert.equal(markayaUyarla("FLOUR (DİVA BRAND)", ["DIVA"]), "FLOUR (DİVA BRAND)", "Turkce harf farki ayni");
  assert.equal(markayaUyarla("FLOUR (ORNEKA BRAND)", ["ORNEKA (KRAFT)"]), "FLOUR (ORNEKA BRAND)", "cuval notu ayni marka");
  assert.equal(markayaUyarla(ac, ["ORNEKA", "ORNEKB"]), ac, "birden fazla gercek marka: belirsiz");
  assert.equal(markayaUyarla("A (ORNEKA BRAND), B (ORNEKB BRAND)", ["ORNEKC"]), "A (ORNEKA BRAND), B (ORNEKB BRAND)", "metinde iki marka: belirsiz");
  assert.equal(markayaUyarla("WHEAT FLOUR FOR BISCUIT (Moisture Max. 14%)", ["ORNEKA"]), "WHEAT FLOUR FOR BISCUIT (Moisture Max. 14%)", "marka parantezi yok");
  assert.equal(markayaUyarla(null, ["ORNEKA"]), null);
});

const dosya = {
  dosya_no: "IHR-TEST-0002", proforma_no: "PRTEST", urun_tanimi: "PREMIUM QUALITY WHEAT FLOUR (ESKIMARKA BRAND)", marka: "YENIMARKA BRAND",
  ham_veri: { urun_detaylari: [{ description: "PREMIUM QUALITY WHEAT FLOUR (ESKIMARKA BRAND)", quantity: 50, unit_price: 400, total_amount: 20000, packaging_size: "25 KG" }] },
  urun_detaylari: [{ description: "PREMIUM QUALITY WHEAT FLOUR (ESKIMARKA BRAND)", quantity: 50, unit_price: 400, total_amount: 20000, packaging_size: "25 KG" }],
  detayli_ambalaj: "2.000 PIECES OF 25 KG PP BAGS (ESKIMARKA BRAND)", ambalaj: "25 KG PP BAGS", para_birimi: "USD", teslim_sekli: "CIF",
  consignee: "ORNEK ALICI", alici_firma: "ORNEK ALICI", alici_adresi: "ORNEK SEHIR", varis_limani: "ORNEKPORT", yuklenme_limani: "MARPORT",
} as any;
const rez = [{ booking_no: "BKGTEST2", gemi_adi: "ORNEK GEMI", sefer_no: "1E", konteyner_adedi: 2 }] as any;
const kont = ["TSTU1000003", "TSTU1000019"].map((n) => ({ konteyner_no: n, muhur_no: "S1", marka: "YENIMARKA", pieces: 1000, net_agirlik_kg: 25000, brut_agirlik_kg: 25050 })) as any;

test("invoice + packing list: eski marka hic gecmez, gercek marka gecer", () => {
  for (const html of [buildCommercialInvoiceHtml(dosya, rez, kont), buildPackingListHtml(dosya, rez, kont)]) {
    assert.ok(!html.includes("ESKIMARKA"), "eski marka belgede kaldi");
    assert.ok(html.includes("PREMIUM QUALITY WHEAT FLOUR (YENIMARKA BRAND)"));
    assert.ok(html.includes("PP BAGS (YENIMARKA BRAND)"));
  }
});
