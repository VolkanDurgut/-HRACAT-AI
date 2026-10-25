"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils";
import { supabase, Dosya, Rezervasyon, Konteyner, DOSYA_LISTE_KOLONLARI } from "@/lib/supabase";
import { formatDateTR } from "@/lib/cutoff-utils";
import { limanAnahtari } from "@/lib/liman-anahtari";
import { varisLimaniSorunu } from "@/lib/varis-limani-kontrol";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { EmptyState } from "@/components/empty-state";
import AppShell from "@/components/app-shell";
import { Users, Package, Loader2, Ship, Globe2, X, Clock, BarChart3, Anchor, AlertTriangle, Lightbulb } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { kalemMiktari, sayiOku } from "@/lib/sayi-oku";
import { navlunAliciyaAitMi } from "@/lib/teslim-sekli";
import { acenteLimanNavlunlari, BELIRSIZ_LIMAN, type LimanNavlunu } from "@/lib/analiz-acente-navlun";
import { analizOzeti } from "@/lib/analiz-ozet";
import { AylikGrafik, DagilimKarti, GostergeKutusu, OzetKarti, Panel, yuzdeMetni, KATEGORI_RENKLERI, DIGER_RENGI } from "@/components/analiz-paneli";
import { SevkiyatHaritasi, type HaritaHatti, type HaritaLimani } from "@/components/analiz-harita";
import { cikisMerkezi, type CikisMerkezi } from "@/lib/liman-koordinat";
import { ayAdi } from "@/lib/analiz-ozet";

/**
 * Analiz sayfasi - genel duzenleme (01.10.2026).
 *
 * Hesap kurallari (tum kartlarda ayni):
 *  - Konteyner sayisi: rezervasyonlardaki konteyner_adedi toplami; dosyanin
 *    rezervasyonu yoksa eklenmis konteyner sayisi (konteynerSayisi).
 *  - Sevkiyat tarihi: en erken gemi kalkis tarihi (ETD); ETD yoksa dosyanin
 *    olusturma tarihi (sevkiyatTarihi). Yil filtresi, aylik grafik ve
 *    "Son Tamamlanan Sevkiyatlar" sirasi bu tarihe gore.
 *  - Liman: serbest metin farkli yazimlarla girildigi icin lib/liman-anahtari.ts
 *    ile tek ada indirgenerek gruplanir (kayit degismez).
 *  - Yuzdeler "toplamdaki pay"dir; cubuk uzunlugu listedeki en buyuge goredir.
 */

type DosyaFull = Dosya & { rezervasyonlar: Rezervasyon[]; konteynerler: Konteyner[] };
type DurumFiltre = "tumu" | "acik" | "tamamlanan";

type GemiModal = {
  gemiAdi: string;
  dosyalar: { dosyaId: string; dosyaNo: string; aliciFirma: string; varisLimani: string; konteyner: number; tutar: number; paraBirimi: string; etd: string | null; eta: string | null }[];
};

type ListeSatiri = {
  anahtar: string;
  ad: string;
  deger: string;
  /** Cubuk icin ham olcu (listedeki en buyuge oranlanir). */
  olcu: number;
  /** Toplamdaki pay (0-1); verilmezse yuzde gosterilmez. */
  pay?: number;
  alt: string;
  /** Satirin uzerine gelince gosterilecek ek bilgi (orn. birlestirilen yazimlar). */
  ipucu?: string;
};

const TUM_YILLAR = "tum";
const GUN_MS = 24 * 60 * 60 * 1000;

function kapaliMi(d: Dosya): boolean {
  return d.durum === "Kapalı" || d.durum === "Kapali";
}

function konteynerSayisi(d: DosyaFull): number {
  if (d.rezervasyonlar.length > 0) return d.rezervasyonlar.reduce((s, r) => s + (r.konteyner_adedi || 0), 0);
  return d.konteynerler.length;
}

/**
 * Liman listeleri icin varis limani anahtari. Varis limani yukleme limaniyla
 * ayni ya da bir Turkiye limaniysa (FOB proformada yukleme limaninin varis
 * limanina okunmasi - IHR-2026-0076 "AMBARLI") liman bazli listelere GIRMEZ
 * (kural: 03.10.2026, bkz. lib/varis-limani-kontrol.ts).
 */
function analizLimani(d: DosyaFull): string | null {
  const sorun = varisLimaniSorunu(d.varis_limani, [d.yuklenme_limani, ...d.rezervasyonlar.map((r) => r.yuklenme_limani)]);
  if (sorun) return null;
  return limanAnahtari(d.varis_limani);
}

function sevkiyatTarihi(d: DosyaFull): string | null {
  const etdler = d.rezervasyonlar.map((r) => r.gemi_kalkis_tarihi).filter((t): t is string => !!t).sort();
  return etdler[0] || d.olusturma_tarihi || null;
}

function dosyaMts(d: Dosya): number {
  const urunler = (d.urun_detaylari as any[]) || [];
  return urunler.reduce((t: number, u: any) => t + (kalemMiktari(u) || 0), 0);
}

/** "M/V TOR", "MV TOR ", "m/v tor" -> "TOR" (sadece gruplama icin). */
function gemiAnahtari(ham: string | null | undefined): string | null {
  if (!ham || !ham.trim()) return null;
  return ham.trim().replace(/\s+/g, " ").toLocaleUpperCase("tr-TR").replace(/^(M\/V|MV)\s+/, "");
}

/** Tek bicim: components/analiz-paneli.tsx yuzdeMetni. */
const yuzde = yuzdeMetni;

function HBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max((value / max) * 100, 1) : 0;
  return (
    <div className="w-full rounded-full h-1 mt-1" style={{ backgroundColor: CARD_BORDER }}>
      <div className="h-1 rounded-full" style={{ width: `${pct}%`, backgroundColor: ACCENT }} />
    </div>
  );
}

