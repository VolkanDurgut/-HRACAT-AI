/**
 * PAZAR (UNEX Satis) - fuar musteri listesi ayristirma (10.11.2026). SAF modul (DOM yok; test edilebilir).
 *
 * Beklenen Excel (Gulfood listesi): her sayfa bir fuar donemi ("GULFOOD 2023 KASIM", "2022", ...).
 * Ilk satirlarda fuar adi ("GULFOOD"), ardindan baslik satiri:
 *   MUSTERI ADI | YETKILI ISIM | ILETISIM TELEFONU | ILETISIM MAIL | ULKESI
 * Sutunlar BASLIK METNINDEN bulunur (sira degisse de calisir).
 *
 * - Ulke: once Excel'deki ulke (yazim hatalari / sehir adlari dahil), yoksa telefon ulke kodundan.
 *   Ad: lib/ulke-bul.ts ile ayni Turkce buyuk harf ("BİRLEŞİK ARAP EMİRLİKLERİ") -> bayrak calisir.
 * - Telefon: "971506286285//97167432511", "WHATSAP : 9613432777" -> rakam dizileri; "WHATS" geciyorsa WhatsApp.
 * - E-posta: hucredeki her adres ayri; bicimi bozuk olan kaydedilir ama "duzeltilmeli" isaretlenir.
 * - Ayni firma (sunucudaki pazar_anahtar ile ayni anahtar) farkli yillarda tek kayitta birlesir.
 * Yapay zeka KULLANILMAZ (ucretsiz).
 */
import { ulkeBul } from "@/lib/ulke-bul";
import type { HucreDegeri, XlsxSayfasi } from "@/lib/xlsx-oku";

export type FuarKisi = { ad: string | null; eposta: string | null; eposta_gecerli: boolean; telefonlar: string[]; whatsapp: string | null };
export type FuarKatilim = { fuar: string; yil: number | null; donem: string | null; etiket: string; sayfa: string; satir: number };
export type FuarSatiri = {
  sayfa: string;
  satir: number;
  firma: string;
  yetkili: string;
  telefonHam: string;
  epostaHam: string;
  ulkeHam: string;
  katilim: FuarKatilim;
};
export type FuarFirma = {
  ad: string;
  anahtar: string;
  ulke: string | null;
  ulke_kaynagi: "excel" | "telefon" | "eposta" | null;
  ulke_ham: string | null;
  kisiler: FuarKisi[];
  katilimlar: FuarKatilim[];
};
export type FuarOkuma = { satirlar: FuarSatiri[]; sayfalar: { ad: string; etiket: string; satir: number }[]; uyarilar: string[] };

const AYLAR: [RegExp, string][] = [
  [/^OCAK$|^JAN(UARY)?$/, "Ocak"], [/^SUBAT$|^FEB(RUARY)?$/, "Şubat"], [/^MART$|^MAR(CH)?$/, "Mart"],
  [/^NISAN$|^APR(IL)?$/, "Nisan"], [/^MAYIS$|^MAY$/, "Mayıs"], [/^HAZIRAN$|^JUN(E)?$/, "Haziran"],
  [/^TEMMUZ$|^JUL(Y)?$/, "Temmuz"], [/^AGUSTOS$|^AUG(UST)?$/, "Ağustos"], [/^EYLUL$|^SEP(TEMBER)?$/, "Eylül"],
  [/^EKIM$|^OCT(OBER)?$/, "Ekim"], [/^KASIM$|^NOV(EMBER)?$/, "Kasım"], [/^ARALIK$|^DEC(EMBER)?$/, "Aralık"],
];

/** Turkce harfleri ASCII'ye, buyuk harfe; harf/rakam disi bosluk. */
export function sade(metin: string): string {
  return metin
    .replace(/İ/g, "I").replace(/ı/g, "I").replace(/Ş/g, "S").replace(/ş/g, "S").replace(/Ğ/g, "G").replace(/ğ/g, "G")
    .replace(/Ü/g, "U").replace(/ü/g, "U").replace(/Ö/g, "O").replace(/ö/g, "O").replace(/Ç/g, "C").replace(/ç/g, "C")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9@.]+/g, " ")
    .trim();
}

