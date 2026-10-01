import React from "react";
import { ACCENT, TEXT_MUTED } from "@/lib/theme";

/**
 * Tum sayfalarda TEK tip baslik (duzen standardi, 01.10.2026).
 *
 * Eskiden her sayfa kendi basligini yaziyordu: 4 farkli punto (text-base /
 * lg / xl / 2xl), bazilarinda ikon yok, birinde emoji, alt yazi kaymalari
 * farkli (ml-7 / ml-9 / mt-1). Artik:
 *   [ACCENT ikon 20px]  Baslik (text-xl bold beyaz)          [sag: aksiyonlar]
 *                       Aciklama (text-sm, soluk)
 */
export function SayfaBasligi({
  ikon,
  baslik,
  aciklama,
  sag,
  className = "mb-5",
}: {
  ikon: React.ReactNode;
  baslik: React.ReactNode;
  aciklama?: React.ReactNode;
  sag?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-3 ${className}`}>
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-[3px] shrink-0 inline-flex" style={{ color: ACCENT }}>{ikon}</span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white leading-tight">{baslik}</h1>
          {aciklama && <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>{aciklama}</p>}
        </div>
      </div>
      {sag && <div className="flex flex-wrap items-center gap-2">{sag}</div>}
    </div>
  );
}
