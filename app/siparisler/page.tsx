"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Download, RefreshCw, Search, Ship, Upload } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { EmptyState } from "@/components/empty-state";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { useAuth } from "@/lib/auth-context";
import {
  BEKLEYEN_BLOK, BOLUM_BASLIGI, DURUM_ADI, ON_ODEME_DEGISIR, bugunIst, planBloklari, planGorunumu, planKalemleri, planSirala, saat, siparisBolumleri,
  siparisBolumu, siparisOzeti, trTarih, type PlanBlogu, type PlanSatiri, type SiparisDurum, type SiparisSatiri,
} from "@/lib/siparis/liste";
import { onOdemeKaydet, siparisListesiOku, yuklemePlaniOku } from "@/lib/siparis/veri";
import { PlanExcelAktar } from "@/components/plan-excel-aktar";
import { SiparisExcelAktar } from "@/components/siparis-excel-aktar";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";

/**
 * SIPARIS LISTESI + YUKLEME PLANI (11.11.2026). Kullanici: "Siparis formu ile yukleme planinin otomatik ve hatasiz
 * bir sekilde hazirlanabilmeli; sonra raporlayabilmeliyiz." "Siparis listesinde on odeme girilebilsin."
 *  - Liste ve plan kimse tarafindan doldurulmaz: proforma / dosya / rezervasyondan canli hesaplanir (lib/siparis/liste.ts).
 *  - Elle girilen: on odeme (TUTAR + tarih; rezervasyon oncesi siparislerde; "proformalar" yetkisi).
 *  - Siparis listesi export'un Excel'indeki gibi BOLUMLU (lib/siparis/liste.ts BOLUM_BASLIGI); en guncel en altta.
 *  - Excel indir: export'un ve operasyonun Excel'iyle ayni basliklar (lib/siparis/xlsx.ts).
 */

type Sekme = "siparis" | "plan";

const DURUM_RENK: Record<SiparisDurum, [string, string]> = {
  onay_bekliyor: ["rgba(148,163,184,0.14)", "#CBD5E1"],
  on_odeme_alindi: ["rgba(96,165,250,0.15)", "#93C5FD"],
  rezervasyonlu: ["rgba(244,160,124,0.16)", "#F4A07C"],
  sevk_edildi: ["rgba(16,185,129,0.14)", "#6EE7B7"],
  bl_eksik: ["rgba(239,68,68,0.15)", "#FCA5A5"],
  iptal: ["rgba(148,163,184,0.08)", "#64748B"],
};

const norm = (s: string) => s.toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
const sayiGoster = (n: number | null, k = 0) => (n === null ? "—" : n.toLocaleString("tr-TR", { maximumFractionDigits: k }));

function DurumRozeti({ d }: { d: SiparisDurum }) {
  const [bg, fg] = DURUM_RENK[d];
  return <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium whitespace-nowrap" style={{ backgroundColor: bg, color: fg }} data-durum={d}>{DURUM_ADI[d]}</span>;
}

function OzetKarti({ etiket, deger, alt, renk, testId, onClick, secili }: { etiket: string; deger: string | number; alt?: string; renk?: string; testId: string; onClick?: () => void; secili?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="text-left rounded-xl border px-4 py-3 disabled:cursor-default"
      style={{ backgroundColor: CARD_BG, borderColor: secili ? ACCENT : CARD_BORDER }} data-testid={testId}>
      <p className="text-xs" style={{ color: TEXT_MUTED }}>{etiket}</p>
      <p className="text-2xl font-semibold tabular-nums mt-1" style={{ color: renk || "#FFFFFF" }} data-deger>{deger}</p>
      {alt && <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{alt}</p>}
    </button>
  );
}

const paraIsareti = (p: string | null) => (p === "EUR" ? "€" : p === "TRY" ? "₺" : "$");

