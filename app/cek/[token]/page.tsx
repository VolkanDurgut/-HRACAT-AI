"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, Loader2, Printer, RefreshCw } from "lucide-react";
import {
  AcilEtiketi, B, BelgeSayfasi, DurumEtiketi, Panel, TestSeridi, dugmeIkincil, girdiSinifi, girdiStil, tdSinifi, thSinifi,
} from "@/components/satin-alma-belge";
import { satinAlmaCagir } from "@/lib/satin-alma/api";
import { tokenBicimiGecerli } from "@/lib/ic-piyasa/genel-api";
import { BIRIMLER, KATEGORILER, listeOzeti, miktarYaz, saTarih, type SaKalem, type SaListe } from "@/supabase/functions/_shared/satin-alma";

/**
 * ONAYLI SATIN ALMA FISI (26.10.2026 "cek listesi"; kurumsal belge 27.10.2026) - girissiz.
 * Burak Bey talebi onaylayinca olusur; execution@'ye giden "[Departman] Onayli satin
 * alma fisi" mailindeki dugme ve uygulamadaki "Onayli fisler" sekmesi buraya gelir.
 * Volkan fisi ilgili departmana iletir (baglanti ya da A4 yazdir / PDF).
 * Onaylanan kalemler teslim alindikca isaretlenir; hepsi alininca fis "Tamamlandi"
 * olur (Satin Alma sayfasinda ve departmanin talep baglantisinda da gorunur).
 */

const AD_ANAHTAR = "sa-cek-ad";

