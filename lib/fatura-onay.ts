/**
 * FATURA TALIMATI ONAYI - istemci (11.11.2026). Edge: fatura-onay; tablo: fatura_talimati_onaylari (salt okunur).
 * Kullanici: "Butun konteynerler yuklendiginde fatura talimati onaya gonderilmeli. Onay veya revize butonlari olmali.
 * Onaylanirsa onaylanmis fatura talimati dagitim listesine mail gitmeli."
 *  - Rezervasyondaki konteynerlerin hepsi girilince pg_cron (10 dk) onay grubuna "Incele ve Onayla" maili atar.
 *  - /fatura-onay?id=... sayfasi talimatin PDF'ini dosya sayfasiyla AYNI ureticiyle (lib/fatura-talimati-pdf-builder)
 *    tarayicida olusturur; Onayla -> PDF edge'e gider, dagitim maili PDF ekli gider.
 *  - Dosya sayfasinda (Konteynerler) son durum + "Onaya gonder / Tekrar onaya gonder".
 */
import { supabase, type Dosya, type Konteyner, type Rezervasyon } from "@/lib/supabase";
import { faturaTalimatiPdfOlustur } from "@/lib/fatura-talimati-pdf-builder";
import { bayrakPng } from "@/lib/bayraklar";
import { ticaretYapilanUlke } from "@/lib/ulke-bul";
import type { TalimatParcaGirdisi } from "@/lib/diib/bolunme-talimat";

export type FaturaOnayDurumu = "bekliyor" | "onaylandi" | "revize";
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

export const ONAY_DURUM_ADI: Record<FaturaOnayDurumu, string> = { bekliyor: "Onay bekliyor", onaylandi: "Onaylandı", revize: "Revize istendi" };

/** Dosyanin en son onay kaydi (yoksa null). */
export async function sonFaturaOnayi(dosyaId: string): Promise<FaturaOnayKaydi | null> {
  const { data, error } = await supabase.from("fatura_talimati_onaylari").select(ALANLAR).eq("dosya_id", dosyaId).order("olusturma", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return ((data || [])[0] as FaturaOnayKaydi | undefined) || null;
}

export async function faturaOnayiGetir(id: string): Promise<FaturaOnayKaydi | null> {
  const { data, error } = await supabase.from("fatura_talimati_onaylari").select(ALANLAR).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FaturaOnayKaydi | null) || null;
}

/** Onaylayabilir mi: onay listesinde ya da onay maili ona gittiyse (test modunda test adresi). */
export function onaylayabilir(k: Pick<FaturaOnayKaydi, "onay_alicilari" | "gonderilen">, eposta: string | null | undefined): boolean {
  const e = (eposta || "").toLowerCase();
  return !!e && [...(k.onay_alicilari || []), ...(k.gonderilen || [])].some((a) => a.toLowerCase() === e);
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

/** Elle onaya gonder (konteynerler tam olmali). */
export async function onayaGonder(dosyaId: string): Promise<{ test: boolean }> {
  const v = await edge({ gonder: dosyaId });
  return { test: v.test === true };
}

export async function revizeIste(id: string, not: string): Promise<{ mailHatasi: string | null }> {
  const v = await edge({ karar: "revize", id, not });
  return { mailHatasi: (v.mailHatasi as string | null) || null };
}

export async function onayla(id: string, pdfBase64: string, pdfAdi: string): Promise<{ test: boolean; konu: string; alicilar: string[] }> {
  const v = await edge({ karar: "onay", id, pdf: pdfBase64, pdf_adi: pdfAdi });
  return { test: v.test === true, konu: String(v.konu || ""), alicilar: (v.alicilar as string[]) || [] };
}

export const talimatPdfAdi = (dosyaNo: string | null | undefined) => `Fatura_Talimati_${(dosyaNo || "dosya").replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;

/** Dosya sayfasindaki "Fatura Talimati Indir" ile AYNI PDF (bayrak dahil): onizleme blob'u + edge icin base64. */
export async function talimatPdfUret(dosya: Dosya, rezervasyonlar: Rezervasyon[], konteynerler: Konteyner[], bolunme: TalimatParcaGirdisi[]): Promise<{ blob: Blob; base64: string; ad: string }> {
  const bayrak = await bayrakPng(ticaretYapilanUlke(dosya.alici_adresi));
  const doc = faturaTalimatiPdfOlustur(dosya, rezervasyonlar, konteynerler, false, bolunme, bayrak);
  const uri = doc.output("datauristring");
  return { blob: doc.output("blob"), base64: uri.slice(uri.indexOf(",") + 1), ad: talimatPdfAdi(dosya.dosya_no) };
}

export const trZaman = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
