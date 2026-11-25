/**
 * 25.11.2026: yukleme evraklari 4/4 (Ana Panel KT · FT · BL · BY) ve draft evrak maili (Gmail kirpmasi, telefon satiri).
 * Veriler KURGUDUR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { yuklemeEvraklariTamam } from "@/lib/yukleme-evrak-tamam";
import { draftMail, type DraftMailVeri } from "@/supabase/functions/_shared/draft-evrak-mail";

const tam = { konsimento_dosya_url: "k.pdf", draft_bl_dosya_url: "bl.pdf", fatura_dosya_url: "f.pdf", beyanname_dosya_url: "b.pdf" };

test("4/4: KT (talimat ya da Draft BL) · FT · BL · BY", () => {
  assert.equal(yuklemeEvraklariTamam(tam), true);
  assert.equal(yuklemeEvraklariTamam({ ...tam, konsimento_dosya_url: null }), true, "Draft BL varsa talimat gecilmis sayilir");
  assert.equal(yuklemeEvraklariTamam({ ...tam, beyanname_dosya_url: null }), false);
  assert.equal(yuklemeEvraklariTamam({ ...tam, draft_bl_dosya_url: null }), false);
  assert.equal(yuklemeEvraklariTamam({ ...tam, fatura_dosya_url: null }), false);
  assert.equal(yuklemeEvraklariTamam({ ...tam, beyanname_dosya_url: "" }), false);
});

test("4/4: DIIB'e bolunmus yuklemede butun parcalarin faturasi", () => {
  assert.equal(yuklemeEvraklariTamam({ ...tam, fatura_dosya_url: null }, [{ fatura_dosya_url: "1.pdf" }, { fatura_dosya_url: "2.pdf" }]), true);
  assert.equal(yuklemeEvraklariTamam(tam, [{ fatura_dosya_url: "1.pdf" }, { fatura_dosya_url: null }]), false);
  // Tek parca bolunme sayilmaz: dosyanin faturasi esas
  assert.equal(yuklemeEvraklariTamam(tam, [{ fatura_dosya_url: null }]), true);
});

const veri = (tel: string | null): DraftMailVeri => ({
  dosya_id: "00000000-0000-0000-0000-000000000001", dosya_no: "KURGU-1", proforma_no: "PRF-1", alici_firma: "KURGU ALICI",
  alici_email: "alici@ornek.com", alici_tel: tel, alici_adresi: null, booking_no: "BKG1", gemi_adi: null, sefer_no: null,
  yuklenme_limani: null, varis_limani: null, gemi_kalkis_tarihi: null, konteyner_adedi: 2,
});

test("draft maili: telefon yoksa satir yok, varsa var", () => {
  const yok = draftMail(veri(null), ["DRAFT- 1- INVOICE- BKG1- PRF-1.pdf"], { site: "https://ornek.com", test: false }).html;
  assert.ok(!yok.includes(">Telefon<"));
  const var_ = draftMail(veri("+90 555 000 00 00"), ["DRAFT- 1- INVOICE- BKG1- PRF-1.pdf"], { site: "https://ornek.com", test: false }).html;
  assert.ok(var_.includes(">Telefon<"));
  assert.ok(var_.includes("tel:+905550000000"));
});

test("draft maili: her gonderim benzersiz (Gmail kirpmasin), canlida TEST etiketi yok", () => {
  const ek = ["DRAFT- 1- INVOICE- BKG1- PRF-1.pdf"];
  const a = draftMail(veri(null), ek, { site: "https://ornek.com", test: false, benzersiz: "aaa-111", zaman: "25.11.2026 14:42" });
  const b = draftMail(veri(null), ek, { site: "https://ornek.com", test: false, benzersiz: "bbb-222", zaman: "25.11.2026 14:43" });
  assert.notEqual(a.html, b.html);
  assert.ok(a.html.includes("aaa-111") && a.html.includes("(25.11.2026 14:42)"));
  assert.ok(!a.konu.startsWith("[TEST]"));
  assert.ok(!a.html.includes("TEST · Bu e-posta"));
  const t = draftMail(veri(null), ek, { site: "https://ornek.com", test: true });
  assert.ok(t.konu.startsWith("[TEST]"));
});
