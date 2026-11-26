/**
 * Kantar Paneli ihracat sekmeleri (lib/kantar-gorunum.ts). Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { aramaUyar, baslangicAnaSekmesi, teslimYerindenGemi, eksikDolumlar, gemiSlug, gorunenSevkiyatlar, kantarAnaSekmesi, kantarDosyaYolu, kantarSekmesi, kantarYiSekmesi, panelDosyaYolu } from "@/lib/kantar-gorunum";
import type { SevkiyatDurumu } from "@/lib/kantar-sevkiyat";

const s = (dosya_no: string, dolu: number, toplam: number, durum: SevkiyatDurumu) => ({ dosya_id: dosya_no, dosya_no, dolu, toplam, durum });

test("?sekme= okuma", () => {
  assert.equal(kantarSekmesi("tamamlanan"), "tamamlanan");
  assert.equal(kantarSekmesi("AKTIF"), "aktif");
  assert.equal(kantarSekmesi("dba"), null);
  assert.equal(kantarSekmesi(null), null);
});

test("eksik dolum seridi: tamamlanan ve rezervasyonsuz dosya yok, bekleyen = toplam - dolu", () => {
  const e = eksikDolumlar([s("D1", 3, 8, "yukleniyor"), s("D2", 5, 5, "tamamlandi"), s("D3", 0, 0, "baslamadi"), s("D4", 0, 2, "dolum_bekliyor")]);
  assert.deepEqual(e.map((x) => [x.dosya_no, x.dolu, x.toplam, x.bekleyen]), [["D1", 3, 8, 5], ["D4", 0, 2, 2]]);
});

test("aktif sekme kartlari: tamamlananlar gizli; anahtar ya da arama ile gorunur", () => {
  const l = [s("D1", 3, 8, "yukleniyor"), s("D2", 5, 5, "tamamlandi")];
  assert.equal(gorunenSevkiyatlar(l, false, false).length, 1);
  assert.equal(gorunenSevkiyatlar(l, true, false).length, 2);
  assert.equal(gorunenSevkiyatlar(l, false, true).length, 2);
});

test("baglantilar dosya no ile; bos dosya no -> null", () => {
  assert.equal(panelDosyaYolu("IHR-2026-0001"), "/panel?dosya=IHR-2026-0001");
  assert.equal(kantarDosyaYolu("IHR-2026-0001"), "/kantar?dosya=IHR-2026-0001");
  assert.equal(panelDosyaYolu(" "), null);
});

test("26.11.2026 ana sekmeler: adres okuma, eski adres, baslangic secimi", () => {
  assert.equal(kantarAnaSekmesi("gemi"), "gemi");
  assert.equal(kantarAnaSekmesi("YURTICI"), "yurtici");
  assert.equal(kantarAnaSekmesi("tamamlanan"), "ihracat");
  assert.equal(kantarAnaSekmesi("x"), null);
  assert.equal(kantarYiSekmesi("alis"), "alis");
  assert.equal(kantarYiSekmesi("gemi"), null);
  assert.equal(baslangicAnaSekmesi({ adres: null, dosyaVar: false, gemiVar: true }), "gemi");
  assert.equal(baslangicAnaSekmesi({ adres: null, dosyaVar: false, gemiVar: false }), "yurtici");
  assert.equal(baslangicAnaSekmesi({ adres: "gemi", dosyaVar: false, gemiVar: false }), "yurtici");
  assert.equal(baslangicAnaSekmesi({ adres: "yurtici", dosyaVar: false, gemiVar: true }), "yurtici");
  assert.equal(baslangicAnaSekmesi({ adres: "gemi", dosyaVar: true, gemiVar: true }), "ihracat");
});

test("gemiSlug ve aramaUyar", () => {
  assert.equal(gemiSlug("MV KURGU YILDIZ"), "kurgu-yildiz");
  assert.equal(gemiSlug("M/V Kurgu Şile"), "kurgu-sile");
  assert.equal(aramaUyar({ plaka: "34 KRG 001", net: 26500 }, "34krg"), true);
  assert.equal(aramaUyar({ musteri: "KURGU İÇ TİCARET" }, "ic tic"), true);
  assert.equal(aramaUyar({ plaka: "34 KRG 001" }, "06"), false);
  assert.equal(aramaUyar({ plaka: "x" }, "  "), true);
});

test("teslimYerindenGemi: siparis formu teslim yerindeki gemi adi (kelime sinirli, acik gemi)", () => {
  const gemiler = [
    { id: "1", gemi_adi: "MV KURGU YILDIZ", durum: "acik" },
    { id: "2", gemi_adi: "ADA", durum: "acik" },
    { id: "3", gemi_adi: "M/V ESKI GEMI", durum: "tamamlandi" },
  ];
  assert.equal(teslimYerindenGemi("KURGU LIMANI SUPALAN TESLİM (KURGU YILDIZ)", gemiler)?.id, "1");
  assert.equal(teslimYerindenGemi("KADARLI FABRIKA TESLIM", gemiler), null, "ada, kadarli icinde eslesmez");
  assert.equal(teslimYerindenGemi("SUPALAN (ESKI GEMI)", gemiler), null, "tamamlanan gemi secilmez");
  assert.equal(teslimYerindenGemi("", gemiler), null);
  assert.equal(teslimYerindenGemi(null, gemiler), null);
});
