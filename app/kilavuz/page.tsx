"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink, Loader2, RotateCcw, X, Compass, Lock, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils";
import { ArkaPlanGorseli } from "@/components/arka-plan-gorseli";
import { YaziAnimasyonu } from "@/components/yazi-animasyonu";
import { YildizAlani } from "@/components/kilavuz/yildiz-alani";
import { EkranSahnesi } from "@/components/kilavuz/ekran-sahnesi";
import { KILAVUZ_KONULARI, type KilavuzKonusu } from "@/lib/kilavuz/konular";
import { EKRAN_NOKTALARI } from "@/lib/kilavuz/ekran-noktalari";
import { PAGE_BG, TEXT_MUTED } from "@/lib/theme";

/**
 * UNEX GIDA · IHRACAT AI KULLANIM KILAVUZU (28.10.2026).
 * Kullanici: "kamera hareketi ile farkli bir evrene gecer gibi; ayni gecisler tum sayfalarin
 * arasinda; evrenden evrene, logo temali; konulu olmali."
 *
 * - Her bolum bir "evren" (lib/kilavuz/konular.ts). Bolumler arasi gecis: sahne kameraya
 *   dogru buyuyup kaybolur (ileri) / uzaklasir (geri), Unex logosu ortada belirir ve portal
 *   olur, yildizlar isik cizgisine doner, yeni evren logonun icinden dairesel acilarak gelir.
 * - Bolum icindeki adimlarda kamera ekran goruntusunde isaret noktasina yaklasir.
 * - Klavye: sol/sag ok; telefonda saga/sola kaydirma. Konum `?k=<bolum>` ve localStorage
 *   (`kilavuz-konum`, sadece "kaldiginiz yerden devam" icin; okunamazsa yok sayilir).
 * - "Hareketi azalt" acikken portal / kamera / yildiz hareketi yok, sade gecis.
 * - Oturum gerekir; sayfa yetkisi gerekmez (AppShell kullanmaz, Kantar Paneli gibi kendi kapisi).
 *   Ekran goruntuleri KURGUSAL veriyle cekildi (public/kilavuz).
 */

const N = KILAVUZ_KONULARI.length;
const KAPAK = -1;
const SON = N;
const KAPAK_RENK: [string, string] = ["#10B981", "#F4A07C"];
const CIKIS_MS = 620;
const GIRIS_MS = 860;
const KONUM_ANAHTARI = "kilavuz-konum";

type Gecis = { faz: "cikis" | "giris"; yon: 1 | -1 } | null;

function iki(n: number) { return String(n).padStart(2, "0"); }

