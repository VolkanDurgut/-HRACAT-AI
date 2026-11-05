"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileText, Loader2, ExternalLink, Download, ShieldAlert, Truck, Scale, CalendarDays } from "lucide-react";
import AppShell from "@/components/app-shell";
import { SayfaBasligi } from "@/components/sayfa-basligi";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { IC_BELGE_BUCKET } from "@/lib/ic-piyasa/is-emri";
import { girisSonrasiTemizle } from "@/lib/giris-donus";
import { CARD_BG, CARD_BORDER, TEXT_MUTED, ACCENT, ROW_HEADER_BG } from "@/lib/theme";

/**
 * IRSALIYE INCELE (06.11.2026). Kullanici: "Ic piyasa raporunda irsaliye numarasinda 'Irsaliye Incele'
 * ile irsaliyeyi gosterebilmeliyiz." Gunluk ic piyasa raporu e-postasi bu sayfaya baglanir:
 *   /belge/irsaliye?s=<ic_sevkler.id>   (yuklenen / satis araci)
 *   /belge/irsaliye?a=<ic_alis_teslimler.id> (gelen / alis araci)
 * Oturum gerekir (AppShell); oturum yoksa giristen sonra buraya donulur (lib/giris-donus.ts).
 * Belge depodan 10 dakikalik imzali adresle acilir; kayit ve belge RLS ile korunur (yetkisizse
 * "goruntuleme yetkiniz yok"). E-postada belge adresi YOK - yalniz bu sayfanin adresi.
 */
