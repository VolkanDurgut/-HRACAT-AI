"use client";

/**
 * Sevkiyat Evraklari - AI asistan yukleme gorunumu (28.10.2026, kullanici: "Sevkiyat evraklari
 * kismindaki evrak yukleme alanlari Proforma Yukle tarzinda olsun; chat animasyonu ve yapay
 * zeka enerjisi gibi").
 *
 * SADECE GORUNUM: yukleme, AI kontrolu (fatura-kontrol / konsimento-kontrol), kayit, depo
 * temizligi ve hata akislari her bolumun kendi bileseninde AYNEN durur. Bu dosya:
 *   - EvrakAsistanYukleme: asistan basligi + sohbet balonu (yaziyor noktalari -> harf harf) +
 *     okunacak bilgi etiketleri + surukle-birak alani (klavye ile de secilir).
 *   - EvrakAsistanKilitli: yukleme henuz yapilamiyorsa nedenini asistan diliyle soyler.
 *   - EvrakAsistanIsleniyor: islem surerken; ilerleme SAHTE DEGIL - yalnizca gercek gecen
 *     sure sayilir, kontrol edilen alanlar listelenir (proforma asistaninin kurali).
 * "Hareketi azalt" acikken animasyonlar durur (YaziAnimasyonu + globals.css).
 */

