/**
 * Gemi tahliye raporu -> .xlsx (25.11.2026). Kullanicinin gemi raporu sablonuyla AYNI duzen:
 *  1. sayfa (gemi adi): TARIH / PLAKA / LIMAN / TESLIM / FARK / GITTIGI YER / GEMI ISMI, toplam satiri,
 *     altinda ozet (GELEN KG / INEN KG / SIPARIS MIKTARI / %, arac sayilari, ortalama, fire, yer bazinda toplam).
 *  2. "<GEMI>- UNEX": yalniz bize gelen araclar (liman / teslim / fark).
 *  3. Her alici icin "<GEMI>- <FIRMA>": TARIH / PLAKA / LIMAN / GITTIGI YER / GEMI ISMI + satis tonaji ve kalan.
 * Hesap TEK yerde: gemiRaporu() (lib/ic-piyasa/gemi-tahliye.ts).
 */
import { XS, XlsxHucre, XlsxSayfa, sayfaAdi, xlsxOlustur } from "@/lib/xlsx-yaz";
import { GemiAlici, GemiArac, GemiTahliye, UNEX_YER, aracFarki, araclariSirala, gemiRaporu, limanBekliyorMu, yerAdi, yoldaMi } from "./gemi-tahliye";

const gun = (t: string) => new Date(`${t.slice(0, 10)}T12:00:00`);
const yuvarla = (n: number, h = 2) => Math.round(n * 10 ** h) / 10 ** h;

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
  ana.push(["TARİH", "PLAKA", "LİMAN", "TESLİM", "FARK", "GİTTİĞİ YER", "GEMİ İSMİ"].map((v) => ({ v, s: XS.tabloBaslik })));
  const limanH = (a: GemiArac): XlsxHucre => (a.liman_kg === null || a.liman_kg === undefined ? { v: null, s: XS.metin } : { v: Number(a.liman_kg), s: XS.tamSayi });
  const teslimH = (a: GemiArac): XlsxHucre => (!a.alici_id && a.teslim_kg !== null && a.teslim_kg !== undefined ? { v: Number(a.teslim_kg), s: XS.tamSayi } : { v: null, s: XS.metin });
  const farkH = (a: GemiArac): XlsxHucre => { const f = aracFarki(a); return f === null || a.alici_id ? { v: null, s: XS.metin } : { v: yuvarla(f), s: XS.tamSayi }; };
  const yerYazi = (a: GemiArac) => (yoldaMi(a) ? `${UNEX_YER} (tartım bekliyor)` : limanBekliyorMu(a) ? `${UNEX_YER} (liman fişi bekleniyor)` : yerAdi(a, alicilar));
  const limanToplam = (l: GemiArac[]) => yuvarla(l.reduce((t, a) => t + Number(a.liman_kg ?? 0), 0));
  for (const a of sirali) {
    ana.push([
      { v: gun(a.tarih), s: XS.tarih },
      { v: a.plaka, s: XS.metin },
      limanH(a), teslimH(a), farkH(a),
      { v: yerYazi(a), s: XS.metin },
      { v: gemi.gemi_adi, s: XS.metin },
    ]);
  }
  if (!sirali.length) ana.push([{ v: "Henüz araç girilmedi.", s: XS.not }]);
  ana.push([
    { v: "TOPLAM", s: XS.toplamMetin },
    { v: `${r.gelenArac} araç`, s: XS.toplamMetin },
    { v: limanToplam(sirali), s: XS.toplamTamSayi },
    { v: r.unexTeslimKg, s: XS.toplamTamSayi },
    { v: r.unexFarkKg, s: XS.toplamTamSayi },
    { v: null, s: XS.toplamMetin },
    { v: null, s: XS.toplamMetin },
  ]);
  ana.push([]);
  const ozet = (etiket: string, deger: string | number | null, stil: number = XS.tamSayi, not?: string): (XlsxHucre | null)[] =>
    [null, { v: etiket, s: XS.metin }, { v: deger, s: stil }, not ? { v: not, s: XS.not } : null];
  ana.push(ozet("SİPARİŞ MİKTARI (B/L)", r.siparisKg));
  ana.push(ozet("GELEN KG (liman, tüm araçlar)", r.gelenKg, XS.tamSayi, r.limanBekleyenArac ? "liman fişi bekleyen araçlarda kantar kg" : undefined));
  ana.push(ozet("%", yuvarla(r.yuzde), XS.ondalik, "gelen / sipariş × 100"));
  ana.push(ozet("KALAN KG", r.kalanKg));
  ana.push(ozet("Gelen Araç Sayısı", r.gelenArac));
  ana.push(ozet("Araç Ortalaması (kg)", yuvarla(r.aracOrtalamasi, 0)));
  ana.push(ozet("Kalan Araç Sayısı (tahmini)", r.kalanAracTahmini, XS.tamSayi, "kalan kg / araç ortalaması, yukarı yuvarlanır"));
  ana.push(ozet("UNEX liman kg", r.unexLimanKg));
  ana.push(ozet("UNEX İNEN KG (teslim)", r.unexTeslimKg));
  ana.push(ozet("UNEX fark (teslim − liman)", r.unexFarkKg, XS.tamSayi, r.yoldaArac || r.limanBekleyenArac ? "liman + teslimi olan araçlar" : undefined));
  if (r.yoldaArac) ana.push(ozet("Yolda (tartım bekleyen)", r.yoldaKg, XS.tamSayi, `${r.yoldaArac} araç · liman kg`));
  if (r.limanBekleyenArac) ana.push(ozet("Liman fişi bekleyen", r.limanBekleyenKg, XS.tamSayi, `${r.limanBekleyenArac} araç · kantar kg; fark / fireye girmez`));
  ana.push(ozet("Fire % (UNEX)", r.firePct === null ? null : yuvarla(r.firePct, 3), XS.ondalik, "(liman − teslim) / liman × 100; yalnız UNEX'e gelen araçlar"));
  ana.push([]);
  ana.push([null, { v: "GİTTİĞİ YER", s: XS.tabloBaslik }, { v: "LİMAN KG", s: XS.tabloBaslik }, { v: "ARAÇ", s: XS.tabloBaslik }, { v: "SATIŞ TONAJI", s: XS.tabloBaslik }, { v: "KALAN", s: XS.tabloBaslik }]);
  for (const y of r.yerler) {
    ana.push([null,
      { v: y.ad, s: XS.metin },
      { v: y.limanKg, s: XS.tamSayi },
      { v: y.arac, s: XS.tamSayi },
      y.hedefKg === null ? { v: null, s: XS.metin } : { v: y.hedefKg, s: XS.tamSayi },
      y.kalanKg === null ? { v: null, s: XS.metin } : { v: y.kalanKg, s: XS.tamSayi },
    ]);
  }
  ana.push([null, { v: "TOPLAM", s: XS.toplamMetin }, { v: r.gelenKg, s: XS.toplamTamSayi }, { v: r.gelenArac, s: XS.toplamTamSayi }, { v: null, s: XS.toplamMetin }, { v: null, s: XS.toplamMetin }]);
  sayfalar.push({
    ad: benzersizAd(gemi.gemi_adi, kullanilan),
    sutunGenislik: [12, 28, 14, 14, 11, 22, 18],
    satirlar: ana,
    dondur: "A2",
    filtre: sirali.length ? `A1:G${sirali.length + 1}` : undefined,
    yazdirBaslik: "1:1",
  });

  // ---- 2) UNEX ----
  const unexAraclar = sirali.filter((a) => !a.alici_id);
  const us: (XlsxHucre | null)[][] = [];
  us.push(["TARİH", "PLAKA", "LİMAN", "TESLİM", "FARK", "GİTTİĞİ YER", "GEMİ İSMİ"].map((v) => ({ v, s: XS.tabloBaslik })));
  for (const a of unexAraclar) {
    us.push([
      { v: gun(a.tarih), s: XS.tarih }, { v: a.plaka, s: XS.metin },
      limanH(a), teslimH(a), farkH(a),
      { v: yerYazi(a), s: XS.metin }, { v: gemi.gemi_adi, s: XS.metin },
    ]);
  }
  us.push([{ v: "TOPLAM", s: XS.toplamMetin }, { v: `${unexAraclar.length} araç`, s: XS.toplamMetin },
    { v: r.unexLimanKg, s: XS.toplamTamSayi }, { v: r.unexTeslimKg, s: XS.toplamTamSayi }, { v: r.unexFarkKg, s: XS.toplamTamSayi },
    { v: null, s: XS.toplamMetin }, { v: null, s: XS.toplamMetin }]);
  sayfalar.push({ ad: benzersizAd(`${gemi.gemi_adi}- UNEX`, kullanilan), sutunGenislik: [12, 28, 14, 14, 11, 16, 18], satirlar: us, dondur: "A2", yazdirBaslik: "1:1" });

  // ---- 3) Alicilar ----
  for (const l of alicilar) {
    const ar = sirali.filter((a) => a.alici_id === l.id);
    const y = r.yerler.find((x) => x.aliciId === l.id);
    const ls: (XlsxHucre | null)[][] = [];
    ls.push(["TARİH", "PLAKA", "LİMAN", "GİTTİĞİ YER", "GEMİ İSMİ"].map((v) => ({ v, s: XS.tabloBaslik })));
    for (const a of ar) {
      ls.push([{ v: gun(a.tarih), s: XS.tarih }, { v: a.plaka, s: XS.metin }, { v: Number(a.liman_kg), s: XS.tamSayi }, { v: l.firma, s: XS.metin }, { v: gemi.gemi_adi, s: XS.metin }]);
    }
    ls.push([{ v: "TOPLAM", s: XS.toplamMetin }, { v: `${ar.length} araç`, s: XS.toplamMetin }, { v: y?.limanKg ?? 0, s: XS.toplamTamSayi }, { v: null, s: XS.toplamMetin }, { v: null, s: XS.toplamMetin }]);
    ls.push([]);
    ls.push([null, { v: "SATIŞ TONAJI", s: XS.metin }, { v: Number(l.miktar_kg), s: XS.tamSayi }]);
    ls.push([null, { v: "KALAN", s: XS.metin }, { v: y?.kalanKg ?? Number(l.miktar_kg), s: XS.tamSayi }]);
    sayfalar.push({ ad: benzersizAd(`${gemi.gemi_adi}- ${l.firma}`, kullanilan), sutunGenislik: [12, 28, 14, 24, 18], satirlar: ls, dondur: "A2", yazdirBaslik: "1:1" });
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
