/**
 * 18.11.2026 revizeleri: tek cuval markasinin konteynerlere yayilmasi, proforma bankasi,
 * rezervasyonla detayli ambalaj olceklemesi. Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { markaListesiAyikla, tekMarkaYayilimi, markaListedeYok } from "@/lib/konteyner-marka";
import { proformaBankasi, sevkiyatBankasi, bankaFarki } from "@/lib/proforma-banka";
import { detayliAmbalajiOlcekle, kalemlerinCuvalToplami, secimdenKalemler, varsayilanSecimler } from "@/lib/siparis-devam";
import { siparisIlerlemesiHesapla } from "@/lib/siparis-takip";

// ------------------------------------------------------------ cuval markasi
test("marka listesi: bos satir / tekrar / bosluk temizlenir", () => {
  assert.deepEqual(markaListesiAyikla("  ORNEK  MARKA \n\nORNEK MARKA\nIKINCI"), ["ORNEK MARKA", "IKINCI"]);
  assert.deepEqual(markaListesiAyikla(""), []);
});

test("tek marka: farkli / bos / urun adindan dusulmus markalar guncellenir, dogru olana dokunulmaz", () => {
  const g = tekMarkaYayilimi(["KURGU"], [
    { id: "a", marka: "WHEAT FLOUR (KURGU PLUS)" },
    { id: "b", marka: null },
    { id: "c", marka: "KURGU" },
    { id: "d", marka: "KURGU", kalemler: [{ urun: "UN", marka: "ESKI", pieces: 100, net_kg: 5000 }, { urun: "UN 2", marka: null, pieces: 50, net_kg: 2500 }] },
  ]);
  assert.deepEqual(g.map((x) => x.id), ["a", "b", "d"]);
  assert.equal(g[0].marka, "KURGU");
  assert.equal(g[0].kalemler, undefined);
  assert.deepEqual(g[2].kalemler?.map((k) => k.marka), ["KURGU", "KURGU"]);
  assert.deepEqual(g[2].kalemler?.map((k) => k.pieces), [100, 50]);
});

test("birden fazla marka ya da bos liste: hicbir konteynere dokunulmaz", () => {
  assert.deepEqual(tekMarkaYayilimi(["A", "B"], [{ id: "a", marka: "X" }]), []);
  assert.deepEqual(tekMarkaYayilimi([], [{ id: "a", marka: "X" }]), []);
});

test("listede olmayan marka uyarisi yalniz elle liste varsa", () => {
  assert.equal(markaListedeYok("ESKI", ["A", "B"]), true);
  assert.equal(markaListedeYok("A", ["A", "B"]), false);
  assert.equal(markaListedeYok("ESKI", []), false);
  assert.equal(markaListedeYok(null, ["A"]), false);
});

// ------------------------------------------------------------ banka
const DENIZ = { banka: "DENIZBANK A.S.", swift: "KURGTRISXXX", iban: "TR00 0000 0000 0000 0000 0000 01", hesap_numarasi: "1-1", hesap_adi: "KURGU A.S." };

test("proforma bankasi ham_veri'den; banka yoksa null", () => {
  assert.equal(proformaBankasi({})?.banka ?? null, null);
  assert.equal(proformaBankasi(null), null);
  const p = proformaBankasi({ ...DENIZ, okuma_kaynagi: "sistem_proformasi" });
  assert.equal(p?.banka, "DENIZBANK A.S.");
  assert.equal(p?.kaynak, "kayitli_proforma");
  assert.equal(proformaBankasi(DENIZ)?.kaynak, "okuma");
});

test("siparise devam: banka ilk dosyanin elle degisen kolonundan degil proformadan", () => {
  const ornek = { hesap_adi: "KURGU A.S.", banka: "T.C. ZIRAAT BANKASI", swift: "TCZBTR2A", hesap_numarasi: "2-2", iban: "TR11", ham_veri: DENIZ };
  const b = sevkiyatBankasi(ornek);
  assert.equal(b.banka, "DENIZBANK A.S.");
  assert.equal(b.swift, "KURGTRISXXX");
  assert.equal(b.iban, DENIZ.iban);
  // proformada banka yoksa eski davranis (kolonlar)
  assert.equal(sevkiyatBankasi({ ...ornek, ham_veri: {} }).banka, "T.C. ZIRAAT BANKASI");
  assert.equal(sevkiyatBankasi(null).banka, null);
});

test("banka farki: ayni bankanin farkli yazimi fark sayilmaz", () => {
  assert.equal(bankaFarki("DENIZBANK", DENIZ), null);
  assert.equal(bankaFarki("T.C. ZIRAAT BANKASI", DENIZ)?.banka, "DENIZBANK A.S.");
  assert.equal(bankaFarki(null, DENIZ)?.banka, "DENIZBANK A.S.");
  assert.equal(bankaFarki("T.C. ZIRAAT BANKASI", {}), null);
});

// ------------------------------------------------------------ sevkiyat secimi / olcekleme
const master = [{ description: "ALL PURPOSE FLOUR (KURGU BRAND)", quantity: 375, unit_price: 400, packaging_size: "25 KG" }];

test("ilk sevkiyat: 375 MTS'lik proformadan 2 FCL secimi 50 MTS / 20.000 tutar", () => {
  const kalemler = siparisIlerlemesiHesapla({ id: "yeni", toplam_mts: 375, urun_detaylari_master: master }, [], []).kalemler;
  assert.equal(kalemler[0].acikMts, 375);
  const secim = varsayilanSecimler(kalemler).map((s) => ({ ...s, fcl: 2 }));
  const yeni = secimdenKalemler(secim);
  assert.equal(yeni[0].miktar_mts, "50.00");
  assert.equal(yeni[0].toplam_tutar_usd, "20000.00");
  assert.equal(kalemlerinCuvalToplami(yeni), 2000);
});

test("rezervasyon olcegi: tutarli detayli ambalaj ayni oranla kuculur", () => {
  const eski = [{ urun_adi: "UN (A)", miktar_mts: "375.00", ambalaj_boyutu: "25 KG" }];
  const yeni = [{ urun_adi: "UN (A)", miktar_mts: "50.00", ambalaj_boyutu: "25 KG" }];
  assert.equal(detayliAmbalajiOlcekle("15.000 PIECES OF 25 KG PP BAGS (A BRAND)", eski, yeni), "2.000 PIECES OF 25 KG PP BAGS (A BRAND)");
});

test("rezervasyon olcegi: iki segment toplam korunur", () => {
  const eski = [{ urun_adi: "UN (A)", miktar_mts: "100", ambalaj_boyutu: "50 KG" }, { urun_adi: "UN (B)", miktar_mts: "50", ambalaj_boyutu: "25 KG" }];
  const yeni = [{ urun_adi: "UN (A)", miktar_mts: "50", ambalaj_boyutu: "50 KG" }, { urun_adi: "UN (B)", miktar_mts: "25", ambalaj_boyutu: "25 KG" }];
  assert.equal(detayliAmbalajiOlcekle("2.000 PIECES OF 50 KG (A), 2.000 PIECES OF 25 KG (B)", eski, yeni), "1.000 PIECES OF 50 KG (A), 1.000 PIECES OF 25 KG (B)");
});

test("rezervasyon olcegi: elle yazilmis tutarsiz metne / degismeyen miktara dokunulmaz", () => {
  const eski = [{ urun_adi: "UN", miktar_mts: "375", ambalaj_boyutu: "25 KG" }];
  const yeni = [{ urun_adi: "UN", miktar_mts: "50", ambalaj_boyutu: "25 KG" }];
  assert.equal(detayliAmbalajiOlcekle("2.000 PIECES OF 25 KG BAGS", eski, yeni), null);
  assert.equal(detayliAmbalajiOlcekle("15.000 PIECES OF 25 KG BAGS", eski, eski), null);
  assert.equal(detayliAmbalajiOlcekle("PP BAGS", eski, yeni), null);
  assert.equal(detayliAmbalajiOlcekle("15.000 PIECES", [{ urun_adi: "UN", miktar_mts: "375", ambalaj_boyutu: "" }], yeni), null);
});
