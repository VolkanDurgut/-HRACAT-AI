"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, Truck, XCircle, AlertTriangle } from "lucide-react";
import { GENEL, GenelKart, GenelSayfaCerceve } from "@/components/genel-sayfa-cerceve";
import { icPiyasaCagir, tokenBicimiGecerli, trSaat, trTarihSaat } from "@/lib/ic-piyasa/genel-api";

/**
 * Lojistik arac cikis bildirimi (12.10.2026) - girissiz, araca ozel baglanti.
 * Kantar irsaliyeyi onaylayinca lojistige giden e-postadaki "Cikisi bildir"
 * dugmesi buraya gelir. Uc secenek: Simdi cikiyor / Saat sec / Bugun cikmayacak.
 * Musteriye "yola cikti" mesaji SADECE "Simdi cikiyor" ile hazirlanir.
 */

type Bilgi = {
  plaka: string; dorse_plaka: string | null; net_kg: number; irsaliye_no: string | null; yukleme: string;
  cikis_durumu: "bekliyor" | "planlandi" | "cikti" | "bugun_degil"; cikis_planlanan: string | null; cikis_zamani: string | null; cikis_isleyen: string | null;
  is_emri_no: string; is_emri_durum: string; urun: string; ambalaj: string | null; teslim: string | null; teslim_adresi: string | null; musteri: string;
};

const AD_ANAHTAR = "ic-cikis-ad";

/** Varsayilan saat: simdiden 1 saat sonra, 15 dk'ya yuvarli, yerel "HH:MM" */
function varsayilanSaat(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" });
}

/** "15:30" -> bugunun (TR) o saati; gecmisse yarin. ISO doner. */
function saattenIso(hhmm: string): string | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const sa = Number(m[1]), dk = Number(m[2]);
  if (sa > 23 || dk > 59) return null;
  const bugun = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  let t = Date.parse(`${bugun}T${String(sa).padStart(2, "0")}:${String(dk).padStart(2, "0")}:00+03:00`);
  if (t < Date.now() - 5 * 60 * 1000) t += 24 * 60 * 60 * 1000;
  return new Date(t).toISOString();
}

