import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adimBul, enIyiOlay, etaFarkiGun, hatOzeti, istanbulGunu, konteynerYolculuklari, olayNormalle, type HatOlayi,
} from "@/supabase/functions/_shared/hat-takip";

// Kurgusal DCSA T&T v2 olaylari (gercek booking / konteyner degil)
const tasima = (kod: "DEPA" | "ARRI", sinif: string, zaman: string, yer: string, olusma = "2026-11-01T00:00:00Z", id?: string) => ({
  eventID: id, eventType: "TRANSPORT", eventClassifierCode: sinif, eventDateTime: zaman, eventCreatedDateTime: olusma,
  transportEventTypeCode: kod,
  transportCall: { UNLocationCode: yer, exportVoyageNumber: "001S", vessel: { vesselName: "KURGU YILDIZ", vesselIMONumber: "9999999" } },
});
const ekipman = (kod: string, sinif: string, zaman: string, yer: string, kont: string, bos: "EMPTY" | "LADEN") => ({
  eventType: "EQUIPMENT", eventClassifierCode: sinif, eventDateTime: zaman, eventCreatedDateTime: "2026-11-01T00:00:00Z",
  equipmentEventTypeCode: kod, equipmentReference: kont, emptyIndicatorCode: bos, eventLocation: { UNLocationCode: yer },
});

const ham = [
  tasima("DEPA", "ACT", "2026-10-31T15:15:00+03:00", "TRKUR"),
  tasima("ARRI", "PLN", "2026-12-04T10:00:00Z", "XXAAA", "2026-10-20T00:00:00Z"),
  tasima("ARRI", "EST", "2026-12-05T14:00:00Z", "XXAAA", "2026-11-20T00:00:00Z"),
  tasima("ARRI", "PLN", "2026-11-15T08:00:00Z", "XXTRS"), // aktarma limani (son varis degil)
  ekipman("GTOT", "ACT", "2026-10-22T10:00:00+03:00", "TRKUR", "KRGU1234567", "EMPTY"),
  ekipman("GTIN", "ACT", "2026-10-23T09:00:00+03:00", "TRKUR", "KRGU1234567", "LADEN"),
  ekipman("LOAD", "ACT", "2026-10-30T20:00:00+03:00", "TRKUR", "KRGU1234567", "LADEN"),
  ekipman("DISC", "PLN", "2026-12-05T18:00:00Z", "XXAAA", "KRGU1234567", "LADEN"),
  ekipman("GTOT", "PLN", "2026-12-08T09:00:00Z", "XXAAA", "KRGU1234567", "LADEN"),
  ekipman("GTIN", "ACT", "2026-10-24T11:00:00+03:00", "TRKUR", "KRGU7654321", "LADEN"),
  { eventType: "SHIPMENT", eventClassifierCode: "ACT", eventDateTime: "2026-10-20T10:00:00Z", shipmentEventTypeCode: "CONF" },
  { foo: "taninmayan" },
];

test("olayNormalle: alanlar, taninmayan olay null, eventID yoksa kararli anahtar", () => {
  const o = ham.map((x) => olayNormalle(x as Record<string, unknown>));
  assert.equal(o[o.length - 1], null);
  const d = o[0]!;
  assert.deepEqual([d.tur, d.kod, d.sinif, d.yer, d.gemi, d.imo, d.sefer], ["TRANSPORT", "DEPA", "ACT", "TRKUR", "KURGU YILDIZ", "9999999", "001S"]);
  const e = o[4]!;
  assert.deepEqual([e.tur, e.kod, e.konteyner, e.bos_dolu, e.yer], ["EQUIPMENT", "GTOT", "KRGU1234567", "EMPTY", "TRKUR"]);
  assert.match(e.anahtar, /^h[0-9a-f]{8}$/);
  assert.equal(olayNormalle(ham[4] as Record<string, unknown>)!.anahtar, e.anahtar); // ayni olay -> ayni anahtar
  assert.equal(olayNormalle({ ...tasima("DEPA", "ACT", "2026-10-31T12:00:00Z", "TRKUR"), eventID: "abc-1" })!.anahtar, "abc-1");
});

const olaylar = ham.map((x) => olayNormalle(x as Record<string, unknown>)).filter((x): x is HatOlayi => !!x);

test("hatOzeti: POL ilk kalkis, POD son varis (aktarma degil), ETA en guvenilir (EST > PLN)", () => {
  const oz = hatOzeti(olaylar);
  assert.equal(oz.pol, "TRKUR");
  assert.equal(oz.pod, "XXAAA");
  assert.equal(oz.etd, "2026-10-31T15:15:00+03:00");
  assert.equal(oz.etd_sinif, "ACT");
  assert.equal(oz.eta, "2026-12-05T14:00:00Z");
  assert.equal(oz.eta_sinif, "EST");
  assert.equal(oz.gemi, "KURGU YILDIZ");
  assert.equal(oz.sefer, "001S");
  assert.equal(oz.konteyner_sayisi, 2);
  assert.equal(oz.olay_sayisi, olaylar.length);
});

