/**
 * SIPARIS BILDIRIM FORMU - model (18.11.2026). SAF: veri / ag yok; edge (siparis-formu) ve web (Siparisler > Siparis
 * Formlari) AYNI modeli kullanir.
 *
 * Kaynak: siparis_formu_veri() satiri (migration 20261118160000): yukleme plani + (varsa) dosya + siparis listesi + proforma
 * temsilcisi + musterinin kalite spekleri + girilen cuval gorseli / uretim / SKT + gonderim kaydi.
 * Kullanici kararlari: her booking = 1 form; Planlanan Yukleme Tarihi = bos ekipman alim tarihi; temsilci = proformayi kesen;
 * mail ekipman alim tarihinden 1 gun once (08:00 TR); cuval gorseli / tarih eksikse form yine gider, eksik alan isaretlenir.
 */
import { gidecegiUlke, ticaretYapilanUlke } from "./ulke-bul.ts";

export type FormHam = {
  anahtar: string;
  plan: Record<string, unknown> | null;
  siparis: Record<string, unknown> | null;
  dosya: Record<string, unknown> | null;
  adres: string | null;
  temsilci: { ad_soyad?: string | null; hitap?: string | null; eposta?: string | null } | null;
  kalite: unknown;
  form: {
    uretim_tarihi?: string | null; skt?: string | null; uretim_metin?: string | null; skt_metin?: string | null; spekler?: string | null;
    tarih_kaynagi?: string | null;
    gorsel_yolu?: string | null; gorsel_adi?: string | null; guncelleyen?: string | null; guncelleme?: string | null;
  } | null;
  gonderim: { zaman?: string | null; alicilar?: string | null; eksikler?: string[] | null } | null;
  test: { zaman?: string | null; alicilar?: string | null } | null;
};

/** Formdaki satirlar, Excel sablonundaki sirayla (sol / sag sutun). */
export const SOL_ALANLAR = [
  ["firma", "Firma Adı:"], ["ulke", "Ülke:"], ["adet", "Adet: "], ["tonaj", "Tonaj:"], ["cuvalAdi", "Çuval Adı:"],
  ["ambalajTipi", "Ambalaj/Çuval Tipi:"], ["lotNo", "Lot No:"], ["rezervasyonNo", "Rezervasyon No:"], ["proformaNo", "Proforma No:"],
  ["siparisTarihi", "Sipariş Tarihi:"], ["uretimTarihi", "Üretim Tarihi:"], ["skt", "Skt:"],
] as const;
export const SAG_ALANLAR = [
  ["temsilci", "Müşteri Temsilcisi:"], ["planlananYukleme", "Planlanan Yükleme Tarihi:"], ["gemi", "Gemi Adı:"],
  ["bosEkipman", "Boş Ekipman Alımı:"], ["yuklemeLimani", "Yükleme Limanı:"], ["varisLimani", "Varış Limanı:"],
  ["acente", "Acenta/Hat:"], ["urunTipi", "Ürün Tipi:"], ["spekler", "Ürün Spekleri:"],
] as const;

export type AlanAnahtari = (typeof SOL_ALANLAR)[number][0] | (typeof SAG_ALANLAR)[number][0];
export type FormAlanlari = Record<AlanAnahtari, string>;

export type FormDurumu = "gonderildi" | "bekliyor" | "bugun" | "gecikti" | "suresi_gecti";

