"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import AppShell from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { IcPiyasaGecmisFormlar } from "@/components/ic-piyasa-gecmis-formlar";
import { Wheat, Plus, Trash2, Save, Loader2, ArrowUp, ArrowDown, FileCheck2, Eye, RotateCcw, AlertCircle, ListPlus } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import {
  AMBALAJ_SECENEKLERI,
  BASLANGIC_URUNLERI,
  GECERLILIK_GUN,
  IcFiyatFormu,
  IcFiyatKalemi,
  ODEME_SECENEKLERI,
  TESLIM_SECENEKLERI,
  VADE_SECENEKLERI,
  bugunTR,
  fiyatYazi,
  formKalemleri,
  gunYazi,
  satirEksigi,
  vadeYazi,
} from "@/lib/ic-piyasa/fiyat-formu";

/**
 * IC PIYASA - Yan Mamul Fiyat Bilgilendirme Formu yonetim paneli (11.10.2026).
 *
 * 1) Fiyat tablosu: Urun / Ambalaj / Birim Fiyat / Vade / Odeme / Teslim
 *    satirlari eklenir, duzenlenir, silinir, siralanir -> "Kaydet".
 * 2) "Formu Onayla ve Olustur": kayitli tablo dondurulur, sunucu FBF-YYYY-NNNN
 *    numarasi ve onay + 3 gun gecerlilik verir, PDF iner.
 * 3) Olusturulan formlar: PDF / telefon gorseli / paylas.
 *
 * Veri: ic_fiyat_kalemleri + ic_fiyat_formlari (migration 20261011200000).
 * Ihracat tablolarina dokunmaz.
 */

type Satir = {
  anahtar: string;
  id: string | null;
  urun: string;
  ambalaj: string;
  fiyat: string; // kullanicinin yazdigi metin ("13,15")
  vade_gun: number | null;
  odeme: string;
  teslim: string;
};

