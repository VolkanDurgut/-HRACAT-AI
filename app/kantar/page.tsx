"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useDbaUpload } from "@/lib/hooks/use-dba-upload";
import { Weight, Upload, CheckCircle2, AlertTriangle, Loader2, FileText, RefreshCw, Search } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, PAGE_BG, ROW_HEADER_BG } from "@/lib/theme";

type KonteynerRow = {
  id: string;
  konteyner_no: string;
  muhur_no: string | null;
  tip: string;
  dosya_id: string;
  dosya_no: string;
  plaka: string | null;
  tare_kg: number | null;
  net_agirlik_kg: number | null;
  vgm_kg: number | null;
  dba_dosya_url: string | null;
  dba_dosya_adi: string | null;
  dba_yukleme_tarihi: string | null;
  dba_kontrol_sonucu: { uyusmazliklar?: string[] } | null;
  dba_belge_no: string | null;
  irsaliye_dosya_url: string | null;
  irsaliye_dosya_adi: string | null;
  irsaliye_yukleme_tarihi: string | null;
  booking_no: string | null;
  marka: string | null;
  maskeli_musteri: string;
};

/** Müşteri adını maskeler: her kelimenin ilk harfi görünür, gerisi yıldız. */
function maskeleMusteri(isim: string | null | undefined): string {
  if (!isim) return "-";
  return isim
    .split(" ")
    .map((kelime) => {
      if (kelime.length <= 1) return kelime;
      return kelime[0] + "*".repeat(kelime.length - 1);
    })
    .join(" ");
}