function yazi(v: HucreDegeri | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v).replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Ulke
// ---------------------------------------------------------------------------

/** lib/ulke-bul.ts'in tanimadigi yazimlar / sehirler -> ayni Turkce ad. Anahtar: sade(). */
const EK_ULKE: Record<string, string> = {
  DUABI: "BİRLEŞİK ARAP EMİRLİKLERİ", "BURJ KHALIFA": "BİRLEŞİK ARAP EMİRLİKLERİ", "JEBEL ALI": "BİRLEŞİK ARAP EMİRLİKLERİ",
  AJMAN: "BİRLEŞİK ARAP EMİRLİKLERİ", "RAS AL KHAIMAH": "BİRLEŞİK ARAP EMİRLİKLERİ", EMIRATES: "BİRLEŞİK ARAP EMİRLİKLERİ",
  BAE: "BİRLEŞİK ARAP EMİRLİKLERİ", DUBAY: "BİRLEŞİK ARAP EMİRLİKLERİ",
  IINDIA: "HİNDİSTAN", BANGLADSESH: "BANGLADEŞ", BURNDI: "BURUNDİ", "BURUNA TASO": "BURKİNA FASO",
  COLOMBO: "SRİ LANKA", "DAR ES SALAAM": "TANZANYA", "DOM REP": "DOMİNİK CUMHURİYETİ", DOUALA: "KAMERUN",
  EDINBURGH: "BİRLEŞİK KRALLIK", LONDON: "BİRLEŞİK KRALLIK", LONDRA: "BİRLEŞİK KRALLIK", SCOTLAND: "BİRLEŞİK KRALLIK",
  FRANSIZ: "FRANSA", TURKIYE: "TÜRKİYE", ISTANBUL: "TÜRKİYE", KONYA: "TÜRKİYE", MERSIN: "TÜRKİYE", TURKEY: "TÜRKİYE",
  KARACHI: "PAKİSTAN", KIEV: "UKRAYNA", KYIV: "UKRAYNA", ODESSA: "UKRAYNA", ODESA: "UKRAYNA",
  KIGALI: "RUANDA", KOMOR: "KOMORLAR", MOGADISHU: "SOMALİ", MOGADISCIO: "SOMALİ", HARGEISA: "SOMALİ", BERBERA: "SOMALİ",
  BOSASO: "SOMALİ", MOMBASA: "KENYA", NAIROBI: "KENYA", MIAMI: "AMERİKA BİRLEŞİK DEVLETLERİ", ABD: "AMERİKA BİRLEŞİK DEVLETLERİ",
  ROSTOV: "RUSYA", RUS: "RUSYA", MOSCOW: "RUSYA", MOSKOVA: "RUSYA", SARAWAK: "MALEZYA", SUVA: "FİJİ", FIJI: "FİJİ",
  SIRBIA: "SIRBİSTAN", SERBIA: "SIRBİSTAN", SIRBISTAN: "SIRBİSTAN", URGUAY: "URUGUAY", VENEZUELLA: "VENEZUELA",
  OZBEKISTAN: "ÖZBEKİSTAN", UZBEKISTAN: "ÖZBEKİSTAN", NEPAL: "NEPAL", ADEN: "YEMEN", ASHDOD: "İSRAİL", JUBA: "GÜNEY SUDAN",
  MARADI: "NİJER", KONYO: "KONGO", LOME: "TOGO", COTONOU: "BENİN", BAMAKO: "MALİ", DAKAR: "SENEGAL", KAMPALA: "UGANDA",
  ERBIL: "IRAK", "PORT SUDAN": "SUDAN", BULGARIA: "BULGARİSTAN", SAUDI: "SUUDİ ARABİSTAN", SUUDI: "SUUDİ ARABİSTAN",
  KAZAKISTAN: "KAZAKİSTAN", KAZAKHSTAN: "KAZAKİSTAN", MOGOLISTAN: "MOĞOLİSTAN", MONGOLIA: "MOĞOLİSTAN",
};
/** Kelime basi eslesmesi (ekli yazimlar: "MALDİVLERDE OTELLERE ..."). */
const ONEK_ULKE: [string, string][] = [["MALDIV", "MALDİVLER"], ["ETIYOP", "ETİYOPYA"], ["SOMAL", "SOMALİ"]];

