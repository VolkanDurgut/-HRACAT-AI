"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { IcPiyasaSekmeler, bildirimSayaciniYenile } from "@/components/ic-piyasa-sekmeler";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Bell, Loader2, AlertCircle, MessageCircle, Copy, Check, SkipForward, Mail, Settings2, Save, RefreshCw, ExternalLink, AlertTriangle, Share2, Download,
} from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { BILDIRIM_ETIKET, elleGonderimMetni, sablonBul } from "@/lib/ic-piyasa/mesaj-sablonlari";
import { IC_BELGE_BUCKET, hataMesaji, tarihSaatYazi, telefonNormallestir, telefonYazi } from "@/lib/ic-piyasa/is-emri";

/**
 * Ic Piyasa - Bildirimler (12.10.2026).
 * Musteri mesajlari (siparis alindi, cikis saati, yola cikti, tamamlandi)
 * sistem tarafindan otomatik HAZIRLANIR ve burada bekler. Meta onayina kadar
 * yetkili "WhatsApp'ta Gonder" ile kendi telefonundan gonderir ve "Gonderildi"
 * isaretler; hicbir mesaj kaybolmaz. Lojistik / yetkili e-postalari otomatik
 * gider (ic-piyasa edge function); durumlari burada izlenir.
 * 22.10.2026: musteri mesajlarinda baglanti YOK. "Aracınız yola çıktı" mesaji
 * irsaliye PDF'iyle birlikte PAYLASILIR (Web Share: telefonda / WhatsApp
 * masaustu uygulamasinda kisi veya grup secilir). Paylasim desteklenmiyorsa
 * metin WhatsApp'ta acilir, PDF "İrsaliyeyi indir" ile indirilip sohbete eklenir.
 */

type Satir = {
  id: string; sablon: string; alici: "musteri" | "lojistik" | "yetkili"; kanal: "whatsapp" | "eposta";
  hedef: string | null; alici_ad: string | null; degerler: string[]; dugme_eki: string | null;
  durum: "bekliyor" | "gonderiliyor" | "gonderildi" | "atlandi" | "hata"; hata: string | null; deneme: number;
  olusturma: string; islem_zamani: string | null; isleyen: string | null;
  ic_is_emirleri: { is_emri_no: string; ic_musteriler: { id: string; unvan: string; telefon: string | null; whatsapp_izin: boolean } | null } | null;
  ic_sevkler: { irsaliye_dosya_yolu: string; irsaliye_no: string | null; plaka: string } | null;
};

/** "IRS2026000002468" / "59 AGD 271" -> dosya adina uygun */
const dosyaAdi = (x: string) => x.replace(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü_-]+/g, "_").replace(/^_+|_+$/g, "") || "irsaliye";
type Ayarlar = { lojistik_ad: string; lojistik_eposta: string; lojistik_telefon: string; yetkili_eposta: string; yetkili_cc: string };
type Sekme = "gonderilecek" | "gonderilen" | "eposta";

const inputSinif = "w-full px-3 py-2 rounded-lg border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const inputStil = { backgroundColor: "#0F131A", borderColor: CARD_BORDER } as const;

const DURUM_ROZET: Record<Satir["durum"], { etiket: string; sinif: string }> = {
  bekliyor: { etiket: "Bekliyor", sinif: "bg-amber-500/15 text-amber-400" },
  gonderiliyor: { etiket: "Gönderiliyor", sinif: "bg-sky-500/15 text-sky-400" },
  gonderildi: { etiket: "Gönderildi", sinif: "bg-emerald-500/15 text-emerald-400" },
  atlandi: { etiket: "Atlandı", sinif: "bg-slate-500/15 text-slate-400" },
  hata: { etiket: "Hata", sinif: "bg-red-500/15 text-red-400" },
};

