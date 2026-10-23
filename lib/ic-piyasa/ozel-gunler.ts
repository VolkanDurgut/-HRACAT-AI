/**
 * lib/ic-piyasa/ozel-gunler.ts
 *
 * Fiyat Bilgilendirme Formunda otomatik cikan ozel gun bandi (12.10.2026).
 * Kullanici karari: milli bayramlar + yilbasi, dini bayramlar ve kandiller.
 * (Sektor gunleri -14 Mayis, 16 Ekim- secilmedi; istenirse SABIT_GUNLER'e
 * eklenir.)
 *
 * Kural (REVIZE 23.10.2026, kullanici: "belgeyi pazartesi ilettigimizde 29 Ekim
 * haftasina giriyor diye insanlarin onceden bayramini kutlayamayiz"):
 *  - KUTLAMA sadece formun ONAY GUNU ozel gunun kendisiyse (cok gunlu bayramda
 *    bayram suresince). Onceden "kutlu olsun" YAZILMAZ.
 *  - Onay gunu + 6 gun icindeki RESMI TATILLER icin kurumsal bilgi satiri
 *    ("... nedeniyle resmi tatildir. Siparis ve sevkiyat planlamanizda dikkate
 *    almanizi rica ederiz."). Arife yarim gunu (28 Ekim, Ramazan/Kurban arifesi,
 *    13.00'ten itibaren) metne yazilir. Form hangi gun iletilirse iletilsin dogru kalir.
 *  - Kandiller resmi tatil degildir: sadece o gun kutlama, bilgi satiri yok.
 *  - En fazla 2 satir (once kutlama). Hesap onay gunune bagli -> ayni form her
 *    indirildiginde ayni bant (PDF / gorsel / panel ayni fonksiyondan).
 *
 * Milli bayramlar ve yilbasi her yil kendiliginden uretilir. Dini bayram ve
 * kandil tarihleri ay takvimine bagli oldugu icin ELLE girilir; kaynak Diyanet
 * dini gunler takvimi (12.10.2026'da iki ayri yayinda karsilastirildi, birebir).
 * DINI_KAPSAM_SONU yaklasinca panel uyari verir -> bir sonraki yilin tarihleri
 * Diyanet takviminden eklenir.
 */

export type OzelGunTur = "milli" | "dini" | "kandil";

export type OzelGun = {
  /** Ilk gun (YYYY-MM-DD). Kandilde: kandil gecesinin tarihi. */
  tarih: string;
  /** Cok gunlu bayramlarda son gun (dahil). */
  bitis?: string;
  ad: string;
  tur: OzelGunTur;
  /** Forma basilan kutlama cumlesi (kurumsal dil). */
  mesaj: string;
  /** Telefon gorseli icin kisa hali (yoksa mesaj kullanilir). */
  kisa?: string;
  /** false: kutlama yazilmaz (ör. 15 Temmuz anma gunu, 1 Mayis). Varsayilan true. */
  kutlama?: boolean;
  /** Resmi tatilse bilgi satirindaki adi ("Cumhuriyet Bayramı"). Yoksa tatil degil. */
  tatilAd?: string;
  /** Arife (yarim gun, 13.00'ten itibaren resmi tatil) YYYY-MM-DD. */
  arife?: string;
};

/** Banda yazilacak tek satir (PDF, telefon gorseli ve panel ayni listeyi kullanir). */
export type OzelGunSatiri = {
  tur: "kutlama" | "tatil";
  gun: OzelGun;
  /** PDF'teki uzun kurumsal metin. */
  metin: string;
  /** Telefon gorselindeki kisa metin. */
  kisa: string;
  /** Telefon gorselinde ve panelde saga yazilan tarih. */
  tarihYazi: string;
};

