"use client";

/**
 * NAVLUN MERKEZI (24.11.2026, Asama 2; kullanici onayi). Kullanici: "Navlun sayfasi uzun ve kasiyor; ekrandaki kartlar,
 * ozellikler tek basina calismamali." Yeni ekran:
 *  - TEK veri okumasi (lib/navlun/merkez-veri.ts): sunucunun hesapladigi degerlendirme (edge navlun-bildirimi "degerlendir",
 *    15 dakikada bir + her kayitta) ve kontrol izi. Hesap tarayicida tekrarlanmaz.
 *  - Sekmeler: Limanlar / Kontrol / Gerceklesen / Acenteler / Islem kaydi. Yalniz acik sekme cizilir.
 *  - Tek yazma: Kontrol sekmesi (navlun_kontrol_isle RPC; her islem izi kalir).
 * Eski sayfa (/navlun) Asama 3'e kadar yerinde (harita, Excel, yeniden okuma orada).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Anchor, ArrowLeft, CheckCircle2, ClipboardCheck, History, RefreshCw, Ship, Target, Users } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { OzetKarti } from "@/components/erp/ozet-karti";
import { useAuth } from "@/lib/auth-context";
import { ACCENT, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { kontrolKuyrugu, limanListesi, type MerkezVerisi } from "@/lib/navlun/merkez";
import { navlunMerkezVerisiOku } from "@/lib/navlun/merkez-veri";
import { LimanlarSekmesi } from "@/components/navlun/merkez/limanlar";
import { KontrolSekmesi } from "@/components/navlun/merkez/kontrol";
import { AcentelerSekmesi, GerceklesenSekmesi, IslemKaydiSekmesi } from "@/components/navlun/merkez/diger-sekmeler";
import { zamanYaz } from "@/components/navlun/merkez/ortak";

type Sekme = "limanlar" | "kontrol" | "gerceklesen" | "acenteler" | "kayit";
const SEKMELER: { id: Sekme; ad: string; ikon: React.ReactNode }[] = [
  { id: "limanlar", ad: "Limanlar", ikon: <Anchor size={14} /> },
  { id: "kontrol", ad: "Kontrol", ikon: <ClipboardCheck size={14} /> },
  { id: "gerceklesen", ad: "Gerçekleşen", ikon: <Target size={14} /> },
  { id: "acenteler", ad: "Acenteler", ikon: <Users size={14} /> },
  { id: "kayit", ad: "İşlem kaydı", ikon: <History size={14} /> },
];

function MerkezIcerik() {
  const { yetkiler } = useAuth();
  const yetkili = !!yetkiler.sayfa_yetkileri.navlun;
  const [veri, setVeri] = useState<MerkezVerisi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [sekme, setSekme] = useState<Sekme>("limanlar");
  const [acikLiman, setAcikLiman] = useState<string | null>(null);
  const [simdi, setSimdi] = useState(() => Date.now());
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata(null);
    try { setVeri(await navlunMerkezVerisiOku()); setSimdi(Date.now()); } catch (e) { setHata(e instanceof Error ? e.message : "Veri okunamadı."); }
    finally { setYukleniyor(false); }
  }, []);
  useEffect(() => { if (yetkili) yukle(); }, [yetkili, yukle]);
  useEffect(() => () => { if (zamanlayici.current) clearTimeout(zamanlayici.current); }, []);
  // ?sekme=kontrol&liman=MOMBASA (mail / baska sayfa baglantisi)
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const s = p.get("sekme");
      if (s && SEKMELER.some((x) => x.id === s)) setSekme(s as Sekme);
      const l = p.get("liman");
      if (l && l.trim()) setAcikLiman(l.trim().toLocaleUpperCase("tr-TR").replace(/İ/g, "I").slice(0, 60));
    } catch { /* yok say */ }
  }, []);

  const limanlar = useMemo(() => (veri ? limanListesi(veri.degerlendirme, veri.hedefKabul) : []), [veri]);
  const kuyruk = useMemo(() => (veri ? kontrolKuyrugu(veri, simdi) : []), [veri, simdi]);
  const geciken = kuyruk.filter((k) => k.gecikti).length;
  const enIyiSayisi = limanlar.filter((l) => l.enIyi).length;
  const tutmayan = veri ? veri.gerceklesen.filter((g) => g.durum === "tutmuyor").length : 0;

  const islemBitti = useCallback((yenidenHesap: boolean) => {
    yukle();
    if (yenidenHesap) {
      setBilgi("Kaydedildi. Navlun değerlendirmesi yeniden hesaplanıyor; tablo yaklaşık bir dakika içinde kendiliğinden yenilenecek.");
      if (zamanlayici.current) clearTimeout(zamanlayici.current);
      zamanlayici.current = setTimeout(() => { yukle(); setBilgi(null); }, 60000);
    } else setBilgi("Kaydedildi.");
  }, [yukle]);

  if (!yetkili) return null;
  return (
    <div className="max-w-[1500px] mx-auto">
      <SayfaBasligi
        ikon={<Ship size={20} />}
        baslik="Navlun Merkezi"
        aciklama="Konteyner başı maliyet, en iyi teklif ve kontrol · tek hesap"
        sag={
          <div className="flex items-center gap-2">
            <Link href="/navlun" className="h-9 px-3 inline-flex items-center gap-2 rounded-lg border text-sm hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} data-testid="eski-gorunum">
              <ArrowLeft size={14} /> Eski görünüm
            </Link>
            <button type="button" onClick={yukle} disabled={yukleniyor} aria-label="Yenile" className="h-9 w-9 inline-flex items-center justify-center rounded-lg border hover:bg-white/[0.04] disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              <RefreshCw size={15} className={yukleniyor ? "animate-spin" : ""} />
            </button>
          </div>
        }
      />
      {hata && (
        <div className="flex items-start gap-2 rounded-lg border px-3 py-2 mb-4 text-sm" style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "#FCA5A5" }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{hata}</span>
        </div>
      )}
      {bilgi && (
        <div className="flex items-start gap-2 rounded-lg border px-3 py-2 mb-4 text-sm" data-testid="merkez-bilgi" style={{ borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.08)", color: "#6EE7B7" }}>
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> <span>{bilgi}</span>
        </div>
      )}
      {!veri && yukleniyor ? <SayfaYukleniyor /> : veri ? (
        <>
          {veri.uyarilar.length > 0 && (
            <div className="mb-4 rounded-lg border px-3 py-2 text-sm flex items-start gap-2" style={{ borderColor: "rgba(251,191,36,0.35)", color: "#FCD34D" }} data-testid="merkez-uyari">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{veri.uyarilar.join(" ")}</span>
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <OzetKarti testId="merkez-ozet-liman" ikon={<Anchor size={14} />} etiket="Liman" deger={limanlar.length} alt={`${enIyiSayisi} limanda kesin en iyi`} onClick={() => setSekme("limanlar")} />
            <OzetKarti testId="merkez-ozet-kontrol" ikon={<ClipboardCheck size={14} />} etiket="Kontrol bekleyen" deger={kuyruk.length}
              alt={geciken ? `${geciken} kalem 48 saati geçti` : kuyruk.length ? "Kontrol sekmesinde" : "sorun yok"} onClick={() => setSekme("kontrol")} />
            <OzetKarti testId="merkez-ozet-gerceklesen" ikon={<Target size={14} />} etiket="Tutmayan navlun" deger={tutmayan} alt={`${veri.gerceklesen.length} yükleme kontrol edildi`} onClick={() => setSekme("gerceklesen")} />
            <OzetKarti testId="merkez-ozet-hesap" ikon={<RefreshCw size={14} />} etiket="Son hesap" deger={veri.hesapZamani ? zamanYaz(veri.hesapZamani) : "—"} alt="15 dakikada bir ve her yeni mailde" />
          </div>

          <div role="tablist" className="flex flex-wrap gap-1 mb-4 border-b" style={{ borderColor: CARD_BORDER }}>
            {SEKMELER.map((s) => {
              const secili = sekme === s.id;
              const rozet = s.id === "kontrol" && kuyruk.length ? kuyruk.length : null;
              return (
                <button key={s.id} type="button" role="tab" aria-selected={secili} onClick={() => setSekme(s.id)} data-testid={`merkez-sekme-${s.id}`}
                  className="h-10 px-3 -mb-px inline-flex items-center gap-2 text-sm border-b-2"
                  style={{ borderColor: secili ? ACCENT : "transparent", color: secili ? "#FFFFFF" : TEXT_MUTED }}>
                  {s.ikon} {s.ad}
                  {rozet !== null && (
                    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold"
                      style={{ backgroundColor: geciken ? "rgba(239,68,68,0.2)" : "rgba(251,191,36,0.18)", color: geciken ? "#FCA5A5" : "#FCD34D" }}>{rozet}</span>
                  )}
                </button>
              );
            })}
          </div>

          {sekme === "limanlar" && <LimanlarSekmesi limanlar={limanlar} acikLiman={acikLiman} onAc={setAcikLiman} />}
          {sekme === "kontrol" && <KontrolSekmesi kalemler={kuyruk} onDegisti={islemBitti} />}
          {sekme === "gerceklesen" && <GerceklesenSekmesi satirlar={veri.gerceklesen} islemler={veri.islemler} />}
          {sekme === "acenteler" && <AcentelerSekmesi hafiza={veri.hafiza} degerlendirme={veri.degerlendirme} />}
          {sekme === "kayit" && <IslemKaydiSekmesi islemler={veri.islemler} />}
        </>
      ) : null}
    </div>
  );
}

export default function NavlunMerkeziSayfasi() {
  return (
    <AppShell>
      <MerkezIcerik />
    </AppShell>
  );
}
