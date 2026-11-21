"use client";
/**
 * Siparis Listesi: "Sistemde karsiligi olmayan siparisler" seridi (21.11.2026, Faz 4 - sistem esas).
 * Kullanici: "Eski satirlar proformayla bir kerelik eslestirilir; eslesmeyenler size liste halinde gelir."
 * Bu satirlarin sistemde proformasi / dosyasi yok: durumlari yalniz Excel'den gelir. Satir yoksa serit gorunmez.
 * "Listede goster": arama kutusuna proforma no yazilir ve satirin sekmesi acilir (21.11.2026: rezervasyonlu / BL eksik
 * satir Yukleme Plani'nda booking ya da firma adiyla aranir). Hicbir kaydi degistirmez.
 */
import React from "react";
import { FileSpreadsheet, Search } from "lucide-react";
import { AcilirSerit, SERIT_TONU, useAcikTercihi } from "@/components/erp/acilir-serit";
import { CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { DURUM_ADI } from "@/lib/siparis/liste";
import type { EslesmeyenSatir } from "@/lib/siparis/veri";

const trTarih = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "-");

/** 21.11.2026: acik / onAcik verilirse sayfa da seridi acabilir ("BL eksik" karti); verilmezse kullanicinin tercihi. */
export function EslesmeyenSerit({ satirlar, onGoster, acik: disAcik = null, onAcik }: {
  satirlar: EslesmeyenSatir[]; onGoster: (s: EslesmeyenSatir) => void; acik?: boolean | null; onAcik?: (a: boolean) => void;
}) {
  const [acik, setAcik] = useAcikTercihi("siparis-eslesmeyen-serit");
  if (!satirlar.length) return null;
  const gorunur = disAcik ?? acik ?? false;
  return (
    <AcilirSerit className="mb-4" testId="eslesmeyen-serit" acik={gorunur} onDegistir={() => { setAcik(!gorunur); onAcik?.(!gorunur); }}
      ikon={<FileSpreadsheet size={14} />} baslik={`Sistemde karşılığı olmayan siparişler · ${satirlar.length}`}
      rozetler={<span className="text-[11px]" style={{ color: "#E2C76B" }}>Durumları yalnız Excel'den gelir</span>}
      {...SERIT_TONU.amber}>
      <ul className="max-h-72 overflow-y-auto" data-testid="eslesmeyen-liste">
        {satirlar.map((s) => (
          <li key={s.anahtar} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 border-t text-[13px]" style={{ borderColor: CARD_BORDER }} data-eslesmeyen={s.proforma_no || ""}>
            <span className="font-medium text-white whitespace-nowrap">{s.proforma_no || "-"}</span>
            <span className="truncate min-w-0 flex-1" style={{ color: "#C9D1DC" }}>{s.firma || "-"}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#C9D1DC" }}>{DURUM_ADI[s.durum] || s.durum}</span>
            <span className="text-xs whitespace-nowrap tabular-nums" style={{ color: TEXT_MUTED }}>
              {s.miktar_mt !== null ? `${s.miktar_mt.toLocaleString("tr-TR")} MT` : ""}{s.konteyner ? ` · ${s.konteyner} kont.` : ""} · {trTarih(s.proforma_tarihi)}
            </span>
            <button type="button" onClick={() => onGoster(s)} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border text-xs text-white hover:bg-white/[0.04]" style={{ borderColor: "rgba(245,158,11,0.45)" }}>
              <Search size={12} /> Listede göster
            </button>
          </li>
        ))}
      </ul>
      <p className="px-4 py-2 border-t text-[11px]" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
        Sistemde proforması ya da dosyası açılınca satır kendiliğinden sistemden güncellenir ve bu listeden düşer. Eski / kapanmış bir siparişse Excel'de güncelleyip listeyi yeniden yükleyin.
      </p>
    </AcilirSerit>
  );
}
