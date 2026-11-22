"use client";
/**
 * PAZAR - MUSTERI SIPARIS RITMI gorunumu (23.11.2026). Hesap: lib/pazar/siparis-ritmi.ts (dalga, ortanca aralik, tedarik,
 * beklenen siparis, yolda / yuklemede). Hicbir kaydi degistirmez.
 */
import React from "react";
import { AlertTriangle, Ship } from "lucide-react";
import { CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { RITIM_ETIKETI, type MusteriRitmi, type RitimDurumu, type SevkiyatVerisi } from "@/lib/pazar/siparis-ritmi";

const tarih = (t: string | null) => (t ? `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}` : "—");
const kisaTarih = (t: string | null) => (t ? `${t.slice(8, 10)}.${t.slice(5, 7)}` : "—");

const RENK: Record<RitimDurumu, { bg: string; c: string }> = {
  gecikti: { bg: "rgba(248,113,113,0.14)", c: "#FCA5A5" },
  zamani_geldi: { bg: "rgba(251,191,36,0.16)", c: "#FCD34D" },
  yaklasiyor: { bg: "rgba(96,165,250,0.14)", c: "#93C5FD" },
  erken: { bg: "rgba(148,163,184,0.12)", c: "#C9D1DC" },
  veri_az: { bg: "rgba(148,163,184,0.08)", c: "#9AA3B5" },
};

/** Siparissiz musteri icin durum rozeti ("Sipariş gecikti · 24 gün"). */
export function RitimRozeti({ r }: { r: MusteriRitmi }) {
  const k = RENK[r.durum];
  // Ritmin iki katindan (en az 60 gun) fazla gecikme: musteri kaybi riski - "uzun süredir"
  const uzun = r.durum === "gecikti" && r.fark !== null && r.ritimGun !== null && r.fark > Math.max(60, 2 * r.ritimGun);
  const ek = r.durum === "gecikti" && r.fark !== null ? ` · ${r.fark} gün${uzun ? " (uzun süredir)" : ""}`
    : r.durum === "zamani_geldi" ? ""
    : r.durum === "yaklasiyor" && r.beklenenSiparis ? ` · ~${kisaTarih(r.beklenenSiparis)}` : "";
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ backgroundColor: k.bg, color: k.c }} data-ritim={r.durum}>
      {RITIM_ETIKETI[r.durum]}{ek}
    </span>
  );
}

/** Liste hucresi: ritim ("~20 günde bir · ort. 5 kont.") + beklenen siparis / sonraki ETD ya da son sevkiyat. */
export function RitimHucresi({ r }: { r: MusteriRitmi | undefined }) {
  if (!r || r.dalgalar.length === 0) return <span style={{ color: TEXT_MUTED }}>Sevkiyat kaydı yok</span>;
  if (r.ritimGun === null) {
    return (
      <div style={{ color: "#C9D1DC" }}>
        <p>{r.dalgalar.length} sevkiyat · ritim için az</p>
        <p className="text-[10.5px]" style={{ color: TEXT_MUTED }}>Son sevkiyat {tarih(r.sonEtd)}</p>
      </div>
    );
  }
  return (
    <div style={{ color: "#C9D1DC" }} title={`${r.dalgalar.length} sevkiyat dalgası · aralık ${r.aralikMin}–${r.aralikMax} gün · sipariş → sevkiyat ~${r.tedarikGun} gün (${r.tedarikKaynak === "musteri" ? "müşterinin kendi" : "genel"})`}>
      <p><span className="text-white font-medium">~{r.ritimGun} günde bir</span>{r.ortKonteyner ? ` · ort. ${r.ortKonteyner.toLocaleString("tr-TR")} kont.` : ""}</p>
      <p className="text-[10.5px]" style={{ color: TEXT_MUTED }}>Beklenen sipariş ~{tarih(r.beklenenSiparis)} · sevkiyat ~{kisaTarih(r.beklenenEtd)}</p>
    </div>
  );
}

