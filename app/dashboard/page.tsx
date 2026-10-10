"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, Dosya, Rezervasyon, Konteyner, DOSYA_LISTE_KOLONLARI } from "@/lib/supabase";
import { formatDateTR, bugunTarihIstanbul, efektifTartimBilgisi, getCutOffDays } from "@/lib/cutoff-utils";
import { dosyaAkisiHesapla, rezervasyonlariSirala, type CutoffDurumu } from "@/lib/dashboard-akis";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import AppShell from "@/components/app-shell";
import { Ship, FileText, CheckCircle2, AlertTriangle, Clock, Package, TrendingUp, ChevronRight, ExternalLink, Loader2, LayoutDashboard, RefreshCw, Archive } from "lucide-react";
import InfoTooltip from "@/components/info-tooltip";
import { EmptyState } from "@/components/empty-state";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { kalemMiktari } from "@/lib/sayi-oku";


type DosyaDurum = {
  dosya: Dosya;
  rezervasyonlar: Rezervasyon[];
  konteynerler: Konteyner[];
};

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

// Cut-off'a kalan gun: Panel ve Rezervasyon karti ile AYNI hesap (takvim gunu
// farki, saat dilimi donusumu olmadan - bkz. lib/cutoff-utils.ts getCutOffDays).
function getDaysUntil(dateStr: string | null): number | null {
  return getCutOffDays(dateStr);
}

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
  const color = days < 0 ? "bg-red-500/10 text-red-400" : days <= 1 ? "bg-red-500/10 text-red-400 animate-pulse" : days <= 3 ? "bg-amber-500/10 text-amber-400 animate-pulse" : "bg-white/5 text-slate-300";
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

  const aciklar = durumlar;
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

      {/* Ozet kartlar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { key: "aktif", label: "Aktif Dosya", value: aciklar.length, icon: <FileText size={18} />, color: ACCENT, bg: "#0F2A20", pulse: false, href: "/panel" },
          { key: "rezervasyon", label: "Rezervasyon Bekleyen", value: bekleyenRez, icon: <Ship size={18} />, color: bekleyenRez > 0 ? "#F87171" : "#34D399", bg: bekleyenRez > 0 ? "#2A1519" : "#0F2A20", pulse: bekleyenRez > 0, href: "/panel?filter=rezervasyon" },
          { key: "kapali", label: "Kapalı Dosya", value: kapaliToplam, icon: <CheckCircle2 size={18} />, color: TEXT_MUTED, bg: CARD_BG, pulse: false, href: "/ihracatlar" },
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
                <span className="font-semibold text-amber-400">Rezervasyon bekleyen dosyalar:</span>
                <ul className="mt-1.5 space-y-1.5">
                  {aciklar.filter(d => d.rezervasyonlar.length === 0).map(({ dosya }) => {
                    const urunler = (dosya.urun_detaylari as any[]) || [];
                    const toplamMts = urunler.reduce((s: number, u: any) => s + kalemMiktari(u), 0);
                    return (
                      <li key={dosya.id} className="text-slate-300">
                        <span className="font-medium text-white">{dosya.alici_firma || "Firma belirtilmemiş"}</span>
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
                <span className="font-semibold text-slate-200">Aktif dosyalar:</span>
                <div className="mt-2 space-y-3 max-h-80 overflow-y-auto">
                  {aciklar.map(({ dosya, rezervasyonlar }) => {
                    const rez = rezervasyonlar[0];
                    const tCutoff = getDaysUntil(rez?.talimat_cutoff || null);
                    const bCutoff = getDaysUntil(rez?.beyanname_cutoff || null);
                    return (
                      <div key={dosya.id} className="pb-2 border-b last:border-0" style={{ borderColor: "#F1F5F9" }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">Açık</span>
                          <span className="font-semibold text-white">{dosya.dosya_no}</span>
                        </div>
                        <p className="text-slate-400">{dosya.alici_firma || "-"} {rez?.konteyner_adedi ? `— ${rez.konteyner_adedi}x` : ""} {dosya.varis_limani ? `— ${dosya.varis_limani}` : ""}</p>
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

      {/* Gunluk Kantar Raporu - yeni sekmede acilir, yazdirmaya/PDF'e uygun ayri bir sayfa */}
      <div className="rounded-xl border shadow-sm p-4 mb-8 flex items-center justify-between gap-3 flex-wrap"
        style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: "#0F2A20", color: ACCENT }}>
            <FileText size={18} />
          </div>
          <div>
            <p className="text-xs font-medium" style={{ color: TEXT_MUTED }}>Bugün Yüklenen</p>
            <p className="text-xl font-bold" style={{ color: ACCENT }}>{bugunYuklenenSayisi} <span className="text-sm font-medium" style={{ color: TEXT_MUTED }}>konteyner</span></p>
          </div>
        </div>
        <button
          onClick={() => window.open("/rapor/gunluk", "_blank")}
          className="text-sm font-semibold px-4 py-2 rounded-lg text-white hover:brightness-110 transition-all"
          style={{ backgroundColor: ACCENT }}
        >
          Günlük Rapor
        </button>
      </div>

      {/* Aktif dosyalar - akis durumu */}
      {aciklar.length > 0 && (
        <div className="space-y-2 mb-6">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} style={{ color: ACCENT }} />
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Aktif Dosyalar — İş Akışı</h2>
          </div>

          {aciklar.map(({ dosya, rezervasyonlar, konteynerler }, idx) => {
            const akis = dosyaAkisiHesapla({
              rezervasyonlar,
              konteynerler,
              faturaVar: !!dosya.fatura_dosya_url,
              konsimentoVar: !!dosya.konsimento_dosya_url,
              draftBlVar: !!dosya.draft_bl_dosya_url,
            });
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
                <div className="px-4 py-2.5 border-b flex items-center justify-between gap-3" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-2 h-2 rounded-full animate-pulse shrink-0" style={{ backgroundColor: "#22c55e" }} />
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
                  <div className="flex items-center gap-2 shrink-0">
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