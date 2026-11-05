/**
 * FATURA OKUMA + KONTROL - YAPAY ZEKASIZ (05.11.2026).
 * Kullanici: "Fatura yuklemede yapay zeka calisiyor; bunu masrafsiz ve dogru okutamaz miyiz?"
 *
 * Unex'in e-Faturalari (e-Fatura / e-Arsiv, "Print To PDF" ciktisi dahil) GERCEK METIN katmanli ve
 * etiketleri sabit: "Fatura No:", "Fatura Tarihi:", "Odenecek Tutar", Genel Aciklamalar'da
 * "DIIB NO:", "NET:", "BRUT:", "KAP ADEDI:", "KONTEYNER NO:". Metin tarayicida pdf.js (unpdf;
 * beyanname / irsaliye okuma ile ayni paket) ile cikarilir, kurallarla okunur ve sistemle
 * karsilastirilir -> ucretsiz, ayni belgede her seferinde ayni sonuc.
 * Fatura no OKUNAMAZSA (taranmis / gorsel PDF, farkli sablon) null doner; cagiran o zaman eski
 * yapay zeka kontrolune (fatura-kontrol) duser - hicbir fatura yuklenemez hale gelmez.
 * Saf fonksiyonlar (faturaMetniOku / faturaKarsilastir) - test: scratchpad fatura/test.mts.
 */

export type FaturaKontrolSonucu = {
  uyumlu: boolean;
  uyusmazliklar: { alan: string; sistemde: string; dosyada: string }[];
  ozet: string;
  fatura_no: string;
  fatura_tarihi: string;
  diib_no: string | null;
  diib_tarihi: string | null;
  /** "metin" = yapay zekasiz okundu; yoksa (eski kayitlar / yedek) yapay zeka. */
  kaynak?: "metin" | "yapay_zeka";
};

export type OkunanFatura = {
  faturaNo: string;
  faturaTarihi: string | null;          // YYYY-MM-DD
  diibNo: string | null;                // "04.03.2026 TARİH 2026-D1-01152" (dosyadaki DIIB alani bicimi)
  diibTarihi: string | null;            // YYYY-MM-DD
  diibAnahtar: string | null;           // "2026-01152"
  tutar: number | null;                 // odenecek tutar (doviz)
  malTutari: number | null;             // mal / hizmet toplam tutari (doviz)
  paraBirimi: string | null;
  netKg: number | null;
  brutKg: number | null;
  kap: number | null;
  konteynerler: string[];
};

/** Karsilastirmada beklenen (sistemdeki) degerler. Bolunmus faturada parcanin degerleri. */
export type FaturaBeklenen = {
  konteynerler: string[];
  netKg: number | null;
  brutKg: number | null;
  kap: number | null;
  tutar: number | null;
  paraBirimi: string | null;
  /** Bolunmus yuklemenin parcasi: konteynerler faturada KISMEN yazilabilir, DIIB parcanin DIIB'i olmali. */
  parca?: { sira: number; diibAnahtar: string | null; diibMetni: string } | null;
};

const sade = (s: string) =>
  s.toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ö/g, "O").replace(/Ç/g, "C").replace(/\s+/g, " ");

