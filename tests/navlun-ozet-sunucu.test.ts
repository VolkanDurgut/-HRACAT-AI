/**
 * Navlun Bildirimi sayfasi - sunucu degerlendirmesiyle liman ozeti (24.11.2026, mimari onarim). Sayfa konteyner basi
 * maliyeti sunucudan okur: suresi dolan teklif "en iyi" secilmez, EUR teklif kurla USD toplamiyla siralanir, degerlendirmesi
 * olmayan satir eski yoldan hesaplanir. Veriler KURGUDUR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { limanOzetleri, sunucuKarsilastirmasi, type NavlunSatiri, type SunucuDegerlendirmesi } from "@/lib/navlun/ozet";
import { limanSohbeti, masaAcenteleri } from "@/lib/navlun/harita";

const deg = (toplam: number, x: Partial<SunucuDegerlendirmesi> = {}): SunucuDegerlendirmesi => ({
  toplam_usd: toplam, lokal: 0, ek: 0, lokal_durum: "dahil", metin: "lokal dahil", dayanak: "Teklif metninde yazıyor.", celiski: null, yaklasik: false,
  durum: "kesin", en_iyi: false, gecerlilik_bitis: "2026-12-31", ...x,
});
const satir = (id: string, acente: string, tutar: number, tarih: string, d: SunucuDegerlendirmesi | null, x: Partial<NavlunSatiri> = {}): NavlunSatiri => ({
  id, degerlendirme: d, mesaj_id: `m-${id}`, tur: "teklif", liman: "ORNEKLIMAN", liman_anahtar: "ORNEKLIMAN", acente, armator: null, tutar, para_birimi: "USD",
  ekipman: "20DC", free_time_gun: null, transit_gun: null, gecerlilik: null, lokal_dahil: true, kaynak: "metin", tarih, ...x,
});

test("suresi dolan ucuz teklif en iyi secilmez, listede en sonda kalir", () => {
  const [l] = limanOzetleri([
    satir("a", "ALFA", 675, "2026-10-12T10:00:00Z", deg(675, { durum: "suresi_doldu", gecerlilik_bitis: "2026-10-31" })),
    satir("b", "BETA", 1340, "2026-11-20T10:00:00Z", deg(1340)),
  ]);
  assert.equal(l.enIyi20?.acente, "BETA");
  assert.equal(l.belirsiz20, null);
  assert.deepEqual(l.fiyatlar.map((f) => [f.acente, !!f.suresiDoldu]), [["BETA", false], ["ALFA", true]]);
  assert.equal(l.fiyatlar[1].gecerlilikBitis, "2026-10-31");
  // Masa: suresi dolan acente kesin sayilmaz
  const masa = masaAcenteleri(l, limanSohbeti([satir("a", "ALFA", 675, "2026-10-12T10:00:00Z", null), satir("b", "BETA", 1340, "2026-11-20T10:00:00Z", null)], "ORNEKLIMAN", null));
  assert.equal(masa.find((m) => m.acente === "ALFA")?.kesin, false);
  assert.match(masa.find((m) => m.acente === "ALFA")?.metin || "", /süresi doldu/);
});

test("EUR teklif sunucunun USD toplamiyla siralanir (≈); sohbet balonu USD gosterir", () => {
  const eur = satir("e", "ALFA", 2865, "2026-11-23T10:00:00Z", deg(3130.3, { yaklasik: true, metin: "2.865 EUR (≈ 3.130,3 USD) = ≈ 3.130,3" }), { para_birimi: "EUR" });
  const usd = satir("u", "BETA", 2900, "2026-11-22T10:00:00Z", deg(2900));
  const [l] = limanOzetleri([eur, usd]);
  assert.equal(l.enIyi20?.acente, "BETA");
  const f = l.fiyatlar.find((x) => x.acente === "ALFA")!;
  assert.equal(f.para, "EUR");
  assert.equal(f.karsi.toplam, 3130.3);
  assert.equal(f.karsi.yaklasik, true);
  const balon = limanSohbeti([eur], "ORNEKLIMAN", null)[0];
  assert.match(balon.tutar || "", /^≈ 3\.130,3 \$/);
});

test("sunucuKarsilastirmasi: lokal kesinligi ve kaynak; degerlendirmesi olmayan satir eski yoldan", () => {
  const h = sunucuKarsilastirmasi(340, deg(696, { lokal_durum: "haric", lokal: 356, dayanak: "Acente hafızası: kurgu", metin: "340 + lokal 356 = 696" }));
  assert.equal(h.kesin, true); assert.equal(h.kaynak, "hafiza"); assert.equal(h.toplam, 696);
  const b = sunucuKarsilastirmasi(700, deg(700, { lokal_durum: "bilinmiyor", lokal: null, durum: "eksik", dayanak: "Teklifte lokal yazmıyor", metin: "lokal belirsiz" }));
  assert.equal(b.kesin, false); assert.equal(b.kaynak, "yok");
  const c = sunucuKarsilastirmasi(900, deg(1200, { lokal_durum: "haric", lokal: 300, celiski: "Maildeki lokal 300 ≠ acente hafızası 250", durum: "kontrol" }));
  assert.equal(c.kesin, false);
  // Degerlendirmesi olmayan (yeni) teklif: mail "lokal dahil" diyorsa tarayici hesabiyla kesin
  const [l] = limanOzetleri([satir("y", "GAMA", 1500, "2026-11-24T10:00:00Z", null)]);
  assert.equal(l.enIyi20?.acente, "GAMA");
  assert.equal(l.enIyi20?.karsi.toplam, 1500);
});

test("gecerli teklifi kalmayan liman: suresi dolan en iyi teklif gri bilgi olarak doner, en iyi / haritada fiyat sayilmaz", async () => {
  const { navlunNoktalari } = await import("@/lib/navlun/harita");
  const [l] = limanOzetleri([satir("a", "ALFA", 290, "2026-11-02T10:00:00Z", deg(290, { durum: "suresi_doldu", gecerlilik_bitis: "2026-11-23" }))]);
  assert.equal(l.enIyi20, null);
  assert.equal(l.belirsiz20, null);
  assert.equal(l.dolan20?.acente, "ALFA");
  assert.equal(l.dolan20?.gecerlilikBitis, "2026-11-23");
  const [n] = navlunNoktalari([l], [], null);
  assert.equal(n.enIyi, null);
  assert.equal(n.durum, "fiyatsiz");
  assert.deepEqual(n.dolan, { tutar: 290, acente: "ALFA", bitis: "2026-11-23" });
  // Gecerli teklif varsa suresi dolan gosterilmez
  const [l2] = limanOzetleri([
    satir("a", "ALFA", 290, "2026-11-02T10:00:00Z", deg(290, { durum: "suresi_doldu", gecerlilik_bitis: "2026-11-23" })),
    satir("b", "BETA", 400, "2026-11-20T10:00:00Z", deg(400)),
  ]);
  assert.equal(l2.enIyi20?.acente, "BETA");
  assert.equal(l2.dolan20, null);
});
