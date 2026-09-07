"use client";
import React, { useState } from "react";
import { supabase, Dosya } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { CopyableField } from "@/components/copyable-field";
import { formatCurrency } from "@/lib/cutoff-utils";
import { Pencil, Check, X } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

type Props = {
  dosya: Dosya;
  onRefresh: () => void;
  companyId: string;
};

/**
 * Odeme bilgilerini (Toplam Tutar, Avans Tutari, Odeme Sekli) gosterir ve
 * duzenlenebilir kilar. avans_tutari ham_veri JSONB icinde tutuluyor -
 * kaydederken ham_veri'nin diger alanlarini KORUYARAK sadece bunu gunceller.
 */
export default function OdemeCard({ dosya, onRefresh, companyId }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const buildEmptyForm = () => ({
    toplam_tutar: dosya.toplam_tutar != null ? String(dosya.toplam_tutar) : "",
    avans_tutari: (dosya.ham_veri as any)?.avans_tutari != null ? String((dosya.ham_veri as any).avans_tutari) : "",
    odeme_sekli: dosya.odeme_sekli || "",
  });
  const [form, setForm] = useState(buildEmptyForm);

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditStart = () => {
    setForm(buildEmptyForm());
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const avansSayi = form.avans_tutari.trim() === "" ? null : parseFloat(form.avans_tutari.replace(",", "."));
    const guncelHamVeri = { ...(dosya.ham_veri as any || {}), avans_tutari: avansSayi };
    const payload = {
      toplam_tutar: form.toplam_tutar.trim() === "" ? null : parseFloat(form.toplam_tutar.replace(",", ".")),
      odeme_sekli: form.odeme_sekli || null,
      ham_veri: guncelHamVeri,
    };
    await supabase.from("ihracat_dosyalari").update(payload).eq("id", dosya.id).eq("company_id", companyId);
    showToast("Odeme bilgileri güncellendi.", "success");
    setSaving(false);
    setEditing(false);
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 border-b pb-2" style={{ borderColor: CARD_BORDER }}>
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Odeme</h3>
        <button onClick={handleEditStart} className="text-amber-400 hover:text-amber-300 text-xs font-medium inline-flex items-center gap-1">
          <Pencil size={12} /> Duzenle
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CopyableField dark label="Toplam Tutar" value={formatCurrency(dosya.toplam_tutar, dosya.para_birimi)} />
        <CopyableField dark label="Avans Tutari" value={formatCurrency((dosya.ham_veri as any)?.avans_tutari, dosya.para_birimi)} />
        <CopyableField dark label="Odeme Sekli" value={dosya.odeme_sekli} />
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditing(false)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto p-6 animate-fade-up" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Odemeyi Duzenle</h3>
              <button onClick={() => setEditing(false)} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }}><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Toplam Tutar ({dosya.para_birimi || "USD"})</label>
                <input value={form.toplam_tutar} onChange={(e) => update("toplam_tutar", e.target.value)} inputMode="decimal" className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Avans Tutari ({dosya.para_birimi || "USD"})</label>
                <input value={form.avans_tutari} onChange={(e) => update("avans_tutari", e.target.value)} inputMode="decimal" className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Odeme Sekli</label>
                <textarea value={form.odeme_sekli} onChange={(e) => update("odeme_sekli", e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg text-sm text-white resize-none" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 hover:opacity-90" style={{ backgroundColor: ACCENT }}>
                <Check size={14} /> {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                Iptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}