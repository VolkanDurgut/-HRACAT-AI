"use client";
/**
 * Kontrol Merkezi > Maliyet & Acenteler: acente navlun tablosu (16.11.2026). Eski sıkışık acente kartlarının yerine;
 * hesap aynı (lib/analiz-acente-navlun.ts). Acente başlık satırı (konteyner, pay, rezervasyon) + liman satırları
 * (dosya, konteyner, son navlun / kont., aralık, lokal, not). Filtre: acente + liman araması.
 */
import React, { useMemo, useState } from "react";
import { Search, Ship } from "lucide-react";
import { Panel, yuzdeMetni } from "@/components/analiz-paneli";
import { CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import { BELIRSIZ_LIMAN } from "@/lib/analiz-acente-navlun";
import { acenteFiltrele, navlunNotu, type AcenteOzeti } from "@/lib/analiz-tablolar";

/** Konteyner başı navlun: "$1.850", kuruşluysa "$1.850,50". Geçersiz para biriminde düz yazı. */
function navlunYazi(tutar: number, para: string): string {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: para, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(tutar);
  } catch {
    return `${tutar.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${para}`;
  }
}

export function AcenteNavlunTablosu({ acenteler, className = "" }: { acenteler: AcenteOzeti[]; className?: string }) {
  const [acente, setAcente] = useState("");
  const [ara, setAra] = useState("");
  const gorunen = useMemo(() => acenteFiltrele(acenteler, acente, ara), [acenteler, acente, ara]);
  const th = "px-3 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap";
  const girdi = "rounded-lg border px-2.5 py-1.5 text-xs text-white outline-none focus:border-white/30";

  return (
    <Panel className={className} ikon={<Ship size={12} />} baslik="Acenteler ve Navlun Fiyatları"
      sag={`${acenteler.length} acente · navlun konteyner başı, dosyalardan`} data-acente-karti="">
      {acenteler.length === 0 ? (
        <p className="px-4 py-6 text-xs text-center" style={{ color: TEXT_MUTED }}>Veri yok</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
            <select value={acente} onChange={(e) => setAcente(e.target.value)} aria-label="Acente" className={girdi} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <option value="">Tüm acenteler</option>
              {acenteler.map((a) => <option key={a.ad} value={a.ad}>{a.ad}</option>)}
            </select>
            <label className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} aria-hidden />
              <input value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Liman ara" aria-label="Liman ara"
                className={`${girdi} pl-7 w-44`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} />
            </label>
            {(acente || ara) && (
              <button type="button" onClick={() => { setAcente(""); setAra(""); }} className="text-[11px] underline" style={{ color: TEXT_MUTED }}>Temizle</button>
            )}
          </div>
          {gorunen.length === 0 ? (
            <p className="px-4 py-6 text-xs text-center" style={{ color: TEXT_MUTED }}>Bu filtrede kayıt yok</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                    <th className={`${th} text-left`} style={{ color: TEXT_MUTED }}>Acente / Liman</th>
                    <th className={`${th} text-right`} style={{ color: TEXT_MUTED }}>Dosya</th>
                    <th className={`${th} text-right`} style={{ color: TEXT_MUTED }}>Konteyner</th>
                    <th className={`${th} text-right`} style={{ color: TEXT_MUTED }}>Son navlun / kont.</th>
                    <th className={`${th} text-right`} style={{ color: TEXT_MUTED }}>Aralık</th>
                    <th className={`${th} text-right`} style={{ color: TEXT_MUTED }}>Lokal / kont.</th>
                    <th className={`${th} text-left`} style={{ color: TEXT_MUTED }}>Not</th>
                  </tr>
                </thead>
                {gorunen.map((a) => (
                  <tbody key={a.ad} data-acente={a.ad}>
                    <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: "rgba(255,255,255,0.025)" }}>
                      <td className="px-3 py-2 font-semibold text-white whitespace-nowrap">{a.ad}</td>
                      <td className="px-3 py-2 text-right text-[10px]" style={{ color: TEXT_MUTED }}>{a.rezervasyon} rez.</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span className="font-semibold text-white tabular-nums">{a.konteyner}</span>
                        <span className="text-[10px] tabular-nums" style={{ color: TEXT_MUTED }}> · {yuzdeMetni(a.pay)}</span>
                      </td>
                      <td colSpan={4} />
                    </tr>
                    {a.limanlar.map((l) => {
                      const aralik = l.enAz !== null && l.enCok !== null && l.enAz !== l.enCok;
                      const not = navlunNotu(l);
                      return (
                        <tr key={`${l.liman}|${l.paraBirimi}`} className="border-b last:border-0 hover:bg-white/[0.03] transition-colors" style={{ borderColor: CARD_BORDER }} data-liman={l.liman}
                          title={l.son !== null ? `${a.ad} → ${l.liman}\nSon navlun: ${navlunYazi(l.son, l.paraBirimi)} / konteyner (${l.sonDosyaNo})${l.ortalama !== null && aralik ? `\nOrtalama: ${navlunYazi(Math.round(l.ortalama * 100) / 100, l.paraBirimi)}` : ""}` : undefined}>
                          <td className={`pl-7 pr-3 py-2 whitespace-nowrap ${l.liman === BELIRSIZ_LIMAN ? "italic" : ""}`} style={{ color: l.liman === BELIRSIZ_LIMAN ? TEXT_MUTED : "#CBD5E1" }}>{l.liman}</td>
                          <td className="px-3 py-2 text-right tabular-nums" style={{ color: TEXT_MUTED }}>{l.dosya}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-white">{l.konteyner}</td>
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                            {l.son !== null ? <span className="font-semibold text-white">{navlunYazi(l.son, l.paraBirimi)}</span> : <span style={{ color: TEXT_MUTED }}>—</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: TEXT_MUTED }}>
                            {aralik ? `${navlunYazi(l.enAz!, l.paraBirimi)}–${navlunYazi(l.enCok!, l.paraBirimi)}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: TEXT_MUTED }}>
                            {l.lokalSon !== null ? navlunYazi(l.lokalSon, l.paraBirimi) : "—"}
                          </td>
                          <td className="px-3 py-2 text-[11px] whitespace-nowrap" style={{ color: /girilmemiş|navlun yok/.test(not) ? "#FCD34D" : TEXT_MUTED }}>{not}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
