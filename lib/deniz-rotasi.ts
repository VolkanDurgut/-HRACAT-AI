/**
 * Analiz > Sevkiyat Haritasi: DENIZ YOLU rotalari (26.10.2026, kullanici: "haritayi gercek
 * deniz rotasi yapamiyor muyuz?").
 *
 * Gemilerin anlik izi (AIS) ucretli dis servis ister; burada yapilan: ana deniz yollari,
 * bogazlar ve kanallardan gecen bir AG (dugum = denizde nokta, kenar = denizden giden hat)
 * uzerinde Dijkstra ile EN KISA deniz yolu. Sonuc YAKLASIKTIR: armatorun aktarma limani
 * (Tanger Med, Jeddah, Port Said…) ve guncel rota tercihi (or. Kizildeniz yerine Umit Burnu)
 * farkli olabilir — haritada bu not yazar.
 *
 * DOGRULAMA: scratchpad `harita/rota_test.ts` her cikis x her liman icin rota
 * bulundugunu ve kenarlarin Natural Earth 1:50m karasina GIRMEDIGINI (bogaz / kanal
 * kenarlari haric) her degisiklikte denetler. Yeni liman: LIMAN_KOORDINAT'a koordinat,
 * LIMAN_GIRISI'ne baglandigi deniz dugumu; gerekirse yeni dugum + kenar, sonra test.
 * Saf TypeScript, import yok.
 */

type Nokta = [number, number]; // [enlem, boylam]

