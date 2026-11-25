"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { IcPiyasaSekmeler } from "@/components/ic-piyasa-sekmeler";
import { ConfirmDialog } from "@/components/confirm-dialog";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { GemiAracFormu, GemiFormu, GemiHizliGiris, GemiLimanExcelYukle, LimanListesiPenceresi, SatisFormu } from "@/components/ic-gemi-pencereler";
import {
  Ship, Plus, Loader2, AlertCircle, AlertTriangle, Pencil, Trash2, Download, ClipboardPaste, Truck, RefreshCw, CheckCircle2, RotateCcw, Users, PauseCircle, PlayCircle, Unlink, Clock,
} from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { kgYazi, tonYazi, tarihSaatYazi } from "@/lib/ic-piyasa/is-emri";
import { bugunTRIso, gunTR } from "@/lib/ic-piyasa/alis";
import { trSayiOku } from "@/lib/ic-piyasa/irsaliye-oku";
import {
  GemiAlici, GemiArac, GemiDurum, GemiTahliye, UNEX_YER, aracFarki, araclariSirala, gemiHataMesaji, gemiRaporu, yerAdi, yoldaMi, yuzdeYazi,
} from "@/lib/ic-piyasa/gemi-tahliye";
import { GemiLimanBekleyenListesi } from "@/components/gemi-liman-bekleyen";
import { gemiRaporDosyaAdi, gemiRaporXlsx } from "@/lib/ic-piyasa/gemi-tahliye-xlsx";

/**
 * Ic Piyasa > Gemi Tahliye (25.11.2026). Gemi (anlasma / B/L tonaji) + gemiden satislar (firma + tonaj) +
 * araclar. UNEX'e gelen araci kantarci Kantar Paneli > Yurt Ici > Gemi'den girer (liman fisi + teslim tartimi);
 * gemiden satis araclarinin liman listesi burada yapistirilir. Rapor kullanicinin gemi raporu sablonuyla
 * ayni hesap (lib/ic-piyasa/gemi-tahliye.ts) ve Excel (gemi-tahliye-xlsx.ts). Yetki: ic_piyasa.
 * Mevcut alis / is emri / gunluk raporlara YANSIMAZ (kullanici karari).
 * 25.11.2026 gece - fabrika esasli: kantarda gemi adiyla tartilan arac otomatik UNEX araci (kaynak 'otomatik'); liman fisi
 * Excel'den eslesir. Liman fisi bekleyen araclar tabloda "fiş bekleniyor"; onay gerekenler ustteki listede.
 */

type Yer = "tumu" | "unex" | string;

const DURUM: Record<GemiDurum, { etiket: string; sinif: string }> = {
  acik: { etiket: "Tahliyede", sinif: "bg-sky-500/15 text-sky-400" },
  beklemede: { etiket: "Beklemede", sinif: "bg-amber-500/15 text-amber-400" },
  tamamlandi: { etiket: "Tamamlandı", sinif: "bg-emerald-500/15 text-emerald-400" },
};

