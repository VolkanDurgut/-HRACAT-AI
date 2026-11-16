/**
 * Operasyon baglantilari (16.11.2026) - lib/operasyon-onerileri.ts. Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bosAlanOnerileri, limanReferansiOku, rezervasyonOnerisiOku, tarihSaatAyir, teslimdenVarisLimani, type OneriFormu } from "@/lib/operasyon-onerileri";

const bosForm: OneriFormu = {
  booking_no: "ORNEK123", gemi_adi: "", sefer_no: "", acente_ismi: "", gemi_kalkis_tarihi: "", talimat_cutoff: "", talimat_cutoff_saat: "",
  beyanname_cutoff: "", beyanname_cutoff_saat: "", ekipman_alim_tarihi: "", ardiyesiz_giris: "", yuklenme_limani: "", varis_limani: "",
  konteyner_adedi: 0, navlun_tutari: "", lokal_masraf_tutari: "",
};
const ham = {
  plan: {
    booking_no: "ORNEK123", gemi_adi: "Ornek Gemi", sefer_no: "x1", acente_ismi: "Ornek Hat", gemi_kalkis_tarihi: "2026-12-01",
    talimat_cutoff: "2026-11-27T17:00:00+00:00", beyanname_cutoff: "2026-11-28T00:00:00+00:00", ekipman_alim_tarihi: "2026-11-20",
    ardiyesiz_giris: "2026-11-24", yuklenme_limani: "Ornekport", varis_limani: "ORNEK LIMANI", konteyner_adedi: 4, musteri: "ORNEK MUSTERI",
    navlun_tutari: 1250.5, lokal_masraf_tutari: "300", navlun_para: "USD",
  },
  navlun: [{ tutar: 1780, para: "usd", tarih: "2026-11-12T08:15:24+00:00", acente: "Ornek Acente", armator: null, konu: "ORNEK", eslesme: "booking" },
           { tutar: 0, para: "USD", tarih: "", eslesme: "liman" }],
};

test("rezervasyon onerisi okunur; sifir tutarli anlasma atilir", () => {
  const o = rezervasyonOnerisiOku(ham);
  assert.equal(o.plan?.gemi_adi, "Ornek Gemi");
  assert.equal(o.plan?.lokal_masraf_tutari, 300);
  assert.equal(o.navlun.length, 1);
  assert.equal(o.navlun[0].para, "USD");
  assert.equal(o.navlun[0].eslesme, "booking");
  assert.deepEqual(rezervasyonOnerisiOku(null), { plan: null, navlun: [] });
});

test("kesim saati formun okuma kuraliyla ayni; 00:00 bos", () => {
  assert.deepEqual(tarihSaatAyir("2026-11-27T17:00:00+00:00"), ["2026-11-27", "17:00"]);
  assert.deepEqual(tarihSaatAyir("2026-11-28T00:00:00+00:00"), ["2026-11-28", ""]);
  assert.deepEqual(tarihSaatAyir(null), ["", ""]);
});

test("yalniz bos alanlar doldurulur, yazilan ezilmez", () => {
  const { plan } = rezervasyonOnerisiOku(ham);
  const o = bosAlanOnerileri({ ...bosForm, gemi_adi: "ELLE YAZILDI", navlun_tutari: "999" }, plan, "USD");
  assert.equal(o.gemi_adi, undefined);
  assert.equal(o.navlun_tutari, undefined);
  assert.equal(o.sefer_no, "X1");
  assert.equal(o.acente_ismi, "ORNEK HAT");
  assert.equal(o.talimat_cutoff, "2026-11-27");
  assert.equal(o.talimat_cutoff_saat, "17:00");
  assert.equal(o.beyanname_cutoff, "2026-11-28");
  assert.equal(o.beyanname_cutoff_saat, undefined);
  assert.equal(o.konteyner_adedi, 4);
  assert.equal(o.lokal_masraf_tutari, "300");
  assert.equal(o.varis_limani, undefined, "varis limani dosyanindir; plandan doldurulmaz");
});

test("para birimi farkliysa navlun / lokal onerilmez", () => {
  const { plan } = rezervasyonOnerisiOku(ham);
  const o = bosAlanOnerileri(bosForm, plan, "EUR");
  assert.equal(o.navlun_tutari, undefined);
  assert.equal(o.lokal_masraf_tutari, undefined);
  assert.equal(bosAlanOnerileri(bosForm, plan, null).navlun_tutari, "1250.50");
  assert.deepEqual(bosAlanOnerileri(bosForm, null, "USD"), {});
});

test("teslim ifadesinden varis limani (SQL kuraliyla ayni)", () => {
  assert.equal(teslimdenVarisLimani("CIF DJIBOUTI PORT BASIS"), "DJIBOUTI");
  assert.equal(teslimdenVarisLimani("CFR Dar es Salaam Port, Tanzania"), "Dar es Salaam");
  assert.equal(teslimdenVarisLimani("cif ornek limani basis"), "ornek limani");
  assert.equal(teslimdenVarisLimani("FOB AMBARLI PORT"), null);
  assert.equal(teslimdenVarisLimani("EXW"), null);
  assert.equal(teslimdenVarisLimani(""), null);
});

test("liman referansi ucuzdan pahaliya; bos anlasma null", () => {
  const r = limanReferansiOku({ liman: "ORNEK", teklifler: [{ acente: "B", tutar: 2000, tarih: "2026-11-10" }, { acente: "A", tutar: "1500", tarih: "2026-11-11", lokal_dahil: true }], anlasma: { tutar: 0 } });
  assert.deepEqual(r.teklifler.map((t) => t.acente), ["A", "B"]);
  assert.equal(r.teklifler[0].lokal_dahil, true);
  assert.equal(r.anlasma, null);
  assert.equal(limanReferansiOku({ anlasma: { tutar: 1850, tarih: "2026-11-12", armator: "Ornek" } }).anlasma?.tutar, 1850);
});
