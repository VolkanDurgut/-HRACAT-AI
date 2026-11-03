"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCheck, Copy, Loader2, Printer, RefreshCw, Undo2 } from "lucide-react";
import {
  AcilEtiketi, B, BelgeSayfasi, DurumEtiketi, Panel, TestSeridi, dugmeAna, dugmeIkincil, girdiSinifi, girdiStil, tdSinifi, thSinifi,
} from "@/components/satin-alma-belge";
import { satinAlmaCagir } from "@/lib/satin-alma/api";
import { tokenBicimiGecerli } from "@/lib/ic-piyasa/genel-api";
import {
  BIRIMLER, KATEGORILER, adSoyadDuzelt, adSoyadGecerli, listeOzeti, miktarYaz, saTarih, tedarikciDuzelt, tedarikciGruplari, type SaKalem, type SaListe,
} from "@/supabase/functions/_shared/satin-alma";

/**
 * ONAYLI SATIN ALMA FISI (26.10.2026 "cek listesi"; kurumsal belge 27.10.2026) - girissiz.
 * Burak Bey talebi onaylayinca olusur; execution@'ye giden "[Departman] Onayli satin
 * alma fisi" mailindeki dugme ve uygulamadaki "Onayli fisler" sekmesi buraya gelir.
 * Volkan fisi ilgili departmana iletir (baglanti ya da A4 yazdir / PDF).
 *
 * TESLIM TAKIBI (03.11.2026, kullanici: "Siparislerini verdik ve geldi. Simdi teslim
 * edecegiz fakat nasil izleyebiliriz?"; 27.10'da kaldirilmisti, kullanici onayiyla geri).
 * Teslim alan kisi bu baglantida ad soyadini yazip kalemi "Teslim aldim" olarak isaretler
 * (edge "cek_isaretle" -> sa_cek_token_isaretle; ad soyad sunucuda da zorunlu). Hepsi
 * teslim alininca fis "Teslim tamamlandi" olur. Ad tarayicida HATIRLANMAZ.
 * Satin alma ayni isaretlemeyi uygulamadaki "Onayli fisler"den yapar.
 */

// Eski surumun tarayicida biraktigi "teslim alan" adi ilk acilista silinir (ad hatirlanmaz).
const ESKI_AD_ANAHTARI = "sa-cek-ad";