/** Her yil ayni gun olan milli bayramlar + yilbasi (AA-GG). */
// 2429 sayili Ulusal Bayram ve Genel Tatiller Kanunu: 1 Mayis ve 15 Temmuz resmi
// tatildir ama kutlama yazilmaz (bilgi satiri cikar). 28 Ekim 13.00'ten itibaren yarim gun.
const SABIT_GUNLER: { ay_gun: string; ad: string; mesaj: string; kisa?: string; kutlama?: boolean; tatilAd: string; arife_ay_gun?: string }[] = [
  { ay_gun: "01-01", ad: "Yeni Yıl", mesaj: "Yeni yılınızı kutlar, sağlık, huzur ve bereket dolu bir yıl dileriz.", kisa: "Yeni yılınız kutlu olsun.", tatilAd: "Yılbaşı" },
  { ay_gun: "04-23", ad: "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı", mesaj: "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı kutlu olsun.", tatilAd: "Ulusal Egemenlik ve Çocuk Bayramı" },
  { ay_gun: "05-01", ad: "1 Mayıs Emek ve Dayanışma Günü", mesaj: "", kutlama: false, tatilAd: "Emek ve Dayanışma Günü" },
  { ay_gun: "05-19", ad: "19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramı", mesaj: "19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramı kutlu olsun.", tatilAd: "Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
  { ay_gun: "07-15", ad: "15 Temmuz Demokrasi ve Millî Birlik Günü", mesaj: "", kutlama: false, tatilAd: "Demokrasi ve Millî Birlik Günü" },
  { ay_gun: "08-30", ad: "30 Ağustos Zafer Bayramı", mesaj: "30 Ağustos Zafer Bayramı kutlu olsun.", tatilAd: "Zafer Bayramı" },
  { ay_gun: "10-29", ad: "29 Ekim Cumhuriyet Bayramı", mesaj: "29 Ekim Cumhuriyet Bayramımız kutlu olsun.", tatilAd: "Cumhuriyet Bayramı", arife_ay_gun: "10-28" },
];

const RAMAZAN = "Ramazan Bayramınızı en içten dileklerimizle kutlar, sağlık ve huzur dolu nice bayramlar dileriz.";
const KURBAN = "Kurban Bayramınızı en içten dileklerimizle kutlar, sağlık ve huzur dolu nice bayramlar dileriz.";

/**
 * Dini bayramlar ve kandiller (Diyanet takvimi). 2026'nin gecmis tarihleri
 * de tutarli olsun diye listede (eski formlar yeniden indirildiginde ayni bant).
 */
/** Bir onceki gun (arife). gunEkle hoisting'e guvenmemek icin ayri ve basit. */
function gunOnce(gun: string): string {
  const d = new Date(`${gun}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const DINI_GUNLER: OzelGun[] = [
  // 2026
  { tarih: "2026-01-15", ad: "Miraç Kandili", tur: "kandil", mesaj: "Miraç Kandiliniz mübarek olsun." },
  { tarih: "2026-02-02", ad: "Berat Kandili", tur: "kandil", mesaj: "Berat Kandiliniz mübarek olsun." },
  { tarih: "2026-03-16", ad: "Kadir Gecesi", tur: "kandil", mesaj: "Kadir Geceniz mübarek olsun." },
  { tarih: "2026-03-20", bitis: "2026-03-22", ad: "Ramazan Bayramı", tur: "dini", tatilAd: "Ramazan Bayramı", arife: gunOnce("2026-03-20"), mesaj: RAMAZAN, kisa: "Ramazan Bayramınız mübarek olsun." },
  { tarih: "2026-05-27", bitis: "2026-05-30", ad: "Kurban Bayramı", tur: "dini", tatilAd: "Kurban Bayramı", arife: gunOnce("2026-05-27"), mesaj: KURBAN, kisa: "Kurban Bayramınız mübarek olsun." },
  { tarih: "2026-08-24", ad: "Mevlid Kandili", tur: "kandil", mesaj: "Mevlid Kandiliniz mübarek olsun." },
  { tarih: "2026-12-10", ad: "Regaip Kandili", tur: "kandil", mesaj: "Regaip Kandiliniz mübarek olsun." },
  // 2027
  { tarih: "2027-01-04", ad: "Miraç Kandili", tur: "kandil", mesaj: "Miraç Kandiliniz mübarek olsun." },
  { tarih: "2027-01-22", ad: "Berat Kandili", tur: "kandil", mesaj: "Berat Kandiliniz mübarek olsun." },
  { tarih: "2027-03-05", ad: "Kadir Gecesi", tur: "kandil", mesaj: "Kadir Geceniz mübarek olsun." },
  { tarih: "2027-03-09", bitis: "2027-03-11", ad: "Ramazan Bayramı", tur: "dini", tatilAd: "Ramazan Bayramı", arife: gunOnce("2027-03-09"), mesaj: RAMAZAN, kisa: "Ramazan Bayramınız mübarek olsun." },
  { tarih: "2027-05-16", bitis: "2027-05-19", ad: "Kurban Bayramı", tur: "dini", tatilAd: "Kurban Bayramı", arife: gunOnce("2027-05-16"), mesaj: KURBAN, kisa: "Kurban Bayramınız mübarek olsun." },
  { tarih: "2027-08-13", ad: "Mevlid Kandili", tur: "kandil", mesaj: "Mevlid Kandiliniz mübarek olsun." },
  { tarih: "2027-12-02", ad: "Regaip Kandili", tur: "kandil", mesaj: "Regaip Kandiliniz mübarek olsun." },
  { tarih: "2027-12-24", ad: "Miraç Kandili", tur: "kandil", mesaj: "Miraç Kandiliniz mübarek olsun." },
];

/** Dini gun listesinin kapsadigi son tarih. Sonrasi icin Diyanet takvimi eklenmeli. */
export const DINI_KAPSAM_SONU = "2027-12-31";

/** Formun kapsadigi gun sayisi (onay gunu dahil 7 gun). */
const PENCERE_GUN = 7;
const AZAMI_GOSTERIM = 2;

/** "YYYY-MM-DD" + n gun (UTC uzerinden, saat dilimi kaymasi yok). */
export function gunEkle(gun: string, n: number): string {
  const d = new Date(`${gun.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Zaman damgasinin Turkiye takvimindeki gunu (YYYY-MM-DD). */
export function trGunu(ts: string | Date): string {
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

function yilinSabitGunleri(yil: number): OzelGun[] {
  return SABIT_GUNLER.map((s) => ({
    tarih: `${yil}-${s.ay_gun}`, ad: s.ad, tur: "milli" as const, mesaj: s.mesaj, kisa: s.kisa,
    kutlama: s.kutlama, tatilAd: s.tatilAd, arife: s.arife_ay_gun ? `${yil}-${s.arife_ay_gun}` : undefined,
  }));
}

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const HAFTA_GUNLERI = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

/** "2026-10-29" -> "29 Ekim Perşembe" */
function gunAyHafta(gun: string): string {
  const [, a, d] = gun.split("-").map(Number);
  return `${d} ${AYLAR[a - 1]} ${HAFTA_GUNLERI[new Date(`${gun}T00:00:00Z`).getUTCDay()]}`;
}

/** "2026-03-20".."2026-03-22" -> "20–22 Mart"; ay degisirse "31 Mart – 2 Nisan". */
function aralikYazi(bas: string, bit: string): string {
  const [, a1, d1] = bas.split("-").map(Number);
  const [, a2, d2] = bit.split("-").map(Number);
  return a1 === a2 ? `${d1}–${d2} ${AYLAR[a1 - 1]}` : `${d1} ${AYLAR[a1 - 1]} – ${d2} ${AYLAR[a2 - 1]}`;
}

const TATIL_RICA = "Sipariş ve sevkiyat planlamanızda dikkate almanızı rica ederiz.";

function tatilSatiri(g: OzelGun): OzelGunSatiri {
  const cokGun = !!g.bitis && g.bitis !== g.tarih;
  const gunler = cokGun ? `${aralikYazi(g.tarih, g.bitis!)} tarihlerinde` : `${gunAyHafta(g.tarih)} günü`;
  const arife = g.arife ? `${gunAyHafta(g.arife)} 13.00'ten itibaren ve ` : "";
  return {
    tur: "tatil",
    gun: g,
    metin: `${arife}${gunler} ${g.tatilAd} nedeniyle resmî tatildir. ${TATIL_RICA}`,
    kisa: `${g.tatilAd} · resmî tatil${g.arife ? " (arife yarım gün)" : ""}`,
    tarihYazi: cokGun ? `${aralikYazi(g.tarih, g.bitis!)} ${g.tarih.slice(0, 4)}` : gunAyHafta(g.tarih),
  };
}

/**
 * Onay gunu verilen formun ozel gun bandi (en fazla 2 satir, once kutlama).
 * Kutlama: onay gunu ozel gunun icinde. Bilgi: [onay, onay+6] ile tatil
 * araligi (arife dahil) kesisiyor ve o gun icin kutlama yazilmadi.
 */
export function formOzelGunSatirlari(onayGunu: string): OzelGunSatiri[] {
  const bas = onayGunu.slice(0, 10);
  const son = gunEkle(bas, PENCERE_GUN - 1);
  const yil = Number(bas.slice(0, 4));
  const adaylar = [...yilinSabitGunleri(yil - 1), ...yilinSabitGunleri(yil), ...yilinSabitGunleri(yil + 1), ...DINI_GUNLER]
    .sort((a, b) => a.tarih.localeCompare(b.tarih));

  const kutlamalar = adaylar.filter((g) => g.kutlama !== false && !!g.mesaj && g.tarih <= bas && (g.bitis || g.tarih) >= bas);
  const tatiller = adaylar.filter((g) =>
    !!g.tatilAd && !kutlamalar.includes(g) && (g.arife || g.tarih) <= son && (g.bitis || g.tarih) >= bas);

  const satirlar: OzelGunSatiri[] = [
    ...kutlamalar.map((g) => ({ tur: "kutlama" as const, gun: g, metin: g.mesaj, kisa: g.kisa || g.mesaj, tarihYazi: ozelGunTarihYazi(g) })),
    ...tatiller.map(tatilSatiri),
  ];
  return satirlar.slice(0, AZAMI_GOSTERIM);
}

/** "2027-03-09".."2027-03-11" -> "9–11 Mart 2027"; tek gun -> "10 Aralık 2026". */
export function ozelGunTarihYazi(g: OzelGun): string {
  const [y1, a1, d1] = g.tarih.split("-").map(Number);
  if (!g.bitis || g.bitis === g.tarih) return `${d1} ${AYLAR[a1 - 1]} ${y1}`;
  const [y2, a2, d2] = g.bitis.split("-").map(Number);
  if (y1 === y2 && a1 === a2) return `${d1}–${d2} ${AYLAR[a1 - 1]} ${y1}`;
  return `${d1} ${AYLAR[a1 - 1]} – ${d2} ${AYLAR[a2 - 1]} ${y2}`;
}

/**
 * Dini gun listesi bitmek uzereyse (60 gun kala) panelde gosterilecek uyari.
 * Bos donerse sorun yok.
 */
export function ozelGunKapsamUyarisi(bugun: string): string | null {
  if (bugun.slice(0, 10) < gunEkle(DINI_KAPSAM_SONU, -60)) return null;
  const sonrakiYil = Number(DINI_KAPSAM_SONU.slice(0, 4)) + 1;
  return `Formdaki dini bayram ve kandil tarihleri ${DINI_KAPSAM_SONU.slice(0, 4)} sonuna kadar tanımlı. ${sonrakiYil} tarihlerinin Diyanet takviminden eklenmesi gerekiyor (lib/ic-piyasa/ozel-gunler.ts).`;
}
