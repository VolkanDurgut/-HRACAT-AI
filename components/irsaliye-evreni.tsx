"use client";

/**
 * IRSALIYE EVRENI gorunumu (13.11.2026; veri: app/belge/irsaliyeler/page.tsx). Solda o gunun araclari, ortada secili irsaliye
 * havada (gecislerde 3B gelir, suzulur; uzerine gelince durur), arkada siradaki belgeler kart yigini, sagda bilgiler.
 * Klavye: sol / sag ok, Esc. Secili belge adres cubugunda "odak" olarak tutulur (paylasilabilir).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Layers, Loader2, Maximize2, Minimize2, Scale, ShieldAlert, Truck } from "lucide-react";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { ACCENT, CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";

const SEFTALI = "#F4A07C";
const GUN = /^\d{4}-\d{2}-\d{2}$/;

export type Belge = {
  id: string; zaman: string; plaka: string | null; dorse: string | null; netKg: number;
  irsaliyeNo: string | null; irsaliyeTarihi: string | null; yol: string | null;
  karsiTaraf: string; siparisNo: string | null; urun: string | null; depo: string | null; durum: string | null;
};

/** Siparisin kalani (gunluk raporla ayni hesap; app/belge/irsaliyeler/page.tsx kalanlariOku). */
export type SiparisKalani = {
  siparis: string; hedefKg: number | null; hedefArac: number | null; gerceklesenKg: number; arac: number;
  metin: string; durum: "kalan" | "fazla" | "tamam" | "kapandi"; kalanKg: number;
};
const KALAN_RENK: Record<SiparisKalani["durum"], string> = { kalan: "#FBBF24", fazla: "#93C5FD", tamam: "#34D399", kapandi: "#34D399" };

/** ISO -> Turkiye takvim gunu (rapordaki gun ile ayni kural). */
export const trGun = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
};
const saatYaz = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }) : "-");
const tarihSaat = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
const gunYaz = (g: string) => `${g.slice(8, 10)}.${g.slice(5, 7)}.${g.slice(0, 4)}`;
const kg = (x: number) => `${x.toLocaleString("tr-TR")} kg`;
const tonYaz = (x: number) => `${(x / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 })} ton`;


