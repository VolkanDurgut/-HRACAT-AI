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

import { diibAnahtari as diibAnahtariYerel } from "@/lib/diib/hesap";
import { limanAnahtari as limanAnahtariYerel } from "@/lib/liman-anahtari";

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
  /** 10.11.2026: alan alan kontrol (beyanname kontrolu gibi). Eski kayitlarda yok. */
  kontroller?: FaturaKontrolu[];
  /** 10.11.2026: PDF'te okunabilir metin yoktu (yapay zekaya dusulmez; elle bakilir). */
  okunamadi?: boolean;
};

export type FaturaKontrolDurumu = "uyumlu" | "uyusmuyor" | "okunamadi" | "bilgi";
export type FaturaKontrolu = { alan: string; durum: FaturaKontrolDurumu; sistem: string; belge: string; not?: string };

/** e-Fatura "Genel Aciklamalar" / ust blok alanlari (10.11.2026). Bulunamayan null. */
export type FaturaEkAlanlar = {
  alici: string | null;          // "SAYIN ..." ile adres arasi
  teslimSekli: string | null;    // CIF / FOB / CFR ...
  gtip: string | null;           // 12 hane (110100150000)
  gemi: string | null;
  cikisLimani: string | null;    // ilk kelime (KUMPORT / MARPORT ...)
  varisMetni: string | null;     // "VARIS LIMANI :" sonrasi ham parca
  marka: string | null;
  odemeSekli: string | null;
  araciBanka: string | null;     // ham ("ORNEKBANK - SUBE ...")
  rezervasyonNo: string | null;  // "REZERVASYON NO:" ya da "Siparis No:"
  konteynerAdedi: number | null;
  metin: string;                 // sadelestirilmis tum metin (gecis kontrolleri)
};

/** Sistem tarafi ek beklenenler (dosya + rezervasyonlar). Bos olan alan kontrol edilmez. */
export type FaturaBeklenenEk = {
  aliciFirma?: string | null;
  teslimSekli?: string | null;
  varisLimani?: string | null;
  yuklemeYerleri?: string[];
  gemiler?: string[];
  rezervasyonNolari?: string[];
  marka?: string | null;
  odemeSekli?: string | null;
  banka?: string | null;
  diibNo?: string | null;        // tek faturada dosyanin DIIB'i (bolunmuste parca.diib kullanilir)
  gtip?: string | null;          // 8 hane (11010015)
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
  /** 10.11.2026: ek alanlar (eski cagiranlarda yok sayilir). */
  ek?: FaturaEkAlanlar;
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
  /** 10.11.2026: alici, teslim, gemi, liman, rezervasyon, marka, odeme, banka, DIIB, GTIP. */
  ek?: FaturaBeklenenEk;
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
    ek: faturaEkOku(n),
  };
}

