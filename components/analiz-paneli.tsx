"use client";

/**
 * Analiz sayfasi panel bilesenleri (26.10.2026, kullanicinin ornek analiz paneli esas
 * alindi): ortak Panel cercevesi, gosterge kutusu (+ kucuk egilim cizgisi), aylik grafik
 * (olcu secimli, tek eksen), musteri dagilimi (pay seridi + lejant), otomatik ozet.
 * Hesap YAPMAZ: veriyi app/analiz/page.tsx'teki mevcut hesaplar verir.
 */

import React, { useMemo, useState } from "react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

/** Kategorik renkler (koyu tema, sabit sira; dataviz referans paleti). Siralama = renk. */
export const KATEGORI_RENKLERI = ["#3987E5", "#D95926", "#199E70", "#C98500", "#D55181", "#9085E9"];
export const DIGER_RENGI = "#4B5563";

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
    <section className={`rounded-xl border overflow-hidden animate-fade-up flex flex-col ${className}`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} {...rest}>
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

export function GostergeKutusu({ etiket, deger, alt, seri, ilerleme, dipnot, sira = 1, className = "" }: {
  etiket: string;
  deger: React.ReactNode;
  alt: React.ReactNode;
  seri?: number[];
  /** 0-1 arasi: altta ilerleme cubugu (egilim cizgisi yerine). */
  ilerleme?: number;
  /** Kutunun altindaki ayrac cizgili kucuk satir (her kutuda olsun ki yukseklikler esit kalsin). */
  dipnot?: React.ReactNode;
  sira?: number;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 animate-fade-up stagger-${Math.min(sira, 6)} flex flex-col ${className}`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-gosterge={etiket}>
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

/**
 * Pay seridi (yan yana bolumler, 2px bosluk) + lejant. Ilk {azami} satir kendi renginde,
 * kalani "Diger" (gri) olarak birlesir — renk siraya gore sabit, 7. renk uretilmez.
 */
export function DagilimKarti({ baslik, ikon, olcuEtiketi, satirlar, digerDeger, altBilgi, azami = KATEGORI_RENKLERI.length, className = "", ...rest }: {
  baslik: string;
  ikon?: React.ReactNode;
  olcuEtiketi: string;
  satirlar: DagilimSatiri[];
  /** "Diger" satirinin deger metni (pay toplamindan). */
  digerDeger?: (pay: number, adet: number) => string;
  /** Kartin en altinda (ayrac cizgili) toplam satiri. */
  altBilgi?: React.ReactNode;
  azami?: number;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  const ilk = satirlar.slice(0, azami);
  const kalan = satirlar.slice(azami);
  const kalanPay = kalan.reduce((t, s) => t + s.pay, 0);
  const bolumler = [
    ...ilk.map((s, i) => ({ ...s, renk: KATEGORI_RENKLERI[i] })),
    ...(kalan.length > 0 ? [{ anahtar: "__diger", ad: `Diğer (${kalan.length})`, deger: digerDeger ? digerDeger(kalanPay, kalan.length) : "", pay: kalanPay, renk: DIGER_RENGI, ipucu: kalan.map((s) => s.ad).join("\n"), alt: undefined }] : []),
  ];
  return (
    <Panel baslik={baslik} ikon={ikon} sag={olcuEtiketi} className={className} govdeSinifi="px-4 py-3 flex flex-col" {...rest}>
      {bolumler.length === 0 ? (
        <p className="py-6 text-xs text-center" style={{ color: TEXT_MUTED }}>Veri yok</p>
      ) : (
        <>
          <div className="flex h-3 rounded-full overflow-hidden gap-[2px]" style={{ backgroundColor: ROW_HEADER_BG }} role="img" aria-label={`${baslik} payları`}>
            {bolumler.filter((b) => b.pay > 0).map((b) => (
              <div key={b.anahtar} title={`${b.ad}: ${yuzdeMetni(b.pay)}`} style={{ width: `${b.pay * 100}%`, backgroundColor: b.renk, minWidth: 3 }} />
            ))}
          </div>
          <ul className="mt-3 mb-3 space-y-0.5">
            {bolumler.map((b) => (
              <li key={b.anahtar} className="flex items-center gap-2 py-1 px-1 -mx-1 rounded hover:bg-white/[0.03]" title={b.ipucu} data-dagilim={b.ad}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.renk }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-white truncate">{b.ad}</span>
                  {b.alt && <span className="block text-[10px] truncate" style={{ color: TEXT_MUTED }}>{b.alt}</span>}
                </span>
                <span className="text-xs font-semibold text-white tabular-nums shrink-0">{b.deger}</span>
                <span className="text-[11px] tabular-nums w-10 text-right shrink-0" style={{ color: TEXT_MUTED }}>{yuzdeMetni(b.pay)}</span>
              </li>
            ))}
          </ul>
          {altBilgi && (
            <p className="mt-auto pt-2 border-t text-[10px] flex justify-between gap-2" style={{ color: TEXT_MUTED, borderColor: CARD_BORDER }} data-alt-bilgi="">{altBilgi}</p>
          )}
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- otomatik ozet
export function OzetKarti({ cumleler, ikon }: { cumleler: string[]; ikon?: React.ReactNode }) {
  return (
    <Panel baslik="Otomatik Özet" ikon={ikon} sag="Seçili filtreye göre" govdeSinifi="px-4 py-3" data-otomatik-ozet="">
      {cumleler.length === 0 ? (
        <p className="py-6 text-xs text-center" style={{ color: TEXT_MUTED }}>Veri yok</p>
      ) : (
        <ul className="space-y-2.5">
          {cumleler.map((c, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed" style={{ color: "#CBD5E1" }}>
              <span className="mt-[7px] w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: ACCENT }} aria-hidden />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] mt-3 pt-2 border-t" style={{ color: TEXT_MUTED, borderColor: CARD_BORDER }}>Sayfadaki kartlarla aynı verilerden hesaplanır; tahmin içermez.</p>
    </Panel>
  );
}
