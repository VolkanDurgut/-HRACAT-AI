/**
 * lib/siparis/siparis-excel.ts — export'un SIPARIS LISTESI Excel'ini TARAYICIDA okur ve sistemdekiyle karsilastirir
 * (11.11.2026). Dosya sunucuya yuklenmez/saklanmaz.
 *
 * Excel yapisi (export'un dosyasi; basliklar BIREBIR):
 *   Proforma | Firma Adı | Ürün | Fiyat | Miktar | Tutar | Konteyner | Liman | BL NO | Marka | Paketleme
 *   - Ust bolum: sevk edilen satir YESIL boyali. Yesil + BL -> sevk_edildi; yesil, BL yok -> bl_eksik.
 *     Yesil degil ama BL (booking) yazili -> rezervasyonlu.
 *   - "ÖN ÖDEMESİ ALINMIŞ…" basligindan sonra -> on_odeme_alindi; "ÖN ÖDEMESİ (VEYA ONAYI) ALINMAMIŞ" -> onay_bekliyor
 *     (11.11.2026: "VEYA ONAYI" ekli baslik taninmiyordu, 11 siparis yanlislikla on odeme alindi oldu - duzeltildi).
 * 21.11.2026 (Harun Bey'in elle guncelledigi duzen): "47.HAFTA (15 KASIM - 21 KASIM)" hafta ara basliklari atlanir;
 *   "YÜKLEMESİ PLANLANACAK SİPARİŞLER" -> on_odeme_alindi bolumu, "PEŞİNAT BEKLENEN SİPARİŞLER" -> onay_bekliyor bolumu.
 *   Istege bagli "Ön Ödeme" sutunu (onay kutusu DOGRU/YANLIS): yesil olmayan, BL'siz satirda bolumden ONCE gelir
 *   (DOGRU -> on_odeme_alindi, YANLIS -> onay_bekliyor). "Release" sutunu sistemde yok, okunmaz.
 * 21.11.2026 (kullanici: "kalan odemeler belirtilmeli"): istege bagli "Bakiye" sutunu okunur: DOGRU -> bakiye alindi;
 *   YANLIS -> bekliyor; tutar ("$15.750,00") -> bekliyor + kalan tutar. Bos hucre sistemdeki degeri silmez.
 * Sutunlar BASLIK METNINDEN bulunur (sistemin "Excel indir" ciktisi da okunur; ek sutunlari yok sayilir).
 * Eslesme (sistemdeki siparis_defteri satirlari): proforma no (revize "R" eki yok sayilir) + BL; BL'si sonradan
 * eklenen / degisen satir ayni proformanin tek adayina baglanir. Hicbir kayit silinmez.
 */
import { baslikAnahtari, xlsxHamOku, type HamSayfa, type HucreDegeri } from "./xlsx-oku";

export type SiparisDurumu = "onay_bekliyor" | "on_odeme_alindi" | "rezervasyonlu" | "sevk_edildi" | "bl_eksik" | "iptal";

export type SiparisExcelSatiri = {
  sira: number;
  satir: number;              // Excel satir no
  proforma_no: string;
  proforma_tarihi: string | null;
  firma: string;
  urun: string | null;
  birim_fiyat: number | null;
  miktar_mt: number | null;
  tutar: number | null;
  konteyner: number | null;
  liman: string | null;
  bl_no: string | null;
  marka: string | null;
  paketleme: string | null;
  durum: SiparisDurumu;
  /** 21.11.2026 "Bakiye" sutunu (yoksa / bossa null) */
  bakiye_odendi: boolean | null;
  bakiye_tutar: number | null;
};

export type SiparisExcelSonucu = { satirlar: SiparisExcelSatiri[]; uyarilar: string[]; sayfa: string };

const BASLIKLAR: Array<[keyof SiparisExcelSatiri, string[], string]> = [
  ["proforma_no", ["PROFORMA"], "Proforma"],
  ["firma", ["FIRMAADI", "FIRMA"], "Firma Adı"],
  ["urun", ["URUN"], "Ürün"],
  ["birim_fiyat", ["FIYAT"], "Fiyat"],
  ["miktar_mt", ["MIKTAR"], "Miktar"],
  ["tutar", ["TUTAR"], "Tutar"],
  ["konteyner", ["KONTEYNER"], "Konteyner"],
  ["liman", ["LIMAN"], "Liman"],
  ["bl_no", ["BLNO"], "BL NO"],
  ["marka", ["MARKA"], "Marka"],
  ["paketleme", ["PAKETLEME"], "Paketleme"],
];

