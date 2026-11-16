"use client";

import React, { useEffect, useState, useMemo, Suspense, useCallback, useRef } from "react";
import Link from "next/link";
import { useGecisliYonlendirme } from "@/components/sayfa-gecisi";
import { useAuth } from "@/lib/auth-context";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils";
import { supabase, Dosya, Rezervasyon, Konteyner, DOSYA_LISTE_KOLONLARI, dosyaninStorageUrlleriniTopla, depoDosyalariniTopluSil, yazmaHatasi } from "@/lib/supabase";
import { useSearchParams, useRouter } from "next/navigation";
import { formatDateTR, talimatCutoffTamamMi, beyannameCutoffTamamMi } from "@/lib/cutoff-utils";
import { CutoffSayac } from "@/components/cutoff-sayac";
import { CokluNoKisa } from "@/components/coklu-no-girisi";
import { BildirimIzniButonu } from "@/components/cutoff-uyarilari";
import { useToast } from "@/lib/toast-context";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import AppShell from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Trash2, ExternalLink, FolderX, FileText, FolderOpen, CheckCircle2, CircleDashed, ChevronDown, ChevronRight, FileCheck2 } from "lucide-react";
import { CutoffCubugu } from "@/components/panel/cutoff-cubugu";
import { cutoffUyarilari, dosyaEslesir, EVRAK_KISA, PANEL_FILTRELERI, panelFiltrele, panelFiltresi, type PanelFiltre } from "@/lib/panel-gorunum";
import { PanelOzetKartlari } from "@/components/panel-ozet-kartlari";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, PAGE_BG, ROW_HEADER_BG } from "@/lib/theme";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";

type FaturaParcasi = { sira: number; fatura_dosya_url: string | null };
type DosyaWithRelations = Dosya & { rezervasyonlar: Rezervasyon[]; konteynerler: Konteyner[]; faturaParcalari: FaturaParcasi[] };

/**
 * Evrak durumu (05.11.2026, kullanici: "hangi evraklar eksik ana panelde gorebilmeliyim";
 * sira: konsimento talimati - fatura - draft BL - beyanname). Yuklenen evrak tiklaninca acilir.
 * DIIB'e bolunmus yuklemede fatura "1/2" gibi parca sayisiyla (diib_dosya_bolunmeleri).
 */
function evrakDurumlari(d: DosyaWithRelations) {
  const parca = d.faturaParcalari.length >= 2 ? d.faturaParcalari : null;
  const faturaYuklu = parca ? parca.filter((p) => !!p.fatura_dosya_url).length : d.fatura_dosya_url ? 1 : 0;
  const faturaToplam = parca ? parca.length : 1;
  return [
    // durum: tamamlandiginda kullanilan fiil (panel cut-off rozetleriyle ayni dil: "Talimat gönderildi", "Draft BL alındı")
    { ad: "Konşimento Talimatı", durum: "gönderildi", url: d.konsimento_dosya_url, tamam: !!d.konsimento_dosya_url, ek: null as string | null },
    { ad: "Fatura", durum: "kesildi", url: d.fatura_dosya_url || parca?.find((p) => p.fatura_dosya_url)?.fatura_dosya_url || null, tamam: faturaYuklu >= faturaToplam, ek: parca ? `${faturaYuklu}/${faturaToplam}` : null },
    { ad: "Draft BL", durum: "alındı", url: d.draft_bl_dosya_url, tamam: !!d.draft_bl_dosya_url, ek: null },
    { ad: "Beyanname", durum: "gönderildi", url: d.beyanname_dosya_url, tamam: !!d.beyanname_dosya_url, ek: null },
  ];
}

