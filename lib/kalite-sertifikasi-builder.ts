/**
 * lib/kalite-sertifikasi-builder.ts
 *
 * Quality / Condition Certificate HTML belgesi uretir.
 * Calisma stili lib/fumigation-builder.ts ile BIREBIR AYNI desendedir
 * (talep: 30.09.2026, ornek belge: RAINTREE / EBKG17392211).
 *
 * Rapor tarihi   = dosya.fatura_tarihi
 * Consignee      = dosya.consignee
 * Notify         = ham_veri.notify dizisi (Yoksa: alici_firma + adresi/tel/email)
 * Vessel/Voyage  = rezervasyonlar[0].gemi_adi / sefer_no
 * B/L No         = dosya.bl_no
 * Weight as per B/L = konteynerler tablosundan brut agirlik toplami
 * Description of goods = dosya.urun_tanimi
 * Production/Expiry Date = dosya.uretim_tarihi / dosya.son_kullanim_tarihi
 * Date of inspection = dosya.uretim_tarihi + 1 GUN (talep: 30.09.2026 -
 *   kullanicinin acik talimati: "Date of inspection her zaman Production
 *   Date'in 1 gun fazlasi olacak". Sistemde ayri bir muayene tarihi alani
 *   yok, bu kuralla otomatik hesaplanir.)
 * PARAMETER/SPECIFICATION/RESULTS/METHODS tablosu = KaliteSertifikasiAyari
 *   (musteri bazli kayitli ayarlar - bkz. kalite-sertifikasi-ayar-modal.tsx)
 * Sabit bilgiler = UNEX firma bilgileri + GAFTA sertifikasyon metni
 */

import { Dosya, Rezervasyon, Konteyner, KaliteParametresi, KaliteSertifikasiAyari } from "@/lib/supabase";
import { formatDateTR } from "@/lib/cutoff-utils";
import { IMZA_HARUN, IMZA_CIGDEM_KALITE, LOGO_UNEX } from "@/lib/imzalar";

function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safe(value: string | number | null | undefined, fallback = "-"): string {
  if (value === null || value === undefined || value === "") return escapeHtml(fallback);
  const normalized = String(value).replace(/\\n/g, "\n");
  return escapeHtml(normalized);
}

const COMPANY_NAME      = "UNEX GIDA SAN. VE TIC.LTD.STI";
const FOOTER_LINE1      = "UNEX QUALITY & INSPECTION DEPARTMENT";
const FOOTER_LINE2      = "UNEX GIDA SAN VE TIC. LTD. STI.";
const FOOTER_LINE3      = "İstiklal Mah. Cemal Ünlüsaraç Cad. No:20 Süleymanpaşa Tekirdağ Türkiye";
const FOOTER_LINE4      = "T +90 282 440 08 70  F +90 282 440 08 69  info@unex.com.tr  www.unex.com.tr";

// Ornek belgedeki (RAINTREE / EBKG17392211) sabit sertifikasyon metni -
// "Görsel 3" de kullanicinin "bir kac sabit bilgi" olarak belirttigi kisim.
const CERT_INTRO_LINE1 =
  "We, UNEX GIDA SAN VE TIC LTD STI as a first class Wheat Flour Milling company hereby certify that our quality control team were nominated to attend";
const CERT_INTRO_LINE2 =
  "the loading for sampling of the goods and we can ascertain the following:";
const CERT_QUALITY_LABEL = "QUALITY:";
const CERT_METHOD_LINE1 =
  "Samples have been drawn during loading according to GAFTA Rules No. 124 and composite sample was handed over to our laboratory in Tekirdag";
const CERT_METHOD_LINE2 = "Turkiye . The analysis rendered the following results:";

/** Musteri icin henuz kayitli ayar yoksa (ilk sevkiyat) kullanilan varsayilan
 * PARAMETER/SPECIFICATION/RESULTS/METHODS tablosu - ornek belgeden (un/wheat
 * flour) birebir alinmistir. kalite-sertifikasi-ayar-modal.tsx da bu ayni
 * varsayilanla acilir, kullanici duzenleyip musteriye ozel kaydeder. */
