"use client";

/**
 * Navlun > "Yeniden oku" (16.11.2026, kullanıcı onayı: "mevcut durumu bozmayacaksa"). Tarih seçilir; Apps Script her
 * 15 dakikalık çalışmada, normal okumadan SONRA, o tarihten itibaren yazışmaları 20'şer 20'şer yeniden gönderir.
 * NAVLUN_SON'a dokunulmaz; aynı mail iki kez kaydedilmez. İlerleme burada görünür.
 */
import React, { useCallback, useEffect, useState } from "react";
import { History, Loader2, X } from "lucide-react";
import { ACCENT, CARD_BG, CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { yenidenOkumaDurumu, yenidenOkumaIptal, yenidenOkumaIste, type YenidenOkuma } from "@/lib/navlun/veri";

const gun = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const saat = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const bugunIst = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const gunOnce = (n: number) => new Date(Date.now() + 3 * 3600000 - n * 86400000).toISOString().slice(0, 10);

export function durumMetni(d: YenidenOkuma): string {
  if (d.durum === "bekliyor") return `${gun(d.baslangic)} tarihinden itibaren yeniden okuma sırada; en geç 15 dakika içinde başlar.`;
  if (d.durum === "isleniyor") return `${gun(d.baslangic)} tarihinden itibaren okunuyor: ${d.konum} yazışma, ${d.gonderilen} mail gönderildi (son ${saat(d.son_ilerleme)}).`;
  if (d.durum === "tamam") return `${gun(d.baslangic)} tarihinden itibaren yeniden okuma bitti: ${d.konum} yazışma, ${d.yeni} yeni kayıt (${saat(d.son_ilerleme)}).`;
  return `${gun(d.baslangic)} yeniden okuması iptal edildi.`;
}

export function YenidenOku({ onBitti }: { onBitti: () => void }) {
  const [acik, setAcik] = useState(false);
  const [tarih, setTarih] = useState(gunOnce(7));
  const [durum, setDurum] = useState<YenidenOkuma | null>(null);
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const getir = useCallback(async () => { try { setDurum(await yenidenOkumaDurumu()); } catch { /* sayfa yine calisir */ } }, []);
  useEffect(() => { getir(); }, [getir]);
  const aktif = durum && (durum.durum === "bekliyor" || durum.durum === "isleniyor");
  // Aktif istekte dakikada bir ilerleme yoklanir; bitince sayfa verisi yenilenir
  useEffect(() => {
    if (!aktif) return;
    const t = setInterval(async () => {
      const d = await yenidenOkumaDurumu().catch(() => null);
      if (d) { setDurum(d); if (d.durum === "tamam") onBitti(); }
    }, 60000);
    return () => clearInterval(t);
  }, [aktif, onBitti]);

  const iste = async () => {
    setBekle(true); setHata(null);
    try { await yenidenOkumaIste(tarih); await getir(); setAcik(false); } catch (e) { setHata(e instanceof Error ? e.message : "İstek kaydedilemedi."); }
    setBekle(false);
  };
  const iptal = async () => { setBekle(true); try { await yenidenOkumaIptal(); await getir(); } catch (e) { setHata(e instanceof Error ? e.message : "İptal edilemedi."); } setBekle(false); };

  return (
    <div className="relative">
      <button type="button" onClick={() => setAcik(!acik)} data-testid="yeniden-oku" title="Seçilen tarihten itibaren navlun maillerini yeniden oku"
        className="h-9 px-3 inline-flex items-center gap-2 rounded-lg text-sm border hover:bg-white/[0.04]" style={{ borderColor: aktif ? ACCENT : CARD_BORDER, color: "#C9D1DC" }}>
        {aktif ? <Loader2 size={14} className="animate-spin" style={{ color: ACCENT }} /> : <History size={14} />} Yeniden oku
      </button>
      {acik && (
        <div className="absolute right-0 top-11 z-40 w-80 rounded-xl border p-3 shadow-xl" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }} data-testid="yeniden-oku-panel">
          <div className="flex items-center mb-2">
            <p className="text-sm font-semibold text-white flex-1">Mailleri yeniden oku</p>
            <button type="button" onClick={() => setAcik(false)} aria-label="Kapat" className="p-1 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }}><X size={14} /></button>
          </div>
          <p className="text-[11px] mb-2" style={{ color: TEXT_MUTED }}>
            Seçtiğiniz tarihten bugüne kadarki navlun yazışmaları, Apps Script&apos;in bir sonraki çalışmasından itibaren yeniden okunur. Aynı mail iki kez kaydedilmez; normal okuma etkilenmez.
          </p>
          <label className="block text-xs mb-2" style={{ color: TEXT_MUTED }}>Başlangıç tarihi
            <input type="date" value={tarih} min={gunOnce(60)} max={bugunIst()} onChange={(e) => setTarih(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border bg-transparent px-2 text-sm text-white" style={{ borderColor: CARD_BORDER, colorScheme: "dark" }} />
          </label>
          {durum && <p className="text-[11px] mb-2" style={{ color: aktif ? "#93C5FD" : TEXT_MUTED }} data-testid="yeniden-oku-durum">{durumMetni(durum)}</p>}
          {hata && <p className="text-[11px] mb-2" style={{ color: "#FCA5A5" }}>{hata}</p>}
          <div className="flex justify-end gap-2">
            {aktif && <button type="button" onClick={iptal} disabled={bekle} className="h-8 px-3 rounded-lg border text-xs disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>İptal et</button>}
            <button type="button" onClick={iste} disabled={bekle || !tarih} className="h-8 px-3 rounded-lg text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
              {aktif ? "Yeni tarihle başlat" : "Yeniden okumayı başlat"}
            </button>
          </div>
        </div>
      )}
      {!acik && aktif && durum && (
        <p className="absolute right-0 top-11 z-30 w-72 text-[11px] rounded-lg border px-2 py-1.5" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER, color: "#93C5FD" }}>{durumMetni(durum)}</p>
      )}
    </div>
  );
}
