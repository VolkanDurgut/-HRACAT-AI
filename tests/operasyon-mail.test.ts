/**
 * Ortak operasyon mail kalibi (17.11.2026): konsimento talimati, fatura talimati ve VGM raporu AYNI kalip.
 * Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { operasyonMailHtml, OP_LACIVERT, OP_SEFTALI } from "../supabase/functions/_shared/operasyon-mail.ts";
import { talimatMailiHtml, type OnayOzeti } from "../supabase/functions/_shared/fatura-onay.ts";
import { khMail, type KhVeri } from "../supabase/functions/_shared/konsimento-hatirlatma.ts";

const kalipVar = (html: string, baslik: string) => {
  assert.ok(html.includes(`background:${OP_LACIVERT};padding:18px 28px;border-bottom:4px solid ${OP_SEFTALI};`), "lacivert bant + seftali cizgi");
  assert.ok(html.includes("· İHRACAT OPERASYON</p>"), "ust etiket");
  assert.ok(html.includes(`font-size:21px;font-weight:700;">${baslik}</p>`), "baslik");
};

test("kabuk: kacis, bos parcalar yazilmaz, test seridi", () => {
  const h = operasyonMailHtml({ site: "https://ornek.test", baslik: "A <b>", hitap: "Merhaba <x>", girisHtml: "<b>ok</b>", testMetni: "TEST <1>" });
  kalipVar(h, "A &lt;b&gt;");
  assert.ok(h.includes("Merhaba &lt;x&gt;") && h.includes("<b>ok</b>") && h.includes("TEST &lt;1&gt;"));
  const bos = operasyonMailHtml({ site: "https://ornek.test", baslik: "B" });
  assert.ok(!bos.includes("#FEF3C7") && !bos.includes("border-left:4px solid") && !bos.includes("<a href"));
});

test("fatura talimati ayni kalipta: hitap, bilgi tablosu, PDF + dosya dugmesi", () => {
  const o: OnayOzeti = {
    dosya: { id: "d1", dosya_no: "IHR-2026-0001", alici_firma: "Ornek Alici", varis_limani: "Port A, Ulke", para_birimi: "USD", urun_detaylari: [] },
    rezervasyonlar: [], konteynerler: [{ tip: "20DC" }, { tip: "20DC" }],
  };
  const { konu, html } = talimatMailiHtml(o, "k1", "Unex Gıda");
  assert.equal(konu, "FATURA VE BEYANNAME TALİMATI HAKKINDA // ORNEK ALICI // 2 * 20 DC // PORT A");
  kalipVar(html, "Fatura talimatı hazır");
  assert.ok(html.includes("UNEX GIDA · İHRACAT OPERASYON"));
  assert.ok(html.includes("Harun Bey merhaba,") && html.includes("<b>2 * 20 DC</b>") && html.includes("IHR-2026-0001"));
  assert.ok(html.includes("/fatura-onay?id=k1&amp;indir=1") && html.includes("Fatura Talimatını İndir (PDF)") && html.includes("/dosya/d1?tab=evraklar"));
});

test("konsimento talimati kalibi korunur: uyarilar ve dugmeler", () => {
  const v: KhVeri = {
    dosya_id: "d2", dosya_no: "IHR-2026-0002", proforma_no: null, lot_no: null, marka: null, alici_firma: "Ornek B", alici_adresi: null,
    consignee: null, notify: null, detayli_ambalaj: null, ambalaj: null, teslim_sekli: null, varis_limani: null, yuklenme_limani: null,
    beyanname_no: null, sirket: null,
    rezervasyonlar: [{ booking_no: "B1", acente_ismi: "Ornek Lines", gemi_adi: null, sefer_no: null, yuklenme_limani: null, talimat_cutoff: "2099-01-05T12:00:00+00:00", gemi_kalkis_tarihi: null, konteyner_adedi: 2 }],
    konteynerler: [{ konteyner_no: "K1", tip: null, muhur_no: null, pieces: null, net_agirlik_kg: null, brut_agirlik_kg: null }, { konteyner_no: "K2", tip: null, muhur_no: null, pieces: null, net_agirlik_kg: null, brut_agirlik_kg: null }],
  };
  const { konu, html } = khMail(v, { test: true, gercekAlici: "a@ornek.test", gercekCc: [], tetik: "otomatik" });
  assert.ok(konu.startsWith("[TEST] Konşimento talimatı hazır"));
  kalipVar(html, "Konşimento talimatı hazır");
  assert.ok(html.includes("(<b>2/2</b>)") && html.includes("Consignee / notify eksik.") && html.includes("05.01.2099 12:00"));
  assert.ok(html.includes("Talimatı Gör") && html.includes("Dosyayı aç") && html.includes("TEST · Bu e-posta yalnızca test adresine"));
});
