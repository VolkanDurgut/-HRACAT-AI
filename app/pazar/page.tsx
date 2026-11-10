"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Globe2, Mail, MessageCircle, RefreshCw, Search, Store, Upload, Users } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { EmptyState } from "@/components/empty-state";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { UlkeBayrak } from "@/components/ulke-bayrak";
import { FuarYukle } from "@/components/pazar/fuar-yukle";
import { useAuth } from "@/lib/auth-context";
import { pazarVerisiOku, ulkeGosterim, type PazarDurum, type PazarFirma, type PazarKatilim, type PazarKisi, type PazarVerisi } from "@/lib/pazar/veri";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";

/**
 * PAZAR (UNEX Satis) - Dalga 3.1 (10.11.2026). Kullanici: "Kontrol Merkezi'nin hemen altinda;
 * potansiyel musterileri AYRI tut, onlarin da siparislerine gore CRM olsun."
 * Bu adimda: ozet, potansiyel / musteri listesi (arama, ulke) ve "Fuar listesi yukle".
 * Musteri karti, gunluk "Bugunku musteriniz" maili, ilk mail sablonlari sonraki adimlarda (3.2+).
 * Yetki: "pazar". Veri: lib/pazar/veri.ts (yalniz okuma; yazma RPC).
 */

type Filtre = "hepsi" | PazarDurum;
const SAYFA_BOYU = 50;

function DurumRozeti({ durum }: { durum: PazarDurum }) {
  const musteri = durum === "musteri";
  return (
    <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium whitespace-nowrap"
      style={musteri ? { backgroundColor: "rgba(96,165,250,0.14)", color: "#93C5FD" } : { backgroundColor: "rgba(16,185,129,0.14)", color: "#6EE7B7" }}
      data-durum={durum}>
      {musteri ? "Müşteri" : "Potansiyel"}
    </span>
  );
}

function OzetKarti({ ikon, etiket, deger, alt, testId }: { ikon: React.ReactNode; etiket: string; deger: number | string; alt?: string; testId: string }) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid={testId}>
      <div className="flex items-center gap-2 text-xs" style={{ color: TEXT_MUTED }}>{ikon}<span>{etiket}</span></div>
      <p className="text-2xl font-semibold text-white tabular-nums mt-1" data-deger>{deger}</p>
      {alt && <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{alt}</p>}
    </div>
  );
}

function fuarKisa(k: PazarKatilim): string {
  return [k.yil, k.donem].filter(Boolean).join(" ") || k.etiket;
}

