"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { IcPiyasaSekmeler, bildirimSayaciniYenile } from "@/components/ic-piyasa-sekmeler";
import { IcIsEmriForm } from "@/components/ic-is-emri-form";
import { IcSiparisFormuPenceresi } from "@/components/ic-siparis-formu-penceresi";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  ClipboardList, Plus, Loader2, AlertCircle, ChevronDown, ChevronRight, Pencil, CheckCircle2, XCircle,
  RotateCcw, Trash2, FileText, AlertTriangle, Truck, RefreshCw, Search, Link2, Clock, Copy, FileInput,
} from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import {
  DURUM_ETIKET, IC_BELGE_BUCKET, IcIsEmri, IcMusteri, IcSevk, IsEmriDurum,
  cikisEtiketi, hataMesaji, hedefTamam, hedefYazi, ilerlemeOrani, ilerlemeYazi, kgYazi, tarihSaatYazi, tlYazi, tutarHesapla,
} from "@/lib/ic-piyasa/is-emri";
import { fiyatYazi, kdvYazi, vadeYazi } from "@/lib/ic-piyasa/fiyat-formu";
import { NAKLIYE_ETIKET, SiparisEki, gunAyYil, ozellikleriOku } from "@/lib/ic-piyasa/siparis-formu";

/**
 * Ic Piyasa - Is Emirleri (12.10.2026).
 * Yetkili (Volkan) Burak Bey'in talimatiyla is emri acar; kantarci Kantar
 * Paneli > Yurt Ici'nden her arac icin irsaliye yukler. Burada ilerleme,
 * araclar, irsaliyeler ve tutar (net kg x birim fiyat) gorulur.
 * 21.10.2026: "Sipariş Formundan Aç" - musteriyle imzalanan sipariş formu
 * okunur, is emri bu bilgilerle hazirlanir ve form is emrine eklenir.
 */

type Filtre = "acik" | "tamamlandi" | "iptal" | "tumu";
type EmirSatiri = IcIsEmri & { ic_musteriler: { unvan: string; kisa_ad: string | null } | null };

const DURUM_RENK: Record<IsEmriDurum, string> = {
  acik: "bg-sky-500/15 text-sky-400",
  tamamlandi: "bg-emerald-500/15 text-emerald-400",
  iptal: "bg-slate-500/15 text-slate-400",
};

