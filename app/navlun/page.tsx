"use client";

import { OzetKarti } from "@/components/erp/ozet-karti";
import { girisSonrasiTemizle } from "@/lib/giris-donus";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Anchor, Brain, CheckCircle2, Download, FileWarning, Mail, RefreshCw, Search, Send, Ship, Target } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { EmptyState } from "@/components/empty-state";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { useAuth } from "@/lib/auth-context";
import { DURUM_ETIKETI, YENI_TUR_ADI, limanOzetleri, yeniBilgiler, type LimanOzeti, type YeniBilgi } from "@/lib/navlun/ozet";
import { navlunHataCoz, navlunVerisiOku, type NavlunVerisi, type OkunamayanMesaj } from "@/lib/navlun/veri";
import { TeklifAdaylari } from "@/components/navlun/teklif-adaylari";
import { YenidenOku } from "@/components/navlun/yeniden-oku";
import { navlunTablosuExcel, navlunTablosuTestMaili } from "@/lib/navlun/tablo";
import { navlunNoktalari } from "@/lib/navlun/harita";
import { NavlunHaritasi } from "@/components/navlun/navlun-haritasi";
import { LimanMasasi } from "@/components/navlun/liman-masasi";
import { acenteAnahtari, karsilastir, type Karsilastirma } from "@/lib/navlun/karsilastirma";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";

/**
 * NAVLUN BILDIRIMI (10.11.2026). Kullanici: "Formu birisi doldurmayacak, maillerden guncellenecek. Hangi sirketin
 * nereye ne kadar navlun verdigi; surekli kendini guncel tutan bir navlun bildirimi. Sadece sistem bir hatayla
 * karsilasinca mudahale edebilecegimiz bir alan olmali."
 *  - Veri: arsiv Gmail -> Apps Script (docs/apps-script/navlun.gs) -> edge navlun-bildirimi -> navlun_teklifleri.
 *  - Sayfa SALT OKUNUR; tek mudahale "Okunamayan teklifler" (fiyat ekte / gorselde ve okunamadi): elle fiyat ya da yoksay.
 *  - Yetki: "navlun" (16.11.2026; once "analiz"). RLS "navlun", "analiz" veya "proformalar".
 *  - Excel indir / Test maili (11.11.2026): operasyonun navlun tablosuyla AYNI duzen (lib/navlun/tablo.ts ->
 *    _shared/navlun-tablosu.ts); test maili edge navlun-tablosu, yalniz test adresine.
 *  - Canli Navlun Haritasi + Liman Masasi (11.11.2026): sayfa haritayla acilir (components/navlun/navlun-haritasi.tsx);
 *    limana tiklayinca rapor + acenteler + sohbet one cikar (components/navlun/liman-masasi.tsx).
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

/** 13.11.2026: lokal durumu rozeti (mail / acente hafizasi / rezervasyondan ogrenilen) */
function LokalRozeti({ k }: { k: Karsilastirma }) {
  if (k.temel === "navlun") return <span title={k.dayanak}><Rozet metin="yalnız navlun" renk="gri" /></span>;
  if (!k.kesin) return <span title={k.dayanak}><Rozet metin={k.lokalDurum === "haric" ? "+ lokal (tutar?)" : "lokal belirsiz"} renk="sari" /></span>;
  const kaynak = k.kaynak === "hafiza" ? " · hafıza" : k.kaynak === "rezervasyon" ? " · öğrenildi" : "";
  return <span title={k.dayanak}><Rozet metin={`${k.lokalDurum === "haric" ? `+ lokal ${usd(k.lokal || 0)}` : "lokal dahil"}${kaynak}`} renk={k.kaynak === "rezervasyon" ? "yesil" : "gri"} /></span>;
}

/**
 * ACENTE HAFIZASI (13.11.2026): her acentenin lokal aliskanligi ve dayanagi. Kaynak: arastirma / elle (navlun_acente_hafizasi)
 * ve rezervasyonlardan kendiliginden ogrenilen (yukleme plani: teklif = gerceklesen navlun -> lokal dahil).
 */
