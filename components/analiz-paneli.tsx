"use client";

/**
 * Analiz sayfasi panel bilesenleri (26.10.2026, kullanicinin ornek analiz paneli esas
 * alindi): ortak Panel cercevesi, gosterge kutusu (+ kucuk egilim cizgisi), aylik grafik
 * (olcu secimli, tek eksen), musteri dagilimi (pay seridi + lejant), otomatik ozet.
 * Hesap YAPMAZ: veriyi app/analiz/page.tsx'teki mevcut hesaplar verir.
 */

import React, { useEffect, useMemo, useState } from "react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { YaziAnimasyonu } from "@/components/yazi-animasyonu";

/** Kategorik renkler (koyu tema, sabit sira; dataviz referans paleti). Siralama = renk. */
export const KATEGORI_RENKLERI = ["#3987E5", "#D95926", "#199E70", "#C98500", "#D55181", "#9085E9"];
/** Kategori disi (soluk) gri - Teslim Sekli gostergesinde 7. ve sonrasi icin. */
export const DIGER_RENGI = "#4B5563";

/** Kart zemini: OPAK (okunurluk kurali) + ustte cok hafif marka yesili tonu. */
export const KART_ZEMINI = `linear-gradient(180deg, rgba(16,185,129,0.045) 0%, rgba(16,185,129,0) 38%), ${CARD_BG}`;

/** Sayfanin her yerinde AYNI yuzde bicimi: tam sayi, cok kucukse "<%1". */
export function yuzdeMetni(pay: number): string {
  const p = pay * 100;
  if (p > 0 && p < 1) return "<%1";
  return `%${Math.round(p)}`;
}

export function Panel({ baslik, ikon, sag, children, className = "", govdeSinifi = "", ...rest }: {
  baslik: React.ReactNode;
  ikon?: React.ReactNode;
  sag?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  govdeSinifi?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`rounded-xl border overflow-hidden animate-fade-up flex flex-col ${className}`} style={{ background: KART_ZEMINI, borderColor: CARD_BORDER }} {...rest}>
      <div className="px-4 py-3 border-b flex items-center justify-between gap-2" style={{ borderColor: CARD_BORDER }}>
        <h2 className="flex items-center gap-1.5 min-w-0 text-[13px] font-semibold text-white">
          {ikon && <span className="shrink-0" style={{ color: TEXT_MUTED }}>{ikon}</span>}
          <span className="truncate">{baslik}</span>
        </h2>
        {sag && <div className="shrink-0 text-[10px] text-right" style={{ color: TEXT_MUTED }}>{sag}</div>}
      </div>
      <div className={`flex-1 ${govdeSinifi}`}>{children}</div>
    </section>
  );
}

/** Kucuk egilim cizgisi (tek seri, eksensiz). En az 2 nokta yoksa cizilmez. */
function Egilim({ seri, etiket }: { seri: number[]; etiket: string }) {
  if (seri.length < 2) return null;
  const G = 120, Y = 28, P = 3;
  const max = Math.max(...seri), min = Math.min(...seri, 0);
  const aralik = max - min || 1;
  const nokta = seri.map((v, i) => [P + (i * (G - 2 * P)) / (seri.length - 1), Y - P - ((v - min) / aralik) * (Y - 2 * P)] as const);
  const cizgi = nokta.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const son = nokta[nokta.length - 1];
  const id = `egilim-${etiket.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${G} ${Y}`} preserveAspectRatio="none" className="w-full h-7 mt-2" role="img" aria-label={`${etiket} aylık eğilim`}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${P},${Y} ${cizgi} ${G - P},${Y}`} fill={`url(#${id})`} />
      <polyline points={cizgi} fill="none" stroke={ACCENT} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={son[0]} cy={son[1]} r="2.2" fill={ACCENT} />
    </svg>
  );
}

