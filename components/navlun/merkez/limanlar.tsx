"use client";
/**
 * Navlun Merkezi > Limanlar (24.11.2026). Liman basina en iyi teklif (sunucunun secimi: yalniz kesin ve suresi dolmamis),
 * hedef / kabul ve acentelerin guncel teklifleri. Satira tiklayinca o limanin teklifleri acilir (yalniz acik satir cizilir).
 */
import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import type { DegerlendirmeSatiri, LimanSatiri } from "@/lib/navlun/merkez";
import { Bos, DURUM_ROZETI, gunYaz, Kart, norm, Rozet, tutarYaz } from "@/components/navlun/merkez/ortak";

const GECERLILIK_ADI = { teklif: "teklifte yazıyor", acente: "acentenin alışkanlığı", varsayilan: "varsayılan 21 gün" } as const;

function TeklifTablosu({ liste }: { liste: DegerlendirmeSatiri[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
            {["Acente", "Armatör", "Ekip.", "Teklif", "Konteyner başı", "Geçerlilik", "FT / TT", "Durum", "Tarih"].map((b) => <th key={b} className="text-left font-medium px-3 py-2 whitespace-nowrap">{b}</th>)}
          </tr>
        </thead>
        <tbody>
          {liste.map((t) => {
            const [ad, renk] = DURUM_ROZETI[t.durum];
            return (
              <tr key={t.teklif_id} className="border-t" style={{ borderColor: CARD_BORDER }} data-teklif={t.teklif_id}>
                <td className="px-3 py-2 text-white whitespace-nowrap">{t.acente || "—"}{t.en_iyi && <span className="ml-2"><Rozet metin="en iyi" renk="yesil" /></span>}</td>
                <td className="px-3 py-2" style={{ color: "#C9D1DC" }}>{t.armator || "—"}</td>
                <td className="px-3 py-2" style={{ color: "#C9D1DC" }}>{t.ekipman || "20DC"}</td>
                <td className="px-3 py-2 tabular-nums text-white whitespace-nowrap">{tutarYaz(t.tutar, t.para)}</td>
                <td className="px-3 py-2" title={t.dayanak || undefined}>
                  <span className="tabular-nums text-white font-medium">{t.yaklasik ? "≈ " : ""}{tutarYaz(t.toplam_usd)}</span>
                  {t.metin && <span className="block text-[11px] leading-snug" style={{ color: TEXT_MUTED }}>{t.metin}</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap" title={GECERLILIK_ADI[t.gecerlilik_kaynagi]}>
                  <span style={{ color: "#C9D1DC" }}>{gunYaz(t.gecerlilik_bitis)}</span>
                  <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{GECERLILIK_ADI[t.gecerlilik_kaynagi]}</span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#C9D1DC" }}>{t.free_time_gun ?? "—"} / {t.transit_gun ?? "—"}</td>
                <td className="px-3 py-2"><Rozet metin={ad} renk={renk} title={t.celiski || undefined} /></td>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{gunYaz(t.tarih)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LimanDetayi({ l }: { l: LimanSatiri }) {
  const [tumu, setTumu] = useState(false);
  const eski = l.tumu.length - l.guncel.length;
  return (
    <div className="border-t" style={{ borderColor: CARD_BORDER }} data-testid="liman-detay">
      <TeklifTablosu liste={tumu ? l.tumu : l.guncel} />
      {eski > 0 && (
        <button type="button" onClick={() => setTumu(!tumu)} className="px-3 py-2 text-xs underline" style={{ color: TEXT_MUTED }}>
          {tumu ? "Yalnız güncel teklifler" : `Eski teklifleri de göster (${eski})`}
        </button>
      )}
    </div>
  );
}

export function LimanlarSekmesi({ limanlar, acikLiman, onAc }: { limanlar: LimanSatiri[]; acikLiman: string | null; onAc: (a: string | null) => void }) {
  const [arama, setArama] = useState("");
  const gorunen = useMemo(() => {
    const q = norm(arama.trim());
    if (!q) return limanlar;
    return limanlar.filter((l) => norm(l.ad).includes(q) || l.anahtar.includes(q) || l.guncel.some((t) => norm(t.acente || "").includes(q) || norm(t.armator || "").includes(q)));
  }, [limanlar, arama]);
  return (
    <div>
      <div className="relative mb-3 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
        <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Liman, acente veya armatör ara" aria-label="Ara"
          className="h-9 w-full rounded-lg border bg-transparent pl-8 pr-3 text-sm text-white" style={{ borderColor: CARD_BORDER }} />
      </div>
      <Kart testId="merkez-limanlar">
        {gorunen.length === 0 ? <Bos metin={limanlar.length ? "Aramaya uyan liman yok." : "Son 150 günde değerlendirilmiş teklif yok."} /> : (
          <div>
            <div className="hidden md:grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_110px_130px_90px_80px] gap-3 px-4 py-2 text-[11px] font-medium" style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
              <span>Liman</span><span>En iyi (konteyner başı)</span><span>Hedef</span><span>Kabul</span><span>Teklif</span><span>Son</span>
            </div>
            {gorunen.map((l) => {
              const acik = acikLiman === l.anahtar;
              const e = l.enIyi;
              return (
                <div key={l.anahtar} className="border-t first:border-t-0" style={{ borderColor: CARD_BORDER }} data-liman={l.anahtar}>
                  <button type="button" onClick={() => onAc(acik ? null : l.anahtar)} aria-expanded={acik}
                    className="w-full grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_110px_130px_90px_80px] gap-1 md:gap-3 px-4 py-3 text-left text-sm hover:bg-white/[0.02]">
                    <span className="flex items-center gap-2 text-white font-medium min-w-0">
                      {acik ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span className="truncate">{l.ad}</span>
                    </span>
                    <span className="min-w-0" title={e?.dayanak || undefined}>
                      {e ? (
                        <>
                          <span className="text-white tabular-nums font-semibold">{e.yaklasik ? "≈ " : ""}{tutarYaz(e.toplam_usd)}</span>
                          <span className="ml-2" style={{ color: "#C9D1DC" }}>{e.acente}{e.armator ? ` · ${e.armator}` : ""}</span>
                          {e.metin && <span className="block text-[11px] truncate" style={{ color: TEXT_MUTED }}>{e.metin}</span>}
                        </>
                      ) : (
                        <span className="text-xs" style={{ color: "#FCD34D" }}>
                          {l.sayilar.eksik || l.sayilar.kontrol ? "Kesin teklif yok (lokal belirsiz / kontrol)" : "Güncel teklif yok (süresi dolmuş)"}
                        </span>
                      )}
                    </span>
                    <span className="tabular-nums" style={{ color: "#C9D1DC" }}>{l.hedef ? tutarYaz(l.hedef.tutar) : "—"}</span>
                    <span className="tabular-nums" style={{ color: "#C9D1DC" }}>{l.kabul ? `${tutarYaz(l.kabul.tutar)}${l.kabul.armator ? ` · ${l.kabul.armator}` : ""}` : "—"}</span>
                    <span style={{ color: "#C9D1DC" }}>{l.guncel.length}{l.sayilar.suresi_doldu ? <span className="text-[11px]" style={{ color: TEXT_MUTED }}> ({l.sayilar.suresi_doldu} eski)</span> : null}</span>
                    <span className="text-xs" style={{ color: TEXT_MUTED }}>{gunYaz(l.sonTarih)}</span>
                  </button>
                  {acik && <LimanDetayi l={l} />}
                </div>
              );
            })}
          </div>
        )}
      </Kart>
    </div>
  );
}
