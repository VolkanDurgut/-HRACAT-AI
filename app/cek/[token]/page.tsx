"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, Loader2, Printer, RefreshCw } from "lucide-react";
import {
  AcilEtiketi, B, BelgeSayfasi, DurumEtiketi, Panel, TestSeridi, dugmeIkincil, tdSinifi, thSinifi,
} from "@/components/satin-alma-belge";
import { satinAlmaCagir } from "@/lib/satin-alma/api";
import { tokenBicimiGecerli } from "@/lib/ic-piyasa/genel-api";
import { BIRIMLER, KATEGORILER, listeOzeti, miktarYaz, saTarih, type SaListe } from "@/supabase/functions/_shared/satin-alma";

/**
 * ONAYLI SATIN ALMA FISI (26.10.2026 "cek listesi"; kurumsal belge 27.10.2026) - girissiz.
 * Burak Bey talebi onaylayinca olusur; execution@'ye giden "[Departman] Onayli satin
 * alma fisi" mailindeki dugme ve uygulamadaki "Onayli fisler" sekmesi buraya gelir.
 * Volkan fisi ilgili departmana iletir (baglanti ya da A4 yazdir / PDF).
 *
 * 27.10.2026 (kullanici: "Teslim alinir kismi gerekli mi anlamadim, kaldiralim"):
 * fis SADECE onayli belgedir; teslim alindi isaretleme / "Tamamlandi" takibi YOK.
 * (Veritabanindaki alindi / cek_durumu alanlari ve sa_cek_*isaretle fonksiyonlari
 * silinmedi, kullanilmiyor.)
 */

// Eski surumun tarayicida biraktigi "teslim alan" adi ilk acilista silinir.
const ESKI_AD_ANAHTARI = "sa-cek-ad";

export default function SatinAlmaFisi({ params }: { params: { token: string } }) {
  const [liste, setListe] = useState<SaListe | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);

  useEffect(() => { try { window.localStorage.removeItem(ESKI_AD_ANAHTARI); } catch { /* yoksay */ } }, []);

  const getir = useCallback(async (sessiz = false) => {
    if (!tokenBicimiGecerli(params.token)) { setHata("Bağlantı geçersiz. Lütfen e-postadaki düğmeyi kullanın."); setYukleniyor(false); return; }
    if (sessiz) setYenileniyor(true);
    const r = await satinAlmaCagir<SaListe>({ islem: "cek_bilgi", token: params.token });
    if (r.ok) { setListe(r.veri); setHata(null); } else if (!sessiz || r.durum === 404) { setListe(null); setHata(r.hata); }
    setYukleniyor(false);
    setYenileniyor(false);
  }, [params.token]);
  useEffect(() => { getir(); }, [getir]);

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
                <tr><td className="pr-3 py-0.5" style={{ color: B.soluk }}>Durum</td><td><DurumEtiketi renk={B.yesil}>Onaylı</DurumEtiketi></td></tr>
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
              <BilgiHucresi etiket="Onaylanan kalem" deger={`${o.onay} / ${o.toplam}`} vurgu />
              <BilgiHucresi etiket="Reddedilen kalem" deger={o.red ? String(o.red) : "Yok"} />
            </tr>
          </tbody>
        </table>
        {liste.karar_notu && (
          <p className="mt-3 text-[12.5px] border-l-2 pl-3 py-1" style={{ borderColor: B.seftali }}>
            <span className="font-semibold" style={{ color: B.soluk }}>Onay notu: </span>{liste.karar_notu}
          </p>
        )}

        {/* Onaylanan kalemler */}
        <h2 className="mt-6 mb-2 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: B.lacivert }}>Onaylanan kalemler ({onaylar.length})</h2>
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
              </tr>
            </thead>
            <tbody>
              {onaylar.map((k, i) => (
                <tr key={k.id} className="border-t break-inside-avoid" style={{ borderColor: B.cizgi }}>
                  <td className={`${tdSinifi} text-right tabular-nums`} style={{ color: B.soluk }}>{i + 1}</td>
                  <td className={tdSinifi}>
                    <span className="font-semibold break-words">{k.urun}</span> {k.aciliyet === "acil" && <AcilEtiketi />}
                    {k.aciklama && <span className="block text-[11.5px] mt-0.5 break-words" style={{ color: B.soluk }}>{k.aciklama}</span>}
                  </td>
                  <td className={`${tdSinifi} whitespace-nowrap`} style={{ color: B.soluk }}>{KATEGORILER[k.kategori] ?? k.kategori}</td>
                  <td className={`${tdSinifi} text-right tabular-nums font-bold whitespace-nowrap`}>{miktarYaz(k.miktar)}</td>
                  <td className={`${tdSinifi} whitespace-nowrap`}>{BIRIMLER[k.birim] ?? k.birim}</td>
                  <td className={`${tdSinifi} whitespace-nowrap`}>{k.talep_eden}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {islemHatasi && <p className="mt-2 text-[13px] font-medium print:hidden" role="alert" style={{ color: B.kirmizi }}>{islemHatasi}</p>}

        {/* Reddedilen kalemler */}
        {redler.length > 0 && (
          <>
            <h2 className="mt-6 mb-2 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: B.kirmizi }}>Reddedilen kalemler ({redler.length}) · satın alınmayacak</h2>
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

        {/* Elektronik onay kaydi (islak imza gerekmez: onay sistemde verildi) */}
        <div className="mt-7 border rounded-[2px] px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 break-inside-avoid" style={{ borderColor: B.cizgi, borderLeft: `3px solid ${B.yesil}` }}>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: B.yesil }}>
            <Check size={13} strokeWidth={3} /> Elektronik onay
          </span>
          <span className="text-[12.5px]"><span style={{ color: B.soluk }}>Onaylayan: </span><b>{liste.karar_veren_email || "-"}</b></span>
          <span className="text-[12.5px]"><span style={{ color: B.soluk }}>Tarih: </span><b>{saTarih(liste.karar_zamani)}</b></span>
        </div>

        <p className="mt-5 pt-3 border-t text-[10.5px] leading-relaxed" style={{ borderColor: B.cizgi, color: B.soluk }}>
          Bu fiş İhracat AI Satın Alma modülünde elektronik olarak onaylanmıştır; ıslak imza gerektirmez.
          Fiş no {liste.liste_no}.
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
