/**
 * NAVLUN YAPAY ZEKA OKUMASI - SAF KISIM (24.11.2026). Ag yok; Gemini cagrisi navlun-yz-cagri.ts'de.
 *
 * Karma yapi (kullanici onayi 24.11.2026): duz metin teklifler KURALLARLA okunur (navlun-oku.ts, %97 isabet, bedava,
 * deterministik). Yapay zeka YALNIZ kurallarin okuyamadigi durumlarda devreye girer:
 *   - "teklif ekte" denip ek okunamadi (durum okunamadi),
 *   - mailde ek dosya (PDF / gorsel / Excel) var ve metinde fiyat yok,
 *   - metinde fiyat izi + ekipman var ama kurallar fiyat cikaramadi (tablo halindeki mail).
 * Yapay zeka sabit JSON semasina gore yazar; TOPLAMI hesaplamaz (kod hesaplar: navlun-kalem.ts / navlun-karsilastirma.ts).
 * Modelin kendi "guven skoru" kullanilmaz; cikti KENDI DENETIMIMIZDEN gecer (yzDenetle):
 *   - tutar kaynak metinde AYNEN geciyor mu (uydurma rakam yakalanir),
 *   - liman konudaki limanla / metinle tutarli mi, ekipman 20DC / 40DC / 40HC mi, tutar makul aralikta mi,
 *   - ayni acentenin / limanin gecmis tekliflerine gore olagandisi mi (yalniz dosyadan okunan, metni olmayan teklifte zorunlu).
 * Denetimden gecmeyen ya da Gemini'ye ulasilamayan teklif otomatik KAYDEDILMEZ: mail "okunamadi" (hata kuyrugu =
 * "kontrol bekliyor") listesine duser, yapay zekanin onerisi notta gorunur.
 */
import { kalemDogrula, KALEM_KODLARI, type NavlunKalem } from "./navlun-kalem.ts";
import { limanAnahtari } from "./liman-anahtari.ts";

/** Gemini responseSchema (OpenAPI alt kumesi). */
export const NAVLUN_YZ_SEMA = {
  type: "OBJECT",
  properties: {
    teklifler: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          liman: { type: "STRING", nullable: true, description: "Varis (tahliye) limani, mailde yazdigi gibi" },
          ekipman: { type: "STRING", enum: ["20DC", "40DC", "40HC"] },
          tutar: { type: "NUMBER", description: "Konteyner basi DENIZ NAVLUNU (lokal / ek kalem degil)" },
          para: { type: "STRING", enum: ["USD", "EUR"] },
          lokal_dahil: { type: "STRING", enum: ["dahil", "haric", "belirsiz"] },
          lokal_kanit: { type: "STRING", nullable: true, description: "Lokal dahil / haric bilgisinin mailden AYNEN alintisi" },
          armator: { type: "STRING", nullable: true },
          free_time_gun: { type: "INTEGER", nullable: true },
          transit_gun: { type: "STRING", nullable: true, description: "Ornek: 35 ya da 40-42" },
          gecerlilik: { type: "STRING", nullable: true, description: "Ornek: 30.11.2026" },
          kanit: { type: "STRING", description: "Tutarin gectigi satirin mailden AYNEN alintisi" },
        },
        required: ["ekipman", "tutar", "para", "lokal_dahil", "kanit"],
      },
    },
    kalemler: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          kod: { type: "STRING", enum: KALEM_KODLARI },
          ad: { type: "STRING" },
          tutar: { type: "NUMBER" },
          para: { type: "STRING", enum: ["USD", "EUR", "TRY"] },
          birim: { type: "STRING", enum: ["konteyner", "bl", "islem"] },
          ekipman: { type: "STRING", enum: ["20", "40", "hepsi"] },
          kdv: { type: "BOOLEAN" },
          kosullu: { type: "BOOLEAN" },
          blok: { type: "STRING", enum: ["fabrika", "liman", "genel", "yok"] },
        },
        required: ["kod", "ad", "tutar", "para", "birim", "ekipman", "kdv", "kosullu", "blok"],
      },
    },
  },
  required: ["teklifler", "kalemler"],
} as const;

