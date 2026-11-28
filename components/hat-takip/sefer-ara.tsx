"use client";
/**
 * HAT TAKIP Asama 4 (28.11.2026): Sefer Ara sekmesi. Hapag-Lloyd Commercial Schedules -> gemi listesi; secilen seferler
 * musteri gorseline (SeferKarti) girer ve tek tikla PNG olarak kopyalanir / indirilir. YALNIZ GORUNTU: sistem kayitlarina
 * yazmaz, mail yok. Sorgu: lib/hat-takip/veri.ts seferAra (edge hat-takip, 6 saat onbellek, saatlik kota).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, Check, Copy, Download, Loader2, RefreshCw, Search, Ship } from "lucide-react";
import { CARD_BG, CARD_BORDER, ROW_HEADER_BG, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { EmptyState } from "@/components/empty-state";
import { seferAra, varisLimanlariOku, type SeferAramaSonucu } from "@/lib/hat-takip/veri";
import { CIKIS_LIMANLARI, LIMAN_KODU_DESENI, VARIS_KODLARI, limanAdi, sistemVarisLimanlari, type LimanSecenegi } from "@/lib/hat-takip/limanlar";
import { aktarmaYazisi, basHarf, cutoffGecti, kisaZaman, tarihYaz, varsayilanSecim, yerelTarih } from "@/lib/hat-takip/sefer-gorunum";
import { gorselDosyaAdi, ogeyiPngYap, pngIndir, pngKopyalaYaDaIndir } from "@/lib/hat-takip/gorsel";
import { onceYazi } from "@/lib/hat-takip/gorunum";
import { SeferKarti, type SeferKartiAyar } from "@/components/hat-takip/sefer-karti";

const GIRDI = "h-9 rounded-lg border px-2.5 text-sm text-white outline-none focus:border-emerald-500/60";
const GIRDI_STIL = { borderColor: CARD_BORDER, backgroundColor: CARD_BG } as const;
const HAFTALAR = [2, 4, 6, 8];
const KART_EN_FAZLA = 8;

/** Sozluk tekil (ayni kod iki anahtarla: DAR ES SALAAM / DAR SALAAM) */
const TUM_VARISLAR: LimanSecenegi[] = Array.from(new Map(Object.values(VARIS_KODLARI).map((l) => [l.kod, l])).values()).sort((a, b) => a.ad.localeCompare(b.ad));