export function IrsaliyeEvreni({ tur, gun, tekTaraf, belgeler, adresler, hata, baslangic, kalanlar = null }: {
  tur: "alis" | "satis" | null; gun: string; tekTaraf: boolean; belgeler: Belge[] | null; adresler: Record<string, string>; hata: string | null; baslangic: number;
  kalanlar?: SiparisKalani[] | null;
}) {
  const [secili, setSecili] = useState(baslangic);
  const [buyuk, setBuyuk] = useState(false);
  useEffect(() => { setSecili(baslangic); }, [baslangic, belgeler]);

  const toplam = useMemo(() => {
    const l = belgeler || [];
    return { arac: l.length, kg: l.reduce((t, b) => t + b.netKg, 0), belge: l.filter((b) => !!b.yol).length, taraflar: Array.from(new Set(l.map((b) => b.karsiTaraf))) };
  }, [belgeler]);

  const git = useCallback((yon: number) => {
    setSecili((i) => {
      const n = belgeler?.length || 0;
      return n ? (i + yon + n) % n : 0;
    });
  }, [belgeler]);

  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); git(1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); git(-1); }
      else if (e.key === "Escape") setBuyuk(false);
    };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [git]);

  // Paylasilabilir adres: secili belge "odak" olarak adres cubugunda (sayfa yeniden yuklenmez)
  useEffect(() => {
    const b = belgeler?.[secili];
    if (!b || typeof window === "undefined") return;
    const u = new URL(window.location.href);
    u.searchParams.set("odak", b.id);
    window.history.replaceState(null, "", u.toString());
  }, [belgeler, secili]);

  // Secili arac kartini listede gorunur tut (klavye / oklarla gecince)
  useEffect(() => {
    const id = belgeler?.[secili]?.id;
    if (id) document.querySelector(`[data-evren-id="${id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [belgeler, secili]);

  const b = belgeler?.[secili] ?? null;
  const kalanToplam = (kalanlar || []).reduce((t, x) => t + x.kalanKg, 0);
  const adres = b?.yol ? adresler[b.yol] : undefined;
  const turAdi = tur === "satis" ? "Yüklenen araçlar · satış" : "Gelen araçlar · alış";
  const tarafEtiketi = tur === "satis" ? "Müşteri" : "Tedarikçi";
  const baslikTaraf = tekTaraf ? toplam.taraflar[0] || "" : toplam.taraflar.length === 1 ? toplam.taraflar[0] : "Tüm " + (tur === "satis" ? "müşteriler" : "tedarikçiler");
  // Arkadaki kart yigini: siradaki en fazla 3 belge
  const yigin = belgeler && belgeler.length > 1 ? [1, 2, 3].filter((d) => d < belgeler.length).map((d) => belgeler[(secili + d) % belgeler.length]) : [];

  return (
    <div className="max-w-[1500px]">
      <SayfaBasligi ikon={<Layers size={20} />} baslik={`İrsaliye Evreni${baslikTaraf ? ` · ${baslikTaraf}` : ""}`}
        aciklama={`${GUN.test(gun) ? gunYaz(gun) : ""} · ${turAdi}`}
        sag={belgeler ? (
          <div className="flex flex-wrap gap-2" data-testid="evren-ozet">
            {[
              { ikon: <Truck size={13} />, ad: "Araç", deger: `${toplam.arac}` },
              { ikon: <Scale size={13} />, ad: "Toplam", deger: tonYaz(toplam.kg) },
              { ikon: <FileText size={13} />, ad: "Belge", deger: `${toplam.belge}` },
              ...(kalanlar ? [{ ikon: <Scale size={13} />, ad: "Kalan", deger: kalanToplam > 0 ? tonYaz(kalanToplam) : kalanlar.length && kalanlar.every((x) => x.durum === "kapandi") ? "Kapandı" : "-", renk: "#FBBF24" }] : []),
            ].map((x: { ikon: React.ReactNode; ad: string; deger: string; renk?: string }) => (
              <div key={x.ad} className="rounded-lg border px-3 py-1.5 min-w-[84px]" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <p className="text-[10px] uppercase tracking-wider inline-flex items-center gap-1" style={{ color: TEXT_MUTED }}>{x.ikon} {x.ad}</p>
                <p className="text-sm font-semibold tabular-nums" style={{ color: x.renk || "#FFFFFF" }}>{x.deger}</p>
              </div>
            ))}
          </div>
        ) : undefined}
      />

      {hata ? (
        <div className="rounded-xl border flex flex-col items-center justify-center text-center py-20 px-6" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="evren-hata">
          <ShieldAlert size={30} className="text-amber-400 mb-3" />
          <p className="text-sm text-white font-medium">{hata}</p>
        </div>
      ) : !belgeler ? (
        <div className="flex justify-center py-24"><Loader2 className="animate-spin" size={26} style={{ color: TEXT_MUTED }} /></div>
      ) : !belgeler.length ? (
        <div className="rounded-xl border py-20 text-center text-sm" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER, color: TEXT_MUTED }} data-testid="evren-bos">
          Bu gün için kayıt bulunamadı ya da görüntüleme yetkiniz yok.
        </div>
      ) : (
        <div className={`grid gap-3 ${buyuk ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_260px]"}`}>
          {/* Araclar */}
          {!buyuk && (
            <div className="rounded-xl border p-2 lg:h-[calc(100vh-190px)] lg:overflow-y-auto flex lg:flex-col gap-2 overflow-x-auto" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="evren-liste">
              {belgeler.map((x, i) => {
                const aktif = i === secili;
                return (
                  <button key={x.id} type="button" onClick={() => setSecili(i)} data-testid="evren-arac" data-evren-id={x.id}
                    className="text-left rounded-lg border px-3 py-2 transition-all shrink-0 w-[220px] lg:w-auto hover:bg-white/5"
                    style={{ borderColor: aktif ? ACCENT : CARD_BORDER, backgroundColor: aktif ? "rgba(16,185,129,0.10)" : "transparent", boxShadow: aktif ? `0 0 0 1px ${ACCENT}, 0 8px 24px -12px ${ACCENT}` : undefined }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] tabular-nums" style={{ color: TEXT_MUTED }}>{saatYaz(x.zaman)}</span>
                      <span className="text-xs font-semibold text-white tabular-nums">{kg(x.netKg)}</span>
                    </div>
                    <p className="text-sm font-semibold text-white mt-0.5">{x.plaka || "-"}</p>
                    <p className="text-[11px] font-mono truncate" style={{ color: x.yol ? "#CBD5E1" : TEXT_MUTED }}>{x.irsaliyeNo || "irsaliye no yok"}{x.yol ? "" : " · belge yok"}</p>
                    {!tekTaraf && <p className="text-[11px] truncate" style={{ color: SEFTALI }}>{x.karsiTaraf}</p>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Sahne: belge havada, arkada siradaki belgeler */}
          <div className={`relative rounded-xl border overflow-hidden ${buyuk ? "h-[calc(100vh-170px)]" : "h-[72vh] lg:h-[calc(100vh-190px)]"}`}
            style={{ borderColor: CARD_BORDER, background: "radial-gradient(ellipse at 50% 35%, #1E3A5F 0%, #0B1220 62%, #070B14 100%)" }} data-testid="evren-sahne">
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(244,160,124,0.10), transparent 55%)" }} />
            <div className="absolute inset-0 flex items-center justify-center p-6 pb-20" style={{ perspective: "1800px" }}>
              <div className="relative h-full" style={{ aspectRatio: buyuk ? undefined : "0.72", width: buyuk ? "min(100%, 1100px)" : undefined, maxWidth: "100%" }}>
                {/* Kart yigini (yalniz gorsel) */}
                {!buyuk && yigin.map((y, d) => (
                  <div key={`${y.id}-${d}`} aria-hidden className="absolute inset-0 rounded-md border transition-all duration-500"
                    style={{
                      transform: `translate3d(${(d + 1) * 26}px, ${-(d + 1) * 14}px, ${-(d + 1) * 90}px) rotateY(${-(d + 1) * 7}deg) rotateZ(${(d + 1) * 1.2}deg)`,
                      background: "linear-gradient(180deg, #F8FAFC, #E2E8F0)", borderColor: "#CBD5E1", opacity: 0.55 - d * 0.14,
                      boxShadow: "0 30px 60px -30px rgba(0,0,0,0.8)", zIndex: 3 - d,
                    }}>
                    <div className="p-4 text-[11px] font-mono text-slate-500">{y.irsaliyeNo || "-"} · {y.plaka || "-"}</div>
                  </div>
                ))}
                {/* Secili belge */}
                <div key={b?.id} className="irsaliye-gel absolute inset-0" style={{ zIndex: 10 }}>
                  <div className="irsaliye-suzul h-full rounded-md overflow-hidden bg-white"
                    style={{ boxShadow: "0 50px 90px -30px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.06), 0 0 60px -10px rgba(244,160,124,0.25)" }}>
                    {!b?.yol ? (
                      <div className="h-full flex flex-col items-center justify-center text-center px-6 bg-slate-50" data-testid="evren-belge-yok">
                        <FileText size={30} className="text-slate-400 mb-2" />
                        <p className="text-sm font-medium text-slate-700">Bu araca irsaliye belgesi yüklenmemiş.</p>
                        <p className="text-xs text-slate-500 mt-1">{b?.irsaliyeNo || ""}</p>
                      </div>
                    ) : !adres ? (
                      <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" size={26} /></div>
                    ) : /\.(jpe?g|png|webp)$/i.test(b.yol) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={adres} alt={b.irsaliyeNo || "İrsaliye"} className="w-full h-full object-contain bg-white" data-testid="evren-gorsel" />
                    ) : (
                      <iframe src={`${adres}#toolbar=0&navpanes=0&view=FitH`} title={b.irsaliyeNo || "İrsaliye"} className="w-full h-full bg-white" data-testid="evren-pdf" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Kontrol cubugu */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full border px-2 py-1.5 backdrop-blur-md"
              style={{ backgroundColor: "rgba(15,23,42,0.75)", borderColor: "rgba(148,163,184,0.25)", zIndex: 20 }} data-testid="evren-kontrol">
              <button type="button" onClick={() => git(-1)} className="p-1.5 rounded-full hover:bg-white/10 text-white" title="Önceki (←)" aria-label="Önceki irsaliye"><ChevronLeft size={18} /></button>
              <span className="px-2 text-xs text-white tabular-nums whitespace-nowrap" data-testid="evren-sira">{secili + 1} / {belgeler.length}</span>
              <button type="button" onClick={() => git(1)} className="p-1.5 rounded-full hover:bg-white/10 text-white" title="Sonraki (→)" aria-label="Sonraki irsaliye"><ChevronRight size={18} /></button>
              <span className="w-px h-5 mx-1 bg-white/15" />
              <button type="button" onClick={() => setBuyuk((v) => !v)} className="p-1.5 rounded-full hover:bg-white/10 text-white" title={buyuk ? "Normal görünüm (Esc)" : "Büyük okuma"} aria-label="Büyük okuma">
                {buyuk ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              {adres && (
                <>
                  <a href={adres} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-full hover:bg-white/10 text-white" title="Yeni sekmede aç" aria-label="Yeni sekmede aç"><ExternalLink size={16} /></a>
                  <a href={adres} download className="p-1.5 rounded-full hover:bg-white/10 text-white" title="İndir" aria-label="İndir"><Download size={16} /></a>
                </>
              )}
            </div>
          </div>

          {/* Bilgiler */}
          {!buyuk && b && (
            <div className="rounded-xl border p-4 space-y-3 lg:h-[calc(100vh-190px)] lg:overflow-y-auto" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER, borderTop: `3px solid ${SEFTALI}` }} data-testid="evren-bilgi">
              <div>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>İrsaliye No</p>
                <p className="text-base font-semibold text-white font-mono break-all">{b.irsaliyeNo || "-"}</p>
              </div>
              {[
                ["Tarih", tarihSaat(b.irsaliyeTarihi || b.zaman)],
                [tarafEtiketi, b.karsiTaraf],
                [tur === "satis" ? "Sipariş" : "Alış", b.siparisNo || "-"],
                ["Ürün", [b.urun, b.depo].filter(Boolean).join(" · ") || "-"],
                ["Plaka", `${b.plaka || "-"}${b.dorse ? ` · Dorse ${b.dorse}` : ""}`],
                ...(b.durum ? [["Durum", b.durum]] : []),
              ].map(([ad, deger]) => (
                <div key={ad}>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>{ad}</p>
                  <p className="text-sm text-white">{deger}</p>
                </div>
              ))}
              <div className="rounded-lg border px-3 py-2" style={{ borderColor: CARD_BORDER }}>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Net</p>
                <p className="text-xl font-bold tabular-nums" style={{ color: ACCENT }}>{kg(b.netKg)}</p>
              </div>
              {kalanlar && kalanlar.length > 0 && (
                <div className="space-y-2" data-testid="evren-kalan">
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>{tur === "satis" ? "Siparişler · kalan" : "Alış siparişleri · kalan"}</p>
                  {kalanlar.map((x) => {
                    const hedef = x.hedefKg ?? null;
                    const oran = hedef && hedef > 0 ? Math.min(100, Math.round((x.gerceklesenKg / hedef) * 100)) : x.hedefArac ? Math.min(100, Math.round((x.arac / x.hedefArac) * 100)) : 0;
                    const aktif = x.siparis === b.siparisNo;
                    return (
                      <div key={x.siparis} className="rounded-lg border px-2.5 py-2" style={{ borderColor: aktif ? SEFTALI : CARD_BORDER, backgroundColor: aktif ? "rgba(244,160,124,0.08)" : "transparent" }}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white">{x.siparis}</span>
                          <span className="text-xs font-bold" style={{ color: KALAN_RENK[x.durum] }}>{x.metin}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(148,163,184,0.2)" }}>
                          <div className="h-full rounded-full" style={{ width: `${oran}%`, backgroundColor: x.durum === "kalan" ? ACCENT : KALAN_RENK[x.durum] }} />
                        </div>
                        <p className="text-[11px] mt-1 tabular-nums" style={{ color: TEXT_MUTED }}>
                          {tonYaz(x.gerceklesenKg)}{hedef ? ` / ${tonYaz(hedef)}` : x.hedefArac ? ` · ${x.arac} / ${x.hedefArac} araç` : ""} · {x.arac} araç
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="pt-2 border-t text-xs space-y-1" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                <p>Günün toplamı: <b className="text-white">{toplam.arac} araç · {tonYaz(toplam.kg)}</b></p>
                <p>Bu araç payı: <b className="text-white">{toplam.kg ? `%${Math.round((b.netKg / toplam.kg) * 100)}` : "-"}</b></p>
                <p className="pt-1">← → ile belgeler arasında geçin. Okurken belgenin üzerine gelin, süzülme durur.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
