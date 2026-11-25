/**
 * 25.11.2026: .xls (BIFF8 / OLE2) okuyucu + liman portali Excel ayristirma. Test dosyasi bellekte uretilir; veriler KURGUDUR.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { xlsOku } from "@/lib/xls-oku";
import { limanExceliAyristir, limanTarihi, gemiSeferUyar } from "@/lib/ic-piyasa/liman-excel";

// ---- Kucuk BIFF8 + CFB yazici (yalniz test) ----
const kayit = (tur: number, veri: number[]) => [tur & 255, tur >> 8, veri.length & 255, veri.length >> 8, ...veri];
const u16 = (n: number) => [n & 255, (n >> 8) & 255];
const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const f64 = (n: number) => Array.from(new Uint8Array(new Float64Array([n]).buffer));
const sstMetin = (s: string) => {
  const genis = /[^\x00-\xff]/.test(s);
  return [...u16(s.length), genis ? 1 : 0, ...(genis ? Array.from(s).flatMap((c) => u16(c.charCodeAt(0))) : Array.from(s).map((c) => c.charCodeAt(0)))];
};

function xlsUret(tablo: (string | number)[][]): Uint8Array {
  const metinler: string[] = [];
  const idx = (s: string) => { let i = metinler.indexOf(s); if (i < 0) { metinler.push(s); i = metinler.length - 1; } return i; };
  const hucreler: number[] = [];
  tablo.forEach((satir, r) => satir.forEach((v, c) => {
    if (typeof v === "string") hucreler.push(...kayit(0x00fd, [...u16(r), ...u16(c), ...u16(15), ...u32(idx(v))]));
    else if (Number.isInteger(v) && Math.abs(v) < 1 << 28) hucreler.push(...kayit(0x027e, [...u16(r), ...u16(c), ...u16(15), ...u32(((v << 2) | 2) >>> 0)]));
    else hucreler.push(...kayit(0x0203, [...u16(r), ...u16(c), ...u16(15), ...f64(v)]));
  }));
  const bof = (tip: number) => kayit(0x0809, [...u16(0x0600), ...u16(tip), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const sst = kayit(0x00fc, [...u32(metinler.length), ...u32(metinler.length), ...metinler.flatMap(sstMetin)]);
  const dolgu = kayit(0x00ef, new Array(4200).fill(0)); // >= 4096: mini akis degil, normal akis
  const ad = "ExportToExcel";
  const boundsheetUz = 4 + 8 + ad.length;
  const kitapOnce = [...bof(5), ...dolgu, ...sst];
  const sheetOfset = kitapOnce.length + boundsheetUz + 4; // + EOF
  const kitap = [...kitapOnce, ...kayit(0x0085, [...u32(sheetOfset), 0, 0, ad.length, 0, ...Array.from(ad).map((c) => c.charCodeAt(0))]), ...kayit(0x000a, []),
    ...bof(0x10), ...hucreler, ...kayit(0x000a, [])];
  // CFB: 512 bayt sektor; sektor 0 = FAT, 1 = dizin, 2.. = Workbook
  const S = 512;
  const wbSek = Math.ceil(kitap.length / S);
  const dosya = new Uint8Array(S * (3 + wbSek));
  const dv = new DataView(dosya.buffer);
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].forEach((b, i) => (dosya[i] = b));
  dv.setUint16(0x1a, 0x3e, true); dv.setUint16(0x1c, 3, true); dv.setUint16(0x1e, 9, true); dv.setUint16(0x20, 6, true);
  dv.setUint32(0x2c, 1, true); dv.setInt32(0x30, 1, true); dv.setUint32(0x38, 4096, true);
  dv.setInt32(0x3c, -2, true); dv.setInt32(0x44, -2, true);
  for (let i = 0; i < 109; i++) dv.setInt32(0x4c + i * 4, i === 0 ? 0 : -1, true);
  const fat = S; // sektor 0
  for (let i = 0; i < S / 4; i++) dv.setInt32(fat + i * 4, -1, true);
  dv.setInt32(fat, -3, true); dv.setInt32(fat + 4, -2, true);
  for (let i = 0; i < wbSek; i++) dv.setInt32(fat + (2 + i) * 4, i === wbSek - 1 ? -2 : 3 + i, true);
  const dizinYaz = (n: number, ad2: string, tur: number, bas: number, boyut: number) => {
    const o = 2 * S + n * 128;
    Array.from(ad2).forEach((c, i) => dv.setUint16(o + i * 2, c.charCodeAt(0), true));
    dv.setUint16(o + 0x40, (ad2.length + 1) * 2, true);
    dosya[o + 0x42] = tur;
    dv.setInt32(o + 0x44, -1, true); dv.setInt32(o + 0x48, -1, true); dv.setInt32(o + 0x4c, n === 0 ? 1 : -1, true);
    dv.setInt32(o + 0x74, bas, true); dv.setUint32(o + 0x78, boyut, true);
  };
  dizinYaz(0, "Root Entry", 5, -2, 0);
  dizinYaz(1, "Workbook", 2, 2, kitap.length);
  dosya.set(kitap, 3 * S);
  return dosya;
}

const BASLIK = ["Firma Kodu", "Araç Plakası*", "Boş Ağırlık", "Dolu Ağırlık", "Ağırlık", "Operasyon Tarihi", "Giriş Tarihi", "Çıkış Tarihi", "Fiş Kodu", "Gemi/Sefer", "Alıcı Firma"];
// 46351.8875 = 25.11.2026 21:18 (TR)
const SATIR = (plaka: string, bos: number, dolu: number, cikis: number, fis: string, gemi = "KURGU GEMI 2026-1/2026-1", alici = "Kurgu Ticaret Gida") =>
  ["KURGU", plaka, bos, dolu, dolu - bos, cikis, cikis - 0.02, cikis, fis, gemi, alici];

test("xlsOku: BIFF8 / CFB, SST (Turkce harf), RK, NUMBER; sayfa adi", () => {
  const buf = xlsUret([BASLIK, [], SATIR("34KRG01", 14400, 40700, 46351.8875, "KURGUFIS1"), SATIR("34KRG02", 14140.5, 39140, 46351.890278, "KURGUFIS2")]);
  const s = xlsOku(buf);
  assert.equal(s.length, 1);
  assert.equal(s[0].ad, "ExportToExcel");
  assert.equal(s[0].satirlar[0][1], "Araç Plakası*");
  assert.equal(s[0].satirlar[2][2], 14400);
  assert.equal(s[0].satirlar[3][2], 14140.5);
  assert.equal(s[0].satirlar[2][8], "KURGUFIS1");
});

test("xlsOku: .xls olmayan dosya anlasilir hata", () => {
  assert.throws(() => xlsOku(new TextEncoder().encode("PK\u0003\u0004 xlsx degil")), /eski Excel/);
});

test("limanExceliAyristir: basliga gore sutun, TR saati -> UTC, cikisa gore sira, mukerrer fis tek", () => {
  const tablo = xlsOku(xlsUret([BASLIK, [], SATIR("34KRG02", 14140, 39140, 46351.890278, "F2"), SATIR("34KRG01", 14400, 40700, 46351.8875, "F1"), SATIR("34KRG01", 14400, 40700, 46351.8875, "F1"), ["", "", "", "", "", "", "", "", "", "", ""]]))[0].satirlar;
  const r = limanExceliAyristir(tablo);
  assert.deepEqual(r.hatalar, []);
  assert.deepEqual(r.satirlar.map((x) => [x.fis_kodu, x.plaka, x.net_kg, x.bos_kg, x.dolu_kg, x.cikis]), [
    ["F1", "34 KRG 01", 26300, 14400, 40700, "2026-11-25T18:18:00.000Z"],
    ["F2", "34 KRG 02", 25000, 14140, 39140, "2026-11-25T18:22:00.000Z"],
  ]);
  assert.deepEqual(r.gemiler, ["KURGU GEMI 2026-1/2026-1"]);
});

test("limanExceliAyristir: hatali satirlar ve baslik yok", () => {
  const r = limanExceliAyristir([BASLIK, SATIR("??", 1, 2, 46351.9, "X1"), ["K", "34KRG03", 14000, 14500, 500, 46351.9, 46351.9, 46351.9, "X2", "G", "A"], ["K", "34KRG04", 14000, 40000, 26000, "", "", "bozuk", "X3", "G", "A"]]);
  assert.equal(r.satirlar.length, 0);
  assert.equal(r.hatalar.length, 3);
  assert.match(limanExceliAyristir([["a", "b"], [1, 2]]).hatalar[0].hata, /Başlık/);
});

test("limanTarihi ve gemiSeferUyar", () => {
  assert.equal(limanTarihi("25.11.2026 21:38"), "2026-11-25T18:38:00.000Z");
  assert.equal(limanTarihi(46351.901388889), "2026-11-25T18:38:00.000Z");
  assert.equal(limanTarihi("yok"), null);
  assert.equal(gemiSeferUyar("MV KURGU GEMI", "KURGU GEMI 2026-1/2026-1"), true);
  assert.equal(gemiSeferUyar("M/V KURGU GEMI", "BASKA 2026-1"), false);
  assert.equal(gemiSeferUyar("MV KURGU GEMI", null), true);
});
