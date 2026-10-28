"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils"; 
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import AppShell from "@/components/app-shell";
import { Ship, Search, Loader2, AlertCircle, Bell, FileSpreadsheet, Wallet, CheckCircle2, X as Kapat, Send } from "lucide-react";
import { formatDateTR } from "@/lib/cutoff-utils";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import {
  KONSIMENTO_DURUMLARI, KONSIMENTO_ETIKETI, KONSIMENTO_ACIKLAMA, konsimentoDurumuMu, odemeAlindiMi, odemeBekliyorMu, konteynerTipiYazimi,
  SABLON_BILGI, siradakiSablon, buTurGonderildiMi, type HatirlatmaSablonu,
} from "@/lib/odeme-takibi";
import { OdemeHatirlatmaPenceresi, type HatirlatmaKaydi } from "@/components/odeme-hatirlatma-penceresi";
import { EtdExcelAktar, type ExcelYuklemeOzeti } from "@/components/etd-excel-aktar";

type SevkiyatSatir = {
  rezervasyon_id: string;
  dosya_id: string;
  dosya_no: string;
  alici_firma: string | null;
  konteyner_adedi: number;
  varis_limani: string | null;
  acente_ismi: string | null;
  booking_no: string | null;
  bl_no: string | null;
  gemi_adi: string | null;
  sefer_no: string | null;
  etd: string | null;
  eta: string | null;
  eta_guncelleme_tarihi: string | null;
  // Odeme takibi (28.10.2026): Excel "KONSIMENTO" sutunu
  konsimento_durumu: string | null;
  konsimento_durumu_tarihi: string | null;
  konsimento_durumu_kaynak: string | null;
  alici_email: string | null;
  konteyner_tipi: string;
};

type EtaFiltre = "hepsi" | "eksik" | "tamam" | "odeme" | "gonderilen";

/** Onaylanan Excel yuklemesi = hatirlatma turunun baslangici (28.10.2026) */
type ExcelYukleme = {
  id: string;
  dosya_adi: string | null;
  guncellenen: number;
  ozet: Partial<ExcelYuklemeOzeti> | null;
  yukleyen_eposta: string | null;
  yukleme_zamani: string;
};

