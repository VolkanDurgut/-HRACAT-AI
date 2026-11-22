"use client";
import React, { useEffect } from "react";
import { X, CheckCircle2, AlertTriangle } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ROW_HEADER_BG } from "@/lib/theme";
import { MTS_PER_KONTEYNER } from "@/lib/supabase/constants";
import type { ProvaKalemi } from "@/lib/prova";

/**
 * PROVA PENCERESI (22.11.2026, test ortami - lib/ortam.ts). Dosya acma adiminda veritabanina YAZMADAN, olusacak
 * kaydin ozetini gosterir: karar, ana siparis, bu dosyanin kalemleri / miktari / marka / detayli ambalaj.
 * Canli ortamda hic acilmaz (cagiran sayfa yalniz testOrtami() iken kullanir).
 */
export type ProvaOzeti = {
  baslik: string;
  karar: string;
  satirlar: { etiket: string; deger: string }[];
  kalemler: ProvaKalemi[];
  paraBirimi: string;
  uyari?: string | null;
};

const sayi = (n: number, ondalik = 2) => n.toLocaleString("tr-TR", { maximumFractionDigits: ondalik });

export function ProvaPenceresi({ ozet, onKapat }: { ozet: ProvaOzeti; onKapat: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onKapat(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onKapat]);

  const toplamMts = ozet.kalemler.reduce((t, k) => t + k.mts, 0);
  const toplamTutar = ozet.kalemler.every((k) => k.tutar !== null) ? ozet.kalemler.reduce((t, k) => t + (k.tutar || 0), 0) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onKapat}>
      <div role="dialog" aria-modal="true" aria-labelledby="prova-baslik" data-testid="prova-penceresi"
        className="rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-up"
        style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Test ortamı · Prova</p>
            <h3 id="prova-baslik" className="text-sm font-bold text-white mt-0.5">{ozet.baslik}</h3>
          </div>
          <button onClick={onKapat} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <div className="flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm"
            style={{ borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.08)", color: "#A7F3D0" }}>
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            <span>{ozet.karar}</span>
          </div>
          {ozet.uyari && (
            <p className="text-xs text-amber-400 inline-flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-px shrink-0" />{ozet.uyari}
            </p>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {ozet.satirlar.map((s) => (
              <div key={s.etiket} className="min-w-0">
                <dt className="text-xs" style={{ color: TEXT_MUTED }}>{s.etiket}</dt>
                <dd className="text-white break-words whitespace-pre-line">{s.deger || "—"}</dd>
              </div>
            ))}
          </dl>

          <div className="rounded-lg border overflow-x-auto" style={{ borderColor: CARD_BORDER }}>
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
                  <th className="px-3 py-2 text-left text-xs font-semibold">Ürün</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">MTS</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">FCL</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">Tutar ({ozet.paraBirimi})</th>
                </tr>
              </thead>
              <tbody>
                {ozet.kalemler.map((k, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: CARD_BORDER }}>
                    <td className="px-3 py-2 text-white">{k.urun}</td>
                    <td className="px-3 py-2 text-right text-white">{sayi(k.mts)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: TEXT_MUTED }}>{sayi(k.mts / MTS_PER_KONTEYNER)}</td>
                    <td className="px-3 py-2 text-right text-white">{k.tutar === null ? "—" : sayi(k.tutar)}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                  <td className="px-3 py-2 text-white">Toplam</td>
                  <td className="px-3 py-2 text-right text-white">{sayi(toplamMts)}</td>
                  <td className="px-3 py-2 text-right" style={{ color: TEXT_MUTED }}>{sayi(toplamMts / MTS_PER_KONTEYNER)}</td>
                  <td className="px-3 py-2 text-right text-white">{toplamTutar === null ? "—" : sayi(toplamTutar)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs" style={{ color: TEXT_MUTED }}>
            Kayıt yapılmadı. Canlıda aynı adım bu bilgilerle dosyayı açar ve rezervasyon ekranına geçer.
          </p>
        </div>

        <div className="flex justify-end px-6 py-3 border-t" style={{ borderColor: CARD_BORDER }}>
          <button onClick={onKapat} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-white/5 transition-all"
            style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Kapat</button>
        </div>
      </div>
    </div>
  );
}