test("hatOzeti: olay yoksa bos ozet", () => {
  const oz = hatOzeti([]);
  assert.deepEqual([oz.eta, oz.etd, oz.pod, oz.olay_sayisi], [null, null, null, 0]);
});

test("enIyiOlay: ACT her zaman kazanir; ayni sinifta en yeni olusan", () => {
  const a = olayNormalle(tasima("ARRI", "PLN", "2026-12-01T00:00:00Z", "XXAAA", "2026-10-01T00:00:00Z"))!;
  const b = olayNormalle(tasima("ARRI", "PLN", "2026-12-03T00:00:00Z", "XXAAA", "2026-11-01T00:00:00Z"))!;
  const c = olayNormalle(tasima("ARRI", "ACT", "2026-12-02T00:00:00Z", "XXAAA", "2026-09-01T00:00:00Z"))!;
  assert.equal(enIyiOlay([a, b])!.zaman, b.zaman);
  assert.equal(enIyiOlay([a, b, c])!.sinif, "ACT");
  assert.equal(enIyiOlay([]), null);
});

test("istanbulGunu / etaFarkiGun: TR gunu (UTC+3) ve gun farki", () => {
  assert.equal(istanbulGunu("2026-12-04T22:30:00Z"), "2026-12-05"); // TR 01:30 -> ertesi gun
  assert.equal(istanbulGunu("2026-12-05T14:00:00Z"), "2026-12-05");
  assert.equal(istanbulGunu(null), null);
  assert.equal(etaFarkiGun("2026-12-04", "2026-12-05T14:00:00Z"), 1);
  assert.equal(etaFarkiGun("2026-12-01", "2026-12-05T14:00:00Z"), 4);
  assert.equal(etaFarkiGun("2026-12-06", "2026-12-05T14:00:00Z"), -1);
  assert.equal(etaFarkiGun(null, "2026-12-05T14:00:00Z"), null);
  assert.equal(etaFarkiGun("2026-12-05", null), null);
});

test("konteynerYolculuklari: adimlar POL / POD'a gore, bos-dolu ayrimi", () => {
  const y = konteynerYolculuklari(olaylar, "XXAAA");
  assert.equal(y.length, 2);
  const k = y.find((x) => x.konteyner === "KRGU1234567")!;
  assert.deepEqual(Object.keys(k.adimlar).sort(), ["bos_alindi", "limana_girdi", "tahliye", "teslim", "yuklendi"]);
  assert.equal(k.adimlar.tahliye!.sinif, "PLN");
  const k2 = y.find((x) => x.konteyner === "KRGU7654321")!;
  assert.deepEqual(Object.keys(k2.adimlar), ["limana_girdi"]);
  // POD bilinmiyorsa varis adimlari cikmaz, LOAD yine yuklendi
  const gtot = olaylar.find((o) => o.kod === "GTOT" && o.bos_dolu === "LADEN")!;
  assert.equal(adimBul(gtot, null), null);
  assert.equal(adimBul(olaylar.find((o) => o.kod === "LOAD")!, null), "yuklendi");
});

test("gorunum: ETA karsilastirma seviyeleri, fark yazisi, TR zaman, gemi hareketleri", async () => {
  const { etaKarsilastir, farkYazi, trZaman, trGun, onceYazi, gemiHareketleri } = await import("@/lib/hat-takip/gorunum");
  assert.deepEqual(etaKarsilastir("2026-12-05", "2026-12-05T14:00:00Z"), { fark: 0, seviye: "ayni" });
  assert.deepEqual(etaKarsilastir("2026-12-04", "2026-12-05T14:00:00Z"), { fark: 1, seviye: "uyari" });
  assert.deepEqual(etaKarsilastir("2026-12-01", "2026-12-05T14:00:00Z"), { fark: 4, seviye: "kritik" });
  assert.deepEqual(etaKarsilastir(null, "2026-12-05T14:00:00Z"), { fark: null, seviye: "yok" });
  assert.equal(farkYazi(2), "+2 gün");
  assert.equal(farkYazi(-1), "−1 gün");
  assert.equal(farkYazi(0), "aynı");
  assert.equal(farkYazi(null), "—");
  assert.equal(trZaman("2026-12-05T14:00:00Z"), "05.12.2026 17:00");
  assert.equal(trZaman("2026-10-31T15:15:00+03:00", false), "31.10.2026");
  assert.equal(trZaman(null), "—");
  assert.equal(trGun("2026-12-04"), "04.12.2026");
  const simdi = Date.parse("2026-11-27T12:00:00Z");
  assert.equal(onceYazi("2026-11-27T11:48:00Z", simdi), "12 dk önce");
  assert.equal(onceYazi("2026-11-27T09:00:00Z", simdi), "3 sa önce");
  assert.equal(onceYazi(null, simdi), "henüz sorgulanmadı");
  const h = gemiHareketleri(olaylar);
  assert.deepEqual(h.map((o) => `${o.kod}@${o.yer}/${o.sinif}`), ["DEPA@TRKUR/ACT", "ARRI@XXTRS/PLN", "ARRI@XXAAA/EST"]);
});