/** Deniz dugumleri (acik denizde / bogaz eksenlerinde). */
export const DENIZ_DUGUMLERI: Record<string, Nokta> = {
  // Marmara, bogazlar, Ege
  MARMARA_B: [40.78, 28.3], MARMARA_G: [40.55, 27.35], GEMLIK_OFF: [40.48, 28.65],
  CANAKKALE_K: [40.45, 26.85], CANAKKALE_O: [40.17, 26.42], CANAKKALE_G: [40.02, 26.17],
  BOGAZICI_G: [41.03, 29.0], BOGAZICI_K: [41.25, 29.13], KARADENIZ_B: [42.6, 29.6],
  KARADENIZ_D: [42.2, 37.5], ODESSA_OFF: [46.3, 30.95], KOSTENCE_OFF: [44.1, 28.85], BATUM_OFF: [41.75, 41.45],
  EGE_K: [39.6, 25.75], EGE_O: [38.75, 25.2], IZMIR_OFF: [38.72, 26.72], 
  KARPATOS: [35.35, 26.6],
  // Dogu / Orta / Bati Akdeniz
  DOGU_AKDENIZ: [33.9, 30.0], KIBRIS_G: [34.2, 33.0], MERSIN_OFF: [36.5, 34.75], KIBRIS_D: [35.4, 34.9],
  LEVANT: [34.3, 34.8], BEYRUT_OFF: [33.9, 35.4], LAZKIYE_OFF: [35.55, 35.65], LIMASOL_OFF: [34.55, 33.1],
  ISKENDERIYE_OFF: [31.4, 29.85], PORT_SAID: [31.45, 32.35],
  GIRIT_B: [36.03, 23.15], IYON: [36.3, 18.5], BINGAZI_OFF: [32.3, 19.85], MALTA_K: [35.5, 15.0],
  TRABLUS_OFF: [33.1, 13.2], MISRATA_OFF: [32.6, 15.3], SICILYA_BOG: [37.4, 11.2], TUNUS_OFF: [37.2, 10.5],
  SARDINYA_G: [38.3, 8.3], LIGURYA: [43.6, 8.6], CENOVA_OFF: [44.3, 8.9], CEZAYIR_OFF: [37.0, 3.1],
  BALEAR_G: [37.8, 1.0], VALENSIYA_OFF: [39.4, 0.0], ALBORAN: [36.0, -3.0], CEBELITARIK: [35.95, -5.6],
  KADIZ_B: [36.0, -9.0], KAZABLANKA_OFF: [33.7, -7.85],
  // Suveys, Kizildeniz, Aden, Hint Okyanusu
  SUVEYS: [29.85, 32.57], KIZILDENIZ_K: [27.3, 34.2], AKABE_KORFEZ: [28.6, 34.75], AKABE_OFF: [29.4, 34.95],
  KIZILDENIZ_O: [21.8, 37.9], CIDDE_OFF: [21.5, 39.0], PORT_SUDAN_OFF: [19.65, 37.45],
  KIZILDENIZ_G: [15.5, 41.4], HUDEYDE_OFF: [14.8, 42.75], BABULMENDEP: [12.6, 43.35], CIBUTI_OFF: [11.75, 43.35],
  ADEN_B: [12.2, 45.0], ADEN_OFF: [12.7, 45.0], BERBERA_OFF: [10.6, 45.05], ADEN_D: [12.6, 48.5],
  GUARDAFUI: [12.3, 52.2], ARAP_DENIZI: [14.5, 58.5], HURMUZ_DIS: [24.9, 58.2], HURMUZ: [26.45, 56.6],
  BENDER_ABBAS_OFF: [27.0, 56.3], KORFEZ_O: [26.5, 53.5], CEBELALI_OFF: [25.1, 55.0], DUBAI_OFF: [25.35, 55.2],
  DAMMAM_OFF: [26.6, 50.4], UMM_KASR_OFF: [29.7, 48.8], KARACI_OFF: [24.6, 66.8], LAKADIV: [9.0, 72.5],
  SRI_LANKA_G: [5.6, 80.5], KOLOMBO_OFF: [6.95, 79.7], BENGAL: [15.0, 88.0], CITTAGONG_OFF: [21.8, 91.6],
  ACE: [6.2, 94.8], MALAKKA_O: [3.6, 99.9], PORT_KLANG_OFF: [2.95, 101.2], SINGAPUR_OFF: [1.15, 103.75],
  GCD_DENIZI: [7.5, 107.5], HOCIMIN_OFF: [10.25, 107.1], GCD_DOGU: [12.5, 116.5], MANILA_OFF: [14.5, 120.6],
  KARIMATA: [-2.5, 107.4], CAKARTA_OFF: [-5.95, 106.9],
  // Dogu Afrika
  SOMALI_K: [7.0, 51.5], SOMALI_G: [0.5, 45.5], MOGADISU_OFF: [2.0, 45.6], MOMBASA_OFF: [-4.1, 39.85],
  DARUSSELAM_OFF: [-6.75, 39.55], KOMOR_K: [-10.8, 43.7], MUTSAMUDU_OFF: [-12.05, 44.35], MORONI_OFF: [-11.65, 43.15],
  MADAGASKAR_K: [-11.6, 49.6], TOAMASINA_OFF: [-18.1, 49.6], PORT_LOUIS_OFF: [-20.1, 57.4],
  MOZAMBIK_KAN: [-17.5, 41.0], MAPUTO_OFF: [-25.9, 33.2], DURBAN_OFF: [-29.95, 31.3], UMIT_D: [-35.2, 25.0],
  UMIT_BURNU: [-35.2, 18.3],
  // Ek acik deniz noktalari (kiyi denetimi, 26.10.2026)
  KARABURUN_K: [38.85, 26.35], SARDINYA_B: [40.5, 7.8], OMAN_D: [22.5, 60.6], GALLE_OFF: [5.85, 80.0],
  SRI_LANKA_D: [5.9, 82.2], MALAKKA_K: [5.8, 97.8], SINGAPUR_D: [1.25, 104.45], PEMBA_D: [-5.2, 40.1],
  KOMOR_B: [-11.2, 43.15], MADAGASKAR_KD: [-15.3, 51.0], BAZARUTO_D: [-21.8, 36.8], MOZAMBIK_G: [-25.0, 35.2],
  ZULULAND: [-27.5, 33.2], DOGU_KAP: [-31.5, 31.0], SHERBRO: [7.5, -13.5], GANA_B: [4.5, -2.0], BIOKO_G: [3.0, 9.2],
  GABON_G: [-3.0, 9.6], NAMIBYA_K: [-15.0, 11.0], FLORIDA_K: [27.3, -79.8], KUBA_G: [19.6, -74.5],
  PORTEKIZ_B: [38.7, -10.0], TEKSEL: [53.4, 4.4], KAFIREAS: [38.05, 24.62], KEA_B: [37.3, 24.0],
  MIKONOS_IKARYA: [37.45, 25.75], AMORGOS_D: [36.65, 26.12], BINTAN_K: [1.3, 104.8], ATLANTIK_GB: [9.0, -15.5],
  // Bati Afrika
  KANARYA: [29.6, -18.6], NOUADHIBOU_OFF: [20.8, -17.4], NOUAKCHOTT_OFF: [18.05, -16.3], DAKAR_OFF: [14.6, -17.65],
  BISSAU_B: [11.0, -17.5], KONAKRI_OFF: [9.3, -14.0], FRITAUN_OFF: [8.4, -13.45], MONROVIA_OFF: [6.2, -10.95],
  PALMAS: [4.0, -7.7], ABIDJAN_OFF: [4.9, -4.0], TEMA_OFF: [5.45, 0.1], LOME_OFF: [5.95, 1.3],
  KOTONU_OFF: [6.2, 2.45], LAGOS_OFF: [6.25, 3.4], NIJER_DELTA: [3.6, 6.3], BIAFRA: [3.0, 8.2],
  MALABO_OFF: [3.9, 8.55], DUALA_OFF: [3.85, 9.35], BATA_OFF: [1.85, 9.6], GABON: [-0.8, 8.4],
  POINTE_NOIRE_OFF: [-4.85, 11.6], LUANDA_OFF: [-8.7, 12.9], NAMIBYA: [-22.0, 12.8],
  // Atlantik, Karayipler, Meksika Korfezi
  AZOR_G: [34.0, -25.0], ATLANTIK_O: [28.0, -55.0], BAHAMA_K: [27.8, -77.0], FLORIDA_BOG: [24.0, -80.3],
  MARIEL_OFF: [23.12, -82.75], HAVANA_OFF: [23.2, -82.35], MEKSIKA_KORFEZI: [24.0, -88.0], VERAKRUZ_OFF: [19.3, -95.9],
  KARAYIP_KD: [21.4, -68.5], RUZGAR_GECIDI: [20.05, -73.85], SANTIAGO_OFF: [19.85, -75.85],
  // Kuzey Avrupa
  FINISTERRE: [43.6, -10.2], USHANT: [48.6, -6.0], DOVER: [50.95, 1.45], ROTTERDAM_OFF: [52.0, 3.9],
  HELGOLAND: [54.1, 7.8], HAMBURG_OFF: [53.95, 8.45],
};

