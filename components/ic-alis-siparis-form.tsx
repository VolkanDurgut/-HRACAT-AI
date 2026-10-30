"use client";

import React, { useMemo, useState } from "react";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { Loader2, X, Save, Plus, AlertTriangle } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { trSayiOku } from "@/lib/ic-piyasa/irsaliye-oku";
import { IcAlisSiparisi, IcTedarikci, ParaBirimi, AlisTeslim, alisHataMesaji, bugunTRIso, ALIS_TESLIM_ETIKET } from "@/lib/ic-piyasa/alis";

/**
 * Alis siparisi ac / duzenle (30.10.2026). Lojistik Excel'inin ALIS tablosu
 * sutunlari: fis tarihi, cari (tedarikci), siparis no (depo / tedarikci no),
 * malzeme (+ kod), miktar, birim fiyat, vade, termin, teslim / alim.
 * Tedarikci listede yoksa ayni pencerede kart acilir (once kart, sonra siparis;
 * siparis kaydi olmazsa kart SECILI kalir - tekrar denemede ikinci kart acilmaz).
 */

const URUN_ONERI = ["BUĞDAY", "ARPA", "MISIR", "TRİTİKALE", "KEPEK", "RAZMOL"];
const VADE_SECENEK: { deger: string; etiket: string }[] = [
  { deger: "", etiket: "Belirtilmedi" },
  { deger: "0", etiket: "Peşin" },
  ...[7, 10, 15, 20, 30, 45, 60, 90].map((g) => ({ deger: String(g), etiket: `${g} Gün` })),
];

const girdi = "w-full px-3 py-2 rounded-lg border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";

