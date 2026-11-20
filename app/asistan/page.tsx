"use client";

/**
 * YONETICI ASISTANI (21.11.2026, Faz 2). Yalniz yonetici (execution@): sayfa + yan menu + RPC ayni e-postayi kontrol eder.
 * Kullanici: "Sadece benim gorebilecegim bir panel ve onumde surekli aktif bir gorev listesi. Draft B/L uyusmazliginda
 * operasyondaki ilgili kisiye hazir mail; Harun Bey icin girilmemis odemeler ve bekleyen on odemeler. Konuyu ve metni
 * kopyalayip kendi saglayicimdan gonderecegim; onaylarsam."
 * Duzen: ozet kartlari, filtre (Acik / Gonderildi / Tumu, ?filtre=), solda gorev listesi, sagda secili gorev: kaynak
 * ayrintisi + hazir mail (Kime / Konu / Metin; Kopyala) + "Gonderdim" / "Geri al". Altta son 7 gunde kapananlar.
 * Gorev kaynak duzelince kendiliginden kaybolur (veri her acilista kaynaktan hesaplanir). ?gorev=<anahtar> secili gorev.
 * Hicbir mail sistemden gitmez; "Gonderdim" yalniz kayit.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Banknote, Check, CheckCircle2, ClipboardCheck, Copy, ExternalLink, Eye, FileWarning, Inbox, Loader2, RefreshCw, RotateCcw, Send, X,
} from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { OzetKarti } from "@/components/erp/ozet-karti";
import { SekmeCubugu, type SekmeOgesi } from "@/components/erp/sekme-cubugu";
import { useUrlSekmesi } from "@/components/erp/use-url-sekmesi";
import { AcilirSerit, useAcikTercihi } from "@/components/erp/acilir-serit";
import { adresParametresi, adresiGuncelle } from "@/lib/url-durumu";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import {
  asistanFiltresi, gorevleriKur, gorevSayilari, kapananAyrintisi, konsimentoYazisi, trTarih, trTutar, yoneticiMi, zamanIso,
  type AsistanFiltre, type AsistanVerisi, type Gorev,
} from "@/lib/asistan/gorunum";
import { asistanVerisiOku, gorevIsaretiniGeriAl, gorevIsaretle, ozetMailiCagir } from "@/lib/asistan/veri";

const SEFTALI = "#F4A07C";
/** Gorev turune gore ust etiket ve kaynak tablo basligi */
const TUR_ETIKETI: Record<Gorev["tur"], string> = { draft_bl: "Draft B/L", fatura: "Fatura", beyanname: "Gümrük beyannamesi", odeme: "Ödeme takibi" };
const BELGE_SUTUNU: Record<Gorev["tur"], string> = { draft_bl: "Draft", fatura: "Fatura", beyanname: "Beyanname", odeme: "" };
const KAPANAN_ETIKETI: Record<string, string> = { draft_bl: "Draft B/L", fatura: "Fatura", beyanname: "Beyanname", on_odeme: "Ön ödeme", odeme: "Ödeme" };
const KIRMIZI = "#F87171";
const AMBER = "#FBBF24";
const saatTR = (zaman: string | null | undefined) => {
  const iso = zamanIso(zaman);
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
};

async function panoyaKopyala(metin: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(metin); return true; } catch { /* eski tarayici: asagida */ }
  try {
    const t = document.createElement("textarea");
    t.value = metin; t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(t);
    return ok;
  } catch { return false; }
}

function KopyaDugmesi({ metin, etiket, testId }: { metin: string; etiket: string; testId: string }) {
  const [tamam, setTamam] = useState(false);
  const { showToast } = useToast();
  return (
    <button type="button" data-testid={testId} disabled={!metin}
      onClick={async () => {
        if (await panoyaKopyala(metin)) { setTamam(true); window.setTimeout(() => setTamam(false), 1400); }
        else showToast("Kopyalanamadı; metni seçip elle kopyalayın.", "error");
      }}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium transition-colors hover:bg-white/[0.05] disabled:opacity-40"
      style={{ borderColor: tamam ? ACCENT : "#2A3240", color: tamam ? ACCENT : "#E5E7EB" }}>
      {tamam ? <Check size={13} /> : <Copy size={13} />} {tamam ? "Kopyalandı" : etiket}
    </button>
  );
}

