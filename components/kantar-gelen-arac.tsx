"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { Loader2, Upload, X, FileText, AlertTriangle, CheckCircle2, PackageOpen, ScanText, PencilLine, Link2, FileX } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { IC_BELGE_BUCKET, KantarIsEmri, hataMesaji, kgYazi, tarihSaatYazi, tonYazi } from "@/lib/ic-piyasa/is-emri";
import { IrsaliyeOkuma, irsaliyePdfOku, plakaBicimle, plakaGecerli, plakaYazarken, trSayiOku, urunUyusuyor } from "@/lib/ic-piyasa/irsaliye-oku";
import { KantarAlisSiparisi, KantarAlisTeslim, alisIlerleme, alisUrunYazi, gunTR, ALIS_TESLIM_ETIKET } from "@/lib/ic-piyasa/alis";

/**
 * Kantar Paneli > Gelen Arac · Alis (30.10.2026).
 * Kantarci acik alis siparislerini (FIYATSIZ) gorur; teslim alinan her araci
 * plaka + net kg (+ irsaliye PDF'i) ile girer. TMO'dan cekilip DOGRUDAN
 * musteriye giden aracta "Dogrudan musteriye sevk" secilir: ayni kayit satis
 * is emrine de sevk olarak yazilir (irsaliye zorunlu; satis bildirim akisi
 * aynen calisir). Veri: kantar_ic_alis_* fonksiyonlari (migration 20261030100000).
 * Fonksiyonlar yoksa (migration uygulanmamis) bolum HIC gorunmez.
 */

type Adim = "dosya" | "okunuyor" | "kontrol" | "kaydediliyor";
const IRSALIYE_NO_RE = /^[A-Z0-9]{3,20}$/;
const ETTN_DOSYA_RE = /^([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})(?:\s*\(\d+\))?\.pdf$/i;

