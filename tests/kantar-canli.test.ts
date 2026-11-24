/** Kantar Paneli canli kantar bilgisi (24.11.2026). Veriler KURGUSALDIR. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { beklemeYazi, kantarCanliHazirla, kantarSaatYazi, sevkiyatKantarSayilari, sinyalDurumu, kantarDahil } from "@/lib/kantar-canli";

const HAM = {
  son_sinyal: "2026-11-24T07:24:39Z",
  iceride: [
    { kayit_no: 2682, plaka: "TEST01", firma: "KURGU A", urun: "UN", konteyner: "ABCU1234567", giris: "2026-11-23T18:16:35Z", bekleme_dk: 788, tartim1_kg: 15800, dosya_no: "IHR-K-0001", is_emri_no: null, alis_no: null },
    { kayit_no: "2685", plaka: "TEST02", firma: null, urun: null, konteyner: null, giris: "2026-11-24T06:51:06Z", bekleme_dk: "34", tartim1_kg: 14160 },
  ],
  konteynerler: [
    { konteyner_id: "k1", durum: "dolduruluyor", giris: "2026-11-23T18:16:35Z", cikis: null, plaka: "TEST01" },
    { konteyner_id: "k2", durum: "tartildi", giris: "2026-11-23T15:00:00Z", cikis: "2026-11-23T18:51:58Z", plaka: "TEST03" },
    { konteyner_id: "", durum: "tartildi" },
  ],
  is_emirleri: [{ is_emri_id: "e1", kg: 22120, arac: 1, son_cikis: "2026-11-23T15:50:49Z", plakalar: ["TEST04"] }],
  alislar: [{ alis_id: "a1", kg: 26220, arac: 1, son_cikis: null, plakalar: ["TEST05"] }],
  eslesmeyen: [{ kayit_no: 9, plaka: "TEST06", firma: "KURGU B", urun: "KEPEK", irsaliye_no: null, cikis: "2026-11-23T10:00:00Z", net_kg: 16120 }],
};

test("kantarCanliHazirla: alanlar normallenir, kimliksiz satir atilir", () => {
  assert.equal(kantarCanliHazirla(null), null);
  const v = kantarCanliHazirla(HAM)!;
  assert.equal(v.iceride.length, 2);
  assert.equal(v.iceride[1].kayit_no, 2685);
  assert.equal(v.iceride[1].bekleme_dk, 34);
  assert.equal(v.iceride[1].dosya_no, null);
  assert.equal(v.konteynerler.size, 2);
  assert.equal(v.konteynerler.get("k2")?.durum, "tartildi");
  assert.deepEqual(v.isEmirleri.get("e1"), { id: "e1", kg: 22120, arac: 1, son_cikis: "2026-11-23T15:50:49Z", plakalar: ["TEST04"] });
  assert.equal(v.alislar.get("a1")?.kg, 26220);
  assert.equal(v.eslesmeyen[0].net_kg, 16120);
  assert.deepEqual(kantarCanliHazirla({}), { sonSinyal: null, iceride: [], konteynerler: new Map(), isEmirleri: new Map(), alislar: new Map(), eslesmeyen: [] });
});

test("beklemeYazi", () => {
  assert.equal(beklemeYazi(null), "—");
  assert.equal(beklemeYazi(-1), "—");
  assert.equal(beklemeYazi(34), "34 dk");
  assert.equal(beklemeYazi(60), "1 sa");
  assert.equal(beklemeYazi(788), "13 sa 8 dk");
  assert.equal(beklemeYazi(24 * 60 + 190), "1 gün 3 sa");
});

test("sinyalDurumu: 5 dakikadan eski veri kopuk", () => {
  const simdi = new Date("2026-11-24T07:30:00Z");
  assert.deepEqual(sinyalDurumu("2026-11-24T07:28:30Z", simdi), { kopuk: false, dk: 1 });
  assert.deepEqual(sinyalDurumu("2026-11-24T07:20:00Z", simdi), { kopuk: true, dk: 10 });
  assert.deepEqual(sinyalDurumu(null, simdi), { kopuk: true, dk: null });
});

test("sevkiyatKantarSayilari", () => {
  const v = kantarCanliHazirla(HAM)!;
  assert.deepEqual(sevkiyatKantarSayilari(["k1", "k2", "k9"], v.konteynerler), { dolduruluyor: 1, tartildi: 1 });
  assert.deepEqual(sevkiyatKantarSayilari(["k1"], null), { dolduruluyor: 0, tartildi: 0 });
});

test("kantarSaatYazi: bugun / dun / tarih (Istanbul)", () => {
  const simdi = new Date("2026-11-24T07:30:00Z");
  assert.equal(kantarSaatYazi("2026-11-24T06:17:00Z", simdi), "bugün 09:17");
  assert.equal(kantarSaatYazi("2026-11-23T18:51:00Z", simdi), "dün 21:51");
  assert.equal(kantarSaatYazi("2026-11-20T11:05:00Z", simdi), "20.11 14:05");
  assert.equal(kantarSaatYazi(null, simdi), "—");
});

test("kantarDahil: irsaliyeli + kantarda tartilip irsaliyesi bekleyen (24.11.2026)", () => {
  assert.deepEqual(kantarDahil(236700, 15, { id: "x", kg: 24240, arac: 1, son_cikis: null, plakalar: ["00AA000"] }), { kg: 260940, arac: 16, kantarKg: 24240, kantarArac: 1 });
  assert.deepEqual(kantarDahil(1000, 2, null), { kg: 1000, arac: 2, kantarKg: 0, kantarArac: 0 });
  assert.deepEqual(kantarDahil(1000, 2, undefined), { kg: 1000, arac: 2, kantarKg: 0, kantarArac: 0 });
  // bozuk veri sayilmaz
  assert.deepEqual(kantarDahil(1000, 2, { id: "x", kg: Number.NaN, arac: 3, son_cikis: null, plakalar: [] }), { kg: 1000, arac: 2, kantarKg: 0, kantarArac: 0 });
});