/** "13,15" / "13.15" / "1.250,50" -> sayi; bos -> null; gecersiz -> NaN */
function fiyatOku(metin: string): number | null {
  const s = metin.trim().replace(/\s+/g, "");
  if (!s) return null;
  if (!/^\d+([.,]\d+)?$/.test(s) && !/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return NaN;
  let t = s;
  if (t.includes(",")) t = t.includes(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

let anahtarSayaci = 0;
const yeniAnahtar = () => `yeni-${++anahtarSayaci}`;

function dbdenSatir(k: IcFiyatKalemi): Satir {
  return {
    anahtar: k.id,
    id: k.id,
    urun: k.urun,
    ambalaj: k.ambalaj || "",
    fiyat: k.birim_fiyat !== null && k.birim_fiyat !== undefined ? fiyatYazi(Number(k.birim_fiyat)) : "",
    vade_gun: k.vade_gun,
    odeme: k.odeme || "",
    teslim: k.teslim || "",
  };
}

/** Kirli (kaydedilmemis) degisiklik tespiti icin normal bicim. */
function normal(satirlar: Satir[]) {
  return JSON.stringify(
    satirlar.map((s) => [s.id, s.urun.trim(), s.ambalaj.trim(), fiyatOku(s.fiyat), s.vade_gun, s.odeme.trim(), s.teslim.trim()])
  );
}

const inputSinif =
  "w-full px-2 py-1.5 rounded-md border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const inputStil = { backgroundColor: "#0F131A", borderColor: CARD_BORDER } as const;

export default function IcPiyasaPage() {
  const { user, companyId, yetkiler, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [dbSatirlar, setDbSatirlar] = useState<IcFiyatKalemi[]>([]);
  const [satirlar, setSatirlar] = useState<Satir[]>([]);
  const [formlar, setFormlar] = useState<IcFiyatFormu[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [alici, setAlici] = useState("");
  const [onayAcik, setOnayAcik] = useState(false);
  const [olusturuluyor, setOlusturuluyor] = useState(false);
  const [geriAlAcik, setGeriAlAcik] = useState(false);

  const yetkili = !!yetkiler.sayfa_yetkileri.ic_piyasa;

  const verileriGetir = useCallback(async () => {
    if (!companyId) return;
    setOkumaHatasi(null);
    const [kRes, fRes] = await Promise.all([
      supabase.from("ic_fiyat_kalemleri").select("*").eq("company_id", companyId).order("sira", { ascending: true }).order("olusturma", { ascending: true }),
      supabase.from("ic_fiyat_formlari").select("id, company_id, form_no, alici, onay_zamani, gecerlilik_bitis, kalemler, olusturan_email").eq("company_id", companyId).order("onay_zamani", { ascending: false }).limit(50),
    ]);
    if (kRes.error || fRes.error) {
      // Okuma hatasi yutulmaz; ekrandaki onceki veri korunur.
      setOkumaHatasi((kRes.error || fRes.error)!.message);
      setYukleniyor(false);
      return;
    }
    const k = (kRes.data || []) as IcFiyatKalemi[];
    setDbSatirlar(k);
    setSatirlar(k.map(dbdenSatir));
    setFormlar((fRes.data || []) as IcFiyatFormu[]);
    setYukleniyor(false);
  }, [companyId]);

  useEffect(() => {
    if (authLoading || !yetkili) return;
    verileriGetir();
  }, [authLoading, yetkili, verileriGetir]);

  const kirli = useMemo(() => normal(satirlar) !== normal(dbSatirlar.map(dbdenSatir)), [satirlar, dbSatirlar]);

  // Kaydedilmemis degisiklik varken sayfadan ayrilma uyarisi
  useEffect(() => {
    if (!kirli) return;
    const uyar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", uyar);
    return () => window.removeEventListener("beforeunload", uyar);
  }, [kirli]);

  // Son onaylanan formdaki fiyat (urun + ambalaj) -> panelde karsilastirma
  const sonFormFiyati = useMemo(() => {
    const m = new Map<string, number>();
    const son = formlar[0];
    son?.kalemler.forEach((k) => m.set(`${k.urun.trim().toLocaleLowerCase("tr")}|${k.ambalaj.trim().toLocaleLowerCase("tr")}`, k.birim_fiyat));
    return m;
  }, [formlar]);

  const urunOnerileri = useMemo(() => Array.from(new Set([...BASLANGIC_URUNLERI.map((u) => u.urun), ...satirlar.map((s) => s.urun.trim()).filter(Boolean)])), [satirlar]);
  const ambalajOnerileri = useMemo(() => Array.from(new Set([...AMBALAJ_SECENEKLERI, ...satirlar.map((s) => s.ambalaj.trim()).filter(Boolean)])), [satirlar]);
  const aliciOnerileri = useMemo(() => Array.from(new Set(formlar.map((f) => (f.alici || "").trim()).filter(Boolean))), [formlar]);

  const guncelle = (anahtar: string, alan: Partial<Satir>) =>
    setSatirlar((onceki) => onceki.map((s) => (s.anahtar === anahtar ? { ...s, ...alan } : s)));

  const satirEkle = () => {
    // Yeni satir, bir ustteki satirin vade/odeme/teslim degerlerini alir (hizli giris).
    const son = satirlar[satirlar.length - 1];
    setSatirlar((o) => [...o, { anahtar: yeniAnahtar(), id: null, urun: "", ambalaj: "Dökme", fiyat: "", vade_gun: son?.vade_gun ?? 30, odeme: son?.odeme || "Çek", teslim: son?.teslim || "Fabrika Teslim" }]);
  };

  const baslangicListesiniYukle = () => {
    setSatirlar(BASLANGIC_URUNLERI.map((u) => ({ anahtar: yeniAnahtar(), id: null, urun: u.urun, ambalaj: u.ambalaj, fiyat: "", vade_gun: 30, odeme: "Çek", teslim: "Fabrika Teslim" })));
  };

  const tasi = (i: number, yon: -1 | 1) =>
    setSatirlar((o) => {
      const j = i + yon;
      if (j < 0 || j >= o.length) return o;
      const y = [...o];
      [y[i], y[j]] = [y[j], y[i]];
      return y;
    });

  const sil = (anahtar: string) => setSatirlar((o) => o.filter((s) => s.anahtar !== anahtar));

  const kaydet = async () => {
    if (!companyId) return;
    // Dogrulama
    for (let i = 0; i < satirlar.length; i++) {
      const s = satirlar[i];
      if (!s.urun.trim()) { showToast(`${i + 1}. satırda ürün adı boş.`, "error"); return; }
      const f = fiyatOku(s.fiyat);
      if (f !== null && (Number.isNaN(f) || f <= 0)) { showToast(`${i + 1}. satırda birim fiyat geçersiz: "${s.fiyat}". Örnek: 13,15`, "error"); return; }
    }
    setKaydediliyor(true);
    try {
      const kalanIdler = new Set(satirlar.map((s) => s.id).filter(Boolean) as string[]);
      const silinecek = dbSatirlar.filter((d) => !kalanIdler.has(d.id)).map((d) => d.id);
      if (silinecek.length) {
        const { data, error } = await supabase.from("ic_fiyat_kalemleri").delete().in("id", silinecek).eq("company_id", companyId).select("id");
        const hata = yazmaHatasi(error, data) || ((data?.length ?? 0) !== silinecek.length ? "Bazı satırlar silinemedi." : null);
        if (hata) throw new Error(hata);
      }
      const dbMap = new Map(dbSatirlar.map((d) => [d.id, d]));
      for (let i = 0; i < satirlar.length; i++) {
        const s = satirlar[i];
        const kayit = {
          sira: i + 1,
          urun: s.urun.trim(),
          ambalaj: s.ambalaj.trim() || null,
          birim_fiyat: fiyatOku(s.fiyat),
          vade_gun: s.vade_gun,
          odeme: s.odeme.trim() || null,
          teslim: s.teslim.trim() || null,
        };
        if (s.id) {
          const d = dbMap.get(s.id);
          const degismedi = d && d.sira === kayit.sira && d.urun === kayit.urun && (d.ambalaj || null) === kayit.ambalaj &&
            (d.birim_fiyat === null ? null : Number(d.birim_fiyat)) === kayit.birim_fiyat && d.vade_gun === kayit.vade_gun &&
            (d.odeme || null) === kayit.odeme && (d.teslim || null) === kayit.teslim;
          if (degismedi) continue;
          const { data, error } = await supabase.from("ic_fiyat_kalemleri").update(kayit).eq("id", s.id).eq("company_id", companyId).select("id");
          const hata = yazmaHatasi(error, data);
          if (hata) throw new Error(`${i + 1}. satır: ${hata}`);
        } else {
          const { data, error } = await supabase.from("ic_fiyat_kalemleri").insert({ ...kayit, company_id: companyId }).select("id");
          const hata = yazmaHatasi(error, data);
          if (hata) throw new Error(`${i + 1}. satır: ${hata}`);
        }
      }
      showToast("Fiyat tablosu kaydedildi.", "success");
      await verileriGetir();
    } catch (e: any) {
      showToast(`Kaydedilemedi: ${e?.message || e}`, "error");
      // Yarim kalan kayitta ekrandaki tablo korunur; veritabanindaki gercek
      // durum ayrica okunur ki kullanici neyin kaydedildigini gorebilsin.
      const { data } = await supabase.from("ic_fiyat_kalemleri").select("*").eq("company_id", companyId).order("sira");
      if (data) setDbSatirlar(data as IcFiyatKalemi[]);
    } finally {
      setKaydediliyor(false);
    }
  };

  // Form olusturmaya hazir mi? (kayitli tablo uzerinden)
  const formEksikleri = useMemo(() => {
    if (dbSatirlar.length === 0) return ["Tabloda ürün yok."];
    return dbSatirlar
      .map((k, i) => {
        const e = satirEksigi(k);
        return e ? `${i + 1}. satır (${k.urun || "adsız"}): ${e} eksik` : null;
      })
      .filter(Boolean) as string[];
  }, [dbSatirlar]);

  const formHazir = !kirli && formEksikleri.length === 0;

  const onizlemeFormu = (): IcFiyatFormu => {
    const bugun = bugunTR();
    const d = new Date(`${bugun}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + GECERLILIK_GUN);
    return {
      id: "onizleme",
      company_id: companyId || "",
      form_no: "ÖNİZLEME",
      alici: alici.trim() || null,
      onay_zamani: new Date().toISOString(),
      gecerlilik_bitis: d.toISOString().slice(0, 10),
      kalemler: formKalemleri(dbSatirlar),
      olusturan_email: user?.email || null,
    };
  };

  const onizle = async () => {
    const { fiyatFormuPdfOlustur } = await import("@/lib/ic-piyasa/fiyat-formu-pdf-builder");
    const url = fiyatFormuPdfOlustur(onizlemeFormu()).output("bloburl");
    window.open(String(url), "_blank", "noopener");
  };

  const formuOlustur = async () => {
    if (!companyId || !formHazir) return;
    setOlusturuluyor(true);
    const { data, error } = await supabase
      .from("ic_fiyat_formlari")
      .insert({ company_id: companyId, alici: alici.trim() || null, kalemler: formKalemleri(dbSatirlar), olusturan_email: user?.email || null })
      .select("id, company_id, form_no, alici, onay_zamani, gecerlilik_bitis, kalemler, olusturan_email");
    const hata = yazmaHatasi(error, data);
    setOlusturuluyor(false);
    if (hata) { showToast(`Form oluşturulamadı: ${hata}`, "error"); return; }
    const form = data![0] as IcFiyatFormu;
    setOnayAcik(false);
    setAlici("");
    setFormlar((o) => [form, ...o]);
    showToast(`${form.form_no} oluşturuldu. ${gunYazi(form.gecerlilik_bitis)} tarihine kadar geçerli.`, "success");
    try {
      const { indirFiyatFormuPdf } = await import("@/lib/ic-piyasa/fiyat-formu-pdf-builder");
      indirFiyatFormuPdf(form);
    } catch {
      showToast("Form kaydedildi ancak PDF indirilemedi; aşağıdaki listeden tekrar indirebilirsiniz.", "error");
    }
  };

  if (authLoading || (yetkili && yukleniyor && !okumaHatasi)) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin" style={{ color: ACCENT }} /></div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <SayfaBasligi
        ikon={<Wheat size={20} />}
        baslik="İç Piyasa · Fiyat Bilgilendirme Formu"
        aciklama={`Yan mamul fiyat tablosunu düzenleyin, kaydedin ve formu oluşturun. Form onaylandığı günden itibaren ${GECERLILIK_GUN} gün geçerlidir.`}
      />

      {okumaHatasi && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "#7F1D1D", backgroundColor: "rgba(127,29,29,0.15)", color: "#FCA5A5" }}>
          <span className="flex items-center gap-2"><AlertCircle size={16} /> Veriler okunamadı: {okumaHatasi}</span>
          <button onClick={verileriGetir} className="underline">Yeniden dene</button>
        </div>
      )}

      {/* 1) FIYAT TABLOSU */}
      <div className="rounded-xl border shadow-sm mb-5" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
          <div>
            <h2 className="text-sm font-semibold text-white">Fiyat Tablosu</h2>
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
              {kirli ? <span className="text-amber-400">Kaydedilmemiş değişiklikler var.</span> : "Formda bu tablodaki bilgiler yer alır."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {kirli && (
              <button onClick={() => setGeriAlAcik(true)} disabled={kaydediliyor} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                <RotateCcw size={14} /> Vazgeç
              </button>
            )}
            <button onClick={satirEkle} disabled={kaydediliyor} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm text-white hover:bg-white/5" style={{ borderColor: CARD_BORDER }}>
              <Plus size={14} /> Ürün Ekle
            </button>
            <button onClick={kaydet} disabled={!kirli || kaydediliyor} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white ${!kirli || kaydediliyor ? "opacity-50 cursor-not-allowed" : "hover:brightness-110"}`} style={{ backgroundColor: ACCENT }}>
              {kaydediliyor ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
            </button>
          </div>
        </div>

        {satirlar.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm" style={{ color: TEXT_MUTED }}>Tabloda henüz ürün yok.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button onClick={baslangicListesiniYukle} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white hover:brightness-110" style={{ backgroundColor: ACCENT }}>
                <ListPlus size={14} /> Yan mamul listesini yükle
              </button>
              <button onClick={satirEkle} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm text-white hover:bg-white/5" style={{ borderColor: CARD_BORDER }}>
                <Plus size={14} /> Boş satır ekle
              </button>
            </div>
            <p className="text-xs mt-3" style={{ color: TEXT_MUTED }}>Liste: Kepek, Razmol (dökme ve 30 kg çuval), Bonkalit, Kırık Buğday, Kavuz. Fiyatlar boş gelir.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[920px]">
              <thead>
                <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                  {["#", "Ürün", "Ambalaj", "Birim Fiyat (TL/kg)", "Vade", "Ödeme", "Teslim", ""].map((b, i) => (
                    <th key={i} className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {satirlar.map((s, i) => {
                  const f = fiyatOku(s.fiyat);
                  const fiyatHatali = f !== null && (Number.isNaN(f) || f <= 0);
                  const onceki = sonFormFiyati.get(`${s.urun.trim().toLocaleLowerCase("tr")}|${s.ambalaj.trim().toLocaleLowerCase("tr")}`);
                  const fark = onceki && f && !Number.isNaN(f) ? (f - onceki) / onceki : null;
                  const vadeSecenekleri = Array.from(new Set([...VADE_SECENEKLERI, ...(s.vade_gun !== null ? [s.vade_gun] : [])])).sort((a, b) => a - b);
                  return (
                    <tr key={s.anahtar} className="border-t align-top" style={{ borderColor: CARD_BORDER }}>
                      <td className="px-2 py-2 text-xs pt-3.5" style={{ color: TEXT_MUTED }}>{i + 1}</td>
                      <td className="px-2 py-2 min-w-[160px]">
                        <input list="ic-urun-onerileri" value={s.urun} onChange={(e) => guncelle(s.anahtar, { urun: e.target.value })} placeholder="Ürün adı" className={inputSinif} style={inputStil} />
                      </td>
                      <td className="px-2 py-2 min-w-[130px]">
                        <input list="ic-ambalaj-onerileri" value={s.ambalaj} onChange={(e) => guncelle(s.anahtar, { ambalaj: e.target.value })} placeholder="Dökme" className={inputSinif} style={inputStil} />
                      </td>
                      <td className="px-2 py-2 min-w-[130px]">
                        <input inputMode="decimal" value={s.fiyat} onChange={(e) => guncelle(s.anahtar, { fiyat: e.target.value })} placeholder="13,15" className={`${inputSinif} text-right font-semibold`} style={{ ...inputStil, borderColor: fiyatHatali ? "#F87171" : CARD_BORDER }} />
                        {onceki !== undefined && (
                          <p className={`text-[10px] mt-1 text-right ${fark !== null && Math.abs(fark) > 0.1 ? "text-amber-400" : ""}`} style={fark !== null && Math.abs(fark) > 0.1 ? undefined : { color: TEXT_MUTED }}>
                            Son form: {fiyatYazi(onceki)}
                            {fark !== null && fark !== 0 && ` (${fark > 0 ? "+" : ""}${(fark * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%)`}
                            {fark !== null && Math.abs(fark) > 0.1 && " · kontrol edin"}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-2 min-w-[105px]">
                        <select value={s.vade_gun ?? ""} onChange={(e) => guncelle(s.anahtar, { vade_gun: e.target.value === "" ? null : Number(e.target.value) })} className={inputSinif} style={inputStil}>
                          <option value="">Seçin</option>
                          {vadeSecenekleri.map((g) => <option key={g} value={g}>{vadeYazi(g)}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2 min-w-[140px]">
                        <select value={s.odeme} onChange={(e) => guncelle(s.anahtar, { odeme: e.target.value })} className={inputSinif} style={inputStil}>
                          <option value="">Seçin</option>
                          {Array.from(new Set([...ODEME_SECENEKLERI, ...(s.odeme ? [s.odeme] : [])])).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2 min-w-[165px]">
                        <select value={s.teslim} onChange={(e) => guncelle(s.anahtar, { teslim: e.target.value })} className={inputSinif} style={inputStil}>
                          <option value="">Seçin</option>
                          {Array.from(new Set([...TESLIM_SECENEKLERI, ...(s.teslim ? [s.teslim] : [])])).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <div className="flex flex-nowrap items-center gap-0.5 pt-0.5">
                          <button onClick={() => tasi(i, -1)} disabled={i === 0} title="Yukarı taşı" className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30" style={{ color: TEXT_MUTED }}><ArrowUp size={14} /></button>
                          <button onClick={() => tasi(i, 1)} disabled={i === satirlar.length - 1} title="Aşağı taşı" className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30" style={{ color: TEXT_MUTED }}><ArrowDown size={14} /></button>
                          <button onClick={() => sil(s.anahtar)} title="Satırı sil" className="p-1.5 rounded hover:bg-red-500/10 text-red-400"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <datalist id="ic-urun-onerileri">{urunOnerileri.map((u) => <option key={u} value={u} />)}</datalist>
            <datalist id="ic-ambalaj-onerileri">{ambalajOnerileri.map((a) => <option key={a} value={a} />)}</datalist>
          </div>
        )}
        {satirlar.length > 0 && (
          <p className="px-4 py-2.5 text-xs border-t" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
            Birim fiyatlar TL/kg ve KDV hariçtir. Satır silme ve sıralama da &quot;Kaydet&quot; ile kalıcı olur.
          </p>
        )}
      </div>

      {/* 2) FORM OLUSTUR */}
      <div className="rounded-xl border shadow-sm mb-5 p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <h2 className="text-sm font-semibold text-white">Form Oluştur</h2>
        <p className="text-xs mt-0.5 mb-3" style={{ color: TEXT_MUTED }}>
          Kayıtlı fiyat tablosundan numaralı form oluşturulur (FBF-YYYY-NNNN). Onaylanan form değiştirilemez; fiyat değişirse yeni form oluşturulur.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Alıcı (boş bırakılırsa &quot;Sayın Müşterimiz&quot;)</label>
            <input list="ic-alici-onerileri" value={alici} onChange={(e) => setAlici(e.target.value)} placeholder="Örn. Erdoğanlar Un Gıda San. Tic. Ltd. Şti." className={inputSinif} style={inputStil} />
            <datalist id="ic-alici-onerileri">{aliciOnerileri.map((a) => <option key={a} value={a} />)}</datalist>
          </div>
          <button onClick={onizle} disabled={!formHazir} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm text-white ${formHazir ? "hover:bg-white/5" : "opacity-50 cursor-not-allowed"}`} style={{ borderColor: CARD_BORDER }}>
            <Eye size={14} /> Önizle
          </button>
          <button onClick={() => setOnayAcik(true)} disabled={!formHazir} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white ${formHazir ? "hover:brightness-110" : "opacity-50 cursor-not-allowed"}`} style={{ backgroundColor: ACCENT }}>
            <FileCheck2 size={14} /> Formu Onayla ve Oluştur
          </button>
        </div>
        {!formHazir && (
          <div className="mt-3 text-xs text-amber-400 space-y-0.5">
            {kirli && <p>Önce fiyat tablosundaki değişiklikleri kaydedin.</p>}
            {!kirli && formEksikleri.slice(0, 6).map((e) => <p key={e}>{e}</p>)}
          </div>
        )}
      </div>

      {/* 3) OLUSTURULAN FORMLAR */}
      <IcPiyasaGecmisFormlar formlar={formlar} />

      <ConfirmDialog
        open={onayAcik}
        onOpenChange={setOnayAcik}
        title="Form onaylansın mı?"
        description={`${dbSatirlar.length} ürünlü form ${alici.trim() ? `"${alici.trim()}" için` : "genel olarak"} oluşturulacak ve numara verilecek. Form bugünden itibaren ${GECERLILIK_GUN} gün geçerli olur ve sonradan değiştirilemez.`}
        confirmLabel="Onayla ve Oluştur"
        cancelLabel="Vazgeç"
        onConfirm={formuOlustur}
        loading={olusturuluyor}
        loadingLabel="Oluşturuluyor..."
      />
      <ConfirmDialog
        open={geriAlAcik}
        onOpenChange={setGeriAlAcik}
        title="Değişiklikler geri alınsın mı?"
        description="Kaydedilmemiş tüm değişiklikler silinir ve tablo son kaydedilen haline döner."
        confirmLabel="Geri Al"
        cancelLabel="Vazgeç"
        destructive
        onConfirm={() => { setSatirlar(dbSatirlar.map(dbdenSatir)); setGeriAlAcik(false); }}
      />
    </AppShell>
  );
}
