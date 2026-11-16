/**
 * Analiz > Sevkiyat Haritasi: liman koordinatlari ve harita geometrisi (26.10.2026).
 *
 * Anahtarlar `limanAnahtari` (lib/liman-anahtari.ts) ciktisidir (DJIBOUTI, SINGAPORE…).
 * Listede olmayan liman: once ad icinde bilinen liman aranir, sonra ULKE_ANA_LIMAN ile ulkenin
 * ana limanina YAKLASIK konur (05.11.2026); ulke de yoksa kart altinda adiyla yazilir.
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
  // 11.11.2026: Navlun Bildirimi haritasinda teklif istenen limanlar
  BOSTON: [42.35, -71.04], "SAN JUAN": [18.46, -66.11],

  // ---- 05.11.2026 genisletme: dosyalara yeni yazilan limanlar haritada otomatik cikiyor ----
  // Levant / Dogu Akdeniz / Misir
  ASHDOD: [31.82, 34.64], HAIFA: [32.82, 35.0], "PORT SAID": [31.26, 32.3], DAMIETTA: [31.47, 31.76],
  "AIN SOKHNA": [29.6, 32.35], SOKHNA: [29.6, 32.35], TARTUS: [34.89, 35.87], LARNACA: [34.92, 33.64],
  PIRAEUS: [37.94, 23.63], THESSALONIKI: [40.63, 22.93],
  // Orta / Bati Akdeniz
  BARCELONA: [41.35, 2.17], ALGECIRAS: [36.13, -5.43], "TANGER MED": [35.89, -5.5], TANGIER: [35.79, -5.81],
  MARSEILLE: [43.33, 5.35], "GIOIA TAURO": [38.44, 15.9], NAPLES: [40.84, 14.27], "LA SPEZIA": [44.1, 9.84],
  LIVORNO: [43.56, 10.3], TRIESTE: [45.63, 13.77], KOPER: [45.55, 13.73], VENICE: [45.44, 12.33],
  MARSAXLOKK: [35.82, 14.54], VALLETTA: [35.9, 14.52], ORAN: [35.71, -0.64], BEJAIA: [36.75, 5.09],
  ANNABA: [36.9, 7.77], SKIKDA: [36.88, 6.9], SFAX: [34.73, 10.77], SOUSSE: [35.83, 10.64], RADES: [36.8, 10.27],
  BIZERTE: [37.27, 9.87], KHOMS: [32.65, 14.27], DURRES: [41.31, 19.45],
  // Karadeniz
  VARNA: [43.19, 27.94], BURGAS: [42.49, 27.48], NOVOROSSIYSK: [44.72, 37.79], CHORNOMORSK: [46.3, 30.65],
  // Kizildeniz / Arap Yarimadasi / Korfez
  SAFAGA: [26.74, 33.94], SUAKIN: [19.1, 37.33], MASSAWA: [15.61, 39.47], ASSAB: [13.0, 42.74],
  "KING ABDULLAH": [22.5, 39.1], YANBU: [24.09, 38.06], MUKALLA: [14.53, 49.13], SALALAH: [16.94, 54.0],
  SOHAR: [24.5, 56.63], MUSCAT: [23.63, 58.57], "ABU DHABI": [24.52, 54.38],
  HAMAD: [25.01, 51.6], DOHA: [25.29, 51.55], SHUWAIKH: [29.35, 47.93], KUWAIT: [29.35, 47.93],
  BAHRAIN: [26.21, 50.71], BASRA: [30.5, 47.82], "BANDAR IMAM KHOMEINI": [30.43, 49.08], JUBAIL: [27.0, 49.66],
  // Guney Asya
  "NHAVA SHEVA": [18.95, 72.95], MUMBAI: [18.95, 72.84], MUNDRA: [22.74, 69.7], KANDLA: [23.0, 70.22],
  CHENNAI: [13.1, 80.3], "PORT QASIM": [24.77, 67.35], MALE: [4.18, 73.51], MONGLA: [22.47, 89.6],
  // Guneydogu / Dogu Asya / Okyanusya
  "LAEM CHABANG": [13.08, 100.88], BANGKOK: [13.7, 100.57], HAIPHONG: [20.86, 106.68], "CAT LAI": [10.76, 106.79],
  "DA NANG": [16.07, 108.22], SURABAYA: [-7.2, 112.73], BELAWAN: [3.78, 98.69], SEMARANG: [-6.95, 110.42],
  "TANJUNG PELEPAS": [1.36, 103.55], PENANG: [5.41, 100.35], YANGON: [16.77, 96.17], SIHANOUKVILLE: [10.64, 103.5],
  SHANGHAI: [31.23, 121.5], NINGBO: [29.87, 121.55], SHENZHEN: [22.5, 113.9], "HONG KONG": [22.3, 114.17],
  QINGDAO: [36.07, 120.32], TIANJIN: [39.0, 117.7], XIAMEN: [24.45, 118.07], GUANGZHOU: [22.75, 113.6],
  KAOHSIUNG: [22.6, 120.28], BUSAN: [35.1, 129.04], TOKYO: [35.62, 139.78], YOKOHAMA: [35.45, 139.65],
  SYDNEY: [-33.86, 151.2], MELBOURNE: [-37.84, 144.92], AUCKLAND: [-36.84, 174.77],
  // Dogu / Guney Afrika
  TANGA: [-5.07, 39.1], ZANZIBAR: [-6.16, 39.19], NACALA: [-14.54, 40.67], BEIRA: [-19.83, 34.84],
  MAHAJANGA: [-15.72, 46.31], VICTORIA: [-4.62, 55.45], KISMAYO: [-0.36, 42.55], BOSASO: [11.28, 49.18],
  "RICHARDS BAY": [-28.8, 32.04], "CAPE TOWN": [-33.91, 18.43], "PORT ELIZABETH": [-33.96, 25.63],
  "WALVIS BAY": [-22.95, 14.5], LOBITO: [-12.35, 13.55], MATADI: [-5.82, 13.45],
  // Bati Afrika
  LIBREVILLE: [0.39, 9.45], OWENDO: [0.29, 9.5], "SAO TOME": [0.34, 6.73], "PORT HARCOURT": [4.77, 7.01],
  ONNE: [4.7, 7.15], TINCAN: [6.43, 3.35], KRIBI: [2.74, 9.87], TAKORADI: [4.88, -1.75], "SAN PEDRO": [4.74, -6.62],
  BANJUL: [13.45, -16.58], BISSAU: [11.85, -15.58], PRAIA: [14.92, -23.5], AGADIR: [30.42, -9.63],
  // Amerika
  "SANTO DOMINGO": [18.47, -69.88], HAINA: [18.42, -70.02], "RIO HAINA": [18.42, -70.02], CAUCEDO: [18.42, -69.63],
  "PORT AU PRINCE": [18.55, -72.35], KINGSTON: [17.97, -76.79], COLON: [9.36, -79.9], BALBOA: [8.95, -79.57],
  "PUERTO LIMON": [9.99, -83.03], LIMON: [9.99, -83.03], "PUERTO CORTES": [15.84, -87.95],
  "SANTO TOMAS DE CASTILLA": [15.7, -88.62], "PUERTO QUETZAL": [13.92, -90.78], CORINTO: [12.48, -87.18],
  ACAJUTLA: [13.57, -89.83], CARTAGENA: [10.39, -75.53], BARRANQUILLA: [11.0, -74.8], BUENAVENTURA: [3.89, -77.08],
  "LA GUAIRA": [10.6, -66.93], "PUERTO CABELLO": [10.48, -68.01], GUAYAQUIL: [-2.28, -79.91], CALLAO: [-12.05, -77.15],
  "SAN ANTONIO": [-33.59, -71.62], VALPARAISO: [-33.03, -71.63], SANTOS: [-23.97, -46.3], PARANAGUA: [-25.5, -48.52],
  "RIO DE JANEIRO": [-22.89, -43.18], "BUENOS AIRES": [-34.6, -58.37], MONTEVIDEO: [-34.9, -56.21],
  ALTAMIRA: [22.48, -97.86], "LAZARO CARDENAS": [17.94, -102.18], HOUSTON: [29.73, -95.27], "NEW YORK": [40.67, -74.04],
  "NEW ORLEANS": [29.93, -90.06], MIAMI: [25.77, -80.17], SAVANNAH: [32.08, -81.09], BALTIMORE: [39.26, -76.58],
  "LOS ANGELES": [33.74, -118.26], MONTREAL: [45.5, -73.55], HALIFAX: [44.64, -63.57], VANCOUVER: [49.29, -123.1],
  // Kuzey / Bati Avrupa
  ANTWERP: [51.27, 4.33], "LE HAVRE": [49.48, 0.12], FELIXSTOWE: [51.95, 1.32], SOUTHAMPTON: [50.9, -1.4],
  LONDON: [51.5, 0.3], BREMERHAVEN: [53.55, 8.56], GDANSK: [54.4, 18.67], DUBLIN: [53.35, -6.2],
  LISBON: [38.7, -9.13], LEIXOES: [41.18, -8.7], SINES: [37.95, -8.87], BILBAO: [43.35, -3.03],
};

/**
 * Ulke -> o ulkenin (ya da denize kiyisi yoksa kullandigi) ana liman anahtari (05.11.2026).
 * Liman adi listede yoksa nokta bu limana YAKLASIK konumla konur ("yaklaşık konum" notu ile);
 * boylece havuza yeni bir liman yazildiginda harita onu sessizce dusurmez.
 * Ulke adlari lib/ulke-bul.ts ULKELER ile aynidir.
 */
