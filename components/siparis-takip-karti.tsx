"use client";
import React from "react";
import { ArrowRight, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { SiparisIlerlemesi, SiparisKalemDurumu, cuvalAdedi, fclAdedi } from "@/lib/siparis-takip";

type Props = {
  siparis: { proforma_no: string; alici_firma: string | null; urun_tanimi: string | null };
  ilerleme: SiparisIlerlemesi;
  sira: number;
  devamEdiyor: boolean;
  onTamamla: () => void;
  onDevamEt: () => void;
};

const sayi = (n: number, ondalik = 2) => n.toLocaleString("tr-TR", { maximumFractionDigits: ondalik });
const ESIK = 0.01;

/** "10 FCL" + altinda "10.000 çuval · 250 MTS" */
function Miktar({ mts, kg, renk, vurgu }: { mts: number; kg: number | null; renk?: string; vurgu?: boolean }) {
  const cuval = cuvalAdedi(mts, kg);
  const sifir = mts <= ESIK;
  return (
    <div className="whitespace-nowrap">
      <p className={`text-sm ${vurgu ? "font-bold" : "font-semibold"}`} style={{ color: sifir ? TEXT_MUTED : renk || "white" }}>
        {sifir ? "—" : `${sayi(fclAdedi(mts))} FCL`}
      </p>
      {!sifir && (
        <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
          {cuval !== null ? `${sayi(cuval, 0)} çuval · ` : ""}{sayi(mts)} MTS
        </p>
      )}
    </div>
  );
}

function KalemSatiri({ k }: { k: SiparisKalemDurumu }) {
  const yuzde = k.siparisMts > 0 ? Math.min(100, (k.sevkMts / k.siparisMts) * 100) : 0;
  const dosyadaBekleyen = Math.max(0, Math.min(k.dosyalananMts, k.siparisMts) - k.sevkMts);
  return (
    <tr className="border-t align-top" style={{ borderColor: CARD_BORDER }}>
      <td className="px-3 py-2.5">
        <span className="inline-block px-2 py-0.5 rounded-md text-xs font-bold tracking-wide text-white" style={{ backgroundColor: ROW_HEADER_BG, border: `1px solid ${CARD_BORDER}` }}>
          {k.marka}
        </span>
        <p className="text-[11px] mt-1 max-w-[260px] truncate" style={{ color: TEXT_MUTED }} title={k.urunAdi}>
          {k.urunAdi}{k.ambalajBoyutu ? ` · ${k.ambalajBoyutu}` : ""}
        </p>
        <div className="w-28 rounded-full h-1 mt-1.5" style={{ backgroundColor: CARD_BORDER }}>
          <div className="h-1 rounded-full bg-green-500" style={{ width: `${yuzde}%` }} />
        </div>
      </td>
      <td className="px-3 py-2.5"><Miktar mts={k.siparisMts} kg={k.ambalajKg} /></td>
      <td className="px-3 py-2.5"><Miktar mts={k.sevkMts} kg={k.ambalajKg} renk="#4ade80" /></td>
      <td className="px-3 py-2.5">
        <Miktar mts={k.kalanMts} kg={k.ambalajKg} renk="#fbbf24" vurgu />
        {k.kalanMts > ESIK && dosyadaBekleyen > ESIK && (
          <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{sayi(fclAdedi(dosyadaBekleyen))} FCL dosyada, sevk bekliyor</p>
        )}
        {k.fazlaMts > ESIK && (
          <p className="text-[11px] mt-0.5 text-amber-400 inline-flex items-center gap-1" title="Bu markadan siparişten fazla miktar dosyalara sayılmış. Başka bir proformaya aitse Ürün Detayları'nda o satırı 'Hiçbir siparişe sayılmasın' yapın.">
            <AlertTriangle size={11} /> +{sayi(fclAdedi(k.fazlaMts))} FCL fazla sayılmış
          </p>
        )}
      </td>
      <td className="px-3 py-2.5"><Miktar mts={k.acikMts} kg={k.ambalajKg} /></td>
    </tr>
  );
}

/**
 * Devam Eden Siparisler karti - marka/kalem bazli (07.10.2026). Her marka
 * icin Siparis / Sevk Edildi / Kalan / Dosyasi Acilmamis; FCL (25 MTS) ve
 * cuval cinsinden. Hesap: lib/siparis-takip.ts.
 */
export function SiparisTakipKarti({ siparis, ilerleme, sira, devamEdiyor, onTamamla, onDevamEt }: Props) {
  const yuzde = ilerleme.toplamSiparisMts > 0 ? Math.min(100, (ilerleme.toplamSevkMts / ilerleme.toplamSiparisMts) * 100) : 0;
  const staggerClass = sira < 8 ? `stagger-${sira + 1}` : "stagger-8";
  const th = "text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap";
  return (
    <div className={`rounded-xl border shadow-sm p-4 animate-fade-up ${staggerClass}`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white">{siparis.proforma_no}</p>
          <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{siparis.alici_firma}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onTamamla}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border whitespace-nowrap transition-colors hover:bg-white/5 hover:text-white"
            style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}
            title="Kalan miktar sevk edilmeyecekse siparişi kapatır (kayıt silinmez)"
          >
            <CheckCircle2 size={13} /> Siparişi Tamamla
          </button>
          <button
            onClick={onDevamEt}
            disabled={devamEdiyor}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: ACCENT }}
            title="Henüz hiçbir dosyada olmayan miktarla yeni sevkiyat dosyası açar"
          >
            {devamEdiyor ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
            Siparişe Devam Et
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-1 mb-2">
        <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
          Toplam <span className="text-sm font-bold text-white">{sayi(fclAdedi(ilerleme.toplamSiparisMts))} FCL</span> · {sayi(ilerleme.toplamSiparisMts)} MTS
        </p>
        <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
          Sevk edildi <span className="text-sm font-bold text-green-400">{sayi(fclAdedi(ilerleme.toplamSevkMts))} FCL</span>
        </p>
        <p className="text-[11px] text-amber-500">
          Kalan <span className="text-sm font-bold text-amber-400">{sayi(fclAdedi(ilerleme.toplamKalanMts))} FCL</span>
        </p>
      </div>
      <div className="w-full rounded-full h-1.5 mb-3" style={{ backgroundColor: CARD_BORDER }}>
        <div className="h-1.5 rounded-full bg-green-500 transition-all duration-500" style={{ width: `${yuzde}%` }} />
      </div>

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: CARD_BORDER }}>
        <table className="min-w-full">
          <thead>
            <tr style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
              <th className={th}>Marka / Ürün</th>
              <th className={th}>Sipariş</th>
              <th className={th}>Sevk Edildi</th>
              <th className={th}>Kalan</th>
              <th className={th} title="Henüz hiçbir sevkiyat dosyasına alınmamış miktar ('Siparişe Devam Et' bunu açar)">Dosyası Açılmamış</th>
            </tr>
          </thead>
          <tbody>
            {ilerleme.kalemler.map((k, i) => <KalemSatiri key={i} k={k} />)}
          </tbody>
        </table>
      </div>

      {ilerleme.eslesmeyenler.length > 0 && (
        <p className="text-[11px] mt-2 text-amber-400 inline-flex items-start gap-1">
          <AlertTriangle size={12} className="mt-px shrink-0" />
          Siparişteki hiçbir kalemle eşleşmeyen dosya kalemi: {ilerleme.eslesmeyenler.map((e) => `${e.urunAdi} (${sayi(e.mts)} MTS)`).join(", ")}. Ürün adını siparişteki gibi yazın.
        </p>
      )}
      <p className="text-[11px] mt-2" style={{ color: TEXT_MUTED }}>
        {ilerleme.dosyaSayisi} sevkiyat dosyası · 1 FCL = 25 MTS
      </p>
    </div>
  );
}
