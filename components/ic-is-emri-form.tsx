"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { Loader2, X, Save, FileText, Truck, Scale, Upload, Trash2, Plus, ExternalLink, AlertTriangle } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { IC_BELGE_BUCKET, IcIsEmri, IcMusteri, hataMesaji } from "@/lib/ic-piyasa/is-emri";
import { AZAMI_FORM_BAYT, AZAMI_OZELLIK, NAKLIYE_ETIKET, SiparisEki, UrunOzelligi, gunAyYil, isEmriOnDolum, ozellikleriHazirla, ozellikleriOku, siparisFormuYolu } from "@/lib/ic-piyasa/siparis-formu";
import {
  IcFiyatFormu,
  ODEME_SECENEKLERI,
  TESLIM_SECENEKLERI,
  VADE_SECENEKLERI,
  fiyatYazi,
  formGecerliMi,
  gunYazi,
  kalemFiyatlari,
  kdvYazi,
  vadeYazi,
} from "@/lib/ic-piyasa/fiyat-formu";

/**
 * Is emri ac / duzenle (12.10.2026).
 * Fiyat, vade ve teslim GECERLI fiyat formundan tek tikla doldurulur
 * (form numarasi is emrine yazilir); Burak Bey ozel fiyat verdiyse alanlar
 * elle degistirilebilir. Hedef: TONAJ (ton) veya ARAC SAYISI.
 * 14.10.2026: formda her urunun PESIN ve VADELI fiyati ayri; hangisine
 * tiklanirsa o fiyat + vade (pesin = 0 gun) yazilir. Odeme sekli formda
 * olmadigi icin is emrinde elle secilir (degistirilmez).
 * 21.10.2026: SIPARIS FORMU - "Sipariş Formundan Aç" penceresinden gelinirse
 * (`onDolum`) okunan bilgiler alanlara yazilir ve PDF kayitla birlikte depoya
 * (<sirket>/siparis/<uuid>.pdf) yuklenir. Sira: once PDF, sonra kayit; kayit
 * olmazsa PDF geri silinir; form degistirilir / kaldirilirsa ESKI PDF ancak
 * kayit basarili olduktan sonra silinir.
 */

type Props = {
  acik: boolean;
  kapat: () => void;
  kaydedildi: () => void;
  musteriler: IcMusteri[];
  duzenlenen: IcIsEmri | null;
  sevkVar: boolean;
  /** Sipariş formundan acilis: secilen / olusturulan musteri + form */
  onDolum?: { musteriId: string; ek: SiparisEki } | null;
};

type Taslak = {
  musteri_id: string;
  urun: string;
  ambalaj: string;
  hedef_tur: "kg" | "arac";
  hedef_ton: string;
  hedef_arac: string;
  birim_fiyat: string;
  kdv_dahil: boolean;
  vade_gun: string;
  odeme: string;
  teslim: string;
  teslim_adresi: string;
  fiyat_formu_id: string | null;
  fiyat_formu_no: string | null;
  talimat_veren: string;
  musteri_siparis_no: string;
  notlar: string;
  siparis_tarihi: string;
  nakliye: "" | "alici" | "satici";
  teslim_suresi_gun: string;
  urun_ozellikleri: UrunOzelligi[];
};

const BOS: Taslak = {
  musteri_id: "", urun: "", ambalaj: "Dökme", hedef_tur: "kg", hedef_ton: "", hedef_arac: "",
  birim_fiyat: "", kdv_dahil: false, vade_gun: "30", odeme: "Çek", teslim: "Fabrika Teslim", teslim_adresi: "",
  fiyat_formu_id: null, fiyat_formu_no: null, talimat_veren: "Burak Tuncay", musteri_siparis_no: "", notlar: "",
  siparis_tarihi: "", nakliye: "", teslim_suresi_gun: "", urun_ozellikleri: [],
};

const inputSinif = "w-full px-3 py-2 rounded-lg border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const inputStil = { backgroundColor: "#0F131A", borderColor: CARD_BORDER } as const;

/** "75" / "75,5" / "1.250,5" -> sayi; bos -> null; gecersiz -> NaN */
function sayiOku(metin: string): number | null {
  const s = metin.trim().replace(/\s+/g, "");
  if (!s) return null;
  let t = s;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d+)?$/.test(t)) t = t.replace(",", ".");
  else if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const sayiYaz = (n: number | null | undefined, basamak = 3) =>
  n === null || n === undefined ? "" : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: basamak, useGrouping: false });

