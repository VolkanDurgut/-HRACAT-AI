/**
 * PAZAR rehber listesi (lib/pazar/liste.ts) + yonetici paneli hesaplari (lib/pazar/panel.ts).
 * Veriler KURGUSALDIR (gercek musteri bilgisi repoda tutulmaz).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { listeEpostalari, listeFirmalariniBirlestir, listeSayfalariniOku, sayfaUlkesi } from "@/lib/pazar/liste";
import { aksiyonlar, ekipOzeti, huni, ulkeOzeti } from "@/lib/pazar/panel";
import type { PazarFirma, PazarGelen, PazarTemas, TakipGorev } from "@/lib/pazar/veri";
import type { XlsxSayfasi } from "@/lib/xlsx-oku";

const BASLIK = [null, "Firma", "Kişi", "Mail", "Telefon", "Fax", "Adres", "Not"];
const sayfa = (ad: string, satirlar: (string | null)[][]): XlsxSayfasi => ({ ad, satirlar: [[], BASLIK, ...satirlar] });
// Kaba anahtar (sunucudaki pazar_anahtar yerine; testte yeterli)
const anahtar = (ad: string) => ad.toUpperCase().replace(/\b(LTD|CO|SARL)\b/g, "").replace(/[^A-Z0-9]/g, "");

test("sayfa adi ulkeye cevrilir; ulke olmayan sayfa null", () => {
  assert.equal(sayfaUlkesi("Gana"), "GANA");
  assert.equal(sayfaUlkesi("Dubai"), "BİRLEŞİK ARAP EMİRLİKLERİ");
  assert.equal(sayfaUlkesi("Kongo, Dem."), "KONGO DEMOKRATİK CUMHURİYETİ");
  assert.equal(sayfaUlkesi("Hırvatistan"), "HIRVATİSTAN");
  assert.equal(sayfaUlkesi("aaa"), null);
});

test("bolum basliklari, hizmet bolumleri ve Turkiye varsayilan haric; kaymis satir duzeltilir", () => {
  const o = listeSayfalariniOku([
    sayfa("Gana", [
      [null, "Deneme Biscuit Ltd", "Mr Ali", "ali@deneme-biscuit.example", "+233 20 000 0001", null, "Accra", "rakip müşterisi"],
      [null, "BANKA", null, null, null, null, null, null],
      [null, "Ornek Bank", "Ms Banker", "info@ornek-bank.example", null, null, null, null],
      [null, "Pirinç", null, null, null, null, null, null],
      [null, "Pirinc Alici Co", "Mr Rice", "rice@pirinc-alici.example", null, null, null, null],
    ]),
    sayfa("Malezya", [
      [null, "MALAYSIA", "Kaymis Foods Sdn Bhd", "Ms Lee", "lee@kaymis-foods.example", "+60 3 0000 0000", null, null],
    ]),
    sayfa("Türkiye", [[null, "Yerli Lojistik", "Ahmet", "a@yerli.example", null, null, null, null]]),
    sayfa("aaa", [[null, "Gözetim Firması", "Ayşe", "x@gozetim.example", null, null, null, null]]),
  ]);
  const g = Object.fromEntries(o.gruplar.map((x) => [x.kod, x]));
  assert.equal(g["Gana"].dahil, true);
  assert.equal(g["Gana › BANKA"].dahil, false);
  assert.equal(g["Gana › Pirinç"].dahil, true, "Pirinç bir urun bolumu; musteri sayilir");
  assert.equal(g["Türkiye"].dahil, false);
  assert.equal(g["aaa"].dahil, false);
  assert.equal(o.kaydirilan, 1);
  const kaymis = o.satirlar.find((s) => s.sayfa === "Malezya")!;
  assert.equal(kaymis.firma, "Kaymis Foods Sdn Bhd");
  assert.equal(kaymis.kisi, "Ms Lee");
  assert.equal(kaymis.mail, "lee@kaymis-foods.example");
  assert.equal(kaymis.telefon, "+60 3 0000 0000");
  assert.ok(!o.satirlar.some((s) => s.firma === "BANKA" || s.firma === "Pirinç"), "baslik satiri firma olmaz");
});

test("firma adi bos ise kisi adi kullanilir (uyari); ikisi de bos ise atlanir", () => {
  const o = listeSayfalariniOku([sayfa("Togo", [
    [null, "-", "Mr Kofi\nDirector", "kofi@ornek.example", null, null, null, null],
    [null, "-", "-", null, null, null, null, null],
  ])]);
  assert.equal(o.satirlar.length, 1);
  assert.equal(o.satirlar[0].firma, "Mr Kofi");
  assert.ok(o.uyarilar.some((u) => u.includes("kişi adı firma adı")));
});

test("e-posta metin icinden cikarilir; bozuk adres isaretlenir", () => {
  assert.deepEqual(listeEpostalari("(Mr Kim):kim@ornek.example ; sales@ornek.example(?"), [
    { eposta: "kim@ornek.example", gecerli: true }, { eposta: "sales@ornek.example", gecerli: true },
  ]);
  assert.equal(listeEpostalari("ali@@ornek.example")[0].gecerli, false);
  assert.deepEqual(listeEpostalari("Adres yazilmis, mail yok"), []);
});

test("birlestirme: ayni firma farkli sayfalarda tek kayit; genel kisa ad farkli ulkede ayri; notlar korunur", () => {
  const o = listeSayfalariniOku([
    sayfa("Fransa", [[null, "Deneme Cereal", "Mr A, Mr B", "a@deneme-cereal.example; b@deneme-cereal.example", "Tel: +33 (0) 1 00 00 00 01", "-", "Paris", "Un işi yapmıyorlar"]]),
    sayfa("Portekiz", [[null, "DENEME CEREAL", null, null, null, null, null, null], [null, "trader", "Mr X", "x@ornek.example", null, null, null, null]]),
    sayfa("Benin", [[null, "trader", "Mr Y", "y@ornek.example", null, null, null, null]]),
  ]);
  const f = listeFirmalariniBirlestir(o.satirlar, o.satirlar.map((s) => anahtar(s.firma)), "Deneme listesi");
  const cereal = f.find((x) => x.anahtar === "DENEMECEREAL")!;
  assert.deepEqual(cereal.kaynaklar, ["Fransa:3", "Portekiz:3"]);
  assert.equal(cereal.ulke, "FRANSA");
  assert.deepEqual(cereal.kisiler.map((k) => [k.ad, k.eposta]), [["Mr A", "a@deneme-cereal.example"], ["Mr B", "b@deneme-cereal.example"]]);
  assert.deepEqual(cereal.kisiler[0].telefonlar, ["33100000001"], "(0) atilir");
  assert.match(cereal.notlar, /Deneme listesi · Fransa \(satır 3\)\nNot: Un işi yapmıyorlar\nAdres: Paris\nTelefon: Tel: \+33/);
  assert.ok(!cereal.notlar.includes("Faks"), "'-' yazilmaz");
  const trader = f.filter((x) => x.ad.startsWith("trader"));
  assert.equal(trader.length, 2);
  assert.deepEqual(trader.map((x) => x.ad).sort(), ["trader", "trader (Benin)"]);
});

// ---------------------------------------------------------------------------
// Yonetici paneli
// ---------------------------------------------------------------------------

const firma = (id: string, ek: Partial<PazarFirma> = {}): PazarFirma => ({
  id, ad: `Firma ${id}`, anahtar: id.toUpperCase(), ulke: "GANA", ulke_kaynagi: "excel", durum: "potansiyel", kaynak: "fuar", kaynak_etiket: null,
  alici_adi: null, musteri_olma_tarihi: null, created_at: "2026-11-01T08:00:00Z", ek_anahtarlar: [], notlar: null, crm_asama: "yeni",
  sonraki_adim: null, bekleme_bitis: null, son_temas: null, ...ek,
});
const temas = (firma_id: string, adim: PazarTemas["adim"], olusturma: string, sonuc: PazarTemas["sonuc"] = null): PazarTemas => ({
  id: `${firma_id}-${adim}-${olusturma}`, firma_id, adim, kanal: adim === "sonuc" || adim === "atla" ? null : "eposta", sonuc, alici: null, konu: null, isleyen: "export@", olusturma,
});
const gelen = (firma_id: string, tarih: string, oneri: PazarGelen["oneri"] = null): PazarGelen => ({ id: `g-${firma_id}-${tarih}`, firma_id, gonderen: "x@ornek.example", konu: "Re: offer", ozet: null, tarih, tur: "cevap", oneri });
const gorev = (firma_id: string, tarih: string, atanan: string, durum: TakipGorev["durum"], son: TakipGorev["son"] = null): TakipGorev => ({
  tarih, atanan, sira: 1, neden: "potansiyel", durum, isleyen: null, tamamlanma: null, firma_id, son,
});

test("aksiyonlar: ulasma sonrasi cevap (sonuc girilmemis) / musteri mailinde siparis sinyali / teklif / islenmeyen gorev", () => {
  const firmalar = [
    firma("a", { crm_asama: "sorgulandi" }), firma("b", { durum: "musteri" }), firma("c", { crm_asama: "teklif", son_temas: "2026-11-12T09:00:00Z" }),
    firma("d"), firma("e", { crm_asama: "sorgulandi" }), firma("f", { crm_asama: "sorgulandi" }),
  ];
  const temaslar = [
    temas("a", "sorgulama", "2026-11-11T09:00:00Z"),
    temas("e", "sorgulama", "2026-11-11T09:00:00Z"), temas("e", "sonuc", "2026-11-13T09:00:00Z", "ilgilenmiyor"),
    temas("f", "sorgulama", "2026-11-12T09:00:00Z"),
  ];
  const gelenler = [
    gelen("a", "2026-11-12T10:00:00Z"), // cevap, sonuc yok -> aksiyon
    gelen("b", "2026-11-13T10:00:00Z", "siparis"), // ulasma yok, musteri yazismasi -> sinyal
    gelen("e", "2026-11-12T10:00:00Z"), // sonuc sonradan girilmis -> aksiyon yok
    gelen("f", "2026-11-10T10:00:00Z"), // ulasmadan ONCE gelen mail -> cevap sayilmaz
  ];
  const gorevler = [gorev("d", "2026-11-11", "export2", "bekliyor"), gorev("a", "2026-11-11", "export", "yapildi", { adim: "sorgulama", kanal: "eposta", sonuc: null, konu: null, olusturma: "2026-11-11T09:00:00Z" })];
  const a = aksiyonlar({ bugun: "2026-11-16", firmalar, temaslar, gelenler, gorevler });
  assert.deepEqual(a.map((x) => [x.tur, x.firma_id]), [["cevap", "a"], ["oneri", "b"], ["teklif", "c"], ["islenmedi", "d"]]);
  assert.equal(a[0].kim, "export");
  assert.equal(a[3].kim, "export2");
});

test("ekip ozeti: gorev -> islenen -> ulasilan -> donus; huni ve ulke ozeti", () => {
  const firmalar = [firma("a", { crm_asama: "sorgulandi" }), firma("b", { crm_asama: "cevap", ulke: "TOGO" }), firma("c", { durum: "musteri", ulke: "TOGO" }), firma("d")];
  const temaslar = [temas("a", "sorgulama", "2026-11-11T09:00:00Z"), temas("b", "sorgulama", "2026-11-11T09:00:00Z"), temas("b", "sonuc", "2026-11-13T09:00:00Z", "cevap")];
  const gorevler = [
    gorev("a", "2026-11-11", "export", "yapildi"), gorev("b", "2026-11-11", "export", "yapildi"),
    gorev("d", "2026-11-16", "export", "bekliyor"), gorev("c", "2026-11-12", "export2", "atlandi"),
  ];
  const ekip = ekipOzeti({ bugun: "2026-11-16", ekip: [{ kod: "export", eposta: "export@ornek.example", hitap: "İhracat 1", sira: 1, aktif: true }, { kod: "export2", eposta: "export2@ornek.example", hitap: null, sira: 2, aktif: true }],
    firmalar, temaslar, gelenler: [], gorevler });
  assert.deepEqual(ekip[0], { kod: "export", ad: "İhracat 1", bugunToplam: 1, bugunIslenen: 0, gorev: 3, islenen: 2, atlanan: 0, islenmeyen: 0, ulasilan: 2, cevap: 1, teklif: 0, siparis: 0 });
  assert.equal(ekip[1].atlanan, 1);
  const epostali = new Set(["d"]);
  const h = Object.fromEntries(huni(firmalar, epostali).map((x) => [x.kod, x.adet]));
  assert.equal(h.sira, 1);
  assert.equal(h.sorgulandi, 1);
  assert.equal(h.cevap, 1);
  const u = ulkeOzeti({ firmalar, temaslar, gelenler: [], epostali });
  assert.deepEqual(u.map((x) => [x.ulke, x.musteri, x.potansiyel, x.ulasilan, x.cevap]), [["TOGO", 1, 1, 1, 1], ["GANA", 0, 2, 1, 0]]);
});
