"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, FileText, Loader2, RefreshCw, Truck, Clock, PackageCheck } from "lucide-react";
import { GENEL, GenelKart, GenelSayfaCerceve } from "@/components/genel-sayfa-cerceve";
import { icPiyasaCagir, tokenBicimiGecerli, trSaat, trTarihSaat } from "@/lib/ic-piyasa/genel-api";

/**
 * Musteri siparis takip sayfasi (12.10.2026) - girissiz, kisiye ozel baglanti.
 * WhatsApp mesajlarindaki "Siparisim" baglantisi buraya gelir. Veri
 * "ic-piyasa" edge function'indan (islem: takip) gelir; irsaliye PDF'leri
 * 15 dakikalik imzali baglantilarla acilir.
 */

type Sevk = {
  plaka: string; dorse_plaka: string | null; net_kg: number; irsaliye_no: string | null; irsaliye_tarihi: string | null;
  yukleme: string; cikis_durumu: "bekliyor" | "planlandi" | "cikti" | "bugun_degil"; cikis_planlanan: string | null; cikis_zamani: string | null; pdf: string | null;
};
type Takip = {
  is_emri_no: string; durum: "acik" | "tamamlandi" | "iptal"; urun: string; ambalaj: string | null;
  hedef_tur: "kg" | "arac"; hedef_kg: number | null; hedef_arac: number | null;
  birim_fiyat: number | null; kdv_dahil: boolean; vade_gun: number | null; odeme: string | null;
  teslim: string | null; teslim_adresi: string | null; musteri_siparis_no: string | null;
  olusturma: string; kapanis_zamani: string | null; musteri: string; sevkler: Sevk[];
};

const kg = (n: number) => `${Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} kg`;
const tl = (n: number) => Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function cikisMetni(s: Sevk): { metin: string; renk: string } {
  if (s.cikis_durumu === "cikti") return { metin: `Yola çıktı · ${trTarihSaat(s.cikis_zamani)}`, renk: GENEL.yesil };
  if (s.cikis_durumu === "planlandi") return { metin: `Yüklendi · planlanan çıkış ${trSaat(s.cikis_planlanan)}`, renk: GENEL.turuncu };
  return { metin: "Yüklendi · çıkış planlanıyor", renk: GENEL.turuncu };
}