export type FormModeli = {
  anahtar: string;
  bookingNo: string;
  alanlar: FormAlanlari;
  /** Bos kalan alanlarin etiketleri (formda "GİRİLMEDİ"). */
  eksikler: string[];
  /** Kullanicinin girmesi gerekenlerden eksik olanlar (cuval gorseli / uretim / SKT). */
  girisEksikleri: string[];
  ekipmanTarihi: string | null;
  /** Gemi kalkisi (ETD): ekipman gunu gecmis ama gemi kalkmamis yukleme listede kalir. */
  etd: string | null;
  gonderimGunu: string | null;
  uretimIso: string | null;
  sktIso: string | null;
  /** Formdaki yazim: cuvaldan okunan ("NOVEMBER 2026" / "12.11.2026"), yoksa dosyanin Ek Bilgiler tarihi (ay-yil). */
  uretimMetin: string;
  sktMetin: string;
  /** Spekler elle girilip kaydedildi mi (degilse formda musteri kalite ayari / varsayilan onerilir). */
  spekKayitli: boolean;
  spekOnerisi: string;
  /** Formda KAYITLI cuval tarihleri (dosyadan gelen yedek haric); kaynak: gorsel (OCR) / elle. */
  kayitliTarih: { uretimMetin: string; sktMetin: string; uretimIso: string | null; sktIso: string | null; kaynak: string | null };
  gorselYolu: string | null;
  gorselAdi: string | null;
  dosyaId: string | null;
  dosyaNo: string | null;
  temsilciEposta: string | null;
  temsilciHitap: string | null;
  gonderim: FormHam["gonderim"];
  test: FormHam["test"];
  guncelleyen: string | null;
};

export const EKSIK = "GİRİLMEDİ";
export const KONTEYNER_TONU = 25;
const AYLAR = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

const metin = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "").replace(/\s+/g, " ").trim();
const ilk = (...d: unknown[]): string => { for (const x of d) { const m = metin(x); if (m) return m; } return ""; };
const isoGun = (v: unknown): string | null => { const m = metin(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };

/** "2026-11-13" -> "13.11.2026" */
export function trTarih(iso: string | null | undefined): string {
  const g = isoGun(iso);
  return g ? `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}` : "";
}
/** "2026-11-12" -> "NOVEMBER 2026" (cuvalin uzerindeki yazimla ayni). */
export function ayYil(iso: string | null | undefined): string {
  const g = isoGun(iso);
  if (!g) return "";
  const ay = Number(g.slice(5, 7));
  return ay >= 1 && ay <= 12 ? `${AYLAR[ay - 1]} ${g.slice(0, 4)}` : "";
}
/** ISO gune n gun ekler (UTC hesap; saat dilimi kaymasi yok). */
export function gunEkle(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const tarihGibi = (s: string) => /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(s.trim());

/** "PREMIUM QUALITY WHEAT FLOUR (SAAD BRAND)" -> "PREMIUM QUALITY WHEAT FLOUR" */
export function urunAdiSade(ad: string): string {
  return ad.replace(/\s*\([^)]*\bBRAND\b[^)]*\)\s*$/i, "").replace(/\s+/g, " ").trim();
}

/** Cuval tipi metinlerden: "PP + KRAFT", "PP", "KRAFT", "JUTE"; bulunamazsa "". */
export function cuvalTipi(...metinler: unknown[]): string {
  const s = metinler.map(metin).join(" ").toUpperCase();
  const pp = /\bPP\b|POLYPROPYLENE/.test(s);
  const kraft = /KRAFT/.test(s);
  if (pp && kraft) return "PP + KRAFT";
  if (pp) return "PP";
  if (kraft) return "KRAFT";
  if (/\bJUTE\b/.test(s)) return "JUTE";
  if (/\bCOTTON\b/.test(s)) return "COTTON";
  return "";
}
function ambalajKgMetni(...metinler: unknown[]): string {
  for (const x of metinler) {
    const m = metin(x).replace(",", ".").match(/(\d+(?:\.\d+)?)\s*KG/i);
    if (m) return `${m[1].replace(".", ",")} KG`;
  }
  return "";
}

