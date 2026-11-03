"use client";
import React from "react";
import { ArrowRight, CheckCircle2, ChevronDown, Loader2, AlertTriangle, Package } from "lucide-react";
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

type SiparisSatiri = { id: string; proforma_no: string; alici_firma: string | null; urun_tanimi: string | null; ilerleme: SiparisIlerlemesi };

/** Marka bazli ayrinti tablosu (satir acilinca). */
function KalemTablosu({ ilerleme }: { ilerleme: SiparisIlerlemesi }) {
  const th = "text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap";
  return (
    <div className="space-y-2">
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
        <p className="text-[11px] text-amber-400 inline-flex items-start gap-1">
          <AlertTriangle size={12} className="mt-px shrink-0" />
          Siparişteki hiçbir kalemle eşleşmeyen dosya kalemi: {ilerleme.eslesmeyenler.map((e) => `${e.urunAdi} (${sayi(e.mts)} MTS)`).join(", ")}. Ürün adını siparişteki gibi yazın.
        </p>
      )}
      <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{ilerleme.dosyaSayisi} sevkiyat dosyası · 1 FCL = 25 MTS</p>
    </div>
  );
}

const KOLONLAR = "md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_92px_92px_auto] md:items-center md:gap-4";

/**
 * Devam Eden Siparisler (07.10.2026 marka/kalem bazli; 03.11.2026 KOMPAKT LISTE).
 * Kullanici (03.11.2026): "siparisi kalan musterilerin gorundugu alan cok yer kapliyor".
 * Her siparis TEK SATIR: proforma + musteri · markalar + ilerleme · Kalan FCL · Dosyasi
 * acilmamis FCL · islemler. Marka bazli tablo (eskiden her kartta acikti) satira
 * tiklayinca acilir. Bolumun tamami daraltilabilir. Hesap DEGISMEDI (lib/siparis-takip.ts).
 */
