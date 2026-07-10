/**
 * lib/fumigation-builder.ts
 *
 * Fumigation Certificate HTML belgesi uretir.
 *
 * Rapor No       = dosya.proforma_no
 * Consignee      = dosya.consignee
 * Notify         = dosya.alici_firma + ham_veri adresi/tel/email
 * Net/Brut       = konteynerler tablosundan otomatik toplam
 * Fumigasyon detaylari = FumigationAyari parametresinden (musteri bazli kayitli ayarlar)
 * Sabit bilgiler = UNEX firma bilgileri
 */

import { Dosya, Rezervasyon, Konteyner, FumigationAyari } from "@/lib/supabase";
import { formatDateTR } from "@/lib/cutoff-utils";
import { IMZA_HARUN, IMZA_CIGDEM, LOGO_UNEX } from "@/lib/imzalar";

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
const COMPANY_ADDRESS   = "İSTİKLAL MAHALLESİ CEMAL ÜNLÜSARAÇ CADDESİ\nNO:20 -P.O.BOX:59200 SÜLEYMANPAŞA\nTEKİRDAĞ -TÜRKİYE";
const COMPANY_TEL_FAX   = "+90 (541) 339 60 04";
const AUTHORIZED_PERSON = "Çiğdem YAVUZ";
const FUMIGATION_PLACE  = "SÜLEYMANPAŞA / TEKİRDAĞ";
const FOOTER_LINE1      = "UNEX GIDA SAN VE TIC. LTD. STI.";
const FOOTER_LINE2      = "İstiklal Mah. Cemal Ünlüsaraç Cad. No:20 Süleymanpaşa Tekirdağ Türkiye";
const FOOTER_LINE3      = "T +90 282 440 08 70  F +90 282 440 08 69  info@unex.com.tr  www.unex.com.tr";

function buildKindOfFumigation(konteynerler: Konteyner[]): string {
  if (!konteynerler || konteynerler.length === 0) return safe(null);
  const tipSayilari: Record<string, number> = {};
  konteynerler.forEach((k) => {
    const tip = (k.tip || "20 DC").toUpperCase();
    tipSayilari[tip] = (tipSayilari[tip] || 0) + 1;
  });
  return escapeHtml(
    Object.entries(tipSayilari)
      .map(([tip, adet]) => `${adet} * ${tip} CONTAINERS`)
      .join(", ")
  );
}

function buildContainerNos(konteynerler: Konteyner[]): string {
  if (!konteynerler || konteynerler.length === 0) return safe(null);
  return escapeHtml(konteynerler.map((k) => k.konteyner_no).join(", "));
}

function buildNetAgirlikToplam(konteynerler: Konteyner[]): string {
  if (!konteynerler || konteynerler.length === 0) return safe(null);
  const toplam = konteynerler.reduce((acc, k) => acc + (k.net_agirlik_kg || 0), 0);
  if (toplam === 0) return safe(null);
  return escapeHtml(toplam.toLocaleString("tr-TR") + " KGS");
}

function buildBrutAgirlikToplam(konteynerler: Konteyner[]): string {
  if (!konteynerler || konteynerler.length === 0) return safe(null);
  const toplam = konteynerler.reduce((acc, k) => acc + (k.brut_agirlik_kg || 0), 0);
  if (toplam === 0) return safe(null);
  return escapeHtml(toplam.toLocaleString("tr-TR") + " KGS");
}

