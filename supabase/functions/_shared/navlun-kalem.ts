/**
 * NAVLUN TEKLIF KALEMLERI (24.11.2026). SAF: veri yok, ag yok, import yok.
 *
 * Kullanici (24.11.2026): "Konteyner basi navlunun dogru bir sekilde hesaplanabilmesi gerekiyor. Bazi durumlarda muhur
 * fiyati + KDV falan dahil edenler de oluyor." Okuyucu (navlun-oku.ts) "+Seal Fee : Usd 18+kdv / Cntr", "Gecici kabul
 * ucreti Usd 150 (+) Kdv Beher konteyner" gibi satirlari navlun sanmamak icin atliyordu ama tutarlarini hicbir yere
 * yazmiyordu; konteyner basi toplam yalniz elle girilen acente hafizasindan geliyordu.
 *
 * Bu modul mailden KALEM LISTESI cikarir ve konteyner basi toplami KOD hesaplar (yapay zeka degil):
 *   - Her kalemin SABIT KODU vardir (MUHUR, LOKAL, YUKLEME, ...): "Muhur" / "Seal Fee" ayni kalemdir; cift sayim yok,
 *     mail ile acente hafizasi ayni temelde karsilastirilir.
 *   - Birim: konteyner / bl / islem. Yalniz KONTEYNER BASI kalemler toplama girer; BL ve islem basi kalemler gosterilir.
 *     25.11.2026 istisna (kullanici onayi): ZORUNLU B/L (konsimento) bedeli konteyner basi toplama tam eklenir (KalemOzeti.bl).
 *   - KDV toplama EKLENMEZ (ihracat hizmet KDV'si indirilir, maliyet degildir). VGM EKLENMEZ (tartim kendi kantarimizda).
 *   - Kosullu kalemler ("ilave muhur kullanilmasi halinde", iptal, duzeltme, IMO, reefer, collect / alicidan) EKLENMEZ.
 *   - Lokal tablosu bolumleri: "FABRIKA DOLUM" bolumu esastir (yuklemeler fabrika dolum); "LIMAN DOLUM" bolumu toplama
 *     girmez. Bolumsuz "lokal masraflari" basligi genel bolumdur.
 *   - USD disi kalem (EUR / TL) kurla USD'ye cevrilip toplanir, toplam "yaklasik" isaretlenir.
 * Navlun tutarinin kendisi burada OKUNMAZ (navlun-oku.ts); "navlun / all in / tasima fiyati" satirlari atlanir.
 */

export type KalemKodu =
  | "LOKAL" | "YUKLEME" | "GECICI_KABUL" | "ISPS" | "MUHUR" | "LIMAN_DOLUM"
  | "VGM" | "ENS" | "TELEX" | "BL" | "SURSARJ" | "CEZA" | "DIGER";
export type KalemBirim = "konteyner" | "bl" | "islem";
export type KalemPara = "USD" | "EUR" | "TRY";
/** fabrika: fabrika dolum lokal tablosu; liman: liman dolum tablosu (toplama girmez); genel: dolum belirtilmeyen lokal tablosu; null: tablo disi tek satir */
export type KalemBlok = "fabrika" | "liman" | "genel" | null;

export type NavlunKalem = {
  kod: KalemKodu;
  /** Mailde yazan ad (kisaltilmis) */
  ad: string;
  tutar: number;
  para: KalemPara;
  birim: KalemBirim;
  /** "20" / "40" ya da null (her ekipman) */
  ekipman: "20" | "40" | null;
  kdv: boolean;
  kosullu: boolean;
  blok: KalemBlok;
  kaynak: "kural" | "yz";
};

export const KALEM_KODLARI: KalemKodu[] = ["LOKAL", "YUKLEME", "GECICI_KABUL", "ISPS", "MUHUR", "LIMAN_DOLUM", "VGM", "ENS", "TELEX", "BL", "SURSARJ", "CEZA", "DIGER"];

