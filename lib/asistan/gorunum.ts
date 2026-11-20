/**
 * Yonetici Asistani - saf kurallar (21.11.2026). Tek yer: supabase/functions/_shared/yonetici-asistan.ts
 * (gorev ve hazir mail kurallari).
 */
import { YONETICI_EPOSTASI } from "@/supabase/functions/_shared/yonetici-asistan";

export * from "@/supabase/functions/_shared/yonetici-asistan";

/** Paneli yalniz yonetici gorur (veritabani da ayni e-postayi kontrol eder: yonetici_asistani_mi). */
export function yoneticiMi(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === YONETICI_EPOSTASI;
}

export type AsistanFiltre = "acik" | "gonderildi" | "tumu";
export const ASISTAN_FILTRELERI: AsistanFiltre[] = ["acik", "gonderildi", "tumu"];
/** ?filtre= degeri; bilinmeyen -> null (varsayilan "acik") */
export function asistanFiltresi(v: string | null | undefined): AsistanFiltre | null {
  return v && (ASISTAN_FILTRELERI as string[]).includes(v) ? (v as AsistanFiltre) : null;
}
