"use client";
import React, { useState } from "react";
import { supabase, Dosya } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { CopyableField } from "@/components/copyable-field";
import { Pencil, Check, X, Banknote } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

type Props = {
  dosya: Dosya;
  onRefresh: () => void;
  companyId: string; // SaaS şirket bazlı izolasyon için eklendi
};

/**
 * Banka bilgilerini (Hesap Adi, Banka, SWIFT, IBAN, Hesap Numarasi) gosterir
 * ve kendi basina, Ek Bilgiler karti ile ilgisiz, bagimsiz duzenlenebilir kilar.
 */
export default function BankaBilgileriCard({ dosya, onRefresh, companyId }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const buildEmptyForm = () => ({
    hesap_adi: (dosya as any).hesap_adi || "",
    banka: (dosya as any).banka || "",
    swift: (dosya as any).swift || "",
    hesap_numarasi: (dosya as any).hesap_numarasi || "",
    iban: (dosya as any).iban || "",
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
    const payload = {
      hesap_adi: form.hesap_adi || null,
      banka: form.banka || null,
      swift: form.swift || null,
      hesap_numarasi: form.hesap_numarasi || null,
      iban: form.iban || null,
    };
    await supabase.from("ihracat_dosyalari").update(payload).eq("id", dosya.id).eq("company_id", companyId);
    showToast("Banka bilgileri guncellendi.", "success");
    setSaving(false);
    setEditing(false);
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 border-b pb-2" style={{ borderColor: CARD_BORDER }}>
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Banka Bilgileri</h3>
        <button onClick={handleEditStart} className="text-amber-400 hover:text-amber-300 text-xs font-medium inline-flex items-center gap-1">
          <Pencil size={12} /> Duzenle
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CopyableField dark label="Hesap Adi" value={(dosya as any).hesap_adi} />
        <CopyableField dark label="Banka" value={(dosya as any).banka} />
        <CopyableField dark label="SWIFT" value={(dosya as any).swift} monospace />
        <CopyableField dark label="Hesap Numarası" value={(dosya as any).hesap_numarasi} monospace />
        <CopyableField dark label="IBAN" value={(dosya as any).iban} monospace />
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditing(false)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto p-6 animate-fade-up" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Banka Bilgilerini Duzenle</h3>
              <button onClick={() => setEditing(false)} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }}><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Hesap Adi</label>
                <input value={form.hesap_adi} onChange={(e) => update("hesap_adi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Banka</label>
                <input value={form.banka} onChange={(e) => update("banka", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>SWIFT</label>
                <input value={form.swift} onChange={(e) => update("swift", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Hesap Numarası</label>
                <input value={form.hesap_numarasi} onChange={(e) => update("hesap_numarasi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>IBAN</label>
                <input value={form.iban} onChange={(e) => update("iban", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
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