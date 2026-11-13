"use client";

/**
 * Navlun Bildirimi > CANLI NAVLUN HARITASI (11.11.2026). Kontrol Merkezi'nin harita dili (components/analiz-harita.tsx):
 * ayni dunya cizimi, deniz rotalari (lib/deniz-rotasi.ts) ve etiket yerlestirme. Farki:
 *  - Her limanda nabiz atan nokta; renk = en iyi teklif hedefte / ustunde / hedef yok / fiyat yok.
 *  - Sagda liman listesi + arama. Arama ya da listede uzerine gelme: eslesmeyen limanlarin isigi soner
 *    (nokta, etiket ve rota soluklasir, nabiz durur).
 *  - Noktaya ya da listedeki limana tiklama: onSec(anahtar) -> Liman Masasi (components/navlun/liman-masasi.tsx).
 * Hesap YAPMAZ; noktalar lib/navlun/harita.ts'ten gelir.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { KARA_YOLU, SINIR_YOLU } from "@/lib/dunya-haritasi";
import { haritaKirpmasi, hatYolu, izdusum } from "@/lib/liman-koordinat";
import { denizRotasi, rotaYolu } from "@/lib/deniz-rotasi";
import { aramayaUyar, type NavlunNoktasi, type NoktaDurumu } from "@/lib/navlun/harita";
import { etiketYerlestir } from "@/components/analiz-harita";
import { CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";

/** Cikis: yalniz Ambarli ve Asyaport (Tekirdag) - ikisi de Marmara; rota Canakkale Bogazi'ndan (dugum "İstanbul"). */
const CIKIS = { ad: "Ambarlı · Asyaport", rotaDugumu: "İstanbul", enlem: 40.97, boylam: 28.69 };
const SEFTALI = "#F4A07C";
export const DURUM_RENGI: Record<NoktaDurumu, string> = { hedefte: "#10B981", ustunde: "#F59E0B", fiyatli: "#38BDF8", belirsiz: "#A78BFA", fiyatsiz: "#64748B" };
// 13.11.2026: karsilastirma lokal dahil toplamla; lokali kesin teklif yoksa "Lokal belirsiz" (asla yesil degil)
export const DURUM_ADI: Record<NoktaDurumu, string> = { hedefte: "Hedefte / altında", ustunde: "Hedefin üstünde", fiyatli: "Fiyat var (hedef yok)", belirsiz: "Lokal belirsiz", fiyatsiz: "Fiyat yok" };
const usd = (n: number) => `${n.toLocaleString("tr-TR")} $`;

