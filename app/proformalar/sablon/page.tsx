"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, yazmaHatasi } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { ProformaSekmeler } from "@/components/proforma-sekmeler";
import { MetinListesiEditor } from "@/components/metin-listesi-editor";
import { ScrollText, Loader2, Save, AlertCircle, RotateCcw } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { VARSAYILAN_ALT_BILGI, VARSAYILAN_EVRAKLAR, VARSAYILAN_OZEL_SARTLAR, VARSAYILAN_UST_BILGI, sigortaEvrakiMi } from "@/lib/proforma/sabitler";
import { UST_BILGI_SINIR, listeTemizle, proformaHataMesaji, sablonListesiDogrula, varsayilanaEsitseNull, type ProformaAyar } from "@/lib/proforma/kayit";

/**
 * PROFORMALAR - Sablon metinleri (17.10.2026, 1. asama).
 * Taslak sablondaki sabit metinler (Special Conditions, Shipping Documents,
 * 1. sayfa alt bilgi, 2-3. sayfa sag ust surum bilgisi). Varsayilanla ayni
 * kalan bolum NULL kaydedilir (= uygulamadaki varsayilan).
 */

const inputSinif = "w-full px-3 py-2 rounded-lg border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const inputStil = { backgroundColor: "#0F131A", borderColor: CARD_BORDER } as const;

type Durum = { ozel: string[]; evrak: string[]; alt: string[]; tarih: string; rev: string };

const varsayilanDurum = (): Durum => ({
  ozel: [...VARSAYILAN_OZEL_SARTLAR], evrak: [...VARSAYILAN_EVRAKLAR], alt: [...VARSAYILAN_ALT_BILGI],
  tarih: VARSAYILAN_UST_BILGI.tarih, rev: VARSAYILAN_UST_BILGI.revizyon,
});

const ayardanDurum = (a: ProformaAyar | null): Durum => ({
  ozel: a?.ozel_sartlar?.length ? a.ozel_sartlar : [...VARSAYILAN_OZEL_SARTLAR],
  evrak: a?.evraklar?.length ? a.evraklar : [...VARSAYILAN_EVRAKLAR],
  alt: a?.alt_bilgi?.length ? a.alt_bilgi : [...VARSAYILAN_ALT_BILGI],
  tarih: a?.ust_bilgi_tarih || VARSAYILAN_UST_BILGI.tarih,
  rev: a?.ust_bilgi_revizyon || VARSAYILAN_UST_BILGI.revizyon,
});

const ayni = (a: string[], b: readonly string[]) => { const l = listeTemizle(a); return l.length === b.length && l.every((x, i) => x === b[i]); };

