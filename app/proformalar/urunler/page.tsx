"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { ProformaSekmeler } from "@/components/proforma-sekmeler";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Package, Plus, Loader2, Pencil, Trash2, X, Save, AlertCircle, ArrowUp, ArrowDown } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { proformaHataMesaji, urunKaydiHazirla, type IhracatUrun } from "@/lib/proforma/kayit";

/**
 * PROFORMALAR - Urun kutuphanesi (17.10.2026, 1. asama).
 * Proformadaki "DESCRIPTION OF GOODS" bu listeden secilir; MARKA her satirda
 * ayri girilir ve "URUN (MARKA BRAND)" olarak basilir.
 */

const inputSinif = "w-full px-3 py-2 rounded-lg border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const inputStil = { backgroundColor: "#0F131A", borderColor: CARD_BORDER } as const;

type Taslak = { ad: string; kg: string; aktif: boolean };

export default function ProformaUrunlerPage() {
  const { companyId, yetkiler, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const yetkili = !!yetkiler.sayfa_yetkileri.proformalar;

  const [urunler, setUrunler] = useState<IhracatUrun[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [duzenlenen, setDuzenlenen] = useState<IhracatUrun | null>(null);
  const [formAcik, setFormAcik] = useState(false);
  const [taslak, setTaslak] = useState<Taslak>({ ad: "", kg: "25", aktif: true });
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [silinecek, setSilinecek] = useState<IhracatUrun | null>(null);
  const [siliniyor, setSiliniyor] = useState(false);
  const [siralaniyor, setSiralaniyor] = useState(false);

  const getir = useCallback(async () => {
    if (!companyId) return;
    setOkumaHatasi(null);
    const { data, error } = await supabase.from("ihracat_urunleri").select("*").eq("company_id", companyId).order("sira").order("ad");
    if (error) { setOkumaHatasi(proformaHataMesaji(error)); setYukleniyor(false); return; }
    setUrunler((data || []) as IhracatUrun[]);
    setYukleniyor(false);
  }, [companyId]);

  useEffect(() => {
    if (authLoading || !yetkili) return;
    getir();
  }, [authLoading, yetkili, getir]);

  const enBuyukSira = useMemo(() => Math.max(0, ...urunler.map((u) => u.sira || 0)), [urunler]);

  const yeniAc = () => { setDuzenlenen(null); setTaslak({ ad: "", kg: "25", aktif: true }); setFormAcik(true); };
  const duzenleAc = (u: IhracatUrun) => { setDuzenlenen(u); setTaslak({ ad: u.ad, kg: String(u.varsayilan_ambalaj_kg), aktif: u.aktif }); setFormAcik(true); };

  const kaydet = async () => {
    if (!companyId) return;
    const r = urunKaydiHazirla(taslak.ad, taslak.kg);
    if ("hata" in r) { showToast(r.hata, "error"); return; }
    setKaydediliyor(true);
    const sonuc = duzenlenen
      ? await supabase.from("ihracat_urunleri").update({ ...r.kayit, aktif: taslak.aktif }).eq("id", duzenlenen.id).eq("company_id", companyId).select("id")
      : await supabase.from("ihracat_urunleri").insert({ ...r.kayit, aktif: taslak.aktif, sira: enBuyukSira + 10, company_id: companyId }).select("id");
    setKaydediliyor(false);
    const hata = yazmaHatasi(sonuc.error, sonuc.data);
    if (hata) { showToast(`Kaydedilemedi: ${proformaHataMesaji({ message: hata })}`, "error"); return; }
    showToast(duzenlenen ? "Ürün güncellendi." : "Ürün eklendi.", "success");
    setFormAcik(false);
    getir();
  };

  /** Komsu iki urunun sirasini degistir (ikisi de ayni sira ise once 10'arli yeniden numaralanir). */
  const tasi = async (i: number, yon: -1 | 1) => {
    if (!companyId || siralaniyor) return;
    const j = i + yon;
    if (j < 0 || j >= urunler.length) return;
    const yeni = [...urunler];
    [yeni[i], yeni[j]] = [yeni[j], yeni[i]];
    const guncellenecek = yeni.map((u, k) => ({ id: u.id, sira: (k + 1) * 10 })).filter((x, k) => yeni[k].sira !== x.sira);
    setSiralaniyor(true);
    setUrunler(yeni.map((u, k) => ({ ...u, sira: (k + 1) * 10 })));
    for (const g of guncellenecek) {
      const { data, error } = await supabase.from("ihracat_urunleri").update({ sira: g.sira }).eq("id", g.id).eq("company_id", companyId).select("id");
      const hata = yazmaHatasi(error, data);
      if (hata) { showToast(`Sıra kaydedilemedi: ${proformaHataMesaji({ message: hata })}`, "error"); break; }
    }
    setSiralaniyor(false);
    getir();
  };

  const sil = async () => {
    if (!silinecek || !companyId) return;
    setSiliniyor(true);
    const { data, error } = await supabase.from("ihracat_urunleri").delete().eq("id", silinecek.id).eq("company_id", companyId).select("id");
    setSiliniyor(false);
    const hata = yazmaHatasi(error, data);
    setSilinecek(null);
    if (hata) { showToast(proformaHataMesaji({ message: hata }), "error"); return; }
    showToast("Ürün silindi.", "success");
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
        ikon={<Package size={20} />}
        baslik="Proforma Ayarları · Ürünler"
        aciklama="İsteğe bağlı ürün listesi. Yeni Proforma'da ürün kutusu bu listeyi ve geçmiş dosyalardaki ürünleri önerir; marka her satırda ayrı yazılır."
        sag={
          <div className="flex flex-wrap gap-2">
            <button onClick={yeniAc} disabled={!!okumaHatasi} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white hover:brightness-110 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
              <Plus size={14} /> Yeni Ürün
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

      <div className="rounded-xl border shadow-sm" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        {urunler.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Package size={30} className="mx-auto mb-2" style={{ color: "#3A4152" }} />
            <p className="text-sm" style={{ color: TEXT_MUTED }}>Henüz ürün eklenmedi. Zorunlu değil: Yeni Proforma geçmiş dosyalardaki ürünleri zaten önerir.</p>
            {!okumaHatasi && (
              <button onClick={yeniAc} className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: "#E2E8F0" }}>
                <Plus size={14} /> Ürün ekle
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr style={{ backgroundColor: ROW_HEADER_BG }}>
                  {["Sıra", "Ürün açıklaması", "Varsayılan ambalaj", ""].map((b, i) => (
                    <th key={i} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: TEXT_MUTED }}>{b}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {urunler.map((u, i) => (
                  <tr key={u.id} className={`border-t ${u.aktif ? "" : "opacity-50"}`} style={{ borderColor: CARD_BORDER }}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button onClick={() => tasi(i, -1)} disabled={i === 0 || siralaniyor} title="Yukarı" className="p-1 rounded hover:bg-white/5 disabled:opacity-30" style={{ color: TEXT_MUTED }}><ArrowUp size={13} /></button>
                      <button onClick={() => tasi(i, 1)} disabled={i === urunler.length - 1 || siralaniyor} title="Aşağı" className="p-1 rounded hover:bg-white/5 disabled:opacity-30" style={{ color: TEXT_MUTED }}><ArrowDown size={13} /></button>
                    </td>
                    <td className="px-4 py-3 text-white">{u.ad}{!u.aktif && <span className="ml-2 text-xs" style={{ color: TEXT_MUTED }}>· Pasif</span>}</td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: TEXT_MUTED }}>{Number(u.varsayilan_ambalaj_kg)} kg</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button onClick={() => duzenleAc(u)} title="Düzenle" className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }}><Pencil size={14} /></button>
                      <button onClick={() => setSilinecek(u)} title="Sil" className="p-1.5 rounded hover:bg-red-500/10 text-red-400"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formAcik && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="ihr-urun-baslik">
          <div className="w-full max-w-xl rounded-2xl border shadow-2xl my-8" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
              <h2 id="ihr-urun-baslik" className="text-base font-semibold text-white">{duzenlenen ? "Ürünü Düzenle" : "Yeni Ürün"}</h2>
              <button onClick={() => !kaydediliyor && setFormAcik(false)} className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <label className="block">
                <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Ürün açıklaması * (marka hariç)</span>
                <textarea value={taslak.ad} onChange={(e) => setTaslak({ ...taslak, ad: e.target.value })} rows={2} placeholder="PREMIUM QUALITY WHEAT FLOUR" className={inputSinif} style={inputStil} autoFocus />
                <span className="block text-[10px] mt-1" style={{ color: TEXT_MUTED }}>Teknik özellik gerekiyorsa parantez içinde yazılabilir: ALL PURPOSE FLOUR (Moisture Max. 13,5%, …)</span>
              </label>
              <label className="block max-w-[200px]">
                <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Varsayılan ambalaj (kg)</span>
                <input value={taslak.kg} onChange={(e) => setTaslak({ ...taslak, kg: e.target.value })} inputMode="decimal" className={inputSinif} style={inputStil} />
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={taslak.aktif} onChange={(e) => setTaslak({ ...taslak, aktif: e.target.checked })} className="mt-0.5 accent-emerald-500" />
                <span>
                  <span className="block text-sm text-white">Aktif</span>
                  <span className="block text-xs" style={{ color: TEXT_MUTED }}>Pasif ürün proforma hazırlarken listede çıkmaz.</span>
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

      <ConfirmDialog
        open={!!silinecek}
        onOpenChange={(o) => !o && setSilinecek(null)}
        title="Ürün silinsin mi?"
        description={`"${silinecek?.ad || ""}" kütüphaneden silinecek. Mevcut dosyalar ve proformalar etkilenmez.`}
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
