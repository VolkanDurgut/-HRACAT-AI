"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Download, RefreshCw, Search, Ship, Upload } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { EmptyState } from "@/components/empty-state";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { useAuth } from "@/lib/auth-context";
import {
  ACIK_DURUMLAR, DURUM_ADI, ON_ODEME_DEGISIR, bugunIst, planBloklari, planKalemleri, saat, siparisOzeti, siparisSirala, trTarih,
  type PlanSatiri, type SiparisDurum, type SiparisSatiri,
} from "@/lib/siparis/liste";
import { onOdemeIsaretle, siparisListesiOku, yuklemePlaniOku } from "@/lib/siparis/veri";
import { PlanExcelAktar } from "@/components/plan-excel-aktar";
import { SiparisExcelAktar } from "@/components/siparis-excel-aktar";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";

/**
 * SIPARIS LISTESI + YUKLEME PLANI (11.11.2026). Kullanici: "Siparis formu ile yukleme planinin otomatik ve hatasiz
 * bir sekilde hazirlanabilmeli; sonra raporlayabilmeliyiz." "Siparis listesinde on odeme girilebilsin."
 *  - Liste ve plan kimse tarafindan doldurulmaz: proforma / dosya / rezervasyondan canli hesaplanir (lib/siparis/liste.ts).
 *  - Elle girilen TEK alan: "On odeme" kutusu (rezervasyon oncesi siparislerde; "proformalar" yetkisi).
 *  - Excel indir: export'un ve operasyonun Excel'iyle ayni basliklar (lib/siparis/xlsx.ts).
 */

type Sekme = "siparis" | "plan";
type SiparisFiltre = "acik" | "tum" | SiparisDurum;

const DURUM_RENK: Record<SiparisDurum, [string, string]> = {
  onay_bekliyor: ["rgba(148,163,184,0.14)", "#CBD5E1"],
  on_odeme_alindi: ["rgba(96,165,250,0.15)", "#93C5FD"],
  rezervasyonlu: ["rgba(244,160,124,0.16)", "#F4A07C"],
  sevk_edildi: ["rgba(16,185,129,0.14)", "#6EE7B7"],
  bl_eksik: ["rgba(239,68,68,0.15)", "#FCA5A5"],
  iptal: ["rgba(148,163,184,0.08)", "#64748B"],
};

const norm = (s: string) => s.toLocaleUpperCase("tr-TR").replace(/İ/g, "I");
const sayiGoster = (n: number | null, k = 0) => (n === null ? "—" : n.toLocaleString("tr-TR", { maximumFractionDigits: k }));

function DurumRozeti({ d }: { d: SiparisDurum }) {
  const [bg, fg] = DURUM_RENK[d];
  return <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium whitespace-nowrap" style={{ backgroundColor: bg, color: fg }} data-durum={d}>{DURUM_ADI[d]}</span>;
}

function OzetKarti({ etiket, deger, alt, renk, testId, onClick, secili }: { etiket: string; deger: string | number; alt?: string; renk?: string; testId: string; onClick?: () => void; secili?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="text-left rounded-xl border px-4 py-3 disabled:cursor-default"
      style={{ backgroundColor: CARD_BG, borderColor: secili ? ACCENT : CARD_BORDER }} data-testid={testId}>
      <p className="text-xs" style={{ color: TEXT_MUTED }}>{etiket}</p>
      <p className="text-2xl font-semibold tabular-nums mt-1" style={{ color: renk || "#FFFFFF" }} data-deger>{deger}</p>
      {alt && <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{alt}</p>}
    </button>
  );
}

/** Export'un sipariş listesi Excel'iyle BİREBİR aynı 11 başlık; sağda sistem sütunları */
const SIPARIS_BASLIKLARI = ["Proforma", "Firma Adı", "Ürün", "Fiyat", "Miktar", "Tutar", "Konteyner", "Liman", "BL NO", "Marka", "Paketleme"];

