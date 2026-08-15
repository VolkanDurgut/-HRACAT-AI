"use client";
import React, { useState, forwardRef, useImperativeHandle } from "react";
import { supabase, Rezervasyon, Konteyner, Dosya } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { Mail, X } from "lucide-react";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT } from "@/lib/theme";

type Props = {
  dosyaId: string;
  dosya: Dosya;
  konteynerler: Konteyner[];
  rezervasyonlar: Rezervasyon[];
  dbaYuklenenSayisi: number;
  onRefresh: () => void;
  companyId: string; // SaaS: şirket bazlı izolasyon
};

export type VgmMailSectionHandle = { ac: () => void };

const VgmMailSection = forwardRef<VgmMailSectionHandle, Props>(function VgmMailSection(
  { dosyaId, dosya, konteynerler, rezervasyonlar, onRefresh, companyId },
  ref
) {
  const { showToast } = useToast();
  const [showVgmMail, setShowVgmMail] = useState(false);
  const [vgmTo, setVgmTo] = useState("");
  const [vgmCc, setVgmCc] = useState("");

  const tumVgmHazir = konteynerler.length > 0 && konteynerler.every((k) => !!k.vgm_kg);

  useImperativeHandle(ref, () => ({
    ac: () => { if (tumVgmHazir) setShowVgmMail(true); },
  }));

  const buildVgmMailMetni = () => {
    const rez = rezervasyonlar[0];
    const ayrac = "─".repeat(50);
    const satirlar = konteynerler.map((k, i) =>
      `  ${i + 1}. ${k.konteyner_no}\n` +
      `     Araç Plakası : ${k.plaka || "-"}\n` +
      `     Tare (Dara)  : ${k.tare_kg ? k.tare_kg.toLocaleString("tr-TR") + " KG" : "-"}\n` +
      `     Net Ağırlık  : ${k.net_agirlik_kg ? k.net_agirlik_kg.toLocaleString("tr-TR") + " KG" : "-"}\n` +
      `     VGM          : ${k.vgm_kg ? k.vgm_kg.toLocaleString("tr-TR") + " KG" : "-"}`
    ).join("\n\n");
    return (
      `Sayın İlgili,\n\n` +
      `İhracat dosyamıza ait VGM sonuçları ektedir.\n\n` +
      `${ayrac}\n` +
      `SEVKİYAT BİLGİLERİ\n` +
      `${ayrac}\n` +
      `Booking No     : ${rez?.booking_no || "-"}\n` +
      `Gemi Adı       : ${rez?.gemi_adi || "-"}\n` +
      `Yükleme Limanı : ${dosya.yuklenme_limani || rez?.yuklenme_limani || "-"}\n` +
      `Varış Limanı   : ${dosya.varis_limani || "-"}\n\n` +
      `${ayrac}\n` +
      `VGM SONUÇLARI (${konteynerler.length} Konteyner)\n` +
      `${ayrac}\n` +
      `${satirlar}\n\n` +
      `${ayrac}\n\n` +
      `İyi Çalışmalar,\n` +
      `${dosya.satici_firma || ""}`
    );
  };

  const handleVgmMailGonder = async () => {
    const vgmKonu = `VGM Sonuclari - ${dosya.dosya_no}`;
    const ccPart = vgmCc ? `&cc=${encodeURIComponent(vgmCc)}` : "";
    window.open(`mailto:${vgmTo}?subject=${encodeURIComponent(vgmKonu)}${ccPart}&body=${encodeURIComponent(buildVgmMailMetni())}`);
    const { error } = await supabase.from("ihracat_dosyalari").update({ vgm_gonderildi: true }).eq("id", dosyaId).eq("company_id", companyId);
    if (error) {
      showToast(`VGM durumu kaydedilemedi: ${error.message}`, "error");
      return;
    }
    showToast("VGM maili gonderildi.", "success");
    setShowVgmMail(false);
    onRefresh();
  };

  if (!showVgmMail) return null;

  return (
    <div className="p-4 rounded-xl border shadow-sm space-y-3 animate-fade-up" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-white">VGM Maili</p>
        <button onClick={() => setShowVgmMail(false)} className="p-1 hover:text-white" style={{ color: TEXT_MUTED }}><X size={16} /></button>
      </div>
      <div>
        <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>TO (Acente / Armator)</p>
        <input value={vgmTo} onChange={(e) => setVgmTo(e.target.value)} placeholder="acente@firma.com" type="email" className="w-full text-sm px-3 py-2 border rounded-lg text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
      </div>
      <div>
        <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>CC</p>
        <input value={vgmCc} onChange={(e) => setVgmCc(e.target.value)} placeholder="cc@firma.com" className="w-full text-sm px-3 py-2 border rounded-lg text-white" style={{ borderColor: CARD_BORDER, backgroundColor: CARD_BG }} />
      </div>
      <p className="text-xs" style={{ color: TEXT_MUTED }}>Mail metninde konteynerlerin VGM sonuçları otomatik yer alır.</p>
      <div className="flex gap-2">
        <button onClick={handleVgmMailGonder} disabled={!vgmTo}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: ACCENT }}>
          <Mail size={14} /> Mail Uygulamasini Ac
        </button>
        <button onClick={() => setShowVgmMail(false)} className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}>Iptal</button>
      </div>
    </div>
  );
});

export default VgmMailSection;