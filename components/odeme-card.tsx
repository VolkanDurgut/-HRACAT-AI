"use client";
import React, { useState } from "react";
import { supabase, Dosya, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { CopyableField } from "@/components/copyable-field";
import { formatCurrency } from "@/lib/cutoff-utils";
import { Pencil, Check, X } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { sayiOku } from "@/lib/sayi-oku";

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
    const avansSayi = form.avans_tutari.trim() === "" ? null : sayiOku(form.avans_tutari);
    // On odeme dagitimi (16.11.2026): avans elle DEGISTIRILDIYSE dosya dagitimdan cikar (avans_elle); alan bosaltilirsa
    // otomatige doner (siparis takibinde veritabani payi yeniden yazar). Degismediyse onceki durum korunur.
    const hv = (dosya.ham_veri as any) || {};
    const onceki = hv.avans_tutari != null ? Number(hv.avans_tutari) : null;
    const degisti = (avansSayi ?? null) !== (onceki ?? null);
    const avansElle = degisti ? avansSayi !== null : hv.avans_elle === true;
    const guncelHamVeri = { ...hv, avans_tutari: avansSayi, avans_elle: avansElle };
    const payload = {
      toplam_tutar: form.toplam_tutar.trim() === "" ? null : sayiOku(form.toplam_tutar),
      odeme_sekli: form.odeme_sekli || null,
      ham_veri: guncelHamVeri,
    };
    const { data, error } = await supabase
      .from("ihracat_dosyalari").update(payload).eq("id", dosya.id).eq("company_id", companyId).select("id");
    const hata = yazmaHatasi(error, data);
    if (hata) {
      // Kayit basarisiz: form ACIK kalir, girilen bilgiler kaybolmaz.
      showToast(`Ödeme bilgileri kaydedilemedi: ${hata}`, "error");
      setSaving(false);
      return;
    }
    showToast("Ödeme bilgileri güncellendi.", "success");
    setSaving(false);
    setEditing(false);
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 border-b pb-2" style={{ borderColor: CARD_BORDER }}>
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: ACCENT }}>Ödeme</h3>
        <button onClick={handleEditStart} className="text-amber-400 hover:text-amber-300 text-xs font-medium inline-flex items-center gap-1">
          <Pencil size={12} /> Düzenle
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CopyableField dark label="Toplam Tutar" value={formatCurrency(dosya.toplam_tutar, dosya.para_birimi)} />
        <CopyableField dark label="Avans Tutarı" value={formatCurrency((dosya.ham_veri as any)?.avans_tutari, dosya.para_birimi)} />
        <CopyableField dark label="Ödeme Şekli" value={dosya.odeme_sekli} />
      </div>
      {(() => {
        const hv = (dosya.ham_veri as any) || {};
        if (hv.avans_elle === true && hv.avans_dagitim) {
          return <p className="mt-2 text-[11px]" style={{ color: TEXT_MUTED }} data-testid="avans-elle">Avans elle girildi; sipariş ön ödemesi dağıtımı bu dosyayı değiştirmez (alanı boşaltırsanız otomatiğe döner).</p>;
        }
        if (hv.avans_dagitim && hv.avans_elle !== true) {
          const g = hv.avans_dagitim;
          return (
            <p className="mt-2 text-[11px]" style={{ color: TEXT_MUTED }} data-testid="avans-dagitim">
              Avans, sipariş ön ödemesinden otomatik dağıtıldı: fatura tutarı × %{String(g.oran ?? "").replace(".", ",")}
              {g.havuz != null ? ` (alınan ön ödeme ${formatCurrency(g.havuz, g.para || dosya.para_birimi)})` : ""}.
            </p>
          );
        }
        return null;
      })()}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditing(false)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto p-6 animate-fade-up" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Ödemeyi Düzenle</h3>
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
                <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Ödeme Şekli</label>
                <textarea value={form.odeme_sekli} onChange={(e) => update("odeme_sekli", e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg text-sm text-white resize-none" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 hover:opacity-90" style={{ backgroundColor: ACCENT }}>
                <Check size={14} /> {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}