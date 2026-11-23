/**
 * 23.11.2026 lojistik secim listesi (siparis bildirim formu). Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const yukle = (ad: string) => import(new URL(`../supabase/functions/_shared/${ad}.ts`, import.meta.url).href);

const model = (anahtar: string, x: Record<string, unknown> = {}) => ({
  anahtar, bookingNo: anahtar, alanlar: { firma: "Ornek Firma", varisLimani: "ORNEKPORT", adet: "2*20 DC", urunTipi: "WHEAT FLOUR", gemi: "ORNEK", temsilci: "" },
  girisEksikleri: [], gonderilebilir: true, ekipmanTarihi: "2026-11-25", etd: "2026-11-28", temsilciHitap: null, gonderim: null, ...x,
});

test("liste: gonderilmis / isaretlenmis, tartilmis ve gemisi kalkmis yuklemeler cikar; en yakin ekipman once", async () => {
  const { lojistikListesi } = await yukle("siparis-formu-lojistik");
  const formlar = [
    model("B3", { ekipmanTarihi: "2026-11-30", etd: "2026-12-05" }),
    model("B1"),
    model("GONDERILDI", { gonderim: { zaman: "2026-11-20T09:00:00Z", alicilar: "x@ornek.test" } }),
    model("KAPATILDI", { gonderim: { zaman: "2026-11-20T09:00:00Z", alicilar: null } }),
    model("TARTILDI"),
    model("KALKTI", { ekipmanTarihi: "2026-11-10", etd: "2026-11-15" }),
    model("EKSIK", { gonderilebilir: false, girisEksikleri: ["Çuval görseli"], ekipmanTarihi: "2026-11-24" }),
  ];
  const l = lojistikListesi(formlar, ["TARTILDI"], "2026-11-23");
  assert.deepEqual(l.map((x: { booking: string }) => x.booking), ["EKSIK", "B1", "B3"]);
  assert.equal(l[0].hazir, false);
  assert.deepEqual(l[0].eksikler, ["Çuval görseli"]);
});

test("mail: booking numarasi yazilmaz; secim baglantisi ve test seridi var; hazir / eksik ayri", async () => {
  const { lojistikListesi, lojistikMailHtml, lojistikKonusu } = await yukle("siparis-formu-lojistik");
  const l = lojistikListesi([model("ORNEKBKG111"), model("ORNEKBKG222", { gonderilebilir: false, girisEksikleri: ["SKT"] })], [], "2026-11-23");
  const html = lojistikMailHtml(l, "2026-11-23", "https://ornek.test/siparis-formu-sec/abc", { test: true, alici: "lojistik@ornek.test" });
  assert.ok(!html.includes("ORNEKBKG111") && !html.includes("ORNEKBKG222"));
  assert.ok(html.includes("https://ornek.test/siparis-formu-sec/abc"));
  assert.ok(html.includes("TEST") && html.includes("lojistik@ornek.test"));
  assert.ok(html.includes("Gönderime hazır (1)") && html.includes("Bilgisi eksik (1)") && html.includes("Eksik: SKT"));
  assert.equal(lojistikKonusu(l, "2026-11-23", true), "[TEST] Sipariş bildirim formu bekleyen yüklemeler · 2 yükleme (1 hazır) · 23.11.2026");
});

test("spek listesi: yalniz spekleri kaydedilmemis lojistik satirlari; oneri ve diger eksikler; bos spek gecersiz", async () => {
  const { spekListesi, spekGecerli, spekMailHtml } = await yukle("siparis-formu-spek");
  const formlar = [
    model("SPEKLI", { spekKayitli: true }),
    model("SPEKSIZ", { spekKayitli: false, spekOnerisi: "Protein min 13%", girisEksikleri: ["Ürün spekleri", "SKT"], gonderilebilir: false }),
    model("TARTILDI", { spekKayitli: false, spekOnerisi: "x" }),
  ];
  const l = spekListesi(formlar, ["TARTILDI"], "2026-11-23");
  assert.deepEqual(l.map((x: { booking: string }) => x.booking), ["SPEKSIZ"]);
  assert.equal(l[0].oneri, "Protein min 13%");
  assert.deepEqual(l[0].digerEksikler, ["SKT"]);
  assert.equal(spekGecerli("  "), null);
  assert.equal(spekGecerli("Protein min 13%\n\nNem: max 14%"), "Protein min 13%\nNem: max 14%");
  const html = spekMailHtml(l, "2026-11-23", "https://ornek.test/siparis-formu-spek/abc", { test: true });
  assert.ok(!html.includes("SPEKSIZ") && html.includes("Protein min 13%") && html.includes("TEST"));
});
