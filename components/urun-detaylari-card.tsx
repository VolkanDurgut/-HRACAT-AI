"use client";
import React, { useState } from "react";
import { supabase, Dosya, UrunDetay } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { formatCurrency } from "@/lib/cutoff-utils";
import { Pencil, Check, X, Plus, Trash2 } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ROW_HEADER_BG, ACCENT } from "@/lib/theme";

type Props = {
  dosya: Dosya;
  onRefresh: () => void;
  companyId: string;
};

const bosSatir = (): UrunDetay => ({
  urun_adi: "", ambalaj_boyutu: "", miktar_mts: "", birim_fiyat_usd: "", toplam_tutar_usd: "",
});

/** Miktar * Birim fiyat'tan toplami otomatik hesaplar (virgul/nokta ikisini de kabul eder). */
function otomatikToplamHesapla(miktar: string, birimFiyat: string): string {
  const m = parseFloat(String(miktar).replace(",", "."));
  const f = parseFloat(String(birimFiyat).replace(",", "."));
  if (isNaN(m) || isNaN(f)) return "";
  return (m * f).toFixed(2);
}

/**
 * Urun Detaylari (kalem listesi) tablosunu gosterir ve satir satir duzenlenebilir
 * kilar. Satir eklenebilir/silinebilir; Toplam Tutar, Miktar ve Birim Fiyat
 * girildikce otomatik hesaplanir (istenirse elle degistirilebilir).
 */
