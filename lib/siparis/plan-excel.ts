/**
 * lib/siparis/plan-excel.ts — operasyonun YUKLEME PLANI Excel'ini (yil sayfasi "2026") TARAYICIDA okur
 * (11.11.2026). Dosya sunucuya yuklenmez/saklanmaz; makro calismaz; yalniz hucre degerleri okunur.
 *
 * Excel yapisi (operasyonun dosyasi, basliklar BIREBIR):
 *   "46.HAFTA (08 KASIM  - 14 KASIM)"                                  <- hafta basligi (A sutunu)
 *   MUSTERI | CINSI | KON.AD. | VARIS LIMANI | CUVAL MARKASI | AMBALAJ | ACENTE | LIMAN | EKIPMAN | BOOKING NO |
 *   BOS EKIPMAN ALIM TARIHI | ARDIYESIZ GIRIS | TALIMAT CUT OFF | BEYAN CUT OFF | ETD | GEMI ADI   <- baslik
 *   (alt baslik: EKIPMAN altinda "BOS EKIPMAN", ETD altinda "GEMI KALKIS", GEMI altinda "SEFERI")
 *   Her booking IKI satir: 1. satir degerler; 2. satir cut-off SAATLERI + SEFER no; 2. satirda CINSI / KON.AD. /
 *   MARKA / AMBALAJ doluysa ayni booking'in ikinci urun kalemidir (KON.AD. toplami = booking'in konteyneri).
 * Sutunlar BASLIK METNINDEN bulunur (sira degisse de calisir). Hafta, dosyadaki hafta basligindan alinir.
 * Cut-off saatleri yerel saattir; rezervasyonlarla ayni kuralla UTC etiketiyle saklanir ("…T10:00:00+00:00").
 */
import { baslikAnahtari, xlsxHamOku, type HamSayfa, type HucreDegeri } from "./xlsx-oku";

export type PlanKalemi = { cinsi: string | null; konteyner: number | null; cuval_markasi: string | null; ambalaj: string | null };

export type PlanExcelSatiri = {
  booking_no: string;
  yil: number;
  hafta: number | null;
  hafta_baslik: string | null;
  sira: number;
  satir: number;                 // Excel satir no (uyarilarda gosterilir)
  musteri: string | null;
  cinsi: string | null;
  konteyner: number | null;      // kalemlerin toplami
  varis_limani: string | null;
  cuval_markasi: string | null;
  ambalaj: string | null;
  acente: string | null;
  liman: string | null;
  ekipman: string | null;
  bos_ekipman_tarihi: string | null;   // YYYY-MM-DD
  ardiyesiz_giris: string | null;
  talimat_cutoff: string | null;       // YYYY-MM-DDTHH:MM:00+00:00 (yerel saat)
  beyan_cutoff: string | null;
  etd: string | null;
  gemi: string | null;
  sefer: string | null;
  kalemler: PlanKalemi[];
};

export type PlanExcelSonucu = { satirlar: PlanExcelSatiri[]; uyarilar: string[]; sayfalar: string[] };


/** Beklenen 16 baslik: alan -> baslik anahtari (onek eslesmesi) */
const BASLIKLAR: Array<[keyof PlanExcelSatiri | "konad", string, string]> = [
  ["musteri", "MUSTERI", "MÜŞTERİ"],
  ["cinsi", "CINSI", "CİNSİ"],
  ["konad", "KONAD", "KON.AD."],
  ["varis_limani", "VARISLIMANI", "VARIŞ LİMANI"],
  ["cuval_markasi", "CUVALMARKASI", "ÇUVAL MARKASI"],
  ["ambalaj", "AMBALAJ", "AMBALAJ"],
  ["acente", "ACENTE", "ACENTE"],
  ["liman", "LIMAN", "LİMAN"],
  ["ekipman", "EKIPMAN", "EKİPMAN"],
  ["booking_no", "BOOKINGNO", "BOOKING NO"],
  ["bos_ekipman_tarihi", "BOSEKIPMAN", "BOŞ EKİPMAN ALIM TARİHİ"],
  ["ardiyesiz_giris", "ARDIYESIZ", "ARDİYESİZ GİRİŞ"],
  ["talimat_cutoff", "TALIMAT", "TALİMAT CUT OFF"],
  ["beyan_cutoff", "BEYAN", "BEYAN CUT OFF"],
  ["etd", "ETD", "ETD"],
  ["gemi", "GEMI", "GEMİ ADI"],
];