export function GostergeKutusu({ etiket, deger, alt, seri, ilerleme, serit, dipnot, sira = 1, className = "" }: {
  etiket: string;
  deger: React.ReactNode;
  alt: React.ReactNode;
  seri?: number[];
  /** 0-1 arasi: altta ilerleme cubugu (egilim cizgisi yerine). */
  ilerleme?: number;
  /** 0-1 paylarla renkli pay seridi (ilerleme cubugu yerine). */
  serit?: { ad: string; pay: number; renk: string }[];
  /** Kutunun altindaki ayrac cizgili kucuk satir (her kutuda olsun ki yukseklikler esit kalsin). */
  dipnot?: React.ReactNode;
  sira?: number;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 animate-fade-up stagger-${Math.min(sira, 6)} flex flex-col ${className}`} style={{ background: KART_ZEMINI, borderColor: CARD_BORDER }} data-gosterge={etiket}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>{etiket}</p>
      <p className="text-2xl font-bold text-white tabular-nums mt-1 leading-tight truncate">{deger}</p>
      <p className="text-[10px] mt-0.5 truncate" style={{ color: TEXT_MUTED }}>{alt}</p>
      <div className="mt-auto">
        {/* 2 ayla egilim cizgisi anlamsiz (duz cizgi) - en az 3 ay */}
        {seri && seri.length >= 3 && <Egilim seri={seri} etiket={etiket} />}
        {ilerleme !== undefined && (
          <div className="w-full rounded-full h-1.5 mt-3" style={{ backgroundColor: CARD_BORDER }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ilerleme * 100)} aria-label={etiket}>
            <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.max(0, ilerleme * 100))}%`, backgroundColor: ACCENT }} />
          </div>
        )}
        {serit && serit.length > 0 && (
          <div className="flex h-1.5 rounded-full overflow-hidden gap-[2px] mt-3" style={{ backgroundColor: CARD_BORDER }} role="img" aria-label={serit.map((s) => `${s.ad} ${yuzdeMetni(s.pay)}`).join(", ")}>
            {serit.filter((s) => s.pay > 0).map((s) => <div key={s.ad} title={`${s.ad}: ${yuzdeMetni(s.pay)}`} style={{ width: `${s.pay * 100}%`, backgroundColor: s.renk, minWidth: 3 }} />)}
          </div>
        )}
        {dipnot && (
          <p className="text-[10px] mt-3 pt-2 border-t truncate" style={{ color: TEXT_MUTED, borderColor: CARD_BORDER }} data-dipnot="">{dipnot}</p>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ aylik grafik
export type AylikVeri = { anahtar: string; ay: string; tutar: number; konteyner: number; mts: number; dosya: number };
type Olcu = "tutar" | "konteyner" | "mts";

/** 0, 1, 2, 2.5, 5 x 10^n adimlariyla "guzel" ust sinir ve adim. */
function guzelOlcek(max: number, adet = 4): { ust: number; adim: number } {
  if (max <= 0) return { ust: 1, adim: 0.25 };
  const kaba = max / adet;
  const us = Math.pow(10, Math.floor(Math.log10(kaba)));
  const adim = [1, 2, 2.5, 5, 10].map((k) => k * us).find((a) => a >= kaba) || 10 * us;
  return { ust: Math.ceil(max / adim) * adim, adim };
}

export function AylikGrafik({ veri, buAy, tutarKisa, tutarTam, paraBirimi, ikon }: {
  veri: AylikVeri[];
  buAy: string;
  tutarKisa: (n: number) => string;
  tutarTam: (n: number) => string;
  paraBirimi: string;
  ikon?: React.ReactNode;
}) {
  const [olcu, setOlcu] = useState<Olcu>("tutar");
  const bicim = (v: number, kisa = true) =>
    olcu === "tutar" ? (kisa ? tutarKisa(v) : tutarTam(v)) : olcu === "mts" ? `${v.toLocaleString("tr-TR", { maximumFractionDigits: kisa ? 0 : 2 })}${kisa ? "" : " MTS"}` : v.toLocaleString("tr-TR");
  const degerler = veri.map((v) => v[olcu]);
  const { ust, adim } = useMemo(() => guzelOlcek(Math.max(...degerler, 0)), [degerler]);
  const cizgiler: number[] = [];
  for (let v = 0; v <= ust + adim / 2; v += adim) cizgiler.push(v);
  const planlananVar = veri.some((v) => v.anahtar > buAy && v[olcu] > 0);
  const etiketleriGoster = veri.length <= 12;
  const olculer: { deger: Olcu; ad: string }[] = [
    { deger: "tutar", ad: `Hacim (${paraBirimi})` },
    { deger: "konteyner", ad: "Konteyner" },
    { deger: "mts", ad: "MTS" },
  ];
  const YUKSEKLIK = 210;

  return (
    <Panel
      baslik="Aylık Sevkiyat"
      ikon={ikon}
      className="xl:col-span-8"
      data-aylik-grafik=""
      sag={
        <div role="group" aria-label="Grafik ölçüsü" className="flex rounded-lg border overflow-hidden" style={{ borderColor: CARD_BORDER }}>
          {olculer.map((o) => (
            <button key={o.deger} onClick={() => setOlcu(o.deger)} aria-pressed={olcu === o.deger}
              className="px-2.5 py-1 text-[11px] transition-colors"
              style={olcu === o.deger ? { backgroundColor: "rgba(16,185,129,0.16)", color: "#6EE7B7" } : { backgroundColor: "transparent", color: TEXT_MUTED }}>
              {o.ad}
            </button>
          ))}
        </div>
      }
      govdeSinifi="px-4 pt-4 pb-3"
    >
      <div className="flex gap-2">
        {/* Y ekseni */}
        <div className="relative shrink-0 w-12 text-[10px] tabular-nums" style={{ height: YUKSEKLIK, color: TEXT_MUTED }} aria-hidden>
          {cizgiler.map((v) => (
            <span key={v} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${(1 - v / ust) * 100}%` }}>{bicim(v)}</span>
          ))}
        </div>
        <div className="relative flex-1 min-w-0" style={{ height: YUKSEKLIK }}>
          {cizgiler.map((v) => (
            <div key={v} className="absolute left-0 right-0 border-t" style={{ top: `${(1 - v / ust) * 100}%`, borderColor: v === 0 ? "#2A3141" : "rgba(255,255,255,0.05)" }} aria-hidden />
          ))}
          <div className="absolute inset-0 flex items-end gap-2 sm:gap-3 px-1">
            {veri.map((item, idx) => {
              const v = item[olcu];
              const hiza = veri.length > 2 && idx === 0 ? "left-0" : veri.length > 2 && idx === veri.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2";
              const planlanan = item.anahtar > buAy;
              const yuzde = ust > 0 ? (v / ust) * 100 : 0;
              return (
                <div key={item.anahtar} className="flex-1 h-full flex flex-col items-center justify-end group min-w-0 relative" data-ay={item.anahtar}>
                  <div className={`absolute mb-6 ${hiza} text-white text-[10px] px-2 py-1.5 rounded-md border whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none shadow-lg`} style={{ backgroundColor: "#1A1F2B", borderColor: "#2A3141", bottom: `${Math.min(yuzde, 62)}%` }} data-ipucu="">
                    <p className="font-semibold">{item.ay}{planlanan ? " · planlanan" : ""}</p>
                    <p>{tutarTam(item.tutar)}</p>
                    <p style={{ color: TEXT_MUTED }}>{item.dosya} dosya · {item.konteyner} konteyner · {item.mts.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} MTS</p>
                  </div>
                  {etiketleriGoster && v > 0 && (
                    <span className="text-[10px] font-semibold mb-1 tabular-nums whitespace-nowrap" style={{ color: planlanan ? TEXT_MUTED : "#E2E8F0" }}>{bicim(v)}</span>
                  )}
                  <div
                    className="w-full max-w-[52px] rounded-t transition-opacity group-hover:opacity-80"
                    style={{
                      height: v > 0 ? `max(${yuzde}%, 2px)` : "1px",
                      backgroundColor: v > 0 ? (planlanan ? "rgba(16,185,129,0.22)" : ACCENT) : CARD_BORDER,
                      border: planlanan && v > 0 ? `1px dashed ${ACCENT}` : undefined,
                      borderBottom: "none",
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* X ekseni */}
      <div className="flex gap-2 mt-1.5">
        <div className="w-12 shrink-0" />
        <div className="flex-1 min-w-0 flex gap-2 sm:gap-3 px-1">
          {veri.map((item) => (
            <div key={item.anahtar} className="flex-1 text-center min-w-0">
              <p className="text-[10px] truncate" style={{ color: item.anahtar === buAy ? "#E2E8F0" : TEXT_MUTED }}>{item.ay}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] mt-2 flex flex-wrap gap-x-3 gap-y-1" style={{ color: TEXT_MUTED }}>
        <span>Gemi kalkış (ETD) ayına göre</span>
        {planlananVar && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "rgba(16,185,129,0.22)", border: `1px dashed ${ACCENT}` }} /> Planlanan (ETD ileri tarihli)
          </span>
        )}
      </p>
      <table className="sr-only">
        <caption>Aylık sevkiyat</caption>
        <thead><tr><th>Ay</th><th>Hacim</th><th>Konteyner</th><th>MTS</th><th>Dosya</th></tr></thead>
        <tbody>{veri.map((i) => <tr key={i.anahtar}><td>{i.ay}</td><td>{tutarTam(i.tutar)}</td><td>{i.konteyner}</td><td>{i.mts}</td><td>{i.dosya}</td></tr>)}</tbody>
      </table>
    </Panel>
  );
}

// ------------------------------------------------------------- musteri dagilimi
export type DagilimSatiri = { anahtar: string; ad: string; deger: string; pay: number; ipucu?: string; alt?: string };

/** Sayfa basina satir (= kategorik renk sayisi: renkler sayfadaki SIRAYA gore, sayfa icinde tekil). */
export const DAGILIM_SAYFA_BOYUTU = KATEGORI_RENKLERI.length;
const OTOMATIK_GECIS_MS = 8000;
const SOLUK_BOLUM = "#2A3343";

/**
 * Pay seridi + sayfali lejant (26.10.2026, kullanici: "Diger (14) cirkin, butun musteriler
 * gorunmeli; 2. sayfaya kart / donme animasyonuyla gecilsin"). "Diger" YOK: tum satirlar
 * {sayfaBoyutu}'lik sayfalarda, sira numarasiyla. Seritte TUM satirlar var; o anki sayfanin
 * bolumleri renkli (lejanttaki noktayla ayni renk), digerleri soluk — renk, ekranda gorunen
 * satiri isaretler (8. renk uretilmez). Seritte bir bolume tiklamak o satirin sayfasina gider.
 * Gecis: satirlar yukaridan asagi sirayla cevrilerek gelir (globals.css .dagilim-cevir);
 * birden fazla sayfa varsa 8 sn'de bir kendiliginden ilerler — fare ustundeyken / odak
 * icerideyken / "hareketi azalt" acikken DURUR.
 */
export function DagilimKarti({ baslik, ikon, olcuEtiketi, satirlar, altBilgi, sayfaBoyutu = DAGILIM_SAYFA_BOYUTU, className = "", ...rest }: {
  baslik: string;
  ikon?: React.ReactNode;
  olcuEtiketi: string;
  satirlar: DagilimSatiri[];
  /** Kartin en altinda (ayrac cizgili) toplam bilgisi. */
  altBilgi?: React.ReactNode;
  sayfaBoyutu?: number;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  const boyut = Math.max(1, Math.min(sayfaBoyutu, KATEGORI_RENKLERI.length));
  const sayfaSayisi = Math.max(1, Math.ceil(satirlar.length / boyut));
  const [sayfa, setSayfa] = useState(0);
  const [duraklat, setDuraklat] = useState(false);
  const [hareketAzalt, setHareketAzalt] = useState(false);
  const [gecisNo, setGecisNo] = useState(0);

  // Filtre degisip satir sayisi azalirsa ilk sayfaya don
  useEffect(() => { setSayfa(0); }, [satirlar.length]);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const guncelle = () => setHareketAzalt(mq.matches);
    guncelle();
    mq.addEventListener?.("change", guncelle);
    return () => mq.removeEventListener?.("change", guncelle);
  }, []);
  const git = (yeni: number) => {
    setSayfa(((yeni % sayfaSayisi) + sayfaSayisi) % sayfaSayisi);
    setGecisNo((n) => n + 1);
  };
  useEffect(() => {
    if (sayfaSayisi < 2 || duraklat || hareketAzalt) return;
    const t = window.setInterval(() => {
      setSayfa((s) => (s + 1) % sayfaSayisi);
      setGecisNo((n) => n + 1);
    }, OTOMATIK_GECIS_MS);
    return () => window.clearInterval(t);
  }, [sayfaSayisi, duraklat, hareketAzalt]);

  const aktif = Math.min(sayfa, sayfaSayisi - 1);
  const bas = aktif * boyut;
  const gorunen = satirlar.slice(bas, bas + boyut);
  const renkOf = (i: number) => (i >= bas && i < bas + boyut ? KATEGORI_RENKLERI[i - bas] : SOLUK_BOLUM);

  return (
    <Panel baslik={baslik} ikon={ikon} sag={olcuEtiketi} className={className} govdeSinifi="px-4 py-3 flex flex-col" {...rest}>
      {satirlar.length === 0 ? (
        <p className="py-6 text-xs text-center" style={{ color: TEXT_MUTED }}>Veri yok</p>
      ) : (
        <div
          className="flex-1 flex flex-col"
          onMouseEnter={() => setDuraklat(true)}
          onMouseLeave={() => setDuraklat(false)}
          onFocus={() => setDuraklat(true)}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDuraklat(false); }}
        >
          <div className="flex h-3 rounded-full overflow-hidden gap-[2px]" style={{ backgroundColor: ROW_HEADER_BG }} role="group" aria-label={`${baslik} payları`} data-pay-seridi="">
            {satirlar.map((b, i) => b.pay > 0 && (
              <button
                key={b.anahtar}
                type="button"
                tabIndex={-1}
                title={`${i + 1}. ${b.ad}: ${yuzdeMetni(b.pay)}`}
                aria-label={`${b.ad}: ${yuzdeMetni(b.pay)}`}
                onClick={() => git(Math.floor(i / boyut))}
                className="h-full transition-colors duration-300"
                style={{ width: `${b.pay * 100}%`, backgroundColor: renkOf(i), minWidth: 2, flexShrink: 1 }}
              />
            ))}
          </div>

          <ul key={`${aktif}-${gecisNo}`} className="mt-3 mb-3 space-y-0.5" aria-live="polite" data-dagilim-sayfa={aktif + 1}>
            {gorunen.map((b, j) => (
              <li
                key={b.anahtar}
                className={`flex items-center gap-2 py-1.5 min-h-[52px] px-1 -mx-1 rounded hover:bg-white/[0.03] ${hareketAzalt ? "" : "dagilim-cevir"}`}
                style={hareketAzalt ? undefined : { animationDelay: `${j * 55}ms` }}
                title={b.ipucu}
                data-dagilim={b.ad}
              >
                <span className="text-[10px] font-bold tabular-nums w-4 text-right shrink-0" style={{ color: TEXT_MUTED }}>{bas + j + 1}</span>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: KATEGORI_RENKLERI[j] }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-white line-clamp-2 break-words leading-snug">{b.ad}</span>
                  {b.alt && <span className="block text-[10px] truncate" style={{ color: TEXT_MUTED }}>{b.alt}</span>}
                </span>
                <span className="text-xs font-semibold text-white tabular-nums shrink-0">{b.deger}</span>
                <span className="text-[11px] tabular-nums w-10 text-right shrink-0" style={{ color: TEXT_MUTED }}>{yuzdeMetni(b.pay)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-2 border-t flex items-center justify-between gap-2 text-[10px]" style={{ color: TEXT_MUTED, borderColor: CARD_BORDER }}>
            <div className="flex items-center gap-2 min-w-0" data-alt-bilgi="">{altBilgi}</div>
            {sayfaSayisi > 1 && (
              <nav className="flex items-center gap-1 shrink-0" aria-label={`${baslik} sayfaları`} data-dagilim-sayfalama="">
                <button type="button" onClick={() => git(aktif - 1)} aria-label="Önceki sayfa" className="w-6 h-6 rounded-md border flex items-center justify-center hover:text-white hover:bg-white/[0.05] transition-colors" style={{ borderColor: CARD_BORDER }}>‹</button>
                <span className="flex items-center gap-1 px-1" aria-hidden>
                  {Array.from({ length: sayfaSayisi }, (_, i) => (
                    <span key={i} className="h-1.5 rounded-full transition-all duration-300" style={{ width: i === aktif ? 14 : 6, backgroundColor: i === aktif ? ACCENT : "#3A4456" }} />
                  ))}
                </span>
                <span className="tabular-nums text-white min-w-[28px] text-center" data-sayfa-no="">{aktif + 1}/{sayfaSayisi}</span>
                <button type="button" onClick={() => git(aktif + 1)} aria-label="Sonraki sayfa" className="w-6 h-6 rounded-md border flex items-center justify-center hover:text-white hover:bg-white/[0.05] transition-colors" style={{ borderColor: CARD_BORDER }}>›</button>
              </nav>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- otomatik ozet
// 28.10.2026: cumleler sohbet gibi SIRAYLA yazilir (biri bitince digeri; YaziAnimasyonu).
// Yer kaymasi yok: henuz sirasi gelmeyen cumle gorunmez kopya olarak yerini tutar.
// Filtre degisince yazilmis cumleler yeniden yazilmaz (YaziAnimasyonu kurali), aninda guncellenir.
export function OzetKarti({ cumleler, ikon }: { cumleler: string[]; ikon?: React.ReactNode }) {
  const [sira, setSira] = useState(0);
  return (
    <Panel baslik="Otomatik Özet" ikon={ikon} sag="Seçili filtreye göre" govdeSinifi="px-4 py-3" data-otomatik-ozet="">
      {cumleler.length === 0 ? (
        <p className="py-6 text-xs text-center" style={{ color: TEXT_MUTED }}>Veri yok</p>
      ) : (
        <ul className="space-y-2.5">
          {cumleler.map((c, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed" style={{ color: "#CBD5E1" }}>
              <span className="mt-[7px] w-1 h-1 rounded-full shrink-0 transition-opacity duration-300" style={{ backgroundColor: ACCENT, opacity: i <= sira ? 1 : 0 }} aria-hidden />
              <span className="min-w-0 flex-1">
                {i <= sira
                  ? <YaziAnimasyonu metin={c} harfMs={16} enUzunMs={1400} gecikmeMs={i === 0 ? 250 : 120} onBitti={() => setSira((s) => Math.max(s, i + 1))} />
                  : <span className="invisible">{c}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] mt-3 pt-2 border-t" style={{ color: TEXT_MUTED, borderColor: CARD_BORDER }}>Sayfadaki kartlarla aynı verilerden hesaplanır; tahmin içermez.</p>
    </Panel>
  );
}
