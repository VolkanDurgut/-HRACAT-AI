"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown, Package } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ROW_HEADER_BG } from "@/lib/theme";
import { DURUM_ETIKETI, type SevkiyatOzeti, type SevkiyatDurumu } from "@/lib/kantar-sevkiyat";

/**
 * Kantar Paneli · Sevkiyat Durumu (28.10.2026). Her acik sevkiyat icin musteri KODU, dosya no,
 * cuval (marka) ve "Dolu x / y" + uc renkli cubuk (dolu · ekipmani alinmis bos · alinmamis).
 * Karta tiklayinca konteyner listesi (konteyner no · muhur no · cuval · durum). Hesap:
 * lib/kantar-sevkiyat.ts (gunluk rapor ile ayni kural). Musteri adi kantara hic gelmez.
 */

const RENK = { dolu: "#10B981", bos: "#F59E0B", alinmayan: "#2A3343" };

const DURUM_STIL: Record<SevkiyatDurumu, { renk: string; zemin: string }> = {
  tamamlandi: { renk: "#34D399", zemin: "rgba(16,185,129,0.12)" },
  yukleniyor: { renk: "#FBBF24", zemin: "rgba(245,158,11,0.12)" },
  dolum_bekliyor: { renk: "#FBBF24", zemin: "rgba(245,158,11,0.08)" },
  baslamadi: { renk: "#94A3B8", zemin: "rgba(148,163,184,0.10)" },
};

function eslesir(s: SevkiyatOzeti, q: string) {
  if (!q) return true;
  const ic = (v: string | null | undefined) => (v || "").toLowerCase().includes(q);
  return ic(s.dosya_no) || ic(s.musteri_kodu) || ic(s.cuval) || s.konteynerler.some((k) => ic(k.konteyner_no) || ic(k.muhur_no));
}

