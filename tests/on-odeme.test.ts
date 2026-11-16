/**
 * On odeme dagitimi - istemci yardimcilari (lib/on-odeme.ts). Hesabin kendisi veritabaninda (on_odeme_dagitim);
 * yuzde okuma kurali SQL on_odeme_orani_oku ile AYNI olmali. Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { beklenenAvans, dagitimOku, onOdemeOrani } from "@/lib/on-odeme";

test("odeme sartindan on odeme yuzdesi", () => {
  assert.equal(onOdemeOrani("%30 ADVANCE PAYMENT, BALANCE AGAINST COPY OF BL"), 30);
  assert.equal(onOdemeOrani("% 20 ADVANCE PAYMENT, BALANCE TT BANK TRANSFER"), 20);
  assert.equal(onOdemeOrani("30% advance, 70% against documents"), 30);
  assert.equal(onOdemeOrani("%50 ADVANCE PAYMENT&BALANCE 30 DAYS"), 50);
  assert.equal(onOdemeOrani("%25 DEPOSIT"), 25);
  assert.equal(onOdemeOrani("%12,5 PREPAYMENT"), 12.5);
});

test("yuzde on odemeye ait degilse null", () => {
  assert.equal(onOdemeOrani("%100 PAYMENT AGAINST COPY OF ORIGINAL SHIPMENT DOCUMENTS"), null);
  assert.equal(onOdemeOrani("INVOICE AMOUNT BANK TRANSFER WITHIN 7 DAYS"), null);
  assert.equal(onOdemeOrani(null), null);
  assert.equal(onOdemeOrani("%150 ADVANCE"), null);
});

test("yeni sevkiyatin baslangic avansi = tutar x yuzde (kurus yuvarlama)", () => {
  assert.equal(beklenenAvans(72750, "%30 ADVANCE PAYMENT"), 21825);
  assert.equal(beklenenAvans(57125.55, "%30 ADVANCE"), 17137.67);
  assert.equal(beklenenAvans(50000, "INVOICE AMOUNT BANK TRANSFER"), null);
  assert.equal(beklenenAvans(null, "%30 ADVANCE"), null);
});

test("RPC cevabi okunur; bilinmeyen durum reddedilir", () => {
  const d = dagitimOku({
    durum: "tamam", anahtar: "UNEXTST010199", para: "USD", havuz: 40000, havuz_tutar: 40000, havuz_para: "USD", karsilik: null,
    oran: 30, oran_kaynak: "odeme_sekli", dagitilan: 27000, kalan: 13000,
    dosyalar: [
      { id: "a", dosya_no: "IHR-T-1", durum: "Kapalı", tutar: 40000, mevcut: 12000, pay: 12000, kilit: "kapali", dagitimli: true },
      { id: "b", dosya_no: "IHR-T-2", durum: "Açık", tutar: "50000", mevcut: null, pay: "15000", kilit: null, dagitimli: false },
    ],
  });
  assert.ok(d);
  assert.equal(d!.kalan, 13000);
  assert.equal(d!.dosyalar[1].tutar, 50000);
  assert.equal(d!.dosyalar[1].pay, 15000);
  assert.equal(d!.dosyalar[0].kilit, "kapali");
  assert.equal(dagitimOku({ durum: "bilinmiyor" }), null);
  assert.equal(dagitimOku(null), null);
});
