"use client";
import React, { useState } from "react";
import { supabase, Dosya, Rezervasyon } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { CopyableField } from "@/components/copyable-field";
import { Pencil, Check, X } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

type Props = {
  dosya: Dosya;
  rezervasyonlar: Rezervasyon[];
  onRefresh: () => void;
  companyId: string;
};

/**
 * Lojistik bilgilerini (limanlar, teslim sekli, miktar, ambalaj) gosterir ve
 * duzenlenebilir kilar. sevkiyat_suresi ham_veri JSONB icinde tutuluyor -
 * kaydederken ham_veri'nin diger alanlarini KORUYARAK sadece bunu gunceller.
 */
export default function LojistikCard({ dosya, rezervasyonlar, onRefresh, companyId }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const buildEmptyForm = () => ({
    yuklenme_limani: dosya.yuklenme_limani || rezervasyonlar[0]?.yuklenme_limani || "",
    varis_limani: dosya.varis_limani || "",
    teslim_sekli: dosya.teslim_sekli || "",
    sevkiyat_suresi: (dosya.ham_veri as any)?.sevkiyat_suresi || "",
    miktar: dosya.miktar || "",
    miktar_birimi: dosya.miktar_birimi || "",
    ambalaj: dosya.ambalaj || "",
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
    const guncelHamVeri = { ...(dosya.ham_veri as any || {}), sevkiyat_suresi: form.sevkiyat_suresi || null };
    const payload = {
      yuklenme_limani: form.yuklenme_limani || null,
      varis_limani: form.varis_limani || null,
      teslim_sekli: form.teslim_sekli || null,
      miktar: form.miktar || null,
      miktar_birimi: form.miktar_birimi || null,
      ambalaj: form.ambalaj || null,
      ham_veri: guncelHamVeri,
    };
    await supabase.from("ihracat_dosyalari").update(payload).eq("id", dosya.id).eq("company_id", companyId);
    showToast("Lojistik bilgileri güncellendi.", "success");
    setSaving(false);
    setEditing(false);
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 border-b pb-2" style={{ borderColor: CARD_BORDER }}>
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Lojistik</h3>
        <button onClick={handleEditStart} className="text-amber-400 hover:text-amber-300 text-xs font-medium inline-flex items-center gap-1">
          <Pencil size={12} /> Duzenle
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CopyableField dark label="Yukleme Limani" value={dosya.yuklenme_limani || rezervasyonlar[0]?.yuklenme_limani} />
        <CopyableField dark label="Varis Limani" value={dosya.varis_limani} />
        <CopyableField dark label="Teslim Sekli" value={dosya.teslim_sekli} />
        <CopyableField dark label="Sevkiyat Suresi" value={(dosya.ham_veri as any)?.sevkiyat_suresi} />
        <CopyableField dark label="Toplam Miktar" value={dosya.miktar ? `${dosya.miktar} ${dosya.miktar_birimi || "MTS"}` : null} />
        <CopyableField dark label="Ambalaj" value={dosya.ambalaj} />
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditing(false)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto p-6 animate-fade-up" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Lojistigi Duzenle</h3>
              <button onClick={() => setEditing(false)} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }}><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Yukleme Limani</label>
                <input value={form.yuklenme_limani} onChange={(e) => update("yuklenme_limani", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Varis Limani</label>
                <input value={form.varis_limani} onChange={(e) => update("varis_limani", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Teslim Sekli</label>
                <input value={form.teslim_sekli} onChange={(e) => update("teslim_sekli", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Sevkiyat Suresi</label>
                <input value={form.sevkiyat_suresi} onChange={(e) => update("sevkiyat_suresi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Toplam Miktar</label>
                <input value={form.miktar} onChange={(e) => update("miktar", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Miktar Birimi</label>
                <input value={form.miktar_birimi} onChange={(e) => update("miktar_birimi", e.target.value)} placeholder="MTS" className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Ambalaj</label>
                <input value={form.ambalaj} onChange={(e) => update("ambalaj", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
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