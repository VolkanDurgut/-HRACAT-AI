"use client";
import React, { useRef, useState } from "react";
import { supabase, Dosya, Rezervasyon, getGuvenliDosyaUrl, yazmaHatasi, eskiDepoDosyasiniSil } from "@/lib/supabase";
import { formatDateTimeShortTR, formatCutoffTarih, formatCutoffSaat, cutoffUyarilariniYenile } from "@/lib/cutoff-utils";
import { useToast } from "@/lib/toast-context";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FileSignature, X, CheckCircle2, ExternalLink, RefreshCw, Clock, Archive, TimerOff } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { EvrakAsistanYukleme, EvrakAsistanIsleniyor } from "@/components/evrak-asistan";

/**
 * GUMRUK BEYANNAMESI (16.10.2026, kullanici istegi).
 * Sevkiyat Evraklari sekmesinde, Konsimento Talimati / Draft BL ile ayni
 * gorsel dilde. Beyanname yuklenince beyanname cut-off geri sayimi durur
 * (Ana Panel, Rezervasyon karti, ust uyari bandi) - tarih yine gorunur.
 *
 * Depolama: Draft BL ile ayni ozel depo ve ayni sirket politikasi
 * ("konsimento-talimatlari/<dosya_id>/beyanname/..."). AI kontrolu YOK -
 * belge oldugu gibi saklanir.
 * Yukleme sirasi CLAUDE.md kurali: eski URL taze okunur -> yeni dosya yuklenir
 * -> kayit guncellenir ve kontrol edilir -> SADECE basariliysa eski dosya
 * depodan silinir; kayit yazilamazsa yeni dosya geri alinir (sahipsiz kalmaz).
 */
const DEPO = "konsimento-talimatlari";
const KABUL_EDILEN = ["application/pdf", "image/jpeg", "image/png"];
const AZAMI_BOYUT = 20 * 1024 * 1024; // depo siniri ile ayni (20 MB)

type Props = {
  dosya: Dosya;
  rezervasyonlar: Rezervasyon[];
  onRefresh: () => void;
  companyId: string;
};

function guvenliDosyaAdi(ad: string): string {
  return ad
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ş/gi, "s").replace(/ğ/gi, "g").replace(/ı/gi, "i")
    .replace(/ö/gi, "o").replace(/ü/gi, "u").replace(/ç/gi, "c")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

