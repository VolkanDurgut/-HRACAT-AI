"use client";
/**
 * HAT TAKIP - Asama 2 (28.11.2026): hat ETA rozeti (ETD/ETA tablosu) + Ana Panel uyari seridi. YALNIZ GORUNTU:
 * sistemdeki ETA'yi degistirmez; duzeltme her zamanki gibi ETD/ETA ekranindan elle. Kurallar: lib/hat-takip/eta-uyari.ts.
 */
import React from "react";
import Link from "next/link";
import { Radar } from "lucide-react";
import { CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { AcilirSerit, SERIT_TONU, useAcikTercihi } from "@/components/erp/acilir-serit";
import { SEVIYE_RENGI, type EtaUyarisi, type HatEtaOzeti } from "@/lib/hat-takip/eta-uyari";
import { farkYazi, trGun, SINIF_ETIKETI } from "@/lib/hat-takip/gorunum";

/** ETD/ETA tablosunda sistem ETA'sinin altindaki kucuk rozet. Tiklayinca Hat Takip sayfasi. */
export function HatEtaRozeti({ uyari }: { uyari: EtaUyarisi | null }) {
  if (!uyari) return null;
  const r = SEVIYE_RENGI[uyari.seviye];
  return (
    <Link href="/hat-takip" title={uyari.ipucu} data-testid="hat-eta-rozeti" data-seviye={uyari.seviye}
      className={`mt-1 inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10px] font-medium whitespace-nowrap hover:brightness-125 transition ${uyari.guncel ? "" : "opacity-60"}`}
      style={{ color: r.renk, backgroundColor: r.zemin, borderColor: r.kenar }}>
      <Radar size={10} aria-hidden="true" /> {uyari.metin}
    </Link>
  );
}

const ACIK_ANAHTARI = "panel:hat-eta-acik";

/** Ana Panel: hat ETA'si sistemdekinden farkli sevkiyatlar. Fark yoksa gorunmez. */
export function HatEtaSeridi({ liste }: { liste: { ozet: HatEtaOzeti; uyari: EtaUyarisi }[] }) {
  const [tercih, tercihYaz] = useAcikTercihi(ACIK_ANAHTARI);
  const acik = tercih ?? true;
  if (liste.length === 0) return null;
  const kritik = liste.filter((x) => x.uyari.seviye === "kritik").length;
  const ton = kritik > 0 ? SERIT_TONU.kirmizi : SERIT_TONU.amber;

  return (
    <AcilirSerit acik={acik} onDegistir={() => tercihYaz(!acik)} {...ton} className="mb-4" testId="hat-eta-seridi" kapaliEtiket="Ayrıntı"
      ikon={<Radar size={14} />}
      baslik={`Hat ETA farkı · ${liste.length} sevkiyat`}
      rozetSinif="text-[10.5px]"
      rozetler={<>
        {kritik > 0 && <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#FCA5A5" }}>3+ gün <b>{kritik}</b></span>}
        {liste.length - kritik > 0 && <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: "rgba(245,158,11,0.15)", color: "#FCD34D" }}>1–2 gün <b>{liste.length - kritik}</b></span>}
        <span className="rounded-full px-2 py-0.5 border" style={{ borderColor: CARD_BORDER, color: "#E2E8F0" }}>Hapag-Lloyd · 15 dk&apos;da bir</span>
      </>}>
      <ul className="divide-y border-t" style={{ borderColor: CARD_BORDER }}>
        {liste.map(({ ozet, uyari }) => {
          const r = SEVIYE_RENGI[uyari.seviye];
          return (
            <li key={ozet.rezervasyon_id}>
              <Link href="/etd-eta" title={uyari.ipucu} data-hat-eta={uyari.seviye}
                className="w-full flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-left hover:bg-white/[0.03]">
                <span className="inline-flex h-5 w-20 items-center justify-center rounded-full text-[11px] font-medium shrink-0 tabular-nums"
                  style={{ backgroundColor: r.zemin, color: r.renk }}>{farkYazi(uyari.fark)}</span>
                <span className="text-sm font-semibold text-white whitespace-nowrap">{ozet.dosya_no || ozet.booking_no}</span>
                <span className="text-xs truncate min-w-0 flex-1" style={{ color: "#C9D1DC" }}>{ozet.alici_firma || "—"}</span>
                <span className="text-[11px] whitespace-nowrap tabular-nums" style={{ color: TEXT_MUTED }}>
                  Sistem {trGun(ozet.sistem_eta?.slice(0, 10) ?? null)} → Hat <span className="text-white">{trGun(uyari.hatGun)}</span>
                  {ozet.hat_eta_sinif ? ` (${SINIF_ETIKETI[ozet.hat_eta_sinif] ?? ozet.hat_eta_sinif})` : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="px-4 py-2 border-t text-[10.5px]" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
        Bu uyarı sistemdeki ETA&apos;yı değiştirmez. Düzeltme ETD/ETA ekranından yapılır; ayrıntı için{" "}
        <Link href="/hat-takip" className="underline hover:text-white">Hat Takip</Link>.
      </p>
    </AcilirSerit>
  );
}