/** Tek parca metinden ulke: once ek yazimlar (soldan, en uzun kalip), sonra lib/ulke-bul, sonra kelime basi. */
function parcaUlkesi(parca: string): string | null {
  const s = sade(parca).replace(/[@.]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const kelimeler = s.split(" ");
  for (let i = 0; i < kelimeler.length; i++) {
    for (let n = Math.min(3, kelimeler.length - i); n >= 1; n--) {
      const u = EK_ULKE[kelimeler.slice(i, i + n).join(" ")];
      if (u) return u;
    }
  }
  const u = ulkeBul(s);
  if (u) return u;
  for (const k of kelimeler) for (const [onek, ulke] of ONEK_ULKE) if (k.startsWith(onek)) return ulke;
  return null;
}

/** Excel ULKESI hucresi: "SOMALİ // ETİYOPYA", "IRAK-ERBIL", "UAE / JORDAN" -> ilk taninan ulke. */
export function excelUlkesi(ham: string): string | null {
  const t = (ham || "").trim();
  if (!t) return null;
  for (const parca of t.split(/\/\/|\/|,|;|\s-\s|-|\|/)) {
    const u = parcaUlkesi(parca);
    if (u) return u;
  }
  return null;
}

/** ITU ulke telefon kodlari -> Turkce ad (lib/ulke-bul ile ayni yazim; listede olmayanlar bayraksiz). */
const TELEFON_KODU: Record<string, string> = {
  "1": "AMERİKA BİRLEŞİK DEVLETLERİ", "1809": "DOMİNİK CUMHURİYETİ", "1829": "DOMİNİK CUMHURİYETİ", "1849": "DOMİNİK CUMHURİYETİ",
  "1876": "JAMAİKA", "7": "RUSYA", "76": "KAZAKİSTAN", "77": "KAZAKİSTAN",
  "20": "MISIR", "27": "GÜNEY AFRİKA", "30": "YUNANİSTAN", "31": "HOLLANDA", "32": "BELÇİKA", "33": "FRANSA", "34": "İSPANYA",
  "36": "MACARİSTAN", "39": "İTALYA", "40": "ROMANYA", "41": "İSVİÇRE", "43": "AVUSTURYA", "44": "BİRLEŞİK KRALLIK",
  "45": "DANİMARKA", "46": "İSVEÇ", "47": "NORVEÇ", "48": "POLONYA", "49": "ALMANYA", "51": "PERU", "52": "MEKSİKA",
  "53": "KÜBA", "54": "ARJANTİN", "55": "BREZİLYA", "56": "ŞİLİ", "57": "KOLOMBİYA", "58": "VENEZUELA", "60": "MALEZYA",
  "61": "AVUSTRALYA", "62": "ENDONEZYA", "63": "FİLİPİNLER", "64": "YENİ ZELANDA", "65": "SİNGAPUR", "66": "TAYLAND",
  "81": "JAPONYA", "82": "GÜNEY KORE", "84": "VİETNAM", "86": "ÇİN", "90": "TÜRKİYE", "91": "HİNDİSTAN", "92": "PAKİSTAN",
  "93": "AFGANİSTAN", "94": "SRİ LANKA", "95": "MYANMAR", "98": "İRAN",
  "211": "GÜNEY SUDAN", "212": "FAS", "213": "CEZAYİR", "216": "TUNUS", "218": "LİBYA", "220": "GAMBİYA", "221": "SENEGAL",
  "222": "MORİTANYA", "223": "MALİ", "224": "GİNE", "225": "FİLDİŞİ SAHİLİ", "226": "BURKİNA FASO", "227": "NİJER",
  "228": "TOGO", "229": "BENİN", "230": "MAURİTİUS", "231": "LİBERYA", "232": "SİERRA LEONE", "233": "GANA", "234": "NİJERYA",
  "235": "ÇAD", "236": "ORTA AFRİKA CUMHURİYETİ", "237": "KAMERUN", "238": "CABO VERDE", "239": "SAO TOME VE PRINCIPE",
  "240": "EKVATOR GİNESİ", "241": "GABON", "242": "KONGO", "243": "KONGO DEMOKRATİK CUMHURİYETİ", "244": "ANGOLA",
  "245": "GİNE-BİSSAU", "248": "SEYŞELLER", "249": "SUDAN", "250": "RUANDA", "251": "ETİYOPYA", "252": "SOMALİ", "253": "CİBUTİ",
  "254": "KENYA", "255": "TANZANYA", "256": "UGANDA", "257": "BURUNDİ", "258": "MOZAMBİK", "260": "ZAMBİYA", "261": "MADAGASKAR",
  "263": "ZİMBABVE", "264": "NAMİBYA", "265": "MALAVİ", "266": "LESOTHO", "267": "BOTSVANA", "268": "ESVATİNİ", "269": "KOMORLAR",
  "291": "ERİTRE", "351": "PORTEKİZ", "352": "LÜKSEMBURG", "353": "İRLANDA", "354": "İZLANDA", "355": "ARNAVUTLUK", "356": "MALTA",
  "357": "KIBRIS", "358": "FİNLANDİYA", "359": "BULGARİSTAN", "370": "LİTVANYA", "371": "LETONYA", "372": "ESTONYA", "373": "MOLDOVA",
  "374": "ERMENİSTAN", "375": "BELARUS", "380": "UKRAYNA", "381": "SIRBİSTAN", "382": "KARADAĞ", "383": "KOSOVA", "385": "HIRVATİSTAN",
  "386": "SLOVENYA", "387": "BOSNA-HERSEK", "389": "KUZEY MAKEDONYA", "420": "ÇEKYA", "421": "SLOVAKYA",
  "501": "BELİZE", "502": "GUATEMALA", "503": "EL SALVADOR", "504": "HONDURAS", "505": "NİKARAGUA", "506": "KOSTA RİKA",
  "507": "PANAMA", "509": "HAİTİ", "591": "BOLİVYA", "592": "GUYANA", "593": "EKVADOR", "595": "PARAGUAY", "597": "SURİNAM",
  "598": "URUGUAY", "673": "BRUNEY", "675": "PAPUA YENİ GİNE", "679": "FİJİ", "852": "HONG KONG", "853": "MAKAO", "855": "KAMBOÇYA",
  "856": "LAOS", "880": "BANGLADEŞ", "886": "TAYVAN", "960": "MALDİVLER", "961": "LÜBNAN", "962": "ÜRDÜN", "963": "SURİYE",
  "964": "IRAK", "965": "KUVEYT", "966": "SUUDİ ARABİSTAN", "967": "YEMEN", "968": "UMMAN", "970": "FİLİSTİN",
  "971": "BİRLEŞİK ARAP EMİRLİKLERİ", "972": "İSRAİL", "973": "BAHREYN", "974": "KATAR", "975": "BUTAN", "976": "MOĞOLİSTAN",
  "977": "NEPAL", "992": "TACİKİSTAN", "993": "TÜRKMENİSTAN", "994": "AZERBAYCAN", "995": "GÜRCİSTAN", "996": "KIRGIZİSTAN",
  "998": "ÖZBEKİSTAN",
};

/**
 * Numaradan ulke (en uzun kod eslesmesi). Turkiye yerel bicimleri once: "05xx xxx xx xx" / "0212 ..." (11 hane)
 * ve basinda 0'siz 10 haneli "5xx..." cep (listede cok; +53 Kuba / +55 Brezilya sanilmasin).
 * Diger yerel numara (0 ile) ya da 10 haneden kisa -> null (tahmin edilmez).
 */
export function telefonUlkesi(numara: string | null | undefined): string | null {
  let n = (numara || "").replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (/^0[2-5]\d{9}$/.test(n) || /^5\d{9}$/.test(n)) return "TÜRKİYE";
  if (n.length < 10 || n.startsWith("0")) return null;
  for (let u = 4; u >= 1; u--) {
    const k = TELEFON_KODU[n.slice(0, u)];
    if (k) return k;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Telefon / e-posta
// ---------------------------------------------------------------------------

/** Hucredeki numaralar: ayiricilar //, /, ;, ",", "|", yeni satir, " - ". Her parca 7-15 rakam. */
export function telefonlariAyir(ham: string): { telefonlar: string[]; whatsapp: string | null } {
  const telefonlar: string[] = [];
  let whatsapp: string | null = null;
  for (const parca of (ham || "").split(/\/\/|\/|;|,|\||\n|\s-\s|\s{3,}/)) {
    let n = parca.replace(/\D/g, "");
    if (n.startsWith("00")) n = n.slice(2);
    if (n.length < 7 || n.length > 15) continue;
    if (!telefonlar.includes(n)) telefonlar.push(n);
    if (!whatsapp && /WHATS|WATS|WHTS|WA\s*:/i.test(parca)) whatsapp = n;
  }
  return { telefonlar, whatsapp: whatsapp || null };
}

const EPOSTA_GECERLI = /^[A-Z0-9._%+'-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)*\.[A-Z]{2,}$/i;

/** Hucredeki e-postalar (bosluk, //, /, ;, "," ile ayrilmis). Gecersiz olan da doner (gecerli:false). */
export function epostalariAyir(ham: string): { eposta: string; gecerli: boolean }[] {
  const sonuc: { eposta: string; gecerli: boolean }[] = [];
  for (const parca of (ham || "").split(/\/\/|\s\/\s|;|,|\s+/)) {
    // Turkce klavye / Excel buyuk-kucuk harf donusumu: "gmaıl" -> "gmail", "İ" -> "i" (birlesik nokta atilir)
    const e = parca.trim().replace(/^mailto:/i, "").replace(/^[<(]+|[>).]+$/g, "").toLowerCase()
      .replace(/ı/g, "i").replace(/\u0307/g, "").replace(/[\u200b-\u200d\ufeff]/g, "");
    if (!e || !e.includes("@")) continue;
    if (sonuc.some((x) => x.eposta === e)) continue;
    sonuc.push({ eposta: e, gecerli: EPOSTA_GECERLI.test(e) });
  }
  if (sonuc.length === 0 && (ham || "").trim().length > 3 && /[a-z]/i.test(ham)) {
    // "@" olmayan ama doldurulmus hucre: bozuk e-posta olarak saklanir (kaybolmasin)
    sonuc.push({ eposta: ham.trim().toLowerCase().slice(0, 200), gecerli: false });
  }
  return sonuc;
}

// ---------------------------------------------------------------------------
// Sayfa okuma
// ---------------------------------------------------------------------------

type Sutunlar = { firma: number; yetkili?: number; telefon?: number; eposta?: number; ulke?: number };

function baslikSutunlari(h: HucreDegeri[]): Sutunlar | null {
  const s: Partial<Sutunlar> = {};
  h.forEach((v, i) => {
    const a = sade(yazi(v)).replace(/\s+/g, " ");
    if (!a) return;
    if (s.firma === undefined && /^(MUSTERI|FIRMA|COMPANY|CUSTOMER)/.test(a)) s.firma = i;
    else if (s.yetkili === undefined && /^(YETKILI|CONTACT|ISIM|NAME)/.test(a)) s.yetkili = i;
    else if (s.telefon === undefined && /(TELEFON|PHONE|TEL\b|GSM|MOBILE)/.test(a)) s.telefon = i;
    else if (s.eposta === undefined && /(MAIL|E POSTA|EPOSTA)/.test(a)) s.eposta = i;
    else if (s.ulke === undefined && /^(ULKE|COUNTRY)/.test(a)) s.ulke = i;
  });
  return s.firma === undefined ? null : (s as Sutunlar);
}

/** Sayfa adi + baslik ustundeki metin -> fuar / yil / donem / etiket. */
export function sayfaFuarBilgisi(sayfaAdi: string, ustMetin: string): Omit<FuarKatilim, "sayfa" | "satir"> {
  const kaynak = `${sayfaAdi} ${ustMetin}`;
  const kelimeler = Array.from(new Set(sade(kaynak).replace(/[@.]/g, " ").split(" ").filter(Boolean)));
  const yilEs = kaynak.match(/\b(19|20)\d{2}\b/);
  const yil = yilEs ? Number(yilEs[0]) : null;
  let donem: string | null = null;
  for (const k of kelimeler) {
    const a = AYLAR.find(([re]) => re.test(k));
    if (a) { donem = a[1]; break; }
  }
  const fuarKelimeleri = kelimeler.filter((k) => !/^\d+$/.test(k) && !AYLAR.some(([re]) => re.test(k)) && k !== "FUAR" && k !== "LISTESI");
  const fuarHam = fuarKelimeleri.join(" ").trim();
  const fuar = fuarHam ? fuarHam.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : "Fuar";
  const etiket = [fuar, yil, donem].filter(Boolean).join(" ");
  return { fuar, yil, donem, etiket };
}

export function fuarSayfalariniOku(sayfalar: XlsxSayfasi[]): FuarOkuma {
  const satirlar: FuarSatiri[] = [];
  const okunan: FuarOkuma["sayfalar"] = [];
  const uyarilar: string[] = [];
  for (const sayfa of sayfalar) {
    let baslikNo = -1;
    let sutun: Sutunlar | null = null;
    for (let r = 0; r < Math.min(10, sayfa.satirlar.length) && baslikNo < 0; r++) {
      const s = baslikSutunlari(sayfa.satirlar[r] || []);
      if (s && (s.eposta !== undefined || s.telefon !== undefined)) { baslikNo = r; sutun = s; }
    }
    if (baslikNo < 0 || !sutun) {
      if (sayfa.satirlar.some((x) => x && x.some((v) => yazi(v)))) uyarilar.push(`"${sayfa.ad}" sayfasında "MÜŞTERİ ADI" başlığı bulunamadı; atlandı.`);
      continue;
    }
    const ustMetin = sayfa.satirlar.slice(0, baslikNo).map((x) => (x || []).map(yazi).filter(Boolean).join(" ")).join(" ");
    const bilgi = sayfaFuarBilgisi(sayfa.ad, ustMetin);
    let adet = 0;
    for (let r = baslikNo + 1; r < sayfa.satirlar.length; r++) {
      const h = sayfa.satirlar[r] || [];
      const al = (i?: number) => (i === undefined ? "" : yazi(h[i]));
      const firma = al(sutun.firma);
      const yetkili = al(sutun.yetkili);
      const telefonHam = al(sutun.telefon);
      const epostaHam = al(sutun.eposta);
      const ulkeHam = al(sutun.ulke);
      if (!firma && !yetkili && !telefonHam && !epostaHam) continue;
      if (!firma) { uyarilar.push(`"${sayfa.ad}" satır ${r + 1}: firma adı boş; atlandı.`); continue; }
      adet++;
      satirlar.push({ sayfa: sayfa.ad, satir: r + 1, firma, yetkili, telefonHam, epostaHam, ulkeHam, katilim: { ...bilgi, sayfa: sayfa.ad, satir: r + 1 } });
    }
    okunan.push({ ad: sayfa.ad, etiket: bilgi.etiket, satir: adet });
  }
  if (satirlar.length === 0) throw new Error(uyarilar[0] || "Excel'de okunabilir müşteri satırı bulunamadı.");
  return { satirlar, sayfalar: okunan, uyarilar };
}

// ---------------------------------------------------------------------------
// Birlestirme (anahtar sunucudan: pazar_anahtarlar RPC)
// ---------------------------------------------------------------------------

function kisiEkle(liste: FuarKisi[], yeni: FuarKisi) {
  const ayni = liste.find((k) =>
    (yeni.eposta && k.eposta === yeni.eposta) ||
    (!yeni.eposta && yeni.telefonlar.some((t) => k.telefonlar.includes(t))));
  if (!ayni) { liste.push(yeni); return; }
  if (!ayni.ad && yeni.ad) ayni.ad = yeni.ad;
  for (const t of yeni.telefonlar) if (!ayni.telefonlar.includes(t)) ayni.telefonlar.push(t);
  if (!ayni.whatsapp && yeni.whatsapp) ayni.whatsapp = yeni.whatsapp;
}

/** Satirlari firma anahtarina gore birlestirir. anahtarlar[i] = satirlar[i].firma icin sunucu anahtari. */
export function fuarFirmalariniBirlestir(satirlar: FuarSatiri[], anahtarlar: string[]): FuarFirma[] {
  // Yeni yil once: ad / ulke en guncel sayfadan
  const sira = satirlar.map((s, i) => ({ s, a: anahtarlar[i] || "" }))
    .filter((x) => x.a)
    .sort((x, y) => (y.s.katilim.yil || 0) - (x.s.katilim.yil || 0) || (y.s.katilim.donem ? 1 : 0) - (x.s.katilim.donem ? 1 : 0));
  const harita = new Map<string, FuarFirma>();
  for (const { s, a } of sira) {
    let f = harita.get(a);
    if (!f) {
      f = { ad: s.firma, anahtar: a, ulke: null, ulke_kaynagi: null, ulke_ham: null, kisiler: [], katilimlar: [] };
      harita.set(a, f);
    }
    if (!f.ulke) {
      const u = excelUlkesi(s.ulkeHam);
      if (u) { f.ulke = u; f.ulke_kaynagi = "excel"; f.ulke_ham = s.ulkeHam || null; }
    }
    if (!f.ulke_ham && s.ulkeHam) f.ulke_ham = s.ulkeHam;
    const { telefonlar, whatsapp } = telefonlariAyir(s.telefonHam);
    const epostalar = epostalariAyir(s.epostaHam);
    const yetkili = s.yetkili || null;
    if (epostalar.length === 0) {
      if (telefonlar.length || yetkili) kisiEkle(f.kisiler, { ad: yetkili, eposta: null, eposta_gecerli: true, telefonlar, whatsapp });
    } else {
      epostalar.forEach((e, i) => kisiEkle(f!.kisiler, { ad: yetkili, eposta: e.eposta, eposta_gecerli: e.gecerli, telefonlar: i === 0 ? telefonlar : [], whatsapp: i === 0 ? whatsapp : null }));
    }
    if (!f.katilimlar.some((k) => k.etiket === s.katilim.etiket)) f.katilimlar.push(s.katilim);
  }
  // Excel'de ulke yoksa: .tr uzantili e-posta -> Turkiye; degilse ilk taninan telefon numarasindan
  for (const f of Array.from(harita.values())) {
    if (f.ulke) continue;
    if (f.kisiler.some((k) => k.eposta_gecerli && /\.tr$/.test(k.eposta || ""))) { f.ulke = "TÜRKİYE"; f.ulke_kaynagi = "eposta"; continue; }
    for (const k of f.kisiler) {
      const u = k.telefonlar.map(telefonUlkesi).find(Boolean) || null;
      if (u) { f.ulke = u; f.ulke_kaynagi = "telefon"; break; }
    }
  }
  return Array.from(harita.values());
}

export type FuarOzeti = {
  satir: number;
  firma: number;
  birlesen: number; // birden fazla satirdan (yil) gelen firma
  kisi: number;
  bozukEposta: number;
  ulkeExcel: number;
  ulkeTelefon: number;
  ulkeYok: number;
};

export function fuarOzeti(satirSayisi: number, firmalar: FuarFirma[]): FuarOzeti {
  return {
    satir: satirSayisi,
    firma: firmalar.length,
    birlesen: firmalar.filter((f) => f.katilimlar.length > 1).length,
    kisi: firmalar.reduce((t, f) => t + f.kisiler.length, 0),
    bozukEposta: firmalar.reduce((t, f) => t + f.kisiler.filter((k) => k.eposta && !k.eposta_gecerli).length, 0),
    ulkeExcel: firmalar.filter((f) => f.ulke_kaynagi === "excel").length,
    ulkeTelefon: firmalar.filter((f) => f.ulke_kaynagi === "telefon" || f.ulke_kaynagi === "eposta").length,
    ulkeYok: firmalar.filter((f) => !f.ulke).length,
  };
}
