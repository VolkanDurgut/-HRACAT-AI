"use client";
/**
 * Ana Panel > IS EMIRLERI (22.11.2026): dosyasi henuz acilmamis siparisler, dosya tablosunun ustunde iki serit.
 *  - Rezervasyonlu: Yukleme Plani'nda booking'i var, dosyasi yok. Booking, gemi / sefer, acente, liman, ETD ve talimat /
 *    beyan cut-off sayaclari (en yakin cut-off ustte). Cut-off'u 2 gun icinde olan varsa serit kirmizi kenarli.
 *  - On odemesi alinmis: rezervasyon bekliyor (en eski on odeme ustte, kac gundur bekledigi).
 * Her satirda tek aksiyon (lib/panel/is-emirleri.ts; Yukleme Plani paneliyle ayni kural). Acik / kapali tercihi
 * tarayicida. Hicbir kaydi kendisi degistirmez.
 */
import React from "react";
import Link from "next/link";
import { CalendarDays, FilePlus2, Hourglass, Package, Ship, Upload } from "lucide-react";
import { AcilirSerit, SERIT_TONU, useAcikTercihi } from "@/components/erp/acilir-serit";
import { CutoffSayac } from "@/components/cutoff-sayac";
import { ACCENT, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import { gunKaldi, isEmriAciliyeti, type IsEmriSatiri } from "@/lib/panel/is-emirleri";
import type { BekleyenAksiyon } from "@/lib/siparis/plan-bekleyen";

const trTarih = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "—");
const MAVI = { renk: "#93C5FD", zemin: "rgba(59,130,246,0.06)", kenar: "rgba(59,130,246,0.3)" };
const AKSIYON_IKONU: Record<BekleyenAksiyon["tur"], React.ReactNode> = {
  rezervasyon: <CalendarDays size={13} />, sevkiyat: <Package size={13} />, dosya_ac: <FilePlus2 size={13} />, proforma_yukle: <Upload size={13} />,
};

function Th({ children, sag = false }: { children: React.ReactNode; sag?: boolean }) {
  return <th className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${sag ? "text-right" : "text-left"}`} style={{ color: TEXT_MUTED }}>{children}</th>;
}

function AksiyonDugmesi({ a, yetkili }: { a: BekleyenAksiyon; yetkili: boolean }) {
  if (!yetkili) return <span style={{ color: TEXT_MUTED }}>—</span>;
  const birincil = a.tur === "rezervasyon" || a.tur === "dosya_ac";
  return (
    <div className="inline-flex flex-col items-end">
      <Link href={a.href} data-is-emri-aksiyon={a.tur}
        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap ${birincil ? "text-white hover:brightness-110" : "border text-white hover:bg-white/[0.04]"}`}
        style={birincil ? { backgroundColor: ACCENT } : { borderColor: CARD_BORDER }}>
        {AKSIYON_IKONU[a.tur]} {a.etiket}
      </Link>
      <span className="mt-1 text-[10.5px] leading-snug text-right max-w-[220px]" style={{ color: TEXT_MUTED }}>{a.aciklama}</span>
    </div>
  );
}

function MusteriHucresi({ s }: { s: IsEmriSatiri }) {
  return (
    <td className="px-3 py-2 align-top">
      <span className="block text-[13px] text-white font-medium break-words">{s.musteri || "—"}</span>
      <span className="block font-mono text-[11px] break-all" style={{ color: "#C9D1DC" }}>{s.proforma_no || "proforma yok"}</span>
    </td>
  );
}

function UrunHucresi({ s }: { s: IsEmriSatiri }) {
  return (
    <td className="px-3 py-2 align-top text-[12px]" style={{ color: "#C9D1DC" }}>
      <span className="block break-words">{s.cinsi || "—"}</span>
      <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{[s.konteyner ? `${s.konteyner} kont.` : null, s.cuval_markasi, s.ambalaj].filter(Boolean).join(" · ") || "—"}</span>
    </td>
  );
}