export function IcAlisSiparisForm({ tedarikciler, duzenlenen, kapat, kaydedildi }: {
  tedarikciler: IcTedarikci[];
  duzenlenen: IcAlisSiparisi | null;
  kapat: () => void;
  kaydedildi: (yeniTedarikci?: IcTedarikci) => void;
}) {
  const { companyId } = useAuth();
  const { showToast } = useToast();
  const d = duzenlenen;

  const [tedarikciId, setTedarikciId] = useState(d?.tedarikci_id || "");
  const [yeniTedarikci, setYeniTedarikci] = useState(false);
  const [tUnvan, setTUnvan] = useState("");
  const [tKisa, setTKisa] = useState("");
  const [tarih, setTarih] = useState(d?.siparis_tarihi || bugunTRIso());
  const [urun, setUrun] = useState(d?.urun || "BUĞDAY");
  const [kod, setKod] = useState(d?.urun_kodu || "");
  const [depo, setDepo] = useState(d?.depo || "");
  const [tNo, setTNo] = useState(d?.tedarikci_siparis_no || "");
  const [ton, setTon] = useState(d ? (Number(d.miktar_kg) / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3 }) : "");
  const [fiyat, setFiyat] = useState(d?.birim_fiyat !== null && d?.birim_fiyat !== undefined ? Number(d.birim_fiyat).toLocaleString("tr-TR", { maximumFractionDigits: 4 }) : "");
  const [para, setPara] = useState<ParaBirimi>(d?.para_birimi || "TRY");
  const [kdvDahil, setKdvDahil] = useState(d?.kdv_dahil || false);
  const [vade, setVade] = useState(d?.vade_gun === null || d?.vade_gun === undefined ? "" : String(d.vade_gun));
  const [termin, setTermin] = useState(d?.termin || "");
  const [teslim, setTeslim] = useState<AlisTeslim>(d?.teslim || "adresten");
  const [notlar, setNotlar] = useState(d?.notlar || "");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const aktifler = useMemo(() => tedarikciler.filter((t) => t.aktif || t.id === d?.tedarikci_id), [tedarikciler, d]);
  const tonSayi = ton.trim() ? trSayiOku(ton.trim()) : null;
  const fiyatSayi = fiyat.trim() ? trSayiOku(fiyat.trim()) : null;
  const kg = tonSayi !== null ? Math.round(tonSayi * 1000 * 100) / 100 : null;

  const eksikler: string[] = [];
  if (yeniTedarikci ? tUnvan.trim().length < 2 : !tedarikciId) eksikler.push("Tedarikçi");
  if (!urun.trim()) eksikler.push("Ürün");
  if (!kg || kg <= 0) eksikler.push("Miktar");
  if (fiyat.trim() && (fiyatSayi === null || fiyatSayi < 0)) eksikler.push("Birim fiyat (geçersiz)");
  if (!tarih) eksikler.push("Sipariş tarihi");
  if (termin && tarih && termin < tarih) eksikler.push("Termin sipariş tarihinden önce olamaz");

  const kaydet = async () => {
    if (!companyId || eksikler.length) return;
    setKaydediliyor(true);
    setHata(null);
    let tid = tedarikciId;
    let yeni: IcTedarikci | undefined;
    if (yeniTedarikci) {
      const { data, error } = await supabase.from("ic_tedarikciler")
        .insert({ company_id: companyId, unvan: tUnvan.trim().replace(/\s+/g, " "), kisa_ad: tKisa.trim() || null })
        .select("*");
      const h = yazmaHatasi(error, data);
      if (h) { setHata(alisHataMesaji({ message: h })); setKaydediliyor(false); return; }
      yeni = (data as IcTedarikci[])[0];
      tid = yeni.id;
      // Siparis kaydi basarisiz olursa ikinci kart acilmasin: kart secili kalir
      setTedarikciId(tid);
      setYeniTedarikci(false);
    }
    const govde = {
      tedarikci_id: tid,
      siparis_tarihi: tarih,
      urun: urun.trim().toLocaleUpperCase("tr"),
      urun_kodu: kod.trim() || null,
      depo: depo.trim() || null,
      tedarikci_siparis_no: tNo.trim() || null,
      miktar_kg: kg,
      birim_fiyat: fiyatSayi,
      para_birimi: para,
      kdv_dahil: kdvDahil,
      vade_gun: vade === "" ? null : Number(vade),
      termin: termin || null,
      teslim,
      notlar: notlar.trim() || null,
    };
    const sonuc = d
      ? await supabase.from("ic_alis_siparisleri").update(govde).eq("id", d.id).eq("company_id", companyId).select("id, alis_no")
      : await supabase.from("ic_alis_siparisleri").insert({ ...govde, company_id: companyId }).select("id, alis_no");
    setKaydediliyor(false);
    const h = yazmaHatasi(sonuc.error, sonuc.data);
    if (h) { setHata(alisHataMesaji({ message: h })); if (yeni) kaydedildi(yeni); return; }
    const no = (sonuc.data as { alis_no: string }[])[0]?.alis_no;
    showToast(d ? `${no} güncellendi.` : `Alış siparişi açıldı: ${no}`, "success");
    kaydedildi(yeni);
    kapat();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="alis-form-baslik">
      <div className="w-full max-w-2xl rounded-2xl border shadow-2xl my-8" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-start justify-between px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div>
            <h2 id="alis-form-baslik" className="text-base font-bold text-white">{d ? `${d.alis_no} · Alış siparişini düzenle` : "Yeni alış siparişi"}</h2>
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>Lojistik Excel&apos;indeki ALIŞ tablosunun alanları. Numara kayıtta verilir.</p>
          </div>
          <button onClick={kapat} disabled={kaydediliyor} className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Tedarikçi (cari) *</span>
            {!yeniTedarikci ? (
              <div className="flex gap-2">
                <select value={tedarikciId} onChange={(e) => setTedarikciId(e.target.value)} aria-label="Tedarikçi" className={girdi} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }}>
                  <option value="">Seçin…</option>
                  {aktifler.map((t) => <option key={t.id} value={t.id}>{t.unvan}{t.aktif ? "" : " (pasif)"}</option>)}
                </select>
                {!d && (
                  <button type="button" onClick={() => setYeniTedarikci(true)} className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-xs font-semibold hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: ACCENT }}>
                    <Plus size={13} /> Yeni tedarikçi
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px_auto] gap-2 rounded-lg border p-2" style={{ borderColor: CARD_BORDER }}>
                <input value={tUnvan} onChange={(e) => setTUnvan(e.target.value)} placeholder="Ünvan (ör. PINARHİSAR TMO)" aria-label="Tedarikçi ünvanı" className={girdi} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
                <input value={tKisa} onChange={(e) => setTKisa(e.target.value)} placeholder="Kısa ad (isteğe bağlı)" aria-label="Kısa ad" className={girdi} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
                <button type="button" onClick={() => setYeniTedarikci(false)} className="px-3 py-2 rounded-lg text-xs hover:bg-white/5" style={{ color: TEXT_MUTED }}>Listeden seç</button>
              </div>
            )}
          </div>

          <label className="block">
            <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Sipariş (fiş) tarihi *</span>
            <input type="date" value={tarih} max={bugunTRIso()} onChange={(e) => setTarih(e.target.value)} className={girdi} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER, colorScheme: "dark" }} />
          </label>
          <label className="block">
            <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Termin (son teslim günü)</span>
            <input type="date" value={termin} onChange={(e) => setTermin(e.target.value)} className={girdi} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER, colorScheme: "dark" }} />
          </label>

          <label className="block">
            <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Ürün *</span>
            <input value={urun} onChange={(e) => setUrun(e.target.value)} list="alis-urun-oneri" className={girdi} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
            <datalist id="alis-urun-oneri">{URUN_ONERI.map((u) => <option key={u} value={u} />)}</datalist>
          </label>
          <label className="block">
            <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Ürün kodu (ör. 1222, 1621)</span>
            <input value={kod} onChange={(e) => setKod(e.target.value.slice(0, 20))} className={girdi} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
          </label>

          <label className="block">
            <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Depo (TMO depo no)</span>
            <input value={depo} onChange={(e) => setDepo(e.target.value.slice(0, 80))} placeholder="7211002 (AÇIK YIĞIN)" className={girdi} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
          </label>
          <label className="block">
            <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Tedarikçinin sipariş / satış no</span>
            <input value={tNo} onChange={(e) => setTNo(e.target.value.slice(0, 60))} className={girdi} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
          </label>

          <label className="block">
            <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Sipariş miktarı (ton) *</span>
            <input value={ton} onChange={(e) => setTon(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="400" className={`${girdi} text-right font-semibold`} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
            {kg ? <span className="block text-[11px] mt-1" style={{ color: TEXT_MUTED }}>{kg.toLocaleString("tr-TR")} kg</span> : null}
          </label>
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <label className="block">
              <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Birim fiyat (/kg)</span>
              <input value={fiyat} onChange={(e) => setFiyat(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="Boş bırakılabilir" className={`${girdi} text-right`} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
            </label>
            <label className="block">
              <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Para</span>
              <select value={para} onChange={(e) => setPara(e.target.value as ParaBirimi)} className={girdi} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }}>
                <option value="TRY">TL</option><option value="USD">USD</option><option value="EUR">EUR</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Vade</span>
            <select value={vade} onChange={(e) => setVade(e.target.value)} className={girdi} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }}>
              {VADE_SECENEK.map((v) => <option key={v.deger} value={v.deger}>{v.etiket}</option>)}
            </select>
          </label>
          <div>
            <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>KDV</span>
            <div className="flex gap-1 rounded-lg border p-1" style={{ borderColor: CARD_BORDER }}>
              {[false, true].map((v) => (
                <button key={String(v)} type="button" onClick={() => setKdvDahil(v)} aria-pressed={kdvDahil === v}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-semibold ${kdvDahil === v ? "text-white" : "hover:bg-white/5"}`}
                  style={kdvDahil === v ? { backgroundColor: ACCENT } : { color: TEXT_MUTED }}>{v ? "KDV Dahil" : "KDV Hariç"}</button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2">
            <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Teslim / alım</span>
            <div className="flex gap-1 rounded-lg border p-1 w-fit" style={{ borderColor: CARD_BORDER }}>
              {(["adresten", "fabrika"] as AlisTeslim[]).map((v) => (
                <button key={v} type="button" onClick={() => setTeslim(v)} aria-pressed={teslim === v}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold ${teslim === v ? "text-white" : "hover:bg-white/5"}`}
                  style={teslim === v ? { backgroundColor: ACCENT } : { color: TEXT_MUTED }}>
                  {ALIS_TESLIM_ETIKET[v]} <span className="font-normal opacity-80">{v === "adresten" ? "· araçlarımız çeker" : "· tedarikçi getirir"}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="block sm:col-span-2">
            <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Notlar</span>
            <textarea value={notlar} onChange={(e) => setNotlar(e.target.value)} rows={2} className={girdi} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
          </label>

          {hata && <p className="sm:col-span-2 flex items-start gap-1.5 text-sm text-red-400"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {hata}</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
          <p className="text-xs" style={{ color: eksikler.length ? "#FBBF24" : TEXT_MUTED }}>{eksikler.length ? `Eksik: ${eksikler.join(" · ")}` : "Hazır."}</p>
          <div className="flex gap-2">
            <button onClick={kapat} disabled={kaydediliyor} className="px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
            <button onClick={kaydet} disabled={kaydediliyor || eksikler.length > 0} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white hover:brightness-110 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
              {kaydediliyor ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {d ? "Kaydet" : (yeniTedarikci ? "Tedarikçiyi Ekle ve Siparişi Aç" : "Siparişi Aç")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
