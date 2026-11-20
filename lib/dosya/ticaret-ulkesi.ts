/**
 * 20.11.2026 (kullanici: "ticaret yapilan ulke bilgisini manuel olarak da revize edebilmeliyiz"):
 * ihracat_dosyalari.ticaret_ulkesi elle yazilir; null = alici adresinden bulunur (lib/ulke-bul dosyaTicaretUlkesi).
 * Birlesik faturada gruptaki butun dosyalara ayni deger yazilir. Sorun metni ya da null.
 */
import { supabase } from "@/lib/supabase";

export async function ticaretUlkesiKaydet(companyId: string, ids: string[], deger: string | null): Promise<string | null> {
  const v = (deger || "").replace(/\s+/g, " ").trim();
  if (v && (v.length < 2 || v.length > 60)) return "Ülke adı 2-60 karakter olmalı.";
  const { data, error } = await supabase.from("ihracat_dosyalari").update({ ticaret_ulkesi: v ? v.toLocaleUpperCase("tr-TR") : null })
    .in("id", ids).eq("company_id", companyId).select("id");
  if (error) return error.message;
  return (data || []).length === ids.length ? null : `yalnız ${(data || []).length}/${ids.length} dosyaya yazılabildi`;
}
