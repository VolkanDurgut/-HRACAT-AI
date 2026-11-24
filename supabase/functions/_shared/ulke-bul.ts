/**
 * Serbest metinden (alici adresi / varis limani) ULKE bulma (08.10.2026).
 *
 * Talep: Fatura talimatinda proformadaki BUYER'in ulkesi "Ticaret Yapilan
 * Ulke" olarak gorunsun; varis limaninin ulkesi ise "Gidecegi Ulke".
 * Ikisi farkli olabilir: IHR-2026-0091 BIRRAKA (alici Ispanya, mal Kuba'ya),
 * 0076 ESMAAGRIC (Meksika -> Kuba), 0077 EASTBOURNE (Mauritius -> Komorlar).
 *
 * Veritabaninda ayri bir ulke alani YOK; alici adresi proformadan okunan
 * serbest metindir ("... Santa Cruz de Tenerife Islas canarias - España",
 * "P.O. BOX 1180 DJIBOUTI 338 CİBUTİ", "... HEROICA PUEBLA DE ZARAGOZA
 * MEXICO C.P72833"). Bu yuzden bilinen ulke adlari (Turkce / Ingilizce /
 * Fransizca / Ispanyolca yazimlariyla) metinde KELIME olarak aranir; metnin
 * SONUNA en yakin eslesme alinir (ulke genelde adresin sonundadir), ayni
 * yerde biten eslesmelerde en uzunu kazanir ("EQUATORIAL GUINEA" > "GUINEA").
 *
 * Sonuc Turkce buyuk harf ulke adidir (fatura talimati Turkce, ic belge).
 * Bulunamazsa null - cagiran taraf "belirlenemedi" gosterir, TAHMIN ETMEZ.
 * Kayit DEGISMEZ; sadece gosterim icindir.
 */
import { sadelestir } from "./liman-anahtari.ts";

