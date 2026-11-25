"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, Ship, Plus, AlertTriangle } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { kgYazi, tonYazi, tarihSaatYazi } from "@/lib/ic-piyasa/is-emri";
import { KantarGemi, KantarGemiArac, UNEX_YER, yuzdeYazi } from "@/lib/ic-piyasa/gemi-tahliye";
import { GemiAracFormu } from "@/components/ic-gemi-pencereler";

/**
 * Kantar Paneli > Yurt Ici > Gemi (25.11.2026). Kantarci acik gemi tahliyelerini gorur ve her araci girer:
 * UNEX'e gelen arac = liman fisindeki kg + kantarimizdaki teslim kg (fark otomatik); gemiden satis araci
 * (alici firma) = yalniz liman kg. Veri: kantar_gemi_tahliyeleri / kantar_gemi_son_araclar / ic_gemi_arac_ekle
 * (migration 20261125160000). Fonksiyon yoksa ya da acik gemi yoksa sekme hic gorunmez (acikSayiBildir(null)).
 */
export function KantarGemiTahliye({ yenileTetik = 0, acikSayiBildir }: { yenileTetik?: number; acikSayiBildir?: (n: number | null) => void }) {
  const [gemiler, setGemiler] = useState<KantarGemi[]>([]);
  const [sonlar, setSonlar] = useState<KantarGemiArac[]>([]);
  const [yok, setYok] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [form, setForm] = useState<KantarGemi | null>(null);
  const sira = useRef(0);

  const getir = useCallback(async () => {
    const s = ++sira.current;
    const [g, a] = await Promise.all([supabase.rpc("kantar_gemi_tahliyeleri"), supabase.rpc("kantar_gemi_son_araclar", { p_gun: 2 })]);
    if (s !== sira.current) return;
    const err = g.error || a.error;
    if (err) {
      if (/PGRST202|42883|42501|could not find|does not exist|yetkiniz yok/i.test(`${err.code || ""} ${err.message}`)) { setYok(true); acikSayiBildir?.(null); }
      else setHata(err.message);
      setYukleniyor(false);
      return;
    }
    const liste = (g.data || []) as KantarGemi[];
    setYok(false); setHata(null);
    setGemiler(liste);
    setSonlar((a.data || []) as KantarGemiArac[]);
    setYukleniyor(false);
    acikSayiBildir?.(liste.length ? liste.length : null);
  }, [acikSayiBildir]);

  useEffect(() => { getir(); }, [getir, yenileTetik]);
  useEffect(() => {
    const yenile = () => { if (document.visibilityState === "visible") getir(); };
    const z = window.setInterval(yenile, 60_000);
    document.addEventListener("visibilitychange", yenile);
    window.addEventListener("online", yenile);
    return () => { window.clearInterval(z); document.removeEventListener("visibilitychange", yenile); window.removeEventListener("online", yenile); };
  }, [getir]);

  if (yok) return null;
  if (yukleniyor) return <div className="flex items-center gap-2 text-sm p-4" style={{ color: TEXT_MUTED }}><Loader2 size={14} className="animate-spin" /> Gemiler yükleniyor…</div>;

  return (
    <div className="flex flex-col gap-3" data-testid="kantar-gemi">
      {hata && <p className="text-xs text-amber-300 flex items-center gap-1.5"><AlertTriangle size={13} /> Liste yenilenemedi: {hata}</p>}
      {!gemiler.length ? (
        <p className="text-sm p-4" style={{ color: TEXT_MUTED }}>Tahliyesi süren gemi yok.</p>
      ) : gemiler.map((g) => {
        const yuzde = g.bl_kg > 0 ? (Number(g.gelen_kg) * 100) / Number(g.bl_kg) : 0;
        const gemiSonlar = sonlar.filter((x) => x.gemi_id === g.id).slice(0, 12);
        return (
          <section key={g.id} className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} aria-label={g.gemi_adi}>
            <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 border-b" style={{ borderColor: CARD_BORDER }}>
              <Ship size={15} style={{ color: ACCENT }} />
              <div className="min-w-0 mr-auto">
                <p className="text-sm font-bold text-white leading-tight">{g.gemi_adi}</p>
                <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{[g.urun, g.tahliye_limani].filter(Boolean).join(" · ")} · bugün {g.bugun_arac} araç</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-white tabular-nums">{tonYazi(g.gelen_kg)} <span className="font-normal text-xs" style={{ color: TEXT_MUTED }}>/ {tonYazi(g.bl_kg)}</span></p>
                <p className="text-[11px] tabular-nums" style={{ color: TEXT_MUTED }}>{yuzdeYazi(yuzde, 1)} · {g.gelen_arac} araç</p>
              </div>
              <button onClick={() => setForm(g)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-bold text-white hover:brightness-110" style={{ backgroundColor: ACCENT }} data-testid="kantar-gemi-arac-ekle">
                <Plus size={13} /> Araç ekle
              </button>
            </div>
            <div className="h-1" style={{ backgroundColor: "#1E2530" }}><div className="h-full" style={{ width: `${Math.min(100, yuzde)}%`, backgroundColor: ACCENT }} /></div>
            <table className="w-full table-fixed text-left border-collapse text-xs">
              <colgroup><col /><col className="w-16" /><col className="w-24" /><col className="w-24" /></colgroup>
              <thead style={{ backgroundColor: ROW_HEADER_BG }}>
                <tr>{["Gittiği yer", "Araç", "Liman", "Teslim / Kalan"].map((b, i) => <th key={b} className={`px-3 py-1.5 font-semibold uppercase tracking-wide text-[10px] ${i ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>)}</tr>
              </thead>
              <tbody>
                <tr className="border-t" style={{ borderColor: CARD_BORDER }}>
                  <td className="px-3 py-1.5 text-white font-semibold">UNEX (depo)</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-white">{g.unex_arac}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-white">{kgYazi(g.unex_liman_kg)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-white">{kgYazi(g.unex_teslim_kg)}</td>
                </tr>
                {g.alicilar.map((l) => {
                  const kalan = Number(l.miktar_kg) - Number(l.gelen_kg);
                  return (
                    <tr key={l.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                      <td className="px-3 py-1.5 text-white truncate" title={l.firma}>{l.firma}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-white">{l.arac}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-white">{kgYazi(l.gelen_kg)}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${kalan < 0 ? "text-sky-400" : "text-amber-300"}`}>{kalan < 0 ? `Fazla ${kgYazi(-kalan)}` : `Kalan ${kgYazi(kalan)}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {gemiSonlar.length > 0 && (
              <div className="border-t" style={{ borderColor: CARD_BORDER }}>
                <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>Son girilenler</p>
                <table className="w-full table-fixed text-left border-collapse text-xs mb-1">
                  <colgroup><col className="w-28" /><col /><col className="w-20" /><col className="w-20" /><col className="w-16" /></colgroup>
                  <tbody>
                    {gemiSonlar.map((a) => {
                      const fark = a.teslim_kg !== null ? Number(a.teslim_kg) - Number(a.liman_kg) : null;
                      return (
                        <tr key={a.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                          <td className="px-3 py-1 font-semibold text-white whitespace-nowrap">
                            {a.plaka}{a.uyari_var && <AlertTriangle size={11} className="inline ml-1 text-amber-400" />}
                          </td>
                          <td className="px-3 py-1 truncate" style={{ color: TEXT_MUTED }} title={tarihSaatYazi(a.olusturma)}>{a.firma || UNEX_YER} · {tarihSaatYazi(a.olusturma).slice(-5)}</td>
                          <td className="px-3 py-1 text-right tabular-nums text-white">{Number(a.liman_kg).toLocaleString("tr-TR")}</td>
                          <td className="px-3 py-1 text-right tabular-nums text-white">{a.teslim_kg !== null ? Number(a.teslim_kg).toLocaleString("tr-TR") : "—"}</td>
                          <td className={`px-3 py-1 text-right tabular-nums ${fark !== null && Math.abs(fark) > 300 ? "text-amber-400" : ""}`} style={fark === null || Math.abs(fark) <= 300 ? { color: TEXT_MUTED } : undefined}>{fark === null ? "" : fark.toLocaleString("tr-TR")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
      {form && (
        <GemiAracFormu gemi={form} alicilar={form.alicilar} kaynak="kantar" kapat={() => setForm(null)} kaydedildi={() => { setForm(null); getir(); }} />
      )}
    </div>
  );
}
