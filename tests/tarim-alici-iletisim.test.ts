/**
 * 4-5-6 (COO / Phyto / Health) alici kutusunda telefon / e-posta gosterilmez (24.11.2026). Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { iletisimBilgisiniCikar, tarimBelgesiAlicisi } from "@/lib/tarim-alici";

test("etiketli telefon / faks / whatsapp / e-posta cikarilir; vergi no kalir", () => {
  assert.equal(
    iletisimBilgisiniCikar("ORNEK TRADING LTD Plot 1, Ornek close, KAMPALA UGANDA VAT/TAX: 1000000000 Phone: +256 700 000 000 Email: kurgu@example.com"),
    "ORNEK TRADING LTD Plot 1, Ornek close, KAMPALA UGANDA VAT/TAX: 1000000000",
  );
  assert.equal(
    iletisimBilgisiniCikar("ORNEK BAKERY PO BOX: 1000 REPUBLIQUE ORNEK TEL OFFICE: +253 21000000 WHATSAPP: +253 77000000 / +253 77000001 EMAILS: A@ORNEK.COM, B@ORNEK.COM"),
    "ORNEK BAKERY PO BOX: 1000 REPUBLIQUE ORNEK",
  );
  assert.equal(
    iletisimBilgisiniCikar("ORNEK SARL TEL: 00 253 77 00 00 00/00 253 77 00 00 01 EMAIL: X@ORNEK.COM ORNEK VILLE. NIF:1000000 / TAX ID:1000000"),
    "ORNEK SARL ORNEK VILLE. NIF:1000000 / TAX ID:1000000",
  );
  assert.equal(iletisimBilgisiniCikar("ORNEK SA CALLE 1, LA HABANA, CUBA T:7000000 CONTACTO:KURGU KISI"), "ORNEK SA CALLE 1, LA HABANA, CUBA");
  assert.equal(iletisimBilgisiniCikar("ORNEK LTD P.O. BOX 1000 Ornek Phone: +254 41 0000 000 Fax:+254 41 0000 001 Email:kurgu@ornek.co.ke"), "ORNEK LTD P.O. BOX 1000 Ornek");
});

test("cok satirli alici: telefon/e-posta satirlari duser, diger satirlar AYNEN kalir", () => {
  assert.equal(
    iletisimBilgisiniCikar("ORNEK COMPANY LIMITED\n44, ORNEK MALL , LEVEL 2 , ROOM 63,\nKAMPALA,\nUGANDA.\nTIN NO : 1000000000\nTEL: *243900000000, *256 700000000\nkurgu@example.com"),
    "ORNEK COMPANY LIMITED\n44, ORNEK MALL , LEVEL 2 , ROOM 63,\nKAMPALA,\nUGANDA.\nTIN NO : 1000000000",
  );
  assert.equal(iletisimBilgisiniCikar("ORNEK FIRMA\nB.P. 1000 ORNEK\nNUMBER. 0025300000000 NIF: 1000000 E-MAIL: KURGU@EXAMPLE.COM"), "ORNEK FIRMA\nB.P. 1000 ORNEK\nNIF: 1000000");
  // etiketsiz uluslararasi numara + e-posta
  assert.equal(iletisimBilgisiniCikar("ORNEK SARLU P.O. BOX 1000 ORNEK +253 77 00 00 00 KURGU@EXAMPLE.COM"), "ORNEK SARLU P.O. BOX 1000 ORNEK");
});

test("adres numaralari / posta kodlari silinmez", () => {
  const adres = "ORNEK IMPORT AVENIDA 58 NUMERO 2909 ENTRE 29 Y 31, CUBA POINT CODE: 55100";
  assert.equal(iletisimBilgisiniCikar(adres), adres);
  assert.equal(iletisimBilgisiniCikar("ORNEK TRADING P.O. BOX 1234, ORNEK STREET NO 25, CITY 00100"), "ORNEK TRADING P.O. BOX 1234, ORNEK STREET NO 25, CITY 00100");
  assert.equal(iletisimBilgisiniCikar("ORNEK LTD ST. ORNEK STREET, SUITE 308, ORNEK C13105424"), "ORNEK LTD ST. ORNEK STREET, SUITE 308, ORNEK C13105424");
});

test("tarimBelgesiAlicisi: TO ORDER -> notify; iletisim cikarilmis", () => {
  const dosya = { consignee: "TO ORDER", alici_firma: null, alici_adresi: null, ham_veri: { notify: ["ORNEK NOTIFY LTD, ORNEK CITY Phone: +256 700 000 000 Email: kurgu@example.com"] } };
  assert.equal(tarimBelgesiAlicisi(dosya as never), "ORNEK NOTIFY LTD, ORNEK CITY");
});