export const VARSAYILAN_KALITE_PARAMETRELERI: KaliteParametresi[] = [
  { parametre: "Protein (N X 5.7on dry basis)", spesifikasyon: "min 13%", sonuc: "13,1", metod: "ISO 20483" },
  { parametre: "Moisture", spesifikasyon: "max 14,0 %", sonuc: "13,8", metod: "ISO 712" },
  { parametre: "Ash Content", spesifikasyon: "Max. 0,60 %", sonuc: "0,58", metod: "ISO 2171:2007" },
  { parametre: "Color(Minolta Chroma Meter)", spesifikasyon: "----------------------", sonuc: "--------------------", metod: "--------------------" },
  { parametre: "Falling number", spesifikasyon: "min 250 sec", sonuc: "302", metod: "ISO 3093" },
  { parametre: "Wet gluten", spesifikasyon: "min 30 %", sonuc: "30,2", metod: "ISO 21415-2" },
  { parametre: "Gluten Index", spesifikasyon: "min 80 %", sonuc: "91", metod: "ISO 21415-2" },
  { parametre: "Sedimantation (Zeleny Index)", spesifikasyon: "Min. 40", sonuc: "44", metod: "ISO 5529:2007" },
  { parametre: "Delayed Sedimantation", spesifikasyon: "Min. 50", sonuc: "67", metod: "-------------------" },
  { parametre: "Amylograph", spesifikasyon: "Min.400 AU", sonuc: "486", metod: "ISO 7973:1992" },
  { parametre: "Energy - W", spesifikasyon: "min 180 10E-4j", sonuc: "", metod: "ISO 27971" },
  { parametre: "P/L", spesifikasyon: "0,8-1,20", sonuc: "", metod: "ISO 27971" },
  { parametre: "Energy (Brabender Extensograph@135 min.)", spesifikasyon: "110 cm2", sonuc: "124", metod: "ISO 5530-2" },
  { parametre: "Water Absorbtion", spesifikasyon: "58 % Min.", sonuc: "58,6", metod: "ISO 5530-2" },
  { parametre: "Ucd ( Sd Matic )", spesifikasyon: "21- 25", sonuc: "", metod: "ISO 13407" },
];

function buildParametreSatirlari(parametreler: KaliteParametresi[]): string {
  if (!parametreler || parametreler.length === 0) return "";
  return parametreler
    .map(
      (p) => `      <tr>
        <td class="param-lbl">${safe(p.parametre, "")}</td>
        <td class="center">${safe(p.spesifikasyon, "")}</td>
        <td class="center">${safe(p.sonuc, "")}</td>
        <td class="center">${safe(p.metod, "")}</td>
      </tr>`
    )
    .join("\n");
}

function buildBrutAgirlikToplam(konteynerler: Konteyner[]): string {
  if (!konteynerler || konteynerler.length === 0) return safe(null);
  const toplam = konteynerler.reduce((acc, k) => acc + (k.brut_agirlik_kg || 0), 0);
  if (toplam === 0) return safe(null);
  return escapeHtml(toplam.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " KGS");
}

