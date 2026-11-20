/**
 * Fatura talimati maili (14.11.2026, kullanici: "Onayla gonder kismini kaldirmaliyiz. Sadece fatura talimati gonderilsin:
 * Harun Bey merhaba, fatura talimati ektedir gibi; musteri, konteyner adedi ve varis limani. PDF indir butonu eklenecek.")
 * Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dagitimKonusu, konteynerOzeti, limanKisa, talimatMailiHtml, talimatYolu, type OnayOzeti } from "../supabase/functions/_shared/fatura-onay.ts";

const ID = "11111111-2222-4333-8444-555555555555";
const ozet = (alici: string, liman: string, tipler: (string | null)[]): OnayOzeti => ({
  dosya: { id: "d1", dosya_no: "IHR-2026-0001", alici_firma: alici, varis_limani: liman, para_birimi: "USD", urun_detaylari: [] },
  rezervasyonlar: [{ konteyner_adedi: tipler.length, booking_no: "B1", gemi_adi: "G", gemi_kalkis_tarihi: "2026-01-05" }],
  konteynerler: tipler.map((tip) => ({ tip })),
});

test("konu: kullanicinin kalibi (ALICI // N * TIP // LIMAN), Ingilizce buyuk harf", () => {
  const o = ozet("Acme Trading Ltd", "Haifa, Israel", ["20DC", "20DC", null, "40HC"]);
  assert.equal(dagitimKonusu(o.dosya, o.konteynerler), "FATURA VE BEYANNAME TALİMATI HAKKINDA // ACME TRADING LTD // 3 * 20 DC + 1 * 40 HC // HAIFA");
  assert.equal(limanKisa("Ashdod (Israel)"), "ASHDOD");
  assert.equal(konteynerOzeti([]), "-");
});

test("mail: Harun Bey selami, musteri / konteyner / liman / dosya, PDF indir dugmesi; onay ve revize yok", () => {
  const o = ozet("Acme Trading Ltd", "Djibouti", ["20DC", "20DC", "20DC", "20DC", "20DC", "20DC"]);
  const m = talimatMailiHtml(o, ID, "Unex Gıda");
  assert.equal(m.konu, "FATURA VE BEYANNAME TALİMATI HAKKINDA // ACME TRADING LTD // 6 * 20 DC // DJIBOUTI");
  assert.match(m.html, /Harun Bey merhaba,/);
  assert.match(m.html, /Fatura talimatı hazırdır/);
  assert.match(m.html, />Müşteri<.*Acme Trading Ltd/s);
  assert.match(m.html, />Konteyner<.*6 \* 20 DC/s);
  assert.match(m.html, />Varış limanı<.*Djibouti/s);
  assert.match(m.html, /IHR-2026-0001/);
  // 17.11.2026 ortak kalip: href HTML kacisli (& -> &amp;; mail istemcileri cozer)
  assert.ok(m.html.includes(`https://ihracatasistanim.com${talimatYolu(ID).replace(/&/g, "&amp;")}`));
  assert.ok(talimatYolu(ID).endsWith("&indir=1"));
  assert.match(m.html, /Fatura Talimatını İndir \(PDF\)/);
  assert.doesNotMatch(m.html, /Onayla|Revize/i);
});

test("mail: HTML kacisi (musteri adinda < > & \")", () => {
  const o = ozet("A&B <Trading> \"Co\"", "Beirut", ["20DC"]);
  const m = talimatMailiHtml(o, ID, "Unex <Gıda>");
  assert.ok(m.html.includes("A&amp;B &lt;Trading&gt; &quot;Co&quot;"));
  assert.ok(!m.html.includes("<Trading>"));
  // 20.11.2026: alt notta sirket adi yerine "UNEX-AI"; sirket adi ust etikette (buyuk harf) kacisli
  assert.ok(m.html.includes("UNEX &lt;GIDA&gt;"));
  assert.ok(!m.html.includes("<Gıda>") && !m.html.includes("<GIDA>"));
});
