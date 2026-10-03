"use client";
import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase, Dosya, Rezervasyon, Konteyner, yazmaHatasi } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { CheckCircle2, Mail, FileType2, FileCheck2, Ship, AlertTriangle, ThumbsUp, FileArchive, Loader2, ShieldCheck, MessageSquareWarning, Clock, X } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { formatDateTR } from "@/lib/cutoff-utils";
import { indirTaslakOnayPaketi } from "@/lib/taslak-onay-paketi";
import { draftOnayAliciEmailAl, buildDraftHatirlatmaMailtoUrl } from "@/lib/draft-onay-mail";
import { draftYanitSonuMs, draftSuresiDoldu, formatIstanbulTarihSaat } from "@/lib/draft-onay-sure";
import { CUTOFF_UYARI_ESIGI_MS } from "@/lib/cutoff-utils";
import { useSimdi } from "@/lib/use-simdi";
import { DraftYanitSayaci } from "@/components/draft-yanit-sayaci";
import { CokluNoKisa } from "@/components/coklu-no-girisi";
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
  // Canli saat: 48 saat dolunca rozet sayfa yenilenmeden "Süre Doldu"ya doner.
  const simdi = useSimdi();

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
    const { data, error } = await supabase
      .from("ihracat_dosyalari")
      .update({
        draft_onaylandi: true,
        draft_onaylayan: user?.email || null,
        draft_onay_tarihi: new Date().toISOString(),
        draft_revize_istendi: false,
      })
      .eq("id", dosya.id)
      .eq("company_id", companyId)
      .select("id");
    setOnaylaniyor(false);
    const hata = yazmaHatasi(error, data);
    if (hata) {
      showToast(`Onay kaydedilemedi: ${hata}`, "error");
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
    const { data, error } = await supabase
      .from("ihracat_dosyalari")
      .update({ draft_mail_gonderildi: true, draft_mail_gonderildi_tarihi: new Date().toISOString() })
      .eq("id", dosya.id)
      .eq("company_id", companyId)
      .select("id");
    setMailIsaretleniyor(false);
    const hata = yazmaHatasi(error, data);
    if (hata) {
      showToast(`Durum kaydedilemedi: ${hata}`, "error");
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
    const { data, error } = await supabase
      .from("ihracat_dosyalari")
      .update({
        draft_musteri_onayi_alindi: true,
        draft_musteri_onayi_tarihi: new Date().toISOString(),
        draft_musteri_onayi_isaretleyen: user?.email || null,
      })
      .eq("id", dosya.id)
      .eq("company_id", companyId)
      .select("id");
    setMusteriOnayiKaydediliyor(false);
    const hata = yazmaHatasi(error, data);
    if (hata) {
      showToast(`Müşteri onayı kaydedilemedi: ${hata}`, "error");
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
    const { data, error } = await supabase
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
      .eq("company_id", companyId)
      .select("id");
    setRevizeKaydediliyor(false);
    const hata = yazmaHatasi(error, data);
    if (hata) {
      showToast(`Revize talebi kaydedilemedi: ${hata}`, "error");
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

  // 48 saatlik yanit suresi: sadece "gonderildi isaretlendi, musteri onayi da
  // gelmedi, revize de istenmedi" durumunda (yani hala aktif bekleme
  // suredeyken) anlamli - digerlerinde zaten baska bir aksiyon alinmis demektir.
  // Hesap tek yerde: lib/draft-onay-sure.ts
  const yanitSonuMs = draftYanitSonuMs(dosya);
  const sureDoldu = draftSuresiDoldu(dosya, simdi);
  const yanitKalanMs = yanitSonuMs !== null ? yanitSonuMs - simdi : null;
  const hatirlatmaKritik = yanitKalanMs !== null && yanitKalanMs > 0 && yanitKalanMs <= CUTOFF_UYARI_ESIGI_MS;
  const hatirlatmaMailto =
    yanitKalanMs !== null && yanitKalanMs > 0
      ? buildDraftHatirlatmaMailtoUrl({
          proformaNo: dosya.proforma_no,
          bookingNo: rez?.booking_no || null,
          aliciEmail,
          talimatCutoff: rez?.talimat_cutoff || null,
          beyannameCutoff: rez?.beyanname_cutoff || null,
          yanitSonuMs,
        })
      : null;

  // Tamamlanan adimlar artik ayri (soluk) butonlar olarak degil, durum
  // rozetinin uzerine gelince adim gecmisi olarak gosterilir (01.10.2026).
  const tamZaman = (iso: string | null) => {
    if (!iso) return "";
    const ms = new Date(iso).getTime();
    return isNaN(ms) ? "" : formatIstanbulTarihSaat(ms);
  };
  const mailGonderildiTarihi = dosya.draft_mail_gonderildi_tarihi as string | null;
  const durumTitle =
    [
      onaylandi ? `✓ İç onay: ${onaylayan || "-"} ${tamZaman(onayTarihi)}` : null,
      mailGonderildi ? `✓ Müşteriye gönderildi: ${tamZaman(mailGonderildiTarihi)}` : null,
      musteriOnayiAlindi ? `✓ Müşteri onayı: ${musteriOnayiIsaretleyen || "-"} ${tamZaman(musteriOnayiTarihi)}` : null,
      revizeIstendi ? `Revize: ${revizeIsaretleyen || "-"} ${tamZaman(revizeTarihi)}${revizeNotuKayitli ? "\nNot: " + revizeNotuKayitli : ""}` : null,
    ]
      .filter(Boolean)
      .join("\n") || undefined;

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
  //
  // ORİJİNAL satiri (talep: 03.10.2026): Draft ikonlarinin hemen altinda ayni
  // sirayla, AYNI yontemle (HTML yeni sekmede - Evraklar sekmesindeki PDF
  // butonlarindan daha keskin) ama FILIGRANSIZ acilir. Icerik Evraklar
  // sekmesindeki "Orijinal" butonuyla ayni builder'lardan gelir (ECTN dahil;
  // dosya "*" ile okunuyor). Sistemde orijinal BL dosyasi olmadigi icin BL'nin
  // altindaki yer bos kalir (sutunlar hizali kalsin). Veritabanina YAZMAZ.
  type HtmlBuilder = (d: Dosya, r: Rezervasyon[], k: Konteyner[]) => string;
  type EvrakGosterim = { key: string; title: string; href?: string; builder?: HtmlBuilder; draftFiligranli?: boolean; eksikler?: string[] };
  const qcIsteniyor = dosyaEvrakIstiyorMu(dosya, "Quality");
  const fcIsteniyor = dosyaEvrakIstiyorMu(dosya, "Fumigation");
  const qcHazirlik = checkKaliteSertifikasiReadiness(dosya, rezervasyonlar, konteynerler);
  const fcHazirlik = checkFumigationReadiness(dosya, rezervasyonlar, konteynerler);
  const evrakListesiHam: (EvrakGosterim | null)[] = [
    { key: "ci", title: EVRAK_ADLARI.commercial_invoice, builder: buildCommercialInvoiceHtml, draftFiligranli: true },
    { key: "pl", title: EVRAK_ADLARI.packing_list, builder: buildPackingListHtml, draftFiligranli: true },
    draftBlUrl ? { key: "draftbl", title: draftBlAdi || "Draft BL", href: draftBlUrl } : null,
    { key: "coo", title: EVRAK_ADLARI.certificate_of_origin, builder: buildCertificateOfOriginHtml, draftFiligranli: false },
    { key: "phyto", title: EVRAK_ADLARI.phytosanitary, builder: buildPhytosanitaryCertificateHtml, draftFiligranli: false },
    { key: "health", title: EVRAK_ADLARI.health_certificate, builder: buildHealthCertificateHtml, draftFiligranli: false },
    qcIsteniyor
      ? qcHazirlik.hazir
        ? { key: "qc", title: EVRAK_ADLARI.quality_certificate, builder: (d, r, k) => buildKaliteSertifikasiHtml(d, r, k, ayarlar.kaliteAyar), draftFiligranli: true }
        : { key: "qc", title: EVRAK_ADLARI.quality_certificate, eksikler: qcHazirlik.eksikler }
      : null,
    fcIsteniyor
      ? fcHazirlik.hazir
        ? { key: "fc", title: EVRAK_ADLARI.fumigation, builder: (d, r, k) => buildFumigationHtml(d, r, k, ayarlar.fumigationAyar), draftFiligranli: true }
        : { key: "fc", title: EVRAK_ADLARI.fumigation, eksikler: fcHazirlik.eksikler }
      : null,
  ];
  const evrakSirasi: EvrakGosterim[] = evrakListesiHam.filter((x): x is EvrakGosterim => x !== null);

  const IKON_SINIFI = "inline-flex items-center justify-center w-6 h-6 rounded-md hover:bg-white/10 transition-colors";
  const ORIJINAL_RENK = "#7DD3FC"; // Evraklar sekmesindeki "Orijinal" butonuyla ayni (sky-300)
  const evrakIkonu = (item: EvrakGosterim, tur: "draft" | "orijinal") => {
    const turAdi = tur === "draft" ? "Draft" : "Orijinal";
    if (item.eksikler) {
      return (
        <button
          key={`${tur}-${item.key}`}
          type="button"
          onClick={() => showToast(`${item.title} üretilemiyor. Eksik: ${item.eksikler!.join(", ")}`, "error")}
          title={`${item.title} (${turAdi}) — eksik bilgi: ${item.eksikler.join(", ")}`}
          className={`${IKON_SINIFI} text-amber-400`}
        >
          <AlertTriangle size={14} />
        </button>
      );
    }
    if (item.href) {
      // Draft BL: sadece Draft satirinda; Orijinal satirinda ayni genislikte bos yer
      if (tur === "orijinal") return <span key={`${tur}-${item.key}`} className="inline-block w-6 h-6" aria-hidden="true" />;
      return (
        <a key={`${tur}-${item.key}`} href={item.href} target="_blank" rel="noopener noreferrer" title={item.title} className={IKON_SINIFI} style={{ color: ACCENT }}>
          <Ship size={14} />
        </a>
      );
    }
    const builder = item.builder!;
    return (
      <button
        key={`${tur}-${item.key}`}
        type="button"
        onClick={() => evrakGoruntuleUret(builder, tur === "draft" ? !!item.draftFiligranli : false)}
        title={`${item.title} — ${turAdi}`}
        className={IKON_SINIFI}
        style={{ color: tur === "draft" ? ACCENT : ORIJINAL_RENK }}
      >
        {tur === "draft" ? <FileType2 size={14} /> : <FileCheck2 size={14} />}
      </button>
    );
  };

  // Durum rozetinin altindaki TEK satirlik bilgi - her satir ayni yukseklikte
  // kalsin diye her durumda bir ikinci satir vardir (duzen revizesi 01.10.2026).
  const kisaZaman = (iso: string | null) => {
    if (!iso) return null;
    const ms = new Date(iso).getTime();
    if (isNaN(ms)) return null;
    const [t, sa] = formatIstanbulTarihSaat(ms).split(" ");
    return `${t.slice(0, 5)} ${sa}`;
  };
  const durumAltSatir: React.ReactNode = musteriOnayiAlindi
    ? (kisaZaman(musteriOnayiTarihi) ? `Müşteri onayı: ${kisaZaman(musteriOnayiTarihi)}` : "Müşteri onayı alındı")
    : revizeIstendi
    ? revizeNotuKayitli || `Revize: ${kisaZaman(revizeTarihi) || "—"}`
    : (sureDoldu || mailGonderildi) && yanitSonuMs !== null
    ? <DraftYanitSayaci sonMs={yanitSonuMs} />
    : mailGonderildi
    ? "Müşteri yanıtı bekleniyor"
    : onaylandi
    ? "Müşteriye gönderilmedi"
    : "İç onay bekleniyor";

  const ROZET = "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap";
  const BUTON = "inline-flex items-center justify-center gap-1 h-7 px-2 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors disabled:opacity-50";

  return (
    <>
    <tr
      className={`border-b last:border-0 hover:bg-white/[0.03] transition-colors ${sureDoldu ? "bg-red-500/[0.05]" : hatirlatmaKritik ? "bg-red-500/[0.03]" : ""}`}
      style={{ borderColor: CARD_BORDER }}
    >
      {/* Dosya + Musteri (e-posta uyarisi ayni satirda - satir yuksekligi sabit kalsin) */}
      <td className="px-2.5 py-2.5 align-middle max-w-[160px]">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <button
            type="button"
            onClick={() => router.push(`/dosya/${dosya.id}`)}
            title="İlgili ihracat dosyasını aç"
            className="text-xs font-semibold hover:underline"
            style={{ color: ACCENT }}
          >
            {dosya.dosya_no}
          </button>
          {!aliciEmail && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-400"
              title="Müşterinin e-postası dosyada kayıtlı değil; maillerde alıcıyı elle girmeniz gerekir"
            >
              <AlertTriangle size={10} /> E-posta yok
            </span>
          )}
        </div>
        <p className="text-[11px] truncate text-slate-300" title={dosya.alici_firma || undefined}>{dosya.alici_firma || "—"}</p>
      </td>

      {/* Proforma + Booking */}
      <td className="px-2.5 py-2.5 align-middle whitespace-nowrap">
        <p className="text-[11px] font-mono"><CokluNoKisa deger={dosya.proforma_no} style={{ color: ACCENT }} /></p>
        <p className="text-[11px] font-mono" style={{ color: TEXT_MUTED }}>{rez?.booking_no || "—"}</p>
      </td>

      {/* Evraklar: ust satir Draft, alt satir Orijinal (ayni sira, hizali sutunlar) */}
      <td className="px-2.5 py-2 align-middle">
        <div className="flex flex-col gap-0.5">
          {(["draft", "orijinal"] as const).map((tur) => (
            // Satir etiketi bilerek YOK: 1366 px'te tabloyu tasiriyordu (olculdu).
            // Ayrim: renk (yesil/mavi) + ikon + ipucu + sayfa aciklamasi.
            <div key={tur} className="flex items-center flex-nowrap whitespace-nowrap" aria-label={tur === "draft" ? "Draft evraklar" : "Orijinal evraklar"}>
              {evrakSirasi.map((item) => evrakIkonu(item, tur))}
            </div>
          ))}
        </div>
      </td>

      {/* Kalkis + ETA */}
      <td className="px-2.5 py-2.5 align-middle whitespace-nowrap">
        <p className="text-[11px] text-slate-300 tabular-nums">{rez?.gemi_kalkis_tarihi ? formatDateTR(rez.gemi_kalkis_tarihi) : "—"}</p>
        <p className="text-[10px] tabular-nums" style={{ color: TEXT_MUTED }}>ETA {rez?.eta ? formatDateTR(rez.eta) : "—"}</p>
      </td>

      {/* Durum: rozet + tek satir bilgi */}
      <td className="px-2.5 py-2.5 align-middle" title={durumTitle}>
        <div className="flex flex-col items-start gap-1 min-w-[140px]">
          {musteriOnayiAlindi ? (
            <span className={`${ROZET} text-green-400 bg-green-500/10`}><CheckCircle2 size={11} /> Onay Geldi</span>
          ) : revizeIstendi ? (
            <span className={`${ROZET} text-orange-400 bg-orange-500/10`}><MessageSquareWarning size={11} /> Revize İstendi</span>
          ) : sureDoldu ? (
            <span className={`${ROZET} text-red-400 bg-red-500/10`}><Clock size={11} /> Süre Doldu (48s)</span>
          ) : mailGonderildi ? (
            <span className={`${ROZET} text-amber-400 bg-amber-500/10`}><Clock size={11} /> Yanıt Bekleniyor</span>
          ) : onaylandi ? (
            <span className={ROZET} style={{ color: ACCENT, backgroundColor: `${ACCENT}1A` }}><ThumbsUp size={11} /> Gönderime Hazır</span>
          ) : (
            <span className={ROZET} style={{ color: TEXT_MUTED, backgroundColor: "rgba(255,255,255,0.06)" }}>Bekliyor</span>
          )}
          {typeof durumAltSatir === "string" ? (
            <p className="text-[10px] whitespace-nowrap max-w-[190px] truncate" style={{ color: TEXT_MUTED }}>{durumAltSatir}</p>
          ) : (
            durumAltSatir
          )}
        </div>
      </td>

      {/* Aksiyonlar: sadece SIRADAKI adim (tamamlanan adimlar durum rozetinin
          tooltip'inde). Paket butonu her zaman ilk sirada - sabit x konumu. */}
      <td className="px-2.5 py-2.5 align-middle">
        <div className="flex items-center justify-start gap-1.5 whitespace-nowrap">
          <button
            type="button"
            onClick={handlePaketIndir}
            disabled={indiriliyor}
            title="Taslak Onay Paketi İndir (ZIP)"
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border hover:bg-white/5 disabled:opacity-50 transition-colors shrink-0"
            style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}
          >
            {indiriliyor ? <Loader2 size={13} className="animate-spin" /> : <FileArchive size={13} />}
          </button>

          {!onaylandi && (
            <button
              type="button"
              onClick={handleOnayla}
              disabled={onaylaniyor}
              title="Evrakları kontrol ettiyseniz iç onay verin"
              className={`${BUTON} text-white hover:opacity-90`}
              style={{ backgroundColor: ACCENT }}
            >
              {onaylaniyor ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />} Onayla
            </button>
          )}

          {onaylandi && !mailGonderildi && (
            <button
              type="button"
              onClick={handleGonderildiIsaretle}
              disabled={mailIsaretleniyor}
              title="Draftı kendi mail yolunuzdan gönderdiyseniz işaretleyin - 48 saatlik yanıt süresi başlar"
              className={`${BUTON} text-white hover:opacity-90`}
              style={{ backgroundColor: ACCENT }}
            >
              {mailIsaretleniyor ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Gönderildi İşaretle
            </button>
          )}

          {mailGonderildi && !musteriOnayiAlindi && !revizeIstendi && (
            <>
              <button
                type="button"
                onClick={handleMusteriOnayiGeldi}
                disabled={musteriOnayiKaydediliyor}
                title="Müşteriden onay maili/cevabı geldiğinde işaretleyin"
                className={`${BUTON} text-white bg-green-600 hover:bg-green-500`}
              >
                {musteriOnayiKaydediliyor ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />} Müşteri Onayladı
              </button>
              <button
                type="button"
                onClick={() => { setRevizeNotu(""); setRevizeModalAcik(true); }}
                title="Müşteri revize istediğinde işaretleyip not düşün"
                className={`${BUTON} border text-orange-300 hover:bg-orange-500/10`}
                style={{ borderColor: "rgba(251,146,60,0.45)" }}
              >
                <MessageSquareWarning size={12} /> Revize
              </button>
              {/* 48 saat dolmadan musteriye hatirlatma (talep: 01.10.2026).
                  Son 10 saatte kirmizi; ayni anda uygulama geneli bildirim
                  de gelir (components/cutoff-uyarilari.tsx). */}
              {hatirlatmaMailto && (
                <a
                  href={hatirlatmaMailto}
                  title={aliciEmail ? `Müşteriye hatırlatma maili: ${aliciEmail}` : "Alıcı e-postası dosyada kayıtlı değil - alıcıyı mailde elle girin"}
                  className={`${BUTON} border ${hatirlatmaKritik ? "text-red-300 hover:bg-red-500/10" : "text-slate-200 hover:bg-white/5"}`}
                  style={{ borderColor: hatirlatmaKritik ? "rgba(248,113,113,0.5)" : CARD_BORDER }}
                >
                  <Mail size={12} /> Hatırlat
                </a>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
    {revizeModalAcik && (
      <tr>
        <td colSpan={6} className="p-0">
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setRevizeModalAcik(false)}>
            <div
              className="w-full max-w-md rounded-xl border p-4 shadow-lg"
              style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}
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
                style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}
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