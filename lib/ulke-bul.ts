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
import { sadelestir } from "@/lib/liman-anahtari";

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

/** Adresten ulke bulunamazsa fatura talimatinda gorunen uyari (tahmin yerine). */
export const TICARET_ULKESI_BELIRSIZ = "BELIRLENEMEDI - alici adresini kontrol edin";

/** Mailto govdesi ASCII kurali icin (CLAUDE.md): "İSPANYA" -> "ISPANYA". */
export function asciiYap(metin: string): string {
  return sadelestir(metin);
}
