"use client";
import React, { useState, useEffect, useCallback } from "react";
import { supabase, Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { CheckCircle2, Mail, FileType2, Ship, AlertTriangle, ThumbsUp, FileArchive, Loader2 } from "lucide-react";
import { CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { formatDateTimeTR } from "@/lib/cutoff-utils";
import { indirTaslakOnayPaketi } from "@/lib/taslak-onay-paketi";
import { buildDraftOnayMailtoUrl, draftOnayAliciEmailAl } from "@/lib/draft-onay-mail";

const EVRAK_ADLARI: Record<string, string> = {
  commercial_invoice: "Commercial Invoice",
  packing_list: "Packing List",
  certificate_of_origin: "Certificate of Origin",
  phytosanitary: "Phytosanitary Certificate",
  health_certificate: "Health Certificate",
};

type TaslakEvrak = { evrak_tipi: string; dosya_url: string; dosya_adi: string };

type Props = {
  dosya: Dosya;
  rezervasyonlar: Rezervasyon[];
  konteynerler: Konteyner[];
  companyId: string;
  onRefresh: () => void;
};

/**
 * Draft Onay tablosunda TEK BİR SATIR. İhracatlar sayfasındaki (app/ihracatlar)
 * yatay tablo deseniyle aynı sınıflar/renkler kullanılır - amaç kullanıcının
 * zaten alışık olduğu görünümü korumak.
 */
export default function DraftOnayKarti({ dosya, rezervasyonlar, konteynerler, companyId, onRefresh }: Props) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [taslakEvraklar, setTaslakEvraklar] = useState<TaslakEvrak[]>([]);
  const [onaylaniyor, setOnaylaniyor] = useState(false);
  const [indiriliyor, setIndiriliyor] = useState(false);

  const draftBlUrl = (dosya as any).draft_bl_dosya_url as string | null;
  const draftBlAdi = (dosya as any).draft_bl_dosya_adi as string | null;
  const rez = rezervasyonlar[0];
  const aliciEmail = draftOnayAliciEmailAl(dosya);

  const taslaklariYukle = useCallback(async () => {
    const { data } = await supabase
      .from("dosya_evraklari")
      .select("evrak_tipi, dosya_url, dosya_adi")
      .eq("dosya_id", dosya.id)
      .eq("company_id", companyId)
      .eq("durum", "taslak")
      .in("evrak_tipi", Object.keys(EVRAK_ADLARI));
    setTaslakEvraklar(data || []);
  }, [dosya.id, companyId]);

  useEffect(() => {
    taslaklariYukle();
  }, [taslaklariYukle]);

  // Taslak evraklar HTML olarak saklanıyor. Dogrudan <a href> ile acinca
  // depolama servisi bunu duz metin/kaynak kod olarak gosterebiliyor. Bunun
  // onune gecmek icin icerigi fetch edip, ACIKCA "text/html" turunde bir Blob
  // olarak aciyoruz - evrak-olustur-buttons.tsx'teki uretim aninda calisan
  // goruntuleme ile BIREBIR AYNI yontem.
  const evrakGoruntule = useCallback(
    async (url: string) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Evrak alınamadı");
        const html = await res.text();
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const blobUrl = URL.createObjectURL(blob);
        const win = window.open(blobUrl, "_blank");
        if (!win) showToast("Açılır pencere engellendi. Lütfen tarayıcı ayarlarından izin verin.", "error");
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      } catch {
        showToast("Evrak açılamadı.", "error");
      }
    },
    [showToast]
  );

  const handlePaketIndir = async () => {
    if (!draftBlUrl) return;
    setIndiriliyor(true);
    try {
      await indirTaslakOnayPaketi(dosya, rezervasyonlar, konteynerler, draftBlUrl);
      showToast("Taslak onay paketi indirildi.", "success");
    } catch (err) {
      console.error("Taslak onay paketi olusturma hatasi:", err);
      showToast("Paket oluşturulamadı. Lütfen tekrar deneyin.", "error");
    } finally {
      setIndiriliyor(false);
    }
  };

  const handleOnayla = async () => {
    setOnaylaniyor(true);
    const { error } = await supabase
      .from("ihracat_dosyalari")
      .update({
        draft_onaylandi: true,
        draft_onaylayan: user?.email || null,
        draft_onay_tarihi: new Date().toISOString(),
      })
      .eq("id", dosya.id)
      .eq("company_id", companyId);
    setOnaylaniyor(false);
    if (error) {
      showToast(`Onay kaydedilemedi: ${error.message}`, "error");
      return;
    }
    showToast("Draft onaylandı. Mail Gönder butonu artık aktif.", "success");
    onRefresh();
  };

  const handleMailGonder = async () => {
    if (!aliciEmail) {
      showToast("Bu dosyada alıcı e-posta adresi tanımlı değil (Taraflar bölümünden ekleyin).", "error");
      return;
    }
    window.open(buildDraftOnayMailtoUrl(dosya, rezervasyonlar));
    const { error } = await supabase
      .from("ihracat_dosyalari")
      .update({ draft_mail_gonderildi: true })
      .eq("id", dosya.id)
      .eq("company_id", companyId);
    if (error) {
      showToast(`Durum kaydedilemedi: ${error.message}`, "error");
      return;
    }
    showToast("Mail uygulaması açıldı. Ekleri (Paketi İndir ile inen ZIP) sürükle-bırakla eklemeyi unutmayın.", "success");
    onRefresh();
  };

  const onaylandi = !!(dosya as any).draft_onaylandi;
  const mailGonderildi = !!(dosya as any).draft_mail_gonderildi;
  const onaylayan = (dosya as any).draft_onaylayan as string | null;
  const onayTarihi = (dosya as any).draft_onay_tarihi as string | null;
  const durumTitle = onaylandi ? `Onaylayan: ${onaylayan || "-"}${onayTarihi ? " · " + formatDateTimeTR(onayTarihi) : ""}` : undefined;

  // İlgili Evraklar sabit sırada gösterilir (DB'den geldiği sıradan bağımsız):
  // 1) Commercial Invoice, 2) Packing List, 3) Draft BL, 4) Certificate of
  // Origin, 5) Phytosanitary, 6) Health Certificate.
  const taslakBul = (tip: string) => taslakEvraklar.find((t) => t.evrak_tipi === tip);
  const ci = taslakBul("commercial_invoice");
  const pl = taslakBul("packing_list");
  const coo = taslakBul("certificate_of_origin");
  const phyto = taslakBul("phytosanitary");
  const health = taslakBul("health_certificate");

  type EvrakGosterim = { key: string; title: string; href?: string; onClick?: () => void };
  const evrakListesiHam: (EvrakGosterim | null)[] = [
    ci ? { key: "ci", title: EVRAK_ADLARI.commercial_invoice, onClick: () => evrakGoruntule(ci.dosya_url) } : null,
    pl ? { key: "pl", title: EVRAK_ADLARI.packing_list, onClick: () => evrakGoruntule(pl.dosya_url) } : null,
    draftBlUrl ? { key: "draftbl", title: draftBlAdi || "Draft BL", href: draftBlUrl } : null,
    coo ? { key: "coo", title: EVRAK_ADLARI.certificate_of_origin, onClick: () => evrakGoruntule(coo.dosya_url) } : null,
    phyto ? { key: "phyto", title: EVRAK_ADLARI.phytosanitary, onClick: () => evrakGoruntule(phyto.dosya_url) } : null,
    health ? { key: "health", title: EVRAK_ADLARI.health_certificate, onClick: () => evrakGoruntule(health.dosya_url) } : null,
  ];
  const evrakSirasi: EvrakGosterim[] = evrakListesiHam.filter((x): x is EvrakGosterim => x !== null);

  return (
    <tr className="border-b last:border-0 hover:bg-white/[0.03] transition-colors" style={{ borderColor: CARD_BORDER }}>
      <td className="px-2.5 py-2.5 text-xs font-semibold text-white whitespace-nowrap">{dosya.dosya_no}</td>
      <td className="px-2.5 py-2.5 text-xs max-w-[140px] truncate" style={{ color: TEXT_MUTED }}>{dosya.alici_firma || "—"}</td>
      <td className="px-2.5 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: ACCENT }}>{dosya.proforma_no || "—"}</td>
      <td className="px-2.5 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: TEXT_MUTED }}>{rez?.booking_no || "—"}</td>
      <td className="px-2.5 py-2.5">
        <div className="flex items-center gap-1 flex-wrap">
          {evrakSirasi.map((item) =>
            item.href ? (
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
        {mailGonderildi ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
            <CheckCircle2 size={11} /> Gönderildi
          </span>
        ) : onaylandi ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full" style={{ color: ACCENT, backgroundColor: `${ACCENT}1A` }}>
            <ThumbsUp size={11} /> Onaylandı
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">
            <AlertTriangle size={11} /> Bekliyor
          </span>
        )}
      </td>
      <td className="px-2.5 py-2.5">
        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
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
            onClick={handleMailGonder}
            disabled={!onaylandi}
            title={!onaylandi ? "Önce evrakları onaylayın" : "Mail uygulamasını TO/CC/Konu/Metin dolu şekilde açar"}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/5 transition-colors"
            style={{ borderColor: CARD_BORDER, color: "white" }}
          >
            <Mail size={12} /> Mail
          </button>
        </div>
      </td>
    </tr>
  );
}
