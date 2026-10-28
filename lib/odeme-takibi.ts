/**
 * lib/odeme-takibi.ts — Odeme takibi + hatirlatma maili (28.10.2026).
 *
 * Kullanici: "ETD-ETA excelinde Vesaik / Seawaybill / Telex tikleri kaldirildiginda odemesi
 * alinmamislar ortaya cikiyor. Bu musteriler icin hatirlatma mail butonu eklemeliyiz.
 * Mail gonderdigimizin takibini yapabilmeliyiz."
 *
 * - Konsimento durumu = Excel "KONSIMENTO" sutunuyla AYNI secenekler (DB: rezervasyonlar.konsimento_durumu).
 * - Odeme ALINDI = telex | seawaybill | vesaik. Diger secenekler ve bos = odeme bekliyor.
 * - "Odeme bekleyen" listesi = gemisi kalkmis (ETD <= bugun) + odeme alinmamis sevkiyat.
 * - Mail Outlook ile (mailto) acilir: ihracat musterilerine sistemden dogrudan mail gonderimi
 *   kullanici karariyla askida (CLAUDE.md). "Gonderildi" onayi odeme_hatirlatma_kaydet() ile
 *   degismez kayda gecer.
 * Metinler kullanicinin verdigi 3 sablonun AYNISIDIR; yalniz [..] yer tutuculari doldurulur.
 */

export const KONSIMENTO_DURUMLARI = ["x", "alindi", "telex", "seawaybill", "vesaik", "kargo", "kuehne", "acente"] as const;
export type KonsimentoDurumu = (typeof KONSIMENTO_DURUMLARI)[number];

/** Excel'deki yazimla ayni etiketler */
export const KONSIMENTO_ETIKETI: Record<KonsimentoDurumu, string> = {
  x: "X",
  alindi: "Alındı ✓",
  telex: "Telex",
  seawaybill: "Seawaybill",
  vesaik: "Vesaik",
  kargo: "Kargo",
  kuehne: "Kuehne",
  acente: "Acente",
};

const ODEME_ALINDI: ReadonlySet<string> = new Set(["telex", "seawaybill", "vesaik"]);

export function konsimentoDurumuMu(v: unknown): v is KonsimentoDurumu {
  return typeof v === "string" && (KONSIMENTO_DURUMLARI as readonly string[]).includes(v);
}

export function odemeAlindiMi(durum: string | null | undefined): boolean {
  return !!durum && ODEME_ALINDI.has(durum);
}

