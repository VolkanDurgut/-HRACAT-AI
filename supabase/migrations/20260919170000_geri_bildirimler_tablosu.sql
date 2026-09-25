-- ============================================================================
-- geri_bildirimler tablosu
--
-- "Sorun Bildir" widget'i artik yapay zeka sohbeti degil, gercek bir form.
-- Kullanicilar sorun/oneri/sikayet bildirebilir, istege bagli olarak bir
-- dosya/ekran goruntusu ekleyebilir. Kayit burada tutulur; e-posta gonderimi
-- "geri-bildirim-gonder" Edge Function'i tarafindan yapilir.
--
-- Guvenlik modeli: fumigation_ayarlari / banka_presetleri ile BIREBIR AYNI -
-- auth_company_id() bazli 4 politika (select/insert/update/delete).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.geri_bildirimler (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  tur text NOT NULL CHECK (tur IN ('sorun', 'oneri', 'sikayet')),
  mesaj text NOT NULL,
  gonderen_adi text,
  gonderen_email text,
  ek_dosya_yolu text,
  ek_dosya_adi text,
  mail_gonderildi boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geri_bildirimler_company_id_idx ON public.geri_bildirimler(company_id);
CREATE INDEX IF NOT EXISTS geri_bildirimler_created_at_idx ON public.geri_bildirimler(created_at DESC);

ALTER TABLE public.geri_bildirimler ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "geri_bildirimler_select" ON public.geri_bildirimler;
CREATE POLICY "geri_bildirimler_select" ON public.geri_bildirimler
  FOR SELECT
  USING (company_id = auth_company_id());

DROP POLICY IF EXISTS "geri_bildirimler_insert" ON public.geri_bildirimler;
CREATE POLICY "geri_bildirimler_insert" ON public.geri_bildirimler
  FOR INSERT
  WITH CHECK (company_id = auth_company_id());

DROP POLICY IF EXISTS "geri_bildirimler_update" ON public.geri_bildirimler;
CREATE POLICY "geri_bildirimler_update" ON public.geri_bildirimler
  FOR UPDATE
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

DROP POLICY IF EXISTS "geri_bildirimler_delete" ON public.geri_bildirimler;
CREATE POLICY "geri_bildirimler_delete" ON public.geri_bildirimler
  FOR DELETE
  USING (company_id = auth_company_id());

-- ============================================================================
-- Depolama (storage): "geri-bildirim-ekleri" private bucket
-- Yol yapisi: {company_id}/{user_id}/{timestamp}_{dosya_adi}
-- (mevcut "dosya_id bazli" storage_path_company_id modelinden farkli olarak,
--  burada dosya bir ihracat dosyasina degil kullaniciya/sirkete bagli oldugu
--  icin path'in ILK segmenti dogrudan company_id olarak kullanilir.)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('geri-bildirim-ekleri', 'geri-bildirim-ekleri', false)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.storage_path_ilk_segment_company_id(object_name text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE
    WHEN object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    THEN (split_part(object_name, '/', 1))::uuid
    ELSE NULL
  END;
$function$;

DROP POLICY IF EXISTS "geri_bildirim_ek_select" ON storage.objects;
CREATE POLICY "geri_bildirim_ek_select" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'geri-bildirim-ekleri'
    AND storage_path_ilk_segment_company_id(name) = auth_company_id()
  );

DROP POLICY IF EXISTS "geri_bildirim_ek_insert" ON storage.objects;
CREATE POLICY "geri_bildirim_ek_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'geri-bildirim-ekleri'
    AND storage_path_ilk_segment_company_id(name) = auth_company_id()
  );

DROP POLICY IF EXISTS "geri_bildirim_ek_delete" ON storage.objects;
CREATE POLICY "geri_bildirim_ek_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'geri-bildirim-ekleri'
    AND storage_path_ilk_segment_company_id(name) = auth_company_id()
  );