/** [Turkce ad, ...diger yazimlar] - yazimlar sadelestir() sonrasi karsilastirilir. */
const ULKELER: string[][] = [
  // Afrika
  ["CİBUTİ", "DJIBOUTI", "CIBUTI", "REPUBLIC OF DJIBOUTI", "REP. DJIBOUTI", "REPUBLIQUE DE DJIBOUTI"],
  ["SOMALİ", "SOMALIA", "SOMALILAND", "SOMALI"],
  ["ETİYOPYA", "ETHIOPIA", "ETHIOPIE"],
  ["ERİTRE", "ERITREA", "ERYTHREE"],
  ["SUDAN", "SOUDAN"],
  ["GÜNEY SUDAN", "SOUTH SUDAN", "SOUDAN DU SUD"],
  ["MISIR", "EGYPT", "EGYPTE"],
  ["LİBYA", "LIBYA", "LIBYE"],
  ["TUNUS", "TUNISIA", "TUNISIE"],
  ["CEZAYİR", "ALGERIA", "ALGERIE"],
  ["FAS", "MOROCCO", "MAROC", "MARRUECOS"],
  ["MORİTANYA", "MAURITANIA", "MAURITANIE"],
  ["SENEGAL"],
  ["GAMBİYA", "GAMBIA", "GAMBIE"],
  ["GİNE-BİSSAU", "GUINEA-BISSAU", "GUINEA BISSAU", "GUINEE-BISSAU", "GUINEE BISSAU"],
  ["GİNE", "GUINEA", "GUINEE", "REPUBLIC OF GUINEA", "CONAKRY"],
  ["EKVATOR GİNESİ", "EQUATORIAL GUINEA", "GUINEA ECUATORIAL", "GUINEE EQUATORIALE"],
  ["SİERRA LEONE", "SIERRA LEONE"],
  ["LİBERYA", "LIBERIA"],
  ["FİLDİŞİ SAHİLİ", "IVORY COAST", "COTE D'IVOIRE", "COTE DIVOIRE", "COTE D IVOIRE"],
  ["GANA", "GHANA"],
  ["TOGO"],
  ["BENİN", "BENIN"],
  ["NİJERYA", "NIGERIA"],
  ["NİJER", "NIGER"],
  ["MALİ", "MALI"],
  ["BURKİNA FASO", "BURKINA FASO", "BURKINA"],
  ["ÇAD", "CHAD", "TCHAD"],
  ["KAMERUN", "CAMEROON", "CAMEROUN"],
  ["GABON"],
  ["KONGO DEMOKRATİK CUMHURİYETİ", "DEMOCRATIC REPUBLIC OF THE CONGO", "DEMOCRATIC REPUBLIC OF CONGO", "DR CONGO", "D.R. CONGO", "RD CONGO", "RDC"],
  ["KONGO", "CONGO", "REPUBLIC OF THE CONGO", "CONGO BRAZZAVILLE"],
  ["ANGOLA"],
  ["SAO TOME VE PRINCIPE", "SAO TOME AND PRINCIPE", "SAO TOME"],
  ["KENYA"],
  ["TANZANYA", "TANZANIA", "TANZANIE"],
  ["UGANDA", "OUGANDA"],
  ["RUANDA", "RWANDA"],
  ["BURUNDİ", "BURUNDI"],
  ["MOZAMBİK", "MOZAMBIQUE"],
  ["MADAGASKAR", "MADAGASCAR"],
  ["KOMORLAR", "COMOROS", "COMORES", "UNION OF THE COMOROS", "UNION DES COMORES"],
  ["MAURİTİUS", "MAURITIUS", "ILE MAURICE", "REPUBLIC OF MAURITIUS"],
  ["SEYŞELLER", "SEYCHELLES"],
  ["GÜNEY AFRİKA", "SOUTH AFRICA", "AFRIQUE DU SUD"],
  ["NAMİBYA", "NAMIBIA"],
  ["ZAMBİYA", "ZAMBIA"],
  ["ZİMBABVE", "ZIMBABWE"],
  ["MALAVİ", "MALAWI"],
  ["CABO VERDE", "CAPE VERDE", "CAP-VERT", "CABO VERDE"],
  // Orta Dogu / Asya
  ["YEMEN"],
  ["UMMAN", "OMAN"],
  ["SUUDİ ARABİSTAN", "SAUDI ARABIA", "KINGDOM OF SAUDI ARABIA", "KSA"],
  ["BİRLEŞİK ARAP EMİRLİKLERİ", "UNITED ARAB EMIRATES", "UAE", "U.A.E", "DUBAI", "ABU DHABI", "SHARJAH"],
  ["KATAR", "QATAR"],
  ["KUVEYT", "KUWAIT"],
  ["BAHREYN", "BAHRAIN"],
  ["IRAK", "IRAQ"],
  ["İRAN", "IRAN"],
  ["ÜRDÜN", "JORDAN"],
  ["LÜBNAN", "LEBANON", "LIBAN"],
  ["SURİYE", "SYRIA", "SYRIE"],
  ["FİLİSTİN", "PALESTINE"],
  ["İSRAİL", "ISRAEL"],
  ["GÜRCİSTAN", "GEORGIA"],
  ["AZERBAYCAN", "AZERBAIJAN"],
  ["TÜRKMENİSTAN", "TURKMENISTAN"],
  ["AFGANİSTAN", "AFGHANISTAN"],
  ["PAKİSTAN", "PAKISTAN"],
  ["HİNDİSTAN", "INDIA"],
  ["BANGLADEŞ", "BANGLADESH"],
  ["SRİ LANKA", "SRI LANKA"],
  ["MALDİVLER", "MALDIVES"],
  ["SİNGAPUR", "SINGAPORE", "SINGAPUR"],
  ["MALEZYA", "MALAYSIA"],
  ["ENDONEZYA", "INDONESIA"],
  ["FİLİPİNLER", "PHILIPPINES"],
  ["VİETNAM", "VIETNAM", "VIET NAM"],
  ["TAYLAND", "THAILAND"],
  ["KAMBOÇYA", "CAMBODIA"],
  ["MYANMAR", "BURMA"],
  ["ÇİN", "CHINA", "P.R. CHINA", "PRC"],
  ["HONG KONG", "HONG KONG"],
  ["TAYVAN", "TAIWAN"],
  ["GÜNEY KORE", "SOUTH KOREA", "REPUBLIC OF KOREA", "KOREA"],
  ["JAPONYA", "JAPAN"],
  ["AVUSTRALYA", "AUSTRALIA"],
  ["YENİ ZELANDA", "NEW ZEALAND"],
  // Avrupa
  ["İSPANYA", "SPAIN", "ESPANA", "ESPAGNE", "REINO DE ESPANA", "ISLAS CANARIAS", "CANARY ISLANDS"],
  ["PORTEKİZ", "PORTUGAL"],
  ["FRANSA", "FRANCE"],
  ["İTALYA", "ITALY", "ITALIA", "ITALIE"],
  ["ALMANYA", "GERMANY", "DEUTSCHLAND", "ALLEMAGNE"],
  ["HOLLANDA", "NETHERLANDS", "THE NETHERLANDS", "HOLLAND", "PAYS-BAS"],
  ["BELÇİKA", "BELGIUM", "BELGIQUE"],
  ["BİRLEŞİK KRALLIK", "UNITED KINGDOM", "UK", "U.K.", "ENGLAND", "GREAT BRITAIN"],
  ["İRLANDA", "IRELAND"],
  ["İSVİÇRE", "SWITZERLAND", "SUISSE"],
  ["AVUSTURYA", "AUSTRIA"],
  ["YUNANİSTAN", "GREECE"],
  ["KIBRIS", "CYPRUS"],
  ["MALTA"],
  ["BULGARİSTAN", "BULGARIA"],
  ["ROMANYA", "ROMANIA"],
  ["POLONYA", "POLAND"],
  ["UKRAYNA", "UKRAINE"],
  ["RUSYA", "RUSSIA", "RUSSIAN FEDERATION"],
  ["ARNAVUTLUK", "ALBANIA"],
  // Amerika
  ["KÜBA", "CUBA"],
  ["MEKSİKA", "MEXICO", "MEJICO", "MEXIQUE"],
  ["DOMİNİK CUMHURİYETİ", "DOMINICAN REPUBLIC", "REPUBLICA DOMINICANA"],
  ["HAİTİ", "HAITI"],
  ["JAMAİKA", "JAMAICA"],
  ["PANAMA"],
  ["KOSTA RİKA", "COSTA RICA"],
  ["GUATEMALA"],
  ["HONDURAS"],
  ["EL SALVADOR"],
  ["NİKARAGUA", "NICARAGUA"],
  ["KOLOMBİYA", "COLOMBIA"],
  ["VENEZUELA"],
  ["EKVADOR", "ECUADOR"],
  ["PERU", "PERU"],
  ["ŞİLİ", "CHILE"],
  ["BREZİLYA", "BRAZIL", "BRASIL"],
  ["ARJANTİN", "ARGENTINA"],
  ["URUGUAY"],
  ["PARAGUAY"],
  ["BOLİVYA", "BOLIVIA"],
  ["AMERİKA BİRLEŞİK DEVLETLERİ", "UNITED STATES", "UNITED STATES OF AMERICA", "USA", "U.S.A."],
  ["KANADA", "CANADA"],
  // 20.11.2026 (IHR-2026-0131: "PARAMARIBO, SURINAME" ulkesi bulunamiyordu)
  ["SURİNAM", "SURINAME", "SURINAM"],
  ["GUYANA"],
  ["TRİNİDAD VE TOBAGO", "TRINIDAD AND TOBAGO", "TRINIDAD & TOBAGO", "TRINIDAD"],
  ["BARBADOS"],
  ["BELİZE", "BELIZE"],
  ["BAHAMALAR", "BAHAMAS"],
  ["PORTO RİKO", "PUERTO RICO"],
];

