"use client";
/**
 * ANA PANEL TEK IS LISTESI (23.11.2026) - dosya disindaki satirlar ve ortak durum hucresi. Hesap / siralama:
 * lib/panel/is-listesi.ts. Dosya satiri app/panel/page.tsx'te (evrak, detay, sil dugmeleri eskisi gibi).
 *  - Durum renkleri: cut-off (kirmizi), acik sevkiyat (yesil), rezervasyon bekliyor (mavi), odeme bekliyor (gri, soluk).
 *  - Is emri satiri: booking'li (dosyasi acilmamis) ya da on odemesi alinmis siparis; tek aksiyon (Dosya ac / Sevkiyat ac /
 *    Rezervasyon ekle / Proforma yukle; lib/siparis/plan-bekleyen.ts).
 *  - Odeme satiri: PASIF (aksiyon yok); on odeme Siparis Listesi'nde isaretlenince kendiliginden maviye gecer.
 * Hicbir kaydi kendisi degistirmez.
 */
import React from "react";
import Link from "next/link";
import { CalendarDays, FilePlus2, Hourglass, Package, Upload, Banknote } from "lucide-react";
import { CutoffSayac } from "@/components/cutoff-sayac";
import { ACCENT, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { DURUM_ETIKETI, gundur, type ListeDurumu, type OdemeBekleyen } from "@/lib/panel/is-listesi";
import type { IsEmriSatiri } from "@/lib/panel/is-emirleri";
import type { BekleyenAksiyon } from "@/lib/siparis/plan-bekleyen";
import { GunlukGorev } from "@/components/panel/gunluk-yukleme-karti";
import type { IsOzeti } from "@/lib/panel/gunluk-yukleme";

export const DURUM_RENGI: Record<ListeDurumu, { renk: string; zemin: string; kenar: string }> = {
  cutoff: { renk: "#FCA5A5", zemin: "rgba(248,113,113,0.14)", kenar: "#F87171" },
  acik: { renk: "#6EE7B7", zemin: "rgba(16,185,129,0.13)", kenar: "#10B981" },
  rez_bekliyor: { renk: "#93C5FD", zemin: "rgba(59,130,246,0.13)", kenar: "#3B82F6" },
  odeme: { renk: "#9AA3B5", zemin: "rgba(148,163,184,0.10)", kenar: "#4A5262" },
};

/** Satirin sol kenar cizgisi (tr style'ina eklenir). */
export const durumKenari = (d: ListeDurumu): React.CSSProperties => ({ boxShadow: `inset 3px 0 0 ${DURUM_RENGI[d].kenar}` });

const trTarih = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "—");
const AKSIYON_IKONU: Record<BekleyenAksiyon["tur"], React.ReactNode> = {
  rezervasyon: <CalendarDays size={12} />, sevkiyat: <Package size={12} />, dosya_ac: <FilePlus2 size={12} />, proforma_yukle: <Upload size={12} />,
};

export function DurumHucresi({ durum, alt }: { durum: ListeDurumu; alt?: React.ReactNode }) {
  const r = DURUM_RENGI[durum];
  return (
    <td className="px-3 py-3 align-top whitespace-nowrap" data-durum={durum}>
      <span className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold uppercase tracking-wide" style={{ backgroundColor: r.zemin, color: r.renk }}>
        {DURUM_ETIKETI[durum]}
      </span>
      {alt && <span className="block mt-1 text-[10.5px]" style={{ color: TEXT_MUTED }}>{alt}</span>}
    </td>
  );
}