/** Gemini'ye giden yonerge. Konu ve kaynak metin ayri parcada gider. */
export function yzYonergesi(konu: string): string {
  return [
    "Sen bir ihracat firmasinin navlun teklifi okuyucususun. Asagida bir gemi acentesinin navlun talebimize verdigi cevap var",
    `(konu: "${konu.slice(0, 200)}"). Yukleme Turkiye'den (ornegin Ambarli). Yalniz ACENTENIN VERDIGI fiyatlari cikar.`,
    "KURALLAR:",
    "1. teklifler: konteyner basi DENIZ NAVLUNU. Lokal masraf, muhur, VGM, ENS, telex, iptal / duzeltme ucretleri navlun DEGILDIR.",
    "   'all in' / 'lokal dahil' fiyat navlundur (lokal_dahil = dahil). Fiyat acikca yazmiyorsa teklifler BOS dizi olsun.",
    "   Bizim hedef fiyatimiz ya da alintilanan eski yazismadaki fiyat teklif degildir. Birden fazla liman / ekipman varsa her biri ayri satir.",
    "2. lokal_dahil: mailde 'lokal dahil', 'all in', 'liman masraflari dahil' -> dahil; '+ lokaller', 'lokal haric' -> haric; yazmiyorsa belirsiz.",
    "   lokal_kanit: bu bilginin mailden AYNEN alintisi (yoksa null).",
    "3. kalemler: navlun disindaki her ucret satiri. kod: MUHUR (muhur / seal), YUKLEME (terminal, isletme, yukleme, THC), GECICI_KABUL,",
    "   ISPS (gemi guvenlik), LOKAL (lokal tablosundaki diger), LIMAN_DOLUM, VGM, ENS (ENS / AMS / ACD / ICS2), TELEX (telex / SWB),",
    "   BL (konsimento, dokuman, sertifika, LOI), SURSARJ (EIS, BAF, CAF, PSS ...), CEZA (iptal, erteleme, duzeltme, manifesto), DIGER.",
    "   birim: konteyner basi / BL basi (set) / islem basi. ekipman: 20, 40 ya da hepsi. kdv: '+KDV' yaziyorsa true.",
    "   kosullu: yalniz belli durumda alinan ucret ('halinde', 'durumunda', 'talep edilirse', iptal, IMO, reefer, collect / alicidan,",
    "   tahliye tarafi, belli bolgeler icin) -> true. blok: 'fabrika dolum' lokal tablosu -> fabrika, 'liman dolum' tablosu -> liman,",
    "   dolum belirtmeyen lokal tablosu -> genel, tablo disi tek satir -> yok.",
    "4. kanit: tutarin gectigi satiri mailden AYNEN kopyala. Rakam UYDURMA, hesaplama YAPMA, toplam YAZMA.",
  ].join("\n");
}

export type YzTeklif = {
  liman: string | null; liman_anahtar: string | null; ekipman: "20DC" | "40DC" | "40HC"; tutar: number; para: "USD" | "EUR";
  lokal_dahil: boolean | null; armator: string | null; free_time_gun: number | null; transit_gun: string | null; gecerlilik: string | null;
};

export type YzDenetimGirdisi = {
  /** Modele giden metin (mail + ek metni). Yalniz dosya gonderildiyse null: tutar metinde aranamaz. */
  metin: string | null;
  /** Konudaki liman anahtari (navlun-oku konudanLiman -> limanAnahtari) */
  konuLimanAnahtar: string | null;
  /** Ayni liman + ekipman icin son 120 gunun teklif medyani (USD); yoksa null */
  referans?: (limanAnahtar: string | null, ekipman: string) => number | null;
  /** EUR -> USD (referans karsilastirmasi icin) */
  eurUsd?: number;
  /** Modele PDF / gorsel dosya da gitti: metinde olmayan tutar dosyadan okunmus olabilir (o zaman gecmis teklif referansi ZORUNLU) */
  dosyadan?: boolean;
};

export type YzDenetimSonucu = {
  gecti: boolean;
  teklifler: YzTeklif[];
  kalemler: NavlunKalem[];
  /** Engelleyici sorunlar (biri varsa teklif kaydedilmez) */
  sorunlar: string[];
  /** Bilgi notlari (kalem atildi vb.) */
  notlar: string[];
};

