"use client";

/**
 * Dosya sayfasi > Konteynerler: FATURA TALIMATI MAILI durumu. Son kayit (lib/fatura-onay.ts) + "Simdi gonder"
 * (konteynerler tam, kayit yok) / "Tekrar gonder" (onceki gonderimden sonra).
 * 11.11.2026: onay akisi. 14.11.2026: onay adimi kaldirildi; konteynerler tamamlaninca sistem talimat mailini
 * 10 dakika icinde kendisi gonderir ("Harun Bey merhaba" + PDF indir dugmesi); dugme beklemeden gondermek icindir.
 */
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { useToast } from "@/lib/toast-context";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { talimatMailiGonder, sonFaturaOnayi, trZaman, type FaturaOnayKaydi } from "@/lib/fatura-onay";
import { CARD_BORDER, TEXT_MUTED } from "@/lib/theme";

export function FaturaOnayDurumu({ dosyaId, tam }: { dosyaId: string; tam: boolean }) {
  const { showToast } = useToast();
  const [kayit, setKayit] = useState<FaturaOnayKaydi | null | undefined>(undefined);
  const [mesgul, setMesgul] = useState(false);
  const [tekrarAc, setTekrarAc] = useState(false);

  const getir = useCallback(async () => {
    try { setKayit(await sonFaturaOnayi(dosyaId)); } catch { setKayit(null); }
  }, [dosyaId]);
  useEffect(() => { getir(); }, [getir]);

  const gonder = async () => {
    setMesgul(true);
    try {
      const s = await talimatMailiGonder(dosyaId);
      showToast(s.test ? "Fatura talimatı maili gönderildi (test modu: yalnızca test adresine)." : `Fatura talimatı maili gönderildi (${s.alicilar.length} alıcı).`, "success");
      await getir();
    } catch (e) { showToast(e instanceof Error ? e.message : "Fatura talimatı maili gönderilemedi.", "error"); }
    setMesgul(false);
  };

  if (kayit === undefined || (!kayit && !tam)) return null;
  const dugme = (metin: string, onayla: boolean) => (
    <button type="button" disabled={mesgul} onClick={() => (onayla ? setTekrarAc(true) : gonder())} data-testid="fatura-talimat-gonder"
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] hover:bg-white/5 disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>
      {mesgul ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} {metin}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]" data-testid="fatura-onay-durumu" data-durum={kayit?.durum || "yok"}>
      {!kayit && <><span style={{ color: TEXT_MUTED }}>Fatura talimatı maili henüz gönderilmedi (otomatik 10 dk içinde).</span>{dugme("Şimdi gönder", false)}</>}
      {kayit && <>
        <span className="inline-flex items-center gap-1" style={{ color: "#6EE7B7" }}>
          <CheckCircle2 size={12} /> Fatura talimatı maili gönderildi{kayit.test ? " (test)" : ""} · {trZaman(kayit.karar_zamani || kayit.olusturma)} ·{" "}
          <Link href={`/fatura-onay?id=${kayit.id}`} className="underline" style={{ color: TEXT_MUTED }}>talimat sayfası</Link>
        </span>
        {tam && dugme("Tekrar gönder", true)}
      </>}
      <ConfirmDialog open={tekrarAc} onOpenChange={setTekrarAc} title="Fatura talimatı maili tekrar gönderilsin mi?"
        description="Talimat maili (PDF indirme düğmesiyle) Ayarlar > Rapor Alıcıları > Fatura Talimatı listesine yeniden gönderilir."
        confirmLabel="Tekrar gönder" cancelLabel="Vazgeç" onConfirm={() => { setTekrarAc(false); gonder(); }} />
    </div>
  );
}
