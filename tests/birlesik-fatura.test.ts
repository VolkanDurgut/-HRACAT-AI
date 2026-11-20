/**
 * Birlesik fatura (19.11.2026): ayni musteri + ayni gemideki dosyalar icin TEK fatura talimati. Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ambalajToplami, birlesikFaturaModeli, birlesikKonu, birlesikTalimatMetni, type GrupUyesi } from "@/lib/birlesik-fatura/model";
import { dagitimKonusu, talimatMailiHtml, type OnayOzeti } from "../supabase/functions/_shared/fatura-onay.ts";

const dosya = (no: string, kont: number, mt: number, ek: Record<string, unknown> = {}) => ({
  id: `id-${no}`, dosya_no: `IHR-TEST-${no}`, proforma_no: `PF-KRG-${no}`, lot_no: `PF-KRG-${no}`, alici_firma: "KURGU TRADING LTD",
  alici_adresi: "KURGU SOKAK 1, NIAMEY, NIGER", satici_firma: "KURGU GIDA", marka: `MARKA${no}`, para_birimi: "USD", teslim_sekli: "CFR",
  banka: "KURGU BANK", olusturma_tarihi: "2026-11-10T08:00:00Z", varis_limani: "Tema Port", navlun_tutari: 4900, lokal_masraf_tutari: 400,
  diib_no: "2026-D1-00001", diib_tarihi: null, detayli_ambalaj: "25 KG PP BAGS", ambalaj: null, gumruk_odeme_sekli: "PESIN",
  urun_detaylari: [{ description: "WHEAT FLOUR (KURGU)", quantity: mt, unit_price: 615, total_amount: mt * 615, packaging_size: "25 KG" }],
  ...ek,
});
const uye = (no: string, kont: number, mt: number, girilen = kont, ek: Record<string, unknown> = {}): GrupUyesi => ({
  dosya: dosya(no, kont, mt, ek) as never,
  rezervasyonlar: [{ id: `r-${no}`, dosya_id: `id-${no}`, booking_no: `BK${no}`, konteyner_adedi: kont, gemi_adi: "KURGU GEMI", sefer_no: "V1", acente_ismi: "HAT", beyanname_cutoff: `2026-11-2${no.slice(-1)}T10:00:00+00:00` }] as never,
  konteynerler: Array.from({ length: girilen }, (_, i) => ({ id: `k-${no}-${i}`, dosya_id: `id-${no}`, konteyner_no: `KRGU${no}${i}`, tip: "20DC", net_agirlik_kg: 25000, brut_agirlik_kg: 25150, pieces: 1000 })) as never,
});

test("birlesik model: tutarlar dosya bazinda hesaplanip toplanir, ayni kalem tek satir", () => {
  const m = birlesikFaturaModeli([uye("2", 2, 50), uye("1", 3, 75), uye("3", 2, 50)]);
  assert.equal(m.dosyaSayisi, 3);
  assert.deepEqual(m.dosyalar.map((d) => d.dosyaNo), ["IHR-TEST-1", "IHR-TEST-2", "IHR-TEST-3"]);
  assert.equal(m.toplam.konteyner, 7);
  assert.equal(m.toplam.mt, 175);
  assert.equal(m.toplam.cif, 175 * 615);
  // CFR: FOB = CIF - (navlun - lokal) * konteyner
  assert.equal(m.toplam.netNavlun, 4500 * 7);
  assert.equal(m.toplam.fob, 175 * 615 - 4500 * 7);
  assert.equal(m.kalemler.length, 1);
  assert.equal(m.kalemler[0].konteyner, 7);
  assert.equal(m.kalemler[0].mt, 175);
  // Ton basina ayni net navlun: 615 - 31500 / 175 = 435
  assert.equal(m.kalemler[0].fobBirimMt, 435);
  assert.equal(m.toplam.net, 7 * 25000);
  assert.equal(m.banka, "KURGU BANK");
  assert.deepEqual(m.farklar, []);
  assert.deepEqual(m.eksikDosyalar, []);
  assert.equal(m.beyannameCutoff, "2026-11-21T10:00:00+00:00");
});

test("birlesik model: adresi karismis alici adi yerine kisa ad; farkli banka uyarisi; eksik konteyner on talimat", () => {
  const m = birlesikFaturaModeli([uye("1", 2, 50), uye("2", 2, 50, 1, { alici_firma: "KURGU TRADING LTDKURGU SOKAK", banka: "BASKA BANK" })]);
  assert.equal(m.aliciFirma, "KURGU TRADING LTD");
  assert.ok(m.farklar.some((f) => f.startsWith("Aracı banka")));
  assert.deepEqual(m.eksikDosyalar, ["IHR-TEST-2"]);
  assert.match(birlesikKonu(m, true), /^BIRLESIK FATURA - 2 DOSYA - KURGU TRADING LTD - 4x - Tema Port - ON TALIMAT$/);
});

test("birlesik model: farkli fiyatli kalemler ayri satir", () => {
  const m = birlesikFaturaModeli([uye("1", 2, 50), uye("2", 2, 50, 2, { urun_detaylari: [{ description: "WHEAT FLOUR (KURGU)", quantity: 50, unit_price: 600, total_amount: 30000, packaging_size: "25 KG" }] })]);
  assert.equal(m.kalemler.length, 2);
  assert.equal(m.toplam.cif, 50 * 615 + 30000);
});

test("birlesik talimat metni: tek fatura notu, dosya listesi, kalem ve toplamlar", () => {
  const m = birlesikFaturaModeli([uye("1", 3, 75), uye("2", 2, 50)]);
  const t = birlesikTalimatMetni(m, false, { gidecegiUlke: "GANA" });
  assert.match(t, /TEK FATURA kesilecektir/);
  assert.match(t, /IHR-TEST-1: Proforma PF-KRG-1, Booking BK1, 3 konteyner, 75 MTS/);
  assert.match(t, /FATURA KALEMLERI \(TEK FATURA\)/);
  assert.match(t, /Toplam Miktar: 125 MTS/);
  assert.match(t, /KRGU10 \[IHR-TEST-1\]/);
  assert.doesNotMatch(t, /ON FATURA TALIMATI/);
});

test("fatura talimati maili: birlesik fatura konusu ve dosya listesi", () => {
  const o: OnayOzeti = {
    dosya: { id: "d1", dosya_no: "IHR-TEST-1", alici_firma: "Kurgu Ltd", varis_limani: "Tema Port", para_birimi: "USD", urun_detaylari: [] },
    rezervasyonlar: [], konteynerler: [{ tip: "20DC" }, { tip: "20DC" }, { tip: "20DC" }], grupDosyalari: ["IHR-TEST-1", "IHR-TEST-2"],
  };
  assert.equal(dagitimKonusu(o.dosya, o.konteynerler, 2), "FATURA VE BEYANNAME TALİMATI HAKKINDA // KURGU LTD // 3 * 20 DC // TEMA PORT // BİRLEŞİK FATURA (2 DOSYA)");
  const { konu, html } = talimatMailiHtml(o, "k1", "Kurgu Gida");
  assert.match(konu, /BİRLEŞİK FATURA \(2 DOSYA\)$/);
  assert.match(html, /Birleşik fatura talimatı hazır/);
  assert.match(html, /IHR-TEST-1, IHR-TEST-2/);
  // Tek dosya: eski konu birebir
  assert.equal(dagitimKonusu(o.dosya, o.konteynerler), "FATURA VE BEYANNAME TALİMATI HAKKINDA // KURGU LTD // 3 * 20 DC // TEMA PORT");
});

test("birlesik ambalaj: ayni tanimli dosyalarin adetleri toplanir (tekillestirilmez)", () => {
  const t = ambalajToplami([
    "2.000 PIECES OF 25 KG PP BAGS (MARKA A)", "3.000 PIECES OF 25 KG PP BAGS (Marka B)",
    "2.000 PIECES OF 25 KG PP BAGS (MARKA C)", "2.000 PIECES OF 25 KG PP BAGS (MARKA C)", "2,000 pieces of 25 KG PP BAGS (Marka C)",
  ]);
  assert.equal(t, "2.000 PIECES OF 25 KG PP BAGS (MARKA A) / 3.000 PIECES OF 25 KG PP BAGS (Marka B) / 6.000 PIECES OF 25 KG PP BAGS (MARKA C) (TOPLAM 11.000 PIECES)");
  assert.equal(ambalajToplami(["2.000 PIECES OF 25 KG PP BAGS (X)"]), "2.000 PIECES OF 25 KG PP BAGS (X)");
  assert.equal(ambalajToplami(["25 KG PP BAGS", "25 KG PP BAGS"]), "25 KG PP BAGS (2 dosya)");
  const m = birlesikFaturaModeli([uye("1", 2, 50, 2, { detayli_ambalaj: "2.000 PIECES OF 25 KG PP BAGS (X)" }), uye("2", 2, 50, 2, { detayli_ambalaj: "2.000 PIECES OF 25 KG PP BAGS (X)" })]);
  assert.equal(m.ambalaj, "4.000 PIECES OF 25 KG PP BAGS (X)");
});

test("grupFaturaToplami: birlesik fatura kontrolu grubun toplamlariyla (kurgu)", async () => {
  const { grupFaturaToplami } = await import("../lib/birlesik-fatura/model.ts");
  const uye = (id: string, tutar: number, ks: string[], booking: string, beklenen = ks.length) => ({
    dosya: { id, dosya_no: id, toplam_tutar: tutar, para_birimi: "USD" },
    rezervasyonlar: [{ booking_no: booking, gemi_adi: "ORNEK GEMI", yuklenme_limani: "ORNEKPORT", konteyner_adedi: beklenen }],
    konteynerler: ks.map((k) => ({ konteyner_no: k, net_agirlik_kg: 25000, brut_agirlik_kg: 25200, pieces: 1000 })),
  });
  const g = grupFaturaToplami([uye("A", 30750, ["AAAU1111111", "AAAU2222222"], "BKG1"), uye("B", 46125, ["BBBU1111111", "BBBU2222222", "BBBU3333333"], "BKG2")] as any);
  assert.equal(g.konteynerler.length, 5);
  assert.equal(g.netKg, 125000);
  assert.equal(g.brutKg, 126000);
  assert.equal(g.kap, 5000);
  assert.equal(g.tutar, 76875);
  assert.equal(g.paraBirimi, "USD");
  assert.deepEqual(g.rezervasyonNolari, ["BKG1", "BKG2"]);
  assert.deepEqual(g.gemiler, ["ORNEK GEMI"]);
  assert.equal(g.konteynerTamam, true);
  // bir dosyada konteyner eksikse grup tamam degil
  const eksik = grupFaturaToplami([uye("A", 1, ["AAAU1111111"], "BKG1", 2), uye("B", 1, ["BBBU1111111"], "BKG2")] as any);
  assert.equal(eksik.konteynerTamam, false);
  assert.equal(eksik.konteynerBeklenen, 3);
});
