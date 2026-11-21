/**
 * Satin alma 21.11.2026: Excel "Tedarikçi / Not" ayrimi + sise/kavanoz birimleri,
 * on onay + haftalik toplu liste yardimcilari ve mailleri. Veriler KURGUSALDIR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { alisverisListesiCoz, birimTani, tedarikciNotAyir } from "@/lib/satin-alma/excel";
import { bekleyenleriAyir, satinAlmaGunuMu, topluSanalListe, varsayilanDahil } from "@/lib/satin-alma/toplu";
import { gonderimMaili, topluOnayMaili, topluOzeti, type SaKalem, type SaListe, type SaToplu } from "@/supabase/functions/_shared/satin-alma";

const B = ["Miktar", "Birim", "ÜRÜN", "Kategori", "Tedarikçi / Not"];
const _ = null;

test("Tedarikçi / Not hücresi: 'TEDARİKÇİ · not' tedarikçi + açıklama olarak ayrılır", () => {
  assert.deepEqual(tedarikciNotAyir("TAKOZLAR · Miktar yok"), { tedarikci: "TAKOZLAR", not: "Miktar yok" });
  assert.deepEqual(tedarikciNotAyir("Cem Market • 1 mi 2 mi? teyit"), { tedarikci: "CEM MARKET", not: "1 mi 2 mi? teyit" });
  assert.deepEqual(tedarikciNotAyir("TOPTANCI | adet yok"), { tedarikci: "TOPTANCI", not: "adet yok" });
  assert.deepEqual(tedarikciNotAyir("SÖNMEZ ET"), { tedarikci: "SÖNMEZ ET", not: "" });
  assert.deepEqual(tedarikciNotAyir("ŞOK-MİGROS"), { tedarikci: "ŞOK-MİGROS", not: "" }, "boşluksuz tire ayırıcı değil");
});

test("şişe / kavanoz birimleri tanınır", () => {
  assert.equal(birimTani("şişe"), "sise");
  assert.equal(birimTani("ŞİŞE"), "sise");
  assert.equal(birimTani("Kavanoz"), "kavanoz");
});

test("21.11 düzeni: not ayrı tedarikçi grubu oluşturmaz, şişe/kavanoz sorun değildir", () => {
  const izgara: unknown[][] = [
    ["ALIŞVERİŞ LİSTESİ (21.11.2026)     DENEME MARKET"],
    B,
    [_, _, "Süzme peynir", "Kahvaltılık", "DENEME MARKET · Miktar yok"],
    [2, "Şişe", "Limon suyu", "Genel Gıda", _],
    [2, "Kavanoz", "Turşu", "Genel Gıda", "DENEME MARKET"],
    [1, "Adet", "Kırmızı lahana", "Manav", "DENEME MARKET · 1 mi 2 mi? teyit"],
  ];
  const s = alisverisListesiCoz(izgara);
  assert.deepEqual(s.uyarilar, []);
  assert.deepEqual(
    s.satirlar.map((x) => [x.urun, x.miktar, x.birim, x.tedarikci, x.aciklama, x.sorun]),
    [
      ["Süzme peynir", null, null, "DENEME MARKET", "Miktar yok", "Miktar okunamadı (boş)"],
      ["Limon suyu", 2, "sise", "DENEME MARKET", "", null],
      ["Turşu", 2, "kavanoz", "DENEME MARKET", "", null],
      ["Kırmızı lahana", 1, "adet", "DENEME MARKET", "1 mi 2 mi? teyit", null],
    ],
  );
  assert.equal(new Set(s.satirlar.map((x) => x.tedarikci)).size, 1, "tek tedarikçi grubu");
});

// ---------------------------------------------------------------------------
const kalem = (id: string, urun: string, ek: Partial<SaKalem> = {}): SaKalem => ({
  id, kategori: "mutfak", urun, miktar: 2, birim: "kg", aciliyet: "normal", aciklama: null, talep_eden: "Deneme Kişi",
  karar: "bekliyor", red_nedeni: null, olusturma: "2026-11-18T08:00:00Z", tedarikci: null, ...ek,
});
const liste = (id: string, departman: string, kalemler: SaKalem[], ek: Partial<SaListe> = {}): SaListe => ({
  id, liste_no: `SA-2026-90${id.slice(-2)}`, durum: "bekliyor", departman, sirket: null, test: false,
  gonderen_ad: "Deneme Kişi", gonderim_zamani: `2026-11-1${id.slice(-1)}T08:00:00Z`, karar_veren_email: null, karar_zamani: null,
  karar_notu: null, gonderim_maili: null, sonuc_maili: null, kalemler, toplu_id: null, ...ek,
});

test("onay bekleyenler: toplu liste formları birlikte, acil formlar tek tek", () => {
  const a = liste("l1", "MUTFAK", [kalem("k1", "Çay")], { toplu_id: "t1", gonderim_zamani: "2026-11-19T08:00:00Z" });
  const b = liste("l2", "KANTAR", [kalem("k2", "Eldiven")], { toplu_id: "t1", gonderim_zamani: "2026-11-17T08:00:00Z" });
  const c = liste("l3", "LOJİSTİK", [kalem("k3", "Kalem")], { onaya_sunma_zamani: "2026-11-18T10:00:00Z" });
  const s = bekleyenleriAyir([a, b, c]);
  assert.deepEqual(s.toplular.map((t) => [t.id, t.listeler.map((l) => l.id)]), [["t1", ["l2", "l1"]]], "gönderim sırasına göre");
  assert.deepEqual(s.tekler.map((l) => l.id), ["l3"]);
});

test("toplu sanal liste: tüm kalemler tek listede, kalem -> form eşlemesi", () => {
  const a = liste("l1", "MUTFAK", [kalem("k1", "Çay"), kalem("k2", "Şeker")]);
  const b = liste("l2", "KANTAR", [kalem("k3", "Çay")]);
  const { liste: s, kalemFormu } = topluSanalListe("t1", "TSA-2026-0001", [a, b]);
  assert.equal(s.id, "t1");
  assert.equal(s.liste_no, "TSA-2026-0001");
  assert.deepEqual(s.kalemler.map((k) => k.id), ["k1", "k2", "k3"]);
  assert.equal(kalemFormu.get("k3")?.departman, "KANTAR");
  assert.match(s.departman, /2 departman/);
});

test("ön onay varsayılan seçimi: gerçek formlar; yalnız test formu varsa test formları", () => {
  const g = liste("l1", "MUTFAK", []);
  const t = liste("l2", "TEST", [], { test: true });
  const d1 = varsayilanDahil([g, t]);
  assert.deepEqual([d1(g), d1(t)], [true, false]);
  const d2 = varsayilanDahil([t]);
  assert.equal(d2(t), true);
});

test("satın alma günü: Türkiye saatiyle cumartesi", () => {
  assert.equal(satinAlmaGunuMu(new Date("2026-11-21T09:00:00Z")), true); // Cumartesi
  assert.equal(satinAlmaGunuMu(new Date("2026-11-20T22:30:00Z")), true); // TR 01:30 Cumartesi
  assert.equal(satinAlmaGunuMu(new Date("2026-11-22T09:00:00Z")), false); // Pazar
});

test("gönderim maili aşamaları: ön onay / acil / eski", () => {
  const l = liste("l1", "MUTFAK", [kalem("k1", "Çay", { aciliyet: "acil" })], { durum: "on_onay" });
  const on = gonderimMaili(l, "on_onay");
  assert.match(on.konu, /^Ön onay: MUTFAK · SA-2026-90l1 \(1 kalem, 1 acil\)$/);
  assert.match(on.html, /ön onayınızda/);
  assert.match(on.html, /Ön onay ekranını aç/);
  const acil = gonderimMaili({ ...l, durum: "bekliyor" }, "acil");
  assert.match(acil.konu, /^Acil satın alma talebi onayınızda: /);
  assert.match(acil.html, /Talebi incele ve karar ver/);
  assert.match(gonderimMaili(l).konu, /^Satın alma talebi: /, "varsayılan eski metin");
  assert.doesNotMatch(on.html + acil.html, /undefined|null/);
});

test("toplu onay maili: departman tablosu + tedarikçiye göre kalemler, TEST konusu", () => {
  const t: SaToplu = {
    id: "00000000-0000-4000-8000-000000000001", toplu_no: "TSA-2026-0001", olusturma: "2026-11-21T07:00:00Z", olusturan_email: "deneme@ornek.com",
    listeler: [
      liste("l1", "MUTFAK", [kalem("k1", "Çay", { tedarikci: "DENEME MARKET" }), kalem("k2", "Kıyma", { tedarikci: "DENEME KASAP", aciliyet: "acil" })]),
      liste("l2", "KANTAR", [kalem("k3", "Eldiven <büyük>", { tedarikci: "DENEME MARKET" })]),
    ],
  };
  const o = topluOzeti(t);
  assert.deepEqual(o, { form: 2, departman: 2, kalem: 3, acil: 1, tedarikci: 2 });
  const m = topluOnayMaili(t);
  assert.equal(m.konu, "Haftalık toplu satın alma listesi onayınızda: TSA-2026-0001 (2 departman, 3 kalem, 1 acil)");
  assert.match(m.html, /satin-alma\?toplu=00000000-0000-4000-8000-000000000001/);
  assert.match(m.html, /DENEME MARKET <span[^>]*>· 2 kalem/);
  assert.match(m.html, /Eldiven &lt;büyük&gt;/, "HTML kaçışı");
  assert.ok(m.html.indexOf("MUTFAK") < m.html.indexOf("KANTAR"));
  assert.doesNotMatch(m.html, /undefined/);
  assert.match(topluOnayMaili({ ...t, test: true }).konu, /^\[TEST\] /);
});
