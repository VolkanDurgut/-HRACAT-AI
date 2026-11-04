/**
 * Burak Bey'in DIIB Excel'i -> DIIB belgeleri + ihracat satirlari (04.11.2026). Saf modul.
 * Bicim: her DIIB bir sayfa ("2026 D1-04219"); "İHRACAT" bolumunde baslik satiri
 * FATURA NO | BEYANNAME NO | FT TARİHİ | CARI UNVANI | STOK ADI | MİKTAR | BİRİM FIYAT | TUTARI,
 * altinda "GERÇEKLEŞEN İHRACAT" ozeti; "İTHALAT" bolumunde "ÖNGÖRÜLEN İTHALAT" = ithalat izni (kg).
 * "GENEL TABLO" sayfasinda "04.03.2026-2026/D1-01152" gibi tarih + belge no.
 * ITHALAT satirlari OKUNMAZ (kullanici: "Ithalat kismini dikkate alma").
 * Excel'deki "ÖNGÖRÜLEN İHRACAT" bazi sayfalarda kendi kendine baglanan formul (01152:
 * gerceklesene esit) oldugu icin taahhut her zaman izin x 0,97 x 0,74 ile hesaplanir.
 */
import { excelTarihi, type XlsxSayfasi } from "@/lib/xlsx-oku";
import { DIIB_ORAN, diibAnahtari, faturaNorm } from "@/lib/diib/hesap";
import { sayiOku } from "@/lib/sayi-oku";

export type ExcelDiibSatiri = {
  fatura_no: string | null;
  beyanname_no: string | null;
  fatura_tarihi: string | null;
  cari: string;
  stok_adi: string;
  miktar_kg: number;
  birim_fiyat: number | null;
  tutar: number;
  excelSatir: number;   // 1 tabanli satir no (kullaniciya gosterilir)
  aciklama: string | null;
};

export type ExcelDiib = {
  sayfa: string;
  anahtar: string;           // "2026-04219"
  belge_no: string;          // "2026/D1-04219" (sayfa adindan; ekranda duzeltilebilir)
  belge_tarihi: string | null;
  ithalat_izin_kg: number | null;
  ihracat_taahhut_kg: number | null;
  satirlar: ExcelDiibSatiri[];
  uyarilar: string[];
};

const metin = (v: unknown) => (v === null || v === undefined ? "" : String(v)).replace(/\s+/g, " ").trim();
const ust = (v: unknown) => metin(v).toLocaleUpperCase("tr-TR");
const yuvarla = (n: number, b = 2) => { const k = 10 ** b; return Math.round((n + Number.EPSILON) * k) / k; };
const sayi = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = metin(v);
  if (!t) return null;
  const n = sayiOku(t);
  return n || /^0([.,]0+)?$/.test(t) ? n : null;
};

/** "2026 D1-04219" / "2026/D2-04219" -> { anahtar, belge_no } */
function sayfaKimligi(ad: string): { anahtar: string; belge_no: string } | null {
  const m = /(20\d{2})\s*[/\- ]?\s*D\s*(\d)\s*[/\- ]?\s*(\d{4,6})/i.exec(ad);
  if (!m) return null;
  const sira = m[3].slice(-5).padStart(5, "0");
  return { anahtar: `${m[1]}-${sira}`, belge_no: `${m[1]}/D${m[2]}-${sira}` };
}

