import { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { formatDateTR } from "@/lib/cutoff-utils";
import { IMZA_HARUN, LOGO_UNEX } from "@/lib/imzalar";

/** HTML ozel karakterlerini kacisliyor (XSS / goruntu bozulmasi onlemi). */
function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Bos/null/undefined deger icin guvenli fallback, literal "\n" karakterlerini gercek satir sonuna cevirir. */
function safe(value: string | number | null | undefined, fallback = "-"): string {
  if (value === null || value === undefined || value === "") return escapeHtml(fallback);
  const normalized = String(value).replace(/\\n/g, "\n");
  return escapeHtml(normalized);
}

/** Unex Gida'nin sabit iletisim bilgileri - her belgede ayni, proformadan okunmaz. */
const SATICI_SABIT_ADRES = "İstiklal Mahallesi Cemal Ünlüsaraç Caddesi\nNo:20, P.O.Box:59200, Süleymanpaşa\nTekirdağ, Türkiye";
const SATICI_SABIT_TEL = "0546 468 79 60";
const SATICI_SABIT_EMAIL = "export@unex.com.tr";

const PACKING_LIST_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Packing List __INVOICE_NO__</title>
<style>
  @page { size: A4; margin: 10mm 10mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #1a1a1a;
    font-size: 10.5px;
    line-height: 1.4;
    margin: 0;
    background: #E5E7EB;
    min-height: 100vh;
    padding: 24px 0;
  }
  .sheet {
    max-width: 800px;
    width: 800px;
    min-height: 1000px;
    margin: 0 auto;
    background: #FFFFFF;
    padding: 28px 32px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.15);
    display: flex;
    flex-direction: column;
  }

  /* HEADER: iki BAGIMSIZ flex kolonu. Sol kolon (baslik+meta+Buyer/Address/Consignee)
     ve sag kolon (logo+firma) kendi icerigine gore dogal yukseklikte akar -
     biri uzun biri kisa olsa da birbirini ITMEZ, cunku ikisi de ayni .header
     flex container'inin esit seviyedeki cocuklaridir.
     Negatif margin KULLANILMAZ - icerik miktarina bagli olarak kirilgan olur. */
  .header { display: flex; justify-content: flex-start; align-items: flex-start; margin-bottom: 14px; }
  .header-left { flex: 1; }
  .invoice-title { display: inline-block; background: #ECECEC; font-weight: bold; font-size: 16px; padding: 6px 16px; margin-bottom: 14px; }
  .meta-row { display: flex; margin-bottom: 2px; }
  .meta-label { width: 90px; font-weight: bold; }
  .meta-value { flex: 1; }
  .header-right { text-align: center; min-width: 260px; max-width: 420px; margin-right: 20px; }
  .logo-slot img { max-width: 200px; max-height: 100px; object-fit: contain; }
  .logo-slot { margin-bottom: 8px; text-align: center; }
  .buyer-box { text-align: center; }
  .buyer-box .name { font-weight: bold; }
  .buyer-box div { white-space: pre-line; }

  .parties-block { margin-top: 12px; margin-bottom: 14px; }
  .party-row { margin-bottom: 8px; }
  .party-label { font-weight: bold; margin-bottom: 2px; }
  .party-value { white-space: pre-line; }
  .kv-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  .kv-table tr:nth-child(even) { background: #F7F7F7; }
  .kv-table td { padding: 5px 10px; border: 1px solid #DADADA; vertical-align: top; }
  .kv-table td.k { background: #ECECEC; font-weight: bold; width: 180px; }
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  .items-table th { background: #ECECEC; font-weight: bold; text-align: center; padding: 6px 8px; border: 1px solid #DADADA; font-size: 9.5px; }
  .items-table td { padding: 6px 8px; border: 1px solid #DADADA; }
  .items-table td.num { text-align: right; }
  .items-table tr.total-row td { background: #ECECEC; font-weight: bold; }
  .signature-block { display: flex; justify-content: flex-start; margin: 24px 0 14px 0; margin-top: auto; }
  .stamp-slot img { max-width: 200px; max-height: 160px; object-fit: contain; }
  .footer-note { text-align: center; font-size: 8.5px; font-weight: bold; line-height: 1.5; border-top: 1px solid #DADADA; padding-top: 8px; margin-top: 10px; }
  .print-hint { background: #FEF3C7; border: 1px solid #FDE68A; color: #92400E; padding: 10px 14px; font-size: 11px; margin-bottom: 16px; border-radius: 6px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #FFFFFF; padding: 0; }
    .sheet { box-shadow: none; padding: 0; width: auto; }
    .print-hint { display: none; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="print-hint">
      <strong>Yazdirmadan once:</strong> Tarayicinin yazdirma penceresinde "Headers and footers" (Ust/alt bilgi) secenegini KAPALI yapin, aksi halde ciktiya tarih/URL satiri eklenir. "Background graphics" (Arka plan grafikleri) acik olmali ki gri kutular gorunsun.
    </div>

    <div class="header">
      <div class="header-left">
        <div class="invoice-title">Packing List</div>
        <div class="meta-row"><div class="meta-label">Invoice No :</div><div class="meta-value">__INVOICE_NO__</div></div>
        <div class="meta-row"><div class="meta-label">Invoice Date :</div><div class="meta-value">__INVOICE_DATE__</div></div>

        <div class="parties-block">
          <div class="party-row"><div class="party-label">Buyer :</div><div class="party-value">__ALICI_FIRMA__</div></div>
          <div class="party-row"><div class="party-label">Buyer's Address :</div><div class="party-value">__ALICI_ADRES__</div></div>
          <div class="party-row"><div class="party-label">Consignee :</div><div class="party-value">__CONSIGNEE__</div></div>
        </div>
      </div>
      <div class="header-right">
        <div class="logo-slot">
          <img src="__LOGO__" alt="Company Logo" onerror="this.style.display='none'">
        </div>
        <div class="buyer-box">
          <div class="name">__SATICI_FIRMA__</div>
          <div>__SATICI_ADRES__</div>
          <div>__SATICI_TEL__ | __SATICI_EMAIL__</div>
        </div>
      </div>
    </div>

    <table class="kv-table">
      <tr><td class="k">PACKAGING</td><td>__DETAYLI_AMBALAJ__</td></tr>
      <tr><td class="k">LOT NUMBER</td><td>__LOT_NO__</td></tr>
      <tr><td class="k">PRODUCTION DATE</td><td>__URETIM_TARIHI__</td></tr>
      <tr><td class="k">EXPIRY DATE</td><td>__SON_KULLANIM_TARIHI__</td></tr>
      <tr><td class="k">ORIGIN OF GOODS</td><td><strong>TURKISH</strong></td></tr>
      <tr><td class="k">PORT OF LOADING</td><td>__YUKLEME_LIMANI__</td></tr>
      <tr><td class="k">PORT OF DISCHARGE</td><td>__VARIS_LIMANI__</td></tr>
      <tr><td class="k">VESSEL NAME / VOYAGE NO</td><td>__VESSEL_VOYAGE__</td></tr>
    </table>

    <table class="items-table">
      <thead>
        <tr>
          <th>SERIES</th>
          <th style="text-align:left;">DESCRIPTION OF GOODS</th>
          <th>BRAND</th>
          <th>CONTAINER NO</th>
          <th>SEAL NO</th>
          <th>PIECES</th>
          <th>NETT</th>
          <th>GROSS</th>
        </tr>
      </thead>
      <tbody>
        __KONTEYNER_SATIRLARI__
      </tbody>
    </table>

    <div class="signature-block">
      <div class="stamp-slot">
        <img src="__IMZA_HARUN__" alt="Signature" onerror="this.style.display='none'">
      </div>
    </div>

    <div class="footer-note">
      ALL BANK CHARGES IN ALL TRANSACTIONS ARE ON SENDER'S ACCOUNT AND MUST BE STATED AS BANK CHARGES:OUR<br>
      QUALITY, QUANTITY AND CONDITION OF THE CARGO IS FINAL AT LOADING PORT<br>
      THE GOODS ARE OF TURKISH ORIGIN
    </div>
  </div>
</body>
</html>`;

function buildKonteynerSatirlari(dosya: Dosya, konteynerler: Konteyner[]): { rows: string; totalPieces: number; totalNett: number; totalGross: number } {
  const urunAdi = safe(dosya.urun_tanimi, "-");
  const marka = safe(dosya.marka, "-");

  let totalPieces = 0;
  let totalNett = 0;
  let totalGross = 0;

  if (!konteynerler || konteynerler.length === 0) {
    return {
      rows: `<tr><td colspan="8" style="text-align:center; color:#999;">Konteyner bilgisi bulunmuyor</td></tr>`,
      totalPieces: 0,
      totalNett: 0,
      totalGross: 0,
    };
  }

  const rows = konteynerler
    .map((k, idx) => {
      const pieces = (k as any).pieces || 0;
      const nett = k.net_agirlik_kg || 0;
      const gross = (k as any).brut_agirlik_kg || 0;
      totalPieces += pieces;
      totalNett += nett;
      totalGross += gross;
      return `<tr>
        <td style="text-align:center;">${idx + 1}</td>
        <td>${urunAdi}</td>
        <td style="text-align:center;">${marka}</td>
        <td class="num">${safe(k.konteyner_no)}</td>
        <td class="num">${safe(k.muhur_no)}</td>
        <td class="num">${pieces ? pieces.toLocaleString("tr-TR") : "-"}</td>
        <td class="num">${nett ? nett.toLocaleString("tr-TR") + " KG" : "-"}</td>
        <td class="num">${gross ? gross.toLocaleString("tr-TR") + " KG" : "-"}</td>
      </tr>`;
    })
    .join("\n");

  return { rows, totalPieces, totalNett, totalGross };
}

/**
 * Sistemdeki dosya/rezervasyon/konteyner verilerinden Packing List
 * HTML belgesini uretir. Bagimsiz bir dosyadir, Commercial Invoice'a
 * (invoice-builder.ts) dokunmaz.
 */
export function buildPackingListHtml(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[]
): string {
  const rez = rezervasyonlar[0];

  const { rows, totalPieces, totalNett, totalGross } = buildKonteynerSatirlari(dosya, konteynerler);

  const vesselVoyage = rez?.gemi_adi
    ? escapeHtml(`${rez.gemi_adi}${(rez as any).sefer_no ? ` / ${(rez as any).sefer_no}` : ""}`)
    : safe(null);

  const replacements: Record<string, string> = {
    INVOICE_NO: safe(dosya.fatura_no),
    INVOICE_DATE: dosya.fatura_tarihi ? escapeHtml(formatDateTR(dosya.fatura_tarihi)) : safe(null),
    SATICI_FIRMA: safe(dosya.satici_firma),
    SATICI_ADRES: escapeHtml(SATICI_SABIT_ADRES),
    SATICI_TEL: escapeHtml(SATICI_SABIT_TEL),
    SATICI_EMAIL: escapeHtml(SATICI_SABIT_EMAIL),
    ALICI_FIRMA: safe(dosya.alici_firma),
    ALICI_ADRES: safe((dosya as any).alici_adresi),
    CONSIGNEE: safe((dosya as any).consignee),
    VESSEL_VOYAGE: vesselVoyage,
    YUKLEME_LIMANI: safe(dosya.yuklenme_limani || rez?.yuklenme_limani),
    VARIS_LIMANI: safe(dosya.varis_limani),
    URETIM_TARIHI: dosya.uretim_tarihi ? escapeHtml(formatDateTR(dosya.uretim_tarihi)) : safe(null),
    SON_KULLANIM_TARIHI: dosya.son_kullanim_tarihi ? escapeHtml(formatDateTR(dosya.son_kullanim_tarihi)) : safe(null),
    DETAYLI_AMBALAJ: (() => {
      const raw = (dosya as any).detayli_ambalaj || dosya.ambalaj;
      if (!raw) return safe(null);
      if (totalPieces > 0) {
        return safe(String(raw).replace(/^[\d.,]+/, totalPieces.toLocaleString("tr-TR")));
      }
      return safe(raw);
    })(),
    LOT_NO: safe(dosya.lot_no),
    IMZA_HARUN: IMZA_HARUN,
    LOGO: LOGO_UNEX,
  };

  let html = PACKING_LIST_TEMPLATE;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`__${key}__`).join(value);
  }

  const totalRow = `<tr class="total-row">
    <td colspan="5" style="text-align:right;">TOTAL</td>
    <td class="num">${totalPieces.toLocaleString("tr-TR")}</td>
    <td class="num">${totalNett.toLocaleString("tr-TR")} KG</td>
    <td class="num">${totalGross.toLocaleString("tr-TR")} KG</td>
  </tr>`;

  html = html.replace("__KONTEYNER_SATIRLARI__", rows + "\n" + totalRow);

  return html;
}
