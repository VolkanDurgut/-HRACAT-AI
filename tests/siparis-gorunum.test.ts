/**
 * Siparis Listesi sekmeleri (lib/siparis/gorunum.ts). Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  panelBaglantisi, pazarBaglantisi, planAramaMetni, satirSekmesi, sekmeSayilari, siparisAra, siparisSekmesi, tekrarSekmesi,
  VARSAYILAN_SIPARIS_SEKMESI,
} from "@/lib/siparis/gorunum";
import type { SiparisDurum } from "@/lib/siparis/liste";

const s = (durum: SiparisDurum, ek: Record<string, unknown> = {}) => ({ durum, benzer: null, kaynak: "excel" as const, proforma_no: "P1", firma: "Firma", dosya_no: null, ...ek });

test("?sekme= okuma: bilinen degerler; kaldirilan rezervasyonlu / sevk ve bilinmeyen -> null (varsayilan plan)", () => {
  assert.equal(VARSAYILAN_SIPARIS_SEKMESI, "plan");
  assert.equal(siparisSekmesi("PLAN"), "plan");
  assert.equal(siparisSekmesi("rez_bekleyen"), "rez_bekleyen");
  assert.equal(siparisSekmesi("onay"), "onay");
  assert.equal(siparisSekmesi("formlar"), "formlar");
  assert.equal(siparisSekmesi("rezervasyonlu"), null);
  assert.equal(siparisSekmesi("sevk"), null);
  assert.equal(siparisSekmesi("tamamlanan"), null);
  assert.equal(siparisSekmesi(null), null);
});

test("21.11.2026: rezervasyonlu / BL eksik -> plan, sevk / iptal -> sekme yok; sayilar yalniz liste sekmeleri", () => {
  const liste = [s("rezervasyonlu"), s("bl_eksik"), s("on_odeme_alindi"), s("onay_bekliyor"), s("onay_bekliyor"), s("sevk_edildi"), s("iptal")];
  assert.equal(satirSekmesi(s("rezervasyonlu")), "plan");
  assert.equal(satirSekmesi(s("bl_eksik")), "plan");
  assert.equal(satirSekmesi(s("on_odeme_alindi")), "rez_bekleyen");
  assert.equal(satirSekmesi(s("onay_bekliyor")), "onay");
  assert.equal(satirSekmesi(s("sevk_edildi")), null);
  assert.equal(satirSekmesi(s("iptal")), null);
  assert.deepEqual(sekmeSayilari(liste), { rez_bekleyen: 1, onay: 2 });
});

test("planda arama metni: booking, yoksa BL sutunu (Excel), yoksa firmanin ilk iki kelimesi", () => {
  assert.equal(planAramaMetni({ booking_no: "AB123, CD456", bl_no: null, firma: "X" }), "AB123");
  assert.equal(planAramaMetni({ booking_no: null, bl_no: "594600", firma: "X" }), "594600");
  assert.equal(planAramaMetni({ booking_no: null, bl_no: null, firma: "SAMREX GLOBAL TRADING FZCO." }), "SAMREX GLOBAL");
  assert.equal(planAramaMetni({ firma: null }), "");
});

test("arama Turkce harf duyarsiz ve dosya / booking alanlarinda", () => {
  const liste = [s("onay_bekliyor", { firma: "İstanbul Gıda" }), s("rezervasyonlu", { firma: "X", dosya_no: "IHR-2026-0001" })];
  assert.equal(siparisAra(liste, "istanbul").length, 1);
  assert.equal(siparisAra(liste, "GIDA").length, 1);
  assert.equal(siparisAra(liste, "ihr-2026").length, 1);
  assert.equal(siparisAra(liste, "  ").length, 2);
});

test("olasi tekrar karti ilk supheli satirin sekmesini acar (sevk edilen atlanir)", () => {
  assert.equal(tekrarSekmesi([s("rezervasyonlu"), s("on_odeme_alindi", { benzer: "P0", kaynak: "sistem" })]), "rez_bekleyen");
  assert.equal(tekrarSekmesi([s("rezervasyonlu", { benzer: "P0", kaynak: "sistem" })]), "plan");
  assert.equal(tekrarSekmesi([s("sevk_edildi", { benzer: "P0", kaynak: "sistem" }), s("onay_bekliyor", { benzer: "P1", kaynak: "sistem" })]), "onay");
  assert.equal(tekrarSekmesi([s("rezervasyonlu", { benzer: "P0" })]), "onay");
});

test("Ana Panel baglantisi yalniz rezervasyonlu + dosya no; Pazar baglantisi firma adiyla", () => {
  assert.equal(panelBaglantisi(s("rezervasyonlu", { dosya_no: "IHR-2026-0001" })), "/panel?dosya=IHR-2026-0001");
  assert.equal(panelBaglantisi(s("sevk_edildi", { dosya_no: "IHR-2026-0001" })), null);
  assert.equal(panelBaglantisi(s("rezervasyonlu")), null);
  assert.equal(pazarBaglantisi("A & B Co"), "/pazar?musteri=A%20%26%20B%20Co");
  assert.equal(pazarBaglantisi("  "), null);
});
