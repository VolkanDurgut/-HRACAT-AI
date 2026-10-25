"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils";
import { supabase, UrunDetay, SEVKIYAT_EVRAKLARI, AnaSiparis, getGuvenliDosyaUrl, yazmaHatasi } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/cutoff-utils";
import { useToast } from "@/lib/toast-context";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import AppShell from "@/components/app-shell";
import AcenteTeklifSection from "@/components/acente-teklif-section";
import { Check, Loader2, Package, AlertCircle, FileUp } from "lucide-react";
import { ProformaAsistanYukleme, ProformaAsistanIlerleme, ProformaOkumaOzeti, AsistanAsamasi } from "@/components/proforma-asistan";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { kalemMiktari } from "@/lib/sayi-oku";
import { siparisIlerlemesiHesapla } from "@/lib/siparis-takip";
import { siparisTakipVerisiGetir } from "@/lib/siparis-takip-veri";
import { varisLimaniSorunu, turkiyeLimaniMi, VARIS_LIMANI_SORUN_METNI } from "@/lib/varis-limani-kontrol";

// 25.10.2026: sayfa "Proforma Yukle" (AI asistan gorunumu); adres ve yetki anahtari (yeni_dosya) degismedi.
type Step = "upload" | "reading" | "ana_siparis_check" | "success" | "reservation_choice" | "review";

