"use client";
/**
 * ANA PANEL TEK IS LISTESI (23.11.2026) - dosya disindaki satirlar ve ortak durum hucresi. Hesap / siralama:
 * lib/panel/is-listesi.ts. Dosya satiri app/panel/page.tsx'te (evrak, detay, sil dugmeleri eskisi gibi).
 *  - Durum renkleri: yukleme basladi (sari, en ustte), cut-off (kirmizi), acik sevkiyat (yesil), rezervasyon bekliyor (mavi), odeme bekliyor (gri, soluk).
 *  - Is emri satiri: booking'li (dosyasi acilmamis) ya da on odemesi alinmis siparis; tek aksiyon (Dosya ac / Sevkiyat ac /
 *    Rezervasyon ekle / Proforma yukle; lib/siparis/plan-bekleyen.ts).
 *  - Odeme satiri: PASIF (aksiyon yok); on odeme Siparis Listesi'nde isaretlenince kendiliginden maviye gecer.
 * Hicbir kaydi kendisi degistirmez.
 */
import React from "react";
import Link from "next/link";
import { CalendarDays, FilePlus2, Hourglass, Package, Upload, Banknote } from "lucide-react";
import { CutoffSayac } from "@/components/cutoff-sayac";
import { formatCutoffSaat, formatCutoffTarih } from "@/lib/cutoff-utils";
import { ACCENT, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { DURUM_ETIKETI, gundur, type ListeDurumu, type OdemeBekleyen } from "@/lib/panel/is-listesi";
import type { IsEmriSatiri } from "@/lib/panel/is-emirleri";
import type { BekleyenAksiyon } from "@/lib/siparis/plan-bekleyen";
import { GunlukGorev } from "@/components/panel/gunluk-yukleme-karti";
import type { IsOzeti } from "@/lib/panel/gunluk-yukleme";

export const DURUM_RENGI: Record<ListeDurumu, { renk: string; zemin: string; kenar: string }> = {
  basladi: { renk: "#FCD34D", zemin: "rgba(250,204,21,0.15)", kenar: "#EAB308" },
  cutoff: { renk: "#FCA5A5", zemin: "rgba(248,113,113,0.14)", kenar: "#F87171" },
  acik: { renk: "#6EE7B7", zemin: "rgba(16,185,129,0.13)", kenar: "#10B981" },
  rez_bekliyor: { renk: "#93C5FD", zemin: "rgba(59,130,246,0.13)", kenar: "#3B82F6" },
  odeme: { renk: "#9AA3B5", zemin: "rgba(148,163,184,0.10)", kenar: "#4A5262" },
};

/**
 * 23.11.2026 HER EKRANA UYUM (kullanici: "%100 iken yana kaydirma yapmak istemiyorum"): 10 sutun -> 6
 * (Durum | Siparis: proforma + musteri + booking / ETD | Konteyner | Cut-off: talimat + beyanname | Evraklar | Islemler).
 *  - 1500 px alti: Evraklar sutunu gizli; Konteyner hucresinde kisa "Evrak n/4" sayaci, ▾ detayda tam evrak durumu.
 *  - xl alti (< 1280 px; 240 px kenar cubuguyla tablo sigmaz): satirlar kart olur (baslik gizli; tablette 4, telefonda
 *    2 sutunlu izgara; Islemler tam satir).
 * Tum satir turleri (dosya / is emri / odeme) ayni sinif sabitlerini kullanir; sutun sayisi her satirda ayni kalir.
 */
export const LISTE_TABLO = "w-full max-xl:block";
export const LISTE_GOVDE = "max-xl:block";
export const LISTE_BASLIK = "max-xl:hidden";
export const LISTE_SATIR = "border-b hover:bg-white/[0.03] transition-colors max-xl:grid max-xl:grid-cols-2 sm:max-xl:grid-cols-4 max-xl:gap-x-3 max-xl:py-2";
export const HUCRE = "px-2.5 py-2.5 align-top max-xl:block max-xl:min-w-0 max-xl:px-3 max-xl:py-1";
/** Durum / Siparis: telefonda tam satir, tablette 1 sutun */
export const HUCRE_TAM = `${HUCRE} max-sm:col-span-2`;
/** colSpan'li bilgi hucresi (rezervasyon / odeme bekliyor): kartta 2 sutun */
export const HUCRE_GENIS = `${HUCRE} max-xl:col-span-2`;
/** Islemler: kartta tam satir, sola yasli */
export const HUCRE_ISLEM = `${HUCRE} text-right max-xl:col-span-full max-xl:text-left`;
export const HUCRE_EVRAK = "px-2.5 py-2.5 align-top hidden min-[1500px]:table-cell";
/** Evraklar sutunu gizliyken (dar ekran) gorunen kisa evrak sayaci */
export const EVRAK_SAYAC_DAR = "min-[1500px]:hidden";
export const LISTE_SUTUN_SAYISI = 6;

/**
 * Cut-off hucresinin TEK satiri: "TALIMAT  26.11 12:00  [3g 08:45]" (tamamsa yesil kisa rozet). Iki satir (talimat +
 * beyan) satir yuksekligini Siparis hucresiyle esit tutar; tam tarih ve aciklama rozetin title'inda.
 */
export function CutoffSatiri({ etiket, deger, tamamEtiketi = null, tamamHref = null, tamamAciklama }: {
  etiket: string; deger: string | null | undefined; tamamEtiketi?: string | null; tamamHref?: string | null; tamamAciklama?: string;
}) {
  const tarih = deger ? formatCutoffTarih(deger) : "-";
  const saat = deger ? formatCutoffSaat(deger) : "-";
  return (
    <div className="flex items-center gap-2 whitespace-nowrap min-h-[22px]">
      <span className="w-[46px] shrink-0 text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: "#5B6475" }}>{etiket}</span>
      {deger ? (
        <>
          <span className="w-[62px] shrink-0 text-[11px] tabular-nums text-slate-300">{tarih.slice(0, 5)}{saat !== "-" ? ` ${saat}` : ""}</span>
          <CutoffSayac deger={deger} kompakt tamamEtiketi={tamamEtiketi} tamamHref={tamamHref} tamamAciklama={tamamAciklama} />
        </>
      ) : <span className="text-[11px]" style={{ color: "#4A5262" }}>—</span>}
    </div>
  );
}

/** Satirin sol kenar cizgisi (tr style'ina eklenir). */
export const durumKenari = (d: ListeDurumu): React.CSSProperties => ({ boxShadow: `inset 3px 0 0 ${DURUM_RENGI[d].kenar}` });

const trTarih = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "—");
const AKSIYON_IKONU: Record<BekleyenAksiyon["tur"], React.ReactNode> = {
  rezervasyon: <CalendarDays size={12} />, sevkiyat: <Package size={12} />, dosya_ac: <FilePlus2 size={12} />, proforma_yukle: <Upload size={12} />,
};