const FUMIGATION_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Fumigation Certificate __REPORT_NR__</title>
<style>
  @page { size: A4; margin: 12mm 12mm; }
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
    padding: 24px 28px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.15);
    display: flex;
    flex-direction: column;
  }
  .header { display: flex; align-items: flex-start; margin-bottom: 10px; }
  .logo-slot img { max-width: 110px; max-height: 75px; object-fit: contain; }
  .title-block { flex: 1; text-align: center; padding-top: 8px; }
  .cert-title { font-size: 18px; font-weight: bold; letter-spacing: 1px; }
  .date-block { min-width: 200px; }
  .date-row { display: flex; justify-content: flex-end; margin-bottom: 2px; }
  .date-label { font-weight: bold; width: 80px; text-align: left; }
  .date-value { text-align: left; min-width: 120px; }
  .main-table { width: 100%; border-collapse: collapse; }
  .main-table td { border: 1px solid #888; padding: 5px 8px; vertical-align: top; }
  .main-table tr.notify-row td { vertical-align: middle; }
  .main-table td.lbl { font-weight: bold; width: 155px; white-space: nowrap; }
  .main-table td.val { white-space: pre-line; }
  .vessel-table { width: 100%; border-collapse: collapse; }
  .vessel-table th { border: 1px solid #888; padding: 5px 8px; text-align: center; font-weight: bold; }
  .vessel-table td { border: 1px solid #888; padding: 5px 8px; text-align: center; }
  .vessel-table td.vessel-name { color: #C0392B; font-weight: bold; }
  .detail-table { width: 100%; border-collapse: collapse; }
  .detail-table td { border: 1px solid #888; padding: 5px 8px; vertical-align: middle; }
  .detail-table td.lbl { font-weight: bold; width: 155px; white-space: nowrap; }
  .detail-table td.center { text-align: center; }
  .detail-table td.bold { font-weight: bold; text-align: center; }
  .closing-text { font-size: 10px; margin-top: 10px; margin-bottom: 10px; }
  .signature-row { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 14px; }
  .signature-box { padding: 6px 10px; min-width: 200px; text-align: center; }
  .sig-title { font-weight: bold; font-size: 9px; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 0.5px; }
  .stamp-slot img { max-width: 160px; max-height: 100px; object-fit: contain; }
  .footer-note { margin-top: auto; border-top: 1px solid #888; padding-top: 8px; text-align: center; font-size: 9px; line-height: 1.7; }
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
      <div class="cert-title">FUMIGATION CERTIFICATE</div>
    </div>
    <div class="date-block">
      <div class="date-row"><span class="date-label">DATE</span><span class="date-value">: __DATE__</span></div>
      <div class="date-row"><span class="date-label">REPORT NR</span><span class="date-value">: __REPORT_NR__</span></div>
    </div>
  </div>
  <table class="main-table">
    <tr><td class="lbl">Company</td><td class="val">__COMPANY_NAME__</td></tr>
    <tr><td class="lbl">Company Address</td><td class="val">__COMPANY_ADDRESS__</td></tr>
    <tr><td class="lbl">Telephone&amp;Fax</td><td class="val">__COMPANY_TEL_FAX__</td></tr>
    <tr><td class="lbl">Authorized Person</td><td class="val">__AUTHORIZED_PERSON__</td></tr>
    <tr><td class="lbl">Consignee</td><td class="val">__CONSIGNEE__</td></tr>
    <tr class="notify-row"><td class="lbl">Notify</td><td class="val">__NOTIFY__</td></tr>
    <tr><td class="lbl">Kind Of Fumigation</td><td class="val">__KIND_OF_FUMIGATION__</td></tr>
    <tr><td class="lbl">Place</td><td class="val">__PLACE__</td></tr>
    <tr><td class="lbl">Container No</td><td class="val">__CONTAINER_NOS__</td></tr>
  </table>
  <table class="vessel-table">
    <thead>
      <tr>
        <th>Name Of Vessel</th>
        <th>Voyage Number</th>
        <th>Port Of Loadıng</th>
        <th>Port Of Dıscharge</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="vessel-name">__VESSEL_NAME__</td>
        <td class="vessel-name">__VOYAGE_NUMBER__</td>
        <td>__PORT_OF_LOADING__</td>
        <td>__PORT_OF_DISCHARGE__</td>
      </tr>
    </tbody>
  </table>
  <table class="detail-table">
    <tr><td class="lbl">Description Of Goods</td><td colspan="3" class="val">__DESCRIPTION_OF_GOODS__</td></tr>
    <tr><td class="lbl">Net Weight</td><td colspan="3" class="val">__NET_WEIGHT__</td></tr>
    <tr><td class="lbl">Gross Weight</td><td colspan="3" class="val">__GROSS_WEIGHT__</td></tr>
    <tr><td class="lbl">Temperature</td><td colspan="3" class="center">__TEMPERATURE__</td></tr>
    <tr>
      <td class="lbl">Fumigant</td>
      <td class="val">__FUMIGANT__</td>
      <td class="bold">Fumıgatıon Dosage(gr/m3)</td>
      <td class="center">__FUMIGATION_DOSAGE__</td>
    </tr>
    <tr>
      <td class="lbl">Commance Fumigation</td>
      <td class="val">__COMMENCE_DATE__</td>
      <td class="bold">Tıme</td>
      <td class="center">__COMMENCE_TIME__</td>
    </tr>
    <tr>
      <td class="lbl">Completed Fumigation</td>
      <td class="val">__COMPLETED_DATE__</td>
      <td class="bold">Tıme</td>
      <td class="center">__COMPLETED_TIME__</td>
    </tr>
    <tr>
      <td class="lbl">Min.Exp.Period</td>
      <td class="val">__MIN_EXP_PERIOD__</td>
      <td class="bold">Aeratıon Perıod</td>
      <td class="center">__AERATION_PERIOD__</td>
    </tr>
  </table>
  <div class="closing-text">
    The Contaniers and the Contents has been effectively Fumigated by our company team.
  </div>
  <div class="signature-row">
    <div class="signature-box">
      <div class="stamp-slot">
        <img src="__IMZA_HARUN__" alt="Signature" onerror="this.style.display='none'">
      </div>
    </div>
    <div class="signature-box">
      <div class="stamp-slot">
        <img src="__IMZA_CIGDEM__" alt="Fumigation Operator" onerror="this.style.display='none'">
      </div>
    </div>
  </div>
  <div class="footer-note">
    __FOOTER_LINE1__<br>
    __FOOTER_LINE2__<br>
    __FOOTER_LINE3__
  </div>
</div>
</body>
</html>`;

/**
 * Fumigation Certificate HTML belgesi uretir.
 * @param ayar - fumigation_ayarlari tablosundan gelen musteri bazli ayarlar (null ise varsayilanlar kullanilir)
 */
export function buildFumigationHtml(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[],
  ayar: FumigationAyari | null = null
): string {
  const rez = rezervasyonlar[0];
  const hamVeri = (dosya.ham_veri as Record<string, unknown>) || {};

  // Ayar yoksa varsayilan degerler
  const fumigant        = ayar?.fumigant        ?? "ALPH3";
  const fumigasyonDozu  = ayar?.fumigasyon_dozu ?? "-";
  const sicaklik        = ayar?.sicaklik        ?? "30";
  const baslangicSaati  = ayar?.baslangic_saati ?? "10:00";
  const bitisSaati      = ayar?.bitis_saati     ?? "10:00";
  const minExpPeriod    = ayar?.min_exp_period  ?? "120 HOURS";
  const aerationPeriod  = ayar?.aeration_period ?? "2 HOUR AFTER OPENING";

  const replacements: Record<string, string> = {
    DATE:                  dosya.fatura_tarihi
                             ? escapeHtml(formatDateTR(dosya.fatura_tarihi))
                             : safe(null),
    REPORT_NR:             safe(dosya.proforma_no),
    CONSIGNEE:             safe(dosya.consignee),
    NOTIFY:                escapeHtml(
                             [
                               dosya.alici_firma,
                               (dosya.ham_veri as any)?.alici_adresi,
                               (dosya.ham_veri as any)?.alici_tel ? `TEL: ${(dosya.ham_veri as any)?.alici_tel}` : null,
                               (dosya.ham_veri as any)?.alici_email ? `E-mail: ${(dosya.ham_veri as any)?.alici_email}` : null,
                             ]
                               .filter(Boolean)
                               .join("\n")
                           ),
    KIND_OF_FUMIGATION:    buildKindOfFumigation(konteynerler),
    PLACE:                 escapeHtml(hamVeri["fumigation_yeri"] as string || FUMIGATION_PLACE),
    CONTAINER_NOS:         buildContainerNos(konteynerler),
    VESSEL_NAME:           safe(rez?.gemi_adi),
    VOYAGE_NUMBER:         safe(rez?.sefer_no),
    PORT_OF_LOADING:       safe(dosya.yuklenme_limani || rez?.yuklenme_limani),
    PORT_OF_DISCHARGE:     safe(dosya.varis_limani),
    DESCRIPTION_OF_GOODS:  safe(dosya.urun_tanimi || dosya.ambalaj),
    NET_WEIGHT:            buildNetAgirlikToplam(konteynerler),
    GROSS_WEIGHT:          buildBrutAgirlikToplam(konteynerler),
    TEMPERATURE:           escapeHtml(sicaklik),
    FUMIGANT:              escapeHtml(fumigant),
    FUMIGATION_DOSAGE:     escapeHtml(fumigasyonDozu),
    COMMENCE_DATE:         dosya.fatura_tarihi
                             ? escapeHtml(formatDateTR(dosya.fatura_tarihi))
                             : safe(null),
    COMMENCE_TIME:         escapeHtml(baslangicSaati),
    COMPLETED_DATE:        (() => {
                             if (!dosya.fatura_tarihi) return safe(null);
                             const d = new Date(dosya.fatura_tarihi);
                             d.setDate(d.getDate() + 5);
                             return escapeHtml(formatDateTR(d.toISOString().split("T")[0]));
                           })(),
    COMPLETED_TIME:        escapeHtml(bitisSaati),
    MIN_EXP_PERIOD:        escapeHtml(minExpPeriod),
    AERATION_PERIOD:       escapeHtml(aerationPeriod),
    COMPANY_NAME:          escapeHtml(COMPANY_NAME),
    COMPANY_ADDRESS:       escapeHtml(COMPANY_ADDRESS),
    COMPANY_TEL_FAX:       escapeHtml(COMPANY_TEL_FAX),
    AUTHORIZED_PERSON:     escapeHtml(AUTHORIZED_PERSON),
    FOOTER_LINE1:          escapeHtml(FOOTER_LINE1),
    FOOTER_LINE2:          escapeHtml(FOOTER_LINE2),
    FOOTER_LINE3:          escapeHtml(FOOTER_LINE3),
    IMZA_HARUN:            IMZA_HARUN,
    IMZA_CIGDEM:           IMZA_CIGDEM,
    LOGO:                  LOGO_UNEX,
  };

  let html = FUMIGATION_TEMPLATE;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`__${key}__`).join(value);
  }
  return html;
}
