/**
 * Analiz > Sevkiyat Haritasi: liman koordinatlari ve harita geometrisi (26.10.2026).
 *
 * Anahtarlar `limanAnahtari` (lib/liman-anahtari.ts) ciktisidir (DJIBOUTI, SINGAPORE…).
 * Listede olmayan liman haritada CIZILMEZ (tahmin yok); kart altinda adiyla yazilir.
 * Yeni bir liman cikinca buraya [enlem, boylam] eklenir.
 * Hatlar TEMSILIDIR (cikis -> varis egrisi), gercek deniz rotasi degildir.
 * Saf fonksiyonlar - test: scratchpad `analizpanel/harita.ts`.
 */

export const LIMAN_KOORDINAT: Record<string, [number, number]> = {
  // Dogu Afrika / Kizildeniz / Hint Okyanusu
  DJIBOUTI: [11.6, 43.14], BERBERA: [10.44, 45.01], MOGADISHU: [2.04, 45.34], MOMBASA: [-4.06, 39.67],
  "DAR ES SALAAM": [-6.82, 39.29], MUTSAMUDU: [-12.17, 44.4], MORONI: [-11.7, 43.25], TOAMASINA: [-18.15, 49.4],
  TAMATAVE: [-18.15, 49.4], "PORT LOUIS": [-20.16, 57.5], MAPUTO: [-25.97, 32.57], DURBAN: [-29.87, 31.03],
  "PORT SUDAN": [19.61, 37.22], ADEN: [12.79, 44.98], HODEIDAH: [14.83, 42.93], JEDDAH: [21.48, 39.17],
  AQABA: [29.52, 35.0], "UMM QASR": [30.03, 47.95], DAMMAM: [26.5, 50.2], "JEBEL ALI": [25.01, 55.06],
  DUBAI: [25.27, 55.29], "BANDAR ABBAS": [27.18, 56.27], KARACHI: [24.84, 66.99], COLOMBO: [6.95, 79.84],
  CHITTAGONG: [22.31, 91.8],
  // Bati / Orta Afrika
  TEMA: [5.63, 0.01], COTONOU: [6.35, 2.43], LOME: [6.13, 1.28], LAGOS: [6.45, 3.37], APAPA: [6.45, 3.37],
  ABIDJAN: [5.3, -4.01], DAKAR: [14.68, -17.43], CONAKRY: [9.51, -13.71], FREETOWN: [8.49, -13.23],
  MONROVIA: [6.35, -10.8], NOUAKCHOTT: [18.03, -16.03], NOUADHIBOU: [20.9, -17.05], BATA: [1.86, 9.77],
  MALABO: [3.76, 8.78], DOUALA: [4.05, 9.7], "POINTE NOIRE": [-4.78, 11.85], LUANDA: [-8.8, 13.23],
  // Kuzey Afrika / Akdeniz / Karadeniz
  TRIPOLI: [32.9, 13.18], MISURATA: [32.37, 15.21], BENGHAZI: [32.12, 20.06], ALGIERS: [36.77, 3.06],
  TUNIS: [36.81, 10.18], ALEXANDRIA: [31.2, 29.92], CASABLANCA: [33.6, -7.62], BEIRUT: [33.9, 35.52],
  LATAKIA: [35.52, 35.77], LIMASSOL: [34.67, 33.04], VALENCIA: [39.45, -0.32], GENOA: [44.41, 8.93],
  ODESSA: [46.48, 30.73], CONSTANTA: [44.17, 28.66], BATUMI: [41.65, 41.64], POTI: [42.15, 41.67],
  ROTTERDAM: [51.95, 4.14], HAMBURG: [53.54, 9.97],
  // Asya
  SINGAPORE: [1.26, 103.84], "PORT KLANG": [3.0, 101.39], JAKARTA: [-6.1, 106.88], MANILA: [14.59, 120.97],
  "HO CHI MINH": [10.77, 106.7],
  // Amerika
  MARIEL: [22.99, -82.75], HAVANA: [23.14, -82.35], "SANTIAGO DE CUBA": [20.01, -75.83], VERACRUZ: [19.2, -96.13],
};

export type CikisMerkezi = { ad: string; enlem: number; boylam: number };

