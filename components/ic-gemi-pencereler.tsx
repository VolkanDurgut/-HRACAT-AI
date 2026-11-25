"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { Loader2, X, Ship, AlertTriangle, ClipboardPaste, Truck, Users, CheckCircle2, CornerDownLeft, FileSpreadsheet } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { kgYazi } from "@/lib/ic-piyasa/is-emri";
import { gunTR, bugunTRIso } from "@/lib/ic-piyasa/alis";
import { plakaBicimle, plakaGecerli, plakaYazarken, trSayiOku } from "@/lib/ic-piyasa/irsaliye-oku";
import { GemiAlici, GemiTahliye, ListeSatiri, gemiHataMesaji, limanListesiAyristir } from "@/lib/ic-piyasa/gemi-tahliye";
import { LimanSatiri, gemiSeferUyar, limanExceliAyristir } from "@/lib/ic-piyasa/liman-excel";

/**
 * Ic Piyasa > Gemi Tahliye pencereleri (25.11.2026): gemi ac / duzenle, gemiden satis (firma + tonaj),
 * tek arac (ofis) ve liman listesi yapistir (gemiden satis araclari; hepsi ya da hicbiri).
 */

const girdi = "w-full px-3 py-2 rounded-lg border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 bg-transparent";
const tonGirdisi = (kg: number | null | undefined) => (kg ? (Number(kg) / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 }) : "");
/** "3.185,340" veya "3185,34" ton -> kg */
const tonOku = (m: string): number | null => {
  const t = m.trim();
  if (!t) return null;
  const n = trSayiOku(t);
  return n === null ? null : Math.round(n * 1000 * 100) / 100;
};

