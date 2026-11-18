/**
 * Navlun karsilastirma + acente hafizasi (lib/navlun/karsilastirma.ts). Ders (13.11.2026): Beyrut'ta "USD 340 + lokaller"
 * teklifi lokalsiz 340 olarak "en iyi" ve "hedefte" gorundu; gercek maliyet 696, hedef 600'un ustunde.
 * Veriler kurgusaldir (acente adlari yalniz bicim icin).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acenteAnahtari, baglamKur, enIyiSec, karsilastir, rezervasyondanOgren,
  type AcenteHafizasi, type LimanKurali, type TeklifGirdisi,
} from "@/lib/navlun/karsilastirma";

const hafiza = (x: Partial<AcenteHafizasi> & Pick<AcenteHafizasi, "acente_anahtar" | "lokal">): AcenteHafizasi => ({
  acente_ad: x.acente_anahtar, lokal_20: null, lokal_40: null, ek_kont: 0, guven: "yuksek", kanit: "test", ...x,
});
const teklif = (acente: string, tutar: number, lokal_dahil: boolean | null = null, liman = "BEYRUT", tarih = "2026-10-22"): TeklifGirdisi =>
  ({ acente, tutar, ekipman: "20DC", lokal_dahil, liman_anahtar: liman, tarih, para_birimi: "USD" });

test("acente anahtari: rezervasyon ve mail yazimlari ayni acenteye iner", () => {
  assert.equal(acenteAnahtari("DRAFT/CMA"), "DRAFT");
  assert.equal(acenteAnahtari("Draft"), "DRAFT");
  assert.equal(acenteAnahtari("AKKON LINES"), "AKKON");
  assert.equal(acenteAnahtari("Akkon"), "AKKON");
  assert.equal(acenteAnahtari("ONE LINE"), "ONE");
  assert.equal(acenteAnahtari("Marti"), "MARTI");
  assert.equal(acenteAnahtari("Martı"), "MARTI");
  assert.equal(acenteAnahtari("ESNA/HAPAG"), "ESNA");
  assert.equal(acenteAnahtari("Link"), "LINK");
  assert.equal(acenteAnahtari(""), null);
  assert.equal(acenteAnahtari(null), null);
});

test("BEYRUT: lokal haric teklif lokaliyle toplanir ve en iyi secilir (340 + 356 = 696)", () => {
  const b = baglamKur([hafiza({ acente_anahtar: "EVERGREEN", lokal: "haric", lokal_20: 356, lokal_40: 356 }),
    hafiza({ acente_anahtar: "DRAFT", lokal: "dahil" })], [], [], []);
  const ev = karsilastir(teklif("Evergreen", 340, false), b);
  assert.equal(ev.toplam, 696);
  assert.equal(ev.kesin, true);
  assert.equal(ev.metin, "340 + lokal 356 = 696");
  const dr = karsilastir(teklif("Draft", 900), b);
  assert.equal(dr.toplam, 900);
  assert.equal(dr.kesin, true);
  assert.equal(dr.kaynak, "hafiza");
  const { enIyi } = enIyiSec([teklif("Evergreen", 340, false), teklif("Draft", 900)], (x) => karsilastir(x, b));
  assert.equal(enIyi?.acente, "Evergreen");
  // hedef 600: en iyi toplam 696 > 600 -> hedefin USTUNDE (eskiden 340 <= 600 "hedefte" gorunuyordu)
  assert.ok(karsilastir(enIyi!, b).toplam > 600);
});

test("lokal haric ama tutari bilinmiyorsa kesin degil: en iyi SECILMEZ", () => {
  const b = baglamKur([], [], [], []);
  const c = karsilastir(teklif("Evergreen", 340, false), b);
  assert.equal(c.kesin, false);
  assert.equal(c.metin, "340 + lokal (tutarı bilinmiyor)");
  const { enIyi, belirsiz } = enIyiSec([teklif("Evergreen", 340, false)], (x) => karsilastir(x, b));
  assert.equal(enIyi, null);
  assert.equal(belirsiz?.acente, "Evergreen");
});

test("lokalden hic bahsetmeyen ve hafizasi olmayan acente: belirsiz, en iyi secilmez", () => {
  const b = baglamKur([], [], [], []);
  const c = karsilastir(teklif("Link", 500), b);
  assert.equal(c.lokalDurum, "bilinmiyor");
  assert.equal(c.kesin, false);
  assert.equal(c.metin, "lokal belirsiz");
  const { enIyi } = enIyiSec([teklif("Link", 500), teklif("MSC", 700, true)], (x) => karsilastir(x, b));
  assert.equal(enIyi?.acente, "MSC");
});

test("mail metni hafizadan once gelir; konteyner basi ek kalemler eklenir", () => {
  const b = baglamKur([hafiza({ acente_anahtar: "MARTI", lokal: "dahil", ek_kont: 18 })], [], [], []);
  const c = karsilastir(teklif("Marti", 800, null, "ASHDOD"), b);
  assert.equal(c.toplam, 818);
  assert.equal(c.metin, "800 + 18 (mühür vb.) = 818");
  // metinde "+ lokal" yazan teklif hafizadaki "dahil"i ezer; lokal tutari yoksa kesin degil
  const h = karsilastir(teklif("Marti", 800, false, "ASHDOD"), b);
  assert.equal(h.kaynak, "mail");
  assert.equal(h.kesin, false);
});

test("liman kurali 'navlun': yalniz deniz navlunu karsilastirilir (Singapur)", () => {
  const kural: LimanKurali = { liman_anahtar: "SINGAPORE", temel: "navlun", aciklama: "Singapur: yalnız navlun" };
  const b = baglamKur([], [kural], [], []);
  const c = karsilastir(teklif("OOCL", 70, true, "SINGAPORE"), b);
  assert.equal(c.toplam, 70);
  assert.equal(c.kesin, true);
  assert.equal(c.temel, "navlun");
  assert.equal(karsilastir(teklif("CMA CGM", 150, null, "SINGAPORE"), b).kesin, true);
});

test("KENDI KENDINI GELISTIREN: rezervasyondan lokal kurali ogrenilir", () => {
  const teklifler = [teklif("Draft", 1450, null, "TEMA", "2026-10-01"), teklif("Yeni", 1000, null, "LOME", "2026-10-01")];
  const ogren = rezervasyondanOgren(teklifler, [
    { acente: "DRAFT/MAERSK", liman_anahtar: "TEMA", etd: "2026-11-08", navlun: 1450, lokal: 400, para: "USD" },
    { acente: "DRAFT/MAERSK", liman_anahtar: "TEMA", etd: "2026-11-08", navlun: 1450, lokal: 325, para: "USD" },
    { acente: "YENI LINES", liman_anahtar: "LOME", etd: "2026-10-20", navlun: 1400, lokal: 400, para: "USD" },
  ]);
  assert.equal(ogren.get("DRAFT")?.lokal, "dahil");
  assert.equal(ogren.get("DRAFT")?.dahil, 1); // ayni teklif-rezervasyon cifti bir kez
  assert.equal(ogren.get("YENI")?.lokal, "haric");
  // ogrenilen kural hafizasi olmayan acenteye uygulanir
  const b = baglamKur([], [], teklifler, [{ acente: "DRAFT/MAERSK", liman_anahtar: "TEMA", etd: "2026-11-08", navlun: 1450, lokal: 400, para: "USD" }]);
  const c = karsilastir(teklif("Draft", 900, null, "BEYRUT"), b);
  assert.equal(c.kaynak, "rezervasyon");
  assert.equal(c.kesin, true);
});

test("ogrenme: eslesmeyen fiyat, eski teklif, ETD sonrasi teklif kanit sayilmaz; celiski belirsiz", () => {
  const t = [teklif("Draft", 1500, null, "TEMA", "2026-10-01")];
  assert.equal(rezervasyondanOgren(t, [{ acente: "DRAFT", liman_anahtar: "TEMA", etd: "2026-11-08", navlun: 1450, lokal: 400, para: "USD" }]).size, 0);
  assert.equal(rezervasyondanOgren([teklif("Draft", 1450, null, "TEMA", "2026-03-01")], [{ acente: "DRAFT", liman_anahtar: "TEMA", etd: "2026-11-08", navlun: 1450, lokal: 400, para: "USD" }]).size, 0);
  assert.equal(rezervasyondanOgren([teklif("Draft", 1450, null, "TEMA", "2026-11-20")], [{ acente: "DRAFT", liman_anahtar: "TEMA", etd: "2026-11-08", navlun: 1450, lokal: 400, para: "USD" }]).size, 0);
  const celiski = rezervasyondanOgren(
    [teklif("X", 1000, null, "A", "2026-10-01"), teklif("X", 600, null, "B", "2026-10-01")],
    [{ acente: "X", liman_anahtar: "A", etd: "2026-10-10", navlun: 1000, lokal: 400, para: "USD" },
      { acente: "X", liman_anahtar: "B", etd: "2026-10-10", navlun: 1000, lokal: 400, para: "USD" }]);
  assert.equal(celiski.get("X")?.lokal, "bilinmiyor");
});

test("baglam yoksa yalniz mail metni: dahil kesin, digerleri kesin degil", () => {
  assert.equal(karsilastir(teklif("MSC", 700, true), null).kesin, true);
  assert.equal(karsilastir(teklif("Evergreen", 340, false), null).kesin, false);
  assert.equal(karsilastir(teklif("Draft", 900), null).kesin, false);
});

test("17:00 navlun maili (limanSatirlari): Beyrut en iyi 696, hafizasiz lokal belirsiz", async () => {
  const { navlunTablosuHesapla, limanSatirlari } = await import("@/supabase/functions/_shared/navlun-tablosu");
  const olay = (acente: string | null, tur: string, tutar: number, lokal_dahil: boolean | null, tarih: string) =>
    ({ tur, liman: "BEYRUT", liman_anahtar: "BEYRUT", acente, armator: acente, tutar, para_birimi: "USD", ekipman: "20DC", free_time_gun: null, tarih, lokal_dahil });
  const olaylar = [olay(null, "hedef", 600, null, "2026-11-10T08:00:00Z"), olay("Evergreen", "teklif", 340, false, "2026-11-10T09:00:00Z"), olay("Draft", "teklif", 900, null, "2026-11-10T10:00:00Z")];
  const t = navlunTablosuHesapla(olaylar, [], "2026-11-13");
  t.baglam = baglamKur([hafiza({ acente_anahtar: "EVERGREEN", lokal: "haric", lokal_20: 356, lokal_40: 356 }), hafiza({ acente_anahtar: "DRAFT", lokal: "dahil" })], [], [], []);
  const s = limanSatirlari(t).find((x) => x.liman === "BEYRUT")!;
  assert.equal(s.enIyi?.tutar, 696);
  assert.equal(s.enIyi?.metin, "340 + lokal 356 = 696");
  assert.ok((s.enIyi?.tutar as number) > (s.hedef as number));
  t.baglam = null;
  const s2 = limanSatirlari(t).find((x) => x.liman === "BEYRUT")!;
  assert.equal(s2.enIyi, null);          // hafiza okunamazsa hicbiri "en iyi" degil
  assert.equal(s2.belirsiz?.tutar, 340);  // ama lokali belirsiz teklif kaybolmaz
});

test("rezervasyon bekleyen: ayni firmanin kisa / uzun yazimi tek satir; DAR SALAAM teklifi bulunur (16.11.2026)", async () => {
  const { navlunTablosuHesapla, navlunSatinAlma } = await import("@/supabase/functions/_shared/navlun-tablosu");
  const olaylar = [{ tur: "teklif", liman: "DAR ES SELAM", liman_anahtar: "DAR ES SELAM", acente: "Akkon", armator: "Akkon", tutar: 3250,
    para_birimi: "USD", ekipman: "20DC", free_time_gun: null, tarih: "2026-11-12T08:00:00Z", lokal_dahil: true }];
  const t = navlunTablosuHesapla(olaylar, [], "2026-11-16");
  const sip = (musteri: string, liman: string, konteyner: number) => ({ kaynak: "siparis", booking_no: null, musteri, konteyner, dosya_no: null,
    varis_limani: liman, acente: null, navlun: null, navlun_para: null, etd: null });
  const sa = navlunSatinAlma(t, [sip("ORNEK LINK", "Singapore", 2), sip("ORNEK LINK", "Singapore", 2), sip("ORNEK LINK& MARKETING PTE LTD", "Singapore", 2),
    sip("ORNEK BAKERY", "DAR SALAAM", 5)], olaylar);
  const sg = sa.bekleyenler.filter((b) => b.limanAnahtar === "SINGAPORE");
  assert.equal(sg.length, 1);
  assert.equal(sg[0].siparis, 3);
  assert.equal(sg[0].konteyner, 6);
  const dar = sa.bekleyenler.find((b) => b.musteri === "ORNEK BAKERY")!;
  assert.equal(dar.limanAnahtar, "DAR ES SALAAM");
  assert.equal(dar.enIyi?.tutar, 3250);
});

test("es sozlugu (ad_esleri): liman ve firma eslesmesi; bos sozlukte sabit esler", async () => {
  const { esleriYukle, firmaAnahtari, navlunTablosuHesapla, navlunSatinAlma } = await import("@/supabase/functions/_shared/navlun-tablosu");
  assert.equal(firmaAnahtari("Örnek Gıda & Co. Ltd"), "ORNEKGIDACOLTD");
  esleriYukle([{ tur: "firma", kaynak: "ORNEKFIRMASA", hedef: "ORNEKGRUP" }, { tur: "liman", kaynak: "ORNEK YAZIM", hedef: "ORNEKPORT" }]);
  assert.equal(firmaAnahtari("Ornek Firma S.A."), "ORNEKGRUP");
  const olaylar = [{ tur: "teklif", liman: "ORNEKPORT", liman_anahtar: "ORNEKPORT", acente: "Akkon", armator: "Akkon", tutar: 900,
    para_birimi: "USD", ekipman: "20DC", free_time_gun: null, tarih: "2026-11-12T08:00:00Z", lokal_dahil: true }];
  const t = navlunTablosuHesapla(olaylar, [], "2026-11-16");
  const sip = (musteri: string, liman: string) => ({ kaynak: "siparis", booking_no: null, musteri, konteyner: 2, dosya_no: null,
    varis_limani: liman, acente: null, navlun: null, navlun_para: null, etd: null });
  const sa = navlunSatinAlma(t, [sip("Ornek Firma S.A.", "Ornek Yazım"), sip("ORNEK GRUP", "ORNEKPORT")], olaylar);
  assert.equal(sa.bekleyenler.length, 1);
  assert.equal(sa.bekleyenler[0].siparis, 2);
  assert.equal(sa.bekleyenler[0].enIyi?.tutar, 900);
  esleriYukle([]);
  assert.equal(firmaAnahtari("Ornek Firma S.A."), "ORNEKFIRMASA");
});

test("tek teklifle karar verilen limanlar: talebi olan limanda son 30 gunde <= 1 acente (16.11.2026)", async () => {
  const { navlunTablosuHesapla, navlunSatinAlma, satinAlmaHtml } = await import("@/supabase/functions/_shared/navlun-tablosu");
  const teklif = (liman: string, acente: string, tutar: number, tarih: string) => ({ tur: "teklif", liman, liman_anahtar: liman, acente, armator: acente, tutar,
    para_birimi: "USD", ekipman: "20DC", free_time_gun: null, tarih, lokal_dahil: true });
  const olaylar = [teklif("ORNEKPORT", "Akkon", 1800, "2026-11-10T08:00:00Z"), teklif("IKIPORT", "Akkon", 900, "2026-11-10T08:00:00Z"),
    teklif("IKIPORT", "Msc", 950, "2026-11-11T08:00:00Z"), teklif("ESKIPORT", "Msc", 700, "2026-09-01T08:00:00Z")];
  const t = navlunTablosuHesapla(olaylar, [], "2026-11-16");
  const sip = (musteri: string, liman: string, konteyner: number) => ({ kaynak: "siparis", booking_no: null, musteri, konteyner, dosya_no: null,
    varis_limani: liman, acente: null, navlun: null, navlun_para: null, etd: null });
  const bk = (liman: string, konteyner: number) => ({ kaynak: "excel", booking_no: "BKG123456789", musteri: "ORNEK", konteyner, dosya_no: null,
    varis_limani: liman, acente: "AKKON", navlun: 1850, navlun_para: "USD", etd: "2026-11-20" });
  const sa = navlunSatinAlma(t, [sip("A", "ORNEKPORT", 4), sip("B", "IKIPORT", 2), sip("C", "ESKIPORT", 1), bk("YOKPORT", 5)], olaylar);
  const k = Object.fromEntries(sa.tekTeklif.map((x) => [x.limanAnahtar, x]));
  assert.deepEqual(k["ORNEKPORT"].acenteler, ["AKKON"]);
  assert.equal(k["ORNEKPORT"].bekleyenKont, 4);
  assert.equal(k["IKIPORT"], undefined);                       // iki acente: uyari yok
  assert.deepEqual(k["ESKIPORT"].acenteler, []);               // teklif 30 gunden eski
  assert.equal(k["YOKPORT"].bookingKont, 5);                   // yaklasan booking, hic teklif yok
  // Penceredeki teklifin kendisi (60 gunluk "en iyi" degil)
  assert.deepEqual(k["ORNEKPORT"].teklif, { blok: "AKKON", tutar: 1800, tarih: "2026-11-10T08:00:00Z" });
  assert.equal(k["ESKIPORT"].teklif, null);
  // Kullanici onayina kadar kapali: varsayilan raporda bolum ve etiket YOK
  const kapali = satinAlmaHtml(sa);
  assert.ok(!kapali.includes("Tek Teklifle Karar Verilen Limanlar"));
  assert.ok(!kapali.includes("tek teklif"));
  const html = satinAlmaHtml(sa, { tekTeklif: true });
  assert.ok(html.includes("Tek Teklifle Karar Verilen Limanlar"));
  assert.ok(html.includes("tek teklif"));
  assert.ok(html.includes("Son anlaşma"));
});
