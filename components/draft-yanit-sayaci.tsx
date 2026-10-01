"use client";

import { Clock } from "lucide-react";
import { useSimdi } from "@/lib/use-simdi";
import { formatKalanSure, CUTOFF_UYARI_ESIGI_MS } from "@/lib/cutoff-utils";
import { formatIstanbulTarihSaat } from "@/lib/draft-onay-sure";
import { TEXT_MUTED } from "@/lib/theme";

/** "02.10.2026 16:54" -> "02.10 16:54" (tablo icin kisa bicim; yil tooltip'te). */
function kisaTarihSaat(ms: number): string {
  const [tarih, saat] = formatIstanbulTarihSaat(ms).split(" ");
  return `${tarih.slice(0, 5)} ${saat}`;
}

/**
 * Draft Onay "Yanıt Bekleniyor" icin 48 saatlik canli geri sayim
 * (talep: 01.10.2026). Durum rozetinin ALTINDA TEK SATIR olarak durur ki
 * tablodaki tum satirlar ayni yukseklikte kalsin (duzen revizesi 01.10.2026):
 *   "⏱ 1g 05:56:49 · son 02.10 16:54"
 * 10 saatten fazla -> amber, son 10 saat -> kirmizi + nabiz (uygulama geneli
 * bildirim de bu esikte gelir), sure dolunca "onaylanmis sayilir" notu.
 */
export function DraftYanitSayaci({ sonMs }: { sonMs: number }) {
  const simdi = useSimdi();
  const kalan = sonMs - simdi;
  const tamMetin = `${formatIstanbulTarihSaat(sonMs)} (Türkiye saati)`;

  if (kalan <= 0) {
    return (
      <p className="text-[10px] whitespace-nowrap tabular-nums" style={{ color: TEXT_MUTED }} title={`48 saatlik yanıt süresi ${tamMetin} itibarıyla doldu`}>
        {kisaTarihSaat(sonMs)} · onaylanmış sayılır
      </p>
    );
  }

  const kritik = kalan <= CUTOFF_UYARI_ESIGI_MS;
  const renk = kritik ? "#F87171" : "#FBBF24";
  return (
    <p
      className="flex items-center gap-1 text-[10px] whitespace-nowrap tabular-nums"
      data-testid="draft-yanit-sayaci"
      title={`48 saatlik müşteri yanıt süresi ${tamMetin} bitiyor`}
    >
      {kritik ? (
        <span className="relative flex h-1.5 w-1.5 mx-[2px]">
          <span className="absolute inline-flex h-full w-full rounded-full animate-ping" style={{ backgroundColor: renk, opacity: 0.7 }} />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: renk }} />
        </span>
      ) : (
        <Clock size={10} style={{ color: renk }} />
      )}
      <span className="font-semibold" style={{ color: renk }}>{formatKalanSure(kalan)}</span>
      <span style={{ color: TEXT_MUTED }}>· son {kisaTarihSaat(sonMs)}</span>
    </p>
  );
}
