"use client";

/**
 * "Excel'den güncelle" (28.10.2026): Harun Bey'in haftalik ETD-ETA Excel'indeki KONSIMENTO
 * sutununu sistemdeki sevkiyatlarla booking no (yoksa B/L) uzerinden eslestirir.
 * Dosya TARAYICIDA okunur (makro calismaz, dosya yuklenmez/saklanmaz). Onizlemede kullanici
 * satir satir secer; "Uygula" -> odeme_konsimento_toplu() (tek islem). Excel'de bos olan
 * hucre sistemdeki degeri SILMEZ.
 */

import React from "react";
import { X, FileSpreadsheet, Loader2, AlertTriangle, ArrowRight, Info } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { etdExceliOku, excelSistemleEslestir, type EslesmeSonucu, type SistemSevkiyati, type ExcelSatiri } from "@/lib/etd-excel";
import { KONSIMENTO_ETIKETI, odemeAlindiMi, konsimentoDurumuMu } from "@/lib/odeme-takibi";

/** Yukleme kaydina yazilan ozet (odeme_excel_yuklemeleri.ozet) */
export type ExcelYuklemeOzeti = {
  eslesen: number;
  degisen: number;
  ayni: number;
  excelBos: number;
  taninmayan: number;
  sistemdeYok: number;
  odemesiGelen: { firma: string; booking: string }[];
  yeniBekleyen: { firma: string; booking: string }[];
};

function DurumRozeti({ durum }: { durum: string | null }) {
  if (!durum || !konsimentoDurumuMu(durum)) return <span className="text-[11px]" style={{ color: TEXT_MUTED }}>boş</span>;
  const alindi = odemeAlindiMi(durum);
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ${alindi ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
      {KONSIMENTO_ETIKETI[durum]}
    </span>
  );
}

