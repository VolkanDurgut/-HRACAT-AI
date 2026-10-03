/**
 * Varis limani dogrulamasi (talep: 03.10.2026).
 *
 * Kok neden: FOB proformada "FOB Ambarli Port" gibi yazan liman YUKLEME
 * limanidir; proforma okuma bunu varis limanina yazdi (IHR-2026-0076,
 * Kuba sevkiyati "AMBARLI" olarak analize girdi). Kullanici kurali:
 * "Varis limani yukleme limani ile ayni olamaz." Ihracat Turkiye'den
 * yapildigi icin bir Turkiye limani da varis limani olamaz.
 *
 * Kullanildigi yerler: yeni dosya acilisi (gecersizse ayni musterinin onceki
 * dosyasindaki varis limani onerilir), Lojistik karti kaydi (gecersizse
 * kaydetmez), Analiz (gecersiz kayit liman listelerine girmez).
 */
import { limanAnahtari, sadelestir } from "@/lib/liman-anahtari";

/** Turkiye limanlari / terminalleri (sadelestirilmis, buyuk harf). YILPORT
 * bilerek YOK: yurt disinda da terminalleri var (Leixoes, Gavle, Taranto...). */
const TURKIYE_LIMANLARI = [
  "AMBARLI", "MARPORT", "KUMPORT", "MARDAS", "HAYDARPASA", "ISTANBUL",
  "MERSIN", "IZMIR", "ALIAGA", "NEMPORT", "GEMLIK", "BORUSAN", "TEKIRDAG",
  "ASYAPORT", "ASYA PORT", "MARTAS", "AKPORT", "DERINCE", "EVYAP",
  "KOCAELI", "DILISKELESI", "ISKENDERUN", "ISDEMIR", "SAMSUN", "TRABZON",
  "BANDIRMA", "GEBZE", "ANTALYA", "TURKIYE", "TURKEY",
];

/** Metin bir Turkiye limani/terminali iceriyor mu (kelime bazinda). */
export function turkiyeLimaniMi(metin: string | null | undefined): boolean {
  if (!metin || !metin.trim()) return false;
  const s = ` ${sadelestir(metin).replace(/[^A-Z0-9]+/g, " ").trim()} `;
  return TURKIYE_LIMANLARI.some((liman) => s.includes(` ${liman} `));
}

export type VarisLimaniSorunu = "bos" | "yukleme_ile_ayni" | "turkiye_limani";

/**
 * Varis limani gecersizse sebebini, gecerliyse null doner. Yukleme limani
 * karsilastirmasi lib/liman-anahtari.ts ile (yazim farklarini yok sayarak).
 */
export function varisLimaniSorunu(
  varis: string | null | undefined,
  yuklemeLimanlari: (string | null | undefined)[] = []
): VarisLimaniSorunu | null {
  if (!varis || !varis.trim()) return "bos";
  const anahtar = limanAnahtari(varis);
  if (anahtar && yuklemeLimanlari.some((y) => y && limanAnahtari(y) === anahtar)) return "yukleme_ile_ayni";
  if (turkiyeLimaniMi(varis)) return "turkiye_limani";
  return null;
}

export const VARIS_LIMANI_SORUN_METNI: Record<VarisLimaniSorunu, string> = {
  bos: "Varış limanı boş.",
  yukleme_ile_ayni: "Varış limanı yükleme limanıyla aynı olamaz.",
  turkiye_limani: "Varış limanı bir Türkiye limanı olamaz (yükleme limanı yazılmış olabilir).",
};