export function DurumHucresi({ durum, alt }: { durum: ListeDurumu; alt?: React.ReactNode }) {
  const r = DURUM_RENGI[durum];
  return (
    <td className={`${HUCRE_TAM} whitespace-nowrap`} data-durum={durum}>
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

/** Siparis hucresi: proforma (ust) + musteri + liman; booking'liyse booking / gemi / ETD. */
function SiparisHucresi({ no, musteri, alt, booking }: { no: string | null; musteri: string | null; alt: string | null; booking?: React.ReactNode }) {
  return (
    <td className={`${HUCRE_TAM} xl:max-w-[240px]`}>
      <span className="block text-xs font-semibold font-mono truncate" style={{ color: no ? ACCENT : TEXT_MUTED }} title={no || undefined}>{no || "proforma yok"}</span>
      <p className="text-xs font-medium text-white truncate" title={musteri || undefined}>{musteri || "—"}</p>
      <p className="text-[10px] truncate" style={{ color: TEXT_MUTED }}>{alt || ""}</p>
      {booking}
    </td>
  );
}

const urunOzeti = (konteyner: number | null, ek: (string | null)[]) => [konteyner ? `${konteyner} kont.` : null, ...ek].filter(Boolean).join(" · ");

/** Dosyasi acilmamis is emri: booking'li (acik / cut-off) ya da on odemesi alinmis (rezervasyon bekliyor). */
export function IsEmriListeSatiri({ s, durum, yetkili, simdi, gorev = null }: { s: IsEmriSatiri; durum: ListeDurumu; yetkili: boolean; simdi: number; gorev?: IsOzeti | null }) {
  const bookingli = s.tur === "rezervasyonlu";
  const bekleme = gundur(s.on_odeme_tarihi, simdi);
  return (
    <tr className={LISTE_SATIR} style={{ borderColor: CARD_BORDER, ...durumKenari(durum) }}
      data-testid="liste-is-emri" data-booking={s.booking_no || ""}>
      <DurumHucresi durum={durum} alt={bookingli ? "Dosya açılmadı" : bekleme !== null ? `${bekleme} gündür` : null} />
      <SiparisHucresi no={s.proforma_no} musteri={s.musteri} alt={s.varis_limani} booking={bookingli ? (
        <p className="text-[10px] font-mono truncate mt-0.5" style={{ color: TEXT_MUTED }} title={[s.booking_no, s.gemi, s.sefer].filter(Boolean).join(" · ")}>
          {s.booking_no} · ETD {trTarih(s.etd)}
        </p>
      ) : null} />
      {bookingli ? (
        <>
          <td className={HUCRE}>
            <span className="text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.konteyner ? `${s.konteyner} kont.` : "—"}</span>
            {gorev && <GunlukGorev {...gorev} />}
          </td>
          <td className={HUCRE}>
            <div className="flex flex-col gap-1">
              <CutoffSatiri etiket="Talimat" deger={s.talimat_cutoff} />
              <CutoffSatiri etiket="Beyan" deger={s.beyan_cutoff} />
            </div>
          </td>
        </>
      ) : (
        <td className={HUCRE_GENIS} colSpan={2}>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: DURUM_RENGI.rez_bekliyor.renk }}>
            <Hourglass size={12} /> Booking bekleniyor · ön ödeme {trTarih(s.on_odeme_tarihi)}
          </span>
          <span className="block text-[10.5px] mt-0.5 truncate max-w-[420px]" style={{ color: TEXT_MUTED }}>{urunOzeti(s.konteyner, [s.cinsi, s.cuval_markasi, s.ambalaj]) || "—"}</span>
        </td>
      )}
      <td className={HUCRE_EVRAK}><span className="text-xs" style={{ color: "#4A5262" }} title="Dosya açılmadı; evrak yok">—</span></td>
      <td className={HUCRE_ISLEM}><AksiyonDugmesi a={s.aksiyon} yetkili={yetkili} /></td>
    </tr>
  );
}

