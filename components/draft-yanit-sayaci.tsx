"use client";

import { Clock } from "lucide-react";
import { useSimdi } from "@/lib/use-simdi";
import { formatKalanSure, CUTOFF_UYARI_ESIGI_MS } from "@/lib/cutoff-utils";
import { formatIstanbulTarihSaat } from "@/lib/draft-onay-sure";
import { TEXT_MUTED } from "@/lib/theme";

/**
 * Draft Onay "Yanıt Bekleniyor" icin 48 saatlik canli geri sayim
 * (talep: 01.10.2026). Esikler panel cut-off sayaciyla ayni dili konusur:
 * 10 saatten fazla -> amber, son 10 saat -> kirmizi + nabiz (uygulama geneli
 * bildirim de bu esikte gelir), sure dolunca "onaylanmis sayilir" notu.
 */
export function DraftYanitSayaci({ sonMs }: { sonMs: number }) {
  const simdi = useSimdi();
  const kalan = sonMs - simdi;
  const sonMetni = formatIstanbulTarihSaat(sonMs);

  if (kalan <= 0) {
    return (
      <p className="mt-1 text-[10px] whitespace-nowrap" style={{ color: TEXT_MUTED }} title={`48 saatlik yanıt süresi ${sonMetni} itibarıyla doldu`}>
        {sonMetni} · onaylanmış sayılır
      </p>
    );
  }

  const kritik = kalan <= CUTOFF_UYARI_ESIGI_MS;
  const renk = kritik ? "#F87171" : "#FBBF24";
  return (
    <div className="mt-1 flex flex-col gap-0.5" data-testid="draft-yanit-sayaci">
      <span
        className="inline-flex items-center gap-1.5 self-start rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums whitespace-nowrap"
        style={{
          color: renk,
          backgroundColor: kritik ? "rgba(248,113,113,0.10)" : "rgba(251,191,36,0.08)",
          borderColor: kritik ? "rgba(248,113,113,0.40)" : "rgba(251,191,36,0.28)",
        }}
        title="48 saatlik müşteri yanıt süresinden kalan"
      >
        {kritik ? (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full animate-ping" style={{ backgroundColor: renk, opacity: 0.7 }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: renk }} />
          </span>
        ) : (
          <Clock size={11} />
        )}
        {formatKalanSure(kalan)}
      </span>
      <span className="text-[10px] whitespace-nowrap" style={{ color: TEXT_MUTED }}>
        Son: <span className="text-slate-300">{sonMetni}</span>
      </span>
    </div>
  );
}
