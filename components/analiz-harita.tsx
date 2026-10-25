"use client";

/**
 * Analiz > Sevkiyat Haritasi (26.10.2026, kullanicinin ornek panelindeki harita fikri).
 * Turkiye cikis limani -> varis limani DENIZ YOLU rotalari (lib/deniz-rotasi.ts: bogazlar /
 * kanallar uzerinden en kisa yol, yaklasik; aga bagli olmayan liman icin temsili egri), varis limaninda konteynere gore
 * buyuyen daire, uzerine gelince / odaklaninca ayrinti karti. Harita SVG'si onceden
 * uretilmis yol verisidir (lib/dunya-haritasi.ts), yeni paket yok. Hesap YAPMAZ.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { KARA_YOLU, SINIR_YOLU } from "@/lib/dunya-haritasi";
import { haritaKirpmasi, hatYolu, izdusum, limanKoordinati, type CikisMerkezi } from "@/lib/liman-koordinat";
import { denizRotasi, rotaYolu } from "@/lib/deniz-rotasi";
import { ACCENT, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { Panel } from "@/components/analiz-paneli";

export type HaritaLimani = { ad: string; konteyner: number; dosya: number; satirlar: string[] };
export type HaritaHatti = { cikis: CikisMerkezi; liman: string; konteyner: number };

const MARKA_TURUNCU = "#F4A07C";

type Etiket = { ad: string; x: number; y: number; yon: "sag" | "sol" | "ust" | "alt" };

/** Etiketleri cakismayacak sekilde yerlestirir (buyukten kucuge); sigmayan etiket gizlenir. */
function etiketYerlestir(noktalar: { ad: string; x: number; y: number; r: number; metin: string }[], w: number, h: number): Etiket[] {
  const kutular: { x0: number; y0: number; x1: number; y1: number }[] = noktalar.map((n) => ({ x0: n.x - n.r, y0: n.y - n.r, x1: n.x + n.r, y1: n.y + n.r }));
  const sonuc: Etiket[] = [];
  for (const n of noktalar) {
    const gen = n.metin.length * 6.4 + 10, yuk = 18;
    const adaylar: [Etiket["yon"], number, number][] = [
      ["sag", n.x + n.r + 4, n.y - yuk / 2],
      ["sol", n.x - n.r - 4 - gen, n.y - yuk / 2],
      ["ust", n.x - gen / 2, n.y - n.r - 4 - yuk],
      ["alt", n.x - gen / 2, n.y + n.r + 4],
    ];
    for (const [yon, x0, y0] of adaylar) {
      const k = { x0, y0, x1: x0 + gen, y1: y0 + yuk };
      if (k.x0 < 2 || k.y0 < 2 || k.x1 > w - 2 || k.y1 > h - 2) continue;
      if (kutular.some((b) => !(k.x1 < b.x0 || k.x0 > b.x1 || k.y1 < b.y0 || k.y0 > b.y1))) continue;
      kutular.push(k);
      sonuc.push({ ad: n.ad, x: x0, y: y0, yon });
      break;
    }
  }
  return sonuc;
}

