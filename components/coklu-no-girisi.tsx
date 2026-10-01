"use client";

import React from "react";
import { Plus, X } from "lucide-react";
import { AZAMI_NO_SAYISI, noParcala, NO_AYIRICI } from "@/lib/coklu-no";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

/**
 * Proforma No / Lot No icin 1 veya 2 numaralik giris (talep: 01.10.2026).
 * Her numara ayri kutuda; "+ Ikinci ... ekle" ile ikinci kutu acilir, carpi
 * ile kaldirilir. Kaydederken lib/coklu-no.ts -> noBirlestir ile tek metne
 * ("A / B") cevrilir.
 */
export function CokluNoGirisi({
  etiket,
  ekEtiket,
  degerler,
  onChange,
  placeholder,
  buyukHarf = true,
}: {
  /** Ornek: "Proforma No" */
  etiket: string;
  /** Ornek: "ikinci proforma" -> "+ İkinci proforma ekle" */
  ekEtiket: string;
  degerler: string[];
  onChange: (degerler: string[]) => void;
  placeholder?: string;
  buyukHarf?: boolean;
}) {
  const liste = degerler.length > 0 ? degerler : [""];
  const guncelle = (i: number, v: string) => {
    const yeni = [...liste];
    yeni[i] = buyukHarf ? v.toUpperCase() : v;
    onChange(yeni);
  };
  const kaldir = (i: number) => onChange(liste.filter((_, j) => j !== i));

  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>{etiket}</label>
      <div className="space-y-2">
        {liste.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            {liste.length > 1 && (
              <span className="w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums" style={{ color: TEXT_MUTED }}>{i + 1}.</span>
            )}
            <input
              value={v}
              onChange={(e) => guncelle(i, e.target.value)}
              placeholder={i === 0 ? placeholder : `${etiket} (${i + 1})`}
              aria-label={liste.length > 1 ? `${etiket} ${i + 1}` : etiket}
              className="w-full px-3 py-2 border rounded-lg text-sm text-white font-mono"
              style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
            />
            {i > 0 && (
              <button
                type="button"
                onClick={() => kaldir(i)}
                className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg border hover:bg-white/5 hover:text-red-400 transition-colors"
                style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}
                title="Bu numarayı kaldır"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {liste.length < AZAMI_NO_SAYISI && (
        <button
          type="button"
          onClick={() => onChange([...liste, ""])}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium hover:opacity-80"
          style={{ color: ACCENT }}
        >
          <Plus size={12} /> {ekEtiket.charAt(0).toLocaleUpperCase("tr-TR") + ekEtiket.slice(1)} ekle
        </button>
      )}
    </div>
  );
}

/**
 * Dar tablo hucreleri icin: ilk numara + "+1" rozeti, tamamı title'da.
 * Tek numarada sadece numarayi gosterir (eski gorunumle birebir ayni).
 */
export function CokluNoKisa({ deger, className, style }: { deger: string | null | undefined; className?: string; style?: React.CSSProperties }) {
  if (!deger) return <span className={className} style={style}>—</span>;
  const parcalar = noParcala(deger);
  if (parcalar.length <= 1) return <span className={className} style={style}>{deger}</span>;
  return (
    <span className={className} style={style} title={parcalar.join(NO_AYIRICI)}>
      {parcalar[0]}
      <span className="ml-1 inline-flex items-center rounded px-1 text-[9px] font-semibold align-middle" style={{ backgroundColor: "rgba(16,185,129,0.12)", color: ACCENT }}>
        +{parcalar.length - 1}
      </span>
    </span>
  );
}

/**
 * Kart alanlari icin: her numara ayri satirda (tek numarada duz metin).
 * CopyableField'in `gosterim` prop'una verilir; kopyalanan deger "A / B" kalir.
 */
export function cokluNoSatirlari(deger: string | null | undefined): React.ReactNode {
  const parcalar = noParcala(deger);
  if (parcalar.length <= 1) return deger || null;
  return (
    <span className="flex flex-col">
      {parcalar.map((p, i) => <span key={i} className="break-normal whitespace-nowrap">{p}</span>)}
    </span>
  );
}
