"use client";

import { useEffect, useState } from "react";

/**
 * Tum canli cut-off sayaclari icin TEK ortak saat (talep: 01.10.2026).
 * Her sayac kendi setInterval'ini kurmak yerine bu modul seviyesindeki tek
 * zamanlayiciya abone olur - panelde 30 satir da olsa saniyede 1 zamanlayici
 * calisir ve tum sayaclar ayni anda (senkron) ilerler. Son abone ayrilinca
 * zamanlayici durur.
 */
const aboneler = new Set<(t: number) => void>();
let zamanlayici: ReturnType<typeof setInterval> | null = null;

function abone(fn: (t: number) => void) {
  aboneler.add(fn);
  if (!zamanlayici) {
    zamanlayici = setInterval(() => {
      const t = Date.now();
      aboneler.forEach((f) => f(t));
    }, 1000);
  }
  return () => {
    aboneler.delete(fn);
    if (aboneler.size === 0 && zamanlayici) {
      clearInterval(zamanlayici);
      zamanlayici = null;
    }
  };
}

export function useSimdi(): number {
  const [simdi, setSimdi] = useState(() => Date.now());
  useEffect(() => {
    setSimdi(Date.now());
    return abone(setSimdi);
  }, []);
  return simdi;
}
