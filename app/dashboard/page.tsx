"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, Dosya, Rezervasyon, Konteyner, DOSYA_LISTE_KOLONLARI } from "@/lib/supabase";
import { formatDateTR, bugunTarihIstanbul, efektifTartimBilgisi } from "@/lib/cutoff-utils";
import { dosyaAkisiHesapla, rezervasyonlariSirala, type CutoffDurumu, type DosyaAkisi } from "@/lib/dashboard-akis";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import AppShell from "@/components/app-shell";
import { Ship, FileText, CheckCircle2, AlertTriangle, Clock, Package, TrendingUp, ChevronRight, ExternalLink, Loader2, LayoutDashboard, RefreshCw, Archive, Container, Timer, CalendarClock } from "lucide-react";
import InfoTooltip from "@/components/info-tooltip";
import { EmptyState } from "@/components/empty-state";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";


type DosyaDurum = {
  dosya: Dosya;
  rezervasyonlar: Rezervasyon[];
  konteynerler: Konteyner[];
};

type AkisliDosya = DosyaDurum & { akis: DosyaAkisi };

/** Cut-off uyarisi esigi: takvim gunu olarak <= 2 (yaklasik 48 saat) ve ilgili adim bitmemis. */
const CUTOFF_UYARI_GUN = 2;

type CutoffUyarisi = { dosyaId: string; dosyaNo: string; tur: "Talimat" | "Beyanname"; gun: number };

function gunMetni(gun: number): string {
  return gun < 0 ? `${-gun}g geçti` : gun === 0 ? "bugün" : `${gun}g`;
}

/** Tamamlanan Dosyalar listesi icin hafif satir (sadece son 10 kapali dosya cekilir). */
type KapaliSatir = {
  id: string;
  dosya_no: string | null;
  alici_firma: string | null;
  rez: Pick<Rezervasyon, "booking_no" | "konteyner_adedi" | "gemi_kalkis_tarihi"> | null;
};

const KAPALI_LISTE_LIMITI = 10;
const YENILEME_MS = 60_000;
// Dashboard'a gereken konteyner alanlari (eskiden select("*") ile tum DBA JSON'u cekiliyordu)
const KONTEYNER_KOLONLARI = "id, dosya_id, konteyner_no, net_agirlik_kg, brut_agirlik_kg, pieces, dba_dosya_url";
const REZERVASYON_KOLONLARI = "id, dosya_id, booking_no, gemi_adi, acente_ismi, yuklenme_limani, konteyner_adedi, gemi_kalkis_tarihi, talimat_cutoff, beyanname_cutoff";

