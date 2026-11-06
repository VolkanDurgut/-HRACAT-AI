"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, Loader2, Download, ShieldAlert, ArrowLeft, Ship, Container, Scale, AlertTriangle, Globe2, ExternalLink } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { supabase, type Dosya, type Konteyner, type Rezervasyon } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { girisSonrasiTemizle } from "@/lib/giris-donus";
import { talimatModeli, sayiTr } from "@/lib/konsimento/talimat";
import { konsimentoGumrukMusaviri } from "@/components/konsimento-talimat-hazirlik";
import { KONSIMENTO_SABLON_ADI } from "@/supabase/functions/_shared/konsimento-sablon";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

/**
 * KONSIMENTO TALIMATI GOR (06.11.2026). Kullanici: "Butun konteynerler alindiginda konsimento talimati
 * otomatik olusturulacak ve test olarak sensei adresine gonderilecek. Daha sonrasinda orada Talimat Gor
 * ile talimat acilabilecek ve indirilebilecek. Ic piyasadaki irsaliye kismi gibi."
 *   /belge/konsimento?d=<ihracat_dosyalari.id>
 * Hatirlatma maili ("Talimati Gor") ve dosyanin Konsimento Talimati karti buraya baglanir. Oturum gerekir
 * (AppShell; oturum yoksa giristen sonra buraya donulur). Talimat her acilista sistemdeki GUNCEL veriden
 * acente sablonuna gore uretilir (lib/konsimento/talimat-pdf.ts) - depoda kopya tutulmaz.
 */
/** Dosya kimligi bicimi (uuid); yetki RLS ile (company_id + rol). */
const KIMLIK = /^[0-9a-z-]{2,64}$/i;