export function SiparisTakipListesi({ siparisler, devamEdiyorId, onTamamla, onDevamEt }: {
  siparisler: SiparisSatiri[]; devamEdiyorId: string | null;
  onTamamla: (s: SiparisSatiri) => void; onDevamEt: (s: SiparisSatiri) => void;
}) {
  const [acik, setAcik] = React.useState<string | null>(null);
  const [daralt, setDaralt] = React.useState(false);
  const toplamKalan = siparisler.reduce((t, s) => t + s.ilerleme.toplamKalanMts, 0);
  const toplamAcilmamis = siparisler.reduce((t, s) => t + s.ilerleme.kalemler.reduce((x, k) => x + k.acikMts, 0), 0);
  return (
    <section className="rounded-xl border shadow-sm animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="siparis-listesi">
      <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b" style={{ borderColor: CARD_BORDER }}>
        <Package size={16} style={{ color: ACCENT }} />
        <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Devam Eden Siparişler</h2>
        <span className="text-xs" style={{ color: TEXT_MUTED }} data-testid="siparis-ozet">
          <b className="text-white">{siparisler.length}</b> sipariş · kalan <b className="text-amber-400">{sayi(fclAdedi(toplamKalan))} FCL</b>
          {toplamAcilmamis > ESIK && <> · dosyası açılmamış <b className="text-white">{sayi(fclAdedi(toplamAcilmamis))} FCL</b></>}
        </span>
        <button onClick={() => setDaralt((d) => !d)} aria-expanded={!daralt} data-testid="siparis-daralt"
          className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
          {daralt ? "Göster" : "Gizle"} <ChevronDown size={13} className={`transition-transform ${daralt ? "" : "rotate-180"}`} />
        </button>
      </div>
      {!daralt && (
        <>
          <div className={`hidden ${KOLONLAR} px-4 py-2 text-[10px] font-semibold uppercase tracking-wide border-b`} style={{ color: TEXT_MUTED, backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
            <span>Proforma / Müşteri</span><span>Markalar · Sevk</span><span className="text-right">Kalan</span>
            <span className="text-right" title="Henüz hiçbir sevkiyat dosyasına alınmamış miktar">Dosyası açılmamış</span><span className="text-right">İşlem</span>
          </div>
          <ul>
            {siparisler.map((s) => {
              const il = s.ilerleme;
              const yuzde = il.toplamSiparisMts > 0 ? Math.min(100, (il.toplamSevkMts / il.toplamSiparisMts) * 100) : 0;
              const acilmamis = il.kalemler.reduce((x, k) => x + k.acikMts, 0);
              const uyari = il.eslesmeyenler.length > 0 || il.kalemler.some((k) => k.fazlaMts > ESIK);
              const acikMi = acik === s.id;
              const markalar = Array.from(new Set(il.kalemler.map((k) => k.marka).filter(Boolean)));
              return (
                <li key={s.id} className="border-b last:border-0" style={{ borderColor: CARD_BORDER }} data-testid="siparis-satiri">
                  <div className={`px-4 py-2.5 ${KOLONLAR} flex flex-col gap-2 cursor-pointer hover:bg-white/[0.03]`}
                    onClick={() => setAcik(acikMi ? null : s.id)}>
                    <div className="min-w-0 flex items-start gap-2">
                      <ChevronDown size={14} className={`mt-0.5 shrink-0 transition-transform ${acikMi ? "" : "-rotate-90"}`} style={{ color: TEXT_MUTED }} aria-hidden />
                      <div className="min-w-0">
                        <button type="button" aria-expanded={acikMi} className="text-sm font-bold text-white text-left break-all" onClick={(e) => { e.stopPropagation(); setAcik(acikMi ? null : s.id); }}>
                          {s.proforma_no}
                        </button>
                        <p className="text-xs truncate" style={{ color: TEXT_MUTED }} title={s.alici_firma || ""}>{s.alici_firma || "—"}</p>
                      </div>
                    </div>
                    <div className="min-w-0 pl-6 md:pl-0">
                      <p className="text-[11px] truncate flex items-center gap-1" style={{ color: TEXT_MUTED }} title={markalar.join(" · ")}>
                        {uyari && <AlertTriangle size={11} className="text-amber-400 shrink-0" aria-label="Uyarı var" />}
                        <span className="truncate">{markalar.join(" · ") || "—"}</span>
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 rounded-full h-1.5" style={{ backgroundColor: CARD_BORDER }}>
                          <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${yuzde}%` }} />
                        </div>
                        <span className="text-[11px] whitespace-nowrap tabular-nums" style={{ color: TEXT_MUTED }}>
                          <b className="text-green-400">{sayi(fclAdedi(il.toplamSevkMts))}</b> / {sayi(fclAdedi(il.toplamSiparisMts))} FCL
                        </span>
                      </div>
                    </div>
                    <div className="pl-6 md:pl-0 flex md:block items-baseline justify-between gap-2 md:text-right">
                      <span className="md:hidden text-[10px] uppercase tracking-wide" style={{ color: TEXT_MUTED }}>Kalan</span>
                      <span className="text-sm font-bold text-amber-400 whitespace-nowrap tabular-nums">{il.toplamKalanMts > ESIK ? `${sayi(fclAdedi(il.toplamKalanMts))} FCL` : "—"}</span>
                    </div>
                    <div className="pl-6 md:pl-0 flex md:block items-baseline justify-between gap-2 md:text-right">
                      <span className="md:hidden text-[10px] uppercase tracking-wide" style={{ color: TEXT_MUTED }}>Dosyası açılmamış</span>
                      <span className="text-sm font-semibold whitespace-nowrap tabular-nums" style={{ color: acilmamis > ESIK ? "white" : TEXT_MUTED }}>{acilmamis > ESIK ? `${sayi(fclAdedi(acilmamis))} FCL` : "—"}</span>
                    </div>
                    <div className="pl-6 md:pl-0 flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => onTamamla(s)} aria-label={`${s.proforma_no} siparişini tamamla`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border whitespace-nowrap hover:bg-white/5 hover:text-white"
                        style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} title="Kalan miktar sevk edilmeyecekse siparişi kapatır (kayıt silinmez)">
                        <CheckCircle2 size={13} /> <span className="md:hidden xl:inline">Tamamla</span>
                      </button>
                      <button onClick={() => onDevamEt(s)} disabled={devamEdiyorId === s.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white whitespace-nowrap hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: ACCENT }} title="Henüz hiçbir dosyada olmayan miktarla yeni sevkiyat dosyası açar">
                        {devamEdiyorId === s.id ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />} <span className="hidden lg:inline">Siparişe</span> Devam Et
                      </button>
                    </div>
                  </div>
                  {acikMi && (
                    <div className="px-4 pb-4 pt-1" data-testid="siparis-ayrinti">
                      <KalemTablosu ilerleme={il} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