import React, { useEffect, useRef, useState } from "react";
import { Sparkles, FileUp, Lock } from "lucide-react";
import { CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { YaziAnimasyonu } from "@/components/yazi-animasyonu";

export type AsistanYetenegi = { ikon: React.ReactNode; metin: string };

function AsistanSatiri({ durum, belge, hazirYazisi }: { durum: "hazir" | "calisiyor" | "bekliyor"; belge: string; hazirYazisi?: string }) {
  const renk = durum === "calisiyor" ? "#F59E0B" : durum === "bekliyor" ? "#64748B" : ACCENT;
  const yazi = hazirYazisi || (durum === "calisiyor" ? `${belge} inceleniyor` : durum === "bekliyor" ? "Ön koşul bekleniyor" : `${belge} okumaya hazır`);
  return (
    <div className="flex items-center gap-2.5">
      <span className={`relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${durum === "calisiyor" ? "evrak-ai-nabiz" : ""}`}
        style={{ background: `linear-gradient(135deg, ${ACCENT}33, ${ACCENT}0D)`, border: `1px solid ${ACCENT}59` }}>
        <Sparkles size={15} style={{ color: ACCENT }} />
      </span>
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-white leading-tight">İhracat AI</p>
        <p className="text-[11px] flex items-center gap-1.5 mt-0.5" style={{ color: TEXT_MUTED }}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${durum === "calisiyor" ? "animate-pulse" : ""}`} style={{ backgroundColor: renk }} />
          {yazi}
        </p>
      </div>
    </div>
  );
}

/** Sohbet balonu: once "yaziyor" noktalari, sonra harf harf. Yer kaymasi yok. */
function SohbetBalonu({ metin, gecikmeMs = 0, onBitti }: { metin: string; gecikmeMs?: number; onBitti?: () => void }) {
  const [noktalar, setNoktalar] = useState(true);
  useEffect(() => {
    let azalt = false;
    try { azalt = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* eski tarayici */ }
    const t = setTimeout(() => setNoktalar(false), azalt ? 0 : 550 + gecikmeMs);
    return () => clearTimeout(t);
  }, [gecikmeMs]);
  return (
    <div className="mt-3 rounded-2xl rounded-tl-md border px-3.5 py-2.5 text-[13px] leading-relaxed text-white/90"
      style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
      {noktalar ? (
        <span className="relative block">
          <span aria-hidden="true" className="invisible">{metin}</span>
          <span className="absolute inset-0 flex items-start pt-1.5 gap-1" style={{ color: TEXT_MUTED }} aria-label="Asistan yazıyor">
            <span className="yazi-nokta" /><span className="yazi-nokta" /><span className="yazi-nokta" />
          </span>
        </span>
      ) : (
        <YaziAnimasyonu metin={metin} harfMs={16} enUzunMs={1600} onBitti={onBitti} />
      )}
    </div>
  );
}

export function EvrakAsistanYukleme({
  belge, mesaj, yetenekler, accept, bicimNotu, kabul, kabulHatasi, onDosya, gecikmeMs = 0, testId, hazirYazisi,
}: {
  /** Durum satiri (varsayilan "<belge> okumaya hazir"; AI okumasi olmayan belgede farkli) */
  hazirYazisi?: string;
  /** "Fatura", "Draft BL" ... (durum satirinda) */
  belge: string;
  mesaj: string;
  yetenekler: AsistanYetenegi[];
  accept: string;
  /** "PDF, en fazla 20 MB" */
  bicimNotu: string;
  /** Dosya kabul edilir mi (tur kontrolu). false -> kabulHatasi gosterilir, onDosya cagrilmaz. */
  kabul: (f: File) => boolean;
  kabulHatasi: string;
  onDosya: (f: File) => void;
  /** Ayni ekrandaki birden fazla asistan sirayla "yazsin" */
  gecikmeMs?: number;
  testId?: string;
}) {
  const [yazildi, setYazildi] = useState(false);
  const [surukleniyor, setSurukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const sayac = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  const al = (f: File | null | undefined) => {
    if (!f) return;
    if (!kabul(f)) { setHata(kabulHatasi); return; }
    setHata(null);
    onDosya(f);
  };

  return (
    <div className="relative">
      <AsistanSatiri durum="hazir" belge={belge} hazirYazisi={hazirYazisi} />
      <SohbetBalonu metin={mesaj} gecikmeMs={gecikmeMs} onBitti={() => setYazildi(true)} />
      <div className={`mt-2.5 flex flex-wrap gap-1.5 transition-opacity duration-500 ${yazildi ? "opacity-100" : "opacity-0"}`} aria-label="Kontrol edilen bilgiler">
        {yetenekler.map((y) => (
          <span key={y.metin} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10.5px] font-medium"
            style={{ borderColor: CARD_BORDER, color: TEXT_MUTED, backgroundColor: "rgba(255,255,255,0.02)" }}>
            <span style={{ color: ACCENT }}>{y.ikon}</span>
            {y.metin}
          </span>
        ))}
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={`${belge} dosyasını seçin veya sürükleyip bırakın`}
        data-testid={testId}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
        onDragEnter={(e) => { e.preventDefault(); sayac.current += 1; setSurukleniyor(true); }}
        onDragLeave={(e) => { e.preventDefault(); sayac.current = Math.max(0, sayac.current - 1); if (sayac.current === 0) setSurukleniyor(false); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); sayac.current = 0; setSurukleniyor(false); al(e.dataTransfer.files?.[0]); }}
        className={`mt-3.5 rounded-xl border-2 border-dashed px-4 py-5 text-center cursor-pointer transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${surukleniyor ? "evrak-ai-surukle" : ""}`}
        style={{
          borderColor: surukleniyor ? ACCENT : CARD_BORDER,
          backgroundColor: surukleniyor ? `${ACCENT}14` : "rgba(255,255,255,0.015)",
          boxShadow: surukleniyor ? `0 0 0 4px ${ACCENT}1A, 0 0 28px -6px ${ACCENT}` : undefined,
        }}
      >
        <div className="mx-auto w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-200"
          style={{ backgroundColor: `${ACCENT}1A`, transform: surukleniyor ? "scale(1.1)" : undefined }}>
          <FileUp size={19} style={{ color: ACCENT }} />
        </div>
        <p className="mt-2 text-[13px] font-semibold text-white">
          {surukleniyor ? "Bırakın, okumaya hazırım" : `${belge} dosyasını buraya bırakın`}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>veya tıklayıp seçin · {bicimNotu}</p>
      </div>
      {/* Kutunun DISINDA: input.click() kutunun onClick'ine kabarcik yapmasin */}
      <input ref={input} type="file" accept={accept} className="hidden"
        onChange={(e) => { al(e.target.files?.[0]); e.target.value = ""; }} />
      {hata && <p className="mt-2 text-xs text-red-400" role="alert">{hata}</p>}
    </div>
  );
}

export function EvrakAsistanKilitli({ belge, mesaj, gecikmeMs = 0 }: { belge: string; mesaj: string; gecikmeMs?: number }) {
  return (
    <div>
      <AsistanSatiri durum="bekliyor" belge={belge} />
      <SohbetBalonu metin={mesaj} gecikmeMs={gecikmeMs} />
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed px-3.5 py-3 text-[12px]"
        style={{ borderColor: CARD_BORDER, color: TEXT_MUTED, backgroundColor: "rgba(255,255,255,0.01)" }}>
        <Lock size={14} className="shrink-0" />
        Yükleme alanı ön koşul tamamlanınca açılır.
      </div>
    </div>
  );
}

/** Islem suruyor: gercek gecen sure + kontrol edilen alanlar (sahte adim ilerlemesi YOK). */
export function EvrakAsistanIsleniyor({ belge, mesaj, kontroller, durumYazisi }: { belge: string; mesaj: string; kontroller: string[]; durumYazisi?: string }) {
  const [sn, setSn] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const z = setInterval(() => setSn(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(z);
  }, []);
  return (
    <div aria-live="polite">
      <AsistanSatiri durum="calisiyor" belge={belge} hazirYazisi={durumYazisi} />
      <div className="mt-3 rounded-xl border px-3.5 py-3" style={{ backgroundColor: ROW_HEADER_BG, borderColor: `${ACCENT}40` }}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-white">{mesaj}</p>
          <span className="text-[11px] tabular-nums shrink-0" style={{ color: TEXT_MUTED }}>{sn} sn</span>
        </div>
        <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
          <div className="evrak-ai-enerji h-full w-1/3 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)` }} />
        </div>
        {kontroller.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
            {kontroller.map((k, i) => (
              <li key={k} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: TEXT_MUTED }}>
                <span className="evrak-ai-nokta w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ACCENT, animationDelay: `${i * 0.18}s` }} />
                {k}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
