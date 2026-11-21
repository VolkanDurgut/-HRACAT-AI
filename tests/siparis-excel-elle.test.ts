/**
 * Siparis listesi Excel aktarimi - 21.11.2026 elle guncellenen duzen + "sistem esastır" korumalari.
 * Veriler KURGUSALDIR (gercek musteri / booking yok).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { siparisOnizleme, siparisSayfasiniCoz, type SiparisMevcut } from "@/lib/siparis/siparis-excel";
import type { HamSayfa } from "@/lib/siparis/xlsx-oku";

const YESIL = "00B050";
const B = ["Proforma", "Firma Adı", "Ürün", "Fiyat", "Miktar", "Tutar", "Konteyner", "Liman", "BL NO", "Marka", "Paketleme", null, "Ön Ödeme ", "Bakiye", "Release"];
const satir = (p: string, f: string, m: number, k: number, bl: string | null, oo: "TRUE" | "FALSE") =>
  [p, f, "UN", 400, m, m * 400, k, "Liman", bl, "M", "25 KG PP", null, oo, "FALSE", "FALSE"];

const sayfa: HamSayfa = {
  ad: "Sipariş Listesi",
  satirlar: [
    [1, B, null],
    [2, satir("DEMOAAA010126", "ALFA", 50, 2, "BKG001", "TRUE"), YESIL],
    [3, ["47.HAFTA (15 KASIM  - 21 KASIM)"], null],
    [4, satir("DEMOBBB020226", "BETA", 50, 2, "BKG002", "TRUE"), "FFFF00"],
    [5, ["YÜKLEMESİ PLANLANACAK SİPARİŞLER"], null],
    [6, satir("DEMOCCC030326", "GAMA", 25, 1, null, "TRUE"), null],
    [7, ["PEŞİNAT BEKLENEN SİPARİŞLER"], null],
    [8, satir("DEMODDD040426", "DELTA", 25, 1, null, "FALSE"), null],
    [9, satir("DEMOEEE050526", "EPSILON", 25, 1, null, "TRUE"), null],
  ],
};

test("elle güncellenen düzen: hafta / bölüm başlıkları ve Ön Ödeme sütunu", () => {
  const s = siparisSayfasiniCoz([sayfa]);
  assert.deepEqual(s.uyarilar, [], "hafta başlığı 'firma yok' uyarısı vermez");
  assert.deepEqual(s.satirlar.map((x) => [x.proforma_no, x.durum]), [
    ["DEMOAAA010126", "sevk_edildi"],
    ["DEMOBBB020226", "rezervasyonlu"],
    ["DEMOCCC030326", "on_odeme_alindi"],
    ["DEMODDD040426", "onay_bekliyor"],
    ["DEMOEEE050526", "on_odeme_alindi"], // Ön Ödeme sütunu bölümden önce gelir
  ]);
});

const mevcut = (id: string, p: string, ek: Partial<SiparisMevcut> = {}): SiparisMevcut => ({
  id, sira: 1, proforma_no: p, proforma_tarihi: null, firma: "F", urun: "UN", birim_fiyat: 400, miktar_mt: 50, tutar: 20000,
  konteyner: 2, liman: "Liman", bl_no: null, marka: "M", paketleme: "25 KG PP", durum: "rezervasyonlu", ...ek,
});
const excelSatiri = (p: string, ek: Record<string, unknown> = {}) => ({
  sira: 1, satir: 2, proforma_no: p, proforma_tarihi: null, firma: "F", urun: "UN", birim_fiyat: 400, miktar_mt: 50, tutar: 20000,
  konteyner: 2, liman: "Liman", bl_no: null as string | null, marka: "M", paketleme: "25 KG PP", durum: "rezervasyonlu" as const, ...ek,
});

test("sistem esas: dosyası olan satırda booking'le çelişen BL değiştirilmez", () => {
  const m = [mevcut("a", "DEMOEMT160926-4", { bl_no: "BKG-A" }), mevcut("b", "DEMOEMT300926", { bl_no: "BKG-B" })];
  const ex = [excelSatiri("DEMOEMT160926-4R", { bl_no: "BKG-B", durum: "sevk_edildi" }), excelSatiri("DEMOEMT300926R", { bl_no: "BKG-A", satir: 3, durum: "sevk_edildi" })];
  const o = siparisOnizleme(ex as never, m, { dosyalar: new Map([["a", { dosya_no: "IHR-1", booking: "BKG-A" }], ["b", { dosya_no: "IHR-2", booking: "BKG-B" }]]) });
  assert.equal(o.blKorunan.length, 2);
  assert.deepEqual(o.degisen.map((d) => d.degisiklikler.map((x) => x.alan)), [["Durum"], ["Durum"]], "yalnız durum; BL ve proforma no değişmez");
  assert.equal(o.gonderilecek.length, 2);
  for (const g of o.gonderilecek) assert.equal(g.bl_no, null);
  // revize eki farkı proforma no'yu değiştirmez (ön ödeme kaydı eski anahtarda)
  for (const g of o.gonderilecek) assert.ok(!g.proforma_no.endsWith("R"));
});

test("sistem esas: defterde olmayan sistem proforması Excel kopyası olarak eklenmez", () => {
  const o = siparisOnizleme([excelSatiri("DEMOALB161126", { durum: "on_odeme_alindi" }), excelSatiri("DEMOYENI201126", { satir: 3 })] as never, [],
    { proformalar: ["DEMOALB161126"] });
  assert.deepEqual(o.sistemde.map((x) => x.proforma_no), ["DEMOALB161126"]);
  assert.deepEqual(o.yeni.map((x) => x.proforma_no), ["DEMOYENI201126"]);
  assert.equal(o.gonderilecek.length, 1);
});
