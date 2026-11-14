/**
 * Karar ekrani "gecen haftaya gore" rozetleri (lib/satin-alma/karsilastir.ts) + kismi onay
 * yardimcilari (onayliMiktar / miktarDegisti). Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { haftaKarsilastir, oncekiListeler } from "@/lib/satin-alma/karsilastir";
import { miktarDegisti, onayliMiktar, onayliMiktarBirim, type SaKalem } from "@/supabase/functions/_shared/satin-alma";

let n = 0;
const kalem = (urun: string, miktar: number, birim: SaKalem["birim"] = "kg", ek: Partial<SaKalem> = {}): SaKalem => ({
  id: `k${++n}`, kategori: "mutfak", urun, miktar, birim, aciliyet: "normal", aciklama: null, talep_eden: "Test Kişi",
  karar: "onaylandi", red_nedeni: null, olusturma: "2026-11-01T00:00:00Z", ...ek,
});

test("rozetler: yeni / arttı / azaldı / birim / reddedildi / aynı / her hafta", () => {
  const h1 = { kalemler: [kalem("Patates", 20), kalem("Çay", 3), kalem("Süt", 10, "paket"), kalem("Zeytin", 2, "kg", { karar: "reddedildi", red_nedeni: "Stokta var" }), kalem("Peynir", 5, "kg", { onay_miktar: 2 }), kalem("Tuz", 2, "paket")] };
  const h2 = { kalemler: [kalem("patates", 20), kalem("Tuz", 2, "paket")] };
  const h3 = { kalemler: [kalem("PATATES", 15), kalem("Tuz", 2, "paket")] };
  const onceki = [h1, h2, h3];
  const r = (k: SaKalem) => haftaKarsilastir(k, onceki);
  assert.deepEqual(r(kalem("Domates", 3)), { tur: "yeni", metin: "Yeni", degisti: true });
  assert.equal(r(kalem("Çay", 5))?.tur, "artti");
  assert.match(r(kalem("Çay", 5))!.metin, /önceki 3 Kg/);
  assert.equal(r(kalem("Çay", 1))?.tur, "azaldi");
  assert.equal(r(kalem("Çay", 1))?.degisti, false);
  assert.equal(r(kalem("Süt", 10, "koli"))?.tur, "birim");
  assert.deepEqual(r(kalem("Zeytin", 2)), { tur: "red", metin: "Geçen sefer reddedildi: Stokta var", degisti: true });
  // Geçen hafta 5 istenmiş, 2 onaylanmıştı: karşılaştırma ONAYLANAN miktarla
  assert.equal(r(kalem("Peynir", 5))?.tur, "artti");
  assert.equal(r(kalem("Patates", 20))?.tur, "her_hafta");
  assert.equal(r(kalem("Çay", 3))?.tur, "ayni");
  assert.equal(haftaKarsilastir(kalem("Çay", 3), []), null, "ilk listede rozet yok");
});

test("aynı ürün farklı tedarikçi: önce ürün+tedarikçi eşleşir", () => {
  const onceki = [{ kalemler: [kalem("Patates", 5, "kg", { tedarikci: "TAKOZLAR" }), kalem("Patates", 20, "kg", { tedarikci: "CEM MARKET" })] }];
  assert.equal(haftaKarsilastir(kalem("Patates", 20, "kg", { tedarikci: "Cem Market" }), onceki)?.tur, "ayni");
  assert.equal(haftaKarsilastir(kalem("Patates", 20, "kg", { tedarikci: "TAKOZLAR" }), onceki)?.tur, "artti");
});

test("önceki listeler: aynı departman, sonuçlanan, daha önce gönderilmiş, test durumu aynı, en yenisi başta", () => {
  const l = (id: string, dep: string, durum: string, t: string, test = false) => ({ id, departman_id: dep, durum, gonderim_zamani: t, test, kalemler: [] as SaKalem[] });
  const bu = l("x", "d1", "bekliyor", "2026-11-14");
  const tum = [bu, l("a", "d1", "sonuclandi", "2026-11-07"), l("b", "d1", "sonuclandi", "2026-10-31"), l("c", "d2", "sonuclandi", "2026-11-10"),
    l("d", "d1", "bekliyor", "2026-11-01"), l("e", "d1", "sonuclandi", "2026-11-15"), l("f", "d1", "sonuclandi", "2026-11-08", true)];
  assert.deepEqual(oncekiListeler(bu, tum).map((x) => x.id), ["a", "b"]);
});

test("kısmi onay: onaylanan miktar", () => {
  const k = kalem("Çay", 5, "kg", { onay_miktar: "2.00" });
  assert.equal(Number(onayliMiktar(k)), 2);
  assert.equal(miktarDegisti(k), true);
  assert.equal(onayliMiktarBirim(k), "2 Kg");
  const d = kalem("Çay", 5);
  assert.equal(onayliMiktar(d), 5);
  assert.equal(miktarDegisti(d), false);
  assert.equal(miktarDegisti(kalem("Çay", 5, "kg", { onay_miktar: "5.00" })), false);
});
