/**
 * NAVLUN KARSILASTIRMA + ACENTE HAFIZASI (13.11.2026). SAF: veri yok, ag yok (yalniz saf ./navlun-kalem.ts import edilir).
 * Uygulama (Navlun Evreni: sayfa, harita, Liman Masasi) ve edge (navlun-tablosu: 17:00 maili, satin alma listesi) AYNI
 * hesabi kullanir (lib/navlun/karsilastirma.ts yeniden disa aktarir).
 *
 * Kullanici (13.11.2026): "Beyrut navlununun yanlis gozukmesi beni cirak cikartti. Bunu kokten cozmeliyiz ... acenteleri
 * gruplara ayir, ilettigi mesajlari hafizaya al. Kendi kendini gelistiren bir sistem olmali."
 * Sorun: teklifler yalniz TUTARA gore siralaniyordu. Evergreen "USD 340 + lokaller" (lokal 356) Beyrut'ta "en iyi" ve
 * "hedefte" gorundu; gercek maliyet 696 (MSC'nin gerceklesen 700'u ile ayni, hedef 600'un USTUNDE).
 *
 * KARSILASTIRMA TEMELI (kullanici onayi): navlun + cikis lokali + konteyner basi kucuk kalemler (muhur vb.), KDV haric.
 * VGM EKLENMEZ (18.11.2026 kullanici): tartim sirketin kendi yetkili kantarinda yapilir, acentenin VGM hizmeti alinmaz.
 * Hedef de bu temelle okunur. Liman kurali "navlun" olan limanda (bir pazarda teklifler ve hedef yalniz deniz navlunuysa)
 * yalniz navlun karsilastirilir. Not (13.11.2026): Asya hatlarindaki "all in" teklifler yukleme limani lokalini ICERIYOR
 * (ONE: "Navlun, yukleme limani lokal masraflari dahildir"; Horoz: "Vgm, pol lokaller dahildir"); bugun istisna yok.
 *
 * LOKAL DURUMU sirasi (ilk bulunan gecerli):
 *  1. Liman kurali "navlun"      -> lokal karsilastirmaya girmez (kesin)
 *  2. Teklifin kendi metni       -> lokal_dahil true / false (okuyucu: "lokal dahil", "+ lokaller", "all in" ...)
 *  3. Acente hafizasi            -> arastirma / elle girilen kural (navlun_acente_hafizasi)
 *  4. Rezervasyondan ogrenilen   -> ayni acentenin ayni limana teklifi ile gerceklesen navlun (yukleme plani) karsilastirilir:
 *                                   teklif = gerceklesen -> "dahil"; teklif + lokal = gerceklesen -> "haric". KENDI KENDINI
 *                                   GELISTIREN kisim: her yeni rezervasyon kaniti artirir, kimse bir sey girmez.
 *  5. Hicbiri yok                -> "bilinmiyor": teklif gosterilir ama "en iyi" SECILMEZ ve hedefte (yesil) GORUNMEZ.
 * "haric" + lokal tutari biliniyorsa (hafizadaki tarife) toplam kesin; bilinmiyorsa tahmini (en iyi secilmez).
 *
 * 24.11.2026 MAILDEKI KALEMLER (istege bagli, ./navlun-kalem.ts): teklif "kalemler" ile gelirse lokal / ek tutar once
 * MAILDEN alinir (sabit kalem kodlariyla; cift sayim yok), yoksa acente hafizasindan:
 *  - lokal dahil (mail "all in / lokal dahil" ya da hafiza) -> mailde lokal tablosu olsa bile lokal EKLENMEZ.
 *  - lokal haric -> maildeki fabrika dolum lokal tablosu; yoksa hafiza. Ikisi de var ve %5 / 10 USD'den fazla farkliysa
 *    toplam mailden, ama "kesin" DEGIL (kontrol): en iyi secilmez.
 *  - ek (muhur vb.): maildeki tablo disi konteyner basi kalemler; mailde hic yoksa (ve muhur lokal tablosunda da yoksa) hafiza.
 *  - para_birimi EUR teklif / USD disi kalem: kurla USD'ye cevrilip siralanir, metinde "≈" ile isaretlenir.
 *  - 25.11.2026: mailde ZORUNLU B/L (konsimento) bedeli varsa konteyner basi toplama TAM eklenir ("95 + B/L 25 = 120").
 * Bu alanlar verilmezse hesap 13.11.2026'daki ile BIREBIR aynidir.
 */
