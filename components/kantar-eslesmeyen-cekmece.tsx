"use client";
/**
 * KANTAR PANELI · ESLESMEYEN TARTIMLAR CEKMECESI (26.11.2026, yeniden tasarim gorev tanimi).
 * Kullanici: "Uzun sari uyari paragrafini kaldiralim; seridin saginda tek bir 'Eslesmeyen N Tartim' butonu; tiklayinca
 * sagdan acilan cekmece. Eslesmeyen tartimlar temiz bir liste halinde gorunsun, operator tek tikla gemiye eslestirebilsin."
 * Veri: kantar_canli().eslesmeyen (son 3 gun, 5 ton ustu, hicbir kayda bagli degil). Gemiye bagla: ic_gemi_tartim_bagla.
 * Is emri / alis: firma + urun adiyla is emri (alis) acilinca KENDILIGINDEN eslesir (elle baglama yok - bilgi satiri).
 */
import React, { useEffect, useRef, useState } from "react";
import { X, AlertTriangle, Ship, Loader2 } from "lucide-react";
import { useToast } from "@/lib/toast-context";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ROW_HEADER_BG } from "@/lib/theme";
import { kantarSaatYazi, type KantarEslesmeyen } from "@/lib/kantar-canli";
import { tartimiGemiyeBagla } from "@/lib/kantar-canli-veri";
import { kgYazi } from "@/lib/ic-piyasa/is-emri";
import { gemiHataMesaji } from "@/lib/ic-piyasa/gemi-tahliye";

export function KantarEslesmeyenCekmece({ acik, kapat, liste, gemiler, baglandi }: {
  acik: boolean; kapat: () => void; liste: KantarEslesmeyen[];
  gemiler: { id: string; gemi_adi: string }[]; baglandi: () => void;
}) {
  const { showToast } = useToast();
  const [mesgul, setMesgul] = useState<string | null>(null);
  const kapatRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!acik) return;
    kapatRef.current?.focus();
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape") kapat(); };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [acik, kapat]);

  if (!acik) return null;

  const bagla = async (e: KantarEslesmeyen, g: { id: string; gemi_adi: string }) => {
    const anahtar = `${e.kayit_no}-${g.id}`;
    setMesgul(anahtar);
    const { error } = await tartimiGemiyeBagla(g.id, e.kayit_no);
    setMesgul(null);
    if (error) { showToast(gemiHataMesaji(error), "error"); return; }
    showToast(`${e.plaka || "Tartım"} ${g.gemi_adi} tahliyesine bağlandı.`, "success");
    baglandi();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="eslesmeyen-baslik">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={kapat} aria-label="Kapat" tabIndex={-1} />
      <aside className="relative h-full w-full max-w-[480px] border-l flex flex-col shadow-2xl animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="kantar-eslesmeyen-cekmece">
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
          <AlertTriangle size={16} className="text-amber-400" />
          <h2 id="eslesmeyen-baslik" className="text-sm font-bold text-white mr-auto">Eşleşmeyen tartımlar <span className="font-normal" style={{ color: TEXT_MUTED }}>({liste.length})</span></h2>
          <button ref={kapatRef} type="button" onClick={kapat} className="p-1.5 rounded-md hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
        </div>
        <p className="px-4 py-2 text-[11px] border-b" style={{ color: TEXT_MUTED, borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
          Son 3 gün · 5 ton üstü. İş emri / alış aynı firma ve ürünle açılınca kendiliğinden eşleşir.
        </p>
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {liste.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm" style={{ color: TEXT_MUTED }}>Eşleşmeyen tartım yok.</p>
          ) : liste.map((e) => (
            <div key={e.kayit_no} className="px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm font-bold text-white">{e.plaka || "—"}</span>
                <span className="text-[11px]" style={{ color: TEXT_MUTED }}>#{e.kayit_no} · {kantarSaatYazi(e.cikis)}</span>
                <span className="ml-auto text-sm font-semibold text-white tabular-nums">{kgYazi(e.net_kg)}</span>
              </div>
              <p className="text-xs text-white/90 truncate mt-0.5" title={e.firma || ""}>{e.firma || "Firma yazılmamış"}{e.urun ? <span style={{ color: TEXT_MUTED }}> · {e.urun}</span> : null}</p>
              {e.irsaliye_no && <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>İrsaliye {e.irsaliye_no}</p>}
              {gemiler.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {gemiler.map((g) => {
                    const m = mesgul === `${e.kayit_no}-${g.id}`;
                    return (
                      <button key={g.id} type="button" onClick={() => bagla(e, g)} disabled={!!mesgul}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-semibold hover:bg-sky-500/10 disabled:opacity-50"
                        style={{ borderColor: "rgba(56,189,248,0.45)", color: "#7DD3FC" }} data-testid="eslesmeyen-gemi-bagla">
                        {m ? <Loader2 size={11} className="animate-spin" /> : <Ship size={11} />} Gemiye bağla · {g.gemi_adi}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