/** Kalite sertifikasi parametrelerinden formdaki 4 temel spek (sablondaki yazimla). */
const VARSAYILAN_SPEKLER = ["Protein min 13%", "Gluten min 30%", "Kül: max 0,60%", "Nem: max 14%"];
export function spekMetni(kalite: unknown): string {
  const liste = Array.isArray(kalite) ? (kalite as Record<string, unknown>[]) : [];
  const bul = (desen: RegExp) => liste.find((p) => desen.test(metin(p.parametre).toUpperCase()));
  const spek = (p: Record<string, unknown> | undefined) => metin(p?.spesifikasyon).replace(/\s*%\s*$/, "%").replace(/^(min|max)\.?\s*/i, (_t, k: string) => `${k.toLowerCase()} `);
  const satirlar: string[] = [];
  const ekle = (desen: RegExp, etiket: string, varsayilan: string) => {
    const s = spek(bul(desen));
    satirlar.push(s && !/^-+$/.test(s) ? `${etiket} ${s}` : varsayilan);
  };
  ekle(/PROTEIN/, "Protein", VARSAYILAN_SPEKLER[0]);
  ekle(/WET\s*GLUTEN|^GLUTEN/, "Gluten", VARSAYILAN_SPEKLER[1]);
  ekle(/\bASH\b/, "Kül:", VARSAYILAN_SPEKLER[2]);
  ekle(/MOISTURE/, "Nem:", VARSAYILAN_SPEKLER[3]);
  return satirlar.join("\n");
}

/** Elle girilen spek metni: satirlar korunur, bos satirlar atilir, en fazla 12 satir / 600 karakter. */
export function spekTemizle(v: unknown): string {
  return String(typeof v === "string" ? v : "").split(/\r?\n/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 12).join("\n").slice(0, 600);
}

// ------------------------------------------------------------------ cuval gorselinden tarih (OCR metni)
const AY_ADLARI: [RegExp, number][] = [
  [/^(JAN|JANV|ENE|OCA)/, 1], [/^(FEB|FEV|FÉV|SUB|ŞUB)/, 2], [/^(MAR)/, 3], [/^(APR|AVR|ABR|NIS|NİS)/, 4], [/^(MAY|MAI)/, 5],
  [/^(JUN|JUIN|HAZ)/, 6], [/^(JUL|JUIL|TEM)/, 7], [/^(AUG|AOU|AOÛ|AGO|AĞU)/, 8], [/^(SEP|SET|EYL)/, 9], [/^(OCT|EKI|EKİ)/, 10],
  [/^(NOV|KAS)/, 11], [/^(DEC|DEZ|DIC|DÉC|ARA)/, 12],
];
const AY_DESENI = "(JAN(?:UARY)?|JANV(?:IER)?|FEB(?:RUARY)?|F[EÉ]V(?:RIER)?|MAR(?:CH|S)?|APR(?:IL)?|AVR(?:IL)?|MAY|MAI|JUN(?:E)?|JUIN|JUL(?:Y)?|JUIL(?:LET)?|AUG(?:UST)?|AO[UÛ]T|SEP(?:T(?:EMBER)?)?|SEPTEMBRE|OCT(?:OBER|OBRE)?|NOV(?:EMBER|EMBRE)?|DEC(?:EMBER)?|D[EÉ]C(?:EMBRE)?)";
const URETIM_ANAHTAR = /(PRODUCTION|PRODUCED|PROD\.?|MFG|MANUFACTUR\w*|FABRICATION|FAB\.?|DATE\s+DE\s+PRODUCTION|PRODUCTION\s+DATE|PACKED|PACKING\s+DATE|ÜRETİM|URETIM)/;
const SKT_ANAHTAR = /(EXPIRY|EXPIRATION|EXP\.?|BEST\s+BEFORE|USE\s+BEFORE|USE\s+BY|P[EÉ]REMPTION|DLUO|DLC|CONSOMMER|SKT|SON\s+KULLANMA)/;

export type CuvalTarihi = { tur: "ay" | "gun"; metin: string; iso: string | null; yil: number; ay: number };
export type CuvalTarihleri = { uretim: CuvalTarihi | null; skt: CuvalTarihi | null };

