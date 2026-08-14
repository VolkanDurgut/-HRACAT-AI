"use client";
import React, { useState } from "react";
import { supabase, Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { formatDateTR, formatDateTimeTR } from "@/lib/cutoff-utils";
import {
  Upload, FileText, CheckCircle2, AlertTriangle, Loader2, X, RotateCcw, Banknote, FileType2, ExternalLink
} from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

type FaturaKontrolSonucu = {
  uyumlu: boolean;
  uyusmazliklar: { alan: string; sistemde: string; dosyada: string }[];
  ozet: string;
  fatura_no: string;
  fatura_tarihi: string;
  diib_no: string | null;
  diib_tarihi: string | null;
};

type Props = {
  dosya: Dosya;
  konteynerler: Konteyner[];
  rezervasyonlar: Rezervasyon[];
  onRefresh: () => void;
  companyId: string; // SaaS: şirket bazlı izolasyon
};

export default function FaturaUploadSection({ dosya, konteynerler, rezervasyonlar, onRefresh, companyId }: Props) {
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
    const toplamKap = konteynerler.reduce((s, k) => s + ((k as any).pieces || 0), 0);
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
      toplam_kap_adeti: toplamKap > 0 ? toplamKap : null,
      konteynerler: konteynerler.map((k) => ({ 
        konteyner_no: k.konteyner_no,
        net_agirlik_kg: k.net_agirlik_kg,
        brut_agirlik_kg: (k as any).brut_agirlik_kg,
        kap_adeti: (k as any).pieces
      })),
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
        diib_no: data.diib_no || dosya.diib_no,
        diib_tarihi: data.diib_tarihi || dosya.diib_tarihi,
      }).eq("id", dosya.id).eq("company_id", companyId);

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
    }).eq("id", dosya.id).eq("company_id", companyId);
    onRefresh();
  };

  return (
    <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: CARD_BORDER }}>
        <Banknote size={16} style={{ color: ACCENT }} />
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Muhasebe</h3>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-4 mb-2">
          <p className="text-sm font-medium text-white">Fatura</p>
          {dosya.fatura_dosya_url && faturaKontrolSonucu && (
            faturaKontrolSonucu.uyumlu ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full">
                <CheckCircle2 size={12} /> Yüklendi
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full">
                <AlertTriangle size={12} /> Uyuşmazlık var
              </span>
            )
          )}
        </div>

        {!dosya.fatura_dosya_url && !faturaYukleniyor && (
          konteynerlerTamam ? (
            <label className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer hover:bg-white/[0.03] transition-colors" style={{ borderColor: CARD_BORDER }}>
              <Upload size={18} style={{ color: TEXT_MUTED }} />
              <span className="text-sm" style={{ color: TEXT_MUTED }}>Fatura PDF yükle</span>
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleFaturaSec(e.target.files?.[0] || null)} />
            </label>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-not-allowed" style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
              <Upload size={18} />
              <span className="text-sm">
                Fatura yüklemeden önce tüm konteynerleri ekleyin ({eklenenKonteynerAdedi}/{rezervasyonKontAdedi || 0})
              </span>
            </div>
          )
        )}

        {faturaYukleniyor && (
          <div className="flex items-center gap-2 px-3 py-3 rounded-lg border" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
            <Loader2 size={18} className="animate-spin" style={{ color: TEXT_MUTED }} />
            <span className="text-sm" style={{ color: TEXT_MUTED }}>Fatura okunuyor ve kontrol ediliyor...</span>
          </div>
        )}

        {faturaHata && (
          <div className="mt-2 p-3 rounded-lg border bg-amber-500/10 space-y-2" style={{ borderColor: "rgba(251,191,36,0.35)" }}>
            <p className="text-sm font-medium text-amber-400">Kontrol yapılamadı</p>
            <p className="text-xs text-amber-300">{faturaHata}</p>
            <button onClick={handleFaturaYenidenYukle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20">
              <RotateCcw size={12} /> Tekrar Dene
            </button>
          </div>
        )}

        {dosya.fatura_dosya_url && faturaKontrolSonucu && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/10 text-red-400 shrink-0" title="PDF dosyası"><FileType2 size={16} /></span>
              <a href={dosya.fatura_dosya_url} target="_blank" rel="noopener noreferrer" className="text-sm text-white truncate flex-1 hover:underline">
                {dosya.fatura_dosya_adi}
              </a>
              {dosya.fatura_yukleme_tarihi && <span className="text-xs shrink-0" style={{ color: TEXT_MUTED }}>{formatDateTimeTR(dosya.fatura_yukleme_tarihi)}</span>}
              <a href={dosya.fatura_dosya_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 hover:text-white" style={{ backgroundColor: CARD_BORDER, color: TEXT_MUTED }} title="Faturayı yeni sekmede aç"><ExternalLink size={12} /> Görüntüle</a>
              <button onClick={handleFaturaYenidenYukle} className="hover:text-white shrink-0" style={{ color: TEXT_MUTED }} title="Faturayı kaldır"><X size={16} /></button>
            </div>

            {faturaKontrolSonucu.uyumlu ? (
              <div className="p-3 rounded-lg border-2 border-green-500/40" style={{ backgroundColor: ROW_HEADER_BG }}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-400" />
                  <p className="text-sm font-semibold text-green-400">Fatura bilgileri sistemle uyumlu.</p>
                </div>
                {faturaKontrolSonucu.ozet && <p className="text-xs mt-1 ml-6" style={{ color: TEXT_MUTED }}>{faturaKontrolSonucu.ozet}</p>}
                <div className="mt-2 ml-6 flex flex-wrap gap-4 text-xs" style={{ color: TEXT_MUTED }}>
                  <span>Fatura No: <strong className="text-white">{faturaKontrolSonucu.fatura_no || dosya.fatura_no || "-"}</strong></span>
                  <span>Fatura Tarihi: <strong className="text-white">{formatDateTR(faturaKontrolSonucu.fatura_tarihi || dosya.fatura_tarihi)}</strong></span>
                  {(faturaKontrolSonucu.diib_no || dosya.diib_no) && (
                    <span>DİİB No: <strong className="text-white">{faturaKontrolSonucu.diib_no || dosya.diib_no}</strong></span>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg border-2 border-red-500/40 space-y-2" style={{ backgroundColor: ROW_HEADER_BG }}>
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-400" />
                  <p className="text-sm font-semibold text-red-400">Faturada uyuşmazlık tespit edildi</p>
                </div>
                {faturaKontrolSonucu.ozet && <p className="text-xs" style={{ color: TEXT_MUTED }}>{faturaKontrolSonucu.ozet}</p>}
                {faturaKontrolSonucu.uyusmazliklar?.length > 0 && (
                  <div className="space-y-1.5">
                    {faturaKontrolSonucu.uyusmazliklar.map((u, idx) => (
                      <div key={idx} className="text-xs p-2 rounded bg-red-500/10 border border-red-500/20">
                        <p className="font-medium text-red-400">{u.alan}</p>
                        <p className="text-red-300">Sistemde: <span className="font-mono">{u.sistemde}</span></p>
                        <p className="text-red-300">Faturada: <span className="font-mono">{u.dosyada}</span></p>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={handleFaturaYenidenYukle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20">
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
