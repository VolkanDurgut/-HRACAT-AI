"use client";

import React, { useMemo } from "react";
import { CalendarClock, CheckCircle2, CircleDashed, Inbox, Mail, MessageCircle, SkipForward, ThumbsDown, ThumbsUp, FileText, ShoppingCart, UserRound } from "lucide-react";
import type { PazarFirma, PazarTemas, TakipGorev, TakipVerisi } from "@/lib/pazar/veri";
import { CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";

/**
 * PAZAR - Takip sekmesi (Burak Bey ekrani, 10.11.2026).
 * Kullanici: "Sayfa cok daginik; tutarli, duzenli, kolay okunabilir olmali. Burak Bey Pazar kisminda onundeki ekranda
 * gerekli takibi yapabilmeli." Uc soru, uc bolum:
 *  1) Bugun kim ne yapti?  -> kisi basina gunun gorevleri + durum (gonderildi / sonuc / atlandi + neden)
 *  2) Kim cevap verdi?     -> arsivden yakalanan son 14 gunun cevaplari + sistemin onerisi
 *  3) Kimi takip ediyoruz? -> suretcteki firmalar, sonraki hatirlatma tarihi (geciken kirmizi)
 * Veri: lib/pazar/veri.ts pazarTakipOku (pazar_takip RPC token'siz) + pazar_firmalar / pazar_temaslar.
 */

const NEDEN_ADI: Record<TakipGorev["neden"], string> = { hatirlatma1: "Hatırlatma 1", hatirlatma2: "Hatırlatma 2", siparissiz: "Siparişsiz", potansiyel: "Potansiyel" };
const SONUC_ADI: Record<string, string> = { cevap: "Cevap verdi", teklif: "Teklif istedi", siparis: "Sipariş verdi", ilgilenmiyor: "İlgilenmiyor" };
const ONERI_ADI: Record<string, string> = { teklif: "Teklif istedi", siparis: "Sipariş verdi", ilgilenmiyor: "İlgilenmiyor" };
const ASAMA_ADI: Record<string, string> = {
  sorgulandi: "Sorgulandı", hatirlatma1: "1. hatırlatma", hatirlatma2: "2. hatırlatma", cevap: "Cevap geldi", teklif: "Teklif istedi", siparis: "Sipariş verdi",
};
const SUREC = new Set(["sorgulandi", "hatirlatma1", "hatirlatma2", "cevap", "teklif", "siparis"]);

const gunTR = (t: string) => new Date(t.length === 10 ? `${t}T12:00:00` : t).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Istanbul" });
const saatTR = (t: string) => new Date(t).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });

function Bolum({ ikon, baslik, alt, children, testId }: { ikon: React.ReactNode; baslik: string; alt?: string; children: React.ReactNode; testId: string }) {
  return (
    <section className="rounded-xl border" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid={testId}>
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
        {ikon}
        <h2 className="text-sm font-semibold text-white">{baslik}</h2>
        {alt && <span className="text-xs" style={{ color: TEXT_MUTED }}>{alt}</span>}
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

export function PazarTakip({ takip, firmalar, temaslar, onFirma }: {
  takip: TakipVerisi; firmalar: PazarFirma[]; temaslar: PazarTemas[]; onFirma: (id: string) => void;
}) {
  const firmaAdi = useMemo(() => new Map(firmalar.map((f) => [f.id, f.ad])), [firmalar]);
  const bugunGorev = takip.gorevler.filter((g) => g.tarih === takip.bugun);
  const kisiler = takip.ekip.length ? takip.ekip : [{ kod: "", eposta: "", hitap: "Ekip", sira: 1, aktif: true }];
  const ondortGun = Date.now() - 14 * 86400000;
  const cevaplar = takip.gelenler.filter((g) => g.tur === "cevap" && Date.parse(g.tarih) >= ondortGun);
  const bugunStr = takip.bugun;
  const surec = useMemo(() => firmalar
    .filter((f) => SUREC.has(f.crm_asama))
    .sort((a, b) => (a.sonraki_adim || "9999").localeCompare(b.sonraki_adim || "9999") || (b.son_temas || "").localeCompare(a.son_temas || "")), [firmalar]);
  const sonIsleyen = useMemo(() => {
    const m = new Map<string, PazarTemas>();
    for (const t of temaslar) { const o = m.get(t.firma_id); if (!o || o.olusturma < t.olusturma) m.set(t.firma_id, t); }
    return m;
  }, [temaslar]);

  return (
    <div className="space-y-5">
      {/* 1) Bugun */}
      <Bolum testId="takip-bugun" ikon={<CalendarClock size={16} style={{ color: "#6EE7B7" }} />} baslik="Bugün" alt={`${gunTR(takip.bugun)} · kişi başına günlük görev`}>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {kisiler.map((k) => {
            const liste = bugunGorev.filter((g) => (k.kod ? g.atanan === k.kod : true)).sort((a, b) => a.sira - b.sira);
            const islenen = liste.filter((g) => g.durum !== "bekliyor").length;
            const hafta = takip.gorevler.filter((g) => (k.kod ? g.atanan === k.kod : true));
            const haftaGonderim = hafta.filter((g) => g.durum === "yapildi").length;
            const haftaAtla = hafta.filter((g) => g.durum === "atlandi").length;
            const oran = liste.length ? Math.round((islenen / liste.length) * 100) : 0;
            return (
              <div key={k.kod || "ekip"} className="rounded-lg border" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }} data-takip-kisi={k.kod}>
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white flex items-center gap-1.5"><UserRound size={14} style={{ color: "#6EE7B7" }} /> {k.hitap || k.eposta}</p>
                    {k.eposta && <p className="text-[11px] truncate" style={{ color: TEXT_MUTED }}>{k.eposta}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-semibold text-white tabular-nums" data-takip-ilerleme>{islenen}/{liste.length}</p>
                    <p className="text-[11px]" style={{ color: TEXT_MUTED }}>işlendi</p>
                  </div>
                </div>
                <div className="h-1 mx-3 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full" style={{ width: `${oran}%`, backgroundColor: "#10B981" }} />
                </div>
                {liste.length === 0 ? (
                  <p className="px-3 py-4 text-xs" style={{ color: TEXT_MUTED }}>Bugün görev yok (hafta sonu ya da sabah maili henüz gitmedi).</p>
                ) : (
                  <ul className="divide-y mt-2" style={{ borderColor: CARD_BORDER }}>
                    {liste.map((g) => (
                      <li key={`${g.tarih}-${g.atanan}-${g.sira}`} className="px-3 py-2 flex items-start gap-2 text-sm" style={{ borderColor: CARD_BORDER }} data-takip-gorev={g.durum}>
                        <span className="w-5 text-xs tabular-nums mt-0.5" style={{ color: TEXT_MUTED }}>{g.sira}</span>
                        <div className="flex-1 min-w-0">
                          <button type="button" onClick={() => onFirma(g.firma_id)} className="text-left text-white hover:underline leading-snug break-words">{firmaAdi.get(g.firma_id) || "—"}</button>
                          <div className="mt-0.5"><GorevDurumu g={g} /></div>
                        </div>
                        <span className="text-[11px] whitespace-nowrap mt-0.5" style={{ color: TEXT_MUTED }}>{NEDEN_ADI[g.neden]}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="px-3 py-2 text-[11px] border-t" style={{ color: TEXT_MUTED, borderColor: CARD_BORDER }}>
                  Son 7 gün: <b className="text-white">{haftaGonderim}</b> temas · <b className="text-white">{haftaAtla}</b> atlama
                </p>
              </div>
            );
          })}
        </div>
      </Bolum>

      {/* 2) Gelen cevaplar */}
      <Bolum testId="takip-cevaplar" ikon={<Inbox size={16} style={{ color: "#93C5FD" }} />} baslik="Gelen cevaplar" alt={`son 14 gün · ${cevaplar.length}`}>
        {cevaplar.length === 0 ? (
          <p className="px-4 py-5 text-xs" style={{ color: TEXT_MUTED }}>Son 14 günde müşteriden cevap yakalanmadı. Arşiv 10 dakikada bir taranıyor.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: CARD_BORDER }}>
            {cevaplar.slice(0, 20).map((c) => (
              <li key={c.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4" style={{ borderColor: CARD_BORDER }} data-takip-cevap>
                <span className="text-xs whitespace-nowrap sm:w-24 shrink-0" style={{ color: TEXT_MUTED }}>{gunTR(c.tarih)} {saatTR(c.tarih)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => onFirma(c.firma_id)} className="text-sm text-white font-medium hover:underline text-left">{firmaAdi.get(c.firma_id) || c.gonderen}</button>
                    {c.oneri && <span className="inline-flex h-5 items-center px-2 rounded-full text-[11px] font-medium" style={{ backgroundColor: "rgba(96,165,250,0.14)", color: "#93C5FD" }} data-takip-oneri>{ONERI_ADI[c.oneri]}</span>}
                  </div>
                  {c.konu && <p className="text-xs mt-0.5 break-words" style={{ color: "#C9D1DC" }}>{c.konu}</p>}
                  {c.ozet && <p className="text-xs mt-0.5 line-clamp-2 break-words" style={{ color: TEXT_MUTED }}>{c.ozet}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Bolum>

      {/* 3) Surecteki firmalar */}
      <Bolum testId="takip-surec" ikon={<CheckCircle2 size={16} style={{ color: "#FCD34D" }} />} baslik="Süreçteki firmalar" alt={`${surec.length} firma · sonraki adım tarihine göre`}>
        {surec.length === 0 ? (
          <p className="px-4 py-5 text-xs" style={{ color: TEXT_MUTED }}>Henüz süreçte firma yok. İlk sipariş sorgulaması gönderilince burada görünür.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
                <tr className="text-xs">
                  <th className="text-left font-medium px-4 py-2">Firma</th>
                  <th className="text-left font-medium px-3 py-2">Aşama</th>
                  <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">Son temas</th>
                  <th className="text-left font-medium px-3 py-2">Sonraki</th>
                </tr>
              </thead>
              <tbody>
                {surec.map((f) => {
                  const t = sonIsleyen.get(f.id);
                  const geciken = !!f.sonraki_adim && f.sonraki_adim < bugunStr;
                  const bugun = f.sonraki_adim === bugunStr;
                  const sahipte = ["cevap", "teklif", "siparis"].includes(f.crm_asama);
                  return (
                    <tr key={f.id} className="border-t align-top cursor-pointer hover:bg-white/[0.02]" style={{ borderColor: CARD_BORDER }} onClick={() => onFirma(f.id)} data-takip-surec={f.crm_asama}>
                      <td className="px-4 py-2 text-white">{f.ad}<span className="ml-2 text-[11px]" style={{ color: TEXT_MUTED }}>{f.durum === "musteri" ? "müşteri" : "potansiyel"}</span></td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: sahipte ? "#93C5FD" : "#FCD34D" }}>{ASAMA_ADI[f.crm_asama]}</td>
                      <td className="px-3 py-2 text-xs hidden sm:table-cell" style={{ color: "#C9D1DC" }}>
                        {f.son_temas ? gunTR(f.son_temas) : "—"}{t?.isleyen ? <span style={{ color: TEXT_MUTED }}> · {t.isleyen}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: geciken ? "#FCA5A5" : bugun ? "#FCD34D" : "#C9D1DC" }}>
                        {sahipte ? "Takip sizde" : f.sonraki_adim ? `${gunTR(f.sonraki_adim)}${geciken ? " · gecikti" : bugun ? " · bugün" : ""}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Bolum>
    </div>
  );
}
