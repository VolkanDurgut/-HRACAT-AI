"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Anchor, CheckCircle2, FileWarning, Mail, RefreshCw, Search, Ship, Target } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { EmptyState } from "@/components/empty-state";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { useAuth } from "@/lib/auth-context";
import { DURUM_ETIKETI, limanOzetleri, type LimanOzeti } from "@/lib/navlun/ozet";
import { navlunHataCoz, navlunVerisiOku, type NavlunVerisi, type OkunamayanMesaj } from "@/lib/navlun/veri";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";

/**
 * NAVLUN BILDIRIMI (10.11.2026). Kullanici: "Formu birisi doldurmayacak, maillerden guncellenecek. Hangi sirketin
 * nereye ne kadar navlun verdigi; surekli kendini guncel tutan bir navlun bildirimi. Sadece sistem bir hatayla
 * karsilasinca mudahale edebilecegimiz bir alan olmali."
 *  - Veri: arsiv Gmail -> Apps Script (docs/apps-script/navlun.gs) -> edge navlun-bildirimi -> navlun_teklifleri.
 *  - Sayfa SALT OKUNUR; tek mudahale "Okunamayan teklifler" (fiyat ekte / gorselde ve okunamadi): elle fiyat ya da yoksay.
 *  - Yetki: "analiz" (Kontrol Merkezi). RLS "analiz" veya "proformalar".
 */

const tarihGoster = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const norm = (s: string) => s.toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
const usd = (n: number) => `${n.toLocaleString("tr-TR")} $`;

function Rozet({ metin, renk }: { metin: string; renk: "yesil" | "sari" | "gri" | "mavi" | "kirmizi" }) {
  const r = { yesil: ["rgba(16,185,129,0.14)", "#6EE7B7"], sari: ["rgba(251,191,36,0.14)", "#FCD34D"], gri: ["rgba(148,163,184,0.12)", "#94A3B8"], mavi: ["rgba(96,165,250,0.14)", "#93C5FD"], kirmizi: ["rgba(239,68,68,0.14)", "#FCA5A5"] }[renk];
  return <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium whitespace-nowrap" style={{ backgroundColor: r[0], color: r[1] }}>{metin}</span>;
}

function OzetKarti({ ikon, etiket, deger, alt, testId }: { ikon: React.ReactNode; etiket: string; deger: number | string; alt?: string; testId: string }) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid={testId}>
      <div className="flex items-center gap-2 text-xs" style={{ color: TEXT_MUTED }}>{ikon}<span>{etiket}</span></div>
      <p className="text-2xl font-semibold text-white tabular-nums mt-1" data-deger>{deger}</p>
      {alt && <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{alt}</p>}
    </div>
  );
}

