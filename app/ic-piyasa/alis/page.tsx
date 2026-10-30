"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { IcPiyasaSekmeler } from "@/components/ic-piyasa-sekmeler";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { IcAlisSiparisForm } from "@/components/ic-alis-siparis-form";
import { IcAlisGecmisTeslimPenceresi, GecmisAlis } from "@/components/ic-alis-gecmis-teslim-penceresi";
import {
  PackageOpen, Plus, Loader2, AlertCircle, ChevronDown, ChevronRight, Pencil, CheckCircle2, XCircle, RotateCcw, Trash2,
  FileText, AlertTriangle, Truck, RefreshCw, Search, History, Building2, Save, X, Link2,
} from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { IC_BELGE_BUCKET, kgYazi, tonYazi, tarihSaatYazi, telefonNormallestir, telefonYazi } from "@/lib/ic-piyasa/is-emri";
import {
  ALIS_DURUM_ETIKET, ALIS_TESLIM_ETIKET, AlisDurum, IcAlisSiparisi, IcAlisTeslim, IcTedarikci,
  alisFiyatYazi, alisHataMesaji, alisIlerleme, alisKapatmayaHazir, alisTutarYazi, alisUrunYazi, bugunTRIso, gunTR,
} from "@/lib/ic-piyasa/alis";
import { vadeYazi } from "@/lib/ic-piyasa/fiyat-formu";

/**
 * Ic Piyasa - ALIS (30.10.2026). Lojistik Excel'inin ALIS SIPARIS RAPORU'nun
 * sistemdeki karsiligi: alis siparisleri (AS-YYYY-NNNN), teslim alinan araclar
 * (kantarci Kantar Paneli > Gelen Arac'tan girer), tedarikci kartlari.
 * Yetki: "ic_alis" (alis fiyatlari bu sayfada).
 */

type Filtre = AlisDurum | "tumu";
type Gorunum = "siparisler" | "tedarikciler";
type SiparisSatiri = IcAlisSiparisi & { ic_tedarikciler: { unvan: string; kisa_ad: string | null } | null };

const DURUM_RENK: Record<AlisDurum, string> = {
  acik: "bg-sky-500/15 text-sky-400",
  tamamlandi: "bg-emerald-500/15 text-emerald-400",
  iptal: "bg-slate-500/15 text-slate-400",
};

const tedarikciAdi = (s: SiparisSatiri) => s.ic_tedarikciler?.unvan || "-";

