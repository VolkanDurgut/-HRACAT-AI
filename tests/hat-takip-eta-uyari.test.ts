import { test } from "node:test";
import assert from "node:assert/strict";
import { etaFarkiOlanlar, etaUyarisi, GUNCEL_SAAT, hatEtaOtomatik, type HatEtaOzeti } from "@/lib/hat-takip/eta-uyari";

// Kurgusal veri (gercek booking / firma degil)
const SIMDI = Date.parse("2026-11-28T09:00:00Z");
const ozet = (p: Partial<HatEtaOzeti> = {}): HatEtaOzeti => ({
  rezervasyon_id: "r1", booking_no: "11111111", durum: "tamam", son_sorgu: "2026-11-28T08:45:00Z",
  hat_eta: "2026-12-05T14:00:00Z", hat_eta_sinif: "PLN", gemi: "KURGU YILDIZ", sefer: "001S",
  sistem_eta: "2026-12-05", dosya_id: "d1", dosya_no: "IHR-TEST-0001", alici_firma: "KURGU ALICI", ...p,
});

test("ayni gun: Hat ✓, uyari degil", () => {
  const u = etaUyarisi("2026-12-05", ozet(), SIMDI)!;
  assert.equal(u.seviye, "ayni");
  assert.equal(u.fark, 0);
  assert.equal(u.metin, "Hat ✓");
  assert.equal(u.guncel, true);
  assert.match(u.ipucu, /Planlanan/);
  assert.match(u.ipucu, /değiştirmez/);
});

test("Istanbul gunu: 23:30 UTC hat ETA'si ertesi gune duser", () => {
  const u = etaUyarisi("2026-12-05", ozet({ hat_eta: "2026-12-05T22:30:00Z" }), SIMDI)!;
  assert.equal(u.hatGun, "2026-12-06");
  assert.equal(u.fark, 1);
  assert.equal(u.seviye, "uyari");
  assert.equal(u.metin, "Hat 06.12 · +1 gün");
});

test("1-2 gun uyari, 3+ gun kritik; isaret hat - sistem", () => {
  assert.equal(etaUyarisi("2026-12-04", ozet(), SIMDI)!.seviye, "uyari");
  const k = etaUyarisi("2026-12-01", ozet(), SIMDI)!;
  assert.equal(k.seviye, "kritik");
  assert.equal(k.fark, 4);
  assert.equal(k.metin, "Hat 05.12 · +4 gün");
  const erken = etaUyarisi("2026-12-09", ozet(), SIMDI)!;
  assert.equal(erken.fark, -4);
  assert.equal(erken.metin, "Hat 05.12 · −4 gün");
});

test("sistemde ETA yok: notr rozet (oneri), uyari listesine girmez", () => {
  const u = etaUyarisi(null, ozet({ sistem_eta: null }), SIMDI)!;
  assert.equal(u.seviye, "yok");
  assert.equal(u.metin, "Hat 05.12");
  assert.match(u.ipucu, /Sistemde ETA girilmemiş/);
  assert.equal(etaFarkiOlanlar([ozet({ sistem_eta: null })], SIMDI).length, 0);
});

test("hat bilgisi yok / sorgu basarisiz: rozet yok", () => {
  assert.equal(etaUyarisi("2026-12-05", null, SIMDI), null);
  assert.equal(etaUyarisi("2026-12-05", ozet({ hat_eta: null }), SIMDI), null);
  assert.equal(etaUyarisi("2026-12-05", ozet({ durum: "bulunamadi" }), SIMDI), null);
  assert.equal(etaUyarisi("2026-12-05", ozet({ durum: "hata" }), SIMDI), null);
  assert.equal(etaUyarisi("2026-12-05", ozet({ durum: "bekliyor" }), SIMDI), null);
});

test("eski sorgu: guncel degil olarak isaretlenir", () => {
  const eski = new Date(SIMDI - (GUNCEL_SAAT + 1) * 3600_000).toISOString();
  const u = etaUyarisi("2026-12-01", ozet({ son_sorgu: eski }), SIMDI)!;
  assert.equal(u.guncel, false);
  assert.match(u.ipucu, /güncel değil/);
  assert.equal(etaUyarisi("2026-12-01", ozet({ son_sorgu: null }), SIMDI)!.guncel, false);
});

test("panel listesi: yalniz farkli olanlar; once kritik, sonra buyuk fark", () => {
  const liste = etaFarkiOlanlar([
    ozet({ rezervasyon_id: "a", dosya_no: "A", sistem_eta: "2026-12-05" }), // ayni
    ozet({ rezervasyon_id: "b", dosya_no: "B", sistem_eta: "2026-12-04" }), // +1 uyari
    ozet({ rezervasyon_id: "c", dosya_no: "C", sistem_eta: "2026-12-01" }), // +4 kritik
    ozet({ rezervasyon_id: "d", dosya_no: "D", sistem_eta: "2026-12-10" }), // -5 kritik
    ozet({ rezervasyon_id: "e", dosya_no: "E", sistem_eta: "2026-12-01", durum: "hata" }),
  ], SIMDI);
  assert.deepEqual(liste.map((x) => x.ozet.rezervasyon_id), ["d", "c", "b"]);
});

test("hatEtaOtomatik: aktif takip + tamam + hat ETA'si var + kapatilmamis (sunucu kurali ile ayni)", () => {
  assert.equal(hatEtaOtomatik(ozet()), true);
  assert.equal(hatEtaOtomatik(ozet({ eta_otomatik: true })), true);
  assert.equal(hatEtaOtomatik(ozet({ eta_otomatik: false })), false);
  assert.equal(hatEtaOtomatik(ozet({ durum: "hata" })), false);
  assert.equal(hatEtaOtomatik(ozet({ hat_eta: null })), false);
  assert.equal(hatEtaOtomatik(null), false);
  assert.match(etaUyarisi("2026-12-05", ozet(), SIMDI)!.ipucu, /otomatik güncellenir/);
  assert.match(etaUyarisi("2026-12-05", ozet({ eta_otomatik: false }), SIMDI)!.ipucu, /değiştirmez\.$/);
});
