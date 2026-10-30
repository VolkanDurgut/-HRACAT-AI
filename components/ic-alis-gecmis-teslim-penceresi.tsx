"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { Loader2, X, Plus, Trash2, AlertTriangle, History, Wand2 } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { trSayiOku, plakaBicimle, plakaGecerli, plakaYazarken } from "@/lib/ic-piyasa/irsaliye-oku";
import { alisHataMesaji, alisUrunYazi, bugunTRIso, formulTerimleri } from "@/lib/ic-piyasa/alis";
import { kgYazi } from "@/lib/ic-piyasa/is-emri";

/**
 * Sistem oncesi teslim (30.10.2026) - lojistik Excel'iyle esitleme.
 * Excel'de teslim alinan miktar formulle tutuluyor (=87620+165940+...); her
 * terim bir gunun / partinin toplami, plaka yok. Burada her satir bir PARTI:
 * tarih + kg (+ istege bagli plaka / irsaliye no). Kayit: ic_alis_gecmis_teslim_ekle
 * (gecmis=true; kantar listesinde gorunmez, rapora ve ilerlemeye sayilir).
 */

export type GecmisAlis = { id: string; alis_no: string; urun: string; urun_kodu: string | null; tedarikci: string; miktar_kg: number; alinan_kg: number };
type Satir = { tarih: string; kg: string; plaka: string; irsaliye: string };

