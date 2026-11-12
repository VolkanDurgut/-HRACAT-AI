"use client";

/**
 * Dosya sayfasi > Konteynerler: FATURA TALIMATI ONAYI durumu (11.11.2026). Son onay kaydi (lib/fatura-onay.ts) +
 * "Onaya gönder" (konteynerler tam, kayit yok) / "Tekrar onaya gönder" (revize ya da onaylandi sonrasi).
 * Konteynerler tamamlaninca sistem zaten 10 dakika icinde otomatik gonderir; dugme beklemeden gondermek icindir.
 */
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2, PenLine, Send } from "lucide-react";
import { useToast } from "@/lib/toast-context";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { onayaGonder, sonFaturaOnayi, trZaman, type FaturaOnayKaydi } from "@/lib/fatura-onay";
import { CARD_BORDER, TEXT_MUTED } from "@/lib/theme";

export function FaturaOnayDurumu({ dosyaId, tam }: { dosyaId: string; tam: boolean }) {
  const { showToast } = useToast();
  const [kayit, setKayit] = useState<FaturaOnayKaydi | null | undefined>(undefined);
  const [mesgul, setMesgul] = useState(false);
  const [onayAc, setOnayAc] = useState(false);

  const getir = useCallback(async () => {
    try { setKayit(await sonFaturaOnayi(dosyaId)); } catch { setKayit(null); }
  }, [dosyaId]);
  useEffect(() => { getir(); }, [getir]);

  const gonder = async () => {
    setMesgul(true);
    try {
      const s = await onayaGonder(dosyaId);
      showToast(s.test ? "Onaya gönderildi (test modu: yalnızca test adresine)." : "Fatura talimatı onaya gönderildi.", "success");
      await getir();
    } catch (e) { showToast(e instanceof Error ? e.message : "Onaya gönderilemedi.", "error"); }
    setMesgul(false);
  };

  if (kayit === undefined || (!kayit && !tam)) return null;
  const dugme = (metin: string, onay: boolean) => (
    <button type="button" disabled={mesgul} onClick={() => (onay ? setOnayAc(true) : gonder())} data-testid="fatura-onaya-gonder"
      className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] hover:bg-white/5 disabled:opacity-50" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }}>
      {mesgul ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} {metin}
    </button>
  );
  const onayBaglantisi = kayit ? <Link href={`/fatura-onay?id=${kayit.id}`} className="underline" style={{ color: TEXT_MUTED }}>onay sayfası</Link> : null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]" data-testid="fatura-onay-durumu" data-durum={kayit?.durum || "yok"}>
      {!kayit && <><span style={{ color: TEXT_MUTED }}>Fatura talimatı henüz onaya gönderilmedi (otomatik 10 dk içinde).</span>{dugme("Onaya gönder", false)}</>}
      {kayit?.durum === "bekliyor" && (
        <span className="inline-flex items-center gap-1" style={{ color: "#F4A07C" }}><Clock size={12} /> Fatura talimatı onay bekliyor{kayit.test ? " (test)" : ""} · {trZaman(kayit.olusturma)} · {onayBaglantisi}</span>
      )}
      {kayit?.durum === "onaylandi" && <>
        <span className="inline-flex items-center gap-1" style={{ color: "#6EE7B7" }}><CheckCircle2 size={12} /> Fatura talimatı onaylandı{kayit.test ? " (test)" : ""} · {kayit.karar_veren} · {trZaman(kayit.karar_zamani)} · {onayBaglantisi}</span>
        {tam && dugme("Tekrar onaya gönder", true)}
      </>}
      {kayit?.durum === "revize" && <>
        <span className="inline-flex items-center gap-1 max-w-[520px]" style={{ color: "#FCD34D" }} title={kayit.revize_notu || undefined}><PenLine size={12} className="shrink-0" /> <span className="truncate">Revize istendi ({kayit.karar_veren}): {kayit.revize_notu}</span></span>
        {tam && dugme("Tekrar onaya gönder", false)}
      </>}
      <ConfirmDialog open={onayAc} onOpenChange={setOnayAc} title="Tekrar onaya gönderilsin mi?"
        description="Bu talimat daha önce onaylandı. Yeniden gönderirseniz onay grubuna yeni bir onay maili gider; onaylanınca talimat dağıtım listesine tekrar gönderilir."
        confirmLabel="Tekrar gönder" cancelLabel="Vazgeç" onConfirm={() => { setOnayAc(false); gonder(); }} />
    </div>
  );
}
