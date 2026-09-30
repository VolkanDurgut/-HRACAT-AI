"use client";
import React, { useEffect, useState } from "react";
import { supabase, KaliteSertifikasiAyari, KaliteParametresi } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { Loader2, X, FlaskConical, Plus, Trash2 } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { VARSAYILAN_KALITE_PARAMETRELERI } from "@/lib/kalite-sertifikasi-builder";

type Props = {
  aliciFirma: string;
  open: boolean;
  onClose: () => void;
  onSaved: (ayar: KaliteSertifikasiAyari) => void;
};

const BOS_SATIR: KaliteParametresi = { parametre: "", spesifikasyon: "", sonuc: "", metod: "" };

export default function KaliteSertifikasiAyarModal({ aliciFirma, open, onClose, onSaved }: Props) {
  const { showToast } = useToast();
  const { companyId } = useAuth(); // SaaS: kayit/insert'te sirket izolasyonu icin gerekli
  const [saving, setSaving] = useState(false);
  const [satirlar, setSatirlar] = useState<KaliteParametresi[]>(VARSAYILAN_KALITE_PARAMETRELERI);

  // Modal acilinca mevcut ayarlari yukle
  useEffect(() => {
    if (!open || !aliciFirma || !companyId) return;
    const fetchAyar = async () => {
      const { data } = await supabase
        .from("kalite_sertifikasi_ayarlari")
        .select("*")
        .eq("alici_firma", aliciFirma)
        .eq("company_id", companyId)
        .single();
      if (data && Array.isArray(data.parametreler) && data.parametreler.length > 0) {
        setSatirlar(data.parametreler);
      } else {
        setSatirlar(VARSAYILAN_KALITE_PARAMETRELERI);
      }
    };
    fetchAyar();
  }, [open, aliciFirma, companyId]);

  const satirGuncelle = (index: number, alan: keyof KaliteParametresi, deger: string) => {
    setSatirlar((prev) => prev.map((s, i) => (i === index ? { ...s, [alan]: deger } : s)));
  };

  const satirEkle = () => setSatirlar((prev) => [...prev, { ...BOS_SATIR }]);
  const satirSil = (index: number) => setSatirlar((prev) => prev.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!companyId) {
      showToast("Şirket bilgisi henüz yüklenmedi. Lütfen birkaç saniye sonra tekrar deneyin.", "error");
      return;
    }
    setSaving(true);
    try {
      // Tamamen bos satirlari (hic bir alani doldurulmamis) kaydetmeden once temizle
      const temizSatirlar = satirlar.filter(
        (s) => s.parametre.trim() || s.spesifikasyon.trim() || s.sonuc.trim() || s.metod.trim()
      );

      const { data: mevcut } = await supabase
        .from("kalite_sertifikasi_ayarlari")
        .select("id")
        .eq("alici_firma", aliciFirma)
        .eq("company_id", companyId)
        .single();

      let saved: KaliteSertifikasiAyari | null = null;
      let saveError: string | null = null;

      if (mevcut) {
        const { data, error } = await supabase
          .from("kalite_sertifikasi_ayarlari")
          .update({ parametreler: temizSatirlar, updated_at: new Date().toISOString() })
          .eq("id", mevcut.id)
          .select()
          .single();
        saved = data;
        saveError = error?.message || null;
      } else {
        // İlk kayit: company_id MUTLAKA gonderilmeli - RLS "insert_own_company"
        // politikasi (with_check: company_id = auth_company_id()) bunu zorunlu
        // kilar, eksik gonderilirse "new row violates row-level security policy" hatasi alinir.
        const { data, error } = await supabase
          .from("kalite_sertifikasi_ayarlari")
          .insert({ alici_firma: aliciFirma, company_id: companyId, parametreler: temizSatirlar, updated_at: new Date().toISOString() })
          .select()
          .single();
        saved = data;
        saveError = error?.message || null;
      }

      if (saved) {
        showToast("Kalite sertifikası ayarları kaydedildi.", "success");
        onSaved(saved);
        onClose();
      } else {
        showToast(`Kayıt sırasında hata oluştu${saveError ? `: ${saveError}` : "."}`, "error");
      }
    } catch (err) {
      showToast("Kayıt sırasında hata oluştu.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const inputClass = "w-full border rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-400";
  const inputStyle = { borderColor: CARD_BORDER, backgroundColor: CARD_BG };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="rounded-2xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden flex flex-col max-h-[90vh]" style={{ backgroundColor: CARD_BG }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: CARD_BORDER }}>
          <div className="flex items-center gap-2">
            <FlaskConical size={16} style={{ color: ACCENT }} />
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Kalite Sertifikası Ayarları</h2>
          </div>
          <button onClick={onClose} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }}>
            <X size={18} />
          </button>
        </div>

        {/* Firma bilgisi */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          <p className="text-xs" style={{ color: TEXT_MUTED }}>
            <span className="font-semibold text-white">{aliciFirma}</span> için PARAMETER / SPECIFICATION / RESULTS / METHODS tablosu.
            Bu ayarlar aynı müşterinin gelecek dosyalarında otomatik kullanılır.
          </p>
        </div>

        {/* Tablo */}
        <div className="px-6 py-3 overflow-y-auto flex-1">
          <table className="w-full border-separate" style={{ borderSpacing: "0 4px" }}>
            <thead>
              <tr className="text-[10px] font-semibold uppercase" style={{ color: TEXT_MUTED }}>
                <th className="text-left pb-1 pl-1">Parameter</th>
                <th className="text-left pb-1">Specification</th>
                <th className="text-left pb-1">Results</th>
                <th className="text-left pb-1">Methods</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((satir, i) => (
                <tr key={i}>
                  <td className="pr-1 py-0.5" style={{ minWidth: 190 }}>
                    <input className={inputClass} style={inputStyle} value={satir.parametre} onChange={(e) => satirGuncelle(i, "parametre", e.target.value)} placeholder="Parametre adı" />
                  </td>
                  <td className="pr-1 py-0.5" style={{ minWidth: 120 }}>
                    <input className={inputClass} style={inputStyle} value={satir.spesifikasyon} onChange={(e) => satirGuncelle(i, "spesifikasyon", e.target.value)} placeholder="min 13%" />
                  </td>
                  <td className="pr-1 py-0.5" style={{ minWidth: 90 }}>
                    <input className={inputClass} style={inputStyle} value={satir.sonuc} onChange={(e) => satirGuncelle(i, "sonuc", e.target.value)} placeholder="13,1" />
                  </td>
                  <td className="pr-1 py-0.5" style={{ minWidth: 110 }}>
                    <input className={inputClass} style={inputStyle} value={satir.metod} onChange={(e) => satirGuncelle(i, "metod", e.target.value)} placeholder="ISO 20483" />
                  </td>
                  <td className="py-0.5 text-center">
                    <button type="button" onClick={() => satirSil(i)} className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-white/10 transition-colors" style={{ color: TEXT_MUTED }} title="Satırı sil">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={satirEkle}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
            style={{ color: ACCENT }}
          >
            <Plus size={13} /> Satır ekle
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between gap-2 shrink-0" style={{ borderColor: CARD_BORDER }}>
          <button
            type="button"
            onClick={() => setSatirlar(VARSAYILAN_KALITE_PARAMETRELERI)}
            className="text-xs font-medium hover:underline"
            style={{ color: TEXT_MUTED }}
          >
            Varsayılan tabloya sıfırla
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/5 transition-colors" style={{ color: TEXT_MUTED }}>
              İptal
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90 transition-colors disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
