"use client";
/**
 * Proforma hazırlarken limanın güncel navlunu (16.11.2026, operasyon bağlantıları). CFR / CIF vb. teslim ifadesinden
 * ("CIF DJIBOUTI PORT BASIS") varış limanı çıkarılır; son 60 günün teklifleri (acente başına son 20'DC USD) ve son
 * anlaşma gösterilir. Yalnız bilgi: proformaya hiçbir şey yazılmaz. FOB grubunda (navlunu alıcı öder) gösterilmez.
 * Kaynak: navlun_liman_referansi() RPC (migration 20261116230000_operasyon_baglantilari.sql).
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { limanReferansiOku, teslimdenVarisLimani, type LimanReferansi } from "@/lib/operasyon-onerileri";
import { Ship } from "lucide-react";

const tarihYaz = (v: string) => (v ? new Date(v).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Istanbul" }) : "");
const usd = (n: number) => `${n.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} $`;

export function NavlunLimanReferansi({ teslim }: { teslim: string }) {
  const liman = teslimdenVarisLimani(teslim);
  const [ref, setRef] = useState<LimanReferansi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  useEffect(() => {
    if (!liman) { setRef(null); return; }
    let iptal = false;
    setYukleniyor(true);
    const zaman = setTimeout(async () => {
      const { data, error } = await supabase.rpc("navlun_liman_referansi", { p_liman: liman });
      if (iptal) return;
      // Yardımcı bilgi; hata (ör. yetki) proformayı bozmaz, panel gizlenir
      setRef(error ? null : limanReferansiOku(data));
      setYukleniyor(false);
    }, 600);
    return () => { iptal = true; clearTimeout(zaman); };
  }, [liman]);

  if (!liman || (!ref && !yukleniyor)) return null;
  const bos = ref && ref.teklifler.length === 0 && !ref.anlasma;

  return (
    <div className="sm:col-span-2 rounded-lg border px-3 py-2.5 text-xs" style={{ borderColor: CARD_BORDER }}>
      <div className="flex items-center gap-2 mb-1.5">
        <Ship size={14} className="text-sky-400" />
        <span className="font-semibold text-white">Güncel navlun · {ref?.liman || liman.toUpperCase()}</span>
        <span style={{ color: TEXT_MUTED }}>(20&apos;DC, konteyner başı; yalnız bilgi)</span>
      </div>
      {yukleniyor && !ref ? (
        <p style={{ color: TEXT_MUTED }}>Yükleniyor…</p>
      ) : bos ? (
        <p style={{ color: TEXT_MUTED }}>Bu liman için son 60 günde teklif ya da anlaşma yok. <Link href="/navlun" className="underline">Navlun sayfası</Link></p>
      ) : ref ? (
        <div className="space-y-1">
          {ref.anlasma && (
            <p className="text-white">
              Son anlaşma: <b>{usd(ref.anlasma.tutar)}</b>
              <span style={{ color: TEXT_MUTED }}> · {[[ref.anlasma.acente, ref.anlasma.armator && ref.anlasma.armator !== ref.anlasma.acente ? ref.anlasma.armator : null].filter(Boolean).join(" / "), tarihYaz(ref.anlasma.tarih)].filter(Boolean).join(" · ")}</span>
            </p>
          )}
          {ref.teklifler.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {ref.teklifler.slice(0, 5).map((t, i) => (
                <span key={i} className={i === 0 ? "text-emerald-400" : "text-white"}>
                  {t.acente || t.armator || "?"}{t.armator && t.acente && t.armator !== t.acente ? ` (${t.armator})` : ""}: <b>{usd(t.tutar)}</b>
                  <span style={{ color: TEXT_MUTED }}>
                    {" "}· {tarihYaz(t.tarih)}{t.lokal_dahil === true ? " · lokal dahil" : t.lokal_dahil === false ? " · lokal hariç" : ""}{t.free_time_gun ? ` · ${t.free_time_gun} gün FT` : ""}
                  </span>
                </span>
              ))}
            </div>
          )}
          {ref.teklifler.length === 1 && <p style={{ color: TEXT_MUTED }}>Bu limanda tek teklif var; fiyat vermeden önce ikinci bir acenteden teyit önerilir.</p>}
        </div>
      ) : null}
    </div>
  );
}
