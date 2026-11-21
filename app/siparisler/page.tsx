"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, Download, FileSpreadsheet, Hourglass, Link2, RefreshCw, Search, Ship, Trash2, Upload } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { EmptyState } from "@/components/empty-state";
import SayfaYukleniyor from "@/components/sayfa-yukleniyor";
import { useAuth } from "@/lib/auth-context";
import {
  BEKLEYEN_BLOK, BOLUM_BASLIGI, DURUM_ADI, ON_ODEME_DEGISIR, bugunIst, planBloklari, planGorunumu, planKalemleri, planSirala, saat, siparisBolumleri,
  siparisBolumu, siparisOzeti, trTarih, type PlanBlogu, type PlanSatiri, type SiparisBolumu, type SiparisDurum, type SiparisSatiri,
} from "@/lib/siparis/liste";
import {
  aramaNorm, panelBaglantisi, pazarBaglantisi, planAramaMetni, satirSekmesi, sekmeSayilari, sekmeyeAit, siparisAra, siparisSekmesi, tekrarSekmesi, VARSAYILAN_SIPARIS_SEKMESI, type ListeSekmesi, type SiparisSekme,
} from "@/lib/siparis/gorunum";
import { tutarsizliklariOku, type Tutarsizlik } from "@/lib/veri-tutarsizliklari";
import { SekmeCubugu, type SekmeOgesi } from "@/components/erp/sekme-cubugu";
import { useUrlSekmesi } from "@/components/erp/use-url-sekmesi";
import { SecilebilirOzetKarti } from "@/components/erp/ozet-karti";
import { DAGITIM_DURUM_METNI, KILIT_METNI, type OnOdemeDagitimi } from "@/lib/on-odeme";
import { eslesmeyenleriOku, onayImzaliKaydet, onOdemeDagilimiOku, onOdemeKaydet, siparisEslesmeKaldir, siparisListesiOku, siparisSatiriSil, siparisSilinebilir, yuklemePlaniOku, type EslesmeyenSatir } from "@/lib/siparis/veri";
import { EslesmeyenSerit } from "@/components/siparis/eslesmeyen-serit";
import { SiparisEslestirFormu } from "@/components/siparis-eslestir";
import { PlanExcelAktar } from "@/components/plan-excel-aktar";
import { SiparisExcelAktar } from "@/components/siparis-excel-aktar";
import { SiparisFormlari } from "@/components/siparis-formlari";
import { ACCENT, CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";

/**
 * SIPARIS LISTESI + YUKLEME PLANI (11.11.2026). Kullanici: "Siparis formu ile yukleme planinin otomatik ve hatasiz
 * bir sekilde hazirlanabilmeli; sonra raporlayabilmeliyiz." "Siparis listesinde on odeme girilebilsin."
 *  - Liste ve plan kimse tarafindan doldurulmaz: proforma / dosya / rezervasyondan canli hesaplanir (lib/siparis/liste.ts).
 *  - Elle girilen: on odeme (TUTAR + tarih; rezervasyon oncesi siparislerde; "proformalar" yetkisi).
 *  - Siparis listesi export'un Excel'indeki gibi BOLUMLU (lib/siparis/liste.ts BOLUM_BASLIGI); en guncel en altta.
 *  - Excel indir: export'un ve operasyonun Excel'iyle ayni basliklar (lib/siparis/xlsx.ts).
 *  - 16.11.2026 (Kontrol Merkezi / Pazar / Ana Panel duzeni): sabit ust (6 kart; tiklayinca ilgili sekme) + kaynak eski
 *    uyari seridi (Kontrol Merkezi'nin ayni kurali, veri_tutarsizliklari) + tek sekme cubugu (?sekme=; lib/siparis/gorunum.ts):
 *    (21.11.2026 itibariyle) Yukleme Plani | Rezervasyon bekleyen | Onay bekleyen | Siparis Formlari. Arama sekme sayilarini daraltir.
 *    Musteri adi -> Pazar karti (/pazar?musteri=), rezervasyonlu dosya no -> Ana Panel satiri (/panel?dosya=).
 *  - 21.11.2026 (kullanici): "Rezervasyonlu" ve "Sevk edilen" sekmeleri kaldirildi; sayfa Yukleme Plani ile acilir.
 *    Rezervasyonlu siparisler planda booking satiri olarak, sevk edilenler Ihracatlar sayfasinda izlenir (lib/siparis/gorunum.ts).
 */

const DURUM_RENK: Record<SiparisDurum, [string, string]> = {
  onay_bekliyor: ["rgba(148,163,184,0.14)", "#CBD5E1"],
  on_odeme_alindi: ["rgba(96,165,250,0.15)", "#93C5FD"],
  rezervasyonlu: ["rgba(244,160,124,0.16)", "#F4A07C"],
  sevk_edildi: ["rgba(16,185,129,0.14)", "#6EE7B7"],
  bl_eksik: ["rgba(239,68,68,0.15)", "#FCA5A5"],
  iptal: ["rgba(148,163,184,0.08)", "#64748B"],
};

const norm = aramaNorm;
const sayiGoster = (n: number | null, k = 0) => (n === null ? "—" : n.toLocaleString("tr-TR", { maximumFractionDigits: k }));

function DurumRozeti({ d }: { d: SiparisDurum }) {
  const [bg, fg] = DURUM_RENK[d];
  return <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium whitespace-nowrap" style={{ backgroundColor: bg, color: fg }} data-durum={d}>{DURUM_ADI[d]}</span>;
}

const paraIsareti = (p: string | null) => (p === "EUR" ? "€" : p === "TRY" ? "₺" : "$");

/** On odeme hucresi: bekleyen satirda "On odeme alindi" butonu; alinmis satirda tutar + tarih (+ geri al). */
function OnOdemeHucresi({ s, yetkili, onAc, onGeriAl, mesgul }: {
  s: SiparisSatiri; yetkili: boolean; onAc: (s: SiparisSatiri) => void; onGeriAl: (s: SiparisSatiri) => void; mesgul: boolean;
}) {
  const [onay, setOnay] = useState(false);
  const degisir = yetkili && ON_ODEME_DEGISIR.includes(s.durum) && !!s.proforma_no;
  if (s.durum === "onay_bekliyor") {
    return degisir ? (
      <button type="button" onClick={() => onAc(s)} disabled={mesgul} data-onodeme-ac
        className="min-h-7 px-2 py-1 rounded-md text-[11px] leading-tight font-semibold text-white hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
        Onay geldi
      </button>
    ) : <span className="text-xs" style={{ color: TEXT_MUTED }}>—</span>;
  }
  if (!s.on_odeme) return <span className="text-xs" style={{ color: TEXT_MUTED }}>—</span>;
  return (
    <div className="text-xs" data-onodeme>
      <span className="text-sky-300 font-medium tabular-nums">
        {s.on_odeme_tutar !== null ? `${sayiGoster(s.on_odeme_tutar, 2)} ${paraIsareti(s.on_odeme_para)}` : "Alındı"}
      </span>
      {s.on_odeme_tarihi ? <span className="block text-[11px]" style={{ color: TEXT_MUTED }}>{trTarih(s.on_odeme_tarihi)}</span> : null}
      {degisir && s.durum === "on_odeme_alindi" && (
        onay ? (
          <span className="block mt-0.5 text-[11px]">
            <button type="button" onClick={() => { setOnay(false); onGeriAl(s); }} disabled={mesgul} className="text-red-300 underline mr-2" data-onodeme-geri-evet>Evet, geri al</button>
            <button type="button" onClick={() => setOnay(false)} style={{ color: TEXT_MUTED }}>Vazgeç</button>
          </span>
        ) : (
          <span className="block mt-0.5 text-[11px]">
            {s.on_odeme_tutar === null && <button type="button" onClick={() => onAc(s)} disabled={mesgul} className="underline mr-2" style={{ color: ACCENT }} data-onodeme-tutar>Tutar gir</button>}
            <button type="button" onClick={() => setOnay(true)} disabled={mesgul} className="underline" style={{ color: TEXT_MUTED }} data-onodeme-geri>Geri al</button>
          </span>
        )
      )}
    </div>
  );
}

/**
 * Sipariş tablosu - EKRANA SIĞAR (11.11.2026): export Excel'inin 11 başlığı korunur; ilişkili başlıklar aynı sütunda
 * üst / alt satır (ÜRÜN / MARKA · PAKETLEME, LİMAN / BL NO). Excel indir 11 ayrı sütun (birebir).
 */
const SIPARIS_SUTUNLARI: Array<{ basliklar: string[]; genislik: string; sag?: boolean }> = [
  { basliklar: ["Proforma"], genislik: "12%" },
  { basliklar: ["Firma Adı"], genislik: "13%" },
  { basliklar: ["Ürün", "Marka · Paketleme"], genislik: "16%" },
  { basliklar: ["Fiyat"], genislik: "6%", sag: true },
  { basliklar: ["Miktar"], genislik: "6%", sag: true },
  { basliklar: ["Tutar"], genislik: "9%", sag: true },
  { basliklar: ["Konteyner"], genislik: "7%", sag: true },
  { basliklar: ["Liman", "BL NO"], genislik: "10%" },
  { basliklar: ["Durum"], genislik: "8%" },
  { basliklar: ["Dosya / Booking"], genislik: "8%" },
  { basliklar: ["Ön ödeme"], genislik: "9%" },
];

function SiparisSatirlari({ satirlar, yetkili, onAc, onGeriAl, onSil, onEslestir, onAyir, mesgul, pazarYetkisi }: {
  satirlar: SiparisSatiri[]; yetkili: boolean; onAc: (s: SiparisSatiri) => void; onGeriAl: (s: SiparisSatiri) => void; onSil: (s: SiparisSatiri) => void;
  onEslestir: (s: SiparisSatiri) => void; onAyir: (s: SiparisSatiri) => void; mesgul: string | null; pazarYetkisi: boolean;
}) {
  const alt = { color: TEXT_MUTED };
  const h = "px-2 py-2 align-top break-words";
  return (
    <>
      {satirlar.map((s) => {
        const sevk = s.durum === "sevk_edildi";
        return (
          <tr key={s.anahtar} className="border-t" style={{ borderColor: CARD_BORDER, backgroundColor: sevk ? "rgba(16,185,129,0.07)" : undefined }}
            data-testid="siparis-satiri" data-proforma={s.proforma_no || ""} data-bolum={siparisBolumu(s.durum)}>
            <td className={h}>
              <span className="flex items-start gap-1">
                <span className="text-white font-medium break-all flex-1">{s.proforma_no || "—"}</span>
                {yetkili && siparisSilinebilir(s.anahtar) && (
                  <button type="button" onClick={() => onSil(s)} disabled={mesgul === s.anahtar} title="Siparişi listeden sil" aria-label={`${s.proforma_no || "Sipariş"} sil`}
                    className="shrink-0 p-0.5 rounded hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40" style={{ color: TEXT_MUTED }} data-siparis-sil>
                    <Trash2 size={13} />
                  </button>
                )}
              </span>
              <span className="block text-[11px]" style={alt}>{trTarih(s.proforma_tarihi)}{s.kaynak === "sistem" ? " · sistemden" : ""}</span>
              {/* 16.11.2026 "ayni siparis" eslestirmesi: sistem proformasi <-> Excel satiri */}
              {s.eslesik_proforma && (
                <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]" style={{ color: "#93C5FD" }} data-eslesik>
                  <Link2 size={11} className="shrink-0" /> Sistem: {s.eslesik_proforma}
                  {yetkili && (
                    <button type="button" onClick={() => onAyir(s)} disabled={mesgul === s.anahtar} className="underline disabled:opacity-40" style={{ color: TEXT_MUTED }}>ayır</button>
                  )}
                </span>
              )}
              {yetkili && s.kaynak === "sistem" && s.anahtar.startsWith("proforma:") && (
                <button type="button" onClick={() => onEslestir(s)} className="mt-0.5 flex items-center gap-1 text-[11px] hover:underline" style={{ color: "#93C5FD" }} data-siparis-eslestir>
                  <Link2 size={11} /> Excel&apos;de aynı sipariş var mı?
                </button>
              )}
            </td>
            <td className={`${h} text-white`}>
              {pazarYetkisi && pazarBaglantisi(s.firma) ? (
                <Link href={pazarBaglantisi(s.firma)!} title="Pazar'da müşteri kartını aç" className="hover:underline decoration-white/40" data-musteri-link>{s.firma}</Link>
              ) : (s.firma || "—")}
            </td>
            <td className={h} style={{ color: "#C9D1DC" }}>
              {s.urun || "—"}
              <span className="block text-[11px]" style={alt}>{[s.marka, s.paketleme].filter(Boolean).join(" · ") || "—"}</span>
            </td>
            <td className={`${h} text-right tabular-nums`} style={{ color: "#C9D1DC" }}>{sayiGoster(s.birim_fiyat, 2)}</td>
            <td className={`${h} text-right tabular-nums text-white`}>{sayiGoster(s.miktar_mt, 2)}</td>
            <td className={`${h} text-right tabular-nums text-white`}>{s.tutar === null ? "—" : `${sayiGoster(s.tutar, 2)} ${paraIsareti(s.para_birimi)}`}</td>
            <td className={`${h} text-right tabular-nums`} style={{ color: "#C9D1DC" }}>{sayiGoster(s.konteyner)}</td>
            <td className={h} style={{ color: "#C9D1DC" }}>
              {s.liman || "—"}
              <span className="block font-mono text-[11px] break-all" style={alt}>{s.bl_no || "—"}</span>
            </td>
            <td className={h}>
              {s.durum === "onay_bekliyor" ? <span className="text-xs" style={alt} data-durum={s.durum}>—</span> : <DurumRozeti d={s.durum} />}
              {s.benzer && s.kaynak === "sistem" && (
                <span className="mt-1 flex items-start gap-1 text-[11px]" style={{ color: "#FCD34D" }} data-benzer>
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" /> Olası tekrar: {s.benzer}
                </span>
              )}
            </td>
            <td className={`${h} text-xs`} style={alt}>
              {panelBaglantisi(s) ? (
                <Link href={panelBaglantisi(s)!} title="Ana Panel'de dosyayı göster" className="text-white hover:underline decoration-white/40" data-dosya-link>{s.dosya_no}</Link>
              ) : s.dosya_no || (s.durum === "on_odeme_alindi" ? <span className="text-amber-300">Rezervasyon alınmadı</span> : "—")}
              {s.booking_no ? <span className="block break-all">{s.booking_no}</span> : null}
              {s.etd ? <span className="block">ETD {trTarih(s.etd)}</span> : null}
            </td>
            <td className={h}><OnOdemeHucresi s={s} yetkili={yetkili} onAc={onAc} onGeriAl={onGeriAl} mesgul={mesgul === s.anahtar} /></td>
          </tr>
        );
      })}
    </>
  );
}

