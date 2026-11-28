/**
 * 21.11.2026 is akisi revizeleri: ETD-ETA Excel ETA'si, silinen proformalar, kalan odeme, Excel "Bakiye" sutunu,
 * yukleme plani rezervasyon bekleyenler (navlun + aksiyon), adres parametreleri. Veriler KURGUSALDIR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { etaSorunu, excelSistemleEslestir, tarihIso, type ExcelSatiri, type SistemSevkiyati } from "@/lib/etd-excel";
import { musteriAnahtari, silinenleriGrupla, silinenNormalle, type SilinenProforma } from "@/lib/proforma/silinen";
import { kalanOdemeleri, kalanToplami } from "@/lib/siparis/odeme";
import { siparisOnizleme, siparisSayfasiniCoz, type SiparisMevcut } from "@/lib/siparis/siparis-excel";
import { bekleyenAksiyonu, limanNavlunlari, navlunLimanAnahtari, navlunMetni, type NavlunTeklifi } from "@/lib/siparis/plan-bekleyen";
import { siparisSayfasi } from "@/supabase/functions/_shared/siparis-xlsx";
import type { SiparisSatiri } from "@/lib/siparis/liste";
import type { HamSayfa } from "@/lib/siparis/xlsx-oku";

// ------------------------------------------------------------------ 5) ETA
const ex = (booking: string, eta: string, etd = "", ek: Partial<ExcelSatiri> = {}): ExcelSatiri => ({
  sayfa: "2026", satir: 10, firma: "DEMO", adet: 2, booking, bl: "", etd, eta, durumHam: "", durum: null, ...ek,
});
const sis = (id: string, booking: string, etd: string | null, eta: string | null): SistemSevkiyati => ({
  rezervasyon_id: id, booking_no: booking, bl_no: null, alici_firma: "DEMO FIRMA", dosya_no: `IHR-DEMO-${id}`, konsimento_durumu: null, etd, eta,
});

test("tarihIso: gg.aa.yyyy / gg/aa/yyyy / ISO; gecersiz -> null", () => {
  assert.equal(tarihIso("06.12.2026"), "2026-12-06");
  assert.equal(tarihIso("6/1/2027"), "2027-01-06");
  assert.equal(tarihIso("2026-11-25T00:00:00Z"), "2026-11-25");
  assert.equal(tarihIso("31.02.2026"), null);
  assert.equal(tarihIso("ETA BEKLENİYOR"), null);
  assert.equal(tarihIso(""), null);
});

test("ETA kurali: ETD'den once ya da 180 gunden sonra -> sorun", () => {
  assert.equal(etaSorunu("2026-12-03", "2026-11-20"), null);
  assert.equal(etaSorunu("2026-11-20", "2026-11-20"), null);
  assert.match(etaSorunu("2026-01-27", "2026-12-18") || "", /önce/);
  assert.match(etaSorunu("2027-07-01", "2026-11-20") || "", /180/);
  assert.equal(etaSorunu("2026-01-27", null), null);
});

test("ETA eslestirme: dolu ve farkli -> degisecek; ayni / bos -> yok; uyumsuz -> supheli (uygulanmaz)", () => {
  const sistem = [sis("1", "DEMOBK1", "2026-11-08", null), sis("2", "DEMOBK2", "2026-11-20", "2026-12-03"),
    sis("3", "DEMOBK3", "2026-11-24", "2026-12-01"), sis("4", "DEMOBK4", "2026-12-18", null), sis("5", "DEMOBK5", "2026-11-26", "2026-12-20")];
  const e = excelSistemleEslestir([
    ex("DEMOBK1", "06.12.2026"), ex("DEMOBK2", "03.12.2026"), ex("DEMOBK3", "08.02.2027"), ex("DEMOBK4", "27.01.2026"), ex("DEMOBK5", ""),
  ], sistem);
  assert.deepEqual(e.etaDegisecek.map((d) => [d.booking, d.eski, d.yeni]), [["DEMOBK1", null, "2026-12-06"], ["DEMOBK3", "2026-12-01", "2027-02-08"]]);
  assert.deepEqual(e.etaSupheli.map((d) => d.booking), ["DEMOBK4"]);
  // konsimento tarafi degismedi: bos durum korunur
  assert.equal(e.excelBos, 5);
  assert.equal(e.degisecek.length, 0);
});

test("ETA: sistemde ETD yoksa Excel ETD'si ile kontrol edilir", () => {
  const e = excelSistemleEslestir([ex("DEMOBK9", "01.01.2026", "10.03.2026")], [sis("9", "DEMOBK9", null, null)]);
  assert.equal(e.etaDegisecek.length, 0);
  assert.equal(e.etaSupheli.length, 1);
});

test("ETA: Hapag-Lloyd'dan otomatik gelen sevkiyat (eta_hat) -> Excel ETA'si uygulanmaz, ayri listelenir (28.11.2026)", () => {
  const hapag = { ...sis("7", "DEMOBK7", "2026-10-31", "2026-12-05"), eta_hat: true };
  const diger = sis("8", "DEMOBK8", "2026-11-20", "2026-12-03");
  const e = excelSistemleEslestir([ex("DEMOBK7", "01.12.2026"), ex("DEMOBK8", "06.12.2026")], [hapag, diger]);
  assert.deepEqual(e.etaHat.map((d) => [d.booking, d.eski, d.yeni]), [["DEMOBK7", "2026-12-05", "2026-12-01"]]);
  assert.deepEqual(e.etaDegisecek.map((d) => d.booking), ["DEMOBK8"]);
  assert.equal(e.etaSupheli.length, 0);
  // Excel'de ayni tarih -> hicbir listede yok
  assert.equal(excelSistemleEslestir([ex("DEMOBK7", "05.12.2026")], [hapag]).etaHat.length, 0);
});

// ------------------------------------------------------------------ 1) Silinen proformalar
const sp = (no: string, alici: string, silinme: string, ek: Partial<SilinenProforma> = {}): SilinenProforma => ({
  denetim_id: `d-${no}`, proforma_no: no, alici_unvan: alici, tarih: "2026-11-03", para_birimi: "USD", toplam: 10000, toplam_mts: 25,
  silinme, silen: "demo@ornek.test", urunler: "DEMO FLOUR", ...ek,
});

test("silinen proformalar musteri bazinda: en son silinen musteri ustte; unvan yazim farki ayni musteri", () => {
  assert.equal(musteriAnahtari("Demo Impex S.L."), musteriAnahtari("DEMO IMPEX SL"));
  const g = silinenleriGrupla([
    sp("DEMOAAA031126", "DEMO IMPEX SL", "2026-11-04T07:00:00Z"),
    sp("DEMOBBB091126", "Demo Impex S.L.", "2026-11-21T11:00:00Z", { toplam: 5000, toplam_mts: 12.5 }),
    sp("DEMOCCC101126", "ORNEK GIDA", "2026-11-13T12:00:00Z", { para_birimi: "EUR" }),
  ]);
  assert.deepEqual(g.map((x) => [x.unvan, x.proformalar.length]), [["DEMO IMPEX SL", 2], ["ORNEK GIDA", 1]]);
  assert.deepEqual(g[0].proformalar.map((p) => p.proforma_no), ["DEMOBBB091126", "DEMOAAA031126"]);
  assert.deepEqual(g[0].toplam, { USD: 15000 });
  assert.equal(g[0].mts, 37.5);
  assert.deepEqual(g[1].toplam, { EUR: 10000 });
});

test("silinen proformalar arama (Turkce harf duyarsiz) ve normalle", () => {
  const l = [sp("DEMOAAA031126", "İSTANBUL GIDA", "2026-11-04T07:00:00Z", { urunler: "BAKER FLOUR" }), sp("DEMOBBB091126", "ORNEK", "2026-11-05T07:00:00Z")];
  assert.equal(silinenleriGrupla(l, "istanbul").length, 1);
  assert.equal(silinenleriGrupla(l, "baker").length, 1);
  assert.equal(silinenleriGrupla(l, "bbb09").length, 1);
  assert.equal(silinenNormalle({ proforma_no: "", denetim_id: "x" }), null);
  assert.equal(silinenNormalle({ proforma_no: "DEMO1", denetim_id: "x", toplam: "125.5" })?.toplam, 125.5);
});

// ------------------------------------------------------------------ 3) Kalan odeme
const ss = (anahtar: string, proforma_no: string, durum: SiparisSatiri["durum"], tutar: number | null, ek: Partial<SiparisSatiri> = {}) =>
  ({ anahtar, proforma_no, durum, tutar, para_birimi: "USD", on_odeme: durum !== "onay_bekliyor", on_odeme_tutar: null, on_odeme_para: null, dosya_no: null, ...ek }) as SiparisSatiri;

test("kalan odeme: on odeme proforma toplamina oranla satirlara dagitilir", () => {
  // 375 MT'lik proforma: 50 MT rezervasyonlu + 325 MT on odeme bekliyor; on odeme 31.125 USD
  const liste = [
    ss("excel:a", "DEMOAQI051126", "rezervasyonlu", 20750, { on_odeme_tutar: 31125, on_odeme_para: "USD", dosya_no: "IHR-DEMO-1" }),
    ss("excel:b", "DEMOAQI051126", "on_odeme_alindi", 134875, { on_odeme_tutar: 31125, on_odeme_para: "USD" }),
  ];
  const k = kalanOdemeleri(liste);
  assert.deepEqual(k.get("excel:a"), { onOdemePayi: 4150, kalan: 16600, para: "USD", durum: "bekliyor", not: null });
  assert.deepEqual(k.get("excel:b"), { onOdemePayi: 26975, kalan: 107900, para: "USD", durum: "bekliyor", not: null });
  assert.equal((k.get("excel:a")!.onOdemePayi || 0) + (k.get("excel:b")!.onOdemePayi || 0), 31125, "pay toplami on odemeye esit");
});

test("kalan odeme: bakiye alindi (Excel DOGRU / konsimento) -> 0; onay bekleyen -> tamami; tutar yok -> Excel bakiyesi ya da bilinmiyor", () => {
  const liste = [
    ss("excel:s1", "DEMOBSG031126", "sevk_edildi", 72750, { on_odeme_tutar: 21825, on_odeme_para: "USD", dosya_no: "IHR-DEMO-13" }),
    ss("excel:s2", "DEMOBSG031126", "rezervasyonlu", 72750, { on_odeme_tutar: 21825, on_odeme_para: "USD", dosya_no: "IHR-DEMO-33" }),
    ss("excel:s3", "DEMORCO160926", "sevk_edildi", 121250),
    ss("excel:s4", "DEMOEMT160926-1R", "rezervasyonlu", 30750),
    ss("excel:s5", "DEMOOMG091126", "on_odeme_alindi", 120000),
    ss("proforma:p1", "DEMOAPS031126", "onay_bekliyor", 142500),
    ss("excel:iptal", "DEMOXXX010126", "iptal", 1000),
  ];
  const k = kalanOdemeleri(liste, {
    defter: new Map([["excel:s3", { odendi: true, tutar: null }], ["excel:s4", { odendi: false, tutar: 15750 }]]),
    dosyaOdendi: new Map([["IHR-DEMO-13", true], ["IHR-DEMO-33", false]]),
  });
  assert.equal(k.get("excel:s1")!.durum, "odendi");
  assert.equal(k.get("excel:s1")!.kalan, 0);
  assert.equal(k.get("excel:s2")!.kalan, 72750 - 10912.5);
  assert.equal(k.get("excel:s3")!.durum, "odendi");
  assert.deepEqual([k.get("excel:s4")!.kalan, k.get("excel:s4")!.not], [15750, "Excel bakiyesi"]);
  assert.deepEqual([k.get("excel:s5")!.kalan, k.get("excel:s5")!.durum], [null, "bilinmiyor"]);
  assert.deepEqual([k.get("proforma:p1")!.kalan, k.get("proforma:p1")!.durum], [142500, "tamami"]);
  assert.equal(k.has("excel:iptal"), false);
  const t = kalanToplami(liste, k);
  assert.deepEqual(t.toplam, { USD: 61837.5 + 15750 + 142500 });
  assert.equal(t.bilinmeyen, 1);
});

test("kalan odeme: on odeme baska para biriminde -> hesaplanmaz", () => {
  const k = kalanOdemeleri([ss("excel:e", "DEMOEUR010126", "on_odeme_alindi", 10000, { on_odeme_tutar: 3000, on_odeme_para: "EUR" })]);
  assert.equal(k.get("excel:e")!.kalan, null);
  assert.match(k.get("excel:e")!.not || "", /EUR/);
});

test("Excel indir: kalanlar verilirse sona Ön Ödeme Payı + Kalan Ödeme; verilmezse eskisi gibi 16 sutun", () => {
  const liste = [ss("excel:a", "DEMOAQI051126", "on_odeme_alindi", 20000, { on_odeme_tutar: 6000, on_odeme_para: "USD", firma: "DEMO", miktar_mt: 50 })];
  const eski = siparisSayfasi(liste);
  assert.equal(eski.satirlar[0]!.length, 16);
  const yeni = siparisSayfasi(liste, "Sipariş Listesi", kalanOdemeleri(liste));
  const baslik = yeni.satirlar[0]!.map((h) => (h as { v: unknown }).v);
  assert.deepEqual(baslik.slice(-2), ["Ön Ödeme Payı", "Kalan Ödeme"]);
  const veri = yeni.satirlar.find((r) => r && (r[0] as { v: unknown } | null)?.v === "DEMOAQI051126")!;
  assert.deepEqual(veri.slice(-2).map((h) => (h as { v: unknown }).v), [6000, 14000]);
  assert.ok((yeni.birlestir || []).every((b) => b.includes(":R")), "bolum basligi birlestirmesi yeni son sutuna kadar");
});

// ------------------------------------------------------------------ 3) Excel "Bakiye" sutunu
test("siparis Excel'i: Bakiye DOGRU / YANLIS / tutar okunur; bos hucre degistirmez", () => {
  const B = ["Proforma", "Firma Adı", "Ürün", "Fiyat", "Miktar", "Tutar", "Konteyner", "Liman", "BL NO", "Marka", "Paketleme", null, "Ön Ödeme ", "Bakiye", "Release"];
  const r = (p: string, bakiye: unknown, yesil = true) => [p, "DEMO", "UN", 400, 50, 20000, 2, "Liman", yesil ? "BKG" + p.slice(-3) : null, "M", "25 KG PP", null, "TRUE", bakiye, "FALSE"];
  const sayfa: HamSayfa = { ad: "Sipariş Listesi", satirlar: [[1, B, null], [2, r("DEMOAAA010126", "TRUE"), "00B050"], [3, r("DEMOBBB020226", "FALSE"), "00B050"],
    [4, r("DEMOCCC030326", "$15.750,00"), null], [5, r("DEMODDD040426", null), null], [6, r("DEMOEEE050526", "$ 146.625"), null]] as HamSayfa["satirlar"] };
  const s = siparisSayfasiniCoz([sayfa]);
  assert.deepEqual(s.satirlar.map((x) => [x.bakiye_odendi, x.bakiye_tutar]), [[true, null], [false, null], [false, 15750], [null, null], [false, 146625]]);
  const m: SiparisMevcut[] = s.satirlar.map((x, i) => ({ id: `m${i}`, sira: x.sira, proforma_no: x.proforma_no, proforma_tarihi: x.proforma_tarihi, firma: x.firma, urun: x.urun,
    birim_fiyat: x.birim_fiyat, miktar_mt: x.miktar_mt, tutar: x.tutar, konteyner: x.konteyner, liman: x.liman, bl_no: x.bl_no, marka: x.marka, paketleme: x.paketleme,
    durum: x.durum, bakiye_odendi: i === 3 ? false : null, bakiye_tutar: null }));
  const o = siparisOnizleme(s.satirlar, m);
  // bos Bakiye hucresi (DEMODDD) mevcut "false"u silmez; digerleri degisiklik olarak gorunur
  assert.deepEqual(o.degisen.map((d) => [d.satir.proforma_no, d.degisiklikler.map((x) => `${x.alan}:${x.yeni}`).join(",")]), [
    ["DEMOAAA010126", "Bakiye:Alındı"], ["DEMOBBB020226", "Bakiye:Bekliyor"], ["DEMOCCC030326", "Bakiye:Bekliyor,Kalan bakiye:15.750"],
    ["DEMOEEE050526", "Bakiye:Bekliyor,Kalan bakiye:146.625"],
  ]);
});

// ------------------------------------------------------------------ 4) Yukleme plani rezervasyon bekleyenler
const nt = (liman: string, acente: string, tutar: number | null, tarih: string, ek: Partial<NavlunTeklifi> = {}): NavlunTeklifi => ({
  tur: "teklif", liman, liman_anahtar: liman.toUpperCase(), acente, tutar, para_birimi: "USD", ekipman: "20DC", free_time_gun: 14, transit_gun: "45", tarih, ...ek,
});

test("liman navlunu: acente basina en son teklif (20DC once), ucuzdan; es adlar ve yazim farki ayni liman", () => {
  assert.equal(navlunLimanAnahtari("Dar Es Salaam"), navlunLimanAnahtari("DAR ES SELAM"));
  const t = [
    nt("BATA", "Acente A", 2450, "2026-11-20T10:00:00Z"), nt("BATA", "Acente A", 2600, "2026-11-10T10:00:00Z"),
    nt("BATA", "Acente B", 2300, "2026-11-20T12:00:00Z", { free_time_gun: 42, transit_gun: null }),
    nt("BATA", "Acente C", 4100, "2026-11-21T09:00:00Z", { ekipman: "40HC" }), nt("BATA", "Acente C", 2900, "2026-11-01T09:00:00Z"),
    nt("MALABO", "Acente A", 2000, "2026-11-20T10:00:00Z"), nt("BATA", "Acente D", null, "2026-11-20T10:00:00Z"),
    nt("BATA", "Acente E", 1500, "2026-11-20T10:00:00Z", { tur: "hedef_kabul" }),
  ];
  const l = limanNavlunlari(t, "Bata", 5);
  assert.deepEqual(l.map((x) => [x.acente, x.tutar]), [["Acente B", 2300], ["Acente A", 2450], ["Acente C", 2900]]);
  assert.match(navlunMetni(l[0]), /Acente B 2\.300 USD 20DC · FT 42 · 20\.11/);
  assert.deepEqual(limanNavlunlari(t, null), []);
});

test("rezervasyon bekleyen aksiyonu: acik dosya > siparis takibi > sistem proformasi > proforma yukle", () => {
  const d = { proforma_no: "DEMOGTI161126", proforma_id: "p-1", dosya: null, ana_siparis: null };
  assert.equal(bekleyenAksiyonu({ ...d, dosya: { id: "f-1", dosya_no: "IHR-DEMO-1" } }, d.proforma_no).href, "/dosya/f-1?tab=rezervasyon&action=new");
  assert.equal(bekleyenAksiyonu({ ...d, ana_siparis: { id: "a-1", proforma_no: "DEMOGTI161126R" } }, d.proforma_no).href, "/ihracatlar?siparis=DEMOGTI161126R");
  assert.equal(bekleyenAksiyonu(d, d.proforma_no).href, "/yeni-dosya?proforma=p-1&otomatik=1");
  const yok = bekleyenAksiyonu(undefined, "DEMOCMP211026-1R");
  assert.equal(yok.tur, "proforma_yukle");
  assert.match(yok.aciklama, /DEMOCMP211026-1R/);
});
