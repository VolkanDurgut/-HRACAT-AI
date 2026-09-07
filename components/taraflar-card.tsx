"use client";
import React, { useState } from "react";
import { supabase, Dosya } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { CopyableField } from "@/components/copyable-field";
import { Pencil, Check, X } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

type Props = {
  dosya: Dosya;
  onRefresh: () => void;
  companyId: string;
};

/**
 * Taraflar (Satici/Alici firma + iletisim) bilgilerini gosterir ve
 * duzenlenebilir kilar. alici_tel/alici_email dosya uzerinde ayri kolon
 * degil, ham_veri JSONB icinde tutuluyor - bu yuzden kaydederken ham_veri'nin
 * DIGER alanlarini (avans_tutari, sevkiyat_suresi vb.) KORUYARAK sadece bu
 * ikisini gunceller (tam JSONB'yi ezip diger verileri silmemek icin).
 */
export default function TaraflarCard({ dosya, onRefresh, companyId }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const buildEmptyForm = () => ({
    satici_firma: dosya.satici_firma || "",
    alici_firma: dosya.alici_firma || "",
    alici_tel: (dosya.ham_veri as any)?.alici_tel || "",
    alici_email: (dosya.ham_veri as any)?.alici_email || "",
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
    const guncelHamVeri = { ...(dosya.ham_veri as any || {}), alici_tel: form.alici_tel || null, alici_email: form.alici_email || null };
    const payload = {
      satici_firma: form.satici_firma || null,
      alici_firma: form.alici_firma || null,
      ham_veri: guncelHamVeri,
    };
    await supabase.from("ihracat_dosyalari").update(payload).eq("id", dosya.id).eq("company_id", companyId);
    showToast("Taraflar bilgileri güncellendi.", "success");
    setSaving(false);
    setEditing(false);
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 border-b pb-2" style={{ borderColor: CARD_BORDER }}>
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Taraflar</h3>
        <button onClick={handleEditStart} className="text-amber-400 hover:text-amber-300 text-xs font-medium inline-flex items-center gap-1">
          <Pencil size={12} /> Duzenle
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CopyableField dark label="Satici Firma" value={dosya.satici_firma} />
        <CopyableField dark label="Alici Firma" value={dosya.alici_firma} />
        <CopyableField dark label="Alici Tel" value={(dosya.ham_veri as any)?.alici_tel} />
        <CopyableField dark label="Alici Email" value={(dosya.ham_veri as any)?.alici_email} />
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditing(false)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto p-6 animate-fade-up" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Taraflari Duzenle</h3>
              <button onClick={() => setEditing(false)} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }}><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Satici Firma</label>
                <input value={form.satici_firma} onChange={(e) => update("satici_firma", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Alici Firma</label>
                <input value={form.alici_firma} onChange={(e) => update("alici_firma", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Alici Tel</label>
                <input value={form.alici_tel} onChange={(e) => update("alici_tel", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Alici Email</label>
                <input value={form.alici_email} onChange={(e) => update("alici_email", e.target.value)} type="email" className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
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