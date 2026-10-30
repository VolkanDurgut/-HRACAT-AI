"use client";

import React from "react";
import { kalanMetni, teslimFarki } from "@/lib/ic-piyasa/mesaj-sablonlari";
import { TEXT_MUTED } from "@/lib/theme";

/**
 * Is emri kalan / eksik / fazla satiri (30.10.2026, kullanici: "kalan veya fazla
 * giden takibi yapilabilmeli"). Hesap TEK YERDE: _shared/mesaj-sablonlari.ts
 * (kalanMetni, teslimFarki) - kapanis e-postasi ve Kantar Paneli ile AYNI kural.
 *  - Acik: "Kalan 35,96 ton" / "Fazla 0,5 ton" / "Hedef tamam"
 *  - Tamamlandi: "Kapanış: Tam" / "Kapanış: Eksik 12 ton (%4)" / "Kapanış: Fazla …"
 *  - Iptal: gosterilmez
 */
export function KalanRozet({ emir, kg, arac, sade }: {
  emir: { durum?: string; hedef_tur: "kg" | "arac"; hedef_kg: number | null; hedef_arac: number | null };
  kg: number;
  arac: number;
  /** Kantar: sadece metin, "Kapanış:" oneki yok */
  sade?: boolean;
}) {
  const hedef = emir.hedef_tur === "kg" ? emir.hedef_kg : emir.hedef_arac;
  if (emir.durum === "iptal") return null;
  if (emir.durum === "tamamlandi") {
    const f = teslimFarki(emir.hedef_tur, hedef, kg, arac);
    const renk = f.sonuc === "tam" ? "#34D399" : f.sonuc === "eksik" ? "#FBBF24" : "#38BDF8";
    return (
      <p className="mt-1 text-[10.5px] font-semibold whitespace-nowrap" style={{ color: renk }} data-testid="kalan-rozet" data-sonuc={f.sonuc}>
        {sade ? f.metin : `Kapanış: ${f.metin}`}
      </p>
    );
  }
  const k = kalanMetni(emir.hedef_tur, hedef, kg, arac);
  const renk = k.durum === "tamam" ? "#34D399" : k.durum === "fazla" ? "#38BDF8" : TEXT_MUTED;
  return (
    <p className="mt-1 text-[10.5px] font-semibold whitespace-nowrap" style={{ color: renk }} data-testid="kalan-rozet" data-sonuc={k.durum}>
      {k.metin}
    </p>
  );
}
