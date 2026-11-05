"use client";

import React from "react";
import { bayrakDataUri } from "@/lib/bayraklar";

/**
 * Ulke bayragi (05.11.2026; DIIB Takibi ve fatura talimati "ticaret yapilan ulke").
 * Gomulu SVG (lib/bayraklar.ts) arka plan gorseli olarak; emoji yok (Windows'ta harf gorunur).
 * Ulke bilinmiyorsa hicbir sey cizmez. Ince cerceve: acik renkli bayraklar koyu temada kaybolmasin.
 */
export function UlkeBayrak({ ulke, yukseklik = 12, className = "" }: { ulke: string | null | undefined; yukseklik?: number; className?: string }) {
  const uri = bayrakDataUri(ulke);
  if (!uri || !ulke) return null;
  return (
    <span
      role="img"
      aria-label={`${ulke} bayrağı`}
      title={ulke}
      data-bayrak={ulke}
      className={`inline-block shrink-0 rounded-[2px] align-[-1px] ${className}`}
      style={{ width: Math.round(yukseklik * 1.5), height: yukseklik, backgroundImage: `url("${uri}")`, backgroundSize: "cover", backgroundPosition: "center", boxShadow: "0 0 0 1px rgba(255,255,255,0.18)" }}
    />
  );
}
