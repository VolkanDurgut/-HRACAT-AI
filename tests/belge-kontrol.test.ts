/**
 * Belge kontrolleri (16.11.2026): konteyner no eslesmesi + ISO 6346 kontrol hanesi uyarisi (konsimento talimati,
 * Draft BL, beyanname) ve sablondan bagimsiz Draft BL kontrolu. Veriler KURGUSALDIR.
 * Gecerli: TSTU1000003, TSTU1000019, TSTU1000024, TSTU1000030. Kontrol hanesi TUTMAYAN: TSTU1000034 (son hane 0 olmali).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { belgedekiKonteynerler, kontrolHanesi, konteynerGecerli, kontrolHanesiHatalari } from "@/lib/konteyner-no";
import { konsimentoMetniniKontrolEt, draftBlMetniniKontrolEt, sayiGeciyor, talimatKonteynerleri } from "@/lib/konsimento/kontrol";
import { beyannameMetniOku, beyannameKarsilastir } from "@/lib/beyanname-kontrol";
import type { TalimatModeli } from "@/lib/konsimento/talimat";

const GECERLI = ["TSTU1000003", "TSTU1000019", "TSTU1000024"];
const HATALI = "TSTU1000034";

test("ISO 6346 kontrol hanesi", () => {
  for (const n of GECERLI) assert.equal(konteynerGecerli(n), true, n);
  assert.equal(konteynerGecerli("TSTU1000030"), true);
  assert.equal(konteynerGecerli(HATALI), false);
  assert.equal(kontrolHanesi(HATALI), 0);
  assert.deepEqual(kontrolHanesiHatalari([...GECERLI, HATALI]), [{ no: HATALI, beklenen: 0 }]);
});

test("belgedeki konteynerler: sistemdeki numara kontrol hanesi tutmasa da eslesir; sistemde olmayan gecersiz numara elenir", () => {
  const metin = `CNTR: TSTU 1000003 / ${HATALI} / ABCU1234561 (gurultu) TSTU1000019`;
  assert.deepEqual(belgedekiKonteynerler(metin, [HATALI]), ["TSTU1000003", HATALI, "TSTU1000019"]);
  assert.deepEqual(belgedekiKonteynerler(metin), ["TSTU1000003", "TSTU1000019"]);
});

const model = (no: string[]): TalimatModeli => ({
  booking: "BKG123456", gemi: "M/V ORNEK GEMI 12E", gemiAdi: "M/V ORNEK GEMI", sefer: "12E", pol: "MARPORT - AMBARLI", polAnahtar: "MARPORT",
  pod: "Ornekport Port, Ornekistan", gtip: "11010015", navlun: "PREPAID", consignee: "ORNEK ALICI LTD, PO BOX 1\nORNEK SEHIR", notify: ["ORNEK ALICI LTD, PO BOX 1"],
  toplamKap: no.length * 1000, toplamNet: no.length * 25000, toplamBrut: no.length * 25050,
  konteynerler: no.map((n, i) => ({ no: n, tip: "20DC", muhur: `77000${i}`, kap: 1000, net: 25000, brut: 25050 })),
} as unknown as TalimatModeli);

test("Akkon talimati: kontrol hanesi tutmayan ama belgede aynen yazan konteyner 'belgede yok' SAYILMAZ; ayri uyari satiri", () => {
  const no = [GECERLI[0], GECERLI[1], HATALI];
  const metin = [
    "AKKON DENİZCİLİK", "KONİŞMENTO TALİMAT FORMU / BILL OF LADING INSTRUCTION FORM", "ALICI (CONSIGNEE) :", "ORNEK ALICI LTD, PO BOX 1", "İHBAR (NOTIFY PARTY) :", "ORNEK ALICI LTD, PO BOX 1",
    "GEMİ / SEFER (vessel/voyage) : M/V ORNEK GEMI / 12E", "YÜKLEME LİMANI (port of loading) : MARPORT - AMBARLI", "TAHLİYE LİMANI (port of discharge) : ORNEKPORT",
    "HS CODES / GTIP NO : 11010015", "NET: 75.000 KG BRÜT: 75.150 KG", "KONTEYNER NUMARASI MÜHÜR NO KAP NET BRÜT",
    ...no.map((n, i) => `${n} 77000${i} 1000 25000 25050`), "NAVLUN (freight) : PREPAID ( X ) COLLECT ( )",
  ].join("\n");
  assert.equal(talimatKonteynerleri(metin).length, 2, "eski davranis: sistem listesi verilmezse elenir");
  const m = { ...model(no), pod: "ORNEKPORT" } as TalimatModeli;
  const r = konsimentoMetniniKontrolEt(metin, m)!;
  const satir = (a: string) => r.kontroller.find((x) => x.alan === a)!;
  assert.equal(satir("Konteynerler").durum, "uyumlu");
  assert.equal(satir("Konteyner no (ISO)").durum, "bilgi");
  assert.match(satir("Konteyner no (ISO)").not!, /TSTU1000034: kontrol hanesi tutmuyor \(son hane 0 olmalı\)/);
  assert.equal(r.uyumlu, true);
  assert.match(r.ozet, /kontrol hanesi tutmuyor/);
});

test("sayi yazimlari: 25050 / 25.050 / 25,050.000 / 125.250,00", () => {
  assert.equal(sayiGeciyor("GROSS 25,050.000 KGS", 25050), true);
  assert.equal(sayiGeciyor("BRUT 25.050 KG", 25050), true);
  assert.equal(sayiGeciyor("125.250,00", 125250), true);
  assert.equal(sayiGeciyor("125250", 125250), true);
  assert.equal(sayiGeciyor("1125250", 125250), false);
  assert.equal(sayiGeciyor("25.0501", 25050), false);
});

test("Draft BL (sablondan bagimsiz): ayni limanin farkli yazimi, unvan, mühür, agirlik; eksik konteyner ve yanlis gemi yakalanir", () => {
  const no = [GECERLI[0], GECERLI[1], GECERLI[2]];
  const govde = (konteynerler: string[], gemi: string) => [
    "BILL OF LADING (DRAFT)  B/L No: ORNK000111  Booking: BKG123456",
    "SHIPPER: UNEX GIDA SAN. VE TIC. LTD. STI. TEKIRDAG TURKEY",
    "CONSIGNEE: ORNEK ALICI LTD", "P.O. BOX 1, ORNEK SEHIR", "NOTIFY PARTY: SAME AS CONSIGNEE ORNEK ALICI LTD",
    `VESSEL: ${gemi}  VOYAGE: 12E`, "PORT OF LOADING: AMBARLI, TURKEY", "PORT OF DISCHARGE: ORNEKPORT",
    ...konteynerler.map((n, i) => `${n} / SEAL 77000${i} / 20'DV / 1,000 BAGS / 25,050.000 KGS`),
    "TOTAL: 3,000 BAGS  GROSS WEIGHT 75,150.000 KGS  NET WEIGHT 75,000.000 KGS",
    "WHEAT FLOUR HS CODE 110100 FREIGHT PREPAID SHIPPED ON BOARD",
  ].join("\n");
  const r = draftBlMetniniKontrolEt(govde(no, "ORNEK GEMI"), model(no))!;
  const d = Object.fromEntries(r.kontroller.map((x) => [x.alan, x.durum]));
  assert.deepEqual(d, {
    "Booking no": "uyumlu", "Gemi / sefer": "uyumlu", "Yükleme limanı": "uyumlu", "Tahliye limanı": "uyumlu", Konteynerler: "uyumlu",
    "Mühür no": "uyumlu", "Brüt (konteyner)": "uyumlu", "Toplam brüt": "uyumlu", "Toplam net": "uyumlu", "Toplam kap": "uyumlu", Consignee: "uyumlu", Notify: "uyumlu",
  });
  assert.equal(r.uyumlu, true);
  assert.equal(r.sablon, "draft_bl");

  const eksik = draftBlMetniniKontrolEt(govde(no.slice(0, 2), "BASKA GEMI"), model(no))!;
  const e = Object.fromEntries(eksik.kontroller.map((x) => [x.alan, x]));
  assert.equal(e["Konteynerler"].durum, "uyusmuyor");
  assert.match(e["Konteynerler"].not!, /Belgede yok: TSTU1000024/);
  assert.equal(e["Gemi / sefer"].durum, "uyusmuyor");
  assert.equal(eksik.uyumlu, false);
});

test("Draft BL: metin katmani yoksa ya da konteyner bulunamazsa null (yapay zeka yedegi)", () => {
  assert.equal(draftBlMetniniKontrolEt("", model(GECERLI)), null);
  assert.equal(draftBlMetniniKontrolEt("x ".repeat(300), model(GECERLI)), null);
});

test("beyanname: sistemdeki kontrol hanesi tutmayan konteyner eslesir + uyari", () => {
  const metin = `12345678EX123456789 Gemi ORNEK GEMI 1 KONTEYNER 25.000,00 KGM ${GECERLI[0]} ${HATALI}`;
  const o = beyannameMetniOku([metin]);
  assert.deepEqual(o.konteynerler, [GECERLI[0]]);
  assert.ok(o.konteynerAdaylari.includes(HATALI));
  const r = beyannameKarsilastir(o, {
    faturaNolari: [], faturaTarihi: null, toplamTutar: null, paraBirimi: null, teslimSekli: null, varisLimani: null, aliciFirma: null,
    gemiler: [], konteynerler: [GECERLI[0], HATALI], netKg: null, diibler: [],
  });
  const k = Object.fromEntries(r.kontroller.map((x) => [x.alan, x]));
  assert.equal(k["Konteynerler"].durum, "uyumlu");
  assert.equal(k["Konteyner no (ISO)"].durum, "bilgi");
});
