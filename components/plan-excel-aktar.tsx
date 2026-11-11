"use client";

/**
 * "Excel'den içeri aktar" (11.11.2026) — operasyonun YÜKLEME PLANI Excel'i (yıl sayfası, ör. "2026").
 * ETD-ETA aktarımıyla aynı akış: dosya TARAYICIDA okunur (sunucuya yüklenmez, makro çalışmaz) -> önizleme
 * (yeni / değişecek / aynı / uyarılar) -> "Aktar" -> yukleme_plani_aktar() tek işlemde yazar.
 * Kurallar: hiçbir kayıt silinmez; Excel'de boş hücre sistemdeki bilgiyi silmez; rezervasyon bağlantısı ve
 * navlun bilgisi korunur.
 */

import React from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Loader2, X } from "lucide-react";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import { gosterim, planExceliOku, planOnizleme, type PlanExcelSatiri, type PlanOnizleme } from "@/lib/siparis/plan-excel";
import { planAktar, planKayitlariOku } from "@/lib/siparis/veri";

export function PlanExcelAktar({ onKapat, onAktarildi }: { onKapat: () => void; onAktarildi: (mesaj: string) => void }) {
  const input = React.useRef<HTMLInputElement>(null);
  const [okunuyor, setOkunuyor] = React.useState(false);
  const [hata, setHata] = React.useState<string | null>(null);
  const [dosyaAdi, setDosyaAdi] = React.useState<string | null>(null);
  const [toplam, setToplam] = React.useState(0);
  const [uyarilar, setUyarilar] = React.useState<string[]>([]);
  const [onizleme, setOnizleme] = React.useState<PlanOnizleme | null>(null);
  const [aktariliyor, setAktariliyor] = React.useState(false);
  const [uyariAcik, setUyariAcik] = React.useState(false);

  const dosyaSec = async (f: File | undefined) => {
    if (!f) return;
    setHata(null); setOnizleme(null); setUyarilar([]); setDosyaAdi(f.name); setOkunuyor(true);
    try {
      const [excel, mevcut] = await Promise.all([planExceliOku(f), planKayitlariOku()]);
      setToplam(excel.satirlar.length);
      setUyarilar(excel.uyarilar);
      setOnizleme(planOnizleme(excel.satirlar, mevcut));
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Dosya okunamadı.");
    } finally {
      setOkunuyor(false);
    }
  };

  const aktar = async () => {
    if (!onizleme || !dosyaAdi) return;
    setAktariliyor(true); setHata(null);
    try {
      const gonder: PlanExcelSatiri[] = onizleme.gonderilecek;
      if (!gonder.length) { onAktarildi("Yükleme planı Excel ile zaten aynı; değişiklik yok."); return; }
      const r = await planAktar(dosyaAdi, gonder);
      onAktarildi(`Yükleme planı aktarıldı: ${r.eklenen} yeni, ${r.guncellenen} güncellendi, ${r.ayni} aynı.`);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Aktarılamadı.");
    } finally {
      setAktariliyor(false);
    }
  };

  const degisecek = onizleme ? onizleme.yeni.length + onizleme.degisen.length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="plan-excel-baslik"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !aktariliyor) onKapat(); }} data-testid="plan-aktar">
      <div className="w-full max-w-4xl my-6 rounded-xl border shadow-xl" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div>
            <p id="plan-excel-baslik" className="text-sm font-semibold text-white flex items-center gap-2"><FileSpreadsheet size={15} style={{ color: ACCENT }} /> Yükleme planını Excel&apos;den içeri aktar</p>
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
              Operasyonun yükleme planı dosyasını seçin (yıl sayfası, ör. &quot;2026&quot;). Önizlemeyi onaylamadan hiçbir şey değişmez.
              Hiçbir kayıt silinmez; Excel&apos;de boş hücre sistemdeki bilgiyi silmez.
            </p>
          </div>
          <button onClick={onKapat} disabled={aktariliyor} className="hover:text-white disabled:opacity-50" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div role="button" tabIndex={0} onClick={() => input.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); dosyaSec(e.dataTransfer.files?.[0]); }}
            className="rounded-xl border-2 border-dashed px-4 py-5 text-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 hover:bg-white/[0.02]"
            style={{ borderColor: CARD_BORDER }} data-testid="plan-excel-sec">
            {okunuyor ? (
              <p className="text-sm text-white inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" style={{ color: ACCENT }} /> Excel okunuyor…</p>
            ) : (
              <>
                <p className="text-[13px] font-semibold text-white">{dosyaAdi || "Yükleme planı Excel dosyasını seçin veya buraya bırakın"}</p>
                <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>.xlsx / .xlsm · dosya bilgisayarınızda okunur, sisteme yüklenmez</p>
              </>
            )}
          </div>
          <input ref={input} type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
            className="hidden" onChange={(e) => { dosyaSec(e.target.files?.[0]); e.target.value = ""; }} data-testid="plan-excel-input" />

          {hata && <p className="text-xs text-red-400 flex items-start gap-1.5" role="alert"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{hata}</p>}

          {onizleme && (
            <>
              <div className="flex flex-wrap gap-2 text-[11.5px]" data-testid="plan-ozet">
                {([
                  ["Dosyadaki booking", toplam, null],
                  ["Yeni", onizleme.yeni.length, "yeni"],
                  ["Değişecek", onizleme.degisen.length, "degisen"],
                  ["Zaten aynı", onizleme.ayni, "ayni"],
                  ["Sistemde var, dosyada yok (dokunulmaz)", onizleme.sistemdeDosyadaYok, "yok"],
                ] as const).map(([ad, n, k]) => (
                  <span key={ad} className="px-2.5 py-1 rounded-full border" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} data-sayi={k ?? undefined}>
                    {ad}: <b className="text-white tabular-nums">{n}</b>
                  </span>
                ))}
              </div>

              {uyarilar.length > 0 && (
                <div className="rounded-lg border px-3 py-2 text-[11.5px]" style={{ borderColor: "rgba(245,158,11,0.35)", backgroundColor: "rgba(245,158,11,0.06)" }} data-testid="plan-uyarilar">
                  <button type="button" onClick={() => setUyariAcik((v) => !v)} className="text-amber-300 flex items-center gap-1.5 font-medium">
                    <Info size={12} /> Dosyada dikkat edilecek {uyarilar.length} nokta {uyariAcik ? "▲" : "▼"}
                  </button>
                  {uyariAcik && <ul className="mt-1.5 space-y-0.5 list-disc pl-5" style={{ color: "#FCD34D" }}>{uyarilar.map((u) => <li key={u}>{u}</li>)}</ul>}
                </div>
              )}

              {degisecek === 0 ? (
                <p className="text-sm text-white flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400" /> Sistem bu dosyayla güncel; değişecek satır yok.</p>
              ) : (
                <div className="rounded-lg border overflow-hidden" style={{ borderColor: CARD_BORDER }}>
                  <div className="overflow-auto max-h-[48vh]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10" style={{ backgroundColor: ROW_HEADER_BG }}>
                        <tr className="border-b" style={{ borderColor: CARD_BORDER }}>
                          {["", "Hafta", "Booking No", "Müşteri", "Değişiklik"].map((b, i) => (
                            <th key={i} className="text-left px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {onizleme.yeni.map((s) => (
                          <tr key={"y" + s.booking_no} className="border-b last:border-0 align-top" style={{ borderColor: CARD_BORDER }} data-testid="plan-yeni">
                            <td className="px-2.5 py-1.5"><span className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-emerald-500/15 text-emerald-300">Yeni</span></td>
                            <td className="px-2.5 py-1.5 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.hafta ?? "—"}</td>
                            <td className="px-2.5 py-1.5 font-mono whitespace-nowrap text-white">{s.booking_no}</td>
                            <td className="px-2.5 py-1.5 text-white max-w-[200px] truncate" title={s.musteri || ""}>{s.musteri || "—"}</td>
                            <td className="px-2.5 py-1.5" style={{ color: "#C9D1DC" }}>
                              {s.konteyner ?? "—"} kont. · {s.varis_limani || "—"} · ETD {gosterim("etd", s.etd)} · {s.gemi || "—"}
                            </td>
                          </tr>
                        ))}
                        {onizleme.degisen.map(({ satir: s, degisiklikler }) => (
                          <tr key={"d" + s.booking_no} className="border-b last:border-0 align-top" style={{ borderColor: CARD_BORDER }} data-testid="plan-degisen">
                            <td className="px-2.5 py-1.5"><span className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-amber-500/15 text-amber-300">Değişecek</span></td>
                            <td className="px-2.5 py-1.5 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.hafta ?? "—"}</td>
                            <td className="px-2.5 py-1.5 font-mono whitespace-nowrap text-white">{s.booking_no}</td>
                            <td className="px-2.5 py-1.5 text-white max-w-[200px] truncate" title={s.musteri || ""}>{s.musteri || "—"}</td>
                            <td className="px-2.5 py-1.5">
                              <ul className="space-y-0.5">
                                {degisiklikler.map((d) => (
                                  <li key={d.alan} className="leading-snug">
                                    <span style={{ color: TEXT_MUTED }}>{d.alan}: </span>
                                    <span className="line-through" style={{ color: TEXT_MUTED }}>{d.eski}</span>
                                    <span style={{ color: TEXT_MUTED }}> → </span>
                                    <span className="text-white">{d.yeni}</span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
                Rezervasyona bağlı satırlarda gemi / ETD / cut-off / konteyner planda rezervasyondan gösterilmeye devam eder (canlı kaynak).
              </p>
            </>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onKapat} disabled={aktariliyor} className="px-3 py-2 rounded-lg border text-xs font-medium hover:bg-white/[0.04] disabled:opacity-50"
              style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Kapat</button>
            {onizleme && (
              <button type="button" onClick={aktar} disabled={aktariliyor} data-testid="plan-aktar-onayla"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
                {aktariliyor && <Loader2 size={13} className="animate-spin" />}
                {degisecek > 0 ? `${degisecek} satırı aktar` : onizleme.gonderilecek.length ? "Hafta / sıra bilgisini güncelle" : "Kapat ve yenile"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
