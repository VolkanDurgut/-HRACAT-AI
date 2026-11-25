/**
 * Navlun (25.11.2026): (1) tablo disi "ad bir satirda, tutar alt satirda" kalem formu, (2) zorunlu B/L bedeli konteyner basi
 * toplama tam eklenir, (3) 17:00 maili / siparis raporu teklif tutarini sunucu degerlendirmesinden okur ve suresi dolan teklifi
 * en iyi saymaz (Navlun sayfasiyla ayni sayi). Veriler KURGUDUR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { kalemleriOku, kalemOzeti } from "@/supabase/functions/_shared/navlun-kalem";
import { karsilastir, type SunucuDegerlendirmesi } from "@/supabase/functions/_shared/navlun-karsilastirma";
import { degerlendirmeleriBagla, limanSatirlari, limanSonTeklifleri, navlunTablosuHesapla, type NavlunOlayi } from "@/supabase/functions/_shared/navlun-tablosu";

const FORM = [
  "POL (Yükleme Limanı)", "Ornekport", "POD (Tahliye Limanı)", "Kurguport",
  "Navlun (CY/CY)", "USD 95/20'GP", "B/L Bedeli", "USD 25", "Ödeme Şekli", "Prepaid", "Geçerlilik Tarihi", "30.11.2026",
  "Genel Şartlar ve Koşullar", "  *   Fiyatlarımıza fabrika dolum lokalleri dahildir.",
  "  *   Gemi kalkışından sonra B/L üzerinde yapılacak düzeltmeler için USD 100 / B/L manifesto düzeltme bedeli uygulanır.",
  "  *   Telex Release talep edilmesi halinde USD 50 + KDV / B/L ücret alınır.",
].join("\n");

test("tablo disi ad + alt satirda tutar: B/L bedeli okunur, navlun satiri kalem olmaz, kosullu B/L ucretleri toplama girmez", () => {
  const k = kalemleriOku(FORM);
  const bl = k.filter((x) => x.kod === "BL" && !x.kosullu);
  assert.equal(bl.length, 1);
  assert.equal(bl[0].tutar, 25);
  assert.equal(bl[0].birim, "bl");
  assert.ok(!k.some((x) => x.tutar === 95), "navlun satiri kalem sayilmamali");
  const o = kalemOzeti(k, "20DC");
  assert.equal(o.bl, 25);
  assert.equal(o.ek, 0);
});

test("aciklama satiri + tutar: kod kurali tutmayan ad kalem uretmez", () => {
  assert.deepEqual(kalemleriOku("Fiyatlarimiz asagidaki gibidir\nUSD 1500"), []);
});

test("zorunlu B/L bedeli konteyner basi toplama tam eklenir; kosullu ve SMDC eklenmez", () => {
  const k = kalemleriOku(FORM);
  const c = karsilastir({ acente: "KURGU HAT", tutar: 95, ekipman: "20DC", lokal_dahil: true, liman_anahtar: "KURGUPORT", kalemler: k }, null);
  assert.equal(c.toplam, 120);
  assert.equal(c.kesin, true);
  assert.match(c.metin, /B\/L 25 = 120/);
  const smdc = kalemleriOku("Navlun USD 2000\n35 USD/BL SMDC masraf\nKonsimento ucreti             USD  40,    (+) Kdv Beher set");
  assert.equal(kalemOzeti(smdc, "20DC").bl, 40);
  // B/L bedeli yoksa hesap degismez
  const d = karsilastir({ acente: "KURGU HAT", tutar: 100, ekipman: "20DC", lokal_dahil: true, liman_anahtar: "KURGUPORT", kalemler: [] }, null);
  assert.equal(d.toplam, 100);
  assert.equal(d.metin, "lokal dahil");
});

const deg = (toplam: number, x: Partial<SunucuDegerlendirmesi> = {}) => ({
  teklif_id: "", toplam_usd: toplam, lokal: 0, ek: 0, lokal_durum: "dahil", metin: "lokal dahil", dayanak: "Teklif metninde yazıyor.", celiski: null,
  yaklasik: false, durum: "kesin", en_iyi: false, gecerlilik_bitis: "2026-12-31", ...x,
});
const olay = (id: string, acente: string, tutar: number, tarih: string): NavlunOlayi => ({
  id, tur: "teklif", liman: "KURGUPORT", liman_anahtar: "KURGUPORT", acente, armator: null, tutar, para_birimi: "USD", ekipman: "20DC",
  free_time_gun: null, transit_gun: null, tarih, lokal_dahil: true,
});

test("rapor: tutar sunucu degerlendirmesinden (B/L dahil) okunur; suresi dolan teklif en iyi olmaz", () => {
  const olaylar = [olay("a", "ALFA", 95, "2026-11-11T10:00:00Z"), olay("b", "BETA", 100, "2026-11-11T11:00:00Z"), olay("c", "GAMA", 60, "2026-11-02T10:00:00Z")];
  degerlendirmeleriBagla(olaylar, [
    { ...deg(120, { metin: "95 + B/L 25 = 120" }), teklif_id: "a" },
    { ...deg(100), teklif_id: "b" },
    { ...deg(60, { durum: "suresi_doldu", gecerlilik_bitis: "2026-11-23" }), teklif_id: "c" },
  ]);
  const t = navlunTablosuHesapla(olaylar, [], "2026-11-25");
  const [s] = limanSatirlari(t);
  assert.equal(s.enIyi?.blok, "BETA");
  assert.equal(s.enIyi?.tutar, 100);
  assert.equal(s.eski, false);
  const l = limanSonTeklifleri(t, "KURGUPORT");
  assert.ok(!l.teklifler.some((x) => x.blok === "GAMA"), "suresi dolan teklif listede olmamali");
  assert.equal(l.teklifler.find((x) => x.enIyi)?.blok, "BETA");
  assert.equal(l.teklifler.find((x) => x.blok === "ALFA")?.toplam, 120);
});

test("rapor: degerlendirme yoksa eski yol aynen (geri uyum)", () => {
  const t = navlunTablosuHesapla([olay("a", "ALFA", 95, "2026-11-11T10:00:00Z"), olay("b", "BETA", 100, "2026-11-11T11:00:00Z")], [], "2026-11-25");
  const [s] = limanSatirlari(t);
  assert.equal(s.enIyi?.blok, "ALFA");
  assert.equal(s.enIyi?.tutar, 95);
});

test("rapor: gecerli teklif hic yoksa en son teklif 'eski' (gri) kalir", () => {
  const olaylar = [olay("c", "GAMA", 60, "2026-11-02T10:00:00Z")];
  degerlendirmeleriBagla(olaylar, [{ ...deg(60, { durum: "suresi_doldu" }), teklif_id: "c" }]);
  const [s] = limanSatirlari(navlunTablosuHesapla(olaylar, [], "2026-11-25"));
  assert.equal(s.eski, true);
  assert.equal(s.teklifSayisi, 0);
});
