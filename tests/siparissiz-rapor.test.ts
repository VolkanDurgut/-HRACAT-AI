/**
 * Siparissiz musteri raporu (23.11.2026): veri hazirlama, gruplar, ozet, konu, HTML ve Excel. Veriler KURGUSALDIR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  siparissizVeriHazirla, grupla, grubu, siparissizOzet, siparissizKonusu, siparissizHtml, siparissizSayfasi, durumMetni, gorevMetni,
} from "@/supabase/functions/_shared/siparissiz-rapor";

const m = (ad: string, ek: Record<string, unknown> = {}) => ({ id: `id-${ad}`, ad, durum: "veri_az", dalga: 0, toplam_konteyner: 0, eposta: false, telefon: false, ...ek });
const HAM = {
  bugun: "2026-11-23", toplam: 10, aktif: 6,
  musteriler: [
    m("DEMO GECIKEN", { durum: "gecikti", fark: 54, ritim_gun: 36, dalga: 6, son_etd: "2026-09-28", ort_konteyner: 9.4, toplam_konteyner: 60, liman: "DEMO LIMAN", eposta: true,
      gorev: { tarih: "2026-11-17", durum: "bekliyor", atanan: "export", hitap: "Demo Bey" } }),
    m("DEMO COK GECIKEN", { durum: "gecikti", fark: 168, ritim_gun: 56, dalga: 3, son_etd: "2026-05-12", toplam_konteyner: 6 }),
    m("DEMO ZAMANI", { durum: "zamani_geldi", fark: 3, ritim_gun: 84, dalga: 4, telefon: true }),
    m("DEMO TEK", { dalga: 1, son_etd: "2026-08-01", toplam_konteyner: 10 }),
    m("DEMO KAYITSIZ"),
    { ad: "", id: "x" },
    m("DEMO YAKIN", { durum: "yaklasiyor", fark: -5, dalga: 5, eposta: true }),
  ],
};

test("veri hazirlama: bos adli satir atilir, bilinmeyen durum veri_az", () => {
  const v = siparissizVeriHazirla(HAM);
  assert.equal(v.musteriler.length, 6);
  assert.equal(siparissizVeriHazirla({ musteriler: [m("A", { durum: "garip" })] }).musteriler[0].durum, "veri_az");
  assert.deepEqual(siparissizVeriHazirla(null), { bugun: "", toplam: 0, aktif: 0, musteriler: [] });
});

test("gruplar: hemen (en cok geciken once) > yaklasan > ikinci siparis > kayit dogrulanmali", () => {
  const v = siparissizVeriHazirla(HAM);
  const g = grupla(v);
  assert.deepEqual(g.map((x) => x.grup), ["hemen", "yaklasan", "ikinci", "kayit"]);
  assert.deepEqual(g[0].musteriler.map((x) => x.ad), ["DEMO COK GECIKEN", "DEMO GECIKEN", "DEMO ZAMANI"]);
  assert.equal(grubu(v.musteriler.find((x) => x.ad === "DEMO TEK")!), "ikinci");
  assert.equal(grubu(v.musteriler.find((x) => x.ad === "DEMO KAYITSIZ")!), "kayit");
});

test("ozet ve konu: iletisimsiz musteri ayrica sayilir; acik gorev", () => {
  const v = siparissizVeriHazirla(HAM);
  assert.deepEqual(siparissizOzet(v), { toplam: 10, aktif: 6, siparissiz: 6, hemen: 3, iletisimYok: 3, gorevde: 1 });
  assert.equal(siparissizKonusu(v), "Siparişsiz Müşteri Raporu · 23.11.2026 · 6 müşteri · 3 hemen aranacak");
  assert.match(siparissizKonusu(siparissizVeriHazirla({ bugun: "2026-11-23", musteriler: [] })), /aktif siparişi var/);
});

test("metinler ve HTML: durum, gorev, uyarilar; kacis", () => {
  const v = siparissizVeriHazirla(HAM);
  const bul = (ad: string) => v.musteriler.find((x) => x.ad === ad)!;
  assert.equal(durumMetni(bul("DEMO GECIKEN")), "54 gün gecikti");
  assert.equal(durumMetni(bul("DEMO TEK")), "1 sevkiyat (ritim yok)");
  assert.equal(durumMetni(bul("DEMO KAYITSIZ")), "Sevkiyat kaydı yok");
  assert.equal(gorevMetni(bul("DEMO GECIKEN")), "Demo Bey · 17.11 · bekliyor");
  const html = siparissizHtml(siparissizVeriHazirla({ ...HAM, musteriler: [...HAM.musteriler, m("<script>", { dalga: 1 })] }), "Demo Gıda");
  assert.match(html, /Hemen aranacak · sipariş ritmi bozuldu \(3\)/);
  assert.match(html, /Yok · ekleyin/);
  assert.match(html, /günlük görev mailine düşmüyor/);
  assert.ok(!html.includes("<script>") && html.includes("&lt;script&gt;"));
});

test("Excel: baslik sabit + filtre; grup sirasi; tarih / sayi hucreleri", () => {
  const s = siparissizSayfasi(siparissizVeriHazirla(HAM));
  assert.equal(s.satirlar.length, 7);
  assert.equal(s.dondur, "C2");
  assert.equal(s.filtre, "A1:Q7");
  assert.equal(s.satirlar[1]?.[1]?.v, "DEMO COK GECIKEN");
  assert.equal(s.satirlar[1]?.[5]?.v, 168);
  assert.ok(s.satirlar[1]?.[7]?.v instanceof Date);
  assert.equal(siparissizSayfasi(siparissizVeriHazirla({ musteriler: [] })).satirlar.length, 2);
});
