/**
 * lib/health-certificate-builder.ts
 *
 * Sağlık Sertifikası (Health Certificate) HTML belgesi uretir.
 *
 * Certificate of Origin / Phytosanitary Certificate ile AYNI teknik:
 * kullanicidan alinan GERCEK bos resmi form gorseli (T.C. Tarim ve Orman
 * Bakanligi formu) arka plan olarak kullanilir, veriler bu gorselin UZERINE
 * KALIN (bold) metin olarak bindirilir. Kutu konumlari, orijinal bos form
 * uzerinde piksel bazli olcum yapilarak tespit edilmis ve gorsel olarak
 * dogrulanmistir.
 *
 * 1. Üretici Firma      = UNEX sabit firma bilgisi
 * 3. İhracatçı Firma    = UNEX sabit firma bilgisi (1 ile ayni - UNEX hem
 *                         uretici hem ihracatci)
 * 5. Gideceği Ülke/Yer  = yukleme limanina gore bolge eslemesi - Phytosanitary
 *                         Certificate ile BIREBIR AYNI mantik/format
 * 6. Alıcının Adı/Adresi = dosya.consignee
 * 7. Ürün Adı           = "BUĞDAY UNU" / "WHEAT FLOUR" (sabit - tum urunler bugday unu)
 * 8. Parti No           = dosya.lot_no
 * 9. Son Tüketim Tarihi = dosya.son_kullanim_tarihi
 * 10. Birim Net Ağırlığı = ambalaj birim agirligi (ör. "25 KG")
 * 11. Dış Ambalaj Adedi  = detayli ambalaj (ör. "8.000 ÇUVAL / BAG")
 * 12. Net Miktar         = Toplam NET agirlik (konteyner toplami)
 * 13. Nakil Aracı        = "GEMİ / VESSEL" (sabit)
 * 14. Depolama Sıcaklığı = "22°C" (sabit - kullanici onayi)
 * 2,4,15,16 ve alt imza/onay alanlari = form gorselinde zaten bos/Bakanlik
 *   alani - biz hic dokunmuyoruz.
 */

import { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { HEALTH_BACKGROUND_BASE64 } from "@/lib/images/health-background-base64";

/**
 * Uzun, tek bloktaki alici adres/iletisim metnini (adres + telefon + email
 * hepsi ust uste) okunakli, MANTIKSAL noktalardan bolunmus ayri satirlara
 * ayirir. Ornegin "...DJIBOUTI Tel Office: +253... WhatsApp: +253... Emails:
 * a@x.com, b@x.com" metnini:
 *   ...DJIBOUTI
 *   Tel Office: +253... WhatsApp: +253...
 *   Emails: a@x.com, b@x.com
 * seklinde 3 satira ayirir. Boylece dar bir kutuya sigdirmak icin fontu
 * asiri kucultup tek elden otomatik satir kaydirmaya guvenmek yerine,
 * icerigi anlamli parcalara bolup her parca kendi satirinda gosterilir -
 * hem daha okunakli hem daha ongorulebilir bir yukseklik kaplar.
 */
function bolLogicalSatirlara(metin: string): string {
  let sonuc = metin;
  // Email(ler) HER ZAMAN kendi satirina - "Email:", "Emails:", "EMAIL ID:" vb.
  sonuc = sonuc.replace(/\s*(?=\bEmails?(?:\s*ID)?\s*:)/gi, "\n");
  // Telefon/WhatsApp/Fax grubu tek bir satirda kalsin - sadece bu grubun
  // ILK gorulen uyesinden once satir basi ekle ("Tel Office:", "TEL NO:",
  // "Phone:", "WhatsApp:", "Fax:" hepsi taninir; Tel Office + WhatsApp ayni
  // satirda birlikte gosterilir, birbirinden ayrilmaz).
  sonuc = sonuc.replace(/\s*(?=\bTel(?:\s*(?:Office|No\.?))?\s*:|\bPhone\s*:|\bWhatsApp\s*:|\bFax\s*:)/i, "\n");
  // Adres kismi da kendi icinde uzun olabilir: "PO Box: 1234" sonrasinda
  // (genelde ulke adi baslar) yeni bir satir basi ekle - herhangi bir ulke
  // adina ozel degil, PO Box kalibinin kendisine dayanan genel bir kural.
  sonuc = sonuc.replace(/\b(P\.?\s*O\.?\s*Box\s*:?\s*\d+)\s+/i, "$1\n");
  return sonuc
    .split("\n")
    .map((satir) => satir.trim())
    .filter((satir) => satir.length > 0)
    .join("\n");
}

/**
 * Alici adresi musteriden musteriye COK degisken uzunlukta olabilir. Sabit
 * bir font boyutu, bugun dogru olsa bile YARIN daha uzun bir adres geldiginde
 * kutunun disina tasabilir. Bu yuzden font boyutu, bolunmus satirlarin TOPLAM
 * uzunluguna gore OTOMATIK kucultulur. Alt sinirlar, BUGUN elle dogrulanan
 * gercek SAAD/BOULANGERIE ornegine (210 karakter, en uzun satir 65 karakter)
 * gore, kucuk bir guvenlik payiyla belirlenmistir - bu ornek KESINLIKLE
 * 10px'te kalir, konum hic degismez, sadece cok daha uzun bir adres gelirse
 * font kademeli kuculur.
 */
function hesaplaConsigneeFontBoyutu(bolunmusMetin: string): number {
  const toplamKarakter = bolunmusMetin.replace(/\n/g, " ").length;
  const enUzunSatir = Math.max(...bolunmusMetin.split("\n").map((s) => s.length));
  if (toplamKarakter <= 220 && enUzunSatir <= 70) return 10;
  if (toplamKarakter <= 280 && enUzunSatir <= 85) return 8.5;
  if (toplamKarakter <= 350 && enUzunSatir <= 100) return 7.5;
  return 6.5;
}

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

/** Fumigation / Certificate of Origin / Phytosanitary ile BIREBIR AYNI sabitler. */
const COMPANY_NAME    = "UNEX GIDA SAN. VE TIC.LTD.STI";
const COMPANY_ADDRESS = "İSTİKLAL MAHALLESİ CEMAL ÜNLÜSARAÇ CADDESİ\nNO:20 -P.O.BOX:59200 SÜLEYMANPAŞA\nTEKİRDAĞ -TÜRKİYE";

/**
 * Yukleme limanina gore bolge etiketi. Phytosanitary Certificate'taki
 * buildPlantProtectionBolgesi ile BIREBIR AYNI mantik/format (kullanici
 * onayiyla) - iki belge arasinda tutarlilik icin.
 */
function buildBolgeEtiketi(limanAdi: string | null | undefined): string {
  if (!limanAdi) return safe(null);
  const temizAd = limanAdi.trim();
  const normalized = temizAd.toUpperCase().replace(/İ/g, "I");
  const ambarliGrubu = ["MARPORT", "MARDAŞ", "MARDAS", "KUMPORT", "AMBARLI", "AMBARLI PORT"];
  const asyaportGrubu = ["ASYAPORT"];
  if (ambarliGrubu.some((p) => normalized.includes(p))) return `${escapeHtml(temizAd.toUpperCase())} ISTANBUL / AMBARLI`;
  if (asyaportGrubu.some((p) => normalized.includes(p))) return `${escapeHtml(temizAd.toUpperCase())} TEKİRDAĞ / ASYAPORT`;
  return escapeHtml(temizAd);
}

function buildNetAgirlikToplam(konteynerler: Konteyner[]): string {
  if (!konteynerler || konteynerler.length === 0) return safe(null);
  const toplam = konteynerler.reduce((acc, k) => acc + (k.net_agirlik_kg || 0), 0);
  if (toplam === 0) return safe(null);
  return escapeHtml(toplam.toLocaleString("tr-TR") + " KGS");
}

const SHEET_WIDTH = 800;
const SHEET_HEIGHT = Math.round(SHEET_WIDTH * (1556 / 1100)); // 1132, ayni A4 orani

const HEALTH_TEMPLATE = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Health Certificate __LOT_NR__</title>
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
    line-height: 1.3;
    white-space: pre-line;
  }
  #f-uretici     { top: 21.0%; left: 10%;    width: 29%;  font-size: 10px; }
  #f-ihracatci   { top: 24.0%; left: 51%;   width: 59%;  font-size: 10px; }
  #f-bolge       { top: 34.8%; left: 10%;    width: 22%;  font-size: 10px; white-space: nowrap; }
  #f-consignee   { top: 31.6%; left: 52%;   width: 93%;  font-size: __CONSIGNEE_FONT__px; line-height: 1.15; }
  #f-urun        { top: 40.3%; left: 25%;    width: 26%;  font-size: 10px; line-height: 1.0; white-space: nowrap; }
  #f-lot         { top: 39.3%; left: 55.5%; width: 15%;  font-size: 10px; }
  #f-skt         { top: 39.3%; left: 72.5%; width: 17%;  font-size: 10px; }
  #f-birim-net   { top: 45.8%; left: 22%;   width: 20%; font-size: 10px; white-space: nowrap; }
  #f-dis-ambalaj { top: 44.5%; left: 33%;   width: 36%;  font-size: 10px; }
  #f-net-miktar  { top: 44.5%; left: 79%; width: 10%;  font-size: 10px; }
  #f-nakil       { top: 49.2%; left: 27%;    width: 24%;  font-size: 10px; }
  #f-sicaklik    { top: 49.2%; left: 78%;   width: 11%;  font-size: 10.5px; }

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
    <img class="bg-img" src="${HEALTH_BACKGROUND_BASE64}" alt="">
    <div class="veri" id="f-uretici">__URETICI__</div>
    <div class="veri" id="f-ihracatci">__IHRACATCI__</div>
    <div class="veri" id="f-bolge">__BOLGE__</div>
    <div class="veri" id="f-consignee">__CONSIGNEE__</div>
    <div class="veri" id="f-urun">WHEAT FLOUR</div>
    <div class="veri" id="f-lot">__LOT_NR__</div>
    <div class="veri" id="f-skt">__SKT__</div>
    <div class="veri" id="f-birim-net">__BIRIM_NET__</div>
    <div class="veri" id="f-dis-ambalaj">__DIS_AMBALAJ__</div>
    <div class="veri" id="f-net-miktar">__NET_MIKTAR__</div>
    <div class="veri" id="f-nakil">GEMİ / VESSEL</div>
    <div class="veri" id="f-sicaklik">22°C</div>
  </div>