export default function BeyannameSection({ dosya, rezervasyonlar, onRefresh, companyId }: Props) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaldiriliyor, setKaldiriliyor] = useState(false);
  const [kaldirOnay, setKaldirOnay] = useState(false);

  const url = dosya.beyanname_dosya_url;
  // Cut-off bilgisi: en erken beyanname cut-off'u (birden fazla rezervasyon olabilir)
  const cutoff = rezervasyonlar
    .map((r) => r.beyanname_cutoff)
    .filter((d): d is string => !!d)
    .sort()[0] || null;

  const dosyaSec = () => { if (!yukleniyor) inputRef.current?.click(); };

  const handleYukle = async (file: File) => {
    if (!KABUL_EDILEN.includes(file.type)) {
      showToast("Lütfen PDF, JPG veya PNG dosyası yükleyin.", "error");
      return;
    }
    if (file.size > AZAMI_BOYUT) {
      showToast("Dosya 20 MB'tan büyük olamaz.", "error");
      return;
    }
    setYukleniyor(true);
    let yuklenenYol: string | null = null;
    try {
      // Eski beyanname adresi TAZE okunur; okunamazsa hicbir sey silinmez
      const { data: onceki } = await supabase.from("ihracat_dosyalari")
        .select("beyanname_dosya_url").eq("id", dosya.id).eq("company_id", companyId).maybeSingle();

      const path = `${dosya.id}/beyanname/${Date.now()}_${guvenliDosyaAdi(file.name)}`;
      const { error: uploadError } = await supabase.storage.from(DEPO).upload(path, file, { contentType: file.type });
      if (uploadError) throw new Error(`Dosya yüklenemedi: ${uploadError.message}`);
      yuklenenYol = path;
      const dosyaUrl = await getGuvenliDosyaUrl(DEPO, path);

      const { data: guncellenen, error: updateError } = await supabase.from("ihracat_dosyalari").update({
        beyanname_dosya_url: dosyaUrl,
        beyanname_dosya_adi: file.name,
        beyanname_yukleme_tarihi: new Date().toISOString(),
      }).eq("id", dosya.id).eq("company_id", companyId).select("id");
      const hata = yazmaHatasi(updateError, guncellenen);
      if (hata) throw new Error(`Kayıt güncellenemedi: ${hata}`);
      yuklenenYol = null; // kayit basarili - dosya artik dosyaya bagli

      await eskiDepoDosyasiniSil((onceki as { beyanname_dosya_url?: string | null } | null)?.beyanname_dosya_url, dosyaUrl);
      showToast("Beyanname yüklendi. Beyanname cut-off sayacı durduruldu.", "success");
      onRefresh();
      cutoffUyarilariniYenile();
    } catch (err: any) {
      if (yuklenenYol) await supabase.storage.from(DEPO).remove([yuklenenYol]);
      showToast(err?.message || "Beyanname yüklenemedi.", "error");
    } finally {
      setYukleniyor(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleKaldir = async () => {
    setKaldiriliyor(true);
    const kaldirilanUrl = url;
    const { data, error } = await supabase.from("ihracat_dosyalari").update({
      beyanname_dosya_url: null,
      beyanname_dosya_adi: null,
      beyanname_yukleme_tarihi: null,
    }).eq("id", dosya.id).eq("company_id", companyId).select("id");
    const hata = yazmaHatasi(error, data);
    setKaldiriliyor(false);
    if (hata) {
      showToast(`Beyanname kaldırılamadı: ${hata}`, "error");
      return;
    }
    setKaldirOnay(false);
    await eskiDepoDosyasiniSil(kaldirilanUrl);
    showToast("Beyanname kaldırıldı.", "success");
    onRefresh();
    cutoffUyarilariniYenile();
  };

  return (
    <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <ConfirmDialog
        open={kaldirOnay}
        onOpenChange={(o) => { if (!kaldiriliyor) setKaldirOnay(o); }}
        title="Beyanname kaldırılsın mı?"
        description="Yüklenen beyanname dosyası sistemden silinir ve beyanname cut-off sayacı yeniden çalışmaya başlar."
        confirmLabel="Kaldır"
        cancelLabel="Vazgeç"
        destructive
        loading={kaldiriliyor}
        loadingLabel="Kaldırılıyor..."
        onConfirm={handleKaldir}
      />

      <div className="px-6 py-4 border-b flex items-center justify-between gap-2" style={{ borderColor: CARD_BORDER }}>
        <div className="flex items-center gap-2">
          <FileSignature size={16} style={{ color: ACCENT }} />
          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "white" }}>Gümrük Beyannamesi</h3>
        </div>
        {url && (
          <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold text-green-400 border-green-500/30 bg-green-500/10">
            <CheckCircle2 size={11} /> Yüklendi
          </span>
        )}
      </div>

      <div className="p-4 space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          data-testid="beyanname-input"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleYukle(f); }}
        />

        {cutoff && (
          <div className="flex items-center gap-2 text-xs" style={{ color: TEXT_MUTED }}>
            <Clock size={12} className="shrink-0" />
            <span>
              Beyanname cut-off: <span className="text-slate-300 font-medium">{formatCutoffTarih(cutoff)} {formatCutoffSaat(cutoff)}</span>
              {url && <span className="text-green-400"> · sayaç durduruldu</span>}
            </span>
          </div>
        )}

        {yukleniyor ? (
          <EvrakAsistanIsleniyor belge="Beyanname" durumYazisi="Beyanname yükleniyor" mesaj="Beyanname yükleniyor ve dosyaya bağlanıyor…" kontroller={["Dosya arşivi", "Beyanname cut-off"]} />
        ) : url ? (
          <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
            <FileSignature size={16} className="shrink-0" style={{ color: TEXT_MUTED }} />
            <div className="min-w-0 flex-1">
              <a href={url} target="_blank" rel="noopener noreferrer" className="block text-sm text-white truncate hover:underline" title={dosya.beyanname_dosya_adi || "Beyanname"}>
                {dosya.beyanname_dosya_adi || "Beyanname"}
              </a>
              {dosya.beyanname_yukleme_tarihi && (
                <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Yüklendi: {formatDateTimeShortTR(dosya.beyanname_yukleme_tarihi)}</p>
              )}
            </div>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 hover:border-sky-500/50 transition-colors shrink-0"
              title="Beyannameyi yeni sekmede aç"
            >
              <ExternalLink size={12} /> Görüntüle
            </a>
            <button
              onClick={dosyaSec}
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-white/5 hover:text-white shrink-0"
              style={{ color: TEXT_MUTED }}
              title="Yeni beyanname ile değiştir"
              aria-label="Beyannameyi değiştir"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => setKaldirOnay(true)}
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-red-500/10 hover:text-red-400 shrink-0"
              style={{ color: TEXT_MUTED }}
              title="Beyannameyi kaldır"
              aria-label="Beyannameyi kaldır"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          // 28.10.2026: AI asistan gorunumu. Beyannamede AI okumasi YOK (yalnizca yukleme +
          // cut-off sayacini durdurma) - mesaj bunu durustce soyler.
          <EvrakAsistanYukleme
            belge="Beyanname"
            mesaj="Gümrük beyannamesini buraya bırakın. Dosyaya bağlayıp beyanname cut-off sayacını durdurayım; evraklarda beyanname tamamlandı olarak görünsün."
            yetenekler={[
              { ikon: <Archive size={11} />, metin: "Dosya arşivi" },
              { ikon: <TimerOff size={11} />, metin: "Cut-off sayacı durur" },
            ]}
            accept="application/pdf,image/jpeg,image/png"
            bicimNotu="PDF, JPG, PNG (en fazla 20 MB)"
            kabul={(f) => ["application/pdf", "image/jpeg", "image/png"].includes(f.type) || /\.(pdf|jpe?g|png)$/i.test(f.name)}
            kabulHatasi="Beyanname PDF, JPG ya da PNG olmalı."
            onDosya={(f) => handleYukle(f)}
            gecikmeMs={1000}
            testId="beyanname-asistan"
            hazirYazisi="Beyanname almaya hazır"
          />
        )}
      </div>
    </div>
  );
}
