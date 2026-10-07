"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils";
import { supabase, Dosya, Rezervasyon, Konteyner, AnaSiparis, SEVKIYAT_EVRAKLARI, DOSYA_LISTE_KOLONLARI, dosyaninStorageUrlleriniTopla, depoDosyalariniTopluSil, yazmaHatasi } from "@/lib/supabase";
import { formatCurrency, formatDateTR } from "@/lib/cutoff-utils";
import { useRouter } from "next/navigation";
import { useToast } from "@/lib/toast-context";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { CokluNoKisa, cokluNoSatirlari } from "@/components/coklu-no-girisi";
import AppShell from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { CopyableField } from "@/components/copyable-field";
import { Search, ExternalLink, Archive, X, Package, Loader2, Trash2, FileText } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import EvrakOlusturButtons from "@/components/evrak-olustur-buttons";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { kalemMiktari } from "@/lib/sayi-oku";
import { siparisIlerlemesiHesapla, acikKalemler, SiparisIlerlemesi } from "@/lib/siparis-takip";
import { siparisTakipVerisiGetir } from "@/lib/siparis-takip-veri";
import { SiparisTakipKarti } from "@/components/siparis-takip-karti";

type DosyaWithRelations = Dosya & { rezervasyonlar: Rezervasyon[]; konteynerler: Konteyner[] };
type AnaSiparisWithProgress = AnaSiparis & { ilerleme: SiparisIlerlemesi };

