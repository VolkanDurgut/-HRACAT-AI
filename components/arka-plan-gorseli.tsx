"use client";

import React, { useEffect, useState } from "react";

/**
 * Dunya haritasi arka plan gorseli (22.10.2026, kullanicinin gorseli).
 * - Giris ekrani: belirgin (orta hafif, kenarlar koyu ortu).
 * - Uygulama ici (AppShell): COK koyu ortu - kartlar/tablolar zaten opak, gorsel
 *   sadece bosluklarda ve kenarlarda hafifce gorunur (okunurluk korunur).
 * Tek dosya seti: public/images/giris/giris-arka-{828..3840}.webp (18-184 KB),
 * tarayici ekrana uygun TEK boyutu indirir. `position: fixed` -> kaydirmada
 * yeniden cizilmez; bulaniklik (backdrop-blur) BILEREK yok (performans).
 * Kullanici kenar cubugundan kapatabilir (bu tarayicida hatirlanir).
 */

const GENISLIKLER = [828, 1280, 1920, 2560, 3840] as const;
const SRCSET = GENISLIKLER.map((w) => `/images/giris/giris-arka-${w}.webp ${w}w`).join(", ");

const ORTU: Record<"giris" | "uygulama", string> = {
  giris: "radial-gradient(ellipse at center, rgba(11,15,20,0.55) 0%, rgba(11,15,20,0.30) 45%, rgba(11,15,20,0.70) 100%)",
  uygulama: "radial-gradient(ellipse at 55% 45%, rgba(11,15,20,0.60) 0%, rgba(11,15,20,0.70) 55%, rgba(11,15,20,0.84) 100%)",
};

export function ArkaPlanGorseli({ tur }: { tur: "giris" | "uygulama" }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/giris/giris-arka-1920.webp"
        srcSet={SRCSET}
        // object-cover: dik ekranda gorsel yukseklige gore buyur (en-boy 1,79)
        sizes="max(100vw, 179vh)"
        alt=""
        aria-hidden="true"
        decoding="async"
        className="fixed inset-0 -z-20 h-full w-full object-cover object-center select-none pointer-events-none"
      />
      <div aria-hidden="true" className="fixed inset-0 -z-10 pointer-events-none" style={{ background: ORTU[tur] }} />
    </>
  );
}

// ---- Kullanici tercihi (uygulama ici): localStorage, sekmeler arasi esitlenir ----
const ANAHTAR = "arka-plan-gorseli";
const OLAY = "arka-plan-gorseli-degisti";

function oku(): boolean {
  try { return window.localStorage.getItem(ANAHTAR) !== "kapali"; } catch { return true; }
}

/** Uygulama ici arka plan acik mi (varsayilan: acik) + degistirici */
export function useArkaPlanTercihi(): [boolean, (acik: boolean) => void] {
  const [acik, setAcik] = useState(true);
  useEffect(() => {
    setAcik(oku());
    const guncelle = () => setAcik(oku());
    window.addEventListener(OLAY, guncelle);
    window.addEventListener("storage", guncelle);
    return () => { window.removeEventListener(OLAY, guncelle); window.removeEventListener("storage", guncelle); };
  }, []);
  const degistir = (yeni: boolean) => {
    try { window.localStorage.setItem(ANAHTAR, yeni ? "acik" : "kapali"); } catch { /* gizli pencere */ }
    setAcik(yeni);
    window.dispatchEvent(new Event(OLAY));
  };
  return [acik, degistir];
}
