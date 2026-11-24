/**
 * Navlun degerlendirme (supabase/functions/_shared/navlun-degerlendirme.ts) - 24.11.2026, Asama 1.
 * Gecerlilik / bayatlik, en iyi secimi ve gerceklesen navlun kontrolu. Veriler KURGUDUR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acenteGecerlilikleri, enIyileriSec, gecerlilikBitisi, gecerlilikTarihi, gerceklesenKarsilastir, limanEs, teklifDurumu,
  type GerceklesenGirdi, type TeklifAdayi,
} from "@/supabase/functions/_shared/navlun-degerlendirme";

test("gecerlilikTarihi: bicimler, yil donumu, anlamsiz tarih", () => {
  assert.equal(gecerlilikTarihi("30.11", "2026-11-10"), "2026-11-30");
  assert.equal(gecerlilikTarihi("30/11/2026", "2026-11-10"), "2026-11-30");
  assert.equal(gecerlilikTarihi("30.11.26", "2026-11-10"), "2026-11-30");
  assert.equal(gecerlilikTarihi("15.01", "2026-12-20"), "2027-01-15");      // aralikta yazilan ocak: ertesi yil
  assert.equal(gecerlilikTarihi("15.11", "2026-11-20"), "2026-11-15");      // 5 gun geride: ayni yil (gecmis)
  assert.equal(gecerlilikTarihi("31.11", "2026-11-10"), null);
  assert.equal(gecerlilikTarihi("ay sonu", "2026-11-10"), null);
  assert.equal(gecerlilikTarihi(null, "2026-11-10"), null);
});

test("acente aliskanligi: ay sonu ya da tipik gun; az ornek kural uretmez", () => {
  const t = (acente: string, tarih: string, gecerlilik: string) => ({ acente, tarih, gecerlilik });
  const m = acenteGecerlilikleri([
    t("ALFA", "2026-10-05", "31.10"), t("ALFA", "2026-10-20", "31.10"), t("ALFA", "2026-11-03", "30.11"),
    t("BETA", "2026-10-01", "15.10"), t("BETA", "2026-10-10", "24.10"), t("BETA", "2026-11-01", "15.11"),
    t("GAMA", "2026-10-01", "15.10"),
  ]);
  assert.deepEqual(m.get("ALFA"), { tur: "ay_sonu", ornek: 3 });
  assert.deepEqual(m.get("BETA"), { tur: "gun", gun: 14, ornek: 3 });
  assert.equal(m.has("GAMA"), false);

  assert.deepEqual(gecerlilikBitisi({ acente: "ALFA", tarih: "2026-11-12", gecerlilik: null }, m), { bitis: "2026-11-30", kaynak: "acente" });
  assert.deepEqual(gecerlilikBitisi({ acente: "ALFA", tarih: "2026-11-29", gecerlilik: null }, m), { bitis: "2026-12-31", kaynak: "acente" });
  assert.deepEqual(gecerlilikBitisi({ acente: "BETA", tarih: "2026-11-12", gecerlilik: null }, m), { bitis: "2026-11-26", kaynak: "acente" });
  assert.deepEqual(gecerlilikBitisi({ acente: "GAMA", tarih: "2026-11-01", gecerlilik: null }, m), { bitis: "2026-11-22", kaynak: "varsayilan" });
  assert.deepEqual(gecerlilikBitisi({ acente: "GAMA", tarih: "2026-11-01", gecerlilik: "05.12" }, m), { bitis: "2026-12-05", kaynak: "teklif" });
});

test("teklifDurumu: suresi doldu > kontrol > eksik > kesin", () => {
  assert.equal(teklifDurumu({ kesin: true, celiski: null }, "2026-11-20", "2026-11-24"), "suresi_doldu");
  assert.equal(teklifDurumu({ kesin: false, celiski: "x" }, "2026-11-30", "2026-11-24"), "kontrol");
  assert.equal(teklifDurumu({ kesin: false, celiski: null }, "2026-11-30", "2026-11-24"), "eksik");
  assert.equal(teklifDurumu({ kesin: true, celiski: null }, "2026-11-24", "2026-11-24"), "kesin");
});

test("enIyileriSec: acentenin yalniz son teklifi; suresi dolan ucuz teklif secilmez", () => {
  const x = (id: string, acente: string, tarih: string, toplam: number, durum: "kesin" | "suresi_doldu" | "eksik" = "kesin") =>
    ({ id, liman_anahtar: "ORNEK", acente, ekipman: "20DC", armator: null, tarih, toplam, durum });
  const s = enIyileriSec([
    x("a1", "ALFA", "2026-09-01", 900, "suresi_doldu"),   // ucuz ama bayat
    x("b1", "BETA", "2026-11-01", 1500),
    x("b2", "BETA", "2026-11-20", 1600),                   // BETA'nin son teklifi 1600 (1500 artik gecersiz)
    x("c1", "GAMA", "2026-11-21", 1550),
    x("d1", "DELTA", "2026-11-22", 1000, "eksik"),         // lokal belirsiz: en iyi secilmez
  ]);
  assert.deepEqual(Array.from(s), ["c1"]);
});

const teklif = (id: string, tarih: string, tutar: number, acente = "ALFA", para = "USD"): TeklifAdayi =>
  ({ id, acente, liman_anahtar: "ORNEK", ekipman: "20DC", tutar, para, tarih, tur: "teklif" });
const gercek = (x: Partial<GerceklesenGirdi> = {}): GerceklesenGirdi =>
  ({ id: "s1", booking_no: "KURGU1", acente: "ALFA/HAT", liman_anahtar: "ORNEK", etd: "2026-11-26", referans: "2026-11-15", gercek: 1940, lokal: 400, para: "USD", teslim: "CFR", ...x });
const kur = () => ({ EUR: 1.1, TRY: 0.025, tarih: "TCMB 15.11.2026" });

test("gerceklesen: rezervasyondan onceki son teklifle tutuyor; sonraki teklif dikkate alinmaz", () => {
  const r = gerceklesenKarsilastir(gercek(), [teklif("t1", "2026-11-10", 1940), teklif("t2", "2026-11-23", 1850)], kur);
  assert.equal(r.durum, "tutuyor");
  assert.equal(r.teklif_id, "t1");
  assert.equal(r.fark, 0);
});

test("gerceklesen: eski teklifle tutuyor / tutmuyor / teklif yok / FOB", () => {
  const eski = gerceklesenKarsilastir(gercek(), [teklif("t1", "2026-10-27", 1940), teklif("t2", "2026-11-12", 1850)], kur);
  assert.equal(eski.durum, "eski_teklifle_tutuyor");
  assert.equal(eski.teklif_id, "t1");
  const tutmuyor = gerceklesenKarsilastir(gercek(), [teklif("t1", "2026-11-12", 1700)], kur);
  assert.equal(tutmuyor.durum, "tutmuyor");
  assert.equal(tutmuyor.fark, 240);
  assert.equal(gerceklesenKarsilastir(gercek(), [teklif("t1", "2026-11-12", 1940, "BETA")], kur).durum, "teklif_yok");
  assert.equal(gerceklesenKarsilastir(gercek({ teslim: "FOB" }), [teklif("t1", "2026-11-12", 1940)], kur).durum, "fob");
});

test("gerceklesen: teklif + lokal; ayni para biriminde kur kullanilmaz, farkli ise rezervasyon gununun kuru yazilir", () => {
  assert.equal(gerceklesenKarsilastir(gercek({ gercek: 2340 }), [teklif("t1", "2026-11-12", 1940)], kur).aciklama, "Gerçekleşen = teklif + lokal.");
  const ayni = gerceklesenKarsilastir(gercek({ gercek: 2810, para: "EUR" }), [teklif("t1", "2026-11-12", 2810, "ALFA", "EUR")], kur);
  assert.equal(ayni.durum, "tutuyor");
  assert.equal(ayni.kur_tarihi, null);
  const farkli = gerceklesenKarsilastir(gercek({ gercek: 3091, para: "USD", lokal: null }), [teklif("t1", "2026-11-12", 2810, "ALFA", "EUR")], kur);
  assert.equal(farkli.durum, "tutuyor");
  assert.equal(farkli.kur_tarihi, "TCMB 15.11.2026");
});

test("limanEs: DAR ES SELAM / SALAAM ayni liman", () => {
  assert.equal(limanEs("DAR ES SELAM"), "DAR ES SALAAM");
  assert.equal(limanEs("DAR ES SALAAM"), "DAR ES SALAAM");
  assert.equal(limanEs("MOMBASA"), "MOMBASA");
  assert.equal(limanEs(null), null);
});
