"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, Dosya, Rezervasyon, Konteyner, AnaSiparis, SEVKIYAT_EVRAKLARI } from "@/lib/supabase";
import { formatCurrency, formatDateTR } from "@/lib/cutoff-utils";
import { useRouter } from "next/navigation";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { CopyableField } from "@/components/copyable-field";
import { Search, ExternalLink, Archive, X, Package, Loader2, ArrowRight, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import EvrakOlusturButtons from "@/components/evrak-olustur-buttons";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

type DosyaWithRelations = Dosya & { rezervasyonlar: Rezervasyon[]; konteynerler: Konteyner[] };
type AnaSiparisWithProgress = AnaSiparis & { gonderilmisMts: number; dosyaSayisi: number };

export default function IhracatlarPage() {
  const { user, yetkiler, companyId } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [dosyalar, setDosyalar] = useState<DosyaWithRelations[]>([]);
  const [acikSiparisler, setAcikSiparisler] = useState<AnaSiparisWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [siparisLoading, setSiparisLoading] = useState(true);
  const [devamEdiyor, setDevamEdiyor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedDosya, setSelectedDosya] = useState<DosyaWithRelations | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; dosyaNo: string } | null>(null);

  const fetchDosyalar = useCallback(async () => {
    if (!user || !companyId) return;
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari")
      .select("*")
      .eq("company_id", companyId)
      .or("durum.eq.Kapalı,durum.eq.Kapali")
      .order("olusturma_tarihi", { ascending: false });

    if (!dosyaData || dosyaData.length === 0) { setDosyalar([]); setLoading(false); return; }

    const dosyaIds = dosyaData.map((d: Dosya) => d.id);
    const [{ data: rezData }, { data: kontData }] = await Promise.all([
      supabase.from("rezervasyonlar").select("*").eq("company_id", companyId).in("dosya_id", dosyaIds),
      supabase.from("konteynerler").select("*").eq("company_id", companyId).in("dosya_id", dosyaIds),
    ]);

    const enriched = dosyaData.map((d: Dosya) => ({
      ...d,
      rezervasyonlar: (rezData || []).filter((r: Rezervasyon) => r.dosya_id === d.id),
      konteynerler: (kontData || []).filter((k: Konteyner) => k.dosya_id === d.id),
    }));

    setDosyalar(enriched);
    setLoading(false);
  }, [user, companyId]);

  const fetchAcikSiparisler = useCallback(async () => {
    if (!user || !companyId) return;
    const { data: siparisler } = await supabase
      .from("ana_siparisler")
      .select("*")
      .eq("company_id", companyId)
      .order("olusturma_tarihi", { ascending: false });

    if (!siparisler || siparisler.length === 0) { setAcikSiparisler([]); setSiparisLoading(false); return; }

    const siparisIds = siparisler.map((s: AnaSiparis) => s.id);
    const { data: bagliDosyalar } = await supabase
      .from("ihracat_dosyalari")
      .select("id, ana_siparis_id, urun_detaylari, durum")
      .eq("company_id", companyId)
      .in("ana_siparis_id", siparisIds);

    const dosyaIdListesi = (bagliDosyalar || []).map((d: any) => d.id);
    const { data: bagliKonteynerler } = await supabase
      .from("konteynerler")
      .select("dosya_id, dba_dosya_url")
      .eq("company_id", companyId)
      .in("dosya_id", dosyaIdListesi);

    const withProgress: AnaSiparisWithProgress[] = siparisler.map((s: AnaSiparis) => {
      const dosyalariBuSiparise = (bagliDosyalar || []).filter((d: any) => d.ana_siparis_id === s.id);
      const gonderilmisMts = dosyalariBuSiparise.reduce((sum: number, d: any) => {
        const urunler = d.urun_detaylari || [];
        const dosyaToplamMts = urunler.reduce((s2: number, u: any) => s2 + parseFloat(String(u.miktar_mts || u.quantity || 0)), 0);

        // Dosya kapatilmissa, o partinin tamami gonderilmis sayilir - DBA
        // belgesi yuklenmis olsun ya da olmasin. "Kapali" durumu, sevkiyatin
        // gercekten tamamlandiginin en kesin sinyalidir.
        const dosyaKapali = d.durum === "Kapalı" || d.durum === "Kapali";
        if (dosyaKapali) return sum + dosyaToplamMts;

        // Dosya hala aciksa, konteyner bazli DBA tamamlanma oranina gore
        // kismi ilerleme goster.
        const dosyaKonteynerleri = (bagliKonteynerler || []).filter((k: any) => k.dosya_id === d.id);
        if (dosyaKonteynerleri.length === 0) return sum;
        const dbaTamamlananSayisi = dosyaKonteynerleri.filter((k: any) => !!k.dba_dosya_url).length;
        const mtsPerKonteyner = dosyaToplamMts / dosyaKonteynerleri.length;
        return sum + (mtsPerKonteyner * dbaTamamlananSayisi);
      }, 0);
      return { ...s, gonderilmisMts, dosyaSayisi: dosyalariBuSiparise.length };
    });

    const acikOlanlar = withProgress.filter((s) => (s.toplam_mts || 0) - s.gonderilmisMts > 0.01);
    setAcikSiparisler(acikOlanlar);
    setSiparisLoading(false);
  }, [user, companyId]);

  useEffect(() => { fetchDosyalar(); fetchAcikSiparisler(); }, [fetchDosyalar, fetchAcikSiparisler]);

  const handleSipariseDevamEt = async (siparis: AnaSiparisWithProgress) => {
    if (!user || !companyId) return;
    setDevamEdiyor(siparis.id);
    try {
      // Ayni ana siparise bagli ilk dosyanin tam proforma bilgilerini al (kopyalamak icin)
      const { data: ornekDosya } = await supabase
        .from("ihracat_dosyalari")
        .select("*")
        .eq("company_id", companyId)
        .eq("ana_siparis_id", siparis.id)
        .order("olusturma_tarihi", { ascending: true })
        .limit(1)
        .maybeSingle();

      const { data: yeniDosya, error: dbError } = await supabase
        .from("ihracat_dosyalari")
        .insert({
          satici_firma: ornekDosya?.satici_firma || null,
          alici_firma: siparis.alici_firma,
          urun_tanimi: siparis.urun_tanimi,
          proforma_no: siparis.proforma_no,
          proforma_tarihi: ornekDosya?.proforma_tarihi || null,
          gecerlilik_tarihi: ornekDosya?.gecerlilik_tarihi || null,
          lot_no: ornekDosya?.lot_no || null,
          para_birimi: siparis.para_birimi || "USD",
          odeme_sekli: ornekDosya?.odeme_sekli || null,
          yuklenme_limani: ornekDosya?.yuklenme_limani || null,
          varis_limani: ornekDosya?.varis_limani || null,
          teslim_sekli: ornekDosya?.teslim_sekli || null,
          ambalaj: ornekDosya?.ambalaj || null,
          ham_veri: ornekDosya?.ham_veri || null,
          marka: ornekDosya?.marka || null,
          sevkiyat_evraklari: ornekDosya?.sevkiyat_evraklari || SEVKIYAT_EVRAKLARI,
          alici_adresi: ornekDosya?.alici_adresi || null,
          consignee: ornekDosya?.consignee || null,
          detayli_ambalaj: ornekDosya?.detayli_ambalaj || null,
          hesap_adi: ornekDosya?.hesap_adi || null,
          banka: ornekDosya?.banka || null,
          swift: ornekDosya?.swift || null,
          hesap_numarasi: ornekDosya?.hesap_numarasi || null,
          iban: ornekDosya?.iban || null,
          durum: "Açık",
          created_by: user.id,
          ana_siparis_id: siparis.id,
          company_id: companyId,
        })
        .select("id")
        .single();

      if (dbError) throw dbError;

      showToast("Yeni sevkiyat dosyası oluşturuldu. Rezervasyon bilgilerini girin.", "success");
      router.push(`/dosya/${yeniDosya.id}?tab=rezervasyon&action=new`);
    } catch {
      showToast("Dosya oluşturulurken hata oluştu.", "error");
      setDevamEdiyor(null);
    }
  };

  const filteredDosyalar = useMemo(() => {
    if (!search.trim()) return dosyalar;
    const term = search.trim().toLowerCase();
    return dosyalar.filter((d) =>
      [d.dosya_no, d.alici_firma, d.satici_firma, d.proforma_no, d.urun_tanimi, d.varis_limani, d.bl_no, d.marka]
        .some((field) => field?.toLowerCase().includes(term))
    );
  }, [dosyalar, search]);
  const handleDelete = async () => {
    if (!deleteTarget || !companyId) return;

    // Silinecek dosyanin bagli oldugu ana siparisi onceden ogren
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari")
      .select("ana_siparis_id")
      .eq("company_id", companyId)
      .eq("id", deleteTarget.id)
      .maybeSingle();
    const anaSiparisId = dosyaData?.ana_siparis_id;

    const { error } = await supabase.from("ihracat_dosyalari").delete().eq("company_id", companyId).eq("id", deleteTarget.id);
    if (error) {
      showToast("Dosya silinirken hata oluştu.", "error");
      setDeleteTarget(null);
      return;
    }

    // Eger dosya bir ana siparise bagliysa, o ana siparise baska dosya kalip kalmadigini kontrol et
    if (anaSiparisId) {
      const { count } = await supabase
        .from("ihracat_dosyalari")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("ana_siparis_id", anaSiparisId);
      if (!count || count === 0) {
        await supabase.from("ana_siparisler").delete().eq("company_id", companyId).eq("id", anaSiparisId);
      }
    }

    showToast(`${deleteTarget.dosyaNo} başarıyla silindi.`, "success");
    fetchDosyalar();
    fetchAcikSiparisler();
    setDeleteTarget(null);
  };

  const urunOzet = (dosya: DosyaWithRelations, alan: "urun_adi" | "miktar_mts" | "birim_fiyat_usd") => {
    const urunler = (dosya.urun_detaylari as any[]) || [];
    if (urunler.length === 0) return "—";
    if (alan === "urun_adi") {
      return urunler.map((u) => u.urun_adi || u.description || "-").join(", ");
    }
    if (alan === "miktar_mts") {
      const toplam = urunler.reduce((s: number, u: any) => s + parseFloat(String(u.miktar_mts || u.quantity || 0)), 0);
      return toplam > 0 ? `${toplam.toLocaleString("tr-TR")} MTS` : "—";
    }
    return urunler.map((u) => formatCurrency(parseFloat(String(u.birim_fiyat_usd || u.unit_price || 0)), dosya.para_birimi)).join(", ");
  };

  return (
    <AppShell>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Emin misiniz?"
        description={`${deleteTarget?.dosyaNo || ""} dosyasını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
        confirmLabel="Evet, Sil"
        cancelLabel="Hayır"
        onConfirm={handleDelete}
        destructive
      />

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Archive size={22} style={{ color: ACCENT }} />
          <h1 className="text-2xl font-bold text-white">İhracatlar Arşivi</h1>
        </div>
        <p className="text-sm ml-7" style={{ color: TEXT_MUTED }}>Tamamlanmış dosyalar ve devam eden siparişleriniz</p>
      </div>

      {!siparisLoading && acikSiparisler.length > 0 && (
        <div className="mb-8 space-y-3">
          <div className="flex items-center gap-2">
            <Package size={16} style={{ color: ACCENT }} />
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Devam Eden Siparişler</h2>
          </div>
          {acikSiparisler.map((s, idx) => {
            const kalan = Math.max(0, (s.toplam_mts || 0) - s.gonderilmisMts);
            const yuzde = s.toplam_mts ? Math.min(100, (s.gonderilmisMts / s.toplam_mts) * 100) : 0;
            const staggerClass = idx < 8 ? `stagger-${idx + 1}` : "stagger-8";
            return (
              <div key={s.id} className={`rounded-xl border shadow-sm p-4 animate-fade-up ${staggerClass}`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="text-sm font-bold text-white">{s.proforma_no}</p>
                    <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{s.alici_firma}</p>
                    <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{s.urun_tanimi}</p>
                  </div>
                  <button
                    onClick={() => handleSipariseDevamEt(s)}
                    disabled={devamEdiyor === s.id}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: ACCENT }}
                  >
                    {devamEdiyor === s.id ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                    Siparişe Devam Et
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-2">
                  <div>
                    <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Toplam Taahhüt</p>
                    <p className="text-sm font-bold text-white">{(s.toplam_mts || 0).toLocaleString("tr-TR")} MTS</p>
                  </div>
                  <div>
                    <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Gönderilmiş</p>
                    <p className="text-sm font-bold text-green-400">{s.gonderilmisMts.toLocaleString("tr-TR")} MTS</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-amber-500">Kalan</p>
                    <p className="text-sm font-bold text-amber-400">{kalan.toLocaleString("tr-TR")} MTS</p>
                  </div>
                </div>
                <div className="w-full rounded-full h-1.5" style={{ backgroundColor: CARD_BORDER }}>
                  <div className="h-1.5 rounded-full bg-green-500 transition-all duration-500" style={{ width: `${yuzde}%` }} />
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: TEXT_MUTED }}>{s.dosyaSayisi} sevkiyat dosyası oluşturuldu</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <Archive size={16} style={{ color: TEXT_MUTED }} />
        <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Kapatılmış Dosyalar</h2>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Alıcı, satıcı, proforma, ürün, liman, BL no, marka ile ara..."
          className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 text-white placeholder:text-slate-500"
          style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border p-4 animate-pulse" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <div className="h-4 rounded w-full" style={{ backgroundColor: CARD_BORDER }}></div>
            </div>
          ))}
        </div>
      ) : filteredDosyalar.length === 0 ? (
        <EmptyState
          icon={<Archive size={48} />}
          title="Arşivde dosya bulunamadı"
          description={search ? "Arama kriterlerinizi değiştirmeyi deneyin" : "Henüz kapatılmış bir ihracat dosyanız yok"}
        />
      ) : (
        <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                  <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Proforma No</th>
                  <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Müşteri</th>
                  <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Varış Limanı</th>
                  <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Teslim</th>
                  <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Ürün</th>
                  <th className="text-right px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Birim Fiyat</th>
                  <th className="text-right px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>MTS</th>
                  <th className="text-right px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Tutar</th>
                  <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Acente</th>
                  <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>BL No</th>
                  <th className="text-left px-2.5 py-2.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: TEXT_MUTED }}>Marka</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filteredDosyalar.map((d, idx) => {
                  const rez = d.rezervasyonlar[0];
                  const staggerClass = idx < 8 ? `stagger-${idx + 1}` : "stagger-8";
                  return (
                    <tr
                      key={d.id}
                      className={`border-b last:border-0 hover:bg-white/[0.03] cursor-pointer transition-colors animate-fade-up ${staggerClass}`}
                      style={{ borderColor: CARD_BORDER }}
                      onClick={() => setSelectedDosya(d)}
                    >
                      <td className="px-2.5 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: ACCENT }}>{d.proforma_no || "—"}</td>
                      <td className="px-2.5 py-2.5 text-xs text-white max-w-[140px] truncate">{d.alici_firma || "—"}</td>
                      <td className="px-2.5 py-2.5 text-xs max-w-[140px] truncate" style={{ color: TEXT_MUTED }}>{d.varis_limani || "—"}</td>
                      <td className="px-2.5 py-2.5 text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{d.teslim_sekli || "—"}</td>
                      <td className="px-2.5 py-2.5 text-xs max-w-[150px] truncate" style={{ color: TEXT_MUTED }}>{urunOzet(d, "urun_adi")}</td>
                      <td className="px-2.5 py-2.5 text-xs text-right whitespace-nowrap" style={{ color: TEXT_MUTED }}>{urunOzet(d, "birim_fiyat_usd")}</td>
                      <td className="px-2.5 py-2.5 text-xs text-right whitespace-nowrap" style={{ color: TEXT_MUTED }}>{urunOzet(d, "miktar_mts")}</td>
                      <td className="px-2.5 py-2.5 text-xs font-semibold text-right whitespace-nowrap" style={{ color: ACCENT }}>{formatCurrency(d.toplam_tutar, d.para_birimi)}</td>
                      <td className="px-2.5 py-2.5 text-xs max-w-[100px] truncate" style={{ color: TEXT_MUTED }}>{rez?.acente_ismi || "—"}</td>
                      <td className="px-2.5 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: TEXT_MUTED }}>{d.bl_no || "—"}</td>
                      <td className="px-2.5 py-2.5 text-xs max-w-[90px] truncate" style={{ color: TEXT_MUTED }}>{d.marka || "—"}</td>
                      <td className="px-2.5 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <ExternalLink size={12} style={{ color: TEXT_MUTED }} />
                          {yetkiler.sayfa_yetkileri.yeni_dosya && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: d.id, dosyaNo: d.dosya_no }); }}
                              className="text-red-400 hover:text-red-300 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
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
      )}

      {selectedDosya && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 animate-fade-in" onClick={() => setSelectedDosya(null)} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-white shadow-2xl z-50 overflow-y-auto animate-fade-in">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10" style={{ borderColor: "#E2E8F0" }}>
              <div>
                <p className="text-lg font-bold" style={{ color: "#1B2B4B" }}>{selectedDosya.dosya_no}</p>
                <p className="text-xs text-slate-400">{formatDateTR(selectedDosya.olusturma_tarihi)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push(`/dosya/${selectedDosya.id}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ backgroundColor: "#1B2B4B" }}
                >
                  <ExternalLink size={12} /> Tam Dosyayı Aç
                </button>
                <button onClick={() => setSelectedDosya(null)} className="p-1.5 text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 border-b pb-2">Proforma Bilgileri</h3>
                <div className="grid grid-cols-2 gap-3">
                  <CopyableField label="Proforma No" value={selectedDosya.proforma_no} />
                  <CopyableField label="Proforma Tarihi" value={formatDateTR(selectedDosya.proforma_tarihi)} />
                  <CopyableField label="Alıcı Firma" value={selectedDosya.alici_firma} />
                  <CopyableField label="Satıcı Firma" value={selectedDosya.satici_firma} />
                  <CopyableField label="Varış Limanı" value={selectedDosya.varis_limani} />
                  <CopyableField label="Teslim Şekli" value={selectedDosya.teslim_sekli} />
                  <CopyableField label="Toplam Tutar" value={formatCurrency(selectedDosya.toplam_tutar, selectedDosya.para_birimi)} />
                  <CopyableField label="Marka" value={selectedDosya.marka} />
                  <CopyableField label="BL No" value={selectedDosya.bl_no} />
                  <CopyableField label="Beyanname No" value={selectedDosya.beyanname_no} />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 border-b pb-2">Evraklar</h3>
                <EvrakOlusturButtons dosya={selectedDosya} rezervasyonlar={selectedDosya.rezervasyonlar} konteynerler={selectedDosya.konteynerler} />
              </div>

              {selectedDosya.urun_detaylari && (selectedDosya.urun_detaylari as any[]).length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 border-b pb-2">Ürünler</h3>
                  <div className="space-y-2">
                    {(selectedDosya.urun_detaylari as any[]).map((u: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg bg-slate-50 border" style={{ borderColor: "#E2E8F0" }}>
                        <p className="text-sm font-medium text-slate-700">{u.urun_adi || u.description || "-"}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {u.miktar_mts || u.quantity || "-"} MTS × {formatCurrency(parseFloat(String(u.birim_fiyat_usd || u.unit_price || 0)), selectedDosya.para_birimi)}
                          {" = "}
                          {formatCurrency(parseFloat(String(u.toplam_tutar_usd || u.total_amount || 0)), selectedDosya.para_birimi)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 border-b pb-2">Rezervasyon</h3>
                {selectedDosya.rezervasyonlar.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDosya.rezervasyonlar.map((rez) => (
                      <div key={rez.id} className="grid grid-cols-2 gap-3">
                        <CopyableField label="Booking No" value={rez.booking_no} />
                        <CopyableField label="Gemi Adı" value={rez.gemi_adi} />
                        <CopyableField label="Acente" value={rez.acente_ismi} />
                        <CopyableField label="Gemi Kalkış" value={rez.gemi_kalkis_tarihi ? formatDateTR(rez.gemi_kalkis_tarihi) : null} />
                        <CopyableField label="Konteyner Adedi" value={rez.konteyner_adedi?.toString()} />
                        <CopyableField label="Yükleme Limanı" value={rez.yuklenme_limani} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Rezervasyon bilgisi bulunmuyor.</p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 border-b pb-2">
                  Konteynerler ({selectedDosya.konteynerler.length} adet)
                </h3>
                {selectedDosya.konteynerler.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-slate-50" style={{ borderColor: "#E2E8F0" }}>
                          <th className="text-left px-2 py-2 text-xs font-semibold text-slate-500">Konteyner No</th>
                          <th className="text-left px-2 py-2 text-xs font-semibold text-slate-500">Mühür</th>
                          <th className="text-left px-2 py-2 text-xs font-semibold text-slate-500">Tip</th>
                          <th className="text-right px-2 py-2 text-xs font-semibold text-slate-500">VGM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDosya.konteynerler.map((k) => (
                          <tr key={k.id} className="border-b last:border-0" style={{ borderColor: "#F1F5F9" }}>
                            <td className="px-2 py-2 text-sm font-mono text-slate-700">{k.konteyner_no}</td>
                            <td className="px-2 py-2 text-sm text-slate-600 font-mono">{k.muhur_no || "—"}</td>
                            <td className="px-2 py-2 text-sm text-slate-600">{k.tip}</td>
                            <td className="px-2 py-2 text-sm text-right font-medium" style={{ color: "#1B2B4B" }}>
                              {k.vgm_kg ? `${k.vgm_kg} KG` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Konteyner bilgisi bulunmuyor.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
