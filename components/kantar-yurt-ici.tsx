"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { Loader2, Upload, X, FileText, AlertTriangle, CheckCircle2, Truck, RefreshCw, ScanText, PencilLine } from "lucide-react";
import { KalanRozet } from "@/components/ic-kalan-rozet";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import {
  IC_BELGE_BUCKET, KantarIsEmri, KantarSonSevk, cikisEtiketi, hataMesaji, hedefTamam, hedefYazi, ilerlemeOrani, ilerlemeYazi, kgYazi, tarihSaatYazi,
} from "@/lib/ic-piyasa/is-emri";
import { IrsaliyeOkuma, irsaliyePdfOku, plakaBicimle, plakaGecerli, plakaYazarken, trSayiOku, urunUyusuyor } from "@/lib/ic-piyasa/irsaliye-oku";

/** Elle yazilan irsaliye no: okuyucuyla ayni kural (A-Z0-9, 3-20). */
const IRSALIYE_NO_RE = /^[A-Z0-9]{3,20}$/;
/** e-Irsaliye PDF'i ETTN adiyla indirilir: "8BDBB562-6147-449C-A089-E0ABC17CE395.pdf" (tarayicinin "(1)" ekine izin var). */
const ETTN_DOSYA_RE = /^([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})(?:\s*\(\d+\))?\.pdf$/i;

/**
 * Kantar Paneli > Yurt Ici (12.10.2026).
 * Kantarci acik is emirlerini (FIYATSIZ; 30.10.2026'dan beri musteri ADI acik) gorur; her arac
 * icin irsaliye PDF'ini yukler. Plaka ve net kg irsaliyeden okunur, kantarci
 * kontrol edip onaylar; okunamazsa elle (BUYUK HARF) yazar.
 * Veri sadece SECURITY DEFINER fonksiyonlarla: kantar_ic_is_emirleri,
 * kantar_ic_son_sevkler, kantar_ic_sevk_ekle (migration 20261012100000).
 * Parca 2: kayittan sonra lojistige otomatik "cikis onayi" e-postasi gider
 * (veritabani tetikleyicisi + ic-piyasa edge function); kantarci ek bir sey yapmaz.
 */

type Adim = "dosya" | "okunuyor" | "kontrol" | "kaydediliyor";

