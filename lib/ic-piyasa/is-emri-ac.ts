/**
 * Sipariş formuyla is emri ac (22.10.2026, tek adim).
 * Sira: once PDF depoya (<sirket>/siparis/<uuid>.pdf), sonra is emri kaydi;
 * kayit olmazsa PDF GERI SILINIR (sahipsiz dosya kalmaz).
 * Numara (IE-YYYY-NNNN), takip anahtari ve "Siparişiniz alındı" bildirimi
 * sunucuda tetikleyicilerle olusur.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { yazmaHatasi } from "@/lib/supabase";
import { IC_BELGE_BUCKET, hataMesaji } from "./is-emri";
import { siparisFormuYolu, type UrunOzelligi } from "./siparis-formu";

export type IsEmriKaydi = {
  musteri_id: string;
  urun: string;
  ambalaj: string | null;
  hedef_tur: "kg";
  hedef_kg: number;
  birim_fiyat: number | null;
  kdv_dahil: boolean;
  vade_gun: number | null;
  odeme: string | null;
  teslim: string | null;
  teslim_adresi: string | null;
  talimat_veren: string | null;
  siparis_tarihi: string | null;
  nakliye: "alici" | "satici" | null;
  teslim_suresi_gun: number | null;
  urun_ozellikleri: UrunOzelligi[] | null;
};

export async function isEmriniFormlaAc(
  supabase: SupabaseClient,
  p: { companyId: string; email: string | null; kayit: IsEmriKaydi; dosya: File }
): Promise<{ tamam: true; isEmriNo: string } | { tamam: false; hata: string }> {
  const yol = siparisFormuYolu(p.companyId);
  const { error: yHata } = await supabase.storage.from(IC_BELGE_BUCKET).upload(yol, p.dosya, { contentType: "application/pdf", upsert: false });
  if (yHata) return { tamam: false, hata: `Sipariş formu yüklenemedi: ${yHata.message}` };
  const { data, error } = await supabase
    .from("ic_is_emirleri")
    .insert({
      ...p.kayit,
      company_id: p.companyId,
      olusturan_email: p.email,
      siparis_formu_yolu: yol,
      siparis_formu_adi: p.dosya.name.slice(0, 255),
    })
    .select("id, is_emri_no");
  const hata = yazmaHatasi(error, data);
  if (hata) {
    await supabase.storage.from(IC_BELGE_BUCKET).remove([yol]);
    return { tamam: false, hata: hataMesaji({ message: hata }) };
  }
  return { tamam: true, isEmriNo: (data as { is_emri_no: string }[])[0]?.is_emri_no || "" };
}
