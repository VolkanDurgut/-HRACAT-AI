/**
 * 25.11.2026: Ic Piyasa > Gemi Tahliye - rapor hesabi, liman listesi ayristirma, Excel sayfalari. Veriler KURGUDUR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GemiAlici, GemiArac, GemiTahliye, aracFarki, eskiGemiAlicilari, isEmriSatislariniEkle, bekleyenDurumu, farkTonu, farkYazi, gemiRaporu, limanBekliyorMu, limanListesiAyristir, araclariSirala } from "@/lib/ic-piyasa/gemi-tahliye";
import { gemiRaporSayfalari, gemiRaporDosyaAdi } from "@/lib/ic-piyasa/gemi-tahliye-xlsx";

const gemi: GemiTahliye = {
  id: "g1", company_id: "c", gemi_adi: "MV KURGU YILDIZ", satici: "KURGU SATICI", tahliye_limani: "KURGU LIMANI", urun: "Buğday", kalite: null,
  bl_kg: 200000, baslangic: null, durum: "acik", kapanis_zamani: null, notlar: null, olusturan_email: null, olusturma: "2026-11-25T08:00:00Z",
};
const alicilar: GemiAlici[] = [
  { id: "a1", gemi_id: "g1", firma: "KURGU ALICI A", miktar_kg: 60000, notlar: null, olusturma: "1" },
  { id: "a2", gemi_id: "g1", firma: "KURGU ALICI B", miktar_kg: 30000, notlar: null, olusturma: "2" },
];
let n = 0;
const arac = (tarih: string, plaka: string, liman: number, teslim: number | null, alici: string | null): GemiArac => ({
  id: `x${++n}`, gemi_id: "g1", alici_id: alici, tarih, plaka, liman_kg: liman, teslim_kg: teslim, kaynak: alici ? "ofis" : "kantar",
  uyarilar: [], notlar: null, girilen_email: null, olusturma: `2026-11-25T10:${String(n).padStart(2, "0")}:00Z`,
});
const araclar: GemiArac[] = [
  arac("2026-11-25", "34 KRG 001", 29000, 28960, null),
  arac("2026-11-25", "34 KRG 002", 30000, 30000, null),
  arac("2026-11-26", "34 KRG 001", 28000, 27940, null),
  arac("2026-11-25", "34 KRG 101", 31000, null, "a1"),
  arac("2026-11-26", "34 KRG 102", 30000, null, "a1"),
  arac("2026-11-26", "34 KRG 201", 31000, null, "a2"),
];

test("Gemi raporu: gelen / yuzde / UNEX fark ve fire yalniz UNEX araclarindan", () => {
  const r = gemiRaporu(gemi, alicilar, araclar);
  assert.equal(r.gelenKg, 179000);
  assert.equal(r.gelenArac, 6);
  assert.equal(Math.round(r.yuzde * 100) / 100, 89.5);
  assert.equal(r.kalanKg, 21000);
  assert.equal(r.unexLimanKg, 87000);
  assert.equal(r.unexTeslimKg, 86900);
  assert.equal(r.unexFarkKg, -100);
  assert.equal(Math.round((r.firePct ?? 0) * 1000) / 1000, 0.115);
  // Kalan arac: sablondaki (=gelen/ortalama = gelen arac sayisi) hatasi yok; kalan / ortalama yukari
  assert.equal(r.kalanAracTahmini, Math.ceil(21000 / (179000 / 6)));
  assert.deepEqual(r.yerler.map((y) => [y.ad, y.limanKg, y.arac, y.kalanKg]), [
    ["UNEX GIDA", 87000, 3, null], ["KURGU ALICI A", 61000, 2, -1000], ["KURGU ALICI B", 31000, 1, -1000],
  ]);
  assert.deepEqual(r.gunler.map((g) => [g.tarih, g.arac]), [["2026-11-26", 3], ["2026-11-25", 3]]);
});

test("Gemi raporu: arac yokken bolme hatasi yok", () => {
  const r = gemiRaporu(gemi, [], []);
  assert.equal(r.gelenKg, 0);
  assert.equal(r.kalanAracTahmini, null);
  assert.equal(r.firePct, null);
  assert.equal(r.yuzde, 0);
});

test("Arac sirasi: tarih, sonra giris sirasi", () => {
  const s = araclariSirala(araclar);
  assert.deepEqual(s.slice(0, 3).map((a) => a.plaka), ["34 KRG 001", "34 KRG 002", "34 KRG 101"]);
});

test("Liman listesi: sablon satiri, tek bosluklu plaka, TAB, binlik nokta, baslik ve hatalar", () => {
  const metin = [
    "TARİH\tPLAKA\tLİMAN\tGİTTİĞİ YER\tGEMİ İSMİ",
    "20.11.2026\t34KRG301\t26400\tKURGU ALICI A\tMV KURGU YILDIZ",
    "34 KRG 302 30.960",
    "34 KRG 1234 25800",
    "21/11/26;34KRG303;29,5",
    "34KRG304 999999",
    "31.02.2026 34KRG305 28000",
    "",
    "kurgu yok",
  ].join("\n");
  const { satirlar, hatalar } = limanListesiAyristir(metin, "2026-11-25");
  assert.deepEqual(satirlar.map((s) => [s.tarih, s.plaka, s.liman_kg]), [
    ["2026-11-20", "34 KRG 301", 26400],
    ["2026-11-25", "34 KRG 302", 30960],
    ["2026-11-25", "34 KRG 1234", 25800],
  ]);
  assert.deepEqual(hatalar.map((h) => h.satir), [5, 6, 7, 9]);
  assert.match(hatalar[0].hata, /ton mu/);
  assert.match(hatalar[1].hata, /60\.000/);
  assert.match(hatalar[2].hata, /Tarih/);
});

test("Excel: ana sayfa + UNEX + her alici; toplamlar ve ozet", () => {
  const s = gemiRaporSayfalari(gemi, alicilar, araclar);
  assert.deepEqual(s.map((x) => x.ad), ["MV KURGU YILDIZ", "MV KURGU YILDIZ- UNEX", "MV KURGU YILDIZ- KURGU ALICI A", "MV KURGU YILDIZ- KURGU ALICI B"]);
  const ana = s[0].satirlar;
  assert.deepEqual(ana[0]?.map((h) => h?.v), ["TARİH", "PLAKA", "LİMAN", "TESLİM", "FARK", "GİTTİĞİ YER", "GEMİ İSMİ"]);
  // satis aracinda teslim / fark bos
  const satis = ana.find((r) => r[1]?.v === "34 KRG 101");
  assert.equal(satis?.[3]?.v, null);
  assert.equal(satis?.[5]?.v, "KURGU ALICI A");
  const toplam = ana.find((r) => r[0]?.v === "TOPLAM");
  assert.deepEqual(toplam?.slice(1, 5).map((h) => h?.v), ["6 araç", 179000, 86900, -100]);
  const yuzde = ana.find((r) => r[1]?.v === "%");
  assert.equal(yuzde?.[2]?.v, 89.5);
  assert.ok(s.every((x) => x.ad.length <= 31));
});

test("Excel: uzun / ayni kisaltmali sayfa adlari benzersiz ve <= 31", () => {
  const uzun = [
    { id: "u1", gemi_id: "g1", firma: "KURGU COK UZUN ALICI FIRMA ADI TICARET 1", miktar_kg: 1, notlar: null, olusturma: "1" },
    { id: "u2", gemi_id: "g1", firma: "KURGU COK UZUN ALICI FIRMA ADI TICARET 2", miktar_kg: 1, notlar: null, olusturma: "2" },
  ];
  const ad = gemiRaporSayfalari(gemi, uzun, []).map((x) => x.ad);
  assert.equal(new Set(ad.map((a) => a.toUpperCase())).size, ad.length);
  assert.ok(ad.every((a) => a.length <= 31));
});

test("Excel dosya adi ASCII", () => {
  assert.equal(gemiRaporDosyaAdi({ gemi_adi: "MV ÇİĞ ÖRNEK" }, "2026-11-25"), "25.11.2026_MV_CIG_ORNEK_TAHLIYE_RAPORU.xlsx");
});

test("Iki asama: yoldaki UNEX araci fark / fire'ye girmez, ayri sayilir", () => {
  const ek = [...araclar, arac("2026-11-26", "34 KRG 003", 30000, null, null)];
  const r = gemiRaporu(gemi, alicilar, ek);
  assert.equal(r.yoldaArac, 1);
  assert.equal(r.yoldaKg, 30000);
  assert.equal(r.unexLimanKg, 117000);
  assert.equal(r.unexTeslimliLimanKg, 87000);
  assert.equal(r.unexFarkKg, -100);
  assert.equal(Math.round((r.firePct ?? 0) * 1000) / 1000, 0.115);
  assert.equal(r.yerler[0].yoldaArac, 1);
  const s = gemiRaporSayfalari(gemi, alicilar, ek);
  const satir = s[0].satirlar.find((x) => x[1]?.v === "34 KRG 003");
  assert.equal(satir?.[3]?.v, null);
  assert.equal(satir?.[4]?.v, null);
  assert.equal(satir?.[5]?.v, "UNEX GIDA (tartım bekliyor)");
  assert.ok(s[0].satirlar.some((x) => x[1]?.v === "Yolda (tartım bekleyen)" && x[2]?.v === 30000));
});

test("Fabrika esasli: liman fisi bekleyen otomatik arac gelene kantar kg ile girer, fark / fireye girmez", () => {
  const bekleyen: GemiArac = { ...arac("2026-11-26", "34 KRG 004", 0, 26500, null), liman_kg: null, kaynak: "otomatik" };
  const ek = [...araclar, bekleyen];
  const r = gemiRaporu(gemi, alicilar, ek);
  assert.equal(r.gelenKg, 179000 + 26500);
  assert.equal(r.gelenArac, 7);
  assert.equal(r.limanBekleyenArac, 1);
  assert.equal(r.limanBekleyenKg, 26500);
  assert.equal(r.unexLimanKg, 87000);
  assert.equal(r.unexTeslimKg, 86900 + 26500);
  assert.equal(r.unexEslesmisTeslimKg, 86900);
  assert.equal(r.unexFarkKg, -100);
  assert.equal(Math.round((r.firePct ?? 0) * 1000) / 1000, 0.115);
  assert.equal(r.yoldaArac, 0);
  assert.equal(aracFarki(bekleyen), null);
  assert.equal(limanBekliyorMu(bekleyen), true);
  const s = gemiRaporSayfalari(gemi, alicilar, ek);
  const satir = s[0].satirlar.find((x) => x[1]?.v === "34 KRG 004");
  assert.equal(satir?.[2]?.v, null);
  assert.equal(satir?.[3]?.v, 26500);
  assert.equal(satir?.[4]?.v, null);
  assert.equal(satir?.[5]?.v, "UNEX GIDA (liman fişi bekleniyor)");
  // Ana sayfa TOPLAM satirinin LIMAN sutunu yalniz liman agirliklari (179.000)
  const toplam = s[0].satirlar.find((x) => x[0]?.v === "TOPLAM");
  assert.equal(toplam?.[2]?.v, 179000);
  assert.ok(s[0].satirlar.some((x) => x[1]?.v === "Liman fişi bekleyen" && x[2]?.v === 26500));
});

test("bekleyenDurumu: aday yok -> excel, aday var -> onay, kaldirildi -> kapali", () => {
  const f = { fis_id: "f", fis_kodu: "K1", plaka: "34 KRG 9", net_kg: 1, cikis: "", net_fark: 40, dolu_fark: 90, dakika: 20, puan: 0 };
  assert.equal(bekleyenDurumu({ adaylar: [], kapali: false }), "excel");
  assert.equal(bekleyenDurumu({ adaylar: [f], kapali: false }), "onay");
  assert.equal(bekleyenDurumu({ adaylar: [f], kapali: true }), "kapali");
});

test("farkYazi / farkTonu: eksik kirmizi -120, fazla yesil +60", () => {
  assert.equal(farkYazi(-120), "-120");
  assert.equal(farkYazi(60), "+60");
  assert.equal(farkYazi(0), "0");
  assert.equal(farkYazi(1240), "+1.240");
  assert.equal(farkTonu(-20), "eksik");
  assert.equal(farkTonu(40), "fazla");
  assert.equal(farkTonu(0), "esit");
});

// ---- 26.11.2026 gemiden satis (is emri) ----
test("isEmriSatislariniEkle: is emri yer + sevk araci olarak rapora girer, toplamlar tutar", () => {
  const emirler = [
    { id: "ie1", is_emri_no: "IE-KURGU-1", firma: "KURGU UN A.S.", hedef_tur: "kg" as const, hedef_kg: "50000", olusturma: "2026-11-26T08:00:00Z" },
    { id: "ie2", is_emri_no: "IE-KURGU-2", firma: "KURGU GIDA LTD.", hedef_tur: "arac" as const, hedef_kg: null, olusturma: "2026-11-26T08:05:00Z" },
  ];
  const sevkler = [
    // 23:30 UTC = ertesi gun Turkiye saatiyle
    { id: "s1", is_emri_id: "ie1", plaka: "34 KRG 301", net_kg: "26000", irsaliye_no: "KRG2026000000001", irsaliye_tarihi: "2026-11-26T23:30:00Z", irsaliye_dosya_yolu: "c/irsaliye/ie1/1.pdf", girilen_email: null, olusturma: "2026-11-26T23:31:00Z" },
    { id: "s2", is_emri_id: "ie1", plaka: "34 KRG 302", net_kg: 25000, irsaliye_no: null, irsaliye_tarihi: null, irsaliye_dosya_yolu: null, girilen_email: null, olusturma: "2026-11-26T10:00:00Z" },
    { id: "s3", is_emri_id: "ie2", plaka: "34 KRG 303", net_kg: 27000, irsaliye_no: null, irsaliye_tarihi: null, irsaliye_dosya_yolu: null, girilen_email: null, olusturma: "2026-11-26T11:00:00Z" },
    { id: "s9", is_emri_id: "baska", plaka: "34 KRG 309", net_kg: 1, irsaliye_no: null, irsaliye_tarihi: null, irsaliye_dosya_yolu: null, girilen_email: null, olusturma: "2026-11-26T11:00:00Z" },
  ];
  const t = isEmriSatislariniEkle("g1", alicilar, araclar, emirler, sevkler);
  assert.equal(t.alicilar.length, alicilar.length + 2);
  assert.equal(t.araclar.length, araclar.length + 3, "baska is emrinin sevki girmez");
  const s1 = t.araclar.find((a) => a.id === "s1")!;
  assert.equal(s1.tarih, "2026-11-27");
  assert.equal(s1.kaynak, "irsaliye");
  assert.equal(s1.liman_kg, 26000);
  assert.deepEqual(t.araclar.find((a) => a.id === "s2")!.uyarilar, ["İrsaliyesiz elle giriş"]);

  const r = gemiRaporu(gemi, t.alicilar, t.araclar);
  const r0 = gemiRaporu(gemi, alicilar, araclar);
  assert.equal(r.gelenKg, r0.gelenKg + 78000);
  assert.equal(r.gelenArac, r0.gelenArac + 3);
  assert.equal(r.unexLimanKg, r0.unexLimanKg, "UNEX toplamina karismaz");
  const y1 = r.yerler.find((y) => y.aliciId === "ie1")!;
  assert.equal(y1.hedefKg, 50000);
  assert.equal(y1.limanKg, 51000);
  assert.equal(y1.kalanKg, -1000);
  const y2 = r.yerler.find((y) => y.aliciId === "ie2")!;
  assert.equal(y2.hedefKg, null, "arac hedefli is emrinde tonaj yok");
  assert.equal(y2.kalanKg, null);

  // Excel: is emri sayfasi uretilir, arac hedefli de bozulmaz
  const sayfalar = gemiRaporSayfalari(gemi, t.alicilar, t.araclar);
  assert.ok(sayfalar.some((s) => s.ad.includes("KURGU UN")));
  assert.ok(sayfalar.some((s) => s.ad.includes("KURGU GIDA")));
});

test("isEmriSatislariniEkle: is emri yoksa listeler aynen doner", () => {
  const t = isEmriSatislariniEkle("g1", alicilar, araclar, [], []);
  assert.equal(t.alicilar, alicilar);
  assert.equal(t.araclar, araclar);
});

test("eskiGemiAlicilari: is emri satirlarini arac formundan ayirir", () => {
  const l = [{ id: "a", is_emri_no: null }, { id: "b", is_emri_no: "IE-KURGU-1" }, { id: "c" }];
  assert.deepEqual(eskiGemiAlicilari(l).map((x) => x.id), ["a", "c"]);
});

test("Excel renk (27.11.2026): fark bandi, satis satiri, bekleyen yer, kalan / % / fire durum stilleri", async () => {
  const { XS } = await import("@/lib/xlsx-yaz");
  const { farkStili, kalanStili } = await import("@/lib/ic-piyasa/gemi-tahliye-xlsx");
  assert.equal(farkStili(40), XS.gFarkOk);
  assert.equal(farkStili(-100), XS.gFarkOk);
  assert.equal(farkStili(120), XS.gFarkUyari);
  assert.equal(farkStili(-300), XS.gFarkUyari);
  assert.equal(farkStili(301), XS.gFarkHata);
  assert.equal(kalanStili(4560), XS.gKalanUyari);
  assert.equal(kalanStili(0), XS.gKalanOk);
  assert.equal(kalanStili(-4080), XS.gKalanHata);

  const bekleyen: GemiArac = { ...arac("2026-11-26", "34 KRG 005", 0, 26000, null), liman_kg: null, kaynak: "otomatik" };
  const s = gemiRaporSayfalari(gemi, alicilar, [...araclar, bekleyen]);
  const ana = s[0].satirlar;
  assert.equal(ana[0]?.[0]?.s, XS.gBaslik);
  const unex = ana.find((r) => r[1]?.v === "34 KRG 001");
  assert.equal(unex?.[4]?.s, XS.gFarkOk); // -40
  const satis = ana.find((r) => r[1]?.v === "34 KRG 101");
  assert.equal(satis?.[0]?.s, XS.gSatisTarih);
  assert.equal(satis?.[5]?.s, XS.gSatisAlici);
  assert.equal(satis?.[3]?.v, null); // deger degismez
  const bek = ana.find((r) => r[1]?.v === "34 KRG 005");
  assert.equal(bek?.[5]?.s, XS.gBekleyen);
  // gun bandi: 25.11 ve 26.11 farkli zemin
  const g25 = ana.find((r) => r[1]?.v === "34 KRG 002");
  const g26 = ana.find((r) => r[1]?.v === "34 KRG 001" && (r[0]?.v as Date).getDate() === 26);
  assert.notEqual(g25?.[1]?.s, g26?.[1]?.s);
  // ozet: bekleyen 26.000 ile gelen 205.000 > B/L 200.000 -> kalan eksi ve % > 100 kirmizi
  assert.equal(ana.find((r) => r[1]?.v === "KALAN KG")?.[2]?.s, XS.gKalanHata);
  assert.equal(ana.find((r) => r[1]?.v === "%")?.[2]?.s, XS.gYuzdeHata);
  // bekleyensiz: kalan 21.000 sari, %89,5 duz
  const s0 = gemiRaporSayfalari(gemi, alicilar, araclar)[0].satirlar;
  assert.equal(s0.find((r) => r[1]?.v === "KALAN KG")?.[2]?.s, XS.gKalanUyari);
  assert.equal(s0.find((r) => r[1]?.v === "%")?.[2]?.s, XS.gYuzde);
  assert.equal(ana.find((r) => r[1]?.v === "KURGU ALICI A")?.[5]?.s, XS.gKalanHata); // 60.000 - 61.000 = -1.000 (fazla)
  // renk anahtari I sutununda, sayfa izgarasiz
  assert.equal(ana[1]?.[8]?.v, "RENK ANAHTARI");
  assert.equal(s[0].izgaraGizle, true);
  // alici sayfasi KALAN
  const a2 = s.find((x) => x.ad.endsWith("KURGU ALICI B"))!;
  assert.equal(a2.satirlar.find((r) => r[1]?.v === "KALAN")?.[2]?.s, XS.gKalanHata); // 30.000 - 31.000
});
