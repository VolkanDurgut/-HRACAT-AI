"use client";
import React, { useEffect, useState } from "react";
import { supabase, FumigationAyari } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { Loader2, X, FlameKindling } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

type Props = {
  aliciFirma: string;
  open: boolean;
  onClose: () => void;
  onSaved: (ayar: FumigationAyari) => void;
};

const VARSAYILAN: Omit<FumigationAyari, "id" | "alici_firma" | "updated_at"> = {
  fumigant: "ALPH3",
  fumigasyon_dozu: "3,54 gr/m3",
  sicaklik: "30",
  baslangic_saati: "10:00",
  bitis_saati: "10:00",
  min_exp_period: "120 HOURS",
  aeration_period: "2 HOUR AFTER OPENING",
};

export default function FumigationAyarModal({ aliciFirma, open, onClose, onSaved }: Props) {
  const { showToast } = useToast();
  const { companyId } = useAuth(); // SaaS: kayit/insert'te sirket izolasyonu icin gerekli
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...VARSAYILAN });

  // Modal acilinca mevcut ayarlari yukle
  useEffect(() => {
    if (!open || !aliciFirma || !companyId) return;
    const fetchAyar = async () => {
      const { data } = await supabase
        .from("fumigation_ayarlari")
        .select("*")
        .eq("alici_firma", aliciFirma)
        .eq("company_id", companyId)
        .single();
      if (data) {
        setForm({
          fumigant:         data.fumigant         ?? VARSAYILAN.fumigant,
          fumigasyon_dozu:  data.fumigasyon_dozu  ?? VARSAYILAN.fumigasyon_dozu,
          sicaklik:         data.sicaklik         ?? VARSAYILAN.sicaklik,
          baslangic_saati:  data.baslangic_saati  ?? VARSAYILAN.baslangic_saati,
          bitis_saati:      data.bitis_saati      ?? VARSAYILAN.bitis_saati,
          min_exp_period:   data.min_exp_period   ?? VARSAYILAN.min_exp_period,
          aeration_period:  data.aeration_period  ?? VARSAYILAN.aeration_period,
        });
      } else {
        setForm({ ...VARSAYILAN });
      }
    };
    fetchAyar();
  }, [open, aliciFirma, companyId]);

  const handleSave = async () => {
    if (!companyId) {
      showToast("Şirket bilgisi henüz yüklenmedi. Lütfen birkaç saniye sonra tekrar deneyin.", "error");
      return;
    }
    setSaving(true);
    try {
      const { data: mevcut } = await supabase
        .from("fumigation_ayarlari")
        .select("id")
        .eq("alici_firma", aliciFirma)
        .eq("company_id", companyId)
        .single();

      let saved: FumigationAyari | null = null;
      let saveError: string | null = null;

      if (mevcut) {
        const { data, error } = await supabase
          .from("fumigation_ayarlari")
          .update({ ...form, updated_at: new Date().toISOString() })
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
          .from("fumigation_ayarlari")
          .insert({ alici_firma: aliciFirma, company_id: companyId, ...form, updated_at: new Date().toISOString() })
          .select()
          .single();
        saved = data;
        saveError = error?.message || null;
      }

      if (saved) {
        showToast("Fumigasyon ayarları kaydedildi.", "success");
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

  const inputClass = "w-full border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-400";
  const inputStyle = { borderColor: CARD_BORDER, backgroundColor: CARD_BG };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" style={{ backgroundColor: CARD_BG }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div className="flex items-center gap-2">
            <FlameKindling size={16} style={{ color: ACCENT }} />
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Fumigasyon Ayarları</h2>
          </div>
          <button onClick={onClose} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }}>
            <X size={18} />
          </button>
        </div>

        {/* Firma bilgisi */}
        <div className="px-6 pt-4 pb-2">
          <p className="text-xs" style={{ color: TEXT_MUTED }}>
            <span className="font-semibold text-white">{aliciFirma}</span> için fumigasyon ayarları.
            Bu ayarlar aynı müşterinin gelecek dosyalarında otomatik kullanılır.
          </p>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Fumigant</label>
              <input className={inputClass} style={inputStyle} value={form.fumigant ?? ""} onChange={e => setForm(f => ({ ...f, fumigant: e.target.value }))} placeholder="ALPH3" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Fumigation Dosage (gr/m3)</label>
              <input className={inputClass} style={inputStyle} value={form.fumigasyon_dozu ?? ""} onChange={e => setForm(f => ({ ...f, fumigasyon_dozu: e.target.value }))} placeholder="3,54 gr/m3" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Temperature</label>
            <input className={inputClass} style={inputStyle} value={form.sicaklik ?? ""} onChange={e => setForm(f => ({ ...f, sicaklik: e.target.value }))} placeholder="30" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Commance Fumigation (Saat)</label>
              <input className={inputClass} style={inputStyle} value={form.baslangic_saati ?? ""} onChange={e => setForm(f => ({ ...f, baslangic_saati: e.target.value }))} placeholder="10:00" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Completed Fumigation (Saat)</label>
              <input className={inputClass} style={inputStyle} value={form.bitis_saati ?? ""} onChange={e => setForm(f => ({ ...f, bitis_saati: e.target.value }))} placeholder="10:00" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Min. Exp. Period</label>
              <input className={inputClass} style={inputStyle} value={form.min_exp_period ?? ""} onChange={e => setForm(f => ({ ...f, min_exp_period: e.target.value }))} placeholder="120 HOURS" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Aeration Period</label>
              <input className={inputClass} style={inputStyle} value={form.aeration_period ?? ""} onChange={e => setForm(f => ({ ...f, aeration_period: e.target.value }))} placeholder="2 HOUR AFTER OPENING" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: CARD_BORDER }}>
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
  );
}