export default function AlisPage() {
  const { companyId, yetkiler, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const yetkili = !!yetkiler.sayfa_yetkileri.ic_alis;
  const satisYetkisi = !!yetkiler.sayfa_yetkileri.ic_piyasa;

  const [siparisler, setSiparisler] = useState<SiparisSatiri[]>([]);
  const [teslimler, setTeslimler] = useState<IcAlisTeslim[]>([]);
  const [tedarikciler, setTedarikciler] = useState<IcTedarikci[]>([]);
  // Dogrudan sevkte satis is emri no (yalniz satis yetkisi varsa okunur)
  const [sevkIsEmri, setSevkIsEmri] = useState<Record<string, string>>({});
  const [yukleniyor, setYukleniyor] = useState(true);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [gorunum, setGorunum] = useState<Gorunum>("siparisler");
  const [filtre, setFiltre] = useState<Filtre>("acik");
  const [arama, setArama] = useState("");
  const [acikDetay, setAcikDetay] = useState<string | null>(null);

  const [formAcik, setFormAcik] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState<IcAlisSiparisi | null>(null);
  const [gecmisAlis, setGecmisAlis] = useState<GecmisAlis | null>(null);
  const [durumIslem, setDurumIslem] = useState<{ s: SiparisSatiri; hedef: AlisDurum | "sil" } | null>(null);
  const [silinecekTeslim, setSilinecekTeslim] = useState<IcAlisTeslim | null>(null);
  const [isleniyor, setIsleniyor] = useState(false);

  const getir = useCallback(async () => {
    if (!companyId) return;
    setOkumaHatasi(null);
    const [sRes, tRes] = await Promise.all([
      supabase.from("ic_alis_siparisleri").select("*, ic_tedarikciler(unvan, kisa_ad)").eq("company_id", companyId).order("siparis_tarihi", { ascending: false }).order("olusturma", { ascending: false }).limit(500),
      supabase.from("ic_tedarikciler").select("*").eq("company_id", companyId).order("unvan"),
    ]);
    if (sRes.error || tRes.error) { setOkumaHatasi((sRes.error || tRes.error)!.message); setYukleniyor(false); return; }
    const s = (sRes.data || []) as SiparisSatiri[];
    let t: IcAlisTeslim[] = [];
    if (s.length) {
      const r = await supabase.from("ic_alis_teslimler").select("*").eq("company_id", companyId).in("alis_id", s.map((x) => x.id)).order("teslim_zamani");
      if (r.error) { setOkumaHatasi(r.error.message); setYukleniyor(false); return; }
      t = (r.data || []) as IcAlisTeslim[];
    }
    const sevkIdler = t.map((x) => x.sevk_id).filter(Boolean) as string[];
    if (satisYetkisi && sevkIdler.length) {
      const v = await supabase.from("ic_sevkler").select("id, ic_is_emirleri(is_emri_no)").in("id", sevkIdler);
      const m: Record<string, string> = {};
      ((v.data || []) as unknown as { id: string; ic_is_emirleri: { is_emri_no: string } | null }[]).forEach((x) => { if (x.ic_is_emirleri) m[x.id] = x.ic_is_emirleri.is_emri_no; });
      setSevkIsEmri(m);
    } else {
      setSevkIsEmri({});
    }
    setSiparisler(s);
    setTeslimler(t);
    setTedarikciler((tRes.data || []) as IcTedarikci[]);
    setYukleniyor(false);
  }, [companyId, satisYetkisi]);

  useEffect(() => {
    if (authLoading || !yetkili) return;
    getir();
  }, [authLoading, yetkili, getir]);

  // Kantarci arac girdikce ilerleme guncel kalsin
  useEffect(() => {
    if (!yetkili) return;
    const z = window.setInterval(() => { if (document.visibilityState === "visible") getir(); }, 60_000);
    return () => window.clearInterval(z);
  }, [yetkili, getir]);

  const teslimMap = useMemo(() => {
    const m = new Map<string, IcAlisTeslim[]>();
    teslimler.forEach((t) => m.set(t.alis_id, [...(m.get(t.alis_id) || []), t]));
    return m;
  }, [teslimler]);
  const alinan = useCallback((id: string) => (teslimMap.get(id) || []).reduce((t, x) => t + Number(x.net_kg), 0), [teslimMap]);
  const aracSayisi = useCallback((id: string) => (teslimMap.get(id) || []).filter((x) => !x.gecmis).length, [teslimMap]);

  const sayilar = useMemo(() => ({
    acik: siparisler.filter((s) => s.durum === "acik").length,
    tamamlandi: siparisler.filter((s) => s.durum === "tamamlandi").length,
    iptal: siparisler.filter((s) => s.durum === "iptal").length,
    tumu: siparisler.length,
  }), [siparisler]);

  const liste = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    return siparisler.filter((s) =>
      (filtre === "tumu" || s.durum === filtre) &&
      (!q || [s.alis_no, s.urun, s.urun_kodu, s.depo, s.tedarikci_siparis_no, tedarikciAdi(s), s.ic_tedarikciler?.kisa_ad,
        ...(teslimMap.get(s.id) || []).flatMap((t) => [t.plaka, t.irsaliye_no])]
        .some((v) => (v || "").toLocaleLowerCase("tr").includes(q))));
  }, [siparisler, filtre, arama, teslimMap]);

  const bugun = bugunTRIso();
  const acikSiparisler = siparisler.filter((s) => s.durum === "acik");
  const bekleyenKg = acikSiparisler.reduce((t, s) => t + alisIlerleme(s.miktar_kg, alinan(s.id)).bekleyen, 0);
  const bugunTeslim = teslimler.filter((t) => !t.gecmis && new Date(t.teslim_zamani).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }) === bugun);
  const kapatmayaHazir = acikSiparisler.filter((s) => alisKapatmayaHazir(s.miktar_kg, alinan(s.id))).length;

  const belgeAc = async (yol: string) => {
    const pencere = window.open("", "_blank");
    const { data, error } = await supabase.storage.from(IC_BELGE_BUCKET).createSignedUrl(yol, 60 * 10);
    if (error || !data?.signedUrl) { pencere?.close(); showToast(`İrsaliye açılamadı: ${error?.message || "bilinmeyen hata"}`, "error"); return; }
    if (pencere) pencere.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  };

  const durumUygula = async () => {
    if (!durumIslem || !companyId) return;
    const { s, hedef } = durumIslem;
    setIsleniyor(true);
    const sonuc = hedef === "sil"
      ? await supabase.from("ic_alis_siparisleri").delete().eq("id", s.id).eq("company_id", companyId).select("id")
      : await supabase.from("ic_alis_siparisleri").update({ durum: hedef }).eq("id", s.id).eq("company_id", companyId).select("id");
    setIsleniyor(false);
    const h = yazmaHatasi(sonuc.error, sonuc.data);
    if (h) { showToast(alisHataMesaji({ message: h }), "error"); return; }
    showToast(hedef === "sil" ? `${s.alis_no} silindi.` : `${s.alis_no}: ${ALIS_DURUM_ETIKET[hedef as AlisDurum]}.`, "success");
    setDurumIslem(null);
    getir();
  };

  const teslimSil = async () => {
    if (!silinecekTeslim) return;
    setIsleniyor(true);
    // Dogru sira: once kayit (sunucuda), SADECE basariliysa PDF
    const { data: yol, error } = await supabase.rpc("ic_alis_teslim_sil", { p_id: silinecekTeslim.id });
    if (error) { setIsleniyor(false); showToast(alisHataMesaji(error), "error"); return; }
    if (yol) {
      const { error: d } = await supabase.storage.from(IC_BELGE_BUCKET).remove([yol as string]);
      if (d) console.error("İrsaliye silinemedi:", d.message);
    }
    setIsleniyor(false);
    showToast(silinecekTeslim.sevk_id ? "Teslim kaydı silindi. Bağlı satış kaydını İş Emirleri'nden ayrıca silin." : "Teslim kaydı silindi.", "success");
    setSilinecekTeslim(null);
    getir();
  };

  if (!authLoading && !yetkili) {
    return <AppShell><div className="p-8 text-sm" style={{ color: TEXT_MUTED }}>Bu sayfa için yetkiniz yok.</div></AppShell>;
  }

  return (
    <AppShell>
      <div className="p-4 md:p-8 max-w-[1500px] mx-auto">
        <SayfaBasligi
          ikon={<PackageOpen size={20} />}
          baslik="İç Piyasa Alış"
          aciklama="Alış siparişleri ve teslim alınan araçlar. Araçlar Kantar Paneli › Gelen Araç'tan girilir."
          sag={gorunum === "siparisler" ? (
            <button onClick={() => { setDuzenlenen(null); setFormAcik(true); }} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white hover:brightness-110" style={{ backgroundColor: ACCENT }}>
              <Plus size={15} /> Yeni Alış Siparişi
            </button>
          ) : null}
        />
        <IcPiyasaSekmeler />

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {([["siparisler", "Siparişler", PackageOpen], ["tedarikciler", "Tedarikçiler", Building2]] as const).map(([k, e, Ikon]) => (
            <button key={k} onClick={() => setGorunum(k)} aria-pressed={gorunum === k}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${gorunum === k ? "text-white" : "hover:bg-white/5"}`}
              style={gorunum === k ? { backgroundColor: "rgba(16,185,129,0.15)", borderColor: ACCENT } : { borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              <Ikon size={13} /> {e}{k === "tedarikciler" ? ` (${tedarikciler.length})` : ""}
            </button>
          ))}
          <button onClick={getir} className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}><RefreshCw size={12} /> Yenile</button>
        </div>

        {okumaHatasi && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm text-red-300" style={{ borderColor: "#7F1D1D", backgroundColor: "rgba(127,29,29,0.2)" }}>
            <AlertCircle size={15} /> Veriler okunamadı: {okumaHatasi}
            <button onClick={getir} className="underline ml-auto">Yeniden dene</button>
          </div>
        )}

        {yukleniyor ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={26} className="animate-spin" style={{ color: ACCENT }} /></div>
        ) : gorunum === "tedarikciler" ? (
          <TedarikciListesi tedarikciler={tedarikciler} siparisler={siparisler} yenile={getir} />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <OzetKutu baslik="Açık Alış Siparişi" deger={String(sayilar.acik)} alt={`${tedarikciler.filter((t) => t.aktif).length} aktif tedarikçi`} renk="text-sky-400" />
              <OzetKutu baslik="Teslim Alınacak" deger={tonYazi(bekleyenKg)} alt="açık siparişlerde kalan" renk="text-amber-400" />
              <OzetKutu baslik="Bugün Teslim Alınan" deger={`${bugunTeslim.length} araç`} alt={kgYazi(bugunTeslim.reduce((t, x) => t + Number(x.net_kg), 0))} renk="text-emerald-400" />
              <OzetKutu baslik="Kapatmaya Hazır" deger={String(kapatmayaHazir)} alt="kalan ≤ %1 veya ≤ 2 ton" renk={kapatmayaHazir ? "text-emerald-400" : "text-white"} />
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex flex-wrap gap-1 rounded-lg border p-1" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }}>
                {(["acik", "tamamlandi", "iptal", "tumu"] as Filtre[]).map((f) => (
                  <button key={f} onClick={() => setFiltre(f)} aria-pressed={filtre === f}
                    className={`px-3 py-1 rounded-md text-xs font-semibold ${filtre === f ? "text-white" : "hover:bg-white/5"}`}
                    style={filtre === f ? { backgroundColor: ACCENT } : { color: TEXT_MUTED }}>
                    {f === "tumu" ? "Tümü" : ALIS_DURUM_ETIKET[f]} ({sayilar[f]})
                  </button>
                ))}
              </div>
              <label className="relative flex-1 min-w-[200px] max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: TEXT_MUTED }} />
                <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="AS no, tedarikçi, depo, plaka, irsaliye…" aria-label="Ara"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm text-white placeholder:text-slate-600" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} />
              </label>
            </div>

            {liste.length === 0 ? (
              <div className="rounded-xl border p-12 text-center" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <PackageOpen size={36} className="mx-auto mb-3" style={{ color: CARD_BORDER }} />
                <p className="text-sm" style={{ color: TEXT_MUTED }}>{siparisler.length ? "Bu filtrede alış siparişi yok." : "Henüz alış siparişi yok. \"Yeni Alış Siparişi\" ile başlayın."}</p>
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[960px]">
                    <thead className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                      <tr>
                        {["Alış No", "Tedarikçi / Depo", "Ürün", "Sipariş · Termin", "Teslim Alınan · Araç", "Fiyat · Tutar", ""].map((b) => (
                          <th key={b} className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${b === "Fiyat · Tutar" ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {liste.map((s) => {
                        const a = alinan(s.id);
                        const il = alisIlerleme(s.miktar_kg, a);
                        const hazir = s.durum === "acik" && alisKapatmayaHazir(s.miktar_kg, a);
                        const ac = acikDetay === s.id;
                        const terminGecti = s.durum === "acik" && !!s.termin && s.termin < bugun;
                        const ts = teslimMap.get(s.id) || [];
                        return (
                          <React.Fragment key={s.id}>
                            <tr className="border-b cursor-pointer hover:bg-white/[0.02]" style={{ borderColor: CARD_BORDER }} onClick={() => setAcikDetay(ac ? null : s.id)}>
                              <td className="px-3 py-3 align-top whitespace-nowrap">
                                <p className="text-sm font-bold text-white">{s.alis_no}</p>
                                <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${DURUM_RENK[s.durum]}`}>{ALIS_DURUM_ETIKET[s.durum]}</span>
                                {hazir && <span className="ml-1 inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-400">Kapatmaya hazır</span>}
                              </td>
                              <td className="px-3 py-3 align-top max-w-[210px]">
                                <p className="text-sm text-white truncate" title={tedarikciAdi(s)}>{tedarikciAdi(s)}</p>
                                <p className="text-[11px] truncate" style={{ color: TEXT_MUTED }}>{[s.depo ? `Depo ${s.depo}` : null, s.tedarikci_siparis_no].filter(Boolean).join(" · ") || "—"}</p>
                              </td>
                              <td className="px-3 py-3 align-top">
                                <p className="text-sm text-white whitespace-nowrap">{alisUrunYazi(s)}</p>
                                <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{ALIS_TESLIM_ETIKET[s.teslim]}</p>
                              </td>
                              <td className="px-3 py-3 align-top whitespace-nowrap">
                                <p className="text-sm text-white">{gunTR(s.siparis_tarihi)}</p>
                                <p className={`text-[11px] ${terminGecti ? "text-amber-400 font-semibold" : ""}`} style={terminGecti ? undefined : { color: TEXT_MUTED }}>{s.termin ? `Termin ${gunTR(s.termin)}${terminGecti ? " · geçti" : ""}` : "Termin yok"}</p>
                              </td>
                              <td className="px-3 py-3 align-top min-w-[200px]">
                                <div className="flex justify-between text-xs mb-1 gap-2">
                                  <span className="text-white font-medium whitespace-nowrap">{tonYazi(a)} / {tonYazi(s.miktar_kg)}</span>
                                  <span className="whitespace-nowrap" style={{ color: TEXT_MUTED }}>{il.fazla ? `+${tonYazi(il.fazla)} fazla` : `kalan ${tonYazi(il.bekleyen)}`}</span>
                                </div>
                                <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#0F131A" }}>
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(il.oran * 100))}%`, backgroundColor: hazir || s.durum === "tamamlandi" ? "#10B981" : "#38BDF8" }} />
                                </div>
                                <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: TEXT_MUTED }}>
                                  {aracSayisi(s.id)} araç{ts.some((t) => t.gecmis) ? " + sistem öncesi" : ""}
                                  {ts.some((t) => t.uyarilar?.length) && <AlertTriangle size={11} className="text-amber-400" aria-label="Uyarılı teslim var" />}
                                </p>
                              </td>
                              <td className="px-3 py-3 align-top text-right whitespace-nowrap">
                                <p className="text-sm text-white">{alisFiyatYazi(s.birim_fiyat, s.para_birimi)}</p>
                                <p className="text-[11px]" style={{ color: TEXT_MUTED }}>{s.birim_fiyat !== null ? alisTutarYazi(Number(s.miktar_kg) * Number(s.birim_fiyat), s.para_birimi) : "fiyat girilmedi"}</p>
                                {s.vade_gun !== null && <p className="text-[10px]" style={{ color: TEXT_MUTED }}>{vadeYazi(s.vade_gun)}</p>}
                              </td>
                              <td className="px-3 py-3 align-top text-right" style={{ color: TEXT_MUTED }}>{ac ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                            </tr>
                            {ac && (
                              <tr className="border-b" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
                                <td colSpan={7} className="px-4 py-4">
                                  {/* w-0 + min-w-full: ic tablo dis tabloyu genisletmesin, kendi icinde kaysin */}
                                  <div className="w-0 min-w-full">
                                  <div className="flex flex-wrap gap-2 mb-3">
                                    {s.durum === "acik" && (
                                      <>
                                        <IslemButon onClick={() => { setDuzenlenen(s); setFormAcik(true); }} ikon={<Pencil size={13} />}>Düzenle</IslemButon>
                                        <IslemButon onClick={() => setGecmisAlis({ id: s.id, alis_no: s.alis_no, urun: s.urun, urun_kodu: s.urun_kodu, tedarikci: tedarikciAdi(s), miktar_kg: s.miktar_kg, alinan_kg: a })} ikon={<History size={13} />}>Sistem öncesi teslim ekle</IslemButon>
                                        <IslemButon onClick={() => setDurumIslem({ s, hedef: "tamamlandi" })} ikon={<CheckCircle2 size={13} />} vurgu>Tamamlandı olarak kapat</IslemButon>
                                        <IslemButon onClick={() => setDurumIslem({ s, hedef: "iptal" })} ikon={<XCircle size={13} />}>İptal et</IslemButon>
                                      </>
                                    )}
                                    {s.durum !== "acik" && <IslemButon onClick={() => setDurumIslem({ s, hedef: "acik" })} ikon={<RotateCcw size={13} />}>Yeniden aç</IslemButon>}
                                    {ts.length === 0 && <IslemButon onClick={() => setDurumIslem({ s, hedef: "sil" })} ikon={<Trash2 size={13} />} tehlike>Sil</IslemButon>}
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-xs mb-4">
                                    <Bilgi e="Tedarikçi" d={tedarikciAdi(s)} />
                                    <Bilgi e="Depo / tedarikçi no" d={[s.depo, s.tedarikci_siparis_no].filter(Boolean).join(" · ") || "—"} />
                                    <Bilgi e="Birim fiyat" d={`${alisFiyatYazi(s.birim_fiyat, s.para_birimi)}${s.birim_fiyat !== null ? (s.kdv_dahil ? " · KDV Dahil" : " · + KDV") : ""}`} />
                                    <Bilgi e="Vade" d={s.vade_gun === null ? "—" : vadeYazi(s.vade_gun)} />
                                    <Bilgi e="Teslim alınan tutar" d={s.birim_fiyat !== null ? alisTutarYazi(a * Number(s.birim_fiyat), s.para_birimi) : "—"} />
                                    <Bilgi e="Açan" d={`${s.olusturan_email || "—"} · ${tarihSaatYazi(s.olusturma)}`} />
                                    {s.kapanis_zamani && <Bilgi e="Kapanış" d={tarihSaatYazi(s.kapanis_zamani)} />}
                                    {s.notlar && <Bilgi e="Notlar" d={s.notlar} />}
                                  </div>
                                  {ts.length === 0 ? (
                                    <p className="text-xs flex items-center gap-1.5" style={{ color: TEXT_MUTED }}><Truck size={13} /> Henüz teslim alınan araç yok. Kantarcı Kantar Paneli › Gelen Araç&apos;tan girer.</p>
                                  ) : (
                                    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: CARD_BORDER }}>
                                      <table className="w-full text-left border-collapse min-w-[760px]">
                                        <thead style={{ backgroundColor: ROW_HEADER_BG }}>
                                          <tr>{["Teslim", "Plaka", "Net", "İrsaliye", "Doğrudan sevk", "Giren", ""].map((b) => <th key={b} className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${b === "Net" ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>)}</tr>
                                        </thead>
                                        <tbody>
                                          {[...ts].reverse().map((t) => (
                                            <tr key={t.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                                              <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: TEXT_MUTED }}>
                                                {t.gecmis ? gunTR(new Date(t.teslim_zamani).toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" })) : tarihSaatYazi(t.teslim_zamani)}
                                                {t.gecmis && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/15 text-slate-300">Sistem öncesi</span>}
                                              </td>
                                              <td className="px-3 py-2 text-xs font-bold text-white whitespace-nowrap">{t.plaka || "—"}{t.dorse_plaka && <span className="block text-[10px] font-normal" style={{ color: TEXT_MUTED }}>{t.dorse_plaka}</span>}</td>
                                              <td className="px-3 py-2 text-xs font-bold text-white text-right whitespace-nowrap">{kgYazi(Number(t.net_kg))}</td>
                                              <td className="px-3 py-2 text-xs whitespace-nowrap">
                                                {t.irsaliye_dosya_yolu ? (
                                                  <button onClick={() => belgeAc(t.irsaliye_dosya_yolu!)} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"><FileText size={11} /> {t.irsaliye_no || "Gör"}</button>
                                                ) : <span style={{ color: TEXT_MUTED }}>{t.irsaliye_no || "—"}</span>}
                                                {t.uyarilar?.length > 0 && <span title={t.uyarilar.join("\n")}><AlertTriangle size={13} className="inline ml-2 text-amber-400" aria-label={t.uyarilar.join(" ")} /></span>}
                                              </td>
                                              <td className="px-3 py-2 text-xs whitespace-nowrap">
                                                {t.sevk_id ? <span className="inline-flex items-center gap-1 text-sky-300"><Link2 size={11} /> {sevkIsEmri[t.sevk_id] || "Satışa bağlı"}</span> : <span style={{ color: TEXT_MUTED }}>—</span>}
                                              </td>
                                              <td className="px-3 py-2 text-[11px] whitespace-nowrap" style={{ color: TEXT_MUTED }}>{t.girilen_email || "—"}</td>
                                              <td className="px-3 py-2 text-right">
                                                <button onClick={() => setSilinecekTeslim(t)} className="p-1 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Teslim kaydını sil" title="Hatalı kaydı sil"><Trash2 size={13} /></button>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {formAcik && (
        <IcAlisSiparisForm tedarikciler={tedarikciler} duzenlenen={duzenlenen} kapat={() => { setFormAcik(false); setDuzenlenen(null); }} kaydedildi={() => getir()} />
      )}
      {gecmisAlis && <IcAlisGecmisTeslimPenceresi alis={gecmisAlis} kapat={() => setGecmisAlis(null)} kaydedildi={getir} />}

      <ConfirmDialog
        open={!!durumIslem}
        onOpenChange={(o) => { if (!o && !isleniyor) setDurumIslem(null); }}
        title={durumIslem ? (durumIslem.hedef === "sil" ? `${durumIslem.s.alis_no} silinsin mi?` : durumIslem.hedef === "acik" ? `${durumIslem.s.alis_no} yeniden açılsın mı?` : durumIslem.hedef === "iptal" ? `${durumIslem.s.alis_no} iptal edilsin mi?` : `${durumIslem.s.alis_no} kapatılsın mı?`) : ""}
        description={durumIslem ? (
          durumIslem.hedef === "sil" ? "Teslim girilmemiş sipariş kalıcı olarak silinir."
            : durumIslem.hedef === "tamamlandi" ? `Teslim alınan ${kgYazi(alinan(durumIslem.s.id))} / ${kgYazi(durumIslem.s.miktar_kg)}. Kapanan siparişe kantardan araç girilemez; raporda yeşil görünür.`
              : durumIslem.hedef === "iptal" ? "İptal edilen siparişe araç girilemez ve rapordan çıkar. Teslimler silinmez."
                : "Sipariş tekrar açık listeye döner; kantar araç girebilir."
        ) : ""}
        confirmLabel={durumIslem?.hedef === "sil" ? "Sil" : "Onayla"}
        destructive={durumIslem?.hedef === "sil" || durumIslem?.hedef === "iptal"}
        loading={isleniyor}
        onConfirm={durumUygula}
      />
      <ConfirmDialog
        open={!!silinecekTeslim}
        onOpenChange={(o) => { if (!o && !isleniyor) setSilinecekTeslim(null); }}
        title="Teslim kaydı silinsin mi?"
        description={silinecekTeslim ? `${silinecekTeslim.plaka || "Parti"} · ${kgYazi(Number(silinecekTeslim.net_kg))} kaydı silinir${silinecekTeslim.sevk_id ? ". Bu araç doğrudan müşteriye sevk edilmişti: satış kaydı (ve irsaliyesi) İş Emirleri'nde kalır, gerekiyorsa oradan ayrıca silin." : (silinecekTeslim.irsaliye_dosya_yolu ? " ve irsaliye PDF'i depodan kaldırılır." : ".")}` : ""}
        confirmLabel="Sil"
        destructive
        loading={isleniyor}
        onConfirm={teslimSil}
      />
    </AppShell>
  );
}

function OzetKutu({ baslik, deger, alt, renk }: { baslik: string; deger: string; alt: string; renk: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>{baslik}</p>
      <p className={`text-xl font-bold ${renk}`}>{deger}</p>
      <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{alt}</p>
    </div>
  );
}

function Bilgi({ e, d }: { e: string; d: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide" style={{ color: TEXT_MUTED }}>{e}</p>
      <p className="text-white break-words">{d}</p>
    </div>
  );
}

function IslemButon({ children, onClick, ikon, vurgu, tehlike }: { children: React.ReactNode; onClick: () => void; ikon: React.ReactNode; vurgu?: boolean; tehlike?: boolean }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-white/5 ${tehlike ? "text-red-400" : vurgu ? "text-emerald-400" : "text-white"}`}
      style={{ borderColor: tehlike ? "#7F1D1D" : vurgu ? "#065F46" : CARD_BORDER }}>
      {ikon} {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tedarikci kartlari
// ---------------------------------------------------------------------------
function TedarikciListesi({ tedarikciler, siparisler, yenile }: { tedarikciler: IcTedarikci[]; siparisler: SiparisSatiri[]; yenile: () => void }) {
  const { companyId } = useAuth();
  const { showToast } = useToast();
  const [duzen, setDuzen] = useState<Partial<IcTedarikci> | null>(null);
  const [silinecek, setSilinecek] = useState<IcTedarikci | null>(null);
  const [isleniyor, setIsleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const siparisSayisi = (id: string) => siparisler.filter((s) => s.tedarikci_id === id).length;

  const kaydet = async () => {
    if (!duzen || !companyId) return;
    const unvan = (duzen.unvan || "").trim().replace(/\s+/g, " ");
    if (unvan.length < 2) { setHata("Ünvan en az 2 karakter olmalı."); return; }
    const vkn = (duzen.vergi_no || "").replace(/\D/g, "");
    if (vkn && !/^[0-9]{10,11}$/.test(vkn)) { setHata("Vergi no 10 (VKN) veya 11 (TCKN) haneli olmalı."); return; }
    const tel = duzen.telefon ? telefonNormallestir(duzen.telefon) : null;
    if (tel === undefined) { setHata("Telefon numarası geçersiz."); return; }
    setIsleniyor(true);
    setHata(null);
    const govde = {
      unvan, kisa_ad: duzen.kisa_ad?.trim() || null, vergi_dairesi: duzen.vergi_dairesi?.trim() || null, vergi_no: vkn || null,
      adres: duzen.adres?.trim() || null, yetkili_ad: duzen.yetkili_ad?.trim() || null, telefon: tel, eposta: duzen.eposta?.trim() || null,
      notlar: duzen.notlar?.trim() || null, aktif: duzen.aktif ?? true,
    };
    const r = duzen.id
      ? await supabase.from("ic_tedarikciler").update(govde).eq("id", duzen.id).eq("company_id", companyId).select("id")
      : await supabase.from("ic_tedarikciler").insert({ ...govde, company_id: companyId }).select("id");
    setIsleniyor(false);
    const h = yazmaHatasi(r.error, r.data);
    if (h) { setHata(alisHataMesaji({ message: h })); return; }
    showToast(duzen.id ? "Tedarikçi güncellendi." : "Tedarikçi eklendi.", "success");
    setDuzen(null);
    yenile();
  };

  const sil = async () => {
    if (!silinecek || !companyId) return;
    setIsleniyor(true);
    const r = await supabase.from("ic_tedarikciler").delete().eq("id", silinecek.id).eq("company_id", companyId).select("id");
    setIsleniyor(false);
    const h = yazmaHatasi(r.error, r.data);
    if (h) { showToast(alisHataMesaji({ message: h }), "error"); return; }
    showToast("Tedarikçi silindi.", "success");
    setSilinecek(null);
    yenile();
  };

  const alan = (k: keyof IcTedarikci, etiket: string, ph = "") => (
    <label className="block">
      <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>{etiket}</span>
      <input value={(duzen?.[k] as string) || ""} placeholder={ph} onChange={(e) => setDuzen((d) => ({ ...d, [k]: e.target.value }))}
        className="w-full px-3 py-2 rounded-lg border text-sm text-white placeholder:text-slate-600" style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
    </label>
  );

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={() => { setHata(null); setDuzen({ aktif: true }); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: ACCENT }}><Plus size={14} /> Yeni tedarikçi</button>
      </div>
      {tedarikciler.length === 0 ? (
        <div className="rounded-xl border p-12 text-center text-sm" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER, color: TEXT_MUTED }}>Henüz tedarikçi yok.</div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead style={{ backgroundColor: ROW_HEADER_BG }}>
                <tr>{["Ünvan", "Kısa ad", "Vergi no", "Yetkili / telefon", "Sipariş", "Durum", ""].map((b) => <th key={b} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: TEXT_MUTED }}>{b}</th>)}</tr>
              </thead>
              <tbody>
                {tedarikciler.map((t) => (
                  <tr key={t.id} className="border-t" style={{ borderColor: CARD_BORDER }}>
                    <td className="px-3 py-2.5 text-sm text-white">{t.unvan}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: TEXT_MUTED }}>{t.kisa_ad || "—"}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: TEXT_MUTED }}>{t.vergi_no || "—"}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: TEXT_MUTED }}>{[t.yetkili_ad, t.telefon ? telefonYazi(t.telefon) : null].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-white">{siparisSayisi(t.id)}</td>
                    <td className="px-3 py-2.5"><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${t.aktif ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-500/15 text-slate-400"}`}>{t.aktif ? "Aktif" : "Pasif"}</span></td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => { setHata(null); setDuzen(t); }} className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label={`${t.unvan} düzenle`}><Pencil size={13} /></button>
                      {siparisSayisi(t.id) === 0 && <button onClick={() => setSilinecek(t)} className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label={`${t.unvan} sil`}><Trash2 size={13} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {duzen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="tedarikci-baslik">
          <div className="w-full max-w-xl rounded-2xl border shadow-2xl my-8" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
              <h2 id="tedarikci-baslik" className="text-base font-bold text-white">{duzen.id ? "Tedarikçiyi düzenle" : "Yeni tedarikçi"}</h2>
              <button onClick={() => setDuzen(null)} disabled={isleniyor} className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">{alan("unvan", "Ünvan *", "PINARHİSAR TMO")}</div>
              {alan("kisa_ad", "Kısa ad (kantarda görünür)", "Pınarhisar TMO")}
              {alan("vergi_no", "Vergi no")}
              {alan("vergi_dairesi", "Vergi dairesi")}
              {alan("yetkili_ad", "Yetkili")}
              {alan("telefon", "Telefon", "0532 111 22 33")}
              {alan("eposta", "E-posta")}
              <div className="sm:col-span-2">{alan("adres", "Adres")}</div>
              <div className="sm:col-span-2">{alan("notlar", "Notlar")}</div>
              <label className="flex items-center gap-2 text-sm text-white sm:col-span-2">
                <input type="checkbox" checked={duzen.aktif ?? true} onChange={(e) => setDuzen((d) => ({ ...d, aktif: e.target.checked }))} /> Aktif (yeni siparişte seçilebilir)
              </label>
              {hata && <p className="sm:col-span-2 flex items-start gap-1.5 text-sm text-red-400"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {hata}</p>}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
              <button onClick={() => setDuzen(null)} disabled={isleniyor} className="px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
              <button onClick={kaydet} disabled={isleniyor} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
                {isleniyor ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog open={!!silinecek} onOpenChange={(o) => { if (!o && !isleniyor) setSilinecek(null); }} title="Tedarikçi silinsin mi?"
        description={silinecek ? `${silinecek.unvan} kalıcı olarak silinir. Siparişi olan tedarikçi silinemez (pasife alınabilir).` : ""} confirmLabel="Sil" destructive loading={isleniyor} onConfirm={sil} />
    </>
  );
}
