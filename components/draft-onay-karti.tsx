"use client";
import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase, Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { CheckCircle2, Mail, FileType2, Ship, AlertTriangle, ThumbsUp, FileArchive, Loader2, ShieldCheck, MessageSquareWarning, Clock, X } from "lucide-react";
import { CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { formatDateTimeTR, formatDateTR } from "@/lib/cutoff-utils";
import { indirTaslakOnayPaketi } from "@/lib/taslak-onay-paketi";
import { draftOnayAliciEmailAl } from "@/lib/draft-onay-mail";
import { buildCommercialInvoiceHtml } from "@/lib/invoice-builder";
import { buildPackingListHtml } from "@/lib/packing-list-builder";
import { buildCertificateOfOriginHtml } from "@/lib/certificate-of-origin-builder";
import { buildPhytosanitaryCertificateHtml } from "@/lib/phytosanitary-certificate-builder";
import { buildHealthCertificateHtml } from "@/lib/health-certificate-builder";
import { buildKaliteSertifikasiHtml } from "@/lib/kalite-sertifikasi-builder";
import { buildFumigationHtml } from "@/lib/fumigation-builder";
import { checkKaliteSertifikasiReadiness, checkFumigationReadiness } from "@/lib/document-readiness";
import { MusteriEvrakAyarlari, dosyaEvrakIstiyorMu } from "@/lib/musteri-evrak-ayarlari";
import { draftFiligranEkle } from "@/lib/watermark";

const EVRAK_ADLARI: Record<string, string> = {
  commercial_invoice: "Commercial Invoice",
  packing_list: "Packing List",
  certificate_of_origin: "Certificate of Origin",
  phytosanitary: "Phytosanitary Certificate",
  health_certificate: "Health Certificate",
  quality_certificate: "Quality Certificate",
  fumigation: "Fumigation Certificate",
};

type Props = {
  dosya: Dosya;
  rezervasyonlar: Rezervasyon[];
  konteynerler: Konteyner[];
  companyId: string;
  /** Musteriye ozel Quality / Fumigation ayarlari (sayfa tek seferde getirir). */
  ayarlar: MusteriEvrakAyarlari;
  onRefresh: () => void;
};

/**
 * Draft Onay tablosunda TEK BİR SATIR. İhracatlar sayfasındaki (app/ihracatlar)
 * yatay tablo deseniyle aynı sınıflar/renkler kullanılır - amaç kullanıcının
 * zaten alışık olduğu görünümü korumak.
 */
export default function DraftOnayKarti({ dosya, rezervasyonlar, konteynerler, companyId, ayarlar, onRefresh }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [onaylaniyor, setOnaylaniyor] = useState(false);
  const [indiriliyor, setIndiriliyor] = useState(false);
  const [musteriOnayiKaydediliyor, setMusteriOnayiKaydediliyor] = useState(false);
  const [mailIsaretleniyor, setMailIsaretleniyor] = useState(false);
  const [revizeModalAcik, setRevizeModalAcik] = useState(false);
  const [revizeNotu, setRevizeNotu] = useState("");
  const [revizeKaydediliyor, setRevizeKaydediliyor] = useState(false);

  const draftBlUrl = dosya.draft_bl_dosya_url as string | null;
  const draftBlAdi = dosya.draft_bl_dosya_adi as string | null;
  const rez = rezervasyonlar[0];
  const aliciEmail = draftOnayAliciEmailAl(dosya);

  // "İlgili Evraklar" onizlemesi, "Taslak Onay Paketi İndir" butonuyla
  // (bkz. lib/taslak-onay-paketi.ts) BIREBIR AYNI yontemi kullanir: belge
  // onceden dosya_evraklari tablosuna KAYDEDILMIS olmasa bile, mevcut
  // dosya/rezervasyon/konteyner verisinden aninda uretilip DRAFT
  // filigraniyla goruntulenir. Bu satir zaten sadece tamEvrakSetiHazirMi
  // testini gecmis (bkz. app/draft-onay/page.tsx) dosyalar icin render
  // edildigi icin, veri eksikligi riski yoktur - buton her zaman calisir.
  const evrakGoruntuleUret = useCallback(
    (builder: (d: Dosya, r: Rezervasyon[], k: Konteyner[]) => string, filigranUygula: boolean = true) => {
      try {
        const htmlHam = builder(dosya, rezervasyonlar, konteynerler);
        const html = filigranUygula ? draftFiligranEkle(htmlHam) : htmlHam;
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const blobUrl = URL.createObjectURL(blob);
        const win = window.open(blobUrl, "_blank");
        if (!win) showToast("Açılır pencere engellendi. Lütfen tarayıcı ayarlarından izin verin.", "error");
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      } catch (err) {
        console.error("Taslak evrak uretme hatasi:", err);
        showToast("Evrak üretilemedi. Lütfen dosya bilgilerini kontrol edin.", "error");
      }
    },
    [dosya, rezervasyonlar, konteynerler, showToast]
  );

  const handlePaketIndir = async () => {
    if (!draftBlUrl) return;
    setIndiriliyor(true);
    try {
      const { eklenmeyenler } = await indirTaslakOnayPaketi(dosya, rezervasyonlar, konteynerler, draftBlUrl, ayarlar);
      if (eklenmeyenler.length > 0) {
        showToast(`Paket indirildi, ancak eklenemeyen evrak var: ${eklenmeyenler.join("; ")}`, "error");
      } else {
        showToast("Taslak onay paketi indirildi.", "success");
      }
    } catch (err) {
      console.error("Taslak onay paketi olusturma hatasi:", err);
      showToast("Paket oluşturulamadı. Lütfen tekrar deneyin.", "error");
    } finally {
      setIndiriliyor(false);
    }
  };

  const handleOnayla = async () => {
    setOnaylaniyor(true);
    // Revize sonrasi yeniden onaylandiginda eski "Revize Istendi" rozeti
    // kapanir - notu/tarihi/isaretleyeni SILINMEZ (gecmis kayit olarak
    // kalir), sadece aktif uyari durumu (draft_revize_istendi) kapatilir.
    const { error } = await supabase
      .from("ihracat_dosyalari")
      .update({
        draft_onaylandi: true,
        draft_onaylayan: user?.email || null,
        draft_onay_tarihi: new Date().toISOString(),
        draft_revize_istendi: false,
      })
      .eq("id", dosya.id)
      .eq("company_id", companyId);
    setOnaylaniyor(false);
    if (error) {
      showToast(`Onay kaydedilemedi: ${error.message}`, "error");
      return;
    }
    showToast("Draft onaylandı. \"Gönderildi İşaretle\" butonu artık aktif.", "success");
    onRefresh();
  };

  // Talep (30.09.2026): mailto: ile mail penceresi acma adimi pratikte
  // kullanilmiyor - ekip draft PDF paketini indirip kendi yolundan
  // (kurumsal mail istemcisi ile) elle gonderiyor. Bu buton artik sadece
  // "gonderdim" durumunu isaretler; "Musteri Onayladi" / "Revize Istendi"
  // butonlarinin ortaya cikmasi ve 48 saatlik sure takibinin baslamasi
  // buna baglidir.
  const handleGonderildiIsaretle = async () => {
    setMailIsaretleniyor(true);
    const { error } = await supabase
      .from("ihracat_dosyalari")
      .update({ draft_mail_gonderildi: true, draft_mail_gonderildi_tarihi: new Date().toISOString() })
      .eq("id", dosya.id)
      .eq("company_id", companyId);
    setMailIsaretleniyor(false);
    if (error) {
      showToast(`Durum kaydedilemedi: ${error.message}`, "error");
      return;
    }
    showToast("Gönderildi olarak işaretlendi. 48 saatlik yanıt süresi başladı.", "success");
    onRefresh();
  };

  // Musterinin FIILEN onay verdigini isaretler. Bu, ic ekibin "Onayla" ile
  // isaretledigi "gonderime hazir" durumundan AYRI bir kavramdir - biri ekibin
  // taslagi musteriye gondermeye hazir oldugunu, digeri musterinin bu taslagi
  // gercekten onayladigini gosterir. Ikisi karistirilmamalidir.
  const handleMusteriOnayiGeldi = async () => {
    setMusteriOnayiKaydediliyor(true);
    const { error } = await supabase
      .from("ihracat_dosyalari")
      .update({
        draft_musteri_onayi_alindi: true,
        draft_musteri_onayi_tarihi: new Date().toISOString(),
        draft_musteri_onayi_isaretleyen: user?.email || null,
      })
      .eq("id", dosya.id)
      .eq("company_id", companyId);
    setMusteriOnayiKaydediliyor(false);
    if (error) {
      showToast(`Müşteri onayı kaydedilemedi: ${error.message}`, "error");
      return;
    }
    showToast("Müşteri onayı kaydedildi.", "success");
    onRefresh();
  };

  // Musteri "sunu degistirin" dediginde ekibin not dusup isaretledigi durum.
  // Akis BILEREK basa sarilir (draft_onaylandi/draft_mail_gonderildi/
  // draft_musteri_onayi_alindi false yapilir) - cunku evraklar degisecek,
  // ekip duzelttikten sonra "Onayla" ile YENIDEN ic onaydan gecirmeli. Revize
  // notu/tarihi/isaretleyen SILINMEZ - dosya yeniden onaylanana kadar (bkz.
  // handleOnayla) gecmis bilgi olarak "Revize Istendi" rozetinde gorunur.
  const handleRevizeIstendiKaydet = async () => {
    setRevizeKaydediliyor(true);
    const { error } = await supabase
      .from("ihracat_dosyalari")
      .update({
        draft_revize_istendi: true,
        draft_revize_notu: revizeNotu.trim() || null,
        draft_revize_tarihi: new Date().toISOString(),
        draft_revize_isaretleyen: user?.email || null,
        draft_onaylandi: false,
        draft_mail_gonderildi: false,
        draft_musteri_onayi_alindi: false,
      })
      .eq("id", dosya.id)
      .eq("company_id", companyId);
    setRevizeKaydediliyor(false);
    if (error) {
      showToast(`Revize talebi kaydedilemedi: ${error.message}`, "error");
      return;
    }
    showToast("Revize talebi kaydedildi. Dosya yeniden \"Onayla\" adımına döndü.", "success");
    setRevizeModalAcik(false);
    setRevizeNotu("");
    onRefresh();
  };

  const onaylandi = !!dosya.draft_onaylandi;
  const mailGonderildi = !!dosya.draft_mail_gonderildi;
  const musteriOnayiAlindi = !!dosya.draft_musteri_onayi_alindi;
  const revizeIstendi = !!dosya.draft_revize_istendi;
  const onaylayan = dosya.draft_onaylayan as string | null;
  const onayTarihi = dosya.draft_onay_tarihi as string | null;
  const musteriOnayiIsaretleyen = dosya.draft_musteri_onayi_isaretleyen as string | null;
  const musteriOnayiTarihi = dosya.draft_musteri_onayi_tarihi as string | null;
  const revizeNotuKayitli = dosya.draft_revize_notu as string | null;
  const revizeTarihi = dosya.draft_revize_tarihi as string | null;
  const revizeIsaretleyen = dosya.draft_revize_isaretleyen as string | null;
  const mailGonderildiTarihi = dosya.draft_mail_gonderildi_tarihi as string | null;

  // 48 saatlik yanit suresi: sadece "gonderildi isaretlendi, musteri onayi da
  // gelmedi, revize de istenmedi" durumunda (yani hala aktif bekleme
  // suredeyken) anlamli - digerlerinde zaten baska bir aksiyon alinmis demektir.
  const sureDoldu =
    mailGonderildi && !musteriOnayiAlindi && !revizeIstendi && !!mailGonderildiTarihi &&
    Date.now() - new Date(mailGonderildiTarihi).getTime() > 48 * 60 * 60 * 1000;

  const durumTitle = musteriOnayiAlindi
    ? `Müşteri onayını işaretleyen: ${musteriOnayiIsaretleyen || "-"}${musteriOnayiTarihi ? " · " + formatDateTimeTR(musteriOnayiTarihi) : ""}`
    : revizeIstendi
    ? `Revizeyi işaretleyen: ${revizeIsaretleyen || "-"}${revizeTarihi ? " · " + formatDateTimeTR(revizeTarihi) : ""}${revizeNotuKayitli ? " · Not: " + revizeNotuKayitli : ""}`
    : onaylandi
    ? `Onaylayan: ${onaylayan || "-"}${onayTarihi ? " · " + formatDateTimeTR(onayTarihi) : ""}`
    : undefined;

  // İlgili Evraklar sabit sırada gösterilir: 1) Commercial Invoice,
  // 2) Packing List, 3) Draft BL, 4) Certificate of Origin, 5) Phytosanitary,
  // 6) Health Certificate, 7) Quality Certificate, 8) Fumigation Certificate.
  // Bu satır zaten tamEvrakSetiHazirMi testini geçmiş dosyalar için render
  // edildiğinden (bkz. app/draft-onay/page.tsx), Draft BL harici ilk 5 evrak
  // her zaman üretilebilir durumdadır ve koşulsuz gösterilir.
  //
  // 7 ve 8 (talep: 01.10.2026): sadece müşterinin evrak listesinde
  // isteniyorsa gösterilir (dosya detayındaki liste ile aynı kural);
  // müşteriye özel ayarlarla ve DRAFT filigranıyla üretilir (dosya
  // detayındaki Draft butonuyla birebir aynı). Bilgisi eksikse dosya listeden
  // DÜŞMEZ - ikon sarı uyarıya döner ve eksikleri söyler.
  type EvrakGosterim = { key: string; title: string; href?: string; onClick?: () => void; eksikler?: string[] };
  const qcIsteniyor = dosyaEvrakIstiyorMu(dosya, "Quality");
  const fcIsteniyor = dosyaEvrakIstiyorMu(dosya, "Fumigation");
  const qcHazirlik = checkKaliteSertifikasiReadiness(dosya, rezervasyonlar, konteynerler);
  const fcHazirlik = checkFumigationReadiness(dosya, rezervasyonlar, konteynerler);
  const evrakListesiHam: (EvrakGosterim | null)[] = [
    { key: "ci", title: EVRAK_ADLARI.commercial_invoice, onClick: () => evrakGoruntuleUret(buildCommercialInvoiceHtml) },
    { key: "pl", title: EVRAK_ADLARI.packing_list, onClick: () => evrakGoruntuleUret(buildPackingListHtml) },
    draftBlUrl ? { key: "draftbl", title: draftBlAdi || "Draft BL", href: draftBlUrl } : null,
    { key: "coo", title: EVRAK_ADLARI.certificate_of_origin, onClick: () => evrakGoruntuleUret(buildCertificateOfOriginHtml, false) },
    { key: "phyto", title: EVRAK_ADLARI.phytosanitary, onClick: () => evrakGoruntuleUret(buildPhytosanitaryCertificateHtml, false) },
    { key: "health", title: EVRAK_ADLARI.health_certificate, onClick: () => evrakGoruntuleUret(buildHealthCertificateHtml, false) },
    qcIsteniyor
      ? qcHazirlik.hazir
        ? { key: "qc", title: EVRAK_ADLARI.quality_certificate, onClick: () => evrakGoruntuleUret((d, r, k) => buildKaliteSertifikasiHtml(d, r, k, ayarlar.kaliteAyar)) }
        : { key: "qc", title: EVRAK_ADLARI.quality_certificate, eksikler: qcHazirlik.eksikler }
      : null,
    fcIsteniyor
      ? fcHazirlik.hazir
        ? { key: "fc", title: EVRAK_ADLARI.fumigation, onClick: () => evrakGoruntuleUret((d, r, k) => buildFumigationHtml(d, r, k, ayarlar.fumigationAyar)) }
        : { key: "fc", title: EVRAK_ADLARI.fumigation, eksikler: fcHazirlik.eksikler }
      : null,
  ];
  const evrakSirasi: EvrakGosterim[] = evrakListesiHam.filter((x): x is EvrakGosterim => x !== null);

  return (
    <>
    <tr
      className={`border-b last:border-0 hover:bg-white/[0.03] transition-colors ${sureDoldu ? "bg-red-500/[0.06]" : ""}`}
      style={{ borderColor: CARD_BORDER }}
    >
      <td className="px-2.5 py-2.5 text-xs font-semibold whitespace-nowrap">
        <button
          type="button"
          onClick={() => router.push(`/dosya/${dosya.id}`)}
          title="İlgili ihracat dosyasını aç"
          className="hover:underline transition-colors"
          style={{ color: ACCENT }}
        >
          {dosya.dosya_no}
        </button>
      </td>
      <td className="px-2.5 py-2.5 text-xs max-w-[140px] truncate" style={{ color: TEXT_MUTED }}>{dosya.alici_firma || "—"}</td>
      <td className="px-2.5 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: ACCENT }}>{dosya.proforma_no || "—"}</td>
      <td className="px-2.5 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: TEXT_MUTED }}>{rez?.booking_no || "—"}</td>
      <td className="px-2.5 py-2.5">
        <div className="flex items-center gap-1 flex-nowrap whitespace-nowrap">
          {evrakSirasi.map((item) =>
            item.eksikler ? (
              <button
                key={item.key}
                type="button"
                onClick={() => showToast(`${item.title} üretilemiyor. Eksik: ${item.eksikler!.join(", ")}`, "error")}
                title={`${item.title} — eksik bilgi: ${item.eksikler.join(", ")}`}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/10 transition-colors text-amber-400"
              >
                <AlertTriangle size={14} />
              </button>
            ) : item.href ? (
              <a
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                title={item.title}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/10 transition-colors"
                style={{ color: ACCENT }}
              >
                <Ship size={14} />
              </a>
            ) : (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                title={item.title}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/10 transition-colors"
                style={{ color: ACCENT }}
              >
                <FileType2 size={14} />
              </button>
            )
          )}
        </div>
        {!aliciEmail && (
          <p className="text-[10px] text-amber-400 flex items-center gap-1 mt-1 whitespace-nowrap">
            <AlertTriangle size={10} /> Alıcı e-postası yok
          </p>
        )}
      </td>
      <td className="px-2.5 py-2.5 whitespace-nowrap" title={durumTitle}>
        {musteriOnayiAlindi ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
            <CheckCircle2 size={11} /> Onay Geldi
          </span>
        ) : revizeIstendi ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-400 bg-orange-500/10 px-2 py-1 rounded-full">
            <MessageSquareWarning size={11} /> Revize İstendi
          </span>
        ) : sureDoldu ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-400 bg-red-500/10 px-2 py-1 rounded-full">
            <Clock size={11} /> Süre Doldu (48s)
          </span>
        ) : mailGonderildi ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">
            <AlertTriangle size={11} /> Yanıt Bekleniyor
          </span>
        ) : onaylandi ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full" style={{ color: ACCENT, backgroundColor: `${ACCENT}1A` }}>
            <ThumbsUp size={11} /> Gönderime Hazır
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full" style={{ color: TEXT_MUTED, backgroundColor: "rgba(255,255,255,0.06)" }}>
            Bekliyor
          </span>
        )}
      </td>
      <td className="px-2.5 py-2.5 text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{formatDateTR(rez?.gemi_kalkis_tarihi || null)}</td>
      <td className="px-2.5 py-2.5 text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{formatDateTR(rez?.eta || null)}</td>
      <td className="px-2.5 py-2.5">
        <div className="flex items-center justify-start gap-1.5 whitespace-nowrap">
          <button
            type="button"
            onClick={handlePaketIndir}
            disabled={indiriliyor}
            title="Taslak Onay Paketi İndir (ZIP)"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border hover:bg-white/5 disabled:opacity-50 transition-colors"
            style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}
          >
            {indiriliyor ? <Loader2 size={13} className="animate-spin" /> : <FileArchive size={13} />}
          </button>
          <button
            type="button"
            onClick={handleOnayla}
            disabled={onaylandi || onaylaniyor}
            title={onaylandi ? "Onaylandı" : "Onayla"}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: ACCENT }}
          >
            <ThumbsUp size={12} /> {onaylandi ? "Onaylandı" : "Onayla"}
          </button>
          <button
            type="button"
            onClick={handleGonderildiIsaretle}
            disabled={!onaylandi || mailGonderildi || mailIsaretleniyor}
            title={!onaylandi ? "Önce evrakları onaylayın" : mailGonderildi ? "Gönderildi olarak işaretlendi" : "Draftı kendi mail yolunuzdan gönderdiyseniz burada işaretleyin"}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
            style={{ borderColor: CARD_BORDER, color: "white" }}
          >
            {mailIsaretleniyor ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} {mailGonderildi ? "Gönderildi" : "Gönderildi İşaretle"}
          </button>
          {mailGonderildi && !musteriOnayiAlindi && !revizeIstendi && (
            <>
              <button
                type="button"
                onClick={handleMusteriOnayiGeldi}
                disabled={musteriOnayiKaydediliyor}
                title="Müşteriden onay maili/cevabı geldiğinde işaretleyin"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white bg-green-600 hover:bg-green-500 disabled:opacity-50 transition-colors"
              >
                {musteriOnayiKaydediliyor ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />} Müşteri Onayladı
              </button>
              <button
                type="button"
                onClick={() => { setRevizeNotu(""); setRevizeModalAcik(true); }}
                title="Müşteri revize istediğinde işaretleyip not düşün"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white bg-orange-600 hover:bg-orange-500 transition-colors"
              >
                <MessageSquareWarning size={12} /> Revize İstendi
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
    {revizeModalAcik && (
      <tr>
        <td colSpan={9} className="p-0">
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setRevizeModalAcik(false)}>
            <div
              className="w-full max-w-md rounded-xl border p-4 shadow-lg"
              style={{ backgroundColor: "#1A1A1E", borderColor: CARD_BORDER }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <MessageSquareWarning size={14} className="text-orange-400" /> Revize Talebi — {dosya.dosya_no}
                </h3>
                <button type="button" onClick={() => setRevizeModalAcik(false)} className="text-slate-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs mb-2" style={{ color: TEXT_MUTED }}>
                Müşterinin talep ettiği değişikliği kısaca not düşün. Bu işlem dosyayı &quot;Bekliyor&quot; durumuna geri döndürür — evrakları düzelttikten sonra tekrar Onayla → Gönderildi İşaretle adımlarından geçirmeniz gerekir.
              </p>
              <textarea
                value={revizeNotu}
                onChange={(e) => setRevizeNotu(e.target.value)}
                rows={3}
                placeholder="Örn: Alıcı adresi güncellensin, konteyner sayısı 9 olarak düzeltilsin..."
                className="w-full rounded-lg border px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                style={{ borderColor: CARD_BORDER, backgroundColor: "#0F0F12" }}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setRevizeModalAcik(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ color: TEXT_MUTED, backgroundColor: "rgba(255,255,255,0.06)" }}
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handleRevizeIstendiKaydet}
                  disabled={revizeKaydediliyor}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-orange-600 hover:bg-orange-500 disabled:opacity-50 transition-colors"
                >
                  {revizeKaydediliyor ? <Loader2 size={12} className="animate-spin" /> : <MessageSquareWarning size={12} />} Revize Olarak Kaydet
                </button>
              </div>
            </div>
          </div>
        </td>
      </tr>
    )}
    </>
  );
}