export function SeferAra() {
  const [pol, setPol] = useState("TRIST");
  const [pod, setPod] = useState("");
  const [elleKod, setElleKod] = useState("");
  const [hafta, setHafta] = useState(4);
  const [sistemLimanlari, setSistemLimanlari] = useState<(LimanSecenegi & { adet: number })[]>([]);
  const [sonuc, setSonuc] = useState<SeferAramaSonucu | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [secili, setSecili] = useState<string[]>([]);
  const [ayar, setAyar] = useState<SeferKartiAyar>({ cutoff: false, hat: true });
  const [gorselDurum, setGorselDurum] = useState<{ tur: "bekle" | "kopyalandi" | "indirildi" | "hata"; metin?: string } | null>(null);
  const kartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let iptal = false;
    varisLimanlariOku()
      .then((l) => { if (!iptal) setSistemLimanlari(sistemVarisLimanlari(l).secenekler); })
      .catch(() => { /* liste olmadan da tum limanlar secilebilir */ });
    return () => { iptal = true; };
  }, []);

  const hedefKod = (elleKod.trim() ? elleKod.trim().toUpperCase() : pod) || "";
  const kodGecerli = LIMAN_KODU_DESENI.test(hedefKod) && LIMAN_KODU_DESENI.test(pol) && hedefKod !== pol;

  const getir = useCallback(async (yenile = false) => {
    if (!kodGecerli) return;
    setYukleniyor(true); setHata(null); setGorselDurum(null);
    try {
      const s = await seferAra({ pol, pod: hedefKod, hafta, yenile });
      setSonuc(s);
      setSecili(varsayilanSecim(s.rotalar, 6));
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Sefer programı alınamadı.");
      if (!yenile) setSonuc(null);
    } finally {
      setYukleniyor(false);
    }
  }, [kodGecerli, pol, hedefKod, hafta]);

  const rotalar = useMemo(() => sonuc?.rotalar ?? [], [sonuc]);
  const kartSeferleri = useMemo(() => rotalar.filter((r) => secili.includes(r.anahtar)).slice(0, KART_EN_FAZLA), [rotalar, secili]);
  const polBilgi = limanAdi(sonuc?.pol);
  const podBilgi = limanAdi(sonuc?.pod);
  // Musteri gorselindeki adlar (EN): sozlukten, yoksa Hapag'in dondurdugu ad
  const polEn = sonuc ? (sonuc.pol.startsWith("TR") ? `${basHarf(rotalar[0]?.pol_adi) || polBilgi?.ad.split(" ")[0] || sonuc.pol}, Türkiye` : basHarf(rotalar[0]?.pol_adi) || sonuc.pol) : "";
  const podEn = sonuc ? (podBilgi ? `${podBilgi.ad}, ${podBilgi.ulke}` : basHarf(rotalar[0]?.pod_adi) || sonuc.pod) : "";

  const secimDegistir = (anahtar: string) => {
    setGorselDurum(null);
    setSecili((s) => (s.includes(anahtar) ? s.filter((x) => x !== anahtar) : [...s, anahtar]));
  };

  const kopyala = async () => {
    if (!kartRef.current || !sonuc) return;
    setGorselDurum({ tur: "bekle" });
    try {
      const r = await pngKopyalaYaDaIndir(kartRef.current, gorselDosyaAdi(sonuc.pol, sonuc.pod, sonuc.bas_gun));
      setGorselDurum({ tur: r, metin: r === "kopyalandi" ? "Görsel panoya kopyalandı. WhatsApp ya da e-postaya yapıştırabilirsiniz (Ctrl+V)." : "Tarayıcı panoya kopyalamaya izin vermedi; PNG indirildi." });
    } catch (e) {
      setGorselDurum({ tur: "hata", metin: e instanceof Error ? e.message : "Görsel oluşturulamadı." });
    }
  };
  const indir = async () => {
    if (!kartRef.current || !sonuc) return;
    setGorselDurum({ tur: "bekle" });
    try {
      pngIndir(await ogeyiPngYap(kartRef.current), gorselDosyaAdi(sonuc.pol, sonuc.pod, sonuc.bas_gun));
      setGorselDurum({ tur: "indirildi", metin: "PNG indirildi." });
    } catch (e) {
      setGorselDurum({ tur: "hata", metin: e instanceof Error ? e.message : "Görsel oluşturulamadı." });
    }
  };

  return (
    <div data-testid="sefer-ara">
      {/* Arama */}
      <form className="rounded-xl border p-3 mb-4 flex flex-wrap items-end gap-3" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}
        onSubmit={(e) => { e.preventDefault(); getir(false); }}>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: TEXT_MUTED }}>
          Çıkış limanı
          <select value={pol} onChange={(e) => setPol(e.target.value)} className={`${GIRDI} min-w-[260px]`} style={GIRDI_STIL} aria-label="Çıkış limanı">
            {CIKIS_LIMANLARI.map((l) => <option key={l.kod} value={l.kod}>{l.ad} · {l.kod}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: TEXT_MUTED }}>
          Varış limanı
          <select value={pod} onChange={(e) => { setPod(e.target.value); setElleKod(""); }} className={`${GIRDI} min-w-[240px]`} style={GIRDI_STIL} aria-label="Varış limanı">
            <option value="">Seçin…</option>
            {sistemLimanlari.length > 0 && (
              <optgroup label="Sevkiyat yaptığımız limanlar">
                {sistemLimanlari.map((l) => <option key={`s-${l.kod}`} value={l.kod}>{l.ad} ({l.ulke}) · {l.kod} — {l.adet} dosya</option>)}
              </optgroup>
            )}
            <optgroup label="Tüm limanlar">
              {TUM_VARISLAR.map((l) => <option key={l.kod} value={l.kod}>{l.ad} ({l.ulke}) · {l.kod}</option>)}
            </optgroup>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: TEXT_MUTED }} title="Listede olmayan liman için 5 karakterlik UN/LOCODE (örnek: NGAPP)">
          veya liman kodu
          <input value={elleKod} onChange={(e) => setElleKod(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))} placeholder="UN/LOCODE"
            className={`${GIRDI} w-[110px] font-mono uppercase`} style={GIRDI_STIL} aria-label="Liman kodu" />
        </label>
        <label className="flex flex-col gap-1 text-[11px]" style={{ color: TEXT_MUTED }}>
          Dönem
          <select value={hafta} onChange={(e) => setHafta(Number(e.target.value))} className={GIRDI} style={GIRDI_STIL} aria-label="Dönem">
            {HAFTALAR.map((h) => <option key={h} value={h}>Önümüzdeki {h} hafta</option>)}
          </select>
        </label>
        <button type="submit" disabled={!kodGecerli || yukleniyor} data-testid="sefer-getir"
          className="h-9 px-4 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
          {yukleniyor ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Seferleri getir
        </button>
        {sonuc && (
          <button type="button" onClick={() => getir(true)} disabled={yukleniyor} title="Hapag-Lloyd'a yeniden sor (en erken 15 dk sonra)"
            className="h-9 px-3 rounded-lg border text-sm text-white inline-flex items-center gap-2 disabled:opacity-60 hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER }}>
            <RefreshCw size={14} className={yukleniyor ? "animate-spin" : ""} /> Yenile
          </button>
        )}
      </form>

      {hata && <p className="mb-3 text-sm text-red-300 flex items-center gap-2" role="alert"><AlertTriangle size={14} /> {hata}</p>}

      {!sonuc ? (
        !hata && <EmptyState icon={<Ship size={40} />} title="Rota seçip seferleri getirin" description="Hapag-Lloyd'un güncel sefer programı: gemi, sefer, kalkış / varış, transit süresi, aktarma ve cut-off saatleri." />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs" style={{ color: TEXT_MUTED }}>
            <span>
              <span className="text-white font-medium">{polBilgi?.ad ?? sonuc.pol} → {podBilgi ? `${podBilgi.ad} (${podBilgi.ulke})` : sonuc.pod}</span>
              {" · "}{rotalar.length} sefer · {tarihYaz(sonuc.bas_gun)} – {tarihYaz(sonuc.bit_gun)}
            </span>
            <span className="inline-flex items-center gap-1.5"><CalendarClock size={12} /> Hapag-Lloyd · {onceYazi(sonuc.sorgu_zamani)} sorgulandı{sonuc.onbellek ? " (kayıtlı sonuç)" : ""}{sonuc.not ? ` · ${sonuc.not}` : ""}</span>
          </div>

          {rotalar.length === 0 ? (
            <EmptyState icon={<Ship size={36} />} title="Bu dönemde sefer bulunamadı" description="Hapag-Lloyd bu rota için seçilen dönemde sefer yayınlamıyor. Dönemi uzatmayı ya da başka bir çıkış limanını deneyin." />
          ) : (
            <div className="rounded-xl border overflow-x-auto mb-5" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <table className="w-full text-sm" data-testid="sefer-tablosu">
                <thead>
                  <tr className="text-xs" style={{ color: TEXT_MUTED, backgroundColor: ROW_HEADER_BG }}>
                    <th className="w-10 px-3 py-2 text-left font-medium" title="Müşteri görseline ekle">Görsel</th>
                    <th className="text-left font-medium px-3 py-2">Kalkış (ETD)</th>
                    <th className="text-left font-medium px-3 py-2">Gemi / Sefer</th>
                    <th className="text-left font-medium px-3 py-2">Servis</th>
                    <th className="text-left font-medium px-3 py-2">Varış (ETA)</th>
                    <th className="text-left font-medium px-3 py-2">Transit</th>
                    <th className="text-left font-medium px-3 py-2">Rota</th>
                    <th className="text-left font-medium px-3 py-2">Cut-off (doküman · VGM · konteyner)</th>
                  </tr>
                </thead>
                <tbody>
                  {rotalar.map((s) => {
                    const gecti = cutoffGecti(s);
                    const sec = secili.includes(s.anahtar);
                    const k = yerelTarih(s.kalkis);
                    return (
                      <tr key={s.anahtar} className="border-t hover:bg-white/[0.02]" style={{ borderColor: CARD_BORDER, opacity: gecti && !sec ? 0.55 : 1 }} data-testid="sefer-satir">
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={sec} onChange={() => secimDegistir(s.anahtar)} aria-label={`${s.gemi ?? "sefer"} görsele ekle`} className="h-4 w-4 accent-emerald-500" />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="text-white font-medium">{tarihYaz(s.kalkis, "tr", true)}</div>
                          <div className="text-[11px]" style={{ color: TEXT_MUTED }}>{k?.saat ?? ""}{s.terminal ? ` · ${s.terminal}` : ""}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-white font-medium">{s.gemi || "—"}</div>
                          <div className="text-[11px] font-mono whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.sefer || "—"}{s.bacaklar[0]?.imo ? ` · IMO ${s.bacaklar[0].imo}` : ""}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-white">{s.servis_kodu || "—"}</div>
                          <div className="text-[11px] truncate max-w-[170px]" style={{ color: TEXT_MUTED }} title={s.servis ?? undefined}>{basHarf(s.servis)}</div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-white">{tarihYaz(s.varis, "tr", true)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium" style={{ backgroundColor: "rgba(16,185,129,0.14)", color: "#6EE7B7" }}>{s.transit_gun ?? "—"} gün</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-white text-xs">{aktarmaYazisi(s, "tr")}</div>
                          {s.bacaklar.filter((b) => b.tur === "VESSEL").length > 1 && (
                            <div className="text-[11px]" style={{ color: TEXT_MUTED }}>{s.bacaklar.filter((b) => b.tur === "VESSEL").slice(1).map((b) => b.gemi || "?").join(" → ")}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs tabular-nums">
                          {gecti ? (
                            <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium" style={{ backgroundColor: "rgba(239,68,68,0.14)", color: "#FCA5A5" }}>Cut-off geçti</span>
                          ) : (
                            <span className="text-white">{kisaZaman(s.cutoff.dokuman)} <span style={{ color: TEXT_MUTED }}>·</span> {kisaZaman(s.cutoff.vgm)} <span style={{ color: TEXT_MUTED }}>·</span> {kisaZaman(s.cutoff.konteyner)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Musteri gorseli */}
          {rotalar.length > 0 && (
            <section className="rounded-xl border p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="sefer-gorsel-bolumu">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Müşteri görseli</h3>
                  <p className="text-[11px]" style={{ color: TEXT_MUTED }}>
                    Tablodan işaretlenen seferler (en fazla {KART_EN_FAZLA}) · İngilizce · müşteri / fiyat bilgisi içermez
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "#C9D1DC" }}>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={ayar.cutoff} onChange={(e) => { setAyar((a) => ({ ...a, cutoff: e.target.checked })); setGorselDurum(null); }} className="h-3.5 w-3.5 accent-emerald-500" /> Doküman cut-off
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={ayar.hat} onChange={(e) => { setAyar((a) => ({ ...a, hat: e.target.checked })); setGorselDurum(null); }} className="h-3.5 w-3.5 accent-emerald-500" /> Hat adı (Hapag-Lloyd)
                  </label>
                  <button type="button" onClick={kopyala} disabled={!kartSeferleri.length || gorselDurum?.tur === "bekle"} data-testid="gorsel-kopyala"
                    className="h-9 px-3 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
                    {gorselDurum?.tur === "bekle" ? <Loader2 size={14} className="animate-spin" /> : gorselDurum?.tur === "kopyalandi" ? <Check size={14} /> : <Copy size={14} />} Görseli kopyala
                  </button>
                  <button type="button" onClick={indir} disabled={!kartSeferleri.length || gorselDurum?.tur === "bekle"} data-testid="gorsel-indir"
                    className="h-9 px-3 rounded-lg border text-sm text-white inline-flex items-center gap-2 disabled:opacity-50 hover:bg-white/[0.04]" style={{ borderColor: CARD_BORDER }}>
                    <Download size={14} /> PNG indir
                  </button>
                </div>
              </div>
              {gorselDurum?.metin && (
                <p className={`mb-3 text-xs ${gorselDurum.tur === "hata" ? "text-red-300" : "text-emerald-300"}`} role="status">{gorselDurum.metin}</p>
              )}
              {kartSeferleri.length === 0 ? (
                <p className="text-xs py-6 text-center" style={{ color: TEXT_MUTED }}>Görsele eklemek için tablodan en az bir sefer işaretleyin.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg p-3" style={{ backgroundColor: "#0B0F14" }}>
                  <div className="mx-auto w-fit shadow-xl">
                    <SeferKarti ref={kartRef} seferler={kartSeferleri} polAdi={polEn} podAdi={podEn} pol={sonuc.pol} pod={sonuc.pod} sorguZamani={sonuc.sorgu_zamani} ayar={ayar} />
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
