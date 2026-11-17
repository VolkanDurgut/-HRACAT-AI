/**
 * Ana Panel duzeni (16.11.2026) - lib/panel-gorunum.ts. Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cutoffUyarilari, dosyaEslesir, gunMetni, panelFiltrele, panelFiltresi } from "@/lib/panel-gorunum";
import { cutoffZamanMs } from "@/lib/cutoff-utils";

/** Bugunden n gun sonrasi, yerel takvim ("YYYY-MM-DDT10:00:00+00:00"; cut-off saatleri yerel saat olarak tutulur). */
const gun = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T10:00:00+00:00`;
};
const dosya = (id: string, ek: Record<string, unknown> = {}) => ({
  id, dosya_no: `IHR-${id}`, proforma_no: null as string | null, alici_firma: `Ornek ${id}`, durum: "Açık",
  fatura_dosya_url: null, konsimento_dosya_url: null, draft_bl_dosya_url: null, beyanname_dosya_url: null,
  rezervasyonlar: [] as { talimat_cutoff: string | null; beyanname_cutoff: string | null; konteyner_adedi?: number | null }[],
  konteynerler: [] as { dba_dosya_url?: string | null }[], ...ek,
});

test("filtre adresi: yeni ?filtre=, eski ?filter=; bilinmeyen tumu", () => {
  assert.equal(panelFiltresi("cutoff"), "cutoff");
  assert.equal(panelFiltresi(null, "rezervasyon"), "rezervasyon");
  assert.equal(panelFiltresi("acik", "cutoff"), "acik", "yeni parametre once");
  assert.equal(panelFiltresi("yok"), "tumu");
  assert.equal(panelFiltresi(null, null), "tumu");
});

test("filtreler eski kuralla ayni", () => {
  const a = dosya("a", { rezervasyonlar: [{ talimat_cutoff: gun(1), beyanname_cutoff: gun(5) }] });
  const b = dosya("b", { rezervasyonlar: [{ talimat_cutoff: gun(1), beyanname_cutoff: null }], konsimento_dosya_url: "x" });
  const c = dosya("c");
  const d = dosya("d", { durum: "Kapalı" });
  assert.deepEqual(panelFiltrele([a, b, c, d], "cutoff").map((x) => x.id), ["a"], "talimati verilmis yaklasan sayilmaz");
  assert.deepEqual(panelFiltrele([a, b, c, d], "rezervasyon").map((x) => x.id), ["c"]);
  assert.deepEqual(panelFiltrele([a, b, c, d], "acik").map((x) => x.id), ["a", "b", "c"]);
  assert.equal(panelFiltrele([a, b, c, d], "tumu").length, 4);
});

test("?dosya= eslesmesi: kimlik, dosya no, coklu proforma; bosluk/tire duyarsiz", () => {
  const d = { id: "1f0c-uuid", dosya_no: "IHR-2026-0117", proforma_no: "UNEXBF011126 / UNEXBF031126" };
  assert.ok(dosyaEslesir(d, "1f0c-uuid"));
  assert.ok(dosyaEslesir(d, "ihr 2026 0117"));
  assert.ok(dosyaEslesir(d, "UNEXBF031126"));
  assert.ok(dosyaEslesir(d, "unexbf011126"));
  assert.ok(!dosyaEslesir(d, "UNEXBF0311"));
  assert.ok(!dosyaEslesir(d, ""));
  assert.ok(!dosyaEslesir(d, null));
});

test("cut-off uyarilari: son 24 saat + gecenler (17.11.2026), tamamlanan adim yok, en acil once", () => {
  // Sabit "simdi": bugun 12:00 (yerel; cut-off yerel saat "+00" etiketiyle saklanir)
  const bugun = gun(0).slice(0, 10);
  const yarin = gun(1).slice(0, 10);
  const simdi = cutoffZamanMs(`${bugun}T12:00:00+00:00`)!;
  const t = (tarih: string, saat: string) => `${tarih}T${saat}:00+00:00`;
  const a = dosya("a", { rezervasyonlar: [{ talimat_cutoff: t(yarin, "10:00"), beyanname_cutoff: t(yarin, "13:00") }] }); // 22 sa: uyari, 25 sa: yok
  const b = dosya("b", { rezervasyonlar: [{ talimat_cutoff: t(bugun, "15:00"), beyanname_cutoff: gun(4) }], draft_bl_dosya_url: "x" }); // talimat tamam
  const c = dosya("c", { rezervasyonlar: [{ talimat_cutoff: gun(-1), beyanname_cutoff: t(yarin, "11:00") }], beyanname_dosya_url: "x" }); // gecti
  const u = cutoffUyarilari([a, b, c], simdi);
  assert.deepEqual(u.map((x) => `${x.dosyaId}:${x.tur}:${x.gun}`), ["c:Talimat:-1", "a:Talimat:1"], "25 saat kalan beyanname uyari degil");
  assert.equal(u[1].saat, t(yarin, "10:00"));
  assert.equal(u[1].musteri, "Ornek a");
  assert.equal(gunMetni(-1), "1g geçti");
  assert.equal(gunMetni(0), "bugün");
});
