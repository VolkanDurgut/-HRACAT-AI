"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { MetinListesiEditor } from "@/components/metin-listesi-editor";
import { FileSignature, Plus, Trash2, Loader2, Download, Settings, AlertCircle, CheckCircle2, ChevronDown, Search, RotateCcw, ExternalLink, Save, FolderOpen, FilePlus2, Pencil } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { yazmaHatasi } from "@/lib/supabase";
import { KAYIT_LISTE_KOLONLARI, kayitEksigi, kayitHataMesaji, kayitSatiri, kayitZamani, type ProformaKaydi } from "@/lib/proforma/kayitli";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { BANKA_PRESETLERI } from "@/lib/bankalar";
import type { GecmisDosya } from "@/lib/proforma/gecmis";
import { proformaHataMesaji, kodTemizle, type IhracatMusteri, type IhracatUrun, type ProformaAyar } from "@/lib/proforma/kayit";
import { VARSAYILAN_ALT_BILGI, VARSAYILAN_EVRAKLAR, VARSAYILAN_OZEL_SARTLAR, VARSAYILAN_UST_BILGI, aliciKoduOner, sigortaEvrakiMi, sigortaSatictaMi } from "@/lib/proforma/sabitler";
import {
  BOS_KALEM,
  EK_SATIR_SINIR,
  FCL_MTS,
  IKINCI_KUTU_ETIKETLERI,
  belgeOlustur,
  bosTaslak,
  eksikler,
  genelSayiYaz,
  kalemleriHesapla,
  markaOnerileri,
  musteriSecenekleri,
  musteriUygula,
  otomatikAlanlar,
  paraSimgesi,
  taslakNormalle,
  paraYaz,
  teslimSekliBul,
  toplamlar,
  urunOnerileri,
  type IkinciKutuEtiketi,
  type KalemTaslak,
  type MusteriSecenegi,
  type ProformaTaslak,
} from "@/lib/proforma/belge";

/**
 * PROFORMALAR - Yeni Proforma (17.10.2026, sadelestirilmis tek ekran).
 *  1 Musteri  -> secilince son proforma / son dosya bilgileri gelir
 *  2 Urunler  -> tutar, toplam, FCL, paketleme ve marka satiri otomatik
 *  3 Odeme ve Sevkiyat -> dolu gelir, kontrol edilir
 * Sagda CANLI ONIZLEME (indirilecek PDF'in kendisi). Bu teslimatta
 * veritabanina HICBIR SEY yazilmaz; kaydetme / liste sonraki adim.
 * 29.10.2026 (kullanici): "PDF indir dediğimizde proforma Harun Bey'in imzası ile
 * imzalanmış şekilde indirilmeli" -> onizleme ve indirme IMZALI (dosya adinda -TASLAK yok).
 * 03.11.2026 (kullanici): "Hazirlanan proformalar kayitli kalmali ve duzenlenebilmeli" ->
 * `proformalar` tablosu (taslak = ekranin tamami). "Kaydet" ve "Kaydet ve PDF Indir"
 * (indirilen her proforma kayitli kalir); "Kayitli Proformalar" listesinden acilip ayni
 * kayda duzenlenir; "Yeni proforma" bos form. Sayfa 2'ye ilave satir (ekSatirlar).
 */
const IMZALI = true;

const DOSYA_ALANLARI =
  "alici_firma, alici_adresi, ham_veri, varis_limani, teslim_sekli, banka, odeme_sekli, sevkiyat_evraklari, proforma_no, para_birimi, urun_detaylari, olusturma_tarihi";

const inp = "w-full px-3 py-2 rounded-lg border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const inpStil = { backgroundColor: "#0F131A", borderColor: CARD_BORDER } as const;

type Sablon = { ozelSartlar: string[]; altBilgi: string[]; ustBilgi: { tarih: string; revizyon: string }; evraklar: string[] };

