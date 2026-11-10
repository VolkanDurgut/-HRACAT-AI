"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Mail, MessageCircle, PackageCheck, RefreshCw, Search, Store, Upload, Users } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { EmptyState } from "@/components/empty-state";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { UlkeBayrak } from "@/components/ulke-bayrak";
import { FuarYukle } from "@/components/pazar/fuar-yukle";
import { FirmaKarti } from "@/components/pazar/firma-karti";
import { useAuth } from "@/lib/auth-context";
import {
  pazarMusteriSiparisleri, pazarVerisiOku, ulkeGosterim,
  type MusteriSiparisVerisi, type PazarFirma, type PazarKatilim, type PazarKisi, type PazarVerisi,
} from "@/lib/pazar/veri";
import { musteriDurumu, type MusteriDurumu } from "@/lib/pazar/musteri";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";

/**
 * PAZAR (UNEX Satis) - 3.1 (fuar listesi) + 3.2 (10.11.2026).
 * Kullanici: "Bizim kendi musterilerimiz farkli bir kartta olmali (aktif / siparissiz); yaninda su an
 * siparisleri var mi yok mu gorebilmeliyiz. Mevcut siparisi yoksa ilk bunlardan baslamaliyiz."
 *  - Ustte "Musterilerimiz": Aktif (acik dosya / devam eden siparis) | Siparissiz (en uzun suredir siparissiz once).
 *  - Altta "Potansiyel musteriler" (fuar listeleri).
 *  - Satira tiklayinca firma karti (components/pazar/firma-karti.tsx).
 * Musteri = rezervasyonu girilmis dosyasi olan alici (migration 20261110050000).
 * Yetki: "pazar" (yalniz execution@ ve bbt@). Veri: lib/pazar/veri.ts (okuma; yazma RPC).
 */

type MusteriFiltre = "siparissiz" | "aktif" | "hepsi";
const SAYFA_BOYU = 50;

function Rozet({ tur }: { tur: "aktif" | "siparissiz" | "potansiyel" }) {
  const s = tur === "aktif" ? { bg: "rgba(16,185,129,0.14)", c: "#6EE7B7", t: "Aktif" } : tur === "siparissiz" ? { bg: "rgba(251,191,36,0.14)", c: "#FCD34D", t: "Siparişsiz" } : { bg: "rgba(96,165,250,0.14)", c: "#93C5FD", t: "Potansiyel" };
  return <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium whitespace-nowrap" style={{ backgroundColor: s.bg, color: s.c }} data-durum={tur}>{s.t}</span>;
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

function UlkeHucresi({ ulke, kaynak }: { ulke: string | null; kaynak?: string | null }) {
  if (!ulke) return <span style={{ color: "#5B6576" }}>—</span>;
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color: "#C9D1DC" }} title={kaynak === "telefon" ? "Telefon kodundan bulundu" : kaynak === "eposta" ? "E-posta uzantısından bulundu" : kaynak === "siparis" ? "Siparişlerden bulundu" : undefined}>
      <UlkeBayrak ulke={ulke} /> {ulkeGosterim(ulke)}
      {kaynak === "telefon" && <span className="text-[10px]" style={{ color: TEXT_MUTED }}>·tel</span>}
      {kaynak === "eposta" && <span className="text-[10px]" style={{ color: TEXT_MUTED }}>·e-posta</span>}
    </span>
  );
}

function YetkiliHucresi({ kisiler }: { kisiler: PazarKisi[] }) {
  const ilk = kisiler.find((k) => k.eposta && k.eposta_gecerli) || kisiler[0];
  if (!ilk) return <span className="text-xs" style={{ color: "#FBBF24" }}>Yetkili yok</span>;
  return (
    <div className="text-xs leading-relaxed">
      {ilk.ad && <p className="text-white">{ilk.ad}</p>}
      {ilk.eposta && <p className="flex items-center gap-1 break-all" style={{ color: ilk.eposta_gecerli ? "#C9D1DC" : "#FBBF24" }}><Mail size={11} className="shrink-0" />{ilk.eposta}{!ilk.eposta_gecerli && " (düzeltilmeli)"}</p>}
      {ilk.whatsapp && <p className="flex items-center gap-1" style={{ color: "#C9D1DC" }}><MessageCircle size={11} className="shrink-0" />+{ilk.whatsapp}</p>}
      {kisiler.length > 1 && <p style={{ color: TEXT_MUTED }}>+{kisiler.length - 1} kişi</p>}
    </div>
  );
}

