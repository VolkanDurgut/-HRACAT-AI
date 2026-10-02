/**
 * lib/sigorta-talimati.ts
 *
 * YÜK SİGORTASI TALİMATI (Evraklar listesinde 10. evrak "Insurance Policy",
 * talep: 02.10.2026). Kullanicinin verdigi Word sablonu
 * (UNEX_YUK_SIGORTASI_TALIMATI) birebir IHR-2026-0071 dosyasinin verisiyle
 * dolduruldugu icin alan eslesmeleri o ornekle dogrulandi:
 *
 *   TARİH             = her zaman BUGUN (Turkiye saatiyle), "25/09/2026"
 *   GÖNDERİCİ FİRMA   = SABIT "UNEX GIDA SAN VE TİC LTD ŞTİ"
 *   MALIN CİNSİ       = SABIT "BUĞDAY UNU"
 *   MAL BEDELİ        = dosya.toplam_tutar + para birimi, "51.875,00 USD"
 *   GİDECEĞİ YER      = varis limaninin ULKE kismi ("COTONOU PORT BENIN" -> BENIN)
 *   TAŞIMA ŞEKLİ      = SABIT "KONTEYNER / GEMİ"
 *   GEMİ ADI / SEFER NO / GEMİ KALKIŞI = rezervasyon(lar)
 *   TESLİM ŞEKLİ      = dosya.teslim_sekli
 *   TAŞIYICI ACENTE   = rezervasyon acentesi; "DRAFT/HAPAG" gibi "forwarder/hat"
 *                       kayitlarinda hat kismi (HAPAG -> HAPAG-LLOYD)
 *   KONŞİMENTO NO     = dosya.bl_no
 *   Yuk satiri        = "5 X 20 DC KONTEYNER  2.500 ADET 50 KG PP+KRAFT ÇUVAL"
 *                       (konteyner adedi/tipi + detayli ambalajin Turkcesi)
 *   Agirlik satiri    = "BRÜT : 126.000,00 KGS , NET : 125.000,00 KGS"
 *                       (konteynerlerin brut/net toplami)
 *
 * Otomatik degerler "Talimat" penceresinde duzeltilebilir (tarih ve sabitler
 * haric); dosyadaki kayitlar DEGISMEZ.
 */

import { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";

export const SIGORTA_SABIT_GONDERICI = "UNEX GIDA SAN VE TİC LTD ŞTİ";
export const SIGORTA_SABIT_MALIN_CINSI = "BUĞDAY UNU";
export const SIGORTA_SABIT_TASIMA_SEKLI = "KONTEYNER / GEMİ";

/** Talimattaki duzenlenebilir alanlar (sirasi = belgedeki sira). */
export type SigortaTalimatiAlanlari = {
  malBedeli: string;
  gidecegiYer: string;
  gemiAdi: string;
  seferNo: string;
  teslimSekli: string;
  gemiKalkisi: string;
  tasiyiciAcente: string;
  konsimentoNo: string;
  yukSatiri: string;
  agirlikSatiri: string;
};

export const SIGORTA_ALAN_ETIKETLERI: Record<keyof SigortaTalimatiAlanlari, string> = {
  malBedeli: "Mal Bedeli",
  gidecegiYer: "Gideceği Yer",
  gemiAdi: "Gemi Adı",
  seferNo: "Sefer No",
  teslimSekli: "Teslim Şekli",
  gemiKalkisi: "Gemi Kalkışı",
  tasiyiciAcente: "Taşıyıcı Acente",
  konsimentoNo: "Konşimento No",
  yukSatiri: "Konteyner / Ambalaj",
  agirlikSatiri: "Brüt / Net Ağırlık",
};

/** "25/09/2026" - bugunun tarihi, Turkiye saatine gore. */
export function sigortaTalimatiTarihi(simdi: Date = new Date()): string {
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" })
    .format(simdi)
    .replace(/\./g, "/");
}

/** "2026-09-19" -> "19.09.2026" (saat dilimi donusumu YAPMADAN, metinden ham). */
function tarihNoktali(deger: string | null | undefined): string {
  if (!deger) return "";
  const m = deger.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  const d = new Date(deger);
  return isNaN(d.getTime()) ? deger : d.toLocaleDateString("tr-TR");
}

function sayiTR(n: number, ondalik = 0): string {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: ondalik, maximumFractionDigits: ondalik });
}

