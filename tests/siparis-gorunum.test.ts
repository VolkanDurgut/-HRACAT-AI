/**
 * Siparis Listesi sekmeleri (lib/siparis/gorunum.ts). Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  panelBaglantisi, pazarBaglantisi, satirSekmesi, sekmeSayilari, siparisAra, siparisSekmesi, tekrarSekmesi,
} from "@/lib/siparis/gorunum";
import type { SiparisDurum } from "@/lib/siparis/liste";

const s = (durum: SiparisDurum, ek: Record<string, unknown> = {}) => ({ durum, benzer: null, kaynak: "excel" as const, proforma_no: "P1", firma: "Firma", dosya_no: null, ...ek });

test("?sekme= okuma: bilinen degerler, bilinmeyen / bos -> null", () => {
  assert.equal(siparisSekmesi("sevk"), "sevk");
  assert.equal(siparisSekmesi("PLAN"), "plan");
  assert.equal(siparisSekmesi("rez_bekleyen"), "rez_bekleyen");
  assert.equal(siparisSekmesi("tamamlanan"), null);
  assert.equal(siparisSekmesi(null), null);
});

test("her durum tam bir sekmede; sayilar toplam satira esit", () => {
  const liste = [s("rezervasyonlu"), s("bl_eksik"), s("on_odeme_alindi"), s("onay_bekliyor"), s("onay_bekliyor"), s("sevk_edildi"), s("iptal")];
  assert.equal(satirSekmesi(s("bl_eksik")), "rezervasyonlu");
  assert.equal(satirSekmesi(s("iptal")), "sevk");
  const say = sekmeSayilari(liste);
  assert.deepEqual(say, { rezervasyonlu: 2, rez_bekleyen: 1, onay: 2, sevk: 2 });
  assert.equal(Object.values(say).reduce((a, b) => a + b, 0), liste.length);
});

test("arama Turkce harf duyarsiz ve dosya / booking alanlarinda", () => {
  const liste = [s("onay_bekliyor", { firma: "İstanbul Gıda" }), s("rezervasyonlu", { firma: "X", dosya_no: "IHR-2026-0001" })];
  assert.equal(siparisAra(liste, "istanbul").length, 1);
  assert.equal(siparisAra(liste, "GIDA").length, 1);
  assert.equal(siparisAra(liste, "ihr-2026").length, 1);
  assert.equal(siparisAra(liste, "  ").length, 2);
});

test("olasi tekrar karti ilk supheli satirin sekmesini acar", () => {
  assert.equal(tekrarSekmesi([s("rezervasyonlu"), s("on_odeme_alindi", { benzer: "P0", kaynak: "sistem" })]), "rez_bekleyen");
  assert.equal(tekrarSekmesi([s("rezervasyonlu", { benzer: "P0" })]), "onay");
});

test("Ana Panel baglantisi yalniz rezervasyonlu + dosya no; Pazar baglantisi firma adiyla", () => {
  assert.equal(panelBaglantisi(s("rezervasyonlu", { dosya_no: "IHR-2026-0001" })), "/panel?dosya=IHR-2026-0001");
  assert.equal(panelBaglantisi(s("sevk_edildi", { dosya_no: "IHR-2026-0001" })), null);
  assert.equal(panelBaglantisi(s("rezervasyonlu")), null);
  assert.equal(pazarBaglantisi("A & B Co"), "/pazar?musteri=A%20%26%20B%20Co");
  assert.equal(pazarBaglantisi("  "), null);
});
