-- ============================================================================
-- CANLI SEMA SENKRONU (geri yukleme provasi, 05.10.2026)
-- ============================================================================
-- Amac: repodaki migration'lar temiz bir veritabaninda sirayla calistirilinca
-- CANLI ile BIREBIR ayni semayi kurmak (felaket kurtarma / RTO).
--
-- 05.10.2026 provasinda (temiz Postgres 17 + Supabase taklidi, tum
-- migration'lar sirayla) canliyla nesne nesne karsilastirildi; su farklar
-- vardi ve bu dosya hepsini kapatir. Tanimlar canlidan pg_get_functiondef /
-- pg_get_constraintdef / pg_policies ile BIREBIR alinmistir:
--   * denetim_kayitlari tablosu + indeksleri + RLS politikasi + tetikleyici
--     fonksiyonu + 4 tablodaki denetim tetikleyicisi HIC yoktu
--   * kantar_dosya_listesi() (Kantar Paneli bunsuz acilmaz) yoktu
--   * 9 yabanci anahtarda canlidaki ON DELETE CASCADE / SET NULL yoktu
--     (repodan kurulan sistemde dosya/rezervasyon silme HATA verirdi)
--   * ihracat_dosyalari: repoda tek genis politika, canlida rol bazli 4 politika
--   * 6 fonksiyonun govdesi farkliydi
--   * 2 bucket'in dosya turu / boyut siniri eksikti
--
-- CANLIDA ZATEN BU HALDE; canliya uygulanmasi GEREKMEZ. Dosya tamamen
-- idempotenttir (IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS + CREATE),
-- veri silen hicbir komut icermez.
--
-- BILEREK DISARIDA: gece yedegi cron isi (proje URL'si ve anahtari projeye
-- ozel) -> docs/felaket-kurtarma.md adim adim anlatir. depositors /
-- contact_messages BASKA projeye ait, burada yok.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Fonksiyonlar (canlidan birebir)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_dosya_no()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE year_part TEXT; seq_num INTEGER;
BEGIN
  IF NEW.dosya_no IS NULL OR NEW.dosya_no = '' THEN
    year_part := EXTRACT(YEAR FROM NOW())::TEXT;
    seq_num := pg_catalog.nextval('public.ihracat_dosya_sira'::regclass);
    NEW.dosya_no := 'IHR-' || year_part || '-' || LPAD(seq_num::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_auth_company_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN RETURN (SELECT company_id FROM public.kullanici_rolleri WHERE user_id = auth.uid() LIMIT 1); END; $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  yeni_company_id uuid;
begin
  -- 1) Kullanıcıya ait yeni tek-kişilik şirket aç
  insert into public.companies (company_name)
  values (new.email)
  returning id into yeni_company_id;

  -- 2) Kullanıcıyı bu şirkete admin olarak bağla
  insert into public.kullanici_rolleri (user_id, rol, company_id)
  values (new.id, 'admin', yeni_company_id)
  on conflict (user_id) do nothing;

  -- 3) Kullanıcıya varsayılan tam yetki ver (kendi şirketinin admini, her şeye erişir)
  insert into public.kullanici_yetkileri (user_id, email, company_id, sayfa_yetkileri, sekme_yetkileri)
  values (
    new.id,
    new.email,
    yeni_company_id,
    '{"panel":true,"analiz":true,"kantar":true,"ayarlar":true,"dashboard":true,"ihracatlar":true,"yeni_dosya":true,"etd_eta":true}'::jsonb,
    '{"evraklar":true,"proforma":true,"rezervasyon":true,"konteynerler":true}'::jsonb
  )
  on conflict (user_id) do nothing;

  return new;
