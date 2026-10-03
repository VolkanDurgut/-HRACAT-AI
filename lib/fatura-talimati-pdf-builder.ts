import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { ROBOTO_TR_BASE64 } from "@/lib/fonts/roboto-tr-base64";
import { UNEX_LOGO_BASE64 } from "@/lib/images/unex-logo-base64";
import { formatCurrency, formatDateTR, formatCutoffSaat, formatCutoffTarihUzun, formatBirimFiyatKg, ulkeAyikla, formatDiibBilgisi, hesaplaFobFreightCifToplamlari } from "@/lib/cutoff-utils";
import { FATURA_TALIMATI_SABIT_BANKA } from "@/lib/supabase/constants";
import { kalemMiktari } from "@/lib/sayi-oku";

const LACIVERT: [number, number, number] = [30, 42, 74];
const GRI: [number, number, number] = [110, 110, 110];

/** Dosya adi icin guvenli (Turkce karakter/bosluk icermeyen) kisa ad uretir. */
function guvenliDosyaAdi(dosyaNo: string | null | undefined): string {
  const ham = dosyaNo || "dosya";
  return ham.replace(/[^a-zA-Z0-9_-]/g, "_");
}

type Satir = [string, string | number | null | undefined];

/**
 * Tek bir cizim denemesi: verilen "olcek" (1.0 = tam boy) ile PDF'i bastan
 * sona cizer ve son Y konumunu dondurur. Dis fonksiyon bunu farkli
 * olceklerle tekrar tekrar cagirarak icerigin TEK SAYFAYA sigdigi en buyuk
 * olcegi bulur (jsPDF cizimi geri alinamadigi icin her denemede belge
 * sifirdan olusturulur - ucuz bir islem oldugundan performans sorunu yaratmaz).
 */
