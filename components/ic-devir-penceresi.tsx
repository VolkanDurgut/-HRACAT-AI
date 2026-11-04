"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";
import { hataMesaji, kgYazi } from "@/lib/ic-piyasa/is-emri";
import { kgOku } from "@/lib/diib/hesap";

/**
 * "Fazlayi aktar" (04.11.2026). Kullanici: "IE-2026-0007 ... Fazla 18,94 ton. Buradaki fazlalik
 * olan 18.940 bu dosyaya aktarilmali: IE-2026-0008". Arac/irsaliye bolunmez; sunucudaki
 * ic_is_emri_devir_ekle kaynak siparisin FAZLASINI (en fazla) ayni musterinin ayni urundeki acik,
 * tonaj hedefli siparisine devreder. Kurallar sunucuda; burada yalniz secim ve ozet.
 */
export type DevirAdayi = { id: string; is_emri_no: string; hedefKg: number; yuklenenKg: number };

export function IcDevirPenceresi({ kaynak, adaylar, onKapat, onKaydedildi }: {
  kaynak: { id: string; is_emri_no: string; musteri: string; urun: string; fazlaKg: number };
  adaylar: DevirAdayi[];
  onKapat: () => void;
  onKaydedildi: () => void;
}) {
  const { showToast } = useToast();
  const [hedefId, setHedefId] = useState(adaylar[0]?.id ?? "");
  const [kg, setKg] = useState(String(kaynak.fazlaKg));
  const [aciklama, setAciklama] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  useEffect(() => { setHedefId(adaylar[0]?.id ?? ""); }, [adaylar]);

  const miktar = kgOku(kg);
  const hedef = useMemo(() => adaylar.find((a) => a.id === hedefId) || null, [adaylar, hedefId]);
  const gecerli = !!hedef && miktar > 0 && miktar <= kaynak.fazlaKg + 0.005;

  const kaydet = async () => {
    if (!hedef) return;
    if (!gecerli) { setHata(`Miktar 0 ile ${kgYazi(kaynak.fazlaKg)} arasında olmalı.`); return; }
    setKaydediliyor(true);
    setHata(null);
    const { error } = await supabase.rpc("ic_is_emri_devir_ekle", { p_kaynak: kaynak.id, p_hedef: hedef.id, p_kg: miktar, p_aciklama: aciklama.trim() || null });
    setKaydediliyor(false);
    if (error) { setHata(hataMesaji(error)); return; }
    showToast(`${kgYazi(miktar)} ${kaynak.is_emri_no} → ${hedef.is_emri_no} aktarıldı.`, "success");
    onKaydedildi();
  };

  const girdi = "w-full px-3 py-2 rounded-lg border text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => !kaydediliyor && onKapat()} role="dialog" aria-modal="true" aria-label="Fazlayı aktar">
      <div className="w-full max-w-md rounded-2xl border p-5 space-y-4" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} onClick={(e) => e.stopPropagation()} data-testid="devir-penceresi">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-white flex items-center gap-2"><ArrowRightLeft size={15} style={{ color: ACCENT }} /> Fazlayı başka siparişe aktar</p>
            <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>{kaynak.is_emri_no} · {kaynak.musteri} · {kaynak.urun}</p>
          </div>
          <button onClick={onKapat} disabled={kaydediliyor} className="hover:text-white" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={18} /></button>
        </div>

        <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: CARD_BORDER, backgroundColor: ROW_HEADER_BG, color: TEXT_MUTED }}>
          Hedefin üzerinde yüklenen <b className="text-white">{kgYazi(kaynak.fazlaKg)}</b>. Araçlar ve irsaliyeler olduğu yerde kalır; aktarılan miktar bu siparişten düşer, seçilen siparişe yüklenmiş sayılır. Kayıt tutulur ve geri alınabilir.
        </div>

        {adaylar.length === 0 ? (
          <p className="text-sm text-amber-300" data-testid="devir-aday-yok">Aynı müşterinin aynı üründe açık, tonaj hedefli başka siparişi yok. Önce hedef siparişi açın.</p>
        ) : (
          <>
            <div>
              <label htmlFor="devir-hedef" className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Aktarılacak sipariş</label>
              <select id="devir-hedef" value={hedefId} onChange={(e) => setHedefId(e.target.value)} className={girdi} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }}>
                {adaylar.map((a) => <option key={a.id} value={a.id}>{a.is_emri_no} · {kgYazi(a.yuklenenKg)} / {kgYazi(a.hedefKg)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="devir-kg" className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Miktar (kg)</label>
              <input id="devir-kg" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} className={girdi} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
            </div>
            <div>
              <label htmlFor="devir-aciklama" className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Açıklama (isteğe bağlı)</label>
              <input id="devir-aciklama" value={aciklama} onChange={(e) => setAciklama(e.target.value)} maxLength={500} placeholder="Örn. son araçtaki fazla sonraki siparişe" className={girdi} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
            </div>
            {hedef && miktar > 0 && (
              <p className="text-xs" style={{ color: TEXT_MUTED }} data-testid="devir-sonuc">
                Sonuç: <b className="text-white">{kaynak.is_emri_no}</b> fazlası {kgYazi(Math.max(0, kaynak.fazlaKg - miktar))} · <b className="text-white">{hedef.is_emri_no}</b> {kgYazi(hedef.yuklenenKg + miktar)} / {kgYazi(hedef.hedefKg)}
              </p>
            )}
          </>
        )}
        {hata && <p className="text-sm text-red-400" role="alert">{hata}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onKapat} disabled={kaydediliyor} className="px-4 py-2 rounded-lg border text-sm" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
          <button onClick={kaydet} disabled={kaydediliyor || !gecerli} data-testid="devir-kaydet" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
            {kaydediliyor && <Loader2 size={14} className="animate-spin" />} Aktar
          </button>
        </div>
      </div>
    </div>
  );
}
