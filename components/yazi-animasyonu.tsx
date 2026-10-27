"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Yazi animasyonu (27.10.2026, kullanici: "chatte yazıyor gibi yazılmalı; diğer
 * sayfalarda da bilgilendirme metinleri her açıldığında yazı animasyonu ile").
 *
 * - Metin harf harf belirir; bitince imlec kaybolur.
 * - YER KAYMASI YOK: tam metin gorunmez kopya olarak yerini ayirir, animasyon
 *   ustune biner (satir sayisi bastan sabit).
 * - Ekran okuyucu tam metni HEMEN okur (sr-only); animasyonlu kopya aria-hidden.
 * - "Hareketi azalt" (prefers-reduced-motion) acikken metin animasyonsuz gelir.
 * - Toplam sure sinirli (enUzunMs): uzun metin is akisini yavaslatmaz.
 * - Sadece ILK yazimda animasyon: yazim bittikten sonra metin degisirse (ornegin
 *   "0 dosya" -> "12 dosya" veri yuklenince) yeniden yazilmaz, aninda guncellenir.
 * - Bicimli metin (27.10.2026): `metin` yerine `parcalar` verilirse kalin / renkli
 *   parcalar korunarak yazilir (ornek: Satin Alma "Departmanlar" bilgi kutusu).
 */
export type YaziParcasi = { metin: string; sinif?: string; stil?: React.CSSProperties };

export function YaziAnimasyonu({
  metin: duzMetin,
  parcalar,
  harfMs = 14,
  enUzunMs = 1100,
  gecikmeMs = 0,
  onBitti,
}: {
  /** Duz metin (ya da `parcalar`). */
  metin?: string;
  /** Bicimli parcalar; verilirse `metin` yerine kullanilir. */
  parcalar?: YaziParcasi[];
  /** Harf basina hedef sure (ms). */
  harfMs?: number;
  /** Tum metnin en fazla yazilma suresi (ms). */
  enUzunMs?: number;
  /** Yazmaya baslamadan once bekleme (ms). */
  gecikmeMs?: number;
  onBitti?: () => void;
}) {
  const metin = parcalar ? parcalar.map((p) => p.metin).join("") : (duzMetin ?? "");
  const [n, setN] = useState(0);
  const [bitti, setBitti] = useState(false);
  const bittiRef = useRef(false);
  const onBittiRef = useRef(onBitti);
  onBittiRef.current = onBitti;

  useEffect(() => {
    const uzunluk = metin.length;
    const bitir = () => {
      setN(uzunluk);
      if (!bittiRef.current) {
        bittiRef.current = true;
        setBitti(true);
        onBittiRef.current?.();
      }
    };
    let azalt = false;
    try { azalt = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* eski tarayici */ }
    if (bittiRef.current || azalt || uzunluk === 0) { bitir(); return; }

    const harfSuresi = Math.max(2, Math.min(harfMs, enUzunMs / uzunluk));
    let zamanlayici: ReturnType<typeof setInterval> | undefined;
    const basla = setTimeout(() => {
      const t0 = performance.now();
      zamanlayici = setInterval(() => {
        const yeni = Math.min(uzunluk, Math.floor((performance.now() - t0) / harfSuresi) + 1);
        if (yeni >= uzunluk) { clearInterval(zamanlayici); bitir(); } else setN(yeni);
      }, 16);
    }, gecikmeMs);
    return () => { clearTimeout(basla); if (zamanlayici) clearInterval(zamanlayici); };
  }, [metin, harfMs, enUzunMs, gecikmeMs]);

  const sinir = bitti ? metin.length : n;
  // Parcalari ilk `sinir` harfe kadar keser (bicim korunur)
  const ciz = (limit: number) => {
    if (!parcalar) return metin.slice(0, limit);
    let kalan = limit;
    return parcalar.map((p, i) => {
      if (kalan <= 0) return null;
      const parca = p.metin.slice(0, kalan);
      kalan -= p.metin.length;
      return p.sinif || p.stil ? <span key={i} className={p.sinif} style={p.stil}>{parca}</span> : <React.Fragment key={i}>{parca}</React.Fragment>;
    });
  };
  return (
    <span className="relative block">
      <span className="sr-only">{metin}</span>
      {/* Yer ayirici: tam metin, gorunmez (satir sayisi bastan sabit) */}
      <span aria-hidden="true" className="invisible">{ciz(metin.length)}</span>
      <span aria-hidden="true" className="absolute inset-0">
        {ciz(sinir)}
        {!bitti && n > 0 && <span className="yazi-imlec" />}
      </span>
    </span>
  );
}
