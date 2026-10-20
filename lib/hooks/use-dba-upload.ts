import { useState, useRef, useCallback } from 'react';
import { supabase, getGuvenliDosyaUrl, depoDosyalariniTopluSil, yazmaHatasi } from '@/lib/supabase';
import type { Konteyner, DbaKontrolSonucu } from '@/lib/supabase';
import { useToast } from '@/lib/toast-context';
import { useAuth } from '@/lib/auth-context';

type DbaYukleResult = {
  success: boolean;
  uyusmazliklar: string[];
  error?: string;
  /** Konteynerin DBA'si zaten yuklu (ornegin otomatik); hicbir sey degismedi. */
  zatenYuklu?: boolean;
};

const ZATEN_YUKLU_MESAJI =
  "Bu konteynerin DBA'sı zaten yüklü (kantar bilgisayarından otomatik yüklenmiş). Tekrar yüklemenize gerek yok.";

class ZatenYukluHatasi extends Error {
  constructor() { super(ZATEN_YUKLU_MESAJI); }
}

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
 *
 * MUKERRER YUKLEME YOK (20.10.2026): DBA'lar kantar bilgisayarindan otomatik da
 * yuklendigi icin (dba-otomatik) elle yukleme SADECE DBA'si bos konteynere yapilir:
 * baslamadan once guncel kayit okunur, yazim `dba_dosya_url is null` kosuluyla
 * yapilir. Ekran yenilenmeden once otomatik yuklenmisse elle yukleme durur,
 * yuklenen PDF geri silinir, mevcut DBA'ya dokunulmaz.
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
      // 0. Guncel kayit: DBA bu arada (otomatik) yuklendiyse hic baslama
      const { data: guncel, error: guncelHata } = await supabase
        .from('konteynerler')
        .select('dba_dosya_url')
        .eq('company_id', companyId)
        .eq('id', konteyner.id)
        .maybeSingle();
      if (guncelHata) throw new Error(`Konteyner okunamadı: ${guncelHata.message}`);
      if (!guncel) throw new Error('Konteyner bulunamadı veya bu işlem için yetkiniz yok.');
      if (guncel.dba_dosya_url) throw new ZatenYukluHatasi();

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

      // 6. Veritabanini guncelle (Net, Brut, Kap Adeti DBA'dan etkilenmez - idari personel tarafindan elle girilir)
      // Sadece DBA'si hala bossa yazilir (otomatik yuklemeyle ayni anda olursa ustune yazilmaz).
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
        .is('dba_dosya_url', null)
        .select('id');
      if (!updateError && (!guncellenen || guncellenen.length === 0)) {
        // 0 satir: ya bu arada DBA yuklendi ya da yetki (RLS) yok
        const { data: sonDurum } = await supabase
          .from('konteynerler')
          .select('dba_dosya_url')
          .eq('company_id', companyId)
          .eq('id', konteyner.id)
          .maybeSingle();
        if (sonDurum?.dba_dosya_url) throw new ZatenYukluHatasi();
      }
      // 0 satir guncellendiyse (RLS) de basarili sayilmaz (01.10.2026)
      const guncellemeHatasi = yazmaHatasi(updateError, guncellenen);
      if (guncellemeHatasi) {
        // Ayni DBA belge no baska konteynerde (tekil indeks, 20.10.2026)
        if (/konteynerler_dba_belge_no_tekil|duplicate key/i.test(guncellemeHatasi)) {
          throw new Error('Bu DBA belgesi başka bir konteynere yüklenmiş. Aynı DBA iki konteynere yüklenemez.');
        }
        throw new Error(`DBA bilgileri kaydedilemedi: ${guncellemeHatasi}`);
      }
      yuklenenYol = null; // kayit basarili

      return { success: true, uyusmazliklar: [] };
    } catch (err) {
      if (yuklenenYol) await supabase.storage.from('konsimento-talimatlari').remove([yuklenenYol]);
      if (err instanceof ZatenYukluHatasi) {
        showToast(ZATEN_YUKLU_MESAJI, 'success');
        return { success: false, uyusmazliklar: [], error: ZATEN_YUKLU_MESAJI, zatenYuklu: true };
      }
      const message = err instanceof Error ? err.message : 'Hata oluştu.';
      setHatalar((prev) => ({ ...prev, [konteyner.id]: message }));
      return { success: false, uyusmazliklar: [], error: message };
    } finally {
      setYukleniyor((prev) => ({ ...prev, [konteyner.id]: false }));
    }
  }, [companyId, showToast]);

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