function ListeKarti({ ikon, baslik, olcuEtiketi, satirlar, bosMetin = "Veri yok", className = "" }: {
  ikon: React.ReactNode;
  baslik: string;
  olcuEtiketi: string;
  satirlar: ListeSatiri[];
  bosMetin?: string;
  className?: string;
}) {
  const max = Math.max(...satirlar.map((s) => s.olcu), 0);
  return (
    <Panel ikon={ikon} baslik={baslik} sag={olcuEtiketi} className={className} data-liste={baslik}>
      {satirlar.length === 0 ? (
        <p className="px-4 py-6 text-xs text-center" style={{ color: TEXT_MUTED }}>{bosMetin}</p>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {satirlar.map((s, i) => (
            <div key={s.anahtar} className="px-4 py-2.5 hover:bg-white/[0.03] transition-colors" title={s.ipucu}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold w-3 shrink-0 tabular-nums" style={{ color: TEXT_MUTED }}>{i + 1}</span>
                  <span className="text-xs text-white truncate">{s.ad}</span>
                </div>
                <span className="text-xs font-semibold text-white shrink-0 tabular-nums">
                  {s.deger}
                  {s.pay !== undefined && <span className="font-normal" style={{ color: TEXT_MUTED }}> · {yuzde(s.pay)}</span>}
                </span>
              </div>
              <HBar value={s.olcu} max={max} />
              <p className="text-[10px] mt-1 truncate" style={{ color: TEXT_MUTED }}>{s.alt}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** Dosya tutari kurussuz ("$118.750"): sayfadaki diger tutarlarla ayni bicim. */
function tutarKurussuz(tutar: number | null | undefined, para: string | null | undefined): string {
  if (tutar === null || tutar === undefined) return "—";
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: para || "USD", maximumFractionDigits: 0 }).format(tutar);
  } catch {
    return `${tutar.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ${para || ""}`.trim();
  }
}

/** Konteyner basi navlun: "$1.850", kurusluysa "$1.850,50". Gecersiz para biriminde duz yazi. */
function navlunYazi(tutar: number, para: string): string {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: para, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(tutar);
  } catch {
    return `${tutar.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${para}`;
  }
}

type AcenteSatiri = ListeSatiri & { limanlar: LimanNavlunu[] };

/**
 * Acenteler karti (25.10.2026): ust kisim eskisiyle AYNI (konteyner · pay, cubuk,
 * rezervasyon sayisi); altinda acentenin gittigi her liman icin konteyner basi navlun
 * (son fiyat; degistiyse aralik), lokal masraf ve dosya/konteyner sayisi.
 */
function AcenteNavlunKarti({ satirlar }: { satirlar: AcenteSatiri[] }) {
  const max = Math.max(...satirlar.map((s) => s.olcu), 0);
  return (
    <Panel ikon={<Ship size={12} />} baslik="Acenteler ve Navlun Fiyatları" sag="Konteyner · pay · navlun / kont." data-acente-karti="">
      {satirlar.length === 0 ? (
        <p className="px-4 py-6 text-xs text-center" style={{ color: TEXT_MUTED }}>Veri yok</p>
      ) : (
        // Tam genislik (26.10.2026): acenteler yan yana sutunlarda; uzun tek sutun sayfayi bosluklu birakiyordu.
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 px-4 -mt-px">
          {satirlar.map((s, i) => (
            <div key={s.anahtar} className="py-3 border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }} data-acente={s.ad}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold w-3 shrink-0 tabular-nums" style={{ color: TEXT_MUTED }}>{i + 1}</span>
                  <span className="text-xs text-white truncate">{s.ad}</span>
                </div>
                <span className="text-xs font-semibold text-white shrink-0 tabular-nums">
                  {s.deger}
                  {s.pay !== undefined && <span className="font-normal" style={{ color: TEXT_MUTED }}> · {yuzde(s.pay)}</span>}
                </span>
              </div>
              <HBar value={s.olcu} max={max} />
              <p className="text-[10px] mt-1 truncate" style={{ color: TEXT_MUTED }}>{s.alt}</p>
              {s.limanlar.length > 0 && (
                <ul className="mt-2 space-y-1.5 border-l pl-2.5 ml-1" style={{ borderColor: CARD_BORDER }} aria-label={`${s.ad} liman navlunları`}>
                  {s.limanlar.map((l) => {
                    const aralik = l.enAz !== null && l.enCok !== null && l.enAz !== l.enCok;
                    const ayrinti = [
                      `${l.dosya} dosya · ${l.konteyner} kont.`,
                      aralik ? `${navlunYazi(l.enAz!, l.paraBirimi)}–${navlunYazi(l.enCok!, l.paraBirimi)}` : null,
                      l.lokalSon !== null ? `lokal ${navlunYazi(l.lokalSon, l.paraBirimi)}` : null,
                      l.son !== null && l.navlunsuz > 0 ? `${l.navlunsuz} dosyada navlun yok` : null,
                    ].filter(Boolean).join(" · ");
                    return (
                      <li key={`${l.liman}|${l.paraBirimi}`} data-liman={l.liman}
                        title={l.son !== null ? `${s.ad} → ${l.liman}\nSon navlun: ${navlunYazi(l.son, l.paraBirimi)} / konteyner (${l.sonDosyaNo})${l.ortalama !== null && aralik ? `\nOrtalama: ${navlunYazi(Math.round(l.ortalama * 100) / 100, l.paraBirimi)}` : ""}` : undefined}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={`text-[11px] truncate ${l.liman === BELIRSIZ_LIMAN ? "italic" : "font-medium"}`} style={{ color: l.liman === BELIRSIZ_LIMAN ? TEXT_MUTED : "#CBD5E1" }}>{l.liman}</span>
                          {l.son !== null ? (
                            <span className="text-[11px] font-semibold text-white shrink-0 tabular-nums">
                              {navlunYazi(l.son, l.paraBirimi)}<span className="font-normal" style={{ color: TEXT_MUTED }}> / kont.</span>
                            </span>
                          ) : (
                            <span className="text-[10px] shrink-0" style={{ color: TEXT_MUTED }}>{l.aliciOder ? "Navlun alıcıya ait (FOB)" : "Navlun girilmemiş"}</span>
                          )}
                        </div>
                        <p className="text-[10px] truncate" style={{ color: TEXT_MUTED }}>{ayrinti}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function SecimGrubu<T extends string>({ secenekler, deger, onChange, etiket }: {
  secenekler: { deger: T; ad: string }[];
  deger: T;
  onChange: (v: T) => void;
  etiket: string;
}) {
  return (
    <div role="group" aria-label={etiket} className="flex rounded-lg border text-xs overflow-hidden" style={{ borderColor: CARD_BORDER }}>
      {secenekler.map((s) => (
        <button
          key={s.deger}
          onClick={() => onChange(s.deger)}
          aria-pressed={deger === s.deger}
          className="px-3 py-1.5 transition-colors"
          style={deger === s.deger ? { backgroundColor: ACCENT, color: "white" } : { backgroundColor: CARD_BG, color: TEXT_MUTED }}
        >
          {s.ad}
        </button>
      ))}
    </div>
  );
}

export default function AnalizPage() {
  const { user, companyId, yetkiler, loading: authLoading } = useAuth();
  const router = useRouter();
  const [dosyalar, setDosyalar] = useState<DosyaFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [yilFiltre, setYilFiltre] = useState<string>(TUM_YILLAR);
  const [durumFiltre, setDurumFiltre] = useState<DurumFiltre>("tumu");
  const [gemiModal, setGemiModal] = useState<GemiModal | null>(null);

  const fetchAll = useCallback(async () => {
    if (!user?.id || !companyId) return;
    const { data: dosyaData } = await supabase
      .from("ihracat_dosyalari")
      .select(DOSYA_LISTE_KOLONLARI)
      .eq("company_id", companyId) // Sadece bu şirketin dosyaları analize dahil edilir
      .order("olusturma_tarihi", { ascending: true })
      .returns<Dosya[]>();

    if (!dosyaData || dosyaData.length === 0) { setDosyalar([]); setLoading(false); return; }
    const dosyaIds = dosyaData.map((d: Dosya) => d.id);
    const [{ data: rezData }, { data: kontData }] = await Promise.all([
      supabase.from("rezervasyonlar").select("*").in("dosya_id", dosyaIds).eq("company_id", companyId),
      supabase.from("konteynerler").select("*").in("dosya_id", dosyaIds).eq("company_id", companyId),
    ]);
    setDosyalar(dosyaData.map((d: Dosya) => ({
      ...d,
      rezervasyonlar: (rezData || []).filter((r: Rezervasyon) => r.dosya_id === d.id),
      konteynerler: (kontData || []).filter((k: Konteyner) => k.dosya_id === d.id),
    })));
    setLoading(false);
  }, [user?.id, companyId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    // Yetkiler veritabanindan gelmeden karar verilmez: yuklenirken tum yetkiler
    // gecici olarak kapali gorunur ve tam yetkili kullanici bile sayfayi
    // yenileyince baska sayfaya atiliyordu (duzeltme: 01.10.2026). Hic sayfa
    // yetkisi yoksa yonlendirme yapilmaz - AppShell "Erisim yetkiniz yok"
    // ekranini gosterir (bkz. lib/yetki-utils.ts).
    if (authLoading) return;
    if (!yetkiler.sayfa_yetkileri.analiz) {
      const hedef = ilkErisilebilirSayfa(yetkiler.sayfa_yetkileri);
      if (hedef) router.replace(hedef);
    }
  }, [authLoading, yetkiler, router]);

  // Yil secenekleri veriden gelir (eskiden "2026" sabit yaziliydi).
  const yillar = useMemo(() => {
    const s = new Set<string>();
    dosyalar.forEach((d) => { const t = sevkiyatTarihi(d); if (t) s.add(t.slice(0, 4)); });
    return Array.from(s).sort().reverse();
  }, [dosyalar]);

  const filtrelenmis = useMemo(() => {
    let liste = dosyalar;
    if (durumFiltre === "tamamlanan") liste = liste.filter(kapaliMi);
    if (durumFiltre === "acik") liste = liste.filter((d) => !kapaliMi(d));
    if (yilFiltre !== TUM_YILLAR) liste = liste.filter((d) => sevkiyatTarihi(d)?.startsWith(yilFiltre));
    return liste;
  }, [dosyalar, yilFiltre, durumFiltre]);

  // Para birimi: en cok kullanilan. Birden fazlaysa toplamlar kur cevrimi
  // olmadan yapildigi icin sayfada uyari gosterilir.
  const { paraBirimi, paraBirimleri } = useMemo(() => {
    const s: Record<string, number> = {};
    filtrelenmis.forEach((d) => { const p = d.para_birimi || "USD"; s[p] = (s[p] || 0) + 1; });
    const sirali = Object.entries(s).sort((a, b) => b[1] - a[1]).map(([p]) => p);
    return { paraBirimi: sirali[0] || "USD", paraBirimleri: sirali };
  }, [filtrelenmis]);

  // Kisa tutar: "$769,6 bin", "$1,9 mn". Intl'in tr-TR kisaltmasi ("769,6 B $")
  // Ingilizce okuyan icin "billion" gibi algilanabildigi icin kullanilmadi.
  const tutarKisa = useCallback((deger: number) => {
    const sembol = ({ USD: "$", EUR: "€", GBP: "£", TRY: "₺" } as Record<string, string>)[paraBirimi] ?? `${paraBirimi} `;
    const sayi = (v: number) => v.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
    const mutlak = Math.abs(deger);
    if (mutlak >= 1_000_000) return `${sembol}${sayi(deger / 1_000_000)} mn`;
    if (mutlak >= 1_000) return `${sembol}${sayi(deger / 1_000)} bin`;
    return `${sembol}${sayi(deger)}`;
  }, [paraBirimi]);
  const tutarTam = useCallback((deger: number) => new Intl.NumberFormat("tr-TR", {
    style: "currency", currency: paraBirimi, maximumFractionDigits: 0,
  }).format(deger), [paraBirimi]);

  const toplamHacim = useMemo(() => filtrelenmis.reduce((s, d) => s + (d.toplam_tutar || 0), 0), [filtrelenmis]);
  const toplamKonteyner = useMemo(() => filtrelenmis.reduce((s, d) => s + konteynerSayisi(d), 0), [filtrelenmis]);
  const toplamMts = useMemo(() => filtrelenmis.reduce((s, d) => s + dosyaMts(d), 0), [filtrelenmis]);
  const kapaliSayisi = filtrelenmis.filter(kapaliMi).length;
  const acikSayisi = filtrelenmis.length - kapaliSayisi;

  // Aylik hacim: gemi kalkis ayina gore, aradaki bos aylar da gosterilir.
  const aylikTrend = useMemo(() => {
    const sayac: Record<string, { tutar: number; konteyner: number; mts: number; dosya: number }> = {};
    filtrelenmis.forEach((d) => {
      const t = sevkiyatTarihi(d); if (!t) return;
      const ay = t.slice(0, 7);
      if (!sayac[ay]) sayac[ay] = { tutar: 0, konteyner: 0, mts: 0, dosya: 0 };
      sayac[ay].tutar += d.toplam_tutar || 0;
      sayac[ay].konteyner += konteynerSayisi(d);
      sayac[ay].mts += dosyaMts(d);
      sayac[ay].dosya += 1;
    });
    const aylar = Object.keys(sayac).sort();
    if (aylar.length === 0) return [];
    const sonuc: { anahtar: string; ay: string; tutar: number; konteyner: number; mts: number; dosya: number }[] = [];
    let [y, m] = aylar[0].split("-").map(Number);
    const [sonY, sonM] = aylar[aylar.length - 1].split("-").map(Number);
    while (y < sonY || (y === sonY && m <= sonM)) {
      const anahtar = `${y}-${String(m).padStart(2, "0")}`;
      const ay = new Date(y, m - 1, 1).toLocaleDateString("tr-TR", { month: "short", year: "numeric" });
      sonuc.push({ anahtar, ay, ...(sayac[anahtar] || { tutar: 0, konteyner: 0, mts: 0, dosya: 0 }) });
      m += 1; if (m > 12) { m = 1; y += 1; }
    }
    return sonuc;
  }, [filtrelenmis]);
  // Bu ay (Istanbul): grafikte ileri tarihli ETD aylari "planlanan" cizilir.
  const buAy = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }).slice(0, 7);

  const musteriSatirlari = useMemo<(ListeSatiri & { pay: number; dosya: number })[]>(() => {
    const s: Record<string, { tutar: number; adet: number; konteyner: number }> = {};
    filtrelenmis.forEach((d) => {
      const m = d.alici_firma?.trim(); if (!m) return;
      if (!s[m]) s[m] = { tutar: 0, adet: 0, konteyner: 0 };
      s[m].tutar += d.toplam_tutar || 0; s[m].adet += 1; s[m].konteyner += konteynerSayisi(d);
    });
    return Object.entries(s).sort((a, b) => b[1].tutar - a[1].tutar).map(([ad, v]) => ({
      anahtar: ad, ad, deger: tutarKisa(v.tutar), olcu: v.tutar, dosya: v.adet,
      pay: toplamHacim > 0 ? v.tutar / toplamHacim : 0,
      alt: `${v.adet} dosya · ${v.konteyner} konteyner`,
      ipucu: `${ad}: ${tutarTam(v.tutar)}`,
    }));
  }, [filtrelenmis, toplamHacim, tutarKisa, tutarTam]);

  // Liman bazli toplamlar (birlestirilmis ad ile).
  const limanlar = useMemo(() => {
    const s: Record<string, { tutar: number; konteyner: number; adet: number; mts: number; yazimlar: Set<string>; teslim: Set<string> }> = {};
    filtrelenmis.forEach((d) => {
      const anahtar = analizLimani(d); if (!anahtar) return;
      if (!s[anahtar]) s[anahtar] = { tutar: 0, konteyner: 0, adet: 0, mts: 0, yazimlar: new Set(), teslim: new Set() };
      s[anahtar].tutar += d.toplam_tutar || 0;
      s[anahtar].konteyner += konteynerSayisi(d);
      s[anahtar].adet += 1;
      s[anahtar].mts += dosyaMts(d);
      s[anahtar].yazimlar.add(d.varis_limani!.trim());
      const t = d.teslim_sekli?.trim().toUpperCase(); if (t) s[anahtar].teslim.add(t);
    });
    return s;
  }, [filtrelenmis]);

  const yazimIpucu = (ad: string, yazimlar: Set<string>) =>
    yazimlar.size > 1 ? `${ad} — birleştirilen yazımlar:\n${Array.from(yazimlar).join("\n")}` : Array.from(yazimlar)[0];

  const limanSatirlari = useMemo<ListeSatiri[]>(() =>
    Object.entries(limanlar).sort((a, b) => b[1].konteyner - a[1].konteyner || b[1].tutar - a[1].tutar).slice(0, 8).map(([ad, v]) => ({
      anahtar: ad, ad, deger: `${v.konteyner} kont.`, olcu: v.konteyner,
      pay: toplamKonteyner > 0 ? v.konteyner / toplamKonteyner : 0,
      alt: `${v.adet} dosya · ${tutarKisa(v.tutar)}`,
      ipucu: yazimIpucu(ad, v.yazimlar),
    })), [limanlar, toplamKonteyner, tutarKisa]);

  const birimFiyatSatirlari = useMemo<ListeSatiri[]>(() =>
    Object.entries(limanlar)
      .filter(([, v]) => v.mts > 0 && v.tutar > 0)
      .map(([ad, v]) => ({ ad, v, birim: v.tutar / v.mts }))
      .sort((a, b) => b.birim - a.birim).slice(0, 8)
      .map(({ ad, v, birim }) => ({
        anahtar: ad, ad, deger: `${tutarTam(birim)}/MTS`, olcu: birim,
        alt: `${v.mts.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} MTS${v.teslim.size ? ` · ${Array.from(v.teslim).sort().join(", ")}` : ""}`,
        ipucu: yazimIpucu(ad, v.yazimlar),
      })), [limanlar, tutarTam]);

  const acenteSatirlari = useMemo<AcenteSatiri[]>(() => {
    const s: Record<string, { konteyner: number; adet: number }> = {};
    const navlunGirdileri: Parameters<typeof acenteLimanNavlunlari>[0] = [];
    filtrelenmis.forEach((d) => d.rezervasyonlar.forEach((r) => {
      const a = r.acente_ismi?.trim(); if (!a) return;
      if (!s[a]) s[a] = { konteyner: 0, adet: 0 };
      s[a].konteyner += r.konteyner_adedi || 0; s[a].adet += 1;
      // Navlun dosyada konteyner basi; acente rezervasyonda (25.10.2026)
      const navlun = d.navlun_tutari === null || d.navlun_tutari === undefined ? null : sayiOku(d.navlun_tutari);
      const lokal = d.lokal_masraf_tutari === null || d.lokal_masraf_tutari === undefined ? null : sayiOku(d.lokal_masraf_tutari);
      navlunGirdileri.push({
        acente: a, liman: analizLimani(d), paraBirimi: d.para_birimi || "USD",
        navlun, lokal, konteyner: r.konteyner_adedi || 0,
        tarih: r.gemi_kalkis_tarihi || sevkiyatTarihi(d), dosyaNo: d.dosya_no,
        aliciOder: navlunAliciyaAitMi(d.teslim_sekli),
      });
    }));
    const navlunlar = acenteLimanNavlunlari(navlunGirdileri);
    const toplam = Object.values(s).reduce((t, v) => t + v.konteyner, 0);
    return Object.entries(s).sort((a, b) => b[1].konteyner - a[1].konteyner).slice(0, 8).map(([ad, v]) => ({
      anahtar: ad, ad, deger: `${v.konteyner} kont.`, olcu: v.konteyner,
      pay: toplam > 0 ? v.konteyner / toplam : 0,
      alt: `${v.adet} rezervasyon`,
      limanlar: navlunlar.get(ad) || [],
    }));
  }, [filtrelenmis]);

  const teslimSatirlari = useMemo<ListeSatiri[]>(() => {
    const s: Record<string, { adet: number; konteyner: number }> = {};
    filtrelenmis.forEach((d) => {
      const t = d.teslim_sekli?.trim().toUpperCase(); if (!t) return;
      if (!s[t]) s[t] = { adet: 0, konteyner: 0 };
      s[t].adet += 1; s[t].konteyner += konteynerSayisi(d);
    });
    const toplam = Object.values(s).reduce((t, v) => t + v.adet, 0);
    return Object.entries(s).sort((a, b) => b[1].adet - a[1].adet).map(([tip, v]) => ({
      anahtar: tip, ad: tip, deger: `${v.adet} dosya`, olcu: v.adet,
      pay: toplam > 0 ? v.adet / toplam : 0,
      alt: `${v.konteyner} konteyner`,
    }));
  }, [filtrelenmis]);

  // Transit suresi: ETD -> ETA, liman bazinda ortalama gun (uzundan kisaya).
  const transitSatirlari = useMemo<ListeSatiri[]>(() => {
    const s: Record<string, { toplam: number; adet: number; enAz: number; enCok: number }> = {};
    filtrelenmis.forEach((d) => {
      const liman = analizLimani(d); if (!liman) return;
      d.rezervasyonlar.forEach((r) => {
        if (!r.gemi_kalkis_tarihi || !r.eta) return;
        const gun = Math.round((new Date(r.eta).getTime() - new Date(r.gemi_kalkis_tarihi).getTime()) / GUN_MS);
        if (!(gun > 0 && gun <= 120)) return;
        if (!s[liman]) s[liman] = { toplam: 0, adet: 0, enAz: gun, enCok: gun };
        s[liman].toplam += gun; s[liman].adet += 1;
        s[liman].enAz = Math.min(s[liman].enAz, gun); s[liman].enCok = Math.max(s[liman].enCok, gun);
      });
    });
    return Object.entries(s)
      .map(([ad, v]) => ({ ad, v, ort: Math.round(v.toplam / v.adet) }))
      .sort((a, b) => b.ort - a.ort).slice(0, 8)
      .map(({ ad, v, ort }) => ({
        anahtar: ad, ad, deger: `${ort} gün`, olcu: ort,
        alt: `${v.adet} rezervasyon${v.adet > 1 && v.enAz !== v.enCok ? ` · ${v.enAz}–${v.enCok} gün` : ""}`,
      }));
  }, [filtrelenmis]);

  const gemiler = useMemo(() => {
    const s: Record<string, { konteyner: number; dosyalar: Set<string> }> = {};
    filtrelenmis.forEach((d) => d.rezervasyonlar.forEach((r) => {
      const g = gemiAnahtari(r.gemi_adi); if (!g) return;
      if (!s[g]) s[g] = { konteyner: 0, dosyalar: new Set() };
      s[g].konteyner += r.konteyner_adedi || 0;
      s[g].dosyalar.add(d.id);
    }));
    return Object.entries(s)
      .map(([ad, v]) => ({ ad, konteyner: v.konteyner, dosyaSayisi: v.dosyalar.size }))
      .sort((a, b) => b.konteyner - a.konteyner).slice(0, 8);
  }, [filtrelenmis]);

  const handleGemiClick = (gemiAdi: string) => {
    const ilgili: GemiModal["dosyalar"] = [];
    filtrelenmis.forEach((d) => d.rezervasyonlar.forEach((r) => {
      if (gemiAnahtari(r.gemi_adi) !== gemiAdi) return;
      ilgili.push({
        dosyaId: d.id,
        dosyaNo: d.dosya_no,
        aliciFirma: d.alici_firma || "—",
        varisLimani: limanAnahtari(d.varis_limani) || "—",
        konteyner: r.konteyner_adedi || 0,
        tutar: d.toplam_tutar || 0,
        paraBirimi: d.para_birimi || "USD",
        etd: r.gemi_kalkis_tarihi,
        eta: r.eta,
      });
    }));
    setGemiModal({ gemiAdi, dosyalar: ilgili });
  };

  const sonSevkiyatlar = useMemo(() =>
    filtrelenmis
      .filter(kapaliMi)
      .map((d) => ({ d, tarih: sevkiyatTarihi(d) }))
      .sort((a, b) => (b.tarih || "").localeCompare(a.tarih || ""))
      .slice(0, 8),
    [filtrelenmis]);

  // Gosterge dipnotlari: bu ay (yoksa bugune kadarki son ay) ve liman birim fiyat araligi.
  const referansAy = useMemo(() => aylikTrend.filter((a) => a.anahtar <= buAy).pop() || null, [aylikTrend, buAy]);
  const referansAyEtiketi = referansAy ? (referansAy.anahtar === buAy ? "Bu ay" : ayAdi(referansAy.anahtar)) : null;
  const birimFiyatAraligi = useMemo(() => {
    const birimler = Object.values(limanlar).filter((v) => v.mts > 0 && v.tutar > 0).map((v) => v.tutar / v.mts);
    return birimler.length > 1 ? { enAz: Math.min(...birimler), enCok: Math.max(...birimler) } : null;
  }, [limanlar]);

  // Sevkiyat haritasi (26.10.2026): varis limani anahtari basina toplamlar + cikis -> varis hatlari.
  const haritaLimanlari = useMemo<HaritaLimani[]>(() =>
    Object.entries(limanlar).map(([ad, v]) => ({
      ad,
      konteyner: v.konteyner,
      dosya: v.adet,
      satirlar: [
        `Hacim ${tutarKisa(v.tutar)}`,
        v.mts > 0 && v.tutar > 0 ? `Ortalama ${tutarTam(v.tutar / v.mts)} / MTS` : null,
        v.teslim.size ? `Teslim: ${Array.from(v.teslim).sort().join(", ")}` : null,
      ].filter((x): x is string => !!x),
    })), [limanlar, tutarKisa, tutarTam]);
  const haritaHatlari = useMemo<HaritaHatti[]>(() => {
    const dosyaCikisi = (d: DosyaFull): CikisMerkezi | null =>
      cikisMerkezi(d.rezervasyonlar.map((r) => r.yuklenme_limani).find((y) => !!y?.trim())) || cikisMerkezi(d.yuklenme_limani);
    // Cikisi taninmayan dosya en cok kullanilan cikistan cizilir (tahmin degil: hat temsili, liman verisi aynen)
    const sayac = new Map<string, { m: CikisMerkezi; n: number }>();
    filtrelenmis.forEach((d) => { const c = dosyaCikisi(d); if (c) sayac.set(c.ad, { m: c, n: (sayac.get(c.ad)?.n || 0) + 1 }); });
    const varsayilan = Array.from(sayac.values()).sort((a, b) => b.n - a.n)[0]?.m || null;
    const hat = new Map<string, HaritaHatti>();
    filtrelenmis.forEach((d) => {
      const liman = analizLimani(d); if (!liman) return;
      const c = dosyaCikisi(d) || varsayilan; if (!c) return;
      const anahtar = `${c.ad}|${liman}`;
      const mevcut = hat.get(anahtar);
      hat.set(anahtar, { cikis: c, liman, konteyner: (mevcut?.konteyner || 0) + konteynerSayisi(d) });
    });
    return Array.from(hat.values());
  }, [filtrelenmis]);
  const teslimSeridi = teslimSatirlari.map((t, i) => ({ ad: t.ad, pay: t.pay ?? 0, renk: KATEGORI_RENKLERI[i] ?? DIGER_RENGI }));

  // Otomatik Ozet (26.10.2026): ekrandaki kartlarla AYNI toplamlardan kurala gore cumleler.
  const ozetCumleleri = useMemo(() => {
    const m = musteriSatirlari[0];
    const l = limanSatirlari[0];
    const a = acenteSatirlari[0];
    const al = a?.limanlar.find((x) => x.son !== null && x.liman !== BELIRSIZ_LIMAN);
    return analizOzeti({
      dosya: filtrelenmis.length,
      acik: acikSayisi,
      konteyner: toplamKonteyner,
      miktarMetni: toplamMts > 0 ? `${toplamMts.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} MTS` : null,
      hacimMetni: tutarKisa(toplamHacim),
      musteri: m ? { ad: m.ad, pay: m.pay, dosya: m.dosya } : null,
      liman: l ? { ad: l.ad, konteyner: l.olcu, pay: l.pay ?? 0 } : null,
      acente: a ? { ad: a.ad, konteyner: a.olcu, navlun: al && al.son !== null ? { liman: al.liman, metin: navlunYazi(al.son, al.paraBirimi) } : null } : null,
      aylar: aylikTrend.map((x) => ({ anahtar: x.anahtar, konteyner: x.konteyner })),
      buAy,
    });
  }, [musteriSatirlari, limanSatirlari, acenteSatirlari, filtrelenmis.length, acikSayisi, toplamKonteyner, toplamMts, tutarKisa, toplamHacim, aylikTrend, buAy]);

  const durumSecenekleri: { deger: DurumFiltre; ad: string }[] = [
    { deger: "tumu", ad: "Tümü" },
    { deger: "acik", ad: "Açık" },
    { deger: "tamamlanan", ad: "Tamamlanan" },
  ];
  const yilSecenekleri = [{ deger: TUM_YILLAR, ad: "Tüm yıllar" }, ...yillar.map((y) => ({ deger: y, ad: y }))];

  const thSinifi = "px-4 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap";

  if (loading) return (
    <AppShell>
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin" style={{ color: ACCENT }} />
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      {/* Gemi Modal */}
      {gemiModal && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setGemiModal(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setGemiModal(null)}>
            <div className="rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col border" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
                <div>
                  <p className="text-sm font-semibold text-white">{gemiModal.gemiAdi}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>
                    {gemiModal.dosyalar.length} rezervasyon · {gemiModal.dosyalar.reduce((s, d) => s + d.konteyner, 0)} konteyner · dosyayı açmak için satıra tıklayın
                  </p>
                </div>
                <button onClick={() => setGemiModal(null)} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }} aria-label="Kapat">
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-auto flex-1">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                    <tr>
                      <th className={`text-left ${thSinifi}`} style={{ color: TEXT_MUTED }}>Dosya</th>
                      <th className={`text-left ${thSinifi}`} style={{ color: TEXT_MUTED }}>Müşteri</th>
                      <th className={`text-left ${thSinifi}`} style={{ color: TEXT_MUTED }}>Liman</th>
                      <th className={`text-center ${thSinifi}`} style={{ color: TEXT_MUTED }}>Kont.</th>
                      <th className={`text-left ${thSinifi}`} style={{ color: TEXT_MUTED }}>ETD</th>
                      <th className={`text-left ${thSinifi}`} style={{ color: TEXT_MUTED }}>ETA</th>
                      <th className={`text-right ${thSinifi}`} style={{ color: TEXT_MUTED }}>Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gemiModal.dosyalar.map((d, i) => (
                      <tr key={i} onClick={() => router.push(`/dosya/${d.dosyaId}`)} className="border-b last:border-0 hover:bg-white/[0.03] cursor-pointer" style={{ borderColor: CARD_BORDER }}>
                        <td className="px-4 py-2.5 font-medium text-white whitespace-nowrap">{d.dosyaNo}</td>
                        <td className="px-4 py-2.5 max-w-[180px] truncate" style={{ color: TEXT_MUTED }} title={d.aliciFirma}>{d.aliciFirma}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{d.varisLimani}</td>
                        <td className="px-4 py-2.5 text-center font-medium text-white">{d.konteyner}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{d.etd ? formatDateTR(d.etd) : "—"}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{d.eta ? formatDateTR(d.eta) : "—"}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-white whitespace-nowrap">{tutarKurussuz(d.tutar, d.paraBirimi)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      <SayfaBasligi
        ikon={<BarChart3 size={20} />}
        baslik="Analiz"
        aciklama={dosyalar.length > 0 ? `${filtrelenmis.length} dosya üzerinden hesaplanıyor` : "Sevkiyat özetleri"}
        sag={dosyalar.length > 0 ? <>
          <SecimGrubu etiket="Dosya durumu" secenekler={durumSecenekleri} deger={durumFiltre} onChange={setDurumFiltre} />
          <SecimGrubu etiket="Yıl" secenekler={yilSecenekleri} deger={yilFiltre} onChange={setYilFiltre} />
        </> : undefined}
      />

      {dosyalar.length === 0 ? (
        <EmptyState icon={<BarChart3 size={48} />} title="Henüz analiz edilecek dosya yok" description="İhracat dosyaları oluşturuldukça bu sayfada özetlenir." />
      ) : filtrelenmis.length === 0 ? (
        <EmptyState icon={<BarChart3 size={48} />} title="Bu filtrede dosya yok" description="Durum veya yıl seçimini değiştirin." />
      ) : (
        <>
          {paraBirimleri.length > 1 && (
            <div className="rounded-xl border px-4 py-3 mb-4 flex items-start gap-2 text-xs" style={{ backgroundColor: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.3)", color: "#FCD34D" }}>
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>Dosyalarda birden fazla para birimi var ({paraBirimleri.join(", ")}). Tutarlar kur çevrimi yapılmadan toplanır; toplamlar {paraBirimi} olarak gösterilir.</span>
            </div>
          )}

          {/* Duzen kurali (26.10.2026, kullanici: "cok tutarsiz"): her satirdaki kartlar AYNI
              yukseklikte (items-stretch), sutunlari kisa/uzun kartlarla doldurup bosluk birakmayiz;
              uzun Acenteler karti tam genislikte. */}
          <div className="grid grid-cols-2 md:grid-cols-3 min-[1400px]:grid-cols-6 gap-3 mb-4">
            <GostergeKutusu sira={1} etiket="Toplam Hacim" deger={tutarTam(toplamHacim)} alt={`${filtrelenmis.length} dosya`}
              seri={aylikTrend.filter((a) => a.anahtar <= buAy).map((a) => a.tutar)}
              dipnot={referansAy ? <>{referansAyEtiketi}: <span className="text-white font-semibold">{tutarKisa(referansAy.tutar)}</span></> : "—"} />
            <GostergeKutusu sira={2} etiket="Toplam Konteyner" deger={toplamKonteyner.toLocaleString("tr-TR")} alt="rezervasyonlardaki adet"
              seri={aylikTrend.filter((a) => a.anahtar <= buAy).map((a) => a.konteyner)}
              dipnot={referansAy ? <>{referansAyEtiketi}: <span className="text-white font-semibold">{referansAy.konteyner.toLocaleString("tr-TR")} konteyner</span></> : "—"} />
            <GostergeKutusu sira={3} etiket="Toplam Miktar" deger={toplamMts.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} alt="metrik ton (MTS)"
              seri={aylikTrend.filter((a) => a.anahtar <= buAy).map((a) => a.mts)}
              dipnot={referansAy ? <>{referansAyEtiketi}: <span className="text-white font-semibold">{referansAy.mts.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} MTS</span></> : "—"} />
            <GostergeKutusu sira={4} etiket="Ortalama Birim Fiyat" deger={toplamMts > 0 && toplamHacim > 0 ? tutarTam(toplamHacim / toplamMts) : "—"} alt={toplamMts > 0 ? `${paraBirimi} / MTS · tüm teslim şekilleri` : "miktar girilmemiş"}
              dipnot={birimFiyatAraligi ? <>Liman aralığı: <span className="text-white font-semibold">{tutarTam(birimFiyatAraligi.enAz)}–{tutarTam(birimFiyatAraligi.enCok)}</span></> : "Liman karşılaştırması yok"} />
            <GostergeKutusu sira={5} etiket="Teslim Şekli"
              deger={teslimSatirlari[0] ? <>{teslimSatirlari[0].ad} <span className="text-base font-normal" style={{ color: TEXT_MUTED }}>{yuzde(teslimSatirlari[0].pay ?? 0)}</span></> : "—"}
              alt={teslimSatirlari.slice(1).map((t) => `${t.ad} ${yuzde(t.pay ?? 0)}`).join(" · ") || "tek teslim şekli"}
              serit={teslimSeridi}
              dipnot={teslimSatirlari[0] ? <>{teslimSatirlari[0].ad}: <span className="text-white font-semibold">{teslimSatirlari[0].deger} · {teslimSatirlari[0].alt}</span></> : "—"} />
            <GostergeKutusu sira={6} etiket="Tamamlanan Dosya" deger={<>{kapaliSayisi} <span className="text-base font-normal" style={{ color: TEXT_MUTED }}>/ {filtrelenmis.length}</span></>} alt={`${acikSayisi} açık dosya`}
              ilerleme={filtrelenmis.length > 0 ? kapaliSayisi / filtrelenmis.length : 0}
              dipnot={<>Tamamlanma: <span className="text-white font-semibold">{yuzde(filtrelenmis.length > 0 ? kapaliSayisi / filtrelenmis.length : 0)}</span></>} />
          </div>

          {/* Grafik + ozet (ornek paneldeki gibi ozet grafigin yaninda) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-4">
            {aylikTrend.length > 0 && (
              <AylikGrafik veri={aylikTrend} buAy={buAy} tutarKisa={tutarKisa} tutarTam={tutarTam} paraBirimi={paraBirimi} ikon={<BarChart3 size={12} />} />
            )}
            <div className={aylikTrend.length > 0 ? "xl:col-span-4 grid" : "xl:col-span-12 grid"}>
              <OzetKarti cumleler={ozetCumleleri} ikon={<Lightbulb size={12} />} />
            </div>
          </div>

          {/* Harita + varis limanlari listesi (ornek paneldeki harita fikri, gercek veriyle) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-4">
            <SevkiyatHaritasi className="xl:col-span-8" limanlar={haritaLimanlari} hatlar={haritaHatlari} />
            <ListeKarti className="xl:col-span-4" ikon={<Globe2 size={12} />} baslik="Varış Limanları" olcuEtiketi="Konteyner · pay" satirlar={limanSatirlari} />
          </div>

          {/* Uc siralama karti: en fazla 8 satir (+ Diger), ayni yukseklik */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
            <DagilimKarti
              ikon={<Users size={12} />}
              baslik="Müşteri Dağılımı"
              olcuEtiketi={`${musteriSatirlari.length} müşteri · hacim payı`}
              satirlar={musteriSatirlari.map((m) => ({ anahtar: m.anahtar, ad: m.ad, deger: m.deger, pay: m.pay, alt: m.alt, ipucu: m.ipucu }))}
              altBilgi={<><span>Toplam {musteriSatirlari.length} müşteri</span><span className="text-white font-semibold">{tutarKisa(toplamHacim)}</span></>}
              data-musteri-dagilimi=""
            />
            <ListeKarti ikon={<Anchor size={12} />} baslik="Birim Fiyat (Liman)" olcuEtiketi={`Ortalama ${paraBirimi}/MTS`} satirlar={birimFiyatSatirlari} />
            <ListeKarti className="md:col-span-2 xl:col-span-1" ikon={<Clock size={12} />} baslik="Ortalama Transit Süresi" olcuEtiketi="ETD → ETA, gün" satirlar={transitSatirlari} bosMetin="ETA girilince hesaplanır" />
          </div>

          <div className="mb-4">
            <AcenteNavlunKarti satirlar={acenteSatirlari} />
          </div>

          {/* Tablolar: genis sutunlar (26.10.2026, 1492 px'te tablolar kesilip yatay kaydirma cikiyordu) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <Panel className="xl:col-span-5" ikon={<Ship size={12} />} baslik="Gemi Başına Konteyner" sag="Detay için tıklayın">
              {gemiler.length === 0 ? (
                <p className="px-4 py-6 text-xs text-center" style={{ color: TEXT_MUTED }}>Veri yok</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                        <th className={`text-left ${thSinifi} w-8`} style={{ color: TEXT_MUTED }}>#</th>
                        <th className={`text-left ${thSinifi}`} style={{ color: TEXT_MUTED }}>Gemi Adı</th>
                        <th className={`text-center ${thSinifi}`} style={{ color: TEXT_MUTED }}>Dosya</th>
                        <th className={`text-right ${thSinifi}`} style={{ color: TEXT_MUTED }}>Konteyner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gemiler.map((g, i) => (
                        <tr key={g.ad} className="border-b last:border-0 hover:bg-white/[0.03] cursor-pointer transition-colors" style={{ borderColor: CARD_BORDER }} onClick={() => handleGemiClick(g.ad)}>
                          <td className="px-4 py-2.5 text-[10px] font-bold tabular-nums" style={{ color: TEXT_MUTED }}>{i + 1}</td>
                          <td className="px-4 py-2.5 text-xs font-medium text-white leading-snug">{g.ad}</td>
                          <td className="px-4 py-2.5 text-xs text-center tabular-nums" style={{ color: TEXT_MUTED }}>{g.dosyaSayisi}</td>
                          <td className="px-4 py-2.5 text-xs text-right font-semibold text-white tabular-nums">{g.konteyner}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel className="xl:col-span-7" ikon={<Package size={12} />} baslik="Son Tamamlanan Sevkiyatlar" sag="Dosyayı açmak için tıklayın">
              {sonSevkiyatlar.length === 0 ? (
                <p className="px-4 py-6 text-xs text-center" style={{ color: TEXT_MUTED }}>Tamamlanan sevkiyat yok</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                        <th className={`text-left ${thSinifi}`} style={{ color: TEXT_MUTED }}>Dosya</th>
                        <th className={`text-left ${thSinifi}`} style={{ color: TEXT_MUTED }}>Müşteri</th>
                        <th className={`text-left ${thSinifi}`} style={{ color: TEXT_MUTED }}>ETD</th>
                        <th className={`text-center ${thSinifi}`} style={{ color: TEXT_MUTED }}>Kont.</th>
                        <th className={`text-right ${thSinifi}`} style={{ color: TEXT_MUTED }}>Tutar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sonSevkiyatlar.map(({ d, tarih }) => (
                        <tr key={d.id} onClick={() => router.push(`/dosya/${d.id}`)} className="border-b last:border-0 hover:bg-white/[0.03] cursor-pointer transition-colors" style={{ borderColor: CARD_BORDER }}>
                          <td className="px-4 py-2.5 text-xs font-medium text-white whitespace-nowrap">{d.dosya_no}</td>
                          <td className="px-4 py-2.5 text-xs max-w-[160px] truncate" style={{ color: TEXT_MUTED }} title={`${d.alici_firma || "—"} · ${limanAnahtari(d.varis_limani) || "—"}`}>{d.alici_firma || "—"}</td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{tarih ? formatDateTR(tarih) : "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-center font-medium text-white tabular-nums">{konteynerSayisi(d)}</td>
                          <td className="px-4 py-2.5 text-xs text-right font-semibold text-white whitespace-nowrap tabular-nums">{tutarKurussuz(d.toplam_tutar, d.para_birimi)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </AppShell>
  );
}
