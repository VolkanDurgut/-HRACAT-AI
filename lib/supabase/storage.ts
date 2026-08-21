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

/** İmzalı/public bir Supabase Storage URL'sinden bucket + path bilgisini çıkarır. */
function depoYoluCikar(url: string | null | undefined): { bucket: string; path: string } | null {
  if (!url) return null;
  const eslesme = url.match(/\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/([^?]+)/);
  if (!eslesme) return null;
  try {
    return { bucket: eslesme[1], path: decodeURIComponent(eslesme[2]) };
  } catch {
    return null;
  }
}

/**
 * Birden fazla dosya URL'sini bucket'lara göre gruplayıp storage'dan siler.
 * Best-effort: bir dosya silinemezse (ör. zaten yoksa) sessizce loglar,
 * çağıran işlemi (ör. veritabanı kaydı silme) DURDURMAZ — çünkü storage
 * temizliği ikincil bir işlemdir, ana işlemi bu yüzden başarısız kılmamalı.
 */
export async function depoDosyalariniTopluSil(urls: (string | null | undefined)[]): Promise<void> {
  const gruplar = new Map<string, string[]>();
  for (const url of urls) {
    const bilgi = depoYoluCikar(url);
    if (!bilgi) continue;
    const liste = gruplar.get(bilgi.bucket) || [];
    liste.push(bilgi.path);
    gruplar.set(bilgi.bucket, liste);
  }
  await Promise.all(
    Array.from(gruplar.entries()).map(async ([bucket, paths]) => {
      const { error } = await supabase.storage.from(bucket).remove(paths);
      if (error) console.error('Depo dosyaları silinemedi:', bucket, paths, error.message);
    })
  );
}

/**
 * Bir ihracat dosyası silinmeden ÖNCE çağrılır: o dosyaya ve bağlı
 * konteynerlere/evraklara ait TÜM storage dosyalarını toplayıp siler.
 * Veritabanı satırlarının silinmesi ayrıdır (CASCADE zaten hallediyor) —
 * bu fonksiyon sadece gerçek dosyaların (PDF/resim) storage'da yetim
 * kalmasını engeller.
 */
export async function dosyaninStorageDosyalariniSil(dosyaId: string, companyId: string): Promise<void> {
  const [{ data: dosya }, { data: evraklar }, { data: konteynerler }] = await Promise.all([
    supabase.from('ihracat_dosyalari').select('fatura_dosya_url, konsimento_dosya_url, draft_bl_dosya_url').eq('id', dosyaId).eq('company_id', companyId).maybeSingle(),
    supabase.from('dosya_evraklari').select('dosya_url').eq('dosya_id', dosyaId).eq('company_id', companyId),
    supabase.from('konteynerler').select('dba_dosya_url, irsaliye_dosya_url').eq('dosya_id', dosyaId).eq('company_id', companyId),
  ]);

  const urls: (string | null | undefined)[] = [
    (dosya as any)?.fatura_dosya_url,
    (dosya as any)?.konsimento_dosya_url,
    (dosya as any)?.draft_bl_dosya_url,
    ...((evraklar as any[]) || []).map((e) => e.dosya_url),
    ...((konteynerler as any[]) || []).map((k) => k.dba_dosya_url),
    ...((konteynerler as any[]) || []).map((k) => k.irsaliye_dosya_url),
  ];

  await depoDosyalariniTopluSil(urls);
}