const KALITE_SERTIFIKASI_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Quality / Condition Certificate __REPORT_NR__</title>
<style>
  @page { size: A4; margin: 12mm 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #1a1a1a;
    font-size: 10px;
    line-height: 1.4;
    margin: 0;
    background: #E5E7EB;
    min-height: 100vh;
    padding: 24px 0;
  }
  .sheet {
    max-width: 800px;
    width: 800px;
    min-height: 1050px;
    margin: 0 auto;
    background: #FFFFFF;
    padding: 24px 28px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.15);
    display: flex;
    flex-direction: column;
  }
  .header { display: flex; align-items: flex-start; margin-bottom: 10px; }
  .logo-slot img { max-width: 110px; max-height: 75px; object-fit: contain; }
  .title-block { flex: 1; text-align: center; padding-top: 8px; }
  .cert-title { font-size: 16px; font-weight: bold; letter-spacing: 1px; }
  .date-block { min-width: 170px; }
  .date-row { display: flex; justify-content: flex-end; margin-bottom: 2px; }
  .date-label { font-weight: bold; width: 50px; text-align: left; }
  .date-value { text-align: left; min-width: 110px; }
  .main-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .main-table td { border: 1px solid #888; padding: 4px 8px; vertical-align: top; }
  .main-table td.lbl { font-weight: bold; width: 150px; white-space: nowrap; }
  .main-table td.val { white-space: pre-line; }
  .closing-text { font-size: 9.5px; margin: 8px 0; }
  .quality-label { font-weight: bold; margin-top: 4px; margin-bottom: 2px; }
  .param-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .param-table th { border: 1px solid #888; padding: 4px 6px; text-align: center; font-weight: bold; background: #F3F4F6; font-size: 9.5px; }
  .param-table td { border: 1px solid #888; padding: 3px 6px; font-size: 9.5px; }
  .param-table td.param-lbl { text-align: left; }
  .param-table td.center { text-align: center; }
  .signature-row { display: flex; justify-content: space-between; gap: 20px; margin-top: 12px; margin-bottom: 14px; }
  .signature-box { padding: 6px 10px; min-width: 200px; text-align: center; }
  .stamp-slot img { max-width: 160px; max-height: 100px; object-fit: contain; }
  .footer-note { margin-top: auto; border-top: 1px solid #888; padding-top: 8px; text-align: center; font-size: 9px; line-height: 1.7; }
  .footer-note .dept-line { font-weight: bold; margin-bottom: 2px; }
  .print-hint { background: #FEF3C7; border: 1px solid #FDE68A; color: #92400E; padding: 10px 14px; font-size: 11px; margin-bottom: 14px; border-radius: 6px; }
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
    <strong>Yazdirmadan once:</strong> "Headers and footers" KAPALI, "Background graphics" ACIK olsun.
  </div>
  <div class="header">
    <div class="logo-slot">
      <img src="__LOGO__" alt="Unex Logo" onerror="this.style.display='none'">
    </div>
    <div class="title-block">
      <div class="cert-title">QUALITY / CONDITION CERTIFICATE</div>
    </div>
    <div class="date-block">
      <div class="date-row"><span class="date-label">DATE</span><span class="date-value">: __DATE__</span></div>
    </div>
  </div>
  <table class="main-table">
    <tr><td class="lbl">Description of goods</td><td class="val">__DESCRIPTION_OF_GOODS__</td></tr>
    <tr><td class="lbl">Shipper</td><td class="val">__COMPANY_NAME__</td></tr>
    <tr><td class="lbl">Consignee</td><td class="val">__CONSIGNEE__</td></tr>
    <tr><td class="lbl">Notify</td><td class="val">__NOTIFY__</td></tr>
    <tr><td class="lbl">Vessel's name</td><td class="val">__VESSEL_VOYAGE__</td></tr>
    <tr><td class="lbl">B/L No.</td><td class="val">__BL_NO__</td></tr>
    <tr><td class="lbl">Weight as per B/L</td><td class="val">__WEIGHT_AS_PER_BL__</td></tr>
    <tr><td class="lbl">Loading port</td><td class="val">__PORT_OF_LOADING__</td></tr>
    <tr><td class="lbl">Destination</td><td class="val">__DESTINATION__</td></tr>
    <tr><td class="lbl">Date of inspection</td><td class="val">__INSPECTION_DATE__</td></tr>
    <tr><td class="lbl">Production Date</td><td class="val">__PRODUCTION_DATE__</td></tr>
    <tr><td class="lbl">Expiry Date</td><td class="val">__EXPIRY_DATE__</td></tr>
  </table>
  <div class="closing-text">
    __CERT_INTRO_LINE1__<br>
    __CERT_INTRO_LINE2__
  </div>
  <div class="quality-label">__CERT_QUALITY_LABEL__</div>
  <div class="closing-text">
    __CERT_METHOD_LINE1__<br>
    __CERT_METHOD_LINE2__
  </div>
  <table class="param-table">
    <thead>
      <tr>
        <th>PARAMETER</th>
        <th>SPECIFICATION</th>
        <th>RESULTS</th>
        <th>METHODS</th>
      </tr>
    </thead>
    <tbody>
__PARAMETRE_SATIRLARI__
    </tbody>
  </table>
  <div class="signature-row">
    <div class="signature-box">
      <div class="stamp-slot">
        <img src="__IMZA_HARUN__" alt="Signature" onerror="this.style.display='none'">
      </div>
    </div>
    <div class="signature-box">
      <div class="stamp-slot">
        <img src="__IMZA_CIGDEM_KALITE__" alt="Signature" onerror="this.style.display='none'">
      </div>
    </div>
  </div>
  <div class="footer-note">
    <div class="dept-line">__FOOTER_LINE1__</div>
    __FOOTER_LINE2__<br>
    __FOOTER_LINE3__<br>
    __FOOTER_LINE4__
  </div>
</div>
</body>
</html>`;

/**
 * Quality / Condition Certificate HTML belgesi uretir.
 * @param ayar - kalite_sertifikasi_ayarlari tablosundan gelen musteri bazli
 *   parametre tablosu (null ise ornek belgedeki varsayilan un parametreleri kullanilir)
 */
export function buildKaliteSertifikasiHtml(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[],
  ayar: KaliteSertifikasiAyari | null = null
): string {
  const rez = rezervasyonlar[0];
  const hamVeri = (dosya.ham_veri as Record<string, unknown>) || {};

  const parametreler = ayar?.parametreler && ayar.parametreler.length > 0
    ? ayar.parametreler
    : VARSAYILAN_KALITE_PARAMETRELERI;

  const vesselVoyage = [rez?.gemi_adi, rez?.sefer_no].filter(Boolean).join(" / ");

  const replacements: Record<string, string> = {
    DATE:                  dosya.fatura_tarihi
                             ? escapeHtml(formatDateTR(dosya.fatura_tarihi))
                             : safe(null),
    REPORT_NR:             safe(dosya.proforma_no),
    DESCRIPTION_OF_GOODS:  safe(dosya.urun_tanimi),
    CONSIGNEE:             safe(dosya.consignee),
    NOTIFY:                escapeHtml(
                             (() => {
                               const notifyArr = (hamVeri as any)?.notify;
                               if (Array.isArray(notifyArr) && notifyArr.length > 0) {
                                 return notifyArr.join("\n\n");
                               }
                               return [
                                 dosya.alici_firma,
                                 (hamVeri as any)?.alici_adresi,
                                 (hamVeri as any)?.alici_tel ? `TEL: ${(hamVeri as any)?.alici_tel}` : null,
                                 (hamVeri as any)?.alici_email ? `E-mail: ${(hamVeri as any)?.alici_email}` : null,
                               ].filter(Boolean).join("\n");
                             })()
                           ),
    VESSEL_VOYAGE:         safe(vesselVoyage || null),
    BL_NO:                 safe(dosya.bl_no),
    WEIGHT_AS_PER_BL:      buildBrutAgirlikToplam(konteynerler),
    PORT_OF_LOADING:       safe(rez?.yuklenme_limani || dosya.yuklenme_limani),
    DESTINATION:           safe(dosya.varis_limani),
    INSPECTION_DATE:       (() => {
                             if (!dosya.uretim_tarihi) return safe(null);
                             const d = new Date(dosya.uretim_tarihi);
                             d.setDate(d.getDate() + 1);
                             return escapeHtml(formatDateTR(d.toISOString().split("T")[0]));
                           })(),
    PRODUCTION_DATE:       dosya.uretim_tarihi
                             ? escapeHtml(formatDateTR(dosya.uretim_tarihi))
                             : safe(null),
    EXPIRY_DATE:           dosya.son_kullanim_tarihi
                             ? escapeHtml(formatDateTR(dosya.son_kullanim_tarihi))
                             : safe(null),
    COMPANY_NAME:          escapeHtml(COMPANY_NAME),
    CERT_INTRO_LINE1:      escapeHtml(CERT_INTRO_LINE1),
    CERT_INTRO_LINE2:      escapeHtml(CERT_INTRO_LINE2),
    CERT_QUALITY_LABEL:    escapeHtml(CERT_QUALITY_LABEL),
    CERT_METHOD_LINE1:     escapeHtml(CERT_METHOD_LINE1),
    CERT_METHOD_LINE2:     escapeHtml(CERT_METHOD_LINE2),
    PARAMETRE_SATIRLARI:   buildParametreSatirlari(parametreler),
    FOOTER_LINE1:          escapeHtml(FOOTER_LINE1),
    FOOTER_LINE2:          escapeHtml(FOOTER_LINE2),
    FOOTER_LINE3:          escapeHtml(FOOTER_LINE3),
    FOOTER_LINE4:          escapeHtml(FOOTER_LINE4),
    IMZA_HARUN:            IMZA_HARUN,
    IMZA_CIGDEM_KALITE:    IMZA_CIGDEM_KALITE,
    LOGO:                  LOGO_UNEX,
  };

  let html = KALITE_SERTIFIKASI_TEMPLATE;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`__${key}__`).join(value);
  }
  return html;
}
