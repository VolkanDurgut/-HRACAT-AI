"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { ilkErisilebilirSayfa } from "@/lib/yetki-utils";
import { useDbaUpload } from "@/lib/hooks/use-dba-upload";
import { KantarYurtIci } from "@/components/kantar-yurt-ici";
import { KantarDbaOtomasyon } from "@/components/kantar-dba-otomasyon";
import { Weight, Upload, CheckCircle2, AlertTriangle, Loader2, FileText, RefreshCw, Search, LogOut, ShieldAlert, LayoutGrid, Ship, Truck } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, PAGE_BG, ROW_HEADER_BG } from "@/lib/theme";
import { ArkaPlanGorseli } from "@/components/arka-plan-gorseli";
import { KantarSevkiyatDurumu } from "@/components/kantar-sevkiyat-durumu";
import { musteriKodu, sevkiyatOzetleri, type KantarDosya } from "@/lib/kantar-sevkiyat";

type KonteynerRow = {
  id: string;
  konteyner_no: string;
  muhur_no: string | null;
  tip: string;
  dosya_id: string;
  dosya_no: string;
  plaka: string | null;
  tare_kg: number | null;
  net_agirlik_kg: number | null;
  vgm_kg: number | null;
  dba_dosya_url: string | null;
  dba_dosya_adi: string | null;
  dba_yukleme_tarihi: string | null;
  dba_kontrol_sonucu: { uyusmazliklar?: string[]; kaynak?: string; elle_giris?: boolean } | null;
  dba_belge_no: string | null;
  irsaliye_dosya_url: string | null;
  irsaliye_dosya_adi: string | null;
  irsaliye_yukleme_tarihi: string | null;
  booking_no: string | null;
  marka: string | null;
  /** 28.10.2026: musteri adi kantara GELMEZ; sunucu proforma kodunu verir (CCS, CME…). */
  musteri_kodu: string;
};

