"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Download, FileCheck2, Loader2 } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { supabase, type Dosya, type Konteyner, type Rezervasyon } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { girisSonrasiTemizle } from "@/lib/giris-donus";
import { dosyaBolunmesiGetir } from "@/lib/diib/veri";
import { ONAY_DURUM_ADI, faturaOnayiGetir, talimatPdfUret, trZaman, type FaturaOnayKaydi } from "@/lib/fatura-onay";
import { ACCENT, CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { grupUyeleriniGetir } from "@/lib/birlesik-fatura/veri";
import { birlesikFaturaModeli } from "@/lib/birlesik-fatura/model";
import { birlesikTalimatPdfUret } from "@/lib/birlesik-fatura/pdf";

/**
 * FATURA TALIMATI (talimat maili sayfasi). Mailin "Fatura Talimatini Indir (PDF)" dugmesi buraya baglanir:
 *   /fatura-onay?id=<fatura_talimati_onaylari.id>&indir=1
 * Oturum gerekir (AppShell; oturum yoksa giristen sonra buraya donulur). Talimatin PDF'i dosya sayfasindaki
 * "Fatura Talimati Indir" ile AYNI ureticiyle tarayicida olusturulur, onizlenir; indir=1 ise bir kez kendiliginden indirilir.
 * 11.11.2026: onay / revize sayfasiydi. 14.11.2026 (kullanici): onay adimi kaldirildi; yalniz talimat + PDF indir.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Veri = { kayit: FaturaOnayKaydi; dosya: Dosya; rezervasyonlar: Rezervasyon[]; konteynerler: Konteyner[] };

function DurumRozeti({ k }: { k: FaturaOnayKaydi }) {
  const renk = k.durum === "gonderildi" || k.durum === "onaylandi" ? ["rgba(16,185,129,0.14)", "#6EE7B7"] : ["rgba(148,163,184,0.14)", "#CBD5E1"];
  return (
    <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-semibold" style={{ backgroundColor: renk[0], color: renk[1] }} data-testid="onay-durum">
      {ONAY_DURUM_ADI[k.durum] || k.durum}{k.test ? " · test" : ""}
    </span>
  );
}

function TalimatIcerik() {
  const params = useSearchParams();
  const { companyId, loading: authLoading } = useAuth();
  const id = params.get("id");
  const otomatikIndir = params.get("indir") === "1";
  const [veri, setVeri] = useState<Veri | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ url: string; ad: string } | null>(null);
  const [pdfHata, setPdfHata] = useState<string | null>(null);
  /** 19.11.2026: dosya birlesik faturadaysa gruptaki dosya numaralari (PDF grubun tek talimatidir) */
  const [grupDosyalari, setGrupDosyalari] = useState<string[] | null>(null);
  const indirildi = useRef(false);
  const indirRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => { girisSonrasiTemizle(); }, []);

  const yukle = useCallback(async () => {
    if (!companyId) return;
    setHata(null);
    if (!id || !UUID.test(id)) { setHata("Bağlantı geçersiz."); return; }
    try {
      const kayit = await faturaOnayiGetir(id);
      if (!kayit) { setHata("Kayıt bulunamadı ya da görüntüleme yetkiniz yok."); return; }
      const [d, r, k] = await Promise.all([
        supabase.from("ihracat_dosyalari").select("*").eq("id", kayit.dosya_id).eq("company_id", companyId).maybeSingle(),
        supabase.from("rezervasyonlar").select("*").eq("dosya_id", kayit.dosya_id).eq("company_id", companyId).order("olusturma_tarihi", { ascending: true }).order("id", { ascending: true }),
        supabase.from("konteynerler").select("*").eq("dosya_id", kayit.dosya_id).eq("company_id", companyId).order("olusturma_tarihi", { ascending: true }).order("id", { ascending: true }),
      ]);
      if (!d.data) { setHata("Dosya bulunamadı ya da görüntüleme yetkiniz yok."); return; }
      setVeri({ kayit, dosya: d.data as Dosya, rezervasyonlar: (r.data || []) as Rezervasyon[], konteynerler: (k.data || []) as Konteyner[] });
    } catch (e) { setHata(e instanceof Error ? e.message : "Kayıt okunamadı."); }
  }, [companyId, id]);
  useEffect(() => { if (!authLoading) yukle(); }, [authLoading, yukle]);

  // PDF: dosya sayfasindaki ureticiyle (DIIB bolunmesi + bayrak dahil)
  useEffect(() => {
    if (!veri || !companyId) return;
    let iptal = false; let url: string | null = null;
    (async () => {
      try {
        const grup = await grupUyeleriniGetir(companyId, veri.dosya.id);
        let p: { blob: Blob; ad: string };
        if (grup) {
          const model = birlesikFaturaModeli(grup.uyeler, grup.bolunmeliDosyalar);
          if (!iptal) setGrupDosyalari(model.dosyalar.map((d) => d.dosyaNo));
          p = await birlesikTalimatPdfUret(model, model.eksikDosyalar.length > 0);
        } else {
          const bolunme = await dosyaBolunmesiGetir(companyId, veri.dosya.id);
          p = await talimatPdfUret(veri.dosya, veri.rezervasyonlar, veri.konteynerler, bolunme);
        }
        if (iptal) return;
        url = URL.createObjectURL(p.blob);
        setPdf({ url, ad: p.ad });
      } catch (e) { if (!iptal) setPdfHata(e instanceof Error ? e.message : "PDF oluşturulamadı."); }
    })();
    return () => { iptal = true; if (url) URL.revokeObjectURL(url); };
  }, [veri, companyId]);

  // Maildeki "PDF indir" dugmesi (indir=1): PDF hazir olunca bir kez indir
  useEffect(() => {
    if (!pdf || !otomatikIndir || indirildi.current) return;
    indirildi.current = true;
    indirRef.current?.click();
  }, [pdf, otomatikIndir]);

  const k = veri?.kayit;
  const d = veri?.dosya;
  const rezKont = veri ? veri.rezervasyonlar.reduce((t, r) => t + (r.konteyner_adedi || 0), 0) : 0;

  return (
    <div className="max-w-[1200px] mx-auto">
      <SayfaBasligi ikon={<FileCheck2 size={20} />} baslik="Fatura Talimatı"
        aciklama={d ? `${d.alici_firma || "-"} · ${d.varis_limani || "-"}${d.dosya_no ? ` · ${d.dosya_no}` : ""}` : "Bütün konteynerleri girilen dosyanın fatura talimatı"} />

      {hata && (
        <div className="flex items-start gap-2 rounded-lg border px-3 py-2 mb-4 text-sm" role="alert" data-testid="onay-hata" style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "#FCA5A5" }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{hata}</span>
        </div>
      )}

      {!veri && !hata && <div className="flex items-center gap-2 text-sm py-10 justify-center" style={{ color: TEXT_MUTED }}><Loader2 size={16} className="animate-spin" /> Yükleniyor…</div>}

      {veri && k && d && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
          <section className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: CARD_BORDER }}>
              <p className="text-sm font-semibold text-white flex-1">Fatura talimatı (PDF)</p>
            </div>
            {pdf ? <iframe title="Fatura talimatı" src={pdf.url} className="w-full h-[70vh] min-h-[420px] bg-white" data-testid="onay-pdf" />
              : <div className="h-[50vh] flex items-center justify-center text-sm gap-2" style={{ color: pdfHata ? "#FCA5A5" : TEXT_MUTED }}>{pdfHata ? <><AlertTriangle size={16} /> {pdfHata}</> : <><Loader2 size={16} className="animate-spin" /> PDF hazırlanıyor…</>}</div>}
          </section>

          <aside className="space-y-3 lg:sticky lg:top-4">
            <a ref={indirRef} href={pdf?.url} download={pdf?.ad} aria-disabled={!pdf} data-testid="talimat-pdf-indir"
              onClick={(e) => { if (!pdf) e.preventDefault(); }}
              className={`w-full h-11 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white ${pdf ? "" : "opacity-50 pointer-events-none"}`}
              style={{ backgroundColor: "#10B981" }}>
              {pdf ? <Download size={16} /> : <Loader2 size={16} className="animate-spin" />} PDF İndir
            </a>

            <section className="rounded-xl border p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-sm font-semibold text-white">Talimat maili</p>
                <DurumRozeti k={k} />
              </div>
              <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                <dt style={{ color: TEXT_MUTED }}>Müşteri</dt><dd className="text-white font-medium">{d.alici_firma || "-"}</dd>
                <dt style={{ color: TEXT_MUTED }}>Varış limanı</dt><dd className="text-white">{d.varis_limani || "-"}</dd>
                <dt style={{ color: TEXT_MUTED }}>Konteyner</dt><dd className="text-white">{veri.konteynerler.length} / {rezKont} girildi</dd>
                {grupDosyalari && <><dt style={{ color: TEXT_MUTED }}>Birleşik fatura</dt><dd style={{ color: ACCENT }}>{grupDosyalari.length} dosya tek fatura: {grupDosyalari.join(", ")}</dd></>}
                <dt style={{ color: TEXT_MUTED }}>Gönderildi</dt><dd style={{ color: "#C9D1DC" }}>{trZaman(k.olusturma)} · {k.kaynak === "elle" ? (k.gonderen || "elle") : "otomatik"}</dd>
                {(k.gonderilen || []).length > 0 && <><dt style={{ color: TEXT_MUTED }}>Alıcılar</dt><dd className="break-all" style={{ color: "#C9D1DC" }}>{(k.gonderilen || []).join(", ")}</dd></>}
              </dl>
            </section>

            <Link href={`/dosya/${d.id}?tab=konteynerler`} className="block text-center text-xs underline" style={{ color: TEXT_MUTED }}>Dosyayı aç</Link>
            <p className="text-center text-[11px]" style={{ color: TEXT_MUTED }}>
              Yeniden göndermek için dosyanın Konteynerler sekmesinde <span style={{ color: ACCENT }}>Tekrar gönder</span>.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

export default function FaturaTalimatiSayfasi() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <TalimatIcerik />
      </Suspense>
    </AppShell>
  );
}
