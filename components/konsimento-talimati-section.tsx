"use client";
import React, { useCallback, useEffect, useState, useRef } from "react";
import { supabase, Rezervasyon, Konteyner, Dosya, getGuvenliDosyaUrl, yazmaHatasi, eskiDepoDosyasiniSil } from "@/lib/supabase";
import { formatDateTimeTR, cutoffUyarilariniYenile } from "@/lib/cutoff-utils";
import { useToast } from "@/lib/toast-context";
import {
  FileText, X, Upload, CheckCircle2, AlertTriangle, Loader2, RotateCcw, Mail, Clock
} from "lucide-react";
import { KH_VARSAYILAN_ALICI, KH_VARSAYILAN_CC } from "@/supabase/functions/_shared/konsimento-hatirlatma-sabitler";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

type KontrolSonucu = {
  uyumlu: boolean;
  uyusmazliklar: { alan: string; sistemde: string; dosyada: string }[];
  ozet: string;
  consignee?: string;
  notify?: string[];
  bl_no?: string;
};

// Konsimento talimati hatirlatmasi (27.10.2026): tum konteynerler girilince sistem
// operation@'a (CC bbt@, execution@, export@) talimat bilgileriyle mail atar.
type Hatirlatma = {
  durum: "bekliyor" | "gonderiliyor" | "gonderildi" | "hata" | "atlandi";
  tetik: "otomatik" | "elle";
  test: boolean | null;
  alicilar: string | null;
  cc: string | null;
  son_hata: string | null;
  son_gonderim: string | null;
  gonderim_sayisi: number;
};

type Props = {
  dosyaId: string;
  dosya: Dosya;
  konteynerler: Konteyner[];
  rezervasyonlar: Rezervasyon[];
  onRefresh: () => void;
  companyId: string; // SaaS: şirket bazlı izolasyon
};

