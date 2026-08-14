"use client";

import React, { useEffect, useState, useCallback, Suspense } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, Dosya, Rezervasyon, Konteyner, SurecTakibi } from "@/lib/supabase";
import { formatCurrency, formatDateTR, formatDateTimeTR, autoSuggestContainers } from "@/lib/cutoff-utils";
import { MTS_PER_KONTEYNER } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { CopyableField } from "@/components/copyable-field";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { DetailSkeleton } from "@/components/skeleton-loaders";
import AppShell from "@/components/app-shell";
import RezervasyonTab from "@/components/rezervasyon-tab";
import KonteynerTab from "@/components/konteyner-tab";
import EkBilgilerCard from "@/components/ek-bilgiler-card";
import BankaBilgileriCard from "@/components/banka-bilgileri-card";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Loader2, Package, FileCheck, Copy } from "lucide-react";
import InfoTooltip from "@/components/info-tooltip";
import FaturaUploadSection from "@/components/fatura-upload-section";
import EvrakOlusturButtons from "@/components/evrak-olustur-buttons";
import DraftBlSection from "@/components/draft-bl-section";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

type TabKey = "proforma" | "evraklar" | "rezervasyon" | "konteynerler";

type FaturaKontrolSonucu = {
  uyumlu: boolean;
  uyusmazliklar: { alan: string; sistemde: string; dosyada: string }[];
  ozet: string;
  fatura_no: string;
  fatura_tarihi: string;
};

type EvrakTuru = "ci" | "pl" | "fc";

const EVRAK_SIRASI: { anahtar: string; baslik: string; evrakTuru?: EvrakTuru }[] = [
  { anahtar: "Commercial Invoice", baslik: "Commercial Invoice", evrakTuru: "ci" },
  { anahtar: "Packing List", baslik: "Packing List", evrakTuru: "pl" },
  { anahtar: "Bill of Lading", baslik: "Bill of Lading" },
  { anahtar: "Certificate of Origin", baslik: "Certificate of Origin" },
  { anahtar: "Phytosanitary", baslik: "Phytosanitary Certificate" },
  { anahtar: "Health Certificate", baslik: "Health Certificate" },
  { anahtar: "Quality And Weight", baslik: "Quality Certificate" },
  { anahtar: "Fumigation", baslik: "Fumigation Certificate", evrakTuru: "fc" },
  { anahtar: "Photographic Loading", baslik: "Final Loading Report" },
  { anahtar: "Insurance", baslik: "Insurance Policy" },
];

function evrakEslestir(evraklar: string[], anahtar: string): string | null {
  return evraklar.find((e) => e.toLowerCase().includes(anahtar.toLowerCase())) || null;
}