/** Ulke adi olmadigi halde ulke ima eden liman/sehir adlari (sadece varis limani icin). */
const LIMAN_ULKE: Record<string, string> = {
  MARIEL: "KÜBA",
  "SANTIAGO DE CUBA": "KÜBA",
  HAVANA: "KÜBA",
  MUTSAMUDU: "KOMORLAR",
  MORONI: "KOMORLAR",
  BERBERA: "SOMALİ",
  MOGADISHU: "SOMALİ",
  BOSASO: "SOMALİ",
  COTONOU: "BENİN",
  LOME: "TOGO",
  MALABO: "EKVATOR GİNESİ",
  BATA: "EKVATOR GİNESİ",
  "PORT LOUIS": "MAURİTİUS",
  PARAMARIBO: "SURİNAM",
  "PORT OF SPAIN": "TRİNİDAD VE TOBAGO",
  GEORGETOWN: "GUYANA",
  // 24.11.2026 (kullanici: fatura talimatinda "Varis Limani ASHDOD PORT" yaninda ulke de yazmali): ulke adi
  // yazilmamis varis limanlari icin genis liste. Belirsiz adlar (TRIPOLI: Libya/Lubnan, VALENCIA: Ispanya/Venezuela,
  // SAN PEDRO, COLON) bilerek YOK - tahmin yerine bos kalir.
  ASHDOD: "İSRAİL", HAIFA: "İSRAİL", EILAT: "İSRAİL",
  MOMBASA: "KENYA", LAMU: "KENYA",
  "DAR ES SALAAM": "TANZANYA", "DAR ES SALAM": "TANZANYA", "DAR SALAAM": "TANZANYA", "DAR SALAM": "TANZANYA", ZANZIBAR: "TANZANYA", TANGA: "TANZANYA",
  TEMA: "GANA", TAKORADI: "GANA",
  TOAMASINA: "MADAGASKAR", TAMATAVE: "MADAGASKAR", MAHAJANGA: "MADAGASKAR", MAJUNGA: "MADAGASKAR",
  MAPUTO: "MOZAMBİK", BEIRA: "MOZAMBİK", NACALA: "MOZAMBİK",
  DURBAN: "GÜNEY AFRİKA", "CAPE TOWN": "GÜNEY AFRİKA",
  "PORT SUDAN": "SUDAN", ADEN: "YEMEN", HODEIDAH: "YEMEN", MUKALLA: "YEMEN",
  JEDDAH: "SUUDİ ARABİSTAN", DAMMAM: "SUUDİ ARABİSTAN",
  AQABA: "ÜRDÜN", "UMM QASR": "IRAK", BASRA: "IRAK",
  "JEBEL ALI": "BİRLEŞİK ARAP EMİRLİKLERİ", "BANDAR ABBAS": "İRAN",
  KARACHI: "PAKİSTAN", "PORT QASIM": "PAKİSTAN", COLOMBO: "SRİ LANKA", CHITTAGONG: "BANGLADEŞ", MALE: "MALDİVLER",
  LAGOS: "NİJERYA", APAPA: "NİJERYA", "TIN CAN": "NİJERYA", ONNE: "NİJERYA",
  ABIDJAN: "FİLDİŞİ SAHİLİ", DAKAR: "SENEGAL", FREETOWN: "SİERRA LEONE", MONROVIA: "LİBERYA",
  NOUAKCHOTT: "MORİTANYA", NOUADHIBOU: "MORİTANYA", BANJUL: "GAMBİYA", BISSAU: "GİNE-BİSSAU", PRAIA: "CABO VERDE",
  DOUALA: "KAMERUN", KRIBI: "KAMERUN", "POINTE NOIRE": "KONGO", MATADI: "KONGO DEMOKRATİK CUMHURİYETİ",
  LUANDA: "ANGOLA", LOBITO: "ANGOLA", LIBREVILLE: "GABON", OWENDO: "GABON",
  MISURATA: "LİBYA", BENGHAZI: "LİBYA", KHOMS: "LİBYA",
  ALGIERS: "CEZAYİR", ALGER: "CEZAYİR", ORAN: "CEZAYİR", BEJAIA: "CEZAYİR", ANNABA: "CEZAYİR", SKIKDA: "CEZAYİR",
  TUNIS: "TUNUS", RADES: "TUNUS", SFAX: "TUNUS",
  ALEXANDRIA: "MISIR", "PORT SAID": "MISIR", DAMIETTA: "MISIR", SOKHNA: "MISIR",
  CASABLANCA: "FAS", TANGIER: "FAS", TANGER: "FAS", AGADIR: "FAS",
  BEIRUT: "LÜBNAN", LATAKIA: "SURİYE", TARTUS: "SURİYE", LIMASSOL: "KIBRIS",
  GENOA: "İTALYA", ODESSA: "UKRAYNA", CONSTANTA: "ROMANYA", BATUMI: "GÜRCİSTAN", POTI: "GÜRCİSTAN",
  ROTTERDAM: "HOLLANDA", HAMBURG: "ALMANYA", ANTWERP: "BELÇİKA",
  "PORT KLANG": "MALEZYA", JAKARTA: "ENDONEZYA", SURABAYA: "ENDONEZYA", MANILA: "FİLİPİNLER",
  "HO CHI MINH": "VİETNAM", HAIPHONG: "VİETNAM", VERACRUZ: "MEKSİKA", "SAN JUAN": "PORTO RİKO",
};