/** YYYY-MM-DD (yerel gun) */
export function bugunIso(simdi: Date = new Date()): string {
  const y = simdi.getFullYear();
  const m = String(simdi.getMonth() + 1).padStart(2, "0");
  const d = String(simdi.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Gemi kalkti mi: ETD bugun veya once. ETD yoksa kalkmamis sayilir. */
export function gemiKalktiMi(etd: string | null | undefined, bugun: string = bugunIso()): boolean {
  return !!etd && etd.slice(0, 10) <= bugun;
}

/** Odeme hatirlatmasi gereken sevkiyat: gemi kalkmis ve odeme alinmamis. */
export function odemeBekliyorMu(s: { etd: string | null; konsimento_durumu: string | null }, bugun: string = bugunIso()): boolean {
  return gemiKalktiMi(s.etd, bugun) && !odemeAlindiMi(s.konsimento_durumu);
}

/** Booking / B/L karsilastirma anahtari: harf+rakam disi atilir ("ISB 2060276", ".ISB2060276" ayni). */
export function numaraAnahtari(v: unknown): string {
  if (v === null || v === undefined) return "";
  // Excel sayisal booking'i (263264020) number olarak verir; tam sayi ondalik/us gostermeden yazilir
  const s = typeof v === "number" ? (Number.isInteger(v) ? v.toFixed(0) : String(v)) : String(v);
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Excel hucre metnini duruma cevirir ("Alındı ✓" -> alindi, "TELEX" -> telex). Bos/taninmayan -> null */
export function excelKonsimentoDurumu(metin: unknown): KonsimentoDurumu | null {
  if (metin === null || metin === undefined) return null;
  const s = String(metin)
    .replace(/[✓✔]/g, "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/[^a-z]/g, "");
  if (!s) return null;
  if (s === "x") return "x";
  if (s.startsWith("alindi")) return "alindi";
  if (s.startsWith("telex") || s === "teleks") return "telex";
  if (s.startsWith("seaway") || s === "swb") return "seawaybill";
  if (s.startsWith("vesaik")) return "vesaik";
  if (s.startsWith("kargo")) return "kargo";
  if (s.startsWith("kuehne") || s.startsWith("kuhne")) return "kuehne";
  if (s.startsWith("acente")) return "acente";
  return null;
}

// ---------------------------------------------------------------------------
// Hatirlatma sablonlari (kullanicinin metinleri, 28.10.2026)
// ---------------------------------------------------------------------------
export type HatirlatmaSablonu = 1 | 2 | 3;

export const SABLON_BILGI: Record<HatirlatmaSablonu, { ad: string; aciklama: string }> = {
  1: { ad: "Nazik hatırlatma", aciklama: "Kalan ödeme ve SWIFT kopyası rica edilir." },
  2: { ad: "Gelecek hafta ödeme", aciklama: "Ödemenin gelecek hafta yapılması rica edilir." },
  3: { ad: "Varış / acil", aciklama: "Sevkiyat vardı veya varmak üzere; en kısa sürede ödeme." },
};

export type HatirlatmaVerisi = {
  firma: string;
  konteynerAdedi: number;
  /** "20 DC" gibi; bilinmiyorsa "20 DC" */
  konteynerTipi?: string | null;
  booking: string;
  /** Sablon 3: ETA bugun/gecmis -> "has arrived at", yoksa "is approaching" */
  eta?: string | null;
  bugun?: string;
};

/** Konteyner tipi yazimi: "20DC" -> "20 DC", "40HC" -> "40 HC"; karisik/bos -> "20 DC" */
export function konteynerTipiYazimi(tipler: (string | null | undefined)[]): string {
  const set = new Set(
    tipler
      .map((t) => String(t ?? "").toUpperCase().replace(/\s+/g, ""))
      .filter(Boolean)
      .map((t) => t.replace(/^(\d{2})([A-Z]+)$/, "$1 $2")),
  );
  return set.size === 1 ? Array.from(set)[0] : "20 DC";
}

export function hatirlatmaKonusu(v: Pick<HatirlatmaVerisi, "booking">): string {
  return `Payment Reminder – Booking No: ${v.booking}`;
}

export function hatirlatmaMetni(sablon: HatirlatmaSablonu, v: HatirlatmaVerisi): string {
  const firma = v.firma.trim();
  const tip = (v.konteynerTipi || "20 DC").trim();
  const sevkiyat = `${v.konteynerAdedi} × ${tip} containers under booking number ${v.booking}`;
  const varmis = !!v.eta && v.eta.slice(0, 10) <= (v.bugun || bugunIso());
  const satirlar: Record<HatirlatmaSablonu, string[]> = {
    1: [
      `Dear ${firma} Team,`,
      "",
      "I hope you are doing well.",
      "",
      `We would like to kindly remind you of the outstanding balance for your shipment of ${sevkiyat}.`,
      "",
      "We kindly ask you to arrange the remaining payment and share the SWIFT copy with us once the payment has been made.",
      "",
      "Thank you for your cooperation and continued support.",
      "",
      "Best regards,",
    ],
    2: [
      `Dear ${firma} Team,`,
      "",
      "I hope you are doing well.",
      "",
      `We would like to kindly remind you of the outstanding balance for your shipment of ${sevkiyat}.`,
      "",
      "We would appreciate it if you could arrange the remaining payment next week and share the SWIFT copy with us once the payment has been made.",
      "",
      "Thank you for your cooperation and understanding.",
      "",
      "Best regards,",
    ],
    3: [
      `Dear ${firma} Team,`,
      "",
      "I hope you are doing well.",
      "",
      `We would like to remind you of the outstanding balance for your shipment of ${sevkiyat}.`,
      "",
      `As the shipment ${varmis ? "has arrived at" : "is approaching"} its destination, we kindly ask you to arrange the remaining payment and share the SWIFT copy with us as soon as possible.`,
      "",
      "Thank you for your prompt attention and continued cooperation.",
      "",
      "Best regards,",
    ],
  };
  return satirlar[sablon].join("\n");
}

// ---------------------------------------------------------------------------
// E-posta adresleri + mailto
// ---------------------------------------------------------------------------
const EPOSTA = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;

/** "a@x.com; b@y.com" / "a@x.com, b@y.com" -> ["a@x.com","b@y.com"] (tekrarsiz, sira korunur) */
export function epostaListesi(metin: string | null | undefined): string[] {
  const gorulen = new Set<string>();
  const sonuc: string[] = [];
  for (const p of String(metin ?? "").split(/[,;\s]+/)) {
    const e = p.trim().replace(/^<|>$/g, "");
    if (!e) continue;
    const k = e.toLowerCase();
    if (gorulen.has(k)) continue;
    gorulen.add(k);
    sonuc.push(e);
  }
  return sonuc;
}

export function gecersizEpostalar(liste: string[]): string[] {
  return liste.filter((e) => !EPOSTA.test(e));
}

export function mailtoAdresi(alicilar: string[], cc: string[], konu: string, govde: string): string {
  const altKume = new Set(alicilar.map((a) => a.toLowerCase()));
  const ccTemiz = cc.filter((c) => !altKume.has(c.toLowerCase()));
  // Windows / Outlook satir sonu: CRLF
  const govdeCrlf = govde.replace(/\r?\n/g, "\r\n");
  const q = [
    ccTemiz.length ? `cc=${encodeURIComponent(ccTemiz.join(","))}` : "",
    `subject=${encodeURIComponent(konu)}`,
    `body=${encodeURIComponent(govdeCrlf)}`,
  ].filter(Boolean).join("&");
  return `mailto:${alicilar.map((a) => encodeURIComponent(a)).join(",")}?${q}`;
}

// ---------------------------------------------------------------------------
// Sira ve tur (28.10.2026): "Ayni musteri tekrar listedeyse 2. mesaj; sira ile atilmali."
// ---------------------------------------------------------------------------
/** Sevkiyata gonderilmis hatirlatma sayisina gore SIRADAKI sablon: 0 -> 1, 1 -> 2, 2+ -> 3 */
export function siradakiSablon(gonderilenSayisi: number): HatirlatmaSablonu {
  return gonderilenSayisi <= 0 ? 1 : gonderilenSayisi === 1 ? 2 : 3;
}

/**
 * Hatirlatma turu = son Excel yuklemesinden bu yana. Tur baslangici yoksa (hic yukleme
 * kaydedilmemis) daha once hatirlatilan "gonderildi" sayilir.
 */
export function buTurGonderildiMi(gonderimZamanlari: string[], turBaslangici: string | null | undefined): boolean {
  if (gonderimZamanlari.length === 0) return false;
  if (!turBaslangici) return true;
  const t = new Date(turBaslangici).getTime();
  return gonderimZamanlari.some((z) => new Date(z).getTime() >= t);
}
