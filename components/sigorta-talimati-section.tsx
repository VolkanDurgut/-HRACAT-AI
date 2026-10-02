"use client";

import React, { useMemo, useState } from "react";
import { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { Download, Mail, X, Copy, Lock, RotateCcw, FileSignature } from "lucide-react";
import InfoTooltip from "@/components/info-tooltip";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import {
  SigortaTalimatiAlanlari,
  SIGORTA_ALAN_ETIKETLERI,
  SIGORTA_SABIT_GONDERICI,
  SIGORTA_SABIT_MALIN_CINSI,
  SIGORTA_SABIT_TASIMA_SEKLI,
  sigortaTalimatiVarsayilanlari,
  sigortaTalimatiHazirlik,
  sigortaTalimatiTarihi,
  buildSigortaTalimatiKonu,
  buildSigortaTalimatiMetni,
} from "@/lib/sigorta-talimati";
import { indirSigortaTalimatiPdf } from "@/lib/sigorta-talimati-pdf-builder";
import { buildSigortaTalimatiDosyaAdi } from "@/lib/evrak-dosya-adi";

/**
 * Evraklar > 10. "Insurance Policy" satiri: Yuk Sigortasi Talimati
 * (talep: 02.10.2026). Konteynerler sekmesindeki Fatura Talimati ile ayni
 * calisma sekli: "Indir" PDF'i dogrudan indirir, "Talimat" penceresinde
 * otomatik doldurulan alanlar duzeltilip PDF indirilir ve/veya mail
 * uygulamasi acilir. Hicbir sey veritabanina yazilmaz.
 */

type Props = {
  dosya: Dosya;
  rezervasyonlar: Rezervasyon[];
  konteynerler: Konteyner[];
  /** Musterinin evrak listesindeki sigorta sarti metni (kopyalama icin). */
  sartMetni: string;
};

// Son kullanilan alici/CC - sadece bu tarayicida, kolaylik icin.
const ALICI_ANAHTARI = "sigorta-talimati-alicilari-v1";

function aliciOku(): { to: string; cc: string } {
  try {
    const ham = localStorage.getItem(ALICI_ANAHTARI);
    const v = ham ? JSON.parse(ham) : null;
    return { to: typeof v?.to === "string" ? v.to : "", cc: typeof v?.cc === "string" ? v.cc : "" };
  } catch {
    return { to: "", cc: "" };
  }
}

function aliciYaz(to: string, cc: string) {
  try { localStorage.setItem(ALICI_ANAHTARI, JSON.stringify({ to, cc })); } catch { /* yoksay */ }
}

const ALAN_SIRASI: { anahtar: keyof SigortaTalimatiAlanlari; genis?: boolean; ornek?: string }[] = [
  { anahtar: "malBedeli", ornek: "51.875,00 USD" },
  { anahtar: "gidecegiYer", ornek: "BENIN" },
  { anahtar: "gemiAdi" },
  { anahtar: "seferNo" },
  { anahtar: "teslimSekli", ornek: "CIF" },
  { anahtar: "gemiKalkisi", ornek: "19.09.2026" },
  { anahtar: "tasiyiciAcente", ornek: "HAPAG-LLOYD" },
  { anahtar: "konsimentoNo" },
  { anahtar: "yukSatiri", genis: true, ornek: "5 X 20 DC KONTEYNER  2.500 ADET 50 KG PP+KRAFT ÇUVAL" },
  { anahtar: "agirlikSatiri", genis: true, ornek: "BRÜT : 126.000,00 KGS , NET : 125.000,00 KGS" },
];

export default function SigortaTalimatiSection({ dosya, rezervasyonlar, konteynerler, sartMetni }: Props) {
  const varsayilan = useMemo(() => sigortaTalimatiVarsayilanlari(dosya, rezervasyonlar, konteynerler), [dosya, rezervasyonlar, konteynerler]);
  const hazirlik = sigortaTalimatiHazirlik(rezervasyonlar, konteynerler, varsayilan);
  const dosyaAdi = buildSigortaTalimatiDosyaAdi(dosya, rezervasyonlar);

  const [acik, setAcik] = useState(false);
  const [alanlar, setAlanlar] = useState<SigortaTalimatiAlanlari>(varsayilan);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [konu, setKonu] = useState("");
  const [kopyalandi, setKopyalandi] = useState(false);

  const pencereyiAc = () => {
    const kayitli = aliciOku();
    setAlanlar(varsayilan);
    setTo(kayitli.to);
    setCc(kayitli.cc);
    setKonu(buildSigortaTalimatiKonu(dosya, varsayilan));
    setAcik(true);
  };

  const sartiKopyala = async () => {
    try {
      await navigator.clipboard.writeText(sartMetni);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 1500);
    } catch { /* pano izni yoksa sessizce gec */ }
  };

  const mailAc = () => {
    aliciYaz(to.trim(), cc.trim());
    const ccParca = cc.trim() ? `&cc=${encodeURIComponent(cc.trim())}` : "";
    window.open(`mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(konu)}${ccParca}&body=${encodeURIComponent(buildSigortaTalimatiMetni(alanlar))}`);
  };

  const pencereEksikleri = (Object.keys(SIGORTA_ALAN_ETIKETLERI) as (keyof SigortaTalimatiAlanlari)[]).filter((k) => !alanlar[k].trim());
  const degisti = (Object.keys(varsayilan) as (keyof SigortaTalimatiAlanlari)[]).some((k) => alanlar[k] !== varsayilan[k]);

  const kopyalaButonu = (
    <button
      onClick={sartiKopyala}
      title={kopyalandi ? "Kopyalandı" : "Müşterinin sigorta şartı metnini kopyala"}
      className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
      style={{ color: kopyalandi ? ACCENT : TEXT_MUTED }}
    >
      <Copy size={13} />
    </button>
  );

  if (!hazirlik.acilabilir) {
    return (
      <div className="flex items-center gap-1.5">
        <InfoTooltip variant="warning" position="bottom" align="right" width="w-64" size={14}>
          <span className="font-semibold text-amber-400">Sigorta talimatı hazır değil:</span> {hazirlik.engel}
        </InfoTooltip>
        {kopyalaButonu}
      </div>
    );
  }

  const inputSinifi = "w-full px-3 py-2 border rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50";
  const inputStil: React.CSSProperties = { borderColor: CARD_BORDER, backgroundColor: CARD_BG };
  const etiketSinifi = "block text-[11px] font-medium mb-1";

  return (
    <>
      <div className="flex items-center gap-1.5">
        {hazirlik.eksikler.length > 0 && (
          <InfoTooltip variant="warning" position="bottom" align="right" width="w-64" size={14}>
            <span className="font-semibold text-amber-400">Boş alanlar:</span> {hazirlik.eksikler.join(", ")}. &quot;Talimat&quot; penceresinden doldurup indirebilirsiniz.
          </InfoTooltip>
        )}
        <button
          onClick={() => indirSigortaTalimatiPdf(varsayilan, dosyaAdi)}
          disabled={hazirlik.eksikler.length > 0}
          title={hazirlik.eksikler.length > 0 ? "Boş alan var - Talimat penceresinden tamamlayın" : "Yük sigortası talimatını PDF olarak indir"}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-500/10"
        >
          <Download size={12} /> İndir
        </button>
        <button
          onClick={pencereyiAc}
          title="Bilgileri kontrol et / düzelt, PDF indir veya mail hazırla"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 hover:border-sky-500/50 transition-colors"
        >
          <FileSignature size={12} /> Talimat
        </button>
        {kopyalaButonu}
      </div>

      {acik && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAcik(false)}>
          <div
            className="rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-up"
            style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Yük Sigortası Talimatı"
          >
            <div className="shrink-0 flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
              <div>
                <p className="text-sm font-bold text-white">Yük Sigortası Talimatı</p>
                <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>
                  {dosya.dosya_no} · Tarih: {sigortaTalimatiTarihi()} (her zaman bugünün tarihi)
                </p>
              </div>
              <button onClick={() => setAcik(false)} className="hover:text-white transition-colors" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={18} /></button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>Belge Bilgileri</p>
                  {degisti && (
                    <button onClick={() => setAlanlar(varsayilan)} className="inline-flex items-center gap-1 text-[11px] hover:text-white transition-colors" style={{ color: TEXT_MUTED }}>
                      <RotateCcw size={11} /> Otomatik değerlere dön
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                  {[["Gönderici Firma", SIGORTA_SABIT_GONDERICI], ["Malın Cinsi", SIGORTA_SABIT_MALIN_CINSI], ["Taşıma Şekli", SIGORTA_SABIT_TASIMA_SEKLI]].map(([etiket, deger]) => (
                    <div key={etiket} className="rounded-lg border px-3 py-2" style={{ borderColor: CARD_BORDER, backgroundColor: "rgba(255,255,255,0.02)" }} title="Sabit bilgi">
                      <p className="text-[10px] flex items-center gap-1" style={{ color: TEXT_MUTED }}><Lock size={9} /> {etiket}</p>
                      <p className="text-xs text-white mt-0.5 leading-snug">{deger}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2.5">
                  {ALAN_SIRASI.map(({ anahtar, genis, ornek }) => {
                    const bos = !alanlar[anahtar].trim();
                    return (
                      <div key={anahtar} className={genis ? "sm:col-span-2" : ""}>
                        <label className={etiketSinifi} style={{ color: bos ? "#FBBF24" : TEXT_MUTED }}>
                          {SIGORTA_ALAN_ETIKETLERI[anahtar]}{bos && " · boş"}
                        </label>
                        <input
                          value={alanlar[anahtar]}
                          onChange={(e) => setAlanlar((a) => ({ ...a, [anahtar]: e.target.value }))}
                          placeholder={ornek}
                          className={inputSinifi}
                          style={{ ...inputStil, borderColor: bos ? "rgba(251,191,36,0.5)" : CARD_BORDER }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t pt-4" style={{ borderColor: CARD_BORDER }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: TEXT_MUTED }}>Mail</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2.5">
                  <div>
                    <label className={etiketSinifi} style={{ color: TEXT_MUTED }}>Kime</label>
                    <input value={to} onChange={(e) => setTo(e.target.value)} type="email" placeholder="sigorta@firma.com" className={inputSinifi} style={inputStil} />
                  </div>
                  <div>
                    <label className={etiketSinifi} style={{ color: TEXT_MUTED }}>CC</label>
                    <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc1@firma.com, cc2@firma.com" className={inputSinifi} style={inputStil} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={etiketSinifi} style={{ color: TEXT_MUTED }}>Konu</label>
                    <input value={konu} onChange={(e) => setKonu(e.target.value)} className={inputSinifi} style={inputStil} />
                  </div>
                </div>
                <p className="text-[11px] mt-2" style={{ color: TEXT_MUTED }}>
                  Mail metni yukarıdaki bilgilerle otomatik oluşur. PDF maile otomatik eklenemez; indirdiğiniz PDF&apos;i açılan mail taslağına sürükleyin.
                </p>
              </div>
            </div>

            <div className="shrink-0 flex flex-wrap items-center gap-2 px-5 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
              <button
                onClick={mailAc}
                disabled={!to.trim()}
                title={!to.trim() ? "Önce alıcı adresini girin" : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
                style={{ backgroundColor: ACCENT }}
              >
                <Mail size={14} /> Mail Uygulamasını Aç
              </button>
              <button
                onClick={() => indirSigortaTalimatiPdf(alanlar, dosyaAdi)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border hover:bg-white/5"
                style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}
              >
                <Download size={14} /> PDF İndir
              </button>
              <button onClick={() => setAcik(false)} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                Kapat
              </button>
              {pencereEksikleri.length > 0 && (
                <span className="text-[11px] ml-auto" style={{ color: "#FBBF24" }}>{pencereEksikleri.length} alan boş — PDF&apos;te &quot;-&quot; görünür</span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