export function SevkiyatHaritasi({ limanlar, hatlar, className = "" }: { limanlar: HaritaLimani[]; hatlar: HaritaHatti[]; className?: string }) {
  const kutuRef = useRef<HTMLDivElement>(null);
  const [boyut, setBoyut] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [secili, setSecili] = useState<string | null>(null);

  useEffect(() => {
    const el = kutuRef.current;
    if (!el) return;
    const olc = () => setBoyut({ w: el.clientWidth, h: el.clientHeight });
    olc();
    const ro = new ResizeObserver(olc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cizilenler = useMemo(
    () => limanlar
      .map((l) => ({ ...l, k: limanKoordinati(l.ad) }))
      .filter((l): l is HaritaLimani & { k: [number, number] } => l.k !== null && l.konteyner >= 0)
      .sort((a, b) => b.konteyner - a.konteyner),
    [limanlar]
  );
  const haritadaYok = limanlar.filter((l) => !limanKoordinati(l.ad)).map((l) => l.ad);
  const cikislar = useMemo(() => {
    const m = new Map<string, CikisMerkezi>();
    hatlar.forEach((h) => m.set(h.cikis.ad, h.cikis));
    return Array.from(m.values());
  }, [hatlar]);

  // Her hat icin deniz rotasi (yoksa temsili egri); liman basina en kisa rota ipucunda gosterilir.
  const rotalar = useMemo(() => hatlar.map((h) => {
    const k = limanKoordinati(h.liman);
    if (!k) return null;
    const r = denizRotasi(h.cikis.ad, [h.cikis.enlem, h.cikis.boylam], h.liman, k);
    return r
      ? { hat: h, d: rotaYolu(r.noktalar), nm: r.nm, gecisler: r.gecisler, noktalar: r.noktalar, temsili: false }
      : { hat: h, d: hatYolu(izdusum(h.cikis.enlem, h.cikis.boylam), izdusum(k[0], k[1])), nm: null, gecisler: [] as string[], noktalar: [] as [number, number][], temsili: true };
  }).filter((x): x is NonNullable<typeof x> => x !== null), [hatlar]);
  const limanRotasi = useMemo(() => {
    const m = new Map<string, (typeof rotalar)[number]>();
    rotalar.forEach((r) => { const o = m.get(r.hat.liman); if (!o || r.hat.konteyner > o.hat.konteyner) m.set(r.hat.liman, r); });
    return m;
  }, [rotalar]);
  const temsiliVar = rotalar.some((r) => r.temsili);

  const kirpma = useMemo(() => {
    const noktalar = [
      ...cizilenler.map((l) => izdusum(l.k[0], l.k[1])),
      ...cikislar.map((c) => izdusum(c.enlem, c.boylam)),
      // rotanin uzandigi yerler de gorunsun (Atlantik, Umit Burnu…)
      ...rotalar.flatMap((r) => r.noktalar.map(([e, b]) => izdusum(e, b))),
    ];
    return haritaKirpmasi(noktalar, boyut.w > 0 && boyut.h > 0 ? boyut.w / boyut.h : 2.2);
  }, [cizilenler, cikislar, rotalar, boyut]);

  const pikselde = (enlem: number, boylam: number) => {
    const [x, y] = izdusum(enlem, boylam);
    return { x: ((x - kirpma.x) / kirpma.g) * boyut.w, y: ((y - kirpma.y) / kirpma.y2) * boyut.h };
  };

  const maxK = Math.max(1, ...cizilenler.map((l) => l.konteyner));
  const yaricap = (k: number) => 5 + 13 * Math.sqrt(Math.max(0, k) / maxK);
  const noktalar = cizilenler.map((l) => {
    const p = pikselde(l.k[0], l.k[1]);
    return { ...l, x: p.x, y: p.y, r: yaricap(l.konteyner) };
  });
  const etiketler = boyut.w > 0
    ? etiketYerlestir(
        [
          ...cikislar.map((c) => ({ ad: `__cikis_${c.ad}`, ...pikselde(c.enlem, c.boylam), r: 5, metin: c.ad })),
          ...noktalar.map((n) => ({ ad: n.ad, x: n.x, y: n.y, r: n.r, metin: `${n.ad} · ${n.konteyner}` })),
        ],
        boyut.w,
        boyut.h
      )
    : [];
  const etiketHaritasi = new Map(etiketler.map((e) => [e.ad, e]));
  const toplamK = cizilenler.reduce((t, l) => t + l.konteyner, 0);
  const seciliNokta = noktalar.find((n) => n.ad === secili) || null;
  const maxHat = Math.max(1, ...hatlar.map((h) => h.konteyner));

  return (
    <Panel
      baslik="Sevkiyat Haritası"
      ikon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg>}
      sag={`${cizilenler.length} liman · ${toplamK.toLocaleString("tr-TR")} konteyner`}
      className={className}
      govdeSinifi="flex flex-col"
      data-sevkiyat-haritasi=""
    >
      <div ref={kutuRef} className="relative flex-1 min-h-[240px] sm:min-h-[320px] overflow-hidden" style={{ background: "radial-gradient(120% 90% at 50% 40%, rgba(16,185,129,0.06), rgba(0,0,0,0) 70%)" }} onMouseLeave={() => setSecili(null)}>
        {boyut.w > 0 && (
          <svg className="absolute inset-0 w-full h-full" viewBox={`${kirpma.x} ${kirpma.y} ${kirpma.g} ${kirpma.y2}`} preserveAspectRatio="none" role="img" aria-label="Sevkiyat haritası: çıkış limanından varış limanlarına temsili hatlar">
            {/* enlem / boylam cizgileri (20 derece) */}
            <g stroke="rgba(255,255,255,0.035)" strokeWidth="1" vectorEffect="non-scaling-stroke">
              {Array.from({ length: 17 }, (_, i) => i * 20 + 20).map((x) => <line key={`b${x}`} x1={x} x2={x} y1={0} y2={180} vectorEffect="non-scaling-stroke" />)}
              {Array.from({ length: 8 }, (_, i) => i * 20 + 10).map((y) => <line key={`e${y}`} x1={0} x2={360} y1={y} y2={y} vectorEffect="non-scaling-stroke" />)}
            </g>
            <path d={KARA_YOLU} fill="rgba(16,185,129,0.09)" stroke="rgba(16,185,129,0.28)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
            <path d={SINIR_YOLU} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
            <g className="analiz-harita-hatlar" fill="none" strokeLinecap="round">
              {/* Secili rota en ustte cizilsin: secili olmayanlar once */}
              {[...rotalar].sort((a, b) => Number(a.hat.liman === secili) - Number(b.hat.liman === secili)).map((r) => {
                const h = r.hat;
                const vurgu = secili === null || secili === h.liman;
                return (
                  <g key={`${h.cikis.ad}-${h.liman}`} opacity={vurgu ? 1 : 0.15} data-hat={h.liman} data-rota={r.temsili ? "temsili" : "deniz"}>
                    <path d={r.d} stroke={ACCENT} strokeOpacity={secili === h.liman ? 0.4 : 0.22} strokeWidth={2 + 4 * Math.sqrt(h.konteyner / maxHat)} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    <path d={r.d} stroke="#6EE7B7" strokeOpacity="0.9" strokeWidth="1.2" strokeDasharray={r.temsili ? "2 6" : "4 6"} strokeLinejoin="round" className="analiz-harita-akis" vectorEffect="non-scaling-stroke" />
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {/* Cikis limanlari */}
        {boyut.w > 0 && cikislar.map((c) => {
          const p = pikselde(c.enlem, c.boylam);
          const e = etiketHaritasi.get(`__cikis_${c.ad}`);
          return (
            <React.Fragment key={c.ad}>
              <span className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border-2" style={{ left: p.x, top: p.y, backgroundColor: "#0B0F14", borderColor: MARKA_TURUNCU, boxShadow: `0 0 0 4px rgba(244,160,124,0.18)` }} aria-hidden />
              {e && <span className="absolute text-[10px] font-semibold whitespace-nowrap px-1.5 rounded" style={{ left: e.x, top: e.y, lineHeight: "18px", color: MARKA_TURUNCU, backgroundColor: "rgba(11,15,20,0.75)" }} data-cikis={c.ad}>{c.ad}</span>}
            </React.Fragment>
          );
        })}

        {/* Varis limanlari */}
        {boyut.w > 0 && noktalar.map((n) => {
          const e = etiketHaritasi.get(n.ad);
          const aktif = secili === n.ad;
          return (
            <React.Fragment key={n.ad}>
              <button
                type="button"
                className="absolute rounded-full transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                style={{ left: n.x - n.r, top: n.y - n.r, width: n.r * 2, height: n.r * 2, backgroundColor: aktif ? "rgba(16,185,129,0.45)" : "rgba(16,185,129,0.22)", border: `1.5px solid ${ACCENT}`, boxShadow: aktif ? "0 0 0 6px rgba(16,185,129,0.15)" : "0 0 10px rgba(16,185,129,0.35)" }}
                onMouseEnter={() => setSecili(n.ad)}
                onFocus={() => setSecili(n.ad)}
                onBlur={() => setSecili(null)}
                aria-label={`${n.ad}: ${n.konteyner} konteyner, ${n.dosya} dosya`}
                data-liman-noktasi={n.ad}
              >
                <span className="absolute left-1/2 top-1/2 w-1.5 h-1.5 -ml-[3px] -mt-[3px] rounded-full" style={{ backgroundColor: "#D1FAE5" }} />
              </button>
              {e && (
                <span className="absolute text-[10px] whitespace-nowrap px-1.5 rounded pointer-events-none" style={{ left: e.x, top: e.y, lineHeight: "18px", color: "#E2E8F0", backgroundColor: "rgba(11,15,20,0.72)", opacity: secili && !aktif ? 0.35 : 1 }} data-etiket={n.ad}>
                  <b className="font-semibold">{n.ad}</b> <span style={{ color: TEXT_MUTED }}>· {n.konteyner}</span>
                </span>
              )}
            </React.Fragment>
          );
        })}

        {/* Ayrinti karti */}
        {seciliNokta && (
          <div
            className="absolute z-10 rounded-lg border px-3 py-2 text-[11px] shadow-xl pointer-events-none min-w-[170px] max-w-[260px]"
            style={{
              backgroundColor: "#1A1F2B",
              borderColor: "#2A3141",
              // Sol ust koseye sabit: secilen rotanin ve limanin USTUNU kapatmasin
              left: 12,
              top: 12,
            }}
            data-harita-ipucu=""
          >
            <p className="text-xs font-semibold text-white">{seciliNokta.ad}</p>
            <p className="text-white mt-0.5"><b>{seciliNokta.konteyner.toLocaleString("tr-TR")}</b> konteyner · {seciliNokta.dosya} dosya</p>
            <div className="w-full h-1 rounded-full mt-1.5 mb-1" style={{ backgroundColor: CARD_BORDER }}>
              <div className="h-1 rounded-full" style={{ width: `${toplamK > 0 ? (seciliNokta.konteyner / toplamK) * 100 : 0}%`, backgroundColor: ACCENT }} />
            </div>
            {seciliNokta.satirlar.map((s) => <p key={s} style={{ color: TEXT_MUTED }}>{s}</p>)}
            {(() => {
              const r = limanRotasi.get(seciliNokta.ad);
              if (!r) return null;
              return r.temsili ? (
                <p className="mt-1 pt-1 border-t" style={{ color: TEXT_MUTED, borderColor: "#2A3141" }}>Deniz rotası tanımlı değil (temsili hat)</p>
              ) : (
                <div className="mt-1 pt-1 border-t" style={{ borderColor: "#2A3141" }} data-ipucu-rota="">
                  <p className="text-white">{r.hat.cikis.ad} → {seciliNokta.ad}: <b>≈ {(Math.round((r.nm ?? 0) / 10) * 10).toLocaleString("tr-TR")} deniz mili</b></p>
                  {r.gecisler.length > 0 && <p className="whitespace-normal max-w-[240px]" style={{ color: TEXT_MUTED }}>{r.gecisler.join(" → ")}</p>}
                </div>
              );
            })()}
          </div>
        )}

        {cizilenler.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: TEXT_MUTED }}>Haritada gösterilecek liman yok</p>
        )}
      </div>
      <div className="px-4 py-2 border-t text-[10px] flex flex-wrap gap-x-4 gap-y-1" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: MARKA_TURUNCU }} /> Çıkış limanı</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "rgba(16,185,129,0.35)", border: `1px solid ${ACCENT}` }} /> Varış limanı · büyüklük = konteyner</span>
        <span>Rotalar ana deniz yolları ve boğazlar üzerinden yaklaşık hesaplanır; aktarma limanı ve armatörün güncel rota tercihi farklı olabilir</span>
        {temsiliVar && <span>Kesik ince çizgi: deniz rotası tanımlı olmayan liman (temsili)</span>}
        {haritadaYok.length > 0 && <span data-haritada-yok="">Haritada konumu olmayan: {haritadaYok.join(", ")}</span>}
      </div>
    </Panel>
  );
}