/** Turkiye cikis limanlari (yukleme limani metnine gore). Ambarli terminalleri = Istanbul. */
const CIKISLAR: { anahtarlar: string[]; merkez: CikisMerkezi }[] = [
  { anahtarlar: ["MERSIN"], merkez: { ad: "Mersin", enlem: 36.79, boylam: 34.63 } },
  { anahtarlar: ["IZMIR", "ALIAGA", "ALSANCAK", "NEMPORT"], merkez: { ad: "İzmir", enlem: 38.44, boylam: 27.14 } },
  { anahtarlar: ["ISKENDERUN", "LIMAK"], merkez: { ad: "İskenderun", enlem: 36.6, boylam: 36.17 } },
  { anahtarlar: ["GEMLIK", "GEMPORT", "BORUSAN"], merkez: { ad: "Gemlik", enlem: 40.43, boylam: 29.15 } },
  { anahtarlar: ["AMBARLI", "MARPORT", "KUMPORT", "MARDAS", "ASYAPORT", "ISTANBUL", "HAYDARPASA"], merkez: { ad: "İstanbul", enlem: 40.97, boylam: 28.69 } },
];

const sade = (s: string) =>
  s.toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ö/g, "O").replace(/Ç/g, "C");

/** Yukleme limani metninden cikis merkezi; taninmazsa null. */
export function cikisMerkezi(metin: string | null | undefined): CikisMerkezi | null {
  if (!metin || !metin.trim()) return null;
  const s = sade(metin);
  return CIKISLAR.find((c) => c.anahtarlar.some((a) => s.includes(a)))?.merkez ?? null;
}

/** Varis limani anahtarinin koordinati ([enlem, boylam]) ya da null. */
export function limanKoordinati(anahtar: string | null | undefined): [number, number] | null {
  if (!anahtar) return null;
  return LIMAN_KOORDINAT[anahtar] ?? null;
}

/** Equirectangular: 1 birim = 1 derece (lib/dunya-haritasi.ts ile ayni). */
export const izdusum = (enlem: number, boylam: number): [number, number] => [boylam + 180, 90 - enlem];

export type Kirpma = { x: number; y: number; g: number; y2: number };

/**
 * Noktalarin hepsini kapsayan, kenarlarda pay birakan ve istenen en/boy oranina
 * genisletilen goruntu kutusu (derece biriminde, dunya sinirlarina kirpilir).
 */
export function haritaKirpmasi(noktalar: [number, number][], oran: number, pay = 10): Kirpma {
  const xs = noktalar.map((n) => n[0]);
  const ys = noktalar.map((n) => n[1]);
  let x0 = (xs.length ? Math.min(...xs) : 150) - pay * 1.4;
  let x1 = (xs.length ? Math.max(...xs) : 230) + pay * 1.4;
  let y0 = (ys.length ? Math.min(...ys) : 40) - pay;
  let y1 = (ys.length ? Math.max(...ys) : 90) + pay;
  // En kucuk alan: tek limanda dunya yakinlasip anlamsizlasmasin
  const enAzG = 70, enAzY = 35;
  if (x1 - x0 < enAzG) { const m = (x0 + x1) / 2; x0 = m - enAzG / 2; x1 = m + enAzG / 2; }
  if (y1 - y0 < enAzY) { const m = (y0 + y1) / 2; y0 = m - enAzY / 2; y1 = m + enAzY / 2; }
  const r = Math.max(0.5, oran || 2);
  let g = x1 - x0, y = y1 - y0;
  if (g / y < r) { const yeniG = y * r; x0 -= (yeniG - g) / 2; g = yeniG; }
  else { const yeniY = g / r; y0 -= (yeniY - y) / 2; y = yeniY; }
  // Dunya sinirlari (0..360, 0..180): tasarsa kaydir, yine sigmazsa kirp
  if (g > 360) { x0 = 0; g = 360; }
  if (y > 180) { y0 = 0; y = 180; }
  x0 = Math.min(Math.max(x0, 0), 360 - g);
  y0 = Math.min(Math.max(y0, 0), 180 - y);
  return { x: x0, y: y0, g, y2: y };
}

/** Cikistan varisa yukari kavisli (kuzeye) ikinci derece egri; SVG path. */
export function hatYolu(a: [number, number], b: [number, number]): string {
  const [x1, y1] = a, [x2, y2] = b;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const uz = Math.hypot(dx, dy) || 1;
  // dik vektor, kavis "yukari" (y kucuk) olacak sekilde
  let nx = -dy / uz, ny = dx / uz;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const k = uz * 0.22;
  const f = (n: number) => n.toFixed(2);
  return `M${f(x1)},${f(y1)} Q${f(mx + nx * k)},${f(my + ny * k)} ${f(x2)},${f(y2)}`;
}
