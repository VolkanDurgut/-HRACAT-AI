import { useState, useRef, useCallback } from 'react';
import { supabase, getGuvenliDosyaUrl, depoDosyalariniTopluSil, eskiDepoDosyasiniSil, yazmaHatasi } from '@/lib/supabase';
import type { Konteyner, DbaKontrolSonucu } from '@/lib/supabase';
import { useToast } from '@/lib/toast-context';
import { useAuth } from '@/lib/auth-context';

type DbaYukleResult = {
  success: boolean;
  uyusmazliklar: string[];
  error?: string;
};

type UseDbaUploadReturn = {
  yukleniyor: Record<string, boolean>;
  hatalar: Record<string, string>;
  yukleDba: (konteyner: { id: string; dosya_id: string; konteyner_no: string }, file: File) => Promise<DbaYukleResult>;
  kaldirDba: (konteynerId: string, dbaDosyaUrl?: string | null) => Promise<void>;
  inputRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>;
};

/**
 * DBA (Dogrulanmis Brut Agirlik) belgesi yukleme islemlerini yoneten ortak hook.
 * Hem Konteynerler sekmesinde hem de Kantar panelinde kullanilir.
 *
 * Yapilan islemler:
 * 1. PDF'i Supabase Storage'a yukler
 * 2. Auth token alir, dba-oku Edge Function'ina gonderir
 * 3. Gemini AI ile belgeden veri cikarir (konteyner no, plaka, dara, net, VGM)
 * 4. Ayni DBA belgesinin baska bir konteynere yuklenip yuklenmedigini kontrol eder
 * 5. Konteyner no uyusmazligi kontrol eder
 * 6. Sonuclari konteynerler tablosuna kaydeder
 */