export default function KantarPage() {
  const { user, companyId, yetkiler, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [konteynerler, setKonteynerler] = useState<KonteynerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [arama, setArama] = useState("");
  // Sevkiyat Durumu (28.10.2026): acik dosyalar + rezervasyondaki konteyner adedi
  const [dosyalar, setDosyalar] = useState<KantarDosya[]>([]);
  const [rezerveAdet, setRezerveAdet] = useState<Record<string, number>>({});
  const [secilenGun, setSecilenGun] = useState<string | null>(null);
  // Canli baglanti durumu (05.10.2026): panel terminalde saatlerce acik kalir.
  // Realtime baglantisi koparsa (ag kesintisi, uyku, Supabase yeniden
  // baslatmasi) aradaki degisiklikler kacirilmasin diye yeniden baglaninca,
  // sekmeye donulunce, internet gelince ve dakikada bir liste yenilenir.
  const [canliBagli, setCanliBagli] = useState(false);
  const [okumaHatasi, setOkumaHatasi] = useState(false);
  const [sonGuncelleme, setSonGuncelleme] = useState<Date | null>(null);
  const istekSira = useRef(0);
  // Tek ekran (12.10.2026, kullanici istegi): Ihracat (DBA) ve Yurt Ici
  // (irsaliye) YAN YANA. Genis ekranda (2xl, >=1536px) iki sutun, her sutun
  // kendi icinde kayar; dar ekranda (telefon/tablet) alt alta, tek kaydirma +
  // ustte bolume atlama dugmeleri. Ihracat akisinin icerigi DEGISMEDI.
  const [yurtIciAcik, setYurtIciAcik] = useState<number | null>(null);
  const [yurtIciYenile, setYurtIciYenile] = useState(0);
  // Otomatik DBA (20.10.2026): durum seridi; Yenile'de ve canli degisiklikte tazelenir
  const [dbaOtoYenile, setDbaOtoYenile] = useState(0);
  const ihracatRef = useRef<HTMLElement>(null);
  const yurtIciRef = useRef<HTMLElement>(null);
  const tumunuYenile = () => { fetchKonteynerler(); setYurtIciYenile((n) => n + 1); setDbaOtoYenile((n) => n + 1); };

  const { yukleniyor, hatalar, yukleDba, inputRefs } = useDbaUpload();

  const fetchKonteynerler = useCallback(async () => {
    if (!user?.id || !companyId) return;
    // Ayni anda birden fazla yenileme olabilir (canli bildirim + periyodik):
    // sadece EN SON baslayanin sonucu ekrana yazilir.
    const sira = ++istekSira.current;
    const eskiIstek = () => sira !== istekSira.current;
    // Okuma basarisizsa (ag kesintisi) liste BOSALTILMAZ: eski liste kalir,
    // ustte uyari gorunur. Eskiden kesinti aninda "konteyner yok" gorunuyordu.
    const okumaBasarisiz = () => { setOkumaHatasi(true); setLoading(false); };

    // ONCE sadece ACIK dosyalar cekilir. Kantar panelinin ilgi alani zaten
    // yalnizca acik (henuz sevk edilmemis) dosyalarin konteynerleridir - bu
    // sayede konteynerler tablosunun tum tarihcesi degil, sadece guncel alt
    // kume cekilir. Sirket yillar boyunca veri biriktirdikce bu sayfa
    // yavaslamaz, cunku "acik dosya" sayisi dogasi geregi sinirlidir.
    // 28.10.2026: musteri adi yerine KOD donen fonksiyon (migration 20261028120000). Migration
    // henuz uygulanmamissa (fonksiyon yok) eski fonksiyona dusulur ve kod istemcide uretilir.
    let { data: dosyaData, error: dosyaHata } = await supabase
      .rpc("kantar_sevkiyat_listesi")
      .or("durum.eq.Açık,durum.eq.Acik");
    if (dosyaHata && (dosyaHata.code === "PGRST202" || dosyaHata.code === "42883")) {
      const eski = await supabase.rpc("kantar_dosya_listesi").or("durum.eq.Açık,durum.eq.Acik");
      dosyaHata = eski.error;
      dosyaData = (eski.data || []).map((d: any) => ({ id: d.id, dosya_no: d.dosya_no, durum: d.durum, marka: d.marka, musteri_kodu: musteriKodu(null, d.alici_firma) }));
    }

    if (eskiIstek()) return;
    if (dosyaHata) { okumaBasarisiz(); return; }
    const acikDosyalar: KantarDosya[] = (dosyaData || []).map((d: any) => ({ id: d.id, dosya_no: d.dosya_no, marka: d.marka, musteri_kodu: d.musteri_kodu || "—" }));
    if (acikDosyalar.length === 0) { setDosyalar([]); setRezerveAdet({}); setKonteynerler([]); setOkumaHatasi(false); setSonGuncelleme(new Date()); setLoading(false); return; }

    const dosyaIds = acikDosyalar.map((d) => d.id);
    const dosyaMap: Record<string, { dosya_no: string; marka: string | null; musteri_kodu: string }> = {};
    acikDosyalar.forEach((d) => { dosyaMap[d.id] = { dosya_no: d.dosya_no, marka: d.marka, musteri_kodu: d.musteri_kodu }; });

    // REZERVASYON BULMA - İYİLEŞTİRİLDİ
    // Konteynerin rezervasyon_id'si boş olsa bile, dosya üzerinden booking no bulur.
    const [{ data: kontData, error: kontHata }, { data: rezData, error: rezHata }] = await Promise.all([
      supabase
        .from("konteynerler")
        .select("id, konteyner_no, muhur_no, tip, dosya_id, rezervasyon_id, plaka, tare_kg, net_agirlik_kg, vgm_kg, dba_dosya_url, dba_dosya_adi, dba_yukleme_tarihi, dba_kontrol_sonucu, dba_belge_no, marka, irsaliye_dosya_url, irsaliye_dosya_adi, irsaliye_yukleme_tarihi")
        .eq("company_id", companyId)
        .in("dosya_id", dosyaIds),
      supabase
        .from("rezervasyonlar")
        .select("id, booking_no, dosya_id, konteyner_adedi")
        .eq("company_id", companyId)
        .in("dosya_id", dosyaIds),
    ]);

    if (eskiIstek()) return;
    if (kontHata || rezHata) { okumaBasarisiz(); return; }
    const rezerve: Record<string, number> = {};
    (rezData || []).forEach((r: any) => { rezerve[r.dosya_id] = (rezerve[r.dosya_id] || 0) + (Number(r.konteyner_adedi) || 0); });
    setDosyalar(acikDosyalar);
    setRezerveAdet(rezerve);
    if (!kontData || kontData.length === 0) { setKonteynerler([]); setOkumaHatasi(false); setSonGuncelleme(new Date()); setLoading(false); return; }

    const rezDosyaMap: Record<string, string> = {};
    const rezIdMap: Record<string, string> = {};
    (rezData || []).forEach((r: any) => {
      if (r.booking_no) {
        rezDosyaMap[r.dosya_id] = r.booking_no;
        rezIdMap[r.id] = r.booking_no;
      }
    });

    const enriched = (kontData as any[])
      .filter((k) => !!dosyaMap[k.dosya_id]) // Tutarsizlik durumunda (dosya kapanmis/silinmis) coken degil, o satiri atlar
      .map((k) => ({
        ...k,
        dosya_no: dosyaMap[k.dosya_id].dosya_no,
        marka: k.marka || dosyaMap[k.dosya_id].marka,
        booking_no: k.rezervasyon_id ? (rezIdMap[k.rezervasyon_id] || rezDosyaMap[k.dosya_id] || null) : (rezDosyaMap[k.dosya_id] || null),
        musteri_kodu: dosyaMap[k.dosya_id].musteri_kodu,
      })) as KonteynerRow[];

    setKonteynerler(enriched);
    setOkumaHatasi(false);
    setSonGuncelleme(new Date());
    setLoading(false);
  }, [user?.id, companyId]);

  useEffect(() => { 
    if (user?.id && companyId) fetchKonteynerler(); 
  }, [fetchKonteynerler, user?.id, companyId]);

  useEffect(() => {
    // Yetkiler veritabanindan gelmeden karar verilmez: yuklenirken tum yetkiler
    // gecici olarak kapali gorunur ve tam yetkili kullanici bile sayfayi
    // yenileyince baska sayfaya atiliyordu (duzeltme: 01.10.2026). Hic sayfa
    // yetkisi yoksa yonlendirme yapilmaz - AppShell "Erisim yetkiniz yok"
    // ekranini gosterir (bkz. lib/yetki-utils.ts).
    if (authLoading) return;
    if (!yetkiler.sayfa_yetkileri.kantar) {
      const hedef = ilkErisilebilirSayfa(yetkiler.sayfa_yetkileri);
      if (hedef) router.replace(hedef);
    }
  }, [authLoading, yetkiler, router]);

  useEffect(() => {
    if (!user?.id || !companyId) return;
    const channel = supabase
      .channel("kantar-konteynerler")
      .on("postgres_changes", { event: "*", schema: "public", table: "konteynerler", filter: `company_id=eq.${companyId}` }, () => {
        fetchKonteynerler();
        setDbaOtoYenile((n) => n + 1);
      })
      .subscribe((durum) => {
        if (durum === "SUBSCRIBED") {
          setCanliBagli(true);
          // (Yeniden) baglanildi: kopukken / abonelik kurulurken olan
          // degisiklikler bildirim olarak GELMEZ, listeyi tazele.
          fetchKonteynerler();
        } else {
          // CHANNEL_ERROR / TIMED_OUT / CLOSED: istemci kendisi yeniden dener.
          setCanliBagli(false);
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [fetchKonteynerler, user?.id, companyId]);

  useEffect(() => {
    if (!user?.id || !companyId) return;
    const gorunurseYenile = () => { if (document.visibilityState === "visible") fetchKonteynerler(); };
    // Canli bildirim kacirilsa bile liste en fazla 1 dk eski kalir.
    const zamanlayici = window.setInterval(gorunurseYenile, 60_000);
    document.addEventListener("visibilitychange", gorunurseYenile);
    window.addEventListener("online", gorunurseYenile);
    return () => {
      window.clearInterval(zamanlayici);
      document.removeEventListener("visibilitychange", gorunurseYenile);
      window.removeEventListener("online", gorunurseYenile);
    };
  }, [fetchKonteynerler, user?.id, companyId]);

  const baglantiSorunu = okumaHatasi || !canliBagli;
  const sonGuncellemeSaat = sonGuncelleme
    ? sonGuncelleme.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : "–";

  const handleDbaYukle = async (konteyner: KonteynerRow, file: File) => {
    await yukleDba(konteyner, file);
    fetchKonteynerler();
  };

  const bekleyenler = konteynerler.filter(k => !k.dba_dosya_url);
  const tamamlananlar = konteynerler.filter(k => !!k.dba_dosya_url);

  // Konteyner no, muhur no, plaka, dosya no veya rez no ile arama.
  const aramaFiltre = (list: KonteynerRow[]) => {
    const q = arama.trim().toLowerCase();
    if (!q) return list;
    return list.filter(k =>
      k.konteyner_no.toLowerCase().includes(q) ||
      (k.muhur_no || "").toLowerCase().includes(q) ||
      (k.plaka || "").toLowerCase().includes(q) ||
      k.dosya_no.toLowerCase().includes(q) ||
      (k.booking_no || "").toLowerCase().includes(q) ||
      (k.marka || "").toLowerCase().includes(q) ||
      k.musteri_kodu.toLowerCase().includes(q)
    );
  };

  const bekleyenlerFiltreli = aramaFiltre(bekleyenler);

  // Gun bazli filtre: DBA'nin YUKLENDIGI gune gore (dba_yukleme_tarihi).
  // Tarayicinin yerel saat dilimini kullanir (Turkiye), UTC'de saklanan
  // zaman damgasi otomatik olarak dogru gune donusur.
  const gunAnahtari = (tarihStr: string) => {
    const d = new Date(tarihStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const bugunAnahtari = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const dunAnahtari = (() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const gunEtiketi = (anahtar: string) => {
    if (anahtar === bugunAnahtari) return "Bugün";
    if (anahtar === dunAnahtari) return "Dün";
    const [yil, ay, gun] = anahtar.split("-").map(Number);
    return new Date(yil, ay - 1, gun).toLocaleDateString("tr-TR", { day: "numeric", month: "long" });
  };
  const gunSayilari: Record<string, number> = {};
  tamamlananlar.forEach((k) => {
    if (!k.dba_yukleme_tarihi) return;
    const anahtar = gunAnahtari(k.dba_yukleme_tarihi);
    gunSayilari[anahtar] = (gunSayilari[anahtar] || 0) + 1;
  });
  const gunler = Object.keys(gunSayilari).sort().reverse(); // en yeni once

  const gunFiltre = (list: KonteynerRow[]) => {
    if (!secilenGun) return list;
    return list.filter((k) => k.dba_yukleme_tarihi && gunAnahtari(k.dba_yukleme_tarihi) === secilenGun);
  };

  const tamamlananlarFiltreli = gunFiltre(aramaFiltre(tamamlananlar));

  const sevkiyatlar = sevkiyatOzetleri(dosyalar, konteynerler, rezerveAdet);

  // Bu sayfa kantar terminali icin BILEREK kenar cubugu (AppShell) olmadan
  // calisir; bu yuzden AppShell'in yaptigi oturum/yetki kapisi burada
  // ayrica uygulanir (01.10.2026). Eskiden oturum kapaliyken sonsuz
  // "Yukleniyor" ekrani kaliyor, hic yetkisi olmayan kullanici da icerigi
  // gorebiliyordu.
  useEffect(() => {
    if (!authLoading && !user) router.replace("/");
  }, [authLoading, user, router]);

  const kantarYetkisiVar = !!yetkiler.sayfa_yetkileri.kantar;
  // Kantar disinda erisebildigi bir sayfa varsa oraya donus baglantisi
  const digerSayfa = ilkErisilebilirSayfa({ ...yetkiler.sayfa_yetkileri, kantar: false });

  if (authLoading || !user) {
    return (
      <div className="h-screen w-full flex items-center justify-center" style={{ backgroundColor: PAGE_BG }}>
        <Loader2 size={28} className="animate-spin" style={{ color: ACCENT }} />
      </div>
    );
  }

  if (!kantarYetkisiVar) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: PAGE_BG }}>
        <div className="w-full max-w-md rounded-xl border p-8 text-center" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <ShieldAlert size={36} className="mx-auto mb-4 text-amber-400" />
          <h1 className="text-lg font-bold text-white mb-2">Erişim yetkiniz yok</h1>
          <p className="text-sm leading-relaxed mb-6" style={{ color: TEXT_MUTED }}>
            Kantar Paneli için yetkiniz bulunmuyor. Erişim için yöneticinizle iletişime geçin.
          </p>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border hover:bg-white/5 transition-colors text-white"
            style={{ borderColor: CARD_BORDER }}
          >
            <LogOut size={14} /> Çıkış Yap
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center" style={{ backgroundColor: PAGE_BG }}>
        <div className="flex items-center gap-3" style={{ color: TEXT_MUTED }}>
          <Loader2 size={24} className="animate-spin" style={{ color: ACCENT }} />
          <span>Yükleniyor...</span>
        </div>
      </div>
    );
  }

  return (
    // isolate: arka plan gorseli (-z) zeminin ustunde, icerigin altinda (22.10.2026)
    <div className="relative isolate h-[100dvh] w-full flex flex-col p-4 md:p-6 overflow-hidden" style={{ backgroundColor: PAGE_BG }}>
      <ArkaPlanGorseli tur="uygulama" />
      <div className="max-w-6xl 2xl:max-w-[1840px] mx-auto w-full flex flex-col h-full min-h-0 gap-4 2xl:gap-5">

        {/* Üst Başlık Sabit */}
        <div className="shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{ backgroundColor: ACCENT }}>
              <Weight size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">Kantar Paneli</h1>
              <p className="text-xs font-medium" style={{ color: TEXT_MUTED }}>İhracat DBA ve yurt içi irsaliye yükleme</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${baglantiSorunu ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"}`}
              title={baglantiSorunu
                ? `Sunucuyla bağlantı kurulamadı; liste ${sonGuncellemeSaat} itibarıyla. Bağlantı gelince otomatik yenilenir.`
                : `Değişiklikler anında yansıyor. Son güncelleme: ${sonGuncellemeSaat}`}
              aria-live="polite">
              <span className={`w-2 h-2 rounded-full ${baglantiSorunu ? "bg-amber-500" : "bg-emerald-500"}`} />
              {baglantiSorunu ? <span>Bağlantı yok · {sonGuncellemeSaat}</span> : <span>Canlı</span>}
            </span>
            {digerSayfa && (
              <button onClick={() => router.push(digerSayfa)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors shadow-sm hover:bg-white/5"
                style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, color: TEXT_MUTED }}
                title="Uygulamanın diğer sayfalarına dön">
                <LayoutGrid size={14} /> Ana Menü
              </button>
            )}
            <button onClick={tumunuYenile}
              className="relative inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors shadow-sm hover:bg-white/5"
              style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, color: TEXT_MUTED }}
              title={baglantiSorunu ? `Bağlantı yok — liste ${sonGuncellemeSaat} itibarıyla` : "Canlı — değişiklikler anında yansıyor"}>
              <RefreshCw size={14} /> Yenile
              {/* Dar ekranda baglanti durumu: butonun kosesinde nokta (baslik tasmasin). */}
              <span aria-hidden="true"
                className={`sm:hidden absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${baglantiSorunu ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ boxShadow: `0 0 0 2px ${PAGE_BG}` }} />
            </button>
            <button onClick={signOut}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors shadow-sm hover:bg-white/5"
              style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG, color: TEXT_MUTED }}
              title="Oturumu kapat">
              <LogOut size={14} /> Çıkış
            </button>
          </div>
        </div>

        {/* Dar ekranda bolume atlama (genis ekranda iki sutun zaten yan yana) */}
        <div className="shrink-0 grid grid-cols-2 gap-2 2xl:hidden">
          {([["İhracat · DBA", bekleyenler.length, "DBA bekleyen", Ship, ihracatRef], ["Yurt İçi · İrsaliye", yurtIciAcik, "açık iş emri", Truck, yurtIciRef]] as const).map(([etiket, sayi, alt, Ikon, ref]) => (
            <button key={etiket} onClick={() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left hover:bg-white/5"
              style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <Ikon size={16} style={{ color: ACCENT }} className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-white truncate">{etiket}</span>
                <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{sayi ?? "–"} {alt}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto 2xl:overflow-hidden grid grid-cols-1 2xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-6 2xl:gap-5 pr-1 2xl:pr-0" style={{ scrollbarWidth: "thin" }}>
        {/* ===== SOL: IHRACAT (DBA) - icerik degismedi ===== */}
        <section ref={ihracatRef} aria-labelledby="kantar-ihracat" className="flex flex-col gap-4 2xl:min-h-0 2xl:rounded-2xl 2xl:border 2xl:p-4 scroll-mt-2" style={{ borderColor: CARD_BORDER }}>
        <BolumBasligi id="kantar-ihracat" ikon={<Ship size={16} />} baslik="İhracat · DBA" aciklama="Konteyner tartımı · DBA belgesi" />
        {/* Arama */}
        <div className="shrink-0 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: TEXT_MUTED }} />
          <input
            type="text"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Konteyner, mühür, plaka, dosya no, çuval veya müşteri kodu ile ara..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}
          />
        </div>

        {/* Özet Kartları Sabit */}
        <div className="shrink-0 grid grid-cols-2 gap-4">
          <div className="rounded-xl border p-4 shadow-sm animate-fade-up stagger-1" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>DBA Beklenen</p>
            <p className="text-2xl font-bold text-amber-400">{bekleyenler.length}</p>
          </div>
          <div className="rounded-xl border p-4 shadow-sm animate-fade-up stagger-2" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>Tamamlanan</p>
            <p className="text-2xl font-bold text-emerald-400">{tamamlananlar.length}</p>
          </div>
        </div>

        {/* Otomatik DBA durumu + elle kontrol gereken belgeler (cihaz tanimli degilse gorunmez) */}
        <KantarDbaOtomasyon yenileTetik={dbaOtoYenile} />

        {/* İçerik Alanı (genis ekranda sadece bu bölüm scroll olur) */}
        <div className="2xl:flex-1 2xl:overflow-y-auto 2xl:min-h-0 pb-4 2xl:pb-10 2xl:pr-2 space-y-6" style={{ scrollbarWidth: "thin" }}>
          
          {/* Sevkiyat Durumu (28.10.2026): hangi sevkiyattan kac konteyner dolu */}
          <KantarSevkiyatDurumu sevkiyatlar={sevkiyatlar} arama={arama} />

          {/* Bekleyen DBA'lar - tek liste */}
          {bekleyenlerFiltreli.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold flex items-center gap-2 text-white">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> DBA Bekleyen İhracatlar
                <span className="text-xs font-normal" style={{ color: TEXT_MUTED }}>({bekleyenlerFiltreli.length})</span>
              </h2>
              <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 backdrop-blur border-b z-10" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Konteyner</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Mühür / Plaka</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Çuval / Dosya</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Müşteri</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Rez No</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>İrsaliye</th>
                      <th className="px-4 py-2.5 text-center w-24 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bekleyenlerFiltreli.map((k, idx) => (
                      <tr key={k.id} className={`border-b last:border-0 hover:bg-white/[0.03] transition-colors animate-fade-up stagger-${Math.min(idx + 1, 8)}`} style={{ borderColor: CARD_BORDER }}>
                        <td className="px-4 py-2.5">
                          <div className="text-xs font-bold font-mono text-white">{k.konteyner_no}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{k.tip}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-[10px] font-mono" style={{ color: TEXT_MUTED }}>{k.muhur_no || "-"}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{k.plaka || "-"}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="text-xs font-medium text-white truncate max-w-[140px]" title={k.marka || "-"}>{k.marka || "-"}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{k.dosya_no}</div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-white"><span className="font-mono font-semibold tracking-wide" title="Müşteri kodu (proformadaki)">{k.musteri_kodu}</span></td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: TEXT_MUTED }}>{k.booking_no || "-"}</td>
                        <td className="px-4 py-2.5 text-center">
                          {k.irsaliye_dosya_url ? (
                            <a href={k.irsaliye_dosya_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                              title="İrsaliyeyi görüntüle / indir / yazdır (açılan sekmede Ctrl+P)">
                              <FileText size={11} /> Gör
                            </a>
                          ) : (
                            <span className="text-[10px]" style={{ color: TEXT_MUTED }}>Yok</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {yukleniyor[k.id] ? (
                            <Loader2 size={14} className="animate-spin mx-auto" style={{ color: TEXT_MUTED }} />
                          ) : (
                            <div className="flex flex-col items-center">
                              <label className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded border cursor-pointer text-[10px] font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
                                style={{ borderColor: "rgba(251,191,36,0.35)" }}>
                                <Upload size={10} className="text-amber-400" /> DBA
                                <input type="file" accept="application/pdf" className="hidden"
                                  ref={(el) => { inputRefs.current[k.id] = el; }}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleDbaYukle(k, f);
                                    e.target.value = ""; // Basarisiz denemeden sonra AYNI dosyanin tekrar secilebilmesi icin sart - yoksa tarayici "degisiklik yok" sanip onChange'i bir daha tetiklemez
                                  }} />
                              </label>
                              {hatalar[k.id] && <p className="text-[9px] text-red-400 leading-tight mt-1 max-w-[90px] mx-auto truncate" title={hatalar[k.id]}>{hatalar[k.id]}</p>}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </div>
          )}

          {/* Tamamlanan DBA'lar - tek liste */}
          {tamamlananlar.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold flex items-center gap-2 text-white">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> DBA Tamamlanan Konteynerler
                <span className="text-xs font-normal" style={{ color: TEXT_MUTED }}>({tamamlananlarFiltreli.length})</span>
              </h2>

              {gunler.length > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setSecilenGun(null)}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors"
                    style={secilenGun === null ? { backgroundColor: ACCENT, borderColor: ACCENT, color: "white" } : { borderColor: CARD_BORDER, color: TEXT_MUTED }}
                  >
                    Tümü ({tamamlananlar.length})
                  </button>
                  {gunler.map((gun) => (
                    <button
                      key={gun}
                      onClick={() => setSecilenGun(gun === secilenGun ? null : gun)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors"
                      style={secilenGun === gun ? { backgroundColor: ACCENT, borderColor: ACCENT, color: "white" } : { borderColor: CARD_BORDER, color: TEXT_MUTED }}
                    >
                      {gunEtiketi(gun)} ({gunSayilari[gun]})
                    </button>
                  ))}
                </div>
              )}

              {tamamlananlarFiltreli.length === 0 ? (
                <div className="rounded-xl border p-6 text-center" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                  <p className="text-xs" style={{ color: TEXT_MUTED }}>Seçilen gün / aramayla eşleşen DBA belgesi bulunamadı.</p>
                </div>
              ) : (
              <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 backdrop-blur border-b z-10" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Konteyner</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Dosya</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Müşteri</th>
                      <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Ağırlıklar</th>
                      <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>İrsaliye</th>
                      <th className="px-4 py-2.5 text-center w-16 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tamamlananlarFiltreli.map((k, idx) => {
                      const uyusmazlik = (k.dba_kontrol_sonucu?.uyusmazliklar?.length ?? 0) > 0;
                      return (
                        <tr key={k.id} className={`border-b last:border-0 hover:bg-white/[0.03] transition-colors animate-fade-up stagger-${Math.min(idx + 1, 8)}`} style={{ borderColor: CARD_BORDER }}>
                          <td className="px-4 py-2.5">
                            <div className="text-xs font-bold font-mono text-white">{k.konteyner_no}</div>
                            <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{k.plaka || "-"}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="text-xs font-medium text-white truncate max-w-[140px]" title={k.marka || "-"}>{k.marka || "-"}</div>
                            <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{k.dosya_no}</div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-white"><span className="font-mono font-semibold tracking-wide" title="Müşteri kodu (proformadaki)">{k.musteri_kodu}</span></td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="text-[10px]" style={{ color: TEXT_MUTED }}>Dara: {k.tare_kg ? `${k.tare_kg.toLocaleString("tr-TR")} kg` : "-"}</div>
                            <div className="text-xs font-bold text-white mt-0.5">VGM: {k.vgm_kg ? `${k.vgm_kg.toLocaleString("tr-TR")} kg` : "-"}</div>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {k.irsaliye_dosya_url ? (
                              <a href={k.irsaliye_dosya_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                                title="İrsaliyeyi görüntüle / indir / yazdır (açılan sekmede Ctrl+P)">
                                <FileText size={11} /> Gör
                              </a>
                            ) : (
                              <span className="text-[10px]" style={{ color: TEXT_MUTED }}>Yok</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <span title={uyusmazlik ? "Uyuşmazlık var" : k.dba_kontrol_sonucu?.elle_giris === true ? "Elle girilen tartım kaydı" : k.dba_kontrol_sonucu?.kaynak === "otomatik" ? "Onaylı · kantar bilgisayarından otomatik yüklendi" : "Onaylı"}>
                                {uyusmazlik ? <AlertTriangle size={15} className="text-amber-400" /> : <CheckCircle2 size={15} className="text-emerald-400" />}
                              </span>
                              {k.dba_kontrol_sonucu?.elle_giris === true && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-500/10 text-amber-400" title="DBA belgesi yerine tartım bilgileri elle girildi (resmî DBA değil)">Elle</span>
                              )}
                              {k.dba_kontrol_sonucu?.kaynak === "otomatik" && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-sky-500/10 text-sky-400" title="Kantar bilgisayarından otomatik yüklendi">Oto</span>
                              )}
                              {k.dba_dosya_url && (
                                <a href={k.dba_dosya_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-7 h-7 rounded-md transition-colors shadow-sm hover:text-white" style={{ backgroundColor: CARD_BORDER, color: TEXT_MUTED }} title="DBA Belgesini Gör">
                                  <FileText size={13} />
                                </a>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
              )}
            </div>
          )}

          {konteynerler.length === 0 && (
            <div className="rounded-xl border shadow-sm p-12 text-center animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <Weight size={40} className="mx-auto mb-3" style={{ color: CARD_BORDER }} />
              <p className="text-sm font-medium" style={{ color: TEXT_MUTED }}>Aktif dosyada konteyner bulunamadı.</p>
            </div>
          )}

          {konteynerler.length > 0 && bekleyenlerFiltreli.length === 0 && tamamlananlarFiltreli.length === 0 && (
            <div className="rounded-xl border shadow-sm p-12 text-center animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <Search size={40} className="mx-auto mb-3" style={{ color: CARD_BORDER }} />
              <p className="text-sm font-medium" style={{ color: TEXT_MUTED }}>&quot;{arama}&quot; ile eşleşen konteyner bulunamadı.</p>
            </div>
          )}
          
        </div>
        </section>

        {/* ===== SAG: YURT ICI (irsaliye) ===== */}
        <section ref={yurtIciRef} aria-labelledby="kantar-yurt-ici" className="flex flex-col gap-4 2xl:min-h-0 2xl:rounded-2xl 2xl:border 2xl:p-4 scroll-mt-2" style={{ borderColor: CARD_BORDER }}>
          <BolumBasligi id="kantar-yurt-ici" ikon={<Truck size={16} />} baslik="Yurt İçi · İrsaliye" aciklama="İç piyasa iş emirleri · araç başına irsaliye" />
          <KantarYurtIci yenileTetik={yurtIciYenile} acikSayiBildir={setYurtIciAcik} />
        </section>
        </div>
      </div>
    </div>
  );
}

/** Kantar Paneli bolum basligi (Ihracat / Yurt Ici). Dar ekranda kaydirirken ustte sabit kalir. */
function BolumBasligi({ id, ikon, baslik, aciklama }: { id: string; ikon: React.ReactNode; baslik: string; aciklama: string }) {
  return (
    <div className="shrink-0 sticky top-0 z-20 2xl:static flex items-center gap-2.5 py-2 2xl:py-0 -mt-1 2xl:mt-0 bg-[rgba(11,15,20,0.92)] 2xl:bg-transparent">
      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(16,185,129,0.12)", color: ACCENT }}>{ikon}</span>
      <div className="min-w-0">
        <h2 id={id} className="text-base font-bold text-white leading-tight">{baslik}</h2>
        <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{aciklama}</p>
      </div>
    </div>
  );
}