function LimanKarti({ l }: { l: LimanOzeti }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="liman-karti" data-liman={l.anahtar}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
        <p className="text-white font-semibold flex items-center gap-2"><Anchor size={15} style={{ color: ACCENT }} />{l.ad}</p>
        {l.enIyi20 && <span className="text-sm" style={{ color: "#6EE7B7" }} data-en-iyi>En iyi 20&apos;DC: <b className="tabular-nums">{usd(l.enIyi20.tutar)}</b> · {l.enIyi20.acente}</span>}
        {l.hedef && <span className="text-sm flex items-center gap-1" style={{ color: "#FCD34D" }} data-hedef><Target size={13} />Hedefimiz {usd(l.hedef.tutar)}</span>}
        {l.kabul && <span className="text-sm flex items-center gap-1" style={{ color: "#93C5FD" }} data-kabul><CheckCircle2 size={13} />Kabul edilen {usd(l.kabul.tutar)}{l.kabul.armator ? ` (${l.kabul.armator})` : ""} · {tarihGoster(l.kabul.tarih)}</span>}
        <span className="text-xs ml-auto" style={{ color: TEXT_MUTED }}>son: {tarihGoster(l.sonTarih)}</span>
      </div>
      {l.fiyatlar.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: TEXT_MUTED }}>
                <th className="px-4 py-2 font-medium">Acente</th><th className="px-3 py-2 font-medium">Armatör</th>
                <th className="px-3 py-2 font-medium">Ekipman</th><th className="px-3 py-2 font-medium text-right">Navlun</th>
                <th className="px-3 py-2 font-medium">Free time</th><th className="px-3 py-2 font-medium">Geçerlilik</th>
                <th className="px-3 py-2 font-medium">Tarih</th><th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {l.fiyatlar.map((f) => {
                const enIyi = l.enIyi20 && f === l.enIyi20;
                return (
                  <tr key={`${f.acente}|${f.ekipman}|${f.armator || ""}`} className="border-t" style={{ borderColor: CARD_BORDER }} data-testid="fiyat-satiri">
                    <td className="px-4 py-2 text-white whitespace-nowrap">{f.acente}</td>
                    <td className="px-3 py-2" style={{ color: "#C9D1DC" }}>{f.armator || "—"}</td>
                    <td className="px-3 py-2" style={{ color: "#C9D1DC" }}>{f.ekipman}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: enIyi ? "#6EE7B7" : "#FFFFFF" }} data-tutar>{usd(f.tutar)}</td>
                    <td className="px-3 py-2" style={{ color: "#C9D1DC" }}>{f.free_time_gun != null ? `${f.free_time_gun} gün` : "—"}</td>
                    <td className="px-3 py-2" style={{ color: "#C9D1DC" }}>{f.gecerlilik || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{tarihGoster(f.tarih)}</td>
                    <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                      {f.tur !== "teklif" && <Rozet metin={DURUM_ETIKETI[f.tur] || f.tur} renk="mavi" />}
                      {f.lokal_dahil === true && <Rozet metin="lokal dahil" renk="gri" />}
                      {f.lokal_dahil === false && <Rozet metin="+ lokal" renk="gri" />}
                      {f.kaynak === "pdf" && <Rozet metin="PDF'ten" renk="sari" />}
                      {f.kaynak === "gorsel" && <Rozet metin="Görselden" renk="sari" />}
                      {f.kaynak === "elle" && <Rozet metin="Elle" renk="sari" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {l.durumlar.length > 0 && (
        <div className="px-4 py-2 border-t flex flex-wrap gap-2 text-xs" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} data-testid="durumlar">
          {l.durumlar.map((d) => (
            <span key={d.acente} className="inline-flex items-center gap-1">
              {d.acente}: <Rozet metin={DURUM_ETIKETI[d.tur] || d.tur} renk={d.tur === "servis_yok" || d.tur === "yer_yok" ? "kirmizi" : d.tur === "ek_teklif" ? "sari" : "gri"} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function OkunamayanSatir({ m, onCozuldu }: { m: OkunamayanMesaj; onCozuldu: () => void }) {
  const [tutar, setTutar] = useState("");
  const [ekipman, setEkipman] = useState("20DC");
  const [armator, setArmator] = useState("");
  const [acik, setAcik] = useState(false);
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const isle = async (islem: "duzelt" | "yoksay") => {
    setHata(null);
    const n = Number(tutar.replace(/\./g, "").replace(",", "."));
    if (islem === "duzelt" && !(n > 0 && n < 100000)) { setHata("Geçerli bir tutar girin."); return; }
    setBekle(true);
    try { await navlunHataCoz(m.id, islem, islem === "duzelt" ? n : undefined, ekipman, armator.trim() || undefined); onCozuldu(); }
    catch (e) { setHata(e instanceof Error ? e.message : "İşlem yapılamadı."); }
    finally { setBekle(false); }
  };
  return (
    <div className="px-4 py-3 border-t" style={{ borderColor: CARD_BORDER }} data-testid="okunamayan">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-white font-medium">{m.liman || "Liman ?"}</span>
        <span style={{ color: "#C9D1DC" }}>{m.acente || "—"}</span>
        <span className="text-xs" style={{ color: TEXT_MUTED }}>{tarihGoster(m.tarih)}</span>
        <Rozet metin={m.kaynak === "gorsel" ? "Fiyat görselde" : m.kaynak === "pdf" ? "PDF belirsiz" : "Fiyat ekte"} renk="sari" />
        {m.ozet && <button type="button" onClick={() => setAcik(!acik)} className="text-xs underline" style={{ color: TEXT_MUTED }}>{acik ? "metni gizle" : "mail metni"}</button>}
      </div>
      {acik && m.ozet && <pre className="mt-2 text-xs whitespace-pre-wrap rounded-lg p-2 max-h-40 overflow-auto" style={{ backgroundColor: ROW_HEADER_BG, color: "#C9D1DC" }}>{m.ozet}</pre>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={tutar} onChange={(e) => setTutar(e.target.value)} inputMode="decimal" placeholder="Navlun (USD)" aria-label="Navlun tutarı"
          className="h-8 w-32 rounded-lg border bg-transparent px-2 text-sm text-white" style={{ borderColor: CARD_BORDER }} />
        <select value={ekipman} onChange={(e) => setEkipman(e.target.value)} aria-label="Ekipman" className="h-8 rounded-lg border px-2 text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
          <option value="20DC">20&apos;DC</option><option value="40DC">40&apos;DC</option><option value="40HC">40&apos;HC</option>
        </select>
        <input value={armator} onChange={(e) => setArmator(e.target.value)} placeholder="Armatör (isteğe bağlı)" aria-label="Armatör"
          className="h-8 w-44 rounded-lg border bg-transparent px-2 text-sm text-white" style={{ borderColor: CARD_BORDER }} />
        <button type="button" disabled={bekle} onClick={() => isle("duzelt")} className="h-8 px-3 rounded-lg text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>Kaydet</button>
        <button type="button" disabled={bekle} onClick={() => isle("yoksay")} className="h-8 px-3 rounded-lg text-sm border disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Fiyat değil, yoksay</button>
        {hata && <span className="text-xs" style={{ color: "#FCA5A5" }}>{hata}</span>}
      </div>
    </div>
  );
}

function NavlunIcerik() {
  const { yetkiler } = useAuth();
  const yetkili = !!yetkiler.sayfa_yetkileri.analiz;
  const [veri, setVeri] = useState<NavlunVerisi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [arama, setArama] = useState("");

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata(null);
    try { setVeri(await navlunVerisiOku()); } catch (e) { setHata(e instanceof Error ? e.message : "Veri okunamadı."); }
    finally { setYukleniyor(false); }
  }, []);
  useEffect(() => { if (yetkili) yukle(); }, [yetkili, yukle]);

  const limanlar = useMemo(() => (veri ? limanOzetleri(veri.satirlar) : []), [veri]);
  const gorunen = useMemo(() => {
    const q = norm(arama.trim());
    if (!q) return limanlar;
    return limanlar.filter((l) => norm(l.ad).includes(q) || l.anahtar.includes(q) || l.fiyatlar.some((f) => norm(f.acente).includes(q) || norm(f.armator || "").includes(q)));
  }, [limanlar, arama]);
  const yediGun = veri ? veri.satirlar.filter((s) => (s.tur === "teklif" || s.tur === "karsi_teklif") && Date.parse(s.tarih) >= Date.now() - 7 * 86400000).length : 0;

  if (!yetkili) return null;
  return (
    <div className="max-w-7xl">
      <SayfaBasligi
        ikon={<Ship size={20} />}
        baslik="Navlun Bildirimi"
        aciklama="Acentelerin navlun teklifleri · operasyon yazışmalarından otomatik"
        sag={
          <button type="button" onClick={yukle} disabled={yukleniyor} aria-label="Yenile" className="h-9 w-9 inline-flex items-center justify-center rounded-lg border hover:bg-white/[0.04] disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
            <RefreshCw size={15} className={yukleniyor ? "animate-spin" : ""} />
          </button>
        }
      />
      {hata && (
        <div className="flex items-start gap-2 rounded-lg border px-3 py-2 mb-4 text-sm" style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "#FCA5A5" }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{hata}</span>
        </div>
      )}
      {!veri && yukleniyor ? <SayfaYukleniyor /> : veri ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <OzetKarti testId="ozet-liman" ikon={<Anchor size={14} />} etiket="Liman" deger={limanlar.length} alt="son 120 gün" />
            <OzetKarti testId="ozet-teklif" ikon={<Mail size={14} />} etiket="Yeni teklif" deger={yediGun} alt="son 7 gün" />
            <OzetKarti testId="ozet-okunamayan" ikon={<FileWarning size={14} />} etiket="Okunamayan" deger={veri.okunamayanlar.length} alt={veri.okunamayanlar.length ? "aşağıda, müdahale bekliyor" : "sorun yok"} />
            <OzetKarti testId="ozet-son" ikon={<RefreshCw size={14} />} etiket="Son okuma" deger={veri.sonOkuma ? tarihGoster(veri.sonOkuma) : "—"} alt="arşiv mailinden" />
          </div>

          {veri.okunamayanlar.length > 0 && (
            <div className="rounded-xl border mb-4" style={{ backgroundColor: CARD_BG, borderColor: "rgba(251,191,36,0.35)" }} data-testid="okunamayanlar">
              <div className="px-4 py-3 flex items-center gap-2 text-sm" style={{ color: "#FCD34D" }}>
                <FileWarning size={16} /> Okunamayan teklifler ({veri.okunamayanlar.length}) — fiyat ekte veya görselde; tutarı girin ya da yoksayın.
              </div>
              {veri.okunamayanlar.map((m) => <OkunamayanSatir key={m.id} m={m} onCozuldu={yukle} />)}
            </div>
          )}

          <div className="relative mb-3 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
            <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Liman, acente veya armatör ara" aria-label="Ara"
              className="h-9 w-full rounded-lg border bg-transparent pl-8 pr-3 text-sm text-white" style={{ borderColor: CARD_BORDER }} />
          </div>

          {gorunen.length === 0 ? (
            <EmptyState icon={<Ship size={40} />} title={limanlar.length ? "Aramaya uyan liman yok" : "Henüz navlun teklifi okunmadı"}
              description={limanlar.length ? undefined : "Arşiv Gmail'deki navlun betiği çalıştığında teklifler burada görünür."} />
          ) : (
            <div className="space-y-3">{gorunen.map((l) => <LimanKarti key={l.anahtar} l={l} />)}</div>
          )}
        </>
      ) : null}
    </div>
  );
}

export default function NavlunSayfasi() {
  return (
    <AppShell>
      <NavlunIcerik />
    </AppShell>
  );
}
