"use client";

import React, { useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, UrunDetay, SEVKIYAT_EVRAKLARI, AnaSiparis } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/cutoff-utils";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import AcenteTeklifSection from "@/components/acente-teklif-section";
import { Upload, FileText, Check, Loader2, Package, AlertCircle } from "lucide-react";

type Step = "upload" | "reading" | "ana_siparis_check" | "success" | "reservation_choice" | "review";

export default function YeniDosyaPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>("upload");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dosyaId, setDosyaId] = useState<string | null>(null);
  const [proformData, setProformData] = useState<any | null>(null);

  // Ana siparis state'leri
  const [mevcutAnaSiparis, setMevcutAnaSiparis] = useState<AnaSiparis | null>(null);
  const [gonderilmisMts, setGonderilmisMts] = useState<number>(0);
  const [yeniSiparisMts, setYeniSiparisMts] = useState<string>("");

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === "application/pdf" && file.size <= 20 * 1024 * 1024) {
      setPdfFile(file);
      setError(null);
    } else {
      setError("Lutfen 20MB'den kucuk bir PDF dosyasi yukleyin.");
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf" && file.size <= 20 * 1024 * 1024) {
      setPdfFile(file);
      setError(null);
    } else {
      setError("Lutfen 20MB'den kucuk bir PDF dosyasi yukleyin.");
    }
  }, []);

  const getProformaMts = (extracted: any): number => {
    if (extracted.urun_detaylari && extracted.urun_detaylari.length > 0) {
      return extracted.urun_detaylari.reduce((s: number, u: any) => s + parseFloat(String(u.quantity || u.miktar_mts || 0)), 0);
    }
    return parseFloat(String(extracted.toplam_miktar || extracted.miktar || 0));
  };

  const handleUpload = async () => {
    if (!pdfFile || !user) return;
    setLoading(true);
    setError(null);
    setStep("reading");

    try {
      let extracted: any = null;
      try {
        const formData = new FormData();
        formData.append("file", pdfFile);
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${supabaseUrl}/functions/v1/proforma-oku`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.satici_firma) extracted = data;
        }
      } catch {
        // Backend not available
      }

      if (!extracted) {
        throw new Error("PDF okunamadi.");
      }

      setProformData(extracted);

      // Ayni proforma_no'ya sahip bir ana siparis var mi kontrol et
      if (extracted.proforma_no) {
        const { data: existingAnaSiparis } = await supabase
          .from("ana_siparisler")
          .select("*")
          .eq("proforma_no", extracted.proforma_no)
          .maybeSingle();

        if (existingAnaSiparis) {
          // Mevcut ana siparise bagli dosyalardaki gonderilmis MTS toplamini hesapla
          const { data: bagliDosyalar } = await supabase
            .from("ihracat_dosyalari")
            .select("id, urun_detaylari, durum")
            .eq("ana_siparis_id", existingAnaSiparis.id);

          const dosyaIdListesi = (bagliDosyalar || []).map((d: any) => d.id);
          const { data: bagliKonteynerler } = await supabase
            .from("konteynerler")
            .select("dosya_id, dba_dosya_url")
            .in("dosya_id", dosyaIdListesi);

          const toplamGonderilmis = (bagliDosyalar || []).reduce((s: number, d: any) => {
            const urunler = d.urun_detaylari || [];
            const dosyaToplamMts = urunler.reduce((s2: number, u: any) => s2 + parseFloat(String(u.miktar_mts || u.quantity || 0)), 0);

            // Dosya kapatilmissa, o partinin tamami gonderilmis sayilir - DBA
            // belgesi yuklenmis olsun ya da olmasin. "Kapali" durumu, sevkiyatin
            // gercekten tamamlandiginin en kesin sinyalidir.
            const dosyaKapali = d.durum === "Kapalı" || d.durum === "Kapali";
            if (dosyaKapali) return s + dosyaToplamMts;

            // Dosya hala aciksa, konteyner bazli DBA tamamlanma oranina gore
            // kismi ilerleme goster.
            const dosyaKonteynerleri = (bagliKonteynerler || []).filter((k: any) => k.dosya_id === d.id);
            if (dosyaKonteynerleri.length === 0) return s; // Konteyner yoksa henuz gonderilmemis sayilir
            const dbaTamamlananSayisi = dosyaKonteynerleri.filter((k: any) => !!k.dba_dosya_url).length;
            const mtsPerKonteyner = dosyaToplamMts / dosyaKonteynerleri.length;
            return s + (mtsPerKonteyner * dbaTamamlananSayisi);
          }, 0);

          setMevcutAnaSiparis(existingAnaSiparis);
          setGonderilmisMts(toplamGonderilmis);
          setStep("ana_siparis_check");
          setLoading(false);
          return;
        } else {
          // Yeni ana siparis icin onerilen MTS degerini hazirla
          setYeniSiparisMts(getProformaMts(extracted).toString());
          setStep("ana_siparis_check");
          setLoading(false);
          return;
        }
      }

      // proforma_no yoksa direkt dosya olustur (ana siparis baglanmadan)
      await createDosya(extracted, null);
    } catch {
      setError("Dosya olusturulurken hata olustu. Lutfen tekrar deneyin.");
      showToast("Dosya olusturulurken hata olustu.", "error");
      setStep("upload");
      setLoading(false);
    }
  };

  const createDosya = async (extracted: any, anaSiparisId: string | null) => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error: dbError } = await supabase
        .from("ihracat_dosyalari")
        .insert({
          satici_firma: extracted.satici_firma,
          alici_firma: extracted.alici_firma,
          urun_tanimi: extracted.urun_detaylari?.map((u: any) => u.description || u.urun_adi).join(", ") || "-",
          proforma_no: extracted.proforma_no,
          proforma_tarihi: extracted.proforma_tarihi,
          gecerlilik_tarihi: extracted.gecerlilik_tarihi,
          lot_no: extracted.lot_no || extracted.proforma_no,
          marka: extracted.marka || null,
          toplam_tutar: extracted.toplam_tutar,
          para_birimi: extracted.para_birimi || "USD",
          odeme_sekli: extracted.odeme_sekli,
          yuklenme_limani: extracted.yuklenme_limani || extracted.yukleme_limani,
          varis_limani: extracted.varis_limani,
          teslim_sekli: extracted.teslim_sekli,
          miktar: String(extracted.toplam_miktar || extracted.miktar || ""),
          miktar_birimi: extracted.miktar_birimi || "MTS",
          ambalaj: extracted.ambalaj,
          alici_adresi: extracted.alici_adresi || null,
          detayli_ambalaj: extracted.detayli_ambalaj || null,
          hesap_adi: extracted.hesap_adi || null,
          banka: extracted.banka || null,
          swift: extracted.swift || null,
          iban: extracted.iban || null,
          ham_veri: extracted as unknown as Record<string, unknown>,
          urun_detaylari: extracted.urun_detaylari || [],
          sevkiyat_evraklari: extracted.sevkiyat_evraklari?.length ? extracted.sevkiyat_evraklari : SEVKIYAT_EVRAKLARI,
          durum: "Açık",
          created_by: user.id,
          ana_siparis_id: anaSiparisId,
        })
        .select("id")
        .single();

      if (dbError) throw dbError;
      setDosyaId(data.id);

      setStep("success");
      showToast("Dosya olusturuldu!", "success");
      setTimeout(() => setStep("reservation_choice"), 1500);
    } catch {
      setError("Dosya olusturulurken hata olustu. Lutfen tekrar deneyin.");
      showToast("Dosya olusturulurken hata olustu.", "error");
      setStep("upload");
    } finally {
      setLoading(false);
    }
  };

  const handleDevamEt = async () => {
    if (!mevcutAnaSiparis || !proformData) return;
    await createDosya(proformData, mevcutAnaSiparis.id);
  };

  const handleYeniAnaSiparisOlustur = async () => {
    if (!proformData || !user) return;
    const toplamMts = parseFloat(yeniSiparisMts) || getProformaMts(proformData);
    setLoading(true);
    try {
      const { data: yeniAnaSiparis, error: anaSiparisError } = await supabase
        .from("ana_siparisler")
        .insert({
          proforma_no: proformData.proforma_no,
          alici_firma: proformData.alici_firma,
          urun_tanimi: proformData.urun_detaylari?.map((u: any) => u.description || u.urun_adi).join(", ") || "-",
          toplam_mts: toplamMts,
          para_birimi: proformData.para_birimi || "USD",
          urun_detaylari_master: proformData.urun_detaylari || null,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (anaSiparisError) throw anaSiparisError;
      await createDosya(proformData, yeniAnaSiparis.id);
    } catch {
      showToast("Ana siparis olusturulurken hata olustu.", "error");
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "#1B2B4B" }}>Yeni Ihracat Dosyasi Ac</h1>
        <p className="text-slate-500 text-sm mt-1">
          Proforma faturayi yukleyin, sistem otomatik olarak ihracat dosyasini oluştursun.
        </p>
      </div>

      <div className="max-w-4xl">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        {step === "upload" && (
          <div className="bg-white rounded-xl border shadow-sm p-8" style={{ borderColor: "#E2E8F0" }}>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer hover:border-amber-400 hover:bg-amber-50/30"
              style={{ borderColor: pdfFile ? "#F59E0B" : "#CBD5E1" }}
              onClick={() => document.getElementById("pdf-input")?.click()}
            >
              <Upload size={40} className="mx-auto text-slate-300 mb-4" />
              {pdfFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText size={20} className="text-amber-600" />
                  <span className="text-sm font-medium text-slate-700">{pdfFile.name}</span>
                  <Check size={16} className="text-green-500" />
                </div>
              ) : (
                <>
                  <p className="text-slate-600 font-medium">PDF dosyanızı buraya sürükleyin</p>
                  <p className="text-slate-400 text-sm mt-1">veya dosya seçmek için tıklayın (max 20MB)</p>
                </>
              )}
              <input id="pdf-input" type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />
            </div>
            <button
              onClick={handleUpload}
              disabled={!pdfFile || loading}
              className="mt-6 w-full py-3 rounded-lg text-white font-medium text-sm transition-all duration-200 hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: "#1B2B4B" }}
            >
              Dosyayi Olustur
            </button>
          </div>
        )}

        {step === "reading" && (
          <div className="bg-white rounded-xl border shadow-sm p-12 text-center" style={{ borderColor: "#E2E8F0" }}>
            <Loader2 size={40} className="mx-auto text-amber-500 animate-spin mb-4" />
            <p className="text-slate-700 font-medium">İhracat dosyanız hazırlanıyor</p>
            <p className="text-slate-400 text-sm mt-1">Bu işlem birkaç saniye sürebilir</p>
          </div>
        )}

        {step === "ana_siparis_check" && proformData && (
          <div className="bg-white rounded-xl border shadow-sm p-8" style={{ borderColor: "#E2E8F0" }}>
            {mevcutAnaSiparis ? (
              <>
                <div className="flex items-start gap-3 mb-5">
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-600 shrink-0">
                    <Package size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">Mevcut sipariş bulundu</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      <span className="font-medium">{mevcutAnaSiparis.proforma_no}</span> numaralı proformaya ait bir sipariş zaten kayıtlı.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="p-3 rounded-lg bg-slate-50 border" style={{ borderColor: "#E2E8F0" }}>
                    <p className="text-xs text-slate-400">Toplam Taahhüt</p>
                    <p className="text-lg font-bold" style={{ color: "#1B2B4B" }}>{mevcutAnaSiparis.toplam_mts?.toLocaleString("tr-TR")} MTS</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border" style={{ borderColor: "#E2E8F0" }}>
                    <p className="text-xs text-slate-400">Gönderilmiş</p>
                    <p className="text-lg font-bold text-green-600">{gonderilmisMts.toLocaleString("tr-TR")} MTS</p>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border" style={{ borderColor: "#FDE68A" }}>
                    <p className="text-xs text-amber-600">Kalan</p>
                    <p className="text-lg font-bold text-amber-700">{Math.max(0, (mevcutAnaSiparis.toplam_mts || 0) - gonderilmisMts).toLocaleString("tr-TR")} MTS</p>
                  </div>
                </div>

                <p className="text-sm text-slate-600 mb-5">
                  Bu yeni dosyayı (<strong>{getProformaMts(proformData).toLocaleString("tr-TR")} MTS</strong>) bu siparişin devamı olarak eklemek mi istiyorsunuz?
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={handleDevamEt}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-lg text-white font-medium text-sm transition-all hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    style={{ backgroundColor: "#1B2B4B" }}
                  >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    Evet, Siparişin Devamı
                  </button>
                  <button
                    onClick={() => createDosya(proformData, null)}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-lg text-slate-600 font-medium text-sm border hover:bg-slate-50 transition-all disabled:opacity-50"
                    style={{ borderColor: "#E2E8F0" }}
                  >
                    Hayır, Bağımsız Dosya
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3 mb-5">
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                    <AlertCircle size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800">Yeni sipariş takibi başlatılsın mı?</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      Bu proforma kısmi sevkiyatlarla (10+10+5 gibi) gönderilecekse, toplam taahhüt miktarını kaydedip takip edebiliriz.
                    </p>
                  </div>
                </div>

                <div className="mb-5">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Toplam Taahhüt Edilen Miktar (MTS)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={yeniSiparisMts}
                      onChange={(e) => setYeniSiparisMts(e.target.value)}
                      className="w-full px-3 py-2 pr-14 border rounded-lg text-sm"
                      style={{ borderColor: "#E2E8F0" }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium pointer-events-none">MTS</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleYeniAnaSiparisOlustur}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-lg text-white font-medium text-sm transition-all hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    style={{ backgroundColor: "#1B2B4B" }}
                  >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    Sipariş Takibini Başlat
                  </button>
                  <button
                    onClick={() => createDosya(proformData, null)}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-lg text-slate-600 font-medium text-sm border hover:bg-slate-50 transition-all disabled:opacity-50"
                    style={{ borderColor: "#E2E8F0" }}
                  >
                    Hayır, Tek Seferlik Dosya
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "success" && (
          <div className="bg-white rounded-xl border shadow-sm p-12 text-center" style={{ borderColor: "#E2E8F0" }}>
            <Check size={40} className="mx-auto text-green-500 mb-4" />
            <p className="text-slate-700 font-medium">Tamamlandi!</p>
          </div>
        )}

        {step === "reservation_choice" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div className="bg-white rounded-xl border shadow-sm p-6" style={{ borderColor: "#E2E8F0" }}>
                <h3 className="font-semibold text-slate-800 mb-1">Rezervasyon Ekle</h3>
                <p className="text-sm text-slate-500 mb-4">Booking no, cut-off tarihleri ve yukleme bilgilerini girin.</p>
                <button
                  onClick={() => router.push(`/dosya/${dosyaId}?tab=rezervasyon&action=new`)}
                  className="w-full py-2.5 rounded-lg text-white font-medium text-sm transition-all hover:opacity-90"
                  style={{ backgroundColor: "#1B2B4B" }}
                >
                  Rezervasyon Ekle
                </button>
              </div>

              <div className="bg-white rounded-xl border shadow-sm p-6" style={{ borderColor: "#E2E8F0" }}>
                <h3 className="font-semibold text-slate-800 mb-1">Acentelerden Teklif Al</h3>
                <p className="text-sm text-slate-500 mb-4">Kayitli acentelerinize freight teklifi isteyin.</p>
                <AcenteTeklifSection dosyaId={dosyaId!} proformData={proformData} userId={user!.id} />
              </div>
            </div>
          </div>
        )}

        {step === "review" && proformData && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div className="bg-white rounded-xl border shadow-sm p-6 space-y-4" style={{ borderColor: "#E2E8F0" }}>
                <h3 className="font-semibold text-sm" style={{ color: "#1B2B4B" }}>Satici & Alici Bilgileri</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-slate-400">Satici Firma</p><p className="font-medium text-slate-700">{proformData.satici_firma}</p></div>
                  <div><p className="text-xs text-slate-400">Alici Firma</p><p className="font-medium text-slate-700">{proformData.alici_firma}</p></div>
                </div>
                <h3 className="font-semibold text-sm pt-2" style={{ color: "#1B2B4B" }}>Proforma Bilgileri</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-slate-400">Proforma No</p><p className="font-medium text-slate-700">{proformData.proforma_no}</p></div>
                  <div><p className="text-xs text-slate-400">Proforma Tarihi</p><p className="font-medium text-slate-700">{proformData.proforma_tarihi}</p></div>
                  <div><p className="text-xs text-slate-400">Gecerlilik Tarihi</p><p className="font-medium text-slate-700">{proformData.gecerlilik_tarihi}</p></div>
                  <div><p className="text-xs text-slate-400">Lot No</p><p className="font-medium text-slate-700">{proformData.lot_no}</p></div>
                </div>
                <h3 className="font-semibold text-sm pt-2" style={{ color: "#1B2B4B" }}>Finansal</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-slate-400">Toplam Tutar</p><p className="font-medium text-slate-700">{formatCurrency(proformData.toplam_tutar, proformData.para_birimi)}</p></div>
                  <div><p className="text-xs text-slate-400">Toplam Miktar</p><p className="font-medium text-slate-700">{proformData.toplam_miktar || proformData.miktar} {proformData.miktar_birimi}</p></div>
                  <div><p className="text-xs text-slate-400">Ambalaj</p><p className="font-medium text-slate-700">{proformData.ambalaj}</p></div>
                </div>
              </div>

              <div className="bg-white rounded-xl border shadow-sm p-6 space-y-4" style={{ borderColor: "#E2E8F0" }}>
                <h3 className="font-semibold text-sm" style={{ color: "#1B2B4B" }}>Lojistik</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-slate-400">Varis Limani</p><p className="font-medium text-slate-700">{proformData.varis_limani}</p></div>
                  <div><p className="text-xs text-slate-400">Yukleme Limani</p><p className="font-medium text-slate-700">{proformData.yuklenme_limani || proformData.yukleme_limani}</p></div>
                  <div><p className="text-xs text-slate-400">Teslim Sekli</p><p className="font-medium text-slate-700">{proformData.teslim_sekli}</p></div>
                  <div><p className="text-xs text-slate-400">Odeme Sekli</p><p className="font-medium text-slate-700">{proformData.odeme_sekli}</p></div>
                </div>
                <h3 className="font-semibold text-sm pt-2" style={{ color: "#1B2B4B" }}>Banka Bilgileri</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-slate-400">Hesap Adi</p><p className="font-medium text-slate-700">{proformData.banka_bilgileri?.hesap_adi || proformData.hesap_adi}</p></div>
                  <div><p className="text-xs text-slate-400">Banka</p><p className="font-medium text-slate-700">{proformData.banka_bilgileri?.banka_adi || proformData.banka}</p></div>
                  <div><p className="text-xs text-slate-400">SWIFT</p><p className="font-medium text-slate-700">{proformData.banka_bilgileri?.swift || proformData.swift}</p></div>
                  <div><p className="text-xs text-slate-400">IBAN</p><p className="font-medium text-slate-700 break-all">{proformData.banka_bilgileri?.iban || proformData.iban}</p></div>
                </div>
              </div>
            </div>

            {proformData.urun_detaylari && proformData.urun_detaylari.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
                <div className="px-6 py-4 border-b" style={{ borderColor: "#E2E8F0" }}>
                  <h3 className="font-semibold text-sm" style={{ color: "#1B2B4B" }}>Urun Detaylari</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-slate-50" style={{ borderColor: "#E2E8F0" }}>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">URUN ADI</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">AMBALAJ</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">MIKTAR (MTS)</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">BIRIM FIYAT</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">TOPLAM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proformData.urun_detaylari.map((item: any, i: number) => (
                        <tr key={i} className="border-b last:border-0" style={{ borderColor: "#F1F5F9" }}>
                          <td className="px-4 py-3 text-sm text-slate-700">{item.description || item.urun_adi}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{item.packaging_size || item.ambalaj_boyutu}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 text-right">{item.quantity || item.miktar_mts}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 text-right">{formatCurrency(item.unit_price || item.birim_fiyat_usd, proformData.para_birimi)}</td>
                          <td className="px-4 py-3 text-sm text-slate-700 text-right font-medium">{formatCurrency(item.total_amount || item.toplam_tutar_usd, proformData.para_birimi)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50">
                        <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-right" style={{ color: "#1B2B4B" }}>TOPLAM</td>
                        <td className="px-4 py-3 text-sm font-bold text-right" style={{ color: "#1B2B4B" }}>
                          {formatCurrency(proformData.urun_detaylari.reduce((s: number, u: any) => s + parseFloat(String(u.total_amount || u.toplam_tutar_usd || 0)), 0), proformData.para_birimi)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => router.push(`/dosya/${dosyaId}`)}
                className="px-6 py-2.5 rounded-lg text-white font-medium text-sm transition-all hover:opacity-90"
                style={{ backgroundColor: "#1B2B4B" }}
              >
                Dosyayi Goruntule
              </button>
              <button
                onClick={() => router.push("/panel")}
                className="px-6 py-2.5 rounded-lg text-slate-600 font-medium text-sm border hover:bg-slate-50 transition-all"
                style={{ borderColor: "#E2E8F0" }}
              >
                Ana Panele Don
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
