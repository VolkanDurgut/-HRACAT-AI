/**
 * Navlun mail okuyucu (supabase/functions/_shared/navlun-oku.ts + navlun-isle.ts).
 * Ders (16.11.2026): "USD 3350 / 20'DC" satirinin hemen altindaki "+ USD 30 ENS FEE / BL" yuzunden 3350 "masraf"
 * sayildi; teklif bulunamayinca yeni acente ogrenilmedi ve mail hic kaydedilmedi.
 * Veriler kurgusaldir (alan adlari, kisi ve liman adlari yalniz bicim icin).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// Edge (Deno) kodu es2018+ kullaniyor; Next typecheck'i (target es5) bu dosyalari izlemesin diye calisma aninda yuklenir.
type Olay = { tur: string; liman: string | null; tutar: number | null; ekipman: string | null; armator: string | null;
  free_time_gun: number | null; lokal_dahil: boolean | null; pol: string | null };
type NavlunGirdi = { mesaj_id: string; gonderen: string; konu: string; govde: string; tarih: string; ek_metin: string; ek_kaynak: string };
const yukle = (ad: string) => import(new URL(`../supabase/functions/_shared/${ad}.ts`, import.meta.url).href);
type OkuMod = {
  kalemCevresi: (s: string, bas: number, son: number) => string;
  navlunMesajOku: (m: { konu: string; gonderen: string; govde: string }, a: Record<string, string>) => Olay[];
};
type IsleMod = {
  adayKaydi: (g: NavlunGirdi, a: Record<string, string>) => { acente: string | null; durum: string; olaylar: Olay[]; liman: string | null } | null;
  acenteOgren: (g: NavlunGirdi, a: Record<string, string>) => { alan: string; ad: string; kayit: { olaylar: Olay[] } } | null;
};
const okuMod = (): Promise<OkuMod> => yukle("navlun-oku");
const isleMod = (): Promise<IsleMod> => yukle("navlun-isle");

const ACENTE = { "ornek-acente.example": "Ornek Acente" };
const KONU = "RE: UNEX // ORNEKPORT // NAVLUN TALEBİ HK.";
const oku = async (govde: string, konu = KONU) =>
  (await okuMod()).navlunMesajOku({ konu, gonderen: "satis@ornek-acente.example", govde }, ACENTE);

const COKLU_POD = `Merhabalar,

Dış dolum bazlı olarak liman masrafları dahil teklifimizi aşağıdaki gibi bilginize sunarız.

POL : AMBARLI
POD : ORNEKKENT & ORNEKPORT
USD 2100 / 20’DC
+ USD 30 ENS FEE / BL
TRANSIT TIME : APPROX. 40 DAYS VIA VALENCIA
FREE TIME : 14 DAYS

Ali Örnek
Sales Manager
As agent for Marguisa Shipping Lines

From: Operation <operation@ornek.example>
Subject: UNEX // ORNEKPORT // NAVLUN TALEBİ HK.

Merhaba, 20'DC navlun teklifinizi rica ederiz.`;

test("kalemCevresi: sonraki kalem (+ USD 30 ENS FEE) navlunun cevresine girmez", async () => {
  const { kalemCevresi } = await okuMod();
  const s = "USD 2100 / 20'DC\n+ USD 30 ENS FEE / BL";
  const i = s.indexOf("2100");
  assert.equal(/fee/i.test(kalemCevresi(s, i, i + 4)), false);
  const j = s.indexOf("30 ENS");
  assert.equal(/fee/i.test(kalemCevresi(s, j, j + 2)), true);
});

test("ek kalem ayni satirda olsa da navlun tutari masraf sayilmaz", async () => {
  const o = await oku("Merhaba,\nUSD 2100 / 20'DC + USD 30 ENS FEE / BL\nFREE TIME : 14 DAYS");
  assert.equal(o.length, 1);
  assert.equal(o[0].tutar, 2100);
  assert.equal(o[0].ekipman, "20DC");
});

test("gercek masraf satirlari hala navlun degildir", async () => {
  assert.deepEqual(await oku("Merhaba, Usd 50+Kdv VGM geç bildirim ücreti uygulanacaktır."), []);
  assert.deepEqual(await oku("Merhaba, ceza bedeli USD 900 olarak yansıtılacaktır."), []);
});

test("coklu POD (X & Y): her liman icin ayri teklif, imzadaki armator ve lokal dahil", async () => {
  const o = await oku(COKLU_POD);
  assert.deepEqual(o.map((x) => x.liman).sort(), ["ORNEKKENT", "ORNEKPORT"]);
  for (const x of o) {
    assert.equal(x.tur, "teklif");
    assert.equal(x.tutar, 2100);
    assert.equal(x.armator, "Marguisa");
    assert.equal(x.free_time_gun, 14);
    assert.equal(x.lokal_dahil, true);
    assert.equal(x.pol, "AMBARLI");
  }
});

test("POD listesi konudaki limani icermiyorsa tek teklif (konu limani) kalir", async () => {
  const o = await oku("Merhaba,\nPOL : AMBARLI\nPOD : FARKLIPORT & BASKAPORT\nUSD 2100 / 20'DC");
  assert.deepEqual(o.map((x) => x.liman), ["ORNEKPORT"]);
});

test("'masraflari dahil degildir' lokal dahil sayilmaz", async () => {
  const o = await oku("Merhaba, USD 1450/20DC. Liman masrafları dahil değildir.");
  assert.equal(o.length, 1);
  assert.equal(o[0].lokal_dahil, false);
});

test("bilinmeyen alan adindan gelen NAVLUN TALEBI cevabi acente olarak ogrenilir", async () => {
  const g: NavlunGirdi = {
    mesaj_id: "<t1@ornek>", gonderen: "ali@yeni-acente.example", konu: KONU, govde: COKLU_POD,
    tarih: "2026-11-11T11:54:00Z", ek_metin: "", ek_kaynak: "",
  };
  const r = (await isleMod()).acenteOgren(g, {});
  assert.ok(r, "acente ogrenilmeli");
  assert.equal(r!.alan, "yeni-acente.example");
  assert.equal(r!.kayit.olaylar.length, 2);
});

test("bizden kabul: 'navlun bedelini X usd olarak dikkate aliyoruz' (rezervasyon talebi)", async () => {
  const { navlunMesajOku } = await okuMod();
  const o = navlunMesajOku({
    konu: "RE: UNEX // ORNEKPORT // 5*20 DC // REZERVASYON TALEBİ HK.", gonderen: "operation@unex.com.tr",
    govde: "Bey merhaba,\n\nKonu booking için navlun bedelini 1780 usd olarak dikkate alıyoruz.\n\nBuna istinaden free time ve transit süre bilgisi rica ederim.",
  }, ACENTE);
  assert.equal(o.length, 1);
  assert.equal(o[0].tur, "kabul");
  assert.equal(o[0].tutar, 1780);
  // talep / hedef cumlesi kabul sayilmaz
  const h = navlunMesajOku({ konu: "UNEX // ORNEKPORT // NAVLUN TALEBİ HK.", gonderen: "operation@unex.com.tr",
    govde: "Merhaba, navlun bedelini 1500 usd olarak rica ederiz." }, ACENTE);
  assert.equal(h.filter((x) => x.tur === "kabul").length, 0);
});


test("taninmayan alan adindan NAVLUN TALEBI cevabi: ogrenilemese de olaysiz 'bilgi' adayi olarak saklanir", async () => {
  const { adayKaydi } = await isleMod();
  const g = (gonderen: string, konu = KONU, govde = "Merhaba, konteynerler Tanzanya dışına çıkacak mıdır?"): NavlunGirdi =>
    ({ mesaj_id: "<t2@ornek>", gonderen, konu, govde, tarih: "2026-11-12T08:00:00Z", ek_metin: "", ek_kaynak: "" });
  const a = adayKaydi(g("satis@yeni-hat.example"), {});
  assert.ok(a);
  assert.equal(a!.acente, null);
  assert.equal(a!.durum, "bilgi");
  assert.deepEqual(a!.olaylar, []);
  assert.equal(a!.liman, "ORNEKPORT");
  assert.equal(adayKaydi(g("satis@ornek-acente.example"), ACENTE), null);          // bilinen acente: normal yol
  assert.equal(adayKaydi(g("biri@gmail.com"), {}), null);                         // kisisel posta
  assert.equal(adayKaydi(g("operation@unex.com.tr"), {}), null);                  // bizden
  assert.equal(adayKaydi(g("satis@yeni-hat.example", "UNEX // ORNEKPORT // 5*20 DC // REZERVASYON TALEBİ HK."), {}), null); // navlun talebi degil
});