/** Kenarlar (iki yonlu). `dar: true` = bogaz / kanal / liman girisi: kara denetiminden muaf. */
const KENARLAR: [string, string, boolean?][] = [
  // Marmara - Canakkale - Ege
  ["MARMARA_B", "MARMARA_G"], ["MARMARA_G", "CANAKKALE_K", true], ["GEMLIK_OFF", "MARMARA_B", true],
  ["CANAKKALE_K", "CANAKKALE_O", true], ["CANAKKALE_O", "CANAKKALE_G", true], ["CANAKKALE_G", "EGE_K"],
  ["MARMARA_B", "BOGAZICI_G", true], ["BOGAZICI_G", "BOGAZICI_K", true], ["BOGAZICI_K", "KARADENIZ_B"],
  ["KARADENIZ_B", "ODESSA_OFF"], ["KARADENIZ_B", "KOSTENCE_OFF"], ["KARADENIZ_B", "KARADENIZ_D"], ["KARADENIZ_D", "BATUM_OFF"],
  ["EGE_K", "EGE_O"], ["IZMIR_OFF", "KARABURUN_K", true], ["KARABURUN_K", "EGE_O"], ["EGE_O", "MIKONOS_IKARYA"],
  ["MIKONOS_IKARYA", "AMORGOS_D"], ["AMORGOS_D", "KARPATOS"], ["EGE_K", "KAFIREAS"], ["KAFIREAS", "KEA_B"], ["KEA_B", "GIRIT_B"],
  // Dogu Akdeniz
  ["KARPATOS", "DOGU_AKDENIZ"], ["KARPATOS", "KIBRIS_G"], ["DOGU_AKDENIZ", "PORT_SAID"], ["DOGU_AKDENIZ", "ISKENDERIYE_OFF"],
  ["DOGU_AKDENIZ", "KIBRIS_G"], ["KIBRIS_G", "LIMASOL_OFF"], ["KIBRIS_G", "LEVANT"], ["LEVANT", "PORT_SAID"],
  ["LEVANT", "BEYRUT_OFF"], ["LEVANT", "KIBRIS_D"], ["KIBRIS_D", "MERSIN_OFF"], ["KIBRIS_D", "LAZKIYE_OFF"],
  // Orta / Bati Akdeniz
  ["GIRIT_B", "IYON"], ["IYON", "BINGAZI_OFF"], ["IYON", "MALTA_K"], ["MALTA_K", "MISRATA_OFF"],
  ["MALTA_K", "TRABLUS_OFF"], ["MALTA_K", "SICILYA_BOG"], ["SICILYA_BOG", "TUNUS_OFF"], ["SICILYA_BOG", "SARDINYA_G"],
  ["SARDINYA_G", "SARDINYA_B"], ["SARDINYA_B", "LIGURYA"], ["LIGURYA", "CENOVA_OFF"], ["SARDINYA_G", "BALEAR_G"], ["BALEAR_G", "CEZAYIR_OFF"],
  ["BALEAR_G", "VALENSIYA_OFF"], ["BALEAR_G", "ALBORAN"], ["ALBORAN", "CEBELITARIK", true], ["CEBELITARIK", "KADIZ_B", true],
  ["KADIZ_B", "KAZABLANKA_OFF"],
  // Suveys - Kizildeniz - Aden
  ["PORT_SAID", "SUVEYS", true], ["SUVEYS", "KIZILDENIZ_K", true], ["KIZILDENIZ_K", "AKABE_KORFEZ"], ["AKABE_KORFEZ", "AKABE_OFF", true],
  ["KIZILDENIZ_K", "KIZILDENIZ_O"], ["KIZILDENIZ_O", "CIDDE_OFF"], ["KIZILDENIZ_O", "PORT_SUDAN_OFF"], ["KIZILDENIZ_O", "KIZILDENIZ_G"],
  ["KIZILDENIZ_G", "HUDEYDE_OFF"], ["KIZILDENIZ_G", "BABULMENDEP", true], ["BABULMENDEP", "CIBUTI_OFF", true], ["BABULMENDEP", "ADEN_B", true],
  ["CIBUTI_OFF", "ADEN_B"], ["ADEN_B", "ADEN_OFF"], ["ADEN_B", "BERBERA_OFF"], ["ADEN_B", "ADEN_D"], ["BERBERA_OFF", "ADEN_D"],
  ["ADEN_D", "GUARDAFUI"],
  // Hint Okyanusu, Korfez, Asya
  ["GUARDAFUI", "ARAP_DENIZI"], ["ARAP_DENIZI", "OMAN_D"], ["OMAN_D", "HURMUZ_DIS"], ["HURMUZ_DIS", "HURMUZ", true], ["HURMUZ", "BENDER_ABBAS_OFF", true],
  ["HURMUZ", "KORFEZ_O"], ["KORFEZ_O", "CEBELALI_OFF"], ["KORFEZ_O", "DUBAI_OFF"], ["KORFEZ_O", "DAMMAM_OFF"], ["DAMMAM_OFF", "UMM_KASR_OFF"],
  ["HURMUZ_DIS", "KARACI_OFF"], ["ARAP_DENIZI", "LAKADIV"], ["LAKADIV", "SRI_LANKA_G"], ["SRI_LANKA_G", "GALLE_OFF"], ["GALLE_OFF", "KOLOMBO_OFF"],
  ["SRI_LANKA_G", "SRI_LANKA_D"], ["SRI_LANKA_D", "BENGAL"], ["BENGAL", "CITTAGONG_OFF"], ["SRI_LANKA_G", "ACE"], ["ACE", "MALAKKA_K"], ["MALAKKA_K", "MALAKKA_O"], ["MALAKKA_O", "PORT_KLANG_OFF"],
  ["MALAKKA_O", "SINGAPUR_OFF", true], ["SINGAPUR_OFF", "SINGAPUR_D", true], ["SINGAPUR_D", "GCD_DENIZI"], ["GCD_DENIZI", "HOCIMIN_OFF"], ["GCD_DENIZI", "GCD_DOGU"],
  ["GCD_DOGU", "MANILA_OFF", true], ["SINGAPUR_D", "BINTAN_K"], ["BINTAN_K", "KARIMATA"], ["KARIMATA", "CAKARTA_OFF"],
  // Dogu Afrika
  ["GUARDAFUI", "SOMALI_K"], ["SOMALI_K", "SOMALI_G"], ["SOMALI_G", "MOGADISU_OFF"], ["SOMALI_G", "MOMBASA_OFF"],
  ["MOMBASA_OFF", "PEMBA_D"], ["PEMBA_D", "DARUSSELAM_OFF"], ["PEMBA_D", "KOMOR_K"], ["DARUSSELAM_OFF", "KOMOR_K"], ["KOMOR_K", "MUTSAMUDU_OFF"], ["KOMOR_K", "KOMOR_B"], ["KOMOR_B", "MORONI_OFF"],
  ["KOMOR_K", "MADAGASKAR_K"], ["MADAGASKAR_K", "MADAGASKAR_KD"], ["MADAGASKAR_KD", "TOAMASINA_OFF"], ["MADAGASKAR_K", "PORT_LOUIS_OFF"], 
  ["MORONI_OFF", "MOZAMBIK_KAN"], ["MOZAMBIK_KAN", "BAZARUTO_D"], ["BAZARUTO_D", "MOZAMBIK_G"], ["MOZAMBIK_G", "MAPUTO_OFF"], ["MOZAMBIK_G", "ZULULAND"], ["MAPUTO_OFF", "ZULULAND"],
  ["ZULULAND", "DURBAN_OFF"], ["DURBAN_OFF", "DOGU_KAP"], ["DOGU_KAP", "UMIT_D"], ["UMIT_D", "UMIT_BURNU"],
  // Bati Afrika
  ["KADIZ_B", "KANARYA"], ["KANARYA", "NOUADHIBOU_OFF"], ["KANARYA", "DAKAR_OFF"], ["DAKAR_OFF", "ATLANTIK_GB"], ["ATLANTIK_GB", "PALMAS"], ["ATLANTIK_GB", "KONAKRI_OFF"], ["NOUADHIBOU_OFF", "NOUAKCHOTT_OFF"], ["NOUAKCHOTT_OFF", "DAKAR_OFF"],
  ["DAKAR_OFF", "BISSAU_B"], ["BISSAU_B", "KONAKRI_OFF"], ["KONAKRI_OFF", "FRITAUN_OFF"], ["FRITAUN_OFF", "SHERBRO"], ["SHERBRO", "MONROVIA_OFF"],
  ["MONROVIA_OFF", "PALMAS"], ["PALMAS", "ABIDJAN_OFF"], ["ABIDJAN_OFF", "GANA_B"], ["PALMAS", "GANA_B"], ["GANA_B", "TEMA_OFF"], ["TEMA_OFF", "LOME_OFF"], ["LOME_OFF", "KOTONU_OFF"],
  ["KOTONU_OFF", "LAGOS_OFF"], ["LAGOS_OFF", "NIJER_DELTA"], ["NIJER_DELTA", "BIAFRA"], ["BIAFRA", "MALABO_OFF"], ["BIAFRA", "BIOKO_G"], ["BIOKO_G", "DUALA_OFF"], ["BIOKO_G", "BATA_OFF"],
  ["BIAFRA", "BATA_OFF"], ["BATA_OFF", "GABON"], ["BIAFRA", "GABON"], ["GABON", "GABON_G"], ["GABON_G", "POINTE_NOIRE_OFF"], ["POINTE_NOIRE_OFF", "LUANDA_OFF"],
  ["LUANDA_OFF", "NAMIBYA_K"], ["NAMIBYA_K", "NAMIBYA"], ["NAMIBYA", "UMIT_BURNU"],
  // Atlantik - Karayipler
  ["KADIZ_B", "AZOR_G"], ["KANARYA", "AZOR_G"], ["AZOR_G", "ATLANTIK_O"], ["ATLANTIK_O", "BAHAMA_K"], ["BAHAMA_K", "FLORIDA_K"], ["FLORIDA_K", "FLORIDA_BOG"],
  ["FLORIDA_BOG", "HAVANA_OFF"], ["HAVANA_OFF", "MARIEL_OFF"], ["FLORIDA_BOG", "MEKSIKA_KORFEZI"], ["MARIEL_OFF", "MEKSIKA_KORFEZI"],
  ["MEKSIKA_KORFEZI", "VERAKRUZ_OFF"], ["ATLANTIK_O", "KARAYIP_KD"], ["KARAYIP_KD", "RUZGAR_GECIDI"], ["RUZGAR_GECIDI", "KUBA_G"], ["KUBA_G", "SANTIAGO_OFF"],
  // Kuzey Avrupa
  ["KADIZ_B", "PORTEKIZ_B"], ["PORTEKIZ_B", "FINISTERRE"], ["FINISTERRE", "USHANT"], ["USHANT", "DOVER", true], ["DOVER", "ROTTERDAM_OFF"], ["ROTTERDAM_OFF", "TEKSEL"], ["TEKSEL", "HELGOLAND"],
  ["HELGOLAND", "HAMBURG_OFF", true],
];

