"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { formatCurrency, formatDateTR } from "@/lib/cutoff-utils";
import AppShell from "@/components/app-shell";
import { Users, Package, Loader2, Ship, Globe2, BarChart2, X, Clock, Truck } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

type DosyaFull = Dosya & { rezervasyonlar: Rezervasyon[]; konteynerler: Konteyner[] };

type GemiModal = {
  gemiAdi: string;
  dosyalar: { dosyaNo: string; aliciFirma: string; varisLimani: string; konteyner: number; tutar: number; paraBirimi: string; etd: string | null; eta: string | null }[];
};

const YILLAR = ["Tümü", "2026"];
const NAVY = ACCENT;

function HBar({ value, max, color = NAVY }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max((value / max) * 100, 1) : 0;
  return (
    <div className="w-full rounded-full h-1" style={{ marginTop: 4, backgroundColor: CARD_BORDER }}>
      <div className="h-1 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

export default function AnalizPage() {
  const { user, companyId } = useAuth(); // Global context'ten companyId alındı
  const [dosyalar, setDosyalar] = useState<DosyaFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [yilFiltre, setYilFiltre] = useState("Tümü");
  const [durumFiltre, setDurumFiltre] = useState<"tumu" | "tamamlanan">("tumu");
  const [gemiModal, setGemiModal] = useState<GemiModal | null>(null);

  const fetchAll = useCallback(async () => {
    if (!user || !companyId) return; // companyId kontrolü eklendi
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari")
      .select("*")
      .eq("company_id", companyId) // Sadece bu şirketin dosyaları analize dahil edilir
      .order("olusturma_tarihi", { ascending: true });
      
    if (!dosyaData || dosyaData.length === 0) { setDosyalar([]); setLoading(false); return; }
    const dosyaIds = dosyaData.map((d: Dosya) => d.id);
    const [{ data: rezData }, { data: kontData }] = await Promise.all([
      supabase.from("rezervasyonlar").select("*").in("dosya_id", dosyaIds).eq("company_id", companyId), // Şirket kilidi eklendi
      supabase.from("konteynerler").select("*").in("dosya_id", dosyaIds).eq("company_id", companyId), // Şirket kilidi eklendi
    ]);
    setDosyalar(dosyaData.map((d: Dosya) => ({
      ...d,
      rezervasyonlar: (rezData || []).filter((r: Rezervasyon) => r.dosya_id === d.id),
      konteynerler: (kontData || []).filter((k: Konteyner) => k.dosya_id === d.id),
    })));
    setLoading(false);
  }, [user, companyId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtrelenmis = useMemo(() => {
    let liste = dosyalar;
    if (durumFiltre === "tamamlanan") liste = liste.filter(d => d.durum === "Kapalı" || d.durum === "Kapali");
    if (yilFiltre !== "Tümü") liste = liste.filter(d => d.olusturma_tarihi?.startsWith(yilFiltre));
    return liste;
  }, [dosyalar, yilFiltre, durumFiltre]);

  const paraBirimi = dosyalar[0]?.para_birimi || "USD";
  const toplamHacim = useMemo(() => filtrelenmis.reduce((s, d) => s + (d.toplam_tutar || 0), 0), [filtrelenmis]);
  const toplamKonteyner = useMemo(() => filtrelenmis.reduce((s, d) => s + d.konteynerler.length, 0), [filtrelenmis]);
  const toplamMts = useMemo(() => filtrelenmis.reduce((s, d) => {
    const u = (d.urun_detaylari as any[]) || [];
    return s + u.reduce((s2: number, x: any) => s2 + parseFloat(String(x.miktar_mts || x.quantity || 0)), 0);
  }, 0), [filtrelenmis]);
  const kapaliSayisi = filtrelenmis.filter(d => d.durum === "Kapalı" || d.durum === "Kapali").length;
  const acikSayisi = filtrelenmis.length - kapaliSayisi;

  const aylikTrend = useMemo(() => {
    const sayac: Record<string, { tutar: number; konteyner: number }> = {};
    filtrelenmis.forEach(d => {
      if (!d.olusturma_tarihi) return;
      const ay = new Date(d.olusturma_tarihi).toLocaleDateString("tr-TR", { month: "short", year: "2-digit" });
      if (!sayac[ay]) sayac[ay] = { tutar: 0, konteyner: 0 };
      sayac[ay].tutar += d.toplam_tutar || 0;
      sayac[ay].konteyner += d.konteynerler.length;
    });
    return Object.entries(sayac).map(([ay, v]) => ({ ay, tutar: v.tutar, konteyner: v.konteyner }));
  }, [filtrelenmis]);

  const enCokMusteriler = useMemo(() => {
    const s: Record<string, { tutar: number; adet: number; konteyner: number }> = {};
    filtrelenmis.forEach(d => {
      const m = d.alici_firma?.trim(); if (!m) return;
      if (!s[m]) s[m] = { tutar: 0, adet: 0, konteyner: 0 };
      s[m].tutar += d.toplam_tutar || 0; s[m].adet += 1; s[m].konteyner += d.konteynerler.length;
    });
    return Object.entries(s).map(([ad, v]) => ({ ad, ...v })).sort((a, b) => b.tutar - a.tutar).slice(0, 8);
  }, [filtrelenmis]);

  const enCokLimanlar = useMemo(() => {
    const s: Record<string, { tutar: number; konteyner: number; adet: number }> = {};
    filtrelenmis.forEach(d => {
      const l = d.varis_limani?.trim(); if (!l) return;
      if (!s[l]) s[l] = { tutar: 0, konteyner: 0, adet: 0 };
      s[l].tutar += d.toplam_tutar || 0; s[l].konteyner += d.konteynerler.length; s[l].adet += 1;
    });
    return Object.entries(s).map(([ad, v]) => ({ ad, ...v })).sort((a, b) => b.konteyner - a.konteyner).slice(0, 8);
  }, [filtrelenmis]);

  const enCokAcenteler = useMemo(() => {
    const s: Record<string, { konteyner: number; adet: number }> = {};
    filtrelenmis.forEach(d => d.rezervasyonlar.forEach(r => {
      const a = r.acente_ismi?.trim(); if (!a) return;
      if (!s[a]) s[a] = { konteyner: 0, adet: 0 };
      s[a].konteyner += r.konteyner_adedi || 0; s[a].adet += 1;
    }));
    return Object.entries(s).map(([ad, v]) => ({ ad, ...v })).sort((a, b) => b.konteyner - a.konteyner).slice(0, 6);
  }, [filtrelenmis]);

  // YENİ: Ülke bazlı birim fiyat (MTS başına ortalama USD)
  const ulkeFiyat = useMemo(() => {
    const s: Record<string, { tutar: number; mts: number }> = {};
    filtrelenmis.forEach(d => {
      const liman = d.varis_limani?.trim(); if (!liman) return;
      const urunler = (d.urun_detaylari as any[]) || [];
      const mts = urunler.reduce((t: number, u: any) => t + parseFloat(String(u.miktar_mts || u.quantity || 0)), 0);
      if (!s[liman]) s[liman] = { tutar: 0, mts: 0 };
      s[liman].tutar += d.toplam_tutar || 0;
      s[liman].mts += mts;
    });
    return Object.entries(s)
      .map(([liman, v]) => ({ liman, birimFiyat: v.mts > 0 ? v.tutar / v.mts : 0, mts: v.mts }))
      .filter(x => x.birimFiyat > 0)
      .sort((a, b) => b.birimFiyat - a.birimFiyat)
      .slice(0, 8);
  }, [filtrelenmis]);

  // YENİ: Teslim şekli dağılımı
  const teslimSekli = useMemo(() => {
    const s: Record<string, number> = {};
    filtrelenmis.forEach(d => {
      const t = d.teslim_sekli?.trim().toUpperCase(); if (!t) return;
      s[t] = (s[t] || 0) + 1;
    });
    return Object.entries(s).map(([tip, adet]) => ({ tip, adet })).sort((a, b) => b.adet - a.adet);
  }, [filtrelenmis]);

  // YENİ: Transit süresi (ETD → ETA, liman bazında ortalama gün)
  const transitSuresi = useMemo(() => {
    const s: Record<string, { toplam: number; adet: number }> = {};
    filtrelenmis.forEach(d => {
      const liman = d.varis_limani?.trim(); if (!liman) return;
      d.rezervasyonlar.forEach(r => {
        if (!r.gemi_kalkis_tarihi || !(r as any).eta) return;
        const etd = new Date(r.gemi_kalkis_tarihi).getTime();
        const eta = new Date((r as any).eta).getTime();
        const gun = Math.round((eta - etd) / (1000 * 60 * 60 * 24));
        if (gun <= 0 || gun > 120) return;
        if (!s[liman]) s[liman] = { toplam: 0, adet: 0 };
        s[liman].toplam += gun; s[liman].adet += 1;
      });
    });
    return Object.entries(s)
      .map(([liman, v]) => ({ liman, ortalama: Math.round(v.toplam / v.adet), adet: v.adet }))
      .sort((a, b) => b.adet - a.adet).slice(0, 8);
  }, [filtrelenmis]);

  // YENİ: Gemi başına konteyner
  const gemiler = useMemo(() => {
    const s: Record<string, { konteyner: number; dosyalar: Set<string>; rezervasyonlar: Rezervasyon[] }> = {};
    filtrelenmis.forEach(d => {
      d.rezervasyonlar.forEach(r => {
        const g = r.gemi_adi?.trim(); if (!g) return;
        if (!s[g]) s[g] = { konteyner: 0, dosyalar: new Set(), rezervasyonlar: [] };
        s[g].konteyner += r.konteyner_adedi || 0;
        s[g].dosyalar.add(d.id);
        s[g].rezervasyonlar.push(r);
      });
    });
    return Object.entries(s)
      .map(([ad, v]) => ({ ad, konteyner: v.konteyner, dosyaSayisi: v.dosyalar.size }))
      .sort((a, b) => b.konteyner - a.konteyner).slice(0, 8);
  }, [filtrelenmis]);

  const handleGemiClick = (gemiAdi: string) => {
    const ilgiliDosyalar: GemiModal["dosyalar"] = [];
    filtrelenmis.forEach(d => {
      d.rezervasyonlar.forEach(r => {
        if (r.gemi_adi?.trim() !== gemiAdi) return;
        ilgiliDosyalar.push({
          dosyaNo: d.dosya_no,
          aliciFirma: d.alici_firma || "—",
          varisLimani: d.varis_limani || "—",
          konteyner: r.konteyner_adedi || 0,
          tutar: d.toplam_tutar || 0,
          paraBirimi: d.para_birimi || "USD",
          etd: r.gemi_kalkis_tarihi || null,
          eta: (r as any).eta || null,
        });
      });
    });
    setGemiModal({ gemiAdi, dosyalar: ilgiliDosyalar });
  };

  const sonSevkiyatlar = useMemo(() =>
    [...filtrelenmis]
      .filter(d => d.durum === "Kapalı" || d.durum === "Kapali")
      .sort((a, b) => new Date(b.olusturma_tarihi || "").getTime() - new Date(a.olusturma_tarihi || "").getTime())
      .slice(0, 6),
    [filtrelenmis]);

  const maxTutar = Math.max(...aylikTrend.map(a => a.tutar), 1);
  const maxKont = Math.max(...aylikTrend.map(a => a.konteyner), 1);

  if (loading) return (
    <AppShell>
      <div className="flex items-center justify-center py-20">
        <Loader2 size={22} className="animate-spin" style={{ color: TEXT_MUTED }} />
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      {/* Gemi Modal */}
      {gemiModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setGemiModal(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" style={{ backgroundColor: CARD_BG }}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
                <div>
                  <p className="text-sm font-semibold text-white">{gemiModal.gemiAdi}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{gemiModal.dosyalar.length} sevkiyat · {gemiModal.dosyalar.reduce((s, d) => s + d.konteyner, 0)} konteyner</p>
                </div>
                <button onClick={() => setGemiModal(null)} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }}>
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                    <tr>
                      <th className="text-left px-4 py-2.5 font-semibold uppercase text-[10px]" style={{ color: TEXT_MUTED }}>Dosya</th>
                      <th className="text-left px-4 py-2.5 font-semibold uppercase text-[10px]" style={{ color: TEXT_MUTED }}>Müşteri</th>
                      <th className="text-left px-4 py-2.5 font-semibold uppercase text-[10px]" style={{ color: TEXT_MUTED }}>Liman</th>
                      <th className="text-center px-4 py-2.5 font-semibold uppercase text-[10px]" style={{ color: TEXT_MUTED }}>Kont.</th>
                      <th className="text-left px-4 py-2.5 font-semibold uppercase text-[10px]" style={{ color: TEXT_MUTED }}>ETD</th>
                      <th className="text-left px-4 py-2.5 font-semibold uppercase text-[10px]" style={{ color: TEXT_MUTED }}>ETA</th>
                      <th className="text-right px-4 py-2.5 font-semibold uppercase text-[10px]" style={{ color: TEXT_MUTED }}>Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gemiModal.dosyalar.map((d, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-white/[0.03]" style={{ borderColor: CARD_BORDER }}>
                        <td className="px-4 py-2.5 font-medium text-white">{d.dosyaNo}</td>
                        <td className="px-4 py-2.5 max-w-[120px] truncate" style={{ color: TEXT_MUTED }}>{d.aliciFirma}</td>
                        <td className="px-4 py-2.5" style={{ color: TEXT_MUTED }}>{d.varisLimani}</td>
                        <td className="px-4 py-2.5 text-center font-medium text-white">{d.konteyner}</td>
                        <td className="px-4 py-2.5" style={{ color: TEXT_MUTED }}>{d.etd ? formatDateTR(d.etd) : "—"}</td>
                        <td className="px-4 py-2.5" style={{ color: TEXT_MUTED }}>{d.eta ? formatDateTR(d.eta) : "—"}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-white">{formatCurrency(d.tutar, d.paraBirimi)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Başlık */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-white">Analiz</h1>
          <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{filtrelenmis.length} dosya üzerinden hesaplanıyor</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded border text-xs overflow-hidden" style={{ borderColor: CARD_BORDER }}>
            {(["tumu", "tamamlanan"] as const).map(f => (
              <button key={f} onClick={() => setDurumFiltre(f)}
                className="px-3 py-1.5 transition-colors"
                style={durumFiltre === f ? { backgroundColor: NAVY, color: "white" } : { backgroundColor: CARD_BG, color: TEXT_MUTED }}>
                {f === "tumu" ? "Tümü" : "Tamamlananlar"}
              </button>
            ))}
          </div>
          <div className="flex rounded border text-xs overflow-hidden" style={{ borderColor: CARD_BORDER }}>
            {YILLAR.map(y => (
              <button key={y} onClick={() => setYilFiltre(y)}
                className="px-3 py-1.5 transition-colors"
                style={yilFiltre === y ? { backgroundColor: NAVY, color: "white" } : { backgroundColor: CARD_BG, color: TEXT_MUTED }}>
                {y}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="rounded-lg border p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>Toplam Hacim</p>
          <p className="text-2xl font-bold text-white">{formatCurrency(toplamHacim, paraBirimi)}</p>
        </div>
        <div className="rounded-lg border p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>Toplam Konteyner</p>
          <p className="text-2xl font-bold text-white">{toplamKonteyner}</p>
        </div>
        <div className="rounded-lg border p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>Toplam MTS</p>
          <p className="text-2xl font-bold text-white">{toplamMts.toLocaleString("tr-TR")}</p>
          <p className="text-[10px]" style={{ color: TEXT_MUTED }}>metrik ton</p>
        </div>
        <div className="rounded-lg border p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>Dosya Durumu</p>
          <p className="text-2xl font-bold text-white">{kapaliSayisi} <span className="text-base font-normal" style={{ color: TEXT_MUTED }}>/ {filtrelenmis.length}</span></p>
          <p className="text-[10px]" style={{ color: TEXT_MUTED }}>{acikSayisi} açık dosya</p>
        </div>
      </div>

      {/* Aylık Trend */}
      {aylikTrend.length > 0 && (
        <div className="rounded-lg border mb-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: CARD_BORDER }}>
            <div className="flex items-center gap-2">
              <BarChart2 size={13} style={{ color: TEXT_MUTED }} />
              <span className="text-xs font-semibold text-white">Aylık Trend</span>
            </div>
            <div className="flex items-center gap-4 text-[10px]" style={{ color: TEXT_MUTED }}>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: NAVY }} /> Hacim</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: CARD_BORDER }} /> Konteyner</span>
            </div>
          </div>
          <div className="px-5 pt-4 pb-3">
            <div className="flex items-end gap-2" style={{ height: 120 }}>
              {aylikTrend.map((item, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                    {item.ay}: {formatCurrency(item.tutar, paraBirimi)} / {item.konteyner} kont.
                  </div>
                  <div className="w-full flex items-end gap-0.5" style={{ height: 96 }}>
                    <div className="flex-1 rounded-t-sm" style={{ height: `${Math.max((item.tutar / maxTutar) * 100, 3)}%`, backgroundColor: NAVY }} />
                    <div className="flex-1 rounded-t-sm" style={{ height: `${Math.max((item.konteyner / maxKont) * 100, 3)}%`, backgroundColor: CARD_BORDER }} />
                  </div>
                  <p className="text-[9px] text-center" style={{ color: TEXT_MUTED }}>{item.ay}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Satır 1: Müşteriler + Limanlar + Acenteler */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#E2E8F0" }}>
            <div className="flex items-center gap-1.5"><Users size={12} className="text-slate-400" /><span className="text-xs font-semibold text-slate-600">Müşteriler</span></div>
            <span className="text-[10px] text-slate-400">Hacim</span>
          </div>
          <div className="divide-y" style={{ borderColor: "#F8FAFC" }}>
            {enCokMusteriler.length === 0 ? <p className="px-4 py-6 text-xs text-slate-400 text-center">Veri yok</p> :
              enCokMusteriler.map((item, i) => (
                <div key={item.ad} className="px-4 py-2.5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-slate-300 font-bold w-3 shrink-0">{i + 1}</span>
                      <span className="text-xs text-slate-700 truncate">{item.ad}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-800 shrink-0 ml-2">{formatCurrency(item.tutar, paraBirimi)}</span>
                  </div>
                  <HBar value={item.tutar} max={enCokMusteriler[0]?.tutar || 1} color="#F59E0B" />
                  <p className="text-[9px] text-slate-400 mt-0.5">{item.adet} dosya · {item.konteyner} konteyner</p>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#E2E8F0" }}>
            <div className="flex items-center gap-1.5"><Globe2 size={12} className="text-slate-400" /><span className="text-xs font-semibold text-slate-600">Varış Limanları</span></div>
            <span className="text-[10px] text-slate-400">Konteyner</span>
          </div>
          <div className="divide-y" style={{ borderColor: "#F8FAFC" }}>
            {enCokLimanlar.length === 0 ? <p className="px-4 py-6 text-xs text-slate-400 text-center">Veri yok</p> :
              enCokLimanlar.map((item, i) => (
                <div key={item.ad} className="px-4 py-2.5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-slate-300 font-bold w-3 shrink-0">{i + 1}</span>
                      <span className="text-xs text-slate-700 truncate">{item.ad}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-800 shrink-0 ml-2">{item.konteyner} kont.</span>
                  </div>
                  <HBar value={item.konteyner} max={enCokLimanlar[0]?.konteyner || 1} color={NAVY} />
                  <p className="text-[9px] text-slate-400 mt-0.5">{item.adet} dosya · {formatCurrency(item.tutar, paraBirimi)}</p>
                </div>
              ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#E2E8F0" }}>
            <div className="flex items-center gap-1.5"><Ship size={12} className="text-slate-400" /><span className="text-xs font-semibold text-slate-600">Acenteler</span></div>
            <span className="text-[10px] text-slate-400">Konteyner</span>
          </div>
          <div className="divide-y" style={{ borderColor: "#F8FAFC" }}>
            {enCokAcenteler.length === 0 ? <p className="px-4 py-6 text-xs text-slate-400 text-center">Veri yok</p> :
              enCokAcenteler.map((item, i) => (
                <div key={item.ad} className="px-4 py-2.5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-slate-300 font-bold w-3 shrink-0">{i + 1}</span>
                      <span className="text-xs text-slate-700 truncate">{item.ad}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-800 shrink-0 ml-2">{item.konteyner}</span>
                  </div>
                  <HBar value={item.konteyner} max={enCokAcenteler[0]?.konteyner || 1} color="#6366F1" />
                  <p className="text-[9px] text-slate-400 mt-0.5">{item.adet} rezervasyon</p>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Satır 2: Birim Fiyat + Teslim Şekli + Transit Süresi */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Liman Bazlı Birim Fiyat */}
        <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#E2E8F0" }}>
            <div className="flex items-center gap-1.5"><Globe2 size={12} className="text-slate-400" /><span className="text-xs font-semibold text-slate-600">Birim Fiyat (Liman)</span></div>
            <span className="text-[10px] text-slate-400">$/MTS</span>
          </div>
          <div className="divide-y" style={{ borderColor: "#F8FAFC" }}>
            {ulkeFiyat.length === 0 ? <p className="px-4 py-6 text-xs text-slate-400 text-center">Veri yok</p> :
              ulkeFiyat.map((item, i) => (
                <div key={item.liman} className="px-4 py-2.5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-slate-300 font-bold w-3 shrink-0">{i + 1}</span>
                      <span className="text-xs text-slate-700 truncate">{item.liman}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-800 shrink-0 ml-2">${item.birimFiyat.toFixed(0)}/MTS</span>
                  </div>
                  <HBar value={item.birimFiyat} max={ulkeFiyat[0]?.birimFiyat || 1} color="#10B981" />
                  <p className="text-[9px] text-slate-400 mt-0.5">{item.mts.toLocaleString("tr-TR")} MTS toplam</p>
                </div>
              ))}
          </div>
        </div>

        {/* Teslim Şekli */}
        <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#E2E8F0" }}>
            <div className="flex items-center gap-1.5"><Truck size={12} className="text-slate-400" /><span className="text-xs font-semibold text-slate-600">Teslim Şekli</span></div>
            <span className="text-[10px] text-slate-400">Dosya</span>
          </div>
          <div className="divide-y" style={{ borderColor: "#F8FAFC" }}>
            {teslimSekli.length === 0 ? <p className="px-4 py-6 text-xs text-slate-400 text-center">Veri yok</p> :
              teslimSekli.map((item, i) => (
                <div key={item.tip} className="px-4 py-2.5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-slate-300 font-bold w-3 shrink-0">{i + 1}</span>
                      <span className="text-xs font-semibold text-slate-700">{item.tip}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-800 shrink-0 ml-2">{item.adet} dosya</span>
                  </div>
                  <HBar value={item.adet} max={teslimSekli[0]?.adet || 1} color="#8B5CF6" />
                  <p className="text-[9px] text-slate-400 mt-0.5">%{Math.round((item.adet / filtrelenmis.length) * 100)} oran</p>
                </div>
              ))}
          </div>
        </div>

        {/* Transit Süresi */}
        <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "#E2E8F0" }}>
            <div className="flex items-center gap-1.5"><Clock size={12} className="text-slate-400" /><span className="text-xs font-semibold text-slate-600">Ortalama Transit Süresi</span></div>
            <span className="text-[10px] text-slate-400">Gün</span>
          </div>
          <div className="divide-y" style={{ borderColor: "#F8FAFC" }}>
            {transitSuresi.length === 0 ? (
              <p className="px-4 py-6 text-xs text-slate-400 text-center">ETA girilince hesaplanır</p>
            ) : transitSuresi.map((item, i) => (
              <div key={item.liman} className="px-4 py-2.5 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-slate-300 font-bold w-3 shrink-0">{i + 1}</span>
                    <span className="text-xs text-slate-700 truncate">{item.liman}</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-800 shrink-0 ml-2">{item.ortalama} gün</span>
                </div>
                <HBar value={item.ortalama} max={Math.max(...transitSuresi.map(t => t.ortalama), 1)} color="#F59E0B" />
                <p className="text-[9px] text-slate-400 mt-0.5">{item.adet} rezervasyon</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gemiler */}
      {gemiler.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden mb-4" style={{ borderColor: "#E2E8F0" }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: "#E2E8F0" }}>
            <div className="flex items-center gap-1.5">
              <Ship size={12} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-600">Gemi Başına Konteyner</span>
              <span className="text-[10px] text-slate-400 ml-1">— detay için tıklayın</span>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b bg-slate-50" style={{ borderColor: "#E2E8F0" }}>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase">#</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase">Gemi Adı</th>
                <th className="text-center px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase">Dosya</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase">Konteyner</th>
              </tr>
            </thead>
            <tbody>
              {gemiler.map((g, i) => (
                <tr
                  key={g.ad}
                  className="border-b last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                  style={{ borderColor: "#F1F5F9" }}
                  onClick={() => handleGemiClick(g.ad)}
                >
                  <td className="px-4 py-2.5 text-[10px] text-slate-300 font-bold">{i + 1}</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-slate-700">{g.ad}</td>
                  <td className="px-4 py-2.5 text-xs text-center text-slate-500">{g.dosyaSayisi}</td>
                  <td className="px-4 py-2.5 text-xs text-right font-semibold text-slate-800">{g.konteyner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Son Sevkiyatlar */}
      {sonSevkiyatlar.length > 0 && (
        <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
          <div className="px-4 py-3 border-b flex items-center gap-1.5" style={{ borderColor: "#E2E8F0" }}>
            <Package size={12} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-600">Son Tamamlanan Sevkiyatlar</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b bg-slate-50" style={{ borderColor: "#E2E8F0" }}>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase">Dosya</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase">Müşteri</th>
                <th className="text-left px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase">Liman</th>
                <th className="text-center px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase">Kont.</th>
                <th className="text-right px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {sonSevkiyatlar.map(d => (
                <tr key={d.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors" style={{ borderColor: "#F1F5F9" }}>
                  <td className="px-4 py-2.5 text-xs font-medium text-slate-700">{d.dosya_no}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 max-w-[140px] truncate">{d.alici_firma || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{d.varis_limani || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-center font-medium text-slate-700">{d.konteynerler.length}</td>
                  <td className="px-4 py-2.5 text-xs text-right font-semibold text-slate-800">{formatCurrency(d.toplam_tutar, d.para_birimi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}