"use client";
import React, { useState } from "react";
import { Dosya, Rezervasyon, Konteyner } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import { FileArchive, Loader2 } from "lucide-react";
import { CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { checkCommercialInvoiceReadiness, checkPackingListReadiness } from "@/lib/document-readiness";
import { indirTaslakOnayPaketi } from "@/lib/taslak-onay-paketi";

type Props = {
  dosya: Dosya;
  rezervasyonlar: Rezervasyon[];
  konteynerler: Konteyner[];
};

export default function TaslakOnayButonu({ dosya, rezervasyonlar, konteynerler }: Props) {
  const { showToast } = useToast();
  const [indiriliyor, setIndiriliyor] = useState(false);

  const draftBlUrl = (dosya as any).draft_bl_dosya_url as string | null;

  const ciHazir = checkCommercialInvoiceReadiness(dosya, rezervasyonlar, konteynerler);
  const plHazir = checkPackingListReadiness(dosya, rezervasyonlar, konteynerler);

  const eksikler: string[] = [
    ...(!ciHazir.hazir ? ciHazir.eksikler : []),
    ...(!plHazir.hazir ? plHazir.eksikler : []),
    ...(!draftBlUrl ? ["Draft BL yüklenmemiş"] : []),
  ];
  const hazir = eksikler.length === 0;

  const handleTiklandi = async () => {
    if (!hazir || indiriliyor || !draftBlUrl) return;
    setIndiriliyor(true);
    try {
      await indirTaslakOnayPaketi(dosya, rezervasyonlar, konteynerler, draftBlUrl);
      showToast("Taslak onay paketi indirildi.", "success");
    } catch (err) {
      console.error("Taslak onay paketi olusturma hatasi:", err);
      showToast("Paket oluşturulamadı. Lütfen tekrar deneyin.", "error");
    } finally {
      setIndiriliyor(false);
    }
  };

  return (
    <button
      onClick={handleTiklandi}
      disabled={!hazir || indiriliyor}
      title={!hazir ? `Eksik: ${eksikler.join(", ")}` : "Commercial Invoice + Packing List + Draft BL'i tek ZIP olarak indir"}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/5"
      style={{ borderColor: CARD_BORDER, color: TEXT_MUTED }}
    >
      {indiriliyor ? (
        <><Loader2 size={13} className="animate-spin" /> Hazırlanıyor...</>
      ) : (
        <><FileArchive size={13} /> Taslak Onay Paketi İndir</>
      )}
    </button>
  );
}