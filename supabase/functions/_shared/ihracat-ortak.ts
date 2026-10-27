// ============================================================================
// IHRACAT - ortak saf kurallar (27.10.2026)
// ============================================================================
// SAF TypeScript (Deno/Next bagimliligi yok). Hem uygulama (lib/teslim-sekli.ts,
// lib/sigorta-talimati.ts bunlari yeniden disa aktarir) hem edge function
// "konsimento-hatirlatma" AYNI kurali kullanir - kural TEK YERDE.
// ============================================================================

const NAVLUNU_ALICI_ODER = /\b(FOB|FCA|FAS|EXW)\b/;

/**
 * FOB / FCA / FAS / EXW teslimlerde ana navlunu ALICI oder (05.10.2026).
 * teslim_sekli serbest metin ("FOB", "FOB AMBARLI", "fob - Mersin" ...);
 * kelime olarak aranir, buyuk/kucuk harf fark etmez.
 */
export function navlunAliciyaAitMi(teslimSekli: string | null | undefined): boolean {
  if (!teslimSekli) return false;
  return NAVLUNU_ALICI_ODER.test(teslimSekli.toLocaleUpperCase("en-US"));
}

/**
 * Ingilizce ambalaj metnini Turkce kaliba cevirir (02.10.2026, sigorta talimati):
 *   "2.500 PIECES OF 50 KG PP BAGS+KRAFT" -> "2.500 ADET 50 KG PP+KRAFT ÇUVAL"
 *   "7.000 PIECES OF IBRAHIM BRANDED 25 KG PP BAGS" -> "7.000 ADET IBRAHIM MARKALI 25 KG PP ÇUVAL"
 * Taninmayan kelimeler oldugu gibi kalir.
 */
export function ambalajTurkce(metin: string | null | undefined): string {
  let s = (metin || "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  s = s.toUpperCase();
  s = s
    .replace(/\bPIEC+ES?(\s+PIEC+ES?)*(\s+OF)?\b/g, "ADET")
    .replace(/\bPP\s*BAGS?\s*\+\s*KRAFT\b/g, "PP+KRAFT ÇUVAL")
    .replace(/\bPP\s*\+\s*KRAFT\s*BAGS?\b/g, "PP+KRAFT ÇUVAL")
    .replace(/\bBAGS?\b/g, "ÇUVAL")
    .replace(/\bBRANDED\b/g, "MARKALI")
    .replace(/\bBRAND\b/g, "MARKA")
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/, "")
    .trim();
  return s;
}
