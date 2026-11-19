/**
 * Siparis Bildirim Formu (18.11.2026): model alanlari, gonderim zamani (bos ekipman - 1 gun, 08:00 TR), spekler,
 * Excel parcalari. Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { ayYil, cuvalLotunuAyikla, cuvalTarihleriniAyikla, cuvalTipi, formDurumu, formMailHtml, formModeli, gonderimZamaniMi, haftaBasiTr, LOGO_CID, lotTemizle, spekMetni, spekTemizle, trTarih, urunAdiSade, type FormHam } from "@/supabase/functions/_shared/siparis-formu";
import { gorselBoyutu, gorselTuru, siparisFormuXlsx } from "@/supabase/functions/_shared/siparis-formu-xlsx";

const ham = (ek: Partial<FormHam> = {}): FormHam => ({
  anahtar: "KURGU123",
  adres: "KURGU SOKAK 5, NIAMEY, NIGER",
  plan: { kaynak: "excel", booking_no: "KURGU123", musteri: "KURGU", konteyner: 5, varis_limani: "TEMA", cuval_markasi: "KRG", ambalaj: "50 KG",
    acente: "HAT/KURGU", liman: "MARPORT", ekipman: "KURGU DEPO", ekipman_alim_yeri: "13.11.2026", bos_ekipman_tarihi: "2026-11-13",
    ardiyesiz_giris: "2026-11-16", etd: "2026-11-22", gemi: "KURGU GEMI" },
  siparis: { proforma_no: "PF-KRG-1", proforma_tarihi: "2026-09-16", firma: "KURGU LTD", urun: "PREMIUM FLOUR (KRG BRAND)" },
  dosya: null,
  temsilci: { ad_soyad: "AD SOYAD", eposta: "temsilci@kurgu.test", hitap: "Ad Bey" },
  kalite: null,
  form: { uretim_metin: "NOVEMBER 2026", skt_metin: "NOVEMBER 2027", tarih_kaynagi: "gorsel", spekler: "Protein min 12%\nNem: max 14%", gorsel_yolu: "sirket/KURGU123/1.jpg" },
  gonderim: null,
  test: null,
  ...ek,
});

test("model: sablondaki alanlar plan + siparis listesinden dolar", () => {
  const m = formModeli(ham());
  const a = m.alanlar;
  assert.equal(a.firma, "KURGU LTD");
  assert.equal(a.ulke, "NİJER");
  assert.equal(a.adet, "5*20 DC");
  assert.equal(a.tonaj, "125 MT");
  // Planlanan yukleme = ardiyesiz giris; gonderim gunu = bos ekipman - 1
  assert.equal(a.planlananYukleme, "16.11.2026");
  assert.equal(m.etd, "2026-11-22");
  assert.equal(a.bosEkipman, "KURGU DEPO");
  assert.equal(a.ambalajTipi, "50 KG");
  assert.equal(a.urunTipi, "PREMIUM FLOUR");
  assert.equal(a.proformaNo, "PF-KRG-1");
  assert.equal(a.lotNo, "PF-KRG-1");
  assert.equal(a.siparisTarihi, "16.09.2026");
  assert.equal(a.uretimTarihi, "NOVEMBER 2026");
  assert.equal(a.skt, "NOVEMBER 2027");
  assert.equal(a.temsilci, "AD SOYAD");
  assert.equal(m.alanlar.spekler, "Protein min 12%\nNem: max 14%");
  assert.equal(m.gonderimGunu, "2026-11-12");
  assert.deepEqual(m.girisEksikleri, []);
});

test("model: dosya varsa dosyanin bilgisi onceliklidir; ekipman yerine yazilmis tarih kullanilmaz", () => {
  const m = formModeli(ham({
    plan: { booking_no: "KURGU123", konteyner: 2, ekipman: null, ekipman_alim_yeri: "13.11.2026", bos_ekipman_tarihi: "2026-11-13" },
    dosya: { id: "d1", dosya_no: "IHR-TEST-1", alici_firma: "KURGU FIRMA LTD", varis_limani: "TEMA PORT", lot_no: "LOT-1", proforma_no: "PF-D",
      proforma_tarihi: "2026-10-01", urun_detaylari: [{ urun_adi: "SUPER FLOUR (KRG BRAND)", ambalaj_boyutu: "25 KG" }], detayli_ambalaj: "2.000 PIECES OF 25 KG PP + KRAFT BAGS",
      uretim_tarihi: "2026-10-05", son_kullanim_tarihi: "2027-10-05" },
    form: null,
  }));
  assert.equal(m.alanlar.firma, "KURGU FIRMA LTD");
  assert.equal(m.alanlar.bosEkipman, "");
  assert.equal(m.alanlar.ambalajTipi, "25 KG PP + KRAFT");
  assert.equal(m.alanlar.urunTipi, "SUPER FLOUR");
  assert.equal(m.alanlar.lotNo, "LOT-1");
  // Form tarihi yoksa dosyanin Ek Bilgiler tarihi
  assert.equal(m.alanlar.uretimTarihi, "OCTOBER 2026");
  assert.deepEqual(m.girisEksikleri, ["Çuval görseli", "Ürün spekleri"]);
  assert.ok(m.eksikler.includes("Boş Ekipman Alımı"));
  // Spek girilmediyse formda oneri (varsayilan) yazilir
  assert.equal(m.alanlar.spekler, "Protein min 13%\nGluten min 30%\nKül: max 0,60%\nNem: max 14%");
});

test("eksik giris listesi", () => {
  const m = formModeli(ham({ form: null }));
  assert.deepEqual(m.girisEksikleri, ["Çuval görseli", "Ürün spekleri", "Üretim tarihi", "SKT"]);
});

test("temsilci sabit: veritabanindan gelen tam ad yazilir", () => {
  assert.equal(formModeli(ham({ temsilci: { ad_soyad: "SABIT TEMSILCI" } })).alanlar.temsilci, "SABIT TEMSILCI");
});

test("cuvaldan tarih: gercek OCR ciktilari (ay-yil)", () => {
  const a = cuvalTarihleriniAyikla("Production Date: NOVEMBER 2026\nExpiry Date : NOVEMBER 2027\nBatch No : KURGU1");
  assert.deepEqual([a.uretim?.metin, a.uretim?.tur, a.skt?.metin, a.skt?.iso], ["NOVEMBER 2026", "ay", "NOVEMBER 2027", null]);
  // Buyutulmus gecisin gurultulu satirlari; "PRODUCT OF TURKEY" uretim sayilmaz
  const b = cuvalTarihleriniAyikla("PRODUCT OF TURKEY x 1 yr\nPRODUCTION DATE : NOVEMBER 2026 tre XN | \\ 4\nEXPIRY DATE . NOVEMBER 2027 Tt NN /");
  assert.deepEqual([b.uretim?.metin, b.skt?.metin], ["NOVEMBER 2026", "NOVEMBER 2027"]);
  assert.deepEqual(cuvalTarihleriniAyikla("~_ a PRODUCT OF TURKEY"), { uretim: null, skt: null });
});

test("cuvaldan tarih: tam tarih, Fransizca, sayisal ay-yil; form tarihi karismaz", () => {
  const a = cuvalTarihleriniAyikla("Tarih 05,11,2026\nDATE DE FABRICATION : 12/11/2026\nDATE D'EXPIRATION : 12/11/2027");
  assert.deepEqual([a.uretim?.metin, a.uretim?.iso, a.skt?.iso], ["12.11.2026", "2026-11-12", "2027-11-12"]);
  const b = cuvalTarihleriniAyikla("MFG: 11.2026  EXP: 11.2027");
  assert.deepEqual([b.uretim?.metin, b.skt?.metin], ["NOVEMBER 2026", "NOVEMBER 2027"]);
  const c = cuvalTarihleriniAyikla("PRODUCTION: NOVEMBRE 2026\nBEST BEFORE: NOV. 2027");
  assert.deepEqual([c.uretim?.metin, c.skt?.metin], ["NOVEMBER 2026", "NOVEMBER 2027"]);
});

test("cuvaldan tarih: tutarsiz ya da mantiksiz tarih reddedilir (yanlis tarih yerine okunamadi)", () => {
  assert.deepEqual(cuvalTarihleriniAyikla("Production Date: NOVEMBER 2027\nExpiry Date: NOVEMBER 2026"), { uretim: null, skt: null });
  assert.equal(cuvalTarihleriniAyikla("Production Date: NOVEMBER 1999").uretim, null);
  assert.equal(cuvalTarihleriniAyikla("Production Date: 45.13.2026").uretim, null);
});

test("spek temizleme", () => {
  assert.equal(spekTemizle("  Protein  min 13%\n\n Nem: max 14% \n"), "Protein min 13%\nNem: max 14%");
  assert.equal(spekTemizle(null), "");
});

test("gonderim zamani: ekipman - 1 gun 08:00 TR; ekipman gunu gecmisse gonderilmez", () => {
  const m = { gonderimGunu: "2026-11-12", ekipmanTarihi: "2026-11-13" };
  assert.equal(gonderimZamaniMi(m, "2026-11-11", 900), false);
  assert.equal(gonderimZamaniMi(m, "2026-11-12", 7 * 60 + 59), false);
  assert.equal(gonderimZamaniMi(m, "2026-11-12", 8 * 60), true);
  assert.equal(gonderimZamaniMi(m, "2026-11-13", 6 * 60), true);
  assert.equal(gonderimZamaniMi(m, "2026-11-14", 9 * 60), false);
  assert.equal(gonderimZamaniMi({ gonderimGunu: null, ekipmanTarihi: null }, "2026-11-12", 600), false);
});

test("form durumu", () => {
  const m = { gonderimGunu: "2026-11-12", ekipmanTarihi: "2026-11-13", gonderim: null, gonderilebilir: true };
  assert.equal(formDurumu(m, "2026-11-10"), "bekliyor");
  assert.equal(formDurumu(m, "2026-11-12"), "bugun");
  assert.equal(formDurumu(m, "2026-11-13"), "gecikti");
  assert.equal(formDurumu(m, "2026-11-14"), "suresi_gecti");
  assert.equal(formDurumu({ ...m, gonderim: { zaman: "2026-11-12T05:00:00Z" } }, "2026-11-14"), "gonderildi");
  // 19.11.2026: girisler eksikse gonderilmez
  assert.equal(formDurumu({ ...m, gonderilebilir: false }, "2026-11-12"), "eksik");
  assert.equal(formDurumu({ ...m, gonderilebilir: false, gonderim: { zaman: "2026-11-12T05:00:00Z" } }, "2026-11-14"), "gonderildi");
});

test("gonderim kapisi: gorsel / spek / tarih eksikse form gonderilemez", () => {
  assert.equal(formModeli(ham()).gonderilebilir, true);
  assert.equal(formModeli(ham({ form: { ...ham().form, gorsel_yolu: null } })).gonderilebilir, false);
  assert.equal(formModeli(ham({ form: { ...ham().form, spekler: "" } })).gonderilebilir, false);
  assert.equal(formModeli(ham({ form: null })).gonderilebilir, false);
});

test("lot ve firma duzeltmesi: cuvaldaki lot ve formdaki firma adi dosyadakinin onune gecer", () => {
  const dosya = { id: "d1", dosya_no: "IHR-TEST-2", alici_firma: "KURGU LTDADRES SOKAK", lot_no: "PF-KRG-9R", proforma_no: "PF-KRG-9R" };
  const m = formModeli(ham({ dosya, form: { ...ham().form, lot_no: "PF-KRG-9", firma_adi: "KURGU LTD" } }));
  assert.equal(m.alanlar.lotNo, "PF-KRG-9");
  assert.equal(m.alanlar.firma, "KURGU LTD");
  assert.equal(m.alanlar.proformaNo, "PF-KRG-9R");
  assert.deepEqual(m.duzeltme, { lotNo: "PF-KRG-9", firmaAdi: "KURGU LTD" });
  const bos = formModeli(ham({ dosya }));
  assert.equal(bos.alanlar.lotNo, "PF-KRG-9R");
  assert.equal(bos.alanlar.firma, "KURGU LTDADRES SOKAK");
});

test("cuvaldan lot: LOT NO / Batch No satiri", () => {
  assert.equal(cuvalLotunuAyikla("EXPIRY DATE : OCTOBER 2027\nLOT NO        : KRGLOT160926-1\nPRODUCT OF TURKEY"), "KRGLOT160926-1");
  assert.equal(cuvalLotunuAyikla("Batch No: KRGLOT300926\nProduced & packed"), "KRGLOT300926");
  assert.equal(cuvalLotunuAyikla("LOT NO: KRGLOT160926-4"), "KRGLOT160926-4");
  assert.equal(cuvalLotunuAyikla("PRODUCT OF TURKEY\nNet 25 kg"), "");
  assert.equal(lotTemizle(" krglot 160926-2 "), "KRGLOT160926-2");
});

test("mail: logo gomulu (cid), eksik uyari kutusu yok", () => {
  const m = formModeli(ham());
  const html = formMailHtml(m, "Kurgu Gida", true, true);
  assert.ok(html.includes(`src="cid:${LOGO_CID}"`));
  assert.ok(!html.includes("Eksik bilgi"));
  assert.ok(!formMailHtml(m, "Kurgu Gida", true, false).includes("cid:"));
});

test("spekler: musteri kalite ayarindan, yoksa sablondaki varsayilan", () => {
  assert.equal(spekMetni(null), "Protein min 13%\nGluten min 30%\nKül: max 0,60%\nNem: max 14%");
  const s = spekMetni([
    { parametre: "Protein (N X 5.7on dry basis)", spesifikasyon: "min 11,5%" },
    { parametre: "Moisture", spesifikasyon: "max 14,5 %" },
    { parametre: "Ash Content", spesifikasyon: "Max. 0,55 %" },
    { parametre: "Wet gluten", spesifikasyon: "min 28 %" },
  ]);
  assert.equal(s, "Protein min 11,5%\nGluten min 28%\nKül: max 0,55%\nNem: max 14,5%");
});

test("yardimcilar", () => {
  assert.equal(ayYil("2026-01-31"), "JANUARY 2026");
  assert.equal(ayYil(null), "");
  assert.equal(trTarih("2026-11-13"), "13.11.2026");
  assert.equal(cuvalTipi("ALMAS - UNEX (KRAFT)"), "KRAFT");
  assert.equal(urunAdiSade("ALL PURPOSE WHEAT FLOUR (KRG BRAND)"), "ALL PURPOSE WHEAT FLOUR");
});

test("gorsel boyutu: PNG ve JPEG basligi", () => {
  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  png.set([0, 0, 1, 0], 16); // 256
  png.set([0, 0, 0, 128], 20); // 128
  assert.deepEqual(gorselBoyutu(png), { en: 256, boy: 128 });
  assert.equal(gorselTuru(png), "png");
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(gorselBoyutu(jpg), { en: 600, boy: 300 });
  assert.equal(gorselTuru(jpg), "jpeg");
});

test("Excel: sablon duzeni, eksik alan isareti, resimli / resimsiz paket", async () => {
  const m = formModeli(ham({ form: null }));
  const parcalar = siparisFormuXlsx(m, null, null);
  const sayfa = String(parcalar.find((p) => p.yol === "xl/worksheets/sheet1.xml")!.icerik);
  assert.ok(sayfa.includes("SİPARİŞ BİLDİRİM FORMU"));
  assert.ok(sayfa.includes('<mergeCell ref="A14:D32"/>') && sayfa.includes('<mergeCell ref="D10:D13"/>'));
  assert.ok(sayfa.includes("ÇUVAL GÖRSELİ GİRİLMEDİ"));
  assert.ok(!sayfa.includes("<drawing"));
  const png = new Uint8Array(32);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  png.set([0, 0, 0, 100], 16);
  png.set([0, 0, 0, 50], 20);
  const resimli = siparisFormuXlsx(formModeli(ham()), { veri: png, tur: "png" }, { veri: png, tur: "png" });
  assert.ok(resimli.some((p) => p.yol === "xl/media/image2.png"));
  assert.ok(String(resimli.find((p) => p.yol === "xl/worksheets/sheet1.xml")!.icerik).includes('<drawing r:id="rId1"/>'));
  // Gorsel kayitli ama Excel'e girmediyse (depodan okunamadi) uyari yine yazilir; gorsel girdiyse yazilmaz
  const okunamadi = String(siparisFormuXlsx(formModeli(ham()), null, null).find((p) => p.yol === "xl/worksheets/sheet1.xml")!.icerik);
  assert.ok(okunamadi.includes("ÇUVAL GÖRSELİ GİRİLMEDİ"));
  assert.ok(!String(resimli.find((p) => p.yol === "xl/worksheets/sheet1.xml")!.icerik).includes("ÇUVAL GÖRSELİ GİRİLMEDİ"));
  const zip = new JSZip();
  for (const p of resimli) zip.file(p.yol, p.icerik);
  const b = await zip.generateAsync({ type: "uint8array" });
  assert.ok(b.length > 1000);
});

test("liste haftasi: Yukleme Plani gibi Pazar baslar", () => {
  assert.equal(haftaBasiTr("2026-11-19"), "2026-11-15");
  assert.equal(haftaBasiTr("2026-11-15"), "2026-11-15");
  assert.equal(haftaBasiTr("2026-11-21"), "2026-11-15");
  assert.equal(haftaBasiTr("2026-11-22"), "2026-11-22");
});
