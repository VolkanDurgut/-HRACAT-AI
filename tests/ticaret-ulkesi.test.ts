/** 20.11.2026: ticaret yapilan ulke - elle deger once gelir; Surinam ve eksik Amerika ulkeleri (kurgu adresler). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dosyaTicaretUlkesi, gidecegiUlke, ticaretYapilanUlke, ULKE_ADLARI } from "@/lib/ulke-bul";

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
