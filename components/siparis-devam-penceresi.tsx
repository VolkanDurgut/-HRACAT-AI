"use client";
import React, { useEffect, useMemo, useState } from "react";
import { X, Loader2, AlertTriangle, RotateCcw, ArrowRight, PackageCheck } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { cuvalAdedi, type SiparisKalemDurumu } from "@/lib/siparis-takip";
import {
  varsayilanSecimler,
  secimMts,
  secimAsimi,
  secimdenKalemler,
  markaOner,
  detayliAmbalajOner,
  mtsdenFcl,
  type DevamSecimi,
} from "@/lib/siparis-devam";

export type DevamOnayi = {
  kalemler: ReturnType<typeof secimdenKalemler>;
  marka: string;
  detayliAmbalaj: string;
};

type Props = {
  proformaNo: string;
  aliciFirma: string | null;
  paraBirimi: string;
  kalemler: SiparisKalemDurumu[];
  /** Ilk dosyanin detayli ambalaji / markasi (sablon). */
  ornekDetayliAmbalaj: string | null;
  ornekMarka: string | null;
  olusturuluyor: boolean;
  onKapat: () => void;
  onOnayla: (onay: DevamOnayi) => void;
};

const sayi = (n: number, ondalik = 2) => n.toLocaleString("tr-TR", { maximumFractionDigits: ondalik });
const ESIK = 0.01;

/**
 * SEVKIYAT SECIMI (16.10.2026): "Siparise Devam Et" artik dosyayi hemen acmaz;
 * once hangi markadan kac FCL gidecegi secilir, detayli ambalaj ve marka
 * secimden onerilir (duzenlenebilir), dosyalanmamis miktari asan secim onay
 * ister. Hesap: lib/siparis-devam.ts.
 */
