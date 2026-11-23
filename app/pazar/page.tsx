"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, BellRing, BookUser, Building2, Globe2, Mail, MessageCircle, RefreshCw, Search, Send, Store, Upload, Users } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { EmptyState } from "@/components/empty-state";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { UlkeBayrak } from "@/components/ulke-bayrak";
import { FuarYukle } from "@/components/pazar/fuar-yukle";
import { FirmaKarti } from "@/components/pazar/firma-karti";
import { AksiyonCubugu, EkipPaneli, SurecHunisi, UlkeTablosu } from "@/components/pazar/takip";
import { ListeYukle } from "@/components/pazar/liste-yukle";
import { aksiyonlar, cevapVerenler, huni, temasIndeksi, ulkeOzeti } from "@/lib/pazar/panel";
import { SekmeCubugu } from "@/components/erp/sekme-cubugu";
import { useUrlSekmesi } from "@/components/erp/use-url-sekmesi";
import { OzetKarti } from "@/components/erp/ozet-karti";
import { hacimMetni, pazarSekmesi, potansiyelFiltrele, VARSAYILAN_SEKME, type PazarSekme } from "@/lib/pazar/gorunum";
import { useAuth } from "@/lib/auth-context";
import {
  pazarAnahtarlari, pazarMusteriSevkiyatlari, pazarMusteriSiparisleri, pazarTakipOku, pazarVerisiOku, ulkeGosterim,
  type MusteriSiparisVerisi, type PazarFirma, type PazarKatilim, type PazarKisi, type PazarVerisi, type TakipVerisi,
} from "@/lib/pazar/veri";
import { LISTE_DURUM_ETIKETI, musteriDurumu, type MusteriDurumu } from "@/lib/pazar/musteri";
import { musteriRitmi, ritimSiralamasi, transitHaritasi, type MusteriRitmi, type SevkiyatVerisi } from "@/lib/pazar/siparis-ritmi";
import { EslesmeyenSerit, RitimHucresi, RitimRozeti, YoldaSatirlari } from "@/components/pazar/siparis-ritmi";
import { bugunTarihIstanbul } from "@/lib/cutoff-utils";
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
 * 10.11.2026 (kullanici: "cok daginik; tutarli, duzenli, kolay okunabilir olmali; Burak Bey onundeki ekranda takibi
 * yapabilmeli"): uc sekme -> Takip (varsayilan; components/pazar/takip.tsx) | Musterilerimiz | Potansiyel.
 * Ust ozet kartlari surec odakli: bugun islenen, surecteki firma, gelen cevap (14 gun), siparissiz musteri.
 * 16.11.2026 (kullanici: "Surecteki firmalar 28 firma ... bunu bu sekilde gormek bize ne sagliyor?"): Takip sekmesi
 * yonetici paneli oldu (components/pazar/takip.tsx + lib/pazar/panel.ts). Ust kartlar: aksiyon bekleyen, son 30 gun
 * ulasilan firma, donus orani, siparissiz musteri. "Rehber listesi yukle" (Safak Bey listesi; components/pazar/liste-yukle.tsx);
 * Potansiyel tablosunda "Kaynak" (fuar donemleri / liste adi) + kaynak filtresi.
 * 16.11.2026 gece (kullanici: Kontrol Merkezi standart mimarisi): sabit ust = dugmeler + 4 kart + Aksiyon Bekleyenler
 * cubugu (yoksa gizli). 4 sekme, adreste ?sekme= (varsayilan operasyon; eski "takip" -> operasyon):
 * Gunluk Operasyon (ekip gorevleri) | Musterilerimiz (+ son siparis, toplam hacim; "Siparissiz" karti bu sekmeyi
 * siparissiz filtresiyle acar) | Potansiyel & Surec (huni ustte, asama tabloyu filtreler) | Pazar Analizi (tum ulkeler,
 * arama + siralama). HESAPLAR AYNI (lib/pazar/panel.ts); filtre / siralama lib/pazar/gorunum.ts.
 */

type MusteriFiltre = "siparissiz" | "aktif" | "hepsi";
const SUREC_ASAMA = new Set(["sorgulandi", "hatirlatma1", "hatirlatma2", "cevap", "teklif", "siparis"]);
const OTUZ_GUN = 30 * 86400000;
const ASAMA_KISA: Record<string, string> = {
  sorgulandi: "Sorgulandı", hatirlatma1: "1. hatırlatma", hatirlatma2: "2. hatırlatma", sessiz: "Sessiz",
  cevap: "Cevap geldi", teklif: "Teklif istedi", siparis: "Sipariş verdi", ilgilenmiyor: "İlgilenmiyor",
};
const SAYFA_BOYU = 50;

function Rozet({ tur }: { tur: "aktif" | "siparissiz" | "potansiyel" }) {
  const s = tur === "aktif" ? { bg: "rgba(16,185,129,0.14)", c: "#6EE7B7", t: "Aktif" } : tur === "siparissiz" ? { bg: "rgba(251,191,36,0.14)", c: "#FCD34D", t: "Siparişsiz" } : { bg: "rgba(96,165,250,0.14)", c: "#93C5FD", t: "Potansiyel" };
  return <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium whitespace-nowrap" style={{ backgroundColor: s.bg, color: s.c }} data-durum={tur}>{s.t}</span>;
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

const gunKisa = (t: string) => new Date(t.length === 10 ? `${t}T12:00:00` : t).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Istanbul" });
const tarihTR = (t: string | null) => (t ? new Date(t).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—");

function PazarIcerik() {
  const { yetkiler } = useAuth();
  const yetkili = !!yetkiler.sayfa_yetkileri.pazar;
  const [veri, setVeri] = useState<PazarVerisi | null>(null);
  const [siparis, setSiparis] = useState<MusteriSiparisVerisi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yukleAcik, setYukleAcik] = useState(false);
  const [listeAcik, setListeAcik] = useState(false);
  const [kaynakFiltre, setKaynakFiltre] = useState("");
  const [musteriFiltre, setMusteriFiltre] = useState<MusteriFiltre>("siparissiz");
  const [arama, setArama] = useState("");
  const [ulke, setUlke] = useState("");
  const [goster, setGoster] = useState(SAYFA_BOYU);
  const [acikFirma, setAcikFirma] = useState<string | null>(null);
  const [sekme, setSekme] = useUrlSekmesi<PazarSekme>(pazarSekmesi, VARSAYILAN_SEKME);
  const [asama, setAsama] = useState<string | null>(null);
  // Adresten ilk sekme (?sekme=ulkeler); degisince adres guncellenir (gecmis kirletilmez) - ERP ortak kit (useUrlSekmesi)
  const [takip, setTakip] = useState<TakipVerisi | null>(null);
  // 23.11.2026 siparis ritmi (Yukleme Plani sevkiyat gecmisi); okunamazsa sayfa eskisi gibi calisir
  const [sevkVeri, setSevkVeri] = useState<SevkiyatVerisi | null>(null);
  const [takipHata, setTakipHata] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    setHata(null);
    try {
      const [v, s, t, sv] = await Promise.all([
        pazarVerisiOku(), pazarMusteriSiparisleri(),
        // Takip okunamazsa sayfanin geri kalani calismaya devam eder
        pazarTakipOku().then((x) => { setTakipHata(null); return x; }).catch((e: unknown) => { setTakipHata(e instanceof Error ? e.message : "Takip okunamadı."); return null; }),
        pazarMusteriSevkiyatlari().catch(() => null),
      ]);
      setVeri(v);
      setSiparis(s);
      setTakip(t);
      setSevkVeri(sv);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Veri okunamadı.");
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { if (yetkili) yukle(); }, [yetkili, yukle]);
  useEffect(() => { setGoster(SAYFA_BOYU); }, [arama, ulke, kaynakFiltre, asama]);

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
  // 23.11.2026 SIPARIS RITMI (lib/pazar/siparis-ritmi.ts): Yukleme Plani'ndan dalga / ortanca aralik / beklenen siparis
  const ritimler = useMemo(() => {
    const m = new Map<string, MusteriRitmi>();
    if (!sevkVeri) return m;
    const bugun = bugunTarihIstanbul();
    const transit = transitHaritasi(sevkVeri.sevkiyatlar);
    for (const f of firmalar) if (f.durum === "musteri") m.set(f.id, musteriRitmi(f.id, sevkVeri, bugun, transit));
    return m;
  }, [firmalar, sevkVeri]);
  const durumlar = useMemo(() => {
    const m = new Map<string, MusteriDurumu>();
    if (!siparis) return m;
    const bugun = new Date();
    for (const f of firmalar) if (f.durum === "musteri") {
      const d = musteriDurumu(f, siparis, bugun);
      // Kullanici (23.11.2026): "Henuz yolda yukleri varsa ... aktif siparis" -> yolda ya da planda ileri tarihli booking de aktif
      const r = ritimler.get(f.id);
      m.set(f.id, r && (r.yolda.length > 0 || r.yuklemede.length > 0) ? { ...d, aktif: true } : d);
    }
    return m;
  }, [firmalar, siparis, ritimler]);

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
        // Siparissiz: 23.11.2026 siparis ritmine gore (gecikti > zamani geldi > yaklasiyor > erken > veri az), sonra en uzun suredir siparissiz
        if (!da?.aktif && !db?.aktif) return ritimSiralamasi(ritimler.get(a.id), ritimler.get(b.id)) || (db?.siparissizGun ?? -1) - (da?.siparissizGun ?? -1) || a.ad.localeCompare(b.ad, "tr");
        if (!!da?.aktif !== !!db?.aktif) return da?.aktif ? 1 : -1;
        return a.ad.localeCompare(b.ad, "tr");
      });
  }, [musteriler, durumlar, musteriFiltre, ritimler]);
  // Siparissiz musterilerin ritim dagilimi (liste ustu ozet)
  const ritimOzeti = useMemo(() => {
    const say = { gecikti: 0, zamani_geldi: 0, yaklasiyor: 0 };
    for (const f of musteriler) {
      if (durumlar.get(f.id)?.aktif) continue;
      const r = ritimler.get(f.id);
      if (r && (r.durum === "gecikti" || r.durum === "zamani_geldi" || r.durum === "yaklasiyor")) say[r.durum] += 1;
    }
    return say;
  }, [musteriler, durumlar, ritimler]);

  const ulkeler = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of potansiyeller) if (f.ulke) m.set(f.ulke, (m.get(f.ulke) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"));
  }, [potansiyeller]);
  const tumUlkeler = useMemo(() => Array.from(new Set(firmalar.map((f) => f.ulke).filter((u): u is string => !!u))).sort((a, b) => a.localeCompare(b, "tr")), [firmalar]);

  // Surec hunisi + ulke ozeti (hesap lib/pazar/panel.ts; eskiden Takip sekmesinin icindeydi)
  const epostali = useMemo(() => new Set((veri?.kisiler || []).filter((k) => k.eposta && k.eposta_gecerli).map((k) => k.firma_id)), [veri]);
  const asamalar = useMemo(() => huni(firmalar, epostali), [firmalar, epostali]);
  const ulkeSatirlari = useMemo(() => ulkeOzeti({ firmalar, temaslar: veri?.temaslar || [], gelenler: takip?.gelenler || [], epostali }), [firmalar, veri, takip, epostali]);
  const seciliAsama = asama ? asamalar.find((a) => a.kod === asama) || null : null;
  const asamaKumesi = useMemo(() => (seciliAsama ? new Set(seciliAsama.firmaIdleri) : null), [seciliAsama]);
  const potansiyelListesi = useMemo(
    // Asama secilince o asamadaki TUM firmalar (huni sayisi ile ayni; musteri olanlar rozetle); secili degilse potansiyeller
    () => potansiyelFiltrele(asamaKumesi ? firmalar : potansiyeller, { ulke, kaynak: kaynakFiltre, arama, asama: asamaKumesi }, kisiHarita),
    [asamaKumesi, firmalar, potansiyeller, ulke, kaynakFiltre, arama, kisiHarita]);
  const listeEtiketleri = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of potansiyeller) if (f.kaynak === "liste" && f.kaynak_etiket) m.set(f.kaynak_etiket, (m.get(f.kaynak_etiket) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "tr"));
  }, [potansiyeller]);

  const acik = acikFirma ? firmalar.find((f) => f.id === acikFirma) || null : null;
  const bugunIso = takip?.bugun || new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
  // Ust kartlar (yonetici paneliyle ayni hesap: lib/pazar/panel.ts)
  const ozet = useMemo(() => {
    const temaslar = veri?.temaslar || [];
    const { ilkUlasma } = temasIndeksi(temaslar);
    const sinir = Date.now() - OTUZ_GUN;
    const ulasilan = new Set(temaslar.filter((t) => ["sorgulama", "hatirlatma1", "hatirlatma2"].includes(t.adim) && Date.parse(t.olusturma) >= sinir).map((t) => t.firma_id));
    const cevap = takip ? Array.from(cevapVerenler(takip.gelenler, ilkUlasma)).filter((id) => ulasilan.has(id)).length : 0;
    const aksiyon = takip ? aksiyonlar({ bugun: takip.bugun, firmalar, temaslar, gelenler: takip.gelenler, gorevler: takip.gorevler }) : [];
    return { ulasilan: ulasilan.size, cevap, aksiyonListesi: aksiyon, aksiyon: aksiyon.length, aksiyonCevap: aksiyon.filter((a) => a.tur === "cevap" || a.tur === "oneri").length };
  }, [veri, takip, firmalar]);
  // 16.11.2026: Ana Panel'den gelen ?musteri=<alici firma> -> firma karti (birlestirme anahtari sunucudan, pazar_anahtar)
  const musteriParam = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!veri) return;
    if (musteriParam.current === undefined) {
      try { musteriParam.current = new URLSearchParams(window.location.search).get("musteri"); } catch { musteriParam.current = null; }
    }
    const ad = musteriParam.current;
    if (!ad) return;
    let iptal = false;
    pazarAnahtarlari([ad]).then(([anahtar]) => {
      if (iptal) return;
      musteriParam.current = null; // bir kez
      if (!anahtar) return;
      const f = firmalar.find((x) => x.anahtar === anahtar || (x.ek_anahtarlar || []).includes(anahtar));
      if (!f) return;
      if (f.durum === "musteri") { setMusteriFiltre("hepsi"); setSekme("musteriler"); }
      setAcikFirma(f.id);
      try { const u = new URL(window.location.href); u.searchParams.delete("musteri"); window.history.replaceState(window.history.state, "", u.toString()); } catch { /* yok */ }
    }).catch(() => { /* bulunamazsa sayfa normal acilir */ });
    return () => { iptal = true; };
  }, [veri, firmalar, setSekme]);

  const ulkeyeGit = useCallback((u: string) => {
    if (u === "-" || potansiyeller.some((f) => f.ulke === u)) { setUlke(u); setArama(""); setKaynakFiltre(""); setAsama(null); setSekme("potansiyel"); }
    else { setMusteriFiltre("hepsi"); setSekme("musteriler"); }
  }, [potansiyeller, setSekme]);

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
            <button type="button" onClick={() => { setListeAcik(true); setYukleAcik(false); }} data-testid="liste-yukle-ac"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium border hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }}>
              <BookUser size={16} /> Rehber listesi yükle
            </button>
            <button type="button" onClick={() => { setYukleAcik(true); setListeAcik(false); }} data-testid="fuar-yukle-ac"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: ACCENT }}>
              <Upload size={16} /> Fuar listesi yükle
            </button>
          </>
        }
      />

      {yukleAcik && veri && <FuarYukle mevcutFirmalar={veri.firmalar} onKapat={() => setYukleAcik(false)} onAktarildi={yukle} />}
      {listeAcik && veri && <ListeYukle mevcutFirmalar={veri.firmalar} mevcutKisiler={veri.kisiler} onKapat={() => setListeAcik(false)} onAktarildi={yukle} />}

      {hata && (
        <div className="flex items-start gap-2 rounded-lg border px-3 py-2 mb-4 text-sm" style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "#FCA5A5" }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{hata}</span>
        </div>
      )}

      {!veri && yukleniyor ? (
        <SayfaYukleniyor />
      ) : veri ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <OzetKarti testId="ozet-aksiyon" ikon={<BellRing size={14} />} etiket="Aksiyon bekleyen" deger={takip ? ozet.aksiyon : "—"} alt={takip ? `${ozet.aksiyonCevap} cevap / sinyal` : "takip okunamadı"} />
            <OzetKarti testId="ozet-ulasilan" ikon={<Send size={14} />} etiket="Ulaşılan firma" deger={ozet.ulasilan} alt="son 30 gün · mail / WhatsApp" />
            <OzetKarti testId="ozet-donus" ikon={<Mail size={14} />} etiket="Dönüş" deger={takip ? ozet.cevap : "—"} alt={ozet.ulasilan ? `dönüş oranı %${Math.round((ozet.cevap / ozet.ulasilan) * 100)}` : "henüz ulaşılan yok"} />
            <OzetKarti testId="ozet-siparissiz" ikon={<Building2 size={14} />} etiket="Siparişsiz müşteri" deger={siparissizSay} alt={`${aktifSay} aktif · ${musteriler.length} müşteri`}
              ipucu="Müşterilerimiz sekmesini siparişsiz filtresiyle aç" onClick={() => { setMusteriFiltre("siparissiz"); setSekme("musteriler"); }} />
          </div>

          {/* Sabit ust: aksiyon bekleyenler (yoksa gizli; acilir-kapanir) */}
          {takip ? (
            <AksiyonCubugu aksiyon={ozet.aksiyonListesi} firmalar={firmalar} ekip={takip.ekip} onFirma={setAcikFirma} />
          ) : (
            <div className="rounded-xl border px-4 py-2.5 mb-4 text-xs" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER, color: "#FCA5A5" }} data-testid="takip-hata">{takipHata || "Takip bilgisi okunamadı."}</div>
          )}

          <SekmeCubugu testId="pazar-sekmeler" secili={sekme} onSec={setSekme} ogeler={[
            { deger: "operasyon", etiket: "Günlük Operasyon", ikon: <Activity size={14} /> },
            { deger: "musteriler", etiket: `Müşterilerimiz (${musteriler.length})`, ikon: <Building2 size={14} /> },
            { deger: "potansiyel", etiket: `Potansiyel & Süreç (${potansiyeller.length})`, ikon: <Users size={14} /> },
            { deger: "ulkeler", etiket: `Pazar Analizi (${ulkeSatirlari.filter((u) => u.ulke !== "—").length} ülke)`, ikon: <Globe2 size={14} /> },
          ]} />

          {/* ---- Gunluk Operasyon ---- */}
          {sekme === "operasyon" && takip && (
            <EkipPaneli takip={takip} firmalar={firmalar} temaslar={veri.temaslar || []} onFirma={setAcikFirma} />
          )}

          {/* ---- Pazar Analizi (ulkeler) ---- */}
          {sekme === "ulkeler" && <UlkeTablosu ulkeler={ulkeSatirlari} onUlke={ulkeyeGit} />}

          {/* ---- Musterilerimiz ---- */}
          {sekme === "musteriler" && <section className="rounded-xl border mb-6" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="musterilerimiz">
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
            {/* 23.11.2026 siparis ritmi ozeti (siparissiz musteriler) + karti olmayan plan musterileri */}
            {sevkVeri && musteriFiltre !== "aktif" && (ritimOzeti.gecikti + ritimOzeti.zamani_geldi + ritimOzeti.yaklasiyor) > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-b text-xs" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} data-testid="ritim-ozeti">
                <span>Siparişsiz müşterilerde sipariş ritmi:</span>
                <span style={{ color: "#FCA5A5" }}><b>{ritimOzeti.gecikti}</b> gecikti</span>
                <span style={{ color: "#FCD34D" }}><b>{ritimOzeti.zamani_geldi}</b> sipariş zamanı geldi</span>
                <span style={{ color: "#93C5FD" }}><b>{ritimOzeti.yaklasiyor}</b> yaklaşıyor</span>
              </div>
            )}
            {sevkVeri && <EslesmeyenSerit e={sevkVeri.eslesmeyen} />}
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
                      <th className="text-left font-medium px-3 py-2 whitespace-nowrap">Son sipariş</th>
                      <th className="text-left font-medium px-3 py-2 whitespace-nowrap" title="Yükleme planındaki sevkiyat dalgalarının ortanca aralığı; beklenen sipariş = beklenen sevkiyat − sipariş→sevkiyat süresi">Sipariş ritmi</th>
                      <th className="text-right font-medium px-3 py-2 whitespace-nowrap">Toplam hacim</th>
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
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Rozet tur={d?.aktif ? "aktif" : "siparissiz"} />
                              {f.crm_asama !== "yeni" && <span className="text-[11px]" style={{ color: SUREC_ASAMA.has(f.crm_asama) ? "#93C5FD" : TEXT_MUTED }} data-asama={f.crm_asama}>{ASAMA_KISA[f.crm_asama]}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap hidden sm:table-cell"><UlkeHucresi ulke={f.ulke || d?.ulke || null} kaynak={f.ulke ? f.ulke_kaynagi : "siparis"} /></td>
                          <td className="px-3 py-2 text-xs min-w-[200px]" data-siparis-hucre>
                            {d?.aktif ? (
                              <div className="space-y-0.5" style={{ color: "#C9D1DC" }}>
                                {d.acikDosyalar.map((x) => <p key={x.id}><span className="text-white">{x.dosya_no}</span> · {x.yuklenen}/{x.rezKonteyner} konteyner yüklendi</p>)}
                                {d.acikSiparisler.map((x) => <p key={x.id}><span className="text-white">{x.proforma_no}</span> · kalan {x.kalanFcl.toLocaleString("tr-TR")} FCL</p>)}
                                <YoldaSatirlari r={ritimler.get(f.id)} />
                                {d.listeSiparisleri.map((x, i) => (
                                  <p key={`l${i}`} data-liste-siparis={x.durum}>
                                    <span className="text-white">{x.proforma_no}</span>{x.konteyner ? ` · ${x.konteyner} kont.` : x.miktarMt ? ` · ${x.miktarMt.toLocaleString("tr-TR")} MT` : ""} · <span style={{ color: x.durum === "onay_bekliyor" ? "#FCD34D" : "#6EE7B7" }}>{LISTE_DURUM_ETIKETI[x.durum]}</span>
                                  </p>
                                ))}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <p style={{ color: "#FCD34D" }}>
                                  {d?.sonSiparis ? <>Açık sipariş yok · <b>{d.siparissizGun} gündür</b></> : "Sipariş kaydı yok"}
                                </p>
                                {ritimler.get(f.id) && <RitimRozeti r={ritimler.get(f.id)!} />}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: "#C9D1DC" }} data-son-siparis>{d?.sonSiparis ? tarihTR(d.sonSiparis) : "—"}</td>
                          <td className="px-3 py-2 text-xs min-w-[190px]" data-ritim-hucre>{sevkVeri ? <RitimHucresi r={ritimler.get(f.id)} /> : <span style={{ color: TEXT_MUTED }}>—</span>}</td>
                          <td className="px-3 py-2 text-xs text-right whitespace-nowrap tabular-nums" data-toplam-hacim title={d ? `${d.toplamDosya} dosya · ${d.toplamKonteyner} konteyner` : undefined}>
                            <span className="text-white font-medium">{d ? hacimMetni(d.hacim) : "—"}</span>
                            {d && d.toplamDosya > 0 && <p className="text-[10.5px]" style={{ color: TEXT_MUTED }}>{d.toplamDosya} dosya · {d.toplamKonteyner} kont.</p>}
                          </td>
                          <td className="px-3 py-2 hidden md:table-cell min-w-[200px]"><YetkiliHucresi kisiler={kisiHarita.get(f.id) || []} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>}

          {/* ---- Potansiyel & Surec: huni ustte, secili asama tabloyu filtreler ---- */}
          {sekme === "potansiyel" && <SurecHunisi asamalar={asamalar} secili={asama} onSec={setAsama} />}
          {sekme === "potansiyel" && <section className="rounded-xl border mt-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="potansiyeller">
            <div className="flex flex-wrap items-center gap-2 p-3 border-b" style={{ borderColor: CARD_BORDER }}>
              <div className="flex items-center gap-2 mr-2">
                <Users size={16} style={{ color: "#93C5FD" }} />
                <h2 className="text-sm font-semibold text-white">{seciliAsama ? `Süreç: ${seciliAsama.ad}` : "Potansiyel müşteriler"}</h2>
                <span className="text-xs" style={{ color: TEXT_MUTED }}>{seciliAsama ? `${seciliAsama.adet} firma` : `${potansiyeller.length} firma`}</span>
                {seciliAsama && (
                  <button type="button" onClick={() => setAsama(null)} className="inline-flex h-6 items-center gap-1 px-2 rounded-full text-[11px]" style={{ backgroundColor: "rgba(16,185,129,0.14)", color: "#6EE7B7" }} data-asama-temizle>
                    {seciliAsama.ad} ✕
                  </button>
                )}
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
              {listeEtiketleri.length > 0 && (
                <select value={kaynakFiltre} onChange={(e) => setKaynakFiltre(e.target.value)} data-testid="pazar-kaynak" aria-label="Kaynak"
                  className="h-9 px-2 rounded-lg border text-sm text-white outline-none max-w-[220px]" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                  <option value="">Tüm kaynaklar</option>
                  <option value="fuar">Fuar listeleri</option>
                  {listeEtiketleri.map(([e, n]) => <option key={e} value={e}>{e} ({n})</option>)}
                </select>
              )}
            </div>

            {potansiyelListesi.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={<Store size={36} />} title={seciliAsama ? "Bu aşamada eşleşen firma yok" : potansiyeller.length ? "Eşleşen firma yok" : "Henüz potansiyel müşteri yok"}
                  description={potansiyeller.length ? "Aramayı veya filtreyi değiştirin." : "Fuar ya da rehber listesini yükleyerek başlayın."} />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="pazar-liste">
                    <thead style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
                      <tr className="text-xs">
                        <th className="text-left font-medium px-3 py-2">Firma</th>
                        <th className="text-left font-medium px-3 py-2">Ülke</th>
                        <th className="text-left font-medium px-3 py-2 whitespace-nowrap">Süreç</th>
                        <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Yetkili</th>
                        <th className="text-left font-medium px-3 py-2 hidden lg:table-cell">Kaynak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {potansiyelListesi.slice(0, goster).map((f) => {
                        const fuarlar = katilimHarita.get(f.id) || [];
                        return (
                          <tr key={f.id} className="border-t align-top cursor-pointer hover:bg-white/[0.02]" style={{ borderColor: CARD_BORDER }} data-firma={f.ad} onClick={() => setAcikFirma(f.id)}>
                            <td className="px-3 py-2">
                              <button type="button" className="text-left text-white font-medium leading-snug hover:underline" onClick={(e) => { e.stopPropagation(); setAcikFirma(f.id); }}>{f.ad}</button>
                              {f.durum === "musteri" && <div className="mt-1"><Rozet tur={durumlar.get(f.id)?.aktif ? "aktif" : "siparissiz"} /></div>}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap"><UlkeHucresi ulke={f.ulke} kaynak={f.ulke_kaynagi} /></td>
                            <td className="px-3 py-2 text-xs whitespace-nowrap" data-surec-hucre>
                              <p style={{ color: SUREC_ASAMA.has(f.crm_asama) ? "#93C5FD" : f.crm_asama === "yeni" ? TEXT_MUTED : "#C9D1DC" }}>{f.crm_asama === "yeni" ? "Yeni" : ASAMA_KISA[f.crm_asama]}</p>
                              {(f.son_temas || f.sonraki_adim || f.bekleme_bitis) && (
                                <p className="text-[10.5px]" style={{ color: TEXT_MUTED }}>
                                  {f.son_temas ? `son ${gunKisa(f.son_temas)}` : ""}
                                  {f.sonraki_adim ? <span style={{ color: f.sonraki_adim < bugunIso ? "#FCA5A5" : undefined }}>{f.son_temas ? " · " : ""}sonraki {gunKisa(f.sonraki_adim)}</span>
                                    : f.bekleme_bitis ? `${f.son_temas ? " · " : ""}${gunKisa(f.bekleme_bitis)} sonra yeniden` : ""}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-2 hidden md:table-cell min-w-[220px]"><YetkiliHucresi kisiler={kisiHarita.get(f.id) || []} /></td>
                            <td className="px-3 py-2 hidden lg:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {f.kaynak === "liste" && f.kaynak_etiket && (
                                  <span className="inline-flex h-5 items-center px-1.5 rounded text-[11px] whitespace-nowrap" style={{ backgroundColor: "rgba(167,139,250,0.14)", color: "#C4B5FD" }} title="Rehber listesi" data-kaynak-liste>{f.kaynak_etiket}</span>
                                )}
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
          </section>}

          {acik && (
            <FirmaKarti
              firma={acik}
              kisiler={kisiHarita.get(acik.id) || []}
              katilimlar={katilimHarita.get(acik.id) || []}
              temaslar={(veri.temaslar || []).filter((t) => t.firma_id === acik.id).sort((a, b) => b.olusturma.localeCompare(a.olusturma))}
              durum={durumlar.get(acik.id) || null}
              ritim={ritimler.get(acik.id)}
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
