import { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { formatCurrency, formatDateTR, limanAdiAyikla, detayliAmbalajCokluSegmentli, hesaplaFobFreightCifToplamlari } from "@/lib/cutoff-utils";
import { IMZA_HARUN, LOGO_UNEX } from "@/lib/imzalar";

/**
 * HTML ozel karakterlerini kacisliyor (XSS / goruntu bozulmasi onlemi).
 * Firma adi, adres gibi serbest metin alanlari her zaman bu fonksiyondan gecmeli.
 */
function escapeHtml(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Bos/null/undefined deger icin guvenli fallback. Her zaman escapeHtml ile sarilir.
 *  Literal "\n" karakter dizisini (kacis karakteri olarak yanlislikla kaydedilmis
 *  satir sonlari) gercek satir sonuna cevirir, boylece white-space: pre-line dogru calisir. */
function safe(value: string | number | null | undefined, fallback = "-"): string {
  if (value === null || value === undefined || value === "") return escapeHtml(fallback);
  const normalized = String(value).replace(/\\n/g, "\n");
  return escapeHtml(normalized);
}
/** Unex Gida'nin sabit iletisim bilgileri - her belgede ayni, proformadan okunmaz. */
const SATICI_SABIT_ADRES = "İstiklal Mahallesi Cemal Ünlüsaraç Caddesi\nNo:20, P.O.Box:59200, Süleymanpaşa\nTekirdağ, Türkiye";
const SATICI_SABIT_TEL = "0546 468 79 60";
const SATICI_SABIT_EMAIL = "export@unex.com.tr";

const COMMERCIAL_INVOICE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Commercial Invoice __INVOICE_NO__</title>
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
     ve sag kolon (logo+firma+Total Amount Payable) kendi icerigine gore dogal
     yukseklikte akar - biri uzun biri kisa olsa da birbirini ITMEZ, cunku
     ikisi de ayni .header flex container'inin esit seviyedeki cocuklaridir.
     Negatif margin KULLANILMAZ - icerik miktarina bagli olarak kirilgan olur. */
  .header { display: flex; justify-content: flex-start; align-items: flex-start; margin-bottom: 4px; }
  .header-left { flex: 1; }
  .invoice-title { display: inline-block; background: #ECECEC; font-weight: bold; font-size: 16px; padding: 6px 16px; margin-bottom: 6px; }
  .meta-row { display: flex; margin-bottom: 2px; }
  .meta-label { width: 90px; font-weight: bold; }
  .meta-value { flex: 1; }
  .header-right { text-align: center; min-width: 260px; max-width: 420px; margin-right: 20px; }
  .logo-slot img { max-width: 200px; max-height: 100px; object-fit: contain; }
  .logo-slot { margin-bottom: 5px; text-align: center; }
  .buyer-box { text-align: center; margin-bottom: 6px; }
  .buyer-box .name { font-weight: bold; }
  .buyer-box div { white-space: pre-line; }

  /* TOTAL AMOUNT PAYABLE: artik header-right'in ICINDE, logo+firma blogunun
     hemen altinda - sabit, kararli konum, sol kolonun yuksekliginden bagimsiz. */
  .total-payable-row { display: flex; justify-content: center; }
  .total-payable-box { background: #ECECEC; padding: 6px 14px; text-align: center; width: fit-content; }
  .total-payable-box .label { font-size: 10px; font-weight: bold; text-transform: uppercase; margin-bottom: 2px; }
  .total-payable-box .value { font-size: 18px; font-weight: bold; }

  .parties-block { margin-top: 4px; margin-bottom: 4px; }
  .party-row { margin-bottom: 3px; }
  .party-label { font-weight: bold; margin-bottom: 2px; }
  .party-value { white-space: pre-line; }
  .kv-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .kv-table tr:nth-child(even) { background: #F7F7F7; }
  .kv-table td { padding: 2.5px 10px; border: 1px solid #DADADA; vertical-align: top; }
  .kv-table td.k { background: #ECECEC; font-weight: bold; width: 180px; }
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 2px; }
  .items-table th { background: #ECECEC; font-weight: bold; text-align: center; padding: 4px 8px; border: 1px solid #DADADA; font-size: 10px; }
  .items-table td { padding: 4px 8px; border: 1px solid #DADADA; }
  .items-table td.num { text-align: right; }
  .totals-block { display: flex; justify-content: flex-end; margin-bottom: 6px; }
  .totals-block table { border-collapse: collapse; }
  .totals-block td { padding: 4px 12px; font-size: 11px; border: 1px solid #DADADA; }
  .totals-block td.label { font-weight: bold; text-align: right; background: #ECECEC; min-width: 140px; }
  .totals-block td.value { text-align: right; min-width: 110px; background: #FFFFFF; }
  .totals-block tr.grand-total td { font-weight: bold; font-size: 12px; }
  .bank-table { margin-top: 0; }
  .signature-block { display: flex; justify-content: flex-start; margin: 10px 0 6px 0; margin-top: auto; }
  .stamp-slot img { max-width: 180px; max-height: 130px; object-fit: contain; }
  .footer-note { text-align: center; font-size: 8.5px; font-weight: bold; line-height: 1.5; border-top: 1px solid #DADADA; padding-top: 4px; margin-top: 4px; }
  .print-hint { background: #FEF3C7; border: 1px solid #FDE68A; color: #92400E; padding: 10px 14px; font-size: 11px; margin-bottom: 16px; border-radius: 6px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #FFFFFF; padding: 0; }
    /* min-height: 1000px eskiden burada da uygulanmaya devam ediyordu - ekranda
       kisa belgeleri bile "tam sayfa" gostermek icin var, ama yazdirirken
       gercek icerik zaten kisa sayfayi doldurmuyorsa bile bu sabit yukseklik
       basilabilir alani gereksiz yere tuketip asagidaki oto-sigdirma script'inin
       hesabini saptiriyordu. Yazdirirken tamamen kaldirilir; gercek yukseklik
       neyse odur. */
    .sheet { box-shadow: none; padding: 0; width: auto; min-height: 0; }
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
        <div class="invoice-title">Commercial Invoice</div>
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
        <div class="total-payable-row">
          <div class="total-payable-box">
            <div class="label">Total Amount Payable</div>
            <div class="value">__ODENECEK_TUTAR__</div>
          </div>
        </div>
      </div>
    </div>

    <table class="kv-table">
      <tr><td class="k">BL</td><td>__BL_NO__</td></tr>
      <tr><td class="k">BRAND</td><td>__MARKA__</td></tr>
      <tr><td class="k">PACKAGING</td><td>__DETAYLI_AMBALAJ__</td></tr>
      <tr><td class="k">SHIPMENT METHOD</td><td>__SEVKIYAT_YONTEMI__</td></tr>
      <tr><td class="k">SHIPMENT TERMS</td><td>__TESLIM_SEKLI__ __VARIS_LIMANI__</td></tr>
      <tr><td class="k">PAYMENT TERMS</td><td>__ODEME_SEKLI__</td></tr>
      <tr><td class="k">LOT NUMBER</td><td>__LOT_NO__</td></tr>
      <tr><td class="k">CONTAINER NUMBERS</td><td>__KONTEYNER_NUMARALARI__</td></tr>
    </table>

    <table class="items-table">
      <thead>
        <tr>
          <th style="text-align:left;">DESCRIPTION OF GOODS</th>
          <th>PACKAGING SIZE</th>
          <th>QUANTITY (MTS)</th>
          <th>UNIT PRICE (USD/MTS)</th>
          <th>TOTAL AMOUNT</th>
        </tr>
      </thead>
      <tbody>
        __URUN_SATIRLARI__
      </tbody>
    </table>

    <div class="totals-block">
      <table>
        __ECTN_SATIRLARI__
        <tr><td class="label">ADVANCE PAYMENT</td><td class="value">__AVANS_TUTARI__</td></tr>
        <tr class="grand-total"><td class="label">TOTAL</td><td class="value">__TOPLAM_TUTAR__</td></tr>
      </table>
    </div>

    <table class="kv-table bank-table">
      <tr><td class="k">ACCOUNT TITLE</td><td>__HESAP_ADI__</td></tr>
      <tr><td class="k">BANK NAME</td><td>__BANKA__</td></tr>
      <tr><td class="k">SWIFT CODE</td><td>__SWIFT__</td></tr>
      <tr><td class="k">ACCOUNT NUMBER</td><td>__HESAP_NUMARASI__</td></tr>
      <tr><td class="k">IBAN NO</td><td>__IBAN__</td></tr>
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

function buildUrunSatirlari(dosya: Dosya): string {
  const urunler = (dosya.urun_detaylari as any[]) || [];
  if (urunler.length === 0) {
    return `<tr><td colspan="5" style="text-align:center; color:#999;">Urun bilgisi bulunmuyor</td></tr>`;
  }
  return urunler
    .map((u: any) => {
      const ad = safe(u.urun_adi || u.description, "-");
      const ambalajBoyutu = safe(u.ambalaj_boyutu || u.packaging_size, "-");
      const miktar = u.miktar_mts || u.quantity || 0;
      const birimFiyat = parseFloat(String(u.birim_fiyat_usd || u.unit_price || 0));
      const toplam = parseFloat(String(u.toplam_tutar_usd || u.total_amount || 0));
      return `<tr>
        <td>${ad}</td>
        <td class="num">${ambalajBoyutu}</td>
        <td class="num">${safe(miktar)}</td>
        <td class="num">${escapeHtml(formatCurrency(birimFiyat, dosya.para_birimi))}</td>
        <td class="num">${escapeHtml(formatCurrency(toplam, dosya.para_birimi))}</td>
      </tr>`;
    })
    .join("\n");
}

function buildKonteynerNumaralari(konteynerler: Konteyner[]): string {
  if (!konteynerler || konteynerler.length === 0) return safe(null);
  return escapeHtml(konteynerler.map((k) => k.konteyner_no).join(", "));
}

function buildSevkiyatYontemi(konteynerler: Konteyner[]): string {
  if (!konteynerler || konteynerler.length === 0) return safe(null);
  const tipSayilari: Record<string, number> = {};
  konteynerler.forEach((k) => {
    const tip = k.tip || "Container";
    tipSayilari[tip] = (tipSayilari[tip] || 0) + 1;
  });
  return escapeHtml(
    Object.entries(tipSayilari)
      .map(([tip, adet]) => `${adet} * ${tip} Containers`)
      .join(", ")
  );
}

/**
 * Detayli ambalaj metnini (proformadan AI ile okunan, orn. "30,000 pieces of 25kg PP bags")
 * baslangicindaki sayiyi, kullanicinin Konteynerler sekmesinde girdigi gercek "Kap Adeti"
 * toplamiyla degistirerek dondurur. Cumlenin geri kalani (birim aciklamasi) aynen korunur.
 */
/**
 * Ayni dosyada birden fazla marka/urun olabilir (ornegin SAAD + ASLI ayni
 * konteyner setinde). Konteynerlerin KENDI marka alanlarindaki farkli
 * degerleri birlestirip gosterir (ör. "SAAD & ASLI"). Hicbir konteynerde
 * marka girilmemisse, eskisi gibi dosya.marka'ya (tek deger) doner.
 */
function buildMarkaListesi(dosya: Dosya, konteynerler: Konteyner[]): string {
  const markalar = Array.from(
    new Set((konteynerler || []).map((k) => (k as any).marka).filter((m): m is string => !!m && String(m).trim() !== ""))
  );
  if (markalar.length === 0) return safe(dosya.marka);
  return escapeHtml(markalar.join(" & "));
}

function buildDetayliAmbalaj(dosya: Dosya, konteynerler: Konteyner[]): string {
  const raw = dosya.detayli_ambalaj || dosya.ambalaj;
  if (!raw) return safe(null);
  // Coklu ambalaj/urun segmenti iceren metinlerde (ör. "2.000 PIECES 25 KG...,
  // 1.000 PIECES OF 50 KG...") konteynerlerin TOPLAM kap adedini metnin
  // basina yapistirmak YANLIS sonuc uretir - sistemde hangi konteynerin hangi
  // segmente ait oldugu bilgisi tutulmuyor (kok neden incelemesi: 28.09.2026,
  // IHR-2026-0081). Bu durumda metne DOKUNULMAZ, kullanicinin Dosya Detay'da
  // girdigi hali aynen gosterilir.
  if (detayliAmbalajCokluSegmentli(String(raw))) return safe(raw);
  const toplamKap = (konteynerler || []).reduce((s, k) => s + ((k as any).pieces || 0), 0);
  if (toplamKap > 0) {
    const guncellenmis = String(raw).replace(/^[\d.,]+/, toplamKap.toLocaleString("tr-TR"));
    return safe(guncellenmis);
  }
  return safe(raw);
}

export type EctnOtomatikDegerler = {
  fob: number | null;
  freight: number | null;
  cfr: number | null;
  limanAdi: string | null;
};

/**
 * ECTN satirlari icin OTOMATIK hesaplanan degerleri dondurur (manuel override
 * uygulanmadan ONCE). FREIGHT, Fatura Talimatindaki ile AYNI hesap mantigini
 * kullanir: navlun_tutari (konteyner basina) * konteyner adedi. Hem "Duzenle"
 * modalinda "Otomatik: ..." bilgisini gostermek hem de buildEctnSatirlari
 * icinde kullanicinin bos biraktigi alanlari doldurmak icin kullanilir
 * (talep: 28.09.2026).
 */
export function hesaplaEctnOtomatikDegerler(dosya: Dosya, rezervasyonlar: Rezervasyon[]): EctnOtomatikDegerler {
  // Kok neden (29.09.2026, IHR-2026-0084): burada eskiden dosya.toplam_tutar
  // (CIF toplami, navlun dahil) dogrudan "FOB" olarak, ve navlun (lokal
  // masraf dusulmeden HAM haliyle) "FREIGHT" olarak kullaniliyordu. Dogru
  // FOB = CIF - Net Navlun'dur (Net Navlun = navlun - lokal masraf). Bu artik
  // Fatura Talimati ile AYNI tek dogru kaynaktan (hesaplaFobFreightCifToplamlari)
  // hesaplaniyor. Rezervasyon sayimi BILEREK degistirilmedi: burada hala
  // sadece ilk rezervasyonun konteyner adedi kullanilir - her rezervasyon
  // ayri bir evrak seti anlamina geldigi icin (kullanici onayi: 29.09.2026).
  const rez = rezervasyonlar[0];
  const konteynerAdedi = rez?.konteyner_adedi || 0;
  const { toplamFob, netNavlunToplam } = hesaplaFobFreightCifToplamlari(dosya, konteynerAdedi);
  const fob = toplamFob;
  const freight = netNavlunToplam;
  const cfr = fob !== null && freight !== null ? fob + freight : null;
  const limanAdi = limanAdiAyikla(dosya.varis_limani);
  return { fob, freight, cfr, limanAdi };
}

export type EctnGosterilenDegerler = {
  fob: number | null;
  freight: number | null;
  insurance: number | null;
  cfr: number | null;
  limanAdi: string | null;
  cfrEtiket: string | null;
};

/**
 * ECTN basvurusu isaretli dosyalarda Commercial Invoice'a eklenen TOTAL FOB /
 * FREIGHT / INSURANCE / TOTAL CFR satirlarinin GERCEKTEN GOSTERILECEK
 * degerlerini hesaplar (override'lar uygulandiktan sonra). buildEctnSatirlari
 * (HTML satirlari) VE buildCommercialInvoiceHtml (en alttaki TOTAL / "Total
 * Amount Payable" kutusu) AYNI bu fonksiyonu kullanir - boylece TOTAL CFR
 * satirinda gorunen deger ile altindaki TOTAL/odenecek tutar bir daha
 * BIRBIRINDEN SAPAMAZ (kok neden: 29.09.2026, IHR-2026-0085 - TOTAL satiri
 * eskiden CFR'den bagimsiz, dosyanin ham CIF tutarindan hesaplaniyordu).
 *
 * Her satir icin ONCELIK: kullanicinin manuel girdigi deger (ectn_*_override,
 * doluysa) > otomatik hesaplanan deger. TOTAL CFR ozel durum: kullanici CFR'i
 * AYRICA manuel girmediyse, (olasi override edilmis) FOB + FREIGHT +
 * INSURANCE (varsa) toplamindan yeniden hesaplanir (talep: 29.09.2026 -
 * INSURANCE girildiginde TOTAL CFR'e otomatik eklensin; INSURANCE'in kendi
 * "otomatik" karsiligi yok, tamamen elle girilir). Boylece FOB veya
 * FREIGHT'i duzelten kullanici CFR'i de elle guncellemek zorunda kalmaz.
 *
 * Kok neden duzeltmesi (30.09.2026, IHR-2026-0086): dosya.toplam_tutar
 * (hesaplaEctnOtomatikDegerler'in temel aldigi CIF toplami) sigortayi DA
 * icerir - kullanici onayi: "93.600 CIF TOPLAM TUTAR". Otomatik FOB eskiden
 * sadece navlunu dusuyordu, sigortayi dusmuyordu; bu da INSURANCE
 * girildiginde TOTAL CFR'in orijinal CIF toplamini (dosya.toplam_tutar)
 * sigorta tutari kadar ASMASINA yol aciyordu (83.000+10.600+200=93.800,
 * oysa faturanin ust kismindaki kalem toplami hala 93.600). Bu yuzden FOB
 * kullanici tarafindan elle override EDILMEDIYSE, otomatik FOB'dan sigorta
 * da dusulur - boylece TOTAL CFR her zaman orijinal CIF toplamina esit
 * kalir. Kullanici FOB'u elle girdiyse (fobOverride doluysa) bu otomatik
 * duzeltme UYGULANMAZ - kullanicinin girdigi deger aynen kullanilir.
 *
 * Etiket (TOTAL CFR/CIF) mantigi (talep: 30.09.2026, ornek: CULVIST2601427/
 * UNEXBFB090926): Incoterm kurallarina gore INSURANCE toplama dahil
 * edildiginde bu artik CFR (Cost+Freight) degil CIF'tir (Cost+Insurance+
 * Freight). Bu yuzden etiket OTOMATIK olarak secilir: insurance doluysa
 * "TOTAL CIF <liman>", degilse "TOTAL CFR <liman>". Kullanici
 * ectn_cfr_etiket_override alanini doldurduysa bu otomatik secim ATLANIR ve
 * kullanicinin yazdigi metin AYNEN (liman adi dahil) kullanilir.
 */
export function hesaplaEctnGosterilenDegerler(dosya: Dosya, rezervasyonlar: Rezervasyon[]): EctnGosterilenDegerler {
  const otomatik = hesaplaEctnOtomatikDegerler(dosya, rezervasyonlar);
  const fobOverride = dosya.ectn_fob_override;
  const freightOverride = dosya.ectn_freight_override;
  const cfrOverride = dosya.ectn_cfr_override;
  const insuranceRaw = dosya.ectn_insurance_override;
  const insurance = insuranceRaw !== null && insuranceRaw !== undefined ? insuranceRaw : null;
  const cfrEtiketOverrideRaw = dosya.ectn_cfr_etiket_override as string | null | undefined;

  const fobOtomatikSigortaDahil =
    otomatik.fob !== null && insurance !== null ? otomatik.fob - insurance : otomatik.fob;

  const fob = fobOverride !== null && fobOverride !== undefined ? fobOverride : fobOtomatikSigortaDahil;
  const freight = freightOverride !== null && freightOverride !== undefined ? freightOverride : otomatik.freight;
  const cfr =
    cfrOverride !== null && cfrOverride !== undefined
      ? cfrOverride
      : fob !== null && freight !== null
        ? fob + freight + (insurance !== null ? insurance : 0)
        : null;

  const cfrEtiketOtomatik = otomatik.limanAdi
    ? `TOTAL ${insurance !== null ? "CIF" : "CFR"} ${otomatik.limanAdi}`
    : `TOTAL ${insurance !== null ? "CIF" : "CFR"}`;
  const cfrEtiket = cfrEtiketOverrideRaw && cfrEtiketOverrideRaw.trim() !== "" ? cfrEtiketOverrideRaw.trim() : cfrEtiketOtomatik;

  return { fob, freight, insurance, cfr, limanAdi: otomatik.limanAdi, cfrEtiket };
}

/**
 * ECTN basvurusu isaretli dosyalarda (dosya.ectn_basvurusu) Commercial
 * Invoice'a TOTAL FOB / FREIGHT / TOTAL CFR <liman> satirlari eklenir
 * (talep: 28.09.2026). Isaretli DEGILSE bos string doner - belge birebir
 * eskisi gibi kalir. Hicbir deger bilinmiyorsa satir hic gosterilmez -
 * eksik/yaniltici tutar riskini onlemek icin (talep: 28.09.2026).
 */
function buildEctnSatirlari(dosya: Dosya, rezervasyonlar: Rezervasyon[]): string {
  if (!dosya.ectn_basvurusu) return "";

  const { fob, freight, insurance, cfr, cfrEtiket } = hesaplaEctnGosterilenDegerler(dosya, rezervasyonlar);

  const satirlar: string[] = [];
  if (fob !== null && fob !== undefined) {
    satirlar.push(`<tr><td class="label">TOTAL FOB</td><td class="value">${escapeHtml(formatCurrency(fob, dosya.para_birimi))}</td></tr>`);
  }
  if (freight !== null && freight !== undefined) {
    satirlar.push(`<tr><td class="label">FREIGHT</td><td class="value">${escapeHtml(formatCurrency(freight, dosya.para_birimi))}</td></tr>`);
  }
  if (insurance !== null && insurance !== undefined) {
    satirlar.push(`<tr><td class="label">INSURANCE</td><td class="value">${escapeHtml(formatCurrency(insurance, dosya.para_birimi))}</td></tr>`);
  }
  if (cfr !== null && cfr !== undefined) {
    satirlar.push(`<tr><td class="label">${escapeHtml(cfrEtiket || "TOTAL CFR")}</td><td class="value">${escapeHtml(formatCurrency(cfr, dosya.para_birimi))}</td></tr>`);
  }
  return satirlar.join("\n");
}

/**
 * Sistemdeki dosya/rezervasyon/konteyner verilerinden Commercial Invoice
 * HTML belgesini uretir. Tum serbest metin alanlari escapeHtml'den gecer,
 * tum sayisal/tarih alanlar formatCurrency/formatDateTR ile formatlanir.
 */
export function buildCommercialInvoiceHtml(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[]
): string {
  const rez = rezervasyonlar[0];
  const toplamTutar = dosya.toplam_tutar;
  const avansTutari = (dosya.ham_veri as any)?.avans_tutari || 0;
  // ECTN isaretliyse ve TOTAL CFR satiri hesaplanabiliyorsa, belgenin en
  // altindaki TOTAL / "Total Amount Payable" kutusu artik o CFR degerinden
  // (INSURANCE dahil, override'lar uygulanmis haliyle) avansi dusuyor - dosyanin
  // ham CIF tutarindan degil. Boylece yukarida gorunen TOTAL CFR ile en alttaki
  // TOTAL bir daha birbirinden sapmaz (kok neden: 29.09.2026, IHR-2026-0085).
  // ECTN isaretli DEGILSE veya CFR hesaplanamiyorsa (ornegin FOB/FREIGHT
  // bilinmiyor), eskisi gibi ham CIF tutarindan hesaplanmaya devam eder.
  const ectnCfr = dosya.ectn_basvurusu ? hesaplaEctnGosterilenDegerler(dosya, rezervasyonlar).cfr : null;
  const odenecekTutarBazi = ectnCfr !== null ? ectnCfr : toplamTutar;
  const odenecekTutar = odenecekTutarBazi ? odenecekTutarBazi - avansTutari : null;

  const replacements: Record<string, string> = {
    INVOICE_NO: safe(dosya.fatura_no),
    INVOICE_DATE: dosya.fatura_tarihi ? escapeHtml(formatDateTR(dosya.fatura_tarihi)) : safe(null),
    SATICI_FIRMA: safe(dosya.satici_firma),
    SATICI_ADRES: escapeHtml(SATICI_SABIT_ADRES),
    SATICI_TEL: escapeHtml(SATICI_SABIT_TEL),
    SATICI_EMAIL: escapeHtml(SATICI_SABIT_EMAIL),
    ODENECEK_TUTAR: odenecekTutar !== null ? escapeHtml(formatCurrency(odenecekTutar, dosya.para_birimi)) : safe(null),
    ALICI_FIRMA: safe(dosya.alici_firma),
    ALICI_ADRES: safe(dosya.alici_adresi),
    CONSIGNEE: safe(dosya.consignee),
    BL_NO: safe(dosya.bl_no),
    MARKA: buildMarkaListesi(dosya, konteynerler),
    DETAYLI_AMBALAJ: buildDetayliAmbalaj(dosya, konteynerler),
    SEVKIYAT_YONTEMI: buildSevkiyatYontemi(konteynerler),
    TESLIM_SEKLI: safe(dosya.teslim_sekli, ""),
    VARIS_LIMANI: safe(dosya.varis_limani, ""),
    ODEME_SEKLI: safe(dosya.odeme_sekli),
    LOT_NO: safe(dosya.lot_no),
    KONTEYNER_NUMARALARI: buildKonteynerNumaralari(konteynerler),
    AVANS_TUTARI: escapeHtml(formatCurrency(avansTutari, dosya.para_birimi)),
    TOPLAM_TUTAR: odenecekTutar !== null ? escapeHtml(formatCurrency(odenecekTutar, dosya.para_birimi)) : escapeHtml(formatCurrency(toplamTutar, dosya.para_birimi)),
    HESAP_ADI: safe(dosya.hesap_adi),
    BANKA: safe(dosya.banka),
    SWIFT: safe(dosya.swift),
    HESAP_NUMARASI: safe(dosya.hesap_numarasi),
    IBAN: safe(dosya.iban),
    IMZA_HARUN: IMZA_HARUN,
    LOGO: LOGO_UNEX,
  };

  let html = COMMERCIAL_INVOICE_TEMPLATE;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.split(`__${key}__`).join(value);
  }
  html = html.replace("__URUN_SATIRLARI__", buildUrunSatirlari(dosya));
  html = html.replace("__ECTN_SATIRLARI__", buildEctnSatirlari(dosya, rezervasyonlar));

  return html;
}
