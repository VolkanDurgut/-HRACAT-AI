"use client";
import React, { useRef, useState } from "react";
import { supabase, Dosya, Rezervasyon, getGuvenliDosyaUrl, yazmaHatasi, eskiDepoDosyasiniSil } from "@/lib/supabase";
import { formatDateTimeShortTR, formatCutoffTarih, formatCutoffSaat, cutoffUyarilariniYenile } from "@/lib/cutoff-utils";
import { useToast } from "@/lib/toast-context";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FileSignature, X, CheckCircle2, ExternalLink, RefreshCw, Clock, Archive, TimerOff, AlertTriangle, ScanSearch, FilePlus2, MinusCircle, Info } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { EvrakAsistanYukleme, EvrakAsistanIsleniyor } from "@/components/evrak-asistan";
import { beyannameNoBul, beyannameMetniCikar } from "@/lib/beyanname-oku";
import { beyannameMetniOku, beyannameKarsilastir, type BeyannameKontrolSonucu, type KontrolDurumu } from "@/lib/beyanname-kontrol";
import { beyannameBeklenenGetir } from "@/lib/beyanname-beklenen";

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
 * 04.11.2026 (DIIB takibi): PDF beyannameden BEYANNAME NO metinden okunur (yapay zeka yok,
 * lib/beyanname-oku.ts) ve dosyanin beyanname_no alanina AYNI kayitla yazilir. Okunamazsa
 * alan degismez (Ek Bilgiler'den elle girilir).
 * 06.11.2026: BEYANNAME KONTROLU (yapay zeka yok, lib/beyanname-kontrol.ts). PDF metni sistemdeki
 * dosya bilgileriyle karsilastirilir (fatura, tutar, konteyner, net kg, DIIB, gemi, teslim, ulke, alici);
 * sonuc beyanname_kontrol_sonucu'na yazilir, yalniz gosterilir. Cok kalemli beyannamenin (bolunmus DIIB)
 * 2. kalemi ayri "Devam Listesi" PDF'inde: "Devam listesi ekle" ile yuklenir (beyanname_devam_dosya_url),
 * kontrol iki metinle yeniden yapilir. Beyanname degisirse BEYAN NO'su tutmayan devam listesi kaldirilir.
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

/** Imzali adresteki PDF'in metni (devam listesini / beyannameyi yeniden okumak icin); olmazsa null. */
async function adrestenMetin(adres: string | null | undefined): Promise<string | null> {
  if (!adres) return null;
  try {
    const res = await fetch(adres);
    if (!res.ok) return null;
    return await beyannameMetniCikar(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Metin(ler) + sistem -> kontrol sonucu; sistem okunamaz ya da metin yoksa null (kontrol yapilmadi). */
async function kontrolHesapla(metinler: (string | null)[], dosyaId: string, companyId: string): Promise<BeyannameKontrolSonucu | null> {
  const dolu = metinler.filter((m): m is string => !!m);
  if (!dolu.length) return null;
  const beklenen = await beyannameBeklenenGetir(dosyaId, companyId);
  if (!beklenen) return null;
  return beyannameKarsilastir(beyannameMetniOku(dolu), beklenen);
}

export default function BeyannameSection({ dosya, rezervasyonlar, onRefresh, companyId }: Props) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaldiriliyor, setKaldiriliyor] = useState(false);
  const [kaldirOnay, setKaldirOnay] = useState(false);
  const devamRef = useRef<HTMLInputElement>(null);
  const [devamIsleniyor, setDevamIsleniyor] = useState(false);
  const [yenidenKontrol, setYenidenKontrol] = useState(false);

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
      const metin = file.type === "application/pdf" ? await beyannameMetniCikar(await file.arrayBuffer()) : null;
      const okunanNo = metin ? beyannameNoBul(metin) : null;
      // Eski beyanname adresi TAZE okunur; okunamazsa hicbir sey silinmez
      const { data: onceki } = await supabase.from("ihracat_dosyalari")
        .select("beyanname_dosya_url, beyanname_devam_dosya_url").eq("id", dosya.id).eq("company_id", companyId).maybeSingle();
      // Mevcut devam listesi YALNIZ ayni beyannameye aitse (BEYAN NO ayni) korunur
      const oncekiDevamUrl = (onceki as { beyanname_devam_dosya_url?: string | null } | null)?.beyanname_devam_dosya_url || null;
      const devamMetni = oncekiDevamUrl ? await adrestenMetin(oncekiDevamUrl) : null;
      const devamKalir = !!(oncekiDevamUrl && devamMetni && okunanNo && beyannameNoBul(devamMetni) === okunanNo);
      const kontrol = await kontrolHesapla([metin, devamKalir ? devamMetni : null], dosya.id, companyId).catch(() => null);

      const path = `${dosya.id}/beyanname/${Date.now()}_${guvenliDosyaAdi(file.name)}`;
      const { error: uploadError } = await supabase.storage.from(DEPO).upload(path, file, { contentType: file.type });
      if (uploadError) throw new Error(`Dosya yüklenemedi: ${uploadError.message}`);
      yuklenenYol = path;
      const dosyaUrl = await getGuvenliDosyaUrl(DEPO, path);

      const { data: guncellenen, error: updateError } = await supabase.from("ihracat_dosyalari").update({
        beyanname_dosya_url: dosyaUrl,
        beyanname_dosya_adi: file.name,
        beyanname_yukleme_tarihi: new Date().toISOString(),
        ...(okunanNo ? { beyanname_no: okunanNo } : {}),
        beyanname_kontrol_sonucu: kontrol,
        ...(oncekiDevamUrl && !devamKalir ? { beyanname_devam_dosya_url: null, beyanname_devam_dosya_adi: null } : {}),
      }).eq("id", dosya.id).eq("company_id", companyId).select("id");
      const hata = yazmaHatasi(updateError, guncellenen);
      if (hata) throw new Error(`Kayıt güncellenemedi: ${hata}`);
      yuklenenYol = null; // kayit basarili - dosya artik dosyaya bagli

      await eskiDepoDosyasiniSil((onceki as { beyanname_dosya_url?: string | null } | null)?.beyanname_dosya_url, dosyaUrl);
      if (oncekiDevamUrl && !devamKalir) await eskiDepoDosyasiniSil(oncekiDevamUrl);
      const noMesaji = okunanNo
        ? ` Beyanname no: ${okunanNo}${dosya.beyanname_no && dosya.beyanname_no.replace(/\s+/g, "").toUpperCase() !== okunanNo ? ` (önceki: ${dosya.beyanname_no})` : ""}.`
        : " Beyanname no belgeden okunamadı; Ek Bilgiler'den girin.";
      const kontrolMesaji = kontrol ? (kontrol.uyumlu ? " Sistem bilgileriyle uyumlu." : " Uyuşmayan alan var; kontrol sonucuna bakın.") : "";
      showToast(`Beyanname yüklendi. Beyanname cut-off sayacı durduruldu.${noMesaji}${kontrolMesaji}`, "success");
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
      beyanname_kontrol_sonucu: null,
      beyanname_devam_dosya_url: null,
      beyanname_devam_dosya_adi: null,
    }).eq("id", dosya.id).eq("company_id", companyId).select("id");
    const hata = yazmaHatasi(error, data);
    setKaldiriliyor(false);
    if (hata) {
      showToast(`Beyanname kaldırılamadı: ${hata}`, "error");
      return;
    }
    setKaldirOnay(false);
    await eskiDepoDosyasiniSil(kaldirilanUrl);
    if (dosya.beyanname_devam_dosya_url) await eskiDepoDosyasiniSil(dosya.beyanname_devam_dosya_url);
    showToast("Beyanname kaldırıldı.", "success");
    onRefresh();
    cutoffUyarilariniYenile();
  };

  /** Devam listesi (cok kalemli beyanname): ayni BEYAN NO olmali; kontrol ana sayfa + devam ile yeniden. */
  const handleDevam = async (file: File) => {
    if (file.type !== "application/pdf") { showToast("Devam listesi PDF olmalı.", "error"); return; }
    if (file.size > AZAMI_BOYUT) { showToast("Dosya 20 MB'tan büyük olamaz.", "error"); return; }
    setDevamIsleniyor(true);
    let yuklenenYol: string | null = null;
    try {
      const devamMetni = await beyannameMetniCikar(await file.arrayBuffer());
      if (!devamMetni) throw new Error("Devam listesinin metni okunamadı (taranmış görsel olabilir).");
      const devamNo = beyannameNoBul(devamMetni);
      const anaMetin = await adrestenMetin(url);
      const anaNo = anaMetin ? beyannameNoBul(anaMetin) : (dosya.beyanname_no || null);
      if (devamNo && anaNo && devamNo !== anaNo) throw new Error(`Bu devam listesi başka bir beyannameye ait (${devamNo}); yüklenen beyanname ${anaNo}.`);
      const kontrol = await kontrolHesapla([anaMetin, devamMetni], dosya.id, companyId).catch(() => null);
      const oncekiDevam = dosya.beyanname_devam_dosya_url || null;
      const path = `${dosya.id}/beyanname/${Date.now()}_devam_${guvenliDosyaAdi(file.name)}`;
      const { error: uploadError } = await supabase.storage.from(DEPO).upload(path, file, { contentType: file.type });
      if (uploadError) throw new Error(`Dosya yüklenemedi: ${uploadError.message}`);
      yuklenenYol = path;
      const devamUrl = await getGuvenliDosyaUrl(DEPO, path);
      const { data: g, error: e } = await supabase.from("ihracat_dosyalari").update({
        beyanname_devam_dosya_url: devamUrl,
        beyanname_devam_dosya_adi: file.name,
        ...(kontrol ? { beyanname_kontrol_sonucu: kontrol } : {}),
      }).eq("id", dosya.id).eq("company_id", companyId).select("id");
      const hata = yazmaHatasi(e, g);
      if (hata) throw new Error(`Kayıt güncellenemedi: ${hata}`);
      yuklenenYol = null;
      await eskiDepoDosyasiniSil(oncekiDevam, devamUrl);
      showToast(kontrol ? `Devam listesi eklendi. ${kontrol.uyumlu ? "Beyanname sistem bilgileriyle uyumlu." : "Uyuşmayan alan var; kontrol sonucuna bakın."}` : "Devam listesi eklendi.", "success");
      onRefresh();
    } catch (err: any) {
      if (yuklenenYol) await supabase.storage.from(DEPO).remove([yuklenenYol]);
      showToast(err?.message || "Devam listesi eklenemedi.", "error");
    } finally {
      setDevamIsleniyor(false);
      if (devamRef.current) devamRef.current.value = "";
    }
  };

  const handleDevamKaldir = async () => {
    setDevamIsleniyor(true);
    try {
      const eski = dosya.beyanname_devam_dosya_url || null;
      const kontrol = await kontrolHesapla([await adrestenMetin(url)], dosya.id, companyId).catch(() => null);
      const { data: g, error: e } = await supabase.from("ihracat_dosyalari").update({
        beyanname_devam_dosya_url: null, beyanname_devam_dosya_adi: null,
        ...(kontrol ? { beyanname_kontrol_sonucu: kontrol } : {}),
      }).eq("id", dosya.id).eq("company_id", companyId).select("id");
      const hata = yazmaHatasi(e, g);
      if (hata) throw new Error(`Devam listesi kaldırılamadı: ${hata}`);
      await eskiDepoDosyasiniSil(eski);
      showToast("Devam listesi kaldırıldı.", "success");
      onRefresh();
    } catch (err: any) {
      showToast(err?.message || "Devam listesi kaldırılamadı.", "error");
    } finally {
      setDevamIsleniyor(false);
    }
  };

  /** Sistem bilgileri degisince (konteyner, fatura...) kontrolu yeniden yap; belge degismez. */
  const handleYenidenKontrol = async () => {
    setYenidenKontrol(true);
    try {
      const kontrol = await kontrolHesapla([await adrestenMetin(url), await adrestenMetin(dosya.beyanname_devam_dosya_url)], dosya.id, companyId);
      if (!kontrol) throw new Error("Beyanname metni okunamadı (taranmış görsel olabilir).");
      const { data: g, error: e } = await supabase.from("ihracat_dosyalari").update({ beyanname_kontrol_sonucu: kontrol })
        .eq("id", dosya.id).eq("company_id", companyId).select("id");
      const hata = yazmaHatasi(e, g);
      if (hata) throw new Error(`Kontrol kaydedilemedi: ${hata}`);
      showToast(kontrol.uyumlu ? "Beyanname sistem bilgileriyle uyumlu." : kontrol.ozet, "success");
      onRefresh();
    } catch (err: any) {
      showToast(err?.message || "Kontrol yapılamadı.", "error");
    } finally {
      setYenidenKontrol(false);
    }
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
        <input
          ref={devamRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          data-testid="beyanname-devam-input"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDevam(f); }}
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
          <EvrakAsistanIsleniyor belge="Beyanname" durumYazisi="Beyanname yükleniyor" mesaj="Beyanname okunuyor, sistemle karşılaştırılıyor ve dosyaya bağlanıyor…" kontroller={["Dosya arşivi", "Sistemle kontrol", "Beyanname cut-off"]} />
        ) : url ? (
          <div className="space-y-2">
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
          <DevamSatiri
            ad={dosya.beyanname_devam_dosya_adi || null}
            adres={dosya.beyanname_devam_dosya_url || null}
            isleniyor={devamIsleniyor}
            onEkle={() => { if (!devamIsleniyor) devamRef.current?.click(); }}
            onKaldir={handleDevamKaldir}
          />
          <KontrolKarti
            sonuc={dosya.beyanname_kontrol_sonucu || null}
            pdfMi={/\.pdf$/i.test(dosya.beyanname_dosya_adi || "") || !dosya.beyanname_dosya_adi}
            yenileniyor={yenidenKontrol}
            onYenile={handleYenidenKontrol}
          />
          </div>
        ) : (
          // 28.10.2026: AI asistan gorunumu. 06.11.2026: yapay zeka YOK; PDF metni kurallarla okunup
          // sistemdeki dosya bilgileriyle karsilastirilir (lib/beyanname-kontrol.ts).
          <EvrakAsistanYukleme
            belge="Beyanname"
            mesaj="Gümrük beyannamesini buraya bırakın. Dosyaya bağlayıp fatura, tutar, konteyner, ağırlık ve DİİB bilgilerini sistemle karşılaştırayım; beyanname cut-off sayacı da durur."
            yetenekler={[
              { ikon: <Archive size={11} />, metin: "Dosya arşivi" },
              { ikon: <ScanSearch size={11} />, metin: "Sistemle kontrol" },
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

const DURUM: Record<KontrolDurumu, { renk: string; ikon: React.ReactNode; etiket: string }> = {
  uyumlu: { renk: "text-green-400", ikon: <CheckCircle2 size={13} />, etiket: "Uyumlu" },
  uyusmuyor: { renk: "text-amber-400", ikon: <AlertTriangle size={13} />, etiket: "Uyuşmuyor" },
  okunamadi: { renk: "text-slate-400", ikon: <MinusCircle size={13} />, etiket: "Okunamadı" },
  bilgi: { renk: "text-sky-300", ikon: <Info size={13} />, etiket: "Elle bakın" },
};

/** Cok kalemli beyannamenin devam listesi satiri (varsa) ya da ekleme dugmesi. */
function DevamSatiri({ ad, adres, isleniyor, onEkle, onKaldir }: { ad: string | null; adres: string | null; isleniyor: boolean; onEkle: () => void; onKaldir: () => void }) {
  if (adres) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }} data-testid="beyanname-devam">
        <FilePlus2 size={14} className="shrink-0" style={{ color: TEXT_MUTED }} />
        <a href={adres} target="_blank" rel="noopener noreferrer" className="text-xs text-white truncate flex-1 hover:underline" title={ad || "Devam listesi"}>
          Devam listesi · {ad || "PDF"}
        </a>
        <a href={adres} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] hover:text-white shrink-0" style={{ color: TEXT_MUTED }}><ExternalLink size={11} /> Aç</a>
        <button onClick={onKaldir} disabled={isleniyor} className="hover:text-red-400 shrink-0 disabled:opacity-50" style={{ color: TEXT_MUTED }} title="Devam listesini kaldır" aria-label="Devam listesini kaldır"><X size={14} /></button>
      </div>
    );
  }
  return (
    <button
      onClick={onEkle}
      disabled={isleniyor}
      data-testid="beyanname-devam-ekle"
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:text-white disabled:opacity-50"
      style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}
      title="Birden çok kalemli beyannamede 2. ve sonraki kalemler ayrı Devam Listesi PDF'indedir"
    >
      {isleniyor ? <RefreshCw size={12} className="animate-spin" /> : <FilePlus2 size={12} />} Devam listesi ekle (çok kalemli beyanname)
    </button>
  );
}

