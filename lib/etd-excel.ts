/**
 * lib/etd-excel.ts — Harun Bey'in haftalik "ETD-ETA" Excel'ini (.xlsx / .xlsm) TARAYICIDA okur
 * (28.10.2026). Makrolar CALISTIRILMAZ, dosya sunucuya yuklenmez/saklanmaz; yalniz hucre
 * degerleri okunur (jszip + DOMParser). Amac: KONSIMENTO sutununu (odeme durumu) sistemdeki
 * rezervasyonlarla booking no (yoksa B/L) uzerinden eslestirip ONIZLEME uretmek; yazma
 * kullanici onayindan sonra odeme_konsimento_toplu() ile yapilir.
 *
 * Beklenen yapi (2023..2026 yil sayfalari): FIRMA ADI | KONTEYNER ADET | VARIS LIMANI | ACENTE |
 * BOOKING NO | B/L(KONSIMENTO) | ETD | ETA | GEMI ADI | YUKLENDI | KONSIMENTO | YUK EVRAKLARI | ...
 * Sutunlar BASLIK METNINDEN bulunur (sira degisse de calisir).
 */

import { excelKonsimentoDurumu, numaraAnahtari, odemeAlindiMi, type KonsimentoDurumu } from "@/lib/odeme-takibi";

export type ExcelSatiri = {
  sayfa: string;
  satir: number;
  firma: string;
  adet: number | null;
  booking: string;
  bl: string;
  etd: string; // gosterim (gg.aa.yyyy veya hucredeki metin)
  eta: string;
  durumHam: string;
  durum: KonsimentoDurumu | null;
};

export type ExcelOkumaSonucu = { satirlar: ExcelSatiri[]; sayfalar: string[]; uyarilar: string[] };

const ENBUYUK_BOYUT = 15 * 1024 * 1024;

function baslikAnahtari(s: string): string {
  return s
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ö/g, "O").replace(/Ç/g, "C")
    .replace(/[^A-Z0-9/]/g, "");
}

