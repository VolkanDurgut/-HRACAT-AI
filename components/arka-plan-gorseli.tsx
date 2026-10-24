"use client";

import React from "react";

/**
 * Dunya haritasi arka plan gorseli (22.10.2026, kullanicinin gorseli).
 * - Giris ekrani: belirgin (orta hafif, kenarlar koyu ortu).
 * - Uygulama ici (AppShell): COK koyu ortu - kartlar/tablolar zaten opak, gorsel
 *   sadece bosluklarda ve kenarlarda hafifce gorunur (okunurluk korunur).
 * Tek dosya seti: public/images/giris/giris-arka-{828..3840}.webp (18-184 KB),
 * tarayici ekrana uygun TEK boyutu indirir. `position: fixed` -> kaydirmada
 * yeniden cizilmez; bulaniklik (backdrop-blur) BILEREK yok (performans).
 * HER ZAMAN acik (22.10.2026 kullanici karari: ac/kapa anahtari kaldirildi).
 * Telefonda adres cubugu acilip kapanirken kaymasin diye `.sabit-zemin` (100lvh,
 * globals.css); `data-sabit-zemin` koyu sayfa zeminini ve esneme kilidini acar (24.10.2026).
 * Kullanildigi yerler: giris ekrani, AppShell (tum uygulama sayfalari), Kantar Paneli.
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
        data-sabit-zemin=""
        className="sabit-zemin -z-20 object-cover object-center select-none pointer-events-none"
      />
      <div aria-hidden="true" className="sabit-zemin -z-10 pointer-events-none" style={{ background: ORTU[tur] }} />
    </>
  );
}
