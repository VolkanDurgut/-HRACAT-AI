"use client";

/**
 * Dosya sayfasi ust cubugu: BIRLESIK FATURA (19.11.2026). Kullanici: "Ayni musterinin ayni gemideki butun siparisleri
 * icin tek fatura kesmek istiyoruz." Karar: sistem ONERIR, kullanici tek tikla birlestirir.
 *  - Dosya bir gruptaysa: "Birlesik fatura · N dosya" + gruptan cikar. Fatura Talimati dugmeleri grubun TEK talimatini uretir.
 *  - Grupta degilse ve ayni musteri + ayni gemi-sefer + acik ve faturasiz baska dosyalar varsa: "Tek faturada birlestir".
 * Kurallar ve yazma: veritabani RPC'leri (lib/birlesik-fatura/veri.ts). Yetkisi olmayan kullanicida kart gorunmez.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Layers, Loader2, X } from "lucide-react";
import { useToast } from "@/lib/toast-context";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { BIRLESIK_FATURA_OLAYI, birlesikDurumGetir, birlestir, gruptanCikar, type BirlesikDurum } from "@/lib/birlesik-fatura/veri";
import { ACCENT, CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";

export function BirlesikFaturaDurumu({ dosyaId, dosyaNo, gemi }: { dosyaId: string; dosyaNo: string | null; gemi: string | null }) {
  const { showToast } = useToast();
  const [durum, setDurum] = useState<BirlesikDurum | null>(null);
  const [secim, setSecim] = useState<Set<string>>(new Set());
  const [pencere, setPencere] = useState(false);
  const [cikarAc, setCikarAc] = useState(false);
  const [mesgul, setMesgul] = useState(false);

  const getir = useCallback(async () => {
    try { setDurum(await birlesikDurumGetir(dosyaId)); } catch { setDurum(null); }
  }, [dosyaId]);
  useEffect(() => {
    getir();
    window.addEventListener(BIRLESIK_FATURA_OLAYI, getir);
    return () => window.removeEventListener(BIRLESIK_FATURA_OLAYI, getir);
  }, [getir]);

  if (!durum) return null;
  const grupta = !!durum.grup_id;
  const bosAdaylar = durum.adaylar.filter((a) => !a.grup_id);
  if (!grupta && bosAdaylar.length === 0) return null;

  const ac = () => { setSecim(new Set(bosAdaylar.map((a) => a.id))); setPencere(true); };
  const kaydet = async () => {
    if (!secim.size) return;
    setMesgul(true);
    try {
      await birlestir(dosyaId, Array.from(secim));
      showToast(`Birleşik fatura kuruldu: ${secim.size + (grupta ? durum.uyeler.length : 1)} dosya tek faturada. Fatura talimatı artık bütün dosyaları kapsar.`, "success");
      setPencere(false);
      await getir();
    } catch (e) { showToast(e instanceof Error ? e.message : "Birleştirilemedi.", "error"); }
    setMesgul(false);
  };
  const cikar = async () => {
    setMesgul(true);
    try { await gruptanCikar(dosyaId); showToast(`${dosyaNo || "Dosya"} birleşik faturadan çıkarıldı; fatura talimatı yalnız bu dosya için hazırlanır.`, "success"); await getir(); }
    catch (e) { showToast(e instanceof Error ? e.message : "Çıkarılamadı.", "error"); }
    setMesgul(false);
  };

  const kucukDugme = "inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] hover:bg-white/5 disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]" data-testid="birlesik-fatura-durumu" data-grupta={grupta ? "evet" : "hayir"}>
      {grupta ? (
        <>
          <span className="inline-flex items-center gap-1" style={{ color: ACCENT }} title={durum.uyeler.map((u) => u.dosya_no).join(", ")}>
            <Layers size={12} /> Birleşik fatura · {durum.uyeler.length} dosya: {durum.uyeler.map((u) => (u.dosya_no || "").replace(/^IHR-\d{4}-/, "")).join(", ")}
          </span>
          {bosAdaylar.length > 0 && <button type="button" onClick={ac} disabled={mesgul} className={kucukDugme} style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>+ {bosAdaylar.length} dosya ekle</button>}
          <button type="button" onClick={() => setCikarAc(true)} disabled={mesgul} className={kucukDugme} style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }} data-testid="birlesik-cikar">Bu dosyayı çıkar</button>
        </>
      ) : (
        <>
          <span style={{ color: TEXT_MUTED }}>Aynı müşteri ve aynı gemi{gemi ? ` (${gemi})` : ""}: {bosAdaylar.length} açık dosya daha var.</span>
          <button type="button" onClick={ac} disabled={mesgul} className={kucukDugme} style={{ borderColor: ACCENT, color: ACCENT }} data-testid="birlesik-oner">
            <Layers size={12} /> Tek faturada birleştir
          </button>
        </>
      )}

      {pencere && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !mesgul && setPencere(false)}>
          <div className="rounded-2xl shadow-2xl w-full max-w-md mx-4 p-5 space-y-3 text-sm" style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}` }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Tek faturada birleştir">
            <div className="flex items-center justify-between">
              <p className="font-bold text-white">Tek faturada birleştir</p>
              <button type="button" onClick={() => setPencere(false)} className="hover:text-white" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={18} /></button>
            </div>
            <p className="text-xs" style={{ color: TEXT_MUTED }}>
              {dosyaNo}{grupta ? " ve birleşik faturadaki dosyalarla" : ""} birlikte TEK fatura kesilecek dosyaları seçin. Yalnız aynı müşterinin, aynı gemi ve seferdeki açık ve faturası kesilmemiş dosyaları listelenir.
            </p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {bosAdaylar.map((a) => (
                <label key={a.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer hover:bg-white/[0.03]" style={{ borderColor: CARD_BORDER }}>
                  <input type="checkbox" checked={secim.has(a.id)} onChange={(e) => setSecim((s) => { const y = new Set(s); if (e.target.checked) y.add(a.id); else y.delete(a.id); return y; })} />
                  <span className="text-white font-medium">{a.dosya_no}</span>
                  <span className="text-xs" style={{ color: TEXT_MUTED }}>{a.proforma_no || "-"} · {a.booking_no || "booking yok"} · {a.konteyner} kont.</span>
                </label>
              ))}
            </div>
            <p className="text-[11px]" style={{ color: TEXT_MUTED }}>Dosya, rezervasyon ve evraklar değişmez; yalnız fatura talimatı bütün dosyaları tek faturada toplar. İstediğiniz zaman gruptan çıkarabilirsiniz.</p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setPencere(false)} disabled={mesgul} className="px-4 py-2 rounded-lg text-sm border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
              <button type="button" onClick={kaydet} disabled={mesgul || !secim.size} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 inline-flex items-center gap-1.5" style={{ backgroundColor: ACCENT }} data-testid="birlesik-kaydet">
                {mesgul ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />} {secim.size + (grupta ? durum.uyeler.length : 1)} dosyayı birleştir
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog open={cikarAc} onOpenChange={setCikarAc} title="Birleşik faturadan çıkarılsın mı?"
        description={`${dosyaNo || "Bu dosya"} birleşik faturadan çıkarılır; fatura talimatı yalnız bu dosya için hazırlanır. Grupta tek dosya kalırsa birleşik fatura kaldırılır.`}
        confirmLabel="Çıkar" cancelLabel="Vazgeç" onConfirm={() => { setCikarAc(false); cikar(); }} />
    </div>
  );
}