export default function CikisSayfasi({ params }: { params: { token: string } }) {
  const [bilgi, setBilgi] = useState<Bilgi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [isleniyor, setIsleniyor] = useState(false);
  const [mod, setMod] = useState<"secim" | "saat" | "bugun">("secim");
  const [saat, setSaat] = useState(varsayilanSaat());
  const [ad, setAd] = useState("");
  const [sonuc, setSonuc] = useState<string | null>(null);

  useEffect(() => { try { setAd(window.localStorage.getItem(AD_ANAHTAR) || ""); } catch { /* yoksay */ } }, []);

  const getir = useCallback(async () => {
    if (!tokenBicimiGecerli(params.token)) { setHata("Bağlantı geçersiz. Lütfen e-postadaki düğmeyi kullanın."); setYukleniyor(false); return; }
    const r = await icPiyasaCagir<Bilgi>({ islem: "cikis_bilgi", token: params.token });
    if (r.ok) { setBilgi(r.veri); setHata(null); } else setHata(r.hata);
    setYukleniyor(false);
  }, [params.token]);
  useEffect(() => { getir(); }, [getir]);

  const uygula = async (karar: "cikti" | "planla" | "bugun_degil") => {
    setHata(null);
    let iso: string | null = null;
    if (karar === "planla") {
      iso = saattenIso(saat);
      if (!iso) { setHata("Saati SS:DD biçiminde girin. Örnek: 15:30"); return; }
    }
    try { if (ad.trim()) window.localStorage.setItem(AD_ANAHTAR, ad.trim()); } catch { /* yoksay */ }
    setIsleniyor(true);
    const r = await icPiyasaCagir<{ durum: string; zaten?: boolean }>({ islem: "cikis_uygula", token: params.token, karar, saat: iso, ad: ad.trim() || undefined });
    setIsleniyor(false);
    if (!r.ok) { setHata(r.hata); return; }
    setSonuc(
      r.veri.zaten ? "Bu araç zaten yola çıktı olarak işaretlenmiş." :
      karar === "cikti" ? "Teşekkürler. Araç yola çıktı olarak kaydedildi; müşteri bilgilendirmesi hazırlandı." :
      karar === "planla" ? `Teşekkürler. Planlanan çıkış ${trSaat(iso)} olarak kaydedildi. O saatte size tekrar sorulacak.` :
      "Teşekkürler. Aracın bugün çıkmayacağı yetkiliye bildirildi. Müşteriye bir şey gönderilmedi."
    );
    setMod("secim");
    getir();
  };

  if (yukleniyor) {
    return <GenelSayfaCerceve ust="Araç Çıkış Bildirimi"><div className="flex justify-center py-20"><Loader2 className="animate-spin" size={28} style={{ color: GENEL.lacivert2 }} /></div></GenelSayfaCerceve>;
  }
  if (!bilgi) {
    return <GenelSayfaCerceve ust="Araç Çıkış Bildirimi"><GenelKart><p className="font-semibold">{hata}</p></GenelKart></GenelSayfaCerceve>;
  }

  const cikti = bilgi.cikis_durumu === "cikti";
  const iptal = bilgi.is_emri_durum === "iptal";

  return (
    <GenelSayfaCerceve ust="Araç Çıkış Bildirimi">
      <div className="space-y-4">
        <GenelKart>
          <p className="text-xs font-semibold tracking-wider" style={{ color: GENEL.soluk }}>ARAÇ</p>
          <p className="text-3xl font-bold tracking-wide">{bilgi.plaka}</p>
          {bilgi.dorse_plaka && <p className="text-sm" style={{ color: GENEL.soluk }}>Dorse: {bilgi.dorse_plaka}</p>}
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <Alan etiket="Sipariş" deger={bilgi.is_emri_no} />
            <Alan etiket="Müşteri" deger={bilgi.musteri} />
            <Alan etiket="Ürün" deger={`${bilgi.urun}${bilgi.ambalaj ? ` (${bilgi.ambalaj})` : ""}`} />
            <Alan etiket="Net miktar" deger={`${Number(bilgi.net_kg).toLocaleString("tr-TR")} kg`} />
            <Alan etiket="İrsaliye" deger={bilgi.irsaliye_no || "-"} />
            <Alan etiket="Yükleme" deger={trTarihSaat(bilgi.yukleme)} />
          </div>
          {bilgi.teslim_adresi && <p className="text-sm mt-4" style={{ color: GENEL.soluk }}>Teslim: {bilgi.teslim || "-"} · {bilgi.teslim_adresi}</p>}
        </GenelKart>

        <GenelKart>
          <p className="text-xs font-semibold tracking-wider mb-2" style={{ color: GENEL.soluk }}>DURUM</p>
          <p className="text-lg font-semibold" style={{ color: cikti ? GENEL.yesil : GENEL.turuncu }}>
            {cikti ? `Yola çıktı · ${trTarihSaat(bilgi.cikis_zamani)}` :
             bilgi.cikis_durumu === "planlandi" ? `Planlanan çıkış: ${trSaat(bilgi.cikis_planlanan)}` :
             bilgi.cikis_durumu === "bugun_degil" ? "Bugün çıkmayacak olarak bildirildi" : "Çıkış bildirimi bekleniyor"}
          </p>
          {bilgi.cikis_isleyen && <p className="text-xs mt-1" style={{ color: GENEL.soluk }}>Son işlem: {bilgi.cikis_isleyen}</p>}
          {sonuc && <p className="mt-3 text-sm font-medium rounded-lg px-3 py-2" style={{ backgroundColor: "#E3F2EA", color: GENEL.yesil }}>{sonuc}</p>}
          {iptal && <p className="mt-3 text-sm font-medium flex items-center gap-1.5" style={{ color: GENEL.turuncu }}><AlertTriangle size={15} /> Bu sipariş iptal edildi; çıkış işlenemez.</p>}
        </GenelKart>

        {!cikti && !iptal && (
          <GenelKart>
            <label className="block mb-4">
              <span className="block text-xs mb-1" style={{ color: GENEL.soluk }}>Adınız (isteğe bağlı, kayda yazılır)</span>
              <input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Ör. Süleyman" className="w-full px-3 py-2.5 rounded-lg border text-base" style={{ borderColor: GENEL.cizgi }} />
            </label>

            {mod === "secim" && (
              <div className="grid gap-3">
                <button disabled={isleniyor} onClick={() => uygula("cikti")} className="w-full inline-flex items-center justify-center gap-2 px-4 py-4 rounded-xl text-lg font-bold text-white disabled:opacity-60" style={{ backgroundColor: GENEL.yesil }}>
                  {isleniyor ? <Loader2 size={20} className="animate-spin" /> : <Truck size={20} />} Şimdi çıkıyor
                </button>
                <button disabled={isleniyor} onClick={() => setMod("saat")} className="w-full inline-flex items-center justify-center gap-2 px-4 py-4 rounded-xl text-lg font-bold disabled:opacity-60" style={{ backgroundColor: GENEL.seftali, color: GENEL.lacivert }}>
                  <Clock size={20} /> Saat seç
                </button>
                <button disabled={isleniyor} onClick={() => setMod("bugun")} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-base font-semibold border disabled:opacity-60" style={{ borderColor: GENEL.cizgi, color: GENEL.metin }}>
                  <XCircle size={18} /> Bugün çıkmayacak
                </button>
              </div>
            )}

            {mod === "saat" && (
              <div className="space-y-3">
                <p className="font-semibold">Araç saat kaçta çıkacak?</p>
                <div className="flex flex-wrap gap-2">
                  {[30, 60, 120].map((dk) => (
                    <button key={dk} onClick={() => { const d = new Date(Date.now() + dk * 60000); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0); setSaat(d.toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" })); }}
                      className="px-3 py-2 rounded-lg border text-sm font-medium" style={{ borderColor: GENEL.cizgi }}>
                      {dk < 60 ? `${dk} dk sonra` : `${dk / 60} saat sonra`}
                    </button>
                  ))}
                </div>
                <input type="time" value={saat} onChange={(e) => setSaat(e.target.value)} className="w-full px-3 py-3 rounded-lg border text-2xl font-bold text-center" style={{ borderColor: GENEL.cizgi }} aria-label="Çıkış saati" />
                <p className="text-xs" style={{ color: GENEL.soluk }}>Müşteriye isteğe bağlı olarak bu saat bildirilebilir. Saat gelince size tekrar sorulur; &quot;yola çıktı&quot; mesajı yalnızca siz onaylayınca hazırlanır.</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setMod("secim")} className="px-4 py-3 rounded-xl border font-semibold" style={{ borderColor: GENEL.cizgi }}>Vazgeç</button>
                  <button disabled={isleniyor} onClick={() => uygula("planla")} className="px-4 py-3 rounded-xl font-bold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{ backgroundColor: GENEL.lacivert2 }}>
                    {isleniyor ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />} Kaydet
                  </button>
                </div>
              </div>
            )}

            {mod === "bugun" && (
              <div className="space-y-3">
                <p className="font-semibold">Araç bugün çıkmayacak, emin misiniz?</p>
                <p className="text-sm" style={{ color: GENEL.soluk }}>İç piyasa yetkilisine bilgi gider. Müşteriye bir şey gönderilmez. Daha sonra aynı bağlantıdan saat verebilir ya da çıkışı onaylayabilirsiniz.</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setMod("secim")} className="px-4 py-3 rounded-xl border font-semibold" style={{ borderColor: GENEL.cizgi }}>Vazgeç</button>
                  <button disabled={isleniyor} onClick={() => uygula("bugun_degil")} className="px-4 py-3 rounded-xl font-bold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{ backgroundColor: GENEL.turuncu }}>
                    {isleniyor ? <Loader2 size={18} className="animate-spin" /> : <XCircle size={18} />} Evet, bildir
                  </button>
                </div>
              </div>
            )}
            {hata && <p className="mt-3 text-sm font-medium" style={{ color: "#B42318" }}>{hata}</p>}
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
