"use client";

/**
 * IRSALIYE EVRENI (13.11.2026). Kullanici: "Ic piyasa raporunda Ipsala Ajans toplam gelen, Luleburgaz Ajans toplam gelen
 * tonaj ve arac sayisi ile belirtilmeli. Irsaliye Incele tikladiginda ilgili irsaliyeleri inceleyebilecegi bir evren
 * karsilamali. Tek ekranda yonetilebilir olmali. Mumkunse 3D gibi belge havada kolay okunabilir sekilde olmali."
 *   /belge/irsaliyeler?tur=alis|satis&gun=YYYY-MM-DD[&k=<tedarikci / musteri id>][&odak=<teslim / sevk id>]
 * Gunluk ic piyasa raporundaki "Irsaliyeleri Incele (n)" (tedarikci / musteri ozeti) ve satirdaki "Irsaliye Incele"
 * (odak = o belge) buraya baglanir. Solda o gunun araclari, ortada secili irsaliye (havada suzulur, arkada siradaki belgeler
 * kart yigini), sagda bilgiler. Klavye: sol / sag ok. Okumak icin belgenin uzerine gelince durur.
 * Oturum gerekir (AppShell; giristen sonra buraya donulur). Kayitlar RLS + company_id ile; belge depodan 15 dk imzali adres.
 * Eski tek belge sayfasi (/belge/irsaliye?s= / ?a=) eski mailler icin aynen durur.
 */
import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import AppShell from "@/components/app-shell";
import { IrsaliyeEvreni, trGun, type Belge } from "@/components/irsaliye-evreni";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { IC_BELGE_BUCKET } from "@/lib/ic-piyasa/is-emri";
import { girisSonrasiTemizle } from "@/lib/giris-donus";
import { TEXT_MUTED } from "@/lib/theme";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GUN = /^\d{4}-\d{2}-\d{2}$/;
const kisaAd = (r: { unvan: string; kisa_ad: string | null } | null | undefined) => (r ? (r.kisa_ad || "").trim() || r.unvan : "-");

type AlisSatiri = {
  id: string; plaka: string | null; dorse_plaka: string | null; net_kg: number | string; irsaliye_no: string | null; irsaliye_tarihi: string | null;
  irsaliye_dosya_yolu: string | null; teslim_zamani: string | null; olusturma: string;
  ic_alis_siparisleri: { alis_no: string; urun: string | null; depo: string | null; tedarikci_id: string | null; ic_tedarikciler: { unvan: string; kisa_ad: string | null } | null } | null;
};
type SatisSatiri = {
  id: string; plaka: string; dorse_plaka: string | null; net_kg: number | string; irsaliye_no: string | null; irsaliye_tarihi: string | null;
  irsaliye_dosya_yolu: string | null; olusturma: string; cikis_durumu: string | null;
  ic_is_emirleri: { is_emri_no: string; urun: string | null; ambalaj: string | null; musteri_id: string | null; ic_musteriler: { unvan: string; kisa_ad: string | null } | null } | null;
};