export function IsEmirleri({ rezervasyonlu, onOdeme, yetkili, simdi = Date.now() }: {
  rezervasyonlu: IsEmriSatiri[]; onOdeme: IsEmriSatiri[];
  /** Aksiyon dugmeleri (proformalar yetkisi) */
  yetkili: boolean;
  simdi?: number;
}) {
  const [rezAcik, setRezAcik] = useAcikTercihi("panel-is-emri-rezervasyonlu");
  const [ooAcik, setOoAcik] = useAcikTercihi("panel-is-emri-on-odeme");
  if (!rezervasyonlu.length && !onOdeme.length) return null;
  const acil = rezervasyonlu.filter((s) => isEmriAciliyeti(s, simdi) !== "normal").length;
  const rezGorunur = rezAcik ?? true;
  const ooGorunur = ooAcik ?? true;
  const rezKont = rezervasyonlu.reduce((t, s) => t + (s.konteyner || 0), 0);
  const ooKont = onOdeme.reduce((t, s) => t + (s.konteyner || 0), 0);
  const rozet = (metin: string, renk: string) => <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: renk }}>{metin}</span>;
  return (
    <div className="space-y-3 mb-4" data-testid="is-emirleri">
      {rezervasyonlu.length > 0 && (
        <AcilirSerit testId="is-emri-rezervasyonlu" acik={rezGorunur} onDegistir={() => setRezAcik(!rezGorunur)}
          ikon={<Ship size={14} />} baslik="Rezervasyonu alınmış · dosyası açılmamış"
          rozetler={<>{rozet(`${rezervasyonlu.length} booking · ${rezKont} kont.`, "#C9D1DC")}{acil > 0 && rozet(`${acil} cut-off yakın`, "#FCA5A5")}</>}
          {...(acil > 0 ? SERIT_TONU.kirmizi : SERIT_TONU.amber)}>
          <div className="overflow-x-auto border-t" style={{ borderColor: CARD_BORDER }}>
            <table className="w-full min-w-[1060px] text-[12px]">
              <thead><tr style={{ backgroundColor: ROW_HEADER_BG }}>
                <Th>Müşteri · Proforma</Th><Th>Booking · Gemi</Th><Th>Acente · Liman</Th><Th>Ürün</Th><Th>Varış</Th><Th>ETD</Th><Th>Talimat C/O</Th><Th>Beyanname C/O</Th><Th sag>İş emri</Th>
              </tr></thead>
              <tbody>
                {rezervasyonlu.map((s) => {
                  const ac = isEmriAciliyeti(s, simdi);
                  return (
                    <tr key={s.anahtar} className="border-t" style={{ borderColor: CARD_BORDER, backgroundColor: ac === "gecti" ? "rgba(248,113,113,0.05)" : ac === "yakin" ? "rgba(245,158,11,0.04)" : undefined }}
                      data-testid="is-emri-satiri" data-booking={s.booking_no || ""}>
                      <MusteriHucresi s={s} />
                      <td className="px-3 py-2 align-top">
                        <span className="block font-mono text-[12px] text-white">{s.booking_no}</span>
                        <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{[s.gemi, s.sefer].filter(Boolean).join(" / ") || "—"}</span>
                      </td>
                      <td className="px-3 py-2 align-top" style={{ color: "#C9D1DC" }}>
                        <span className="block">{s.acente || "—"}</span>
                        <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{[s.liman, s.ekipman].filter(Boolean).join(" · ") || "—"}</span>
                      </td>
                      <UrunHucresi s={s} />
                      <td className="px-3 py-2 align-top text-white">{s.varis_limani || "—"}</td>
                      <td className="px-3 py-2 align-top whitespace-nowrap tabular-nums text-white">{trTarih(s.etd)}</td>
                      <td className="px-3 py-2 align-top">{s.talimat_cutoff ? <CutoffSayac deger={s.talimat_cutoff} /> : <span style={{ color: TEXT_MUTED }}>—</span>}</td>
                      <td className="px-3 py-2 align-top">{s.beyan_cutoff ? <CutoffSayac deger={s.beyan_cutoff} /> : <span style={{ color: TEXT_MUTED }}>—</span>}</td>
                      <td className="px-3 py-2 align-top text-right"><AksiyonDugmesi a={s.aksiyon} yetkili={yetkili} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AcilirSerit>
      )}
      {onOdeme.length > 0 && (
        <AcilirSerit testId="is-emri-on-odeme" acik={ooGorunur} onDegistir={() => setOoAcik(!ooGorunur)}
          ikon={<Hourglass size={14} />} baslik="Ön ödemesi alınmış · rezervasyon bekliyor"
          rozetler={rozet(`${onOdeme.length} sipariş · ${ooKont} kont.`, "#C9D1DC")} {...MAVI}>
          <div className="overflow-x-auto border-t" style={{ borderColor: CARD_BORDER }}>
            <table className="w-full min-w-[860px] text-[12px]">
              <thead><tr style={{ backgroundColor: ROW_HEADER_BG }}>
                <Th>Müşteri · Proforma</Th><Th>Ön ödeme</Th><Th>Ürün</Th><Th>Varış</Th><Th sag>İş emri</Th>
              </tr></thead>
              <tbody>
                {onOdeme.map((s) => {
                  const g = gunKaldi(s.on_odeme_tarihi, simdi);
                  const bekleme = g === null ? null : -g;
                  return (
                    <tr key={s.anahtar} className="border-t" style={{ borderColor: CARD_BORDER }} data-testid="is-emri-satiri" data-proforma={s.proforma_no || ""}>
                      <MusteriHucresi s={s} />
                      <td className="px-3 py-2 align-top whitespace-nowrap tabular-nums">
                        <span className="block text-white">{s.on_odeme_tarihi ? trTarih(s.on_odeme_tarihi) : "Alındı"}</span>
                        {bekleme !== null && bekleme > 0 ? <span className={`block text-[11px] ${bekleme >= 7 ? "text-amber-300" : ""}`} style={bekleme >= 7 ? undefined : { color: TEXT_MUTED }}>{bekleme} gündür bekliyor</span> : null}
                      </td>
                      <UrunHucresi s={s} />
                      <td className="px-3 py-2 align-top text-white">{s.varis_limani || "—"}</td>
                      <td className="px-3 py-2 align-top text-right"><AksiyonDugmesi a={s.aksiyon} yetkili={yetkili} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AcilirSerit>
      )}
    </div>
  );
}