function sutunNo(ref: string): number {
  const harf = (ref.match(/^[A-Z]+/) || [""])[0];
  let n = 0;
  for (const c of harf) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Excel seri tarihi -> gg.aa.yyyy (1900 sistemi) */
export function seriTarih(n: number): string {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return String(n);
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

function elemanlar(kok: Document | Element, ad: string): Element[] {
  return Array.from(kok.getElementsByTagNameNS("*", ad));
}

function metinIcerik(el: Element): string {
  // <si><t>..</t></si> veya zengin metin <si><r><t>..</t></r>...</si> (fonetik <rPh> haric)
  return elemanlar(el, "t").filter((t) => !(t.parentElement && t.parentElement.localName === "rPh")).map((t) => t.textContent || "").join("");
}

type HucreDegeri = string | number | null;

export async function etdExceliOku(dosya: File | Blob): Promise<ExcelOkumaSonucu> {
  if (dosya.size > ENBUYUK_BOYUT) throw new Error("Dosya 15 MB'tan büyük.");
  const JSZip = (await import("jszip")).default;
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(await dosya.arrayBuffer());
  } catch {
    throw new Error("Dosya okunamadı. Lütfen .xlsx veya .xlsm Excel dosyası seçin.");
  }
  const oku = async (yol: string) => zip.file(yol)?.async("string") ?? null;
  const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");

  const wbMetin = await oku("xl/workbook.xml");
  const relMetin = await oku("xl/_rels/workbook.xml.rels");
  if (!wbMetin || !relMetin) throw new Error("Bu dosya bir Excel çalışma kitabı değil.");

  const rels = new Map<string, string>();
  for (const r of elemanlar(xml(relMetin), "Relationship")) {
    const hedef = (r.getAttribute("Target") || "").replace(/^\/?xl\//, "").replace(/^\//, "");
    rels.set(r.getAttribute("Id") || "", hedef);
  }

  const paylasilan: string[] = [];
  const ssMetin = await oku("xl/sharedStrings.xml");
  if (ssMetin) for (const si of elemanlar(xml(ssMetin), "si")) paylasilan.push(metinIcerik(si));

  // Yil sayfalari (2023, 2024 ...) eskiden yeniye: ayni booking sonraki sayfada varsa o gecerli
  const sayfalar = elemanlar(xml(wbMetin), "sheet")
    .map((s) => ({
      ad: (s.getAttribute("name") || "").trim(),
      rid: s.getAttribute("r:id") || s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || "",
    }))
    .filter((s) => /^\d{4}$/.test(s.ad))
    .sort((a, b) => a.ad.localeCompare(b.ad));
  if (sayfalar.length === 0) throw new Error("Dosyada yıl sayfası (ör. 2026) bulunamadı.");

  const satirlar: ExcelSatiri[] = [];
  const uyarilar: string[] = [];
  const okunanSayfalar: string[] = [];

  for (const sayfa of sayfalar) {
    const yol = rels.get(sayfa.rid);
    const shMetin = yol ? await oku(`xl/${yol}`) : null;
    if (!shMetin) { uyarilar.push(`${sayfa.ad} sayfası okunamadı.`); continue; }

    const tablo = new Map<number, HucreDegeri[]>();
    for (const row of elemanlar(xml(shMetin), "row")) {
      const no = Number(row.getAttribute("r"));
      const hucreler: HucreDegeri[] = [];
      for (const c of elemanlar(row, "c")) {
        const ref = c.getAttribute("r") || "";
        const t = c.getAttribute("t") || "n";
        const v = elemanlar(c, "v")[0]?.textContent ?? null;
        let deger: HucreDegeri = null;
        if (t === "s") deger = v !== null ? paylasilan[Number(v)] ?? null : null;
        else if (t === "inlineStr") deger = metinIcerik(c);
        else if (t === "str" || t === "e") deger = v;
        else if (t === "b") deger = v === "1" ? "TRUE" : "FALSE";
        else deger = v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
        hucreler[sutunNo(ref)] = deger;
      }
      tablo.set(no, hucreler);
    }

    // Baslik satiri: ilk 5 satirda "BOOKING" iceren
    let baslikNo = -1;
    let sutun: Record<string, number> = {};
    for (let r = 1; r <= 5 && baslikNo < 0; r++) {
      const h = tablo.get(r);
      if (!h) continue;
      const anahtarlar = h.map((x) => baslikAnahtari(String(x ?? "")));
      if (!anahtarlar.some((a) => a.startsWith("BOOKING"))) continue;
      baslikNo = r;
      sutun = {};
      anahtarlar.forEach((a, i) => {
        if (!a) return;
        if (a.startsWith("FIRMA") && sutun.firma === undefined) sutun.firma = i;
        else if (a.startsWith("KONTEYNER") && sutun.adet === undefined) sutun.adet = i;
        else if (a.startsWith("BOOKING")) sutun.booking = i;
        else if (a.startsWith("B/L") || a === "BL" || a.startsWith("BLKONSIMENTO")) sutun.bl = i;
        else if (a.startsWith("ETD")) sutun.etd = i;
        else if (a.startsWith("ETA")) sutun.eta = i;
        else if (a === "KONSIMENTO") sutun.konsimento = i;
      });
    }
    if (baslikNo < 0 || sutun.booking === undefined) {
      uyarilar.push(`${sayfa.ad} sayfasında "BOOKING NO" başlığı bulunamadı.`);
      continue;
    }
    // Eski yillarda (2023) KONSIMENTO sutunu yok: sayfa sessizce atlanir (odeme bilgisi yok)
    if (sutun.konsimento === undefined) continue;
    okunanSayfalar.push(sayfa.ad);

    const yazi = (v: HucreDegeri | undefined) => (v === null || v === undefined ? "" : typeof v === "number" ? (Number.isInteger(v) ? v.toFixed(0) : String(v)) : String(v).trim());
    const tarih = (v: HucreDegeri | undefined) => (typeof v === "number" ? seriTarih(v) : yazi(v));

    for (const [no, h] of Array.from(tablo.entries()).sort((a, b) => a[0] - b[0])) {
      if (no <= baslikNo) continue;
      const booking = yazi(h[sutun.booking]);
      const bl = sutun.bl !== undefined ? yazi(h[sutun.bl]) : "";
      if (!numaraAnahtari(booking) && !numaraAnahtari(bl)) continue;
      const durumHam = yazi(h[sutun.konsimento]);
      const adetHam = sutun.adet !== undefined ? h[sutun.adet] : null;
      satirlar.push({
        sayfa: sayfa.ad,
        satir: no,
        firma: sutun.firma !== undefined ? yazi(h[sutun.firma]) : "",
        adet: typeof adetHam === "number" ? adetHam : Number.isFinite(Number(adetHam)) && adetHam !== null && adetHam !== "" ? Number(adetHam) : null,
        booking,
        bl,
        etd: sutun.etd !== undefined ? tarih(h[sutun.etd]) : "",
        eta: sutun.eta !== undefined ? tarih(h[sutun.eta]) : "",
        durumHam,
        durum: excelKonsimentoDurumu(durumHam),
      });
    }
  }
  if (okunanSayfalar.length === 0) throw new Error(uyarilar[0] || "Excel'de okunabilir satır bulunamadı.");
  return { satirlar, sayfalar: okunanSayfalar, uyarilar };
}

// ---------------------------------------------------------------------------
// Sistemle eslestirme (saf fonksiyon - test edilebilir)
// ---------------------------------------------------------------------------
export type SistemSevkiyati = {
  rezervasyon_id: string;
  booking_no: string | null;
  bl_no: string | null;
  alici_firma: string | null;
  dosya_no: string;
  konsimento_durumu: string | null;
};

export type EslesmeDegisikligi = {
  rezervasyon_id: string;
  dosya_no: string;
  firma: string;
  booking: string;
  eski: string | null;
  yeni: KonsimentoDurumu;
  kaynak: string; // "2026 / 45"
  odemeDegisimi: "alindi" | "bekliyor" | null; // odeme durumunun degisip degismedigi
};

export type EslesmeSonucu = {
  degisecek: EslesmeDegisikligi[];
  ayni: number;
  excelBos: number;
  taninmayan: ExcelSatiri[];
  sistemdeYok: ExcelSatiri[];
  eslesen: number;
};

export function excelSistemleEslestir(excel: ExcelSatiri[], sistem: SistemSevkiyati[]): EslesmeSonucu {
  const bookingHarita = new Map<string, SistemSevkiyati>();
  const blHarita = new Map<string, SistemSevkiyati>();
  for (const s of sistem) {
    const b = numaraAnahtari(s.booking_no);
    if (b && !bookingHarita.has(b)) bookingHarita.set(b, s);
    const l = numaraAnahtari(s.bl_no);
    if (l && !blHarita.has(l)) blHarita.set(l, s);
  }

  // Ayni rezervasyona birden fazla Excel satiri: SONRAKI (yeni sayfa / alttaki satir) gecerli
  const son = new Map<string, { s: SistemSevkiyati; e: ExcelSatiri }>();
  const sistemdeYok: ExcelSatiri[] = [];
  for (const e of excel) {
    const s = bookingHarita.get(numaraAnahtari(e.booking)) || blHarita.get(numaraAnahtari(e.bl)) || blHarita.get(numaraAnahtari(e.booking));
    if (!s) { sistemdeYok.push(e); continue; }
    son.set(s.rezervasyon_id, { s, e });
  }

  const degisecek: EslesmeDegisikligi[] = [];
  const taninmayan: ExcelSatiri[] = [];
  let ayni = 0;
  let excelBos = 0;
  for (const { s, e } of Array.from(son.values())) {
    if (!e.durum) {
      if (e.durumHam) taninmayan.push(e); else excelBos++;
      continue; // Excel'de bos / taninmayan: sistemdeki deger KORUNUR
    }
    if (e.durum === s.konsimento_durumu) { ayni++; continue; }
    const once = odemeAlindiMi(s.konsimento_durumu);
    const sonra = odemeAlindiMi(e.durum);
    degisecek.push({
      rezervasyon_id: s.rezervasyon_id,
      dosya_no: s.dosya_no,
      firma: s.alici_firma || e.firma,
      booking: s.booking_no || e.booking,
      eski: s.konsimento_durumu,
      yeni: e.durum,
      kaynak: `${e.sayfa} / satır ${e.satir}`,
      odemeDegisimi: once === sonra ? null : sonra ? "alindi" : "bekliyor",
    });
  }
  return { degisecek, ayni, excelBos, taninmayan, sistemdeYok, eslesen: son.size };
}
