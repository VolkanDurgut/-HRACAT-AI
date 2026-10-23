"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { Loader2, Upload, X, ScanText, PencilLine, History, CheckCircle2 } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";
import { IC_BELGE_BUCKET, hataMesaji, kgYazi } from "@/lib/ic-piyasa/is-emri";
import { IrsaliyeOkuma, irsaliyePdfOku, plakaBicimle, plakaGecerli, plakaYazarken, trSayiOku } from "@/lib/ic-piyasa/irsaliye-oku";

/**
 * Sistem oncesi (gecmis) arac kaydi - 23.10.2026.
 * Sistem kurulmadan once yuklenmis araclar is emrine sonradan islenir:
 * irsaliye PDF'i ZORUNLU (okunabiliyorsa plaka / net / irsaliye no / tarih /
 * ETTN otomatik dolar), kayit `ic_gecmis_sevk_ekle` ile yapilir. Bu kayit
 * HICBIR bildirim uretmez (lojistik e-postasi yok, musteri mesaji yok) ve
 * arac "cikti" sayilir. Ilerleme ve toplamlara dahildir.
 * Sira: PDF depoya -> RPC; RPC basarisizsa PDF geri silinir.
 */

const IRSALIYE_NO_RE = /^[A-Z0-9]{3,20}$/;
const ETTN_DOSYA_RE = /^([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})(?:\s*\(\d+\))?\.pdf$/i;
const GIRIS = "w-full px-3 py-2 rounded-lg border text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";

function bugunTR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

export type GecmisSevkEmri = { id: string; is_emri_no: string; urun: string; musteri: string };

