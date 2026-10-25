"use client";

/**
 * Proforma Yukle - AI asistan gorunumu (25.10.2026, kullanici istegi: "Yeni Dosya Ac,
 * Proforma Yukle olarak; AI ajani gibi modern, sadece 'PDF yukle' gibi kalmasin").
 *
 * SADECE GORUNUM: okuma (edge function proforma-oku), varis limani kontrolu, siparis
 * eslestirme ve dosya olusturma mantigi app/yeni-dosya/page.tsx'te AYNEN duruyor.
 * Ilerleme adimlari sayfanin GERCEK asamasina baglidir (sahte zamanlayici yok);
 * sadece okuma suresi sayaci zamanla isler.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Sparkles, FileUp, FileText, X, Building2, Boxes, Banknote, Anchor, Landmark, Link2,
  Check, Loader2, AlertTriangle, ArrowRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { kullaniciHitabi } from "@/lib/kullanici-hitap";
import { formatCurrency } from "@/lib/cutoff-utils";
import { sayiOku } from "@/lib/sayi-oku";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

export type AsistanAsamasi = "okuma" | "liman" | "siparis" | "dosya";

const YETENEKLER: { ikon: React.ReactNode; metin: string }[] = [
  { ikon: <Building2 size={13} />, metin: "Alıcı ve adres" },
  { ikon: <Boxes size={13} />, metin: "Ürün kalemleri" },
  { ikon: <Banknote size={13} />, metin: "Tutar ve ödeme" },
  { ikon: <Anchor size={13} />, metin: "Limanlar ve teslim" },
  { ikon: <Landmark size={13} />, metin: "Banka bilgileri" },
  { ikon: <Link2 size={13} />, metin: "Sipariş eşleştirme" },
];

function boyutYazi(bayt: number): string {
  if (bayt < 1024 * 1024) return `${Math.max(1, Math.round(bayt / 1024))} KB`;
  return `${(bayt / (1024 * 1024)).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;
}

/** Asistan basligi: ikon + ad + durum noktasi */
function AsistanBasligi({ durum }: { durum: "hazir" | "calisiyor" }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `linear-gradient(135deg, ${ACCENT}33, ${ACCENT}0D)`, border: `1px solid ${ACCENT}59` }}
      >
        <Sparkles size={19} style={{ color: ACCENT }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white leading-tight">İhracat AI Asistanı</p>
        <p className="text-[11px] flex items-center gap-1.5 mt-0.5" style={{ color: TEXT_MUTED }}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${durum === "calisiyor" ? "animate-pulse" : ""}`}
            style={{ backgroundColor: durum === "calisiyor" ? "#F59E0B" : ACCENT }} />
          {durum === "calisiyor" ? "Proforma inceleniyor" : "Proforma okumaya hazır"}
        </p>
      </div>
    </div>
  );
}

/** Kart kabugu: hafif vurgu isiltisi olan koyu kart */
function AsistanKarti({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border shadow-sm animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full"
        style={{ background: `radial-gradient(circle, ${ACCENT}1F 0%, transparent 70%)` }} />
      <div className="relative p-5 sm:p-7">{children}</div>
    </div>
  );
}

export function ProformaAsistanYukleme({
  dosya, mesgul, onDrop, onSec, onTemizle, onBaslat,
}: {
  dosya: File | null;
  mesgul: boolean;
  onDrop: (e: React.DragEvent) => void;
  onSec: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTemizle: () => void;
  onBaslat: () => void;
}) {
  const { user } = useAuth();
  const hitap = kullaniciHitabi(user?.email, user?.user_metadata);
  const [surukleniyor, setSurukleniyor] = useState(false);
  const sayac = useRef(0); // ic ice ogelerde dragenter/leave titremesini onler

  const sec = () => document.getElementById("pdf-input")?.click();

  return (
    <AsistanKarti>
      <AsistanBasligi durum="hazir" />

      <div className="mt-4 rounded-2xl rounded-tl-md border px-4 py-3 text-sm leading-relaxed text-white/90"
        style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
        {hitap ? `Merhaba ${hitap}, ` : "Merhaba, "}
        proformayı buraya bırakın. Alıcı ve adres, ürün kalemleri, tutarlar, limanlar ve banka
        bilgilerini okuyup ihracat dosyasını sizin için hazırlayayım.
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Okunan bilgiler">
        {YETENEKLER.map((y) => (
          <span key={y.metin} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium"
            style={{ borderColor: CARD_BORDER, color: TEXT_MUTED, backgroundColor: "rgba(255,255,255,0.02)" }}>
            <span style={{ color: ACCENT }}>{y.ikon}</span>
            {y.metin}
          </span>
        ))}
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Proforma PDF'i seçin veya sürükleyip bırakın"
        onClick={sec}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sec(); } }}
        onDragEnter={(e) => { e.preventDefault(); sayac.current += 1; setSurukleniyor(true); }}
        onDragLeave={(e) => { e.preventDefault(); sayac.current = Math.max(0, sayac.current - 1); if (sayac.current === 0) setSurukleniyor(false); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { sayac.current = 0; setSurukleniyor(false); onDrop(e); }}
        className="mt-5 rounded-2xl border-2 border-dashed px-4 py-8 sm:py-10 text-center cursor-pointer transition-all duration-200 outline-none focus-visible:ring-2"
        style={{
          borderColor: surukleniyor || dosya ? ACCENT : CARD_BORDER,
          backgroundColor: surukleniyor ? `${ACCENT}14` : dosya ? `${ACCENT}08` : "rgba(255,255,255,0.015)",
          boxShadow: surukleniyor ? `0 0 0 4px ${ACCENT}1A` : undefined,
        }}
      >
        <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center transition-transform duration-200"
          style={{ backgroundColor: `${ACCENT}1A`, transform: surukleniyor ? "scale(1.08)" : undefined }}>
          <FileUp size={22} style={{ color: ACCENT }} />
        </div>
        <p className="mt-3 text-sm font-semibold text-white">
          {surukleniyor ? "Bırakın, okumaya hazırım" : dosya ? "Başka bir proforma seçmek için tıklayın" : "Proforma PDF'ini buraya bırakın"}
        </p>
        <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>veya bilgisayarınızdan seçin · PDF, en fazla 20 MB</p>
      </div>
      {/* Kutunun DISINDA: input.click() olayi kutunun onClick'ine kabarcik yapmasin */}
      <input id="pdf-input" type="file" accept=".pdf,application/pdf" className="hidden" onChange={onSec} />

      {dosya && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(239,68,68,0.12)" }}>
            <FileText size={17} className="text-red-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate" title={dosya.name}>{dosya.name}</p>
            <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{boyutYazi(dosya.size)} · okunmaya hazır</p>
          </div>
          <button type="button" onClick={onTemizle} aria-label="Seçilen dosyayı kaldır"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0" style={{ color: TEXT_MUTED }}>
            <X size={16} />
          </button>
        </div>
      )}

      <button
        onClick={onBaslat}
        disabled={!dosya || mesgul}
        className="mt-5 w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm transition-all duration-200 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ backgroundColor: ACCENT, boxShadow: dosya ? `0 8px 24px -10px ${ACCENT}` : undefined }}
      >
        <Sparkles size={16} />
        Proformayı Oku ve Dosyayı Hazırla
        <ArrowRight size={15} />
      </button>
      <p className="text-[11px] text-center mt-2.5" style={{ color: TEXT_MUTED }}>
        Okunan bilgileri dosya açılmadan önce görürsünüz; sonradan ilgili kartlardan düzeltebilirsiniz.
      </p>
    </AsistanKarti>
  );
}

const ADIMLAR: { anahtar: AsistanAsamasi | "alindi"; baslik: string; aciklama: string }[] = [
  { anahtar: "alindi", baslik: "Proforma alındı", aciklama: "" },
  { anahtar: "okuma", baslik: "Belge okunuyor", aciklama: "Satıcı, alıcı, ürünler, tutarlar ve banka bilgileri çıkarılıyor" },
  { anahtar: "liman", baslik: "Varış limanı kontrol ediliyor", aciklama: "Yükleme limanıyla çakışma ve müşterinin önceki dosyaları" },
  { anahtar: "siparis", baslik: "Sipariş kayıtları eşleştiriliyor", aciklama: "Aynı proformaya ait devam eden sipariş aranıyor" },
  { anahtar: "dosya", baslik: "İhracat dosyası hazırlanıyor", aciklama: "Kayıt oluşturuluyor ve proforma arşivleniyor" },
];
const SIRA: (AsistanAsamasi | "alindi")[] = ["alindi", "okuma", "liman", "siparis", "dosya"];

export function ProformaAsistanIlerleme({ dosyaAdi, asama }: { dosyaAdi: string; asama: AsistanAsamasi }) {
  const [saniye, setSaniye] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setSaniye((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  const aktifSira = SIRA.indexOf(asama);

  return (
    <AsistanKarti>
      <div className="flex items-start justify-between gap-3">
        <AsistanBasligi durum="calisiyor" />
        <span className="text-[11px] tabular-nums px-2 py-1 rounded-md border shrink-0" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
          {saniye} sn
        </span>
      </div>

      <div className="mt-4 rounded-2xl rounded-tl-md border px-4 py-3 text-sm leading-relaxed text-white/90"
        style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
        <span className="font-medium text-white break-all">{dosyaAdi}</span> inceleniyor. Okuma genellikle
        10–30 saniye sürer; lütfen sayfadan ayrılmayın.
      </div>

      <ol className="mt-5 space-y-0" aria-label="İşlem adımları">
        {ADIMLAR.map((a, i) => {
          const durum = i < aktifSira ? "tamam" : i === aktifSira ? "aktif" : "bekliyor";
          const son = i === ADIMLAR.length - 1;
          return (
            <li key={a.anahtar} className="relative flex gap-3 pb-4 last:pb-0" aria-current={durum === "aktif" ? "step" : undefined}>
              {!son && (
                <span aria-hidden="true" className="absolute left-[13px] top-7 bottom-0 w-px"
                  style={{ backgroundColor: durum === "tamam" ? `${ACCENT}80` : CARD_BORDER }} />
              )}
              <span className="relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 border"
                style={{
                  borderColor: durum === "bekliyor" ? CARD_BORDER : ACCENT,
                  backgroundColor: durum === "tamam" ? ACCENT : durum === "aktif" ? `${ACCENT}1A` : CARD_BG,
                }}>
                {durum === "tamam" ? <Check size={14} className="text-white" />
                  : durum === "aktif" ? <Loader2 size={14} className="animate-spin" style={{ color: ACCENT }} />
                  : <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#4A5262" }} />}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={`text-sm ${durum === "bekliyor" ? "" : "text-white"} ${durum === "aktif" ? "font-semibold" : "font-medium"}`}
                  style={durum === "bekliyor" ? { color: "#5A6272" } : undefined}>
                  {a.baslik}
                </p>
                {a.aciklama && durum === "aktif" && (
                  <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{a.aciklama}</p>
                )}
                {durum === "aktif" && a.anahtar === "okuma" && (
                  <div className="mt-2 space-y-1.5" aria-hidden="true">
                    <div className="h-2 rounded-full animate-pulse w-56 max-w-full" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
                    <div className="h-2 rounded-full animate-pulse w-40 max-w-full" style={{ backgroundColor: "rgba(255,255,255,0.05)" }} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </AsistanKarti>
  );
}

function tutarYazi(tutar: unknown, birim: unknown): string | null {
  const n = sayiOku(tutar);
  if (!n) return null;
  try { return formatCurrency(n, typeof birim === "string" && birim.trim() ? birim.trim().toUpperCase() : "USD"); }
  catch { return `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${String(birim || "")}`.trim(); }
}

function metin(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** Dosya acilmadan once: proformadan okunanlarin ozeti (salt gosterim). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ProformaOkumaOzeti({ veri, toplamMts, uyari }: { veri: any; toplamMts: number; uyari: string | null }) {
  const kalemSayisi = Array.isArray(veri?.urun_detaylari) ? veri.urun_detaylari.length : 0;
  const yukleme = metin(veri?.yuklenme_limani) || metin(veri?.yukleme_limani);
  const varis = metin(veri?.varis_limani);
  const alanlar: { etiket: string; deger: string | null; onemli?: boolean }[] = [
    { etiket: "Alıcı", deger: metin(veri?.alici_firma), onemli: true },
    { etiket: "Proforma No", deger: [metin(veri?.proforma_no), metin(veri?.proforma_tarihi)].filter(Boolean).join(" · ") || null, onemli: true },
    { etiket: "Toplam Tutar", deger: tutarYazi(veri?.toplam_tutar, veri?.para_birimi), onemli: true },
    { etiket: "Miktar", deger: toplamMts > 0 ? `${toplamMts.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} ${metin(veri?.miktar_birimi) || "MTS"}${kalemSayisi ? ` · ${kalemSayisi} kalem` : ""}` : null },
    { etiket: "Teslim / Ödeme", deger: [metin(veri?.teslim_sekli), metin(veri?.odeme_sekli)].filter(Boolean).join(" · ") || null },
    { etiket: "Yükleme → Varış", deger: yukleme || varis ? `${yukleme || "—"} → ${varis || "—"}` : null },
  ];

  return (
    <div className="mb-4 rounded-2xl border shadow-sm overflow-hidden animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={15} style={{ color: ACCENT }} />
          <p className="text-sm font-semibold text-white truncate">Proformadan okunanlar</p>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0"
          style={{ color: ACCENT, backgroundColor: `${ACCENT}14`, border: `1px solid ${ACCENT}40` }}>
          <Check size={11} /> Okundu
        </span>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 px-5 py-4">
        {alanlar.map((a) => (
          <div key={a.etiket} className="min-w-0">
            <dt className="text-[11px] font-medium" style={{ color: TEXT_MUTED }}>{a.etiket}</dt>
            <dd className={`text-sm mt-0.5 break-words ${a.deger ? "text-white font-medium" : ""}`}
              style={a.deger ? undefined : { color: a.onemli ? "#FCD34D" : "#5A6272" }}>
              {a.deger || (a.onemli ? "Okunamadı — dosyada kontrol edin" : "—")}
            </dd>
          </div>
        ))}
      </dl>
      {uyari && (
        <div className="mx-5 mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{ color: "#FCD34D", borderColor: "rgba(245,158,11,0.3)", backgroundColor: "rgba(245,158,11,0.08)" }}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{uyari}</span>
        </div>
      )}
    </div>
  );
}
