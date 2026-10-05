import { useState, useRef, useCallback } from 'react';
import { supabase, getGuvenliDosyaUrl, depoDosyalariniTopluSil, eskiDepoDosyasiniSil, yazmaHatasi } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type IrsaliyeYukleResult = {
  success: boolean;
  error?: string;
};

type UseIrsaliyeUploadReturn = {
  yukleniyor: Record<string, boolean>;
  hatalar: Record<string, string>;
  yukleIrsaliye: (konteyner: { id: string; dosya_id: string; konteyner_no: string }, file: File) => Promise<IrsaliyeYukleResult>;
  /** Hata yoksa null, varsa kullaniciya gosterilecek mesaj dondurur. */
  kaldirIrsaliye: (konteynerId: string, irsaliyeDosyaUrl?: string | null) => Promise<string | null>;
  inputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
};

const IZIN_VERILEN_TIPLER = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/**
 * Irsaliye (sevk irsaliyesi) belgesi yukleme/kaldirma islemlerini yoneten hook.
 * Konteynerler sekmesinde (beyaz yaka / ofis) kullanilir; yuklenen belge
 * Kantar panelinde kantar personeline gorunur.
 *
 * DBA akisinin TERSI yonunde calisir: DBA'da kantar yukler, ofis gorur.
 * Irsaliye'de ofis yukler, kantar gorur. Bu yuzden DBA'nin aksine burada
 * Gemini AI dogrulamasi / Edge Function cagrisi YOK — sadece arsivleme var.
 */
export function useIrsaliyeUpload(): UseIrsaliyeUploadReturn {
  const [yukleniyor, setYukleniyor] = useState<Record<string, boolean>>({});
  const [hatalar, setHatalar] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const { companyId } = useAuth();

  const yukleIrsaliye = useCallback(async (
    konteyner: { id: string; dosya_id: string; konteyner_no: string },
    file: File
  ): Promise<IrsaliyeYukleResult> => {
    if (!IZIN_VERILEN_TIPLER.includes(file.type)) {
      const msg = 'Lütfen PDF, JPG, PNG veya WEBP formatında bir dosya yükleyin.';
      setHatalar((prev) => ({ ...prev, [konteyner.id]: msg }));
      return { success: false, error: msg };
    }

    setYukleniyor((prev) => ({ ...prev, [konteyner.id]: true }));
    setHatalar((prev) => ({ ...prev, [konteyner.id]: '' }));

    let yuklenenYol: string | null = null; // kayda baglanamazsa depodan geri silinir
    try {
      const timestamp = Date.now();
      const uzanti = file.name.split('.').pop() || 'pdf';
      const path = `irsaliye/${konteyner.dosya_id}/${konteyner.konteyner_no}_${timestamp}.${uzanti}`;
      const { error: uploadError } = await supabase.storage
        .from('konsimento-talimatlari')
        .upload(path, file);
      if (uploadError) throw new Error(`Dosya yüklenemedi: ${uploadError.message}`);
      yuklenenYol = path;

      const dosyaUrl = await getGuvenliDosyaUrl('konsimento-talimatlari', path);

      // Yeniden yuklemede eski irsaliyenin adresi (kayit basariyla guncellenince
      // depodan silinir, 05.10.2026). Okunamazsa hicbir sey silinmez.
      const { data: onceki } = await supabase
        .from('konteynerler')
        .select('irsaliye_dosya_url')
        .eq('company_id', companyId)
        .eq('id', konteyner.id)
        .maybeSingle();

      const { data: guncellenen, error: updateError } = await supabase
        .from('konteynerler')
        .update({
          irsaliye_dosya_url: dosyaUrl,
          irsaliye_dosya_adi: file.name,
          irsaliye_yukleme_tarihi: new Date().toISOString(),
        })
        .eq('company_id', companyId)
        .eq('id', konteyner.id)
        .select('id');
      // 0 satir guncellendiyse (RLS) de basarili sayilmaz (01.10.2026)
      const guncellemeHatasi = yazmaHatasi(updateError, guncellenen);
      if (guncellemeHatasi) throw new Error(`İrsaliye kaydedilemedi: ${guncellemeHatasi}`);
      yuklenenYol = null; // kayit basarili
      await eskiDepoDosyasiniSil(onceki?.irsaliye_dosya_url, dosyaUrl);

      return { success: true };
    } catch (err) {
      if (yuklenenYol) await supabase.storage.from('konsimento-talimatlari').remove([yuklenenYol]);
      const message = err instanceof Error ? err.message : 'Hata oluştu.';
      setHatalar((prev) => ({ ...prev, [konteyner.id]: message }));
      return { success: false, error: message };
    } finally {
      setYukleniyor((prev) => ({ ...prev, [konteyner.id]: false }));
    }
  }, [companyId]);

  /** Donus: hata yoksa null, varsa kullaniciya gosterilecek mesaj. */
  const kaldirIrsaliye = useCallback(async (konteynerId: string, irsaliyeDosyaUrl?: string | null): Promise<string | null> => {
    if (!companyId) return 'Şirket bilgisi bulunamadı.';
    // SIRA ONEMLI (01.10.2026): once kayit guncellenir, PDF ancak bu
    // BASARILI olursa storage'dan silinir.
    const { data, error } = await supabase
      .from('konteynerler')
      .update({
        irsaliye_dosya_url: null,
        irsaliye_dosya_adi: null,
        irsaliye_yukleme_tarihi: null,
      })
      .eq('company_id', companyId)
      .eq('id', konteynerId)
      .select('id');
    const hata = yazmaHatasi(error, data);
    if (hata) return hata;
    if (irsaliyeDosyaUrl) await depoDosyalariniTopluSil([irsaliyeDosyaUrl]); // storage'daki gercek dosya da temizlenir
    return null;
  }, [companyId]);

  return { yukleniyor, hatalar, yukleIrsaliye, kaldirIrsaliye, inputRefs };
}