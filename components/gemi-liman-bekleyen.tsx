"use client";

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { Loader2, Link2, AlertTriangle } from "lucide-react";
import { CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { tarihSaatYazi } from "@/lib/ic-piyasa/is-emri";
import { trSayiOku, plakaBicimle } from "@/lib/ic-piyasa/irsaliye-oku";
import { KantarLimanBekleyen, bekleyenDurumu, gemiHataMesaji } from "@/lib/ic-piyasa/gemi-tahliye";

/**
 * Gemi Tahliye - LIMAN FISI BEKLEYEN araclar (25.11.2026 gece, fabrika esasli eslestirme).
 * Kantarda gemi adiyla tartilan arac otomatik UNEX araci olur; liman Excel'i yuklenince fis kendiliginden
 * eslesir. Kural disinda kalan ya da 40 puan icinde birden cok yakin fisi olan arac burada OPERATOR ONAYI bekler:
 * aday fise tiklanir (ic_gemi_liman_esle p_fis) ya da liman kg'i elle yazilir (p_liman_kg). Ikisi de onayli kayittir;
 * otomatik eslestirme bir daha dokunmaz. Kantar Paneli ve Ic Piyasa > Gemi Tahliye ayni bileseni kullanir.
 */
const saat = (iso: string | null) => (iso ? tarihSaatYazi(iso).slice(-5) : "");
const isaretli = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n).toLocaleString("tr-TR")}`;

export function GemiLimanBekleyenListesi({ gemiId, yenileTetik = 0, degisti, testId }: {
  gemiId: string; yenileTetik?: number; degisti: () => void; testId?: string;
}) {
  const [liste, setListe] = useState<KantarLimanBekleyen[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const getir = useCallback(async () => {
    const r = await supabase.rpc("kantar_gemi_liman_adaylari", { p_gemi: gemiId });
    if (r.error) { setHata(gemiHataMesaji(r.error)); setListe([]); return; }
    setHata(null);
    setListe((r.data || []) as KantarLimanBekleyen[]);
  }, [gemiId]);
  useEffect(() => { getir(); }, [getir, yenileTetik]);

  const bitti = () => { getir(); degisti(); };

  if (liste === null) return <p className="px-3 py-2 text-xs flex items-center gap-1.5" style={{ color: TEXT_MUTED }}><Loader2 size={12} className="animate-spin" /> Yükleniyor…</p>;
  if (hata) return <p className="px-3 py-2 text-xs text-amber-300 flex items-center gap-1.5"><AlertTriangle size={12} /> {hata}</p>;
  if (!liste.length) return <p className="px-3 py-2 text-xs" style={{ color: TEXT_MUTED }}>Liman fişi bekleyen araç yok.</p>;

  return (
    <table className="w-full table-fixed text-left border-collapse text-xs" data-testid={testId}>
      <colgroup><col className="w-28" /><col className="w-24" /><col className="w-20" /><col /><col className="w-32" /></colgroup>
      <thead>
        <tr>{["Kantar plaka", "Tartım", "Teslim", "Liman fişi adayları (tıkla = bağla)", "Ya da liman kg"].map((b, i) => (
          <th key={b} className={`px-3 py-1 font-semibold uppercase tracking-wide text-[9px] ${i === 2 || i === 4 ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>
        ))}</tr>
      </thead>
      <tbody>
        {liste.map((b) => {
          const durum = bekleyenDurumu(b);
          return (
            <tr key={b.arac_id} className="border-t align-top" style={{ borderColor: CARD_BORDER }}>
              <td className="px-3 py-1.5 font-semibold text-white whitespace-nowrap">{plakaBicimle(b.kantar_plaka || "") || "—"}</td>
              <td className="px-3 py-1.5 tabular-nums whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b.kantar_kayit_no ? `#${b.kantar_kayit_no} · ` : ""}{saat(b.kantar_zaman)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-white">{Number(b.teslim_kg).toLocaleString("tr-TR")}</td>
              <td className="px-3 py-1.5">
                {durum === "excel" && <span style={{ color: TEXT_MUTED }}>Uygun liman fişi yok · Excel yüklenince eşleşir</span>}
                {durum === "kapali" && !b.adaylar.length && <span className="text-amber-300">Eşleşme kaldırıldı · uygun fiş yok</span>}
                {b.adaylar.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {durum === "kapali" && <span className="text-amber-300 mr-1">Eşleşme kaldırıldı ·</span>}
                    {b.adaylar.map((f) => <AdayDugmesi key={f.fis_id} aracId={b.arac_id} aday={f} bitti={bitti} />)}
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 text-right"><LimanKgGirdisi aracId={b.arac_id} teslim={Number(b.teslim_kg)} plaka={b.kantar_plaka} bitti={bitti} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AdayDugmesi({ aracId, aday, bitti }: { aracId: string; aday: KantarLimanBekleyen["adaylar"][number]; bitti: () => void }) {
  const { showToast } = useToast();
  const [mesgul, setMesgul] = useState(false);
  const bagla = async () => {
    setMesgul(true);
    const { error } = await supabase.rpc("ic_gemi_liman_esle", { p_arac: aracId, p_fis: aday.fis_id, p_liman_kg: null });
    setMesgul(false);
    if (error) { showToast(gemiHataMesaji(error), "error"); return; }
    showToast(`${aday.plaka} liman fişi bağlandı (fark ${isaretli(aday.net_fark)} kg).`, "success");
    bitti();
  };
  const uzak = Math.abs(aday.net_fark) > 200 || aday.dakika < 10 || aday.dakika > 90;
  return (
    <button type="button" onClick={bagla} disabled={mesgul}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] hover:bg-white/5 disabled:opacity-50"
      style={{ borderColor: uzak ? "rgba(245,158,11,0.45)" : "rgba(16,185,129,0.45)", color: uzak ? "#FCD34D" : "#6EE7B7" }}
      title={`Fiş ${aday.fis_kodu} · limandan çıkış ${tarihSaatYazi(aday.cikis)} · ${aday.dakika} dk sonra kantarda · net ${Number(aday.net_kg).toLocaleString("tr-TR")} kg${aday.dolu_fark !== null ? ` · dolu farkı ${isaretli(aday.dolu_fark)} kg` : ""}`}
      aria-label={`${aday.plaka} liman fişini bağla`}>
      {mesgul ? <Loader2 size={10} className="animate-spin" /> : <Link2 size={10} />}
      <b className="text-white">{aday.plaka}</b> {saat(aday.cikis)} · {isaretli(aday.net_fark)} kg
    </button>
  );
}

function LimanKgGirdisi({ aracId, teslim, plaka, bitti }: { aracId: string; teslim: number; plaka: string | null; bitti: () => void }) {
  const { showToast } = useToast();
  const [deger, setDeger] = useState("");
  const [mesgul, setMesgul] = useState(false);
  const gonder = async () => {
    const kg = trSayiOku(deger);
    if (!kg || kg < 1000 || kg > 60000) { showToast("Liman kg 1.000 - 60.000 arasında olmalı.", "error"); return; }
    setMesgul(true);
    const { error } = await supabase.rpc("ic_gemi_liman_esle", { p_arac: aracId, p_fis: null, p_liman_kg: kg });
    setMesgul(false);
    if (error) { showToast(gemiHataMesaji(error), "error"); return; }
    showToast(`${plakaBicimle(plaka || "")}: liman ${kg.toLocaleString("tr-TR")} kg (fark ${isaretli(teslim - kg)}).`, "success");
    setDeger("");
    bitti();
  };
  return (
    <span className="inline-flex items-center gap-1">
      {mesgul && <Loader2 size={12} className="animate-spin" style={{ color: TEXT_MUTED }} />}
      <input value={deger} onChange={(e) => setDeger(e.target.value.replace(/[^0-9.,]/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); gonder(); } }}
        placeholder="liman kg" inputMode="numeric"
        className="w-24 px-2 py-1 rounded-md border text-xs text-white text-right tabular-nums bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        style={{ borderColor: CARD_BORDER }} aria-label={`${plaka || ""} liman kg`} />
    </span>
  );
}
