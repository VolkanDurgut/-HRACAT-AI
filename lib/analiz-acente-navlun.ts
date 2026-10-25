/**
 * Analiz > Acenteler: acente + varis limani bazinda navlun fiyatlari (25.10.2026,
 * kullanici istegi: "acentelere verdigimiz ucretler de gorunsun; gideceği limana
 * gore fiyat farkli, hangi limana gonderiyorsak o fiyat gelsin").
 *
 * Kaynak (SEMA DEGISMEDI): navlun ve lokal masraf DOSYADA konteyner basi tutulur
 * (`ihracat_dosyalari.navlun_tutari / lokal_masraf_tutari`, rezervasyon formundaki
 * "Konteyner Basi" alanlar), acente REZERVASYONDA (`rezervasyonlar.acente_ismi`).
 * Bir dosyanin her rezervasyonu kendi acentesine, dosyanin navluniyla sayilir.
 *
 * - "son": en son sevkiyat tarihli dosyanin navlunu (guncel fiyat). Ayni gunde
 *   birden fazla ise dosya no buyuk olan (sonra acilan).
 * - "enAz / enCok": fiyat zamanla degistiyse aralik.
 * - Navlunu girilmemis dosyalar fiyata katilmaz; sayilari ayrica doner
 *   (FOB vb. navlunu alicinin odedigi isler `aliciOder`).
 * - Farkli para birimleri AYRI satir olur (kur cevrimi yok).
 * Saf fonksiyon - test: scratchpad `acente/birim.ts`.
 */

export type NavlunGirdisi = {
  acente: string;
  /** Birlestirilmis liman adi (limanAnahtari); null = belirsiz/gecersiz. */
  liman: string | null;
  paraBirimi: string;
  /** Konteyner basi navlun; null/0 = girilmemis. */
  navlun: number | null;
  lokal: number | null;
  konteyner: number;
  /** Siralama icin sevkiyat tarihi (ISO); null olabilir. */
  tarih: string | null;
  dosyaNo: string;
  /** Teslim sekli navlunu aliciya birakiyor mu (FOB/FCA/FAS/EXW). */
  aliciOder: boolean;
};

export type LimanNavlunu = {
  liman: string;
  paraBirimi: string;
  son: number | null;
  sonDosyaNo: string | null;
  enAz: number | null;
  enCok: number | null;
  /** Konteyner agirlikli ortalama (fiyatli dosyalar). */
  ortalama: number | null;
  lokalSon: number | null;
  konteyner: number;
  dosya: number;
  /** Navlunu girilmemis dosya sayisi. */
  navlunsuz: number;
  /** Navlunsuz dosyalarin HEPSI alici oder (FOB vb.) ise true. */
  aliciOder: boolean;
};

export const BELIRSIZ_LIMAN = "Liman belirtilmemiş";

export function acenteLimanNavlunlari(girdiler: NavlunGirdisi[]): Map<string, LimanNavlunu[]> {
  type Biriken = {
    liman: string; paraBirimi: string;
    fiyatli: { navlun: number; lokal: number | null; konteyner: number; tarih: string; dosyaNo: string }[];
    dosyalar: Set<string>; konteyner: number; navlunsuz: Set<string>; navlunsuzAliciOder: boolean;
  };
  const acenteler = new Map<string, Map<string, Biriken>>();
  for (const g of girdiler) {
    const acente = g.acente.trim();
    if (!acente) continue;
    const liman = g.liman || BELIRSIZ_LIMAN;
    const para = (g.paraBirimi || "USD").trim().toUpperCase() || "USD";
    const anahtar = `${liman}|${para}`;
    if (!acenteler.has(acente)) acenteler.set(acente, new Map());
    const m = acenteler.get(acente)!;
    if (!m.has(anahtar)) m.set(anahtar, { liman, paraBirimi: para, fiyatli: [], dosyalar: new Set(), konteyner: 0, navlunsuz: new Set(), navlunsuzAliciOder: true });
    const b = m.get(anahtar)!;
    b.dosyalar.add(g.dosyaNo);
    b.konteyner += g.konteyner > 0 ? g.konteyner : 0;
    if (g.navlun !== null && Number.isFinite(g.navlun) && g.navlun > 0) {
      b.fiyatli.push({ navlun: g.navlun, lokal: g.lokal !== null && Number.isFinite(g.lokal) && g.lokal > 0 ? g.lokal : null, konteyner: g.konteyner > 0 ? g.konteyner : 0, tarih: g.tarih || "", dosyaNo: g.dosyaNo });
    } else {
      b.navlunsuz.add(g.dosyaNo);
      if (!g.aliciOder) b.navlunsuzAliciOder = false;
    }
  }

  const sonuc = new Map<string, LimanNavlunu[]>();
  acenteler.forEach((m, acente) => {
    const satirlar: LimanNavlunu[] = [];
    m.forEach((b) => {
      const sirali = [...b.fiyatli].sort((x, y) => (y.tarih.localeCompare(x.tarih)) || y.dosyaNo.localeCompare(x.dosyaNo));
      const son = sirali[0] || null;
      const fiyatlar = b.fiyatli.map((f) => f.navlun);
      const agirlik = b.fiyatli.reduce((s, f) => s + f.konteyner, 0);
      const ortalama = b.fiyatli.length === 0 ? null
        : agirlik > 0 ? b.fiyatli.reduce((s, f) => s + f.navlun * f.konteyner, 0) / agirlik
        : fiyatlar.reduce((s, v) => s + v, 0) / fiyatlar.length;
      const lokalSon = sirali.find((f) => f.lokal !== null)?.lokal ?? null;
      satirlar.push({
        liman: b.liman,
        paraBirimi: b.paraBirimi,
        son: son ? son.navlun : null,
        sonDosyaNo: son ? son.dosyaNo : null,
        enAz: fiyatlar.length ? Math.min(...fiyatlar) : null,
        enCok: fiyatlar.length ? Math.max(...fiyatlar) : null,
        ortalama,
        lokalSon,
        konteyner: b.konteyner,
        dosya: b.dosyalar.size,
        navlunsuz: b.navlunsuz.size,
        aliciOder: b.navlunsuz.size > 0 && b.navlunsuzAliciOder,
      });
    });
    // Konteyneri cok olan liman ustte; belirsiz liman en altta.
    satirlar.sort((a, b) => Number(a.liman === BELIRSIZ_LIMAN) - Number(b.liman === BELIRSIZ_LIMAN)
      || b.konteyner - a.konteyner || a.liman.localeCompare(b.liman, "tr"));
    sonuc.set(acente, satirlar);
  });
  return sonuc;
}