/** Aktif musteride yolda / yuklemede satirlari (Siparis hucresine eklenir). */
export function YoldaSatirlari({ r }: { r: MusteriRitmi | undefined }) {
  if (!r || (r.yolda.length === 0 && r.yuklemede.length === 0)) return null;
  const yk = r.yolda.reduce((t, y) => t + y.konteyner, 0);
  const yuk = r.yuklemede.reduce((t, y) => t + y.konteyner, 0);
  const enYakin = r.yolda.map((y) => y.varisTahmini).filter((x): x is string => !!x).sort()[0] || null;
  const ilkEtd = r.yuklemede.map((y) => y.etd).sort()[0] || null;
  return (
    <>
      {r.yolda.length > 0 && <p data-yolda><Ship size={11} className="inline -mt-0.5 mr-1" style={{ color: "#93C5FD" }} />Yolda {yk} kont. · varış ~{kisaTarih(enYakin)}</p>}
      {r.yuklemede.length > 0 && <p data-yuklemede>Planda {yuk} kont. · ETD {kisaTarih(ilkEtd)}</p>}
    </>
  );
}

/** Firma karti bolumu: ritim, beklenen siparis, son dalgalar. */
export function RitimBolumu({ r }: { r: MusteriRitmi | undefined }) {
  if (!r || r.dalgalar.length === 0) return <p className="text-sm" style={{ color: TEXT_MUTED }}>Yükleme planında sevkiyat kaydı yok.</p>;
  const son = r.dalgalar.slice(-8).reverse();
  return (
    <div className="space-y-2 text-sm" data-testid="kart-ritim">
      <div className="flex flex-wrap items-center gap-2">
        {r.ritimGun !== null ? <span className="text-white font-medium">~{r.ritimGun} günde bir sipariş</span> : <span style={{ color: "#C9D1DC" }}>Ritim için en az 3 sevkiyat gerekiyor</span>}
        <RitimRozeti r={r} />
      </div>
      {r.ritimGun !== null && (
        <p className="text-xs" style={{ color: "#C9D1DC" }}>
          Beklenen sipariş <b className="text-white">~{tarih(r.beklenenSiparis)}</b> · beklenen sevkiyat ~{tarih(r.beklenenEtd)} · sipariş → sevkiyat ~{r.tedarikGun} gün
          {r.tedarikKaynak === "genel" ? " (genel ortanca)" : ""} · aralık {r.aralikMin}–{r.aralikMax} gün
        </p>
      )}
      <ul className="rounded-lg border divide-y text-xs" style={{ borderColor: CARD_BORDER }}>
        {son.map((d) => (
          <li key={d.bas} className="flex justify-between px-3 py-1.5" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }}>
            <span>{d.bas === d.son ? tarih(d.bas) : `${tarih(d.bas)} – ${kisaTarih(d.son)}`}</span>
            <span>{d.konteyner} kont.{d.booking > 1 ? ` · ${d.booking} booking` : ""}</span>
          </li>
        ))}
      </ul>
      {r.dalgalar.length > son.length && <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Toplam {r.dalgalar.length} sevkiyat dalgası (son 8 gösteriliyor).</p>}
    </div>
  );
}

/** Yukleme Plani'nda olup Pazar'da musteri karti olmayan firmalar (ritim hesaplanamiyor). */
export function EslesmeyenSerit({ e }: { e: SevkiyatVerisi["eslesmeyen"] }) {
  if (!e.length) return null;
  return (
    <div className="flex items-start gap-2 px-3 py-2 border-b text-xs" style={{ borderColor: CARD_BORDER, color: "#FCD34D", backgroundColor: "rgba(251,191,36,0.06)" }} data-testid="eslesmeyen-plan">
      <AlertTriangle size={13} className="shrink-0 mt-0.5" />
      <span>
        Yükleme planında olup Pazar&apos;da müşteri kartı olmayan {e.length} firma (ritimleri hesaplanamıyor; kart açın ya da mevcut kartla birleştirin):{" "}
        <span style={{ color: "#C9D1DC" }}>{e.map((x) => `${x.ad} (${x.sevkiyat} sevkiyat · son ${kisaTarih(x.son_etd)})`).join(", ")}</span>
      </span>
    </div>
  );
}
