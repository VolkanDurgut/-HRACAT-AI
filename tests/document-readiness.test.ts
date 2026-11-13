/**
 * Evrak hazirlik kontrolleri (lib/document-readiness.ts). Ders (28.10.2026): tarim belgelerinde (4-5-6) TO ORDER
 * yazilmaz; consignee TO ORDER ise notify gerekir.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkCertificateOfOriginReadiness, checkCommercialInvoiceReadiness, checkPackingListReadiness,
} from "@/lib/document-readiness";
import type { Dosya, Konteyner, Rezervasyon } from "@/lib/supabase";

const dosya = (x: Record<string, unknown>) => x as unknown as Dosya;
const rez = (x: Record<string, unknown>) => x as unknown as Rezervasyon;
const kont = (x: Record<string, unknown>) => x as unknown as Konteyner;

const tamFatura = {
  fatura_no: "FT-1", fatura_tarihi: "2026-11-01", alici_firma: "ORNEK ALICI", alici_adresi: "ADRES", consignee: "ORNEK ALICI",
  hesap_adi: "H", banka: "B", swift: "S", iban: "TR00", urun_detaylari: [{ miktar_mts: 1 }],
};

test("commercial invoice: tam dosya hazir, eksikler adlariyla", () => {
  assert.deepEqual(checkCommercialInvoiceReadiness(dosya(tamFatura), [], []), { hazir: true, eksikler: [] });
  const r = checkCommercialInvoiceReadiness(dosya({ ...tamFatura, iban: null, urun_detaylari: [] }), [], []);
  assert.equal(r.hazir, false);
  assert.deepEqual(r.eksikler, ["IBAN", "Ürün Detayları"]);
});

test("packing list: konteyner basina net / brut / kap adedi", () => {
  const d = dosya(tamFatura);
  const rz = [rez({ gemi_adi: "G", sefer_no: "S" })];
  assert.equal(checkPackingListReadiness(d, rz, []).eksikler.includes("Konteyner Bilgileri"), true);
  const r = checkPackingListReadiness(d, rz, [kont({ net_agirlik_kg: 1, brut_agirlik_kg: 2, pieces: 3 }), kont({ net_agirlik_kg: 1, brut_agirlik_kg: null, pieces: 3 })]);
  assert.deepEqual(r.eksikler, ["Brüt Ağırlık (bir veya daha fazla konteynerde eksik)"]);
});

test("mense sahadetnamesi: TO ORDER consignee notify olmadan eksik, notify ile hazir", () => {
  const temel = { urun_tanimi: "UN", ambalaj: "25 KG", lot_no: "L1", alici_firma: null, alici_adresi: null };
  const rz = [rez({ booking_no: "BK" })];
  const k = [kont({ net_agirlik_kg: 1, brut_agirlik_kg: 2 })];
  const eksik = checkCertificateOfOriginReadiness(dosya({ ...temel, consignee: "TO THE ORDER OF ORNEK BANKA", ham_veri: { notify: ["SAME AS CONSIGNEE"] } }), rz, k);
  assert.deepEqual(eksik.eksikler, ["Notify (consignee TO ORDER; notify bilgisi yok)"]);
  const hazir = checkCertificateOfOriginReadiness(dosya({ ...temel, consignee: "TO ORDER", ham_veri: { notify: ["ORNEK NOTIFY LTD"] } }), rz, k);
  assert.equal(hazir.hazir, true);
  const yok = checkCertificateOfOriginReadiness(dosya({ ...temel, consignee: null }), rz, k);
  assert.equal(yok.eksikler[0], "Consignee (konşimento talimatı eklenmemiş)");
});
