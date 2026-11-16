"use client";
/**
 * ERP ortak kit: ozet (KPI) kartlari (16.11.2026). Gorunumler AYNEN tasindi:
 *  - OzetKarti: ikon + etiket, buyuk deger, alt satir (Pazar, Navlun). onClick verilirse tiklanabilir (hover kenari yesil).
 *  - SecilebilirOzetKarti: ikonsuz, renkli deger, secili kenar turuncu (Siparis Listesi; tiklayinca sekme acar).
 */
import React from "react";
import { ACCENT, CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";

export function OzetKarti({ ikon, etiket, deger, alt, testId, onClick, ipucu }: {
  ikon: React.ReactNode; etiket: string; deger: number | string; alt?: string; testId: string; onClick?: () => void; ipucu?: string;
}) {
  const icerik = (
    <>
      <div className="flex items-center gap-2 text-xs" style={{ color: TEXT_MUTED }}>{ikon}<span>{etiket}</span></div>
      <p className="text-2xl font-semibold text-white tabular-nums mt-1" data-deger>{deger}</p>
      {alt && <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{alt}</p>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} title={ipucu} className="rounded-xl border px-4 py-3 text-left transition-colors hover:border-emerald-500/50 hover:bg-white/[0.02]" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid={testId}>{icerik}</button>
  ) : (
    <div className="rounded-xl border px-4 py-3" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid={testId}>{icerik}</div>
  );
}

export function SecilebilirOzetKarti({ etiket, deger, alt, renk, testId, onClick, secili }: {
  etiket: string; deger: string | number; alt?: string; renk?: string; testId: string; onClick?: () => void; secili?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="text-left rounded-xl border px-4 py-3 disabled:cursor-default"
      style={{ backgroundColor: CARD_BG, borderColor: secili ? ACCENT : CARD_BORDER }} data-testid={testId}>
      <p className="text-xs" style={{ color: TEXT_MUTED }}>{etiket}</p>
      <p className="text-2xl font-semibold tabular-nums mt-1" style={{ color: renk || "#FFFFFF" }} data-deger>{deger}</p>
      {alt && <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{alt}</p>}
    </button>
  );
}
