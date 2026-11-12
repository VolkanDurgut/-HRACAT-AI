"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, FileCheck2, Loader2, PenLine, ShieldAlert, Undo2 } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { supabase, type Dosya, type Konteyner, type Rezervasyon } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { girisSonrasiTemizle } from "@/lib/giris-donus";
import { dosyaBolunmesiGetir } from "@/lib/diib/veri";
import { ONAY_DURUM_ADI, faturaOnayiGetir, onayla, onaylayabilir, revizeIste, talimatPdfUret, trZaman, type FaturaOnayKaydi } from "@/lib/fatura-onay";
import { ACCENT, CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";

/**
 * FATURA TALIMATI ONAYI (11.11.2026). Onay maili ("Incele ve Onayla" / "Revize iste") bu sayfaya baglanir:
 *   /fatura-onay?id=<fatura_talimati_onaylari.id>[&revize=1]
 * Oturum gerekir (AppShell; oturum yoksa giristen sonra buraya donulur). Talimatin PDF'i dosya sayfasindaki
 * "Fatura Talimati Indir" ile AYNI ureticiyle tarayicida olusturulur ve onizlenir. Onayla -> ayni PDF edge
 * fatura-onay'a gider, dagitim maili PDF ekli gider. Karar yalniz onay listesindekiler (edge de denetler).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Veri = { kayit: FaturaOnayKaydi; dosya: Dosya; rezervasyonlar: Rezervasyon[]; konteynerler: Konteyner[] };

function DurumRozeti({ k }: { k: FaturaOnayKaydi }) {
  const renk = k.durum === "onaylandi" ? ["rgba(16,185,129,0.14)", "#6EE7B7"] : k.durum === "revize" ? ["rgba(245,158,11,0.14)", "#FCD34D"] : ["rgba(244,160,124,0.14)", ACCENT];
  return (
    <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-semibold" style={{ backgroundColor: renk[0], color: renk[1] }} data-testid="onay-durum">
      {ONAY_DURUM_ADI[k.durum]}{k.test ? " · test" : ""}
    </span>
  );
}

function OnayIcerik() {
  const params = useSearchParams();
  const { user, companyId, loading: authLoading } = useAuth();
  const id = params.get("id");
  const revizeIlk = params.get("revize") === "1";
  const [veri, setVeri] = useState<Veri | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ url: string; base64: string; ad: string } | null>(null);
  const [pdfHata, setPdfHata] = useState<string | null>(null);
  const [revizeAcik, setRevizeAcik] = useState(revizeIlk);
  const [not, setNot] = useState("");
  const [mesgul, setMesgul] = useState<"onay" | "revize" | null>(null);
  const [sonuc, setSonuc] = useState<string | null>(null);
  const notRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { girisSonrasiTemizle(); }, []);

  const yukle = useCallback(async () => {
    if (!companyId) return;
    setHata(null);
    if (!id || !UUID.test(id)) { setHata("Bağlantı geçersiz."); return; }
    try {
      const kayit = await faturaOnayiGetir(id);
      if (!kayit) { setHata("Onay kaydı bulunamadı ya da görüntüleme yetkiniz yok."); return; }
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
        const bolunme = await dosyaBolunmesiGetir(companyId, veri.dosya.id);
        const p = await talimatPdfUret(veri.dosya, veri.rezervasyonlar, veri.konteynerler, bolunme);
        if (iptal) return;
        url = URL.createObjectURL(p.blob);
        setPdf({ url, base64: p.base64, ad: p.ad });
      } catch (e) { if (!iptal) setPdfHata(e instanceof Error ? e.message : "PDF oluşturulamadı."); }
    })();
    return () => { iptal = true; if (url) URL.revokeObjectURL(url); };
  }, [veri, companyId]);

  useEffect(() => { if (revizeAcik) setTimeout(() => notRef.current?.focus(), 60); }, [revizeAcik]);

  const k = veri?.kayit;
  const yetkili = !!k && onaylayabilir(k, user?.email);
  const bekliyor = k?.durum === "bekliyor";

  const onayVer = async () => {
    if (!k || !pdf) return;
    setMesgul("onay"); setHata(null);
    try {
      const s = await onayla(k.id, pdf.base64, pdf.ad);
      setSonuc(s.test ? `Onaylandı. Test modu: talimat yalnızca test adresine gönderildi (${s.alicilar.join(", ")}).` : `Onaylandı. Talimat ${s.alicilar.length} alıcıya PDF ekli gönderildi.`);
      await yukle();
    } catch (e) { setHata(e instanceof Error ? e.message : "Onaylanamadı."); }
    setMesgul(null);
  };
  const revizeGonder = async () => {
    if (!k) return;
    if (not.trim().length < 3) { setHata("Revize notu yazın (ne düzeltilmeli?)."); notRef.current?.focus(); return; }
    setMesgul("revize"); setHata(null);
    try {
      const s = await revizeIste(k.id, not.trim());
      setSonuc(s.mailHatasi ? `Revize kaydedildi, ancak bilgi maili gönderilemedi: ${s.mailHatasi}` : "Revize istendi; not onay grubuna gönderildi.");
      setRevizeAcik(false);
      await yukle();
    } catch (e) { setHata(e instanceof Error ? e.message : "Revize gönderilemedi."); }
    setMesgul(null);
  };

  const d = veri?.dosya;
  const rezKont = veri ? veri.rezervasyonlar.reduce((t, r) => t + (r.konteyner_adedi || 0), 0) : 0;

  return (
    <div className="max-w-[1200px] mx-auto">
      <SayfaBasligi ikon={<FileCheck2 size={20} />} baslik="Fatura Talimatı Onayı"
        aciklama={d ? `${d.alici_firma || "-"} · ${d.varis_limani || "-"}${d.dosya_no ? ` · ${d.dosya_no}` : ""}` : "Bütün konteynerleri yüklenen dosyanın fatura talimatı"} />

      {hata && (
        <div className="flex items-start gap-2 rounded-lg border px-3 py-2 mb-4 text-sm" role="alert" data-testid="onay-hata" style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "#FCA5A5" }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{hata}</span>
        </div>
      )}
      {sonuc && (
        <div className="flex items-start gap-2 rounded-lg border px-3 py-2 mb-4 text-sm" data-testid="onay-sonuc" style={{ borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.08)", color: "#6EE7B7" }}>
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> <span>{sonuc}</span>
        </div>
      )}

      {!veri && !hata && <div className="flex items-center gap-2 text-sm py-10 justify-center" style={{ color: TEXT_MUTED }}><Loader2 size={16} className="animate-spin" /> Yükleniyor…</div>}

      {veri && k && d && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
          <section className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: CARD_BORDER }}>
              <p className="text-sm font-semibold text-white flex-1">Fatura talimatı (PDF)</p>
              {pdf && <a href={pdf.url} download={pdf.ad} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}><Download size={13} /> İndir</a>}
            </div>
            {pdf ? <iframe title="Fatura talimatı" src={pdf.url} className="w-full h-[70vh] min-h-[420px] bg-white" data-testid="onay-pdf" />
              : <div className="h-[50vh] flex items-center justify-center text-sm gap-2" style={{ color: pdfHata ? "#FCA5A5" : TEXT_MUTED }}>{pdfHata ? <><AlertTriangle size={16} /> {pdfHata}</> : <><Loader2 size={16} className="animate-spin" /> PDF hazırlanıyor…</>}</div>}
          </section>

          <aside className="space-y-3 lg:sticky lg:top-4">
            <section className="rounded-xl border p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-sm font-semibold text-white">Durum</p>
                <DurumRozeti k={k} />
              </div>
              <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                <dt style={{ color: TEXT_MUTED }}>Alıcı</dt><dd className="text-white font-medium">{d.alici_firma || "-"}</dd>
                <dt style={{ color: TEXT_MUTED }}>Varış limanı</dt><dd className="text-white">{d.varis_limani || "-"}</dd>
                <dt style={{ color: TEXT_MUTED }}>Konteyner</dt><dd className="text-white">{veri.konteynerler.length} / {rezKont} yüklendi</dd>
                <dt style={{ color: TEXT_MUTED }}>Gönderildi</dt><dd style={{ color: "#C9D1DC" }}>{trZaman(k.olusturma)} · {k.kaynak === "elle" ? (k.gonderen || "elle") : "otomatik"}</dd>
                {k.karar_veren && <><dt style={{ color: TEXT_MUTED }}>{k.durum === "revize" ? "Revize isteyen" : "Onaylayan"}</dt><dd style={{ color: "#C9D1DC" }}>{k.karar_veren} · {trZaman(k.karar_zamani)}</dd></>}
                {k.revize_notu && <><dt style={{ color: TEXT_MUTED }}>Revize notu</dt><dd className="whitespace-pre-wrap" style={{ color: "#FCD34D" }} data-testid="onay-revize-notu">{k.revize_notu}</dd></>}
                {k.dagitim_konusu && <><dt style={{ color: TEXT_MUTED }}>Mail konusu</dt><dd style={{ color: "#C9D1DC" }}>{k.dagitim_konusu}</dd></>}
                {k.dagitim_alicilari && <><dt style={{ color: TEXT_MUTED }}>Gönderilen</dt><dd className="break-all" style={{ color: "#C9D1DC" }}>{k.dagitim_alicilari.join(", ")}</dd></>}
              </dl>
            </section>

            {bekliyor && (yetkili ? (
              <section className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: CARD_BG, borderColor: "rgba(16,185,129,0.35)" }} data-testid="onay-karar">
                <p className="text-xs leading-relaxed" style={{ color: "#C9D1DC" }}>
                  Onaylarsanız soldaki PDF, <b className="text-white">FATURA VE BEYANNAME TALİMATI HAKKINDA</b> konulu mailin ekinde dağıtım listesine (muhasebe dahil) gider.
                </p>
                <button type="button" onClick={onayVer} disabled={!pdf || !!mesgul} data-testid="onay-onayla"
                  className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: "#10B981" }}>
                  {mesgul === "onay" ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Onayla ve gönder
                </button>
                {!revizeAcik ? (
                  <button type="button" onClick={() => setRevizeAcik(true)} disabled={!!mesgul} data-testid="onay-revize-ac"
                    className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium border hover:bg-white/5 disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: "#FCD34D" }}>
                    <PenLine size={15} /> Revize iste
                  </button>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-xs" style={{ color: TEXT_MUTED }}>Ne düzeltilmeli?
                      <textarea ref={notRef} rows={4} maxLength={1000} value={not} onChange={(e) => setNot(e.target.value)} data-testid="onay-revize-not"
                        className="mt-1 w-full text-sm border rounded-md px-2 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/40" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F141C" }}
                        placeholder="Örn. 3. konteynerin net ağırlığı hatalı" />
                    </label>
                    <div className="flex gap-2">
                      <button type="button" onClick={revizeGonder} disabled={!!mesgul} data-testid="onay-revize-gonder"
                        className="flex-1 h-9 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: "#F59E0B", color: "#1F1300" }}>
                        {mesgul === "revize" ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />} Revizeyi gönder
                      </button>
                      <button type="button" onClick={() => setRevizeAcik(false)} disabled={!!mesgul} className="h-9 px-3 rounded-lg text-sm border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
                    </div>
                  </div>
                )}
              </section>
            ) : (
              <section className="rounded-xl border p-4 flex items-start gap-2 text-xs" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER, color: TEXT_MUTED }} data-testid="onay-yetkisiz">
                <ShieldAlert size={15} className="shrink-0 mt-0.5" /> Bu talimatı yalnızca onay listesindekiler onaylayabilir (Ayarlar &gt; Rapor Alıcıları &gt; Fatura Talimatı Onayı).
              </section>
            ))}

            <Link href={`/dosya/${d.id}?tab=konteynerler`} className="block text-center text-xs underline" style={{ color: TEXT_MUTED }}>Dosyayı aç</Link>
          </aside>
        </div>
      )}
    </div>
  );
}

export default function FaturaOnaySayfasi() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <OnayIcerik />
      </Suspense>
    </AppShell>
  );
}
