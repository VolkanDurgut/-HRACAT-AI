"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, Dosya, Rezervasyon, Konteyner, isDosyaAcik } from "@/lib/supabase";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import AppShell from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import DraftOnayKarti from "@/components/draft-onay-karti";
import {
  checkCommercialInvoiceReadiness,
  checkPackingListReadiness,
  checkCertificateOfOriginReadiness,
  checkPhytosanitaryCertificateReadiness,
  checkHealthCertificateReadiness,
} from "@/lib/document-readiness";
import { Loader2, FileCheck2, Search, X, Archive, Inbox } from "lucide-react";
import { MusteriEvrakAyarlari, BOS_MUSTERI_EVRAK_AYARLARI, musteriEvrakAyarlariniTopluGetir } from "@/lib/musteri-evrak-ayarlari";
import { TEXT_MUTED, CARD_BG, CARD_BORDER, ROW_HEADER_BG, ACCENT } from "@/lib/theme";
import { draftSuresiDoldu, draftYanitSonuMs } from "@/lib/draft-onay-sure";
import { CUTOFF_UYARI_ESIGI_MS } from "@/lib/cutoff-utils";

type DosyaWithRelations = Dosya & { rezervasyonlar: Rezervasyon[]; konteynerler: Konteyner[] };

/**
 * "Draft hazır" tanımı: Taslak Onay Paketi'yle (bkz. taslak-onay-butonu.tsx)
 * BIREBIR AYNI kriter - Commercial Invoice + Packing List + Draft BL +
 * Certificate of Origin + Phytosanitary + Health Certificate hepsi tam olmalı.
 * Tutarlılık icin aynı readiness fonksiyonları kullanılır.
 */
function tamEvrakSetiHazirMi(dosya: Dosya, rezervasyonlar: Rezervasyon[], konteynerler: Konteyner[]): boolean {
  const draftBlUrl = dosya.draft_bl_dosya_url as string | null;
  if (!draftBlUrl) return false;
  return (
    checkCommercialInvoiceReadiness(dosya, rezervasyonlar, konteynerler).hazir &&
    checkPackingListReadiness(dosya, rezervasyonlar, konteynerler).hazir &&
    checkCertificateOfOriginReadiness(dosya, rezervasyonlar, konteynerler).hazir &&
    checkPhytosanitaryCertificateReadiness(dosya, rezervasyonlar, konteynerler).hazir &&
    checkHealthCertificateReadiness(dosya, rezervasyonlar, konteynerler).hazir
  );
}

/**
 * En acil aksiyon gerektiren dosyalar EN USTTE: once suresi dolmus (48s+
 * yanitsiz) veya son 10 saatine girmis ve revize istenmis dosyalar, sonra bekleyenler, sonra gonderime
 * hazir olanlar, sonra musteri yanitini bekleyenler (sari), musteri onayi
 * gelmis olanlar (yesil) en sonda - onlarda artik aktif takip gerekmiyor.
 */
function siraDegeri(d: DosyaWithRelations): number {
  const musteriOnayiAlindi = !!d.draft_musteri_onayi_alindi;
  const revizeIstendi = !!d.draft_revize_istendi;
  const mailGonderildi = !!d.draft_mail_gonderildi;
  const sureDoldu = draftSuresiDoldu(d);

  if (musteriOnayiAlindi) return 5;
  if (mailGonderildi) {
    // Son 10 saate girmis (hatirlatma maili gerekebilir) bekleyenler de en uste
    const son = draftYanitSonuMs(d);
    const kritik = son !== null && son - Date.now() <= CUTOFF_UYARI_ESIGI_MS;
    return sureDoldu || kritik ? 0 : 4;
  }
  if (revizeIstendi) return 0;
  if (d.draft_onaylandi) return 1;
  return 0;
}

/**
 * Arama icin sadelestirme: buyuk/kucuk harf ve I/ı/İ/i farki gozetilmez
 * ("IHR" Turkce kucuk harfte "ıhr" olur; kullanici "ihr" yazar - ikisi de
 * "ihr"e indirgenir), fazla bosluk tek bosluk.
 */
function sadelestir(m: string | null | undefined): string {
  return (m || "").toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/\s+/g, " ").trim();
}

/**
 * Arama (16.10.2026): dosya no, musteri, proforma, booking, konteyner no,
 * fatura no, BL no. Bosluk / tire farki gozetmeden de eslesir (konteyner no
 * "MSCU 123" / "MSCU123").
 */
function aramaEslesir(d: DosyaWithRelations, arama: string): boolean {
  const q = sadelestir(arama);
  if (!q) return true;
  const qSiki = q.replace(/[\s-]/g, "");
  const alanlar = [
    d.dosya_no,
    d.alici_firma,
    d.proforma_no,
    d.fatura_no,
    (d as Dosya & { bl_no?: string | null }).bl_no,
    ...d.rezervasyonlar.map((x) => x.booking_no),
    ...d.konteynerler.map((x) => x.konteyner_no),
  ].map(sadelestir);
  return alanlar.some((a) => a.includes(q) || (qSiki.length >= 3 && a.replace(/[\s-]/g, "").includes(qSiki)));
}