type Aday = { ulke: string; desen: string };
const ADAYLAR: Aday[] = ULKELER.flatMap(([ulke, ...digerleri]) =>
  Array.from(new Set([ulke, ...digerleri])).map((yazim) => ({ ulke, desen: normalize(yazim) }))
).filter((a) => a.desen.length > 0);

/** Harf/rakam disini bosluga cevirir; kelime siniri icin basa-sona bosluk. */
function normalize(metin: string): string {
  return sadelestir(metin).replace(/[^A-Z0-9]+/g, " ").trim();
}

function enSondakiEslesme(metin: string, sozluk: Aday[]): string | null {
  const s = ` ${normalize(metin)} `;
  let enIyi: { bitis: number; uzunluk: number; ulke: string } | null = null;
  for (const a of sozluk) {
    const aranan = ` ${a.desen} `;
    const i = s.lastIndexOf(aranan);
    if (i < 0) continue;
    const bitis = i + aranan.length;
    if (!enIyi || bitis > enIyi.bitis || (bitis === enIyi.bitis && a.desen.length > enIyi.uzunluk)) {
      enIyi = { bitis, uzunluk: a.desen.length, ulke: a.ulke };
    }
  }
  return enIyi ? enIyi.ulke : null;
}

/** Serbest metindeki (adres) ulkeyi Turkce buyuk harf olarak bulur; yoksa null. */
export function ulkeBul(metin: string | null | undefined): string | null {
  if (!metin || !metin.trim()) return null;
  return enSondakiEslesme(metin, ADAYLAR);
}