export const KALEM_ADI: Record<KalemKodu, string> = {
  LOKAL: "lokal", YUKLEME: "yükleme / terminal", GECICI_KABUL: "geçici kabul", ISPS: "gemi güvenlik", MUHUR: "mühür",
  LIMAN_DOLUM: "liman dolum", VGM: "VGM", ENS: "ENS / gümrük bildirimi", TELEX: "telex / SWB", BL: "konşimento",
  SURSARJ: "sürşarj", CEZA: "iptal / düzeltme", DIGER: "diğer",
};

/** Sabit kod kurali: SIRA ONEMLI (ilk eslesen). */
const KOD_KURALLARI: [KalemKodu, RegExp][] = [
  ["CEZA", /iptal|cancel|erteleme|kayd[ıi]r|eksiltme|d[üu]zeltme|correction|manifest|ceza|demuraj|demurrage|detention|serme|toplama bedeli|elle[çc]leme|de[ğg]i[şs]iklik/i],
  ["LIMAN_DOLUM", /liman\s*dolum|port\s*stuff/i],
  ["GECICI_KABUL", /ge[çc]ici\s*kabul/i],
  ["MUHUR", /m[üu]h[üu]r|\bseal\b/i],
  ["VGM", /\bvgm\b|do[ğg]rulanm[ıi][şs]\s*br[üu]t/i],
  ["ENS", /\b(?:ens|ams|cus|acd|aci|ics2|ic2|scmc|afr|isf)\b/i],
  ["TELEX", /telex|\bswb\b|seaway\s*bill|release/i],
  ["BL", /kon[şs]imento|\bb\s*\/?\s*-?\s*l\b(?!\s*ba[şs])|\bobl\b|d[öo]k[üu]man|documentation|\bdoc\b|smdc|sertifika|\bloi\b/i],
  ["ISPS", /\bisps\b|g[üu]venlik|security/i],
  ["SURSARJ", /\b(?:eis|ebs|caf|baf|lss|pss|gri|ecs|ets|efs|eca|nbf|ess|ips|maf|ers|war)\b|surcharge|s[üu]r[şs]arj/i],
  ["YUKLEME", /y[üu]kleme\s*(?:gider|[üu]cret|bedel)|loading|terminal|\bthc\b|othc|i[şs]letme|handling|liman\s*ve|liman\s*gider/i],
];

/** Kosul / ozel durum isaretleri: bu satirdaki kalem toplama girmez. */
const KOSUL = new RegExp([
  "halinde", "durumunda", "talep", "istenmesi", "gerektiren", "unutul", "k[ıi]r[ıi]lan", "ikinci", "ilave", "\\bek\\s+(?:m[üu]h[üu]r|vgm|dolum|liman|masraf)",
  "farkl[ıi]\\s*g[üu]n", "\\bimo", "tehlikeli", "reefer", "open\\s*top", "\\bot\\b", "ta[şs]mal[ıi]", "branda", "etiket",
  "collect", "al[ıi]c[ıi]dan", "tahliye", "var[ıi][şs]l[ıi]", "ge[çc]erli\\s*olacak", "uzakdo[ğg]u", "japonya", "avrupa\\s*birli",
  "\\bif\\b", "upon\\s*request", "when\\s*applicable", "tarafımızdan\\s*yap", "tarafimizdan\\s*yap", "tarafımızca\\s*yap", "online",
].join("|"), "i");

/** Navlun satiri (tutari navlun-oku okur): kalem degildir. */
const NAVLUN_SATIRI = /\bnavlun\b|\bfreight\b|\bocean\b|all\s*-?\s*in\b|ta[şs][ıi]ma\s*fiyat|herşey\s*dahil|her\s*[şs]ey\s*dahil|\btoplam\b/i;