const metin = (v: HucreDegeri | undefined): string =>
  v === null || v === undefined ? "" : typeof v === "number" ? (Number.isInteger(v) ? v.toFixed(0) : String(v)) : String(v).replace(/\s+/g, " ").trim();
const deger = (v: HucreDegeri | undefined): string | null => {
  const s = metin(v);
  return s === "" || /^[.,\-_/\\]+$/.test(s) ? null : s;
};

/** "437" / "427.5" / "1.000" / "1.250,50" / 450 -> sayi */
export function sayiOku(v: HucreDegeri | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = metin(v).replace(/\s/g, "").replace(/[$€]|USD|EUR/gi, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = /,\d{3}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Proforma no'daki GGAAYY -> YYYY-MM-DD ("DEMOABC200126-X" -> 2026-01-20) */
export function proformaTarihi(no: string): string | null {
  const m = no.toUpperCase().match(/^[A-Z]+?(\d{2})(\d{2})(\d{2})(?!\d)/);
  if (!m) return null;
  const iso = `20${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** Sevk edildi rengi: yesil tonlari (00B050, 92D050, sistemin kendi yesili D1FAE5 ...) */
export function yesilMi(renk: string | null): boolean {
  if (!renk || !/^[0-9A-F]{6}$/i.test(renk)) return false;
  const r = parseInt(renk.slice(0, 2), 16), g = parseInt(renk.slice(2, 4), 16), b = parseInt(renk.slice(4, 6), 16);
  return g >= 0x80 && g - r >= 0x20 && g - b >= 0x20;
}

/** Saf cozumleyici (test edilebilir). */
export function siparisSayfasiniCoz(sayfalar: HamSayfa[]): SiparisExcelSonucu {
  const uyarilar: string[] = [];
  for (const sayfa of sayfalar) {
    let sutun: Record<string, number> | null = null;
    let blok: "ust" | "alindi" | "alinmamis" | "iptal" = "ust";
    const satirlar: SiparisExcelSatiri[] = [];
    let sira = 0;
    for (const [no, h, renk] of sayfa.satirlar) {
      const anahtarlar = h.map((x) => baslikAnahtari(metin(x)));
      if (!sutun) {
        if (anahtarlar.includes("PROFORMA") && anahtarlar.some((x) => x.startsWith("FIRMA"))) {
          const yeni: Record<string, number> = {};
          for (const [alan, onler] of BASLIKLAR) {
            const i = anahtarlar.findIndex((x) => onler.includes(x));
            if (i >= 0) yeni[alan] = i;
          }
          const eksik = BASLIKLAR.filter(([alan]) => yeni[alan] === undefined).map(([, , ad]) => ad);
          if (eksik.length) throw new Error(`"${sayfa.ad}" sayfası satır ${no}: başlık bulunamadı: ${eksik.join(", ")}. Başlıklar sipariş listesi ile aynı olmalı.`);
          const oo = anahtarlar.findIndex((x) => x === "ONODEME" || x === "ONODEMESI");
          if (oo >= 0) yeni.on_odeme = oo;
          const bk = anahtarlar.findIndex((x) => x === "BAKIYE");
          if (bk >= 0) yeni.bakiye = bk;
          sutun = yeni;
        }
        continue;
      }
      // Bolum basliklari (proforma no degil, "ON ODEME" gecen satir): "ÖN ÖDEMESİ VEYA ONAYI ALINMAMIŞ" / "ÖN ÖDEMESİ ALINMIŞ- ONAYLI …"
      const a = baslikAnahtari(metin(h[0]));
      if (/ONODEME/.test(a) && !/^[A-Z]{3,}\d{6}/.test(a)) {
        // Karar "ON ODEMESI"nin hemen ardindaki kelimeyle: "…ALINMIŞ- … REZERVASYON ALINMAMIŞ" ALINMIS bolumudur
        if (/ONODEMESI(VEYAONAYI)?(ALINMAMIS|ALINMADI)/.test(a)) { blok = "alinmamis"; continue; }
        if (/ONODEMESI(ALINMIS|ALINDI)/.test(a)) { blok = "alindi"; continue; }
      }
      // Sistemin kendi ciktisindaki "İPTAL EDİLEN SİPARİŞLER" bolumu aktarilmaz (iptal yalniz sistemde degisir)
      if (/^IPTALEDILEN/.test(a)) { blok = "iptal"; continue; }
      // 21.11.2026 elle guncellenen liste: bolum ve hafta ara basliklari (firma sutunu bos)
      if (!deger(h[sutun.firma])) {
        if (/^YUKLEMESIPLANLANACAK/.test(a)) { blok = "alindi"; continue; }
        if (/^(PESINAT|ONODEME)BEKLENEN/.test(a)) { blok = "alinmamis"; continue; }
        if (/^\d{1,2}HAFTA/.test(a)) continue;
      }
      if (blok === "iptal") continue;
      const proforma = deger(h[sutun.proforma_no]);
      const firma = deger(h[sutun.firma]);
      if (!proforma && !firma) continue;
      if (!proforma || proforma.replace(/[^A-Za-z0-9]/g, "").length < 3) { uyarilar.push(`Satır ${no}: proforma no yok (${firma}); atlandı.`); continue; }
      if (!firma) { uyarilar.push(`Satır ${no}: ${proforma} için firma adı yok; atlandı.`); continue; }
      const fiyat = sayiOku(h[sutun.birim_fiyat]);
      const miktar = sayiOku(h[sutun.miktar_mt]);
      let tutar = sayiOku(h[sutun.tutar]);
      if (tutar === null && fiyat !== null && miktar !== null) tutar = Math.round(fiyat * miktar * 100) / 100;
      const kont = sayiOku(h[sutun.konteyner]);
      const bl = deger(h[sutun.bl_no]);
      const yesil = yesilMi(renk);
      const onOdemeHam = sutun.on_odeme !== undefined ? metin(h[sutun.on_odeme]).toUpperCase() : "";
      const onOdeme = onOdemeHam === "TRUE" ? true : onOdemeHam === "FALSE" ? false : null;
      // Bakiye: DOGRU / YANLIS / tutar; baska metin (or. "-") bos sayilir
      const bakiyeHam = sutun.bakiye !== undefined ? h[sutun.bakiye] : null;
      const bakiyeMetin = metin(bakiyeHam).toUpperCase();
      const bakiyeSayi = bakiyeMetin === "TRUE" || bakiyeMetin === "FALSE" ? null : sayiOku(bakiyeHam);
      const bakiye_odendi = bakiyeMetin === "TRUE" ? true : bakiyeMetin === "FALSE" || (bakiyeSayi !== null && bakiyeSayi > 0) ? false : null;
      const bakiye_tutar = bakiye_odendi === false && bakiyeSayi !== null && bakiyeSayi > 0 ? Math.round(bakiyeSayi * 100) / 100 : null;
      const durum: SiparisDurumu = yesil ? (bl ? "sevk_edildi" : "bl_eksik")
        : bl ? "rezervasyonlu"
        : onOdeme !== null ? (onOdeme ? "on_odeme_alindi" : "onay_bekliyor")
        : blok === "alindi" ? "on_odeme_alindi" : "onay_bekliyor";
      for (const [ad, v, ham] of [["Fiyat", fiyat, h[sutun.birim_fiyat]], ["Miktar", miktar, h[sutun.miktar_mt]], ["Konteyner", kont, h[sutun.konteyner]]] as const) {
        if (v === null && deger(ham)) uyarilar.push(`Satır ${no} (${proforma}): ${ad} sayı değil ("${metin(ham)}").`);
        if (v !== null && v < 0) uyarilar.push(`Satır ${no} (${proforma}): ${ad} eksi değer.`);
      }
      satirlar.push({
        sira: ++sira, satir: no, proforma_no: proforma, proforma_tarihi: proformaTarihi(proforma), firma: firma.slice(0, 200),
        urun: deger(h[sutun.urun]), birim_fiyat: fiyat !== null && fiyat >= 0 ? fiyat : null, miktar_mt: miktar !== null && miktar >= 0 ? miktar : null,
        tutar: tutar !== null && tutar >= 0 ? tutar : null, konteyner: kont !== null && kont >= 0 && kont <= 1000 ? Math.round(kont) : null,
        liman: deger(h[sutun.liman]), bl_no: bl, marka: deger(h[sutun.marka]), paketleme: deger(h[sutun.paketleme]), durum,
        bakiye_odendi, bakiye_tutar,
      });
    }
    if (sutun) {
      if (!satirlar.length) throw new Error(`"${sayfa.ad}" sayfasında sipariş satırı bulunamadı.`);
      return { satirlar, uyarilar, sayfa: sayfa.ad };
    }
  }
  throw new Error("Dosyada sipariş listesi başlıkları (Proforma, Firma Adı, … BL NO, Marka, Paketleme) bulunamadı.");
}

export async function siparisExceliOku(dosya: File | Blob): Promise<SiparisExcelSonucu> {
  return siparisSayfasiniCoz(await xlsxHamOku(dosya, { sayfa: () => true, sutun: 30, renk: true, mantiksal: true }));
}

// --------------------------------------------------------------------------- onizleme

export type SiparisMevcut = {
  id: string; sira: number | null; proforma_no: string; proforma_tarihi: string | null; firma: string; urun: string | null;
  birim_fiyat: number | null; miktar_mt: number | null; tutar: number | null; konteyner: number | null; liman: string | null;
  bl_no: string | null; marka: string | null; paketleme: string | null; durum: SiparisDurumu;
  /** 21.11.2026 Excel "Bakiye" (migration 20261121080000) */
  bakiye_odendi?: boolean | null; bakiye_tutar?: number | null;
};

/** Eslesme anahtari: bosluksuz, buyuk harf, sondaki revize eki yok (…051126R, …-1R) */
export const proformaAnahtar = (s: string) => s.replace(/\s/g, "").toUpperCase().replace(/(\d)R\d?$/, "$1");
const blAnahtar = (s: string | null) => (s || "").replace(/\s/g, "").toUpperCase();

export const SIPARIS_ALAN_ADI: Record<string, string> = {
  proforma_no: "Proforma", firma: "Firma Adı", urun: "Ürün", birim_fiyat: "Fiyat", miktar_mt: "Miktar", tutar: "Tutar",
  konteyner: "Konteyner", liman: "Liman", bl_no: "BL NO", marka: "Marka", paketleme: "Paketleme", durum: "Durum",
  bakiye_odendi: "Bakiye", bakiye_tutar: "Kalan bakiye",
};
const KARSILASTIRILAN = ["proforma_no", "firma", "urun", "birim_fiyat", "miktar_mt", "tutar", "konteyner", "liman", "bl_no", "marka", "paketleme", "durum",
  "bakiye_odendi", "bakiye_tutar"] as const;
export const DURUM_ETIKETI: Record<SiparisDurumu, string> = {
  onay_bekliyor: "Onay bekliyor", on_odeme_alindi: "Ön ödeme alındı", rezervasyonlu: "Rezervasyonlu",
  sevk_edildi: "Sevk edildi", bl_eksik: "BL eksik", iptal: "İptal",
};

export type SiparisDegisiklik = { alan: string; eski: string; yeni: string };
export type SiparisAktarimSatiri = Omit<SiparisExcelSatiri, "satir"> & { id: string | null };
export type SiparisOnizleme = {
  yeni: SiparisExcelSatiri[];
  degisen: Array<{ satir: SiparisExcelSatiri; degisiklikler: SiparisDegisiklik[] }>;
  ayni: number;
  gonderilecek: SiparisAktarimSatiri[];
  dosyadaYok: SiparisMevcut[];
  /** 21.11.2026 sistem esas: sistemde PROFORMA olarak var (Excel satiri olarak eklenmez, sistem satiri gorunur kalir) */
  sistemde: SiparisExcelSatiri[];
  /** 21.11.2026 sistem esas: dosyasi olan satirda Excel'in BL'si dosyanin booking'iyle celisiyor -> BL degistirilmez */
  blKorunan: Array<{ satir: SiparisExcelSatiri; dosya_no: string; sistem: string; excel: string }>;
};

/** Onizlemeye sistemden ek bilgi (21.11.2026 "sistem esastır"). */
export type SiparisSistemBilgisi = {
  /** Sistemde kayitli proforma numaralari (Proforma Oluştur) */
  proformalar?: string[];
  /** siparis_defteri id -> bagli dosyanin numarasi ve booking'i */
  dosyalar?: Map<string, { dosya_no: string; booking: string | null }>;
};

const goster = (alan: string, v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (alan === "durum") return DURUM_ETIKETI[v as SiparisDurumu] ?? String(v);
  if (alan === "bakiye_odendi") return v === true ? "Alındı" : "Bekliyor";
  if (typeof v === "number") return v.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  return String(v);
};
const esit = (a: unknown, b: unknown) => {
  if (typeof a === "number" || typeof b === "number") return a !== null && b !== null && Math.abs(Number(a) - Number(b)) < 0.005;
  return String(a ?? "").replace(/\s+/g, " ").trim() === String(b ?? "").replace(/\s+/g, " ").trim();
};

/**
 * Eslestirme + fark. Kural (siparis_listesi_aktar ile AYNI): Excel'de bos alan sistemdeki degeri silmez;
 * "iptal" durumundaki kayit Excel'le degismez.
 */
export function siparisOnizleme(excel: SiparisExcelSatiri[], mevcut: SiparisMevcut[], sistem: SiparisSistemBilgisi = {}): SiparisOnizleme {
  const kullanilan = new Set<string>();
  const eslesme = new Map<SiparisExcelSatiri, SiparisMevcut>();
  const adaylar = (s: SiparisExcelSatiri) => mevcut.filter((m) => !kullanilan.has(m.id) && proformaAnahtar(m.proforma_no) === proformaAnahtar(s.proforma_no));
  const bagla = (s: SiparisExcelSatiri, m: SiparisMevcut | undefined) => { if (m) { eslesme.set(s, m); kullanilan.add(m.id); } };
  // 1) proforma + ayni BL   2) proforma + ikisinde de BL yok   3) proforma: miktar/konteyner ayni   4) proforma: Excel sirasina en yakin
  for (const s of excel) if (s.bl_no) bagla(s, adaylar(s).find((m) => blAnahtar(m.bl_no) === blAnahtar(s.bl_no)));
  for (const s of excel) if (!eslesme.has(s) && !s.bl_no) bagla(s, adaylar(s).find((m) => !m.bl_no && esit(m.miktar_mt, s.miktar_mt)) ?? adaylar(s).find((m) => !m.bl_no));
  for (const s of excel) if (!eslesme.has(s)) bagla(s, adaylar(s).find((m) => esit(m.miktar_mt, s.miktar_mt) && esit(m.konteyner, s.konteyner)));
  for (const s of excel) if (!eslesme.has(s)) {
    const a = adaylar(s).sort((x, y) => Math.abs((x.sira ?? 0) - s.sira) - Math.abs((y.sira ?? 0) - s.sira));
    bagla(s, a[0]);
  }

  const sonuc: SiparisOnizleme = { yeni: [], degisen: [], ayni: 0, gonderilecek: [], dosyadaYok: [], sistemde: [], blKorunan: [] };
  const defterAnahtarlari = new Set(mevcut.map((m) => proformaAnahtar(m.proforma_no)));
  const sistemProformalari = new Set((sistem.proformalar || []).map(proformaAnahtar));
  for (const s of excel) {
    const { satir: _satir, ...gonder } = s;
    void _satir;
    const m = eslesme.get(s);
    if (!m) {
      // Sistem proformasi (defterde satiri yok): Excel kopyasi eklenmez; sistem satiri zaten listede
      const pk = proformaAnahtar(s.proforma_no);
      if (sistemProformalari.has(pk) && !defterAnahtarlari.has(pk)) { sonuc.sistemde.push(s); continue; }
      sonuc.yeni.push(s); sonuc.gonderilecek.push({ ...gonder, id: null }); continue;
    }
    const degisiklikler: SiparisDegisiklik[] = [];
    const dosya = sistem.dosyalar?.get(m.id);
    for (const alan of KARSILASTIRILAN) {
      const yeni = s[alan];
      if (yeni === null || yeni === undefined || yeni === "") continue;
      if (alan === "durum" && m.durum === "iptal") continue;
      // Yalniz revize eki farkli (…-1 / …-1R): proforma no degismez; on odeme kaydi ve dagitimi mevcut anahtarda
      if (alan === "proforma_no" && proformaAnahtar(String(yeni)) === proformaAnahtar(m.proforma_no)) { gonder.proforma_no = m.proforma_no; continue; }
      // Dosyasi olan satirda BL = dosyanin booking'i (sistem esas); Excel farkli diyorsa degistirilmez
      if (alan === "bl_no" && dosya?.booking && blAnahtar(dosya.booking) !== blAnahtar(String(yeni))) {
        if (blAnahtar(m.bl_no) !== blAnahtar(String(yeni))) sonuc.blKorunan.push({ satir: s, dosya_no: dosya.dosya_no, sistem: dosya.booking, excel: String(yeni) });
        gonder.bl_no = null;
        continue;
      }
      const eski = m[alan as keyof SiparisMevcut];
      if (!esit(eski, yeni)) degisiklikler.push({ alan: SIPARIS_ALAN_ADI[alan], eski: goster(alan, eski), yeni: goster(alan, yeni) });
    }
    if (degisiklikler.length) { sonuc.degisen.push({ satir: s, degisiklikler }); sonuc.gonderilecek.push({ ...gonder, id: m.id }); }
    else {
      sonuc.ayni++;
      // gorunmeyen alanlar (sira, proforma tarihi) degistiyse sessizce gonderilir
      if (m.sira !== s.sira || (s.proforma_tarihi && m.proforma_tarihi !== s.proforma_tarihi)) sonuc.gonderilecek.push({ ...gonder, id: m.id });
    }
  }
  sonuc.dosyadaYok = mevcut.filter((m) => !kullanilan.has(m.id));
  return sonuc;
}