export const ULKE_ANA_LIMAN: Record<string, string> = {
  "CİBUTİ": "DJIBOUTI", "SOMALİ": "MOGADISHU", "ETİYOPYA": "DJIBOUTI", "ERİTRE": "MASSAWA", "SUDAN": "PORT SUDAN",
  "GÜNEY SUDAN": "MOMBASA", "MISIR": "ALEXANDRIA", "LİBYA": "TRIPOLI", "TUNUS": "TUNIS", "CEZAYİR": "ALGIERS",
  "FAS": "CASABLANCA", "MORİTANYA": "NOUAKCHOTT", "SENEGAL": "DAKAR", "GAMBİYA": "BANJUL", "GİNE-BİSSAU": "BISSAU",
  "GİNE": "CONAKRY", "EKVATOR GİNESİ": "MALABO", "SİERRA LEONE": "FREETOWN", "LİBERYA": "MONROVIA",
  "FİLDİŞİ SAHİLİ": "ABIDJAN", "GANA": "TEMA", "TOGO": "LOME", "BENİN": "COTONOU", "NİJERYA": "LAGOS",
  "NİJER": "COTONOU", "MALİ": "DAKAR", "BURKİNA FASO": "ABIDJAN", "ÇAD": "DOUALA", "KAMERUN": "DOUALA",
  "GABON": "OWENDO", "KONGO DEMOKRATİK CUMHURİYETİ": "MATADI", "KONGO": "POINTE NOIRE", "ANGOLA": "LUANDA",
  "SAO TOME VE PRINCIPE": "SAO TOME", "KENYA": "MOMBASA", "TANZANYA": "DAR ES SALAAM", "UGANDA": "MOMBASA",
  "RUANDA": "DAR ES SALAAM", "BURUNDİ": "DAR ES SALAAM", "MOZAMBİK": "MAPUTO", "MADAGASKAR": "TOAMASINA",
  "KOMORLAR": "MORONI", "MAURİTİUS": "PORT LOUIS", "SEYŞELLER": "VICTORIA", "GÜNEY AFRİKA": "DURBAN",
  "NAMİBYA": "WALVIS BAY", "ZAMBİYA": "DAR ES SALAAM", "ZİMBABVE": "BEIRA", "MALAVİ": "NACALA", "CABO VERDE": "PRAIA",
  "YEMEN": "ADEN", "UMMAN": "SOHAR", "SUUDİ ARABİSTAN": "JEDDAH", "BİRLEŞİK ARAP EMİRLİKLERİ": "JEBEL ALI",
  "KATAR": "HAMAD", "KUVEYT": "SHUWAIKH", "BAHREYN": "BAHRAIN", "IRAK": "UMM QASR", "İRAN": "BANDAR ABBAS",
  "ÜRDÜN": "AQABA", "LÜBNAN": "BEIRUT", "SURİYE": "LATAKIA", "FİLİSTİN": "ASHDOD", "İSRAİL": "ASHDOD",
  "GÜRCİSTAN": "POTI", "AZERBAYCAN": "POTI", "AFGANİSTAN": "KARACHI", "PAKİSTAN": "KARACHI",
  "HİNDİSTAN": "NHAVA SHEVA", "BANGLADEŞ": "CHITTAGONG", "SRİ LANKA": "COLOMBO", "MALDİVLER": "MALE",
  "SİNGAPUR": "SINGAPORE", "MALEZYA": "PORT KLANG", "ENDONEZYA": "JAKARTA", "FİLİPİNLER": "MANILA",
  "VİETNAM": "HO CHI MINH", "TAYLAND": "LAEM CHABANG", "KAMBOÇYA": "SIHANOUKVILLE", "MYANMAR": "YANGON",
  "ÇİN": "SHANGHAI", "HONG KONG": "HONG KONG", "TAYVAN": "KAOHSIUNG", "GÜNEY KORE": "BUSAN", "JAPONYA": "YOKOHAMA",
  "AVUSTRALYA": "MELBOURNE", "YENİ ZELANDA": "AUCKLAND", "İSPANYA": "VALENCIA", "PORTEKİZ": "LISBON",
  "FRANSA": "MARSEILLE", "İTALYA": "GENOA", "ALMANYA": "HAMBURG", "HOLLANDA": "ROTTERDAM", "BELÇİKA": "ANTWERP",
  "BİRLEŞİK KRALLIK": "FELIXSTOWE", "İRLANDA": "DUBLIN", "İSVİÇRE": "GENOA", "AVUSTURYA": "KOPER",
  "YUNANİSTAN": "PIRAEUS", "KIBRIS": "LIMASSOL", "MALTA": "MARSAXLOKK", "BULGARİSTAN": "VARNA", "ROMANYA": "CONSTANTA",
  "POLONYA": "GDANSK", "UKRAYNA": "ODESSA", "RUSYA": "NOVOROSSIYSK", "ARNAVUTLUK": "DURRES", "KÜBA": "MARIEL",
  "MEKSİKA": "VERACRUZ", "DOMİNİK CUMHURİYETİ": "CAUCEDO", "HAİTİ": "PORT AU PRINCE", "JAMAİKA": "KINGSTON",
  "PANAMA": "COLON", "KOSTA RİKA": "PUERTO LIMON", "GUATEMALA": "SANTO TOMAS DE CASTILLA", "HONDURAS": "PUERTO CORTES",
  "EL SALVADOR": "ACAJUTLA", "NİKARAGUA": "CORINTO", "KOLOMBİYA": "CARTAGENA", "VENEZUELA": "LA GUAIRA",
  "EKVADOR": "GUAYAQUIL", "PERU": "CALLAO", "ŞİLİ": "SAN ANTONIO", "BREZİLYA": "SANTOS", "ARJANTİN": "BUENOS AIRES",
  "URUGUAY": "MONTEVIDEO", "PARAGUAY": "MONTEVIDEO", "BOLİVYA": "CALLAO", "AMERİKA BİRLEŞİK DEVLETLERİ": "NEW YORK",
  "KANADA": "MONTREAL",
};