/** Lokal tablosu basligi (tutarsiz satir). */
// "Giderleri" / "Ucreti" kalem adidir (Ihracat Liman ve Isletme Giderleri), baslik degil: baslik "masraflari" / "local charges" der.
const BOLUM_BASLIGI = /(?:lokal|local|liman|port|[iİI]hracat)[^\n]{0,40}(?:masraf|charges)/i;
/** Bolumu bitiren satir */
// 24.11.2026 (fark listesi: PDF teklifin "Genel Sartlar" maddelerindeki iptal / duzeltme ucretleri lokal tablosu sanildi):
// sart / not basligi ve numarali madde ("3. ...", "12 - ...") bolumu bitirir.
const BOLUM_SONU = /^(?:free\s*time|ge[çc]erlilik|validity|transit|\btt\b|navlun|sayg[ıi]|best\s*regards|iyi\s*[çc]al[ıi][şs]malar|gemi\s*program|rezervasyon\s*talep|genel\s*[şs]art|[şs]artlar|terms|conditions|notlar?\b|\d{1,2}\s*[.)\-]\s)/i;
/** Uzun duz yazi satiri (sart / aciklama cumlesi): fiyat satiri degildir; icindeki tutar kosullu sayilir, bolumu bitirir. */
const UZUN_SATIR = 150;

/** Tutar: "USD 45", "Usd 150,", "45 USD", "$200", "25.-USD", "TL 1750", "EUR 34". */
const TUTAR = /(?:(usd|eur|tl|try|\$|€)\s*[:\-–]?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*\.\s*-)?)|(?:(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:\.\s*-|\.-)?\s*(usd|eur|tl|try|\$|€))/gi;

function paraKodu(s: string): KalemPara {
  const p = s.toLowerCase();
  if (p === "eur" || p === "€") return "EUR";
  if (p === "tl" || p === "try") return "TRY";
  return "USD";
}

/** "1.750" -> 1750, "1,700.00" -> 1700, "45,50" -> 45.5, "2.964" -> 2964 */
export function kalemSayisi(s: string): number {
  const t = s.trim();
  if (/^\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$/.test(t)) {
    const son = t.match(/[.,](\d{1,2})$/);
    const tam = son ? t.slice(0, -son[0].length) : t;
    return Number(tam.replace(/[.,]/g, "")) + (son ? Number(`0.${son[1]}`) : 0);
  }
  return Number(t.replace(",", "."));
}

