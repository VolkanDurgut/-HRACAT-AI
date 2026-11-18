/**
 * Siparis raporu (18.11.2026): ust bolum = on odemesi alinmis / rezervasyonu alinmamis siparisler, alt bolum = bu siparislerin
 * varis limanlari icin en yeni navlun fiyatlari. Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const yukle = (ad: string) => import(new URL(`../supabase/functions/_shared/${ad}.ts`, import.meta.url).href);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Herhangi = any;
const teklif = (liman: string, acente: string, armator: string | null, tutar: number, tarih: string, ek: Record<string, unknown> = {}) => ({
  tur: "teklif", liman, liman_anahtar: liman, acente, armator, tutar, para_birimi: "USD", ekipman: "20DC", free_time_gun: 14, transit_gun: null, tarih, lokal_dahil: true, ...ek,
});
const siparis = (firma: string, liman: string, konteyner: number, onOdeme: string) => ({
  firma, liman, konteyner, durum: "on_odeme_alindi", on_odeme: true, on_odeme_tarihi: onOdeme, kaynak: "excel", anahtar: `excel:${firma}${liman}${konteyner}`,
  proforma_no: `P-${firma}`, tutar: 1000, para_birimi: "USD", miktar_mt: konteyner * 25,
});

async function tablo(olaylar: Herhangi[], tarih = "2026-11-18") {
  const { navlunTablosuHesapla, esleriYukle } = await yukle("navlun-tablosu");
  esleriYukle([]);
  return navlunTablosuHesapla(olaylar, [], tarih);
}

test("limanSonTeklifleri: her acentenin son teklifi, en yeni ustte, en iyi isaretli", async () => {
  const { limanSonTeklifleri } = await yukle("navlun-tablosu");
  const t = await tablo([
    teklif("ORNEKPORT", "Acente A", null, 2000, "2026-11-01T08:00:00Z"),
    teklif("ORNEKPORT", "Acente A", null, 1900, "2026-11-10T08:00:00Z"),
    teklif("ORNEKPORT", "Acente B", null, 1850, "2026-11-12T08:00:00Z"),
  ]);
  const { teklifler, eski } = limanSonTeklifleri(t, "ORNEKPORT");
  assert.equal(eski, false);
  assert.deepEqual(teklifler.map((x: Herhangi) => [x.blok, x.navlun, x.enIyi]), [["ACENTE B", 1850, true], ["ACENTE A", 1900, false]]);
});

test("limanSonTeklifleri: ayni acentenin ayni tutari (hatli / hatsiz) tek satir, hat bilgisi korunur", async () => {
  const { limanSonTeklifleri } = await yukle("navlun-tablosu");
  const t = await tablo([
    teklif("ORNEKPORT", "Acente A", "Ornek Hat", 2450, "2026-11-16T08:00:00Z", { transit_gun: "45" }),
    teklif("ORNEKPORT", "Acente A", null, 2450, "2026-11-17T08:00:00Z", { free_time_gun: null }),
  ]);
  const { teklifler } = limanSonTeklifleri(t, "ORNEKPORT");
  assert.equal(teklifler.length, 1);
  assert.equal(teklifler[0].blok, "ACENTE A - ORNEK HAT");
  assert.equal(teklifler[0].tarih.slice(0, 10), "2026-11-17");
  assert.equal(teklifler[0].transit, "45");
});

test("limanSonTeklifleri: 60 gunde teklif yoksa en son teklif 'eski' olarak gelir", async () => {
  const { limanSonTeklifleri } = await yukle("navlun-tablosu");
  const t = await tablo([teklif("ORNEKPORT", "Acente A", null, 2000, "2026-08-01T08:00:00Z"), teklif("ORNEKPORT", "Acente B", null, 2100, "2026-07-01T08:00:00Z")]);
  const s = limanSonTeklifleri(t, "ORNEKPORT");
  assert.equal(s.eski, true);
  assert.deepEqual(s.teklifler.map((x: Herhangi) => x.navlun), [2000]);
});

test("rapor: ust bolum basligi aynen, ayni firmanin kisa / uzun yazimi tek satir, alt bolumde liman navlunlari", async () => {
  const { siparisNormalize } = await yukle("siparis-liste");
  const { siparisRaporHesapla, siparisRaporHtml, siparisRaporKonusu, bekleyenNavlunlari, bekleyenGruplari } = await yukle("siparis-rapor");
  const siparisler = [
    siparis("ORNEK FIRMA", "Ornekport", 2, "2026-11-11"),
    siparis("ORNEK FIRMA & TICARET LTD", "Ornekport", 2, "2026-11-12"),
    siparis("IKINCI FIRMA", "Ikinciport", 3, "2026-11-13"),
  ].map(siparisNormalize);
  const r = siparisRaporHesapla(siparisler, [], "2026-11-18", "aksam");
  const g = bekleyenGruplari(r);
  assert.deepEqual(g.map((x: Herhangi) => [x.firma, x.kont, x.siparis]), [["ORNEK FIRMA", 4, 2], ["IKINCI FIRMA", 3, 1]]);
  const t = await tablo([teklif("ORNEKPORT", "Acente A", null, 1500, "2026-11-15T08:00:00Z")]);
  const n = bekleyenNavlunlari(r, t);
  assert.deepEqual(n.map((x: Herhangi) => [x.liman, x.kont, x.teklifler.length]), [["ORNEKPORT", 4, 1], ["IKİNCİPORT", 3, 0]]);
  const html = siparisRaporHtml(r, "Ornek", "2026-11-18T14:00:00Z", n);
  assert.ok(html.includes("ÖN ÖDEMESİ ALINMIŞ- ONAYLI PROFORMA FAKAT HENÜZ REZERVASYON ALINMAMIŞ. MÜŞTERİ SİPARİŞ VERDİĞİNDE HAREKETE GEÇİLECEKTİR."));
  assert.ok(html.includes("EN YENİ NAVLUN FİYATLARI"));
  assert.ok(html.includes("navlun talebi açın"));
  assert.ok(!html.includes("Bugün Gelen Ön Ödemeler"));
  assert.equal(siparisRaporKonusu(r, "Ornek"), "Ornek Sipariş Raporu · 18.11.2026 · Rezervasyon bekleyen 3 sipariş · 7 konteyner · 2 liman");
  // Navlun okunamadiysa rapor yine olusur, alt bolumde not
  assert.ok(siparisRaporHtml(r, "Ornek", "2026-11-18T14:00:00Z", null).includes("Navlun fiyatları bu raporda okunamadı"));
});

test("liman anahtari: 'PORT OF' adin parcasi; diger kurallar degismez", async () => {
  const { limanAnahtari } = await yukle("liman-anahtari");
  assert.equal(limanAnahtari("PORT OF ORNEK"), "PORT OF ORNEK");
  assert.equal(limanAnahtari("Port of Ornek, Ornekulke"), "PORT OF ORNEK");
  assert.equal(limanAnahtari("PORT OF ORNEK (ORNEKULKE)"), "PORT OF ORNEK");
  assert.equal(limanAnahtari("Ornekport Port, Ornekulke"), "ORNEKPORT");
  assert.equal(limanAnahtari("ORNEKPORT PORT ORNEKULKE"), "ORNEKPORT");
});