const metin = (v: HucreDegeri | undefined): string =>
  v === null || v === undefined ? "" : typeof v === "number" ? (Number.isInteger(v) ? v.toFixed(0) : String(v)) : String(v).replace(/\s+/g, " ").trim();
const bosMu = (v: HucreDegeri | undefined) => metin(v) === "" || /^[.,\-_/\\]+$/.test(metin(v));
const deger = (v: HucreDegeri | undefined): string | null => (bosMu(v) ? null : metin(v));

/** Excel seri gunu -> YYYY-MM-DD (1900 sistemi) */
function seriGun(n: number): string | null {
  if (!Number.isFinite(n) || n < 30000 || n > 80000) return null;
  const d = new Date(Math.round((Math.floor(n) - 25569) * 86400000));
  return d.toISOString().slice(0, 10);
}

/** Tarih hucresi: seri sayi veya "05.11.2026" / "2026-11-05" metni */
export function tarihOku(v: HucreDegeri | undefined): string | null {
  if (typeof v === "number") return seriGun(v);
  const s = metin(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return Number.isNaN(Date.parse(iso)) ? null : iso;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m && !Number.isNaN(Date.parse(m[0])) ? m[0] : null;
}

/** Saat hucresi: gun kesri (0.4166 = 10:00) veya "10:00" metni -> "HH:MM" */
export function saatOku(v: HucreDegeri | undefined): string | null {
  if (typeof v === "number") {
    const kesir = v >= 1 ? v - Math.floor(v) : v;
    if (v >= 1 && kesir === 0) return null;
    const dk = Math.round(kesir * 1440);
    if (dk < 0 || dk >= 1440) return null;
    return `${String(Math.floor(dk / 60)).padStart(2, "0")}:${String(dk % 60).padStart(2, "0")}`;
  }
  const m = metin(v).match(/^(\d{1,2})[:.](\d{2})/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function cutoff(gun: string | null, saat: string | null): string | null {
  return gun ? `${gun}T${saat ?? "00:00"}:00+00:00` : null;
}

function konteynerOku(v: HucreDegeri | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 && v <= 1000 ? Math.round(v) : null;
  const s = metin(v);
  return /^\d{1,4}$/.test(s) && Number(s) <= 1000 ? Number(s) : null;
}

/** "46.HAFTA (08 KASIM  - 14 KASIM)" -> 46 */
const HAFTA = /^\s*(\d{1,2})\s*\.\s*HAFTA\b/i;
/** Booking gecerli mi: en az 3 harf/rakam (".", "," gibi artiklar booking degil) */
const bookingMu = (s: string) => (s.match(/[A-Za-z0-9]/g) || []).length >= 3;

/** Saf cozumleyici (test edilebilir): ham sayfa satirlarindan plan satirlari. */
export function planSayfalariniCoz(sayfalar: HamSayfa[]): PlanExcelSonucu {
  const uyarilar: string[] = [];
  const okunan: string[] = [];
  const sonuc: PlanExcelSatiri[] = [];
  const bookingIndex = new Map<string, PlanExcelSatiri>();
  let sira = 0;

  const yilSayfalari = sayfalar.filter((s) => /^\d{4}$/.test(s.ad.trim())).sort((a, b) => a.ad.localeCompare(b.ad));
  if (!yilSayfalari.length) throw new Error("Dosyada yıl sayfası (ör. 2026) bulunamadı.");

  for (const sayfa of yilSayfalari) {
    const yil = Number(sayfa.ad.trim());
    let sutun: Record<string, number> | null = null;
    let hafta: number | null = null;
    let haftaBaslik: string | null = null;
    let cur: PlanExcelSatiri | null = null;
    let curEk = 0;          // cur'un kacinci devam satiri
    let sayfaSatir = 0;

    for (const [no, h] of sayfa.satirlar) {
      const a = metin(h[0]);
      const hm = a.match(HAFTA);
      if (hm) {
        hafta = Number(hm[1]);
        haftaBaslik = a.replace(/\s+/g, " ").trim();
        cur = null;
        if (hafta < 1 || hafta > 53) { uyarilar.push(`${sayfa.ad} satır ${no}: geçersiz hafta "${a}".`); hafta = null; }
        continue;
      }
      const anahtarlar = h.map((x) => baslikAnahtari(metin(x)));
      if (anahtarlar.some((x) => x === "BOOKINGNO") && anahtarlar.some((x) => x.startsWith("MUSTERI"))) {
        const yeni: Record<string, number> = {};
        for (const [alan, on] of BASLIKLAR) {
          const i = anahtarlar.findIndex((x, k) => x.startsWith(on) && !Object.values(yeni).includes(k));
          if (i >= 0) yeni[alan] = i;
        }
        // "LIMAN" oneki "VARISLIMANI"ni yakalamasin; "GEMI" "GEMIADI"; "EKIPMAN" "BOSEKIPMAN..." degil
        const tam = (on: string) => anahtarlar.findIndex((x) => x === on);
        if (tam("LIMAN") >= 0) yeni.liman = tam("LIMAN");
        if (tam("EKIPMAN") >= 0) yeni.ekipman = tam("EKIPMAN");
        const eksik = BASLIKLAR.filter(([alan]) => yeni[alan] === undefined).map(([, , ad]) => ad);
        if (eksik.length) throw new Error(`${sayfa.ad} sayfası satır ${no}: başlık bulunamadı: ${eksik.join(", ")}. Başlıklar yükleme planı ile aynı olmalı.`);
        sutun = yeni;
        cur = null;
        continue;
      }
      if (!sutun) continue;
      // alt baslik satiri (BOS EKIPMAN / GEMI KALKIS / SEFERI)
      if (baslikAnahtari(metin(h[sutun.ekipman])) === "BOSEKIPMAN" || baslikAnahtari(metin(h[sutun.gemi])) === "SEFERI") { cur = null; continue; }

      const bk = metin(h[sutun.booking_no]);
      if (bookingMu(bk)) {
        sayfaSatir++;
        const kalem: PlanKalemi = { cinsi: deger(h[sutun.cinsi]), konteyner: konteynerOku(h[sutun.konad]), cuval_markasi: deger(h[sutun.cuval_markasi]), ambalaj: deger(h[sutun.ambalaj]) };
        const talimatGun = tarihOku(h[sutun.talimat_cutoff]);
        const beyanGun = tarihOku(h[sutun.beyan_cutoff]);
        const satir: PlanExcelSatiri = {
          booking_no: bk, yil, hafta, hafta_baslik: haftaBaslik, sira: ++sira, satir: no,
          musteri: deger(h[sutun.musteri]), cinsi: kalem.cinsi, konteyner: kalem.konteyner, varis_limani: deger(h[sutun.varis_limani]),
          cuval_markasi: kalem.cuval_markasi, ambalaj: kalem.ambalaj, acente: deger(h[sutun.acente]), liman: deger(h[sutun.liman]),
          ekipman: deger(h[sutun.ekipman]), bos_ekipman_tarihi: tarihOku(h[sutun.bos_ekipman_tarihi]), ardiyesiz_giris: tarihOku(h[sutun.ardiyesiz_giris]),
          talimat_cutoff: cutoff(talimatGun, typeof h[sutun.talimat_cutoff] === "number" ? saatOku(h[sutun.talimat_cutoff]) : null),
          beyan_cutoff: cutoff(beyanGun, typeof h[sutun.beyan_cutoff] === "number" ? saatOku(h[sutun.beyan_cutoff]) : null),
          etd: tarihOku(h[sutun.etd]), gemi: deger(h[sutun.gemi]), sefer: null, kalemler: [kalem],
        };
        for (const [alan, ad] of [["bos_ekipman_tarihi", "BOŞ EKİPMAN"], ["ardiyesiz_giris", "ARDİYESİZ GİRİŞ"], ["etd", "ETD"], ["talimat_cutoff", "TALİMAT CUT OFF"], ["beyan_cutoff", "BEYAN CUT OFF"]] as const) {
          if (!bosMu(h[sutun[alan]]) && !tarihOku(h[sutun[alan]])) uyarilar.push(`Satır ${no} (${bk}): ${ad} tarihi okunamadı ("${metin(h[sutun[alan]])}").`);
        }
        const k = bk.replace(/\s/g, "").toUpperCase();
        const onceki = bookingIndex.get(k);
        if (onceki) {
          // Ayni booking dosyada ikinci kez: ayni sevkiyatin ek kalemi sayilir
          onceki.kalemler.push(kalem);
          uyarilar.push(`${bk}: dosyada iki kez yazılmış (satır ${onceki.satir} ve ${no}); tek booking olarak birleştirildi, konteynerler toplandı.`);
          cur = onceki; curEk = 1; // saat / sefer onceki satirda zaten var; devam satiri yalniz bos alanlari doldurur
          continue;
        }
        bookingIndex.set(k, satir);
        sonuc.push(satir);
        cur = satir; curEk = 0;
        continue;
      }

      const doluMu = h.some((x) => !bosMu(x));
      if (!doluMu) continue;
      if (!cur) {
        // haftanin bos sablon satirlari vb: musteri / booking yoksa dikkate alinmaz
        if (!bosMu(h[sutun.musteri])) uyarilar.push(`Satır ${no}: booking no olmadan müşteri yazılmış ("${metin(h[sutun.musteri])}"); atlandı.`);
        continue;
      }
      curEk++;
      if (curEk > 3) { uyarilar.push(`Satır ${no}: ${cur.booking_no} altında beklenmeyen ek satır; atlandı.`); continue; }
      // Devam satiri: cut-off saatleri + sefer (+ varsa ikinci urun kalemi)
      const ts = saatOku(h[sutun.talimat_cutoff]);
      const bs = saatOku(h[sutun.beyan_cutoff]);
      if (ts && cur.talimat_cutoff && cur.talimat_cutoff.endsWith("T00:00:00+00:00")) cur.talimat_cutoff = cur.talimat_cutoff.replace("T00:00", `T${ts}`);
      if (bs && cur.beyan_cutoff && cur.beyan_cutoff.endsWith("T00:00:00+00:00")) cur.beyan_cutoff = cur.beyan_cutoff.replace("T00:00", `T${bs}`);
      const sefer = deger(h[sutun.gemi]);
      if (sefer && !cur.sefer) cur.sefer = sefer;
      const kalem: PlanKalemi = { cinsi: deger(h[sutun.cinsi]), konteyner: konteynerOku(h[sutun.konad]), cuval_markasi: deger(h[sutun.cuval_markasi]), ambalaj: deger(h[sutun.ambalaj]) };
      if (kalem.cinsi || kalem.konteyner !== null || kalem.cuval_markasi || kalem.ambalaj) cur.kalemler.push(kalem);
    }
    if (!sutun) uyarilar.push(`${sayfa.ad} sayfasında yükleme planı başlıkları bulunamadı.`);
    else okunan.push(`${sayfa.ad} (${sayfaSatir} booking)`);
  }

  for (const s of sonuc) {
    const sayilar = s.kalemler.map((k) => k.konteyner).filter((n): n is number => n !== null);
    s.konteyner = sayilar.length ? sayilar.reduce((t, n) => t + n, 0) : null;
    if (s.kalemler.length > 20) s.kalemler = s.kalemler.slice(0, 20);
    if (!s.hafta) uyarilar.push(`${s.booking_no}: hafta başlığının altında değil.`);
  }
  if (!sonuc.length) throw new Error("Dosyada booking numaralı yükleme satırı bulunamadı.");
  return { satirlar: sonuc, uyarilar, sayfalar: okunan };
}

// --------------------------------------------------------------------------- dosya okuma (tarayici)

/** .xlsx / .xlsm -> plan satirlari (yalniz yil adli sayfalar). */
export async function planExceliOku(dosya: File | Blob): Promise<PlanExcelSonucu> {
  return planSayfalariniCoz(await xlsxHamOku(dosya, { sayfa: (ad) => /^\d{4}$/.test(ad) }));
}

// --------------------------------------------------------------------------- onizleme (sistemle karsilastirma)

/** Sistemdeki sevkiyat_plani kaydi (karsilastirma icin gerekenler) */
export type PlanMevcut = Omit<PlanExcelSatiri, "satir" | "sira" | "yil" | "kalemler"> & {
  id: string; yil: number | null; sira: number | null; kalemler: PlanKalemi[] | null; rezervasyon_id: string | null;
};

export const ALAN_ADI: Record<string, string> = {
  hafta: "Hafta", hafta_baslik: "Hafta başlığı", musteri: "MÜŞTERİ", cinsi: "CİNSİ", konteyner: "KON.AD.", varis_limani: "VARIŞ LİMANI",
  cuval_markasi: "ÇUVAL MARKASI", ambalaj: "AMBALAJ", acente: "ACENTE", liman: "LİMAN", ekipman: "EKİPMAN",
  bos_ekipman_tarihi: "BOŞ EKİPMAN ALIM TARİHİ", ardiyesiz_giris: "ARDİYESİZ GİRİŞ", talimat_cutoff: "TALİMAT CUT OFF",
  beyan_cutoff: "BEYAN CUT OFF", etd: "ETD", gemi: "GEMİ ADI", sefer: "SEFERİ", kalemler: "Ürün kalemleri",
};
const KARSILASTIRILAN = ["hafta", "musteri", "cinsi", "konteyner", "varis_limani", "cuval_markasi", "ambalaj", "acente", "liman",
  "ekipman", "bos_ekipman_tarihi", "ardiyesiz_giris", "talimat_cutoff", "beyan_cutoff", "etd", "gemi", "sefer", "kalemler"] as const;

export type PlanDegisiklik = { alan: string; eski: string; yeni: string };
export type PlanOnizleme = {
  yeni: PlanExcelSatiri[];
  degisen: Array<{ satir: PlanExcelSatiri; degisiklikler: PlanDegisiklik[] }>;
  ayni: number;
  /** sira gibi gorunmeyen alanlar degisti (yine gonderilir) */
  gonderilecek: PlanExcelSatiri[];
  sistemdeDosyadaYok: number;
};

const bk = (s: string) => s.replace(/\s/g, "").toUpperCase();
export function gosterim(alan: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (alan === "kalemler" && Array.isArray(v)) return (v as PlanKalemi[]).map((k) => [k.konteyner ?? "", k.cinsi ?? "", k.cuval_markasi ?? "", k.ambalaj ?? ""].filter((x) => x !== "").join(" ")).join(" + ");
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}${m[4] && !(m[4] === "00" && m[5] === "00") ? ` ${m[4]}:${m[5]}` : ""}`;
  return s;
}
/** Karsilastirma bicimi: tarih/saat ilk 16 karakter (saat dilimi eki farki yok sayilir) */
function esit(alan: string, a: unknown, b: unknown): boolean {
  const n = (v: unknown) => {
    if (v === null || v === undefined || v === "") return "";
    if (alan === "kalemler") return JSON.stringify((v as PlanKalemi[]).map((k) => [k.cinsi ?? null, k.konteyner ?? null, k.cuval_markasi ?? null, k.ambalaj ?? null]));
    const s = String(v).trim();
    return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) ? s.slice(0, 16).replace(" ", "T") : s;
  };
  return n(a) === n(b);
}

/**
 * Excel satirlarini sistemdekilerle karsilastirir. Kural (yukleme_plani_aktar ile AYNI): Excel'de bos alan
 * sistemdeki degeri silmez -> bos Excel alani degisiklik sayilmaz.
 */
export function planOnizleme(excel: PlanExcelSatiri[], mevcut: PlanMevcut[]): PlanOnizleme {
  const harita = new Map(mevcut.map((m) => [bk(m.booking_no), m]));
  const sonuc: PlanOnizleme = { yeni: [], degisen: [], ayni: 0, gonderilecek: [], sistemdeDosyadaYok: 0 };
  const gorulen = new Set<string>();
  for (const s of excel) {
    const m = harita.get(bk(s.booking_no));
    gorulen.add(bk(s.booking_no));
    if (!m) { sonuc.yeni.push(s); sonuc.gonderilecek.push(s); continue; }
    const degisiklikler: PlanDegisiklik[] = [];
    for (const alan of KARSILASTIRILAN) {
      const yeni = (s as unknown as Record<string, unknown>)[alan];
      if (yeni === null || yeni === undefined || yeni === "") continue;
      // Tek kalemli satirda kalem bilgisi zaten CINSI / KON.AD. / MARKA / AMBALAJ sutunlarinda: ayrica gosterilmez
      if (alan === "kalemler" && (yeni as PlanKalemi[]).length < 2 && !((m.kalemler || []).length > 1)) continue;
      const eski = (m as unknown as Record<string, unknown>)[alan];
      if (!esit(alan, eski, yeni)) degisiklikler.push({ alan: ALAN_ADI[alan] || alan, eski: gosterim(alan, eski), yeni: gosterim(alan, yeni) });
    }
    if (degisiklikler.length) { sonuc.degisen.push({ satir: s, degisiklikler }); sonuc.gonderilecek.push(s); continue; }
    // Gorunmeyen alanlar (hafta basligi, sira, tek kalem kaydi) ya da rezervasyona henuz bagli degil: sessizce gonderilir
    const sessiz = s.sira !== m.sira || s.yil !== m.yil || !esit("hafta_baslik", m.hafta_baslik, s.hafta_baslik)
      || !esit("kalemler", m.kalemler, s.kalemler) || !m.rezervasyon_id;
    sonuc.ayni++;
    if (sessiz) sonuc.gonderilecek.push(s);
  }
  sonuc.sistemdeDosyadaYok = mevcut.filter((m) => !gorulen.has(bk(m.booking_no))).length;
  return sonuc;
}

/** RPC'ye gidecek satir (yalniz yazilan alanlar) */
export function aktarimSatiri(s: PlanExcelSatiri) {
  const { satir: _satir, ...geri } = s;
  void _satir;
  return geri;
}