export function KantarGelenArac({ yenileTetik = 0, acikSayiBildir }: { yenileTetik?: number; acikSayiBildir?: (n: number | null) => void } = {}) {
  const { companyId } = useAuth();
  const { showToast } = useToast();
  const [siparisler, setSiparisler] = useState<KantarAlisSiparisi[]>([]);
  const [sonlar, setSonlar] = useState<KantarAlisTeslim[]>([]);
  const [emirler, setEmirler] = useState<KantarIsEmri[]>([]);
  const [yok, setYok] = useState(false); // migration yok / yetki yok -> bolum gizli
  const [yukleniyor, setYukleniyor] = useState(true);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const istekSira = useRef(0);

  const getir = useCallback(async () => {
    const sira = ++istekSira.current;
    const [aRes, sRes, eRes] = await Promise.all([
      supabase.rpc("kantar_ic_alis_siparisleri"),
      supabase.rpc("kantar_ic_alis_son_teslimler", { p_gun: 3 }),
      supabase.rpc("kantar_ic_is_emirleri"),
    ]);
    if (sira !== istekSira.current) return;
    const err = aRes.error || sRes.error;
    if (err) {
      // Fonksiyon yok (PGRST202 / 42883) ya da yetki yok -> bolum hic gosterilmez
      if (/PGRST202|42883|42501|could not find|does not exist|yetkiniz yok/i.test(`${err.code || ""} ${err.message}`)) { setYok(true); acikSayiBildir?.(null); }
      else setOkumaHatasi(err.message);
      setYukleniyor(false);
      return;
    }
    setYok(false);
    setSiparisler((aRes.data || []) as KantarAlisSiparisi[]);
    setSonlar((sRes.data || []) as KantarAlisTeslim[]);
    setEmirler(eRes.error ? [] : ((eRes.data || []) as KantarIsEmri[]));
    setOkumaHatasi(null);
    setYukleniyor(false);
  }, [acikSayiBildir]);

  useEffect(() => { getir(); }, [getir, yenileTetik]);
  useEffect(() => { if (!yukleniyor && !yok) acikSayiBildir?.(siparisler.length); }, [siparisler.length, yukleniyor, yok, acikSayiBildir]);
  useEffect(() => {
    const yenile = () => { if (document.visibilityState === "visible") getir(); };
    const z = window.setInterval(yenile, 60_000);
    document.addEventListener("visibilitychange", yenile);
    window.addEventListener("online", yenile);
    return () => { window.clearInterval(z); document.removeEventListener("visibilitychange", yenile); window.removeEventListener("online", yenile); };
  }, [getir]);

  // ---- Giris penceresi ----
  const [secili, setSecili] = useState<KantarAlisSiparisi | null>(null);
  const [adim, setAdim] = useState<Adim>("dosya");
  const [dosya, setDosya] = useState<File | null>(null);
  const [okuma, setOkuma] = useState<IrsaliyeOkuma | null>(null);
  const [plaka, setPlaka] = useState("");
  const [dorse, setDorse] = useState("");
  const [net, setNet] = useState("");
  const [irsNoElle, setIrsNoElle] = useState("");
  const [dogrudan, setDogrudan] = useState(false);
  const [emirId, setEmirId] = useState("");
  const [uyarilar, setUyarilar] = useState<string[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const kontrolSira = useRef(0);
  const zamanDamgasi = useRef<number>(0);

  const pencereAc = (s: KantarAlisSiparisi) => {
    setSecili(s); setAdim("dosya"); setDosya(null); setOkuma(null); setPlaka(""); setDorse(""); setNet(""); setIrsNoElle("");
    setDogrudan(false); setEmirId(""); setUyarilar(null); setHata(null); zamanDamgasi.current = Date.now();
  };
  const pencereKapat = () => { if (adim !== "kaydediliyor") setSecili(null); };

  const dosyaSec = async (f: File) => {
    setHata(null);
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { setHata("Lütfen irsaliyenin PDF dosyasını seçin."); return; }
    if (f.size > 10 * 1024 * 1024) { setHata("Dosya 10 MB'tan büyük olamaz."); return; }
    setDosya(f);
    setAdim("okunuyor");
    let o: IrsaliyeOkuma | null = null;
    try { o = await irsaliyePdfOku(f); } catch (err) { console.error("İrsaliye okunamadı:", err); o = null; }
    setOkuma(o);
    setIrsNoElle("");
    setPlaka(o?.plaka || "");
    setDorse(o?.dorsePlaka || "");
    setNet(o?.netKg ? o.netKg.toLocaleString("tr-TR", { maximumFractionDigits: 2 }) : "");
    setAdim("kontrol");
  };
  const irsaliyesizDevam = () => { setDosya(null); setOkuma(null); setAdim("kontrol"); };

  const netSayi = net.trim() ? trSayiOku(net.trim().replace(/\s/g, "")) : null;
  const plakaSon = plakaBicimle(plaka);
  const elleDuzeltildi = !!okuma && ((!!okuma.plaka && okuma.plaka !== plakaSon) || (okuma.netKg !== null && netSayi !== null && Math.abs(okuma.netKg - netSayi) > 0.001));
  const secilenEmir = emirler.find((e) => e.id === emirId) || null;
  const urunFarkli = dogrudan && secilenEmir && okuma ? urunUyusuyor(secilenEmir.urun, okuma.urun) === false : false;
  const irsNoOkundu = !!okuma?.irsaliyeNo;
  const irsNoSon = irsNoElle.trim().toUpperCase();
  const irsNoGecerli = !irsNoSon || IRSALIYE_NO_RE.test(irsNoSon);
  const ettnDosyaAdindan = dosya ? (dosya.name.match(ETTN_DOSYA_RE)?.[1]?.toUpperCase() || null) : null;
  const dogrudanEksik = dogrudan && (!emirId || !dosya);
  const girdiGecerli = plakaGecerli(plakaSon) && netSayi !== null && netSayi > 0 && netSayi <= 60000 && (irsNoOkundu || irsNoGecerli) && !dogrudanEksik;

  const yol = useCallback(() => {
    if (!dosya || !companyId || !secili) return null;
    return dogrudan && emirId
      ? `${companyId}/irsaliye/${emirId}/${zamanDamgasi.current}.pdf`
      : `${companyId}/alis/${secili.id}/${zamanDamgasi.current}.pdf`;
  }, [dosya, companyId, secili, dogrudan, emirId]);

  const veri = useCallback(() => ({
    alis_id: secili?.id,
    is_emri_id: dogrudan && emirId ? emirId : null,
    plaka: plakaSon,
    dorse_plaka: dorse ? plakaBicimle(dorse) : null,
    net_kg: netSayi,
    irsaliye_no: okuma?.irsaliyeNo || irsNoSon || null,
    irsaliye_tarihi: okuma?.tarih || null,
    ettn: okuma?.ettn || ettnDosyaAdindan,
    sofor_ad: okuma?.soforAd || null,
    alici_vkn: okuma?.aliciVkn || null,
    irsaliye_urun: okuma?.urun || null,
    irsaliye_dosya_yolu: yol(),
    irsaliye_dosya_adi: dosya?.name || null,
    elle_duzeltildi: elleDuzeltildi,
    urun_uyusmuyor: urunFarkli,
    okunan: okuma ? {
      irsaliye_no: okuma.irsaliyeNo, tarih: okuma.tarih, plaka: okuma.plaka, dorse: okuma.dorsePlaka,
      net_kg: okuma.netKg, urun: okuma.urun, alici_unvan: okuma.aliciUnvan, kalemler: okuma.kalemler,
    } : null,
  }), [secili, dogrudan, emirId, plakaSon, dorse, netSayi, okuma, irsNoSon, ettnDosyaAdindan, yol, dosya, elleDuzeltildi, urunFarkli]);

  // Girdi degistikce sunucuda KURU kontrol (kaydetmeden uyarilar)
  useEffect(() => {
    if (adim !== "kontrol" || !secili || !girdiGecerli) { setUyarilar(null); return; }
    const sira = ++kontrolSira.current;
    const z = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("kantar_ic_alis_teslim_ekle", { p_veri: veri(), p_kaydet: false });
      if (sira !== kontrolSira.current) return;
      if (error) { setHata(hataMesaji(error)); setUyarilar(null); return; }
      setHata(null);
      setUyarilar(((data as { uyarilar?: string[] })?.uyarilar) || []);
    }, 350);
    return () => window.clearTimeout(z);
  }, [adim, secili, girdiGecerli, veri]);

  const kaydet = async () => {
    if (!secili || !companyId || !girdiGecerli) return;
    setAdim("kaydediliyor");
    setHata(null);
    const y = yol();
    if (dosya && y) {
      const { error: yErr } = await supabase.storage.from(IC_BELGE_BUCKET).upload(y, dosya, { contentType: "application/pdf", upsert: false });
      if (yErr) { setHata(`Dosya yüklenemedi: ${yErr.message}`); setAdim("kontrol"); zamanDamgasi.current = Date.now(); return; }
    }
    const { data, error } = await supabase.rpc("kantar_ic_alis_teslim_ekle", { p_veri: veri(), p_kaydet: true });
    if (error || !(data as { kaydedildi?: boolean })?.kaydedildi) {
      if (dosya && y) await supabase.storage.from(IC_BELGE_BUCKET).remove([y]); // sahipsiz dosya kalmasin
      zamanDamgasi.current = Date.now();
      setHata(hataMesaji(error || { message: "Kaydedilemedi." }));
      setAdim("kontrol");
      return;
    }
    const d = data as { alinan_kg: number; sevk_id: string | null };
    showToast(`${plakaSon} · ${kgYazi(netSayi)} teslim alındı. ${secili.alis_no}: ${tonYazi(d.alinan_kg)} / ${tonYazi(secili.miktar_kg)}${d.sevk_id && secilenEmir ? ` · ${secilenEmir.is_emri_no} sevkine de işlendi` : ""}`, "success");
    setSecili(null);
    getir();
  };

  const irsaliyeAc = async (y: string) => {
    const pencere = window.open("", "_blank");
    const { data, error } = await supabase.storage.from(IC_BELGE_BUCKET).createSignedUrl(y, 60 * 10);
    if (error || !data?.signedUrl) { pencere?.close(); showToast(`İrsaliye açılamadı: ${error?.message || "bilinmeyen hata"}`, "error"); return; }
    if (pencere) pencere.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  };

  if (yok) return null;
  if (yukleniyor) return <div className="flex items-center justify-center py-6"><Loader2 size={20} className="animate-spin" style={{ color: ACCENT }} /></div>;

  const bugun = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  const bugunkuler = sonlar.filter((s) => new Date(s.olusturma).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }) === bugun);

  return (
    <div className="space-y-3" data-testid="kantar-gelen-arac">
      <h2 className="text-sm font-bold flex items-center gap-2 text-white">
        <span className="w-2 h-2 rounded-full bg-amber-500" /> Gelen Araç · Alış Siparişleri
        <span className="text-xs font-normal" style={{ color: TEXT_MUTED }}>({siparisler.length}) · bugün {bugunkuler.length} araç · {kgYazi(bugunkuler.reduce((t, s) => t + Number(s.net_kg), 0))}</span>
      </h2>
      {okumaHatasi && <p className="text-xs text-amber-300">Sunucuya ulaşılamadı; liste güncel olmayabilir.</p>}
      {siparisler.length === 0 ? (
        <div className="rounded-xl border p-6 text-center" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <p className="text-sm" style={{ color: TEXT_MUTED }}>Açık alış siparişi yok.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-1 min-[1800px]:grid-cols-2 gap-3">
          {siparisler.map((s) => {
            const il = alisIlerleme(s.miktar_kg, Number(s.alinan_kg));
            return (
              <div key={s.id} className="rounded-xl border p-4 flex flex-col gap-3" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold" style={{ color: TEXT_MUTED }}>{s.alis_no}</p>
                    <p className="text-lg font-bold text-white leading-tight">{alisUrunYazi(s)}</p>
                    <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{s.tedarikci}{s.depo ? ` · Depo ${s.depo}` : ""} · {ALIS_TESLIM_ETIKET[s.teslim]}{s.termin ? ` · termin ${gunTR(s.termin)}` : ""}</p>
                  </div>
                  <span className="shrink-0 text-[11px] px-2 py-1 rounded-full font-semibold bg-amber-500/15 text-amber-400">Kalan {tonYazi(il.bekleyen)}</span>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-white font-medium">{tonYazi(s.alinan_kg)} / {tonYazi(s.miktar_kg)} · {s.alinan_arac} araç</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#0F131A" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(il.oran * 100))}%`, backgroundColor: "#F59E0B" }} />
                  </div>
                </div>
                <button onClick={() => pencereAc(s)} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold text-black hover:brightness-110" style={{ backgroundColor: "#F59E0B" }}>
                  <PackageOpen size={16} /> Araç Teslim Al
                </button>
              </div>
            );
          })}
        </div>
      )}

      {sonlar.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                <tr>{["Zaman", "Plaka", "Ürün / Alış", "Tedarikçi", "Net", "İrsaliye"].map((b) => <th key={b} className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${b === "Net" ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>)}</tr>
              </thead>
              <tbody>
                {sonlar.map((s) => (
                  <tr key={s.id} className="border-b last:border-0" style={{ borderColor: CARD_BORDER }}>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{tarihSaatYazi(s.olusturma)}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-white whitespace-nowrap">{s.plaka}</td>
                    <td className="px-4 py-2.5 text-xs text-white">{s.urun}<span className="block text-[10px]" style={{ color: TEXT_MUTED }}>{s.alis_no}{s.dogrudan_is_emri_no ? ` → ${s.dogrudan_is_emri_no}` : ""}</span></td>
                    <td className="px-4 py-2.5 text-xs text-white">{s.tedarikci}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-white text-right whitespace-nowrap">{kgYazi(Number(s.net_kg))}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {s.irsaliye_dosya_yolu ? (
                        <button onClick={() => irsaliyeAc(s.irsaliye_dosya_yolu!)} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"><FileText size={11} /> {s.irsaliye_no || "Gör"}</button>
                      ) : <span className="text-[10px]" style={{ color: TEXT_MUTED }}>irsaliyesiz</span>}
                      {s.uyari_var && <AlertTriangle size={13} className="inline ml-2 text-amber-400" aria-label="Uyarı var" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {secili && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="gelen-arac-baslik">
          <div className="w-full max-w-lg rounded-2xl border shadow-2xl my-8" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="flex items-start justify-between px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
              <div>
                <h2 id="gelen-arac-baslik" className="text-base font-bold text-white">Araç teslim al · {alisUrunYazi(secili)}</h2>
                <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{secili.alis_no} · {secili.tedarikci} · {tonYazi(secili.alinan_kg)} / {tonYazi(secili.miktar_kg)}</p>
              </div>
              <button onClick={pencereKapat} disabled={adim === "kaydediliyor"} className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {adim === "dosya" && (
                <>
                  <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 cursor-pointer hover:bg-white/[0.03] text-center" style={{ borderColor: CARD_BORDER }}>
                    <Upload size={26} style={{ color: ACCENT }} />
                    <span className="text-sm font-semibold text-white">İrsaliye PDF&apos;ini seçin</span>
                    <span className="text-xs" style={{ color: TEXT_MUTED }}>Plaka ve net ağırlık irsaliyeden okunur.</span>
                    <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) dosyaSec(f); ev.target.value = ""; }} />
                  </label>
                  <button onClick={irsaliyesizDevam} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                    <FileX size={14} /> İrsaliye yok, plaka ve net ağırlığı elle gir
                  </button>
                </>
              )}

              {adim === "okunuyor" && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm" style={{ color: TEXT_MUTED }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: ACCENT }} /> İrsaliye okunuyor...
                </div>
              )}

              {(adim === "kontrol" || adim === "kaydediliyor") && (
                <>
                  <div className="rounded-lg border px-3 py-2.5 text-xs flex items-start gap-2" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
                    {dosya && okuma && (okuma.plaka || okuma.netKg) ? <ScanText size={14} className="mt-0.5 text-emerald-400 shrink-0" /> : <PencilLine size={14} className="mt-0.5 text-amber-400 shrink-0" />}
                    <div className="min-w-0">
                      {dosya ? <p className="text-white truncate">{dosya.name}</p> : <p className="text-white">İrsaliyesiz giriş</p>}
                      {dosya && okuma && (okuma.plaka || okuma.netKg) ? (
                        <p style={{ color: TEXT_MUTED }}>İrsaliyeden okundu{okuma.irsaliyeNo ? ` · ${okuma.irsaliyeNo}` : ""}{okuma.urun ? ` · ${okuma.urun}` : ""}</p>
                      ) : dosya ? (
                        <p className="text-amber-400">İrsaliye okunamadı (görüntü PDF). Plaka, net ağırlık ve irsaliye no&apos;yu elle yazın.</p>
                      ) : (
                        <p style={{ color: TEXT_MUTED }}>Plaka ve kantar net ağırlığını yazın.</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block col-span-2 sm:col-span-1">
                      <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Araç plakası *</span>
                      <input value={plaka} onChange={(ev) => setPlaka(plakaYazarken(ev.target.value))} onBlur={() => setPlaka(plakaBicimle(plaka))}
                        placeholder="59 AGD 284" autoCapitalize="characters" aria-label="Araç plakası" className="w-full px-3 py-3 rounded-lg border text-lg font-bold tracking-wider text-white uppercase placeholder:text-slate-600 placeholder:font-normal"
                        style={{ backgroundColor: "#0F131A", borderColor: plaka && !plakaGecerli(plakaSon) ? "#F87171" : CARD_BORDER }} />
                    </label>
                    <label className="block col-span-2 sm:col-span-1">
                      <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Net ağırlık (kg) *</span>
                      <input value={net} onChange={(ev) => setNet(ev.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="25.500" aria-label="Net ağırlık"
                        className="w-full px-3 py-3 rounded-lg border text-lg font-bold text-right text-white placeholder:text-slate-600 placeholder:font-normal"
                        style={{ backgroundColor: "#0F131A", borderColor: net && (netSayi === null || netSayi <= 0 || netSayi > 60000) ? "#F87171" : CARD_BORDER }} />
                    </label>
                    {dosya && !irsNoOkundu && (
                      <label className="block col-span-2">
                        <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>İrsaliye no</span>
                        <input value={irsNoElle} onChange={(ev) => setIrsNoElle(ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))} placeholder="IRS2026000001234" aria-label="İrsaliye no"
                          className="w-full px-3 py-2 rounded-lg border text-sm font-semibold tracking-wide text-white uppercase placeholder:text-slate-600 placeholder:font-normal"
                          style={{ backgroundColor: "#0F131A", borderColor: irsNoGecerli ? CARD_BORDER : "#F87171" }} />
                      </label>
                    )}
                    <label className="block col-span-2">
                      <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Dorse plakası (varsa)</span>
                      <input value={dorse} onChange={(ev) => setDorse(plakaYazarken(ev.target.value))} onBlur={() => setDorse(dorse ? plakaBicimle(dorse) : "")} aria-label="Dorse plakası"
                        className="w-full px-3 py-2 rounded-lg border text-sm font-semibold text-white uppercase" style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
                    </label>
                  </div>

                  <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: dogrudan ? "#0369A1" : CARD_BORDER, backgroundColor: dogrudan ? "rgba(3,105,161,0.10)" : "transparent" }}>
                    <label className="flex items-start gap-2 text-sm text-white cursor-pointer">
                      <input type="checkbox" checked={dogrudan} onChange={(e) => setDogrudan(e.target.checked)} className="mt-0.5" disabled={!emirler.length} />
                      <span>
                        <span className="font-semibold inline-flex items-center gap-1"><Link2 size={13} /> Doğrudan müşteriye sevk</span>
                        <span className="block text-xs" style={{ color: TEXT_MUTED }}>{emirler.length ? "Araç tedarikçiden alınıp doğrudan müşteriye gidiyor. Aynı kayıt seçilen iş emrine de sevk olarak işlenir." : "Açık satış iş emri yok."}</span>
                      </span>
                    </label>
                    {dogrudan && (
                      <>
                        <select value={emirId} onChange={(e) => setEmirId(e.target.value)} aria-label="Satış iş emri" className="w-full px-3 py-2 rounded-lg border text-sm text-white" style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }}>
                          <option value="">Satış iş emrini seçin…</option>
                          {emirler.map((e) => <option key={e.id} value={e.id}>{e.is_emri_no} · {e.urun} · {e.musteri_maskeli} · {e.teslim || "-"}</option>)}
                        </select>
                        {!dosya && <p className="text-xs text-amber-400">Doğrudan sevkte irsaliye PDF&apos;i zorunlu. &quot;Başka dosya&quot; ile irsaliye seçin.</p>}
                      </>
                    )}
                  </div>

                  {netSayi !== null && netSayi > 0 && (
                    <p className="text-xs" style={{ color: TEXT_MUTED }}>Kayıttan sonra: <span className="text-white font-medium">{tonYazi(Number(secili.alinan_kg) + netSayi)} / {tonYazi(secili.miktar_kg)}</span></p>
                  )}
                  {uyarilar && uyarilar.length > 0 && (
                    <div className="rounded-lg border px-3 py-2.5 space-y-1" style={{ borderColor: "#78350F", backgroundColor: "rgba(120,53,15,0.15)" }}>
                      {uyarilar.map((u) => <p key={u} className="flex items-start gap-1.5 text-xs text-amber-300"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {u}</p>)}
                      <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Doğru siparişi seçtiğinizden emin olun. Yine de kaydederseniz uyarı yetkiliye iletilir.</p>
                    </div>
                  )}
                  {uyarilar && uyarilar.length === 0 && <p className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 size={13} /> Kontroller tamam.</p>}
                </>
              )}

              {hata && <p className="flex items-start gap-1.5 text-sm text-red-400"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {hata}</p>}
            </div>

            {(adim === "kontrol" || adim === "kaydediliyor") && (
              <div className="flex justify-between gap-2 px-5 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
                <button onClick={() => { setAdim("dosya"); setDosya(null); setOkuma(null); setUyarilar(null); setHata(null); zamanDamgasi.current = Date.now(); }} disabled={adim === "kaydediliyor"}
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
