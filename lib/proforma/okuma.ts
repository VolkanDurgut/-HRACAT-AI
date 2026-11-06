/**
 * SISTEM PROFORMASINI YAPAY ZEKASIZ OKUMA (06.11.2026) - saf modul (React / Supabase / unpdf importu
 * yok; tsx ile test edilir).
 *
 * Kullanici: "Proforma okumayi ucretsiz okuma haline getiremiyor muyuz? Artik proformalar sistem
 * uzerinden olusturuluyor; olusturulan proformalar kolay okunamaz mi?"
 *
 * Proforma Olustur'un indirdigi PDF'in bilgisinde Title "Proforma <NO>" ve Creator "Ihracat AI" yazar;
 * 1. sayfada "PROFORMA NUM : <NO>". Bu proforma Kayitli Proformalar'da (`proformalar.taslak`) birebir
 * durur ve PDF her zaman o taslaktan cizilir. Bu yuzden alanlar PDF'TEN TAHMIN EDILMEZ: taslaktan,
 * PDF'i ceken AYNI fonksiyonlarla (belgeOlustur) uretilir, sonra PDF metniyle dogrulanir:
 * proforma no, alici unvani, toplam tutar ve her kalemin miktar / fiyat / tutari PDF'te AYNEN
 * yaziyor olmali. Biri tutmazsa (PDF indirildikten sonra taslak degistirilmis, baska surum vb.)
 * bu yol KULLANILMAZ; yapay zeka okumasi (proforma-oku) devam eder.
 *
 * Cikti, proforma-oku'nun (Gemini) dondurdugu nesneyle AYNI alan adlarini tasir; Proforma Yukle
 * akisinin geri kalani (liman dogrulama, ana siparis, dosya kaydi) hicbir sey fark etmez.
 */
import { belgeOlustur, genelSayiYaz, paraYaz, teslimSekliBul, type ProformaBelgesi, type ProformaTaslak } from "@/lib/proforma/belge";
import { SATICI, VARSAYILAN_ALT_BILGI, VARSAYILAN_OZEL_SARTLAR, VARSAYILAN_UST_BILGI } from "@/lib/proforma/sabitler";
import { bankaBul, SABIT_HESAP_ADI } from "@/lib/bankalar";
import { turkiyeLimaniMi } from "@/lib/varis-limani-kontrol";

/** Sistem tarafindan uretilen PDF mi (PDF bilgisindeki Creator). */
export function sistemUretimiMi(olusturan: string | null | undefined): boolean {
  return /^\s*[İI]hracat AI\s*$/i.test(String(olusturan || ""));
}

const NO_DESENI = /^[A-Z0-9][A-Z0-9\-/]{3,39}$/;

/** Proforma no: once PDF basligi ("Proforma UNEXTST061126"), yoksa metindeki "PROFORMA NUM : ...". */
export function sistemProformaNo(baslik: string | null | undefined, metin: string): string | null {
  const b = /^\s*Proforma\s+(\S+)\s*$/i.exec(String(baslik || ""));
  if (b && NO_DESENI.test(b[1].toUpperCase())) return b[1].toUpperCase();
  const m = /PROFORMA\s+NUM\s*:\s*([A-Z0-9][A-Z0-9\-/]{3,39})/i.exec(metin || "");
  return m ? m[1].toUpperCase() : null;
}

