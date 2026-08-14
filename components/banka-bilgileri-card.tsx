"use client";
import React, { useState } from "react";
import { supabase, Dosya } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { CopyableField } from "@/components/copyable-field";
import { Pencil, Check, X, Banknote } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";

type Props = {
  dosya: Dosya;
  onRefresh: () => void;
  companyId: string; // SaaS şirket bazlı izolasyon için eklendi
};

/**
 * Banka bilgilerini (Hesap Adi, Banka, SWIFT, IBAN, Hesap Numarasi) gosterir
 * ve kendi basina, Ek Bilgiler karti ile ilgisiz, bagimsiz duzenlenebilir kilar.
 */
export default function BankaBilgileriCard({ dosya, onRefresh, companyId }: Props) { // companyId eklendi
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
    await supabase.from("ihracat_dosyalari").update(payload).eq("id", dosya.id).eq("company_id", companyId); // Şirket kilidi enjekte edildi
    showToast("Banka bilgileri guncellendi.", "success");
    setSaving(false);
    setEditing(false);
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 border-b pb-2" style={{ borderColor: CARD_BORDER }}>
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Banka Bilgileri</h3>
        {!editing ? (
          <button onClick={handleEditStart} className="text-amber-400 hover:text-amber-300 text-xs font-medium inline-flex items-center gap-1">
            <Pencil size={12} /> Duzenle
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="text-green-400 hover:text-green-300 text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50">
              <Check size={12} /> {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <button onClick={() => setEditing(false)} className="hover:text-white text-xs font-medium inline-flex items-center gap-1" style={{ color: TEXT_MUTED }}>
              <X size={12} /> Iptal
            </button>
          </div>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-2 gap-3">
          <CopyableField dark label="Hesap Adi" value={(dosya as any).hesap_adi} />
          <CopyableField dark label="Banka" value={(dosya as any).banka} />
          <CopyableField dark label="SWIFT" value={(dosya as any).swift} monospace />
          <CopyableField dark label="Hesap Numarası" value={(dosya as any).hesap_numarasi} monospace />
          <CopyableField dark label="IBAN" value={(dosya as any).iban} monospace />
        </div>
      ) : (
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
      )}
    </div>
  );
}