/** Excel'deki gibi bölümlü sipariş listesi; her bölümde en güncel en altta. */
function SiparisBolumleri({ liste, yetkili, onAc, onGeriAl, onSil, onEslestir, onAyir, mesgul, goster, pazarYetkisi }: {
  liste: SiparisSatiri[]; yetkili: boolean; onAc: (s: SiparisSatiri) => void; onGeriAl: (s: SiparisSatiri) => void; onSil: (s: SiparisSatiri) => void;
  onEslestir: (s: SiparisSatiri) => void; onAyir: (s: SiparisSatiri) => void; mesgul: string | null;
  /** 16.11.2026 sekmeler: yalniz bu bolumler (sekmenin satirlari zaten suzulmus gelir) */
  goster: SiparisBolumu[]; pazarYetkisi: boolean;
}) {
  const bolumler = useMemo(() => siparisBolumleri(liste).filter((b) => goster.includes(b.bolum)), [liste, goster]);
  return (
    <div className="space-y-4">
      {bolumler.map((b) => {
        if (b.bolum === "iptal" && !b.adet) return null;
        const gorunen = b.satirlar;
        const tutarlar = Object.entries(b.tutar).map(([p, t]) => `${sayiGoster(t, 0)} ${paraIsareti(p)}`).join(" + ") || "—";
        const vurgu = b.bolum === "on_odeme" ? "#93C5FD" : b.bolum === "bekleyen" ? "#CBD5E1" : b.bolum === "rezervasyon" ? "#6EE7B7" : "#64748B";
        return (
          <section key={b.bolum} id={`bolum-${b.bolum}`} className="rounded-xl border overflow-hidden scroll-mt-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid={`bolum-${b.bolum}`}>
            <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ backgroundColor: ROW_HEADER_BG, borderLeft: `3px solid ${vurgu}` }}>
              <h3 className="text-[13px] font-semibold text-white leading-snug" data-bolum-baslik>{BOLUM_BASLIGI[b.bolum]}</h3>
              <span className="text-xs ml-auto tabular-nums whitespace-nowrap" style={{ color: TEXT_MUTED }} data-bolum-ozet>
                {b.adet} sipariş · {sayiGoster(b.mt, 2)} MT · {b.konteyner} kont. · {tutarlar}
              </span>
            </div>
            {b.adet === 0 ? (
              <p className="px-4 py-4 text-sm" style={{ color: TEXT_MUTED }}>Bu bölümde sipariş yok.</p>
            ) : (
              <div className="overflow-x-auto md:overflow-visible">
                <table className="w-full min-w-[820px] md:min-w-0 table-fixed text-[12px]">
                  <colgroup>{SIPARIS_SUTUNLARI.map((c) => <col key={c.basliklar[0]} style={{ width: c.genislik }} />)}</colgroup>
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide align-bottom" style={{ color: TEXT_MUTED }} data-testid="siparis-baslik">
                      {SIPARIS_SUTUNLARI.map((c) => (
                        <th key={c.basliklar[0]} className={`px-2 py-2 font-semibold leading-tight ${c.sag ? "text-right" : ""}`}>
                          {c.basliklar.map((x, i) => <span key={x} className={`block ${i ? "font-normal" : ""}`}>{x}</span>)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <SiparisSatirlari satirlar={gorunen} yetkili={yetkili} onAc={onAc} onGeriAl={onGeriAl} onSil={onSil} onEslestir={onEslestir} onAyir={onAyir} mesgul={mesgul} pazarYetkisi={pazarYetkisi} />
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** "Ön ödeme alındı" penceresi: tutar (zorunlu), para birimi, ödeme tarihi. */
/**
 * On odeme / onay penceresi. 17.11.2026 "Onay geldi" (onay bekleyen siparis): onay iki yoldan gelir -
 *  "Ön ödeme geldi" (asagidaki mevcut form, tutar zorunlu) | "İmzalı proforma geldi" (tutarsiz, siparis_onay_imzali).
 * Sistem proformasinda (dosyasi acilmamis) "Kaydedince dosyayi ac" -> Proforma Yukle ?proforma=<id>.
 * Onaylanmis satirda ("Tutar gir") pencere eskisi gibi yalniz on odeme formudur.
 */
function OnOdemeFormu({ s, onKapat, onKaydet, onImzali, dosyaAcilabilir, onDosyaAc }: {
  s: SiparisSatiri; onKapat: () => void;
  onKaydet: (tutar: number, para: string, tarih: string, ek: { oran: number | null; karsilik: number | null }) => Promise<string | null>;
  onImzali: (tarih: string) => Promise<string | null>;
  dosyaAcilabilir: boolean;
  onDosyaAc: () => void;
}) {
  const bugun = bugunIst();
  const yeniOnay = s.durum === "onay_bekliyor";
  const [tur, setTur] = useState<"on_odeme" | "imzali">("on_odeme");
  const [dosyaAc, setDosyaAc] = useState(true);
  // On odeme dagitimi (16.11.2026): siparis takibi yapilan proformada tutar sevkiyatlara yuzdeyle bolunur.
  const [dagilim, setDagilim] = useState<OnOdemeDagitimi | null>(null);
  const [oran, setOran] = useState("");
  const [karsilik, setKarsilik] = useState("");
  useEffect(() => {
    let iptal = false;
    if (!s.proforma_no) return;
    onOdemeDagilimiOku(s.proforma_no).then((d) => {
      if (iptal || !d) return;
      setDagilim(d);
      if (d.oran !== null) setOran(String(d.oran).replace(".", ","));
      if (d.karsilik !== null) setKarsilik(String(d.karsilik).replace(".", ","));
    }).catch(() => undefined);
    return () => { iptal = true; };
  }, [s.proforma_no]);
  const [tutar, setTutar] = useState(s.on_odeme_tutar !== null ? String(s.on_odeme_tutar).replace(".", ",") : "");
  const [para, setPara] = useState(s.on_odeme_para || (s.para_birimi === "EUR" ? "EUR" : "USD"));
  const [tarih, setTarih] = useState(s.on_odeme_tarihi || bugun);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const oku = (x: string) => Number(x.replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  const sayi = oku(tutar);
  const takipli = dagilim !== null;   // bolum her zaman gorunur; dagitim yalniz siparis takibinde yapilir (veritabani karar verir)
  const siparisPara = dagilim?.para || s.para_birimi || "USD";
  const farkliDoviz = takipli && para !== siparisPara;
  const gonder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (yeniOnay && tur === "imzali") {
      if (!tarih || tarih > bugun) { setHata("Onay tarihi bugünden ileri olamaz."); return; }
      setKaydediliyor(true); setHata(null);
      const h = await onImzali(tarih);
      setKaydediliyor(false);
      if (h) setHata(h); else if (dosyaAcilabilir && dosyaAc) onDosyaAc();
      return;
    }
    if (!Number.isFinite(sayi) || sayi <= 0) { setHata("Ön ödeme tutarını girin."); return; }
    if (!tarih || tarih > bugun) { setHata("Ödeme tarihi bugünden ileri olamaz."); return; }
    const oranSayi = oran.trim() === "" ? null : Number(oran.replace(",", "."));
    if (oranSayi !== null && (!Number.isFinite(oranSayi) || oranSayi <= 0 || oranSayi > 100)) { setHata("Ön ödeme yüzdesi 0 ile 100 arasında olmalı."); return; }
    const karsilikSayi = farkliDoviz && karsilik.trim() !== "" ? oku(karsilik) : null;
    if (karsilikSayi !== null && (!Number.isFinite(karsilikSayi) || karsilikSayi <= 0)) { setHata(`${siparisPara} karşılığını doğru girin.`); return; }
    setKaydediliyor(true); setHata(null);
    const h = await onKaydet(Math.round(sayi * 100) / 100, para, tarih, {
      oran: takipli ? oranSayi : null, karsilik: karsilikSayi === null ? null : Math.round(karsilikSayi * 100) / 100,
    });
    setKaydediliyor(false);
    if (h) setHata(h); else if (yeniOnay && dosyaAcilabilir && dosyaAc) onDosyaAc();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-labelledby="onodeme-baslik"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !kaydediliyor) onKapat(); }} data-testid="onodeme-formu">
      <form onSubmit={gonder} className="w-full max-w-md rounded-xl border shadow-xl" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <p id="onodeme-baslik" className="text-sm font-semibold text-white">{yeniOnay ? "Onay geldi" : "Ön ödeme alındı"}</p>
          <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
            {s.proforma_no} · {s.firma}{s.tutar !== null ? ` · proforma ${sayiGoster(s.tutar, 2)} ${paraIsareti(s.para_birimi)}` : ""}
          </p>
        </div>
        <div className="px-5 py-4 space-y-3">
          {yeniOnay && (
            <div className="grid grid-cols-2 gap-1 rounded-lg border p-0.5" style={{ borderColor: CARD_BORDER }} role="radiogroup" aria-label="Onayın türü" data-testid="onay-turu">
              {([["on_odeme", "Ön ödeme geldi"], ["imzali", "İmzalı proforma geldi"]] as const).map(([k, etiket]) => (
                <button key={k} type="button" role="radio" aria-checked={tur === k} onClick={() => { setTur(k); setHata(null); }} data-onay-turu={k}
                  className="h-8 rounded-md text-xs font-semibold transition-colors"
                  style={tur === k ? { backgroundColor: "rgba(16,185,129,0.16)", color: "#FFFFFF" } : { color: TEXT_MUTED }}>{etiket}</button>
              ))}
            </div>
          )}
          {yeniOnay && tur === "imzali" ? (
            <label className="block text-xs" style={{ color: TEXT_MUTED }}>Onay tarihi (imzalı proformanın geldiği gün)
              <input type="date" value={tarih} max={bugun} onChange={(e) => setTarih(e.target.value)} aria-label="Onay tarihi"
                className="mt-1 h-9 w-full rounded-lg border bg-transparent px-3 text-sm text-white" style={{ borderColor: CARD_BORDER, colorScheme: "dark" }} />
            </label>
          ) : (<>
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <label className="text-xs" style={{ color: TEXT_MUTED }}>Alınan tutar
              <input autoFocus inputMode="decimal" value={tutar} onChange={(e) => setTutar(e.target.value)} placeholder="ör. 14.580" aria-label="Ön ödeme tutarı"
                className="mt-1 h-9 w-full rounded-lg border bg-transparent px-3 text-sm text-white tabular-nums" style={{ borderColor: CARD_BORDER }} />
            </label>
            <label className="text-xs" style={{ color: TEXT_MUTED }}>Para birimi
              <select value={para} onChange={(e) => setPara(e.target.value)} aria-label="Para birimi"
                className="mt-1 h-9 w-full rounded-lg border px-2 text-sm text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
                <option value="USD">USD</option><option value="EUR">EUR</option><option value="TRY">TRY</option>
              </select>
            </label>
          </div>
          <label className="block text-xs" style={{ color: TEXT_MUTED }}>Ödeme tarihi
            <input type="date" value={tarih} max={bugun} onChange={(e) => setTarih(e.target.value)} aria-label="Ödeme tarihi"
              className="mt-1 h-9 w-full rounded-lg border bg-transparent px-3 text-sm text-white" style={{ borderColor: CARD_BORDER, colorScheme: "dark" }} />
          </label>
          {takipli && (
            <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: CARD_BORDER }} data-testid="onodeme-dagitim">
              <p className="text-xs font-semibold text-white">Sevkiyatlara dağıtım (yalnız sipariş takibi)</p>
              <div className={farkliDoviz ? "grid grid-cols-2 gap-2" : ""}>
                <label className="block text-xs" style={{ color: TEXT_MUTED }}>Ön ödeme yüzdesi (%)
                  <input inputMode="decimal" value={oran} onChange={(e) => setOran(e.target.value)} placeholder="ör. 30" aria-label="Ön ödeme yüzdesi"
                    className="mt-1 h-9 w-full rounded-lg border bg-transparent px-3 text-sm text-white tabular-nums" style={{ borderColor: CARD_BORDER }} />
                </label>
                {farkliDoviz && (
                  <label className="block text-xs" style={{ color: TEXT_MUTED }}>{siparisPara} karşılığı
                    <input inputMode="decimal" value={karsilik} onChange={(e) => setKarsilik(e.target.value)} placeholder="bankanın çevirdiği tutar" aria-label="Sipariş dövizinde karşılık"
                      className="mt-1 h-9 w-full rounded-lg border bg-transparent px-3 text-sm text-white tabular-nums" style={{ borderColor: CARD_BORDER }} />
                  </label>
                )}
              </div>
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
                Her sevkiyata düşen ön ödeme = yüklenen malın fatura tutarı × yüzde; kalan, &quot;Siparişe devam et&quot; ile açılan sonraki sevkiyata otomatik devreder.
                {dagilim?.oran_kaynak === "odeme_sekli" ? " Yüzde, dosyadaki ödeme şartından okundu." : dagilim?.oran_kaynak === "proforma" ? " Yüzde, proformadaki ödeme şartından (PAYMENT TERMS) okundu." : ""}
              </p>
              {dagilim && dagilim.dosyalar.length > 0 && (
                <table className="w-full text-[11px] tabular-nums" style={{ color: TEXT_MUTED }}>
                  <thead><tr><th className="text-left font-medium">Dosya</th><th className="text-right font-medium">Fatura</th><th className="text-right font-medium">Ön ödeme (şu an)</th></tr></thead>
                  <tbody>
                    {dagilim.dosyalar.map((d) => (
                      <tr key={d.id}>
                        <td className="text-white">{d.dosya_no || "—"}{d.kilit ? <span className="ml-1">({KILIT_METNI[d.kilit]})</span> : null}</td>
                        <td className="text-right">{d.tutar !== null ? sayiGoster(d.tutar, 2) : "—"}</td>
                        <td className="text-right text-white">{(d.pay ?? d.mevcut) !== null ? sayiGoster((d.pay ?? d.mevcut) as number, 2) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {dagilim && dagilim.durum === "tamam" && dagilim.kalan !== null && (
                <p className="text-[11px] text-white">Sonraki sevkiyatlara devreden: {sayiGoster(dagilim.kalan, 2)} {paraIsareti(dagilim.para)}</p>
              )}
              {dagilim && dagilim.dosyalar.length === 0 && (
                <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Henüz sevkiyat dosyası yok; sipariş takibiyle dosyalar açıldıkça pay otomatik düşülür.</p>
              )}
              {dagilim && dagilim.dosyalar.length > 0 && dagilim.durum !== "tamam" && dagilim.durum !== "havuz_yok" && (
                <p className="text-[11px] text-amber-300">{DAGITIM_DURUM_METNI[dagilim.durum]}</p>
              )}
            </div>
          )}
          </>)}
          {yeniOnay && dosyaAcilabilir && (
            <label className="flex items-start gap-2 text-xs text-white cursor-pointer" data-testid="onay-dosya-ac">
              <input type="checkbox" checked={dosyaAc} onChange={(e) => setDosyaAc(e.target.checked)} className="mt-0.5" />
              <span>Kaydedince dosyayı aç <span style={{ color: TEXT_MUTED }}>— kayıtlı proformanın imzalı PDF&apos;i hazırlanır, Proforma Yükle&apos;de kontrol edip açarsınız.</span></span>
            </label>
          )}
          <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
            Kaydedince sipariş &quot;Rezervasyon bekleyen&quot; sekmesine geçer ve yükleme planında &quot;Rezervasyon alınmadı&quot; olarak görünür.
          </p>
          {hata && <p className="text-xs text-red-400 flex items-center gap-1.5" role="alert"><AlertTriangle size={13} />{hata}</p>}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2" style={{ borderColor: CARD_BORDER }}>
          <button type="button" onClick={onKapat} disabled={kaydediliyor} className="px-3 py-2 rounded-lg border text-xs font-medium disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
          <button type="submit" disabled={kaydediliyor} data-testid="onodeme-kaydet" className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
            {kaydediliyor ? "Kaydediliyor…" : yeniOnay && dosyaAcilabilir && dosyaAc ? "Kaydet ve dosyayı aç" : "Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Yukleme plani tablosu - EKRANA SIGAR (yatay kaydirma yok, 11.11.2026): operasyonun 16 basligi korunur, birbiriyle
 * ilgili basliklar ayni sutunda ust / alt satir olarak durur (ör. ACENTE / LİMAN). Excel indir 16 ayri sutun (birebir).
 */
const PLAN_SUTUNLARI: Array<{ basliklar: string[]; genislik: string; sag?: boolean }> = [
  { basliklar: ["MÜŞTERİ"], genislik: "13%" },
  { basliklar: ["CİNSİ", "ÇUVAL MARKASI · AMBALAJ"], genislik: "17%" },
  { basliklar: ["KON.AD."], genislik: "5%", sag: true },
  { basliklar: ["VARIŞ LİMANI"], genislik: "9%" },
  { basliklar: ["ACENTE", "LİMAN"], genislik: "10%" },
  { basliklar: ["EKİPMAN", "BOOKING NO"], genislik: "11%" },
  { basliklar: ["BOŞ EKİPMAN ALIM TARİHİ", "ARDİYESİZ GİRİŞ"], genislik: "9%" },
  { basliklar: ["TALİMAT CUT OFF", "BEYAN CUT OFF"], genislik: "9%" },
  { basliklar: ["ETD"], genislik: "8%" },
  { basliklar: ["GEMİ ADI", "SEFERİ"], genislik: "10%" },
];
/** "2026-11-13T10:00:00+00:00" -> "13.11 10:00" (cut-off; yil hafta basligindan belli) */
const kisaCutoff = (iso: string | null) => { const t = trTarih(iso); return t ? `${t.slice(0, 5)}${saat(iso) ? ` ${saat(iso)}` : ""}` : "—"; };

function PlanTablosu({ bloklar, bugun }: { bloklar: PlanBlogu[]; bugun: string }) {
  const alt = { color: TEXT_MUTED };
  const hucre = "px-2 py-1.5 align-top break-words";
  return (
    <div className="space-y-3">
      {bloklar.map((b) => (
        <div key={b.anahtar} className="rounded-xl border overflow-x-auto md:overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="plan-haftasi">
          <div className="px-4 py-2 text-sm font-semibold flex flex-wrap items-center gap-x-3 gap-y-0.5" style={{ backgroundColor: ROW_HEADER_BG, color: "#FFFFFF", borderLeft: `3px solid ${b.anahtar === "bekleyen" ? "#FBBF24" : b.anahtar === "son" ? "#6EE7B7" : ACCENT}` }}>
            <Ship size={14} style={{ color: ACCENT }} /> <span data-hafta>{b.etiket}</span>
            <span className="text-xs font-normal" style={alt}>{b.satirlar.length} booking · {b.konteyner} konteyner</span>
          </div>
          <table className="w-full min-w-[820px] md:min-w-0 table-fixed text-[12px]">
            <colgroup>{PLAN_SUTUNLARI.map((c) => <col key={c.basliklar[0]} style={{ width: c.genislik }} />)}</colgroup>
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide align-bottom" style={alt} data-testid="plan-baslik">
                {PLAN_SUTUNLARI.map((c) => (
                  <th key={c.basliklar[0]} className={`px-2 pt-2 pb-1.5 font-semibold leading-tight ${c.sag ? "text-right" : ""}`}>
                    {c.basliklar.map((x, i) => <span key={x} className={`block ${i ? "font-normal" : ""}`}>{x}</span>)}
                  </th>
                ))}
              </tr>
            </thead>
            {b.satirlar.map((p) => {
              const gecti = !!(p.etd && p.etd.slice(0, 10) < bugun);
              const k = planKalemleri(p);
              return (
                <tbody key={p.anahtar} className="border-t" style={{ borderColor: CARD_BORDER, opacity: gecti && b.anahtar !== "son" ? 0.72 : 1 }} data-testid="plan-satiri" data-booking={p.booking_no || ""}>
                  <tr>
                    <td className={`${hucre} text-white font-medium`}>
                      {p.musteri || "—"}
                      {p.kaynak === "sistem" ? <span className="ml-1 align-middle px-1 py-0.5 rounded text-[9.5px] font-medium bg-sky-500/15 text-sky-300" title="Excel'de yok; rezervasyondan">sistemden</span> : null}
                      {p.kaynak === "siparis" && p.proforma_no ? <span className="block text-[11px] font-normal" style={alt}>{p.proforma_no}</span> : null}
                    </td>
                    <td className={hucre} style={{ color: "#C9D1DC" }}>
                      {k.map((x, i) => (
                        <span key={i} className={`block ${i ? "mt-1" : ""}`}>
                          {k.length > 1 && x.konteyner !== null ? <span className="text-white tabular-nums">{x.konteyner}× </span> : null}{x.cinsi || "—"}
                          <span className="block text-[11px]" style={alt}>{[x.cuval_markasi, x.ambalaj].filter(Boolean).join(" · ") || "—"}</span>
                        </span>
                      ))}
                    </td>
                    <td className={`${hucre} text-right tabular-nums text-white font-medium`}>{sayiGoster(p.konteyner)}</td>
                    <td className={hucre} style={{ color: "#C9D1DC" }}>{p.varis_limani || "—"}</td>
                    <td className={hucre} style={{ color: "#C9D1DC" }}>{p.acente || "—"}<span className="block text-[11px]" style={alt}>{p.liman || "—"}</span></td>
                    <td className={hucre} style={{ color: "#C9D1DC" }}>
                      <span className="block">{p.ekipman || p.ekipman_alim_yeri || "—"}</span>
                      {p.kaynak === "siparis"
                        ? <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-300" data-rez-yok>Rezervasyon alınmadı</span>
                        : <span className="block font-mono text-[11px] text-white break-all">{p.booking_no || "—"}</span>}
                    </td>
                    <td className={`${hucre} tabular-nums`} style={{ color: "#C9D1DC" }}>{trTarih(p.bos_ekipman_tarihi) || "—"}<span className="block" style={alt}>{trTarih(p.ardiyesiz_giris) || "—"}</span></td>
                    <td className={`${hucre} tabular-nums`} style={{ color: "#C9D1DC" }}>{kisaCutoff(p.talimat_cutoff)}<span className="block" style={alt}>{kisaCutoff(p.beyan_cutoff)}</span></td>
                    <td className={`${hucre} tabular-nums font-semibold whitespace-nowrap`} style={{ color: gecti ? "#6EE7B7" : "#FFFFFF" }} data-etd>{trTarih(p.etd) || "—"}</td>
                    <td className={hucre} style={{ color: "#C9D1DC" }}>{p.gemi || "—"}<span className="block text-[11px]" style={alt}>{p.sefer || ""}</span></td>
                  </tr>
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
  const pazarYetkisi = !!yetkiler.sayfa_yetkileri.pazar;
  // ?sekme= (varsayilan Yukleme Plani adreste yazilmaz); degisince adres guncellenir, gecmis kirletilmez - ERP ortak kit
  const [sekme, setSekme] = useUrlSekmesi<SiparisSekme>(siparisSekmesi, VARSAYILAN_SIPARIS_SEKMESI);
  // Kaynak eski uyarisi (Kontrol Merkezi ile ayni kural: plan / siparis listesi 3 gunden eski). Okunamazsa serit gorunmez.
  const [kaynakUyari, setKaynakUyari] = useState<Tutarsizlik[]>([]);
  // 21.11.2026 (Faz 4): sistemde karsiligi olmayan aktif Excel satirlari (okunamazsa serit gorunmez)
  const [eslesmeyen, setEslesmeyen] = useState<EslesmeyenSatir[]>([]);
  const [siparisler, setSiparisler] = useState<SiparisSatiri[] | null>(null);
  const [plan, setPlan] = useState<PlanSatiri[] | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [onOdemeSatir, setOnOdemeSatir] = useState<SiparisSatiri | null>(null);
  const [planTum, setPlanTum] = useState(false);
  const [arama, setArama] = useState("");
  const [bekleyen, setBekleyen] = useState<string | null>(null);
  const [indiriliyor, setIndiriliyor] = useState(false);
  const [aktarAcik, setAktarAcik] = useState(false);
  const [siparisAktarAcik, setSiparisAktarAcik] = useState(false);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [eslestirilecek, setEslestirilecek] = useState<SiparisSatiri | null>(null);
  // "BL eksik" karti seridi acar (bu satirlar Excel'de yesil ama BL'siz; planda eski haftalarda kalir)
  const [eslesmeyenAcik, setEslesmeyenAcik] = useState<boolean | null>(null);
  const bugun = bugunIst();

  const yukle = useCallback(async () => {
    setYukleniyor(true); setHata(null);
    try {
      const [s, p] = await Promise.all([siparisListesiOku(), yuklemePlaniOku()]);
      setSiparisler(s); setPlan(p);
      tutarsizliklariOku()
        .then((t) => setKaynakUyari(t.kalemler.filter((k) => k.tur === "kaynak_eski" && k.baglanti === "/siparisler")))
        .catch(() => setKaynakUyari([]));
      eslesmeyenleriOku().then(setEslesmeyen).catch(() => setEslesmeyen([]));
    } catch (e) { setHata(e instanceof Error ? e.message : "Veri okunamadı."); }
    finally { setYukleniyor(false); }
  }, []);
  useEffect(() => { if (yetkili) yukle(); }, [yetkili, yukle]);

  // 16.11.2026: "ayni siparis" eslestirmesini geri al (sistem proformasi listede yeniden ayri satir olur)
  const eslesmeAyir = async (s: SiparisSatiri) => {
    if (!s.eslesik_proforma) return;
    setBekleyen(s.anahtar);
    try { await siparisEslesmeKaldir(s.eslesik_proforma); setBilgi(`${s.eslesik_proforma} eşleştirmesi kaldırıldı; listede yine ayrı satır.`); await yukle(); }
    catch (e) { setHata(e instanceof Error ? e.message : "Eşleştirme kaldırılamadı."); }
    finally { setBekleyen(null); }
  };

  const ozet = useMemo(() => siparisOzeti(siparisler || []), [siparisler]);
  const q = norm(arama.trim());
  const aranan = useMemo(() => siparisAra(siparisler || [], arama), [siparisler, arama]);
  const sayilar = useMemo(() => sekmeSayilari(aranan), [aranan]);
  const gorunenSiparis = useMemo(() => (sekme === "plan" || sekme === "formlar" ? [] : aranan.filter((s) => sekmeyeAit(s, sekme))), [aranan, sekme]);
  const planBloklariGorunen = useMemo((): PlanBlogu[] => {
    let l = plan || [];
    if (q) l = l.filter((p) => [p.musteri, p.booking_no, p.varis_limani, p.gemi, p.acente, p.cinsi, p.dosya_no, p.proforma_no].some((v) => v && norm(v).includes(q)));
    // 21.11.2026: aramada tum yil (eski bir booking / BL eksik satir "Guncel" gorunumde gizli kalmasin)
    if (planTum || q) return planBloklari(l);
    const g = planGorunumu(l, bugun);
    const ozel = (anahtar: string, etiket: string, satirlar: PlanSatiri[]): PlanBlogu[] =>
      satirlar.length ? [{ anahtar, etiket, yil: null, hafta: null, satirlar, konteyner: satirlar.reduce((t, p) => t + (p.konteyner || 0), 0) }] : [];
    return [
      ...ozel("bekleyen", BEKLEYEN_BLOK, planSirala(g.bekleyen)),
      ...ozel("son", `TAMAMLANAN SON ${g.son.length} SEVKİYAT`, g.son),
      ...planBloklari(g.guncel),
    ];
  }, [plan, planTum, q, bugun]);

  const onOdemeKaydetFn = async (s: SiparisSatiri, tutar: number, para: string, tarih: string, ek: { oran: number | null; karsilik: number | null }): Promise<string | null> => {
    if (!s.proforma_no) return "Proforma no yok.";
    try {
      const d = await onOdemeKaydet(s.proforma_no, true, tutar, para, tarih, ek);
      setOnOdemeSatir(null);
      const dagitim = !d || d.durum === "takip_degil" ? "" : d.durum === "tamam"
        ? ` ${d.dosyalar.length} sevkiyat dosyasına %${String(d.oran).replace(".", ",")} ile dağıtıldı; devreden ${sayiGoster(d.kalan ?? 0, 2)} ${paraIsareti(d.para)}.`
        : ` ${DAGITIM_DURUM_METNI[d.durum]}`;
      setBilgi(`${s.proforma_no}: ön ödeme kaydedildi (${tutar.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${para}). Sipariş "Rezervasyon bekleyen" sekmesine ve yükleme planına eklendi.${dagitim}`);
      await yukle();
      return null;
    } catch (e) { return e instanceof Error ? e.message : "Ön ödeme kaydedilemedi."; }
  };
  // 17.11.2026 "Onay geldi" - imzali proforma (tutarsiz)
  const onayImzaliFn = async (s: SiparisSatiri, tarih: string): Promise<string | null> => {
    if (!s.proforma_no) return "Proforma no yok.";
    try {
      await onayImzaliKaydet(s.proforma_no, tarih);
      setOnOdemeSatir(null);
      setBilgi(`${s.proforma_no}: imzalı proforma ile onaylandı. Sipariş "Rezervasyon bekleyen" sekmesine geçti; ön ödeme tutarı geldiğinde "Tutar gir" ile eklenir.`);
      await yukle();
      return null;
    } catch (e) { return e instanceof Error ? e.message : "Onay kaydedilemedi."; }
  };
  // Dosyasi acilmamis sistem proformasi ("proforma:<id>") -> Proforma Yukle ?proforma=<id>
  const kayitliProformaId = (s: SiparisSatiri) => (s.anahtar.startsWith("proforma:") ? s.anahtar.slice("proforma:".length) : null);
  const dosyaAcYetkisi = !!yetkiler.sayfa_yetkileri.yeni_dosya;
  const onOdemeGeriAl = async (s: SiparisSatiri) => {
    if (!s.proforma_no) return;
    setBekleyen(s.anahtar); setHata(null);
    try { await onOdemeKaydet(s.proforma_no, false); setBilgi(`${s.proforma_no}: ön ödeme işareti geri alındı.`); await yukle(); }
    catch (e) { setHata(e instanceof Error ? e.message : "Ön ödeme geri alınamadı."); }
    finally { setBekleyen(null); }
  };
  // 12.11.2026: satir silme (Excel'den gelen kayit ya da dosyasi acilmamis proforma)
  const [silinecek, setSilinecek] = useState<SiparisSatiri | null>(null);
  const siparisSil = async (s: SiparisSatiri) => {
    setBekleyen(s.anahtar); setHata(null); setBilgi(null);
    try {
      const no = await siparisSatiriSil(s.anahtar);
      setBilgi(`${no || s.proforma_no || "Sipariş"} (${s.firma || "-"}) sipariş listesinden silindi.`);
      await yukle();
    } catch (e) { setHata(e instanceof Error ? e.message : "Sipariş silinemedi."); }
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
  // Sekme cubugu (Pazar / Ana Panel ile ayni stil). Rezervasyon bekleyen: aksiyon gerektirir, turuncu sayi rozeti.
  const SEKMELER: SekmeOgesi<SiparisSekme>[] = [
    // 21.11.2026: Yukleme Plani ilk sekme ve varsayilan (rezervasyonlu siparisler planda); Sevk edilen -> Ihracatlar
    { deger: "plan", etiket: "Yükleme Planı", ikon: <Ship size={14} />, sayi: null },
    { deger: "rez_bekleyen", etiket: "Rezervasyon bekleyen", ikon: <Hourglass size={14} />, sayi: sayilar.rez_bekleyen, vurgu: true },
    { deger: "onay", etiket: "Onay bekleyen", ikon: <Clock size={14} />, sayi: sayilar.onay },
    // 18.11.2026: her booking icin uretime giden Siparis Bildirim Formu (cuval gorseli + uretim / SKT)
    { deger: "formlar", etiket: "Sipariş Formları", ikon: <FileSpreadsheet size={14} />, sayi: null },
  ];
  const SEKME_BOLUMLERI: Record<ListeSekmesi, SiparisBolumu[]> = {
    rez_bekleyen: ["on_odeme"], onay: ["bekleyen"],
  };
  const digerSonuc = q && sekme !== "plan" && sekme !== "formlar" ? sayilar.rez_bekleyen + sayilar.onay - gorunenSiparis.length : 0;
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
            <SecilebilirOzetKarti testId="ozet-acik" etiket="Açık sipariş" deger={ozet.acikSiparis} alt={`${ozet.acikMt.toLocaleString("tr-TR")} MT · ${ozet.acikKont} kont.`} onClick={() => setSekme("plan")} />
            <SecilebilirOzetKarti testId="ozet-onay" etiket="Ön ödeme / onay bekliyor" deger={ozet.onay} onClick={() => setSekme("onay")} secili={sekme === "onay"} />
            <SecilebilirOzetKarti testId="ozet-onodeme" etiket="Ön ödeme alındı · rez. yok" deger={ozet.onOdeme} renk="#93C5FD" onClick={() => setSekme("rez_bekleyen")} secili={sekme === "rez_bekleyen"} />
            <SecilebilirOzetKarti testId="ozet-rez" etiket="Rezervasyonlu" deger={ozet.rezervasyonlu} renk="#F4A07C" alt="yükleme planında" onClick={() => setSekme("plan")} secili={sekme === "plan"} />
            <SecilebilirOzetKarti testId="ozet-bl" etiket="BL eksik" deger={ozet.blEksik} renk={ozet.blEksik ? "#FCA5A5" : undefined} onClick={() => { setSekme("plan"); if (ozet.blEksik) setEslesmeyenAcik(true); }} />
            <SecilebilirOzetKarti testId="ozet-tekrar" etiket="Olası tekrar" deger={ozet.olasiTekrar} renk={ozet.olasiTekrar ? "#FCD34D" : undefined} alt="yeniden kesilmiş proforma?" onClick={ozet.olasiTekrar ? () => setSekme(tekrarSekmesi(siparisler)) : undefined} />
          </div>

          {kaynakUyari.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 mb-4 text-xs" role="status" data-testid="kaynak-uyari"
              style={{ borderColor: "rgba(245,158,11,0.35)", backgroundColor: "rgba(245,158,11,0.08)", color: "#FCD34D" }}>
              <AlertTriangle size={14} className="shrink-0" />
              {kaynakUyari.map((k) => (
                <span key={k.baslik}><b>{k.baslik}</b>{k.ayrinti ? <span style={{ color: "#E2C76B" }}> · {k.ayrinti}</span> : null}</span>
              ))}
              {isaretleyebilir && (
                <span className="ml-auto flex gap-2">
                  {kaynakUyari.some((k) => k.baslik.startsWith("Yükleme")) && (
                    <button type="button" onClick={() => { setSekme("plan"); setAktarAcik(true); }} className="h-7 px-2.5 rounded-md border font-medium text-white hover:bg-white/[0.04]" style={{ borderColor: "rgba(245,158,11,0.45)" }} data-plan-yukle>Plan yükle</button>
                  )}
                  {kaynakUyari.some((k) => k.baslik.startsWith("Sipariş")) && (
                    <button type="button" onClick={() => setSiparisAktarAcik(true)} className="h-7 px-2.5 rounded-md border font-medium text-white hover:bg-white/[0.04]" style={{ borderColor: "rgba(245,158,11,0.45)" }} data-liste-yukle>Liste yükle</button>
                  )}
                </span>
              )}
            </div>
          )}

          <EslesmeyenSerit satirlar={eslesmeyen} acik={eslesmeyenAcik} onAcik={setEslesmeyenAcik} onGoster={(e) => {
            // 21.11.2026: rezervasyonlu / BL eksik satir Yukleme Plani'nda booking (yoksa firma) ile aranir
            const t = satirSekmesi({ durum: e.durum }) || "plan";
            setArama(t === "plan" ? planAramaMetni(e) : e.proforma_no || "");
            setSekme(t);
          }} />

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <SekmeCubugu testId="siparis-sekmeler" sayiBicimi="rozet" className="lg:w-auto lg:inline-flex" dugmeBosluk="px-3"
              secili={sekme} onSec={setSekme} ogeler={SEKMELER} />
            <div className="relative ml-auto w-full sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
              <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Proforma, firma, booking, liman ara" aria-label="Ara"
                className="h-9 w-full rounded-lg border bg-transparent pl-8 pr-3 text-sm text-white" style={{ borderColor: CARD_BORDER }} />
            </div>
          </div>

          {/* 21.11.2026: liste aktarimi her sekmeden acilabilir (sayfa artik Yukleme Plani ile aciliyor) */}
          {siparisAktarAcik && (
            <SiparisExcelAktar onKapat={() => setSiparisAktarAcik(false)} onAktarildi={(m) => { setSiparisAktarAcik(false); setBilgi(m); yukle(); }} />
          )}
          {sekme === "formlar" ? (
            <SiparisFormlari />
          ) : sekme !== "plan" ? (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <p className="text-xs" style={{ color: TEXT_MUTED }}>
                  Yeni proforma &quot;Onay bekleyen&quot; sekmesine düşer → ön ödeme girilince &quot;Rezervasyon bekleyen&quot;e ve yükleme planına geçer → rezervasyon alınınca yükleme planında booking satırı olur; sevk edilenler İhracatlar sayfasında izlenir. Her sekmede en güncel en altta.
                </p>
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
              <ConfirmDialog open={!!silinecek} onOpenChange={(a) => { if (!a) setSilinecek(null); }}
                title={`${silinecek?.proforma_no || "Sipariş"} silinsin mi?`}
                description={silinecek?.anahtar.startsWith("proforma:")
                  ? `${silinecek?.firma || "-"} · ${silinecek?.proforma_no || "-"}: proforma sistemden silinir (ihracat dosyası açılmamış). Bu işlem geri alınamaz.`
                  : `${silinecek?.firma || "-"} · ${silinecek?.proforma_no || "-"}: satır sipariş listesinden silinir. Proforma ve ihracat dosyaları etkilenmez. Bu işlem geri alınamaz.`}
                confirmLabel="Sil" cancelLabel="Vazgeç"
                onConfirm={() => { const s = silinecek; setSilinecek(null); if (s) siparisSil(s); }} />
              {eslestirilecek && (
                <SiparisEslestirFormu s={eslestirilecek} onKapat={() => setEslestirilecek(null)} onEslesti={(m) => { setEslestirilecek(null); setBilgi(m); yukle(); }} />
              )}
              {onOdemeSatir && (
                <OnOdemeFormu s={onOdemeSatir} onKapat={() => setOnOdemeSatir(null)} onKaydet={(t, p, d, ek) => onOdemeKaydetFn(onOdemeSatir, t, p, d, ek)}
                  onImzali={(d) => onayImzaliFn(onOdemeSatir, d)}
                  dosyaAcilabilir={dosyaAcYetkisi && !!kayitliProformaId(onOdemeSatir)}
                  onDosyaAc={() => { const id = kayitliProformaId(onOdemeSatir); if (id) window.location.assign(`/yeni-dosya?proforma=${encodeURIComponent(id)}`); }} />
              )}
              {gorunenSiparis.length ? (
                <SiparisBolumleri liste={gorunenSiparis} yetkili={isaretleyebilir} onAc={setOnOdemeSatir} onGeriAl={onOdemeGeriAl} onSil={setSilinecek}
                  onEslestir={setEslestirilecek} onAyir={eslesmeAyir} mesgul={bekleyen}
                  goster={SEKME_BOLUMLERI[sekme]} pazarYetkisi={pazarYetkisi} />
              ) : (
                <EmptyState icon={<ClipboardList size={40} />} title={q ? "Bu sekmede aramayla eşleşen sipariş yok" : "Bu sekmede sipariş yok"}
                  description={digerSonuc ? `Diğer sekmelerde ${digerSonuc} sonuç var; sekme sayılarına bakın.` : undefined} />
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                <button type="button" onClick={() => setPlanTum(false)} className="h-8 px-3 rounded-full text-xs" data-plan-filtre="guncel"
                  style={!planTum ? { backgroundColor: "rgba(244,160,124,0.18)", color: ACCENT, border: `1px solid ${ACCENT}` } : { color: TEXT_MUTED, border: `1px solid ${CARD_BORDER}` }}>Güncel: son 5 sevkiyat + bu hafta ve sonrası</button>
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
              {planBloklariGorunen.length ? <PlanTablosu bloklar={planBloklariGorunen} bugun={bugun} /> : <EmptyState icon={<Ship size={40} />} title="Planlı yükleme yok" />}
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
