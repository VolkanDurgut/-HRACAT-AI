"use client";
import React, { useState } from "react";
import { supabase, Dosya } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { CopyableField } from "@/components/copyable-field";
import { Pencil, Check, X, Banknote } from "lucide-react";

type Props = {
  dosya: Dosya;
  onRefresh: () => void;
};

/**
 * Banka bilgilerini (Hesap Adi, Banka, SWIFT, IBAN, Hesap Numarasi) gosterir
 * ve kendi basina, Ek Bilgiler karti ile ilgisiz, bagimsiz duzenlenebilir kilar.
 */
export default function BankaBilgileriCard({ dosya, onRefresh }: Props) {
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
    await supabase.from("ihracat_dosyalari").update(payload).eq("id", dosya.id);
    showToast("Banka bilgileri guncellendi.", "success");
    setSaving(false);
    setEditing(false);
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 border-b pb-2">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Banka Bilgileri</h3>
        {!editing ? (
          <button onClick={handleEditStart} className="text-amber-500 hover:text-amber-700 text-xs font-medium inline-flex items-center gap-1">
            <Pencil size={12} /> Duzenle
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="text-green-600 hover:text-green-700 text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50">
              <Check size={12} /> {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
            <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600 text-xs font-medium inline-flex items-center gap-1">
              <X size={12} /> Iptal
            </button>
          </div>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-2 gap-3">
          <CopyableField label="Hesap Adi" value={(dosya as any).hesap_adi} />
          <CopyableField label="Banka" value={(dosya as any).banka} />
          <CopyableField label="SWIFT" value={(dosya as any).swift} monospace />
          <CopyableField label="Hesap Numarası" value={(dosya as any).hesap_numarasi} monospace />
          <CopyableField label="IBAN" value={(dosya as any).iban} monospace />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Hesap Adi</label>
            <input value={form.hesap_adi} onChange={(e) => update("hesap_adi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E2E8F0" }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Banka</label>
            <input value={form.banka} onChange={(e) => update("banka", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E2E8F0" }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">SWIFT</label>
            <input value={form.swift} onChange={(e) => update("swift", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" style={{ borderColor: "#E2E8F0" }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Hesap Numarası</label>
            <input value={form.hesap_numarasi} onChange={(e) => update("hesap_numarasi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" style={{ borderColor: "#E2E8F0" }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">IBAN</label>
            <input value={form.iban} onChange={(e) => update("iban", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm font-mono" style={{ borderColor: "#E2E8F0" }} />
          </div>
        </div>
      )}
    </div>
  );
}