"use client";

/**
 * HAT TAKIP > booking detayi (27.11.2026, Asama 1): konteyner yolculugu (bos alindi -> limana girdi -> yuklendi ->
 * tahliye -> limandan cikti) ve gemi hareketleri. Veri lib/hat-takip/veri.ts (salt okuma), yorum _shared/hat-takip.ts.
 */
import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Ship } from "lucide-react";
import { ADIMLAR, konteynerYolculuklari, type HatOlayi } from "@/supabase/functions/_shared/hat-takip";
import { gemiHareketleri, SINIF_ETIKETI, trZaman } from "@/lib/hat-takip/gorunum";
import { hatOlaylariOku } from "@/lib/hat-takip/veri";
import { CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";

function SinifIsareti({ sinif }: { sinif: string | null }) {
  if (sinif === "ACT") return null;
  return (
    <span className="ml-1 text-[10px] px-1 rounded" style={{ backgroundColor: "rgba(251,191,36,0.14)", color: "#FCD34D" }} title={SINIF_ETIKETI[sinif ?? ""] || "Bilinmiyor"}>
      {sinif === "EST" ? "tahmini" : "plan"}
    </span>
  );
}

export function TakipDetayi({ takipId, pod }: { takipId: string; pod: string | null }) {
  const [olaylar, setOlaylar] = useState<HatOlayi[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    setOlaylar(null); setHata(null);
    hatOlaylariOku(takipId)
      .then((o) => { if (!iptal) setOlaylar(o); })
      .catch((e) => { if (!iptal) setHata(e instanceof Error ? e.message : "Olaylar okunamadı."); });
    return () => { iptal = true; };
  }, [takipId]);

  const yolculuk = useMemo(() => (olaylar ? konteynerYolculuklari(olaylar, pod) : []), [olaylar, pod]);
  const hareketler = useMemo(() => (olaylar ? gemiHareketleri(olaylar) : []), [olaylar]);

  if (hata) return <p className="text-sm flex items-center gap-2 text-red-300 px-4 py-3"><AlertCircle size={14} /> {hata}</p>;
  if (!olaylar) return <p className="text-sm flex items-center gap-2 px-4 py-3" style={{ color: TEXT_MUTED }}><Loader2 size={14} className="animate-spin" /> Olaylar yükleniyor…</p>;
  if (!olaylar.length) return <p className="text-sm px-4 py-3" style={{ color: TEXT_MUTED }}>Bu booking için henüz olay yok.</p>;

  return (
    <div className="px-4 py-3 space-y-4" data-testid="hat-takip-detay">
      {hareketler.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5"><Ship size={13} /> Gemi hareketleri</p>
          <div className="flex flex-wrap gap-2">
            {hareketler.map((o) => (
              <div key={o.anahtar} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                <span className="text-white font-medium">{o.kod === "DEPA" ? "Kalkış" : "Varış"} · {o.yer || "?"}</span>
                <SinifIsareti sinif={o.sinif} />
                <div style={{ color: TEXT_MUTED }}>{trZaman(o.zaman)}{o.gemi ? ` · ${o.gemi}` : ""}{o.sefer ? ` ${o.sefer}` : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {yolculuk.length > 0 && (
        <div className="overflow-x-auto">
          <p className="text-xs font-semibold text-white mb-2">Konteynerler ({yolculuk.length})</p>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: TEXT_MUTED, backgroundColor: ROW_HEADER_BG }}>
                <th className="text-left font-medium px-2 py-1.5">Konteyner</th>
                {ADIMLAR.map((a) => <th key={a.anahtar} className="text-left font-medium px-2 py-1.5 whitespace-nowrap">{a.etiket}</th>)}
              </tr>
            </thead>
            <tbody>
              {yolculuk.map((k) => (
                <tr key={k.konteyner} className="border-t" style={{ borderColor: CARD_BORDER }}>
                  <td className="px-2 py-1.5 font-mono text-white whitespace-nowrap">{k.konteyner}</td>
                  {ADIMLAR.map((a) => {
                    const o = k.adimlar[a.anahtar];
                    return (
                      <td key={a.anahtar} className="px-2 py-1.5 whitespace-nowrap" style={{ color: o ? (o.sinif === "ACT" ? "#E5E7EB" : TEXT_MUTED) : "#3A4152" }}>
                        {o ? <>{trZaman(o.zaman)}<SinifIsareti sinif={o.sinif} /></> : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
