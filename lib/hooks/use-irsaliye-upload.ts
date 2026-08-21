import { useState, useRef, useCallback } from 'react';
import { supabase, getGuvenliDosyaUrl, depoDosyalariniTopluSil } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type IrsaliyeYukleResult = {
  success: boolean;
  error?: string;
};

type UseIrsaliyeUploadReturn = {
  yukleniyor: Record<string, boolean>;
  hatalar: Record<string, string>;
  yukleIrsaliye: (konteyner: { id: string; dosya_id: string; konteyner_no: string }, file: File) => Promise<IrsaliyeYukleResult>;
  kaldirIrsaliye: (konteynerId: string, irsaliyeDosyaUrl?: string | null) => Promise<void>;
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

    try {
      const timestamp = Date.now();
      const uzanti = file.name.split('.').pop() || 'pdf';
      const path = `irsaliye/${konteyner.dosya_id}/${konteyner.konteyner_no}_${timestamp}.${uzanti}`;
      const { error: uploadError } = await supabase.storage
        .from('konsimento-talimatlari')
        .upload(path, file);
      if (uploadError) throw new Error(`Dosya yüklenemedi: ${uploadError.message}`);

      const dosyaUrl = await getGuvenliDosyaUrl('konsimento-talimatlari', path);

      const { error: updateError } = await supabase
        .from('konteynerler')
        .update({
          irsaliye_dosya_url: dosyaUrl,
          irsaliye_dosya_adi: file.name,
          irsaliye_yukleme_tarihi: new Date().toISOString(),
        })
        .eq('company_id', companyId)
        .eq('id', konteyner.id);
      if (updateError) throw new Error(`İrsaliye kaydedilemedi: ${updateError.message}`);

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Hata oluştu.';
      setHatalar((prev) => ({ ...prev, [konteyner.id]: message }));
      return { success: false, error: message };
    } finally {
      setYukleniyor((prev) => ({ ...prev, [konteyner.id]: false }));
    }
  }, [companyId]);

  const kaldirIrsaliye = useCallback(async (konteynerId: string, irsaliyeDosyaUrl?: string | null) => {
    if (!companyId) return;
    if (irsaliyeDosyaUrl) await depoDosyalariniTopluSil([irsaliyeDosyaUrl]); // storage'daki gercek dosya da temizlenir
    await supabase
      .from('konteynerler')
      .update({
        irsaliye_dosya_url: null,
        irsaliye_dosya_adi: null,
        irsaliye_yukleme_tarihi: null,
      })
      .eq('company_id', companyId)
      .eq('id', konteynerId);
  }, [companyId]);

  return { yukleniyor, hatalar, yukleIrsaliye, kaldirIrsaliye, inputRefs };
}