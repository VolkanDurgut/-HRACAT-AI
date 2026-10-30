"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { IcPiyasaSekmeler } from "@/components/ic-piyasa-sekmeler";
import { Sheet, Loader2, AlertCircle, Download, RefreshCw } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { tonYazi } from "@/lib/ic-piyasa/is-emri";
import { PARA_SEMBOL, bugunTRIso, gunTR } from "@/lib/ic-piyasa/alis";
import {
  RaporAlisGirdi, RaporAlisSatiri, RaporSatisGirdi, RaporSatisSatiri, alisSatirlari, alisToplami, satisSatirlari, satisToplami,
} from "@/lib/ic-piyasa/siparis-raporu";
import { raporXlsx } from "@/lib/ic-piyasa/siparis-raporu-xlsx";

/**
 * Ic Piyasa - SATIS & ALIS SIPARIS RAPORU (30.10.2026).
 * Lojistigin her gun elle hazirladigi Excel'in (SATIS + ALIS SIPARIS RAPORU)
 * sistemden uretilen hali; ayni duzende .xlsx indirilir. Satis tablosu "ic_piyasa",
 * alis tablosu "ic_alis" yetkisiyle gorunur. Hesap: lib/ic-piyasa/siparis-raporu.ts.
 */

const TAMAMLANAN_SECENEK: { gun: number; etiket: string }[] = [
  { gun: 0, etiket: "Bugün kapananlar" },
  { gun: 7, etiket: "Son 7 gün" },
  { gun: 30, etiket: "Son 30 gün" },
  { gun: -1, etiket: "Tümü" },
];

const sayi = (n: number | null | undefined) => (n === null || n === undefined ? "" : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 }));
const fiyat = (n: number | null | undefined, hane = 2) => (n === null || n === undefined ? "" : Number(n).toLocaleString("tr-TR", { minimumFractionDigits: hane, maximumFractionDigits: 4 }));