function EvrakDurumu({ dosya }: { dosya: DosyaWithRelations }) {
  // 06.11.2026 (kullanici: "Evraklar kismi ve evraklar daha on planda olmali"): durum satirinin
  // EN USTUNDE, daha buyuk rozetler + "n/4" sayaci; tamamlanan rozet "Beyanname gönderildi" gibi okunur.
  const evraklar = evrakDurumlari(dosya);
  const tamam = evraklar.filter((e) => e.tamam).length;
  const hepsi = tamam === evraklar.length;
  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="evrak-durumu">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider mr-1 text-white">
        <FileText size={13} style={{ color: ACCENT }} /> Evraklar
        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums" data-testid="evrak-sayac"
          style={hepsi ? { backgroundColor: "rgba(16,185,129,0.15)", color: "#6EE7B7" } : { backgroundColor: "rgba(245,158,11,0.15)", color: "#FCD34D" }}>
          {tamam}/{evraklar.length}
        </span>
      </span>
      {evraklar.map((e) => {
        const metin = e.tamam ? `${e.ad} ${e.durum}` : e.ek ? `${e.ad} ${e.ek}` : e.ad;
        const ic = (
          <>
            {e.tamam ? <CheckCircle2 size={13} /> : <CircleDashed size={13} className="evrak-bekliyor-ikon" data-bekliyor aria-hidden="true" />}
            {metin}
          </>
        );
        const sinif = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border";
        return e.url ? (
          <a key={e.ad} href={e.url} target="_blank" rel="noopener noreferrer" data-evrak={e.ad} data-tamam={e.tamam ? "evet" : "hayir"}
            title={e.tamam ? `${e.ad} ${e.durum} - belgeyi aç` : `${e.ad}: ${e.ek} - yüklenen belgeyi aç`}
            className={`${sinif} hover:opacity-90 transition-opacity`}
            style={e.tamam ? { borderColor: "rgba(16,185,129,0.45)", backgroundColor: "rgba(16,185,129,0.12)", color: "#6EE7B7" } : { borderColor: "rgba(245,158,11,0.45)", backgroundColor: "rgba(245,158,11,0.12)", color: "#FCD34D" }}>
            {ic}
          </a>
        ) : (
          <span key={e.ad} data-evrak={e.ad} data-tamam="hayir" title={`${e.ad} henüz yüklenmedi`} className={sinif}
            style={{ borderColor: "#3A4253", borderStyle: "dashed", color: "#9AA3B5" }}>
            {ic}
          </span>
        );
      })}
    </div>
  );
}

/**
 * 16.11.2026 gece (kullanici: kompakt satir): tabloda sayac + KT · FT · BL · BY rozetleri. Tamamlanan yesil (belge acilir),
 * yuklenmis ama eksik (bolunmus faturada 1/2) amber, hic yok soluk. Uzerine gelince tam ad ve durum.
 */
function EvrakRozetleri({ dosya }: { dosya: DosyaWithRelations }) {
  const evraklar = evrakDurumlari(dosya);
  const tamam = evraklar.filter((e) => e.tamam).length;
  const hepsi = tamam === evraklar.length;
  return (
    <div className="flex items-center gap-1" data-testid="evrak-durumu">
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums mr-0.5" data-testid="evrak-sayac"
        style={hepsi ? { backgroundColor: "rgba(16,185,129,0.15)", color: "#6EE7B7" } : { backgroundColor: "rgba(245,158,11,0.15)", color: "#FCD34D" }}>
        {tamam}/{evraklar.length}
      </span>
      {evraklar.map((e) => {
        const kisa = EVRAK_KISA[e.ad] || e.ad;
        const baslik = e.tamam ? `${e.ad} ${e.durum} - belgeyi aç` : e.url ? `${e.ad}: ${e.ek} - yüklenen belgeyi aç` : `${e.ad} eksik`;
        const sinif = "inline-flex items-center justify-center w-7 h-5 rounded text-[10px] font-bold border";
        const stil: React.CSSProperties = e.tamam
          ? { borderColor: "rgba(16,185,129,0.45)", backgroundColor: "rgba(16,185,129,0.12)", color: "#6EE7B7" }
          : e.url ? { borderColor: "rgba(245,158,11,0.45)", backgroundColor: "rgba(245,158,11,0.12)", color: "#FCD34D" }
          : { borderColor: "#3A4253", borderStyle: "dashed", color: "#6B7487" };
        return e.url ? (
          <a key={e.ad} href={e.url} target="_blank" rel="noopener noreferrer" title={baslik} aria-label={baslik} data-evrak={e.ad} data-tamam={e.tamam ? "evet" : "hayir"}
            className={`${sinif} hover:opacity-90`} style={stil} onClick={(ev) => ev.stopPropagation()}>{kisa}</a>
        ) : (
          <span key={e.ad} title={baslik} aria-label={baslik} data-evrak={e.ad} data-tamam="hayir" className={sinif} style={stil}>{kisa}</span>
        );
      })}
    </div>
  );
}