/** On odeme hucresi: bekleyen satirda "On odeme alindi" butonu; alinmis satirda tutar + tarih (+ geri al). */
function OnOdemeHucresi({ s, yetkili, onAc, onGeriAl, mesgul }: {
  s: SiparisSatiri; yetkili: boolean; onAc: (s: SiparisSatiri) => void; onGeriAl: (s: SiparisSatiri) => void; mesgul: boolean;
}) {
  const [onay, setOnay] = useState(false);
  const degisir = yetkili && ON_ODEME_DEGISIR.includes(s.durum) && !!s.proforma_no;
  if (s.durum === "onay_bekliyor") {
    return degisir ? (
      <button type="button" onClick={() => onAc(s)} disabled={mesgul} data-onodeme-ac
        className="min-h-7 px-2 py-1 rounded-md text-[11px] leading-tight font-semibold text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
        Ön ödeme alındı
      </button>
    ) : <span className="text-xs" style={{ color: TEXT_MUTED }}>—</span>;
  }
  if (!s.on_odeme) return <span className="text-xs" style={{ color: TEXT_MUTED }}>—</span>;
  return (
    <div className="text-xs" data-onodeme>
      <span className="text-sky-300 font-medium tabular-nums">
        {s.on_odeme_tutar !== null ? `${sayiGoster(s.on_odeme_tutar, 2)} ${paraIsareti(s.on_odeme_para)}` : "Alındı"}
      </span>
      {s.on_odeme_tarihi ? <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{trTarih(s.on_odeme_tarihi)}</span> : null}
      {degisir && s.durum === "on_odeme_alindi" && (
        onay ? (
          <span className="block mt-0.5 text-[11px]">
            <button type="button" onClick={() => { setOnay(false); onGeriAl(s); }} disabled={mesgul} className="text-red-300 underline mr-2" data-onodeme-geri-evet>Evet, geri al</button>
            <button type="button" onClick={() => setOnay(false)} style={{ color: TEXT_MUTED }}>Vazgeç</button>
          </span>
        ) : (
          <span className="block mt-0.5 text-[11px]">
            {s.on_odeme_tutar === null && <button type="button" onClick={() => onAc(s)} disabled={mesgul} className="underline mr-2" style={{ color: ACCENT }} data-onodeme-tutar>Tutar gir</button>}
            <button type="button" onClick={() => setOnay(true)} disabled={mesgul} className="underline" style={{ color: TEXT_MUTED }} data-onodeme-geri>Geri al</button>
          </span>
        )
      )}
    </div>
  );
}

/**
 * Sipariş tablosu - EKRANA SIĞAR (11.11.2026): export Excel'inin 11 başlığı korunur; ilişkili başlıklar aynı sütunda
 * üst / alt satır (ÜRÜN / MARKA · PAKETLEME, LİMAN / BL NO). Excel indir 11 ayrı sütun (birebir).
 */
const SIPARIS_SUTUNLARI: Array<{ basliklar: string[]; genislik: string; sag?: boolean }> = [
  { basliklar: ["Proforma"], genislik: "12%" },
  { basliklar: ["Firma Adı"], genislik: "13%" },
  { basliklar: ["Ürün", "Marka · Paketleme"], genislik: "16%" },
  { basliklar: ["Fiyat"], genislik: "6%", sag: true },
  { basliklar: ["Miktar"], genislik: "6%", sag: true },
  { basliklar: ["Tutar"], genislik: "9%", sag: true },
  { basliklar: ["Konteyner"], genislik: "7%", sag: true },
  { basliklar: ["Liman", "BL NO"], genislik: "10%" },
  { basliklar: ["Durum"], genislik: "8%" },
  { basliklar: ["Dosya / Booking"], genislik: "8%" },
  { basliklar: ["Ön ödeme"], genislik: "9%" },
];

function SiparisSatirlari({ satirlar, yetkili, onAc, onGeriAl, mesgul }: {
  satirlar: SiparisSatiri[]; yetkili: boolean; onAc: (s: SiparisSatiri) => void; onGeriAl: (s: SiparisSatiri) => void; mesgul: string | null;
}) {
  const alt = { color: TEXT_MUTED };
  const h = "px-2 py-2 align-top break-words";
  return (
    <>
      {satirlar.map((s) => {
        const sevk = s.durum === "sevk_edildi";
        return (
          <tr key={s.anahtar} className="border-t" style={{ borderColor: CARD_BORDER, backgroundColor: sevk ? "rgba(16,185,129,0.07)" : undefined }}
            data-testid="siparis-satiri" data-proforma={s.proforma_no || ""} data-bolum={siparisBolumu(s.durum)}>
            <td className={h}>
              <span className="text-white font-medium break-all">{s.proforma_no || "—"}</span>
              <span className="block text-[11px]" style={alt}>{trTarih(s.proforma_tarihi)}{s.kaynak === "sistem" ? " · sistemden" : ""}</span>
            </td>
            <td className={`${h} text-white`}>{s.firma || "—"}</td>
            <td className={h} style={{ color: "#C9D1DC" }}>
              {s.urun || "—"}
              <span className="block text-[11px]" style={alt}>{[s.marka, s.paketleme].filter(Boolean).join(" · ") || "—"}</span>
            </td>
            <td className={`${h} text-right tabular-nums`} style={{ color: "#C9D1DC" }}>{sayiGoster(s.birim_fiyat, 2)}</td>
            <td className={`${h} text-right tabular-nums text-white`}>{sayiGoster(s.miktar_mt, 2)}</td>
            <td className={`${h} text-right tabular-nums text-white`}>{s.tutar === null ? "—" : `${sayiGoster(s.tutar, 2)} ${paraIsareti(s.para_birimi)}`}</td>
            <td className={`${h} text-right tabular-nums`} style={{ color: "#C9D1DC" }}>{sayiGoster(s.konteyner)}</td>
            <td className={h} style={{ color: "#C9D1DC" }}>
              {s.liman || "—"}
              <span className="block font-mono text-[11px] break-all" style={alt}>{s.bl_no || "—"}</span>
            </td>
            <td className={h}>
              {s.durum === "onay_bekliyor" ? <span className="text-xs" style={alt} data-durum={s.durum}>—</span> : <DurumRozeti d={s.durum} />}
              {s.benzer && s.kaynak === "sistem" && (
                <span className="mt-1 flex items-start gap-1 text-[11px]" style={{ color: "#FCD34D" }} data-benzer>
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" /> Olası tekrar: {s.benzer}
                </span>
              )}
            </td>
            <td className={`${h} text-xs`} style={alt}>
              {s.dosya_no || (s.durum === "on_odeme_alindi" ? <span className="text-amber-300">Rezervasyon alınmadı</span> : "—")}
              {s.booking_no ? <span className="block break-all">{s.booking_no}</span> : null}
              {s.etd ? <span className="block">ETD {trTarih(s.etd)}</span> : null}
            </td>
            <td className={h}><OnOdemeHucresi s={s} yetkili={yetkili} onAc={onAc} onGeriAl={onGeriAl} mesgul={mesgul === s.anahtar} /></td>
          </tr>
        );
      })}
    </>
  );
}

