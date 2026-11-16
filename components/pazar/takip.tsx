"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, BellRing, ChevronDown, ChevronRight, CircleDashed, FileText, Globe2, Inbox, Mail, MessageCircle, Search, ShoppingCart, SkipForward, ThumbsDown, ThumbsUp, UserRound, Users,
} from "lucide-react";
import type { PazarFirma, PazarTemas, TakipGorev, TakipVerisi } from "@/lib/pazar/veri";
import { ulkeGosterim } from "@/lib/pazar/veri";
import { ekipOzeti, type Aksiyon, type HuniAsamasi, type UlkeSatiri } from "@/lib/pazar/panel";
import { ulkeTablosu, type UlkeSiraAlani } from "@/lib/pazar/gorunum";
import { UlkeBayrak } from "@/components/ulke-bayrak";
import { CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";
import { AcilirSerit, SERIT_TONU, useAcikTercihi } from "@/components/erp/acilir-serit";

/**
 * 16.11.2026 gece (kullanici: Kontrol Merkezi'ndeki standart mimari): tek "PazarTakip" bileşeni dört parçaya ayrıldı;
 * HESAPLAR AYNI (lib/pazar/panel.ts). AksiyonCubugu (sabit üst, açılır-kapanır; yoksa gizli) | EkipPaneli (Günlük
 * Operasyon; kart başlığında 3 ölçü) | SurecHunisi (Potansiyel sekmesinin tepesi; seçim tabloyu filtreler) |
 * UlkeTablosu (Pazar Analizi; arama + sıralama, tüm ülkeler).
 *
 * PAZAR - Takip sekmesi = YONETICI PANELI (16.11.2026; onceki: 10.11.2026 "Bugun / Gelen cevaplar / Surecteki firmalar").
 * Kullanici: "'Surecteki firmalar 28 firma · sonraki adim tarihine gore' bunu bu sekilde gormek bize ne sagliyor?
 * Pazar sekmesinin dogru calistigini dusunmuyorum." Karar: Yonetici paneli (hesaplar lib/pazar/panel.ts):
 *  1) Aksiyon bekleyenler: cevap yazan (sonucu girilmemis) / mailde teklif-siparis sinyali / teklif isteyen /
 *     islenmeden kalan gorev. Bos ise "bekleyen aksiyon yok".
 *  2) Ekip: kisi basina bugunun ilerlemesi + son 30 gun hunisi (gorev -> islenen -> ulasilan -> cevap -> teklif -> siparis).
 *  3) Surec: asama basina firma sayisi; tiklayinca o asamadaki firmalar (eski "surecteki firmalar" tablosu yerine).
 *  4) Ulkelere gore pazar: musteri / potansiyel / ulasilan / cevap; ulkeye tiklayinca Potansiyel sekmesi o ulkeyle acilir.
 */

const NEDEN_ADI: Record<TakipGorev["neden"], string> = { hatirlatma1: "Hatırlatma 1", hatirlatma2: "Hatırlatma 2", siparissiz: "Siparişsiz", potansiyel: "Potansiyel" };
const SONUC_ADI: Record<string, string> = { cevap: "Cevap verdi", teklif: "Teklif istedi", siparis: "Sipariş verdi", ilgilenmiyor: "İlgilenmiyor" };
const AKSIYON: Record<Aksiyon["tur"], { etiket: string; renk: string; bg: string }> = {
  cevap: { etiket: "Cevap", renk: "#93C5FD", bg: "rgba(96,165,250,0.14)" },
  oneri: { etiket: "Sinyal", renk: "#6EE7B7", bg: "rgba(16,185,129,0.14)" },
  teklif: { etiket: "Teklif", renk: "#C4B5FD", bg: "rgba(167,139,250,0.14)" },
  islenmedi: { etiket: "İşlenmedi", renk: "#FCA5A5", bg: "rgba(239,68,68,0.12)" },
};

const gunTR = (t: string) => new Date(t.length === 10 ? `${t}T12:00:00` : t).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Istanbul" });
const saatTR = (t: string) => new Date(t).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
const oran = (a: number, b: number) => (b ? `%${Math.round((a / b) * 100)}` : "—");

function Bolum({ ikon, baslik, alt, sag, children, testId }: { ikon: React.ReactNode; baslik: string; alt?: string; sag?: React.ReactNode; children: React.ReactNode; testId: string }) {
  return (
    <section className="rounded-xl border" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
        {ikon}
        <h2 className="text-sm font-semibold text-white">{baslik}</h2>
        {alt && <span className="text-xs" style={{ color: TEXT_MUTED }}>{alt}</span>}
        {sag && <div className="ml-auto">{sag}</div>}
      </div>
      {children}
    </section>
  );
}

function GorevDurumu({ g }: { g: TakipGorev }) {
  const s = g.son;
  if (g.durum === "bekliyor" || !s) return <span className="inline-flex items-center gap-1 text-xs" style={{ color: TEXT_MUTED }}><CircleDashed size={13} /> Bekliyor</span>;
  if (g.durum === "atlandi" || s.adim === "atla")
    return <span className="inline-flex items-start gap-1 text-xs" style={{ color: "#FCD34D" }} data-takip-atla><SkipForward size={13} className="mt-0.5 shrink-0" /> <span>Atlandı{s.konu ? `: ${s.konu}` : ""}</span></span>;
  if (s.adim === "sonuc" && s.sonuc) {
    const ikon = s.sonuc === "teklif" ? <FileText size={13} /> : s.sonuc === "siparis" ? <ShoppingCart size={13} /> : s.sonuc === "ilgilenmiyor" ? <ThumbsDown size={13} /> : <ThumbsUp size={13} />;
    return <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#93C5FD" }}>{ikon} {SONUC_ADI[s.sonuc]}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#6EE7B7" }}>
      {s.kanal === "whatsapp" ? <MessageCircle size={13} /> : <Mail size={13} />} {s.kanal === "whatsapp" ? "WhatsApp gönderildi" : "Mail gönderildi"}
      {g.tamamlanma && <span style={{ color: TEXT_MUTED }}>· {saatTR(g.tamamlanma)}</span>}
    </span>
  );
}

const AKSIYON_ACIK = "pazar:aksiyon-acik";

/** Sabit üst aksiyon çubuğu: aksiyon yoksa hiç görünmez; açık/kapalı tercihi tarayıcıda saklanır (varsayılan açık). */
export function AksiyonCubugu({ aksiyon, firmalar, ekip, onFirma }: {
  aksiyon: Aksiyon[]; firmalar: PazarFirma[]; ekip: TakipVerisi["ekip"]; onFirma: (id: string) => void;
}) {
  const firma = useMemo(() => new Map(firmalar.map((f) => [f.id, f])), [firmalar]);
  const ekipAdi = useMemo(() => new Map(ekip.map((e) => [e.kod, e.hitap || e.eposta])), [ekip]);
  // Acik / kapali tercihi tarayicida (varsayilan acik) - ERP ortak kit
  const [tercih, tercihYaz] = useAcikTercihi(AKSIYON_ACIK);
  const acik = tercih ?? true;
  const [tumu, setTumu] = useState(false);
  if (aksiyon.length === 0) return null;
  const degistir = () => tercihYaz(!acik);
  const turler = (Object.keys(AKSIYON) as Aksiyon["tur"][]).map((t) => ({ t, n: aksiyon.filter((a) => a.tur === t).length })).filter((x) => x.n > 0);
  const gosterilen = tumu ? aksiyon : aksiyon.slice(0, 8);
  return (
    <AcilirSerit acik={acik} onDegistir={degistir} {...SERIT_TONU.amber} className="mb-4" testId="panel-aksiyon"
      ikon={<BellRing size={14} />} baslik={`Aksiyon bekleyenler · ${aksiyon.length} firma`}
      rozetler={turler.map(({ t, n }) => <span key={t} className="rounded-full px-2 py-0.5 text-[10.5px]" style={{ backgroundColor: AKSIYON[t].bg, color: AKSIYON[t].renk }}>{AKSIYON[t].etiket} <b className="tabular-nums">{n}</b></span>)}>
      {(
        <>
          <ul className="divide-y border-t" style={{ borderColor: CARD_BORDER }}>
            {gosterilen.map((a) => {
              const f = firma.get(a.firma_id);
              const st = AKSIYON[a.tur];
              return (
                <li key={`${a.tur}-${a.firma_id}`} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 cursor-pointer hover:bg-white/[0.02]" style={{ borderColor: CARD_BORDER }}
                  onClick={() => onFirma(a.firma_id)} data-panel-aksiyon={a.tur}>
                  <span className="inline-flex h-5 w-fit items-center px-2 rounded-full text-[11px] font-medium shrink-0 sm:w-20 justify-center" style={{ backgroundColor: st.bg, color: st.renk }}>{st.etiket}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white leading-snug break-words">
                      {f?.ulke && <span className="mr-1.5 align-middle"><UlkeBayrak ulke={f.ulke} /></span>}
                      {f?.ad || "—"}
                      {f && <span className="ml-2 text-[11px]" style={{ color: TEXT_MUTED }}>{f.durum === "musteri" ? "müşteri" : "potansiyel"}</span>}
                    </p>
                    <p className="text-xs break-words" style={{ color: "#C9D1DC" }}>{a.aciklama}{a.detay ? <span style={{ color: TEXT_MUTED }}> · {a.detay}</span> : null}</p>
                  </div>
                  <span className="text-[11px] whitespace-nowrap" style={{ color: TEXT_MUTED }}>{a.kim ? `${ekipAdi.get(a.kim) || a.kim} · ` : ""}{gunTR(a.tarih)}</span>
                </li>
              );
            })}
          </ul>
          {aksiyon.length > 8 && (
            <button type="button" onClick={() => setTumu(!tumu)} className="w-full px-4 py-2 text-xs border-t hover:bg-white/[0.03]" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }}>
              {tumu ? "Daha az göster" : `Tümünü göster (${aksiyon.length})`}
            </button>
          )}
        </>
      )}
    </AcilirSerit>
  );
}