export function KantarYurtIci({ yenileTetik = 0, acikSayiBildir }: {
  /** Kantar Paneli ustundeki "Yenile" basilinca artar -> liste yenilenir. */
  yenileTetik?: number;
  /** Acik is emri sayisi (dar ekrandaki bolum dugmesi icin). */
  acikSayiBildir?: (sayi: number) => void;
} = {}) {
  const { companyId } = useAuth();
  const { showToast } = useToast();
  const [emirler, setEmirler] = useState<KantarIsEmri[]>([]);
  const [sonSevkler, setSonSevkler] = useState<KantarSonSevk[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [sonGuncelleme, setSonGuncelleme] = useState<Date | null>(null);
  const istekSira = useRef(0);

  const getir = useCallback(async () => {
    const sira = ++istekSira.current;
    const [eRes, sRes] = await Promise.all([
      supabase.rpc("kantar_ic_is_emirleri"),
      supabase.rpc("kantar_ic_son_sevkler", { p_gun: 3 }),
    ]);
    if (sira !== istekSira.current) return;
    if (eRes.error || sRes.error) {
      // Liste BOSALTILMAZ (ihracat sekmesiyle ayni kural); ustte uyari cikar.
      setOkumaHatasi((eRes.error || sRes.error)!.message);
      setYukleniyor(false);
      return;
    }
    setEmirler((eRes.data || []) as KantarIsEmri[]);
    setSonSevkler((sRes.data || []) as KantarSonSevk[]);
    setOkumaHatasi(null);
    setSonGuncelleme(new Date());
    setYukleniyor(false);
  }, []);

  useEffect(() => { getir(); }, [getir, yenileTetik]);
  useEffect(() => { if (!yukleniyor) acikSayiBildir?.(emirler.length); }, [emirler.length, yukleniyor, acikSayiBildir]);
  useEffect(() => {
    const yenile = () => { if (document.visibilityState === "visible") getir(); };
    const z = window.setInterval(yenile, 60_000);
    document.addEventListener("visibilitychange", yenile);
    window.addEventListener("online", yenile);
    return () => { window.clearInterval(z); document.removeEventListener("visibilitychange", yenile); window.removeEventListener("online", yenile); };
  }, [getir]);

  // ---- Yukleme penceresi ----
  const [secili, setSecili] = useState<KantarIsEmri | null>(null);
  const [adim, setAdim] = useState<Adim>("dosya");
  const [dosya, setDosya] = useState<File | null>(null);
  const [okuma, setOkuma] = useState<IrsaliyeOkuma | null>(null);
  const [plaka, setPlaka] = useState("");
  const [dorse, setDorse] = useState("");
  const [net, setNet] = useState("");
  // Irsaliye no okunamadiysa (gorsel/taranmis PDF) kantarci elle yazar
  const [irsNoElle, setIrsNoElle] = useState("");
  const [uyarilar, setUyarilar] = useState<string[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const kontrolSira = useRef(0);

  const pencereAc = (e: KantarIsEmri) => {
    setSecili(e); setAdim("dosya"); setDosya(null); setOkuma(null); setPlaka(""); setDorse(""); setNet(""); setIrsNoElle(""); setUyarilar(null); setHata(null);
  };
  const pencereKapat = () => { if (adim !== "kaydediliyor") setSecili(null); };

  const dosyaSec = async (f: File) => {
    setHata(null);
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { setHata("Lütfen irsaliyenin PDF dosyasını seçin."); return; }
    if (f.size > 10 * 1024 * 1024) { setHata("Dosya 10 MB'tan büyük olamaz."); return; }
    setDosya(f);
    setAdim("okunuyor");
    let o: IrsaliyeOkuma | null = null;
    try {
      o = await irsaliyePdfOku(f);
    } catch (err) {
      console.error("İrsaliye okunamadı:", err);
      o = null;
    }
    setOkuma(o);
    setIrsNoElle("");
    setPlaka(o?.plaka || "");
    setDorse(o?.dorsePlaka || "");
    setNet(o?.netKg ? o.netKg.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) : "");
    setAdim("kontrol");
  };

  const netSayi = (() => {
    const s = net.trim().replace(/\s/g, "");
    if (!s) return null;
    return trSayiOku(s);
  })();
  const plakaSon = plakaBicimle(plaka);
  const elleDuzeltildi = !!okuma && ((!!okuma.plaka && okuma.plaka !== plakaSon) || (okuma.netKg !== null && netSayi !== null && Math.abs(okuma.netKg - netSayi) > 0.001));
  const urunFarkli = secili && okuma ? urunUyusuyor(secili.urun, okuma.urun) === false : false;
  const irsNoOkundu = !!okuma?.irsaliyeNo;
  const irsNoSon = irsNoElle.trim().toUpperCase();
  const irsNoGecerli = !irsNoSon || IRSALIYE_NO_RE.test(irsNoSon);
  // e-Irsaliye dosyalari cogu zaman ETTN adini tasir (ör. 8BDBB562-....pdf)
  const ettnDosyaAdindan = dosya ? (dosya.name.match(ETTN_DOSYA_RE)?.[1]?.toUpperCase() || null) : null;
  const girdiGecerli = plakaGecerli(plakaSon) && netSayi !== null && netSayi > 0 && netSayi <= 60000 && (irsNoOkundu || irsNoGecerli);

  const dosyaYolu = useRef<string>("");
  const veri = useCallback((yol: string) => ({
    is_emri_id: secili?.id,
    plaka: plakaSon,
    dorse_plaka: dorse ? plakaBicimle(dorse) : null,
    net_kg: netSayi,
    irsaliye_no: okuma?.irsaliyeNo || irsNoSon || null,
    irsaliye_tarihi: okuma?.tarih || null,
    ettn: okuma?.ettn || ettnDosyaAdindan,
    sofor_ad: okuma?.soforAd || null,
    alici_vkn: okuma?.aliciVkn || null,
    irsaliye_urun: okuma?.urun || null,
    irsaliye_dosya_yolu: yol,
    irsaliye_dosya_adi: dosya?.name || null,
    elle_duzeltildi: elleDuzeltildi,
    urun_uyusmuyor: urunFarkli,
    okunan: okuma ? {
      irsaliye_no: okuma.irsaliyeNo, tarih: okuma.tarih, plaka: okuma.plaka, dorse: okuma.dorsePlaka,
      net_kg: okuma.netKg, urun: okuma.urun, alici_unvan: okuma.aliciUnvan, kalemler: okuma.kalemler,
    } : null,
  }), [secili, plakaSon, dorse, netSayi, okuma, irsNoSon, ettnDosyaAdindan, dosya, elleDuzeltildi, urunFarkli]);

  // Girdi degistikce sunucuda KURU kontrol (kaydetmeden uyarilari getirir)
  useEffect(() => {
    if (adim !== "kontrol" || !secili || !companyId || !girdiGecerli) { setUyarilar(null); return; }
    if (!dosyaYolu.current) dosyaYolu.current = `${companyId}/irsaliye/${secili.id}/${Date.now()}.pdf`;
    const sira = ++kontrolSira.current;
    const z = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("kantar_ic_sevk_ekle", { p_veri: veri(dosyaYolu.current), p_kaydet: false });
      if (sira !== kontrolSira.current) return;
      if (error) { setHata(hataMesaji(error)); setUyarilar(null); return; }
      setHata(null);
      setUyarilar(((data as { uyarilar?: string[] })?.uyarilar) || []);
    }, 350);
    return () => window.clearTimeout(z);
  }, [adim, secili, companyId, girdiGecerli, veri]);

  useEffect(() => { if (!secili) dosyaYolu.current = ""; }, [secili]);

  const kaydet = async () => {
    if (!secili || !dosya || !companyId || !girdiGecerli) return;
    setAdim("kaydediliyor");
    setHata(null);
    const yol = dosyaYolu.current || `${companyId}/irsaliye/${secili.id}/${Date.now()}.pdf`;
    const { error: yErr } = await supabase.storage.from(IC_BELGE_BUCKET).upload(yol, dosya, { contentType: "application/pdf", upsert: false });
    if (yErr) { setHata(`Dosya yüklenemedi: ${yErr.message}`); setAdim("kontrol"); return; }
    const { data, error } = await supabase.rpc("kantar_ic_sevk_ekle", { p_veri: veri(yol), p_kaydet: true });
    if (error || !(data as { kaydedildi?: boolean })?.kaydedildi) {
      // Kayda baglanamayan dosya depoda sahipsiz kalmasin
      await supabase.storage.from(IC_BELGE_BUCKET).remove([yol]);
      dosyaYolu.current = "";
      setHata(hataMesaji(error || { message: "Kaydedilemedi." }));
      setAdim("kontrol");
      return;
    }
    const d = data as { yuklenen_kg: number; yuklenen_arac: number };
    showToast(`${plakaSon} · ${kgYazi(netSayi)} kaydedildi. ${secili.is_emri_no}: ${ilerlemeYazi(secili, Number(d.yuklenen_kg), d.yuklenen_arac)}`, "success");
    setSecili(null);
    getir();
  };

  const irsaliyeAc = async (yol: string) => {
    const pencere = window.open("", "_blank");
    const { data, error } = await supabase.storage.from(IC_BELGE_BUCKET).createSignedUrl(yol, 60 * 10);
    if (error || !data?.signedUrl) { pencere?.close(); showToast(`İrsaliye açılamadı: ${error?.message || "bilinmeyen hata"}`, "error"); return; }
    if (pencere) pencere.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  };

  if (yukleniyor) {
    return <div className="flex items-center justify-center py-10" style={{ color: TEXT_MUTED }}><Loader2 size={22} className="animate-spin" style={{ color: ACCENT }} /></div>;
  }

  const bugun = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  const bugunkuler = sonSevkler.filter((s) => new Date(s.olusturma).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }) === bugun);
  const th = "px-3 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap";

  // 30.10.2026 (kullanici: "Kantar paneli cok karisik, her sey cok buyuk; tek ekranda yonetilebilir
  // olmali"): kartlar yerine SIKI TABLO, ozet kutulari tek satir, her satirda KALAN tonaj
  // (KalanRozet, kapanis e-postasiyla ayni hesap) ve musteri ADI (sunucu artik maskelemiyor).
  return (
    <div className="space-y-4" data-testid="kantar-satis">
      {okumaHatasi && (
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "#78350F", backgroundColor: "rgba(120,53,15,0.15)", color: "#FCD34D" }}>
          <span>Sunucuya ulaşılamadı; liste {sonGuncelleme ? sonGuncelleme.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "–"} itibarıyla.</span>
          <button onClick={getir} className="inline-flex items-center gap-1 underline"><RefreshCw size={12} /> Yeniden dene</button>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b" style={{ borderColor: CARD_BORDER }}>
          <h3 className="text-xs font-bold text-white flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> Açık satış iş emirleri <span className="font-normal" style={{ color: TEXT_MUTED }}>({emirler.length})</span></h3>
          <span className="text-[11px]" style={{ color: TEXT_MUTED }}>Bugün yüklenen: <span className="font-semibold text-emerald-400">{bugunkuler.length} araç</span> · {kgYazi(bugunkuler.reduce((t, s) => t + Number(s.net_kg), 0))}</span>
        </div>
        {emirler.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs" style={{ color: TEXT_MUTED }}><Truck size={20} className="mx-auto mb-1.5" style={{ color: CARD_BORDER }} />Açık yurt içi iş emri yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed min-w-[420px]">
              <colgroup><col /><col className="w-[178px]" /><col className="w-[100px]" /></colgroup>
              <thead style={{ backgroundColor: ROW_HEADER_BG }}>
                <tr>
                  {["İş emri · Müşteri · Ürün", "Yüklenen / Hedef", ""].map((b, i) => <th key={i} className={`${th} ${i === 2 ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>)}
                </tr>
              </thead>
              <tbody>
                {emirler.map((e) => {
                  const kg = Number(e.yuklenen_kg);
                  const oran = ilerlemeOrani(e, kg, e.yuklenen_arac);
                  const tamam = hedefTamam(e, kg, e.yuklenen_arac);
                  return (
                    <tr key={e.id} className="border-t align-top" style={{ borderColor: CARD_BORDER }} data-testid="kantar-is-emri">
                      <td className="px-3 py-2">
                        <p className="text-[11px] truncate"><span className="font-bold" style={{ color: ACCENT }}>{e.is_emri_no}</span> <span className="font-semibold text-white">· {e.urun}</span>{e.ambalaj ? <span style={{ color: TEXT_MUTED }}> · {e.ambalaj}</span> : null}</p>
                        <p className="text-xs text-white truncate" title={e.musteri_maskeli}>{e.musteri_maskeli}</p>
                        <p className="text-[10.5px] truncate" style={{ color: TEXT_MUTED }}>{e.teslim || "-"}</p>
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-[11px] leading-snug text-white">{ilerlemeYazi(e, kg, e.yuklenen_arac)}</p>
                        <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#0F131A" }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(oran * 100))}%`, backgroundColor: tamam ? "#10B981" : "#38BDF8" }} />
                        </div>
                        <KalanRozet emir={e} kg={kg} arac={e.yuklenen_arac} sade />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => pencereAc(e)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold text-white hover:brightness-110 whitespace-nowrap" style={{ backgroundColor: ACCENT }} title={`${e.is_emri_no} için araç yükle (irsaliye ekle)`}>
                          <Upload size={12} /> Araç ekle
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sonSevkler.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <h3 className="px-3 py-2 border-b text-xs font-bold text-white flex items-center gap-2" style={{ borderColor: CARD_BORDER }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Son 3 günde yüklenen araçlar <span className="font-normal" style={{ color: TEXT_MUTED }}>({sonSevkler.length})</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed min-w-[420px]">
              <colgroup><col className="w-[104px]" /><col /><col className="w-[86px]" /><col className="w-[150px]" /></colgroup>
              <thead style={{ backgroundColor: ROW_HEADER_BG }}>
                <tr>
                  {["Plaka · Zaman", "Müşteri · İş emri", "Net", "İrsaliye · Çıkış"].map((b) => (
                    <th key={b} className={`${th} ${b === "Net" ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sonSevkler.map((s) => (
                  <tr key={s.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                    <td className="px-3 py-1.5 whitespace-nowrap"><span className="block text-[11px] font-bold text-white">{s.plaka}</span><span className="block text-[10px]" style={{ color: TEXT_MUTED }} title={s.dorse_plaka ? `Dorse: ${s.dorse_plaka}` : undefined}>{tarihSaatYazi(s.olusturma).slice(0, 16)}</span></td>
                    <td className="px-3 py-1.5 text-[11px] text-white"><span className="block truncate" title={s.musteri_maskeli}>{s.musteri_maskeli}</span><span className="block text-[10px] truncate" style={{ color: TEXT_MUTED }}>{s.is_emri_no} · {s.urun}</span></td>
                    <td className="px-3 py-1.5 text-[11px] font-bold text-white text-right whitespace-nowrap">{kgYazi(Number(s.net_kg))}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <button onClick={() => irsaliyeAc(s.irsaliye_dosya_yolu)} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20" title="İrsaliyeyi aç">
                        <FileText size={10} /> {s.irsaliye_no || "Gör"}
                      </button>
                      {s.uyari_var && <AlertTriangle size={12} className="inline ml-1.5 text-amber-400" aria-label="Uyarı var" />}
                      <span className={`block w-fit mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cikisEtiketi(s).sinif}`}>{cikisEtiketi(s).metin}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {secili && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="kantar-yukle-baslik">
          <div className="w-full max-w-lg rounded-2xl border shadow-2xl my-8" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="flex items-start justify-between px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
              <div>
                <h2 id="kantar-yukle-baslik" className="text-base font-bold text-white">{secili.urun} {secili.ambalaj ? `· ${secili.ambalaj}` : ""}</h2>
                <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{secili.is_emri_no} · {secili.musteri_maskeli} · {ilerlemeYazi(secili, Number(secili.yuklenen_kg), secili.yuklenen_arac)}</p>
              </div>
              <button onClick={pencereKapat} disabled={adim === "kaydediliyor"} className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {adim === "dosya" && (
                <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-10 cursor-pointer hover:bg-white/[0.03] text-center" style={{ borderColor: CARD_BORDER }}>
                  <Upload size={28} style={{ color: ACCENT }} />
                  <span className="text-sm font-semibold text-white">İrsaliye PDF&apos;ini seçin</span>
                  <span className="text-xs" style={{ color: TEXT_MUTED }}>Plaka ve net ağırlık irsaliyeden otomatik okunur.</span>
                  <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) dosyaSec(f); ev.target.value = ""; }} />
                </label>
              )}

              {adim === "okunuyor" && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm" style={{ color: TEXT_MUTED }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: ACCENT }} /> İrsaliye okunuyor...
                </div>
              )}

              {(adim === "kontrol" || adim === "kaydediliyor") && (
                <>
                  <div className="rounded-lg border px-3 py-2.5 text-xs flex items-start gap-2" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
                    {okuma && (okuma.plaka || okuma.netKg) ? <ScanText size={14} className="mt-0.5 text-emerald-400 shrink-0" /> : <PencilLine size={14} className="mt-0.5 text-amber-400 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-white truncate">{dosya?.name}</p>
                      {okuma && (okuma.plaka || okuma.netKg) ? (
                        <p style={{ color: TEXT_MUTED }}>
                          İrsaliyeden okundu{okuma.irsaliyeNo ? ` · ${okuma.irsaliyeNo}` : ""}{okuma.tarih ? ` · ${tarihSaatYazi(okuma.tarih)}` : ""}{okuma.urun ? ` · ${okuma.urun}` : ""}{okuma.soforAd ? ` · Şoför: ${okuma.soforAd}` : ""}
                        </p>
                      ) : (
                        <p className="text-amber-400">İrsaliye okunamadı (PDF metin değil, görüntü). Plaka, net ağırlık ve irsaliye no&apos;yu irsaliyeye bakarak yazın.</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block col-span-2 sm:col-span-1">
                      <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Araç plakası *</span>
                      <input value={plaka} onChange={(ev) => setPlaka(plakaYazarken(ev.target.value))}
                        onBlur={() => setPlaka(plakaBicimle(plaka))}
                        placeholder="59 AGD 284" autoCapitalize="characters" className="w-full px-3 py-3 rounded-lg border text-lg font-bold tracking-wider text-white uppercase placeholder:text-slate-600 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        style={{ backgroundColor: "#0F131A", borderColor: plaka && !plakaGecerli(plakaSon) ? "#F87171" : CARD_BORDER }} />
                    </label>
                    <label className="block col-span-2 sm:col-span-1">
                      <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Net ağırlık (kg) *</span>
                      <input value={net} onChange={(ev) => setNet(ev.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="25.500"
                        className="w-full px-3 py-3 rounded-lg border text-lg font-bold text-right text-white placeholder:text-slate-600 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        style={{ backgroundColor: "#0F131A", borderColor: net && (netSayi === null || netSayi <= 0 || netSayi > 60000) ? "#F87171" : CARD_BORDER }} />
                    </label>
                    {!irsNoOkundu && (
                      <label className="block col-span-2">
                        <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>İrsaliye no (irsaliyenin üstünde yazar)</span>
                        <input value={irsNoElle} onChange={(ev) => setIrsNoElle(ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))}
                          placeholder="IRS2026000001234" autoCapitalize="characters" spellCheck={false} aria-label="İrsaliye no"
                          className="w-full px-3 py-2 rounded-lg border text-sm font-semibold tracking-wide text-white uppercase placeholder:text-slate-600 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                          style={{ backgroundColor: "#0F131A", borderColor: irsNoGecerli ? CARD_BORDER : "#F87171" }} />
                        {!irsNoGecerli && <span className="block text-[11px] mt-1 text-red-400">Harf ve rakamlardan oluşan 3-20 karakter olmalı.</span>}
                        {ettnDosyaAdindan && <span className="block text-[11px] mt-1" style={{ color: TEXT_MUTED }}>ETTN dosya adından alındı.</span>}
                      </label>
                    )}
                    <label className="block col-span-2">
                      <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Dorse plakası (varsa)</span>
                      <input value={dorse} onChange={(ev) => setDorse(plakaYazarken(ev.target.value))} onBlur={() => setDorse(dorse ? plakaBicimle(dorse) : "")} autoCapitalize="characters"
                        className="w-full px-3 py-2 rounded-lg border text-sm font-semibold text-white uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/40" style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
                    </label>
                  </div>

                  {netSayi !== null && netSayi > 0 && (
                    <p className="text-xs" style={{ color: TEXT_MUTED }}>Kayıttan sonra: <span className="text-white font-medium">{ilerlemeYazi(secili, Number(secili.yuklenen_kg) + netSayi, secili.yuklenen_arac + 1)}</span> (hedef {hedefYazi(secili)})</p>
                  )}

                  {uyarilar && uyarilar.length > 0 && (
                    <div className="rounded-lg border px-3 py-2.5 space-y-1" style={{ borderColor: "#78350F", backgroundColor: "rgba(120,53,15,0.15)" }}>
                      {uyarilar.map((u) => <p key={u} className="flex items-start gap-1.5 text-xs text-amber-300"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {u}</p>)}
                      <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Doğru iş emrini ve irsaliyeyi seçtiğinizden emin olun. Yine de kaydederseniz uyarı yetkiliye iletilir.</p>
                    </div>
                  )}
                  {uyarilar && uyarilar.length === 0 && (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 size={13} /> Kontroller tamam.</p>
                  )}
                </>
              )}

              {hata && <p className="flex items-start gap-1.5 text-sm text-red-400"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {hata}</p>}
            </div>

            {(adim === "kontrol" || adim === "kaydediliyor") && (
              <div className="flex justify-between gap-2 px-5 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
                <button onClick={() => { setAdim("dosya"); setDosya(null); setOkuma(null); setUyarilar(null); setHata(null); dosyaYolu.current = ""; }} disabled={adim === "kaydediliyor"}
                  className="px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Başka dosya</button>
                <button onClick={kaydet} disabled={adim === "kaydediliyor" || !girdiGecerli || uyarilar === null}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
                  style={{ backgroundColor: uyarilar && uyarilar.length ? "#B45309" : ACCENT }}>
                  {adim === "kaydediliyor" ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  {uyarilar && uyarilar.length ? "Uyarıya rağmen kaydet" : "Onayla ve Kaydet"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