/** Ticaret yapilan ulke = proformadaki BUYER (alici) adresinin ulkesi. */
export function ticaretYapilanUlke(aliciAdresi: string | null | undefined): string | null {
  return ulkeBul(aliciAdresi);
}

/**
 * Gidecegi ulke = varis limaninin ulkesi. Once ulke adi aranir, yoksa bilinen
 * liman adindan (MARIEL -> KUBA). Hicbiri yoksa null.
 */
export function gidecegiUlke(varisLimani: string | null | undefined): string | null {
  if (!varisLimani || !varisLimani.trim()) return null;
  const ulke = ulkeBul(varisLimani);
  if (ulke) return ulke;
  const s = ` ${normalize(varisLimani)} `;
  for (const [liman, u] of Object.entries(LIMAN_ULKE)) {
    if (s.includes(` ${normalize(liman)} `)) return u;
  }
  return null;
}

/**
 * 24.11.2026: Fatura talimatinda varis limani ULKESIYLE: metinde ulke zaten yaziyorsa (orn. "TEMA PORT, GHANA") AYNEN;
 * yoksa bilinen limanin ulkesi eklenir ("ASHDOD PORT" -> "ASHDOD PORT, İSRAİL"); bulunamazsa aynen. Bos ise null.
 */
export function varisLimaniUlkeli(varisLimani: string | null | undefined): string | null {
  const v = (varisLimani || "").trim();
  if (!v) return null;
  // Ulke, liman adindan SONRA yaziyorsa ("BEIRUT PORT LEBANON", "TEMA PORT, GHANA") aynen birakilir.
  // Liman adi ulkeyle ayni oldugunda ("DJIBOUTI PORT") ulke ayrica yazilir: "DJIBOUTI PORT, CİBUTİ".
  const m = v.match(/^(.*?\b(?:PORT|LIMANI|LİMANI|Limanı)\b)(.*)$/i);
  const kalan = m ? m[2] : v;
  if (kalan.trim() && ulkeBul(kalan)) return v;
  const u = gidecegiUlke(v);
  if (u && !m && ulkeBul(v)) return v; // yalniz ulke/sehir-devlet adi ("SİNGAPUR"): tekrar yazilmaz
  return u ? `${v}, ${u}` : v;
}

/** Bilinen ulkelerin Turkce adlari (elle secim listesi). */
export const ULKE_ADLARI: string[] = ULKELER.map((x) => x[0]).sort((a, b) => a.localeCompare(b, "tr"));

/**
 * 20.11.2026 (kullanici: "ticaret yapilan ulkeyi manuel revize edebilmeliyiz"): dosyada elle girilen ulke
 * (ihracat_dosyalari.ticaret_ulkesi) varsa o, yoksa alici adresinden bulunan. Elle yazim bilinen bir ulkeye
 * karsilik geliyorsa Turkce adina cevrilir ("Suriname" -> "SURİNAM"); bilinmiyorsa buyuk harfle aynen kullanilir.
 */
export function dosyaTicaretUlkesi(elle: string | null | undefined, aliciAdresi: string | null | undefined): string | null {
  const e = (elle || "").trim();
  if (e) return ulkeBul(e) || e.toLocaleUpperCase("tr-TR");
  return ticaretYapilanUlke(aliciAdresi);
}

/** Adresten ulke bulunamazsa fatura talimatinda gorunen uyari (tahmin yerine). */
export const TICARET_ULKESI_BELIRSIZ = "BELIRLENEMEDI - alici adresini kontrol edin";

/** Mailto govdesi ASCII kurali icin (CLAUDE.md): "İSPANYA" -> "ISPANYA". */
export function asciiYap(metin: string): string {
  return sadelestir(metin);
}
