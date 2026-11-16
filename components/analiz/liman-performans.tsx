"use client";
/**
 * Kontrol Merkezi > Lojistik & Rotalar: Liman Performans Tablosu (16.11.2026). Eski üç kutu (Varış Limanları,
 * Birim Fiyat (Liman), Ortalama Transit Süresi) tek tabloda; hesaplar aynı (app/analiz/page.tsx liman toplamları).
 * Sütun başlığına tıklayınca sıralanır; tüm limanlar gösterilir (eskiden ilk 8).
 */
import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Globe2 } from "lucide-react";
import { Panel, yuzdeMetni } from "@/components/analiz-paneli";
import { ACCENT, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import { limanSirala, type LimanPerformansi, type LimanSiraAlani } from "@/lib/analiz-tablolar";

type Sutun = { alan: LimanSiraAlani; ad: string; sag?: boolean; ipucu?: string };
const SUTUNLAR: Sutun[] = [
  { alan: "liman", ad: "Varış limanı" },
  { alan: "dosya", ad: "Dosya", sag: true },
  { alan: "konteyner", ad: "Konteyner", sag: true },
  { alan: "hacim", ad: "Hacim", sag: true },
  { alan: "birimFiyat", ad: "Birim fiyat", sag: true, ipucu: "Hacim / MTS (teslim şekli dahil fiyat)" },
  { alan: "transit", ad: "Transit", sag: true, ipucu: "ETD → ETA ortalama gün (en az–en çok)" },
];

export function LimanPerformansTablosu({ satirlar, tutarKisa, tutarTam, paraBirimi, className = "" }: {
  satirlar: LimanPerformansi[];
  tutarKisa: (n: number) => string;
  tutarTam: (n: number) => string;
  paraBirimi: string;
  className?: string;
}) {
  const [sira, setSira] = useState<{ alan: LimanSiraAlani; artan: boolean }>({ alan: "konteyner", artan: false });
  const sirali = useMemo(() => limanSirala(satirlar, sira.alan, sira.artan), [satirlar, sira]);
  const maxKont = Math.max(0, ...satirlar.map((s) => s.konteyner));
  const toplamKont = satirlar.reduce((t, s) => t + s.konteyner, 0);
  const tiklandi = (alan: LimanSiraAlani) =>
    setSira((s) => (s.alan === alan ? { alan, artan: !s.artan } : { alan, artan: alan === "liman" }));
  const th = "px-3 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap select-none";

  return (
    <Panel className={className} ikon={<Globe2 size={12} />} baslik="Liman Performansı"
      sag={`${satirlar.length} liman · ${toplamKont.toLocaleString("tr-TR")} konteyner · sıralamak için başlığa tıklayın`} data-liman-performansi="">
      {satirlar.length === 0 ? (
        <p className="px-4 py-6 text-xs text-center" style={{ color: TEXT_MUTED }}>Veri yok</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                <th className={`${th} text-left w-8`} style={{ color: TEXT_MUTED }}>#</th>
                {SUTUNLAR.map((s) => {
                  const secili = sira.alan === s.alan;
                  return (
                    <th key={s.alan} className={`${th} ${s.sag ? "text-right" : "text-left"}`} style={{ color: secili ? "white" : TEXT_MUTED }}
                      aria-sort={secili ? (sira.artan ? "ascending" : "descending") : "none"} title={s.ipucu}>
                      <button type="button" onClick={() => tiklandi(s.alan)} className={`inline-flex items-center gap-1 hover:text-white ${s.sag ? "flex-row-reverse" : ""}`}>
                        {s.ad}
                        {secili && (sira.artan ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                      </button>
                    </th>
                  );
                })}
                <th className={`${th} text-left`} style={{ color: TEXT_MUTED }}>Teslim</th>
              </tr>
            </thead>
            <tbody>
              {sirali.map((s, i) => (
                <tr key={s.liman} className="border-b last:border-0 hover:bg-white/[0.03] transition-colors" style={{ borderColor: CARD_BORDER }}
                  title={s.yazimlar.length > 1 ? `${s.liman} — birleştirilen yazımlar:\n${s.yazimlar.join("\n")}` : undefined} data-liman={s.liman}>
                  <td className="px-3 py-2.5 text-[10px] font-bold tabular-nums" style={{ color: TEXT_MUTED }}>{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium text-white whitespace-nowrap">{s.liman}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: TEXT_MUTED }}>{s.dosya}</td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="hidden md:block w-16 h-1 rounded-full" style={{ backgroundColor: CARD_BORDER }} aria-hidden>
                        <div className="h-1 rounded-full" style={{ width: `${maxKont > 0 ? Math.max((s.konteyner / maxKont) * 100, 2) : 0}%`, backgroundColor: ACCENT }} />
                      </div>
                      <span className="font-semibold text-white tabular-nums">{s.konteyner}</span>
                      <span className="w-9 text-[10px] tabular-nums" style={{ color: TEXT_MUTED }}>{yuzdeMetni(s.pay)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-white tabular-nums whitespace-nowrap" title={tutarTam(s.hacim)}>{tutarKisa(s.hacim)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap" title={s.mts > 0 ? `${s.mts.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} MTS` : "Miktar girilmemiş"}>
                    {s.birimFiyat !== null ? <span className="text-white">{tutarTam(s.birimFiyat)}<span style={{ color: TEXT_MUTED }}>/MTS</span></span> : <span style={{ color: TEXT_MUTED }}>—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {s.transit ? (
                      <span className="text-white" title={`${s.transit.adet} rezervasyon`}>{s.transit.ortalama} gün
                        {s.transit.enAz !== s.transit.enCok && <span className="text-[10px]" style={{ color: TEXT_MUTED }}> · {s.transit.enAz}–{s.transit.enCok}</span>}
                      </span>
                    ) : <span style={{ color: TEXT_MUTED }} title="ETA girilince hesaplanır">—</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.teslim.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[10px] border-t" style={{ color: TEXT_MUTED, borderColor: CARD_BORDER }}>
            Birim fiyat = hacim / MTS ({paraBirimi}, teslim şekli fiyatı). Transit = ETD → ETA ortalaması. Liman adları farklı yazımlarla birleştirilir (satırın üzerine gelin).
          </p>
        </div>
      )}
    </Panel>
  );
}
