"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { Loader2, Ship, AlertTriangle, Clock, Scale, CheckCircle2, Plus } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { kgYazi, tonYazi, tarihSaatYazi } from "@/lib/ic-piyasa/is-emri";
import { trSayiOku, plakaBicimle } from "@/lib/ic-piyasa/irsaliye-oku";
import { KantarGemi, KantarGemiArac, UNEX_YER, gemiHataMesaji, yuzdeYazi } from "@/lib/ic-piyasa/gemi-tahliye";
import { GemiHizliGiris, GemiLimanExcelYukle } from "@/components/ic-gemi-pencereler";
import { GemiLimanBekleyenListesi } from "@/components/gemi-liman-bekleyen";

/**
 * Kantar Paneli > Yurt Ici > Gemi (25.11.2026). Her acik gemi icin HEP ACIK hizli satir (plaka -> Enter -> liman kg -> Enter).
 * 25.11.2026 gece - FABRIKA ESASLI: kantarda firma alanina gemi adi yazilan her tartim otomatik UNEX araci olur. Liman
 * Excel'i istenen zamanda yuklenir; fisler saat + agirlikla toplu eslesir (ic_gemi_kantar_esle). Belirsiz /
 * kural disi araclar "Liman fisi bekleyen" listesinde operator onayi bekler. WhatsApp fisi icin "Elle arac" (yolda) korunur.
 * Fonksiyon yoksa ya da acik gemi yoksa sekme gorunmez (acikSayiBildir(null)).
 */
const kucukGirdi = "w-24 px-2 py-1 rounded-md border text-xs text-white text-right tabular-nums bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const saat = (iso: string | null) => (iso ? tarihSaatYazi(iso).slice(-5) : "");

export function KantarGemiTahliye({ yenileTetik = 0, acikSayiBildir }: { yenileTetik?: number; acikSayiBildir?: (n: number | null) => void }) {
  const [gemiler, setGemiler] = useState<KantarGemi[]>([]);
  const [sonlar, setSonlar] = useState<KantarGemiArac[]>([]);
  const [tetik, setTetik] = useState(0);
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
    setYok(false); setHata(null);
    setGemiler(liste);
    setSonlar((a.data || []) as KantarGemiArac[]);
    setTetik((x) => x + 1);
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
        <GemiKarti key={g.id} g={g} araclar={sonlar.filter((x) => x.gemi_id === g.id)} tetik={tetik} yenile={getir} />
      ))}
    </div>
  );
}

