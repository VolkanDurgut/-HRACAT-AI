"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, Clock, Copy, ExternalLink, Inbox, Link2, Loader2, Mail,
  FileText, FlaskConical, Pencil, Plus, RefreshCw, RotateCcw, ShoppingCart, Trash2, X, XCircle,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { supabase } from "@/lib/supabase";
import { satinAlmaCagir } from "@/lib/satin-alma/api";
import { ACCENT, CARD_BG, CARD_BORDER, PAGE_BG, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import {
  KATEGORILER, cekAdresi, listeOzeti, miktarBirim, saTarih, talepAdresi,
  type SaKalem, type SaListe,
} from "@/supabase/functions/_shared/satin-alma";

/**
 * SATIN ALMA (26.10.2026) - departman ihtiyac listelerinin onayi.
 * Departmanlar girissiz baglantidan (/talep/[token]) liste gonderir; burada
 * "satin_alma" yetkili kullanici (Burak Bey) kalem bazinda onaylar / reddeder.
 * Karar kaydedilince onaylanan + reddedilen kalemler execution@'ye e-postayla
 * gider (edge function "satin-alma", islem "karar"). Karar SONRADAN DEGISMEZ.
 * Onaylanan kalem varsa AKTIF Unex cek listesi olusur (alindi isaretleri burada ya da
 * execution@ mailindeki /cek/[token] sayfasinda); onayli alimlar "Departman gecmisi"nde birikir.
 * 27.10.2026: /cek/[token] "Onayli satin alma fisi" belgesi; "Onayli fisler" sekmesinden
 * fis acilir / baglantisi kopyalanip ilgili departmana iletilir. Departman "Test" bayragi:
 * o departmanin mailleri SADECE test adresine (mesensei282@) gider. Departman silinebilir
 * (sa_departman_sil: listeleri + kalemleriyle birlikte, kalici).
 * Tablolar istemciye SADECE okunur; yazmalar RPC / edge function ile.
 */

type Departman = { id: string; ad: string; token: string; aktif: boolean; test: boolean; sira: number };
type ListeSatiri = Omit<SaListe, "departman" | "sirket" | "kalemler"> & {
  departman_id: string;
  gonderim_maili_hata: string | null;
  sonuc_maili_hata: string | null;
  satin_alma_kalemleri: SaKalem[];
};
type Liste = SaListe & { departman_id: string; gonderim_maili_hata: string | null; sonuc_maili_hata: string | null };
type KararSecimi = { karar: "onaylandi" | "reddedildi"; red_nedeni: string };
type Sekme = "bekleyen" | "cek" | "gecmis" | "departmanlar";

const LISTE_KOLONLARI = "id, liste_no, durum, departman_id, gonderen_ad, gonderim_zamani, karar_veren_email, karar_zamani, karar_notu, gonderim_maili, gonderim_maili_hata, sonuc_maili, sonuc_maili_hata, cek_durumu, cek_tamamlanma, cek_token, satin_alma_kalemleri(id, kategori, urun, miktar, birim, aciliyet, aciklama, talep_eden, karar, red_nedeni, olusturma, alindi, alinma_zamani, alan_ad)";

const kartStil = { backgroundColor: CARD_BG, borderColor: CARD_BORDER } as React.CSSProperties;
const girdiSinifi = "w-full px-3 py-2 border rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const girdiStil = { borderColor: CARD_BORDER, backgroundColor: CARD_BG } as React.CSSProperties;
const TEST_ALICISI = "mesensei282@gmail.com";

function TestRozeti() {
  return <span className="ml-2 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 tracking-wide" title={`Test departmanı: e-postalar yalnızca ${TEST_ALICISI} adresine gider`}>TEST</span>;
}

function SatinAlmaIcerik() {
  const { companyId, loading: authLoading, yetkiler } = useAuth();
  const { showToast } = useToast();
  const params = useSearchParams();
  const hedefListe = params?.get("liste") || null;

  const [departmanlar, setDepartmanlar] = useState<Departman[]>([]);
  const [listeler, setListeler] = useState<Liste[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sekme, setSekme] = useState<Sekme>("bekleyen");
  const hedefIslendi = useRef(false);

  const yetkili = !!yetkiler.sayfa_yetkileri.satin_alma;

  const getir = useCallback(async (sessiz = false) => {
    if (!companyId) return;
    if (sessiz) setYenileniyor(true);
    const [dRes, lRes] = await Promise.all([
      supabase.from("satin_alma_departmanlari").select("id, ad, token, aktif, test, sira").eq("company_id", companyId).order("sira").order("ad"),
      supabase.from("satin_alma_listeleri").select(LISTE_KOLONLARI).eq("company_id", companyId)
        .order("gonderim_zamani", { ascending: false, nullsFirst: true }).limit(300),
    ]);
    if (dRes.error || lRes.error) {
      setHata(`Veriler okunamadı: ${(dRes.error || lRes.error)?.message}`);
    } else {
      const dep = (dRes.data || []) as Departman[];
      const adlar = new Map(dep.map((d) => [d.id, d.ad]));
      const testler = new Set(dep.filter((d) => d.test).map((d) => d.id));
      setDepartmanlar(dep);
      setListeler(((lRes.data || []) as unknown as ListeSatiri[]).map(({ satin_alma_kalemleri, ...l }) => ({
        ...l,
        departman: adlar.get(l.departman_id) || "-",
        test: testler.has(l.departman_id),
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
  const sonuclananlar = useMemo(() => listeler.filter((l) => l.durum === "sonuclandi"), [listeler]);
  const taslaklar = useMemo(() => new Map(listeler.filter((l) => l.durum === "taslak").map((l) => [l.departman_id, l])), [listeler]);

  // Mail'deki "Listeyi incele" baglantisi: ?liste=<id> -> ilgili sekme + kaydir
  useEffect(() => {
    if (!hedefListe || hedefIslendi.current || yukleniyor) return;
    const l = listeler.find((x) => x.id === hedefListe);
    if (!l) return;
    hedefIslendi.current = true;
    setSekme(l.durum === "sonuclandi" ? "cek" : "bekleyen");
    setTimeout(() => document.getElementById(`liste-${l.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }, [hedefListe, listeler, yukleniyor]);

  const aktifCek = useMemo(() => sonuclananlar.filter((l) => l.cek_durumu === "aktif").length, [sonuclananlar]);

  // Cek listesi kalemi: alindi isaretle / geri al (yetkili)
  const cekIsaretle = async (k: SaKalem) => {
    const { error } = await supabase.rpc("sa_cek_isaretle", { p_kalem_id: k.id, p_alindi: !k.alindi });
    if (error) { showToast(error.message, "error"); return; }
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
    return <div className="flex justify-center py-24"><Loader2 className="animate-spin" size={26} style={{ color: TEXT_MUTED }} /></div>;
  }

  return (
    <div className="max-w-6xl">
      <SayfaBasligi
        ikon={<ShoppingCart size={20} />}
        baslik="Satın Alma"
        aciklama="Departmanların satın alma talepleri. Kalemleri onaylayın ya da reddedin; onaylananlardan oluşan satın alma fişi execution@unex.com.tr adresine gider."
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
          ["bekleyen", `Onay bekleyen (${bekleyenler.length})`],
          ["cek", `Onaylı fişler${aktifCek ? ` (${aktifCek} aktif)` : ""}`],
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

      {sekme === "bekleyen" && (
        bekleyenler.length === 0
          ? <EmptyState icon={<Inbox size={40} />} title="Onay bekleyen liste yok" description="Departmanlar listelerini gönderdiğinde burada görünür ve e-posta gelir." />
          : <div className="space-y-5">{bekleyenler.map((l) => (
              <KararKarti key={l.id} liste={l} vurgulu={l.id === hedefListe} onMailTekrar={mailTekrar}
                onKaydedildi={(mesaj, tur) => { showToast(mesaj, tur); getir(true); }} />
            ))}</div>
      )}

      {sekme === "cek" && <CekListeleri listeler={sonuclananlar} departmanlar={departmanlar} hedef={hedefListe} onMailTekrar={mailTekrar} onIsaretle={cekIsaretle} />}

      {sekme === "gecmis" && <DepartmanGecmisi listeler={sonuclananlar} departmanlar={departmanlar} />}

      {sekme === "departmanlar" && <Departmanlar departmanlar={departmanlar} taslaklar={taslaklar} listeler={listeler} onDegisti={() => getir(true)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onay bekleyen liste: kalem bazinda karar
// ---------------------------------------------------------------------------
function KararKarti({ liste, vurgulu, onKaydedildi, onMailTekrar }: {
  liste: Liste; vurgulu: boolean;
  onKaydedildi: (mesaj: string, tur: "success" | "error") => void;
  onMailTekrar: (l: Liste, tur: "gonderim" | "sonuc") => Promise<void>;
}) {
  const [secim, setSecim] = useState<Record<string, KararSecimi>>({});
  const [not, setNot] = useState("");
  const [onay, setOnay] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [mailGonderiliyor, setMailGonderiliyor] = useState(false);
  const o = listeOzeti(liste);
  const onaySayisi = liste.kalemler.filter((k) => secim[k.id]?.karar === "onaylandi").length;
  const redSayisi = liste.kalemler.filter((k) => secim[k.id]?.karar === "reddedildi").length;
  const kalan = liste.kalemler.length - onaySayisi - redSayisi;

  const sec = (id: string, karar: KararSecimi["karar"]) =>
    setSecim((s) => ({ ...s, [id]: { karar, red_nedeni: s[id]?.red_nedeni || "" } }));
  const tumunu = (karar: KararSecimi["karar"]) =>
    setSecim(Object.fromEntries(liste.kalemler.map((k) => [k.id, { karar, red_nedeni: secim[k.id]?.red_nedeni || "" }])));

  const kaydet = async () => {
    setHata(null);
    setKaydediliyor(true);
    const r = await satinAlmaCagir<{ mail: string; alicilar: string[] }>({
      islem: "karar", liste_id: liste.id, not: not.trim(),
      kararlar: liste.kalemler.map((k) => ({ id: k.id, karar: secim[k.id]?.karar, red_nedeni: secim[k.id]?.karar === "reddedildi" ? secim[k.id].red_nedeni.trim() : "" })),
    }, true);
    setKaydediliyor(false);
    setOnay(false);
    if (!r.ok) { setHata(r.hata); onKaydedildi(r.hata, "error"); return; }
    onKaydedildi(
      r.veri.mail === "gonderildi"
        ? `${liste.liste_no} kaydedildi; ${onaySayisi ? "satın alma fişi" : "sonuç"} ${r.veri.alicilar.join(", ")} adresine gönderildi.`
        : `${liste.liste_no} kaydedildi ancak e-posta gönderilemedi. "Onaylı fişler"den tekrar gönderebilirsiniz.`,
      r.veri.mail === "gonderildi" ? "success" : "error",
    );
  };

  return (
    <section id={`liste-${liste.id}`} className="rounded-xl border overflow-hidden scroll-mt-4"
      style={{ ...kartStil, ...(vurgulu ? { borderColor: ACCENT, boxShadow: `0 0 0 1px ${ACCENT}` } : {}) }}>
      <header className="px-4 sm:px-5 py-3.5 border-b flex flex-wrap items-center gap-x-4 gap-y-2" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-white">{liste.departman} <span className="font-mono text-sm font-medium whitespace-nowrap" style={{ color: TEXT_MUTED }}>· {liste.liste_no}</span>{liste.test && <TestRozeti />}</p>
          <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
            {liste.gonderen_ad} · {saTarih(liste.gonderim_zamani)} · {o.toplam} kalem
            {o.acil > 0 && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400">{o.acil} ACİL</span>}
          </p>
        </div>
        {liste.gonderim_maili === "hata" && (
          <button disabled={mailGonderiliyor} onClick={async () => { setMailGonderiliyor(true); await onMailTekrar(liste, "gonderim"); setMailGonderiliyor(false); }}
            title={liste.gonderim_maili_hata || undefined}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-60">
            {mailGonderiliyor ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Bildirim e-postası gitmedi · tekrar gönder
          </button>
        )}
        <div className="flex gap-1.5">
          <button onClick={() => tumunu("onaylandi")} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
            <Check size={12} /> Tümünü onayla
          </button>
          {Object.keys(secim).length > 0 && (
            <button onClick={() => setSecim({})} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              <RotateCcw size={12} /> Temizle
            </button>
          )}
        </div>
      </header>

      <ul className="divide-y" style={{ borderColor: CARD_BORDER }}>
        {liste.kalemler.map((k, i) => {
          const s = secim[k.id];
          return (
            <li key={k.id} className="px-4 sm:px-5 py-3" style={{ borderColor: CARD_BORDER, backgroundColor: s?.karar === "reddedildi" ? "rgba(239,68,68,0.04)" : s?.karar === "onaylandi" ? "rgba(16,185,129,0.04)" : undefined }}>
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <span className="hidden sm:block w-6 shrink-0 text-xs pt-1 text-right" style={{ color: TEXT_MUTED }}>{i + 1}</span>
                <KalemBilgisi k={k} />
                <div className="flex gap-1.5 shrink-0" role="group" aria-label={`${k.urun} kararı`}>
                  <button onClick={() => sec(k.id, "onaylandi")} aria-pressed={s?.karar === "onaylandi"}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                    style={s?.karar === "onaylandi" ? { backgroundColor: "rgba(16,185,129,0.18)", borderColor: "rgba(16,185,129,0.6)", color: "#34D399" } : { borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                    <CheckCircle2 size={13} /> Onayla
                  </button>
                  <button onClick={() => sec(k.id, "reddedildi")} aria-pressed={s?.karar === "reddedildi"}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                    style={s?.karar === "reddedildi" ? { backgroundColor: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.55)", color: "#F87171" } : { borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                    <XCircle size={13} /> Reddet
                  </button>
                </div>
              </div>
              {s?.karar === "reddedildi" && (
                <div className="mt-2 sm:ml-9">
                  <input value={s.red_nedeni} maxLength={300} aria-label={`${k.urun} red nedeni`}
                    onChange={(e) => setSecim((x) => ({ ...x, [k.id]: { karar: "reddedildi", red_nedeni: e.target.value } }))}
                    placeholder="Red nedeni (isteğe bağlı) · ör. stokta var, bütçe dışı" className={girdiSinifi} style={girdiStil} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <footer className="px-4 sm:px-5 py-4 border-t space-y-3" style={{ borderColor: CARD_BORDER }}>
        <div>
          <label htmlFor={`not-${liste.id}`} className="block text-xs font-medium mb-1" style={{ color: TEXT_MUTED }}>Not (isteğe bağlı, e-postaya eklenir)</label>
          <textarea id={`not-${liste.id}`} value={not} onChange={(e) => setNot(e.target.value)} rows={2} maxLength={500} className={girdiSinifi} style={girdiStil}
            placeholder="Ör. Onaylananlar bu hafta alınsın." />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" style={{ color: TEXT_MUTED }}>
            <span className="text-emerald-400 font-semibold">{onaySayisi} onay</span> · <span className="text-red-400 font-semibold">{redSayisi} red</span>
            {kalan > 0 && <> · <span className="text-amber-400 font-semibold">{kalan} karar bekliyor</span></>}
          </p>
          <button onClick={() => setOnay(true)} disabled={kalan > 0 || kaydediliyor}
            title={kalan > 0 ? "Her kalem için Onayla ya da Reddet seçin" : undefined}
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
        description={`${onaySayisi} kalem onaylanacak, ${redSayisi} kalem reddedilecek.${onaySayisi ? " Onaylananlardan aktif bir satın alma fişi oluşur ve" : " Sonuç"} ${liste.test ? `yalnızca ${TEST_ALICISI} adresine (TEST)` : "execution@unex.com.tr adresine"} e-postayla gider; departman kendi bağlantısında görür. Karar sonradan değiştirilemez.`}
        confirmLabel="Evet, kaydet" cancelLabel="Vazgeç"
        onConfirm={kaydet} loading={kaydediliyor} loadingLabel="Kaydediliyor..."
      />
    </section>
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
      <p className="text-sm" style={{ color: TEXT_MUTED }}><span className="font-semibold text-white">{miktarBirim(k)}</span> · {k.talep_eden}</p>
      {k.aciklama && <p className="text-xs mt-0.5 break-words" style={{ color: TEXT_MUTED }}>{k.aciklama}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cek listeleri (sonuclanan listeler)
// ---------------------------------------------------------------------------
function CekRozeti({ l }: { l: Liste }) {
  const o = listeOzeti(l);
  if (!o.onay) return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-red-500/10 text-red-400">Tamamı reddedildi</span>;
  if (l.cek_durumu === "tamamlandi") return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-emerald-500/10 text-emerald-400">Tamamlandı</span>;
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-amber-500/10 text-amber-400">Aktif · {o.alinan}/{o.onay} alındı</span>;
}

function CekListeleri({ listeler, departmanlar, hedef, onMailTekrar, onIsaretle }: {
  listeler: Liste[]; departmanlar: Departman[]; hedef: string | null;
  onMailTekrar: (l: Liste, tur: "gonderim" | "sonuc") => Promise<void>;
  onIsaretle: (k: SaKalem) => Promise<void>;
}) {
  const [departman, setDepartman] = useState("");
  const [durum, setDurum] = useState<"" | "aktif" | "tamamlandi" | "red">("");
  const [acik, setAcik] = useState<string | null>(hedef);
  const [gonderiliyor, setGonderiliyor] = useState<string | null>(null);
  const [isleniyor, setIsleniyor] = useState<string | null>(null);
  const { showToast } = useToast();
  const fisKopyala = async (l: Liste) => {
    if (!l.cek_token) return;
    try { await navigator.clipboard.writeText(cekAdresi(l.cek_token)); showToast(`${l.liste_no} fiş bağlantısı kopyalandı; ${l.departman} departmanına iletebilirsiniz.`, "success"); }
    catch { showToast("Kopyalanamadı; fişi açıp adres çubuğundan kopyalayın.", "error"); }
  };
  const gorunen = listeler.filter((l) =>
    (!departman || l.departman_id === departman) &&
    (!durum || (durum === "red" ? listeOzeti(l).onay === 0 : l.cek_durumu === durum)));

  if (listeler.length === 0) return <EmptyState icon={<CheckCircle2 size={40} />} title="Henüz onaylı fiş yok" description="Bir talebi onayladığınızda onaylanan kalemlerden aktif satın alma fişi oluşur." />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Departman" value={departman} onChange={(e) => setDepartman(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm text-white" style={girdiStil}>
          <option value="">Tüm departmanlar</option>
          {departmanlar.map((d) => <option key={d.id} value={d.id}>{d.ad}</option>)}
        </select>
        <select aria-label="Durum" value={durum} onChange={(e) => setDurum(e.target.value as typeof durum)} className="px-3 py-1.5 border rounded-lg text-sm text-white" style={girdiStil}>
          <option value="">Tüm durumlar</option>
          <option value="aktif">Aktif</option>
          <option value="tamamlandi">Tamamlandı</option>
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
                    <ul className="divide-y rounded-lg border" style={{ borderColor: CARD_BORDER }}>
                      {l.kalemler.map((k) => (
                        <li key={k.id} className="px-3 py-2.5 flex items-start gap-3" style={{ borderColor: CARD_BORDER }}>
                          {k.karar === "onaylandi" ? (
                            <button role="checkbox" aria-checked={!!k.alindi} aria-label={`${k.urun} alındı`} disabled={isleniyor !== null}
                              onClick={async () => { setIsleniyor(k.id); await onIsaretle(k); setIsleniyor(null); }}
                              className="shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center disabled:opacity-60"
                              style={k.alindi ? { backgroundColor: ACCENT, borderColor: ACCENT, color: "#fff" } : { borderColor: "#4A5262" }}>
                              {isleniyor === k.id ? <Loader2 size={11} className="animate-spin" /> : k.alindi ? <Check size={13} /> : null}
                            </button>
                          ) : <XCircle size={18} className="shrink-0 mt-0.5 text-red-400" aria-label="Reddedildi" />}
                          <KalemBilgisi k={k} />
                          <div className="shrink-0 text-right">
                            {k.karar === "onaylandi"
                              ? (k.alindi
                                ? <><span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400"><CheckCircle2 size={13} /> Alındı</span><p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{saTarih(k.alinma_zamani)}{k.alan_ad ? ` · ${k.alan_ad}` : ""}</p></>
                                : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400"><Clock size={13} /> Alınacak</span>)
                              : <><span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400">Reddedildi</span>{k.red_nedeni && <p className="text-xs mt-0.5 max-w-[220px]" style={{ color: TEXT_MUTED }}>{k.red_nedeni}</p>}</>}
                          </div>
                        </li>
                      ))}
                    </ul>
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
          const alinan = tum.filter((k) => k.alindi).length;
          const listeSayisi = new Set(tum.map((k) => k.liste_id)).size;
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
                {tum.length > 0 && <span className="text-xs font-semibold whitespace-nowrap"><span className="text-emerald-400">{alinan} alındı</span>{tum.length - alinan > 0 && <span className="text-amber-400"> · {tum.length - alinan} alınacak</span>}</span>}
                {tum.length > 0 && <ChevronDown size={15} className={`shrink-0 transition-transform ${acikMi ? "rotate-180" : ""}`} style={{ color: TEXT_MUTED }} />}
              </button>
              {acikMi && kalemler.length > 0 && (
                <div className="overflow-x-auto border-t" style={{ borderColor: CARD_BORDER }}>
                  <table className="min-w-full">
                    <thead>
                      <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                        {["Onay", "Liste", "Ürün", "Miktar", "Talep eden", "Durum"].map((b, i) => (
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
                            <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{KATEGORILER[k.kategori] ?? k.kategori}{k.aciklama ? ` · ${k.aciklama}` : ""}</span>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right text-white font-semibold whitespace-nowrap">{miktarBirim(k)}</td>
                          <td className="px-4 py-2.5 text-sm whitespace-nowrap" style={{ color: TEXT_MUTED }}>{k.talep_eden}</td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                            {k.alindi
                              ? <span className="text-emerald-400 font-semibold">Alındı · {saTarih(k.alinma_zamani).slice(0, 10)}</span>
                              : <span className="text-amber-400 font-semibold">Alınacak</span>}
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

  // Silme onayi: departmanla birlikte KALICI silinecek liste / kalem sayisi
  const silinecekOzet = useMemo(() => {
    if (!silinecek) return null;
    const ait = listeler.filter((l) => l.departman_id === silinecek.id);
    return {
      liste: ait.length,
      kalem: ait.reduce((t, l) => t + l.kalemler.length, 0),
      bekleyen: ait.filter((l) => l.durum === "bekliyor").length,
      aktifFis: ait.filter((l) => l.cek_durumu === "aktif").length,
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
      <p className="text-sm rounded-xl border px-4 py-3" style={{ ...kartStil, color: TEXT_MUTED }}>
        Her departmanın <b className="text-white">girişsiz, kalıcı</b> bir bağlantısı var. Bağlantıyı departmandaki yetkili arkadaşlara iletin;
        ortak listeye kalem ekleyip gönderebilirler. Bağlantı başkasının eline geçtiyse <b className="text-white">Yenile</b> ile eskisini geçersiz kılın.
        <span className="block mt-1.5"><b className="text-amber-400">Test</b> işaretli departmanın talep ve onay e-postaları execution@ / bbt@ yerine <b className="text-white">yalnızca {TEST_ALICISI}</b> adresine gider; konu “[TEST]” ile başlar.</span>
      </p>
      <div className="rounded-xl border overflow-x-auto" style={kartStil}>
        <table className="min-w-full">
          <thead>
            <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
              {["Departman", "Durum", "E-posta", "Hazırlanan liste", "Bağlantı", ""].map((b) => (
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
          ? `Departmanla birlikte ${silinecekOzet.liste} liste ve ${silinecekOzet.kalem} kalem KALICI olarak silinir${silinecekOzet.gonderilen ? ` (${silinecekOzet.gonderilen} gönderilmiş liste${silinecekOzet.bekleyen ? `, ${silinecekOzet.bekleyen} onay bekleyen` : ""}${silinecekOzet.aktifFis ? `, ${silinecekOzet.aktifFis} aktif fiş` : ""})` : ""}. Departmanın talep bağlantısı ve fiş bağlantıları çalışmaz hale gelir. Bu işlem geri alınamaz. Geçmişi korumak istiyorsanız silmek yerine Pasif yapın.`
          : "Departmanın talep bağlantısı çalışmaz hale gelir. Bu departmana ait liste yok. Bu işlem geri alınamaz."}
        confirmLabel="Evet, kalıcı sil" cancelLabel="Vazgeç" destructive
        onConfirm={sil} loading={siliniyor} loadingLabel="Siliniyor..."
      />
    </div>
  );
}

export default function SatinAlmaSayfasi() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: PAGE_BG }}><Loader2 className="animate-spin" size={24} style={{ color: TEXT_MUTED }} /></div>}>
      <AppShell>
        <SatinAlmaIcerik />
      </AppShell>
    </Suspense>
  );
}