export default function KantarPage() {
  const { user, companyId } = useAuth();
  const [konteynerler, setKonteynerler] = useState<KonteynerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [arama, setArama] = useState("");

  const { yukleniyor, hatalar, yukleDba, inputRefs } = useDbaUpload();

  const fetchKonteynerler = useCallback(async () => {
    if (!user || !companyId) return;

    // ONCE sadece ACIK dosyalar cekilir. Kantar panelinin ilgi alani zaten
    // yalnizca acik (henuz sevk edilmemis) dosyalarin konteynerleridir - bu
    // sayede konteynerler tablosunun tum tarihcesi degil, sadece guncel alt
    // kume cekilir. Sirket yillar boyunca veri biriktirdikce bu sayfa
    // yavaslamaz, cunku "acik dosya" sayisi dogasi geregi sinirlidir.
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari")
      .select("id, dosya_no, durum, marka, alici_firma")
      .eq("company_id", companyId)
      .or("durum.eq.Açık,durum.eq.Acik");

    if (!dosyaData || dosyaData.length === 0) { setKonteynerler([]); setLoading(false); return; }

    const dosyaIds = dosyaData.map((d) => d.id);
    const dosyaMap: Record<string, { dosya_no: string; marka: string | null; alici_firma: string | null }> = {};
    dosyaData.forEach((d: any) => { dosyaMap[d.id] = { dosya_no: d.dosya_no, marka: d.marka, alici_firma: d.alici_firma }; });

    // REZERVASYON BULMA - İYİLEŞTİRİLDİ
    // Konteynerin rezervasyon_id'si boş olsa bile, dosya üzerinden booking no bulur.
    const [{ data: kontData }, { data: rezData }] = await Promise.all([
      supabase
        .from("konteynerler")
        .select("id, konteyner_no, muhur_no, tip, dosya_id, rezervasyon_id, plaka, tare_kg, net_agirlik_kg, vgm_kg, dba_dosya_url, dba_dosya_adi, dba_yukleme_tarihi, dba_kontrol_sonucu, dba_belge_no, marka, irsaliye_dosya_url, irsaliye_dosya_adi, irsaliye_yukleme_tarihi")
        .eq("company_id", companyId)
        .in("dosya_id", dosyaIds),
      supabase
        .from("rezervasyonlar")
        .select("id, booking_no, dosya_id")
        .eq("company_id", companyId)
        .in("dosya_id", dosyaIds),
    ]);

    if (!kontData || kontData.length === 0) { setKonteynerler([]); setLoading(false); return; }

    const rezDosyaMap: Record<string, string> = {};
    const rezIdMap: Record<string, string> = {};
    (rezData || []).forEach((r: any) => {
      if (r.booking_no) {
        rezDosyaMap[r.dosya_id] = r.booking_no;
        rezIdMap[r.id] = r.booking_no;
      }
    });

    const enriched = (kontData as any[])
      .map((k) => ({
        ...k,
        dosya_no: dosyaMap[k.dosya_id].dosya_no,
        marka: k.marka || dosyaMap[k.dosya_id].marka,
        booking_no: k.rezervasyon_id ? (rezIdMap[k.rezervasyon_id] || rezDosyaMap[k.dosya_id] || null) : (rezDosyaMap[k.dosya_id] || null),
        maskeli_musteri: maskeleMusteri(dosyaMap[k.dosya_id].alici_firma),
      })) as KonteynerRow[];

    setKonteynerler(enriched);
    setLoading(false);
  }, [user, companyId]);

  useEffect(() => { 
    if (user && companyId) fetchKonteynerler(); 
  }, [fetchKonteynerler, user, companyId]);

  useEffect(() => {
    if (!user || !companyId) return;
    const channel = supabase
      .channel("kantar-konteynerler")
      .on("postgres_changes", { event: "*", schema: "public", table: "konteynerler", filter: `company_id=eq.${companyId}` }, () => {
        fetchKonteynerler();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchKonteynerler, user, companyId]);

  const handleDbaYukle = async (konteyner: KonteynerRow, file: File) => {
    await yukleDba(konteyner, file);
    fetchKonteynerler();
  };

  const bekleyenler = konteynerler.filter(k => !k.dba_dosya_url);
  const tamamlananlar = konteynerler.filter(k => !!k.dba_dosya_url);

  // Konteyner no, muhur no, plaka, dosya no veya rez no ile arama.
  const aramaFiltre = (list: KonteynerRow[]) => {
    const q = arama.trim().toLowerCase();
    if (!q) return list;
    return list.filter(k =>
      k.konteyner_no.toLowerCase().includes(q) ||
      (k.muhur_no || "").toLowerCase().includes(q) ||
      (k.plaka || "").toLowerCase().includes(q) ||
      k.dosya_no.toLowerCase().includes(q) ||
      (k.booking_no || "").toLowerCase().includes(q)
    );
  };

  const bekleyenlerFiltreli = aramaFiltre(bekleyenler);
  const tamamlananlarFiltreli = aramaFiltre(tamamlananlar);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center" style={{ backgroundColor: PAGE_BG }}>
        <div className="flex items-center gap-3" style={{ color: TEXT_MUTED }}>
          <Loader2 size={24} className="animate-spin" style={{ color: ACCENT }} />
          <span>Yükleniyor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full flex flex-col p-4 md:p-6 overflow-hidden" style={{ backgroundColor: PAGE_BG }}>
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full min-h-0 gap-5">

        {/* Üst Başlık Sabit */}
        <div className="shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{ backgroundColor: ACCENT }}>
              <Weight size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">Kantar Paneli</h1>
              <p className="text-xs font-medium" style={{ color: TEXT_MUTED }}>DBA belgelerini yükleyin</p>
            </div>
          </div>
          <button onClick={fetchKonteynerler}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors shadow-sm hover:bg-white/5"
            style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, color: TEXT_MUTED }}>
            <RefreshCw size={14} /> Yenile
          </button>
        </div>

        {/* Arama */}
        <div className="shrink-0 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: TEXT_MUTED }} />
          <input
            type="text"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Konteyner no, mühür no, plaka veya dosya no ile ara..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
          />
        </div>

        {/* Özet Kartları Sabit */}
        <div className="shrink-0 grid grid-cols-2 gap-4">
          <div className="rounded-xl border p-4 shadow-sm animate-fade-up stagger-1" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>DBA Beklenen</p>
            <p className="text-2xl font-bold text-amber-400">{bekleyenler.length}</p>
          </div>
          <div className="rounded-xl border p-4 shadow-sm animate-fade-up stagger-2" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>Tamamlanan</p>
            <p className="text-2xl font-bold text-emerald-400">{tamamlananlar.length}</p>
          </div>
        </div>

        {/* İçerik Alanı (Sadece bu bölüm scroll olur) */}
        <div className="flex-1 overflow-y-auto min-h-0 pb-10 pr-2 space-y-6" style={{ scrollbarWidth: "thin" }}>
          
          {/* Bekleyen DBA'lar - tek liste */}
          {bekleyenlerFiltreli.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold flex items-center gap-2 text-white">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> DBA Bekleyen İhracatlar
                <span className="text-xs font-normal" style={{ color: TEXT_MUTED }}>({bekleyenlerFiltreli.length})</span>
              </h2>
              <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 backdrop-blur border-b z-10" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase" style={{ color: TEXT_MUTED }}>Konteyner</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase" style={{ color: TEXT_MUTED }}>Mühür / Plaka</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase" style={{ color: TEXT_MUTED }}>Çuval / Dosya</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase" style={{ color: TEXT_MUTED }}>Müşteri</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase" style={{ color: TEXT_MUTED }}>Rez No</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-center" style={{ color: TEXT_MUTED }}>İrsaliye</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-center w-24" style={{ color: TEXT_MUTED }}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bekleyenlerFiltreli.map((k, idx) => (
                      <tr key={k.id} className={`border-b last:border-0 hover:bg-white/[0.03] transition-colors animate-fade-up stagger-${Math.min(idx + 1, 8)}`} style={{ borderColor: CARD_BORDER }}>
                        <td className="px-4 py-2.5">
                          <div className="text-xs font-bold font-mono text-white">{k.konteyner_no}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{k.tip}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-[10px] font-mono" style={{ color: TEXT_MUTED }}>{k.muhur_no || "-"}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{k.plaka || "-"}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-xs font-medium text-white truncate max-w-[140px]" title={k.marka || "-"}>{k.marka || "-"}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{k.dosya_no}</div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-white">{k.maskeli_musteri}</td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: TEXT_MUTED }}>{k.booking_no || "-"}</td>
                        <td className="px-4 py-2.5 text-center">
                          {k.irsaliye_dosya_url ? (
                            <a href={k.irsaliye_dosya_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                              title="İrsaliyeyi görüntüle / indir / yazdır (açılan sekmede Ctrl+P)">
                              <FileText size={11} /> Gör
                            </a>
                          ) : (
                            <span className="text-[10px]" style={{ color: TEXT_MUTED }}>Yok</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {yukleniyor[k.id] ? (
                            <Loader2 size={14} className="animate-spin mx-auto" style={{ color: TEXT_MUTED }} />
                          ) : (
                            <div className="flex flex-col items-center">
                              <label className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded border cursor-pointer text-[10px] font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                                style={{ borderColor: "rgba(251,191,36,0.35)" }}>
                                <Upload size={10} className="text-amber-400" /> DBA
                                <input type="file" accept="application/pdf" className="hidden"
                                  ref={(el) => { inputRefs.current[k.id] = el; }}
                                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDbaYukle(k, f); }} />
                              </label>
                              {hatalar[k.id] && <p className="text-[9px] text-red-400 leading-tight mt-1 max-w-[90px] mx-auto truncate" title={hatalar[k.id]}>{hatalar[k.id]}</p>}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* Tamamlanan DBA'lar - tek liste */}
          {tamamlananlarFiltreli.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold flex items-center gap-2 text-white">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> DBA Tamamlanan Konteynerler
                <span className="text-xs font-normal" style={{ color: TEXT_MUTED }}>({tamamlananlarFiltreli.length})</span>
              </h2>
              <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 backdrop-blur border-b z-10" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase" style={{ color: TEXT_MUTED }}>Konteyner</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase" style={{ color: TEXT_MUTED }}>Dosya</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase" style={{ color: TEXT_MUTED }}>Müşteri</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-right" style={{ color: TEXT_MUTED }}>Ağırlıklar</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-center" style={{ color: TEXT_MUTED }}>İrsaliye</th>
                      <th className="px-4 py-2.5 text-[10px] font-bold uppercase text-center w-16" style={{ color: TEXT_MUTED }}>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tamamlananlarFiltreli.map((k, idx) => {
                      const uyusmazlik = (k.dba_kontrol_sonucu?.uyusmazliklar?.length ?? 0) > 0;
                      return (
                        <tr key={k.id} className={`border-b last:border-0 hover:bg-white/[0.03] transition-colors animate-fade-up stagger-${Math.min(idx + 1, 8)}`} style={{ borderColor: CARD_BORDER }}>
                          <td className="px-4 py-2.5">
                            <div className="text-xs font-bold font-mono text-white">{k.konteyner_no}</div>
                            <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{k.plaka || "-"}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="text-xs font-medium text-white truncate max-w-[140px]" title={k.marka || "-"}>{k.marka || "-"}</div>
                            <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{k.dosya_no}</div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-white">{k.maskeli_musteri}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="text-[10px]" style={{ color: TEXT_MUTED }}>Dara: {k.tare_kg ? `${k.tare_kg.toLocaleString("tr-TR")} kg` : "-"}</div>
                            <div className="text-xs font-bold text-white mt-0.5">VGM: {k.vgm_kg ? `${k.vgm_kg.toLocaleString("tr-TR")} kg` : "-"}</div>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {k.irsaliye_dosya_url ? (
                              <a href={k.irsaliye_dosya_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                                title="İrsaliyeyi görüntüle / indir / yazdır (açılan sekmede Ctrl+P)">
                                <FileText size={11} /> Gör
                              </a>
                            ) : (
                              <span className="text-[10px]" style={{ color: TEXT_MUTED }}>Yok</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span title={uyusmazlik ? "Uyuşmazlık var" : "Onaylı"}>
                                {uyusmazlik ? <AlertTriangle size={15} className="text-amber-400" /> : <CheckCircle2 size={15} className="text-emerald-400" />}
                              </span>
                              {k.dba_dosya_url && (
                                <a href={k.dba_dosya_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-7 h-7 rounded-md transition-colors shadow-sm hover:text-white" style={{ backgroundColor: CARD_BORDER, color: TEXT_MUTED }} title="DBA Belgesini Gör">
                                  <FileText size={13} />
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {konteynerler.length === 0 && (
            <div className="rounded-xl border shadow-sm p-12 text-center animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <Weight size={40} className="mx-auto mb-3" style={{ color: CARD_BORDER }} />
              <p className="text-sm font-medium" style={{ color: TEXT_MUTED }}>Aktif dosyada konteyner bulunamadı.</p>
            </div>
          )}

          {konteynerler.length > 0 && bekleyenlerFiltreli.length === 0 && tamamlananlarFiltreli.length === 0 && (
            <div className="rounded-xl border shadow-sm p-12 text-center animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <Search size={40} className="mx-auto mb-3" style={{ color: CARD_BORDER }} />
              <p className="text-sm font-medium" style={{ color: TEXT_MUTED }}>"{arama}" ile eşleşen konteyner bulunamadı.</p>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}