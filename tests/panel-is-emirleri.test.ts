/**
 * Ana Panel is emirleri (22.11.2026): panel_is_emirleri cevabinin hazirlanmasi, siralama, aciliyet, aksiyon.
 * Veriler KURGUSALDIR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gunKaldi, isEmirleriHazirla, isEmriAciliyeti, isEmriNormalle } from "@/lib/panel/is-emirleri";

const SIMDI = Date.parse("2026-11-22T19:00:00Z"); // Istanbul 22.11.2026 22:00

const rez = (bk: string, pf: string | null, tc: string | null, etd: string, ek: Record<string, unknown> = {}) =>
  ({ tur: "rezervasyonlu", anahtar: `excel:${bk}`, musteri: "DEMO", proforma_no: pf, booking_no: bk, konteyner: 2, talimat_cutoff: tc, etd, ...ek });
const oo = (pf: string, tarih: string | null, ek: Record<string, unknown> = {}) =>
  ({ tur: "on_odeme", anahtar: `siparis:${pf}`, musteri: "ORNEK", proforma_no: pf, konteyner: 2, on_odeme_tarihi: tarih, ...ek });

test("hazirla: rezervasyonlu en yakin talimat cut-off ustte (yoksa ETD); on odeme en eski ustte", () => {
  const h = isEmirleriHazirla({
    satirlar: [
      rez("DEMOBK3", "DEMOOMG091126", null, "2027-01-07"),
      rez("DEMOBK1", "DEMOCME230926", "2026-11-26T10:00:00+00:00", "2026-11-29"),
      rez("DEMOBK2", "DEMOSIM061126", "2026-11-23T15:00:00+00:00", "2026-11-29"),
      oo("DEMOGTI161126", "2026-11-18"), oo("DEMOCSK041126", "2026-11-10"), oo("DEMOCMP031126-1", null),
      { tur: "bilinmeyen", anahtar: "x" }, { tur: "on_odeme" },
    ],
    aksiyonlar: [
      { proforma_no: "DEMOSIM061126", proforma_id: "p-1", dosya: null, ana_siparis: null },
      { proforma_no: "DEMOCME230926", proforma_id: null, dosya: null, ana_siparis: { id: "a-1", proforma_no: "DEMOCME230926" } },
      { proforma_no: "DEMOGTI161126", proforma_id: "p-2", dosya: { id: "f-1", dosya_no: "IHR-DEMO-1" }, ana_siparis: null },
    ],
  });
  assert.deepEqual(h.rezervasyonlu.map((s) => s.booking_no), ["DEMOBK2", "DEMOBK1", "DEMOBK3"]);
  assert.deepEqual(h.onOdeme.map((s) => s.proforma_no), ["DEMOCSK041126", "DEMOGTI161126", "DEMOCMP031126-1"]);
  assert.deepEqual(h.rezervasyonlu.map((s) => s.aksiyon.tur), ["dosya_ac", "sevkiyat", "proforma_yukle"]);
  // 22.11.2026: rezervasyonlu "Dosya ac" booking ve konteyner sayisini tasir (lib/siparis-devam.ts bookingKarari)
  assert.equal(h.rezervasyonlu[0].aksiyon.href, "/yeni-dosya?proforma=p-1&otomatik=1&booking=DEMOBK2&fcl=2");
  assert.equal(h.rezervasyonlu[1].aksiyon.href, "/ihracatlar?siparis=DEMOCME230926&booking=DEMOBK1&fcl=2");
  assert.equal(h.onOdeme[1].aksiyon.href, "/dosya/f-1?tab=rezervasyon&action=new");
});

test("hazirla: bos / bozuk cevap bos liste", () => {
  assert.deepEqual(isEmirleriHazirla(null), { rezervasyonlu: [], onOdeme: [] });
  assert.deepEqual(isEmirleriHazirla({ satirlar: "x", aksiyonlar: 5 }), { rezervasyonlu: [], onOdeme: [] });
  assert.equal(isEmriNormalle({ tur: "rezervasyonlu", anahtar: "a", konteyner: "3", musteri: "  " })?.konteyner, 3);
  assert.equal(isEmriNormalle({ tur: "rezervasyonlu", anahtar: "a", musteri: "  " })?.musteri, null);
});

test("gun farki Istanbul takvim gunune gore; aciliyet talimat cut-off (yoksa ETD)", () => {
  assert.equal(gunKaldi("2026-11-23T15:00:00+00:00", SIMDI), 1);
  assert.equal(gunKaldi("2026-11-22T22:30:00+00:00", SIMDI), 1, "UTC 22:30 = Istanbul ertesi gun 01:30");
  assert.equal(gunKaldi("2026-11-18", SIMDI), -4);
  assert.equal(gunKaldi(null, SIMDI), null);
  assert.equal(isEmriAciliyeti({ talimat_cutoff: "2026-11-23T15:00:00+00:00", etd: "2026-11-29" }, SIMDI), "yakin");
  assert.equal(isEmriAciliyeti({ talimat_cutoff: "2026-11-26T10:00:00+00:00", etd: "2026-11-29" }, SIMDI), "normal");
  assert.equal(isEmriAciliyeti({ talimat_cutoff: "2026-11-20T10:00:00+00:00", etd: "2026-11-29" }, SIMDI), "gecti");
  assert.equal(isEmriAciliyeti({ talimat_cutoff: null, etd: "2026-11-24" }, SIMDI), "yakin");
  assert.equal(isEmriAciliyeti({ talimat_cutoff: null, etd: null }, SIMDI), "normal");
});