export type CikisMerkezi = { ad: string; enlem: number; boylam: number };

/**
 * Turkiye cikis limanlari (yukleme limani metnine gore). Ambarli terminalleri (Marport, Kumport, Mardas) = Istanbul.
 * 16.11.2026: Asyaport Tekirdag / Barbaros'tadir (40°54'N 27°28'E), Istanbul'a cizilmez; Martas = Marmara Ereglisi.
 */
const CIKISLAR: { anahtarlar: string[]; merkez: CikisMerkezi }[] = [
  { anahtarlar: ["ASYAPORT", "TEKIRDAG", "BARBAROS", "MARTAS", "EREGLISI", "CEYPORT", "AKPORT"], merkez: { ad: "Tekirdağ", enlem: 40.9, boylam: 27.47 } },
  { anahtarlar: ["MERSIN"], merkez: { ad: "Mersin", enlem: 36.79, boylam: 34.63 } },
  { anahtarlar: ["IZMIR", "ALIAGA", "ALSANCAK", "NEMPORT"], merkez: { ad: "İzmir", enlem: 38.44, boylam: 27.14 } },
  { anahtarlar: ["ISKENDERUN", "LIMAK"], merkez: { ad: "İskenderun", enlem: 36.6, boylam: 36.17 } },
  { anahtarlar: ["GEMLIK", "GEMPORT", "BORUSAN"], merkez: { ad: "Gemlik", enlem: 40.43, boylam: 29.15 } },
  { anahtarlar: ["AMBARLI", "MARPORT", "KUMPORT", "MARDAS", "ISTANBUL", "HAYDARPASA"], merkez: { ad: "İstanbul", enlem: 40.97, boylam: 28.69 } },
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

// Uzun anahtar once: "PORT SAID" "SAID"den, "SANTIAGO DE CUBA" "SANTIAGO"dan once denenir.
const ANAHTARLAR_UZUNDAN = Object.keys(LIMAN_KOORDINAT).sort((a, b) => b.length - a.length);

export type LimanKonumu = {
  /** [enlem, boylam] */
  k: [number, number];
  /** Koordinati/rotasi kullanilan liman anahtari (vekil limanda o limanin anahtari). */
  anahtar: string;
  /** true: liman listede yok, ulkenin ana limani esas alindi. */
  yaklasik: boolean;
  /** yaklasik ise esas alinan ulke. */
  ulke: string | null;
};

/**
 * Haritadaki konum (05.11.2026): 1) anahtar listede birebir, 2) anahtarin icinde bilinen
 * bir liman adi kelime olarak geciyor ("NHAVA SHEVA JNPT" -> NHAVA SHEVA), 3) ulkenin ana
 * limani (yaklasik). Hicbiri yoksa null -> kart altinda "Haritada konumu olmayan".
 */
export function limanKonumu(anahtar: string | null | undefined, ulke?: string | null): LimanKonumu | null {
  if (!anahtar) return null;
  const birebir = LIMAN_KOORDINAT[anahtar];
  if (birebir) return { k: birebir, anahtar, yaklasik: false, ulke: null };
  const s = ` ${sade(anahtar).replace(/[^A-Z0-9]+/g, " ")} `;
  const icinde = ANAHTARLAR_UZUNDAN.find((a) => s.includes(` ${a} `));
  if (icinde) return { k: LIMAN_KOORDINAT[icinde], anahtar: icinde, yaklasik: false, ulke: null };
  const vekil = ulke ? ULKE_ANA_LIMAN[ulke] : undefined;
  if (vekil && LIMAN_KOORDINAT[vekil]) return { k: LIMAN_KOORDINAT[vekil], anahtar: vekil, yaklasik: true, ulke: ulke ?? null };
  return null;
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
