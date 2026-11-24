/**
 * Draft Evrak Seti maili (24.11.2026): ek adlari Taslak Onay Paketi ile birebir, ek dogrulama, mail icerigi,
 * vektor PDF motorunun saf yardimcilari. Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftEkleriDogrula, draftMail, base64Boyut, DRAFT_EK_ADI } from "../supabase/functions/_shared/draft-evrak-mail.ts";
import { draftEkAdi, baytBase64 } from "@/lib/draft-evrak-adi";
import { buildEvrakPdfDosyaAdi, EVRAK_KISA_KODLARI } from "@/lib/evrak-dosya-adi";
import { renkCoz, fontTuru, metinDonustur, sayfaKesimleri } from "@/lib/html-vektor-pdf";

const PDF = baytBase64(new TextEncoder().encode("%PDF-1.7\nkurgu"));

test("ek adlari Taslak Onay Paketi / Draft butonu adlariyla ayni", () => {
  const dosya = { proforma_no: "KRGPRO01 / KRGPRO02" };
  const rez = [{ booking_no: "KRGBK0001" }];
  assert.equal(draftEkAdi(1, "INVOICE", dosya, rez), "DRAFT- 1- INVOICE- KRGBK0001- KRGPRO01-KRGPRO02.pdf");
  assert.equal(draftEkAdi(1, EVRAK_KISA_KODLARI.ci, dosya, rez), buildEvrakPdfDosyaAdi("taslak", 1, EVRAK_KISA_KODLARI.ci, dosya, rez));
  assert.equal(draftEkAdi(7, EVRAK_KISA_KODLARI.qc, dosya, rez), buildEvrakPdfDosyaAdi("taslak", 7, EVRAK_KISA_KODLARI.qc, dosya, rez));
  assert.equal(draftEkAdi(3, "BL", { proforma_no: null }, []), "DRAFT- 3- BL- BOOKING- PROFORMA.pdf");
  for (const kod of ["INVOICE", "PACKING", "BL", "COO", "PHYTO", "HEALTH", "QUALITY", "FUMIGATION"]) assert.ok(DRAFT_EK_ADI.test(draftEkAdi(1, kod, dosya, rez)), kod);
});

test("ek dogrulama: ad, PDF imzasi, tekrar, sira", () => {
  const ad = (n: number, k: string) => `DRAFT- ${n}- ${k}- KRGBK0001- KRGPRO01.pdf`;
  const iyi = draftEkleriDogrula([{ ad: ad(2, "PACKING"), icerik: PDF }, { ad: ad(1, "INVOICE"), icerik: PDF }]);
  assert.equal(iyi.hata, null);
  assert.deepEqual(iyi.ekler.map((e) => e.ad), [ad(1, "INVOICE"), ad(2, "PACKING")]);
  assert.match(draftEkleriDogrula([]).hata!, /Ek bulunamadı/);
  assert.match(draftEkleriDogrula([{ ad: "fatura.pdf", icerik: PDF }]).hata!, /Geçersiz belge adı/);
  assert.match(draftEkleriDogrula([{ ad: ad(1, "INVOICE"), icerik: btoa("<html>") }]).hata!, /PDF değil/);
  assert.match(draftEkleriDogrula([{ ad: ad(1, "INVOICE"), icerik: PDF }, { ad: ad(1, "INVOICE"), icerik: PDF }]).hata!, /iki kez/);
  assert.match(draftEkleriDogrula([{ ad: "DRAFT- 1- INVOICE- ../x- y.pdf", icerik: PDF }]).hata!, /Geçersiz/);
  assert.equal(base64Boyut(btoa("abcd")), 4);
  assert.equal(base64Boyut(btoa("abcde")), 5);
});

test("mail: musteri adi / e-posta / telefon, ekler, test seridi; kacis", () => {
  const { konu, html } = draftMail({
    dosya_id: "00000000-0000-0000-0000-000000000001", dosya_no: "IHR-2026-9999", proforma_no: "KRGPRO01", alici_firma: "ORNEK <TRADING> LTD",
    alici_email: "ornek@example.com", alici_tel: "+256 000 000 000", alici_adresi: null, booking_no: "KRGBK0001", gemi_adi: "ORNEK VESSEL",
    sefer_no: "KR001E", yuklenme_limani: "ASYAPORT", varis_limani: "Mombasa Port, Kenya", gemi_kalkis_tarihi: "2026-10-28", konteyner_adedi: 10,
  }, ["DRAFT- 1- INVOICE- KRGBK0001- KRGPRO01.pdf"], { site: "https://ornek.test", test: true, gonderen: "kurgu@example.com" });
  assert.equal(konu, "[TEST] Draft Evrak Seti · KRGPRO01 · KRGBK0001 · ORNEK <TRADING> LTD");
  assert.match(html, /Draft Evrak Seti ektedir/);
  assert.match(html, /ORNEK &lt;TRADING&gt; LTD/);
  assert.doesNotMatch(html, /<TRADING>/);
  assert.match(html, /mailto:ornek@example\.com/);
  assert.match(html, /tel:\+256000000000/);
  assert.match(html, /ORNEK VESSEL \/ KR001E/);
  assert.match(html, /28\.10\.2026/);
  assert.match(html, /DRAFT- 1- INVOICE- KRGBK0001- KRGPRO01\.pdf/);
  assert.match(html, /TEST · Bu e-posta yalnızca test adresine/);
  const eksik = draftMail({ dosya_id: "x", dosya_no: null, proforma_no: null, alici_firma: null, alici_email: null, alici_tel: null, alici_adresi: null,
    booking_no: null, gemi_adi: null, sefer_no: null, yuklenme_limani: null, varis_limani: null, gemi_kalkis_tarihi: null, konteyner_adedi: 0 }, [], { site: "https://ornek.test", test: false });
  assert.equal(eksik.konu, "Draft Evrak Seti · -");
  assert.match(eksik.html, /Dosyada kayıtlı değil/);
});

test("vektor PDF motoru yardimcilari", () => {
  assert.deepEqual(renkCoz("rgb(255, 0, 0)"), { r: 1, g: 0, b: 0, a: 1 });
  assert.equal(renkCoz("rgba(190, 30, 30, 0.13)")!.a, 0.13);
  assert.equal(renkCoz("rgb(0 0 0 / 50%)")!.a, 0.5);
  assert.equal(renkCoz("transparent")!.a, 0);
  assert.equal(renkCoz("color(srgb 1 0 0)"), null);
  assert.equal(fontTuru('"Times New Roman", Times, serif'), "serif");
  assert.equal(fontTuru("Arial, Helvetica, sans-serif"), "sans");
  assert.equal(fontTuru("serif"), "serif");
  assert.equal(metinDonustur("total amount", "uppercase"), "TOTAL AMOUNT");
  assert.equal(metinDonustur("ornek liman", "capitalize"), "Ornek Liman");
  // satir ortasindan bolunmez
  assert.deepEqual(sayfaKesimleri(500, 1000, []), [0, 500]);
  const k = sayfaKesimleri(2500, 1000, [{ ust: 990, alt: 1010 }]);
  assert.equal(k[1], 990);
  assert.equal(k[k.length - 1], 2500);
});