export default function KilavuzSayfasi() {
  const { user, loading, yetkiler } = useAuth();
  const router = useRouter();

  const [sahne, setSahne] = useState<number>(KAPAK);
  const [adim, setAdim] = useState(0);
  const [gecis, setGecis] = useState<Gecis>(null);
  const [azalt, setAzalt] = useState(false);
  const [kayitli, setKayitli] = useState<number | null>(null);
  const warpRef = useRef(0);
  const zamanlayicilar = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dokunma = useRef<{ x: number; y: number } | null>(null);
  const hazir = useRef(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  // Ilk acilis: ?k= ve hareket ayari (bulaniklik filtresi bilerek yok: buyuk katmanda yavas)
  useEffect(() => {
    try { setAzalt(window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch { /* eski tarayici */ }
    const k = new URLSearchParams(window.location.search).get("k");
    const i = k === "son" ? SON : KILAVUZ_KONULARI.findIndex((x) => x.id === k);
    if (i >= 0) setSahne(i);
    try {
      const s = window.localStorage.getItem(KONUM_ANAHTARI);
      const j = KILAVUZ_KONULARI.findIndex((x) => x.id === s);
      if (j > 0) setKayitli(j);
    } catch { /* depolama kapali */ }
    hazir.current = true;
    const z = zamanlayicilar.current;
    return () => { z.forEach(clearTimeout); };
  }, []);

  // Adres ve "kaldiginiz yer"
  useEffect(() => {
    if (!hazir.current) return;
    const url = new URL(window.location.href);
    if (sahne === KAPAK) url.searchParams.delete("k");
    else url.searchParams.set("k", sahne === SON ? "son" : KILAVUZ_KONULARI[sahne].id);
    window.history.replaceState(null, "", url.toString());
    if (sahne >= 0 && sahne < N) {
      try { window.localStorage.setItem(KONUM_ANAHTARI, KILAVUZ_KONULARI[sahne].id); } catch { /* depolama kapali */ }
    }
  }, [sahne]);

  // Komsu evrenlerin goruntulerini onceden indir (gecis aninda bos cerceve olmasin)
  useEffect(() => {
    [sahne - 1, sahne + 1, sahne === KAPAK ? 0 : -9].forEach((i) => {
      const e = KILAVUZ_KONULARI[i]?.ekran;
      if (e) { const im = new Image(); im.src = `/kilavuz/${e}.webp`; }
    });
  }, [sahne]);

  const evreneGit = useCallback((hedef: number, hedefAdim: number | "son" = 0) => {
    if (gecis) return;
    hedef = Math.max(KAPAK, Math.min(SON, hedef));
    const adimBul = () => {
      const k = KILAVUZ_KONULARI[hedef];
      return hedefAdim === "son" ? Math.max(0, (k?.adimlar.length ?? 1) - 1) : hedefAdim;
    };
    if (hedef === sahne) { setAdim(adimBul()); return; }
    const yon: 1 | -1 = hedef > sahne ? 1 : -1;
    if (azalt) { setSahne(hedef); setAdim(adimBul()); return; }
    setGecis({ faz: "cikis", yon });
    warpRef.current = 1;
    zamanlayicilar.current.push(setTimeout(() => {
      setSahne(hedef); setAdim(adimBul());
      setGecis({ faz: "giris", yon });
      warpRef.current = 0.35;
      zamanlayicilar.current.push(setTimeout(() => { setGecis(null); warpRef.current = 0; }, GIRIS_MS));
    }, CIKIS_MS));
  }, [gecis, sahne, azalt]);

  const konu: KilavuzKonusu | undefined = KILAVUZ_KONULARI[sahne];
  const ileri = useCallback(() => {
    if (konu && adim < konu.adimlar.length - 1) setAdim(adim + 1);
    else if (sahne < SON) evreneGit(sahne + 1);
  }, [konu, adim, sahne, evreneGit]);
  const geri = useCallback(() => {
    if (konu && adim > 0) setAdim(adim - 1);
    else if (sahne > KAPAK) evreneGit(sahne - 1, "son");
  }, [konu, adim, sahne, evreneGit]);

  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      const h = e.target as HTMLElement | null;
      if (h && (h.tagName === "INPUT" || h.tagName === "TEXTAREA" || h.isContentEditable)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); ileri(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); geri(); }
      else if (e.key === "Home") { e.preventDefault(); evreneGit(KAPAK); }
    };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [ileri, geri, evreneGit]);

  const renk = konu?.renk ?? KAPAK_RENK;
  const cikisHedefi = useMemo(() => ilkErisilebilirSayfa(yetkiler.sayfa_yetkileri) || "/panel", [yetkiler]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: PAGE_BG }}>
        <Loader2 size={32} className="animate-spin text-emerald-500" />
      </div>
    );
  }

  const sahneSinifi = gecis
    ? gecis.faz === "cikis" ? (gecis.yon > 0 ? "klv-cikis-ileri" : "klv-cikis-geri") : (gecis.yon > 0 ? "klv-giris-ileri" : "klv-giris-geri")
    : azalt ? "klv-solma" : "";

  // Toplam ilerleme (cubuk): kapak 0, son 1
  const ilerleme = sahne === KAPAK ? 0 : sahne === SON ? 1 : (sahne + (adim + 1) / (konu?.adimlar.length || 1)) / N;

  return (
    <div className="klv-kok fixed inset-0 overflow-hidden isolate text-white" style={{ backgroundColor: PAGE_BG, ["--klv-a" as string]: renk[0], ["--klv-b" as string]: renk[1] }}
      onTouchStart={(e) => { const t = e.touches[0]; dokunma.current = { x: t.clientX, y: t.clientY }; }}
      onTouchEnd={(e) => {
        const b = dokunma.current; dokunma.current = null; if (!b) return;
        const t = e.changedTouches[0]; const dx = t.clientX - b.x, dy = t.clientY - b.y;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) { if (dx < 0) ileri(); else geri(); }
      }}>
      <style>{STIL}</style>
      <ArkaPlanGorseli tur="uygulama" />
      <div className="klv-nebula absolute inset-0 -z-10 pointer-events-none" aria-hidden />
      <div className="absolute inset-0 -z-10"><YildizAlani renk={renk[0]} warpRef={warpRef} /></div>

      {/* Ust cubuk */}
      <header className="relative z-20 flex items-center gap-3 px-4 md:px-6 h-16">
        <button type="button" onClick={() => evreneGit(KAPAK)} className="flex items-center gap-2.5 min-w-0 rounded-xl px-2 py-1.5 hover:bg-white/[0.05] transition-colors" title="Kılavuz başlangıcı">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="Unex" className="w-8 h-8 object-contain shrink-0" />
          <span className="min-w-0 text-left">
            <span className="block text-[10px] font-semibold tracking-[0.18em] uppercase leading-tight" style={{ color: TEXT_MUTED }}>Unex Gıda · İhracat AI</span>
            <span className="block text-sm font-semibold leading-tight truncate">Kullanım Kılavuzu</span>
          </span>
        </button>
        <nav className="hidden md:flex flex-1 items-center gap-1 mx-4" aria-label="Kılavuz bölümleri">
          {KILAVUZ_KONULARI.map((k, i) => {
            const dolu = sahne === SON || i < sahne ? 1 : i === sahne ? (adim + 1) / k.adimlar.length : 0;
            return (
              <button key={k.id} type="button" onClick={() => evreneGit(i)} title={`${iki(i + 1)} · ${k.baslik}`} aria-label={`${i + 1}. bölüm: ${k.baslik}`} aria-current={i === sahne ? "step" : undefined}
                className="group flex-1 py-2.5">
                <span className="block h-1 rounded-full overflow-hidden transition-colors" style={{ backgroundColor: "rgba(255,255,255,0.10)" }}>
                  <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${dolu * 100}%`, backgroundColor: k.renk[0] }} />
                </span>
              </button>
            );
          })}
        </nav>
        <div className="flex-1 md:hidden" />
        <Link href={cikisHedefi} className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-[13px] font-medium hover:bg-white/[0.06] transition-colors" style={{ borderColor: "rgba(255,255,255,0.12)", color: "#CBD5E1" }}>
          <X size={15} /> <span className="hidden sm:inline">Uygulamaya Dön</span>
        </Link>
      </header>
      <div className="md:hidden relative z-20 mx-4 h-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.10)" }} aria-hidden>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${ilerleme * 100}%`, backgroundColor: renk[0] }} />
      </div>

      {/* Sahne */}
      <main className="absolute inset-x-0 top-16 bottom-0 overflow-y-auto overflow-x-hidden overscroll-contain">
        <div key={sahne} className={`klv-sahne min-h-full md:h-full ${sahneSinifi}`}>
          {sahne === KAPAK ? (
            <Kapak onBasla={() => evreneGit(0)} onGit={(i) => evreneGit(i)} kayitli={kayitli} />
          ) : sahne === SON ? (
            <Son onBastan={() => evreneGit(0)} onGit={(i) => evreneGit(i)} cikisHedefi={cikisHedefi} />
          ) : konu ? (
            <Evren konu={konu} sira={sahne} adim={adim} setAdim={setAdim} ileri={ileri} geri={geri}
              yetkili={!konu.yetki || !!yetkiler.sayfa_yetkileri[konu.yetki]} />
          ) : null}
        </div>
      </main>

      {/* Logo portali (bolum gecisi) */}
      {gecis && (
        <div className="klv-portal" aria-hidden>
          <span className={`klv-halka ${gecis.faz === "giris" ? "klv-halka-ac" : "klv-halka-topla"}`} />
          {gecis.faz === "giris" && <span className="klv-halka klv-halka-ac klv-halka-2" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="" className={`klv-portal-logo ${gecis.faz === "cikis" ? (gecis.yon > 0 ? "klv-logo-gel" : "klv-logo-gel-geri") : (gecis.yon > 0 ? "klv-logo-gec" : "klv-logo-gec-geri")}`} />
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {sahne === KAPAK ? "Kılavuz başlangıcı" : sahne === SON ? "Kılavuz sonu" : konu ? `${sahne + 1}. evren: ${konu.baslik}. Adım ${adim + 1}: ${konu.adimlar[adim]?.baslik}` : ""}
      </p>
    </div>
  );
}

/* ---------------- Evren (bolum) ---------------- */

function Evren({ konu, sira, adim, setAdim, ileri, geri, yetkili }: {
  konu: KilavuzKonusu; sira: number; adim: number; setAdim: (n: number) => void;
  ileri: () => void; geri: () => void; yetkili: boolean;
}) {
  const a = konu.adimlar[adim];
  const nokta = a?.nokta && konu.ekran ? EKRAN_NOKTALARI[konu.ekran]?.[a.nokta] : undefined;
  const sonAdim = adim === konu.adimlar.length - 1;
  const [r0, r1] = konu.renk;

  return (
    <div className="h-full w-full max-w-[1500px] mx-auto px-4 md:px-8 pb-8 md:pb-6 pt-4 md:pt-2 flex flex-col-reverse md:grid md:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] gap-5 md:gap-8 md:items-center">
      {/* Anlatim */}
      <section className="klv-panel rounded-2xl border p-5 md:p-6 md:max-h-full md:overflow-y-auto overscroll-contain"
        style={{ backgroundColor: "rgba(12,16,23,0.72)", borderColor: "rgba(255,255,255,0.08)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
        <p className="klv-yukari text-[11px] font-semibold tracking-[0.2em] uppercase flex items-center gap-2" style={{ color: r0 }}>
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r0, boxShadow: `0 0 10px ${r0}` }} />
          Evren {iki(sira + 1)} / {iki(N)} · {konu.evren}
        </p>
        <h2 className="klv-yukari klv-g1 mt-2 text-2xl md:text-[28px] font-bold leading-tight">{konu.baslik}</h2>
        <p className="klv-yukari klv-g2 mt-3 text-[13px] leading-relaxed italic border-l-2 pl-3" style={{ borderColor: r1 === "#283474" ? r0 : r1, color: "#AEB8C7" }}>
          {konu.hikaye}
        </p>
        <ol className="klv-yukari klv-g3 mt-5 space-y-1" aria-label="Adımlar">
          {konu.adimlar.map((x, i) => {
            const aktif = i === adim;
            return (
              <li key={i}>
                <button type="button" onClick={() => setAdim(i)} aria-current={aktif ? "step" : undefined}
                  className={`w-full text-left flex gap-3 rounded-xl px-3 py-2 transition-colors ${aktif ? "" : "hover:bg-white/[0.04]"}`}
                  style={aktif ? { backgroundColor: "rgba(255,255,255,0.05)", boxShadow: `inset 0 0 0 1px ${r0}40` } : undefined}>
                  <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors"
                    style={aktif ? { backgroundColor: r0, color: "#0B0F14" } : i < adim ? { backgroundColor: `${r0}33`, color: r0 } : { backgroundColor: "rgba(255,255,255,0.06)", color: TEXT_MUTED }}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13.5px] font-semibold ${aktif ? "text-white" : ""}`} style={aktif ? undefined : { color: "#94A0B2" }}>{x.baslik}</span>
                    {aktif && (
                      <span className="block mt-1 text-[13px] leading-relaxed" style={{ color: "#CBD5E1" }}>
                        <YaziAnimasyonu key={`${konu.id}-${i}`} metin={x.metin} harfMs={14} enUzunMs={1300} gecikmeMs={180} />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-5 flex items-center gap-2">
          <button type="button" onClick={geri} className="h-10 w-10 shrink-0 rounded-xl border flex items-center justify-center hover:bg-white/[0.06] transition-colors" style={{ borderColor: "rgba(255,255,255,0.12)" }} aria-label="Geri">
            <ArrowLeft size={17} />
          </button>
          <button type="button" onClick={ileri} className="h-10 flex-1 rounded-xl font-semibold text-[13.5px] flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
            style={{ backgroundColor: r0, color: "#0B0F14", boxShadow: `0 8px 24px -8px ${r0}` }}>
            {sonAdim ? (sira === N - 1 ? "Yolculuğu tamamla" : "Sonraki evrene geç") : "İleri"} <ArrowRight size={16} />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-[11.5px]" style={{ color: TEXT_MUTED }}>
          <span className="hidden md:inline">← → tuşlarıyla gezinin</span>
          <span className="md:hidden">Sağa / sola kaydırın</span>
          {konu.adres && (yetkili ? (
            <Link href={konu.adres} className="inline-flex items-center gap-1 font-medium hover:text-white transition-colors" style={{ color: r0 }}>
              Sayfayı aç <ExternalLink size={12} />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1" title="Bu sayfa için yetkiniz yok"><Lock size={12} /> Yetkiniz yok</span>
          ))}
        </div>
      </section>

      {/* Ekran */}
      <div className="klv-yukari klv-g1 w-full min-w-0 md:max-h-full flex items-center">
        {konu.ekran && (
          <div className="w-full mx-auto" style={{ maxWidth: "min(100%, calc((100vh - 120px) * 1.6))" }}>
            <EkranSahnesi ekran={konu.ekran} adres={konu.cubuk ?? konu.adres} nokta={nokta} renk={r0} numara={nokta ? adim + 1 : undefined} />
            <p className="mt-2 text-center text-[10.5px]" style={{ color: "#5B6576" }}>Ekran görüntülerindeki firma, numara ve tutarlar örnektir.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Kapak ve son ---------------- */

function Gezegenler() {
  // Logonun etrafinda donen yorunge: her evren bir gezegen
  return (
    <div className="klv-yorunge absolute inset-0" aria-hidden>
      {KILAVUZ_KONULARI.map((k, i) => {
        const aci = (i / N) * Math.PI * 2;
        const r = 47 + (i % 2) * 3;
        return (
          <span key={k.id} className="absolute rounded-full" style={{
            left: `${50 + Math.cos(aci) * r}%`, top: `${50 + Math.sin(aci) * r}%`,
            width: i % 3 === 0 ? 10 : 7, height: i % 3 === 0 ? 10 : 7, transform: "translate(-50%,-50%)",
            backgroundColor: k.renk[0], boxShadow: `0 0 12px ${k.renk[0]}`,
          }} />
        );
      })}
    </div>
  );
}

function LogoGezegen({ boyut = 168 }: { boyut?: number }) {
  return (
    <div className="relative mx-auto" style={{ width: boyut * 1.9, height: boyut * 1.9 }}>
      <div className="absolute inset-[6%] rounded-full border border-dashed" style={{ borderColor: "rgba(255,255,255,0.10)" }} aria-hidden />
      <div className="absolute inset-[20%] rounded-full" style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--klv-a) 35%, transparent), transparent 70%)" }} aria-hidden />
      <Gezegenler />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/logo.png" alt="Unex Gıda" className="klv-suzul absolute left-1/2 top-1/2 object-contain" style={{ width: boyut, height: boyut, marginLeft: -boyut / 2, marginTop: -boyut / 2, filter: "drop-shadow(0 18px 40px rgba(0,0,0,.55))" }} />
    </div>
  );
}

function EvrenHaritasi({ onGit }: { onGit: (i: number) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {KILAVUZ_KONULARI.map((k, i) => (
        <button key={k.id} type="button" onClick={() => onGit(i)}
          className="group rounded-xl border px-3 py-2.5 transition-colors hover:bg-white/[0.06]"
          style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(12,16,23,0.6)" }}>
          <span className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.14em]" style={{ color: k.renk[0] }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: k.renk[0] }} /> {iki(i + 1)}
          </span>
          <span className="block mt-0.5 text-[13px] font-semibold text-white truncate">{k.baslik}</span>
          <span className="block text-[11px] truncate" style={{ color: TEXT_MUTED }}>{k.evren}</span>
        </button>
      ))}
    </div>
  );
}

function Kapak({ onBasla, onGit, kayitli }: { onBasla: () => void; onGit: (i: number) => void; kayitli: number | null }) {
  return (
    <div className="min-h-full w-full max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-4 flex flex-col items-center justify-center text-center">
      <div className="klv-yukari"><LogoGezegen boyut={128} /></div>
      <p className="klv-yukari klv-g1 mt-1 text-[11px] font-semibold tracking-[0.32em] uppercase" style={{ color: "#F4A07C" }}>Unex Gıda · İhracat AI</p>
      <h1 className="klv-yukari klv-g1 mt-2 text-3xl md:text-5xl font-bold tracking-tight">Kullanım Kılavuzu</h1>
      <p className="klv-yukari klv-g2 mt-4 max-w-xl text-sm md:text-base leading-relaxed" style={{ color: "#AEB8C7" }}>
        Bir ihracatın proformadan denize yolculuğu. {N} evren, her biri uygulamanın bir bölümü.
        Kamera sizi ekranların içine götürür; her adımda neye bakacağınızı gösterir.
      </p>
      <div className="klv-yukari klv-g3 mt-7 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={onBasla} autoFocus
          className="h-12 px-7 rounded-xl font-semibold text-[15px] inline-flex items-center gap-2 transition-transform active:scale-[0.98]"
          style={{ backgroundColor: "#10B981", color: "#0B0F14", boxShadow: "0 12px 32px -10px #10B981" }}>
          <Sparkles size={17} /> Yolculuğa Başla
        </button>
        {kayitli !== null && (
          <button type="button" onClick={() => onGit(kayitli)} className="h-12 px-5 rounded-xl border text-[14px] font-medium inline-flex items-center gap-2 hover:bg-white/[0.06] transition-colors" style={{ borderColor: "rgba(255,255,255,0.14)" }}>
            <Compass size={16} /> Kaldığınız yerden: {KILAVUZ_KONULARI[kayitli].baslik}
          </button>
        )}
      </div>
      <p className="klv-yukari klv-g3 mt-3 text-[11.5px]" style={{ color: TEXT_MUTED }}>Yaklaşık 5 dakika · ← → tuşlarıyla ya da kaydırarak ilerleyin</p>
      <div className="klv-yukari klv-g4 mt-7 w-full">
        <p className="mb-3 text-[10.5px] font-semibold tracking-[0.2em] uppercase" style={{ color: TEXT_MUTED }}>Evren haritası</p>
        <EvrenHaritasi onGit={onGit} />
      </div>
    </div>
  );
}

function Son({ onBastan, onGit, cikisHedefi }: { onBastan: () => void; onGit: (i: number) => void; cikisHedefi: string }) {
  return (
    <div className="min-h-full w-full max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-4 flex flex-col items-center justify-center text-center">
      <div className="klv-yukari"><LogoGezegen boyut={118} /></div>
      <p className="klv-yukari klv-g1 mt-1 text-[11px] font-semibold tracking-[0.32em] uppercase" style={{ color: "#10B981" }}>Yolculuk tamamlandı</p>
      <h1 className="klv-yukari klv-g1 mt-2 text-3xl md:text-4xl font-bold tracking-tight">Artık bütün evrenleri tanıyorsunuz</h1>
      <p className="klv-yukari klv-g2 mt-4 max-w-xl text-sm md:text-base leading-relaxed" style={{ color: "#AEB8C7" }}>
        Takıldığınız bir yer olursa sağ alttaki <span className="text-white font-medium">Sorun Bildir</span>&apos;e yazın.
        Kılavuza istediğiniz an sol menünün altındaki <span className="text-white font-medium">Kullanım Kılavuzu</span>&apos;ndan dönebilirsiniz.
      </p>
      <div className="klv-yukari klv-g3 mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link href={cikisHedefi} className="h-12 px-7 rounded-xl font-semibold text-[15px] inline-flex items-center gap-2"
          style={{ backgroundColor: "#10B981", color: "#0B0F14", boxShadow: "0 12px 32px -10px #10B981" }}>
          Uygulamaya Dön <ArrowRight size={17} />
        </Link>
        <button type="button" onClick={onBastan} className="h-12 px-5 rounded-xl border text-[14px] font-medium inline-flex items-center gap-2 hover:bg-white/[0.06] transition-colors" style={{ borderColor: "rgba(255,255,255,0.14)" }}>
          <RotateCcw size={16} /> Baştan İzle
        </button>
      </div>
      <div className="klv-yukari klv-g4 mt-8 w-full"><EvrenHaritasi onGit={onGit} /></div>
    </div>
  );
}

/* ---------------- Stiller ---------------- */

const STIL = `
@property --klv-a { syntax: '<color>'; inherits: true; initial-value: #10B981; }
@property --klv-b { syntax: '<color>'; inherits: true; initial-value: #F4A07C; }
.klv-kok { transition: --klv-a 1.4s ease, --klv-b 1.4s ease; }
.klv-nebula {
  background:
    radial-gradient(55% 45% at 78% 28%, color-mix(in srgb, var(--klv-a) 26%, transparent), transparent 72%),
    radial-gradient(50% 55% at 12% 88%, color-mix(in srgb, var(--klv-b) 30%, transparent), transparent 70%),
    radial-gradient(80% 60% at 50% 50%, rgba(6,9,14,0.35), rgba(6,9,14,0.75));
}
.klv-sahne { transform-origin: 50% 45%; will-change: transform, opacity; }
.klv-cikis-ileri { animation: klv-cikis-ileri ${CIKIS_MS}ms cubic-bezier(.55,0,.85,.35) both; }
.klv-cikis-geri  { animation: klv-cikis-geri  ${CIKIS_MS}ms cubic-bezier(.55,0,.85,.35) both; }
.klv-giris-ileri { animation: klv-giris-ileri ${GIRIS_MS}ms cubic-bezier(.16,.84,.3,1) both; }
.klv-giris-geri  { animation: klv-giris-geri  ${GIRIS_MS}ms cubic-bezier(.16,.84,.3,1) both; }
.klv-solma { animation: klv-belir .25s ease both; }
@keyframes klv-cikis-ileri { to { transform: scale(2.1); opacity: 0; } }
@keyframes klv-cikis-geri  { to { transform: scale(.5);  opacity: 0; } }
@keyframes klv-giris-ileri {
  from { transform: scale(.72); opacity: 0; clip-path: circle(0% at 50% 45%); }
  55%  { opacity: 1; }
  to   { transform: scale(1); opacity: 1; clip-path: circle(150% at 50% 45%); }
}
@keyframes klv-giris-geri {
  from { transform: scale(1.6); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}
@keyframes klv-belir { from { opacity: 0; } to { opacity: 1; } }

.klv-portal { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.klv-portal-logo { position: absolute; width: 150px; height: 150px; object-fit: contain; filter: drop-shadow(0 0 40px var(--klv-a)); }
.klv-logo-gel      { animation: klv-logo-gel ${CIKIS_MS}ms cubic-bezier(.25,.75,.3,1) both; }
.klv-logo-gel-geri { animation: klv-logo-gel-geri ${CIKIS_MS}ms cubic-bezier(.25,.75,.3,1) both; }
.klv-logo-gec      { animation: klv-logo-gec ${GIRIS_MS}ms cubic-bezier(.6,0,.9,.45) both; }
.klv-logo-gec-geri { animation: klv-logo-gec-geri ${GIRIS_MS}ms cubic-bezier(.4,0,.6,1) both; }
@keyframes klv-logo-gel      { from { transform: scale(.12) rotate(-30deg); opacity: 0; } to { transform: scale(1) rotate(0); opacity: 1; } }
@keyframes klv-logo-gel-geri { from { transform: scale(6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes klv-logo-gec      { from { transform: scale(1); opacity: 1; } 35% { opacity: 1; } to { transform: scale(18); opacity: 0; } }
@keyframes klv-logo-gec-geri { from { transform: scale(1) rotate(0); opacity: 1; } to { transform: scale(.05) rotate(40deg); opacity: 0; } }
.klv-halka { position: absolute; width: 180px; height: 180px; border-radius: 9999px; border: 2px solid var(--klv-a);
  box-shadow: 0 0 40px var(--klv-a), inset 0 0 30px color-mix(in srgb, var(--klv-a) 40%, transparent); }
.klv-halka-topla { animation: klv-halka-topla ${CIKIS_MS}ms ease-out both; }
.klv-halka-ac    { animation: klv-halka-ac ${GIRIS_MS}ms cubic-bezier(.2,.7,.3,1) both; }
.klv-halka-2     { animation-delay: 120ms; border-color: var(--klv-b); box-shadow: 0 0 40px var(--klv-b); }
@keyframes klv-halka-topla { from { transform: scale(3); opacity: 0; } to { transform: scale(1); opacity: .9; } }
@keyframes klv-halka-ac    { from { transform: scale(1); opacity: .95; } to { transform: scale(14); opacity: 0; } }

.klv-yukari { animation: klv-yukari .7s cubic-bezier(.2,.8,.3,1) both; }
.klv-g1 { animation-delay: .08s; } .klv-g2 { animation-delay: .16s; } .klv-g3 { animation-delay: .24s; } .klv-g4 { animation-delay: .32s; }
@keyframes klv-yukari { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }

.klv-kamera { transition: transform .9s cubic-bezier(.22,.8,.2,1); will-change: transform; }
.klv-odak { animation: klv-belir .45s ease both;
  transition: left .9s cubic-bezier(.22,.8,.2,1), top .9s cubic-bezier(.22,.8,.2,1), width .9s cubic-bezier(.22,.8,.2,1), height .9s cubic-bezier(.22,.8,.2,1), border-width .9s, border-radius .9s; }
.klv-nabiz::after { content: ''; position: absolute; inset: -5px; border-radius: 9999px; border: 2px solid var(--klv-renk); animation: klv-nabiz 1.6s ease-out infinite; }
@keyframes klv-nabiz { from { transform: scale(.7); opacity: .9; } to { transform: scale(1.9); opacity: 0; } }

.klv-yorunge { animation: klv-don 60s linear infinite; }
@keyframes klv-don { to { transform: rotate(360deg); } }
.klv-suzul { animation: klv-suzul 6s ease-in-out infinite; }
@keyframes klv-suzul { 0%,100% { transform: translateY(-4px); } 50% { transform: translateY(6px); } }

@media (prefers-reduced-motion: reduce) {
  .klv-kok { transition: none; }
  .klv-kamera, .klv-odak { transition: none; }
  .klv-yukari, .klv-odak, .klv-nabiz::after, .klv-yorunge, .klv-suzul { animation: none; }
}
`;
