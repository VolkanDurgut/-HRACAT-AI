"use client";

import React, { useEffect, useRef } from "react";

/**
 * Kilavuz yildiz alani (28.10.2026). Tuval uzerinde 3B yildizlar; `warpRef.current`
 * 0 (sakin suzulme) ile 1 (evrenler arasi gecis - isik cizgileri) arasinda.
 * - Renk: evrenin ana rengi; yildizlar beyazdan bu renge karisir.
 * - Sekme gizliyken cizim durur; "hareketi azalt" acikken tek kare, hareketsiz.
 * - DPR en fazla 2 (performans).
 */
type Yildiz = { x: number; y: number; z: number; pz: number; r: number };

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function YildizAlani({ renk, warpRef }: { renk: string; warpRef: React.MutableRefObject<number> }) {
  const tuvalRef = useRef<HTMLCanvasElement>(null);
  const renkRef = useRef(hexRgb(renk));
  renkRef.current = hexRgb(renk);

  useEffect(() => {
    const tuval = tuvalRef.current;
    if (!tuval) return;
    const ctx = tuval.getContext("2d");
    if (!ctx) return;
    let azalt = false;
    try { azalt = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* eski tarayici */ }

    let g = 0, y = 0, dpr = 1;
    const SAYI = 420;
    const yildizlar: Yildiz[] = [];
    const yeni = (s: Yildiz | null): Yildiz => {
      const z = s ? 1 : Math.random();
      const o = s || ({} as Yildiz);
      o.x = (Math.random() - 0.5) * 2; o.y = (Math.random() - 0.5) * 2; o.z = z; o.pz = z; o.r = 0.4 + Math.random() * 1.1;
      return o;
    };
    for (let i = 0; i < SAYI; i++) yildizlar.push(yeni(null));

    const boyutla = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      g = tuval.clientWidth; y = tuval.clientHeight;
      tuval.width = Math.round(g * dpr); tuval.height = Math.round(y * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    boyutla();
    const ro = new ResizeObserver(boyutla);
    ro.observe(tuval);

    let hiz = 0; // yumusak warp
    let kare = 0;
    const ciz = () => {
      const hedef = azalt ? 0 : Math.max(0, Math.min(1, warpRef.current));
      hiz += (hedef - hiz) * 0.08;
      const [r, gr, b] = renkRef.current;
      ctx.clearRect(0, 0, g, y);
      const cx = g / 2, cy = y / 2, olcek = Math.max(g, y) * 0.6;
      const adim = 0.0009 + hiz * 0.035;
      for (const s of yildizlar) {
        s.pz = s.z;
        if (!azalt) s.z -= adim;
        if (s.z <= 0.02) { yeni(s); continue; }
        const px = cx + (s.x / s.z) * olcek, py = cy + (s.y / s.z) * olcek;
        if (px < -50 || px > g + 50 || py < -50 || py > y + 50) { yeni(s); continue; }
        const yakinlik = 1 - s.z;
        const a = Math.min(1, 0.15 + yakinlik * 0.95);
        // beyaz -> evren rengi karisimi (yakin yildiz daha renkli)
        const k = 0.35 + yakinlik * 0.5;
        const cr = Math.round(255 * (1 - k) + r * k), cg = Math.round(255 * (1 - k) + gr * k), cb = Math.round(255 * (1 - k) + b * k);
        if (hiz > 0.05) {
          const ox = cx + (s.x / (s.pz + adim * 6 * hiz)) * olcek, oy = cy + (s.y / (s.pz + adim * 6 * hiz)) * olcek;
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${a})`;
          ctx.lineWidth = s.r * (0.6 + yakinlik * 1.6);
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(px, py); ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
          ctx.beginPath(); ctx.arc(px, py, s.r * (0.4 + yakinlik * 1.4), 0, Math.PI * 2); ctx.fill();
        }
      }
      if (!azalt) kare = requestAnimationFrame(ciz);
    };
    const gorunurluk = () => {
      cancelAnimationFrame(kare);
      if (!document.hidden) kare = requestAnimationFrame(ciz);
    };
    kare = requestAnimationFrame(ciz);
    document.addEventListener("visibilitychange", gorunurluk);
    return () => { cancelAnimationFrame(kare); ro.disconnect(); document.removeEventListener("visibilitychange", gorunurluk); };
  }, [warpRef]);

  return <canvas ref={tuvalRef} aria-hidden="true" className="absolute inset-0 w-full h-full pointer-events-none" />;
}