export default function ProformaSablonPage() {
  const { companyId, yetkiler, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const yetkili = !!yetkiler.sayfa_yetkileri.proformalar;

  const [kayitli, setKayitli] = useState<Durum>(varsayilanDurum);
  const [d, setD] = useState<Durum>(varsayilanDurum);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [sonGuncelleme, setSonGuncelleme] = useState<string | null>(null);

  const getir = useCallback(async () => {
    if (!companyId) return;
    setOkumaHatasi(null);
    const { data, error } = await supabase.from("proforma_ayarlari").select("*").eq("company_id", companyId).maybeSingle();
    if (error) { setOkumaHatasi(proformaHataMesaji(error)); setYukleniyor(false); return; }
    const durum = ayardanDurum(data as ProformaAyar | null);
    setKayitli(durum);
    setD(durum);
    setSonGuncelleme((data as ProformaAyar | null)?.updated_at || null);
    setYukleniyor(false);
  }, [companyId]);

  useEffect(() => {
    if (authLoading || !yetkili) return;
    getir();
  }, [authLoading, yetkili, getir]);

  const degisti = useMemo(() => JSON.stringify(d) !== JSON.stringify(kayitli), [d, kayitli]);

  useEffect(() => {
    if (!degisti) return;
    const uyar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", uyar);
    return () => window.removeEventListener("beforeunload", uyar);
  }, [degisti]);

  const kaydet = async () => {
    if (!companyId) return;
    const hata =
      sablonListesiDogrula("Özel şartlar", d.ozel, 1, 30) ||
      sablonListesiDogrula("Evrak listesi", d.evrak, 1, 30) ||
      sablonListesiDogrula("Alt bilgi", d.alt, 1, 6);
    if (hata) { showToast(hata, "error"); return; }
    const tarih = d.tarih.trim();
    const rev = d.rev.trim();
    if (!tarih || tarih.length > UST_BILGI_SINIR.tarih) { showToast(`Üst bilgi tarihi 1-${UST_BILGI_SINIR.tarih} karakter olmalı.`, "error"); return; }
    if (!rev || rev.length > UST_BILGI_SINIR.revizyon) { showToast(`Revizyon 1-${UST_BILGI_SINIR.revizyon} karakter olmalı.`, "error"); return; }
    const kayit = {
      company_id: companyId,
      ozel_sartlar: varsayilanaEsitseNull(d.ozel, VARSAYILAN_OZEL_SARTLAR),
      evraklar: varsayilanaEsitseNull(d.evrak, VARSAYILAN_EVRAKLAR),
      alt_bilgi: varsayilanaEsitseNull(d.alt, VARSAYILAN_ALT_BILGI),
      ust_bilgi_tarih: tarih === VARSAYILAN_UST_BILGI.tarih ? null : tarih,
      ust_bilgi_revizyon: rev === VARSAYILAN_UST_BILGI.revizyon ? null : rev,
    };
    setKaydediliyor(true);
    const { data, error } = await supabase.from("proforma_ayarlari").upsert(kayit, { onConflict: "company_id" }).select("company_id");
    setKaydediliyor(false);
    const yh = yazmaHatasi(error, data);
    if (yh) { showToast(`Kaydedilemedi: ${proformaHataMesaji({ message: yh })}`, "error"); return; }
    showToast("Şablon metinleri kaydedildi. Yeni proformalarda kullanılacak.", "success");
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
        ikon={<ScrollText size={20} />}
        baslik="Proformalar · Şablon Metinleri"
        aciklama="Proformanın sabit metinleri. Değişiklikler sadece bundan sonra hazırlanan proformalara uygulanır."
        sag={
          <button onClick={kaydet} disabled={kaydediliyor || !degisti || !!okumaHatasi} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white hover:brightness-110 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
            {kaydediliyor ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {degisti ? "Değişiklikleri Kaydet" : "Kaydedildi"}
          </button>
        }
      />
      <ProformaSekmeler />

      {okumaHatasi && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "#7F1D1D", backgroundColor: "rgba(127,29,29,0.15)", color: "#FCA5A5" }}>
          <span className="flex items-center gap-2"><AlertCircle size={16} /> {okumaHatasi}</span>
          <button onClick={getir} className="underline">Yeniden dene</button>
        </div>
      )}

      {sonGuncelleme && (
        <p className="mb-3 text-xs" style={{ color: TEXT_MUTED }}>Son kayıt: {new Date(sonGuncelleme).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}</p>
      )}

      <div className="grid gap-4">
        <Kart
          baslik="Special Conditions (Özel Şartlar)"
          aciklama="Sözleşme sayfasındaki maddeler. Numara otomatik verilir. Satır içinde alt satıra geçebilirsiniz (Enter)."
          varsayilan={ayni(d.ozel, VARSAYILAN_OZEL_SARTLAR)}
          sifirla={() => setD({ ...d, ozel: [...VARSAYILAN_OZEL_SARTLAR] })}
        >
          <MetinListesiEditor deger={d.ozel} degis={(v) => setD({ ...d, ozel: v })} encok={30} satirYuksekligi={2} ekleEtiketi="Madde ekle" />
        </Kart>

        <Kart
          baslik="Shipping Documents (Varsayılan Evrak Listesi)"
          aciklama="Müşteri kartında özel liste yoksa bu liste basılır. Insurance Policy yalnızca CIF / CIP teslimde basılır, diğerlerinde otomatik çıkarılır."
          varsayilan={ayni(d.evrak, VARSAYILAN_EVRAKLAR)}
          sifirla={() => setD({ ...d, evrak: [...VARSAYILAN_EVRAKLAR] })}
        >
          <MetinListesiEditor deger={d.evrak} degis={(v) => setD({ ...d, evrak: v })} encok={30} ekleEtiketi="Evrak ekle" vurgula={(e) => (sigortaEvrakiMi(e) ? "Sadece CIF / CIP teslimde basılır" : null)} />
        </Kart>

        <div className="grid gap-4 lg:grid-cols-2">
          <Kart
            baslik="1. Sayfa Alt Bilgi"
            aciklama="Proforma sayfasının altındaki satırlar (en fazla 6)."
            varsayilan={ayni(d.alt, VARSAYILAN_ALT_BILGI)}
            sifirla={() => setD({ ...d, alt: [...VARSAYILAN_ALT_BILGI] })}
          >
            <MetinListesiEditor deger={d.alt} degis={(v) => setD({ ...d, alt: v })} encok={6} numarali={false} ekleEtiketi="Satır ekle" />
          </Kart>

          <Kart
            baslik="2-3. Sayfa Sağ Üst Bilgi"
            aciklama="Şablonun kendi sürüm bilgisi (proforma tarihi değildir). Şablon metni değiştiğinde revizyon numarasını artırın."
            varsayilan={d.tarih.trim() === VARSAYILAN_UST_BILGI.tarih && d.rev.trim() === VARSAYILAN_UST_BILGI.revizyon}
            sifirla={() => setD({ ...d, tarih: VARSAYILAN_UST_BILGI.tarih, rev: VARSAYILAN_UST_BILGI.revizyon })}
          >
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Date</span>
                <input value={d.tarih} onChange={(e) => setD({ ...d, tarih: e.target.value })} maxLength={UST_BILGI_SINIR.tarih} placeholder="28/09/26" className={inputSinif} style={inputStil} />
              </label>
              <label className="block">
                <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Revision n°</span>
                <input value={d.rev} onChange={(e) => setD({ ...d, rev: e.target.value })} maxLength={UST_BILGI_SINIR.revizyon} placeholder="01" className={inputSinif} style={inputStil} />
              </label>
            </div>
            <p className="mt-3 text-xs font-mono rounded-lg border px-3 py-2" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
              Date: {d.tarih.trim() || "-"} &nbsp; Revision n°: {d.rev.trim() || "-"}
            </p>
          </Kart>
        </div>
      </div>
    </AppShell>
  );
}

function Kart({ baslik, aciklama, varsayilan, sifirla, children }: { baslik: string; aciklama: string; varsayilan: boolean; sifirla: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            {baslik}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${varsayilan ? "bg-white/5 text-slate-400" : "bg-amber-500/15 text-amber-400"}`}>{varsayilan ? "Varsayılan" : "Özelleştirilmiş"}</span>
          </h2>
          <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{aciklama}</p>
        </div>
        {!varsayilan && (
          <button type="button" onClick={sifirla} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>
            <RotateCcw size={12} /> Varsayılana dön
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