export function diibExcelCoz(sayfalar: XlsxSayfasi[], enAzYil = 2026): ExcelDiib[] {
  // GENEL TABLO: belge tarihleri
  const tarihler = new Map<string, string>();
  const genel = sayfalar.find((s) => /GENEL/i.test(s.ad));
  for (const r of genel?.izgara || []) {
    for (const h of r) {
      const t = metin(h);
      const a = diibAnahtari(t);
      const tarih = excelTarihi(t);
      if (a && tarih) tarihler.set(a, tarih);
    }
  }

  const sonuc: ExcelDiib[] = [];
  for (const s of sayfalar) {
    const kim = sayfaKimligi(s.ad);
    if (!kim || Number(kim.anahtar.slice(0, 4)) < enAzYil) continue;
    const iz = s.izgara;
    const uyarilar: string[] = [];
    // Ihracat baslik satiri: A sutununda "FATURA NO"
    const baslik = iz.findIndex((r) => /FATURA\s*NO/.test(ust(r?.[0])));
    // Ihracat bolumunun sonu: "GERÇEKLEŞEN İHRACAT" ya da "İTHALAT" bolumu
    let son = iz.findIndex((r, i) => i > baslik && (r || []).some((h) => /GERÇEKLEŞEN\s+İHRACAT/.test(ust(h))));
    const ithalatBas = iz.findIndex((r, i) => i > baslik && /^İTHALAT/.test(ust(r?.[0])));
    if (son < 0) son = ithalatBas >= 0 ? ithalatBas : iz.length;
    const satirlar: ExcelDiibSatiri[] = [];
    if (baslik < 0) uyarilar.push("İhracat başlık satırı (FATURA NO) bulunamadı.");
    for (let i = baslik + 1; baslik >= 0 && i < son; i++) {
      const r = iz[i] || [];
      const miktar = sayi(r[5]);
      const cari = metin(r[3]);
      if (!miktar || miktar <= 0) continue;
      if (!cari && !metin(r[0])) continue;
      const birim = sayi(r[6]);
      let tutar = sayi(r[7]);
      if (tutar === null && birim !== null) tutar = yuvarla(birim * miktar);
      const satir: ExcelDiibSatiri = {
        fatura_no: metin(r[0]) || null,
        beyanname_no: metin(r[1]) || null,
        fatura_tarihi: excelTarihi(r[2]),
        cari: cari || "-",
        stok_adi: metin(r[4]) || "BUĞDAY UNU",
        miktar_kg: yuvarla(miktar),
        birim_fiyat: birim,
        tutar: yuvarla(tutar ?? 0),
        excelSatir: i + 1,
        aciklama: null,
      };
      if (!satir.fatura_no) uyarilar.push(`Satır ${i + 1} (${satir.cari}, ${satir.miktar_kg.toLocaleString("tr-TR")} kg): fatura no yok — sistemdeki bir faturayla aynı yükleme olabilir.`);
      satirlar.push(satir);
    }
    // Ayni fatura no iki kez: birebir ayni satirsa tekrar (alinmaz); beyanname / cari / miktar
    // farkliysa AYRI yukleme, fatura no yanlis yazilmis -> fatura no bos + aciklama ile alinir.
    const goruldu = new Map<string, ExcelDiibSatiri>();
    for (const x of satirlar) {
      const f = faturaNorm(x.fatura_no);
      if (!f) continue;
      const ilk = goruldu.get(f);
      if (!ilk) { goruldu.set(f, x); continue; }
      if (ayniYukleme(ilk, x)) uyarilar.push(`${x.fatura_no} satır ${ilk.excelSatir} ve ${x.excelSatir}'de birebir aynı yazılmış; tekrarı alınmayacak.`);
      else {
        uyarilar.push(`${x.fatura_no} iki farklı yüklemede kullanılmış (satır ${ilk.excelSatir}: ${ilk.cari}, satır ${x.excelSatir}: ${x.cari}). Satır ${x.excelSatir} fatura no'suz alınacak; doğru numarayı ekranda girin.`);
        x.aciklama = `Excel satır ${x.excelSatir}: fatura no "${x.fatura_no}" satır ${ilk.excelSatir} ile aynı yazılmıştı (beyanname ${x.beyanname_no || "-"}). Doğru fatura no girilmeli.`;
        x.fatura_no = null;
      }
    }
    // Ithalat izni: "ÖNGÖRÜLEN İTHALAT" satirinin F sutunu
    let izin: number | null = null;
    for (let i = Math.max(0, ithalatBas); i < iz.length; i++) {
      const r = iz[i] || [];
      if (r.some((h) => /ÖNGÖRÜLEN\s+İTHALAT/.test(ust(h)))) { izin = sayi(r[5]); break; }
    }
    if (!izin || izin <= 0) { uyarilar.push("İthalat izin miktarı (ÖNGÖRÜLEN İTHALAT) okunamadı; elle girin."); izin = null; }
    sonuc.push({
      sayfa: s.ad, anahtar: kim.anahtar, belge_no: kim.belge_no, belge_tarihi: tarihler.get(kim.anahtar) ?? null,
      ithalat_izin_kg: izin, ihracat_taahhut_kg: izin ? yuvarla(izin * DIIB_ORAN) : null, satirlar, uyarilar,
    });
  }
  return sonuc.sort((a, b) => (a.belge_tarihi || a.anahtar).localeCompare(b.belge_tarihi || b.anahtar));
}

const ayniYukleme = (a: ExcelDiibSatiri, b: ExcelDiibSatiri) =>
  faturaNorm(a.beyanname_no) === faturaNorm(b.beyanname_no) && a.cari === b.cari && a.miktar_kg === b.miktar_kg && a.tutar === b.tutar;

/** Ayni fatura no'lu BIREBIR tekrarlar cikarilmis satirlar (ilk gorunen kalir). */
export function tekrarsizSatirlar(d: ExcelDiib): ExcelDiibSatiri[] {
  const g = new Set<string>();
  return d.satirlar.filter((x) => {
    const f = faturaNorm(x.fatura_no);
    if (!f) return true;
    if (g.has(f)) return false;
    g.add(f);
    return true;
  });
}