function GemiKarti({ g, araclar, tetik, yenile }: { g: KantarGemi; araclar: KantarGemiArac[]; tetik: number; yenile: () => void }) {
  const yuzde = g.bl_kg > 0 ? (Number(g.gelen_kg) * 100) / Number(g.bl_kg) : 0;
  const [elle, setElle] = useState(false);
  const [yoldaAcik, setYoldaAcik] = useState(false);
  const [bekleyenAcik, setBekleyenAcik] = useState(false);
  const bekleyenSayi = Number(g.liman_bekleyen_arac || 0);
  const yolda = araclar.filter((a) => !a.alici_id && a.teslim_kg === null)
    .sort((a, b) => ((a.liman_cikis || a.olusturma) < (b.liman_cikis || b.olusturma) ? -1 : 1));
  // 25.11.2026 kullanici: "her zaman son tartilmis 5 arac gozuksun" (teslimi gelen UNEX - liman fisi bekleyen dahil - + gemiden satis, en yeni ustte)
  const sonTartilan = araclar.filter((a) => a.teslim_kg !== null || a.alici_id)
    .sort((a, b) => ((b.teslim_zamani || b.liman_cikis || b.olusturma) > (a.teslim_zamani || a.liman_cikis || a.olusturma) ? 1 : -1))
    .slice(0, 5);
  const yoldaKg = yolda.reduce((t, a) => t + Number(a.liman_kg ?? 0), 0);
  const cip = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold hover:bg-white/5";
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
          <p className="text-[11px] tabular-nums" style={{ color: TEXT_MUTED }}>{yuzdeYazi(yuzde, 1)} · {g.gelen_arac} araç · {UNEX_YER} teslim {tonYazi(g.unex_teslim_kg)}</p>
        </div>
      </div>
      <div className="h-1" style={{ backgroundColor: "#1E2530" }}><div className="h-full" style={{ width: `${Math.min(100, yuzde)}%`, backgroundColor: ACCENT }} /></div>

      <div className="p-3 flex flex-col gap-3">
        {/* Islemler: liman Excel'i (asil yol) + elle arac (WhatsApp fisi) + durum cipleri */}
        <div className="flex flex-wrap items-center gap-2">
          <GemiLimanExcelYukle gemi={g} kaydedildi={yenile} kucuk testId={`kantar-gemi-excel-${g.id.slice(0, 8)}`} />
          <button type="button" onClick={() => setElle((x) => !x)} className={cip} style={{ borderColor: CARD_BORDER, color: elle ? "white" : TEXT_MUTED }} aria-expanded={elle}>
            <Plus size={12} /> Elle araç
          </button>
          {yolda.length > 0 && (
            <button type="button" onClick={() => setYoldaAcik((x) => !x)} className={cip} style={{ borderColor: "rgba(245,158,11,0.45)", color: "#FCD34D" }} aria-expanded={yoldaAcik} data-testid="kantar-gemi-yolda-cip">
              <Clock size={12} /> Yolda {yolda.length} araç · {tonYazi(yoldaKg)}
            </button>
          )}
          {bekleyenSayi > 0 && (
            <button type="button" onClick={() => setBekleyenAcik((x) => !x)} className={cip} style={{ borderColor: "rgba(56,189,248,0.45)", color: "#7DD3FC" }} aria-expanded={bekleyenAcik} data-testid="kantar-gemi-liman-bekleyen-cip">
              <Scale size={12} /> Liman fişi bekleyen {bekleyenSayi} · {tonYazi(g.liman_bekleyen_kg || 0)}
            </button>
          )}
        </div>

        {elle && <GemiHizliGiris gemi={g} alicilar={g.alicilar} kaynak="kantar" kaydedildi={yenile} testId={`kantar-gemi-hizli-${g.id.slice(0, 8)}`} />}

        {/* SON TARTILAN 5 ARAC */}
        <div className="rounded-lg border overflow-hidden" style={{ borderColor: CARD_BORDER }} data-testid="kantar-gemi-son5">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: TEXT_MUTED, backgroundColor: ROW_HEADER_BG }}>
            <CheckCircle2 size={11} className="text-emerald-400" /> Son tartılan 5 araç
          </p>
          {sonTartilan.length === 0 ? (
            <p className="px-3 py-3 text-xs" style={{ color: TEXT_MUTED }}>Henüz tartılan araç yok. Kantarda firma alanına gemi adı yazılan araçlar tartıldıkça burada görünür.</p>
          ) : (
            <table className="w-full table-fixed text-left border-collapse text-xs">
              <colgroup><col className="w-14" /><col /><col className="w-20" /><col className="w-20" /><col className="w-16" /></colgroup>
              <thead>
                <tr>{["Saat", "Plaka · Gittiği yer", "Liman", "Teslim", "Fark"].map((b, i) => <th key={b} className={`px-3 py-1 font-semibold uppercase tracking-wide text-[9px] ${i >= 2 ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>)}</tr>
              </thead>
              <tbody>
                {sonTartilan.map((a) => {
                  const fark = a.teslim_kg !== null && a.liman_kg !== null ? Number(a.teslim_kg) - Number(a.liman_kg) : null;
                  return (
                    <tr key={a.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                      <td className="px-3 py-1.5 tabular-nums" style={{ color: TEXT_MUTED }}>{saat(a.teslim_zamani || a.liman_cikis || a.olusturma)}</td>
                      <td className="px-3 py-1.5 truncate">
                        <span className="font-semibold text-white">{a.plaka}</span>
                        {a.kantar_plaka && plakaBicimle(a.kantar_plaka) !== a.plaka && <span style={{ color: TEXT_MUTED }} title="Kantarımızdaki plaka (dorse)"> · {plakaBicimle(a.kantar_plaka)}</span>}
                        <span style={{ color: TEXT_MUTED }}> · {a.firma || UNEX_YER}</span>
                        {a.uyari_var && <AlertTriangle size={11} className="inline ml-1 text-amber-400" />}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-white">{a.liman_kg !== null ? Number(a.liman_kg).toLocaleString("tr-TR") : <span className="text-sky-300 text-[10px]" title="Liman Excel'i yüklenince eşleşir">fiş bekleniyor</span>}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-white">{a.teslim_kg !== null ? Number(a.teslim_kg).toLocaleString("tr-TR") : "—"}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${fark !== null && Math.abs(fark) > 300 ? "text-amber-400" : "text-emerald-300"}`}>{fark === null ? "" : `${fark > 0 ? "+" : ""}${fark.toLocaleString("tr-TR")}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Yolda: liman cikisi var, kantar tartimi bekleniyor */}
        {yoldaAcik && yolda.length > 0 && (
          <div className="rounded-lg border" style={{ borderColor: "rgba(245,158,11,0.35)" }} data-testid="kantar-gemi-yolda">
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">Yolda · elle girilen fiş, kantar tartımı bekleniyor (otomatik eşleşir; olmazsa teslim kg yazıp Enter)</p>
            <table className="w-full table-fixed text-left border-collapse text-xs">
              <colgroup><col className="w-28" /><col /><col className="w-20" /><col className="w-32" /></colgroup>
              <tbody>
                {yolda.map((a) => (
                  <tr key={a.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                    <td className="px-3 py-1 font-semibold text-white whitespace-nowrap">{a.plaka}</td>
                    <td className="px-3 py-1 truncate" style={{ color: TEXT_MUTED }}>{a.liman_cikis ? `limandan çıkış ${saat(a.liman_cikis)}` : `fiş ${saat(a.olusturma)}`}</td>
                    <td className="px-3 py-1 text-right tabular-nums text-white">{Number(a.liman_kg ?? 0).toLocaleString("tr-TR")}</td>
                    <td className="px-2 py-1 text-right"><TeslimGirdisi arac={a} yenile={yenile} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Kantarda tartildi, liman fisi eslesmedi: aday fisler / elle liman kg */}
        {bekleyenAcik && bekleyenSayi > 0 && (
          <div className="rounded-lg border" style={{ borderColor: "rgba(56,189,248,0.35)" }} data-testid="kantar-gemi-liman-bekleyen">
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-sky-300">Tartıldı · liman fişi bekleniyor (Excel yüklenince kendiliğinden eşleşir; birden çok yakın fiş varsa siz seçin)</p>
            <GemiLimanBekleyenListesi gemiId={g.id} yenileTetik={tetik} degisti={yenile} />
          </div>
        )}

        {/* Gittigi yer ozeti */}
        <table className="w-full table-fixed text-left border-collapse text-xs rounded-lg overflow-hidden">
          <colgroup><col /><col className="w-14" /><col className="w-24" /><col className="w-28" /></colgroup>
          <thead style={{ backgroundColor: ROW_HEADER_BG }}>
            <tr>{["Gittiği yer", "Araç", "Liman", "Teslim / Kalan"].map((b, i) => <th key={b} className={`px-3 py-1.5 font-semibold uppercase tracking-wide text-[10px] ${i ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>)}</tr>
          </thead>
          <tbody>
            <tr className="border-t" style={{ borderColor: CARD_BORDER }}>
              <td className="px-3 py-1.5 text-white font-semibold">{UNEX_YER}</td>
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
