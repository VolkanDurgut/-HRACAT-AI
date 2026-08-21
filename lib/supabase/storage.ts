import { supabase } from './client';

// Bucket'lar artik private; herkese acik getPublicUrl() yerine sirket bazli
// RLS kontrolunden gecen imzali (signed) URL uretiyoruz. Bu URL'ler kalici
// olarak DB'ye yazildigi icin (fatura_dosya_url, konsimento_dosya_url vb.)
// uzun gecerlilik suresi kullaniyoruz.
const IMZALI_URL_GECERLILIK_SANIYE = 60 * 60 * 24 * 365 * 10; // ~10 yil

/**
 * Verilen bucket + path icin imzali URL uretir.
 * RLS politikasi geregi sadece dosyanin ait oldugu sirketin kullanicisi
 * bu URL'i basariyla uretebilir; baskasi denerse hata doner.
 */
export async function getGuvenliDosyaUrl(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, IMZALI_URL_GECERLILIK_SANIYE);

  if (error || !data?.signedUrl) {
    throw new Error(`Dosya URL'si oluşturulamadı: ${error?.message || 'bilinmeyen hata'}`);
  }
  return data.signedUrl;
}