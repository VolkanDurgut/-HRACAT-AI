"use client";
import React, { useState } from "react";
import { supabase, Rezervasyon, Konteyner, Dosya } from "@/lib/supabase";
import { formatDateTR } from "@/lib/cutoff-utils";
import { useToast } from "@/lib/toast-context";
import { Mail, X, Weight } from "lucide-react";

type Props = {
  dosyaId: string;
  dosya: Dosya;
  konteynerler: Konteyner[];
  rezervasyonlar: Rezervasyon[];
  dbaYuklenenSayisi: number;
  onRefresh: () => void;
  companyId: string; // SaaS: şirket bazlı izolasyon
};

export default function VgmMailSection({ dosyaId, dosya, konteynerler, rezervasyonlar, dbaYuklenenSayisi, onRefresh, companyId }: Props) {
  const { showToast } = useToast();
  const [showVgmMail, setShowVgmMail] = useState(false);
  const [vgmTo, setVgmTo] = useState("");
  const [vgmCc, setVgmCc] = useState("");

  const tumVgmHazir = konteynerler.length > 0 && konteynerler.every((k) => !!k.vgm_kg);

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

  return (
    <div className="pt-2 border-t" style={{ borderColor: "#F1F5F9" }}>
      {!tumVgmHazir ? (
        <div className="mt-3">
          <button disabled className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-400 bg-slate-100 cursor-not-allowed">
            <Weight size={16} /> VGM Gonder
          </button>
          <p className="text-xs text-slate-400 mt-1.5 text-center">
            {dbaYuklenenSayisi}/{konteynerler.length} DBA yuklendi — tum konteynerler tamamlandiginda VGM gonderilebilir
          </p>
        </div>
      ) : !showVgmMail ? (
        <button onClick={() => setShowVgmMail(true)} className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90" style={{ backgroundColor: "#1B2B4B" }}>
          <Weight size={16} /> VGM Gonder
        </button>
      ) : (
        <div className="mt-3 p-4 rounded-xl border bg-white shadow-sm space-y-3 animate-fade-in" style={{ borderColor: "#E2E8F0" }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">VGM Maili</p>
            <button onClick={() => setShowVgmMail(false)} className="p-1 text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">TO (Acente / Armator)</p>
            <input value={vgmTo} onChange={(e) => setVgmTo(e.target.value)} placeholder="acente@firma.com" type="email" className="w-full text-sm px-3 py-2 border rounded-lg" style={{ borderColor: "#E2E8F0" }} />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">CC</p>
            <input value={vgmCc} onChange={(e) => setVgmCc(e.target.value)} placeholder="cc@firma.com" className="w-full text-sm px-3 py-2 border rounded-lg" style={{ borderColor: "#E2E8F0" }} />
          </div>
          <p className="text-xs text-slate-400">Mail metninde konteynerlerin VGM sonuçları otomatik yer alır.</p>
          <div className="flex gap-2">
            <button onClick={handleVgmMailGonder} disabled={!vgmTo}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1B2B4B" }}>
              <Mail size={14} /> Mail Uygulamasini Ac
            </button>
            <button onClick={() => setShowVgmMail(false)} className="px-4 py-2 rounded-lg text-slate-600 text-sm font-medium border hover:bg-slate-50" style={{ borderColor: "#E2E8F0" }}>Iptal</button>
          </div>
        </div>
      )}
    </div>
  );
}
