"use client";
/**
 * Ana Panel > Cut-off uyarı çubuğu (16.11.2026 gece, kullanıcı: Kontrol Merkezi "Veri Tutarsızlıkları" ve Pazar
 * "Aksiyon bekleyenler" ile aynı dil). Hesap: lib/panel-gorunum.ts cutoffUyarilari (eski özet kartıyla aynı kural:
 * <= 2 takvim günü kalan / geçen ve adımı bitmemiş). Uyarı yoksa görünmez; açık/kapalı tercihi tarayıcıda (varsayılan açık).
 * Satıra tıklayınca tablodaki dosya satırı vurgulanır (onDosya).
 */
import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Timer } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { formatCutoffSaat, formatCutoffTarih } from "@/lib/cutoff-utils";
import { gunMetni, type CutoffUyarisi } from "@/lib/panel-gorunum";

const ACIK_ANAHTARI = "panel:cutoff-acik";

export function CutoffCubugu({ uyarilar, onDosya }: { uyarilar: CutoffUyarisi[]; onDosya: (dosyaId: string) => void }) {
  const [acik, setAcik] = useState(true);
  useEffect(() => { try { const v = window.localStorage.getItem(ACIK_ANAHTARI); if (v !== null) setAcik(v === "1"); } catch { /* yok */ } }, []);
  if (uyarilar.length === 0) return null;
  const degistir = () => { const y = !acik; setAcik(y); try { window.localStorage.setItem(ACIK_ANAHTARI, y ? "1" : "0"); } catch { /* yok */ } };
  const dosya = new Set(uyarilar.map((u) => u.dosyaId)).size;
  const gecen = uyarilar.filter((u) => u.gun < 0).length;
  const bugun = uyarilar.filter((u) => u.gun === 0).length;

  return (
    <section className="rounded-xl border mb-4 overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: "rgba(248,113,113,0.35)" }} data-testid="cutoff-cubugu">
      <button type="button" onClick={degistir} aria-expanded={acik}
        className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-white/[0.02]" style={{ backgroundColor: "rgba(248,113,113,0.06)" }}>
        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#FCA5A5" }}>
          <Timer size={14} className={uyarilar.some((u) => u.gun <= 1) ? "animate-pulse" : ""} /> Cut-off uyarısı · {uyarilar.length} uyarı · {dosya} dosya
        </span>
        <span className="flex flex-wrap gap-1.5 text-[10.5px]">
          {gecen > 0 && <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#FCA5A5" }}>geçen <b>{gecen}</b></span>}
          {bugun > 0 && <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: "rgba(245,158,11,0.15)", color: "#FCD34D" }}>bugün <b>{bugun}</b></span>}
          <span className="rounded-full px-2 py-0.5 border" style={{ borderColor: CARD_BORDER, color: "#E2E8F0" }}>48 saat içinde</span>
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10px]" style={{ color: TEXT_MUTED }}>{acik ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {acik ? "Gizle" : "Ayrıntı"}</span>
      </button>
      {acik && (
        <ul className="divide-y border-t" style={{ borderColor: CARD_BORDER }}>
          {uyarilar.map((u) => (
            <li key={`${u.dosyaId}-${u.tur}`}>
              <button type="button" onClick={() => onDosya(u.dosyaId)} className="w-full flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-left hover:bg-white/[0.03]" data-cutoff-uyari={u.tur}>
                <span className="inline-flex h-5 w-24 items-center justify-center rounded-full text-[11px] font-medium shrink-0"
                  style={u.gun < 0 ? { backgroundColor: "rgba(239,68,68,0.15)", color: "#FCA5A5" } : u.gun <= 1 ? { backgroundColor: "rgba(245,158,11,0.15)", color: "#FCD34D" } : { backgroundColor: "rgba(255,255,255,0.06)", color: "#E2E8F0" }}>
                  {u.tur} · {gunMetni(u.gun)}
                </span>
                <span className="text-sm font-semibold text-white whitespace-nowrap">{u.dosyaNo}</span>
                <span className="text-xs truncate min-w-0 flex-1" style={{ color: "#C9D1DC" }}>{u.musteri || "—"}</span>
                {u.saat && <span className="text-[11px] whitespace-nowrap tabular-nums" style={{ color: TEXT_MUTED }}>{formatCutoffTarih(u.saat)} · {formatCutoffSaat(u.saat)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