export default function SiparisRaporuPage() {
  const { companyId, yetkiler, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const satisYetki = !!yetkiler.sayfa_yetkileri.ic_piyasa;
  const alisYetki = !!yetkiler.sayfa_yetkileri.ic_alis;

  const [satisGirdi, setSatisGirdi] = useState<RaporSatisGirdi[]>([]);
  const [alisGirdi, setAlisGirdi] = useState<RaporAlisGirdi[]>([]);
  const [alisOkunamadi, setAlisOkunamadi] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);
  const [tamamlananGun, setTamamlananGun] = useState(7);
  const [indiriliyor, setIndiriliyor] = useState(false);
  const bugun = bugunTRIso();

  const getir = useCallback(async () => {
    if (!companyId) return;
    setHata(null);
    // ---- Satis ----
    const eRes = await supabase.from("ic_is_emirleri")
      .select("id, is_emri_no, durum, kapanis_zamani, olusturma, siparis_tarihi, musteri_siparis_no, urun, ambalaj, hedef_tur, hedef_kg, hedef_arac, birim_fiyat, vade_gun, teslim, teslim_suresi_gun, ic_musteriler(unvan)")
      .eq("company_id", companyId).neq("durum", "iptal").order("olusturma").limit(1000);
    if (eRes.error) { setHata(eRes.error.message); setYukleniyor(false); return; }
    type E = Omit<RaporSatisGirdi, "musteri" | "sevk_kg" | "sevk_arac" | "dogrudan"> & { ic_musteriler: { unvan: string } | null };
    const emirler = (eRes.data || []) as unknown as E[];
    const sevkKg = new Map<string, number>(); const sevkArac = new Map<string, number>(); const sevkEmri = new Map<string, string>();
    if (emirler.length) {
      const sRes = await supabase.from("ic_sevkler").select("id, is_emri_id, net_kg").eq("company_id", companyId).in("is_emri_id", emirler.map((e) => e.id));
      if (sRes.error) { setHata(sRes.error.message); setYukleniyor(false); return; }
      for (const s of (sRes.data || []) as { id: string; is_emri_id: string; net_kg: number }[]) {
        sevkKg.set(s.is_emri_id, (sevkKg.get(s.is_emri_id) || 0) + Number(s.net_kg));
        sevkArac.set(s.is_emri_id, (sevkArac.get(s.is_emri_id) || 0) + 1);
        sevkEmri.set(s.id, s.is_emri_id);
      }
    }
    // ---- Alis (yalniz yetkili) ----
    const dogrudanEmir = new Set<string>();
    let alis: RaporAlisGirdi[] = [];
    let alisHata = false;
    if (alisYetki) {
      const aRes = await supabase.from("ic_alis_siparisleri")
        .select("id, alis_no, durum, kapanis_zamani, olusturma, siparis_tarihi, depo, tedarikci_siparis_no, urun, urun_kodu, miktar_kg, birim_fiyat, para_birimi, vade_gun, termin, teslim, ic_tedarikciler(unvan)")
        .eq("company_id", companyId).neq("durum", "iptal").order("siparis_tarihi").limit(1000);
      if (aRes.error) { alisHata = true; }
      else {
        type A = Omit<RaporAlisGirdi, "tedarikci" | "alinan_kg" | "alinan_arac"> & { ic_tedarikciler: { unvan: string } | null };
        const al = (aRes.data || []) as unknown as A[];
        const kg = new Map<string, number>(); const arac = new Map<string, number>();
        if (al.length) {
          const tRes = await supabase.from("ic_alis_teslimler").select("alis_id, net_kg, gecmis, sevk_id").eq("company_id", companyId).in("alis_id", al.map((a) => a.id));
          if (tRes.error) alisHata = true;
          for (const t of (tRes.data || []) as { alis_id: string; net_kg: number; gecmis: boolean; sevk_id: string | null }[]) {
            kg.set(t.alis_id, (kg.get(t.alis_id) || 0) + Number(t.net_kg));
            if (!t.gecmis) arac.set(t.alis_id, (arac.get(t.alis_id) || 0) + 1);
            const emir = t.sevk_id ? sevkEmri.get(t.sevk_id) : undefined;
            if (emir) dogrudanEmir.add(emir);
          }
        }
        alis = al.map(({ ic_tedarikciler, ...a }) => ({ ...a, tedarikci: ic_tedarikciler?.unvan || "-", alinan_kg: kg.get(a.id) || 0, alinan_arac: arac.get(a.id) || 0 }));
      }
    }
    setSatisGirdi(emirler.map(({ ic_musteriler, ...e }) => ({
      ...e, musteri: ic_musteriler?.unvan || "-", sevk_kg: sevkKg.get(e.id) || 0, sevk_arac: sevkArac.get(e.id) || 0, dogrudan: dogrudanEmir.has(e.id),
    })));
    setAlisGirdi(alis);
    setAlisOkunamadi(alisHata);
    setYukleniyor(false);
  }, [companyId, alisYetki]);

  useEffect(() => { if (!authLoading && satisYetki) getir(); }, [authLoading, satisYetki, getir]);

  const satis = useMemo(() => satisSatirlari(satisGirdi, bugun, tamamlananGun), [satisGirdi, bugun, tamamlananGun]);
  const alis = useMemo(() => alisSatirlari(alisGirdi, bugun, tamamlananGun), [alisGirdi, bugun, tamamlananGun]);
  const st = satisToplami(satis);
  const at = alisToplami(alis);

  const indir = async () => {
    setIndiriliyor(true);
    try {
      const blob = await raporXlsx(bugun, satis, alis, alisYetki);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      // Dosya adi ASCII: Chromium Turkce harfli download adini reddedip "download" yapabiliyor (30.10.2026 olculdu)
      a.download = `${gunTR(bugun)}_SIPARIS_ALIM_RAPORU.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      showToast(`Excel oluşturulamadı: ${(e as Error).message}`, "error");
    }
    setIndiriliyor(false);
  };

  return (
    <AppShell>
      <div className="p-4 md:p-8 max-w-[1700px] mx-auto">
        <SayfaBasligi
          ikon={<Sheet size={20} />}
          baslik="Satış & Alış Sipariş Raporu"
          aciklama={`Aktif bekleyen ve tamamlanan siparişler · ${gunTR(bugun)} · tamamlanan satırlar yeşil`}
          sag={
            <div className="flex flex-wrap items-center gap-2">
              <select value={tamamlananGun} onChange={(e) => setTamamlananGun(Number(e.target.value))} aria-label="Tamamlanan siparişler"
                className="px-3 py-2 rounded-lg border text-sm text-white" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                {TAMAMLANAN_SECENEK.map((s) => <option key={s.gun} value={s.gun}>Tamamlanan: {s.etiket}</option>)}
              </select>
              <button onClick={getir} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}><RefreshCw size={13} /> Yenile</button>
              <button onClick={indir} disabled={indiriliyor || yukleniyor} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
                {indiriliyor ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Excel İndir
              </button>
            </div>
          }
        />
        <IcPiyasaSekmeler />

        {hata && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm text-red-300" style={{ borderColor: "#7F1D1D", backgroundColor: "rgba(127,29,29,0.2)" }}>
            <AlertCircle size={15} /> Rapor okunamadı: {hata} <button onClick={getir} className="underline ml-auto">Yeniden dene</button>
          </div>
        )}

        {yukleniyor ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={26} className="animate-spin" style={{ color: ACCENT }} /></div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kutu e="Satış · aktif sipariş" d={String(st.satir - st.tamamlanan)} a={`${st.tamamlanan} tamamlanan gösteriliyor`} />
              <Kutu e="Satış · sevk bekleyen" d={tonYazi(st.bekleyenKg)} a={`sevk edilen ${tonYazi(st.gerceklesenKg)}`} renk="text-sky-400" />
              {alisYetki && <Kutu e="Alış · aktif sipariş" d={String(at.satir - at.tamamlanan)} a={`${at.tamamlanan} tamamlanan gösteriliyor`} />}
              {alisYetki && <Kutu e="Alış · teslim bekleyen" d={tonYazi(at.bekleyenKg)} a={`teslim alınan ${tonYazi(at.gerceklesenKg)}`} renk="text-amber-400" />}
            </div>

            <RaporTablosu baslik="SATIŞ SİPARİŞ RAPORU (AKTİF BEKLEYEN & TAMAMLANAN)" bos="Aktif satış siparişi yok."
              basliklar={["No", "Fiş Tarihi", "Cari Hesap Ünvanı", "Sipariş No", "Malzeme Açıklaması", "Birim", "Sipariş Miktarı (kg)", "Sevk Edilen (kg)", "Bekleyen (kg)", "Birim Fiyat", "Vade", "Toplam Tutar", "Termin", "Teslim / Satış", "Sistem No"]}
              sagaYasli={[0, 6, 7, 8, 9, 11]}
              satirlar={satis.map((s: RaporSatisSatiri, i) => ({
                tamam: s.tamamlandi, key: s.id,
                hucreler: [String(i + 1), gunTR(s.fisTarihi), s.cari, s.siparisNo, s.malzeme, s.birim,
                  s.siparisKg !== null ? sayi(s.siparisKg) : (s.siparisArac ? `${s.siparisArac} araç` : ""),
                  sayi(s.sevkKg), sayi(s.bekleyenKg), fiyat(s.birimFiyat), s.vade, fiyat(s.tutar), s.termin, s.teslim, s.kayitNo],
              }))}
              toplam={["", "", "", "", "", "TOPLAM", sayi(st.siparisKg), sayi(st.gerceklesenKg), sayi(st.bekleyenKg), "", "", fiyat(st.tutar.TRY ?? null), "", "", ""]}
            />

            {alisYetki ? (
              alisOkunamadi ? (
                <p className="text-sm text-amber-300 flex items-center gap-2"><AlertCircle size={14} /> Alış tablosu okunamadı (veritabanı güncellemesi uygulanmamış olabilir).</p>
              ) : (
                <RaporTablosu baslik="ALIŞ SİPARİŞ RAPORU (AKTİF BEKLEYEN & TAMAMLANAN)" bos="Aktif alış siparişi yok."
                  basliklar={["No", "Fiş Tarihi", "Cari Hesap Ünvanı", "Sipariş No", "Malzeme Açıklaması", "Birim", "Sipariş Miktarı (kg)", "Teslim Alınan (kg)", "Bekleyen (kg)", "Birim Fiyat", "Vade", "Termin", "Teslim / Alım", "Toplam Tutar", "Sistem No"]}
                  sagaYasli={[0, 6, 7, 8, 9, 13]}
                  satirlar={alis.map((a: RaporAlisSatiri, i) => ({
                    tamam: a.tamamlandi, key: a.id,
                    hucreler: [String(i + 1), gunTR(a.fisTarihi), a.cari, a.siparisNo, a.malzeme, a.birim, sayi(a.siparisKg), sayi(a.alinanKg), sayi(a.bekleyenKg),
                      a.birimFiyat === null ? "" : `${fiyat(a.birimFiyat, a.paraBirimi === "TRY" ? 2 : 4)}${a.paraBirimi === "TRY" ? "" : ` ${PARA_SEMBOL[a.paraBirimi]}`}`,
                      a.vade, a.termin ? gunTR(a.termin) : "", a.teslim,
                      a.tutar === null ? "" : `${fiyat(a.tutar)}${a.paraBirimi === "TRY" ? "" : ` ${PARA_SEMBOL[a.paraBirimi]}`}`, a.kayitNo],
                  }))}
                  toplam={["", "", "", "", "", "TOPLAM", sayi(at.siparisKg), sayi(at.gerceklesenKg), sayi(at.bekleyenKg), "", "", "", "",
                    Object.entries(at.tutar).map(([p, t]) => `${fiyat(t)} ${PARA_SEMBOL[p as keyof typeof PARA_SEMBOL] || p}`).join(" + "), ""]}
                />
              )
            ) : (
              <p className="text-xs" style={{ color: TEXT_MUTED }}>Alış tablosu &quot;İç Piyasa Alış&quot; yetkisi olanlara görünür.</p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Kutu({ e, d, a, renk = "text-white" }: { e: string; d: string; a: string; renk?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>{e}</p>
      <p className={`text-xl font-bold ${renk}`}>{d}</p>
      <p className="text-[11px] mt-0.5" style={{ color: TEXT_MUTED }}>{a}</p>
    </div>
  );
}

/** Uzun metin sutunlari satir kirabilir (cari / siparis no / malzeme); digerleri tek satir. */
const GENIS_SUTUN: Record<number, string> = { 2: "min-w-[190px]", 3: "min-w-[170px]", 4: "min-w-[140px]" };

function RaporTablosu({ baslik, basliklar, satirlar, toplam, sagaYasli, bos }: {
  baslik: string; basliklar: string[]; satirlar: { key: string; tamam: boolean; hucreler: string[] }[]; toplam: string[]; sagaYasli: number[]; bos: string;
}) {
  return (
    <section className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} aria-label={baslik}>
      <h2 className="px-4 py-3 text-sm font-bold text-white text-center border-b" style={{ borderColor: CARD_BORDER }}>{baslik}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1400px]">
          <thead style={{ backgroundColor: ROW_HEADER_BG }}>
            <tr>{basliklar.map((b, i) => <th key={b} className={`px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${sagaYasli.includes(i) ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>)}</tr>
          </thead>
          <tbody>
            {satirlar.length === 0 ? (
              <tr><td colSpan={basliklar.length} className="px-4 py-6 text-center text-sm" style={{ color: TEXT_MUTED }}>{bos}</td></tr>
            ) : satirlar.map((s) => (
              <tr key={s.key} className="border-t" style={{ borderColor: CARD_BORDER, backgroundColor: s.tamam ? "rgba(16,185,129,0.16)" : undefined }} data-tamam={s.tamam ? "1" : "0"}>
                {s.hucreler.map((h, i) => (
                  <td key={i} className={`px-2.5 py-2 text-xs ${sagaYasli.includes(i) ? "text-right whitespace-nowrap" : ""} ${GENIS_SUTUN[i] || "whitespace-nowrap"} ${s.tamam ? "text-emerald-100" : "text-white"}`}>{h || <span style={{ color: TEXT_MUTED }}>—</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {satirlar.length > 0 && (
            <tfoot>
              <tr className="border-t" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                {toplam.map((h, i) => <td key={i} className={`px-2.5 py-2 text-xs font-bold text-white ${sagaYasli.includes(i) || h === "TOPLAM" ? "text-right whitespace-nowrap" : ""}`}>{h}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
