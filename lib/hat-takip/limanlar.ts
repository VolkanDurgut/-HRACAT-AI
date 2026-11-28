/**
 * HAT TAKIP Asama 4 (28.11.2026): Sefer Ara icin liman kodlari (UN/LOCODE). SAF.
 * Sistemde limanlar serbest metin ("DJIBOUTI PORT, DJIBOUTI"); Hapag-Lloyd UN/LOCODE ister. Esleme: limanAnahtari()
 * (lib/liman-anahtari.ts, Sevkiyat Haritasi ile ayni anahtar) -> VARIS_KODLARI. dogrulandi: 28.11.2026'da Hapag
 * Commercial Schedules'ta TRIST'ten sorgulanip cevap alinan kod. Listede olmayan liman icin kod elle yazilabilir.
 * Test: tests/hat-sefer.test.ts.
 */
import { limanAnahtari } from "@/lib/liman-anahtari";

export type LimanSecenegi = { kod: string; ad: string; ulke: string; dogrulandi?: boolean };

/** Cikis limanlari. Hapag Ambarli terminallerini (Kumport, Marport, Mardas) TRIST ile tanir; TRAMR'yi tanimaz (28.11.2026). */
export const CIKIS_LIMANLARI: LimanSecenegi[] = [
  { kod: "TRIST", ad: "İstanbul – Ambarlı (Kumport / Marport / Mardaş)", ulke: "Türkiye", dogrulandi: true },
  { kod: "TRTEK", ad: "Tekirdağ (Asyaport / Ceyport)", ulke: "Türkiye", dogrulandi: true },
  { kod: "TRGEM", ad: "Gemlik", ulke: "Türkiye" },
  { kod: "TRIZM", ad: "İzmir", ulke: "Türkiye" },
  { kod: "TRALI", ad: "Aliağa", ulke: "Türkiye" },
  { kod: "TRMER", ad: "Mersin", ulke: "Türkiye" },
];

/** limanAnahtari ciktisi -> UN/LOCODE. Ad: musteri gorselinde kullanilan Ingilizce ad. */
export const VARIS_KODLARI: Record<string, LimanSecenegi> = {
  // Dogu Afrika / Hint Okyanusu / Kizildeniz
  DJIBOUTI: { kod: "DJJIB", ad: "Djibouti", ulke: "Djibouti", dogrulandi: true },
  MOMBASA: { kod: "KEMBA", ad: "Mombasa", ulke: "Kenya", dogrulandi: true },
  "DAR ES SALAAM": { kod: "TZDAR", ad: "Dar es Salaam", ulke: "Tanzania", dogrulandi: true },
  "DAR SALAAM": { kod: "TZDAR", ad: "Dar es Salaam", ulke: "Tanzania", dogrulandi: true },
  MUTSAMUDU: { kod: "KMMUT", ad: "Mutsamudu", ulke: "Comoros", dogrulandi: true },
  MORONI: { kod: "KMYVA", ad: "Moroni", ulke: "Comoros" },
  BERBERA: { kod: "SOBBO", ad: "Berbera", ulke: "Somalia" },
  MOGADISHU: { kod: "SOMGQ", ad: "Mogadishu", ulke: "Somalia" },
  TOAMASINA: { kod: "MGTMM", ad: "Toamasina", ulke: "Madagascar" },
  TAMATAVE: { kod: "MGTMM", ad: "Toamasina", ulke: "Madagascar" },
  "PORT LOUIS": { kod: "MUPLU", ad: "Port Louis", ulke: "Mauritius" },
  MAPUTO: { kod: "MZMPM", ad: "Maputo", ulke: "Mozambique" },
  DURBAN: { kod: "ZADUR", ad: "Durban", ulke: "South Africa" },
  "PORT SUDAN": { kod: "SDPZU", ad: "Port Sudan", ulke: "Sudan" },
  ADEN: { kod: "YEADE", ad: "Aden", ulke: "Yemen" },
  JEDDAH: { kod: "SAJED", ad: "Jeddah", ulke: "Saudi Arabia" },
  AQABA: { kod: "JOAQJ", ad: "Aqaba", ulke: "Jordan" },
  "JEBEL ALI": { kod: "AEJEA", ad: "Jebel Ali", ulke: "UAE" },
  KARACHI: { kod: "PKKHI", ad: "Karachi", ulke: "Pakistan" },
  COLOMBO: { kod: "LKCMB", ad: "Colombo", ulke: "Sri Lanka" },
  // Bati / Orta Afrika
  TEMA: { kod: "GHTEM", ad: "Tema", ulke: "Ghana", dogrulandi: true },
  COTONOU: { kod: "BJCOO", ad: "Cotonou", ulke: "Benin", dogrulandi: true },
  LOME: { kod: "TGLFW", ad: "Lomé", ulke: "Togo" },
  LAGOS: { kod: "NGAPP", ad: "Lagos (Apapa)", ulke: "Nigeria" },
  APAPA: { kod: "NGAPP", ad: "Lagos (Apapa)", ulke: "Nigeria" },
  ABIDJAN: { kod: "CIABJ", ad: "Abidjan", ulke: "Côte d'Ivoire" },
  DAKAR: { kod: "SNDKR", ad: "Dakar", ulke: "Senegal" },
  CONAKRY: { kod: "GNCKY", ad: "Conakry", ulke: "Guinea" },
  FREETOWN: { kod: "SLFNA", ad: "Freetown", ulke: "Sierra Leone" },
  MONROVIA: { kod: "LRMLW", ad: "Monrovia", ulke: "Liberia" },
  DOUALA: { kod: "CMDLA", ad: "Douala", ulke: "Cameroon" },
  BATA: { kod: "GQBSG", ad: "Bata", ulke: "Equatorial Guinea", dogrulandi: true },
  MALABO: { kod: "GQSSG", ad: "Malabo", ulke: "Equatorial Guinea", dogrulandi: true },
  "POINTE NOIRE": { kod: "CGPNR", ad: "Pointe-Noire", ulke: "Congo" },
  LUANDA: { kod: "AOLAD", ad: "Luanda", ulke: "Angola" },
  // Akdeniz / Levant / Kuzey Afrika
  ASHDOD: { kod: "ILASH", ad: "Ashdod", ulke: "Israel", dogrulandi: true },
  BEIRUT: { kod: "LBBEY", ad: "Beirut", ulke: "Lebanon", dogrulandi: true },
  LATAKIA: { kod: "SYLTK", ad: "Latakia", ulke: "Syria" },
  ALEXANDRIA: { kod: "EGALY", ad: "Alexandria", ulke: "Egypt" },
  TRIPOLI: { kod: "LYTIP", ad: "Tripoli", ulke: "Libya" },
  MISURATA: { kod: "LYMRA", ad: "Misurata", ulke: "Libya" },
  BENGHAZI: { kod: "LYBEN", ad: "Benghazi", ulke: "Libya" },
  ALGIERS: { kod: "DZALG", ad: "Algiers", ulke: "Algeria" },
  CASABLANCA: { kod: "MACAS", ad: "Casablanca", ulke: "Morocco" },
  // Asya
  SINGAPORE: { kod: "SGSIN", ad: "Singapore", ulke: "Singapore", dogrulandi: true },
  "PORT KLANG": { kod: "MYPKG", ad: "Port Klang", ulke: "Malaysia" },
  // Amerika / Karayipler
  MARIEL: { kod: "CUMAR", ad: "Mariel", ulke: "Cuba", dogrulandi: true },
  "SANTIAGO DE CUBA": { kod: "CUSCU", ad: "Santiago de Cuba", ulke: "Cuba", dogrulandi: true },
  PARAMARIBO: { kod: "SRPBM", ad: "Paramaribo", ulke: "Suriname", dogrulandi: true },
  VERACRUZ: { kod: "MXVER", ad: "Veracruz", ulke: "Mexico" },
};

