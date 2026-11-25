"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { Loader2, Ship, AlertTriangle, Clock, Scale, CheckCircle2 } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { kgYazi, tonYazi, tarihSaatYazi } from "@/lib/ic-piyasa/is-emri";
import { trSayiOku, plakaBicimle } from "@/lib/ic-piyasa/irsaliye-oku";
import { KantarFissizTartim, KantarGemi, KantarGemiArac, UNEX_YER, gemiHataMesaji, yuzdeYazi } from "@/lib/ic-piyasa/gemi-tahliye";
import { GemiHizliGiris } from "@/components/ic-gemi-pencereler";

/**
 * Kantar Paneli > Yurt Ici > Gemi (25.11.2026). Her acik gemi icin HEP ACIK hizli satir (plaka -> Enter -> liman kg -> Enter).
 * Iki asama: soforun WhatsApp'tan attigi liman fisi onden girilir (UNEX araci "yolda"); arac fabrikada BAYKON'da tartilinca
 * teslim kg otomatik eslesir (ic_gemi_kantar_esle: plaka/dorse + kg yakinligi). Eslesmeyen yoldaki araca teslim elle yazilabilir;
 * fisi gelmemis tartimlar (firma alaninda gemi adi) listelenir, liman kg yazilinca araca baglanir.
 * Fonksiyon yoksa ya da acik gemi yoksa sekme gorunmez (acikSayiBildir(null)).
 */
const kucukGirdi = "w-24 px-2 py-1 rounded-md border text-xs text-white text-right tabular-nums bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const saat = (iso: string | null) => (iso ? tarihSaatYazi(iso).slice(-5) : "");

export function KantarGemiTahliye({ yenileTetik = 0, acikSayiBildir }: { yenileTetik?: number; acikSayiBildir?: (n: number | null) => void }) {
  const [gemiler, setGemiler] = useState<KantarGemi[]>([]);
  const [sonlar, setSonlar] = useState<KantarGemiArac[]>([]);
  const [fissiz, setFissiz] = useState<Record<string, KantarFissizTartim[]>>({});
  const [yok, setYok] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const sira = useRef(0);

  const getir = useCallback(async () => {
    const s = ++sira.current;
    // Once kantar tartimlarini yoldaki araclarla esle (hata verse de liste okunur)
    await supabase.rpc("ic_gemi_kantar_esle");
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
    const f: Record<string, KantarFissizTartim[]> = {};
    await Promise.all(liste.map(async (x) => {
      const r = await supabase.rpc("kantar_gemi_fissiz_tartimlar", { p_gemi: x.id });
      f[x.id] = r.error ? [] : ((r.data || []) as KantarFissizTartim[]);
    }));
    if (s !== sira.current) return;
    setYok(false); setHata(null);
    setGemiler(liste);
    setSonlar((a.data || []) as KantarGemiArac[]);
    setFissiz(f);
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
      ) : gemiler.map((g) => (
        <GemiKarti key={g.id} g={g} araclar={sonlar.filter((x) => x.gemi_id === g.id)} fissiz={fissiz[g.id] || []} yenile={getir} />
      ))}
    </div>
  );
}