function AksiyonDugmesi({ a, yetkili }: { a: BekleyenAksiyon; yetkili: boolean }) {
  if (!yetkili) return <span className="text-xs" style={{ color: TEXT_MUTED }}>—</span>;
  const birincil = a.tur === "dosya_ac" || a.tur === "rezervasyon";
  return (
    <Link href={a.href} data-is-emri-aksiyon={a.tur} title={a.aciklama}
      className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap ${birincil ? "text-white hover:opacity-90" : "border text-white hover:bg-white/[0.04]"}`}
      style={birincil ? { backgroundColor: ACCENT } : { borderColor: CARD_BORDER }}>
      {AKSIYON_IKONU[a.tur]} {a.etiket}
    </Link>
  );
}

function ProformaHucresi({ no }: { no: string | null }) {
  return (
    <td className="px-3 py-3 align-top">
      <span className="text-xs font-semibold whitespace-nowrap font-mono" style={{ color: no ? ACCENT : TEXT_MUTED }}>{no || "proforma yok"}</span>
    </td>
  );
}

function MusteriHucresi({ musteri, alt }: { musteri: string | null; alt: string | null }) {
  return (
    <td className="px-3 py-3 align-top max-w-[220px]">
      <p className="text-xs font-medium text-white truncate" title={musteri || undefined}>{musteri || "—"}</p>
      <p className="text-[10px] truncate" style={{ color: TEXT_MUTED }}>{alt || ""}</p>
    </td>
  );
}

const urunOzeti = (konteyner: number | null, ek: (string | null)[]) => [konteyner ? `${konteyner} kont.` : null, ...ek].filter(Boolean).join(" · ");

/** Dosyasi acilmamis is emri: booking'li (acik / cut-off) ya da on odemesi alinmis (rezervasyon bekliyor). */
export function IsEmriListeSatiri({ s, durum, yetkili, simdi, gorev = null }: { s: IsEmriSatiri; durum: ListeDurumu; yetkili: boolean; simdi: number; gorev?: IsOzeti | null }) {
  const bookingli = s.tur === "rezervasyonlu";
  const bekleme = gundur(s.on_odeme_tarihi, simdi);
  return (
    <tr className="border-b hover:bg-white/[0.03] transition-colors" style={{ borderColor: CARD_BORDER, ...durumKenari(durum) }}
      data-testid="liste-is-emri" data-booking={s.booking_no || ""}>
      <DurumHucresi durum={durum} alt={bookingli ? "Dosya açılmadı" : bekleme !== null ? `${bekleme} gündür` : null} />
      <ProformaHucresi no={s.proforma_no} />
      <MusteriHucresi musteri={s.musteri} alt={s.varis_limani} />
      {bookingli ? (
        <>
          <td className="px-3 py-3 align-top">
            <span className="block text-xs font-mono whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.booking_no}</span>
            <span className="block text-[10px] whitespace-nowrap" style={{ color: TEXT_MUTED }}>{[s.gemi, s.sefer].filter(Boolean).join(" / ")}</span>
          </td>
          <td className="px-3 py-3 align-top"><span className="text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{trTarih(s.etd)}</span></td>
          <td className="px-3 py-3 align-top">
            <span className="text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.konteyner ? `${s.konteyner} kont.` : "—"}</span>
            {gorev && <GunlukGorev {...gorev} />}
          </td>
          <td className="px-3 py-3 align-top">{s.talimat_cutoff ? <CutoffSayac deger={s.talimat_cutoff} /> : <span className="text-xs" style={{ color: "#4A5262" }}>—</span>}</td>
          <td className="px-3 py-3 align-top">{s.beyan_cutoff ? <CutoffSayac deger={s.beyan_cutoff} /> : <span className="text-xs" style={{ color: "#4A5262" }}>—</span>}</td>
        </>
      ) : (
        <td className="px-3 py-3 align-top" colSpan={5}>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: DURUM_RENGI.rez_bekliyor.renk }}>
            <Hourglass size={12} /> Booking bekleniyor · ön ödeme {trTarih(s.on_odeme_tarihi)}
          </span>
          <span className="block text-[10.5px] mt-0.5 truncate max-w-[520px]" style={{ color: TEXT_MUTED }}>{urunOzeti(s.konteyner, [s.cinsi, s.cuval_markasi, s.ambalaj]) || "—"}</span>
        </td>
      )}
      <td className="px-3 py-3 align-top"><span className="text-[10.5px] whitespace-nowrap" style={{ color: "#4A5262" }}>Dosya yok</span></td>
      <td className="px-3 py-3 align-top text-right"><AksiyonDugmesi a={s.aksiyon} yetkili={yetkili} /></td>
    </tr>
  );
}

/** Odeme bekleyen siparis: gri, soluk, buyuk "Odeme bekliyor" etiketi; PASIF (aksiyon yok). */
export function OdemeListeSatiri({ p, simdi, listeYetkisi }: { p: OdemeBekleyen; simdi: number; listeYetkisi: boolean }) {
  const gun = gundur(p.proforma_tarihi, simdi);
  return (
    <tr className="border-b" style={{ borderColor: CARD_BORDER, ...durumKenari("odeme"), opacity: 0.62 }} data-testid="liste-odeme">
      <DurumHucresi durum="odeme" alt={gun !== null ? `${gun} gündür` : null} />
      <ProformaHucresi no={p.proforma_no} />
      <MusteriHucresi musteri={p.musteri} alt={p.varis_limani} />
      <td className="px-3 py-3 align-top" colSpan={6}>
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold uppercase tracking-wider"
          style={{ backgroundColor: DURUM_RENGI.odeme.zemin, color: DURUM_RENGI.odeme.renk, border: `1px dashed ${DURUM_RENGI.odeme.kenar}` }}>
          <Banknote size={15} /> Ödeme bekliyor
        </span>
        <span className="block text-[10.5px] mt-1 truncate max-w-[560px]" style={{ color: TEXT_MUTED }}>
          Proforma {trTarih(p.proforma_tarihi)} · {urunOzeti(p.konteyner, [p.urun, p.marka, p.paketleme]) || "—"}
        </span>
      </td>
      <td className="px-3 py-3 align-top text-right">
        {listeYetkisi ? (
          <Link href="/siparisler?sekme=onay" title="Ön ödeme / imzalı proforma Sipariş Listesi'nde işaretlenir" className="text-[11px] hover:underline whitespace-nowrap" style={{ color: TEXT_MUTED }}>
            Sipariş Listesi
          </Link>
        ) : <span className="text-xs" style={{ color: TEXT_MUTED }}>—</span>}
      </td>
    </tr>
  );
}
