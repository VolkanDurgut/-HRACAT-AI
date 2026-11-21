"use client";

/**
 * "Excel'den içeri aktar" (11.11.2026) — export'un SİPARİŞ LİSTESİ Excel'i. Yükleme planı aktarımıyla aynı akış:
 * dosya TARAYICIDA okunur -> önizleme (yeni / değişecek / aynı / dosyada olmayan / uyarılar) -> "Aktar" ->
 * siparis_listesi_aktar() tek işlemde yazar. Kurallar: hiçbir kayıt silinmez; Excel'de boş hücre sistemdeki bilgiyi
 * silmez; ön ödeme işaretleri ve dosya bağlantıları korunur.
 */

import React from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Loader2, X } from "lucide-react";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import { DURUM_ETIKETI, siparisExceliOku, siparisOnizleme, type SiparisOnizleme } from "@/lib/siparis/siparis-excel";
import { siparisAktar, siparisKayitlariOku, siparisSistemBilgisiOku } from "@/lib/siparis/veri";

const sayi = (n: number | null) => (n === null ? "—" : n.toLocaleString("tr-TR", { maximumFractionDigits: 2 }));

export function SiparisExcelAktar({ onKapat, onAktarildi }: { onKapat: () => void; onAktarildi: (mesaj: string) => void }) {
  const input = React.useRef<HTMLInputElement>(null);
  const [okunuyor, setOkunuyor] = React.useState(false);
  const [hata, setHata] = React.useState<string | null>(null);
  const [dosyaAdi, setDosyaAdi] = React.useState<string | null>(null);
  const [toplam, setToplam] = React.useState(0);
  const [uyarilar, setUyarilar] = React.useState<string[]>([]);
  const [onizleme, setOnizleme] = React.useState<SiparisOnizleme | null>(null);
  const [yokAcik, setYokAcik] = React.useState(false);
  const [aktariliyor, setAktariliyor] = React.useState(false);
  const [uyariAcik, setUyariAcik] = React.useState(false);

  const dosyaSec = async (f: File | undefined) => {
    if (!f) return;
    setHata(null); setOnizleme(null); setUyarilar([]); setDosyaAdi(f.name); setOkunuyor(true);
    try {
      const [excel, mevcut, sistem] = await Promise.all([siparisExceliOku(f), siparisKayitlariOku(), siparisSistemBilgisiOku()]);
      setToplam(excel.satirlar.length);
      setUyarilar(excel.uyarilar);
      setOnizleme(siparisOnizleme(excel.satirlar, mevcut, sistem));
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
      const gonder = onizleme.gonderilecek;
      if (!gonder.length) { onAktarildi("Sipariş listesi Excel ile zaten aynı; değişiklik yok."); return; }
      const r = await siparisAktar(dosyaAdi, gonder);
      onAktarildi(`Sipariş listesi aktarıldı: ${r.eklenen} yeni, ${r.guncellenen} güncellendi, ${r.ayni} aynı.`);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Aktarılamadı.");
    } finally {
      setAktariliyor(false);
    }
  };

  const degisecek = onizleme ? onizleme.yeni.length + onizleme.degisen.length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="siparis-excel-baslik"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !aktariliyor) onKapat(); }} data-testid="siparis-aktar">
      <div className="w-full max-w-4xl my-6 rounded-xl border shadow-xl" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div>
            <p id="siparis-excel-baslik" className="text-sm font-semibold text-white flex items-center gap-2"><FileSpreadsheet size={15} style={{ color: ACCENT }} /> Sipariş listesini Excel&apos;den içeri aktar</p>
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
              Export&apos;un sipariş listesi dosyasını seçin. Durum, satır rengi (yeşil = sevk edildi) ve &quot;ön ödemesi alınmış / alınmamış&quot;
              bölümlerinden okunur. Önizlemeyi onaylamadan hiçbir şey değişmez; hiçbir kayıt silinmez; Excel&apos;de boş hücre sistemdeki bilgiyi silmez.
            </p>
          </div>
          <button onClick={onKapat} disabled={aktariliyor} className="hover:text-white disabled:opacity-50" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div role="button" tabIndex={0} onClick={() => input.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); dosyaSec(e.dataTransfer.files?.[0]); }}
            className="rounded-xl border-2 border-dashed px-4 py-5 text-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 hover:bg-white/[0.02]"
            style={{ borderColor: CARD_BORDER }} data-testid="siparis-excel-sec">
            {okunuyor ? (
              <p className="text-sm text-white inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" style={{ color: ACCENT }} /> Excel okunuyor…</p>
            ) : (
              <>
                <p className="text-[13px] font-semibold text-white">{dosyaAdi || "Sipariş listesi Excel dosyasını seçin veya buraya bırakın"}</p>
                <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>.xlsx / .xlsm · dosya bilgisayarınızda okunur, sisteme yüklenmez</p>
              </>
            )}
          </div>
          <input ref={input} type="file" accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
            className="hidden" onChange={(e) => { dosyaSec(e.target.files?.[0]); e.target.value = ""; }} data-testid="siparis-excel-input" />

          {hata && <p className="text-xs text-red-400 flex items-start gap-1.5" role="alert"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{hata}</p>}

          {onizleme && (
            <>
              <div className="flex flex-wrap gap-2 text-[11.5px]" data-testid="siparis-ozet">
                {([
                  ["Dosyadaki sipariş", toplam, null],
                  ["Yeni", onizleme.yeni.length, "yeni"],
                  ["Değişecek", onizleme.degisen.length, "degisen"],
                  ["Zaten aynı", onizleme.ayni, "ayni"],
                  ["Sistemde var, dosyada yok (dokunulmaz)", onizleme.dosyadaYok.length, "yok"],
                  ...(onizleme.sistemde.length ? [["Sistem proformasında (eklenmez)", onizleme.sistemde.length, "sistemde"] as const] : []),
                ] as const).map(([ad, n, k]) => (
                  <span key={ad} className="px-2.5 py-1 rounded-full border" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} data-sayi={k ?? undefined}>
                    {ad}: <b className="text-white tabular-nums">{n}</b>
                  </span>
                ))}
              </div>

              {uyarilar.length > 0 && (
                <div className="rounded-lg border px-3 py-2 text-[11.5px]" style={{ borderColor: "rgba(245,158,11,0.35)", backgroundColor: "rgba(245,158,11,0.06)" }} data-testid="siparis-uyarilar">
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
                          {["", "Proforma", "BL NO", "Firma Adı", "Değişiklik"].map((b, i) => (
                            <th key={i} className="text-left px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {onizleme.yeni.map((s) => (
                          <tr key={"y" + s.satir} className="border-b last:border-0 align-top" style={{ borderColor: CARD_BORDER }} data-testid="siparis-yeni">
                            <td className="px-2.5 py-1.5"><span className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-emerald-500/15 text-emerald-300">Yeni</span></td>
                            <td className="px-2.5 py-1.5 font-mono whitespace-nowrap text-white">{s.proforma_no}</td>
                            <td className="px-2.5 py-1.5 font-mono whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.bl_no || "—"}</td>
                            <td className="px-2.5 py-1.5 text-white max-w-[200px] truncate" title={s.firma}>{s.firma}</td>
                            <td className="px-2.5 py-1.5" style={{ color: "#C9D1DC" }}>
                              {s.urun || "—"} · {sayi(s.miktar_mt)} MT · {sayi(s.konteyner)} kont. · {s.liman || "—"} · {DURUM_ETIKETI[s.durum]}
                            </td>
                          </tr>
                        ))}
                        {onizleme.degisen.map(({ satir: s, degisiklikler }) => (
                          <tr key={"d" + s.satir} className="border-b last:border-0 align-top" style={{ borderColor: CARD_BORDER }} data-testid="siparis-degisen">
                            <td className="px-2.5 py-1.5"><span className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-amber-500/15 text-amber-300">Değişecek</span></td>
                            <td className="px-2.5 py-1.5 font-mono whitespace-nowrap text-white">{s.proforma_no}</td>
                            <td className="px-2.5 py-1.5 font-mono whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.bl_no || "—"}</td>
                            <td className="px-2.5 py-1.5 text-white max-w-[200px] truncate" title={s.firma}>{s.firma}</td>
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
              {onizleme.dosyadaYok.length > 0 && (
                <div className="rounded-lg border px-3 py-2 text-[11.5px]" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }} data-testid="siparis-dosyada-yok">
                  <button type="button" onClick={() => setYokAcik((v) => !v)} className="text-white font-medium">
                    Sistemde olup bu dosyada bulunmayan {onizleme.dosyadaYok.length} sipariş (silinmez, olduğu gibi kalır) {yokAcik ? "▲" : "▼"}
                  </button>
                  {yokAcik && <p className="mt-1" style={{ color: TEXT_MUTED }}>{onizleme.dosyadaYok.map((m) => `${m.proforma_no} · ${m.firma}${m.bl_no ? ` · ${m.bl_no}` : ""}`).join(" — ")}</p>}
                </div>
              )}
              {onizleme.blKorunan.length > 0 && (
                <div className="rounded-lg border px-3 py-2 text-[11.5px]" style={{ borderColor: "rgba(245,158,11,0.35)", backgroundColor: "rgba(245,158,11,0.06)" }} data-testid="siparis-bl-korunan">
                  <p className="text-amber-300 font-medium flex items-center gap-1.5"><Info size={12} /> Sistem esas: {onizleme.blKorunan.length} satırda Excel&apos;deki BL dosyanın booking&apos;iyle çelişiyor; BL değiştirilmez</p>
                  <ul className="mt-1 space-y-0.5 list-disc pl-5" style={{ color: "#FCD34D" }}>
                    {onizleme.blKorunan.map((b) => <li key={b.satir.satir}>{b.satir.proforma_no} · {b.dosya_no}: sistemde {b.sistem}, Excel&apos;de {b.excel}</li>)}
                  </ul>
                </div>
              )}
              {onizleme.sistemde.length > 0 && (
                <p className="text-[11.5px]" style={{ color: TEXT_MUTED }} data-testid="siparis-sistemde">
                  Sistemde proforma olarak kayıtlı {onizleme.sistemde.length} sipariş Excel kopyası olarak eklenmez (sistem satırı listede kalır): {onizleme.sistemde.map((x) => x.proforma_no).join(", ")}
                </p>
              )}
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
                Elle işaretlenen ön ödeme ve dosya / rezervasyondan gelen canlı durum (rezervasyonlu, sevk edildi, BL eksik) önceliklidir.
              </p>
            </>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onKapat} disabled={aktariliyor} className="px-3 py-2 rounded-lg border text-xs font-medium hover:bg-white/[0.04] disabled:opacity-50"
              style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Kapat</button>
            {onizleme && (
              <button type="button" onClick={aktar} disabled={aktariliyor} data-testid="siparis-aktar-onayla"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
                {aktariliyor && <Loader2 size={13} className="animate-spin" />}
                {degisecek > 0 ? `${degisecek} satırı aktar` : onizleme.gonderilecek.length ? "Sıra bilgisini güncelle" : "Kapat ve yenile"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
