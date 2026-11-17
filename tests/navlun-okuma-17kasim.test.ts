/**
 * 17.11.2026 navlun okuyucu duzeltmeleri (denetimde bulunan sinif hatalari). Veriler kurgusaldir.
 * - cok limanli genel tarife ("LIMAN (ULKE) USD n"; tek satir ya da HTML tablodan ayri satirlar)
 * - "maliyet / spot ekran" cumlesindeki tutar teklif degildir
 * - tutarin hemen arkasindaki ekipman ("USD 900 - 40'HC")
 * - "21 gun DND FT" free time kalibi
 * - kisa cevapta transit ("Ornekhat 40 gun"), "FT ... olarak devam" guncellemesi, aktarma notundaki transit
 */
import { test } from "node:test";
import assert from "node:assert/strict";

type Olay = { tur: string; liman: string | null; tutar: number | null; ekipman: string | null; free_time_gun: number | null };
const yukle = (ad: string) => import(new URL(`../supabase/functions/_shared/${ad}.ts`, import.meta.url).href);
type OkuMod = {
  navlunMesajOku: (m: { konu: string; gonderen: string; govde: string }, a: Record<string, string>) => Olay[];
  tarifeSatirlari: (s: string) => { liman: string; tutar: number; ekipman: string; ft: number | null }[] | null;
  freeTimeBul: (s: string) => number | null;
  transitBul: (s: string) => string | null;
};
type IsleMod = {
  kisaTransit: (s: string) => { tt: string; armator: string | null } | null;
  ekBilgisi: (g: { govde: string; ek_metin: string }) => { free_time_gun: number | null; transit_gun: string | null; ft_guncel: boolean };
};
const okuMod = (): Promise<OkuMod> => yukle("navlun-oku");
const isleMod = (): Promise<IsleMod> => yukle("navlun-isle");
const ACENTE = { "ornek-acente.test": "Ornek Acente" };
const oku = async (govde: string, konu = "RE: UNEX // ORNEKPORT // NAVLUN TALEBİ HK.") =>
  (await okuMod()).navlunMesajOku({ konu, gonderen: "satis@ornek-acente.test", govde }, ACENTE);

const TARIFE_TEK = `Merhabalar,

BOLGE A - Free time: 21 Days (Validity 30.11.2026)
Currency 20DV
ORNEKLIMAN (ORNEKULKE) USD 1600
IKINCILIMAN (ORNEKULKE) USD 3465
UCUNCULIMAN (BASKAULKE) EUR 2810
BOLGE B - Free time: 14 Days, For Dorduncuport 21 Days (Validity 30.11.2026)
Currency
DORDUNCUPORT (DORDUNCUULKE) USD 3950
BESINCILIMAN (BESINCIULKE) USD 1040
`;
const TARIFE_TABLO = TARIFE_TEK.replace(/ \(([A-Z]+)\) (USD|EUR) (\d+)/g, " ($1)\n$2\n$3").replace("Currency 20DV", "Currency\n20DV");

test("genel tarife: her liman ayri teklif, bolum ve limana ozel free time, EUR yazilmaz", async () => {
  for (const metin of [TARIFE_TEK, TARIFE_TABLO]) {
    const s = await oku(metin, "RE: ORNEK // UNEX // BOLGE A & BOLGE B // IHRACAT NAVLUN TEKLIFI");
    assert.deepEqual(s.map((o) => [o.liman, o.tutar, o.ekipman, o.free_time_gun]), [
      ["ORNEKLIMAN", 1600, "20DC", 21], ["IKINCILIMAN", 3465, "20DC", 21],
      ["DORDUNCUPORT", 3950, "20DC", 21], ["BESINCILIMAN", 1040, "20DC", 14],
    ]);
  }
});

test("tarife: 3'ten az satir tarife sayilmaz", async () => {
  const { tarifeSatirlari } = await okuMod();
  assert.equal(tarifeSatirlari("ORNEKLIMAN (ORNEKULKE) USD 1600\nIKINCILIMAN (ORNEKULKE) USD 1700"), null);
});

test("maliyet / spot ekran cumlesindeki tutar teklif sayilmaz", async () => {
  const s = await oku(`Merhaba,\n\nOrnekhat spot ekran total maliyet: 1913 USD.\nBizim teklifimiz USD 1800 / 20'DC all in.\n`);
  assert.deepEqual(s.filter((o) => o.tur === "teklif").map((o) => o.tutar), [1800]);
});

test("tutarin hemen arkasindaki ekipman onceki ekipmani ezer", async () => {
  const s = await oku(`Merhaba,\n\n20'DC / 40'HC fiyatlarimiz:\nUSD 900 - 40'HC\n`);
  const t = s.find((o) => o.tutar === 900);
  assert.equal(t?.ekipman, "40HC");
});

test("'21 gun DND FT' free time kalibi", async () => {
  const { freeTimeBul } = await okuMod();
  assert.equal(freeTimeBul("Navlun USD 1200, 21 gün DND FT verilmistir"), 21);
  assert.equal(freeTimeBul("14 days combined free"), 14);
});

test("aktarma notundaki gun araligi transit sure", async () => {
  const { transitBul } = await okuMod();
  assert.equal(transitBul("FO Ornekport (Ornekliman aktarmalı 40-42DAYS ) Navlun USD 2000"), "40-42");
});

test("kisa cevapta transit: tek anlamli satir, aralik ya da 25+ gun, free time degil", async () => {
  const { kisaTransit } = await isleMod();
  assert.equal(kisaTransit("Merhaba,\n\n38-40 gün\n\nSaygılarımla")?.tt, "38-40");
  assert.equal(kisaTransit("Merhaba,\n\n21 gün\n\nSaygılarımla"), null);
  assert.equal(kisaTransit("Merhaba,\n\n40 gün free time\n\nSaygılarımla"), null);
});

test("'FT ... olarak devam' guncelleme isareti", async () => {
  const { ekBilgisi } = await isleMod();
  const b = ekBilgisi({ govde: "Merhabalar,\n\nFT 21 gün olarak devam edebiliyoruz.", ek_metin: "" });
  assert.equal(b.ft_guncel, true);
  assert.equal(ekBilgisi({ govde: "Merhabalar,\n\nTesekkurler.", ek_metin: "" }).ft_guncel, false);
});