export const LIMAN_KODU_DESENI = /^[A-Z]{2}[A-Z0-9]{3}$/;

/** Serbest metin liman adi -> kod secenegi (yoksa null). Ornek: "DJIBOUTI PORT, DJIBOUTI" -> DJJIB. */
export function limanKoduBul(ad: string | null | undefined): LimanSecenegi | null {
  const a = limanAnahtari(ad ?? null);
  return a ? VARIS_KODLARI[a] ?? null : null;
}

/** Koddan ad (once varis sozlugu, sonra cikis listesi). */
export function limanAdi(kod: string | null | undefined): LimanSecenegi | null {
  if (!kod) return null;
  const k = kod.toUpperCase();
  return CIKIS_LIMANLARI.find((x) => x.kod === k) ?? Object.values(VARIS_KODLARI).find((x) => x.kod === k) ?? null;
}

/**
 * Sistemdeki dosyalarin varis limanlari -> kodlu secenekler (sevkiyat sayisina gore). Eslesmeyenler ayrica doner
 * (sayfada "kodu bilinmeyen" notu; kod elle yazilabilir).
 */
export function sistemVarisLimanlari(satirlar: { varis_limani: string | null }[]): { secenekler: (LimanSecenegi & { adet: number })[]; eslesmeyen: string[] } {
  const sayac = new Map<string, LimanSecenegi & { adet: number }>();
  const eslesmeyen = new Set<string>();
  for (const s of satirlar) {
    if (!s.varis_limani?.trim()) continue;
    const l = limanKoduBul(s.varis_limani);
    if (!l) { eslesmeyen.add(limanAnahtari(s.varis_limani) ?? s.varis_limani.trim()); continue; }
    const o = sayac.get(l.kod);
    sayac.set(l.kod, o ? { ...o, adet: o.adet + 1 } : { ...l, adet: 1 });
  }
  return {
    secenekler: Array.from(sayac.values()).sort((a, b) => b.adet - a.adet || a.ad.localeCompare(b.ad)),
    eslesmeyen: Array.from(eslesmeyen).sort(),
  };
}
