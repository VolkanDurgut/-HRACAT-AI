"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, Clock, Copy, ExternalLink, History, Inbox, Layers, Link2, Loader2, Mail,
  CalendarDays, CheckCheck, FileText, FlaskConical, PackageCheck, Pencil, Plus, RefreshCw, RotateCcw, Send, ShoppingCart, Trash2, Undo2, X, XCircle, Zap,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { supabase } from "@/lib/supabase";
import { miktarOku, satinAlmaCagir } from "@/lib/satin-alma/api";
import { haftaKarsilastir, oncekiListeler, type HaftaRozeti } from "@/lib/satin-alma/karsilastir";
import { YaziAnimasyonu } from "@/components/yazi-animasyonu";
import { ACCENT, CARD_BG, CARD_BORDER, PAGE_BG, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import {
  BIRIMLER, HAFTA_GUNLERI, KATEGORILER, adSoyadDuzelt, adSoyadGecerli, cekAdresi, listeOzeti, miktarBirim, miktarDegisti, miktarYaz, onayliMiktarBirim, saTarih, tedarikciGruplari, talepAdresi, urunEslesme,
  type SaKalem, type SaListe,
} from "@/supabase/functions/_shared/satin-alma";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { yoneticiMi } from "@/lib/asistan/gorunum";
import { bekleyenleriAyir, satinAlmaGunuMu, topluSanalListe, varsayilanDahil } from "@/lib/satin-alma/toplu";
import { topluListeleriOku, type TopluSatiri } from "@/lib/satin-alma/veri";

/**
 * SATIN ALMA (26.10.2026) - departman ihtiyac listelerinin onayi.
 * Departmanlar girissiz baglantidan (/talep/[token]) liste gonderir; burada
 * "satin_alma" yetkili kullanici (Burak Bey) kalem bazinda onaylar / reddeder.
 * Karar kaydedilince onaylanan + reddedilen kalemler execution@'ye e-postayla
 * gider (edge function "satin-alma", islem "karar"). Karar SONRADAN DEGISMEZ.
 * Onaylanan kalem varsa onayli satin alma fisi olusur (/cek/[token]); onayli alimlar
 * "Departman gecmisi"nde birikir. TESLIM TAKIBI (03.11.2026; 27.10'da kaldirilmisti,
 * kullanici onayiyla geri): "Onayli fisler"de kalem "Teslim edildi" olarak teslim alanin
 * ad soyadiyla isaretlenir (ya da departman fis baglantisindan kendisi isaretler);
 * hepsi teslim edilince fis "Teslim tamamlandi". Isaretleme fis token'iyla edge
 * "cek_isaretle" (sa_cek_token_isaretle) uzerinden: teslim alanin ADI kaydedilir.
 * 27.10.2026: /cek/[token] "Onayli satin alma fisi" belgesi; "Onayli fisler" sekmesinden
 * fis acilir / baglantisi kopyalanip ilgili departmana iletilir. Departman "Test" bayragi:
 * o departmanin mailleri SADECE test adresine (test adresi) gider. Departman silinebilir
 * (sa_departman_sil: listeleri + kalemleriyle birlikte, kalici).
 * Tablolar istemciye SADECE okunur; yazmalar RPC / edge function ile.
 * 21.11.2026 ON ONAY + HAFTALIK TOPLU LISTE: departman formu once "Ön onay" sekmesinde
 * (Volkan Bey) birikir; cumartesi "Toplu listeyi oluştur" ile secilen formlar TSA-YYYY-NNNN
 * toplu listesiyle Burak Bey'e TEK mail olarak sunulur (acil form "Acil: hemen onaya sun").
 * Burak Bey toplu listeye "Onay bekleyen"de TEK kartta karar verir (edge "toplu_karar");
 * onayli fis / sonuc maili form (departman) bazinda eskisi gibi.
 * 28.10.2026 karar ekrani notlari (urunEslesme: ayni / benzer ad): kalem baska bir
 * departmanin onay bekleyen formunda da varsa, son 30 gunde ayni departmana onaylandiysa
 * ya da ayni formda birden fazla geciyorsa kalemin altinda gosterilir.
 * 31.10.2026: kalemde tedarikci; Departmanlar tablosunda "Haftalik liste" (gun + hatirlatma
 * e-postasi, sa_departman_haftalik). O gun 09:00 TR liste gonderilmediyse pg_cron
 * "satin-alma-haftalik" hatirlatma e-postasi gonderir.
 */

type Departman = { id: string; ad: string; token: string; aktif: boolean; test: boolean; sira: number; haftalik_gun: number | null; hatirlatma_eposta: string | null };
type ListeSatiri = Omit<SaListe, "departman" | "sirket" | "kalemler"> & {
  departman_id: string;
  gonderim_maili_hata: string | null;
  sonuc_maili_hata: string | null;
  satin_alma_kalemleri: SaKalem[];
};
type Liste = SaListe & { departman_id: string; gonderim_maili_hata: string | null; sonuc_maili_hata: string | null; on_onay_email?: string | null };
/** 14.11.2026: degistir = "Degistirerek onayla" (onay_miktar + onay_notu gonderilir) */
type KararSecimi = { karar: "onaylandi" | "reddedildi"; red_nedeni: string; degistir: boolean; onay_miktar: string; onay_notu: string };
type Sekme = "on_onay" | "bekleyen" | "cek" | "gecmis" | "departmanlar";
/** Karar ekraninda kalem notlari (28.10.2026). */
type KalemNotlari = {
  formda: number; // ayni formda ayni urunun diger satir sayisi
  digerleri: { departman: string; liste_no: string | null; kalem: SaKalem; benzer: boolean }[];
  son30: { liste_no: string | null; tarih: string; kalem: SaKalem; benzer: boolean }[];
};
const OTUZ_GUN_MS = 30 * 24 * 60 * 60 * 1000;

function kalemNotlariHesapla(bekleyenler: Liste[], sonuclananlar: Liste[]): Map<string, KalemNotlari> {
  const sonuc = new Map<string, KalemNotlari>();
  const sinir = Date.now() - OTUZ_GUN_MS;
  const yakin = sonuclananlar.filter((o) => o.karar_zamani && new Date(o.karar_zamani).getTime() >= sinir);
  for (const l of bekleyenler) {
    for (const k of l.kalemler) {
      const n: KalemNotlari = { formda: 0, digerleri: [], son30: [] };
      n.formda = l.kalemler.filter((x) => x.id !== k.id && urunEslesme(x.urun, k.urun) === "ayni").length;
      // Diger departmanlarin (ayni test durumundaki) onay bekleyen formlari
      for (const o of bekleyenler) {
        if (o.id === l.id || o.test !== l.test) continue;
        for (const x of o.kalemler) {
          const e = urunEslesme(k.urun, x.urun);
          if (e) n.digerleri.push({ departman: o.departman, liste_no: o.liste_no, kalem: x, benzer: e === "benzer" });
        }
      }
      // Son 30 gunde AYNI departmana onaylananlar
      for (const o of yakin) {
        if (o.departman_id !== l.departman_id) continue;
        for (const x of o.kalemler) {
          if (x.karar !== "onaylandi") continue;
          const e = urunEslesme(k.urun, x.urun);
          if (e) n.son30.push({ liste_no: o.liste_no, tarih: o.karar_zamani as string, kalem: x, benzer: e === "benzer" });
        }
      }
      if (n.formda || n.digerleri.length || n.son30.length) sonuc.set(k.id, n);
    }
  }
  return sonuc;
}

const LISTE_KOLONLARI = "id, liste_no, durum, departman_id, toplu_id, on_onay_email, onaya_sunma_zamani, gonderen_ad, gonderim_zamani, karar_veren_email, karar_zamani, karar_notu, gonderim_maili, gonderim_maili_hata, sonuc_maili, sonuc_maili_hata, cek_durumu, cek_tamamlanma, cek_token, test, satin_alma_kalemleri(id, kategori, urun, miktar, birim, aciliyet, aciklama, talep_eden, karar, red_nedeni, olusturma, alindi, alinma_zamani, alan_ad, tedarikci, onay_miktar, onay_notu)";

const kartStil = { backgroundColor: CARD_BG, borderColor: CARD_BORDER } as React.CSSProperties;
const girdiSinifi = "w-full px-3 py-2 border rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const girdiStil = { borderColor: CARD_BORDER, backgroundColor: CARD_BG } as React.CSSProperties;
// 13.11.2026: adres repoda yazmaz (herkese acik); gercek adres sunucuda SATIN_ALMA_TEST_ALICISI secret'inda.
const TEST_ALICISI = "test";
/** Hizli red nedenleri (tek tik; istenirse elle yazilir). */
const RED_NEDENLERI = ["Stokta var", "Bütçe dışı", "Gerekli değil", "Ertelendi"];

function TestRozeti() {
  return <span className="ml-2 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 tracking-wide" title={`Test departmanı: e-postalar yalnızca ${TEST_ALICISI} adresine gider`}>TEST</span>;
}

function SatinAlmaIcerik() {
  const { companyId, loading: authLoading, yetkiler, user } = useAuth();
  const { showToast } = useToast();
  const params = useSearchParams();
  const hedefListe = params?.get("liste") || null;
  const hedefToplu = params?.get("toplu") || null;

  const [departmanlar, setDepartmanlar] = useState<Departman[]>([]);
  const [listeler, setListeler] = useState<Liste[]>([]);
  const [toplular, setToplular] = useState<TopluSatiri[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sekme, setSekme] = useState<Sekme>("bekleyen");
  const hedefIslendi = useRef(false);

  const yetkili = !!yetkiler.sayfa_yetkileri.satin_alma;

  const getir = useCallback(async (sessiz = false) => {
    if (!companyId) return;
    if (sessiz) setYenileniyor(true);
    const [dRes, lRes, tRes] = await Promise.all([
      supabase.from("satin_alma_departmanlari").select("id, ad, token, aktif, test, sira, haftalik_gun, hatirlatma_eposta").eq("company_id", companyId).order("sira").order("ad"),
      supabase.from("satin_alma_listeleri").select(LISTE_KOLONLARI).eq("company_id", companyId)
        .order("gonderim_zamani", { ascending: false, nullsFirst: true }).limit(300),
      topluListeleriOku(companyId),
    ]);
    if (dRes.error || lRes.error || tRes.hata) {
      setHata(`Veriler okunamadı: ${(dRes.error || lRes.error)?.message || tRes.hata}`);
    } else {
      setToplular(tRes.veri);
      const dep = (dRes.data || []) as Departman[];
      const adlar = new Map(dep.map((d) => [d.id, d.ad]));
      const testler = new Set(dep.filter((d) => d.test).map((d) => d.id));
      setDepartmanlar(dep);
      setListeler(((lRes.data || []) as unknown as ListeSatiri[]).map(({ satin_alma_kalemleri, ...l }) => ({
        ...l,
        departman: adlar.get(l.departman_id) || "-",
        // Gonderilmis formda FORMUN test bayragi (gonderim aninda yazilir); taslakta departmaninki
        test: l.durum === "taslak" ? testler.has(l.departman_id) : l.test === true,
        sirket: null,
        kalemler: [...(satin_alma_kalemleri || [])].sort((a, b) => a.olusturma.localeCompare(b.olusturma) || a.id.localeCompare(b.id)),
      })));
      setHata(null);
    }
    setYukleniyor(false);
    setYenileniyor(false);
  }, [companyId]);

  useEffect(() => { if (!authLoading && yetkili) getir(); }, [authLoading, yetkili, getir]);

  const bekleyenler = useMemo(() => listeler.filter((l) => l.durum === "bekliyor").sort((a, b) => (a.gonderim_zamani || "").localeCompare(b.gonderim_zamani || "")), [listeler]);
  const onOnaylar = useMemo(() => listeler.filter((l) => l.durum === "on_onay").sort((a, b) => (a.gonderim_zamani || "").localeCompare(b.gonderim_zamani || "")), [listeler]);
  const ayrik = useMemo(() => bekleyenleriAyir(bekleyenler), [bekleyenler]);
  const topluBilgi = useMemo(() => new Map(toplular.map((t) => [t.id, t])), [toplular]);
  const sonuclananlar = useMemo(() => listeler.filter((l) => l.durum === "sonuclandi"), [listeler]);
  const taslaklar = useMemo(() => new Map(listeler.filter((l) => l.durum === "taslak").map((l) => [l.departman_id, l])), [listeler]);
  const kalemNotlari = useMemo(() => kalemNotlariHesapla(bekleyenler, sonuclananlar), [bekleyenler, sonuclananlar]);

  // Mail'deki "Listeyi incele" baglantisi: ?liste=<id> / ?toplu=<id> -> ilgili sekme + kaydir.
  // 21.11.2026: baglanti yoksa yonetici (Volkan Bey) on onayda form varsa "Ön onay" sekmesiyle acar.
  useEffect(() => {
    if (hedefIslendi.current || yukleniyor) return;
    if (hedefToplu) {
      const varMi = listeler.some((x) => x.toplu_id === hedefToplu);
      if (!varMi) return;
      hedefIslendi.current = true;
      const bekliyor = listeler.some((x) => x.toplu_id === hedefToplu && x.durum === "bekliyor");
      setSekme(bekliyor ? "bekleyen" : "cek");
      if (bekliyor) setTimeout(() => document.getElementById(`liste-${hedefToplu}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
      return;
    }
    if (!hedefListe) {
      hedefIslendi.current = true;
      if (onOnaylar.length > 0 && yoneticiMi(user?.email)) setSekme("on_onay");
      return;
    }
    const l = listeler.find((x) => x.id === hedefListe);
    if (!l) return;
    hedefIslendi.current = true;
    // Toplu listeyle sunulan form: toplu kartina kaydir
    const kart = l.durum === "bekliyor" && l.toplu_id ? l.toplu_id : l.id;
    setSekme(l.durum === "sonuclandi" ? "cek" : l.durum === "on_onay" ? "on_onay" : "bekleyen");
    setTimeout(() => document.getElementById(`liste-${kart}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }, [hedefListe, hedefToplu, listeler, onOnaylar.length, user?.email, yukleniyor]);

  const fisSayisi = useMemo(() => sonuclananlar.filter((l) => listeOzeti(l).onay > 0).length, [sonuclananlar]);
  const teslimBekleyen = useMemo(() => sonuclananlar.filter((l) => teslimDurumu(l) === "bekliyor").length, [sonuclananlar]);

  const topluMailTekrar = async (topluId: string) => {
    const r = await satinAlmaCagir<{ mail: string; alicilar: string[] }>({ islem: "toplu_mail_tekrar", toplu_id: topluId }, true);
    if (!r.ok) showToast(r.hata, "error");
    else if (r.veri.mail === "gonderildi") showToast(`E-posta gönderildi: ${r.veri.alicilar.join(", ")}`, "success");
    else showToast("E-posta yine gönderilemedi. Biraz sonra tekrar deneyin.", "error");
    getir(true);
  };

  const mailTekrar = async (l: Liste, tur: "gonderim" | "sonuc") => {
    const r = await satinAlmaCagir<{ mail: string; alicilar: string[] }>({ islem: "mail_tekrar", liste_id: l.id, tur }, true);
    if (!r.ok) showToast(r.hata, "error");
    else if (r.veri.mail === "gonderildi") showToast(`E-posta gönderildi: ${r.veri.alicilar.join(", ")}`, "success");
    else showToast("E-posta yine gönderilemedi. Biraz sonra tekrar deneyin.", "error");
    getir(true);
  };

  if (authLoading || (yetkili && yukleniyor)) {
    return <SayfaYukleniyor className="flex justify-center py-24" boyut={26} />;
  }

  return (
    <div className="max-w-6xl">
      <SayfaBasligi
        ikon={<ShoppingCart size={20} />}
        baslik="Satın Alma"
        aciklama="Departmanların satın alma talepleri önce ön onayda birikir; cumartesi tüm departmanların formları tek toplu listeyle (acilse hemen) Burak Bey'in onayına sunulur. Onaylananlardan oluşan satın alma fişi execution@unex.com.tr adresine gider."
        sag={
          <button onClick={() => getir(true)} disabled={yenileniyor}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5 disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
            <RefreshCw size={14} className={yenileniyor ? "animate-spin" : ""} /> Yenile
          </button>
        }
      />

      {hata && <p className="mb-4 text-sm text-red-400 flex items-center gap-1.5" role="alert"><AlertTriangle size={14} /> {hata}</p>}

      <div className="flex flex-wrap gap-1 p-1 rounded-xl border mb-5 w-fit max-w-full" style={kartStil} role="tablist">
        {([
          ["on_onay", `Ön onay (${onOnaylar.length})`],
          ["bekleyen", `Onay bekleyen (${ayrik.toplular.length + ayrik.tekler.length})`],
          ["cek", `Onaylı fişler${fisSayisi ? ` (${fisSayisi}${teslimBekleyen ? ` · ${teslimBekleyen} teslim bekliyor` : ""})` : ""}`],
          ["gecmis", "Departman geçmişi"],
          ["departmanlar", "Departmanlar ve bağlantılar"],
        ] as [Sekme, string][]).map(([k, etiket]) => (
          <button key={k} role="tab" aria-selected={sekme === k} onClick={() => setSekme(k)}
            className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
            style={sekme === k ? { backgroundColor: "rgba(16,185,129,0.16)", color: "#fff" } : { color: TEXT_MUTED }}>
            {etiket}
          </button>
        ))}
      </div>

      {sekme === "on_onay" && <OnOnayPaneli listeler={onOnaylar} onDegisti={(mesaj, tur, sekmeye) => { showToast(mesaj, tur); if (sekmeye) setSekme(sekmeye); getir(true); }} />}

      {sekme === "bekleyen" && (
        bekleyenler.length === 0
          ? <EmptyState icon={<Inbox size={40} />} title="Onay bekleyen liste yok" description="Ön onaydan sunulan formlar (cumartesi toplu liste ya da acil form) burada görünür ve e-posta gelir." />
          : <div className="space-y-5">
              {ayrik.toplular.map((t) => {
                const bilgi = topluBilgi.get(t.id);
                const { liste, kalemFormu } = topluSanalListe(t.id, bilgi?.toplu_no || "Toplu liste", t.listeler);
                const kalemOnceki = new Map<string, Liste[]>();
                const formOnceki = new Map(t.listeler.map((l) => [l.id, oncekiListeler(l, listeler)]));
                kalemFormu.forEach((l, kalemId) => kalemOnceki.set(kalemId, formOnceki.get(l.id) || []));
                return (
                  <KararKarti key={t.id} liste={{ ...liste, gonderim_maili: bilgi?.onay_maili ?? null, gonderim_maili_hata: bilgi?.onay_maili_hata ?? null, gonderen_ad: bilgi?.olusturan_email || liste.gonderen_ad, gonderim_zamani: bilgi?.olusturma || liste.gonderim_zamani }}
                    vurgulu={t.id === hedefToplu || t.listeler.some((l) => l.id === hedefListe)} onMailTekrar={mailTekrar} notlar={kalemNotlari} onceki={[]}
                    toplu={{ listeler: t.listeler, kalemFormu, kalemOnceki, onMailTekrar: () => topluMailTekrar(t.id) }}
                    onKaydedildi={(mesaj, tur) => { showToast(mesaj, tur); getir(true); }} />
                );
              })}
              {ayrik.tekler.map((l) => (
                <KararKarti key={l.id} liste={l} vurgulu={l.id === hedefListe} onMailTekrar={mailTekrar} notlar={kalemNotlari} onceki={oncekiListeler(l, listeler)}
                  onKaydedildi={(mesaj, tur) => { showToast(mesaj, tur); getir(true); }} />
              ))}
            </div>
      )}

      {sekme === "cek" && <CekListeleri listeler={sonuclananlar} departmanlar={departmanlar} hedef={hedefListe} onMailTekrar={mailTekrar} onDegisti={() => getir(true)} />}

      {sekme === "gecmis" && <DepartmanGecmisi listeler={sonuclananlar} departmanlar={departmanlar} />}

      {sekme === "departmanlar" && <Departmanlar departmanlar={departmanlar} taslaklar={taslaklar} listeler={listeler} onDegisti={() => getir(true)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 21.11.2026 ON ONAY (Volkan Bey): formlar hafta boyunca birikir; cumartesi toplu liste,
// acilse tek form hemen Burak Bey'e. Kalem karari burada VERILMEZ (Burak Bey verir).
// ---------------------------------------------------------------------------
function OnOnayPaneli({ listeler, onDegisti }: {
  listeler: Liste[];
  onDegisti: (mesaj: string, tur: "success" | "error", sekmeye?: Sekme) => void;
}) {
  // Varsayilan secimden FARKLI isaretlenenler (yeni gelen form varsayilanla secili gelir)
  const [degisen, setDegisen] = useState<Set<string>>(() => new Set());
  const [acik, setAcik] = useState<Set<string>>(() => new Set());
  const [onizleme, setOnizleme] = useState(false);
  const [onay, setOnay] = useState<{ tur: "toplu" } | { tur: "acil"; liste: Liste } | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const varsayilan = useMemo(() => varsayilanDahil(listeler), [listeler]);
  const dahil = (l: Liste) => (degisen.has(l.id) ? !varsayilan(l) : varsayilan(l));
  const secilenler = listeler.filter(dahil);
  const karisik = new Set(secilenler.map((l) => l.test === true)).size > 1;
  const kalemler = secilenler.flatMap((l) => l.kalemler.map((k) => ({ ...k, departman: l.departman })));
  const departmanSayisi = new Set(secilenler.map((l) => l.departman)).size;
  const acilSayisi = kalemler.filter((k) => k.aciliyet === "acil").length;
  const gruplar = useMemo(() => tedarikciGruplari(kalemler), [kalemler]);
  const cumartesi = satinAlmaGunuMu();
  const testSecili = secilenler.some((l) => l.test);

  const degistir = (id: string) => setDegisen((s) => { const y = new Set(s); if (y.has(id)) y.delete(id); else y.add(id); return y; });
  const ac = (id: string) => setAcik((s) => { const y = new Set(s); if (y.has(id)) y.delete(id); else y.add(id); return y; });

  const gonder = async () => {
    if (!onay) return;
    setCalisiyor(true);
    if (onay.tur === "toplu") {
      const r = await satinAlmaCagir<{ toplu_no: string; form: number; mail: string; alicilar: string[] }>({ islem: "toplu_sun", liste_ids: secilenler.map((l) => l.id) }, true);
      setCalisiyor(false);
      setOnay(null);
      if (!r.ok) { onDegisti(r.hata, "error"); return; }
      setDegisen(new Set());
      onDegisti(r.veri.mail === "gonderildi"
        ? `${r.veri.toplu_no} toplu listesi (${r.veri.form} form) Burak Bey'in onayına sunuldu; e-posta ${r.veri.alicilar.join(", ")} adresine gitti.`
        : `${r.veri.toplu_no} onaya sunuldu ancak e-posta gönderilemedi. "Onay bekleyen"den tekrar gönderebilirsiniz.`,
      r.veri.mail === "gonderildi" ? "success" : "error", "bekleyen");
      return;
    }
    const l = onay.liste;
    const r = await satinAlmaCagir<{ liste_no: string; mail: string; alicilar: string[] }>({ islem: "onaya_sun", liste_id: l.id }, true);
    setCalisiyor(false);
    setOnay(null);
    if (!r.ok) { onDegisti(r.hata, "error"); return; }
    onDegisti(r.veri.mail === "gonderildi"
      ? `${l.liste_no} acil olarak Burak Bey'in onayına sunuldu; e-posta ${r.veri.alicilar.join(", ")} adresine gitti.`
      : `${l.liste_no} onaya sunuldu ancak e-posta gönderilemedi. "Onay bekleyen"den tekrar gönderebilirsiniz.`,
    r.veri.mail === "gonderildi" ? "success" : "error");
  };

  if (listeler.length === 0) {
    return <EmptyState icon={<Inbox size={40} />} title="Ön onayda form yok" description="Departmanlar talep formunu gönderdiğinde burada birikir ve size e-posta gelir. Cumartesi biriken formları tek toplu liste olarak Burak Bey'in onayına sunarsınız." />;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border overflow-hidden" style={{ ...kartStil, ...(cumartesi ? { borderColor: ACCENT } : {}) }} data-testid="toplu-panel">
        <header className="px-4 sm:px-5 py-3.5 border-b flex flex-wrap items-center gap-x-4 gap-y-2" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
          <CalendarDays size={18} className="shrink-0" style={{ color: cumartesi ? "#34D399" : TEXT_MUTED }} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-white">Haftalık toplu alışveriş listesi {cumartesi && <span className="ml-1.5 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 tracking-wide">BUGÜN SATIN ALMA GÜNÜ</span>}</p>
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
              Satın alma günü cumartesi. Seçili <b className="text-white">{secilenler.length} form</b> · {departmanSayisi} departman · <b className="text-white">{kalemler.length} kalem</b>{gruplar.some((g) => g.tedarikci) ? ` · ${gruplar.length} tedarikçi` : ""}
              {acilSayisi > 0 && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400">{acilSayisi} ACİL</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setOnizleme((x) => !x)} disabled={!secilenler.length} aria-expanded={onizleme}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5 disabled:opacity-40" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              <ChevronDown size={12} className={`transition-transform ${onizleme ? "" : "-rotate-90"}`} /> Toplu listeyi önizle
            </button>
            <button onClick={() => setOnay({ tur: "toplu" })} disabled={!secilenler.length || karisik || calisiyor} data-testid="toplu-sun"
              title={karisik ? "Test departmanının formları gerçek formlarla aynı listeye eklenemez" : undefined}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110" style={{ backgroundColor: ACCENT }}>
              {calisiyor && onay?.tur === "toplu" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Toplu listeyi oluştur ve Burak Bey&apos;e sun
            </button>
          </div>
        </header>
        <p className="px-4 sm:px-5 py-2 text-xs border-b" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
          Hafta boyunca gelen formlar burada birikir. Toplu liste, seçili formların hepsini tek listede Burak Bey&apos;in onayına sunar; Burak Bey tüm kalemlere tek ekranda karar verir. Acil bir form için kartındaki <b className="text-white font-semibold">Acil: hemen onaya sun</b> düğmesini kullanın.
          {karisik && <span className="block mt-1 text-amber-400">Test departmanı formu seçili: test ve gerçek formlar aynı toplu listeye eklenemez.</span>}
        </p>
        {onizleme && secilenler.length > 0 && (
          <div data-testid="toplu-onizleme">
            {gruplar.map((g) => (
              <div key={g.tedarikci ?? "-"}>
                <p className="px-4 sm:px-5 py-2 border-b text-sm font-bold text-white" style={{ borderColor: CARD_BORDER, backgroundColor: "rgba(255,255,255,0.03)" }}>
                  {g.tedarikci ?? "Tedarikçi belirtilmemiş"} <span className="text-xs font-normal" style={{ color: TEXT_MUTED }}>· {g.kalemler.length} kalem</span>
                </p>
                <ul className="divide-y border-b" style={{ borderColor: CARD_BORDER }}>
                  {g.kalemler.map((k) => (
                    <li key={k.id} className="px-4 sm:px-5 py-1.5 grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_120px_200px] gap-x-3 items-center text-sm" style={{ borderColor: CARD_BORDER }}>
                      <span className="text-white break-words">{k.urun}{k.aciliyet === "acil" && <span className="ml-1.5 align-middle text-[9px] font-bold px-1 py-px rounded bg-red-500/15 text-red-400">ACİL</span>}{k.aciklama && <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{k.aciklama}</span>}</span>
                      <span className="text-right font-semibold text-white whitespace-nowrap tabular-nums">{miktarBirim(k)}</span>
                      <span className="hidden sm:block text-xs truncate" style={{ color: TEXT_MUTED }}><span className="text-white">{k.departman}</span> · {k.talep_eden}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {listeler.map((l) => {
        const o = listeOzeti(l);
        const secili = dahil(l);
        const goster = acik.has(l.id);
        return (
          <section key={l.id} id={`liste-${l.id}`} className="rounded-xl border overflow-hidden scroll-mt-4" style={kartStil} data-testid="on-onay-form">
            <header className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="inline-flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
                <input type="checkbox" checked={secili} onChange={() => degistir(l.id)} className="w-4 h-4 accent-emerald-500 shrink-0" aria-label={`${l.departman} formunu toplu listeye ekle`} />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white">{l.departman} <span className="font-mono text-xs font-medium whitespace-nowrap" style={{ color: TEXT_MUTED }}>· {l.liste_no}</span>{l.test && <TestRozeti />}</span>
                  <span className="block text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                    {l.gonderen_ad} · {saTarih(l.gonderim_zamani)} · {o.toplam} kalem
                    {o.acil > 0 && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400">{o.acil} ACİL</span>}
                    {!secili && <span className="ml-1.5 text-amber-400">· toplu listeye eklenmeyecek</span>}
                  </span>
                </span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => ac(l.id)} aria-expanded={goster} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                  <ChevronDown size={12} className={`transition-transform ${goster ? "" : "-rotate-90"}`} /> Kalemler
                </button>
                <button onClick={() => setOnay({ tur: "acil", liste: l })} disabled={calisiyor} data-testid="acil-sun"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-40">
                  {calisiyor && onay?.tur === "acil" && onay.liste.id === l.id ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />} Acil: hemen onaya sun
                </button>
              </div>
            </header>
            {goster && (
              <ul className="divide-y border-t" style={{ borderColor: CARD_BORDER }}>
                {tedarikciGruplari(l.kalemler).flatMap((g) => g.kalemler.map((k) => (
                  <li key={k.id} className="px-4 sm:px-5 py-1.5 grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_140px_120px_160px] gap-x-3 items-center text-sm" style={{ borderColor: CARD_BORDER }}>
                    <span className="text-white break-words">{k.urun}{k.aciliyet === "acil" && <span className="ml-1.5 align-middle text-[9px] font-bold px-1 py-px rounded bg-red-500/15 text-red-400">ACİL</span>}{k.aciklama && <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{k.aciklama}</span>}</span>
                    <span className="hidden sm:block text-xs truncate" style={{ color: TEXT_MUTED }}>{k.tedarikci || "-"}</span>
                    <span className="text-right font-semibold text-white whitespace-nowrap tabular-nums">{miktarBirim(k)}</span>
                    <span className="hidden sm:block text-xs truncate" style={{ color: TEXT_MUTED }}>{k.talep_eden}</span>
                  </li>
                )))}
              </ul>
            )}
          </section>
        );
      })}

      <ConfirmDialog
        open={!!onay}
        onOpenChange={(a) => { if (!a && !calisiyor) setOnay(null); }}
        title={onay?.tur === "acil" ? `${onay.liste.liste_no} acil olarak onaya sunulsun mu?` : "Toplu liste Burak Bey'in onayına sunulsun mu?"}
        description={onay?.tur === "acil"
          ? `${onay.liste.departman} formu (${onay.liste.kalemler.length} kalem) haftalık listeyi beklemeden Burak Bey'in onayına sunulur ve ${onay.liste.test ? `yalnızca ${TEST_ALICISI} adresine (TEST)` : "bbt@unex.com.tr adresine"} e-posta gider.`
          : `${secilenler.length} form (${departmanSayisi} departman, ${kalemler.length} kalem) tek toplu liste olarak Burak Bey'in onayına sunulur ve ${testSecili ? `yalnızca ${TEST_ALICISI} adresine (TEST)` : "bbt@unex.com.tr adresine"} tek e-posta gider.${listeler.length > secilenler.length ? ` Seçilmeyen ${listeler.length - secilenler.length} form ön onayda kalır.` : ""}`}
        confirmLabel="Evet, onaya sun" cancelLabel="Vazgeç"
        onConfirm={gonder} loading={calisiyor} loadingLabel="Gönderiliyor..."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onay bekleyen liste: kalem bazinda karar
// ---------------------------------------------------------------------------
/** 21.11.2026: haftalik toplu liste karari - tum formlarin kalemleri TEK kartta (liste = sanal liste). */
type TopluKarar = { listeler: Liste[]; kalemFormu: Map<string, Liste>; kalemOnceki: Map<string, Liste[]>; onMailTekrar: () => Promise<void> };

function KararKarti({ liste, vurgulu, onKaydedildi, onMailTekrar, notlar, onceki, toplu }: {
  liste: Liste; vurgulu: boolean; notlar: Map<string, KalemNotlari>; onceki: Liste[];
  onKaydedildi: (mesaj: string, tur: "success" | "error") => void;
  onMailTekrar: (l: Liste, tur: "gonderim" | "sonuc") => Promise<void>;
  toplu?: TopluKarar;
}) {
  const [secim, setSecim] = useState<Record<string, KararSecimi>>({});
  const [not, setNot] = useState("");
  const [onay, setOnay] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [mailGonderiliyor, setMailGonderiliyor] = useState(false);
  const [kapali, setKapali] = useState<Set<string>>(() => new Set());
  const [yalnizDegisen, setYalnizDegisen] = useState(false);
  const o = listeOzeti(liste);
  const onaySayisi = liste.kalemler.filter((k) => secim[k.id]?.karar === "onaylandi").length;
  const redSayisi = liste.kalemler.filter((k) => secim[k.id]?.karar === "reddedildi").length;
  const kalan = liste.kalemler.length - onaySayisi - redSayisi;
  const notluKalem = liste.kalemler.filter((k) => notlar.has(k.id)).length;
  // 14.11.2026 "Degistirerek onayla": gecerli miktar girilmemis satir kaydi engeller
  const degisenOnay = liste.kalemler.filter((k) => secim[k.id]?.karar === "onaylandi" && secim[k.id]?.degistir);
  const gecersizDegisiklik = degisenOnay.filter((k) => miktarOku(secim[k.id].onay_miktar) === null).length;
  const miktariDegisen = degisenOnay.filter((k) => { const m = miktarOku(secim[k.id].onay_miktar); return m !== null && m !== Number(k.miktar); }).length;

  // 14.11.2026: gecen haftaya gore rozetler + tedarikci gruplari
  const rozetler = useMemo(() => new Map(liste.kalemler.map((k) => [k.id, haftaKarsilastir(k, toplu ? toplu.kalemOnceki.get(k.id) || [] : onceki)])), [liste.kalemler, onceki, toplu]);
  const karsilastirmaVar = toplu ? Array.from(toplu.kalemOnceki.values()).some((x) => x.length > 0) : onceki.length > 0;
  const formAdi = (k: SaKalem) => toplu?.kalemFormu.get(k.id)?.departman;
  const dikkat = (k: SaKalem) => k.aciliyet === "acil" || notlar.has(k.id) || !!rozetler.get(k.id)?.degisti;
  const degisenSayisi = liste.kalemler.filter(dikkat).length;
  const gruplar = useMemo(() => tedarikciGruplari(liste.kalemler), [liste.kalemler]);
  const gruplu = gruplar.some((g) => g.tedarikci);
  const sira = useMemo(() => new Map(gruplar.flatMap((g) => g.kalemler).map((k, i) => [k.id, i + 1])), [gruplar]);

  const sec = (id: string, karar: KararSecimi["karar"], degistir = false) =>
    setSecim((s) => {
      const once = s[id];
      const k = liste.kalemler.find((x) => x.id === id);
      return { ...s, [id]: {
        karar, red_nedeni: once?.red_nedeni || "", degistir: karar === "onaylandi" && degistir,
        onay_miktar: once?.onay_miktar ?? (k ? miktarYaz(k.miktar) : ""), onay_notu: once?.onay_notu || "",
      } };
    });
  const kararSec = (k: SaKalem): KararSecimi => ({ karar: "onaylandi", red_nedeni: "", degistir: false, onay_miktar: miktarYaz(k.miktar), onay_notu: "" });
  const tumunu = () => setSecim(Object.fromEntries(liste.kalemler.map((k) => [k.id, kararSec(k)])));
  // Hizli akis: once reddedilecekler isaretlenir, sonra karar verilmemis tum kalemler tek tikla onaylanir
  const kalanlariOnayla = (kalemler: SaKalem[] = liste.kalemler) =>
    setSecim((s) => ({ ...s, ...Object.fromEntries(kalemler.filter((k) => !s[k.id]).map((k) => [k.id, kararSec(k)])) }));
  const nedenYaz = (id: string, red_nedeni: string) => setSecim((x) => ({ ...x, [id]: { ...x[id], karar: "reddedildi", red_nedeni, degistir: false } }));
  const onayAlani = (id: string, alanlar: Partial<Pick<KararSecimi, "onay_miktar" | "onay_notu">>) => setSecim((x) => ({ ...x, [id]: { ...x[id], ...alanlar } }));
  const grupAc = (anahtar: string) => setKapali((s) => { const y = new Set(s); if (y.has(anahtar)) y.delete(anahtar); else y.add(anahtar); return y; });

  const kaydet = async () => {
    setHata(null);
    setKaydediliyor(true);
    const r = await satinAlmaCagir<{ mail: string; alicilar: string[]; form?: number; mail_hatali?: number }>({
      ...(toplu ? { islem: "toplu_karar", toplu_id: liste.id } : { islem: "karar", liste_id: liste.id }), not: not.trim(),
      kararlar: liste.kalemler.map((k) => {
        const s = secim[k.id];
        const onaylandi = s?.karar === "onaylandi";
        return {
          id: k.id, karar: s?.karar,
          red_nedeni: s?.karar === "reddedildi" ? s.red_nedeni.trim() : "",
          onay_miktar: onaylandi && s.degistir ? miktarOku(s.onay_miktar) : null,
          onay_notu: onaylandi && s.degistir ? s.onay_notu.trim() : "",
        };
      }),
    }, true);
    setKaydediliyor(false);
    setOnay(false);
    if (!r.ok) { setHata(r.hata); onKaydedildi(r.hata, "error"); return; }
    if (toplu) {
      onKaydedildi(
        r.veri.mail === "gonderildi"
          ? `${liste.liste_no} kaydedildi; ${r.veri.form ?? toplu.listeler.length} departmanın sonucu ${r.veri.alicilar.join(", ")} adresine ayrı ayrı gönderildi.`
          : `${liste.liste_no} kaydedildi ancak ${r.veri.mail_hatali ?? "bazı"} e-posta gönderilemedi. "Onaylı fişler"den tekrar gönderebilirsiniz.`,
        r.veri.mail === "gonderildi" ? "success" : "error",
      );
      return;
    }
    onKaydedildi(
      r.veri.mail === "gonderildi"
        ? `${liste.liste_no} kaydedildi; ${onaySayisi ? "satın alma fişi" : "sonuç"} ${r.veri.alicilar.join(", ")} adresine gönderildi.`
        : `${liste.liste_no} kaydedildi ancak e-posta gönderilemedi. "Onaylı fişler"den tekrar gönderebilirsiniz.`,
      r.veri.mail === "gonderildi" ? "success" : "error",
    );
  };

  const kalemSatiri = (k: SaKalem) => {
    const s = secim[k.id];
    const rozet = rozetler.get(k.id);
    const degistir = s?.karar === "onaylandi" && s.degistir;
    const yeniMiktar = degistir ? miktarOku(s.onay_miktar) : null;
    return (
      <li key={k.id} className="px-4 sm:px-5 py-2" data-testid="karar-kalem"
        style={{ borderColor: CARD_BORDER, backgroundColor: s?.karar === "reddedildi" ? "rgba(239,68,68,0.05)" : s?.karar === "onaylandi" ? "rgba(16,185,129,0.04)" : undefined }}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[28px_minmax(0,1fr)_120px_150px_236px] gap-x-3 gap-y-1 items-center">
          <span className="hidden sm:block text-xs text-right tabular-nums" style={{ color: TEXT_MUTED }}>{sira.get(k.id)}</span>
          <div className="min-w-0">
            <p className="text-sm text-white break-words leading-snug">
              <span className="font-semibold">{k.urun}</span>
              {k.aciliyet === "acil" && <span className="ml-1.5 align-middle text-[9px] font-bold px-1 py-px rounded bg-red-500/15 text-red-400">ACİL</span>}
              {rozet && <HaftaRozetiEtiketi r={rozet} />}
            </p>
            <p className="text-[11px] leading-snug break-words" style={{ color: TEXT_MUTED }}>
              {KATEGORILER[k.kategori] ?? k.kategori}{k.aciklama ? ` · ${k.aciklama}` : ""}{!gruplu && k.tedarikci ? ` · Tedarikçi: ${k.tedarikci}` : ""}
              <span className="sm:hidden"> · <b className="text-white">{miktarBirim(k)}</b> · {formAdi(k) ? `${formAdi(k)} · ` : ""}{k.talep_eden}</span>
            </p>
          </div>
          <span className="hidden sm:block text-sm text-right font-semibold text-white whitespace-nowrap tabular-nums">
            {degistir && yeniMiktar !== null && yeniMiktar !== Number(k.miktar)
              ? <><span className="line-through font-normal mr-1.5" style={{ color: TEXT_MUTED }}>{miktarYaz(k.miktar)}</span><span className="text-emerald-400">{miktarBirim({ miktar: yeniMiktar, birim: k.birim })}</span></>
              : miktarBirim(k)}
          </span>
          <span className="hidden sm:block text-xs truncate" style={{ color: TEXT_MUTED }} title={formAdi(k) ? `${formAdi(k)} · ${k.talep_eden}` : k.talep_eden}>
            {formAdi(k) && <span className="block text-white font-medium truncate" data-testid="toplu-departman">{formAdi(k)}</span>}{k.talep_eden}
          </span>
          <div className="flex justify-end" role="group" aria-label={`${k.urun} kararı`}>
            <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: CARD_BORDER }}>
              <button onClick={() => sec(k.id, "onaylandi")} aria-pressed={s?.karar === "onaylandi" && !s.degistir}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold transition-colors"
                style={s?.karar === "onaylandi" && !s.degistir ? { backgroundColor: "rgba(16,185,129,0.2)", color: "#34D399" } : { color: TEXT_MUTED }}>
                <CheckCircle2 size={13} /> Onayla
              </button>
              <button onClick={() => sec(k.id, "onaylandi", true)} aria-pressed={!!degistir} title="Miktarı ya da kapsamı değiştirerek onayla"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border-l transition-colors"
                style={{ borderColor: CARD_BORDER, ...(degistir ? { backgroundColor: "rgba(245,158,11,0.18)", color: "#FBBF24" } : { color: TEXT_MUTED }) }}>
                <Pencil size={12} /> Değiştir
              </button>
              <button onClick={() => sec(k.id, "reddedildi")} aria-pressed={s?.karar === "reddedildi"}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border-l transition-colors"
                style={{ borderColor: CARD_BORDER, ...(s?.karar === "reddedildi" ? { backgroundColor: "rgba(239,68,68,0.18)", color: "#F87171" } : { color: TEXT_MUTED }) }}>
                <XCircle size={13} /> Reddet
              </button>
            </div>
          </div>
        </div>
        {notlar.has(k.id) && <KalemNotSatirlari n={notlar.get(k.id) as KalemNotlari} />}
        {degistir && (
          <div className="mt-1.5 sm:ml-[40px] flex flex-wrap items-center gap-2" data-testid="degistir-alani">
            <label className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: TEXT_MUTED }}>
              Onaylanan miktar
              <input value={s.onay_miktar} inputMode="decimal" maxLength={12} aria-label={`${k.urun} onaylanan miktar`}
                onChange={(e) => onayAlani(k.id, { onay_miktar: e.target.value })}
                className="w-20 px-2 py-1 border rounded-md text-xs text-right tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                style={{ ...girdiStil, ...(yeniMiktar === null ? { borderColor: "rgba(239,68,68,0.6)" } : {}) }} />
              <span>{BIRIMLER[k.birim] ?? k.birim}</span>
            </label>
            <input value={s.onay_notu} maxLength={300} aria-label={`${k.urun} onay notu`}
              onChange={(e) => onayAlani(k.id, { onay_notu: e.target.value })}
              placeholder="Onay notu (ör. Yalnız çay alınsın)" className="flex-1 min-w-[200px] px-2.5 py-1 border rounded-md text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30" style={girdiStil} />
            {yeniMiktar === null && <span className="text-[11px] text-red-400">Miktarı sayı olarak yazın</span>}
          </div>
        )}
        {s?.karar === "reddedildi" && (
          <div className="mt-1.5 sm:ml-[40px] flex flex-wrap items-center gap-1.5">
            {RED_NEDENLERI.map((n) => (
              <button key={n} onClick={() => nedenYaz(k.id, s.red_nedeni === n ? "" : n)} aria-pressed={s.red_nedeni === n}
                className="px-2 py-1 rounded-md border text-[11px] font-medium transition-colors"
                style={s.red_nedeni === n ? { borderColor: "rgba(239,68,68,0.55)", backgroundColor: "rgba(239,68,68,0.12)", color: "#F87171" } : { borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                {n}
              </button>
            ))}
            <input value={s.red_nedeni} maxLength={300} aria-label={`${k.urun} red nedeni`}
              onChange={(e) => nedenYaz(k.id, e.target.value)}
              placeholder="ya da red nedenini yazın (isteğe bağlı)" className="flex-1 min-w-[200px] px-2.5 py-1 border rounded-md text-xs text-white focus:outline-none focus:ring-2 focus:ring-red-500/30" style={girdiStil} />
          </div>
        )}
      </li>
    );
  };

  return (
    <section id={`liste-${liste.id}`} className="rounded-xl border overflow-hidden scroll-mt-4"
      style={{ ...kartStil, ...(vurgulu ? { borderColor: ACCENT, boxShadow: `0 0 0 1px ${ACCENT}` } : {}) }}>
      <header className="px-4 sm:px-5 py-3.5 border-b flex flex-wrap items-center gap-x-4 gap-y-2" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-white">{liste.departman} <span className="font-mono text-sm font-medium whitespace-nowrap" style={{ color: TEXT_MUTED }}>· {liste.liste_no}</span>{liste.test && <TestRozeti />}</p>
          <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
            {toplu && "Sunan: "}{liste.gonderen_ad} · {saTarih(liste.gonderim_zamani)}{toplu ? ` · ${toplu.listeler.length} form` : ""} · {o.toplam} kalem{gruplu ? ` · ${gruplar.length} tedarikçi` : ""}
            {o.acil > 0 && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400">{o.acil} ACİL</span>}
            {notluKalem > 0 && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400" title="Başka departmanda bekleyen, son 30 günde onaylanan ya da formda tekrar eden kalemler">{notluKalem} kalemde not</span>}
          </p>
          {toplu && (
            <p className="text-xs mt-0.5 break-words" style={{ color: TEXT_MUTED }} data-testid="toplu-formlar">
              Formlar: {toplu.listeler.map((l, i) => <React.Fragment key={l.id}>{i > 0 && ", "}<span className="text-white">{l.departman}</span> ({l.liste_no} · {l.kalemler.length} kalem)</React.Fragment>)}
            </p>
          )}
          {karsilastirmaVar && (
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }} data-testid="karar-karsilastirma">
              {toplu ? "Departmanların önceki listelerine" : `Önceki listeye (${onceki[0]?.liste_no})`} göre <b className="text-white font-semibold">{degisenSayisi}</b> kalem dikkat istiyor (yeni, miktarı artan, geçen sefer reddedilen, acil ya da notlu); {o.toplam - degisenSayisi} kalem aynı.
            </p>
          )}
        </div>
        {liste.gonderim_maili === "hata" && (
          <button disabled={mailGonderiliyor} onClick={async () => { setMailGonderiliyor(true); await (toplu ? toplu.onMailTekrar() : onMailTekrar(liste, "gonderim")); setMailGonderiliyor(false); }}
            title={liste.gonderim_maili_hata || undefined}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-60">
            {mailGonderiliyor ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Bildirim e-postası gitmedi · tekrar gönder
          </button>
        )}
        <div className="flex flex-wrap gap-1.5">
          {kalan > 0 && kalan < liste.kalemler.length && (
            <button onClick={() => kalanlariOnayla()} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10">
              <Check size={12} /> Kalanları onayla ({kalan})
            </button>
          )}
          <button onClick={tumunu} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
            <Check size={12} /> Tümünü onayla
          </button>
          {Object.keys(secim).length > 0 && (
            <button onClick={() => setSecim({})} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              <RotateCcw size={12} /> Temizle
            </button>
          )}
        </div>
      </header>

      {(liste.kalemler.length > 3 || karsilastirmaVar) && (
        <div className="px-4 sm:px-5 py-2 text-xs border-b flex flex-wrap items-center gap-x-4 gap-y-1.5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
          {liste.kalemler.length > 3 && Object.keys(secim).length === 0 && (
            <span className="flex-1 min-w-[260px]">
              Hızlı karar: yalnızca reddedeceğiniz kalemlerde <b className="text-white font-semibold">Reddet</b>&apos;e, miktarı azaltacaklarınızda <b className="text-white font-semibold">Değiştir</b>&apos;e basın; sonra <b className="text-white font-semibold">Kalanları onayla</b>.
            </span>
          )}
          {karsilastirmaVar && degisenSayisi < liste.kalemler.length && (
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none ml-auto">
              <input type="checkbox" checked={yalnizDegisen} onChange={(e) => setYalnizDegisen(e.target.checked)} className="w-4 h-4 accent-emerald-500" data-testid="yalniz-degisen" />
              <span className="text-white">Yalnız değişenleri göster</span> ({degisenSayisi})
            </label>
          )}
        </div>
      )}

      {/* Kalem tablosu: tek satir = tek kalem; tedarikci varsa tedarikci gruplari */}
      <div className="hidden sm:grid grid-cols-[28px_minmax(0,1fr)_120px_150px_236px] gap-x-3 px-4 sm:px-5 py-2 border-b text-[10px] font-semibold uppercase tracking-wide" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED, backgroundColor: "rgba(255,255,255,0.015)" }}>
        <span className="text-right">#</span><span>Ürün / hizmet</span><span className="text-right">Miktar</span><span>{toplu ? "Departman / talep eden" : "Talep eden"}</span><span className="text-right">Karar</span>
      </div>
      {gruplar.map((g) => {
        const anahtar = g.tedarikci ?? "-";
        const acik = !kapali.has(anahtar);
        const gorunen = yalnizDegisen ? g.kalemler.filter(dikkat) : g.kalemler;
        const gizli = g.kalemler.length - gorunen.length;
        const gOnay = g.kalemler.filter((k) => secim[k.id]?.karar === "onaylandi").length;
        const gRed = g.kalemler.filter((k) => secim[k.id]?.karar === "reddedildi").length;
        const gKalan = g.kalemler.length - gOnay - gRed;
        return (
          <div key={anahtar} data-testid="karar-grup">
            {gruplu && (
              <div className="px-4 sm:px-5 py-2 border-b flex flex-wrap items-center gap-x-3 gap-y-1.5" style={{ borderColor: CARD_BORDER, backgroundColor: "rgba(255,255,255,0.03)" }}>
                <button onClick={() => grupAc(anahtar)} aria-expanded={acik} className="inline-flex items-center gap-1.5 min-w-0 text-left">
                  <ChevronDown size={14} className={`shrink-0 transition-transform ${acik ? "" : "-rotate-90"}`} style={{ color: TEXT_MUTED }} />
                  <span className="text-sm font-bold text-white truncate">{g.tedarikci ?? "Tedarikçi belirtilmemiş"}</span>
                  <span className="text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>· {g.kalemler.length} kalem</span>
                </button>
                <span className="text-[11px] whitespace-nowrap" style={{ color: TEXT_MUTED }}>
                  {gOnay > 0 && <span className="text-emerald-400 font-semibold">{gOnay} onay</span>}
                  {gOnay > 0 && gRed > 0 && " · "}
                  {gRed > 0 && <span className="text-red-400 font-semibold">{gRed} red</span>}
                  {(gOnay > 0 || gRed > 0) && gKalan > 0 && " · "}
                  {gKalan > 0 && <span className="text-amber-400">{gKalan} bekliyor</span>}
                </span>
                {gKalan > 0 && (
                  <button onClick={() => kalanlariOnayla(g.kalemler)} data-testid="grubu-onayla"
                    className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10">
                    <Check size={12} /> Bu grubu onayla{gOnay + gRed > 0 ? ` (kalan ${gKalan})` : ""}
                  </button>
                )}
              </div>
            )}
            {acik && (
              <ul className="divide-y border-b last:border-b-0" style={{ borderColor: CARD_BORDER }}>
                {gorunen.map(kalemSatiri)}
                {gizli > 0 && (
                  <li className="px-4 sm:px-5 py-1.5 text-[11px] sm:pl-[60px]" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                    {gizli} değişmeyen kalem gizli{g.kalemler.filter((k) => !dikkat(k) && !secim[k.id]).length > 0 ? " · “Bu grubu onayla” ya da “Kalanları onayla” bunları da onaylar" : ""}
                  </li>
                )}
              </ul>
            )}
          </div>
        );
      })}

      <footer className="px-4 sm:px-5 py-4 border-t space-y-3" style={{ borderColor: CARD_BORDER }}>
        <div>
          <label htmlFor={`not-${liste.id}`} className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Not (isteğe bağlı, e-postaya eklenir)</label>
          <textarea id={`not-${liste.id}`} value={not} onChange={(e) => setNot(e.target.value)} rows={2} maxLength={500} className={girdiSinifi} style={girdiStil}
            placeholder="Ör. Onaylananlar bu hafta alınsın." />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" style={{ color: TEXT_MUTED }}>
            <span className="text-emerald-400 font-semibold">{onaySayisi} onay</span>{degisenOnay.length > 0 && <span className="text-amber-400"> ({degisenOnay.length} değiştirilerek)</span>} · <span className="text-red-400 font-semibold">{redSayisi} red</span>
            {kalan > 0 && <> · <span className="text-amber-400 font-semibold">{kalan} karar bekliyor</span></>}
            {gecersizDegisiklik > 0 && <> · <span className="text-red-400 font-semibold">{gecersizDegisiklik} kalemde onaylanan miktar eksik</span></>}
          </p>
          <button onClick={() => setOnay(true)} disabled={kalan > 0 || gecersizDegisiklik > 0 || kaydediliyor}
            title={kalan > 0 ? "Her kalem için Onayla, Değiştir ya da Reddet seçin" : gecersizDegisiklik > 0 ? "Değiştirilen kalemlerde onaylanan miktarı yazın" : undefined}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
            style={{ backgroundColor: ACCENT }}>
            {kaydediliyor ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Kararı kaydet ve gönder
          </button>
        </div>
        {hata && <p className="text-sm text-red-400" role="alert">{hata}</p>}
      </footer>

      <ConfirmDialog
        open={onay}
        onOpenChange={(a) => { if (!a) setOnay(false); }}
        title={`${liste.liste_no} kararı kaydedilsin mi?`}
        description={`${onaySayisi} kalem onaylanacak${miktariDegisen ? ` (${miktariDegisen} kalemin miktarı değiştirildi)` : ""}, ${redSayisi} kalem reddedilecek.${toplu ? ` Karar ${toplu.listeler.length} departmanın formuna birlikte kaydedilir; her departmanın sonucu (onaylı fişi)` : onaySayisi ? " Onaylananlardan satın alma fişi oluşur ve" : " Sonuç"} ${liste.test ? `yalnızca ${TEST_ALICISI} adresine (TEST)` : "execution@unex.com.tr adresine"} ${toplu ? "ayrı e-postayla" : "e-postayla"} gider; departman kendi bağlantısında görür. Karar sonradan değiştirilemez.`}
        confirmLabel="Evet, kaydet" cancelLabel="Vazgeç"
        onConfirm={kaydet} loading={kaydediliyor} loadingLabel="Kaydediliyor..."
      />
    </section>
  );
}

/** Gecen haftaya gore rozet (14.11.2026) */
function HaftaRozetiEtiketi({ r }: { r: HaftaRozeti }) {
  const renk: Record<HaftaRozeti["tur"], string> = {
    yeni: "bg-sky-500/15 text-sky-300", artti: "bg-amber-500/15 text-amber-300", birim: "bg-amber-500/15 text-amber-300",
    red: "bg-red-500/15 text-red-300", azaldi: "bg-white/5 text-slate-300", ayni: "bg-white/5 text-slate-400", her_hafta: "bg-emerald-500/10 text-emerald-300",
  };
  return <span className={`ml-1.5 align-middle text-[10px] font-semibold px-1.5 py-px rounded whitespace-nowrap ${renk[r.tur]}`} data-testid="hafta-rozeti" data-tur={r.tur}>{r.metin}</span>;
}

/** Karar ekrani kalem notlari: form ici tekrar, diger departman, son 30 gun. */
function KalemNotSatirlari({ n }: { n: KalemNotlari }) {
  // Ayni formdaki eslesmeler tek satirda (ornegin "Klasör · 3 Adet, klasör · 2 Adet")
  const gruplar: { departman: string; liste_no: string | null; satirlar: KalemNotlari["digerleri"] }[] = [];
  for (const d of n.digerleri) {
    const g = gruplar.find((x) => x.liste_no === d.liste_no);
    if (g) g.satirlar.push(d); else gruplar.push({ departman: d.departman, liste_no: d.liste_no, satirlar: [d] });
  }
  const kalem = (x: SaKalem, benzer: boolean) => <>{benzer && <span className="opacity-80">Benzer · </span>}<b className="font-semibold">{x.urun}</b> · {miktarBirim(x)}</>;
  return (
    <ul className="mt-1 sm:ml-[40px] space-y-0.5 text-[11.5px] leading-snug">
      {n.formda > 0 && (
        <li className="flex items-start gap-1.5 text-amber-400"><AlertTriangle size={12} className="shrink-0 mt-px" /> Bu formda {n.formda + 1} kez geçiyor; tek kalem olarak onaylamayı düşünün.</li>
      )}
      {gruplar.slice(0, 3).map((g) => (
        <li key={`d-${g.liste_no}`} className="flex items-start gap-1.5 text-amber-300/90">
          <Layers size={12} className="shrink-0 mt-px" />
          <span className="min-w-0 break-words">Başka departmanda da onay bekliyor: <b className="font-semibold">{g.departman}</b> · {g.satirlar.map((d, i) => <React.Fragment key={d.kalem.id}>{i > 0 && ", "}{kalem(d.kalem, d.benzer)}</React.Fragment>)} <span style={{ color: TEXT_MUTED }}>({g.liste_no})</span></span>
        </li>
      ))}
      {gruplar.length > 3 && <li className="pl-[18px]" style={{ color: TEXT_MUTED }}>ve {gruplar.length - 3} form daha</li>}
      {n.son30.slice(0, 3).map((x) => (
        <li key={`s-${x.kalem.id}`} className="flex items-start gap-1.5 text-sky-300/90">
          <History size={12} className="shrink-0 mt-px" />
          <span className="min-w-0 break-words">Son 30 günde bu departmana onaylandı: {kalem(x.kalem, x.benzer)} · {saTarih(x.tarih).slice(0, 10)} <span style={{ color: TEXT_MUTED }}>({x.liste_no})</span></span>
        </li>
      ))}
      {n.son30.length > 3 && <li className="pl-[18px]" style={{ color: TEXT_MUTED }}>ve {n.son30.length - 3} onay daha</li>}
    </ul>
  );
}

function KalemBilgisi({ k }: { k: SaKalem }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>{KATEGORILER[k.kategori] ?? k.kategori}</p>
      <p className="text-sm font-semibold text-white break-words">
        {k.urun}
        {k.aciliyet === "acil" && <span className="ml-2 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400">ACİL</span>}
      </p>
      <p className="text-sm" style={{ color: TEXT_MUTED }}><span className="font-semibold text-white">{onayliMiktarBirim(k)}</span>{miktarDegisti(k) && <span className="text-amber-400"> (talep {miktarBirim(k)})</span>} · {k.talep_eden}</p>
      {k.onay_notu && <p className="text-xs mt-0.5 font-semibold text-emerald-400 break-words">Onay notu: {k.onay_notu}</p>}
      {k.aciklama && <p className="text-xs mt-0.5 break-words" style={{ color: TEXT_MUTED }}>{k.aciklama}</p>}
      {k.tedarikci && <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>Tedarikçi: {k.tedarikci}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cek listeleri (sonuclanan listeler)
// ---------------------------------------------------------------------------
/** Fisin teslim durumu (kalemlerden; cek_durumu ile ayni sonuc). */
function teslimDurumu(l: Liste): "red" | "bekliyor" | "tamamlandi" {
  const o = listeOzeti(l);
  if (!o.onay) return "red";
  return o.alinan >= o.onay ? "tamamlandi" : "bekliyor";
}

function CekRozeti({ l }: { l: Liste }) {
  const o = listeOzeti(l);
  const d = teslimDurumu(l);
  if (d === "red") return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-red-500/10 text-red-400">Tamamı reddedildi</span>;
  if (d === "tamamlandi") return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-emerald-500/10 text-emerald-400" data-testid="teslim-rozet">Teslim tamamlandı · {o.onay} kalem</span>;
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-amber-500/10 text-amber-400" data-testid="teslim-rozet">Teslim bekliyor · {o.alinan}/{o.onay}</span>;
}

function CekListeleri({ listeler, departmanlar, hedef, onMailTekrar, onDegisti }: {
  listeler: Liste[]; departmanlar: Departman[]; hedef: string | null;
  onMailTekrar: (l: Liste, tur: "gonderim" | "sonuc") => Promise<void>;
  onDegisti: () => void;
}) {
  const [departman, setDepartman] = useState("");
  const [durum, setDurum] = useState<"" | "bekliyor" | "tamamlandi" | "red">("");
  const [acik, setAcik] = useState<string | null>(hedef);
  const [gonderiliyor, setGonderiliyor] = useState<string | null>(null);
  const { showToast } = useToast();
  const fisKopyala = async (l: Liste) => {
    if (!l.cek_token) return;
    try { await navigator.clipboard.writeText(cekAdresi(l.cek_token)); showToast(`${l.liste_no} fiş bağlantısı kopyalandı; ${l.departman} departmanına iletebilirsiniz.`, "success"); }
    catch { showToast("Kopyalanamadı; fişi açıp adres çubuğundan kopyalayın.", "error"); }
  };
  const gorunen = listeler.filter((l) =>
    (!departman || l.departman_id === departman) &&
    (!durum || teslimDurumu(l) === durum));

  if (listeler.length === 0) return <EmptyState icon={<CheckCircle2 size={40} />} title="Henüz onaylı fiş yok" description="Bir talebi onayladığınızda onaylanan kalemlerden satın alma fişi oluşur." />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Departman" value={departman} onChange={(e) => setDepartman(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm text-white" style={girdiStil}>
          <option value="">Tüm departmanlar</option>
          {departmanlar.map((d) => <option key={d.id} value={d.id}>{d.ad}</option>)}
        </select>
        <select aria-label="Durum" value={durum} onChange={(e) => setDurum(e.target.value as typeof durum)} className="px-3 py-1.5 border rounded-lg text-sm text-white" style={girdiStil}>
          <option value="">Tüm durumlar</option>
          <option value="bekliyor">Teslim bekleyen</option>
          <option value="tamamlandi">Teslim tamamlanan</option>
          <option value="red">Tamamı reddedildi</option>
        </select>
      </div>
      {gorunen.length === 0 ? <p className="text-sm py-6 text-center" style={{ color: TEXT_MUTED }}>Filtreye uyan liste yok.</p> : (
      <div className="rounded-xl border overflow-hidden" style={kartStil}>
        <ul className="divide-y" style={{ borderColor: CARD_BORDER }}>
          {gorunen.map((l) => {
            const o = listeOzeti(l);
            const acikMi = acik === l.id;
            return (
              <li key={l.id} id={`liste-${l.id}`} className="scroll-mt-4" style={{ borderColor: CARD_BORDER }}>
                <button onClick={() => setAcik(acikMi ? null : l.id)} aria-expanded={acikMi} className="w-full px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-left hover:bg-white/[0.02]">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{l.departman} <span className="font-mono text-xs font-normal whitespace-nowrap" style={{ color: TEXT_MUTED }}>· {l.liste_no}</span>{l.test && <TestRozeti />}</p>
                    <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>Onay {saTarih(l.karar_zamani)}{l.karar_veren_email ? ` · ${l.karar_veren_email}` : ""} · {o.onay} onay{o.red ? ` · ${o.red} red` : ""}</p>
                  </div>
                  <CekRozeti l={l} />
                  {l.sonuc_maili === "hata" && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 whitespace-nowrap">E-posta gitmedi</span>}
                  <ChevronDown size={15} className={`shrink-0 transition-transform ${acikMi ? "rotate-180" : ""}`} style={{ color: TEXT_MUTED }} />
                </button>
                {acikMi && (
                  <div className="px-4 sm:px-5 pb-4">
                    <p className="text-xs mb-2" style={{ color: TEXT_MUTED }}>Gönderen: <span className="text-white">{l.gonderen_ad}</span> · {saTarih(l.gonderim_zamani)}{l.karar_notu ? <> · Not: <span className="text-white">{l.karar_notu}</span></> : null}</p>
                    <TeslimPaneli l={l} onDegisti={onDegisti} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {l.cek_token && (
                        <>
                          <a href={cekAdresi(l.cek_token).replace("https://ihracatasistanim.com", "")} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white hover:brightness-110" style={{ backgroundColor: ACCENT }}>
                            <FileText size={12} /> Satın alma fişini aç
                          </a>
                          <button onClick={() => fisKopyala(l)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                            <Copy size={12} /> Fiş bağlantısını kopyala
                          </button>
                        </>
                      )}
                      <button disabled={gonderiliyor === l.id} onClick={async () => { setGonderiliyor(l.id); await onMailTekrar(l, "sonuc"); setGonderiliyor(null); }}
                        title={l.sonuc_maili_hata || undefined}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60 ${l.sonuc_maili === "hata" ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20" : "border hover:bg-white/5"}`}
                        style={l.sonuc_maili === "hata" ? undefined : { borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                        {gonderiliyor === l.id ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                        {o.onay ? "Fiş e-postasını yeniden gönder" : "Sonuç e-postasını yeniden gönder"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Teslim paneli (03.11.2026): fisin kalemleri + "Teslim edildi" isaretleme.
// Fis token'iyla edge "cek_isaretle" cagrilir (departmanin fis sayfasiyla AYNI yol);
// teslim alanin ad soyadi zorunlu (sunucuda da). Geri alma onay penceresiyle.
// ---------------------------------------------------------------------------
function TeslimPaneli({ l, onDegisti }: { l: Liste; onDegisti: () => void }) {
  const { showToast } = useToast();
  const [ad, setAd] = useState("");
  const [isleniyor, setIsleniyor] = useState<string | null>(null);
  const [geriAlinacak, setGeriAlinacak] = useState<SaKalem | null>(null);
  const bekleyen = l.kalemler.filter((k) => k.karar === "onaylandi" && !k.alindi);

  const cagir = async (k: SaKalem, alindi: boolean) => {
    if (!l.cek_token) { showToast("Bu fişin bağlantısı yok; teslim işaretlenemez.", "error"); return false; }
    const r = await satinAlmaCagir({ islem: "cek_isaretle", token: l.cek_token, kalem_id: k.id, alindi, ad: alindi ? adSoyadDuzelt(ad) : "" });
    if (!r.ok) { showToast(r.hata, "error"); return false; }
    return true;
  };
  const adKontrol = () => {
    if (adSoyadGecerli(ad)) return true;
    showToast("Teslim alan kişinin adını ve soyadını yazın.", "error");
    document.getElementById(`teslim-alan-${l.id}`)?.focus();
    return false;
  };
  const isaretle = async (k: SaKalem) => {
    if (!adKontrol()) return;
    setIsleniyor(k.id);
    if (await cagir(k, true)) showToast(`${k.urun} teslim edildi olarak işaretlendi (${adSoyadDuzelt(ad)}).`, "success");
    setIsleniyor(null); onDegisti();
  };
  const tumunu = async () => {
    if (!adKontrol()) return;
    setIsleniyor("hepsi");
    let n = 0;
    for (const k of bekleyen) { if (!(await cagir(k, true))) break; n++; }
    if (n) showToast(`${l.liste_no}: ${n} kalem teslim edildi olarak işaretlendi.`, "success");
    setIsleniyor(null); onDegisti();
  };
  const geriAl = async () => {
    if (!geriAlinacak) return;
    setIsleniyor(geriAlinacak.id);
    if (await cagir(geriAlinacak, false)) showToast(`${geriAlinacak.urun} teslimi geri alındı.`, "success");
    setIsleniyor(null); setGeriAlinacak(null); onDegisti();
  };

  return (
    <>
      {bekleyen.length > 0 && l.cek_token && (
        <div className="mb-2 flex flex-wrap items-end gap-2 p-3 rounded-lg border" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
          <label className="flex-1 min-w-[180px] max-w-xs">
            <span className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: TEXT_MUTED }}>Teslim alan (ad soyad)</span>
            <input id={`teslim-alan-${l.id}`} value={ad} onChange={(e) => setAd(e.target.value)} maxLength={80} placeholder="Ad Soyad" autoComplete="off" className={girdiSinifi} style={girdiStil} />
          </label>
          <button onClick={tumunu} disabled={isleniyor !== null} data-testid="teslim-tumunu"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
            {isleniyor === "hepsi" ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={14} />} Tümünü teslim edildi ({bekleyen.length})
          </button>
          <p className="w-full text-[11px]" style={{ color: TEXT_MUTED }}>Departman da fiş bağlantısından teslim aldığı kalemleri kendisi işaretleyebilir.</p>
        </div>
      )}
      <ul className="divide-y rounded-lg border" style={{ borderColor: CARD_BORDER }}>
        {l.kalemler.map((k) => (
          <li key={k.id} className="px-3 py-2.5 flex flex-wrap sm:flex-nowrap items-start gap-3" style={{ borderColor: CARD_BORDER }} data-testid="teslim-kalem">
            {k.karar === "onaylandi"
              ? (k.alindi ? <PackageCheck size={18} className="shrink-0 mt-0.5 text-emerald-400" aria-label="Teslim edildi" /> : <Clock size={18} className="shrink-0 mt-0.5 text-amber-400" aria-label="Teslim bekliyor" />)
              : <XCircle size={18} className="shrink-0 mt-0.5 text-red-400" aria-label="Reddedildi" />}
            <KalemBilgisi k={k} />
            <div className="shrink-0 w-full sm:w-auto pl-[30px] sm:pl-0 sm:text-right">
              {k.karar !== "onaylandi" ? (
                <><span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400">Reddedildi</span>{k.red_nedeni && <p className="text-xs mt-0.5 max-w-[220px]" style={{ color: TEXT_MUTED }}>{k.red_nedeni}</p>}</>
              ) : k.alindi ? (
                <>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400"><CheckCircle2 size={13} /> Teslim edildi</span>
                  <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{saTarih(k.alinma_zamani)}{k.alan_ad ? <> · <span className="text-white">{k.alan_ad}</span></> : null}</p>
                  {l.cek_token && (
                    <button onClick={() => setGeriAlinacak(k)} disabled={isleniyor !== null} className="mt-1 inline-flex items-center gap-1 text-[11px] hover:text-white disabled:opacity-60" style={{ color: TEXT_MUTED }} aria-label={`${k.urun} teslimini geri al`}>
                      <Undo2 size={11} /> Geri al
                    </button>
                  )}
                </>
              ) : l.cek_token ? (
                <button onClick={() => isaretle(k)} disabled={isleniyor !== null} data-testid="teslim-isaretle"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border hover:bg-emerald-500/10 disabled:opacity-60 whitespace-nowrap" style={{ borderColor: "rgba(16,185,129,0.4)", color: "#34D399" }}>
                  {isleniyor === k.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Teslim edildi
                </button>
              ) : <span className="text-xs font-semibold text-amber-400">Teslim bekliyor</span>}
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!geriAlinacak}
        onOpenChange={(a) => { if (!a && isleniyor === null) setGeriAlinacak(null); }}
        title="Teslim geri alınsın mı?"
        description={geriAlinacak ? `${geriAlinacak.urun} (${onayliMiktarBirim(geriAlinacak)}) yeniden "Teslim bekliyor" olur; teslim alan bilgisi (${geriAlinacak.alan_ad || "-"}) silinir.` : ""}
        confirmLabel="Evet, geri al" cancelLabel="Vazgeç" destructive
        onConfirm={geriAl} loading={isleniyor !== null} loadingLabel="Geri alınıyor..."
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Departman gecmisi: onaylanan alimlar departmanin altinda birikir
// ---------------------------------------------------------------------------
type GecmisKalemi = SaKalem & { liste_no: string | null; liste_id: string; karar_zamani: string | null };

function DepartmanGecmisi({ listeler, departmanlar }: { listeler: Liste[]; departmanlar: Departman[] }) {
  const [acik, setAcik] = useState<string | null>(null);
  const [arama, setArama] = useState("");
  const gruplar = useMemo(() => {
    const m = new Map<string, GecmisKalemi[]>();
    for (const l of listeler) for (const k of l.kalemler) {
      if (k.karar !== "onaylandi") continue;
      const dizi = m.get(l.departman_id) || [];
      dizi.push({ ...k, liste_no: l.liste_no, liste_id: l.id, karar_zamani: l.karar_zamani });
      m.set(l.departman_id, dizi);
    }
    m.forEach((d) => d.sort((a, b) => (b.karar_zamani || "").localeCompare(a.karar_zamani || "")));
    return m;
  }, [listeler]);
  const ara = arama.trim().toLocaleLowerCase("tr");
  const uyar = (k: GecmisKalemi) => !ara || `${k.urun} ${k.aciklama || ""} ${k.talep_eden} ${k.liste_no || ""} ${KATEGORILER[k.kategori] || ""}`.toLocaleLowerCase("tr").includes(ara);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Ürün, kişi ya da liste no ara" aria-label="Geçmişte ara"
          className="px-3 py-1.5 border rounded-lg text-sm text-white w-72 max-w-full" style={girdiStil} />
        <p className="text-xs" style={{ color: TEXT_MUTED }}>Onaylanan tüm alımlar departmanının altında saklanır.</p>
      </div>
      <div className="space-y-2">
        {departmanlar.map((d) => {
          const tum = gruplar.get(d.id) || [];
          const kalemler = tum.filter(uyar);
          const listeSayisi = new Set(tum.map((k) => k.liste_id)).size;
          const teslimEdilen = tum.filter((k) => k.alindi).length;
          const acikMi = acik === d.id || (!!ara && kalemler.length > 0);
          return (
            <section key={d.id} className="rounded-xl border overflow-hidden" style={kartStil}>
              <button onClick={() => setAcik(acik === d.id ? null : d.id)} aria-expanded={acikMi} disabled={tum.length === 0}
                className="w-full px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-left hover:bg-white/[0.02] disabled:cursor-default">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{d.ad}{d.test && <TestRozeti />}{!d.aktif && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/5" style={{ color: TEXT_MUTED }}>Pasif</span>}</p>
                  <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                    {tum.length ? `${tum.length} onaylı kalem · ${listeSayisi} liste · son onay ${saTarih(tum[0].karar_zamani)}` : "Henüz onaylı alım yok"}
                  </p>
                </div>
                {tum.length > 0 && <span className="text-xs font-semibold whitespace-nowrap"><span className="text-emerald-400">{teslimEdilen} teslim edildi</span>{tum.length - teslimEdilen > 0 && <span className="text-amber-400"> · {tum.length - teslimEdilen} bekliyor</span>}</span>}
                {tum.length > 0 && <ChevronDown size={15} className={`shrink-0 transition-transform ${acikMi ? "rotate-180" : ""}`} style={{ color: TEXT_MUTED }} />}
              </button>
              {acikMi && kalemler.length > 0 && (
                <div className="overflow-x-auto border-t" style={{ borderColor: CARD_BORDER }}>
                  <table className="min-w-full">
                    <thead>
                      <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                        {["Onay", "Liste", "Ürün", "Miktar", "Talep eden", "Teslim"].map((b, i) => (
                          <th key={b} className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${i === 3 ? "text-right" : "text-left"}`} style={{ color: TEXT_MUTED }}>{b}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {kalemler.map((k) => (
                        <tr key={k.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{saTarih(k.karar_zamani).slice(0, 10)}</td>
                          <td className="px-4 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: TEXT_MUTED }}>{k.liste_no}</td>
                          <td className="px-4 py-2.5 text-sm">
                            <span className="text-white font-medium">{k.urun}</span>
                            <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{KATEGORILER[k.kategori] ?? k.kategori}{k.aciklama ? ` · ${k.aciklama}` : ""}{k.onay_notu ? ` · Onay notu: ${k.onay_notu}` : ""}</span>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right text-white font-semibold whitespace-nowrap">{onayliMiktarBirim(k)}{miktarDegisti(k) && <span className="block text-[11px] font-normal text-amber-400">talep {miktarBirim(k)}</span>}</td>
                          <td className="px-4 py-2.5 text-sm whitespace-nowrap" style={{ color: TEXT_MUTED }}>{k.talep_eden}</td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                            {k.alindi
                              ? <span className="text-emerald-400 font-semibold">{saTarih(k.alinma_zamani).slice(0, 10)}{k.alan_ad ? <span className="font-normal" style={{ color: TEXT_MUTED }}> · {k.alan_ad}</span> : null}</span>
                              : <span className="text-amber-400 font-semibold">Bekliyor</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Departmanlar ve girissiz baglantilar
// ---------------------------------------------------------------------------
function Departmanlar({ departmanlar, taslaklar, listeler, onDegisti }: { departmanlar: Departman[]; taslaklar: Map<string, Liste>; listeler: Liste[]; onDegisti: () => void }) {
  const { showToast } = useToast();
  const [yeniAd, setYeniAd] = useState("");
  const [ekleniyor, setEkleniyor] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState<{ id: string; ad: string } | null>(null);
  const [isleniyor, setIsleniyor] = useState<string | null>(null);
  const [yenilenecek, setYenilenecek] = useState<Departman | null>(null);
  const [silinecek, setSilinecek] = useState<Departman | null>(null);
  const [siliniyor, setSiliniyor] = useState(false);
  const [haftalik, setHaftalik] = useState<{ id: string; gun: string; eposta: string } | null>(null);

  const haftalikKaydet = async (d: Departman) => {
    if (!haftalik) return;
    const gun = haftalik.gun ? Number(haftalik.gun) : null;
    setIsleniyor(d.id);
    const { error } = await supabase.rpc("sa_departman_haftalik", { p_id: d.id, p_gun: gun, p_eposta: gun ? haftalik.eposta.trim() || null : null });
    setIsleniyor(null);
    if (error) { showToast(error.message, "error"); return; }
    showToast(gun ? `${d.ad}: haftalık liste günü ${HAFTA_GUNLERI[gun]}.` : `${d.ad}: haftalık liste kapatıldı.`, "success");
    setHaftalik(null);
    onDegisti();
  };

  // Silme onayi: departmanla birlikte KALICI silinecek liste / kalem sayisi
  const silinecekOzet = useMemo(() => {
    if (!silinecek) return null;
    const ait = listeler.filter((l) => l.departman_id === silinecek.id);
    return {
      liste: ait.length,
      kalem: ait.reduce((t, l) => t + l.kalemler.length, 0),
      bekleyen: ait.filter((l) => l.durum === "bekliyor" || l.durum === "on_onay").length,
      fis: ait.filter((l) => l.durum === "sonuclandi" && listeOzeti(l).onay > 0).length,
      gonderilen: ait.filter((l) => l.durum !== "taslak").length,
    };
  }, [silinecek, listeler]);

  const sil = async () => {
    if (!silinecek) return;
    setSiliniyor(true);
    const { data, error } = await supabase.rpc("sa_departman_sil", { p_id: silinecek.id });
    setSiliniyor(false);
    if (error) { showToast(error.message, "error"); return; }
    const r = (data || {}) as { liste?: number; kalem?: number };
    showToast(`${silinecek.ad} silindi${r.liste ? ` (${r.liste} liste, ${r.kalem ?? 0} kalem ile birlikte)` : ""}. Bağlantısı artık çalışmaz.`, "success");
    setSilinecek(null);
    onDegisti();
  };

  const kaydet = async (id: string | null, ad: string, aktif: boolean, test?: boolean) => {
    const { error } = await supabase.rpc("sa_departman_kaydet", { p_id: id, p_ad: ad, p_aktif: aktif, ...(test === undefined ? {} : { p_test: test }) });
    if (error) { showToast(error.message, "error"); return false; }
    onDegisti();
    return true;
  };

  const ekle = async () => {
    if (yeniAd.trim().length < 2) { showToast("Departman adını yazın.", "error"); return; }
    setEkleniyor(true);
    if (await kaydet(null, yeniAd, true)) { setYeniAd(""); showToast("Departman eklendi; bağlantısını kopyalayıp iletebilirsiniz.", "success"); }
    setEkleniyor(false);
  };

  const kopyala = async (d: Departman) => {
    try { await navigator.clipboard.writeText(talepAdresi(d.token)); showToast(`${d.ad} bağlantısı kopyalandı.`, "success"); }
    catch { showToast("Kopyalanamadı; bağlantıyı açıp adres çubuğundan kopyalayın.", "error"); }
  };

  const tokenYenile = async () => {
    if (!yenilenecek) return;
    setIsleniyor(yenilenecek.id);
    const { error } = await supabase.rpc("sa_departman_token_yenile", { p_id: yenilenecek.id });
    setIsleniyor(null);
    if (error) showToast(error.message, "error");
    else showToast(`${yenilenecek.ad}: yeni bağlantı oluşturuldu. Eski bağlantı artık çalışmaz.`, "success");
    setYenilenecek(null);
    onDegisti();
  };

  return (
    <div className="space-y-4">
      <div className="text-sm rounded-xl border px-4 py-3" style={{ ...kartStil, color: TEXT_MUTED }}>
        {/* 27.10.2026: diger bilgi metinleri gibi yazi animasyonuyla (bicim korunur) */}
        <YaziAnimasyonu harfMs={10} enUzunMs={1300} parcalar={[
          { metin: "Her departmanın " }, { metin: "girişsiz, kalıcı", sinif: "font-bold text-white" },
          { metin: " bir bağlantısı var. Bağlantıyı departmandaki yetkili arkadaşlara iletin; ortak listeye kalem ekleyip gönderebilirler. Bağlantı başkasının eline geçtiyse " },
          { metin: "Yenile", sinif: "font-bold text-white" }, { metin: " ile eskisini geçersiz kılın." },
        ]} />
      </div>
      <div className="rounded-xl border overflow-x-auto" style={kartStil}>
        <table className="min-w-full">
          <thead>
            <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
              {["Departman", "Durum", "E-posta", "Haftalık liste", "Hazırlanan liste", "Bağlantı", ""].map((b) => (
                <th key={b} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {departmanlar.map((d) => {
              const taslak = taslaklar.get(d.id);
              return (
                <tr key={d.id} className="border-b last:border-0" style={{ borderColor: CARD_BORDER }}>
                  <td className="px-4 py-3">
                    {duzenlenen?.id === d.id ? (
                      <div className="flex items-center gap-1.5">
                        <input value={duzenlenen.ad} onChange={(e) => setDuzenlenen({ id: d.id, ad: e.target.value })} maxLength={60} autoFocus aria-label="Departman adı"
                          onKeyDown={async (e) => { if (e.key === "Enter" && await kaydet(d.id, duzenlenen.ad, d.aktif)) setDuzenlenen(null); if (e.key === "Escape") setDuzenlenen(null); }}
                          className="px-2 py-1 border rounded-md text-sm text-white w-48" style={girdiStil} />
                        <button aria-label="Kaydet" onClick={async () => { if (await kaydet(d.id, duzenlenen.ad, d.aktif)) setDuzenlenen(null); }} className="p-1 text-emerald-400 hover:text-emerald-300"><Check size={15} /></button>
                        <button aria-label="Vazgeç" onClick={() => setDuzenlenen(null)} className="p-1 hover:text-white" style={{ color: TEXT_MUTED }}><X size={15} /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${d.aktif ? "text-white" : ""}`} style={d.aktif ? undefined : { color: TEXT_MUTED }}>{d.ad}</span>
                        <button aria-label={`${d.ad} adını düzenle`} onClick={() => setDuzenlenen({ id: d.id, ad: d.ad })} className="p-1 hover:text-white" style={{ color: "#4A5262" }}><Pencil size={12} /></button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button disabled={isleniyor === d.id} onClick={async () => { setIsleniyor(d.id); await kaydet(d.id, d.ad, !d.aktif); setIsleniyor(null); }}
                      className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${d.aktif ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5"}`}
                      style={d.aktif ? undefined : { color: TEXT_MUTED }}
                      title={d.aktif ? "Pasifleştir: bağlantı çalışmaz" : "Aktifleştir"}>
                      {d.aktif ? "Aktif" : "Pasif"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button disabled={isleniyor === d.id} onClick={async () => {
                      setIsleniyor(d.id);
                      if (await kaydet(d.id, d.ad, d.aktif, !d.test)) showToast(d.test ? `${d.ad}: e-postalar artık gerçek alıcılara gider.` : `${d.ad} test departmanı oldu: e-postalar yalnızca ${TEST_ALICISI} adresine gider.`, "success");
                      setIsleniyor(null);
                    }}
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${d.test ? "bg-amber-500/15 text-amber-400" : "bg-white/5"}`}
                      style={d.test ? undefined : { color: TEXT_MUTED }}
                      title={d.test ? "Gerçek alıcılara geçir (execution@ / bbt@)" : `Test yap: e-postalar yalnızca ${TEST_ALICISI} adresine gider`}>
                      {d.test ? <><FlaskConical size={11} /> Test</> : "Gerçek"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {haftalik?.id === d.id ? (
                      <div className="flex flex-wrap items-center gap-1.5 min-w-[340px]">
                        <select value={haftalik.gun} onChange={(e) => setHaftalik({ ...haftalik, gun: e.target.value })} aria-label="Haftalık liste günü"
                          className="px-2 py-1 border rounded-md text-sm text-white" style={girdiStil}>
                          <option value="">Yok</option>
                          {Object.entries(HAFTA_GUNLERI).map(([g, ad]) => <option key={g} value={g}>{ad}</option>)}
                        </select>
                        <input value={haftalik.eposta} onChange={(e) => setHaftalik({ ...haftalik, eposta: e.target.value })} maxLength={240}
                          placeholder="Hatırlatma e-postası (virgülle, en fazla 3)" aria-label="Hatırlatma e-postası" disabled={!haftalik.gun}
                          className="px-2 py-1 border rounded-md text-sm text-white w-60 disabled:opacity-40" style={girdiStil} />
                        <button aria-label="Kaydet" data-testid="haftalik-kaydet" disabled={isleniyor === d.id} onClick={() => haftalikKaydet(d)} className="p-1 text-emerald-400 hover:text-emerald-300 disabled:opacity-50">
                          {isleniyor === d.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                        </button>
                        <button aria-label="Vazgeç" onClick={() => setHaftalik(null)} className="p-1 hover:text-white" style={{ color: TEXT_MUTED }}><X size={15} /></button>
                      </div>
                    ) : (
                      <button onClick={() => setHaftalik({ id: d.id, gun: d.haftalik_gun ? String(d.haftalik_gun) : "", eposta: d.hatirlatma_eposta || "" })}
                        data-testid="haftalik-dugme" className="text-left text-xs hover:text-white" style={{ color: TEXT_MUTED }}
                        title="Haftalık liste günü: o gün 09:00'a kadar liste gönderilmediyse hatırlatma e-postası gider; onay e-postasının konusu “Haftalık satın alma listesi” olur.">
                        {d.haftalik_gun ? (
                          <span className="whitespace-nowrap"><b className="text-white">{HAFTA_GUNLERI[d.haftalik_gun]}</b>
                            <span className="block text-[11px] max-w-[220px] truncate">{d.hatirlatma_eposta ? `Hatırlatma: ${d.hatirlatma_eposta.split(",").join(", ")}` : "Hatırlatma e-postası yok"}</span></span>
                        ) : <span className="inline-flex items-center gap-1 whitespace-nowrap"><Clock size={12} /> Ayarla</span>}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: TEXT_MUTED }}>
                    {taslak ? <span className="inline-flex items-center gap-1"><Clock size={12} className="text-amber-400" /> {taslak.kalemler.length} kalem, gönderilmedi</span> : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <button onClick={() => kopyala(d)} disabled={!d.aktif} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5 disabled:opacity-40" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                        <Copy size={12} /> Kopyala
                      </button>
                      <a href={talepAdresi(d.token).replace("https://ihracatasistanim.com", "")} target="_blank" rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5 ${d.aktif ? "" : "pointer-events-none opacity-40"}`} style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                        <ExternalLink size={12} /> Aç
                      </a>
                      <button onClick={() => setYenilenecek(d)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                        <Link2 size={12} /> Yenile
                      </button>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <button onClick={() => setSilinecek(d)} aria-label={`${d.ad} departmanını sil`} title="Departmanı sil"
                      className="p-1.5 rounded-md hover:bg-red-500/10 hover:text-red-400 transition-colors" style={{ color: "#4A5262" }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={yeniAd} onChange={(e) => setYeniAd(e.target.value)} maxLength={60} placeholder="Yeni departman adı" aria-label="Yeni departman adı"
          onKeyDown={(e) => { if (e.key === "Enter") ekle(); }}
          className="px-3 py-2 border rounded-lg text-sm text-white w-64 max-w-full" style={girdiStil} />
        <button onClick={ekle} disabled={ekleniyor} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-60">
          {ekleniyor ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Departman ekle
        </button>
      </div>

      <ConfirmDialog
        open={yenilenecek !== null}
        onOpenChange={(a) => { if (!a) setYenilenecek(null); }}
        title={`${yenilenecek?.ad || ""} bağlantısı yenilensin mi?`}
        description="Eski bağlantı hemen çalışmaz hale gelir. Hazırlanan liste ve geçmiş korunur; yeni bağlantıyı departmana tekrar iletmeniz gerekir."
        confirmLabel="Evet, yenile" cancelLabel="Vazgeç"
        onConfirm={tokenYenile} loading={isleniyor === yenilenecek?.id} loadingLabel="Yenileniyor..."
      />

      <ConfirmDialog
        open={silinecek !== null}
        onOpenChange={(a) => { if (!a && !siliniyor) setSilinecek(null); }}
        title={`${silinecek?.ad || ""} departmanı silinsin mi?`}
        description={silinecekOzet && silinecekOzet.liste > 0
          ? `Departmanla birlikte ${silinecekOzet.liste} liste ve ${silinecekOzet.kalem} kalem KALICI olarak silinir${silinecekOzet.gonderilen ? ` (${silinecekOzet.gonderilen} gönderilmiş liste${silinecekOzet.bekleyen ? `, ${silinecekOzet.bekleyen} onay bekleyen` : ""}${silinecekOzet.fis ? `, ${silinecekOzet.fis} onaylı fiş` : ""})` : ""}. Departmanın talep bağlantısı ve fiş bağlantıları çalışmaz hale gelir. Bu işlem geri alınamaz. Geçmişi korumak istiyorsanız silmek yerine Pasif yapın.`
          : "Departmanın talep bağlantısı çalışmaz hale gelir. Bu departmana ait liste yok. Bu işlem geri alınamaz."}
        confirmLabel="Evet, kalıcı sil" cancelLabel="Vazgeç" destructive
        onConfirm={sil} loading={siliniyor} loadingLabel="Siliniyor..."
      />
    </div>
  );
}

export default function SatinAlmaSayfasi() {
  return (
    <Suspense fallback={<SayfaYukleniyor className="min-h-screen flex items-center justify-center" style={{ backgroundColor: PAGE_BG }} boyut={24} />}>
      <AppShell>
        <SatinAlmaIcerik />
      </AppShell>
    </Suspense>
  );
}