export default function GemiTahliyePage() {
  const { companyId, yetkiler, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const yetkili = !!yetkiler.sayfa_yetkileri.ic_piyasa;

  const [gemiler, setGemiler] = useState<GemiTahliye[]>([]);
  const [alicilar, setAlicilar] = useState<GemiAlici[]>([]);
  const [araclar, setAraclar] = useState<GemiArac[]>([]);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [yer, setYer] = useState<Yer>("tumu");
  const [gunFiltre, setGunFiltre] = useState<string>("");

  const [gemiForm, setGemiForm] = useState<{ mevcut: GemiTahliye | null } | null>(null);
  const [satisForm, setSatisForm] = useState<{ mevcut: GemiAlici | null } | null>(null);
  const [aracForm, setAracForm] = useState(false);
  const [listeAcik, setListeAcik] = useState(false);
  const [silinecekArac, setSilinecekArac] = useState<GemiArac | null>(null);
  const [silinecekSatis, setSilinecekSatis] = useState<GemiAlici | null>(null);
  const [gemiIslem, setGemiIslem] = useState<"kapat" | "ac" | "sil" | "beklet" | null>(null);
  const [eslesmeKaldir, setEslesmeKaldir] = useState<GemiArac | null>(null);
  const [isleniyor, setIsleniyor] = useState(false);
  const [indiriliyor, setIndiriliyor] = useState(false);

  const getir = useCallback(async () => {
    if (!companyId) return;
    // Kantar tartimlarini yoldaki araclarla esle (sessiz; hata verse de liste okunur)
    await supabase.rpc("ic_gemi_kantar_esle");
    const g = await supabase.from("ic_gemi_tahliyeleri").select("*").eq("company_id", companyId).order("durum").order("olusturma", { ascending: false }).limit(100);
    if (g.error) {
      setOkumaHatasi(/does not exist|PGRST20/.test(g.error.message) ? "Gemi Tahliye tabloları henüz kurulmamış." : g.error.message);
      setYukleniyor(false);
      return;
    }
    const liste = (g.data || []) as GemiTahliye[];
    setGemiler(liste);
    const hedef = (seciliId && liste.find((x) => x.id === seciliId)) || liste.find((x) => x.durum === "acik") || liste[0] || null;
    setSeciliId(hedef?.id || null);
    if (hedef) {
      const [l, a] = await Promise.all([
        supabase.from("ic_gemi_alicilari").select("*").eq("gemi_id", hedef.id).order("olusturma"),
        supabase.from("ic_gemi_araclari").select("*").eq("gemi_id", hedef.id).order("tarih").order("olusturma").limit(5000),
      ]);
      if (l.error || a.error) { setOkumaHatasi((l.error || a.error)!.message); setYukleniyor(false); return; }
      setAlicilar((l.data || []) as GemiAlici[]);
      setAraclar((a.data || []) as GemiArac[]);
    } else { setAlicilar([]); setAraclar([]); }
    setOkumaHatasi(null);
    setYukleniyor(false);
  }, [companyId, seciliId]);

  useEffect(() => { if (!authLoading && yetkili) getir(); }, [authLoading, yetkili, getir]);
  useEffect(() => { setBekleyenTetik((x) => x + 1); }, [araclar]);
  // Kantarci arac girdikce rapor guncel kalsin
  useEffect(() => {
    if (!yetkili) return;
    const z = window.setInterval(() => { if (document.visibilityState === "visible") getir(); }, 60_000);
    return () => window.clearInterval(z);
  }, [yetkili, getir]);

  const gemi = gemiler.find((x) => x.id === seciliId) || null;
  const rapor = useMemo(() => (gemi ? gemiRaporu(gemi, alicilar, araclar) : null), [gemi, alicilar, araclar]);
  const acik = gemi?.durum === "acik";
  const gunler = useMemo(() => Array.from(new Set(araclar.map((a) => a.tarih))).sort().reverse(), [araclar]);
  const gorunen = useMemo(() => araclariSirala(araclar).filter((a) =>
    (yer === "tumu" || (yer === "unex" ? !a.alici_id : a.alici_id === yer)) && (!gunFiltre || a.tarih === gunFiltre)).reverse(), [araclar, yer, gunFiltre]);
  const gorunenToplam = useMemo(() => {
    // fark yalniz liman + teslimi olan UNEX araclarindan (yolda / liman fisi bekleyen haric)
    const eslesmis = gorunen.filter((a) => !a.alici_id && aracFarki(a) !== null);
    return {
      liman: gorunen.reduce((t, a) => t + Number(a.liman_kg ?? 0), 0),
      teslim: gorunen.reduce((t, a) => t + Number(a.teslim_kg || 0), 0),
      fark: eslesmis.reduce((t, a) => t + (aracFarki(a) || 0), 0),
      eslesmisSayi: eslesmis.length,
    };
  }, [gorunen]);
  const [limanKaldir, setLimanKaldir] = useState<GemiArac | null>(null);
  const [bekleyenTetik, setBekleyenTetik] = useState(0);

  const gemiSec = (id: string) => { setSeciliId(id); setYer("tumu"); setGunFiltre(""); };

  const excelIndir = async () => {
    if (!gemi) return;
    setIndiriliyor(true);
    try {
      const blob = await gemiRaporXlsx(gemi, alicilar, araclar);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = gemiRaporDosyaAdi(gemi, bugunTRIso());
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      showToast(`Excel oluşturulamadı: ${(e as Error).message}`, "error");
    } finally { setIndiriliyor(false); }
  };

  const aracSil = async () => {
    if (!silinecekArac) return;
    setIsleniyor(true);
    const { error } = await supabase.rpc("ic_gemi_arac_sil", { p_id: silinecekArac.id });
    setIsleniyor(false);
    if (error) { showToast(gemiHataMesaji(error), "error"); return; }
    showToast(silinecekArac.kaynak === "otomatik" ? `${silinecekArac.plaka} gemiden çıkarıldı (bu kantar tartımı bir daha eklenmez).` : `${silinecekArac.plaka} kaydı silindi.`, "success");
    setSilinecekArac(null);
    getir();
  };
  const limanKaldirUygula = async () => {
    if (!limanKaldir) return;
    setIsleniyor(true);
    const { error } = await supabase.rpc("ic_gemi_liman_esle", { p_arac: limanKaldir.id, p_fis: null, p_liman_kg: null });
    setIsleniyor(false);
    if (error) { showToast(gemiHataMesaji(error), "error"); return; }
    showToast(`${limanKaldir.plaka}: liman fişi bağlantısı kaldırıldı. Doğru fişi "Liman fişi bekleyen" listesinden seçin.`, "success");
    setLimanKaldir(null);
    getir();
  };
  const eslesmeKaldirUygula = async () => {
    if (!eslesmeKaldir) return;
    setIsleniyor(true);
    const { error } = await supabase.rpc("ic_gemi_teslim_gir", { p_id: eslesmeKaldir.id, p_teslim: null });
    setIsleniyor(false);
    if (error) { showToast(gemiHataMesaji(error), "error"); return; }
    showToast(`${eslesmeKaldir.plaka}: teslim kg kaldırıldı; araç yeniden "yolda". Doğru kg'ı elle girebilirsiniz.`, "success");
    setEslesmeKaldir(null);
    getir();
  };
  const satisSil = async () => {
    if (!silinecekSatis || !companyId) return;
    setIsleniyor(true);
    const s = await supabase.from("ic_gemi_alicilari").delete().eq("id", silinecekSatis.id).eq("company_id", companyId).select("id");
    setIsleniyor(false);
    const h = s.error ? gemiHataMesaji(s.error) : yazmaHatasi(null, s.data);
    if (h) { showToast(h, "error"); return; }
    showToast(`${silinecekSatis.firma} satışı silindi.`, "success");
    setSilinecekSatis(null);
    getir();
  };
  const gemiIslemUygula = async () => {
    if (!gemi || !companyId || !gemiIslem) return;
    setIsleniyor(true);
    const s = gemiIslem === "sil"
      ? await supabase.from("ic_gemi_tahliyeleri").delete().eq("id", gemi.id).eq("company_id", companyId).select("id")
      : await supabase.from("ic_gemi_tahliyeleri").update({ durum: gemiIslem === "kapat" ? "tamamlandi" : gemiIslem === "beklet" ? "beklemede" : "acik" }).eq("id", gemi.id).eq("company_id", companyId).select("id");
    setIsleniyor(false);
    const h = s.error ? gemiHataMesaji(s.error) : yazmaHatasi(null, s.data);
    if (h) { showToast(h, "error"); return; }
    showToast(gemiIslem === "sil" ? `${gemi.gemi_adi} silindi.` : gemiIslem === "kapat" ? `${gemi.gemi_adi} tahliyesi tamamlandı.` : gemiIslem === "beklet" ? `${gemi.gemi_adi} beklemeye alındı (kantarda görünmez).` : `${gemi.gemi_adi} tahliyeye açıldı.`, "success");
    if (gemiIslem === "sil") setSeciliId(null);
    setGemiIslem(null);
    getir();
  };

  if (!authLoading && !yetkili) {
    return <AppShell><div className="p-8 text-sm" style={{ color: TEXT_MUTED }}>Bu sayfa için yetkiniz yok.</div></AppShell>;
  }

  const kutu = (etiket: string, deger: string, alt?: string, renk = "text-white", testId?: string) => (
    <div className="rounded-xl border px-4 py-3" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid={testId}>
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>{etiket}</p>
      <p className={`text-lg font-bold tabular-nums mt-0.5 ${renk}`}>{deger}</p>
      {alt && <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{alt}</p>}
    </div>
  );
  const dugme = "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold text-white hover:bg-white/5 disabled:opacity-50";

  return (
    <AppShell>
      <div className="p-4 md:p-8 max-w-[1500px] mx-auto">
        <SayfaBasligi
          ikon={<Ship size={20} />}
          baslik="Gemi Tahliye"
          aciklama="Gemiden UNEX'e gelen ve gemiden satılan araçlar; rapor araçlar girildikçe oluşur. UNEX araçları Kantar Paneli › Yurt İçi › Gemi'den girilir."
          sag={
            <div className="flex items-center gap-2">
              <button onClick={() => getir()} className={dugme} style={{ borderColor: CARD_BORDER }} title="Yenile" aria-label="Yenile"><RefreshCw size={15} /></button>
              <button onClick={() => setGemiForm({ mevcut: null })} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white hover:brightness-110" style={{ backgroundColor: ACCENT }} data-testid="gemi-yeni">
                <Plus size={15} /> Yeni Gemi
              </button>
            </div>
          }
        />
        <IcPiyasaSekmeler />

        {yukleniyor && !gemiler.length ? <SayfaYukleniyor /> : okumaHatasi ? (
          <div className="rounded-xl border p-4 text-sm text-red-300 flex items-center gap-2" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}><AlertCircle size={16} /> Okunamadı: {okumaHatasi}</div>
        ) : !gemiler.length ? (
          <div className="rounded-xl border p-10 text-center" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
            <Ship size={36} className="mx-auto mb-3" style={{ color: CARD_BORDER }} />
            <p className="text-sm text-white font-semibold">Henüz gemi tahliyesi yok.</p>
            <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>&quot;Yeni Gemi&quot; ile gemi adını ve anlaşma (B/L) tonajını girin; kantarcı araçları girmeye başlayabilir.</p>
          </div>
        ) : (
          <>
            {/* Gemi secimi */}
            <div className="flex flex-wrap items-center gap-2 mb-4" role="tablist" aria-label="Gemiler">
              {gemiler.map((g) => (
                <button key={g.id} role="tab" aria-selected={g.id === seciliId} onClick={() => gemiSec(g.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${g.id === seciliId ? "text-white" : "hover:bg-white/5"}`}
                  style={g.id === seciliId ? { backgroundColor: "rgba(16,185,129,0.15)", borderColor: ACCENT } : { borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                  <Ship size={13} /> {g.gemi_adi}
                  <span className={`ml-1 px-1.5 rounded text-[10px] ${DURUM[g.durum].sinif}`}>{DURUM[g.durum].etiket}</span>
                </button>
              ))}
            </div>

            {gemi && rapor && (
              <>
                {/* Gemi bilgisi + islemler */}
                <div className="rounded-xl border p-4 mb-4 flex flex-wrap items-start gap-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                  <div className="min-w-0 mr-auto">
                    <h2 className="text-white font-bold text-base flex items-center gap-2">{gemi.gemi_adi}
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${DURUM[gemi.durum].sinif}`}>{gemi.durum === "tamamlandi" ? `Tamamlandı · ${tarihSaatYazi(gemi.kapanis_zamani)}` : DURUM[gemi.durum].etiket}</span>
                    </h2>
                    <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>
                      {[gemi.urun, gemi.kalite, gemi.satici, gemi.tahliye_limani, gemi.baslangic ? `Başlangıç ${gunTR(gemi.baslangic)}` : null].filter(Boolean).join(" · ")}
                    </p>
                    {gemi.notlar && <p className="text-xs mt-1 text-white/80">{gemi.notlar}</p>}
                    {gemi.durum === "beklemede" && <p className="text-xs mt-1 text-amber-300">Beklemede: Kantar Paneli&apos;nde görünmez, araç girilemez. Gemi gelince &quot;Tahliyeye Aç&quot;.</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={excelIndir} disabled={indiriliyor} className={dugme} style={{ borderColor: CARD_BORDER }} data-testid="gemi-excel">
                      {indiriliyor ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Excel Raporu
                    </button>
                    {acik && <GemiLimanExcelYukle gemi={gemi} kaydedildi={getir} testId="gemi-sayfa-excel" />}
                    {acik && <>
                      <button onClick={() => setListeAcik(true)} className={dugme} style={{ borderColor: CARD_BORDER }} data-testid="gemi-liste-ac" title="Gemiden satış araçlarının liman listesi"><ClipboardPaste size={14} /> Liman Listesi Yapıştır</button>
                      <button onClick={() => setAracForm(true)} className={dugme} style={{ borderColor: CARD_BORDER }} data-testid="gemi-arac-ac"><Truck size={14} /> Araç Ekle</button>
                    </>}
                    <button onClick={() => setGemiForm({ mevcut: gemi })} className={dugme} style={{ borderColor: CARD_BORDER }} title="Gemi bilgilerini düzenle" aria-label="Düzenle"><Pencil size={14} /></button>
                    {acik && <button onClick={() => setGemiIslem("beklet")} className={dugme} style={{ borderColor: CARD_BORDER }} title="Kantarda gizle, araç girişini durdur" data-testid="gemi-beklet"><PauseCircle size={14} /> Beklemeye Al</button>}
                    {acik && <button onClick={() => setGemiIslem("kapat")} className={dugme} style={{ borderColor: CARD_BORDER }}><CheckCircle2 size={14} /> Tahliyeyi Tamamla</button>}
                    {gemi.durum === "beklemede" && <button onClick={() => setGemiIslem("ac")} className={dugme} style={{ borderColor: CARD_BORDER }} data-testid="gemi-tahliyeye-ac"><PlayCircle size={14} /> Tahliyeye Aç</button>}
                    {gemi.durum === "tamamlandi" && <button onClick={() => setGemiIslem("ac")} className={dugme} style={{ borderColor: CARD_BORDER }}><RotateCcw size={14} /> Yeniden Aç</button>}
                    {!araclar.length && <button onClick={() => setGemiIslem("sil")} className={`${dugme} text-red-300`} style={{ borderColor: CARD_BORDER }} title="Aracı olmayan gemi silinebilir" aria-label="Sil"><Trash2 size={14} /></button>}
                  </div>
                </div>

                {/* Ozet */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
                  {kutu("Sipariş (B/L)", tonYazi(rapor.siparisKg), `${rapor.gelenArac} araç geldi`)}
                  {kutu("Gelen (liman)", tonYazi(rapor.gelenKg), `${yuzdeYazi(rapor.yuzde)}${rapor.limanBekleyenArac ? ` · ${rapor.limanBekleyenArac} araç kantar kg ile` : ""}`, "text-emerald-400", "gemi-gelen")}
                  {kutu(rapor.kalanKg >= 0 ? "Kalan" : "Fazla", tonYazi(Math.abs(rapor.kalanKg)), rapor.kalanAracTahmini !== null && rapor.kalanKg > 0 ? `≈ ${rapor.kalanAracTahmini} araç (ort. ${kgYazi(Math.round(rapor.aracOrtalamasi))})` : undefined, rapor.kalanKg >= 0 ? "text-white" : "text-sky-400")}
                  {kutu("UNEX · liman → teslim", `${tonYazi(rapor.unexTeslimliLimanKg)} → ${tonYazi(rapor.unexEslesmisTeslimKg)}`, `${rapor.yerler[0].arac} araç · fark ${kgYazi(rapor.unexFarkKg)}${rapor.limanBekleyenArac ? ` · ${rapor.limanBekleyenArac} liman fişi bekliyor (${tonYazi(rapor.limanBekleyenKg)})` : ""}${rapor.yoldaArac ? ` · ${rapor.yoldaArac} yolda (${tonYazi(rapor.yoldaKg)})` : ""}`, "text-white", "gemi-unex")}
                  {kutu("Fire (UNEX)", yuzdeYazi(rapor.firePct, 3), "(liman − teslim) / liman", rapor.firePct !== null && rapor.firePct > 0.5 ? "text-amber-400" : "text-white")}
                </div>
                <div className="h-2 rounded-full overflow-hidden mb-5" style={{ backgroundColor: "#1E2530" }} aria-label={`Tahliye ${yuzdeYazi(rapor.yuzde)}`}>
                  <div className="h-full" style={{ width: `${Math.min(100, rapor.yuzde)}%`, backgroundColor: ACCENT }} />
                </div>

                {acik && (
                  <div className="mb-4">
                    <GemiHizliGiris gemi={gemi} alicilar={alicilar} kaynak="ofis" kaydedildi={getir} testId="gemi-sayfa-hizli" />
                  </div>
                )}
                {acik && rapor.limanBekleyenArac > 0 && (
                  <section className="rounded-xl border mb-4 overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: "rgba(56,189,248,0.35)" }} aria-label="Liman fişi bekleyen araçlar">
                    <p className="px-4 pt-3 pb-1 text-xs font-bold text-sky-300">Liman fişi bekleyen {rapor.limanBekleyenArac} araç · kantar {tonYazi(rapor.limanBekleyenKg)}
                      <span className="font-normal ml-2" style={{ color: TEXT_MUTED }}>Liman Excel&apos;i yüklenince kendiliğinden eşleşir; birden çok yakın fiş varsa buradan seçin.</span></p>
                    <GemiLimanBekleyenListesi gemiId={gemi.id} yenileTetik={bekleyenTetik} degisti={getir} testId="gemi-liman-bekleyen" />
                  </section>
                )}
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
                  {/* Gidilen yerler / satislar */}
                  <section className="rounded-xl border overflow-hidden self-start" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} aria-labelledby="gemi-yerler">
                    <div className="flex items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
                      <h3 id="gemi-yerler" className="text-sm font-bold text-white flex items-center gap-2"><Users size={14} /> Gittiği Yer · Gemiden Satış</h3>
                      {acik && <button onClick={() => setSatisForm({ mevcut: null })} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold text-white hover:brightness-110" style={{ backgroundColor: ACCENT }} data-testid="gemi-satis-ekle"><Plus size={13} /> Satış Ekle</button>}
                    </div>
                    <table className="w-full text-left border-collapse text-sm">
                      <thead style={{ backgroundColor: ROW_HEADER_BG }}>
                        <tr>{["Yer", "Araç", "Liman", "Tonaj / Kalan", ""].map((b, i) => <th key={i} className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${i >= 1 && i <= 3 ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>)}</tr>
                      </thead>
                      <tbody>
                        {rapor.yerler.map((y) => {
                          const l = y.aliciId ? alicilar.find((x) => x.id === y.aliciId) : null;
                          const sec = (y.aliciId || "unex") === yer;
                          return (
                            <tr key={y.aliciId || "unex"} className={`border-t cursor-pointer ${sec ? "bg-emerald-500/[0.06]" : "hover:bg-white/[0.02]"}`} style={{ borderColor: CARD_BORDER }}
                              onClick={() => setYer(sec ? "tumu" : (y.aliciId || "unex"))} data-gemi-yer={y.ad}>
                              <td className="px-3 py-2 text-white font-semibold">{y.ad === UNEX_YER ? "UNEX GIDA (depo)" : y.ad}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-white">{y.arac}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-white">{kgYazi(y.limanKg)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-xs">
                                {y.hedefKg === null ? <span style={{ color: TEXT_MUTED }}>teslim {kgYazi(y.teslimKg)}</span> : (
                                  <>
                                    <span className="text-white">{tonYazi(y.hedefKg)}</span>
                                    <span className={`block ${y.kalanKg !== null && y.kalanKg < 0 ? "text-sky-400" : "text-amber-300"}`}>
                                      {y.kalanKg !== null && y.kalanKg < 0 ? `Fazla ${kgYazi(-y.kalanKg)}` : y.kalanKg === 0 ? "Tamam" : `Kalan ${kgYazi(y.kalanKg)}`}
                                    </span>
                                  </>
                                )}
                              </td>
                              <td className="px-2 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                {l && acik && <>
                                  <button onClick={() => setSatisForm({ mevcut: l })} className="p-1 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label={`${l.firma} düzenle`}><Pencil size={13} /></button>
                                  {y.arac === 0 && <button onClick={() => setSilinecekSatis(l)} className="p-1 rounded hover:bg-white/5 text-red-300" aria-label={`${l.firma} sil`}><Trash2 size={13} /></button>}
                                </>}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="border-t" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                          <td className="px-3 py-2 text-xs font-bold text-white">TOPLAM</td>
                          <td className="px-3 py-2 text-right tabular-nums font-bold text-white">{rapor.gelenArac}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-400">{kgYazi(rapor.gelenKg)}</td>
                          <td colSpan={2} />
                        </tr>
                      </tbody>
                    </table>
                    {rapor.gunler.length > 0 && (
                      <div className="border-t px-4 py-3" style={{ borderColor: CARD_BORDER }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: TEXT_MUTED }}>Gün bazında</p>
                        <div className="space-y-1">
                          {rapor.gunler.map((g) => (
                            <button key={g.tarih} onClick={() => setGunFiltre(gunFiltre === g.tarih ? "" : g.tarih)}
                              className={`w-full flex items-center justify-between text-xs px-2 py-1 rounded ${gunFiltre === g.tarih ? "bg-emerald-500/[0.08]" : "hover:bg-white/[0.03]"}`}>
                              <span className="text-white">{gunTR(g.tarih)}</span>
                              <span className="tabular-nums" style={{ color: TEXT_MUTED }}>{g.arac} araç · <span className="text-white">{kgYazi(g.limanKg)}</span></span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Araclar (rapor satirlari) */}
                  <section className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} aria-labelledby="gemi-araclar">
                    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
                      <h3 id="gemi-araclar" className="text-sm font-bold text-white mr-auto flex items-center gap-2"><Truck size={14} /> Araçlar <span className="font-normal text-xs" style={{ color: TEXT_MUTED }}>({gorunen.length}{gorunen.length !== araclar.length ? ` / ${araclar.length}` : ""})</span></h3>
                      <select value={yer} onChange={(e) => setYer(e.target.value)} className="px-2 py-1 rounded-md border text-xs text-white" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} aria-label="Gittiği yer">
                        <option value="tumu">Tüm yerler</option>
                        <option value="unex">UNEX</option>
                        {alicilar.map((l) => <option key={l.id} value={l.id}>{l.firma}</option>)}
                      </select>
                      <select value={gunFiltre} onChange={(e) => setGunFiltre(e.target.value)} className="px-2 py-1 rounded-md border text-xs text-white" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} aria-label="Gün">
                        <option value="">Tüm günler</option>
                        {gunler.map((g) => <option key={g} value={g}>{gunTR(g)}</option>)}
                      </select>
                    </div>
                    <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                      <table className="w-full text-left border-collapse text-sm" data-testid="gemi-arac-tablosu">
                        <thead className="sticky top-0 z-10" style={{ backgroundColor: ROW_HEADER_BG }}>
                          <tr>{["Tarih", "Plaka", "Liman", "Teslim", "Fark", "Gittiği Yer", ""].map((b, i) => <th key={i} className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${i >= 2 && i <= 4 ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>)}</tr>
                        </thead>
                        <tbody>
                          {gorunen.map((a) => {
                            const fark = a.alici_id ? null : aracFarki(a);
                            return (
                              <tr key={a.id} className="border-t hover:bg-white/[0.02]" style={{ borderColor: CARD_BORDER }}>
                                <td className="px-3 py-1.5 whitespace-nowrap text-white">{gunTR(a.tarih)}</td>
                                <td className="px-3 py-1.5 whitespace-nowrap font-semibold text-white">
                                  {a.plaka}
                                  {a.uyarilar?.length > 0 && <span title={a.uyarilar.join("\n")} className="ml-1 inline-flex align-middle text-amber-400"><AlertTriangle size={12} /></span>}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-white">{a.liman_kg !== null ? Number(a.liman_kg).toLocaleString("tr-TR") : <span className="text-[10px] text-sky-300" title="Liman Excel'i yüklenince eşleşir">fiş bekleniyor</span>}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-white whitespace-nowrap">
                                  {yoldaMi(a)
                                    ? (acik ? <ElleTeslim arac={a} yenile={getir} /> : <span className="text-amber-300 text-xs">yolda</span>)
                                    : a.teslim_kg !== null ? <>
                                        {Number(a.teslim_kg).toLocaleString("tr-TR")}
                                        {a.teslim_kaynak && <span className="ml-1 text-[10px]" style={{ color: TEXT_MUTED }} title={a.teslim_zamani ? tarihSaatYazi(a.teslim_zamani) : ""}>{a.teslim_kaynak === "kantar" ? "kantar" : "elle"}</span>}
                                      </> : <span style={{ color: TEXT_MUTED }}>—</span>}
                                </td>
                                <td className={`px-3 py-1.5 text-right tabular-nums ${fark === null ? "" : Math.abs(fark) > 300 ? "text-amber-400" : fark < 0 ? "text-white/80" : "text-white"}`}>{fark === null ? "" : fark.toLocaleString("tr-TR")}</td>
                                <td className="px-3 py-1.5 text-xs whitespace-nowrap" style={{ color: a.alici_id ? undefined : TEXT_MUTED }}>
                                  <span className={a.alici_id ? "text-white" : ""}>{yerAdi(a, alicilar)}</span>
                                  {yoldaMi(a) && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-amber-300"><Clock size={10} /> yolda</span>}
                                  <span className="ml-1.5 text-[10px]" style={{ color: TEXT_MUTED }} title={`${a.girilen_email || "otomatik"} · ${tarihSaatYazi(a.olusturma)}`}>{a.kaynak === "liman" ? "liman Excel" : a.kaynak === "ofis" ? "ofis" : a.kaynak === "otomatik" ? (a.esleme_onayli ? "kantar · fiş onaylı" : "kantar") : "kantar (elle)"}</span>
                                </td>
                                <td className="px-2 py-1.5 text-right">
                                  {acik && a.kaynak === "otomatik" && a.liman_kg !== null && <button onClick={() => setLimanKaldir(a)} className="p-1 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} title="Liman fişi bağlantısını kaldır (yanlış eşleşme)" aria-label={`${a.plaka} liman eşleşmesini kaldır`}><Unlink size={13} /></button>}
                                  {acik && a.kaynak !== "otomatik" && !a.alici_id && a.teslim_kg !== null && <button onClick={() => setEslesmeKaldir(a)} className="p-1 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} title="Teslim kg'ını kaldır (yanlış eşleşme)" aria-label={`${a.plaka} teslim kaldır`}><Unlink size={13} /></button>}
                                  {acik && <button onClick={() => setSilinecekArac(a)} className="p-1 rounded hover:bg-white/5 text-red-300/80" title={a.kaynak === "otomatik" ? "Gemiye ait değil: gemiden çıkar" : "Sil"} aria-label={`${a.plaka} sil`}><Trash2 size={13} /></button>}
                                </td>
                              </tr>
                            );
                          })}
                          {!gorunen.length && (
                            <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: TEXT_MUTED }}>{araclar.length ? "Filtreye uyan araç yok." : "Henüz araç girilmedi. Kantarcı Kantar Paneli › Yurt İçi › Gemi'den girer."}</td></tr>
                          )}
                        </tbody>
                        {gorunen.length > 0 && (
                          <tfoot>
                            <tr className="border-t" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                              <td colSpan={2} className="px-3 py-2 text-xs font-bold text-white">TOPLAM · {gorunen.length} araç</td>
                              <td className="px-3 py-2 text-right tabular-nums font-bold text-white">{gorunenToplam.liman.toLocaleString("tr-TR")}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-bold text-white">{gorunenToplam.teslim ? gorunenToplam.teslim.toLocaleString("tr-TR") : ""}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-bold text-white">{gorunenToplam.eslesmisSayi ? gorunenToplam.fark.toLocaleString("tr-TR") : ""}</td>
                              <td colSpan={2} />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </section>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {gemiForm && companyId && (
        <GemiFormu companyId={companyId} mevcut={gemiForm.mevcut} kapat={() => setGemiForm(null)} kaydedildi={(id) => { setGemiForm(null); if (id === seciliId) getir(); else setSeciliId(id); }} />
      )}
      {satisForm && gemi && companyId && (
        <SatisFormu companyId={companyId} gemi={gemi} mevcut={satisForm.mevcut} kapat={() => setSatisForm(null)} kaydedildi={() => { setSatisForm(null); getir(); }} />
      )}
      {aracForm && gemi && (
        <GemiAracFormu gemi={gemi} alicilar={alicilar} kaynak="ofis" varsayilanAlici={yer !== "tumu" && yer !== "unex" ? yer : ""} kapat={() => setAracForm(false)} kaydedildi={() => { setAracForm(false); getir(); }} />
      )}
      {listeAcik && gemi && (
        <LimanListesiPenceresi gemi={gemi} alicilar={alicilar} kapat={() => setListeAcik(false)} kaydedildi={() => { setListeAcik(false); getir(); }} />
      )}
      <ConfirmDialog open={!!silinecekArac} onOpenChange={(o) => { if (!o) setSilinecekArac(null); }}
        title={silinecekArac?.kaynak === "otomatik" ? "Araç gemiden çıkarılsın mı?" : "Araç kaydı silinsin mi?"}
        description={silinecekArac ? (silinecekArac.kaynak === "otomatik"
          ? `${gunTR(silinecekArac.tarih)} · ${silinecekArac.plaka} · kantar ${kgYazi(silinecekArac.teslim_kg)}. Bu kantar tartımı "gemiye ait değil" olarak işaretlenir, bir daha otomatik eklenmez. Kopyası denetim kaydında kalır.`
          : `${gunTR(silinecekArac.tarih)} · ${silinecekArac.plaka} · liman ${kgYazi(silinecekArac.liman_kg)}. Silinen kaydın kopyası denetim kaydında kalır.`) : ""}
        confirmLabel="Sil" destructive loading={isleniyor} onConfirm={aracSil} />
      <ConfirmDialog open={!!limanKaldir} onOpenChange={(o) => { if (!o) setLimanKaldir(null); }}
        title="Liman fişi bağlantısı kaldırılsın mı?" description={limanKaldir ? `${limanKaldir.plaka} · liman ${kgYazi(limanKaldir.liman_kg)} → teslim ${kgYazi(limanKaldir.teslim_kg)}. Araç "liman fişi bekleyen" olur; otomatik eşleştirme bu araca bir daha bakmaz, doğru fişi listeden siz seçersiniz.` : ""}
        confirmLabel="Kaldır" loading={isleniyor} onConfirm={limanKaldirUygula} />
      <ConfirmDialog open={!!eslesmeKaldir} onOpenChange={(o) => { if (!o) setEslesmeKaldir(null); }}
        title="Teslim kg kaldırılsın mı?" description={eslesmeKaldir ? `${eslesmeKaldir.plaka} · teslim ${kgYazi(eslesmeKaldir.teslim_kg)}${eslesmeKaldir.teslim_kaynak === "kantar" ? " (kantar tartımı)" : ""}. Araç yeniden yolda görünür; bu araç kantarla bir daha otomatik eşleşmez, doğru kg elle girilir.` : ""}
        confirmLabel="Kaldır" loading={isleniyor} onConfirm={eslesmeKaldirUygula} />
      <ConfirmDialog open={!!silinecekSatis} onOpenChange={(o) => { if (!o) setSilinecekSatis(null); }}
        title="Satış silinsin mi?" description={silinecekSatis ? `${silinecekSatis.firma} · ${tonYazi(silinecekSatis.miktar_kg)}. Aracı olmayan satış silinebilir.` : ""}
        confirmLabel="Sil" destructive loading={isleniyor} onConfirm={satisSil} />
      <ConfirmDialog open={!!gemiIslem} onOpenChange={(o) => { if (!o) setGemiIslem(null); }}
        title={gemiIslem === "sil" ? "Gemi silinsin mi?" : gemiIslem === "kapat" ? "Tahliye tamamlansın mı?" : gemiIslem === "beklet" ? "Gemi beklemeye alınsın mı?" : "Tahliyeye açılsın mı?"}
        description={gemi ? (gemiIslem === "kapat"
          ? `${gemi.gemi_adi}: ${tonYazi(rapor?.gelenKg ?? 0)} / ${tonYazi(gemi.bl_kg)} (${yuzdeYazi(rapor?.yuzde ?? 0)}). Tamamlanınca araç girilemez; rapor ve Excel kalır.`
          : gemiIslem === "sil" ? `${gemi.gemi_adi} ve satış kayıtları silinir (araç kaydı yok).`
          : gemiIslem === "beklet" ? `${gemi.gemi_adi} Kantar Paneli'nden kalkar, araç girilemez. Girilmiş kayıtlar durur.`
          : `${gemi.gemi_adi} Kantar Paneli'nde görünür, araç girilebilir.`) : ""}
        confirmLabel={gemiIslem === "sil" ? "Sil" : gemiIslem === "kapat" ? "Tamamla" : gemiIslem === "beklet" ? "Beklemeye Al" : "Aç"} destructive={gemiIslem === "sil"} loading={isleniyor} onConfirm={gemiIslemUygula} />
    </AppShell>
  );
}

/** Yoldaki UNEX aracina teslim kg (kantar eslesmediyse): yaz + Enter */
function ElleTeslim({ arac, yenile }: { arac: GemiArac; yenile: () => void }) {
  const { showToast } = useToast();
  const [deger, setDeger] = useState("");
  const [mesgul, setMesgul] = useState(false);
  const gonder = async () => {
    const kg = trSayiOku(deger);
    if (!kg || kg < 1000 || kg > 60000) { showToast("Teslim kg 1.000 - 60.000 arasında olmalı.", "error"); return; }
    setMesgul(true);
    const { error } = await supabase.rpc("ic_gemi_teslim_gir", { p_id: arac.id, p_teslim: kg });
    setMesgul(false);
    if (error) { showToast(gemiHataMesaji(error), "error"); return; }
    setDeger("");
    yenile();
  };
  return (
    <span className="inline-flex items-center gap-1 justify-end">
      {mesgul ? <Loader2 size={11} className="animate-spin" style={{ color: TEXT_MUTED }} /> : <span className="text-[10px] text-amber-300">yolda</span>}
      <input value={deger} onChange={(e) => setDeger(e.target.value.replace(/[^0-9.,]/g, ""))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); gonder(); } }}
        placeholder="elle" inputMode="numeric" className="w-20 px-1.5 py-0.5 rounded border text-xs text-white text-right tabular-nums bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/40" style={{ borderColor: CARD_BORDER }} aria-label={`${arac.plaka} teslim kg`} />
    </span>
  );
}
