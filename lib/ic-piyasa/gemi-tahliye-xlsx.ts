/**
 * Gemi tahliye raporu -> .xlsx (25.11.2026). Kullanicinin gemi raporu sablonuyla AYNI duzen:
 *  1. sayfa (gemi adi): TARIH / PLAKA / LIMAN / TESLIM / FARK / GITTIGI YER / GEMI ISMI, toplam satiri,
 *     altinda ozet (GELEN KG / INEN KG / SIPARIS MIKTARI / %, arac sayilari, ortalama, fire, yer bazinda toplam).
 *  2. "<GEMI>- UNEX": yalniz bize gelen araclar (liman / teslim / fark).
 *  3. Her alici icin "<GEMI>- <FIRMA>": TARIH / PLAKA / LIMAN / GITTIGI YER / GEMI ISMI + satis tonaji ve kalan.
 * Hesap TEK yerde: gemiRaporu() (lib/ic-piyasa/gemi-tahliye.ts).
 * 27.11.2026 renk (kullanici: "Excel her seferinde kendini bu sekilde uretsin"): lacivert baslik, gun gun satir bandi,
 * FARK bandi (|fark| <= 100 yesil · 101-300 sari · > 300 kirmizi; eksi fark kirmizi yazi), gemiden satis satiri acik mavi,
 * bekleyen (tartim / liman fisi) yer sarisi, KALAN (> 0 sari · 0 yesil · < 0 kirmizi), % (99-100 yesil · > 100 kirmizi),
 * fire (<= %0,5 yesil · ustu kirmizi); ilk sayfada renk anahtari. Degerler / duzen DEGISMEDI.
 */
import { XS, XlsxHucre, XlsxSayfa, sayfaAdi, xlsxOlustur } from "@/lib/xlsx-yaz";
import { GemiAlici, GemiArac, GemiTahliye, UNEX_YER, aracFarki, araclariSirala, gemiRaporu, limanBekliyorMu, yerAdi, yoldaMi } from "./gemi-tahliye";

const gun = (t: string) => new Date(`${t.slice(0, 10)}T12:00:00`);
const yuvarla = (n: number, h = 2) => Math.round(n * 10 ** h) / 10 ** h;

/** FARK bandi (kg): sistem uyarisi da 300 kg'dan sonra kontrol ister. */
export const FARK_NORMAL_KG = 100;
export const FARK_KONTROL_KG = 300;
export const FIRE_SINIR_PCT = 0.5;
export function farkStili(f: number): number {
  const m = Math.abs(f);
  return m > FARK_KONTROL_KG ? XS.gFarkHata : m > FARK_NORMAL_KG ? XS.gFarkUyari : XS.gFarkOk;
}
export const kalanStili = (k: number) => (k < 0 ? XS.gKalanHata : k > 0 ? XS.gKalanUyari : XS.gKalanOk);
const yuzdeStili = (y: number) => (y > 100 ? XS.gYuzdeHata : y >= 99 ? XS.gYuzdeOk : XS.gYuzde);
const fireStili = (f: number) => (f > FIRE_SINIR_PCT ? XS.gFireHata : XS.gFireOk);

type SatirStili = { metin: number; orta: number; tarih: number; sayi: number };
const DUZ: SatirStili = { metin: XS.gMetin, orta: XS.gOrta, tarih: XS.gTarih, sayi: XS.gSayi };
const BANT: SatirStili = { metin: XS.gMetinZ, orta: XS.gOrtaZ, tarih: XS.gTarihZ, sayi: XS.gSayiZ };
const SATIS: SatirStili = { metin: XS.gSatisMetin, orta: XS.gSatisOrta, tarih: XS.gSatisTarih, sayi: XS.gSatisSayi };

/** Gun degisince bant degisir (ayni gunun araclari ayni zeminde). */
function gunBandi(liste: { tarih: string }[]): SatirStili[] {
  let onceki = "";
  let bant = true;
  return liste.map((a) => {
    if (a.tarih.slice(0, 10) !== onceki) { onceki = a.tarih.slice(0, 10); bant = !bant; }
    return bant ? BANT : DUZ;
  });
}

function benzersizAd(ad: string, kullanilan: Set<string>): string {
  let a = sayfaAdi(ad);
  let i = 2;
  while (kullanilan.has(a.toLocaleUpperCase("tr"))) { a = sayfaAdi(`${ad.slice(0, 27)} ${i}`); i++; }
  kullanilan.add(a.toLocaleUpperCase("tr"));
  return a;
}

