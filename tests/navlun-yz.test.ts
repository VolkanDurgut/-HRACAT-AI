/**
 * Navlun yapay zeka okumasi - saf kisim (supabase/functions/_shared/navlun-yz.ts) ve doviz kuru (doviz-kur.ts). 24.11.2026.
 * Yapay zeka cagrisi test edilmez (ag); denetim katmani test edilir: model ne yazarsa yazsin kaynakta olmayan rakam,
 * tutmayan liman, olagandisi tutar kaydedilmez. Metinler KURGUDUR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlTemizle, sayiMetindeVar, yzDenetle, yzGerekli } from "@/supabase/functions/_shared/navlun-yz";
import { tcmbKurOku } from "@/supabase/functions/_shared/doviz-kur";

const metin = "ORNEKLIMAN // 20 DC\nNavlun: USD 1.850 / 20'DC lokal dahil\n+Seal Fee : Usd 18+kdv / Cntr\nGeçerlilik 30.11";
const iyi = {
  teklifler: [{ liman: "ORNEKLIMAN", ekipman: "20DC", tutar: 1850, para: "USD", lokal_dahil: "dahil", lokal_kanit: "lokal dahil", kanit: "USD 1.850 / 20'DC" }],
  kalemler: [{ kod: "MUHUR", ad: "Seal Fee", tutar: 18, para: "USD", birim: "konteyner", ekipman: "hepsi", kdv: true, kosullu: false, blok: "yok" }],
};

test("sayiMetindeVar: binlik / ondalik bicimleri, parca eslesme yok", () => {
  assert.ok(sayiMetindeVar("USD 1.850", 1850));
  assert.ok(sayiMetindeVar("1,850.00 USD", 1850));
  assert.ok(sayiMetindeVar("1850", 1850));
  assert.ok(!sayiMetindeVar("18500", 1850));
  assert.ok(!sayiMetindeVar("11850", 1850));
  assert.ok(sayiMetindeVar("45,50 USD", 45.5));
});

test("denetim: dogru okuma gecer; kalem 'hepsi' / blok 'yok' normallesir", () => {
  const d = yzDenetle(iyi, { metin, konuLimanAnahtar: "ORNEKLIMAN" });
  assert.equal(d.gecti, true);
  assert.equal(d.teklifler[0].lokal_dahil, true);
  assert.equal(d.teklifler[0].liman_anahtar, "ORNEKLIMAN");
  assert.equal(d.kalemler[0].ekipman, null);
  assert.equal(d.kalemler[0].blok, null);
  assert.equal(d.kalemler[0].kaynak, "yz");
});

test("denetim: metinde olmayan (uydurma) tutar gecmez", () => {
  const d = yzDenetle({ ...iyi, teklifler: [{ ...iyi.teklifler[0], tutar: 1580 }] }, { metin, konuLimanAnahtar: "ORNEKLIMAN" });
  assert.equal(d.gecti, false);
  assert.match(d.sorunlar.join(" "), /metninde geçmiyor/);
});

test("denetim: konudaki limanla tutmayan ve metinde gecmeyen liman gecmez", () => {
  const d = yzDenetle({ ...iyi, teklifler: [{ ...iyi.teklifler[0], liman: "BASKALIMAN" }] }, { metin, konuLimanAnahtar: "ORNEKLIMAN" });
  assert.equal(d.gecti, false);
});

test("denetim: lokal dayanagi metinde yoksa lokal belirsiz birakilir (hafizaya duser)", () => {
  const d = yzDenetle({ ...iyi, teklifler: [{ ...iyi.teklifler[0], lokal_kanit: "all in fiyat" }] }, { metin, konuLimanAnahtar: "ORNEKLIMAN" });
  assert.equal(d.gecti, true);
  assert.equal(d.teklifler[0].lokal_dahil, null);
});

test("denetim: dosyadan okunan tutar gecmis tekliflerin medyanina gore olagandisiysa ya da referans yoksa gecmez", () => {
  const dosya = { ...iyi, teklifler: [{ ...iyi.teklifler[0], tutar: 2100, kanit: "pdf" }] };
  assert.equal(yzDenetle(dosya, { metin: "Teklif ektedir.", konuLimanAnahtar: "ORNEKLIMAN", dosyadan: true, referans: () => 2000 }).gecti, true);
  assert.equal(yzDenetle(dosya, { metin: "Teklif ektedir.", konuLimanAnahtar: "ORNEKLIMAN", dosyadan: true, referans: () => 600 }).gecti, false);
  assert.equal(yzDenetle(dosya, { metin: "Teklif ektedir.", konuLimanAnahtar: "ORNEKLIMAN", dosyadan: true }).gecti, false);
});

test("denetim: ayni liman + ekipmana iki farkli tutar -> belirsiz, gecmez; sema disi cikti gecmez", () => {
  const iki = { ...iyi, teklifler: [iyi.teklifler[0], { ...iyi.teklifler[0], tutar: 1950 }] };
  const d = yzDenetle(iki, { metin: metin + "\nEski fiyat USD 1.950", konuLimanAnahtar: "ORNEKLIMAN" });
  assert.equal(d.gecti, false);
  assert.match(d.sorunlar.join(" "), /birden fazla tutar/);
  assert.equal(yzDenetle("bozuk", { metin, konuLimanAnahtar: null }).gecti, false);
});

test("yzGerekli: kurallar fiyat okuduysa / bizdense / acente yoksa cagrilmaz", () => {
  const g = { govde: metin, ek_metin: "", dosyaSayisi: 0, bizden: false };
  assert.equal(yzGerekli({ durum: "okundu", acente: "ALFA", fiyatli: true }, g), null);
  assert.equal(yzGerekli({ durum: "bilgi", acente: null, fiyatli: false }, g), null);
  assert.equal(yzGerekli({ durum: "bilgi", acente: "ALFA", fiyatli: false }, { ...g, bizden: true }), null);
  assert.match(yzGerekli({ durum: "okunamadi", acente: "ALFA", fiyatli: false }, g) || "", /ekte/);
  assert.match(yzGerekli({ durum: "bilgi", acente: "ALFA", fiyatli: false }, { ...g, dosyaSayisi: 1 }) || "", /dosya/);
  assert.match(yzGerekli({ durum: "bilgi", acente: "ALFA", fiyatli: false }, g) || "", /tablo/);
  assert.equal(yzGerekli({ durum: "bilgi", acente: "ALFA", fiyatli: false }, { ...g, govde: "Teşekkürler, iyi çalışmalar." }), null);
});

test("htmlTemizle: tablo satir / hucre yapisi korunur, stil / betik / alinti atilir", () => {
  const html = `<html><head><style>.x{color:red}</style></head><body><div style="font:11px">Merhaba,</div>
    <table><tr><th>POD</th><th>20DC</th></tr><tr><td style="x">ORNEKLIMAN</td><td>&nbsp;1.850&nbsp;USD</td></tr></table>
    <script>alert(1)</script><img src="logo.png"><div class="gmail_quote">eski mail 999 USD</div></body></html>`;
  const t = htmlTemizle(html);
  assert.match(t, /POD \| 20DC/);
  assert.match(t, /ORNEKLIMAN \| 1\.850 USD/);
  assert.doesNotMatch(t, /color|alert|logo|999/);
});

test("tcmbKurOku: EUR/USD capraz kur ve TL/USD", () => {
  const xml = `<Tarih_Date Tarih="24.11.2026"><Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"><ForexSelling>40.00</ForexSelling></Currency>
    <Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR"><ForexSelling>46.00</ForexSelling></Currency></Tarih_Date>`;
  const k = tcmbKurOku(xml);
  assert.ok(k);
  assert.equal(k!.EUR, 1.15);
  assert.equal(k!.TRY, 0.025);
  assert.match(k!.tarih, /24\.11\.2026/);
  assert.equal(tcmbKurOku("<x/>"), null);
});
