/**
 * Navlun Merkezi saf kurallari (lib/navlun/merkez.ts) - 24.11.2026, Asama 2. Liman listesi, kontrol kuyrugu, kapatma ve
 * 48 saat yaslanma. Veriler KURGUDUR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { kapatildiMi, kontrolKuyrugu, limanListesi, yasYaz, type DegerlendirmeSatiri, type GerceklesenSatiri, type KontrolIslemi } from "@/lib/navlun/merkez";

const SIMDI = Date.parse("2026-11-24T12:00:00Z");

function t(id: string, acente: string, liman: string, tarih: string, toplam: number, x: Partial<DegerlendirmeSatiri> = {}): DegerlendirmeSatiri {
  return {
    teklif_id: id, liman_anahtar: liman, acente, ekipman: "20DC", tutar: toplam, para: "USD", toplam_usd: toplam, lokal: null, ek: 0, lokal_durum: "dahil",
    metin: "lokal dahil", dayanak: null, celiski: null, yaklasik: false, gecerlilik_bitis: "2026-12-31", gecerlilik_kaynagi: "teklif", durum: "kesin", en_iyi: false,
    liman: liman, armator: null, free_time_gun: null, transit_gun: null, tarih, kaynak: "metin", ...x,
  };
}
const islem = (hedef_tur: KontrolIslemi["hedef_tur"], hedef_id: string, i: KontrolIslemi["islem"], zaman: string): KontrolIslemi =>
  ({ id: `${hedef_id}-${i}`, hedef_tur, hedef_id, islem: i, onceki: null, sonraki: null, gerekce: null, kullanici_eposta: null, zaman });
const g = (id: string, durum: GerceklesenSatiri["durum"]): GerceklesenSatiri =>
  ({ sevkiyat_id: id, booking_no: null, acente: "ALFA", liman_anahtar: "ORNEKLIMAN", etd: "2026-11-20", referans_tarih: "2026-11-01", gercek: 900, para: "USD",
    teklif_tutar: 850, teklif_para: "USD", teklif_tarih: "2026-10-30", fark: 50, durum, aciklama: null });
const bos = { degerlendirme: [], gerceklesen: [], islemler: [], okunamayanlar: [], adaylar: [] };

test("limanListesi: acente basina son teklif, en iyi once, hedef / kabul, siralama", () => {
  const l = limanListesi([
    t("a1", "ALFA", "ORNEKLIMAN", "2026-11-01", 900),
    t("a2", "ALFA", "ORNEKLIMAN", "2026-11-10", 950),                         // ALFA'nin guncel teklifi
    t("b1", "BETA", "ORNEKLIMAN", "2026-11-05", 920, { en_iyi: true }),
    t("c1", "GAMA", "ORNEKLIMAN", "2026-11-06", 800, { durum: "eksik", lokal_durum: "bilinmiyor" }),
    t("d1", "ALFA", "IKINCILIMAN", "2026-11-20", 1500, { en_iyi: true }),
  ], [
    { liman_anahtar: "ORNEKLIMAN", tur: "hedef", tutar: 880, armator: null, tarih: "2026-11-02" },
    { liman_anahtar: "ORNEKLIMAN", tur: "hedef", tutar: 860, armator: null, tarih: "2026-11-08" },
    { liman_anahtar: "ORNEKLIMAN", tur: "kabul", tutar: 900, armator: "ORNEKHAT", tarih: "2026-11-09" },
  ]);
  assert.deepEqual(l.map((x) => x.anahtar), ["IKINCILIMAN", "ORNEKLIMAN"]);   // son teklife gore
  const o = l[1];
  assert.deepEqual(o.guncel.map((x) => x.teklif_id), ["b1", "a2", "c1"]);      // en iyi once; kesinler eksikten once
  assert.equal(o.enIyi?.teklif_id, "b1");
  assert.equal(o.tumu.length, 4);
  assert.deepEqual(o.hedef, { tutar: 860, tarih: "2026-11-08" });
  assert.equal(o.kabul?.armator, "ORNEKHAT");
  assert.equal(o.sayilar.eksik, 1);
});

test("kontrolKuyrugu: lokali belirsiz teklifler acente basina tek kalem; kapatma sonrasi yeni teklif yeniden acar", () => {
  const d = [
    t("e1", "ALFA", "ORNEKLIMAN", "2026-11-20T08:00:00Z", 700, { durum: "eksik", lokal_durum: "bilinmiyor" }),
    t("e2", "ALFA", "IKINCILIMAN", "2026-11-23T08:00:00Z", 800, { durum: "eksik", lokal_durum: "bilinmiyor" }),
    t("e3", "BETA", "ORNEKLIMAN", "2026-11-24T08:00:00Z", 750, { durum: "eksik", lokal_durum: "haric" }),
    t("k1", "GAMA", "ORNEKLIMAN", "2026-11-24T10:00:00Z", 900, { durum: "kontrol", celiski: "Maildeki lokal 300 ≠ acente hafızası 250" }),
  ];
  const q = kontrolKuyrugu({ ...bos, degerlendirme: d }, SIMDI);
  const alfa = q.find((k) => k.hedefId === "ALFA");
  assert.ok(alfa);
  assert.equal(alfa.tur, "lokal_belirsiz");
  assert.equal(alfa.teklifler?.length, 2);
  assert.equal(alfa.tarih, "2026-11-20T08:00:00Z");                          // en eski teklif
  assert.equal(alfa.gecikti, true);                                          // 100 saat
  assert.equal(q[0].hedefId, "ALFA");                                        // geciken basa
  assert.match(q.find((k) => k.hedefId === "BETA")!.aciklama, /tutarı bilinmiyor/);
  assert.equal(q.find((k) => k.tur === "celiski")?.hedefId, "k1");

  // ALFA ogretildi (son tekliften sonra) -> duser; BETA'yi 23'unde yoksaydik ama 24'unde yeni belirsiz teklif geldi -> kalir
  const islemler = [islem("acente", "ALFA", "ogret", "2026-11-24T09:00:00Z"), islem("acente", "BETA", "yoksay", "2026-11-23T09:00:00Z"), islem("teklif", "k1", "yoksay", "2026-11-24T11:00:00Z")];
  const q2 = kontrolKuyrugu({ ...bos, degerlendirme: d, islemler }, SIMDI);
  assert.deepEqual(q2.map((k) => k.hedefId), ["BETA"]);
});

test("kontrolKuyrugu: okunamayan / aday / tutmayan; aday okunamayanla cift sayilmaz; onaylanan tutmayan duser", () => {
  const okunamayan = { id: "11111111-1111-1111-1111-111111111111", konu: "ORNEKLIMAN // NAVLUN TALEBI", acente: "ALFA", liman: "ORNEKLIMAN", tarih: "2026-11-24T11:00:00Z", kaynak: "pdf", ozet: "teklif ekte" };
  const aday = { id: "22222222-2222-2222-2222-222222222222", konu: null, acente: null, alan: "ornekacente.com", liman: "ORNEKLIMAN", tarih: "2026-11-21T11:00:00Z", metin: "USD 950", neden: null };
  const q = kontrolKuyrugu({ ...bos, okunamayanlar: [okunamayan], adaylar: [aday, { ...aday, id: okunamayan.id }], gerceklesen: [g("s1", "tutmuyor"), g("s2", "tutuyor")] }, SIMDI);
  assert.deepEqual(q.map((k) => k.tur).sort(), ["aday", "okunamayan", "tutmayan"]);
  assert.match(q.find((k) => k.tur === "aday")!.aciklama, /Tanınmayan gönderen/);
  assert.equal(q.find((k) => k.tur === "okunamayan")!.gecikti, false);
  const q2 = kontrolKuyrugu({ ...bos, gerceklesen: [g("s1", "tutmuyor")], islemler: [islem("gerceklesen", "s1", "onayla", "2026-11-24T11:30:00Z")] }, SIMDI);
  assert.equal(q2.length, 0);
});

test("kapatildiMi: yalniz kapatan islem ve verilen andan sonrasi", () => {
  const l = [islem("gerceklesen", "s1", "duzelt", "2026-11-24T10:00:00Z"), islem("acente", "ALFA", "ogret", "2026-11-22T10:00:00Z")];
  assert.equal(kapatildiMi(l, "gerceklesen", "s1"), null);                   // duzelt gerceklesen kalemini kapatmaz
  assert.ok(kapatildiMi(l, "acente", "ALFA"));
  assert.equal(kapatildiMi(l, "acente", "ALFA", "2026-11-23T00:00:00Z"), null);
  assert.equal(yasYaz(0.5), "az önce");
  assert.equal(yasYaz(30), "30 sa");
  assert.equal(yasYaz(100), "4 gün");
});