/** "61.500,00" / "150.000" / "48.400" -> sayi (Turk bicimi). */
export function trSayi(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = s.trim().replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const KONTEYNER = /\b([A-Z]{4})\s?(\d{7})\b/g;

/** e-Fatura metninden alanlar; fatura no bulunamazsa null (yapay zekaya dusulur). */
export function faturaMetniOku(metin: string): OkunanFatura | null {
  const n = sade(metin || "");
  const no = /FATURA NO\s*:\s*([A-Z0-9]{3}20\d{2}\d{9})\b/.exec(n);
  if (!no) return null;
  const tar = /FATURA TARIHI\s*:\s*(\d{2})\s*-\s*(\d{2})\s*-\s*(\d{4})/.exec(n);
  // "DIIB NO:04.03.2026 / 2026 /D1-01152" | "DIIB NO: 19.08.2026 TARIH 2026-D2-04219" | "DIIB : 2026-D2-04219"
  const diib = /D[I]{2}B(?:\s*NO)?\s*:?\s*(?:(\d{2})\.(\d{2})\.(\d{4})\s*(?:\/|TARIH)?\s*)?(20\d{2})\s*[/-]?\s*D\s*(\d)\s*[-/]?\s*(\d{4,6})/.exec(n);
  const doviz = Array.from(n.matchAll(/ODENECEK TUTAR\s*([\d.,]+)\s*(USD|EUR|GBP|TL|TRY)\b/g));
  const odenecek = doviz.find((m) => m[2] !== "TL" && m[2] !== "TRY") || doviz[0] || null;
  const mal = Array.from(n.matchAll(/MAL \/ HIZMET TOPLAM TUTARI\s*([\d.,]+)\s*(USD|EUR|GBP|TL|TRY)\b/g)).find((m) => !odenecek || m[2] === odenecek[2]) || null;
  const net = /\bNET(?:\s*KG)?\s*:\s*([\d.,]+)/.exec(n);
  const brut = /\bBRUT(?:\s*KG)?\s*:\s*([\d.,]+)/.exec(n);
  const kap = /\bKAP\s*ADEDI\s*:\s*([\d.,]+)/.exec(n);
  // Kalem satirlarindaki "48.000 KG" miktarlari: aciklamada NET yazmiyorsa net yerine
  const kalemKg = Array.from(n.matchAll(/\b(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?\s*KG\s+[\d.,]+\s*(?:USD|EUR|GBP)\b/g)).map((m) => trSayi(m[1]) || 0);
  const konteynerler = Array.from(new Set(Array.from(n.matchAll(KONTEYNER)).map((m) => `${m[1]}${m[2]}`)));
  const no5 = diib ? diib[6].slice(-5).padStart(5, "0") : null;
  return {
    faturaNo: no[1],
    faturaTarihi: tar ? `${tar[3]}-${tar[2]}-${tar[1]}` : null,
    diibNo: diib ? `${diib[1] ? `${diib[1]}.${diib[2]}.${diib[3]} TARİH ` : ""}${diib[4]}-D${diib[5]}-${no5}` : null,
    diibTarihi: diib && diib[1] ? `${diib[3]}-${diib[2]}-${diib[1]}` : null,
    diibAnahtar: diib ? `${diib[4]}-${no5}` : null,
    tutar: odenecek ? trSayi(odenecek[1]) : null,
    malTutari: mal ? trSayi(mal[1]) : null,
    paraBirimi: odenecek ? (odenecek[2] === "TRY" ? "TL" : odenecek[2]) : null,
    netKg: net ? trSayi(net[1]) : kalemKg.length ? kalemKg.reduce((a, b) => a + b, 0) : null,
    brutKg: brut ? trSayi(brut[1]) : null,
    kap: kap ? trSayi(kap[1]) : null,
    konteynerler,
  };
}

const kg = (x: number) => `${x.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg`;
const para = (x: number, pb: string | null) => `${x.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${pb || ""}`.trim();
/** Kantar / yuvarlama payi: 50 kg ya da %0,2 (buyugu). */
const agirlikPayi = (beklenen: number) => Math.max(50, beklenen * 0.002);

/** Okunan faturayi sistemle karsilastirir (fatura-kontrol ile ayni sonuc bicimi). */
export function faturaKarsilastir(f: OkunanFatura, b: FaturaBeklenen): FaturaKontrolSonucu {
  const u: FaturaKontrolSonucu["uyusmazliklar"] = [];
  const notlar: string[] = [];
  const sistemK = new Set(b.konteynerler.map((k) => k.replace(/\s+/g, "").toUpperCase()).filter(Boolean));
  const faturaK = new Set(f.konteynerler);

  // Konteynerler: faturada olup sistemde olmayan her zaman hata; bolunmuste eksik olmasi normal
  const fazla = Array.from(faturaK).filter((k) => !sistemK.has(k));
  const eksik = Array.from(sistemK).filter((k) => !faturaK.has(k));
  if (faturaK.size === 0) notlar.push("faturada konteyner no yazmıyor");
  else {
    if (fazla.length) u.push({ alan: "Konteyner (sistemde yok)", sistemde: eksik.join(", ") || "-", dosyada: fazla.join(", ") });
    if (!b.parca && eksik.length) u.push({ alan: "Konteyner (faturada yok)", sistemde: eksik.join(", "), dosyada: "-" });
  }

  if (b.netKg && f.netKg != null && Math.abs(f.netKg - b.netKg) > agirlikPayi(b.netKg)) u.push({ alan: "Net ağırlık", sistemde: kg(b.netKg), dosyada: kg(f.netKg) });
  if (b.netKg && f.netKg == null) notlar.push("net kg yazmıyor");
  if (b.brutKg && f.brutKg != null && Math.abs(f.brutKg - b.brutKg) > agirlikPayi(b.brutKg)) u.push({ alan: "Brüt ağırlık", sistemde: kg(b.brutKg), dosyada: kg(f.brutKg) });
  if (b.kap && f.kap != null && Math.round(f.kap) !== Math.round(b.kap)) u.push({ alan: "Kap adedi", sistemde: b.kap.toLocaleString("tr-TR"), dosyada: f.kap.toLocaleString("tr-TR") });

  if (b.paraBirimi && f.paraBirimi && b.paraBirimi.toUpperCase() !== f.paraBirimi) u.push({ alan: "Para birimi", sistemde: b.paraBirimi, dosyada: f.paraBirimi });
  else if (b.tutar && f.tutar != null) {
    // Odenecek tutar ya da mal toplami (navlun ayri yazilmis olabilir) 2 birim payla tutmali
    const tutuyor = [f.tutar, f.malTutari].some((x) => x != null && Math.abs(x - (b.tutar as number)) <= 2);
    if (!tutuyor) u.push({ alan: "Toplam tutar", sistemde: para(b.tutar, b.paraBirimi), dosyada: para(f.tutar, f.paraBirimi) });
  } else if (b.tutar && f.tutar == null) notlar.push("toplam tutar okunamadı");

  if (b.parca) {
    if (!f.diibAnahtar) notlar.push("faturada DİİB no yazmıyor");
    else if (b.parca.diibAnahtar && f.diibAnahtar !== b.parca.diibAnahtar) u.push({ alan: `DİİB (${b.parca.sira}. fatura)`, sistemde: b.parca.diibMetni, dosyada: f.diibNo || "-" });
  }

  const tutan = [
    faturaK.size ? `konteyner ${Array.from(faturaK).filter((k) => sistemK.has(k)).length}/${b.parca ? faturaK.size : sistemK.size}` : null,
    f.netKg != null ? `net ${kg(f.netKg)}` : null,
    f.tutar != null ? para(f.tutar, f.paraBirimi) : null,
  ].filter(Boolean).join(", ");
  const ozet = u.length
    ? `${u.length} uyuşmazlık bulundu. Fatura metninden okundu (yapay zekâ kullanılmadı).`
    : `Fatura metninden okundu (yapay zekâ kullanılmadı): ${tutan} sistemle uyumlu.${notlar.length ? ` Not: ${notlar.join("; ")}.` : ""}`;
  return {
    uyumlu: u.length === 0, uyusmazliklar: u, ozet,
    fatura_no: f.faturaNo, fatura_tarihi: f.faturaTarihi || "", diib_no: f.diibNo, diib_tarihi: f.diibTarihi, kaynak: "metin",
  };
}

/** PDF'in metin katmani (tarayicida); okunamazsa "" (gorsel / bozuk PDF). */
export async function pdfMetni(veri: ArrayBuffer | Uint8Array): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    // Kopya: pdf.js verdigi diziyi devralir (cagiranin File/ArrayBuffer'i bozulmasin)
    const pdf = await getDocumentProxy(new Uint8Array(veri.slice(0)));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  } catch {
    return "";
  }
}
