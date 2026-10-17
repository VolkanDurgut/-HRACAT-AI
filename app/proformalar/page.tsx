"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { ProformaSekmeler } from "@/components/proforma-sekmeler";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { GecmistenAktar } from "@/components/proforma-gecmisten-aktar";
import { MetinListesiEditor } from "@/components/metin-listesi-editor";
import { FileSignature, Plus, Search, Loader2, Pencil, Trash2, X, Save, AlertCircle, History, Wand2 } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { BANKA_PRESETLERI, bankaBul } from "@/lib/bankalar";
import { TESLIM_SEKILLERI, VARSAYILAN_EVRAKLAR, aliciKoduOner, sigortaEvrakiMi, sigortaSatictaMi, teslimIfadesiOner } from "@/lib/proforma/sabitler";
import { BOS_MUSTERI, kodTemizle, musteriKaydiHazirla, musteridenTaslak, proformaHataMesaji, type IhracatMusteri, type MusteriTaslak } from "@/lib/proforma/kayit";

/**
 * PROFORMALAR - Ihracat musteri kartlari (17.10.2026, 1. asama).
 * Proforma sihirbazi (2. asama) alici bilgilerini bu kartlardan doldurur.
 * Kartlar elle veya "Gecmisten Aktar" ile (onayli) olusturulur.
 */

const inputSinif = "w-full px-3 py-2 rounded-lg border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const inputStil = { backgroundColor: "#0F131A", borderColor: CARD_BORDER } as const;