function tarihSaatTR(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Kolon henuz yoksa (migration uygulanmadan yayina cikma) sayfa eski haliyle calissin */
function kolonYokHatasi(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false;
  return e.code === "42703" || e.code === "PGRST204" || /konsimento_durumu|odeme_hatirlatmalari/.test(e.message || "");
}

function gunOnce(iso: string): string {
  const g = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return g <= 0 ? "bugün" : g === 1 ? "dün" : `${g} gün önce`;
}

function kalanGun(eta: string): number {
  const bugun = new Date();
  bugun.setHours(0, 0, 0, 0);
  const etaTarih = new Date(eta);
  etaTarih.setHours(0, 0, 0, 0);
  return Math.round((etaTarih.getTime() - bugun.getTime()) / (1000 * 60 * 60 * 24));
}

export default function EtdEtaPage() {
  const { user, companyId, yetkiler, loading: authLoading } = useAuth(); // Global context'ten companyId alındı
  const router = useRouter();
  const { showToast } = useToast();
  const [satirlar, setSatirlar] = useState<SevkiyatSatir[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [etaFilter, setEtaFilter] = useState<EtaFiltre>("hepsi");
  const [odemeDestek, setOdemeDestek] = useState(true);
  const [hatirlatmalar, setHatirlatmalar] = useState<HatirlatmaKaydi[]>([]);
  const [hatirlatmaAcik, setHatirlatmaAcik] = useState<SevkiyatSatir | null>(null);
  const [excelAcik, setExcelAcik] = useState(false);
  const [durumKaydediliyor, setDurumKaydediliyor] = useState<string | null>(null);
  const [yuklemeler, setYuklemeler] = useState<ExcelYukleme[]>([]);
  const [yuklemeSonucu, setYuklemeSonucu] = useState<ExcelYukleme | null>(null);
  const [editingEta, setEditingEta] = useState<{ id: string; value: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user?.id || !companyId) return; // companyId kontrolü eklendi
    const temelKolonlar = "id, dosya_id, booking_no, gemi_adi, sefer_no, acente_ismi, yuklenme_limani, konteyner_adedi, gemi_kalkis_tarihi, eta, eta_guncelleme_tarihi";
    let destek = true;
    let { data: rezData, error: rezHata }: { data: any[] | null; error: any } = await supabase
      .from("rezervasyonlar")
      .select(`${temelKolonlar}, konsimento_durumu, konsimento_durumu_tarihi, konsimento_durumu_kaynak`)
      .eq("company_id", companyId) // Sadece giriş yapan şirketin rezervasyonları çekilir
      .order("gemi_kalkis_tarihi", { ascending: false });
    if (rezHata && kolonYokHatasi(rezHata)) {
      destek = false;
      ({ data: rezData, error: rezHata } = await supabase
        .from("rezervasyonlar")
        .select(temelKolonlar)
        .eq("company_id", companyId)
        .order("gemi_kalkis_tarihi", { ascending: false }));
    }
    setOdemeDestek(destek);

    if (!rezData || rezData.length === 0) { setSatirlar([]); setLoading(false); return; } // Temiz sıfırlama eklendi

    const dosyaIds = Array.from(new Set(rezData.map((r: any) => r.dosya_id)));
    const [{ data: dosyaData }, { data: kontData }, hatirlatmaSonucu, yuklemeSonuc] = await Promise.all([
      supabase
        .from("ihracat_dosyalari")
        .select("id, dosya_no, alici_firma, varis_limani, bl_no, alici_email:ham_veri->>alici_email")
        .in("id", dosyaIds)
        .eq("company_id", companyId), // Sadece giriş yapan şirketin dosyalarıyla eşleştirilir
      supabase
        .from("konteynerler")
        .select("rezervasyon_id, dosya_id, tip")
        .in("dosya_id", dosyaIds)
        .eq("company_id", companyId),
      destek
        ? supabase
            .from("odeme_hatirlatmalari")
            .select("id, rezervasyon_id, sablon, alici, cc, konu, govde, gonderen_eposta, gonderim_zamani")
            .eq("company_id", companyId)
            .order("gonderim_zamani", { ascending: false })
            .limit(2000)
        : Promise.resolve({ data: [] as HatirlatmaKaydi[], error: null }),
      destek
        ? supabase
            .from("odeme_excel_yuklemeleri")
            .select("id, dosya_adi, guncellenen, ozet, yukleyen_eposta, yukleme_zamani")
            .eq("company_id", companyId)
            .order("yukleme_zamani", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] as ExcelYukleme[], error: null }),
    ]);
    setHatirlatmalar(((hatirlatmaSonucu as { data: HatirlatmaKaydi[] | null }).data) || []);
    // Tablo yoksa (eski veritabani) tur bilgisi bos kalir; sayfa calismaya devam eder
    setYuklemeler(((yuklemeSonuc as { data: ExcelYukleme[] | null }).data) || []);

    // Konteyner tipi: once rezervasyona bagli konteynerler, yoksa dosyanin tumu
    const tipRez: Record<string, string[]> = {};
    const tipDosya: Record<string, string[]> = {};
    (kontData || []).forEach((k: any) => {
      if (k.rezervasyon_id) (tipRez[k.rezervasyon_id] ||= []).push(k.tip);
      (tipDosya[k.dosya_id] ||= []).push(k.tip);
    });

    const dosyaMap: Record<string, any> = {};
    (dosyaData || []).forEach((d: any) => { dosyaMap[d.id] = d; });

    const rows: SevkiyatSatir[] = rezData.map((r: any) => {
      const dosya = dosyaMap[r.dosya_id] || {};
      return {
        rezervasyon_id: r.id,
        dosya_id: r.dosya_id,
        dosya_no: dosya.dosya_no || "-",
        alici_firma: dosya.alici_firma,
        konteyner_adedi: r.konteyner_adedi,
        varis_limani: dosya.varis_limani || r.yuklenme_limani,
        acente_ismi: r.acente_ismi,
        booking_no: r.booking_no,
        bl_no: dosya.bl_no,
        gemi_adi: r.gemi_adi,
        sefer_no: r.sefer_no,
        etd: r.gemi_kalkis_tarihi,
        eta: r.eta,
        eta_guncelleme_tarihi: r.eta_guncelleme_tarihi,
        konsimento_durumu: r.konsimento_durumu ?? null,
        konsimento_durumu_tarihi: r.konsimento_durumu_tarihi ?? null,
        konsimento_durumu_kaynak: r.konsimento_durumu_kaynak ?? null,
        alici_email: (dosya.alici_email || "").trim() || null,
        konteyner_tipi: konteynerTipiYazimi(tipRez[r.id] || tipDosya[r.dosya_id] || []),
      };
    });

    setSatirlar(rows);
    setLoading(false);
  }, [user?.id, companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    // Yetkiler veritabanindan gelmeden karar verilmez: yuklenirken tum yetkiler
    // gecici olarak kapali gorunur ve tam yetkili kullanici bile sayfayi
    // yenileyince baska sayfaya atiliyordu (duzeltme: 01.10.2026). Hic sayfa
    // yetkisi yoksa yonlendirme yapilmaz - AppShell "Erisim yetkiniz yok"
    // ekranini gosterir (bkz. lib/yetki-utils.ts).
    if (authLoading) return;
    if (!yetkiler.sayfa_yetkileri.etd_eta) {
      const hedef = ilkErisilebilirSayfa(yetkiler.sayfa_yetkileri);
      if (hedef) router.replace(hedef);
    }
  }, [authLoading, yetkiler, router]);

  const handleEtaKaydet = async (rezervasyonId: string, etaValue: string) => {
    setSaving(rezervasyonId);
    const { data, error } = await supabase
      .from("rezervasyonlar")
      .update({ eta: etaValue || null, eta_guncelleme_tarihi: etaValue ? new Date().toISOString() : null })
      .eq("id", rezervasyonId)
      .eq("company_id", companyId) // Güncelleme işlemi şirket doğrulamasına kilitlendi
      .select("id");

    const hata = yazmaHatasi(error, data);
    if (hata) {
      showToast(`ETA kaydedilemedi: ${hata}`, "error");
    } else {
      setSatirlar(prev => prev.map(s =>
        s.rezervasyon_id === rezervasyonId ? { ...s, eta: etaValue || null, eta_guncelleme_tarihi: etaValue ? new Date().toISOString() : null } : s
      ));
      showToast("ETA kaydedildi.", "success");
    }
    setSaving(null);
    setEditingEta(null);
  };

  // Konsimento / odeme durumu (tek satir, elle)
  const handleDurumKaydet = async (rezervasyonId: string, durum: string) => {
    setDurumKaydediliyor(rezervasyonId);
    const { data, error } = await supabase.rpc("odeme_konsimento_guncelle", { p_rezervasyon: rezervasyonId, p_durum: durum || null });
    setDurumKaydediliyor(null);
    if (error || !data) {
      showToast(`Konşimento durumu kaydedilemedi: ${error?.message || "bilinmeyen hata"}`, "error");
      return;
    }
    const d = data as { konsimento_durumu: string | null; konsimento_durumu_tarihi: string | null; konsimento_durumu_kaynak: string | null };
    setSatirlar(prev => prev.map(s => s.rezervasyon_id === rezervasyonId
      ? { ...s, konsimento_durumu: d.konsimento_durumu, konsimento_durumu_tarihi: d.konsimento_durumu_tarihi, konsimento_durumu_kaynak: d.konsimento_durumu_kaynak }
      : s));
    showToast(odemeAlindiMi(d.konsimento_durumu) ? "Kaydedildi: ödeme alındı." : "Konşimento durumu kaydedildi.", "success");
  };

  const handleHatirlatmaKaydet = async (s: SevkiyatSatir, v: { sablon: HatirlatmaSablonu; alici: string; cc: string; konu: string; govde: string }): Promise<string | null> => {
    const { data, error } = await supabase.rpc("odeme_hatirlatma_kaydet", {
      p_rezervasyon: s.rezervasyon_id, p_sablon: v.sablon, p_alici: v.alici, p_cc: v.cc, p_konu: v.konu, p_govde: v.govde,
    });
    if (error || !data) return `Kaydedilemedi: ${error?.message || "bilinmeyen hata"}`;
    setHatirlatmalar(prev => [data as HatirlatmaKaydi, ...prev]);
    setHatirlatmaAcik(null);
    showToast("Hatırlatma kaydedildi.", "success");
    return null;
  };

  // Excel yuklemesi: durumlar + yukleme kaydi TEK islemde (yeni hatirlatma turu baslar)
  const handleExcelUygula = async (satirlar: { id: string; durum: string }[], ozet: ExcelYuklemeOzeti, dosyaAdi: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc("odeme_excel_yukleme_kaydet", { p_dosya_adi: dosyaAdi, p_satirlar: satirlar, p_ozet: ozet });
    if (error) {
      // Fonksiyon henuz yoksa (migration oncesi) yalniz durumlar guncellenir
      if (error.code === "PGRST202" || error.code === "42883") {
        if (satirlar.length === 0) return "Değişiklik yok.";
        const eski = await supabase.rpc("odeme_konsimento_toplu", { p_satirlar: satirlar });
        if (eski.error) return `Güncellenemedi: ${eski.error.message}`;
        setExcelAcik(false);
        showToast(`${satirlar.length} sevkiyatın konşimento durumu güncellendi.`, "success");
        await fetchData();
        return null;
      }
      return `Güncellenemedi: ${error.message}`;
    }
    const kayit = data as ExcelYukleme;
    setExcelAcik(false);
    setYuklemeSonucu(kayit);
    setEtaFilter("odeme");
    showToast(kayit.guncellenen > 0 ? `Excel yüklendi: ${kayit.guncellenen} sevkiyat güncellendi, yeni hatırlatma turu başladı.` : "Excel yüklendi: değişiklik yok, yeni hatırlatma turu başladı.", "success");
    await fetchData();
    return null;
  };

  const hatirlatmaHaritasi = useMemo(() => {
    const m: Record<string, HatirlatmaKaydi[]> = {};
    hatirlatmalar.forEach(h => { if (h.rezervasyon_id) (m[h.rezervasyon_id] ||= []).push(h); });
    return m;
  }, [hatirlatmalar]);

  const odemeBekleyenler = useMemo(() => satirlar.filter(s => odemeBekliyorMu(s)), [satirlar]);
  const bekleyenKonteyner = odemeBekleyenler.reduce((t, s) => t + (Number(s.konteyner_adedi) || 0), 0);

  // Hatirlatma turu: son Excel yuklemesinden bu yana. Sira: 1. -> 2. -> 3. mesaj (sevkiyat bazinda)
  const turBaslangici = yuklemeler[0]?.yukleme_zamani ?? null;
  const buTurGonderildi = useCallback(
    (rezId: string) => buTurGonderildiMi((hatirlatmaHaritasi[rezId] || []).map(h => h.gonderim_zamani), turBaslangici),
    [hatirlatmaHaritasi, turBaslangici]);
  const turdaBekleyenler = useMemo(() => odemeBekleyenler.filter(s => !buTurGonderildi(s.rezervasyon_id)), [odemeBekleyenler, buTurGonderildi]);

  // Gonderilen mailler: her kaydin o sevkiyattaki kacinci mesaj oldugu (eskiden yeniye)
  const mesajSirasi = useMemo(() => {
    const m: Record<string, number> = {};
    Object.values(hatirlatmaHaritasi).forEach(liste => {
      [...liste].sort((a, b) => a.gonderim_zamani.localeCompare(b.gonderim_zamani)).forEach((h, i) => { m[h.id] = i + 1; });
    });
    return m;
  }, [hatirlatmaHaritasi]);
  const satirHaritasi = useMemo(() => Object.fromEntries(satirlar.map(s => [s.rezervasyon_id, s])), [satirlar]);
  const gonderilenler = useMemo(() => {
    const term = search.trim().toLowerCase();
    return hatirlatmalar.filter(h => {
      if (!term) return true;
      const s = h.rezervasyon_id ? satirHaritasi[h.rezervasyon_id] : undefined;
      return [s?.alici_firma, s?.booking_no, s?.dosya_no, h.alici, h.konu, h.gonderen_eposta].some(f => f?.toLowerCase().includes(term));
    });
  }, [hatirlatmalar, satirHaritasi, search]);

  // ETA'sı yaklaşan: bugün veya sonraki 7 gün içinde
  const yaklasanlar = useMemo(() =>
    satirlar
      .filter(s => s.eta)
      .map(s => ({ ...s, kalanGun: kalanGun(s.eta!) }))
      .filter(s => s.kalanGun >= 0 && s.kalanGun <= 7)
      .sort((a, b) => a.kalanGun - b.kalanGun),
    [satirlar]);

  const filtered = useMemo(() => {
    let rows = satirlar;
    if (etaFilter === "eksik") rows = rows.filter(s => !s.eta);
    if (etaFilter === "tamam") rows = rows.filter(s => !!s.eta);
    if (etaFilter === "odeme") {
      // Bu turda henuz hatirlatilmayanlar uste, sonra en eski kalkis
      rows = rows.filter(s => odemeBekliyorMu(s)).sort((a, b) =>
        Number(buTurGonderildi(a.rezervasyon_id)) - Number(buTurGonderildi(b.rezervasyon_id)) || (a.etd || "").localeCompare(b.etd || ""));
    }
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      rows = rows.filter(s =>
        [s.alici_firma, s.dosya_no, s.varis_limani, s.booking_no, s.bl_no, s.gemi_adi, s.acente_ismi]
          .some(f => f?.toLowerCase().includes(term))
      );
    }
    return rows;
  }, [satirlar, search, etaFilter, buTurGonderildi]);

  const eksikEtaSayisi = satirlar.filter(s => !s.eta).length;

  return (
    <AppShell>
      <SayfaBasligi
        ikon={<Ship size={20} />}
        baslik="ETD / ETA"
        aciklama="Sevkiyat kalkış ve varış tarihleri, konşimento ve ödeme takibi"
        sag={odemeDestek ? (
          <button
            onClick={() => setExcelAcik(true)}
            data-testid="excel-guncelle"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium text-white hover:bg-white/[0.04] transition-colors"
            style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
          >
            <FileSpreadsheet size={14} style={{ color: ACCENT }} /> Excel&apos;den güncelle
          </button>
        ) : undefined}
      />

      {odemeDestek && !loading && (
        <p className="-mt-3 mb-4 text-[11px] flex flex-wrap items-center gap-x-1.5 gap-y-0.5" style={{ color: TEXT_MUTED }} data-testid="son-excel">
          <FileSpreadsheet size={12} />
          {yuklemeler[0] ? (
            <>
              Son Excel: <span className="text-white">{tarihSaatTR(yuklemeler[0].yukleme_zamani)}</span>
              {yuklemeler[0].dosya_adi && <span>· {yuklemeler[0].dosya_adi}</span>}
              {yuklemeler[0].yukleyen_eposta && <span>· {yuklemeler[0].yukleyen_eposta}</span>}
              <span>· hatırlatma turu bu yüklemeyle başladı</span>
            </>
          ) : (
            <>Henüz kayıtlı Excel yüklemesi yok. &quot;Excel&apos;den güncelle&quot; ile yükleyince hatırlatma turu başlar.</>
          )}
        </p>
      )}

      {yuklemeSonucu && (
        <div className="mb-5 rounded-xl border px-4 py-3 animate-fade-up" role="status" data-testid="yukleme-sonucu"
          style={{ backgroundColor: CARD_BG, borderColor: `${ACCENT}55` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-xs space-y-1">
              <p className="text-sm font-semibold text-white flex items-center gap-1.5"><CheckCircle2 size={15} style={{ color: ACCENT }} /> Excel yüklendi{yuklemeSonucu.dosya_adi ? ` · ${yuklemeSonucu.dosya_adi}` : ""}</p>
              <p style={{ color: TEXT_MUTED }}>
                {yuklemeSonucu.guncellenen} sevkiyatın durumu güncellendi ·{" "}
                <span className="text-amber-300 font-medium">{odemeBekleyenler.length} ödeme bekleyen</span> ·{" "}
                <span className="text-white font-medium">bu tur hatırlatılacak: {turdaBekleyenler.length}</span>
              </p>
              {(yuklemeSonucu.ozet?.odemesiGelen?.length ?? 0) > 0 && (
                <p className="text-emerald-300">Ödemesi gelen: {yuklemeSonucu.ozet!.odemesiGelen!.map(x => `${x.firma} (${x.booking})`).join(", ")}</p>
              )}
              {(yuklemeSonucu.ozet?.yeniBekleyen?.length ?? 0) > 0 && (
                <p className="text-amber-300">Yeni ödeme bekleyen: {yuklemeSonucu.ozet!.yeniBekleyen!.map(x => `${x.firma} (${x.booking})`).join(", ")}</p>
              )}
            </div>
            <button onClick={() => setYuklemeSonucu(null)} className="shrink-0 hover:text-white" style={{ color: TEXT_MUTED }} aria-label="Kapat"><Kapat size={15} /></button>
          </div>
        </div>
      )}

      {/* ETA'sı Yaklaşan Sevkiyatlar */}
      {yaklasanlar.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Bell size={14} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-white">ETA&apos;sı Yaklaşan Sevkiyatlar</h2>
            <span className="text-xs bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full font-medium">{yaklasanlar.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {yaklasanlar.map((s, idx) => (
              <div
                key={s.rezervasyon_id}
                className={`rounded-xl border p-4 shadow-sm animate-fade-up stagger-${Math.min(idx + 1, 8)} ${s.kalanGun === 0 ? "border-red-500/40" : s.kalanGun <= 2 ? "border-orange-500/30" : "border-amber-500/25"}`}
                style={{ backgroundColor: CARD_BG }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{s.alici_firma || "—"}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{s.dosya_no}</p>
                  </div>
                  <span className={`shrink-0 ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    s.kalanGun === 0
                      ? "bg-red-500/15 text-red-400"
                      : s.kalanGun <= 2
                      ? "bg-orange-500/15 text-orange-400"
                      : "bg-amber-500/15 text-amber-400"
                  }`}>
                    {s.kalanGun === 0 ? "Bugün" : `${s.kalanGun} gün`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                  <div><span style={{ color: TEXT_MUTED }}>Liman: </span><span className="text-white">{s.varis_limani || "—"}</span></div>
                  <div><span style={{ color: TEXT_MUTED }}>Kont: </span><span className="text-white font-semibold">{s.konteyner_adedi}</span></div>
                  <div><span style={{ color: TEXT_MUTED }}>Gemi: </span><span className="text-white truncate">{s.gemi_adi || "—"}</span></div>
                  <div><span style={{ color: TEXT_MUTED }}>ETA: </span><span className="text-white font-semibold">{formatDateTR(s.eta!)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Özet Kartlar */}
      <div className={`grid ${odemeDestek ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"} gap-3 mb-5`}>
        <div className="rounded-xl border shadow-sm p-4 animate-fade-up stagger-1" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>Toplam Sevkiyat</p>
          <p className="text-2xl font-bold text-white">{satirlar.length}</p>
        </div>
        <div className="rounded-xl border shadow-sm p-4 animate-fade-up stagger-2" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>ETA Girilmiş</p>
          <p className="text-2xl font-bold text-green-400">{satirlar.length - eksikEtaSayisi}</p>
        </div>
        <div className="rounded-xl border shadow-sm p-4 animate-fade-up stagger-3" style={{ backgroundColor: CARD_BG, borderColor: eksikEtaSayisi > 0 ? "#F87171" : CARD_BORDER }}>
          <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>ETA Eksik</p>
          <p className={`text-2xl font-bold ${eksikEtaSayisi > 0 ? "text-red-400" : ""}`} style={eksikEtaSayisi === 0 ? { color: TEXT_MUTED } : undefined}>{eksikEtaSayisi}</p>
        </div>
        {odemeDestek && (
          <button
            onClick={() => setEtaFilter(etaFilter === "odeme" ? "hepsi" : "odeme")}
            aria-pressed={etaFilter === "odeme"}
            data-testid="kart-odeme-bekleyen"
            className="text-left rounded-xl border shadow-sm p-4 animate-fade-up stagger-4 transition-colors hover:bg-white/[0.02]"
            style={{ backgroundColor: CARD_BG, borderColor: etaFilter === "odeme" ? "#F59E0B" : odemeBekleyenler.length > 0 ? "rgba(245,158,11,0.45)" : CARD_BORDER }}
          >
            <p className="text-xs mb-1 flex items-center gap-1.5" style={{ color: TEXT_MUTED }}><Wallet size={12} /> Ödeme Bekleyen</p>
            <p className={`text-2xl font-bold ${odemeBekleyenler.length > 0 ? "text-amber-400" : ""}`} style={odemeBekleyenler.length === 0 ? { color: TEXT_MUTED } : undefined}>
              {odemeBekleyenler.length}
              {odemeBekleyenler.length > 0 && <span className="text-xs font-medium ml-1.5" style={{ color: TEXT_MUTED }}>sevkiyat · {bekleyenKonteyner} kont.</span>}
            </p>
            {odemeBekleyenler.length > 0 && (
              <p className="text-[11px] mt-1" style={{ color: turdaBekleyenler.length > 0 ? "#FCD34D" : ACCENT }} data-testid="tur-bekleyen">
                {turdaBekleyenler.length > 0 ? `Bu tur hatırlatılacak: ${turdaBekleyenler.length}` : "Bu tur hepsine hatırlatıldı ✓"}
              </p>
            )}
          </button>
        )}
      </div>

      {/* Filtreler */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Firma, booking, BL, gemi, liman ile ara..."
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-white placeholder:text-slate-500"
            style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
          />
        </div>
        <div className="flex rounded-lg border overflow-hidden text-xs font-medium overflow-x-auto shrink-0" style={{ borderColor: CARD_BORDER }}>
          {((odemeDestek ? ["hepsi", "eksik", "tamam", "odeme", "gonderilen"] : ["hepsi", "eksik", "tamam"]) as EtaFiltre[]).map((f) => (
            <button
              key={f}
              onClick={() => setEtaFilter(f)}
              className="px-3 py-2 transition-colors whitespace-nowrap"
              style={etaFilter === f ? { backgroundColor: ACCENT, color: "white" } : { backgroundColor: CARD_BG, color: TEXT_MUTED }}
            >
              {f === "hepsi" ? "Hepsi" : f === "eksik" ? "ETA Eksik" : f === "tamam" ? "ETA Tamam" : f === "odeme" ? `Ödeme Bekleyen (${odemeBekleyenler.length})` : `Gönderilen Mailler (${hatirlatmalar.length})`}
            </button>
          ))}
        </div>
      </div>

      {odemeDestek && etaFilter !== "gonderilen" && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]" style={{ color: TEXT_MUTED }} data-testid="konsimento-aciklama">
          <span className="font-medium text-white">Konşimento sütunu (Excel ile aynı):</span>
          <span className="inline-flex items-center gap-1.5"><span className="px-1.5 py-px rounded border text-amber-300 bg-amber-500/10 border-amber-500/25 font-medium">X</span> konşimento serbest bırakılmadı, ödeme bekleniyor</span>
          <span className="inline-flex items-center gap-1.5"><span className="px-1.5 py-px rounded border text-amber-300 bg-amber-500/10 border-amber-500/25 font-medium">Alındı ✓</span> orijinal konşimento elimizde, ödeme bekleniyor</span>
          <span className="inline-flex items-center gap-1.5"><span className="px-1.5 py-px rounded border text-emerald-300 bg-emerald-500/10 border-emerald-500/25 font-medium">Telex · Seawaybill · Vesaik</span> ödeme alındı, konşimento serbest</span>
        </div>
      )}

      {/* Tablo */}
      {!loading && etaFilter === "gonderilen" ? (
        <div className="rounded-xl border shadow-sm overflow-hidden animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="gonderilen-tablo">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                  {["Tarih", "Firma", "Booking No", "Mesaj", "Alıcı", "Gönderen", "Ödeme durumu"].map((b) => (
                    <th key={b} className="text-left px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gonderilenler.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10" style={{ color: TEXT_MUTED }}>Henüz gönderilmiş hatırlatma yok</td></tr>
                ) : gonderilenler.map((h) => {
                  const s = h.rezervasyon_id ? satirHaritasi[h.rezervasyon_id] : undefined;
                  const alindi = odemeAlindiMi(s?.konsimento_durumu);
                  return (
                    <tr key={h.id} className="border-b last:border-0 align-top hover:bg-white/[0.03]" style={{ borderColor: CARD_BORDER }}>
                      <td className="px-2 py-2 whitespace-nowrap text-white tabular-nums">{tarihSaatTR(h.gonderim_zamani)}</td>
                      <td className="px-2 py-2 font-medium text-white max-w-[200px] truncate" title={s?.alici_firma || undefined}>{s?.alici_firma || "—"}<span className="block text-[10px] font-normal" style={{ color: TEXT_MUTED }}>{s?.dosya_no}</span></td>
                      <td className="px-2 py-2 font-mono whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s?.booking_no || "—"}</td>
                      <td className="px-2 py-2 min-w-[220px]">
                        <details>
                          <summary className="cursor-pointer text-white">{mesajSirasi[h.id] || "?"}. mesaj · <span style={{ color: TEXT_MUTED }}>{SABLON_BILGI[h.sablon as HatirlatmaSablonu]?.ad || `Şablon ${h.sablon}`}</span></summary>
                          <div className="mt-1.5 whitespace-pre-wrap font-mono text-[11px] leading-relaxed" style={{ color: TEXT_MUTED }}>{h.cc ? `CC: ${h.cc}\n` : ""}Konu: {h.konu}{"\n\n"}{h.govde}</div>
                        </details>
                      </td>
                      <td className="px-2 py-2 max-w-[200px] truncate" style={{ color: TEXT_MUTED }} title={h.alici}>{h.alici}</td>
                      <td className="px-2 py-2 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{h.gonderen_eposta || "—"}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {alindi ? <span className="text-[11px] text-emerald-400">Ödeme alındı</span> : <span className="text-[11px] text-amber-300">Bekliyor</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin" style={{ color: ACCENT }} />
        </div>
      ) : (
        <div className="rounded-xl border shadow-sm overflow-hidden animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                  <th className="text-left px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Firma Adı</th>
                  <th className="text-center px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Kont.</th>
                  <th className="text-left px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Varış Limanı</th>
                  <th lang="en" className="text-left px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Booking / B/L</th>
                  <th className="text-left px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>ETD</th>
                  <th className="text-left px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>ETA</th>
                  <th className="text-left px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Gemi / Acente</th>
                  {odemeDestek && <th className="text-left px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Konşimento</th>}
                  {odemeDestek && <th className="text-left px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Hatırlatma</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={odemeDestek ? 9 : 7} className="text-center py-10" style={{ color: TEXT_MUTED }}>Kayıt bulunamadı</td>
                  </tr>
                ) : filtered.map((s, idx) => {
                  const gun = s.eta ? kalanGun(s.eta) : null;
                  const yaklasan = gun !== null && gun >= 0 && gun <= 7;
                  const staggerClass = idx < 8 ? `stagger-${idx + 1}` : "stagger-8";
                  return (
                    <tr
                      key={s.rezervasyon_id}
                      className={`border-b last:border-0 hover:bg-white/[0.03] transition-colors animate-fade-up ${staggerClass} ${!s.eta ? "bg-red-500/[0.06]" : yaklasan ? "bg-amber-500/[0.06]" : ""}`}
                      style={{ borderColor: CARD_BORDER }}
                    >
                      <td className="px-2 py-2 max-w-[148px]" title={s.alici_firma || undefined}>
                        <span className="block font-medium text-white truncate">{s.alici_firma || "—"}</span>
                        <span className="block text-[10px] truncate" style={{ color: TEXT_MUTED }}>{s.dosya_no}</span>
                      </td>
                      <td className="px-2 py-2 text-center font-semibold" style={{ color: ACCENT }}>{s.konteyner_adedi}</td>
                      <td className="px-2 py-2 whitespace-nowrap max-w-[125px] truncate" style={{ color: TEXT_MUTED }} title={s.varis_limani || undefined}>{s.varis_limani || "—"}</td>
                      <td className="px-2 py-2 font-mono whitespace-nowrap" style={{ color: TEXT_MUTED }}>
                        <span className="block">{s.booking_no || "—"}</span>
                        {s.bl_no && s.bl_no !== s.booking_no && <span className="block text-[10px] opacity-80" title="B/L No">BL {s.bl_no}</span>}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.etd ? formatDateTR(s.etd) : "—"}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {editingEta?.id === s.rezervasyon_id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              value={editingEta.value}
                              onChange={(e) => setEditingEta({ id: s.rezervasyon_id, value: e.target.value })}
                              className="border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 text-white"
                              style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, colorScheme: "dark" }}
                              autoFocus
                            />
                            <button
                              onClick={() => handleEtaKaydet(s.rezervasyon_id, editingEta.value)}
                              disabled={saving === s.rezervasyon_id}
                              className="px-2 py-0.5 rounded text-white text-[10px] font-medium"
                              style={{ backgroundColor: ACCENT }}
                            >
                              {saving === s.rezervasyon_id ? <Loader2 size={10} className="animate-spin" /> : "Kaydet"}
                            </button>
                            <button
                              onClick={() => setEditingEta(null)}
                              className="px-2 py-0.5 rounded text-[10px]"
                              style={{ backgroundColor: CARD_BORDER, color: TEXT_MUTED }}
                            >
                              İptal
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingEta({ id: s.rezervasyon_id, value: s.eta || "" })}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                              s.eta
                                ? yaklasan
                                  ? "text-amber-400 bg-amber-500/10 hover:bg-amber-500/20"
                                  : "text-green-400 bg-green-500/10 hover:bg-green-500/20"
                                : "text-red-400 bg-red-500/10 hover:bg-red-500/20"
                            }`}
                          >
                            {!s.eta && <AlertCircle size={10} />}
                            {s.eta ? formatDateTR(s.eta) : "Gir"}
                            {yaklasan && gun !== null && (
                              <span className="text-[9px] font-bold">
                                {gun === 0 ? " (bugün)" : ` (${gun}g)`}
                              </span>
                            )}
                          </button>
                        )}
                        {s.eta_guncelleme_tarihi && (
                          <p className="text-[9px] mt-0.5" style={{ color: TEXT_MUTED }}>
                            {new Date(s.eta_guncelleme_tarihi).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2 max-w-[125px]" style={{ color: TEXT_MUTED }} title={[s.gemi_adi, s.acente_ismi].filter(Boolean).join(" · ") || undefined}>
                        <span className="block truncate">{s.gemi_adi || "—"}</span>
                        {s.acente_ismi && <span className="block text-[10px] truncate opacity-80">{s.acente_ismi}</span>}
                      </td>
                      {odemeDestek && (() => {
                        const alindi = odemeAlindiMi(s.konsimento_durumu);
                        const bekliyor = odemeBekliyorMu(s);
                        const gecmis = hatirlatmaHaritasi[s.rezervasyon_id] || [];
                        const son = gecmis[0];
                        const sira = siradakiSablon(gecmis.length);
                        const turdaGitti = buTurGonderildi(s.rezervasyon_id);
                        return (
                          <>
                            <td className="px-2 py-2 whitespace-nowrap">
                              <div className="relative inline-flex items-center">
                                <select
                                  value={s.konsimento_durumu || ""}
                                  onChange={(e) => handleDurumKaydet(s.rezervasyon_id, e.target.value)}
                                  disabled={durumKaydediliyor === s.rezervasyon_id}
                                  aria-label={`${s.booking_no || s.dosya_no} konşimento durumu`}
                                  title={konsimentoDurumuMu(s.konsimento_durumu)
                                    ? `${KONSIMENTO_ACIKLAMA[s.konsimento_durumu]}${s.konsimento_durumu_tarihi ? `\n${s.konsimento_durumu_kaynak === "excel" ? "Excel'den" : "Elle"} · ${new Date(s.konsimento_durumu_tarihi).toLocaleString("tr-TR")}` : ""}`
                                    : "Girilmedi"}
                                  className={`appearance-none rounded px-2 py-0.5 pr-5 text-[11px] font-medium border cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-400 disabled:opacity-60 ${
                                    alindi ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/25" : s.konsimento_durumu ? "text-amber-300 bg-amber-500/10 border-amber-500/25" : "border-transparent"
                                  }`}
                                  style={{ colorScheme: "dark", ...(s.konsimento_durumu ? {} : { color: TEXT_MUTED, backgroundColor: "rgba(255,255,255,0.03)" }) }}
                                >
                                  <option value="">—</option>
                                  {KONSIMENTO_DURUMLARI.map((k) => <option key={k} value={k} title={KONSIMENTO_ACIKLAMA[k]}>{KONSIMENTO_ETIKETI[k]}</option>)}
                                </select>
                                {durumKaydediliyor === s.rezervasyon_id
                                  ? <Loader2 size={10} className="animate-spin absolute right-1.5 pointer-events-none" style={{ color: TEXT_MUTED }} />
                                  : <span className="absolute right-1.5 text-[8px] pointer-events-none" style={{ color: TEXT_MUTED }}>▼</span>}
                              </div>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              {alindi ? (
                                <span className="text-[11px] text-emerald-400">Ödeme alındı</span>
                              ) : bekliyor ? (
                                <div className="flex flex-col items-start gap-0.5">
                                  {turdaGitti ? (
                                    <button
                                      onClick={() => setHatirlatmaAcik(s)}
                                      data-testid={`hatirlat-${s.booking_no}`}
                                      title="Bu tur gönderildi. Tekrar göndermek için tıklayın."
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 transition-colors"
                                    >
                                      <CheckCircle2 size={11} /> Bu tur gönderildi
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => setHatirlatmaAcik(s)}
                                      data-testid={`hatirlat-${s.booking_no}`}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 transition-colors"
                                    >
                                      <Send size={11} /> Hatırlat · {sira}. mesaj
                                    </button>
                                  )}
                                  {son ? (
                                    <span className="text-[10px] leading-tight" style={{ color: TEXT_MUTED }} title={`${son.alici} · ${SABLON_BILGI[son.sablon as HatirlatmaSablonu]?.ad || ""}`}>
                                      son: <span className="text-white">{gunOnce(son.gonderim_zamani)}</span> · {gecmis.length}. mesaj
                                    </span>
                                  ) : (
                                    <span className="text-[10px]" style={{ color: TEXT_MUTED }}>henüz gönderilmedi</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10px]" style={{ color: TEXT_MUTED }}>{s.etd ? "Kalkış bekleniyor" : "—"}</span>
                              )}
                            </td>
                          </>
                        );
                      })()}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hatirlatmaAcik && (
        <OdemeHatirlatmaPenceresi
          sevkiyat={hatirlatmaAcik}
          gecmis={hatirlatmaHaritasi[hatirlatmaAcik.rezervasyon_id] || []}
          siradaki={siradakiSablon((hatirlatmaHaritasi[hatirlatmaAcik.rezervasyon_id] || []).length)}
          onKapat={() => setHatirlatmaAcik(null)}
          onKaydet={(v) => handleHatirlatmaKaydet(hatirlatmaAcik, v)}
        />
      )}
      {excelAcik && (
        <EtdExcelAktar
          sistem={satirlar.map((s) => ({
            rezervasyon_id: s.rezervasyon_id, booking_no: s.booking_no, bl_no: s.bl_no,
            alici_firma: s.alici_firma, dosya_no: s.dosya_no, konsimento_durumu: s.konsimento_durumu,
          }))}
          onKapat={() => setExcelAcik(false)}
          onUygula={handleExcelUygula}
        />
      )}
    </AppShell>
  );
}