export default function YoneticiAsistaniPage() {
  const { user, loading: authLoading } = useAuth();
  const yetkili = yoneticiMi(user?.email);
  const router = useRouter();
  const { showToast } = useToast();
  const [veri, setVeri] = useState<AsistanVerisi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [secili, setSecili] = useState<string | null>(null);
  const [filtre, setFiltre] = useUrlSekmesi<AsistanFiltre>(asistanFiltresi, "acik", "filtre");
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [metinler, setMetinler] = useState<Record<string, string>>({});
  const [onizleme, setOnizleme] = useState<{ konu: string; html: string } | null>(null);
  const [kapananAcik, setKapananAcik] = useAcikTercihi("asistan-kapananlar");

  useEffect(() => { if (!authLoading && !yetkili) router.replace("/panel"); }, [authLoading, yetkili, router]);

  const getir = useCallback(async () => {
    try { setVeri(await asistanVerisiOku()); setHata(null); }
    catch (e) { setHata(`Görevler okunamadı: ${e instanceof Error ? e.message : String(e)}`); }
    setYukleniyor(false);
  }, []);
  useEffect(() => { if (yetkili) getir(); }, [yetkili, getir]);

  const gorevler = useMemo(() => (veri ? gorevleriKur(veri) : []), [veri]);
  const sayi = useMemo(() => gorevSayilari(gorevler), [gorevler]);
  const gorunen = useMemo(() => gorevler.filter((g) => filtre === "tumu" || g.durum === filtre), [gorevler, filtre]);

  // Ilk acilista ?gorev= (sabah ozet mailindeki "Ac"); yoksa / gecersizse gorunen listenin ilki
  useEffect(() => {
    if (!veri) return;
    const istenen = adresParametresi("gorev");
    setSecili((s) => {
      const aday = s ?? istenen;
      if (aday && gorevler.some((g) => g.anahtar === aday)) {
        const g = gorevler.find((x) => x.anahtar === aday)!;
        if (filtre !== "tumu" && g.durum !== filtre) setFiltre("tumu");
        return aday;
      }
      return gorunen[0]?.anahtar ?? null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veri]);
  const sec = (anahtar: string) => { setSecili(anahtar); adresiGuncelle({ gorev: anahtar }); };
  const gorev = gorevler.find((g) => g.anahtar === secili) || null;
  const metin = gorev ? metinler[gorev.anahtar] ?? gorev.metin : "";

  const gonderdim = async (g: Gorev) => {
    setMesgul(g.anahtar);
    try { await gorevIsaretle(g.anahtar, g.tur, `${g.konu} · ${g.sorumlu}`); showToast("Gönderildi olarak işaretlendi.", "success"); await getir(); }
    catch (e) { showToast(`İşaretlenemedi: ${e instanceof Error ? e.message : String(e)}`, "error"); }
    setMesgul(null);
  };
  const geriAl = async (g: Gorev) => {
    setMesgul(g.anahtar);
    try { await gorevIsaretiniGeriAl(g.anahtar); showToast("İşaret geri alındı; görev yeniden açık.", "success"); await getir(); }
    catch (e) { showToast(`Geri alınamadı: ${e instanceof Error ? e.message : String(e)}`, "error"); }
    setMesgul(null);
  };
  const ozetOnizle = async () => {
    setMesgul("onizle");
    try {
      const r = await ozetMailiCagir({ deneme: true });
      if (r.html) setOnizleme({ konu: r.konu || "", html: r.html }); else showToast("Önizleme alınamadı.", "error");
    } catch (e) { showToast(`Önizleme alınamadı: ${e instanceof Error ? e.message : String(e)}`, "error"); }
    setMesgul(null);
  };
  const ozetTest = async () => {
    setMesgul("test");
    try {
      const r = await ozetMailiCagir({ test: true });
      showToast(r.gonderildi ? `Test maili gönderildi: ${(r.alici || []).join(", ")}` : (r.hata || "Test maili gönderilmedi."), r.gonderildi ? "success" : "error");
    } catch (e) { showToast(`Test maili gönderilemedi: ${e instanceof Error ? e.message : String(e)}`, "error"); }
    setMesgul(null);
  };

  if (authLoading || (yetkili && yukleniyor)) return <AppShell><SayfaYukleniyor /></AppShell>;
  if (!yetkili) return <AppShell><div /></AppShell>;

  const SEKMELER: SekmeOgesi<AsistanFiltre>[] = [
    { deger: "acik", etiket: "Bugün isteyin", sayi: sayi.acik, vurgu: sayi.acik > 0 },
    { deger: "gonderildi", etiket: "Gönderildi, bekleniyor", sayi: sayi.gonderildi },
    { deger: "tumu", etiket: "Tümü", sayi: gorevler.length },
  ];

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto" data-testid="asistan-sayfa">
        <SayfaBasligi ikon={<ClipboardCheck size={20} />} baslik="Yönetici Asistanı"
          aciklama="Bugün istemeniz gerekenler. Hazır maili kopyalayıp kendi adresinizden gönderin; kaynak düzelince görev kendiliğinden kapanır."
          sag={
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={ozetOnizle} disabled={!!mesgul} data-testid="asistan-ozet-onizle"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-[13px] hover:bg-white/[0.05] disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: "#E5E7EB" }}>
                {mesgul === "onizle" ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Sabah özetini önizle
              </button>
              <button type="button" onClick={() => { setYukleniyor(false); getir(); }} disabled={!!mesgul} data-testid="asistan-yenile"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-[13px] hover:bg-white/[0.05] disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: "#E5E7EB" }}>
                <RefreshCw size={14} /> Yenile
              </button>
            </div>
          } />

        {hata && <p className="mb-3 text-sm text-red-400" role="alert">{hata}</p>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <OzetKarti testId="asistan-kart-acik" ikon={<Inbox size={14} />} etiket="Bugün isteyin" deger={sayi.acik}
            alt={sayi.gonderildi ? `${sayi.gonderildi} görev gönderildi, bekleniyor` : "Gönderildi bekleyen yok"} onClick={() => setFiltre("acik")} />
          <OzetKarti testId="asistan-kart-draft" ikon={<FileWarning size={14} />} etiket="Evrak uyuşmazlığı" deger={(veri?.draft.length ?? 0) + (veri?.evrak.length ?? 0)}
            alt={veri ? `Draft B/L ${veri.draft.length} · Fatura ${veri.evrak.filter((e) => e.tur === "fatura").length} · Beyanname ${veri.evrak.filter((e) => e.tur === "beyanname").length}` : "Açık dosyalar"} />
          <OzetKarti testId="asistan-kart-odeme" ikon={<Banknote size={14} />} etiket="Ödemesi girilmemiş sevkiyat" deger={veri?.odeme.length ?? 0} alt="Gemisi kalkmış · telex / seawaybill / vesaik yok" />
          <OzetKarti testId="asistan-kart-onodeme" ikon={<Banknote size={14} />} etiket="Ön ödeme bekleyen sipariş" deger={veri?.on_odeme.length ?? 0} alt="Sipariş Listesi › Onay bekleyen" />
        </div>

        <SekmeCubugu testId="asistan-filtre" veriOzelligi="filtre" sayiBicimi="rozet" className="mb-4 lg:inline-flex" dugmeBosluk="px-3"
          secili={filtre} onSec={setFiltre} ogeler={SEKMELER} />

        <div className="grid gap-4 lg:grid-cols-[minmax(300px,420px)_1fr] items-start">
          {/* Gorev listesi */}
          <section className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="asistan-liste">
            {gorunen.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <CheckCircle2 size={28} className="mx-auto mb-2" style={{ color: ACCENT }} />
                <p className="text-sm text-white">{filtre === "acik" ? "Bugün istemeniz gereken bir şey yok." : "Bu bölümde görev yok."}</p>
                <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>Draft B/L, fatura ya da beyanname uyuşmazlığı ve bekleyen ödeme çıkınca burada görünür.</p>
              </div>
            ) : gorunen.map((g) => {
              const s = g.anahtar === secili;
              const renk = g.durum === "gonderildi" ? TEXT_MUTED : g.tur === "odeme" ? AMBER : KIRMIZI;
              return (
                <button key={g.anahtar} type="button" onClick={() => sec(g.anahtar)} data-gorev={g.anahtar} aria-current={s ? "true" : undefined}
                  className="w-full text-left px-4 py-3 border-b last:border-b-0 transition-colors hover:bg-white/[0.03]"
                  style={{ borderColor: CARD_BORDER, backgroundColor: s ? "rgba(16,185,129,0.08)" : undefined, boxShadow: `inset 3px 0 0 ${s ? ACCENT : renk}` }}>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0" style={{ color: renk }}>{g.tur === "odeme" ? <Banknote size={15} /> : <FileWarning size={15} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-white truncate">{g.baslik}</span>
                      <span className="block text-xs mt-0.5 line-clamp-2" style={{ color: TEXT_MUTED }}>{g.alt}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#C9D1DC" }}>Kime: {g.sorumlu}</span>
                        {g.durum === "gonderildi"
                          ? <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(16,185,129,0.14)", color: "#6EE7B7" }}>Gönderildi · {saatTR(g.isaret?.zaman)}</span>
                          : <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: g.tur === "odeme" ? "rgba(245,158,11,0.14)" : "rgba(248,113,113,0.14)", color: g.tur === "odeme" ? "#FCD34D" : "#FCA5A5" }}>Bugün isteyin</span>}
                      </span>
                    </span>
                  </div>
                </button>
              );
            })}
          </section>

          {/* Secili gorev */}
          <section className="rounded-xl border lg:sticky lg:top-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="asistan-ayrinti">
            {!gorev ? (
              <p className="px-5 py-10 text-sm text-center" style={{ color: TEXT_MUTED }}>Soldan bir görev seçin.</p>
            ) : (
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: gorev.tur === "odeme" ? AMBER : KIRMIZI }}>{TUR_ETIKETI[gorev.tur]}</p>
                    <h2 className="text-lg font-semibold text-white leading-snug mt-0.5">{gorev.baslik}</h2>
                    <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>Kaynak: {gorev.kaynak} · Kime: {gorev.sorumlu}</p>
                  </div>
                  <Link href={gorev.baglanti} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs hover:bg-white/[0.05]" style={{ borderColor: CARD_BORDER, color: "#E5E7EB" }}>
                    <ExternalLink size={13} /> {gorev.tur === "odeme" ? "ETD/ETA ödeme takibi" : "Dosyayı aç"}
                  </Link>
                </div>

                {/* Kaynak ayrintisi */}
                {gorev.tur !== "odeme" && veri && (() => {
                  const d = gorev.tur === "draft_bl"
                    ? veri.draft.find((x) => gorev.anahtar.startsWith(`draft:${x.dosya_id}:`))
                    : veri.evrak.find((x) => gorev.anahtar.startsWith(`${x.tur}:${x.dosya_id}:`));
                  if (!d) return null;
                  return (
                    <div className="mt-4 rounded-lg border overflow-hidden" style={{ borderColor: CARD_BORDER }} data-testid="asistan-draft-alanlar">
                      <table className="w-full text-[13px]">
                        <thead><tr style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }} className="text-[11px] uppercase tracking-wide">
                          <th className="text-left px-3 py-2 font-medium">Alan</th><th className="text-left px-3 py-2 font-medium">Sistem</th><th className="text-left px-3 py-2 font-medium">{BELGE_SUTUNU[gorev.tur]}</th>
                        </tr></thead>
                        <tbody>{(d.alanlar.length ? d.alanlar : [{ alan: d.ozet || "Uyuşmazlık", sistem: null, belge: null, not: null }]).map((a, i) => (
                          <tr key={i} className="border-t align-top" style={{ borderColor: CARD_BORDER }}>
                            <td className="px-3 py-2 text-white font-medium whitespace-nowrap"><AlertTriangle size={12} className="inline mr-1.5 -mt-0.5" style={{ color: KIRMIZI }} />{a.alan}</td>
                            <td className="px-3 py-2" style={{ color: "#C9D1DC" }}>{a.sistem || "-"}</td>
                            <td className="px-3 py-2" style={{ color: "#C9D1DC" }}>{a.belge || "-"}{a.not && <span className="block text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{a.not}</span>}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  );
                })()}
                {gorev.tur === "odeme" && veri && (
                  <div className="mt-4 grid gap-3" data-testid="asistan-odeme-listesi">
                    {veri.odeme.length > 0 && (
                      <div className="rounded-lg border overflow-hidden" style={{ borderColor: CARD_BORDER }}>
                        <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>Gemisi kalkmış, ödemesi girilmemiş · {veri.odeme.length}</p>
                        <div className="max-h-56 overflow-y-auto">
                          {veri.odeme.map((o) => (
                            <div key={o.rezervasyon_id} className="flex items-center gap-3 px-3 py-2 border-t text-[13px]" style={{ borderColor: CARD_BORDER }}>
                              <Link href={`/dosya/${o.dosya_id}`} className="font-medium text-white hover:underline whitespace-nowrap">{o.dosya_no || "-"}</Link>
                              <span className="truncate flex-1" style={{ color: "#C9D1DC" }}>{o.alici_firma || "-"}</span>
                              <span className="text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{trTarih(o.etd)}{o.gun !== null ? ` · ${o.gun} gün` : ""}</span>
                              <span className="text-[11px] whitespace-nowrap px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(245,158,11,0.12)", color: "#FCD34D" }}>{konsimentoYazisi(o.konsimento_durumu)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {veri.on_odeme.length > 0 && (
                      <div className="rounded-lg border overflow-hidden" style={{ borderColor: CARD_BORDER }}>
                        <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>Ön ödemesi beklenen siparişler · {veri.on_odeme.length}</p>
                        <div className="max-h-56 overflow-y-auto">
                          {veri.on_odeme.map((s) => (
                            <div key={s.anahtar} className="flex items-center gap-3 px-3 py-2 border-t text-[13px]" style={{ borderColor: CARD_BORDER }}>
                              <span className="font-medium text-white whitespace-nowrap">{s.proforma_no || "-"}</span>
                              <span className="truncate flex-1" style={{ color: "#C9D1DC" }}>{s.firma || "-"}</span>
                              <span className="text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{trTarih(s.proforma_tarihi)}</span>
                              {s.tutar !== null && <span className="text-xs tabular-nums whitespace-nowrap text-white">{trTutar(s.tutar, s.para_birimi)}</span>}
                            </div>
                          ))}
                        </div>
                        <Link href="/siparisler?sekme=onay" className="block px-3 py-2 border-t text-xs hover:underline" style={{ borderColor: CARD_BORDER, color: ACCENT }}>Sipariş Listesi › Onay bekleyen</Link>
                      </div>
                    )}
                  </div>
                )}

                {/* Hazir mail */}
                <div className="mt-5 rounded-xl border p-4" style={{ borderColor: "rgba(16,185,129,0.3)", backgroundColor: "rgba(16,185,129,0.04)" }} data-testid="asistan-mail">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-[13px] font-semibold text-white inline-flex items-center gap-2"><Send size={14} style={{ color: ACCENT }} /> Hazır mail</p>
                    <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Sistem göndermez · kendi adresinizden gönderin</p>
                  </div>
                  <div className="grid gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-xs" style={{ color: TEXT_MUTED }}>Kime</span>
                      <span className="flex-1 min-w-0 truncate rounded-lg border px-3 py-1.5 text-[13px]" style={{ borderColor: "#2A3240", backgroundColor: ROW_HEADER_BG, color: gorev.alici ? "#E5E7EB" : TEXT_MUTED }}>
                        {gorev.alici || `${gorev.sorumlu} · adresi Promail'de seçin`}
                      </span>
                      <KopyaDugmesi metin={gorev.alici} etiket="Kopyala" testId="asistan-kopya-kime" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-xs" style={{ color: TEXT_MUTED }}>Konu</span>
                      <span className="flex-1 min-w-0 truncate rounded-lg border px-3 py-1.5 text-[13px] text-white" style={{ borderColor: "#2A3240", backgroundColor: ROW_HEADER_BG }} data-testid="asistan-konu">{gorev.konu}</span>
                      <KopyaDugmesi metin={gorev.konu} etiket="Kopyala" testId="asistan-kopya-konu" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs" style={{ color: TEXT_MUTED }}>Metin {metinler[gorev.anahtar] !== undefined && metinler[gorev.anahtar] !== gorev.metin ? "· düzenlendi" : "· isterseniz düzenleyin"}</span>
                        <span className="flex gap-2">
                          {metinler[gorev.anahtar] !== undefined && metinler[gorev.anahtar] !== gorev.metin && (
                            <button type="button" onClick={() => setMetinler((m) => { const y = { ...m }; delete y[gorev.anahtar]; return y; })}
                              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs hover:bg-white/[0.05]" style={{ color: TEXT_MUTED }}><RotateCcw size={12} /> İlk hali</button>
                          )}
                          <KopyaDugmesi metin={metin} etiket="Metni kopyala" testId="asistan-kopya-metin" />
                        </span>
                      </div>
                      <textarea value={metin} onChange={(e) => setMetinler((m) => ({ ...m, [gorev.anahtar]: e.target.value }))} rows={Math.min(16, Math.max(8, metin.split("\n").length + 1))}
                        data-testid="asistan-metin" spellCheck={false}
                        className="w-full rounded-lg border px-3 py-2 text-[13px] leading-relaxed text-white resize-y focus:outline-none focus:border-emerald-500/60"
                        style={{ borderColor: "#2A3240", backgroundColor: ROW_HEADER_BG, fontFamily: "inherit" }} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    {gorev.durum === "gonderildi" ? (
                      <>
                        <span className="mr-auto text-xs inline-flex items-center gap-1.5" style={{ color: "#6EE7B7" }}><CheckCircle2 size={14} /> {saatTR(gorev.isaret?.zaman)} gönderildi · kaynak düzelince kapanır</span>
                        <button type="button" onClick={() => geriAl(gorev)} disabled={mesgul === gorev.anahtar} data-testid="asistan-geri-al"
                          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-[13px] hover:bg-white/[0.05] disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: "#E5E7EB" }}>
                          <RotateCcw size={14} /> Geri al
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => gonderdim(gorev)} disabled={mesgul === gorev.anahtar} data-testid="asistan-gonderdim"
                        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-[13px] font-semibold disabled:opacity-50" style={{ backgroundColor: ACCENT, color: "#04110C" }}>
                        {mesgul === gorev.anahtar ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Gönderdim
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {veri && (
          <AcilirSerit className="mt-4" testId="asistan-kapananlar" acik={kapananAcik ?? false} onDegistir={() => setKapananAcik(!(kapananAcik ?? false))}
            ikon={<CheckCircle2 size={14} />} baslik={`Son 7 günde kapananlar · ${veri.kapananlar.length}`} kapaliEtiket="Göster"
            renk="#6EE7B7" zemin="rgba(16,185,129,0.05)" kenar="rgba(16,185,129,0.25)">
            {veri.kapananlar.length === 0 ? (
              <p className="px-4 py-3 text-xs" style={{ color: TEXT_MUTED }}>Son 7 günde kapanan görev yok.</p>
            ) : (
              <ul className="max-h-72 overflow-y-auto">
                {veri.kapananlar.map((k, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2 border-t text-[13px]" style={{ borderColor: CARD_BORDER }}>
                    <span className="text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: "rgba(16,185,129,0.12)", color: "#6EE7B7" }}>
                      {KAPANAN_ETIKETI[k.tur] || "Ödeme"}
                    </span>
                    <span className="truncate flex-1 text-white">{k.baslik || "-"}</span>
                    <span className="text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{kapananAyrintisi(k)}</span>
                    <span className="text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{saatTR(k.zaman)}</span>
                  </li>
                ))}
              </ul>
            )}
          </AcilirSerit>
        )}
      </div>

      {onizleme && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(4,7,11,0.7)" }} role="dialog" aria-modal="true" aria-label="Sabah özeti önizleme">
          <div className="w-full max-w-3xl h-[85vh] rounded-xl border flex flex-col overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
              <div className="min-w-0 flex-1">
                <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Unex AI · hafta içi her sabah 08:30 · yalnız size</p>
                <p className="text-sm text-white truncate">{onizleme.konu}</p>
              </div>
              <button type="button" onClick={ozetTest} disabled={!!mesgul} data-testid="asistan-ozet-test"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs hover:bg-white/[0.05] disabled:opacity-50" style={{ borderColor: SEFTALI, color: SEFTALI }}>
                {mesgul === "test" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Test adresine gönder
              </button>
              <button type="button" onClick={() => setOnizleme(null)} aria-label="Kapat" className="p-1.5 rounded-lg hover:bg-white/[0.06]" style={{ color: TEXT_MUTED }}><X size={16} /></button>
            </div>
            <iframe title="Sabah özeti" srcDoc={onizleme.html} sandbox="" className="flex-1 w-full bg-white" />
          </div>
        </div>
      )}
    </AppShell>
  );
}
