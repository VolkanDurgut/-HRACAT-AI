"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, Lock } from "lucide-react";
import { spekBilgisi, spekleriOnayla, type SpekBilgisi, type SpekSonucu } from "@/lib/siparis-formu-secim-api";
import { ACCENT, CARD_BG, CARD_BORDER, PAGE_BG, TEXT_MUTED } from "@/lib/theme";

/**
 * SIPARIS BILDIRIM FORMU - EXPORT SPEK ONAY SAYFASI (23.11.2026). GIRISSIZ (sabah mailindeki token, 3 gun).
 * Kullanici: "Urun speklerini lojistik bilemez. O yuzden bunlari export onaylayacak."
 * Her yukleme icin onerilen spek (musterinin kalite ayari) duzenlenebilir; "Onayla" forma yazar, lojistik o formu gonderebilir.
 * Liste her acilista GUNCEL hesaplanir (edge siparis-formu-spek). Test modunda onay kaydedilmez; sayfanin ustunde yazar.
 */

const trTarih = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "-");
const kart = "rounded-xl border";
const kartStil = { backgroundColor: CARD_BG, borderColor: CARD_BORDER };

export default function SpekOnaySayfasi() {
  const { token } = useParams<{ token: string }>();
  const [bilgi, setBilgi] = useState<SpekBilgisi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [metin, setMetin] = useState<Record<string, string>>({});
  const [isleniyor, setIsleniyor] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<{ satirlar: SpekSonucu[]; test: boolean } | null>(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const c = await spekBilgisi(String(token || ""));
    if (c.ok) {
      setBilgi(c.veri); setHata(null);
      setMetin((x) => Object.fromEntries(c.veri.satirlar.map((s) => [s.anahtar, x[s.anahtar] ?? s.oneri])));
    } else setHata(c.hata);
    setYukleniyor(false);
  }, [token]);
  useEffect(() => { void yukle(); }, [yukle]);

  const onayla = async (anahtarlar: string[]) => {
    if (!anahtarlar.length) return;
    setIsleniyor(anahtarlar.length > 1 ? "hepsi" : anahtarlar[0]); setSonuc(null);
    const c = await spekleriOnayla(String(token), anahtarlar.map((a) => ({ booking: a, spekler: metin[a] || "" })));
    setIsleniyor(null);
    if (!c.ok) { setSonuc({ satirlar: [{ booking: "", atlandi: c.hata }], test: !!bilgi?.test }); return; }
    setSonuc({ satirlar: c.veri.sonuclar, test: c.veri.test });
    await yukle();
  };

  if (yukleniyor && !bilgi) {
    return <div className="min-h-screen flex items-center justify-center text-white" style={{ backgroundColor: PAGE_BG }}><Loader2 className="animate-spin" size={22} style={{ color: ACCENT }} /></div>;
  }
  if (hata && !bilgi) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-white" style={{ backgroundColor: PAGE_BG }}>
        <div className={`${kart} max-w-md w-full p-6 text-center`} style={kartStil}>
          <Lock className="mx-auto mb-3" size={26} style={{ color: TEXT_MUTED }} />
          <p className="text-sm">{hata}</p>
        </div>
      </div>
    );
  }
  if (!bilgi) return null;
  const ad = new Map(bilgi.satirlar.map((s) => [s.anahtar, `${s.firma} · ${s.liman} · ${s.adet}`]));

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: PAGE_BG }}>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <header className="flex items-start justify-between gap-3 border-b pb-4" style={{ borderColor: CARD_BORDER }}>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: TEXT_MUTED }}>UNEX-AI · Export</div>
            <h1 className="text-lg sm:text-xl font-semibold mt-1">Ürün speki onayı bekleyen yüklemeler</h1>
            <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>Onaylanan spek sipariş bildirim formuna yazılır; lojistik formu üretime gönderebilir · {trTarih(bilgi.tarih)}</p>
          </div>
          <ClipboardCheck size={26} style={{ color: ACCENT }} className="shrink-0" />
        </header>

        {bilgi.test && (
          <div className="mt-4 rounded-lg border px-3 py-2 text-xs flex items-start gap-2" style={{ borderColor: "rgba(245,158,11,0.45)", backgroundColor: "rgba(245,158,11,0.08)", color: "#FCD34D" }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span><b>TEST</b> · Onaylanan spekler kaydedilmez; canlıya alınınca forma yazılır.</span>
          </div>
        )}

        {sonuc && (
          <div className={`${kart} mt-4 p-3`} style={kartStil}>
            <ul className="space-y-1">
              {sonuc.satirlar.map((s, i) => (
                <li key={`${s.booking}-${i}`} className="text-xs flex items-start gap-2">
                  {s.onaylandi ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" style={{ color: ACCENT }} /> : <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />}
                  <span>{s.booking ? <span className="text-white">{ad.get(s.booking) || s.booking} — </span> : null}{s.onaylandi ? "spek onaylandı, forma yazıldı" : s.atlandi}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          <span className="text-xs" style={{ color: TEXT_MUTED }}>{bilgi.satirlar.length} yükleme</span>
          <button type="button" onClick={() => void onayla(bilgi.satirlar.map((s) => s.anahtar))} disabled={!bilgi.satirlar.length || !!isleniyor}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-40" style={{ backgroundColor: ACCENT }}>
            {isleniyor === "hepsi" ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />} Tümünü onayla
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {!bilgi.satirlar.length && <div className={`${kart} p-6 text-sm text-center`} style={{ ...kartStil, color: TEXT_MUTED }}>Spek onayı bekleyen yükleme kalmadı.</div>}
          {bilgi.satirlar.map((s) => (
            <div key={s.anahtar} className={`${kart} p-3`} style={kartStil}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold">{s.firma}</span>
                <span className="text-xs" style={{ color: TEXT_MUTED }}>{s.liman} · {s.adet}{s.urun ? ` · ${s.urun}` : ""}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 text-[11px]" style={{ color: TEXT_MUTED }}>
                <span>Boş ekipman: <span className="text-white">{trTarih(s.ekipman)}</span></span>
                <span>ETD: <span className="text-white">{trTarih(s.etd)}</span></span>
                <span>Booking: <span className="text-white">{s.booking}</span></span>
                {s.digerEksikler.length > 0 && <span className="text-amber-300">Ayrıca eksik: {s.digerEksikler.join(", ")}</span>}
              </div>
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <textarea value={metin[s.anahtar] ?? ""} onChange={(e) => setMetin((x) => ({ ...x, [s.anahtar]: e.target.value }))} rows={4}
                  className="flex-1 rounded-lg border bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/60" style={{ borderColor: CARD_BORDER }}
                  aria-label="Ürün spekleri" />
                <button type="button" onClick={() => void onayla([s.anahtar])} disabled={!!isleniyor || !(metin[s.anahtar] || "").trim()}
                  className="sm:self-start inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ borderColor: "rgba(16,185,129,0.5)", color: "#6EE7B7" }}>
                  {isleniyor === s.anahtar ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Onayla
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[11px] text-center" style={{ color: TEXT_MUTED }}>Öneri müşterinin kalite ayarından gelir · bağlantı 3 gün geçerlidir.</p>
      </div>
    </div>
  );
}
