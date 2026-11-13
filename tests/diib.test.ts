/**
 * DIIB hesabi (lib/diib/hesap.ts -> supabase/functions/_shared/diib-hesap.ts). Excel ile ayni formul ve 04.11.2026
 * derslerini korur (eksik konteynerli "yuklenen", proforma yerine yuklenen miktar, bolunme).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIIB_ORAN, bolunmeOnerisi, diibAlanMetni, diibAnahtari, diibBul, diibMiktari, dosyaKg, kgOku, parcaTutarlari,
  yuklenenHesapla, type DiibBelgesi, type DiibOzeti,
} from "@/lib/diib/hesap";

const belge = (id: string, anahtar: string, sira: number, durum: DiibBelgesi["durum"] = "aktif"): DiibBelgesi => ({
  id, belge_no: anahtar, anahtar, belge_tarihi: "2026-08-19", ithalat_izin_kg: 0, ihracat_taahhut_kg: 0,
  kullanim_sirasi: sira, durum, aciklama: null,
});
const ozet = (b: DiibBelgesi, kalanKg: number) => ({ belge: b, kalanKg }) as unknown as DiibOzeti;

test("taahhut orani Excel ile ayni (97 x 74 / 10000)", () => {
  assert.ok(Math.abs(DIIB_ORAN - 0.7178) < 1e-12);
});

test("kg girisi: Turkce binlik nokta", () => {
  assert.equal(kgOku("170.900"), 170900);
  assert.equal(kgOku("7.178.000,5"), 7178000.5);
  assert.equal(kgOku("0.475"), 0.475); // birim fiyat binlik sayilmaz
  assert.equal(kgOku("250,5"), 250.5);
});

test("DIIB anahtari farkli yazimlardan", () => {
  for (const m of ["2026/D2-04219", "2026 D1-04219", "19.08.2026 TARİH 2026-D2-04219", "DİİB NO: 2026/D2-04219"]) {
    assert.equal(diibAnahtari(m), "2026-04219", m);
  }
  assert.equal(diibAnahtari("D2-04219"), null);
  assert.equal(diibAnahtari(""), null);
});

test("DIIB bulma: yil yoksa yalniz TEK eslesen sira", () => {
  const a = belge("a", "2026-04219", 1);
  const b = belge("b", "2025-04219", 2);
  const c = belge("c", "2026-05000", 3);
  assert.equal(diibBul("2026/D2-04219", [a, b, c])?.id, "a");
  assert.equal(diibBul("D2-04219", [a, b, c]), null); // iki aday: belirsiz
  assert.equal(diibBul("D2-05000", [a, b, c])?.id, "c");
});

test("dosya kg: kalem MTS (virgullu dahil) x 1000", () => {
  assert.equal(dosyaKg([{ miktar_mts: "252,45" }, { quantity: "100" }]), 352450);
  assert.equal(dosyaKg(null), 0);
});

test("yuklenen: konteynerlerin TAMAMI girilmeden toplam sayilmaz (6/10 dersi)", () => {
  const k = (dosya_id: string, net: number | null) => ({ dosya_id, net_agirlik_kg: net });
  const alti = Array.from({ length: 6 }, () => k("d1", 25000));
  assert.equal(yuklenenHesapla(alti, { d1: 10 }).d1, null);
  const on = Array.from({ length: 10 }, () => k("d1", 25000));
  assert.equal(yuklenenHesapla(on, { d1: 10 }).d1, 250000);
  assert.equal(yuklenenHesapla([k("d2", 25000), k("d2", null)], {}).d2, null);
});

test("DIIB miktari: yuklenen varsa proforma yerine yuklenen; tutar orantili (fatura kesilmemisse)", () => {
  const d = { toplam_tutar: 75000, urun_detaylari: [{ miktar_mts: 375 }], fatura_no: null, yuklenenKg: 250000 };
  const m = diibMiktari(d);
  assert.equal(m.kaynak, "konteyner");
  assert.equal(m.kg, 250000);
  assert.equal(m.proformaKg, 375000);
  assert.equal(m.tutar, 50000);
  assert.equal(diibMiktari({ ...d, fatura_no: "FT1" }).tutar, 75000);
  assert.equal(diibMiktari({ ...d, yuklenenKg: null }).kaynak, "proforma");
});

test("bolunme: kendi DIIB once dolar, kalan sonraki aktif DIIB'e", () => {
  const a = belge("a", "2026-00001", 1);
  const b = belge("b", "2026-00002", 2);
  const kapali = belge("k", "2026-00003", 0, "tamamlandi");
  const ozetler = [ozet(a, 100000), ozet(b, 500000), ozet(kapali, 900000)];
  const tek = bolunmeOnerisi(80000, a, ozetler);
  assert.equal(tek.tur, "tek");
  const bol = bolunmeOnerisi(250000, a, ozetler);
  assert.equal(bol.tur, "bolunmeli");
  if (bol.tur === "bolunmeli") {
    assert.deepEqual(bol.parcalar.map((p) => [p.diib.id, p.kg]), [["a", 100000], ["b", 150000]]);
    assert.equal(bol.eksikKg, 0);
  }
  assert.equal(bolunmeOnerisi(1, null, ozetler).tur, "diib_yok");
});

test("parca tutarlari toplami birebir (son parca yuvarlama farkini alir)", () => {
  const p = parcaTutarlari(100, [1, 1, 1]);
  assert.deepEqual(p, [33.33, 33.33, 33.34]);
  assert.equal(Math.round(p.reduce((a, b) => a + b, 0) * 100) / 100, 100);
});

test("DIIB alan metni", () => {
  assert.equal(diibAlanMetni({ belge_no: "2026 / D2-04219", belge_tarihi: "2026-08-19" }), "19.08.2026 TARİH 2026-D2-04219");
  assert.equal(diibAlanMetni({ belge_no: "2026-D2-04219", belge_tarihi: null }), "2026-D2-04219");
});
