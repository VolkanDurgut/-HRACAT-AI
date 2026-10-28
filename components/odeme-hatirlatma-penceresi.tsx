"use client";

/**
 * Odeme hatirlatma maili penceresi (28.10.2026). ETD/ETA sayfasindan acilir.
 *
 * Akis: sablon sec (1-3) -> alici / CC / konu / metin (hepsi duzenlenebilir) -> "Outlook'ta ac"
 * (mailto; ihracat musterisine sistemden dogrudan gonderim kullanici karariyla askida) ->
 * "Gonderdiniz mi?" -> Evet: odeme_hatirlatma_kaydet() ile degismez kayit. Hayir: kayit yok.
 * Webmail kullanan icin "Metni kopyala". Gecmis hatirlatmalar altta listelenir.
 */

import React from "react";
import { X, Mail, Copy, Check, History, AlertTriangle, Loader2, Send } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { formatDateTR } from "@/lib/cutoff-utils";
import {
  SABLON_BILGI, hatirlatmaKonusu, hatirlatmaMetni, mailtoAdresi, epostaListesi, gecersizEpostalar,
  bugunIso, type HatirlatmaSablonu,
} from "@/lib/odeme-takibi";

export type HatirlatmaKaydi = {
  id: string;
  rezervasyon_id: string | null;
  sablon: number;
  alici: string;
  cc: string | null;
  konu: string;
  govde: string;
  gonderen_eposta: string | null;
  gonderim_zamani: string;
};

export type HatirlatmaSevkiyati = {
  rezervasyon_id: string;
  dosya_no: string;
  alici_firma: string | null;
  booking_no: string | null;
  konteyner_adedi: number;
  konteyner_tipi: string;
  eta: string | null;
  alici_email: string | null;
};

const CC_ANAHTAR = "odeme-hatirlatma-cc";

