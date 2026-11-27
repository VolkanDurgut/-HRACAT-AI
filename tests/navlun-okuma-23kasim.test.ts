/**
 * 23.11.2026 navlun denetimi (operasyonun elle tuttugu tablo <-> sistem). Bulunan okuma hatalari; veriler kurgusaldir.
 * - "Tt: 42 days Ft: 14 days": free time 42, transit bos yaziliyordu (sonraki alanin "Ft" etiketi onceki sayiya baglaniyordu)
 * - "TT:25-35 GUN FREE TIME: 9 DAYS": transit 25, free time 35 yaziliyordu
 */
import { test } from "node:test";
import assert from "node:assert/strict";

type Olay = { tur: string; tutar: number | null; free_time_gun: number | null; transit_gun: string | null };
const yukle = (ad: string) => import(new URL(`../supabase/functions/_shared/${ad}.ts`, import.meta.url).href);
const ACENTE = { "ornek-acente.test": "Ornek Acente" };
const oku = async (govde: string): Promise<Olay[]> =>
  (await yukle("navlun-oku")).navlunMesajOku({ konu: "RE: UNEX // ORNEKPORT // NAVLUN TALEBİ HK.", gonderen: "satis@ornek-acente.test", govde }, ACENTE);

test("'Tt: 42 days Ft: 14 days': transit 42, free time 14", async () => {
  const t = (await oku("Merhaba,\n\nAralık geçerlilik usd 2300 / 20 dc\n\nTt: 42 days\n\nFt: 14 days\n\nOrnek Kisi")).find((x) => x.tur === "teklif")!;
  assert.equal(t.tutar, 2300);
  assert.equal(t.free_time_gun, 14);
  assert.equal(t.transit_gun, "42");
});

test("'TT:25-35 GUN FREE TIME: 9 DAYS': transit 25-35, free time 9", async () => {
  const t = (await oku("Merhaba,\n\nNavlun usd 1985 / 20 dc olarak destek olabiliriz.\n\nHAT : MAERSK\nTT:25-35 GUN\nFREE TIME: 9 DAYS DET FREE")).find((x) => x.tutar !== null)!;
  assert.equal(t.tutar, 1985);
  assert.equal(t.free_time_gun, 9);
  assert.equal(t.transit_gun, "25-35");
});

test("tek satirda yazim da ayni: 'TT 28 days FT 14 days' ve '14 days ft' eskisi gibi", async () => {
  const { freeTimeBul, transitBul } = await yukle("navlun-oku");
  assert.equal(freeTimeBul("TT 28 days FT 14 days"), 14);
  assert.equal(transitBul("TT 28 days FT 14 days"), "28");
  assert.equal(freeTimeBul("Tt: 42 days Ft: 14 days"), 14);
  assert.equal(transitBul("Tt: 42 days Ft: 14 days"), "42");
  assert.equal(freeTimeBul("HAT : MAERSK TT:25-35 GUN FREE TIME: 9 DAYS DET FREE"), 9);
  assert.equal(transitBul("HAT : MAERSK TT:25-35 GUN FREE TIME: 9 DAYS DET FREE"), "25-35");
  // eski davranis korunur
  assert.equal(freeTimeBul("USD 1450, 14 days free"), 14);
  assert.equal(freeTimeBul("Navlun 900 USD, 21 gun ft"), 21);
  assert.equal(transitBul("14 free 28 gun tt"), "28");
});

test("Excel navlun tablosu: cikis lokali HARIC teklif '+lokal' stiliyle, dipnotla; lokal dahil / bilinmeyen eskisi gibi", async () => {
  const { navlunTablosuHesapla, navlunTablosuSayfasi } = await yukle("navlun-tablosu");
  const { XS, STIL_XML } = await yukle("xlsx-yaz");
  const o = (acente: string, tutar: number, lokal_dahil: boolean | null) => ({ tur: "teklif", liman: "ORNEKPORT", liman_anahtar: "ORNEKPORT", acente, armator: null,
    tutar, para_birimi: "USD", ekipman: "20DC", free_time_gun: 21, transit_gun: null, tarih: "2026-11-10T09:00:00Z", lokal_dahil });
  const t = navlunTablosuHesapla([o("Ornek Hat", 340, false), o("Diger Hat", 700, true), o("Ucuncu Hat", 800, null)], [], "2026-11-23");
  const s = navlunTablosuSayfasi(t);
  const satir = s.satirlar.find((r: { v: unknown }[]) => r?.[1]?.v === "ORNEKPORT")!;
  const hucre = (v: number) => satir.find((h: { v: unknown } | null) => h?.v === v);
  assert.ok([XS.navLokalHaricA, XS.navLokalHaricB].includes(hucre(340).s));
  assert.ok([XS.navTutarA, XS.navTutarB].includes(hucre(700).s));
  assert.ok([XS.navTutarA, XS.navTutarB].includes(hucre(800).s));
  assert.ok(s.satirlar.some((r: { v: unknown }[]) => String(r?.[1]?.v || "").includes("+lokal")));
  // stil tablosu kimliklerle ayni sayida
  // 27.11.2026: gemi raporu stilleri eklendi (30 -> 70); sayac, xf sayisi ve en buyuk XS kimligi birlikte tutmali
  const xfAdet = Object.values(XS).reduce((m, v) => Math.max(m, v), 0) + 1;
  assert.match(STIL_XML, new RegExp(`<cellXfs count="${xfAdet}">`));
  assert.equal((STIL_XML.match(/<cellXfs[\s\S]*<\/cellXfs>/)![0].match(/<xf /g) || []).length, xfAdet);
});
