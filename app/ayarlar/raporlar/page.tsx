"use client";

/**
 * Ayarlar > Rapor Alicilari (11.11.2026). Kullanici: "Rapor alicilari ve canli / test secimi Ayarlar'da bir sayfadan
 * yonetilsin." Siparis raporu, navlun raporu: alici listesi (en fazla 10), Canli anahtari, Onizle (mail gondermez) ve
 * Test maili (yalniz test adresine). 11.11.2026 aksam: fatura talimati onayi (onaylayanlar + dagitim) listeleri; musteri
 * ozeti kaldirildi. Yalniz super admin (AppShell + bu sayfa + RPC uc katman).
 * Canli kapaliyken zamanlanmis rapor da "[TEST]" olarak yalniz test adresine gider.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, Mail, Save, Send, X } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { ACCENT, CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { AZAMI_ALICI, RAPORLAR, adresAyikla, raporAlicilariGetir, raporAlicilariKaydet, raporOnizle, raporTestMaili, type RaporAlicisi, type RaporTuru } from "@/lib/rapor-alicilari";

type Taslak = { metin: string; canli: boolean };
const tarihSaat = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

export default function RaporAlicilariPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [kayit, setKayit] = useState<Record<string, RaporAlicisi>>({});
  const [taslak, setTaslak] = useState<Record<string, Taslak>>({});
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [onizleme, setOnizleme] = useState<{ ad: string; konu: string; html: string } | null>(null);

  useEffect(() => { if (!authLoading && !isSuperAdmin) router.replace("/panel"); }, [authLoading, isSuperAdmin, router]);

  const getir = useCallback(async () => {
    try {
      const l = await raporAlicilariGetir();
      setKayit(Object.fromEntries(l.map((x) => [x.rapor, x])));
      setTaslak(Object.fromEntries(l.map((x) => [x.rapor, { metin: x.alicilar.join(", "), canli: x.canli }])));
      setHata(null);
    } catch (e) { setHata(`Rapor alıcıları okunamadı: ${e instanceof Error ? e.message : String(e)}`); }
    setYukleniyor(false);
  }, []);
  useEffect(() => { if (isSuperAdmin) getir(); }, [isSuperAdmin, getir]);

  const kaydet = async (rapor: RaporTuru) => {
    const t = taslak[rapor];
    const { gecerli, gecersiz } = adresAyikla(t.metin);
    if (gecersiz.length) { showToast(`Geçersiz e-posta: ${gecersiz.join(", ")}`, "error"); return; }
    if (gecerli.length > AZAMI_ALICI) { showToast(`En fazla ${AZAMI_ALICI} alıcı girilebilir.`, "error"); return; }
    if (t.canli && !gecerli.length) { showToast("Canlı rapor için en az bir alıcı girin.", "error"); return; }
    setMesgul(`kaydet-${rapor}`);
    try { await raporAlicilariKaydet(rapor, gecerli, t.canli); showToast("Kaydedildi.", "success"); await getir(); }
    catch (e) { showToast(`Kaydedilemedi: ${e instanceof Error ? e.message : String(e)}`, "error"); }
    setMesgul(null);
  };

  const onizle = async (edge: string, ad: string) => {
    setMesgul(`onizle-${edge}`);
    try { const o = await raporOnizle(edge); setOnizleme({ ad, ...o }); }
    catch (e) { showToast(`Önizleme açılamadı: ${e instanceof Error ? e.message : String(e)}`, "error"); }
    setMesgul(null);
  };
  const test = async (edge: string) => {
    setMesgul(`test-${edge}`);
    try { await raporTestMaili(edge); showToast("Test maili gönderildi (yalnız test adresine, Excel ekli).", "success"); }
    catch (e) { showToast(`Test maili gönderilemedi: ${e instanceof Error ? e.message : String(e)}`, "error"); }
    setMesgul(null);
  };

  const degisti = useMemo(() => new Set(RAPORLAR.filter(({ rapor }) => {
    const k = kayit[rapor]; const t = taslak[rapor];
    if (!k || !t) return false;
    return t.canli !== k.canli || adresAyikla(t.metin).gecerli.join(",") !== k.alicilar.join(",");
  }).map((r) => r.rapor)), [kayit, taslak]);

  if (authLoading || (isSuperAdmin && yukleniyor)) return <AppShell><SayfaYukleniyor /></AppShell>;
  if (!isSuperAdmin) return null;

  return (
    <AppShell>
      <SayfaBasligi ikon={<Mail size={20} />} baslik="Rapor Alıcıları"
        aciklama="Rapor ve fatura talimatı maillerinin kime gideceği. Canlı kapalıyken mail yalnızca test adresine “[TEST]” olarak gider. Önizle mail göndermez; raporun bugünkü halini gösterir." />
      {hata && <p className="mb-4 text-sm text-red-400" role="alert">{hata}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {RAPORLAR.map((r) => {
          const t = taslak[r.rapor] || { metin: "", canli: false };
          const k = kayit[r.rapor];
          const edge = r.edge;
          const { gecerli, gecersiz } = adresAyikla(t.metin);
          return (
            <section key={r.rapor} data-testid={`rapor-${r.rapor}`} className="rounded-xl border p-4 flex flex-col gap-3" style={{ backgroundColor: CARD_BG, borderColor: k?.canli ? "rgba(16,185,129,0.45)" : CARD_BORDER }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-white">{r.ad}</h2>
                  <p className="text-[11px] leading-snug" style={{ color: TEXT_MUTED }}>{r.aciklama}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{r.saat}</p>
                </div>
                <span data-testid="rapor-durum" className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={k?.canli ? { backgroundColor: "rgba(16,185,129,0.15)", color: "#6EE7B7" } : { backgroundColor: "rgba(245,158,11,0.12)", color: "#FCD34D" }}>
                  {k?.canli ? `Canlı · ${k.alicilar.length} alıcı` : "Test modu"}
                </span>
              </div>
              <label className="text-xs" style={{ color: TEXT_MUTED }}>
                Alıcılar <span className="opacity-70">(virgülle, en fazla {AZAMI_ALICI})</span>
                <textarea rows={3} value={t.metin} data-testid="rapor-alicilar"
                  onChange={(e) => setTaslak((s) => ({ ...s, [r.rapor]: { ...t, metin: e.target.value } }))}
                  className="mt-1 w-full text-sm border rounded-md px-2 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  style={{ borderColor: gecersiz.length || gecerli.length > AZAMI_ALICI ? "rgba(248,113,113,0.6)" : CARD_BORDER, backgroundColor: "#0F141C" }} placeholder="ornek@firma.com, ..." />
              </label>
              {(gecersiz.length > 0 || gecerli.length > AZAMI_ALICI) && <p className="text-[11px] text-red-400 -mt-2">{gecersiz.length ? `Geçersiz: ${gecersiz.join(", ")}` : `En fazla ${AZAMI_ALICI} alıcı.`}</p>}
              <button type="button" role="switch" aria-checked={t.canli} data-testid="rapor-canli"
                onClick={() => setTaslak((s) => ({ ...s, [r.rapor]: { ...t, canli: !t.canli } }))}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs text-left"
                style={{ borderColor: t.canli ? "rgba(16,185,129,0.45)" : CARD_BORDER, color: t.canli ? "#E6F4EE" : TEXT_MUTED }}>
                <span>{t.canli ? "Canlı: alıcılara gider" : "Test: yalnızca test adresine gider"}</span>
                <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full" style={{ backgroundColor: t.canli ? ACCENT : CARD_BORDER }} aria-hidden>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${t.canli ? "translate-x-4" : "translate-x-1"}`} />
                </span>
              </button>
              <div className="flex flex-wrap gap-2 mt-auto">
                <button type="button" onClick={() => kaydet(r.rapor)} disabled={!degisti.has(r.rapor) || !!mesgul} data-testid="rapor-kaydet"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white disabled:opacity-40" style={{ backgroundColor: ACCENT }}>
                  {mesgul === `kaydet-${r.rapor}` ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Kaydet
                </button>
                {edge && <>
                <button type="button" onClick={() => onizle(edge, r.ad)} disabled={!!mesgul} data-testid="rapor-onizle"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs hover:bg-white/5 disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>
                  {mesgul === `onizle-${edge}` ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Önizle
                </button>
                <button type="button" onClick={() => test(edge)} disabled={!!mesgul} data-testid="rapor-test"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs hover:bg-white/5 disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>
                  {mesgul === `test-${edge}` ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Test maili
                </button>
                </>}
              </div>
              {k?.guncelleme && <p className="text-[10px]" style={{ color: TEXT_MUTED }}>Son değişiklik {tarihSaat(k.guncelleme)}{k.guncelleyen ? ` · ${k.guncelleyen}` : ""}</p>}
            </section>
          );
        })}
      </div>

      {onizleme && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60" onMouseDown={(e) => { if (e.target === e.currentTarget) setOnizleme(null); }} data-testid="rapor-onizleme">
          <div className="w-full max-w-[800px] h-[90vh] rounded-xl border flex flex-col overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="px-4 py-2.5 border-b flex items-center gap-2" style={{ borderColor: CARD_BORDER }}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{onizleme.ad} · önizleme</p>
                <p className="text-[11px] truncate" style={{ color: TEXT_MUTED }}>{onizleme.konu}</p>
              </div>
              <button type="button" onClick={() => setOnizleme(null)} aria-label="Kapat" className="p-1.5 rounded-md hover:bg-white/10" style={{ color: TEXT_MUTED }}><X size={16} /></button>
            </div>
            <iframe title={`${onizleme.ad} önizleme`} srcDoc={onizleme.html} sandbox="" className="flex-1 w-full bg-white" />
          </div>
        </div>
      )}
    </AppShell>
  );
}
