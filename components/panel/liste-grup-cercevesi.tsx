"use client";

import React from "react";
import { ChevronDown, ChevronRight, Ship, CalendarDays, Wallet } from "lucide-react";
import { CARD_BG, TEXT_MUTED } from "@/lib/theme";
import { DURUM_RENGI } from "@/components/panel/is-listesi-satirlari";
import { DURUM_ETIKETI, LISTE_GRUPLARI, type ListeDurumu, type ListeGrubu } from "@/lib/panel/is-listesi";

/**
 * Ana Panel is listesi grup cercevesi (25.11.2026): her grup (Acik Sevkiyatlar / Rezervasyon Bekleyenler / Odeme
 * Bekleyenler) ayri kutu; grubun renginde kalin sol kenar + ince cerceve, baslik seridi (ad, is ve konteyner sayisi,
 * sevkiyatta sari / kirmizi / yesil dagilimi, kisa aciklama). Basliga tiklaninca daralir; secim sayfada hatirlanir.
 */
const IKON: Record<ListeGrubu, React.ReactNode> = {
  sevkiyat: <Ship size={15} />, rezervasyon: <CalendarDays size={15} />, odeme: <Wallet size={15} />,
};

export function ListeGrupCercevesi({ grup, sayi, konteyner, dagilim, kapali, degistir, children }: {
  grup: ListeGrubu; sayi: number; konteyner: number; dagilim: Partial<Record<ListeDurumu, number>>;
  kapali: boolean; degistir: () => void; children: React.ReactNode;
}) {
  const g = LISTE_GRUPLARI[grup];
  const govdeId = `panel-grup-${grup}`;
  return (
    <section className="rounded-xl overflow-hidden animate-fade-up" data-testid={govdeId} data-kapali={kapali ? "evet" : undefined}
      style={{ backgroundColor: CARD_BG, border: `1px solid ${g.kenar}66`, borderLeft: `4px solid ${g.kenar}` }}>
      <button type="button" onClick={degistir} aria-expanded={!kapali} aria-controls={govdeId + "-govde"}
        className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:brightness-125 transition"
        style={{ backgroundColor: g.zemin, borderBottom: kapali ? "none" : `1px solid ${g.kenar}40` }}>
        <span style={{ color: g.renk }} className="inline-flex items-center gap-2">
          {kapali ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          {IKON[grup]}
          <span className="text-sm font-bold uppercase tracking-wide">{g.baslik}</span>
        </span>
        <span className="text-sm font-bold text-white tabular-nums" data-grup-sayi>{sayi} iş</span>
        {konteyner > 0 && <span className="text-xs tabular-nums" style={{ color: TEXT_MUTED }}>· {konteyner} konteyner</span>}
        {grup === "sevkiyat" && (
          <span className="flex flex-wrap items-center gap-1.5">
            {(["basladi", "cutoff", "acik"] as const).filter((d) => dagilim[d]).map((d) => (
              <span key={d} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                style={{ backgroundColor: DURUM_RENGI[d].zemin, color: DURUM_RENGI[d].renk }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: DURUM_RENGI[d].kenar }} />
                {DURUM_ETIKETI[d]} {dagilim[d]}
              </span>
            ))}
          </span>
        )}
        <span className="text-[11px] ml-auto max-md:w-full max-md:ml-0" style={{ color: TEXT_MUTED }}>{kapali ? "Göstermek için tıklayın" : g.aciklama}</span>
      </button>
      {!kapali && <div id={govdeId + "-govde"}>{children}</div>}
    </section>
  );
}