exception
  when others then
    -- Trigger hatası kayıt akışını ASLA kırmasın; sadece logla, kullanıcı yine oluşsun.
    raise warning 'handle_new_user hata: %', sqlerrm;
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.storage_path_dosya_id(object_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare parcalar text[]; aday text; uuid_regex text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  parcalar := string_to_array(object_name, '/');
  if parcalar is null or array_length(parcalar, 1) < 1 then return null; end if;
  aday := parcalar[1];
  if aday ~ uuid_regex then return aday::uuid; end if;
  if array_length(parcalar, 1) >= 2 then
    aday := parcalar[2];
    if aday ~ uuid_regex then return aday::uuid; end if;
  end if;
  return null;
end; $function$;

CREATE OR REPLACE FUNCTION public.storage_path_ilk_segment_company_id(object_name text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    THEN (split_part(object_name, '/', 1))::uuid
    ELSE NULL
  END;
$function$;

-- Kantar Paneli: sadece kendi sirketinin dosya listesi (RLS'i asan dar okuma)
CREATE OR REPLACE FUNCTION public.kantar_dosya_listesi()
 RETURNS TABLE(id uuid, dosya_no text, durum text, marka text, alici_firma text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, dosya_no, durum, marka, alici_firma
  FROM public.ihracat_dosyalari
  WHERE company_id = public.get_auth_company_id();
$function$;
REVOKE ALL ON FUNCTION public.kantar_dosya_listesi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kantar_dosya_listesi() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Denetim kaydi sistemi (her degisikligin / silinen kaydin eski hali)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.denetim_kayitlari (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tablo_adi text NOT NULL,
  islem text NOT NULL,
  kayit_id uuid,
  eski_veri jsonb,
  yeni_veri jsonb,
  degistiren_kullanici uuid,
  degistiren_email text,
  company_id uuid,
  olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT denetim_kayitlari_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS denetim_kayitlari_company_tarih_idx ON public.denetim_kayitlari USING btree (company_id, olusturma_tarihi DESC);
CREATE INDEX IF NOT EXISTS denetim_kayitlari_tablo_kayit_idx ON public.denetim_kayitlari USING btree (tablo_adi, kayit_id);
ALTER TABLE public.denetim_kayitlari ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Denetim Kayitlari - Okuma (rol bazli)" ON public.denetim_kayitlari;
CREATE POLICY "Denetim Kayitlari - Okuma (rol bazli)" ON public.denetim_kayitlari
  FOR SELECT
  USING (((company_id = get_auth_company_id()) AND ((EXISTS ( SELECT 1
   FROM kullanici_rolleri kr
  WHERE ((kr.user_id = auth.uid()) AND (kr.rol = ANY (ARRAY['admin'::text, 'ihracat'::text, 'muhasebe'::text]))))) OR (lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = ANY (ARRAY['volkandurgut.tr@gmail.com'::text, 'buraktuncay@unex.com.tr'::text])))));

CREATE OR REPLACE FUNCTION public.denetim_tetikleyici()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
BEGIN
  BEGIN
    v_email := lower(COALESCE((auth.jwt() ->> 'email'), ''));
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.denetim_kayitlari
      (tablo_adi, islem, kayit_id, eski_veri, yeni_veri, degistiren_kullanici, degistiren_email, company_id)
    VALUES
      (TG_TABLE_NAME, TG_OP, OLD.id, to_jsonb(OLD), NULL, auth.uid(), v_email, OLD.company_id);
    RETURN OLD;
  ELSE
    INSERT INTO public.denetim_kayitlari
      (tablo_adi, islem, kayit_id, eski_veri, yeni_veri, degistiren_kullanici, degistiren_email, company_id)
    VALUES
      (TG_TABLE_NAME, TG_OP, NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW), auth.uid(), v_email, NEW.company_id);
    RETURN NEW;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Denetim kaydi HICBIR ZAMAN asil islemi engellemez / bozmaz.
  RETURN COALESCE(NEW, OLD);
END;
$function$;
REVOKE ALL ON FUNCTION public.denetim_tetikleyici() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.denetim_tetikleyici() TO service_role;

DROP TRIGGER IF EXISTS denetim_ana_siparisler ON public.ana_siparisler;
CREATE TRIGGER denetim_ana_siparisler AFTER INSERT OR DELETE OR UPDATE ON public.ana_siparisler FOR EACH ROW EXECUTE FUNCTION denetim_tetikleyici();
DROP TRIGGER IF EXISTS denetim_ihracat_dosyalari ON public.ihracat_dosyalari;
CREATE TRIGGER denetim_ihracat_dosyalari AFTER INSERT OR DELETE OR UPDATE ON public.ihracat_dosyalari FOR EACH ROW EXECUTE FUNCTION denetim_tetikleyici();
DROP TRIGGER IF EXISTS denetim_konteynerler ON public.konteynerler;
CREATE TRIGGER denetim_konteynerler AFTER INSERT OR DELETE OR UPDATE ON public.konteynerler FOR EACH ROW EXECUTE FUNCTION denetim_tetikleyici();
DROP TRIGGER IF EXISTS denetim_rezervasyonlar ON public.rezervasyonlar;
CREATE TRIGGER denetim_rezervasyonlar AFTER INSERT OR DELETE OR UPDATE ON public.rezervasyonlar FOR EACH ROW EXECUTE FUNCTION denetim_tetikleyici();

-- ---------------------------------------------------------------------------
-- 3) Yabanci anahtarlar: canlidaki silme davranisi (CASCADE / SET NULL)
-- ---------------------------------------------------------------------------
ALTER TABLE public.acente_teklifleri DROP CONSTRAINT IF EXISTS acente_teklifleri_acente_id_fkey,
  ADD CONSTRAINT acente_teklifleri_acente_id_fkey FOREIGN KEY (acente_id) REFERENCES public.acenteler(id) ON DELETE CASCADE;
ALTER TABLE public.acente_teklifleri DROP CONSTRAINT IF EXISTS acente_teklifleri_dosya_id_fkey,
  ADD CONSTRAINT acente_teklifleri_dosya_id_fkey FOREIGN KEY (dosya_id) REFERENCES public.ihracat_dosyalari(id) ON DELETE CASCADE;
ALTER TABLE public.dosya_evraklari DROP CONSTRAINT IF EXISTS dosya_evraklari_dosya_id_fkey,
  ADD CONSTRAINT dosya_evraklari_dosya_id_fkey FOREIGN KEY (dosya_id) REFERENCES public.ihracat_dosyalari(id) ON DELETE CASCADE;
ALTER TABLE public.konteynerler DROP CONSTRAINT IF EXISTS konteynerler_dosya_id_fkey,
  ADD CONSTRAINT konteynerler_dosya_id_fkey FOREIGN KEY (dosya_id) REFERENCES public.ihracat_dosyalari(id) ON DELETE CASCADE;
ALTER TABLE public.konteynerler DROP CONSTRAINT IF EXISTS konteynerler_rezervasyon_id_fkey,
  ADD CONSTRAINT konteynerler_rezervasyon_id_fkey FOREIGN KEY (rezervasyon_id) REFERENCES public.rezervasyonlar(id) ON DELETE CASCADE;
ALTER TABLE public.konteynerler DROP CONSTRAINT IF EXISTS konteynerler_sevkiyat_id_fkey,
  ADD CONSTRAINT konteynerler_sevkiyat_id_fkey FOREIGN KEY (sevkiyat_id) REFERENCES public.sevkiyatlar(id) ON DELETE SET NULL;
ALTER TABLE public.rezervasyonlar DROP CONSTRAINT IF EXISTS rezervasyonlar_dosya_id_fkey,
  ADD CONSTRAINT rezervasyonlar_dosya_id_fkey FOREIGN KEY (dosya_id) REFERENCES public.ihracat_dosyalari(id) ON DELETE CASCADE;
ALTER TABLE public.rezervasyonlar DROP CONSTRAINT IF EXISTS rezervasyonlar_sevkiyat_id_fkey,
  ADD CONSTRAINT rezervasyonlar_sevkiyat_id_fkey FOREIGN KEY (sevkiyat_id) REFERENCES public.sevkiyatlar(id) ON DELETE SET NULL;
ALTER TABLE public.sevkiyatlar DROP CONSTRAINT IF EXISTS sevkiyatlar_dosya_id_fkey,
  ADD CONSTRAINT sevkiyatlar_dosya_id_fkey FOREIGN KEY (dosya_id) REFERENCES public.ihracat_dosyalari(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 4) ihracat_dosyalari: rol bazli politikalar (canlidaki hal)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Sirket Yonetsin - Ihracat Dosyalari" ON public.ihracat_dosyalari;
DROP POLICY IF EXISTS "Ihracat Dosyalari - Okuma (rol bazli)" ON public.ihracat_dosyalari;
CREATE POLICY "Ihracat Dosyalari - Okuma (rol bazli)" ON public.ihracat_dosyalari
  FOR SELECT
  USING (((company_id = get_auth_company_id()) AND ((EXISTS ( SELECT 1
   FROM kullanici_rolleri kr
  WHERE ((kr.user_id = auth.uid()) AND (kr.rol = ANY (ARRAY['admin'::text, 'ihracat'::text, 'muhasebe'::text]))))) OR (lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = ANY (ARRAY['volkandurgut.tr@gmail.com'::text, 'buraktuncay@unex.com.tr'::text])))));
DROP POLICY IF EXISTS "Ihracat Dosyalari - Ekleme" ON public.ihracat_dosyalari;
CREATE POLICY "Ihracat Dosyalari - Ekleme" ON public.ihracat_dosyalari
  FOR INSERT
  WITH CHECK ((company_id = get_auth_company_id()));
DROP POLICY IF EXISTS "Ihracat Dosyalari - Guncelleme" ON public.ihracat_dosyalari;
CREATE POLICY "Ihracat Dosyalari - Guncelleme" ON public.ihracat_dosyalari
  FOR UPDATE
  USING ((company_id = get_auth_company_id()))
  WITH CHECK ((company_id = get_auth_company_id()));
DROP POLICY IF EXISTS "Ihracat Dosyalari - Silme" ON public.ihracat_dosyalari;
CREATE POLICY "Ihracat Dosyalari - Silme" ON public.ihracat_dosyalari
  FOR DELETE
  USING ((company_id = get_auth_company_id()));

-- ---------------------------------------------------------------------------
-- 5) Depo bucket'lari: canlidaki dosya turu / boyut sinirlari
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('geri-bildirim-ekleri', 'geri-bildirim-ekleri', false, 10485760, ARRAY['image/*', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('konsimento-talimatlari', 'konsimento-talimatlari', false, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
