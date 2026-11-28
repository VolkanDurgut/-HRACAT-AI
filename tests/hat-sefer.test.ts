import { test } from "node:test";
import assert from "node:assert/strict";
import { hapagHataMetni, seferleriNormalle, seferNormalle } from "@/supabase/functions/_shared/hat-sefer";

// Kurgusal veri: Hapag CS cevabinin 28.11.2026 canli bicimi (gemi / sefer adlari uydurma)
const yer = (kod: string, ad: string, zaman: string, terminal?: string) => ({
  facilityTypeCode: "POTE",
  location: { locationName: ad, UNLocationCode: kod, ...(terminal ? { facility: { facilityCode: terminal, facilityCodeListProvider: "SMDG" } } : {}) },
  dateTime: zaman,
});
const bacak = (sira: number, k: ReturnType<typeof yer>, v: ReturnType<typeof yer>, gemi: string, sefer: string, servis = "KURGU SERVIS", kod = "KRG") => ({
  sequenceNumber: sira, departure: k, arrival: v,
  transport: {
    modeOfTransport: "VESSEL",
    servicePartners: [{ carrierCode: "HLC", carrierServiceName: servis, carrierServiceCode: kod, carrierExportVoyageNumber: sefer, carrierImportVoyageNumber: sefer }],
    vessel: { vesselIMONumber: "9999999", name: gemi, flag: "MH" },
  },
});
const cutoff = [
  { cutOffDateTimeCode: "FCO", cutOffDateTime: "2026-12-03T10:00:00+03:00" },
  { cutOffDateTimeCode: "DCO", cutOffDateTime: "2026-12-02T15:00:00+03:00" },
  { cutOffDateTimeCode: "VCO", cutOffDateTime: "2026-12-03T12:00:00+03:00" },
  { cutOffDateTimeCode: "XXX", cutOffDateTime: "2026-12-01T00:00:00Z" },
];
const direkt = (kalkis: string, varis: string, gemi: string, sefer: string, cozum = 1) => ({
  placeOfReceipt: yer("TRIST", "ISTANBUL", kalkis, "KUMLI"),
  placeOfDelivery: yer("GHTEM", "TEMA", varis),
  legs: [bacak(1, yer("TRIST", "ISTANBUL", kalkis, "KUMLI"), yer("GHTEM", "TEMA", varis), gemi, sefer)],
  receiptTypeAtOrigin: "CY", deliveryTypeAtDestination: "CY",
  cutOffTimes: cutoff, solutionNumber: cozum, transitTime: 26,
});

test("direkt sefer: gemi vessel.name'den, servis, sefer, terminal, cut-off'lar", () => {
  const x = seferNormalle(direkt("2026-12-05T22:00:00+03:00", "2026-12-31T20:00:00Z", "KURGU YILDIZ", "2649S"))!;
  assert.equal(x.gemi, "KURGU YILDIZ");
  assert.equal(x.sefer, "2649S");
  assert.equal(x.servis, "KURGU SERVIS");
  assert.equal(x.servis_kodu, "KRG");
  assert.equal(x.pol, "TRIST");
  assert.equal(x.pod, "GHTEM");
  assert.equal(x.terminal, "KUMLI");
  assert.equal(x.transit_gun, 26);
  assert.deepEqual(x.aktarmalar, []);
  assert.equal(x.cutoff.dokuman, "2026-12-02T15:00:00+03:00");
  assert.equal(x.cutoff.vgm, "2026-12-03T12:00:00+03:00");
  assert.equal(x.cutoff.konteyner, "2026-12-03T10:00:00+03:00");
  assert.equal(x.cutoff.reefer, null);
});

test("aktarmali sefer: ana gemi ilk bacak, aktarma limani sirayla; bacaklar sira numarasina gore", () => {
  const p = {
    placeOfReceipt: yer("TRIST", "ISTANBUL", "2026-12-01T08:00:00+03:00"),
    placeOfDelivery: yer("KEMBA", "MOMBASA", "2027-01-02T06:00:00Z"),
    legs: [
      bacak(2, yer("EGPSD", "PORT SAID", "2026-12-08T10:00:00Z"), yer("KEMBA", "MOMBASA", "2027-01-02T06:00:00Z"), "KURGU IKI", "202E", "DOGU AFRIKA", "EAX"),
      bacak(1, yer("TRIST", "ISTANBUL", "2026-12-01T08:00:00+03:00"), yer("EGPSD", "PORT SAID", "2026-12-05T10:00:00Z"), "KURGU BIR", "101S"),
    ],
    cutOffTimes: [], transitTime: 32,
  };
  const x = seferNormalle(p)!;
  assert.equal(x.gemi, "KURGU BIR");
  assert.equal(x.sefer, "101S");
  assert.deepEqual(x.aktarmalar, [{ kod: "EGPSD", ad: "PORT SAID" }]);
  assert.deepEqual(x.bacaklar.map((b) => b.gemi), ["KURGU BIR", "KURGU IKI"]);
  assert.equal(x.cutoff.dokuman, null);
});

test("liste: kalkisa gore sirali, ayni sefer tek, tarihsiz rota atlanir, dizi degilse bos", () => {
  const liste = seferleriNormalle([
    direkt("2026-12-12T08:00:00+03:00", "2027-01-07T20:00:00Z", "KURGU UC", "2651S"),
    direkt("2026-12-05T22:00:00+03:00", "2026-12-31T20:00:00Z", "KURGU YILDIZ", "2649S"),
    direkt("2026-12-05T22:00:00+03:00", "2026-12-31T20:00:00Z", "KURGU YILDIZ", "2649S"),
    { placeOfReceipt: {}, placeOfDelivery: {}, legs: [] },
  ]);
  assert.deepEqual(liste.map((x) => x.gemi), ["KURGU YILDIZ", "KURGU UC"]);
  assert.deepEqual(seferleriNormalle({ errors: [] }), []);
  assert.deepEqual(seferleriNormalle(null), []);
});