import { kalemOzeti, usdKarsiligi, VARSAYILAN_KUR, type KalemOzeti, type Kur, type NavlunKalem } from "./navlun-kalem.ts";

export type LokalKurali = "dahil" | "haric" | "bilinmiyor";
export type Guven = "kesin" | "yuksek" | "tahmini";
export type KarsilastirmaTemeli = "toplam" | "navlun";

export type AcenteHafizasi = {
  acente_anahtar: string;
  acente_ad: string;
  lokal: LokalKurali;
  /** "haric" icin konteyner basi cikis lokali (KDV haric), ekipmana gore */
  lokal_20: number | null;
  lokal_40: number | null;
  /** Konteyner basi kucuk kalemler (muhur ...) - lokal dahil olsa da ayrica yazilanlar. VGM buraya girmez. */
  ek_kont: number;
  guven: Guven;
  kanit: string;
};

export type LimanKurali = { liman_anahtar: string; temel: KarsilastirmaTemeli; aciklama: string };

/** Rezervasyonu yapilmis yukleme (yukleme plani): konteyner basi navlun (lokal DAHIL; net navlun = navlun - lokal) + lokal */
export type GerceklesenKanit = {
  acente: string | null;
  liman_anahtar: string | null;
  etd: string | null;
  navlun: number | null;
  lokal: number | null;
  para: string | null;
};

export type TeklifGirdisi = {
  acente: string | null;
  tutar: number;
  para_birimi?: string | null;
  ekipman: string | null;
  lokal_dahil: boolean | null;
  liman_anahtar: string | null;
  tarih: string;
};

export type OgrenilenKural = { lokal: LokalKurali; kanitlar: string[]; dahil: number; haric: number };

export type KarsilastirmaBaglami = {
  hafiza: Map<string, AcenteHafizasi>;
  ogrenilen: Map<string, OgrenilenKural>;
  limanKurallari: Map<string, LimanKurali>;
};

export type LokalKaynagi = "liman" | "mail" | "hafiza" | "rezervasyon" | "yok";

export type Karsilastirma = {
  /** Teklifteki tutar (acentenin yazdigi) */
  navlun: number;
  /** Eklenen cikis lokali (dahilse 0; haric ve bilinmiyorsa null) */
  lokal: number | null;
  /** Eklenen konteyner basi kucuk kalemler */
  ek: number;
  /** Karsilastirma tutari: navlun + lokal + ek (temel "navlun" ise yalniz navlun) */
  toplam: number;
  /** Toplamin her parcasi biliniyor mu? false ise "en iyi" secilmez, hedefte gorunmez */
  kesin: boolean;
  lokalDurum: LokalKurali;
  temel: KarsilastirmaTemeli;
  kaynak: LokalKaynagi;
  /** Kisa aciklama: "340 + lokal 356 = 696", "lokal dahil", "lokal belirsiz" */
  metin: string;
  /** Neye dayanarak (acente hafizasi kaniti, rezervasyon, mail) */
  dayanak: string;
  /** 24.11.2026: maildeki kalemlerin ozeti (kalemler verildiyse) */
  kalem?: KalemOzeti | null;
  /** 24.11.2026: kurla cevrilmis tutar var (EUR teklif / USD disi kalem) */
  yaklasik?: boolean;
  /** 24.11.2026: mail lokali ile acente hafizasi celisiyor */
  celiski?: string | null;
};

