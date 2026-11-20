/**
 * FATURA TALIMATI MAILI - istemci. Edge: fatura-onay; tablo: fatura_talimati_onaylari (salt okunur).
 * 11.11.2026: onay akisi. 14.11.2026 (kullanici): onay adimi kaldirildi; "Harun Bey merhaba" talimat maili dogrudan
 * gider (Ayarlar > Rapor Alicilari > Fatura Talimati), mailde "Fatura Talimatini Indir (PDF)" dugmesi.
 *  - Rezervasyondaki konteynerlerin hepsi girilince pg_cron (10 dk) talimat mailini atar (kayit durumu 'gonderildi').
 *  - /fatura-onay?id=...&indir=1 sayfasi talimatin PDF'ini dosya sayfasiyla AYNI ureticiyle
 *    (lib/fatura-talimati-pdf-builder) tarayicida olusturur, onizler ve indirir.
 *  - Dosya sayfasinda (Konteynerler) son durum + "Simdi gonder / Tekrar gonder".
 * Eski kayitlarda 'bekliyor' / 'onaylandi' / 'revize' durumlari kalabilir (yalniz gosterim).
 */
import { supabase, type Dosya, type Konteyner, type Rezervasyon } from "@/lib/supabase";
import { faturaTalimatiPdfOlustur } from "@/lib/fatura-talimati-pdf-builder";
import { bayrakPng } from "@/lib/bayraklar";
import { dosyaTicaretUlkesi } from "@/lib/ulke-bul";
import type { TalimatParcaGirdisi } from "@/lib/diib/bolunme-talimat";

/** 14.11.2026 atlandi: canliya geciste mail istenmeyen eski hazir dosya (mail GITMEDI). */
export type FaturaOnayDurumu = "gonderildi" | "atlandi" | "bekliyor" | "onaylandi" | "revize";
export type FaturaOnayKaydi = {
  id: string;
  dosya_id: string;
  durum: FaturaOnayDurumu;
  test: boolean;
  kaynak: "otomatik" | "elle";
  gonderen: string | null;
  onay_alicilari: string[];
  gonderilen: string[];
  karar_veren: string | null;
  karar_zamani: string | null;
  revize_notu: string | null;
  dagitim_konusu: string | null;
  dagitim_alicilari: string[] | null;
  olusturma: string;
};
const ALANLAR = "id,dosya_id,durum,test,kaynak,gonderen,onay_alicilari,gonderilen,karar_veren,karar_zamani,revize_notu,dagitim_konusu,dagitim_alicilari,olusturma";

export const ONAY_DURUM_ADI: Record<FaturaOnayDurumu, string> = { gonderildi: "Gönderildi", atlandi: "Gönderilmedi (canlıya geçişte atlandı)", bekliyor: "Onay bekliyor (eski)", onaylandi: "Onaylandı (eski)", revize: "Revize istendi (eski)" };

/** Dosyanin en son onay kaydi (yoksa null). 19.11.2026: dosya birlesik faturadaysa grubun en son kaydi (grup maili tek kayittir). */
export async function sonFaturaOnayi(dosyaId: string): Promise<FaturaOnayKaydi | null> {
  let ids = [dosyaId];
  const g = await supabase.from("fatura_grubu_dosyalari").select("grup_id").eq("dosya_id", dosyaId).maybeSingle();
  if (!g.error && g.data?.grup_id) {
    const u = await supabase.from("fatura_grubu_dosyalari").select("dosya_id").eq("grup_id", g.data.grup_id);
    if (!u.error && u.data?.length) ids = u.data.map((x) => x.dosya_id as string);
  }
  const { data, error } = await supabase.from("fatura_talimati_onaylari").select(ALANLAR).in("dosya_id", ids).order("olusturma", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return ((data || [])[0] as FaturaOnayKaydi | undefined) || null;
}

export async function faturaOnayiGetir(id: string): Promise<FaturaOnayKaydi | null> {
  const { data, error } = await supabase.from("fatura_talimati_onaylari").select(ALANLAR).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FaturaOnayKaydi | null) || null;
}

async function edge(govde: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: oturum } = await supabase.auth.getSession();
  const token = oturum.session?.access_token;
  if (!token) throw new Error("Oturum bulunamadı. Lütfen yeniden giriş yapın.");
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fatura-onay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", Authorization: `Bearer ${token}` },
    body: JSON.stringify(govde),
  });
  const veri = (await res.json().catch(() => ({}))) as { ok?: boolean; hata?: string } & Record<string, unknown>;
  if (!res.ok || !veri.ok) throw new Error(veri.hata || `İstek başarısız (HTTP ${res.status}).`);
  return veri;
}

/** Talimat mailini simdi / tekrar gonder (konteynerler tam olmali). */
export async function talimatMailiGonder(dosyaId: string): Promise<{ test: boolean; alicilar: string[] }> {
  const v = await edge({ gonder: dosyaId });
  return { test: v.test === true, alicilar: Array.isArray(v.alicilar) ? (v.alicilar as string[]) : [] };
}

export const talimatPdfAdi = (dosyaNo: string | null | undefined) => `Fatura_Talimati_${(dosyaNo || "dosya").replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;

/** Dosya sayfasindaki "Fatura Talimati Indir" ile AYNI PDF (bayrak dahil): onizleme / indirme blob'u. */
export async function talimatPdfUret(dosya: Dosya, rezervasyonlar: Rezervasyon[], konteynerler: Konteyner[], bolunme: TalimatParcaGirdisi[]): Promise<{ blob: Blob; ad: string }> {
  const bayrak = await bayrakPng(dosyaTicaretUlkesi(dosya.ticaret_ulkesi, dosya.alici_adresi));
  const doc = faturaTalimatiPdfOlustur(dosya, rezervasyonlar, konteynerler, false, bolunme, bayrak);
  return { blob: doc.output("blob"), ad: talimatPdfAdi(dosya.dosya_no) };
}

export const trZaman = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