function BaslikOlcusu({ etiket, deger, renk, testId }: { etiket: string; deger: string; renk?: string; testId?: string }) {
  return (
    <div className="text-right">
      <p className="text-[10.5px] whitespace-nowrap" style={{ color: TEXT_MUTED }}>{etiket}</p>
      <p className="text-base font-semibold tabular-nums" style={{ color: renk || "#FFFFFF" }} data-takip-olcu={testId}>{deger}</p>
    </div>
  );
}

/** Günlük Operasyon: kişi başına bugünün görevleri. Kart başlığında 3 ölçü (bugün / 30 gün ulaşılan / teklif-sipariş). */
export function EkipPaneli({ takip, firmalar, temaslar, onFirma }: {
  takip: TakipVerisi; firmalar: PazarFirma[]; temaslar: PazarTemas[]; onFirma: (id: string) => void;
}) {
  const firma = useMemo(() => new Map(firmalar.map((f) => [f.id, f])), [firmalar]);
  const ekip = useMemo(() => ekipOzeti({ bugun: takip.bugun, ekip: takip.ekip, firmalar, temaslar, gelenler: takip.gelenler, gorevler: takip.gorevler }), [takip, firmalar, temaslar]);
  const bugunGorev = takip.gorevler.filter((g) => g.tarih === takip.bugun);
  const toplam = ekip.reduce((t, k) => ({ ulasilan: t.ulasilan + k.ulasilan, cevap: t.cevap + k.cevap }), { ulasilan: 0, cevap: 0 });

  return (
    <Bolum testId="panel-ekip" ikon={<Users size={16} style={{ color: "#6EE7B7" }} />} baslik="Günlük görevler"
      alt={`bugün ${gunTR(takip.bugun)} · son 30 gün: ${toplam.ulasilan} firmaya ulaşıldı, ${toplam.cevap} dönüş (${oran(toplam.cevap, toplam.ulasilan)})`}>
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        {ekip.map((k) => {
          const liste = bugunGorev.filter((g) => (k.kod ? g.atanan === k.kod : true)).sort((a, b) => a.sira - b.sira);
          const yuzde = k.bugunToplam ? Math.round((k.bugunIslenen / k.bugunToplam) * 100) : 0;
          const tamam = k.bugunToplam > 0 && k.bugunIslenen === k.bugunToplam;
          return (
            <div key={k.kod || "ekip"} className="rounded-lg border" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }} data-takip-kisi={k.kod}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5">
                <p className="text-sm font-semibold text-white flex items-center gap-1.5 min-w-0 truncate"><UserRound size={14} style={{ color: "#6EE7B7" }} /> {k.ad}</p>
                <div className="flex items-start gap-5" data-ekip-huni>
                  <BaslikOlcusu etiket="Bugün" deger={`${k.bugunIslenen}/${k.bugunToplam}`} renk={tamam ? "#6EE7B7" : undefined} testId="bugun" />
                  <BaslikOlcusu etiket="30 gün ulaşılan" deger={String(k.ulasilan)} testId="ulasilan" />
                  <BaslikOlcusu etiket="Teklif / Sipariş" deger={`${k.teklif}/${k.siparis}`} renk={k.teklif || k.siparis ? "#C4B5FD" : undefined} testId="teklif-siparis" />
                </div>
              </div>
              <div className="h-1 mx-3 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full" style={{ width: `${yuzde}%`, backgroundColor: "#10B981" }} data-takip-ilerleme={`${k.bugunIslenen}/${k.bugunToplam}`} />
              </div>
              {k.islenmeyen > 0 ? (
                <p className="mx-3 mt-2 mb-2 flex items-center gap-1.5 text-[11px]" style={{ color: "#FCA5A5" }} data-ekip-islenmeyen>
                  <AlertTriangle size={12} /> Son 30 günde {k.islenmeyen} görev işlenmeden kaldı
                </p>
              ) : <div className="h-2" />}
              {liste.length === 0 ? (
                <p className="px-3 py-3 text-xs border-t" style={{ color: TEXT_MUTED, borderColor: CARD_BORDER }}>Bugün görev yok (hafta sonu ya da sabah maili henüz gitmedi).</p>
              ) : (
                <ul className="divide-y border-t" style={{ borderColor: CARD_BORDER }}>
                  {liste.map((g) => (
                    <li key={`${g.tarih}-${g.atanan}-${g.sira}`} className="px-3 py-2 flex items-start gap-2 text-sm" style={{ borderColor: CARD_BORDER }} data-takip-gorev={g.durum}>
                      <span className="w-5 text-xs tabular-nums mt-0.5" style={{ color: TEXT_MUTED }}>{g.sira}</span>
                      <div className="flex-1 min-w-0">
                        <button type="button" onClick={() => onFirma(g.firma_id)} className="text-left text-white hover:underline leading-snug break-words">{firma.get(g.firma_id)?.ad || "—"}</button>
                        <div className="mt-0.5"><GorevDurumu g={g} /></div>
                      </div>
                      <span className="text-[11px] whitespace-nowrap mt-0.5" style={{ color: TEXT_MUTED }}>{NEDEN_ADI[g.neden]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Bolum>
  );
}

/** Süreç hunisi (Potansiyel sekmesinin tepesi). Aşamaya tıklayınca altındaki tablo o aşamaya filtrelenir; tekrar tıklayınca kalkar. */
export function SurecHunisi({ asamalar, secili, onSec }: { asamalar: HuniAsamasi[]; secili: string | null; onSec: (kod: string | null) => void }) {
  return (
    <Bolum testId="panel-surec" ikon={<Inbox size={16} style={{ color: "#FCD34D" }} />} baslik="Süreç hunisi" alt="aşamaya tıklayınca aşağıdaki liste o aşamaya filtrelenir"
      sag={secili ? <button type="button" onClick={() => onSec(null)} className="text-[11px] underline" style={{ color: TEXT_MUTED }}>Aşama filtresini kaldır</button> : undefined}>
      <div className="p-4 flex flex-wrap gap-2" role="tablist">
        {asamalar.map((a) => (
          <button key={a.kod} type="button" role="tab" aria-selected={secili === a.kod} onClick={() => onSec(secili === a.kod ? null : a.kod)} data-surec-asama={a.kod}
            className="rounded-lg border px-3 py-2 text-left min-w-[104px] transition-colors hover:bg-white/[0.03]"
            style={{ borderColor: secili === a.kod ? "rgba(16,185,129,0.6)" : CARD_BORDER, backgroundColor: secili === a.kod ? "rgba(16,185,129,0.10)" : ROW_HEADER_BG, opacity: a.yan ? 0.85 : 1 }}>
            <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{a.ad}</p>
            <p className="text-lg font-semibold text-white tabular-nums" data-deger>{a.adet}</p>
          </button>
        ))}
      </div>
    </Bolum>
  );
}

const ULKE_SUTUNLARI: { alan: UlkeSiraAlani; ad: string; sinif?: string }[] = [
  { alan: "ulke", ad: "Ülke" },
  { alan: "musteri", ad: "Müşteri" },
  { alan: "potansiyel", ad: "Potansiyel" },
  { alan: "epostali", ad: "E-postalı", sinif: "hidden sm:table-cell" },
  { alan: "ulasilan", ad: "Ulaşılan" },
  { alan: "cevap", ad: "Dönüş" },
  { alan: "sonTemas", ad: "Son temas", sinif: "hidden md:table-cell" },
];

/** Pazar Analizi: tüm ülkeler, ülke araması + başlığa tıklayarak sıralama. Satıra tıklayınca o ülkenin potansiyel listesi. */
export function UlkeTablosu({ ulkeler, onUlke }: { ulkeler: UlkeSatiri[]; onUlke: (ulke: string) => void }) {
  const [ara, setAra] = useState("");
  const [sira, setSira] = useState<{ alan: UlkeSiraAlani | null; artan: boolean }>({ alan: null, artan: false });
  const liste = useMemo(() => ulkeTablosu(ulkeler, ara, sira.alan, sira.artan, ulkeGosterim), [ulkeler, ara, sira]);
  const tikla = (alan: UlkeSiraAlani) => setSira((s) => (s.alan === alan ? { alan, artan: !s.artan } : { alan, artan: alan === "ulke" }));
  const bilinen = ulkeler.filter((u) => u.ulke !== "—").length;
  return (
    <Bolum testId="panel-ulkeler" ikon={<Globe2 size={16} style={{ color: "#93C5FD" }} />} baslik="Ülkelere göre pazar"
      alt={`${bilinen} ülke · başlığa tıklayınca sıralanır · ülkeye tıklayınca potansiyel listesi açılır`}
      sag={
        <label className="relative block">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} aria-hidden />
          <input value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Ülke ara" aria-label="Ülke ara" data-testid="ulke-ara"
            className="h-8 w-44 pl-7 pr-2 rounded-lg border bg-transparent text-xs text-white outline-none focus:border-emerald-500/60" style={{ borderColor: CARD_BORDER }} />
        </label>
      }>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="panel-ulke-tablo">
          <thead style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
            <tr className="text-xs">
              {ULKE_SUTUNLARI.map((s, i) => {
                const secili = sira.alan === s.alan;
                return (
                  <th key={s.alan} className={`font-medium py-2 ${i === 0 ? "text-left px-4" : i === ULKE_SUTUNLARI.length - 1 ? "text-right px-4" : "text-right px-3"} ${s.sinif || ""}`}
                    aria-sort={secili ? (sira.artan ? "ascending" : "descending") : "none"} style={{ color: secili ? "#FFFFFF" : TEXT_MUTED }}>
                    <button type="button" onClick={() => tikla(s.alan)} className={`inline-flex items-center gap-1 hover:text-white ${i === 0 ? "" : "flex-row-reverse"}`}>
                      {s.ad}{secili && (sira.artan ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {liste.map((u) => (
              <tr key={u.ulke} className="border-t cursor-pointer hover:bg-white/[0.02]" style={{ borderColor: CARD_BORDER }} onClick={() => onUlke(u.ulke === "—" ? "-" : u.ulke)} data-panel-ulke={u.ulke}>
                <td className="px-4 py-2 text-white whitespace-nowrap">{u.ulke === "—" ? <span style={{ color: TEXT_MUTED }}>Ülkesi bilinmeyen</span> : <span className="inline-flex items-center gap-1.5"><UlkeBayrak ulke={u.ulke} /> {ulkeGosterim(u.ulke)}</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: u.musteri ? "#6EE7B7" : TEXT_MUTED }}>{u.musteri || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "#C9D1DC" }}>{u.potansiyel || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell" style={{ color: "#C9D1DC" }}>{u.epostali || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: u.ulasilan ? "#FFFFFF" : TEXT_MUTED }}>{u.ulasilan || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: u.cevap ? "#93C5FD" : TEXT_MUTED }}>{u.cevap || "—"}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap hidden md:table-cell text-xs" style={{ color: TEXT_MUTED }}>{u.sonTemas ? gunTR(u.sonTemas) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {liste.length === 0 && <p className="px-4 py-5 text-xs" style={{ color: TEXT_MUTED }}>Eşleşen ülke yok.</p>}
      </div>
    </Bolum>
  );
}
