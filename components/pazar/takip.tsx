"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle, BellRing, CircleDashed, FileText, Globe2, Inbox, Mail, MessageCircle, ShoppingCart, SkipForward, ThumbsDown, ThumbsUp, UserRound, Users,
} from "lucide-react";
import type { PazarFirma, PazarKisi, PazarTemas, TakipGorev, TakipVerisi } from "@/lib/pazar/veri";
import { ulkeGosterim } from "@/lib/pazar/veri";
import { aksiyonlar, ekipOzeti, huni, ulkeOzeti, type Aksiyon } from "@/lib/pazar/panel";
import { UlkeBayrak } from "@/components/ulke-bayrak";
import { CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED } from "@/lib/theme";

/**
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

function Metrik({ etiket, deger, alt, renk }: { etiket: string; deger: number | string; alt?: string; renk?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] truncate" style={{ color: TEXT_MUTED }}>{etiket}</p>
      <p className="text-base font-semibold tabular-nums" style={{ color: renk || "#FFFFFF" }}>{deger}</p>
      {alt && <p className="text-[10px] tabular-nums" style={{ color: TEXT_MUTED }}>{alt}</p>}
    </div>
  );
}

export function PazarTakip({ takip, firmalar, kisiler, temaslar, onFirma, onUlke }: {
  takip: TakipVerisi; firmalar: PazarFirma[]; kisiler: PazarKisi[]; temaslar: PazarTemas[];
  onFirma: (id: string) => void; onUlke: (ulke: string) => void;
}) {
  const firma = useMemo(() => new Map(firmalar.map((f) => [f.id, f])), [firmalar]);
  const epostali = useMemo(() => new Set(kisiler.filter((k) => k.eposta && k.eposta_gecerli).map((k) => k.firma_id)), [kisiler]);
  const ekipAdi = useMemo(() => new Map(takip.ekip.map((e) => [e.kod, e.hitap || e.eposta])), [takip.ekip]);
  const girdi = { bugun: takip.bugun, firmalar, temaslar, gelenler: takip.gelenler, gorevler: takip.gorevler };
  const aksiyon = useMemo(() => aksiyonlar(girdi), [takip, firmalar, temaslar]); // eslint-disable-line react-hooks/exhaustive-deps
  const ekip = useMemo(() => ekipOzeti({ ...girdi, ekip: takip.ekip }), [takip, firmalar, temaslar]); // eslint-disable-line react-hooks/exhaustive-deps
  const asamalar = useMemo(() => huni(firmalar, epostali), [firmalar, epostali]);
  const ulkeler = useMemo(() => ulkeOzeti({ firmalar, temaslar, gelenler: takip.gelenler, epostali }), [firmalar, temaslar, takip.gelenler, epostali]);
  const [acikAsama, setAcikAsama] = useState<string | null>(null);
  const [tumUlkeler, setTumUlkeler] = useState(false);
  const [tumAksiyon, setTumAksiyon] = useState(false);
  const bugunGorev = takip.gorevler.filter((g) => g.tarih === takip.bugun);
  const toplam = ekip.reduce((t, k) => ({ ulasilan: t.ulasilan + k.ulasilan, cevap: t.cevap + k.cevap }), { ulasilan: 0, cevap: 0 });
  const acik = acikAsama ? asamalar.find((a) => a.kod === acikAsama) || null : null;
  const gosterilenAksiyon = tumAksiyon ? aksiyon : aksiyon.slice(0, 8);

  return (
    <div className="space-y-5">
      {/* 1) Aksiyon bekleyenler */}
      <Bolum testId="panel-aksiyon" ikon={<BellRing size={16} style={{ color: aksiyon.length ? "#FCD34D" : "#6EE7B7" }} />} baslik="Aksiyon bekleyenler"
        alt={aksiyon.length ? `${aksiyon.length} firma · cevap / teklif / işlenmeyen görev` : "son 14 gün"}>
        {aksiyon.length === 0 ? (
          <p className="px-4 py-5 text-xs" style={{ color: TEXT_MUTED }} data-panel-bos>
            Bekleyen aksiyon yok. Tanıtım maillerine cevap gelince, teklif istendiğinde ya da bir görev işlenmeden kalınca burada görünür.
          </p>
        ) : (
          <>
            <ul className="divide-y" style={{ borderColor: CARD_BORDER }}>
              {gosterilenAksiyon.map((a) => {
                const f = firma.get(a.firma_id);
                const s = AKSIYON[a.tur];
                return (
                  <li key={`${a.tur}-${a.firma_id}`} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 cursor-pointer hover:bg-white/[0.02]" style={{ borderColor: CARD_BORDER }}
                    onClick={() => onFirma(a.firma_id)} data-panel-aksiyon={a.tur}>
                    <span className="inline-flex h-5 w-fit items-center px-2 rounded-full text-[11px] font-medium shrink-0 sm:w-20 justify-center" style={{ backgroundColor: s.bg, color: s.renk }}>{s.etiket}</span>
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
              <button type="button" onClick={() => setTumAksiyon(!tumAksiyon)} className="w-full px-4 py-2 text-xs border-t hover:bg-white/[0.03]" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }}>
                {tumAksiyon ? "Daha az göster" : `Tümünü göster (${aksiyon.length})`}
              </button>
            )}
          </>
        )}
      </Bolum>

      {/* 2) Ekip */}
      <Bolum testId="panel-ekip" ikon={<Users size={16} style={{ color: "#6EE7B7" }} />} baslik="Ekip"
        alt={`bugün ${gunTR(takip.bugun)} · son 30 gün: ${toplam.ulasilan} firmaya ulaşıldı, ${toplam.cevap} dönüş (${oran(toplam.cevap, toplam.ulasilan)})`}>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {ekip.map((k) => {
            const liste = bugunGorev.filter((g) => (k.kod ? g.atanan === k.kod : true)).sort((a, b) => a.sira - b.sira);
            const yuzde = k.bugunToplam ? Math.round((k.bugunIslenen / k.bugunToplam) * 100) : 0;
            return (
              <div key={k.kod || "ekip"} className="rounded-lg border" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }} data-takip-kisi={k.kod}>
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <p className="text-sm font-semibold text-white flex items-center gap-1.5 min-w-0 truncate"><UserRound size={14} style={{ color: "#6EE7B7" }} /> {k.ad}</p>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-semibold text-white tabular-nums" data-takip-ilerleme>{k.bugunIslenen}/{k.bugunToplam}</p>
                    <p className="text-[11px]" style={{ color: TEXT_MUTED }}>bugün işlendi</p>
                  </div>
                </div>
                <div className="h-1 mx-3 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full" style={{ width: `${yuzde}%`, backgroundColor: "#10B981" }} />
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 px-3 py-3" data-ekip-huni>
                  <Metrik etiket="Görev" deger={k.gorev} alt="30 gün" />
                  <Metrik etiket="İşlenen" deger={k.islenen} alt={k.atlanan ? `${k.atlanan} atlandı` : oran(k.islenen, k.gorev)} />
                  <Metrik etiket="Ulaşılan" deger={k.ulasilan} alt="firma" />
                  <Metrik etiket="Dönüş" deger={k.cevap} alt={oran(k.cevap, k.ulasilan)} renk={k.cevap ? "#93C5FD" : undefined} />
                  <Metrik etiket="Teklif" deger={k.teklif} renk={k.teklif ? "#C4B5FD" : undefined} />
                  <Metrik etiket="Sipariş" deger={k.siparis} renk={k.siparis ? "#6EE7B7" : undefined} />
                </div>
                {k.islenmeyen > 0 && (
                  <p className="mx-3 mb-2 flex items-center gap-1.5 text-[11px]" style={{ color: "#FCA5A5" }} data-ekip-islenmeyen>
                    <AlertTriangle size={12} /> Son 30 günde {k.islenmeyen} görev işlenmeden kaldı
                  </p>
                )}
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

      {/* 3) Surec */}
      <Bolum testId="panel-surec" ikon={<Inbox size={16} style={{ color: "#FCD34D" }} />} baslik="Süreç" alt="aşamaya tıklayınca firmalar listelenir">
        <div className="p-4">
          <div className="flex flex-wrap gap-2" role="tablist">
            {asamalar.map((a) => (
              <button key={a.kod} type="button" role="tab" aria-selected={acikAsama === a.kod} onClick={() => setAcikAsama(acikAsama === a.kod ? null : a.kod)} data-surec-asama={a.kod}
                className="rounded-lg border px-3 py-2 text-left min-w-[104px] transition-colors hover:bg-white/[0.03]"
                style={{ borderColor: acikAsama === a.kod ? "rgba(16,185,129,0.6)" : CARD_BORDER, backgroundColor: acikAsama === a.kod ? "rgba(16,185,129,0.10)" : ROW_HEADER_BG, opacity: a.yan ? 0.85 : 1 }}>
                <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{a.ad}</p>
                <p className="text-lg font-semibold text-white tabular-nums" data-deger>{a.adet}</p>
              </button>
            ))}
          </div>
          {acik && (
            <div className="mt-3 rounded-lg border overflow-hidden" style={{ borderColor: CARD_BORDER }} data-surec-liste={acik.kod}>
              {acik.adet === 0 ? (
                <p className="px-3 py-3 text-xs" style={{ color: TEXT_MUTED }}>Bu aşamada firma yok.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0" style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
                      <tr><th className="text-left font-medium px-3 py-2">Firma</th><th className="text-left font-medium px-3 py-2">Ülke</th><th className="text-left font-medium px-3 py-2">Son temas</th><th className="text-left font-medium px-3 py-2">Sonraki adım</th></tr>
                    </thead>
                    <tbody>
                      {acik.firmaIdleri.slice(0, 300).map((id) => firma.get(id)).filter((f): f is PazarFirma => !!f)
                        .sort((a, b) => (a.sonraki_adim || "9999").localeCompare(b.sonraki_adim || "9999") || a.ad.localeCompare(b.ad, "tr"))
                        .map((f) => (
                          <tr key={f.id} className="border-t cursor-pointer hover:bg-white/[0.02]" style={{ borderColor: CARD_BORDER }} onClick={() => onFirma(f.id)}>
                            <td className="px-3 py-1.5 text-white">{f.ad}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "#C9D1DC" }}>{f.ulke ? ulkeGosterim(f.ulke) : "—"}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "#C9D1DC" }}>{f.son_temas ? gunTR(f.son_temas) : "—"}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: f.sonraki_adim && f.sonraki_adim < takip.bugun ? "#FCA5A5" : "#C9D1DC" }}>
                              {f.sonraki_adim ? gunTR(f.sonraki_adim) : f.bekleme_bitis ? `${gunTR(f.bekleme_bitis)} sonra yeniden` : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {acik.adet > 300 && <p className="px-3 py-2 text-[11px] border-t" style={{ color: TEXT_MUTED, borderColor: CARD_BORDER }}>İlk 300 firma gösteriliyor ({acik.adet}).</p>}
                </div>
              )}
            </div>
          )}
        </div>
      </Bolum>

      {/* 4) Ulkeler */}
      <Bolum testId="panel-ulkeler" ikon={<Globe2 size={16} style={{ color: "#93C5FD" }} />} baslik="Ülkelere göre pazar" alt={`${ulkeler.filter((u) => u.ulke !== "—").length} ülke · ülkeye tıklayınca potansiyel listesi açılır`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="panel-ulke-tablo">
            <thead style={{ backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
              <tr className="text-xs">
                <th className="text-left font-medium px-4 py-2">Ülke</th>
                <th className="text-right font-medium px-3 py-2">Müşteri</th>
                <th className="text-right font-medium px-3 py-2">Potansiyel</th>
                <th className="text-right font-medium px-3 py-2 hidden sm:table-cell">E-postalı</th>
                <th className="text-right font-medium px-3 py-2">Ulaşılan</th>
                <th className="text-right font-medium px-3 py-2">Dönüş</th>
                <th className="text-right font-medium px-4 py-2 hidden md:table-cell">Son temas</th>
              </tr>
            </thead>
            <tbody>
              {(tumUlkeler ? ulkeler : ulkeler.slice(0, 12)).map((u) => (
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
        </div>
        {ulkeler.length > 12 && (
          <button type="button" onClick={() => setTumUlkeler(!tumUlkeler)} className="w-full px-4 py-2 text-xs border-t hover:bg-white/[0.03]" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }} data-panel-ulke-tumu>
            {tumUlkeler ? "Daha az göster" : `Tüm ülkeler (${ulkeler.length})`}
          </button>
        )}
      </Bolum>
    </div>
  );
}