/** Excel'deki gibi bölümlü sipariş listesi; her bölümde en güncel en altta. */
function SiparisBolumleri({ liste, yetkili, onAc, onGeriAl, mesgul, sevkAcik, setSevkAcik }: {
  liste: SiparisSatiri[]; yetkili: boolean; onAc: (s: SiparisSatiri) => void; onGeriAl: (s: SiparisSatiri) => void; mesgul: string | null;
  sevkAcik: boolean; setSevkAcik: (v: boolean) => void;
}) {
  const bolumler = useMemo(() => siparisBolumleri(liste), [liste]);
  return (
    <div className="space-y-4">
      {bolumler.map((b) => {
        if (b.bolum === "iptal" && !b.adet) return null;
        const sevkler = b.bolum === "rezervasyon" ? b.satirlar.filter((s) => s.durum === "sevk_edildi") : [];
        const gorunen = b.bolum === "rezervasyon" && !sevkAcik ? b.satirlar.filter((s) => s.durum !== "sevk_edildi") : b.satirlar;
        const tutarlar = Object.entries(b.tutar).map(([p, t]) => `${sayiGoster(t, 0)} ${paraIsareti(p)}`).join(" + ") || "—";
        const vurgu = b.bolum === "on_odeme" ? "#93C5FD" : b.bolum === "bekleyen" ? "#CBD5E1" : b.bolum === "rezervasyon" ? "#6EE7B7" : "#64748B";
        return (
          <section key={b.bolum} id={`bolum-${b.bolum}`} className="rounded-xl border overflow-hidden scroll-mt-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid={`bolum-${b.bolum}`}>
            <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ backgroundColor: ROW_HEADER_BG, borderLeft: `3px solid ${vurgu}` }}>
              <h3 className="text-[13px] font-semibold text-white leading-snug" data-bolum-baslik>{BOLUM_BASLIGI[b.bolum]}</h3>
              <span className="text-xs ml-auto tabular-nums whitespace-nowrap" style={{ color: TEXT_MUTED }} data-bolum-ozet>
                {b.adet} sipariş · {sayiGoster(b.mt, 2)} MT · {b.konteyner} kont. · {tutarlar}
              </span>
            </div>
            {b.adet === 0 ? (
              <p className="px-4 py-4 text-sm" style={{ color: TEXT_MUTED }}>Bu bölümde sipariş yok.</p>
            ) : (
              <div className="overflow-x-auto md:overflow-visible">
                <table className="w-full min-w-[820px] md:min-w-0 table-fixed text-[12px]">
                  <colgroup>{SIPARIS_SUTUNLARI.map((c) => <col key={c.basliklar[0]} style={{ width: c.genislik }} />)}</colgroup>
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide align-bottom" style={{ color: TEXT_MUTED }} data-testid="siparis-baslik">
                      {SIPARIS_SUTUNLARI.map((c) => (
                        <th key={c.basliklar[0]} className={`px-2 py-2 font-semibold leading-tight ${c.sag ? "text-right" : ""}`}>
                          {c.basliklar.map((x, i) => <span key={x} className={`block ${i ? "font-normal" : ""}`}>{x}</span>)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.bolum === "rezervasyon" && sevkler.length > 0 && (
                      <tr className="border-t" style={{ borderColor: CARD_BORDER }}>
                        <td colSpan={11} className="px-3 py-2">
                          <button type="button" onClick={() => setSevkAcik(!sevkAcik)} className="text-xs font-medium" style={{ color: "#6EE7B7" }} data-sevk-ac>
                            {sevkAcik ? `Sevk edilen ${sevkler.length} siparişi gizle ▲` : `Sevk edilen ${sevkler.length} sipariş gizli — göster ▼`}
                          </button>
                        </td>
                      </tr>
                    )}
                    <SiparisSatirlari satirlar={gorunen} yetkili={yetkili} onAc={onAc} onGeriAl={onGeriAl} mesgul={mesgul} />
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** "Ön ödeme alındı" penceresi: tutar (zorunlu), para birimi, ödeme tarihi. */
function OnOdemeFormu({ s, onKapat, onKaydet }: { s: SiparisSatiri; onKapat: () => void; onKaydet: (tutar: number, para: string, tarih: string) => Promise<string | null> }) {
  const bugun = bugunIst();
  const [tutar, setTutar] = useState(s.on_odeme_tutar !== null ? String(s.on_odeme_tutar).replace(".", ",") : "");
  const [para, setPara] = useState(s.on_odeme_para || (s.para_birimi === "EUR" ? "EUR" : "USD"));
  const [tarih, setTarih] = useState(s.on_odeme_tarihi || bugun);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const sayi = Number(tutar.replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(sayi) || sayi <= 0) { setHata("Ön ödeme tutarını girin."); return; }
    if (!tarih || tarih > bugun) { setHata("Ödeme tarihi bugünden ileri olamaz."); return; }
    setKaydediliyor(true); setHata(null);
    const h = await onKaydet(Math.round(sayi * 100) / 100, para, tarih);
    setKaydediliyor(false);
    if (h) setHata(h);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-labelledby="onodeme-baslik"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !kaydediliyor) onKapat(); }} data-testid="onodeme-formu">
      <form onSubmit={gonder} className="w-full max-w-md rounded-xl border shadow-xl" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <p id="onodeme-baslik" className="text-sm font-semibold text-white">Ön ödeme alındı</p>
          <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
            {s.proforma_no} · {s.firma}{s.tutar !== null ? ` · proforma ${sayiGoster(s.tutar, 2)} ${paraIsareti(s.para_birimi)}` : ""}
          </p>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <label className="text-xs" style={{ color: TEXT_MUTED }}>Alınan tutar
              <input autoFocus inputMode="decimal" value={tutar} onChange={(e) => setTutar(e.target.value)} placeholder="ör. 14.580" aria-label="Ön ödeme tutarı"
                className="mt-1 h-9 w-full rounded-lg border bg-transparent px-3 text-sm text-white tabular-nums" style={{ borderColor: CARD_BORDER }} />
            </label>
            <label className="text-xs" style={{ color: TEXT_MUTED }}>Para birimi
              <select value={para} onChange={(e) => setPara(e.target.value)} aria-label="Para birimi"
                className="mt-1 h-9 w-full rounded-lg border px-2 text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
                <option value="USD">USD</option><option value="EUR">EUR</option><option value="TRY">TRY</option>
              </select>
            </label>
          </div>
          <label className="block text-xs" style={{ color: TEXT_MUTED }}>Ödeme tarihi
            <input type="date" value={tarih} max={bugun} onChange={(e) => setTarih(e.target.value)} aria-label="Ödeme tarihi"
              className="mt-1 h-9 w-full rounded-lg border bg-transparent px-3 text-sm text-white" style={{ borderColor: CARD_BORDER, colorScheme: "dark" }} />
          </label>
          <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
            Kaydedince sipariş &quot;Ön ödemesi alınmış&quot; bölümüne geçer ve yükleme planında &quot;Rezervasyon alınmadı&quot; olarak görünür.
          </p>
          {hata && <p className="text-xs text-red-400 flex items-center gap-1.5" role="alert"><AlertTriangle size={13} />{hata}</p>}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: CARD_BORDER }}>
          <button type="button" onClick={onKapat} disabled={kaydediliyor} className="px-3 py-2 rounded-lg border text-xs font-medium disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
          <button type="submit" disabled={kaydediliyor} data-testid="onodeme-kaydet" className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
            {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Yukleme plani tablosu - EKRANA SIGAR (yatay kaydirma yok, 11.11.2026): operasyonun 16 basligi korunur, birbiriyle
 * ilgili basliklar ayni sutunda ust / alt satir olarak durur (ör. ACENTE / LİMAN). Excel indir 16 ayri sutun (birebir).
 */
const PLAN_SUTUNLARI: Array<{ basliklar: string[]; genislik: string; sag?: boolean }> = [
  { basliklar: ["MÜŞTERİ"], genislik: "13%" },
  { basliklar: ["CİNSİ", "ÇUVAL MARKASI · AMBALAJ"], genislik: "17%" },
  { basliklar: ["KON.AD."], genislik: "5%", sag: true },
  { basliklar: ["VARIŞ LİMANI"], genislik: "9%" },
  { basliklar: ["ACENTE", "LİMAN"], genislik: "10%" },
  { basliklar: ["EKİPMAN", "BOOKING NO"], genislik: "11%" },
  { basliklar: ["BOŞ EKİPMAN ALIM TARİHİ", "ARDİYESİZ GİRİŞ"], genislik: "9%" },
  { basliklar: ["TALİMAT CUT OFF", "BEYAN CUT OFF"], genislik: "9%" },
  { basliklar: ["ETD"], genislik: "8%" },
  { basliklar: ["GEMİ ADI", "SEFERİ"], genislik: "10%" },
];
/** "2026-11-13T10:00:00+00:00" -> "13.11 10:00" (cut-off; yil hafta basligindan belli) */
const kisaCutoff = (iso: string | null) => { const t = trTarih(iso); return t ? `${t.slice(0, 5)}${saat(iso) ? ` ${saat(iso)}` : ""}` : "—"; };

function PlanTablosu({ bloklar, bugun }: { bloklar: PlanBlogu[]; bugun: string }) {
  const alt = { color: TEXT_MUTED };
  const hucre = "px-2 py-1.5 align-top break-words";
  return (
    <div className="space-y-3">
      {bloklar.map((b) => (
        <div key={b.anahtar} className="rounded-xl border overflow-x-auto md:overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="plan-haftasi">
          <div className="px-4 py-2 text-sm font-semibold flex flex-wrap items-center gap-x-3 gap-y-0.5" style={{ backgroundColor: ROW_HEADER_BG, color: "#FFFFFF", borderLeft: `3px solid ${b.anahtar === "bekleyen" ? "#FBBF24" : b.anahtar === "son" ? "#6EE7B7" : ACCENT}` }}>
            <Ship size={14} style={{ color: ACCENT }} /> <span data-hafta>{b.etiket}</span>
            <span className="text-xs font-normal" style={alt}>{b.satirlar.length} booking · {b.konteyner} konteyner</span>
          </div>
          <table className="w-full min-w-[820px] md:min-w-0 table-fixed text-[12px]">
            <colgroup>{PLAN_SUTUNLARI.map((c) => <col key={c.basliklar[0]} style={{ width: c.genislik }} />)}</colgroup>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide align-bottom" style={alt} data-testid="plan-baslik">
                {PLAN_SUTUNLARI.map((c) => (
                  <th key={c.basliklar[0]} className={`px-2 pt-2 pb-1.5 font-semibold leading-tight ${c.sag ? "text-right" : ""}`}>
                    {c.basliklar.map((x, i) => <span key={x} className={`block ${i ? "font-normal" : ""}`}>{x}</span>)}
                  </th>
                ))}
              </tr>
            </thead>
            {b.satirlar.map((p) => {
              const gecti = !!(p.etd && p.etd.slice(0, 10) < bugun);
              const k = planKalemleri(p);
              return (
                <tbody key={p.anahtar} className="border-t" style={{ borderColor: CARD_BORDER, opacity: gecti && b.anahtar !== "son" ? 0.72 : 1 }} data-testid="plan-satiri" data-booking={p.booking_no || ""}>
                  <tr>
                    <td className={`${hucre} text-white font-medium`}>
                      {p.musteri || "—"}
                      {p.kaynak === "sistem" ? <span className="ml-1 align-middle px-1 py-0.5 rounded text-[9.5px] font-medium bg-sky-500/15 text-sky-300" title="Excel'de yok; rezervasyondan">sistemden</span> : null}
                      {p.kaynak === "siparis" && p.proforma_no ? <span className="block text-[11px] font-normal" style={alt}>{p.proforma_no}</span> : null}
                    </td>
                    <td className={hucre} style={{ color: "#C9D1DC" }}>
                      {k.map((x, i) => (
                        <span key={i} className={`block ${i ? "mt-1" : ""}`}>
                          {k.length > 1 && x.konteyner !== null ? <span className="text-white tabular-nums">{x.konteyner}× </span> : null}{x.cinsi || "—"}
                          <span className="block text-[11px]" style={alt}>{[x.cuval_markasi, x.ambalaj].filter(Boolean).join(" · ") || "—"}</span>
                        </span>
                      ))}
                    </td>
                    <td className={`${hucre} text-right tabular-nums text-white font-medium`}>{sayiGoster(p.konteyner)}</td>
                    <td className={hucre} style={{ color: "#C9D1DC" }}>{p.varis_limani || "—"}</td>
                    <td className={hucre} style={{ color: "#C9D1DC" }}>{p.acente || "—"}<span className="block text-[11px]" style={alt}>{p.liman || "—"}</span></td>
                    <td className={hucre} style={{ color: "#C9D1DC" }}>
                      <span className="block">{p.ekipman || p.ekipman_alim_yeri || "—"}</span>
                      {p.kaynak === "siparis"
                        ? <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-300" data-rez-yok>Rezervasyon alınmadı</span>
                        : <span className="block font-mono text-[11px] text-white break-all">{p.booking_no || "—"}</span>}
                    </td>
                    <td className={`${hucre} tabular-nums`} style={{ color: "#C9D1DC" }}>{trTarih(p.bos_ekipman_tarihi) || "—"}<span className="block" style={alt}>{trTarih(p.ardiyesiz_giris) || "—"}</span></td>
                    <td className={`${hucre} tabular-nums`} style={{ color: "#C9D1DC" }}>{kisaCutoff(p.talimat_cutoff)}<span className="block" style={alt}>{kisaCutoff(p.beyan_cutoff)}</span></td>
                    <td className={`${hucre} tabular-nums font-semibold whitespace-nowrap`} style={{ color: gecti ? "#6EE7B7" : "#FFFFFF" }} data-etd>{trTarih(p.etd) || "—"}</td>
                    <td className={hucre} style={{ color: "#C9D1DC" }}>{p.gemi || "—"}<span className="block text-[11px]" style={alt}>{p.sefer || ""}</span></td>
                  </tr>
                </tbody>
              );
            })}
          </table>
        </div>
      ))}
    </div>
  );
}

function SiparisIcerik() {
  const { yetkiler } = useAuth();
  const yetkili = !!(yetkiler.sayfa_yetkileri.proformalar || yetkiler.sayfa_yetkileri.analiz);
  const isaretleyebilir = !!yetkiler.sayfa_yetkileri.proformalar;
  const [sekme, setSekme] = useState<Sekme>("siparis");
  const [siparisler, setSiparisler] = useState<SiparisSatiri[] | null>(null);
  const [plan, setPlan] = useState<PlanSatiri[] | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sevkAcik, setSevkAcik] = useState(false);
  const [onOdemeSatir, setOnOdemeSatir] = useState<SiparisSatiri | null>(null);
  const [planTum, setPlanTum] = useState(false);
  const [arama, setArama] = useState("");
  const [bekleyen, setBekleyen] = useState<string | null>(null);
  const [indiriliyor, setIndiriliyor] = useState(false);
  const [aktarAcik, setAktarAcik] = useState(false);
  const [siparisAktarAcik, setSiparisAktarAcik] = useState(false);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const bugun = bugunIst();

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata(null);
    try {
      const [s, p] = await Promise.all([siparisListesiOku(), yuklemePlaniOku()]);
      setSiparisler(s); setPlan(p);
    } catch (e) { setHata(e instanceof Error ? e.message : "Veri okunamadı."); }
    finally { setYukleniyor(false); }
  }, []);
  useEffect(() => { if (yetkili) yukle(); }, [yetkili, yukle]);

  const ozet = useMemo(() => siparisOzeti(siparisler || []), [siparisler]);
  const q = norm(arama.trim());
  const gorunenSiparis = useMemo(() => {
    let l = siparisler || [];
    if (q) l = l.filter((s) => [s.proforma_no, s.firma, s.urun, s.liman, s.marka, s.booking_no, s.dosya_no, s.bl_no].some((v) => v && norm(v).includes(q)));
    return l;
  }, [siparisler, q]);
  const planBloklariGorunen = useMemo((): PlanBlogu[] => {
    let l = plan || [];
    if (q) l = l.filter((p) => [p.musteri, p.booking_no, p.varis_limani, p.gemi, p.acente, p.cinsi, p.dosya_no, p.proforma_no].some((v) => v && norm(v).includes(q)));
    if (planTum) return planBloklari(l);
    const g = planGorunumu(l, bugun);
    const ozel = (anahtar: string, etiket: string, satirlar: PlanSatiri[]): PlanBlogu[] =>
      satirlar.length ? [{ anahtar, etiket, yil: null, hafta: null, satirlar, konteyner: satirlar.reduce((t, p) => t + (p.konteyner || 0), 0) }] : [];
    return [
      ...ozel("bekleyen", BEKLEYEN_BLOK, planSirala(g.bekleyen)),
      ...ozel("son", `TAMAMLANAN SON ${g.son.length} SEVKİYAT`, g.son),
      ...planBloklari(g.guncel),
    ];
  }, [plan, planTum, q, bugun]);

  const onOdemeKaydetFn = async (s: SiparisSatiri, tutar: number, para: string, tarih: string): Promise<string | null> => {
    if (!s.proforma_no) return "Proforma no yok.";
    try {
      await onOdemeKaydet(s.proforma_no, true, tutar, para, tarih);
      setOnOdemeSatir(null);
      setBilgi(`${s.proforma_no}: ön ödeme kaydedildi (${tutar.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${para}). Sipariş "ön ödemesi alınmış" bölümüne ve yükleme planına eklendi.`);
      await yukle();
      return null;
    } catch (e) { return e instanceof Error ? e.message : "Ön ödeme kaydedilemedi."; }
  };
  const onOdemeGeriAl = async (s: SiparisSatiri) => {
    if (!s.proforma_no) return;
    setBekleyen(s.anahtar); setHata(null);
    try { await onOdemeKaydet(s.proforma_no, false); setBilgi(`${s.proforma_no}: ön ödeme işareti geri alındı.`); await yukle(); }
    catch (e) { setHata(e instanceof Error ? e.message : "Ön ödeme geri alınamadı."); }
    finally { setBekleyen(null); }
  };
  const bolumeGit = (b: string, sevk = false) => {
    setSekme("siparis");
    if (sevk) setSevkAcik(true);
    setTimeout(() => document.getElementById(`bolum-${b}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const excelIndir = async () => {
    if (!siparisler || !plan) return;
    setIndiriliyor(true);
    try {
      const [{ xlsxOlustur }, { siparisSayfasi, planSayfasi }] = await Promise.all([import("@/lib/xlsx-yaz"), import("@/lib/siparis/xlsx")]);
      const blob = await xlsxOlustur([siparisSayfasi(siparisler), planSayfasi(plan, "Yükleme Planı", bugun)]);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Siparis_Listesi_ve_Yukleme_Plani_${bugun.split("-").reverse().join(".")}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { setHata(e instanceof Error ? e.message : "Excel oluşturulamadı."); }
    finally { setIndiriliyor(false); }
  };

  if (!yetkili) return null;
  const sekmeBtn = (k: Sekme, ad: string) => (
    <button type="button" onClick={() => setSekme(k)} role="tab" aria-selected={sekme === k}
      className="h-9 px-4 rounded-lg text-sm font-medium" style={sekme === k ? { backgroundColor: ACCENT, color: "#FFFFFF" } : { color: TEXT_MUTED, border: `1px solid ${CARD_BORDER}` }}>{ad}</button>
  );
  return (
    <div className="max-w-[1400px]">
      <SayfaBasligi
        ikon={<ClipboardList size={20} />}
        baslik="Sipariş Listesi"
        aciklama="Proforma, dosya ve rezervasyonlardan otomatik · elle girilen: ön ödeme · yükleme planı Excel'den aktarılır"
        sag={
          <div className="flex items-center gap-2">
            <button type="button" onClick={excelIndir} disabled={!siparisler || indiriliyor} className="h-9 px-3 inline-flex items-center gap-2 rounded-lg text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
              <Download size={15} /> {indiriliyor ? "Hazırlanıyor…" : "Excel indir"}
            </button>
            <button type="button" onClick={yukle} disabled={yukleniyor} aria-label="Yenile" className="h-9 w-9 inline-flex items-center justify-center rounded-lg border hover:bg-white/[0.04] disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              <RefreshCw size={15} className={yukleniyor ? "animate-spin" : ""} />
            </button>
          </div>
        }
      />
      {hata && (
        <div className="flex items-start gap-2 rounded-lg border px-3 py-2 mb-4 text-sm" style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "#FCA5A5" }} role="alert">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{hata}</span>
        </div>
      )}
      {!siparisler && yukleniyor ? <SayfaYukleniyor /> : siparisler && plan ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
            <OzetKarti testId="ozet-acik" etiket="Açık sipariş" deger={ozet.acikSiparis} alt={`${ozet.acikMt.toLocaleString("tr-TR")} MT · ${ozet.acikKont} kont.`} onClick={() => bolumeGit("rezervasyon")} />
            <OzetKarti testId="ozet-onay" etiket="Ön ödeme / onay bekliyor" deger={ozet.onay} onClick={() => bolumeGit("bekleyen")} />
            <OzetKarti testId="ozet-onodeme" etiket="Ön ödeme alındı · rez. yok" deger={ozet.onOdeme} renk="#93C5FD" onClick={() => bolumeGit("on_odeme")} />
            <OzetKarti testId="ozet-rez" etiket="Rezervasyonlu" deger={ozet.rezervasyonlu} renk="#F4A07C" onClick={() => bolumeGit("rezervasyon")} />
            <OzetKarti testId="ozet-bl" etiket="BL eksik" deger={ozet.blEksik} renk={ozet.blEksik ? "#FCA5A5" : undefined} onClick={() => bolumeGit("rezervasyon", true)} />
            <OzetKarti testId="ozet-tekrar" etiket="Olası tekrar" deger={ozet.olasiTekrar} renk={ozet.olasiTekrar ? "#FCD34D" : undefined} alt="yeniden kesilmiş proforma?" />
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3" role="tablist">
            {sekmeBtn("siparis", "Sipariş Listesi")}
            {sekmeBtn("plan", "Yükleme Planı")}
            <div className="relative ml-auto w-full sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
              <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Proforma, firma, booking, liman ara" aria-label="Ara"
                className="h-9 w-full rounded-lg border bg-transparent pl-8 pr-3 text-sm text-white" style={{ borderColor: CARD_BORDER }} />
            </div>
          </div>

          {sekme === "siparis" ? (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <p className="text-xs" style={{ color: TEXT_MUTED }}>
                  Yeni proforma &quot;Ön ödemesi veya onayı alınmamış&quot; bölümüne düşer → ön ödeme girilince rezervasyon bekleyenlere ve yükleme planına geçer → rezervasyonla üst bölüme taşınır. Her bölümde en güncel en altta.
                </p>
                {isaretleyebilir && (
                  <button type="button" onClick={() => setSiparisAktarAcik(true)} data-testid="siparis-aktar-ac"
                    className="h-8 px-3 ml-auto inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium text-white hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER }}>
                    <Upload size={13} style={{ color: ACCENT }} /> Excel&apos;den içeri aktar
                  </button>
                )}
              </div>
              {bilgi && (
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2 mb-3 text-sm" style={{ borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.08)", color: "#6EE7B7" }} role="status" data-testid="siparis-bilgi">
                  <CheckCircle2 size={15} className="shrink-0" /> <span>{bilgi}</span>
                </div>
              )}
              {siparisAktarAcik && (
                <SiparisExcelAktar onKapat={() => setSiparisAktarAcik(false)} onAktarildi={(m) => { setSiparisAktarAcik(false); setBilgi(m); yukle(); }} />
              )}
              {onOdemeSatir && (
                <OnOdemeFormu s={onOdemeSatir} onKapat={() => setOnOdemeSatir(null)} onKaydet={(t, p, d) => onOdemeKaydetFn(onOdemeSatir, t, p, d)} />
              )}
              {gorunenSiparis.length ? (
                <SiparisBolumleri liste={gorunenSiparis} yetkili={isaretleyebilir} onAc={setOnOdemeSatir} onGeriAl={onOdemeGeriAl} mesgul={bekleyen}
                  sevkAcik={sevkAcik || !!q} setSevkAcik={setSevkAcik} />
              ) : <EmptyState icon={<ClipboardList size={40} />} title={q ? "Aramayla eşleşen sipariş yok" : "Sipariş yok"} />}
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                <button type="button" onClick={() => setPlanTum(false)} className="h-8 px-3 rounded-full text-xs" data-plan-filtre="guncel"
                  style={!planTum ? { backgroundColor: "rgba(244,160,124,0.18)", color: ACCENT, border: `1px solid ${ACCENT}` } : { color: TEXT_MUTED, border: `1px solid ${CARD_BORDER}` }}>Güncel: son 5 sevkiyat + bu hafta ve sonrası</button>
                <button type="button" onClick={() => setPlanTum(true)} className="h-8 px-3 rounded-full text-xs" data-plan-filtre="tum"
                  style={planTum ? { backgroundColor: "rgba(244,160,124,0.18)", color: ACCENT, border: `1px solid ${ACCENT}` } : { color: TEXT_MUTED, border: `1px solid ${CARD_BORDER}` }}>Tüm yıl</button>
                {isaretleyebilir && (
                  <button type="button" onClick={() => setAktarAcik(true)} data-testid="plan-aktar-ac"
                    className="h-8 px-3 ml-auto inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium text-white hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER }}>
                    <Upload size={13} style={{ color: ACCENT }} /> Excel&apos;den içeri aktar
                  </button>
                )}
              </div>
              {bilgi && (
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2 mb-3 text-sm" style={{ borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.08)", color: "#6EE7B7" }} role="status" data-testid="plan-bilgi">
                  <CheckCircle2 size={15} className="shrink-0" /> <span>{bilgi}</span>
                </div>
              )}
              {aktarAcik && (
                <PlanExcelAktar onKapat={() => setAktarAcik(false)} onAktarildi={(m) => { setAktarAcik(false); setBilgi(m); setPlanTum(true); yukle(); }} />
              )}
              {planBloklariGorunen.length ? <PlanTablosu bloklar={planBloklariGorunen} bugun={bugun} /> : <EmptyState icon={<Ship size={40} />} title="Planlı yükleme yok" />}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

export default function SiparislerSayfasi() {
  return (
    <AppShell>
      <SiparisIcerik />
    </AppShell>
  );
}
