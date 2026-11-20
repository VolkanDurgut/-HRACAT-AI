"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ClipboardCheck, Download, ExternalLink, FileSearch, FileText, Loader2, Pencil, Plus, RefreshCw, Search, Split, Trash2, X,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { formatCurrency, formatDateTR } from "@/lib/cutoff-utils";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import { sayiOku } from "@/lib/sayi-oku";
import { formatCutoffSaat, formatCutoffTarih } from "@/lib/cutoff-utils";
import {
  DIIB_ORAN, siraliBekleyenler, type BekleyenSira, diibAnahtari, kgOku, diibOzetleri, diibSatirlari, faturaNorm, kgYaz,
  type DiibBelgesi, type DiibBolunmesi, type DiibDosyasi, type DiibKaydi, type DiibOzeti, type DiibSatiri,
} from "@/lib/diib/hesap";
import { diibExcelOlustur } from "@/lib/diib/excel-yaz";
import { beyannameNoOku } from "@/lib/beyanname-oku";
import { UlkeBayrak } from "@/components/ulke-bayrak";
import { dosyaTicaretUlkesi } from "@/lib/ulke-bul";
import { DIIB_DOSYA_KOLONLARI, bekleyenSiraGetir, yuklenenEkle, yuklenenKgleri } from "@/lib/diib/veri";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";

/**
 * DIIB TAKIBI (04.11.2026). Burak Bey'in "UNEX IHRACATLAR" Excel'inin IHRACAT kismi - SISTEM
 * KENDI VERISIYLE doldurur; Excel'den iceri hicbir sey ALINMAZ (kullanici karari). Excel'e
 * AKTARMA ayni formu (GENEL TABLO + DIIB sayfalari) uretir. Beyanname no yuklenen beyanname
 * PDF'inden okunur. Sistem oncesi faturalar icin DIIB basina tek "devir" (kg + tutar).
 * Genel tablo (her DIIB: taahhut / gerceklesen / kalan / hak edilen ithalat) + secili DIIB'in
 * fatura satirlari. Faturasi kesilen dosyalar KENDILIGINDEN satir olur (lib/diib/hesap.ts);
 * duzeltilen otomatik satir diib_ihracatlari'na "sistem" kaynagiyla yazilir. Bekleyen
 * (faturasi kesilmemis) yuklemelerde DIIB kalani yetmiyorsa "2 fatura" uyarisi.
 * Yetki: "ihracatlar". Ithalat kismi bilerek YOK (kullanici: sonra).
 */

const DOSYA_KOLONLARI = DIIB_DOSYA_KOLONLARI;
const kartStil = { backgroundColor: CARD_BG, borderColor: CARD_BORDER } as React.CSSProperties;
const girdiSinifi = "w-full px-3 py-2 border rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const girdiStil = { borderColor: CARD_BORDER, backgroundColor: CARD_BG } as React.CSSProperties;
const thSinifi = "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap";
const gtTh = "px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap";
const gtTd = "px-2.5 py-2.5 text-[13px] tabular-nums whitespace-nowrap";
const birimYaz = (n: number | null) => n === null ? "-" : n.toLocaleString("tr-TR", { minimumFractionDigits: 3, maximumFractionDigits: 5 });
const paraYaz = (n: number, pb = "USD") => formatCurrency(n, pb);
/** Un ihracati ort. birim fiyat makul araligi (USD/kg); disinda devir tutari yanlis yazilmis demektir (04.11: 460,12 girildi). */
const devirBirimMakul = (b: number) => b >= 0.1 && b <= 2;

type Durum = { etiket: string; sinif: string };
function diibDurumu(o: DiibOzeti, kullanimdaId: string | null): Durum {
  if (o.belge.durum === "tamamlandi") return { etiket: "Kapatıldı", sinif: "bg-white/5 text-slate-300" };
  if (o.kalanKg <= 0) return { etiket: o.kalanKg < 0 ? `Tamamlandı · +${kgYaz(-o.kalanKg)} kg` : "Tamamlandı", sinif: "bg-emerald-500/10 text-emerald-400" };
  if (o.belge.id === kullanimdaId) return { etiket: "Kullanımda", sinif: "bg-sky-500/10 text-sky-300" };
  return { etiket: "Sırada", sinif: "bg-amber-500/10 text-amber-400" };
}

export default function DiibSayfasi() {
  return <AppShell><DiibIcerik /></AppShell>;
}