function tarihSaat(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export function OdemeHatirlatmaPenceresi({
  sevkiyat, gecmis, onKapat, onKaydet,
}: {
  sevkiyat: HatirlatmaSevkiyati;
  gecmis: HatirlatmaKaydi[];
  onKapat: () => void;
  /** Hata metni dondurur (null = basarili) */
  onKaydet: (v: { sablon: HatirlatmaSablonu; alici: string; cc: string; konu: string; govde: string }) => Promise<string | null>;
}) {
  const bugun = bugunIso();
  const varmis = !!sevkiyat.eta && sevkiyat.eta.slice(0, 10) <= bugun;
  const onerilen: HatirlatmaSablonu = varmis ? 3 : gecmis.length > 0 ? 2 : 1;
  const veri = React.useMemo(() => ({
    firma: (sevkiyat.alici_firma || "").trim() || "Customer",
    konteynerAdedi: sevkiyat.konteyner_adedi,
    konteynerTipi: sevkiyat.konteyner_tipi,
    booking: sevkiyat.booking_no || "-",
    eta: sevkiyat.eta,
    bugun,
  }), [sevkiyat, bugun]);

  const [sablon, setSablon] = React.useState<HatirlatmaSablonu>(onerilen);
  const [alici, setAlici] = React.useState(sevkiyat.alici_email || "");
  const [cc, setCc] = React.useState(() => {
    try { return window.localStorage.getItem(CC_ANAHTAR) || ""; } catch { return ""; }
  });
  const [konu, setKonu] = React.useState(hatirlatmaKonusu(veri));
  const [govde, setGovde] = React.useState(hatirlatmaMetni(onerilen, veri));
  const [elleDegisti, setElleDegisti] = React.useState(false);
  const [asama, setAsama] = React.useState<"duzenle" | "onay">("duzenle");
  const [kaydediliyor, setKaydediliyor] = React.useState(false);
  const [hata, setHata] = React.useState<string | null>(null);
  const [kopyalandi, setKopyalandi] = React.useState(false);

  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !kaydediliyor) onKapat(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [kaydediliyor, onKapat]);

  const sablonSec = (s: HatirlatmaSablonu) => {
    setSablon(s);
    setGovde(hatirlatmaMetni(s, veri));
    setElleDegisti(false);
  };

  const alicilar = epostaListesi(alici);
  // Aliciyla ayni adres CC'ye yazilmaz (mailto ve kayit ayni listeyi kullanir)
  const ccler = epostaListesi(cc).filter((c) => !alicilar.some((a) => a.toLowerCase() === c.toLowerCase()));
  const gecersiz = gecersizEpostalar([...alicilar, ...ccler]);
  const dogrulamaHatasi =
    alicilar.length === 0 ? "Alıcı e-posta adresi girin." :
    gecersiz.length > 0 ? `Geçersiz e-posta: ${gecersiz.join(", ")}` :
    konu.trim().length < 3 ? "Konu boş olamaz." :
    govde.trim().length < 10 ? "Mail metni boş olamaz." : null;

  const outlookAc = () => {
    setHata(null);
    if (dogrulamaHatasi) { setHata(dogrulamaHatasi); return; }
    // Yalniz sirket ici (@unex.com.tr) CC adresleri hatirlanir: bir musterinin adresi baska
    // musteriye gidecek maile tasinmasin.
    try { window.localStorage.setItem(CC_ANAHTAR, ccler.filter((c) => /@unex\.com\.tr$/i.test(c)).join(", ")); } catch { /* gizli pencere */ }
    const a = document.createElement("a");
    a.href = mailtoAdresi(alicilar, ccler, konu.trim(), govde);
    a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setAsama("onay");
  };

  const kopyala = async () => {
    try {
      await navigator.clipboard.writeText(`${konu.trim()}\n\n${govde}`);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2000);
    } catch { setHata("Panoya kopyalanamadı; metni seçip kopyalayın."); }
  };

  const gonderildi = async () => {
    setKaydediliyor(true);
    setHata(null);
    const h = await onKaydet({ sablon, alici: alicilar.join(", "), cc: ccler.join(", "), konu: konu.trim(), govde });
    setKaydediliyor(false);
    if (h) setHata(h);
  };

  const girdi = "w-full px-3 py-2 border rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 placeholder:text-slate-500";
  const etiket = "block text-xs font-medium mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/60 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="odeme-hatirlatma-baslik"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !kaydediliyor) onKapat(); }}>
      <div className="w-full max-w-2xl my-6 rounded-xl border shadow-xl" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div className="min-w-0">
            <p id="odeme-hatirlatma-baslik" className="text-sm font-semibold text-white flex items-center gap-2"><Mail size={15} style={{ color: ACCENT }} /> Ödeme hatırlatma maili</p>
            <p className="text-xs mt-0.5 break-words" style={{ color: TEXT_MUTED }}>
              <span className="text-white">{sevkiyat.alici_firma || "—"}</span> · {sevkiyat.dosya_no} · <span className="font-mono">{sevkiyat.booking_no || "—"}</span> · {sevkiyat.konteyner_adedi} × {sevkiyat.konteyner_tipi}
              {sevkiyat.eta ? <> · ETA {formatDateTR(sevkiyat.eta)}</> : null}
            </p>
          </div>
          <button onClick={onKapat} disabled={kaydediliyor} className="hover:text-white disabled:opacity-50" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
        </div>

        {asama === "duzenle" ? (
          <div className="px-5 py-4 space-y-4">
            <fieldset>
              <legend className={etiket} style={{ color: TEXT_MUTED }}>Şablon</legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([1, 2, 3] as HatirlatmaSablonu[]).map((s) => {
                  const secili = sablon === s;
                  return (
                    <button key={s} type="button" onClick={() => sablonSec(s)} aria-pressed={secili} data-testid={`sablon-${s}`}
                      className="text-left rounded-lg border px-3 py-2.5 transition-colors"
                      style={{ borderColor: secili ? ACCENT : CARD_BORDER, backgroundColor: secili ? `${ACCENT}14` : ROW_HEADER_BG }}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-white">{s}. {SABLON_BILGI[s].ad}</span>
                        {s === onerilen && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${ACCENT}26`, color: ACCENT }}>Önerilen</span>}
                      </span>
                      <span className="block text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{SABLON_BILGI[s].aciklama}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={etiket} style={{ color: TEXT_MUTED }} htmlFor="oh-alici">Alıcı (To) *</label>
                <input id="oh-alici" value={alici} onChange={(e) => setAlici(e.target.value)} placeholder="musteri@firma.com"
                  className={girdi} style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
                {!sevkiyat.alici_email && <p className="text-[11px] mt-1 text-amber-300">Dosyada müşteri e-postası kayıtlı değil; elle yazın.</p>}
              </div>
              <div>
                <label className={etiket} style={{ color: TEXT_MUTED }} htmlFor="oh-cc">CC</label>
                <input id="oh-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="virgülle ayırın"
                  className={girdi} style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
                <p className="text-[11px] mt-1" style={{ color: TEXT_MUTED }}>@unex.com.tr adresleri bu tarayıcıda hatırlanır.</p>
              </div>
            </div>
            <div>
              <label className={etiket} style={{ color: TEXT_MUTED }} htmlFor="oh-konu">Konu *</label>
              <input id="oh-konu" value={konu} onChange={(e) => setKonu(e.target.value)} className={girdi} style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-xs font-medium" style={{ color: TEXT_MUTED }} htmlFor="oh-govde">Mail metni *</label>
                {elleDegisti && (
                  <button type="button" onClick={() => sablonSec(sablon)} className="text-[11px] hover:underline" style={{ color: ACCENT }}>Şablona geri dön</button>
                )}
              </div>
              <textarea id="oh-govde" value={govde} rows={12} onChange={(e) => { setGovde(e.target.value); setElleDegisti(true); }}
                className={`${girdi} font-mono text-[12.5px] leading-relaxed resize-y`} style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }} />
              <p className="text-[11px] mt-1" style={{ color: TEXT_MUTED }}>İmzanız Outlook&apos;ta eklenir. Şablon değiştirilirse metin yeniden oluşturulur.</p>
            </div>

            {hata && <p className="text-xs text-red-400 flex items-center gap-1.5" role="alert"><AlertTriangle size={13} />{hata}</p>}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button type="button" onClick={kopyala} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium hover:bg-white/[0.04]"
                style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                {kopyalandi ? <Check size={13} /> : <Copy size={13} />} {kopyalandi ? "Kopyalandı" : "Metni kopyala"}
              </button>
              <button type="button" onClick={outlookAc} data-testid="outlook-ac" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white hover:opacity-90"
                style={{ backgroundColor: ACCENT }}>
                <Send size={13} /> Outlook&apos;ta aç
              </button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-5 space-y-4" aria-live="polite">
            <div className="rounded-lg border px-4 py-3" style={{ borderColor: `${ACCENT}55`, backgroundColor: `${ACCENT}10` }}>
              <p className="text-sm font-semibold text-white">Mail Outlook&apos;ta hazırlandı. Gönderdiniz mi?</p>
              <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>
                &quot;Evet&quot; derseniz hatırlatma takip kaydına geçer: {alicilar.join(", ")} · {SABLON_BILGI[sablon].ad} · bugün.
                Outlook açılmadıysa geri dönüp &quot;Metni kopyala&quot; ile gönderebilirsiniz.
              </p>
            </div>
            {hata && <p className="text-xs text-red-400 flex items-center gap-1.5" role="alert"><AlertTriangle size={13} />{hata}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={() => setAsama("duzenle")} disabled={kaydediliyor} className="px-3 py-2 rounded-lg border text-xs font-medium hover:bg-white/[0.04] disabled:opacity-50"
                style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Geri dön</button>
              <button type="button" onClick={onKapat} disabled={kaydediliyor} className="px-3 py-2 rounded-lg border text-xs font-medium hover:bg-white/[0.04] disabled:opacity-50"
                style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Hayır, gönderilmedi</button>
              <button type="button" onClick={gonderildi} disabled={kaydediliyor} data-testid="gonderildi-kaydet"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
                {kaydediliyor ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Evet, gönderildi olarak kaydet
              </button>
            </div>
          </div>
        )}

        <div className="px-5 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
          <p className="text-xs font-semibold text-white flex items-center gap-1.5 mb-2"><History size={13} style={{ color: TEXT_MUTED }} /> Gönderilen hatırlatmalar ({gecmis.length})</p>
          {gecmis.length === 0 ? (
            <p className="text-xs" style={{ color: TEXT_MUTED }}>Bu sevkiyat için henüz hatırlatma gönderilmedi.</p>
          ) : (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {gecmis.map((g) => (
                <li key={g.id} className="rounded-lg border px-3 py-2 text-[11.5px]" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                  <details>
                    <summary className="cursor-pointer list-none flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-white font-medium tabular-nums">{tarihSaat(g.gonderim_zamani)}</span>
                      <span style={{ color: TEXT_MUTED }}>· {g.sablon}. {SABLON_BILGI[g.sablon as HatirlatmaSablonu]?.ad || "Şablon"}</span>
                      <span style={{ color: TEXT_MUTED }}>· {g.alici}</span>
                      {g.gonderen_eposta && <span style={{ color: TEXT_MUTED }}>· gönderen {g.gonderen_eposta}</span>}
                    </summary>
                    <div className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed" style={{ color: TEXT_MUTED }}>
                      {g.cc ? `CC: ${g.cc}\n` : ""}Konu: {g.konu}{"\n\n"}{g.govde}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