export function SiparisDevamPenceresi({
  proformaNo, aliciFirma, paraBirimi, kalemler, ornekDetayliAmbalaj, ornekMarka, olusturuluyor, onKapat, onOnayla,
}: Props) {
  const [secimler, setSecimler] = useState<DevamSecimi[]>(() => varsayilanSecimler(kalemler));
  const [fclMetin, setFclMetin] = useState<string[]>(() => varsayilanSecimler(kalemler).map((s) => (s.fcl ? String(s.fcl).replace(".", ",") : "")));
  const [ambalajElle, setAmbalajElle] = useState<string | null>(null);
  const [markaElle, setMarkaElle] = useState<string | null>(null);
  const [asimOnay, setAsimOnay] = useState(false);

  const oneri = useMemo(() => detayliAmbalajOner(secimler, ornekDetayliAmbalaj, kalemler), [secimler, ornekDetayliAmbalaj, kalemler]);
  const markaOnerisi = useMemo(() => markaOner(secimler, ornekMarka), [secimler, ornekMarka]);
  const detayliAmbalaj = ambalajElle ?? oneri.metin;
  const marka = markaElle ?? markaOnerisi;

  const toplamMts = secimler.reduce((t, s) => t + secimMts(s), 0);
  const toplamCuval = secimler.reduce((t, s) => t + (cuvalAdedi(secimMts(s), s.kalem.ambalajKg) || 0), 0);
  const cuvalBilinmiyor = secimler.some((s) => secimMts(s) > ESIK && !s.kalem.ambalajKg);
  const toplamTutar = secimler.reduce((t, s) => t + secimMts(s) * s.kalem.birimFiyat, 0);
  const asanlar = secimler.filter((s) => secimAsimi(s) > 0);
  const hicDosyalanmamisYok = kalemler.every((k) => k.acikMts <= ESIK);

  // Asim kalkinca onay sifirlanir (sonraki asimda yeniden sorulsun)
  useEffect(() => { if (asanlar.length === 0 && asimOnay) setAsimOnay(false); }, [asanlar.length, asimOnay]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !olusturuluyor) onKapat(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [olusturuluyor, onKapat]);

  const seciliDegistir = (i: number, secili: boolean) => {
    const mevcut = secimler[i];
    // Isaretlenen satirin FCL'i bossa dosyalanmamis miktarla doldurulur
    const doldur = secili && !(mevcut.fcl > 0);
    const fcl = doldur ? mtsdenFcl(mevcut.kalem.acikMts) : mevcut.fcl;
    setSecimler((onceki) => onceki.map((s, j) => (j === i ? { ...s, secili, fcl } : s)));
    if (doldur) setFclMetin((m) => m.map((x, k) => (k === i ? (fcl ? String(fcl).replace(".", ",") : "") : x)));
  };

  const fclDegistir = (i: number, metin: string) => {
    const temiz = metin.replace(/[^\d.,]/g, "");
    setFclMetin((m) => m.map((x, k) => (k === i ? temiz : x)));
    const n = parseFloat(temiz.replace(",", "."));
    setSecimler((onceki) => onceki.map((s, j) => (j === i ? { ...s, fcl: Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0, secili: Number.isFinite(n) && n > 0 ? true : s.secili } : s)));
  };

  const engel =
    toplamMts <= ESIK ? "En az bir ürün seçip FCL girin."
    : !detayliAmbalaj.trim() ? "Detaylı ambalaj boş olamaz."
    : asanlar.length > 0 && !asimOnay ? "Dosyalanmamış miktarı aşan seçimi onaylayın."
    : null;

  const onayla = () => {
    if (engel || olusturuluyor) return;
    onOnayla({ kalemler: secimdenKalemler(secimler), marka: marka.trim(), detayliAmbalaj: detayliAmbalaj.trim() });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { if (!olusturuluyor) onKapat(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="siparis-devam-baslik"
        className="rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-fade-up"
        style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Baslik */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div className="min-w-0">
            <h3 id="siparis-devam-baslik" className="text-sm font-bold uppercase tracking-wider text-white">Sevkiyat Seçimi</h3>
            <p className="text-xs mt-0.5 truncate" style={{ color: TEXT_MUTED }}>
              <span className="font-semibold text-slate-300">{proformaNo}</span>{aliciFirma ? ` · ${aliciFirma}` : ""}
            </p>
          </div>
          <button onClick={onKapat} disabled={olusturuluyor} className="hover:text-white transition-colors disabled:opacity-40" style={{ color: TEXT_MUTED }} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <p className="text-xs" style={{ color: TEXT_MUTED }}>
            Bu sevkiyatta gönderilecek ürünleri ve FCL miktarını seçin. Seçilmeyen ürünler siparişte açık kalır. 1 FCL = 25 MTS.
          </p>
          {hicDosyalanmamisYok && (
            <p className="text-xs text-amber-400 inline-flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              Bu siparişin tüm miktarı zaten sevkiyat dosyalarına alınmış. Yeni dosya açacaksanız miktarı elle girin.
            </p>
          )}

          {/* Kalemler */}
          <div className="rounded-lg border overflow-x-auto" style={{ borderColor: CARD_BORDER }}>
            <table className="min-w-full">
              <thead>
                <tr style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide w-10"></th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide">Marka / Ürün</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" title="Henüz hiçbir sevkiyat dosyasına alınmamış miktar">Dosyası Açılmamış</th>
                  <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap">Bu Sevkiyat</th>
                </tr>
              </thead>
              <tbody>
                {secimler.map((s, i) => {
                  const k = s.kalem;
                  const mts = secimMts(s);
                  const asim = secimAsimi(s);
                  const cuval = cuvalAdedi(mts, k.ambalajKg);
                  const acikCuval = cuvalAdedi(k.acikMts, k.ambalajKg);
                  const id = `devam-kalem-${i}`;
                  return (
                    <tr key={i} className="border-t align-top" style={{ borderColor: CARD_BORDER, opacity: s.secili ? 1 : 0.6 }}>
                      <td className="px-3 py-3">
                        <input
                          id={id}
                          type="checkbox"
                          checked={s.secili}
                          onChange={(e) => seciliDegistir(i, e.target.checked)}
                          className="h-4 w-4 rounded accent-emerald-500 cursor-pointer"
                          aria-label={`${k.marka} bu sevkiyatta`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <label htmlFor={id} className="cursor-pointer">
                          <span className="inline-block px-2 py-0.5 rounded-md text-xs font-bold tracking-wide text-white" style={{ backgroundColor: ROW_HEADER_BG, border: `1px solid ${CARD_BORDER}` }}>
                            {k.marka}
                          </span>
                          <span className="block text-[11px] mt-1 max-w-[260px] truncate" style={{ color: TEXT_MUTED }} title={k.urunAdi}>
                            {k.urunAdi}{k.ambalajBoyutu ? ` · ${k.ambalajBoyutu}` : ""}
                          </span>
                        </label>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {k.acikMts > ESIK ? (
                          <>
                            <p className="text-sm font-semibold text-white">{sayi(mtsdenFcl(k.acikMts))} FCL</p>
                            <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{acikCuval !== null ? `${sayi(acikCuval, 0)} çuval · ` : ""}{sayi(k.acikMts)} MTS</p>
                          </>
                        ) : (
                          <p className="text-sm" style={{ color: TEXT_MUTED }}>—</p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={fclMetin[i]}
                            onChange={(e) => fclDegistir(i, e.target.value)}
                            placeholder="0"
                            aria-label={`${k.marka} FCL`}
                            className="w-20 px-2.5 py-1.5 border rounded-lg text-sm text-white text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                            style={{ borderColor: asim > 0 ? "rgba(251,191,36,0.6)" : CARD_BORDER, backgroundColor: CARD_BG }}
                          />
                          <span className="text-xs font-semibold" style={{ color: TEXT_MUTED }}>FCL</span>
                        </div>
                        {mts > ESIK && (
                          <p className="text-[11px] mt-1 whitespace-nowrap" style={{ color: TEXT_MUTED }}>
                            {cuval !== null ? `${sayi(cuval, 0)} çuval · ` : ""}{sayi(mts)} MTS
                          </p>
                        )}
                        {asim > 0 && (
                          <p className="text-[11px] mt-1 text-amber-400 inline-flex items-center gap-1 whitespace-nowrap">
                            <AlertTriangle size={11} /> Dosyalanmamış miktarı {sayi(mtsdenFcl(asim))} FCL aşıyor
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Ozet */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 rounded-lg border" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
            <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Toplam <span className="text-sm font-bold text-white">{sayi(mtsdenFcl(toplamMts))} FCL</span></p>
            <p className="text-[11px]" style={{ color: TEXT_MUTED }}><span className="text-slate-300 font-semibold">{sayi(toplamMts)}</span> MTS</p>
            {!cuvalBilinmiyor && toplamCuval > 0 && <p className="text-[11px]" style={{ color: TEXT_MUTED }}><span className="text-slate-300 font-semibold">{sayi(toplamCuval, 0)}</span> çuval</p>}
            <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Tutar <span className="text-slate-300 font-semibold">{toplamTutar.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {paraBirimi}</span></p>
          </div>

          {/* Marka + detayli ambalaj */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="devam-marka" className="block text-xs font-medium" style={{ color: TEXT_MUTED }}>Marka</label>
                {markaElle !== null && markaElle !== markaOnerisi && (
                  <button onClick={() => setMarkaElle(null)} className="inline-flex items-center gap-1 text-[11px] hover:text-white" style={{ color: TEXT_MUTED }}>
                    <RotateCcw size={11} /> Öneriye dön
                  </button>
                )}
              </div>
              <input
                id="devam-marka"
                value={marka}
                onChange={(e) => setMarkaElle(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="devam-ambalaj" className="block text-xs font-medium" style={{ color: TEXT_MUTED }}>
                  Detaylı Ambalaj <span className="font-normal">(Fatura talimatı ve tüm evraklarda görünür)</span>
                </label>
                {ambalajElle !== null && ambalajElle !== oneri.metin && (
                  <button onClick={() => setAmbalajElle(null)} className="inline-flex items-center gap-1 text-[11px] hover:text-white" style={{ color: TEXT_MUTED }}>
                    <RotateCcw size={11} /> Öneriye dön
                  </button>
                )}
              </div>
              <textarea
                id="devam-ambalaj"
                value={detayliAmbalaj}
                onChange={(e) => setAmbalajElle(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border rounded-lg text-sm text-white resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
              />
              <p className="text-[11px] mt-1" style={{ color: TEXT_MUTED }}>
                {ambalajElle === null ? "Seçime göre otomatik oluşturuldu; seçimi değiştirdikçe güncellenir." : "Elle düzenlendi; seçim değişse de bu metin korunur."}
              </p>
              {ambalajElle === null && oneri.notlar.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {oneri.notlar.map((n, i) => (
                    <li key={i} className="text-[11px] text-amber-400 inline-flex items-start gap-1">
                      <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {n}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {asanlar.length > 0 && (
            <label className="flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer bg-amber-500/10" style={{ borderColor: "rgba(251,191,36,0.35)" }}>
              <input type="checkbox" checked={asimOnay} onChange={(e) => setAsimOnay(e.target.checked)} className="h-4 w-4 mt-0.5 rounded accent-amber-500 cursor-pointer" />
              <span className="text-xs text-amber-300">
                <span className="font-semibold text-amber-400">Dosyalanmamış miktar aşılıyor</span> ({asanlar.map((s) => `${s.kalem.marka} +${sayi(mtsdenFcl(secimAsimi(s)))} FCL`).join(", ")}).
                {" "}Fazla miktar siparişte &ldquo;fazla sayılmış&rdquo; olarak görünür. Bilerek gönderiyorsanız onaylayın.
              </span>
            </label>
          )}
        </div>

        {/* Alt cubuk */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
          <p className="text-[11px]" style={{ color: engel ? "#FBBF24" : TEXT_MUTED }}>
            {engel || "Dosya oluşturulunca rezervasyon ekranına yönlendirilirsiniz."}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onKapat} disabled={olusturuluyor} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-white/5 disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              İptal
            </button>
            <button
              onClick={onayla}
              disabled={!!engel || olusturuluyor}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: ACCENT }}
            >
              {olusturuluyor ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
              {olusturuluyor ? "Oluşturuluyor..." : `Dosyayı Oluştur${toplamMts > ESIK ? ` · ${sayi(mtsdenFcl(toplamMts))} FCL` : ""}`}
              {!olusturuluyor && <ArrowRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