type Kayit = {
  tur: "satis" | "alis";
  irsaliyeNo: string | null; irsaliyeTarihi: string | null; plaka: string | null; netKg: number;
  karsiTaraf: string | null; siparisNo: string | null; yol: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tarihYaz = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");

function IrsaliyeIcerik() {
  const params = useSearchParams();
  const { companyId, loading: authLoading } = useAuth();
  const sevkId = params.get("s");
  const alisId = params.get("a");
  const [kayit, setKayit] = useState<Kayit | null>(null);
  const [adres, setAdres] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => { girisSonrasiTemizle(); }, []);

  useEffect(() => {
    if (authLoading || !companyId) return;
    let iptal = false;
    (async () => {
      setHata(null); setKayit(null); setAdres(null);
      const id = sevkId || alisId;
      if (!id || !UUID.test(id)) { setHata("Bağlantı geçersiz."); return; }
      let k: Kayit | null = null;
      if (sevkId) {
        const r = await supabase.from("ic_sevkler")
          .select("plaka, net_kg, irsaliye_no, irsaliye_tarihi, irsaliye_dosya_yolu, olusturma, ic_is_emirleri(is_emri_no, ic_musteriler(unvan))")
          .eq("id", id).eq("company_id", companyId).maybeSingle();
        const d = r.data as { plaka: string; net_kg: number | string; irsaliye_no: string | null; irsaliye_tarihi: string | null; irsaliye_dosya_yolu: string | null; olusturma: string; ic_is_emirleri: { is_emri_no: string; ic_musteriler: { unvan: string } | null } | null } | null;
        if (d) k = { tur: "satis", irsaliyeNo: d.irsaliye_no, irsaliyeTarihi: d.irsaliye_tarihi || d.olusturma, plaka: d.plaka, netKg: Number(d.net_kg) || 0, karsiTaraf: d.ic_is_emirleri?.ic_musteriler?.unvan ?? null, siparisNo: d.ic_is_emirleri?.is_emri_no ?? null, yol: d.irsaliye_dosya_yolu };
      } else {
        const r = await supabase.from("ic_alis_teslimler")
          .select("plaka, net_kg, irsaliye_no, irsaliye_tarihi, irsaliye_dosya_yolu, teslim_zamani, olusturma, ic_alis_siparisleri(alis_no, ic_tedarikciler(unvan))")
          .eq("id", id).eq("company_id", companyId).maybeSingle();
        const d = r.data as { plaka: string | null; net_kg: number | string; irsaliye_no: string | null; irsaliye_tarihi: string | null; irsaliye_dosya_yolu: string | null; teslim_zamani: string | null; olusturma: string; ic_alis_siparisleri: { alis_no: string; ic_tedarikciler: { unvan: string } | null } | null } | null;
        if (d) k = { tur: "alis", irsaliyeNo: d.irsaliye_no, irsaliyeTarihi: d.irsaliye_tarihi || d.teslim_zamani || d.olusturma, plaka: d.plaka, netKg: Number(d.net_kg) || 0, karsiTaraf: d.ic_alis_siparisleri?.ic_tedarikciler?.unvan ?? null, siparisNo: d.ic_alis_siparisleri?.alis_no ?? null, yol: d.irsaliye_dosya_yolu };
      }
      if (iptal) return;
      if (!k) { setHata("İrsaliye bulunamadı ya da görüntüleme yetkiniz yok."); return; }
      setKayit(k);
      if (!k.yol) { setHata("Bu kayda irsaliye belgesi yüklenmemiş."); return; }
      const { data, error } = await supabase.storage.from(IC_BELGE_BUCKET).createSignedUrl(k.yol, 60 * 10);
      if (iptal) return;
      if (error || !data?.signedUrl) { setHata("İrsaliye belgesi açılamadı. Lütfen sayfayı yenileyin."); return; }
      setAdres(data.signedUrl);
    })();
    return () => { iptal = true; };
  }, [authLoading, companyId, sevkId, alisId]);

  const resim = !!kayit?.yol && /\.(jpe?g|png|webp)$/i.test(kayit.yol);
  const baslik = kayit?.irsaliyeNo ? `İrsaliye ${kayit.irsaliyeNo}` : "İrsaliye";

  return (
    <div className="max-w-[1100px]">
      <SayfaBasligi ikon={<FileText size={20} />} baslik={baslik}
        aciklama={kayit ? `${kayit.tur === "satis" ? "Yüklenen araç · satış" : "Gelen araç · alış"}${kayit.karsiTaraf ? ` · ${kayit.karsiTaraf}` : ""}${kayit.siparisNo ? ` · ${kayit.siparisNo}` : ""}` : "İç piyasa irsaliyesi"}
        sag={adres ? (
          <div className="flex flex-wrap gap-2">
            <a href={adres} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: CARD_BORDER, color: "#CBD5E1" }} data-testid="irsaliye-yeni-sekme">
              <ExternalLink size={14} /> Yeni sekmede aç
            </a>
            <a href={adres} download className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: ACCENT }}>
              <Download size={14} /> İndir
            </a>
          </div>
        ) : undefined}
      />

      {kayit && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4" data-testid="irsaliye-ozet">
          {[
            { ikon: <FileText size={13} />, ad: "İrsaliye No", deger: kayit.irsaliyeNo || "-" },
            { ikon: <CalendarDays size={13} />, ad: "Tarih", deger: tarihYaz(kayit.irsaliyeTarihi) },
            { ikon: <Truck size={13} />, ad: "Plaka", deger: kayit.plaka || "-" },
            { ikon: <Scale size={13} />, ad: "Net", deger: `${kayit.netKg.toLocaleString("tr-TR")} kg` },
          ].map((x) => (
            <div key={x.ad} className="rounded-lg border px-3 py-2" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
              <p className="text-[10px] uppercase tracking-wider inline-flex items-center gap-1" style={{ color: TEXT_MUTED }}>{x.ikon} {x.ad}</p>
              <p className="text-sm font-semibold text-white mt-0.5 font-mono truncate">{x.deger}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: CARD_BG, borderColor: CARD_BORDER }}>
        {hata ? (
          <div className="flex flex-col items-center justify-center text-center py-20 px-6" data-testid="irsaliye-hata">
            <ShieldAlert size={30} className="text-amber-400 mb-3" />
            <p className="text-sm text-white font-medium">{hata}</p>
          </div>
        ) : !adres ? (
          <div className="flex justify-center py-24"><Loader2 className="animate-spin" size={26} style={{ color: TEXT_MUTED }} /></div>
        ) : resim ? (
          <div className="p-3" style={{ backgroundColor: ROW_HEADER_BG }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={adres} alt={baslik} className="mx-auto max-h-[80vh] object-contain" data-testid="irsaliye-gorsel" />
          </div>
        ) : (
          <iframe src={adres} title={baslik} className="w-full h-[80vh] bg-white" data-testid="irsaliye-pdf" />
        )}
      </div>
    </div>
  );
}

export default function IrsaliyeSayfasi() {
  return (
    <AppShell>
      <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="animate-spin" size={26} style={{ color: TEXT_MUTED }} /></div>}>
        <IrsaliyeIcerik />
      </Suspense>
    </AppShell>
  );
}