// Not: Bu bileşen, oncesinde fatura-talimati-section.tsx icinde bir modal olarak
// (Konteynerler sekmesindeki "Konsimento Talimati" butonuyla acilan) yasiyordu.
// Sevkiyat Evraklari sekmesine, Draft BL ile ayni yerde ve ayni gorsel dilde
// gorunmesi icin buraya tasindi. Is mantigi (AI kontrolu, DB alanlari,
// depolama yolu) BIREBIR AYNI korunmustur, sadece sunum bicimi degisti.
export default function KonsimentoTalimatiSection({
  dosyaId, dosya, konteynerler, rezervasyonlar, onRefresh, companyId,
}: Props) {
  const { showToast } = useToast();
  const [kontrolEdiliyor, setKontrolEdiliyor] = useState(false);
  const [kontrolHata, setKontrolHata] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const konsimentoDosyaUrl = dosya.konsimento_dosya_url;
  const konsimentoDosyaAdi = dosya.konsimento_dosya_adi;
  const konsimentoYuklemeTarihi = dosya.konsimento_yukleme_tarihi;
  const kontrolSonucu = dosya.konsimento_kontrol_sonucu as KontrolSonucu | null;

  // Anlamli bir AI kontrolu icin rezervasyondaki tum konteynerlerin dosyaya
  // eklenmis olmasi gerekir (eskisiyle BIREBIR AYNI esik, tasima sirasinda degistirilmedi).
  const rezervasyonKonteynerAdedi = rezervasyonlar.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
  const konsimentoHazir = rezervasyonKonteynerAdedi > 0 && konteynerler.length === rezervasyonKonteynerAdedi;

  // --- Hatirlatma maili durumu ---
  const [hatirlatma, setHatirlatma] = useState<Hatirlatma | null>(null);
  const [hatirlatmaGonderiliyor, setHatirlatmaGonderiliyor] = useState(false);
  const hatirlatmaGetir = useCallback(async () => {
    const { data } = await supabase.from("konsimento_hatirlatmalari")
      .select("durum, tetik, test, alicilar, cc, son_hata, son_gonderim, gonderim_sayisi")
      .eq("dosya_id", dosyaId).maybeSingle();
    setHatirlatma((data as Hatirlatma | null) ?? null);
  }, [dosyaId]);
  // Konteyner sayisi degisince (son konteyner eklendi) durum tazelenir
  useEffect(() => { hatirlatmaGetir(); }, [hatirlatmaGetir, konteynerler.length]);
  // Kuyruktaysa (cron 2 dk'da bir gonderir) kisa araliklarla tazele
  useEffect(() => {
    if (hatirlatma?.durum !== "bekliyor" && hatirlatma?.durum !== "gonderiliyor") return;
    const t = setInterval(hatirlatmaGetir, 20000);
    return () => clearInterval(t);
  }, [hatirlatma?.durum, hatirlatmaGetir]);

  const hatirlatmaGonder = async () => {
    setHatirlatmaGonderiliyor(true);
    try {
      const { data: oturum } = await supabase.auth.getSession();
      const jeton = oturum?.session?.access_token;
      if (!jeton) throw new Error("Oturum bulunamadı. Lütfen yeniden giriş yapın.");
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/konsimento-hatirlatma`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", Authorization: `Bearer ${jeton}` },
        body: JSON.stringify({ islem: "elle", dosya_id: dosyaId }),
      });
      const veri = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 202) throw new Error(veri.hata || "Hatırlatma gönderilemedi.");
      if (res.status === 202) showToast(veri.hata || "Hatırlatma kuyruğa alındı.", "success");
      else if (veri.mail === "gonderildi") showToast(`Hatırlatma gönderildi: ${(veri.alicilar || []).join(", ")}${veri.cc?.length ? ` (CC ${veri.cc.join(", ")})` : ""}${veri.test ? " · TEST" : ""}`, "success");
      else showToast("Hatırlatma gönderilemedi; birkaç dakika içinde otomatik tekrar denenecek.", "error");
    } catch (e: any) {
      showToast(e.message || "Hatırlatma gönderilemedi.", "error");
    } finally {
      setHatirlatmaGonderiliyor(false);
      hatirlatmaGetir();
    }
  };

  const buildSistemVerisi = () => {
    const rez = rezervasyonlar[0];
    return {
      dosya_no: dosya.dosya_no, lot_no: dosya.lot_no, alici_firma: dosya.alici_firma,
      satici_firma: dosya.satici_firma, proforma_no: dosya.proforma_no,
      yukleme_limani: rez?.yuklenme_limani || dosya.yuklenme_limani,
      varis_limani: dosya.varis_limani, teslim_sekli: dosya.teslim_sekli,
      gemi_adi: rez?.gemi_adi, acente_ismi: rez?.acente_ismi,
      booking_no: rez?.booking_no, gemi_kalkis_tarihi: rez?.gemi_kalkis_tarihi,
      konteynerler: konteynerler.map((k) => ({
        konteyner_no: k.konteyner_no,
        muhur_no: k.muhur_no,
        tip: k.tip,
        net_agirlik_kg: k.net_agirlik_kg,
        brut_agirlik_kg: (k as any).brut_agirlik_kg,
        tare_kg: k.tare_kg,
        kap_adeti: (k as any).pieces,
      })),
      beyanname_no: dosya.beyanname_no, fatura_no: dosya.fatura_no, bl_no: dosya.bl_no, diib_no: dosya.diib_no,
    };
  };

  const handleYukleVeKontrolEt = async (file: File) => {
    setKontrolEdiliyor(true); setKontrolHata(null);
    // Kayda baglanamayan yeni PDF depoda sahipsiz kalmasin (05.10.2026 -
    // diger yukleme akislariyla ayni kural; burada eksikti).
    let yuklenenYol: string | null = null;
    try {
      const guvenliAd = file.name
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/ş/gi, "s").replace(/ğ/gi, "g").replace(/ı/gi, "i")
        .replace(/ö/gi, "o").replace(/ü/gi, "u").replace(/ç/gi, "c")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${dosyaId}/${Date.now()}_${guvenliAd}`;
      const { error: uploadError } = await supabase.storage.from("konsimento-talimatlari").upload(path, file);
      if (uploadError) throw new Error(`Yükleme hatası: ${uploadError.message}`);
      yuklenenYol = path;
      const dosyaUrl = await getGuvenliDosyaUrl("konsimento-talimatlari", path);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sistem_verisi", JSON.stringify(buildSistemVerisi()));
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/konsimento-kontrol`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Kontrol hatası.");

      const normalize = (s: string) => s.toUpperCase().replace(/[^A-ZÇĞİÖŞÜ0-9]/g, "");
      const gercekUyusmazliklar = (data.uyusmazliklar || []).filter((u: any) => {
        const sis = normalize(String(u.sistemde || ""));
        const dos = normalize(String(u.dosyada || ""));
        if (!sis || !dos) return true;
        if (sis === dos) return false;
        if (sis.includes(dos) || dos.includes(sis)) return false;
        return true;
      });
      const filtrelenmisData = {
        ...data,
        uyusmazliklar: gercekUyusmazliklar,
        uyumlu: gercekUyusmazliklar.length === 0,
        ozet: gercekUyusmazliklar.length === 0
          ? "Konteyner bilgileri ve sistem verileri uyumludur."
          : data.ozet,
      };

      // Draft BL daha once BL No'yu "yetkili kaynak" olarak isaretlemisse
      // (bkz. draft-bl-section.tsx), o deger her zaman ustun sayilir ve
      // Konsimento Talimati bu alanin uzerine yazmaz.
      const draftBlYetkiliMi = (dosya.ham_veri as any)?.bl_no_kaynak === "draft_bl";
      const guncelHamVeri = {
        ...(dosya.ham_veri || {}),
        notify: data.notify || []
      };

      // Yeniden yuklemede eski talimatin adresi: kayit basariyla guncellenince
      // depodan silinir (05.10.2026). Taze okunur; okunamazsa hicbir sey silinmez.
      const { data: onceki } = await supabase.from("ihracat_dosyalari")
        .select("konsimento_dosya_url").eq("id", dosyaId).eq("company_id", companyId).maybeSingle();

      const { data: guncellenen, error: updateError } = await supabase.from("ihracat_dosyalari").update({
        konsimento_dosya_url: dosyaUrl, konsimento_dosya_adi: file.name,
        konsimento_yukleme_tarihi: new Date().toISOString(), konsimento_kontrol_sonucu: filtrelenmisData,
        consignee: data.consignee || null,
        bl_no: draftBlYetkiliMi ? dosya.bl_no : (data.bl_no || dosya.bl_no),
        ham_veri: guncelHamVeri,
      }).eq("id", dosyaId).eq("company_id", companyId).select("id");
      const guncellemeHatasi = yazmaHatasi(updateError, guncellenen);
      if (guncellemeHatasi) throw new Error(`Sonuç kaydedilemedi: ${guncellemeHatasi}`);
      yuklenenYol = null; // kayit basarili - dosya artik dosyaya bagli
      await eskiDepoDosyasiniSil(onceki?.konsimento_dosya_url, dosyaUrl);
      onRefresh();
      cutoffUyarilariniYenile();
    } catch (err: any) {
      if (yuklenenYol) await supabase.storage.from("konsimento-talimatlari").remove([yuklenenYol]);
      setKontrolHata(err.message || "Kontrol hatası.");
    } finally { setKontrolEdiliyor(false); }
  };

  const handleTekrarDene = async () => {
    if (konsimentoDosyaUrl) {
      // Veritabaninda zaten bir kayit var (ornegin uyusmazlik tespit edilmisti) -
      // eskisi gibi temizleyip yeniden yuklemeye izin ver.
      await handleYenidenYukle();
    } else {
      // Hic DB'ye yazilamadi (ornegin Gemini gecici hata verdi) - sadece yerel
      // hata durumunu temizle, kullanici dosyayi hemen tekrar secebilsin.
      setKontrolHata(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleYenidenYukle = async () => {
    setKontrolHata(null);
    // Kaldirilan PDF, kayit BASARIYLA temizlendikten sonra depodan da silinir (05.10.2026).
    const kaldirilanUrl = konsimentoDosyaUrl;
    const { data, error } = await supabase.from("ihracat_dosyalari").update({
      konsimento_dosya_url: null, konsimento_dosya_adi: null,
      konsimento_yukleme_tarihi: null, konsimento_kontrol_sonucu: null,
    }).eq("id", dosyaId).eq("company_id", companyId).select("id");
    const hata = yazmaHatasi(error, data);
    if (hata) {
      showToast(`İşlem başarısız: ${hata}`, "error");
      return;
    }
    await eskiDepoDosyasiniSil(kaldirilanUrl);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onRefresh();
    cutoffUyarilariniYenile();
  };

  return (
    <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: CARD_BORDER }}>
        <FileText size={16} style={{ color: ACCENT }} />
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Konşimento Talimatı</h3>
      </div>
      {(hatirlatma || (konsimentoHazir && !konsimentoDosyaUrl)) && (
        <HatirlatmaSeridi hatirlatma={hatirlatma} hazir={konsimentoHazir} talimatVar={!!konsimentoDosyaUrl}
          gonderiliyor={hatirlatmaGonderiliyor} onGonder={hatirlatmaGonder} />
      )}
      <div className="p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (f.type !== "application/pdf") { showToast("Lütfen PDF yükleyin.", "error"); return; } handleYukleVeKontrolEt(f); } }}
        />

        {!kontrolEdiliyor && kontrolHata && (
          <div className="p-3 rounded-lg border bg-amber-500/10 space-y-2" style={{ borderColor: "rgba(251,191,36,0.35)" }}>
            <p className="text-sm font-medium text-amber-400">Kontrol yapılamadı</p>
            <p className="text-xs text-amber-300">{kontrolHata}</p>
            <p className="text-xs" style={{ color: TEXT_MUTED }}>
              Not: Dosya sisteme yüklendi, sadece AI kontrolü tamamlanamadı (genellikle geçici bir yoğunluktan kaynaklanır). Birkaç saniye sonra tekrar deneyebilirsiniz.
            </p>
            <button onClick={handleTekrarDene} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"><RotateCcw size={12} /> Tekrar Dene</button>
          </div>
        )}

        {!kontrolEdiliyor && !kontrolHata && !konsimentoHazir && !konsimentoDosyaUrl && (
          <p className="text-xs" style={{ color: TEXT_MUTED }}>
            Anlamlı bir kontrol için önce rezervasyondaki tüm konteynerlerin dosyaya eklenmiş olması gerekir.
          </p>
        )}

        {!kontrolEdiliyor && !kontrolHata && konsimentoHazir && !konsimentoDosyaUrl && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 px-4 py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors hover:bg-white/[0.03]"
            style={{ borderColor: CARD_BORDER }}
          >
            <Upload size={28} style={{ color: TEXT_MUTED }} />
            <span className="text-sm font-medium text-white">Konşimento talimatı PDF dosyasını seçin</span>
            <span className="text-xs" style={{ color: TEXT_MUTED }}>veya sürükleyip bırakın</span>
          </div>
        )}

        {kontrolEdiliyor && (
          <div className="flex items-center gap-2 px-3 py-3 rounded-lg border" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
            <Loader2 size={18} className="animate-spin" style={{ color: TEXT_MUTED }} />
            <span className="text-sm" style={{ color: TEXT_MUTED }}>Belge kontrol ediliyor, bu işlem birkaç saniye sürebilir</span>
          </div>
        )}

        {!kontrolEdiliyor && !kontrolHata && konsimentoDosyaUrl && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
              <FileText size={16} className="shrink-0" style={{ color: TEXT_MUTED }} />
              <a href={konsimentoDosyaUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-white truncate flex-1 hover:underline">{konsimentoDosyaAdi}</a>
              {konsimentoYuklemeTarihi && <span className="text-xs shrink-0 hidden sm:inline" style={{ color: TEXT_MUTED }}>{formatDateTimeTR(konsimentoYuklemeTarihi)}</span>}
              <button onClick={handleYenidenYukle} className="hover:text-white shrink-0" style={{ color: TEXT_MUTED }} title="Konşimento talimatını kaldır"><X size={16} /></button>
            </div>

            {kontrolSonucu && kontrolSonucu.uyumlu && (
              <div className="p-3 rounded-lg border-2 border-green-500/40" style={{ backgroundColor: ROW_HEADER_BG }}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-400" />
                  <p className="text-sm font-semibold text-green-400">Konşimento talimatı sistemle uyumlu.</p>
                </div>
                {kontrolSonucu.ozet && <p className="text-xs mt-1 ml-6" style={{ color: TEXT_MUTED }}>{kontrolSonucu.ozet}</p>}
                {kontrolSonucu.consignee && (
                  <p className="text-xs ml-6 mt-1" style={{ color: TEXT_MUTED }}>
                    <span className="font-medium text-white">Consignee:</span> {kontrolSonucu.consignee}
                  </p>
                )}
              </div>
            )}

            {kontrolSonucu && !kontrolSonucu.uyumlu && (
              <div className="p-3 rounded-lg border-2 border-red-500/40 space-y-2" style={{ backgroundColor: ROW_HEADER_BG }}>
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-400" />
                  <p className="text-sm font-semibold text-red-400">Konşimento talimatında uyuşmazlık tespit edildi</p>
                </div>
                {kontrolSonucu.ozet && <p className="text-xs" style={{ color: TEXT_MUTED }}>{kontrolSonucu.ozet}</p>}
                {kontrolSonucu.uyusmazliklar?.length > 0 && (
                  <div className="space-y-1.5">
                    {kontrolSonucu.uyusmazliklar.map((u, idx) => (
                      <div key={idx} className="text-xs p-2 rounded bg-red-500/10 border border-red-500/20">
                        <p className="font-medium text-red-400">{u.alan}</p>
                        <p className="text-red-300">Sistemde: <span className="font-mono">{u.sistemde}</span></p>
                        <p className="text-red-300">Dosyada: <span className="font-mono">{u.dosyada}</span></p>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={handleTekrarDene} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20"><RotateCcw size={12} /> Doğru Dosyayı Yeniden Yükle</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Konsimento talimati hatirlatma maili durumu + elle (tekrar) gonderim. */
function HatirlatmaSeridi({ hatirlatma, hazir, talimatVar, gonderiliyor, onGonder }: {
  hatirlatma: Hatirlatma | null; hazir: boolean; talimatVar: boolean; gonderiliyor: boolean; onGonder: () => void;
}) {
  const h = hatirlatma;
  const kuyrukta = h?.durum === "bekliyor" || h?.durum === "gonderiliyor";
  let ikon: React.ReactNode = <Mail size={14} style={{ color: TEXT_MUTED }} />;
  let metin: React.ReactNode;
  if (h?.durum === "gonderildi") {
    ikon = <CheckCircle2 size={14} className="text-emerald-400" />;
    metin = (
      <>
        <span className="text-white font-medium">Hatırlatma gönderildi</span>
        {h.test && <span className="ml-1.5 text-[10px] font-bold px-1 py-px rounded bg-amber-500/15 text-amber-400">TEST</span>}
        <span> · {h.son_gonderim ? formatDateTimeTR(h.son_gonderim) : ""}{h.gonderim_sayisi > 1 ? ` · ${h.gonderim_sayisi}. gönderim` : ""}</span>
        <span className="block text-[11px] mt-0.5">{h.alicilar}{h.cc ? ` · CC ${h.cc}` : ""}</span>
      </>
    );
  } else if (kuyrukta) {
    ikon = <Clock size={14} className="text-amber-400" />;
    metin = <><span className="text-white font-medium">Hatırlatma hazırlanıyor</span> · birkaç dakika içinde {KH_VARSAYILAN_ALICI} adresine gönderilecek.</>;
  } else if (h?.durum === "hata") {
    ikon = <AlertTriangle size={14} className="text-red-400" />;
    metin = <><span className="text-red-400 font-medium">Hatırlatma gönderilemedi</span>{h.son_hata ? ` · ${h.son_hata}` : ""}</>;
  } else if (h?.durum === "atlandi") {
    metin = <>Hatırlatma gönderilmedi: konşimento talimatı / BL zaten girilmişti.</>;
  } else {
    metin = <>Tüm konteynerler girildi. Hatırlatma henüz gönderilmedi.</>;
  }
  // Talimat yuklendikten sonra hatirlatmanin anlami yok -> dugme gizli (gecmis satiri kalir)
  const dugmeGoster = hazir && !kuyrukta && !talimatVar;
  return (
    <div className="px-4 py-2.5 border-b flex flex-wrap items-center gap-x-3 gap-y-2" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
      <span className="shrink-0">{ikon}</span>
      <p className="text-xs flex-1 min-w-[220px]" style={{ color: TEXT_MUTED }}>{metin}</p>
      {dugmeGoster && (
        <button onClick={onGonder} disabled={gonderiliyor}
          title={`Alıcı ${KH_VARSAYILAN_ALICI} · CC ${KH_VARSAYILAN_CC.join(", ")}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5 disabled:opacity-60 shrink-0" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
          {gonderiliyor ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
          {h?.durum === "gonderildi" ? "Tekrar gönder" : h?.durum === "hata" ? "Tekrar dene" : "Hatırlatmayı gönder"}
        </button>
      )}
    </div>
  );
}
