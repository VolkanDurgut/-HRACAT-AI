/**
 * 25.11.2026: VGM PDF'inde Unex logosu (sag ust; uygulama ve mail eki ayni cizim) ve ic piyasa raporu 18:00. Veriler KURGUDUR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { vgmPdfCiz } from "@/supabase/functions/_shared/vgm-pdf";
import { UNEX_LOGO_VGM_BASE64, UNEX_LOGO_VGM_BOY, UNEX_LOGO_VGM_EN } from "@/supabase/functions/_shared/unex-logo-vgm-base64";
import { IC_RAPOR_SAATI, icRaporSaatYazi } from "@/supabase/functions/_shared/ic-gunluk-rapor";

function sahteBelge() {
  const resimler: unknown[][] = [];
  const doc = {
    internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } },
    addFileToVFS() {}, addFont() {}, setFont() {}, setFontSize() {}, setTextColor() {}, text() {},
    addImage: (...a: unknown[]) => { resimler.push(a); },
  };
  return { doc, resimler };
}
const veri = { dosyaNo: "KURGU-1", bookingNo: null, gemi: null, yuklemeLimani: null, varisLimani: null, konteynerler: [], olusturma: "25.11.2026 12:00" };

test("VGM PDF: logo verilirse sag ust koseye orantili cizilir; verilmezse cizilmez", () => {
  const a = sahteBelge();
  vgmPdfCiz(a.doc, () => {}, "", veri, { base64: UNEX_LOGO_VGM_BASE64, en: UNEX_LOGO_VGM_EN, boy: UNEX_LOGO_VGM_BOY });
  assert.equal(a.resimler.length, 1);
  const [, tur, x, y, w, h] = a.resimler[0] as [string, string, number, number, number, number];
  assert.equal(tur, "PNG");
  assert.equal(w, 22);
  assert.equal(x, 297 - 14 - 22);
  assert.equal(y, 8);
  assert.ok(Math.abs(h - (22 * UNEX_LOGO_VGM_BOY) / UNEX_LOGO_VGM_EN) < 1e-9);
  assert.ok(UNEX_LOGO_VGM_BASE64.startsWith("iVBORw0KGgo"), "PNG olmali");
  const b = sahteBelge();
  vgmPdfCiz(b.doc, () => {}, "", veri);
  assert.equal(b.resimler.length, 0);
});

test("ic piyasa raporu aksam oturumu 18:00 (sabah / ogle saatleri degismedi)", () => {
  assert.deepEqual(IC_RAPOR_SAATI.aksam, [18, 0]);
  assert.equal(icRaporSaatYazi("aksam"), "18:00");
  assert.deepEqual(IC_RAPOR_SAATI.sabah, [9, 0]);
  assert.deepEqual(IC_RAPOR_SAATI.ogle, [12, 0]);
});

test("ihracat raporu aksam slotu 18:00: pencere 17:55-19:00, 17:00 artik zamanlanmis degil", async () => {
  const { SLOT_TR_SAATI, aktifSlot } = await import("@/supabase/functions/gunluk-rapor-gonder/yetki");
  assert.equal(SLOT_TR_SAATI.aksam, 18);
  const tr = (s: string) => Date.parse(`2026-11-25T${s}:00+03:00`);
  assert.equal(aktifSlot(tr("18:00")), "aksam");
  assert.equal(aktifSlot(tr("17:55")), "aksam");
  assert.equal(aktifSlot(tr("18:59")), "aksam");
  assert.equal(aktifSlot(tr("17:00")), null);
  assert.equal(aktifSlot(tr("19:00")), null);
});