/** Varis limani (limanAnahtari) -> bagli oldugu deniz dugumu. */
export const LIMAN_GIRISI: Record<string, string> = {
  DJIBOUTI: "CIBUTI_OFF", BERBERA: "BERBERA_OFF", MOGADISHU: "MOGADISU_OFF", MOMBASA: "MOMBASA_OFF",
  "DAR ES SALAAM": "DARUSSELAM_OFF", MUTSAMUDU: "MUTSAMUDU_OFF", MORONI: "MORONI_OFF", TOAMASINA: "TOAMASINA_OFF",
  TAMATAVE: "TOAMASINA_OFF", "PORT LOUIS": "PORT_LOUIS_OFF", MAPUTO: "MAPUTO_OFF", DURBAN: "DURBAN_OFF",
  "PORT SUDAN": "PORT_SUDAN_OFF", ADEN: "ADEN_OFF", HODEIDAH: "HUDEYDE_OFF", JEDDAH: "CIDDE_OFF", AQABA: "AKABE_OFF",
  "UMM QASR": "UMM_KASR_OFF", DAMMAM: "DAMMAM_OFF", "JEBEL ALI": "CEBELALI_OFF", DUBAI: "DUBAI_OFF",
  "BANDAR ABBAS": "BENDER_ABBAS_OFF", KARACHI: "KARACI_OFF", COLOMBO: "KOLOMBO_OFF", CHITTAGONG: "CITTAGONG_OFF",
  TEMA: "TEMA_OFF", COTONOU: "KOTONU_OFF", LOME: "LOME_OFF", LAGOS: "LAGOS_OFF", APAPA: "LAGOS_OFF", ABIDJAN: "ABIDJAN_OFF",
  DAKAR: "DAKAR_OFF", CONAKRY: "KONAKRI_OFF", FREETOWN: "FRITAUN_OFF", MONROVIA: "MONROVIA_OFF", NOUAKCHOTT: "NOUAKCHOTT_OFF",
  NOUADHIBOU: "NOUADHIBOU_OFF", BATA: "BATA_OFF", MALABO: "MALABO_OFF", DOUALA: "DUALA_OFF", "POINTE NOIRE": "POINTE_NOIRE_OFF",
  LUANDA: "LUANDA_OFF", TRIPOLI: "TRABLUS_OFF", MISURATA: "MISRATA_OFF", BENGHAZI: "BINGAZI_OFF", ALGIERS: "CEZAYIR_OFF",
  TUNIS: "TUNUS_OFF", ALEXANDRIA: "ISKENDERIYE_OFF", CASABLANCA: "KAZABLANKA_OFF", BEIRUT: "BEYRUT_OFF", LATAKIA: "LAZKIYE_OFF",
  LIMASSOL: "LIMASOL_OFF", VALENCIA: "VALENSIYA_OFF", GENOA: "CENOVA_OFF", ODESSA: "ODESSA_OFF", CONSTANTA: "KOSTENCE_OFF",
  BATUMI: "BATUM_OFF", POTI: "BATUM_OFF", ROTTERDAM: "ROTTERDAM_OFF", HAMBURG: "HAMBURG_OFF", SINGAPORE: "SINGAPUR_OFF",
  "PORT KLANG": "PORT_KLANG_OFF", JAKARTA: "CAKARTA_OFF", MANILA: "MANILA_OFF", "HO CHI MINH": "HOCIMIN_OFF",
  MARIEL: "MARIEL_OFF", HAVANA: "HAVANA_OFF", "SANTIAGO DE CUBA": "SANTIAGO_OFF", VERACRUZ: "VERAKRUZ_OFF",
};