export default function SatinAlmaFisi({ params }: { params: { token: string } }) {
  const [liste, setListe] = useState<SaListe | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null);
  const [isleniyor, setIsleniyor] = useState<string | null>(null);
  const [ad, setAd] = useState("");
  const [kopyalandi, setKopyalandi] = useState(false);

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

  const kopyala = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setKopyalandi(true); setTimeout(() => setKopyalandi(false), 2500); }
    catch { setIslemHatasi("Bağlantı kopyalanamadı; adres çubuğundan kopyalayın."); }
  };

  if (yukleniyor) {
    return <BelgeSayfasi modul="Onaylı Satın Alma Fişi"><div className="flex justify-center py-20"><Loader2 className="animate-spin" size={24} style={{ color: B.lacivert2 }} /></div></BelgeSayfasi>;
  }
  if (!liste) {
    return (
      <BelgeSayfasi modul="Onaylı Satın Alma Fişi">
        <Panel><p className="font-semibold flex items-center gap-2 text-sm"><AlertTriangle size={16} style={{ color: B.turuncu }} /> {hata}</p></Panel>
      </BelgeSayfasi>
    );
  }

  const o = listeOzeti(liste);
  const onaylar = liste.kalemler.filter((k) => k.karar === "onaylandi");
  const redler = liste.kalemler.filter((k) => k.karar === "reddedildi");
  const tamam = liste.cek_durumu === "tamamlandi";

  return (
    <BelgeSayfasi modul="Onaylı Satın Alma Fişi">
      <style>{`@page { size: A4; margin: 12mm; }
@media print { html, body, .satin-alma-belge { background: #fff !important; } .fis-kagit { border: 0 !important; box-shadow: none !important; padding: 0 !important; } }`}</style>

      {/* Arac cubugu (yazdirmada gizli) */}
      <div className="print:hidden mb-3 flex flex-wrap items-end gap-2">
        <button onClick={() => window.print()} className={dugmeIkincil} style={{ borderColor: B.cizgi }}><Printer size={14} /> Yazdır / PDF</button>
        <button onClick={kopyala} className={dugmeIkincil} style={{ borderColor: B.cizgi }}>
          {kopyalandi ? <Check size={14} style={{ color: B.yesil }} /> : <Copy size={14} />} {kopyalandi ? "Kopyalandı" : "Bağlantıyı kopyala"}
        </button>
        <button onClick={() => getir(true)} disabled={yenileniyor} className={dugmeIkincil} style={{ borderColor: B.cizgi }}>
          <RefreshCw size={14} className={yenileniyor ? "animate-spin" : ""} /> Yenile
        </button>
        <label className="ml-auto w-full sm:w-60">
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.07em] mb-1" style={{ color: B.soluk }}>Teslim alan (işaretleyen)</span>
          <input value={ad} onChange={(e) => setAd(e.target.value)} maxLength={80} placeholder="Ad Soyad" className={girdiSinifi} style={girdiStil} />
        </label>
      </div>
      {liste.test && <div className="mb-3 print:mb-2"><TestSeridi>Bu fiş test departmanına aittir; e-postaları yalnızca test adresine gönderilir.</TestSeridi></div>}

      {/* A4 belge */}
      <article className="fis-kagit mx-auto max-w-[210mm] border rounded-[2px] px-5 sm:px-10 py-7 sm:py-9 shadow-sm"
        style={{ backgroundColor: "#fff", borderColor: B.cizgi, color: B.metin }}>
        {/* Baslik */}
        <header className="flex flex-wrap items-start justify-between gap-5 pb-5 border-b-2" style={{ borderColor: B.lacivert }}>
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo.png" alt="Unex Gıda" width={52} height={52} className="w-[52px] h-[52px] object-contain shrink-0" />
            <div className="min-w-0 text-[11px] leading-snug" style={{ color: B.soluk }}>
              <p className="text-[13px] font-bold" style={{ color: B.lacivert }}>{liste.sirket || "Unex Gıda San. ve Tic. Ltd. Şti."}</p>
              <p>İstiklal Mah. Cemal Ünlü Saraç Cad. No:20</p>
              <p>Süleymanpaşa / Tekirdağ · www.unex.com.tr</p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <h1 className="text-lg sm:text-xl font-bold tracking-[0.06em]" style={{ color: B.lacivert }}>SATIN ALMA FİŞİ</h1>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: B.soluk }}>Onaylı talep</p>
            <table className="mt-2 text-[12px] sm:ml-auto">
              <tbody>
                <tr><td className="pr-3 py-0.5" style={{ color: B.soluk }}>Fiş no</td><td className="font-mono font-bold">{liste.liste_no}</td></tr>
                <tr><td className="pr-3 py-0.5" style={{ color: B.soluk }}>Onay tarihi</td><td className="font-semibold">{saTarih(liste.karar_zamani)}</td></tr>
                <tr><td className="pr-3 py-0.5" style={{ color: B.soluk }}>Durum</td><td>{tamam ? <DurumEtiketi renk={B.yesil}>Tamamlandı</DurumEtiketi> : <DurumEtiketi renk={B.turuncu}>Aktif · {o.alinan}/{o.onay} teslim alındı</DurumEtiketi>}</td></tr>
              </tbody>
            </table>
          </div>
        </header>

        {/* Bilgi tablosu */}
        <table className="w-full mt-5 text-[12.5px] border" style={{ borderColor: B.cizgi }}>
          <tbody>
            <tr className="border-b" style={{ borderColor: B.cizgi }}>
              <BilgiHucresi etiket="Talep eden departman" deger={liste.departman} vurgu />
              <BilgiHucresi etiket="Talep formunu gönderen" deger={liste.gonderen_ad || "-"} />
            </tr>
            <tr className="border-b" style={{ borderColor: B.cizgi }}>
              <BilgiHucresi etiket="Talep tarihi" deger={saTarih(liste.gonderim_zamani)} />
              <BilgiHucresi etiket="Onaylayan" deger={liste.karar_veren_email || "-"} />
            </tr>
            <tr>
              <BilgiHucresi etiket="Kalem durumu" deger={`${o.onay} onaylı${o.red ? ` · ${o.red} reddedildi` : ""} · toplam ${o.toplam}`} />
              <BilgiHucresi etiket={tamam ? "Tamamlanma" : "Teslim"} deger={tamam ? saTarih(liste.cek_tamamlanma) : `${o.alinan} / ${o.onay} kalem teslim alındı`} />
            </tr>
          </tbody>
        </table>
        {liste.karar_notu && (
          <p className="mt-3 text-[12.5px] border-l-2 pl-3 py-1" style={{ borderColor: B.seftali }}>
            <span className="font-semibold" style={{ color: B.soluk }}>Onay notu: </span>{liste.karar_notu}
          </p>
        )}

        {/* Onaylanan kalemler */}
        <h2 className="mt-6 mb-2 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: B.lacivert }}>Onaylanan kalemler</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border" style={{ borderColor: B.cizgi }}>
            <thead>
              <tr style={{ backgroundColor: B.lacivert, color: "#fff" }}>
                <th className={`${thSinifi} w-9 text-right`}>Sıra</th>
                <th className={thSinifi}>Ürün / hizmet</th>
                <th className={thSinifi}>Kategori</th>
                <th className={`${thSinifi} text-right`}>Miktar</th>
                <th className={thSinifi}>Birim</th>
                <th className={thSinifi}>Talep eden</th>
                <th className={`${thSinifi} w-[150px]`}>Teslim alındı</th>
              </tr>
            </thead>
            <tbody>
              {onaylar.map((k, i) => (
                <tr key={k.id} className="border-t" style={{ borderColor: B.cizgi, backgroundColor: k.alindi ? "#F7FAF8" : undefined }}>
                  <td className={`${tdSinifi} text-right tabular-nums`} style={{ color: B.soluk }}>{i + 1}</td>
                  <td className={tdSinifi}>
                    <span className="font-semibold break-words">{k.urun}</span> {k.aciliyet === "acil" && <AcilEtiketi />}
                    {k.aciklama && <span className="block text-[11.5px] mt-0.5 break-words" style={{ color: B.soluk }}>{k.aciklama}</span>}
                  </td>
                  <td className={`${tdSinifi} whitespace-nowrap`} style={{ color: B.soluk }}>{KATEGORILER[k.kategori] ?? k.kategori}</td>
                  <td className={`${tdSinifi} text-right tabular-nums font-bold whitespace-nowrap`}>{miktarYaz(k.miktar)}</td>
                  <td className={`${tdSinifi} whitespace-nowrap`}>{BIRIMLER[k.birim] ?? k.birim}</td>
                  <td className={`${tdSinifi} whitespace-nowrap`}>{k.talep_eden}</td>
                  <td className={`${tdSinifi} py-2`}>
                    <div className="flex items-start gap-2">
                      <button onClick={() => isaretle(k)} disabled={isleniyor !== null} role="checkbox" aria-checked={!!k.alindi} aria-label={`${k.urun} teslim alındı`}
                        className="shrink-0 w-[18px] h-[18px] mt-px rounded-[2px] border-[1.5px] flex items-center justify-center disabled:opacity-60 print:pointer-events-none"
                        style={k.alindi ? { backgroundColor: B.yesil, borderColor: B.yesil, color: "#fff" } : { borderColor: B.lacivert2, backgroundColor: "#fff" }}>
                        {isleniyor === k.id ? <Loader2 size={11} className="animate-spin" style={{ color: k.alindi ? "#fff" : B.lacivert2 }} /> : k.alindi ? <Check size={12} strokeWidth={3} /> : null}
                      </button>
                      {k.alindi
                        ? <span className="text-[11px] leading-tight" style={{ color: B.yesil }}><b>{saTarih(k.alinma_zamani).slice(0, 10)}</b>{k.alan_ad ? <span className="block" style={{ color: B.soluk }}>{k.alan_ad}</span> : null}</span>
                        : <span className="text-[11px] pt-px" style={{ color: B.soluk }}>Bekliyor</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {islemHatasi && <p className="mt-2 text-[13px] font-medium print:hidden" role="alert" style={{ color: B.kirmizi }}>{islemHatasi}</p>}

        {/* Reddedilen kalemler */}
        {redler.length > 0 && (
          <>
            <h2 className="mt-6 mb-2 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: B.kirmizi }}>Reddedilen kalemler (satın alınmayacak)</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border" style={{ borderColor: B.cizgi }}>
                <thead>
                  <tr className="border-b" style={{ backgroundColor: B.baslikZemin, color: B.soluk, borderColor: B.cizgi }}>
                    <th className={thSinifi}>Ürün / hizmet</th>
                    <th className={`${thSinifi} text-right`}>Miktar</th>
                    <th className={thSinifi}>Talep eden</th>
                    <th className={thSinifi}>Red nedeni</th>
                  </tr>
                </thead>
                <tbody>
                  {redler.map((k) => (
                    <tr key={k.id} className="border-t" style={{ borderColor: B.cizgiAcik }}>
                      <td className={tdSinifi}>{k.urun}</td>
                      <td className={`${tdSinifi} text-right whitespace-nowrap tabular-nums`}>{miktarYaz(k.miktar)} {BIRIMLER[k.birim] ?? k.birim}</td>
                      <td className={`${tdSinifi} whitespace-nowrap`}>{k.talep_eden}</td>
                      <td className={tdSinifi} style={{ color: k.red_nedeni ? B.metin : B.soluk }}>{k.red_nedeni || "Belirtilmedi"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Imza alanlari */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-4 break-inside-avoid">
          <ImzaKutusu baslik="Talep eden" alt={`${liste.departman}${liste.gonderen_ad ? ` · ${liste.gonderen_ad}` : ""}`} />
          <ImzaKutusu baslik="Onaylayan" alt={liste.karar_veren_email || "Satın alma onayı"} />
          <ImzaKutusu baslik="Teslim alan" alt="Ad soyad · tarih" />
        </div>

        <p className="mt-6 pt-3 border-t text-[10.5px] leading-relaxed" style={{ borderColor: B.cizgi, color: B.soluk }}>
          Bu fiş İhracat AI Satın Alma modülünde {saTarih(liste.karar_zamani)} tarihinde elektronik olarak onaylanmıştır.
          Fiş no {liste.liste_no}. Teslim durumları fiş bağlantısından güncel olarak izlenir.
        </p>
      </article>
    </BelgeSayfasi>
  );
}

function BilgiHucresi({ etiket, deger, vurgu = false }: { etiket: string; deger: string; vurgu?: boolean }) {
  return (
    <>
      <td className="px-3 py-2 w-[22%] align-top border-r text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ backgroundColor: B.baslikZemin, color: B.soluk, borderColor: B.cizgi }}>{etiket}</td>
      <td className={`px-3 py-2 w-[28%] align-top border-r last:border-r-0 break-words ${vurgu ? "font-bold" : "font-medium"}`} style={{ borderColor: B.cizgi, color: vurgu ? B.lacivert : B.metin }}>{deger}</td>
    </>
  );
}

function ImzaKutusu({ baslik, alt }: { baslik: string; alt: string }) {
  return (
    <div className="border rounded-[2px] px-3 pt-2 pb-2.5 flex flex-col" style={{ borderColor: B.cizgi }}>
      <p className="text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color: B.lacivert }}>{baslik}</p>
      <div className="h-14" />
      <div className="border-t pt-1 text-[11px] truncate" style={{ borderColor: B.cizgi, color: B.soluk }}>{alt}</div>
    </div>
  );
}