export function IcIsEmriForm({ acik, kapat, kaydedildi, musteriler, duzenlenen, sevkVar, onDolum }: Props) {
  const { companyId, user } = useAuth();
  const { showToast } = useToast();
  const [taslak, setTaslak] = useState<Taslak>(BOS);
  const [formlar, setFormlar] = useState<IcFiyatFormu[]>([]);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  // Sipariş formu PDF'i: yeni secilen dosya / mevcut formun kaldirilmasi
  const [yeniForm, setYeniForm] = useState<File | null>(null);
  const [formKaldir, setFormKaldir] = useState(false);
  const [okumaUyarilari, setOkumaUyarilari] = useState<string[]>([]);

  useEffect(() => {
    if (!acik) return;
    if (duzenlenen) {
      setTaslak({
        musteri_id: duzenlenen.musteri_id,
        urun: duzenlenen.urun,
        ambalaj: duzenlenen.ambalaj || "",
        hedef_tur: duzenlenen.hedef_tur,
        hedef_ton: duzenlenen.hedef_kg ? sayiYaz(Number(duzenlenen.hedef_kg) / 1000) : "",
        hedef_arac: duzenlenen.hedef_arac ? String(duzenlenen.hedef_arac) : "",
        birim_fiyat: duzenlenen.birim_fiyat !== null ? fiyatYazi(Number(duzenlenen.birim_fiyat)) : "",
        kdv_dahil: duzenlenen.kdv_dahil,
        vade_gun: duzenlenen.vade_gun !== null ? String(duzenlenen.vade_gun) : "",
        odeme: duzenlenen.odeme || "",
        teslim: duzenlenen.teslim || "",
        teslim_adresi: duzenlenen.teslim_adresi || "",
        fiyat_formu_id: duzenlenen.fiyat_formu_id,
        fiyat_formu_no: duzenlenen.fiyat_formu_no,
        talimat_veren: duzenlenen.talimat_veren || "",
        musteri_siparis_no: duzenlenen.musteri_siparis_no || "",
        notlar: duzenlenen.notlar || "",
        siparis_tarihi: duzenlenen.siparis_tarihi || "",
        nakliye: duzenlenen.nakliye || "",
        teslim_suresi_gun: duzenlenen.teslim_suresi_gun !== null && duzenlenen.teslim_suresi_gun !== undefined ? String(duzenlenen.teslim_suresi_gun) : "",
        urun_ozellikleri: ozellikleriOku(duzenlenen.urun_ozellikleri),
      });
      setYeniForm(null);
      setOkumaUyarilari([]);
    } else if (onDolum) {
      // Sipariş formundan: okunan bilgiler (okunamadiysa sadece musteri + PDF)
      const o = onDolum.ek.okuma ? isEmriOnDolum(onDolum.ek.okuma) : null;
      const m = musteriler.find((x) => x.id === onDolum.musteriId);
      setTaslak({
        ...BOS,
        musteri_id: onDolum.musteriId,
        urun: o?.urun || "",
        hedef_tur: "kg",
        hedef_ton: o?.hedef_kg ? sayiYaz(o.hedef_kg / 1000) : "",
        birim_fiyat: o?.birim_fiyat !== null && o?.birim_fiyat !== undefined ? fiyatYazi(o.birim_fiyat) : "",
        kdv_dahil: o?.kdv_dahil ?? false,
        vade_gun: o?.vade_gun !== null && o?.vade_gun !== undefined ? String(o.vade_gun) : "",
        // Formda odeme araci (cek / havale) yok: bilincli secilsin
        odeme: "",
        teslim: o?.teslim || "",
        teslim_adresi: o?.teslim_adresi || m?.adres || "",
        siparis_tarihi: o?.siparis_tarihi || "",
        nakliye: o?.nakliye || "",
        teslim_suresi_gun: o?.teslim_suresi_gun !== null && o?.teslim_suresi_gun !== undefined ? String(o.teslim_suresi_gun) : "",
        urun_ozellikleri: o?.urun_ozellikleri || [],
      });
      setYeniForm(onDolum.ek.dosya);
      setOkumaUyarilari(onDolum.ek.okuma ? onDolum.ek.okuma.uyarilar : ["Formdan bilgi okunamadı; alanları elle doldurun. Form iş emrine eklenecek."]);
    } else {
      setTaslak(BOS);
      setYeniForm(null);
      setOkumaUyarilari([]);
    }
    setFormKaldir(false);
    // musteriler bilerek bagimlilik degil: liste yenilenince kullanicinin duzenlemesi ezilmesin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik, duzenlenen, onDolum]);

  useEffect(() => {
    if (!acik || !companyId) return;
    supabase
      .from("ic_fiyat_formlari")
      .select("id, company_id, form_no, alici, onay_zamani, gecerlilik_bitis, kalemler, olusturan_email")
      .eq("company_id", companyId)
      .order("onay_zamani", { ascending: false })
      .limit(10)
      .then(({ data }) => setFormlar((data || []) as IcFiyatFormu[]));
  }, [acik, companyId]);

  const aktifMusteriler = useMemo(
    () => musteriler.filter((m) => m.aktif || m.id === taslak.musteri_id),
    [musteriler, taslak.musteri_id]
  );
  const secilenMusteri = musteriler.find((m) => m.id === taslak.musteri_id) || null;

  // Gecerli (suresi dolmamis) en yeni form; yoksa en yeni form (uyariyla)
  const gecerliForm = formlar.find((f) => formGecerliMi(f.gecerlilik_bitis)) || null;
  const kaynakForm = gecerliForm || formlar[0] || null;

  const formdanDoldur = (kalemIndex: number, tur: "pesin" | "vadeli") => {
    if (!kaynakForm) return;
    const k = kaynakForm.kalemler[kalemIndex];
    if (!k) return;
    const f = kalemFiyatlari(k);
    const fiyat = tur === "pesin" ? f.pesin : f.vadeli;
    if (fiyat === null) return;
    setTaslak((t) => ({
      ...t,
      urun: k.urun,
      ambalaj: k.ambalaj,
      birim_fiyat: fiyatYazi(fiyat),
      kdv_dahil: !!k.kdv_dahil,
      vade_gun: tur === "pesin" ? "0" : String(f.vadeGun ?? ""),
      teslim: k.teslim,
      fiyat_formu_id: kaynakForm.id,
      fiyat_formu_no: kaynakForm.form_no,
    }));
  };

  const musteriSec = (id: string) => {
    const m = musteriler.find((x) => x.id === id);
    setTaslak((t) => ({ ...t, musteri_id: id, teslim_adresi: t.teslim_adresi || m?.adres || "" }));
  };

  const kaydet = async () => {
    if (!companyId) return;
    if (!taslak.musteri_id) { showToast("Müşteri seçin.", "error"); return; }
    if (!taslak.urun.trim()) { showToast("Ürün boş olamaz.", "error"); return; }
    let hedef_kg: number | null = null;
    let hedef_arac: number | null = null;
    if (taslak.hedef_tur === "kg") {
      const ton = sayiOku(taslak.hedef_ton);
      if (ton === null || Number.isNaN(ton) || ton <= 0 || ton > 100000) { showToast("Hedef tonajı girin. Örnek: 75", "error"); return; }
      hedef_kg = Math.round(ton * 1000 * 100) / 100;
    } else {
      const n = Number(taslak.hedef_arac);
      if (!Number.isInteger(n) || n <= 0 || n > 500) { showToast("Araç sayısını girin. Örnek: 3", "error"); return; }
      hedef_arac = n;
    }
    const fiyat = sayiOku(taslak.birim_fiyat);
    if (fiyat !== null && (Number.isNaN(fiyat) || fiyat < 0)) { showToast(`Birim fiyat geçersiz: "${taslak.birim_fiyat}". Örnek: 13,15`, "error"); return; }
    const vade = taslak.vade_gun === "" ? null : Number(taslak.vade_gun);
    if (vade !== null && (!Number.isInteger(vade) || vade < 0 || vade > 365)) { showToast("Vade 0-365 gün olmalı.", "error"); return; }
    if (taslak.siparis_tarihi && !/^\d{4}-\d{2}-\d{2}$/.test(taslak.siparis_tarihi)) { showToast("Sipariş tarihi geçersiz.", "error"); return; }
    const teslimSuresi = taslak.teslim_suresi_gun === "" ? null : Number(taslak.teslim_suresi_gun);
    if (teslimSuresi !== null && (!Number.isInteger(teslimSuresi) || teslimSuresi < 0 || teslimSuresi > 365)) { showToast("Teslim süresi 0-365 gün olmalı.", "error"); return; }
    const oz = ozellikleriHazirla(taslak.urun_ozellikleri);
    if (oz.hata) { showToast(oz.hata, "error"); return; }
    if (yeniForm && (yeniForm.size > AZAMI_FORM_BAYT || !/\.pdf$/i.test(yeniForm.name))) { showToast("Sipariş formu PDF olmalı ve 10 MB'ı geçmemeli.", "error"); return; }

    const kayit = {
      musteri_id: taslak.musteri_id,
      urun: taslak.urun.trim(),
      ambalaj: taslak.ambalaj.trim() || null,
      hedef_tur: taslak.hedef_tur,
      hedef_kg,
      hedef_arac,
      birim_fiyat: fiyat === null ? null : Math.round(fiyat * 100) / 100,
      kdv_dahil: taslak.kdv_dahil,
      vade_gun: vade,
      odeme: taslak.odeme.trim() || null,
      teslim: taslak.teslim.trim() || null,
      teslim_adresi: taslak.teslim_adresi.trim() || null,
      fiyat_formu_id: taslak.fiyat_formu_id,
      fiyat_formu_no: taslak.fiyat_formu_no,
      talimat_veren: taslak.talimat_veren.trim() || null,
      musteri_siparis_no: taslak.musteri_siparis_no.trim() || null,
      notlar: taslak.notlar.trim() || null,
      siparis_tarihi: taslak.siparis_tarihi || null,
      nakliye: taslak.nakliye || null,
      teslim_suresi_gun: teslimSuresi,
      urun_ozellikleri: oz.deger,
    };
    setKaydediliyor(true);

    // Form PDF'i degisecekse eski yol kayittan TAZE okunur (silme sadece kayit basariliysa)
    let eskiYol: string | null = null;
    if (duzenlenen && (yeniForm || formKaldir)) {
      const { data: taze, error: tazeHata } = await supabase.from("ic_is_emirleri").select("siparis_formu_yolu").eq("id", duzenlenen.id).eq("company_id", companyId).maybeSingle();
      if (tazeHata) { setKaydediliyor(false); showToast(`Kaydedilemedi: ${tazeHata.message}`, "error"); return; }
      eskiYol = (taze as { siparis_formu_yolu: string | null } | null)?.siparis_formu_yolu || null;
    }
    // Once PDF, sonra kayit
    let yeniYol: string | null = null;
    if (yeniForm) {
      yeniYol = siparisFormuYolu(companyId);
      const { error: yHata } = await supabase.storage.from(IC_BELGE_BUCKET).upload(yeniYol, yeniForm, { contentType: "application/pdf", upsert: false });
      if (yHata) { setKaydediliyor(false); showToast(`Sipariş formu yüklenemedi: ${yHata.message}`, "error"); return; }
    }
    const formAlanlari = yeniYol
      ? { siparis_formu_yolu: yeniYol, siparis_formu_adi: yeniForm!.name.slice(0, 255) }
      : formKaldir ? { siparis_formu_yolu: null, siparis_formu_adi: null } : {};
    const sonuc = duzenlenen
      ? await supabase.from("ic_is_emirleri").update({ ...kayit, ...formAlanlari }).eq("id", duzenlenen.id).eq("company_id", companyId).select("id, is_emri_no")
      : await supabase.from("ic_is_emirleri").insert({ ...kayit, ...formAlanlari, company_id: companyId, olusturan_email: user?.email || null }).select("id, is_emri_no");
    const hata = yazmaHatasi(sonuc.error, sonuc.data);
    if (hata) {
      if (yeniYol) await supabase.storage.from(IC_BELGE_BUCKET).remove([yeniYol]); // sahipsiz PDF kalmasin
      setKaydediliyor(false);
      showToast(`Kaydedilemedi: ${hataMesaji({ message: hata })}`, "error");
      return;
    }
    if (eskiYol && eskiYol !== yeniYol) {
      const { error: sHata } = await supabase.storage.from(IC_BELGE_BUCKET).remove([eskiYol]);
      if (sHata) console.error("Eski sipariş formu silinemedi:", sHata.message);
    }
    setKaydediliyor(false);
    const no = (sonuc.data as { is_emri_no: string }[])[0]?.is_emri_no;
    showToast(duzenlenen ? `${no} güncellendi.` : `${no} açıldı. Kantar Panelinde görünür.`, "success");
    kaydedildi();
  };

  const formAc = async () => {
    if (yeniForm) {
      const url = URL.createObjectURL(yeniForm);
      window.open(url, "_blank", "noopener");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    const yol = duzenlenen?.siparis_formu_yolu;
    if (!yol) return;
    const pencere = window.open("", "_blank");
    const { data, error } = await supabase.storage.from(IC_BELGE_BUCKET).createSignedUrl(yol, 60 * 10);
    if (error || !data?.signedUrl) { pencere?.close(); showToast(`Sipariş formu açılamadı: ${error?.message || "bilinmeyen hata"}`, "error"); return; }
    if (pencere) pencere.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  };
  const formSec = (f: File | undefined) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) || (f.type && f.type !== "application/pdf")) { showToast("Sipariş formu PDF olmalı.", "error"); return; }
    if (f.size > AZAMI_FORM_BAYT) { showToast("Sipariş formu 10 MB'ı geçmemeli.", "error"); return; }
    setYeniForm(f);
    setFormKaldir(false);
  };
  const ozellikDegistir = (i: number, alan: keyof UrunOzelligi, deger: string) =>
    setTaslak((t) => ({ ...t, urun_ozellikleri: t.urun_ozellikleri.map((x, j) => (j === i ? { ...x, [alan]: deger } : x)) }));

  if (!acik) return null;

  const mevcutFormAdi = !formKaldir && !yeniForm ? duzenlenen?.siparis_formu_adi || (duzenlenen?.siparis_formu_yolu ? "Sipariş formu" : null) : null;

  const fiyatDegisti = (() => {
    if (!taslak.fiyat_formu_id || !kaynakForm || kaynakForm.id !== taslak.fiyat_formu_id) return false;
    const k = kaynakForm.kalemler.find((x) => x.urun === taslak.urun && x.ambalaj === taslak.ambalaj);
    const f = sayiOku(taslak.birim_fiyat);
    if (!k || f === null || Number.isNaN(f)) return false;
    // Pesin is emri (vade 0) formun pesin fiyatiyla, vadeli is emri vadeli fiyatla karsilastirilir
    const ff = kalemFiyatlari(k);
    const formFiyati = taslak.vade_gun === "0" ? ff.pesin : ff.vadeli;
    return formFiyati === null || Math.abs(formFiyati - f) > 0.001;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="is-emri-form-baslik">
      <div className="w-full max-w-3xl rounded-2xl border shadow-2xl my-8" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div>
            <h2 id="is-emri-form-baslik" className="text-base font-semibold text-white">{duzenlenen ? `${duzenlenen.is_emri_no} · Düzenle` : "Yeni İş Emri"}</h2>
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>İş emri numarası kaydedince verilir (IE-YYYY-NNNN). Kantarcı fiyatı görmez.</p>
          </div>
          <button onClick={() => !kaydediliyor && kapat()} className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Musteri */}
          <section>
            <BolumBaslik>Müşteri</BolumBaslik>
            {aktifMusteriler.length === 0 ? (
              <p className="text-sm text-amber-400">Önce müşteri kaydı oluşturun: <Link href="/ic-piyasa/musteriler" className="underline">Müşteriler</Link></p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block sm:col-span-2">
                  <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Müşteri *</span>
                  <select value={taslak.musteri_id} onChange={(e) => musteriSec(e.target.value)} disabled={!!duzenlenen && sevkVar} className={inputSinif} style={inputStil}>
                    <option value="">Seçin</option>
                    {aktifMusteriler.map((m) => <option key={m.id} value={m.id}>{m.unvan}{m.aktif ? "" : " (pasif)"}</option>)}
                  </select>
                  {!!duzenlenen && sevkVar && <span className="block text-[10px] mt-1" style={{ color: TEXT_MUTED }}>Sevk girilmiş iş emrinin müşterisi değiştirilemez.</span>}
                  {secilenMusteri && !secilenMusteri.vergi_no && <span className="block text-[10px] mt-1 text-amber-400">Müşteri kartında vergi no yok; irsaliyedeki alıcı kontrol edilemez.</span>}
                </label>
                <Alan etiket="Talimatı veren">
                  <input value={taslak.talimat_veren} onChange={(e) => setTaslak({ ...taslak, talimat_veren: e.target.value })} className={inputSinif} style={inputStil} />
                </Alan>
                <Alan etiket="Müşteri sipariş no (varsa)">
                  <input value={taslak.musteri_siparis_no} onChange={(e) => setTaslak({ ...taslak, musteri_siparis_no: e.target.value })} className={inputSinif} style={inputStil} />
                </Alan>
              </div>
            )}
          </section>

          {/* Siparis formu (21.10.2026) */}
          <section>
            <BolumBaslik>Sipariş Formu</BolumBaslik>
            {okumaUyarilari.length > 0 && (
              <div className="rounded-lg border px-3 py-2 mb-3 text-xs space-y-1" style={{ borderColor: "rgba(251,191,36,0.35)", backgroundColor: "rgba(251,191,36,0.06)" }} role="status">
                <p className="font-semibold text-amber-400">Formdan okunanları kontrol edin:</p>
                {okumaUyarilari.map((u) => <p key={u} className="flex items-start gap-1.5 text-amber-300"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {u}</p>)}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {yeniForm || mevcutFormAdi ? (
                <span className="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs text-white max-w-full" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
                  <FileText size={13} className="text-emerald-400 shrink-0" />
                  <span className="truncate max-w-[260px]" title={yeniForm?.name || mevcutFormAdi || ""}>{yeniForm?.name || mevcutFormAdi}</span>
                  {yeniForm && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400">Kaydedince eklenir</span>}
                  <button type="button" onClick={formAc} className="inline-flex items-center gap-1 hover:text-white" style={{ color: TEXT_MUTED }} title="Formu görüntüle"><ExternalLink size={12} /> Gör</button>
                  <button type="button" onClick={() => { if (yeniForm) setYeniForm(null); else setFormKaldir(true); }} className="hover:text-red-400" style={{ color: TEXT_MUTED }} title="Formu kaldır" aria-label="Formu kaldır"><Trash2 size={12} /></button>
                </span>
              ) : (
                <span className="text-xs" style={{ color: TEXT_MUTED }}>{formKaldir ? "Form kaydedince kaldırılacak." : "Sipariş formu eklenmemiş."}</span>
              )}
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                <Upload size={12} /> {yeniForm || mevcutFormAdi ? "Değiştir" : "Form ekle (PDF)"}
                <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { formSec(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Alan etiket="Sipariş tarihi">
                <input type="date" value={taslak.siparis_tarihi} onChange={(e) => setTaslak({ ...taslak, siparis_tarihi: e.target.value })} className={inputSinif} style={{ ...inputStil, colorScheme: "dark" }} />
              </Alan>
              <Alan etiket="Ürün nakliyesi">
                <select value={taslak.nakliye} onChange={(e) => setTaslak({ ...taslak, nakliye: e.target.value as Taslak["nakliye"] })} className={inputSinif} style={inputStil}>
                  <option value="">Belirtilmedi</option>
                  <option value="alici">{NAKLIYE_ETIKET.alici}</option>
                  <option value="satici">{NAKLIYE_ETIKET.satici}</option>
                </select>
              </Alan>
              <Alan etiket="Teslim süresi (gün)">
                <input value={taslak.teslim_suresi_gun} onChange={(e) => setTaslak({ ...taslak, teslim_suresi_gun: e.target.value.replace(/\D/g, "").slice(0, 3) })} inputMode="numeric" placeholder="7" className={`${inputSinif} text-right`} style={inputStil} />
              </Alan>
            </div>
            <div className="mt-3">
              <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Ürün özellikleri</span>
              {taslak.urun_ozellikleri.length === 0 && <p className="text-xs mb-1.5" style={{ color: TEXT_MUTED }}>Özellik yok.</p>}
              <div className="space-y-1.5">
                {taslak.urun_ozellikleri.map((x, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                    <input value={x.ad} onChange={(e) => ozellikDegistir(i, "ad", e.target.value)} maxLength={40} placeholder="Rutubet" aria-label={`${i + 1}. özellik adı`} className={inputSinif} style={inputStil} />
                    <input value={x.deger} onChange={(e) => ozellikDegistir(i, "deger", e.target.value)} maxLength={60} placeholder="%14 En Çok" aria-label={`${i + 1}. özellik değeri`} className={inputSinif} style={inputStil} />
                    <button type="button" onClick={() => setTaslak((t) => ({ ...t, urun_ozellikleri: t.urun_ozellikleri.filter((_, j) => j !== i) }))} className="px-2 rounded-lg border hover:bg-red-500/10 text-red-400" style={{ borderColor: CARD_BORDER }} aria-label={`${i + 1}. özelliği sil`}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              {taslak.urun_ozellikleri.length < AZAMI_OZELLIK && (
                <button type="button" onClick={() => setTaslak((t) => ({ ...t, urun_ozellikleri: [...t.urun_ozellikleri, { ad: "", deger: "" }] }))} className="mt-1.5 inline-flex items-center gap-1 text-xs hover:text-white" style={{ color: TEXT_MUTED }}><Plus size={12} /> Özellik ekle</button>
              )}
              {taslak.siparis_tarihi && <p className="text-[10px] mt-2" style={{ color: TEXT_MUTED }}>Form tarihi: {gunAyYil(taslak.siparis_tarihi)}</p>}
            </div>
          </section>

          {/* Fiyat formundan doldur */}
          <section>
            <BolumBaslik>Ürün ve Fiyat</BolumBaslik>
            {kaynakForm ? (
              <div className="rounded-lg border p-3 mb-3" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
                <p className="text-xs mb-2 flex flex-wrap items-center gap-1.5" style={{ color: TEXT_MUTED }}>
                  <FileText size={12} /> <span className="text-white font-medium">{kaynakForm.form_no}</span>
                  {gecerliForm
                    ? <span className="text-emerald-400">· {gunYazi(kaynakForm.gecerlilik_bitis)} tarihine kadar geçerli</span>
                    : <span className="text-amber-400">· süresi doldu ({gunYazi(kaynakForm.gecerlilik_bitis)}); fiyatları kontrol edin</span>}
                  <span>· Peşin veya vadeli fiyata tıklayınca fiyat, vade ve teslim doldurulur.</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {kaynakForm.kalemler.map((k, i) => {
                    const f = kalemFiyatlari(k);
                    const ayniUrun = taslak.fiyat_formu_id === kaynakForm.id && taslak.urun === k.urun && taslak.ambalaj === k.ambalaj;
                    const secenekler = [
                      { tur: "pesin" as const, etiket: "Peşin", fiyat: f.pesin, secili: ayniUrun && taslak.vade_gun === "0" },
                      { tur: "vadeli" as const, etiket: `Vadeli · ${vadeYazi(f.vadeGun)}`, fiyat: f.vadeli, secili: ayniUrun && taslak.vade_gun !== "0" && taslak.vade_gun === String(f.vadeGun ?? "") },
                    ].filter((x) => x.fiyat !== null);
                    return (
                      <div key={i} className="rounded-lg border px-2.5 py-1.5 text-xs" style={{ borderColor: ayniUrun ? ACCENT : CARD_BORDER }}>
                        <p className="text-white"><span className="font-medium">{k.urun}</span> <span style={{ color: TEXT_MUTED }}>{k.ambalaj} · {kdvYazi(k.kdv_dahil)}</span></p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {secenekler.map((x) => (
                            <button key={x.tur} type="button" onClick={() => formdanDoldur(i, x.tur)} aria-pressed={x.secili}
                              className="px-2 py-1 rounded-md border text-left transition-colors hover:bg-white/5"
                              style={x.secili ? { borderColor: ACCENT, backgroundColor: "rgba(16,185,129,0.12)", color: "white" } : { borderColor: CARD_BORDER, color: "white" }}>
                              <span style={{ color: TEXT_MUTED }}>{x.etiket}</span> <span className="font-semibold">{fiyatYazi(x.fiyat)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs mb-3 text-amber-400">Henüz fiyat formu oluşturulmamış; fiyatı elle girin.</p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Alan etiket="Ürün *" genis>
                <input value={taslak.urun} onChange={(e) => setTaslak({ ...taslak, urun: e.target.value })} placeholder="Kepek" className={inputSinif} style={inputStil} />
              </Alan>
              <Alan etiket="Ambalaj" genis>
                <input value={taslak.ambalaj} onChange={(e) => setTaslak({ ...taslak, ambalaj: e.target.value })} placeholder="Dökme" className={inputSinif} style={inputStil} />
              </Alan>
              <Alan etiket="Birim fiyat (TL/kg)">
                <input value={taslak.birim_fiyat} onChange={(e) => setTaslak({ ...taslak, birim_fiyat: e.target.value })} inputMode="decimal" placeholder="13,15" className={`${inputSinif} text-right font-semibold`} style={inputStil} />
                {fiyatDegisti && <span className="block text-[10px] mt-1 text-amber-400">Formdaki fiyattan farklı (müşteriye özel)</span>}
              </Alan>
              <Alan etiket="KDV">
                <select value={taslak.kdv_dahil ? "dahil" : "haric"} onChange={(e) => setTaslak({ ...taslak, kdv_dahil: e.target.value === "dahil" })} className={inputSinif} style={inputStil}>
                  <option value="haric">KDV Hariç</option>
                  <option value="dahil">KDV Dahil</option>
                </select>
              </Alan>
              <Alan etiket="Vade">
                <select value={taslak.vade_gun} onChange={(e) => setTaslak({ ...taslak, vade_gun: e.target.value })} className={inputSinif} style={inputStil}>
                  <option value="">Seçin</option>
                  {Array.from(new Set([...VADE_SECENEKLERI, ...(taslak.vade_gun !== "" ? [Number(taslak.vade_gun)] : [])])).sort((a, b) => a - b).map((g) => <option key={g} value={g}>{vadeYazi(g)}</option>)}
                </select>
              </Alan>
              <Alan etiket="Ödeme">
                <select value={taslak.odeme} onChange={(e) => setTaslak({ ...taslak, odeme: e.target.value })} className={inputSinif} style={inputStil}>
                  <option value="">Seçin</option>
                  {Array.from(new Set([...ODEME_SECENEKLERI, ...(taslak.odeme ? [taslak.odeme] : [])])).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                {onDolum && !duzenlenen && !taslak.odeme && <span className="block text-[10px] mt-1 text-amber-400">Formda ödeme aracı yok; seçin.</span>}
              </Alan>
              <Alan etiket="Teslim" genis>
                <select value={taslak.teslim} onChange={(e) => setTaslak({ ...taslak, teslim: e.target.value })} className={inputSinif} style={inputStil}>
                  <option value="">Seçin</option>
                  {Array.from(new Set([...TESLIM_SECENEKLERI, ...(taslak.teslim ? [taslak.teslim] : [])])).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Alan>
            </div>
          </section>

          {/* Hedef */}
          <section>
            <BolumBaslik>Hedef</BolumBaslik>
            <div className="flex flex-wrap items-end gap-3">
              <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }} role="radiogroup" aria-label="Hedef türü">
                {([["kg", "Tonaj", Scale], ["arac", "Araç sayısı", Truck]] as const).map(([deger, etiket, Ikon]) => (
                  <button key={deger} type="button" role="radio" aria-checked={taslak.hedef_tur === deger} onClick={() => setTaslak({ ...taslak, hedef_tur: deger })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm"
                    style={taslak.hedef_tur === deger ? { backgroundColor: ACCENT, color: "white" } : { color: TEXT_MUTED }}>
                    <Ikon size={14} /> {etiket}
                  </button>
                ))}
              </div>
              {taslak.hedef_tur === "kg" ? (
                <label className="block w-40">
                  <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Toplam (ton) *</span>
                  <input value={taslak.hedef_ton} onChange={(e) => setTaslak({ ...taslak, hedef_ton: e.target.value })} inputMode="decimal" placeholder="75" className={`${inputSinif} text-right font-semibold`} style={inputStil} />
                </label>
              ) : (
                <label className="block w-40">
                  <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Araç sayısı *</span>
                  <input value={taslak.hedef_arac} onChange={(e) => setTaslak({ ...taslak, hedef_arac: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="3" className={`${inputSinif} text-right font-semibold`} style={inputStil} />
                </label>
              )}
              <p className="text-xs pb-2 max-w-sm" style={{ color: TEXT_MUTED }}>Tutar her zaman irsaliyedeki gerçek net kg × birim fiyat ile hesaplanır.</p>
            </div>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Alan etiket="Teslim adresi">
              <textarea value={taslak.teslim_adresi} onChange={(e) => setTaslak({ ...taslak, teslim_adresi: e.target.value })} rows={2} className={inputSinif} style={inputStil} />
            </Alan>
            <Alan etiket="Not (kantarcı görmez)">
              <textarea value={taslak.notlar} onChange={(e) => setTaslak({ ...taslak, notlar: e.target.value })} rows={2} className={inputSinif} style={inputStil} />
            </Alan>
          </section>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
          <button onClick={kapat} disabled={kaydediliyor} className="px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
          <button onClick={kaydet} disabled={kaydediliyor || aktifMusteriler.length === 0} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:brightness-110 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
            {kaydediliyor ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {duzenlenen ? "Kaydet" : "İş Emrini Aç"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BolumBaslik({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: TEXT_MUTED }}>{children}</h3>;
}

function Alan({ etiket, genis, children }: { etiket: string; genis?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${genis ? "col-span-2 sm:col-span-2" : ""}`}>
      <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>{etiket}</span>
      {children}
    </label>
  );
}
