"use client";
import React, { useState } from "react";
import { supabase, Dosya, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { CopyableField } from "@/components/copyable-field";
import { CokluNoGirisi, cokluNoSatirlari } from "@/components/coklu-no-girisi";
import { noParcala, noBirlestir } from "@/lib/coklu-no";
import { formatDateTR } from "@/lib/cutoff-utils";
import { Pencil, Check, X, FileText } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

type Props = {
  dosya: Dosya;
  onRefresh: () => void;
  companyId: string;
};

/**
 * Dosya detayi > Proforma Bilgileri > "Proforma" bolumu (01.10.2026).
 *
 * Eskiden app/dosya/[id]/page.tsx icinde salt-okunur bir bloktu; Proforma No
 * hicbir yerden duzenlenemiyordu. Artik diger kartlar (Taraflar, Lojistik...)
 * gibi "Duzenle" ile acilan pencerede Proforma No ve Lot No duzenlenir ve
 * ikinci bir numara eklenebilir (bkz. lib/coklu-no.ts - "A / B" bicimi).
 */
export default function ProformaCard({ dosya, onRefresh, companyId }: Props) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [proformaNolari, setProformaNolari] = useState<string[]>([]);
  const [lotNolari, setLotNolari] = useState<string[]>([]);

  const handleEditStart = () => {
    setProformaNolari(noParcala(dosya.proforma_no));
    setLotNolari(noParcala(dosya.lot_no));
    setEditing(true);
  };

  const handleSave = async () => {
    const proformaNo = noBirlestir(proformaNolari);
    if (!proformaNo) {
      showToast("En az bir Proforma No girilmeli.", "error");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("ihracat_dosyalari")
      .update({ proforma_no: proformaNo, lot_no: noBirlestir(lotNolari) })
      .eq("id", dosya.id)
      .eq("company_id", companyId)
      .select("id");
    setSaving(false);
    const hata = yazmaHatasi(error, data);
    if (hata) {
      // Kayit basarisiz: pencere ACIK kalir, girilen bilgiler kaybolmaz.
      showToast(`Proforma bilgileri kaydedilemedi: ${hata}`, "error");
      return;
    }
    showToast("Proforma bilgileri güncellendi.", "success");
    setEditing(false);
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3 border-b pb-2" style={{ borderColor: CARD_BORDER }}>
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: ACCENT }}>Proforma</h3>
        <div className="flex items-center gap-3">
          {/* Talep (26.09.2026): orijinal proforma PDF'ini goruntuleme. Sadece
              PDF'i storage'a kaydedilmis dosyalarda gorunur. */}
          {dosya.proforma_dosya_url && (
            <a
              href={dosya.proforma_dosya_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium hover:text-white transition-colors"
              style={{ color: TEXT_MUTED }}
              title="Orijinal proforma PDF'ini yeni sekmede aç"
            >
              <FileText size={12} /> Görüntüle
            </a>
          )}
          <button onClick={handleEditStart} className="text-amber-400 hover:text-amber-300 text-xs font-medium inline-flex items-center gap-1">
            <Pencil size={12} /> Düzenle
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <CopyableField dark label="Proforma No" value={dosya.proforma_no} gosterim={cokluNoSatirlari(dosya.proforma_no)} />
        <CopyableField dark label="Proforma Tarihi" value={formatDateTR(dosya.proforma_tarihi)} />
        <CopyableField dark label="Geçerlilik Tarihi" value={formatDateTR(dosya.gecerlilik_tarihi)} />
        <CopyableField dark label="Lot No" value={dosya.lot_no} gosterim={cokluNoSatirlari(dosya.lot_no)} />
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditing(false)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto p-6 animate-fade-up" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Proformayı Düzenle</h3>
              <button onClick={() => setEditing(false)} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }}><X size={18} /></button>
            </div>
            <p className="text-xs mb-4" style={{ color: TEXT_MUTED }}>
              Sevkiyat iki proformayı kapsıyorsa ikinci numarayı ekleyin. Numaralar fatura talimatında ve tüm evraklarda birlikte gösterilir.
            </p>
            <div className="space-y-4">
              <CokluNoGirisi etiket="Proforma No" ekEtiket="ikinci proforma" degerler={proformaNolari} onChange={setProformaNolari} />
              <CokluNoGirisi etiket="Lot No" ekEtiket="ikinci lot" degerler={lotNolari} onChange={setLotNolari} />
            </div>
            <div className="flex gap-2 mt-6">
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