export default function TakipSayfasi({ params }: { params: { token: string } }) {
  const [veri, setVeri] = useState<Takip | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [sonGuncelleme, setSonGuncelleme] = useState<Date | null>(null);

  const getir = useCallback(async () => {
    if (!tokenBicimiGecerli(params.token)) { setHata("Bağlantı geçersiz. Lütfen mesajdaki bağlantıyı eksiksiz açın."); setYukleniyor(false); return; }
    setYukleniyor(true);
    const r = await icPiyasaCagir<Takip>({ islem: "takip", token: params.token });
    if (r.ok) { setVeri(r.veri); setHata(null); setSonGuncelleme(new Date()); }
    else setHata(r.durum === 404 ? "Sipariş bulunamadı. Bağlantının süresi dolmuş ya da sipariş kaldırılmış olabilir." : r.hata);
    setYukleniyor(false);
  }, [params.token]);

  useEffect(() => { getir(); }, [getir]);

  if (yukleniyor && !veri) {
    return <GenelSayfaCerceve ust="Sipariş Takibi"><div className="flex justify-center py-20"><Loader2 className="animate-spin" size={28} style={{ color: GENEL.lacivert2 }} /></div></GenelSayfaCerceve>;
  }
  if (!veri) {
    return (
      <GenelSayfaCerceve ust="Sipariş Takibi">
        <GenelKart><p className="text-base font-semibold">{hata}</p><p className="text-sm mt-2" style={{ color: GENEL.soluk }}>Yardım için: Burak Tuncay · 0541 339 60 04</p></GenelKart>
      </GenelSayfaCerceve>
    );
  }

  const toplamKg = veri.sevkler.reduce((t, s) => t + Number(s.net_kg), 0);
  const cikan = veri.sevkler.filter((s) => s.cikis_durumu === "cikti").length;
  const hedef = veri.hedef_tur === "kg" ? `${(Number(veri.hedef_kg) / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 })} ton` : `${veri.hedef_arac} araç`;
  const oran = veri.hedef_tur === "kg" ? (veri.hedef_kg ? toplamKg / Number(veri.hedef_kg) : 0) : (veri.hedef_arac ? veri.sevkler.length / veri.hedef_arac : 0);
  const adimlar = [
    { ad: "Sipariş alındı", tamam: true, alt: trTarihSaat(veri.olusturma), ikon: CheckCircle2 },
    { ad: "Yükleme ve sevkiyat", tamam: veri.sevkler.length > 0, alt: veri.sevkler.length ? `${veri.sevkler.length} araç yüklendi · ${cikan} araç yola çıktı` : "Yükleme bekleniyor", ikon: Truck },
    { ad: "Tamamlandı", tamam: veri.durum === "tamamlandi", alt: veri.durum === "tamamlandi" ? trTarihSaat(veri.kapanis_zamani) : "Devam ediyor", ikon: PackageCheck },
  ];

  return (
    <GenelSayfaCerceve ust="Sipariş Takibi">
      <div className="space-y-4">
        <GenelKart>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold tracking-wider" style={{ color: GENEL.soluk }}>SİPARİŞ NO</p>
              <p className="text-2xl font-bold">{veri.is_emri_no}</p>
              <p className="text-sm mt-1" style={{ color: GENEL.soluk }}>{veri.musteri}</p>
            </div>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={veri.durum === "tamamlandi" ? { backgroundColor: "#E3F2EA", color: GENEL.yesil } : veri.durum === "iptal" ? { backgroundColor: "#EEE", color: "#555" } : { backgroundColor: "#FCEBE2", color: GENEL.turuncu }}>
              {veri.durum === "tamamlandi" ? "Tamamlandı" : veri.durum === "iptal" ? "İptal edildi" : "Devam ediyor"}
            </span>
          </div>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <Bilgi etiket="Ürün" deger={`${veri.urun}${veri.ambalaj ? ` (${veri.ambalaj})` : ""}`} />
            <Bilgi etiket="Sipariş miktarı" deger={hedef} />
            <Bilgi etiket="Yüklenen" deger={kg(toplamKg)} />
            <Bilgi etiket="Teslim" deger={veri.teslim || "-"} />
          </div>
          {veri.durum !== "iptal" && (
            <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#ECEAE3" }} aria-label={`İlerleme yüzde ${Math.min(100, Math.round(oran * 100))}`}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(oran * 100))}%`, backgroundColor: veri.durum === "tamamlandi" ? GENEL.yesil : GENEL.lacivert2 }} />
            </div>
          )}
        </GenelKart>

        <GenelKart>
          <h2 className="text-sm font-bold tracking-wider mb-4" style={{ color: GENEL.soluk }}>DURUM</h2>
          <ol className="space-y-4">
            {adimlar.map((a) => {
              const Ikon = a.tamam ? a.ikon : Circle;
              return (
                <li key={a.ad} className="flex items-start gap-3">
                  <Ikon size={22} className="shrink-0 mt-0.5" style={{ color: a.tamam ? GENEL.yesil : "#B9B6AC" }} />
                  <div>
                    <p className="font-semibold">{a.ad}</p>
                    <p className="text-sm" style={{ color: GENEL.soluk }}>{a.alt}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </GenelKart>

        <GenelKart>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold tracking-wider" style={{ color: GENEL.soluk }}>ARAÇLAR VE İRSALİYELER</h2>
            <button onClick={getir} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border hover:bg-black/[0.03]" style={{ borderColor: GENEL.cizgi }} aria-label="Yenile">
              <RefreshCw size={13} className={yukleniyor ? "animate-spin" : ""} /> Yenile
            </button>
          </div>
          {veri.sevkler.length === 0 ? (
            <p className="text-sm flex items-center gap-2" style={{ color: GENEL.soluk }}><Clock size={16} /> Henüz yüklenen araç yok. Araç yüklendiğinde burada görünecek.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: GENEL.cizgi }}>
              {veri.sevkler.map((s, i) => {
                const c = cikisMetni(s);
                return (
                  <li key={i} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold tracking-wide">{s.plaka}{s.dorse_plaka && <span className="font-normal text-sm" style={{ color: GENEL.soluk }}> · Dorse {s.dorse_plaka}</span>}</p>
                      <p className="text-sm" style={{ color: GENEL.soluk }}>{kg(s.net_kg)}{s.irsaliye_no ? ` · İrsaliye ${s.irsaliye_no}` : ""}</p>
                      <p className="text-sm font-medium mt-0.5" style={{ color: c.renk }}>{c.metin}</p>
                    </div>
                    {s.pdf && (
                      <a href={s.pdf} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg text-white hover:opacity-90" style={{ backgroundColor: GENEL.lacivert2 }}>
                        <FileText size={15} /> İrsaliye
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </GenelKart>

        <GenelKart>
          <h2 className="text-sm font-bold tracking-wider mb-4" style={{ color: GENEL.soluk }}>TİCARİ KOŞULLAR</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <Bilgi etiket="Birim fiyat" deger={veri.birim_fiyat !== null ? `${tl(veri.birim_fiyat)} TL/kg ${veri.kdv_dahil ? "(KDV dahil)" : "+ KDV"}` : "-"} />
            <Bilgi etiket="Vade" deger={veri.vade_gun === null ? "-" : veri.vade_gun === 0 ? "Peşin" : `${veri.vade_gun} gün`} />
            <Bilgi etiket="Ödeme" deger={veri.odeme || "-"} />
            <Bilgi etiket="Sipariş no (sizin)" deger={veri.musteri_siparis_no || "-"} />
          </div>
          {veri.teslim_adresi && <p className="text-sm mt-4" style={{ color: GENEL.soluk }}>Teslim adresi: {veri.teslim_adresi}</p>}
        </GenelKart>

        <p className="text-xs text-center" style={{ color: GENEL.soluk }}>
          Bu sayfa size özeldir; bağlantıyı yalnızca yetkili kişilerle paylaşın.{sonGuncelleme ? ` Son güncelleme ${sonGuncelleme.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}.` : ""}
        </p>
      </div>
    </GenelSayfaCerceve>
  );
}

function Bilgi({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs" style={{ color: GENEL.soluk }}>{etiket}</p>
      <p className="font-semibold mt-0.5 break-words">{deger}</p>
    </div>
  );
}
