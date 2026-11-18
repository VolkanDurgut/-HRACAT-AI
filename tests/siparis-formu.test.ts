/**
 * Siparis Bildirim Formu (18.11.2026): model alanlari, gonderim zamani (bos ekipman - 1 gun, 08:00 TR), spekler,
 * Excel parcalari. Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { ayYil, cuvalTipi, formDurumu, formModeli, gonderimZamaniMi, spekMetni, trTarih, urunAdiSade, type FormHam } from "@/supabase/functions/_shared/siparis-formu";
import { gorselBoyutu, gorselTuru, siparisFormuXlsx } from "@/supabase/functions/_shared/siparis-formu-xlsx";

const ham = (ek: Partial<FormHam> = {}): FormHam => ({
  anahtar: "KURGU123",
  adres: "KURGU SOKAK 5, NIAMEY, NIGER",
  plan: { kaynak: "excel", booking_no: "KURGU123", musteri: "KURGU", konteyner: 5, varis_limani: "TEMA", cuval_markasi: "KRG", ambalaj: "50 KG",
    acente: "HAT/KURGU", liman: "MARPORT", ekipman: "KURGU DEPO", ekipman_alim_yeri: "13.11.2026", bos_ekipman_tarihi: "2026-11-13", gemi: "KURGU GEMI" },
  siparis: { proforma_no: "PF-KRG-1", proforma_tarihi: "2026-09-16", firma: "KURGU LTD", urun: "PREMIUM FLOUR (KRG BRAND)" },
  dosya: null,
  temsilci: { ad_soyad: "AD SOYAD", eposta: "temsilci@kurgu.test", hitap: "Ad Bey" },
  kalite: null,
  form: { uretim_tarihi: "2026-11-12", skt: "2027-11-12", gorsel_yolu: "sirket/KURGU123/1.jpg" },
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
  assert.equal(a.planlananYukleme, "13.11.2026");
  assert.equal(a.bosEkipman, "KURGU DEPO");
  assert.equal(a.ambalajTipi, "50 KG");
  assert.equal(a.urunTipi, "PREMIUM FLOUR");
  assert.equal(a.proformaNo, "PF-KRG-1");
  assert.equal(a.lotNo, "PF-KRG-1");
  assert.equal(a.siparisTarihi, "16.09.2026");
  assert.equal(a.uretimTarihi, "NOVEMBER 2026");
  assert.equal(a.skt, "NOVEMBER 2027");
  assert.equal(a.temsilci, "AD SOYAD");
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
  assert.deepEqual(m.girisEksikleri, ["Çuval görseli"]);
  assert.ok(m.eksikler.includes("Boş Ekipman Alımı"));
});

test("eksik giris listesi", () => {
  const m = formModeli(ham({ form: null }));
  assert.deepEqual(m.girisEksikleri, ["Çuval görseli", "Üretim tarihi", "SKT"]);
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
  const m = { gonderimGunu: "2026-11-12", ekipmanTarihi: "2026-11-13", gonderim: null };
  assert.equal(formDurumu(m, "2026-11-10"), "bekliyor");
  assert.equal(formDurumu(m, "2026-11-12"), "bugun");
  assert.equal(formDurumu(m, "2026-11-13"), "gecikti");
  assert.equal(formDurumu(m, "2026-11-14"), "suresi_gecti");
  assert.equal(formDurumu({ ...m, gonderim: { zaman: "2026-11-12T05:00:00Z" } }, "2026-11-14"), "gonderildi");
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
  const zip = new JSZip();
  for (const p of resimli) zip.file(p.yol, p.icerik);
  const b = await zip.generateAsync({ type: "uint8array" });
  assert.ok(b.length > 1000);
});
