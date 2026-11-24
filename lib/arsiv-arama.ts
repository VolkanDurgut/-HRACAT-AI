// 24.11.2026: Ihracatlar arsivi yardimcilari (saf; testlenebilir).

/** Konteyner numaralarini virgulle yan yana birlestirir ("ABCU1234567, DEFU7654321"); bos/tekrar atlanir. */
export function konteynerNolariMetni(konteynerler: { konteyner_no: string | null | undefined }[]): string {
  const gorulen = new Set<string>();
  const sonuc: string[] = [];
  for (const k of konteynerler) {
    const no = (k.konteyner_no || "").trim().toUpperCase();
    if (!no || gorulen.has(no)) continue;
    gorulen.add(no);
    sonuc.push(no);
  }
  return sonuc.join(", ");
}

/**
 * PostgREST .or(...) filtresine guvenli girecek arama terimi: virgul ve parantez filtre sozdizimini bozar
 * (boslukla degistirilir), * ve % joker sayilir (atilir). Bos kalirsa null.
 */
export function aramaTerimi(girdi: string): string | null {
  const t = girdi.replace(/[,()]/g, " ").replace(/[*%]/g, "").replace(/\s+/g, " ").trim();
  return t ? t : null;
}
