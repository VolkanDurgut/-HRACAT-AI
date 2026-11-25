"use client";

/**
 * Navlun Bildirimi > LIMAN MASASI (11.11.2026). Haritada ya da listede limana tiklayinca ONE cikan ekran:
 *  - Ust: liman navlun raporu (en iyi 20'DC, hedefimiz + fark, kabul edilen, acente / teklif sayisi, son hareket)
 *    ve fiyat merdiveni (her acentenin son 20'DC fiyati; en iyi yesil, hedef cizgisi).
 *  - Sol: limana yazan butun acenteler (son fiyat, free time / transit, son durum). Tiklayinca sohbet o acenteye suzulur.
 *  - Sag: grup sohbeti: acente mesajlari solda, bizim mesajlarimiz (hedef / kabul) sagda; mesajlar "yaziyor..."
 *    animasyonuyla sirayla gelir ("Animasyonu atla" + hareket azaltma tercihinde aninda).
 * Veri: navlun_teklifleri olaylari (maillerden okunan). Mail metninin tamami degil; yalniz okunan fiyat / durum.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Anchor, CheckCircle2, FastForward, Ship, Target, X } from "lucide-react";
import { limanSohbeti, masaAcenteleri, type SohbetMesaji } from "@/lib/navlun/harita";
import { DURUM_ETIKETI, type LimanOzeti, type NavlunSatiri } from "@/lib/navlun/ozet";
import type { KarsilastirmaBaglami } from "@/lib/navlun/karsilastirma";
import { CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";

const SEFTALI = "#F4A07C";
const usd = (n: number) => `${n.toLocaleString("tr-TR")} $`;
const RENKLER = ["#38BDF8", "#A78BFA", "#F472B6", "#FBBF24", "#34D399", "#60A5FA", "#F87171", "#2DD4BF", "#C084FC", "#FB923C"];
const renkSec = (ad: string) => RENKLER[Array.from(ad).reduce((t, c) => (t * 31 + c.charCodeAt(0)) >>> 0, 7) % RENKLER.length];
const basHarf = (ad: string) => ad.split(/[\s+\-/]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toLocaleUpperCase("tr-TR");
const gunAdi = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", weekday: "short" });
const saat = (iso: string) => new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
const kisa = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });

function RaporKutusu({ etiket, deger, alt, renk }: { etiket: string; deger: React.ReactNode; alt?: React.ReactNode; renk?: string }) {
  return (
    <div className="rounded-lg border px-3 py-2 min-w-0" style={{ borderColor: CARD_BORDER, backgroundColor: "rgba(255,255,255,0.02)" }}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: TEXT_MUTED }}>{etiket}</p>
      <p className="text-base font-semibold tabular-nums truncate" style={{ color: renk || "#FFFFFF" }}>{deger}</p>
      {alt && <p className="text-[10.5px] truncate" style={{ color: TEXT_MUTED }}>{alt}</p>}
    </div>
  );
}

export function LimanMasasi({ liman, satirlar, onKapat, baglam = null }: { liman: LimanOzeti; satirlar: NavlunSatiri[]; onKapat: () => void; baglam?: KarsilastirmaBaglami | null }) {
  const enIyi = liman.enIyi20 ? { acente: liman.enIyi20.acente, tutar: liman.enIyi20.tutar, tarih: liman.enIyi20.tarih } : null;
  const mesajlar = useMemo(() => limanSohbeti(satirlar, liman.anahtar, enIyi, baglam), [satirlar, liman.anahtar, baglam]); // eslint-disable-line react-hooks/exhaustive-deps
  const acenteler = useMemo(() => masaAcenteleri(liman, mesajlar), [liman, mesajlar]);
  const [secili, setSecili] = useState<string | null>(null);
  const gorunen = useMemo(() => mesajlar.filter((m) => !secili || m.taraf === "biz" || m.acente === secili), [mesajlar, secili]);

  // Animasyon: eski mesajlar aninda, son 10 mesaj "yaziyor..." ile sirayla
  const azHareket = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [gosterilen, setGosterilen] = useState(0);
  const [yaziyor, setYaziyor] = useState<SohbetMesaji | null>(null);
  const [atla, setAtla] = useState(false);
  useEffect(() => { setAtla(false); }, [secili]);
  useEffect(() => {
    const bas = Math.max(0, gorunen.length - 10);
    if (azHareket || atla) { setGosterilen(gorunen.length); setYaziyor(null); return; }
    setGosterilen(bas);
    let i = bas;
    let iptal = false;
    const zamanlayicilar: ReturnType<typeof setTimeout>[] = [];
    const sonraki = () => {
      if (iptal || i >= gorunen.length) { setYaziyor(null); return; }
      const m = gorunen[i];
      setYaziyor(m);
      zamanlayicilar.push(setTimeout(() => {
        if (iptal) return;
        i += 1;
        setGosterilen(i);
        setYaziyor(null);
        zamanlayicilar.push(setTimeout(sonraki, 140));
      }, m.taraf === "acente" ? 520 : 360));
    };
    zamanlayicilar.push(setTimeout(sonraki, 250));
    return () => { iptal = true; zamanlayicilar.forEach(clearTimeout); };
  }, [gorunen, atla, azHareket]);

  const akisRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = akisRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: azHareket ? "auto" : "smooth" }); }, [gosterilen, yaziyor, azHareket]);

  const kapatRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Odak bir sonraki karede: Enter ile acildiginda ayni tus Kapat dugmesine "tiklamasin"
    const odak = window.setTimeout(() => kapatRef.current?.focus(), 60);
    const tus = (e: KeyboardEvent) => { if (e.key === "Escape") onKapat(); };
    window.addEventListener("keydown", tus);
    const eski = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.clearTimeout(odak); window.removeEventListener("keydown", tus); document.body.style.overflow = eski; };
  }, [onKapat]);

  const teklifSayisi = mesajlar.filter((m) => m.tur === "teklif" || m.tur === "karsi_teklif").length;
  // 13.11.2026: karsilastirma tutari (navlun + lokal + ek); lokali belirsiz olan en iyi sayilmaz
  const fark = liman.enIyi20 && liman.hedef ? liman.enIyi20.karsi.toplam - liman.hedef.tutar : null;
  const merdiven = acenteler.filter((a) => a.toplam !== null && a.ekipman === "20DC");
  const enYuksek = Math.max(1, ...merdiven.map((a) => a.toplam as number), liman.hedef?.tutar ?? 0);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4" style={{ backgroundColor: "rgba(5,8,12,0.72)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onKapat(); }} role="dialog" aria-modal="true" aria-label={`${liman.ad} liman masası`} data-testid="liman-masasi">
      <div className="navlun-masa w-full max-w-[1180px] h-[92vh] rounded-2xl border flex flex-col overflow-y-auto md:overflow-hidden shadow-2xl" style={{ backgroundColor: "#0E121A", borderColor: "#263041" }}>
        {/* Baslik */}
        <div className="px-4 sm:px-5 py-3 border-b flex items-center gap-3" style={{ borderColor: CARD_BORDER, background: "linear-gradient(90deg, rgba(16,185,129,0.10), rgba(244,160,124,0.06) 60%, transparent)" }}>
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(16,185,129,0.15)", color: "#6EE7B7" }}><Anchor size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-white font-semibold text-lg leading-tight truncate">{liman.ad}</h2>
            <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Ambarlı / Asyaport → {liman.ad} · {acenteler.length} acente · {mesajlar.length} mesaj · son hareket {kisa(liman.sonTarih)}</p>
          </div>
          <button ref={kapatRef} type="button" onClick={onKapat} aria-label="Kapat" className="p-2 rounded-lg hover:bg-white/10" style={{ color: TEXT_MUTED }} data-testid="masa-kapat"><X size={18} /></button>
        </div>

        {/* Navlun raporu */}
        <div className="px-4 sm:px-5 py-3 border-b grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" style={{ borderColor: CARD_BORDER }} data-testid="masa-rapor">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <RaporKutusu etiket="En iyi 20'DC (lokal dahil)" deger={liman.enIyi20 ? usd(liman.enIyi20.karsi.toplam) : liman.dolan20 ? usd(liman.dolan20.karsi.toplam) : "—"} renk={liman.enIyi20 || !liman.dolan20 ? "#6EE7B7" : "#94A3B8"}
              alt={liman.enIyi20 ? `${liman.enIyi20.acente} · ${liman.enIyi20.karsi.metin}` : liman.belirsiz20 ? <span style={{ color: "#FCD34D" }}>⚠ {liman.belirsiz20.acente}: {liman.belirsiz20.karsi.metin}</span>
                : liman.dolan20 ? `${liman.dolan20.acente} · süresi doldu${liman.dolan20.gecerlilikBitis ? ` ${kisa(liman.dolan20.gecerlilikBitis)}` : ""}` : "teklif yok"} />
            <RaporKutusu etiket="Hedefimiz" deger={liman.hedef ? usd(liman.hedef.tutar) : "—"} renk="#FCD34D"
              alt={fark === null ? (liman.hedef ? kisa(liman.hedef.tarih) : "hedef yazılmadı") : fark <= 0 ? <span style={{ color: "#6EE7B7" }}>en iyi teklif hedefte</span> : <span style={{ color: "#FCD34D" }}>en iyi +{usd(fark)} üstünde</span>} />
            <RaporKutusu etiket="Kabul edilen" deger={liman.kabul ? usd(liman.kabul.tutar) : "—"} alt={liman.kabul ? `${liman.kabul.armator || ""} ${kisa(liman.kabul.tarih)}`.trim() : "henüz yok"} renk="#93C5FD" />
            <RaporKutusu etiket="Teklif" deger={teklifSayisi} alt={`${acenteler.filter((a) => a.sonFiyat !== null).length} acenteden fiyat`} />
          </div>
          <div className="min-w-0" data-testid="masa-merdiven">
            <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: TEXT_MUTED }}>Fiyat merdiveni · son 20&apos;DC teklifleri</p>
            <div className="relative space-y-1">
              {merdiven.slice(0, 5).map((a) => (
                <button key={a.acente} type="button" onClick={() => setSecili(secili === a.acente ? null : a.acente)} className="w-full flex items-center gap-2 text-[11px] group" title={`${a.acente}: ${a.metin || ""}${a.kesin ? "" : " (en iyi sayılmaz)"}`}>
                  <span className="w-24 truncate text-left group-hover:text-white" style={{ color: secili === a.acente ? "#FFFFFF" : "#C9D1DC" }}>{a.acente}</span>
                  <span className="flex-1 h-3.5 rounded relative" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                    <span className="absolute inset-y-0 left-0 rounded transition-all duration-700" style={{ width: `${((a.toplam as number) / enYuksek) * 100}%`, backgroundColor: a.enIyi ? "rgba(16,185,129,0.55)" : a.kesin ? "rgba(56,189,248,0.35)" : "rgba(251,191,36,0.28)" }} />
                    {liman.hedef && <span className="absolute inset-y-[-2px] w-0.5" style={{ left: `${(liman.hedef.tutar / enYuksek) * 100}%`, backgroundColor: "#FCD34D" }} title="Hedefimiz" />}
                  </span>
                  <span className="w-20 text-right tabular-nums font-semibold" style={{ color: a.enIyi ? "#6EE7B7" : a.kesin ? "#E2E8F0" : "#FCD34D" }}>{a.kesin ? "" : "⚠ "}{usd(a.toplam as number)}</span>
                </button>
              ))}
              {!merdiven.length && <p className="text-[11px]" style={{ color: TEXT_MUTED }}>20&apos;DC fiyat yok.</p>}
              {merdiven.length > 5 && <p className="text-[10px]" style={{ color: TEXT_MUTED }}>+{merdiven.length - 5} acente daha (soldaki listede)</p>}
            </div>
          </div>
        </div>

        {/* Govde: acenteler + sohbet */}
        <div className="md:flex-1 md:min-h-0 grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-b md:border-b-0 md:border-r overflow-y-auto max-h-[30vh] md:max-h-none" style={{ borderColor: CARD_BORDER }} data-testid="masa-acenteler">
            <button type="button" onClick={() => setSecili(null)} className="w-full px-4 py-2.5 text-left text-xs font-semibold border-b hover:bg-white/[0.04]"
              style={{ borderColor: CARD_BORDER, color: secili ? TEXT_MUTED : "#FFFFFF", backgroundColor: secili ? undefined : "rgba(16,185,129,0.08)" }}>
              Tüm acenteler · {mesajlar.length} mesaj
            </button>
            {acenteler.map((a) => (
              <button key={a.acente} type="button" onClick={() => setSecili(secili === a.acente ? null : a.acente)} data-masa-acente={a.acente}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left border-b hover:bg-white/[0.04] transition-colors"
                style={{ borderColor: CARD_BORDER, backgroundColor: secili === a.acente ? "rgba(255,255,255,0.06)" : undefined }}>
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ backgroundColor: `${renkSec(a.acente)}26`, color: renkSec(a.acente) }}>{basHarf(a.acente)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[13px] text-white truncate">{a.acente}{a.enIyi && <span className="text-[9px] font-bold px-1 rounded" style={{ backgroundColor: "rgba(16,185,129,0.18)", color: "#6EE7B7" }}>EN İYİ</span>}</span>
                  <span className="block text-[10.5px] truncate" style={{ color: TEXT_MUTED }}>
                    {a.sonFiyat !== null ? `${a.metin && a.metin !== "lokal dahil" ? a.metin : usd(a.sonFiyat)}${a.ekipman && a.ekipman !== "20DC" ? ` ${a.ekipman}` : ""}${a.kesin ? "" : " ⚠"}` : a.sonDurum ? DURUM_ETIKETI[a.sonDurum] || a.sonDurum : "—"}
                    {a.freeTime != null ? ` · FT ${a.freeTime}g` : ""}{a.transit ? ` · TT ${a.transit}g` : ""}
                  </span>
                </span>
                <span className="text-[10px] shrink-0" style={{ color: TEXT_MUTED }}>{a.mesaj}</span>
              </button>
            ))}
          </aside>

          <div className="flex flex-col min-h-[70vh] md:min-h-0">
            <div className="px-4 py-2 border-b flex items-center gap-2 text-xs" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              <Ship size={14} /> <span className="truncate">{secili ? `${secili} ile yazışma` : "Tüm acentelerle yazışma"} · {gorunen.length} mesaj</span>
              {gosterilen < gorunen.length && !azHareket && (
                <button type="button" onClick={() => setAtla(true)} className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md border hover:bg-white/5" style={{ borderColor: CARD_BORDER }} data-testid="masa-atla">
                  <FastForward size={12} /> Animasyonu atla
                </button>
              )}
            </div>
            <div ref={akisRef} className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-2" style={{ background: "radial-gradient(100% 60% at 50% 0%, rgba(16,185,129,0.04), transparent 70%)" }} data-testid="masa-sohbet">
              {gorunen.slice(0, gosterilen).map((m, i, l) => {
                const yeniGun = i === 0 || l[i - 1].tarih.slice(0, 10) !== m.tarih.slice(0, 10);
                return (
                  <React.Fragment key={m.id}>
                    {yeniGun && <div className="text-center my-2"><span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: TEXT_MUTED }}>{gunAdi(m.tarih)}</span></div>}
                    <Balon m={m} />
                  </React.Fragment>
                );
              })}
              {yaziyor && (
                <div className={`flex ${yaziyor.taraf === "biz" ? "justify-end" : "justify-start"} items-end gap-2`} data-testid="masa-yaziyor">
                  {yaziyor.taraf === "acente" && yaziyor.acente && <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ backgroundColor: `${renkSec(yaziyor.acente)}26`, color: renkSec(yaziyor.acente) }}>{basHarf(yaziyor.acente)}</span>}
                  <span className="navlun-yaziyor inline-flex gap-1 px-3 py-2.5 rounded-2xl" style={{ backgroundColor: yaziyor.taraf === "biz" ? "rgba(244,160,124,0.16)" : "#1A2130" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" /><span className="w-1.5 h-1.5 rounded-full bg-slate-300" /><span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                  </span>
                </div>
              )}
              {!gorunen.length && <p className="text-center text-xs py-10" style={{ color: TEXT_MUTED }}>Bu limanda yazışma yok.</p>}
            </div>
            <p className="px-4 py-2 border-t text-[10px]" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED, backgroundColor: CARD_BG }}>
              Yazışma, operasyonun acentelerle maillerinden otomatik okunan fiyat ve durumlardır (mail metninin tamamı değil). Sağdakiler bizim mesajlarımız (hedef / kabul).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Balon({ m }: { m: SohbetMesaji }) {
  const biz = m.taraf === "biz";
  const renk = m.acente ? renkSec(m.acente) : SEFTALI;
  return (
    <div className={`navlun-balon flex ${biz ? "justify-end" : "justify-start"} items-end gap-2`} data-balon={m.taraf} data-tur={m.tur}>
      {!biz && <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ backgroundColor: `${renk}26`, color: renk }} title={m.acente || ""}>{basHarf(m.acente || "?")}</span>}
      <div className={`max-w-[78%] sm:max-w-[62%] rounded-2xl px-3 py-2 ${biz ? "rounded-br-md" : "rounded-bl-md"}`}
        style={{ backgroundColor: biz ? "rgba(244,160,124,0.16)" : "#1A2130", border: `1px solid ${m.enIyi ? "rgba(16,185,129,0.6)" : biz ? "rgba(244,160,124,0.3)" : "#263041"}`, boxShadow: m.enIyi ? "0 0 0 3px rgba(16,185,129,0.12)" : undefined }}>
        <p className="text-[10.5px] font-semibold flex items-center gap-1.5" style={{ color: biz ? SEFTALI : renk }}>
          {biz ? <><Target size={11} /> UNEX · Operasyon</> : m.acente}
          {m.enIyi && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1 rounded" style={{ backgroundColor: "rgba(16,185,129,0.18)", color: "#6EE7B7" }}><CheckCircle2 size={9} /> EN İYİ</span>}
        </p>
        <p className="text-[13px] text-white leading-snug">{m.metin}</p>
        {m.tutar && <p className="text-lg font-semibold tabular-nums leading-tight" style={{ color: biz ? "#FDE68A" : m.enIyi ? "#6EE7B7" : "#FFFFFF" }}>{m.tutar}</p>}
        {m.ayrinti.length > 0 && <p className="text-[10.5px] mt-0.5" style={{ color: TEXT_MUTED }}>{m.ayrinti.join(" · ")}</p>}
        <p className="text-[9.5px] text-right mt-0.5" style={{ color: "#64748B" }}>{saat(m.tarih)}</p>
      </div>
    </div>
  );
}
