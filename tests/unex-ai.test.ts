import { test } from "node:test";
import assert from "node:assert/strict";
import { etiketliKonu, GONDEREN_ADI, MAIL_ETIKETLERI, UNEX_AI_GONDEREN } from "../supabase/functions/_shared/unex-ai.ts";

test("gonderen: Unex AI, adres degismez", () => {
  assert.equal(GONDEREN_ADI, "Unex AI");
  assert.equal(UNEX_AI_GONDEREN, "Unex AI <bildirim@ihracatasistanim.com>");
  assert.deepEqual([...MAIL_ETIKETLERI], ["Rapor", "Hatırlatma", "Önemli"]);
});

test("etiket konunun basina gelir", () => {
  assert.equal(etiketliKonu("Rapor", "Navlun Raporu · 20.11.2026"), "[Rapor] Navlun Raporu · 20.11.2026");
  assert.equal(etiketliKonu("Önemli", "FATURA VE BEYANNAME TALİMATI HAKKINDA // KURGU LTD"), "[Önemli] FATURA VE BEYANNAME TALİMATI HAKKINDA // KURGU LTD");
});

test("[TEST] / [DENEME] en basta kalir", () => {
  assert.equal(etiketliKonu("Rapor", "[TEST] Sipariş Raporu · 18.11.2026"), "[TEST] [Rapor] Sipariş Raporu · 18.11.2026");
  assert.equal(etiketliKonu("Hatırlatma", "[deneme] Bugünkü müşteriniz"), "[DENEME] [Hatırlatma] Bugünkü müşteriniz");
});

test("sirket adi on eki atilir (gonderen zaten Unex AI)", () => {
  assert.equal(etiketliKonu("Rapor", "Ornek Gıda Navlun Raporu · 20.11.2026", { sirketAdi: "Ornek Gıda" }), "[Rapor] Navlun Raporu · 20.11.2026");
  assert.equal(etiketliKonu("Rapor", "[TEST] ORNEK GIDA DİİB Raporu — 20.11.2026", { sirketAdi: "Ornek Gıda" }), "[TEST] [Rapor] DİİB Raporu — 20.11.2026");
  // Ortada gecen sirket adi ve yalniz sirket adindan olusan konu korunur
  assert.equal(etiketliKonu("Rapor", "Günlük rapor · Ornek Gıda", { sirketAdi: "Ornek Gıda" }), "[Rapor] Günlük rapor · Ornek Gıda");
  assert.equal(etiketliKonu("Rapor", "Ornek Gıda", { sirketAdi: "Ornek Gıda" }), "[Rapor] Ornek Gıda");
});

test("ikinci cagri etiketi cogaltmaz", () => {
  const bir = etiketliKonu("Rapor", "[TEST] Navlun Raporu");
  assert.equal(etiketliKonu("Rapor", bir), "[TEST] [Rapor] Navlun Raporu");
  assert.equal(etiketliKonu("Önemli", "[Rapor] Günlük Veri Yedeği"), "[Önemli] Günlük Veri Yedeği");
});
