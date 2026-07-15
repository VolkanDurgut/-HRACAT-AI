"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useDbaUpload } from "@/lib/hooks/use-dba-upload";
import { Weight, Upload, CheckCircle2, AlertTriangle, Loader2, FileText, RefreshCw } from "lucide-react";

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

  const { yukleniyor, hatalar, yukleDba, inputRefs } = useDbaUpload();

  const fetchKonteynerler = useCallback(async () => {
    if (!user || !companyId) return;
    
    const { data: kontData } = await supabase
      .from("konteynerler")
      .select("id, konteyner_no, muhur_no, tip, dosya_id, rezervasyon_id, plaka, tare_kg, net_agirlik_kg, vgm_kg, dba_dosya_url, dba_dosya_adi, dba_yukleme_tarihi, dba_kontrol_sonucu, dba_belge_no")
      .eq("company_id", companyId);

    if (!kontData || kontData.length === 0) { setKonteynerler([]); setLoading(false); return; }

    const dosyaIds = Array.from(new Set(kontData.map((k) => k.dosya_id)));
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari")
      .select("id, dosya_no, durum, marka, alici_firma")
      .in("id", dosyaIds)
      .eq("company_id", companyId)
      .or("durum.eq.Açık,durum.eq.Acik");

    const dosyaMap: Record<string, { dosya_no: string; marka: string | null; alici_firma: string | null }> = {};
    (dosyaData || []).forEach((d: any) => { dosyaMap[d.id] = { dosya_no: d.dosya_no, marka: d.marka, alici_firma: d.alici_firma }; });

    // REZERVASYON BULMA - İYİLEŞTİRİLDİ
    // Konteynerin rezervasyon_id'si boş olsa bile, dosya üzerinden booking no bulur.
    const { data: rezData } = await supabase
      .from("rezervasyonlar")
      .select("id, booking_no, dosya_id")
      .in("dosya_id", dosyaIds)
      .eq("company_id", companyId);

    const rezDosyaMap: Record<string, string> = {};
    const rezIdMap: Record<string, string> = {};
    (rezData || []).forEach((r: any) => {
      if (r.booking_no) {
        rezDosyaMap[r.dosya_id] = r.booking_no;
        rezIdMap[r.id] = r.booking_no;
      }
    });

    const enriched = (kontData as any[])
      .filter((k) => dosyaMap[k.dosya_id])
      .map((k) => ({
        ...k,
        dosya_no: dosyaMap[k.dosya_id].dosya_no,
        marka: dosyaMap[k.dosya_id].marka,
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
      .on("postgres_changes", { event: "*", schema: "public", table: "konteynerler" }, () => {
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

  // Müşterilere (dosya_id) göre gruplama fonksiyonu
  const groupKonteynerler = (list: KonteynerRow[]) => {
    const map = new Map<string, KonteynerRow[]>();
    list.forEach(k => {
      if (!map.has(k.dosya_id)) map.set(k.dosya_id, []);
      map.get(k.dosya_id)!.push(k);
    });
    return Array.from(map.values());
  };

  const bekleyenGruplar = groupKonteynerler(bekleyenler);
  const tamamlananGruplar = groupKonteynerler(tamamlananlar);

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 size={24} className="animate-spin" />
          <span>Yükleniyor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full flex flex-col p-4 md:p-6 overflow-hidden bg-slate-50">
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full min-h-0 gap-5">

        {/* Üst Başlık Sabit */}
        <div className="shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-900 shadow-sm">
              <Weight size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-tight">Kantar Paneli</h1>
              <p className="text-xs font-medium text-slate-500">DBA belgelerini yükleyin</p>
            </div>
          </div>
          <button onClick={fetchKonteynerler}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white border text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
            style={{ borderColor: "#E2E8F0" }}>
            <RefreshCw size={14} /> Yenile
          </button>
        </div>

        {/* Özet Kartları Sabit */}
        <div className="shrink-0 grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">DBA Beklenen</p>
            <p className="text-2xl font-bold text-amber-500">{bekleyenler.length}</p>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tamamlanan</p>
            <p className="text-2xl font-bold text-emerald-600">{tamamlananlar.length}</p>
          </div>
        </div>

        {/* İçerik Alanı (Sadece bu bölüm scroll olur) */}
        <div className="flex-1 overflow-y-auto min-h-0 pb-10 pr-2 space-y-6" style={{ scrollbarWidth: "thin" }}>
          
          {/* Bekleyen DBA'lar */}
          {bekleyenGruplar.length > 0 && (
            <div className="space-y-3 mb-8">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> DBA Bekleyen İhracatlar
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {bekleyenGruplar.map((grup) => {
                  const ilk = grup[0];
                  return (
                    <div key={`bekleyen-${ilk.dosya_id}`} className="bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
                      {/* KART BAŞLIĞI */}
                      <div className="bg-amber-50/30 border-b p-3" style={{ borderColor: "#E2E8F0" }}>
                        <div className="flex items-center justify-between mb-1.5 gap-2">
                          <span className="font-bold text-slate-900 text-sm leading-tight truncate flex-1" title={ilk.maskeli_musteri}>{ilk.maskeli_musteri}</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-white text-slate-500 shrink-0">{ilk.dosya_no}</span>
                        </div>
                        <div className="flex flex-col gap-0.5 text-[11px] text-slate-500">
                          <span className="truncate"><strong className="text-slate-700">Rez No:</strong> {ilk.booking_no || "-"}</span>
                          <span className="truncate"><strong className="text-slate-700">Marka:</strong> {ilk.marka || "-"}</span>
                        </div>
                      </div>
                      
                      {/* KART İÇERİĞİ (MİNİ TABLO) */}
                      <div className="flex-1 overflow-y-auto max-h-[260px]" style={{ scrollbarWidth: "thin" }}>
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 bg-white/95 backdrop-blur border-b z-10" style={{ borderColor: "#E2E8F0" }}>
                            <tr>
                              <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Konteyner</th>
                              <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Detay</th>
                              <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase text-center w-20">İşlem</th>
                            </tr>
                          </thead>
                          <tbody>
                            {grup.map((k) => (
                              <tr key={k.id} className="border-b last:border-0 hover:bg-slate-50/50 transition-colors" style={{ borderColor: "#F1F5F9" }}>
                                <td className="px-3 py-2">
                                  <div className="text-xs font-bold font-mono text-slate-800">{k.konteyner_no}</div>
                                  <div className="text-[10px] text-slate-400 mt-0.5">{k.tip}</div>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="text-[10px] text-slate-600 font-mono truncate max-w-[80px]" title={k.muhur_no || "Mühür yok"}>{k.muhur_no || "-"}</div>
                                  <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[80px]" title={k.plaka || "Plaka yok"}>{k.plaka || "-"}</div>
                                </td>
                                <td className="px-3 py-2 align-middle text-center">
                                  {yukleniyor[k.id] ? (
                                    <Loader2 size={14} className="animate-spin text-slate-400 mx-auto" />
                                  ) : (
                                    <div className="flex flex-col items-center">
                                      <label className="inline-flex items-center justify-center gap-1 w-full px-2 py-1 rounded border cursor-pointer text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
                                        style={{ borderColor: "#fcd34d" }}>
                                        <Upload size={10} className="text-amber-500" /> DBA
                                        <input type="file" accept="application/pdf" className="hidden"
                                          ref={(el) => { inputRefs.current[k.id] = el; }}
                                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDbaYukle(k, f); }} />
                                      </label>
                                      {hatalar[k.id] && <p className="text-[9px] text-red-500 leading-tight mt-1 truncate max-w-[70px]" title={hatalar[k.id]}>{hatalar[k.id]}</p>}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tamamlanan DBA'lar */}
          {tamamlananGruplar.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> DBA Tamamlanan Dosyalar
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {tamamlananGruplar.map((grup) => {
                  const ilk = grup[0];
                  return (
                    <div key={`tamamlanan-${ilk.dosya_id}`} className="bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
                      {/* KART BAŞLIĞI */}
                      <div className="bg-emerald-50/30 border-b p-3" style={{ borderColor: "#E2E8F0" }}>
                        <div className="flex items-center justify-between mb-1.5 gap-2">
                          <span className="font-bold text-slate-900 text-sm leading-tight truncate flex-1" title={ilk.maskeli_musteri}>{ilk.maskeli_musteri}</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-white text-slate-500 shrink-0">{ilk.dosya_no}</span>
                        </div>
                        <div className="flex flex-col gap-0.5 text-[11px] text-slate-500">
                          <span className="truncate"><strong className="text-slate-700">Rez No:</strong> {ilk.booking_no || "-"}</span>
                          <span className="truncate"><strong className="text-slate-700">Marka:</strong> {ilk.marka || "-"}</span>
                        </div>
                      </div>
                      
                      {/* KART İÇERİĞİ (MİNİ TABLO) */}
                      <div className="flex-1 overflow-y-auto max-h-[260px]" style={{ scrollbarWidth: "thin" }}>
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 bg-white/95 backdrop-blur border-b z-10" style={{ borderColor: "#E2E8F0" }}>
                            <tr>
                              <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Konteyner</th>
                              <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase text-right">Ağırlıklar</th>
                              <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase text-center w-12">Durum</th>
                            </tr>
                          </thead>
                          <tbody>
                            {grup.map((k) => {
                              const uyusmazlik = (k.dba_kontrol_sonucu?.uyusmazliklar?.length ?? 0) > 0;
                              return (
                                <tr key={k.id} className="border-b last:border-0 hover:bg-slate-50/50 transition-colors" style={{ borderColor: "#F1F5F9" }}>
                                  <td className="px-3 py-2">
                                    <div className="text-xs font-bold font-mono text-slate-800">{k.konteyner_no}</div>
                                    <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[80px]" title={k.plaka || "Plaka yok"}>{k.plaka || "-"}</div>
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <div className="text-[10px] text-slate-500">Dara: {k.tare_kg ? `${k.tare_kg.toLocaleString("tr-TR")} kg` : "-"}</div>
                                    <div className="text-xs font-bold text-slate-800 mt-0.5">VGM: {k.vgm_kg ? `${k.vgm_kg.toLocaleString("tr-TR")} kg` : "-"}</div>
                                  </td>
                                  <td className="px-3 py-2 align-middle text-center">
                                    <div className="flex items-center justify-center gap-3">
                                      <span title={uyusmazlik ? "Uyuşmazlık var" : "Onaylı"}>
                                        {uyusmazlik ? <AlertTriangle size={15} className="text-amber-500" /> : <CheckCircle2 size={15} className="text-emerald-500" />}
                                      </span>
                                      {k.dba_dosya_url && (
                                        <a href={k.dba_dosya_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-7 h-7 rounded-md bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors shadow-sm" title="DBA Belgesini Gör">
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
                  );
                })}
              </div>
            </div>
          )}

          {konteynerler.length === 0 && (
            <div className="bg-white rounded-xl border shadow-sm p-12 text-center" style={{ borderColor: "#E2E8F0" }}>
              <Weight size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500">Aktif dosyada konteyner bulunamadı.</p>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}