"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { AlertTriangle, CheckCircle2, FileText, Loader2, Upload, UserPlus, Users, X, ArrowRight, Info } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { IcMusteri, hataMesaji, telefonNormallestir, telefonYazi } from "@/lib/ic-piyasa/is-emri";
import { siparisFormuPdfOku, type SiparisFormuOkuma } from "@/lib/ic-piyasa/siparis-formu-oku";
import { AZAMI_FORM_BAYT, NAKLIYE_ETIKET, SiparisEki, isEmriOnDolum, musteriEsle, musteriKartiFarklari, nakliyedenTeslim } from "@/lib/ic-piyasa/siparis-formu";
import { ODEME_SECENEKLERI, TESLIM_SECENEKLERI, VADE_SECENEKLERI, fiyatYazi, vadeYazi } from "@/lib/ic-piyasa/fiyat-formu";
import { trSayiOku } from "@/lib/ic-piyasa/irsaliye-oku";
import { isEmriniFormlaAc } from "@/lib/ic-piyasa/is-emri-ac";

/**
 * Sipariş Formundan İş Emri (21.10.2026).
 * 1) Musteriyle imzalanan SIPARIS FORMU PDF'i secilir; tarayicida okunur
 *    (lib/ic-piyasa/siparis-formu-oku.ts, yapay zeka yok, sunucuya gitmez).
 * 2) Musteri: vergi no / unvan ile mevcut kart bulunur. Formdaki bilgi karttan
 *    farkliysa farklar gosterilir; kart SADECE kullanici isaretlerse guncellenir.
 *    Kart yoksa formdaki bilgilerle yeni kart onerilir (WhatsApp izni KAPALI gelir).
 * 3) TEK ADIM (22.10.2026, kullanici: "neden iki kere is yapiyoruz"): okunan
 *    bilgiler AYNI pencerede duzenlenebilir alanlar olarak gelir; tek "İş Emrini
 *    Aç" dugmesi gerekirse musteri kartini olusturur / gunceller, PDF'i yukler
 *    ve is emrini acar (lib/ic-piyasa/is-emri-ac.ts). Ikinci pencere YOK.
 *    Diger alanlar (not, talimat, ozellik duzeltme) acildiktan sonra "Düzenle"den.
 * Okunamayan (taranmis) formda musteri listeden secilir, "İş emrini hazırla"
 * ile tam is emri formu acilir, bilgiler elle girilir.
 */

type Props = {
  acik: boolean;
  kapat: () => void;
  musteriler: IcMusteri[];
  /** Musteri karti olusturuldu / guncellendi -> listeyi yenile */
  musterilerDegisti: () => Promise<void> | void;
  devam: (musteriId: string, ek: SiparisEki) => void;
  /** Tek adimda is emri acildi -> listeyi yenile */
  acildi: () => void;
};

/** Pencerede duzenlenen is emri alanlari (metin; kayitta sayiya cevrilir) */
type Hizli = { urun: string; ambalaj: string; ton: string; fiyat: string; kdv: "haric" | "dahil"; vade: string; odeme: string; teslim: string; nakliye: "" | "alici" | "satici"; teslim_suresi: string; siparis_tarihi: string };

function hizliTaslak(o: SiparisFormuOkuma): Hizli {
  const d = isEmriOnDolum(o);
  return {
    urun: d.urun || "",
    ambalaj: "Dökme",
    ton: d.hedef_kg ? (d.hedef_kg / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 3, useGrouping: false }) : "",
    fiyat: d.birim_fiyat !== null ? fiyatYazi(d.birim_fiyat) : "",
    kdv: d.kdv_dahil ? "dahil" : "haric",
    vade: d.vade_gun !== null ? String(d.vade_gun) : "",
    odeme: "",
    teslim: d.teslim || "",
    nakliye: d.nakliye || "",
    teslim_suresi: d.teslim_suresi_gun !== null ? String(d.teslim_suresi_gun) : "",
    siparis_tarihi: d.siparis_tarihi || "",
  };
}

type YeniKart = { unvan: string; vergi_dairesi: string; vergi_no: string; adres: string; yetkili_ad: string; telefon: string; eposta: string; whatsapp_izin: boolean };

const inputSinif = "w-full px-3 py-2 rounded-lg border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const inputStil = { backgroundColor: "#0F131A", borderColor: CARD_BORDER } as const;