export default function IsEmirleriPage() {
  const { companyId, yetkiler, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const yetkili = !!yetkiler.sayfa_yetkileri.ic_piyasa;

  const [emirler, setEmirler] = useState<EmirSatiri[]>([]);
  const [sevkler, setSevkler] = useState<IcSevk[]>([]);
  const [musteriler, setMusteriler] = useState<IcMusteri[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>("acik");
  const [arama, setArama] = useState("");
  const [acikDetay, setAcikDetay] = useState<string | null>(null);

  const [formAcik, setFormAcik] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState<IcIsEmri | null>(null);
  const [siparisPencere, setSiparisPencere] = useState(false);
  const [onDolum, setOnDolum] = useState<{ musteriId: string; ek: SiparisEki } | null>(null);
  const [durumIslem, setDurumIslem] = useState<{ emir: EmirSatiri; hedef: IsEmriDurum | "sil" | "tamamen_sil" } | null>(null);
  // Yetkili ekranindan cikis isleme (lojistik baglantisina alternatif)
  const [cikisDuzen, setCikisDuzen] = useState<{ sevk: IcSevk; mod: "secim" | "saat" } | null>(null);
  const [cikisSaat, setCikisSaat] = useState("");
  const [silinecekSevk, setSilinecekSevk] = useState<IcSevk | null>(null);
  const [isleniyor, setIsleniyor] = useState(false);

  const getir = useCallback(async () => {
    if (!companyId) return;
    setOkumaHatasi(null);
    const [eRes, mRes] = await Promise.all([
      supabase.from("ic_is_emirleri").select("*, ic_musteriler(unvan, kisa_ad)").eq("company_id", companyId).order("olusturma", { ascending: false }).limit(300),
      supabase.from("ic_musteriler").select("*").eq("company_id", companyId).order("unvan"),
    ]);
    if (eRes.error || mRes.error) { setOkumaHatasi((eRes.error || mRes.error)!.message); setYukleniyor(false); return; }
    const e = (eRes.data || []) as EmirSatiri[];
    let s: IcSevk[] = [];
    if (e.length) {
      const sRes = await supabase.from("ic_sevkler").select("*").eq("company_id", companyId).in("is_emri_id", e.map((x) => x.id)).order("olusturma");
      if (sRes.error) { setOkumaHatasi(sRes.error.message); setYukleniyor(false); return; }
      s = (sRes.data || []) as IcSevk[];
    }
    setEmirler(e);
    setSevkler(s);
    setMusteriler((mRes.data || []) as IcMusteri[]);
    setYukleniyor(false);
    bildirimSayaciniYenile();
  }, [companyId]);

  useEffect(() => {
    if (authLoading || !yetkili) return;
    getir();
  }, [authLoading, yetkili, getir]);

  // Kantarci sevk girdikce ilerleme guncel kalsin (sayfa acikken dakikada bir)
  useEffect(() => {
    if (!yetkili) return;
    const z = window.setInterval(() => { if (document.visibilityState === "visible") getir(); }, 60_000);
    return () => window.clearInterval(z);
  }, [yetkili, getir]);

  const sevkMap = useMemo(() => {
    const m = new Map<string, IcSevk[]>();
    sevkler.forEach((s) => m.set(s.is_emri_id, [...(m.get(s.is_emri_id) || []), s]));
    return m;
  }, [sevkler]);

  const sayilar = useMemo(() => ({
    acik: emirler.filter((e) => e.durum === "acik").length,
    tamamlandi: emirler.filter((e) => e.durum === "tamamlandi").length,
    iptal: emirler.filter((e) => e.durum === "iptal").length,
    tumu: emirler.length,
  }), [emirler]);

  const liste = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    return emirler.filter((e) =>
      (filtre === "tumu" || e.durum === filtre) &&
      (!q || [e.is_emri_no, e.urun, e.ic_musteriler?.unvan, e.ic_musteriler?.kisa_ad, ...(sevkMap.get(e.id) || []).flatMap((s) => [s.plaka, s.irsaliye_no])]
        .some((v) => (v || "").toLocaleLowerCase("tr").includes(q)))
    );
  }, [emirler, filtre, arama, sevkMap]);

  // Bugun yuklenen (tum is emirleri)
  const bugunTR = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  const bugunSevkler = sevkler.filter((s) => new Date(s.olusturma).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }) === bugunTR);
  const uyariliSayi = sevkler.filter((s) => s.uyarilar?.length && emirler.find((e) => e.id === s.is_emri_id)?.durum === "acik").length;

  const irsaliyeAc = async (yol: string, ad = "İrsaliye") => {
    const pencere = window.open("", "_blank");
    const { data, error } = await supabase.storage.from(IC_BELGE_BUCKET).createSignedUrl(yol, 60 * 10);
    if (error || !data?.signedUrl) { pencere?.close(); showToast(`${ad} açılamadı: ${error?.message || "bilinmeyen hata"}`, "error"); return; }
    if (pencere) pencere.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  };

  const durumUygula = async () => {
    if (!durumIslem || !companyId) return;
    const { emir, hedef } = durumIslem;
    setIsleniyor(true);
    if (hedef === "tamamen_sil") {
      // Dogru sira: once kayitlar (tek islem, sunucuda), SADECE basariliysa PDF'ler
      const { data: yollar, error } = await supabase.rpc("ic_is_emri_tamamen_sil", { p_id: emir.id });
      if (error) { setIsleniyor(false); showToast(hataMesaji(error), "error"); return; }
      const liste = (yollar as string[] | null) || [];
      if (liste.length) {
        const { error: dHata } = await supabase.storage.from(IC_BELGE_BUCKET).remove(liste);
        if (dHata) console.error("İrsaliye / sipariş formu dosyaları silinemedi:", dHata.message);
      }
      setIsleniyor(false);
      showToast(`${emir.is_emri_no} araç kayıtları ve irsaliyeleriyle silindi.`, "success");
      setDurumIslem(null);
      getir();
      return;
    }
    const sonuc = hedef === "sil"
      ? await supabase.from("ic_is_emirleri").delete().eq("id", emir.id).eq("company_id", companyId).select("id")
      : await supabase.from("ic_is_emirleri").update({ durum: hedef }).eq("id", emir.id).eq("company_id", companyId).select("id");
    setIsleniyor(false);
    const hata = yazmaHatasi(sonuc.error, sonuc.data);
    if (hata) { showToast(hataMesaji({ message: hata }), "error"); return; }
    // Kayit silindiyse sipariş formu PDF'i de silinir (once kayit, sonra dosya)
    if (hedef === "sil" && emir.siparis_formu_yolu) {
      const { error: dHata } = await supabase.storage.from(IC_BELGE_BUCKET).remove([emir.siparis_formu_yolu]);
      if (dHata) console.error("Sipariş formu silinemedi:", dHata.message);
    }
    showToast(hedef === "sil" ? `${emir.is_emri_no} silindi.` : `${emir.is_emri_no}: ${DURUM_ETIKET[hedef as IsEmriDurum]}.`, "success");
    setDurumIslem(null);
    getir();
  };

  const cikisIsle = async (sevk: IcSevk, islem: "cikti" | "planla" | "bugun_degil") => {
    let saat: string | null = null;
    if (islem === "planla") {
      const m = cikisSaat.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) { showToast("Saati SS:DD biçiminde girin.", "error"); return; }
      const bugun = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
      let t = Date.parse(`${bugun}T${m[1].padStart(2, "0")}:${m[2]}:00+03:00`);
      if (t < Date.now() - 5 * 60 * 1000) t += 24 * 60 * 60 * 1000;
      saat = new Date(t).toISOString();
    }
    setIsleniyor(true);
    const { error } = await supabase.rpc("ic_cikis_isle_yetkili", { p_sevk: sevk.id, p_islem: islem, p_saat: saat });
    setIsleniyor(false);
    if (error) { showToast(hataMesaji(error), "error"); return; }
    showToast(islem === "cikti" ? `${sevk.plaka} yola çıktı; müşteri mesajı Bildirimler'e hazırlandı.` : islem === "planla" ? `${sevk.plaka} çıkışı planlandı.` : `${sevk.plaka}: bugün çıkmayacak.`, "success");
    setCikisDuzen(null);
    getir();
  };

  const takipKopyala = async (token: string) => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/takip/${token}`); showToast("Takip bağlantısı kopyalandı.", "success"); }
    catch { showToast("Kopyalanamadı.", "error"); }
  };

  const sevkSil = async () => {
    if (!silinecekSevk || !companyId) return;
    setIsleniyor(true);
    // Dogru sira: once kayit, SADECE basariliysa dosya (CLAUDE.md kurali)
    const { data, error } = await supabase.from("ic_sevkler").delete().eq("id", silinecekSevk.id).eq("company_id", companyId).select("id");
    const hata = yazmaHatasi(error, data);
    if (hata) { setIsleniyor(false); showToast(`Silinemedi: ${hataMesaji({ message: hata })}`, "error"); return; }
    const { error: dosyaHata } = await supabase.storage.from(IC_BELGE_BUCKET).remove([silinecekSevk.irsaliye_dosya_yolu]);
    if (dosyaHata) console.error("İrsaliye dosyası silinemedi:", dosyaHata.message);
    setIsleniyor(false);
    showToast(`${silinecekSevk.plaka} sevki silindi.`, "success");
    setSilinecekSevk(null);
    getir();
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
        ikon={<ClipboardList size={20} />}
        baslik="İç Piyasa · İş Emirleri"
        aciklama="Müşteriyle imzalanan sipariş formundan iş emri açın; kantarcı her araç için irsaliyeyi Kantar Paneli › Yurt İçi'nden yükler. Plaka ve net kg irsaliyeden okunur."
        sag={
          <>
            <button onClick={getir} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} title="Yenile">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => { setDuzenlenen(null); setOnDolum(null); setFormAcik(true); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm text-white hover:bg-white/5" style={{ borderColor: CARD_BORDER }}>
              <Plus size={14} /> Yeni İş Emri
            </button>
            <button onClick={() => setSiparisPencere(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white hover:brightness-110" style={{ backgroundColor: ACCENT }}>
              <FileInput size={14} /> Sipariş Formundan Aç
            </button>
          </>
        }
      />
      <IcPiyasaSekmeler />

      {okumaHatasi && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "#7F1D1D", backgroundColor: "rgba(127,29,29,0.15)", color: "#FCA5A5" }}>
          <span className="flex items-center gap-2"><AlertCircle size={16} /> Veriler okunamadı: {okumaHatasi}</span>
          <button onClick={getir} className="underline">Yeniden dene</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Ozet baslik="Açık İş Emri" deger={String(sayilar.acik)} renk="text-sky-400" />
        <Ozet baslik="Bugün Yüklenen" deger={`${bugunSevkler.length} araç`} alt={kgYazi(bugunSevkler.reduce((t, s) => t + Number(s.net_kg), 0))} renk="text-white" />
        <Ozet baslik="Açık Emirlerde Yüklenen" deger={kgYazi(sevkler.filter((s) => emirler.find((e) => e.id === s.is_emri_id)?.durum === "acik").reduce((t, s) => t + Number(s.net_kg), 0))} renk="text-white" />
        <Ozet baslik="Kontrol Bekleyen Uyarı" deger={String(uyariliSayi)} renk={uyariliSayi ? "text-amber-400" : "text-emerald-400"} />
      </div>

      <div className="rounded-xl border shadow-sm" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
          <div className="inline-flex flex-wrap rounded-lg border p-0.5" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
            {(["acik", "tamamlandi", "iptal", "tumu"] as Filtre[]).map((f) => (
              <button key={f} onClick={() => setFiltre(f)} className="px-3 py-1.5 rounded-md text-xs font-medium"
                style={filtre === f ? { backgroundColor: ACCENT, color: "white" } : { color: TEXT_MUTED }}>
                {f === "tumu" ? "Tümü" : DURUM_ETIKET[f]} ({sayilar[f]})
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: TEXT_MUTED }} />
            <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="İş emri no, müşteri, ürün, plaka veya irsaliye no..." className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
          </div>
        </div>

        {liste.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <ClipboardList size={30} className="mx-auto mb-2" style={{ color: "#3A4152" }} />
            <p className="text-sm" style={{ color: TEXT_MUTED }}>{emirler.length === 0 ? "Henüz iş emri yok." : "Bu filtrede iş emri yok."}</p>
          </div>
        ) : (
          <ul>
            {liste.map((e) => {
              const ss = sevkMap.get(e.id) || [];
              const kg = ss.reduce((t, s) => t + Number(s.net_kg), 0);
              const oran = ilerlemeOrani(e, kg, ss.length);
              const tamam = hedefTamam(e, kg, ss.length);
              const acik = acikDetay === e.id;
              const tutar = tutarHesapla(kg, e.birim_fiyat === null ? null : Number(e.birim_fiyat));
              const uyari = ss.some((s) => s.uyarilar?.length);
              return (
                <li key={e.id} className="border-t first:border-t-0" style={{ borderColor: CARD_BORDER }}>
                  <button onClick={() => setAcikDetay(acik ? null : e.id)} className="w-full text-left px-4 py-3 hover:bg-white/[0.02] grid grid-cols-[auto_1fr] md:grid-cols-[auto_minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1.6fr)] gap-x-4 gap-y-2 items-center" aria-expanded={acik}>
                    <span style={{ color: TEXT_MUTED }}>{acik ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-white">{e.is_emri_no}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${DURUM_RENK[e.durum]}`}>{DURUM_ETIKET[e.durum]}</span>
                        {uyari && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-400"><AlertTriangle size={10} /> Uyarı</span>}
                      </div>
                      <p className="text-sm text-white truncate mt-0.5" title={e.ic_musteriler?.unvan}>{e.ic_musteriler?.kisa_ad || e.ic_musteriler?.unvan || "-"}</p>
                    </div>
                    <div className="col-start-2 md:col-start-auto min-w-0">
                      <p className="text-sm text-white">{e.urun} <span style={{ color: TEXT_MUTED }}>{e.ambalaj || ""}</span></p>
                      <p className="text-xs" style={{ color: TEXT_MUTED }}>{e.birim_fiyat !== null ? `${fiyatYazi(Number(e.birim_fiyat))} TL/kg · ${kdvYazi(e.kdv_dahil)}` : "Fiyat yok"} · {e.teslim || "-"}</p>
                    </div>
                    <div className="col-start-2 md:col-start-auto min-w-0">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-white">{ilerlemeYazi(e, kg, ss.length)}</span>
                        <span className={tamam ? "text-emerald-400" : ""} style={tamam ? undefined : { color: TEXT_MUTED }}>Hedef: {hedefYazi(e)}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#0F131A" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(oran * 100))}%`, backgroundColor: tamam ? "#10B981" : "#38BDF8" }} />
                      </div>
                    </div>
                  </button>

                  {acik && (
                    <div className="px-4 pb-4 md:pl-12">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs rounded-lg border p-3 mb-3" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
                        <Bilgi etiket="Müşteri" deger={e.ic_musteriler?.unvan || "-"} genis />
                        <Bilgi etiket="Fiyat formu" deger={e.fiyat_formu_no || "Elle girildi"} />
                        <Bilgi etiket="Vade / Ödeme" deger={`${e.vade_gun !== null ? vadeYazi(e.vade_gun) : "-"} · ${e.odeme || "-"}`} />
                        <Bilgi etiket="Talimat" deger={e.talimat_veren || "-"} />
                        <Bilgi etiket="Müşteri sipariş no" deger={e.musteri_siparis_no || "-"} />
                        {(e.siparis_tarihi || e.siparis_formu_yolu) && <Bilgi etiket="Sipariş formu tarihi" deger={gunAyYil(e.siparis_tarihi)} />}
                        {(e.nakliye || e.teslim_suresi_gun !== null) && <Bilgi etiket="Nakliye / Teslim süresi" deger={`${e.nakliye ? NAKLIYE_ETIKET[e.nakliye] : "-"} · ${e.teslim_suresi_gun !== null ? `${e.teslim_suresi_gun} gün` : "-"}`} />}
                        {ozellikleriOku(e.urun_ozellikleri).length > 0 && <Bilgi etiket="Ürün özellikleri" deger={ozellikleriOku(e.urun_ozellikleri).map((x) => `${x.ad}: ${x.deger}`).join(" · ")} genis />}
                        <Bilgi etiket="Açılış" deger={`${tarihSaatYazi(e.olusturma)}${e.olusturan_email ? ` · ${e.olusturan_email}` : ""}`} genis />
                        {e.teslim_adresi && <Bilgi etiket="Teslim adresi" deger={e.teslim_adresi} genis />}
                        {e.notlar && <Bilgi etiket="Not" deger={e.notlar} genis />}
                        <Bilgi etiket="Yüklenen tutar" deger={tutar !== null ? `${tlYazi(tutar)} ${e.kdv_dahil ? "(KDV dahil)" : "+ KDV"}` : "-"} vurgu />
                        <div className="col-span-2 flex flex-wrap items-end gap-2">
                          {e.siparis_formu_yolu && (
                            <button onClick={() => irsaliyeAc(e.siparis_formu_yolu as string, "Sipariş formu")} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs text-emerald-400 hover:bg-emerald-500/10" style={{ borderColor: CARD_BORDER }} title={e.siparis_formu_adi || "Sipariş formu"}><FileText size={12} /> Sipariş formu</button>
                          )}
                          <a href={`/takip/${e.takip_token}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs text-white hover:bg-white/5" style={{ borderColor: CARD_BORDER }}><Link2 size={12} /> Müşteri takip sayfası</a>
                          <button onClick={() => takipKopyala(e.takip_token)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}><Copy size={12} /> Bağlantıyı kopyala</button>
                        </div>
                      </div>

                      {ss.length === 0 ? (
                        <p className="text-xs py-3 flex items-center gap-2" style={{ color: TEXT_MUTED }}><Truck size={14} /> Henüz araç yüklenmedi. Kantarcı irsaliyeyi yükleyince burada görünür.</p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: CARD_BORDER }}>
                          <table className="w-full text-xs min-w-[980px]">
                            <thead>
                              <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                                {["#", "Yükleme", "Plaka / Dorse", "Şoför", "Net", "İrsaliye", "Çıkış", "Tutar", ""].map((b, i) => (
                                  <th key={i} className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${b === "Net" || b === "Tutar" ? "text-right" : "text-left"}`} style={{ color: TEXT_MUTED }}>{b}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {ss.map((s, i) => (
                                <React.Fragment key={s.id}>
                                  <tr className="border-t" style={{ borderColor: CARD_BORDER }}>
                                    <td className="px-3 py-2" style={{ color: TEXT_MUTED }}>{i + 1}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-white">{tarihSaatYazi(s.olusturma)}<span className="block text-[10px]" style={{ color: TEXT_MUTED }}>{s.girilen_email || ""}</span></td>
                                    <td className="px-3 py-2 whitespace-nowrap"><span className="font-bold text-white">{s.plaka}</span>{s.dorse_plaka && <span className="block text-[10px]" style={{ color: TEXT_MUTED }}>Dorse: {s.dorse_plaka}</span>}</td>
                                    <td className="px-3 py-2 text-white">{s.sofor_ad || "-"}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-white whitespace-nowrap">{kgYazi(Number(s.net_kg))}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                      <button onClick={() => irsaliyeAc(s.irsaliye_dosya_yolu)} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20">
                                        <FileText size={11} /> {s.irsaliye_no || "Gör"}
                                      </button>
                                      {s.irsaliye_tarihi && <span className="block text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{tarihSaatYazi(s.irsaliye_tarihi)}</span>}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                      <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cikisEtiketi(s).sinif}`}>{cikisEtiketi(s).metin}</span>
                                      {s.cikis_isleyen && <span className="block text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{s.cikis_isleyen}</span>}
                                      {s.cikis_durumu !== "cikti" && e.durum !== "iptal" && (
                                        cikisDuzen?.sevk.id === s.id ? (
                                          cikisDuzen.mod === "saat" ? (
                                            <span className="mt-1 flex items-center gap-1">
                                              <input type="time" value={cikisSaat} onChange={(ev) => setCikisSaat(ev.target.value)} className="px-1.5 py-1 rounded border text-xs text-white" style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} aria-label="Çıkış saati" />
                                              <button disabled={isleniyor} onClick={() => cikisIsle(s, "planla")} className="px-2 py-1 rounded text-[10px] font-bold text-white" style={{ backgroundColor: ACCENT }}>Kaydet</button>
                                              <button onClick={() => setCikisDuzen(null)} className="px-1.5 py-1 rounded text-[10px]" style={{ color: TEXT_MUTED }}>Vazgeç</button>
                                            </span>
                                          ) : (
                                            <span className="mt-1 flex flex-wrap items-center gap-1">
                                              <button disabled={isleniyor} onClick={() => cikisIsle(s, "cikti")} className="px-2 py-1 rounded text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-500">Çıktı</button>
                                              <button onClick={() => { setCikisSaat(new Date(Date.now() + 3600e3).toLocaleTimeString("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" })); setCikisDuzen({ sevk: s, mod: "saat" }); }} className="px-2 py-1 rounded border text-[10px] text-white" style={{ borderColor: CARD_BORDER }}><Clock size={10} className="inline mr-0.5" />Saat</button>
                                              <button disabled={isleniyor} onClick={() => cikisIsle(s, "bugun_degil")} className="px-2 py-1 rounded border text-[10px]" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Bugün değil</button>
                                              <button onClick={() => setCikisDuzen(null)} className="px-1 py-1 text-[10px]" style={{ color: TEXT_MUTED }}>×</button>
                                            </span>
                                          )
                                        ) : (
                                          <button onClick={() => setCikisDuzen({ sevk: s, mod: "secim" })} className="block mt-1 text-[10px] underline" style={{ color: TEXT_MUTED }}>Çıkışı işle</button>
                                        )
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: TEXT_MUTED }}>{tlYazi(tutarHesapla(Number(s.net_kg), e.birim_fiyat === null ? null : Number(e.birim_fiyat)))}</td>
                                    <td className="px-3 py-2 text-right">
                                      <button onClick={() => setSilinecekSevk(s)} title="Sevki sil (hatalı giriş)" className="p-1 rounded hover:bg-red-500/10 text-red-400"><Trash2 size={13} /></button>
                                    </td>
                                  </tr>
                                  {s.uyarilar?.length > 0 && (
                                    <tr>
                                      <td />
                                      <td colSpan={8} className="px-3 pb-2">
                                        {s.uyarilar.map((u) => <p key={u} className="flex items-center gap-1.5 text-[11px] text-amber-400"><AlertTriangle size={11} /> {u}</p>)}
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 mt-3">
                        {e.durum === "acik" && (
                          <>
                            <Eylem onClick={() => { setOnDolum(null); setDuzenlenen(e); setFormAcik(true); }} ikon={<Pencil size={13} />}>Düzenle</Eylem>
                            <Eylem onClick={() => setDurumIslem({ emir: e, hedef: "tamamlandi" })} ikon={<CheckCircle2 size={13} />} vurgu={tamam}>Tamamlandı olarak kapat</Eylem>
                            <Eylem onClick={() => setDurumIslem({ emir: e, hedef: "iptal" })} ikon={<XCircle size={13} />}>İptal et</Eylem>
                          </>
                        )}
                        {e.durum !== "acik" && <Eylem onClick={() => setDurumIslem({ emir: e, hedef: "acik" })} ikon={<RotateCcw size={13} />}>Yeniden aç</Eylem>}
                        {ss.length === 0 && <Eylem onClick={() => setDurumIslem({ emir: e, hedef: "sil" })} ikon={<Trash2 size={13} />} tehlike>Sil</Eylem>}
                        {ss.length > 0 && e.durum === "iptal" && <Eylem onClick={() => setDurumIslem({ emir: e, hedef: "tamamen_sil" })} ikon={<Trash2 size={13} />} tehlike>Araç kayıtlarıyla tamamen sil</Eylem>}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <IcIsEmriForm
        acik={formAcik}
        kapat={() => { setFormAcik(false); setOnDolum(null); }}
        kaydedildi={() => { setFormAcik(false); setOnDolum(null); getir(); }}
        musteriler={musteriler}
        duzenlenen={duzenlenen}
        sevkVar={!!duzenlenen && (sevkMap.get(duzenlenen.id)?.length ?? 0) > 0}
        onDolum={duzenlenen ? null : onDolum}
      />

      <IcSiparisFormuPenceresi
        acik={siparisPencere}
        kapat={() => setSiparisPencere(false)}
        musteriler={musteriler}
        musterilerDegisti={getir}
        devam={(musteriId, ek) => { setSiparisPencere(false); setDuzenlenen(null); setOnDolum({ musteriId, ek }); setFormAcik(true); }}
      />

      <ConfirmDialog
        open={!!durumIslem}
        onOpenChange={(o) => !o && setDurumIslem(null)}
        title={
          durumIslem?.hedef === "tamamen_sil" ? `${durumIslem.emir.is_emri_no} tamamen silinsin mi?`
          : durumIslem?.hedef === "sil" ? `${durumIslem.emir.is_emri_no} silinsin mi?`
          : durumIslem?.hedef === "tamamlandi" ? `${durumIslem.emir.is_emri_no} kapatılsın mı?`
          : durumIslem?.hedef === "iptal" ? `${durumIslem.emir.is_emri_no} iptal edilsin mi?`
          : `${durumIslem?.emir.is_emri_no || ""} yeniden açılsın mı?`
        }
        description={
          durumIslem?.hedef === "tamamen_sil" ? `İptal edilmiş iş emri, ${(sevkMap.get(durumIslem.emir.id) || []).length} araç kaydı, irsaliye PDF'leri ve bildirimleriyle kalıcı olarak silinir. Geri alınamaz.`
          : durumIslem?.hedef === "sil" ? "Sevk girilmemiş iş emri kalıcı olarak silinir."
          : durumIslem?.hedef === "tamamlandi" ? "İş emri tamamlandı olarak kapanır ve Kantar Panelinden kalkar. Gerekirse yeniden açabilirsiniz."
          : durumIslem?.hedef === "iptal" ? "İş emri iptal edilir ve Kantar Panelinden kalkar. Girilmiş sevkler kayıtlı kalır."
          : "İş emri tekrar açık olur ve Kantar Panelinde görünür."
        }
        confirmLabel={durumIslem?.hedef === "sil" || durumIslem?.hedef === "tamamen_sil" ? "Sil" : "Onayla"}
        cancelLabel="Vazgeç"
        destructive={durumIslem?.hedef === "sil" || durumIslem?.hedef === "tamamen_sil" || durumIslem?.hedef === "iptal"}
        loading={isleniyor}
        onConfirm={durumUygula}
      />
      <ConfirmDialog
        open={!!silinecekSevk}
        onOpenChange={(o) => !o && setSilinecekSevk(null)}
        title="Sevk silinsin mi?"
        description={`${silinecekSevk?.plaka || ""} · ${kgYazi(silinecekSevk ? Number(silinecekSevk.net_kg) : null)} · ${silinecekSevk?.irsaliye_no || ""} kaydı ve irsaliye PDF'i silinir. Sadece hatalı girişleri silin.`}
        confirmLabel="Sil"
        cancelLabel="Vazgeç"
        destructive
        loading={isleniyor}
        onConfirm={sevkSil}
      />
    </AppShell>
  );
}

function Ozet({ baslik, deger, alt, renk }: { baslik: string; deger: string; alt?: string; renk: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>{baslik}</p>
      <p className={`text-xl font-bold mt-1 ${renk}`}>{deger}</p>
      {alt && <p className="text-xs" style={{ color: TEXT_MUTED }}>{alt}</p>}
    </div>
  );
}

function Bilgi({ etiket, deger, genis, vurgu }: { etiket: string; deger: string; genis?: boolean; vurgu?: boolean }) {
  return (
    <div className={genis ? "col-span-2" : ""}>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: TEXT_MUTED }}>{etiket}</p>
      <p className={`mt-0.5 ${vurgu ? "text-sm font-bold text-emerald-400" : "text-white"}`}>{deger}</p>
    </div>
  );
}

function Eylem({ onClick, ikon, children, vurgu, tehlike }: { onClick: () => void; ikon: React.ReactNode; children: React.ReactNode; vurgu?: boolean; tehlike?: boolean }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium hover:bg-white/5 ${tehlike ? "text-red-400" : "text-white"}`}
      style={vurgu ? { backgroundColor: ACCENT, borderColor: ACCENT } : { borderColor: CARD_BORDER }}>
      {ikon} {children}
    </button>
  );
}
