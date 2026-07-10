"use client";
import React, { useState } from "react";
import { supabase, Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { formatDateTR, formatDateTimeTR } from "@/lib/cutoff-utils";
import {
  Upload, FileText, CheckCircle2, AlertTriangle, Loader2, X, RotateCcw, Banknote
} from "lucide-react";

type FaturaKontrolSonucu = {
  uyumlu: boolean;
  uyusmazliklar: { alan: string; sistemde: string; dosyada: string }[];
  ozet: string;
  fatura_no: string;
  fatura_tarihi: string;
};

type Props = {
  dosya: Dosya;
  konteynerler: Konteyner[];
  rezervasyonlar: Rezervasyon[];
  onRefresh: () => void;
};

export default function FaturaUploadSection({ dosya, konteynerler, rezervasyonlar, onRefresh }: Props) {
  const [faturaYukleniyor, setFaturaYukleniyor] = useState(false);
  const [faturaHata, setFaturaHata] = useState<string | null>(null);

  const faturaKontrolSonucu = dosya.fatura_kontrol_sonucu as FaturaKontrolSonucu | null;

  const rezervasyonKontAdedi = rezervasyonlar.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
  const eklenenKonteynerAdedi = konteynerler.length;
  const konteynerlerTamam = rezervasyonKontAdedi > 0 && eklenenKonteynerAdedi >= rezervasyonKontAdedi;

  const buildFaturaSistemVerisi = () => {
    const rez = rezervasyonlar[0];
    const toplamNet = konteynerler.reduce((s, k) => s + (k.net_agirlik_kg || 0), 0);
    const toplamBrut = konteynerler.reduce((s, k) => s + ((k as any).brut_agirlik_kg || 0), 0);
    return {
      satici_firma: dosya.satici_firma,
      alici_firma: dosya.alici_firma,
      urun_tanimi: dosya.urun_tanimi,
      toplam_tutar: dosya.toplam_tutar,
      para_birimi: dosya.para_birimi,
      proforma_no: dosya.proforma_no,
      gemi_adi: rez?.gemi_adi,
      yukleme_limani: dosya.yuklenme_limani || rez?.yuklenme_limani,
      varis_limani: dosya.varis_limani,
      diib_no: dosya.diib_no,
      diib_tarihi: dosya.diib_tarihi,
      toplam_net_kg: toplamNet > 0 ? toplamNet : null,
      toplam_brut_kg: toplamBrut > 0 ? toplamBrut : null,
      konteynerler: konteynerler.map((k) => ({ konteyner_no: k.konteyner_no })),
    };
  };

  const handleFaturaYukle = async (file: File) => {
    setFaturaYukleniyor(true);
    setFaturaHata(null);
    try {
      const guvenliAd = file.name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/ş/gi, "s").replace(/ğ/gi, "g").replace(/ı/gi, "i")
        .replace(/ö/gi, "o").replace(/ü/gi, "u").replace(/ç/gi, "c")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `fatura/${dosya.id}/${Date.now()}_${guvenliAd}`;
      const { error: uploadError } = await supabase.storage.from("konsimento-talimatlari").upload(path, file);
      if (uploadError) throw new Error(`Dosya yüklenemedi: ${uploadError.message}`);
      const { data: urlData } = supabase.storage.from("konsimento-talimatlari").getPublicUrl(path);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("sistem_verisi", JSON.stringify(buildFaturaSistemVerisi()));
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${supabaseUrl}/functions/v1/fatura-kontrol`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: formData,
      });
      const data: FaturaKontrolSonucu & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "Kontrol sırasında hata oluştu.");

      await supabase.from("ihracat_dosyalari").update({
        fatura_dosya_url: urlData.publicUrl,
        fatura_dosya_adi: file.name,
        fatura_yukleme_tarihi: new Date().toISOString(),
        fatura_kontrol_sonucu: data,
        fatura_no: data.fatura_no || dosya.fatura_no,
        fatura_tarihi: data.fatura_tarihi || dosya.fatura_tarihi,
      }).eq("id", dosya.id);

      onRefresh();
    } catch (err: any) {
      setFaturaHata(err.message || "Kontrol sırasında hata oluştu.");
    } finally {
      setFaturaYukleniyor(false);
    }
  };

  const handleFaturaSec = (file: File | null) => {
    if (!file) return;
    if (file.type !== "application/pdf") return;
    if (!konteynerlerTamam) return;
    handleFaturaYukle(file);
  };

  const handleFaturaYenidenYukle = async () => {
    setFaturaHata(null);
    await supabase.from("ihracat_dosyalari").update({
      fatura_dosya_url: null,
      fatura_dosya_adi: null,
      fatura_yukleme_tarihi: null,
      fatura_kontrol_sonucu: null,
    }).eq("id", dosya.id);
    onRefresh();
  };

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
      <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: "#E2E8F0" }}>
        <Banknote size={16} style={{ color: "#1B2B4B" }} />
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Muhasebe</h3>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-4 mb-2">
          <p className="text-sm font-medium text-slate-700">Fatura</p>
          {dosya.fatura_dosya_url && faturaKontrolSonucu && (
            faturaKontrolSonucu.uyumlu ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                <CheckCircle2 size={12} /> Yüklendi
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                <AlertTriangle size={12} /> Uyuşmazlık var
              </span>
            )
          )}
        </div>

        {!dosya.fatura_dosya_url && !faturaYukleniyor && (
          konteynerlerTamam ? (
            <label className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer hover:bg-slate-50 transition-colors" style={{ borderColor: "#CBD5E1" }}>
              <Upload size={18} className="text-slate-400" />
              <span className="text-sm text-slate-600">Fatura PDF yükle</span>
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFaturaSec(e.target.files?.[0] || null)} />
            </label>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed">
              <Upload size={18} />
              <span className="text-sm">
                Fatura yüklemeden önce tüm konteynerleri ekleyin ({eklenenKonteynerAdedi}/{rezervasyonKontAdedi || 0})
              </span>
            </div>
          )
        )}

        {faturaYukleniyor && (
          <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-slate-50 border" style={{ borderColor: "#E2E8F0" }}>
            <Loader2 size={18} className="text-slate-500 animate-spin" />
            <span className="text-sm text-slate-600">Fatura okunuyor ve kontrol ediliyor...</span>
          </div>
        )}

        {faturaHata && (
          <div className="mt-2 p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
            <p className="text-sm font-medium text-amber-800">Kontrol yapılamadı</p>
            <p className="text-xs text-amber-700">{faturaHata}</p>
            <button onClick={handleFaturaYenidenYukle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200">
              <RotateCcw size={12} /> Tekrar Dene
            </button>
          </div>
        )}

        {dosya.fatura_dosya_url && faturaKontrolSonucu && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-white border" style={{ borderColor: "#E2E8F0" }}>
              <FileText size={16} className="text-slate-500 shrink-0" />
              <a href={dosya.fatura_dosya_url} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-700 truncate flex-1 hover:underline">
                {dosya.fatura_dosya_adi}
              </a>
              {dosya.fatura_yukleme_tarihi && <span className="text-xs text-slate-400 shrink-0">{formatDateTimeTR(dosya.fatura_yukleme_tarihi)}</span>}
              <button onClick={handleFaturaYenidenYukle} className="text-slate-400 hover:text-slate-600 shrink-0"><X size={16} /></button>
            </div>

            {faturaKontrolSonucu.uyumlu ? (
              <div className="p-3 rounded-lg bg-white border-2 border-green-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-600" />
                  <p className="text-sm font-semibold text-green-700">Fatura bilgileri sistemle uyumlu.</p>
                </div>
                {faturaKontrolSonucu.ozet && <p className="text-xs text-slate-500 mt-1 ml-6">{faturaKontrolSonucu.ozet}</p>}
                <div className="mt-2 ml-6 flex gap-4 text-xs text-slate-500">
                  <span>Fatura No: <strong className="text-slate-700">{faturaKontrolSonucu.fatura_no || dosya.fatura_no || "-"}</strong></span>
                  <span>Fatura Tarihi: <strong className="text-slate-700">{formatDateTR(faturaKontrolSonucu.fatura_tarihi || dosya.fatura_tarihi)}</strong></span>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-white border-2 border-red-300 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-600" />
                  <p className="text-sm font-semibold text-red-700">Faturada uyuşmazlık tespit edildi</p>
                </div>
                {faturaKontrolSonucu.ozet && <p className="text-xs text-slate-600">{faturaKontrolSonucu.ozet}</p>}
                {faturaKontrolSonucu.uyusmazliklar?.length > 0 && (
                  <div className="space-y-1.5">
                    {faturaKontrolSonucu.uyusmazliklar.map((u, idx) => (
                      <div key={idx} className="text-xs p-2 rounded bg-red-50 border border-red-100">
                        <p className="font-medium text-red-700">{u.alan}</p>
                        <p className="text-red-600">Sistemde: <span className="font-mono">{u.sistemde}</span></p>
                        <p className="text-red-600">Faturada: <span className="font-mono">{u.dosyada}</span></p>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={handleFaturaYenidenYukle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 text-red-700 hover:bg-red-100">
                  <RotateCcw size={12} /> Doğru Faturayı Yeniden Yükle
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
