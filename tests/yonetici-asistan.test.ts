import { test } from "node:test";
import assert from "node:assert/strict";
import {
  asistanVerisiNormalize, draftAnahtari, gorevleriKur, gorevSayilari, odemeAnahtari, ozetKonusu, ozetMailiHtml, trTarih,
  OPERASYON_EPOSTASI, type AsistanVerisi,
} from "../supabase/functions/_shared/yonetici-asistan.ts";
import { asistanFiltresi, yoneticiMi } from "../lib/asistan/gorunum.ts";

// Kurgusal veri (repo herkese acik)
const ham = {
  tarih: "2026-11-21",
  draft: [{
    dosya_id: "d1", dosya_no: "IHR-2026-0901", alici_firma: "ORNEK TRADING LTD", varis_limani: "TEMA", bl_no: "ORNKBL1234",
    yukleme: "2026-11-20T10:00:00Z", kontrol_tarihi: "2026-11-20T10:01:00Z", ozet: "2 alan sistemle uyuşmuyor", revize_istendi: false,
    gemi: "ORNEK EXPRESS 047E", acente: "ORNEK HAT",
    alanlar: [{ alan: "Mühür no", sistem: "2 mühür", belge: "0 bulundu", not: "Belgede yok: ORNU1234567 M1" }, { alan: "Notify", sistem: "ORNEK", belge: "BASKA", not: null }],
  }],
  odeme: [{ rezervasyon_id: "r1", dosya_id: "d2", dosya_no: "IHR-2026-0800", alici_firma: "KURGU FOODS", proforma_no: "UNEXKRG0101", varis_limani: "DJIBOUTI",
    gemi: "ORNEK STAR", etd: "2026-10-01", gun: 51, konteyner: 5, konsimento_durumu: "x" }],
  on_odeme: [{ anahtar: "proforma:P1", kaynak: "sistem", proforma_no: "UNEXNTL0202", proforma_tarihi: "2026-11-19", firma: "NORD ORNEK", miktar_mt: 250,
    konteyner: 10, tutar: 26250, para_birimi: "USD", liman: "DJIBOUTI", gun: 2 }],
  kapananlar: [{ tur: "on_odeme", baslik: "UNEXX1", ayrinti: "1000 USD", zaman: "2026-11-20T09:00:00Z" }],
  isaretler: [],
};

test("normalize: bozuk / eksik veri sayfayi dusurmez", () => {
  const v = asistanVerisiNormalize(null);
  assert.deepEqual([v.draft.length, v.odeme.length, v.on_odeme.length, v.isaretler.length], [0, 0, 0, 0]);
  const v2 = asistanVerisiNormalize({ tarih: "2026-11-21", draft: [{ dosya_id: "" }, { dosya_id: "x", alanlar: "bozuk" }], odeme: "yok" });
  assert.equal(v2.draft.length, 1);
  assert.deepEqual(v2.draft[0].alanlar, []);
  assert.equal(v2.odeme.length, 0);
});

test("gorevler: odeme tek gunluk gorev, draft dosya basina; acik olanlar once", () => {
  const v = asistanVerisiNormalize(ham);
  const g = gorevleriKur(v);
  assert.equal(g.length, 2);
  assert.equal(g[0].anahtar, odemeAnahtari("2026-11-21"));
  assert.equal(g[0].alt, "1 sevkiyatın ödemesi girilmemiş · 1 siparişin ön ödemesi bekleniyor");
  assert.equal(g[1].anahtar, "draft:d1:2026-11-20T10:01:00Z");
  assert.equal(g[1].alici, OPERASYON_EPOSTASI);
  assert.equal(g[1].baglanti, "/dosya/d1?tab=evraklar");
  assert.deepEqual(gorevSayilari(g), { acik: 2, gonderildi: 0, draft: 1, odeme: 1, evrak: 1 });
});

test("Gonderdim isareti: gorev 'gonderildi' olur ve sona gider; yeni draft yeni anahtar", () => {
  const v: AsistanVerisi = asistanVerisiNormalize({ ...ham, isaretler: [{ anahtar: "odeme:2026-11-21", tur: "odeme", ozet: null, isleyen: "yonetici@ornek.com", zaman: "2026-11-21T06:00:00Z" }] });
  const g = gorevleriKur(v);
  assert.equal(g[0].tur, "draft_bl");
  assert.equal(g[1].durum, "gonderildi");
  assert.equal(g[1].isaret?.zaman, "2026-11-21T06:00:00Z");
  // Dunun isareti bugunku odeme gorevini kapatmaz
  const dun = gorevleriKur(asistanVerisiNormalize({ ...ham, isaretler: [{ anahtar: "odeme:2026-11-20", tur: "odeme", isleyen: "x", zaman: "2026-11-20T06:00:00Z" }] }));
  assert.equal(dun.find((x) => x.tur === "odeme")?.durum, "acik");
  assert.notEqual(draftAnahtari({ dosya_id: "d1", kontrol_tarihi: "2026-11-22T08:00:00Z", yukleme: null }), g[0].anahtar);
});

