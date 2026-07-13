"use client";
import React, { useState, useRef } from "react";
import { supabase, Rezervasyon, Konteyner, Dosya } from "@/lib/supabase";
import { formatCurrency, formatDateTR, formatDateTimeTR } from "@/lib/cutoff-utils";
import { useToast } from "@/lib/toast-context";
import {
  FileText, Mail, X, Upload, CheckCircle2,
  AlertTriangle, Loader2, RotateCcw
} from "lucide-react";

type KontrolSonucu = {
  uyumlu: boolean;
  uyusmazliklar: { alan: string; sistemde: string; dosyada: string }[];
  ozet: string;
  consignee?: string;
  notify?: string[];
};

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

export default function FaturaTalimatiSection({
  dosyaId, dosya, konteynerler, rezervasyonlar,
  faturaTalimatiHazir, eklenenKonteynerAdedi, rezervasyonKonteynerAdedi, onRefresh, companyId,
}: Props) {
  const { showToast } = useToast();

  const [showFaturaTalimati, setShowFaturaTalimati] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [konu, setKonu] = useState("");
  const [metin, setMetin] = useState("");

  const [kontrolEdiliyor, setKontrolEdiliyor] = useState(false);
  const [kontrolHata, setKontrolHata] = useState<string | null>(null);
  const [showKonsimento, setShowKonsimento] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const talimatGonderildi = !!dosya.fatura_talimati_gonderildi;
  const konsimentoDosyaUrl = dosya.konsimento_dosya_url;
  const konsimentoDosyaAdi = dosya.konsimento_dosya_adi;
  const konsimentoYuklemeTarihi = dosya.konsimento_yukleme_tarihi;
  const kontrolSonucu = dosya.konsimento_kontrol_sonucu as KontrolSonucu | null;

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
      const cifBirim = parseFloat(String(u.birim_fiyat_usd || u.unit_price || 0));
      const fobBirim = dusulecekVarMi ? cifBirim - dusulecekPerMts : null;
      return `  - ${ad}: CIF ${formatCurrency(cifBirim, dosya.para_birimi)}${fobBirim !== null ? ` / FOB ${formatCurrency(fobBirim, dosya.para_birimi)}` : ""}`;
    }).join("\n");
    const konteynerSatirlari = konteynerler.map((k, i) => `  ${i + 1}. ${k.konteyner_no} (Muhur: ${k.muhur_no || "-"}, Tip: ${k.tip})`).join("\n");

    // Sadece gercekten degeri olan satirlari ekleyen yardimci fonksiyon
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
    ].filter(Boolean).join("\n");

    const lojistikBilgileri = [
      satir("Yukleme Limani", dosya.yuklenme_limani || rez?.yuklenme_limani),
      satir("Varis Limani", dosya.varis_limani),
      satir("Teslim Sekli", dosya.teslim_sekli),
      satir("Gemi Adi", rez?.gemi_adi),
      satir("Acente", rez?.acente_ismi),
      satir("Booking No", rez?.booking_no),
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

    const bolumler = [
      `DOSYA BILGILERI\n${dosyaBilgileri}`,
      lojistikBilgileri ? `LOJISTIK BILGILERI\n${lojistikBilgileri}` : null,
      `URUN VE FIYAT BILGILERI\n${urunFiyatBilgileri}`,
      `KONTEYNER BILGILERI (${konteynerler.length} adet)\n${konteynerSatirlari || "  -"}`,
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

  const buildSistemVerisi = () => {
    const rez = rezervasyonlar[0];
    return {
      dosya_no: dosya.dosya_no, lot_no: dosya.lot_no, alici_firma: dosya.alici_firma,
      satici_firma: dosya.satici_firma, proforma_no: dosya.proforma_no,
      yukleme_limani: dosya.yuklenme_limani || rez?.yuklenme_limani,
      varis_limani: dosya.varis_limani, teslim_sekli: dosya.teslim_sekli,
      gemi_adi: rez?.gemi_adi, acente_ismi: rez?.acente_ismi,
      booking_no: rez?.booking_no, gemi_kalkis_tarihi: rez?.gemi_kalkis_tarihi,
      konteynerler: konteynerler.map((k) => ({
        konteyner_no: k.konteyner_no,
        muhur_no: k.muhur_no,
        tip: k.tip,
        net_agirlik_kg: k.net_agirlik_kg,
        brut_agirlik_kg: (k as any).brut_agirlik_kg,
        kap_adeti: (k as any).pieces,
      })),
      beyanname_no: dosya.beyanname_no, fatura_no: dosya.fatura_no, bl_no: dosya.bl_no, diib_no: dosya.diib_no,
    };
  };

  const handleYukleVeKontrolEt = async (file: File) => {
    setKontrolEdiliyor(true); setKontrolHata(null);
    try {
      const guvenliAd = file.name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/ş/gi, "s").replace(/ğ/gi, "g").replace(/ı/gi, "i")
        .replace(/ö/gi, "o").replace(/ü/gi, "u").replace(/ç/gi, "c")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${dosyaId}/${Date.now()}_${guvenliAd}`;
      const { error: uploadError } = await supabase.storage.from("konsimento-talimatlari").upload(path, file);
      if (uploadError) throw new Error(`Yukleme hatasi: ${uploadError.message}`);
      const { data: urlData } = supabase.storage.from("konsimento-talimatlari").getPublicUrl(path);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sistem_verisi", JSON.stringify(buildSistemVerisi()));
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/konsimento-kontrol`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kontrol hatasi.");

      // Liman/gemi adi gibi alanlarda birbirini iceren degerleri (orn. "MARPORT" / "ISTANBUL-MARPORT")
      // AI bazen tutarsiz isaretleyebiliyor, burada kod seviyesinde kesin olarak filtreliyoruz.
      const normalize = (s: string) => s.toUpperCase().replace(/[^A-ZÇĞİÖŞÜ0-9]/g, "");
      const gercekUyusmazliklar = (data.uyusmazliklar || []).filter((u: any) => {
        const sis = normalize(String(u.sistemde || ""));
        const dos = normalize(String(u.dosyada || ""));
        if (!sis || !dos) return true;
        if (sis === dos) return false;
        if (sis.includes(dos) || dos.includes(sis)) return false;
        return true;
      });
      const filtrelenmisData = {
        ...data,
        uyusmazliklar: gercekUyusmazliklar,
        uyumlu: gercekUyusmazliklar.length === 0,
        ozet: gercekUyusmazliklar.length === 0
          ? "Konteyner bilgileri ve sistem verileri uyumludur."
          : data.ozet,
      };

      // Mevcut ham_veri'yi koruyarak notify bilgisini ekliyoruz
      const guncelHamVeri = {
        ...(dosya.ham_veri || {}),
        notify: data.notify || []
      };

      const { error: updateError } = await supabase.from("ihracat_dosyalari").update({
        konsimento_dosya_url: urlData.publicUrl, konsimento_dosya_adi: file.name,
        konsimento_yukleme_tarihi: new Date().toISOString(), konsimento_kontrol_sonucu: filtrelenmisData,
        consignee: data.consignee || null,
        ham_veri: guncelHamVeri,
      }).eq("id", dosyaId).eq("company_id", companyId);
      if (updateError) throw new Error(`Sonuc kaydedilemedi: ${updateError.message}`);
      onRefresh();
    } catch (err: any) {
      setKontrolHata(err.message || "Kontrol hatasi.");
    } finally { setKontrolEdiliyor(false); }
  };

  const handleYenidenYukle = async () => {
    setKontrolHata(null);
    const { error } = await supabase.from("ihracat_dosyalari").update({
      konsimento_dosya_url: null, konsimento_dosya_adi: null,
      konsimento_yukleme_tarihi: null, konsimento_kontrol_sonucu: null,
    }).eq("id", dosyaId).eq("company_id", companyId);
    if (error) {
      showToast(`Islem basarisiz: ${error.message}`, "error");
      return;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    onRefresh();
  };

  const konsimentoIcerik = (
    <div className="space-y-3">
      {!konsimentoDosyaUrl && !kontrolEdiliyor ? (
        <label className="flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors hover:bg-slate-50" style={{ borderColor: "#CBD5E1" }}>
          <Upload size={28} className="text-slate-400" />
          <span className="text-sm font-medium text-slate-700">Konsimento talimati PDF dosyasini secin</span>
          <span className="text-xs text-slate-500">veya surukleyip birakin</span>
          <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (f.type !== "application/pdf") { showToast("Lutfen PDF yukleyin.", "error"); return; } handleYukleVeKontrolEt(f); } }} />
        </label>
      ) : (
        <div className="space-y-3">
          {konsimentoDosyaUrl && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-white border" style={{ borderColor: "#bbf7d0" }}>
              <FileText size={16} className="text-slate-500 shrink-0" />
              <a href={konsimentoDosyaUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-700 truncate flex-1 hover:underline">{konsimentoDosyaAdi}</a>
              {konsimentoYuklemeTarihi && <span className="text-xs text-slate-400 shrink-0">{formatDateTimeTR(konsimentoYuklemeTarihi)}</span>}
              <button onClick={handleYenidenYukle} className="text-slate-400 hover:text-slate-600 shrink-0"><X size={16} /></button>
            </div>
          )}
          {kontrolEdiliyor && (
            <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-white border animate-fade-in" style={{ borderColor: "#E2E8F0" }}>
              <Loader2 size={18} className="text-slate-500 animate-spin" />
              <span className="text-sm text-slate-600">Belge kontrol ediliyor, bu işlem birkaç saniye sürebilir</span>
            </div>
          )}
          {kontrolHata && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2 animate-fade-in">
              <p className="text-sm font-medium text-amber-800">Kontrol yapilamadi</p>
              <p className="text-xs text-amber-700">{kontrolHata}</p>
              <button onClick={handleYenidenYukle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200"><RotateCcw size={12} /> Tekrar Dene</button>
            </div>
          )}
          {kontrolSonucu && kontrolSonucu.uyumlu && (
            <div className="p-4 rounded-lg bg-white border-2 border-green-300 space-y-2 animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-green-600" />
                <p className="text-sm font-semibold text-green-700">Elinize saglik. Gonul rahatligiyla gonderebilirsiniz.</p>
              </div>
              {kontrolSonucu.ozet && <p className="text-xs text-slate-500 ml-6">{kontrolSonucu.ozet}</p>}
              {kontrolSonucu.consignee && (
                <p className="text-xs text-slate-500 ml-6 mt-1">
                  <span className="font-medium text-slate-600">Consignee:</span> {kontrolSonucu.consignee}
                </p>
              )}
              <button onClick={handleYenidenYukle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 ml-6"><RotateCcw size={12} /> Baska Dosya Yukle</button>
            </div>
          )}
          {kontrolSonucu && !kontrolSonucu.uyumlu && (
            <div className="p-4 rounded-lg bg-white border-2 border-red-300 space-y-3 animate-fade-in">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-600" />
                <p className="text-sm font-semibold text-red-700">Dosyada uyusmazlik tespit edildi</p>
              </div>
              {kontrolSonucu.ozet && <p className="text-xs text-slate-600">{kontrolSonucu.ozet}</p>}
              {kontrolSonucu.uyusmazliklar?.length > 0 && (
                <div className="space-y-1.5">
                  {kontrolSonucu.uyusmazliklar.map((u, idx) => (
                    <div key={idx} className="text-xs p-2 rounded bg-red-50 border border-red-100">
                      <p className="font-medium text-red-700">{u.alan}</p>
                      <p className="text-red-600">Sistemde: <span className="font-mono">{u.sistemde}</span></p>
                      <p className="text-red-600">Dosyada: <span className="font-mono">{u.dosyada}</span></p>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={handleYenidenYukle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100"><RotateCcw size={12} /> Dogru Dosyayi Yeniden Yukle</button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="pt-2 border-t space-y-4" style={{ borderColor: "#F1F5F9" }}>
      {!showKonsimento ? (
        <div className="space-y-3">
          <button onClick={() => setShowKonsimento(true)} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90" style={{ backgroundColor: "#1B2B4B" }}>
            <FileText size={16} /> {konsimentoDosyaUrl ? "Konsimento Talimatini Goruntule" : "Konsimento Talimati Yukle"}
          </button>
        </div>
      ) : (
        <div className="p-5 rounded-xl border shadow-sm space-y-4 animate-fade-in" style={{ borderColor: "#E2E8F0" }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">Konsimento Talimati</p>
            <button onClick={() => setShowKonsimento(false)} className="p-1 text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          {konsimentoIcerik}
        </div>
      )}

      {!faturaTalimatiHazir ? (
        <div className="mt-3">
          <button disabled className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-400 bg-slate-100 cursor-not-allowed">
            <FileText size={16} /> Fatura Talimati Olustur
          </button>
          <p className="text-xs text-slate-400 mt-1.5 text-center">{eklenenKonteynerAdedi} / {rezervasyonKonteynerAdedi || 0} konteyner eklendi</p>
        </div>
      ) : showFaturaTalimati ? (
        <div className="mt-3 p-4 rounded-xl border bg-white shadow-sm space-y-3 animate-fade-in" style={{ borderColor: "#E2E8F0" }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">Fatura Talimati Maili</p>
            <button onClick={() => setShowFaturaTalimati(false)} className="p-1 text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">TO (Alici)</p>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="muhasebe@firma.com" type="email" className="w-full text-sm px-3 py-2 border rounded-lg" style={{ borderColor: "#E2E8F0" }} />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">CC</p>
            <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc1@firma.com" className="w-full text-sm px-3 py-2 border rounded-lg" style={{ borderColor: "#E2E8F0" }} />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Konu</p>
            <input value={konu} onChange={(e) => setKonu(e.target.value)} className="w-full text-sm px-3 py-2 border rounded-lg" style={{ borderColor: "#E2E8F0" }} />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Metin</p>
            <textarea value={metin} onChange={(e) => setMetin(e.target.value)} rows={14} className="w-full text-sm px-3 py-2 border rounded-lg font-mono resize-none" style={{ borderColor: "#E2E8F0" }} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleMailGonder} disabled={!to} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1B2B4B" }}>
              <Mail size={14} /> Mail Uygulamasini Ac
            </button>
            <button onClick={() => setShowFaturaTalimati(false)} className="px-4 py-2 rounded-lg text-slate-600 text-sm font-medium border hover:bg-slate-50" style={{ borderColor: "#E2E8F0" }}>Iptal</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <button onClick={handleFaturaTalimatiAc} className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90" style={{ backgroundColor: "#1B2B4B" }}>
            <FileText size={16} /> {talimatGonderildi ? "Fatura Talimatini Yeniden Gonder" : "Fatura Talimati Olustur"}
          </button>
          </div>
      )}
    </div>
  );
}