function SiparisTablosu({ liste, isaretleyebilir, onIsaretle, bekleyen }: {
  liste: SiparisSatiri[]; isaretleyebilir: boolean; onIsaretle: (s: SiparisSatiri, v: boolean) => void; bekleyen: string | null;
}) {
  return (
    <div className="rounded-xl border overflow-x-auto" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: TEXT_MUTED, backgroundColor: ROW_HEADER_BG }} data-testid="siparis-baslik">
            {SIPARIS_BASLIKLARI.map((b, i) => <th key={b} className={`px-3 py-2 font-medium whitespace-nowrap ${i >= 3 && i <= 6 ? "text-right" : ""}`}>{b}</th>)}
            <th className="px-3 py-2 font-medium whitespace-nowrap" style={{ borderLeft: `1px solid ${CARD_BORDER}` }}>Durum</th><th className="px-3 py-2 font-medium whitespace-nowrap">Ön ödeme</th>
            <th className="px-3 py-2 font-medium whitespace-nowrap">Dosya / Booking</th>
          </tr>
        </thead>
        <tbody>
          {liste.map((s) => {
            const degisir = isaretleyebilir && ON_ODEME_DEGISIR.includes(s.durum) && !!s.proforma_no;
            return (
              <tr key={s.anahtar} className="border-t align-top" style={{ borderColor: CARD_BORDER }} data-testid="siparis-satiri" data-proforma={s.proforma_no || ""}>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="text-white font-medium">{s.proforma_no || "—"}</span>
                  <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{trTarih(s.proforma_tarihi)}{s.kaynak === "sistem" ? " · sistemden" : ""}</span>
                </td>
                <td className="px-3 py-2 text-white min-w-[160px]">{s.firma || "—"}</td>
                <td className="px-3 py-2 min-w-[150px]" style={{ color: "#C9D1DC" }}>{s.urun || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "#C9D1DC" }}>{sayiGoster(s.birim_fiyat, 2)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-white">{sayiGoster(s.miktar_mt, 2)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-white whitespace-nowrap">{s.tutar === null ? "—" : `${sayiGoster(s.tutar, 2)} ${s.para_birimi === "EUR" ? "€" : "$"}`}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "#C9D1DC" }}>{sayiGoster(s.konteyner)}</td>
                <td className="px-3 py-2" style={{ color: "#C9D1DC" }}>{s.liman || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs" style={{ color: "#C9D1DC" }}>{s.bl_no || "—"}</td>
                <td className="px-3 py-2 min-w-[110px]" style={{ color: "#C9D1DC" }}>{s.marka || "—"}</td>
                <td className="px-3 py-2 min-w-[110px] text-xs" style={{ color: "#C9D1DC" }}>{s.paketleme || "—"}</td>
                <td className="px-3 py-2" style={{ borderLeft: `1px solid ${CARD_BORDER}` }}>
                  <DurumRozeti d={s.durum} />
                  {s.benzer && s.kaynak === "sistem" && (
                    <span className="mt-1 flex items-start gap-1 text-[11px] max-w-[220px]" style={{ color: "#FCD34D" }} data-benzer>
                      <AlertTriangle size={12} className="shrink-0 mt-0.5" /> Olası tekrar: {s.benzer}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {degisir ? (
                    <label className="inline-flex items-center gap-2 cursor-pointer text-xs" style={{ color: s.on_odeme ? "#93C5FD" : TEXT_MUTED }}>
                      <input type="checkbox" checked={s.on_odeme} disabled={bekleyen === s.anahtar}
                        onChange={(e) => onIsaretle(s, e.target.checked)} aria-label={`${s.proforma_no} ön ödeme`} className="h-4 w-4 accent-[#F4A07C]" />
                      {s.on_odeme ? `Alındı${s.on_odeme_tarihi ? ` ${trTarih(s.on_odeme_tarihi).slice(0, 5)}` : ""}` : "Bekleniyor"}
                    </label>
                  ) : (
                    <span className="text-xs" style={{ color: s.on_odeme ? "#93C5FD" : TEXT_MUTED }}>{s.on_odeme ? "Alındı" : "—"}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>
                  {s.dosya_no || "—"}{s.booking_no ? <span className="block">{s.booking_no}</span> : null}
                  {s.etd ? <span className="block">ETD {trTarih(s.etd)}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Yukleme plani: operasyonun Excel'iyle BIREBIR ayni 16 baslik + alt baslik; her booking iki satir. */
const PLAN_BASLIKLARI = ["MÜŞTERİ", "CİNSİ", "KON.AD.", "VARIŞ LİMANI", "ÇUVAL MARKASI", "AMBALAJ", "ACENTE", "LİMAN", "EKİPMAN", "BOOKING NO",
  "BOŞ EKİPMAN ALIM TARİHİ", "ARDİYESİZ GİRİŞ", "TALİMAT CUT OFF", "BEYAN CUT OFF", "ETD", "GEMİ ADI"];
const PLAN_ALT: Record<number, string> = { 8: "BOŞ EKİPMAN", 14: "GEMİ KALKIŞ", 15: "SEFERİ" };

function PlanTablosu({ liste, bugun }: { liste: PlanSatiri[]; bugun: string }) {
  const bloklar = useMemo(() => planBloklari(liste), [liste]);
  const hucre = "px-2.5 py-1.5 whitespace-nowrap";
  return (
    <div className="space-y-3">
      {bloklar.map((b) => (
        <div key={b.anahtar} className="rounded-xl border overflow-x-auto" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="plan-haftasi">
          <div className="px-4 py-2 text-sm font-semibold flex items-center gap-2 sticky left-0" style={{ backgroundColor: ROW_HEADER_BG, color: "#FFFFFF" }}>
            <Ship size={14} style={{ color: ACCENT }} /> <span data-hafta>{b.etiket}</span>
            <span className="text-xs font-normal ml-3" style={{ color: TEXT_MUTED }}>{b.satirlar.length} booking · {b.konteyner} konteyner</span>
          </div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide" style={{ color: TEXT_MUTED }} data-testid="plan-baslik">
                {PLAN_BASLIKLARI.map((x, i) => <th key={x} className={`px-2.5 pt-2 pb-0.5 font-semibold whitespace-nowrap ${i === 2 ? "text-right" : ""}`}>{x}</th>)}
              </tr>
              <tr className="text-left text-[10px] uppercase tracking-wide" style={{ color: TEXT_MUTED }}>
                {PLAN_BASLIKLARI.map((x, i) => (
                  <th key={x} className={`px-2.5 pb-1.5 font-normal whitespace-nowrap ${i === 2 ? "text-right text-white font-semibold" : ""}`}>{i === 2 ? b.konteyner : PLAN_ALT[i] ?? ""}</th>
                ))}
              </tr>
            </thead>
            {b.satirlar.map((p) => {
              const gecti = !!(p.etd && p.etd.slice(0, 10) < bugun);
              const k = planKalemleri(p);
              const ekSatir = Math.max(1, k.length - 1);
              const renk = { color: "#C9D1DC" };
              return (
                <tbody key={p.anahtar} className="border-t" style={{ borderColor: CARD_BORDER, opacity: gecti ? 0.72 : 1 }} data-testid="plan-satiri" data-booking={p.booking_no || ""}>
                  <tr>
                    <td className={`${hucre} text-white font-medium min-w-[160px] whitespace-normal`}>
                      {p.musteri || "—"}
                      {p.kaynak === "sistem" ? <span className="ml-1.5 align-middle px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-500/15 text-sky-300" title="Excel'de yok; rezervasyondan">sistemden</span> : null}
                    </td>
                    <td className={hucre} style={renk}>{k[0].cinsi || "—"}</td>
                    <td className={`${hucre} text-right tabular-nums text-white`}>{sayiGoster(k[0].konteyner)}</td>
                    <td className={hucre} style={renk}>{p.varis_limani || "—"}</td>
                    <td className={hucre} style={renk}>{k[0].cuval_markasi || "—"}</td>
                    <td className={hucre} style={renk}>{k[0].ambalaj || "—"}</td>
                    <td className={hucre} style={renk}>{p.acente || "—"}</td>
                    <td className={hucre} style={renk}>{p.liman || "—"}</td>
                    <td className={hucre} style={renk}>{p.ekipman || p.ekipman_alim_yeri || "—"}</td>
                    <td className={`${hucre} font-mono text-white`}>{p.booking_no || "—"}</td>
                    <td className={hucre} style={renk}>{trTarih(p.bos_ekipman_tarihi) || "—"}</td>
                    <td className={hucre} style={renk}>{trTarih(p.ardiyesiz_giris) || "—"}</td>
                    <td className={hucre} style={renk}>{trTarih(p.talimat_cutoff) || "—"}</td>
                    <td className={hucre} style={renk}>{trTarih(p.beyan_cutoff) || "—"}</td>
                    <td className={`${hucre} font-semibold`} style={{ color: gecti ? "#6EE7B7" : "#FFFFFF" }} data-etd>{trTarih(p.etd) || "—"}</td>
                    <td className={`${hucre} text-white`}>{p.gemi || "—"}</td>
                  </tr>
                  {Array.from({ length: ekSatir }, (_, j) => {
                    const kk = k[j + 1];
                    const alt = { color: TEXT_MUTED };
                    return (
                      <tr key={j} className="text-[11.5px]" data-ek-satir>
                        <td className={hucre} />
                        <td className={hucre} style={renk}>{kk?.cinsi || ""}</td>
                        <td className={`${hucre} text-right tabular-nums text-white`}>{kk ? sayiGoster(kk.konteyner) : ""}</td>
                        <td className={hucre} />
                        <td className={hucre} style={renk}>{kk?.cuval_markasi || ""}</td>
                        <td className={hucre} style={renk}>{kk?.ambalaj || ""}</td>
                        <td className={hucre} /><td className={hucre} /><td className={hucre} /><td className={hucre} /><td className={hucre} /><td className={hucre} />
                        <td className={`${hucre} tabular-nums`} style={alt}>{j === 0 ? saat(p.talimat_cutoff) : ""}</td>
                        <td className={`${hucre} tabular-nums`} style={alt}>{j === 0 ? saat(p.beyan_cutoff) : ""}</td>
                        <td className={hucre} />
                        <td className={hucre} style={alt}>{j === 0 ? p.sefer || "" : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        </div>
      ))}
    </div>
  );
}

function SiparisIcerik() {
  const { yetkiler } = useAuth();
  const yetkili = !!(yetkiler.sayfa_yetkileri.proformalar || yetkiler.sayfa_yetkileri.analiz);
  const isaretleyebilir = !!yetkiler.sayfa_yetkileri.proformalar;
  const [sekme, setSekme] = useState<Sekme>("siparis");
  const [siparisler, setSiparisler] = useState<SiparisSatiri[] | null>(null);
  const [plan, setPlan] = useState<PlanSatiri[] | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<SiparisFiltre>("acik");
  const [planTum, setPlanTum] = useState(false);
  const [arama, setArama] = useState("");
  const [bekleyen, setBekleyen] = useState<string | null>(null);
  const [indiriliyor, setIndiriliyor] = useState(false);
  const [aktarAcik, setAktarAcik] = useState(false);
  const [siparisAktarAcik, setSiparisAktarAcik] = useState(false);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const bugun = bugunIst();

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata(null);
    try {
      const [s, p] = await Promise.all([siparisListesiOku(), yuklemePlaniOku()]);
      setSiparisler(s); setPlan(p);
    } catch (e) { setHata(e instanceof Error ? e.message : "Veri okunamadı."); }
    finally { setYukleniyor(false); }
  }, []);
  useEffect(() => { if (yetkili) yukle(); }, [yetkili, yukle]);

  const ozet = useMemo(() => siparisOzeti(siparisler || []), [siparisler]);
  const q = norm(arama.trim());
  const gorunenSiparis = useMemo(() => {
    let l = siparisler || [];
    if (filtre === "acik") l = l.filter((s) => ACIK_DURUMLAR.includes(s.durum));
    else if (filtre !== "tum") l = l.filter((s) => s.durum === filtre);
    if (q) l = l.filter((s) => [s.proforma_no, s.firma, s.urun, s.liman, s.marka, s.booking_no, s.dosya_no, s.bl_no].some((v) => v && norm(v).includes(q)));
    return siparisSirala(l);
  }, [siparisler, filtre, q]);
  const gorunenPlan = useMemo(() => {
    const sinir = new Date(Date.parse(`${bugun}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10);
    let l = plan || [];
    if (!planTum) l = l.filter((p) => !p.etd || p.etd.slice(0, 10) >= sinir);
    if (q) l = l.filter((p) => [p.musteri, p.booking_no, p.varis_limani, p.gemi, p.acente, p.cinsi, p.dosya_no].some((v) => v && norm(v).includes(q)));
    return l;
  }, [plan, planTum, q, bugun]);

  const onIsaretle = async (s: SiparisSatiri, v: boolean) => {
    if (!s.proforma_no) return;
    setBekleyen(s.anahtar); setHata(null);
    try { await onOdemeIsaretle(s.proforma_no, v); await yukle(); }
    catch (e) { setHata(e instanceof Error ? e.message : "Ön ödeme kaydedilemedi."); }
    finally { setBekleyen(null); }
  };

  const excelIndir = async () => {
    if (!siparisler || !plan) return;
    setIndiriliyor(true);
    try {
      const [{ xlsxOlustur }, { siparisSayfasi, planSayfasi }] = await Promise.all([import("@/lib/xlsx-yaz"), import("@/lib/siparis/xlsx")]);
      const blob = await xlsxOlustur([siparisSayfasi(siparisler), planSayfasi(plan, "Yükleme Planı", bugun)]);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Siparis_Listesi_ve_Yukleme_Plani_${bugun.split("-").reverse().join(".")}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { setHata(e instanceof Error ? e.message : "Excel oluşturulamadı."); }
    finally { setIndiriliyor(false); }
  };

  if (!yetkili) return null;
  const sekmeBtn = (k: Sekme, ad: string) => (
    <button type="button" onClick={() => setSekme(k)} role="tab" aria-selected={sekme === k}
      className="h-9 px-4 rounded-lg text-sm font-medium" style={sekme === k ? { backgroundColor: ACCENT, color: "#FFFFFF" } : { color: TEXT_MUTED, border: `1px solid ${CARD_BORDER}` }}>{ad}</button>
  );
  const filtreBtn = (k: SiparisFiltre, ad: string) => (
    <button key={k} type="button" onClick={() => setFiltre(k)} className="h-8 px-3 rounded-full text-xs"
      style={filtre === k ? { backgroundColor: "rgba(244,160,124,0.18)", color: ACCENT, border: `1px solid ${ACCENT}` } : { color: TEXT_MUTED, border: `1px solid ${CARD_BORDER}` }}
      data-filtre={k}>{ad}</button>
  );

  return (
    <div className="max-w-[1400px]">
      <SayfaBasligi
        ikon={<ClipboardList size={20} />}
        baslik="Sipariş Listesi"
        aciklama="Proforma, dosya ve rezervasyonlardan otomatik · elle girilen: ön ödeme · yükleme planı Excel'den aktarılır"
        sag={
          <div className="flex items-center gap-2">
            <button type="button" onClick={excelIndir} disabled={!siparisler || indiriliyor} className="h-9 px-3 inline-flex items-center gap-2 rounded-lg text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
              <Download size={15} /> {indiriliyor ? "Hazırlanıyor…" : "Excel indir"}
            </button>
            <button type="button" onClick={yukle} disabled={yukleniyor} aria-label="Yenile" className="h-9 w-9 inline-flex items-center justify-center rounded-lg border hover:bg-white/[0.04] disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              <RefreshCw size={15} className={yukleniyor ? "animate-spin" : ""} />
            </button>
          </div>
        }
      />
      {hata && (
        <div className="flex items-start gap-2 rounded-lg border px-3 py-2 mb-4 text-sm" style={{ borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", color: "#FCA5A5" }} role="alert">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{hata}</span>
        </div>
      )}
      {!siparisler && yukleniyor ? <SayfaYukleniyor /> : siparisler && plan ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
            <OzetKarti testId="ozet-acik" etiket="Açık sipariş" deger={ozet.acikSiparis} alt={`${ozet.acikMt.toLocaleString("tr-TR")} MT · ${ozet.acikKont} kont.`} onClick={() => { setSekme("siparis"); setFiltre("acik"); }} secili={sekme === "siparis" && filtre === "acik"} />
            <OzetKarti testId="ozet-onay" etiket="Onay bekliyor" deger={ozet.onay} onClick={() => { setSekme("siparis"); setFiltre("onay_bekliyor"); }} secili={sekme === "siparis" && filtre === "onay_bekliyor"} />
            <OzetKarti testId="ozet-onodeme" etiket="Ön ödeme alındı" deger={ozet.onOdeme} renk="#93C5FD" onClick={() => { setSekme("siparis"); setFiltre("on_odeme_alindi"); }} secili={sekme === "siparis" && filtre === "on_odeme_alindi"} />
            <OzetKarti testId="ozet-rez" etiket="Rezervasyonlu" deger={ozet.rezervasyonlu} renk="#F4A07C" onClick={() => { setSekme("siparis"); setFiltre("rezervasyonlu"); }} secili={sekme === "siparis" && filtre === "rezervasyonlu"} />
            <OzetKarti testId="ozet-bl" etiket="BL eksik" deger={ozet.blEksik} renk={ozet.blEksik ? "#FCA5A5" : undefined} onClick={() => { setSekme("siparis"); setFiltre("bl_eksik"); }} secili={sekme === "siparis" && filtre === "bl_eksik"} />
            <OzetKarti testId="ozet-tekrar" etiket="Olası tekrar" deger={ozet.olasiTekrar} renk={ozet.olasiTekrar ? "#FCD34D" : undefined} alt="yeniden kesilmiş proforma?" />
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3" role="tablist">
            {sekmeBtn("siparis", "Sipariş Listesi")}
            {sekmeBtn("plan", "Yükleme Planı")}
            <div className="relative ml-auto w-full sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
              <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Proforma, firma, booking, liman ara" aria-label="Ara"
                className="h-9 w-full rounded-lg border bg-transparent pl-8 pr-3 text-sm text-white" style={{ borderColor: CARD_BORDER }} />
            </div>
          </div>

          {sekme === "siparis" ? (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {filtreBtn("acik", "Açık")}{filtreBtn("onay_bekliyor", "Onay bekliyor")}{filtreBtn("on_odeme_alindi", "Ön ödeme alındı")}
                {filtreBtn("rezervasyonlu", "Rezervasyonlu")}{filtreBtn("bl_eksik", "BL eksik")}{filtreBtn("sevk_edildi", "Sevk edildi")}{filtreBtn("tum", "Tümü")}
                {isaretleyebilir && (
                  <button type="button" onClick={() => setSiparisAktarAcik(true)} data-testid="siparis-aktar-ac"
                    className="h-8 px-3 ml-auto inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium text-white hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER }}>
                    <Upload size={13} style={{ color: ACCENT }} /> Excel&apos;den içeri aktar
                  </button>
                )}
              </div>
              {bilgi && (
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2 mb-3 text-sm" style={{ borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.08)", color: "#6EE7B7" }} role="status" data-testid="siparis-bilgi">
                  <CheckCircle2 size={15} className="shrink-0" /> <span>{bilgi}</span>
                </div>
              )}
              {siparisAktarAcik && (
                <SiparisExcelAktar onKapat={() => setSiparisAktarAcik(false)} onAktarildi={(m) => { setSiparisAktarAcik(false); setBilgi(m); setFiltre("tum"); yukle(); }} />
              )}
              {gorunenSiparis.length ? (
                <SiparisTablosu liste={gorunenSiparis} isaretleyebilir={isaretleyebilir} onIsaretle={onIsaretle} bekleyen={bekleyen} />
              ) : <EmptyState icon={<ClipboardList size={40} />} title="Bu filtrede sipariş yok" />}
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                <button type="button" onClick={() => setPlanTum(false)} className="h-8 px-3 rounded-full text-xs" data-plan-filtre="guncel"
                  style={!planTum ? { backgroundColor: "rgba(244,160,124,0.18)", color: ACCENT, border: `1px solid ${ACCENT}` } : { color: TEXT_MUTED, border: `1px solid ${CARD_BORDER}` }}>Son 7 gün + gelecek</button>
                <button type="button" onClick={() => setPlanTum(true)} className="h-8 px-3 rounded-full text-xs" data-plan-filtre="tum"
                  style={planTum ? { backgroundColor: "rgba(244,160,124,0.18)", color: ACCENT, border: `1px solid ${ACCENT}` } : { color: TEXT_MUTED, border: `1px solid ${CARD_BORDER}` }}>Tüm yıl</button>
                {isaretleyebilir && (
                  <button type="button" onClick={() => setAktarAcik(true)} data-testid="plan-aktar-ac"
                    className="h-8 px-3 ml-auto inline-flex items-center gap-1.5 rounded-lg border text-xs font-medium text-white hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER }}>
                    <Upload size={13} style={{ color: ACCENT }} /> Excel&apos;den içeri aktar
                  </button>
                )}
              </div>
              {bilgi && (
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2 mb-3 text-sm" style={{ borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.08)", color: "#6EE7B7" }} role="status" data-testid="plan-bilgi">
                  <CheckCircle2 size={15} className="shrink-0" /> <span>{bilgi}</span>
                </div>
              )}
              {aktarAcik && (
                <PlanExcelAktar onKapat={() => setAktarAcik(false)} onAktarildi={(m) => { setAktarAcik(false); setBilgi(m); setPlanTum(true); yukle(); }} />
              )}
              {gorunenPlan.length ? <PlanTablosu liste={gorunenPlan} bugun={bugun} /> : <EmptyState icon={<Ship size={40} />} title="Planlı yükleme yok" />}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

export default function SiparislerSayfasi() {
  return (
    <AppShell>
      <SiparisIcerik />
    </AppShell>
  );
}