test("draft maili: alanlar, sistem / draft degerleri ve acente", () => {
  const g = gorevleriKur(asistanVerisiNormalize(ham)).find((x) => x.tur === "draft_bl")!;
  assert.equal(g.konu, "Draft B/L düzeltme · IHR-2026-0901 · ORNEK TRADING LTD");
  assert.match(g.metin, /• Mühür no — Sistem: 2 mühür \/ Draft: 0 bulundu\n {2}Belgede yok: ORNU1234567 M1/);
  assert.match(g.metin, /• Notify — Sistem: ORNEK \/ Draft: BASKA/);
  assert.match(g.metin, /Acenteden \(ORNEK HAT\) düzeltilmiş draft'ı rica/);
  assert.match(g.alt, /Mühür no, Notify/);
});

test("odeme maili: iki bolum, sira, tutar; booking yok", () => {
  const g = gorevleriKur(asistanVerisiNormalize(ham)).find((x) => x.tur === "odeme")!;
  assert.equal(g.konu, "Ödeme durumu · 21.11.2026");
  assert.match(g.metin, /^Harun Bey merhaba,/);
  assert.match(g.metin, /GEMİSİ KALKMIŞ, ÖDEMESİ GİRİLMEMİŞ SEVKİYATLAR \(1\)\n1\. IHR-2026-0800 · KURGU FOODS · UNEXKRG0101 — kalkış 01\.10\.2026 \(51 gün\) · 5 kont\. · konşimento serbest bırakılmadı/);
  assert.match(g.metin, /ÖN ÖDEMESİ BEKLENEN SİPARİŞLER \(1\)\n1\. UNEXNTL0202 · NORD ORNEK — proforma 19\.11\.2026 · 26\.250 USD · 10 kont\./);
});

test("yalniz odeme ya da yalniz draft; hic yoksa gorev yok", () => {
  assert.equal(gorevleriKur(asistanVerisiNormalize({ ...ham, odeme: [], on_odeme: [] })).length, 1);
  assert.equal(gorevleriKur(asistanVerisiNormalize({ ...ham, draft: [] })).length, 1);
  assert.equal(gorevleriKur(asistanVerisiNormalize({ tarih: "2026-11-21" })).length, 0);
});

test("sabah ozeti: konu, panel baglantilari, B/L no yazilmaz, kacis", () => {
  const v = asistanVerisiNormalize({ ...ham, draft: [{ ...ham.draft[0], alici_firma: "A&B <Ltd>" }] });
  const g = gorevleriKur(v);
  assert.equal(ozetKonusu(g, v.tarih), "Bugün istemeniz gerekenler · 2 görev · 21.11.2026");
  const html = ozetMailiHtml(g, v, "https://ornek.test");
  assert.ok(html.includes("https://ornek.test/asistan?gorev=odeme%3A2026-11-21"));
  assert.ok(html.includes(`https://ornek.test/asistan?gorev=${encodeURIComponent("draft:d1:2026-11-20T10:01:00Z")}`));
  assert.ok(!html.includes("ORNKBL1234"), "B/L no ozet mailinde olmamali");
  assert.ok(html.includes("A&amp;B &lt;Ltd&gt;") && !html.includes("<Ltd>"));
  assert.ok(!ozetMailiHtml(g, v, "https://ornek.test").includes("TEST"));
  assert.ok(ozetMailiHtml(g, v, "https://ornek.test", { test: true, gercekAlici: "yonetici@ornek.com" }).includes("yonetici@ornek.com"));
  assert.ok(ozetMailiHtml([], asistanVerisiNormalize({ tarih: "2026-11-21" }), "https://ornek.test").includes("istemeniz gereken bir şey yok"));
});

test("yonetici kontrolu ve filtre", () => {
  assert.equal(yoneticiMi("Execution@Unex.com.tr "), true);
  assert.equal(yoneticiMi("bbt@unex.com.tr"), false);
  assert.equal(yoneticiMi(null), false);
  assert.equal(asistanFiltresi("gonderildi"), "gonderildi");
  assert.equal(asistanFiltresi("x"), null);
  assert.equal(trTarih("2026-11-21T05:00:00Z"), "21.11.2026");
  assert.equal(trTarih(null), "-");
});

test("zaman ve kapanan ayrintisi bicimi", async () => {
  const { zamanIso, kapananAyrintisi } = await import("../supabase/functions/_shared/yonetici-asistan.ts");
  assert.equal(zamanIso("2026-11-19 13:59:19.164+00"), "2026-11-19T13:59:19.164+00:00");
  assert.equal(zamanIso("2026-11-19T13:01:29.268Z"), "2026-11-19T13:01:29.268Z");
  assert.ok(!Number.isNaN(new Date(zamanIso("2026-11-19 13:59:19.164+00")!).getTime()));
  assert.equal(zamanIso(null), null);
  assert.equal(kapananAyrintisi({ ayrinti: "6375.00 USD" }), "6.375 USD");
  assert.equal(kapananAyrintisi({ ayrinti: "telex" }), "Telex");
  assert.equal(kapananAyrintisi({ ayrinti: "imzali" }), "İmzalı proforma");
  assert.equal(kapananAyrintisi({ ayrinti: null }), "");
});

test("fatura ve beyanname gorevleri: muhasebe / gumruk musaviri, kendi revize metni", () => {
  const v = asistanVerisiNormalize({
    ...ham,
    evrak: [
      { tur: "fatura", dosya_id: "d5", dosya_no: "IHR-2026-0905", alici_firma: "ORNEK TRADING LTD", belge_no: "ORN2026000001", yukleme: "2026-11-20T13:09:19Z",
        kontrol_tarihi: null, alanlar: [{ alan: "Aracı banka", sistem: "ORNEK BANK A", belge: "ORNEK BANK B", not: "Aracı banka proformadaki bankadan farklı." }] },
      { tur: "beyanname", dosya_id: "d6", dosya_no: "IHR-2026-0906", alici_firma: "KURGU FOODS", belge_no: "26ORN0001", yukleme: "2026-11-20T12:00:00Z",
        kontrol_tarihi: "2026-11-20T12:01:00Z", alanlar: [{ alan: "Net ağırlık (toplam)", sistem: "125.000 kg", belge: "120.000 kg", not: null }] },
      { tur: "bozuk", dosya_id: "d7", alanlar: [] },
    ],
  });
  assert.equal(v.evrak.length, 2);
  const g = gorevleriKur(v);
  const f = g.find((x) => x.tur === "fatura")!;
  assert.equal(f.anahtar, "fatura:d5:2026-11-20T13:09:19Z");
  assert.equal(f.sorumlu, "Muhasebe (Harun Bey)");
  assert.equal(f.konu, "Fatura düzeltme · IHR-2026-0905 · ORNEK TRADING LTD");
  assert.match(f.metin, /^Harun Bey merhaba,/);
  assert.match(f.metin, /• Aracı banka — Sistem: ORNEK BANK A \/ Fatura: ORNEK BANK B\n {2}Aracı banka proformadaki bankadan farklı\./);
  const b = g.find((x) => x.tur === "beyanname")!;
  assert.equal(b.sorumlu, "Gümrük müşaviri");
  assert.equal(b.konu, "Gümrük beyannamesi düzeltme · IHR-2026-0906 · KURGU FOODS");
  assert.match(b.metin, /• Net ağırlık \(toplam\) — Sistem: 125\.000 kg \/ Beyanname: 120\.000 kg/);
  assert.equal(b.baglanti, "/dosya/d6?tab=evraklar");
  assert.equal(gorevSayilari(g).evrak, 3);
  // Gonderdim isareti fatura turunde de calisir
  const isaretli = gorevleriKur(asistanVerisiNormalize({ ...ham, evrak: [{ tur: "fatura", dosya_id: "d5", yukleme: "2026-11-20T13:09:19Z", alanlar: [{ alan: "X" }] }],
    isaretler: [{ anahtar: "fatura:d5:2026-11-20T13:09:19Z", tur: "fatura", isleyen: "x", zaman: "2026-11-21T07:00:00Z" }] }));
  assert.equal(isaretli.find((x) => x.tur === "fatura")?.durum, "gonderildi");
  assert.equal(isaretli.find((x) => x.tur === "fatura")?.isaret?.tur, "fatura");
});
