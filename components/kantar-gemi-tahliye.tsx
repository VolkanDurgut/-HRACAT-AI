"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { Loader2, Ship, AlertTriangle, Clock, Scale, Plus, ChevronDown } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { kgYazi, tarihSaatYazi } from "@/lib/ic-piyasa/is-emri";
import { trSayiOku, plakaBicimle } from "@/lib/ic-piyasa/irsaliye-oku";
import { KantarGemi, KantarGemiArac, UNEX_YER, gemiHataMesaji, yuzdeYazi } from "@/lib/ic-piyasa/gemi-tahliye";
import { gemiSlug } from "@/lib/kantar-gorunum";
import { adresiGuncelle, adresParametresi } from "@/lib/url-durumu";
import { GemiHizliGiris, GemiLimanExcelYukle } from "@/components/ic-gemi-pencereler";
import { GemiLimanBekleyenListesi } from "@/components/gemi-liman-bekleyen";

/**
 * Kantar Paneli > GEMI TAHLIYE sekmesi (25.11.2026; 26.11.2026 yeniden tasarim: tam genislik, gemi haplari, tek satir
 * ozet + aksiyon seridi, genis "Son tartilan araclar" tablosu, tek satir gittigi yer ozeti). Secili gemi ?gemi=<slug>.
 * FABRIKA ESASLI: kantarda firma alanina gemi adi yazilan her tartim otomatik UNEX araci olur; liman Excel'i istenen
 * zamanda yuklenir, fisler saat + agirlik + sefer ile toplu eslesir. Belirsizler "Liman fisi bekleyen"de onay bekler.
 * WhatsApp fisi icin "Elle arac" (yolda) korunur. Fonksiyon yoksa / acik gemi yoksa bilgi satiri.
 */
const kucukGirdi = "w-24 px-2 py-1 rounded-md border text-xs text-white text-right tabular-nums bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const saat = (iso: string | null) => (iso ? tarihSaatYazi(iso).slice(-5) : "");
const ton = (kg: number) => (Number(kg) / 1000).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SON_SAYISI = 10;

