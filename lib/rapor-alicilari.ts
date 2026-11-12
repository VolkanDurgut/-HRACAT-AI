/**
 * Ayarlar > Rapor Alicilari (11.11.2026). Gunluk rapor mailleri (siparis, navlun) ve fatura talimati onayi (onaylayanlar,
 * dagitim) icin alici listesi ve canli / test secimi. Musteri ozeti raporu kaldirildi (11.11.2026 aksam). Kayit: rapor_alicilari_liste / rapor_alicilari_kaydet RPC (yalniz super admin).
 * Onizleme ({deneme: true}) mail GONDERMEZ, HTML doner; test ({test: true}) "[TEST]" maili YALNIZ test adresine gider.
 */
import { supabase } from "@/lib/supabase";

export type RaporTuru = "siparis" | "navlun" | "fatura_onay" | "fatura_dagitim";
export type RaporAlicisi = { rapor: RaporTuru; alicilar: string[]; canli: boolean; guncelleyen: string | null; guncelleme: string | null };

/** edge: Onizle / Test maili olan raporlar (fatura listelerinde yok: onlar dosya konteynerleri tamamlaninca tetiklenir). */
export const RAPORLAR: { rapor: RaporTuru; ad: string; aciklama: string; saat: string; edge: string | null }[] = [
  { rapor: "siparis", ad: "Sipariş Raporu", aciklama: "Gelen ön ödemeler (müşteri, konteyner, varış limanı) + Excel (Sipariş Listesi + Yükleme Planı)", saat: "Her gün 08:00 ve 17:00", edge: "siparis-rapor" },
  { rapor: "navlun", ad: "Navlun Raporu", aciklama: "Otomatik özet + tüm limanların güncel fiyatı + Excel (navlun tablosu)", saat: "Her gün 08:00 ve 17:00", edge: "navlun-tablosu" },
  { rapor: "fatura_onay", ad: "Fatura Talimatı Onayı", aciklama: "Bütün konteynerleri yüklenen dosyanın talimatını onaylayan / revize isteyenler (İncele ve Onayla maili)", saat: "Konteynerler tamamlanınca (10 dk içinde)", edge: null },
  { rapor: "fatura_dagitim", ad: "Onaylı Fatura Talimatı", aciklama: "Onaylanan talimat PDF ekli gider: “FATURA VE BEYANNAME TALİMATI HAKKINDA // …”", saat: "Talimat onaylanınca", edge: null },
];
export const AZAMI_ALICI = 10;

const EPOSTA_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** "a@x.com, b@y.com; c@z.com" -> temiz, tekil, kucuk harf liste + gecersizler */
export function adresAyikla(metin: string): { gecerli: string[]; gecersiz: string[] } {
  const parca = metin.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const gecerli = Array.from(new Set(parca.filter((x) => EPOSTA_RE.test(x))));
  return { gecerli, gecersiz: parca.filter((x) => !EPOSTA_RE.test(x)) };
}

export async function raporAlicilariGetir(): Promise<RaporAlicisi[]> {
  const { data, error } = await supabase.rpc("rapor_alicilari_liste");
  if (error) throw new Error(error.message);
  return (data || []) as RaporAlicisi[];
}

export async function raporAlicilariKaydet(rapor: RaporTuru, alicilar: string[], canli: boolean): Promise<void> {
  const { error } = await supabase.rpc("rapor_alicilari_kaydet", { p_rapor: rapor, p_alicilar: alicilar, p_canli: canli });
  if (error) throw new Error(error.message);
}

async function edgeCagir(edge: string, govde: Record<string, unknown>) {
  const { data: oturum } = await supabase.auth.getSession();
  const token = oturum.session?.access_token;
  if (!token) throw new Error("Oturum bulunamadı. Lütfen yeniden giriş yapın.");
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${edge}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", Authorization: `Bearer ${token}` },
    body: JSON.stringify(govde),
  });
  const veri = (await res.json().catch(() => ({}))) as { ok?: boolean; hata?: string; sonuclar?: { html?: string; konu?: string; atlandi?: string; gonderildi?: boolean }[] };
  if (!res.ok || !veri.ok) throw new Error(veri.hata || `İstek başarısız (HTTP ${res.status}).`);
  const s = veri.sonuclar?.[0];
  if (!s) throw new Error("Rapor oluşturulamadı (veri yok).");
  if (s.atlandi) throw new Error(s.atlandi);
  return s;
}

/** Mail gondermeden raporun bugunku halini getirir. */
export async function raporOnizle(edge: string): Promise<{ konu: string; html: string }> {
  const s = await edgeCagir(edge, { deneme: true });
  return { konu: s.konu || "", html: s.html || "" };
}

/** "[TEST]" maili yalniz test adresine. */
export async function raporTestMaili(edge: string): Promise<void> {
  await edgeCagir(edge, { test: true });
}
