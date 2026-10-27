"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Printer, RefreshCw, XCircle } from "lucide-react";
import { GENEL, GenelKart, GenelSayfaCerceve } from "@/components/genel-sayfa-cerceve";
import { satinAlmaCagir } from "@/lib/satin-alma/api";
import { tokenBicimiGecerli } from "@/lib/ic-piyasa/genel-api";
import { KATEGORILER, listeOzeti, miktarBirim, saTarih, type SaKalem, type SaListe } from "@/supabase/functions/_shared/satin-alma";

/**
 * Unex satin alma CEK LISTESI (26.10.2026) - girissiz.
 * Burak Bey listeyi onaylayinca olusur; execution@'ye giden "[Departman] Onayli satin
 * alma cek listesi" mailindeki dugme buraya gelir. Onaylanan kalemler alindikca
 * isaretlenir; hepsi alininca liste "Tamamlandi" olur (Satin Alma sayfasinda ve
 * departmanin talep baglantisinda da gorunur). Yazdirilabilir.
 */

const AD_ANAHTAR = "sa-cek-ad";

export default function CekSayfasi({ params }: { params: { token: string } }) {
  const [liste, setListe] = useState<SaListe | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null);
  const [isleniyor, setIsleniyor] = useState<string | null>(null);
  const [ad, setAd] = useState("");
  const [redAcik, setRedAcik] = useState(false);

  useEffect(() => { try { setAd(window.localStorage.getItem(AD_ANAHTAR) || ""); } catch { /* yoksay */ } }, []);

  const getir = useCallback(async (sessiz = false) => {
    if (!tokenBicimiGecerli(params.token)) { setHata("Bağlantı geçersiz. Lütfen e-postadaki düğmeyi kullanın."); setYukleniyor(false); return; }
    if (sessiz) setYenileniyor(true);
    const r = await satinAlmaCagir<SaListe>({ islem: "cek_bilgi", token: params.token });
    if (r.ok) { setListe(r.veri); setHata(null); } else if (!sessiz || r.durum === 404) { setListe(null); setHata(r.hata); }
    setYukleniyor(false);
    setYenileniyor(false);
  }, [params.token]);
  useEffect(() => { getir(); }, [getir]);

  const isaretle = async (k: SaKalem) => {
    setIslemHatasi(null);
    setIsleniyor(k.id);
    try { if (ad.trim()) window.localStorage.setItem(AD_ANAHTAR, ad.trim()); } catch { /* yoksay */ }
    const r = await satinAlmaCagir<SaListe>({ islem: "cek_isaretle", token: params.token, kalem_id: k.id, alindi: !k.alindi, ad: ad.trim() });
    setIsleniyor(null);
    if (!r.ok) { setIslemHatasi(r.hata); return; }
    setListe(r.veri);
  };

  if (yukleniyor) {
    return <GenelSayfaCerceve ust="Satın Alma Çek Listesi" satisSatiri={false}><div className="flex justify-center py-20"><Loader2 className="animate-spin" size={28} style={{ color: GENEL.lacivert2 }} /></div></GenelSayfaCerceve>;
  }
  if (!liste) {
    return (
      <GenelSayfaCerceve ust="Satın Alma Çek Listesi" satisSatiri={false}>
        <GenelKart><p className="font-semibold flex items-center gap-2"><AlertTriangle size={18} style={{ color: GENEL.turuncu }} /> {hata}</p></GenelKart>
      </GenelSayfaCerceve>
    );
  }

  const o = listeOzeti(liste);
  const onaylar = liste.kalemler.filter((k) => k.karar === "onaylandi");
  const redler = liste.kalemler.filter((k) => k.karar === "reddedildi");
  const tamam = liste.cek_durumu === "tamamlandi";
  const oran = o.onay ? Math.round((o.alinan / o.onay) * 100) : 0;

  return (
    <GenelSayfaCerceve ust="Satın Alma Çek Listesi" satisSatiri={false}>
      <div className="space-y-4">
        <GenelKart>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wider" style={{ color: GENEL.soluk }}>DEPARTMAN</p>
              <p className="text-2xl font-bold leading-tight break-words">{liste.departman}</p>
              <p className="text-sm mt-1 font-mono" style={{ color: GENEL.soluk }}>{liste.liste_no}</p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full"
              style={tamam ? { backgroundColor: "#E3F2EA", color: GENEL.yesil } : { backgroundColor: "#FDF1E7", color: GENEL.turuncu }}>
              {tamam ? <CheckCircle2 size={15} /> : <span className="w-2 h-2 rounded-full" style={{ backgroundColor: GENEL.turuncu }} />}
              {tamam ? "Tamamlandı" : "Aktif"}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <Alan etiket="Gönderen" deger={liste.gonderen_ad || "-"} />
            <Alan etiket="Onaylayan" deger={liste.karar_veren_email || "-"} />
            <Alan etiket="Onay" deger={saTarih(liste.karar_zamani)} />
            <Alan etiket={tamam ? "Tamamlanma" : "İlerleme"} deger={tamam ? saTarih(liste.cek_tamamlanma) : `${o.alinan} / ${o.onay} alındı`} />
          </div>
          {liste.karar_notu && <p className="text-sm mt-3 rounded-lg px-3 py-2" style={{ backgroundColor: "#F7F6F2" }}><span style={{ color: GENEL.soluk }}>Not:</span> {liste.karar_notu}</p>}
          <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ backgroundColor: GENEL.cizgi }} role="progressbar" aria-valuenow={oran} aria-valuemin={0} aria-valuemax={100} aria-label="Alınan kalem oranı">
            <div className="h-full rounded-full transition-all" style={{ width: `${oran}%`, backgroundColor: GENEL.yesil }} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            <button onClick={() => getir(true)} disabled={yenileniyor} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium disabled:opacity-60" style={{ borderColor: GENEL.cizgi }}>
              <RefreshCw size={14} className={yenileniyor ? "animate-spin" : ""} /> Yenile
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium" style={{ borderColor: GENEL.cizgi }}>
              <Printer size={14} /> Yazdır
            </button>
          </div>
        </GenelKart>

        <GenelKart>
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <p className="text-base font-bold">Onaylanan kalemler ({o.onay})</p>
            <label className="block w-full sm:w-64 print:hidden">
              <span className="block text-xs mb-1" style={{ color: GENEL.soluk }}>Adınız (isteğe bağlı, kayda yazılır)</span>
              <input value={ad} onChange={(e) => setAd(e.target.value)} maxLength={80} placeholder="Ör. Execution" className="w-full px-3 py-2 rounded-lg border text-base bg-white" style={{ borderColor: GENEL.cizgi }} />
            </label>
          </div>
          <ul className="divide-y" style={{ borderColor: GENEL.cizgi }}>
            {onaylar.map((k) => (
              <li key={k.id} className="py-3 flex items-start gap-3" style={{ borderColor: GENEL.cizgi }}>
                <button onClick={() => isaretle(k)} disabled={isleniyor !== null} role="checkbox" aria-checked={!!k.alindi} aria-label={`${k.urun} alındı`}
                  className="shrink-0 mt-0.5 w-7 h-7 rounded-md border-2 flex items-center justify-center disabled:opacity-60 transition-colors"
                  style={k.alindi ? { backgroundColor: GENEL.yesil, borderColor: GENEL.yesil, color: "#fff" } : { borderColor: GENEL.lacivert2, backgroundColor: "#fff" }}>
                  {isleniyor === k.id ? <Loader2 size={15} className="animate-spin" style={{ color: k.alindi ? "#fff" : GENEL.lacivert2 }} /> : k.alindi ? <CheckCircle2 size={17} /> : null}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: GENEL.soluk }}>{KATEGORILER[k.kategori] ?? k.kategori}</p>
                  <p className="font-semibold break-words">
                    <span className={k.alindi ? "line-through" : undefined} style={k.alindi ? { color: GENEL.soluk } : undefined}>{k.urun}</span>
                    {k.aciliyet === "acil" && <span className="ml-2 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#FDECEC", color: "#B42318" }}>ACİL</span>}
                  </p>
                  <p className="text-sm"><b>{miktarBirim(k)}</b> <span style={{ color: GENEL.soluk }}>· {k.talep_eden}</span></p>
                  {k.aciklama && <p className="text-sm break-words" style={{ color: GENEL.soluk }}>{k.aciklama}</p>}
                  {k.alindi && <p className="text-xs mt-0.5 font-medium" style={{ color: GENEL.yesil }}>Alındı · {saTarih(k.alinma_zamani)}{k.alan_ad ? ` · ${k.alan_ad}` : ""}</p>}
                </div>
              </li>
            ))}
          </ul>
          {islemHatasi && <p className="mt-3 text-sm font-medium" role="alert" style={{ color: "#B42318" }}>{islemHatasi}</p>}
        </GenelKart>

        {redler.length > 0 && (
          <GenelKart>
            <button onClick={() => setRedAcik(!redAcik)} aria-expanded={redAcik} className="w-full flex items-center justify-between gap-3 text-left">
              <span className="text-base font-bold flex items-center gap-2"><XCircle size={17} style={{ color: "#B42318" }} /> Reddedilen kalemler ({redler.length})</span>
              <ChevronDown size={16} className={`transition-transform print:hidden ${redAcik ? "rotate-180" : ""}`} style={{ color: GENEL.soluk }} />
            </button>
            <ul className={`divide-y mt-3 ${redAcik ? "" : "hidden print:block"}`} style={{ borderColor: GENEL.cizgi }}>
              {redler.map((k) => (
                <li key={k.id} className="py-2.5 text-sm" style={{ borderColor: GENEL.cizgi }}>
                  <p className="font-semibold">{k.urun} <span className="font-normal" style={{ color: GENEL.soluk }}>· {miktarBirim(k)} · {k.talep_eden}</span></p>
                  {k.red_nedeni && <p style={{ color: "#B42318" }}>Red nedeni: {k.red_nedeni}</p>}
                </li>
              ))}
            </ul>
          </GenelKart>
        )}
      </div>
    </GenelSayfaCerceve>
  );
}

function Alan({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs" style={{ color: GENEL.soluk }}>{etiket}</p>
      <p className="font-semibold mt-0.5 break-words">{deger}</p>
    </div>
  );
}
