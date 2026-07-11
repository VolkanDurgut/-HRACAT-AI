"use client";

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context"; // useAuth ithal edildi
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
};

export default function KantarPage() {
  const { user, companyId } = useAuth(); // Global context'ten companyId alındı
  const [konteynerler, setKonteynerler] = useState<KonteynerRow[]>([]);
  const [loading, setLoading] = useState(true);

  // DBA yukleme - ortak hook kullaniliyor
  const { yukleniyor, hatalar, yukleDba, inputRefs } = useDbaUpload();

  const fetchKonteynerler = useCallback(async () => {
    if (!user || !companyId) return; // Güvenlik kontrolü eklendi
    
    const { data: kontData } = await supabase
      .from("konteynerler")
      .select("id, konteyner_no, muhur_no, tip, dosya_id, plaka, tare_kg, net_agirlik_kg, vgm_kg, dba_dosya_url, dba_dosya_adi, dba_yukleme_tarihi, dba_kontrol_sonucu, dba_belge_no")
      .eq("company_id", companyId); // Sadece bu şirketin konteynerleri çekilir

    if (!kontData || kontData.length === 0) { setKonteynerler([]); setLoading(false); return; } // Temiz sıfırlama eklendi

    const dosyaIds = Array.from(new Set(kontData.map((k) => k.dosya_id)));
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari")
      .select("id, dosya_no, durum")
      .in("id", dosyaIds)
      .eq("company_id", companyId) // Sadece bu şirketin dosyalarıyla eşleştirilir
      .or("durum.eq.Açık,durum.eq.Acik");

    const dosyaMap: Record<string, string> = {};
    (dosyaData || []).forEach((d) => { dosyaMap[d.id] = d.dosya_no; });

    const enriched = (kontData as KonteynerRow[])
      .filter((k) => dosyaMap[k.dosya_id])
      .map((k) => ({ ...k, dosya_no: dosyaMap[k.dosya_id] }));

    setKonteynerler(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { 
    if (user && companyId) fetchKonteynerler(); 
  }, [fetchKonteynerler, user, companyId]); // Bağımlılık zinciri güncellendi

  useEffect(() => {
    if (!user || !companyId) return; // Oturum yoksa dinleme başlatılmaz
    
    const channel = supabase
      .channel("kantar-konteynerler")
      .on("postgres_changes", { event: "*", schema: "public", table: "konteynerler" }, () => {
        fetchKonteynerler();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchKonteynerler, user, companyId]); // Bağımlılık zinciri güncellendi

  const handleDbaYukle = async (konteyner: KonteynerRow, file: File) => {
    await yukleDba(konteyner, file);
    fetchKonteynerler();
  };

  const bekleyenler = konteynerler.filter(k => !k.dba_dosya_url);
  const tamamlananlar = konteynerler.filter(k => !!k.dba_dosya_url);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F8F9FA" }}>
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 size={24} className="animate-spin" />
          <span>Yükleniyor...</span>
        </div>
      </div>
    );
  }

  const tableHeader = (
    <thead>
      <tr className="border-b bg-slate-50" style={{ borderColor: "#E2E8F0" }}>
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Konteyner No</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Mühür No</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Tip</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Dosya</th>
        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">Plaka</th>
        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">Dara</th>
        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500">VGM</th>
        <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500">DBA</th>
      </tr>
    </thead>
  );

  return (
    <div className="min-h-screen p-6" style={{ backgroundColor: "#F8F9FA" }}>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Baslik */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#1B2B4B" }}>
              <Weight size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: "#1B2B4B" }}>Kantar Paneli</h1>
              <p className="text-sm text-slate-500">DBA belgelerini yükleyin</p>
            </div>
          </div>
          <button onClick={fetchKonteynerler}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white border text-slate-600 hover:bg-slate-50 transition-colors"
            style={{ borderColor: "#E2E8F0" }}>
            <RefreshCw size={14} /> Yenile
          </button>
        </div>

        {/* Ozet */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border p-4 shadow-sm animate-fade-up stagger-1" style={{ borderColor: "#E2E8F0" }}>
            <p className="text-xs font-medium text-slate-500 mb-1">DBA Beklenen</p>
            <p className="text-2xl font-bold text-amber-500">{bekleyenler.length}</p>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm animate-fade-up stagger-2" style={{ borderColor: "#E2E8F0" }}>
            <p className="text-xs font-medium text-slate-500 mb-1">Tamamlanan</p>
            <p className="text-2xl font-bold text-green-600">{tamamlananlar.length}</p>
          </div>
        </div>

        {/* Bekleyen DBA'lar */}
        {bekleyenler.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">
              DBA Beklenen Konteynerler ({bekleyenler.length} adet)
            </p>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  {tableHeader}
                  <tbody>
                    {bekleyenler.map((k, idx) => {
                      const staggerClass = idx < 8 ? `stagger-${idx + 1}` : "stagger-8";
                      return (
                      <tr key={k.id} className={`border-b last:border-0 animate-fade-up ${staggerClass}`} style={{ borderColor: "#F1F5F9" }}>
                        <td className="px-4 py-3">
                          <p className="text-sm font-bold font-mono" style={{ color: "#1B2B4B" }}>{k.konteyner_no}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 font-mono">{k.muhur_no || "-"}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{k.tip}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{k.dosya_no}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">—</td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">—</td>
                        <td className="px-4 py-3 text-sm text-slate-300 text-right">—</td>
                        <td className="px-4 py-3 text-center">
                          {yukleniyor[k.id] ? (
                            <Loader2 size={16} className="animate-spin text-slate-400 mx-auto" />
                          ) : (
                            <div className="space-y-1">
                              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
                                style={{ borderColor: "#fcd34d" }}>
                                <Upload size={13} className="text-amber-500" />
                                DBA Yükle
                                <input type="file" accept="application/pdf" className="hidden"
                                  ref={(el) => { inputRefs.current[k.id] = el; }}
                                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDbaYukle(k, f); }} />
                              </label>
                              {hatalar[k.id] && (
                                <p className="text-xs text-red-500 max-w-[200px] text-left">{hatalar[k.id]}</p>
                              )}
                            </div>
                          )}
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

        {/* Tamamlanan DBA'lar */}
        {tamamlananlar.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">
              Tamamlanan DBA'lar ({tamamlananlar.length} adet)
            </p>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  {tableHeader}
                  <tbody>
                    {tamamlananlar.map((k, idx) => {
                      const uyusmazlik = (k.dba_kontrol_sonucu?.uyusmazliklar?.length ?? 0) > 0;
                      const staggerClass = idx < 8 ? `stagger-${idx + 1}` : "stagger-8";
                      return (
                        <tr key={k.id} className={`border-b last:border-0 animate-fade-up ${staggerClass}`} style={{ borderColor: "#F1F5F9" }}>
                          <td className="px-4 py-3">
                            <p className="text-sm font-bold font-mono" style={{ color: "#1B2B4B" }}>{k.konteyner_no}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 font-mono">{k.muhur_no || "-"}</td>
                          <td className="px-4 py-3 text-sm text-slate-600">{k.tip}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">{k.dosya_no}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-700">{k.plaka || "-"}</td>
                          <td className="px-4 py-3 text-sm text-slate-600 text-right">{k.tare_kg ? `${k.tare_kg} KG` : "-"}</td>
                          <td className="px-4 py-3 text-sm font-bold text-right" style={{ color: "#1B2B4B" }}>{k.vgm_kg ? `${k.vgm_kg} KG` : "-"}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {uyusmazlik ? (
                                <AlertTriangle size={14} className="text-amber-500" />
                              ) : (
                                <CheckCircle2 size={14} className="text-green-500" />
                              )}
                              {k.dba_dosya_url && (
                                <a href={k.dba_dosya_url} target="_blank" rel="noopener noreferrer"
                                  className="text-slate-500 hover:text-slate-700">
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
          <div className="bg-white rounded-xl border shadow-sm p-12 text-center" style={{ borderColor: "#E2E8F0" }}>
            <Weight size={40} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-500">Aktif dosyada konteyner bulunamadı.</p>
          </div>
        )}
      </div>
    </div>
  );
}