/** Beyanname kontrol sonucu: alan alan sistem ve belge degeri. */
function KontrolKarti({ sonuc, pdfMi, yenileniyor, onYenile }: { sonuc: BeyannameKontrolSonucu | null; pdfMi: boolean; yenileniyor: boolean; onYenile: () => void }) {
  if (!sonuc) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} data-testid="beyanname-kontrol-yok">
        <span>{pdfMi ? "Bu beyanname henüz sistemle karşılaştırılmadı." : "Görsel (JPG/PNG) beyannamede metin olmadığı için kontrol yapılamaz."}</span>
        {pdfMi && (
          <button onClick={onYenile} disabled={yenileniyor} className="inline-flex items-center gap-1 hover:text-white disabled:opacity-50" data-testid="beyanname-kontrol-et">
            <ScanSearch size={12} className={yenileniyor ? "animate-pulse" : ""} /> Sistemle karşılaştır
          </button>
        )}
      </div>
    );
  }
  const uyusmayan = sonuc.kontroller.filter((k) => k.durum === "uyusmuyor").length;
  return (
    <div className={`rounded-lg border-2 ${sonuc.uyumlu ? "border-green-500/40" : "border-amber-500/50"}`} style={{ backgroundColor: ROW_HEADER_BG }} data-testid="beyanname-kontrol">
      <div className="flex items-center gap-2 flex-wrap px-3 pt-3">
        {sonuc.uyumlu ? <CheckCircle2 size={16} className="text-green-400" /> : <AlertTriangle size={16} className="text-amber-400" />}
        <p className={`text-sm font-semibold ${sonuc.uyumlu ? "text-green-400" : "text-amber-400"}`} data-testid="beyanname-kontrol-baslik">
          {sonuc.uyumlu ? "Beyanname bilgileri sistemle uyumlu." : `${uyusmayan} alan sistemle uyuşmuyor.`}
        </p>
        <button onClick={onYenile} disabled={yenileniyor} className="ml-auto inline-flex items-center gap-1 text-[11px] hover:text-white disabled:opacity-50" style={{ color: TEXT_MUTED }} title="Sistemdeki bilgiler değiştiyse yeniden karşılaştır" data-testid="beyanname-kontrol-yenile">
          <RefreshCw size={11} className={yenileniyor ? "animate-spin" : ""} /> Yeniden kontrol et
        </button>
      </div>
      <p className="text-xs px-3 mt-1 ml-6" style={{ color: TEXT_MUTED }}>{sonuc.ozet}</p>
      <div className="mt-2 border-t divide-y" style={{ borderColor: CARD_BORDER }}>
        {sonuc.kontroller.map((k) => {
          const d = DURUM[k.durum];
          return (
            <div key={k.alan} className="grid grid-cols-[18px_minmax(0,140px)_minmax(0,1fr)] sm:grid-cols-[18px_150px_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-0.5 px-3 py-1.5 text-xs" style={{ borderColor: CARD_BORDER }} data-testid="beyanname-kontrol-satir">
              <span className={`${d.renk} pt-0.5`} title={d.etiket}>{d.ikon}</span>
              <span className="text-slate-300 font-medium">{k.alan}</span>
              <span className="truncate" style={{ color: TEXT_MUTED }} title={k.sistem}>Sistem: <span className="text-white">{k.sistem}</span></span>
              <span className="truncate col-start-3 sm:col-start-auto" style={{ color: TEXT_MUTED }} title={k.belge}>Beyanname: <span className={k.durum === "uyusmuyor" ? "text-amber-300" : "text-white"}>{k.belge}</span></span>
              {k.not && <span className="col-start-3 sm:col-span-2 text-[11px]" style={{ color: k.durum === "uyusmuyor" ? "#FCD34D" : TEXT_MUTED }}>{k.not}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