const INCOTERM_LISTE = "CIF|CFR|CNF|FOB|CPT|CIP|DAP|DDP|DPU|EXW|FCA|FAS";
/** Ek alanlar (sadelestirilmis buyuk harf metinden). Kurallar Unex e-Fatura sablonlarina gore (2 bicim). */
export function faturaEkOku(n: string): FaturaEkAlanlar {
  const bul = (re: RegExp) => { const m = re.exec(n); return m ? m[1].replace(/\s+/g, " ").trim() : null; };
  // Alan sonu: sonraki etiket ya da "¦" ayiraci
  const SON = "(?=\\s*(?:¦|\\||-\\s*¦|MARKA|ODEME|GEMI|VARIS|CIKIS|KAP ADEDI|BRUT|NET|TESLIM|KONTEYNER|ARACI|DIIB|TICARETI|FOB|CIF|REZERVASYON|URUNLERIMIZ|MALLARIMIZ|SIRA NO|$))";
  // Alici: "SAYIN" sonrasi, adres numaralarindan once ("A.B.C 12 ORNEK CAD ..." -> "A.B.C")
  const aliciHam = bul(/SAYIN\s+(.+?)\s+(?:BINA NO|KAPI NO|E-POSTA|TEL\b|VKN|0,00 USD|E-FATURA)/);
  const alici = aliciHam ? aliciHam.replace(/\s+\d{2,}[\s\S]*$/, "").trim() || aliciHam : null;
  const teslim = bul(new RegExp(`TESLIM (?:SEKLI|SARTI)\\s*:\\s*(${INCOTERM_LISTE})\\b`)) ||
    bul(new RegExp(`\\b(?:USD|EUR|GBP)\\s+(${INCOTERM_LISTE})\\b`));
  const gtip = bul(/(?:DENIZYOLU|KARAYOLU|HAVAYOLU|DEMIRYOLU)\s+(\d{8,12})\b/);
  const gemiHam = bul(/GEMI ADI(?:\s*\/\s*SEFER(?:I|\s*NO)?)?\s*:\s*(?:M\/?[VS]\.?\s*|MT\.?\s+)?(.+?)\s*\//);
  const gemi = gemiHam ? gemiHam.replace(/^(?:M\/?V|M\/?S|MT)\.?\s+/, "").trim() : null;
  const cikis = bul(/CIKIS LIMANI\s*:\s*([A-Z]+)/);
  const varis = bul(new RegExp(`VARIS LIMANI\\s*:\\s*(.{2,60}?)${SON}`));
  const marka = bul(new RegExp(`\\bMARKA\\s*:\\s*(.{1,60}?)${SON}`));
  const odeme = bul(new RegExp(`ODEME SEKLI\\s*:\\s*(.{3,40}?)(?=\\s*(?:-\\s|¦|VARIS|MARKA|GEMI|KAP|ARACI|MALLARIMIZ|URUNLERIMIZ|$))`));
  const banka = bul(new RegExp(`ARACI BANKA\\s*:\\s*(.{3,60}?)${SON}`));
  const rez = bul(/REZERVASYON NO\s*:\s*([A-Z0-9]+)/) || bul(/SIPARIS NO\s*:\s*([A-Z0-9]+)/);
  const adet = bul(/KONTEYNER ADEDI\s*:\s*(\d+)/);
  return {
    alici, teslimSekli: teslim === "CNF" ? "CFR" : teslim, gtip, gemi, cikisLimani: cikis, varisMetni: varis,
    marka, odemeSekli: odeme, araciBanka: banka, rezervasyonNo: rez, konteynerAdedi: adet ? Number(adet) : null, metin: n,
  };
}

/** Banka adlarinin ayirt edici kelimesi ("T.C. ZIRAAT BANKASI" -> ZIRAAT, "VAKIFBANK" -> VAKIF). */
const BANKALAR = ["ZIRAAT", "VAKIF", "HALK", "GARANTI", "AKBANK", "YAPI KREDI", "IS BANK", "ISBANK", "QNB", "FINANS", "DENIZ", "KUVEYT", "ALBARAKA", "TEB", "ING", "HSBC", "SEKER", "ODEA", "FIBA", "ANADOLU", "EXIM", "TURKIYE FINANS", "ZIRAAT KATILIM", "VAKIF KATILIM", "EMLAK"];
function bankaAnahtari(ham: string | null | undefined): string | null {
  const s = ` ${sade(ham || "").replace(/[^A-Z ]+/g, " ").replace(/\s+/g, " ")} `;
  const b = BANKALAR.find((x) => s.includes(` ${x}`) || (x.includes(" ") && s.replace(/ /g, "").includes(x.replace(/ /g, ""))));
  return b ? (b === "ISBANK" ? "IS BANK" : b) : null;
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

  const k = faturaAlanKontrolleri(f, b, sistemK, faturaK);
  // Yeni (ek) alanlarda uyusmayan da uyusmazlik listesine (eski gorunum + rozet ayni kalsin)
  for (const x of k) {
    if (x.durum === "uyusmuyor" && x.ek) u.push({ alan: x.alan, sistemde: x.sistem, dosyada: x.belge });
  }

  const tutan = [
    faturaK.size ? `konteyner ${Array.from(faturaK).filter((k) => sistemK.has(k)).length}/${b.parca ? faturaK.size : sistemK.size}` : null,
    f.netKg != null ? `net ${kg(f.netKg)}` : null,
    f.tutar != null ? para(f.tutar, f.paraBirimi) : null,
  ].filter(Boolean).join(", ");
  const kontrolEdilen = k.filter((x) => x.durum === "uyumlu" || x.durum === "uyusmuyor").length;
  const uyumluSay = k.filter((x) => x.durum === "uyumlu").length;
  const elle = k.filter((x) => x.durum === "bilgi" || x.durum === "okunamadi").length;
  const ozet = u.length
    ? `${u.length} uyuşmazlık bulundu (${uyumluSay}/${kontrolEdilen} alan uyumlu). Fatura metninden okundu (yapay zekâ kullanılmadı).`
    : `Fatura metninden okundu (yapay zekâ kullanılmadı): ${uyumluSay}/${kontrolEdilen} alan sistemle uyumlu${tutan ? ` (${tutan})` : ""}.${elle ? ` ${elle} alana elle bakın.` : ""}${notlar.length ? ` Not: ${notlar.join("; ")}.` : ""}`;
  return {
    uyumlu: u.length === 0, uyusmazliklar: u, ozet,
    fatura_no: f.faturaNo, fatura_tarihi: f.faturaTarihi || "", diib_no: f.diibNo, diib_tarihi: f.diibTarihi, kaynak: "metin",
    kontroller: k.map(({ ek: _ek, ...x }) => x),
  };
}

/** Okunamayan (metinsiz) fatura: yapay zekaya gidilmez, elle bakilmasi istenir (10.11.2026). */
export function faturaOkunamadiSonucu(): FaturaKontrolSonucu {
  return {
    uyumlu: false, okunamadi: true, uyusmazliklar: [], kaynak: "metin",
    ozet: "Fatura PDF'inde okunabilir metin bulunamadı (taranmış ya da görsel PDF olabilir). e-Fatura PDF'ini yükleyin ya da bilgileri elle kontrol edin.",
    fatura_no: "", fatura_tarihi: "", diib_no: null, diib_tarihi: null,
    kontroller: [{ alan: "Fatura metni", durum: "okunamadi", sistem: "-", belge: "-", not: "Metin katmanı yok; ücretli okuma kullanılmadı." }],
  };
}

const sayiTr = (x: number) => x.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const kelimeVar = (metin: string, kelime: string) => !!kelime && ` ${metin.replace(/[^A-Z0-9]+/g, " ")} `.includes(` ${kelime} `);
const TERMINALLER = ["HAYDARPASA", "ISKENDERUN", "ASYAPORT", "BANDIRMA", "TEKIRDAG", "DERINCE", "MARPORT", "KUMPORT", "NEMPORT", "BORUSAN", "AMBARLI", "TRABZON", "MARDAS", "MARTAS", "AKPORT", "GEMLIK", "ALIAGA", "MERSIN", "SAMSUN", "EVYAP", "IZMIR"];
function terminal(ham: string): string {
  const s = ` ${sade(ham).replace(/[^A-Z0-9]+/g, " ").trim()} `;
  const t = TERMINALLER.filter((x) => s.includes(` ${x} `));
  return t.find((x) => x !== "AMBARLI") || t[0] || s.trim().split(" ")[0] || "";
}
/** "ORNEK DIS TICARET LTD" -> O.D.T.L deseni (faturada alici bas harfleriyle yazilabiliyor). */
function basHarf(unvan: string): RegExp | null {
  const k = sade(unvan).split(/[^A-Z0-9]+/).filter(Boolean);
  if (k.length < 2) return null;
  return new RegExp(`(?:^|[^A-Z])${k.map((x) => x[0]).join("\\.?\\s?")}\\.?(?=[^A-Z]|$)`);
}

type IcKontrol = FaturaKontrolu & { ek?: boolean };
/** Alan alan kontrol listesi. ek=true: 10.11.2026'da eklenen alan (uyusmazliga ayrica eklenir). */
function faturaAlanKontrolleri(f: OkunanFatura, b: FaturaBeklenen, sistemK: Set<string>, faturaK: Set<string>): IcKontrol[] {
  const k: IcKontrol[] = [];
  const ekle = (alan: string, durum: FaturaKontrolDurumu, sistem: string, belge: string, not?: string, ek?: boolean) =>
    k.push({ alan, durum, sistem, belge, ...(not ? { not } : {}), ...(ek ? { ek: true } : {}) });
  const e = f.ek, s = b.ek || {};

  // Tutar + para birimi (eski kural)
  if (b.tutar) {
    const pbFark = !!(b.paraBirimi && f.paraBirimi && b.paraBirimi.toUpperCase() !== f.paraBirimi);
    const tutuyor = f.tutar != null && [f.tutar, f.malTutari].some((x) => x != null && Math.abs(x - (b.tutar as number)) <= 2);
    ekle("Toplam tutar", f.tutar == null ? "okunamadi" : pbFark || !tutuyor ? "uyusmuyor" : "uyumlu",
      para(b.tutar, b.paraBirimi), f.tutar == null ? "-" : para(f.tutar, f.paraBirimi),
      tutuyor && f.malTutari != null && f.tutar !== f.malTutari && Math.abs((f.malTutari as number) - b.tutar) <= 2 ? "Mal toplamı tutuyor (navlun ayrı yazılmış)." : undefined);
  }
  // Konteynerler (eski kural)
  if (sistemK.size) {
    const fazla = Array.from(faturaK).filter((x) => !sistemK.has(x));
    const eksik = Array.from(sistemK).filter((x) => !faturaK.has(x));
    const hata = fazla.length > 0 || (!b.parca && eksik.length > 0);
    ekle("Konteynerler", !faturaK.size ? "okunamadi" : hata ? "uyusmuyor" : "uyumlu", `${sistemK.size} konteyner`, `${faturaK.size} konteyner`,
      [fazla.length ? `Sistemde yok: ${fazla.join(", ")}` : "", !b.parca && eksik.length ? `Faturada yok: ${eksik.join(", ")}` : ""].filter(Boolean).join(" · ") || undefined);
  }
  if (e?.konteynerAdedi != null && sistemK.size && !b.parca) {
    ekle("Konteyner adedi", e.konteynerAdedi === sistemK.size ? "uyumlu" : "uyusmuyor", String(sistemK.size), String(e.konteynerAdedi), undefined, true);
  }
  if (b.netKg) ekle("Net ağırlık", f.netKg == null ? "okunamadi" : Math.abs(f.netKg - b.netKg) > agirlikPayi(b.netKg) ? "uyusmuyor" : "uyumlu", kg(b.netKg), f.netKg == null ? "-" : kg(f.netKg));
  if (b.brutKg) ekle("Brüt ağırlık", f.brutKg == null ? "okunamadi" : Math.abs(f.brutKg - b.brutKg) > agirlikPayi(b.brutKg) ? "uyusmuyor" : "uyumlu", kg(b.brutKg), f.brutKg == null ? "-" : kg(f.brutKg));
  if (b.kap) ekle("Kap adedi", f.kap == null ? "okunamadi" : Math.round(f.kap) !== Math.round(b.kap) ? "uyusmuyor" : "uyumlu", sayiTr(b.kap), f.kap == null ? "-" : sayiTr(f.kap));

  // DIIB: bolunmuste parcanin (eski kural), tek faturada dosyanin DIIB'i (yeni)
  if (b.parca) {
    ekle(`DİİB (${b.parca.sira}. fatura)`, !f.diibAnahtar ? "okunamadi" : b.parca.diibAnahtar && f.diibAnahtar !== b.parca.diibAnahtar ? "uyusmuyor" : "uyumlu", b.parca.diibMetni, f.diibNo || "-");
  } else if (s.diibNo) {
    const a = diibAnahtariYerel(s.diibNo);
    const dHane = (x: string | null) => /D\s*(\d)/i.exec(x || "")?.[1];
    const dFarki = a && f.diibAnahtar === a && dHane(s.diibNo) && dHane(f.diibNo) && dHane(s.diibNo) !== dHane(f.diibNo);
    ekle("DİİB", !f.diibAnahtar ? "okunamadi" : a && f.diibAnahtar !== a ? "uyusmuyor" : "uyumlu", s.diibNo, f.diibNo || "-",
      dFarki ? "Belge numarası aynı, D harfinden sonraki hane farklı. DİİB belgesindeki numarayı teyit edin." : undefined, true);
  }

  if (s.teslimSekli) {
    const t = sade(s.teslimSekli).replace(/[^A-Z]/g, "").slice(0, 3).replace("CNF", "CFR");
    ekle("Teslim şekli", !e?.teslimSekli ? "okunamadi" : e.teslimSekli === t ? "uyumlu" : "uyusmuyor", s.teslimSekli, e?.teslimSekli || "-", undefined, true);
  }
  if (s.gemiler && s.gemiler.length) {
    const ad = (g: string) => sade(g).replace(/^(M\/?V|M\/?S|MT)\.?\s+/, "").replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    const fg = e?.gemi ? ad(e.gemi) : "";
    const ayni = !!fg && s.gemiler.some((g) => ad(g) === fg || ad(g).startsWith(fg) || fg.startsWith(ad(g)));
    ekle("Gemi", !e?.gemi ? "bilgi" : ayni ? "uyumlu" : "uyusmuyor", s.gemiler.join(", "), e?.gemi || "-", !e?.gemi ? "Faturada gemi adı bulunamadı; elle bakın." : undefined, true);
  }
  if (s.rezervasyonNolari && s.rezervasyonNolari.length) {
    const nolar = s.rezervasyonNolari.map((x) => x.replace(/\s+/g, "").toUpperCase());
    const var_ = nolar.some((x) => x.length >= 5 && kelimeVar(e?.metin || "", x));
    ekle("Rezervasyon (booking) no", var_ ? "uyumlu" : "bilgi", nolar.join(", "), var_ ? "var" : e?.rezervasyonNo || "-",
      var_ ? undefined : "Faturada rezervasyon numarası bulunamadı; elle bakın.", true);
  }
  if (s.yuklemeYerleri && s.yuklemeYerleri.length) {
    const sis = s.yuklemeYerleri.map(terminal).filter(Boolean);
    const c = e?.cikisLimani || null;
    const bilinen = !!c && TERMINALLER.includes(c);
    const tutuyor = !!c && sis.includes(c);
    ekle("Çıkış limanı", tutuyor ? "uyumlu" : !c ? "bilgi" : bilinen ? "uyusmuyor" : "bilgi", s.yuklemeYerleri.join(", "), c || "-",
      tutuyor ? undefined : !c ? "Faturada çıkış limanı bulunamadı; elle bakın." : bilinen ? "Faturadaki çıkış limanı rezervasyondakinden farklı." : "Liman adı tanınmadı; elle bakın.", true);
  }
  if (s.varisLimani) {
    const anahtar = limanAnahtariYerel(s.varisLimani);
    const ilk = anahtar ? anahtar.split(" ")[0] : "";
    const alan = e?.varisMetni ? sade(e.varisMetni) : "";
    const var_ = !!ilk && (alan ? kelimeVar(alan, ilk) : kelimeVar(e?.metin || "", ilk));
    ekle("Varış limanı", var_ ? "uyumlu" : alan ? "uyusmuyor" : "bilgi", s.varisLimani, e?.varisMetni || "-",
      var_ ? undefined : alan ? "Faturadaki varış limanı sistemdekinden farklı." : "Faturada varış limanı bulunamadı; elle bakın.", true);
  }
  if (s.aliciFirma) {
    const ilk = sade(s.aliciFirma).split(/[^A-Z0-9]+/).filter((x) => x.length >= 3)[0] || "";
    const desen = basHarf(s.aliciFirma);
    const metin = e?.alici ? sade(e.alici) : e?.metin || "";
    const tam = !!ilk && kelimeVar(metin, ilk);
    const kisa = !tam && !!desen && desen.test(metin);
    ekle("Alıcı", tam || kisa ? "uyumlu" : "bilgi", s.aliciFirma, e?.alici || "-",
      kisa ? "Baş harfleriyle yazılmış." : tam ? undefined : "Alıcı adı faturada bulunamadı; kısaltılmış olabilir, elle bakın.", true);
  }
  if (s.marka) {
    const sis = sade(s.marka).split(/[,/]+| VE /).map((x) => x.replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").replace(/ BRAND$/, "").trim()).filter(Boolean);
    const fm = e?.marka ? sade(e.marka).replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").replace(/ BRAND$/, "").trim() : "";
    const ayni = !!fm && sis.some((x) => x === fm || fm.includes(x) || x.includes(fm));
    ekle("Marka", !fm ? "bilgi" : ayni ? "uyumlu" : "uyusmuyor", s.marka, e?.marka || "-", !fm ? "Faturada marka bulunamadı; elle bakın." : undefined, true);
  }
  if (s.odemeSekli) {
    const sis = sade(s.odemeSekli).replace(/[^A-Z ]+/g, " ").replace(/\s+/g, " ").trim();
    const fo = e?.odemeSekli ? sade(e.odemeSekli).replace(/[^A-Z ]+/g, " ").replace(/\s+/g, " ").trim() : "";
    const ayni = !!fo && (fo.startsWith(sis) || sis.startsWith(fo));
    ekle("Ödeme şekli", !fo ? "bilgi" : ayni ? "uyumlu" : "uyusmuyor", s.odemeSekli, e?.odemeSekli || "-", !fo ? "Faturada ödeme şekli bulunamadı; elle bakın." : undefined, true);
  }
  if (s.banka) {
    const sb = bankaAnahtari(s.banka), fb = bankaAnahtari(e?.araciBanka);
    ekle("Aracı banka", !e?.araciBanka ? "bilgi" : sb && fb ? (sb === fb ? "uyumlu" : "uyusmuyor") : "bilgi", s.banka, e?.araciBanka || "-",
      !e?.araciBanka ? "Faturada aracı banka yazmıyor; elle bakın." : sb && fb && sb !== fb ? "Aracı banka proformadaki bankadan farklı." : !(sb && fb) ? "Banka adı tanınmadı; elle bakın." : undefined, true);
  }
  if (s.gtip) {
    const g = s.gtip.replace(/\D/g, "");
    const fg = (e?.gtip || "").replace(/\D/g, "");
    ekle("GTİP", !fg ? "bilgi" : fg.startsWith(g) ? "uyumlu" : "bilgi", g, fg || "-", !fg ? "Faturada GTİP bulunamadı; elle bakın." : fg.startsWith(g) ? undefined : "Sistemdeki varsayılan GTİP'ten farklı; ürün farklıysa normaldir, teyit edin.", true);
  }
  return k;
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
