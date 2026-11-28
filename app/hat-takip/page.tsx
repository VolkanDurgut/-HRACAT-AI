"use client";

/**
 * HAT TAKIP (27.11.2026, Asama 1 - DENEME MODU). Kullanici: "Ilk once farkli sayfa olarak mi eklemeliyiz ... tereyagindan
 * kil ceker gibi olmali" -> ayri sayfa, SALT OKUMA. Hapag-Lloyd Track & Trace (DCSA, beta) olaylari edge hat-takip ile
 * 15 dakikada bir sirayla yenilenir (hat_* tablolari). Sistem kayitlarina (rezervasyon ETA vb.) DOKUNULMAZ, mail yok.
 * Sistem ETA <-> Hapag ETA farki gosterilir; guncelleme Asama 3'te (onayli). Yetki: "etd_eta".
 */
import React, { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Clock, Radar, RefreshCw, Search, Ship, XCircle } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { EmptyState } from "@/components/empty-state";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { OzetKarti } from "@/components/erp/ozet-karti";
import { TakipDetayi } from "@/components/hat-takip/takip-detayi";
import { useAuth } from "@/lib/auth-context";
import { hatTakipListesiOku, type TakipSatiri } from "@/lib/hat-takip/veri";
import { DURUM_ETIKETI, etaKarsilastir, farkYazi, onceYazi, SINIF_ETIKETI, trGun, trZaman, type FarkSeviyesi } from "@/lib/hat-takip/gorunum";
import { CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
// 28.11.2026 Asama 4: Sefer Ara sekmesi (Hapag-Lloyd Commercial Schedules + musteri gorseli)
import { SekmeCubugu } from "@/components/erp/sekme-cubugu";
import { useUrlSekmesi } from "@/components/erp/use-url-sekmesi";
import { SeferAra } from "@/components/hat-takip/sefer-ara";

type Sekme = "takip" | "sefer";
const sekmeOku = (v: string | null): Sekme | null => (v === "sefer" || v === "takip" ? v : null);

const FARK_RENGI: Record<FarkSeviyesi, string> = { yok: TEXT_MUTED, ayni: "#6EE7B7", uyari: "#FCD34D", kritik: "#FCA5A5" };

function Rozet({ metin, renk }: { metin: string; renk: "yesil" | "sari" | "gri" | "kirmizi" | "mavi" }) {
  const r = { yesil: ["rgba(16,185,129,0.14)", "#6EE7B7"], sari: ["rgba(251,191,36,0.14)", "#FCD34D"], gri: ["rgba(148,163,184,0.12)", "#94A3B8"], kirmizi: ["rgba(239,68,68,0.14)", "#FCA5A5"], mavi: ["rgba(96,165,250,0.14)", "#93C5FD"] }[renk];
  return <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium whitespace-nowrap" style={{ backgroundColor: r[0], color: r[1] }}>{metin}</span>;
}

function HatTakipIcerik() {
  const { yetkiler } = useAuth();
  const yetkili = !!yetkiler.sayfa_yetkileri.etd_eta;
  const [satirlar, setSatirlar] = useState<TakipSatiri[] | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [acik, setAcik] = useState<string | null>(null);
  const [sekme, setSekme] = useUrlSekmesi<Sekme>(sekmeOku, "takip");

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata(null);
    try { setSatirlar(await hatTakipListesiOku()); } catch (e) { setHata(e instanceof Error ? e.message : "Veri okunamadı."); }
    finally { setYukleniyor(false); }
  }, []);
  useEffect(() => { if (yetkili) yukle(); }, [yetkili, yukle]);

  const hesap = useMemo(() => (satirlar || []).map((s) => ({ s, k: etaKarsilastir(s.rezervasyon?.eta ?? null, s.hat_eta) })), [satirlar]);
  const ozet = useMemo(() => {
    const farkli = hesap.filter((x) => x.k.seviye === "uyari" || x.k.seviye === "kritik").length;
    const sorunlu = hesap.filter((x) => x.s.durum === "hata" || x.s.durum === "bulunamadi").length;
    const son = hesap.map((x) => x.s.son_basari).filter(Boolean).sort().pop() ?? null;
    return { toplam: hesap.length, farkli, sorunlu, son };
  }, [hesap]);

  if (!yetkili) return <EmptyState icon={<Radar size={40} />} title="Bu sayfa için yetkiniz yok" description="Hat Takip, ETD/ETA yetkisiyle açılır." />;

  return (
    <div className="max-w-[1500px] mx-auto" data-testid="hat-takip-sayfasi">
      <SayfaBasligi
        ikon={<Radar size={20} />}
        baslik={<span className="inline-flex items-center gap-2">Hat Takip <Rozet metin="Deneme modu" renk="mavi" /></span>}
        aciklama="Hapag-Lloyd booking'lerinin hat verisi ve sefer programı. Yalnızca gösterir; sistemdeki kayıtları değiştirmez."
        sag={sekme !== "takip" ? undefined : (
          <button type="button" onClick={yukle} disabled={yukleniyor} className="h-9 px-3 rounded-lg border text-sm text-white inline-flex items-center gap-2 disabled:opacity-60 hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER }}>
            <RefreshCw size={14} className={yukleniyor ? "animate-spin" : ""} /> Yenile
          </button>
        )}
      />

      <SekmeCubugu varyant="alt-cizgi" ariaLabel="Hat Takip" testId="hat-takip-sekmeleri" secili={sekme} onSec={setSekme}
        ogeler={[
          { deger: "takip", etiket: "Booking Takibi", ikon: <Radar size={14} />, ipucu: "Açık Hapag-Lloyd booking'lerinin ETA ve konteyner hareketleri" },
          { deger: "sefer", etiket: "Sefer Ara", ikon: <Search size={14} />, ipucu: "Rota için gemi listesi; müşteriye görsel olarak gönderilebilir" },
        ]} />

      {sekme === "sefer" ? <SeferAra /> : (<>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <OzetKarti ikon={<Ship size={14} />} etiket="Takipteki booking" deger={ozet.toplam} alt="Hapag-Lloyd · açık sevkiyatlar" testId="hat-ozet-toplam" />
        <OzetKarti ikon={<AlertTriangle size={14} />} etiket="ETA farkı olan" deger={ozet.farkli} alt="sistem ETA ↔ Hapag ETA" testId="hat-ozet-fark" />
        <OzetKarti ikon={<Clock size={14} />} etiket="Son güncelleme" deger={ozet.son ? onceYazi(ozet.son) : "—"} alt="15 dakikada bir, sırayla" testId="hat-ozet-son" />
        <OzetKarti ikon={<XCircle size={14} />} etiket="Sorunlu" deger={ozet.sorunlu} alt="bulunamadı / hata" testId="hat-ozet-sorun" />
      </div>

      {hata && <p className="mb-3 text-sm text-red-300 flex items-center gap-2"><AlertTriangle size={14} /> {hata}</p>}
      {!satirlar && yukleniyor ? (
        <SayfaYukleniyor />
      ) : !hesap.length ? (
        <EmptyState icon={<Radar size={40} />} title="Takipte booking yok" description="Acentesi Hapag olan ve ETA'sı geçmemiş booking'ler burada otomatik görünür." />
      ) : (
        <div className="rounded-xl border overflow-x-auto" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs" style={{ color: TEXT_MUTED, backgroundColor: ROW_HEADER_BG }}>
                <th className="w-8" />
                <th className="text-left font-medium px-3 py-2">Dosya / Booking</th>
                <th className="text-left font-medium px-3 py-2">Gemi / Sefer</th>
                <th className="text-left font-medium px-3 py-2">Varış</th>
                <th className="text-left font-medium px-3 py-2">Sistem ETA</th>
                <th className="text-left font-medium px-3 py-2">Hapag ETA</th>
                <th className="text-left font-medium px-3 py-2">Fark</th>
                <th className="text-left font-medium px-3 py-2">Durum</th>
              </tr>
            </thead>
            <tbody>
              {hesap.map(({ s, k }) => {
                const r = s.rezervasyon;
                const ac = acik === s.id;
                const gemiFarkli = !!(r?.gemi_adi && s.gemi && r.gemi_adi.trim().toUpperCase() !== s.gemi.trim().toUpperCase());
                return (
                  <Fragment key={s.id}>
                    <tr className="border-t cursor-pointer hover:bg-white/[0.02]" style={{ borderColor: CARD_BORDER }} onClick={() => setAcik(ac ? null : s.id)} data-testid="hat-takip-satir">
                      <td className="pl-3" style={{ color: TEXT_MUTED }}>{ac ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td className="px-3 py-2">
                        <div className="text-white font-medium">{r?.dosya?.dosya_no || "—"}</div>
                        <div className="text-xs font-mono" style={{ color: TEXT_MUTED }}>{s.booking_no}{r?.konteyner_adedi ? ` · ${r.konteyner_adedi} kont.` : ""}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-white">{s.gemi || r?.gemi_adi || "—"}{s.sefer ? <span style={{ color: TEXT_MUTED }}> {s.sefer}</span> : null}</div>
                        {gemiFarkli && <div className="text-[11px]" style={{ color: "#FCD34D" }}>sistemde: {r?.gemi_adi}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-white">{s.pod || "—"}</div>
                        <div className="text-[11px] truncate max-w-[180px]" style={{ color: TEXT_MUTED }}>{r?.dosya?.varis_limani || ""}</div>
                      </td>
                      <td className="px-3 py-2 text-white whitespace-nowrap">{trGun(r?.eta ?? null)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-white">{trZaman(s.hat_eta)}</div>
                        {s.hat_eta_sinif && <div className="text-[11px]" style={{ color: TEXT_MUTED }}>{SINIF_ETIKETI[s.hat_eta_sinif] || s.hat_eta_sinif}</div>}
                      </td>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap" style={{ color: FARK_RENGI[k.seviye] }}>{farkYazi(k.fark)}</td>
                      <td className="px-3 py-2">
                        <Rozet metin={DURUM_ETIKETI[s.durum] || s.durum} renk={s.durum === "tamam" ? "yesil" : s.durum === "bekliyor" ? "gri" : s.durum === "hata" ? "kirmizi" : "sari"} />
                        <div className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }} title={s.son_hata || undefined}>{onceYazi(s.son_sorgu)}</div>
                      </td>
                    </tr>
                    {ac && (
                      <tr style={{ backgroundColor: "rgba(255,255,255,0.015)" }}>
                        <td colSpan={8}>
                          {s.son_hata && <p className="px-4 pt-3 text-xs text-red-300">{s.son_hata}</p>}
                          <TakipDetayi takipId={s.id} pod={s.pod} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px]" style={{ color: TEXT_MUTED }}>
        Kaynak: Hapag-Lloyd Track &amp; Trace (DCSA, beta). Booking&apos;ler 15 dakikada bir sırayla yenilenir. &quot;Planlanan&quot; ve
        &quot;Tahmini&quot; tarihler hattın güncel planıdır; gerçekleşen olaylar beyaz, planlananlar gri gösterilir. Bu sayfa sistemdeki ETA&apos;yı değiştirmez.
      </p>
      </>)}
    </div>
  );
}

export default function HatTakipSayfasi() {
  return (
    <AppShell>
      <HatTakipIcerik />
    </AppShell>
  );
}