/** Cikis merkezi adi (lib/liman-koordinat.ts CIKISLAR) -> deniz dugumu. */
export const CIKIS_GIRISI: Record<string, string> = {
  "İstanbul": "MARMARA_B", Gemlik: "GEMLIK_OFF", "İzmir": "IZMIR_OFF", Mersin: "MERSIN_OFF", "İskenderun": "MERSIN_OFF",
};

/** Rota uzerinde gecildiginde kullaniciya adiyla yazilan noktalar. */
export const GECIS_NOKTALARI: Record<string, string> = {
  BOGAZICI_K: "İstanbul Boğazı", CANAKKALE_O: "Çanakkale Boğazı", SUVEYS: "Süveyş Kanalı", BABULMENDEP: "Bab-el Mandeb",
  CEBELITARIK: "Cebelitarık", MALAKKA_O: "Malakka Boğazı", HURMUZ: "Hürmüz Boğazı", UMIT_BURNU: "Ümit Burnu",
  RUZGAR_GECIDI: "Rüzgâr Geçidi", FLORIDA_BOG: "Florida Boğazı", DOVER: "Manş Denizi", MOZAMBIK_KAN: "Mozambik Kanalı",
};

const DUNYA_YARICAPI_NM = 3440.065;
/** Iki nokta arasi buyuk daire mesafesi (deniz mili). */
export function mesafeNm(a: Nokta, b: Nokta): number {
  const r = Math.PI / 180;
  const dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * DUNYA_YARICAPI_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

let komsuluk: Map<string, { hedef: string; nm: number }[]> | null = null;
function ag() {
  if (komsuluk) return komsuluk;
  komsuluk = new Map();
  for (const [a, b] of KENARLAR) {
    const nm = mesafeNm(DENIZ_DUGUMLERI[a], DENIZ_DUGUMLERI[b]);
    if (!komsuluk.has(a)) komsuluk.set(a, []);
    if (!komsuluk.has(b)) komsuluk.set(b, []);
    komsuluk.get(a)!.push({ hedef: b, nm });
    komsuluk.get(b)!.push({ hedef: a, nm });
  }
  return komsuluk;
}

/** Testler icin: tum kenarlar ve dar (muaf) olanlar. */
export const DENIZ_KENARLARI = KENARLAR.map(([a, b, dar]) => ({ a, b, dar: !!dar }));

/** Iki dugum arasi en kisa yol (Dijkstra); yol yoksa null. */
export function enKisaYol(bas: string, son: string): string[] | null {
  const g = ag();
  if (!g.has(bas) || !g.has(son)) return null;
  const uzak = new Map<string, number>([[bas, 0]]);
  const once = new Map<string, string>();
  const bekleyen = new Set<string>([bas]);
  const ziyaret = new Set<string>();
  while (bekleyen.size) {
    let u = "", enAz = Infinity;
    bekleyen.forEach((d) => { const v = uzak.get(d)!; if (v < enAz) { enAz = v; u = d; } });
    bekleyen.delete(u);
    if (u === son) break;
    ziyaret.add(u);
    for (const { hedef, nm } of g.get(u) || []) {
      if (ziyaret.has(hedef)) continue;
      const yeni = enAz + nm;
      if (yeni < (uzak.get(hedef) ?? Infinity)) { uzak.set(hedef, yeni); once.set(hedef, u); bekleyen.add(hedef); }
    }
  }
  if (!uzak.has(son)) return null;
  const yol = [son];
  while (yol[0] !== bas) yol.unshift(once.get(yol[0])!);
  return yol;
}

export type DenizRotasi = { noktalar: Nokta[]; nm: number; gecisler: string[] };

/**
 * Cikis merkezinden (koordinat + ad) varis limanina deniz rotasi: cikis -> giris dugumu ->
 * ag -> liman dugumu -> liman. Liman / cikis aga bagli degilse null (haritada cizilmez).
 */
export function denizRotasi(cikisAdi: string, cikis: Nokta, limanAnahtari: string, liman: Nokta): DenizRotasi | null {
  const bas = CIKIS_GIRISI[cikisAdi], son = LIMAN_GIRISI[limanAnahtari];
  if (!bas || !son) return null;
  const yol = enKisaYol(bas, son);
  if (!yol) return null;
  const noktalar: Nokta[] = [cikis, ...yol.map((d) => DENIZ_DUGUMLERI[d]), liman];
  let nm = 0;
  for (let i = 1; i < noktalar.length; i++) nm += mesafeNm(noktalar[i - 1], noktalar[i]);
  return { noktalar, nm, gecisler: yol.filter((d) => GECIS_NOKTALARI[d]).map((d) => GECIS_NOKTALARI[d]) };
}

/**
 * Noktalardan yumusak SVG yolu (equirectangular derece: x = boylam+180, y = 90-enlem).
 * Kose yumusatma kisa tutulur (her kosede komsu kenarin en fazla %22'si) ki kiyiya tasmasin.
 */
export function rotaYolu(noktalar: Nokta[]): string {
  const p = noktalar.map(([e, b]) => [b + 180, 90 - e] as [number, number]);
  if (p.length < 2) return "";
  const f = (n: number) => n.toFixed(2);
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [ax, ay] = p[i - 1], [bx, by] = p[i], [cx, cy] = p[i + 1];
    const k = 0.22;
    const g1: [number, number] = [bx + (ax - bx) * k, by + (ay - by) * k];
    const g2: [number, number] = [bx + (cx - bx) * k, by + (cy - by) * k];
    d += ` L${f(g1[0])},${f(g1[1])} Q${f(bx)},${f(by)} ${f(g2[0])},${f(g2[1])}`;
  }
  const s = p[p.length - 1];
  return d + ` L${f(s[0])},${f(s[1])}`;
}