export function gemiRaporSayfalari(gemi: GemiTahliye, alicilar: GemiAlici[], araclar: GemiArac[]): XlsxSayfa[] {
  const r = gemiRaporu(gemi, alicilar, araclar);
  const sirali = araclariSirala(araclar);
  const kullanilan = new Set<string>();
  const sayfalar: XlsxSayfa[] = [];

  // ---- 1) Ana sayfa ----
  const ana: (XlsxHucre | null)[][] = [];
  ana.push(["TARİH", "PLAKA", "LİMAN", "TESLİM", "FARK", "GİTTİĞİ YER", "GEMİ İSMİ"].map((v) => ({ v, s: XS.gBaslik })));
  const limanH = (a: GemiArac, st: SatirStili): XlsxHucre => (a.liman_kg === null || a.liman_kg === undefined ? { v: null, s: st.metin } : { v: Number(a.liman_kg), s: st.sayi });
  const teslimH = (a: GemiArac, st: SatirStili): XlsxHucre => (!a.alici_id && a.teslim_kg !== null && a.teslim_kg !== undefined ? { v: Number(a.teslim_kg), s: st.sayi } : { v: null, s: st.metin });
  const farkH = (a: GemiArac, st: SatirStili): XlsxHucre => { const f = aracFarki(a); return f === null || a.alici_id ? { v: null, s: st.metin } : { v: yuvarla(f), s: farkStili(f) }; };
  const yerH = (a: GemiArac, st: SatirStili): XlsxHucre =>
    ({ v: yerYazi(a), s: a.alici_id ? XS.gSatisAlici : yoldaMi(a) || limanBekliyorMu(a) ? XS.gBekleyen : st.metin });
  const aracSatiri = (a: GemiArac, bant: SatirStili): (XlsxHucre | null)[] => {
    const st = a.alici_id ? SATIS : bant;
    return [
      { v: gun(a.tarih), s: st.tarih },
      { v: a.plaka, s: st.orta },
      limanH(a, st), teslimH(a, st), farkH(a, st),
      yerH(a, st),
      { v: gemi.gemi_adi, s: st.metin },
    ];
  };
  const yerYazi = (a: GemiArac) => (yoldaMi(a) ? `${UNEX_YER} (tartım bekliyor)` : limanBekliyorMu(a) ? `${UNEX_YER} (liman fişi bekleniyor)` : yerAdi(a, alicilar));
  const limanToplam = (l: GemiArac[]) => yuvarla(l.reduce((t, a) => t + Number(a.liman_kg ?? 0), 0));
  const anaBant = gunBandi(sirali);
  sirali.forEach((a, i) => ana.push(aracSatiri(a, anaBant[i])));
  if (!sirali.length) ana.push([{ v: "Henüz araç girilmedi.", s: XS.not }]);
  ana.push([
    { v: "TOPLAM", s: XS.gToplamMetin },
    { v: `${r.gelenArac} araç`, s: XS.gToplamMetin },
    { v: limanToplam(sirali), s: XS.gToplamSayi },
    { v: r.unexTeslimKg, s: XS.gToplamSayi },
    { v: r.unexFarkKg, s: XS.gToplamFark },
    { v: null, s: XS.gToplamMetin },
    { v: null, s: XS.gToplamMetin },
  ]);
  ana.push([]);
  const ozet = (etiket: string, deger: string | number | null, stil: number = XS.gKpiSayi, not?: string): (XlsxHucre | null)[] =>
    [null, { v: etiket, s: XS.gKpiEtiket }, { v: deger, s: deger === null ? XS.gMetin : stil }, not ? { v: not, s: XS.not } : null];
  const yuzde = yuvarla(r.yuzde);
  ana.push(ozet("SİPARİŞ MİKTARI (B/L)", r.siparisKg, XS.gKpiSiparis));
  ana.push(ozet("GELEN KG (liman, tüm araçlar)", r.gelenKg, XS.gKpiGelen, r.limanBekleyenArac ? "liman fişi bekleyen araçlarda kantar kg" : undefined));
  ana.push(ozet("%", yuzde, yuzdeStili(yuzde), "gelen / sipariş × 100"));
  ana.push(ozet("KALAN KG", r.kalanKg, kalanStili(r.kalanKg)));
  ana.push(ozet("Gelen Araç Sayısı", r.gelenArac));
  ana.push(ozet("Araç Ortalaması (kg)", yuvarla(r.aracOrtalamasi, 0)));
  ana.push(ozet("Kalan Araç Sayısı (tahmini)", r.kalanAracTahmini, XS.gKpiSayi, "kalan kg / araç ortalaması, yukarı yuvarlanır"));
  ana.push(ozet("UNEX liman kg", r.unexLimanKg));
  ana.push(ozet("UNEX İNEN KG (teslim)", r.unexTeslimKg));
  ana.push(ozet("UNEX fark (teslim − liman)", r.unexFarkKg, XS.gKpiFark, r.yoldaArac || r.limanBekleyenArac ? "liman + teslimi olan araçlar" : undefined));
  if (r.yoldaArac) ana.push(ozet("Yolda (tartım bekleyen)", r.yoldaKg, XS.gKalanUyari, `${r.yoldaArac} araç · liman kg`));
  if (r.limanBekleyenArac) ana.push(ozet("Liman fişi bekleyen", r.limanBekleyenKg, XS.gKalanUyari, `${r.limanBekleyenArac} araç · kantar kg; fark / fireye girmez`));
  const fire = r.firePct === null ? null : yuvarla(r.firePct, 3);
  ana.push(ozet("Fire % (UNEX)", fire, fire === null ? XS.gMetin : fireStili(fire), "(liman − teslim) / liman × 100; yalnız UNEX'e gelen araçlar"));
  ana.push([]);
  ana.push([null, { v: "GİTTİĞİ YER", s: XS.gBaslik }, { v: "LİMAN KG", s: XS.gBaslik }, { v: "ARAÇ", s: XS.gBaslik }, { v: "SATIŞ TONAJI", s: XS.gBaslik }, { v: "KALAN", s: XS.gBaslik }]);
  for (const y of r.yerler) {
    ana.push([null,
      { v: y.ad, s: y.aliciId ? XS.gAliciAd : XS.gUnexAd },
      { v: y.limanKg, s: XS.gSayi },
      { v: y.arac, s: XS.gSayi },
      y.hedefKg === null ? { v: null, s: XS.gMetin } : { v: y.hedefKg, s: XS.gSayi },
      y.kalanKg === null ? { v: null, s: XS.gMetin } : { v: y.kalanKg, s: kalanStili(y.kalanKg) },
    ]);
  }
  ana.push([null, { v: "TOPLAM", s: XS.gToplamMetin }, { v: r.gelenKg, s: XS.gToplamSayi }, { v: r.gelenArac, s: XS.gToplamSayi }, { v: null, s: XS.gToplamMetin }, { v: null, s: XS.gToplamMetin }]);
  // Renk anahtari (I sutunu, 2. satirdan)
  const lejant: [string, number][] = [
    ["RENK ANAHTARI", XS.gBaslik],
    [`Fark ≤ ${FARK_NORMAL_KG} kg · normal`, XS.gLejantOk],
    [`Fark ${FARK_NORMAL_KG + 1}–${FARK_KONTROL_KG} kg · dikkat`, XS.gLejantUyari],
    [`Fark > ${FARK_KONTROL_KG} kg · kontrol edin`, XS.gLejantHata],
    ["Gemiden satış aracı", XS.gLejantSatis],
    ["Sarı yer: tartım / liman fişi bekliyor", XS.gLejantUyari],
    ["Kalan: sarı eksik · kırmızı fazla", XS.gMetin],
  ];
  lejant.forEach(([v, st], i) => {
    const satir = ana[i + 1] ?? (ana[i + 1] = []);
    while (satir.length < 8) satir.push(null);
    satir[8] = { v, s: st };
  });
  const satisVar = sirali.some((a) => a.alici_id);
  sayfalar.push({
    ad: benzersizAd(gemi.gemi_adi, kullanilan),
    sutunGenislik: [12, 28, 14, 14, 11, satisVar ? 44 : 30, 18, 3, 34],
    izgaraGizle: true, genislikSigdir: true,
    satirlar: ana,
    dondur: "A2",
    filtre: sirali.length ? `A1:G${sirali.length + 1}` : undefined,
    yazdirBaslik: "1:1",
  });

  // ---- 2) UNEX ----
  const unexAraclar = sirali.filter((a) => !a.alici_id);
  const us: (XlsxHucre | null)[][] = [];
  us.push(["TARİH", "PLAKA", "LİMAN", "TESLİM", "FARK", "GİTTİĞİ YER", "GEMİ İSMİ"].map((v) => ({ v, s: XS.gBaslik })));
  const unexBant = gunBandi(unexAraclar);
  unexAraclar.forEach((a, i) => us.push(aracSatiri(a, unexBant[i])));
  us.push([{ v: "TOPLAM", s: XS.gToplamMetin }, { v: `${unexAraclar.length} araç`, s: XS.gToplamMetin },
    { v: r.unexLimanKg, s: XS.gToplamSayi }, { v: r.unexTeslimKg, s: XS.gToplamSayi }, { v: r.unexFarkKg, s: XS.gToplamFark },
    { v: null, s: XS.gToplamMetin }, { v: null, s: XS.gToplamMetin }]);
  sayfalar.push({ ad: benzersizAd(`${gemi.gemi_adi}- UNEX`, kullanilan), sutunGenislik: [12, 28, 14, 14, 11, 30, 18], satirlar: us, dondur: "A2", yazdirBaslik: "1:1", izgaraGizle: true, genislikSigdir: true });

  // ---- 3) Alicilar ----
  for (const l of alicilar) {
    const ar = sirali.filter((a) => a.alici_id === l.id);
    const y = r.yerler.find((x) => x.aliciId === l.id);
    const ls: (XlsxHucre | null)[][] = [];
    ls.push(["TARİH", "PLAKA", "LİMAN", "GİTTİĞİ YER", "GEMİ İSMİ"].map((v) => ({ v, s: XS.gBaslik })));
    const aliciBant = gunBandi(ar);
    ar.forEach((a, i) => {
      const st = aliciBant[i];
      ls.push([{ v: gun(a.tarih), s: st.tarih }, { v: a.plaka, s: st.orta }, { v: Number(a.liman_kg), s: st.sayi }, { v: l.firma, s: XS.gSatisAlici }, { v: gemi.gemi_adi, s: st.metin }]);
    });
    ls.push([{ v: "TOPLAM", s: XS.gToplamMetin }, { v: `${ar.length} araç`, s: XS.gToplamMetin }, { v: y?.limanKg ?? 0, s: XS.gToplamSayi }, { v: null, s: XS.gToplamMetin }, { v: null, s: XS.gToplamMetin }]);
    ls.push([]);
    if (l.is_emri_no) ls.push([null, { v: "İŞ EMRİ", s: XS.gKpiEtiket }, { v: l.is_emri_no, s: XS.gOrta }]);
    // Is emri hedefi arac sayisiyla verildiyse tonaj / kalan yoktur
    const hedef = l.miktar_kg === null || l.miktar_kg === undefined ? null : Number(l.miktar_kg);
    const kalan = hedef === null ? null : y?.kalanKg ?? hedef;
    ls.push([null, { v: "SATIŞ TONAJI", s: XS.gKpiEtiket }, hedef === null ? { v: "-", s: XS.gOrta } : { v: hedef, s: XS.gKpiSiparis }]);
    ls.push([null, { v: "KALAN", s: XS.gKpiEtiket }, kalan === null ? { v: "-", s: XS.gOrta } : { v: kalan, s: kalanStili(kalan) }]);
    sayfalar.push({ ad: benzersizAd(`${gemi.gemi_adi}- ${l.firma}`, kullanilan), sutunGenislik: [12, 28, 14, 44, 18], satirlar: ls, dondur: "A2", yazdirBaslik: "1:1", izgaraGizle: true, genislikSigdir: true });
  }
  return sayfalar;
}

export function gemiRaporDosyaAdi(gemi: Pick<GemiTahliye, "gemi_adi">, bugun: string): string {
  const [y, m, d] = bugun.split("-");
  // ASCII (Chromium Turkce harfli download adini "download" yapiyordu - siparis raporuyla ayni kural)
  const ascii = gemi.gemi_adi.replace(/[ÇĞİÖŞÜçğıöşü]/g, (h) => ({ Ç: "C", Ğ: "G", İ: "I", Ö: "O", Ş: "S", Ü: "U", ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" } as Record<string, string>)[h] || h)
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${d}.${m}.${y}_${ascii || "GEMI"}_TAHLIYE_RAPORU.xlsx`;
}

export async function gemiRaporXlsx(gemi: GemiTahliye, alicilar: GemiAlici[], araclar: GemiArac[]): Promise<Blob> {
  return xlsxOlustur(gemiRaporSayfalari(gemi, alicilar, araclar));
}