/** Ayni degerleri tekrarlamadan " / " ile birlestirir (birden fazla rezervasyon). */
function farkliDegerler(degerler: (string | null | undefined)[]): string {
  const goruldu = new Set<string>();
  const sonuc: string[] = [];
  degerler.forEach((d) => {
    const t = (d || "").trim().replace(/\s+/g, " ");
    if (t && !goruldu.has(t.toUpperCase())) { goruldu.add(t.toUpperCase()); sonuc.push(t); }
  });
  return sonuc.join(" / ");
}

/**
 * Varis limanindan ULKE: "Lome Port, Togo" -> TOGO; "COTONOU PORT BENIN" ->
 * BENIN; ulke ayirt edilemiyorsa ("DJIBOUTI PORT", "SİNGAPUR") liman adi.
 * Not: toUpperCase (tr-TR DEGIL) - "Guinea" -> "GUINEA" kalsin, "GUİNEA" olmasin.
 */
export function sigortaGidecegiYer(varisLimani: string | null | undefined): string {
  const ham = (varisLimani || "").trim().replace(/\s+/g, " ");
  if (!ham) return "";
  if (ham.includes(",")) {
    const ulke = ham.split(",").pop()!.trim().replace(/^republic of\s+/i, "");
    if (ulke) return ulke.toUpperCase();
  }
  const kelimeler = ham.split(" ");
  const portIndex = kelimeler.findIndex((k) => /^(port|limani|limanı)$/i.test(k));
  if (portIndex >= 0) {
    const sonrasi = kelimeler.slice(portIndex + 1).join(" ").trim();
    const oncesi = kelimeler.slice(0, portIndex).join(" ").trim();
    return (sonrasi || oncesi || ham).toUpperCase();
  }
  return ham.toUpperCase();
}

/** Hat kisaltmalarinin belgede yazilan tam adi. */
const HAT_ADLARI: Record<string, string> = {
  HAPAG: "HAPAG-LLOYD",
  "HAPAG LLOYD": "HAPAG-LLOYD",
  CMA: "CMA CGM",
};

/** "DRAFT/HAPAG" -> "HAPAG-LLOYD", "LOGISTURK/CMA" -> "CMA CGM", "CULINES" -> "CULINES". */
export function sigortaTasiyiciAcente(acente: string | null | undefined): string {
  const ham = (acente || "").trim().replace(/\s+/g, " ").toUpperCase();
  if (!ham) return "";
  const hat = ham.includes("/") ? ham.split("/").pop()!.trim() : ham;
  return HAT_ADLARI[hat] || hat || ham;
}