function KonsimentoIcerik() {
  const params = useSearchParams();
  const { companyId, loading: authLoading } = useAuth();
  const dosyaId = params.get("d");
  const [veri, setVeri] = useState<{ dosya: Dosya; rez: Rezervasyon[]; kont: Konteyner[]; musavir: string | null } | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [adres, setAdres] = useState<string | null>(null);

  useEffect(() => { girisSonrasiTemizle(); }, []);

  useEffect(() => {
    if (authLoading || !companyId) return;
    let iptal = false;
    (async () => {
      setHata(null); setVeri(null);
      if (!dosyaId || !KIMLIK.test(dosyaId)) { setHata("Bağlantı geçersiz."); return; }
      const [d, r, k, musavir] = await Promise.all([
        supabase.from("ihracat_dosyalari").select("*").eq("id", dosyaId).eq("company_id", companyId).maybeSingle(),
        supabase.from("rezervasyonlar").select("*").eq("dosya_id", dosyaId).order("olusturma_tarihi"),
        supabase.from("konteynerler").select("*").eq("dosya_id", dosyaId).order("olusturma_tarihi"),
        konsimentoGumrukMusaviri(companyId),
      ]);
      if (iptal) return;
      if (!d.data) { setHata("Dosya bulunamadı ya da görüntüleme yetkiniz yok."); return; }
      setVeri({ dosya: d.data as Dosya, rez: (r.data || []) as Rezervasyon[], kont: (k.data || []) as Konteyner[], musavir });
    })();
    return () => { iptal = true; };
  }, [authLoading, companyId, dosyaId]);

  const model = useMemo(() => (veri ? talimatModeli({ dosya: veri.dosya, rezervasyonlar: veri.rez, konteynerler: veri.kont, gumrukMusaviri: veri.musavir }) : null), [veri]);
  const rezAdedi = (veri?.rez || []).reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
  const tamam = !!veri && rezAdedi > 0 && veri.kont.length === rezAdedi;

  useEffect(() => {
    if (!model || model.sablon === "msc_web") { setAdres(null); return; }
    let url: string | null = null; let iptal = false;
    import("@/lib/konsimento/talimat-pdf").then(({ talimatPdf }) => {
      if (iptal) return;
      const b = talimatPdf(model);
      if (b) { url = URL.createObjectURL(b); setAdres(url); }
    }).catch(() => setHata("Talimat oluşturulamadı. Lütfen sayfayı yenileyin."));
    return () => { iptal = true; if (url) URL.revokeObjectURL(url); };
  }, [model]);

  const baslik = model?.booking ? `Konşimento Talimatı ${model.booking}` : "Konşimento Talimatı";
  return (
    <div className="max-w-[1100px]">
      <SayfaBasligi ikon={<FileText size={20} />} baslik={baslik}
        aciklama={model ? `${model.dosyaNo}${model.aliciFirma ? ` · ${model.aliciFirma}` : ""} · ${KONSIMENTO_SABLON_ADI[model.sablon]}` : "Sistem verisinden oluşturulan talimat"}
        sag={(
          <div className="flex flex-wrap gap-2">
            {veri && (
              <Link href={`/dosya/${veri.dosya.id}?tab=evraklar`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>
                <ArrowLeft size={14} /> Dosyaya dön
              </Link>
            )}
            {adres && model && (
              <>
                <a href={adres} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>
                  <ExternalLink size={14} /> Yeni sekmede aç
                </a>
                <a href={adres} download={model.dosyaAdi} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: ACCENT }} data-testid="konsimento-sayfa-indir">
                  <Download size={14} /> İndir
                </a>
              </>
            )}
          </div>
        )}
      />

      {model && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3" data-testid="konsimento-ozet">
          {[
            { ikon: <FileText size={13} />, ad: "Booking", deger: model.booking || "-" },
            { ikon: <Ship size={13} />, ad: "Gemi / sefer", deger: model.gemi || "-" },
            { ikon: <Container size={13} />, ad: "Konteyner", deger: `${model.konteynerler.length}${rezAdedi ? ` / ${rezAdedi}` : ""}` },
            { ikon: <Scale size={13} />, ad: "Net / brüt", deger: `${sayiTr(model.toplamNet)} / ${sayiTr(model.toplamBrut)} kg` },
          ].map((x) => (
            <div key={x.ad} className="rounded-lg border px-3 py-2" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <p className="text-[10px] uppercase tracking-wider inline-flex items-center gap-1" style={{ color: TEXT_MUTED }}>{x.ikon} {x.ad}</p>
              <p className="text-sm font-semibold text-white mt-0.5 font-mono truncate" title={x.deger}>{x.deger}</p>
            </div>
          ))}
        </div>
      )}
      {model && model.sablon !== "msc_web" && (!tamam || model.eksikler.length > 0) && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs text-amber-300" style={{ borderColor: "rgba(251,191,36,0.35)", backgroundColor: "rgba(251,191,36,0.06)" }} data-testid="konsimento-sayfa-uyari">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{!tamam ? `Konteynerler henüz tamamlanmadı (${veri?.kont.length || 0}/${rezAdedi}). ` : ""}{model.eksikler.length ? `Eksik: ${model.eksikler.join(", ")}. Dosyanın Konşimento Talimatı kartından tamamlayabilirsiniz.` : ""}</span>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        {hata ? (
          <div className="flex flex-col items-center justify-center text-center py-20 px-6" data-testid="konsimento-hata">
            <ShieldAlert size={30} className="text-amber-400 mb-3" />
            <p className="text-sm text-white font-medium">{hata}</p>
          </div>
        ) : model?.sablon === "msc_web" ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6" data-testid="konsimento-sayfa-msc">
            <Globe2 size={30} className="text-sky-300 mb-3" />
            <p className="text-sm text-white font-medium">Bu dosyanın acentesi MSC: talimat MSC web sitesinden girilir.</p>
            <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>Sistem MSC için talimat oluşturmaz; yalnızca hatırlatma gönderir.</p>
          </div>
        ) : !adres ? (
          <div className="flex justify-center py-24" style={{ backgroundColor: ROW_HEADER_BG }}><Loader2 className="animate-spin" size={26} style={{ color: TEXT_MUTED }} /></div>
        ) : (
          <iframe src={adres} title={baslik} className="w-full h-[80vh] bg-white" data-testid="konsimento-pdf" />
        )}
      </div>
    </div>
  );
}

export default function KonsimentoTalimatiSayfasi() {
  return (
    <AppShell>
      <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="animate-spin" size={26} style={{ color: TEXT_MUTED }} /></div>}>
        <KonsimentoIcerik />
      </Suspense>
    </AppShell>
  );
}
