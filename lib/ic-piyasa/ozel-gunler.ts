/**
 * lib/ic-piyasa/ozel-gunler.ts
 *
 * Fiyat Bilgilendirme Formunda otomatik cikan kutlama bandi (12.10.2026).
 * Kullanici karari: milli bayramlar + yilbasi, dini bayramlar ve kandiller.
 * (Sektor gunleri -14 Mayis, 16 Ekim- secilmedi; istenirse SABIT_GUNLER'e
 * eklenir.)
 *
 * Kural: formun ONAY GUNU (Turkiye takvimi) ile sonraki 6 gun arasina (formun
 * kapsadigi hafta) denk gelen gunler banda girer; en fazla 2 tanesi gosterilir.
 * Hesap onay gunune bagli oldugu icin ayni form her indirildiginde ayni bandi
 * verir (PDF / gorsel / onizleme birbirinden sapmaz).
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
};

/** Her yil ayni gun olan milli bayramlar + yilbasi (AA-GG). */
const SABIT_GUNLER: { ay_gun: string; ad: string; mesaj: string; kisa?: string }[] = [
  { ay_gun: "01-01", ad: "Yeni Yıl", mesaj: "Yeni yılınızı kutlar, sağlık, huzur ve bereket dolu bir yıl dileriz.", kisa: "Yeni yılınız kutlu olsun." },
  { ay_gun: "04-23", ad: "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı", mesaj: "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı kutlu olsun." },
  { ay_gun: "05-19", ad: "19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramı", mesaj: "19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramı kutlu olsun." },
  { ay_gun: "08-30", ad: "30 Ağustos Zafer Bayramı", mesaj: "30 Ağustos Zafer Bayramı kutlu olsun." },
  { ay_gun: "10-29", ad: "29 Ekim Cumhuriyet Bayramı", mesaj: "29 Ekim Cumhuriyet Bayramımız kutlu olsun." },
];

const RAMAZAN = "Ramazan Bayramınızı en içten dileklerimizle kutlar, sağlık ve huzur dolu nice bayramlar dileriz.";
const KURBAN = "Kurban Bayramınızı en içten dileklerimizle kutlar, sağlık ve huzur dolu nice bayramlar dileriz.";

/**
 * Dini bayramlar ve kandiller (Diyanet takvimi). 2026'nin gecmis tarihleri
 * de tutarli olsun diye listede (eski formlar yeniden indirildiginde ayni bant).
 */
const DINI_GUNLER: OzelGun[] = [
  // 2026
  { tarih: "2026-01-15", ad: "Miraç Kandili", tur: "kandil", mesaj: "Miraç Kandiliniz mübarek olsun." },
  { tarih: "2026-02-02", ad: "Berat Kandili", tur: "kandil", mesaj: "Berat Kandiliniz mübarek olsun." },
  { tarih: "2026-03-16", ad: "Kadir Gecesi", tur: "kandil", mesaj: "Kadir Geceniz mübarek olsun." },
  { tarih: "2026-03-20", bitis: "2026-03-22", ad: "Ramazan Bayramı", tur: "dini", mesaj: RAMAZAN, kisa: "Ramazan Bayramınız mübarek olsun." },
  { tarih: "2026-05-27", bitis: "2026-05-30", ad: "Kurban Bayramı", tur: "dini", mesaj: KURBAN, kisa: "Kurban Bayramınız mübarek olsun." },
  { tarih: "2026-08-24", ad: "Mevlid Kandili", tur: "kandil", mesaj: "Mevlid Kandiliniz mübarek olsun." },
  { tarih: "2026-12-10", ad: "Regaip Kandili", tur: "kandil", mesaj: "Regaip Kandiliniz mübarek olsun." },
  // 2027
  { tarih: "2027-01-04", ad: "Miraç Kandili", tur: "kandil", mesaj: "Miraç Kandiliniz mübarek olsun." },
  { tarih: "2027-01-22", ad: "Berat Kandili", tur: "kandil", mesaj: "Berat Kandiliniz mübarek olsun." },
  { tarih: "2027-03-05", ad: "Kadir Gecesi", tur: "kandil", mesaj: "Kadir Geceniz mübarek olsun." },
  { tarih: "2027-03-09", bitis: "2027-03-11", ad: "Ramazan Bayramı", tur: "dini", mesaj: RAMAZAN, kisa: "Ramazan Bayramınız mübarek olsun." },
  { tarih: "2027-05-16", bitis: "2027-05-19", ad: "Kurban Bayramı", tur: "dini", mesaj: KURBAN, kisa: "Kurban Bayramınız mübarek olsun." },
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
  return SABIT_GUNLER.map((s) => ({ tarih: `${yil}-${s.ay_gun}`, ad: s.ad, tur: "milli" as const, mesaj: s.mesaj, kisa: s.kisa }));
}

/**
 * Onay gunu verilen formda gosterilecek ozel gunler (tarih sirasiyla, en fazla 2).
 * Pencere: [onayGunu, onayGunu + 6].
 */
export function formOzelGunleri(onayGunu: string): OzelGun[] {
  const bas = onayGunu.slice(0, 10);
  const son = gunEkle(bas, PENCERE_GUN - 1);
  const yil = Number(bas.slice(0, 4));
  const adaylar = [...yilinSabitGunleri(yil), ...yilinSabitGunleri(yil + 1), ...DINI_GUNLER];
  return adaylar
    .filter((g) => g.tarih <= son && (g.bitis || g.tarih) >= bas)
    .sort((a, b) => a.tarih.localeCompare(b.tarih))
    .slice(0, AZAMI_GOSTERIM);
}

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

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