export function IcGecmisSevkPenceresi({ emir, companyId, onKapat, onKaydedildi }: {
  emir: GecmisSevkEmri;
  companyId: string;
  onKapat: () => void;
  onKaydedildi: () => void;
}) {
  const { showToast } = useToast();
  const [dosya, setDosya] = useState<File | null>(null);
  const [okunuyor, setOkunuyor] = useState(false);
  const [okuma, setOkuma] = useState<IrsaliyeOkuma | null>(null);
  const [tarih, setTarih] = useState("");
  const [plaka, setPlaka] = useState("");
  const [dorse, setDorse] = useState("");
  const [net, setNet] = useState("");
  const [irsNo, setIrsNo] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    const tus = (ev: KeyboardEvent) => { if (ev.key === "Escape" && !kaydediliyor) onKapat(); };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [kaydediliyor, onKapat]);

  const dosyaSec = async (f: File) => {
    setHata(null);
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { setHata("Lütfen irsaliyenin PDF dosyasını seçin."); return; }
    if (f.size > 10 * 1024 * 1024) { setHata("Dosya 10 MB'tan büyük olamaz."); return; }
    setDosya(f);
    setOkunuyor(true);
    let o: IrsaliyeOkuma | null = null;
    try { o = await irsaliyePdfOku(f); } catch (err) { console.error("İrsaliye okunamadı:", err); o = null; }
    setOkuma(o);
    // Okunan deger varsa yazilir; yoksa kullanicinin yazdigi KORUNUR
    if (o?.plaka) setPlaka(o.plaka);
    if (o?.dorsePlaka) setDorse(o.dorsePlaka);
    if (o?.netKg) setNet(o.netKg.toLocaleString("tr-TR", { maximumFractionDigits: 2 }));
    if (o?.irsaliyeNo) setIrsNo(o.irsaliyeNo);
    if (o?.tarih) setTarih(o.tarih.slice(0, 10));
    setOkunuyor(false);
  };

  const plakaSon = plakaBicimle(plaka);
  const netSayi = net.trim() ? trSayiOku(net.trim().replace(/\s/g, "")) : null;
  const irsNoSon = irsNo.trim().toUpperCase();
  const ettn = okuma?.ettn || (dosya ? dosya.name.match(ETTN_DOSYA_RE)?.[1]?.toUpperCase() || null : null);
  const bugun = bugunTR();
  const eksikler: string[] = [];
  if (!dosya) eksikler.push("İrsaliye PDF'i");
  if (!tarih || tarih > bugun) eksikler.push("Yükleme tarihi (bugün veya geçmiş)");
  if (!plakaGecerli(plakaSon)) eksikler.push("Araç plakası");
  if (netSayi === null || netSayi <= 0 || netSayi > 60000) eksikler.push("Net ağırlık (1–60.000 kg)");
  if (!IRSALIYE_NO_RE.test(irsNoSon)) eksikler.push("İrsaliye no");
  const hazir = eksikler.length === 0 && !okunuyor;

  const kaydet = async () => {
    if (!hazir || !dosya) return;
    setKaydediliyor(true);
    setHata(null);
    const yol = `${companyId}/irsaliye/${emir.id}/${Date.now()}.pdf`;
    const { error: yErr } = await supabase.storage.from(IC_BELGE_BUCKET).upload(yol, dosya, { contentType: "application/pdf", upsert: false });
    if (yErr) { setHata(`Dosya yüklenemedi: ${yErr.message}`); setKaydediliyor(false); return; }
    const { data, error } = await supabase.rpc("ic_gecmis_sevk_ekle", {
      p_veri: {
        is_emri_id: emir.id, tarih, plaka: plakaSon, dorse_plaka: dorse ? plakaBicimle(dorse) : null,
        net_kg: netSayi, irsaliye_no: irsNoSon, ettn,
        sofor_ad: okuma?.soforAd || null, irsaliye_urun: okuma?.urun || null,
        irsaliye_dosya_yolu: yol, irsaliye_dosya_adi: dosya.name,
      },
    });
    if (error || !(data as { kaydedildi?: boolean })?.kaydedildi) {
      // Kayda baglanamayan dosya depoda sahipsiz kalmasin
      await supabase.storage.from(IC_BELGE_BUCKET).remove([yol]);
      setHata(hataMesaji(error || { message: "Kaydedilemedi." }));
      setKaydediliyor(false);
      return;
    }
    const d = data as { yuklenen_kg: number; yuklenen_arac: number };
    showToast(`${plakaSon} · ${kgYazi(netSayi)} sistem öncesi araç olarak eklendi. ${emir.is_emri_no}: ${kgYazi(Number(d.yuklenen_kg))} · ${d.yuklenen_arac} araç`, "success");
    onKaydedildi();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="gecmis-sevk-baslik">
      <div className="w-full max-w-lg rounded-2xl border shadow-2xl my-8" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        <div className="flex items-start justify-between px-5 py-4 border-b" style={{ borderColor: CARD_BORDER }}>
          <div>
            <h2 id="gecmis-sevk-baslik" className="text-base font-bold text-white flex items-center gap-2"><History size={16} style={{ color: ACCENT }} /> Sistem Öncesi Araç Ekle</h2>
            <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{emir.is_emri_no} · {emir.musteri} · {emir.urun}</p>
          </div>
          <button onClick={onKapat} disabled={kaydediliyor} className="p-1.5 rounded hover:bg-white/5" style={{ color: TEXT_MUTED }} aria-label="Kapat"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs rounded-lg border px-3 py-2" style={{ borderColor: CARD_BORDER, backgroundColor: "#0F131A", color: TEXT_MUTED }}>
            Sistem kurulmadan önce yüklenmiş araç içindir. Kayıt <span className="text-white">bildirim göndermez</span> (lojistiğe e-posta, müşteriye mesaj yok),
            araç <span className="text-white">yola çıkmış</span> sayılır ve iş emrinin ilerlemesine eklenir.
          </p>

          <label className="flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 cursor-pointer hover:bg-white/[0.03]" style={{ borderColor: CARD_BORDER }}>
            {okunuyor ? <Loader2 size={18} className="animate-spin shrink-0" style={{ color: ACCENT }} /> : dosya ? (okuma && (okuma.plaka || okuma.netKg) ? <ScanText size={18} className="text-emerald-400 shrink-0" /> : <PencilLine size={18} className="text-amber-400 shrink-0" />) : <Upload size={18} className="shrink-0" style={{ color: ACCENT }} />}
            <span className="min-w-0 text-xs">
              <span className="block text-sm font-semibold text-white truncate">{dosya ? dosya.name : "İrsaliye PDF'ini seçin *"}</span>
              <span style={{ color: TEXT_MUTED }}>
                {okunuyor ? "Okunuyor…" : !dosya ? "Okunabilirse bilgiler otomatik dolar." : okuma && (okuma.plaka || okuma.netKg) ? "İrsaliyeden okundu — kontrol edin." : <span className="text-amber-400">Okunamadı (görüntü PDF). Bilgileri irsaliyeye bakarak yazın.</span>}
              </span>
            </span>
            <input type="file" accept="application/pdf,.pdf" className="hidden" aria-label="İrsaliye PDF" disabled={kaydediliyor}
              onChange={(ev) => { const f = ev.target.files?.[0]; if (f) dosyaSec(f); ev.target.value = ""; }} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block col-span-2 sm:col-span-1">
              <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Yükleme tarihi *</span>
              <input type="date" value={tarih} max={bugun} onChange={(ev) => setTarih(ev.target.value)} aria-label="Yükleme tarihi" className={GIRIS} style={{ backgroundColor: "#0F131A", borderColor: tarih && tarih > bugun ? "#F87171" : CARD_BORDER, colorScheme: "dark" }} />
            </label>
            <label className="block col-span-2 sm:col-span-1">
              <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>İrsaliye no *</span>
              <input value={irsNo} onChange={(ev) => setIrsNo(ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))} aria-label="İrsaliye no"
                placeholder="IRS2026000001234" autoCapitalize="characters" spellCheck={false} className={`${GIRIS} font-semibold uppercase`}
                style={{ backgroundColor: "#0F131A", borderColor: irsNo && !IRSALIYE_NO_RE.test(irsNoSon) ? "#F87171" : CARD_BORDER }} />
            </label>
            <label className="block col-span-2 sm:col-span-1">
              <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Araç plakası *</span>
              <input value={plaka} onChange={(ev) => setPlaka(plakaYazarken(ev.target.value))} onBlur={() => setPlaka(plakaBicimle(plaka))} aria-label="Araç plakası"
                placeholder="59 AGD 284" autoCapitalize="characters" className={`${GIRIS} font-bold tracking-wider uppercase`}
                style={{ backgroundColor: "#0F131A", borderColor: plaka && !plakaGecerli(plakaSon) ? "#F87171" : CARD_BORDER }} />
            </label>
            <label className="block col-span-2 sm:col-span-1">
              <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Net ağırlık (kg) *</span>
              <input value={net} onChange={(ev) => setNet(ev.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" aria-label="Net ağırlık"
                placeholder="25.500" className={`${GIRIS} font-bold text-right`}
                style={{ backgroundColor: "#0F131A", borderColor: net && (netSayi === null || netSayi <= 0 || netSayi > 60000) ? "#F87171" : CARD_BORDER }} />
            </label>
            <label className="block col-span-2">
              <span className="block text-xs mb-1" style={{ color: TEXT_MUTED }}>Dorse plakası (varsa)</span>
              <input value={dorse} onChange={(ev) => setDorse(plakaYazarken(ev.target.value))} onBlur={() => setDorse(dorse ? plakaBicimle(dorse) : "")} aria-label="Dorse plakası"
                autoCapitalize="characters" className={`${GIRIS} font-semibold uppercase`} style={{ backgroundColor: "#0F131A", borderColor: CARD_BORDER }} />
            </label>
          </div>
          {ettn && <p className="text-[11px]" style={{ color: TEXT_MUTED }}>ETTN: {ettn}</p>}

          {hata && <p className="text-xs text-red-400">{hata}</p>}
          {dosya && !okunuyor && eksikler.length > 0 && <p className="text-xs text-amber-400">Eksik: {eksikler.join(", ")}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: CARD_BORDER }}>
          <button onClick={onKapat} disabled={kaydediliyor} className="px-4 py-2.5 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Vazgeç</button>
          <button onClick={kaydet} disabled={!hazir || kaydediliyor} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-bold text-white hover:brightness-110 disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
            {kaydediliyor ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Aracı Ekle
          </button>
        </div>
      </div>
    </div>
  );
}