test("transitTime yoksa tarihlerden hesaplanir; eski alan adlari (vesselName) da okunur", () => {
  const p = direkt("2026-12-01T00:00:00Z", "2026-12-21T00:00:00Z", "X", "1") as Record<string, unknown>;
  delete p.transitTime;
  const legs = p.legs as { transport: { vessel: Record<string, unknown> } }[];
  legs[0].transport.vessel = { vesselName: "ESKI AD" };
  const x = seferNormalle(p)!;
  assert.equal(x.transit_gun, 20);
  assert.equal(x.gemi, "ESKI AD");
});

test("Hapag hata metinleri", () => {
  assert.match(hapagHataMetni(429, null), /yoğun/);
  const yok = { errors: [{ property: "request.placeOfReceipt", errorCode: 8001, errorCodeText: "Requested departure location for given locode TRXXX not found." }] };
  assert.match(hapagHataMetni(400, yok), /çıkış limanı/);
  const yok2 = { errors: [{ property: "request.placeOfDelivery", errorCode: 8001, errorCodeText: "not found" }] };
  assert.match(hapagHataMetni(400, yok2), /varış limanı/);
  assert.match(hapagHataMetni(503, "x"), /HTTP 503/);
});

// ---- Sefer Ara gorunum + liman kodlari (lib/hat-takip/sefer-gorunum.ts, lib/hat-takip/limanlar.ts) ----
import { aktarmaYazisi, basHarf, cutoffGecti, kisaZaman, tarihYaz, varsayilanSecim, yerelTarih } from "@/lib/hat-takip/sefer-gorunum";
import { CIKIS_LIMANLARI, LIMAN_KODU_DESENI, VARIS_KODLARI, limanAdi, limanKoduBul, sistemVarisLimanlari } from "@/lib/hat-takip/limanlar";

test("tarih limanin yerel saatiyle (ofset cevrilmez): +03:00 ve Z", () => {
  assert.equal(tarihYaz("2026-12-05T22:00:00+03:00", "en", true), "Sat, 05 Dec 2026");
  assert.equal(tarihYaz("2026-12-31T20:00:00Z", "en"), "31 Dec 2026");
  assert.equal(tarihYaz("2026-12-05T22:00:00+03:00", "tr", true), "Cmt, 05 Ara 2026");
  assert.equal(kisaZaman("2026-12-02T15:00:00+03:00"), "02.12 15:00");
  assert.equal(yerelTarih("2026-12-05T22:00:00+03:00")!.saat, "22:00");
  assert.equal(tarihYaz(null), "—");
  assert.equal(kisaZaman("bozuk"), "—");
});

test("cut-off gecti / varsayilan secim: gecenler gorsele girmez", () => {
  const simdi = Date.parse("2026-11-28T12:00:00+03:00");
  const gecmis = seferNormalle(direkt("2026-11-28T08:00:00+03:00", "2026-12-24T20:00:00Z", "A", "1"))!;
  gecmis.cutoff.dokuman = "2026-11-25T15:00:00+03:00";
  const gelecek = seferNormalle(direkt("2026-12-05T22:00:00+03:00", "2026-12-31T20:00:00Z", "B", "2"))!;
  assert.equal(cutoffGecti(gecmis, simdi), true);
  assert.equal(cutoffGecti(gelecek, simdi), false);
  assert.deepEqual(varsayilanSecim([gecmis, gelecek], 6, simdi), [gelecek.anahtar]);
});

test("aktarma yazisi ve bas harf", () => {
  const d = seferNormalle(direkt("2026-12-05T22:00:00+03:00", "2026-12-31T20:00:00Z", "B", "2"))!;
  assert.equal(aktarmaYazisi(d, "en"), "Direct");
  assert.equal(aktarmaYazisi(d, "tr"), "Direkt");
  const a = { ...d, aktarmalar: [{ kod: "EGPSD", ad: "PORT SAID" }, { kod: "MAPTM", ad: null }] };
  assert.equal(aktarmaYazisi(a, "en"), "via Port Said, MAPTM");
  assert.equal(basHarf("DAR ES SALAAM"), "Dar Es Salaam");
});

test("liman kodlari: sistemdeki serbest adlar eslesir, kodlar UN/LOCODE bicimli", () => {
  assert.equal(limanKoduBul("DJIBOUTI PORT, DJIBOUTI")?.kod, "DJJIB");
  assert.equal(limanKoduBul("TEMA PORT, GHANA")?.kod, "GHTEM");
  assert.equal(limanKoduBul("SİNGAPUR")?.kod, "SGSIN");
  assert.equal(limanKoduBul("DAR SALAAM PORT")?.kod, "TZDAR");
  assert.equal(limanKoduBul("EXWORKS UNEX FACTORY"), null);
  for (const l of [...CIKIS_LIMANLARI, ...Object.values(VARIS_KODLARI)]) assert.match(l.kod, LIMAN_KODU_DESENI, l.ad);
  assert.equal(limanAdi("TRIST")?.ulke, "Türkiye");
  const s = sistemVarisLimanlari([{ varis_limani: "DJIBOUTI PORT" }, { varis_limani: "DJIBOUTI PORT, DJIBOUTI" }, { varis_limani: "TEMA PORT" }, { varis_limani: "BILINMEYEN YER" }, { varis_limani: null }]);
  assert.deepEqual(s.secenekler.map((x) => [x.kod, x.adet]), [["DJJIB", 2], ["GHTEM", 1]]);
  assert.deepEqual(s.eslesmeyen, ["BILINMEYEN YER"]);
});
