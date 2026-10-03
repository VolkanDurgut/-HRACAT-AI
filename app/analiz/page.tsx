"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils";
import { supabase, Dosya, Rezervasyon, Konteyner, DOSYA_LISTE_KOLONLARI } from "@/lib/supabase";
import { formatCurrency, formatDateTR } from "@/lib/cutoff-utils";
import { limanAnahtari } from "@/lib/liman-anahtari";
import { varisLimaniSorunu } from "@/lib/varis-limani-kontrol";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { EmptyState } from "@/components/empty-state";
import AppShell from "@/components/app-shell";
import { Users, Package, Loader2, Ship, Globe2, BarChart2, X, Clock, Truck, BarChart3, Anchor, AlertTriangle } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { kalemMiktari } from "@/lib/sayi-oku";

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

function yuzde(pay: number): string {
  const p = pay * 100;
  if (p > 0 && p < 1) return "<%1";
  return `%${Math.round(p)}`;
}

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
    <div className={`rounded-xl border overflow-hidden animate-fade-up ${className}`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: CARD_BORDER }}>
        <div className="flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>{ikon}<span className="text-xs font-semibold text-white">{baslik}</span></div>
        <span className="text-[10px]" style={{ color: TEXT_MUTED }}>{olcuEtiketi}</span>
      </div>
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
    </div>
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
    const sayac: Record<string, { tutar: number; konteyner: number; dosya: number }> = {};
    filtrelenmis.forEach((d) => {
      const t = sevkiyatTarihi(d); if (!t) return;
      const ay = t.slice(0, 7);
      if (!sayac[ay]) sayac[ay] = { tutar: 0, konteyner: 0, dosya: 0 };
      sayac[ay].tutar += d.toplam_tutar || 0;
      sayac[ay].konteyner += konteynerSayisi(d);
      sayac[ay].dosya += 1;
    });
    const aylar = Object.keys(sayac).sort();
    if (aylar.length === 0) return [];
    const sonuc: { anahtar: string; ay: string; tutar: number; konteyner: number; dosya: number }[] = [];
    let [y, m] = aylar[0].split("-").map(Number);
    const [sonY, sonM] = aylar[aylar.length - 1].split("-").map(Number);
    while (y < sonY || (y === sonY && m <= sonM)) {
      const anahtar = `${y}-${String(m).padStart(2, "0")}`;
      const ay = new Date(y, m - 1, 1).toLocaleDateString("tr-TR", { month: "short", year: "numeric" });
      sonuc.push({ anahtar, ay, ...(sayac[anahtar] || { tutar: 0, konteyner: 0, dosya: 0 }) });
      m += 1; if (m > 12) { m = 1; y += 1; }
    }
    return sonuc;
  }, [filtrelenmis]);
  const maxAylik = Math.max(...aylikTrend.map((a) => a.tutar), 0);

  const musteriSatirlari = useMemo<ListeSatiri[]>(() => {
    const s: Record<string, { tutar: number; adet: number; konteyner: number }> = {};
    filtrelenmis.forEach((d) => {
      const m = d.alici_firma?.trim(); if (!m) return;
      if (!s[m]) s[m] = { tutar: 0, adet: 0, konteyner: 0 };
      s[m].tutar += d.toplam_tutar || 0; s[m].adet += 1; s[m].konteyner += konteynerSayisi(d);
    });
    return Object.entries(s).sort((a, b) => b[1].tutar - a[1].tutar).slice(0, 8).map(([ad, v]) => ({
      anahtar: ad, ad, deger: tutarKisa(v.tutar), olcu: v.tutar,
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

  const acenteSatirlari = useMemo<ListeSatiri[]>(() => {
    const s: Record<string, { konteyner: number; adet: number }> = {};
    filtrelenmis.forEach((d) => d.rezervasyonlar.forEach((r) => {
      const a = r.acente_ismi?.trim(); if (!a) return;
      if (!s[a]) s[a] = { konteyner: 0, adet: 0 };
      s[a].konteyner += r.konteyner_adedi || 0; s[a].adet += 1;
    }));
    const toplam = Object.values(s).reduce((t, v) => t + v.konteyner, 0);
    return Object.entries(s).sort((a, b) => b[1].konteyner - a[1].konteyner).slice(0, 8).map(([ad, v]) => ({
      anahtar: ad, ad, deger: `${v.konteyner} kont.`, olcu: v.konteyner,
      pay: toplam > 0 ? v.konteyner / toplam : 0,
      alt: `${v.adet} rezervasyon`,
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
                        <td className="px-4 py-2.5 text-right font-semibold text-white whitespace-nowrap">{formatCurrency(d.tutar, d.paraBirimi)}</td>
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

          {/* Özet kartlar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { etiket: "Toplam Hacim", deger: tutarTam(toplamHacim), alt: `${filtrelenmis.length} dosya` },
              { etiket: "Toplam Konteyner", deger: toplamKonteyner.toLocaleString("tr-TR"), alt: "rezervasyonlardaki adet" },
              { etiket: "Toplam Miktar", deger: toplamMts.toLocaleString("tr-TR", { maximumFractionDigits: 2 }), alt: "metrik ton (MTS)" },
              { etiket: "Tamamlanan Dosya", deger: <>{kapaliSayisi} <span className="text-base font-normal" style={{ color: TEXT_MUTED }}>/ {filtrelenmis.length}</span></>, alt: `${acikSayisi} açık dosya` },
            ].map((k, i) => (
              <div key={k.etiket} className={`rounded-xl border p-4 animate-fade-up stagger-${i + 1}`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>{k.etiket}</p>
                <p className="text-2xl font-bold text-white tabular-nums">{k.deger}</p>
                <p className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{k.alt}</p>
              </div>
            ))}
          </div>

          {/* Aylık hacim */}
          {aylikTrend.length > 0 && (
            <div className="rounded-xl border mb-4 animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: CARD_BORDER }}>
                <div className="flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                  <BarChart2 size={12} />
                  <span className="text-xs font-semibold text-white">Aylık Sevkiyat Hacmi</span>
                </div>
                <span className="text-[10px]" style={{ color: TEXT_MUTED }}>Gemi kalkış ayına göre ({paraBirimi})</span>
              </div>
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-end gap-3" style={{ height: 150 }}>
                  {aylikTrend.map((item) => (
                    <div key={item.anahtar} className="flex-1 h-full flex flex-col items-center justify-end group min-w-0">
                      <div className="relative w-full flex flex-col items-center">
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 text-white text-[10px] px-2 py-1.5 rounded-md border whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none shadow-lg" style={{ backgroundColor: ROW_HEADER_BG, borderColor: CARD_BORDER }}>
                          <p className="font-semibold">{item.ay}</p>
                          <p>{tutarTam(item.tutar)}</p>
                          <p style={{ color: TEXT_MUTED }}>{item.dosya} dosya · {item.konteyner} konteyner</p>
                        </div>
                        <span className="text-[10px] font-semibold text-white mb-1 tabular-nums whitespace-nowrap">{item.tutar > 0 ? tutarKisa(item.tutar) : "—"}</span>
                        <div
                          className="w-full max-w-[56px] rounded-t group-hover:opacity-80 transition-opacity"
                          style={{ height: maxAylik > 0 && item.tutar > 0 ? `${Math.max((item.tutar / maxAylik) * 100, 2)}px` : "1px", backgroundColor: item.tutar > 0 ? ACCENT : CARD_BORDER }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 border-t pt-1.5" style={{ borderColor: CARD_BORDER }}>
                  {aylikTrend.map((item) => (
                    <div key={item.anahtar} className="flex-1 text-center min-w-0">
                      <p className="text-[10px] text-white truncate">{item.ay}</p>
                      <p className="text-[10px] truncate" style={{ color: TEXT_MUTED }}>{item.konteyner} kont.</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 items-start">
            <ListeKarti ikon={<Users size={12} />} baslik="Müşteriler" olcuEtiketi="Hacim · pay" satirlar={musteriSatirlari} />
            <ListeKarti ikon={<Globe2 size={12} />} baslik="Varış Limanları" olcuEtiketi="Konteyner · pay" satirlar={limanSatirlari} />
            <ListeKarti ikon={<Ship size={12} />} baslik="Acenteler" olcuEtiketi="Konteyner · pay" satirlar={acenteSatirlari} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 items-start">
            <ListeKarti ikon={<Anchor size={12} />} baslik="Birim Fiyat (Liman)" olcuEtiketi={`Ortalama ${paraBirimi}/MTS`} satirlar={birimFiyatSatirlari} />
            <ListeKarti ikon={<Truck size={12} />} baslik="Teslim Şekli" olcuEtiketi="Dosya · pay" satirlar={teslimSatirlari} />
            <ListeKarti ikon={<Clock size={12} />} baslik="Ortalama Transit Süresi" olcuEtiketi="ETD → ETA, gün" satirlar={transitSatirlari} bosMetin="ETA girilince hesaplanır" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div className="rounded-xl border overflow-hidden animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: CARD_BORDER }}>
                <div className="flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                  <Ship size={12} />
                  <span className="text-xs font-semibold text-white">Gemi Başına Konteyner</span>
                </div>
                <span className="text-[10px]" style={{ color: TEXT_MUTED }}>Detay için tıklayın</span>
              </div>
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
                          <td className="px-4 py-2.5 text-xs font-medium text-white whitespace-nowrap">{g.ad}</td>
                          <td className="px-4 py-2.5 text-xs text-center tabular-nums" style={{ color: TEXT_MUTED }}>{g.dosyaSayisi}</td>
                          <td className="px-4 py-2.5 text-xs text-right font-semibold text-white tabular-nums">{g.konteyner}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border overflow-hidden animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: CARD_BORDER }}>
                <div className="flex items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                  <Package size={12} />
                  <span className="text-xs font-semibold text-white">Son Tamamlanan Sevkiyatlar</span>
                </div>
                <span className="text-[10px]" style={{ color: TEXT_MUTED }}>Dosyayı açmak için tıklayın</span>
              </div>
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
                          <td className="px-4 py-2.5 text-xs text-right font-semibold text-white whitespace-nowrap tabular-nums">{formatCurrency(d.toplam_tutar, d.para_birimi)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
