/**
 * Kontrol Merkezi sevkiyat haritasi (16.11.2026): "su an sevkiyati olan" liman + cikis limanlari. Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ETA_YOKSA_GUN, TRANSIT_PAYI, limanAktiflikleri, limanTransitGunleri, planSevkiyatlari, sevkiyatDurumu } from "@/lib/sevkiyat-aktif";
import { cikisMerkezi, limanKonumu } from "@/lib/liman-koordinat";
import { HARITA_ES_ADLARI } from "@/lib/navlun/harita";
import { denizRotasi } from "@/lib/deniz-rotasi";

const BUGUN = "2026-11-16";
const rez = (etd: string | null, eta: string | null, adet = 5) => ({ gemi_kalkis_tarihi: etd, eta, konteyner_adedi: adet });

test("sevkiyat durumu: kapali dosya da denizdeyse YOLDA; ETA gectiyse tamamlandi; ileri ETD / acik dosya YUKLEMEDE", () => {
  assert.equal(sevkiyatDurumu({ kapali: true, konteyner: 5, rezervasyonlar: [rez("2026-11-01", "2026-11-20")] }, BUGUN), "yolda");
  assert.equal(sevkiyatDurumu({ kapali: true, konteyner: 5, rezervasyonlar: [rez("2026-10-01", "2026-11-10")] }, BUGUN), "tamamlandi");
  assert.equal(sevkiyatDurumu({ kapali: true, konteyner: 5, rezervasyonlar: [rez("2026-11-07", null)] }, BUGUN), "yolda", "ETA yok, 45 gunden yeni kalkis");
  assert.equal(sevkiyatDurumu({ kapali: true, konteyner: 5, rezervasyonlar: [rez("2026-09-01", null)] }, BUGUN), "tamamlandi");
  assert.equal(sevkiyatDurumu({ kapali: false, konteyner: 5, rezervasyonlar: [rez("2026-11-20", null)] }, BUGUN), "yuklemede");
  assert.equal(sevkiyatDurumu({ kapali: false, konteyner: 0, rezervasyonlar: [] }, BUGUN), "yuklemede");
  assert.equal(sevkiyatDurumu({ kapali: true, konteyner: 5, rezervasyonlar: [rez("2026-11-16", "2026-11-16")] }, BUGUN), "yolda", "bugun varan hala yolda");
});

test("liman aktiflikleri: tamamlanan liman yok; konteyner ve en yakin tarih", () => {
  const d = [
    { id: "a", liman: "ORNEKPORT", kapali: true, konteyner: 3, rezervasyonlar: [rez("2026-11-01", "2026-11-25")] },
    { id: "b", liman: "ORNEKPORT", kapali: false, konteyner: 5, rezervasyonlar: [rez("2026-11-20", null)] },
    { id: "c", liman: "ESKIPORT", kapali: true, konteyner: 4, rezervasyonlar: [rez("2026-09-01", "2026-10-01")] },
  ];
  const m = limanAktiflikleri(d, (x) => x.liman, BUGUN);
  assert.equal(m.has("ESKIPORT"), false);
  assert.deepEqual(m.get("ORNEKPORT"), { yoldaKonteyner: 3, yoldaDosya: 1, yuklemedeKonteyner: 5, yuklemedeDosya: 1, enYakinEta: "2026-11-25", enYakinEtd: "2026-11-20" });
});

test("cikis limanlari: Asyaport Tekirdag'dan, Ambarli terminalleri (Mardas dahil) Istanbul'dan; Tekirdag rotasi Canakkale'den", () => {
  assert.equal(cikisMerkezi("ASYAPORT")?.ad, "Tekirdağ");
  for (const t of ["MARPORT", "KUMPORT", "MARDAŞ", "Ambarlı Port"]) assert.equal(cikisMerkezi(t)?.ad, "İstanbul", t);
  const r = denizRotasi("Tekirdağ", [40.9, 27.47], "DJIBOUTI", [11.6, 43.14]);
  assert.ok(r);
  assert.deepEqual(r!.gecisler, ["Çanakkale Boğazı", "Süveyş Kanalı", "Bab-el Mandeb"]);
});

// 17.11.2026 (kullanici: "Butun limanlar gozukmeli"): yukleme plani + Turkce yazimlar + limana gore transit
test("yukleme plani: dosyaya bagli satir (dosya / rezervasyon / ayni booking) atlanir; ETD'siz satir aktif sayilmaz", () => {
  const dosyalar = [{ id: "d1", rezervasyonlar: [{ id: "r1", booking_no: "BK 001" }] }];
  const plan = [
    { id: "p1", booking_no: "BK001", varis_limani: "ORNEKPORT", etd: "2026-11-20", konteyner: 4, dosya_id: null, rezervasyon_id: null },
    { id: "p2", booking_no: "BK002", varis_limani: "ORNEKPORT", etd: "2026-11-20", konteyner: 4, dosya_id: "d1", rezervasyon_id: null },
    { id: "p3", booking_no: "BK003", varis_limani: "ORNEKPORT", etd: "2026-11-20", konteyner: 4, dosya_id: null, rezervasyon_id: "r1" },
    { id: "p4", booking_no: "BK004", varis_limani: "YENIPORT", etd: "2026-11-24", konteyner: 2, dosya_id: null, rezervasyon_id: null, liman: "MARPORT" },
    { id: "p5", booking_no: "BK005", varis_limani: "ESKIPORT", etd: null, konteyner: 10, dosya_id: null, rezervasyon_id: null },
  ];
  const p = planSevkiyatlari(plan, dosyalar);
  assert.deepEqual(p.map((x) => x.id), ["p4", "p5"]);
  assert.equal(p[0].yukleme, "MARPORT");
  assert.equal(sevkiyatDurumu(p[0], BUGUN), "yuklemede");
  assert.equal(sevkiyatDurumu(p[1], BUGUN), "tamamlandi", "tarihsiz eski satir limani yesil yapmaz");
  const m = limanAktiflikleri(p, (x) => x.varis_limani, BUGUN);
  assert.deepEqual(Array.from(m.keys()), ["YENIPORT"]);
});

test("ETA'siz sevkiyat: limanin gercek transit ortalamasi (+pay) ile; olcum yoksa varsayilan", () => {
  const d = [
    { liman: "UZAKPORT", rezervasyonlar: [rez("2026-08-01", "2026-10-05"), rez("2026-08-10", "2026-10-10")] }, // 65 ve 61 gun
    { liman: "UZAKPORT", rezervasyonlar: [rez("2026-08-01", "2027-08-01")] },                                // 365: sayilmaz
  ];
  const t = limanTransitGunleri(d, (x) => x.liman);
  assert.equal(t.get("UZAKPORT"), 63 + TRANSIT_PAYI);
  const yeni = { kapali: true, konteyner: 2, rezervasyonlar: [rez("2026-09-25", null)] }; // 52 gun once kalkti
  assert.equal(sevkiyatDurumu(yeni, BUGUN), "tamamlandi", `varsayilan ${ETA_YOKSA_GUN} gun`);
  assert.equal(sevkiyatDurumu(yeni, BUGUN, t.get("UZAKPORT")), "yolda", "uzak limanda hala denizde");
});

test("harita konumu: plan Turkce yazimlari dosyalarla ayni noktada; Paramaribo tanimli", () => {
  assert.equal(limanKonumu("BEYRUT")?.anahtar, "BEIRUT");
  assert.equal(limanKonumu("DAR ES SELAM")?.anahtar, "DAR ES SALAAM");
  assert.equal(limanKonumu("MALDIVES")?.anahtar, "MALE");
  assert.equal(limanKonumu("PARAMARIBO")?.yaklasik, false);
  assert.equal(HARITA_ES_ADLARI.BEYRUT, "BEIRUT", "navlun haritasi ayni tabloyu kullanir");
});
