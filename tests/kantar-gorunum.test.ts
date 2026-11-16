/**
 * Kantar Paneli ihracat sekmeleri (lib/kantar-gorunum.ts). Veriler kurgusaldir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { eksikDolumlar, gorunenSevkiyatlar, kantarDosyaYolu, kantarSekmesi, panelDosyaYolu } from "@/lib/kantar-gorunum";
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
