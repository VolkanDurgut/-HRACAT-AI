/**
 * 19.11.2026 navlun denetimi (tablo <-> mailler). Bulunan sinif hatalari; veriler kurgusaldir.
 * - selamlamadaki "Saygılarımla,"dan SONRA yazilan teklif okunmuyordu (okunamadi)
 * - buyuk harf "ONE" / "Hat:ONE" armator sayilmiyordu (yanindaki "Msc" yaziliyordu)
 * - bitisik "FT10"
 * - genel tarifede EUR satirlar atiliyordu; sart metnindeki kosullu "lokal dahil degildir" satirlara yazilmiyordu
 * - sabit yerlesimli form teklifinde rota basina "FT N DAYS - ARMATOR"; elle duzeltilen teklife yorumdaki armator
 * - tablo: armatorsuz teklif ayni acente + limanin tek armatoruna baglanir; TOAMASINA = TAMATAVE
 */
import { test } from "node:test";
import assert from "node:assert/strict";

type Olay = { tur: string; liman: string | null; tutar: number | null; ekipman: string | null; armator: string | null; free_time_gun: number | null; lokal_dahil: boolean | null; para_birimi?: string };
const yukle = (ad: string) => import(new URL(`../supabase/functions/_shared/${ad}.ts`, import.meta.url).href);
const ACENTE = { "ornek-acente.test": "Ornek Acente" };
const oku = async (govde: string, konu = "RE: UNEX // ORNEKPORT // NAVLUN TALEBİ HK."): Promise<Olay[]> =>
  (await yukle("navlun-oku")).navlunMesajOku({ konu, gonderen: "satis@ornek-acente.test", govde }, ACENTE);

test("selamlamadaki imzadan sonra yazilan teklif okunur; imzadaki telefon tutar sayilmaz", async () => {
  const o = await oku("Bey Merhaba,\nTeklifimiz aşağıdaki gibidir.\nSaygılarımla,\n\nAMBARLI - ORNEKPORT\n\n20 DC : 750 USD\n\nMAERSK LINE , 14 GUN FREE TIME\n\n31.12 GECERLIDIR.\n\nBest Regards / Saygılarımla\n\nOrnek Kisi\nm. +90-500-000-0000\nOrnek Adres No: 7/E");
  const t = o.filter((x) => x.tur === "teklif");
  assert.equal(t.length, 1);
  assert.equal(t[0].tutar, 750);
  assert.equal(t[0].armator, "Maersk");
  assert.equal(t[0].free_time_gun, 14);
  // fiyatsiz normal imza eskisi gibi kesilir
  const { yeniKisim } = await yukle("navlun-oku");
  assert.equal(yeniKisim("Merhaba,\nFiyat 900 USD.\n\nSaygılarımla,\nOrnek Kisi\nTel 0212 000 00 00"), "Merhaba,\nFiyat 900 USD.");
});

test("ONE armatoru: 'Hat:ONE' fiyata en yakin armator; ingilizce 'one' armator degil", async () => {
  const o = await oku("Bey merhaba,\n\nMsc dışı tek alternatifimiz One line ile aşağıdaki gibidir.\n\nHat:ONE\n\nAll in- 1*20'DC -4650 USD\n\nVgm, pol lokaller dahildir.");
  const t = o.find((x) => x.tur === "teklif")!;
  assert.equal(t.tutar, 4650);
  assert.equal(t.armator, "ONE");
  const { armatorAdi, tekArmator } = await yukle("navlun-oku");
  assert.equal(armatorAdi("Hat: ONE"), "ONE");
  assert.equal(armatorAdi("Ocean Network Express"), "ONE");
  assert.equal(armatorAdi("only one container please"), null);
  assert.equal(tekArmator("FT 5 DAYS - ONE"), "ONE");
});

test("bitisik FT10 free time okunur", async () => {
  const t = (await oku("Merhaba,\n\nMAERSK USD1850 FT10\n\nIyi calismalar")).find((x) => x.tur === "teklif")!;
  assert.equal(t.tutar, 1850);
  assert.equal(t.free_time_gun, 10);
});