function birimBul(s: string, kod: KalemKodu): KalemBirim {
  if (/(?:\/|per|beher|ba[şs][ıi]na)\s*(?:b\s*\/?\s*-?\s*l|set|kon[şs]imento)\b|\bper\s*bl\b|\/\s*bl\b|bl\s*ba[şs][ıi]na/i.test(s)) return "bl";
  if (/i[şs]lem\s*(?:bazında|bazinda|ba[şs][ıi]na)|rezervasyon\s*ba[şs][ıi]na|booking\s*ba[şs][ıi]na|talimat[ıi]?\s*ba[şs][ıi]na|per\s*booking/i.test(s)) return "islem";
  if (/cntr|konteyner|container|beher|per\s*c|\bteu\b|\/\s*unit|\/\s*(?:20|40)\s*'?/i.test(s)) return "konteyner";
  if (kod === "ENS" || kod === "TELEX" || kod === "BL") return "bl";
  if (kod === "CEZA") return "islem";
  return "konteyner";
}

function kodBul(ad: string, bolumde: boolean): KalemKodu | null {
  for (const [kod, r] of KOD_KURALLARI) if (r.test(ad)) return kod;
  return bolumde ? "LOKAL" : null;
}

const ekipmanIzi = (s: string): "20" | "40" | null => {
  const m = s.match(/^\s*(?:\.\s*-)?\s*(?:\+\s*kdv\s*)?\/?\s*(20|40)\s*['’]?/i) || s.match(/^\s*(?:\+\s*kdv\s*)?\/\s*(?:per\s*)?(20|40)/i);
  return m ? (m[1] as "20" | "40") : null;
};

const kisalt = (s: string) => s.replace(/[*•\t]+/g, " ").replace(/^[\s+\-–:]+/, "").replace(/\s{2,}/g, " ").replace(/[\s:,;(]+$/, "").trim().slice(0, 60);

/**
 * Mail metninden kalem listesi (kural tabanli). Metin: mailin YENI kismi (alinti haric) + varsa ek metni.
 * En fazla 40 kalem; ayni kod + tutar + ekipman + bolum bir kez.
 */
export function kalemleriOku(metin: string): NavlunKalem[] {
  const satirlar = (metin || "").replace(/\r/g, "").replace(/[’`´]/g, "'").split("\n").map((x) => x.trim());
  const sonuc: NavlunKalem[] = [];
  const gorulen = new Set<string>();
  let blok: KalemBlok = null;
  let kolonlar: ("20" | "40")[] = [];
  let bekleyenAd: string | null = null;
  let bekleyenSira = 0;
  let bolumSatir = 0;
  // 25.11.2026 (Singapur, COSCO formu): tablo DISINDA ad bir satirda, tutar alt satirda ("B/L Bedeli" / "USD 25").
  // Yalniz hemen onceki kisa satir ad sayilir; kod kurali tutmayan ad (aciklama cumlesi) kalem uretmez.
  let tekEtiket: string | null = null;

  const ekle = (k: NavlunKalem) => {
    const a = `${k.kod}|${k.tutar}|${k.para}|${k.ekipman ?? ""}|${k.blok ?? ""}|${k.birim}`;
    if (gorulen.has(a) || sonuc.length >= 40) return;
    gorulen.add(a);
    sonuc.push(k);
  };

  for (const satir of satirlar) {
    if (!satir) continue;
    const tutarlar = Array.from(satir.matchAll(TUTAR));
    // Bolum basligi (tutarsiz): "AMBARLI FABRIKA DOLUM IHRACAT LIMAN MASRAFLARI", "Ornekport ... Lokal Masraflari (Liman Dolum)"
    if (!tutarlar.length && satir.length <= 160 && BOLUM_BASLIGI.test(satir) && !KOSUL.test(satir.replace(/non[- ]?imo/ig, ""))) {
      blok = /fabrika|factory|door|kap[ıi]/i.test(satir) ? "fabrika" : /liman\s*dolum|port\s*stuff|cfs/i.test(satir) ? "liman" : "genel";
      kolonlar = []; bekleyenAd = null; bekleyenSira = 0; bolumSatir = 0;
      continue;
    }
    if (blok && (BOLUM_SONU.test(satir) || satir.length > UZUN_SATIR || ++bolumSatir > 40)) { blok = null; kolonlar = []; bekleyenAd = null; }
    // Kolon basligi: "20'" / "40'" / "20'DC"
    const kolon = satir.match(/^(20|40)\s*'?\s*(?:dc|dv|hc|hq)?\s*$/i);
    if (kolon) { tekEtiket = null; if (blok && kolonlar.length < 2) kolonlar.push(kolon[1] as "20" | "40"); continue; }
    if (!tutarlar.length) {
      // Bolum icinde tutarsiz kisa satir: sonraki tutar satirlarinin adi ("Ihracat Yukleme Giderleri")
      if (blok && satir.length <= 120 && /[a-zçğıöşü]{3}/i.test(satir) && !/^\*/.test(satir)) { bekleyenAd = satir; bekleyenSira = 0; }
      tekEtiket = !blok && satir.length <= 60 && /[a-zçğıöşü]{3}/i.test(satir) && !/^\*/.test(satir) ? satir : null;
      continue;
    }
    const etiket = tekEtiket;
    tekEtiket = null;
    const ilk = tutarlar[0].index ?? 0;
    const onEk = satir.slice(0, ilk);
    const adHam = /[a-zçğıöşü]{2}/i.test(onEk) ? onEk : (bekleyenAd ?? (!blok && etiket ? etiket : ""));
    const ad = adHam ? `${adHam} ${satir.slice(ilk)}` : satir;
    const yalnizTutar = !/[a-zçğıöşü]{2}/i.test(onEk);
    if (NAVLUN_SATIRI.test(adHam || satir)) continue;
    const bolumde = blok !== null;
    const kod = kodBul(adHam || satir, bolumde) ?? (/^\+/.test(satir) ? kodBul(satir, false) ?? "DIGER" : null);
    if (!kod) continue;
    const kosullu = kod === "CEZA" || satir.length > UZUN_SATIR || KOSUL.test(ad.replace(/non[- ]?imo/ig, ""));
    const kdv = /k\s*d\s*v|\bvat\b/i.test(satir);
    const birim = birimBul(satir, kod);
    for (const m of tutarlar) {
      const deger = kalemSayisi(m[2] ?? m[3] ?? "");
      if (!(deger > 0 && deger < 100000)) continue;
      const son = (m.index ?? 0) + m[0].length;
      let ekipman = ekipmanIzi(satir.slice(son, son + 16));
      if (!ekipman && yalnizTutar && tutarlar.length === 1 && kolonlar.length === 2) ekipman = kolonlar[Math.min(bekleyenSira, 1)];
      ekle({
        kod, ad: kisalt(adHam || satir.slice(0, ilk) || KALEM_ADI[kod]) || KALEM_ADI[kod], tutar: deger, para: paraKodu(m[1] ?? m[4] ?? "usd"),
        birim, ekipman, kdv, kosullu, blok, kaynak: "kural",
      });
    }
    // Tablo icinde adli satirin devami ("Liman dolum ucreti Usd 145/20'" + alt satirda "Usd 180/40'") ayni adi tasir
    if (yalnizTutar && bekleyenAd) bekleyenSira++;
    else if (!yalnizTutar && blok) { bekleyenAd = kisalt(onEk) || null; bekleyenSira = 1; }
  }
  return sonuc;
}

export type Kur = { EUR: number; TRY: number; tarih: string };
/** Kur verilemezse kullanilan YAKLASIK deger (yalniz siralama icindir; toplam "yaklasik" isaretlenir). */
export const VARSAYILAN_KUR: Kur = { EUR: 1.15, TRY: 0.0235, tarih: "varsayılan" };

export const usdKarsiligi = (tutar: number, para: string | null | undefined, kur: Kur): number =>
  !para || para === "USD" ? tutar : para === "EUR" ? tutar * kur.EUR : para === "TRY" ? tutar * kur.TRY : tutar;

export type KalemOzeti = {
  /** Secilen lokal bolumunun konteyner basi zorunlu kalemleri toplami (USD); bolum yoksa null */
  lokal: number | null;
  lokalKalemler: NavlunKalem[];
  /** Tablo disi konteyner basi zorunlu kalemler toplami (USD) */
  ek: number;
  ekKalemler: NavlunKalem[];
  /** Toplama girmeyen, bilgi icin gosterilen kalemler (kosullu, BL / islem basi, VGM, liman dolum) */
  digerleri: NavlunKalem[];
  /** USD disi kalem kurla cevrildi */
  yaklasik: boolean;
  /** Secilen bolum */
  bolum: KalemBlok;
  /**
   * 25.11.2026 (kullanici + operasyon: Singapur COSCO 95 + "B/L Bedeli USD 25" > OOCL 100 all in): zorunlu B/L (konsimento)
   * bedeli konteyner basi toplama TAM eklenir (USD). Kosullu B/L ucretleri (telex, duzeltme, sertifika) eklenmez. Yoksa 0.
   */
  bl: number;
  blKalem: NavlunKalem | null;
};

/** Zorunlu konsimento bedeli adi (telex / release / sertifika / LOI degil) */
const BL_BEDELI = /kon[şs]imento|\bb\s*\/?\s*-?\s*l\b|bill\s*of\s*lading|d[öo]k[üu]man|documentation|\bdoc\b/i;
const BL_DEGIL = /sertifika|\bloi\b|telex|release|\bswb\b|seaway|smdc/i;

const yuvarla = (x: number) => Math.round(x * 100) / 100;

/** Bir teklifin (ekipman) icin kalem ozeti. Toplam KOD ile hesaplanir. */
export function kalemOzeti(kalemler: NavlunKalem[] | null | undefined, ekipman: string | null | undefined, kur: Kur = VARSAYILAN_KUR): KalemOzeti {
  const e: "20" | "40" = (ekipman || "20DC").startsWith("40") ? "40" : "20";
  const liste = (kalemler || []).filter((k) => k.ekipman === null || k.ekipman === e);
  const sayilir = (k: NavlunKalem) => !k.kosullu && k.birim === "konteyner" && k.kod !== "VGM" && k.kod !== "CEZA" && k.kod !== "LIMAN_DOLUM" && k.blok !== "liman";
  const bolum: KalemBlok = liste.some((k) => k.blok === "fabrika" && sayilir(k)) ? "fabrika" : liste.some((k) => k.blok === "genel" && sayilir(k)) ? "genel" : null;
  const lokalKalemler = bolum ? liste.filter((k) => k.blok === bolum && sayilir(k)) : [];
  const lokalKodlari = new Set(lokalKalemler.map((k) => k.kod));
  // Tablo disi tek satir: ayni kod lokal bolumunde varsa cift sayilmaz; ayni kod tablo disinda iki kez yazildiysa en buyugu
  const tekler = new Map<KalemKodu, NavlunKalem>();
  for (const k of liste) {
    if (k.blok !== null || !sayilir(k) || lokalKodlari.has(k.kod)) continue;
    const v = tekler.get(k.kod);
    if (!v || usdKarsiligi(k.tutar, k.para, kur) > usdKarsiligi(v.tutar, v.para, kur)) tekler.set(k.kod, k);
  }
  const ekKalemler = Array.from(tekler.values());
  // Zorunlu B/L bedeli: tek kalem (ayni bedel iki kez yazildiysa en buyugu); liman dolum bolumundeki sayilmaz
  const blKalem = liste.filter((k) => k.kod === "BL" && k.birim === "bl" && !k.kosullu && k.blok !== "liman" && BL_BEDELI.test(k.ad) && !BL_DEGIL.test(k.ad))
    .sort((a, b) => usdKarsiligi(b.tutar, b.para, kur) - usdKarsiligi(a.tutar, a.para, kur))[0] ?? null;
  const secilen = new Set([...lokalKalemler, ...ekKalemler, ...(blKalem ? [blKalem] : [])]);
  const digerleri = liste.filter((k) => !secilen.has(k) && !(k.blok !== null && k.blok !== bolum && sayilir(k)));
  const topla = (xs: NavlunKalem[]) => yuvarla(xs.reduce((s, k) => s + usdKarsiligi(k.tutar, k.para, kur), 0));
  return {
    lokal: lokalKalemler.length ? topla(lokalKalemler) : null,
    lokalKalemler,
    ek: topla(ekKalemler),
    ekKalemler,
    digerleri,
    yaklasik: [...lokalKalemler, ...ekKalemler].some((k) => k.para !== "USD"),
    bolum,
    bl: blKalem ? yuvarla(usdKarsiligi(blKalem.tutar, blKalem.para, kur)) : 0,
    blKalem,
  };
}

/** Saklama / RPC icin kalem dogrulama (YZ ciktisi ya da eski kayit): gecersiz alanli kalem atilir. */
export function kalemDogrula(x: unknown): NavlunKalem | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const kod = KALEM_KODLARI.includes(r.kod as KalemKodu) ? (r.kod as KalemKodu) : null;
  const tutar = Number(r.tutar);
  const para = r.para === "EUR" || r.para === "TRY" ? r.para : r.para === "USD" || r.para == null ? "USD" : null;
  const birim = r.birim === "konteyner" || r.birim === "bl" || r.birim === "islem" ? r.birim : null;
  const ekipman = r.ekipman === "20" || r.ekipman === "40" ? r.ekipman : null;
  const blok = r.blok === "fabrika" || r.blok === "liman" || r.blok === "genel" ? r.blok : null;
  if (!kod || !(tutar > 0 && tutar < 100000) || !para || !birim) return null;
  return {
    kod, ad: (typeof r.ad === "string" ? r.ad : KALEM_ADI[kod]).slice(0, 60), tutar, para, birim, ekipman,
    kdv: r.kdv === true, kosullu: r.kosullu === true, blok, kaynak: r.kaynak === "yz" ? "yz" : "kural",
  };
}