type Sekme = "aktif" | "kapali";

export default function DraftOnayPage() {
  const { user, companyId } = useAuth();
  const [dosyalar, setDosyalar] = useState<DosyaWithRelations[]>([]);
  // Kapanan dosyalar (16.10.2026): salt goruntuleme, evraklar indirilebilir
  const [kapalilar, setKapalilar] = useState<DosyaWithRelations[]>([]);
  const [sekme, setSekme] = useState<Sekme>("aktif");
  const [arama, setArama] = useState("");
  // Quality / Fumigation belgeleri musteriye ozel ayarlarla uretilir (bkz.
  // lib/musteri-evrak-ayarlari.ts) - tum listedeki musteriler icin tek seferde.
  const [ayarlar, setAyarlar] = useState<Record<string, MusteriEvrakAyarlari>>({});
  const [loading, setLoading] = useState(true);

  const fetchDosyalar = useCallback(async () => {
    if (!user?.id || !companyId) return;
    setLoading(true);

    // Aktif liste (28.09.2026 karari degismedi): SADECE ACIK ve tam evrak
    // setli dosyalar. 16.10.2026: Kapanan dosyalar AYRI sekmede, salt
    // goruntuleme olarak listelenir (evraklar + paket). Durum kontrolu
    // isDosyaAcik() ile ("Açık" ve eski "Acik" yazimi).
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari")
      .select("*")
      .eq("company_id", companyId)
      .not("draft_bl_dosya_url", "is", null)
      .order("olusturma_tarihi", { ascending: false })
      .returns<Dosya[]>();

    if (!dosyaData || dosyaData.length === 0) {
      setDosyalar([]);
      setKapalilar([]);
      setLoading(false);
      return;
    }

    const dosyaIds = dosyaData.map((d) => d.id);
    const [rezRes, kontRes] = await Promise.all([
      supabase.from("rezervasyonlar").select("*").in("dosya_id", dosyaIds).eq("company_id", companyId).order("olusturma_tarihi", { ascending: true }).order("id", { ascending: true }),
      supabase.from("konteynerler").select("*").in("dosya_id", dosyaIds).eq("company_id", companyId),
    ]);

    const rezMap: Record<string, Rezervasyon[]> = {};
    (rezRes.data || []).forEach((r: Rezervasyon) => {
      if (!rezMap[r.dosya_id]) rezMap[r.dosya_id] = [];
      rezMap[r.dosya_id].push(r);
    });
    const kontMap: Record<string, Konteyner[]> = {};
    (kontRes.data || []).forEach((k: Konteyner) => {
      if (!kontMap[k.dosya_id]) kontMap[k.dosya_id] = [];
      kontMap[k.dosya_id].push(k);
    });

    const zenginlesmis: DosyaWithRelations[] = dosyaData.map((d) => ({
      ...d,
      rezervasyonlar: rezMap[d.id] || [],
      konteynerler: kontMap[d.id] || [],
    }));

    const hazirOlanlar = zenginlesmis.filter(
      (d) => isDosyaAcik(d) && tamEvrakSetiHazirMi(d, d.rezervasyonlar, d.konteynerler)
    );
    hazirOlanlar.sort((a, b) => siraDegeri(a) - siraDegeri(b));
    // Kapananlar: en yeni ustte (sorgu zaten olusturma tarihine gore azalan)
    const kapananlar = zenginlesmis.filter((d) => !isDosyaAcik(d));

    const musteriAyarlari = await musteriEvrakAyarlariniTopluGetir(
      companyId,
      [...hazirOlanlar, ...kapananlar].map((d) => d.alici_firma || "")
    );
    setAyarlar(musteriAyarlari);
    setDosyalar(hazirOlanlar);
    setKapalilar(kapananlar);
    setLoading(false);
  }, [user?.id, companyId]);

  useEffect(() => {
    fetchDosyalar();
  }, [fetchDosyalar]);

  const aramaVar = arama.trim().length > 0;
  const aktifBulunan = useMemo(() => dosyalar.filter((d) => aramaEslesir(d, arama)), [dosyalar, arama]);
  const kapaliBulunan = useMemo(() => kapalilar.filter((d) => aramaEslesir(d, arama)), [kapalilar, arama]);
  const gorunen = sekme === "aktif" ? aktifBulunan : kapaliBulunan;
  const digerSekmeBulunan = sekme === "aktif" ? kapaliBulunan.length : aktifBulunan.length;

  return (
    <AppShell>
      <div className="space-y-4">
        <SayfaBasligi
          ikon={<FileCheck2 size={20} />}
          baslik="İhracat Evrakları"
          aciklama="Sevkiyat evrakları (Commercial Invoice, Packing List, Draft BL, Certificate of Origin, Phytosanitary, Health Certificate) tam ve hazır olan dosyalar burada listelenir. Müşteri istediyse Quality ve Fumigation sertifikaları da evrak listesinde gösterilir. İlgili Evraklar'da üst satır taslak (yeşil), alt satır orijinal (mavi) belgelerdir. Kapanan dosyaların evrakları ayrı sekmededir."
          className="mb-0"
        />

        {loading ? (
          <div className="flex items-center gap-2 py-10 justify-center" style={{ color: TEXT_MUTED }}>
            <Loader2 size={18} className="animate-spin" /> Yükleniyor...
          </div>
        ) : (
          <>
            {/* Sekmeler + arama */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-xl border p-1 gap-1" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} role="tablist" aria-label="Draft listeleri">
                {([
                  { k: "aktif" as const, etiket: "Aktif Dosyalar", ikon: <Inbox size={14} />, tumu: dosyalar.length, bulunan: aktifBulunan.length },
                  { k: "kapali" as const, etiket: "Kapanan Dosyalar", ikon: <Archive size={14} />, tumu: kapalilar.length, bulunan: kapaliBulunan.length },
                ]).map((t) => {
                  const secili = sekme === t.k;
                  return (
                    <button key={t.k} type="button" role="tab" aria-selected={secili} onClick={() => setSekme(t.k)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${secili ? "text-white" : "hover:bg-white/5"}`}
                      style={secili ? { backgroundColor: ACCENT } : { color: TEXT_MUTED }}>
                      {t.ikon} {t.etiket}
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full tabular-nums ${secili ? "bg-white/20" : "bg-white/5"}`}>
                        {aramaVar ? `${t.bulunan}/${t.tumu}` : t.tumu}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="relative w-full sm:w-80">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: TEXT_MUTED }} />
                <input
                  type="text"
                  value={arama}
                  onChange={(e) => setArama(e.target.value)}
                  placeholder="Dosya no, müşteri, proforma, booking, konteyner…"
                  aria-label="Dosya ara"
                  className="w-full pl-9 pr-8 py-2 rounded-lg border text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}
                />
                {aramaVar && (
                  <button type="button" onClick={() => setArama("")} aria-label="Aramayı temizle" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10" style={{ color: TEXT_MUTED }}>
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Aradigi dosya diger sekmedeyse yonlendir */}
            {aramaVar && gorunen.length === 0 && digerSekmeBulunan > 0 && (
              <div className="rounded-lg border px-4 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, color: TEXT_MUTED }}>
                <span>Bu sekmede sonuç yok; <b className="text-white">{sekme === "aktif" ? "Kapanan Dosyalar" : "Aktif Dosyalar"}</b> sekmesinde {digerSekmeBulunan} sonuç var.</span>
                <button type="button" onClick={() => setSekme(sekme === "aktif" ? "kapali" : "aktif")} className="text-xs font-medium hover:underline" style={{ color: ACCENT }}>Sonuçlara git</button>
              </div>
            )}

            {gorunen.length === 0 ? (
              aramaVar ? (
                <EmptyState
                  icon={<Search size={40} />}
                  title="Eşleşen dosya bulunamadı"
                  description={`"${arama.trim()}" için sonuç yok. Dosya no, müşteri, proforma, booking, konteyner, fatura veya BL numarasıyla arayabilirsiniz.`}
                />
              ) : sekme === "aktif" ? (
                <EmptyState
                  icon={<FileCheck2 size={40} />}
                  title="Henüz hazır dosya yok"
                  description="Tüm sevkiyat evrakları tamamlandığında dosyalar burada onaya çıkacak."
                />
              ) : (
                <EmptyState
                  icon={<Archive size={40} />}
                  title="Kapanan dosya yok"
                  description="Kapatılan dosyalar evraklarıyla birlikte burada listelenir."
                />
              )
            ) : (
              <div className="rounded-xl border shadow-sm overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                {sekme === "kapali" && (
                  <p className="px-3 py-2 text-[11px] border-b" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED, backgroundColor: ROW_HEADER_BG }}>
                    Kapanan dosyalar salt görüntüleme içindir: evrakları açabilir ve taslak paketini indirebilirsiniz; onay ve gönderim işlemleri yapılmaz. Eksik bilgili belgede uyarı simgesi görünür.
                  </p>
                )}
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                        <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Dosya / Müşteri</th>
                        <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }} lang="en">Proforma / Booking</th>
                        <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>İlgili Evraklar</th>
                        <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Kalkış / ETA</th>
                        <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Durum</th>
                        <th className="text-left px-2.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Aksiyonlar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gorunen.map((d) => (
                        <DraftOnayKarti
                          key={d.id}
                          dosya={d}
                          rezervasyonlar={d.rezervasyonlar}
                          konteynerler={d.konteynerler}
                          companyId={companyId!}
                          ayarlar={(d.alici_firma && ayarlar[d.alici_firma]) || BOS_MUSTERI_EVRAK_AYARLARI}
                          onRefresh={fetchDosyalar}
                          arsiv={sekme === "kapali"}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}