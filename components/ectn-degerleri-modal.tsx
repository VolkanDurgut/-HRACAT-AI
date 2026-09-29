"use client";
import React, { useEffect, useState } from "react";
import { Dosya, Rezervasyon, supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { Loader2, X, Calculator } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { hesaplaEctnOtomatikDegerler } from "@/lib/invoice-builder";
import { formatCurrency } from "@/lib/cutoff-utils";

export type EctnOverrideDegerleri = {
  ectn_fob_override: number | null;
  ectn_freight_override: number | null;
  ectn_cfr_override: number | null;
  ectn_insurance_override: number | null;
};

type Props = {
  dosya: Dosya;
  rezervasyonlar: Rezervasyon[];
  open: boolean;
  onClose: () => void;
  onSaved: (guncel: EctnOverrideDegerleri) => void;
};

/**
 * ECTN başvurusu işaretli dosyalarda Commercial Invoice'a eklenen TOTAL FOB /
 * FREIGHT / TOTAL CFR satırlarının değerlerini elle düzeltmek için modal
 * (talep: 28.09.2026). Her alan boş bırakılırsa (veya "Otomatiğe döndür"
 * denirse) NULL kaydedilir ve belge otomatik hesaplanan değeri kullanmaya
 * devam eder - bkz. lib/invoice-builder.ts -> buildEctnSatirlari.
 */
export default function EctnDegerleriModal({ dosya, rezervasyonlar, open, onClose, onSaved }: Props) {
  const { companyId } = useAuth();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [fob, setFob] = useState<string>("");
  const [freight, setFreight] = useState<string>("");
  const [cfr, setCfr] = useState<string>("");
  const [insurance, setInsurance] = useState<string>("");

  const otomatik = hesaplaEctnOtomatikDegerler(dosya, rezervasyonlar);

  // Modal her acildiginda mevcut kaydedilmis override degerlerini forma yansit.
  useEffect(() => {
    if (!open) return;
    const d = dosya as any;
    setFob(d.ectn_fob_override !== null && d.ectn_fob_override !== undefined ? String(d.ectn_fob_override) : "");
    setFreight(d.ectn_freight_override !== null && d.ectn_freight_override !== undefined ? String(d.ectn_freight_override) : "");
    setCfr(d.ectn_cfr_override !== null && d.ectn_cfr_override !== undefined ? String(d.ectn_cfr_override) : "");
    setInsurance(d.ectn_insurance_override !== null && d.ectn_insurance_override !== undefined ? String(d.ectn_insurance_override) : "");
  }, [open, dosya]);

  const parse = (v: string): number | null => {
    const t = v.trim().replace(",", ".");
    if (t === "") return null;
    const n = parseFloat(t);
    return isNaN(n) ? null : n;
  };

  const handleSave = async () => {
    if (!companyId) {
      showToast("Şirket bilgisi henüz yüklenmedi. Lütfen birkaç saniye sonra tekrar deneyin.", "error");
      return;
    }
    setSaving(true);
    try {
      const payload: EctnOverrideDegerleri = {
        ectn_fob_override: parse(fob),
        ectn_freight_override: parse(freight),
        ectn_cfr_override: parse(cfr),
        ectn_insurance_override: parse(insurance),
      };
      const { error } = await supabase
        .from("ihracat_dosyalari")
        .update(payload)
        .eq("id", dosya.id)
        .eq("company_id", companyId);

      if (error) {
        showToast(`ECTN tutarları kaydedilemedi: ${error.message}`, "error");
      } else {
        showToast("ECTN tutarları kaydedildi.", "success");
        onSaved(payload);
        onClose();
      }
    } catch {
      showToast("ECTN tutarları kaydedilemedi.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const inputClass = "w-full border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-400";
  const inputStyle = { borderColor: CARD_BORDER, backgroundColor: CARD_BG };
  const cfrEtiket = otomatik.limanAdi ? `TOTAL CFR ${otomatik.limanAdi}` : "TOTAL CFR";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" style={{ backgroundColor: CARD_BG }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div className="flex items-center gap-2">
            <Calculator size={16} style={{ color: ACCENT }} />
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>ECTN Tutarları</h2>
          </div>
          <button onClick={onClose} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }}>
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pt-4 pb-2">
          <p className="text-xs" style={{ color: TEXT_MUTED }}>
            Commercial Invoice&apos;a eklenen ECTN satırlarını elle düzeltebilirsiniz. Boş bırakılan alan otomatik hesaplanan değeri kullanmaya devam eder.
          </p>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>
              TOTAL FOB
              {otomatik.fob !== null && (
                <span className="font-normal opacity-70"> — Otomatik: {formatCurrency(otomatik.fob, dosya.para_birimi)}</span>
              )}
            </label>
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              style={inputStyle}
              value={fob}
              onChange={(e) => setFob(e.target.value)}
              placeholder="Boş = otomatik hesaplanır"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>
              FREIGHT
              {otomatik.freight !== null && (
                <span className="font-normal opacity-70"> — Otomatik: {formatCurrency(otomatik.freight, dosya.para_birimi)}</span>
              )}
            </label>
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              style={inputStyle}
              value={freight}
              onChange={(e) => setFreight(e.target.value)}
              placeholder="Boş = otomatik hesaplanır"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>
              INSURANCE
            </label>
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              style={inputStyle}
              value={insurance}
              onChange={(e) => setInsurance(e.target.value)}
              placeholder="Boş = satır gösterilmez"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>
              {cfrEtiket}
              {otomatik.cfr !== null && (
                <span className="font-normal opacity-70"> — Otomatik: {formatCurrency(otomatik.cfr, dosya.para_birimi)}</span>
              )}
            </label>
            <input
              type="text"
              inputMode="decimal"
              className={inputClass}
              style={inputStyle}
              value={cfr}
              onChange={(e) => setCfr(e.target.value)}
              placeholder="Boş = FOB + FREIGHT'tan hesaplanır"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between gap-2" style={{ borderColor: CARD_BORDER }}>
          <button
            type="button"
            onClick={() => { setFob(""); setFreight(""); setCfr(""); setInsurance(""); }}
            className="text-xs font-medium hover:underline"
            style={{ color: TEXT_MUTED }}
          >
            Tümünü otomatiğe döndür
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
