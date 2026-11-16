"use client";

/**
 * Siparişler > "Aynı sipariş" eşleştirmesi (16.11.2026, kullanıcı onayı). Sistemde açılmış proforma ile aynı siparişin
 * Excel'deki satırı bağlanır: listede tek satır kalır (Excel satırı), proformanın ön ödemesi o satıra geçer. Geri alınabilir.
 * Adaylar: aynı firma (kısa / uzun yazım, eş sözlüğü) ve/veya aynı miktar / tutar; eşleşmemiş, iptal olmayan Excel satırları.
 */
import React, { useEffect, useState } from "react";
import { Link2, Loader2, X } from "lucide-react";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import { eslesmeAdaylariOku, siparisEslestir, type EslesmeAdayi } from "@/lib/siparis/veri";
import type { SiparisSatiri } from "@/supabase/functions/_shared/siparis-liste";

const sayi = (n: number | null, k = 0) => (n === null ? "—" : n.toLocaleString("tr-TR", { minimumFractionDigits: k, maximumFractionDigits: k }));
const tarih = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : "—");

export function SiparisEslestirFormu({ s, onKapat, onEslesti }: { s: SiparisSatiri; onKapat: () => void; onEslesti: (mesaj: string) => void }) {
  const [adaylar, setAdaylar] = useState<EslesmeAdayi[] | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bekle, setBekle] = useState(false);

  useEffect(() => {
    let iptal = false;
    if (!s.proforma_no) return;
    eslesmeAdaylariOku(s.proforma_no)
      .then((a) => { if (!iptal) { setAdaylar(a); if (a.length && a[0].puan >= 6) setSecili(a[0].anahtar); } })
      .catch((e) => { if (!iptal) setHata(e instanceof Error ? e.message : "Adaylar okunamadı."); });
    return () => { iptal = true; };
  }, [s.proforma_no]);

  const onayla = async () => {
    if (!secili || !s.proforma_no) return;
    const a = adaylar?.find((x) => x.anahtar === secili);
    setBekle(true); setHata(null);
    try { await siparisEslestir(s.proforma_no, secili); onEslesti(`${s.proforma_no} ile Excel ${a?.proforma_no || ""} aynı sipariş olarak bağlandı; listede tek satır görünüyor.`); }
    catch (e) { setHata(e instanceof Error ? e.message : "Eşleştirilemedi."); setBekle(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)" }} role="dialog" aria-modal="true" aria-label="Aynı sipariş eşleştirmesi">
      <div className="w-full max-w-2xl rounded-xl border shadow-xl" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="siparis-eslestir">
        <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: CARD_BORDER }}>
          <Link2 size={16} style={{ color: ACCENT }} />
          <p className="text-sm font-semibold text-white flex-1">Aynı sipariş: {s.proforma_no} · {s.firma || "—"}</p>
          <button type="button" onClick={onKapat} aria-label="Kapat" className="p-1 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }}><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs" style={{ color: TEXT_MUTED }}>
            Bu sistem proformasıyla aynı siparişi gösteren Excel satırını seçin. Bağlandıktan sonra listede yalnız Excel satırı görünür ve
            proformanın ön ödeme bilgisi o satıra geçer. Kayıtlar değişmez; eşleştirme istenirse geri alınır.
          </p>
          <p className="text-xs text-white">Sistem: {sayi(s.miktar_mt, 2)} MT · {s.tutar === null ? "—" : `${sayi(s.tutar, 2)} ${s.para_birimi || ""}`} · {tarih(s.proforma_tarihi)}</p>
          {hata && <p className="text-xs" style={{ color: "#FCA5A5" }} role="alert">{hata}</p>}
          {!adaylar ? (
            <p className="text-sm flex items-center gap-2" style={{ color: TEXT_MUTED }}><Loader2 size={14} className="animate-spin" /> Adaylar aranıyor…</p>
          ) : adaylar.length === 0 ? (
            <p className="text-sm" style={{ color: TEXT_MUTED }}>Aynı firma ya da aynı miktarla eşleşen Excel satırı bulunamadı.</p>
          ) : (
            <div className="rounded-lg border overflow-hidden" style={{ borderColor: CARD_BORDER }}>
              <table className="w-full text-xs">
                <thead style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
                  <tr><th className="px-2 py-1.5 w-8" /><th className="px-2 py-1.5 text-left font-medium">Excel proforma</th><th className="px-2 py-1.5 text-left font-medium">Firma</th>
                    <th className="px-2 py-1.5 text-right font-medium">MT</th><th className="px-2 py-1.5 text-right font-medium">Tutar</th><th className="px-2 py-1.5 text-left font-medium">Liman · BL</th></tr>
                </thead>
                <tbody>
                  {adaylar.map((a) => (
                    <tr key={a.anahtar} className="border-t cursor-pointer hover:bg-white/[0.03]" style={{ borderColor: CARD_BORDER }} onClick={() => setSecili(a.anahtar)}>
                      <td className="px-2 py-1.5"><input type="radio" name="eslesme" checked={secili === a.anahtar} onChange={() => setSecili(a.anahtar)} aria-label={`${a.proforma_no} seç`} /></td>
                      <td className="px-2 py-1.5 text-white">{a.proforma_no || "—"}<span className="block text-[10px]" style={{ color: TEXT_MUTED }}>{tarih(a.proforma_tarihi)}</span></td>
                      <td className="px-2 py-1.5" style={{ color: "#C9D1DC" }}>{a.firma || "—"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-white">{sayi(a.miktar_mt, 2)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "#C9D1DC" }}>{a.tutar === null ? "—" : `${sayi(a.tutar, 2)} ${a.para_birimi || ""}`}</td>
                      <td className="px-2 py-1.5" style={{ color: TEXT_MUTED }}>{a.liman || "—"}<span className="block font-mono text-[10px] break-all">{a.bl_no || ""}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t flex justify-end gap-2" style={{ borderColor: CARD_BORDER }}>
          <button type="button" onClick={onKapat} className="h-9 px-3 rounded-lg border text-sm" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
          <button type="button" onClick={onayla} disabled={!secili || bekle} className="h-9 px-4 rounded-lg text-sm font-medium text-white flex items-center gap-1.5 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
            {bekle ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Aynı sipariş olarak bağla
          </button>
        </div>
      </div>
    </div>
  );
}