function ciz(
  dosya: Dosya,
  rezervasyonlar: Rezervasyon[],
  konteynerler: Konteyner[],
  olcek: number
): { doc: jsPDF; sayfaSayisi: number } {
  const doc = new jsPDF();
  doc.addFileToVFS("Roboto-Regular.ttf", ROBOTO_TR_BASE64);
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFont("Roboto-Regular.ttf", "Roboto", "bold");
  doc.setFont("Roboto");

  const rez = rezervasyonlar[0];
  const rezervasyonKonteynerAdedi = rezervasyonlar.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);

  // Net/Brut toplamlari en basta hesaplanir: hem DOSYA BILGILERI'ndeki ozet
  // satirinda (muhasebe talebi: ayri, tek bakista gorulur bir satir), hem de
  // asagidaki Konteyner tablosunun TOPLAM satirinda kullanilir - iki yerde de
  // AYNI degerin gosterildiginden emin olmak icin tek noktadan hesaplanir.
  const toplamNetKg = konteynerler.reduce((s, k) => s + (k.net_agirlik_kg || 0), 0);
  const toplamBrutKg = konteynerler.reduce((s, k) => s + ((k as any).brut_agirlik_kg || 0), 0);

  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - marginX * 2;

  // --- BASLIK: logo + firma adi + "FATURA TALIMATI" + konu satiri ---
  doc.addImage(UNEX_LOGO_BASE64, "PNG", marginX, 10, 16, 16);
  doc.setFont("Roboto", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...LACIVERT);
  doc.text("FATURA TALIMATI", marginX + 20, 17);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRI);
  doc.text(dosya.satici_firma || "", marginX + 20, 22.5);

  doc.setDrawColor(...LACIVERT);
  doc.setLineWidth(0.6);
  doc.line(marginX, 29, pageWidth - marginX, 29);

  const konu = [dosya.dosya_no, dosya.alici_firma, rezervasyonKonteynerAdedi ? `${rezervasyonKonteynerAdedi}x` : null, dosya.varis_limani]
    .filter(Boolean)
    .join("  |  ");
  doc.setFontSize(8.5 * olcek);
  doc.setTextColor(...GRI);
  doc.text(konu, marginX, 34);

  let y = 39;
  const fontBoyu = 8 * olcek;
  const hucreDolgu = 1.3 * olcek;
  // Tablolar arasi bosluk ve autoTable'in "sayfa sonuna yaklasti" esigi
  // (margin.bottom) - "olcek" ile birlikte KUCULMEDIKLERI icin cok
  // konteynerli dosyalarda bosa giden alan biriktirip PDF'i sessizce ikinci
  // sayfaya tasiriyordu (kok neden: sadece yazi tipi/hucre dolgusu
  // kuculuyordu, bu iki bosluk sabit kaliyordu). Artik ikisi de olcekle
  // birlikte kuculuyor.
  const tablolarArasiBosluk = Math.max(1.2, 3 * olcek);
  const tabloAltMargin = Math.max(3, 10 * olcek);

  // --- Etiket:Deger bolumu (2 kolonlu, basligi renkli bir kart) ---
  const bolumTablosu = (baslik: string, satirlar: Satir[]) => {
    const rows = satirlar.filter(
      (r): r is [string, string | number] => r[1] !== null && r[1] !== undefined && r[1] !== "" && r[1] !== "-"
    );
    if (rows.length === 0) return;
    autoTable(doc, {
      startY: y,
      head: [[{ content: baslik, colSpan: 2 }]],
      body: rows.map(([label, deger]) => [label, String(deger)]),
      theme: "grid",
      styles: { font: "Roboto", fontSize: fontBoyu, cellPadding: hucreDolgu, textColor: [30, 30, 30], lineColor: [210, 210, 210], lineWidth: 0.15 },
      headStyles: { fillColor: LACIVERT, textColor: 255, fontStyle: "bold", fontSize: fontBoyu + 0.5 },
      columnStyles: { 0: { cellWidth: 48, fontStyle: "bold", textColor: [70, 70, 70] }, 1: { cellWidth: contentWidth - 48 } },
      margin: { left: marginX, right: marginX, bottom: tabloAltMargin },
    });
    y = (doc as any).lastAutoTable.finalY + tablolarArasiBosluk;
  };

  bolumTablosu("DOSYA BILGILERI", [
    ["Lot No", dosya.lot_no],
    ["Alici Firma", dosya.alici_firma],
    ["Satici Firma", dosya.satici_firma],
    ["Marka", dosya.marka],
    ["Proforma No", dosya.proforma_no],
    ["Ambalaj", dosya.detayli_ambalaj || dosya.ambalaj],
    // Muhasebe talebi: Net/Brut agirlik, konteyner tablosuna girmeden de tek
    // bakista gorulebilsin diye burada ayrica ozetlenir.
    ["Net Agirlik", toplamNetKg ? `${toplamNetKg.toLocaleString("tr-TR")} KG` : null],
    ["Brut Agirlik", toplamBrutKg ? `${toplamBrutKg.toLocaleString("tr-TR")} KG` : null],
  ]);

  const beyannameSuresi = rez?.beyanname_cutoff
    ? `${formatCutoffTarihUzun(rez.beyanname_cutoff)} ${formatCutoffSaat(rez.beyanname_cutoff)}`
    : null;
  bolumTablosu("LOJISTIK BILGILERI", [
    ["Yukleme Limani", rez?.yuklenme_limani || dosya.yuklenme_limani],
    ["Varis Limani", dosya.varis_limani],
    ["Ulke", ulkeAyikla(dosya.varis_limani)],
    ["Teslim Sekli", dosya.teslim_sekli],
    ["Odeme Sekli", dosya.gumruk_odeme_sekli],
    ["Gemi Adi", rez?.gemi_adi],
    ["Acente", rez?.acente_ismi],
    ["Booking No", rez?.booking_no ? rez.booking_no.trim() : null],
    ["Beyanname Teslim Suresi", beyannameSuresi],
  ]);

  // Navlun/Lokal Masraf birim-toplam ve CIF/FOB toplamlari - TEK DOGRU KAYNAK:
  // hesaplaFobFreightCifToplamlari (bkz. lib/cutoff-utils.ts). Commercial
  // Invoice'taki ECTN satirlari da AYNI fonksiyonu kullanir - iki belgenin
  // sessizce birbirinden sapmasini (kok neden incelemesi: 29.09.2026,
  // IHR-2026-0084) bir daha yasanmayacak sekilde onler.
  const navlunBirim = dosya.navlun_tutari;
  const lokalMasrafBirim = dosya.lokal_masraf_tutari as number | null;
  const navlunToplam = navlunBirim && rezervasyonKonteynerAdedi > 0 ? navlunBirim * rezervasyonKonteynerAdedi : null;
  const lokalMasrafToplam = lokalMasrafBirim && rezervasyonKonteynerAdedi > 0 ? lokalMasrafBirim * rezervasyonKonteynerAdedi : null;
  const { toplamCif, netNavlunToplam, toplamFob } = hesaplaFobFreightCifToplamlari(dosya, rezervasyonKonteynerAdedi);
  bolumTablosu("MALIYET VE BANKA BILGILERI", [
    ["Navlun (Konteyner Basina)", navlunBirim != null ? formatCurrency(navlunBirim, dosya.para_birimi) : null],
    ["Toplam Navlun Fiyati", netNavlunToplam !== null ? formatCurrency(netNavlunToplam, dosya.para_birimi) : null],
    ["Lokal Masraflar (Konteyner Basina)", lokalMasrafBirim != null ? formatCurrency(lokalMasrafBirim, dosya.para_birimi) : null],
    // Talep: Fatura Talimatinda Araci Banka HER ZAMAN sabit (dosya.banka
    // DEGIL) - proformada/Commercial Invoice'ta gosterilen banka bundan
    // etkilenmez, o alan bagimsiz kalir.
    ["Araci Banka", FATURA_TALIMATI_SABIT_BANKA],
  ]);

  // --- Urun ve Fiyat tablosu (CIF/FOB) ---
  const urunler = (dosya.urun_detaylari as any[]) || [];
  const toplamMiktar = urunler.reduce((s, u) => s + kalemMiktari(u), 0);
  // toplamCif/toplamFob yukarida hesaplaFobFreightCifToplamlari'ndan geldi -
  // burada sadece TABLODAKI HER SATIRIN kendi FOB birim fiyatini bulmak icin
  // ayni "dusulecek" mantigi tekrar kuruluyor (bu kisim urun bazli oldugu
  // icin paylasilan fonksiyonun kapsami disinda kalir).
  const toplamDusulecek =
    navlunToplam !== null && lokalMasrafToplam !== null ? navlunToplam - lokalMasrafToplam : navlunToplam !== null ? navlunToplam : 0;
  const dusulecekVarMi = navlunToplam !== null || lokalMasrafToplam !== null;
      const dusulecekPerMts = dusulecekVarMi && toplamMiktar > 0 ? toplamDusulecek / toplamMiktar : 0;

  const urunRows = urunler.map((u) => {
    const ad = u.urun_adi || u.description || "Urun";
    const ambalajBoyutu = u.ambalaj_boyutu || u.packaging_size || "-";
    const cifBirim = parseFloat(String(u.birim_fiyat_usd || u.unit_price || 0));
        const fobBirim = dusulecekVarMi ? cifBirim - dusulecekPerMts : null;
    // Muhasebe talebi: birim fiyatlar burada KG basina, virgullu 3 ondalikli
    // ve para birimi sembolsuz gosterilir (orn. "0,460") - sistemde TON (MT)
    // basina tutulan deger degismez, sadece bu tablodaki goruntuleme boyle.
    return [ad, ambalajBoyutu, formatBirimFiyatKg(cifBirim), fobBirim !== null ? formatBirimFiyatKg(fobBirim) : "-"];
  });

  if (urunRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [
            [{ content: "URUN VE FIYAT BILGILERI", colSpan: 4 }],
            [
              { content: "Urun", styles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "normal" } },
              { content: "Ambalaj", styles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "normal" } },
              { content: `CIF Birim Fiyat (${dosya.para_birimi || "USD"}/KG)`, styles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "normal" } },
              { content: `FOB Birim Fiyat (${dosya.para_birimi || "USD"}/KG)`, styles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "normal" } },
            ],
          ],
      body: urunRows,
      theme: "grid",
      styles: { font: "Roboto", fontSize: fontBoyu, cellPadding: hucreDolgu },
      headStyles: { fillColor: LACIVERT, textColor: 255, fontStyle: "bold", fontSize: fontBoyu + 0.5 },
      foot: [
        [
          "Toplam",
          "",
          `${formatCurrency(toplamCif, dosya.para_birimi)} ${dosya.para_birimi || "USD"}`,
          toplamFob !== null ? `${formatCurrency(toplamFob, dosya.para_birimi)} ${dosya.para_birimi || "USD"}` : "-",
        ],
      ],
      footStyles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "bold", fontSize: fontBoyu },
      margin: { left: marginX, right: marginX, bottom: tabloAltMargin },
    });
    y = (doc as any).lastAutoTable.finalY + tablolarArasiBosluk;
  }

  // --- Konteyner tablosu (gercek sutunlu tablo + TOPLAM satiri) ---
  if (konteynerler.length > 0) {
    // toplamNetKg/toplamBrutKg yukarida, fonksiyonun basinda hesaplandi
    // (DOSYA BILGILERI ozet satiriyla ayni degeri paylasmak icin).
    const toplamKap = konteynerler.reduce((s, k) => s + ((k as any).pieces || 0), 0);
    const toplamVgm = konteynerler.reduce((s, k) => s + ((k as any).vgm_kg || 0), 0);

    const kRows = konteynerler.map((k, i) => [
      i + 1,
      k.konteyner_no,
      k.muhur_no || "-",
      k.tip || "-",
      (k as any).marka || "-",
      (k as any).pieces ? Number((k as any).pieces).toLocaleString("tr-TR") : "-",
      k.net_agirlik_kg ? Number(k.net_agirlik_kg).toLocaleString("tr-TR") : "-",
      (k as any).brut_agirlik_kg ? Number((k as any).brut_agirlik_kg).toLocaleString("tr-TR") : "-",
      (k as any).vgm_kg ? Number((k as any).vgm_kg).toLocaleString("tr-TR") : "-",
      ((k as any).dba_kontrol_sonucu as any)?.tartim_tarih_saat || "-",
    ]);

    autoTable(doc, {
      startY: y,
      head: [
        [{ content: `KONTEYNER BILGILERI (${konteynerler.length} adet)`, colSpan: 10 }],
        ["#", "Konteyner No", "Muhur No", "Tip", "Marka", "Kap", "Net (KG)", "Brut (KG)", "VGM (KG)", "Tartim Tarihi"],
      ],
      body: kRows,
      foot: [[
        "", "", "", "", "TOPLAM",
        toplamKap ? toplamKap.toLocaleString("tr-TR") : "",
        // Muhasebe talebi: Net/Brut toplam degerlerinin yanina birim (KG)
        // eklendi, tek basina bir sayi olarak kalmasin.
        toplamNetKg ? `${toplamNetKg.toLocaleString("tr-TR")} KG` : "",
        toplamBrutKg ? `${toplamBrutKg.toLocaleString("tr-TR")} KG` : "",
        toplamVgm ? toplamVgm.toLocaleString("tr-TR") : "",
        "",
      ]],
      theme: "grid",
      styles: { font: "Roboto", fontSize: fontBoyu - 0.5, cellPadding: Math.max(0.3, hucreDolgu - 0.2), halign: "center", minCellHeight: 0 },
      headStyles: { fillColor: LACIVERT, textColor: 255, fontStyle: "bold", fontSize: fontBoyu },
      footStyles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "bold", fontSize: fontBoyu - 0.5 },
      columnStyles: {
        0: { cellWidth: 7 }, 1: { cellWidth: 26 }, 2: { cellWidth: 17 }, 3: { cellWidth: 11 },
        4: { cellWidth: 33, halign: "left" }, 5: { cellWidth: 12 }, 6: { cellWidth: 16 }, 7: { cellWidth: 16 }, 8: { cellWidth: 16 }, 9: { cellWidth: 28 },
      },
      margin: { left: marginX, right: marginX, bottom: tabloAltMargin },
    });
    y = (doc as any).lastAutoTable.finalY + tablolarArasiBosluk;
  }

  bolumTablosu("EVRAK VE TARIH BILGILERI", [
    ["Beyanname No", dosya.beyanname_no],
    ["BL No", dosya.bl_no],
    ["Diib Bilgisi", formatDiibBilgisi(dosya.diib_no, dosya.diib_tarihi)],
    ["Uretim Tarihi", dosya.uretim_tarihi ? formatDateTR(dosya.uretim_tarihi) : null],
    ["Son Kullanim Tarihi", dosya.son_kullanim_tarihi ? formatDateTR(dosya.son_kullanim_tarihi) : null],
  ]);

  return { doc, sayfaSayisi: doc.getNumberOfPages() };
}