</body>
</html>`;

export function buildHealthCertificateHtml(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[]
): string {
  const rez = rezervasyonlar[0];
  const limanAdi = dosya.yuklenme_limani || rez?.yuklenme_limani;
  const birimNet = (dosya as any).detayli_ambalaj || dosya.ambalaj; // "25 KG" gibi birim agirlik bilgisini icerir

  const consigneeSatirlari = dosya.consignee ? bolLogicalSatirlara(dosya.consignee) : "";
  const consigneeFont = consigneeSatirlari ? hesaplaConsigneeFontBoyutu(consigneeSatirlari) : 10;

  const replacements: Record<string, string> = {
    URETICI:      escapeHtml(`${COMPANY_NAME}\n${COMPANY_ADDRESS}`),
    IHRACATCI:    escapeHtml(`${COMPANY_NAME}\n${COMPANY_ADDRESS}`),
    BOLGE:        buildBolgeEtiketi(limanAdi),
    CONSIGNEE:    consigneeSatirlari ? escapeHtml(consigneeSatirlari) : safe(null),
    CONSIGNEE_FONT: String(consigneeFont),
    LOT_NR:       safe(dosya.lot_no),
    SKT:          dosya.son_kullanim_tarihi ? safe(new Date(dosya.son_kullanim_tarihi).toLocaleDateString("tr-TR")) : safe(null),
    BIRIM_NET:    safe(dosya.ambalaj),
    DIS_AMBALAJ:  safe(birimNet),
    NET_MIKTAR:   buildNetAgirlikToplam(konteynerler),
  };

  let html = HEALTH_TEMPLATE;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`__${key}__`).join(value);
  }
  return html;
}