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

test("export listesi: spek / cuval gorseli / tarih eksik yuklemeler; tamam ve tartilan cikar; acil = ekipmana <= 2 gun", async () => {
  const { spekListesi, spekMailHtml, spekKonusu } = await yukle("siparis-formu-spek");
  const formlar = [
    model("TAMAM", { spekKayitli: true }),
    model("SPEKSIZ", { spekKayitli: false, spekOnerisi: "Protein min 13%", girisEksikleri: ["Ürün spekleri", "SKT"], gonderilebilir: false, ekipmanTarihi: "2026-11-25" }),
    model("GORSELSIZ", { spekKayitli: true, spekOnerisi: "y", girisEksikleri: ["Çuval görseli"], gonderilebilir: false, ekipmanTarihi: "2026-11-30", etd: "2026-12-05" }),
    model("TARTILDI", { spekKayitli: false, spekOnerisi: "x", girisEksikleri: ["Ürün spekleri"], gonderilebilir: false }),
  ];
  const l = spekListesi(formlar, ["TARTILDI"], "2026-11-23");
  assert.deepEqual(l.map((x: { booking: string }) => x.booking), ["SPEKSIZ", "GORSELSIZ"]);
  assert.equal(l[0].oneri, "Protein min 13%");
  assert.deepEqual(l[0].eksikler, ["Ürün spekleri", "SKT"]);
  assert.equal(l[0].acil, true);
  assert.equal(l[1].oneri, "");
  assert.equal(l[1].acil, false);
  const html = spekMailHtml(l, "2026-11-23", "https://ornek.test/siparisler?sekme=formlar", { test: true, hitap: "Ornek Bey" });
  assert.ok(!html.includes("SPEKSIZ") && !html.includes("GORSELSIZ"));
  assert.ok(html.includes("Protein min 13%") && html.includes("TEST") && html.includes("ACİL") && html.includes("Ornek Bey"));
  assert.ok(html.includes("https://ornek.test/siparisler?sekme=formlar") && html.includes("Çuval görseli"));
  assert.equal(spekKonusu(l, "2026-11-23", true), "[TEST] ACİL · Ürün speki ve çuval görseli bekleyen yüklemeler · 2 yükleme (1 acil) · 23.11.2026");
});