export default function UrunDetaylariCard({ dosya, onRefresh, companyId }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const mevcutSatirlar = (): UrunDetay[] => {
    const veri = (dosya.urun_detaylari as any[]) || [];
    if (veri.length === 0) return [bosSatir()];
    return veri.map((u) => ({
      urun_adi: u.urun_adi || u.description || "",
      ambalaj_boyutu: u.ambalaj_boyutu || u.packaging_size || "",
      miktar_mts: String(u.miktar_mts ?? u.quantity ?? ""),
      birim_fiyat_usd: String(u.birim_fiyat_usd ?? u.unit_price ?? ""),
      toplam_tutar_usd: String(u.toplam_tutar_usd ?? u.total_amount ?? ""),
    }));
  };
  const [satirlar, setSatirlar] = useState<UrunDetay[]>(mevcutSatirlar);

  const handleEditStart = () => {
    setSatirlar(mevcutSatirlar());
    setEditing(true);
  };

  const satirGuncelle = (index: number, alan: keyof UrunDetay, deger: string) => {
    setSatirlar((prev) => {
      const yeni = [...prev];
      yeni[index] = { ...yeni[index], [alan]: deger };
      if (alan === "miktar_mts" || alan === "birim_fiyat_usd") {
        yeni[index].toplam_tutar_usd = otomatikToplamHesapla(yeni[index].miktar_mts, yeni[index].birim_fiyat_usd);
      }
      return yeni;
    });
  };

  const satirEkle = () => setSatirlar((prev) => [...prev, bosSatir()]);
  const satirSil = (index: number) => setSatirlar((prev) => prev.filter((_, i) => i !== index));

  const genelToplam = satirlar.reduce((s, u) => s + (parseFloat(String(u.toplam_tutar_usd).replace(",", ".")) || 0), 0);

  const handleSave = async () => {
    setSaving(true);
    // Tamamen bos birakilmis satirlari (hicbir alani doldurulmamis) kaydetmeden onceki temizlik
    const temizSatirlar = satirlar.filter((u) => u.urun_adi.trim() || u.miktar_mts.trim() || u.birim_fiyat_usd.trim());
    await supabase.from("ihracat_dosyalari").update({ urun_detaylari: temizSatirlar }).eq("id", dosya.id).eq("company_id", companyId);
    showToast("Urun detaylari güncellendi.", "success");
    setSaving(false);
    setEditing(false);
    onRefresh();
  };

  const gosterilecekSatirlar = (dosya.urun_detaylari as any[]) || [];

  return (
    <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: CARD_BORDER }}>
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Urun Detaylari</h3>
        <button onClick={handleEditStart} className="text-amber-400 hover:text-amber-300 text-xs font-medium inline-flex items-center gap-1">
          <Pencil size={12} /> Duzenle
        </button>
      </div>
      {gosterilecekSatirlar.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                <th className="text-left px-4 py-3 text-xs font-bold" style={{ color: TEXT_MUTED }}>Urun Adi</th>
                <th className="text-left px-4 py-3 text-xs font-bold" style={{ color: TEXT_MUTED }}>Ambalaj</th>
                <th className="text-right px-4 py-3 text-xs font-bold" style={{ color: TEXT_MUTED }}>Miktar (MTS)</th>
                <th className="text-right px-4 py-3 text-xs font-bold" style={{ color: TEXT_MUTED }}>Birim Fiyat</th>                <th className="text-right px-4 py-3 text-xs font-bold" style={{ color: TEXT_MUTED }}>Birim Fiyat</th>
                <th className="text-right px-4 py-3 text-xs font-bold" style={{ color: TEXT_MUTED }}>Toplam</th>
              </tr>
            </thead>
            <tbody>
              {gosterilecekSatirlar.map((item: any, i: number) => (
                <tr key={i} className="border-b last:border-0" style={{ borderColor: CARD_BORDER }}>
                  <td className="px-4 py-3 text-sm text-white">{item.urun_adi || item.description || "-"}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: TEXT_MUTED }}>{item.ambalaj_boyutu || item.packaging_size || "-"}</td>
                  <td className="px-4 py-3 text-sm text-right" style={{ color: TEXT_MUTED }}>{item.miktar_mts || item.quantity || "-"}</td>
                  <td className="px-4 py-3 text-sm text-right" style={{ color: TEXT_MUTED }}>{formatCurrency(item.birim_fiyat_usd || item.unit_price, dosya.para_birimi)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-white">{formatCurrency(item.toplam_tutar_usd || item.total_amount, dosya.para_birimi)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-right" style={{ color: "white" }}>TOPLAM</td>
                <td className="px-4 py-3 text-sm font-bold text-right" style={{ color: ACCENT }}>
                  {formatCurrency(gosterilecekSatirlar.reduce((s: number, u: any) => s + parseFloat(String(u.toplam_tutar_usd || u.total_amount || 0)), 0), dosya.para_birimi)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="px-6 py-6 text-sm italic" style={{ color: TEXT_MUTED }}>Henuz urun detayi eklenmemis.</p>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditing(false)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-y-auto p-6 animate-fade-up" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Urun Detaylarini Duzenle</h3>
              <button onClick={() => setEditing(false)} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }}><X size={18} /></button>
            </div>

            <div className="space-y-3">
              {satirlar.map((satir, i) => (
                <div key={i} className="p-3 rounded-lg border relative" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                  {satirlar.length > 1 && (
                    <button onClick={() => satirSil(i)} className="absolute top-2 right-2 text-red-400 hover:text-red-300" title="Satiri sil">
                      <Trash2 size={14} />
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-2 pr-6">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Urun Adi</label>
                      <input value={satir.urun_adi} onChange={(e) => satirGuncelle(i, "urun_adi", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Ambalaj</label>
                      <input value={satir.ambalaj_boyutu} onChange={(e) => satirGuncelle(i, "ambalaj_boyutu", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Miktar (MTS)</label>
                      <input value={satir.miktar_mts} onChange={(e) => satirGuncelle(i, "miktar_mts", e.target.value)} inputMode="decimal" className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Birim Fiyat</label>
                      <input value={satir.birim_fiyat_usd} onChange={(e) => satirGuncelle(i, "birim_fiyat_usd", e.target.value)} inputMode="decimal" className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Toplam <span className="normal-case font-normal">(otomatik, elle degistirilebilir)</span></label>
                      <input value={satir.toplam_tutar_usd} onChange={(e) => satirGuncelle(i, "toplam_tutar_usd", e.target.value)} inputMode="decimal" className="w-full px-3 py-2 border rounded-lg text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={satirEkle} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              <Plus size={13} /> Satir Ekle
            </button>

            <div className="flex items-center justify-between mt-4 pt-3 border-t" style={{ borderColor: CARD_BORDER }}>
              <span className="text-sm font-semibold" style={{ color: TEXT_MUTED }}>Genel Toplam:</span>
              <span className="text-sm font-bold" style={{ color: ACCENT }}>{formatCurrency(genelToplam, dosya.para_birimi)}</span>
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