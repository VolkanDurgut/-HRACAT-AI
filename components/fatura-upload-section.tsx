"use client";
import React, { useCallback, useEffect, useState } from "react";
import { supabase, Dosya, Rezervasyon, Konteyner, getGuvenliDosyaUrl, yazmaHatasi, eskiDepoDosyasiniSil } from "@/lib/supabase";
import { formatDateTR, formatDateTimeTR } from "@/lib/cutoff-utils";
import {
  FileText, CheckCircle2, AlertTriangle, X, RotateCcw, Banknote, FileType2, ExternalLink, Split
} from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { EvrakAsistanYukleme, EvrakAsistanKilitli, EvrakAsistanIsleniyor } from "@/components/evrak-asistan";
import { Hash, CalendarDays, Coins, Scale, Container } from "lucide-react";
import { faturaKarsilastir, faturaMetniOku, pdfMetni, type FaturaBeklenen, type FaturaKontrolSonucu } from "@/lib/fatura-oku";
import { faturaBolunmesi, parcaAgirliklari } from "@/lib/diib/bolunme-talimat";
import { diibAnahtari } from "@/lib/diib/hesap";
import { DIIB_BOLUNME_OLAYI } from "@/lib/diib/veri";

// 28.10.2026: AI asistan gorunumu (components/evrak-asistan.tsx); is mantigi degismedi.
// 05.11.2026 (kullanici: "masrafsiz ve dogru okutamaz miyiz?"): fatura ONCE PDF metninden kurallarla
// okunur (lib/fatura-oku.ts, ucretsiz); metin okunamazsa eski yapay zeka kontrolu (fatura-kontrol) calisir.
// 05.11.2026 (kullanici: "DIIB dagiliminda 2 fatura yuklemek durumundayiz"): bolunmus yuklemede her
// parcaya AYRI fatura yuklenir (diib_dosya_bolunmeleri.fatura_*); 1. parca dosyanin fatura_* alanlarina
// da yazilir (panel / raporlar / DIIB eskisi gibi). Bolunmus faturada dosyanin DIIB No'su DEGISMEZ.
const FATURA_YETENEKLERI = [
  { ikon: <Hash size={11} />, metin: "Fatura no" },
  { ikon: <CalendarDays size={11} />, metin: "Fatura tarihi" },
  { ikon: <FileText size={11} />, metin: "DİİB no" },
  { ikon: <Coins size={11} />, metin: "Tutar ve para birimi" },
  { ikon: <Scale size={11} />, metin: "Net / brüt ağırlık" },
  { ikon: <Container size={11} />, metin: "Konteynerler" },
];

type Props = {
  dosya: Dosya;
  konteynerler: Konteyner[];
  rezervasyonlar: Rezervasyon[];
  onRefresh: () => void;
  companyId: string; // SaaS: şirket bazlı izolasyon
};

/** diib_dosya_bolunmeleri satiri + DIIB belge no (bolunmus yuklemenin bir faturasi). */
type FaturaParcasiKaydi = {
  id: string; sira: number; diib_id: string; miktar_kg: number | string; fatura_no: string | null;
  fatura_tarihi: string | null; fatura_dosya_url: string | null; fatura_dosya_adi: string | null;
  fatura_yukleme_tarihi: string | null; fatura_kontrol_sonucu: FaturaKontrolSonucu | null;
  belge_no: string; belge_tarihi: string | null;
};

const guvenliAd = (ad: string) => ad
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/ş/gi, "s").replace(/ğ/gi, "g").replace(/ı/gi, "i")
  .replace(/ö/gi, "o").replace(/ü/gi, "u").replace(/ç/gi, "c")
  .replace(/[^a-zA-Z0-9._-]/g, "_");
const pdfMi = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const para = (n: number, pb: string | null) => `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${pb || ""}`.trim();

