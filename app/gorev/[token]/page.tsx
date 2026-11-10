"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Clock, Copy, Inbox, Loader2, Lock, Mail, MessageCircle, PartyPopper, Share2, SkipForward, ThumbsDown, ThumbsUp, FileText, ShoppingCart, UserRound } from "lucide-react";
import { YildizAlani } from "@/components/kilavuz/yildiz-alani";
import { ArkaPlanGorseli } from "@/components/arka-plan-gorseli";
import { UlkeBayrak } from "@/components/ulke-bayrak";
import { gorevBilgisi, gorevIsle, type GorevBilgisi, type GorevIslemi, type GorevNeden } from "@/lib/pazar/gorev-api";
import { CC_ADRESLERI, mailtoAdresi, sablonlar, whatsappAdresi, whatsappPaylasAdresi } from "@/lib/pazar/sablonlar";
import { ACCENT, CARD_BORDER, PAGE_BG, TEXT_MUTED } from "@/lib/theme";

/**
 * PAZAR 3.3 / 3.4 - "Bugunku musteriniz" gorev sayfasi (10.11.2026). GIRISSIZ (gunluk maildeki token, 3 gun).
 * Kullanici: "Basla butonu evren gibi bir ekran acsin; 3 insan gibi sablon, Outlook ile; WhatsApp ilk mesaj;
 * basari ekraninda 'Yeni musteriyle devam et'." Kilavuzdaki yildiz alani (evren) arka plan; devam ederken isik gecisi.
 * Akis: kisi + sablon sec -> duzenle -> "Outlook'ta ac" (mailto, CC bbt@ + execution@) -> "Gonderdim" (kayit) ->
 * basari. Sonuc dugmeleri: Cevap verdi / Teklif istedi / Siparis verdi / Ilgilenmiyor / Bugun atla.
 * Kurallar (sonraki adim tarihleri) veritabaninda: pazar_gorev_isle (migration 20261110060000).
 * 10.11.2026: gorev kisiye atanir (Harun Bey export@ / Safak Bey export2@ -> pazar_ekip); "Ben" secimi kalkti,
 * isleyen sunucuda gorevin sahibi. WhatsApp: numara yoksa da acilir (kisi WhatsApp'ta secilir) + "Metni kopyala".
 * 10.11.2026 (kullanici): "Cevap bildirmeden yeni musteriye gecilebilmeli; ama temasa gectigini bildirmeden
 * gecilememeli." -> "Bugun atla" kalkti; "Yeni musteriyle devam et" yalniz bu gorevde temas (Gonderdim / sonuc)
 * kaydi varken acik (gorev.temas_var). Her numara icin WhatsApp + "Paylas" (telefonun paylasim menusu).
 * 3.5: arsivden gelen cevap + oneri sayfanin ustunde; "Oneriyi kaydet" ile sonuc islenir.
 * 10.11.2026 (kullanici): "Her ihtimale karsi musteriyi atla butonu olmali; neden yazilmali, yazilanlar hafizaya
 * alinip bir sonraki atlamada secenek olarak gosterilmeli." -> "Musteriyi atla": neden zorunlu (sunucu da zorlar),
 * onceki nedenler secenek (bilgi.atlama_nedenleri); nedenli atlama sonrasi siradakine gecilir.
 */

const NEDEN: Record<GorevNeden, { etiket: string; renk: string }> = {
  hatirlatma1: { etiket: "Hatırlatma zamanı", renk: "#F59E0B" },
  hatirlatma2: { etiket: "Son hatırlatma", renk: "#F87171" },
  siparissiz: { etiket: "Siparişsiz müşterimiz", renk: "#34D399" },
  potansiyel: { etiket: "Potansiyel müşteri", renk: "#60A5FA" },
};
const ADIMLAR: { kod: GorevBilgisi["adim"]; ad: string }[] = [
  { kod: "sorgulama", ad: "Sipariş sorgulama" },
  { kod: "hatirlatma1", ad: "Hatırlatma 1" },
  { kod: "hatirlatma2", ad: "Hatırlatma 2" },
];
const ONERI_ADI: Record<string, string> = { teklif: "Teklif istedi", siparis: "Sipariş verdi", ilgilenmiyor: "İlgilenmiyor" };
const SONUC_ADI: Record<string, string> = { cevap: "Cevap verdi", teklif: "Teklif istedi", siparis: "Sipariş verdi", ilgilenmiyor: "İlgilenmiyor" };
const ADIM_ADI: Record<string, string> = { sorgulama: "Sipariş sorgulama", hatirlatma1: "Hatırlatma 1", hatirlatma2: "Hatırlatma 2", sonuc: "Sonuç", atla: "Atlandı" };