export function EtdExcelAktar({
  sistem, onKapat, onUygula,
}: {
  sistem: SistemSevkiyati[];
  onKapat: () => void;
  /** Durumlar + yukleme kaydi (yeni hatirlatma turu). Hata metni dondurur (null = basarili) */
  onUygula: (satirlar: { id: string; durum: string }[], ozet: ExcelYuklemeOzeti, dosyaAdi: string) => Promise<string | null>;
}) {
  const [okunuyor, setOkunuyor] = React.useState(false);
  const [hata, setHata] = React.useState<string | null>(null);
  const [dosyaAdi, setDosyaAdi] = React.useState<string | null>(null);
  const [sonuc, setSonuc] = React.useState<EslesmeSonucu | null>(null);
  const [uyarilar, setUyarilar] = React.useState<string[]>([]);
  const [sonYilYok, setSonYilYok] = React.useState<ExcelSatiri[]>([]);
  const [secili, setSecili] = React.useState<Set<string>>(new Set());
  const [uygulaniyor, setUygulaniyor] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !uygulaniyor) onKapat(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [uygulaniyor, onKapat]);

  const dosyaSec = async (f: File | undefined) => {
    if (!f) return;
    setHata(null); setSonuc(null); setDosyaAdi(f.name);
    if (!/\.(xlsx|xlsm)$/i.test(f.name)) { setHata("Lütfen .xlsx veya .xlsm uzantılı Excel dosyası seçin."); return; }
    setOkunuyor(true);
    try {
      const okuma = await etdExceliOku(f);
      const e = excelSistemleEslestir(okuma.satirlar, sistem);
      const sonYil = okuma.sayfalar[okuma.sayfalar.length - 1];
      setSonYilYok(e.sistemdeYok.filter((s) => s.sayfa === sonYil && !odemeAlindiMi(s.durum) && (s.durum || s.durumHam)));
      setUyarilar(okuma.uyarilar);
      setSonuc(e);
      setSecili(new Set(e.degisecek.map((d) => d.rezervasyon_id)));
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Dosya okunamadı.");
    } finally {
      setOkunuyor(false);
    }
  };

  const uygula = async () => {
    if (!sonuc) return;
    const secilen = sonuc.degisecek.filter((d) => secili.has(d.rezervasyon_id));
    const satirlar = secilen.map((d) => ({ id: d.rezervasyon_id, durum: d.yeni }));
    const kisa = (d: (typeof secilen)[number]) => ({ firma: d.firma.slice(0, 120), booking: d.booking.slice(0, 60) });
    const ozet: ExcelYuklemeOzeti = {
      eslesen: sonuc.eslesen,
      degisen: secilen.length,
      ayni: sonuc.ayni,
      excelBos: sonuc.excelBos,
      taninmayan: sonuc.taninmayan.length,
      sistemdeYok: sonYilYok.length,
      odemesiGelen: secilen.filter((d) => d.odemeDegisimi === "alindi").map(kisa),
      // Daha once odemesi "alindi" ya da bos olan sevkiyat bu yuklemede bekleyen oldu
      yeniBekleyen: secilen.filter((d) => !odemeAlindiMi(d.yeni) && (d.eski === null || odemeAlindiMi(d.eski))).map(kisa),
    };
    setUygulaniyor(true); setHata(null);
    const h = await onUygula(satirlar, ozet, dosyaAdi || "");
    setUygulaniyor(false);
    if (h) setHata(h);
  };

  const tumu = sonuc ? sonuc.degisecek.length > 0 && secili.size === sonuc.degisecek.length : false;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="etd-excel-baslik"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !uygulaniyor) onKapat(); }}>
      <div className="w-full max-w-3xl my-6 rounded-xl border shadow-xl" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div>
            <p id="etd-excel-baslik" className="text-sm font-semibold text-white flex items-center gap-2"><FileSpreadsheet size={15} style={{ color: ACCENT }} /> Excel&apos;den konşimento / ödeme durumu</p>
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>Haftalık ETD-ETA dosyasını seçin. Yalnızca &quot;KONŞİMENTO&quot; sütunu okunur; önizlemeyi onaylamadan hiçbir şey değişmez. Onaylanan her yükleme yeni hatırlatma turunu başlatır.</p>
          </div>
          <button onClick={onKapat} disabled={uygulaniyor} className="hover:text-white disabled:opacity-50" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div role="button" tabIndex={0} onClick={() => input.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); dosyaSec(e.dataTransfer.files?.[0]); }}
            className="rounded-xl border-2 border-dashed px-4 py-5 text-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 hover:bg-white/[0.02]"
            style={{ borderColor: CARD_BORDER }} data-testid="excel-sec">
            {okunuyor ? (
              <p className="text-sm text-white inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" style={{ color: ACCENT }} /> Excel okunuyor…</p>
            ) : (
              <>
                <p className="text-[13px] font-semibold text-white">{dosyaAdi ? dosyaAdi : "ETD-ETA Excel dosyasını seçin veya buraya bırakın"}</p>
                <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>.xlsx / .xlsm · dosya bilgisayarınızda okunur, sisteme yüklenmez</p>
              </>
            )}
          </div>
          <input ref={input} type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
            className="hidden" onChange={(e) => { dosyaSec(e.target.files?.[0]); e.target.value = ""; }} />

          {hata && <p className="text-xs text-red-400 flex items-center gap-1.5" role="alert"><AlertTriangle size={13} />{hata}</p>}

          {sonuc && (
            <>
              <div className="flex flex-wrap gap-2 text-[11.5px]">
                {[
                  ["Eşleşen sevkiyat", sonuc.eslesen],
                  ["Değişecek", sonuc.degisecek.length],
                  ["Zaten aynı", sonuc.ayni],
                  ["Excel'de boş (korunur)", sonuc.excelBos],
                ].map(([ad, n]) => (
                  <span key={ad as string} className="px-2.5 py-1 rounded-full border" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                    {ad}: <b className="text-white tabular-nums">{n}</b>
                  </span>
                ))}
              </div>

              {uyarilar.map((u) => <p key={u} className="text-[11px] text-amber-300 flex items-center gap-1.5"><Info size={12} />{u}</p>)}
              {sonuc.taninmayan.length > 0 && (
                <p className="text-[11px] text-amber-300 flex items-center gap-1.5"><Info size={12} />
                  Tanınmayan değer (atlandı): {sonuc.taninmayan.map((t) => `${t.booking} “${t.durumHam}”`).join(", ")}
                </p>
              )}

              {sonuc.degisecek.length === 0 ? (
                <p className="text-sm text-white">Sistem Excel ile güncel; değişecek satır yok. Yüklemeyi kaydederek yeni hatırlatma turunu başlatabilirsiniz.</p>
              ) : (
                <div className="rounded-lg border overflow-hidden" style={{ borderColor: CARD_BORDER }}>
                  <div className="overflow-x-auto max-h-[45vh]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0" style={{ backgroundColor: ROW_HEADER_BG }}>
                        <tr className="border-b" style={{ borderColor: CARD_BORDER }}>
                          <th className="px-3 py-2 w-8">
                            <input type="checkbox" aria-label="Tümünü seç" checked={tumu}
                              onChange={() => setSecili(tumu ? new Set() : new Set(sonuc.degisecek.map((d) => d.rezervasyon_id)))} className="accent-emerald-500" />
                          </th>
                          {["Firma", "Dosya", "Booking", "Sistemde", "", "Excel", "Ödeme"].map((b, i) => (
                            <th key={i} className="text-left px-2 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sonuc.degisecek.map((d) => (
                          <tr key={d.rezervasyon_id} className="border-b last:border-0" style={{ borderColor: CARD_BORDER }}>
                            <td className="px-3 py-1.5">
                              <input type="checkbox" aria-label={`${d.booking} seç`} checked={secili.has(d.rezervasyon_id)} className="accent-emerald-500"
                                onChange={() => setSecili((s) => { const n = new Set(s); if (n.has(d.rezervasyon_id)) n.delete(d.rezervasyon_id); else n.add(d.rezervasyon_id); return n; })} />
                            </td>
                            <td className="px-2 py-1.5 text-white max-w-[180px] truncate" title={d.firma}>{d.firma}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{d.dosya_no}</td>
                            <td className="px-2 py-1.5 font-mono whitespace-nowrap" style={{ color: TEXT_MUTED }} title={d.kaynak}>{d.booking}</td>
                            <td className="px-2 py-1.5"><DurumRozeti durum={d.eski} /></td>
                            <td className="px-1 py-1.5" style={{ color: TEXT_MUTED }}><ArrowRight size={12} /></td>
                            <td className="px-2 py-1.5"><DurumRozeti durum={d.yeni} /></td>
                            <td className="px-2 py-1.5 whitespace-nowrap text-[11px]">
                              {d.odemeDegisimi === "alindi" ? <span className="text-emerald-300">Ödeme alındı</span>
                                : d.odemeDegisimi === "bekliyor" || (!d.eski && !odemeAlindiMi(d.yeni)) ? <span className="text-amber-300">Bekliyor</span>
                                : <span style={{ color: TEXT_MUTED }}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {sonYilYok.length > 0 && (
                <div className="rounded-lg border px-3 py-2.5 text-[11.5px]" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                  <p className="text-white font-medium mb-1">Excel&apos;de olup sistemde kaydı bulunmayan sevkiyatlar ({sonYilYok.length})</p>
                  <p style={{ color: TEXT_MUTED }}>
                    {sonYilYok.map((s) => `${s.firma} · ${s.booking || s.bl}${s.durumHam ? ` (${s.durumHam})` : ""}`).join(" — ")}
                  </p>
                  <p className="mt-1" style={{ color: TEXT_MUTED }}>Bunlar sistemde dosyası olmadığı için listeye eklenmez.</p>
                </div>
              )}
            </>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onKapat} disabled={uygulaniyor} className="px-3 py-2 rounded-lg border text-xs font-medium hover:bg-white/[0.04] disabled:opacity-50"
              style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Kapat</button>
            {sonuc && (
              <button type="button" onClick={uygula} disabled={uygulaniyor} data-testid="excel-uygula"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
                {uygulaniyor && <Loader2 size={13} className="animate-spin" />}
                {secili.size > 0 ? `${secili.size} sevkiyatı güncelle ve yüklemeyi kaydet` : "Yüklemeyi kaydet (değişiklik yok)"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