/** "20DC" -> "20 DC", "40hc" -> "40 HC". */
function konteynerTipi(tip: string | null | undefined): string {
  const t = (tip || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return "";
  return t.replace(/^(\d+)([A-Z].*)$/, "$1 $2");
}

/**
 * Ingilizce ambalaj metnini sigorta talimatindaki Turkce kaliba cevirir:
 *   "2.500 PIECES OF 50 KG PP BAGS+KRAFT" -> "2.500 ADET 50 KG PP+KRAFT ÇUVAL"
 *   "7.000 PIECES OF IBRAHIM BRANDED 25 KG PP BAGS" -> "7.000 ADET IBRAHIM MARKALI 25 KG PP ÇUVAL"
 * Taninmayan kelimeler oldugu gibi kalir (pencerede duzeltilebilir).
 */
export function ambalajTurkce(metin: string | null | undefined): string {
  let s = (metin || "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  s = s.toUpperCase();
  s = s
    .replace(/\bPIEC+ES?(\s+PIEC+ES?)*(\s+OF)?\b/g, "ADET")
    .replace(/\bPP\s*BAGS?\s*\+\s*KRAFT\b/g, "PP+KRAFT ÇUVAL")
    .replace(/\bPP\s*\+\s*KRAFT\s*BAGS?\b/g, "PP+KRAFT ÇUVAL")
    .replace(/\bBAGS?\b/g, "ÇUVAL")
    .replace(/\bBRANDED\b/g, "MARKALI")
    .replace(/\bBRAND\b/g, "MARKA")
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/, "")
    .trim();
  return s;
}

/** "5 X 20 DC KONTEYNER" (karisik tiplerde "3 X 20 DC + 2 X 40 HC KONTEYNER"). */
function konteynerOzeti(konteynerler: Konteyner[], rezervasyonAdedi: number): string {
  if (konteynerler.length === 0) return rezervasyonAdedi > 0 ? `${rezervasyonAdedi} X KONTEYNER` : "";
  const gruplar = new Map<string, number>();
  konteynerler.forEach((k) => {
    const tip = konteynerTipi(k.tip);
    gruplar.set(tip, (gruplar.get(tip) || 0) + 1);
  });
  const parcalar = Array.from(gruplar.entries()).map(([tip, adet]) => (tip ? `${adet} X ${tip}` : `${adet} X`));
  return `${parcalar.join(" + ")} KONTEYNER`;
}

function malBedeli(dosya: Dosya): string {
  let tutar = dosya.toplam_tutar;
  if (tutar === null || tutar === undefined) {
    const urunler = (dosya.urun_detaylari as any[]) || [];
    const toplam = urunler.reduce((s, u) => s + (parseFloat(String(u.toplam_tutar_usd || u.total_amount || 0)) || 0), 0);
    tutar = toplam > 0 ? toplam : null;
  }
  if (tutar === null || tutar === undefined) return "";
  return `${sayiTR(Number(tutar), 2)} ${dosya.para_birimi || "USD"}`;
}

/** Dosya/rezervasyon/konteyner verisinden otomatik alan degerleri. */
export function sigortaTalimatiVarsayilanlari(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[]
): SigortaTalimatiAlanlari {
  const rezAdedi = rezervasyonlar.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
  const toplamKap = konteynerler.reduce((s, k) => s + (k.pieces || 0), 0);
  const toplamNet = konteynerler.reduce((s, k) => s + (k.net_agirlik_kg || 0), 0);
  const toplamBrut = konteynerler.reduce((s, k) => s + (k.brut_agirlik_kg || 0), 0);

  // Detayli ambalaj kap adedini zaten iceriyor ("2.500 PIECES OF ..."); yoksa
  // konteynerlerdeki kap toplami + kisa ambalaj adi kullanilir.
  const ambalaj = dosya.detayli_ambalaj?.trim()
    ? ambalajTurkce(dosya.detayli_ambalaj)
    : [toplamKap ? `${sayiTR(toplamKap)} ADET` : null, ambalajTurkce(dosya.ambalaj)].filter(Boolean).join(" ");

  const agirlik = [
    toplamBrut ? `BRÜT : ${sayiTR(toplamBrut, 2)} KGS` : null,
    toplamNet ? `NET : ${sayiTR(toplamNet, 2)} KGS` : null,
  ].filter(Boolean).join(" , ");

  return {
    malBedeli: malBedeli(dosya),
    gidecegiYer: sigortaGidecegiYer(dosya.varis_limani),
    gemiAdi: farkliDegerler(rezervasyonlar.map((r) => r.gemi_adi)).toUpperCase(),
    seferNo: farkliDegerler(rezervasyonlar.map((r) => r.sefer_no)).toUpperCase(),
    teslimSekli: (dosya.teslim_sekli || "").trim().toUpperCase(),
    gemiKalkisi: farkliDegerler(rezervasyonlar.map((r) => tarihNoktali(r.gemi_kalkis_tarihi))),
    tasiyiciAcente: farkliDegerler(rezervasyonlar.map((r) => sigortaTasiyiciAcente(r.acente_ismi))),
    konsimentoNo: (dosya.bl_no || "").trim().toUpperCase(),
    yukSatiri: [konteynerOzeti(konteynerler, rezAdedi), ambalaj].filter(Boolean).join("  "),
    agirlikSatiri: agirlik,
  };
}

/**
 * Butonlarin acilma kosulu (Fatura Talimati ile ayni): rezervasyon var ve
 * rezervasyondaki konteyner adedi kadar konteyner eklenmis - aksi halde kap,
 * brut ve net toplamlari eksik/yanlis cikar. "eksikler" engelleyici DEGILDIR:
 * bos kalan alanlar "Talimat" penceresinde doldurulabilir; dogrudan "Indir"
 * ise eksik alan varken kapali tutulur ki yarim belge gonderilmesin.
 */
export function sigortaTalimatiHazirlik(
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[],
  alanlar: SigortaTalimatiAlanlari
): { acilabilir: boolean; engel: string | null; eksikler: string[] } {
  const rezAdedi = rezervasyonlar.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
  let engel: string | null = null;
  if (rezervasyonlar.length === 0 || rezAdedi === 0) engel = "Önce rezervasyon (konteyner adedi) girilmeli.";
  else if (konteynerler.length !== rezAdedi) engel = `Konteynerler tamamlanmalı (${konteynerler.length}/${rezAdedi} eklendi).`;
  const eksikler = (Object.keys(SIGORTA_ALAN_ETIKETLERI) as (keyof SigortaTalimatiAlanlari)[])
    .filter((k) => !alanlar[k].trim())
    .map((k) => SIGORTA_ALAN_ETIKETLERI[k]);
  return { acilabilir: engel === null, engel, eksikler };
}
