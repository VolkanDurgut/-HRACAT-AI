"use client";
import React, { useState, forwardRef, useImperativeHandle } from "react";
import { supabase, Rezervasyon, Konteyner, Dosya } from "@/lib/supabase";
import { formatCurrency, formatDateTR, formatDateTimeTR } from "@/lib/cutoff-utils";
import { useToast } from "@/lib/toast-context";
import { Mail, X, Download } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { indirFaturaTalimatiPdf } from "@/lib/fatura-talimati-pdf-builder";

type Props = {
  dosyaId: string;
  dosya: Dosya;
  konteynerler: Konteyner[];
  rezervasyonlar: Rezervasyon[];
  faturaTalimatiHazir: boolean;
  eklenenKonteynerAdedi: number;
  rezervasyonKonteynerAdedi: number;
  onRefresh: () => void;
  companyId: string; // SaaS: şirket bazlı izolasyon
};

export type FaturaTalimatiSectionHandle = { acFatura: () => void; indirFaturaTalimati: () => void };

const FaturaTalimatiSection = forwardRef<FaturaTalimatiSectionHandle, Props>(function FaturaTalimatiSection({
  dosyaId, dosya, konteynerler, rezervasyonlar,
  faturaTalimatiHazir, rezervasyonKonteynerAdedi, onRefresh, companyId,
}, ref) {
  const { showToast } = useToast();

  const [showFaturaTalimati, setShowFaturaTalimati] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [konu, setKonu] = useState("");
  const [metin, setMetin] = useState("");

  const talimatGonderildi = !!dosya.fatura_talimati_gonderildi;

  const buildKonu = () => [dosya.dosya_no, dosya.alici_firma, rezervasyonKonteynerAdedi ? `${rezervasyonKonteynerAdedi}x` : null, dosya.varis_limani].filter(Boolean).join(" - ");

  const buildMetin = () => {
    const urunler = dosya.urun_detaylari || [];
    const rez = rezervasyonlar[0];
    const toplamCif = urunler.reduce((s: number, u: any) => s + parseFloat(String(u.toplam_tutar_usd || u.total_amount || 0)), 0);
    const navlunBirim = dosya.navlun_tutari;
    const lokalMasrafBirim = (dosya as any).lokal_masraf_tutari;
    const navlunToplam = navlunBirim && rezervasyonKonteynerAdedi > 0 ? navlunBirim * rezervasyonKonteynerAdedi : null;
    const lokalMasrafToplam = lokalMasrafBirim && rezervasyonKonteynerAdedi > 0 ? lokalMasrafBirim * rezervasyonKonteynerAdedi : null;
    const toplamDusulecek = navlunToplam !== null && lokalMasrafToplam !== null
      ? navlunToplam - lokalMasrafToplam
      : navlunToplam !== null
      ? navlunToplam
      : 0;
    const dusulecekVarMi = navlunToplam !== null || lokalMasrafToplam !== null;
    const toplamFob = dusulecekVarMi ? toplamCif - toplamDusulecek : null;
    const toplamMiktar = urunler.reduce((s: number, u: any) => s + parseFloat(String(u.miktar_mts || u.quantity || 0)), 0);
    const dusulecekPerMts = dusulecekVarMi && toplamMiktar > 0 ? toplamDusulecek / toplamMiktar : 0;
    const urunSatirlari = urunler.map((u: any) => {
      const ad = u.urun_adi || u.description || "Urun";
      // Ayni urun adiyla farkli ambalaj boyutunda (orn. 25 KG / 50 KG) birden
      // fazla kalem olabilir - ayirt edilebilmesi icin ambalaj boyutu da yazilir.
      const ambalajBoyutu = u.ambalaj_boyutu || u.packaging_size;
      const cifBirim = parseFloat(String(u.birim_fiyat_usd || u.unit_price || 0));
      const fobBirim = dusulecekVarMi ? cifBirim - dusulecekPerMts : null;
      return `  - ${ad}${ambalajBoyutu ? ` (${ambalajBoyutu})` : ""}: CIF ${formatCurrency(cifBirim, dosya.para_birimi)}${fobBirim !== null ? ` / FOB ${formatCurrency(fobBirim, dosya.para_birimi)}` : ""}`;
    }).join("\n");
    const konteynerSatirlari = konteynerler.map((k, i) => {
      // Muhur/Tip/Marka/Kap/Net/Brut/VGM/Tartim Tarihi - sadece dolu olanlar yazilir.
      const detaylar = [
        k.muhur_no ? `Muhur: ${k.muhur_no}` : null,
        k.tip ? `Tip: ${k.tip}` : null,
        (k as any).marka ? `Marka: ${(k as any).marka}` : null,
        (k as any).pieces ? `Kap: ${Number((k as any).pieces).toLocaleString("tr-TR")}` : null,
        k.net_agirlik_kg ? `Net: ${Number(k.net_agirlik_kg).toLocaleString("tr-TR")} KG` : null,
        (k as any).brut_agirlik_kg ? `Brut: ${Number((k as any).brut_agirlik_kg).toLocaleString("tr-TR")} KG` : null,
        (k as any).vgm_kg ? `VGM: ${Number((k as any).vgm_kg).toLocaleString("tr-TR")} KG` : null,
        ((k as any).dba_kontrol_sonucu as any)?.tartim_tarih_saat ? `Tartim Tarihi: ${((k as any).dba_kontrol_sonucu as any).tartim_tarih_saat}` : null,
      ].filter(Boolean).join(", ");
      return `  ${i + 1}. ${k.konteyner_no}${detaylar ? ` (${detaylar})` : ""}`;
    }).join("\n");

    // Konteynerlerin toplam Net/Brut/Kap adedi - manuel formdaki TOPLAM satirina karsilik gelir.
    const toplamNet = konteynerler.reduce((s, k) => s + (k.net_agirlik_kg || 0), 0);
    const toplamBrut = konteynerler.reduce((s, k) => s + ((k as any).brut_agirlik_kg || 0), 0);
    const toplamKap = konteynerler.reduce((s, k) => s + ((k as any).pieces || 0), 0);

    const satir = (label: string, value: string | number | null | undefined) => {
      if (value === null || value === undefined || value === "" || value === "-") return null;
      return `${label}: ${value}`;
    };

    const dosyaBilgileri = [
      satir("Lot No", dosya.lot_no),
      satir("Alici Firma", dosya.alici_firma),
      satir("Satici Firma", dosya.satici_firma),
      satir("Marka", dosya.marka),
      satir("Proforma No", dosya.proforma_no),
      satir("Ambalaj", dosya.detayli_ambalaj || dosya.ambalaj),
    ].filter(Boolean).join("\n");

    const beyannameSuresi = rez?.beyanname_cutoff
      ? `${formatDateTimeTR(rez.beyanname_cutoff)} ${new Date(rez.beyanname_cutoff).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`
      : null;

    const lojistikBilgileri = [
      satir("Yukleme Limani", dosya.yuklenme_limani || rez?.yuklenme_limani),
      satir("Varis Limani", dosya.varis_limani),
      satir("Teslim Sekli", dosya.teslim_sekli),
      satir("Gemi Adi", rez?.gemi_adi),
      satir("Acente", rez?.acente_ismi),
      satir("Booking No", rez?.booking_no),
      satir("Beyanname Teslim Suresi", beyannameSuresi),
    ].filter(Boolean).join("\n");

    // Navlun/Lokal Masraf birim ve toplam degerleri ile "All in Navlun Fiyati"
    // (ikisinin konteyner basina toplami) ve Araci Banka - ayri bir bolumde.
    const allInNavlun = navlunBirim != null && lokalMasrafBirim != null ? navlunBirim + lokalMasrafBirim : null;
    const maliyetBilgileri = [
      satir("Navlun (Konteyner Basina)", navlunBirim != null ? formatCurrency(navlunBirim, dosya.para_birimi) : null),
      satir("Toplam Navlun Fiyati", navlunToplam !== null ? formatCurrency(navlunToplam, dosya.para_birimi) : null),
      satir("Lokal Masraflar (Konteyner Basina)", lokalMasrafBirim != null ? formatCurrency(lokalMasrafBirim, dosya.para_birimi) : null),
      satir("All in Navlun Fiyati (Konteyner Basina)", allInNavlun !== null ? formatCurrency(allInNavlun, dosya.para_birimi) : null),
      satir("Araci Banka", dosya.banka),
    ].filter(Boolean).join("\n");

    const toplamFobStr = toplamFob !== null ? formatCurrency(toplamFob, dosya.para_birimi) : null;
    const urunFiyatBilgileri = [
      urunSatirlari || null,
      satir("Toplam CIF", formatCurrency(toplamCif, dosya.para_birimi)),
      satir("Toplam FOB", toplamFobStr),
    ].filter(Boolean).join("\n");

    const evrakTarihBilgileri = [
      satir("Beyanname No", dosya.beyanname_no),
      satir("BL No", dosya.bl_no),
      satir("DIIB No", dosya.diib_no),
      satir("DIIB Tarihi", dosya.diib_tarihi ? formatDateTR(dosya.diib_tarihi) : null),
      satir("Uretim Tarihi", dosya.uretim_tarihi ? formatDateTR(dosya.uretim_tarihi) : null),
      satir("Son Kullanim Tarihi", dosya.son_kullanim_tarihi ? formatDateTR(dosya.son_kullanim_tarihi) : null),
    ].filter(Boolean).join("\n");

    const konteynerToplamSatiri = (toplamNet || toplamBrut || toplamKap)
      ? `\n\n  TOPLAM: ${konteynerler.length} Konteyner${toplamKap ? `, ${toplamKap.toLocaleString("tr-TR")} Kap` : ""}${toplamNet ? `, ${toplamNet.toLocaleString("tr-TR")} KG Net` : ""}${toplamBrut ? `, ${toplamBrut.toLocaleString("tr-TR")} KG Brut` : ""}`
      : "";

    const bolumler = [
      `DOSYA BILGILERI\n${dosyaBilgileri}`,
      lojistikBilgileri ? `LOJISTIK BILGILERI\n${lojistikBilgileri}` : null,
      maliyetBilgileri ? `MALIYET VE BANKA BILGILERI\n${maliyetBilgileri}` : null,
      `URUN VE FIYAT BILGILERI\n${urunFiyatBilgileri}`,
      `KONTEYNER BILGILERI (${konteynerler.length} adet)\n${konteynerSatirlari || "  -"}${konteynerToplamSatiri}`,
      evrakTarihBilgileri ? `EVRAK VE TARIH BILGILERI\n${evrakTarihBilgileri}` : null,
    ].filter(Boolean).join("\n\n");

    return `Sayin Ilgili,\n\nAsagida belirtilen ihracat dosyasina ait fatura tanzimi icin gerekli bilgiler tarafiniza iletilmistir. Bilgilerinize ve gereginin yapilmasini rica ederiz.\n\n${bolumler}\n\nBilgilerinize arz ederiz.\n\nSaygilarimizla,\nIhracat Departmani`;
  };

  const handleFaturaTalimatiAc = () => {
    if (!faturaTalimatiHazir) return;
    setKonu(buildKonu());
    setMetin((dosya as any).fatura_talimati_metni || buildMetin());
    setTo(""); setCc("");
    setShowFaturaTalimati(true);
  };

  // Modal hic acilmadan, dogrudan PDF indirir - VGM Indir ile ayni davranis
  // (her zaman gorunen ust bar butonu icin). PDF artik metin/konu'dan degil,
  // dogrudan guncel sistem verisinden (kart tasarimi) uretilir - boylece PDF
  // her zaman en guncel dosya/konteyner bilgisini yansitir.
  const handleFaturaTalimatiIndir = () => {
    if (!faturaTalimatiHazir) return;
    indirFaturaTalimatiPdf(dosya, rezervasyonlar, konteynerler);
  };

  const handleMailGonder = async () => {
    const ccPart = cc ? `&cc=${encodeURIComponent(cc)}` : "";
    window.open(`mailto:${to}?subject=${encodeURIComponent(konu)}${ccPart}&body=${encodeURIComponent(metin)}`);
    const { error } = await supabase.from("ihracat_dosyalari").update({
      fatura_talimati_gonderildi: true,
      fatura_talimati_metni: metin,
    }).eq("id", dosyaId).eq("company_id", companyId);
    if (error) {
      showToast(`Fatura talimati durumu kaydedilemedi: ${error.message}`, "error");
      return;
    }
    setShowFaturaTalimati(false);
    showToast("Fatura talimati maili gonderildi.", "success");
    onRefresh();
  };

  useImperativeHandle(ref, () => ({
    acFatura: handleFaturaTalimatiAc,
    indirFaturaTalimati: handleFaturaTalimatiIndir,
  }));

  return (
    <>
      {showFaturaTalimati && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowFaturaTalimati(false)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto p-5 space-y-3 animate-fade-up" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-white">Fatura Talimati Maili</p>
              <button onClick={() => setShowFaturaTalimati(false)} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }}><X size={18} /></button>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>TO (Alici)</p>
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="muhasebe@firma.com" type="email" className="w-full text-sm px-3 py-2 border rounded-lg text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>CC</p>
              <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc1@firma.com" className="w-full text-sm px-3 py-2 border rounded-lg text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>Konu</p>
              <input value={konu} onChange={(e) => setKonu(e.target.value)} className="w-full text-sm px-3 py-2 border rounded-lg text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>Metin</p>
              <textarea value={metin} onChange={(e) => setMetin(e.target.value)} rows={14} className="w-full text-sm px-3 py-2 border rounded-lg font-mono resize-none text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleMailGonder} disabled={!to} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
                <Mail size={14} /> Mail Uygulamasini Ac
              </button>
              <button onClick={() => indirFaturaTalimatiPdf(dosya, rezervasyonlar, konteynerler)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} title="Fatura talimatini PDF olarak indir">
                <Download size={14} /> Fatura Talimati Indir
              </button>
              <button onClick={() => setShowFaturaTalimati(false)} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Iptal</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default FaturaTalimatiSection;