export function useDbaUpload(): UseDbaUploadReturn {
  const [yukleniyor, setYukleniyor] = useState<Record<string, boolean>>({});
  const [hatalar, setHatalar] = useState<Record<string, string>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const { showToast } = useToast();
  const { companyId } = useAuth(); // Şirket ID'si context'ten çekildi

  const yukleDba = useCallback(async (
    konteyner: { id: string; dosya_id: string; konteyner_no: string },
    file: File
  ): Promise<DbaYukleResult> => {
    if (file.type !== 'application/pdf') {
      const msg = 'Lütfen PDF formatında bir dosya yükleyin.';
      setHatalar((prev) => ({ ...prev, [konteyner.id]: msg }));
      return { success: false, uyusmazliklar: [], error: msg };
    }

    setYukleniyor((prev) => ({ ...prev, [konteyner.id]: true }));
    setHatalar((prev) => ({ ...prev, [konteyner.id]: '' }));

    let yuklenenYol: string | null = null; // kayda baglanamazsa depodan geri silinir
    try {
      // 1. Storage'a yukle
      const timestamp = Date.now();
      const path = `dba/${konteyner.dosya_id}/${konteyner.konteyner_no}_${timestamp}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('konsimento-talimatlari')
        .upload(path, file);
      if (uploadError) throw new Error(`Dosya yüklenemedi: ${uploadError.message}`);
      yuklenenYol = path;

      const dosyaUrl = await getGuvenliDosyaUrl('konsimento-talimatlari', path);

      // 2. Auth token al
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Oturum bulunamadı. Lütfen yeniden giriş yapın.');

      // 3. Edge Function ile DBA oku
      const formData = new FormData();
      formData.append('file', file);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/dba-oku`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const dbaData: DbaKontrolSonucu = await response.json();
      if (!response.ok) throw new Error((dbaData as any).error || 'DBA okunamadı.');

      // 4. Ayni DBA belgesi daha once yuklendi mi kontrol et
      if (dbaData.dba_belge_no && companyId) {
        const { data: mevcutDba } = await supabase
          .from('konteynerler')
          .select('id, konteyner_no')
          .eq('company_id', companyId)
          .eq('dba_belge_no', dbaData.dba_belge_no)
          .neq('id', konteyner.id)
          .maybeSingle();
        if (mevcutDba) {
          throw new Error(
            `Bu DBA belgesi daha önce "${mevcutDba.konteyner_no}" konteynerine yüklenmiş. Aynı DBA iki konteynere yüklenemez.`
          );
        }
      }

      // 5. Konteyner no kontrolu - eslesmiyorsa yukleme tamamen reddedilir
      const dbaKontNo = (dbaData.konteyner_no || '').replace(/\s/g, '').toUpperCase();
      if (!dbaKontNo) {
        throw new Error('DBA belgesinden konteyner numarası okunamadı. Lütfen doğru belgeyi yüklediğinizden emin olun.');
      }
      if (dbaKontNo !== konteyner.konteyner_no.toUpperCase()) {
        throw new Error(
          `Bu DBA belgesi "${dbaData.konteyner_no}" konteynerine ait, "${konteyner.konteyner_no}" konteynerine yüklenemez. Lütfen doğru DBA belgesini seçin.`
        );
      }

      // 6a. Yeniden yuklemede eski DBA'nin adresi (kayit basariyla guncellenince
      // depodan silinir - sahipsiz PDF kalmasin, 05.10.2026). Taze okunur;
      // okunamazsa hicbir sey silinmez.
      const { data: onceki } = await supabase
        .from('konteynerler')
        .select('dba_dosya_url')
        .eq('company_id', companyId)
        .eq('id', konteyner.id)
        .maybeSingle();

      // 6. Veritabanini guncelle (Net, Brut, Kap Adeti DBA'dan etkilenmez - idari personel tarafindan elle girilir)
      const { data: guncellenen, error: updateError } = await supabase
        .from('konteynerler')
        .update({
          plaka: dbaData.arac_plaka || null,
          tare_kg: dbaData.konteyner_dara_kg || null,
          vgm_kg: dbaData.dogrulanmis_brut_agirlik_kg || null,
          dba_dosya_url: dosyaUrl,
          dba_dosya_adi: file.name,
          dba_yukleme_tarihi: new Date().toISOString(),
          dba_belge_no: dbaData.dba_belge_no || null,
          dba_kontrol_sonucu: { ...dbaData, uyusmazliklar: [] },
        })
        .eq('company_id', companyId)
        .eq('id', konteyner.id)
        .select('id');
      // 0 satir guncellendiyse (RLS) de basarili sayilmaz (01.10.2026)
      const guncellemeHatasi = yazmaHatasi(updateError, guncellenen);
      if (guncellemeHatasi) throw new Error(`DBA bilgileri kaydedilemedi: ${guncellemeHatasi}`);
      yuklenenYol = null; // kayit basarili
      await eskiDepoDosyasiniSil(onceki?.dba_dosya_url, dosyaUrl);

      return { success: true, uyusmazliklar: [] };
    } catch (err) {
      if (yuklenenYol) await supabase.storage.from('konsimento-talimatlari').remove([yuklenenYol]);
      const message = err instanceof Error ? err.message : 'Hata oluştu.';
      setHatalar((prev) => ({ ...prev, [konteyner.id]: message }));
      return { success: false, uyusmazliklar: [], error: message };
    } finally {
      setYukleniyor((prev) => ({ ...prev, [konteyner.id]: false }));
    }
  }, [companyId]);

  const kaldirDba = useCallback(async (konteynerId: string, dbaDosyaUrl?: string | null) => {
    if (!companyId) return;
    // SIRA ONEMLI (01.10.2026): once kayit guncellenir, PDF ancak bu
    // BASARILI olursa storage'dan silinir.
    const { data, error } = await supabase
      .from('konteynerler')
      .update({
        plaka: null,
        tare_kg: null,
        vgm_kg: null,
        dba_dosya_url: null,
        dba_dosya_adi: null,
        dba_yukleme_tarihi: null,
        dba_belge_no: null,
        dba_kontrol_sonucu: null,
      })
      .eq('company_id', companyId)
      .eq('id', konteynerId)
      .select('id');
    const hata = yazmaHatasi(error, data);
    if (hata) {
      showToast(`DBA kaldırılamadı: ${hata}`, 'error');
      return;
    }
    if (dbaDosyaUrl) await depoDosyalariniTopluSil([dbaDosyaUrl]); // storage'daki gercek dosya da temizlenir
  }, [showToast, companyId]);

  return { yukleniyor, hatalar, yukleDba, kaldirDba, inputRefs };
}