export default function IhracatlarPage() {
  const { user, yetkiler, companyId, loading: authLoading } = useAuth();
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
  const [tamamlanacak, setTamamlanacak] = useState<AnaSiparisWithProgress | null>(null);
  const [tamamlaniyor, setTamamlaniyor] = useState(false);

  const SAYFA_BOYUTU = 50;
  const [dahaFazlaVar, setDahaFazlaVar] = useState(true);
  const [dahaFazlaYukleniyor, setDahaFazlaYukleniyor] = useState(false);
  const [aramaSonuclari, setAramaSonuclari] = useState<DosyaWithRelations[] | null>(null);
  const [aramaYukleniyor, setAramaYukleniyor] = useState(false);

  // Dosya satirlarina iliskili rezervasyon/konteyner verisini ekler. Sayfalama
  // ve arama akislarinin ikisi de bu ortak fonksiyonu kullanir.
  const zenginlestir = useCallback(async (dosyaList: Dosya[]): Promise<DosyaWithRelations[]> => {
    if (dosyaList.length === 0 || !companyId) return [];
    const dosyaIds = dosyaList.map((d) => d.id);
    const [{ data: rezData }, { data: kontData }] = await Promise.all([
      supabase.from("rezervasyonlar").select("*").eq("company_id", companyId).in("dosya_id", dosyaIds),
      supabase.from("konteynerler").select("*").eq("company_id", companyId).in("dosya_id", dosyaIds),
    ]);
    return dosyaList.map((d) => ({
      ...d,
      rezervasyonlar: (rezData || []).filter((r: Rezervasyon) => r.dosya_id === d.id),
      konteynerler: (kontData || []).filter((k: Konteyner) => k.dosya_id === d.id),
    }));
  }, [companyId]);

  // Arsiv sinirsiz buyuyebilecegi icin varsayilan olarak SADECE ilk sayfa
  // (en son kapanan SAYFA_BOYUTU dosya) cekilir. "Daha Fazla Yukle" ile
  // devami getirilir. Arama yapilirken ise asagidaki ayri efekt TUM
  // arsivde sunucu tarafinda arama yapar - sayfalama arama kapsamini
  // daraltmaz.
  const fetchDosyalar = useCallback(async () => {
    if (!user?.id || !companyId) return;
    setLoading(true);
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari")
      .select(DOSYA_LISTE_KOLONLARI)
      .eq("company_id", companyId)
      .or("durum.eq.Kapalı,durum.eq.Kapali")
      .order("olusturma_tarihi", { ascending: false })
      .range(0, SAYFA_BOYUTU - 1)
      .returns<Dosya[]>();

    if (!dosyaData || dosyaData.length === 0) { setDosyalar([]); setDahaFazlaVar(false); setLoading(false); return; }

    setDahaFazlaVar(dosyaData.length === SAYFA_BOYUTU);
    const enriched = await zenginlestir(dosyaData);
    setDosyalar(enriched);
    setLoading(false);
  }, [user?.id, companyId, zenginlestir]);

  const dahaFazlaYukle = useCallback(async () => {
    if (!companyId || dahaFazlaYukleniyor || !dahaFazlaVar) return;
    setDahaFazlaYukleniyor(true);
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari")
      .select(DOSYA_LISTE_KOLONLARI)
      .eq("company_id", companyId)
      .or("durum.eq.Kapalı,durum.eq.Kapali")
      .order("olusturma_tarihi", { ascending: false })
      .range(dosyalar.length, dosyalar.length + SAYFA_BOYUTU - 1)
      .returns<Dosya[]>();

    if (!dosyaData || dosyaData.length === 0) { setDahaFazlaVar(false); setDahaFazlaYukleniyor(false); return; }

    setDahaFazlaVar(dosyaData.length === SAYFA_BOYUTU);
    const enriched = await zenginlestir(dosyaData);
    setDosyalar((prev) => [...prev, ...enriched]);
    setDahaFazlaYukleniyor(false);
  }, [companyId, dosyalar.length, dahaFazlaVar, dahaFazlaYukleniyor, zenginlestir]);

  // Arama: varsayilan sayfali listeyi degil, TUM kapali arsivi sunucu
  // tarafinda tarar. Boylece kullanici henuz yuklenmemis eski bir dosyayi
  // de arayabilir.
  useEffect(() => {
    if (!search.trim() || !companyId) { setAramaSonuclari(null); return; }
    const zamanlayici = setTimeout(async () => {
      setAramaYukleniyor(true);
      const terim = `%${search.trim()}%`;
      const { data: dosyaData } = await supabase
        .from("ihracat_dosyalari")
        .select(DOSYA_LISTE_KOLONLARI)
        .eq("company_id", companyId)
        .or("durum.eq.Kapalı,durum.eq.Kapali")
        .or(`dosya_no.ilike.${terim},alici_firma.ilike.${terim},satici_firma.ilike.${terim},proforma_no.ilike.${terim},urun_tanimi.ilike.${terim},varis_limani.ilike.${terim},bl_no.ilike.${terim},marka.ilike.${terim}`)
        .order("olusturma_tarihi", { ascending: false })
        .limit(100)
        .returns<Dosya[]>();

      const enriched = await zenginlestir(dosyaData || []);
      setAramaSonuclari(enriched);
      setAramaYukleniyor(false);
    }, 300);
    return () => clearTimeout(zamanlayici);
  }, [search, companyId, zenginlestir]);

  const fetchAcikSiparisler = useCallback(async () => {
    if (!user?.id || !companyId) return;
    const { data: siparisler } = await supabase
      .from("ana_siparisler")
      .select("*")
      .eq("company_id", companyId)
      .order("olusturma_tarihi", { ascending: false });

    if (!siparisler || siparisler.length === 0) { setAcikSiparisler([]); setSiparisLoading(false); return; }

    // Marka/kalem bazli takip (07.10.2026, bkz. lib/siparis-takip.ts): bir
    // kalemdeki fazla digerinin eksigini kapatmaz; dosya kalemi baska bir
    // siparise etiketlenebilir. Okuma basarisizsa liste bos birakilmaz.
    const veri = await siparisTakipVerisiGetir(companyId, siparisler as AnaSiparis[]);
    if (!veri) { setSiparisLoading(false); return; }
    const withProgress: AnaSiparisWithProgress[] = (siparisler as AnaSiparis[]).map((s) => ({
      ...s,
      ilerleme: siparisIlerlemesiHesapla(s, veri.dosyalar, veri.konteynerler),
    }));

    // Elle tamamlanan siparis (03.10.2026) kalan miktardan bagimsiz listeden duser.
    const acikOlanlar = withProgress.filter((s) => !s.tamamlandi && s.ilerleme.devamEdiyor);
    setAcikSiparisler(acikOlanlar);
    setSiparisLoading(false);
  }, [user?.id, companyId]);

  useEffect(() => { fetchDosyalar(); fetchAcikSiparisler(); }, [fetchDosyalar, fetchAcikSiparisler]);

  useEffect(() => {
    // Yetkiler veritabanindan gelmeden karar verilmez: yuklenirken tum yetkiler
    // gecici olarak kapali gorunur ve tam yetkili kullanici bile sayfayi
    // yenileyince baska sayfaya atiliyordu (duzeltme: 01.10.2026). Hic sayfa
    // yetkisi yoksa yonlendirme yapilmaz - AppShell "Erisim yetkiniz yok"
    // ekranini gosterir (bkz. lib/yetki-utils.ts).
    if (authLoading) return;
    if (!yetkiler.sayfa_yetkileri.ihracatlar) {
      const hedef = ilkErisilebilirSayfa(yetkiler.sayfa_yetkileri);
      if (hedef) router.replace(hedef);
    }
  }, [authLoading, yetkiler, router]);

  const handleSipariseDevamEt = async (siparis: AnaSiparisWithProgress) => {
    if (!user || !companyId) return;
    setDevamEdiyor(siparis.id);
    try {
      // Ayni ana siparise bagli TUM dosyalari cek: hem kopyalanacak proforma
      // bilgileri icin ilk dosya, hem de "kalan urun kalemi" hesabi icin
      // hepsinin urun_detaylari'na ihtiyac var.
      const { data: bagliDosyalar } = await supabase
        .from("ihracat_dosyalari")
        .select("*")
        .eq("company_id", companyId)
        .eq("ana_siparis_id", siparis.id)
        .order("olusturma_tarihi", { ascending: true });

      const ornekDosya = (bagliDosyalar || [])[0] || null;
      // Yeni dosyanin kalemleri: siparisin HENUZ HICBIR DOSYADA OLMAYAN kismi,
      // marka/kalem bazli (lib/siparis-takip.ts). Guncel veriyle yeniden
      // hesaplanir; okunamazsa dosya acilmaz (yanlis miktarla dosya olusmasin).
      const veri = await siparisTakipVerisiGetir(companyId, [siparis]);
      if (!veri) throw new Error("Sipariş verisi okunamadı");
      const kalanKalemler = acikKalemler(siparisIlerlemesiHesapla(siparis, veri.dosyalar, veri.konteynerler));
      const kalanToplamTutar = kalanKalemler.reduce((s, u) => s + parseFloat(u.toplam_tutar_usd), 0);
      const kalanToplamMiktar = kalanKalemler.reduce((s, u) => s + parseFloat(u.miktar_mts), 0);

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
          // Ilk dosyanin varis limani duzeltme notu yeni dosyaya tasinmaz (03.10.2026)
          ham_veri: ornekDosya?.ham_veri ? (({ varis_limani_duzeltme: _atla, ...kalan }) => kalan)(ornekDosya.ham_veri as Record<string, unknown>) : null,
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
          urun_detaylari: kalanKalemler.length > 0 ? kalanKalemler : null,
          toplam_tutar: kalanKalemler.length > 0 ? kalanToplamTutar : null,
          miktar: kalanKalemler.length > 0 ? String(kalanToplamMiktar) : null,
          miktar_birimi: kalanKalemler.length > 0 ? "MTS" : null,
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

  // "Siparisi Tamamla" (talep: 03.10.2026): kucuk sevk farklari yuzunden bitmis
  // siparisler listede kaliyordu. Kayit SILINMEZ; sadece tamamlandi isaretlenir.
  const handleSiparisiTamamla = async () => {
    const siparis = tamamlanacak;
    if (!siparis || !companyId) return;
    setTamamlaniyor(true);
    const { data, error } = await supabase
      .from("ana_siparisler")
      .update({ tamamlandi: true, tamamlanma_tarihi: new Date().toISOString(), tamamlayan: user?.email || null })
      .eq("id", siparis.id)
      .eq("company_id", companyId)
      .select("id");
    setTamamlaniyor(false);
    setTamamlanacak(null);
    const hata = yazmaHatasi(error, data);
    if (hata) {
      showToast(`Sipariş tamamlanamadı: ${hata}`, "error");
      return;
    }
    showToast(`${siparis.proforma_no} siparişi tamamlandı.`, "success");
    fetchAcikSiparisler();
  };

  const filteredDosyalar = useMemo(() => {
    return aramaSonuclari !== null ? aramaSonuclari : dosyalar;
  }, [dosyalar, aramaSonuclari]);
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

    // SIRA ONEMLI (01.10.2026): once dosya URL'leri toplanir (kayit silinince
    // bagli konteyner/evrak satirlari CASCADE ile gider), sonra kayit silinir;
    // PDF'ler ancak kayit GERCEKTEN silindiyse storage'dan temizlenir.
    const storageUrlleri = await dosyaninStorageUrlleriniTopla(deleteTarget.id, companyId);
    const { data: silinen, error } = await supabase.from("ihracat_dosyalari").delete().eq("company_id", companyId).eq("id", deleteTarget.id).select("id");
    const silmeHatasi = yazmaHatasi(error, silinen);
    if (silmeHatasi) {
      showToast(`Dosya silinemedi: ${silmeHatasi}`, "error");
      setDeleteTarget(null);
      return;
    }
    await depoDosyalariniTopluSil(storageUrlleri);

    // Eger dosya bir ana siparise bagliysa, o ana siparise baska dosya kalip kalmadigini kontrol et
    if (anaSiparisId) {
      const { count, error: sayimHatasi } = await supabase
        .from("ihracat_dosyalari")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("ana_siparis_id", anaSiparisId);
      // Sayim okunamadiysa (count=null) bos sanilip silinmez (01.10.2026)
      if (!sayimHatasi && count === 0) {
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
      const toplam = urunler.reduce((s: number, u: any) => s + kalemMiktari(u), 0);
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

      <ConfirmDialog
        open={tamamlanacak !== null}
        onOpenChange={(open) => { if (!open && !tamamlaniyor) setTamamlanacak(null); }}
        title="Sipariş tamamlansın mı?"
        description={tamamlanacak
          ? `${tamamlanacak.proforma_no} (${tamamlanacak.alici_firma || "—"}) siparişi tamamlandı olarak işaretlenecek ve Devam Eden Siparişler listesinden kalkacak. Kalan ${tamamlanacak.ilerleme.toplamKalanMts.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} MTS sevk edilmemiş sayılacak. Dosyalar ve sipariş kaydı silinmez.`
          : ""}
        confirmLabel="Evet, Tamamla"
        cancelLabel="Vazgeç"
        onConfirm={handleSiparisiTamamla}
        loading={tamamlaniyor}
        loadingLabel="Kaydediliyor..."
      />

      <SayfaBasligi
        ikon={<Archive size={20} />}
        baslik="İhracatlar Arşivi"
        aciklama="Tamamlanmış dosyalar ve devam eden siparişleriniz"
        className="mb-6"
      />

      {!siparisLoading && acikSiparisler.length > 0 && (
        <div className="mb-8 space-y-3">
          <div className="flex items-center gap-2">
            <Package size={16} style={{ color: ACCENT }} />
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Devam Eden Siparişler</h2>
          </div>
          {acikSiparisler.map((s, idx) => (
            <SiparisTakipKarti
              key={s.id}
              siparis={s}
              ilerleme={s.ilerleme}
              sira={idx}
              devamEdiyor={devamEdiyor === s.id}
              onTamamla={() => setTamamlanacak(s)}
              onDevamEt={() => handleSipariseDevamEt(s)}
            />
          ))}
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

      {(loading || (search.trim() !== "" && aramaYukleniyor)) ? (
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
        <>
        <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                  <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Proforma No</th>
                  <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Müşteri</th>
                  <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Varış Limanı</th>
                  <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Teslim</th>
                  <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Ürün</th>
                  <th className="text-right px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Birim Fiyat</th>
                  <th className="text-right px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>MTS</th>
                  <th className="text-right px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Tutar</th>
                  <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Acente</th>
                  <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>BL No</th>
                  <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Marka</th>
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
                      <td className="px-2.5 py-2.5 text-xs font-medium whitespace-nowrap"><CokluNoKisa deger={d.proforma_no} style={{ color: ACCENT }} /></td>
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
        {aramaSonuclari === null && dahaFazlaVar && (
          <div className="flex justify-center mt-4">
            <button
              onClick={dahaFazlaYukle}
              disabled={dahaFazlaYukleniyor}
              className="px-4 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 hover:bg-white/5 transition-colors disabled:opacity-60"
              style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}
            >
              {dahaFazlaYukleniyor && <Loader2 size={14} className="animate-spin" />}
              {dahaFazlaYukleniyor ? "Yükleniyor..." : "Daha Fazla Yükle"}
            </button>
          </div>
        )}
        </>
      )}

      {selectedDosya && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 animate-fade-in" onClick={() => setSelectedDosya(null)} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-xl shadow-2xl z-50 overflow-y-auto animate-fade-in" style={{ backgroundColor: CARD_BG }}>
            <div className="sticky top-0 border-b px-6 py-4 flex items-center justify-between z-10" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
              <div>
                <p className="text-lg font-bold text-white">{selectedDosya.dosya_no}</p>
                <p className="text-xs" style={{ color: TEXT_MUTED }}>{formatDateTR(selectedDosya.olusturma_tarihi)}</p>
              </div>
              <div className="flex items-center gap-2">
                {/* Talep (26.09.2026): orijinal proforma PDF'ini goruntuleme - sadece
                    PDF'i storage'a kaydedilmis dosyalarda gorunur (26.09.2026 sonrasi
                    acilanlar). */}
                {selectedDosya.proforma_dosya_url && (
                  <a
                    href={selectedDosya.proforma_dosya_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:text-white"
                    style={{ backgroundColor: CARD_BORDER, color: TEXT_MUTED }}
                    title="Proformayı yeni sekmede aç"
                  >
                    <FileText size={12} /> Proformayı Görüntüle
                  </a>
                )}
                <button
                  onClick={() => router.push(`/dosya/${selectedDosya.id}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  <ExternalLink size={12} /> Tam Dosyayı Aç
                </button>
                <button onClick={() => setSelectedDosya(null)} className="p-1.5 hover:text-white transition-colors" style={{ color: TEXT_MUTED }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider mb-3 border-b pb-2" style={{ color: "white", borderColor: CARD_BORDER }}>Proforma Bilgileri</h3>
                <div className="grid grid-cols-2 gap-3">
                  <CopyableField dark label="Proforma No" value={selectedDosya.proforma_no} gosterim={cokluNoSatirlari(selectedDosya.proforma_no)} />
                  <CopyableField dark label="Proforma Tarihi" value={formatDateTR(selectedDosya.proforma_tarihi)} />
                  <CopyableField dark label="Alıcı Firma" value={selectedDosya.alici_firma} />
                  <CopyableField dark label="Satıcı Firma" value={selectedDosya.satici_firma} />
                  <CopyableField dark label="Varış Limanı" value={selectedDosya.varis_limani} />
                  <CopyableField dark label="Teslim Şekli" value={selectedDosya.teslim_sekli} />
                  <CopyableField dark label="Toplam Tutar" value={formatCurrency(selectedDosya.toplam_tutar, selectedDosya.para_birimi)} />
                  <CopyableField dark label="Marka" value={selectedDosya.marka} />
                  <CopyableField dark label="BL No" value={selectedDosya.bl_no} />
                  <CopyableField dark label="Beyanname No" value={selectedDosya.beyanname_no} />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider mb-3 border-b pb-2" style={{ color: "white", borderColor: CARD_BORDER }}>Evraklar</h3>
                <EvrakOlusturButtons dosya={selectedDosya} rezervasyonlar={selectedDosya.rezervasyonlar} konteynerler={selectedDosya.konteynerler} />
              </div>

              {selectedDosya.urun_detaylari && (selectedDosya.urun_detaylari as any[]).length > 0 && (
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider mb-3 border-b pb-2" style={{ color: "white", borderColor: CARD_BORDER }}>Ürünler</h3>
                  <div className="space-y-2">
                    {(selectedDosya.urun_detaylari as any[]).map((u: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg border" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
                        <p className="text-sm font-medium text-white">{u.urun_adi || u.description || "-"}</p>
                        <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
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
                <h3 className="text-sm font-bold uppercase tracking-wider mb-3 border-b pb-2" style={{ color: "white", borderColor: CARD_BORDER }}>Rezervasyon</h3>
                {selectedDosya.rezervasyonlar.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDosya.rezervasyonlar.map((rez) => (
                      <div key={rez.id} className="grid grid-cols-2 gap-3">
                        <CopyableField dark label="Booking No" value={rez.booking_no} />
                        <CopyableField dark label="Gemi Adı" value={rez.gemi_adi} />
                        <CopyableField dark label="Acente" value={rez.acente_ismi} />
                        <CopyableField dark label="Gemi Kalkış" value={rez.gemi_kalkis_tarihi ? formatDateTR(rez.gemi_kalkis_tarihi) : null} />
                        <CopyableField dark label="Konteyner Adedi" value={rez.konteyner_adedi?.toString()} />
                        <CopyableField dark label="Yükleme Limanı" value={rez.yuklenme_limani} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: TEXT_MUTED }}>Rezervasyon bilgisi bulunmuyor.</p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider mb-3 border-b pb-2" style={{ color: "white", borderColor: CARD_BORDER }}>
                  Konteynerler ({selectedDosya.konteynerler.length} adet)
                </h3>
                {selectedDosya.konteynerler.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                          <th className="text-left px-2 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Konteyner No</th>
                          <th className="text-left px-2 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Mühür</th>
                          <th className="text-left px-2 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Tip</th>
                          <th className="text-right px-2 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>VGM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDosya.konteynerler.map((k) => (
                          <tr key={k.id} className="border-b last:border-0" style={{ borderColor: CARD_BORDER }}>
                            <td className="px-2 py-2 text-sm font-mono text-white">{k.konteyner_no}</td>
                            <td className="px-2 py-2 text-sm font-mono" style={{ color: TEXT_MUTED }}>{k.muhur_no || "—"}</td>
                            <td className="px-2 py-2 text-sm" style={{ color: TEXT_MUTED }}>{k.tip}</td>
                            <td className="px-2 py-2 text-sm text-right font-medium" style={{ color: ACCENT }}>
                              {k.vgm_kg ? `${k.vgm_kg} KG` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: TEXT_MUTED }}>Konteyner bilgisi bulunmuyor.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