const tarihTR = (t: string | null) => (t ? new Date(t).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) : "");
const ulkeYaz = (u: string | null) => (u ? u.toLocaleLowerCase("tr-TR").split(/(\s+|-)/).map((p) => (p ? p.charAt(0).toLocaleUpperCase("tr-TR") + p.slice(1) : p)).join("") : "");
const gunOnce = (t: string | null) => (t ? Math.max(0, Math.floor((Date.now() - new Date(t).getTime()) / 86400000)) : null);
const kart = "rounded-2xl border backdrop-blur-md";
const kartStil = { backgroundColor: "rgba(18,22,31,0.82)", borderColor: CARD_BORDER };
const girdi = "w-full rounded-lg border bg-black/20 px-3 text-sm text-white outline-none focus:border-emerald-500/60";

type Bekleyen = { kanal: "eposta" | "whatsapp"; alici: string } | null;
type Bitti = { baslik: string; alt: string } | null;

export default function GorevSayfasi() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const warpRef = useRef(0);
  const [bilgi, setBilgi] = useState<GorevBilgisi | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [isleniyor, setIsleniyor] = useState(false);
  const [atlaAcik, setAtlaAcik] = useState(false);
  const [atlaNeden, setAtlaNeden] = useState("");
  const [kisiId, setKisiId] = useState<string>("");
  const [sablonKod, setSablonKod] = useState<string>("");
  const [konu, setKonu] = useState("");
  const [govde, setGovde] = useState("");
  const [wpMetin, setWpMetin] = useState("");
  const [bekleyen, setBekleyen] = useState<Bekleyen>(null);
  const [bitti, setBitti] = useState<Bitti>(null);
  const [kopyalandi, setKopyalandi] = useState(false);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    setHata(null);
    const c = await gorevBilgisi(String(token || ""));
    if (c.ok) setBilgi(c.veri); else setHata(c.hata);
    setYukleniyor(false);
  }, [token]);
  useEffect(() => { yukle(); }, [yukle]);

  const liste = useMemo(() => {
    if (!bilgi) return [];
    const kisi = bilgi.kisiler.find((k) => k.id === kisiId) || bilgi.kisiler[0];
    return sablonlar(bilgi.adim, {
      ad: kisi?.ad || null, firma: bilgi.firma.ad, musteri: bilgi.firma.durum === "musteri",
      sonSiparis: bilgi.firma.son_siparis, sonUrun: bilgi.son_urun, fuar: bilgi.fuarlar[0] || null,
      gonderen: bilgi.ekip?.eposta || null,
    });
  }, [bilgi, kisiId]);

  // Ilk acilista: e-postasi gecerli ilk kisi + ilk sablon
  useEffect(() => {
    if (!bilgi) return;
    const ilk = bilgi.kisiler.find((k) => k.eposta && k.eposta_gecerli) || bilgi.kisiler[0];
    setKisiId((v) => v || ilk?.id || "");
  }, [bilgi]);
  useEffect(() => {
    if (!liste.length) return;
    const s = liste.find((x) => x.kod === sablonKod) || liste[0];
    setSablonKod(s.kod); setKonu(s.konu); setGovde(s.govde); setWpMetin(s.whatsapp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liste]);

  function sablonSec(kod: string) {
    const s = liste.find((x) => x.kod === kod);
    if (!s) return;
    setSablonKod(kod); setKonu(s.konu); setGovde(s.govde); setWpMetin(s.whatsapp);
  }

  const kisi = bilgi?.kisiler.find((k) => k.id === kisiId) || null;
  const eposta = kisi?.eposta && kisi.eposta_gecerli ? kisi.eposta : null;
  const wpNumara = kisi ? kisi.whatsapp || kisi.telefonlar[0] || null : null;
  const wpNumaraliAdres = wpNumara ? whatsappAdresi(wpNumara, wpMetin) : null;
  // Yetkilinin tum numaralari (WhatsApp once), her biri icin ayri dugme
  const numaralar = kisi ? Array.from(new Set([kisi.whatsapp, ...kisi.telefonlar].filter((x): x is string => !!x && whatsappAdresi(x, "") !== null))) : [];
  const paylasilabilir = typeof navigator !== "undefined" && typeof (navigator as Navigator & { share?: unknown }).share === "function";
  async function paylas() {
    try { await navigator.share({ text: wpMetin }); setBekleyen({ kanal: "whatsapp", alici: "Paylaşım menüsü" }); } catch { /* vazgecildi */ }
  }
  // Numara yoksa da WhatsApp acilir; mesaj hazir gelir, kisi WhatsApp'ta secilir
  const wpAdres = wpNumaraliAdres || whatsappPaylasAdresi(wpMetin);

  async function metniKopyala() {
    try {
      await navigator.clipboard.writeText(wpMetin);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2000);
    } catch { setHata("Metin kopyalanamadı; WhatsApp mesajını düzenle alanından elle kopyalayabilirsiniz."); }
  }

  async function isle(is: GorevIslemi, ek: Parameters<typeof gorevIsle>[2] = {}, sonra?: Bitti): Promise<boolean> {
    setIsleniyor(true);
    const c = await gorevIsle(String(token), is, ek);
    setIsleniyor(false);
    if (!c.ok) { setHata(c.hata); return false; }
    setHata(null);
    setBilgi(c.veri);
    setBekleyen(null);
    if (sonra) setBitti(sonra);
    return true;
  }

  const sonrakiAdimMetni = () => {
    if (!bilgi) return "";
    if (bilgi.adim === "sorgulama") return "Cevap gelmezse 4 iş günü sonra hatırlatma olarak tekrar karşınıza çıkacak.";
    if (bilgi.adim === "hatirlatma1") return "Cevap gelmezse 6 iş günü sonra son hatırlatma zamanı gelecek.";
    return "Cevap gelmezse firma 10 gün sonra beklemeye alınır ve bir süre sonra yeniden sıraya girer.";
  };

  const siradaki = bilgi?.gunun_gorevleri.find((g) => g.durum === "bekliyor" && g.token !== token) || null;
  function devamEt() {
    if (!siradaki) return;
    warpRef.current = 1;
    setTimeout(() => {
      setBitti(null); setBilgi(null); setKisiId(""); setSablonKod("");
      router.push(`/gorev/${siradaki.token}`);
      setTimeout(() => { warpRef.current = 0; }, 700);
    }, 650);
  }

  const n = bilgi ? NEDEN[bilgi.gorev.neden] : null;
  const temasVar = !!bilgi?.gorev.temas_var;
  const islenmis = bilgi && bilgi.gorev.durum !== "bekliyor";
  const toplam = bilgi?.gunun_gorevleri.length || 0;
  const yapilan = bilgi?.gunun_gorevleri.filter((g) => g.durum !== "bekliyor").length || 0;

  return (
    <div className="fixed inset-0 overflow-y-auto isolate text-white" style={{ backgroundColor: PAGE_BG }}>
      <ArkaPlanGorseli tur="uygulama" />
      <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden style={{ background: "radial-gradient(60% 50% at 70% 10%, rgba(16,185,129,0.16), transparent 70%), radial-gradient(50% 45% at 10% 90%, rgba(96,165,250,0.14), transparent 70%)" }} />
      <div className="fixed inset-0 -z-10"><YildizAlani renk={n?.renk || ACCENT} warpRef={warpRef} /></div>

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 md:px-8 h-16 max-w-3xl mx-auto">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="Unex" className="w-8 h-8 object-contain shrink-0" />
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold tracking-[0.18em] uppercase leading-tight" style={{ color: TEXT_MUTED }}>UNEX Satış</span>
            <span className="block text-sm font-semibold leading-tight truncate">Bugünkü müşteriniz</span>
          </span>
        </div>
        {toplam > 0 && <span className="text-xs tabular-nums shrink-0" style={{ color: TEXT_MUTED }} data-testid="gorev-ilerleme">{yapilan}/{toplam} tamam</span>}
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-4 md:px-8 pb-16">
        {yukleniyor && !bilgi ? (
          <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin" size={28} style={{ color: ACCENT }} /></div>
        ) : !bilgi ? (
          <div className={`${kart} p-6 mt-10 text-center`} style={kartStil} data-testid="gorev-gecersiz">
            <AlertTriangle className="mx-auto mb-3" size={28} style={{ color: "#FBBF24" }} />
            <p className="font-semibold">{hata || "Bu bağlantı geçersiz ya da süresi doldu."}</p>
            <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>Her sabahki &ldquo;Bugünkü müşteriniz&rdquo; mailindeki bağlantıyı kullanın.</p>
          </div>
        ) : bitti ? (
          <div className={`${kart} p-8 mt-8 text-center`} style={kartStil} data-testid="gorev-bitti">
            <div className="mx-auto mb-4 w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(16,185,129,0.15)" }}>
              <CheckCircle2 size={30} style={{ color: ACCENT }} />
            </div>
            <h1 className="text-xl font-semibold">{bitti.baslik}</h1>
            <p className="text-sm mt-2 max-w-md mx-auto" style={{ color: "#C9D1DC" }}>{bitti.alt}</p>
            {siradaki ? (
              <button type="button" onClick={devamEt} className="mt-6 inline-flex items-center gap-2 h-11 px-6 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }} data-testid="devam-et">
                Yeni müşteriyle devam et <ArrowRight size={16} />
              </button>
            ) : (
              <p className="mt-6 inline-flex items-center gap-2 text-sm" style={{ color: "#6EE7B7" }} data-testid="gun-bitti"><PartyPopper size={16} /> Bugünlük hepsi bu kadar. Eline sağlık!</p>
            )}
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {/* 3.5: arsivden tespit edilen cevap */}
            {(bilgi.gelenler || []).filter((g) => g.tur === "cevap").slice(0, 1).map((g) => (
              <section key={g.tarih + g.gonderen} className={`${kart} p-4`} style={{ ...kartStil, borderColor: "rgba(96,165,250,0.5)" }} data-testid="gelen-cevap">
                <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "#93C5FD" }}><Inbox size={14} /> Müşteriden cevap geldi · {tarihTR(g.tarih)} · {g.gonderen}</p>
                {g.konu && <p className="text-sm mt-1 font-medium break-words">{g.konu}</p>}
                {g.ozet && <p className="text-xs mt-1 whitespace-pre-line break-words" style={{ color: "#C9D1DC" }}>{g.ozet}</p>}
                {g.oneri && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span style={{ color: TEXT_MUTED }}>Sistemin önerisi:</span>
                    <span className="font-semibold" data-testid="gelen-oneri">{ONERI_ADI[g.oneri]}</span>
                    <button type="button" disabled={isleniyor} onClick={() => isle(g.oneri as GorevIslemi, {}, { baslik: ONERI_ADI[g.oneri as string], alt: "Kaydedildi." })}
                      className="h-7 px-2.5 rounded-md border disabled:opacity-60" style={{ borderColor: "rgba(96,165,250,0.5)", color: "#93C5FD" }} data-testid="oneri-kaydet">Öneriyi kaydet</button>
                  </div>
                )}
              </section>
            ))}
            {/* Firma */}
            <section className={`${kart} p-5`} style={kartStil}>
              <span className="inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-semibold" style={{ backgroundColor: `${n!.renk}22`, color: n!.renk }} data-testid="gorev-neden">{n!.etiket}</span>
              <h1 className="mt-2 text-2xl font-semibold leading-tight break-words" data-testid="gorev-firma">{bilgi.firma.ad}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" style={{ color: "#C9D1DC" }}>
                {bilgi.firma.ulke && <span className="inline-flex items-center gap-1.5"><UlkeBayrak ulke={bilgi.firma.ulke} /> {ulkeYaz(bilgi.firma.ulke)}</span>}
                {bilgi.firma.durum === "musteri" ? (
                  <span>{bilgi.firma.son_siparis ? `Son sipariş ${tarihTR(bilgi.firma.son_siparis)} · ${gunOnce(bilgi.firma.son_siparis)} gün önce` : "Müşterimiz"}</span>
                ) : bilgi.fuarlar.length > 0 ? <span>Fuar: {bilgi.fuarlar.join(", ")}</span> : null}
                {bilgi.son_urun && bilgi.firma.durum === "musteri" && <span style={{ color: TEXT_MUTED }}>{bilgi.son_urun}</span>}
              </div>
              <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Görüşme adımları">
                {ADIMLAR.map((a, i) => {
                  const simdi = ADIMLAR.findIndex((x) => x.kod === bilgi.adim);
                  const durum = i < simdi ? "gecti" : i === simdi ? "simdi" : "sonra";
                  return (
                    <li key={a.kod} className="rounded-lg px-2.5 py-2 text-xs border" data-adim={a.kod} data-adim-durum={durum}
                      style={durum === "simdi" ? { borderColor: `${n!.renk}88`, backgroundColor: `${n!.renk}18`, color: "#fff" } : { borderColor: CARD_BORDER, color: durum === "gecti" ? "#6EE7B7" : TEXT_MUTED }}>
                      <span className="flex items-center gap-1">{durum === "gecti" ? <Check size={12} /> : <span className="tabular-nums">{i + 1}.</span>}{a.ad}</span>
                    </li>
                  );
                })}
              </ol>
              {islenmis && (
                <p className="mt-3 text-sm rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(16,185,129,0.10)", color: "#6EE7B7" }} data-testid="gorev-islenmis">
                  Bu müşteri bugün {bilgi.gorev.durum === "atlandi" ? "atlandı" : "işlendi"}{bilgi.gorev.isleyen ? ` (${bilgi.gorev.isleyen})` : ""}. İsterseniz yine de bir işlem kaydedebilirsiniz.
                </p>
              )}
            </section>

            {/* Gorevin sahibi */}
            {bilgi.ekip && (
              <section className={`${kart} px-5 py-3 flex flex-wrap items-center gap-2 text-sm`} style={kartStil} data-testid="gorev-sahibi">
                <UserRound size={15} style={{ color: ACCENT }} />
                <span>{bilgi.ekip.hitap || "Görevli"}</span>
                <span className="text-xs" style={{ color: TEXT_MUTED }}>· mailler {bilgi.ekip.eposta} adresinden gider</span>
              </section>
            )}

            {/* Kisi */}
            <section className={`${kart} p-5`} style={kartStil}>
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: TEXT_MUTED }}>Kime</h2>
              {bilgi.kisiler.length === 0 ? (
                <p className="text-sm" style={{ color: "#FBBF24" }}>Bu firmanın kayıtlı yetkilisi yok. Pazar&apos;da firma kartından eklenmeli.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {bilgi.kisiler.map((k) => (
                    <button key={k.id} type="button" onClick={() => setKisiId(k.id)} data-kisi-sec={k.eposta || k.ad || ""}
                      className="text-left rounded-xl border px-3 py-2 text-sm transition-colors"
                      style={k.id === kisiId ? { borderColor: "rgba(16,185,129,0.6)", backgroundColor: "rgba(16,185,129,0.08)" } : { borderColor: CARD_BORDER }}>
                      <span className="block font-medium truncate">{k.ad || "Yetkili"}</span>
                      {k.eposta && <span className="flex items-center gap-1 text-xs break-all" style={{ color: k.eposta_gecerli ? "#C9D1DC" : "#FBBF24" }}><Mail size={11} className="shrink-0" />{k.eposta}{!k.eposta_gecerli && " (hatalı)"}</span>}
                      {(k.whatsapp || k.telefonlar[0]) && <span className="flex items-center gap-1 text-xs" style={{ color: "#C9D1DC" }}><MessageCircle size={11} className="shrink-0" />+{k.whatsapp || k.telefonlar[0]}</span>}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Sablon + mesaj */}
            <section className={`${kart} p-5`} style={kartStil}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>{ADIMLAR.find((a) => a.kod === bilgi.adim)?.ad} mesajı</h2>
                {liste.length > 1 && (
                  <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: CARD_BORDER }} role="tablist">
                    {liste.map((s) => (
                      <button key={s.kod} type="button" role="tab" aria-selected={s.kod === sablonKod} onClick={() => sablonSec(s.kod)} data-sablon={s.kod}
                        className="h-7 px-2.5 rounded-md text-xs" style={s.kod === sablonKod ? { backgroundColor: "rgba(16,185,129,0.16)", color: "#fff" } : { color: TEXT_MUTED }}>{s.baslik}</button>
                    ))}
                  </div>
                )}
              </div>
              <label className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Konu</label>
              <input className={`${girdi} h-10`} style={{ borderColor: CARD_BORDER }} value={konu} onChange={(e) => setKonu(e.target.value)} data-testid="gorev-konu" />
              <label className="block text-xs mt-3 mb-1" style={{ color: TEXT_MUTED }}>E-posta metni (düzenleyebilirsiniz)</label>
              <textarea className={`${girdi} py-2 h-64 leading-relaxed`} style={{ borderColor: CARD_BORDER }} value={govde} onChange={(e) => setGovde(e.target.value)} data-testid="gorev-govde" />
              <p className="text-[11px] mt-1" style={{ color: TEXT_MUTED }}>Bilgi (CC): {CC_ADRESLERI.join(", ")}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                <a href={eposta ? mailtoAdresi(eposta, konu, govde) : undefined} aria-disabled={!eposta}
                  onClick={(e) => { if (!eposta) { e.preventDefault(); return; } setBekleyen({ kanal: "eposta", alici: eposta }); }}
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: eposta ? ACCENT : "#374151", cursor: eposta ? "pointer" : "not-allowed" }} data-testid="outlook-ac">
                  <Mail size={16} /> Outlook&apos;ta aç
                </a>
                {numaralar.length > 0 ? numaralar.map((no, i) => (
                  <a key={no} href={whatsappAdresi(no, wpMetin) || wpAdres} target="_blank" rel="noopener noreferrer"
                    onClick={() => setBekleyen({ kanal: "whatsapp", alici: `+${no.replace(/\D/g, "")}` })}
                    className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold border" style={{ borderColor: "rgba(37,211,102,0.5)", color: "#86EFAC" }}
                    data-testid={i === 0 ? "whatsapp-ac" : "whatsapp-ac-diger"} data-numarali="evet">
                    <MessageCircle size={16} /> WhatsApp +{no.replace(/\D/g, "")}
                  </a>
                )) : (
                  <a href={wpAdres} target="_blank" rel="noopener noreferrer"
                    onClick={() => setBekleyen({ kanal: "whatsapp", alici: bilgi.firma.durum === "musteri" ? "WhatsApp grubu" : "WhatsApp (kişi seçildi)" })}
                    className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold border" style={{ borderColor: "rgba(37,211,102,0.5)", color: "#86EFAC" }} data-testid="whatsapp-ac" data-numarali="hayir">
                    <MessageCircle size={16} /> {bilgi.firma.durum === "musteri" ? "WhatsApp grubuna gönder" : "WhatsApp'ta gönder (kişi seç)"}
                  </a>
                )}
                {paylasilabilir && (
                  <button type="button" onClick={paylas} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl text-sm border" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }} data-testid="paylas">
                    <Share2 size={15} /> Paylaş
                  </button>
                )}
                <button type="button" onClick={metniKopyala} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl text-sm border" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }} data-testid="wp-kopyala">
                  {kopyalandi ? <Check size={15} /> : <Copy size={15} />} {kopyalandi ? "Kopyalandı" : "Mesajı kopyala"}
                </button>
              </div>
              {!wpNumaraliAdres && (
                <p className="text-[11px] mt-2" style={{ color: TEXT_MUTED }} data-testid="wp-numara-yok">{bilgi.firma.durum === "musteri"
                  ? "Müşterimizin WhatsApp grubu: WhatsApp açılınca mesaj hazır gelir, grubu seçip gönderirsiniz."
                  : "Bu yetkilinin telefonu kayıtlı değil: WhatsApp açılınca mesaj hazır gelir, kişiyi WhatsApp'ta seçersiniz."}</p>
              )}
              <details className="mt-3">
                <summary className="text-xs cursor-pointer" style={{ color: TEXT_MUTED }}>WhatsApp mesajını düzenle</summary>
                <textarea className={`${girdi} py-2 h-24 mt-2`} style={{ borderColor: CARD_BORDER }} value={wpMetin} onChange={(e) => setWpMetin(e.target.value)} data-testid="gorev-wp" />
              </details>
              {bekleyen && (
                <div className="mt-4 rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3" style={{ borderColor: "rgba(16,185,129,0.4)", backgroundColor: "rgba(16,185,129,0.08)" }} data-testid="gonderdim-kutu">
                  <span className="text-sm">{bekleyen.kanal === "eposta" ? "Maili Outlook'tan gönderdiniz mi?" : "WhatsApp mesajını gönderdiniz mi?"}</span>
                  <span className="flex gap-2">
                    <button type="button" onClick={() => setBekleyen(null)} className="h-9 px-3 rounded-lg text-xs border" style={{ borderColor: CARD_BORDER, color: "#C9D1DC" }}>Henüz değil</button>
                    <button type="button" disabled={isleniyor} data-testid="gonderdim"
                      onClick={() => isle("gonderildi", { kanal: bekleyen.kanal, sablon: sablonKod, alici: bekleyen.alici, konu: bekleyen.kanal === "eposta" ? konu : "WhatsApp", govde: bekleyen.kanal === "eposta" ? govde : wpMetin },
                        { baslik: "Harika, kaydedildi!", alt: sonrakiAdimMetni() })}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
                      {isleniyor ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Evet, gönderdim
                    </button>
                  </span>
                </div>
              )}
            </section>

            {/* Sonuc */}
            <section className={`${kart} p-5`} style={kartStil}>
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>Müşteri döndü mü? <span className="normal-case tracking-normal font-normal">(zorunlu değil)</span></h2>
              <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>Cevap geldiyse işaretleyin; süreç durur, hatırlatma gitmez. Mailden gelen cevaplar arşivden otomatik de yakalanır.</p>
              <div className="flex flex-wrap gap-2 items-center">
                {([
                  ["cevap", "Cevap verdi", <ThumbsUp key="i" size={14} />, "#6EE7B7", "Cevap kaydedildi. Takip sizde; hatırlatma gönderilmeyecek."],
                  ["teklif", "Teklif istedi", <FileText key="i" size={14} />, "#93C5FD", "Teklif talebi kaydedildi. Proformayı hazırlayabilirsiniz."],
                  ["siparis", "Sipariş verdi", <ShoppingCart key="i" size={14} />, "#FCD34D", "Tebrikler! Rezervasyon girildiğinde firma otomatik müşteri olur."],
                  ["ilgilenmiyor", "İlgilenmiyor", <ThumbsDown key="i" size={14} />, "#FCA5A5", "Kaydedildi. Firma 6 ay boyunca sıraya girmeyecek."],
                ] as [GorevIslemi, string, React.ReactNode, string, string][]).map(([is, ad, ikon, renk, alt]) => (
                  <button key={is} type="button" disabled={isleniyor} onClick={() => isle(is, {}, { baslik: ad, alt })} data-sonuc={is}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs border disabled:opacity-60" style={{ borderColor: CARD_BORDER, color: renk }}>
                    {ikon} {ad}
                  </button>
                ))}
                {!islenmis && !atlaAcik && (
                  <button type="button" disabled={isleniyor} onClick={() => { setAtlaAcik(true); setAtlaNeden(""); }} data-testid="atla-ac"
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs border disabled:opacity-60 ml-auto" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                    <SkipForward size={14} /> Müşteriyi atla
                  </button>
                )}
              </div>
              {atlaAcik && (
                <div className="mt-4 rounded-lg border p-3" style={{ borderColor: "rgba(251,191,36,0.35)", backgroundColor: "rgba(251,191,36,0.06)" }} data-testid="atla-panel">
                  <p className="text-sm font-medium text-white">Neden atlıyorsunuz?</p>
                  <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>Kısa yazın; nedeni Burak Bey Takip ekranında görür. Firma birkaç gün sonra yeniden sıraya girer.</p>
                  {(bilgi.atlama_nedenleri || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(bilgi.atlama_nedenleri || []).map((n) => (
                        <button key={n} type="button" onClick={() => setAtlaNeden(n)} data-atla-secenek={n}
                          className="h-7 px-2.5 rounded-full text-xs border" style={atlaNeden === n ? { borderColor: "rgba(251,191,36,0.6)", color: "#FCD34D", backgroundColor: "rgba(251,191,36,0.1)" } : { borderColor: CARD_BORDER, color: "#C9D1DC" }}>{n}</button>
                      ))}
                    </div>
                  )}
                  <input value={atlaNeden} onChange={(e) => setAtlaNeden(e.target.value.slice(0, 120))} maxLength={120} placeholder="Örn. müşteri izinde, haftaya tekrar dene" data-testid="atla-neden"
                    className={`${girdi} h-10 mt-2`} style={{ borderColor: CARD_BORDER }} />
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button type="button" disabled={isleniyor || atlaNeden.trim().length < 3} data-testid="atla-kaydet"
                      onClick={() => { const n = atlaNeden.trim(); isle("atla", { konu: n }, { baslik: "Müşteri atlandı", alt: `Neden: ${n}. Firma birkaç gün sonra yeniden sıraya girer.` }).then((ok) => { if (ok) setAtlaAcik(false); }); }}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold text-white disabled:opacity-40" style={{ backgroundColor: "#B45309" }}>
                      <SkipForward size={14} /> Atla ve kaydet
                    </button>
                    <button type="button" onClick={() => setAtlaAcik(false)} className="h-9 px-3 rounded-lg text-xs border" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
                  </div>
                </div>
              )}
            </section>

            {bilgi.gecmis.length > 0 && (
              <section className={`${kart} p-5`} style={kartStil}>
                <h2 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: TEXT_MUTED }}>Görüşme geçmişi</h2>
                <ul className="space-y-1.5 text-xs" data-testid="gorev-gecmis">
                  {bilgi.gecmis.map((g, i) => (
                    <li key={i} className="flex items-start gap-2" style={{ color: "#C9D1DC" }}>
                      <Clock size={12} className="mt-0.5 shrink-0" style={{ color: TEXT_MUTED }} />
                      <span>{tarihTR(g.olusturma)} · {g.sonuc ? SONUC_ADI[g.sonuc] : ADIM_ADI[g.adim] || g.adim}{g.kanal ? ` · ${g.kanal === "eposta" ? "e-posta" : "WhatsApp"}` : ""}{g.alici ? ` · ${g.alici}` : ""}{g.adim === "atla" && g.konu ? ` · ${g.konu}` : ""}{g.isleyen ? ` · ${g.isleyen}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {hata && <p className="text-sm rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#FCA5A5" }} data-testid="gorev-hata">{hata}</p>}

            {/* Siradaki musteri: yalniz temas bildirildiyse */}
            {siradaki && (
              <section className={`${kart} p-4 flex flex-wrap items-center justify-between gap-3`} style={kartStil}>
                <span className="text-xs" style={{ color: TEXT_MUTED }} data-testid="siradaki-not">
                  {temasVar ? `Sıradaki: ${siradaki.ad}` : "Sıradaki müşteriye geçmek için önce bu müşteriyle temasınızı (mail ya da WhatsApp) “Evet, gönderdim” ile bildirin."}
                </span>
                <button type="button" onClick={devamEt} disabled={!temasVar} data-testid="siradaki"
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed" style={{ backgroundColor: temasVar ? ACCENT : "#374151" }}>
                  {temasVar ? <ArrowRight size={16} /> : <Lock size={15} />} Yeni müşteriyle devam et
                </button>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