/** karsilastir'in istege bagli girdileri (24.11.2026) */
export type KalemliTeklif = { kalemler?: NavlunKalem[] | null; para_birimi?: string | null };

const TR_HARF: Record<string, string> = { Ç: "C", Ğ: "G", Ö: "O", Ş: "S", Ü: "U", İ: "I", I: "I" };

/** Acente adini tek anahtara indirir: "DRAFT/CMA" -> "DRAFT", "AKKON LINES" -> "AKKON", "ONE LINE" -> "ONE", "Marti" -> "MARTI". */
export function acenteAnahtari(ad: string | null | undefined): string | null {
  if (!ad) return null;
  const s = ad.split("/")[0]
    .toLocaleUpperCase("tr-TR")
    .replace(/[ÇĞÖŞÜİ]/g, (c) => TR_HARF[c] || c)
    .replace(/\b(LINES?|SHIPPING|LOJISTIK|LOGISTICS|DENIZCILIK|GEMI|ACENTELIGI|A\.?S\.?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || null;
}

const yuvarla = (x: number) => Math.round(x * 100) / 100;
const sayiYaz = (x: number) => x.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const gunFarki = (a: string, b: string) => (Date.parse(a.slice(0, 10)) - Date.parse(b.slice(0, 10))) / 86400000;
/** Esitlik toleransi: %1 ya da 5 USD (hangisi buyukse) */
const esitMi = (a: number, b: number) => Math.abs(a - b) <= Math.max(5, Math.abs(b) * 0.01);

/**
 * KENDI KENDINI GELISTIREN KISIM: rezervasyon kanitlari. Her gerceklesen yukleme icin ayni acentenin ayni limana,
 * ETD'den onceki 150 gun icindeki en son 20'DC teklifi aranir:
 *   teklif = gerceklesen navlun (lokal dahil)  -> acente fiyati LOKAL DAHIL veriyor
 *   teklif + lokal = gerceklesen navlun        -> acente fiyati LOKAL HARIC veriyor
 * Ikisi de tutmazsa (fiyat pazarlikla degismis) kanit sayilmaz. Celisen kanitlar -> "bilinmiyor".
 */
export function rezervasyondanOgren(teklifler: TeklifGirdisi[], gerceklesen: GerceklesenKanit[]): Map<string, OgrenilenKural> {
  const sonuc = new Map<string, OgrenilenKural>();
  const sayilan = new Set<string>();
  for (const g of gerceklesen) {
    const a = acenteAnahtari(g.acente);
    if (!a || !g.liman_anahtar || !g.etd || !g.navlun || g.navlun <= 0 || (g.para && g.para !== "USD")) continue;
    const aday = teklifler
      .filter((t) => acenteAnahtari(t.acente) === a && t.liman_anahtar === g.liman_anahtar && (t.ekipman || "20DC") === "20DC"
        && (!t.para_birimi || t.para_birimi === "USD") && t.tutar > 0)
      .filter((t) => { const f = gunFarki(g.etd as string, t.tarih); return f >= 0 && f <= 150; })
      .sort((x, y) => y.tarih.localeCompare(x.tarih))[0];
    if (!aday) continue;
    let tur: "dahil" | "haric" | null = null;
    if (esitMi(aday.tutar, g.navlun)) tur = "dahil";
    else if (g.lokal && g.lokal > 0 && esitMi(aday.tutar + g.lokal, g.navlun)) tur = "haric";
    if (!tur) continue;
    // Ayni teklif-rezervasyon cifti bir kez sayilir (bir booking'in birden fazla dosyasi)
    const anahtar = `${a}|${g.liman_anahtar}|${aday.tarih}|${aday.tutar}|${tur}`;
    if (sayilan.has(anahtar)) continue;
    sayilan.add(anahtar);
    const k = sonuc.get(a) || { lokal: "bilinmiyor" as LokalKurali, kanitlar: [], dahil: 0, haric: 0 };
    if (tur === "dahil") k.dahil += 1; else k.haric += 1;
    const etd = `${g.etd.slice(8, 10)}.${g.etd.slice(5, 7)}`;
    k.kanitlar.push(tur === "dahil"
      ? `${g.liman_anahtar}: teklif ${sayiYaz(aday.tutar)} = rezervasyon ${sayiYaz(g.navlun)} (ETD ${etd})`
      : `${g.liman_anahtar}: teklif ${sayiYaz(aday.tutar)} + lokal ${sayiYaz(g.lokal as number)} = rezervasyon ${sayiYaz(g.navlun)} (ETD ${etd})`);
    k.lokal = k.dahil && !k.haric ? "dahil" : k.haric && !k.dahil ? "haric" : "bilinmiyor";
    sonuc.set(a, k);
  }
  return sonuc;
}

export function baglamKur(hafiza: AcenteHafizasi[], limanKurallari: LimanKurali[], teklifler: TeklifGirdisi[], gerceklesen: GerceklesenKanit[]): KarsilastirmaBaglami {
  return {
    hafiza: new Map(hafiza.map((h) => [h.acente_anahtar, h])),
    ogrenilen: rezervasyondanOgren(teklifler, gerceklesen),
    limanKurallari: new Map(limanKurallari.map((l) => [l.liman_anahtar, l])),
  };
}

/** Bir teklifin karsilastirma tutari. baglam yoksa (hafiza okunamadi) yalniz mail metnindeki bilgi kullanilir. */
export function karsilastir(
  t: Pick<TeklifGirdisi, "acente" | "tutar" | "ekipman" | "lokal_dahil" | "liman_anahtar"> & KalemliTeklif,
  baglam: KarsilastirmaBaglami | null,
  kur: Kur = VARSAYILAN_KUR,
): Karsilastirma {
  const navlun = t.tutar;
  const eurMu = t.para_birimi === "EUR";
  const navlunUsd = eurMu ? yuvarla(usdKarsiligi(navlun, "EUR", kur)) : navlun;
  const kural = t.liman_anahtar ? baglam?.limanKurallari.get(t.liman_anahtar) : undefined;
  if (kural && kural.temel === "navlun") {
    return { navlun, lokal: null, ek: 0, toplam: navlunUsd, kesin: true, lokalDurum: t.lokal_dahil === true ? "dahil" : t.lokal_dahil === false ? "haric" : "bilinmiyor",
      temel: "navlun", kaynak: "liman", metin: eurMu ? `yalnız navlun (≈ ${sayiYaz(navlunUsd)} USD)` : "yalnız navlun", dayanak: kural.aciklama, ...(eurMu ? { yaklasik: true } : {}) };
  }
  if (t.kalemler?.length || eurMu) return kalemliKarsilastir(t, baglam, kur, navlunUsd);
  const a = acenteAnahtari(t.acente);
  const h = a ? baglam?.hafiza.get(a) : undefined;
  const o = a ? baglam?.ogrenilen.get(a) : undefined;
  let durum: LokalKurali = "bilinmiyor";
  let kaynak: LokalKaynagi = "yok";
  let dayanak = "Teklifte lokal yazmıyor; acente hafızasında ve rezervasyonlarda kanıt yok.";
  if (t.lokal_dahil === true || t.lokal_dahil === false) {
    durum = t.lokal_dahil ? "dahil" : "haric"; kaynak = "mail"; dayanak = "Teklif metninde yazıyor.";
  } else if (h && h.lokal !== "bilinmiyor") {
    durum = h.lokal; kaynak = "hafiza"; dayanak = `Acente hafızası: ${h.kanit}`;
  } else if (o && o.lokal !== "bilinmiyor") {
    durum = o.lokal; kaynak = "rezervasyon"; dayanak = `Rezervasyondan öğrenildi: ${o.kanitlar.join("; ")}`;
  }
  const ek = h && h.ek_kont > 0 ? h.ek_kont : 0;
  const ekMetin = ek ? ` + ${sayiYaz(ek)} (mühür vb.)` : "";
  if (durum === "dahil") {
    const toplam = yuvarla(navlun + ek);
    return { navlun, lokal: 0, ek, toplam, kesin: true, lokalDurum: "dahil", temel: "toplam", kaynak, dayanak,
      metin: ek ? `${sayiYaz(navlun)}${ekMetin} = ${sayiYaz(toplam)}` : "lokal dahil" };
  }
  if (durum === "haric") {
    const kirk = (t.ekipman || "20DC").startsWith("40");
    const lokal = h ? (kirk ? h.lokal_40 : h.lokal_20) : null;
    if (lokal !== null && lokal !== undefined && lokal > 0) {
      const toplam = yuvarla(navlun + lokal + ek);
      return { navlun, lokal, ek, toplam, kesin: true, lokalDurum: "haric", temel: "toplam", kaynak, dayanak: h && kaynak !== "hafiza" ? `${dayanak} Lokal tutarı: acente hafızası.` : dayanak,
        metin: `${sayiYaz(navlun)} + lokal ${sayiYaz(lokal)}${ekMetin} = ${sayiYaz(toplam)}` };
    }
    return { navlun, lokal: null, ek, toplam: yuvarla(navlun + ek), kesin: false, lokalDurum: "haric", temel: "toplam", kaynak, dayanak,
      metin: `${sayiYaz(navlun)} + lokal (tutarı bilinmiyor)` };
  }
  return { navlun, lokal: null, ek, toplam: yuvarla(navlun + ek), kesin: false, lokalDurum: "bilinmiyor", temel: "toplam", kaynak, dayanak, metin: "lokal belirsiz" };
}

/** Lokal durumu (mail > hafiza > rezervasyon), karsilastir ile ayni sira. */
function lokalKarari(t: Pick<TeklifGirdisi, "acente" | "lokal_dahil">, baglam: KarsilastirmaBaglami | null) {
  const a = acenteAnahtari(t.acente);
  const h = a ? baglam?.hafiza.get(a) : undefined;
  const o = a ? baglam?.ogrenilen.get(a) : undefined;
  if (t.lokal_dahil === true || t.lokal_dahil === false) return { h, durum: (t.lokal_dahil ? "dahil" : "haric") as LokalKurali, kaynak: "mail" as LokalKaynagi, dayanak: "Teklif metninde yazıyor." };
  if (h && h.lokal !== "bilinmiyor") return { h, durum: h.lokal, kaynak: "hafiza" as LokalKaynagi, dayanak: `Acente hafızası: ${h.kanit}` };
  if (o && o.lokal !== "bilinmiyor") return { h, durum: o.lokal, kaynak: "rezervasyon" as LokalKaynagi, dayanak: `Rezervasyondan öğrenildi: ${o.kanitlar.join("; ")}` };
  return { h, durum: "bilinmiyor" as LokalKurali, kaynak: "yok" as LokalKaynagi, dayanak: "Teklifte lokal yazmıyor; acente hafızasında ve rezervasyonlarda kanıt yok." };
}

/** Lokal farki tolerans: %5 ya da 10 USD (hangisi buyukse) */
const lokalAyniMi = (a: number, b: number) => Math.abs(a - b) <= Math.max(10, Math.abs(b) * 0.05);

/** 24.11.2026: maildeki kalemlerle (ve / veya EUR teklifle) karsilastirma. Toplami KOD hesaplar. */
function kalemliKarsilastir(
  t: Pick<TeklifGirdisi, "acente" | "tutar" | "ekipman" | "lokal_dahil" | "liman_anahtar"> & KalemliTeklif,
  baglam: KarsilastirmaBaglami | null, kur: Kur, navlunUsd: number,
): Karsilastirma {
  const navlun = t.tutar;
  const { h, durum, kaynak, dayanak } = lokalKarari(t, baglam);
  const kalem = t.kalemler?.length ? kalemOzeti(t.kalemler, t.ekipman, kur) : null;
  const eurMu = t.para_birimi === "EUR";
  // Ek kalem: mailde tablo disi kalem varsa mail; mailde hic ek yoksa ve muhur lokal tablosunda da yoksa hafiza
  const mailEkVar = !!kalem && kalem.ekKalemler.length > 0;
  const muhurTabloda = !!kalem && kalem.lokalKalemler.some((k) => k.kod === "MUHUR");
  const ek = mailEkVar ? kalem!.ek : (!muhurTabloda && h && h.ek_kont > 0 ? h.ek_kont : 0);
  const ekKaynagi = mailEkVar ? "mail" : ek ? "hafıza" : null;
  const yaklasik = eurMu || !!(kalem && kalem.yaklasik && (durum === "haric" || mailEkVar));
  const y = yaklasik || (kalem?.blKalem && kalem.blKalem.para !== "USD") ? "≈ " : "";
  const nav = eurMu ? `${sayiYaz(navlun)} EUR (${y}${sayiYaz(navlunUsd)} USD)` : sayiYaz(navlun);
  const ekAdi = mailEkVar ? kalem!.ekKalemler.map((k) => k.ad).join(", ").slice(0, 40) : "mühür vb.";
  const ekMetin = ek ? ` + ${sayiYaz(ek)} (${ekAdi})` : "";
  const ekDayanak0 = ekKaynagi === "mail" ? " Ek kalemler: mail." : ekKaynagi === "hafıza" ? " Ek kalemler: acente hafızası." : "";
  // 25.11.2026: zorunlu B/L (konsimento) bedeli konteyner basi toplama tam eklenir (kullanici onayi; navlun-kalem.ts KalemOzeti.bl)
  const bl = kalem?.bl ?? 0;
  const blMetin = bl ? ` + B/L ${sayiYaz(bl)}` : "";
  const ekDayanak = ekDayanak0 + (bl ? " B/L bedeli: mail (konteyner başına tam eklendi)." : "");
  const blYaklasik = !!(kalem?.blKalem && kalem.blKalem.para !== "USD");
  const ortak = { navlun, ek, kalem, ...(yaklasik || blYaklasik ? { yaklasik: true } : {}) };
  if (durum === "dahil") {
    const toplam = yuvarla(navlunUsd + ek + bl);
    return { ...ortak, lokal: 0, toplam, kesin: true, lokalDurum: "dahil", temel: "toplam", kaynak, dayanak: dayanak + ekDayanak, celiski: null,
      metin: ek || eurMu || bl ? `${nav}${ekMetin}${blMetin} = ${y}${sayiYaz(toplam)}` : "lokal dahil" };
  }
  if (durum === "haric") {
    const kirk = (t.ekipman || "20DC").startsWith("40");
    const hafizaLokal = h ? (kirk ? h.lokal_40 : h.lokal_20) : null;
    const mailLokal = kalem?.lokal ?? null;
    const lokal = mailLokal ?? (hafizaLokal && hafizaLokal > 0 ? hafizaLokal : null);
    const celiski = mailLokal !== null && hafizaLokal && hafizaLokal > 0 && !lokalAyniMi(mailLokal, hafizaLokal)
      ? `Maildeki lokal ${sayiYaz(mailLokal)} ≠ acente hafızası ${sayiYaz(hafizaLokal)}` : null;
    const lokalKaynagi = mailLokal !== null ? " Lokal tutarı: maildeki lokal tablosu." : lokal !== null ? " Lokal tutarı: acente hafızası." : "";
    if (lokal !== null) {
      const toplam = yuvarla(navlunUsd + lokal + ek + bl);
      return { ...ortak, lokal, toplam, kesin: !celiski, lokalDurum: "haric", temel: "toplam", kaynak, celiski,
        dayanak: dayanak + lokalKaynagi + ekDayanak + (celiski ? ` KONTROL: ${celiski}.` : ""),
        metin: `${nav} + lokal ${sayiYaz(lokal)}${ekMetin}${blMetin} = ${y}${sayiYaz(toplam)}${celiski ? " (kontrol)" : ""}` };
    }
    return { ...ortak, lokal: null, toplam: yuvarla(navlunUsd + ek + bl), kesin: false, lokalDurum: "haric", temel: "toplam", kaynak, dayanak: dayanak + ekDayanak, celiski: null,
      metin: `${nav} + lokal (tutarı bilinmiyor)${blMetin}` };
  }
  return { ...ortak, lokal: null, toplam: yuvarla(navlunUsd + ek + bl), kesin: false, lokalDurum: "bilinmiyor", temel: "toplam", kaynak, dayanak: dayanak + ekDayanak, celiski: null,
    metin: "lokal belirsiz" };
}

/**
 * En iyi teklif: YALNIZ toplami kesin olanlar arasinda en dusuk toplam. Kesin olmayanlar ayrica doner (en dusugu) -
 * ekranda "lokal belirsiz" diye gosterilir, hicbir zaman tek basina "en iyi" / "hedefte" sayilmaz.
 */
export function enIyiSec<T>(liste: T[], k: (x: T) => Karsilastirma): { enIyi: T | null; belirsiz: T | null } {
  let enIyi: T | null = null;
  let belirsiz: T | null = null;
  for (const x of liste) {
    const c = k(x);
    if (c.kesin) { if (!enIyi || c.toplam < k(enIyi).toplam) enIyi = x; }
    else if (!belirsiz || c.toplam < k(belirsiz).toplam) belirsiz = x;
  }
  return { enIyi, belirsiz };
}

/**
 * SUNUCU DEGERLENDIRMESI (navlun_teklif_degerlendirme satiri; edge navlun-bildirimi "degerlendir" yazar). 25.11.2026: sayfadan
 * (lib/navlun/ozet.ts) buraya tasindi; sayfa, 17:00 navlun maili ve siparis raporu AYNI donusumu kullanir (tek hesap yeri).
 */
export type SunucuDegerlendirmesi = {
  toplam_usd: number;
  lokal: number | null;
  ek: number;
  lokal_durum: "dahil" | "haric" | "bilinmiyor";
  metin: string | null;
  dayanak: string | null;
  celiski: string | null;
  yaklasik: boolean;
  durum: "kesin" | "kontrol" | "eksik" | "suresi_doldu";
  en_iyi: boolean;
  gecerlilik_bitis: string | null;
};

/** Sunucu degerlendirmesini karsilastirma bicimine cevirir (hesap yok; yalniz bicim). Gecerlilik ayrica (durum). */
export function sunucuKarsilastirmasi(tutar: number, d: SunucuDegerlendirmesi): Karsilastirma {
  const metin = d.metin || "";
  const dayanak = d.dayanak || "";
  const temel = metin.startsWith("yalnız navlun") ? "navlun" as const : "toplam" as const;
  const kaynak = temel === "navlun" ? "liman" as const : dayanak.startsWith("Teklif metninde") ? "mail" as const
    : dayanak.startsWith("Acente hafızası") ? "hafiza" as const : dayanak.startsWith("Rezervasyondan") ? "rezervasyon" as const : "yok" as const;
  // Gecerlilik ayrica isaretlenir (suresi_doldu); burada lokal / celiski kesinligi
  const kesin = temel === "navlun" || (!d.celiski && (d.lokal_durum === "dahil" || (d.lokal_durum === "haric" && d.lokal !== null)));
  return {
    navlun: tutar, lokal: d.lokal_durum === "dahil" ? 0 : d.lokal, ek: d.ek, toplam: d.toplam_usd, kesin, lokalDurum: d.lokal_durum, temel, kaynak,
    metin, dayanak, yaklasik: d.yaklasik, celiski: d.celiski,
  };
}
