/**
 * Ayarlar > Yedekler (13.11.2026). Gece veri yedeginin zip'i mail eki yerine OZEL depoda durur (kurumsal posta sunucusu
 * .zip ekini karantinaya aliyordu; kullanici karari "Ek yerine giris gerektiren link").
 * Liste: yedek_listesi RPC; indirme: edge "yedek-indir" (120 sn imzali link). Ikisi de yalniz super admin (veritabani
 * public.yetki_super_admin_sirketi ile kontrol eder; istemci kontrolu yalniz gorunum icindir). Her indirme kaydedilir.
 */
import { supabase } from "@/lib/supabase";

export type YedekSatiri = {
  id: string;
  created_at: string;
  durum: "basarili" | "uyarili" | "hatali" | "test";
  toplam_kayit: number | null;
  tablo_sayisi: number | null;
  json_bayt: number | null;
  dosya_bayt: number | null;
  dosya_var: boolean;
  uyari_sayisi: number;
  hata: string | null;
  indirme_sayisi: number;
  son_indirme: string | null;
};

export async function yedekListesi(): Promise<YedekSatiri[]> {
  const { data, error } = await supabase.rpc("yedek_listesi");
  if (error) throw new Error(error.message);
  return (data || []) as YedekSatiri[];
}

/** Kisa sureli indirme linki ister (indirme kaydedilir). */
export async function yedekIndirmeLinki(id: string): Promise<{ url: string; dosya: string }> {
  const { data: oturum } = await supabase.auth.getSession();
  const token = oturum.session?.access_token;
  if (!token) throw new Error("Oturum bulunamadı. Lütfen yeniden giriş yapın.");
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/yedek-indir`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id }),
  });
  const veri = (await res.json().catch(() => ({}))) as { ok?: boolean; hata?: string; url?: string; dosya?: string };
  if (!res.ok || !veri.ok || !veri.url) throw new Error(veri.hata || `İndirme başlatılamadı (HTTP ${res.status}).`);
  return { url: veri.url, dosya: veri.dosya || "yedek.zip" };
}

export const mbYaz = (bayt: number | null) => (bayt === null ? "—" : `${(bayt / (1024 * 1024)).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MB`);