async function belgeleriOku(companyId: string, tur: "alis" | "satis", gun: string, k: string | null): Promise<Belge[]> {
  const bas = new Date(`${gun}T00:00:00+03:00`).toISOString();
  const son = new Date(`${gun}T23:59:59.999+03:00`).toISOString();
  const aralik = (kolon: string) => `and(${kolon}.gte.${bas},${kolon}.lte.${son})`;
  if (tur === "alis") {
    let q = supabase.from("ic_alis_teslimler")
      .select("id, plaka, dorse_plaka, net_kg, irsaliye_no, irsaliye_tarihi, irsaliye_dosya_yolu, teslim_zamani, olusturma, ic_alis_siparisleri!inner(alis_no, urun, depo, tedarikci_id, ic_tedarikciler(unvan, kisa_ad))")
      .eq("company_id", companyId)
      .or([aralik("teslim_zamani"), aralik("irsaliye_tarihi"), aralik("olusturma")].join(","))
      .limit(500);
    if (k) q = q.eq("ic_alis_siparisleri.tedarikci_id", k);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data || []) as unknown as AlisSatiri[])
      .map((t) => ({ t, zaman: t.teslim_zamani || t.irsaliye_tarihi || t.olusturma }))
      .filter(({ zaman }) => trGun(zaman) === gun)
      .map(({ t, zaman }) => ({
        id: t.id, zaman, plaka: t.plaka, dorse: t.dorse_plaka, netKg: Number(t.net_kg) || 0, irsaliyeNo: t.irsaliye_no, irsaliyeTarihi: t.irsaliye_tarihi,
        yol: t.irsaliye_dosya_yolu, karsiTaraf: kisaAd(t.ic_alis_siparisleri?.ic_tedarikciler), siparisNo: t.ic_alis_siparisleri?.alis_no ?? null,
        urun: t.ic_alis_siparisleri?.urun ?? null, depo: t.ic_alis_siparisleri?.depo ?? null, durum: null,
      }))
      .sort((a, b) => a.zaman.localeCompare(b.zaman));
  }
  let q = supabase.from("ic_sevkler")
    .select("id, plaka, dorse_plaka, net_kg, irsaliye_no, irsaliye_tarihi, irsaliye_dosya_yolu, olusturma, cikis_durumu, ic_is_emirleri!inner(is_emri_no, urun, ambalaj, musteri_id, ic_musteriler(unvan, kisa_ad))")
    .eq("company_id", companyId)
    .or([aralik("irsaliye_tarihi"), aralik("olusturma")].join(","))
    .limit(500);
  if (k) q = q.eq("ic_is_emirleri.musteri_id", k);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data || []) as unknown as SatisSatiri[])
    .map((s) => ({ s, zaman: s.irsaliye_tarihi || s.olusturma }))
    .filter(({ zaman }) => trGun(zaman) === gun)
    .map(({ s, zaman }) => ({
      id: s.id, zaman, plaka: s.plaka, dorse: s.dorse_plaka, netKg: Number(s.net_kg) || 0, irsaliyeNo: s.irsaliye_no, irsaliyeTarihi: s.irsaliye_tarihi,
      yol: s.irsaliye_dosya_yolu, karsiTaraf: kisaAd(s.ic_is_emirleri?.ic_musteriler), siparisNo: s.ic_is_emirleri?.is_emri_no ?? null,
      urun: s.ic_is_emirleri ? `${s.ic_is_emirleri.urun || ""}${s.ic_is_emirleri.ambalaj ? ` (${s.ic_is_emirleri.ambalaj})` : ""}` : null, depo: null,
      durum: s.cikis_durumu === "cikti" ? "Yola çıktı" : s.cikis_durumu === "bugun_degil" ? "Bugün çıkmayacak" : "Çıkış bekliyor",
    }))
    .sort((a, b) => a.zaman.localeCompare(b.zaman));
}

function EvrenIcerik() {
  const params = useSearchParams();
  const { companyId, loading: authLoading } = useAuth();
  const turHam = params.get("tur");
  const tur: "alis" | "satis" | null = turHam === "alis" || turHam === "satis" ? turHam : null;
  const gun = params.get("gun") || "";
  const kHam = params.get("k");
  const k = kHam && UUID.test(kHam) ? kHam : null;
  const odak = params.get("odak");

  const [belgeler, setBelgeler] = useState<Belge[] | null>(null);
  const [adresler, setAdresler] = useState<Record<string, string>>({});
  const [baslangic, setBaslangic] = useState(0);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => { girisSonrasiTemizle(); }, []);

  useEffect(() => {
    if (authLoading || !companyId) return;
    if (!tur || !GUN.test(gun)) { setHata("Bağlantı geçersiz."); return; }
    let iptal = false;
    (async () => {
      try {
        setHata(null); setBelgeler(null); setAdresler({});
        const liste = await belgeleriOku(companyId, tur, gun, k);
        if (iptal) return;
        setBelgeler(liste);
        const i = odak ? liste.findIndex((b) => b.id === odak) : -1;
        setBaslangic(i >= 0 ? i : Math.max(0, liste.findIndex((b) => !!b.yol)));
        const yollar = liste.map((b) => b.yol).filter((y): y is string => !!y);
        if (!yollar.length) return;
        const { data, error } = await supabase.storage.from(IC_BELGE_BUCKET).createSignedUrls(yollar, 60 * 15);
        if (iptal) return;
        if (error) { setHata("Belgeler açılamadı. Lütfen sayfayı yenileyin."); return; }
        const m: Record<string, string> = {};
        (data || []).forEach((d) => { if (d.path && d.signedUrl) m[d.path] = d.signedUrl; });
        setAdresler(m);
      } catch (e) {
        if (!iptal) setHata(`İrsaliyeler okunamadı: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => { iptal = true; };
  }, [authLoading, companyId, tur, gun, k, odak]);

  return <IrsaliyeEvreni tur={tur} gun={gun} tekTaraf={!!k} belgeler={belgeler} adresler={adresler} hata={hata} baslangic={baslangic} />;
}

export default function IrsaliyeEvreniSayfasi() {
  return (
    <AppShell>
      <Suspense fallback={<div className="flex justify-center py-24"><Loader2 className="animate-spin" size={26} style={{ color: TEXT_MUTED }} /></div>}>
        <EvrenIcerik />
      </Suspense>
    </AppShell>
  );
}
