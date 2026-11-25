"use client";

import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { Loader2, X, Merge, AlertTriangle } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { IcAlisSiparisi, IcTedarikci, alisHataMesaji, alisUrunYazi } from "@/lib/ic-piyasa/alis";
import { kgYazi } from "@/lib/ic-piyasa/is-emri";

/**
 * Ic Piyasa Alis - BAKIYE BIRLESTIR (25.11.2026). Kullanici: "Ic piyasa kismi icin alis birlestirilmesi gerekiyor"
 * (TMO dilekcesi: dort alisin kalan bakiyesi tek depodan cekilecek). Acik alislarin kalanini (miktar - teslim alinan)
 * tek yeni alisa aktarir: RPC ic_alis_bakiye_birlestir (migration 20261125140000). Kaynaklar teslim alinan miktarla
 * kapanir (hic teslim almamis olan "iptal · aktarildi"); kayit tutulur, yeni alisa arac alinmadiysa geri alinir.
 */

export type BirlestirmeKaynagi = { alis: IcAlisSiparisi & { ic_tedarikciler?: { unvan: string; kisa_ad: string | null } | null }; alinan: number; kantardaArac: number };

const girdi = "w-full px-3 py-2 rounded-lg border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";

export function IcAlisBirlestirPenceresi({ adaylar, tedarikciler, kapat, tamamlandi }: {
  /** Acik ve kalani olan alislar */
  adaylar: BirlestirmeKaynagi[];
  tedarikciler: IcTedarikci[];
  kapat: () => void;
  tamamlandi: (hedefNo: string) => void;
}) {
  const { showToast } = useToast();
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [tedarikciId, setTedarikciId] = useState("");
  const [urun, setUrun] = useState("");
  const [kod, setKod] = useState("");
  const [depo, setDepo] = useState("");
  const [termin, setTermin] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [isleniyor, setIsleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const kalan = (k: BirlestirmeKaynagi) => Math.max(0, Number(k.alis.miktar_kg) - k.alinan);
  const secilenler = useMemo(() => adaylar.filter((k) => secili.has(k.alis.id)), [adaylar, secili]);
  const toplam = secilenler.reduce((t, k) => t + kalan(k), 0);
  const urunler = new Set(secilenler.map((k) => k.alis.urun.trim().toLocaleLowerCase("tr")));
  const kantardaUyari = secilenler.filter((k) => k.kantardaArac > 0);
  const aktifTedarikciler = tedarikciler.filter((t) => t.aktif || t.id === tedarikciId);

  const sec = (id: string) => {
    const s = new Set(secili);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSecili(s);
    // Ilk secimde urun / kod onerisi (kullanici degistirebilir)
    if (!urun && s.size) {
      const ilk = adaylar.find((k) => s.has(k.alis.id));
      if (ilk) { setUrun(ilk.alis.urun); if (!kod) setKod(ilk.alis.urun_kodu || ""); }
    }
  };

  const hazir = secilenler.length >= 1 && urunler.size === 1 && !!tedarikciId && urun.trim().length > 0
    && Array.from(urunler)[0] === urun.trim().toLocaleLowerCase("tr");

  const birlestir = async () => {
    if (!hazir || isleniyor) return;
    setIsleniyor(true);
    setHata(null);
    const { data, error } = await supabase.rpc("ic_alis_bakiye_birlestir", {
      p_kaynaklar: secilenler.map((k) => k.alis.id), p_tedarikci: tedarikciId, p_urun: urun.trim(),
      p_urun_kodu: kod.trim() || null, p_depo: depo.trim() || null, p_termin: termin || null, p_aciklama: aciklama.trim() || null,
    });
    setIsleniyor(false);
    if (error) { setHata(alisHataMesaji(error)); return; }
    const hedefNo = (data as { hedef_no?: string } | null)?.hedef_no || "yeni alış";
    showToast(`${secilenler.length} siparişin kalanı (${kgYazi(toplam)}) ${hedefNo} siparişine aktarıldı.`, "success");
    tamamlandi(hedefNo);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="alis-birlestir-baslik" data-testid="alis-birlestir">
      <div className="w-full max-w-3xl rounded-2xl border shadow-2xl my-8" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div>
            <h2 id="alis-birlestir-baslik" className="text-white font-semibold flex items-center gap-2"><Merge size={16} style={{ color: ACCENT }} /> Bakiye Birleştir</h2>
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>Açık alışların kalanını tek yeni alış siparişine aktarır. Kaynaklar teslim alınan miktarla kapanır; işlem kaydedilir, yeni alışa araç alınmadıysa geri alınabilir.</p>
          </div>
          <button onClick={kapat} disabled={isleniyor} className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: TEXT_MUTED }}>Kaynak siparişler (açık · kalan &gt; 0)</p>
            {adaylar.length === 0 ? (
              <p className="text-sm" style={{ color: TEXT_MUTED }}>Kalanı olan açık alış siparişi yok.</p>
            ) : (
              <div className="rounded-lg border overflow-hidden" style={{ borderColor: CARD_BORDER }}>
                <table className="w-full text-left border-collapse">
                  <thead style={{ backgroundColor: ROW_HEADER_BG }}>
                    <tr>{["", "Alış No", "Tedarikçi / Depo", "Ürün", "Kalan"].map((b) => <th key={b} className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${b === "Kalan" ? "text-right" : ""}`} style={{ color: TEXT_MUTED }}>{b}</th>)}</tr>
                  </thead>
                  <tbody>
                    {adaylar.map((k) => {
                      const s = secili.has(k.alis.id);
                      return (
                        <tr key={k.alis.id} onClick={() => sec(k.alis.id)} className={`border-t cursor-pointer ${s ? "bg-emerald-500/[0.06]" : "hover:bg-white/[0.02]"}`} style={{ borderColor: CARD_BORDER }} data-birlestir-aday={k.alis.alis_no}>
                          <td className="px-3 py-2 w-8"><input type="checkbox" checked={s} onChange={() => sec(k.alis.id)} onClick={(e) => e.stopPropagation()} aria-label={`${k.alis.alis_no} seç`} className="accent-emerald-500" /></td>
                          <td className="px-3 py-2 text-sm font-bold text-white whitespace-nowrap">{k.alis.alis_no}</td>
                          <td className="px-3 py-2 text-xs">
                            <span className="text-white">{k.alis.ic_tedarikciler?.kisa_ad || k.alis.ic_tedarikciler?.unvan || "—"}</span>
                            <span className="block" style={{ color: TEXT_MUTED }}>{k.alis.depo || "—"}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-white whitespace-nowrap">
                            {alisUrunYazi(k.alis)}
                            {k.kantardaArac > 0 && <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-amber-400"><AlertTriangle size={11} /> kantarda {k.kantardaArac} araç</span>}
                          </td>
                          <td className="px-3 py-2 text-sm font-bold text-white text-right whitespace-nowrap tabular-nums">{kgYazi(kalan(k))}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG }}>
                      <td colSpan={4} className="px-3 py-2 text-xs text-right" style={{ color: TEXT_MUTED }}>{secilenler.length} sipariş seçildi · Toplam</td>
                      <td className="px-3 py-2 text-sm font-bold text-emerald-400 text-right whitespace-nowrap tabular-nums" data-testid="birlestir-toplam">{kgYazi(toplam)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: TEXT_MUTED }}>Yeni alış</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-xs sm:col-span-1" style={{ color: TEXT_MUTED }}>Tedarikçi
                <select value={tedarikciId} onChange={(e) => setTedarikciId(e.target.value)} className={`${girdi} mt-1`} style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
                  <option value="">Seçin</option>
                  {aktifTedarikciler.map((t) => <option key={t.id} value={t.id}>{t.kisa_ad || t.unvan}</option>)}
                </select>
              </label>
              <label className="text-xs" style={{ color: TEXT_MUTED }}>Ürün
                <input value={urun} onChange={(e) => setUrun(e.target.value)} className={`${girdi} mt-1 bg-transparent`} style={{ borderColor: CARD_BORDER }} />
              </label>
              <label className="text-xs" style={{ color: TEXT_MUTED }}>Ürün kodu
                <input value={kod} onChange={(e) => setKod(e.target.value)} maxLength={20} className={`${girdi} mt-1 bg-transparent`} style={{ borderColor: CARD_BORDER }} />
              </label>
              <label className="text-xs sm:col-span-2" style={{ color: TEXT_MUTED }}>Depo
                <input value={depo} onChange={(e) => setDepo(e.target.value)} maxLength={80} placeholder="Örn. KAPALI DEPO" className={`${girdi} mt-1 bg-transparent`} style={{ borderColor: CARD_BORDER }} />
              </label>
              <label className="text-xs" style={{ color: TEXT_MUTED }}>Termin
                <input type="date" value={termin} onChange={(e) => setTermin(e.target.value)} className={`${girdi} mt-1 bg-transparent`} style={{ borderColor: CARD_BORDER, colorScheme: "dark" }} />
              </label>
              <label className="text-xs sm:col-span-3" style={{ color: TEXT_MUTED }}>Açıklama
                <input value={aciklama} onChange={(e) => setAciklama(e.target.value)} maxLength={300} placeholder="Örn. TMO dilekçesi, tarih" className={`${girdi} mt-1 bg-transparent`} style={{ borderColor: CARD_BORDER }} />
              </label>
            </div>
          </div>

          {urunler.size > 1 && <p className="text-xs text-amber-400 flex items-center gap-1.5"><AlertTriangle size={13} /> Seçilen siparişlerin ürünleri farklı; yalnız aynı ürün birleştirilir.</p>}
          {urunler.size === 1 && urun.trim() && Array.from(urunler)[0] !== urun.trim().toLocaleLowerCase("tr") && (
            <p className="text-xs text-amber-400 flex items-center gap-1.5"><AlertTriangle size={13} /> Yeni alışın ürünü kaynaklarla aynı olmalı.</p>
          )}
          {kantardaUyari.length > 0 && (
            <p className="text-xs text-amber-400 flex items-center gap-1.5"><AlertTriangle size={13} /> {kantardaUyari.map((k) => k.alis.alis_no).join(", ")} için kantarda irsaliyesi bekleyen araç var; önce irsaliyeyi girin.</p>
          )}
          {secilenler.length > 0 && (
            <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} data-testid="birlestir-sonuc">
              <span className="text-white font-semibold">Sonuç:</span> {secilenler.length} sipariş kapanır (teslim alınan miktarla
              {secilenler.some((k) => k.alinan <= 0) ? `; hiç teslim almayan ${secilenler.filter((k) => k.alinan <= 0).map((k) => k.alis.alis_no).join(", ")} "İptal · aktarıldı"` : ""}).
              Yeni alış <span className="text-white font-semibold">{kgYazi(toplam)}</span> ile açılır.
            </div>
          )}
          {hata && <p className="text-xs text-red-400" role="alert">{hata}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
          <button onClick={kapat} disabled={isleniyor} className="px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
          <button onClick={birlestir} disabled={!hazir || isleniyor || kantardaUyari.length > 0} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }} data-testid="birlestir-onay">
            {isleniyor ? <Loader2 size={14} className="animate-spin" /> : <Merge size={14} />} Birleştir
          </button>
        </div>
      </div>
    </div>
  );
}
