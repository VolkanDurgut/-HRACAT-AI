// Uretilen HTML evraklara (Commercial Invoice, Packing List, Fumigation Cert.)
// "DRAFT" filigrani eklemek/kaldirmak icin ortak modul.
//
// TASARIM KARARI: "Orijinali Olustur" islemi, dosyayi sifirdan yeniden URETMEZ.
// Bunun yerine, musterinin onayladigi TASLAGIN AYNISINI alip sadece filigranini
// kaldirir. Boylece musteriye gonderilen orijinal, onayladigi taslaktan asla
// farkli olmaz (ihracat/gumruk/banka evraklarinda bu tutarlilik kritik onemde).
//
// Guvenilir kaldirma icin filigran, HTML yorum satiri isaretleyicileri arasina
// eklenir - kaldirma islemi bu iki isaretleyici arasindaki her seyi siler,
// kirilgan CSS/HTML eslestirmesine ihtiyac duymaz.

const FILIGRAN_BASLANGIC = "<!-- DRAFT-FILIGRAN-BASLANGIC -->";
const FILIGRAN_BITIS = "<!-- DRAFT-FILIGRAN-BITIS -->";

const FILIGRAN_CSS = `${FILIGRAN_BASLANGIC}
<style>
  .draft-filigran-katmani {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-35deg);
    font-size: 88px;
    font-weight: 800;
    color: rgba(190, 30, 30, 0.13);
    letter-spacing: 14px;
    pointer-events: none;
    user-select: none;
    z-index: 999;
    white-space: nowrap;
    font-family: Arial, Helvetica, sans-serif;
  }
  @media print {
    .draft-filigran-katmani { color: rgba(190, 30, 30, 0.16); }
  }
</style>
${FILIGRAN_BITIS}`;

/**
 * Uretilen HTML evraga "DRAFT" filigrani ekler.
 * .sheet sinifina position:relative eklenir (watermark'in dogru konumlanmasi icin)
 * ve .sheet'in ilk cocugu olarak filigran div'i eklenir.
 */
export function draftFiligranEkle(html: string): string {
  let sonuc = html.replace(/(\.sheet\s*\{)/, "$1\n    position: relative;");
  sonuc = sonuc.replace("</head>", `${FILIGRAN_CSS}</head>`);
  sonuc = sonuc.replace(
    /(<div class="sheet"[^>]*>)/,
    `$1${FILIGRAN_BASLANGIC}<div class="draft-filigran-katmani">DRAFT</div>${FILIGRAN_BITIS}`
  );
  return sonuc;
}

/**
 * Daha once draftFiligranEkle ile eklenmis filigrani, isaretleyiciler arasindaki
 * her seyi silerek kaldirir. Isaretleyici yoksa (zaten filigransizsa) HTML'i
 * oldugu gibi dondurur - guvenli, hata firlatmaz.
 */
export function draftFiligranKaldir(html: string): string {
  const desen = new RegExp(`${FILIGRAN_BASLANGIC}[\\s\\S]*?${FILIGRAN_BITIS}`, "g");
  return html.replace(desen, "");
}