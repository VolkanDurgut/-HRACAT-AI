/**
 * Ana Panel tek is listesi (23.11.2026): durum, tekrar ayiklama, siralama, filtre, arama. Veriler KURGUSALDIR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isListesiKur, listeSayilari, listeFiltresi, listeAra, filtreyeUyar, dosyaDurumu, odemeBekleyenleriHazirla, proformaAnahtari, gundur,
  type ListeDosyasi,
} from "@/lib/panel/is-listesi";
import type { IsEmriSatiri } from "@/lib/panel/is-emirleri";

const gun = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(12, 0, 0, 0); return d.toISOString(); };
const tarih = (n: number) => gun(n).slice(0, 10);

const dosya = (id: string, ek: Partial<ListeDosyasi> = {}): ListeDosyasi => ({
  id, dosya_no: `IHR-DEMO-${id}`, proforma_no: `DEMO${id.toUpperCase()}`, alici_firma: `MUSTERI ${id}`, olusturma_tarihi: gun(-5),
  konsimento_dosya_url: null, draft_bl_dosya_url: null, beyanname_dosya_url: null, rezervasyonlar: [], ...ek,
});
const rez = (talimat: string | null, beyan: string | null, ek: Record<string, unknown> = {}) =>
  ({ booking_no: "DEMOBK", talimat_cutoff: talimat, beyanname_cutoff: beyan, gemi_kalkis_tarihi: tarih(10), ...ek });

const isEmri = (tur: "rezervasyonlu" | "on_odeme", anahtar: string, ek: Partial<IsEmriSatiri> = {}): IsEmriSatiri => ({
  tur, anahtar, musteri: `IS ${anahtar}`, proforma_no: `DEMOPF${anahtar}`, booking_no: tur === "rezervasyonlu" ? `BK${anahtar}` : null, konteyner: 2,
  cinsi: null, varis_limani: null, cuval_markasi: null, ambalaj: null, acente: null, liman: null, ekipman: null, bos_ekipman_tarihi: null,
  ardiyesiz_giris: null, talimat_cutoff: null, beyan_cutoff: null, etd: tarih(20), gemi: null, sefer: null, on_odeme_tarihi: null,
  aksiyon: { tur: "dosya_ac", etiket: "Dosya aç", href: "/yeni-dosya?proforma=x&otomatik=1", aciklama: "" }, ...ek,
});

test("dosyaDurumu: rezervasyonsuz mavi; belgesi verilmemis 0-3 gun cut-off kirmizi; verilmisse yesil", () => {
  assert.equal(dosyaDurumu(dosya("a")), "rez_bekliyor");
  assert.equal(dosyaDurumu(dosya("b", { rezervasyonlar: [rez(gun(1), gun(6))] })), "cutoff");
  assert.equal(dosyaDurumu(dosya("c", { rezervasyonlar: [rez(gun(1), gun(6))], konsimento_dosya_url: "x" })), "acik");
  assert.equal(dosyaDurumu(dosya("d", { rezervasyonlar: [rez(gun(8), gun(9))] })), "acik");
});

test("isListesiKur: gruplar ve sira (cut-off > acik > rezervasyon > odeme), grup icinde en yakin / en eski ustte", () => {
  const liste = isListesiKur(
    [dosya("acik", { rezervasyonlar: [rez(gun(9), null)] }), dosya("kirmizi", { rezervasyonlar: [rez(gun(2), null)] }), dosya("bos", { olusturma_tarihi: gun(-1) })],
    {
      rezervasyonlu: [isEmri("rezervasyonlu", "R1", { talimat_cutoff: gun(1) }), isEmri("rezervasyonlu", "R2", { talimat_cutoff: gun(6) })],
      onOdeme: [isEmri("on_odeme", "O1", { on_odeme_tarihi: tarih(-12) })],
    },
    odemeBekleyenleriHazirla([{ anahtar: "excel:1", proforma_no: "DEMOODE1", proforma_tarihi: tarih(-3), musteri: "ODEYECEK" }, { anahtar: "" }]),
  );
  assert.deepEqual(liste.map((o) => o.durum), ["cutoff", "cutoff", "acik", "acik", "rez_bekliyor", "rez_bekliyor", "odeme"]);
  assert.deepEqual(liste.map((o) => o.anahtar), ["is:R1", "dosya:kirmizi", "is:R2", "dosya:acik", "is:O1", "dosya:bos", "odeme:excel:1"]);
  const say = listeSayilari(liste);
  assert.deepEqual(say, { tumu: 7, acik: 4, cutoff: 2, rez_bekliyor: 2, odeme: 1 });
});

test("tekrar yok: booking'li is emri rezervasyonsuz dosyayi temsil eder; on odeme is emri dosya varsa gizlenir", () => {
  const rezAks = (id: string) => ({ tur: "rezervasyon" as const, etiket: "Rezervasyon ekle", href: `/dosya/${id}?tab=rezervasyon&action=new`, aciklama: "" });
  const liste = isListesiKur(
    [dosya("f1"), dosya("f2")],
    { rezervasyonlu: [isEmri("rezervasyonlu", "R1", { aksiyon: rezAks("f1") })], onOdeme: [isEmri("on_odeme", "O1", { aksiyon: rezAks("f2") }), isEmri("on_odeme", "O2", { aksiyon: rezAks("baska") })] },
    null,
  );
  assert.deepEqual(liste.map((o) => o.anahtar).sort(), ["dosya:f2", "is:O2", "is:R1"]);
});

test("odeme bekleyen baska satirda varsa (revize R eki dahil) tekrar gosterilmez", () => {
  const liste = isListesiKur(
    [dosya("x", { proforma_no: "DEMOEMT300926R / DEMOEMT300927", rezervasyonlar: [rez(gun(9), null)] })],
    { rezervasyonlu: [], onOdeme: [isEmri("on_odeme", "O1", { proforma_no: "DEMOOO1" })] },
    odemeBekleyenleriHazirla([
      { anahtar: "a", proforma_no: "DEMOEMT300926" }, { anahtar: "b", proforma_no: "demoemt300927" }, { anahtar: "c", proforma_no: "DEMOOO1" }, { anahtar: "d", proforma_no: "DEMOYENI" },
    ]),
  );
  assert.deepEqual(liste.filter((o) => o.tur === "odeme").map((o) => o.anahtar), ["odeme:d"]);
  assert.equal(proformaAnahtari(" demoemt300926r "), "DEMOEMT300926");
});

test("is emri / odeme verisi okunamazsa (null) yalniz dosyalar", () => {
  const liste = isListesiKur([dosya("a", { rezervasyonlar: [rez(gun(9), null)] })], null, null);
  assert.deepEqual(liste.map((o) => o.anahtar), ["dosya:a"]);
});

test("filtre: acik = acik + cut-off; eski ?filtre=rezervasyon -> rezervasyon bekliyor; bilinmeyen tumu", () => {
  assert.equal(filtreyeUyar("cutoff", "acik"), true);
  assert.equal(filtreyeUyar("rez_bekliyor", "acik"), false);
  assert.equal(filtreyeUyar("odeme", "tumu"), true);
  assert.equal(listeFiltresi("rezervasyon"), "rez_bekliyor");
  assert.equal(listeFiltresi(null, "cutoff"), "cutoff");
  assert.equal(listeFiltresi("odeme"), "odeme");
  assert.equal(listeFiltresi("xyz"), "tumu");
});

test("arama: musteri / proforma / dosya no / booking; aksan ve isaret duyarsiz", () => {
  const liste = isListesiKur(
    [dosya("a", { alici_firma: "ÇAĞLA GIDA", rezervasyonlar: [rez(gun(9), null, { booking_no: "ZIMU 123" })] })],
    { rezervasyonlu: [isEmri("rezervasyonlu", "R1")], onOdeme: [] },
    odemeBekleyenleriHazirla([{ anahtar: "o", proforma_no: "DEMOXYZ-1", musteri: "ODEYEN" }]),
  );
  assert.deepEqual(listeAra(liste, "cagla").map((o) => o.anahtar), ["dosya:a"]);
  assert.deepEqual(listeAra(liste, "zimu123").map((o) => o.anahtar), ["dosya:a"]);
  assert.deepEqual(listeAra(liste, "bkr1").map((o) => o.anahtar), ["is:R1"]);
  assert.deepEqual(listeAra(liste, "demoxyz1").map((o) => o.anahtar), ["odeme:o"]);
  assert.equal(listeAra(liste, "  ").length, 3);
});

test("gundur: Istanbul takvim gunu", () => {
  const simdi = Date.parse("2026-11-23T08:00:00Z");
  assert.equal(gundur("2026-11-11", simdi), 12);
  assert.equal(gundur("2026-11-23", simdi), 0);
  assert.equal(gundur(null, simdi), null);
});
