"use client";

import React, { useEffect, useState, useMemo, Suspense, useCallback, useRef } from "react";
import Link from "next/link";
import { useGecisliYonlendirme } from "@/components/sayfa-gecisi";
import { useAuth } from "@/lib/auth-context";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils";
import { supabase, Dosya, Rezervasyon, Konteyner, DOSYA_LISTE_KOLONLARI, dosyaninStorageUrlleriniTopla, depoDosyalariniTopluSil, yazmaHatasi } from "@/lib/supabase";
import { useSearchParams, useRouter } from "next/navigation";
import { formatDateTR, talimatCutoffTamamMi, beyannameCutoffTamamMi, bugunTarihIstanbul, efektifTartimBilgisi } from "@/lib/cutoff-utils";
import { CokluNoKisa } from "@/components/coklu-no-girisi";
import { BildirimIzniButonu } from "@/components/cutoff-uyarilari";
import { useToast } from "@/lib/toast-context";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import AppShell from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Trash2, ExternalLink, FolderX, FileText, FolderOpen, CheckCircle2, CircleDashed, ChevronDown, ChevronRight, FileCheck2, Search, CalendarDays } from "lucide-react";
import { dosyaEslesir, EVRAK_KISA } from "@/lib/panel-gorunum";
import { kantarDosyaYolu } from "@/lib/kantar-gorunum";
import { adresiGuncelle } from "@/lib/url-durumu";
import { SekmeCubugu } from "@/components/erp/sekme-cubugu";
import { PanelOzetKartlari } from "@/components/panel-ozet-kartlari";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, PAGE_BG, ROW_HEADER_BG } from "@/lib/theme";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { filoDurumuOku, isEmirleriOku, odemeBekleyenleriOku, yuklemeGecmisiOku } from "@/lib/panel/veri";
import { filoPlaniKur, type FiloVerisi } from "@/lib/panel/filo-plani";
import { FiloBolumu } from "@/components/panel/filo-bolumu";
import { bookingIsi, dosyaIsi, haftalikYukleme, kapasiteHesapla, sabahKarsilastirmasi, yuklemePlaniKur, type Kapasite, type YuklemeIsi } from "@/lib/panel/gunluk-yukleme";
import { GunlukYuklemeKarti } from "@/components/panel/gunluk-yukleme-karti";
import type { IsEmriSatiri } from "@/lib/panel/is-emirleri";
import { yuklemeEvraklariTamam } from "@/lib/yukleme-evrak-tamam";
import { doluDurumu, isListesiKur, LISTE_FILTRELERI, listeAra, listeFiltresi, listeSayilari, filtreyeUyar, listeGruplari, kapaliGruplariOku, durumGrubu, type ListeFiltresi, type ListeGrubu, type OdemeBekleyen } from "@/lib/panel/is-listesi";
import { ListeGrupCercevesi } from "@/components/panel/liste-grup-cercevesi";
import { DoluGostergesi, DurumHucresi, durumKenari, IsEmriListeSatiri, OdemeListeSatiri, CutoffSatiri, HUCRE, HUCRE_TAM, HUCRE_EVRAK, LISTE_TABLO, LISTE_GOVDE, LISTE_BASLIK, LISTE_SATIR, LISTE_SUTUN_SAYISI, EVRAK_SAYAC_DAR, HUCRE_GENIS, HUCRE_ISLEM } from "@/components/panel/is-listesi-satirlari";

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
    // 19.11.2026 (kullanici): "Bir yuklemeye ait draft BL eklenmisse konsimento talimati gecilmis sayilmali."
    d.konsimento_dosya_url || !d.draft_bl_dosya_url
      ? { ad: "Konşimento Talimatı", durum: "gönderildi", url: d.konsimento_dosya_url, tamam: !!d.konsimento_dosya_url, ek: null as string | null }
      : { ad: "Konşimento Talimatı", durum: "geçildi (Draft BL)", url: d.draft_bl_dosya_url, tamam: true, ek: null as string | null },
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

