/**
 * Ic piyasa gunluk raporu: gunun araclari siparis basina TEK satir (14.11.2026, kullanici: "Tedarikci alis tek bir satir
 * gozuksun, plaka yerine arac sayisi, net yerine toplam net ve irsaliyeleri incele"). Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { icGunlukRaporHesapla, icGunlukRaporHtml, gelenSiparisSatirlari, yuklenenSiparisSatirlari } from "../supabase/functions/_shared/ic-gunluk-rapor.ts";

const U = (x: string) => `00000000-0000-0000-0000-${x.padStart(12, "0")}`;
const emir = { id: U("e1"), is_emri_no: "IE-1", durum: "acik", urun: "Kepek", ambalaj: null, teslim: null, hedef_tur: "kg", hedef_kg: 100000, hedef_arac: null, devir_kg: 0, kapanis_zamani: null, olusturma: "2026-01-01T00:00:00Z", musteri_id: U("m1"), musteri: "Musteri A", musteri_kisa: null };
const sevk = (id: string, kg: number, t: string, cikis: string | null) => ({ id: U(id), is_emri_id: U("e1"), plaka: "P", dorse_plaka: null, net_kg: kg, irsaliye_no: null, irsaliye_tarihi: t, olusturma: t, cikis_durumu: cikis, cikis_zamani: null, gecmis: false, irsaliye_dosya_yolu: id === "s2" ? null : "x" });
const alis = (id: string, no: string, ted: string) => ({ id: U(id), alis_no: no, durum: "acik", urun: "Bugday", depo: null, miktar_kg: 500000, kapanis_zamani: null, tedarikci_id: U(ted), tedarikci: `Tedarikci ${ted}`, tedarikci_kisa: null });
const teslim = (id: string, a: string, kg: number, t: string) => ({ id: U(id), alis_id: U(a), plaka: "P", dorse_plaka: null, net_kg: kg, teslim_zamani: t, irsaliye_no: null, irsaliye_tarihi: t, olusturma: t, sevk_id: null, gecmis: false, irsaliye_dosya_yolu: "x" });

const rapor = () => icGunlukRaporHesapla("2026-01-10", [emir] as never,
  [sevk("s1", 20000, "2026-01-10T07:00:00Z", "cikti"), sevk("s2", 21000, "2026-01-10T09:00:00Z", null), sevk("s3", 5000, "2026-01-09T09:00:00Z", "cikti")] as never,
  [alis("a1", "AS-1", "t1"), alis("a2", "AS-2", "t2")] as never,
  [teslim("x1", "a1", 27000, "2026-01-10T06:00:00Z"), teslim("x2", "a2", 26000, "2026-01-10T08:00:00Z"), teslim("x3", "a1", 25000, "2026-01-10T12:00:00Z"), teslim("x4", "a1", 1000, "2026-01-08T12:00:00Z")] as never);

test("gelenler: alis basina tek satir, arac sayisi ve toplam net", () => {
  const g = gelenSiparisSatirlari(rapor());
  assert.equal(g.length, 2);
  assert.deepEqual(g.map((x) => [x.no, x.arac, x.kg, x.belge]), [["AS-1", 2, 52000, 2], ["AS-2", 1, 26000, 1]]);
  assert.equal(g.reduce((t, x) => t + x.kg, 0), rapor().ozet.gelenKg);
});

test("yuklenenler: siparis basina tek satir, yalniz o gunun araclari", () => {
  const y = yuklenenSiparisSatirlari(rapor());
  assert.equal(y.length, 1);
  assert.equal(y[0].arac, 2);
  assert.equal(y[0].kg, 41000);
  assert.equal(y[0].cikti, 1);
  assert.equal(y[0].belge, 1);
});

test("html: plaka satiri yok, Irsaliyeleri Incele ve toplam net var", () => {
  const html = icGunlukRaporHtml(rapor(), "Firma", "2026-01-11T06:15:00Z", "sabah");
  assert.match(html, /İrsaliyeleri İncele \(2\)/);
  assert.match(html, /Toplam Net \(kg\)/);
  assert.doesNotMatch(html, />Plaka</);
  assert.equal((html.match(/AS-1 ·/g) || []).length, 1);
});

test("html: acik satis ve acik alis tablolarinda TOPLAM satiri (kalanlar toplanir)", () => {
  const r = rapor();
  const html = icGunlukRaporHtml(r, "Firma", "2026-01-11T06:15:00Z", "sabah", { toplamlar: true });
  assert.equal(r.ozet.acikSatisKalanKg, 54000);
  // Onaya kadar zamanlanmis raporda (secenek yok) TOPLAM satiri YOK
  assert.doesNotMatch(icGunlukRaporHtml(r, "Firma", "2026-01-11T06:15:00Z", "sabah"), /TOPLAM — 1 sipariş<\/td>/);
  assert.equal(r.ozet.acikAlisKalanKg, 921000);
  assert.match(html, /TOPLAM — 1 sipariş<\/td>.*?100\.000 kg.*?46\.000 kg.*?Kalan 54 ton/s);
  assert.match(html, /TOPLAM — 2 alış<\/td>.*?1\.000\.000 kg.*?79\.000 kg.*?Kalan 921 ton/s);
});
