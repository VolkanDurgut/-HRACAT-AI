"use client";
/**
 * Rezervasyon formu önerisi (16.11.2026, operasyon bağlantıları). Booking no yükleme planında varsa gemi / sefer /
 * kesimler / ekipman / acente BOŞ alanlara önerilir; navlun için plan navlunu ve navlun mailindeki anlaşma rakamı
 * gösterilir. Hiçbir şey kendiliğinden yazılmaz: kullanıcı "Boş alanları doldur" ya da "Kullan" der, sonra Kaydet'e basar.
 * Kaynak: rezervasyon_onerisi() RPC (migration 20261116230000_operasyon_baglantilari.sql).
 */
import React, { useEffect, useMemo, useState } from "react";
import { supabase, Dosya } from "@/lib/supabase";
import { CARD_BORDER, TEXT_MUTED } from "@/lib/theme";
import { bosAlanOnerileri, ESLESME_METNI, rezervasyonOnerisiOku, type OneriFormu, type RezervasyonOnerisi as Oneri } from "@/lib/operasyon-onerileri";
import { navlunAliciyaAitMi } from "@/lib/teslim-sekli";
import { Lightbulb } from "lucide-react";

const tarihYaz = (v: string) => (v ? new Date(v).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Istanbul" }) : "");
const tutarYaz = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

export function RezervasyonOnerisi({ form, dosya, update }: {
  form: OneriFormu;
  dosya: Dosya;
  update: (field: string, value: string | number) => void;
}) {
  const [oneri, setOneri] = useState<Oneri | null>(null);
  const booking = form.booking_no.trim();
  const liman = (form.varis_limani || dosya.varis_limani || "").trim();

  useEffect(() => {
    // Yazarken her tuşta sorgu atılmasın
    if (booking.length < 6 && liman.length < 3) { setOneri(null); return; }
    let iptal = false;
    const zaman = setTimeout(async () => {
      const { data, error } = await supabase.rpc("rezervasyon_onerisi", {
        p_booking: booking || null, p_varis_limani: liman || null, p_etd: form.gemi_kalkis_tarihi || null,
        p_konteyner: form.konteyner_adedi || null,
      });
      // Öneri yardımcıdır; hata formu bozmaz, sessizce gizlenir
      if (!iptal) setOneri(error ? null : rezervasyonOnerisiOku(data));
    }, 500);
    return () => { iptal = true; clearTimeout(zaman); };
  }, [booking, liman, form.gemi_kalkis_tarihi, form.konteyner_adedi]);

  const para = (dosya.para_birimi || "USD").toUpperCase();
  // FOB / FCA / FAS / EXW: navlunu alici oder -> navlun onerilmez
  const aliciOder = navlunAliciyaAitMi(dosya.teslim_sekli);
  const doldurulacak = useMemo(() => {
    const o = bosAlanOnerileri(form, oneri?.plan ?? null, para);
    if (aliciOder) { delete o.navlun_tutari; delete o.lokal_masraf_tutari; }
    return o;
  }, [form, oneri, para, aliciOder]);
  const alanSayisi = Object.keys(doldurulacak).length;
  const anlasmalar = aliciOder ? [] : (oneri?.navlun || []).filter((a) => a.para === para);
  if (!oneri || (!oneri.plan && anlasmalar.length === 0)) return null;

  const doldur = () => Object.entries(doldurulacak).forEach(([k, v]) => update(k, v as string | number));
  const p = oneri.plan;
  const navlunSayi = Number(String(form.navlun_tutari).replace(",", "."));

  return (
    <div className="md:col-span-3 rounded-lg border px-3 py-2.5 text-xs" style={{ borderColor: CARD_BORDER, backgroundColor: "rgba(245, 158, 11, 0.06)" }}>
      <div className="flex items-start gap-2">
        <Lightbulb size={14} className="mt-0.5 shrink-0 text-amber-400" />
        <div className="flex-1 space-y-1.5">
          {p && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-white">
                Yükleme planında bu booking var: <b>{[p.gemi_adi, p.sefer_no].filter(Boolean).join(" · ") || "gemi bilgisi yok"}</b>
                {p.gemi_kalkis_tarihi && <> · ETD {tarihYaz(p.gemi_kalkis_tarihi)}</>}
                {p.konteyner_adedi ? <> · {p.konteyner_adedi} kont.</> : null}
                {p.musteri && <span style={{ color: TEXT_MUTED }}> · {p.musteri}</span>}
              </span>
              {alanSayisi > 0 ? (
                <button type="button" onClick={doldur} className="rounded px-2 py-1 font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20">
                  Boş alanları doldur ({alanSayisi})
                </button>
              ) : (
                <span style={{ color: TEXT_MUTED }}>Plandaki bilgiler formda mevcut.</span>
              )}
            </div>
          )}
          {anlasmalar.map((a, i) => (
            <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-white">
                Navlun anlaşması: <b>{tutarYaz(a.tutar)} {a.para}</b>
                <span style={{ color: TEXT_MUTED }}> · {[[a.acente, a.armator && a.armator !== a.acente ? a.armator : null].filter(Boolean).join(" / "), tarihYaz(a.tarih), ESLESME_METNI[a.eslesme]].filter(Boolean).join(" · ")}</span>
              </span>
              {navlunSayi === a.tutar ? (
                <span style={{ color: TEXT_MUTED }}>Formdaki navlunla aynı.</span>
              ) : (
                <button type="button" onClick={() => update("navlun_tutari", String(a.tutar))} className="rounded px-2 py-1 font-medium text-amber-400 bg-amber-500/10 hover:bg-amber-500/20">
                  Kullan
                </button>
              )}
            </div>
          ))}
          <p style={{ color: TEXT_MUTED }}>Öneridir; Kaydet&apos;e basmadan hiçbir şey kaydedilmez. Anlaşma rakamı konteyner başı navlundur, lokal masrafı ayrıca kontrol edin.</p>
        </div>
      </div>
    </div>
  );
}