function PazarIcerik() {
  const { yetkiler } = useAuth();
  const yetkili = !!yetkiler.sayfa_yetkileri.pazar;
  const [veri, setVeri] = useState<PazarVerisi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yukleAcik, setYukleAcik] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>("hepsi");
  const [arama, setArama] = useState("");
  const [ulke, setUlke] = useState("");
  const [goster, setGoster] = useState(SAYFA_BOYU);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    setHata(null);
    try {
      setVeri(await pazarVerisiOku());
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Veri okunamadı.");
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { if (yetkili) yukle(); }, [yetkili, yukle]);
  useEffect(() => { setGoster(SAYFA_BOYU); }, [filtre, arama, ulke]);

  const kisiHarita = useMemo(() => {
    const m = new Map<string, PazarKisi[]>();
    for (const k of veri?.kisiler || []) { const l = m.get(k.firma_id) || []; l.push(k); m.set(k.firma_id, l); }
    return m;
  }, [veri]);
  const katilimHarita = useMemo(() => {
    const m = new Map<string, PazarKatilim[]>();
    for (const k of veri?.katilimlar || []) { const l = m.get(k.firma_id) || []; l.push(k); m.set(k.firma_id, l); }
    m.forEach((l) => l.sort((a, b) => (b.yil || 0) - (a.yil || 0)));
    return m;
  }, [veri]);

  const firmalar = useMemo(() => veri?.firmalar || [], [veri]);
  const sayilar = useMemo(() => ({
    potansiyel: firmalar.filter((f) => f.durum === "potansiyel").length,
    musteri: firmalar.filter((f) => f.durum === "musteri").length,
    ulke: new Set(firmalar.map((f) => f.ulke).filter(Boolean)).size,
    fuarlar: new Set((veri?.katilimlar || []).map((k) => k.etiket)).size,
    kisi: (veri?.kisiler || []).length,
    bozuk: (veri?.kisiler || []).filter((k) => k.eposta && !k.eposta_gecerli).length,
  }), [firmalar, veri]);

  const ulkeler = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of firmalar) if (f.ulke) m.set(f.ulke, (m.get(f.ulke) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"));
  }, [firmalar]);

  const liste = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    return firmalar
      .filter((f) => filtre === "hepsi" || f.durum === filtre)
      .filter((f) => !ulke || (ulke === "-" ? !f.ulke : f.ulke === ulke))
      .filter((f) => {
        if (!q) return true;
        if (f.ad.toLocaleLowerCase("tr-TR").includes(q) || (f.alici_adi || "").toLocaleLowerCase("tr-TR").includes(q)) return true;
        return (kisiHarita.get(f.id) || []).some((k) => (k.ad || "").toLocaleLowerCase("tr-TR").includes(q) || (k.eposta || "").includes(q) || k.telefonlar.some((t) => t.includes(q.replace(/\D/g, "") || "#")));
      })
      .sort((a, b) => (a.durum === b.durum ? a.ad.localeCompare(b.ad, "tr") : a.durum === "musteri" ? -1 : 1));
  }, [firmalar, filtre, ulke, arama, kisiHarita]);

  if (!yetkili) return null;

  return (
    <div className="max-w-7xl">
      <SayfaBasligi
        ikon={<Store size={20} />}
        baslik="Pazar"
        aciklama="UNEX Satış · potansiyel ve mevcut müşteriler"
        sag={
          <>
            <button type="button" onClick={yukle} disabled={yukleniyor} aria-label="Yenile" className="h-9 w-9 inline-flex items-center justify-center rounded-lg border hover:bg-white/[0.04] disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              <RefreshCw size={15} className={yukleniyor ? "animate-spin" : ""} />
            </button>
            <button type="button" onClick={() => setYukleAcik(true)} data-testid="fuar-yukle-ac"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: ACCENT }}>
              <Upload size={16} /> Fuar listesi yükle
            </button>
          </>
        }
      />

      {yukleAcik && veri && (
        <FuarYukle mevcutFirmalar={veri.firmalar} onKapat={() => setYukleAcik(false)} onAktarildi={yukle} />
      )}

      {hata && (
        <div className="flex items-start gap-2 rounded-lg border px-3 py-2 mb-4 text-sm" style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "#FCA5A5" }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{hata}</span>
        </div>
      )}

      {!veri && yukleniyor ? (
        <SayfaYukleniyor />
      ) : veri ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <OzetKarti testId="ozet-potansiyel" ikon={<Users size={14} />} etiket="Potansiyel müşteri" deger={sayilar.potansiyel} alt="Fuar listelerinden" />
            <OzetKarti testId="ozet-musteri" ikon={<Building2 size={14} />} etiket="Müşteri" deger={sayilar.musteri} alt="Siparişi olan alıcılar" />
            <OzetKarti testId="ozet-ulke" ikon={<Globe2 size={14} />} etiket="Ülke" deger={sayilar.ulke} alt={`${sayilar.fuarlar} fuar dönemi`} />
            <OzetKarti testId="ozet-kisi" ikon={<Mail size={14} />} etiket="Yetkili kişi" deger={sayilar.kisi} alt={sayilar.bozuk ? `${sayilar.bozuk} e-posta düzeltilmeli` : "E-postalar düzgün"} />
          </div>

          <div className="rounded-xl border" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="flex flex-wrap items-center gap-2 p-3 border-b" style={{ borderColor: CARD_BORDER }}>
              <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: CARD_BORDER }} role="tablist">
                {([["hepsi", `Tümü (${firmalar.length})`], ["potansiyel", `Potansiyel (${sayilar.potansiyel})`], ["musteri", `Müşteri (${sayilar.musteri})`]] as [Filtre, string][]).map(([k, etiket]) => (
                  <button key={k} type="button" role="tab" aria-selected={filtre === k} onClick={() => setFiltre(k)} data-filtre={k}
                    className="h-8 px-3 rounded-md text-xs font-medium transition-colors"
                    style={filtre === k ? { backgroundColor: "rgba(16,185,129,0.16)", color: "#FFFFFF" } : { color: TEXT_MUTED }}>
                    {etiket}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[180px]">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
                <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Firma, yetkili, e-posta veya telefon ara" data-testid="pazar-ara"
                  className="w-full h-9 pl-8 pr-3 rounded-lg border bg-transparent text-sm text-white placeholder:text-[#5B6576] outline-none focus:border-emerald-500/60" style={{ borderColor: CARD_BORDER }} />
              </div>
              <select value={ulke} onChange={(e) => setUlke(e.target.value)} data-testid="pazar-ulke" aria-label="Ülke"
                className="h-9 px-2 rounded-lg border text-sm text-white outline-none max-w-[220px]" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                <option value="">Tüm ülkeler</option>
                {ulkeler.map(([u, n]) => <option key={u} value={u}>{ulkeGosterim(u)} ({n})</option>)}
                {firmalar.some((f) => !f.ulke) && <option value="-">Ülkesi bilinmeyen</option>}
              </select>
            </div>

            {liste.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={<Store size={36} />} title={firmalar.length ? "Eşleşen firma yok" : "Henüz kayıt yok"}
                  description={firmalar.length ? "Aramayı veya filtreyi değiştirin." : "Fuar listesini yükleyerek başlayın."} />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="pazar-liste">
                    <thead style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
                      <tr className="text-xs">
                        <th className="text-left font-medium px-3 py-2">Firma</th>
                        <th className="text-left font-medium px-3 py-2">Ülke</th>
                        <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">Durum</th>
                        <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Yetkili</th>
                        <th className="text-left font-medium px-3 py-2 hidden lg:table-cell">Fuar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liste.slice(0, goster).map((f: PazarFirma) => {
                        const kisiler = kisiHarita.get(f.id) || [];
                        const ilk = kisiler.find((k) => k.eposta && k.eposta_gecerli) || kisiler[0];
                        const fuarlar = katilimHarita.get(f.id) || [];
                        return (
                          <tr key={f.id} className="border-t align-top" style={{ borderColor: CARD_BORDER }} data-firma={f.ad}>
                            <td className="px-3 py-2">
                              <p className="text-white font-medium leading-snug">{f.ad}</p>
                              <div className="sm:hidden mt-1"><DurumRozeti durum={f.durum} /></div>
                              {f.durum === "musteri" && f.alici_adi && f.alici_adi !== f.ad && <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Alıcı: {f.alici_adi}</p>}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {f.ulke ? (
                                <span className="inline-flex items-center gap-1.5" style={{ color: "#C9D1DC" }} title={f.ulke_kaynagi === "telefon" ? "Telefon kodundan bulundu" : f.ulke_kaynagi === "eposta" ? "E-posta uzantısından bulundu" : undefined}>
                                  <UlkeBayrak ulke={f.ulke} /> {ulkeGosterim(f.ulke)}
                                  {f.ulke_kaynagi === "telefon" && <span className="text-[10px]" style={{ color: TEXT_MUTED }}>·tel</span>}{f.ulke_kaynagi === "eposta" && <span className="text-[10px]" style={{ color: TEXT_MUTED }}>·e-posta</span>}
                                </span>
                              ) : <span style={{ color: "#5B6576" }}>—</span>}
                            </td>
                            <td className="px-3 py-2 hidden sm:table-cell"><DurumRozeti durum={f.durum} /></td>
                            <td className="px-3 py-2 hidden md:table-cell min-w-[220px]">
                              {ilk ? (
                                <div className="text-xs leading-relaxed">
                                  {ilk.ad && <p className="text-white">{ilk.ad}</p>}
                                  {ilk.eposta && <p className="flex items-center gap-1" style={{ color: ilk.eposta_gecerli ? "#C9D1DC" : "#FBBF24" }}><Mail size={11} className="shrink-0" />{ilk.eposta}{!ilk.eposta_gecerli && " (düzeltilmeli)"}</p>}
                                  {ilk.whatsapp && <p className="flex items-center gap-1" style={{ color: "#C9D1DC" }}><MessageCircle size={11} className="shrink-0" />+{ilk.whatsapp}</p>}
                                  {kisiler.length > 1 && <p style={{ color: TEXT_MUTED }}>+{kisiler.length - 1} kişi</p>}
                                </div>
                              ) : <span className="text-xs" style={{ color: "#5B6576" }}>—</span>}
                            </td>
                            <td className="px-3 py-2 hidden lg:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {fuarlar.slice(0, 4).map((k) => (
                                  <span key={k.id} className="inline-flex h-5 items-center px-1.5 rounded text-[11px] whitespace-nowrap" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "#C9D1DC" }} title={k.etiket}>{fuarKisa(k)}</span>
                                ))}
                                {fuarlar.length > 4 && <span className="text-[11px]" style={{ color: TEXT_MUTED }}>+{fuarlar.length - 4}</span>}
                                {fuarlar.length === 0 && <span className="text-xs" style={{ color: "#5B6576" }}>{f.kaynak === "siparis" ? "Sipariş" : "—"}</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-t text-xs" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                  <span data-testid="pazar-sayac">{Math.min(goster, liste.length)} / {liste.length} firma</span>
                  {goster < liste.length && (
                    <button type="button" onClick={() => setGoster(goster + SAYFA_BOYU)} className="h-8 px-3 rounded-lg border hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }} data-testid="pazar-daha">
                      Daha fazla göster
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function PazarSayfasi() {
  return (
    <AppShell>
      <PazarIcerik />
    </AppShell>
  );
}