/** "CIF ASHDOD PORT BASIS" -> "ASHDOD PORT" (Incoterm ve "BASIS" atilir; "PORT"tan sonrasi ulke). */
export function teslimLimani(teslimIfadesi: string): string {
  return String(teslimIfadesi || "")
    .replace(/^\s*(CIF|CFR|FOB|CIP|CPT|FCA|EXW|DAP|DDP|FAS|C&F|CNF)\b/i, "")
    .replace(/\bBASIS\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    // "MARIEL PORT CUBA" -> "MARIEL PORT, CUBA" (dosyalardaki "LIMAN PORT, ULKE" bicimi)
    .replace(/^(.+?\sPORT)\s+(\S.*)$/i, "$1, $2");
}

/**
 * Liman yukleme limani olan teslim sekilleri (FOB AMBARLI PORT = yukleme). 06.11.2026: proformalarda
 * "FOB SANTIAGO DE CUBA BASIS" gibi varis limaniyla yazilmis FOB da var (IHR-2026-0111 denemesinde
 * yukleme limani "SANTIAGO DE CUBA" oldu). Bu yuzden liman YALNIZ Turkiye limaniysa yukleme sayilir;
 * degilse (teslim sekli ne olursa olsun) varis limanidir.
 */
const YUKLEMEDE_TESLIM = new Set(["FOB", "FCA", "EXW", "FAS"]);

function ambalajTuru(paketleme: string): string {
  const p = String(paketleme || "").toUpperCase();
  if (/BIG\s*BAG|JUMBO/.test(p)) return "BIG BAG";
  if (/\bPP\b/.test(p) && /KRAFT/.test(p)) return "PP + KRAFT BAG";
  if (/PP\s*BAG/.test(p)) return "PP BAG";
  if (/KRAFT/.test(p)) return "KRAFT BAG";
  if (/BAG/.test(p)) return "BAG";
  return "";
}

function ilgiliSatiri(ilgiliKisi: string, desen: RegExp): string {
  const m = desen.exec(ilgiliKisi || "");
  return m ? m[1].trim() : "";
}

/** Belgeden (PDF'e cizilen hali) proforma-oku ile ayni bicimde okuma sonucu. */
export function belgedenOkunan(b: ProformaBelgesi, taslak: ProformaTaslak): Record<string, unknown> {
  const teslim = teslimSekliBul(b.teslimIfadesi, taslak.teslimSekli);
  const liman = teslimLimani(b.teslimIfadesi);
  const yuklemede = YUKLEMEDE_TESLIM.has(teslim) && turkiyeLimaniMi(liman);
  const banka = bankaBul(b.banka);
  const hesap = banka ? (b.paraBirimi === "EUR" ? banka.eur : banka.usd) : null;
  const avans = /ADVANCE|DEPOSIT/i.test(b.ikinci.etiket) ? b.ikinci.tutar : 0;
  return {
    satici_firma: SATICI.unvan,
    alici_firma: b.alici.unvan,
    alici_tel: ilgiliSatiri(b.ilgiliKisi, /\b(?:Tel|Phone|Mobile|GSM)\s*#?\s*:?\s*([^\n]+)/i),
    alici_email: ilgiliSatiri(b.ilgiliKisi, /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i).toLowerCase(),
    alici_adresi: b.alici.adres.replace(/\s*\n\s*/g, " ").trim(),
    proforma_no: b.proformaNo,
    proforma_tarihi: taslak.tarih,
    gecerlilik_tarihi: (() => { const [g, a, y] = b.gecerlilik.split("."); return y && a && g ? `${y}-${a}-${g}` : ""; })(),
    lot_no: "",
    miktar: b.toplamMts,
    miktar_birimi: "MTS",
    ambalaj: ambalajTuru(b.paketleme),
    detayli_ambalaj: b.paketleme,
    toplam_tutar: b.toplam,
    para_birimi: b.paraBirimi,
    avans_tutari: avans,
    varis_limani: yuklemede ? "" : liman,
    yukleme_limani: yuklemede ? liman : "",
    teslim_sekli: teslim,
    sevkiyat_suresi: b.sevkiyat,
    odeme_sekli: b.odeme,
    "menşei": "Türkiye",
    marka: b.markaSatiri,
    hesap_adi: SABIT_HESAP_ADI,
    banka: banka?.banka || "",
    swift: banka?.swift || "",
    hesap_numarasi: hesap?.hesap_numarasi || "",
    iban: hesap?.iban || "",
    urun_detaylari: b.kalemler.map((k) => ({
      description: k.aciklama,
      packaging_size: k.ambalajKg > 0 ? `${genelSayiYaz(k.ambalajKg)} KG` : "",
      quantity: k.mts,
      unit_price: k.fiyat,
      total_amount: k.tutar,
    })),
    sevkiyat_evraklari: b.evraklar,
    // Denetim izi (ham_veri): bu kayit yapay zekayla degil, Kayitli Proformalar'dan okundu
    okuma_kaynagi: "sistem_proformasi",
  };
}

const sade = (s: string) => String(s || "").replace(/\s+/g, " ").trim().toUpperCase();

/**
 * PDF metninde olmasi gereken ifadeler (PDF'in cizdigi bicimde). Eksik olanlar doner; bos = PDF bu
 * taslaktan uretilmis. Yalniz kesin, kisa ve sayisal ifadeler (satir kirilmasi riski dusuk).
 */
export function pdfDogrula(b: ProformaBelgesi, metin: string): string[] {
  const m = sade(metin);
  const beklenen: string[] = [b.proformaNo, paraYaz(b.toplam)];
  // Unvanin ilk 3 kelimesi (uzun unvan PDF'te satir kirilabilir)
  const unvanBasi = b.alici.unvan.split(" ").slice(0, 3).join(" ");
  if (unvanBasi) beklenen.push(unvanBasi);
  for (const k of b.kalemler) beklenen.push(paraYaz(k.mts), paraYaz(k.fiyat), paraYaz(k.tutar));
  return Array.from(new Set(beklenen)).filter((x) => !m.includes(sade(x)));
}

/** Kayitli taslaktan PDF'in belgesi (sablon metinleri okumayi etkilemez; varsayilan yeter). */
export function taslaktanBelge(t: ProformaTaslak): ProformaBelgesi {
  return belgeOlustur(t, { ozelSartlar: VARSAYILAN_OZEL_SARTLAR, altBilgi: VARSAYILAN_ALT_BILGI, ustBilgi: { ...VARSAYILAN_UST_BILGI } });
}

export type SistemOkumaSonucu =
  | { tur: "okundu"; veri: Record<string, unknown> }
  | { tur: "sistem_disi" }
  | { tur: "kayit_yok"; proformaNo: string }
  | { tur: "uyusmuyor"; proformaNo: string; eksik: string[] };

/** PDF bilgisi + metni + (varsa) kayitli taslak -> okuma sonucu. Ag yok; cagiran kaydi getirir. */
export function sistemProformasiCoz(
  pdf: { baslik: string | null; olusturan: string | null; metin: string },
  kayitGetir: (proformaNo: string) => ProformaTaslak | null,
): SistemOkumaSonucu {
  const no = sistemProformaNo(pdf.baslik, pdf.metin);
  if (!no || !sistemUretimiMi(pdf.olusturan)) return { tur: "sistem_disi" };
  const taslak = kayitGetir(no);
  if (!taslak) return { tur: "kayit_yok", proformaNo: no };
  const belge = taslaktanBelge(taslak);
  const eksik = pdfDogrula(belge, pdf.metin);
  if (eksik.length) return { tur: "uyusmuyor", proformaNo: no, eksik };
  return { tur: "okundu", veri: belgedenOkunan(belge, taslak) };
}