test("genel tarife: EUR satirlar da yazilir; kosullu 'lokal dahil degildir' karar vermez (acente hafizasi)", async () => {
  const govde = "Merhabalar,\n\nRELAY - Free time: 21 Days (Validity 30.11.2026)\nCurrency\n20DV\nORNEKA (ULKEA)\nUSD\n1600\nORNEKB (ULKEB)\nEUR\n2810\nORNEKC (ULKEC)\nUSD\n1800\n\n"
    + "1 - Navlun teklifimize yukarıda belirttiğimiz kalemler dahildir. Ayrıca belirtilmediği müddetçe, teklifimize yükleme ve tahliye limanı lokal masrafları dahil değildir.";
  const o = (await oku(govde, "RE: ORNEK // BOLGE & BOLGE // IHRACAT NAVLUN TEKLIFI")).filter((x) => x.tur === "teklif");
  assert.equal(o.length, 3);
  const b = o.find((x) => x.liman === "ORNEKB")!;
  assert.equal(b.para_birimi, "EUR");
  assert.equal(b.tutar, 2810);
  assert.equal(o.find((x) => x.liman === "ORNEKA")!.para_birimi, undefined);
  assert.ok(o.every((x) => x.lokal_dahil === null));
  const { lokalDurumu } = await yukle("navlun-oku");
  assert.equal(lokalDurumu("Ayrıca belirtilmediği müddetçe lokal masrafları dahil değildir. Fiyatımıza lokaller dahildir."), true);
  assert.equal(lokalDurumu("Fiyata lokal masrafları dahil değildir."), false);
  // varis tarafinin lokali cikis lokalini haric yapmaz; "pol lokaller & BL ucreti dahil" dahildir
  assert.equal(lokalDurumu("Teklifimize pol lokaller & BL ücreti dahil olup, Vgm masrafı, tahliye lokal masrafları, gümrük masrafları dahil değildir."), true);
  assert.equal(lokalDurumu("Tahliye limanı lokal masrafları dahil değildir."), null);
  assert.equal(lokalDurumu("Navlun 900 usd. Gümrük masrafları dahil değildir."), null);
  assert.equal(lokalDurumu("navlun 900 usd"), null);
});

const KN = (yorum: string) => "Teklif Geçerlilik Süresi 01.11.2026 - 30.11.2026 "
  + "Ambarli M → OrnekA Port → Port Services Curr 20GE - Rate Total USD 475.00 "
  + "Ambarli M → OrnekB Port → Port Services Curr 20GE - Rate Total USD 175.00 "
  + `Pricing Comment ${yorum} Sayfa 2 / 8 Ornek Sigorta`;

test("form teklifi: rota basina 'FT N DAYS - ARMATOR' sirayla; sayi tutmazsa yazilmaz", async () => {
  const { ekFormuOku } = await yukle("navlun-oku");
  const o: Olay[] = ekFormuOku(KN("FT 14 DAYS - MAERSK FT 5 DAYS - ONE"), "RE: UNEX // ORNEKA // NAVLUN TALEBİ HK.");
  const a = o.find((x) => x.tutar === 475)!, b = o.find((x) => x.tutar === 175)!;
  assert.deepEqual([a.armator, a.free_time_gun, b.armator, b.free_time_gun], ["Maersk", 14, "ONE", 5]);
  const o2: Olay[] = ekFormuOku(KN("FT 14 DAYS FT 5 DAYS - ONE"), "RE: UNEX // ORNEKA // NAVLUN TALEBİ HK.");
  assert.ok(o2.every((x) => x.armator === null && x.free_time_gun === null));
});

test("elle duzeltilen teklif icin ek yorumundaki tek armator (ek_armator)", async () => {
  const { ekBilgisi } = await yukle("navlun-isle");
  assert.equal(ekBilgisi({ govde: "Merhaba", ek_metin: "x Pricing Comment Subject to space. Carrier Hapag FT 5 Days at Dest. Sayfa 2" }).ek_armator, "Hapag-Lloyd");
  assert.equal(ekBilgisi({ govde: "Merhaba", ek_metin: "x Pricing Comment FT 14 DAYS - MAERSK FT 5 DAYS - ONE" }).ek_armator, null);
  assert.equal(ekBilgisi({ govde: "Merhaba", ek_metin: "" }).ek_armator, null);
});

