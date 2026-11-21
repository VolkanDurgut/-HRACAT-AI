/**
 * PAZAR Musterilerimiz (21.11.2026): Siparis Listesi'ndeki acik siparis musteriyi AKTIF yapar.
 * Veriler KURGUSALDIR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { musteriDurumu } from "@/lib/pazar/musteri";
import type { MusteriSiparisVerisi, PazarFirma } from "@/lib/pazar/veri";

const firma = (id: string, anahtar: string): PazarFirma => ({
  id, ad: anahtar, anahtar, ulke: null, ulke_kaynagi: null, durum: "musteri", kaynak: "siparis", kaynak_etiket: null, alici_adi: null,
  musteri_olma_tarihi: null, created_at: "2026-11-01T00:00:00Z", ek_anahtarlar: [], notlar: null, crm_asama: "yeni",
  sonraki_adim: null, bekleme_bitis: null, son_temas: null,
});
const dosya = (id: string, anahtar: string, tarih: string, durum = "Kapandı") => ({
  id, anahtar, dosya_no: `IHR-${id}`, durum, olusturma_tarihi: tarih, varis_limani: null, alici_adresi: null, ana_siparis_id: null,
  urun_detaylari: null, toplam_konteyner: null, proforma_no: null, toplam_tutar: 1000, para_birimi: "USD",
});
const bos = (): MusteriSiparisVerisi => ({ dosyalar: [], rezervasyonlar: [], konteynerler: [], ana_siparisler: [], siparis_listesi: [], siparis_tarihleri: [] });
const bugun = new Date("2026-11-21T09:00:00Z");

test("Sipariş Listesi'nde ön ödemesi alınmış sipariş: AKTIF, son sipariş proforma tarihi", () => {
  const v = bos();
  v.dosyalar.push(dosya("1", "DEMOGMB", "2026-09-14T08:00:00Z"));
  v.rezervasyonlar.push({ dosya_id: "1", konteyner_adedi: 9 });
  v.siparis_listesi!.push({ firma_id: "f1", proforma_no: "DEMOGTI161126", proforma_tarihi: "2026-11-16", durum: "on_odeme_alindi", miktar_mt: "250.000", konteyner: 10, dosya_no: null, booking_no: null, etd: null });
  v.siparis_tarihleri!.push({ firma_id: "f1", tarih: "2026-11-16" });
  const d = musteriDurumu(firma("f1", "DEMOGMB"), v, bugun);
  assert.equal(d.aktif, true);
  assert.deepEqual(d.listeSiparisleri.map((x) => [x.proforma_no, x.durum, x.miktarMt, x.konteyner]), [["DEMOGTI161126", "on_odeme_alindi", 250, 10]]);
  assert.equal(d.sonSiparis, "2026-11-16");
  assert.equal(d.siparissizGun, 5);
});

test("peşinat bekleyen sipariş de AKTIF; başka firmanın siparişi sayılmaz", () => {
  const v = bos();
  v.siparis_listesi!.push({ firma_id: "f2", proforma_no: "DEMOSAS171126", proforma_tarihi: "2026-11-17", durum: "onay_bekliyor", miktar_mt: 125, konteyner: 5, dosya_no: null, booking_no: null, etd: null });
  assert.equal(musteriDurumu(firma("f2", "DEMOAYRA"), v, bugun).aktif, true);
  assert.equal(musteriDurumu(firma("f3", "DEMOBASKA"), v, bugun).aktif, false);
});

test("açık dosyasıyla zaten görünen sipariş satırı tekrar listelenmez; aynı satır tek", () => {
  const v = bos();
  v.dosyalar.push(dosya("9", "DEMOEMT", "2026-11-18T08:00:00Z", "Açık"));
  v.rezervasyonlar.push({ dosya_id: "9", konteyner_adedi: 2 });
  const satir = { firma_id: "f4", proforma_no: "DEMOEMT160926-4", proforma_tarihi: "2026-09-16", durum: "rezervasyonlu" as const, miktar_mt: 50, konteyner: 2, dosya_no: "IHR-9", booking_no: "BKG", etd: null };
  v.siparis_listesi!.push(satir, { ...satir, dosya_no: null, proforma_no: "DEMOEMT300926" }, { ...satir, dosya_no: null, proforma_no: "DEMOEMT300926" });
  const d = musteriDurumu(firma("f4", "DEMOEMT"), v, bugun);
  assert.equal(d.acikDosyalar.length, 1);
  assert.deepEqual(d.listeSiparisleri.map((x) => x.proforma_no), ["DEMOEMT300926"]);
  assert.equal(d.sonSiparis, "2026-11-18T08:00:00Z", "dosya tarihi daha yeni");
});

test("Sipariş Listesi alanı olmayan eski yanıt: davranış değişmez", () => {
  const v = bos();
  delete v.siparis_listesi; delete v.siparis_tarihleri;
  const d = musteriDurumu(firma("f5", "DEMOX"), v, bugun);
  assert.equal(d.aktif, false);
  assert.deepEqual(d.listeSiparisleri, []);
});