export function IcAlisGecmisTeslimPenceresi({ alis, kapat, kaydedildi }: { alis: GecmisAlis; kapat: () => void; kaydedildi: () => void }) {
  const { showToast } = useToast();
  const bugun = bugunTRIso();
  const [satirlar, setSatirlar] = useState<Satir[]>([{ tarih: bugun, kg: "", plaka: "", irsaliye: "" }]);
  const [formul, setFormul] = useState("");
  const [formulTarih, setFormulTarih] = useState(bugun);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const kgOf = (s: Satir) => (s.kg.trim() ? trSayiOku(s.kg.trim()) : null);
  const satirHatasi = (s: Satir): string | null => {
    const k = kgOf(s);
    if (!s.tarih || s.tarih > bugun) return "Tarih";
    if (k === null || k <= 0 || k > 5_000_000) return "Miktar";
    if (s.plaka.trim() && !plakaGecerli(plakaBicimle(s.plaka))) return "Plaka";
    if (s.irsaliye.trim() && !/^[A-Z0-9]{3,20}$/.test(s.irsaliye.trim())) return "İrsaliye no";
    return null;
  };
  const dolu = satirlar.filter((s) => s.kg.trim());
  const hatali = dolu.map(satirHatasi).filter(Boolean);
  const toplam = dolu.reduce((t, s) => t + (kgOf(s) || 0), 0);

  const formulUygula = () => {
    const terimler = formulTerimleri(formul);
    if (!terimler) { setHata("Formül okunamadı. Örnek: =87620+165940+195280"); return; }
    setHata(null);
    const yeni = terimler.map((n) => ({ tarih: formulTarih, kg: n.toLocaleString("tr-TR", { maximumFractionDigits: 2 }), plaka: "", irsaliye: "" }));
    setSatirlar((eski) => [...eski.filter((s) => s.kg.trim()), ...yeni]);
    setFormul("");
  };

  const kaydet = async () => {
    if (!dolu.length || hatali.length) return;
    setKaydediliyor(true);
    setHata(null);
    let basarili = 0;
    for (const s of dolu) {
      const { error } = await supabase.rpc("ic_alis_gecmis_teslim_ekle", {
        p_veri: {
          alis_id: alis.id, tarih: s.tarih, net_kg: kgOf(s),
          plaka: s.plaka.trim() ? plakaBicimle(s.plaka) : null,
          irsaliye_no: s.irsaliye.trim() || null,
          notlar: "Sistem öncesi kayıt (lojistik Excel'i)",
        },
      });
      if (error) {
        setKaydediliyor(false);
        // Kaydedilenler listeden dusulur; kalan satirlar duzeltilip tekrar gonderilir
        setSatirlar((eski) => eski.filter((x) => x.kg.trim()).slice(basarili));
        setHata(`${basarili} parti kaydedildi; ${basarili + 1}. satırda hata: ${alisHataMesaji(error)}`);
        if (basarili) kaydedildi();
        return;
      }
      basarili += 1;
    }
    setKaydediliyor(false);
    showToast(`${alis.alis_no}: ${basarili} parti · ${kgYazi(toplam)} sistem öncesi teslim olarak eklendi.`, "success");
    kaydedildi();
    kapat();
  };

  const guncelle = (i: number, alan: keyof Satir, v: string) => setSatirlar((eski) => eski.map((s, j) => (j === i ? { ...s, [alan]: v } : s)));

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="gecmis-teslim-baslik">
      <div className="w-full max-w-2xl rounded-2xl border shadow-2xl my-8" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-start justify-between px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div>
            <h2 id="gecmis-teslim-baslik" className="text-base font-bold text-white flex items-center gap-2"><History size={16} style={{ color: ACCENT }} /> Sistem öncesi teslim ekle</h2>
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{alis.alis_no} · {alis.tedarikci} · {alisUrunYazi(alis)} · şu an {kgYazi(alis.alinan_kg)} / {kgYazi(alis.miktar_kg)}</p>
          </div>
          <button onClick={kapat} disabled={kaydediliyor} className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>
            Kantara girmeden önce teslim alınan miktarları buraya ekleyin. Her satır bir partidir (bir günün toplamı olabilir; plaka isteğe bağlı).
            Bu kayıtlar kantar listesinde görünmez, ilerlemeye ve Sipariş Raporu&apos;na sayılır.
          </p>

          <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
            <p className="text-xs font-semibold text-white flex items-center gap-1.5"><Wand2 size={13} style={{ color: ACCENT }} /> Excel formülünden doldur</p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_150px_auto] gap-2">
              <input value={formul} onChange={(e) => setFormul(e.target.value)} placeholder="=87620+165940+195280" aria-label="Excel formülü"
                className="px-3 py-2 rounded-lg border text-sm text-white font-mono placeholder:text-slate-600" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} />
              <input type="date" value={formulTarih} max={bugun} onChange={(e) => setFormulTarih(e.target.value)} aria-label="Formül tarihi"
                className="px-3 py-2 rounded-lg border text-sm text-white" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER, colorScheme: "dark" }} />
              <button type="button" onClick={formulUygula} disabled={!formul.trim()} className="px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: ACCENT }}>Satırlara aç</button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[150px_1fr_140px_1fr_32px] gap-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>
              <span>Tarih</span><span>Miktar (kg)</span><span>Plaka</span><span>İrsaliye no</span><span />
            </div>
            {satirlar.map((s, i) => {
              const h = s.kg.trim() ? satirHatasi(s) : null;
              return (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-[150px_1fr_140px_1fr_32px] gap-2 items-center">
                  <input type="date" value={s.tarih} max={bugun} onChange={(e) => guncelle(i, "tarih", e.target.value)} aria-label={`${i + 1}. satır tarih`}
                    className="px-2 py-2 rounded-lg border text-sm text-white" style={{ backgroundColor: "#0F131A", borderColor: h === "Tarih" ? "#F87171" : CARD_BORDER, colorScheme: "dark" }} />
                  <input value={s.kg} onChange={(e) => guncelle(i, "kg", e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="25.500" aria-label={`${i + 1}. satır miktar`}
                    className="px-2 py-2 rounded-lg border text-sm text-right font-semibold text-white" style={{ backgroundColor: "#0F131A", borderColor: h === "Miktar" ? "#F87171" : CARD_BORDER }} />
                  <input value={s.plaka} onChange={(e) => guncelle(i, "plaka", plakaYazarken(e.target.value))} onBlur={() => guncelle(i, "plaka", s.plaka ? plakaBicimle(s.plaka) : "")} placeholder="isteğe bağlı" aria-label={`${i + 1}. satır plaka`}
                    className="px-2 py-2 rounded-lg border text-sm uppercase text-white placeholder:normal-case placeholder:text-slate-600" style={{ backgroundColor: "#0F131A", borderColor: h === "Plaka" ? "#F87171" : CARD_BORDER }} />
                  <input value={s.irsaliye} onChange={(e) => guncelle(i, "irsaliye", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))} placeholder="isteğe bağlı" aria-label={`${i + 1}. satır irsaliye no`}
                    className="px-2 py-2 rounded-lg border text-sm uppercase text-white placeholder:normal-case placeholder:text-slate-600" style={{ backgroundColor: "#0F131A", borderColor: h === "İrsaliye no" ? "#F87171" : CARD_BORDER }} />
                  <button type="button" onClick={() => setSatirlar((eski) => (eski.length > 1 ? eski.filter((_, j) => j !== i) : [{ tarih: bugun, kg: "", plaka: "", irsaliye: "" }]))} className="p-2 rounded hover:bg-white/5 justify-self-end" style={{ color: TEXT_MUTED }} aria-label={`${i + 1}. satırı sil`}><Trash2 size={14} /></button>
                </div>
              );
            })}
            <button type="button" onClick={() => setSatirlar((e) => [...e, { tarih: e[e.length - 1]?.tarih || bugun, kg: "", plaka: "", irsaliye: "" }])}
              className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: ACCENT }}><Plus size={13} /> Satır ekle</button>
          </div>

          {hata && <p className="flex items-start gap-1.5 text-sm text-red-400"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {hata}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
          <p className="text-xs" style={{ color: hatali.length ? "#FBBF24" : TEXT_MUTED }}>
            {hatali.length ? `Kontrol edin: ${Array.from(new Set(hatali)).join(", ")}` : `${dolu.length} parti · ${kgYazi(toplam)} · kayıttan sonra ${kgYazi(Number(alis.alinan_kg) + toplam)}`}
          </p>
          <div className="flex gap-2">
            <button onClick={kapat} disabled={kaydediliyor} className="px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
            <button onClick={kaydet} disabled={kaydediliyor || !dolu.length || hatali.length > 0} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white hover:brightness-110 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
              {kaydediliyor && <Loader2 size={15} className="animate-spin" />} Kaydet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