function DosyaDetailContent() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, yetkiler, companyId } = useAuth(); // companyId global context'ten alındı
  const { showToast } = useToast();
  const [dosya, setDosya] = useState<Dosya | null>(null);
  const [rezervasyonlar, setRezervasyonlar] = useState<Rezervasyon[]>([]);
  const [konteynerler, setKonteynerler] = useState<Konteyner[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>((searchParams.get("tab") as TabKey) || "proforma");

  const fetchData = useCallback(async () => {
    if (!id || !user || !companyId) return; // companyId kontrolü eklendi
    const [dosyaRes, rezRes, kontRes] = await Promise.all([
      supabase.from("ihracat_dosyalari").select("*").eq("id", id).eq("company_id", companyId).single(),
      supabase.from("rezervasyonlar").select("*").eq("dosya_id", id).eq("company_id", companyId),
      supabase.from("konteynerler").select("*").eq("dosya_id", id).eq("company_id", companyId).order("olusturma_tarihi", { ascending: true }).order("id", { ascending: true }),
    ]);
    if (dosyaRes.data) setDosya(dosyaRes.data);
    setRezervasyonlar(rezRes.data || []);
    setKonteynerler(kontRes.data || []);
    setLoading(false);
  }, [id, user, companyId]); // Bağımlılık zincirine companyId eklendi

  useEffect(() => { fetchData(); }, [fetchData]);

  const [showDurumConfirm, setShowDurumConfirm] = useState(false);
  const [durumSaving, setDurumSaving] = useState(false);

  const handleDurumButtonClick = () => {
    if (!dosya) return;
    const isAcik = dosya.durum === "Açık" || dosya.durum === "Acik";
    if (isAcik) {
      const rezervasyonKonteynerAdedi = rezervasyonlar.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
      const eklenenKonteynerAdedi = konteynerler.length;
      if (rezervasyonKonteynerAdedi > 0 && eklenenKonteynerAdedi < rezervasyonKonteynerAdedi) {
        showToast(`Dosya kapatılamaz: ${eklenenKonteynerAdedi}/${rezervasyonKonteynerAdedi} konteyner eklendi. Lütfen önce tüm konteynerleri ekleyin.`, "error");
        return;
      }
      setShowDurumConfirm(true);
    } else {
      confirmToggleDurum();
    }
  };

  const confirmToggleDurum = async () => {
    if (!dosya || !companyId) return;
    setDurumSaving(true);
    const isAcik = dosya.durum === "Açık" || dosya.durum === "Acik";
    const newDurum = isAcik ? "Kapalı" : "Açık";
    await supabase.from("ihracat_dosyalari").update({ durum: newDurum }).eq("id", dosya.id).eq("company_id", companyId);
    showToast(newDurum === "Kapalı" ? "Dosya kapatıldı." : "Dosya yeniden açıldı.", "success");
    setDurumSaving(false);
    setShowDurumConfirm(false);
    if (isAcik) {
      router.push("/panel");
    } else {
      setDosya({ ...dosya, durum: newDurum });
    }
  };

  const updateToplamKonteyner = async (val: number) => {
    if (!dosya || !companyId) return;
    await supabase.from("ihracat_dosyalari").update({ toplam_konteyner: val }).eq("id", dosya.id).eq("company_id", companyId);
    setDosya({ ...dosya, toplam_konteyner: val });
    showToast("Toplam konteyner guncellendi.", "success");
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "proforma",     label: "Proforma Bilgileri" },
    { key: "evraklar",     label: "Sevkiyat Evraklari" },
    { key: "rezervasyon",  label: "Rezervasyon" },
    { key: "konteynerler", label: "Konteynerler" },
  ];

  const canAccessTab = (key: TabKey): boolean => yetkiler.sekme_yetkileri[key];

  if (loading) return <AppShell><DetailSkeleton /></AppShell>;

  if (!dosya || !companyId) {
    return (
      <AppShell>
        <div className="text-center py-20">
          <p className="text-slate-400">Dosya bulunamadi</p>
          <button onClick={() => router.push("/panel")} className="text-emerald-600 text-sm mt-2 hover:underline">
            Ana Panele Don
          </button>
        </div>
      </AppShell>
    );
  }

  const konsimentoBekliyor = !!dosya.fatura_talimati_gonderildi && !dosya.konsimento_dosya_url;

  return (
    <AppShell>
      <ConfirmDialog
        open={showDurumConfirm}
        onOpenChange={(open) => setShowDurumConfirm(open)}
        title="Dosyayı kapatmak istediğinize emin misiniz?"
        description={`${dosya.dosya_no} dosyasını kapatmak üzeresiniz. Kapatılan dosya İhracatlar arşivine taşınacaktır. Bu işlemi daha sonra geri alabilirsiniz.`}
        confirmLabel="Evet, Kapat"
        cancelLabel="Vazgeç"
        onConfirm={confirmToggleDurum}
        destructive
        loading={durumSaving}
        loadingLabel="Kapatılıyor..."
      />

      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">📁 {dosya.dosya_no}</h1>
            <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>Olusturulma: {formatDateTimeTR(dosya.olusturma_tarihi)}</p>
          </div>
          {yetkiler.sayfa_yetkileri.yeni_dosya && (
            <button
              onClick={handleDurumButtonClick}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                (dosya.durum === "Açık" || dosya.durum === "Acik") ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-green-500/10 text-green-400 hover:bg-green-500/20"
              }`}
            >
              {(dosya.durum === "Açık" || dosya.durum === "Acik") ? "Dosyayı Kapat" : "Dosyayı Yeniden Aç"}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-6 border-b" style={{ borderColor: CARD_BORDER }}>
        {tabs.map((tab) => (
          <div key={tab.key} className="relative flex items-center">
            <button
              onClick={() => canAccessTab(tab.key) ? setActiveTab(tab.key) : undefined}
              disabled={!canAccessTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px inline-flex items-center gap-1.5 ${
                !canAccessTab(tab.key)
                  ? "border-transparent cursor-not-allowed opacity-40"
                  : activeTab === tab.key
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent hover:text-white"
              }`}
              style={!canAccessTab(tab.key) || activeTab !== tab.key ? { color: TEXT_MUTED } : undefined}
            >
              {tab.label}
            </button>
            {tab.key === "konteynerler" && konsimentoBekliyor && (
              <div className="-ml-1 mr-2 -mb-px">
                <InfoTooltip variant="danger" position="bottom" width="w-64" size={14} badge="1">
                  <span className="font-semibold text-slate-800">Konşimento talimatı bekleniyor.</span> Fatura talimatı gönderildi, şimdi konşimento talimatını hazırlayıp Konteynerler sekmesinden yükleyebilirsiniz.
                </InfoTooltip>
              </div>
            )}
          </div>
        ))}
      </div>

      <div key={activeTab} className="animate-fade-up">
      {activeTab === "proforma" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            <div className="space-y-4">
            <div className="rounded-xl border shadow-sm p-6 space-y-5" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider mb-3 border-b pb-2" style={{ color: "white", borderColor: CARD_BORDER }}>Taraflar</h3>
                <div className="grid grid-cols-2 gap-3">
                  <CopyableField dark label="Satici Firma" value={dosya.satici_firma} />
                  <CopyableField dark label="Alici Firma" value={dosya.alici_firma} />
                  <CopyableField dark label="Alici Tel" value={(dosya.ham_veri as any)?.alici_tel} />
                  <CopyableField dark label="Alici Email" value={(dosya.ham_veri as any)?.alici_email} />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider mb-3 border-b pb-2" style={{ color: "white", borderColor: CARD_BORDER }}>Proforma</h3>
                <div className="grid grid-cols-2 gap-3">
                  <CopyableField dark label="Proforma No" value={dosya.proforma_no} />
                  <CopyableField dark label="Proforma Tarihi" value={formatDateTR(dosya.proforma_tarihi)} />
                  <CopyableField dark label="Gecerlilik Tarihi" value={formatDateTR(dosya.gecerlilik_tarihi)} />
                  <CopyableField dark label="Lot No" value={dosya.lot_no} />
                </div>
              </div>
            </div>
          {dosya.urun_detaylari && (dosya.urun_detaylari as any[]).length > 0 && (
            <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <div className="px-6 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Urun Detaylari</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                      <th className="text-left px-4 py-3 text-xs font-bold" style={{ color: TEXT_MUTED }}>Urun Adi</th>
                      <th className="text-left px-4 py-3 text-xs font-bold" style={{ color: TEXT_MUTED }}>Ambalaj</th>
                      <th className="text-right px-4 py-3 text-xs font-bold" style={{ color: TEXT_MUTED }}>Miktar (MTS)</th>
                      <th className="text-right px-4 py-3 text-xs font-bold" style={{ color: TEXT_MUTED }}>Birim Fiyat</th>
                      <th className="text-right px-4 py-3 text-xs font-bold" style={{ color: TEXT_MUTED }}>Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dosya.urun_detaylari as any[]).map((item: any, i: number) => (
                      <tr key={i} className="border-b last:border-0" style={{ borderColor: CARD_BORDER }}>
                        <td className="px-4 py-3 text-sm text-white">{item.urun_adi || item.description || "-"}</td>
                        <td className="px-4 py-3 text-sm" style={{ color: TEXT_MUTED }}>{item.ambalaj_boyutu || item.packaging_size || "-"}</td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: TEXT_MUTED }}>{item.miktar_mts || item.quantity || "-"}</td>
                        <td className="px-4 py-3 text-sm text-right" style={{ color: TEXT_MUTED }}>{formatCurrency(item.birim_fiyat_usd || item.unit_price, dosya.para_birimi)}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-white">{formatCurrency(item.toplam_tutar_usd || item.total_amount, dosya.para_birimi)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                      <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-right" style={{ color: "white" }}>TOPLAM</td>
                      <td className="px-4 py-3 text-sm font-bold text-right" style={{ color: ACCENT }}>
                        {formatCurrency((dosya.urun_detaylari as any[]).reduce((s: number, u: any) => s + parseFloat(String(u.toplam_tutar_usd || u.total_amount || 0)), 0), dosya.para_birimi)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
            </div>
            <div className="rounded-xl border shadow-sm p-6 space-y-5" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider mb-3 border-b pb-2" style={{ color: "white", borderColor: CARD_BORDER }}>Lojistik</h3>
                <div className="grid grid-cols-2 gap-3">
                  <CopyableField dark label="Yukleme Limani" value={dosya.yuklenme_limani || rezervasyonlar[0]?.yuklenme_limani} />
                  <CopyableField dark label="Varis Limani" value={dosya.varis_limani} />
                  <CopyableField dark label="Teslim Sekli" value={dosya.teslim_sekli} />
                  <CopyableField dark label="Sevkiyat Suresi" value={(dosya.ham_veri as any)?.sevkiyat_suresi} />
                  <CopyableField dark label="Toplam Miktar" value={dosya.miktar ? `${dosya.miktar} ${dosya.miktar_birimi || "MTS"}` : null} />
                  <CopyableField dark label="Ambalaj" value={dosya.ambalaj} />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider mb-3 border-b pb-2" style={{ color: "white", borderColor: CARD_BORDER }}>Odeme</h3>
                <div className="grid grid-cols-2 gap-3">
                  <CopyableField dark label="Toplam Tutar" value={formatCurrency(dosya.toplam_tutar, dosya.para_birimi)} />
                  <CopyableField dark label="Avans Tutari" value={formatCurrency((dosya.ham_veri as any)?.avans_tutari, dosya.para_birimi)} />
                  <CopyableField dark label="Odeme Sekli" value={dosya.odeme_sekli} />
                </div>
              </div>
              <BankaBilgileriCard dosya={dosya} onRefresh={fetchData} companyId={companyId} />
            </div>
          <EkBilgilerCard dosya={dosya} rezervasyonlar={rezervasyonlar} onRefresh={fetchData} companyId={companyId} />
        </div>
      )}

      {activeTab === "evraklar" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="space-y-4">
            <FaturaUploadSection dosya={dosya} konteynerler={konteynerler} rezervasyonlar={rezervasyonlar} onRefresh={fetchData} companyId={companyId} />
            <DraftBlSection dosya={dosya} konteynerler={konteynerler} rezervasyonlar={rezervasyonlar} onRefresh={fetchData} companyId={companyId} />
          </div>
          <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: CARD_BORDER }}>
              <Package size={16} style={{ color: ACCENT }} />
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>İhracat Evrakları</h3>
            </div>
            <div className="p-4">
              {(dosya.sevkiyat_evraklari || []).length > 0 ? (
                <div className="space-y-2">
                  {EVRAK_SIRASI.map((tanim, i) => {
                    const orijinalMetin = evrakEslestir(dosya.sevkiyat_evraklari as string[], tanim.anahtar);
                    if (!orijinalMetin) return null;
                    return (
                      <div
                        key={tanim.anahtar}
                        className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border hover:bg-white/[0.03] transition-colors"
                        style={{ borderColor: CARD_BORDER }}
                        title={orijinalMetin}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-semibold w-5 shrink-0" style={{ color: TEXT_MUTED }}>{i + 1}.</span>
                          <FileCheck size={15} className="shrink-0" style={{ color: TEXT_MUTED }} />
                          <span className="text-sm font-medium text-white truncate">{tanim.baslik}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {tanim.evrakTuru ? (
                            <EvrakOlusturButtons dosya={dosya} rezervasyonlar={rezervasyonlar} konteynerler={konteynerler} show={tanim.evrakTuru} />
                          ) : (
                            <button
                              onClick={async () => { await navigator.clipboard.writeText(orijinalMetin); }}
                              title="Metni kopyala"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
                              style={{ color: TEXT_MUTED }}
                            >
                              <Copy size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState icon={<Package size={36} />} title="Sevkiyat evraki bulunmuyor" description="Bu dosyaya henuz sevkiyat evraki eklenmemis" />
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "rezervasyon" && (
        <RezervasyonTab 
          dosyaId={dosya.id} 
          rezervasyonlar={rezervasyonlar} 
          onRefresh={fetchData} 
          onNavigateTab={setActiveTab}
          companyId={companyId} // Şirket bazlı izolasyon alt sekmeye aktarıldı
        />
      )}

      {activeTab === "konteynerler" && (
        <KonteynerTab 
          dosyaId={dosya.id} 
          dosya={dosya} 
          konteynerler={konteynerler} 
          rezervasyonlar={rezervasyonlar} 
          onRefresh={fetchData} 
          onNavigateTab={setActiveTab}
          companyId={companyId} // Şirket bazlı izolasyon alt sekmeye aktarıldı
        />
      )}
      </div>

    </AppShell>
  );
}

export default function DosyaDetailPage() {
  return (
    <Suspense fallback={<AppShell><div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin text-emerald-500" /> </div></AppShell>}>
      <DosyaDetailContent />
    </Suspense>
  );
}
