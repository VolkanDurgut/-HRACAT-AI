/**
 * lib/phytosanitary-certificate-builder.ts
 *
 * Phytosanitary Certificate (Bitki Sağlığı Sertifikası) HTML belgesi uretir.
 *
 * Certificate of Origin ile AYNI teknik: kullanicidan alinan GERCEK bos resmi
 * form gorseli (T.C. Tarim ve Orman Bakanligi formu) arka plan olarak
 * kullanilir, veriler bu gorselin UZERINE KALIN (bold) metin olarak
 * bindirilir. Kutu konumlari, orijinal bos form uzerinde piksel bazli olcum
 * yapilarak tespit edilmis ve gorsel olarak dogrulanmistir.
 *
 * 1. İhracatçı        = UNEX sabit firma bilgisi (diger resmi belgelerle ayni sabitler)
 * 3. Alıcı             = dosya.consignee
 * 4. Plant Protection  = yukleme limanina gore bolge eslemesi (asagida PORT_BOLGE_HARITASI)
 * 5. Place of origin   = "TÜRKİYE" (sabit)
 * 6. Means of conveyance = "BY SHIP / CONTAINERS <adet>" (konteyner sayisi eklenir)
 * 7. Point of entry    = Gemi Adi + " / " + Sefer No
 * 8. Esya tanimi       = dosya.urun_tanimi + " /Triticum sp." (sabit botanik ek)
 *                        + ambalaj + LOT NR (dosya.lot_no) + REF NR (rezervasyon booking_no)
 * 9. Miktar            = Toplam GROSS agirlik (konteyner toplami)
 * 11-17 (NONE) ve 18 (imza/muhur alani) = form gorselinin kendisinde zaten
 *   basili / bos - biz hic dokunmuyoruz (Bakanligin kendi degerlendirme alani).
 */

import { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { PHYTO_BACKGROUND_BASE64 } from "@/lib/images/phyto-background-base64";

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

/** Fumigation / Certificate of Origin ile BIREBIR AYNI sabitler. */
const COMPANY_NAME    = "UNEX GIDA SAN. VE TIC.LTD.STI";
const COMPANY_ADDRESS = "İSTİKLAL MAHALLESİ CEMAL ÜNLÜSARAÇ CADDESİ\nNO:20 -P.O.BOX:59200 SÜLEYMANPAŞA\nTEKİRDAĞ -TÜRKİYE";

/**
 * Yukleme limanina gore "Plant Protection Organization" kutusunda gosterilecek
 * bolge etiketini belirler. Kullanicinin acikca belirttigi kural:
 *   - MARPORT / MARDAŞ / KUMPORT (Ambarli bolgesi limanlari)  -> "ISTANBUL / AMBARLI"
 *   - ASYAPORT (Tekirdag bolgesi)                              -> "TEKIRDAĞ / ASYAPORT"
 * Taninmayan bir liman gelirse (henuz haritalanmamis), YANLIS bir bolge
 * göstermek yerine limanin kendi adini oldugu gibi gosterir - boylece resmi
 * bir belgede sessizce hatali bilgi cikma riski olmaz, personel fark edip
 * bize haber verebilir.
 */
function buildPlantProtectionBolgesi(limanAdi: string | null | undefined): string {
  if (!limanAdi) return safe(null);
  const normalized = limanAdi.toUpperCase().trim().replace(/İ/g, "I");
  const ambarliGrubu = ["MARPORT", "MARDAŞ", "MARDAS", "KUMPORT", "AMBARLI", "AMBARLI PORT"];
  const asyaportGrubu = ["ASYAPORT"];
  if (ambarliGrubu.some((p) => normalized.includes(p))) return "ISTANBUL / AMBARLI";
  if (asyaportGrubu.some((p) => normalized.includes(p))) return "TEKİRDAĞ / ASYAPORT";
  return escapeHtml(limanAdi.trim()); // Bilinmeyen liman - oldugu gibi goster
}

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

const SHEET_WIDTH = 800;
const SHEET_HEIGHT = Math.round(SHEET_WIDTH * (1556 / 1100)); // 1132, ayni A4 orani

const PHYTO_TEMPLATE = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Phytosanitary Certificate __LOT_NR__</title>
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
  #f-exporter    { top: 8.5%;  left: 7.5%;  width: 40%;  font-size: 11px; }
  #f-consignee   { top: 20.5%; left: 7.5%;  width: 40%;  font-size: 11px; }
  #f-ppo         { top: 21%;   left: 51%;   width: 46%;  font-size: 11px; }
  #f-origin      { top: 27.0%; left: 51%;   width: 46%;  font-size: 11.5px; }
  #f-conveyance  { top: 32.5%; left: 7.5%;  width: 40%;  font-size: 11px; }
  #f-entry       { top: 36.7%; left: 7.5%;  width: 40%;  font-size: 11px; }
  #f-item        { top: 42.5%; left: 9%;    width: 56%;  font-size: 11px; line-height: 1.6; }
  #f-quantity    { top: 44%;   left: 70%;   width: 25%;  font-size: 11.5px; text-align: center; }

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
    <img class="bg-img" src="${PHYTO_BACKGROUND_BASE64}" alt="">
    <div class="veri" id="f-exporter">__EXPORTER__</div>
    <div class="veri" id="f-consignee">__CONSIGNEE__</div>
    <div class="veri" id="f-ppo">__PPO_BOLGE__</div>
    <div class="veri" id="f-origin">TÜRKİYE</div>
    <div class="veri" id="f-conveyance">BY SHIP / CONTAINERS __KONTEYNER_ADEDI__</div>
    <div class="veri" id="f-entry">__GEMI_ADI__ / __SEFER_NO__</div>
    <div class="veri" id="f-item">__URUN_TANIMI__ /Triticum sp.
__AMBALAJ__
LOT NR : __LOT_NR__
REF NR : __REF_NR__</div>
    <div class="veri" id="f-quantity">GROSS: __GROSS__<br>NET: __NET__</div>
  </div>
</body>
</html>`;

export function buildPhytosanitaryCertificateHtml(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[]
): string {
  const rez = rezervasyonlar[0];
  const limanAdi = dosya.yuklenme_limani || rez?.yuklenme_limani;

  const replacements: Record<string, string> = {
    EXPORTER:        escapeHtml(`${COMPANY_NAME}\n${COMPANY_ADDRESS}`),
    CONSIGNEE:       safe(dosya.consignee),
    PPO_BOLGE:       buildPlantProtectionBolgesi(limanAdi),
    KONTEYNER_ADEDI: safe(konteynerler.length || null, ""),
    GEMI_ADI:        safe(rez?.gemi_adi),
    SEFER_NO:        safe(rez?.sefer_no),
    URUN_TANIMI:     safe(dosya.urun_tanimi),
    AMBALAJ:         safe(dosya.detayli_ambalaj || dosya.ambalaj),
    LOT_NR:          safe(dosya.lot_no),
    REF_NR:          safe(rez?.booking_no),
    NET:             buildNetAgirlikToplam(konteynerler),
    GROSS:           buildBrutAgirlikToplam(konteynerler),
  };

  let html = PHYTO_TEMPLATE;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`__${key}__`).join(value);
  }
  return html;
}