/** PDF mi? Bazi Windows/tarayici birlesimlerinde dosya turu bos gelir -> uzantiya da bakilir. */
function pdfMi(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export default function YeniDosyaPage() {
  const { user, companyId, yetkiler, loading: authLoading } = useAuth(); // Global context'ten companyId alındı
  const router = useRouter();
  const { showToast } = useToast();
  const [step, setStep] = useState<Step>("upload");

  useEffect(() => {
    // Yetkiler veritabanindan gelmeden karar verilmez: yuklenirken tum yetkiler
    // gecici olarak kapali gorunur ve tam yetkili kullanici bile sayfayi
    // yenileyince baska sayfaya atiliyordu (duzeltme: 01.10.2026). Hic sayfa
    // yetkisi yoksa yonlendirme yapilmaz - AppShell "Erisim yetkiniz yok"
    // ekranini gosterir (bkz. lib/yetki-utils.ts).
    if (authLoading) return;
    if (!yetkiler.sayfa_yetkileri.yeni_dosya) {
      const hedef = ilkErisilebilirSayfa(yetkiler.sayfa_yetkileri);
      if (hedef) router.replace(hedef);
    }
  }, [authLoading, yetkiler, router]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dosyaId, setDosyaId] = useState<string | null>(null);
  const [dosyaNo, setDosyaNo] = useState<string | null>(null);
  // Asistan ilerlemesi: GERCEK adimlarda ilerler (suslu/sahte animasyon degil)
  const [asama, setAsama] = useState<AsistanAsamasi>("okuma");
  const [proformData, setProformData] = useState<any | null>(null);
  // Varis limani duzeltme notu (03.10.2026, bkz. varisLimaniniDogrula)
  const [varisLimaniNotu, setVarisLimaniNotuState] = useState<string | null>(null);
  // Ayni tik icinde createDosya cagrildiginda guncel notu okuyabilmek icin ref
  const varisLimaniNotuRef = useRef<string | null>(null);
  const setVarisLimaniNotu = (not: string | null) => { varisLimaniNotuRef.current = not; setVarisLimaniNotuState(not); };

  // Ana siparis state'leri
  const [mevcutAnaSiparis, setMevcutAnaSiparis] = useState<AnaSiparis | null>(null);
  const [gonderilmisMts, setGonderilmisMts] = useState<number>(0);
  const [yeniSiparisMts, setYeniSiparisMts] = useState<string>("");

  // Ayarlar > Ihracat Ayarlari'nda tanimli varsayilan DIIB No - yeni acilan
  // her dosyaya baslangic degeri olarak atanir (talep: 26.09.2026). Sadece
  // OKUMA yapar, o sayfadaki degeri degistirmez.
  const [varsayilanDiibNo, setVarsayilanDiibNo] = useState<string | null>(null);
  useEffect(() => {
    if (!companyId) return;
    supabase.from("companies").select("varsayilan_diib_no").eq("id", companyId).single()
      .then(({ data }) => setVarsayilanDiibNo((data as any)?.varsayilan_diib_no || null));
  }, [companyId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && pdfMi(file) && file.size <= 20 * 1024 * 1024) {
      setPdfFile(file);
      setError(null);
    } else {
      setError("Lütfen 20MB'den küçük bir PDF dosyası yükleyin.");
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && pdfMi(file) && file.size <= 20 * 1024 * 1024) {
      setPdfFile(file);
      setError(null);
    } else {
      setError("Lütfen 20MB'den küçük bir PDF dosyası yükleyin.");
    }
  }, []);

  const getProformaMts = (extracted: any): number => {
    if (extracted.urun_detaylari && extracted.urun_detaylari.length > 0) {
      return extracted.urun_detaylari.reduce((s: number, u: any) => s + kalemMiktari(u), 0);
    }
    return parseFloat(String(extracted.toplam_miktar || extracted.miktar || 0));
  };

  const handleUpload = async () => {
    if (!pdfFile || !user) return;
    setLoading(true);
    setError(null);
    setVarisLimaniNotu(null);
    setStep("reading");
    setAsama("okuma");

    let okumaBasarisiz = false;
    try {
      let extracted: any = null;
      try {
        const formData = new FormData();
        formData.append("file", pdfFile);
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${supabaseUrl}/functions/v1/proforma-oku`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.satici_firma) extracted = data;
        }
      } catch {
        // Backend not available
      }

      if (!extracted) {
        okumaBasarisiz = true;
        throw new Error("PDF okunamadı.");
      }

      setAsama("liman");
      extracted = await varisLimaniniDogrula(extracted);
      setProformData(extracted);

      // Ayni proforma_no'ya sahip ve AYNI ŞİRKETE ait bir ana siparis var mi kontrol et
      setAsama("siparis");
      if (extracted.proforma_no) {
        const { data: existingAnaSiparis } = await supabase
          .from("ana_siparisler")
          .select("*")
          .eq("proforma_no", extracted.proforma_no)
          .eq("company_id", companyId) // Şirket izolasyon filtresi eklendi
          .maybeSingle();

        if (existingAnaSiparis) {
          // Mevcut siparisin sevk edilen miktari - Devam Eden Siparisler ile
          // AYNI hesap (marka/kalem bazli, etiketli kalemler dahil:
          // lib/siparis-takip.ts). Okunamazsa 0 gosterilir.
          const veri = await siparisTakipVerisiGetir(companyId!, [existingAnaSiparis]);
          const toplamGonderilmis = veri
            ? siparisIlerlemesiHesapla(existingAnaSiparis, veri.dosyalar, veri.konteynerler).toplamSevkMts
            : 0;

          setMevcutAnaSiparis(existingAnaSiparis);
          setGonderilmisMts(toplamGonderilmis);
          setStep("ana_siparis_check");
          setLoading(false);
          return;
        } else {
          // Yeni ana siparis icin onerilen MTS degerini hazirla
          setYeniSiparisMts(getProformaMts(extracted).toString());
          setStep("ana_siparis_check");
          setLoading(false);
          return;
        }
      }

      // proforma_no yoksa direkt dosya olustur (ana siparis baglanmadan)
      setAsama("dosya");
      await createDosya(extracted, null);
    } catch {
      if (okumaBasarisiz) {
        setError("Proforma okunamadı. Dosyanın proformanın kendisi olduğundan (taranmış resim değil, metin içeren PDF) emin olup tekrar deneyin.");
        showToast("Proforma okunamadı.", "error");
      } else {
        setError("Dosya oluşturulurken hata oluştu. Lütfen tekrar deneyin.");
        showToast("Dosya oluşturulurken hata oluştu.", "error");
      }
      setStep("upload");
      setLoading(false);
    }
  };

  /**
   * Varis limani dogrulamasi (kural: 03.10.2026 - "Varis limani yukleme limani
   * ile ayni olamaz"). FOB proformada "FOB Ambarli Port" gibi yazan liman
   * YUKLEME limanidir; okuma bunu varis limanina yazabiliyor (IHR-2026-0076).
   * Varis limani bos / yukleme limaniyla ayni / bir Turkiye limaniysa:
   *  - Turkiye limani ve yukleme limani bossa, o deger yukleme limanina tasinir
   *  - ayni musterinin (alici_firma) en son GECERLI varis limani kullanilir
   *  - bulunamazsa bos birakilir; her durumda kullaniciya uyari gosterilir
   */
  const varisLimaniniDogrula = async (extracted: any) => {
    setVarisLimaniNotu(null);
    const yukleme = extracted.yuklenme_limani || extracted.yukleme_limani || "";
    const sorun = varisLimaniSorunu(extracted.varis_limani, [yukleme]);
    if (!sorun) return extracted;
    const duzeltilmis = { ...extracted };
    const okunan = (extracted.varis_limani || "").trim();
    if (okunan && !yukleme && turkiyeLimaniMi(okunan)) duzeltilmis.yuklenme_limani = okunan;
    let onceki: { varis_limani: string | null; yuklenme_limani: string | null; dosya_no: string } | undefined;
    if (extracted.alici_firma && companyId) {
      const { data } = await supabase
        .from("ihracat_dosyalari")
        .select("dosya_no, varis_limani, yuklenme_limani")
        .eq("company_id", companyId)
        .ilike("alici_firma", String(extracted.alici_firma).trim())
        .order("olusturma_tarihi", { ascending: false })
        .limit(20);
      onceki = (data || []).find((d: any) => !varisLimaniSorunu(d.varis_limani, [d.yuklenme_limani, duzeltilmis.yuklenme_limani]));
    }
    const sebep = VARIS_LIMANI_SORUN_METNI[sorun];
    // Denetim izi: proformadan okunan ham deger ham_veri'de saklanir
    duzeltilmis.varis_limani_duzeltme = { okunan: okunan || null, sorun, kaynak_dosya: onceki?.dosya_no || null };
    if (onceki?.varis_limani) {
      duzeltilmis.varis_limani = onceki.varis_limani;
      setVarisLimaniNotu(`${sebep} Proformadan okunan "${okunan || "—"}" yerine müşterinin önceki dosyasındaki (${onceki.dosya_no}) varış limanı "${onceki.varis_limani}" yazıldı. Lütfen Lojistik kartından kontrol edin.`);
    } else {
      duzeltilmis.varis_limani = null;
      setVarisLimaniNotu(`${sebep} Proformadan okunan "${okunan || "—"}" kullanılmadı ve müşterinin önceki dosyası bulunamadı. Varış limanını dosyadaki Lojistik kartından girin.`);
    }
    return duzeltilmis;
  };

  const createDosya = async (extracted: any, anaSiparisId: string | null) => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error: dbError } = await supabase
        .from("ihracat_dosyalari")
        .insert({
          company_id: companyId, // Yeni oluşturulan dosya şirkete zimmetlendi
          satici_firma: extracted.satici_firma,
          alici_firma: extracted.alici_firma,
          urun_tanimi: extracted.urun_detaylari?.map((u: any) => u.description || u.urun_adi).join(", ") || "-",
          proforma_no: extracted.proforma_no,
          proforma_tarihi: extracted.proforma_tarihi,
          gecerlilik_tarihi: extracted.gecerlilik_tarihi,
          lot_no: extracted.lot_no || extracted.proforma_no,
          marka: extracted.marka || null,
          toplam_tutar: extracted.toplam_tutar,
          para_birimi: extracted.para_birimi || "USD",
          odeme_sekli: extracted.odeme_sekli,
          yuklenme_limani: extracted.yuklenme_limani || extracted.yukleme_limani,
          varis_limani: extracted.varis_limani,
          teslim_sekli: extracted.teslim_sekli,
          miktar: String(extracted.toplam_miktar || extracted.miktar || ""),
          miktar_birimi: extracted.miktar_birimi || "MTS",
          ambalaj: extracted.ambalaj,
          alici_adresi: extracted.alici_adresi || null,
          detayli_ambalaj: extracted.detayli_ambalaj || null,
          hesap_adi: extracted.hesap_adi || null,
          banka: extracted.banka || null,
          swift: extracted.swift || null,
          hesap_numarasi: extracted.hesap_numarasi || null,
          iban: extracted.iban || null,
          // Ayarlar > Ihracat Ayarlari'ndaki sabit deger - dosya bazinda Ek
          // Bilgiler'den sonradan degistirilebilir, burasi sadece baslangic
          // degeridir (talep: 26.09.2026).
          diib_no: varsayilanDiibNo,
          ham_veri: extracted as unknown as Record<string, unknown>,
          urun_detaylari: extracted.urun_detaylari || [],
          sevkiyat_evraklari: extracted.sevkiyat_evraklari?.length ? extracted.sevkiyat_evraklari : SEVKIYAT_EVRAKLARI,
          durum: "Açık",
          created_by: user.id,
          ana_siparis_id: anaSiparisId,
        })
        .select("id, dosya_no")
        .single();

      if (dbError) throw dbError;
      setDosyaId(data.id);
      setDosyaNo((data as { dosya_no?: string | null }).dosya_no || null);

      // Orijinal proforma PDF'ini storage'a yukle (talep: 26.09.2026 - "Proforma
      // Goruntule/Incele" butonu icin). BEST-EFFORT: basarisiz olsa bile dosya
      // olusturma akisini DURDURMAZ, sadece o dosya icin goruntuleme butonu
      // gorunmez kalir - ana islem (dosya kaydi) her zaman onceliklidir.
      let proformaSaklanamadi = false;
      if (pdfFile) {
        try {
          const guvenliAd = pdfFile.name
            .normalize("NFD").replace(/[̀-ͯ]/g, "")
            .replace(/ş/gi, "s").replace(/ğ/gi, "g").replace(/ı/gi, "i")
            .replace(/ö/gi, "o").replace(/ü/gi, "u").replace(/ç/gi, "c")
            .replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${data.id}/proforma/${Date.now()}_${guvenliAd}`;
          const { error: uploadError } = await supabase.storage.from("konsimento-talimatlari").upload(path, pdfFile);
          if (uploadError) {
            proformaSaklanamadi = true;
          } else {
            const proformaUrl = await getGuvenliDosyaUrl("konsimento-talimatlari", path);
            const { data: yazilan, error: yazmaError } = await supabase.from("ihracat_dosyalari")
              .update({ proforma_dosya_url: proformaUrl, proforma_dosya_adi: pdfFile.name })
              .eq("id", data.id).eq("company_id", companyId)
              .select("id");
            if (yazmaHatasi(yazmaError, yazilan)) {
              proformaSaklanamadi = true;
              // Kayda baglanamayan PDF depoda sahipsiz kalmasin
              await supabase.storage.from("konsimento-talimatlari").remove([path]);
            }
          }
        } catch {
          proformaSaklanamadi = true;
        }
      }
      // Ikincil islem: dosya olusturma akisini durdurmaz ama artik sessiz
      // gecilmez - kullanici "Proformayi Goruntule" butonunun neden
      // olmadigini bilir (01.10.2026).
      if (proformaSaklanamadi) {
        showToast("Dosya oluşturuldu ancak proforma PDF'i arşive kaydedilemedi.", "error");
      }

      setStep("success");
      showToast("Dosya oluşturuldu!", "success");
      if (varisLimaniNotuRef.current) showToast(varisLimaniNotuRef.current, "error");
      setTimeout(() => setStep("reservation_choice"), 1500);
    } catch {
      setError("Dosya oluşturulurken hata oluştu. Lütfen tekrar deneyin.");
      showToast("Dosya oluşturulurken hata oluştu.", "error");
      setStep("upload");
    } finally {
      setLoading(false);
    }
  };

  const handleDevamEt = async () => {
    if (!mevcutAnaSiparis || !proformData) return;
    await createDosya(proformData, mevcutAnaSiparis.id);
  };

  const handleYeniAnaSiparisOlustur = async () => {
    if (!proformData || !user) return;
    const toplamMts = parseFloat(yeniSiparisMts) || getProformaMts(proformData);
    setLoading(true);
    try {
      const { data: yeniAnaSiparis, error: anaSiparisError } = await supabase
        .from("ana_siparisler")
        .insert({
          company_id: companyId, // Yeni ana sipariş şirkete zimmetlendi
          proforma_no: proformData.proforma_no,
          alici_firma: proformData.alici_firma,
          urun_tanimi: proformData.urun_detaylari?.map((u: any) => u.description || u.urun_adi).join(", ") || "-",
          toplam_mts: toplamMts,
          para_birimi: proformData.para_birimi || "USD",
          urun_detaylari_master: proformData.urun_detaylari || null,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (anaSiparisError) throw anaSiparisError;
      await createDosya(proformData, yeniAnaSiparis.id);
    } catch {
      showToast("Ana sipariş oluşturulurken hata oluştu.", "error");
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <SayfaBasligi
        ikon={<FileUp size={20} />}
        baslik="Proforma Yükle"
        aciklama="Proformayı yükleyin; İhracat AI belgeyi okuyup ihracat dosyanızı oluştursun."
        className="mb-6"
      />

      <div className="max-w-4xl">
        {error && (
          <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 rounded-xl text-sm mb-4" role="alert">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {step === "upload" && (
          <ProformaAsistanYukleme
            dosya={pdfFile}
            mesgul={loading}
            onDrop={handleDrop}
            onSec={handleFileSelect}
            onTemizle={() => { setPdfFile(null); setError(null); const i = document.getElementById("pdf-input") as HTMLInputElement | null; if (i) i.value = ""; }}
            onBaslat={handleUpload}
          />
        )}

        {step === "reading" && (
          <ProformaAsistanIlerleme dosyaAdi={pdfFile?.name || "proforma.pdf"} asama={asama} />
        )}

        {step === "ana_siparis_check" && proformData && (
          <ProformaOkumaOzeti veri={proformData} toplamMts={getProformaMts(proformData)} uyari={varisLimaniNotu} />
        )}

        {step === "ana_siparis_check" && proformData && (
          <div className="rounded-xl border shadow-sm p-5 sm:p-8 animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            {mevcutAnaSiparis ? (
              <>
                <div className="flex items-start gap-3 mb-5">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
                    <Package size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Mevcut sipariş bulundu</h3>
                    <p className="text-sm mt-0.5" style={{ color: TEXT_MUTED }}>
                      <span className="font-medium">{mevcutAnaSiparis.proforma_no}</span> numaralı proformaya ait bir sipariş zaten kayıtlı.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-5">
                  <div className="p-3 rounded-lg border" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
                    <p className="text-xs" style={{ color: TEXT_MUTED }}>Toplam Taahhüt</p>
                    <p className="text-lg font-bold text-white">{mevcutAnaSiparis.toplam_mts?.toLocaleString("tr-TR")} MTS</p>
                  </div>
                  <div className="p-3 rounded-lg border" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
                    <p className="text-xs" style={{ color: TEXT_MUTED }}>Gönderilmiş</p>
                    <p className="text-lg font-bold text-green-400">{gonderilmisMts.toLocaleString("tr-TR")} MTS</p>
                  </div>
                  <div className="p-3 rounded-lg border bg-amber-500/10" style={{ borderColor: "rgba(251,191,36,0.35)" }}>
                    <p className="text-xs text-amber-400">Kalan</p>
                    <p className="text-lg font-bold text-amber-300">{Math.max(0, (mevcutAnaSiparis.toplam_mts || 0) - gonderilmisMts).toLocaleString("tr-TR")} MTS</p>
                  </div>
                </div>

                <p className="text-sm mb-5" style={{ color: TEXT_MUTED }}>
                  Bu yeni dosyayı (<strong className="text-white">{getProformaMts(proformData).toLocaleString("tr-TR")} MTS</strong>) bu siparişin devamı olarak eklemek mi istiyorsunuz?
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={handleDevamEt}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-lg text-white font-medium text-sm transition-all hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    style={{ backgroundColor: ACCENT }}
                  >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    Evet, Siparişin Devamı
                  </button>
                  <button
                    onClick={() => createDosya(proformData, null)}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-lg font-medium text-sm border hover:bg-white/5 transition-all disabled:opacity-50"
                    style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}
                  >
                    Hayır, Bağımsız Dosya
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3 mb-5">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
                    <AlertCircle size={20} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Yeni sipariş takibi başlatılsın mı?</h3>
                    <p className="text-sm mt-0.5" style={{ color: TEXT_MUTED }}>
                      Bu proforma kısmi sevkiyatlarla (10+10+5 gibi) gönderilecekse, toplam taahhüt miktarını kaydedip takip edebiliriz.
                    </p>
                  </div>
                </div>

                <div className="mb-5">
                  <label className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Toplam Taahhüt Edilen Miktar (MTS)</label>
                  <div className="relative w-40">
                    <input
                      type="number"
                      value={yeniSiparisMts}
                      onChange={(e) => setYeniSiparisMts(e.target.value)}
                      className="w-full px-3 py-2 pr-12 border rounded-lg text-sm text-white"
                      style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium pointer-events-none" style={{ color: TEXT_MUTED }}>MTS</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleYeniAnaSiparisOlustur}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-lg text-white font-medium text-sm transition-all hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    style={{ backgroundColor: ACCENT }}
                  >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    Sipariş Takibini Başlat
                  </button>
                  <button
                    onClick={() => createDosya(proformData, null)}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-lg font-medium text-sm border hover:bg-white/5 transition-all disabled:opacity-50"
                    style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}
                  >
                    Hayır, Tek Seferlik Dosya
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "success" && (
          <div className="rounded-xl border shadow-sm p-10 sm:p-12 text-center animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: `${ACCENT}1F`, boxShadow: `0 0 0 6px ${ACCENT}0F` }}>
              <Check size={28} style={{ color: ACCENT }} />
            </div>
            <p className="text-white font-semibold">İhracat dosyası oluşturuldu{dosyaNo ? ` · ${dosyaNo}` : ""}</p>
            <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>Sıradaki adımlar hazırlanıyor…</p>
          </div>
        )}

        {step === "reservation_choice" && (
          <div className="space-y-4 animate-fade-up">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ backgroundColor: `${ACCENT}0F`, borderColor: `${ACCENT}4D` }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <Check size={18} className="shrink-0" style={{ color: ACCENT }} />
                <p className="text-sm text-white">
                  <span className="font-semibold">İhracat dosyası oluşturuldu{dosyaNo ? ` · ${dosyaNo}` : ""}.</span>
                  <span style={{ color: TEXT_MUTED }}> Sırada rezervasyon ya da navlun teklifi var.</span>
                </p>
              </div>
              <button
                onClick={() => router.push(`/dosya/${dosyaId}`)}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5 transition-colors text-white"
                style={{ borderColor: CARD_BORDER }}
              >
                Dosyayı Görüntüle
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div className="rounded-xl border shadow-sm p-6" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <h3 className="font-semibold text-white mb-1">Rezervasyon Ekle</h3>
                <p className="text-sm mb-4" style={{ color: TEXT_MUTED }}>Booking no, cut-off tarihleri ve yükleme bilgilerini girin.</p>
                <button
                  onClick={() => router.push(`/dosya/${dosyaId}?tab=rezervasyon&action=new`)}
                  className="w-full py-2.5 rounded-lg text-white font-medium text-sm transition-all hover:opacity-90"
                  style={{ backgroundColor: ACCENT }}
                >
                  Rezervasyon Ekle
                </button>
              </div>

              <div className="rounded-xl border shadow-sm p-6" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <h3 className="font-semibold text-white mb-1">Acentelerden Teklif Al</h3>
                <p className="text-sm mb-4" style={{ color: TEXT_MUTED }}>Kayıtlı acentelerinize freight teklifi isteyin.</p>
                <AcenteTeklifSection dosyaId={dosyaId!} proformData={proformData} userId={user!.id} companyId={companyId!} />
              </div>
            </div>
          </div>
        )}

        {step === "review" && proformData && (
          <div className="space-y-6 animate-fade-up">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div className="rounded-xl border shadow-sm p-6 space-y-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <h3 className="font-semibold text-sm" style={{ color: "white" }}>Satıcı & Alıcı Bilgileri</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Satıcı Firma</p><p className="font-medium text-white">{proformData.satici_firma}</p></div>
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Alıcı Firma</p><p className="font-medium text-white">{proformData.alici_firma}</p></div>
                </div>
                <h3 className="font-semibold text-sm pt-2" style={{ color: "white" }}>Proforma Bilgileri</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Proforma No</p><p className="font-medium text-white">{proformData.proforma_no}</p></div>
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Proforma Tarihi</p><p className="font-medium text-white">{proformData.proforma_tarihi}</p></div>
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Geçerlilik Tarihi</p><p className="font-medium text-white">{proformData.gecerlilik_tarihi}</p></div>
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Lot No</p><p className="font-medium text-white">{proformData.lot_no}</p></div>
                </div>
                <h3 className="font-semibold text-sm pt-2" style={{ color: "white" }}>Finansal</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Toplam Tutar</p><p className="font-medium text-white">{formatCurrency(proformData.toplam_tutar, proformData.para_birimi)}</p></div>
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Toplam Miktar</p><p className="font-medium text-white">{proformData.toplam_miktar || proformData.miktar} {proformData.miktar_birimi}</p></div>
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Ambalaj</p><p className="font-medium text-white">{proformData.ambalaj}</p></div>
                </div>
              </div>

              <div className="rounded-xl border shadow-sm p-6 space-y-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <h3 className="font-semibold text-sm" style={{ color: "white" }}>Lojistik</h3>
                {varisLimaniNotu && (
                  <p className="text-xs rounded-lg border px-3 py-2" style={{ color: "#FCD34D", borderColor: "rgba(245,158,11,0.3)", backgroundColor: "rgba(245,158,11,0.08)" }}>{varisLimaniNotu}</p>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Varış Limanı</p><p className="font-medium text-white">{proformData.varis_limani || "—"}</p></div>
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Yükleme Limanı</p><p className="font-medium text-white">{proformData.yuklenme_limani || proformData.yukleme_limani}</p></div>
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Teslim Şekli</p><p className="font-medium text-white">{proformData.teslim_sekli}</p></div>
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Ödeme Şekli</p><p className="font-medium text-white">{proformData.odeme_sekli}</p></div>
                </div>
                <h3 className="font-semibold text-sm pt-2" style={{ color: "white" }}>Banka Bilgileri</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Hesap Adı</p><p className="font-medium text-white">{proformData.banka_bilgileri?.hesap_adi || proformData.hesap_adi}</p></div>
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Banka</p><p className="font-medium text-white">{proformData.banka_bilgileri?.banka_adi || proformData.banka}</p></div>
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>SWIFT</p><p className="font-medium text-white">{proformData.banka_bilgileri?.swift || proformData.swift}</p></div>
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>Hesap Numarası</p><p className="font-medium text-white">{proformData.banka_bilgileri?.hesap_numarasi || proformData.hesap_numarasi}</p></div>
                  <div><p className="text-xs" style={{ color: TEXT_MUTED }}>IBAN</p><p className="font-medium text-white break-all">{proformData.banka_bilgileri?.iban || proformData.iban}</p></div>
                </div>
              </div>
            </div>

            {proformData.urun_detaylari && proformData.urun_detaylari.length > 0 && (
              <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <div className="px-6 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
                  <h3 className="font-semibold text-sm" style={{ color: "white" }}>Ürün Detayları</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                        <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Ürün Adı</th>
                        <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Ambalaj</th>
                        <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Miktar (MTS)</th>
                        <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Birim Fiyat</th>
                        <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Toplam</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proformData.urun_detaylari.map((item: any, i: number) => (
                        <tr key={i} className="border-b last:border-0" style={{ borderColor: CARD_BORDER }}>
                          <td className="px-4 py-3 text-sm text-white">{item.description || item.urun_adi}</td>
                          <td className="px-4 py-3 text-sm" style={{ color: TEXT_MUTED }}>{item.packaging_size || item.ambalaj_boyutu}</td>
                          <td className="px-4 py-3 text-sm text-right" style={{ color: TEXT_MUTED }}>{item.quantity || item.miktar_mts}</td>
                          <td className="px-4 py-3 text-sm text-right" style={{ color: TEXT_MUTED }}>{formatCurrency(item.unit_price || item.birim_fiyat_usd, proformData.para_birimi)}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-white">{formatCurrency(item.total_amount || item.toplam_tutar_usd, proformData.para_birimi)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                        <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-right" style={{ color: "white" }}>TOPLAM</td>
                        <td className="px-4 py-3 text-sm font-bold text-right" style={{ color: ACCENT }}>
                          {formatCurrency(proformData.urun_detaylari.reduce((s: number, u: any) => s + parseFloat(String(u.total_amount || u.toplam_tutar_usd || 0)), 0), proformData.para_birimi)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => router.push(`/dosya/${dosyaId}`)}
                className="px-6 py-2.5 rounded-lg text-white font-medium text-sm transition-all hover:opacity-90"
                style={{ backgroundColor: ACCENT }}
              >
                Dosyayı Görüntüle
              </button>
              <button
                onClick={() => router.push("/panel")}
                className="px-6 py-2.5 rounded-lg font-medium text-sm border hover:bg-white/5 transition-all"
                style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}
              >
                Ana Panele Dön
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