export default function FaturaUploadSection({ dosya, konteynerler, rezervasyonlar, onRefresh, companyId }: Props) {
  const [faturaYukleniyor, setFaturaYukleniyor] = useState(false);
  const [faturaHata, setFaturaHata] = useState<string | null>(null);
  const [parcalar, setParcalar] = useState<FaturaParcasiKaydi[]>([]);
  const [parcaIslem, setParcaIslem] = useState<string | null>(null); // yuklenen parca id
  const [parcaHata, setParcaHata] = useState<Record<string, string>>({});

  const faturaKontrolSonucu = dosya.fatura_kontrol_sonucu as FaturaKontrolSonucu | null;

  const rezervasyonKontAdedi = rezervasyonlar.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
  const eklenenKonteynerAdedi = konteynerler.length;
  const konteynerlerTamam = rezervasyonKontAdedi > 0 && eklenenKonteynerAdedi >= rezervasyonKontAdedi;
  const toplamNet = konteynerler.reduce((s, k) => s + (Number(k.net_agirlik_kg) || 0), 0);
  const toplamBrut = konteynerler.reduce((s, k) => s + (Number((k as any).brut_agirlik_kg) || 0), 0);
  const toplamKap = konteynerler.reduce((s, k) => s + (Number((k as any).pieces) || 0), 0);

  // Bolunme (2+ parca) varsa her parcaya ayri fatura. Okunamazsa (yetki / ag) tek fatura gorunumu kalir.
  const parcalariGetir = useCallback(async () => {
    const bo = await supabase.from("diib_dosya_bolunmeleri")
      .select("id, sira, diib_id, miktar_kg, fatura_no, fatura_tarihi, fatura_dosya_url, fatura_dosya_adi, fatura_yukleme_tarihi, fatura_kontrol_sonucu")
      .eq("company_id", companyId).eq("dosya_id", dosya.id).order("sira");
    if (bo.error || !bo.data || bo.data.length < 2) { setParcalar([]); return; }
    const ids = Array.from(new Set(bo.data.map((x) => x.diib_id as string)));
    const b = await supabase.from("diib_belgeleri").select("id, belge_no, belge_tarihi").eq("company_id", companyId).in("id", ids);
    if (b.error || !b.data) { setParcalar([]); return; }
    const belge = new Map(b.data.map((x) => [x.id as string, x as { belge_no: string; belge_tarihi: string | null }]));
    setParcalar(bo.data.map((x) => ({ ...(x as unknown as FaturaParcasiKaydi), belge_no: belge.get(x.diib_id as string)?.belge_no ?? "-", belge_tarihi: belge.get(x.diib_id as string)?.belge_tarihi ?? null })));
  }, [companyId, dosya.id]);
  useEffect(() => {
    parcalariGetir();
    const dinle = () => parcalariGetir();
    window.addEventListener(DIIB_BOLUNME_OLAYI, dinle);
    return () => window.removeEventListener(DIIB_BOLUNME_OLAYI, dinle);
  }, [parcalariGetir, dosya.fatura_no]);
  const bolunmus = parcalar.length >= 2;

  const buildFaturaSistemVerisi = (parca?: { kg: number; brut: number | null; kap: number | null; tutar: number }) => {
    const rez = rezervasyonlar[0];
    return {
      satici_firma: dosya.satici_firma,
      alici_firma: dosya.alici_firma,
      urun_tanimi: dosya.urun_tanimi,
      toplam_tutar: parca ? parca.tutar : dosya.toplam_tutar,
      para_birimi: dosya.para_birimi,
      proforma_no: dosya.proforma_no,
      gemi_adi: rez?.gemi_adi,
      yukleme_limani: rez?.yuklenme_limani || dosya.yuklenme_limani,
      varis_limani: dosya.varis_limani,
      diib_no: dosya.diib_no,
      diib_tarihi: dosya.diib_tarihi,
      toplam_net_kg: parca ? parca.kg : toplamNet > 0 ? toplamNet : null,
      toplam_brut_kg: parca ? parca.brut : toplamBrut > 0 ? toplamBrut : null,
      toplam_kap_adeti: parca ? parca.kap : toplamKap > 0 ? toplamKap : null,
      konteynerler: konteynerler.map((k) => ({
        konteyner_no: k.konteyner_no,
        net_agirlik_kg: k.net_agirlik_kg,
        brut_agirlik_kg: (k as any).brut_agirlik_kg,
        kap_adeti: (k as any).pieces
      })),
    };
  };

  /**
   * Faturayi okur ve kontrol eder: once PDF metni (ucretsiz, kurallarla); fatura no okunamazsa
   * yapay zeka (fatura-kontrol). Sonuc bicimi ikisinde ayni.
   */
  const faturaKontrolEt = async (file: File, beklenen: FaturaBeklenen, sistemVerisi: Record<string, unknown>): Promise<FaturaKontrolSonucu> => {
    const okunan = faturaMetniOku(await pdfMetni(await file.arrayBuffer()));
    if (okunan) return faturaKarsilastir(okunan, beklenen);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("sistem_verisi", JSON.stringify(sistemVerisi));
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`${supabaseUrl}/functions/v1/fatura-kontrol`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: formData,
    });
    const data: FaturaKontrolSonucu & { error?: string } = await response.json();
    if (!response.ok) throw new Error(data.error || "Kontrol sırasında hata oluştu.");
    return { ...data, kaynak: "yapay_zeka" };
  };

  const pdfYukle = async (file: File): Promise<{ path: string; url: string }> => {
    const path = `fatura/${dosya.id}/${Date.now()}_${guvenliAd(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("konsimento-talimatlari").upload(path, file);
    if (uploadError) throw new Error(`Dosya yüklenemedi: ${uploadError.message}`);
    return { path, url: await getGuvenliDosyaUrl("konsimento-talimatlari", path) };
  };

  const handleFaturaYukle = async (file: File) => {
    setFaturaYukleniyor(true);
    setFaturaHata(null);
    let yuklenenYol: string | null = null;
    try {
      const { path, url: dosyaUrl } = await pdfYukle(file);
      yuklenenYol = path;
      const data = await faturaKontrolEt(file, {
        konteynerler: konteynerler.map((k) => k.konteyner_no), netKg: toplamNet || null, brutKg: toplamBrut || null,
        kap: toplamKap || null, tutar: Number(dosya.toplam_tutar) || null, paraBirimi: dosya.para_birimi || null,
      }, buildFaturaSistemVerisi());

      // Yeniden yuklemede eski faturanin adresi: kayit basariyla guncellenince
      // depodan silinir (05.10.2026). Taze okunur; okunamazsa hicbir sey silinmez.
      const { data: onceki } = await supabase.from("ihracat_dosyalari")
        .select("fatura_dosya_url").eq("id", dosya.id).eq("company_id", companyId).maybeSingle();

      const { data: yazilan, error: yazmaError } = await supabase.from("ihracat_dosyalari").update({
        fatura_dosya_url: dosyaUrl,
        fatura_dosya_adi: file.name,
        fatura_yukleme_tarihi: new Date().toISOString(),
        fatura_kontrol_sonucu: data,
        fatura_no: data.fatura_no || dosya.fatura_no,
        fatura_tarihi: data.fatura_tarihi || dosya.fatura_tarihi,
        diib_no: data.diib_no || dosya.diib_no,
        diib_tarihi: data.diib_tarihi || dosya.diib_tarihi,
      }).eq("id", dosya.id).eq("company_id", companyId).select("id");
      const hata = yazmaHatasi(yazmaError, yazilan);
      if (hata) throw new Error(`Fatura bilgileri kaydedilemedi: ${hata}`);
      yuklenenYol = null; // kayit basarili - dosya artik dosyaya bagli
      await eskiDepoDosyasiniSil(onceki?.fatura_dosya_url, dosyaUrl);

      onRefresh();
    } catch (err: any) {
      // Kayda baglanamayan yeni PDF depoda sahipsiz kalmasin (01.10.2026)
      if (yuklenenYol) await supabase.storage.from("konsimento-talimatlari").remove([yuklenenYol]);
      setFaturaHata(err.message || "Kontrol sırasında hata oluştu.");
    } finally {
      setFaturaYukleniyor(false);
    }
  };

  const handleFaturaSec = (file: File | null) => {
    if (!file) return;
    if (!pdfMi(file)) return;
    if (!konteynerlerTamam) return;
    handleFaturaYukle(file);
  };

  const handleFaturaYenidenYukle = async () => {
    setFaturaHata(null);
    // Kaldirilan PDF, kayit BASARIYLA temizlendikten sonra depodan da silinir (05.10.2026).
    const kaldirilanUrl = dosya.fatura_dosya_url;
    const { data, error } = await supabase.from("ihracat_dosyalari").update({
      fatura_dosya_url: null,
      fatura_dosya_adi: null,
      fatura_yukleme_tarihi: null,
      fatura_kontrol_sonucu: null,
    }).eq("id", dosya.id).eq("company_id", companyId).select("id");
    const hata = yazmaHatasi(error, data);
    if (hata) {
      setFaturaHata(`Fatura sıfırlanamadı: ${hata}`);
      return;
    }
    await eskiDepoDosyasiniSil(kaldirilanUrl);
    onRefresh();
  };

  // ---- Bolunmus yukleme: parca basina beklenen degerler (talimattaki hesapla ayni) ----
  const parcaHesabi = faturaBolunmesi(dosya.urun_detaylari, parcalar.map((p) => ({
    sira: p.sira, belgeNo: p.belge_no, belgeTarihi: p.belge_tarihi, kg: Number(p.miktar_kg), faturaNo: p.fatura_no,
  })), null);
  const parcaAgirlik = parcaHesabi.length ? parcaAgirliklari(parcaHesabi, toplamNet, toplamBrut) : [];

  const parcaFaturaYukle = async (p: FaturaParcasiKaydi, file: File) => {
    const i = parcalar.findIndex((x) => x.id === p.id);
    const h = parcaHesabi[i];
    if (!h) return;
    const ag = parcaAgirlik[i];
    setParcaIslem(p.id);
    setParcaHata((s) => ({ ...s, [p.id]: "" }));
    let yuklenenYol: string | null = null;
    try {
      const { path, url } = await pdfYukle(file);
      yuklenenYol = path;
      const sonuc = await faturaKontrolEt(file, {
        konteynerler: konteynerler.map((k) => k.konteyner_no), netKg: h.kg, brutKg: ag?.brut ?? null, kap: ag?.kap ?? null,
        tutar: h.tutar, paraBirimi: dosya.para_birimi || null,
        parca: { sira: p.sira, diibAnahtar: diibAnahtari(p.belge_no), diibMetni: p.belge_no },
      }, buildFaturaSistemVerisi({ kg: h.kg, brut: ag?.brut ?? null, kap: ag?.kap ?? null, tutar: h.tutar }));

      const { data: onceki } = await supabase.from("diib_dosya_bolunmeleri").select("fatura_dosya_url").eq("id", p.id).eq("company_id", companyId).maybeSingle();
      const faturaNo = (sonuc.fatura_no || p.fatura_no || "").replace(/\s+/g, "").toUpperCase() || null;
      const simdi = new Date().toISOString();
      const r = await supabase.from("diib_dosya_bolunmeleri").update({
        fatura_no: faturaNo, fatura_tarihi: sonuc.fatura_tarihi || p.fatura_tarihi || null,
        fatura_dosya_url: url, fatura_dosya_adi: file.name, fatura_yukleme_tarihi: simdi, fatura_kontrol_sonucu: sonuc,
      }).eq("id", p.id).eq("company_id", companyId).select("id");
      const sorun = yazmaHatasi(r.error, r.data);
      if (sorun) throw new Error(/duplicate|23505/.test(sorun) ? "Bu fatura numarası başka bir kayıtta var." : `Fatura kaydedilemedi: ${sorun}`);
      yuklenenYol = null;
      // 1. fatura dosyanin fatura alanlarina da (panel, raporlar, DIIB). DIIB No'ya DOKUNULMAZ.
      if (p.sira === 1) {
        const d = await supabase.from("ihracat_dosyalari").update({
          fatura_dosya_url: url, fatura_dosya_adi: file.name, fatura_yukleme_tarihi: simdi, fatura_kontrol_sonucu: sonuc,
          fatura_no: faturaNo || dosya.fatura_no, fatura_tarihi: sonuc.fatura_tarihi || dosya.fatura_tarihi,
        }).eq("id", dosya.id).eq("company_id", companyId).select("id");
        const dSorun = yazmaHatasi(d.error, d.data);
        if (dSorun) setParcaHata((s) => ({ ...s, [p.id]: `Fatura parçaya kaydedildi ama dosya özetine yazılamadı: ${dSorun}` }));
      }
      await eskiDepoDosyasiniSil(onceki?.fatura_dosya_url, url);
      window.dispatchEvent(new Event(DIIB_BOLUNME_OLAYI));
      await parcalariGetir();
      onRefresh();
    } catch (err: any) {
      if (yuklenenYol) await supabase.storage.from("konsimento-talimatlari").remove([yuklenenYol]);
      setParcaHata((s) => ({ ...s, [p.id]: err.message || "Kontrol sırasında hata oluştu." }));
    } finally {
      setParcaIslem(null);
    }
  };

  const parcaFaturaKaldir = async (p: FaturaParcasiKaydi) => {
    setParcaHata((s) => ({ ...s, [p.id]: "" }));
    const kaldirilan = p.fatura_dosya_url;
    const r = await supabase.from("diib_dosya_bolunmeleri").update({
      fatura_dosya_url: null, fatura_dosya_adi: null, fatura_yukleme_tarihi: null, fatura_kontrol_sonucu: null,
    }).eq("id", p.id).eq("company_id", companyId).select("id");
    const sorun = yazmaHatasi(r.error, r.data);
    if (sorun) { setParcaHata((s) => ({ ...s, [p.id]: `Fatura kaldırılamadı: ${sorun}` })); return; }
    if (p.sira === 1 && dosya.fatura_dosya_url === kaldirilan) {
      await supabase.from("ihracat_dosyalari").update({ fatura_dosya_url: null, fatura_dosya_adi: null, fatura_yukleme_tarihi: null, fatura_kontrol_sonucu: null })
        .eq("id", dosya.id).eq("company_id", companyId).select("id");
    }
    await eskiDepoDosyasiniSil(kaldirilan);
    window.dispatchEvent(new Event(DIIB_BOLUNME_OLAYI));
    await parcalariGetir();
    onRefresh();
  };

  const yuklenenParca = parcalar.filter((p) => !!p.fatura_dosya_url).length;

  return (
    <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: CARD_BORDER }}>
        <Banknote size={16} style={{ color: ACCENT }} />
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Muhasebe</h3>
      </div>

      {bolunmus ? (
        <div className="p-4 space-y-3" data-testid="fatura-parcalari">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium text-white inline-flex items-center gap-1.5"><Split size={14} style={{ color: ACCENT }} /> Faturalar · DİİB dağılımı ({parcalar.length} fatura)</p>
              <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>Yükleme {parcalar.length} DİİB&apos;e bölündü; her faturayı kendi satırına yükleyin. Kontrol o faturanın miktarı, tutarı ve DİİB&apos;iyle yapılır.</p>
            </div>
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${yuklenenParca === parcalar.length ? "text-green-400 bg-green-500/10" : "text-amber-400 bg-amber-500/10"}`} data-testid="fatura-parca-sayac">
              {yuklenenParca}/{parcalar.length} yüklendi
            </span>
          </div>
          {parcalar.map((p, i) => {
            const h = parcaHesabi[i];
            const ag = parcaAgirlik[i];
            const sonuc = p.fatura_kontrol_sonucu;
            return (
              <div key={p.id} className="rounded-lg border" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }} data-testid={`fatura-parca-${p.sira}`}>
                <div className="px-3 py-2.5 border-b flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: CARD_BORDER }}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{p.sira}. Fatura <span className="font-mono text-xs ml-1" style={{ color: ACCENT }}>DİİB {p.belge_no}</span></p>
                    <p className="text-xs" style={{ color: TEXT_MUTED }}>
                      {Number(p.miktar_kg).toLocaleString("tr-TR")} kg{ag?.kap != null ? ` · ${ag.kap.toLocaleString("tr-TR")} kap` : ""}{h ? ` · ${para(h.tutar, dosya.para_birimi)}` : ""}
                      {p.fatura_no ? <> · Fatura No <b className="text-white font-mono">{p.fatura_no}</b></> : null}
                    </p>
                  </div>
                  {p.fatura_dosya_url && sonuc && <DurumRozeti uyumlu={sonuc.uyumlu} />}
                </div>
                <div className="p-3">
                  {!p.fatura_dosya_url && parcaIslem !== p.id && (
                    konteynerlerTamam ? (
                      <EvrakAsistanYukleme
                        belge={`${p.sira}. Fatura`}
                        mesaj={`${p.sira}. faturayı (DİİB ${p.belge_no}) buraya bırakın. Fatura no ve tarihi okuyup miktar, tutar, DİİB ve konteynerleri bu faturanın payıyla karşılaştırayım.`}
                        yetenekler={FATURA_YETENEKLERI}
                        accept=".pdf,application/pdf"
                        bicimNotu="PDF"
                        kabul={pdfMi}
                        kabulHatasi="Fatura PDF olmalı."
                        onDosya={(f) => parcaFaturaYukle(p, f)}
                        gecikmeMs={i * 400}
                        testId={`fatura-parca-asistan-${p.sira}`}
                      />
                    ) : (
                      <EvrakAsistanKilitli belge={`${p.sira}. Fatura`} mesaj={`Faturayı kontrol edebilmem için önce rezervasyondaki tüm konteynerler eklenmeli (${eklenenKonteynerAdedi}/${rezervasyonKontAdedi || 0}).`} />
                    )
                  )}
                  {parcaIslem === p.id && (
                    <EvrakAsistanIsleniyor belge={`${p.sira}. Fatura`} mesaj="Fatura okunuyor ve bu faturanın payıyla karşılaştırılıyor…"
                      kontroller={["Fatura no / tarih", "DİİB", "Tutar", "Ağırlıklar", "Konteynerler"]} />
                  )}
                  {parcaHata[p.id] && (
                    <p className="mt-2 text-xs text-amber-300 rounded-lg border bg-amber-500/10 px-3 py-2" style={{ borderColor: "rgba(251,191,36,0.35)" }} role="alert">{parcaHata[p.id]}</p>
                  )}
                  {p.fatura_dosya_url && sonuc && (
                    <FaturaSonucu url={p.fatura_dosya_url} ad={p.fatura_dosya_adi} tarih={p.fatura_yukleme_tarihi} sonuc={sonuc}
                      faturaNo={p.fatura_no} faturaTarihi={p.fatura_tarihi} diibNo={sonuc.diib_no} onKaldir={() => parcaFaturaKaldir(p)} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      <div className="p-4">
        <div className="flex items-center justify-between gap-4 mb-2">
          <p className="text-sm font-medium text-white">Fatura</p>
          {dosya.fatura_dosya_url && faturaKontrolSonucu && <DurumRozeti uyumlu={faturaKontrolSonucu.uyumlu} />}
        </div>

        {!dosya.fatura_dosya_url && !faturaYukleniyor && (
          konteynerlerTamam ? (
            <EvrakAsistanYukleme
              belge="Fatura"
              mesaj="Faturayı buraya bırakın. Fatura no, tarih ve DİİB numarasını okuyup tutar, ağırlık ve konteynerleri sistemdeki bilgilerle karşılaştırayım."
              yetenekler={FATURA_YETENEKLERI}
              accept=".pdf,application/pdf"
              bicimNotu="PDF"
              kabul={pdfMi}
              kabulHatasi="Fatura PDF olmalı."
              onDosya={(f) => handleFaturaSec(f)}
              testId="fatura-asistan"
            />
          ) : (
            <EvrakAsistanKilitli
              belge="Fatura"
              mesaj={`Faturayı kontrol edebilmem için önce rezervasyondaki tüm konteynerler eklenmeli (${eklenenKonteynerAdedi}/${rezervasyonKontAdedi || 0}).`}
            />
          )
        )}

        {faturaYukleniyor && (
          <EvrakAsistanIsleniyor belge="Fatura" mesaj="Fatura okunuyor ve sistemle karşılaştırılıyor…"
            kontroller={["Fatura no / tarih", "DİİB", "Tutar", "Ağırlıklar", "Konteynerler"]} />
        )}

        {faturaHata && (
          <div className="mt-2 p-3 rounded-lg border bg-amber-500/10 space-y-2" style={{ borderColor: "rgba(251,191,36,0.35)" }}>
            <p className="text-sm font-medium text-amber-400">Kontrol yapılamadı</p>
            <p className="text-xs text-amber-300">{faturaHata}</p>
            <button onClick={handleFaturaYenidenYukle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20">
              <RotateCcw size={12} /> Tekrar Dene
            </button>
          </div>
        )}

        {dosya.fatura_dosya_url && faturaKontrolSonucu && (
          <FaturaSonucu url={dosya.fatura_dosya_url} ad={dosya.fatura_dosya_adi} tarih={dosya.fatura_yukleme_tarihi} sonuc={faturaKontrolSonucu}
            faturaNo={dosya.fatura_no} faturaTarihi={dosya.fatura_tarihi} diibNo={faturaKontrolSonucu.diib_no || dosya.diib_no} onKaldir={handleFaturaYenidenYukle} />
        )}
      </div>
      )}
    </div>
  );
}

function DurumRozeti({ uyumlu }: { uyumlu: boolean }) {
  return uyumlu ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full">
      <CheckCircle2 size={12} /> Yüklendi
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full">
      <AlertTriangle size={12} /> Uyuşmazlık var
    </span>
  );
}

