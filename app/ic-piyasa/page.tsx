"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import AppShell from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { IcPiyasaGecmisFormlar } from "@/components/ic-piyasa-gecmis-formlar";
import { IcPiyasaSekmeler } from "@/components/ic-piyasa-sekmeler";
import { Wheat, Plus, Trash2, Save, Loader2, ArrowUp, ArrowDown, FileCheck2, Eye, RotateCcw, AlertCircle, ListPlus, Phone, Pencil, ScrollText, EyeOff, Columns3 } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import {
  AMBALAJ_SECENEKLERI,
  BASLANGIC_URUNLERI,
  FORM_SUTUNLARI,
  FormIletisim,
  GECERLILIK_GUN,
  IcFiyatFormu,
  KDV_YER_TUTUCU,
  OZEL_BASLIK_MAX,
  OZEL_DEGER_MAX,
  OZEL_SUTUN_EN_COK,
  STANDART_SUTUNLAR,
  VARSAYILAN_SUTUNLAR,
  ozelDegerTemizle,
  sutunAyariHatasi,
  sutunAyariOku,
  sutunGorunur,
  varsayilanSutunMu,
  type StandartSutun,
  type SutunAyari,
  SART_EN_COK,
  SART_MAX_KARAKTER,
  VARSAYILAN_SARTLAR,
  kdvCumlesi,
  sartSablonuOku,
  sartlarHatasi,
  sartlariCoz,
  IcFiyatKalemi,
  TESLIM_SECENEKLERI,
  VADELI_VADE_SECENEKLERI,
  VARSAYILAN_ILETISIM,
  bugunTR,
  fiyatYazi,
  formKalemleri,
  gunYazi,
  iletisimHatasi,
  iletisimSatiri,
  kalemFiyatlari,
  satirEksigi,
  vadeYazi,
} from "@/lib/ic-piyasa/fiyat-formu";

/**
 * IC PIYASA - Yan Mamul Fiyat Bilgilendirme Formu yonetim paneli (11.10.2026).
 *
 * 1) Fiyat tablosu: Urun / Ambalaj / Pesin Fiyat / Vadeli Fiyat / Vade /
 *    KDV / Teslim satirlari eklenir, duzenlenir, silinir, siralanir -> "Kaydet".
 *    (14.10.2026: pesin ve vadeli fiyat ayri; Odeme sutunu kaldirildi.)
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
  pesin: string; // kullanicinin yazdigi metin ("13,15")
  vadeli: string;
  vade_gun: number | null; // vadeli fiyatin vadesi
  teslim: string;
  kdv_dahil: boolean;
  /** Ozel sutun degerleri {sutunId: metin} */
  ozel: Record<string, string>;
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

const fiyatMetni = (n: number | null | undefined) => (n !== null && n !== undefined ? fiyatYazi(Number(n)) : "");
const dbSayi = (n: number | null | undefined) => (n === null || n === undefined ? null : Number(n));

/** Gecersiz fiyat metni mi? (bos gecerli; 0 / negatif / bicim hatasi gecersiz) */
function fiyatHatali(metin: string): boolean {
  const f = fiyatOku(metin);
  return f !== null && (Number.isNaN(f) || f <= 0);
}

function dbdenSatir(k: IcFiyatKalemi): Satir {
  return {
    anahtar: k.id,
    id: k.id,
    urun: k.urun,
    ambalaj: k.ambalaj || "",
    pesin: fiyatMetni(k.pesin_fiyat),
    vadeli: fiyatMetni(k.vadeli_fiyat),
    vade_gun: k.vade_gun,
    teslim: k.teslim || "",
    kdv_dahil: !!k.kdv_dahil,
    ozel: { ...(k.ozel_degerler || {}) },
  };
}

/** Ozel degerlerin karsilastirma / kayit icin duzgun hali (bos degerler atilir, anahtarlar sirali). */
function ozelNormal(o: Record<string, string> | null | undefined, idler?: string[]): Record<string, string> {
  const anahtarlar = (idler ?? Object.keys(o || {})).slice().sort();
  const sonuc: Record<string, string> = {};
  anahtarlar.forEach((id) => {
    const v = ozelDegerTemizle(o?.[id]);
    if (v) sonuc[id] = v;
  });
  return sonuc;
}

/** Kirli (kaydedilmemis) degisiklik tespiti icin normal bicim. */
function normal(satirlar: Satir[]) {
  return JSON.stringify(
    satirlar.map((s) => [s.id, s.urun.trim(), s.ambalaj.trim(), fiyatOku(s.pesin), fiyatOku(s.vadeli), s.vade_gun, s.teslim.trim(), s.kdv_dahil, ozelNormal(s.ozel)])
  );
}

const inputSinif =
  "w-full px-2 py-1.5 rounded-md border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const inputStil = { backgroundColor: "#0F131A", borderColor: CARD_BORDER } as const;

