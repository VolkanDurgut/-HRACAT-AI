/**
 * Pazar musteri siparis ritmi (23.11.2026): dalga, ortanca aralik, tedarik, beklenen siparis, durum, yolda / yuklemede.
 * Veriler KURGUSALDIR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dalgalar, musteriRitmi, ritimSiralamasi, sevkiyatVerisiHazirla, transitHaritasi, type SevkiyatVerisi,
} from "@/lib/pazar/siparis-ritmi";

const s = (firma: string, etd: string, konteyner = 2, ek: Record<string, unknown> = {}) =>
  ({ firma_id: firma, etd, konteyner, booking: `BK-${etd}`, varis: "DEMOPORT", kaynak: "plan", eta: null, kapali: true, ...ek });

const veri = (sevkiyatlar: unknown[], ek: Partial<SevkiyatVerisi> = {}) =>
  ({ ...sevkiyatVerisiHazirla({ sevkiyatlar, tedarik: [], tedarik_genel: 31, eslesmeyen: [] }), ...ek });

test("dalga: 7 gun icindeki booking'ler tek mal istegi (zincirleme), konteyner toplanir", () => {
  const d = dalgalar([{ etd: "2026-01-10", konteyner: 2 }, { etd: "2026-01-15", konteyner: 3 }, { etd: "2026-01-21", konteyner: 1 }, { etd: "2026-02-10", konteyner: 4 }]);
  assert.deepEqual(d.map((x) => [x.bas, x.son, x.konteyner, x.booking]), [["2026-01-10", "2026-01-21", 6, 3], ["2026-02-10", "2026-02-10", 4, 1]]);
});

test("ritim: ortanca aralik, beklenen ETD ve siparis; tek uc aralik kaydirmaz", () => {
  // Araliklar: 20, 20, 90, 20 -> ortanca 20
  const v = veri([s("A", "2026-07-01"), s("A", "2026-07-21"), s("A", "2026-08-10"), s("A", "2026-11-08"), s("A", "2026-11-28")]);
  const r = musteriRitmi("A", v, "2026-11-28");
  assert.equal(r.dalgalar.length, 5);
  assert.equal(r.ritimGun, 20);
  assert.equal(r.aralikMin, 20);
  assert.equal(r.aralikMax, 90);
  assert.equal(r.sonEtd, "2026-11-28");
  assert.equal(r.beklenenEtd, "2026-12-18");
  assert.equal(r.tedarikGun, 31);
  assert.equal(r.tedarikKaynak, "genel");
  assert.equal(r.beklenenSiparis, "2026-11-17");
  assert.equal(r.durum, "zamani_geldi");
  assert.equal(r.fark, 11);
});

test("durum: gecikti / zamani geldi / yaklasiyor / erken; tolerans = max(14, ritim/2)", () => {
  // 40 gunde bir, tedarik 10 (musteriye ozel): son 2026-09-30 -> beklenen ETD 11-09, siparis 10-30; tolerans 20
  const v = veri([s("B", "2026-07-12"), s("B", "2026-08-21"), s("B", "2026-09-30")], { tedarik: [{ firma_id: "B", gun: 10, n: 4 }] });
  assert.equal(musteriRitmi("B", v, "2026-10-10").durum, "erken");
  assert.equal(musteriRitmi("B", v, "2026-10-20").durum, "yaklasiyor");
  assert.equal(musteriRitmi("B", v, "2026-11-19").durum, "zamani_geldi", "fark 20 = tolerans");
  const g = musteriRitmi("B", v, "2026-11-23");
  assert.equal(g.durum, "gecikti");
  assert.equal(g.fark, 24);
  assert.equal(g.tedarikKaynak, "musteri");
});

test("veri az: 3'ten az dalga ritim hesaplanmaz; son sevkiyat yine verilir", () => {
  const r = musteriRitmi("C", veri([s("C", "2026-05-01"), s("C", "2026-05-04"), s("C", "2026-08-01")]), "2026-11-23");
  assert.equal(r.dalgalar.length, 2);
  assert.equal(r.durum, "veri_az");
  assert.equal(r.ritimGun, null);
  assert.equal(r.sonEtd, "2026-08-01");
  assert.equal(r.fark, null);
});

test("yolda / yuklemede: ETA varsa ETA; yoksa limanin olculen transiti; ileri ETD yuklemede; ritim yalniz gecmisten", () => {
  const v = veri([
    s("D", "2026-11-01", 3, { eta: "2026-12-01" }),          // yolda (ETA ileri)
    s("D", "2026-10-01", 2, { varis: "UZAKPORT" }),          // ETA yok: UZAKPORT transiti 30+7 -> 11-07 vardi
    s("D", "2026-11-10", 1, { varis: "UZAKPORT" }),          // 11-10 + 37 = 12-17 -> yolda
    s("D", "2026-12-05", 4),                                  // yuklemede
    s("X", "2026-09-01", 1, { varis: "UZAKPORT", eta: "2026-10-01" }), // olcum: 30 gun
  ]);
  const tr = transitHaritasi(v.sevkiyatlar);
  assert.equal(tr.get("UZAKPORT"), 37);
  const r = musteriRitmi("D", v, "2026-11-23", tr);
  assert.deepEqual(r.yolda.map((y) => [y.etd, y.varisTahmini]), [["2026-11-01", "2026-12-01"], ["2026-11-10", "2026-12-17"]]);
  assert.deepEqual(r.yuklemede.map((y) => y.etd), ["2026-12-05"]);
  assert.equal(r.sonEtd, "2026-11-10", "ileri tarihli booking ritme girmez");
});

test("hazirla: bozuk girdi atlanir; siralama gecikti > zamani geldi > yaklasiyor > erken > veri az", () => {
  const v = sevkiyatVerisiHazirla({ sevkiyatlar: [{ firma_id: "A" }, { etd: "2026-01-01" }, { firma_id: "A", etd: "2026-01-01T00:00:00", konteyner: "2" }], tedarik_genel: "x" });
  assert.equal(v.sevkiyatlar.length, 1);
  assert.equal(v.sevkiyatlar[0].etd, "2026-01-01");
  assert.equal(v.tedarik_genel, null);
  assert.deepEqual(sevkiyatVerisiHazirla(null).sevkiyatlar, []);
  const r = (durum: string, fark: number | null) => ({ durum, fark }) as never;
  const l = [r("veri_az", null), r("erken", -30), r("gecikti", 20), r("zamani_geldi", 3), r("gecikti", 60), r("yaklasiyor", -5)].sort(ritimSiralamasi);
  assert.deepEqual(l.map((x: { durum: string; fark: number | null }) => `${x.durum}:${x.fark}`), ["gecikti:60", "gecikti:20", "zamani_geldi:3", "yaklasiyor:-5", "erken:-30", "veri_az:null"]);
});
