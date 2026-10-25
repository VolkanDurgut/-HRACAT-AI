"use client";

import React from "react";
import type { EksikKaynak } from "@/lib/evrak-hazirlik-kaynak";

/**
 * Evrak hazir degilken satirda DOGRUDAN gorunen, yanip sonen uyari (25.10.2026).
 * Eskiden sari unlem + uzerine gelince alan listesi (InfoTooltip) vardi; kullanici
 * istegiyle kaldirildi. Simdi: "Bekleniyor: Fatura · Konsimento talimati" - yani
 * hangi belge / adim tamamlaninca evrakin olusturulabilecegi. Alan ayrintisi
 * ekran okuyucu etiketinde ve title'da (ek bilgi; esas bilgi gorunur metinde).
 * Yanip sonme (nokta + hafif kenar isiltisi) "hareketi azalt" ayarinda kapanir.
 */
export function EvrakHazirlikUyarisi({ kaynaklar, evrakAdi, onEk = "Bekleniyor" }: { kaynaklar: EksikKaynak[]; evrakAdi?: string; onEk?: string }) {
  if (kaynaklar.length === 0) return null;
  const ayrinti = kaynaklar.map((k) => (k.alanlar.length && !(k.alanlar.length === 1 && k.alanlar[0] === k.etiket)
    ? `${k.etiket}: ${k.alanlar.join(", ")}` : k.etiket)).join("\n");
  return (
    <span
      role="status"
      aria-label={`${evrakAdi || "Bu evrak"} için ${onEk.toLocaleLowerCase("tr-TR")}: ${ayrinti.replace(/\n/g, "; ")}`}
      title={ayrinti}
      data-evrak-uyari=""
      className="evrak-uyari-nabiz inline-flex items-start gap-2 min-w-0 max-w-[17rem] sm:max-w-[22rem] rounded-lg border px-2.5 py-1.5 text-[11px] leading-snug text-left"
      style={{ borderColor: "rgba(245,158,11,0.35)", backgroundColor: "rgba(245,158,11,0.08)" }}
    >
      <span className="relative flex w-2 h-2 mt-[3px] shrink-0" aria-hidden="true">
        <span className="evrak-uyari-nokta absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full w-2 h-2 bg-amber-400" />
      </span>
      <span aria-hidden="true">
        <span className="font-semibold text-amber-300">{onEk}:</span>{" "}
        <span className="text-amber-100/90">
          {kaynaklar.map((k, i) => (
            <React.Fragment key={k.anahtar}>
              {i > 0 && " · "}
              {/* kaynak adi satir sonunda bolunmesin ("Draft / BL") */}
              <span className="whitespace-nowrap">{k.etiket}</span>
            </React.Fragment>
          ))}
        </span>
      </span>
    </span>
  );
}
