/**
 * Mense Sahadetnamesi (COO) + Phytosanitary: esya taniminda yalniz resmi mal adi (16.11.2026).
 * Kullanici: COO'da "sadece WHEAT FLOUR", Phyto'da "sadece WHEAT FLOUR /Triticum sp." yazmali (ticari ad,
 * kullanim amaci, spesifikasyon ve marka yok). Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCertificateOfOriginHtml } from "@/lib/certificate-of-origin-builder";
import { buildPhytosanitaryCertificateHtml } from "@/lib/phytosanitary-certificate-builder";
import { resmiMalAdiEn } from "@/lib/konsimento/talimat";

const URUN = "WHEAT FLOUR FOR BISCUIT (Moisture Max. 14,0%, Protein: Min. 11,0%), WHEAT FLOUR FOR WAFER (Moisture Max. 14,0%, Alveo: Min)";
const dosya = {
  dosya_no: "IHR-TEST-0001", urun_tanimi: URUN, ham_veri: {}, consignee: "ORNEK ALICI LTD", alici_firma: "ORNEK ALICI LTD", alici_adresi: "ORNEK SEHIR",
  detayli_ambalaj: "2.000 PIECES OF 25 KG PP BAGS", ambalaj: null, lot_no: "LOTTEST1", yuklenme_limani: "ASYAPORT", varis_limani: "ORNEKPORT",
} as any;
const rez = [{ booking_no: "BKGTEST1", gemi_adi: "ORNEK GEMI", sefer_no: "12E", yuklenme_limani: "ASYAPORT" }] as any;
const kont = [{ konteyner_no: "TSTU1000003", net_agirlik_kg: 25000, brut_agirlik_kg: 25050 }, { konteyner_no: "TSTU1000019", net_agirlik_kg: 25000, brut_agirlik_kg: 25050 }] as any;
const esya = (html: string) => (html.match(/id="f-item">([^\n<]*)/)?.[1] || "").trim();

test("resmi mal adi: varsayilan WHEAT FLOUR; konsimento talimatindaki mal adi dosyaya ozel degistirilebilir", () => {
  assert.equal(resmiMalAdiEn({}), "WHEAT FLOUR");
  assert.equal(resmiMalAdiEn(null), "WHEAT FLOUR");
  assert.equal(resmiMalAdiEn({ konsimento_talimati: { mal_en: "durum wheat semolina" } }), "DURUM WHEAT SEMOLINA");
});

test("COO: yalniz WHEAT FLOUR (urun tanimi / spesifikasyon yok)", () => {
  const html = buildCertificateOfOriginHtml(dosya, rez, kont);
  assert.equal(esya(html), "WHEAT FLOUR");
  assert.ok(!html.includes("FOR BISCUIT") && !html.includes("Moisture"));
});

test("Phyto: yalniz WHEAT FLOUR /Triticum sp.", () => {
  const html = buildPhytosanitaryCertificateHtml(dosya, rez, kont);
  assert.equal(esya(html), "WHEAT FLOUR /Triticum sp.");
  assert.ok(!html.includes("FOR WAFER") && !html.includes("Moisture"));
});