/** Odeme bekleyen siparis: gri, soluk, buyuk "Odeme bekliyor" etiketi; PASIF (aksiyon yok). */
export function OdemeListeSatiri({ p, simdi, listeYetkisi }: { p: OdemeBekleyen; simdi: number; listeYetkisi: boolean }) {
  const gun = gundur(p.proforma_tarihi, simdi);
  return (
    <tr className={LISTE_SATIR} style={{ borderColor: CARD_BORDER, ...durumKenari("odeme"), opacity: 0.62 }} data-testid="liste-odeme">
      <DurumHucresi durum="odeme" alt={gun !== null ? `${gun} gündür` : null} />
      <SiparisHucresi no={p.proforma_no} musteri={p.musteri} alt={p.varis_limani} />
      <td className={HUCRE_GENIS} colSpan={2}>
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold uppercase tracking-wider"
          style={{ backgroundColor: DURUM_RENGI.odeme.zemin, color: DURUM_RENGI.odeme.renk, border: `1px dashed ${DURUM_RENGI.odeme.kenar}` }}>
          <Banknote size={15} /> Ödeme bekliyor
        </span>
        <span className="block text-[10.5px] mt-1 truncate max-w-[420px]" style={{ color: TEXT_MUTED }}>
          Proforma {trTarih(p.proforma_tarihi)} · {urunOzeti(p.konteyner, [p.urun, p.marka, p.paketleme]) || "—"}
        </span>
      </td>
      <td className={HUCRE_EVRAK} />
      <td className={HUCRE_ISLEM}>
        {listeYetkisi ? (
          <Link href="/siparisler?sekme=onay" title="Ön ödeme / imzalı proforma Sipariş Listesi'nde işaretlenir" className="text-[11px] hover:underline whitespace-nowrap" style={{ color: TEXT_MUTED }}>
            Sipariş Listesi
          </Link>
        ) : <span className="text-xs" style={{ color: TEXT_MUTED }}>—</span>}
      </td>
    </tr>
  );
}
