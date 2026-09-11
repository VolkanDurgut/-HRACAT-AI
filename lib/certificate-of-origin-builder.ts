/**
 * lib/certificate-of-origin-builder.ts
 *
 * Menşe Şahadetnamesi (Certificate of Origin) HTML belgesi uretir.
 *
 * ONEMLI: Bu belge, diger HTML belgelerinden (Invoice/Packing List/Fumigation)
 * FARKLI bir teknik kullanir. Kutulari CSS ile cizmek yerine, kullanicidan
 * alinan GERCEK resmi form gorseli (Tarim Il Mudurlugu / Ticaret Odasi
 * formu) sayfanin arka plani olarak kullanilir ve tum veriler bu gorselin
 * UZERINE, dogru kutu konumlarina denk gelecek sekilde KALIN (bold) metin
 * olarak bindirilir. Arka plan gorseli hem Taslak hem Orijinal ciktida
 * DEGISMEDEN aynidir - degisen tek sey filigran (draftFiligranEkle ile
 * disaridan eklenir, bu dosyanin bilgisi disindadir).
 *
 * Kutu konumlari, kullanicidan gelen orijinal PDF uzerinde piksel bazli
 * olcum yapilarak (kenarliklarin tam koordinatlari tespit edilerek)
 * belirlenmis ve gorsel olarak dogrulanmistir.
 *
 * 2. Alıcı        = dosya.consignee
 * 3. Menşe Ülkesi = "Türkiye" - ZATEN gorselin icinde basili, ayrica yazilmaz
 * 4. Taşıma       = "BY VESSEL" (sabit)
 * 6. Esya tanimi  = dosya.urun_tanimi + ambalaj + NET/GROSS (konteyner toplami)
 *                   + LOT NR (dosya.lot_no) + REF NR (rezervasyon booking_no)
 * 7. Miktar       = Toplam GROSS agirlik (KGS)
 * 1. İhracatçı ve "1" sira no, gorselde zaten YOK/VAR - Ihracatci bos oldugu
 *    icin yaziliyor, "1" zaten gorselde basili oldugu icin yazilmiyor.
 */

import { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { COO_BACKGROUND_BASE64 } from "@/lib/images/coo-background-base64";

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

/** Fumigation Certificate ile BIREBIR AYNI sabitler. */
const COMPANY_NAME    = "UNEX GIDA SAN. VE TIC.LTD.STI";
const COMPANY_ADDRESS = "İSTİKLAL MAHALLESİ CEMAL ÜNLÜSARAÇ CADDESİ\nNO:20 -P.O.BOX:59200 SÜLEYMANPAŞA\nTEKİRDAĞ -TÜRKİYE";

function buildNetAgirlikToplam(konteynerler: Konteyner[]): string {
  if (!konteynerler || konteynerler.length === 0) return safe(null);
  const toplam = konteynerler.reduce((acc, k) => acc + (k.net_agirlik_kg || 0), 0);
  if (toplam === 0) return safe(null);
  return escapeHtml(toplam.toLocaleString("tr-TR") + " KGS");
}

function buildBrutAgirlikToplam(konteynerler: Konteyner[]): string {
  if (!konteynerler || konteynerler.length === 0) return safe(null);
  const toplam = konteynerler.reduce((acc, k) => acc + ((k as any).brut_agirlik_kg || 0), 0);
  if (toplam === 0) return safe(null);
  return escapeHtml(toplam.toLocaleString("tr-TR") + " KGS");
}

// Sayfa gorseli 1100x1556 px (A4 orani ile birebir). Sheet boyutu diger
// belgelerle tutarli olmasi icin 800px genislikte, orani koruyarak.
const SHEET_WIDTH = 800;
const SHEET_HEIGHT = Math.round(SHEET_WIDTH * (1556 / 1100)); // 1132

const CERTIFICATE_OF_ORIGIN_TEMPLATE = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Certificate of Origin __LOT_NR__</title>
<style>
  @page { size: A4; margin: 10mm 10mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Times New Roman", Times, serif;
    color: #000;
    margin: 0;
    background: #E5E7EB;
    padding: 24px 0;
  }
  .print-hint {
    max-width: ${SHEET_WIDTH}px; margin: 0 auto 12px auto; padding: 8px 12px;
    background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 6px;
    font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #78350F;
  }
  .sheet {
    position: relative;
    width: ${SHEET_WIDTH}px;
    height: ${SHEET_HEIGHT}px;
    margin: 0 auto;
    box-shadow: 0 4px 24px rgba(0,0,0,0.15);
    overflow: hidden;
  }
  .sheet .bg-img {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    z-index: 0;
    display: block;
  }
  .veri {
    position: absolute;
    z-index: 1;
    font-weight: 700;
    color: #000;
    line-height: 1.35;
    white-space: pre-line;
  }
  #f-consignor   { top: 12.0%; left: 9.5%;  width: 41%;  font-size: 11px; }
  #f-consignee   { top: 25.8%; left: 9.5%;  width: 41%;  font-size: 11.5px; }
  #f-transport   { top: 41.0%; left: 9.5%;  width: 41%;  font-size: 11.5px; }
  #f-item        { top: 52.0%; left: 10.5%; width: 54%;  font-size: 11px; line-height: 1.55; }
  #f-quantity    { top: 55.5%; left: 70%;   width: 22%;  font-size: 12px; text-align: center; }

  @media print {
    body { background: #fff; padding: 0; }
    .print-hint { display: none; }
    .sheet { box-shadow: none; margin: 0; }
  }
</style>
</head>
<body>
  <div class="print-hint">
    <strong>Yazdirmadan once:</strong> Tarayicinin yazdirma penceresinde "Headers and footers" (Ust/alt bilgi) secenegini KAPALI yapin. Form gorseli gercek bir resim oldugu icin "Arka plan grafikleri" secenegi kapali olsa dahi PDF'e dogru sekilde yazdirilir.
  </div>
  <div class="sheet">
    <img class="bg-img" src="${COO_BACKGROUND_BASE64}" alt="">
    <div class="veri" id="f-consignor">__CONSIGNOR__</div>
    <div class="veri" id="f-consignee">__CONSIGNEE__</div>
    <div class="veri" id="f-transport">BY VESSEL</div>
    <div class="veri" id="f-item">__URUN_TANIMI__
__AMBALAJ__
NET : __NET__&nbsp;&nbsp;GROSS : __GROSS__
LOT NR : __LOT_NR__
REF NR : __REF_NR__</div>
    <div class="veri" id="f-quantity">__GROSS__</div>
  </div>
</body>
</html>`;

export function buildCertificateOfOriginHtml(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[]
): string {
  const rez = rezervasyonlar[0];

  const replacements: Record<string, string> = {
    CONSIGNOR:    escapeHtml(`${COMPANY_NAME}\n${COMPANY_ADDRESS}`),
    CONSIGNEE:    safe(dosya.consignee),
    URUN_TANIMI:  safe(dosya.urun_tanimi),
    AMBALAJ:      safe(dosya.detayli_ambalaj || dosya.ambalaj),
    NET:          buildNetAgirlikToplam(konteynerler),
    GROSS:        buildBrutAgirlikToplam(konteynerler),
    LOT_NR:       safe(dosya.lot_no),
    REF_NR:       safe(rez?.booking_no),
  };

  let html = CERTIFICATE_OF_ORIGIN_TEMPLATE;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`__${key}__`).join(value);
  }
  return html;
}