test("tablo: armatorsuz teklif ayni acente + limanin tek armatoruna; iki armator varsa dokunulmaz; TOAMASINA = TAMATAVE", async () => {
  const { navlunTablosuHesapla } = await yukle("navlun-tablosu");
  const olay = (acente: string, armator: string | null, tutar: number, tarih: string, liman = "ORNEKPORT") =>
    ({ tur: "teklif", liman, liman_anahtar: liman, acente, armator, tutar, para_birimi: "USD", ekipman: "20DC", free_time_gun: null, tarih, lokal_dahil: null });
  const t = navlunTablosuHesapla([
    olay("Ornek Acente", "CMA CGM", 2250, "2026-10-09T08:00:00Z"), olay("Ornek Acente", null, 2450, "2026-11-17T08:00:00Z"),
    olay("Diger Acente", "MSC", 5150, "2026-11-02T08:00:00Z", "ORNEKB"), olay("Diger Acente", "ONE", 4650, "2026-11-02T09:00:00Z", "ORNEKB"),
    olay("Diger Acente", null, 4900, "2026-11-03T09:00:00Z", "ORNEKB"),
    olay("Ornek Acente", "CMA CGM", 1600, "2026-11-01T08:00:00Z", "TOAMASINA"), olay("Ornek Acente", "CMA CGM", 1650, "2026-11-02T08:00:00Z", "TAMATAVE"),
  ], [], "2026-11-19");
  const adlar = t.bloklar.map((b: { ad: string }) => b.ad);
  assert.ok(!adlar.includes("ORNEK ACENTE"), adlar.join(","));
  assert.ok(adlar.includes("DIGER ACENTE"));           // iki armatorlu limanda armatorsuz teklif ayri kalir
  assert.equal(t.limanlar.filter((l: { anahtar: string }) => l.anahtar === "TAMATAVE" || l.anahtar === "TOAMASINA").length, 1);
});

test("sonraki satirdaki soru ('Hedef var midir?') onceki satirdaki fiyati soru yapmaz; ayni satirdaki soru yapar", async () => {
  const o = await oku("Gunaydin\n\nUsd 425/20dc\n\nMaersk\n\nOrnekhattan daha uygun bekliyorum\n\nHedef var midir?");
  assert.equal(o.find((x) => x.tur === "teklif")?.tutar, 425);
  const s = await oku("Merhaba,\n\n65-70 usd all in mi bu 2X20lik icin ?");
  assert.ok(!s.some((x) => x.tur === "teklif"));
});

test("masraf kaleminin '&' ile devam eden tutari navlun degildir", async () => {
  const o = await oku("Merhaba,\n\nUsd 800 /20'DC\n\nTahliyede ek EIS masrafı usd 250.- /20' &  usd 300.- /40' & usd 500.-/40 Reefer collect olarak alıcıdan tahsil edilir.");
  assert.deepEqual(o.filter((x) => x.tur === "teklif").map((x) => x.tutar), [800]);
});

test("'14 MERGED free time ... Tt/ 46 gun': free time 14, transit 46", async () => {
  const t = (await oku("Merhaba,\n\nAmbarlı to Ornekport // port to port 5950 USD / 40HQ 14 MERGED free time var Hat / Cma Tt/ 46 gün Navlun, vgm ve Tr lokaller dahildir."))
    .find((x) => x.tur === "teklif") as Olay & { transit_gun: string | null };
  assert.equal(t.free_time_gun, 14);
  assert.equal(t.transit_gun, "46");
  assert.equal(t.ekipman, "40HC");
});

test("takip cevabi 'Bu teklife 14 gun verebiliriz. 36 gun via Ornekport': free time 14, transit 36", async () => {
  const { ekBilgisi } = await yukle("navlun-isle");
  const b = ekBilgisi({ govde: "Merhaba Volkan bey\n\nBu teklife 14 gun verebiliriz.\n36 gun via Ornekport\n\nOrnek Kisi", ek_metin: "" });
  assert.equal(b.free_time_gun, 14);
  assert.equal(b.transit_gun, "36");
});

test("takip cevabi '14 free 28 gun tt': free time 14, transit 28", async () => {
  const { ekBilgisi } = await yukle("navlun-isle");
  const b = ekBilgisi({ govde: "14 free 28 gun tt\n\nBooking onayı verildikten sonra iptal masrafı oluşmaktadır.", ek_metin: "" });
  assert.equal(b.free_time_gun, 14);
  assert.equal(b.transit_gun, "28");
});
