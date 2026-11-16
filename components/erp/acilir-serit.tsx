"use client";
/**
 * ERP ortak kit: acilir uyari seridi (16.11.2026). Kontrol Merkezi "Veri Tutarsizliklari", Pazar "Aksiyon bekleyenler",
 * Ana Panel "Cut-off uyarisi" ayni kabugu ayri ayri yaziyordu: renkli kenar + baslik satiri (ikon, baslik, rozetler,
 * sagda Gizle / Goster) + acilinca icerik. Acik / kapali tercihi tarayicida (useAcikTercihi). Icerik cagirandadir.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CARD_BG, TEXT_MUTED } from "@/lib/theme";

/** Tarayicida saklanan acik / kapali tercihi: null = tercih yok (cagiran varsayilani secer). */
export function useAcikTercihi(anahtar: string): [boolean | null, (acik: boolean) => void] {
  const [tercih, setTercih] = useState<boolean | null>(null);
  useEffect(() => {
    try { const v = window.localStorage.getItem(anahtar); if (v !== null) setTercih(v === "1"); } catch { /* tarayici depolamasi kapali olabilir */ }
  }, [anahtar]);
  const yaz = useCallback((acik: boolean) => {
    setTercih(acik);
    try { window.localStorage.setItem(anahtar, acik ? "1" : "0"); } catch { /* tarayici depolamasi kapali olabilir */ }
  }, [anahtar]);
  return [tercih, yaz];
}

/** Hazir tonlar (sayfalardaki renkler aynen). */
export const SERIT_TONU = {
  kirmizi: { renk: "#FCA5A5", zemin: "rgba(248,113,113,0.06)", kenar: "rgba(248,113,113,0.35)" },
  amber: { renk: "#FCD34D", zemin: "rgba(245,158,11,0.06)", kenar: "rgba(245,158,11,0.3)" },
} as const;

export function AcilirSerit({ acik, onDegistir, ikon, baslik, rozetler, rozetSinif = "", sagEk, kapaliEtiket = "Göster", renk, zemin, kenar, className = "", testId, children }: {
  acik: boolean;
  onDegistir: () => void;
  ikon: React.ReactNode;
  baslik: React.ReactNode;
  rozetler?: React.ReactNode;
  /** rozet kapsayicisina ek sinif (or. "text-[10.5px]") */
  rozetSinif?: string;
  /** sagda Gizle / Goster'in onune ek bilgi */
  sagEk?: React.ReactNode;
  kapaliEtiket?: string;
  renk: string;
  zemin: string;
  kenar: string;
  className?: string;
  testId?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border overflow-hidden ${className}`} style={{ backgroundColor: CARD_BG, borderColor: kenar }} data-testid={testId}>
      <button type="button" onClick={onDegistir} aria-expanded={acik}
        className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors" style={{ backgroundColor: zemin }}>
        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: renk }}>{ikon} {baslik}</span>
        {rozetler !== undefined && <span className={`flex flex-wrap gap-1.5 ${rozetSinif}`}>{rozetler}</span>}
        <span className="ml-auto flex items-center gap-1 text-[10px]" style={{ color: TEXT_MUTED }}>
          {sagEk}
          {acik ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {acik ? "Gizle" : kapaliEtiket}
        </span>
      </button>
      {acik && children}
    </section>
  );
}