const tarihTR = (t: string | null) => (t ? new Date(t).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—");

function PazarIcerik() {
  const { yetkiler } = useAuth();
  const yetkili = !!yetkiler.sayfa_yetkileri.pazar;
  const [veri, setVeri] = useState<PazarVerisi | null>(null);
  const [siparis, setSiparis] = useState<MusteriSiparisVerisi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yukleAcik, setYukleAcik] = useState(false);
  const [musteriFiltre, setMusteriFiltre] = useState<MusteriFiltre>("siparissiz");
  const [arama, setArama] = useState("");
  const [ulke, setUlke] = useState("");
  const [goster, setGoster] = useState(SAYFA_BOYU);
  const [acikFirma, setAcikFirma] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    setHata(null);
    try {
      const [v, s] = await Promise.all([pazarVerisiOku(), pazarMusteriSiparisleri()]);
      setVeri(v);
      setSiparis(s);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Veri okunamadı.");
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { if (yetkili) yukle(); }, [yetkili, yukle]);
  useEffect(() => { setGoster(SAYFA_BOYU); }, [arama, ulke]);

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
  const durumlar = useMemo(() => {
    const m = new Map<string, MusteriDurumu>();
    if (!siparis) return m;
    const bugun = new Date();
    for (const f of firmalar) if (f.durum === "musteri") m.set(f.id, musteriDurumu(f, siparis, bugun));
    return m;
  }, [firmalar, siparis]);

  const musteriler = useMemo(() => firmalar.filter((f) => f.durum === "musteri"), [firmalar]);
  const potansiyeller = useMemo(() => firmalar.filter((f) => f.durum === "potansiyel"), [firmalar]);
  const aktifSay = musteriler.filter((f) => durumlar.get(f.id)?.aktif).length;
  const siparissizSay = musteriler.length - aktifSay;

  const musteriListesi = useMemo(() => {
    return musteriler
      .filter((f) => {
        const a = !!durumlar.get(f.id)?.aktif;
        return musteriFiltre === "hepsi" || (musteriFiltre === "aktif" ? a : !a);
      })
      .sort((a, b) => {
        const da = durumlar.get(a.id), db = durumlar.get(b.id);
        // Siparissiz: en uzun suredir siparissiz once (gunluk mailde ilk aday)
        if (!da?.aktif && !db?.aktif) return (db?.siparissizGun ?? -1) - (da?.siparissizGun ?? -1) || a.ad.localeCompare(b.ad, "tr");
        if (!!da?.aktif !== !!db?.aktif) return da?.aktif ? 1 : -1;
        return a.ad.localeCompare(b.ad, "tr");
      });
  }, [musteriler, durumlar, musteriFiltre]);

  const ulkeler = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of potansiyeller) if (f.ulke) m.set(f.ulke, (m.get(f.ulke) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"));
  }, [potansiyeller]);
  const tumUlkeler = useMemo(() => Array.from(new Set(firmalar.map((f) => f.ulke).filter((u): u is string => !!u))).sort((a, b) => a.localeCompare(b, "tr")), [firmalar]);

  const potansiyelListesi = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i");
    return potansiyeller
      .filter((f) => !ulke || (ulke === "-" ? !f.ulke : f.ulke === ulke))
      .filter((f) => {
        if (!q) return true;
        if (f.ad.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").includes(q)) return true;
        const qRakam = q.replace(/\D/g, "");
        return (kisiHarita.get(f.id) || []).some((k) => (k.ad || "").toLocaleLowerCase("tr-TR").replace(/ı/g, "i").includes(q) || (k.eposta || "").includes(q) || (qRakam.length >= 4 && k.telefonlar.some((t) => t.includes(qRakam))));
      })
      .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  }, [potansiyeller, ulke, arama, kisiHarita]);

  const acik = acikFirma ? firmalar.find((f) => f.id === acikFirma) || null : null;

  if (!yetkili) return null;

  return (
    <div className="max-w-7xl">
      <SayfaBasligi
        ikon={<Store size={20} />}
        baslik="Pazar"
        aciklama="UNEX Satış · müşterilerimiz ve potansiyel müşteriler"
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

      {yukleAcik && veri && <FuarYukle mevcutFirmalar={veri.firmalar} onKapat={() => setYukleAcik(false)} onAktarildi={yukle} />}

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
            <OzetKarti testId="ozet-aktif" ikon={<PackageCheck size={14} />} etiket="Aktif müşteri" deger={aktifSay} alt="Şu an siparişi var" />
            <OzetKarti testId="ozet-siparissiz" ikon={<Building2 size={14} />} etiket="Siparişsiz müşteri" deger={siparissizSay} alt="İlk aranacaklar" />
            <OzetKarti testId="ozet-potansiyel" ikon={<Users size={14} />} etiket="Potansiyel müşteri" deger={potansiyeller.length} alt={`${tumUlkeler.length} ülke`} />
            <OzetKarti testId="ozet-kisi" ikon={<Mail size={14} />} etiket="Yetkili kişi" deger={veri.kisiler.length}
              alt={`${musteriler.filter((f) => !(kisiHarita.get(f.id) || []).some((k) => k.eposta && k.eposta_gecerli)).length} müşteride e-posta yok`} />
          </div>

          {/* ---- Musterilerimiz ---- */}
          <section className="rounded-xl border mb-6" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="musterilerimiz">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b" style={{ borderColor: CARD_BORDER }}>
              <div className="flex items-center gap-2">
                <Building2 size={16} style={{ color: ACCENT }} />
                <h2 className="text-sm font-semibold text-white">Müşterilerimiz</h2>
                <span className="text-xs" style={{ color: TEXT_MUTED }}>{musteriler.length} firma</span>
              </div>
              <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: CARD_BORDER }} role="tablist">
                {([["siparissiz", `Siparişsiz (${siparissizSay})`], ["aktif", `Aktif (${aktifSay})`], ["hepsi", `Tümü (${musteriler.length})`]] as [MusteriFiltre, string][]).map(([k, etiket]) => (
                  <button key={k} type="button" role="tab" aria-selected={musteriFiltre === k} onClick={() => setMusteriFiltre(k)} data-musteri-filtre={k}
                    className="h-8 px-3 rounded-md text-xs font-medium transition-colors"
                    style={musteriFiltre === k ? { backgroundColor: "rgba(16,185,129,0.16)", color: "#FFFFFF" } : { color: TEXT_MUTED }}>
                    {etiket}
                  </button>
                ))}
              </div>
            </div>
            {musteriListesi.length === 0 ? (
              <div className="p-4"><EmptyState icon={<Building2 size={32} />} title="Bu grupta müşteri yok" description="Diğer sekmeye bakın." /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="musteri-liste">
                  <thead style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
                    <tr className="text-xs">
                      <th className="text-left font-medium px-3 py-2">Firma</th>
                      <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">Ülke</th>
                      <th className="text-left font-medium px-3 py-2">Sipariş</th>
                      <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Yetkili</th>
                    </tr>
                  </thead>
                  <tbody>
                    {musteriListesi.map((f) => {
                      const d = durumlar.get(f.id);
                      return (
                        <tr key={f.id} className="border-t align-top cursor-pointer hover:bg-white/[0.02]" style={{ borderColor: CARD_BORDER }} data-musteri={f.ad} onClick={() => setAcikFirma(f.id)}>
                          <td className="px-3 py-2">
                            <button type="button" className="text-left text-white font-medium leading-snug hover:underline" onClick={(e) => { e.stopPropagation(); setAcikFirma(f.id); }}>{f.ad}</button>
                            <div className="mt-1"><Rozet tur={d?.aktif ? "aktif" : "siparissiz"} /></div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap hidden sm:table-cell"><UlkeHucresi ulke={f.ulke || d?.ulke || null} kaynak={f.ulke ? f.ulke_kaynagi : "siparis"} /></td>
                          <td className="px-3 py-2 text-xs min-w-[200px]" data-siparis-hucre>
                            {d?.aktif ? (
                              <div className="space-y-0.5" style={{ color: "#C9D1DC" }}>
                                {d.acikDosyalar.map((x) => <p key={x.id}><span className="text-white">{x.dosya_no}</span> · {x.yuklenen}/{x.rezKonteyner} konteyner yüklendi</p>)}
                                {d.acikSiparisler.map((x) => <p key={x.id}><span className="text-white">{x.proforma_no}</span> · kalan {x.kalanFcl.toLocaleString("tr-TR")} FCL</p>)}
                              </div>
                            ) : (
                              <p style={{ color: "#FCD34D" }}>
                                {d?.sonSiparis ? <>Son sipariş {tarihTR(d.sonSiparis)} · <b>{d.siparissizGun} gün</b> önce</> : "Sipariş kaydı yok"}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 hidden md:table-cell min-w-[200px]"><YetkiliHucresi kisiler={kisiHarita.get(f.id) || []} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ---- Potansiyel musteriler (fuar) ---- */}
          <section className="rounded-xl border" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="potansiyeller">
            <div className="flex flex-wrap items-center gap-2 p-3 border-b" style={{ borderColor: CARD_BORDER }}>
              <div className="flex items-center gap-2 mr-2">
                <Users size={16} style={{ color: "#93C5FD" }} />
                <h2 className="text-sm font-semibold text-white">Potansiyel müşteriler</h2>
                <span className="text-xs" style={{ color: TEXT_MUTED }}>{potansiyeller.length} firma</span>
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
                {potansiyeller.some((f) => !f.ulke) && <option value="-">Ülkesi bilinmeyen</option>}
              </select>
            </div>

            {potansiyelListesi.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={<Store size={36} />} title={potansiyeller.length ? "Eşleşen firma yok" : "Henüz potansiyel müşteri yok"}
                  description={potansiyeller.length ? "Aramayı veya filtreyi değiştirin." : "Fuar listesini yükleyerek başlayın."} />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="pazar-liste">
                    <thead style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
                      <tr className="text-xs">
                        <th className="text-left font-medium px-3 py-2">Firma</th>
                        <th className="text-left font-medium px-3 py-2">Ülke</th>
                        <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Yetkili</th>
                        <th className="text-left font-medium px-3 py-2 hidden lg:table-cell">Fuar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {potansiyelListesi.slice(0, goster).map((f) => {
                        const fuarlar = katilimHarita.get(f.id) || [];
                        return (
                          <tr key={f.id} className="border-t align-top cursor-pointer hover:bg-white/[0.02]" style={{ borderColor: CARD_BORDER }} data-firma={f.ad} onClick={() => setAcikFirma(f.id)}>
                            <td className="px-3 py-2">
                              <button type="button" className="text-left text-white font-medium leading-snug hover:underline" onClick={(e) => { e.stopPropagation(); setAcikFirma(f.id); }}>{f.ad}</button>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap"><UlkeHucresi ulke={f.ulke} kaynak={f.ulke_kaynagi} /></td>
                            <td className="px-3 py-2 hidden md:table-cell min-w-[220px]"><YetkiliHucresi kisiler={kisiHarita.get(f.id) || []} /></td>
                            <td className="px-3 py-2 hidden lg:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {fuarlar.slice(0, 4).map((k) => (
                                  <span key={k.id} className="inline-flex h-5 items-center px-1.5 rounded text-[11px] whitespace-nowrap" style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "#C9D1DC" }} title={k.etiket}>{[k.yil, k.donem].filter(Boolean).join(" ") || k.etiket}</span>
                                ))}
                                {fuarlar.length > 4 && <span className="text-[11px]" style={{ color: TEXT_MUTED }}>+{fuarlar.length - 4}</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-t text-xs" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                  <span data-testid="pazar-sayac">{Math.min(goster, potansiyelListesi.length)} / {potansiyelListesi.length} firma</span>
                  {goster < potansiyelListesi.length && (
                    <button type="button" onClick={() => setGoster(goster + SAYFA_BOYU)} className="h-8 px-3 rounded-lg border hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }} data-testid="pazar-daha">
                      Daha fazla göster
                    </button>
                  )}
                </div>
              </>
            )}
          </section>

          {acik && (
            <FirmaKarti
              firma={acik}
              kisiler={kisiHarita.get(acik.id) || []}
              katilimlar={katilimHarita.get(acik.id) || []}
              temaslar={(veri.temaslar || []).filter((t) => t.firma_id === acik.id).sort((a, b) => b.olusturma.localeCompare(a.olusturma))}
              durum={durumlar.get(acik.id) || null}
              tumFirmalar={firmalar}
              ulkeler={tumUlkeler}
              onKapat={() => setAcikFirma(null)}
              onDegisti={yukle}
            />
          )}
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
