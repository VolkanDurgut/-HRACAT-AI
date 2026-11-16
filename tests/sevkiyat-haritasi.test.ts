/**
 * Kontrol Merkezi sevkiyat haritasi (16.11.2026): "su an sevkiyati olan" liman + cikis limanlari. Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { limanAktiflikleri, sevkiyatDurumu } from "@/lib/sevkiyat-aktif";
import { cikisMerkezi } from "@/lib/liman-koordinat";
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
