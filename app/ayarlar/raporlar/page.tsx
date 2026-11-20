"use client";

/**
 * Ayarlar > Rapor Alicilari (11.11.2026; 12.11.2026 yeniden tasarim). Kullanici: "Butun raporlar orada gozuksun ve
 * tiklandiginda ALICI - CC ayarlanabilsin. Bizim maillerimiz hizli tiklanabilir olarak kayitli olmali; animasyonlu bir
 * sekilde ayarlama yapabilmeliyiz. Mumkunse tek ekrana sigmali, sayfa asagiya kadar uzamamali."
 * Duzen: solda gruplu rapor listesi (durum + alici / CC sayisi), sagda secili raporun duzenleyicisi: Alici ve CC kutulari,
 * adres defteri (her adreste Alici / CC dugmesi; tiklayinca kutuya kayarak eklenir), elle adres + deftere kaydet,
 * Canli / Test anahtari (yalniz test modlu raporlarda), Kaydet / Vazgec, Onizle / Test maili.
 * Kayit yoksa (eski sunucu ayari) mail bugunku alicilara gitmeye devam eder. Yalniz super admin (AppShell + sayfa + RPC).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, Loader2, Mail, Plus, RotateCcw, Save, Send, Trash2, X } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { ACCENT, CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import {
  AZAMI_ALICI, RAPORLAR, adresDefterindenSil, adresDefterineEkle, adresDefteriGetir, epostaGecerli, kisaAdres,
  raporAlicilariGetir, raporAlicilariKaydet, raporOnizle, raporTestMaili, type RaporAlicisi, type RaporTanimi, type RaporTuru,
} from "@/lib/rapor-alicilari";

type Taslak = { to: string[]; cc: string[]; canli: boolean };
type Rol = "to" | "cc";
const SEFTALI = "#F4A07C";
const tarihSaat = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const ayni = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export default function RaporAlicilariPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [kayit, setKayit] = useState<Record<string, RaporAlicisi>>({});
  const [taslak, setTaslak] = useState<Record<string, Taslak>>({});
  const [defter, setDefter] = useState<string[]>([]);
  const [secili, setSecili] = useState<RaporTuru>("gunluk_ihracat");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [yeniAdres, setYeniAdres] = useState("");
  const [yeniVurgu, setYeniVurgu] = useState<string | null>(null);
  const [onizleme, setOnizleme] = useState<{ ad: string; konu: string; html: string } | null>(null);
  const [musteriler, setMusteriler] = useState<string[]>([]);
  const [musteri, setMusteri] = useState("");

  useEffect(() => { if (!authLoading && !isSuperAdmin) router.replace("/panel"); }, [authLoading, isSuperAdmin, router]);

  const getir = useCallback(async () => {
    try {
      const [l, d] = await Promise.all([raporAlicilariGetir(), adresDefteriGetir()]);
      setKayit(Object.fromEntries(l.map((x) => [x.rapor, x])));
      setTaslak(Object.fromEntries(l.map((x) => [x.rapor, { to: x.alicilar, cc: x.cc, canli: x.canli }])));
      setDefter(d);
      setHata(null);
    } catch (e) { setHata(`Rapor alıcıları okunamadı: ${e instanceof Error ? e.message : String(e)}`); }
    setYukleniyor(false);
  }, []);
  useEffect(() => { if (isSuperAdmin) getir(); }, [isSuperAdmin, getir]);

  const tanim = RAPORLAR.find((r) => r.rapor === secili) as RaporTanimi;
  // Asamali gecis: bu mailin gonderimi buradaki ayari henuz okumuyorsa duzenleme kilitli (yanlis guven vermesin)
  const kilit = tanim.etkin === "yakinda";
  const ccKilit = tanim.etkin !== "tam";
  const t: Taslak = taslak[secili] || { to: [], cc: [], canli: false };
  const k = kayit[secili];
  const degisti = useCallback((r: RaporTuru) => {
    const a = kayit[r], b = taslak[r];
    return !!a && !!b && (!ayni(a.alicilar, b.to) || !ayni(a.cc, b.cc) || a.canli !== b.canli);
  }, [kayit, taslak]);

  const guncelle = (f: (x: Taslak) => Taslak) => setTaslak((s) => ({ ...s, [secili]: f(s[secili] || { to: [], cc: [], canli: false }) }));
  /** Adresi Alici / CC'ye koy (digerinden cikar); ayni yere tekrar tiklamak cikarir. */
  const yerlestir = (e: string, rol: Rol) => {
    if (kilit || (rol === "cc" && ccKilit)) { showToast(kilit ? "Bu mailin alıcı ayarı sonraki güncellemede açılacak." : "CC bu mailde sonraki güncellemede açılacak.", "error"); return; }
    const adres = e.trim().toLowerCase();
    if (!epostaGecerli(adres)) { showToast(`Geçersiz e-posta: ${adres}`, "error"); return; }
    guncelle((x) => {
      const zaten = (rol === "to" ? x.to : x.cc).includes(adres);
      const to = x.to.filter((a) => a !== adres), cc = x.cc.filter((a) => a !== adres);
      if (zaten) return { ...x, to, cc };
      if ((rol === "to" ? to : cc).length >= AZAMI_ALICI) { showToast(`En fazla ${AZAMI_ALICI} adres.`, "error"); return x; }
      return rol === "to" ? { ...x, to: [...to, adres], cc } : { ...x, to, cc: [...cc, adres] };
    });
    setYeniVurgu(adres);
    window.setTimeout(() => setYeniVurgu((v) => (v === adres ? null : v)), 700);
  };
  const cikar = (e: string) => { if (!kilit) guncelle((x) => ({ ...x, to: x.to.filter((a) => a !== e), cc: ccKilit ? x.cc : x.cc.filter((a) => a !== e) })); };

  const kaydet = async () => {
    if (!tanim.otomatikAlici && !t.to.length && (t.canli || !tanim.testModu)) { showToast("En az bir alıcı seçin.", "error"); return; }
    setMesgul("kaydet");
    try {
      await raporAlicilariKaydet(secili, tanim.otomatikAlici ? [] : t.to, t.cc, tanim.testModu ? t.canli : true);
      showToast(`${tanim.ad} kaydedildi.`, "success");
      await getir();
    } catch (e) { showToast(`Kaydedilemedi: ${e instanceof Error ? e.message : String(e)}`, "error"); }
    setMesgul(null);
  };
  const vazgec = () => { if (k) setTaslak((s) => ({ ...s, [secili]: { to: k.alicilar, cc: k.cc, canli: k.canli } })); };

  const defterEkle = async () => {
    const e = yeniAdres.trim().toLowerCase();
    if (!epostaGecerli(e)) { showToast("Geçerli bir e-posta yazın.", "error"); return; }
    setMesgul("defter");
    try { await adresDefterineEkle(e); setDefter((d) => (d.includes(e) ? d : [...d, e])); setYeniAdres(""); showToast("Adres deftere eklendi.", "success"); }
    catch (er) { showToast(`Eklenemedi: ${er instanceof Error ? er.message : String(er)}`, "error"); }
    setMesgul(null);
  };
  const defterSil = async (e: string) => {
    setMesgul(`sil-${e}`);
    try { await adresDefterindenSil(e); setDefter((d) => d.filter((x) => x !== e)); }
    catch (er) { showToast(`Silinemedi: ${er instanceof Error ? er.message : String(er)}`, "error"); }
    setMesgul(null);
  };

  const ekParam = () => ({ ...(tanim.govde || {}), ...(secili === "musteri_durum" && musteri ? { musteri } : {}) });
  const onizle = async () => {
    if (!tanim.edge) return;
    setMesgul("onizle");
    try {
      const o = await raporOnizle(tanim.edge, ekParam());
      if (o.musteriler) { setMusteriler(o.musteriler); if (!musteri && o.musteriler[0]) setMusteri(o.musteriler[0]); }
      setOnizleme({ ad: tanim.ad, konu: o.konu, html: o.html });
    } catch (e) { showToast(`Önizleme açılamadı: ${e instanceof Error ? e.message : String(e)}`, "error"); }
    setMesgul(null);
  };
  const test = async () => {
    if (!tanim.edge) return;
    setMesgul("test");
    try { await raporTestMaili(tanim.edge, ekParam()); showToast("Test maili gönderildi (yalnız test adresine).", "success"); }
    catch (e) { showToast(`Test maili gönderilemedi: ${e instanceof Error ? e.message : String(e)}`, "error"); }
    setMesgul(null);
  };
  useEffect(() => { setOnizleme(null); }, [secili]);

  // Taslaktaki ama defterde olmayan adresler de defter listesinde gorunur (tiklanabilir kalsin)
  const tumAdresler = useMemo(() => Array.from(new Set([...defter, ...t.to, ...t.cc])), [defter, t.to, t.cc]);
  const gruplar = useMemo(() => Array.from(new Set(RAPORLAR.map((r) => r.grup))), []);

  if (authLoading || (isSuperAdmin && yukleniyor)) return <AppShell><SayfaYukleniyor /></AppShell>;
  if (!isSuperAdmin) return null;

  const durumRozeti = (r: RaporTanimi, x?: Taslak | RaporAlicisi) => {
    const canli = !r.testModu || !!x?.canli;
    return (
      <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
        style={canli ? { backgroundColor: "rgba(16,185,129,0.15)", color: "#6EE7B7" } : { backgroundColor: "rgba(245,158,11,0.12)", color: "#FCD34D" }}>
        {canli ? "Canlı" : "Test"}
      </span>
    );
  };

  const kutu = (rol: Rol) => {
    const liste = rol === "to" ? t.to : t.cc;
    const kapali = kilit || (rol === "cc" && ccKilit);
    return (
      <div data-testid={`kutu-${rol}`} className="rounded-lg border px-2.5 py-2 min-h-[46px]" style={{ borderColor: rol === "to" ? "rgba(16,185,129,0.35)" : "rgba(244,160,124,0.35)", backgroundColor: "#0F141C" }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: rol === "to" ? "#6EE7B7" : SEFTALI }}>{rol === "to" ? "Alıcı (To)" : "Bilgi (CC)"}</span>
          <span className="text-[10px]" style={{ color: TEXT_MUTED }}>{kapali ? "sonraki güncellemede" : `${liste.length}/${AZAMI_ALICI}`}</span>
        </div>
        {rol === "to" && tanim.otomatikAlici ? (
          <p className="text-xs" style={{ color: "#CBD5E1" }}>{tanim.otomatikAlici} <span style={{ color: TEXT_MUTED }}>(otomatik)</span></p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {liste.length === 0 && <span className="text-xs" style={{ color: TEXT_MUTED }}>{kapali ? (rol === "cc" ? "CC bu mailde sonraki güncellemede açılacak." : "Alıcılar sunucu ayarında.") : `Aşağıdaki adreslerden ${rol === "to" ? "Alıcı" : "CC"} seçin.`}</span>}
            {liste.map((e) => (
              <span key={e} data-testid={`secili-${rol}`} title={e}
                className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs text-white transition-all duration-300 ${yeniVurgu === e ? "scale-110 ring-2" : "scale-100"}`}
                style={{ backgroundColor: rol === "to" ? "rgba(16,185,129,0.22)" : "rgba(244,160,124,0.2)", ["--tw-ring-color" as string]: rol === "to" ? ACCENT : SEFTALI, animation: "rapor-gir 260ms ease-out" }}>
                {kisaAdres(e)}
                {!kapali && <button type="button" onClick={() => cikar(e)} aria-label={`${e} çıkar`} className="p-0.5 rounded-full hover:bg-white/15"><X size={11} /></button>}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <AppShell>
      <style>{`@keyframes rapor-gir{from{opacity:0;transform:translateY(-6px) scale(.9)}to{opacity:1;transform:none}}`}</style>
      <SayfaBasligi ikon={<Mail size={20} />} baslik="Rapor Alıcıları"
        aciklama="İç mailler “Unex AI” adıyla bildirim@ihracatasistanim.com adresinden gider; konu başında [Rapor], [Hatırlatma] ya da [Önemli] yazar. Bir rapor seçin; adreslere tıklayarak Alıcı ve CC belirleyin." />
      {hata && <p className="mb-3 text-sm text-red-400" role="alert">{hata}</p>}
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,340px)_1fr] lg:h-[calc(100vh-190px)] lg:min-h-[520px]">
        {/* Rapor listesi */}
        <nav aria-label="Raporlar" className="rounded-xl border p-2 overflow-y-auto" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          {gruplar.map((g) => (
            <div key={g} className="mb-1.5">
              <p className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>{g}</p>
              {RAPORLAR.filter((r) => r.grup === g).map((r) => {
                const x = taslak[r.rapor];
                const aktif = r.rapor === secili;
                return (
                  <button key={r.rapor} type="button" data-testid={`rapor-${r.rapor}`} aria-current={aktif ? "true" : undefined}
                    onClick={() => {
                      setSecili(r.rapor);
                      // Dar ekranda duzenleyici listenin altinda: secince oraya kaydir
                      if (window.innerWidth < 1024) window.setTimeout(() => document.querySelector("[data-testid=rapor-duzen]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                    }}
                    className="relative w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors duration-200 hover:bg-white/5"
                    style={aktif ? { backgroundColor: "rgba(16,185,129,0.10)" } : undefined}>
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full transition-all duration-300" style={{ backgroundColor: aktif ? ACCENT : "transparent", transform: aktif ? "scaleY(1)" : "scaleY(0)" }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium text-white truncate">{r.ad}</span>
                        {degisti(r.rapor) && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: SEFTALI }} title="Kaydedilmemiş değişiklik" />}
                      </span>
                      <span className="block text-[11px] truncate" style={{ color: TEXT_MUTED }} data-testid="rapor-ozet">
                        {r.otomatikAlici ? r.otomatikAlici : `${x?.to.length || 0} alıcı`}{x?.cc.length ? ` · ${x.cc.length} CC` : ""} · {r.saat}
                      </span>
                    </span>
                    <span data-testid="rapor-durum">{r.etkin === "yakinda" ? <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(148,163,184,0.12)", color: "#94A3B8" }} title="Düzenleme sonraki güncellemede">Sabit</span> : durumRozeti(r, x)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Duzenleyici */}
        <section key={secili} data-testid="rapor-duzen" className="rounded-xl border p-4 flex flex-col gap-3 min-h-0 overflow-y-auto" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER, animation: "rapor-gir 220ms ease-out" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white">{tanim.ad}</h2>
              <p className="text-xs" style={{ color: TEXT_MUTED }}>{tanim.aciklama} · {tanim.saat}</p>
              {kilit && <p data-testid="rapor-kilit" className="text-[11px] mt-0.5" style={{ color: "#FCD34D" }}>Bu mail bugün yukarıdaki sabit alıcılara gidiyor. Buradan düzenleme bir sonraki güncellemede açılacak.</p>}
              {!kilit && ccKilit && <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>Alıcı listesi buradan yönetilir; CC bu mailde bir sonraki güncellemede açılacak.</p>}
              {!kilit && k && !k.kayitli && <p className="text-[11px] mt-0.5" style={{ color: "#FCD34D" }}>Henüz buradan kaydedilmedi: mail bugünkü sunucu ayarındaki alıcılara gidiyor. Kaydettiğinizde buradaki liste geçerli olur.</p>}
            </div>
            {tanim.testModu && (
              <button type="button" role="switch" aria-checked={t.canli} data-testid="rapor-canli" onClick={() => guncelle((x) => ({ ...x, canli: !x.canli }))}
                className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs"
                style={{ borderColor: t.canli ? "rgba(16,185,129,0.45)" : CARD_BORDER, color: t.canli ? "#E6F4EE" : TEXT_MUTED }}>
                <span>{t.canli ? "Canlı" : "Test (yalnız test adresi)"}</span>
                <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-300" style={{ backgroundColor: t.canli ? ACCENT : CARD_BORDER }} aria-hidden>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-300 ${t.canli ? "translate-x-4" : "translate-x-1"}`} />
                </span>
              </button>
            )}
          </div>

          <div className="grid gap-2 md:grid-cols-2">{kutu("to")}{kutu("cc")}</div>

          <div className="rounded-lg border p-2.5" style={{ borderColor: CARD_BORDER }}>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: TEXT_MUTED }}>Adreslerimiz · tıklayın</p>
            <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3" data-testid="adres-defteri">
              {tumAdresler.map((e) => {
                const rol: Rol | null = t.to.includes(e) ? "to" : t.cc.includes(e) ? "cc" : null;
                const defterde = defter.includes(e);
                return (
                  <div key={e} data-testid="adres" data-eposta={e} className="group flex items-center gap-1 rounded-md pl-2 pr-1 py-1 transition-colors duration-200"
                    style={{ backgroundColor: rol === "to" ? "rgba(16,185,129,0.10)" : rol === "cc" ? "rgba(244,160,124,0.10)" : "rgba(255,255,255,0.02)" }}>
                    <span className="flex-1 min-w-0 text-xs truncate" style={{ color: rol ? "#fff" : "#CBD5E1" }} title={e}>{e}</span>
                    {!kilit && (["to", "cc"] as Rol[]).filter((r) => (r === "cc" ? !ccKilit : !tanim.otomatikAlici)).map((r) => (
                      <button key={r} type="button" data-testid={`adres-${r}`} aria-pressed={rol === r} onClick={() => yerlestir(e, r)}
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded transition-all duration-200 active:scale-90"
                        style={rol === r ? { backgroundColor: r === "to" ? ACCENT : SEFTALI, color: "#0B0F14" } : { border: `1px solid ${CARD_BORDER}`, color: TEXT_MUTED }}>
                        {rol === r && <Check size={9} className="inline -mt-px mr-0.5" />}{r === "to" ? "Alıcı" : "CC"}
                      </button>
                    ))}
                    {defterde && !rol && (
                      <button type="button" onClick={() => defterSil(e)} disabled={!!mesgul} aria-label={`${e} defterden sil`} title="Defterden sil"
                        className="p-0.5 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-white/10 transition-opacity" style={{ color: TEXT_MUTED }}>
                        {mesgul === `sil-${e}` ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <form className="mt-2 flex gap-1.5" onSubmit={(ev) => { ev.preventDefault(); defterEkle(); }}>
              <input value={yeniAdres} onChange={(ev) => setYeniAdres(ev.target.value)} inputMode="email" placeholder="yeni@adres.com" aria-label="Yeni adres" data-testid="yeni-adres"
                className="flex-1 min-w-0 text-xs border rounded-md px-2 py-1.5 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F141C" }} />
              <button type="submit" disabled={!yeniAdres.trim() || !!mesgul} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs hover:bg-white/5 disabled:opacity-40" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>
                {mesgul === "defter" ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Deftere ekle
              </button>
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-auto pt-1">
            <button type="button" onClick={kaydet} disabled={kilit || !degisti(secili) || !!mesgul} data-testid="rapor-kaydet"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white disabled:opacity-40 transition-transform active:scale-95" style={{ backgroundColor: ACCENT }}>
              {mesgul === "kaydet" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Kaydet
            </button>
            {degisti(secili) && (
              <button type="button" onClick={vazgec} disabled={!!mesgul} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>
                <RotateCcw size={13} /> Vazgeç
              </button>
            )}
            {tanim.edge && <>
              <span className="w-px h-5 mx-1" style={{ backgroundColor: CARD_BORDER }} />
              {secili === "musteri_durum" && musteriler.length > 0 && (
                <select value={musteri} onChange={(e) => setMusteri(e.target.value)} aria-label="Müşteri" data-testid="musteri-sec"
                  className="text-xs border rounded-md px-2 py-1.5 text-white max-w-[220px]" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F141C" }}>
                  {musteriler.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              )}
              <button type="button" onClick={onizle} disabled={!!mesgul} data-testid="rapor-onizle"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs hover:bg-white/5 disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>
                {mesgul === "onizle" ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Önizle
              </button>
              <button type="button" onClick={test} disabled={!!mesgul} data-testid="rapor-test"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs hover:bg-white/5 disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>
                {mesgul === "test" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Test maili
              </button>
            </>}
            {k?.guncelleme && <span className="ml-auto text-[10px]" style={{ color: TEXT_MUTED }}>Son değişiklik {tarihSaat(k.guncelleme)}{k.guncelleyen ? ` · ${k.guncelleyen}` : ""}</span>}
          </div>
        </section>
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