/** Yuklenen fatura satiri + kontrol sonucu (tek fatura ve bolunmus faturalarda ayni). */
function FaturaSonucu({ url, ad, tarih, sonuc, faturaNo, faturaTarihi, diibNo, onKaldir }: {
  url: string; ad: string | null; tarih: string | null; sonuc: FaturaKontrolSonucu;
  faturaNo: string | null; faturaTarihi: string | null; diibNo: string | null; onKaldir: () => void;
}) {
  const kaynak = sonuc.kaynak === "metin"
    ? <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(16,185,129,0.12)", color: "#6EE7B7" }} data-testid="fatura-kaynak" title="PDF metninden kurallarla okundu; yapay zekâ kullanılmadı">Metinden okundu · ücretsiz</span>
    : sonuc.kaynak === "yapay_zeka"
      ? <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: CARD_BORDER, color: TEXT_MUTED }} data-testid="fatura-kaynak" title="PDF'te okunabilir metin yoktu; yapay zekâ ile okundu">Yapay zekâ ile okundu</span>
      : null;
  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/10 text-red-400 shrink-0" title="PDF dosyası"><FileType2 size={16} /></span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-white truncate flex-1 hover:underline">
          {ad}
        </a>
        {tarih && <span className="text-xs shrink-0 hidden sm:inline" style={{ color: TEXT_MUTED }}>{formatDateTimeTR(tarih)}</span>}
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 hover:text-white" style={{ backgroundColor: CARD_BORDER, color: TEXT_MUTED }} title="Faturayı yeni sekmede aç"><ExternalLink size={12} /> Görüntüle</a>
        <button onClick={onKaldir} className="hover:text-white shrink-0" style={{ color: TEXT_MUTED }} title="Faturayı kaldır" aria-label="Faturayı kaldır"><X size={16} /></button>
      </div>

      {sonuc.uyumlu ? (
        <div className="p-3 rounded-lg border-2 border-green-500/40" style={{ backgroundColor: ROW_HEADER_BG }}>
          <div className="flex items-center gap-2 flex-wrap">
            <CheckCircle2 size={16} className="text-green-400" />
            <p className="text-sm font-semibold text-green-400">Fatura bilgileri sistemle uyumlu.</p>
            {kaynak}
          </div>
          {sonuc.ozet && <p className="text-xs mt-1 ml-6" style={{ color: TEXT_MUTED }}>{sonuc.ozet}</p>}
          <div className="mt-2 ml-6 flex flex-wrap gap-4 text-xs" style={{ color: TEXT_MUTED }}>
            <span>Fatura No: <strong className="text-white">{sonuc.fatura_no || faturaNo || "-"}</strong></span>
            <span>Fatura Tarihi: <strong className="text-white">{formatDateTR(sonuc.fatura_tarihi || faturaTarihi)}</strong></span>
            {diibNo && <span>DİİB No: <strong className="text-white">{diibNo}</strong></span>}
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-lg border-2 border-red-500/40 space-y-2" style={{ backgroundColor: ROW_HEADER_BG }}>
          <div className="flex items-center gap-2 flex-wrap">
            <AlertTriangle size={16} className="text-red-400" />
            <p className="text-sm font-semibold text-red-400">Faturada uyuşmazlık tespit edildi</p>
            {kaynak}
          </div>
          {sonuc.ozet && <p className="text-xs" style={{ color: TEXT_MUTED }}>{sonuc.ozet}</p>}
          {sonuc.uyusmazliklar?.length > 0 && (
            <div className="space-y-1.5">
              {sonuc.uyusmazliklar.map((u, idx) => (
                <div key={idx} className="text-xs p-2 rounded bg-red-500/10 border border-red-500/20">
                  <p className="font-medium text-red-400">{u.alan}</p>
                  <p className="text-red-300">Sistemde: <span className="font-mono">{String(u.sistemde)}</span></p>
                  <p className="text-red-300">Faturada: <span className="font-mono">{String(u.dosyada)}</span></p>
                </div>
              ))}
            </div>
          )}
          <button onClick={onKaldir} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20">
            <RotateCcw size={12} /> Doğru Faturayı Yeniden Yükle
          </button>
        </div>
      )}
    </div>
  );
}
