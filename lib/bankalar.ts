/**
 * Sirketin banka hesaplari - TEK KAYNAK (17.10.2026'da components/banka-bilgileri-card.tsx
 * icinden tasindi; proforma olusturucu da ayni listeyi kullanir).
 *
 * Banka Bilgileri karti: "Duzenle" modalinda tek tikla doldurma; hangi hesabin
 * (USD / EUR) kullanilacagi dosyanin para birimine gore secilir.
 * Proforma: taslak sablondaki gibi USD ve EUR hesaplari BIRLIKTE basilir.
 */
export type BankaAnahtari = "denizbank" | "vakifbank" | "ziraat";

export const BANKA_PRESETLERI: {
  anahtar: BankaAnahtari;
  goruntulenenAd: string;
  banka: string;
  swift: string;
  usd: { hesap_numarasi: string; iban: string };
  eur: { hesap_numarasi: string; iban: string };
}[] = [
  {
    anahtar: "denizbank",
    goruntulenenAd: "Denizbank",
    banka: "DENIZBANK A.S.",
    swift: "DENITRISXXX",
    usd: { hesap_numarasi: "1525-19081507-352", iban: "TR71 0013 4000 0190 8150 7000 02" },
    eur: { hesap_numarasi: "1525-19081507-361", iban: "TR74 0013 4000 0190 8150 7000 45" },
  },
  {
    anahtar: "vakifbank",
    goruntulenenAd: "Vakıfbank",
    banka: "T.C. VAKIFBANK A.S",
    swift: "TVBATR2AXXX",
    usd: { hesap_numarasi: "0015 8048 0198 35658", iban: "TR93 0001 5001 5804 8019 8356 58" },
    eur: { hesap_numarasi: "001 5804 8019 8356 66", iban: "TR71 0001 5001 5804 8019 8356 66" },
  },
  {
    anahtar: "ziraat",
    goruntulenenAd: "Ziraat Bankası",
    banka: "T.C. ZIRAAT BANKASI",
    swift: "TCZBTR2A",
    usd: { hesap_numarasi: "27 0897 5159 0150 06", iban: "TR82 0001 0027 0897 5159 0150 06" },
    eur: { hesap_numarasi: "27 0897 5159 0150 07", iban: "TR55 0001 0027 0897 5159 0150 07" },
  },
];

/** Sirketin banka hesaplarindaki sabit hesap adi - tum bankalarda ayni. */
export const SABIT_HESAP_ADI = "UNEX GIDA SAN. VE TIC. LTD. STI.";

export function bankaBul(anahtar: string | null | undefined) {
  return BANKA_PRESETLERI.find((b) => b.anahtar === anahtar) || null;
}

/** Serbest banka metninden ("T.C. ZIRAAT BANKASI", "DENIZBANK A.S.") anahtar. */
export function bankaAnahtariTahmin(banka: string | null | undefined): BankaAnahtari | null {
  const b = String(banka || "").toLocaleUpperCase("en-US");
  if (b.includes("DENIZ")) return "denizbank";
  if (b.includes("VAKIF")) return "vakifbank";
  if (b.includes("ZIRAAT") || b.includes("ZİRAAT")) return "ziraat";
  return null;
}
