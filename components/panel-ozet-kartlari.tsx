"use client";

import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Container, FileText, Timer } from "lucide-react";
import { supabase, type Dosya, type Konteyner, type Rezervasyon } from "@/lib/supabase";
import { bugunTarihIstanbul, cutoffKalanMs, CUTOFF_YAKLASIYOR_MS, efektifTartimBilgisi, formatCutoffSaat, formatDateTR } from "@/lib/cutoff-utils";
import { gunEtiketi, type HaftalikYukleme } from "@/lib/panel/gunluk-yukleme";
import type { IsEmriSatiri } from "@/lib/panel/is-emirleri";
import { dosyaAkisiHesapla, rezervasyonlariSirala } from "@/lib/dashboard-akis";
import { cutoffUyarilari as cutoffUyarilariHesapla } from "@/lib/panel-gorunum";
import InfoTooltip from "@/components/info-tooltip";
import { ACCENT, CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";

/**
 * Ana Panel ozet kartlari (28.10.2026). Kullanici: "Mevcut Kontrol Merkezi kaldirilmali;
 * Analiz sayfasi Kontrol Merkezi olarak devam etmeli; eski Kontrol Merkezindeki 4 kutu
 * Ana Panele tasinmali. Aktif Dosya artik tiklanamaz (zaten Ana Paneldeyiz)."
 *
 * Hesaplar eski app/dashboard ile BIREBIR ayni (lib/dashboard-akis, gunluk raporla ayni kural):
 *  - Aktif Dosya: acik dosya sayisi; alt satir rezervasyon bekleyen sayisi
 *  - Bugun Yuklenen: bugun TARTILAN konteyner (efektifTartimBilgisi; tum dosyalar, kapali dahil)
 *  - Yuklenecek Konteyner: acik sevkiyatlarda max(planlanan, eklenen) - DBA yuklenen
 *  - Cut-off Uyarisi: <= 2 takvim gunu kalan / gecen ve ilgili adimi bitmemis
 * Veri: Ana Panelin zaten cektigi acik dosyalar + rezervasyon + konteynerler; yalniz
 * "bugun yuklenen" icin son 2 gunde DBA'si yuklenen konteynerler ayrica okunur.
 * 16.11.2026 gece (kullanici: standart uyari cubugu): Cut-off karti YALNIZ sayac; liste kartlarin altindaki
 * "Cut-off uyarisi" cubugunda (components/panel/cutoff-cubugu.tsx). Hesap tek yerde: lib/panel-gorunum.ts cutoffUyarilari.
 *
 * 23.11.2026 (kullanici: "Bu kisimlarin dogruluguna emin olalim ... Yuklenecek konteyner haftalik tespit etmeli"):
 *  - Yuklenecek Konteyner -> "Bu Hafta Yuklenecek": hedef gunu (beyanname'den onceki is gunu) bu hafta / gecmis olan islerin
 *    kalan konteyneri; dosyasi acilmamis booking'ler DAHIL (eski kart yalniz acik dosyalari sayiyordu). Hesap:
 *    lib/panel/gunluk-yukleme.ts haftalikYukleme (Gunluk Yukleme Hedefi ile ayni is listesi / plan).
 *  - Cut-off Uyarisi: kural ayni (belgesi verilmemis, 24 saat icinde / gecmis); dosyasi acilmamis booking'ler de sayilir.
 *    Alt yazi "listede kirmizi satirlar" kaldirildi (liste kirmizisi 0-3 gun kurali; karisiyordu): en yakin uyari yazilir.
 */
type PanelDosyasi = Dosya & { rezervasyonlar: Rezervasyon[]; konteynerler: Konteyner[] };

type KartUyarisi = { anahtar: string; musteri: string; tur: "Talimat" | "Beyanname"; saat: string; dosyaNo: string | null };

export function PanelOzetKartlari({ dosyalar, companyId, yenileme, haftalik, isEmirleri = [] }: {
  dosyalar: PanelDosyasi[]; companyId: string | null; yenileme: number; haftalik: HaftalikYukleme; isEmirleri?: IsEmriSatiri[];
}) {
  const [bugunYuklenen, setBugunYuklenen] = useState<number | null>(null);

  // Bugun tartilan konteyner: tartim bugunse DBA en erken bugun yuklenmistir (eski Kontrol Merkezi ile ayni)
  useEffect(() => {
    if (!companyId) return;
    let iptal = false;
    const ikiGunOnce = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    supabase.from("konteynerler").select("id, dba_kontrol_sonucu, dba_yukleme_tarihi")
      .eq("company_id", companyId).not("dba_dosya_url", "is", null).gte("dba_yukleme_tarihi", ikiGunOnce)
      .then(({ data, error }) => {
        if (iptal || error) return; // okunamazsa onceki deger kalir ("—" ilk acilista)
        const bugun = bugunTarihIstanbul();
        setBugunYuklenen(((data || []) as Pick<Konteyner, "dba_kontrol_sonucu" | "dba_yukleme_tarihi">[])
          .filter((k) => efektifTartimBilgisi(k.dba_kontrol_sonucu, k.dba_yukleme_tarihi)?.gun === bugun).length);
      });
    return () => { iptal = true; };
  }, [companyId, yenileme]);

  const aciklar = useMemo(() => dosyalar.map((d) => {
    const rezervasyonlar = rezervasyonlariSirala(d.rezervasyonlar);
    return {
      dosya: d,
      akis: dosyaAkisiHesapla({
        rezervasyonlar,
        konteynerler: d.konteynerler,
        faturaVar: !!d.fatura_dosya_url,
        konsimentoVar: !!d.konsimento_dosya_url,
        draftBlVar: !!d.draft_bl_dosya_url,
        beyannameVar: !!d.beyanname_dosya_url,
      }),
    };
  }), [dosyalar]);

  const bekleyenRez = aciklar.filter((x) => x.dosya.rezervasyonlar.length === 0).length;
  const yuklenecekToplam = haftalik.gereken;
  const cutoffUyarilari = useMemo<KartUyarisi[]>(() => {
    const simdi = Date.now();
    const dosyaUyari = cutoffUyarilariHesapla(dosyalar, simdi).map((u) => ({ anahtar: `${u.dosyaId}:${u.tur}`, musteri: u.musteri || u.dosyaNo, tur: u.tur, saat: u.saat || "", dosyaNo: u.dosyaNo }));
    // Dosyasi acilmamis booking: belge yok, iki cut-off da acik
    const isUyari = isEmirleri.flatMap((s) => ([["Talimat", s.talimat_cutoff], ["Beyanname", s.beyan_cutoff]] as const)
      .filter(([, c]) => { const k = cutoffKalanMs(c, simdi); return k !== null && k <= CUTOFF_YAKLASIYOR_MS; })
      .map(([tur, c]) => ({ anahtar: `${s.anahtar}:${tur}`, musteri: s.musteri || s.booking_no || "—", tur, saat: c || "", dosyaNo: null })));
    return [...dosyaUyari, ...isUyari].sort((a, b) => (cutoffKalanMs(a.saat, simdi) ?? 0) - (cutoffKalanMs(b.saat, simdi) ?? 0));
  }, [dosyalar, isEmirleri]);
  const enYakin = cutoffUyarilari[0] || null;
  const enYakinKalan = enYakin ? cutoffKalanMs(enYakin.saat) : null;
  const acilCutoff = enYakinKalan !== null && enYakinKalan <= 10 * 3600_000;

  const kart = "rounded-xl border shadow-sm p-4 animate-fade-up";
  return (
    <section aria-label="Operasyon özeti" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
      {/* 1) Aktif Dosya (tiklanamaz: zaten Ana Paneldeyiz; liste asagida) */}
      <div className={`${kart} stagger-1`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: "#0F2A20", color: ACCENT }}><FileText size={16} /></div>
          <p className="text-xs font-medium flex-1 truncate" style={{ color: TEXT_MUTED }}>Aktif Dosya</p>
          {aciklar.length > 0 && (
            <InfoTooltip variant="info" position="bottom" align="right" width="w-80">
              <span className="font-semibold text-slate-200">Aktif dosyalar:</span>
              <div className="mt-2 space-y-3 max-h-80 overflow-y-auto">
                {aciklar.map(({ dosya, akis }) => {
                  const rez = akis.anaRezervasyon;
                  return (
                    <div key={dosya.id} className="pb-2 border-b last:border-0" style={{ borderColor: CARD_BORDER }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-white">{dosya.dosya_no}</span>
                        {akis.kapatmayaHazir && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400">Kapatmaya hazır</span>}
                      </div>
                      <p className="text-slate-400">{dosya.alici_firma || "-"}{akis.adet ? ` — ${akis.adet}x` : ""}{dosya.varis_limani ? ` — ${dosya.varis_limani}` : ""}</p>
                      {rez?.booking_no && <p className="text-slate-400">Booking: {rez.booking_no}{rez.gemi_adi ? ` — ${rez.gemi_adi}` : ""}</p>}
                      {akis.etd && <p className="text-slate-400">ETD: {formatDateTR(akis.etd)}</p>}
                      {!rez && <p className="text-amber-400">Rezervasyon bekleniyor</p>}
                    </div>
                  );
                })}
              </div>
            </InfoTooltip>
          )}
        </div>
        <p className="text-2xl font-bold text-white">{aciklar.length}</p>
        <p className={`text-[11px] mt-0.5 ${bekleyenRez > 0 ? "text-amber-400" : ""}`} style={bekleyenRez > 0 ? undefined : { color: TEXT_MUTED }}>
          {bekleyenRez > 0 ? `${bekleyenRez} dosya rezervasyon bekliyor` : "Tüm dosyalarda rezervasyon var"}
        </p>
      </div>

      {/* 2) Bugun Yuklenen + Gunluk Rapor */}
      <div className={`${kart} stagger-2`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: "#0F2A20", color: ACCENT }}><CheckCircle2 size={16} /></div>
          <p className="text-xs font-medium flex-1 truncate" style={{ color: TEXT_MUTED }}>Bugün Yüklenen</p>
        </div>
        <div className="flex items-end justify-between gap-2">
          <p className="text-2xl font-bold text-white">{bugunYuklenen ?? "—"} <span className="text-xs font-medium" style={{ color: TEXT_MUTED }}>konteyner</span></p>
          <button onClick={() => window.open("/rapor/gunluk", "_blank")}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white hover:brightness-110 transition-all shrink-0"
            style={{ backgroundColor: ACCENT }}>
            Günlük Rapor
          </button>
        </div>
        <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>DBA tartım tarihine göre</p>
      </div>

      {/* 3) Bu hafta yuklenecek (haftalikYukleme; acik dosyalar + dosyasi acilmamis booking'ler) */}
      <div className={`${kart} stagger-3`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-haftalik-yukleme>
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: yuklenecekToplam > 0 ? "rgba(245,158,11,0.12)" : CARD_BORDER, color: yuklenecekToplam > 0 ? "#FBBF24" : TEXT_MUTED }}><Container size={16} /></div>
          <p className="text-xs font-medium flex-1 truncate" style={{ color: TEXT_MUTED }}>Bu Hafta Yüklenecek</p>
          {(haftalik.isler.length > 0 || haftalik.sonrakiKalan > 0) && (
            <InfoTooltip variant="info" position="bottom" align="right" width="w-80">
              <span className="font-semibold text-slate-200">{gunEtiketi(haftalik.bas)} – {gunEtiketi(haftalik.son)} yüklenmesi gereken:</span>
              <ul className="mt-1.5 space-y-1">
                {haftalik.isler.map((x) => (
                  <li key={x.anahtar} className="text-slate-300 flex justify-between gap-3">
                    <span className="truncate"><span className="font-medium text-white">{x.etiket}</span>{x.dosyaNo ? ` · ${x.dosyaNo}` : " · dosya açılmadı"}</span>
                    <span className="shrink-0 whitespace-nowrap"><span className={x.gecikme ? "text-red-300" : "text-slate-400"}>{gunEtiketi(x.hedefGun)}</span> <span className="text-amber-400 font-semibold">{x.kalan}</span></span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-slate-400">Hedef gün: beyanname cut-off&apos;undan önceki iş günü. Sonraki haftalara: {haftalik.sonrakiKalan} konteyner ({haftalik.sonrakiIs} iş).</p>
            </InfoTooltip>
          )}
        </div>
        <p className="text-2xl font-bold text-white">{yuklenecekToplam} <span className="text-xs font-medium" style={{ color: TEXT_MUTED }}>konteyner</span></p>
        <p className="text-[11px] mt-0.5 truncate" style={{ color: TEXT_MUTED }}>
          {gunEtiketi(haftalik.bas)} – {gunEtiketi(haftalik.son)} · {haftalik.isler.length} iş · bu hafta yüklenen {haftalik.yuklenen}
        </p>
      </div>

      {/* 4) Cut-off uyarisi */}
      <div className={`${kart} stagger-4`}
        style={{ backgroundColor: cutoffUyarilari.length > 0 ? "rgba(248,113,113,0.05)" : CARD_BG, borderColor: cutoffUyarilari.length > 0 ? "rgba(248,113,113,0.35)" : CARD_BORDER }}>
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-1.5 rounded-lg shrink-0 ${acilCutoff ? "animate-pulse" : ""}`}
            style={{ backgroundColor: cutoffUyarilari.length > 0 ? "#2A1519" : CARD_BORDER, color: cutoffUyarilari.length > 0 ? "#F87171" : TEXT_MUTED }}><Timer size={16} /></div>
          <p className="text-xs font-medium flex-1 truncate" style={{ color: TEXT_MUTED }}>Cut-off Uyarısı</p>
        </div>
        <p className={`text-2xl font-bold ${cutoffUyarilari.length > 0 ? "text-red-400" : "text-white"}`}>{cutoffUyarilari.length}</p>
        {enYakin ? (
          <p className="text-[11px] mt-0.5 text-red-300 truncate" data-cutoff-ozet title={cutoffUyarilari.map((u) => `${u.musteri} · ${u.tur} ${formatDateTR(u.saat.slice(0, 10))} ${formatCutoffSaat(u.saat)}`).join("\n")}>
            En yakın: {enYakin.musteri} · {enYakin.tur.toLocaleLowerCase("tr")} {formatCutoffSaat(enYakin.saat)}{cutoffUyarilari.length > 1 ? ` · +${cutoffUyarilari.length - 1}` : ""}
          </p>
        ) : (
          <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>24 saat içinde bekleyen cut-off yok</p>
        )}
      </div>
    </section>
  );
}
