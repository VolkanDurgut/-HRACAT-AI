// ============================================================================
// KONSIMENTO TALIMATI SABLONLARI - acente -> sablon kaydi (06.11.2026)
// ============================================================================
// SAF, importsuz: hem edge function (konsimento-hatirlatma maili) hem uygulama okur.
// Kullanici (06.11.2026): "Her acentenin konsimento talimati talebi sablonlari farkli. Bunlari
// sisteme tanitacagiz." Ornekler kullanicidan (gercek dosyalar repoda YOK):
//   - DRAFT/MAERSK formu ("SHIPPING INSTRUCTION (KONSIMENTO TALIMATI)", sari baslikli tablo)
//     -> "standart". Kullanici: "ESNA/HAPAG ve ADMIRAL icin de DRAFT/MAERSK talimati gecerlidir."
//   - AKKON LINES formu ("KONISMENTO TALIMAT FORMU / BILL OF LADING INSTRUCTION FORM") -> "akkon".
//   - MSC: "Onlarin web sitesi uzerinden talimat geciliyor; sadece konsimento talimati icin
//     hatirlatma gecilmeli." -> "msc_web" (talimat OLUSTURULMAZ, yalniz hatirlatma).
// Tanimsiz acente (DRAFT/CMA, CULINES, ONE, DAHNAY/CMA...) -> "standart" VARSAYILAN; uygulama
// "varsayilan sablon" diye isaretler, kullanici dosyada degistirebilir.
// ============================================================================

export type KonsimentoSablonu = "standart" | "akkon" | "msc_web";

export const KONSIMENTO_SABLON_ADI: Record<KonsimentoSablonu, string> = {
  standart: "Standart talimat (Draft / Maersk formu)",
  akkon: "Akkon Lines talimat formu",
  msc_web: "MSC web sitesi",
};

/** Tanitilan acenteler (kayit). Eslesme: acente adinda (buyuk harf) kelime gecmesi. */
export const KONSIMENTO_ACENTE_KAYDI: { anahtar: string; sablon: KonsimentoSablonu; not: string }[] = [
  { anahtar: "AKKON", sablon: "akkon", not: "Akkon Lines kendi formu" },
  { anahtar: "MSC", sablon: "msc_web", not: "Talimat MSC web sitesinden girilir; yalniz hatirlatma" },
  { anahtar: "DRAFT", sablon: "standart", not: "Draft Shipping (Maersk / CMA / Hapag)" },
  { anahtar: "ESNA", sablon: "standart", not: "Kullanici: DRAFT/MAERSK talimati gecerli" },
  { anahtar: "ADMIRAL", sablon: "standart", not: "Kullanici: DRAFT/MAERSK talimati gecerli" },
];

const buyuk = (s: string | null | undefined) =>
  (s || "").toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/[^A-Z0-9]+/g, " ").trim();

/** Rezervasyondaki acente adindan sablon. varsayilan=true: acente tanitilmamis, standart form kullanildi. */
export function konsimentoSablonuBul(acente: string | null | undefined): { sablon: KonsimentoSablonu; varsayilan: boolean; not: string } {
  const a = ` ${buyuk(acente)} `;
  for (const k of KONSIMENTO_ACENTE_KAYDI) {
    if (a.includes(` ${k.anahtar} `)) return { sablon: k.sablon, varsayilan: false, not: k.not };
  }
  return { sablon: "standart", varsayilan: true, not: acente ? "Acente tanıtılmadı; standart form kullanılır." : "Rezervasyonda acente yok; standart form kullanılır." };
}

// Akkon formundaki "Gumruk Musaviri" blogu SIRKET AYARIDIR: companies.konsimento_gumruk_musaviri
// (repo herkese acik; ucuncu taraf iletisim bilgisi koda yazilmaz).
