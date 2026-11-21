"use client";
/**
 * Yukleme Plani ustu: REZERVASYON BEKLEYEN SIPARISLER (21.11.2026). On odemesi alinmis, booking'i olmayan siparisler;
 * her satirda varis limaninin son navlun teklifleri (acente, fiyat, ekipman, free time, transit) ve siparisin durumuna
 * gore tek aksiyon (Rezervasyon ekle / Sevkiyat aç / Dosya aç / Proforma yükle). Hesap: lib/siparis/plan-bekleyen.ts.
 * Hicbir kaydi kendisi degistirmez; aksiyonlar mevcut akislarin sayfalarini acar.
 */
import React, { useMemo } from "react";
import Link from "next/link";
import { Anchor, CalendarDays, FilePlus2, Hourglass, Package, Upload } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import type { PlanSatiri, SiparisSatiri } from "@/lib/siparis/liste";
import { bekleyenAksiyonu, limanNavlunlari, type BekleyenAksiyon, type BekleyenDurum, type NavlunTeklifi } from "@/lib/siparis/plan-bekleyen";
import type { KalanOdeme } from "@/lib/siparis/odeme";

const trTarih = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "—");
const gunFarki = (iso: string, bugun: string) => Math.round((Date.parse(`${bugun}T00:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)) / 86400000);
const para = (n: number, p: string) => `${n.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${p === "USD" ? "$" : p === "EUR" ? "€" : p}`;

const AKSIYON_IKONU: Record<BekleyenAksiyon["tur"], React.ReactNode> = {
  rezervasyon: <CalendarDays size={13} />, sevkiyat: <Package size={13} />, dosya_ac: <FilePlus2 size={13} />, proforma_yukle: <Upload size={13} />,
};

export function RezervasyonBekleyenPaneli({ satirlar, siparisler, kalanlar, teklifler, durumlar, bugun, yetkili }: {
  satirlar: PlanSatiri[];
  siparisler: SiparisSatiri[];
  kalanlar: Map<string, KalanOdeme>;
  /** null = okunamadi / yukleniyor (navlun sutunu "—") */
  teklifler: NavlunTeklifi[] | null;
  durumlar: Map<string, BekleyenDurum> | null;
  bugun: string;
  /** Aksiyon dugmeleri (proformalar yetkisi) */
  yetkili: boolean;
}) {
  const satirBilgisi = useMemo(() => {
    const m = new Map<string, SiparisSatiri>();
    for (const s of siparisler) if (s.durum === "on_odeme_alindi" && s.proforma_no && !m.has(s.proforma_no)) m.set(s.proforma_no, s);
    return m;
  }, [siparisler]);
  const sirali = useMemo(() => [...satirlar].sort((a, b) => {
    const ta = (a.proforma_no && satirBilgisi.get(a.proforma_no)?.on_odeme_tarihi) || "9999";
    const tb = (b.proforma_no && satirBilgisi.get(b.proforma_no)?.on_odeme_tarihi) || "9999";
    return ta.localeCompare(tb) || (a.musteri || "").localeCompare(b.musteri || "", "tr");
  }), [satirlar, satirBilgisi]);
  if (!satirlar.length) return null;
  const konteyner = satirlar.reduce((t, p) => t + (p.konteyner || 0), 0);
  return (
    <section className="rounded-xl border overflow-hidden mb-3" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="rezervasyon-bekleyen">
      <div className="px-4 py-2 text-sm font-semibold flex flex-wrap items-center gap-x-3 gap-y-0.5" style={{ backgroundColor: ROW_HEADER_BG, color: "#FFFFFF", borderLeft: "3px solid #FBBF24" }}>
        <Hourglass size={14} className="text-amber-300" /> <span>REZERVASYON BEKLEYEN — ÖN ÖDEMESİ ALINMIŞ SİPARİŞLER</span>
        <span className="text-xs font-normal" style={{ color: TEXT_MUTED }}>{satirlar.length} sipariş · {konteyner} konteyner · son navlun teklifleri (120 gün) ile</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-[12px] table-fixed">
          <colgroup>
            <col style={{ width: "19%" }} /><col style={{ width: "13%" }} /><col style={{ width: "11%" }} /><col style={{ width: "30%" }} /><col style={{ width: "11%" }} /><col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide" style={{ color: TEXT_MUTED }}>
              <th className="px-3 py-2 font-semibold">Müşteri · Proforma</th>
              <th className="px-2 py-2 font-semibold">Ürün · Kont.</th>
              <th className="px-2 py-2 font-semibold">Varış limanı</th>
              <th className="px-2 py-2 font-semibold">Son navlun teklifleri <span className="font-normal normal-case">(ucuzdan)</span></th>
              <th className="px-2 py-2 font-semibold">Free time · Transit</th>
              <th className="px-2 py-2 font-semibold text-right">Rezervasyon</th>
            </tr>
          </thead>
          <tbody>
            {sirali.map((p) => {
              const s = p.proforma_no ? satirBilgisi.get(p.proforma_no) : undefined;
              const k = s ? kalanlar.get(s.anahtar) : undefined;
              const navlun = teklifler ? limanNavlunlari(teklifler, p.varis_limani) : [];
              const en = navlun[0];
              const aksiyon = durumlar ? bekleyenAksiyonu(p.proforma_no ? durumlar.get(p.proforma_no) : undefined, p.proforma_no) : null;
              const bekleme = s?.on_odeme_tarihi ? gunFarki(s.on_odeme_tarihi, bugun) : null;
              return (
                <tr key={p.anahtar} className="border-t align-top" style={{ borderColor: CARD_BORDER }} data-testid="bekleyen-satiri" data-proforma={p.proforma_no || ""}>
                  <td className="px-3 py-2">
                    <span className="block text-white font-medium break-words">{p.musteri || "—"}</span>
                    <span className="block font-mono text-[11px] break-all" style={{ color: "#C9D1DC" }}>{p.proforma_no || "—"}</span>
                    <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>
                      {s?.on_odeme_tarihi ? <>Ön ödeme {trTarih(s.on_odeme_tarihi)}{bekleme !== null && bekleme > 0 ? <span className={bekleme >= 7 ? "text-amber-300" : ""}> · {bekleme} gündür</span> : null}</> : "Ön ödeme alındı"}
                    </span>
                    {k && k.kalan !== null && k.durum !== "odendi" ? <span className="block text-[11px] tabular-nums" style={{ color: TEXT_MUTED }}>Kalan <span className="text-amber-200">{para(k.kalan, k.para)}</span></span> : null}
                  </td>
                  <td className="px-2 py-2" style={{ color: "#C9D1DC" }}>
                    <span className="block break-words">{p.cinsi || "—"}</span>
                    <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{[p.cuval_markasi, p.konteyner ? `${p.konteyner} kont.` : null].filter(Boolean).join(" · ") || "—"}</span>
                  </td>
                  <td className="px-2 py-2 text-white break-words">
                    <span className="inline-flex items-start gap-1"><Anchor size={11} className="shrink-0 mt-0.5" style={{ color: ACCENT }} />{p.varis_limani || "—"}</span>
                  </td>
                  <td className="px-2 py-2">
                    {teklifler === null ? <span style={{ color: TEXT_MUTED }}>—</span> : navlun.length === 0 ? (
                      <span className="text-[11px]" style={{ color: TEXT_MUTED }}>Son 120 günde bu limana teklif yok</span>
                    ) : (
                      <ul className="space-y-0.5" data-navlun>
                        {navlun.map((n, i) => (
                          <li key={n.acente} className="flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
                            <span className={i === 0 ? "text-emerald-300 font-semibold" : "text-white"}>{para(n.tutar, n.para)}</span>
                            <span style={{ color: "#C9D1DC" }}>{n.acente}</span>
                            <span className="text-[11px]" style={{ color: TEXT_MUTED }}>{[n.ekipman, trTarih(n.tarih).slice(0, 5)].filter(Boolean).join(" · ")}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-2 py-2 tabular-nums" style={{ color: "#C9D1DC" }}>
                    {en ? (
                      <>
                        <span className="block">{en.freeTime !== null ? `FT ${en.freeTime} gün` : "FT —"}</span>
                        <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{en.transit ? `Transit ${en.transit} gün` : "Transit —"}</span>
                      </>
                    ) : <span style={{ color: TEXT_MUTED }}>—</span>}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {aksiyon && yetkili ? (
                      <>
                        <Link href={aksiyon.href} data-bekleyen-aksiyon={aksiyon.tur}
                          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold ${aksiyon.tur === "rezervasyon" ? "text-white hover:brightness-110" : "border text-white hover:bg-white/[0.04]"}`}
                          style={aksiyon.tur === "rezervasyon" ? { backgroundColor: ACCENT } : { borderColor: CARD_BORDER }}>
                          {AKSIYON_IKONU[aksiyon.tur]} {aksiyon.etiket}
                        </Link>
                        <span className="block mt-1 text-[10.5px] leading-snug" style={{ color: TEXT_MUTED }}>{aksiyon.aciklama}</span>
                      </>
                    ) : <span style={{ color: TEXT_MUTED }}>—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