export function NavlunHaritasi({ noktalar, onSec }: { noktalar: NavlunNoktasi[]; onSec: (anahtar: string) => void }) {
  const kutuRef = useRef<HTMLDivElement>(null);
  const [boyut, setBoyut] = useState({ w: 0, h: 0 });
  const [arama, setArama] = useState("");
  const [uzerinde, setUzerinde] = useState<string | null>(null);

  useEffect(() => {
    const el = kutuRef.current;
    if (!el) return;
    const olc = () => setBoyut({ w: el.clientWidth, h: el.clientHeight });
    olc();
    const ro = new ResizeObserver(olc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const konumlu = useMemo(() => noktalar.filter((n): n is NavlunNoktasi & { konum: NonNullable<NavlunNoktasi["konum"]> } => !!n.konum), [noktalar]);
  const konumsuz = noktalar.filter((n) => !n.konum);
  const rotalar = useMemo(() => konumlu.map((n) => {
    const r = denizRotasi(CIKIS.rotaDugumu, [CIKIS.enlem, CIKIS.boylam], n.konum.anahtar, n.konum.k);
    return r
      ? { anahtar: n.anahtar, d: rotaYolu(r.noktalar), noktalar: r.noktalar, temsili: false }
      : { anahtar: n.anahtar, d: hatYolu(izdusum(CIKIS.enlem, CIKIS.boylam), izdusum(n.konum.k[0], n.konum.k[1])), noktalar: [] as [number, number][], temsili: true };
  }), [konumlu]);

  const kirpma = useMemo(() => haritaKirpmasi([
    izdusum(CIKIS.enlem, CIKIS.boylam),
    ...konumlu.map((n) => izdusum(n.konum.k[0], n.konum.k[1])),
    ...rotalar.flatMap((r) => r.noktalar.map(([e, b]) => izdusum(e, b))),
  ], boyut.w > 0 && boyut.h > 0 ? boyut.w / boyut.h : 2.2, 8), [konumlu, rotalar, boyut]);
  const pikselde = (enlem: number, boylam: number) => {
    const [x, y] = izdusum(enlem, boylam);
    return { x: ((x - kirpma.x) / kirpma.g) * boyut.w, y: ((y - kirpma.y) / kirpma.y2) * boyut.h };
  };

  const aramaVar = arama.trim().length > 0;
  const uyanlar = useMemo(() => new Set(noktalar.filter((n) => aramayaUyar(n, arama)).map((n) => n.anahtar)), [noktalar, arama]);
  /** Isigi yanan liman: arama varsa uyanlar; listede / haritada uzerine gelinen varsa yalniz o */
  const yanar = (a: string) => (uzerinde ? uzerinde === a : !aramaVar || uyanlar.has(a));
  const maxAc = Math.max(1, ...konumlu.map((n) => n.acenteSayisi));
  const yaricap = (n: NavlunNoktasi) => 5 + 6 * Math.sqrt(n.acenteSayisi / maxAc);
  const ciz = konumlu.map((n) => ({ ...n, ...pikselde(n.konum.k[0], n.konum.k[1]), r: yaricap(n) }));
  const cikisP = pikselde(CIKIS.enlem, CIKIS.boylam);
  const etiketler = boyut.w > 0 ? etiketYerlestir([
    { ad: "__cikis", ...cikisP, r: 5, metin: CIKIS.ad },
    // Isigi yananlar once yerlesir (arama sonucu etiketi her zaman gorunsun)
    ...[...ciz].sort((a, b) => Number(yanar(b.anahtar)) - Number(yanar(a.anahtar))).map((n) => ({ ad: n.anahtar, x: n.x, y: n.y, r: n.r, metin: `${n.ad}${n.enIyi !== null ? ` · ${usd(n.enIyi)}` : ""}` })),
  ], boyut.w, boyut.h) : [];
  const etiket = new Map(etiketler.map((e) => [e.ad, e]));
  const listede = noktalar.filter((n) => uyanlar.has(n.anahtar));
  const ipucu = uzerinde ? ciz.find((n) => n.anahtar === uzerinde) || null : null;

  return (
    <section className="rounded-xl border overflow-hidden mb-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="navlun-haritasi">
      <div className="flex flex-col lg:flex-row">
        <div ref={kutuRef} className="relative w-full lg:flex-1 lg:min-w-0 h-[340px] sm:h-[440px] lg:h-[520px] overflow-hidden"
          style={{ background: "radial-gradient(120% 90% at 50% 40%, rgba(16,185,129,0.07), rgba(0,0,0,0) 70%)" }} onMouseLeave={() => setUzerinde(null)}>
          {boyut.w > 0 && (
            <svg className="absolute inset-0 w-full h-full" viewBox={`${kirpma.x} ${kirpma.y} ${kirpma.g} ${kirpma.y2}`} preserveAspectRatio="none" role="img" aria-label="Navlun haritası: Ambarlı ve Asyaport'tan teklif alınan limanlara deniz rotaları">
              <g stroke="rgba(255,255,255,0.035)" strokeWidth="1" vectorEffect="non-scaling-stroke">
                {Array.from({ length: 17 }, (_, i) => i * 20 + 20).map((x) => <line key={`b${x}`} x1={x} x2={x} y1={0} y2={180} vectorEffect="non-scaling-stroke" />)}
                {Array.from({ length: 8 }, (_, i) => i * 20 + 10).map((y) => <line key={`e${y}`} x1={0} x2={360} y1={y} y2={y} vectorEffect="non-scaling-stroke" />)}
              </g>
              <path d={KARA_YOLU} fill="rgba(16,185,129,0.09)" stroke="rgba(16,185,129,0.28)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
              <path d={SINIR_YOLU} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
              <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                {[...rotalar].sort((a, b) => Number(yanar(a.anahtar)) - Number(yanar(b.anahtar))).map((r) => {
                  const n = konumlu.find((x) => x.anahtar === r.anahtar)!;
                  const acik = yanar(r.anahtar);
                  return (
                    <g key={r.anahtar} opacity={acik ? 1 : 0.08} data-rota={r.anahtar}>
                      <path d={r.d} stroke={DURUM_RENGI[n.durum]} strokeOpacity={uzerinde === r.anahtar ? 0.45 : 0.18} strokeWidth={3} vectorEffect="non-scaling-stroke" />
                      <path d={r.d} stroke={DURUM_RENGI[n.durum]} strokeOpacity="0.85" strokeWidth="1.1" strokeDasharray={r.temsili ? "2 6" : "4 6"} className={acik ? "analiz-harita-akis" : undefined} vectorEffect="non-scaling-stroke" />
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          {boyut.w > 0 && (
            <>
              <span className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border-2" style={{ left: cikisP.x, top: cikisP.y, backgroundColor: "#0B0F14", borderColor: SEFTALI, boxShadow: "0 0 0 4px rgba(244,160,124,0.18)" }} aria-hidden />
              {etiket.get("__cikis") && <span className="absolute text-[10px] font-semibold whitespace-nowrap px-1.5 rounded" style={{ left: etiket.get("__cikis")!.x, top: etiket.get("__cikis")!.y, lineHeight: "18px", color: SEFTALI, backgroundColor: "rgba(11,15,20,0.75)" }}>{CIKIS.ad}</span>}
            </>
          )}

          {boyut.w > 0 && ciz.map((n) => {
            const acik = yanar(n.anahtar);
            const renk = DURUM_RENGI[n.durum];
            const e = etiket.get(n.anahtar);
            return (
              <React.Fragment key={n.anahtar}>
                <button type="button" onClick={() => onSec(n.anahtar)} onMouseEnter={() => setUzerinde(n.anahtar)} onFocus={() => setUzerinde(n.anahtar)} onBlur={() => setUzerinde(null)}
                  className="absolute rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 transition-opacity duration-300"
                  style={{ left: n.x - n.r, top: n.y - n.r, width: n.r * 2, height: n.r * 2, opacity: acik ? 1 : 0.18, backgroundColor: `${renk}40`, border: `1.5px solid ${renk}`, boxShadow: acik ? `0 0 12px ${renk}99` : "none" }}
                  aria-label={`${n.ad}${n.enIyi !== null ? `: en iyi ${usd(n.enIyi)}` : ": fiyat yok"}, ${n.acenteSayisi} acente`}
                  data-navlun-noktasi={n.anahtar} data-isik={acik ? "acik" : "sonuk"}>
                  {acik && <span className="navlun-nabiz absolute inset-0 rounded-full" style={{ border: `1.5px solid ${renk}` }} aria-hidden />}
                  {acik && n.yeni && <span className="navlun-nabiz navlun-nabiz-gec absolute inset-0 rounded-full" style={{ border: `1.5px solid ${SEFTALI}` }} aria-hidden />}
                  <span className="absolute left-1/2 top-1/2 w-1.5 h-1.5 -ml-[3px] -mt-[3px] rounded-full" style={{ backgroundColor: "#F8FAFC" }} aria-hidden />
                </button>
                {e && (
                  <button type="button" onClick={() => onSec(n.anahtar)} onMouseEnter={() => setUzerinde(n.anahtar)}
                    className="absolute text-[10px] whitespace-nowrap px-1.5 rounded transition-opacity duration-300 hover:text-white"
                    style={{ left: e.x, top: e.y, lineHeight: "18px", color: "#E2E8F0", backgroundColor: "rgba(11,15,20,0.75)", opacity: acik ? 1 : 0.12 }} data-navlun-etiket={n.anahtar} tabIndex={-1}>
                    <b className="font-semibold">{n.ad}</b>{n.enIyi !== null && <span style={{ color: renk }}> · {usd(n.enIyi)}</span>}
                  </button>
                )}
              </React.Fragment>
            );
          })}

          {/* Sol ust: baslik + gosterge */}
          <div className="absolute left-3 top-3 pointer-events-none">
            <p className="flex items-center gap-2 text-xs font-semibold text-white">
              <span className="relative inline-flex w-2 h-2"><span className="navlun-nabiz absolute inset-0 rounded-full" style={{ border: "1.5px solid #10B981" }} /><span className="w-2 h-2 rounded-full bg-emerald-400" /></span>
              Canlı Navlun Haritası
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{noktalar.length} liman · Ambarlı / Asyaport çıkışlı · rotalar yaklaşık</p>
          </div>
          {ipucu && (
            <div className="absolute left-3 top-14 z-10 rounded-lg border px-3 py-2 text-[11px] shadow-xl pointer-events-none min-w-[180px]" style={{ backgroundColor: "#1A1F2B", borderColor: "#2A3141" }} data-navlun-ipucu="">
              <p className="text-xs font-semibold text-white">{ipucu.ad}</p>
              <p style={{ color: DURUM_RENGI[ipucu.durum] }}>{ipucu.enIyi !== null ? `En iyi 20'DC ${usd(ipucu.enIyi)} · ${ipucu.enIyiAcente}` : ipucu.durum === "belirsiz" ? "Lokal belirsiz: en iyi seçilemedi" : "Fiyat yok"}</p>
              {ipucu.enIyiMetin && ipucu.enIyiMetin !== "lokal dahil" && <p style={{ color: TEXT_MUTED }}>{ipucu.enIyiMetin}</p>}
              {ipucu.hedef !== null && <p style={{ color: "#FCD34D" }}>Hedefimiz {usd(ipucu.hedef)}</p>}
              <p style={{ color: TEXT_MUTED }}>{ipucu.acenteSayisi} acente · {ipucu.teklifSayisi} teklif · tıklayın: yazışma</p>
            </div>
          )}
          <div className="absolute left-3 bottom-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] pointer-events-none" style={{ color: TEXT_MUTED }}>
            {(Object.keys(DURUM_RENGI) as NoktaDurumu[]).map((d) => (
              <span key={d} className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: DURUM_RENGI[d] }} />{DURUM_ADI[d]}</span>
            ))}
            {konumsuz.length > 0 && <span data-konumsuz="">Haritada konumu yok: {konumsuz.map((n) => n.ad).join(", ")}</span>}
          </div>
        </div>

        {/* Sag: liman listesi + arama */}
        <aside className="lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l flex flex-col max-h-[320px] lg:max-h-none lg:h-[520px]" style={{ borderColor: CARD_BORDER }} data-testid="navlun-liman-listesi">
          <div className="p-3 border-b" style={{ borderColor: CARD_BORDER }}>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
              <input value={arama} onChange={(e) => { setArama(e.target.value); setUzerinde(null); }} placeholder="Liman ara" aria-label="Liman ara" data-testid="navlun-harita-ara"
                onKeyDown={(e) => { if (e.key === "Enter" && listede.length) { e.preventDefault(); onSec(listede[0].anahtar); } if (e.key === "Escape") setArama(""); }}
                className="h-9 w-full rounded-lg border bg-transparent pl-8 pr-8 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40" style={{ borderColor: CARD_BORDER }} />
              {aramaVar && <button type="button" onClick={() => setArama("")} aria-label="Aramayı temizle" className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-white/10" style={{ color: TEXT_MUTED }}><X size={13} /></button>}
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: TEXT_MUTED }}>{aramaVar ? `${listede.length} liman bulundu · Enter: ilkini aç` : `${noktalar.length} liman · üzerine gelin ya da tıklayın`}</p>
          </div>
          <ul className="flex-1 overflow-y-auto overscroll-contain py-1">
            {listede.map((n) => (
              <li key={n.anahtar}>
                <button type="button" onClick={() => onSec(n.anahtar)} onMouseEnter={() => setUzerinde(n.anahtar)} onMouseLeave={() => setUzerinde(null)} onFocus={() => setUzerinde(n.anahtar)} onBlur={() => setUzerinde(null)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.05] transition-colors" style={{ backgroundColor: uzerinde === n.anahtar ? "rgba(255,255,255,0.05)" : undefined }} data-liste-limani={n.anahtar}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: DURUM_RENGI[n.durum], boxShadow: `0 0 6px ${DURUM_RENGI[n.durum]}` }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-white truncate">{n.ad}{n.yeni && <span className="text-[9px] font-bold px-1 rounded" style={{ backgroundColor: "rgba(244,160,124,0.18)", color: SEFTALI }}>YENİ</span>}</span>
                    <span className="block text-[10.5px] truncate" style={{ color: TEXT_MUTED }}>{n.acenteSayisi} acente{n.enIyiAcente ? ` · ${n.enIyiAcente}` : ""}</span>
                  </span>
                  <span className="text-[12px] font-semibold tabular-nums shrink-0" style={{ color: n.enIyi !== null ? DURUM_RENGI[n.durum] : TEXT_MUTED }}>{n.enIyi !== null ? usd(n.enIyi) : "—"}</span>
                </button>
              </li>
            ))}
            {!listede.length && <li className="px-3 py-6 text-center text-xs" style={{ color: TEXT_MUTED }}>Aramaya uyan liman yok</li>}
          </ul>
        </aside>
      </div>
    </section>
  );
}
