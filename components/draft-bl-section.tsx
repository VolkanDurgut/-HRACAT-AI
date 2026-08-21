"use client";
import React, { useState } from "react";
import { supabase, Dosya, Rezervasyon, Konteyner, getGuvenliDosyaUrl } from "@/lib/supabase";
import { formatDateTimeTR } from "@/lib/cutoff-utils";
import {
  Upload, CheckCircle2, AlertTriangle, Loader2, X, RotateCcw, Ship, FileType2, ExternalLink
} from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

type DraftBlKontrolSonucu = {
  uyumlu: boolean;
  uyusmazliklar: { alan: string; sistemde: string; dosyada: string }[];
  ozet: string;
  consignee?: string;
  notify?: string[];
  bl_no?: string;
};

type Props = {
  dosya: Dosya;
  konteynerler: Konteyner[];
  rezervasyonlar: Rezervasyon[];
  onRefresh: () => void;
  companyId: string; // SaaS: sirket bazli izolasyon
};

export default function DraftBlSection({ dosya, konteynerler, rezervasyonlar, onRefresh, companyId }: Props) {
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const kontrolSonucu = (dosya as any).draft_bl_kontrol_sonucu as DraftBlKontrolSonucu | null;
  const draftBlUrl = (dosya as any).draft_bl_dosya_url as string | null;
  const draftBlAdi = (dosya as any).draft_bl_dosya_adi as string | null;
  const draftBlTarihi = (dosya as any).draft_bl_yukleme_tarihi as string | null;

  // Draft BL, konsimento talimatiyla ayni sistem verisini kullanir (ayni Edge Function).
  const buildSistemVerisi = () => {
    const rez = rezervasyonlar[0];
    return {
      dosya_no: dosya.dosya_no,
      lot_no: dosya.lot_no,
      alici_firma: dosya.alici_firma,
      satici_firma: dosya.satici_firma,
      proforma_no: dosya.proforma_no,
      consignee: (dosya as any).consignee,
      yukleme_limani: dosya.yuklenme_limani || rez?.yuklenme_limani,
      varis_limani: dosya.varis_limani,
      teslim_sekli: dosya.teslim_sekli,
      gemi_adi: rez?.gemi_adi,
      sefer_no: (rez as any)?.sefer_no,
      acente_ismi: rez?.acente_ismi,
      booking_no: rez?.booking_no,
      gemi_kalkis_tarihi: rez?.gemi_kalkis_tarihi,
      konteynerler: konteynerler.map((k) => ({
        konteyner_no: k.konteyner_no,
        muhur_no: k.muhur_no,
        tip: k.tip,
        net_agirlik_kg: k.net_agirlik_kg,
        brut_agirlik_kg: (k as any).brut_agirlik_kg,
        kap_adeti: (k as any).pieces,
      })),
      beyanname_no: dosya.beyanname_no,
      fatura_no: dosya.fatura_no,
      bl_no: dosya.bl_no,
      diib_no: dosya.diib_no,
    };
  };

  const handleYukle = async (file: File) => {
    setYukleniyor(true);
    setHata(null);
    try {
      const guvenliAd = file.name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/ş/gi, "s").replace(/ğ/gi, "g").replace(/ı/gi, "i")
        .replace(/ö/gi, "o").replace(/ü/gi, "u").replace(/ç/gi, "c")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      // Kendi klasorunde saklanir: {dosya_id}/draft-bl/...
      const path = `${dosya.id}/draft-bl/${Date.now()}_${guvenliAd}`;
      const { error: uploadError } = await supabase.storage.from("konsimento-talimatlari").upload(path, file);
      if (uploadError) throw new Error(`Dosya yüklenemedi: ${uploadError.message}`);
      const dosyaUrl = await getGuvenliDosyaUrl("konsimento-talimatlari", path);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("sistem_verisi", JSON.stringify(buildSistemVerisi()));
      formData.append("belge_tipi", "draft_bl"); // Edge Function prompt'u buna gore ayarlar

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${supabaseUrl}/functions/v1/konsimento-kontrol`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: formData,
      });
      const data: DraftBlKontrolSonucu & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "Kontrol sırasında hata oluştu.");

      // Liman/gemi adi gibi alanlarda birbirini iceren degerleri kod seviyesinde filtrele
      // (orn. "MARPORT" / "ISTANBUL-MARPORT" ayni limandir).
      const normalize = (s: string) => s.toUpperCase().replace(/[^A-ZÇĞİÖŞÜ0-9]/g, "");
      const gercekUyusmazliklar = (data.uyusmazliklar || []).filter((u) => {
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
          ? "Draft BL bilgileri sistemdeki verilerle uyumludur."
          : data.ozet,
      };

      // Notify ve consignee kaynagini isaretleyerek ham_veri'yi guncelle (mevcut icerik korunur)
      const guncelHamVeri: Record<string, unknown> = { ...((dosya.ham_veri as any) || {}) };
      if (Array.isArray(data.notify) && data.notify.length > 0) {
        guncelHamVeri.notify = data.notify;
      }
      if (data.consignee) {
        guncelHamVeri.consignee_kaynak = "draft_bl";
      }

      await supabase.from("ihracat_dosyalari").update({
        draft_bl_dosya_url: dosyaUrl,
        draft_bl_dosya_adi: file.name,
        draft_bl_yukleme_tarihi: new Date().toISOString(),
        draft_bl_kontrol_sonucu: filtrelenmisData,
        // Draft BL'den okunan bilgiler otomatik doldurulur; mevcut deger varsa korunur.
        bl_no: data.bl_no || dosya.bl_no,
        consignee: data.consignee || (dosya as any).consignee,
        ham_veri: guncelHamVeri,
      }).eq("id", dosya.id).eq("company_id", companyId);

      onRefresh();
    } catch (err: any) {
      setHata(err.message || "Kontrol sırasında hata oluştu.");
    } finally {
      setYukleniyor(false);
    }
  };

  const handleDosyaSec = (file: File | null) => {
    if (!file) return;
    if (file.type !== "application/pdf") return;
    handleYukle(file);
  };

  const handleYenidenYukle = async () => {
    setHata(null);
    await supabase.from("ihracat_dosyalari").update({
      draft_bl_dosya_url: null,
      draft_bl_dosya_adi: null,
      draft_bl_yukleme_tarihi: null,
      draft_bl_kontrol_sonucu: null,
    }).eq("id", dosya.id).eq("company_id", companyId);
    onRefresh();
  };

  return (
    <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: CARD_BORDER }}>
        <Ship size={16} style={{ color: ACCENT }} />
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>İhracat Draft BL</h3>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-4 mb-2">
          <p className="text-sm font-medium text-white">Draft Konşimento</p>
          {draftBlUrl && kontrolSonucu && (
            kontrolSonucu.uyumlu ? (
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

        {!draftBlUrl && !yukleniyor && (
          <label className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer hover:bg-white/[0.03] transition-colors" style={{ borderColor: CARD_BORDER }}>
            <Upload size={18} style={{ color: TEXT_MUTED }} />
            <span className="text-sm" style={{ color: TEXT_MUTED }}>Draft BL PDF yükle</span>
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => handleDosyaSec(e.target.files?.[0] || null)} />
          </label>
        )}

        {yukleniyor && (
          <div className="flex items-center gap-2 px-3 py-3 rounded-lg border" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
            <Loader2 size={18} className="animate-spin" style={{ color: TEXT_MUTED }} />
            <span className="text-sm" style={{ color: TEXT_MUTED }}>Draft BL okunuyor ve kontrol ediliyor...</span>
          </div>
        )}

        {hata && (
          <div className="mt-2 p-3 rounded-lg border bg-amber-500/10 space-y-2" style={{ borderColor: "rgba(251,191,36,0.35)" }}>
            <p className="text-sm font-medium text-amber-400">Kontrol yapılamadı</p>
            <p className="text-xs text-amber-300">{hata}</p>
            <button onClick={handleYenidenYukle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20">
              <RotateCcw size={12} /> Tekrar Dene
            </button>
          </div>
        )}

        {draftBlUrl && kontrolSonucu && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/10 text-red-400 shrink-0" title="PDF dosyası"><FileType2 size={16} /></span>
              <a href={draftBlUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-white truncate flex-1 hover:underline">{draftBlAdi}</a>
              {draftBlTarihi && <span className="text-xs shrink-0 hidden sm:inline" style={{ color: TEXT_MUTED }}>{formatDateTimeTR(draftBlTarihi)}</span>}
              <a href={draftBlUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 hover:text-white" style={{ backgroundColor: CARD_BORDER, color: TEXT_MUTED }} title="Draft BL'yi yeni sekmede aç"><ExternalLink size={12} /> Görüntüle</a>
              <button onClick={handleYenidenYukle} className="hover:text-white shrink-0" style={{ color: TEXT_MUTED }} title="Draft BL'yi kaldır"><X size={16} /></button>
            </div>

            {kontrolSonucu.uyumlu ? (
              <div className="p-3 rounded-lg border-2 border-green-500/40" style={{ backgroundColor: ROW_HEADER_BG }}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-400" />
                  <p className="text-sm font-semibold text-green-400">Draft BL sistemle uyumlu.</p>
                </div>
                {kontrolSonucu.ozet && <p className="text-xs mt-1 ml-6" style={{ color: TEXT_MUTED }}>{kontrolSonucu.ozet}</p>}
                <div className="mt-2 ml-6 flex flex-wrap gap-4 text-xs" style={{ color: TEXT_MUTED }}>
                  {(kontrolSonucu.bl_no || dosya.bl_no) && (
                    <span>BL No: <strong className="text-white">{kontrolSonucu.bl_no || dosya.bl_no}</strong></span>
                  )}
                  {kontrolSonucu.consignee && (
                    <span>Consignee: <strong className="text-white">{kontrolSonucu.consignee}</strong></span>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg border-2 border-red-500/40 space-y-2" style={{ backgroundColor: ROW_HEADER_BG }}>
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-400" />
                  <p className="text-sm font-semibold text-red-400">Draft BL'de uyuşmazlık tespit edildi</p>
                </div>
                {kontrolSonucu.ozet && <p className="text-xs" style={{ color: TEXT_MUTED }}>{kontrolSonucu.ozet}</p>}
                {kontrolSonucu.uyusmazliklar?.length > 0 && (
                  <div className="space-y-1.5">
                    {kontrolSonucu.uyusmazliklar.map((u, idx) => (
                      <div key={idx} className="text-xs p-2 rounded bg-red-500/10 border border-red-500/20">
                        <p className="font-medium text-red-400">{u.alan}</p>
                        <p className="text-red-300">Sistemde: <span className="font-mono">{u.sistemde}</span></p>
                        <p className="text-red-300">Draft BL'de: <span className="font-mono">{u.dosyada}</span></p>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={handleYenidenYukle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20">
                  <RotateCcw size={12} /> Doğru Dosyayı Yeniden Yükle
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}