function AcenteHafizasiPaneli({ veri }: { veri: NavlunVerisi }) {
  const satirlar = useMemo(() => {
    const adlar = new Map<string, string>();
    veri.satirlar.forEach((s) => { const a = acenteAnahtari(s.acente); if (a && !adlar.has(a)) adlar.set(a, s.acente as string); });
    return Array.from(adlar.entries()).map(([a, ad]) => {
      const k = karsilastir({ acente: ad, tutar: 1000, ekipman: "20DC", lokal_dahil: null, liman_anahtar: null }, veri.baglam);
      const h = veri.baglam?.hafiza.get(a);
      const sayi = veri.satirlar.filter((s) => acenteAnahtari(s.acente) === a && (s.tur === "teklif" || s.tur === "karsi_teklif")).length;
      return { a, ad, k, h, sayi };
    }).sort((x, y) => y.sayi - x.sayi || x.ad.localeCompare(y.ad, "tr"));
  }, [veri]);
  if (!satirlar.length) return null;
  return (
    <div className="rounded-xl border mt-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="acente-hafizasi">
      <div className="px-4 py-3 border-b flex items-center gap-2 text-sm text-white font-semibold" style={{ borderColor: CARD_BORDER }}>
        <Brain size={15} style={{ color: "#C4B5FD" }} /> Acente hafızası
      </div>
      <p className="px-4 pt-2 text-[11px]" style={{ color: TEXT_MUTED }}>
        Teklif lokal yazmıyorsa bu kural uygulanır. Yeni rezervasyonlarla kendiliğinden öğrenir; belirsiz acentenin teklifi en iyi sayılmaz.
      </p>
      <ul className="px-4 py-2 space-y-2">
        {satirlar.map(({ a, ad, k, h, sayi }) => (
          <li key={a} className="text-xs" data-hafiza-acente={a} title={k.dayanak}>
            <div className="flex items-center gap-2">
              <span className="text-white font-medium truncate">{ad}</span>
              <span className="ml-auto shrink-0">
                {k.lokalDurum === "dahil" ? <Rozet metin="lokal dahil" renk={k.kaynak === "rezervasyon" ? "yesil" : "gri"} />
                  : k.lokalDurum === "haric" ? <Rozet metin={h?.lokal_20 ? `lokal hariç · ${usd(h.lokal_20)}` : "lokal hariç"} renk="mavi" />
                  : <Rozet metin="belirsiz" renk="sari" />}
              </span>
            </div>
            <p className="mt-0.5 leading-snug" style={{ color: TEXT_MUTED }}>
              {k.kaynak === "hafiza" ? (h?.kanit || "") : k.kaynak === "rezervasyon" ? `Öğrenildi: ${k.dayanak.replace(/^Rezervasyondan öğrenildi: /, "")}` : "Henüz kanıt yok; ilk rezervasyonda öğrenilecek."}
              {h && h.ek_kont > 0 ? ` · ek ${usd(h.ek_kont)}/kont.` : ""} · {sayi} teklif
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LimanKarti({ l }: { l: LimanOzeti }) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="liman-karti" data-liman={l.anahtar}>
      {/* 11.11.2026 kullanici: "Ayni baslik altindaki yazilar alt alta durmali, hizali olmali" -> etiket | deger izgarasi */}
      <div className="px-4 py-3 border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
        <div className="flex items-center gap-3">
          <p className="text-white font-semibold flex items-center gap-2"><Anchor size={15} style={{ color: ACCENT }} />{l.ad}</p>
          <span className="text-xs ml-auto" style={{ color: TEXT_MUTED }}>son: {tarihGoster(l.sonTarih)}</span>
        </div>
        {(l.enIyi20 || l.belirsiz20 || l.hedef || l.kabul) && (
          <dl className="mt-1.5 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm" data-baslik-ozet>
            {l.enIyi20 && <>
              <dt style={{ color: "#6EE7B7" }} title="Karşılaştırma: navlun + çıkış lokali + konteyner başı VGM / mühür (KDV hariç)">En iyi 20&apos;DC</dt>
              <dd style={{ color: "#6EE7B7" }} data-en-iyi title={l.enIyi20.karsi.dayanak}><b className="tabular-nums">{usd(l.enIyi20.karsi.toplam)}</b> · {l.enIyi20.acente}
                {l.enIyi20.karsi.metin !== "lokal dahil" && <span style={{ color: TEXT_MUTED }}> ({l.enIyi20.karsi.metin})</span>}</dd>
            </>}
            {l.belirsiz20 && <>
              <dt style={{ color: "#C4B5FD" }}>Lokal belirsiz</dt>
              <dd style={{ color: "#C4B5FD" }} data-belirsiz title={l.belirsiz20.karsi.dayanak}><b className="tabular-nums">{usd(l.belirsiz20.tutar)}</b> · {l.belirsiz20.acente}
                <span style={{ color: TEXT_MUTED }}> ({l.belirsiz20.karsi.metin}; en iyi sayılmadı)</span></dd>
            </>}
            {l.hedef && <>
              <dt className="flex items-center gap-1" style={{ color: "#FCD34D" }}><Target size={13} />Hedefimiz</dt>
              <dd style={{ color: "#FCD34D" }} data-hedef title="Hedef: operasyonun acenteye pazarlıkta yazdığı fiyat (ör. &quot;hedef rakamımız 1.500 USD&quot;). Bizden giden maillerden okunur; acente &quot;hedefiniz uygundur&quot; derse o acentenin fiyatı olur."><b className="tabular-nums">{usd(l.hedef.tutar)}</b></dd>
            </>}
            {l.kabul && <>
              <dt className="flex items-center gap-1" style={{ color: "#93C5FD" }}><CheckCircle2 size={13} />Kabul edilen</dt>
              <dd style={{ color: "#93C5FD" }} data-kabul><b className="tabular-nums">{usd(l.kabul.tutar)}</b>{l.kabul.armator ? ` (${l.kabul.armator})` : ""} · {tarihGoster(l.kabul.tarih)}</dd>
            </>}
          </dl>
        )}
      </div>
      {l.fiyatlar.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: TEXT_MUTED }}>
                <th className="px-4 py-2 font-medium">Acente</th><th className="px-3 py-2 font-medium">Armatör</th>
                {/* 14.11.2026 (kullanici: "Beyrut hala 340 gozukuyor"): once lokal dahil toplam, sonra acentenin yazdigi tutar */}
                <th className="px-3 py-2 font-medium">Ekipman</th>
                <th className="px-3 py-2 font-medium text-right" title="Navlun + çıkış lokali + konteyner başı VGM / mühür (KDV hariç)">Lokal dahil</th>
                <th className="px-3 py-2 font-medium text-right" title="Acentenin mailde yazdığı tutar (lokal hariç olabilir)">Acente teklifi</th>
                <th className="px-3 py-2 font-medium">Free time</th><th className="px-3 py-2 font-medium">Transit</th><th className="px-3 py-2 font-medium">Geçerlilik</th>
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
                    <td className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: enIyi ? "#6EE7B7" : f.karsi.kesin ? "#FFFFFF" : "#C4B5FD" }}
                      data-toplam title={`${f.karsi.metin} · ${f.karsi.dayanak}`}>{f.karsi.kesin ? usd(f.karsi.toplam) : "?"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }} data-tutar
                      title={f.karsi.metin}>{usd(f.tutar)}{f.karsi.kesin && f.karsi.toplam !== f.tutar ? " + lokal" : ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#C9D1DC" }} data-ft>{f.free_time_gun != null ? `${f.free_time_gun} gün` : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#C9D1DC" }} data-transit>{f.transit_gun ? `${f.transit_gun} gün` : "—"}</td>
                    <td className="px-3 py-2" style={{ color: "#C9D1DC" }}>{f.gecerlilik || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{tarihGoster(f.tarih)}</td>
                    <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                      {f.tur !== "teklif" && <Rozet metin={DURUM_ETIKETI[f.tur] || f.tur} renk="mavi" />}
                      <LokalRozeti k={f.karsi} />
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

const SON_GORULME = "navlun_son_gorulme";

function onceGoster(iso: string): string {
  const dk = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (dk < 60) return `${dk} dk önce`;
  if (dk < 1440) return `${Math.round(dk / 60)} sa önce`;
  return `${Math.round(dk / 1440)} gün önce`;
}

/** Sağ panel: navlun her güncellendiğinde yeni gelen bilgiler kare kutularda; tıklayınca ilgili liman kartına gider. */
function YeniBilgiPaneli({ bilgiler, oncekiGorulme, onOkundu }: { bilgiler: YeniBilgi[]; oncekiGorulme: string | null; onOkundu: () => void }) {
  const yeniSayi = oncekiGorulme ? bilgiler.filter((b) => b.tarih > oncekiGorulme).length : 0;
  const git = (b: YeniBilgi) => {
    const el = document.querySelector(`[data-liman="${CSS.escape(b.liman_anahtar || "")}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.animate([{ boxShadow: `0 0 0 2px ${ACCENT}` }, { boxShadow: "0 0 0 0 transparent" }], { duration: 2200, easing: "ease-out" });
  };
  const renk = (tur: string) => (tur === "teklif" || tur === "karsi_teklif" ? "#6EE7B7" : tur === "servis_yok" || tur === "yer_yok" ? "#FCA5A5" : tur === "kabul" || tur === "hedef_kabul" ? "#93C5FD" : "#FCD34D");
  return (
    <aside className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto rounded-xl border p-3" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="yeni-bilgiler">
      <div className="flex items-center gap-2 mb-2.5">
        <p className="text-[13px] font-semibold text-white">Yeni gelen bilgiler</p>
        {yeniSayi > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold text-white" style={{ backgroundColor: ACCENT }} data-yeni-sayi>{yeniSayi} yeni</span>}
        {yeniSayi > 0 && <button type="button" onClick={onOkundu} className="ml-auto text-[11px] underline" style={{ color: TEXT_MUTED }}>Okundu say</button>}
      </div>
      {bilgiler.length === 0 ? <p className="text-xs" style={{ color: TEXT_MUTED }}>Henüz bilgi yok.</p> : (
        <div className="grid grid-cols-2 gap-2">
          {bilgiler.map((b) => {
            const yeni = !!oncekiGorulme && b.tarih > oncekiGorulme;
            return (
              <button key={b.anahtar} type="button" onClick={() => git(b)} title={`${b.liman || ""} · ${b.acente || ""}`}
                className="aspect-square rounded-lg border p-2.5 text-left flex flex-col hover:bg-white/[0.04] transition-colors"
                style={{ borderColor: yeni ? ACCENT : CARD_BORDER, backgroundColor: yeni ? "rgba(244,160,124,0.06)" : "transparent" }} data-yeni-kart data-yeni={yeni ? "1" : "0"}>
                <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: renk(b.tur) }}>
                  {yeni && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ACCENT }} />}{YENI_TUR_ADI[b.tur] || b.tur}
                </span>
                <span className="mt-1 text-[13px] font-semibold text-white leading-tight line-clamp-2">{b.liman || "—"}</span>
                <span className="mt-auto">
                  {b.tutar !== null && <span className="block text-base font-semibold tabular-nums text-white">{b.tutar.toLocaleString("tr-TR")} {b.para_birimi === "EUR" ? "€" : "$"}<span className="text-[10.5px] font-normal ml-1" style={{ color: TEXT_MUTED }}>{b.ekipman === "20DC" ? "20'DC" : b.ekipman || ""}</span></span>}
                  <span className="block text-[11px] truncate" style={{ color: "#C9D1DC" }}>{[b.acente, b.armator && b.armator !== b.acente ? b.armator : null].filter(Boolean).join(" · ") || "—"}</span>
                  <span className="block text-[10.5px]" style={{ color: TEXT_MUTED }}>{onceGoster(b.tarih)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

function NavlunIcerik() {
  const { yetkiler } = useAuth();
  // 16.11.2026: kendi yetkisi "navlun" (Yetkilendirme > Operasyon > Navlun Bildirimi); once "analiz"di
  const yetkili = !!yetkiler.sayfa_yetkileri.navlun;
  const [veri, setVeri] = useState<NavlunVerisi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [arama, setArama] = useState("");
  // Son görülme (bu tarayıcıda): ondan yeni gelen bilgiler panelde "yeni" işaretlenir
  const [oncekiGorulme, setOncekiGorulme] = useState<string | null>(null);
  const [tabloIslem, setTabloIslem] = useState<"excel" | "mail" | null>(null);
  const [tabloBilgi, setTabloBilgi] = useState<string | null>(null);
  const [masa, setMasa] = useState<string | null>(null);

  const [adayYenile, setAdayYenile] = useState(0);
  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata(null); setAdayYenile((n) => n + 1);
    try { setVeri(await navlunVerisiOku()); } catch (e) { setHata(e instanceof Error ? e.message : "Veri okunamadı."); }
    finally { setYukleniyor(false); }
  }, []);
  useEffect(() => { if (yetkili) yukle(); }, [yetkili, yukle]);

  const limanlar = useMemo(() => (veri ? limanOzetleri(veri.satirlar, veri.baglam) : []), [veri]);
  const bilgiler = useMemo(() => (veri ? yeniBilgiler(veri.satirlar) : []), [veri]);
  const noktalar = useMemo(() => (veri ? navlunNoktalari(limanlar, veri.satirlar, oncekiGorulme || null) : []), [veri, limanlar, oncekiGorulme]);
  const masaLimani = masa ? limanlar.find((l) => l.anahtar === masa) || null : null;
  const masaKapat = useCallback(() => setMasa(null), []);
  useEffect(() => {
    if (!veri) return;
    let onceki: string | null = null;
    try { onceki = window.localStorage.getItem(SON_GORULME); } catch { /* gizli mod */ }
    setOncekiGorulme((v) => v ?? onceki ?? "");
    const enYeni = bilgiler[0]?.tarih;
    if (enYeni) { try { window.localStorage.setItem(SON_GORULME, enYeni); } catch { /* yok say */ } }
  }, [veri, bilgiler]);
  // 12.11.2026: navlun raporundaki "Diger navlun fiyatlari" baglantisi: /navlun?liman=MOMBASA -> o limanin masasi acilir
  const [istenenLiman, setIstenenLiman] = useState<string | null>(null);
  useEffect(() => {
    girisSonrasiTemizle();   // mail baglantisiyla giristen donuldu: kayit silinir
    try { const l = new URLSearchParams(window.location.search).get("liman"); if (l && l.trim()) setIstenenLiman(l.trim().slice(0, 60)); } catch { /* yok say */ }
  }, []);
  useEffect(() => {
    if (!istenenLiman || !limanlar.length) return;
    const q = norm(istenenLiman);
    const l = limanlar.find((x) => x.anahtar === istenenLiman.toUpperCase() || norm(x.ad) === q) || limanlar.find((x) => norm(x.ad).includes(q));
    if (l) setMasa(l.anahtar); else setArama(istenenLiman);
    setIstenenLiman(null);
  }, [istenenLiman, limanlar]);
  const gorunen = useMemo(() => {
    const q = norm(arama.trim());
    if (!q) return limanlar;
    return limanlar.filter((l) => norm(l.ad).includes(q) || l.anahtar.includes(q) || l.fiyatlar.some((f) => norm(f.acente).includes(q) || norm(f.armator || "").includes(q)));
  }, [limanlar, arama]);
  const yediGun = veri ? veri.satirlar.filter((s) => (s.tur === "teklif" || s.tur === "karsi_teklif") && Date.parse(s.tarih) >= Date.now() - 7 * 86400000).length : 0;

  const bugunIst = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const tabloExcel = async () => {
    setTabloIslem("excel"); setHata(null); setTabloBilgi(null);
    try {
      const bugun = bugunIst();
      const { blob, planOkunamadi } = await navlunTablosuExcel(bugun);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Navlun_Tablosu_${bugun.split("-").reverse().join(".")}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      if (planOkunamadi) setTabloBilgi("Excel indirildi. Yükleme planı yetkiniz olmadığı için gerçekleşen navlunlar tabloya eklenmedi.");
    } catch (e) { setHata(e instanceof Error ? e.message : "Excel oluşturulamadı."); }
    finally { setTabloIslem(null); }
  };
  const tabloMail = async () => {
    setTabloIslem("mail"); setHata(null); setTabloBilgi(null);
    try { setTabloBilgi(await navlunTablosuTestMaili()); } catch (e) { setHata(e instanceof Error ? e.message : "Test maili gönderilemedi."); }
    finally { setTabloIslem(null); }
  };

  if (!yetkili) return null;
  return (
    <div className="max-w-[1500px] mx-auto">
      <SayfaBasligi
        ikon={<Ship size={20} />}
        baslik="Navlun Bildirimi"
        aciklama="Acentelerin navlun teklifleri · operasyon yazışmalarından otomatik"
        sag={
          <div className="flex items-center gap-2">
            <button type="button" onClick={tabloExcel} disabled={!!tabloIslem} data-testid="navlun-tablosu-excel" title="Operasyonun navlun tablosuyla aynı düzende Excel"
              className="h-9 px-3 inline-flex items-center gap-2 rounded-lg text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
              <Download size={15} /> {tabloIslem === "excel" ? "Hazırlanıyor…" : "Excel indir"}
            </button>
            <button type="button" onClick={tabloMail} disabled={!!tabloIslem} data-testid="navlun-tablosu-mail" title="Navlun tablosunu test adresine gönder"
              className="h-9 px-3 inline-flex items-center gap-2 rounded-lg text-sm border hover:bg-white/[0.04] disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }}>
              <Send size={14} /> {tabloIslem === "mail" ? "Gönderiliyor…" : "Test maili"}
            </button>
            <YenidenOku onBitti={yukle} />
            <button type="button" onClick={yukle} disabled={yukleniyor} aria-label="Yenile" className="h-9 w-9 inline-flex items-center justify-center rounded-lg border hover:bg-white/[0.04] disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              <RefreshCw size={15} className={yukleniyor ? "animate-spin" : ""} />
            </button>
          </div>
        }
      />
      {tabloBilgi && (
        <div className="flex items-start gap-2 rounded-lg border px-3 py-2 mb-4 text-sm" data-testid="navlun-tablosu-bilgi" style={{ borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.08)", color: "#6EE7B7" }}>
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" /> <span>{tabloBilgi}</span>
        </div>
      )}
      {hata && (
        <div className="flex items-start gap-2 rounded-lg border px-3 py-2 mb-4 text-sm" style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "#FCA5A5" }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{hata}</span>
        </div>
      )}
      {!veri && yukleniyor ? <SayfaYukleniyor /> : veri ? (
        <>
          {limanlar.length > 0 && <NavlunHaritasi noktalar={noktalar} onSec={setMasa} />}
          {masaLimani && <LimanMasasi liman={masaLimani} satirlar={veri.satirlar} onKapat={masaKapat} baglam={veri.baglam} />}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <OzetKarti testId="ozet-liman" ikon={<Anchor size={14} />} etiket="Liman" deger={limanlar.length} alt="son 120 gün" />
            <OzetKarti testId="ozet-teklif" ikon={<Mail size={14} />} etiket="Yeni teklif" deger={yediGun} alt="son 7 gün" />
            <OzetKarti testId="ozet-okunamayan" ikon={<FileWarning size={14} />} etiket="Okunamayan" deger={veri.okunamayanlar.length} alt={veri.okunamayanlar.length ? "aşağıda, müdahale bekliyor" : "sorun yok"} />
            <OzetKarti testId="ozet-son" ikon={<RefreshCw size={14} />} etiket="Son okuma" deger={veri.sonOkuma ? tarihGoster(veri.sonOkuma) : "—"} alt="arşiv mailinden" />
          </div>

          {veri.baglamHatasi && (
            <div className="mb-4 rounded-lg border px-3 py-2 text-sm flex items-start gap-2" style={{ borderColor: "rgba(251,191,36,0.35)", color: "#FCD34D" }} data-testid="baglam-hatasi">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{veri.baglamHatasi} Lokal bilgisi yalnız mail metninden; lokali belirsiz teklifler en iyi sayılmıyor.</span>
            </div>
          )}
          {veri.okunamayanlar.length > 0 && (
            <div className="rounded-xl border mb-4" style={{ backgroundColor: CARD_BG, borderColor: "rgba(251,191,36,0.35)" }} data-testid="okunamayanlar">
              <div className="px-4 py-3 flex items-center gap-2 text-sm" style={{ color: "#FCD34D" }}>
                <FileWarning size={16} /> Okunamayan teklifler ({veri.okunamayanlar.length}) — fiyat ekte veya görselde; tutarı girin ya da yoksayın.
              </div>
              {veri.okunamayanlar.map((m) => <OkunamayanSatir key={m.id} m={m} onCozuldu={yukle} />)}
            </div>
          )}

          {/* 16.11.2026: fiyati okunamamis acente cevaplari (tanimadigimiz gonderen dahil) */}
          <TeklifAdaylari yenile={adayYenile} onDegisti={yukle} />

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
          <div className="min-w-0">
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
          </div>
          <div className="order-first xl:order-none">
            <YeniBilgiPaneli bilgiler={bilgiler} oncekiGorulme={oncekiGorulme || null} onOkundu={() => setOncekiGorulme(bilgiler[0]?.tarih || "")} />
            <AcenteHafizasiPaneli veri={veri} />
          </div>
          </div>
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
