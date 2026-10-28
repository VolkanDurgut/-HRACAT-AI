"use client";

import React from "react";
import type { EkranNoktasi } from "@/lib/kilavuz/ekran-noktalari";

/**
 * Kilavuz ekran sahnesi (28.10.2026): tarayici cercevesinde ekran goruntusu +
 * "kamera". Adimin isaret noktasi varsa kamera oraya yaklasir (olcek + kaydirma,
 * 0,9 sn yumusak), nokta disi karartilir ve nabiz atan numara gosterilir.
 * Noktasiz adim = genel gorunum (olcek 1). Goruntu oranı 16:10 (1920x1200).
 */
export function EkranSahnesi({ ekran, adres, nokta, renk, numara }: {
  ekran: string;
  adres?: string;
  nokta?: EkranNoktasi;
  renk: string;
  numara?: number;
}) {
  // Kamera: noktayi kadrajin ~%70'ine sigdir; 1x - 2,1x arasi
  let olcek = 1, tx = 0, ty = 0;
  if (nokta) {
    const w = Math.max(nokta.w, 1) / 100, h = Math.max(nokta.h, 1) / 100;
    olcek = Math.min(2.1, Math.max(1, Math.min(0.72 / w, 0.72 / h)));
    const cx = (nokta.x + nokta.w / 2) / 100, cy = (nokta.y + nokta.h / 2) / 100;
    tx = Math.min(0, Math.max(1 - olcek, 0.5 - cx * olcek));
    ty = Math.min(0, Math.max(1 - olcek, 0.5 - cy * olcek));
  }
  const kamera: React.CSSProperties = {
    transform: `translate(${tx * 100}%, ${ty * 100}%) scale(${olcek})`,
    transformOrigin: "0 0",
  };

  return (
    <div className="klv-cerceve relative w-full rounded-2xl border overflow-hidden shadow-[0_30px_80px_-20px_rgba(0,0,0,0.75)]"
      style={{ borderColor: "rgba(255,255,255,0.10)", backgroundColor: "#0B0F14", boxShadow: `0 30px 80px -20px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.04), 0 0 60px -10px ${renk}40` }}>
      {/* Tarayici cubugu */}
      <div className="flex items-center gap-2 h-8 px-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)", backgroundColor: "rgba(16,20,28,0.9)" }}>
        <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" aria-hidden />
        <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" aria-hidden />
        <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" aria-hidden />
        <span className="ml-3 flex-1 min-w-0 truncate rounded-md px-2.5 py-0.5 text-[11px] text-center" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "#8B95A5" }}>
          ihracatasistanim.com{adres || ""}
        </span>
      </div>
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 10" }}>
        <div className="klv-kamera absolute inset-0" style={kamera}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/kilavuz/${ekran}.webp`} alt="" draggable={false} className="absolute inset-0 w-full h-full select-none" />
          {nokta && (
            <div className="klv-odak absolute pointer-events-none"
              style={{
                left: `${nokta.x}%`, top: `${nokta.y}%`, width: `${nokta.w}%`, height: `${nokta.h}%`,
                borderRadius: 10 / olcek, border: `${2 / olcek}px solid ${renk}`,
                boxShadow: `0 0 0 4000px rgba(4,7,11,0.58), 0 0 ${24 / olcek}px ${renk}`,
              }}>
              {numara !== undefined && (
                <span className="klv-nabiz absolute flex items-center justify-center rounded-full font-bold text-[#0B0F14]"
                  style={{ backgroundColor: renk, width: 26 / olcek, height: 26 / olcek, fontSize: 12 / olcek, left: -13 / olcek, top: -13 / olcek, ["--klv-renk" as string]: renk }}>
                  {numara}
                </span>
              )}
            </div>
          )}
        </div>
        {/* Kenar parlamasi (cam hissi) */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%)" }} aria-hidden />
      </div>
    </div>
  );
}