export default function BildirimlerPage() {
  const { companyId, user, yetkiler, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const yetkili = !!yetkiler.sayfa_yetkileri.ic_piyasa;

  const [satirlar, setSatirlar] = useState<Satir[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [sekme, setSekme] = useState<Sekme>("gonderilecek");
  const [onayBekleyen, setOnayBekleyen] = useState<string | null>(null); // WhatsApp acildi, "gonderildi mi?" sorusu
  const [kopyalanan, setKopyalanan] = useState<string | null>(null);
  const [atlanacak, setAtlanacak] = useState<Satir | null>(null);
  const [isleniyor, setIsleniyor] = useState<string | null>(null);
  const [paylasilabilir, setPaylasilabilir] = useState(false);
  const [dosyaIsleniyor, setDosyaIsleniyor] = useState<string | null>(null);

  // Cihaz PDF paylasimini destekliyor mu (telefon / WhatsApp masaustu)?
  useEffect(() => {
    try {
      const deneme = new File([new Uint8Array([37, 80, 68, 70])], "deneme.pdf", { type: "application/pdf" });
      setPaylasilabilir(typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [deneme] }));
    } catch { setPaylasilabilir(false); }
  }, []);

  const [ayar, setAyar] = useState<Ayarlar>({ lojistik_ad: "", lojistik_eposta: "", lojistik_telefon: "", yetkili_eposta: "", yetkili_cc: "" });
  const [ayarVar, setAyarVar] = useState(false);
  const [ayarAcik, setAyarAcik] = useState(false);
  const [ayarKaydediliyor, setAyarKaydediliyor] = useState(false);

  const getir = useCallback(async () => {
    if (!companyId) return;
    setOkumaHatasi(null);
    const [bRes, aRes] = await Promise.all([
      supabase.from("ic_bildirimler")
        .select("id, sablon, alici, kanal, hedef, alici_ad, degerler, dugme_eki, durum, hata, deneme, olusturma, islem_zamani, isleyen, ic_is_emirleri(is_emri_no, ic_musteriler(id, unvan, telefon, whatsapp_izin)), ic_sevkler(irsaliye_dosya_yolu, irsaliye_no, plaka)")
        .eq("company_id", companyId).order("olusturma", { ascending: false }).limit(300),
      supabase.from("ic_piyasa_ayarlari").select("lojistik_ad, lojistik_eposta, lojistik_telefon, yetkili_eposta, yetkili_cc").eq("company_id", companyId).maybeSingle(),
    ]);
    if (bRes.error || aRes.error) { setOkumaHatasi((bRes.error || aRes.error)!.message); setYukleniyor(false); return; }
    setSatirlar((bRes.data || []) as unknown as Satir[]);
    bildirimSayaciniYenile();
    if (aRes.data) {
      setAyarVar(true);
      setAyar({
        lojistik_ad: aRes.data.lojistik_ad || "", lojistik_eposta: aRes.data.lojistik_eposta || "",
        lojistik_telefon: aRes.data.lojistik_telefon ? telefonYazi(aRes.data.lojistik_telefon) : "", yetkili_eposta: aRes.data.yetkili_eposta || "",
        yetkili_cc: (aRes.data.yetkili_cc || "").split(",").join(", "),
      });
    } else {
      setAyarVar(false);
      setAyarAcik(true);
    }
    setYukleniyor(false);
  }, [companyId]);

  useEffect(() => { if (!authLoading && yetkili) getir(); }, [authLoading, yetkili, getir]);
  useEffect(() => {
    if (!yetkili) return;
    const z = window.setInterval(() => { if (document.visibilityState === "visible") getir(); }, 60_000);
    return () => window.clearInterval(z);
  }, [yetkili, getir]);

  const gonderilecek = useMemo(() => satirlar.filter((s) => s.kanal === "whatsapp" && s.durum === "bekliyor").sort((a, b) => a.olusturma.localeCompare(b.olusturma)), [satirlar]);
  const gonderilen = useMemo(() => satirlar.filter((s) => s.kanal === "whatsapp" && s.durum !== "bekliyor"), [satirlar]);
  const epostalar = useMemo(() => satirlar.filter((s) => s.kanal === "eposta"), [satirlar]);
  const epostaSorunu = epostalar.filter((s) => s.durum === "hata").length;

  const telefonu = (s: Satir) => s.hedef || s.ic_is_emirleri?.ic_musteriler?.telefon || null;
  const metni = (s: Satir) => {
    const sb = sablonBul(s.sablon);
    if (!sb) return null;
    try { return elleGonderimMetni(sb, s.degerler, s.dugme_eki || undefined); } catch { return null; }
  };

  const isaretle = async (s: Satir, durum: "gonderildi" | "atlandi") => {
    if (!companyId) return;
    setIsleniyor(s.id);
    const { data, error } = await supabase.from("ic_bildirimler")
      .update({ durum, islem_zamani: new Date().toISOString(), isleyen: user?.email || "yetkili" })
      .eq("id", s.id).eq("company_id", companyId).eq("durum", "bekliyor").select("id");
    setIsleniyor(null);
    const hata = yazmaHatasi(error, data);
    if (hata) { showToast(`İşaretlenemedi: ${hataMesaji({ message: hata })}`, "error"); getir(); return; }
    showToast(durum === "gonderildi" ? "Gönderildi olarak işaretlendi." : "Mesaj atlandı.", "success");
    setOnayBekleyen(null);
    setAtlanacak(null);
    getir();
  };

  const whatsappAc = (s: Satir) => {
    const tel = telefonu(s);
    const metin = metni(s);
    if (!tel || !metin) return;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(metin)}`, "_blank", "noopener");
    setOnayBekleyen(s.id);
  };

  // Irsaliye PDF'i (yola cikti mesaji)
  const irsaliyeDosyasi = async (s: Satir): Promise<File | null> => {
    const sv = s.ic_sevkler;
    if (!sv) return null;
    const { data, error } = await supabase.storage.from(IC_BELGE_BUCKET).download(sv.irsaliye_dosya_yolu);
    if (error || !data) { showToast(`İrsaliye alınamadı: ${error?.message || "bilinmeyen hata"}`, "error"); return null; }
    return new File([data], `${dosyaAdi(sv.irsaliye_no || sv.plaka)}.pdf`, { type: "application/pdf" });
  };

  const paylas = async (s: Satir) => {
    const metin = metni(s);
    if (!metin) return;
    setDosyaIsleniyor(s.id);
    const dosya = await irsaliyeDosyasi(s);
    setDosyaIsleniyor(null);
    if (!dosya) return;
    try {
      await navigator.share({ files: [dosya], text: metin });
      setOnayBekleyen(s.id);
    } catch (e) {
      if ((e as { name?: string })?.name !== "AbortError") showToast("Paylaşılamadı; metni WhatsApp'ta açıp irsaliyeyi indirerek ekleyin.", "error");
    }
  };

  const irsaliyeIndir = async (s: Satir) => {
    setDosyaIsleniyor(s.id);
    const dosya = await irsaliyeDosyasi(s);
    setDosyaIsleniyor(null);
    if (!dosya) return;
    const url = URL.createObjectURL(dosya);
    const a = document.createElement("a");
    a.href = url; a.download = dosya.name; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const kopyala = async (s: Satir) => {
    const metin = metni(s);
    if (!metin) return;
    try { await navigator.clipboard.writeText(metin); setKopyalanan(s.id); window.setTimeout(() => setKopyalanan((k) => (k === s.id ? null : k)), 2000); }
    catch { showToast("Kopyalanamadı; metni seçip elle kopyalayın.", "error"); }
  };

  const ayarKaydet = async () => {
    if (!companyId) return;
    const loEposta = ayar.lojistik_eposta.trim();
    const yeEposta = ayar.yetkili_eposta.trim();
    const epostaRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!loEposta || !epostaRe.test(loEposta)) { showToast("Lojistik e-posta adresi geçersiz.", "error"); return; }
    if (yeEposta && !epostaRe.test(yeEposta)) { showToast("Yetkili e-posta adresi geçersiz.", "error"); return; }
    const ccListe = ayar.yetkili_cc.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    const ccHatali = ccListe.find((x) => !epostaRe.test(x));
    if (ccHatali) { showToast(`CC adresi geçersiz: ${ccHatali}`, "error"); return; }
    if (ccListe.length > 5) { showToast("CC'ye en fazla 5 adres yazılabilir.", "error"); return; }
    if (ccListe.length && !yeEposta) { showToast("CC için önce uyarı alıcısını (yetkili e-posta) yazın.", "error"); return; }
    const tel = telefonNormallestir(ayar.lojistik_telefon);
    if (tel === undefined) { showToast("Lojistik telefon numarası geçersiz.", "error"); return; }
    setAyarKaydediliyor(true);
    const { data, error } = await supabase.from("ic_piyasa_ayarlari")
      .upsert({ company_id: companyId, lojistik_ad: ayar.lojistik_ad.trim() || null, lojistik_eposta: loEposta, lojistik_telefon: tel, yetkili_eposta: yeEposta || null, yetkili_cc: ccListe.length ? Array.from(new Set(ccListe)).join(",") : null }, { onConflict: "company_id" })
      .select("company_id");
    setAyarKaydediliyor(false);
    const hata = yazmaHatasi(error, data);
    if (hata) { showToast(`Kaydedilemedi: ${hataMesaji({ message: hata })}`, "error"); return; }
    showToast("Bildirim ayarları kaydedildi.", "success");
    setAyarAcik(false);
    getir();
  };

  if (authLoading || (yetkili && yukleniyor && !okumaHatasi)) {
    return <AppShell><div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin" style={{ color: ACCENT }} /></div></AppShell>;
  }

  return (
    <AppShell>
      <SayfaBasligi
        ikon={<Bell size={20} />}
        baslik="İç Piyasa · Bildirimler"
        aciklama="Müşteri mesajları otomatik hazırlanır; WhatsApp'tan tek dokunuşla gönderip işaretleyin. Lojistik e-postaları otomatik gider."
        sag={
          <>
            <button onClick={getir} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} title="Yenile"><RefreshCw size={14} /></button>
            <button onClick={() => setAyarAcik((a) => !a)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm text-white hover:bg-white/5" style={{ borderColor: CARD_BORDER }}><Settings2 size={14} /> Ayarlar</button>
          </>
        }
      />
      <IcPiyasaSekmeler />

      {okumaHatasi && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "#7F1D1D", backgroundColor: "rgba(127,29,29,0.15)", color: "#FCA5A5" }}>
          <span className="flex items-center gap-2"><AlertCircle size={16} /> Bildirimler okunamadı: {okumaHatasi}</span>
          <button onClick={getir} className="underline">Yeniden dene</button>
        </div>
      )}

      {(ayarAcik || !ayarVar) && (
        <div className="rounded-xl border p-4 mb-5" style={{ backgroundColor: CARD_BG, borderColor: ayarVar ? CARD_BORDER : "#92400E" }}>
          <h2 className="text-sm font-semibold text-white">Bildirim Ayarları</h2>
          <p className="text-xs mt-0.5 mb-3" style={{ color: ayarVar ? TEXT_MUTED : "#FBBF24" }}>
            {ayarVar ? "Çıkış onayı e-postaları lojistiğe, uyarılar yetkiliye gider." : "Lojistik e-posta adresi tanımlanmadan çıkış onayı e-postaları gönderilemez."}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Alan etiket="Lojistik sorumlusu"><input value={ayar.lojistik_ad} onChange={(e) => setAyar({ ...ayar, lojistik_ad: e.target.value })} placeholder="Süleyman Bey" className={inputSinif} style={inputStil} /></Alan>
            <Alan etiket="Lojistik e-posta *"><input value={ayar.lojistik_eposta} onChange={(e) => setAyar({ ...ayar, lojistik_eposta: e.target.value })} inputMode="email" placeholder="lojistik@unex.com.tr" className={inputSinif} style={inputStil} /></Alan>
            <Alan etiket="Lojistik telefon"><input value={ayar.lojistik_telefon} onChange={(e) => setAyar({ ...ayar, lojistik_telefon: e.target.value })} inputMode="tel" placeholder="0553 268 91 01" className={inputSinif} style={inputStil} /></Alan>
            <Alan etiket="Uyarılar · Alıcı"><input value={ayar.yetkili_eposta} onChange={(e) => setAyar({ ...ayar, yetkili_eposta: e.target.value })} inputMode="email" placeholder="execution@unex.com.tr" className={inputSinif} style={inputStil} /></Alan>
            <Alan etiket="Uyarılar · CC (virgülle)"><input value={ayar.yetkili_cc} onChange={(e) => setAyar({ ...ayar, yetkili_cc: e.target.value })} inputMode="email" placeholder="bbt@unex.com.tr" className={inputSinif} style={inputStil} /></Alan>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            {ayarVar && <button onClick={() => setAyarAcik(false)} className="px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Kapat</button>}
            <button onClick={ayarKaydet} disabled={ayarKaydediliyor} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:brightness-110 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
              {ayarKaydediliyor ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
            </button>
          </div>
        </div>
      )}

      <div className="inline-flex flex-wrap rounded-lg border p-0.5 mb-4" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
        {([["gonderilecek", `Gönderilecek (${gonderilecek.length})`], ["gonderilen", `Gönderilenler (${gonderilen.length})`], ["eposta", `Şirket içi e-postalar (${epostalar.length})${epostaSorunu ? " ⚠" : ""}`]] as [Sekme, string][]).map(([k, e]) => (
          <button key={k} onClick={() => setSekme(k)} className="px-3 py-1.5 rounded-md text-xs font-medium" style={sekme === k ? { backgroundColor: ACCENT, color: "white" } : { color: TEXT_MUTED }}>{e}</button>
        ))}
      </div>

      {sekme === "gonderilecek" && (
        gonderilecek.length === 0 ? (
          <Bos metin="Gönderilecek müşteri mesajı yok. İş emri açıldığında, araç yola çıktığında ve iş emri tamamlandığında mesajlar burada hazır olur." />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {gonderilecek.map((s) => {
              const tel = telefonu(s);
              const metin = metni(s);
              const m = s.ic_is_emirleri?.ic_musteriler;
              return (
                <div key={s.id} className="rounded-xl border flex flex-col" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                  <div className="px-4 pt-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{BILDIRIM_ETIKET[s.sablon] || s.sablon}</p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: TEXT_MUTED }}>{s.ic_is_emirleri?.is_emri_no || "-"} · {m?.unvan || s.alici_ad || "-"} · {tarihSaatYazi(s.olusturma)}</p>
                    </div>
                    <span className="text-[11px] whitespace-nowrap" style={{ color: TEXT_MUTED }}>{tel ? telefonYazi(tel) : ""}</span>
                  </div>
                  <pre className="mx-4 mt-3 rounded-lg p-3 text-[13px] leading-relaxed whitespace-pre-wrap break-words font-sans text-slate-200 max-h-64 overflow-y-auto" style={{ backgroundColor: "#0F131A" }}>{metin || "Mesaj metni oluşturulamadı (eksik bilgi)."}</pre>
                  {(!tel || (m && !m.whatsapp_izin)) && (
                    <div className="mx-4 mt-2 text-xs text-amber-400 flex items-start gap-1.5">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>{!tel ? "Müşteri kartında telefon yok. " : "Müşteri kartında WhatsApp izni işaretli değil. "}<Link href="/ic-piyasa/musteriler" className="underline">Müşteriler</Link></span>
                    </div>
                  )}
                  {s.ic_sevkler && !paylasilabilir && (
                    <p className="mx-4 mt-2 text-xs flex items-start gap-1.5" style={{ color: TEXT_MUTED }}>
                      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-sky-400" />
                      <span>İrsaliyeyi mesajla birlikte göndermek için: önce <b className="text-white">WhatsApp&apos;ta Gönder</b>, sonra <b className="text-white">İrsaliyeyi indir</b> ve PDF&apos;i sohbete sürükleyin. Telefonda ya da WhatsApp masaüstü uygulamasında tek dokunuşla &quot;Paylaş&quot; çıkar.</span>
                    </p>
                  )}
                  <div className="p-4 mt-auto">
                    {onayBekleyen === s.id ? (
                      <div className="rounded-lg border p-3" style={{ borderColor: "#065F46", backgroundColor: "rgba(16,185,129,0.08)" }}>
                        <p className="text-sm text-white mb-2">Mesajı WhatsApp&apos;ta gönderdiniz mi?</p>
                        <div className="flex flex-wrap gap-2">
                          <button disabled={isleniyor === s.id} onClick={() => isaretle(s, "gonderildi")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
                            {isleniyor === s.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Evet, gönderildi
                          </button>
                          <button onClick={() => setOnayBekleyen(null)} className="px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Hayır, sonra</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {s.ic_sevkler && paylasilabilir && (
                          <button disabled={!metin || dosyaIsleniyor === s.id} onClick={() => paylas(s)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40" style={{ backgroundColor: "#1FA855" }} title="Mesaj ve irsaliye PDF'i birlikte; WhatsApp'ta kişi veya grup seçin">
                            {dosyaIsleniyor === s.id ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />} Paylaş (mesaj + irsaliye)
                          </button>
                        )}
                        <button disabled={!tel || !metin} onClick={() => whatsappAc(s)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold hover:brightness-110 disabled:opacity-40 ${s.ic_sevkler && paylasilabilir ? "border text-white" : "text-white"}`} style={s.ic_sevkler && paylasilabilir ? { borderColor: CARD_BORDER } : { backgroundColor: "#1FA855" }}>
                          <MessageCircle size={15} /> WhatsApp&apos;ta Gönder
                        </button>
                        {s.ic_sevkler && (
                          <button disabled={dosyaIsleniyor === s.id} onClick={() => irsaliyeIndir(s)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm text-white hover:bg-white/5 disabled:opacity-40" style={{ borderColor: CARD_BORDER }}>
                            <Download size={14} /> İrsaliyeyi indir
                          </button>
                        )}
                        <button disabled={!metin} onClick={() => kopyala(s)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm text-white hover:bg-white/5 disabled:opacity-40" style={{ borderColor: CARD_BORDER }}>
                          {kopyalanan === s.id ? <Check size={14} /> : <Copy size={14} />} {kopyalanan === s.id ? "Kopyalandı" : "Metni kopyala"}
                        </button>
                        <button onClick={() => setAtlanacak(s)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                          <SkipForward size={14} /> Atla
                        </button>
                        {s.dugme_eki && (
                          <a href={`/takip/${s.dugme_eki}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                            <ExternalLink size={14} /> Takip sayfası
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {sekme === "gonderilen" && <Tablo satirlar={gonderilen} bos="Henüz gönderilen ya da atlanan mesaj yok." />}
      {sekme === "eposta" && <Tablo satirlar={epostalar} eposta bos="Henüz şirket içi e-posta yok. Kantar araç yükleyince lojistiğe çıkış onayı e-postası gider." />}

      <ConfirmDialog
        open={!!atlanacak}
        onOpenChange={(o) => !o && setAtlanacak(null)}
        title="Mesaj atlansın mı?"
        description={`"${atlanacak ? BILDIRIM_ETIKET[atlanacak.sablon] || atlanacak.sablon : ""}" mesajı gönderilmeden listeden kalkar (Gönderilenler sekmesinde "Atlandı" olarak görünür).`}
        confirmLabel="Atla"
        cancelLabel="Vazgeç"
        loading={!!atlanacak && isleniyor === atlanacak.id}
        onConfirm={() => atlanacak && isaretle(atlanacak, "atlandi")}
      />
    </AppShell>
  );
}

function Tablo({ satirlar, eposta, bos }: { satirlar: Satir[]; eposta?: boolean; bos: string }) {
  if (satirlar.length === 0) return <Bos metin={bos} />;
  return (
    <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr style={{ backgroundColor: "#0F131A" }}>
              {["Mesaj", "İş emri", eposta ? "Alıcı" : "Müşteri", "Oluşturma", "Durum", "İşlem"].map((b) => (
                <th key={b} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {satirlar.map((s) => (
              <tr key={s.id} className="border-t align-top" style={{ borderColor: CARD_BORDER }}>
                <td className="px-4 py-2.5 text-white">{eposta ? <span className="inline-flex items-center gap-1.5"><Mail size={13} style={{ color: TEXT_MUTED }} />{BILDIRIM_ETIKET[s.sablon] || s.sablon}</span> : BILDIRIM_ETIKET[s.sablon] || s.sablon}
                  {s.degerler?.[0] && eposta && <span className="block text-xs" style={{ color: TEXT_MUTED }}>{s.degerler[0]}</span>}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.ic_is_emirleri?.is_emri_no || "-"}</td>
                <td className="px-4 py-2.5 text-white">{eposta ? (s.hedef || <span className="text-red-400">tanımsız</span>) : s.ic_is_emirleri?.ic_musteriler?.unvan || s.alici_ad || "-"}</td>
                <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{tarihSaatYazi(s.olusturma)}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${DURUM_ROZET[s.durum].sinif}`}>{DURUM_ROZET[s.durum].etiket}</span>
                  {s.hata && <span className="block text-[11px] mt-1 text-red-400 max-w-[260px]">{s.hata}</span>}
                </td>
                <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>{s.islem_zamani ? `${tarihSaatYazi(s.islem_zamani)}${s.isleyen ? ` · ${s.isleyen}` : ""}` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Bos({ metin }: { metin: string }) {
  return (
    <div className="rounded-xl border px-4 py-12 text-center" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <Bell size={28} className="mx-auto mb-2" style={{ color: "#3A4152" }} />
      <p className="text-sm max-w-lg mx-auto" style={{ color: TEXT_MUTED }}>{metin}</p>
    </div>
  );
}

function Alan({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>{etiket}</span>
      {children}
    </label>
  );
}
