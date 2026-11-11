/**
 * Gunluk raporlarin iki oturumu (11.11.2026): SABAH 08:00 ve AKSAM 17:00 (Istanbul, UTC+3).
 * pg_cron 05:00 ve 14:00 UTC'de cagirir; edge yalniz pencere icinde (07:55-09:00 / 16:55-18:00) zamanlanmis
 * gonderim yapar. Tekrar korumasi: sirket + gun + oturum icin tek kayit.
 */
export type RaporOturumu = "sabah" | "aksam";
export const RAPOR_SAATLERI = "08:00 ve 17:00";

export const trDakika = (ms: number) => { const tr = new Date(ms + 3 * 3600_000); return tr.getUTCHours() * 60 + tr.getUTCMinutes(); };

/** Zamanlanmis gonderim penceresindeyse oturum, degilse null. */
export function oturumPenceresi(ms: number): RaporOturumu | null {
  const dk = trDakika(ms);
  if (dk >= 8 * 60 - 5 && dk < 9 * 60) return "sabah";
  if (dk >= 17 * 60 - 5 && dk < 18 * 60) return "aksam";
  return null;
}

/** Elle / test gonderimde etiket: Istanbul saati 13:00'ten once sabah. */
export const oturumSaatten = (ms: number): RaporOturumu => (trDakika(ms) < 13 * 60 ? "sabah" : "aksam");

export const oturumAdi = (o: RaporOturumu) => (o === "sabah" ? "Sabah raporu" : "Akşam raporu");
