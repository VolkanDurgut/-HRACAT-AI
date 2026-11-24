/**
 * Navlun teklif kalemleri (supabase/functions/_shared/navlun-kalem.ts) - 24.11.2026.
 * Kullanici: "Konteyner basi navlunun dogru hesaplanabilmesi gerekiyor; muhur fiyati + KDV dahil edenler de oluyor."
 * Metinler KURGUDUR (acente / liman adlari yalniz bicim icin); bicimler gercek tekliflerdeki yazim sekillerinden alinmistir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { kalemDogrula, kalemleriOku, kalemOzeti, kalemSayisi, VARSAYILAN_KUR } from "@/supabase/functions/_shared/navlun-kalem";

const kur = { EUR: 1.1, TRY: 0.025, tarih: "test" };

test("tek satir ek kalem: '+Seal Fee : Usd 18+kdv / Cntr' muhur, VGM toplama girmez", () => {
  const k = kalemleriOku([
    "LI Ornekliman (Port) // FO Ornekvaris (Port)",
    "Usd 800 /20'DC – Non imo",
    "+Vgm               : Usd 26+kdv / Cntr",
    "+Seal Fee        : Usd 18+kdv / Cntr",
  ].join("\n"));
  assert.deepEqual(k.map((x) => [x.kod, x.tutar, x.birim, x.kdv]), [["VGM", 26, "konteyner", true], ["MUHUR", 18, "konteyner", true]]);
  const o = kalemOzeti(k, "20DC", kur);
  assert.equal(o.ek, 18);
  assert.equal(o.lokal, null);
  assert.deepEqual(o.digerleri.map((x) => x.kod), ["VGM"]);
});

test("lokal tablosu: fabrika dolum bolumu toplanir, liman dolum bolumu ve BL / kosullu kalemler girmez", () => {
  const metin = [
    "Free in Ornekport -  Free out Ornekvaris",
    "USD 340 / 20' + lokaller",
    "Free Time: BT 21 gün",
    "Ornekport İhracat Lokal Masrafları  (Fabrika Dolum)",
    "20'", "40'",
    "İhracat Liman ve İşletme Giderleri", "USD 45+KDV/Konteyner", "USD 45+KDV/Konteyner",
    "İhracat Yükleme Giderleri", "USD 280/Konteyner", "USD 280/Konteyner",
    "Gemi Güvenlik Hizmet Ücreti", "USD 14+KDV/Konteyner", "USD 14+KDV/Konteyner",
    "Mühür Ücreti", "USD 5/Konteyner", "USD 5/Konteyner",
    "ENS Ücreti (Avrupa Birliği varışlı ülkelerde geçerli olacaktır)", "EUR 34/B-L",
    "VGM İşlem Ücreti (Girişlerin tarafımızca yapılması durumunda fatura edilir.)", "USD 12+KDV/Konteyner",
    "Telex Release&SWB    : USD 40+KDV / BL ( Uzakdoğu yüklemelerinde )",
    "Ornekport İhracat Lokal Masrafları  (Liman Dolum)",
    "20'", "40'",
    "İhracat Terminal ve İşletme Giderleri", "USD 170+KDV/Konteyner", "USD 235+KDV/Konteyner",
  ].join("\n");
  const k = kalemleriOku(metin);
  const o20 = kalemOzeti(k, "20DC", kur);
  assert.equal(o20.bolum, "fabrika");
  assert.equal(o20.lokal, 344);                         // 45 + 280 + 14 + 5
  assert.deepEqual(o20.lokalKalemler.map((x) => x.kod), ["YUKLEME", "YUKLEME", "ISPS", "MUHUR"]);
  assert.equal(o20.ek, 0);
  const ens = k.find((x) => x.kod === "ENS");
  assert.ok(ens && ens.birim === "bl" && ens.kosullu && ens.para === "EUR");
  assert.ok(k.some((x) => x.blok === "liman" && x.tutar === 235 && x.ekipman === "40"));
  assert.equal(kalemOzeti(k, "40HC", kur).lokal, 344);  // liman dolum 235 girmez
});

test("bolum + tek satir: 'Gecici kabul ... Beher konteyner' sayilir, 'Konsimento TL ... Beher set' BL basi", () => {
  const k = kalemleriOku([
    "ORNEK LIMAN FABRIKA DOLUM  IHRACAT LIMAN MASRAFLARI (TASMASIZ, NON-IMO):",
    "Yukleme ucreti               Usd 180,  Beher konteyner,",
    "Gecici kabul ucreti         Usd 150,  (+) Kdv Beher konteyner,",
    "Konsimento ucreti             TL  1.750,    (+) Kdv Beher set",
    "ORNEK LIMAN  DOLUM  IHRACAT LIMAN MASRAFLARI (TASMASIZ, NON-IMO):",
    "Yukleme ucreti              Usd 180,     Beher konteyner,",
    "Liman dolum ucreti      Usd 145/20' (+) Kdv Beher konteyner,",
    "                                         Usd 180/40' (+) Kdv Beher konteyner,",
  ].join("\n"));
  const o = kalemOzeti(k, "20DC", kur);
  assert.equal(o.lokal, 330);
  const bl = k.find((x) => x.kod === "BL");
  assert.ok(bl && bl.birim === "bl" && bl.para === "TRY" && bl.tutar === 1750);
  const ld = k.filter((x) => x.kod === "LIMAN_DOLUM");
  assert.deepEqual(ld.map((x) => [x.tutar, x.ekipman]), [[145, "20"], [180, "40"]]);
});

test("kosullu ve ceza kalemleri toplama girmez; navlun satiri kalem sayilmaz", () => {
  const k = kalemleriOku([
    "Navlun                                 USD   2000 .-/20’dv eca,ebs dahil",
    "+ VGM                                  USD    45 + KDV (tarafımızdan yapılması durumunda)",
    "+Telex release/OBL          USD  75 + KDV /Per BL",
    "+IMO lokal farkı USD 165.-/cntr,",
    "İlave mühür kullanılması halinde USD 25+ KDV per cntr ilave edilmelidir.",
    "13 - Onaylanmış rezervasyonların iptal edilmek istenmesi halinde USD 200 + KDV / Konteyner olarak uygulanacaktır.",
    "**Ornek tahliyesinde ek EIS masrafı usd 250.- /20’ &  usd 300.- /40’ collect olarak alıcıdan tahsil edilir.",
  ].join("\n"));
  assert.ok(!k.some((x) => x.tutar === 2000));
  const o = kalemOzeti(k, "20DC", kur);
  assert.equal(o.ek, 0);
  assert.equal(o.lokal, null);
  assert.ok(k.every((x) => x.kosullu || x.birim !== "konteyner" || x.kod === "VGM"));
  const eis = k.filter((x) => x.kod === "SURSARJ");
  assert.deepEqual(eis.map((x) => [x.tutar, x.ekipman]), [[250, "20"], [300, "40"]]);
});

test("ayni kod iki kez: lokal bolumdeki muhur varken tek satir muhur cift sayilmaz", () => {
  const k = kalemleriOku([
    "Ornek Lokal Masrafları (Fabrika Dolum)",
    "Mühür Ücreti USD 5/Konteyner",
    "Yükleme gideri USD 100/Konteyner",
    "",
    "Free time: 14 gün",
    "+Seal fee USD 18 / cntr",
  ].join("\n"));
  const o = kalemOzeti(k, "20DC", kur);
  assert.equal(o.lokal, 105);
  assert.equal(o.ek, 0);
});

test("USD disi kalem kurla cevrilir ve yaklasik isaretlenir", () => {
  const k = kalemleriOku("+Seal fee EUR 20 / cntr");
  const o = kalemOzeti(k, "20DC", kur);
  assert.equal(o.ek, 22);
  assert.equal(o.yaklasik, true);
});

test("sayi bicimleri", () => {
  assert.equal(kalemSayisi("1.750"), 1750);
  assert.equal(kalemSayisi("1,700.00"), 1700);
  assert.equal(kalemSayisi("45,50"), 45.5);
  assert.equal(kalemSayisi("2.964"), 2964);
  assert.equal(kalemSayisi("18"), 18);
});

test("kalemDogrula: gecersiz kod / tutar / birim atilir", () => {
  assert.equal(kalemDogrula({ kod: "X", tutar: 5, birim: "konteyner" }), null);
  assert.equal(kalemDogrula({ kod: "MUHUR", tutar: -5, birim: "konteyner" }), null);
  assert.equal(kalemDogrula({ kod: "MUHUR", tutar: 5, birim: "kutu" }), null);
  const k = kalemDogrula({ kod: "MUHUR", tutar: 5, birim: "konteyner", kaynak: "yz", ekipman: "20" });
  assert.ok(k && k.kaynak === "yz" && k.para === "USD" && k.ekipman === "20");
  assert.ok(VARSAYILAN_KUR.EUR > 0);
});

// ---------------------------------------------------------------------------------------------------------------
// karsilastir + kalemler (24.11.2026). Kalemler verilmezse hesap eskisiyle birebir ayni.
// ---------------------------------------------------------------------------------------------------------------
import { baglamKur, karsilastir, type AcenteHafizasi } from "@/lib/navlun/karsilastirma";

const hf = (x: Partial<AcenteHafizasi> & Pick<AcenteHafizasi, "acente_anahtar" | "lokal">): AcenteHafizasi => ({
  acente_ad: x.acente_anahtar, lokal_20: null, lokal_40: null, ek_kont: 0, guven: "yuksek", kanit: "test", ...x,
});
const bag = baglamKur([
  hf({ acente_anahtar: "ALFA", lokal: "haric", lokal_20: 344, lokal_40: 344 }),
  hf({ acente_anahtar: "BETA", lokal: "dahil", ek_kont: 18 }),
  hf({ acente_anahtar: "GAMA", lokal: "haric", lokal_20: 300, lokal_40: 300 }),
], [], [], []);
const t = (acente: string, tutar: number, ek: Partial<{ lokal_dahil: boolean | null; ekipman: string; kalemler: ReturnType<typeof kalemleriOku>; para_birimi: string }> = {}) => ({
  acente, tutar, ekipman: ek.ekipman ?? "20DC", lokal_dahil: ek.lokal_dahil ?? null, liman_anahtar: "ORNEK", kalemler: ek.kalemler, para_birimi: ek.para_birimi,
});

test("karsilastir: kalem yoksa eski hesap (hafiza) aynen", () => {
  const k = karsilastir(t("ALFA", 340), bag);
  assert.equal(k.toplam, 684);
  assert.equal(k.kesin, true);
  assert.equal(k.metin, "340 + lokal 344 = 684");
});

test("karsilastir: maildeki lokal tablosu hafizayla ayni -> kesin, kaynak mail tablosu", () => {
  const kalemler = kalemleriOku("Ornek Lokal Masrafları (Fabrika Dolum)\nYükleme gideri USD 300/Konteyner\nGemi güvenlik USD 14+KDV/Konteyner\nMühür Ücreti USD 30/Konteyner");
  const k = karsilastir(t("ALFA", 340, { lokal_dahil: false, kalemler }), bag, kur);
  assert.equal(k.lokal, 344);
  assert.equal(k.toplam, 684);
  assert.equal(k.kesin, true);
  assert.match(k.dayanak, /maildeki lokal tablosu/);
});

test("karsilastir: mail lokali hafizadan farkli -> toplam mailden, kesin degil (kontrol)", () => {
  const kalemler = kalemleriOku("Ornek Lokal Masrafları (Fabrika Dolum)\nYükleme gideri USD 400/Konteyner");
  const k = karsilastir(t("GAMA", 500, { lokal_dahil: false, kalemler }), bag, kur);
  assert.equal(k.toplam, 900);
  assert.equal(k.kesin, false);
  assert.match(k.celiski || "", /400 ≠ acente hafızası 300/);
  assert.match(k.metin, /kontrol/);
});

test("karsilastir: all in / lokal dahil -> maildeki lokal tablosu ve hafiza lokali EKLENMEZ, ek muhur eklenir", () => {
  const kalemler = kalemleriOku("Ornek Lokal Masrafları (Fabrika Dolum)\nYükleme gideri USD 280/Konteyner\n\nFree time 14 gün\n+Seal Fee : Usd 18+kdv / Cntr");
  const k = karsilastir(t("ALFA", 900, { lokal_dahil: true, kalemler }), bag, kur);
  assert.equal(k.lokal, 0);
  assert.equal(k.toplam, 918);
  assert.equal(k.kesin, true);
});

test("karsilastir: mailde ek kalem yoksa hafizadaki ek (muhur 18) kullanilir; mailde varsa mail (cift sayim yok)", () => {
  assert.equal(karsilastir(t("BETA", 800, { kalemler: kalemleriOku("+Vgm : Usd 26+kdv / Cntr") }), bag, kur).toplam, 818);
  assert.equal(karsilastir(t("BETA", 800, { kalemler: kalemleriOku("+Seal Fee : Usd 20+kdv / Cntr") }), bag, kur).toplam, 820);
});

test("karsilastir: EUR teklif kurla USD'ye cevrilip siralanir, yaklasik isaretlenir", () => {
  const k = karsilastir(t("BETA", 1000, { lokal_dahil: true, para_birimi: "EUR" }), bag, kur);
  assert.equal(k.toplam, 1118);                          // 1000 EUR * 1.1 + muhur 18 (hafiza)
  assert.equal(k.yaklasik, true);
  assert.match(k.metin, /1\.000 EUR/);
});

test("sart maddeleri lokal tablosu sayilmaz: 'Genel Sartlar' / numarali madde bolumu bitirir, uzun cumledeki tutar kosullu", () => {
  const k = kalemleriOku([
    "Ornek Lokal Masrafları (Fabrika Dolum)",
    "Yükleme gideri USD 100/Konteyner",
    "Genel Şartlar",
    "Konteyner serme bedeli 2.000 TL",
    "4. Rezervasyonun cut off öncesi kaydırılması durumunda konteyner başına 140 USD / 20' ve 180 USD / 40' yansıtılır.",
    "Teklifimizde belirtilen lokal masraflar kalemlerine ek olarak bu tutarlar oluşabilecek tüm ek hizmetler ve bekleme süreleri için müşteriye ayrıca fatura edilecek olup USD 90 olarak uygulanır.",
  ].join("\n"));
  const o = kalemOzeti(k, "20DC", kur);
  assert.equal(o.lokal, 100);
  assert.equal(o.ek, 0);
});
