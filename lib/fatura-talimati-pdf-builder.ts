import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { ROBOTO_TR_BASE64 } from "@/lib/fonts/roboto-tr-base64";
import { UNEX_LOGO_BASE64 } from "@/lib/images/unex-logo-base64";
import { formatCurrency, formatDateTR, formatCutoffSaat, formatCutoffTarihUzun, formatBirimFiyatKg, formatFobBirimFiyatKg, fobBirimFiyati, ulkeAyikla, formatDiibBilgisi, hesaplaFobFreightCifToplamlari } from "@/lib/cutoff-utils";
import { gidecegiUlke, dosyaTicaretUlkesi, TICARET_ULKESI_BELIRSIZ } from "@/lib/ulke-bul";
import { faturaTalimatiBankasi } from "@/lib/supabase/constants";
import { bayrakPng } from "@/lib/bayraklar";
import { faturaBolunmesi, parcaAgirliklari, parcaAgirlikMetni, type TalimatParcaGirdisi } from "@/lib/diib/bolunme-talimat";
import { kalemMiktari } from "@/lib/sayi-oku";
import { urunKonteynerDagilimi } from "@/lib/urun-konteyner-dagilimi";
import { gercekMarkalar, markayaUyarla } from "@/lib/urun-tanimi";

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
  olcek: number,
  on = false,
  bolunme: TalimatParcaGirdisi[] = [],
  bayrak: string | null = null
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
  doc.text(on ? "FATURA TALIMATI (ON TALIMAT)" : "FATURA TALIMATI", marginX + 20, 17);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRI);
  doc.text(dosya.satici_firma || "", marginX + 20, 22.5);

  doc.setDrawColor(...LACIVERT);
  doc.setLineWidth(0.6);
  doc.line(marginX, 29, pageWidth - marginX, 29);

  const konu = [dosya.dosya_no, dosya.alici_firma, rezervasyonKonteynerAdedi ? `${rezervasyonKonteynerAdedi}x` : null, dosya.varis_limani, on ? "ON TALIMAT" : null]
    .filter(Boolean)
    .join("  |  ");
  doc.setFontSize(8.5 * olcek);
  doc.setTextColor(...GRI);
  doc.text(konu, marginX, 34);

  let y = 39;
  // 03.11.2026: ON TALIMAT (rezervasyon / konteyner kesinlesmeden; or. Filistin M24). Tam
  // talimatta bu kutu YOK (cizim eskisiyle birebir).
  if (on) {
    const kutuH = 11;
    doc.setFillColor(255, 247, 230);
    doc.setDrawColor(214, 140, 30);
    doc.setLineWidth(0.4);
    doc.rect(marginX, y - 1.5, contentWidth, kutuH, "FD");
    doc.setFont("Roboto", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(140, 80, 0);
    doc.text("ON FATURA TALIMATI", marginX + 3, y + 3);
    doc.setFont("Roboto", "normal");
    doc.setFontSize(7.8);
    doc.text("Rezervasyon ve konteyner bilgileri henuz kesinlesmedi. Booking, konteyner ve agirlik bilgileri belirlenince ayrica bildirilecektir.", marginX + 3, y + 7.3, { maxWidth: contentWidth - 6 });
    y += kutuH + 2;
  }
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
  // 05.11.2026: bayrakSatiri verilirse o satirin deger hucresinin basina ulke bayragi (PNG) cizilir.
  const bayrakG = 4.5 * olcek, bayrakY = 3 * olcek, bayrakBosluk = 1.6 * olcek;
  const bolumTablosu = (baslik: string, satirlar: Satir[], bayrakSatiri: string | null = null) => {
    const rows = satirlar.filter(
      (r): r is [string, string | number] => r[1] !== null && r[1] !== undefined && r[1] !== "" && r[1] !== "-"
    );
    if (rows.length === 0) return;
    const bayrakli = (row: { raw: unknown }) => !!bayrak && !!bayrakSatiri && Array.isArray(row.raw) && row.raw[0] === bayrakSatiri;
    autoTable(doc, {
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 1 && bayrakli(d.row)) {
          const pad = d.cell.styles.cellPadding as number;
          d.cell.styles.cellPadding = { top: pad, right: pad, bottom: pad, left: pad + bayrakG + bayrakBosluk };
        }
      },
      didDrawCell: (d) => {
        if (d.section === "body" && d.column.index === 1 && bayrakli(d.row) && bayrak) {
          try {
            doc.addImage(bayrak, "PNG", d.cell.x + hucreDolgu, d.cell.y + (d.cell.height - bayrakY) / 2, bayrakG, bayrakY);
            doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.1);
            doc.rect(d.cell.x + hucreDolgu, d.cell.y + (d.cell.height - bayrakY) / 2, bayrakG, bayrakY);
          } catch { /* bayrak cizilemezse belge bayraksiz kalir */ }
        }
      },
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
    ["Ambalaj", markayaUyarla(dosya.detayli_ambalaj || dosya.ambalaj, gercekMarkalar(dosya.marka, (konteynerler || []).map((k) => (k as any).marka)))],
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
    // 08.10.2026: "Ulke" ikiye ayrildi - varis limaninin ulkesi (gidecegi) ile
    // proformadaki BUYER'in ulkesi (ticaret yapilan) farkli olabilir
    // (0091: alici Ispanya, mal Kuba'ya). Bkz. lib/ulke-bul.ts
    ["Gidecegi Ulke", gidecegiUlke(dosya.varis_limani) ?? ulkeAyikla(dosya.varis_limani)],
    ["Ticaret Yapilan Ulke", dosyaTicaretUlkesi(dosya.ticaret_ulkesi, dosya.alici_adresi) ?? TICARET_ULKESI_BELIRSIZ],
    ["Teslim Sekli", dosya.teslim_sekli],
    ["Odeme Sekli", dosya.gumruk_odeme_sekli],
    ["Gemi Adi", rez?.gemi_adi],
    ["Acente", rez?.acente_ismi],
    ["Booking No", rez?.booking_no ? rez.booking_no.trim() : null],
    ["Beyanname Teslim Suresi", beyannameSuresi],
  ], "Ticaret Yapilan Ulke");

  // Navlun/Lokal Masraf birim-toplam ve CIF/FOB toplamlari - TEK DOGRU KAYNAK:
  // hesaplaFobFreightCifToplamlari (bkz. lib/cutoff-utils.ts). Commercial
  // Invoice'taki ECTN satirlari da AYNI fonksiyonu kullanir - iki belgenin
  // sessizce birbirinden sapmasini (kok neden incelemesi: 29.09.2026,
  // IHR-2026-0084) bir daha yasanmayacak sekilde onler.
  const navlunBirim = dosya.navlun_tutari;
  const lokalMasrafBirim = dosya.lokal_masraf_tutari as number | null;
  const { toplamCif, netNavlunToplam, toplamFob, fiyatlarFob } = hesaplaFobFreightCifToplamlari(dosya, rezervasyonKonteynerAdedi);
  bolumTablosu("MALIYET VE BANKA BILGILERI", [
    ["Navlun (Konteyner Basina)", navlunBirim != null ? formatCurrency(navlunBirim, dosya.para_birimi) : null],
    ["Toplam Navlun Fiyati", netNavlunToplam !== null ? formatCurrency(netNavlunToplam, dosya.para_birimi) : null],
    ["Lokal Masraflar (Konteyner Basina)", lokalMasrafBirim != null ? formatCurrency(lokalMasrafBirim, dosya.para_birimi) : null],
    // 04.11.2026: Araci Banka = proformadaki banka (dosya.banka; bkz. faturaTalimatiBankasi)
    ["Araci Banka", faturaTalimatiBankasi(dosya)],
  ]);

  // --- Urun ve Fiyat tablosu (CIF/FOB) ---
  const urunler = (dosya.urun_detaylari as any[]) || [];
  const toplamMiktar = urunler.reduce((s, u) => s + kalemMiktari(u), 0);
  // Kalem FOB birimi: toplamCif/toplamFob yukarida hesaplaFobFreightCifToplamlari'ndan geldi;
  // 16.11.2026: her kalemin CIF biriminden TON BASINA AYNI net navlun dusulur (fobBirimFiyati).

  // Muhasebe talebi (14.10.2026): hangi urunden kac konteyner yuklendi.
  const dagilim = urunKonteynerDagilimi(urunler, konteynerler as any[]);
  const konteynerHucresi = (i: number) => {
    const s = dagilim.satirlar[i];
    if (!s || konteynerler.length === 0) return "-";
    return s.tahmini ? `${s.konteyner}*` : String(s.konteyner);
  };
  const miktarHucresi = (u: any) => {
    const m = kalemMiktari(u);
    return m ? m.toLocaleString("tr-TR", { maximumFractionDigits: 3 }) : "-";
  };
  const urunRows = urunler.map((u, i) => {
    const ad = markayaUyarla(u.urun_adi || u.description, gercekMarkalar(dosya.marka, (konteynerler || []).map((k) => (k as any).marka))) || "Urun";
    const ambalajBoyutu = u.ambalaj_boyutu || u.packaging_size || "-";
    const proformaBirim = parseFloat(String(u.birim_fiyat_usd || u.unit_price || 0));
    // FOB teslimde proforma fiyati FOB'dur: FOB sutununa yazilir, CIF bos kalir.
    if (fiyatlarFob) return [ad, ambalajBoyutu, konteynerHucresi(i), miktarHucresi(u), "-", formatBirimFiyatKg(proformaBirim)];
    const cifBirim = proformaBirim;
    const fobBirim = fobBirimFiyati(cifBirim, toplamCif, toplamFob, toplamMiktar);
    // Muhasebe talebi: birim fiyatlar burada KG basina, virgullu ve para birimi
    // sembolsuz (CIF "0,450"; FOB 8 ondalik "0,43404939" - Logo'ya aynen girilir).
    // Sistemde TON (MT) basina tutulan deger degismez, sadece goruntuleme boyle.
    return [ad, ambalajBoyutu, konteynerHucresi(i), miktarHucresi(u), formatBirimFiyatKg(cifBirim), fobBirim !== null ? formatFobBirimFiyatKg(fobBirim) : "-"];
  });

  if (urunRows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [
            [{ content: "URUN VE FIYAT BILGILERI", colSpan: 6 }],
            [
              { content: "Urun", styles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "normal" } },
              { content: "Ambalaj", styles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "normal" } },
              { content: "Konteyner", styles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "normal", halign: "center" } },
              { content: "Miktar (MTS)", styles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "normal", halign: "center" } },
              { content: `CIF Birim Fiyat (${dosya.para_birimi || "USD"}/KG)`, styles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "normal" } },
              { content: `FOB Birim Fiyat (${dosya.para_birimi || "USD"}/KG)`, styles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "normal" } },
            ],
          ],
      body: urunRows,
      theme: "grid",
      styles: { font: "Roboto", fontSize: fontBoyu, cellPadding: hucreDolgu },
      columnStyles: { 2: { halign: "center", cellWidth: 20 }, 3: { halign: "center", cellWidth: 22 } },
      headStyles: { fillColor: LACIVERT, textColor: 255, fontStyle: "bold", fontSize: fontBoyu + 0.5 },
      foot: [
        [
          "Toplam",
          "",
          // columnStyles footer'a uygulanmaz: ortalama hucre bazinda verilir
          { content: konteynerler.length ? String(dagilim.toplamKonteyner) : "-", styles: { halign: "center" } },
          { content: toplamMiktar ? toplamMiktar.toLocaleString("tr-TR", { maximumFractionDigits: 3 }) : "-", styles: { halign: "center" } },
          fiyatlarFob ? "-" : `${formatCurrency(toplamCif, dosya.para_birimi)} ${dosya.para_birimi || "USD"}`,
          toplamFob !== null ? `${formatCurrency(toplamFob, dosya.para_birimi)} ${dosya.para_birimi || "USD"}` : "-",
        ],
      ],
      footStyles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "bold", fontSize: fontBoyu },
      margin: { left: marginX, right: marginX, bottom: tabloAltMargin },
    });
    y = (doc as any).lastAutoTable.finalY + tablolarArasiBosluk;
    // Dipnot: miktara gore paylastirilan / urune baglanamayan konteyner varsa
    const notlar: string[] = [];
    if (dagilim.satirlar.some((s) => s.tahmini)) notlar.push("* Konteyner markasi urunu ayirt etmiyor; konteyner adedi urun miktarina gore paylastirildi.");
    if (dagilim.eslesmeyen > 0) notlar.push(`! ${dagilim.eslesmeyen} konteynerin markasi hicbir urunle eslesmedi - konteyner markalarini kontrol edin.`);
    if (on && !fiyatlarFob && toplamFob === null) notlar.push("FOB birim fiyat / toplam: konteyner adedi ve navlun kesinlesince hesaplanacaktir.");
    if (notlar.length) {
      doc.setFont("Roboto", "normal");
      doc.setFontSize(Math.max(6, fontBoyu - 1));
      doc.setTextColor(...GRI);
      notlar.forEach((n) => {
        doc.text(n, marginX, y + 1.5);
        y += Math.max(2.8, 3.4 * olcek);
      });
      y += tablolarArasiBosluk;
    }
  }

  // --- FATURA BOLUNMESI (04.11.2026): DIIB kalani yetmeyen yukleme = ayri faturalar ---
  const parcalar = faturaBolunmesi(urunler, bolunme, fiyatlarFob ? toplamCif : toplamFob);
  if (parcalar.length >= 2) {
    const pb = dosya.para_birimi || "USD";
    // 05.11.2026 (kullanici: "neden sadece CIF birim fiyat yer aliyor?"): CIF fiyatli dosyada her kalemde
    // FOB birim fiyat da yazar - URUN VE FIYAT BILGILERI tablosuyla AYNI hesap (fobBirimFiyati) ve bicim.
    // Fiyatlar zaten FOB ise tek birim sutunu (FOB) kalir.
    const fobSutunu = !fiyatlarFob;
    const govde: (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[][] = [];
    // 05.11.2026: her faturanin kap / net / brut'u (konteyner brut/net oraniyla; toplam birebir)
    const agirliklar = parcaAgirliklari(parcalar, toplamNetKg, toplamBrutKg);
    parcalar.forEach((p, pi) => {
      p.kalemler.forEach((k, i) => {
        const fobBirim = fobSutunu ? fobBirimFiyati(k.birimKg * 1000, toplamCif, toplamFob, toplamMiktar) : null;
        govde.push([
          i === 0 ? `${p.sira}. FATURA` : "", i === 0 ? p.belgeNo : "", k.ad, k.ambalaj || "-",
          k.kg.toLocaleString("tr-TR", { maximumFractionDigits: 2 }), formatBirimFiyatKg(k.birimKg * 1000),
          ...(fobSutunu ? [fobBirim !== null ? formatFobBirimFiyatKg(fobBirim) : "-"] : []),
          formatCurrency(k.tutar, pb),
        ]);
      });
      govde.push([
        { content: `${p.sira}. fatura toplami${p.faturaNo ? ` (${p.faturaNo})` : ""}\n${parcaAgirlikMetni(agirliklar[pi])}`, colSpan: 4, styles: { fontStyle: "bold", fillColor: [244, 246, 250] } },
        { content: `${p.kg.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} KG`, styles: { fontStyle: "bold", fillColor: [244, 246, 250] } },
        { content: p.fobTutar !== null && fobSutunu ? `FOB ${formatCurrency(p.fobTutar, pb)}` : "", colSpan: fobSutunu ? 2 : 1, styles: { fillColor: [244, 246, 250], halign: "right" } },
        { content: `${fiyatlarFob ? "FOB" : "CIF"} ${formatCurrency(p.tutar, pb)}`, styles: { fontStyle: "bold", fillColor: [244, 246, 250] } },
      ]);
    });
    const basliklar = fobSutunu
      ? ["Fatura", "DIIB", "Urun", "Ambalaj", "Miktar (KG)", `CIF Birim (${pb}/KG)`, `FOB Birim (${pb}/KG)`, "Tutar (CIF)"]
      : ["Fatura", "DIIB", "Urun", "Ambalaj", "Miktar (KG)", `FOB Birim (${pb}/KG)`, "Tutar (FOB)"];
    autoTable(doc, {
      startY: y,
      head: [
        [{ content: `FATURA BOLUNMESI (${parcalar.length} AYRI FATURA - HER FATURA AYRI DIIB'E)`, colSpan: basliklar.length }],
        basliklar.map((b, i) => ({ content: b, styles: { fillColor: [235, 235, 235], textColor: [30, 30, 30], fontStyle: "normal", halign: i >= 4 ? "right" : "left" } })),
      ],
      body: govde,
      theme: "grid",
      styles: { font: "Roboto", fontSize: fontBoyu, cellPadding: hucreDolgu },
      columnStyles: fobSutunu
        ? { 0: { cellWidth: 18, fontStyle: "bold" }, 1: { cellWidth: 24 }, 4: { halign: "right", cellWidth: 20 }, 5: { halign: "right", cellWidth: 21 }, 6: { halign: "right", cellWidth: 24 }, 7: { halign: "right", cellWidth: 26 } }
        : { 0: { cellWidth: 20, fontStyle: "bold" }, 1: { cellWidth: 26 }, 4: { halign: "right", cellWidth: 24 }, 5: { halign: "right", cellWidth: 26 }, 6: { halign: "right", cellWidth: 30 } },
      headStyles: { fillColor: [180, 110, 20], textColor: 255, fontStyle: "bold", fontSize: fontBoyu + 0.5 },
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
    ["Diib Bilgisi", parcalar.length >= 2
      ? parcalar.map((p) => `${p.sira}. fatura: ${p.belgeNo} (${p.kg.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} KG)`).join("  /  ")
      : formatDiibBilgisi(dosya.diib_no, dosya.diib_tarihi)],
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
export function faturaTalimatiPdfOlustur(dosya: Dosya, rezervasyonlar: Rezervasyon[], konteynerler: Konteyner[], on = false, bolunme: TalimatParcaGirdisi[] = [], bayrak: string | null = null): jsPDF {
  let olcek = 1.0;
  let sonuc = ciz(dosya, rezervasyonlar, konteynerler, olcek, on, bolunme, bayrak);
  while (sonuc.sayfaSayisi > 1 && olcek > 0.5) {
    olcek = Math.round((olcek - 0.02) * 100) / 100;
    sonuc = ciz(dosya, rezervasyonlar, konteynerler, olcek, on, bolunme, bayrak);
  }
  return sonuc.doc;
}

/**
 * on = true: ON TALIMAT (rezervasyon / konteyner kesinlesmeden; dosya adinda "-ON").
 * 05.11.2026: ticaret yapilan ulkenin bayragi tarayicida PNG'ye cevrilip PDF'e eklenir (bayrakPng);
 * cevrilemezse PDF bayraksiz uretilir.
 */
export async function indirFaturaTalimatiPdf(dosya: Dosya, rezervasyonlar: Rezervasyon[], konteynerler: Konteyner[], on = false, bolunme: TalimatParcaGirdisi[] = []): Promise<void> {
  const bayrak = await bayrakPng(dosyaTicaretUlkesi(dosya.ticaret_ulkesi, dosya.alici_adresi));
  faturaTalimatiPdfOlustur(dosya, rezervasyonlar, konteynerler, on, bolunme, bayrak).save(`Fatura_Talimati_${guvenliDosyaAdi(dosya.dosya_no)}${on ? "-ON" : ""}.pdf`);
}