function DiibIcerik() {
  const { companyId, user, loading: authLoading, yetkiler } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [belgeler, setBelgeler] = useState<DiibBelgesi[]>([]);
  const [kayitlar, setKayitlar] = useState<DiibKaydi[]>([]);
  const [dosyalar, setDosyalar] = useState<DiibDosyasi[]>([]);
  const [bolunmeler, setBolunmeler] = useState<DiibBolunmesi[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const [arama, setArama] = useState("");
  const [aktariliyor, setAktariliyor] = useState(false);
  const [beyanOkuma, setBeyanOkuma] = useState<{ yapilan: number; toplam: number } | null>(null);
  const [belgeFormu, setBelgeFormu] = useState<DiibBelgesi | "yeni" | null>(null);
  const [satirFormu, setSatirFormu] = useState<{ satir: DiibSatiri | null; diibId: string; dosya?: DiibDosyasi } | null>(null);
  const [silinecek, setSilinecek] = useState<DiibSatiri | null>(null);
  const [siliniyor, setSiliniyor] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!yetkiler.sayfa_yetkileri.ihracatlar) {
      const hedef = ilkErisilebilirSayfa(yetkiler.sayfa_yetkileri);
      if (hedef) router.replace(hedef);
    }
  }, [authLoading, yetkiler, router]);

  const getir = useCallback(async (sessiz = false) => {
    if (!companyId) return;
    if (sessiz) setYenileniyor(true);
    const [b, k, d, bo, yk] = await Promise.all([
      supabase.from("diib_belgeleri").select("*").eq("company_id", companyId).order("kullanim_sirasi").order("belge_tarihi"),
      supabase.from("diib_ihracatlari").select("*").eq("company_id", companyId).order("fatura_tarihi").limit(5000),
      supabase.from("ihracat_dosyalari").select(DOSYA_KOLONLARI).eq("company_id", companyId).limit(3000),
      supabase.from("diib_dosya_bolunmeleri").select("*").eq("company_id", companyId),
      yuklenenKgleri(companyId),
    ]);
    const e = b.error || k.error || d.error || bo.error;
    if (e) {
      setHata(/does not exist|42P01/.test(`${e.message} ${(e as { code?: string }).code}`) ? "DİİB tabloları henüz kurulmamış. Yöneticiye bildirin." : `Veriler okunamadı: ${e.message}`);
    } else {
      setBelgeler((b.data || []) as DiibBelgesi[]);
      setKayitlar((k.data || []) as DiibKaydi[]);
      setDosyalar(yuklenenEkle((d.data || []) as unknown as DiibDosyasi[], yk));
      setBolunmeler((bo.data || []) as DiibBolunmesi[]);
      setHata(null);
    }
    setYukleniyor(false);
    setYenileniyor(false);
  }, [companyId]);
  useEffect(() => { if (!authLoading && yetkiler.sayfa_yetkileri.ihracatlar) getir(); }, [authLoading, yetkiler, getir]);

  const sonuc = useMemo(() => diibSatirlari(belgeler, kayitlar, dosyalar, bolunmeler), [belgeler, kayitlar, dosyalar, bolunmeler]);
  const ozetler = useMemo(() => diibOzetleri(belgeler, sonuc), [belgeler, sonuc]);
  // Kullanimda = EN SON kesilen faturanin yazildigi (kalani olan, aktif) DIIB; fatura yoksa siradaki ilk
  const kullanimda = useMemo(() => {
    const acik = new Set(ozetler.filter((o) => o.belge.durum === "aktif" && o.kalanKg > 0).map((o) => o.belge.id));
    const son = [...sonuc.satirlar].filter((x) => x.faturaTarihi && acik.has(x.diibId)).sort((a, b) => (b.faturaTarihi || "").localeCompare(a.faturaTarihi || ""))[0];
    return son?.diibId ?? ozetler.find((o) => acik.has(o.belge.id))?.belge.id ?? null;
  }, [ozetler, sonuc]);
  useEffect(() => { if (!secili && ozetler.length) setSecili(kullanimda ?? ozetler[0].belge.id); }, [ozetler, kullanimda, secili]);
  const seciliOzet = ozetler.find((o) => o.belge.id === secili) ?? null;

  // Faturayi incele (11.11.2026): satirin dosyasindaki fatura PDF'i; bolunmus yuklemede o parcanin PDF'i.
  const faturaUrl = useCallback((s: DiibSatiri): string | null => {
    if (!s.dosyaId) return null;
    const parcalar = bolunmeler.filter((b) => b.dosya_id === s.dosyaId);
    if (parcalar.length) {
      const p = s.bolunmeSira ? parcalar.find((b) => b.sira === s.bolunmeSira)
        : parcalar.find((b) => faturaNorm(b.fatura_no) && faturaNorm(b.fatura_no) === faturaNorm(s.faturaNo));
      if (p?.fatura_dosya_url) return p.fatura_dosya_url;
    }
    const d = dosyalar.find((x) => x.id === s.dosyaId);
    if (!d?.fatura_dosya_url) return null;
    // Bolunmus dosyada ana PDF yalniz ilk parcaya / ayni fatura no'ya aittir
    return !parcalar.length || faturaNorm(d.fatura_no) === faturaNorm(s.faturaNo) || s.bolunmeSira === 1 ? d.fatura_dosya_url : null;
  }, [bolunmeler, dosyalar]);

  // Rapor mailindeki "faturayi incele" baglantisi: /diib?fatura=NO -> ilgili DIIB secilir, satir aranir
  const [derinBag, setDerinBag] = useState<string | null>(null);
  useEffect(() => {
    const no = new URLSearchParams(window.location.search).get("fatura");
    if (no) setDerinBag(no.slice(0, 40));
  }, []);
  useEffect(() => {
    if (!derinBag || !sonuc.satirlar.length) return;
    const s = sonuc.satirlar.find((x) => faturaNorm(x.faturaNo) === faturaNorm(derinBag));
    if (s) { setSecili(s.diibId); setArama(derinBag); }
    setDerinBag(null);
  }, [derinBag, sonuc]);
  const email = user?.email?.toLowerCase() ?? null;

  // Excel'e aktar: Burak Bey'in formu, tamamen sistem verisinden
  const excelAktar = async () => {
    setAktariliyor(true);
    try {
      const blob = await diibExcelOlustur(ozetler, sonuc.satirlar);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `DIIB_Takibi_${new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch { showToast("Excel dosyası hazırlanamadı.", "error"); }
    setAktariliyor(false);
  };

  // Yuklenmis beyannamesi olup beyanname no'su bos dosyalar: numarayi PDF'ten oku, dosyaya yaz
  const beyanBekleyen = useMemo(() => dosyalar.filter((d) => d.beyanname_dosya_url && !d.beyanname_no && faturaNorm(d.fatura_no)), [dosyalar]);
  const beyannameNolariniOku = async () => {
    if (!companyId || !beyanBekleyen.length) return;
    let yazilan = 0, okunamayan = 0;
    setBeyanOkuma({ yapilan: 0, toplam: beyanBekleyen.length });
    for (let i = 0; i < beyanBekleyen.length; i++) {
      const d = beyanBekleyen[i];
      try {
        // Kayitli adres uzun sureli imzali URL; depo yolu cikarilabilirse oturumla indirilir
        const m = /\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/([^?]+)/.exec(String(d.beyanname_dosya_url));
        let veri: ArrayBuffer | null = null;
        if (m) {
          const dl = await supabase.storage.from(m[1]).download(decodeURIComponent(m[2]));
          if (!dl.error && dl.data) veri = await dl.data.arrayBuffer();
        }
        if (!veri) { const r = await fetch(String(d.beyanname_dosya_url)); if (r.ok) veri = await r.arrayBuffer(); }
        const no = veri ? await beyannameNoOku(veri) : null;
        if (no) {
          const u = await supabase.from("ihracat_dosyalari").update({ beyanname_no: no }).eq("id", d.id).eq("company_id", companyId).is("beyanname_no", null).select("id");
          if (!yazmaHatasi(u.error, u.data)) yazilan++; else okunamayan++;
        } else okunamayan++;
      } catch { okunamayan++; }
      setBeyanOkuma({ yapilan: i + 1, toplam: beyanBekleyen.length });
    }
    setBeyanOkuma(null);
    showToast(`${yazilan} dosyanın beyanname numarası beyannameden okundu.${okunamayan ? ` ${okunamayan} beyanname okunamadı (Ek Bilgiler'den girin).` : ""}`, yazilan ? "success" : "error");
    getir(true);
  };

  const satirSil = async () => {
    if (!silinecek?.kayitId) return;
    setSiliniyor(true);
    const { data, error } = await supabase.from("diib_ihracatlari").delete().eq("id", silinecek.kayitId).eq("company_id", companyId!).select("id");
    setSiliniyor(false);
    const sorun = yazmaHatasi(error, data);
    if (sorun) { showToast(`Silinemedi: ${sorun}`, "error"); return; }
    showToast(silinecek.dosyaId ? "Düzeltme silindi; satır yeniden dosyadan otomatik hesaplanır." : "Satır silindi.", "success");
    setSilinecek(null);
    getir(true);
  };

  if (authLoading || (yukleniyor && !hata)) {
    return <SayfaYukleniyor className="flex justify-center py-24" boyut={26} />;
  }

  return (
    <div className="max-w-[1400px]">
      <SayfaBasligi
        ikon={<ClipboardCheck size={20} />}
        baslik="DİİB Takibi"
        aciklama="Dahilde İşleme İzin Belgeleri: ihracat taahhüdü, gerçekleşen ve kalan. Faturası kesilen yüklemeler otomatik eklenir."
        sag={
          <div className="flex flex-wrap gap-2">
            {belgeler.length > 0 && (
              <button onClick={excelAktar} disabled={aktariliyor} data-testid="excel-aktar" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5 disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>
                {aktariliyor ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {"Excel'e aktar"}
              </button>
            )}
            <button onClick={() => setBelgeFormu("yeni")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white hover:brightness-110" style={{ backgroundColor: ACCENT }}>
              <Plus size={14} /> Yeni DİİB
            </button>
            <button onClick={() => getir(true)} disabled={yenileniyor} aria-label="Yenile" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5 disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              <RefreshCw size={14} className={yenileniyor ? "animate-spin" : ""} />
            </button>
          </div>
        }
      />
      {hata && <p className="mb-4 text-sm text-red-400 flex items-center gap-1.5" role="alert"><AlertTriangle size={14} /> {hata}</p>}

      {!hata && belgeler.length === 0 ? (
        <EmptyState icon={<ClipboardCheck size={40} />} title="Henüz DİİB yok"
          description="DİİB belgesini ekleyin (no, tarih, ithalat izni). Faturası kesilen yüklemeler, dosyalardaki DİİB numarasıyla kendiliğinden eklenir; sistem öncesi ihracat DİİB'e bir kez devir olarak girilir." />
      ) : !hata && (
        <>
          <GenelTablo ozetler={ozetler} secili={secili} kullanimda={kullanimda} onSec={setSecili} />
          {beyanBekleyen.length > 0 && (
            <div className="mb-5 rounded-xl border px-4 sm:px-5 py-3 flex flex-wrap items-center gap-3" style={kartStil} data-testid="beyan-oku-bandi">
              <FileSearch size={16} style={{ color: ACCENT }} />
              <p className="text-sm flex-1 min-w-[220px]" style={{ color: "#CBD5E1" }}>
                <b className="text-white">{beyanBekleyen.length}</b> dosyanın beyannamesi yüklü ama beyanname numarası boş. Numaralar yüklenen beyannamelerden okunabilir.
              </p>
              <button onClick={beyannameNolariniOku} disabled={!!beyanOkuma} data-testid="beyan-oku" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
                {beyanOkuma ? <><Loader2 size={12} className="animate-spin" /> {beyanOkuma.yapilan}/{beyanOkuma.toplam}</> : <>Beyannamelerden oku</>}
              </button>
            </div>
          )}
          <Uyarilar ozetler={ozetler} sonuc={sonuc} belgeler={belgeler}
            onEslestir={(dosya, diibId) => setSatirFormu({ satir: null, diibId, dosya })} />
          <BekleyenYuklemeler sonuc={sonuc} ozetler={ozetler} bolunmeler={bolunmeler} />
          {seciliOzet && (
            <DiibAyrinti ozet={seciliOzet} faturaUrl={faturaUrl} satirlar={sonuc.satirlar.filter((s) => s.diibId === seciliOzet.belge.id)} arama={arama} setArama={setArama}
              onBelgeDuzenle={() => setBelgeFormu(seciliOzet.belge)}
              onSatirEkle={() => setSatirFormu({ satir: null, diibId: seciliOzet.belge.id })}
              onSatirDuzenle={(s) => setSatirFormu({ satir: s, diibId: s.diibId })}
              onSatirSil={(s) => setSilinecek(s)} />
          )}
        </>
      )}

      {belgeFormu && (
        <BelgePenceresi belge={belgeFormu === "yeni" ? null : belgeFormu} belgeler={belgeler} satirSayisi={belgeFormu === "yeni" ? 0 : sonuc.satirlar.filter((s) => s.diibId === (belgeFormu as DiibBelgesi).id && s.kayitId).length}
          companyId={companyId!} email={email} onKapat={() => setBelgeFormu(null)}
          onBitti={(m, id) => { showToast(m, "success"); setBelgeFormu(null); if (id) setSecili(id); else setSecili(null); getir(true); }} />
      )}
      {satirFormu && (
        <SatirPenceresi {...satirFormu} belgeler={belgeler} companyId={companyId!} email={email} onKapat={() => setSatirFormu(null)}
          onBitti={(m) => { showToast(m, "success"); setSatirFormu(null); getir(true); }} />
      )}
      <ConfirmDialog
        open={!!silinecek}
        onOpenChange={(a) => { if (!a && !siliniyor) setSilinecek(null); }}
        title={silinecek?.dosyaId ? "Düzeltme silinsin mi?" : "Satır silinsin mi?"}
        description={silinecek ? `${silinecek.faturaNo || "Fatura no'suz satır"} · ${silinecek.cari} · ${kgYaz(silinecek.miktarKg)} kg${silinecek.dosyaId ? ". Satır kaybolmaz; dosyadaki bilgilerle yeniden otomatik hesaplanır." : ". Bu işlem geri alınamaz."}` : ""}
        confirmLabel="Evet, sil" cancelLabel="Vazgeç" destructive onConfirm={satirSil} loading={siliniyor} loadingLabel="Siliniyor..."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Genel tablo (Excel "GENEL TABLO" + her sayfanin ozeti)
// ---------------------------------------------------------------------------
function GenelTablo({ ozetler, secili, kullanimda, onSec }: { ozetler: DiibOzeti[]; secili: string | null; kullanimda: string | null; onSec: (id: string) => void }) {
  const t = ozetler.reduce((a, o) => ({ taahhut: a.taahhut + o.taahhutKg, kg: a.kg + o.gerceklesenKg, kalan: a.kalan + Math.max(0, o.kalanKg), tutar: a.tutar + o.tutar, hak: a.hak + o.hakEdilenIthalatKg, izin: a.izin + sayiOku(o.belge.ithalat_izin_kg) }), { taahhut: 0, kg: 0, kalan: 0, tutar: 0, hak: 0, izin: 0 });
  return (
    <section className="rounded-xl border overflow-hidden mb-5" style={kartStil} aria-label="Genel tablo">
      {/* Telefon: kart gorunumu (kalan / ilerleme one cikar) */}
      <ul className="md:hidden divide-y" style={{ borderColor: CARD_BORDER }} data-testid="diib-kartlar">
        {ozetler.map((o) => {
          const d = diibDurumu(o, kullanimda);
          return (
            <li key={o.belge.id} style={{ borderColor: CARD_BORDER }}>
              <button onClick={() => onSec(o.belge.id)} aria-pressed={o.belge.id === secili} className="w-full text-left px-4 py-3" style={{ backgroundColor: o.belge.id === secili ? "rgba(16,185,129,0.07)" : undefined }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-white">{o.belge.belge_no}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${d.sinif}`}>{d.etiket}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, o.yuzde)}%`, backgroundColor: o.kalanKg <= 0 ? "#34D399" : ACCENT }} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]" style={{ color: TEXT_MUTED }}>
                  <span>Taahhüt<b className="block text-[13px] text-white tabular-nums">{kgYaz(o.taahhutKg)}</b></span>
                  <span>Gerçekleşen<b className="block text-[13px] text-white tabular-nums">{kgYaz(o.gerceklesenKg)}</b></span>
                  <span>Kalan<b className={`block text-[13px] tabular-nums ${o.kalanKg > 0 ? "text-amber-300" : "text-emerald-400"}`}>{kgYaz(Math.max(0, o.kalanKg))}</b></span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full" data-testid="diib-genel">
          <thead>
            <tr style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
              <th className={`${gtTh} text-left`} lang="tr">DİİB No · Tarih</th>
              <th className={`${gtTh} text-right`}>İthalat izni (kg)</th>
              <th className={`${gtTh} text-right`}>İhracat taahhüdü (kg)</th>
              <th className={`${gtTh} text-right`}>Gerçekleşen (kg)</th>
              <th className={`${gtTh} text-right`}>Kalan (kg)</th>
              <th className={`${gtTh} text-left min-w-[96px]`}>İlerleme</th>
              <th className={`${gtTh} text-right`}>Tutar</th>
              <th className={`${gtTh} text-right`}>Ort. birim</th>
              <th className={`${gtTh} text-right`}>Hak edilen ithalat (kg)</th>
              <th className={`${gtTh} text-left`}>Durum</th>
            </tr>
          </thead>
          <tbody>
            {ozetler.map((o) => {
              const d = diibDurumu(o, kullanimda);
              const aktif = o.belge.id === secili;
              return (
                <tr key={o.belge.id} onClick={() => onSec(o.belge.id)} data-testid="diib-satiri" aria-selected={aktif}
                  className="border-t cursor-pointer hover:bg-white/[0.03]" style={{ borderColor: CARD_BORDER, backgroundColor: aktif ? "rgba(16,185,129,0.07)" : undefined, boxShadow: aktif ? `inset 3px 0 0 ${ACCENT}` : undefined }}>
                  <td className="px-2.5 py-2 whitespace-nowrap">
                    <span className="block text-sm font-semibold text-white font-mono">{o.belge.belge_no}</span>
                    <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{o.belge.belge_tarihi ? formatDateTR(o.belge.belge_tarihi) : "-"}</span>
                  </td>
                  <td className={`${gtTd} text-right`} style={{ color: TEXT_MUTED }}>{kgYaz(sayiOku(o.belge.ithalat_izin_kg))}</td>
                  <td className={`${gtTd} text-right text-white`}>{kgYaz(o.taahhutKg)}</td>
                  <td className={`${gtTd} text-right text-white font-semibold`}>{kgYaz(o.gerceklesenKg)}</td>
                  <td className={`px-2.5 py-2.5 text-sm text-right tabular-nums whitespace-nowrap font-bold ${o.kalanKg > 0 ? "text-amber-300" : "text-emerald-400"}`}>{kgYaz(Math.max(0, o.kalanKg))}</td>
                  <td className="px-2.5 py-2.5">
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} aria-label={`%${Math.min(100, o.yuzde).toFixed(1)}`}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, o.yuzde)}%`, backgroundColor: o.kalanKg <= 0 ? "#34D399" : ACCENT }} />
                    </div>
                    <span className="text-[10.5px] tabular-nums" style={{ color: TEXT_MUTED }}>%{Math.min(100, o.yuzde).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</span>
                  </td>
                  <td className={`${gtTd} text-right text-white`}>{paraYaz(o.tutar)}</td>
                  <td className={`${gtTd} text-right`} style={{ color: TEXT_MUTED }}>{birimYaz(o.ortalamaFiyat)}</td>
                  <td className={`${gtTd} text-right`} style={{ color: TEXT_MUTED }}>{kgYaz(Math.round(o.hakEdilenIthalatKg))}</td>
                  <td className="px-2.5 py-2.5 whitespace-nowrap"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${d.sinif}`}>{d.etiket}</span></td>
                </tr>
              );
            })}
            <tr className="border-t" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
              <td className="px-2.5 py-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: TEXT_MUTED }} >Toplam</td>
              <td className="px-2.5 py-2.5 text-sm text-right tabular-nums" style={{ color: TEXT_MUTED }}>{kgYaz(t.izin)}</td>
              <td className="px-2.5 py-2.5 text-sm text-right tabular-nums text-white font-semibold">{kgYaz(t.taahhut)}</td>
              <td className="px-2.5 py-2.5 text-sm text-right tabular-nums text-white font-semibold">{kgYaz(t.kg)}</td>
              <td className="px-2.5 py-2.5 text-sm text-right tabular-nums text-amber-300 font-bold">{kgYaz(t.kalan)}</td>
              <td />
              <td className="px-2.5 py-2.5 text-sm text-right tabular-nums text-white font-semibold">{paraYaz(t.tutar)}</td>
              <td className="px-2.5 py-2.5 text-sm text-right tabular-nums" style={{ color: TEXT_MUTED }}>{t.kg ? birimYaz(t.tutar / t.kg) : "-"}</td>
              <td className="px-2.5 py-2.5 text-sm text-right tabular-nums" style={{ color: TEXT_MUTED }}>{kgYaz(Math.round(t.hak))}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Uyarilar: fatura no'suz satirlar, DIIB'i bulunamayan faturali dosyalar
// ---------------------------------------------------------------------------
function Uyarilar({ ozetler, sonuc, belgeler, onEslestir }: {
  ozetler: DiibOzeti[]; sonuc: ReturnType<typeof diibSatirlari>; belgeler: DiibBelgesi[];
  onEslestir: (d: DiibDosyasi, diibId: string) => void;
}) {
  const faturasiz = sonuc.satirlar.filter((s) => !faturaNorm(s.faturaNo));
  const [secim, setSecim] = useState<Record<string, string>>({});
  if (!faturasiz.length && !sonuc.eslesmeyen.length) return null;
  const belgeNo = (id: string) => belgeler.find((b) => b.id === id)?.belge_no ?? "-";
  return (
    <section className="rounded-xl border mb-5 px-4 sm:px-5 py-4 space-y-3" style={{ borderColor: "rgba(251,191,36,0.35)", backgroundColor: "rgba(245,158,11,0.06)" }} data-testid="diib-uyarilar">
      <p className="text-sm font-semibold text-amber-300 flex items-center gap-1.5"><AlertTriangle size={15} /> Kontrol edilmesi gerekenler</p>
      {faturasiz.length > 0 && (
        <div>
          <p className="text-xs mb-1.5" style={{ color: "#E2C887" }}>Fatura numarası olmayan satırlar: sistemdeki bir faturayla aynı yüklemeyse <b>çift sayılıyordur</b> ve kalan olduğundan az görünür. Satırı açıp fatura no girin ya da tekrarsa silin.</p>
          <ul className="text-xs space-y-1">
            {faturasiz.map((s) => (
              <li key={s.anahtar} className="flex flex-wrap gap-x-2" data-testid="faturasiz-satir">
                <span className="font-mono text-white">{belgeNo(s.diibId)}</span><span style={{ color: TEXT_MUTED }}>·</span>
                <span className="text-white">{s.cari}</span><span style={{ color: TEXT_MUTED }}>· {kgYaz(s.miktarKg)} kg · {paraYaz(s.tutar, s.paraBirimi)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sonuc.eslesmeyen.length > 0 && (
        <div>
          <p className="text-xs mb-1.5" style={{ color: "#E2C887" }}>Faturası kesilmiş ama DİİB alanından belge bulunamayan yüklemeler (kalana sayılmıyor). DİİB seçip ekleyin:</p>
          <ul className="space-y-1.5">
            {sonuc.eslesmeyen.map(({ dosya, kg }) => (
              <li key={dosya.id} className="flex flex-wrap items-center gap-2 text-xs" data-testid="eslesmeyen">
                <Link href={`/dosya/${dosya.id}`} className="font-mono text-white hover:underline">{dosya.dosya_no}</Link>
                <span style={{ color: TEXT_MUTED }}>{dosya.fatura_no} · {dosya.alici_firma} · {kgYaz(kg)} kg · DİİB alanı: “{dosya.diib_no || "boş"}”</span>
                <select aria-label={`${dosya.dosya_no} DİİB`} value={secim[dosya.id] || ""} onChange={(e) => setSecim((s) => ({ ...s, [dosya.id]: e.target.value }))} className="px-2 py-1 border rounded-md text-xs text-white" style={girdiStil}>
                  <option value="">DİİB seçin</option>
                  {ozetler.map((o) => <option key={o.belge.id} value={o.belge.id}>{o.belge.belge_no}</option>)}
                </select>
                <button disabled={!secim[dosya.id]} onClick={() => onEslestir(dosya, secim[dosya.id])} className="px-2 py-1 rounded-md text-xs font-semibold text-white disabled:opacity-40" style={{ backgroundColor: ACCENT }}>Ekle</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bekleyen yuklemeler: faturasi kesilmemis acik dosyalar + bolunme ihtiyaci
// ---------------------------------------------------------------------------
function BekleyenYuklemeler({ sonuc, ozetler, bolunmeler }: { sonuc: ReturnType<typeof diibSatirlari>; ozetler: DiibOzeti[]; bolunmeler: DiibBolunmesi[] }) {
  const { companyId } = useAuth();
  const [sira, setSira] = useState<Record<string, BekleyenSira>>({});
  const idler = sonuc.bekleyen.map((x) => x.dosya.id).sort().join(",");
  useEffect(() => {
    if (!companyId || !idler) return;
    let iptal = false;
    bekleyenSiraGetir(companyId, idler.split(",")).then((x) => { if (!iptal) setSira(x); });
    return () => { iptal = true; };
  }, [companyId, idler]);
  const sirali = useMemo(() => siraliBekleyenler(sonuc, ozetler, bolunmeler, sira), [sonuc, ozetler, bolunmeler, sira]);
  if (!sonuc.bekleyen.length) return null;
  // Cut-off "UTC etiketli ama yerel" saklanir: metinden HAM okunur (lib/cutoff-utils; saat dilimi cevrilmez)
  const tarihYaz = (t: string | null) => !t ? "-" : t.length === 10 ? formatCutoffTarih(t).slice(0, 5) : `${formatCutoffTarih(t).slice(0, 5)} ${formatCutoffSaat(t)}`;
  return (
    <section className="rounded-xl border overflow-hidden mb-5" style={kartStil} aria-label="Bekleyen yüklemeler">
      <div className="px-4 sm:px-5 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
        <p className="text-sm font-semibold text-white">Faturası kesilmemiş yüklemeler ({sonuc.bekleyen.length})</p>
        <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
          <b className="text-white">Sırayla</b> hesaplanır: talimat cut-off&apos;u (yoksa ETD&apos;si) önce olan yükleme DİİB kalanından önce düşer, sonraki onun kalanını görür. Miktar: konteynerlerin net ağırlığı girilmişse yüklenen, yoksa proforma. Kalan yetmeyen yükleme iki faturaya bölünür. Gerçekleşene sayılmaz.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full" data-testid="bekleyen-tablo">
          <thead>
            <tr style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
              <th className={`${thSinifi} text-left`}>Sıra</th>
              <th className={`${thSinifi} text-left`}>Dosya</th>
              <th className={`${thSinifi} text-left hidden md:table-cell`}>Alıcı · Ülke</th>
              <th className={`${thSinifi} text-left hidden lg:table-cell`}>Talimat C/O · ETD</th>
              <th className={`${thSinifi} text-right`}>Miktar (kg)</th>
              <th className={`${thSinifi} text-left hidden md:table-cell`}>DİİB</th>
              <th className={`${thSinifi} text-left`}>Fatura</th>
            </tr>
          </thead>
          <tbody>
            {sirali.map(({ dosya, kg, proformaKg, diib, sira: s, kayitli, oneri: o, oncekiler }, i) => (
              <tr key={dosya.id} className="border-t align-top" style={{ borderColor: CARD_BORDER }} data-testid="bekleyen-satir">
                <td className="px-3 py-2.5 text-sm tabular-nums" style={{ color: TEXT_MUTED }}>{i + 1}</td>
                <td className="px-3 py-2.5 text-sm whitespace-nowrap"><Link href={`/dosya/${dosya.id}?tab=evraklar`} className="font-mono text-white hover:underline inline-flex items-center gap-1">{dosya.dosya_no} <ExternalLink size={11} style={{ color: TEXT_MUTED }} /></Link></td>
                <td className="px-3 py-2.5 text-sm max-w-[260px] hidden md:table-cell" style={{ color: TEXT_MUTED }} title={dosya.alici_firma || ""}><span className="flex items-center gap-1.5 min-w-0"><UlkeBayrak ulke={dosyaTicaretUlkesi(dosya.ticaret_ulkesi, dosya.alici_adresi)} /><span className="truncate">{dosya.alici_firma}</span></span></td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap hidden lg:table-cell" style={{ color: TEXT_MUTED }}>{s ? `${tarihYaz(s.talimatCutoff)} · ${tarihYaz(s.etd)}` : "-"}</td>
                <td className="px-3 py-2.5 text-sm text-right tabular-nums text-white whitespace-nowrap">
                  {kgYaz(kg)}
                  {Math.abs(kg - proformaKg) > 0.5 && <span className="block text-[10px]" style={{ color: TEXT_MUTED }} data-testid="yuklenen-not">yüklenen · proforma {kgYaz(proformaKg)}</span>}
                </td>
                <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap hidden md:table-cell" style={{ color: diib ? "#fff" : "#F87171" }}>{diib?.belge_no ?? "Bulunamadı"}</td>
                <td className="px-3 py-2.5 text-xs min-w-[190px]">
                  {kayitli.length > 1 ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-sky-300"><Split size={12} /> {kayitli.length} fatura kaydedildi</span>
                  ) : o?.tur === "tek" ? (
                    <span className="text-emerald-400 font-semibold">Tek fatura · bu yüklemeden önce kalan {kgYaz(o.kalanKg)} kg</span>
                  ) : o?.tur === "bolunmeli" && o.parcalar.length === 1 && o.parcalar[0].diib.id !== diib?.id && o.eksikKg <= 0 ? (
                    <span className="font-semibold text-amber-300" data-testid="diib-degismeli">Tek fatura · tamamı {o.parcalar[0].diib.belge_no} (dosyadaki DİİB No değişmeli)</span>
                  ) : o?.tur === "bolunmeli" ? (
                    <span className="font-semibold text-amber-300" data-testid="bolunme-gerekir">
                      <Split size={12} className="inline -mt-0.5" /> {o.parcalar.length} fatura: {o.parcalar.map((p) => `${kgYaz(p.kg)} kg (${p.diib.belge_no})`).join(" + ")}
                      {o.eksikKg > 0 && <span className="text-red-400"> · {kgYaz(o.eksikKg)} kg için DİİB kalmadı</span>}
                    </span>
                  ) : <span className="text-red-400">{"Dosyanın DİİB alanı tanınmadı"}</span>}
                  {oncekiler.length > 0 && <span className="block mt-0.5 text-[11px]" style={{ color: TEXT_MUTED }}>Önce düşülen: {oncekiler.join(", ")}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Secili DIIB: fatura satirlari (Excel sayfasi)
// ---------------------------------------------------------------------------
const KAYNAK: Record<DiibSatiri["kaynak"], { etiket: string; sinif: string; title: string }> = {
  otomatik: { etiket: "Otomatik", sinif: "bg-emerald-500/10 text-emerald-400", title: "Sistemdeki dosyadan otomatik" },
  sistem: { etiket: "Düzeltildi", sinif: "bg-sky-500/10 text-sky-300", title: "Dosyadan geldi, elle düzeltildi" },
  elle: { etiket: "Elle", sinif: "bg-amber-500/10 text-amber-300", title: "Elle eklendi" },
};

function DiibAyrinti({ ozet, faturaUrl, satirlar, arama, setArama, onBelgeDuzenle, onSatirEkle, onSatirDuzenle, onSatirSil }: {
  ozet: DiibOzeti; faturaUrl: (s: DiibSatiri) => string | null; satirlar: DiibSatiri[]; arama: string; setArama: (s: string) => void;
  onBelgeDuzenle: () => void; onSatirEkle: () => void; onSatirDuzenle: (s: DiibSatiri) => void; onSatirSil: (s: DiibSatiri) => void;
}) {
  const ara = arama.trim().toLocaleLowerCase("tr-TR");
  const gorunen = ara ? satirlar.filter((s) => `${s.faturaNo} ${s.beyannameNo} ${s.cari} ${s.stokAdi} ${s.dosyaNo}`.toLocaleLowerCase("tr-TR").includes(ara)) : satirlar;
  return (
    <section className="rounded-xl border overflow-hidden" style={kartStil} aria-label={`${ozet.belge.belge_no} satırları`} data-testid="diib-ayrinti">
      <div className="px-4 sm:px-5 py-3 border-b flex flex-wrap items-center gap-3" style={{ borderColor: CARD_BORDER }}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white"><span className="font-mono">{ozet.belge.belge_no}</span> · İhracat</p>
          <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{ozet.satirSayisi} fatura{ozet.devirKg > 0 ? ` + devir ${kgYaz(ozet.devirKg)} kg` : ""} · taahhüt {kgYaz(ozet.taahhutKg)} kg · kalan <b className={ozet.kalanKg > 0 ? "text-amber-300" : "text-emerald-400"}>{kgYaz(Math.max(0, ozet.kalanKg))} kg</b>{ozet.belge.aciklama ? ` · ${ozet.belge.aciklama}` : ""}</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
          <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Fatura, beyanname, cari ara" aria-label="Satırlarda ara" className={`${girdiSinifi} pl-8 py-1.5`} style={girdiStil} />
        </div>
        <button onClick={onSatirEkle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}><Plus size={12} /> Satır ekle</button>
        <button onClick={onBelgeDuzenle} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}><Pencil size={12} /> DİİB bilgileri</button>
      </div>
      {gorunen.length === 0 && !(ozet.devirKg > 0 && !ara) ? <p className="text-sm py-8 text-center" style={{ color: TEXT_MUTED }}>{ara ? "Aramaya uyan satır yok." : "Bu DİİB'e henüz fatura yazılmamış."}</p> : (
        <div className="overflow-x-auto">
          <table className="min-w-full" data-testid="diib-satirlar">
            <thead>
              <tr style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
                <th className={`${thSinifi} text-left`}>Fatura No</th>
                <th className={`${thSinifi} text-left`}>Beyanname No</th>
                <th className={`${thSinifi} text-left`}>Fatura Tarihi</th>
                <th className={`${thSinifi} text-left`}>Cari · Ülke</th>
                <th className={`${thSinifi} text-left`}>Stok Adı</th>
                <th className={`${thSinifi} text-right`}>Miktar (kg)</th>
                <th className={`${thSinifi} text-right`}>Birim Fiyat</th>
                <th className={`${thSinifi} text-right`}>Tutar</th>
                <th className={`${thSinifi} text-left`}>Kaynak</th>
                <th className={`${thSinifi} w-16`} aria-label="İşlem" />
              </tr>
            </thead>
            <tbody>
              {gorunen.map((s) => {
                const k = KAYNAK[s.kaynak];
                const faturasiz = !faturaNorm(s.faturaNo);
                return (
                  <tr key={s.anahtar} className="border-t hover:bg-white/[0.02]" style={{ borderColor: CARD_BORDER, backgroundColor: faturasiz ? "rgba(245,158,11,0.06)" : undefined }} data-testid="diib-satir">
                    <td className="px-3 py-2 text-xs font-mono whitespace-nowrap text-white">
                      {(() => {
                        const url = faturaUrl(s);
                        const no = s.faturaNo || <span className="text-amber-300 font-sans font-semibold">Fatura no yok</span>;
                        return url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" data-testid="fatura-ac" title={`${s.faturaNo || "Fatura"} PDF'ini aç`}
                            className="inline-flex items-center gap-1.5 hover:underline decoration-dotted underline-offset-2">
                            {no}<FileText size={12} className="shrink-0" style={{ color: ACCENT }} aria-hidden="true" />
                          </a>
                        ) : no;
                      })()}
                      {s.bolunmeSira ? <span className="ml-1 text-[10px] text-sky-300 font-sans">({s.bolunmeSira}. fatura)</span> : null}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.beyannameNo || "-"}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.faturaTarihi ? formatDateTR(s.faturaTarihi) : "-"}</td>
                    <td className="px-3 py-2 text-sm text-white max-w-[240px]" title={s.ulke ? `${s.cari} · ${s.ulke}` : s.cari}><span className="flex items-center gap-1.5 min-w-0"><UlkeBayrak ulke={s.ulke} /><span className="truncate">{s.cari}</span></span></td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.stokAdi}</td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap text-white font-semibold">{kgYaz(s.miktarKg)}</td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap" style={{ color: TEXT_MUTED }}>{birimYaz(s.birimFiyat)}</td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums whitespace-nowrap text-white">{paraYaz(s.tutar, s.paraBirimi)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded ${k.sinif}`} title={k.title}>{k.etiket}</span>
                      {s.dosyaId && s.dosyaNo && <Link href={`/dosya/${s.dosyaId}`} className="ml-1.5 text-[10.5px] font-mono hover:text-white" style={{ color: TEXT_MUTED }}>{s.dosyaNo}</Link>}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-right">
                      <button onClick={() => onSatirDuzenle(s)} aria-label={`${s.faturaNo || s.cari} düzenle`} className="p-1 hover:text-white" style={{ color: TEXT_MUTED }}><Pencil size={13} /></button>
                      {s.kayitId && <button onClick={() => onSatirSil(s)} aria-label={`${s.faturaNo || s.cari} sil`} className="p-1 hover:text-red-400" style={{ color: "#4A5262" }}><Trash2 size={13} /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {ozet.devirKg > 0 && (
                <tr className="border-t" style={{ borderColor: CARD_BORDER }} data-testid="diib-devir">
                  <td colSpan={5} className="px-3 py-2 text-xs" style={{ color: TEXT_MUTED }}>Sistem öncesi ihracat (devir) · IHR-2026-0065&apos;ten önce kesilen faturalar</td>
                  <td className="px-3 py-2 text-sm text-right tabular-nums text-white">{kgYaz(ozet.devirKg)}</td>
                  <td className="px-3 py-2 text-sm text-right tabular-nums" style={{ color: TEXT_MUTED }}>{ozet.devirKg ? birimYaz(ozet.devirTutar / ozet.devirKg) : "-"}</td>
                  <td className="px-3 py-2 text-sm text-right tabular-nums text-white">{paraYaz(ozet.devirTutar)}</td>
                  <td colSpan={2} />
                </tr>
              )}
              <tr className="border-t" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                <td colSpan={5} className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>Gerçekleşen ihracat</td>
                <td className="px-3 py-2.5 text-sm text-right tabular-nums text-white font-bold">{kgYaz(ozet.gerceklesenKg)}</td>
                <td className="px-3 py-2.5 text-sm text-right tabular-nums" style={{ color: TEXT_MUTED }}>{birimYaz(ozet.ortalamaFiyat)}</td>
                <td className="px-3 py-2.5 text-sm text-right tabular-nums text-white font-bold">{paraYaz(ozet.tutar)}</td>
                <td colSpan={2} />
              </tr>
              <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                <td colSpan={5} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>Öngörülen ihracat (taahhüt)</td>
                <td className="px-3 py-1.5 text-sm text-right tabular-nums" style={{ color: TEXT_MUTED }}>{kgYaz(ozet.taahhutKg)}</td>
                <td colSpan={4} />
              </tr>
              <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                <td colSpan={5} className="px-3 py-1.5 pb-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>Kalan ihracat</td>
                <td className={`px-3 py-1.5 pb-2.5 text-sm text-right tabular-nums font-bold ${ozet.kalanKg > 0 ? "text-amber-300" : "text-emerald-400"}`} data-testid="diib-kalan">{kgYaz(ozet.kalanKg)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pencere iskeleti
// ---------------------------------------------------------------------------
function Pencere({ baslik, alt, genis = false, kilit, onKapat, children, altBar }: {
  baslik: string; alt?: React.ReactNode; genis?: boolean; kilit: boolean; onKapat: () => void; children: React.ReactNode; altBar: React.ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !kilit) onKapat(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [kilit, onKapat]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60" role="dialog" aria-modal="true" aria-label={baslik}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !kilit) onKapat(); }}>
      <div className={`w-full ${genis ? "max-w-4xl" : "max-w-xl"} max-h-[92vh] flex flex-col rounded-xl border shadow-xl`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div className="min-w-0"><p className="text-sm font-semibold text-white">{baslik}</p>{alt && <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{alt}</div>}</div>
          <button onClick={onKapat} disabled={kilit} className="hover:text-white disabled:opacity-50" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        <div className="px-5 py-3 border-t flex flex-wrap justify-end gap-2" style={{ borderColor: CARD_BORDER }}>{altBar}</div>
      </div>
    </div>
  );
}
const Etiket = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => <label htmlFor={htmlFor} className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>{children}</label>;
const IptalDugmesi = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
  <button onClick={onClick} disabled={disabled} className="px-4 py-2 rounded-lg border text-sm hover:bg-white/5 disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>Vazgeç</button>
);
const KaydetDugmesi = ({ onClick, yukleniyor, etiket = "Kaydet", testId }: { onClick: () => void; yukleniyor: boolean; etiket?: string; testId?: string }) => (
  <button onClick={onClick} disabled={yukleniyor} data-testid={testId} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
    {yukleniyor && <Loader2 size={14} className="animate-spin" />} {etiket}
  </button>
);

// ---------------------------------------------------------------------------
// DIIB belgesi ekle / duzenle
// ---------------------------------------------------------------------------
function BelgePenceresi({ belge, belgeler, satirSayisi, companyId, email, onKapat, onBitti }: {
  belge: DiibBelgesi | null; belgeler: DiibBelgesi[]; satirSayisi: number; companyId: string; email: string | null;
  onKapat: () => void; onBitti: (m: string, id: string | null) => void;
}) {
  const [f, setF] = useState(() => ({
    belge_no: belge?.belge_no ?? "", belge_tarihi: belge?.belge_tarihi ?? "",
    izin: belge ? String(sayiOku(belge.ithalat_izin_kg)) : "", taahhut: belge ? String(sayiOku(belge.ihracat_taahhut_kg)) : "",
    taahhutElle: !!belge, sira: String(belge?.kullanim_sirasi ?? Math.max(0, ...belgeler.map((b) => b.kullanim_sirasi)) + 1),
    durum: belge?.durum ?? "aktif", aciklama: belge?.aciklama ?? "",
    devirKg: belge && sayiOku(belge.devir_kg) ? String(sayiOku(belge.devir_kg)) : "", devirTutar: belge && sayiOku(belge.devir_tutar) ? String(sayiOku(belge.devir_tutar)) : "",
  }));
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [silOnay, setSilOnay] = useState(false);
  const izinKg = kgOku(f.izin);
  const taahhut = f.taahhutElle ? kgOku(f.taahhut) : Math.round(izinKg * DIIB_ORAN * 100) / 100;

  const kaydet = async () => {
    setHata(null);
    const anahtar = diibAnahtari(f.belge_no);
    if (!anahtar) { setHata("DİİB no bicimi tanınmadı. Örnek: 2026/D2-04219"); return; }
    if (belgeler.some((b) => b.anahtar === anahtar && b.id !== belge?.id)) { setHata("Bu DİİB zaten kayıtlı."); return; }
    if (!(izinKg > 0)) { setHata("İthalat izin miktarını (kg) girin."); return; }
    if (!(taahhut > 0)) { setHata("İhracat taahhüdü (kg) geçersiz."); return; }
    const devirKg = kgOku(f.devirKg), devirTutar = kgOku(f.devirTutar); // tutarda da Turkce binlik nokta ("460.124" = 460124)
    if (devirKg < 0 || devirTutar < 0) { setHata("Devir miktarı / tutarı eksi olamaz."); return; }
    if (devirKg > taahhut) { setHata("Devir miktarı taahhütten büyük olamaz."); return; }
    if (devirKg > 0 && devirTutar > 0 && !devirBirimMakul(devirTutar / devirKg)) { setHata(`Devir ortalama birim fiyatı ${birimYaz(devirTutar / devirKg)} USD/kg çıkıyor; tutarı kontrol edin (binlik için nokta: 460.124).`); return; }
    const satir = {
      belge_no: f.belge_no.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR"), anahtar, belge_tarihi: f.belge_tarihi || null,
      ithalat_izin_kg: izinKg, ihracat_taahhut_kg: taahhut, devir_kg: devirKg, devir_tutar: Math.round(devirTutar * 100) / 100, kullanim_sirasi: Math.max(0, Math.min(10000, Math.round(sayiOku(f.sira)))),
      durum: f.durum, aciklama: f.aciklama.trim() || null, guncelleyen_email: email,
    };
    setYukleniyor(true);
    const r = belge
      ? await supabase.from("diib_belgeleri").update(satir).eq("id", belge.id).eq("company_id", companyId).select("id")
      : await supabase.from("diib_belgeleri").insert({ ...satir, company_id: companyId, olusturan_email: email }).select("id");
    setYukleniyor(false);
    const sorun = yazmaHatasi(r.error, r.data);
    if (sorun) { setHata(/duplicate|23505/.test(sorun) ? "Bu DİİB zaten kayıtlı." : sorun); return; }
    onBitti(belge ? `${satir.belge_no} güncellendi.` : `${satir.belge_no} eklendi.`, (r.data?.[0] as { id: string } | undefined)?.id ?? null);
  };
  const sil = async () => {
    if (!belge) return;
    setYukleniyor(true);
    const r = await supabase.from("diib_belgeleri").delete().eq("id", belge.id).eq("company_id", companyId).select("id");
    setYukleniyor(false);
    const sorun = yazmaHatasi(r.error, r.data);
    if (sorun) { setHata(sorun); setSilOnay(false); return; }
    onBitti(`${belge.belge_no} silindi.`, null);
  };

  return (
    <Pencere baslik={belge ? `${belge.belge_no} bilgileri` : "Yeni DİİB"} alt="İhracat taahhüdü = ithalat izni × 0,97 × 0,74 (Excel'deki formül)" kilit={yukleniyor} onKapat={onKapat}
      altBar={<>
        {belge && <button onClick={() => setSilOnay(true)} disabled={yukleniyor} className="mr-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10"><Trash2 size={14} /> Sil</button>}
        <IptalDugmesi onClick={onKapat} disabled={yukleniyor} /><KaydetDugmesi onClick={kaydet} yukleniyor={yukleniyor} testId="belge-kaydet" />
      </>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><Etiket htmlFor="b-no">DİİB no *</Etiket><input id="b-no" value={f.belge_no} onChange={(e) => setF({ ...f, belge_no: e.target.value })} placeholder="2026/D2-04219" className={girdiSinifi} style={girdiStil} /></div>
        <div><Etiket htmlFor="b-tarih">Belge tarihi</Etiket><input id="b-tarih" type="date" value={f.belge_tarihi} onChange={(e) => setF({ ...f, belge_tarihi: e.target.value })} className={girdiSinifi} style={girdiStil} /></div>
        <div><Etiket htmlFor="b-izin">İthalat izni (kg buğday) *</Etiket><input id="b-izin" inputMode="decimal" value={f.izin} onChange={(e) => setF({ ...f, izin: e.target.value })} placeholder="10000000" className={girdiSinifi} style={girdiStil} /></div>
        <div>
          <Etiket htmlFor="b-taahhut">İhracat taahhüdü (kg un)</Etiket>
          <input id="b-taahhut" inputMode="decimal" value={f.taahhutElle ? f.taahhut : (taahhut ? String(taahhut) : "")} onChange={(e) => setF({ ...f, taahhut: e.target.value, taahhutElle: true })} className={girdiSinifi} style={girdiStil} />
          {f.taahhutElle && izinKg > 0 && <button onClick={() => setF({ ...f, taahhutElle: false })} className="mt-1 text-[11px] underline" style={{ color: TEXT_MUTED }}>Formülle hesapla ({kgYaz(Math.round(izinKg * DIIB_ORAN * 100) / 100)})</button>}
        </div>
        <div><Etiket htmlFor="b-sira">Kullanım sırası</Etiket><input id="b-sira" inputMode="numeric" value={f.sira} onChange={(e) => setF({ ...f, sira: e.target.value })} className={girdiSinifi} style={girdiStil} />
          <p className="text-[11px] mt-1" style={{ color: TEXT_MUTED }}>Küçük numara önce kullanılır; kalan yetmeyince fazlası sıradakine yazılır.</p></div>
        <div><Etiket htmlFor="b-durum">Durum</Etiket>
          <select id="b-durum" value={f.durum} onChange={(e) => setF({ ...f, durum: e.target.value as "aktif" | "tamamlandi" })} className={girdiSinifi} style={girdiStil}>
            <option value="aktif">Aktif</option><option value="tamamlandi">Kapatıldı (kullanılmaz)</option>
          </select></div>
        <div className="sm:col-span-2 rounded-lg border p-3" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
          <p className="text-xs font-semibold text-white">Sistem öncesi ihracat (devir)</p>
          <p className="text-[11px] mt-0.5 mb-2" style={{ color: TEXT_MUTED }}>Sistemdeki ilk ihracat dosyası IHR-2026-0065 (02.09.2026). Bu DİİB&apos;e ondan önce kesilen faturaların toplamını bir kez girin; sonraki faturalar otomatik eklenir.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Etiket htmlFor="b-devir-kg">Devir miktarı (kg)</Etiket><input id="b-devir-kg" inputMode="decimal" value={f.devirKg} onChange={(e) => setF({ ...f, devirKg: e.target.value })} placeholder="0" className={girdiSinifi} style={girdiStil} /></div>
            <div><Etiket htmlFor="b-devir-tutar">Devir tutarı (USD)</Etiket><input id="b-devir-tutar" inputMode="decimal" value={f.devirTutar} onChange={(e) => setF({ ...f, devirTutar: e.target.value })} placeholder="0" className={girdiSinifi} style={girdiStil} /></div>
          </div>
          {(f.devirKg.trim() || f.devirTutar.trim()) && (() => {
            const dk = kgOku(f.devirKg), dt = kgOku(f.devirTutar), b = dk > 0 && dt > 0 ? dt / dk : null;
            return (
              <p className={`text-[11px] mt-2 ${b !== null && !devirBirimMakul(b) ? "text-red-400" : ""}`} style={b !== null && !devirBirimMakul(b) ? undefined : { color: TEXT_MUTED }} data-testid="devir-okunan">
                Okunan: <b className="text-white">{kgYaz(dk)} kg</b> · <b className="text-white">{paraYaz(dt)}</b>{b !== null ? <> · ort. birim <b className="text-white">{birimYaz(b)}</b> USD/kg</> : null}
              </p>
            );
          })()}
        </div>
        <div className="sm:col-span-2"><Etiket htmlFor="b-aciklama">Açıklama</Etiket><input id="b-aciklama" value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} maxLength={500} className={girdiSinifi} style={girdiStil} /></div>
      </div>
      {hata && <p className="mt-3 text-sm text-red-400" role="alert">{hata}</p>}
      <ConfirmDialog open={silOnay} onOpenChange={(a) => { if (!a && !yukleniyor) setSilOnay(false); }} title={`${belge?.belge_no} silinsin mi?`}
        description={`DİİB ile birlikte elle eklenmiş / düzeltilmiş ${satirSayisi} satır ve devir bilgisi kalıcı olarak silinir. Sistemdeki dosyalar ve faturalar etkilenmez. Bu işlem geri alınamaz.`}
        confirmLabel="Evet, kalıcı sil" cancelLabel="Vazgeç" destructive onConfirm={sil} loading={yukleniyor} loadingLabel="Siliniyor..." />
    </Pencere>
  );
}

// ---------------------------------------------------------------------------
// Satir ekle / duzenle (otomatik satir duzenlenince "sistem" kaydi olur)
// ---------------------------------------------------------------------------
function SatirPenceresi({ satir, diibId, dosya, belgeler, companyId, email, onKapat, onBitti }: {
  satir: DiibSatiri | null; diibId: string; dosya?: DiibDosyasi; belgeler: DiibBelgesi[]; companyId: string; email: string | null;
  onKapat: () => void; onBitti: (m: string) => void;
}) {
  const kaynakDosya = dosya ?? null;
  const ilk = satir ?? (kaynakDosya ? (() => {
    const s = diibSatirlari([{ ...belgeler.find((b) => b.id === diibId)!, }], [], [{ ...kaynakDosya, diib_no: belgeler.find((b) => b.id === diibId)!.belge_no }], []).satirlar[0];
    return s ?? null;
  })() : null);
  const [f, setF] = useState(() => ({
    diib_id: ilk?.diibId ?? diibId, fatura_no: ilk?.faturaNo ?? "", beyanname_no: ilk?.beyannameNo ?? "", fatura_tarihi: ilk?.faturaTarihi ?? "",
    cari: ilk?.cari ?? "", stok_adi: ilk?.stokAdi ?? "BUĞDAY UNU / 25 KG", miktar: ilk ? String(ilk.miktarKg) : "",
    birim: ilk?.birimFiyat != null ? String(ilk.birimFiyat) : "", tutar: ilk ? String(ilk.tutar) : "", para_birimi: ilk?.paraBirimi ?? "USD", aciklama: "",
  }));
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const otomatik = !!ilk && !ilk.kayitId;
  const miktar = kgOku(f.miktar);
  const birim = f.birim.trim() ? sayiOku(f.birim) : null;
  const tutarHesap = birim !== null && miktar > 0 ? Math.round(birim * miktar * 100) / 100 : null;

  const kaydet = async () => {
    setHata(null);
    if (!(miktar > 0)) { setHata("Miktarı (kg) girin."); return; }
    if (!f.cari.trim()) { setHata("Cari ismini girin."); return; }
    const tutar = f.tutar.trim() ? kgOku(f.tutar) : tutarHesap ?? 0;
    const kayit = {
      diib_id: f.diib_id, fatura_no: f.fatura_no.replace(/\s+/g, "").toUpperCase() || null, beyanname_no: f.beyanname_no.replace(/\s+/g, "").toUpperCase() || null,
      fatura_tarihi: f.fatura_tarihi || null, cari: f.cari.replace(/\s+/g, " ").trim(), stok_adi: f.stok_adi.replace(/\s+/g, " ").trim() || "BUĞDAY UNU",
      miktar_kg: miktar, birim_fiyat: birim ?? (tutar && miktar ? Math.round(tutar / miktar * 1e6) / 1e6 : null), tutar,
      para_birimi: f.para_birimi === "EUR" ? "EUR" : "USD", guncelleyen_email: email,
      ...(f.aciklama.trim() ? { aciklama: f.aciklama.trim() } : {}),
    };
    setYukleniyor(true);
    const r = ilk?.kayitId
      ? await supabase.from("diib_ihracatlari").update(kayit).eq("id", ilk.kayitId).eq("company_id", companyId).select("id")
      : await supabase.from("diib_ihracatlari").insert({ ...kayit, company_id: companyId, dosya_id: ilk?.dosyaId ?? kaynakDosya?.id ?? null, kaynak: (ilk?.dosyaId || kaynakDosya) ? "sistem" : "elle", olusturan_email: email }).select("id");
    setYukleniyor(false);
    const sorun = yazmaHatasi(r.error, r.data);
    if (sorun) { setHata(/duplicate|23505/.test(sorun) ? "Bu fatura no başka bir satırda kayıtlı." : sorun); return; }
    onBitti(ilk?.kayitId ? "Satır güncellendi." : otomatik || kaynakDosya ? "Satır kaydedildi (dosyadan gelen bilgi düzeltildi)." : "Satır eklendi.");
  };

  return (
    <Pencere baslik={ilk?.kayitId ? "Satırı düzenle" : otomatik || kaynakDosya ? "Dosyadan gelen satırı düzelt" : "Satır ekle"}
      alt={otomatik || kaynakDosya ? <>Bilgiler <b className="text-white">{ilk?.dosyaNo ?? kaynakDosya?.dosya_no}</b> dosyasından geldi. Kaydedince bu DİİB satırı elle düzeltilmiş olarak saklanır; dosyanın kendisi değişmez.</> : undefined}
      kilit={yukleniyor} onKapat={onKapat}
      altBar={<><IptalDugmesi onClick={onKapat} disabled={yukleniyor} /><KaydetDugmesi onClick={kaydet} yukleniyor={yukleniyor} testId="satir-kaydet" /></>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2"><Etiket htmlFor="s-diib">DİİB</Etiket>
          <select id="s-diib" value={f.diib_id} onChange={(e) => setF({ ...f, diib_id: e.target.value })} className={girdiSinifi} style={girdiStil}>
            {belgeler.map((b) => <option key={b.id} value={b.id}>{b.belge_no}</option>)}
          </select></div>
        <div><Etiket htmlFor="s-fatura">Fatura no</Etiket><input id="s-fatura" value={f.fatura_no} onChange={(e) => setF({ ...f, fatura_no: e.target.value })} placeholder="UNX2026000000725" className={`${girdiSinifi} font-mono`} style={girdiStil} /></div>
        <div><Etiket htmlFor="s-beyan">Beyanname no</Etiket><input id="s-beyan" value={f.beyanname_no} onChange={(e) => setF({ ...f, beyanname_no: e.target.value })} placeholder="26343100EX00000000" className={`${girdiSinifi} font-mono`} style={girdiStil} /></div>
        <div><Etiket htmlFor="s-tarih">Fatura tarihi</Etiket><input id="s-tarih" type="date" value={f.fatura_tarihi} onChange={(e) => setF({ ...f, fatura_tarihi: e.target.value })} className={girdiSinifi} style={girdiStil} /></div>
        <div><Etiket htmlFor="s-cari">Cari (müşteri) *</Etiket><input id="s-cari" value={f.cari} onChange={(e) => setF({ ...f, cari: e.target.value })} maxLength={200} className={girdiSinifi} style={girdiStil} /></div>
        <div><Etiket htmlFor="s-stok">Stok adı</Etiket><input id="s-stok" value={f.stok_adi} onChange={(e) => setF({ ...f, stok_adi: e.target.value })} maxLength={120} className={girdiSinifi} style={girdiStil} /></div>
        <div><Etiket htmlFor="s-miktar">Miktar (kg) *</Etiket><input id="s-miktar" inputMode="decimal" value={f.miktar} onChange={(e) => setF({ ...f, miktar: e.target.value })} className={girdiSinifi} style={girdiStil} /></div>
        <div><Etiket htmlFor="s-birim">Birim fiyat (/kg)</Etiket><input id="s-birim" inputMode="decimal" value={f.birim} onChange={(e) => setF({ ...f, birim: e.target.value })} placeholder="0,475" className={girdiSinifi} style={girdiStil} /></div>
        <div><Etiket htmlFor="s-tutar">Tutar</Etiket>
          <div className="flex gap-2">
            <input id="s-tutar" inputMode="decimal" value={f.tutar} onChange={(e) => setF({ ...f, tutar: e.target.value })} placeholder={tutarHesap !== null ? String(tutarHesap) : ""} className={girdiSinifi} style={girdiStil} />
            <select aria-label="Para birimi" value={f.para_birimi} onChange={(e) => setF({ ...f, para_birimi: e.target.value })} className="px-2 border rounded-lg text-sm text-white" style={girdiStil}><option>USD</option><option>EUR</option></select>
          </div>
          {tutarHesap !== null && f.tutar.trim() && Math.abs(tutarHesap - kgOku(f.tutar)) > 1 && <p className="text-[11px] mt-1 text-amber-300">Miktar × birim = {kgYaz(tutarHesap)}; girilen tutardan farklı.</p>}
        </div>
        <div className="sm:col-span-2"><Etiket htmlFor="s-aciklama">Açıklama</Etiket><input id="s-aciklama" value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} maxLength={500} className={girdiSinifi} style={girdiStil} /></div>
      </div>
      {hata && <p className="mt-3 text-sm text-red-400" role="alert">{hata}</p>}
    </Pencere>
  );
}
