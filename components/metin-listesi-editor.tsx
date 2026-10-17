"use client";

import React, { useLayoutEffect, useRef } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { CARD_BORDER, TEXT_MUTED } from "@/lib/theme";

/**
 * Sirali metin listesi duzenleyici (17.10.2026): evrak listesi, ozel sartlar,
 * alt bilgi satirlari. Her satir ayri kutu (satir ici alt satir olabilir -
 * ozel sartlarda "Weight shortage:\n..." gibi). Numara basilirken eklenir;
 * burada sadece goruntu icin yazilir.
 */
export function MetinListesiEditor({
  deger,
  degis,
  encok = 30,
  satirYuksekligi = 1,
  numarali = true,
  yerTutucu,
  ekleEtiketi = "Satır ekle",
  vurgula,
}: {
  deger: string[];
  degis: (yeni: string[]) => void;
  encok?: number;
  satirYuksekligi?: number;
  numarali?: boolean;
  yerTutucu?: string;
  ekleEtiketi?: string;
  /** Satirin yaninda kucuk not (orn. "Sadece CIF/CIP") */
  vurgula?: (metin: string) => string | null;
}) {
  const guncelle = (i: number, v: string) => degis(deger.map((x, j) => (j === i ? v : x)));
  const sil = (i: number) => degis(deger.filter((_, j) => j !== i));
  const tasi = (i: number, yon: -1 | 1) => {
    const j = i + yon;
    if (j < 0 || j >= deger.length) return;
    const y = [...deger];
    [y[i], y[j]] = [y[j], y[i]];
    degis(y);
  };
  return (
    <div className="space-y-1.5">
      {deger.map((m, i) => {
        const not = vurgula?.(m);
        return (
          <div key={i} className="flex items-start gap-1.5">
            {numarali && <span className="w-6 shrink-0 pt-2 text-right text-xs tabular-nums" style={{ color: TEXT_MUTED }}>{i + 1}.</span>}
            <div className="flex-1 min-w-0">
              <OtomatikKutu
                deger={m}
                degis={(v) => guncelle(i, v)}
                enAzSatir={satirYuksekligi}
                yerTutucu={yerTutucu}
                etiket={`${i + 1}. satır`}
              />
              {not && <p className="text-[10px] mt-0.5 text-amber-400">{not}</p>}
            </div>
            <div className="flex shrink-0 pt-1">
              <button type="button" onClick={() => tasi(i, -1)} disabled={i === 0} title="Yukarı" className="p-1 rounded hover:bg-white/5 disabled:opacity-30" style={{ color: TEXT_MUTED }}><ArrowUp size={13} /></button>
              <button type="button" onClick={() => tasi(i, 1)} disabled={i === deger.length - 1} title="Aşağı" className="p-1 rounded hover:bg-white/5 disabled:opacity-30" style={{ color: TEXT_MUTED }}><ArrowDown size={13} /></button>
              <button type="button" onClick={() => sil(i)} title="Sil" className="p-1 rounded hover:bg-red-500/10 text-red-400"><Trash2 size={13} /></button>
            </div>
          </div>
        );
      })}
      {deger.length < encok && (
        <button type="button" onClick={() => degis([...deger, ""])} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }}>
          <Plus size={12} /> {ekleEtiketi}
        </button>
      )}
    </div>
  );
}

/** Yuksekligi icerige gore buyuyen kutu (uzun madde kesilmesin). */
function OtomatikKutu({ deger, degis, enAzSatir, yerTutucu, etiket }: { deger: string; degis: (v: string) => void; enAzSatir: number; yerTutucu?: string; etiket: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const olc = () => {
      const el = ref.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    olc();
    // Genislik degisince (pencere / telefon yan cevirme) satir sayisi degisir
    window.addEventListener("resize", olc);
    return () => window.removeEventListener("resize", olc);
  }, [deger]);
  return (
    <textarea
      ref={ref}
      value={deger}
      onChange={(e) => degis(e.target.value)}
      rows={enAzSatir}
      placeholder={yerTutucu}
      maxLength={1000}
      className="w-full px-2.5 py-1.5 rounded-lg border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-none overflow-hidden"
      style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }}
      aria-label={etiket}
    />
  );
}