export default function SatinAlmaFisi({ params }: { params: { token: string } }) {
  const [liste, setListe] = useState<SaListe | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [ad, setAd] = useState("");
  const [isleniyor, setIsleniyor] = useState<string | null>(null);
  const [geriAlinacak, setGeriAlinacak] = useState<string | null>(null);

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

  // Teslim aldim / geri al. Isaretlerken ad soyad zorunlu, geri alirken degil.
  const isaretle = async (k: SaKalem, alindi: boolean): Promise<boolean> => {
    setIslemHatasi(null);
    if (alindi && !adSoyadGecerli(ad)) {
      setIslemHatasi("Teslim aldım olarak işaretlemek için üstteki “Teslim alan” alanına adınızı ve soyadınızı yazın.");
      document.getElementById("sa-teslim-alan")?.focus();
      return false;
    }
    const r = await satinAlmaCagir<SaListe>({ islem: "cek_isaretle", token: params.token, kalem_id: k.id, alindi, ad: alindi ? adSoyadDuzelt(ad) : "" });
    if (!r.ok) { setIslemHatasi(r.hata); return false; }
    setListe(r.veri);
    return true;
  };
  const tekIsaretle = async (k: SaKalem, alindi: boolean) => {
    setIsleniyor(k.id); setGeriAlinacak(null);
    await isaretle(k, alindi);
    setIsleniyor(null);
  };
  const tumunuIsaretle = async (bekleyenler: SaKalem[]) => {
    if (!adSoyadGecerli(ad)) { await isaretle(bekleyenler[0], true); return; }
    setIsleniyor("hepsi");
    for (const k of bekleyenler) { if (!(await isaretle(k, true))) break; }
    setIsleniyor(null);
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
  const bekleyenler = onaylar.filter((k) => !k.alindi);
  const tamam = onaylar.length > 0 && bekleyenler.length === 0;
  // 31.10.2026: tedarikci girilmisse alisveris sirasi icin tedarikci bazinda gruplanir
  // (gruplar ilk gorunus sirasiyla; tedarikcisizler en sonda). Sira no gruplar boyunca ardisik.
  const gruplu = onaylar.some((k) => tedarikciDuzelt(k.tedarikci));
  const gruplar = gruplu ? tedarikciGruplari(onaylar) : [{ tedarikci: null, kalemler: onaylar }];
  const sira = new Map<string, number>();
  gruplar.flatMap((g) => g.kalemler).forEach((k, i) => sira.set(k.id, i + 1));

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
        {bekleyenler.length > 0 && (
          <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[180px] sm:w-60 sm:flex-none">
              <span className="block text-[10.5px] font-semibold uppercase tracking-[0.07em] mb-1" style={{ color: B.soluk }}>Teslim alan (ad soyad)</span>
              <input id="sa-teslim-alan" value={ad} onChange={(e) => setAd(e.target.value)} maxLength={80} placeholder="Ad Soyad" autoComplete="off" className={girdiSinifi} style={girdiStil} />
            </label>
            <button onClick={() => tumunuIsaretle(bekleyenler)} disabled={isleniyor !== null} className={dugmeAna} style={{ backgroundColor: B.yesil }} data-testid="cek-tumunu">
              {isleniyor === "hepsi" ? <Loader2 size={14} className="animate-spin" /> : <CheckCheck size={15} />} Tümünü teslim aldım ({bekleyenler.length})
            </button>
          </div>
        )}
      </div>
      {islemHatasi && <p className="print:hidden -mt-1 mb-3 text-[13px] font-medium" role="alert" style={{ color: B.kirmizi }}>{islemHatasi}</p>}
      {liste.test && <div className="mb-3 print:mb-2"><TestSeridi>Bu fiş test departmanına aittir; e-postaları yalnızca test adresine gönderilir.</TestSeridi></div>}

      {/* A4 belge */}
      <article className="fis-kagit mx-auto max-w-[210mm] border rounded-[2px] px-5 sm:px-10 py-7 sm:py-9 shadow-sm"
        style={{ backgroundColor: "#fff", borderColor: B.cizgi, color: B.metin }}>
        {/* Baslik */}
        <header className="flex flex-wrap items-start justify-between gap-5 pb-5 print:pb-3 border-b-2" style={{ borderColor: B.lacivert }}>
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
                <tr><td className="pr-3 py-0.5" style={{ color: B.soluk }}>Durum</td><td data-testid="cek-durum">{onaylar.length === 0 ? <DurumEtiketi renk={B.kirmizi}>Reddedildi</DurumEtiketi> : tamam ? <DurumEtiketi renk={B.yesil}>Teslim tamamlandı</DurumEtiketi> : <DurumEtiketi renk={B.turuncu}>Teslim bekliyor · {o.alinan}/{o.onay}</DurumEtiketi>}</td></tr>
              </tbody>
            </table>
          </div>
        </header>

        {/* Bilgi tablosu */}
        <table className="w-full mt-5 print:mt-3 text-[12.5px] border" style={{ borderColor: B.cizgi }}>
          <tbody>
            <tr className="border-b" style={{ borderColor: B.cizgi }}>
              <BilgiHucresi etiket="Talep eden departman" deger={liste.departman} vurgu />
              <BilgiHucresi etiket="Talep formunu gönderen" deger={liste.gonderen_ad || "-"} />
            </tr>
            <tr className="border-b" style={{ borderColor: B.cizgi }}>
              <BilgiHucresi etiket="Talep tarihi" deger={saTarih(liste.gonderim_zamani)} />
              <BilgiHucresi etiket="Onaylayan" deger={liste.karar_veren_email || "-"} />
            </tr>
            <tr className="border-b" style={{ borderColor: B.cizgi }}>
              <BilgiHucresi etiket="Onaylanan kalem" deger={`${o.onay} / ${o.toplam}`} vurgu />
              <BilgiHucresi etiket="Reddedilen kalem" deger={o.red ? String(o.red) : "Yok"} />
            </tr>
            <tr>
              <BilgiHucresi etiket="Teslim" deger={`${o.alinan} / ${o.onay} kalem teslim alındı`} vurgu={tamam} />
              <BilgiHucresi etiket={tamam ? "Tamamlanma" : "Bekleyen"} deger={tamam ? saTarih(liste.cek_tamamlanma) : `${bekleyenler.length} kalem`} />
            </tr>
          </tbody>
        </table>
        {liste.karar_notu && (
          <p className="mt-3 text-[12.5px] border-l-2 pl-3 py-1" style={{ borderColor: B.seftali }}>
            <span className="font-semibold" style={{ color: B.soluk }}>Onay notu: </span>{liste.karar_notu}
          </p>
        )}

        {/* Onaylanan kalemler */}
        <h2 className="mt-6 print:mt-4 mb-2 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: B.lacivert }}>Onaylanan kalemler ({onaylar.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border" style={{ borderColor: B.cizgi }}>
            <thead>
              <tr style={{ backgroundColor: B.lacivert, color: "#fff" }}>
                <th className={`${thSinifi} w-9 text-right`}>Sıra</th>
                <th className={thSinifi}>Ürün / hizmet</th>
                <th className={thSinifi}>Kategori</th>
                <th className={`${thSinifi} text-right`}>Miktar</th>
                <th className={thSinifi}>Birim</th>
                <th className={thSinifi}>Talep eden</th>
                <th className={`${thSinifi} w-[160px]`}>Teslim</th>
              </tr>
            </thead>
            <tbody>
              {gruplar.map((g) => (
                <React.Fragment key={g.tedarikci ?? "-"}>
                  {gruplu && (
                    <tr className="border-t break-inside-avoid" style={{ borderColor: B.cizgi, backgroundColor: B.baslikZemin }}>
                      <td colSpan={7} className="px-3 py-1.5 text-[11.5px] font-bold" data-testid="fis-tedarikci" style={{ color: B.lacivert }}>
                        {g.tedarikci ?? "Tedarikçi belirtilmemiş"} <span className="font-normal" style={{ color: B.soluk }}>· {g.kalemler.length} kalem</span>
                      </td>
                    </tr>
                  )}
                  {g.kalemler.map((k) => (
                <tr key={k.id} className="border-t break-inside-avoid" style={{ borderColor: B.cizgi, backgroundColor: k.alindi ? "#F4FAF6" : undefined }} data-testid="cek-kalem">
                  <td className={`${tdSinifi} text-right tabular-nums`} style={{ color: B.soluk }}>{sira.get(k.id)}</td>
                  <td className={tdSinifi}>
                    <span className="font-semibold break-words">{k.urun}</span> {k.aciliyet === "acil" && <AcilEtiketi />}
                    {k.aciklama && <span className="block text-[11.5px] mt-0.5 break-words" style={{ color: B.soluk }}>{k.aciklama}</span>}
                  </td>
                  <td className={`${tdSinifi} whitespace-nowrap`} style={{ color: B.soluk }}>{KATEGORILER[k.kategori] ?? k.kategori}</td>
                  <td className={`${tdSinifi} text-right tabular-nums font-bold whitespace-nowrap`}>{miktarYaz(k.miktar)}</td>
                  <td className={`${tdSinifi} whitespace-nowrap`}>{BIRIMLER[k.birim] ?? k.birim}</td>
                  <td className={`${tdSinifi} whitespace-nowrap`}>{k.talep_eden}</td>
                  <td className={`${tdSinifi} py-2`}>
                    <TeslimHucresi k={k} isleniyor={isleniyor} geriSor={geriAlinacak === k.id}
                      onIsaretle={() => tekIsaretle(k, true)} onGeriSor={() => setGeriAlinacak(k.id)}
                      onGeriAl={() => tekIsaretle(k, false)} onVazgec={() => setGeriAlinacak(null)} />
                  </td>
                </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Reddedilen kalemler */}
        {redler.length > 0 && (
          <>
            <h2 className="mt-6 print:mt-4 mb-2 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: B.kirmizi }}>Reddedilen kalemler ({redler.length}) · satın alınmayacak</h2>
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
        <div className="mt-7 print:mt-4 border rounded-[2px] px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 break-inside-avoid" style={{ borderColor: B.cizgi, borderLeft: `3px solid ${B.yesil}` }}>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: B.yesil }}>
            <Check size={13} strokeWidth={3} /> Elektronik onay
          </span>
          <span className="text-[12.5px]"><span style={{ color: B.soluk }}>Onaylayan: </span><b>{liste.karar_veren_email || "-"}</b></span>
          <span className="text-[12.5px]"><span style={{ color: B.soluk }}>Tarih: </span><b>{saTarih(liste.karar_zamani)}</b></span>
        </div>

        <p className="mt-5 pt-3 print:mt-3 print:pt-2 border-t text-[10.5px] leading-relaxed" style={{ borderColor: B.cizgi, color: B.soluk }}>
          Bu fiş İhracat AI Satın Alma modülünde elektronik olarak onaylanmıştır; ıslak imza gerektirmez.
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

/** Kalemin teslim hucresi: bekliyor -> kutu (tikla = teslim aldim); alindi -> tarih + ad (+ geri al). */
function TeslimHucresi({ k, isleniyor, geriSor, onIsaretle, onGeriSor, onGeriAl, onVazgec }: {
  k: SaKalem; isleniyor: string | null; geriSor: boolean;
  onIsaretle: () => void; onGeriSor: () => void; onGeriAl: () => void; onVazgec: () => void;
}) {
  const mesgul = isleniyor !== null;
  if (!k.alindi) {
    return (
      <button onClick={onIsaretle} disabled={mesgul} aria-label={`${k.urun} teslim aldım`} data-testid="cek-isaretle"
        className="inline-flex items-center gap-2 text-[12px] font-medium disabled:opacity-60 print:pointer-events-none" style={{ color: B.soluk }}>
        <span className="shrink-0 w-[18px] h-[18px] rounded-[2px] border-[1.5px] flex items-center justify-center bg-white" style={{ borderColor: B.lacivert2 }}>
          {isleniyor === k.id && <Loader2 size={11} className="animate-spin" style={{ color: B.lacivert2 }} />}
        </span>
        <span className="print:hidden">Teslim bekliyor</span>
      </button>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0 w-[18px] h-[18px] mt-px rounded-[2px] flex items-center justify-center text-white" style={{ backgroundColor: B.yesil }} aria-hidden>
        {isleniyor === k.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={12} strokeWidth={3} />}
      </span>
      <span className="text-[11.5px] leading-tight min-w-0" data-testid="cek-teslim-bilgi">
        <b style={{ color: B.yesil }}>{saTarih(k.alinma_zamani)}</b>
        {k.alan_ad && <span className="block break-words" style={{ color: B.metin }}>{k.alan_ad}</span>}
        <span className="print:hidden">
          {geriSor ? (
            <span className="flex items-center gap-2 mt-1">
              <button onClick={onGeriAl} disabled={mesgul} className="font-semibold underline disabled:opacity-60" style={{ color: B.kirmizi }}>Geri al</button>
              <button onClick={onVazgec} className="underline" style={{ color: B.soluk }}>Vazgeç</button>
            </span>
          ) : (
            <button onClick={onGeriSor} disabled={mesgul} className="mt-1 inline-flex items-center gap-1 underline disabled:opacity-60" style={{ color: B.soluk }} aria-label={`${k.urun} teslimini geri al`}>
              <Undo2 size={11} /> Geri al
            </button>
          )}
        </span>
      </span>
    </div>
  );
}