export function IcSiparisFormuPenceresi({ acik, kapat, musteriler, musterilerDegisti, devam, acildi }: Props) {
  const { companyId, user } = useAuth();
  const { showToast } = useToast();
  const [dosya, setDosya] = useState<File | null>(null);
  const [okuyor, setOkuyor] = useState(false);
  const [okuma, setOkuma] = useState<SiparisFormuOkuma | null>(null);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [secilenMusteri, setSecilenMusteri] = useState<string>("");
  const [yeniKart, setYeniKart] = useState<YeniKart | null>(null);
  const [kartGuncelle, setKartGuncelle] = useState(false);
  const [mukerrer, setMukerrer] = useState<string[]>([]);
  const [isleniyor, setIsleniyor] = useState(false);
  const [surukle, setSurukle] = useState(false);
  const [hizli, setHizli] = useState<Hizli | null>(null);
  const okumaSira = useRef(0);

  useEffect(() => {
    if (!acik) return;
    setDosya(null); setOkuma(null); setOkumaHatasi(null); setSecilenMusteri(""); setYeniKart(null); setKartGuncelle(false); setMukerrer([]); setIsleniyor(false); setHizli(null);
  }, [acik]);

  const aktifMusteriler = useMemo(() => musteriler.filter((m) => m.aktif), [musteriler]);
  const eslesen = useMemo(() => (okuma ? musteriEsle(musteriler, okuma.alici) : null), [okuma, musteriler]);
  const kart = musteriler.find((m) => m.id === secilenMusteri) || null;
  const farklar = useMemo(() => (kart && okuma ? musteriKartiFarklari(kart, okuma.alici) : []), [kart, okuma]);

  // Ayni musteri + ayni form tarihi + ayni urunle acilmis (iptal olmayan) is emri var mi?
  useEffect(() => {
    setMukerrer([]);
    if (!companyId || !secilenMusteri || !okuma?.formTarihi) return;
    let iptal = false;
    supabase.from("ic_is_emirleri").select("is_emri_no, urun").eq("company_id", companyId).eq("musteri_id", secilenMusteri)
      .eq("siparis_tarihi", okuma.formTarihi).neq("durum", "iptal")
      .then(({ data }) => {
        if (iptal || !data) return;
        setMukerrer((data as { is_emri_no: string; urun: string }[]).filter((x) => !okuma.urun || x.urun.toLocaleLowerCase("tr") === okuma.urun.toLocaleLowerCase("tr")).map((x) => x.is_emri_no));
      });
    return () => { iptal = true; };
  }, [companyId, secilenMusteri, okuma]);

  const dosyaSec = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) || (f.type && f.type !== "application/pdf")) { showToast("Sipariş formu PDF olmalı.", "error"); return; }
    if (f.size > AZAMI_FORM_BAYT) { showToast("Dosya 10 MB'ı geçmemeli.", "error"); return; }
    const sira = ++okumaSira.current;
    setDosya(f); setOkuma(null); setOkumaHatasi(null); setSecilenMusteri(""); setYeniKart(null); setKartGuncelle(false); setHizli(null); setOkuyor(true);
    try {
      const s = await siparisFormuPdfOku(f);
      if (sira !== okumaSira.current) return;
      if (!s.tamam) { setOkumaHatasi(s.hata); return; }
      setOkuma(s.veri);
      setHizli(hizliTaslak(s.veri));
      const m = musteriEsle(musteriler, s.veri.alici);
      if (m) {
        setSecilenMusteri(m.id);
      } else {
        setYeniKart(yeniKartFormdan(s.veri));
      }
    } catch (e) {
      if (sira !== okumaSira.current) return;
      setOkumaHatasi(`PDF açılamadı: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (sira === okumaSira.current) setOkuyor(false);
    }
  };

  /**
   * Musteri: yeni kart olusturulur / isaretlenirse mevcut kart guncellenir.
   * Donus: musteri id (hata varsa null; mesaj gosterilmistir).
   */
  const musteriHazirla = async (): Promise<string | null> => {
    if (!companyId) return null;
    if (yeniKart && !secilenMusteri) {
      const unvan = yeniKart.unvan.trim().replace(/\s+/g, " ");
      if (!unvan) { showToast("Müşteri ünvanı boş olamaz.", "error"); return null; }
      const vergiNo = yeniKart.vergi_no.replace(/\D/g, "");
      if (vergiNo && !/^\d{10,11}$/.test(vergiNo)) { showToast("Vergi no 10 (VKN) veya 11 (TCKN) haneli olmalı.", "error"); return null; }
      const tel = telefonNormallestir(yeniKart.telefon);
      if (tel === undefined) { showToast("Telefon numarası geçersiz. Örnek: 0532 111 22 33", "error"); return null; }
      const eposta = yeniKart.eposta.trim();
      if (eposta && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eposta)) { showToast("E-posta adresi geçersiz.", "error"); return null; }
      if (yeniKart.whatsapp_izin && !tel) { showToast("WhatsApp izni için telefon numarası gerekli.", "error"); return null; }
      const { data, error } = await supabase.from("ic_musteriler").insert({
        company_id: companyId, unvan, vergi_dairesi: yeniKart.vergi_dairesi.trim() || null, vergi_no: vergiNo || null,
        adres: yeniKart.adres.trim() || null, yetkili_ad: yeniKart.yetkili_ad.trim() || null, telefon: tel, eposta: eposta || null,
        whatsapp_izin: yeniKart.whatsapp_izin,
      }).select("id");
      const hata = yazmaHatasi(error, data);
      if (hata) { showToast(`Müşteri kartı oluşturulamadı: ${hataMesaji({ message: hata })}`, "error"); return null; }
      const id = (data as { id: string }[])[0].id;
      // Sonraki adim basarisiz olursa tekrar denemede ikinci kart acilmasin
      setSecilenMusteri(id);
      setYeniKart(null);
      await musterilerDegisti();
      return id;
    }
    if (!secilenMusteri) { showToast("Müşteri seçin.", "error"); return null; }
    if (kart && kartGuncelle && farklar.length) {
      const guncel: Record<string, string | null> = {};
      for (const f of farklar) guncel[f.alan] = f.form;
      if (guncel.vergi_no && !/^\d{10,11}$/.test(guncel.vergi_no)) { showToast("Formdaki vergi no geçersiz; kart güncellenmedi.", "error"); return null; }
      const { data, error } = await supabase.from("ic_musteriler").update(guncel).eq("id", kart.id).eq("company_id", companyId).select("id");
      const hata = yazmaHatasi(error, data);
      if (hata) { showToast(`Müşteri kartı güncellenemedi: ${hataMesaji({ message: hata })}`, "error"); return null; }
      setKartGuncelle(false);
      await musterilerDegisti();
    }
    return secilenMusteri;
  };

  // Okunamayan form: musteri secilir, tam is emri formu acilir (elle doldurma)
  const devamEt = async () => {
    if (!dosya || !companyId) return;
    setIsleniyor(true);
    const id = await musteriHazirla();
    setIsleniyor(false);
    if (id) devam(id, { dosya, okuma });
  };

  // TEK ADIM: musteri + PDF + is emri
  const isEmriAc = async () => {
    if (!dosya || !companyId || !hizli || !okuma) return;
    const urun = hizli.urun.trim();
    if (!urun) { showToast("Ürün boş olamaz.", "error"); return; }
    const ton = trSayiOku(hizli.ton);
    if (ton === null || ton <= 0 || ton > 100000) { showToast("Miktarı ton olarak girin. Örnek: 19", "error"); return; }
    const fiyat = hizli.fiyat.trim() ? trSayiOku(hizli.fiyat) : null;
    if (hizli.fiyat.trim() && (fiyat === null || fiyat < 0)) { showToast(`Birim fiyat geçersiz: "${hizli.fiyat}". Örnek: 15,25`, "error"); return; }
    const vade = hizli.vade === "" ? null : Number(hizli.vade);
    if (vade !== null && (!Number.isInteger(vade) || vade < 0 || vade > 365)) { showToast("Vade 0-365 gün olmalı.", "error"); return; }
    const ts = hizli.teslim_suresi === "" ? null : Number(hizli.teslim_suresi);
    if (ts !== null && (!Number.isInteger(ts) || ts < 0 || ts > 365)) { showToast("Teslim süresi 0-365 gün olmalı.", "error"); return; }
    if (hizli.siparis_tarihi && !/^\d{4}-\d{2}-\d{2}$/.test(hizli.siparis_tarihi)) { showToast("Sipariş tarihi geçersiz.", "error"); return; }

    setIsleniyor(true);
    const musteriId = await musteriHazirla();
    if (!musteriId) { setIsleniyor(false); return; }
    const m = musteriler.find((x) => x.id === musteriId);
    const ozellikler = okuma.ozellikler.slice(0, 20).map((x) => ({ ad: x.ad.slice(0, 40), deger: x.deger.slice(0, 60) }));
    const sonuc = await isEmriniFormlaAc(supabase, {
      companyId,
      email: user?.email || null,
      dosya,
      kayit: {
        musteri_id: musteriId,
        urun,
        ambalaj: hizli.ambalaj.trim() || null,
        hedef_tur: "kg",
        hedef_kg: Math.round(ton * 1000 * 100) / 100,
        birim_fiyat: fiyat === null ? null : Math.round(fiyat * 100) / 100,
        kdv_dahil: hizli.kdv === "dahil",
        vade_gun: vade,
        odeme: hizli.odeme || null,
        teslim: hizli.teslim || null,
        teslim_adresi: okuma.sevkAdresi || m?.adres || yeniKart?.adres.trim() || null,
        talimat_veren: "Burak Tuncay",
        siparis_tarihi: hizli.siparis_tarihi || null,
        nakliye: hizli.nakliye || null,
        teslim_suresi_gun: ts,
        urun_ozellikleri: ozellikler.length ? ozellikler : null,
      },
    });
    setIsleniyor(false);
    if (!sonuc.tamam) { showToast(`İş emri açılamadı: ${sonuc.hata}`, "error"); return; }
    showToast(`${sonuc.isEmriNo} açıldı. Kantar Panelinde görünür; "Siparişiniz alındı" mesajı Bildirimler'de hazır.`, "success");
    acildi();
  };

  if (!acik) return null;

  const okunduMu = !!okuma;
  const devamKapali = isleniyor || okuyor || !dosya || (!secilenMusteri && !(yeniKart && yeniKart.unvan.trim()));
  const hizliDegistir = (alan: keyof Hizli, deger: string) => setHizli((h) => (h ? { ...h, [alan]: deger } : h));

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="siparis-formu-baslik">
      <div className="w-full max-w-3xl rounded-2xl border shadow-2xl my-8" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div>
            <h2 id="siparis-formu-baslik" className="text-base font-semibold text-white">Sipariş Formundan İş Emri</h2>
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>Sipariş formunu (PDF) bırakın; bilgiler okunur, kontrol edip tek tıkla iş emrini açarsınız.</p>
          </div>
          <button onClick={() => !isleniyor && kapat()} className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* 1) Dosya */}
          <label
            onDragOver={(e) => { e.preventDefault(); setSurukle(true); }}
            onDragLeave={() => setSurukle(false)}
            onDrop={(e) => { e.preventDefault(); setSurukle(false); dosyaSec(e.dataTransfer.files?.[0]); }}
            className="flex flex-col sm:flex-row items-center gap-3 rounded-xl border border-dashed px-4 py-4 cursor-pointer transition-colors"
            style={{ borderColor: surukle ? ACCENT : CARD_BORDER, backgroundColor: surukle ? "rgba(16,185,129,0.06)" : "#0F131A" }}>
            {okuyor ? <Loader2 size={22} className="animate-spin shrink-0" style={{ color: ACCENT }} /> : dosya ? <FileText size={22} className="shrink-0 text-emerald-400" /> : <Upload size={22} className="shrink-0" style={{ color: TEXT_MUTED }} />}
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-sm text-white truncate">{okuyor ? "Form okunuyor…" : dosya ? dosya.name : "Sipariş formunu seçin veya buraya bırakın"}</p>
              <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{dosya ? "Başka bir dosya seçmek için tıklayın." : "PDF · en fazla 10 MB"}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs text-white shrink-0" style={{ borderColor: CARD_BORDER }}>{dosya ? "Değiştir" : "Dosya seç"}</span>
            <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { dosyaSec(e.target.files?.[0]); e.target.value = ""; }} disabled={isleniyor} />
          </label>

          {okumaHatasi && (
            <div className="rounded-lg border px-3 py-2.5 text-xs flex items-start gap-2" style={{ borderColor: "rgba(251,191,36,0.35)", backgroundColor: "rgba(251,191,36,0.06)" }} role="alert">
              <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="text-amber-300">
                <p>{okumaHatasi}</p>
                <p className="mt-1" style={{ color: TEXT_MUTED }}>Doğru belgeyse müşteriyi aşağıdan seçip devam edin; form iş emrine eklenir, bilgileri elle girersiniz.</p>
              </div>
            </div>
          )}

          {/* 2) Okunan bilgiler - duzenlenebilir (tek adim) */}
          {okuma && hizli && (
            <section>
              <BolumBaslik>İş Emri Bilgileri <span className="normal-case tracking-normal font-normal">· formdan okundu, gerekirse düzeltin</span></BolumBaslik>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border p-3" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
                <Alan etiket="Ürün *" genis><input value={hizli.urun} onChange={(e) => hizliDegistir("urun", e.target.value)} className={inputSinif} style={inputStil} /></Alan>
                <Alan etiket="Ambalaj"><input value={hizli.ambalaj} onChange={(e) => hizliDegistir("ambalaj", e.target.value)} className={inputSinif} style={inputStil} /></Alan>
                <Alan etiket="Miktar (ton) *"><input value={hizli.ton} onChange={(e) => hizliDegistir("ton", e.target.value)} inputMode="decimal" className={`${inputSinif} text-right font-semibold`} style={inputStil} /></Alan>
                <Alan etiket="Birim fiyat (TL/kg)"><input value={hizli.fiyat} onChange={(e) => hizliDegistir("fiyat", e.target.value)} inputMode="decimal" className={`${inputSinif} text-right font-semibold`} style={inputStil} /></Alan>
                <Alan etiket="KDV">
                  <select value={hizli.kdv} onChange={(e) => hizliDegistir("kdv", e.target.value)} className={inputSinif} style={inputStil}>
                    <option value="haric">KDV Hariç</option><option value="dahil">KDV Dahil</option>
                  </select>
                </Alan>
                <Alan etiket="Vade">
                  <select value={hizli.vade} onChange={(e) => hizliDegistir("vade", e.target.value)} className={inputSinif} style={inputStil}>
                    <option value="">Seçin</option>
                    {Array.from(new Set([...VADE_SECENEKLERI, ...(hizli.vade !== "" ? [Number(hizli.vade)] : [])])).sort((x, y) => x - y).map((g) => <option key={g} value={g}>{vadeYazi(g)}</option>)}
                  </select>
                </Alan>
                <Alan etiket="Ödeme aracı">
                  <select value={hizli.odeme} onChange={(e) => hizliDegistir("odeme", e.target.value)} className={inputSinif} style={inputStil}>
                    <option value="">Belirtilmedi</option>
                    {ODEME_SECENEKLERI.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Alan>
                <Alan etiket="Nakliye">
                  <select value={hizli.nakliye} onChange={(e) => { const n = e.target.value as Hizli["nakliye"]; setHizli((h) => (h ? { ...h, nakliye: n, teslim: nakliyedenTeslim(n || null) || h.teslim } : h)); }} className={inputSinif} style={inputStil}>
                    <option value="">Belirtilmedi</option>
                    <option value="alici">{NAKLIYE_ETIKET.alici}</option>
                    <option value="satici">{NAKLIYE_ETIKET.satici}</option>
                  </select>
                </Alan>
                <Alan etiket="Teslim">
                  <select value={hizli.teslim} onChange={(e) => hizliDegistir("teslim", e.target.value)} className={inputSinif} style={inputStil}>
                    <option value="">Seçin</option>
                    {Array.from(new Set([...TESLIM_SECENEKLERI, ...(hizli.teslim ? [hizli.teslim] : [])])).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Alan>
                <Alan etiket="Teslim süresi (gün)"><input value={hizli.teslim_suresi} onChange={(e) => hizliDegistir("teslim_suresi", e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" className={`${inputSinif} text-right`} style={inputStil} /></Alan>
                <Alan etiket="Sipariş tarihi"><input type="date" value={hizli.siparis_tarihi} onChange={(e) => hizliDegistir("siparis_tarihi", e.target.value)} className={inputSinif} style={{ ...inputStil, colorScheme: "dark" }} /></Alan>
                {okuma.ozellikler.length > 0 && (
                  <div className="col-span-2 sm:col-span-4 text-xs">
                    <span style={{ color: TEXT_MUTED }}>Ürün özellikleri: </span>
                    <span className="text-white">{okuma.ozellikler.map((x) => `${x.ad}: ${x.deger}`).join(" · ")}</span>
                  </div>
                )}
              </div>
              {okuma.uyarilar.length > 0 && (
                <div className="mt-2 space-y-1">
                  {okuma.uyarilar.map((u) => <p key={u} className="flex items-start gap-1.5 text-[11px] text-amber-400"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> {u}</p>)}
                </div>
              )}
            </section>
          )}

          {/* 3) Musteri */}
          {dosya && !okuyor && (okuma || okumaHatasi) && (
            <section>
              <BolumBaslik>Müşteri</BolumBaslik>
              {secilenMusteri || !yeniKart ? (
                <div className="space-y-2">
                  {eslesen && eslesen.id === secilenMusteri && (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 size={13} /> Kayıtlı müşteri bulundu ({okuma?.alici.vergiNo && eslesen.vergi_no === okuma.alici.vergiNo ? "vergi no" : "ünvan"} eşleşti).</p>
                  )}
                  <label className="block">
                    <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Müşteri *</span>
                    <select value={secilenMusteri} onChange={(e) => { setSecilenMusteri(e.target.value); setKartGuncelle(false); }} className={inputSinif} style={inputStil} disabled={isleniyor}>
                      <option value="">Seçin</option>
                      {aktifMusteriler.concat(musteriler.filter((m) => !m.aktif && m.id === secilenMusteri)).map((m) => <option key={m.id} value={m.id}>{m.unvan}{m.vergi_no ? ` · ${m.vergi_no}` : ""}</option>)}
                    </select>
                  </label>
                  {okuma && !eslesen && (
                    <button type="button" onClick={() => { setSecilenMusteri(""); setYeniKart(yeniKartFormdan(okuma)); }} className="inline-flex items-center gap-1.5 text-xs hover:text-white" style={{ color: TEXT_MUTED }}><UserPlus size={13} /> Formdaki bilgilerle yeni müşteri kartı oluştur</button>
                  )}
                  {aktifMusteriler.length === 0 && !okuma && <p className="text-xs text-amber-400">Kayıtlı müşteri yok. Önce Müşteriler sekmesinden kart oluşturun.</p>}
                  {kart && farklar.length > 0 && (
                    <div className="rounded-lg border p-3" style={{ borderColor: "rgba(56,189,248,0.3)", backgroundColor: "rgba(56,189,248,0.05)" }}>
                      <p className="flex items-center gap-1.5 text-xs text-sky-300 mb-2"><Info size={13} /> Formdaki bilgiler müşteri kartından farklı:</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[460px]">
                          <thead>
                            <tr>{["Alan", "Kartta", "Formda"].map((b) => <th key={b} className="text-left px-2 py-1 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b}</th>)}</tr>
                          </thead>
                          <tbody>
                            {farklar.map((f) => (
                              <tr key={f.alan} className="border-t" style={{ borderColor: CARD_BORDER }}>
                                <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{f.etiket}</td>
                                <td className="px-2 py-1.5" style={{ color: TEXT_MUTED }}>{f.alan === "telefon" ? telefonYazi(f.kart) : f.kart || "—"}</td>
                                <td className="px-2 py-1.5 text-white">{f.alan === "telefon" ? telefonYazi(f.form) : f.form}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <label className="mt-2 flex items-center gap-2 text-xs text-white cursor-pointer">
                        <input type="checkbox" checked={kartGuncelle} onChange={(e) => setKartGuncelle(e.target.checked)} className="accent-emerald-500" />
                        Müşteri kartını formdaki bilgilerle güncelle
                      </label>
                      <p className="text-[10px] mt-1" style={{ color: TEXT_MUTED }}>İşaretlemezseniz kart değişmez; sadece iş emri açılır.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs text-white"><UserPlus size={13} className="text-emerald-400" /> Kayıtlı değil — formdaki bilgilerle yeni müşteri kartı oluşturulacak</p>
                    {aktifMusteriler.length > 0 && (
                      <button type="button" onClick={() => setYeniKart(null)} className="inline-flex items-center gap-1 text-xs hover:text-white" style={{ color: TEXT_MUTED }}><Users size={12} /> Mevcut müşteriden seç</button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Alan etiket="Ünvan *" genis><input value={yeniKart.unvan} onChange={(e) => setYeniKart({ ...yeniKart, unvan: e.target.value })} className={inputSinif} style={inputStil} /></Alan>
                    <Alan etiket="Vergi dairesi"><input value={yeniKart.vergi_dairesi} onChange={(e) => setYeniKart({ ...yeniKart, vergi_dairesi: e.target.value })} className={inputSinif} style={inputStil} /></Alan>
                    <Alan etiket="Vergi no / TCKN"><input value={yeniKart.vergi_no} onChange={(e) => setYeniKart({ ...yeniKart, vergi_no: e.target.value.replace(/\D/g, "").slice(0, 11) })} inputMode="numeric" className={inputSinif} style={inputStil} /></Alan>
                    <Alan etiket="Adres" genis><textarea value={yeniKart.adres} onChange={(e) => setYeniKart({ ...yeniKart, adres: e.target.value })} rows={2} className={inputSinif} style={inputStil} /></Alan>
                    <Alan etiket="Yetkili"><input value={yeniKart.yetkili_ad} onChange={(e) => setYeniKart({ ...yeniKart, yetkili_ad: e.target.value })} className={inputSinif} style={inputStil} /></Alan>
                    <Alan etiket="Telefon"><input value={yeniKart.telefon} onChange={(e) => setYeniKart({ ...yeniKart, telefon: e.target.value })} inputMode="tel" className={inputSinif} style={inputStil} /></Alan>
                    <Alan etiket="E-posta" genis><input value={yeniKart.eposta} onChange={(e) => setYeniKart({ ...yeniKart, eposta: e.target.value })} inputMode="email" className={inputSinif} style={inputStil} /></Alan>
                  </div>
                  <label className="flex items-start gap-2 text-xs text-white cursor-pointer">
                    <input type="checkbox" checked={yeniKart.whatsapp_izin} onChange={(e) => setYeniKart({ ...yeniKart, whatsapp_izin: e.target.checked })} className="accent-emerald-500 mt-0.5" />
                    <span>WhatsApp bildirim izni var <span className="block text-[10px]" style={{ color: TEXT_MUTED }}>Sipariş alındı / yola çıktı mesajları. Müşteriden izin alındıysa işaretleyin.</span></span>
                  </label>
                </div>
              )}
              {mukerrer.length > 0 && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-400" role="alert"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> Bu müşteriye aynı tarihli sipariş formuyla açılmış iş emri var: {mukerrer.join(", ")}. Aynı formu ikinci kez açmadığınızdan emin olun.</p>
              )}
            </section>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
          <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{okunduMu ? "Not, talimat ve diğer alanlar iş emri açıldıktan sonra Düzenle'den değiştirilebilir." : ""}</p>
          <div className="flex gap-2">
            <button onClick={kapat} disabled={isleniyor} className="px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
            {okunduMu ? (
              <button onClick={isEmriAc} disabled={devamKapali} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:brightness-110 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
                {isleniyor ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {yeniKart && !secilenMusteri ? "Müşteri Kartını Oluştur ve İş Emrini Aç" : "İş Emrini Aç"}
              </button>
            ) : (
              <button onClick={devamEt} disabled={devamKapali} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:brightness-110 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
                {isleniyor ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                İş emrini hazırla
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function yeniKartFormdan(o: SiparisFormuOkuma): YeniKart {
  const a = o.alici;
  return {
    unvan: a.unvan || "", vergi_dairesi: a.vergiDairesi || "", vergi_no: a.vergiNo || "", adres: a.adres || "",
    yetkili_ad: a.yetkili || "", telefon: telefonGoster(a.telefon), eposta: a.eposta || "", whatsapp_izin: false,
  };
}

/** Okunan telefon gecerliyse "0542 818 66 20", degilse ham hali (kullanici duzeltir) */
function telefonGoster(t: string | null): string {
  if (!t) return "";
  const n = telefonNormallestir(t);
  return n ? telefonYazi(n) : t;
}

function BolumBaslik({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: TEXT_MUTED }}>{children}</h3>;
}

function Alan({ etiket, genis, children }: { etiket: string; genis?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${genis ? "sm:col-span-2" : ""}`}>
      <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>{etiket}</span>
      {children}
    </label>
  );
}