export default function ProformaMusterilerPage() {
  const { companyId, yetkiler, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const yetkili = !!yetkiler.sayfa_yetkileri.proformalar;

  const [musteriler, setMusteriler] = useState<IhracatMusteri[]>([]);
  const [varsayilanEvrak, setVarsayilanEvrak] = useState<string[]>(VARSAYILAN_EVRAKLAR);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [arama, setArama] = useState("");
  const [pasifleriGoster, setPasifleriGoster] = useState(false);

  const [duzenlenen, setDuzenlenen] = useState<IhracatMusteri | null>(null);
  const [formAcik, setFormAcik] = useState(false);
  const [taslak, setTaslak] = useState<MusteriTaslak>(BOS_MUSTERI);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [silinecek, setSilinecek] = useState<IhracatMusteri | null>(null);
  const [siliniyor, setSiliniyor] = useState(false);
  const [aktarAcik, setAktarAcik] = useState(false);

  const getir = useCallback(async () => {
    if (!companyId) return;
    setOkumaHatasi(null);
    const [m, a] = await Promise.all([
      supabase.from("ihracat_musterileri").select("*").eq("company_id", companyId).order("unvan"),
      supabase.from("proforma_ayarlari").select("evraklar").eq("company_id", companyId).maybeSingle(),
    ]);
    if (m.error) { setOkumaHatasi(proformaHataMesaji(m.error)); setYukleniyor(false); return; }
    setMusteriler((m.data || []) as IhracatMusteri[]);
    const ev = (a.data as { evraklar: string[] | null } | null)?.evraklar;
    setVarsayilanEvrak(Array.isArray(ev) && ev.length ? ev : VARSAYILAN_EVRAKLAR);
    setYukleniyor(false);
  }, [companyId]);

  useEffect(() => {
    if (authLoading || !yetkili) return;
    getir();
  }, [authLoading, yetkili, getir]);

  const liste = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    return musteriler.filter((m) =>
      (pasifleriGoster || m.aktif) &&
      (!q || [m.kod, m.unvan, m.varis_limani, m.eposta, m.adres].some((v) => (v || "").toLocaleLowerCase("tr").includes(q)))
    );
  }, [musteriler, arama, pasifleriGoster]);

  const set = <K extends keyof MusteriTaslak>(k: K, v: MusteriTaslak[K]) => setTaslak((t) => ({ ...t, [k]: v }));

  const yeniAc = () => { setDuzenlenen(null); setTaslak(BOS_MUSTERI); setFormAcik(true); };
  const duzenleAc = (m: IhracatMusteri) => { setDuzenlenen(m); setTaslak(musteridenTaslak(m)); setFormAcik(true); };

  const digerKodlar = useMemo(() => musteriler.filter((m) => m.id !== duzenlenen?.id).map((m) => m.kod), [musteriler, duzenlenen]);
  const kodCakisiyor = !!taslak.kod && digerKodlar.includes(kodTemizle(taslak.kod));

  const kaydet = async () => {
    if (!companyId) return;
    if (kodCakisiyor) { showToast("Bu alıcı kodu başka bir müşteride kullanılıyor.", "error"); return; }
    const r = musteriKaydiHazirla(taslak);
    if ("hata" in r) { showToast(r.hata, "error"); return; }
    setKaydediliyor(true);
    const sonuc = duzenlenen
      ? await supabase.from("ihracat_musterileri").update(r.kayit).eq("id", duzenlenen.id).eq("company_id", companyId).select("id")
      : await supabase.from("ihracat_musterileri").insert({ ...r.kayit, company_id: companyId }).select("id");
    setKaydediliyor(false);
    const hata = yazmaHatasi(sonuc.error, sonuc.data);
    if (hata) { showToast(`Kaydedilemedi: ${proformaHataMesaji({ message: hata })}`, "error"); return; }
    showToast(duzenlenen ? "Müşteri kartı güncellendi." : "Müşteri kartı eklendi.", "success");
    setFormAcik(false);
    getir();
  };

  const sil = async () => {
    if (!silinecek || !companyId) return;
    setSiliniyor(true);
    const { data, error } = await supabase.from("ihracat_musterileri").delete().eq("id", silinecek.id).eq("company_id", companyId).select("id");
    setSiliniyor(false);
    const hata = yazmaHatasi(error, data);
    setSilinecek(null);
    if (hata) { showToast(proformaHataMesaji({ message: hata }), "error"); return; }
    showToast("Müşteri kartı silindi.", "success");
    getir();
  };

  if (authLoading || (yetkili && yukleniyor && !okumaHatasi)) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20"><Loader2 size={32} className="animate-spin" style={{ color: ACCENT }} /></div>
      </AppShell>
    );
  }

  const aktifSayi = musteriler.filter((m) => m.aktif).length;
  const bankasiz = musteriler.filter((m) => m.aktif && !m.banka).length;
  const sigortaUyari = !sigortaSatictaMi(taslak.teslim_sekli) && taslak.ozelEvrak && taslak.evraklar.some(sigortaEvrakiMi);

  return (
    <AppShell>
      <SayfaBasligi
        ikon={<FileSignature size={20} />}
        baslik="Proformalar · Müşteriler"
        aciklama="İhracat alıcı kartları. Proforma hazırlanırken alıcı, teslim, banka, ödeme ve evrak bilgileri bu kartlardan gelir."
        sag={
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setAktarAcik(true)} disabled={!!okumaHatasi} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium hover:bg-white/5 disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: "#E2E8F0" }}>
              <History size={14} /> Geçmişten Aktar
            </button>
            <button onClick={yeniAc} disabled={!!okumaHatasi} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white hover:brightness-110 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
              <Plus size={14} /> Yeni Müşteri
            </button>
          </div>
        }
      />
      <ProformaSekmeler />

      {okumaHatasi && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "#7F1D1D", backgroundColor: "rgba(127,29,29,0.15)", color: "#FCA5A5" }}>
          <span className="flex items-center gap-2"><AlertCircle size={16} /> {okumaHatasi}</span>
          <button onClick={getir} className="underline">Yeniden dene</button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl border p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Aktif Müşteri</p>
          <p className="text-2xl font-bold text-white mt-1">{aktifSayi}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Bankası Seçilmemiş</p>
          <p className={`text-2xl font-bold mt-1 ${bankasiz ? "text-amber-400" : "text-emerald-400"}`}>{bankasiz}</p>
        </div>
      </div>

      <div className="rounded-xl border shadow-sm" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b" style={{ borderColor: CARD_BORDER }}>
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: TEXT_MUTED }} />
            <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Kod, ünvan, liman veya e-posta ile ara..." className={`${inputSinif} pl-9`} style={inputStil} />
          </div>
          <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: TEXT_MUTED }}>
            <input type="checkbox" checked={pasifleriGoster} onChange={(e) => setPasifleriGoster(e.target.checked)} className="accent-emerald-500" /> Pasifleri göster
          </label>
        </div>

        {liste.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <FileSignature size={30} className="mx-auto mb-2" style={{ color: "#3A4152" }} />
            <p className="text-sm" style={{ color: TEXT_MUTED }}>{musteriler.length === 0 ? "Henüz müşteri kartı yok. Geçmiş dosyalardaki alıcıları tek seferde aktarabilirsiniz." : "Aramayla eşleşen müşteri yok."}</p>
            {musteriler.length === 0 && !okumaHatasi && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button onClick={() => setAktarAcik(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white hover:brightness-110" style={{ backgroundColor: ACCENT }}>
                  <History size={14} /> Geçmişten Aktar
                </button>
                <button onClick={yeniAc} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: "#E2E8F0" }}>
                  <Plus size={14} /> Elle ekle
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                  {["Kod", "Alıcı", "Teslim", "Banka", "Ödeme", ""].map((b, i) => (
                    <th key={i} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {liste.map((m) => (
                  <tr key={m.id} className={`border-t ${m.aktif ? "" : "opacity-50"}`} style={{ borderColor: CARD_BORDER }}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono font-semibold text-emerald-400">{m.kod}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{m.unvan}</p>
                      <p className="text-xs mt-0.5 max-w-[320px] truncate" style={{ color: TEXT_MUTED }} title={m.adres || ""}>{m.adres || "Adres yok"}{!m.aktif && " · Pasif"}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-white">{m.teslim_ifadesi || [m.teslim_sekli, m.varis_limani].filter(Boolean).join(" ") || "-"}</p>
                      <p className="text-xs" style={{ color: TEXT_MUTED }}>{m.evraklar?.length ? `${m.evraklar.length} evrak (özel liste)` : "Varsayılan evrak listesi"}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {m.banka ? <p className="text-white">{bankaBul(m.banka)?.goruntulenenAd}</p> : <p className="text-amber-400 text-xs">Seçilmemiş</p>}
                      <p className="text-xs" style={{ color: TEXT_MUTED }}>{m.para_birimi}</p>
                    </td>
                    <td className="px-4 py-3 text-xs max-w-[260px]" style={{ color: TEXT_MUTED }}>
                      <p className="line-clamp-2" title={m.odeme_sekli || ""}>{m.odeme_sekli || "-"}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button onClick={() => duzenleAc(m)} title="Düzenle" className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }}><Pencil size={14} /></button>
                      <button onClick={() => setSilinecek(m)} title="Sil" className="p-1.5 rounded hover:bg-red-500/10 text-red-400"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formAcik && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="ihr-musteri-baslik">
          <div className="w-full max-w-3xl rounded-2xl border shadow-2xl my-8" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
              <h2 id="ihr-musteri-baslik" className="text-base font-semibold text-white">{duzenlenen ? `Müşteri Kartı · ${duzenlenen.kod}` : "Yeni Müşteri Kartı"}</h2>
              <button onClick={() => !kaydediliyor && setFormAcik(false)} className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Bolum baslik="Alıcı (BUYER)" />
              <Alan etiket="Ünvan *" tam>
                <input value={taslak.unvan} onChange={(e) => set("unvan", e.target.value)} placeholder="CENTRE COMMERCIAL SAAD" className={inputSinif} style={inputStil} autoFocus={!duzenlenen} />
              </Alan>
              <Alan etiket="Alıcı kodu *" not={kodCakisiyor ? undefined : "Proforma no: UNEX + KOD + GGAAYY (örn. UNEXCCS160926)"} hata={kodCakisiyor ? "Bu kod başka bir müşteride kullanılıyor." : undefined}>
                <div className="flex gap-2">
                  <input value={taslak.kod} onChange={(e) => set("kod", kodTemizle(e.target.value))} placeholder="CCS" className={`${inputSinif} font-mono`} style={{ ...inputStil, borderColor: kodCakisiyor ? "#B91C1C" : CARD_BORDER }} />
                  <button type="button" onClick={() => set("kod", aliciKoduOner(taslak.unvan, digerKodlar))} disabled={!taslak.unvan.trim()} title="Ünvandan öner" className="shrink-0 inline-flex items-center gap-1 px-2.5 rounded-lg border text-xs hover:bg-white/5 disabled:opacity-40" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                    <Wand2 size={13} /> Öner
                  </button>
                </div>
              </Alan>
              <Alan etiket="E-posta (draft / proforma gönderimi)" not="Birden fazlaysa virgülle ayırın">
                <input value={taslak.eposta} onChange={(e) => set("eposta", e.target.value)} placeholder="purchase@firma.com, ops@firma.com" className={inputSinif} style={inputStil} />
              </Alan>
              <Alan etiket="Adres" tam>
                <textarea value={taslak.adres} onChange={(e) => set("adres", e.target.value)} rows={2} placeholder="PLACE MAHAMOUD HARBI, DJIBOUTI" className={inputSinif} style={inputStil} />
              </Alan>
              <Alan etiket="İlgili kişi (ATTENTION TO)" tam not="Proformada aynen basılır. Örn: MR. IBRAHIM OSMAN / TEL : … / EMAIL : …">
                <textarea value={taslak.ilgili_kisi} onChange={(e) => set("ilgili_kisi", e.target.value)} rows={3} className={inputSinif} style={inputStil} />
              </Alan>

              <Bolum baslik="Teslim ve Ödeme" />
              <Alan etiket="Teslim şekli">
                <select value={taslak.teslim_sekli} onChange={(e) => set("teslim_sekli", e.target.value)} className={inputSinif} style={inputStil}>
                  <option value="">Seçin</option>
                  {TESLIM_SEKILLERI.map((t) => <option key={t} value={t}>{t}</option>)}
                  {taslak.teslim_sekli && !(TESLIM_SEKILLERI as readonly string[]).includes(taslak.teslim_sekli) && <option value={taslak.teslim_sekli}>{taslak.teslim_sekli}</option>}
                </select>
              </Alan>
              <Alan etiket="Varış limanı (PORT OF DESTINATION)">
                <input value={taslak.varis_limani} onChange={(e) => set("varis_limani", e.target.value)} placeholder="DJIBOUTI PORT" className={inputSinif} style={inputStil} />
              </Alan>
              <Alan etiket="Teslim ifadesi (SHIPMENT TERMS)" tam not="Proformada aynen basılır.">
                <div className="flex gap-2">
                  <input value={taslak.teslim_ifadesi} onChange={(e) => set("teslim_ifadesi", e.target.value)} placeholder="CIF DJIBOUTI PORT BASIS" className={inputSinif} style={inputStil} />
                  <button type="button" onClick={() => set("teslim_ifadesi", teslimIfadesiOner(taslak.teslim_sekli, taslak.varis_limani))} disabled={!taslak.teslim_sekli && !taslak.varis_limani.trim()} title="Teslim şekli + limandan oluştur" className="shrink-0 inline-flex items-center gap-1 px-2.5 rounded-lg border text-xs hover:bg-white/5 disabled:opacity-40" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
                    <Wand2 size={13} /> Oluştur
                  </button>
                </div>
              </Alan>
              <Alan etiket="Banka">
                <select value={taslak.banka} onChange={(e) => set("banka", e.target.value as MusteriTaslak["banka"])} className={inputSinif} style={inputStil}>
                  <option value="">Seçilmemiş (proformada seçilir)</option>
                  {BANKA_PRESETLERI.map((b) => <option key={b.anahtar} value={b.anahtar}>{b.goruntulenenAd}</option>)}
                </select>
              </Alan>
              <Alan etiket="Para birimi">
                <select value={taslak.para_birimi} onChange={(e) => set("para_birimi", e.target.value === "EUR" ? "EUR" : "USD")} className={inputSinif} style={inputStil}>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </Alan>
              <Alan etiket="Ödeme şekli (PAYMENT TERMS)" tam not="Son kullanılan; proforma hazırlanırken değiştirilebilir.">
                <textarea value={taslak.odeme_sekli} onChange={(e) => set("odeme_sekli", e.target.value)} rows={2} className={inputSinif} style={inputStil} />
              </Alan>
              <Alan etiket="Sevkiyat (SHIPMENT METHOD)" tam not="Son kullanılan; proforma hazırlanırken değiştirilebilir.">
                <textarea value={taslak.sevkiyat_metni} onChange={(e) => set("sevkiyat_metni", e.target.value)} rows={2} className={inputSinif} style={inputStil} />
              </Alan>

              <Bolum baslik="Evraklar (SHIPPING DOCUMENTS)" />
              <div className="sm:col-span-2 rounded-lg border p-3" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A" }}>
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={taslak.ozelEvrak}
                    onChange={(e) => setTaslak((t) => ({ ...t, ozelEvrak: e.target.checked, evraklar: e.target.checked && t.evraklar.length === 0 ? [...varsayilanEvrak] : t.evraklar }))}
                    className="mt-0.5 accent-emerald-500"
                  />
                  <span>
                    <span className="block text-sm text-white">Bu müşteriye özel evrak listesi</span>
                    <span className="block text-xs" style={{ color: TEXT_MUTED }}>Kapalıysa Şablon Metinleri&apos;ndeki varsayılan liste kullanılır. Insurance Policy yalnızca CIF / CIP teslimde basılır.</span>
                  </span>
                </label>
                {taslak.ozelEvrak && (
                  <div className="mt-3">
                    <MetinListesiEditor
                      deger={taslak.evraklar}
                      degis={(v) => set("evraklar", v)}
                      encok={30}
                      yerTutucu="Commercial Invoice by the Sellers"
                      ekleEtiketi="Evrak ekle"
                      vurgula={(e) => (sigortaEvrakiMi(e) && !sigortaSatictaMi(taslak.teslim_sekli) ? `${taslak.teslim_sekli || "Bu teslim şekli"} için proformada basılmaz (sigorta alıcıda).` : null)}
                    />
                  </div>
                )}
                {sigortaUyari && <p className="text-[11px] mt-2 text-amber-400">Not: sigorta satırı listede kalabilir; proforma oluşturulurken teslim şekline göre otomatik çıkarılır.</p>}
              </div>

              <Alan etiket="Not (proformaya basılmaz)" tam>
                <textarea value={taslak.notlar} onChange={(e) => set("notlar", e.target.value)} rows={2} className={inputSinif} style={inputStil} />
              </Alan>
              <label className="sm:col-span-2 flex items-start gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={taslak.aktif} onChange={(e) => set("aktif", e.target.checked)} className="mt-0.5 accent-emerald-500" />
                <span>
                  <span className="block text-sm text-white">Aktif</span>
                  <span className="block text-xs" style={{ color: TEXT_MUTED }}>Pasif müşteri proforma hazırlarken listede çıkmaz.</span>
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
              <button onClick={() => setFormAcik(false)} disabled={kaydediliyor} className="px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
              <button onClick={kaydet} disabled={kaydediliyor} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:brightness-110 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
                {kaydediliyor ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {aktarAcik && companyId && (
        <GecmistenAktar tur="musteri" companyId={companyId} mevcut={musteriler} kapat={() => setAktarAcik(false)} eklendi={getir} />
      )}

      <ConfirmDialog
        open={!!silinecek}
        onOpenChange={(o) => !o && setSilinecek(null)}
        title="Müşteri kartı silinsin mi?"
        description={`"${silinecek?.unvan || ""}" (${silinecek?.kod || ""}) kartı silinecek. Mevcut ihracat dosyaları etkilenmez. Sadece listeden kaldırmak için kartı pasife alabilirsiniz.`}
        confirmLabel="Sil"
        cancelLabel="Vazgeç"
        destructive
        loading={siliniyor}
        loadingLabel="Siliniyor..."
        onConfirm={sil}
      />
    </AppShell>
  );
}

function Bolum({ baslik }: { baslik: string }) {
  return <p className="sm:col-span-2 pt-2 text-[11px] font-semibold uppercase tracking-wider border-b pb-1.5" style={{ color: ACCENT, borderColor: CARD_BORDER }}>{baslik}</p>;
}

function Alan({ etiket, not, hata, tam, children }: { etiket: string; not?: string; hata?: string; tam?: boolean; children: React.ReactNode }) {
  return (
    <div className={`block ${tam ? "sm:col-span-2" : ""}`}>
      <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>{etiket}</span>
      {children}
      {hata ? <span className="block text-[10px] mt-1 text-red-400">{hata}</span> : not && <span className="block text-[10px] mt-1" style={{ color: TEXT_MUTED }}>{not}</span>}
    </div>
  );
}
