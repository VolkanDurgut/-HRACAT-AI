"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { formatDateTR } from "@/lib/cutoff-utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app-shell";
import {
  Ship, FileText, CheckCircle2, AlertTriangle, Clock,
  Package, Mail, TrendingUp, ChevronRight, Anchor, ExternalLink, Loader2
} from "lucide-react";
import InfoTooltip from "@/components/info-tooltip";

const CARD_BG = "#12161F";
const CARD_BORDER = "#1E2530";
const TEXT_MUTED = "#8B95A5";
const ACCENT = "#10B981";

type DosyaDurum = {
  dosya: Dosya;
  rezervasyonlar: Rezervasyon[];
  konteynerler: Konteyner[];
};

function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function CutoffBadge({ days, label }: { days: number | null; label: string }) {
  if (days === null) return null;
  const color = days < 0 ? "bg-red-100 text-red-700" : days <= 1 ? "bg-red-100 text-red-700 animate-pulse" : days <= 3 ? "bg-amber-100 text-amber-700 animate-pulse" : "bg-slate-100 text-slate-600";
  const text = days < 0 ? "Geçti" : days === 0 ? "Bugün!" : `${days}g`;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {label}: {text}
    </span>
  );
}

function AkisAdimi({ tamamlandi, bekliyor, label, sublabel, tooltip }: { tamamlandi: boolean; bekliyor?: boolean; label: string; sublabel?: string; tooltip?: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <div className="relative flex flex-col items-center gap-0.5 min-w-[64px] pb-1"
      onMouseEnter={() => tooltip && setHover(true)}
      onMouseLeave={() => setHover(false)}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
        tamamlandi ? "bg-green-500 border-green-500 text-white" :
        bekliyor ? "bg-amber-400 border-amber-400 text-white animate-pulse" :
        "border-2"
      } ${tooltip ? "cursor-pointer" : ""}`}
      style={!tamamlandi && !bekliyor ? { backgroundColor: "#1A1F2B", borderColor: "#2A3141" } : undefined}>
        {tamamlandi ? <CheckCircle2 size={12} /> : bekliyor ? <Clock size={12} /> : <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#3A4152" }} />}
      </div>
      <p className={`text-[9px] font-medium text-center leading-tight ${tamamlandi ? "text-green-400" : bekliyor ? "text-amber-400" : ""}`} style={!tamamlandi && !bekliyor ? { color: "#5A6272" } : undefined}>{label}</p>
      {sublabel && <p className="text-[8px] text-center" style={{ color: "#5A6272" }}>{sublabel}</p>}
      {tooltip && hover && (
        <div className="absolute top-full left-0 pt-1.5 z-30" style={{ width: "max-content", maxWidth: "320px" }}>
          <div className="p-3 rounded-lg shadow-lg border bg-white animate-fade-in overflow-y-auto"
            style={{ borderColor: "#E2E8F0", maxHeight: "min(60vh, 400px)" }}>
            {tooltip}
          </div>
        </div>
      )}
    </div>
  );
}

function AkisConnector({ tamamlandi }: { tamamlandi: boolean }) {
  return (
    <div className={`flex-1 h-0.5 mt-3 rounded transition-all ${tamamlandi ? "bg-green-400" : ""}`} style={!tamamlandi ? { backgroundColor: "#2A3141" } : undefined} />
  );
}

export default function DashboardPage() {
  const { user, yetkiler, companyId } = useAuth(); // Global context'ten companyId alındı
  const router = useRouter();
  const [durumlar, setDurumlar] = useState<DosyaDurum[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user || !companyId) return; // companyId kontrolü eklendi
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari")
      .select("*")
      .eq("company_id", companyId) // Sadece bu şirketin dosyaları kontrol merkezine gelir
      .order("olusturma_tarihi", { ascending: false });
    if (!dosyaData) { setDurumlar([]); setLoading(false); return; } // Temiz sıfırlama

    const dosyaIds = dosyaData.map((d: Dosya) => d.id);

    const [{ data: rezData }, { data: kontData }] = await Promise.all([
      supabase.from("rezervasyonlar").select("*").in("dosya_id", dosyaIds).eq("company_id", companyId), // Şirket filtresi eklendi
      supabase.from("konteynerler").select("*").in("dosya_id", dosyaIds).eq("company_id", companyId), // Şirket filtresi eklendi
    ]);

    const combined: DosyaDurum[] = dosyaData.map((d: Dosya) => ({
      dosya: d,
      rezervasyonlar: (rezData || []).filter((r: Rezervasyon) => r.dosya_id === d.id),
      konteynerler: (kontData || []).filter((k: Konteyner) => k.dosya_id === d.id),
    }));

    setDurumlar(combined);
    setLoading(false);
  }, [user, companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!yetkiler.sayfa_yetkileri.dashboard) {
      router.replace("/panel");
    }
  }, [yetkiler, router]);

  const aciklar = durumlar.filter(d => d.dosya.durum !== "Kapalı" && d.dosya.durum !== "Kapali");
  const kapalilar = durumlar.filter(d => d.dosya.durum === "Kapalı" || d.dosya.durum === "Kapali");

  const bekleyenRez = aciklar.filter(d => d.rezervasyonlar.length === 0).length;

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3" style={{ color: TEXT_MUTED }}>
            <Loader2 size={24} className="animate-spin" style={{ color: ACCENT }} />
            <span className="text-sm">Yükleniyor...</span>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Baslik */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <Anchor size={24} style={{ color: ACCENT }} />
          <h1 className="text-2xl font-bold text-white">Kontrol Merkezi</h1>
        </div>
        <p className="text-sm ml-9" style={{ color: TEXT_MUTED }}>Tüm ihracat operasyonlarının anlık durumu</p>
      </div>

      {/* Ozet kartlar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { key: "aktif", label: "Aktif Dosya", value: aciklar.length, icon: <FileText size={18} />, color: ACCENT, bg: "#0F2A20", pulse: false, href: "/panel" },
          { key: "rezervasyon", label: "Rezervasyon Bekleyen", value: bekleyenRez, icon: <Ship size={18} />, color: bekleyenRez > 0 ? "#F87171" : "#34D399", bg: bekleyenRez > 0 ? "#2A1519" : "#0F2A20", pulse: bekleyenRez > 0, href: "/panel?filter=rezervasyon" },
          { key: "kapali", label: "Kapalı Dosya", value: kapalilar.length, icon: <CheckCircle2 size={18} />, color: TEXT_MUTED, bg: CARD_BG, pulse: false, href: "/ihracatlar" },
        ].map((m, idx) => (
          <div
            key={m.label}
            onClick={() => router.push(m.href)}
            className={`rounded-xl border shadow-sm p-3 flex items-center gap-3 cursor-pointer hover:border-white/20 transition-colors animate-fade-up stagger-${idx + 1}`}
            style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}
          >
            <div className={`p-1.5 rounded-lg shrink-0 ${m.pulse ? "animate-pulse" : ""}`} style={{ backgroundColor: m.bg, color: m.color }}>
              {m.icon}
            </div>
            <p className="text-xs font-medium flex-1 truncate" style={{ color: TEXT_MUTED }}>{m.label}</p>
            {m.key === "rezervasyon" && bekleyenRez > 0 && (
              <InfoTooltip variant="warning" position="bottom" align="right" width="w-72">
                <span className="font-semibold text-amber-600">Rezervasyon bekleyen dosyalar:</span>
                <ul className="mt-1.5 space-y-1.5">
                  {aciklar.filter(d => d.rezervasyonlar.length === 0).map(({ dosya }) => {
                    const urunler = (dosya.urun_detaylari as any[]) || [];
                    const toplamMts = urunler.reduce((s: number, u: any) => s + parseFloat(String(u.miktar_mts || u.quantity || 0)), 0);
                    return (
                      <li key={dosya.id} className="text-slate-600">
                        <span className="font-medium text-slate-800">{dosya.alici_firma || "Firma belirtilmemiş"}</span>
                        {" — "}{dosya.varis_limani || "Varış limanı belirtilmemiş"}
                        {toplamMts > 0 && ` — ${toplamMts.toLocaleString("tr-TR")} MTS`}
                      </li>
                    );
                  })}
                </ul>
              </InfoTooltip>
            )}
            {m.key === "aktif" && aciklar.length > 0 && (
              <InfoTooltip variant="info" position="bottom" align="right" width="w-80">
                <span className="font-semibold text-slate-700">Aktif dosyalar:</span>
                <div className="mt-2 space-y-3 max-h-80 overflow-y-auto">
                  {aciklar.map(({ dosya, rezervasyonlar }) => {
                    const rez = rezervasyonlar[0];
                    const tCutoff = getDaysUntil(rez?.talimat_cutoff || null);
                    const bCutoff = getDaysUntil(rez?.beyanname_cutoff || null);
                    return (
                      <div key={dosya.id} className="pb-2 border-b last:border-0" style={{ borderColor: "#F1F5F9" }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">Açık</span>
                          <span className="font-semibold text-slate-800">{dosya.dosya_no}</span>
                        </div>
                        <p className="text-slate-500">{dosya.alici_firma || "-"} {rez?.konteyner_adedi ? `— ${rez.konteyner_adedi}x` : ""} {dosya.varis_limani ? `— ${dosya.varis_limani}` : ""}</p>
                        {dosya.proforma_no && <p className="text-slate-400">Proforma: {dosya.proforma_no}</p>}
                        {rez?.booking_no && <p className="text-slate-400">Booking: {rez.booking_no}{rez?.gemi_adi ? ` — ${rez.gemi_adi}` : ""}</p>}
                        {rez?.gemi_kalkis_tarihi && <p className="text-slate-400">Kalkış: {formatDateTR(rez.gemi_kalkis_tarihi)}</p>}
                        {tCutoff !== null && <p className="text-slate-400">Talimat Cut-Off: {tCutoff < 0 ? "Geçti" : `${tCutoff} gün`}</p>}
                        {bCutoff !== null && <p className="text-slate-400">Beyanname Cut-Off: {bCutoff < 0 ? "Geçti" : `${bCutoff} gün`}</p>}
                      </div>
                    );
                  })}
                </div>
              </InfoTooltip>
            )}
            <p className="text-xl font-bold shrink-0" style={{ color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Aktif dosyalar - akis durumu */}
      {aciklar.length > 0 && (
        <div className="space-y-2 mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} style={{ color: ACCENT }} />
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Aktif Dosyalar — İş Akışı</h2>
          </div>

          {aciklar.map(({ dosya, rezervasyonlar, konteynerler }, idx) => {
            const rez = rezervasyonlar[0];
            const rezVar = rezervasyonlar.length > 0;
            const faturaKesildi = !!dosya.fatura_dosya_url;
            const konsimentoVar = !!dosya.konsimento_dosya_url;
            const toplamKont = konteynerler.length;
            const dbaYuklenen = konteynerler.filter(k => k.dba_dosya_url).length;
            const tumDbaHazir = toplamKont > 0 && dbaYuklenen === toplamKont;
            const rezervasyonKontAdedi = rezervasyonlar.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
            const konteynerlerTamam = rezervasyonKontAdedi > 0 && toplamKont === rezervasyonKontAdedi;

            const talimatCutoffGun = getDaysUntil(rez?.talimat_cutoff || null);
            const beyannameCutoffGun = getDaysUntil(rez?.beyanname_cutoff || null);
            const staggerClass = idx < 8 ? `stagger-${idx + 1}` : "stagger-8";

            return (
              <div key={dosya.id} className={`rounded-xl border shadow-sm animate-fade-up ${staggerClass}`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                {/* Dosya baslik */}
                <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#22c55e" }} />
                    <div>
                      <p className="text-sm font-bold text-white">{dosya.dosya_no}</p>
                      <p className="text-xs" style={{ color: TEXT_MUTED }}>{dosya.alici_firma || "-"}</p>
                    </div>
                    {rez?.booking_no && (
                      <span className="ml-2 text-xs font-mono px-2 py-0.5 rounded" style={{ backgroundColor: CARD_BORDER, color: TEXT_MUTED }}>
                        {rez.booking_no}
                      </span>
                    )}
                    {rez?.gemi_adi && (
                      <span className="text-xs flex items-center gap-1" style={{ color: TEXT_MUTED }}>
                        <Ship size={11} /> {rez.gemi_adi}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {talimatCutoffGun !== null && <CutoffBadge days={talimatCutoffGun} label="Talimat" />}
                    {beyannameCutoffGun !== null && <CutoffBadge days={beyannameCutoffGun} label="Beyanname" />}
                    <Link href={`/dosya/${dosya.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white transition-colors hover:opacity-90 whitespace-nowrap"
                      style={{ backgroundColor: ACCENT }}>
                      <ExternalLink size={12} /> Detay
                    </Link>
                  </div>
                </div>

                {/* Akis adımlari */}
                <div className="px-4 py-2">
                  <div className="flex items-start gap-0">
                    <AkisAdimi
                      tamamlandi={rezVar}
                      bekliyor={!rezVar}
                      label="Rezervasyon"
                      sublabel={rez?.booking_no || undefined}
                      tooltip={rezVar ? (
                        <div className="space-y-1.5 text-xs text-slate-700">
                          <p><span className="font-semibold text-slate-500">Booking No:</span> {rez?.booking_no || "-"}</p>
                          <p><span className="font-semibold text-slate-500">Gemi Adı:</span> {rez?.gemi_adi || "-"}</p>
                          <p><span className="font-semibold text-slate-500">Acente:</span> {rez?.acente_ismi || "-"}</p>
                          <p><span className="font-semibold text-slate-500">Yükleme Limanı:</span> {rez?.yuklenme_limani || "-"}</p>
                          <p><span className="font-semibold text-slate-500">Konteyner Adedi:</span> {rez?.konteyner_adedi || "-"}</p>
                          <p><span className="font-semibold text-slate-500">Gemi Kalkış:</span> {rez?.gemi_kalkis_tarihi ? formatDateTR(rez.gemi_kalkis_tarihi) : "-"}</p>
                        </div>
                      ) : undefined}
                    />
                    <AkisConnector tamamlandi={rezVar} />
                    <AkisAdimi
                      tamamlandi={konteynerlerTamam}
                      bekliyor={rezVar && !konteynerlerTamam}
                      label="Konteynerler"
                      sublabel={`${toplamKont}/${rezervasyonKontAdedi}`}
                      tooltip={toplamKont > 0 ? (
                        <table className="text-xs w-full" style={{ minWidth: "280px" }}>
                          <thead>
                            <tr className="border-b" style={{ borderColor: "#F1F5F9" }}>
                              <th className="text-left font-semibold text-slate-500 pb-1.5 pr-2">Konteyner</th>
                              <th className="text-right font-semibold text-slate-500 pb-1.5 pr-2">Net</th>
                              <th className="text-right font-semibold text-slate-500 pb-1.5 pr-2">Brüt</th>
                              <th className="text-right font-semibold text-slate-500 pb-1.5">Kap</th>
                            </tr>
                          </thead>
                          <tbody>
                            {konteynerler.map((k) => (
                              <tr key={k.id} className="border-b last:border-0" style={{ borderColor: "#F8FAFC" }}>
                                <td className="font-mono text-slate-800 py-1 pr-2">{k.konteyner_no}</td>
                                <td className="text-right text-slate-600 py-1 pr-2">{k.net_agirlik_kg || "-"}</td>
                                <td className="text-right text-slate-600 py-1 pr-2">{(k as any).brut_agirlik_kg || "-"}</td>
                                <td className="text-right text-slate-600 py-1">{(k as any).pieces || "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : undefined}
                    />
                    <AkisConnector tamamlandi={konteynerlerTamam} />
                    <AkisAdimi
                      tamamlandi={faturaKesildi}
                      bekliyor={konteynerlerTamam && !faturaKesildi}
                      label="Fatura Kesildi"
                      tooltip={faturaKesildi && dosya.fatura_dosya_url ? (
                        <a href={dosya.fatura_dosya_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs font-medium text-amber-700 hover:text-amber-800 pointer-events-auto">
                          <FileText size={14} /> Faturayı Aç
                        </a>
                      ) : undefined}
                    />
                    <AkisConnector tamamlandi={faturaKesildi} />
                    <AkisAdimi
                      tamamlandi={konsimentoVar}
                      bekliyor={faturaKesildi && !konsimentoVar}
                      label="Konşimento"
                      tooltip={konsimentoVar && dosya.konsimento_dosya_url ? (
                        <a href={dosya.konsimento_dosya_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs font-medium text-amber-700 hover:text-amber-800 pointer-events-auto">
                          <FileText size={14} /> Konşimentoyu Aç
                        </a>
                      ) : undefined}
                    />
                    <AkisConnector tamamlandi={tumDbaHazir} />
                    <AkisAdimi tamamlandi={tumDbaHazir} bekliyor={!tumDbaHazir && toplamKont > 0} label="DBA" sublabel={toplamKont > 0 ? `${dbaYuklenen}/${toplamKont}` : undefined} />
                  </div>
                </div>

                {/* Eksik isler uyarisi */}
                {(() => {
                  const eksikler = [];
                  if (!rezVar) eksikler.push("Rezervasyon girilmedi");
                  if (rezVar && !konteynerlerTamam) eksikler.push(`${rezervasyonKontAdedi - toplamKont} konteyner eksik`);
                  if (konteynerlerTamam && !faturaKesildi) eksikler.push("Fatura henüz kesilmedi");
                  if (faturaKesildi && !konsimentoVar) eksikler.push("Konşimento talimatı yüklenmedi");
                  if (toplamKont > 0 && !tumDbaHazir) eksikler.push(`${toplamKont - dbaYuklenen} DBA bekleniyor`);
                  if (eksikler.length === 0) return null;
                  return (
                    <div className="px-4 py-1.5 border-t flex items-center gap-2 flex-wrap" style={{ borderColor: CARD_BORDER }}>
                      <AlertTriangle size={12} className="text-amber-400 shrink-0" />
                      {eksikler.map((e, i) => (
                        <span key={i} className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">{e}</span>
                      ))}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Kapali dosyalar - ozet */}
      {kapalilar.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Package size={16} style={{ color: TEXT_MUTED }} />
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Tamamlanan Dosyalar</h2>
          </div>
          <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>Dosya No</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>Alıcı</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>Konteyner</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>Booking No</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>Gemi</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}>Kalkış</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: TEXT_MUTED }}></th>
                </tr>
              </thead>
              <tbody>
                {kapalilar.map(({ dosya, rezervasyonlar }, idx) => {
                  const rez = rezervasyonlar[0];
                  const staggerClass = idx < 8 ? `stagger-${idx + 1}` : "stagger-8";
                  return (
                    <tr key={dosya.id} className={`border-b last:border-0 opacity-70 hover:opacity-100 transition-opacity animate-fade-up ${staggerClass}`} style={{ borderColor: CARD_BORDER }}>
                      <td className="px-4 py-3 text-sm font-medium text-white">{dosya.dosya_no}</td>
                      <td className="px-4 py-3 text-xs max-w-[180px] truncate" style={{ color: TEXT_MUTED }}>{dosya.alici_firma || "-"}</td>
                      <td className="px-4 py-3 text-xs text-right" style={{ color: TEXT_MUTED }}>{rez?.konteyner_adedi || "-"}</td>
                      <td className="px-4 py-3 text-xs font-mono" style={{ color: TEXT_MUTED }}>{rez?.booking_no || "-"}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: TEXT_MUTED }}>{rez?.gemi_adi || "-"}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: TEXT_MUTED }}>{rez?.gemi_kalkis_tarihi ? formatDateTR(rez.gemi_kalkis_tarihi) : "-"}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dosya/${dosya.id}`} className="text-xs hover:text-amber-500" style={{ color: TEXT_MUTED }}>
                          <ChevronRight size={14} />
                        </Link>
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

      {durumlar.length === 0 && (
        <div className="text-center py-20">
          <Ship size={48} className="text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Henüz hiç dosya yok.</p>
          <Link href="/yeni-dosya" className="text-amber-600 text-sm mt-2 inline-block hover:underline">+ Yeni Dosya Aç</Link>
        </div>
      )}
    </AppShell>
  );
}