/**
 * Fatura Talimatini, sistemdeki guncel dosya/rezervasyon/konteyner verisinden
 * dogrudan, logo ve bolumlere ayrilmis bir "kart" tasarimiyla tek sayfalik
 * gercek bir PDF olarak uretir ve tarayicida indirir. Icerik uzunsa (cok
 * konteyner/urun veya uzun metinler varsa) yazi boyutu VE tablolar arasi
 * bosluklar, tek sayfaya sigana kadar kademeli olarak kucultulur.
 *
 * Kok neden duzeltmesi (30.09.2026): eskiden sadece yazi tipi/hucre dolgusu
 * kucultuluyordu, tablolar arasi bosluk ve autoTable'in "sayfa sonuna
 * yaklasti" esigi (margin.bottom) SABIT kaliyordu - bu da coklu konteynerli
 * (~50+) dosyalarda PDF'in, adim %55'e (eski taban) ulasir ulasmaz henuz
 * sigmamisken sessizce 2. sayfaya (genelde sadece EVRAK VE TARIH BILGILERI
 * bolumunu tek basina tasiyarak) tasmasina yol aciyordu. Artik hem yazi tipi
 * hem bu iki bosluk birlikte, daha ince adimlarla kucultuluyor - boylece
 * ayni okunabilirlik seviyesinde cok daha fazla konteyner tek sayfaya sigiyor.
 * Gercekci is hacimlerinin (birkaç yuz konteynere kadar) neredeyse tamami tek
 * sayfada kalir; olagandisi derecede buyuk bir dosyada en dusuk olcekte bile
 * sigmazsa, PDF okunmaz hale gelmemesi icin kucultmeyi tabanda durdurur ve
 * autoTable geri kalanini (basligi tekrarlayarak) 2. sayfaya tasar - bu,
 * kucultmenin durdugu NADIR bir emniyet supabidir, olagan davranis degildir.
 */
export function indirFaturaTalimatiPdf(dosya: Dosya, rezervasyonlar: Rezervasyon[], konteynerler: Konteyner[]): void {
  let olcek = 1.0;
  let sonuc = ciz(dosya, rezervasyonlar, konteynerler, olcek);
  while (sonuc.sayfaSayisi > 1 && olcek > 0.5) {
    olcek = Math.round((olcek - 0.02) * 100) / 100;
    sonuc = ciz(dosya, rezervasyonlar, konteynerler, olcek);
  }
  sonuc.doc.save(`Fatura_Talimati_${guvenliDosyaAdi(dosya.dosya_no)}.pdf`);
}