export default function YeniProformaPage() {
  const { companyId, yetkiler, user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const yetkili = !!yetkiler.sayfa_yetkileri.proformalar;

  const [yukleniyor, setYukleniyor] = useState(true);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [kartlar, setKartlar] = useState<IhracatMusteri[]>([]);
  const [urunler, setUrunler] = useState<IhracatUrun[]>([]);
  const [dosyalar, setDosyalar] = useState<GecmisDosya[]>([]);
  const [sablon, setSablon] = useState<Sablon>({
    ozelSartlar: VARSAYILAN_OZEL_SARTLAR,
    altBilgi: VARSAYILAN_ALT_BILGI,
    ustBilgi: { ...VARSAYILAN_UST_BILGI },
    evraklar: VARSAYILAN_EVRAKLAR,
  });

  const [t, setT] = useState<ProformaTaslak>(() => bosTaslak());
  const [kodElle, setKodElle] = useState(false);
  const [degisti, setDegisti] = useState(false);
  const [ayrintiAcik, setAyrintiAcik] = useState(false);
  const [indiriliyor, setIndiriliyor] = useState(false);
  // Kayitli proformalar (03.11.2026)
  const [kayitId, setKayitId] = useState<string | null>(null);
  const [kayitBilgi, setKayitBilgi] = useState<ProformaKaydi | null>(null);
  const [kayitlar, setKayitlar] = useState<ProformaKaydi[]>([]);
  const [kayitHatasi, setKayitHatasi] = useState<string | null>(null);
  const [listeAcik, setListeAcik] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [aciliyor, setAciliyor] = useState<string | null>(null);
  const [onay, setOnay] = useState<{ tur: "ac"; kayit: ProformaKaydi } | { tur: "yeni" } | { tur: "sil"; kayit: ProformaKaydi } | null>(null);
  const [siliniyor, setSiliniyor] = useState(false);

  // ------------------------------------------------------------- veri ---
  const getir = useCallback(async () => {
    if (!companyId) return;
    setOkumaHatasi(null);
    const [k, u, a, d] = await Promise.all([
      supabase.from("ihracat_musterileri").select("*").eq("company_id", companyId).order("unvan"),
      supabase.from("ihracat_urunleri").select("*").eq("company_id", companyId).order("sira"),
      supabase.from("proforma_ayarlari").select("*").eq("company_id", companyId).maybeSingle(),
      supabase.from("ihracat_dosyalari").select(DOSYA_ALANLARI).eq("company_id", companyId).order("olusturma_tarihi", { ascending: false }).limit(2000),
    ]);
    const hata = k.error || u.error || a.error || d.error;
    if (hata) {
      setOkumaHatasi(proformaHataMesaji(hata));
      setYukleniyor(false);
      return;
    }
    setKartlar((k.data || []) as IhracatMusteri[]);
    setUrunler((u.data || []) as IhracatUrun[]);
    setDosyalar((d.data || []) as GecmisDosya[]);
    const ayar = a.data as ProformaAyar | null;
    const evr = ayar?.evraklar?.length ? ayar.evraklar : VARSAYILAN_EVRAKLAR;
    setSablon({
      ozelSartlar: ayar?.ozel_sartlar?.length ? ayar.ozel_sartlar : VARSAYILAN_OZEL_SARTLAR,
      altBilgi: ayar?.alt_bilgi?.length ? ayar.alt_bilgi : VARSAYILAN_ALT_BILGI,
      ustBilgi: { tarih: ayar?.ust_bilgi_tarih || VARSAYILAN_UST_BILGI.tarih, revizyon: ayar?.ust_bilgi_revizyon || VARSAYILAN_UST_BILGI.revizyon },
      evraklar: evr,
    });
    setT((onceki) => (onceki.musteriAnahtari || onceki.unvan ? onceki : { ...onceki, evraklar: [...evr] }));
    setYukleniyor(false);
  }, [companyId]);

  useEffect(() => {
    if (authLoading || !yetkili) return;
    getir();
  }, [authLoading, yetkili, getir]);

  // Kayitli proformalar: AYRI okunur; okunamazsa form yine calisir (liste alaninda hata)
  const kayitlariGetir = useCallback(async () => {
    if (!companyId) return;
    const { data, error } = await supabase.from("proformalar").select(KAYIT_LISTE_KOLONLARI).eq("company_id", companyId).order("updated_at", { ascending: false }).limit(500);
    if (error) { setKayitHatasi(kayitHataMesaji(error, "")); return; }
    setKayitHatasi(null);
    setKayitlar((data || []) as ProformaKaydi[]);
  }, [companyId]);
  useEffect(() => {
    if (authLoading || !yetkili) return;
    kayitlariGetir();
  }, [authLoading, yetkili, kayitlariGetir]);

  const secenekler = useMemo(() => musteriSecenekleri(kartlar, dosyalar), [kartlar, dosyalar]);
  const urunListesi = useMemo(() => urunOnerileri(urunler, dosyalar), [urunler, dosyalar]);
  const markaListesi = useMemo(() => markaOnerileri(dosyalar), [dosyalar]);
  const tumKodlar = useMemo(() => secenekler.map((s) => s.kod), [secenekler]);
  const secili = useMemo(() => secenekler.find((s) => s.anahtar === t.musteriAnahtari) || null, [secenekler, t.musteriAnahtari]);

  // Kaydedilmemis degisiklik varken sayfadan cikista uyar
  useEffect(() => {
    if (!degisti) return;
    const uyar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", uyar);
    return () => window.removeEventListener("beforeunload", uyar);
  }, [degisti]);

  // ------------------------------------------------------- guncelleme ---
  const guncelle = (f: (x: ProformaTaslak) => ProformaTaslak) => {
    setDegisti(true);
    setT((x) => otomatikAlanlar(f(x)));
  };
  const alan = <K extends keyof ProformaTaslak>(k: K, v: ProformaTaslak[K]) => guncelle((x) => ({ ...x, [k]: v }));

  const musteriSec = (m: MusteriSecenegi) => {
    setKodElle(false);
    guncelle((x) => musteriUygula(x, m, sablon.evraklar));
  };
  const yeniMusteri = (unvan: string) => {
    setKodElle(false);
    guncelle((x) => ({
      ...bosTaslak(x.tarih),
      unvan: unvan.toUpperCase(),
      kod: aliciKoduOner(unvan, tumKodlar),
      evraklar: [...sablon.evraklar],
    }));
  };
  const unvanDegis = (v: string) =>
    guncelle((x) => ({ ...x, unvan: v, kod: !kodElle && !x.musteriAnahtari ? aliciKoduOner(v, tumKodlar) : x.kod }));

  const kalemDegis = (i: number, k: keyof KalemTaslak, v: string) =>
    guncelle((x) => {
      const kalemler = x.kalemler.map((s, j) => (j === i ? { ...s, [k]: v } : s));
      // Listeden bilinen urun secildiyse varsayilan ambalaj gelsin (elle degistirilmemisse)
      if (k === "urun") {
        const bilinen = urunListesi.find((u) => u.ad.toLocaleUpperCase("en-US") === v.trim().toLocaleUpperCase("en-US"));
        if (bilinen && (!x.kalemler[i].ambalajKg || x.kalemler[i].ambalajKg === "25")) kalemler[i] = { ...kalemler[i], ambalajKg: genelSayiYaz(bilinen.kg) };
      }
      return { ...x, kalemler };
    });
  const kalemEkle = () => guncelle((x) => ({ ...x, kalemler: [...x.kalemler, { ...BOS_KALEM, ambalajKg: x.kalemler[x.kalemler.length - 1]?.ambalajKg || "25" }] }));
  const kalemSil = (i: number) => guncelle((x) => ({ ...x, kalemler: x.kalemler.length > 1 ? x.kalemler.filter((_, j) => j !== i) : [{ ...BOS_KALEM }] }));

  const bosForm = () => {
    setKodElle(false);
    setDegisti(false);
    setKayitId(null);
    setKayitBilgi(null);
    setT({ ...bosTaslak(), evraklar: [...sablon.evraklar] });
  };
  const yeniProforma = () => (degisti ? setOnay({ tur: "yeni" }) : bosForm());

  // ----------------------------------------------------------- kayit ---
  /** Kaydeder; basariliysa kayit id'si, degilse null (hata toast'la gosterilir). */
  const kaydet = async (sessiz = false): Promise<string | null> => {
    if (!companyId) return null;
    const sorun = kayitEksigi(t);
    if (sorun) { showToast(sorun, "error"); return null; }
    setKaydediliyor(true);
    const satir = kayitSatiri(t);
    const eposta = user?.email || null;
    const sorgu = kayitId
      ? supabase.from("proformalar").update({ ...satir, guncelleyen_email: eposta }).eq("id", kayitId).eq("company_id", companyId)
      : supabase.from("proformalar").insert({ ...satir, company_id: companyId, olusturan_email: eposta, guncelleyen_email: eposta });
    const { data, error } = await sorgu.select(KAYIT_LISTE_KOLONLARI);
    setKaydediliyor(false);
    // 0 satir (RLS / silinmis kayit) da basarisiz sayilir (01.10.2026 kurali)
    const hata = error ? kayitHataMesaji(error, satir.proforma_no) : yazmaHatasi(null, data);
    if (hata) { showToast(`Kaydedilemedi: ${hata}`, "error"); return null; }
    const kayit = (data as ProformaKaydi[])[0];
    setKayitId(kayit.id);
    setKayitBilgi(kayit);
    setDegisti(false);
    if (!sessiz) showToast(`${kayit.proforma_no} kaydedildi.`, "success");
    kayitlariGetir();
    return kayit.id;
  };

  const kaydiAc = async (k: ProformaKaydi) => {
    setAciliyor(k.id);
    const { data, error } = await supabase.from("proformalar").select(`${KAYIT_LISTE_KOLONLARI}, taslak`).eq("id", k.id).eq("company_id", companyId!).maybeSingle();
    setAciliyor(null);
    if (error || !data) { showToast(`Açılamadı: ${error ? kayitHataMesaji(error, k.proforma_no) : "kayıt bulunamadı (silinmiş olabilir)"}`, "error"); kayitlariGetir(); return; }
    const taslak = taslakNormalle((data as { taslak: unknown }).taslak);
    if (!taslak) { showToast("Kayıt okunamadı (bozuk taslak).", "error"); return; }
    setKodElle(true);
    setT(taslak);
    setKayitId(k.id);
    setKayitBilgi(data as ProformaKaydi);
    setDegisti(false);
    setListeAcik(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast(`${k.proforma_no} açıldı; değişiklikler aynı kayda yazılır.`, "success");
  };
  const acIste = (k: ProformaKaydi) => (degisti ? setOnay({ tur: "ac", kayit: k }) : kaydiAc(k));

  const sil = async (k: ProformaKaydi) => {
    setSiliniyor(true);
    const { data, error } = await supabase.from("proformalar").delete().eq("id", k.id).eq("company_id", companyId!).select("id");
    setSiliniyor(false);
    const hata = error ? kayitHataMesaji(error, k.proforma_no) : yazmaHatasi(null, data);
    if (hata) { showToast(`Silinemedi: ${hata}`, "error"); return; }
    showToast(`${k.proforma_no} silindi.`, "success");
    setOnay(null);
    if (kayitId === k.id) { setKayitId(null); setKayitBilgi(null); setDegisti(true); }
    kayitlariGetir();
  };

  // Sayfa 2 ilave satirlar
  const ekSatirDegis = (i: number, k: "baslik" | "deger", v: string) =>
    guncelle((x) => ({ ...x, ekSatirlar: x.ekSatirlar.map((e, j) => (j === i ? { ...e, [k]: k === "baslik" ? v.toUpperCase().slice(0, EK_SATIR_SINIR.baslik) : v } : e)) }));
  const ekSatirEkle = () => guncelle((x) => (x.ekSatirlar.length >= EK_SATIR_SINIR.adet ? x : { ...x, ekSatirlar: [...x.ekSatirlar, { baslik: "", deger: "" }] }));
  const ekSatirSil = (i: number) => guncelle((x) => ({ ...x, ekSatirlar: x.ekSatirlar.filter((_, j) => j !== i) }));

  // ----------------------------------------------------------- hesap ---
  const hesapli = useMemo(() => kalemleriHesapla(t.kalemler), [t.kalemler]);
  const top = useMemo(() => toplamlar(hesapli), [hesapli]);
  const eksik = useMemo(() => eksikler(t), [t]);
  const simge = paraSimgesi(t.paraBirimi);
  const teslimSekli = teslimSekliBul(t.teslimIfadesi, t.teslimSekli);

  // ------------------------------------------------- canli onizleme ---
  const [onizlemeUrl, setOnizlemeUrl] = useState<string | null>(null);
  const [onizlemeHata, setOnizlemeHata] = useState<string | null>(null);
  const [onizlemeSayfa, setOnizlemeSayfa] = useState(1);
  const urlRef = useRef<string | null>(null);
  useEffect(() => {
    if (yukleniyor || okumaHatasi) return;
    let iptal = false;
    const z = window.setTimeout(async () => {
      try {
        const { proformaPdf } = await import("@/lib/proforma/pdf");
        const belge = belgeOlustur(t, sablon, IMZALI);
        const blob = proformaPdf(belge).output("blob");
        if (iptal) return;
        const url = URL.createObjectURL(blob);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setOnizlemeUrl(url);
        setOnizlemeHata(null);
      } catch (e) {
        if (!iptal) setOnizlemeHata(e instanceof Error ? e.message : String(e));
      }
    }, 500);
    return () => { iptal = true; window.clearTimeout(z); };
  }, [t, sablon, yukleniyor, okumaHatasi]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const indir = async () => {
    if (eksik.length) { showToast(`Eksik: ${eksik[0].mesaj}`, "error"); return; }
    // 03.11.2026: indirilen her proforma kayitli kalir (kayit olmazsa PDF inmez)
    if (degisti || !kayitId) {
      const id = await kaydet(true);
      if (!id) return;
    }
    setIndiriliyor(true);
    try {
      const { proformaPdf, proformaDosyaAdi } = await import("@/lib/proforma/pdf");
      const belge = belgeOlustur(t, sablon, IMZALI);
      proformaPdf(belge).save(proformaDosyaAdi(belge));
      showToast("Proforma kaydedildi ve imzalı PDF indirildi.", "success");
    } catch (e) {
      showToast(`PDF oluşturulamadı: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setIndiriliyor(false);
    }
  };

  // ------------------------------------------------------------ ekran ---
  if (authLoading || (yetkili && yukleniyor && !okumaHatasi)) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin" style={{ color: ACCENT }} /></div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <SayfaBasligi
        ikon={<FileSignature size={20} />}
        baslik={kayitId ? "Proforma Düzenle" : "Yeni Proforma"}
        aciklama={
          <>
            {t.proformaNo ? <>Proforma No <span className="font-mono font-semibold text-emerald-400">{t.proformaNo}</span> · </> : null}
            {kayitId ? "Kayıtlı proforma açık; değişiklikler aynı kayda yazılır." : "Müşteriyi seçin, ürünleri girin, kontrol edip kaydedin ve PDF'i indirin."}
          </>
        }
        sag={
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setListeAcik((a) => !a)} aria-expanded={listeAcik} data-testid="kayitli-ac"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: listeAcik ? ACCENT : CARD_BORDER, color: listeAcik ? "#E6F4EE" : TEXT_MUTED }}>
              <FolderOpen size={14} /> Kayıtlı Proformalar{kayitlar.length ? ` (${kayitlar.length})` : ""}
            </button>
            <button onClick={yeniProforma} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              <FilePlus2 size={14} /> Yeni proforma
            </button>
            <Link href="/proformalar/musteriler" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              <Settings size={14} /> Ayarlar
            </Link>
          </div>
        }
      />

      {okumaHatasi && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "#7F1D1D", backgroundColor: "rgba(127,29,29,0.15)", color: "#FCA5A5" }}>
          <span className="flex items-center gap-2"><AlertCircle size={16} /> {okumaHatasi}</span>
          <button onClick={getir} className="underline">Yeniden dene</button>
        </div>
      )}

      {listeAcik && (
        <KayitliProformalar kayitlar={kayitlar} hata={kayitHatasi} aktifId={kayitId} aciliyor={aciliyor}
          onAc={acIste} onSil={(k) => setOnay({ tur: "sil", kayit: k })} onYenile={kayitlariGetir} onKapat={() => setListeAcik(false)} />
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
        {/* ------------------------------------------------ SOL: FORM --- */}
        <div className="min-w-0 space-y-4">
          {/* 1 MUSTERI */}
          <Kutu no={1} baslik="Müşteri" sag="Listeden seçin ya da yeni ünvan yazın">
            <MusteriSecici secenekler={secenekler} secili={secili} unvan={t.unvan} onSec={musteriSec} onYeni={yeniMusteri} />
            {secili && (
              <p className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "rgba(16,185,129,0.3)", backgroundColor: "rgba(16,185,129,0.08)", color: "#6EE7B7" }}>
                <CheckCircle2 size={14} className="mt-px shrink-0" />
                {secili.sonProforma
                  ? <>Son proformadan (<span className="font-mono">{secili.sonProforma}</span>) adres, ilgili kişi, ürünler, teslim, ödeme, sevkiyat ve banka getirildi. Aşağıda kontrol edin.</>
                  : <>Müşteri kartındaki bilgiler getirildi. Aşağıda kontrol edin.</>}
              </p>
            )}
            {(secili || t.unvan) && (
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_120px]">
                <Alan etiket="Ünvan (BUYER)">
                  <input value={t.unvan} onChange={(e) => unvanDegis(e.target.value)} className={inp} style={inpStil} />
                </Alan>
                <Alan etiket="Alıcı kodu" not="Proforma no için">
                  <input value={t.kod} onChange={(e) => { setKodElle(true); alan("kod", kodTemizle(e.target.value)); }} placeholder="CCS" className={`${inp} font-mono`} style={inpStil} />
                </Alan>
                <Alan etiket="Adres" tam>
                  <textarea value={t.adres} onChange={(e) => alan("adres", e.target.value)} rows={2} className={inp} style={inpStil} />
                </Alan>
                <Alan etiket="İlgili kişi (ATTENTION TO)" tam not="Proformada aynen basılır: ad, TEL, EMAIL…">
                  <textarea value={t.ilgiliKisi} onChange={(e) => alan("ilgiliKisi", e.target.value)} rows={3} placeholder={"Mr. Ibraheem Osman\nTEL : +253 …\nEMAIL : …"} className={inp} style={inpStil} />
                </Alan>
              </div>
            )}
          </Kutu>

          {/* 2 URUNLER */}
          <Kutu no={2} baslik="Ürünler" sag={`1 FCL = ${FCL_MTS} MTS`}>
            <datalist id="pf-urunler">{urunListesi.map((u) => <option key={u.ad} value={u.ad} />)}</datalist>
            <datalist id="pf-markalar">{markaListesi.map((m) => <option key={m} value={m} />)}</datalist>
            <div className="space-y-2">
              {t.kalemler.map((k, i) => {
                const h = kalemleriHesapla([k])[0];
                return (
                  <div key={i} className="rounded-lg border p-3" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
                    <div className="grid gap-2 grid-cols-12">
                      <label className="col-span-12 sm:col-span-8">
                        <span className="block text-[11px] mb-1" style={{ color: TEXT_MUTED }}>{i + 1}. Ürün (marka hariç)</span>
                        <input list="pf-urunler" value={k.urun} onChange={(e) => kalemDegis(i, "urun", e.target.value)} placeholder="PREMIUM QUALITY WHEAT FLOUR" className={inp} style={{ ...inpStil, backgroundColor: CARD_BG }} aria-label={`${i + 1}. ürün`} />
                      </label>
                      <label className="col-span-12 sm:col-span-4">
                        <span className="block text-[11px] mb-1" style={{ color: TEXT_MUTED }}>Marka</span>
                        <input list="pf-markalar" value={k.marka} onChange={(e) => kalemDegis(i, "marka", e.target.value.toUpperCase())} placeholder="SAAD" className={inp} style={{ ...inpStil, backgroundColor: CARD_BG }} aria-label={`${i + 1}. marka`} />
                      </label>
                      <label className="col-span-4 sm:col-span-2">
                        <span className="block text-[11px] mb-1" style={{ color: TEXT_MUTED }}>Ambalaj (kg)</span>
                        <input value={k.ambalajKg} onChange={(e) => kalemDegis(i, "ambalajKg", e.target.value)} inputMode="decimal" className={`${inp} text-right`} style={{ ...inpStil, backgroundColor: CARD_BG }} aria-label={`${i + 1}. ambalaj`} />
                      </label>
                      <label className="col-span-4 sm:col-span-3">
                        <span className="block text-[11px] mb-1" style={{ color: TEXT_MUTED }}>Miktar (MTS)</span>
                        <input value={k.mts} onChange={(e) => kalemDegis(i, "mts", e.target.value)} inputMode="decimal" placeholder="örn. 250" className={`${inp} text-right`} style={{ ...inpStil, backgroundColor: CARD_BG }} aria-label={`${i + 1}. miktar`} />
                      </label>
                      <label className="col-span-4 sm:col-span-3">
                        <span className="block text-[11px] mb-1" style={{ color: TEXT_MUTED }}>Fiyat ({t.paraBirimi}/MTS)</span>
                        <input value={k.fiyat} onChange={(e) => kalemDegis(i, "fiyat", e.target.value)} inputMode="decimal" placeholder="örn. 483" className={`${inp} text-right`} style={{ ...inpStil, backgroundColor: CARD_BG }} aria-label={`${i + 1}. fiyat`} />
                      </label>
                      <div className="col-span-12 sm:col-span-4 flex items-end justify-between gap-2">
                        <div className="pb-1.5">
                          <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>Tutar</span>
                          <span className="block text-sm font-semibold text-white whitespace-nowrap">{h ? `${paraYaz(h.tutar)} ${simge}` : "–"}</span>
                        </div>
                        <div className="text-right pb-1.5">
                          {h && <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{genelSayiYaz(h.mts / FCL_MTS)} FCL{h.cuval ? ` · ${paraYaz(h.cuval, 0)} çuval` : ""}</span>}
                          <button onClick={() => kalemSil(i)} title="Satırı sil" aria-label={`${i + 1}. satırı sil`} className="mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-red-400 hover:bg-red-500/10"><Trash2 size={13} /> Sil</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={kalemEkle} className="mt-2 w-full rounded-lg border border-dashed py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/5" style={{ borderColor: "#2A3141" }}>
              <Plus size={14} className="inline -mt-0.5" /> Ürün satırı ekle
            </button>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-sm" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              <span>Toplam <b className="text-white">{genelSayiYaz(top.mts)} MTS</b></span>
              <span><b className="text-white">{genelSayiYaz(top.fcl)} FCL</b></span>
              {top.cuval > 0 && <span><b className="text-white">{paraYaz(top.cuval, 0)}</b> çuval</span>}
              <span>Tutar <b className="text-white">{paraYaz(top.tutar)} {t.paraBirimi}</b></span>
            </div>
          </Kutu>

          {/* 3 ODEME VE SEVKIYAT */}
          <Kutu no={3} baslik="Ödeme ve Sevkiyat" sag={secili ? "Son proformadan geldi · gerekirse değiştirin" : undefined}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Alan etiket="Teslim (SHIPMENT TERMS)">
                <input value={t.teslimIfadesi} onChange={(e) => alan("teslimIfadesi", e.target.value)} placeholder="CIF DJIBOUTI PORT BASIS" className={inp} style={inpStil} />
              </Alan>
              <Alan etiket="Sevkiyat (SHIPMENT METHOD)">
                <input value={t.sevkiyat} onChange={(e) => alan("sevkiyat", e.target.value)} placeholder="OCTOBER SHIPPING VIA CUL LINE" className={inp} style={inpStil} />
              </Alan>
              <Alan etiket="Ödeme (PAYMENT TERMS)" tam>
                <textarea value={t.odeme} onChange={(e) => alan("odeme", e.target.value)} rows={2} placeholder="%30 ADVANCE PAYMENT, BALANCE WITHIN 3 DAYS AGAINST SCANNED SHIPMENT DOCUMENTS E-MAIL MESSAGE" className={inp} style={inpStil} />
              </Alan>
              <Alan etiket="Banka">
                <select value={t.banka} onChange={(e) => alan("banka", e.target.value as ProformaTaslak["banka"])} className={inp} style={inpStil}>
                  <option value="">Seçin</option>
                  {BANKA_PRESETLERI.map((b) => <option key={b.anahtar} value={b.anahtar}>{b.goruntulenenAd}</option>)}
                </select>
              </Alan>
              <Alan etiket="Para birimi">
                <select value={t.paraBirimi} onChange={(e) => alan("paraBirimi", e.target.value === "EUR" ? "EUR" : "USD")} className={inp} style={inpStil}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </Alan>
              <Alan etiket="1. sayfadaki ödeme kutusu" tam not={t.ikinciElle ? undefined : "Ödeme metninden önerildi (ör. %30 avans → tutarın %30'u)."}>
                <div className="flex flex-wrap gap-2">
                  <select value={t.ikinciEtiket} onChange={(e) => guncelle((x) => ({ ...x, ikinciEtiket: e.target.value as IkinciKutuEtiketi, ikinciElle: true }))} className={`${inp} sm:w-56`} style={inpStil}>
                    {IKINCI_KUTU_ETIKETLERI.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                  <div className="relative flex-1 min-w-[160px]">
                    <input value={t.ikinciTutar} onChange={(e) => guncelle((x) => ({ ...x, ikinciTutar: e.target.value, ikinciElle: true }))} inputMode="decimal" className={`${inp} text-right pr-8`} style={inpStil} aria-label="Ödeme kutusu tutarı" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: TEXT_MUTED }}>{simge}</span>
                  </div>
                  {t.ikinciElle && (
                    <button onClick={() => guncelle((x) => ({ ...x, ikinciElle: false }))} className="inline-flex items-center gap-1 px-2.5 rounded-lg border text-xs hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                      <RotateCcw size={12} /> Öneriye dön
                    </button>
                  )}
                </div>
              </Alan>
            </div>

            {/* Sayfa 2 ilave satirlar (03.11.2026) */}
            <div className="mt-4 rounded-lg border p-3" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }} data-testid="ek-satirlar">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-white">Sözleşme sayfası ilave satırlar</span>
                <span className="text-[11px]" style={{ color: TEXT_MUTED }}>2. sayfada PAYMENT satırından sonra basılır · en fazla {EK_SATIR_SINIR.adet}</span>
              </div>
              {t.ekSatirlar.length > 0 && (
                <div className="mt-2 space-y-2">
                  {t.ekSatirlar.map((e, i) => (
                    <div key={i} className="grid gap-2 sm:grid-cols-[200px_1fr_auto] items-start">
                      <input value={e.baslik} onChange={(ev) => ekSatirDegis(i, "baslik", ev.target.value)} maxLength={EK_SATIR_SINIR.baslik}
                        placeholder="BAŞLIK (ör. INSPECTION)" aria-label={`${i + 1}. ilave satır başlığı`} className={inp} style={{ ...inpStil, backgroundColor: CARD_BG }} />
                      <textarea value={e.deger} onChange={(ev) => ekSatirDegis(i, "deger", ev.target.value)} rows={1} maxLength={EK_SATIR_SINIR.deger}
                        placeholder="Değer (ör. SGS AT LOADING PORT, COST BY BUYER)" aria-label={`${i + 1}. ilave satır değeri`} className={inp} style={{ ...inpStil, backgroundColor: CARD_BG }} />
                      <button onClick={() => ekSatirSil(i)} aria-label={`${i + 1}. ilave satırı sil`} title="Satırı sil"
                        className="justify-self-end inline-flex items-center gap-1 rounded px-2 py-2 text-xs text-red-400 hover:bg-red-500/10"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
              {t.ekSatirlar.length < EK_SATIR_SINIR.adet && (
                <button onClick={ekSatirEkle} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-400 hover:underline">
                  <Plus size={14} /> İlave satır ekle
                </button>
              )}
            </div>

            {/* Diger ayrintilar */}
            <button onClick={() => setAyrintiAcik((a) => !a)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:underline" aria-expanded={ayrintiAcik}>
              <ChevronDown size={15} className={`transition-transform ${ayrintiAcik ? "rotate-180" : ""}`} /> Diğer ayrıntılar
              <span className="font-normal" style={{ color: TEXT_MUTED }}>(proforma no, tarih, paketleme, marka satırı, evraklar)</span>
            </button>
            {ayrintiAcik && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 rounded-lg border p-3" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
                <Alan etiket="Proforma No" not={t.proformaNoElle ? undefined : "Otomatik: UNEX + kod + tarih"}>
                  <div className="flex gap-2">
                    <input value={t.proformaNo} onChange={(e) => guncelle((x) => ({ ...x, proformaNo: e.target.value.toUpperCase(), proformaNoElle: true }))} className={`${inp} font-mono`} style={inpStil} />
                    {t.proformaNoElle && <SifirlaButon onClick={() => guncelle((x) => ({ ...x, proformaNoElle: false }))} />}
                  </div>
                </Alan>
                <Alan etiket="Tarih" not="Geçerlilik: tarih + 4 gün">
                  <input type="date" value={t.tarih} onChange={(e) => e.target.value && alan("tarih", e.target.value)} className={inp} style={{ ...inpStil, colorScheme: "dark" }} />
                </Alan>
                <Alan etiket="Paketleme (PACKAGING)" tam not={t.paketlemeElle ? undefined : "Ürünlerden otomatik yazılır"}>
                  <div className="flex gap-2">
                    <textarea value={t.paketleme} onChange={(e) => guncelle((x) => ({ ...x, paketleme: e.target.value, paketlemeElle: true }))} rows={2} className={inp} style={inpStil} />
                    {t.paketlemeElle && <SifirlaButon onClick={() => guncelle((x) => ({ ...x, paketlemeElle: false }))} />}
                  </div>
                </Alan>
                <Alan etiket="Marka satırı (BRAND & MARKING)" tam not={t.markaElle ? undefined : "Ürünlerin markalarından otomatik"}>
                  <div className="flex gap-2">
                    <input value={t.markaSatiri} onChange={(e) => guncelle((x) => ({ ...x, markaSatiri: e.target.value, markaElle: true }))} className={inp} style={inpStil} />
                    {t.markaElle && <SifirlaButon onClick={() => guncelle((x) => ({ ...x, markaElle: false }))} />}
                  </div>
                </Alan>
                <div className="sm:col-span-2">
                  <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Evraklar (SHIPPING DOCUMENTS)</span>
                  <MetinListesiEditor
                    deger={t.evraklar}
                    degis={(v) => alan("evraklar", v)}
                    encok={30}
                    ekleEtiketi="Evrak ekle"
                    vurgula={(e) => (sigortaEvrakiMi(e) && !sigortaSatictaMi(teslimSekli) ? `${teslimSekli || "Bu teslim şekli"} için basılmaz (sigorta alıcıda)` : null)}
                  />
                </div>
              </div>
            )}
          </Kutu>

          {/* ALT CUBUK */}
          <div className="sticky bottom-0 z-10 rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="min-w-0 text-xs" style={{ color: TEXT_MUTED }}>
              {eksik.length ? (
                <span className="flex items-start gap-1.5 text-amber-400"><AlertCircle size={14} className="mt-px shrink-0" /> {eksik.map((e) => e.mesaj).join(" · ")}</span>
              ) : (
                <span className="flex items-center gap-1.5 text-emerald-400"><CheckCircle2 size={14} /> Proforma hazır. Önizlemeyi kontrol edip indirin.</span>
              )}
              <span className="block mt-0.5" data-testid="kayit-durumu">
                {kayitBilgi
                  ? <>{degisti ? <b className="text-amber-400">Kaydedilmemiş değişiklik var</b> : <span className="text-emerald-400">Kayıtlı</span>} · son kayıt {kayitZamani(kayitBilgi.updated_at)}{kayitBilgi.guncelleyen_email ? ` · ${kayitBilgi.guncelleyen_email}` : ""}</>
                  : <>Henüz kaydedilmedi · Hazırlayan: {user?.email || "-"}</>}
                {" "}· Harun Bey imzalı
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => kaydet()} disabled={kaydediliyor || indiriliyor || (!!kayitId && !degisti)} data-testid="kaydet"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border text-sm font-semibold hover:bg-white/5 disabled:opacity-50" style={{ borderColor: ACCENT, color: "#E6F4EE" }}>
                {kaydediliyor && !indiriliyor ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {kayitId && !degisti ? "Kayıtlı" : "Kaydet"}
              </button>
              <button onClick={indir} disabled={indiriliyor || kaydediliyor || eksik.length > 0} data-testid="pdf-indir" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
                {indiriliyor || kaydediliyor ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {degisti || !kayitId ? "Kaydet ve PDF İndir" : "PDF İndir"}
              </button>
            </div>
          </div>
        </div>

        {/* ------------------------------------------- SAG: ONIZLEME --- */}
        <div className="min-w-0">
          <div className="xl:sticky xl:top-4 rounded-xl border p-3" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white">Canlı Önizleme</h2>
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((n) => (
                  <button key={n} onClick={() => setOnizlemeSayfa(n)} className={`px-2.5 py-1 rounded-md text-xs ${onizlemeSayfa === n ? "text-white" : "hover:bg-white/5"}`} style={onizlemeSayfa === n ? { backgroundColor: ACCENT } : { color: TEXT_MUTED }}>
                    Sayfa {n}
                  </button>
                ))}
                {onizlemeUrl && (
                  <a href={onizlemeUrl} target="_blank" rel="noreferrer" title="Yeni sekmede aç" className="ml-1 p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }}><ExternalLink size={14} /></a>
                )}
              </div>
            </div>
            {onizlemeHata ? (
              <p className="text-sm text-red-400 p-4">Önizleme oluşturulamadı: {onizlemeHata}</p>
            ) : onizlemeUrl ? (
              <iframe
                key={`${onizlemeUrl}-${onizlemeSayfa}`}
                src={`${onizlemeUrl}#page=${onizlemeSayfa}&toolbar=0&navpanes=0&view=FitH`}
                title="Proforma önizleme"
                className="w-full rounded bg-white h-[70vh] min-h-[480px]"
              />
            ) : (
              <div className="flex items-center justify-center h-[480px]"><Loader2 size={24} className="animate-spin" style={{ color: ACCENT }} /></div>
            )}
            <p className="mt-2 text-[11px]" style={{ color: TEXT_MUTED }}>Siz yazdıkça güncellenir. İndirilen PDF birebir bu belgedir (şablonunuzla aynı, 3 sayfa).</p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={onay !== null}
        onOpenChange={(a) => { if (!a && !siliniyor) setOnay(null); }}
        title={onay?.tur === "sil" ? `${onay.kayit.proforma_no} silinsin mi?` : "Kaydedilmemiş değişiklikler var"}
        description={onay?.tur === "sil"
          ? `${onay.kayit.alici_unvan} için kayıtlı proforma silinir. Daha önce indirilen PDF'ler etkilenmez; silinen kaydın kopyası denetim kaydında kalır.`
          : "Formdaki kaydedilmemiş değişiklikler kaybolacak. Devam etmeden önce kaydetmek isterseniz Vazgeç'e basın."}
        confirmLabel={onay?.tur === "sil" ? "Evet, sil" : "Değişiklikleri bırak"}
        cancelLabel="Vazgeç"
        destructive={onay?.tur === "sil"}
        loading={siliniyor}
        loadingLabel="Siliniyor..."
        onConfirm={() => {
          if (!onay) return;
          if (onay.tur === "sil") { sil(onay.kayit); return; }
          const o = onay;
          setOnay(null);
          if (o.tur === "yeni") bosForm(); else kaydiAc(o.kayit);
        }}
      />
    </AppShell>
  );
}

// ------------------------------------------------------------ parcalar ---

/** Kayitli proformalar listesi (03.11.2026): ara, ac (duzenle), sil. */
function KayitliProformalar({ kayitlar, hata, aktifId, aciliyor, onAc, onSil, onYenile, onKapat }: {
  kayitlar: ProformaKaydi[]; hata: string | null; aktifId: string | null; aciliyor: string | null;
  onAc: (k: ProformaKaydi) => void; onSil: (k: ProformaKaydi) => void; onYenile: () => void; onKapat: () => void;
}) {
  const [arama, setArama] = useState("");
  const q = arama.trim().toLocaleLowerCase("en-US");
  const liste = kayitlar.filter((k) => !q || `${k.proforma_no} ${k.alici_unvan}`.toLocaleLowerCase("en-US").includes(q));
  return (
    <section className="mb-5 rounded-xl border" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="kayitli-liste">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
        <FolderOpen size={16} style={{ color: ACCENT }} />
        <h2 className="text-sm font-semibold text-white">Kayıtlı Proformalar</h2>
        <span className="text-xs" style={{ color: TEXT_MUTED }}>{kayitlar.length} kayıt · açtığınız proforma düzenlenip aynı kayda yazılır</span>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
          <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Proforma no veya müşteri" aria-label="Kayıtlı proforma ara" className={`${inp} pl-8 py-1.5`} style={inpStil} />
        </div>
        <button onClick={onKapat} className="px-2.5 py-1.5 rounded-lg border text-xs hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Kapat</button>
      </div>
      {hata ? (
        <p className="px-4 py-4 text-sm text-red-400 flex items-center gap-2"><AlertCircle size={15} /> {hata} <button onClick={onYenile} className="underline">Yeniden dene</button></p>
      ) : liste.length === 0 ? (
        <p className="px-4 py-6 text-sm text-center" style={{ color: TEXT_MUTED }}>{kayitlar.length ? "Aramaya uyan proforma yok." : "Henüz kayıtlı proforma yok. Hazırladığınız proformayı Kaydet ile saklayın."}</p>
      ) : (
        <ul className="max-h-[420px] overflow-y-auto">
          {liste.map((k) => {
            const aktif = k.id === aktifId;
            return (
              <li key={k.id} data-testid="kayitli-satir" className="border-b last:border-0 px-4 py-2.5 flex flex-wrap md:flex-nowrap items-center gap-x-4 gap-y-1.5"
                style={{ borderColor: CARD_BORDER, backgroundColor: aktif ? "rgba(16,185,129,0.07)" : undefined }}>
                <div className="min-w-0 basis-full md:basis-auto md:w-[230px] md:shrink-0">
                  <p className="font-mono text-sm font-semibold text-white break-all">{k.proforma_no}{aktif && <span className="ml-2 font-sans text-[10px] font-bold text-emerald-400">AÇIK</span>}</p>
                  <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{k.tarih.split("-").reverse().join(".")}</p>
                </div>
                <p className="min-w-0 basis-full md:basis-0 md:flex-1 text-sm md:truncate break-words text-white" title={k.alici_unvan}>{k.alici_unvan}</p>
                <p className="text-sm font-semibold text-white whitespace-nowrap tabular-nums md:w-[150px] md:text-right">
                  {paraYaz(Number(k.toplam))} {k.para_birimi}
                  <span className="block text-[11px] font-normal" style={{ color: TEXT_MUTED }}>{genelSayiYaz(Number(k.toplam_mts))} MTS</span>
                </p>
                <p className="text-[11px] md:w-[190px]" style={{ color: TEXT_MUTED }}>
                  Son kayıt {kayitZamani(k.updated_at)}
                  <span className="block truncate">{k.guncelleyen_email || k.olusturan_email || ""}</span>
                </p>
                <div className="flex items-center gap-1.5 ml-auto">
                  <button onClick={() => onAc(k)} disabled={aciliyor === k.id || aktif} aria-label={`${k.proforma_no} aç`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
                    {aciliyor === k.id ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />} {aktif ? "Açık" : "Aç"}
                  </button>
                  <button onClick={() => onSil(k)} aria-label={`${k.proforma_no} sil`} title="Kaydı sil" className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"><Trash2 size={14} /></button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Kutu({ no, baslik, sag, children }: { no: number; baslik: string; sag?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: ACCENT }}>{no}</span>
        <h2 className="text-sm font-semibold text-white">{baslik}</h2>
        {sag && <span className="ml-auto text-xs" style={{ color: TEXT_MUTED }}>{sag}</span>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Alan({ etiket, not, tam, children }: { etiket: string; not?: string; tam?: boolean; children: React.ReactNode }) {
  return (
    <div className={tam ? "sm:col-span-2" : ""}>
      <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>{etiket}</span>
      {children}
      {not && <span className="block text-[10px] mt-1" style={{ color: TEXT_MUTED }}>{not}</span>}
    </div>
  );
}

function SifirlaButon({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Otomatiğe dön" className="shrink-0 inline-flex items-center gap-1 px-2.5 rounded-lg border text-xs hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
      <RotateCcw size={12} /> Otomatik
    </button>
  );
}

/** Aranabilir musteri secici: kayitli kartlar + gecmis dosyalardaki alicilar. */
function MusteriSecici({
  secenekler,
  secili,
  unvan,
  onSec,
  onYeni,
}: {
  secenekler: MusteriSecenegi[];
  secili: MusteriSecenegi | null;
  unvan: string;
  onSec: (m: MusteriSecenegi) => void;
  onYeni: (unvan: string) => void;
}) {
  const [acik, setAcik] = useState(false);
  const [arama, setArama] = useState("");
  const kutu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!acik) return;
    const kapat = (e: MouseEvent) => { if (kutu.current && !kutu.current.contains(e.target as Node)) setAcik(false); };
    document.addEventListener("mousedown", kapat);
    return () => document.removeEventListener("mousedown", kapat);
  }, [acik]);

  const q = arama.trim().toLocaleLowerCase("en-US");
  const liste = secenekler.filter((s) => !q || `${s.unvan} ${s.kod} ${s.ozet}`.toLocaleLowerCase("en-US").includes(q));
  const tamEslesme = secenekler.some((s) => s.unvan.toLocaleLowerCase("en-US") === q);

  return (
    <div ref={kutu} className="relative">
      <button
        type="button"
        onClick={() => { setAcik((a) => !a); setArama(""); }}
        className={`${inp} flex items-center justify-between text-left`}
        style={inpStil}
        aria-haspopup="listbox"
        aria-expanded={acik}
      >
        <span className={unvan ? "text-white" : "text-slate-500"}>
          {unvan ? <>{unvan}{secili && <span className="ml-2 font-mono text-xs" style={{ color: TEXT_MUTED }}>{secili.kod}</span>}</> : "Müşteri seçin…"}
        </span>
        <ChevronDown size={15} style={{ color: TEXT_MUTED }} />
      </button>
      {acik && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border shadow-2xl" style={{ backgroundColor: "#1A1F2B", borderColor: "#2A3141" }}>
          <div className="relative p-2 border-b" style={{ borderColor: "#2A3141" }}>
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
            <input
              autoFocus
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setAcik(false);
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (liste.length === 1) { onSec(liste[0]); setAcik(false); }
                }
              }}
              placeholder="Ünvan veya kod ile ara…"
              className={`${inp} pl-8`}
              style={inpStil}
              aria-label="Müşteri ara"
            />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {liste.map((s) => (
              <li key={s.anahtar}>
                <button
                  type="button"
                  role="option"
                  aria-selected={secili?.anahtar === s.anahtar}
                  onClick={() => { onSec(s); setAcik(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center gap-3"
                >
                  <span className="w-12 shrink-0 font-mono text-xs font-semibold text-emerald-400">{s.kod}</span>
                  <span className="min-w-0">
                    <span className="block text-sm text-white truncate">{s.unvan}</span>
                    <span className="block text-[11px] truncate" style={{ color: TEXT_MUTED }}>{s.ozet || (s.kaynak === "kart" ? "Müşteri kartı" : "Geçmiş dosya")}</span>
                  </span>
                </button>
              </li>
            ))}
            {liste.length === 0 && <li className="px-3 py-3 text-sm" style={{ color: TEXT_MUTED }}>Eşleşen müşteri yok.</li>}
          </ul>
          {arama.trim().length >= 2 && !tamEslesme && (
            <button type="button" onClick={() => { onYeni(arama.trim()); setAcik(false); }} className="w-full border-t px-3 py-2.5 text-left text-sm font-medium text-emerald-400 hover:bg-white/5" style={{ borderColor: "#2A3141" }}>
              <Plus size={14} className="inline -mt-0.5" /> Yeni müşteri: <b>{arama.trim().toUpperCase()}</b>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