function CutoffBadge({ durum, label }: { durum: CutoffDurumu; label: string }) {
  const days = durum.gun;
  if (days === null) return null;
  // Ilgili adim bittiyse (talimat: konsimento/Draft BL, beyanname: fatura) alarm verilmez
  if (durum.tamam) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/5" style={{ color: TEXT_MUTED }} title={`${label} adımı tamamlandı`}>
        <CheckCircle2 size={11} /> {label}
      </span>
    );
  }
  const color = days < 0 ? "bg-red-500/10 text-red-400" : days <= 1 ? "bg-red-500/10 text-red-400 animate-pulse" : days <= 3 ? "bg-amber-500/10 text-amber-400" : "bg-white/5 text-slate-300";
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
        bekliyor ? "bg-amber-400 border-amber-400 text-white" :
        "border-2"
      } ${tooltip ? "cursor-pointer" : ""}`}
      style={!tamamlandi && !bekliyor ? { backgroundColor: "#1A1F2B", borderColor: "#2A3141" } : undefined}>
        {tamamlandi ? <CheckCircle2 size={12} /> : bekliyor ? <Clock size={12} /> : <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#3A4152" }} />}
      </div>
      <p className={`text-[9px] font-medium text-center leading-tight ${tamamlandi ? "text-green-400" : bekliyor ? "text-amber-400" : ""}`} style={!tamamlandi && !bekliyor ? { color: "#5A6272" } : undefined}>{label}</p>
      {sublabel && <p className="text-[8px] text-center" style={{ color: "#5A6272" }}>{sublabel}</p>}
      {tooltip && hover && (
        <div className="absolute top-full left-0 pt-1.5 z-30" style={{ width: "max-content", maxWidth: "320px" }}>
          <div className="p-3 rounded-lg shadow-xl border animate-fade-in overflow-y-auto"
            style={{ backgroundColor: "#1A1F2B", borderColor: CARD_BORDER, maxHeight: "min(60vh, 400px)" }}>
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
  const { user, yetkiler, companyId, loading: authLoading } = useAuth(); // Global context'ten companyId alındı
  const router = useRouter();
  const [durumlar, setDurumlar] = useState<DosyaDurum[]>([]);
  const [kapalilar, setKapalilar] = useState<KapaliSatir[]>([]);
  const [kapaliToplam, setKapaliToplam] = useState(0);
  const [bugunYuklenenSayisi, setBugunYuklenenSayisi] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [sonGuncelleme, setSonGuncelleme] = useState<Date | null>(null);
  // Ust uste binen yenilemelerde sadece EN SON istegin sonucu yazilir
  const istekSira = useRef(0);

  /**
   * Veri (10.10.2026): eskiden TUM dosyalarin (kapalilar dahil) tum
   * rezervasyon/konteyner kayitlari select("*") ile cekiliyordu - dosya sayisi
   * arttikca yavaslar, bir noktada URL limitine takilirdi. Artik: acik
   * dosyalarin detayi + son 10 kapali dosya + bugun yuklenenler icin son 2
   * gunde DBA'si yuklenmis konteynerler. Hata sessizce yutulmaz.
   */
  const fetchData = useCallback(async () => {
    if (!user?.id || !companyId) return;
    const sira = ++istekSira.current;
    const guncelMi = () => sira === istekSira.current;
    try {
      const ikiGunOnce = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const [acikSonuc, kapaliSonuc, bugunSonuc] = await Promise.all([
        supabase
          .from("ihracat_dosyalari")
          .select(`${DOSYA_LISTE_KOLONLARI}, draft_bl_dosya_url`)
          .eq("company_id", companyId)
          .or("durum.is.null,durum.not.in.(Kapalı,Kapali)")
          .order("olusturma_tarihi", { ascending: false })
          .returns<Dosya[]>(),
        supabase
          .from("ihracat_dosyalari")
          .select("id, dosya_no, alici_firma", { count: "exact" })
          .eq("company_id", companyId)
          .in("durum", ["Kapalı", "Kapali"])
          .order("olusturma_tarihi", { ascending: false })
          .limit(KAPALI_LISTE_LIMITI),
        // Bugun TARTILAN konteyner: tartim bugunse DBA en erken bugun yuklenmistir
        supabase
          .from("konteynerler")
          .select("id, dba_kontrol_sonucu, dba_yukleme_tarihi")
          .eq("company_id", companyId)
          .not("dba_dosya_url", "is", null)
          .gte("dba_yukleme_tarihi", ikiGunOnce),
      ]);
      if (acikSonuc.error) throw new Error(`Dosyalar okunamadı: ${acikSonuc.error.message}`);
      if (kapaliSonuc.error) throw new Error(`Kapalı dosyalar okunamadı: ${kapaliSonuc.error.message}`);
      if (bugunSonuc.error) throw new Error(`Yüklenen konteynerler okunamadı: ${bugunSonuc.error.message}`);

      const acikDosyalar = acikSonuc.data || [];
      const kapaliDosyalar = (kapaliSonuc.data || []) as { id: string; dosya_no: string | null; alici_firma: string | null }[];
      const acikIdler = acikDosyalar.map((d) => d.id);
      const rezIdler = [...acikIdler, ...kapaliDosyalar.map((d) => d.id)];

      const [rezSonuc, kontSonuc] = await Promise.all([
        rezIdler.length
          ? supabase.from("rezervasyonlar").select(REZERVASYON_KOLONLARI).eq("company_id", companyId).in("dosya_id", rezIdler)
          : Promise.resolve({ data: [], error: null }),
        acikIdler.length
          ? supabase.from("konteynerler").select(KONTEYNER_KOLONLARI).eq("company_id", companyId).in("dosya_id", acikIdler)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (rezSonuc.error) throw new Error(`Rezervasyonlar okunamadı: ${rezSonuc.error.message}`);
      if (kontSonuc.error) throw new Error(`Konteynerler okunamadı: ${kontSonuc.error.message}`);
      if (!guncelMi()) return;

      const rezler = (rezSonuc.data || []) as Rezervasyon[];
      const konteynerler = (kontSonuc.data || []) as Konteyner[];
      setDurumlar(acikDosyalar.map((d) => ({
        dosya: d,
        rezervasyonlar: rezervasyonlariSirala(rezler.filter((r) => r.dosya_id === d.id)),
        konteynerler: konteynerler.filter((k) => k.dosya_id === d.id),
      })));
      setKapalilar(kapaliDosyalar.map((d) => ({
        ...d,
        rez: rezervasyonlariSirala(rezler.filter((r) => r.dosya_id === d.id))[0] ?? null,
      })));
      setKapaliToplam(kapaliSonuc.count ?? kapaliDosyalar.length);
      const bugunStr = bugunTarihIstanbul();
      setBugunYuklenenSayisi(((bugunSonuc.data || []) as Pick<Konteyner, "dba_kontrol_sonucu" | "dba_yukleme_tarihi">[])
        .filter((k) => efektifTartimBilgisi(k.dba_kontrol_sonucu, k.dba_yukleme_tarihi)?.gun === bugunStr).length);
      setHata(null);
      setSonGuncelleme(new Date());
    } catch (e) {
      if (!guncelMi()) return;
      // Onceki veri EKRANDA KALIR (bos "dosya yok" gosterilmez); hata ayrica belirtilir
      setHata(e instanceof Error ? e.message : "Veri okunamadı.");
    } finally {
      if (guncelMi()) setLoading(false);
    }
  }, [user?.id, companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Otomatik yenileme: sayfa gorunurken dakikada bir + sekmeye donulunce
  useEffect(() => {
    const yenile = () => { if (document.visibilityState === "visible") fetchData(); };
    const zamanlayici = window.setInterval(yenile, YENILEME_MS);
    document.addEventListener("visibilitychange", yenile);
    return () => { window.clearInterval(zamanlayici); document.removeEventListener("visibilitychange", yenile); };
  }, [fetchData]);

  useEffect(() => {
    // Yetkiler veritabanindan gelmeden karar verilmez: yuklenirken tum yetkiler
    // gecici olarak kapali gorunur ve tam yetkili kullanici bile sayfayi
    // yenileyince baska sayfaya atiliyordu (duzeltme: 01.10.2026). Hic sayfa
    // yetkisi yoksa yonlendirme yapilmaz - AppShell "Erisim yetkiniz yok"
    // ekranini gosterir (bkz. lib/yetki-utils.ts).
    if (authLoading) return;
    if (!yetkiler.sayfa_yetkileri.dashboard) {
      const hedef = ilkErisilebilirSayfa(yetkiler.sayfa_yetkileri);
      if (hedef) router.replace(hedef);
    }
  }, [authLoading, yetkiler, router]);

  // Akis her dosya icin BIR kez hesaplanir; kartlar ve ust ozet ayni sonucu kullanir
  const aciklar: AkisliDosya[] = useMemo(() => durumlar.map((d) => ({
    ...d,
    akis: dosyaAkisiHesapla({
      rezervasyonlar: d.rezervasyonlar,
      konteynerler: d.konteynerler,
      faturaVar: !!d.dosya.fatura_dosya_url,
      konsimentoVar: !!d.dosya.konsimento_dosya_url,
      draftBlVar: !!d.dosya.draft_bl_dosya_url,
    }),
  })), [durumlar]);
  const bekleyenRez = aciklar.filter(d => d.rezervasyonlar.length === 0).length;
  // Gunluk raporla AYNI kural: acik sevkiyatlarda max(planlanan, eklenen) - DBA yuklenen
  const yuklenecekDosyalar = aciklar
    .map((d) => ({ d, kalan: Math.max(0, d.akis.adet - d.akis.dbaYuklenen) }))
    .filter((x) => x.kalan > 0);
  const yuklenecekToplam = yuklenecekDosyalar.reduce((t, x) => t + x.kalan, 0);
  const cutoffUyarilari: CutoffUyarisi[] = aciklar.flatMap(({ dosya, akis }) =>
    ([["Talimat", akis.talimat], ["Beyanname", akis.beyanname]] as const)
      .filter(([, c]) => !c.tamam && c.gun !== null && c.gun <= CUTOFF_UYARI_GUN)
      .map(([tur, c]) => ({ dosyaId: dosya.id, dosyaNo: dosya.dosya_no || "-", tur, gun: c.gun as number }))
  ).sort((a, b) => a.gun - b.gun);
  const acilCutoff = cutoffUyarilari.some((u) => u.gun <= 1);

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

  const hicVeriYok = durumlar.length === 0 && kapalilar.length === 0;
  const yenileDugmesi = (
    <button onClick={() => { setLoading(true); fetchData(); }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5 transition-colors"
      style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
      <RefreshCw size={13} /> Yeniden dene
    </button>
  );

  return (
    <AppShell>
      {/* Baslik */}
      <SayfaBasligi
        ikon={<LayoutDashboard size={20} />}
        baslik="Kontrol Merkezi"
        aciklama="Tüm ihracat operasyonlarının anlık durumu"
        className="mb-6"
        sag={sonGuncelleme && (
          <span className="text-[11px]" style={{ color: TEXT_MUTED }} title="Sayfa dakikada bir kendiliğinden yenilenir">
            Son güncelleme {sonGuncelleme.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      />

      {hata && (
        <div className="rounded-xl border p-3 mb-6 flex items-center justify-between gap-3 flex-wrap" style={{ backgroundColor: "rgba(248,113,113,0.06)", borderColor: "rgba(248,113,113,0.35)" }}>
          <p className="text-sm text-red-400 flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            {hicVeriYok ? "Kontrol merkezi verisi okunamadı." : "Son yenileme başarısız; ekrandaki bilgiler son başarılı okumaya ait."}
            <span className="text-xs" style={{ color: TEXT_MUTED }}>({hata})</span>
          </p>
          {yenileDugmesi}
        </div>
      )}

      {/* Ozet: 4 kutu - Aktif Dosya / Bugun Yuklenen / Yuklenecek Konteyner / Cut-off Uyarisi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {/* 1) Aktif Dosya */}
        <div onClick={() => router.push("/panel")}
          className="rounded-xl border shadow-sm p-4 cursor-pointer hover:border-white/20 transition-colors animate-fade-up stagger-1"
          style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: "#0F2A20", color: ACCENT }}><FileText size={16} /></div>
            <p className="text-xs font-medium flex-1 truncate" style={{ color: TEXT_MUTED }}>Aktif Dosya</p>
            {aciklar.length > 0 && (
              <span onClick={(e) => e.stopPropagation()}>
                <InfoTooltip variant="info" position="bottom" align="right" width="w-80">
                  <span className="font-semibold text-slate-200">Aktif dosyalar:</span>
                  <div className="mt-2 space-y-3 max-h-80 overflow-y-auto">
                    {aciklar.map(({ dosya, akis }) => {
                      const rez = akis.anaRezervasyon;
                      return (
                        <div key={dosya.id} className="pb-2 border-b last:border-0" style={{ borderColor: CARD_BORDER }}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-white">{dosya.dosya_no}</span>
                            {akis.kapatmayaHazir && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">Kapatmaya hazır</span>}
                          </div>
                          <p className="text-slate-400">{dosya.alici_firma || "-"}{akis.adet ? ` — ${akis.adet}x` : ""}{dosya.varis_limani ? ` — ${dosya.varis_limani}` : ""}</p>
                          {rez?.booking_no && <p className="text-slate-400">Booking: {rez.booking_no}{rez.gemi_adi ? ` — ${rez.gemi_adi}` : ""}</p>}
                          {akis.etd && <p className="text-slate-400">ETD: {formatDateTR(akis.etd)}</p>}
                          {!rez && <p className="text-amber-400">Rezervasyon bekleniyor</p>}
                        </div>
                      );
                    })}
                  </div>
                </InfoTooltip>
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-white">{aciklar.length}</p>
          <p className={`text-[11px] mt-0.5 ${bekleyenRez > 0 ? "text-amber-400" : ""}`} style={bekleyenRez > 0 ? undefined : { color: TEXT_MUTED }}>
            {bekleyenRez > 0 ? `${bekleyenRez} dosya rezervasyon bekliyor` : "Tüm dosyalarda rezervasyon var"}
          </p>
        </div>

        {/* 2) Bugun Yuklenen + Gunluk Rapor */}
        <div className="rounded-xl border shadow-sm p-4 animate-fade-up stagger-2" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: "#0F2A20", color: ACCENT }}><CheckCircle2 size={16} /></div>
            <p className="text-xs font-medium flex-1 truncate" style={{ color: TEXT_MUTED }}>Bugün Yüklenen</p>
          </div>
          <div className="flex items-end justify-between gap-2">
            <p className="text-2xl font-bold text-white">{bugunYuklenenSayisi} <span className="text-xs font-medium" style={{ color: TEXT_MUTED }}>konteyner</span></p>
            <button onClick={() => window.open("/rapor/gunluk", "_blank")}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white hover:brightness-110 transition-all shrink-0"
              style={{ backgroundColor: ACCENT }}>
              Günlük Rapor
            </button>
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>DBA tartım tarihine göre</p>
        </div>

        {/* 3) Yuklenecek Konteyner (gunluk raporla ayni hesap) */}
        <div className="rounded-xl border shadow-sm p-4 animate-fade-up stagger-3" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: yuklenecekToplam > 0 ? "rgba(245,158,11,0.12)" : CARD_BORDER, color: yuklenecekToplam > 0 ? "#FBBF24" : TEXT_MUTED }}><Container size={16} /></div>
            <p className="text-xs font-medium flex-1 truncate" style={{ color: TEXT_MUTED }}>Yüklenecek Konteyner</p>
            {yuklenecekDosyalar.length > 0 && (
              <InfoTooltip variant="info" position="bottom" align="right" width="w-72">
                <span className="font-semibold text-slate-200">Yüklenmeyi bekleyen:</span>
                <ul className="mt-1.5 space-y-1">
                  {yuklenecekDosyalar.map(({ d, kalan }) => (
                    <li key={d.dosya.id} className="text-slate-300 flex justify-between gap-3">
                      <span className="truncate"><span className="font-medium text-white">{d.dosya.dosya_no}</span> · {d.dosya.alici_firma || "-"}</span>
                      <span className="shrink-0 text-amber-400 font-semibold">{kalan}</span>
                    </li>
                  ))}
                </ul>
              </InfoTooltip>
            )}
          </div>
          <p className="text-2xl font-bold text-white">{yuklenecekToplam}</p>
          <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>
            {yuklenecekToplam > 0 ? `açık sevkiyatlarda kalan · ${yuklenecekDosyalar.length} dosya` : "Açık sevkiyatlarda bekleyen yok"}
          </p>
        </div>

        {/* 4) Cut-off uyarisi: <= 2 gun kalan (veya gecen) ve ilgili adimi bitmemis */}
        <div className="rounded-xl border shadow-sm p-4 animate-fade-up stagger-4"
          style={{ backgroundColor: cutoffUyarilari.length > 0 ? "rgba(248,113,113,0.05)" : CARD_BG, borderColor: cutoffUyarilari.length > 0 ? "rgba(248,113,113,0.35)" : CARD_BORDER }}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-1.5 rounded-lg shrink-0 ${acilCutoff ? "animate-pulse" : ""}`}
              style={{ backgroundColor: cutoffUyarilari.length > 0 ? "#2A1519" : CARD_BORDER, color: cutoffUyarilari.length > 0 ? "#F87171" : TEXT_MUTED }}><Timer size={16} /></div>
            <p className="text-xs font-medium flex-1 truncate" style={{ color: TEXT_MUTED }}>Cut-off Uyarısı</p>
          </div>
          <p className={`text-2xl font-bold ${cutoffUyarilari.length > 0 ? "text-red-400" : "text-white"}`}>{cutoffUyarilari.length}</p>
          {cutoffUyarilari.length > 0 ? (
            <div className="mt-0.5 space-y-0.5">
              {cutoffUyarilari.slice(0, 2).map((u) => (
                <Link key={`${u.dosyaId}-${u.tur}`} href={`/dosya/${u.dosyaId}`} className="block text-[11px] text-red-300 hover:text-red-200 truncate">
                  {u.dosyaNo} · {u.tur} {gunMetni(u.gun)}
                </Link>
              ))}
              {cutoffUyarilari.length > 2 && <p className="text-[11px]" style={{ color: TEXT_MUTED }}>+{cutoffUyarilari.length - 2} uyarı daha</p>}
            </div>
          ) : (
            <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>48 saat içinde bekleyen cut-off yok</p>
          )}
        </div>
      </div>

      {/* Aktif dosyalar - akis durumu */}
      {aciklar.length > 0 && (
        <div className="space-y-2 mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} style={{ color: ACCENT }} />
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Aktif Dosyalar — İş Akışı</h2>
          </div>

          {aciklar.map(({ dosya, konteynerler, akis }, idx) => {
            const acil = [akis.talimat, akis.beyanname].some((c) => !c.tamam && c.gun !== null && c.gun <= 1);
            const durumRengi = akis.kapatmayaHazir ? "#34D399" : acil ? "#F87171" : akis.siradaki === "rezervasyon" ? "#FBBF24" : "#22c55e";
            const rez = akis.anaRezervasyon as Rezervasyon | null;
            const staggerClass = idx < 8 ? `stagger-${idx + 1}` : "stagger-8";

            const adimIpucu = (anahtar: string): React.ReactNode => {
              if (anahtar === "rezervasyon" && rez) {
                return (
                  <div className="space-y-1.5 text-xs text-slate-200">
                    <p><span className="font-semibold text-slate-400">Booking No:</span> {rez.booking_no || "-"}{akis.digerRezervasyonSayisi > 0 ? ` (+${akis.digerRezervasyonSayisi} rezervasyon)` : ""}</p>
                    <p><span className="font-semibold text-slate-400">Gemi Adı:</span> {rez.gemi_adi || "-"}</p>
                    <p><span className="font-semibold text-slate-400">Acente:</span> {rez.acente_ismi || "-"}</p>
                    <p><span className="font-semibold text-slate-400">Yükleme Limanı:</span> {rez.yuklenme_limani || "-"}</p>
                    <p><span className="font-semibold text-slate-400">Konteyner Adedi:</span> {akis.planlanan || "-"}</p>
                    <p><span className="font-semibold text-slate-400">Gemi Kalkış:</span> {rez.gemi_kalkis_tarihi ? formatDateTR(rez.gemi_kalkis_tarihi) : "-"}</p>
                  </div>
                );
              }
              if (anahtar === "konteyner" && konteynerler.length > 0) {
                return (
                  <table className="text-xs w-full" style={{ minWidth: "280px" }}>
                    <thead>
                      <tr className="border-b" style={{ borderColor: CARD_BORDER }}>
                        <th className="text-left font-semibold text-slate-400 pb-1.5 pr-2">Konteyner</th>
                        <th className="text-right font-semibold text-slate-400 pb-1.5 pr-2">Net</th>
                        <th className="text-right font-semibold text-slate-400 pb-1.5 pr-2">Brüt</th>
                        <th className="text-right font-semibold text-slate-400 pb-1.5">Kap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {konteynerler.map((k) => (
                        <tr key={k.id} className="border-b last:border-0" style={{ borderColor: CARD_BORDER }}>
                          <td className="font-mono text-white py-1 pr-2">{k.konteyner_no}</td>
                          <td className="text-right text-slate-300 py-1 pr-2">{k.net_agirlik_kg || "-"}</td>
                          <td className="text-right text-slate-300 py-1 pr-2">{(k as any).brut_agirlik_kg || "-"}</td>
                          <td className="text-right text-slate-300 py-1">{(k as any).pieces || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              }
              if (anahtar === "fatura" && dosya.fatura_dosya_url) {
                return (
                  <a href={dosya.fatura_dosya_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs font-medium text-emerald-400 hover:text-emerald-300 pointer-events-auto">
                    <FileText size={14} /> Faturayı Aç
                  </a>
                );
              }
              return undefined;
            };

            return (
              <div key={dosya.id} className={`rounded-xl border shadow-sm animate-fade-up ${staggerClass}`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                {/* Dosya baslik */}
                <div className="px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-x-3 gap-y-2" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${acil ? "animate-pulse" : ""}`} style={{ backgroundColor: durumRengi }}
                      title={akis.kapatmayaHazir ? "Tüm adımlar tamam" : acil ? "Cut-off'a 1 gün veya daha az kaldı" : "Devam ediyor"} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{dosya.dosya_no}</p>
                      <p className="text-xs truncate" style={{ color: TEXT_MUTED }}>{dosya.alici_firma || "-"}</p>
                    </div>
                    {rez?.booking_no && (
                      <span className="ml-2 text-xs font-mono px-2 py-0.5 rounded whitespace-nowrap shrink-0" style={{ backgroundColor: CARD_BORDER, color: TEXT_MUTED }}>
                        {rez.booking_no}{akis.digerRezervasyonSayisi > 0 ? ` +${akis.digerRezervasyonSayisi}` : ""}
                      </span>
                    )}
                    {rez?.gemi_adi && (
                      <span className="text-xs items-center gap-1 whitespace-nowrap shrink-0 hidden lg:flex" style={{ color: TEXT_MUTED }}>
                        <Ship size={11} /> {rez.gemi_adi}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:shrink-0">
                    {akis.etd && (
                      <span className="hidden md:inline-flex items-center gap-1 text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }} title="Gemi kalkış (ETD)">
                        <CalendarClock size={12} /> ETD {formatDateTR(akis.etd)}
                        {akis.etdGun !== null && !akis.kapatmayaHazir && (
                          <span className={akis.etdGun < 0 ? "" : akis.etdGun <= 3 ? "text-amber-400 font-semibold" : "text-slate-300"}>
                            · {akis.etdGun < 0 ? "kalktı" : akis.etdGun === 0 ? "bugün" : `${akis.etdGun}g`}
                          </span>
                        )}
                      </span>
                    )}
                    {akis.kapatmayaHazir && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400"
                        title="Tüm adımlar tamamlandı. Dosyayı detay sayfasından kapatabilirsiniz.">
                        <Archive size={11} /> Kapatmaya hazır
                      </span>
                    )}
                    <CutoffBadge durum={akis.talimat} label="Talimat" />
                    <CutoffBadge durum={akis.beyanname} label="Beyanname" />
                    <Link href={`/dosya/${dosya.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white transition-colors hover:opacity-90 whitespace-nowrap"
                      style={{ backgroundColor: ACCENT }}>
                      <ExternalLink size={12} /> Detay
                    </Link>
                  </div>
                </div>

                {/* Akis adimlari: Rezervasyon -> Konteyner -> Yukleme (DBA) -> Fatura -> Konsimento */}
                <div className="px-4 py-2">
                  <div className="flex items-start gap-0">
                    {akis.adimlar.map((adim, i) => (
                      <React.Fragment key={adim.anahtar}>
                        {i > 0 && <AkisConnector tamamlandi={akis.adimlar[i - 1].tamam} />}
                        <AkisAdimi
                          tamamlandi={adim.tamam}
                          bekliyor={akis.siradaki === adim.anahtar}
                          label={adim.etiket}
                          sublabel={adim.altEtiket}
                          tooltip={adimIpucu(adim.anahtar)}
                        />
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Eksik isler uyarisi */}
                {akis.eksikler.length > 0 && (
                  <div className="px-4 py-1.5 border-t flex items-center gap-2 flex-wrap" style={{ borderColor: CARD_BORDER }}>
                    <AlertTriangle size={12} className="text-amber-400 shrink-0" />
                    {akis.eksikler.map((e, i) => (
                      <span key={i} className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">{e}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Kapali dosyalar - son 10 (tamami Ihracatlar sayfasinda) */}
      {kapalilar.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Package size={16} style={{ color: TEXT_MUTED }} />
              <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Tamamlanan Dosyalar</h2>
              <span className="text-xs" style={{ color: TEXT_MUTED }}>({kapaliToplam})</span>
            </div>
            {kapaliToplam > kapalilar.length && (
              <Link href="/ihracatlar" className="text-xs font-medium hover:text-emerald-400 inline-flex items-center gap-1" style={{ color: TEXT_MUTED }}>
                Tümünü gör <ChevronRight size={13} />
              </Link>
            )}
          </div>
          <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                  <th className="text-left px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Dosya No</th>
                  <th className="text-left px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Alıcı</th>
                  <th className="text-right px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Kont.</th>
                  <th lang="en" className="text-left px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Booking No</th>
                  <th className="text-left px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Kalkış</th>
                  <th className="text-right px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}></th>
                </tr>
              </thead>
              <tbody>
                {kapalilar.map((k, idx) => {
                  const staggerClass = idx < 8 ? `stagger-${idx + 1}` : "stagger-8";
                  return (
                    <tr key={k.id} className={`border-b last:border-0 opacity-70 hover:opacity-100 transition-opacity animate-fade-up ${staggerClass}`} style={{ borderColor: CARD_BORDER }}>
                      <td className="px-2 py-2.5 text-sm font-medium text-white whitespace-nowrap">{k.dosya_no}</td>
                      <td className="px-2 py-2.5 text-xs max-w-[110px] truncate" style={{ color: TEXT_MUTED }}>{k.alici_firma || "-"}</td>
                      <td className="px-2 py-2.5 text-xs text-right whitespace-nowrap" style={{ color: TEXT_MUTED }}>{k.rez?.konteyner_adedi || "-"}</td>
                      <td className="px-2 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: TEXT_MUTED }}>{k.rez?.booking_no || "-"}</td>
                      <td className="px-2 py-2.5 text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{k.rez?.gemi_kalkis_tarihi ? formatDateTR(k.rez.gemi_kalkis_tarihi) : "-"}</td>
                      <td className="px-2 py-2.5 text-right">
                        <Link href={`/dosya/${k.id}`} className="text-xs hover:text-amber-500" style={{ color: TEXT_MUTED }}>
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

      {hicVeriYok && !hata && (
        <EmptyState
          icon={<Ship size={40} />}
          title="Henüz hiç dosya yok"
          description="İlk ihracat dosyanızı proforma yükleyerek oluşturun."
          action={
            <Link href="/yeni-dosya" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: ACCENT }}>
              Yeni Dosya Aç
            </Link>
          }
        />
      )}
    </AppShell>
  );
}