export function KantarSevkiyatDurumu({ sevkiyatlar, arama }: { sevkiyatlar: SevkiyatOzeti[]; arama: string }) {
  const [acik, setAcik] = useState<Record<string, boolean>>({});
  // Bolum gizlenebilir (telefonda DBA listesine hizli inmek icin); tercih bu cihazda hatirlanir
  const [gizli, setGizli] = useState(false);
  useEffect(() => { try { setGizli(window.localStorage.getItem("kantar-sevkiyat-gizli") === "1"); } catch { /* depolama kapali */ } }, []);
  const gizliDegistir = () => setGizli((g) => { try { window.localStorage.setItem("kantar-sevkiyat-gizli", g ? "0" : "1"); } catch { /* depolama kapali */ } return !g; });
  const q = arama.trim().toLowerCase();
  const liste = sevkiyatlar.filter((s) => eslesir(s, q));
  if (sevkiyatlar.length === 0) return null;

  const toplam = sevkiyatlar.reduce((t, s) => t + s.toplam, 0);
  const dolu = sevkiyatlar.reduce((t, s) => t + s.dolu, 0);

  return (
    <div className="space-y-3" aria-labelledby="kantar-sevkiyat-durumu">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h2 id="kantar-sevkiyat-durumu" className="text-sm font-bold flex items-center gap-2 text-white">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: RENK.dolu }} /> Sevkiyat Durumu
          <span className="text-xs font-normal" style={{ color: TEXT_MUTED }}>({sevkiyatlar.length} açık sevkiyat)</span>
        </h2>
        <div className="flex items-center gap-3">
          <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
            Toplam <span className="font-semibold text-white">{dolu}</span> / {toplam} konteyner dolu
          </p>
          <button type="button" onClick={gizliDegistir} aria-expanded={!gizli}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium hover:bg-white/5 transition-colors"
            style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
            {gizli ? "Göster" : "Gizle"} <ChevronDown size={12} className={`transition-transform ${gizli ? "" : "rotate-180"}`} />
          </button>
        </div>
      </div>

      {gizli ? null : liste.length === 0 ? (
        <div className="rounded-xl border p-4 text-center text-xs" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER, color: TEXT_MUTED }}>
          Aramayla eşleşen sevkiyat yok.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
          {liste.map((s) => {
            const durum = DURUM_STIL[s.durum];
            const yuzde = (n: number) => (s.toplam > 0 ? (n / s.toplam) * 100 : 0);
            const acikMi = !!acik[s.dosya_id];
            const konteynerler = q ? s.konteynerler.filter((k) => eslesir({ ...s, konteynerler: [k], dosya_no: "", musteri_kodu: "", cuval: "" }, q)) : s.konteynerler;
            const gorunen = q && konteynerler.length ? konteynerler : s.konteynerler;
            return (
              <div key={s.dosya_id} className="rounded-xl border overflow-hidden flex flex-col" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <button
                  type="button"
                  onClick={() => setAcik((a) => ({ ...a, [s.dosya_id]: !a[s.dosya_id] }))}
                  aria-expanded={acikMi}
                  aria-controls={`sevkiyat-${s.dosya_id}`}
                  className="block w-full text-left p-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold font-mono text-white">{s.dosya_no}</span>
                        <span className="px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold tracking-wider text-white"
                          style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }} title="Müşteri kodu (proformadaki)">
                          {s.musteri_kodu}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] truncate" style={{ color: TEXT_MUTED }} title={s.cuval}>
                        Çuval: <span className="text-white font-medium">{s.cuval}</span>
                      </p>
                    </div>
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" style={{ color: durum.renk, backgroundColor: durum.zemin }}>
                      {DURUM_ETIKETI[s.durum]}
                    </span>
                  </div>

                  {s.toplam === 0 ? (
                    <p className="mt-3 text-sm font-semibold" style={{ color: TEXT_MUTED }}>Rezervasyon bekleniyor</p>
                  ) : (
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold" style={{ color: s.dolu > 0 ? RENK.dolu : "#E2E8F0" }}>{s.dolu}</span>
                    <span className="text-sm font-semibold" style={{ color: TEXT_MUTED }}>/ {s.toplam}</span>
                    <span className="text-[11px] ml-1" style={{ color: TEXT_MUTED }}>konteyner dolu</span>
                  </div>
                  )}

                  <div className="mt-2 h-2 rounded-full overflow-hidden flex" style={{ backgroundColor: RENK.alinmayan }}
                    role="img" aria-label={`${s.dolu} dolu, ${s.bos} boş ekipman, ${s.alinmayan} alınmamış`}>
                    {s.dolu > 0 && <span style={{ width: `${yuzde(s.dolu)}%`, backgroundColor: RENK.dolu }} />}
                    {s.bos > 0 && <span style={{ width: `${yuzde(s.bos)}%`, backgroundColor: RENK.bos, marginLeft: s.dolu > 0 ? 2 : 0 }} />}
                  </div>
                  <div className="mt-2 flex items-center gap-3 flex-wrap text-[10.5px]" style={{ color: TEXT_MUTED }}>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: RENK.dolu }} />Dolu {s.dolu}</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ backgroundColor: RENK.bos }} />Boş ekipman {s.bos}</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm border" style={{ backgroundColor: RENK.alinmayan, borderColor: "#3A4357" }} />Alınmamış {s.alinmayan}</span>
                    <span className="ml-auto inline-flex items-center gap-1 font-medium" style={{ color: "#CBD5E1" }}>
                      {s.eklenen > 0 ? `Konteynerler (${s.eklenen})` : "Konteyner eklenmedi"}
                      {s.eklenen > 0 && <ChevronDown size={13} className={`transition-transform ${acikMi ? "rotate-180" : ""}`} />}
                    </span>
                  </div>
                </button>

                {acikMi && s.eklenen > 0 && (
                  <div id={`sevkiyat-${s.dosya_id}`} className="border-t" style={{ borderColor: CARD_BORDER }}>
                    <table className="w-full text-left border-collapse">
                      <thead style={{ backgroundColor: ROW_HEADER_BG }}>
                        <tr>
                          <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Konteyner</th>
                          <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Mühür</th>
                          <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Çuval</th>
                          <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gorunen.map((k) => (
                          <tr key={k.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                            <td className="px-4 py-1.5 text-[11px] font-mono font-semibold text-white whitespace-nowrap">{k.konteyner_no || "—"}</td>
                            <td className="px-2 py-1.5 text-[11px] font-mono whitespace-nowrap" style={{ color: TEXT_MUTED }}>{k.muhur_no || "—"}</td>
                            <td className="px-2 py-1.5 text-[11px] truncate max-w-[110px]" style={{ color: "#CBD5E1" }} title={k.marka || s.cuval}>
                              {(k.marka || "").replace(/\bBRAND\b/gi, "").trim().toUpperCase() || s.cuval}
                            </td>
                            <td className="px-4 py-1.5 text-right whitespace-nowrap">
                              {k.dba_dosya_url ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#34D399" }}>
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: RENK.dolu }} /> Dolu
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#FBBF24" }}>
                                  <Package size={11} /> Boş · DBA bekliyor
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
