"use client";

import { Clock } from "lucide-react";
import { useSimdi } from "@/lib/use-simdi";
import {
  cutoffZamanMs,
  formatCutoffSaat,
  formatCutoffTarihUzun,
  formatKalanSure,
  CUTOFF_UYARI_ESIGI_MS,
} from "@/lib/cutoff-utils";
import { TEXT_MUTED } from "@/lib/theme";

const IKI_GUN_MS = 48 * 60 * 60 * 1000;

export type CutoffSeviye = "normal" | "yaklasiyor" | "kritik" | "gecti";

export function cutoffSeviyesi(kalanMs: number): CutoffSeviye {
  if (kalanMs <= 0) return "gecti";
  if (kalanMs <= CUTOFF_UYARI_ESIGI_MS) return "kritik";
  if (kalanMs <= IKI_GUN_MS) return "yaklasiyor";
  return "normal";
}

const SEVIYE_STIL: Record<CutoffSeviye, { renk: string; zemin: string; kenar: string }> = {
  normal: { renk: "#93A4BC", zemin: "rgba(148,163,184,0.06)", kenar: "rgba(148,163,184,0.16)" },
  yaklasiyor: { renk: "#FBBF24", zemin: "rgba(251,191,36,0.08)", kenar: "rgba(251,191,36,0.28)" },
  kritik: { renk: "#F87171", zemin: "rgba(248,113,113,0.10)", kenar: "rgba(248,113,113,0.40)" },
  gecti: { renk: "#6B7484", zemin: "rgba(107,116,132,0.08)", kenar: "rgba(107,116,132,0.20)" },
};

/**
 * Talimat / Beyanname cut-off icin canli geri sayim (talep: 01.10.2026).
 * Ust satir: cut-off tarihi + saati (ham okunur, saat dilimi kaymasi yok).
 * Alt satir: saniye saniye isleyen kalan sure.
 *   > 48 saat  -> notr
 *   48-10 saat -> amber
 *   < 10 saat  -> kirmizi + nabiz (uygulama geneli bildirim de bu esikte gelir)
 *   gecmis     -> soluk "Süresi doldu"
 */
export function CutoffSayac({ deger, kompakt = false }: { deger: string; kompakt?: boolean }) {
  const simdi = useSimdi();
  const hedef = cutoffZamanMs(deger);
  if (hedef === null) return <span className="text-xs" style={{ color: "#4A5262" }}>—</span>;

  const kalan = hedef - simdi;
  const seviye = cutoffSeviyesi(kalan);
  const stil = SEVIYE_STIL[seviye];
  const saat = formatCutoffSaat(deger);

  return (
    <div className="inline-flex flex-col gap-1">
      {!kompakt && (
        <p className="text-[10px] whitespace-nowrap" style={{ color: TEXT_MUTED }}>
          {formatCutoffTarihUzun(deger)}
          {saat !== "-" && <span className="text-slate-300 font-medium"> · {saat}</span>}
        </p>
      )}
      <span
        className="inline-flex items-center gap-1.5 self-start rounded-md border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap tabular-nums"
        style={{ color: stil.renk, backgroundColor: stil.zemin, borderColor: stil.kenar }}
        title={seviye === "gecti" ? "Cut-off süresi doldu" : "Cut-off'a kalan süre"}
      >
        {seviye === "kritik" ? (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full animate-ping" style={{ backgroundColor: stil.renk, opacity: 0.7 }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: stil.renk }} />
          </span>
        ) : (
          <Clock size={11} />
        )}
        {seviye === "gecti" ? "Süresi doldu" : formatKalanSure(kalan)}
      </span>
    </div>
  );
}