export function KantarGemiTahliye({ yenileTetik = 0, acikSayiBildir }: { yenileTetik?: number; acikSayiBildir?: (n: number | null) => void }) {
  const [gemiler, setGemiler] = useState<KantarGemi[]>([]);
  const [sonlar, setSonlar] = useState<KantarGemiArac[]>([]);
  const [tetik, setTetik] = useState(0);
  const [yok, setYok] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [seciliSlug, setSeciliSlug] = useState<string | null>(null);
  const sira = useRef(0);

  useEffect(() => { setSeciliSlug(adresParametresi("gemi")); }, []);
  const gemiSec = (g: KantarGemi) => { const s = gemiSlug(g.gemi_adi); setSeciliSlug(s); adresiGuncelle({ gemi: s }); };

  const getir = useCallback(async () => {
    const s = ++sira.current;
    // Once eslestirme (kantar tartimi -> otomatik arac, liman fisleri); hata verse de liste okunur
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

  if (yok) return <p className="text-sm p-4" style={{ color: TEXT_MUTED }}>Gemi tahliye bilgisi okunamadı (yetki yok).</p>;
  if (yukleniyor) return <div className="flex items-center gap-2 text-sm p-4" style={{ color: TEXT_MUTED }}><Loader2 size={14} className="animate-spin" /> Gemiler yükleniyor…</div>;

  const secili = gemiler.find((g) => gemiSlug(g.gemi_adi) === seciliSlug) || gemiler[0] || null;

  return (
    <div className="flex flex-col gap-3" data-testid="kantar-gemi">
      {hata && <p className="text-xs text-amber-300 flex items-center gap-1.5"><AlertTriangle size={13} /> Liste yenilenemedi: {hata}</p>}
      {!secili ? (
        <div className="rounded-xl border p-8 text-center text-sm" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER, color: TEXT_MUTED }}>Tahliyesi süren gemi yok.</div>
      ) : (
        <>
          {/* Gemi haplari */}
          <div role="tablist" aria-label="Gemiler" className="flex flex-wrap items-center gap-1.5" data-testid="kantar-gemi-haplar">
            {gemiler.map((g) => {
              const s = g.id === secili.id;
              return (
                <button key={g.id} type="button" role="tab" aria-selected={s} onClick={() => gemiSec(g)} data-gemi={gemiSlug(g.gemi_adi)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${s ? "text-white" : "hover:bg-white/5"}`}
                  style={s ? { backgroundColor: "rgba(16,185,129,0.15)", borderColor: ACCENT } : { borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                  <Ship size={12} /> {g.gemi_adi}
                  <span className="font-normal opacity-80 tabular-nums">· {g.gelen_arac}</span>
                </button>
              );
            })}
          </div>
          <GemiGorunumu key={secili.id} g={secili} araclar={sonlar.filter((x) => x.gemi_id === secili.id)} tetik={tetik} yenile={getir} />
        </>
      )}
    </div>
  );
}

function GemiGorunumu({ g, araclar, tetik, yenile }: { g: KantarGemi; araclar: KantarGemiArac[]; tetik: number; yenile: () => void }) {
  const yuzde = g.bl_kg > 0 ? (Number(g.gelen_kg) * 100) / Number(g.bl_kg) : 0;
  const [elle, setElle] = useState(false);
  const [yoldaAcik, setYoldaAcik] = useState(false);
  const [bekleyenAcik, setBekleyenAcik] = useState(false);
  const [tumu, setTumu] = useState(false);
  const bekleyenSayi = Number(g.liman_bekleyen_arac || 0);
  const yolda = araclar.filter((a) => !a.alici_id && a.teslim_kg === null)
    .sort((a, b) => ((a.liman_cikis || a.olusturma) < (b.liman_cikis || b.olusturma) ? -1 : 1));
  const yoldaKg = yolda.reduce((t, a) => t + Number(a.liman_kg ?? 0), 0);
  // Son tartilanlar: teslimi gelen UNEX (liman fisi bekleyen dahil) + gemiden satis, en yeni ustte
  const tartilanlar = araclar.filter((a) => a.teslim_kg !== null || a.alici_id)
    .sort((a, b) => ((b.teslim_zamani || b.liman_cikis || b.olusturma) > (a.teslim_zamani || a.liman_cikis || a.olusturma) ? 1 : -1));
  const gorunen = tumu ? tartilanlar : tartilanlar.slice(0, SON_SAYISI);
  const rozet = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold whitespace-nowrap hover:brightness-125";
  const th = "px-4 py-2 font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap";

  return (
    <section className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} aria-label={g.gemi_adi}>
      {/* Tek satir ozet + aksiyon seridi */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }} data-testid="kantar-gemi-ozet">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white leading-tight flex items-center gap-2"><Ship size={15} style={{ color: ACCENT }} /> {g.gemi_adi}</p>
          <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{[g.urun, g.tahliye_limani].filter(Boolean).join(" · ")} · bugün {g.bugun_arac} araç</p>
        </div>
        <div className="flex items-center gap-3 min-w-[260px]">
          <div className="w-36 sm:w-48 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#1E2530" }} aria-label={`Tahliye ${yuzdeYazi(yuzde, 1)}`}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, yuzde)}%`, backgroundColor: ACCENT }} />
          </div>
          <p className="text-xs tabular-nums whitespace-nowrap" style={{ color: TEXT_MUTED }}>
            <span className="font-bold text-white">{ton(g.gelen_kg)}</span> / {ton(g.bl_kg)} ton · <span className="text-white">{yuzdeYazi(yuzde, 1)}</span> · {g.gelen_arac} araç
          </p>
        </div>
        {yolda.length > 0 && (
          <button type="button" onClick={() => setYoldaAcik((x) => !x)} className={rozet} style={{ borderColor: "rgba(245,158,11,0.45)", backgroundColor: "rgba(245,158,11,0.08)", color: "#FCD34D" }} aria-expanded={yoldaAcik} data-testid="kantar-gemi-yolda-cip">
            <Clock size={12} /> Yolda {yolda.length} araç · {ton(yoldaKg)} ton
          </button>
        )}
        {bekleyenSayi > 0 && (
          <button type="button" onClick={() => setBekleyenAcik((x) => !x)} className={rozet} style={{ borderColor: "rgba(56,189,248,0.45)", backgroundColor: "rgba(56,189,248,0.08)", color: "#7DD3FC" }} aria-expanded={bekleyenAcik} data-testid="kantar-gemi-liman-bekleyen-cip">
            <Scale size={12} /> Liman fişi bekleyen {bekleyenSayi} · {ton(g.liman_bekleyen_kg || 0)} ton
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <GemiLimanExcelYukle gemi={g} kaydedildi={yenile} testId={`kantar-gemi-excel-${g.id.slice(0, 8)}`} />
          <button type="button" onClick={() => setElle((x) => !x)} aria-expanded={elle}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold hover:bg-white/5"
            style={{ borderColor: CARD_BORDER, color: elle ? "white" : TEXT_MUTED }} data-testid="kantar-gemi-elle">
            <Plus size={14} /> Elle Araç
          </button>
        </div>
      </div>

      {elle && <div className="px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}><GemiHizliGiris gemi={g} alicilar={g.alicilar} kaynak="kantar" kaydedildi={yenile} testId={`kantar-gemi-hizli-${g.id.slice(0, 8)}`} /></div>}

      {bekleyenAcik && bekleyenSayi > 0 && (
        <div className="border-b" style={{ borderColor: CARD_BORDER }} data-testid="kantar-gemi-liman-bekleyen">
          <p className="px-4 pt-2 text-[10px] font-semibold uppercase tracking-wide text-sky-300">Liman fişi bekleyen · birden çok yakın fiş varsa seçin, yoksa Excel yüklenince kendiliğinden eşleşir</p>
          <GemiLimanBekleyenListesi gemiId={g.id} yenileTetik={tetik} degisti={yenile} />
        </div>
      )}

      {yoldaAcik && yolda.length > 0 && (
        <div className="border-b" style={{ borderColor: CARD_BORDER }} data-testid="kantar-gemi-yolda">
          <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300">Yolda · elle girilen fiş, kantar tartımı bekleniyor</p>
          <table className="w-full table-fixed text-left border-collapse text-xs">
            <colgroup><col className="w-32" /><col /><col className="w-28" /><col className="w-36" /></colgroup>
            <tbody>
              {yolda.map((a) => (
                <tr key={a.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                  <td className="px-4 py-1.5 font-semibold text-white whitespace-nowrap">{a.plaka}</td>
                  <td className="px-4 py-1.5 truncate" style={{ color: TEXT_MUTED }}>{a.liman_cikis ? `limandan çıkış ${saat(a.liman_cikis)}` : `fiş ${saat(a.olusturma)}`}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-white">{Number(a.liman_kg ?? 0).toLocaleString("tr-TR")}</td>
                  <td className="px-3 py-1.5 text-right"><TeslimGirdisi arac={a} yenile={yenile} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Son tartilan araclar (genis tablo) */}
      <div data-testid="kantar-gemi-son5">
        {tartilanlar.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm" style={{ color: TEXT_MUTED }}>Henüz tartılan araç yok. Kantarda firma alanına gemi adı yazılan araçlar tartıldıkça burada görünür.</p>
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead style={{ backgroundColor: ROW_HEADER_BG }}>
              <tr>{["Saat", "Plaka", "Gittiği Yer", "Liman (kg)", "Teslim (kg)", "Fark"].map((b, i) => <th key={b} className={`${th} ${i >= 3 ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>)}</tr>
            </thead>
            <tbody>
              {gorunen.map((a) => {
                const fark = a.teslim_kg !== null && a.liman_kg !== null ? Number(a.teslim_kg) - Number(a.liman_kg) : null;
                const kplaka = a.kantar_plaka ? plakaBicimle(a.kantar_plaka) : "";
                return (
                  <tr key={a.id} className="border-t hover:bg-white/[0.02]" style={{ borderColor: CARD_BORDER }}>
                    <td className="px-4 py-2 tabular-nums" style={{ color: TEXT_MUTED }}>{saat(a.teslim_zamani || a.liman_cikis || a.olusturma)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className="font-semibold text-white">{a.plaka}</span>
                      {kplaka && kplaka !== a.plaka && <span className="text-xs" style={{ color: TEXT_MUTED }} title="Kantarımızdaki plaka (dorse)"> · {kplaka}</span>}
                      {a.uyari_var && <AlertTriangle size={12} className="inline ml-1 text-amber-400" />}
                    </td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap" style={{ color: a.firma ? "white" : TEXT_MUTED }}>{a.firma || UNEX_YER}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-white">{a.liman_kg !== null ? Number(a.liman_kg).toLocaleString("tr-TR") : <span className="text-[11px] text-sky-300" title="Liman Excel'i yüklenince eşleşir">fiş bekleniyor</span>}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-white">{a.teslim_kg !== null ? Number(a.teslim_kg).toLocaleString("tr-TR") : "—"}</td>
                    <td className="px-4 py-2 text-right">
                      {fark !== null && (
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-bold tabular-nums ${Math.abs(fark) > 300 ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                          {fark > 0 ? "+" : ""}{fark.toLocaleString("tr-TR")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {tartilanlar.length > SON_SAYISI && (
          <button type="button" onClick={() => setTumu((x) => !x)} className="w-full px-4 py-1.5 border-t text-xs font-semibold hover:bg-white/[0.03] inline-flex items-center justify-center gap-1" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
            {tumu ? `Son ${SON_SAYISI} aracı göster` : `Son 2 günün tümünü göster (${tartilanlar.length})`} <ChevronDown size={12} className={tumu ? "rotate-180" : ""} />
          </button>
        )}
      </div>

      {/* Tek satir gittigi yer ozeti */}
      <table className="w-full text-left border-collapse text-xs border-t" style={{ borderColor: CARD_BORDER }} data-testid="kantar-gemi-yer-ozeti">
        <thead style={{ backgroundColor: ROW_HEADER_BG }}>
          <tr>{["Gittiği Yer", "Toplam Araç", "Liman Toplam", "Teslim / Kalan"].map((b, i) => <th key={b} className={`${th} ${i ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>)}</tr>
        </thead>
        <tbody>
          <tr className="border-t" style={{ borderColor: CARD_BORDER }}>
            <td className="px-4 py-2 text-white font-semibold">{UNEX_YER}</td>
            <td className="px-4 py-2 text-right tabular-nums text-white">{g.unex_arac}</td>
            <td className="px-4 py-2 text-right tabular-nums text-white">{kgYazi(g.unex_liman_kg)}</td>
            <td className="px-4 py-2 text-right tabular-nums text-white">teslim {kgYazi(g.unex_teslim_kg)}</td>
          </tr>
          {g.alicilar.map((l) => {
            const kalan = Number(l.miktar_kg) - Number(l.gelen_kg);
            return (
              <tr key={l.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                <td className="px-4 py-2 text-white truncate" title={l.firma}>{l.firma}</td>
                <td className="px-4 py-2 text-right tabular-nums text-white">{l.arac}</td>
                <td className="px-4 py-2 text-right tabular-nums text-white">{kgYazi(l.gelen_kg)}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${kalan < 0 ? "text-sky-400" : "text-amber-300"}`}>{kalan < 0 ? `Fazla ${kgYazi(-kalan)}` : `Kalan ${kgYazi(kalan)}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
