/**
 * Satin alma Excel okuyucu (lib/satin-alma/excel.ts) - 14.11.2026 coklu blok.
 * Ders (30.10.2026 listesi): yan yana duran ikinci blok (SONMEZ ET + alt altta TOPTANCI) SESSIZCE
 * atlaniyordu; 47 sanilan listenin yalniz 32 kalemi okunuyordu. Izgaralar KURGUSALDIR, gercek
 * dosyalarin DUZENINI taklit eder (kisisel veri yok).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { alisverisListesiCoz, baslikTedarikcisi, sutunHarfi } from "@/lib/satin-alma/excel";

const B = ["Miktar", "Birim", "ÜRÜN", "Kategori", "Tedarikçi / Not"];
const _ = null;

test("yan yana + alt alta bloklar: hepsi okunur, tedarikçi blok başlığından gelir", () => {
  const izgara: unknown[][] = [
    ["ALIŞVERİŞ LİSTESİ (07.11.2026)            MAVİ MARKET", _, _, _, _, _, "ALIŞVERİŞ LİSTESİ (07.11.2026)     KASAP ALİ"],
    [...B, _, ...B],
    [10, "kg", "Un", "Genel Gıda", _, _, 3, "kg", "Kıyma", "Et & Tavuk", _],
    [5, "paket", "Makarna", "Genel Gıda", _, _, 2, "adet", "Bütün tavuk", "Et & Tavuk", _],
    [2, "bidon", "Bulaşık deterjanı", "Temizlik & Hijyen", "NOT: büyük boy", _],
    [1, "kg", "Çay", "Genel Gıda", "DİĞER MARKET", _, "ALIŞVERİŞ LİSTESİ (07.11.2026)     TOPTANCI"],
    [],
    [_, _, _, _, _, _, ...B],
    [_, _, _, _, _, _, 1, "kova", "Mayonez", "Baharat & Sos", _],
    [_, _, _, _, _, _, 2, "koli", "Z havlu", "Temizlik & Hijyen", _],
  ];
  const s = alisverisListesiCoz(izgara);
  assert.equal(s.satirlar.length, 8);
  assert.deepEqual(s.bloklar.map((b) => [b.ad, b.kalem]), [["MAVİ MARKET", 4], ["KASAP ALİ", 2], ["TOPTANCI", 2]]);
  assert.deepEqual(s.uyarilar, []);
  const t = Object.fromEntries(s.satirlar.map((x) => [x.urun, x.tedarikci]));
  assert.equal(t["Un"], "MAVİ MARKET");
  assert.equal(t["Çay"], "DİĞER MARKET", "satırdaki tedarikçi blok başlığından önce gelir");
  assert.equal(t["Kıyma"], "KASAP ALİ");
  assert.equal(t["Z havlu"], "TOPTANCI");
  const deterjan = s.satirlar.find((x) => x.urun === "Bulaşık deterjanı")!;
  assert.equal(deterjan.aciklama, "büyük boy");
  assert.equal(deterjan.tedarikci, "MAVİ MARKET");
  assert.equal(deterjan.kategori, "temizlik");
  // Yan yana bloklarda satır no tekrarlanır; hücre adresi benzersiz olmalı (önizleme anahtarı)
  assert.equal(new Set(s.satirlar.map((x) => x.hucre)).size, s.satirlar.length);
  assert.equal(s.satirlar.find((x) => x.urun === "Kıyma")!.hucre, "I3");
  // Başlık satırı ürün sayılmaz
  assert.ok(!s.satirlar.some((x) => /alışveriş/i.test(x.urun) || x.urun === "ÜRÜN"));
});

test("bant düzeni (tek blok, ara başlık satırları): tedarikçi bant başlığından", () => {
  const izgara: unknown[][] = [
    ["21.11.2026 Alışveriş Listesi"],
    ["Miktar", "Birim", "Ürün", "Kategori", "Tedarikçi", "Açıklama"],
    [_, "FIRIN  ·  2 kalem"],
    [5, "Adet", "Ekmek", "Mutfak", _, _],
    [1, "Paket", "Simit", "Mutfak", _, "Sıcak olsun"],
    [_, "MANAV  ·  1 kalem"],
    [3, "kg", "Domates", "Mutfak", _, _],
  ];
  const s = alisverisListesiCoz(izgara);
  assert.equal(s.baslik, "21.11.2026 Alışveriş Listesi");
  assert.deepEqual(s.satirlar.map((x) => [x.urun, x.tedarikci]), [["Ekmek", "FIRIN"], ["Simit", "FIRIN"], ["Domates", "MANAV"]]);
  assert.equal(s.satirlar[1].aciklama, "Sıcak olsun");
  assert.deepEqual(s.uyarilar, []);
});

test("hiçbir bloğa girmeyen dolu hücre sessizce atlanmaz: uyarı verilir", () => {
  const izgara: unknown[][] = [
    [...B],
    [2, "kg", "Pirinç", "Gıda", _],
    [_, _, _, _, _, _, _, "Peçete 3 koli"],
  ];
  const s = alisverisListesiCoz(izgara);
  assert.equal(s.satirlar.length, 1);
  assert.equal(s.uyarilar.length, 1);
  assert.match(s.uyarilar[0], /1 hücre .*okunmadı: H3 “Peçete 3 koli”/);
});

test("miktar ve birim aynı hücrede ('20 kg'); eski düzen: ikinci 'Birim' sütunu ürün adı", () => {
  const izgara: unknown[][] = [
    ["ALIŞVERİŞ LİSTESİ"],
    ["GENEL İHTİYAÇLAR"],
    [],
    [_, "Miktar", "Ürün"],
    [_, "20 kg", "Patates"],
    [_, "500 gr", "Zencefil"],
    [_, "12'li", "Kağıt havlu"],
  ];
  const s = alisverisListesiCoz(izgara);
  assert.deepEqual(s.satirlar.map((x) => [x.urun, x.miktar, x.birim]), [["Patates", 20, "kg"], ["Zencefil", 500, "gr"], ["Kağıt havlu", null, null]]);
  assert.match(s.satirlar[2].sorun || "", /Miktar okunamadı/);
  assert.equal(s.satirlar[0].tedarikci, null, "GENEL İHTİYAÇLAR tedarikçi değildir");
  assert.ok(!s.uyarilar.some((u) => /okunmadı:/.test(u)), "genel başlık okunmuş sayılır");

  const eski = alisverisListesiCoz([
    ["Miktar", "Birim", "Birim", "Kategori"],
    [3, "kg", "Soğan", "Manav"],
    [2, "paket", "Tuz", "Gıda"],
  ]);
  assert.deepEqual(eski.satirlar.map((x) => [x.urun, x.birim]), [["Soğan", "kg"], ["Tuz", "paket"]]);
});

test("başlıktan tedarikçi adı", () => {
  assert.equal(baslikTedarikcisi("ALIŞVERİŞ LİSTESİ (30.10.2026)        CEM MARKET"), "CEM MARKET");
  assert.equal(baslikTedarikcisi("takozlar  ·  12 kalem"), "TAKOZLAR");
  assert.equal(baslikTedarikcisi("14.11.2026 Alışveriş Listesi"), null);
  assert.equal(baslikTedarikcisi("GENEL İHTİYAÇLAR"), null);
  assert.equal(baslikTedarikcisi(""), null);
  assert.equal(sutunHarfi(0), "A");
  assert.equal(sutunHarfi(27), "AB");
});

test("başlık satırı yoksa anlaşılır uyarı", () => {
  const s = alisverisListesiCoz([["Patates", 20], ["Soğan", 5]]);
  assert.equal(s.satirlar.length, 0);
  assert.match(s.uyarilar[0], /Başlık satırı bulunamadı/);
});

test("tekrar anahtarı ürün + tedarikçi (DB sa_token_kalem_ekle ile aynı kural)", async () => {
  const { kalemAnahtari } = await import("@/supabase/functions/_shared/satin-alma");
  assert.equal(kalemAnahtari("Patates", "TAKOZLAR"), kalemAnahtari("PATATES", "takozlar"));
  assert.equal(kalemAnahtari("Şeker", "Cem  Market"), kalemAnahtari("seker", "CEM MARKET"));
  assert.notEqual(kalemAnahtari("Patates", "TAKOZLAR"), kalemAnahtari("Patates", "CEM MARKET"));
  assert.notEqual(kalemAnahtari("Patates", null), kalemAnahtari("Patates", "CEM MARKET"));
  assert.equal(kalemAnahtari("Patates", ""), kalemAnahtari("Patates", null));
});

test("haftalık şablon: indirilen dosya Excel'den yüklemede kayıpsız geri okunur", async () => {
  const { haftalikSablonSayfasi, sayfaIzgarasi } = await import("@/lib/satin-alma/sablon");
  const k = (urun: string, miktar: number, birim: string, kategori: string, tedarikci: string | null, ek: Record<string, unknown> = {}) => ({
    id: urun, urun, miktar, birim, kategori, tedarikci, aciliyet: "normal", aciklama: null, talep_eden: "Test Kişi", karar: "onaylandi", red_nedeni: null, olusturma: "", ...ek,
  });
  const liste = {
    departman: "Mutfak",
    kalemler: [
      k("Patates", 20, "kg", "mutfak", "CEM MARKET"), k("Kıyma", 2.5, "kg", "mutfak", "SÖNMEZ ET"),
      k("Patates", 5, "kg", "mutfak", "TAKOZLAR", { onay_miktar: 3 }), k("Z havlu", 2, "koli", "temizlik", null, { aciklama: "Büyük boy" }),
      k("Toner", 1, "takim", "elektronik", null), k("Zeytin", 2, "kg", "mutfak", "CEM MARKET", { karar: "reddedildi" }),
      k("Eldiven", 3, "paket", "is_guvenligi", "CEM MARKET", { karar: "bekliyor" }), k("Kalem", 1, "diger", "kirtasiye", null),
    ],
  } as never;
  const sayfa = haftalikSablonSayfasi(liste, "21.11.2026");
  const s = alisverisListesiCoz(sayfaIzgarasi(sayfa));
  assert.deepEqual(s.uyarilar, []);
  assert.equal(s.baslik, "21.11.2026 Alışveriş Listesi");
  assert.deepEqual(
    s.satirlar.map((x) => [x.urun, x.miktar, x.birim, x.kategori, x.tedarikci, x.aciklama, x.sorun]),
    [
      ["Patates", 20, "kg", "mutfak", "CEM MARKET", "", null],
      ["Eldiven", 3, "paket", "is_guvenligi", "CEM MARKET", "", null],
      ["Kıyma", 2.5, "kg", "mutfak", "SÖNMEZ ET", "", null],
      ["Patates", 3, "kg", "mutfak", "TAKOZLAR", "", null],
      ["Z havlu", 2, "koli", "temizlik", null, "Büyük boy", null],
      ["Toner", 1, "takim", "elektronik", null, "", null],
      ["Kalem", 1, "diger", "kirtasiye", null, "", null],
    ],
    "reddedilen yazılmaz; değiştirilerek onaylananda onaylanan miktar",
  );
});