/** Fiyat girisi + son onaylanan formdaki fiyatla karsilastirma notu. */
function FiyatGirdisi({ deger, placeholder, etiket, onceki, degistir }: {
  deger: string;
  placeholder: string;
  etiket: string;
  /** undefined = son formda bu urun yok; null = urun var ama bu fiyat yoktu */
  onceki: number | null | undefined;
  degistir: (v: string) => void;
}) {
  const f = fiyatOku(deger);
  const hatali = fiyatHatali(deger);
  const fark = onceki && f && !Number.isNaN(f) ? (f - onceki) / onceki : null;
  const dikkat = fark !== null && Math.abs(fark) > 0.1;
  return (
    <>
      <input inputMode="decimal" value={deger} onChange={(e) => degistir(e.target.value)} placeholder={placeholder} aria-label={etiket}
        className={`${inputSinif} text-right font-semibold`} style={{ ...inputStil, borderColor: hatali ? "#F87171" : CARD_BORDER }} />
      {onceki !== undefined && (
        <p className={`text-[10px] mt-1 text-right ${dikkat ? "text-amber-400" : ""}`} style={dikkat ? undefined : { color: TEXT_MUTED }}>
          Son form: {onceki === null ? "—" : fiyatYazi(onceki)}
          {fark !== null && fark !== 0 && ` (${fark > 0 ? "+" : ""}${(fark * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%)`}
          {dikkat && " · kontrol edin"}
        </p>
      )}
    </>
  );
}

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
  // Formdaki iletisim bilgisi (ic_piyasa_ayarlari.form_iletisim_*, 14.10.2026)
  const [iletisim, setIletisim] = useState<FormIletisim>(VARSAYILAN_ILETISIM);
  const [iletisimOkunamadi, setIletisimOkunamadi] = useState(false);
  const [iletisimDuzenle, setIletisimDuzenle] = useState(false);
  const [iletisimTaslak, setIletisimTaslak] = useState({ ad: "", telefon: "", whatsapp: true, eposta: "" });
  const [iletisimKaydediliyor, setIletisimKaydediliyor] = useState(false);
  // Bilgilendirme ve sevkiyat sartlari (ic_piyasa_ayarlari.form_sartlari, 14.10.2026; null = varsayilan)
  const [sartSablonu, setSartSablonu] = useState<string[] | null>(null);
  const [sartDuzenle, setSartDuzenle] = useState(false);
  const [sartTaslak, setSartTaslak] = useState<string[]>([]);
  const [sartKaydediliyor, setSartKaydediliyor] = useState(false);
  // Sutun duzeni (ic_piyasa_ayarlari.form_sutunlari, 15.10.2026): kayitli + taslak
  const [sutunAyar, setSutunAyar] = useState<SutunAyari>(VARSAYILAN_SUTUNLAR);
  const [sutunTaslak, setSutunTaslak] = useState<SutunAyari>(VARSAYILAN_SUTUNLAR);

  const yetkili = !!yetkiler.sayfa_yetkileri.ic_piyasa;

  const verileriGetir = useCallback(async () => {
    if (!companyId) return;
    setOkumaHatasi(null);
    const [kRes, fRes, aRes] = await Promise.all([
      supabase.from("ic_fiyat_kalemleri").select("*").eq("company_id", companyId).order("sira", { ascending: true }).order("olusturma", { ascending: true }),
      supabase.from("ic_fiyat_formlari").select(FORM_SUTUNLARI).eq("company_id", companyId).order("onay_zamani", { ascending: false }).limit(50),
      supabase.from("ic_piyasa_ayarlari").select("form_iletisim_ad, form_iletisim_telefon, form_iletisim_whatsapp, form_iletisim_eposta, form_sartlari, form_sutunlari").eq("company_id", companyId).maybeSingle(),
    ]);
    // Iletisim ayari okunamazsa sayfa calismaya devam eder; form OLUSTURMA
    // kapatilir ki yanlis kisiyle form gitmesin (asagida formHazir).
    if (aRes.error) {
      setIletisimOkunamadi(true);
    } else {
      setIletisimOkunamadi(false);
      const a = aRes.data as { form_iletisim_ad: string | null; form_iletisim_telefon: string | null; form_iletisim_whatsapp: boolean | null; form_iletisim_eposta: string | null; form_sartlari: unknown; form_sutunlari: unknown } | null;
      setSartSablonu(sartSablonuOku(a?.form_sartlari));
      const sa = sutunAyariOku(a?.form_sutunlari);
      setSutunAyar(sa);
      setSutunTaslak(sa);
      setIletisim(a?.form_iletisim_ad && a.form_iletisim_telefon
        ? { ad: a.form_iletisim_ad, telefon: a.form_iletisim_telefon, whatsapp: a.form_iletisim_whatsapp !== false, eposta: a.form_iletisim_eposta || null }
        : VARSAYILAN_ILETISIM);
    }
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

  const sutunKirli = JSON.stringify(sutunTaslak) !== JSON.stringify(sutunAyar);
  const kirli = useMemo(
    () => normal(satirlar) !== normal(dbSatirlar.map(dbdenSatir)) || sutunKirli,
    [satirlar, dbSatirlar, sutunKirli]
  );
  const gorunur = (a: StandartSutun) => sutunGorunur(sutunTaslak, a);
  const sutunDegistir = (a: StandartSutun) =>
    setSutunTaslak((o) => ({ ...o, gizli: o.gizli.includes(a) ? o.gizli.filter((g) => g !== a) : [...o.gizli, a] }));
  const ozelSutunEkle = () =>
    setSutunTaslak((o) => (o.ozel.length >= OZEL_SUTUN_EN_COK ? o : { ...o, ozel: [...o.ozel, { id: `o${Date.now().toString(36)}`, baslik: "" }] }));
  const ozelSutunAdi = (id: string, baslik: string) =>
    setSutunTaslak((o) => ({ ...o, ozel: o.ozel.map((x) => (x.id === id ? { ...x, baslik } : x)) }));
  const ozelSutunSil = (id: string) => setSutunTaslak((o) => ({ ...o, ozel: o.ozel.filter((x) => x.id !== id) }));

  // Kaydedilmemis degisiklik varken sayfadan ayrilma uyarisi
  useEffect(() => {
    if (!kirli) return;
    const uyar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", uyar);
    return () => window.removeEventListener("beforeunload", uyar);
  }, [kirli]);

  // Son onaylanan formdaki fiyatlar (urun + ambalaj) -> panelde karsilastirma
  const sonFormFiyati = useMemo(() => {
    const m = new Map<string, { pesin: number | null; vadeli: number | null }>();
    const son = formlar[0];
    son?.kalemler.forEach((k) => {
      const f = kalemFiyatlari(k);
      m.set(`${k.urun.trim().toLocaleLowerCase("tr")}|${k.ambalaj.trim().toLocaleLowerCase("tr")}`, { pesin: f.pesin, vadeli: f.vadeli });
    });
    return m;
  }, [formlar]);

  const urunOnerileri = useMemo(() => Array.from(new Set([...BASLANGIC_URUNLERI.map((u) => u.urun), ...satirlar.map((s) => s.urun.trim()).filter(Boolean)])), [satirlar]);
  const ambalajOnerileri = useMemo(() => Array.from(new Set([...AMBALAJ_SECENEKLERI, ...satirlar.map((s) => s.ambalaj.trim()).filter(Boolean)])), [satirlar]);
  const aliciOnerileri = useMemo(() => Array.from(new Set(formlar.map((f) => (f.alici || "").trim()).filter(Boolean))), [formlar]);

  const guncelle = (anahtar: string, alan: Partial<Satir>) =>
    setSatirlar((onceki) => onceki.map((s) => (s.anahtar === anahtar ? { ...s, ...alan } : s)));

  const satirEkle = () => {
    // Yeni satir, bir ustteki satirin vade/teslim/KDV degerlerini alir (hizli giris).
    const son = satirlar[satirlar.length - 1];
    setSatirlar((o) => [...o, { anahtar: yeniAnahtar(), id: null, urun: "", ambalaj: "Dökme", pesin: "", vadeli: "", vade_gun: son?.vade_gun || 30, teslim: son?.teslim || "Fabrika Teslim", kdv_dahil: son?.kdv_dahil ?? false, ozel: {} }]);
  };

  const baslangicListesiniYukle = () => {
    setSatirlar(BASLANGIC_URUNLERI.map((u) => ({ anahtar: yeniAnahtar(), id: null, urun: u.urun, ambalaj: u.ambalaj, pesin: "", vadeli: "", vade_gun: 30, teslim: "Fabrika Teslim", kdv_dahil: false, ozel: {} })));
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
    const sutunHata = sutunAyariHatasi({ ...sutunTaslak, ozel: sutunTaslak.ozel.map((o) => ({ ...o, baslik: o.baslik.trim() })) });
    if (sutunHata) { showToast(sutunHata, "error"); return; }
    for (let i = 0; i < satirlar.length; i++) {
      const s = satirlar[i];
      if (!s.urun.trim()) { showToast(`${i + 1}. satırda ürün adı boş.`, "error"); return; }
      if (fiyatHatali(s.pesin)) { showToast(`${i + 1}. satırda peşin fiyat geçersiz: "${s.pesin}". Örnek: 13,15`, "error"); return; }
      if (fiyatHatali(s.vadeli)) { showToast(`${i + 1}. satırda vadeli fiyat geçersiz: "${s.vadeli}". Örnek: 13,65`, "error"); return; }
    }
    setKaydediliyor(true);
    const ozelIdler = sutunTaslak.ozel.map((o) => o.id);
    try {
      // 1) Sutun duzeni (degistiyse). Varsayilanla ayniysa NULL yazilir.
      if (sutunKirli) {
        const temiz: SutunAyari = { gizli: [...sutunTaslak.gizli].sort(), ozel: sutunTaslak.ozel.map((o) => ({ id: o.id, baslik: o.baslik.replace(/\s+/g, " ").trim() })) };
        const deger = varsayilanSutunMu(temiz) ? null : temiz;
        const { data, error } = await supabase.from("ic_piyasa_ayarlari").upsert({ company_id: companyId, form_sutunlari: deger }, { onConflict: "company_id" }).select("company_id");
        const yh = yazmaHatasi(error, data);
        if (yh) throw new Error(`Sütun düzeni kaydedilemedi: ${yh}`);
        const yeni = sutunAyariOku(deger);
        setSutunAyar(yeni);
        setSutunTaslak(yeni);
      }
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
          pesin_fiyat: fiyatOku(s.pesin),
          vadeli_fiyat: fiyatOku(s.vadeli),
          vade_gun: s.vade_gun,
          teslim: s.teslim.trim() || null,
          kdv_dahil: s.kdv_dahil,
          // Sadece mevcut ozel sutunlarin dolu degerleri (silinen sutunun degeri temizlenir)
          ozel_degerler: ozelNormal(s.ozel, ozelIdler),
        };
        if (s.id) {
          const d = dbMap.get(s.id);
          const degismedi = d && d.sira === kayit.sira && d.urun === kayit.urun && (d.ambalaj || null) === kayit.ambalaj &&
            dbSayi(d.pesin_fiyat) === kayit.pesin_fiyat && dbSayi(d.vadeli_fiyat) === kayit.vadeli_fiyat && d.vade_gun === kayit.vade_gun &&
            (d.teslim || null) === kayit.teslim && !!d.kdv_dahil === kayit.kdv_dahil &&
            JSON.stringify(ozelNormal(d.ozel_degerler)) === JSON.stringify(kayit.ozel_degerler);
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
        const e = satirEksigi(k, sutunAyar);
        return e ? `${i + 1}. satır (${k.urun || "adsız"}): ${e} eksik` : null;
      })
      .filter(Boolean) as string[];
  }, [dbSatirlar, sutunAyar]);

  const formHazir = !kirli && formEksikleri.length === 0 && !iletisimOkunamadi && !iletisimDuzenle && !sartDuzenle;

  // Formda cikacak sartlar (kayitli tablonun KDV secimiyle {KDV} cozulmus)
  const guncelSartlar = useMemo(() => sartlariCoz(sartSablonu, formKalemleri(dbSatirlar, sutunAyar)), [sartSablonu, dbSatirlar, sutunAyar]);
  const guncelKdvCumlesi = useMemo(() => kdvCumlesi(formKalemleri(dbSatirlar, sutunAyar)), [dbSatirlar, sutunAyar]);
  // Forma dondurulecek sutun duzeni (varsayilansa NULL -> eski formlarla ayni)
  const formaSutunlar = varsayilanSutunMu(sutunAyar) ? null : sutunAyar;

  const sartDuzenlemeyiAc = () => {
    setSartTaslak([...(sartSablonu || VARSAYILAN_SARTLAR)]);
    setSartDuzenle(true);
  };
  const sartGuncelle = (i: number, v: string) => setSartTaslak((o) => o.map((m, j) => (j === i ? v : m)));
  const sartTasi = (i: number, yon: -1 | 1) =>
    setSartTaslak((o) => {
      const j = i + yon;
      if (j < 0 || j >= o.length) return o;
      const y = [...o];
      [y[i], y[j]] = [y[j], y[i]];
      return y;
    });

  const sartKaydet = async () => {
    if (!companyId) return;
    const maddeler = sartTaslak.map((m) => m.replace(/\s+/g, " ").trim());
    const hata = sartlarHatasi(maddeler);
    if (hata) { showToast(hata, "error"); return; }
    // Varsayilanla ayniysa null yazilir (ileride varsayilan guncellenirse otomatik gelsin)
    const varsayilanla = JSON.stringify(maddeler) === JSON.stringify(VARSAYILAN_SARTLAR);
    const deger = varsayilanla ? null : maddeler;
    setSartKaydediliyor(true);
    // Sadece form_sartlari gonderilir; ayni satirdaki diger ayarlar degismez.
    const { data, error } = await supabase.from("ic_piyasa_ayarlari").upsert({ company_id: companyId, form_sartlari: deger }, { onConflict: "company_id" }).select("company_id");
    setSartKaydediliyor(false);
    const yh = yazmaHatasi(error, data);
    if (yh) { showToast(`Şartlar kaydedilemedi: ${yh}`, "error"); return; }
    setSartSablonu(deger);
    setSartDuzenle(false);
    showToast("Şartlar kaydedildi. Önizleme ve yeni formlarda bu maddeler yer alır.", "success");
  };

  const iletisimDuzenlemeyiAc = () => {
    setIletisimTaslak({ ad: iletisim.ad, telefon: iletisim.telefon, whatsapp: iletisim.whatsapp, eposta: iletisim.eposta || "" });
    setIletisimDuzenle(true);
  };

  const iletisimKaydet = async () => {
    if (!companyId) return;
    const hata = iletisimHatasi(iletisimTaslak);
    if (hata) { showToast(hata, "error"); return; }
    setIletisimKaydediliyor(true);
    const kayit = {
      company_id: companyId,
      form_iletisim_ad: iletisimTaslak.ad.trim(),
      form_iletisim_telefon: iletisimTaslak.telefon.trim().replace(/\s+/g, " "),
      form_iletisim_whatsapp: iletisimTaslak.whatsapp,
      form_iletisim_eposta: iletisimTaslak.eposta.trim() || null,
    };
    // Sadece form_iletisim_* sutunlari gonderilir; ayni satirdaki bildirim
    // ayarlari (lojistik / yetkili) degismez.
    const { data, error } = await supabase.from("ic_piyasa_ayarlari").upsert(kayit, { onConflict: "company_id" }).select("company_id");
    setIletisimKaydediliyor(false);
    const yh = yazmaHatasi(error, data);
    if (yh) { showToast(`İletişim bilgisi kaydedilemedi: ${yh}`, "error"); return; }
    setIletisim({ ad: kayit.form_iletisim_ad, telefon: kayit.form_iletisim_telefon, whatsapp: kayit.form_iletisim_whatsapp, eposta: kayit.form_iletisim_eposta });
    setIletisimDuzenle(false);
    showToast("Formdaki iletişim bilgisi kaydedildi. Yeni formlarda bu bilgi yer alır.", "success");
  };
  // Bugun onaylanacak formda cikacak ozel gunler (PDF / gorsel ile ayni kural)

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
      kalemler: formKalemleri(dbSatirlar, sutunAyar),
      olusturan_email: user?.email || null,
      iletisim,
      sartlar: guncelSartlar,
      sutunlar: formaSutunlar,
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
      .insert({ company_id: companyId, alici: alici.trim() || null, kalemler: formKalemleri(dbSatirlar, sutunAyar), olusturan_email: user?.email || null, iletisim, sartlar: guncelSartlar, sutunlar: formaSutunlar })
      .select(FORM_SUTUNLARI);
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
      <IcPiyasaSekmeler />

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
            <button onClick={ozelSutunEkle} disabled={kaydediliyor || sutunTaslak.ozel.length >= OZEL_SUTUN_EN_COK}
              title={sutunTaslak.ozel.length >= OZEL_SUTUN_EN_COK ? `En fazla ${OZEL_SUTUN_EN_COK} özel sütun eklenebilir` : "Forma yeni bir sütun ekleyin (örn. Min. Sipariş)"}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm text-white hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed" style={{ borderColor: CARD_BORDER }}>
              <Columns3 size={14} /> Sütun Ekle
            </button>
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
            <table className="w-full text-sm" style={{ minWidth: `${1100 + sutunTaslak.ozel.length * 170}px` }}>
              <thead>
                <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                  <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-left" style={{ color: TEXT_MUTED }}>#</th>
                  <th className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-left whitespace-nowrap" style={{ color: TEXT_MUTED }}>
                    Ürün <span className="normal-case font-normal tracking-normal text-[9px] opacity-70">(her zaman)</span>
                  </th>
                  {(["ambalaj", "pesin", "vadeli", "vade", "kdv", "teslim"] as const).map((a) => {
                    const tanim = STANDART_SUTUNLAR.find((x) => x.anahtar === a)!;
                    const acik = gorunur(a);
                    // Pesin ve vadeli fiyattan en az biri formda kalmali
                    const kilitli = acik && (a === "pesin" || a === "vadeli") && !gorunur(a === "pesin" ? "vadeli" : "pesin");
                    const etiket = a === "pesin" ? "Peşin Fiyat (TL/kg)" : a === "vadeli" ? "Vadeli Fiyat (TL/kg)" : tanim.etiket;
                    return (
                      <th key={a} className={`px-2 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${a === "pesin" || a === "vadeli" ? "text-right" : "text-left"}`} style={{ color: TEXT_MUTED }}>
                        <span className={`inline-flex items-center gap-1.5 ${a === "pesin" || a === "vadeli" ? "flex-row-reverse" : ""}`}>
                          <span className={acik ? "" : "line-through opacity-60"}>{etiket}</span>
                          <button
                            type="button"
                            onClick={() => sutunDegistir(a)}
                            disabled={kilitli || kaydediliyor}
                            aria-pressed={acik}
                            aria-label={`${tanim.etiket} sütununu formda ${acik ? "gizle" : "göster"}`}
                            title={kilitli ? "Peşin ve vadeli fiyattan en az biri formda görünmeli" : acik ? "Formda görünüyor · gizlemek için tıklayın" : "Formda gizli · göstermek için tıklayın"}
                            className={`p-1 rounded-md border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${acik ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20" : "border-white/10 hover:bg-white/5"}`}
                            style={acik ? undefined : { color: TEXT_MUTED }}
                          >
                            {acik ? <Eye size={11} /> : <EyeOff size={11} />}
                          </button>
                        </span>
                        {!acik && <span className="block mt-0.5 normal-case tracking-normal font-normal text-[9px] text-amber-400">Formda yok</span>}
                      </th>
                    );
                  })}
                  {sutunTaslak.ozel.map((o) => (
                    <th key={o.id} className="px-2 py-1.5 text-left align-middle">
                      <div className="flex items-center gap-1">
                        <input
                          value={o.baslik}
                          onChange={(e) => ozelSutunAdi(o.id, e.target.value)}
                          maxLength={OZEL_BASLIK_MAX}
                          placeholder="Sütun başlığı"
                          aria-label="Özel sütun başlığı"
                          className="w-full min-w-[110px] px-2 py-1 rounded-md border text-[11px] font-semibold uppercase tracking-wide text-white placeholder:normal-case placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                          style={{ backgroundColor: "#0F131A", borderColor: o.baslik.trim().length < 2 ? "#F59E0B" : CARD_BORDER }}
                        />
                        <button type="button" onClick={() => ozelSutunSil(o.id)} disabled={kaydediliyor} title="Sütunu kaldır" aria-label={`${o.baslik || "Özel"} sütununu kaldır`}
                          className="p-1 rounded-md hover:bg-red-500/10 text-red-400 shrink-0 disabled:opacity-40"><Trash2 size={12} /></button>
                      </div>
                    </th>
                  ))}
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {satirlar.map((s, i) => {
                  const onceki = sonFormFiyati.get(`${s.urun.trim().toLocaleLowerCase("tr")}|${s.ambalaj.trim().toLocaleLowerCase("tr")}`);
                  const vadeliVar = fiyatOku(s.vadeli) !== null;
                  const vadeEksik = vadeliVar && gorunur("vadeli") && gorunur("vade") && !(Number(s.vade_gun) > 0);
                  const vadeSecenekleri = Array.from(new Set([...VADELI_VADE_SECENEKLERI, ...(s.vade_gun ? [s.vade_gun] : [])])).sort((a, b) => a - b);
                  // Formda gizli sutunun hucresi soluk (veri korunur, formda cikmaz)
                  const soluk = (a: StandartSutun) => (gorunur(a) ? "" : "opacity-40");
                  return (
                    <tr key={s.anahtar} className="border-t align-top" style={{ borderColor: CARD_BORDER }}>
                      <td className="px-2 py-2 text-xs pt-3.5" style={{ color: TEXT_MUTED }}>{i + 1}</td>
                      <td className="px-2 py-2 min-w-[150px]">
                        <input list="ic-urun-onerileri" value={s.urun} onChange={(e) => guncelle(s.anahtar, { urun: e.target.value })} placeholder="Ürün adı" className={inputSinif} style={inputStil} />
                      </td>
                      <td className={`px-2 py-2 min-w-[125px] ${soluk("ambalaj")}`}>
                        <input list="ic-ambalaj-onerileri" value={s.ambalaj} onChange={(e) => guncelle(s.anahtar, { ambalaj: e.target.value })} placeholder="Dökme" className={inputSinif} style={inputStil} />
                      </td>
                      <td className={`px-2 py-2 min-w-[125px] ${soluk("pesin")}`}>
                        <FiyatGirdisi deger={s.pesin} placeholder="13,15" etiket="Peşin fiyat" onceki={onceki ? onceki.pesin : undefined} degistir={(v) => guncelle(s.anahtar, { pesin: v })} />
                      </td>
                      <td className={`px-2 py-2 min-w-[125px] ${soluk("vadeli")}`}>
                        <FiyatGirdisi deger={s.vadeli} placeholder="13,65" etiket="Vadeli fiyat" onceki={onceki ? onceki.vadeli : undefined} degistir={(v) => guncelle(s.anahtar, { vadeli: v })} />
                      </td>
                      <td className={`px-2 py-2 min-w-[100px] ${soluk("vade")}`}>
                        <select value={s.vade_gun && s.vade_gun > 0 ? s.vade_gun : ""} onChange={(e) => guncelle(s.anahtar, { vade_gun: e.target.value === "" ? null : Number(e.target.value) })} className={`${inputSinif} ${vadeliVar ? "" : "opacity-50"}`} style={{ ...inputStil, borderColor: vadeEksik ? "#F87171" : CARD_BORDER }} title="Vadeli fiyatın vadesi" aria-label="Vadeli fiyatın vadesi">
                          <option value="">Seçin</option>
                          {vadeSecenekleri.map((g) => <option key={g} value={g}>{vadeYazi(g)}</option>)}
                        </select>
                        {vadeEksik && <p className="text-[10px] mt-1 text-red-400 whitespace-nowrap">Vade seçin</p>}
                      </td>
                      <td className={`px-2 py-2 min-w-[122px] ${soluk("kdv")}`}>
                        <select value={s.kdv_dahil ? "dahil" : "haric"} onChange={(e) => guncelle(s.anahtar, { kdv_dahil: e.target.value === "dahil" })} className={inputSinif} style={inputStil} title="Fiyatlara KDV dahil mi?">
                          <option value="haric">KDV Hariç</option>
                          <option value="dahil">KDV Dahil</option>
                        </select>
                      </td>
                      <td className={`px-2 py-2 min-w-[165px] ${soluk("teslim")}`}>
                        <select value={s.teslim} onChange={(e) => guncelle(s.anahtar, { teslim: e.target.value })} className={inputSinif} style={inputStil}>
                          <option value="">Seçin</option>
                          {Array.from(new Set([...TESLIM_SECENEKLERI, ...(s.teslim ? [s.teslim] : [])])).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </td>
                      {sutunTaslak.ozel.map((o) => (
                        <td key={o.id} className="px-2 py-2 min-w-[150px]">
                          <input value={s.ozel[o.id] || ""} onChange={(e) => guncelle(s.anahtar, { ozel: { ...s.ozel, [o.id]: e.target.value } })}
                            maxLength={OZEL_DEGER_MAX} placeholder="—" aria-label={`${o.baslik || "Özel sütun"} değeri`} className={inputSinif} style={inputStil} />
                        </td>
                      ))}
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
            Fiyatlar TL/kg&apos;dır. Peşin ve vadeli fiyat ayrı girilir; yalnızca peşin satılan üründe vadeli fiyat boş bırakılabilir (formda &quot;—&quot; görünür). Vade, vadeli fiyata aittir. KDV dahil/hariç her satırda ayrı seçilir. Sütun başlığındaki göz simgesiyle sütunu formda gösterip gizleyebilir, &quot;Sütun Ekle&quot; ile en fazla {OZEL_SUTUN_EN_COK} yeni sütun ekleyebilirsiniz (gizli sütunun verisi silinmez). Satır, sütun ve sıralama değişiklikleri &quot;Kaydet&quot; ile kalıcı olur; önceden oluşturulmuş formlar değişmez.
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
        <div className="mt-3 rounded-lg border px-3 py-2.5" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
          {!iletisimDuzenle ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs flex items-center gap-2 min-w-0" style={{ color: TEXT_MUTED }}>
                <Phone size={13} className="shrink-0" />
                <span className="shrink-0">Formdaki iletişim (Sipariş ve bilgi):</span>
                <span className="text-white truncate">{iletisimSatiri(iletisim, " · ")}</span>
              </p>
              <button onClick={iletisimDuzenlemeyiAc} disabled={iletisimOkunamadi} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs text-white hover:bg-white/5 disabled:opacity-50" style={{ borderColor: CARD_BORDER }}>
                <Pencil size={12} /> Düzenle
              </button>
            </div>
          ) : (
            <div>
              <p className="text-xs mb-2" style={{ color: TEXT_MUTED }}>Formun alt bilgisindeki &quot;Sipariş ve bilgi&quot; kişisi. Kaydedince önizleme ve yeni formlarda kullanılır; önceden oluşturulmuş formlar değişmez.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <label className="block"><span className="block text-[11px] mb-1" style={{ color: TEXT_MUTED }}>Ad soyad *</span>
                  <input value={iletisimTaslak.ad} onChange={(e) => setIletisimTaslak({ ...iletisimTaslak, ad: e.target.value })} placeholder="Burak Tuncay" className={inputSinif} style={inputStil} aria-label="İletişim ad soyad" /></label>
                <label className="block"><span className="block text-[11px] mb-1" style={{ color: TEXT_MUTED }}>Telefon *</span>
                  <input value={iletisimTaslak.telefon} onChange={(e) => setIletisimTaslak({ ...iletisimTaslak, telefon: e.target.value })} inputMode="tel" placeholder="0541 339 60 04" className={inputSinif} style={inputStil} aria-label="İletişim telefon" /></label>
                <label className="block"><span className="block text-[11px] mb-1" style={{ color: TEXT_MUTED }}>E-posta</span>
                  <input value={iletisimTaslak.eposta} onChange={(e) => setIletisimTaslak({ ...iletisimTaslak, eposta: e.target.value })} inputMode="email" placeholder="ad@unex.com.tr" className={inputSinif} style={inputStil} aria-label="İletişim e-posta" /></label>
                <label className="flex items-center gap-2 text-sm text-white sm:pt-5">
                  <input type="checkbox" checked={iletisimTaslak.whatsapp} onChange={(e) => setIletisimTaslak({ ...iletisimTaslak, whatsapp: e.target.checked })} className="accent-emerald-500" aria-label="WhatsApp hattı" />
                  WhatsApp hattı
                </label>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Formda: <span className="text-white">{iletisimSatiri({ ad: iletisimTaslak.ad.trim() || "—", telefon: iletisimTaslak.telefon.trim() || "—", whatsapp: iletisimTaslak.whatsapp, eposta: iletisimTaslak.eposta.trim() || null }, " · ")}</span></p>
                <div className="flex gap-2">
                  <button onClick={() => setIletisimDuzenle(false)} disabled={iletisimKaydediliyor} className="px-3 py-1.5 rounded-md border text-xs hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
                  <button onClick={iletisimKaydet} disabled={iletisimKaydediliyor} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white hover:brightness-110 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
                    {iletisimKaydediliyor ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Kaydet
                  </button>
                </div>
              </div>
            </div>
          )}
          {iletisimOkunamadi && <p className="mt-1.5 text-xs text-amber-400">İletişim ayarı okunamadı; yanlış bilgiyle form gitmemesi için form oluşturma kapalı. Sayfayı yenileyin.</p>}
        </div>
        <div className="mt-3 rounded-lg border px-3 py-2.5" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs flex items-center gap-2" style={{ color: TEXT_MUTED }}>
              <ScrollText size={13} className="shrink-0" />
              <span>Bilgilendirme ve Sevkiyat Şartları</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sartSablonu ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5"}`} style={sartSablonu ? undefined : { color: TEXT_MUTED }}>
                {sartSablonu ? "Özel metin" : "Varsayılan metin"}
              </span>
            </p>
            {!sartDuzenle && (
              <button onClick={sartDuzenlemeyiAc} disabled={iletisimOkunamadi} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs text-white hover:bg-white/5 disabled:opacity-50" style={{ borderColor: CARD_BORDER }}>
                <Pencil size={12} /> Düzenle
              </button>
            )}
          </div>
          {!sartDuzenle ? (
            <ol className="mt-2 space-y-1">
              {guncelSartlar.map((m, i) => (
                <li key={i} className="flex gap-2 text-xs text-slate-200">
                  <span className="shrink-0 font-semibold" style={{ color: "#F4A07C" }}>{i + 1}.</span>
                  <span>{m}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-2">
              <p className="text-[11px] mb-2" style={{ color: TEXT_MUTED }}>
                Kaydedince önizleme ve yeni formlarda kullanılır; önceden oluşturulmuş formlar değişmez.{" "}
                <span className="text-slate-300">{KDV_YER_TUTUCU}</span> yazdığınız yere ürünlerin KDV seçimine göre cümle gelir (şu an: &quot;{guncelKdvCumlesi}&quot;). Uzun metinde şartlar ikinci sayfaya geçebilir; kaydettikten sonra <span className="text-slate-300">Önizle</span> ile kontrol edin.
              </p>
              <div className="space-y-2">
                {sartTaslak.map((m, i) => {
                  const uzun = m.trim().length > SART_MAX_KARAKTER;
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <span className="pt-2 text-xs font-semibold w-5 text-right shrink-0" style={{ color: "#F4A07C" }}>{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <textarea value={m} onChange={(e) => sartGuncelle(i, e.target.value)} rows={2} aria-label={`${i + 1}. madde`}
                          className={`${inputSinif} resize-y leading-snug`} style={{ ...inputStil, borderColor: uzun ? "#F87171" : CARD_BORDER }} />
                        <p className={`text-[10px] mt-0.5 text-right ${uzun ? "text-red-400" : ""}`} style={uzun ? undefined : { color: TEXT_MUTED }}>{m.trim().length} / {SART_MAX_KARAKTER}</p>
                      </div>
                      <div className="flex items-center gap-0.5 pt-1 shrink-0">
                        <button onClick={() => sartTasi(i, -1)} disabled={i === 0} title="Yukarı taşı" className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30" style={{ color: TEXT_MUTED }}><ArrowUp size={13} /></button>
                        <button onClick={() => sartTasi(i, 1)} disabled={i === sartTaslak.length - 1} title="Aşağı taşı" className="p-1.5 rounded hover:bg-white/5 disabled:opacity-30" style={{ color: TEXT_MUTED }}><ArrowDown size={13} /></button>
                        <button onClick={() => setSartTaslak((o) => o.filter((_, j) => j !== i))} disabled={sartTaslak.length <= 1} title="Maddeyi sil" className="p-1.5 rounded hover:bg-red-500/10 text-red-400 disabled:opacity-30"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setSartTaslak((o) => [...o, ""])} disabled={sartTaslak.length >= SART_EN_COK} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs text-white hover:bg-white/5 disabled:opacity-50" style={{ borderColor: CARD_BORDER }}>
                    <Plus size={12} /> Madde ekle
                  </button>
                  <button onClick={() => setSartTaslak([...VARSAYILAN_SARTLAR])} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                    <RotateCcw size={12} /> Varsayılan metne dön
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSartDuzenle(false)} disabled={sartKaydediliyor} className="px-3 py-1.5 rounded-md border text-xs hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
                  <button onClick={sartKaydet} disabled={sartKaydediliyor} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white hover:brightness-110 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
                    {sartKaydediliyor ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Kaydet
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        {!formHazir && (
          <div className="mt-3 text-xs text-amber-400 space-y-0.5">
            {kirli && <p>Önce fiyat tablosundaki değişiklikleri kaydedin.</p>}
            {iletisimDuzenle && <p>Önce iletişim bilgisini kaydedin ya da vazgeçin.</p>}
            {sartDuzenle && <p>Önce şartları kaydedin ya da vazgeçin.</p>}
            {!kirli && formEksikleri.slice(0, 6).map((e) => <p key={e}>{e}</p>)}
          </div>
        )}
      </div>

      {/* 3) OLUSTURULAN FORMLAR */}
      <IcPiyasaGecmisFormlar formlar={formlar} silindi={(id) => setFormlar((o) => o.filter((f) => f.id !== id))} />

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
        onConfirm={() => { setSatirlar(dbSatirlar.map(dbdenSatir)); setSutunTaslak(sutunAyar); setGeriAlAcik(false); }}
      />
    </AppShell>
  );
}