const duzle = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/[’`´]/g, "'").replace(/\s+/g, " ").trim();

/** n sayisi metinde rakam olarak geciyor mu? 1850 -> "1850", "1.850", "1,850", "1850.00", "1.850,00" */
export function sayiMetindeVar(metin: string, n: number): boolean {
  if (!Number.isFinite(n) || n <= 0) return false;
  const tam = Math.trunc(n);
  const kesir = Math.round((n - tam) * 100);
  const d = String(tam);
  const binli = d.replace(/\B(?=(\d{3})+(?!\d))/g, "[.,]?");
  const kesirKismi = kesir ? `[.,]${String(kesir).padStart(2, "0").replace(/0$/, "")}0?` : "(?:[.,]0{1,2})?";
  return new RegExp(`(?<![\\d.,])${binli}${kesirKismi}(?![\\d]|[.,]\\d)`).test(metin);
}

const sayiYaz = (x: number) => x.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

/** Model ciktisini denetler. Toplam hesaplanmaz; yalniz okunan degerler dogrulanir. */
export function yzDenetle(cikti: unknown, g: YzDenetimGirdisi): YzDenetimSonucu {
  const sorunlar: string[] = [];
  const notlar: string[] = [];
  const r = (cikti && typeof cikti === "object" ? cikti : {}) as Record<string, unknown>;
  const hamTeklifler = Array.isArray(r.teklifler) ? r.teklifler.slice(0, 30) : null;
  const hamKalemler = Array.isArray(r.kalemler) ? r.kalemler.slice(0, 60) : [];
  if (!hamTeklifler) return { gecti: false, teklifler: [], kalemler: [], sorunlar: ["Yapay zekâ çıktısı şemaya uymuyor."], notlar };
  const metin = g.metin ? g.metin.replace(/\r/g, "") : null;
  const metinDuz = metin ? duzle(metin) : "";
  const teklifler: YzTeklif[] = [];
  for (const x of hamTeklifler) {
    const t = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const tutar = Number(t.tutar);
    const ekipman = t.ekipman === "20DC" || t.ekipman === "40DC" || t.ekipman === "40HC" ? t.ekipman : null;
    const para = t.para === "EUR" ? "EUR" : t.para === "USD" ? "USD" : null;
    const liman = typeof t.liman === "string" && t.liman.trim() ? t.liman.trim().slice(0, 80) : null;
    const etiket = `${liman ?? "liman yok"} ${ekipman ?? "?"} ${Number.isFinite(tutar) ? sayiYaz(tutar) : "?"}`;
    if (!ekipman || !para) { sorunlar.push(`${etiket}: ekipman / para birimi geçersiz.`); continue; }
    if (!(tutar >= 20 && tutar <= 20000)) { sorunlar.push(`${etiket}: tutar makul aralıkta değil (20–20.000).`); continue; }
    const metindeVar = !!metin && sayiMetindeVar(metin, tutar);
    if (!metindeVar && !g.dosyadan) { sorunlar.push(`${etiket}: tutar mail metninde geçmiyor (uydurma olabilir).`); continue; }
    let anahtar = limanAnahtari(liman);
    if (g.konuLimanAnahtar) {
      if (!anahtar) anahtar = g.konuLimanAnahtar;
      else if (anahtar !== g.konuLimanAnahtar && !(liman && metinDuz.includes(duzle(liman)))) {
        sorunlar.push(`${etiket}: liman konudaki limanla tutmuyor ve metinde geçmiyor.`);
        continue;
      }
    }
    const ref = g.referans ? g.referans(anahtar, ekipman) : null;
    const usd = para === "EUR" ? tutar * (g.eurUsd ?? 1.15) : tutar;
    if (ref && (usd < ref * 0.4 || usd > ref * 2.5)) { sorunlar.push(`${etiket}: geçmiş tekliflere göre olağandışı (medyan ${sayiYaz(ref)}).`); continue; }
    if (!metindeVar && !ref) { sorunlar.push(`${etiket}: yalnız dosyadan okundu ve karşılaştırılacak geçmiş teklif yok; elle kontrol.`); continue; }
    let lokal: boolean | null = t.lokal_dahil === "dahil" ? true : t.lokal_dahil === "haric" ? false : null;
    if (lokal !== null) {
      const kanit = typeof t.lokal_kanit === "string" ? duzle(t.lokal_kanit) : "";
      if (!kanit || kanit.length < 4 || !metinDuz.includes(kanit)) { lokal = null; notlar.push(`${etiket}: lokal bilgisinin dayanağı metinde bulunamadı, belirsiz bırakıldı.`); }
    }
    const ft = Number(t.free_time_gun);
    const tt = typeof t.transit_gun === "string" && /^\d{1,3}(-\d{1,3})?$/.test(t.transit_gun.trim()) ? t.transit_gun.trim() : null;
    teklifler.push({
      liman, liman_anahtar: anahtar, ekipman, tutar, para, lokal_dahil: lokal,
      armator: typeof t.armator === "string" && t.armator.trim() ? t.armator.trim().slice(0, 40) : null,
      free_time_gun: Number.isInteger(ft) && ft > 0 && ft <= 90 ? ft : null,
      transit_gun: tt,
      gecerlilik: typeof t.gecerlilik === "string" && t.gecerlilik.trim() ? t.gecerlilik.trim().slice(0, 20) : null,
    });
  }
  // Ayni liman + ekipman icin farkli tutar: belirsiz -> elle
  const grup = new Map<string, Set<number>>();
  for (const t of teklifler) {
    const k = `${t.liman_anahtar ?? ""}|${t.ekipman}`;
    if (!grup.has(k)) grup.set(k, new Set());
    grup.get(k)!.add(t.tutar);
  }
  grup.forEach((s, k) => { if (s.size > 1) sorunlar.push(`${k.replace("|", " ")}: aynı liman ve ekipman için birden fazla tutar (${Array.from(s).map(sayiYaz).join(" / ")}).`); });

  const kalemler: NavlunKalem[] = [];
  for (const x of hamKalemler) {
    const h = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const k = kalemDogrula({ ...h, ekipman: h.ekipman === "hepsi" ? null : h.ekipman, blok: h.blok === "yok" ? null : h.blok, kaynak: "yz" });
    if (!k) continue;
    if (!g.dosyadan && !(metin && sayiMetindeVar(metin, k.tutar))) { notlar.push(`Kalem atıldı (${k.ad} ${sayiYaz(k.tutar)}): tutar metinde yok.`); continue; }
    kalemler.push(k);
  }
  return { gecti: teklifler.length > 0 && sorunlar.length === 0, teklifler, kalemler, sorunlar, notlar };
}

const FIYAT_IZI = /(?:usd|\$|eur|€)\s*[:\-–]?\s*\d|\d[\d.,]*\s*(?:usd|\$|eur|€)/i;
const EKIPMAN_IZI = /\b(?:20|40)\s*'?\s*(?:dc|dv|hc|hq|gp|st)\b|\b(?:20|40)\s*'|\b(?:20|40)\s*(?:lik|luk)\b/i;

/**
 * Yapay zeka gerekli mi? Kurallarin sonucu (durum + fiyatli olay var mi) ve mailin durumuna bakar. Gerekliyse nedeni.
 * Bizden giden mail, acentesi bilinmeyen mail ve kurallarin fiyat okudugu mail icin HIC cagrilmaz.
 */
export function yzGerekli(k: { durum: string; acente: string | null; fiyatli: boolean } | null, g: { govde: string; ek_metin: string; dosyaSayisi: number; bizden: boolean }): string | null {
  if (!k || g.bizden || !k.acente || k.fiyatli) return null;
  if (k.durum === "okunamadi") return "teklif ekte ama kurallar okuyamadı";
  if (g.dosyaSayisi > 0) return "ek dosyada teklif olabilir";
  const metin = `${g.govde}\n${g.ek_metin}`;
  if (k.durum === "bilgi" && FIYAT_IZI.test(metin) && EKIPMAN_IZI.test(metin)) return "metinde fiyat ve ekipman var ama kurallar okuyamadı (tablo olabilir)";
  return null;
}

/**
 * HTML govdeyi tablo yapisini koruyarak sade metne cevirir (Gemini'ye giden metin). Alinti (gmail_quote / blockquote /
 * Outlook cevap blogu) kesilir; style / script / head / yorum ve tum oznitelikler atilir; satir </tr> ile, hucre " | " ile ayrilir.
 */
export function htmlTemizle(html: string, sinir = 15000): string {
  let h = (html || "").slice(0, 400000);
  const kes = [/<div[^>]*class="?[^">]*gmail_quote/i, /<blockquote/i, /<div[^>]*id="?(?:appendonsend|divRplyFwdMsg)/i, /<hr[^>]*>\s*<div[^>]*>\s*<font[^>]*>\s*<b>\s*(?:From|Kimden)/i];
  for (const r of kes) { const i = h.search(r); if (i > 0) h = h.slice(0, i); }
  h = h
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(head|style|script|title|xml)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|li|h[1-6]|table|thead|tbody)>/gi, "\n")
    .replace(/<\/(?:td|th)>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d{1,5});/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]{1,4});/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
  return h.split("\n")
    .map((s) => s.replace(/[^\S\n]+/g, " ").replace(/(?:\s*\|\s*)+$/, "").replace(/^(?:\s*\|\s*)+/, "").replace(/\s*\|\s*(?:\|\s*)+/g, " | ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, sinir);
}
