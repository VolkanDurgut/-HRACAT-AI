"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, Info, MinusCircle, RefreshCw } from "lucide-react";
import type { KonsimentoKontrolDurumu, KonsimentoKontrolSatiri } from "@/lib/konsimento/kontrol";
import { CARD_BORDER, TEXT_MUTED } from "@/lib/theme";

/**
 * Yapay zekasiz belge kontrol satirlari: konsimento talimati + Draft BL (16.11.2026'da konsimento-talimati-section'dan
 * ortak bilesene tasindi; gorunum beyanname kontrolu ile ayni). "Yeniden kontrol et": sistemdeki bilgiler
 * degistiyse (ya da kontrol kurali iyilestirildiyse) yuklu PDF yeniden okunup karsilastirilir.
 */
const DURUM: Record<KonsimentoKontrolDurumu, { renk: string; ikon: React.ReactNode; etiket: string }> = {
  uyumlu: { renk: "text-green-400", ikon: <CheckCircle2 size={13} />, etiket: "Uyumlu" },
  uyusmuyor: { renk: "text-amber-400", ikon: <AlertTriangle size={13} />, etiket: "Uyuşmuyor" },
  okunamadi: { renk: "text-slate-400", ikon: <MinusCircle size={13} />, etiket: "Okunamadı" },
  bilgi: { renk: "text-sky-300", ikon: <Info size={13} />, etiket: "Elle bakın" },
};

export function YenidenKontrolDugmesi({ yenileniyor, onYenile, metin = "Yeniden kontrol et", testId }: { yenileniyor: boolean; onYenile: () => void; metin?: string; testId?: string }) {
  return (
    <button onClick={onYenile} disabled={yenileniyor} className="inline-flex items-center gap-1 text-[11px] hover:text-white disabled:opacity-50" style={{ color: TEXT_MUTED }}
      title="Yüklü PDF'i yeniden okuyup sistemle karşılaştır" data-testid={testId}>
      <RefreshCw size={11} className={yenileniyor ? "animate-spin" : ""} /> {metin}
    </button>
  );
}

export function BelgeKontrolListesi({ satirlar, belgeEtiketi, yenileniyor, onYenile, testId }: {
  satirlar: KonsimentoKontrolSatiri[]; belgeEtiketi: string; yenileniyor: boolean; onYenile: () => void; testId: string;
}) {
  return (
    <div className="mt-2" data-testid={testId}>
      <div className="flex items-center gap-2">
        <span className="ml-auto"><YenidenKontrolDugmesi yenileniyor={yenileniyor} onYenile={onYenile} testId={`${testId}-yenile`} /></span>
      </div>
      <div className="mt-2 border-t divide-y" style={{ borderColor: CARD_BORDER }}>
        {satirlar.map((k) => {
          const d = DURUM[k.durum];
          return (
            <div key={k.alan} className="grid grid-cols-[18px_minmax(0,140px)_minmax(0,1fr)] sm:grid-cols-[18px_140px_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-0.5 py-1.5 text-xs" style={{ borderColor: CARD_BORDER }} data-testid={`${testId}-satir`}>
              <span className={`${d.renk} pt-0.5`} title={d.etiket}>{d.ikon}</span>
              <span className="text-slate-300 font-medium">{k.alan}</span>
              <span className="truncate" style={{ color: TEXT_MUTED }} title={k.sistem}>Sistem: <span className="text-white">{k.sistem}</span></span>
              <span className="truncate col-start-3 sm:col-start-auto" style={{ color: TEXT_MUTED }} title={k.belge}>{belgeEtiketi}: <span className={k.durum === "uyusmuyor" ? "text-amber-300" : "text-white"}>{k.belge}</span></span>
              {k.not && <span className="col-start-3 sm:col-span-2 text-[11px] break-words" style={{ color: k.durum === "uyusmuyor" ? "#FCD34D" : k.durum === "bilgi" ? "#BAE6FD" : TEXT_MUTED }}>{k.not}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
