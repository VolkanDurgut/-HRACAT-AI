"use client";
/**
 * Proforma Olustur > SILINEN PROFORMALAR (21.11.2026). Musteri bazinda gruplu liste; "Geri yükle" proformayi ayni
 * numarayla geri acar (Siparis Listesi'nde yeniden "Onay bekleyen"), "Geri yükle ve düzenle" ayrica editorde acar
 * (revize icin). Kaynak: denetim kaydi (lib/proforma/veri.ts). Kayitli Proformalar listesiyle ayni gorunum.
 */
import React, { useMemo, useState } from "react";
import { AlertCircle, History, ChevronDown, ChevronRight, Loader2, Pencil, RotateCcw, Search } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { silinenleriGrupla, type SilinenProforma } from "@/lib/proforma/silinen";

const tarihTr = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "—");
const zamanTr = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const para = (n: number, p: string) => `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${p}`;

export function SilinenProformalar({ liste, hata, mesgul, onGeriYukle, onYenile, onKapat }: {
  liste: SilinenProforma[] | null; hata: string | null; mesgul: string | null;
  onGeriYukle: (p: SilinenProforma, duzenle: boolean) => void; onYenile: () => void; onKapat: () => void;
}) {
  const [arama, setArama] = useState("");
  const [kapali, setKapali] = useState<Set<string>>(new Set());
  const gruplar = useMemo(() => silinenleriGrupla(liste || [], arama), [liste, arama]);
  const toplam = liste?.length || 0;
  return (
    <section className="mb-5 rounded-xl border" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="silinen-liste">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
        <History size={16} style={{ color: ACCENT }} />
        <h2 className="text-sm font-semibold text-white">Silinen Proformalar</h2>
        <span className="text-xs" style={{ color: TEXT_MUTED }}>
          {toplam} proforma · müşteri bazında · geri yüklenen proforma Sipariş Listesi&apos;nde yeniden &quot;Onay bekleyen&quot; olur
        </span>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
          <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Proforma no, müşteri veya ürün" aria-label="Silinen proforma ara"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
        </div>
        <button onClick={onKapat} className="px-2.5 py-1.5 rounded-lg border text-xs hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Kapat</button>
      </div>
      {hata ? (
        <p className="px-4 py-4 text-sm text-red-400 flex items-center gap-2"><AlertCircle size={15} /> {hata} <button onClick={onYenile} className="underline">Yeniden dene</button></p>
      ) : liste === null ? (
        <p className="px-4 py-6 text-sm text-center inline-flex w-full justify-center items-center gap-2" style={{ color: TEXT_MUTED }}><Loader2 size={14} className="animate-spin" /> Yükleniyor…</p>
      ) : gruplar.length === 0 ? (
        <p className="px-4 py-6 text-sm text-center" style={{ color: TEXT_MUTED }}>{toplam ? "Aramaya uyan silinen proforma yok." : "Silinen proforma yok."}</p>
      ) : (
        <div className="max-h-[480px] overflow-y-auto">
          {gruplar.map((g) => {
            const acik = !kapali.has(g.anahtar);
            const tutar = Object.entries(g.toplam).map(([p, t]) => para(t, p)).join(" + ") || "—";
            return (
              <div key={g.anahtar} className="border-b last:border-0" style={{ borderColor: CARD_BORDER }} data-silinen-musteri={g.unvan}>
                <button type="button" onClick={() => setKapali((s) => { const n = new Set(s); if (n.has(g.anahtar)) n.delete(g.anahtar); else n.add(g.anahtar); return n; })}
                  aria-expanded={acik} className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-left hover:bg-white/[0.02]" style={{ backgroundColor: ROW_HEADER_BG }}>
                  {acik ? <ChevronDown size={14} style={{ color: TEXT_MUTED }} /> : <ChevronRight size={14} style={{ color: TEXT_MUTED }} />}
                  <span className="text-[13px] font-semibold text-white min-w-0 truncate">{g.unvan}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#C9D1DC" }}>{g.proformalar.length} proforma</span>
                  <span className="ml-auto text-xs tabular-nums" style={{ color: TEXT_MUTED }}>{tutar} · {g.mts.toLocaleString("tr-TR")} MTS</span>
                </button>
                {acik && (
                  <ul>
                    {g.proformalar.map((p) => (
                      <li key={p.denetim_id} className="border-t px-4 py-2.5 flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-1.5" style={{ borderColor: CARD_BORDER }} data-testid="silinen-satir">
                        <div className="min-w-0 basis-full md:basis-auto md:w-[200px] md:shrink-0">
                          <p className="font-mono text-sm font-semibold text-white break-all">{p.proforma_no}</p>
                          <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Proforma {tarihTr(p.tarih)}</p>
                        </div>
                        <p className="min-w-0 basis-full md:basis-0 md:flex-1 text-xs md:truncate" style={{ color: "#C9D1DC" }} title={p.urunler || ""}>{p.urunler || "—"}</p>
                        <p className="text-sm font-semibold text-white whitespace-nowrap tabular-nums md:w-[150px] md:text-right">
                          {p.toplam !== null ? para(p.toplam, p.para_birimi) : "—"}
                          <span className="block text-[11px] font-normal" style={{ color: TEXT_MUTED }}>{(p.toplam_mts || 0).toLocaleString("tr-TR")} MTS</span>
                        </p>
                        <p className="text-[11px] md:w-[190px]" style={{ color: TEXT_MUTED }}>
                          Silindi {zamanTr(p.silinme)}
                          <span className="block truncate">{p.silen || ""}</span>
                        </p>
                        <div className="flex items-center gap-1.5 ml-auto">
                          <button onClick={() => onGeriYukle(p, false)} disabled={mesgul !== null} data-silinen-geri={p.proforma_no}
                            title="Proformayı aynı numarayla geri yükle (Sipariş Listesi'nde Onay bekleyen)"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium text-white hover:bg-white/[0.04] disabled:opacity-50" style={{ borderColor: CARD_BORDER }}>
                            {mesgul === p.denetim_id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Geri yükle
                          </button>
                          <button onClick={() => onGeriYukle(p, true)} disabled={mesgul !== null} data-silinen-duzenle={p.proforma_no}
                            title="Geri yükle ve revize için editörde aç"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
                            <Pencil size={12} /> Geri yükle ve düzenle
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