function tarihBul(parca: string): CuvalTarihi | null {
  const s = parca.toUpperCase().replace(/[|]/g, " ");
  // Tam tarih: 12.11.2026 / 12/11/2026 / 12-11-26
  const gun = s.match(/(?:^|[^0-9])(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(20\d{2}|\d{2})(?![0-9])/);
  if (gun) {
    const g = Number(gun[1]); const a = Number(gun[2]); const y = gun[3].length === 2 ? 2000 + Number(gun[3]) : Number(gun[3]);
    if (g >= 1 && g <= 31 && a >= 1 && a <= 12) {
      const iso = `${y}-${String(a).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
      return { tur: "gun", metin: `${String(g).padStart(2, "0")}.${String(a).padStart(2, "0")}.${y}`, iso, yil: y, ay: a };
    }
  }
  // Ay adi + yil: NOVEMBER 2026 / NOV. 2026 / NOVEMBRE 2026
  const ad = s.match(new RegExp(`${AY_DESENI}\\.?\\s*[,/-]?\\s*(20\\d{2})(?![0-9])`));
  if (ad) {
    const ay = AY_ADLARI.find(([d]) => d.test(ad[1]))?.[1];
    if (ay) return { tur: "ay", metin: `${AYLAR[ay - 1]} ${ad[2]}`, iso: null, yil: Number(ad[2]), ay };
  }
  // Sayisal ay / yil: 11/2026 / 11.2026
  const say = s.match(/(?:^|[^0-9])(\d{1,2})\s*[./-]\s*(20\d{2})(?![0-9])/);
  if (say && Number(say[1]) >= 1 && Number(say[1]) <= 12) {
    const ay = Number(say[1]);
    return { tur: "ay", metin: `${AYLAR[ay - 1]} ${say[2]}`, iso: null, yil: Number(say[2]), ay };
  }
  return null;
}

/**
 * OCR metninden uretim ve son kullanma tarihi. Yalniz anahtar kelimenin (Production / Expiry / Best before / Fabrication ...)
 * BULUNDUGU satirda, anahtardan SONRA gelen tarih alinir (gorseldeki form tarihi vb. karismaz). Tutarsizsa (SKT <= uretim,
 * yil 2020-2040 disi) ikisi de reddedilir: yanlis tarih yerine "okunamadi".
 */
export function cuvalTarihleriniAyikla(ocrMetni: string): CuvalTarihleri {
  let uretim: CuvalTarihi | null = null;
  let skt: CuvalTarihi | null = null;
  for (const ham of String(ocrMetni || "").split(/\r?\n/)) {
    const satir = ham.toUpperCase();
    if (!skt) {
      const m = satir.match(SKT_ANAHTAR);
      if (m && m.index !== undefined) skt = tarihBul(satir.slice(m.index + m[0].length));
    }
    if (!uretim) {
      const m = satir.match(URETIM_ANAHTAR);
      // "PRODUCT OF TURKEY" uretim anahtari degildir
      if (m && m.index !== undefined && !/^PRODUCT\s+OF/.test(satir.slice(m.index))) uretim = tarihBul(satir.slice(m.index + m[0].length));
    }
  }
  const gecerli = (t: CuvalTarihi | null) => !!t && t.yil >= 2020 && t.yil <= 2040;
  if (!gecerli(uretim)) uretim = null;
  if (!gecerli(skt)) skt = null;
  if (uretim && skt && skt.yil * 12 + skt.ay <= uretim.yil * 12 + uretim.ay) return { uretim: null, skt: null };
  return { uretim, skt };
}

export function formModeli(h: FormHam): FormModeli {
  const p = h.plan || {};
  const s = h.siparis || {};
  const d = h.dosya || {};
  const f = h.form || {};
  const kalemler = Array.isArray(d.urun_detaylari) ? (d.urun_detaylari as Record<string, unknown>[]) : [];
  const planKalemleri = Array.isArray(p.kalemler) ? (p.kalemler as Record<string, unknown>[]) : [];
  const konteyner = Number(p.konteyner) > 0 ? Number(p.konteyner) : null;
  const proformaNo = ilk(d.proforma_no, s.proforma_no, p.proforma_no);
  const markaListesi = Array.isArray(d.marka_listesi) ? (d.marka_listesi as unknown[]).map(metin).filter(Boolean) : [];
  const planMarkalari = Array.from(new Set(planKalemleri.map((k) => metin(k.cuval_markasi)).filter(Boolean)));
  const urunler = Array.from(new Set(kalemler.map((k) => urunAdiSade(ilk(k.urun_adi, k.description))).filter(Boolean)));
  const kgMetni = ambalajKgMetni(p.ambalaj, ...kalemler.map((k) => ilk(k.ambalaj_boyutu, k.packaging_size)), s.paketleme, d.detayli_ambalaj);
  const tip = cuvalTipi(d.detayli_ambalaj, d.ambalaj, s.paketleme, p.cuval_markasi);
  const ekipmanYeri = ilk(p.ekipman, tarihGibi(metin(p.ekipman_alim_yeri)) ? "" : p.ekipman_alim_yeri);
  const ulke = ticaretYapilanUlke(h.adres) || gidecegiUlke(ilk(d.varis_limani, p.varis_limani)) || "";
  const uretimIso = isoGun(f.uretim_tarihi) || isoGun(d.uretim_tarihi);
  const sktIso = isoGun(f.skt) || isoGun(d.son_kullanim_tarihi);
  // 18.11.2026 (kullanici): tarihler CUVAL GORSELINDEN okunur. Cuvalda ay-yil yaziyorsa ("NOVEMBER 2026") formda o yazilir,
  // dosyanin tarihleri degismez; tam tarih yaziyorsa form + dosya o tarihle. Okunmamissa dosyanin Ek Bilgiler tarihi (ay-yil).
  const uretimMetin = metin(f.uretim_metin) || (isoGun(f.uretim_tarihi) ? trTarih(f.uretim_tarihi) : "") || ayYil(isoGun(d.uretim_tarihi));
  const sktMetin = metin(f.skt_metin) || (isoGun(f.skt) ? trTarih(f.skt) : "") || ayYil(isoGun(d.son_kullanim_tarihi));
  const spekKayitli = spekTemizle(f.spekler).length > 0;
  const spekOnerisi = spekMetni(h.kalite);
  const ekipmanTarihi = isoGun(p.bos_ekipman_tarihi);

  const alanlar: FormAlanlari = {
    firma: ilk(d.alici_firma, s.firma, p.musteri),
    temsilci: ilk(h.temsilci?.ad_soyad),
    ulke,
    // 18.11.2026 (kullanici): "Planlanan Yukleme Tarihi her zaman ardiyesiz giris tarihi" (gonderim yine bos ekipman - 1 gun)
    planlananYukleme: trTarih(isoGun(p.ardiyesiz_giris)),
    adet: konteyner ? `${konteyner}*20 DC` : "",
    gemi: ilk(p.gemi),
    tonaj: konteyner ? `${konteyner * KONTEYNER_TONU} MT` : "",
    bosEkipman: ekipmanYeri,
    cuvalAdi: ilk(p.cuval_markasi, planMarkalari.join(" / "), markaListesi.join(" / "), s.marka),
    yuklemeLimani: ilk(p.liman),
    ambalajTipi: [kgMetni, tip].filter(Boolean).join(" "),
    varisLimani: ilk(d.varis_limani, p.varis_limani),
    lotNo: ilk(d.lot_no, proformaNo),
    acente: ilk(p.acente),
    rezervasyonNo: ilk(p.booking_no),
    urunTipi: ilk(urunler.join(" / "), s.urun ? urunAdiSade(metin(s.urun)) : "", p.cinsi),
    proformaNo,
    spekler: spekKayitli ? spekTemizle(f.spekler) : spekOnerisi,
    siparisTarihi: trTarih(ilk(d.proforma_tarihi, s.proforma_tarihi)),
    uretimTarihi: uretimMetin,
    skt: sktMetin,
  };
  const etiketler = new Map<string, string>([...SOL_ALANLAR, ...SAG_ALANLAR].map(([k, e]) => [k, e.replace(/:\s*$/, "")]));
  const eksikler = (Object.keys(alanlar) as AlanAnahtari[]).filter((k) => !alanlar[k]).map((k) => etiketler.get(k) || k);
  const gorselYolu = metin(f.gorsel_yolu) || null;
  const girisEksikleri = [
    !gorselYolu ? "Çuval görseli" : null, !spekKayitli ? "Ürün spekleri" : null, !uretimMetin ? "Üretim tarihi" : null, !sktMetin ? "SKT" : null,
  ].filter((x): x is string => !!x);
  if (!gorselYolu) eksikler.push("Çuval görseli");
  return {
    anahtar: h.anahtar,
    bookingNo: alanlar.rezervasyonNo || h.anahtar,
    alanlar,
    eksikler,
    girisEksikleri,
    ekipmanTarihi,
    etd: isoGun(p.etd),
    gonderimGunu: ekipmanTarihi ? gunEkle(ekipmanTarihi, -1) : null,
    uretimIso,
    sktIso,
    uretimMetin,
    sktMetin,
    spekKayitli,
    spekOnerisi,
    kayitliTarih: { uretimMetin: metin(f.uretim_metin), sktMetin: metin(f.skt_metin), uretimIso: isoGun(f.uretim_tarihi), sktIso: isoGun(f.skt), kaynak: metin(f.tarih_kaynagi) || null },
    gorselYolu,
    gorselAdi: metin(f.gorsel_adi) || null,
    dosyaId: metin(d.id) || null,
    dosyaNo: ilk(d.dosya_no, p.dosya_no) || null,
    temsilciEposta: metin(h.temsilci?.eposta) || null,
    temsilciHitap: metin(h.temsilci?.hitap) || null,
    gonderim: h.gonderim || null,
    test: h.test || null,
    guncelleyen: metin(f.guncelleyen) || null,
  };
}

/** Gonderim saati: TR 08:00 (dakika). */
export const GONDERIM_DAKIKASI = 8 * 60;

/**
 * Otomatik gonderim zamani geldi mi: gonderim gunu (ekipman - 1) ile ekipman gunu arasinda ve saat 08:00'i gecmis.
 * Ekipman gunu de gecmisse (gec acilan booking) GONDERILMEZ - eski yukleme icin uretime mail gitmez.
 */
export function gonderimZamaniMi(m: Pick<FormModeli, "gonderimGunu" | "ekipmanTarihi">, bugunTr: string, dakikaTr: number): boolean {
  if (!m.gonderimGunu || !m.ekipmanTarihi) return false;
  if (bugunTr < m.gonderimGunu || bugunTr > m.ekipmanTarihi) return false;
  return bugunTr > m.gonderimGunu || dakikaTr >= GONDERIM_DAKIKASI;
}

export function formDurumu(m: Pick<FormModeli, "gonderim" | "gonderimGunu" | "ekipmanTarihi">, bugunTr: string): FormDurumu {
  if (m.gonderim?.zaman) return "gonderildi";
  if (!m.gonderimGunu || !m.ekipmanTarihi) return "bekliyor";
  if (bugunTr > m.ekipmanTarihi) return "suresi_gecti";
  if (bugunTr > m.gonderimGunu) return "gecikti";
  if (bugunTr === m.gonderimGunu) return "bugun";
  return "bekliyor";
}

// ------------------------------------------------------------------ mail
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function formKonusu(m: FormModeli, test: boolean): string {
  const a = m.alanlar;
  const parca = [a.firma, a.adet, a.cuvalAdi, a.rezervasyonNo ? `Booking ${a.rezervasyonNo}` : "", m.ekipmanTarihi ? `Ekipman ${trTarih(m.ekipmanTarihi)}` : ""].filter(Boolean);
  return `${test ? "[TEST] " : ""}Sipariş Bildirim Formu · ${parca.join(" · ")}`;
}

export function formDosyaAdi(m: FormModeli): string {
  const TR: Record<string, string> = { "Ç": "C", "ç": "c", "Ğ": "G", "ğ": "g", "İ": "I", "ı": "i", "Ö": "O", "ö": "o", "Ş": "S", "ş": "s", "Ü": "U", "ü": "u" };
  const sade = (s: string) => s.replace(/[ÇçĞğİıÖöŞşÜü]/g, (h) => TR[h] || h).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return `Siparis_Bildirim_Formu_${sade(m.alanlar.firma) || "Firma"}_${sade(m.bookingNo) || "booking"}.xlsx`;
}

export function formMailHtml(m: FormModeli, sirketAdi: string, test: boolean): string {
  const a = m.alanlar;
  const satir = (etiket: string, deger: string) =>
    `<tr><td style="padding:6px 10px;border:1px solid #D9DEE8;background:#F5F7FB;font-weight:600;width:42%;color:#283474">${esc(etiket)}</td>` +
    `<td style="padding:6px 10px;border:1px solid #D9DEE8;${deger ? "color:#111827" : "color:#B91C1C;font-weight:700"}">${deger ? esc(deger).replace(/\n/g, "<br>") : EKSIK}</td></tr>`;
  const sol = SOL_ALANLAR.map(([k, e]) => satir(e.replace(/:\s*$/, ""), a[k])).join("");
  const sag = SAG_ALANLAR.map(([k, e]) => satir(e.replace(/:\s*$/, ""), a[k])).join("");
  const uyari = m.girisEksikleri.length
    ? `<div style="margin:12px 0;padding:10px 12px;border:1px solid #F59E0B;background:#FFFBEB;color:#92400E;border-radius:6px;font-size:13px">
        <b>Eksik bilgi:</b> ${esc(m.girisEksikleri.join(", "))}. Form bu haliyle gönderildi; eksikler müşteri temsilcisine bildirildi.</div>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F3F4F6;font-family:Calibri,Arial,sans-serif">
<div style="max-width:760px;margin:0 auto;background:#fff;border:1px solid #E5E7EB">
  <div style="background:#283474;color:#fff;padding:14px 18px;font-size:16px;font-weight:700">${test ? "[TEST] " : ""}SİPARİŞ BİLDİRİM FORMU</div>
  <div style="padding:16px 18px;font-size:14px;color:#111827">
    <p style="margin:0 0 10px">Kolay gelsin,</p>
    <p style="margin:0 0 10px"><b>${esc(a.firma)}</b> yüklemesi için sipariş bildirim formu ektedir (Excel${m.gorselYolu ? " + çuval görseli" : ""}).
      Boş ekipman alımı <b>${esc(trTarih(m.ekipmanTarihi) || "—")}</b>${a.planlananYukleme ? `, planlanan yükleme (ardiyesiz giriş) <b>${esc(a.planlananYukleme)}</b>` : ""}.</p>
    ${uyari}
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:6px">${sol}</table>
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:10px">${sag}</table>
    <p style="margin:14px 0 0;color:#6B7280;font-size:12px">Bu mail ${esc(sirketAdi)} İhracat Asistanı tarafından otomatik gönderildi${test ? " (TEST - üretime gitmedi)" : ""}.</p>
  </div>
</div></body></html>`;
}

export function uyariMailHtml(m: FormModeli, test: boolean): string {
  const a = m.alanlar;
  return `<!doctype html><html><body style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#111827">
<p>${esc(m.temsilciHitap || "Merhaba")},</p>
<p>${test ? "[TEST] " : ""}<b>${esc(a.firma)}</b> · Booking <b>${esc(a.rezervasyonNo)}</b> (boş ekipman ${esc(trTarih(m.ekipmanTarihi) || "—")}) sipariş bildirim formu
üretime <b>eksik bilgiyle</b> gönderildi: <b>${esc(m.girisEksikleri.join(", "))}</b>.</p>
<p>Lütfen Siparişler &gt; Sipariş Formları sekmesinden tamamlayıp üretimi ayrıca bilgilendirin.</p>
</body></html>`;
}
