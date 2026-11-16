"use client";
/**
 * ERP ortak kit: sekme / filtre cubugu (16.11.2026). Sayfalardaki uc gorunum AYNEN (siniflar birebir tasindi):
 *  - "hap"       Pazar, Ana Panel filtreleri, Siparis Listesi (yesil zeminli secili sekme). Sayi: "duz" (Ana Panel) | "rozet" (Siparis).
 *  - "alt-cizgi" Kontrol Merkezi (secili sekmenin altinda turuncu cizgi; sekme-<x> / panel-<x> kimlikleri).
 *  - "kompakt"   Kantar Paneli ihracat (kucuk, secili sekme dolu renk; sayi parantez icinde).
 * Adres eslesmesi ayri: components/erp/use-url-sekmesi.ts.
 */
import React from "react";
import { ACCENT, CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";

export type SekmeOgesi<T extends string> = {
  deger: T;
  etiket: React.ReactNode;
  ikon?: React.ReactNode;
  /** null / undefined: sayi gosterilmez */
  sayi?: number | null;
  /** "rozet" bicimde: sayi > 0 ise vurgulu (turuncu) rozet - aksiyon gerektiren sekme */
  vurgu?: boolean;
  ipucu?: string;
};

type Ortak<T extends string> = {
  ogeler: SekmeOgesi<T>[];
  secili: T;
  onSec: (v: T) => void;
  testId?: string;
  ariaLabel?: string;
  /** dugmedeki veri ozelligi: data-sekme (varsayilan) | data-filtre */
  veriOzelligi?: "sekme" | "filtre";
};

export function SekmeCubugu<T extends string>(p: Ortak<T> & (
  | { varyant?: "hap"; sayiBicimi?: "duz" | "rozet"; className?: string; dugmeBosluk?: string }
  | { varyant: "alt-cizgi" }
  | { varyant: "kompakt" }
)) {
  const { ogeler, secili, onSec, testId, ariaLabel, veriOzelligi = "sekme" } = p;
  const veri = (d: T) => ({ [`data-${veriOzelligi}`]: d });

  if (p.varyant === "alt-cizgi") {
    return (
      <div role="tablist" aria-label={ariaLabel} className="flex gap-1 mb-4 border-b overflow-x-auto" style={{ borderColor: CARD_BORDER }} data-testid={testId}>
        {ogeler.map((x) => {
          const s = secili === x.deger;
          return (
            <button key={x.deger} type="button" role="tab" id={`sekme-${x.deger}`} aria-selected={s} aria-controls={`panel-${x.deger}`} title={x.ipucu}
              onClick={() => onSec(x.deger)} {...veri(x.deger)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors"
              style={{ borderColor: s ? ACCENT : "transparent", color: s ? "white" : TEXT_MUTED }}>
              {x.ikon} {x.etiket}
            </button>
          );
        })}
      </div>
    );
  }

  if (p.varyant === "kompakt") {
    return (
      <div className="shrink-0 flex w-full sm:w-auto sm:self-start max-w-full overflow-x-auto rounded-lg border p-0.5" role="tablist" aria-label={ariaLabel}
        style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }} data-testid={testId}>
        {ogeler.map((x) => (
          <button key={x.deger} type="button" role="tab" aria-selected={secili === x.deger} onClick={() => onSec(x.deger)} {...veri(x.deger)} title={x.ipucu}
            className="px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors"
            style={secili === x.deger ? { backgroundColor: ACCENT, color: "white" } : { color: TEXT_MUTED }}>
            {x.etiket}{x.sayi !== null && x.sayi !== undefined && <> <span className="font-normal opacity-80">({x.sayi})</span></>}
          </button>
        ))}
      </div>
    );
  }

  const { sayiBicimi = "duz", className = "sm:w-auto sm:inline-flex mb-4", dugmeBosluk = "px-3 sm:px-4" } = p;
  return (
    <div className={`flex w-full max-w-full overflow-x-auto rounded-lg border p-0.5 ${className}`} style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
      role="tablist" aria-label={ariaLabel} data-testid={testId}>
      {ogeler.map((x) => {
        const s = secili === x.deger;
        const sayi = x.sayi === null || x.sayi === undefined ? null : sayiBicimi === "rozet" ? (
          <span className="ml-0.5 min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-semibold tabular-nums" data-sekme-sayi
            style={x.vurgu && x.sayi > 0 ? { backgroundColor: ACCENT, color: "#FFFFFF" } : { backgroundColor: "rgba(148,163,184,0.14)", color: s ? "#FFFFFF" : TEXT_MUTED }}>{x.sayi}</span>
        ) : (
          <span className="text-[11px] tabular-nums" style={{ color: s ? "#6EE7B7" : TEXT_MUTED }}>{x.sayi}</span>
        );
        return (
          <button key={x.deger} type="button" role="tab" aria-selected={s} onClick={() => onSec(x.deger)} {...veri(x.deger)} title={x.ipucu}
            className={`inline-flex shrink-0 items-center gap-1.5 h-9 ${dugmeBosluk} rounded-md text-sm font-medium whitespace-nowrap transition-colors`}
            style={s ? { backgroundColor: "rgba(16,185,129,0.16)", color: "#FFFFFF" } : { color: TEXT_MUTED }}>
            {x.ikon}{x.ikon ? " " : null}{x.etiket}
            {sayi}
          </button>
        );
      })}
    </div>
  );
}