/** Dar ekranda (Evraklar sutunu gizli) kisa evrak sayaci; tiklayinca dosyanin Evraklar sekmesi. */
function EvrakSayaci({ dosya, className }: { dosya: DosyaWithRelations; className?: string }) {
  const evraklar = evrakDurumlari(dosya);
  const tamam = evraklar.filter((e) => e.tamam).length;
  const hepsi = tamam === evraklar.length;
  return (
    <Link href={`/dosya/${dosya.id}?tab=evraklar`} title={evraklar.map((e) => `${e.ad}: ${e.tamam ? "tamam" : "eksik"}`).join(" · ")}
      className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums hover:opacity-90 ${className || ""}`}
      style={hepsi ? { backgroundColor: "rgba(16,185,129,0.15)", color: "#6EE7B7" } : { backgroundColor: "rgba(245,158,11,0.15)", color: "#FCD34D" }}>
      Evrak {tamam}/{evraklar.length}
    </Link>
  );
}

// 28.10.2026: eski Kontrol Merkezi kaldirildi; 4 ozet karti buraya tasindi
// (components/panel-ozet-kartlari.tsx). Kontrol Merkezi gibi sayfa gorunurken
// dakikada bir + sekmeye donulunce kendiliginden yenilenir.
const YENILEME_MS = 60_000;
// 22.11.2026 is emirleri (panel_is_emirleri ~1 sn): 5 dakikada bir + sekmeye donuldugunde
const IS_EMRI_YENILEME_MS = 5 * 60_000;


function PanelContent() {
  const { user, yetkiler, companyId, loading: authLoading } = useAuth(); // Global context'ten companyId alındı
  const searchParams = useSearchParams();
  const router = useRouter();
  const gecisliGit = useGecisliYonlendirme(); // 06.11.2026: logolu sayfa gecisi
  const { showToast } = useToast();
  // 16.11.2026: ?filtre= (eski ?filter= baglantilari da) + ?dosya= (satir vurgusu; Kontrol Merkezi / cut-off cubugu)
  const [dosyalar, setDosyalar] = useState<DosyaWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  // 23.11.2026 TEK IS LISTESI: filtre = durum (Tumu / Acik sevkiyat / Cut-off / Rezervasyon bekliyor / Odeme bekliyor)
  const [activeFilter, setActiveFilterDurumu] = useState<ListeFiltresi>(() => listeFiltresi(searchParams.get("filtre"), searchParams.get("filter")));
  const [arama, setArama] = useState("");
  // ?dosya= satir vurgusu (Kontrol Merkezi, Kantar, Siparis Listesi baglantilari). 23.11.2026: cut-off cubugu kalkti
  const [vurgu] = useState<string | null>(() => searchParams.get("dosya"));
  const [acikDetay, setAcikDetay] = useState<Set<string>>(new Set());
  const vurguKaydirildi = useRef<string | null>(null);
  // Eski ?filter= her guncellemede silinir - ERP ortak kit (lib/url-durumu.ts)
  const adresGuncelle = useCallback((degis: Record<string, string | null>) => adresiGuncelle(degis, ["filter"]), []);
  const setActiveFilter = useCallback((f: ListeFiltresi) => {
    setActiveFilterDurumu(f);
    adresGuncelle({ filtre: f === "tumu" ? null : f });
  }, [adresGuncelle]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; dosyaNo: string } | null>(null);
  const [yenileme, setYenileme] = useState(0);
  // 22.11.2026 (kullanici): "On odemesi alinmis proformalar ana panelde gozukmeli; rezervasyonu belliyse rezervasyonlu
  // olarak. Mevcut is emrine hemen ulasabilelim, proforma aramayalim." -> dosyasi acilmamis is emirleri (ust serit).
  // Dosya tablosunu beklemez; okunamazsa serit gizli kalir.
  const [isEmirleri, setIsEmirleri] = useState<{ rezervasyonlu: IsEmriSatiri[]; onOdeme: IsEmriSatiri[] } | null>(null);
  // 23.11.2026: odeme bekleyen siparisler (gri satirlar; panel_odeme_bekleyenleri) - is emirleriyle paralel okunur
  const [odemeler, setOdemeler] = useState<OdemeBekleyen[] | null>(null);
  // 23.11.2026 gunluk yukleme hedefi: kapasite / is gunleri gecmis tartim gunlerinden (lib/panel/gunluk-yukleme.ts)
  const [kapasite, setKapasite] = useState<Kapasite | null>(null);
  const [yuklemeGunleri, setYuklemeGunleri] = useState<string[]>([]);
  // 23.11.2026 aksam: filo ve bugday denklemi (panel_filo_durumu; okunamazsa / yetki yoksa bolum gizli)
  const [filoVerisi, setFiloVerisi] = useState<FiloVerisi | null>(null);
  const isEmirleriniGetir = useCallback(async () => {
    if (!user?.id || !companyId) return;
    // Biri okunamazsa (yetki / ag) digeri yine gelir; okunamayan grup listede gorunmez, dosyalar etkilenmez
    const [ie, od, gc, fl] = await Promise.allSettled([isEmirleriOku(), odemeBekleyenleriOku(), yuklemeGecmisiOku(companyId), filoDurumuOku()]);
    if (ie.status === "fulfilled") setIsEmirleri(ie.value);
    if (od.status === "fulfilled") setOdemeler(od.value);
    if (gc.status === "fulfilled") { setKapasite(kapasiteHesapla(gc.value)); setYuklemeGunleri(gc.value); }
    if (fl.status === "fulfilled") setFiloVerisi(fl.value);
  }, [user?.id, companyId]);
  useEffect(() => {
    isEmirleriniGetir();
    const yenile = () => { if (document.visibilityState === "visible") isEmirleriniGetir(); };
    const zamanlayici = window.setInterval(yenile, IS_EMRI_YENILEME_MS);
    document.addEventListener("visibilitychange", yenile);
    return () => { window.clearInterval(zamanlayici); document.removeEventListener("visibilitychange", yenile); };
  }, [isEmirleriniGetir]);

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

  // 23.11.2026 TEK IS LISTESI (lib/panel/is-listesi.ts): acik dosyalar + dosyasi acilmamis is emirleri + odeme bekleyenler;
  // durum ve renk kayitlardan otomatik, siralama cut-off > acik > rezervasyon bekliyor > odeme bekliyor.
  // 25.11.2026 (kullanici): yuklemesi tamamlanan is (KT · FT · BL · BY 4/4) Ihracat Evraklari'na aktarilir -> is listesinde GORUNMEZ.
  // Liste once TAM kurulur (is emri / odeme eslestirmesi bozulmasin), 4/4 dosya satirlari sonra cikarilir. Yukleme plani,
  // ozet kartlari ve gunluk yukleme hesaplari butun acik dosyalarla devam eder.
  const tumOgeler = useMemo(() => isListesiKur(dosyalar, isEmirleri, odemeler), [dosyalar, isEmirleri, odemeler]);
  const ogeler = useMemo(() => tumOgeler.filter((o) => !(o.tur === "dosya" && yuklemeEvraklariTamam(o.dosya, o.dosya.faturaParcalari))), [tumOgeler]);
  const aktarilanSayisi = tumOgeler.length - ogeler.length;
  const sayilar = useMemo(() => listeSayilari(ogeler), [ogeler]);
  const gorunenler = useMemo(() => listeAra(ogeler.filter((o) => filtreyeUyar(o.durum, activeFilter, o.cutoffYakin)), arama), [ogeler, activeFilter, arama]);
  const listeYetkisi = !!yetkiler.sayfa_yetkileri.proformalar;
  // 25.11.2026 grup cerceveleri: siraya dokunmadan 3 gruba bolunur; daraltma tarayicida hatirlanir
  const gruplar = useMemo(() => listeGruplari(gorunenler), [gorunenler]);
  const [kapaliGruplar, setKapaliGruplar] = useState<Set<ListeGrubu>>(() => new Set());
  useEffect(() => { try { setKapaliGruplar(kapaliGruplariOku(window.localStorage.getItem("panel-grup-kapali"))); } catch { /* depolama kapali */ } }, []);
  const grupDegistir = useCallback((g: ListeGrubu) => setKapaliGruplar((s) => {
    const y = new Set(s); if (y.has(g)) y.delete(g); else y.add(g);
    try { window.localStorage.setItem("panel-grup-kapali", JSON.stringify(Array.from(y))); } catch { /* depolama kapali */ }
    return y;
  }), []);
  const simdi = Date.now();

  // 23.11.2026 GUNLUK YUKLEME HEDEFI: acik dosyalar + dosyasi acilmamis booking'ler; bugun tartilanlar hedefe sayilir.
  // Gecmis okunamazsa varsayilan (Pzt-Cmt, kapasite bilinmiyor) ile yine hesaplanir.
  const bugunGunu = bugunTarihIstanbul();
  const yuklemeIsleri = useMemo(() => [
    ...dosyalar.map((d) => dosyaIsi(d, d.konteynerler.filter((k) => !!k.dba_dosya_url && efektifTartimBilgisi(k.dba_kontrol_sonucu, k.dba_yukleme_tarihi)?.gun === bugunGunu).length)),
    ...(isEmirleri?.rezervasyonlu || []).map(bookingIsi),
  ].filter((x): x is YuklemeIsi => x !== null), [dosyalar, isEmirleri, bugunGunu]);
  const yuklemePlani = useMemo(
    () => yuklemePlaniKur(yuklemeIsleri, kapasite || { gunSayisi: 0, ortalama: 0, p75: 0, max: 0, isGunleri: [] }, bugunGunu),
    [yuklemeIsleri, kapasite, bugunGunu]);
  // 23.11.2026 aksam: sabah plani / gerceklesen (hedef gun icinde sabit). Kapasite okunmadan hesaplanmaz (is gunleri gecmisten)
  const karsilastirma = useMemo(() => (kapasite ? sabahKarsilastirmasi(yuklemeIsleri, kapasite, bugunGunu) : null), [yuklemeIsleri, kapasite, bugunGunu]);
  // 23.11.2026 aksam: filo plani (konteyner araci gunluk yukleme planindan; is gunleri gecmisten)
  const filoPlani = useMemo(() => (filoVerisi && filoVerisi.filo.length > 0 ? filoPlaniKur(filoVerisi, yuklemePlani, kapasite?.isGunleri?.length ? kapasite.isGunleri : [1, 2, 3, 4, 5, 6]) : null),
    [filoVerisi, yuklemePlani, kapasite]);
  // 23.11.2026 Ozet karti: bu hafta yuklenmesi gereken (hedef gunu bu hafta / gecmis) + bu hafta yuklenen
  const haftalik = useMemo(() => haftalikYukleme(yuklemeIsleri, yuklemePlani, bugunGunu, yuklemeGunleri), [yuklemeIsleri, yuklemePlani, bugunGunu, yuklemeGunleri]);
  const isEtiketi = useCallback((a: string) => yuklemeIsleri.find((x) => x.anahtar === a)?.etiket || a, [yuklemeIsleri]);
  const pazarYetkisi = !!yetkiler.sayfa_yetkileri.pazar;
  const kantarYetkisi = !!yetkiler.sayfa_yetkileri.kantar;

  // ?dosya= / cut-off cubugu: satir bulunur, filtre gizliyorsa "Tumu"ye donulur, satira kaydirilir ve vurgulanir.
  // Acik dosyalarda yoksa (kapali dosya) ve deger dosya kimligiyse eskisi gibi dosya sayfasina gidilir.
  // 4/4 dosya listede yok: vurgu bulunamaz -> eskisi gibi dosya sayfasina gidilir
  const vurguDosyasi = useMemo(() => (vurgu ? dosyalar.find((d) => dosyaEslesir(d, vurgu) && !yuklemeEvraklariTamam(d, d.faturaParcalari)) || null : null), [dosyalar, vurgu]);
  useEffect(() => {
    if (loading || !vurgu) return;
    if (!vurguDosyasi) {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(vurgu)) { gecisliGit(`/dosya/${vurgu}`); return; }
      // Evraklari tamamlanip Ihracat Evraklari'na aktarilan acik dosya: dosya sayfasi
      const aktarilan = dosyalar.find((d) => dosyaEslesir(d, vurgu));
      if (aktarilan) { gecisliGit(`/dosya/${aktarilan.id}`); return; }
      if (vurguKaydirildi.current !== vurgu) { vurguKaydirildi.current = vurgu; showToast(`${vurgu} açık dosyalar arasında bulunamadı.`, "error"); }
      return;
    }
    // Bir kez: kaydirildiktan sonra kullanici baska filtre secerse filtre geri cevrilmez
    if (vurguKaydirildi.current === vurguDosyasi.id) return;
    if (!gorunenler.some((o) => o.tur === "dosya" && o.dosya.id === vurguDosyasi.id)) { setActiveFilter("tumu"); setArama(""); return; }
    // 25.11.2026: hedef satirin grubu daraltilmissa (kaydirilacak satir cizilmez) grup acilir
    const hedefOge = gorunenler.find((o) => o.tur === "dosya" && o.dosya.id === vurguDosyasi.id);
    if (hedefOge && kapaliGruplar.has(durumGrubu(hedefOge.durum))) { grupDegistir(durumGrubu(hedefOge.durum)); return; }
    vurguKaydirildi.current = vurguDosyasi.id;
    window.setTimeout(() => document.getElementById(`dosya-satir-${vurguDosyasi.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }, [loading, vurgu, vurguDosyasi, dosyalar, gorunenler, setActiveFilter, gecisliGit, showToast, kapaliGruplar, grupDegistir]);
  const detayDegistir = (id: string) => setAcikDetay((s) => { const y = new Set(s); if (y.has(id)) y.delete(id); else y.add(id); return y; });

  // 25.11.2026: satir cizimi gruplar icin fonksiyona alindi (icerik 23.11.2026 ile ayni)
  const satirCiz = (oge: (typeof gorunenler)[number], idx: number): React.ReactNode => {
                if (oge.tur === "is_emri") return <IsEmriListeSatiri key={oge.anahtar} s={oge.isEmri} durum={oge.durum} yetkili={listeYetkisi} simdi={simdi} gorev={yuklemePlani.ozetler[oge.anahtar] || null} />;
                if (oge.tur === "odeme") return <OdemeListeSatiri key={oge.anahtar} p={oge.odeme} simdi={simdi} listeYetkisi={listeYetkisi} />;
                const dosya = oge.dosya;
                const gorev = yuklemePlani.ozetler[`dosya:${dosya.id}`] || null;
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
                  // 16.11.2026: Kantar yetkisi olana DBA adimi Kantar Paneli'ni o dosya suzulmus acar (/kantar?dosya=)
                  { label: eklenenKont > 0 ? `DBA ${dbaTamamlanan}/${eklenenKont}` : "DBA", done: dbaTamamlanan > 0 && dbaTamamlanan >= eklenenKont,
                    href: kantarYetkisi && eklenenKont > 0 ? kantarDosyaYolu(dosya.dosya_no) : null },
                  { label: "VGM", done: dosya.konteynerler.some((k) => !!k.vgm_kg) },
                ];

                const vurgulu = vurguDosyasi?.id === dosya.id;
                const detayAcik = acikDetay.has(dosya.id);

                return (
                  <React.Fragment key={dosya.id}>
                    {/* Ana satır (16.11.2026: tek satir; adimlar / mal cinsi / tam evrak rozetleri ▾ detay satirinda) */}
                    <tr id={`dosya-satir-${dosya.id}`} data-vurgu={vurgulu ? "evet" : undefined}
                      className={`${LISTE_SATIR} ${staggerClass}`}
                      style={{ borderColor: CARD_BORDER, ...durumKenari(oge.durum), ...(vurgulu ? { backgroundColor: "rgba(16,185,129,0.08)", boxShadow: `inset 3px 0 0 ${ACCENT}` } : {}) }}>
                      {/* 23.11.2026: yuklemesi suren dosya sari; altinda dolu / rezervasyon ve (varsa) cut-off uyarisi */}
                      {/* 23.11.2026 aksam: dolu sayisi Konteyner hucresinde buyuk (DoluGostergesi); hepsi doluysa durumun yaninda "DOLU" */}
                      <DurumHucresi durum={oge.durum} hepsiDolu={doluDurumu(oge.yukleme) === "tam"} alt={oge.durum === "basladi" ? (
                        <>{dosya.dosya_no}<br />{oge.yukleme.kalan} konteyner kaldı
                          {oge.cutoffYakin ? <><br /><span style={{ color: "#FCA5A5" }}>Cut-off yakın</span></> : null}</>
                      ) : dosya.dosya_no} />
                      <td className={`${HUCRE_TAM} xl:max-w-[240px]`}>
                        <CokluNoKisa deger={dosya.proforma_no || dosya.dosya_no} className="block text-xs font-semibold truncate" style={{ color: ACCENT }} />
                        {pazarYetkisi && dosya.alici_firma ? (
                          <Link href={`/pazar?musteri=${encodeURIComponent(dosya.alici_firma)}`} title="Pazar'da müşteri kartını aç" className="block text-xs font-medium text-white truncate hover:underline decoration-white/40" data-musteri-link>
                            {dosya.alici_firma}
                          </Link>
                        ) : (
                          <p className="text-xs font-medium text-white truncate" title={dosya.alici_firma || undefined}>{dosya.alici_firma || "—"}</p>
                        )}
                        <p className="text-[10px] truncate" style={{ color: TEXT_MUTED }}>{dosya.varis_limani || ""}</p>
                        {hasRez && (
                          <p className="text-[10px] font-mono truncate mt-0.5" style={{ color: TEXT_MUTED }} title={[latestRez!.booking_no, latestRez!.gemi_adi].filter(Boolean).join(" · ")}>
                            {latestRez!.booking_no || "—"} · ETD {latestRez!.gemi_kalkis_tarihi ? formatDateTR(latestRez!.gemi_kalkis_tarihi) : "—"}
                          </p>
                        )}
                      </td>
                      {!hasRez ? (
                        <td className={HUCRE_GENIS} colSpan={2}>
                          {/* 23.11.2026: rezervasyonsuz dosya = "Rezervasyon bekliyor" (mavi); dogrudan rezervasyon ekranina */}
                          <Link href={`/dosya/${dosya.id}?tab=rezervasyon&action=new`} className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline" style={{ color: "#93C5FD" }} data-rezervasyon-ekle>
                            <CalendarDays size={12} /> Henüz rezervasyon alınmadı · Rezervasyon ekle
                          </Link>
                        </td>
                      ) : (
                        <>
                          <td className={HUCRE}>
                            {/* 23.11.2026 aksam: buyuk "dolu / rezervasyon" + bolmeli cubuk + bugunun gorevi (salt goruntuleme) */}
                            <DoluGostergesi toplam={konteynerAdedi} alinan={eklenenKont} dolu={dbaTamamlanan} gorev={gorev} />
                            <EvrakSayaci dosya={dosya} className={EVRAK_SAYAC_DAR} />
                          </td>
                          <td className={HUCRE}>
                            <div className="flex flex-col gap-1">
                              <CutoffSatiri etiket="Talimat" deger={latestRez!.talimat_cutoff}
                                tamamEtiketi={dosya.konsimento_dosya_url ? "Gönderildi" : talimatCutoffTamamMi(dosya) ? "Draft BL" : null}
                                tamamHref={dosya.konsimento_dosya_url || dosya.draft_bl_dosya_url}
                                tamamAciklama={dosya.konsimento_dosya_url ? "Konşimento talimatı gönderildi - talimatı aç" : "Draft BL alındı - belgeyi aç"} />
                              <CutoffSatiri etiket="Beyan" deger={latestRez!.beyanname_cutoff}
                                tamamEtiketi={beyannameCutoffTamamMi(dosya) ? "Gönderildi" : null}
                                tamamHref={dosya.beyanname_dosya_url}
                                tamamAciklama="Beyanname gönderildi - belgeyi aç" />
                            </div>
                          </td>
                        </>
                      )}
                      <td className={HUCRE_EVRAK}><EvrakRozetleri dosya={dosya} /></td>
                      <td className={HUCRE_ISLEM}>
                        <div className="flex items-center justify-end max-xl:justify-start gap-1">
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
                            title="Dosya detayı"
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-white transition-colors hover:opacity-90 whitespace-nowrap"
                            style={{ backgroundColor: ACCENT }}
                          >
                            <ExternalLink size={12} /> <span className="hidden 2xl:inline">Detay</span>
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
                    {detayAcik && <tr className="border-b max-xl:block" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }} data-detay-satiri>
                      <td colSpan={LISTE_SUTUN_SAYISI} className="px-4 py-2.5 max-xl:block">
                        <EvrakDurumu dosya={dosya} />
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          {akisAdimlari.map((adim) => {
                            const ic = (
                              <>
                                <span className={`w-1.5 h-1.5 rounded-full ${adim.done ? "bg-green-500" : ""}`} style={!adim.done ? { backgroundColor: "#4A5262" } : undefined} />
                                {adim.label}
                              </>
                            );
                            const sinif = `inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium ${adim.done ? "bg-green-500/10 text-green-400" : ""}`;
                            const stil = !adim.done ? { backgroundColor: CARD_BORDER, color: TEXT_MUTED } : undefined;
                            const href = "href" in adim ? adim.href : null;
                            return href ? (
                              <Link key={adim.label} href={href} className={`${sinif} hover:underline`} style={stil} title="Kantar Paneli'nde bu dosyanın konteynerlerini aç" data-kantar-link>{ic}</Link>
                            ) : (
                              <span key={adim.label} className={sinif} style={stil}>{ic}</span>
                            );
                          })}
                          <span className="text-[10px] truncate max-w-full sm:max-w-[420px]" style={{ color: TEXT_MUTED }} title={dosya.urun_tanimi || undefined}>
                            {dosya.urun_tanimi || "—"} · {latestRez?.gemi_adi || "Gemi adı yok"}{dosya.rezervasyonlar.length > 1 ? ` · ${dosya.rezervasyonlar.length} rezervasyon` : ""}
                          </span>
                        </div>
                      </td>
                    </tr>}
                  </React.Fragment>
                );
  };

  return (
    <AppShell>
      <SayfaBasligi
        ikon={<FolderOpen size={20} />}
        baslik="Ana Panel"
        aciklama={`${sayilar.acik} açık sevkiyat · ${sayilar.rez_bekliyor} rezervasyon bekliyor · ${sayilar.odeme} ödeme bekliyor${aktarilanSayisi > 0 ? ` · ${aktarilanSayisi} tamamlanan iş İhracat Evrakları'nda` : ""}`}
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

      {!loading && <PanelOzetKartlari dosyalar={dosyalar} companyId={companyId} yenileme={yenileme} haftalik={haftalik} isEmirleri={isEmirleri?.rezervasyonlu || []} />}

      {!loading && <GunlukYuklemeKarti plan={yuklemePlani} kapasite={kapasite} etiket={isEtiketi} karsilastirma={karsilastirma} filo={filoPlani ? <FiloBolumu plan={filoPlani} /> : null} />}

      {/* 23.11.2026 TEK IS LISTESI: ayri cut-off cubugu / is emri seritleri / dosya sekmeleri kalkti; tek filtre cubugu
          (durumlar, adreste ?filtre=) + arama. Durum renkleri ve sira kayitlardan otomatik (lib/panel/is-listesi.ts). */}
      {!loading && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SekmeCubugu testId="panel-filtreler" veriOzelligi="filtre" sayiBicimi="duz" secili={activeFilter} onSec={setActiveFilter}
            ogeler={LISTE_FILTRELERI.map((f) => ({ deger: f.key, etiket: f.label, sayi: sayilar[f.key] }))} />
          <label className="relative mb-4 w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: TEXT_MUTED }} />
            <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Müşteri, proforma, booking ara" aria-label="Listede ara" data-testid="panel-arama"
              className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
          </label>
        </div>
      )}

      {loading ? (
        <SayfaYukleniyor boyut={24} />
      ) : gorunenler.length === 0 ? (
        <EmptyState icon={<FolderX size={48} />} title="Bu görünümde iş yok" description={arama ? "Aramayı temizleyin ya da başka bir filtre seçin." : "Başka bir filtre seçin ya da yeni dosya açın."} />
      ) : (
        <div className="flex flex-col gap-4" data-testid="panel-gruplar">
          {/* 25.11.2026 GRUP CERCEVELERI: 3 grup (Acik Sevkiyatlar / Rezervasyon Bekleyenler / Odeme Bekleyenler) ayri kutu,
              renkli kenar + baslik; daraltilabilir (localStorage panel-grup-kapali). Satirlar ve sira aynen (lib/panel/is-listesi.ts). */}
          {gruplar.map((b) => (
            <ListeGrupCercevesi key={b.grup} grup={b.grup} sayi={b.ogeler.length} konteyner={b.konteyner} dagilim={b.dagilim}
              kapali={kapaliGruplar.has(b.grup)} degistir={() => grupDegistir(b.grup)}>
              <div className="overflow-x-auto">
                {/* 23.11.2026 her ekrana uyum: 6 sutun; 1500 px alti Evraklar gizli (kisa sayac), 1280 px alti kart (components/panel/is-listesi-satirlari.tsx) */}
                <table className={LISTE_TABLO}>
            <thead className={LISTE_BASLIK}>
              <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Durum</th>
                <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }} title="Proforma · müşteri · booking / gemi kalkış">Sipariş</th>
                <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Konteyner</th>
                <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }} title="Talimat ve beyanname cut-off: tarih, saat ve kalan süre">Cut-off</th>
                <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap hidden min-[1500px]:table-cell" style={{ color: TEXT_MUTED }} title="KT Konşimento Talimatı · FT Fatura · BL Draft BL · BY Beyanname">Evraklar</th>
                <th className="text-right px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>İşlemler</th>
              </tr>
            </thead>
                  <tbody className={LISTE_GOVDE}>
                    {b.ogeler.map(satirCiz)}
                  </tbody>
                </table>
              </div>
            </ListeGrupCercevesi>
          ))}
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