function GemiKarti({ g, araclar, fissiz, yenile }: { g: KantarGemi; araclar: KantarGemiArac[]; fissiz: KantarFissizTartim[]; yenile: () => void }) {
  const yuzde = g.bl_kg > 0 ? (Number(g.gelen_kg) * 100) / Number(g.bl_kg) : 0;
  const yolda = araclar.filter((a) => !a.alici_id && a.teslim_kg === null).sort((a, b) => (a.olusturma < b.olusturma ? -1 : 1));
  const son = araclar.filter((a) => !(!a.alici_id && a.teslim_kg === null)).slice(0, 10);
  return (
    <section className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} aria-label={g.gemi_adi}>
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 border-b" style={{ borderColor: CARD_BORDER }}>
        <Ship size={15} style={{ color: ACCENT }} />
        <div className="min-w-0 mr-auto">
          <p className="text-sm font-bold text-white leading-tight">{g.gemi_adi}</p>
          <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{[g.urun, g.tahliye_limani].filter(Boolean).join(" · ")} · bugün {g.bugun_arac} araç</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-white tabular-nums">{tonYazi(g.gelen_kg)} <span className="font-normal text-xs" style={{ color: TEXT_MUTED }}>/ {tonYazi(g.bl_kg)}</span></p>
          <p className="text-[11px] tabular-nums" style={{ color: TEXT_MUTED }}>{yuzdeYazi(yuzde, 1)} · {g.gelen_arac} araç{g.yolda_arac ? ` · ${g.yolda_arac} yolda` : ""}</p>
        </div>
      </div>
      <div className="h-1" style={{ backgroundColor: "#1E2530" }}><div className="h-full" style={{ width: `${Math.min(100, yuzde)}%`, backgroundColor: ACCENT }} /></div>

      <div className="p-3 flex flex-col gap-3">
        <GemiHizliGiris gemi={g} alicilar={g.alicilar} kaynak="kantar" kaydedildi={yenile} testId={`kantar-gemi-hizli-${g.id.slice(0, 8)}`} />

        {/* Yolda: liman fisi girildi, kantar tartimi bekleniyor */}
        {yolda.length > 0 && (
          <div className="rounded-lg border" style={{ borderColor: "rgba(245,158,11,0.35)" }} data-testid="kantar-gemi-yolda">
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300 flex items-center gap-1.5"><Clock size={11} /> Yolda · kantar tartımı bekleniyor ({yolda.length})</p>
            <table className="w-full table-fixed text-left border-collapse text-xs">
              <colgroup><col className="w-28" /><col /><col className="w-20" /><col className="w-32" /></colgroup>
              <tbody>
                {yolda.map((a) => (
                  <tr key={a.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                    <td className="px-3 py-1 font-semibold text-white whitespace-nowrap">{a.plaka}</td>
                    <td className="px-3 py-1 truncate" style={{ color: TEXT_MUTED }}>fiş {saat(a.olusturma)}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-white">{Number(a.liman_kg).toLocaleString("tr-TR")}</td>
                    <td className="px-2 py-1 text-right"><TeslimGirdisi arac={a} yenile={yenile} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Fisi gelmemis tartimlar */}
        {fissiz.length > 0 && (
          <div className="rounded-lg border" style={{ borderColor: "rgba(56,189,248,0.35)" }} data-testid="kantar-gemi-fissiz">
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-300 flex items-center gap-1.5"><Scale size={11} /> Tartıldı · liman fişi gelmedi ({fissiz.length})</p>
            <table className="w-full table-fixed text-left border-collapse text-xs">
              <colgroup><col className="w-28" /><col /><col className="w-20" /><col className="w-32" /></colgroup>
              <tbody>
                {fissiz.map((t) => (
                  <tr key={t.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                    <td className="px-3 py-1 font-semibold text-white whitespace-nowrap">{plakaBicimle(t.plaka)}</td>
                    <td className="px-3 py-1 truncate" style={{ color: TEXT_MUTED }} title={t.firma || ""}>kantar #{t.kayit_no} · {saat(t.cikis)}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-white">{Number(t.net_kg).toLocaleString("tr-TR")}</td>
                    <td className="px-2 py-1 text-right"><FissizGirdisi gemiId={g.id} tartim={t} yenile={yenile} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Ozet: UNEX + satislar */}
        <table className="w-full table-fixed text-left border-collapse text-xs rounded-lg overflow-hidden">
          <colgroup><col /><col className="w-14" /><col className="w-24" /><col className="w-28" /></colgroup>
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

        {son.length > 0 && (
          <div>
            <p className="pb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>Son girilenler</p>
            <table className="w-full table-fixed text-left border-collapse text-xs">
              <colgroup><col className="w-28" /><col /><col className="w-20" /><col className="w-20" /><col className="w-16" /></colgroup>
              <tbody>
                {son.map((a) => {
                  const fark = a.teslim_kg !== null ? Number(a.teslim_kg) - Number(a.liman_kg) : null;
                  return (
                    <tr key={a.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                      <td className="px-3 py-1 font-semibold text-white whitespace-nowrap">{a.plaka}{a.uyari_var && <AlertTriangle size={11} className="inline ml-1 text-amber-400" />}</td>
                      <td className="px-3 py-1 truncate" style={{ color: TEXT_MUTED }} title={tarihSaatYazi(a.olusturma)}>
                        {a.firma || UNEX_YER} · {saat(a.olusturma)}
                        {a.teslim_kaynak === "kantar" && <span className="ml-1 text-emerald-400/80">· kantar{a.kantar_kayit_no ? ` #${a.kantar_kayit_no}` : ""}</span>}
                        {a.teslim_kaynak === "elle" && <span className="ml-1">· elle</span>}
                      </td>
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
      </div>
    </section>
  );
}

/** Yoldaki araca teslim kg elle (kantar eslesmediyse): yaz + Enter */
function TeslimGirdisi({ arac, yenile }: { arac: KantarGemiArac; yenile: () => void }) {
  const { showToast } = useToast();
  const [deger, setDeger] = useState("");
  const [mesgul, setMesgul] = useState(false);
  const gonder = async () => {
    const kg = trSayiOku(deger);
    if (!kg || kg < 1000 || kg > 60000) { showToast("Teslim kg 1.000 - 60.000 arasında olmalı.", "error"); return; }
    setMesgul(true);
    const { error } = await supabase.rpc("ic_gemi_teslim_gir", { p_id: arac.id, p_teslim: kg });
    setMesgul(false);
    if (error) { showToast(gemiHataMesaji(error), "error"); return; }
    showToast(`${arac.plaka}: teslim ${kg.toLocaleString("tr-TR")} kg (fark ${(kg - Number(arac.liman_kg)).toLocaleString("tr-TR")}).`, "success");
    setDeger("");
    yenile();
  };
  return (
    <span className="inline-flex items-center gap-1">
      {mesgul && <Loader2 size={12} className="animate-spin" style={{ color: TEXT_MUTED }} />}
      <input value={deger} onChange={(e) => setDeger(e.target.value.replace(/[^0-9.,]/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); gonder(); } }}
        placeholder="elle teslim" inputMode="numeric" className={kucukGirdi} style={{ borderColor: CARD_BORDER }} aria-label={`${arac.plaka} teslim kg`} />
    </span>
  );
}

/** Fisi gelmemis tartim: liman kg yaz + Enter -> arac olusur, tartima baglanir */
function FissizGirdisi({ gemiId, tartim, yenile }: { gemiId: string; tartim: KantarFissizTartim; yenile: () => void }) {
  const { showToast } = useToast();
  const [deger, setDeger] = useState("");
  const [mesgul, setMesgul] = useState(false);
  const gonder = async () => {
    const kg = trSayiOku(deger);
    if (!kg || kg < 1000 || kg > 60000) { showToast("Liman kg 1.000 - 60.000 arasında olmalı.", "error"); return; }
    setMesgul(true);
    const { error } = await supabase.rpc("ic_gemi_arac_ekle", {
      p_veri: { gemi_id: gemiId, plaka: plakaBicimle(tartim.plaka), liman_kg: kg, kantar_tartim_id: tartim.id, kaynak: "kantar" }, p_kaydet: true,
    });
    setMesgul(false);
    if (error) { showToast(gemiHataMesaji(error), "error"); return; }
    showToast(`${plakaBicimle(tartim.plaka)} kaydedildi: liman ${kg.toLocaleString("tr-TR")} · teslim ${Number(tartim.net_kg).toLocaleString("tr-TR")} kg.`, "success");
    setDeger("");
    yenile();
  };
  return (
    <span className="inline-flex items-center gap-1">
      {mesgul ? <Loader2 size={12} className="animate-spin" style={{ color: TEXT_MUTED }} /> : <CheckCircle2 size={12} className="opacity-0" />}
      <input value={deger} onChange={(e) => setDeger(e.target.value.replace(/[^0-9.,]/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); gonder(); } }}
        placeholder="liman kg" inputMode="numeric" className={kucukGirdi} style={{ borderColor: CARD_BORDER }} aria-label={`${tartim.plaka} liman kg`} />
    </span>
  );
}