function Pencere({ baslik, aciklama, ikon, kapat, mesgul, children, genis = false, testId }: {
  baslik: string; aciklama?: string; ikon: React.ReactNode; kapat: () => void; mesgul: boolean; children: React.ReactNode; genis?: boolean; testId?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label={baslik} data-testid={testId}
      onKeyDown={(e) => { if (e.key === "Escape" && !mesgul) kapat(); }}>
      <div className={`w-full ${genis ? "max-w-3xl" : "max-w-lg"} rounded-2xl border shadow-2xl my-8`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div>
            <h2 className="text-white font-semibold flex items-center gap-2">{ikon} {baslik}</h2>
            {aciklama && <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{aciklama}</p>}
          </div>
          <button onClick={kapat} disabled={mesgul} className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Altbar({ hata, mesgul, kapat, onay, onayEtiket, devreDisi = false }: { hata: string | null; mesgul: boolean; kapat: () => void; onay: () => void; onayEtiket: string; devreDisi?: boolean }) {
  return (
    <>
      {hata && <p className="text-sm text-red-400 flex items-start gap-1.5" role="alert"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {hata}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={kapat} disabled={mesgul} className="px-4 py-2 rounded-lg border text-sm font-semibold hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
        <button onClick={onay} disabled={mesgul || devreDisi} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white hover:brightness-110 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
          {mesgul && <Loader2 size={14} className="animate-spin" />} {onayEtiket}
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Gemi ac / duzenle
// ---------------------------------------------------------------------------
export function GemiFormu({ companyId, mevcut, kapat, kaydedildi }: {
  companyId: string; mevcut: GemiTahliye | null; kapat: () => void; kaydedildi: (id: string) => void;
}) {
  const { showToast } = useToast();
  const [ad, setAd] = useState(mevcut?.gemi_adi || "");
  const [satici, setSatici] = useState(mevcut?.satici || "");
  const [liman, setLiman] = useState(mevcut?.tahliye_limani || "");
  const [urun, setUrun] = useState(mevcut?.urun || "Buğday");
  const [kalite, setKalite] = useState(mevcut?.kalite || "");
  const [ton, setTon] = useState(tonGirdisi(mevcut?.bl_kg));
  const [baslangic, setBaslangic] = useState(mevcut?.baslangic || bugunTRIso());
  const [notlar, setNotlar] = useState(mevcut?.notlar || "");
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const kaydet = async () => {
    setHata(null);
    const kg = tonOku(ton);
    if (ad.trim().length < 2) { setHata("Gemi adını yazın."); return; }
    if (!kg || kg <= 0) { setHata("Anlaşma (B/L) tonajını ton olarak yazın. Örnek: 4.000 veya 2.755,38"); return; }
    if (!urun.trim()) { setHata("Ürünü yazın."); return; }
    const veri = {
      gemi_adi: ad.trim(), satici: satici.trim() || null, tahliye_limani: liman.trim() || null, urun: urun.trim(),
      kalite: kalite.trim() || null, bl_kg: kg, baslangic: baslangic || null, notlar: notlar.trim() || null,
    };
    setMesgul(true);
    const sonuc = mevcut
      ? await supabase.from("ic_gemi_tahliyeleri").update(veri).eq("id", mevcut.id).eq("company_id", companyId).select("id")
      : await supabase.from("ic_gemi_tahliyeleri").insert({ ...veri, company_id: companyId }).select("id");
    setMesgul(false);
    if (sonuc.error || !sonuc.data?.length) { setHata(gemiHataMesaji(sonuc.error || { message: "Kayıt bulunamadı veya yetkiniz yok." })); return; }
    showToast(mevcut ? "Gemi bilgileri güncellendi." : `${veri.gemi_adi.toLocaleUpperCase("tr")} tahliyesi açıldı.`, "success");
    kaydedildi((sonuc.data[0] as { id: string }).id);
  };

  return (
    <Pencere baslik={mevcut ? "Gemi Bilgileri" : "Yeni Gemi Tahliyesi"} aciklama="Anlaşma (B/L) tonajı raporun SİPARİŞ MİKTARI'dır; yüzde ve kalan buna göre hesaplanır."
      ikon={<Ship size={16} style={{ color: ACCENT }} />} kapat={kapat} mesgul={mesgul} testId="gemi-formu">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs sm:col-span-2" style={{ color: TEXT_MUTED }}>Gemi adı *
          <input value={ad} onChange={(e) => setAd(e.target.value)} maxLength={80} placeholder="MV ..." className={`${girdi} mt-1 uppercase`} style={{ borderColor: CARD_BORDER }} autoFocus />
        </label>
        <label className="text-xs" style={{ color: TEXT_MUTED }}>Anlaşma / B/L tonajı (ton) *
          <input value={ton} onChange={(e) => setTon(e.target.value)} inputMode="decimal" placeholder="4.000" className={`${girdi} mt-1`} style={{ borderColor: CARD_BORDER }} />
        </label>
        <label className="text-xs" style={{ color: TEXT_MUTED }}>Tahliye başlangıcı
          <input type="date" value={baslangic} onChange={(e) => setBaslangic(e.target.value)} className={`${girdi} mt-1`} style={{ borderColor: CARD_BORDER, colorScheme: "dark" }} />
        </label>
        <label className="text-xs" style={{ color: TEXT_MUTED }}>Ürün *
          <input value={urun} onChange={(e) => setUrun(e.target.value)} maxLength={80} className={`${girdi} mt-1`} style={{ borderColor: CARD_BORDER }} />
        </label>
        <label className="text-xs" style={{ color: TEXT_MUTED }}>Kalite
          <input value={kalite} onChange={(e) => setKalite(e.target.value)} maxLength={80} placeholder="11,5 PRO" className={`${girdi} mt-1`} style={{ borderColor: CARD_BORDER }} />
        </label>
        <label className="text-xs" style={{ color: TEXT_MUTED }}>Satıcı
          <input value={satici} onChange={(e) => setSatici(e.target.value)} maxLength={200} className={`${girdi} mt-1`} style={{ borderColor: CARD_BORDER }} />
        </label>
        <label className="text-xs" style={{ color: TEXT_MUTED }}>Tahliye limanı
          <input value={liman} onChange={(e) => setLiman(e.target.value)} maxLength={80} placeholder="Tekirdağ" className={`${girdi} mt-1`} style={{ borderColor: CARD_BORDER }} />
        </label>
        <label className="text-xs sm:col-span-2" style={{ color: TEXT_MUTED }}>Not
          <textarea value={notlar} onChange={(e) => setNotlar(e.target.value)} maxLength={500} rows={2} className={`${girdi} mt-1 resize-none`} style={{ borderColor: CARD_BORDER }} />
        </label>
      </div>
      <Altbar hata={hata} mesgul={mesgul} kapat={kapat} onay={kaydet} onayEtiket={mevcut ? "Kaydet" : "Tahliyeyi Aç"} />
    </Pencere>
  );
}

// ---------------------------------------------------------------------------
// Gemiden satis (firma + tonaj)
// ---------------------------------------------------------------------------
export function SatisFormu({ companyId, gemi, mevcut, kapat, kaydedildi }: {
  companyId: string; gemi: GemiTahliye; mevcut: GemiAlici | null; kapat: () => void; kaydedildi: () => void;
}) {
  const { showToast } = useToast();
  const [firma, setFirma] = useState(mevcut?.firma || "");
  const [ton, setTon] = useState(tonGirdisi(mevcut?.miktar_kg));
  const [notlar, setNotlar] = useState(mevcut?.notlar || "");
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const kaydet = async () => {
    setHata(null);
    const kg = tonOku(ton);
    if (firma.trim().length < 2) { setHata("Firma adını yazın."); return; }
    if (!kg || kg <= 0) { setHata("Satış tonajını ton olarak yazın."); return; }
    setMesgul(true);
    const veri = { firma: firma.trim(), miktar_kg: kg, notlar: notlar.trim() || null };
    const sonuc = mevcut
      ? await supabase.from("ic_gemi_alicilari").update(veri).eq("id", mevcut.id).eq("company_id", companyId).select("id")
      : await supabase.from("ic_gemi_alicilari").insert({ ...veri, company_id: companyId, gemi_id: gemi.id }).select("id");
    setMesgul(false);
    if (sonuc.error || !sonuc.data?.length) { setHata(gemiHataMesaji(sonuc.error || { message: "Kayıt bulunamadı veya yetkiniz yok." })); return; }
    showToast(mevcut ? "Satış güncellendi." : "Gemiden satış eklendi.", "success");
    kaydedildi();
  };

  return (
    <Pencere baslik={mevcut ? "Satışı Düzenle" : "Gemiden Satış Ekle"} aciklama={`${gemi.gemi_adi}: alıcının araçları bize gelmez; yalnız liman kg'ı girilir.`}
      ikon={<Users size={16} style={{ color: ACCENT }} />} kapat={kapat} mesgul={mesgul} testId="gemi-satis-formu">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-xs sm:col-span-2" style={{ color: TEXT_MUTED }}>Firma adı *
          <input value={firma} onChange={(e) => setFirma(e.target.value)} maxLength={120} className={`${girdi} mt-1 uppercase`} style={{ borderColor: CARD_BORDER }} autoFocus />
        </label>
        <label className="text-xs" style={{ color: TEXT_MUTED }}>Tonaj (ton) *
          <input value={ton} onChange={(e) => setTon(e.target.value)} inputMode="decimal" placeholder="500" className={`${girdi} mt-1`} style={{ borderColor: CARD_BORDER }} />
        </label>
        <label className="text-xs sm:col-span-3" style={{ color: TEXT_MUTED }}>Not
          <input value={notlar} onChange={(e) => setNotlar(e.target.value)} maxLength={300} className={`${girdi} mt-1`} style={{ borderColor: CARD_BORDER }} />
        </label>
      </div>
      <Altbar hata={hata} mesgul={mesgul} kapat={kapat} onay={kaydet} onayEtiket={mevcut ? "Kaydet" : "Satışı Ekle"} />
    </Pencere>
  );
}

// ---------------------------------------------------------------------------
// Tek arac (ofis veya kantar): kuru kontrol -> uyarilar -> kaydet
// ---------------------------------------------------------------------------
export function GemiAracFormu({ gemi, alicilar, kaynak, kapat, kaydedildi, varsayilanAlici = "" }: {
  gemi: Pick<GemiTahliye, "id" | "gemi_adi">; alicilar: Pick<GemiAlici, "id" | "firma">[]; kaynak: "kantar" | "ofis";
  kapat: () => void; kaydedildi: () => void; varsayilanAlici?: string;
}) {
  const { showToast } = useToast();
  const [alici, setAlici] = useState(varsayilanAlici);
  const [plaka, setPlaka] = useState("");
  const [liman, setLiman] = useState("");
  const [teslim, setTeslim] = useState("");
  const [tarih, setTarih] = useState(bugunTRIso());
  const [uyarilar, setUyarilar] = useState<string[] | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const unex = !alici;
  const limanKg = trSayiOku(liman);
  const teslimKg = trSayiOku(teslim);
  const fark = unex && limanKg && teslimKg ? teslimKg - limanKg : null;

  const veri = () => ({
    gemi_id: gemi.id, alici_id: alici || null, plaka: plakaBicimle(plaka), liman_kg: limanKg,
    teslim_kg: unex ? teslimKg : null, tarih, kaynak,
  });
  const dogrula = () => {
    if (!plakaGecerli(plakaBicimle(plaka))) return "Plakayı yazın. Örnek: 34 ABC 123";
    if (!limanKg || limanKg <= 0 || limanKg > 60000) return "Liman fişindeki kg'ı yazın (1 - 60.000).";
    if (unex && teslim.trim() && (!teslimKg || teslimKg <= 0 || teslimKg > 60000)) return "Teslim kg 1 - 60.000 arasında olmalı (boş bırakırsanız kantardan otomatik gelir).";
    return null;
  };
  const kontrol = async () => {
    setHata(null);
    const d = dogrula(); if (d) { setHata(d); return; }
    setMesgul(true);
    const { data, error } = await supabase.rpc("ic_gemi_arac_ekle", { p_veri: veri(), p_kaydet: false });
    setMesgul(false);
    if (error) { setHata(gemiHataMesaji(error)); return; }
    const u = ((data as { uyarilar?: string[] })?.uyarilar) || [];
    if (u.length) { setUyarilar(u); return; }
    await kaydet();
  };
  const kaydet = async () => {
    setMesgul(true);
    const { error } = await supabase.rpc("ic_gemi_arac_ekle", { p_veri: veri(), p_kaydet: true });
    setMesgul(false);
    if (error) { setUyarilar(null); setHata(gemiHataMesaji(error)); return; }
    showToast(`${plakaBicimle(plaka)} kaydedildi (${gemi.gemi_adi})${unex && !teslimKg ? " · kantar tartımı bekleniyor" : ""}.`, "success");
    kaydedildi();
  };

  return (
    <Pencere baslik="Gemi Aracı Ekle" aciklama={gemi.gemi_adi} ikon={<Truck size={16} style={{ color: ACCENT }} />} kapat={kapat} mesgul={mesgul} testId="gemi-arac-formu">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs sm:col-span-2" style={{ color: TEXT_MUTED }}>Gittiği yer
          <select value={alici} onChange={(e) => { setAlici(e.target.value); setUyarilar(null); }} className={`${girdi} mt-1`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="gemi-arac-yer">
            <option value="">UNEX GIDA (depomuza geliyor · liman + teslim)</option>
            {alicilar.map((l) => <option key={l.id} value={l.id}>{l.firma} (gemiden satış · yalnız liman)</option>)}
          </select>
        </label>
        <label className="text-xs" style={{ color: TEXT_MUTED }}>Plaka *
          <input value={plaka} onChange={(e) => { setPlaka(plakaYazarken(e.target.value)); setUyarilar(null); }} placeholder="34 ABC 123" className={`${girdi} mt-1 uppercase`} style={{ borderColor: CARD_BORDER }} autoFocus data-testid="gemi-arac-plaka" />
        </label>
        <label className="text-xs" style={{ color: TEXT_MUTED }}>Tarih
          <input type="date" value={tarih} max={bugunTRIso()} onChange={(e) => { setTarih(e.target.value); setUyarilar(null); }} className={`${girdi} mt-1`} style={{ borderColor: CARD_BORDER, colorScheme: "dark" }} />
        </label>
        <label className="text-xs" style={{ color: TEXT_MUTED }}>Liman kg (fiş) *
          <input value={liman} onChange={(e) => { setLiman(e.target.value); setUyarilar(null); }} inputMode="numeric" placeholder="29.260" className={`${girdi} mt-1`} style={{ borderColor: CARD_BORDER }} data-testid="gemi-arac-liman" />
        </label>
        {unex ? (
          <label className="text-xs" style={{ color: TEXT_MUTED }}>Teslim kg (boş = kantardan otomatik)
            <input value={teslim} onChange={(e) => { setTeslim(e.target.value); setUyarilar(null); }} inputMode="numeric" placeholder="29.220" className={`${girdi} mt-1`} style={{ borderColor: CARD_BORDER }} data-testid="gemi-arac-teslim" />
          </label>
        ) : <p className="text-xs self-end pb-2" style={{ color: TEXT_MUTED }}>Gemiden satışta teslim tartımı yoktur.</p>}
      </div>
      {fark !== null && (
        <p className="text-sm" style={{ color: TEXT_MUTED }}>Fark (teslim − liman): <span className={`font-bold tabular-nums ${Math.abs(fark) > 300 ? "text-amber-400" : "text-white"}`}>{kgYazi(fark)}</span></p>
      )}
      {uyarilar && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200 space-y-1" data-testid="gemi-arac-uyarilar">
          {uyarilar.map((u) => <p key={u} className="flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {u}</p>)}
          <p className="text-xs" style={{ color: TEXT_MUTED }}>Bilgiler doğruysa yine de kaydedebilirsiniz.</p>
        </div>
      )}
      <Altbar hata={hata} mesgul={mesgul} kapat={kapat} onay={uyarilar ? kaydet : kontrol} onayEtiket={uyarilar ? "Yine de Kaydet" : "Kaydet"} />
    </Pencere>
  );
}

// ---------------------------------------------------------------------------
// Liman listesi yapistir (gemiden satis araclari, ofis)
// ---------------------------------------------------------------------------
export function LimanListesiPenceresi({ gemi, alicilar, kapat, kaydedildi }: {
  gemi: GemiTahliye; alicilar: GemiAlici[]; kapat: () => void; kaydedildi: () => void;
}) {
  const { showToast } = useToast();
  const [alici, setAlici] = useState(alicilar[0]?.id || "");
  const [gun, setGun] = useState(bugunTRIso());
  const [metin, setMetin] = useState("");
  const [uyarilar, setUyarilar] = useState<string[] | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const { satirlar, hatalar } = useMemo(() => limanListesiAyristir(metin, gun), [metin, gun]);
  const toplam = satirlar.reduce((t, s) => t + s.liman_kg, 0);
  const firma = alicilar.find((l) => l.id === alici)?.firma || "";

  const gonder = async (kaydet: boolean, liste: ListeSatiri[]) =>
    supabase.rpc("ic_gemi_liman_listesi_ekle", {
      p_gemi: gemi.id, p_alici: alici, p_kaydet: kaydet,
      p_satirlar: liste.map((s) => ({ tarih: s.tarih, plaka: s.plaka, liman_kg: s.liman_kg })),
    });
  const kontrol = async () => {
    setHata(null);
    if (!alici) { setHata("Önce alıcı firmayı seçin (Gemiden Satış Ekle)."); return; }
    if (!satirlar.length) { setHata("Listeye en az bir araç yapıştırın."); return; }
    if (hatalar.length) { setHata(`${hatalar.length} satır okunamadı; düzeltin ya da silin.`); return; }
    setMesgul(true);
    const { data, error } = await gonder(false, satirlar);
    setMesgul(false);
    if (error) { setHata(gemiHataMesaji(error)); return; }
    const u = ((data as { uyarilar?: string[] })?.uyarilar) || [];
    if (u.length) { setUyarilar(u); return; }
    await kaydet();
  };
  const kaydet = async () => {
    setMesgul(true);
    const { error } = await gonder(true, satirlar);
    setMesgul(false);
    if (error) { setUyarilar(null); setHata(gemiHataMesaji(error)); return; }
    showToast(`${satirlar.length} araç (${kgYazi(toplam)}) ${firma} için kaydedildi.`, "success");
    kaydedildi();
  };

  return (
    <Pencere genis baslik="Liman Listesi Yapıştır" aciklama="Gemiden satış araçları: Excel'den veya mesajdan satırları yapıştırın. Her satırda plaka ve liman kg (tarih isteğe bağlı) olmalı. Hepsi birlikte kaydedilir."
      ikon={<ClipboardPaste size={16} style={{ color: ACCENT }} />} kapat={kapat} mesgul={mesgul} testId="gemi-liman-listesi">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-xs sm:col-span-2" style={{ color: TEXT_MUTED }}>Alıcı firma *
          <select value={alici} onChange={(e) => { setAlici(e.target.value); setUyarilar(null); }} className={`${girdi} mt-1`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            {!alicilar.length && <option value="">Önce Gemiden Satış ekleyin</option>}
            {alicilar.map((l) => <option key={l.id} value={l.id}>{l.firma}</option>)}
          </select>
        </label>
        <label className="text-xs" style={{ color: TEXT_MUTED }}>Tarih yazmayan satırlar için gün
          <input type="date" value={gun} max={bugunTRIso()} onChange={(e) => { setGun(e.target.value); setUyarilar(null); }} className={`${girdi} mt-1`} style={{ borderColor: CARD_BORDER, colorScheme: "dark" }} />
        </label>
      </div>
      <textarea value={metin} onChange={(e) => { setMetin(e.target.value); setUyarilar(null); }} rows={8} placeholder={"20.11.2026\t34 KRG 333\t26400\n34KRG888 30.960"} className={`${girdi} font-mono text-xs resize-y`} style={{ borderColor: CARD_BORDER }} data-testid="gemi-liste-metin" />
      {(satirlar.length > 0 || hatalar.length > 0) && (
        <div className="rounded-lg border overflow-hidden max-h-64 overflow-y-auto" style={{ borderColor: CARD_BORDER }}>
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0" style={{ backgroundColor: ROW_HEADER_BG }}>
              <tr>{["Satır", "Tarih", "Plaka", "Liman kg"].map((b) => <th key={b} className={`px-3 py-1.5 font-semibold uppercase tracking-wide text-[10px] ${b === "Liman kg" ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>)}</tr>
            </thead>
            <tbody>
              {hatalar.map((h) => (
                <tr key={`h${h.satir}`} className="border-t bg-red-500/[0.08]" style={{ borderColor: CARD_BORDER }}>
                  <td className="px-3 py-1.5 text-red-300">{h.satir}</td>
                  <td colSpan={3} className="px-3 py-1.5 text-red-300"><span className="font-mono">{h.metin.slice(0, 60)}</span> · {h.hata}</td>
                </tr>
              ))}
              {satirlar.map((s) => (
                <tr key={`s${s.satir}`} className="border-t" style={{ borderColor: CARD_BORDER }}>
                  <td className="px-3 py-1.5" style={{ color: TEXT_MUTED }}>{s.satir}</td>
                  <td className="px-3 py-1.5 text-white">{gunTR(s.tarih)}</td>
                  <td className="px-3 py-1.5 text-white font-semibold">{s.plaka}</td>
                  <td className="px-3 py-1.5 text-white text-right tabular-nums">{s.liman_kg.toLocaleString("tr-TR")}</td>
                </tr>
              ))}
              <tr className="border-t" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                <td colSpan={3} className="px-3 py-1.5 text-right" style={{ color: TEXT_MUTED }}>{satirlar.length} araç{hatalar.length ? ` · ${hatalar.length} hatalı satır` : ""}</td>
                <td className="px-3 py-1.5 text-right font-bold text-emerald-400 tabular-nums" data-testid="gemi-liste-toplam">{kgYazi(toplam)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {uyarilar && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200 space-y-1">
          {uyarilar.map((u) => <p key={u} className="flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {u}</p>)}
          <p className="text-xs" style={{ color: TEXT_MUTED }}>Bilgiler doğruysa yine de kaydedebilirsiniz.</p>
        </div>
      )}
      <Altbar hata={hata} mesgul={mesgul} kapat={kapat} onay={uyarilar ? kaydet : kontrol} onayEtiket={uyarilar ? "Yine de Kaydet" : `${satirlar.length || ""} Aracı Kaydet`.trim()} devreDisi={!satirlar.length} />
    </Pencere>
  );
}

// ---------------------------------------------------------------------------
// HIZLI GIRIS (25.11.2026, kullanici: "panel hep acik dursun; plaka + Enter -> tonaj"): satir hep acik.
// Plaka [Enter] -> Liman kg [Enter] -> kayit (uyari varsa ikinci Enter = yine de kaydet, Esc = vazgec) -> imlec plakaya doner.
// UNEX araci "yolda" kaydedilir; teslim kg BAYKON tartimindan otomatik gelir (ic_gemi_kantar_esle).
// ---------------------------------------------------------------------------
export function GemiHizliGiris({ gemi, alicilar, kaynak, kaydedildi, testId = "gemi-hizli" }: {
  gemi: Pick<GemiTahliye, "id" | "gemi_adi">; alicilar: Pick<GemiAlici, "id" | "firma">[]; kaynak: "kantar" | "ofis";
  kaydedildi: () => void; testId?: string;
}) {
  const [alici, setAlici] = useState("");
  const [plaka, setPlaka] = useState("");
  const [liman, setLiman] = useState("");
  const [uyarilar, setUyarilar] = useState<string[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [son, setSon] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const plakaRef = useRef<HTMLInputElement>(null);
  const limanRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (alici && !alicilar.some((l) => l.id === alici)) setAlici(""); }, [alicilar, alici]);

  const sifirla = () => { setUyarilar(null); setHata(null); };
  const veri = () => ({ gemi_id: gemi.id, alici_id: alici || null, plaka: plakaBicimle(plaka), liman_kg: trSayiOku(liman), kaynak });
  const kaydet = async (zorla: boolean) => {
    setHata(null);
    const p = plakaBicimle(plaka);
    const kg = trSayiOku(liman);
    if (!plakaGecerli(p)) { setHata("Plaka okunamadı."); plakaRef.current?.focus(); return; }
    if (!kg || kg < 1000 || kg > 60000) { setHata(kg && kg < 1000 ? "Kg 1.000'den küçük; ton mu yazıldı? Kg girin." : "Liman kg'ını yazın (1.000 - 60.000)."); limanRef.current?.focus(); return; }
    setMesgul(true);
    if (!zorla) {
      const k = await supabase.rpc("ic_gemi_arac_ekle", { p_veri: veri(), p_kaydet: false });
      if (k.error) { setMesgul(false); setHata(gemiHataMesaji(k.error)); return; }
      const u = ((k.data as { uyarilar?: string[] })?.uyarilar) || [];
      if (u.length) { setMesgul(false); setUyarilar(u); limanRef.current?.focus(); return; }
    }
    const { data, error } = await supabase.rpc("ic_gemi_arac_ekle", { p_veri: veri(), p_kaydet: true });
    setMesgul(false);
    if (error) { setUyarilar(null); setHata(gemiHataMesaji(error)); return; }
    const d = (data || {}) as { kantar_eslesti?: boolean; yolda?: boolean };
    const yer = alici ? (alicilar.find((l) => l.id === alici)?.firma || "") : "UNEX GIDA";
    setSon(`${p} · ${kg.toLocaleString("tr-TR")} kg · ${yer}${d.kantar_eslesti ? " · kantar tartımı bulundu" : d.yolda ? " · kantar tartımı bekleniyor" : ""}`);
    setPlaka(""); setLiman(""); setUyarilar(null);
    kaydedildi();
    window.setTimeout(() => plakaRef.current?.focus(), 0);
  };
  const tus = (alan: "plaka" | "liman") => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { sifirla(); return; }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (mesgul) return;
    if (alan === "plaka") { if (plakaGecerli(plakaBicimle(plaka))) { setHata(null); limanRef.current?.focus(); limanRef.current?.select(); } else setHata("Plaka okunamadı."); return; }
    kaydet(!!uyarilar);
  };

  return (
    <div className="rounded-lg border p-2.5" style={{ borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.05)" }} data-testid={testId}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[10px] font-semibold uppercase tracking-wide flex-1 min-w-[150px]" style={{ color: TEXT_MUTED }}>Gittiği yer
          <select value={alici} onChange={(e) => { setAlici(e.target.value); sifirla(); plakaRef.current?.focus(); }} className={`${girdi} mt-1 py-1.5 normal-case tracking-normal font-normal`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid={`${testId}-yer`}>
            <option value="">UNEX GIDA (depoya)</option>
            {alicilar.map((l) => <option key={l.id} value={l.id}>{l.firma} (gemiden satış)</option>)}
          </select>
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-wide w-36" style={{ color: TEXT_MUTED }}>Plaka
          <input ref={plakaRef} value={plaka} onChange={(e) => { setPlaka(plakaYazarken(e.target.value)); sifirla(); }} onKeyDown={tus("plaka")}
            placeholder="34 ABC 123" autoComplete="off" enterKeyHint="next" className={`${girdi} mt-1 py-1.5 uppercase font-semibold tracking-normal`} style={{ borderColor: CARD_BORDER }} data-testid={`${testId}-plaka`} />
        </label>
        <label className="text-[10px] font-semibold uppercase tracking-wide w-32" style={{ color: TEXT_MUTED }}>Liman kg (fiş)
          <input ref={limanRef} value={liman} onChange={(e) => { setLiman(e.target.value.replace(/[^0-9.,]/g, "")); sifirla(); }} onKeyDown={tus("liman")}
            inputMode="numeric" placeholder="29.260" autoComplete="off" enterKeyHint="done" className={`${girdi} mt-1 py-1.5 tabular-nums tracking-normal`} style={{ borderColor: CARD_BORDER }} data-testid={`${testId}-liman`} />
        </label>
        <button onClick={() => kaydet(!!uyarilar)} disabled={mesgul} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold text-white hover:brightness-110 disabled:opacity-50" style={{ backgroundColor: uyarilar ? "#D97706" : ACCENT }} data-testid={`${testId}-kaydet`}>
          {mesgul ? <Loader2 size={14} className="animate-spin" /> : <CornerDownLeft size={14} />} {uyarilar ? "Yine de kaydet" : "Kaydet"}
        </button>
      </div>
      {uyarilar && (
        <div className="mt-2 text-xs text-amber-200 space-y-0.5" role="alert">
          {uyarilar.map((u) => <p key={u} className="flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {u}</p>)}
          <p style={{ color: TEXT_MUTED }}>Doğruysa tekrar Enter, vazgeçmek için Esc.</p>
        </div>
      )}
      {hata && <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5" role="alert"><AlertTriangle size={12} /> {hata}</p>}
      {!hata && !uyarilar && son && <p className="mt-2 text-xs text-emerald-300 flex items-center gap-1.5" data-testid={`${testId}-son`}><CheckCircle2 size={12} /> Kaydedildi: {son}</p>}
      {!hata && !uyarilar && !son && <p className="mt-2 text-[11px]" style={{ color: TEXT_MUTED }}>Şoförün liman fişinden: plaka → Enter → kg → Enter. UNEX araçlarında teslim kg kantar tartımından otomatik gelir.</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LIMAN EXCEL'I YUKLE (25.11.2026, kullanici: "Liman tonajlarini excel ile yukleyecegiz"). Liman portali
// "Gemi Tartim Bilgileri" ExportToExcel (.xls) -> kuru kontrol (eklenecek / zaten var / hatalar) -> yukle.
// Ayni Excel tekrar yuklenebilir (fis koduna gore atlanir). UNEX araclari kantar tartimina agirlik + saatle baglanir.
// 25.11.2026 gece (fabrika esasli): fisler havuza girer, rapora yalniz BIZIM kantarda tartilan araclarla eslesenler
// yansir. Genel ekran: baska gemi / limanda tartimi bitmemis / baska alici satirlari hata degil, bilgi.
// ---------------------------------------------------------------------------
type ExcelOzet = {
  eklenen: number; atlanan: number; toplam_kg: number; hatalar: string[]; uyarilar: string[]; eslesen?: number;
  satis?: number; baska_gemi?: number; diger_alici?: number; bekleyen?: number; liman_bagli_arac?: number;
};

export function GemiLimanExcelYukle({ gemi, kaydedildi, testId = "gemi-liman-excel", kucuk = false }: {
  gemi: Pick<GemiTahliye, "id" | "gemi_adi">; kaydedildi: () => void; testId?: string; kucuk?: boolean;
}) {
  const { showToast } = useToast();
  const dosyaRef = useRef<HTMLInputElement>(null);
  const [mesgul, setMesgul] = useState(false);
  const [hazir, setHazir] = useState<{ ad: string; satirlar: LimanSatiri[]; okunamayan: string[]; limandaBekleyen: number; ozet: ExcelOzet } | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  const gonder = (satirlar: LimanSatiri[], kaydet: boolean) => supabase.rpc("ic_gemi_liman_excel_yukle", {
    p_gemi: gemi.id, p_kaydet: kaydet,
    p_satirlar: satirlar.map((s) => ({ fis_kodu: s.fis_kodu, plaka: s.plaka, bos_kg: s.bos_kg, dolu_kg: s.dolu_kg, net_kg: s.net_kg, cikis: s.cikis, gemi_sefer: s.gemi_sefer, alici: s.alici, nakliyeci: s.nakliyeci ?? null })),
  });
  const sec = async (f: File | null | undefined) => {
    if (!f) return;
    setHata(null); setHazir(null); setMesgul(true);
    try {
      if (f.size > 10 * 1024 * 1024) throw new Error("Dosya 10 MB'tan büyük.");
      const { xlsOku } = await import("@/lib/xls-oku");
      const sayfalar = xlsOku(new Uint8Array(await f.arrayBuffer()));
      const r = limanExceliAyristir(sayfalar[0]?.satirlar || []);
      if (!r.satirlar.length && r.hatalar.length) throw new Error(r.hatalar[0].hata);
      if (!r.satirlar.length) throw new Error(r.bekleyen ? "Excel'deki araçların limanda tartımı henüz bitmemiş (ağırlık / çıkış yok)." : "Excel'de araç satırı bulunamadı.");
      // Genel ekranda baska gemilerin satirlari olabilir (sunucu atlar); HICBIRI bu gemi degilse yanlis kart
      if (r.gemiler.length && !r.gemiler.some((g) => gemiSeferUyar(gemi.gemi_adi, g))) {
        throw new Error(`Bu Excel başka gemiye ait (${r.gemiler.join(", ")}); ${gemi.gemi_adi} kartından değil, o geminin kartından yükleyin.`);
      }
      const { data, error } = await gonder(r.satirlar, false);
      if (error) throw new Error(gemiHataMesaji(error));
      setHazir({ ad: f.name, satirlar: r.satirlar, okunamayan: r.hatalar.map((h) => `${h.satir}. satır: ${h.hata}`), limandaBekleyen: r.bekleyen, ozet: data as ExcelOzet });
    } catch (e) {
      setHata((e as Error).message || String(e));
    } finally {
      setMesgul(false);
      if (dosyaRef.current) dosyaRef.current.value = "";
    }
  };
  const yukle = async () => {
    if (!hazir) return;
    setMesgul(true);
    const { data, error } = await gonder(hazir.satirlar, true);
    setMesgul(false);
    if (error) { setHata(gemiHataMesaji(error)); return; }
    const o = data as ExcelOzet;
    showToast(`${gemi.gemi_adi}: ${o.eklenen} liman fişi yüklendi${o.atlanan ? `, ${o.atlanan} zaten vardı` : ""} · liman fişi eşleşen araç ${o.liman_bagli_arac ?? 0}.`, "success");
    setHazir(null);
    kaydedildi();
  };

  return (
    <>
      <input ref={dosyaRef} type="file" accept=".xls,application/vnd.ms-excel" className="hidden" onChange={(e) => sec(e.target.files?.[0])} data-testid={`${testId}-dosya`} />
      <button type="button" onClick={() => dosyaRef.current?.click()} disabled={mesgul}
        className={`inline-flex items-center gap-1.5 ${kucuk ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"} rounded-lg font-bold text-white hover:brightness-110 disabled:opacity-50`}
        style={{ backgroundColor: ACCENT }} title="Liman portalı › Gemi Tartım Bilgileri › Excel (.xls)" data-testid={testId}>
        {mesgul && !hazir ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Liman Excel&apos;i Yükle
      </button>
      {hata && !hazir && (
        <Pencere baslik="Liman Excel'i okunamadı" ikon={<AlertTriangle size={16} className="text-red-400" />} kapat={() => setHata(null)} mesgul={false}>
          <p className="text-sm text-red-300">{hata}</p>
          <div className="flex justify-end"><button onClick={() => setHata(null)} className="px-4 py-2 rounded-lg border text-sm font-semibold" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Kapat</button></div>
        </Pencere>
      )}
      {hazir && (
        <Pencere genis baslik="Liman Excel'i" aciklama={`${gemi.gemi_adi} · ${hazir.ad}`} ikon={<FileSpreadsheet size={16} style={{ color: ACCENT }} />}
          kapat={() => { setHazir(null); setHata(null); }} mesgul={mesgul} testId={`${testId}-onizleme`}>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border p-3" style={{ borderColor: CARD_BORDER }}><p className="text-2xl font-bold text-emerald-400 tabular-nums">{hazir.ozet.eklenen}</p><p className="text-xs" style={{ color: TEXT_MUTED }}>yeni liman fişi · {kgYazi(hazir.ozet.toplam_kg)}</p></div>
            <div className="rounded-lg border p-3" style={{ borderColor: CARD_BORDER }}><p className="text-2xl font-bold text-white tabular-nums">{hazir.ozet.atlanan}</p><p className="text-xs" style={{ color: TEXT_MUTED }}>zaten yüklü (atlanır)</p></div>
            <div className="rounded-lg border p-3" style={{ borderColor: CARD_BORDER }}><p className={`text-2xl font-bold tabular-nums ${hazir.ozet.hatalar.length ? "text-red-400" : "text-white"}`}>{hazir.ozet.hatalar.length + hazir.okunamayan.length}</p><p className="text-xs" style={{ color: TEXT_MUTED }}>hatalı satır</p></div>
          </div>
          {(hazir.ozet.hatalar.length > 0 || hazir.okunamayan.length > 0) && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200 space-y-1 max-h-40 overflow-y-auto">
              {[...hazir.okunamayan, ...hazir.ozet.hatalar].map((h) => <p key={h}>{h}</p>)}
            </div>
          )}
          {hazir.ozet.uyarilar.length > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 space-y-1">{hazir.ozet.uyarilar.map((u) => <p key={u}>{u}</p>)}</div>
          )}
          {(() => {
            const bilgi = [
              hazir.ozet.baska_gemi ? `${hazir.ozet.baska_gemi} başka gemi satırı atlanır` : "",
              hazir.ozet.bekleyen || hazir.limandaBekleyen ? `${(hazir.ozet.bekleyen || 0) + hazir.limandaBekleyen} araç limanda tartılıyor (sonraki yüklemede gelir)` : "",
              hazir.ozet.satis ? `${hazir.ozet.satis} gemiden satış aracı (alıcı firmaya yazılır)` : "",
              hazir.ozet.diger_alici ? `${hazir.ozet.diger_alici} araç başka alıcıya (raporlanmaz)` : "",
            ].filter(Boolean);
            return bilgi.length ? <p className="text-xs text-sky-200">{bilgi.join(" · ")}</p> : null;
          })()}
          <p className="text-xs" style={{ color: TEXT_MUTED }}>Rapora yalnız bizim kantarda gemi adıyla tartılan araçlar girer; liman fişi bu araçlarla limandan çıkış saati + dolu/net ağırlıkla eşleşir (plaka farklı olabilir). Diğer fişler havuzda bekler. Aynı Excel tekrar yüklenebilir.</p>
          <Altbar hata={null} mesgul={mesgul} kapat={() => setHazir(null)} onay={yukle}
            onayEtiket={hazir.ozet.eklenen ? `${hazir.ozet.eklenen} Fişi Yükle` : "Yeni fiş yok"} devreDisi={!hazir.ozet.eklenen || hazir.ozet.hatalar.length > 0} />
        </Pencere>
      )}
    </>
  );
}