// 28.10.2026: eski Kontrol Merkezi kaldirildi; 4 ozet karti buraya tasindi
// (components/panel-ozet-kartlari.tsx). Kontrol Merkezi gibi sayfa gorunurken
// dakikada bir + sekmeye donulunce kendiliginden yenilenir.
const YENILEME_MS = 60_000;


function PanelContent() {
  const { user, yetkiler, companyId, loading: authLoading } = useAuth(); // Global context'ten companyId alındı
  const searchParams = useSearchParams();
  const router = useRouter();
  const gecisliGit = useGecisliYonlendirme(); // 06.11.2026: logolu sayfa gecisi
  const { showToast } = useToast();
  // 16.11.2026: ?filtre= (eski ?filter= baglantilari da) + ?dosya= (satir vurgusu; Kontrol Merkezi / cut-off cubugu)
  const [dosyalar, setDosyalar] = useState<DosyaWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilterDurumu] = useState<PanelFiltre>(() => panelFiltresi(searchParams.get("filtre"), searchParams.get("filter")));
  const [vurgu, setVurgu] = useState<string | null>(() => searchParams.get("dosya"));
  const [acikDetay, setAcikDetay] = useState<Set<string>>(new Set());
  const vurguKaydirildi = useRef<string | null>(null);
  const adresGuncelle = useCallback((degis: Record<string, string | null>) => {
    try {
      const u = new URL(window.location.href);
      for (const [k, v] of Object.entries(degis)) { if (v === null) u.searchParams.delete(k); else u.searchParams.set(k, v); }
      u.searchParams.delete("filter");
      window.history.replaceState(window.history.state, "", u.toString());
    } catch { /* yok */ }
  }, []);
  const setActiveFilter = useCallback((f: PanelFiltre) => {
    setActiveFilterDurumu(f);
    adresGuncelle({ filtre: f === "tumu" ? null : f });
  }, [adresGuncelle]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; dosyaNo: string } | null>(null);
  const [yenileme, setYenileme] = useState(0);

  const fetchDosyalar = useCallback(async () => {
    if (!user?.id || !companyId) return; // companyId kontrolü eklendi
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari")
      .select(DOSYA_LISTE_KOLONLARI)
      .eq("company_id", companyId) // Sadece giriş yapan şirketin dosyaları çekilir
      .or("durum.eq.Açık,durum.eq.Acik")
      .order("olusturma_tarihi", { ascending: false })
      .returns<Dosya[]>();

    if (!dosyaData) { setDosyalar([]); setLoading(false); return; }

    const dosyaIds = dosyaData.map((d: Dosya) => d.id);
    const [rezRes, kontRes, parcaRes] = await Promise.all([
      supabase.from("rezervasyonlar").select("*").in("dosya_id", dosyaIds).eq("company_id", companyId), // Şirket filtresi eklendi
      supabase.from("konteynerler").select("*").in("dosya_id", dosyaIds).eq("company_id", companyId), // Şirket filtresi eklendi
      // DIIB'e bolunmus yuklemelerin parca faturalari (yetki yoksa / hata -> bos: tek fatura sayilir)
      supabase.from("diib_dosya_bolunmeleri").select("dosya_id, sira, fatura_dosya_url").in("dosya_id", dosyaIds).eq("company_id", companyId),
    ]);
    const parcaMap: Record<string, FaturaParcasi[]> = {};
    if (!parcaRes.error) ((parcaRes.data || []) as (FaturaParcasi & { dosya_id: string })[]).forEach((p) => {
      (parcaMap[p.dosya_id] ||= []).push({ sira: p.sira, fatura_dosya_url: p.fatura_dosya_url });
    });

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
      faturaParcalari: (parcaMap[d.id] || []).sort((a, b) => a.sira - b.sira),
    }));
    setDosyalar(enriched);
    setYenileme((n) => n + 1);
    setLoading(false);
  }, [user?.id, companyId]);

  useEffect(() => { fetchDosyalar(); }, [fetchDosyalar]);

  useEffect(() => {
    const yenile = () => { if (document.visibilityState === "visible") fetchDosyalar(); };
    const zamanlayici = window.setInterval(yenile, YENILEME_MS);
    document.addEventListener("visibilitychange", yenile);
    return () => { window.clearInterval(zamanlayici); document.removeEventListener("visibilitychange", yenile); };
  }, [fetchDosyalar]);

  useEffect(() => {
    // Yetkiler veritabanindan gelmeden karar verilmez: yuklenirken tum yetkiler
    // gecici olarak kapali gorunur ve tam yetkili kullanici bile sayfayi
    // yenileyince baska sayfaya atiliyordu (duzeltme: 01.10.2026). Hic sayfa
    // yetkisi yoksa yonlendirme yapilmaz - AppShell "Erisim yetkiniz yok"
    // ekranini gosterir (bkz. lib/yetki-utils.ts).
    if (authLoading) return;
    if (!yetkiler.sayfa_yetkileri.panel) {
      const hedef = ilkErisilebilirSayfa(yetkiler.sayfa_yetkileri);
      if (hedef) router.replace(hedef);
    }
  }, [authLoading, yetkiler, router]);

  const handleDelete = async () => {
    if (!deleteTarget || !companyId) return;
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari").select("ana_siparis_id").eq("id", deleteTarget.id).eq("company_id", companyId).maybeSingle(); // Şirket filtresi eklendi
    const anaSiparisId = dosyaData?.ana_siparis_id;
    // SIRA ONEMLI (01.10.2026): once dosya URL'leri toplanir (kayit silinince
    // bagli konteyner/evrak satirlari CASCADE ile gider), sonra kayit silinir;
    // PDF'ler ancak kayit GERCEKTEN silindiyse storage'dan temizlenir.
    const storageUrlleri = await dosyaninStorageUrlleriniTopla(deleteTarget.id, companyId);
    const { data: silinen, error } = await supabase.from("ihracat_dosyalari").delete().eq("id", deleteTarget.id).eq("company_id", companyId).select("id"); // Şirket filtresi eklendi
    const silmeHatasi = yazmaHatasi(error, silinen);
    if (silmeHatasi) { showToast(`Dosya silinemedi: ${silmeHatasi}`, "error"); setDeleteTarget(null); return; }
    await depoDosyalariniTopluSil(storageUrlleri);
    if (anaSiparisId) {
      const { count, error: sayimHatasi } = await supabase.from("ihracat_dosyalari").select("id", { count: "exact", head: true }).eq("ana_siparis_id", anaSiparisId).eq("company_id", companyId); // Şirket filtresi eklendi
      // Sayim okunamadiysa (count=null) bos sanilip silinmez (01.10.2026)
      if (!sayimHatasi && count === 0) await supabase.from("ana_siparisler").delete().eq("id", anaSiparisId).eq("company_id", companyId); // Şirket filtresi eklendi
    }
    showToast(`${deleteTarget.dosyaNo} başarıyla silindi.`, "success");
    fetchDosyalar();
    setDeleteTarget(null);
  };

  const filteredDosyalar = useMemo(() => panelFiltrele(dosyalar, activeFilter), [dosyalar, activeFilter]);
  const uyarilar = useMemo(() => cutoffUyarilari(dosyalar), [dosyalar]);
  const pazarYetkisi = !!yetkiler.sayfa_yetkileri.pazar;

  // ?dosya= / cut-off cubugu: satir bulunur, filtre gizliyorsa "Tumu"ye donulur, satira kaydirilir ve vurgulanir.
  // Acik dosyalarda yoksa (kapali dosya) ve deger dosya kimligiyse eskisi gibi dosya sayfasina gidilir.
  const vurguDosyasi = useMemo(() => (vurgu ? dosyalar.find((d) => dosyaEslesir(d, vurgu)) || null : null), [dosyalar, vurgu]);
  useEffect(() => {
    if (loading || !vurgu) return;
    if (!vurguDosyasi) {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vurgu)) { gecisliGit(`/dosya/${vurgu}`); return; }
      if (vurguKaydirildi.current !== vurgu) { vurguKaydirildi.current = vurgu; showToast(`${vurgu} açık dosyalar arasında bulunamadı.`, "error"); }
      return;
    }
    // Bir kez: kaydirildiktan sonra kullanici baska filtre secerse filtre geri cevrilmez
    if (vurguKaydirildi.current === vurguDosyasi.id) return;
    if (!filteredDosyalar.some((d) => d.id === vurguDosyasi.id)) { setActiveFilter("tumu"); return; }
    vurguKaydirildi.current = vurguDosyasi.id;
    window.setTimeout(() => document.getElementById(`dosya-satir-${vurguDosyasi.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }, [loading, vurgu, vurguDosyasi, filteredDosyalar, setActiveFilter, gecisliGit, showToast]);
  const dosyayaGit = useCallback((dosyaId: string) => {
    vurguKaydirildi.current = null;
    setVurgu(dosyaId);
    const d = dosyalar.find((x) => x.id === dosyaId);
    adresGuncelle({ dosya: d ? (d.proforma_no ? d.proforma_no.split("/")[0].trim() : d.dosya_no) : dosyaId });
  }, [dosyalar, adresGuncelle]);
  const detayDegistir = (id: string) => setAcikDetay((s) => { const y = new Set(s); if (y.has(id)) y.delete(id); else y.add(id); return y; });

  return (
    <AppShell>
      <SayfaBasligi
        ikon={<FolderOpen size={20} />}
        baslik="Ana Panel"
        aciklama={`${filteredDosyalar.length} açık dosya`}
        sag={<BildirimIzniButonu />}
      />

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

      {!loading && <PanelOzetKartlari dosyalar={dosyalar} companyId={companyId} yenileme={yenileme} />}

      {/* 16.11.2026: standart uyari cubugu (yoksa gizli) + filtre cubugu (adreste ?filtre=) */}
      {!loading && <CutoffCubugu uyarilar={uyarilar} onDosya={dosyayaGit} />}
      {!loading && (
        <div className="flex w-full sm:w-auto sm:inline-flex max-w-full overflow-x-auto rounded-lg border p-0.5 mb-4" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} role="tablist" data-testid="panel-filtreler">
          {PANEL_FILTRELERI.map((f) => (
            <button key={f.key} type="button" role="tab" aria-selected={activeFilter === f.key} onClick={() => setActiveFilter(f.key)} data-filtre={f.key}
              className="inline-flex shrink-0 items-center gap-1.5 h-9 px-3 sm:px-4 rounded-md text-sm font-medium whitespace-nowrap transition-colors"
              style={activeFilter === f.key ? { backgroundColor: "rgba(16,185,129,0.16)", color: "#FFFFFF" } : { color: TEXT_MUTED }}>
              {f.label}
              <span className="text-[11px] tabular-nums" style={{ color: activeFilter === f.key ? "#6EE7B7" : TEXT_MUTED }}>{panelFiltrele(dosyalar, f.key).length}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <SayfaYukleniyor boyut={24} />
      ) : filteredDosyalar.length === 0 ? (
        <EmptyState icon={<FolderX size={48} />} title="Dosya bulunamadı" description="Filtre kriterlerinizi değiştirin veya yeni dosya açın" />
      ) : (
        <div className="rounded-xl border overflow-hidden animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Proforma No</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Müşteri</th>
                <th lang="en" className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Booking No</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Gemi Kalkış</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Konteyner</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Talimat C/O</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Beyanname C/O</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }} title="KT Konşimento Talimatı · FT Fatura · BL Draft BL · BY Beyanname">Evraklar</th>
                <th className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filteredDosyalar.map((dosya, idx) => {
                const staggerClass = `animate-fade-up stagger-${Math.min(idx + 1, 8)}`;
                const latestRez = dosya.rezervasyonlar[0] || null;
                const hasRez = !!latestRez;
                const konteynerAdedi = dosya.rezervasyonlar.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
                const eklenenKont = dosya.konteynerler.length;
                const dbaTamamlanan = dosya.konteynerler.filter((k) => !!k.dba_dosya_url).length;

                const akisAdimlari = [
                  { label: "Rezervasyon", done: dosya.rezervasyonlar.length > 0 },
                  { label: "Konteynerler", done: konteynerAdedi > 0 && eklenenKont >= konteynerAdedi },
                  { label: "Fatura Kesildi", done: !!dosya.fatura_no },
                  // DBA rozeti artik sayisal - kac konteynerin doldugunu ("dolu")
                  // eklenen konteyner sayisina oranla gosterir (talep: 26.09.2026).
                  { label: eklenenKont > 0 ? `DBA ${dbaTamamlanan}/${eklenenKont}` : "DBA", done: dbaTamamlanan > 0 && dbaTamamlanan >= eklenenKont },
                  { label: "VGM", done: dosya.konteynerler.some((k) => !!k.vgm_kg) },
                ];

                const vurgulu = vurguDosyasi?.id === dosya.id;
                const detayAcik = acikDetay.has(dosya.id);

                return (
                  <React.Fragment key={dosya.id}>
                    {/* Ana satır (16.11.2026: tek satir; adimlar / mal cinsi / tam evrak rozetleri ▾ detay satirinda) */}
                    <tr id={`dosya-satir-${dosya.id}`} data-vurgu={vurgulu ? "evet" : undefined}
                      className={`border-b hover:bg-white/[0.03] transition-colors ${staggerClass}`}
                      style={{ borderColor: CARD_BORDER, ...(vurgulu ? { backgroundColor: "rgba(16,185,129,0.08)", boxShadow: `inset 3px 0 0 ${ACCENT}` } : {}) }}>
                      <td className="px-3 py-3 align-top">
                        <CokluNoKisa deger={dosya.proforma_no || dosya.dosya_no} className="text-xs font-semibold whitespace-nowrap" style={{ color: ACCENT }} />
                      </td>
                      <td className="px-3 py-3 align-top max-w-[220px]">
                        {pazarYetkisi && dosya.alici_firma ? (
                          <Link href={`/pazar?musteri=${encodeURIComponent(dosya.alici_firma)}`} title="Pazar'da müşteri kartını aç" className="block text-xs font-medium text-white truncate hover:underline decoration-white/40" data-musteri-link>
                            {dosya.alici_firma}
                          </Link>
                        ) : (
                          <p className="text-xs font-medium text-white truncate">{dosya.alici_firma || "—"}</p>
                        )}
                        <p className="text-[10px] truncate" style={{ color: TEXT_MUTED }}>{dosya.varis_limani || ""}</p>
                      </td>
                      {!hasRez ? (
                        <td className="px-3 py-3 align-top" colSpan={5}>
                          <span className="text-xs font-medium text-amber-500 animate-pulse whitespace-nowrap">Henüz rezervasyon alınmadı</span>
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-3 align-top"><span className="text-xs font-mono whitespace-nowrap" style={{ color: TEXT_MUTED }}>{latestRez!.booking_no}</span></td>
                          <td className="px-3 py-3 align-top"><span className="text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{latestRez!.gemi_kalkis_tarihi ? formatDateTR(latestRez!.gemi_kalkis_tarihi) : "—"}</span></td>
                          <td className="px-3 py-3 align-top">
                            {konteynerAdedi > 0 ? (
                              <div>
                                <p className="text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{eklenenKont}/{konteynerAdedi} <span className="text-[10px]" style={{ color: "#4A5262" }}>alınan</span></p>
                                {/* Talep (26.09.2026): kac konteynerin DBA belgesi yuklenerek
                                    "dolu" olarak isaretlendigini de panelden gorebilmek icin
                                    eklendi - salt goruntuleme, hicbir veri degismiyor. */}
                                {eklenenKont > 0 && (
                                  <p className="text-[10px] whitespace-nowrap" style={{ color: dbaTamamlanan >= eklenenKont ? "#4ADE80" : TEXT_MUTED }}>{dbaTamamlanan}/{eklenenKont} dolu</p>
                                )}
                              </div>
                            ) : <span className="text-xs" style={{ color: TEXT_MUTED }}>—</span>}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {latestRez!.talimat_cutoff ? (
                              <CutoffSayac
                                deger={latestRez!.talimat_cutoff}
                                tamamEtiketi={dosya.konsimento_dosya_url ? "Talimat gönderildi" : talimatCutoffTamamMi(dosya) ? "Draft BL alındı" : null}
                                tamamHref={dosya.konsimento_dosya_url || dosya.draft_bl_dosya_url}
                                tamamAciklama={dosya.konsimento_dosya_url ? "Konşimento talimatı gönderildi - talimatı aç" : "Draft BL alındı - belgeyi aç"}
                              />
                            ) : <span className="text-xs" style={{ color: "#4A5262" }}>—</span>}
                          </td>
                          <td className="px-3 py-3 align-top">
                            {latestRez!.beyanname_cutoff ? (
                              <CutoffSayac
                                deger={latestRez!.beyanname_cutoff}
                                tamamEtiketi={beyannameCutoffTamamMi(dosya) ? "Beyanname gönderildi" : null}
                                tamamHref={dosya.beyanname_dosya_url}
                                tamamAciklama="Beyanname gönderildi - belgeyi aç"
                              />
                            ) : <span className="text-xs" style={{ color: "#4A5262" }}>—</span>}
                          </td>
                        </>
                      )}
                      <td className="px-3 py-3 align-top"><EvrakRozetleri dosya={dosya} /></td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" onClick={() => detayDegistir(dosya.id)} aria-expanded={detayAcik} title={detayAcik ? "Ayrıntıyı gizle" : "Ayrıntı: adımlar, evraklar, mal cinsi"}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:text-white" style={{ backgroundColor: CARD_BORDER, color: TEXT_MUTED }} data-detay-ac>
                            {detayAcik ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                          {/* Talep (26.09.2026): orijinal proforma PDF'ini hizli goruntuleme.
                              Sadece PDF storage'a kaydedilmis dosyalarda gorunur - bu ozellik
                              26.09.2026'da eklendi, oncesindeki dosyalarda PDF yok. */}
                          {dosya.proforma_dosya_url && (
                            <a
                              href={dosya.proforma_dosya_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Proformayı Görüntüle"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:opacity-90"
                              style={{ backgroundColor: CARD_BORDER, color: TEXT_MUTED }}
                            >
                              <FileText size={13} />
                            </a>
                          )}
                          <button type="button" onClick={() => gecisliGit(`/dosya/${dosya.id}?tab=evraklar`)} title="İhracat evrakları (dosyanın Evraklar sekmesi)"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:opacity-90" style={{ backgroundColor: CARD_BORDER, color: TEXT_MUTED }} data-evraklar-git>
                            <FileCheck2 size={13} />
                          </button>
                          <button
                            onClick={() => gecisliGit(`/dosya/${dosya.id}`)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-white transition-colors hover:opacity-90 whitespace-nowrap"
                            style={{ backgroundColor: ACCENT }}
                          >
                            <ExternalLink size={12} /> Detay
                          </button>
                          {yetkiler.sayfa_yetkileri.yeni_dosya && (
                            <button
                              onClick={() => setDeleteTarget({ id: dosya.id, dosyaNo: dosya.dosya_no })}
                              title="Sil"
                              className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Detay satiri (▾): tam evrak rozetleri + adimlar + mal cinsi / gemi */}
                    {detayAcik && <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }} data-detay-satiri>
                      <td colSpan={9} className="px-4 py-2.5">
                        <EvrakDurumu dosya={dosya} />
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          {akisAdimlari.map((adim) => (
                            <span
                              key={adim.label}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${adim.done ? "bg-green-500/10 text-green-400" : ""}`}
                              style={!adim.done ? { backgroundColor: CARD_BORDER, color: TEXT_MUTED } : undefined}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${adim.done ? "bg-green-500" : ""}`} style={!adim.done ? { backgroundColor: "#4A5262" } : undefined} />
                              {adim.label}
                            </span>
                          ))}
                          <span className="text-[10px] truncate max-w-full sm:max-w-[420px]" style={{ color: TEXT_MUTED }} title={dosya.urun_tanimi || undefined}>
                            {dosya.urun_tanimi || "—"} · {latestRez?.gemi_adi || "Gemi adı yok"}{dosya.rezervasyonlar.length > 1 ? ` · ${dosya.rezervasyonlar.length} rezervasyon` : ""}
                          </span>
                        </div>
                      </td>
                    </tr>}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}

export default function PanelPage() {
  return (
    <Suspense fallback={<SayfaYukleniyor className="min-h-screen flex items-center justify-center" style={{ backgroundColor: PAGE_BG }} />}>
      <PanelContent />
    </Suspense>
  );
}