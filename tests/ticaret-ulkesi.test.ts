/** 20.11.2026: ticaret yapilan ulke - elle deger once gelir; Surinam ve eksik Amerika ulkeleri (kurgu adresler). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dosyaTicaretUlkesi, gidecegiUlke, ticaretYapilanUlke, ULKE_ADLARI, varisLimaniUlkeli } from "@/lib/ulke-bul";

test("Surinam ve yeni Amerika ulkeleri adresten bulunur", () => {
  assert.equal(ticaretYapilanUlke("ADDRESS: ORNEK SOKAK 1, PARAMARIBO, SURINAME PHONE: +597 000-0000"), "SURİNAM");
  assert.equal(ticaretYapilanUlke("ORNEK CAD. 5, GEORGETOWN, GUYANA"), "GUYANA");
  assert.equal(ticaretYapilanUlke("ORNEK ST, PORT OF SPAIN, TRINIDAD AND TOBAGO"), "TRİNİDAD VE TOBAGO");
  assert.equal(gidecegiUlke("PARAMARIBO PORT"), "SURİNAM");
  assert.ok(ULKE_ADLARI.includes("SURİNAM"));
});

test("elle girilen ulke adresin onune gecer; bos ise adresten", () => {
  const adres = "ORNEK SOKAK 1, PORT LOUIS, MAURITIUS";
  assert.equal(dosyaTicaretUlkesi(null, adres), "MAURİTİUS");
  assert.equal(dosyaTicaretUlkesi("  ", adres), "MAURİTİUS");
  assert.equal(dosyaTicaretUlkesi("Suriname", adres), "SURİNAM");          // bilinen yazim Turkce ada cevrilir
  assert.equal(dosyaTicaretUlkesi("Ornekistan", adres), "ORNEKİSTAN");     // bilinmeyen: buyuk harfle aynen
  assert.equal(dosyaTicaretUlkesi(null, "ADRES YOK"), null);
});

test("24.11.2026: fatura talimatinda varis limani ulkesiyle (ulke yazmiyorsa eklenir)", () => {
  assert.equal(varisLimaniUlkeli("ASHDOD PORT"), "ASHDOD PORT, İSRAİL");
  assert.equal(varisLimaniUlkeli("MOMBASA PORT"), "MOMBASA PORT, KENYA");
  assert.equal(varisLimaniUlkeli("DAR SALAAM PORT"), "DAR SALAAM PORT, TANZANYA");
  assert.equal(varisLimaniUlkeli("MUTSAMUDU PORT"), "MUTSAMUDU PORT, KOMORLAR");
  // ulke zaten yaziyorsa aynen
  assert.equal(varisLimaniUlkeli("MOMBASA PORT, KENYA"), "MOMBASA PORT, KENYA");
  assert.equal(varisLimaniUlkeli("TEMA PORT GHANA"), "TEMA PORT GHANA");
  assert.equal(varisLimaniUlkeli("DJIBOUTI PORT"), "DJIBOUTI PORT");
  // bilinmeyen liman: tahmin yok, aynen; bos: null
  assert.equal(varisLimaniUlkeli("KURGU LIMANI"), "KURGU LIMANI");
  assert.equal(varisLimaniUlkeli("  "), null);
  assert.equal(gidecegiUlke("TEMA PORT, BASIS"), "GANA");
  // belirsiz adlar bilerek eslesmez
  assert.equal(gidecegiUlke("TRIPOLI PORT"), null);
});
