"use client";

import React, { useEffect, useState, useMemo, Suspense, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { useSearchParams, useRouter } from "next/navigation";
import { isCutoffApproaching, getCutOffLabel, getCutOffDays, formatDateTR, formatDateTimeTR } from "@/lib/cutoff-utils";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Trash2, ExternalLink, FolderX, Loader2 } from "lucide-react";

type FilterType = "tumu" | "cutoff" | "rezervasyon" | "acik";
type DosyaWithRelations = Dosya & { rezervasyonlar: Rezervasyon[]; konteynerler: Konteyner[] };

function StatusBadge({ label, color }: { label: string; color: string }) {
  return <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${color}`}>{label}</span>;
}

function PanelContent() {
  const { user, yetkiler, companyId } = useAuth(); // Global context'ten companyId alındı
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const initialFilter = searchParams.get("filter") || "tumu";
  const [dosyalar, setDosyalar] = useState<DosyaWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>(initialFilter as FilterType);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; dosyaNo: string } | null>(null);

  const fetchDosyalar = useCallback(async () => {
    if (!user || !companyId) return; // companyId kontrolü eklendi
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari")
      .select("*")
      .eq("company_id", companyId) // Sadece giriş yapan şirketin dosyaları çekilir
      .or("durum.eq.Açık,durum.eq.Acik")
      .order("olusturma_tarihi", { ascending: false });

    if (!dosyaData) { setDosyalar([]); setLoading(false); return; }

    const dosyaIds = dosyaData.map((d: Dosya) => d.id);
    const [rezRes, kontRes] = await Promise.all([
      supabase.from("rezervasyonlar").select("*").in("dosya_id", dosyaIds).eq("company_id", companyId), // Şirket filtresi eklendi
      supabase.from("konteynerler").select("*").in("dosya_id", dosyaIds).eq("company_id", companyId), // Şirket filtresi eklendi
    ]);

    const rezMap: Record<string, Rezervasyon[]> = {};
    (rezRes.data || []).forEach((r: Rezervasyon) => {
      if (!rezMap[r.dosya_id]) rezMap[r.dosya_id] = [];
      rezMap[r.dosya_id].push(r);
    });
    const kontMap: Record<string, Konteyner[]> = {};
    (kontRes.data || []).forEach((k: Konteyner) => {
      if (!kontMap[k.dosya_id]) kontMap[k.dosya_id] = [];
      kontMap[k.dosya_id].push(k);
    });

    const enriched = dosyaData.map((d: Dosya) => ({
      ...d,
      rezervasyonlar: rezMap[d.id] || [],
      konteynerler: kontMap[d.id] || [],
    }));
    setDosyalar(enriched);
    setLoading(false);
  }, [user, companyId]);

  useEffect(() => { fetchDosyalar(); }, [fetchDosyalar]);

  const handleDelete = async () => {
    if (!deleteTarget || !companyId) return;
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari").select("ana_siparis_id").eq("id", deleteTarget.id).eq("company_id", companyId).maybeSingle(); // Şirket filtresi eklendi
    const anaSiparisId = dosyaData?.ana_siparis_id;
    const { error } = await supabase.from("ihracat_dosyalari").delete().eq("id", deleteTarget.id).eq("company_id", companyId); // Şirket filtresi eklendi
    if (error) { showToast("Dosya silinirken hata olustu.", "error"); setDeleteTarget(null); return; }
    if (anaSiparisId) {
      const { count } = await supabase.from("ihracat_dosyalari").select("id", { count: "exact", head: true }).eq("ana_siparis_id", anaSiparisId).eq("company_id", companyId); // Şirket filtresi eklendi
      if (!count || count === 0) await supabase.from("ana_siparisler").delete().eq("id", anaSiparisId).eq("company_id", companyId); // Şirket filtresi eklendi
    }
    showToast(`${deleteTarget.dosyaNo} basariyla silindi.`, "success");
    fetchDosyalar();
    setDeleteTarget(null);
  };

  const filteredDosyalar = useMemo(() => {
    switch (activeFilter) {
      case "cutoff": return dosyalar.filter((d) => d.rezervasyonlar.some((r) => isCutoffApproaching(r.talimat_cutoff, r.beyanname_cutoff)));
      case "rezervasyon": return dosyalar.filter((d) => d.rezervasyonlar.length === 0 && (d.durum === "Açık" || d.durum === "Acik"));
      case "acik": return dosyalar.filter((d) => d.durum === "Açık" || d.durum === "Acik");
      default: return dosyalar;
    }
  }, [dosyalar, activeFilter]);

  const filters: { key: FilterType; label: string }[] = [
    { key: "tumu", label: "Tümü" },
    { key: "cutoff", label: "Cut-Off Yaklaşan" },
    { key: "rezervasyon", label: "Rezervasyon Bekleyen" },
    { key: "acik", label: "Açık" },
  ];

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-800">Ana Panel</h1>
          <p className="text-xs text-slate-400 mt-0.5">{filteredDosyalar.length} açık dosya</p>
        </div>
        <div className="flex gap-1.5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeFilter === f.key ? "text-white" : "bg-white text-slate-500 border hover:border-slate-300"
              }`}
              style={activeFilter === f.key ? { backgroundColor: "#1B2B4B" } : { borderColor: "#E2E8F0" }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Emin misiniz?"
        description={`${deleteTarget?.dosyaNo || ""} dosyasını silmek istediğinize emin misiniz?`}
        confirmLabel="Evet, Sil"
        cancelLabel="Hayır"
        onConfirm={handleDelete}
        destructive
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : filteredDosyalar.length === 0 ? (
        <EmptyState icon={<FolderX size={48} />} title="Dosya bulunamadı" description="Filtre kriterlerinizi değiştirin veya yeni dosya açın" />
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: "#E2E8F0" }}>
          {/* Tablo başlığı */}
          <div className="grid text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-4 py-2.5 border-b bg-slate-50" style={{ borderColor: "#E2E8F0", gridTemplateColumns: "140px 1fr 120px 100px 100px 110px 110px 130px" }}>
            <span>Proforma No</span>
            <span>Müşteri</span>
            <span>Booking No</span>
            <span>Gemi Kalkış</span>
            <span>Konteyner</span>
            <span>Talimat C/O</span>
            <span>Beyanname C/O</span>
            <span className="text-right">İşlemler</span>
          </div>

          {/* Satırlar */}
          {filteredDosyalar.map((dosya) => {
            const latestRez = dosya.rezervasyonlar[0] || null;
            const hasRez = !!latestRez;
            const tCutoff = latestRez?.talimat_cutoff ? getCutOffLabel(latestRez.talimat_cutoff) : null;
            const bCutoff = latestRez?.beyanname_cutoff ? getCutOffLabel(latestRez.beyanname_cutoff) : null;
            const konteynerAdedi = dosya.rezervasyonlar.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
            const eklenenKont = dosya.konteynerler.length;
            const dbaTamamlanan = dosya.konteynerler.filter((k) => !!k.dba_dosya_url).length;

            const akisAdimlari = [
              { label: "Rezervasyon", done: dosya.rezervasyonlar.length > 0 },
              { label: "Konteynerler", done: konteynerAdedi > 0 && eklenenKont >= konteynerAdedi },
              { label: "Fatura Kesildi", done: !!(dosya as any).fatura_no },
              { label: "Konşimento", done: !!dosya.konsimento_dosya_url },
              { label: "DBA", done: dbaTamamlanan > 0 && dbaTamamlanan >= eklenenKont },
              { label: "VGM", done: dosya.konteynerler.some((k) => !!k.vgm_kg) },
            ];

            return (
              <React.Fragment key={dosya.id}>
                {/* Ana satır */}
                <div
                  className="grid items-center px-4 py-3 border-b hover:bg-slate-50/60 transition-colors"
                  style={{ borderColor: "#F1F5F9", gridTemplateColumns: "140px 1fr 120px 100px 100px 110px 110px 130px" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: "#1B2B4B" }}>{dosya.proforma_no || dosya.dosya_no}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{dosya.alici_firma || "—"}</p>
                    <p className="text-[10px] text-slate-400 truncate">{dosya.varis_limani || ""}</p>
                  </div>
                  {!hasRez
                    ? <span className="text-xs font-medium text-amber-500 animate-pulse" style={{ gridColumn: "3 / span 5" }}>Henüz rezervasyon alınmadı</span>
                    : <span className="text-xs text-slate-600 font-mono" style={{ gridColumn: 3 }}>{latestRez!.booking_no}</span>
                  }
                  {hasRez && <span className="text-xs text-slate-600" style={{ gridColumn: 4 }}>{latestRez!.gemi_kalkis_tarihi ? formatDateTR(latestRez!.gemi_kalkis_tarihi) : "—"}</span>}
                  {hasRez && <span className="text-xs text-slate-600" style={{ gridColumn: 5 }}>{konteynerAdedi > 0 ? `${eklenenKont}/${konteynerAdedi}` : "—"}</span>}
                  <div style={{ gridColumn: 6 }}>
                    {tCutoff ? (
                      <div>
                        <p className="text-[10px] text-slate-600">{formatDateTimeTR(latestRez!.talimat_cutoff!)}</p>
                        <StatusBadge label={tCutoff.text} color={tCutoff.color} />
                      </div>
                    ) : <span className="text-xs text-slate-300">—</span>}
                  </div>
                  <div style={{ gridColumn: 7 }}>
                    {bCutoff ? (
                      <div>
                        <p className="text-[10px] text-slate-600">{formatDateTimeTR(latestRez!.beyanname_cutoff!)}</p>
                        <StatusBadge label={bCutoff.text} color={bCutoff.color} />
                      </div>
                    ) : <span className="text-xs text-slate-300">—</span>}
                  </div>
                  <div className="flex items-center justify-end gap-1.5" style={{ gridColumn: 8 }}>
                    <button
                      onClick={() => router.push(`/dosya/${dosya.id}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white transition-colors hover:opacity-90 whitespace-nowrap"
                      style={{ backgroundColor: "#1B2B4B" }}
                    >
                      <ExternalLink size={12} /> Detay
                    </button>
                    {yetkiler.sayfa_yetkileri.yeni_dosya && (
                      <button
                        onClick={() => setDeleteTarget({ id: dosya.id, dosyaNo: dosya.dosya_no })}
                        title="Sil"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Durum adımları — kompakt tek satır */}
                <div className="px-4 py-2 border-b bg-slate-50/40 flex items-center gap-1.5 flex-wrap" style={{ borderColor: "#F1F5F9" }}>
                  {akisAdimlari.map((adim) => (
                    <span
                      key={adim.label}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${adim.done ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-400"}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${adim.done ? "bg-green-500" : "bg-slate-300"}`} />
                      {adim.label}
                    </span>
                  ))}
                  <span className="ml-auto text-[10px] text-slate-400 truncate max-w-[35%]">
                    {dosya.urun_tanimi || "—"} · {latestRez?.gemi_adi || "Gemi adı yok"}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

export default function PanelPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F8F9FA" }}><div className="animate-pulse text-slate-400">Yükleniyor...</div></div>}>
      <PanelContent />
    </Suspense>
  );
}