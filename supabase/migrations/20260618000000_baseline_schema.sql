-- ============================================================================
-- BASELINE MIGRATION — İHRACAT AI  (Multi-Tenant SaaS)
-- ============================================================================
-- Bu dosya, CANLI Supabase veritabaninin (proje ref: tnzbihsfbhqzkcliicdk)
-- guncel/gercek halini birebir yansitir. Onceki baseline dosyasi multi-tenant
-- ONCESI bir tasarimi gosteriyordu (RLS "USING (true)", company_id kolonlari yok,
-- companies / ai_usage_logs / ana_siparisler / dosya_evraklari / fumigation_ayarlari /
-- plakalar / kullanici_rolleri / kullanici_yetkileri tablolari eksik) ve gercekle
-- ciddi sekilde ayrilmisti. Bu dosya o ayrisimi kapatir.
--
-- ----------------------------------------------------------------------------
-- !!! COK ONEMLI — CALISTIRMA POLITIKASI !!!
-- ----------------------------------------------------------------------------
-- * Bu dosya CANLI veritabaninda calistirilmak icin DEGILDIR. Canli zaten bu
--   yapiya sahip; amac repo ile canliyi HIZALAMAKTIR (kayit/referans).
-- * Dosya bilinerek TAMAMEN IDEMPOTENT yazilmistir:
--     - CREATE TABLE IF NOT EXISTS       (mevcut tabloya dokunmaz)
--     - DROP POLICY IF EXISTS + CREATE POLICY  (politikayi guvenle yeniden kurar)
--     - CREATE INDEX IF NOT EXISTS
--     - CREATE OR REPLACE FUNCTION
--     - DROP TRIGGER IF EXISTS + CREATE TRIGGER
--   Icinde DROP TABLE / TRUNCATE / DELETE gibi VERI SILEN hicbir komut YOKTUR.
--   Dolayisiyla yanlislikla dolu bir DB'de calissa bile veri KAYBETTIRMEZ.
-- * Bos bir ortamda (yeni kurulum) calistirilirsa: canlinin birebir kopyasini
--   kurar. auth.users uzerindeki on_auth_user_created TRIGGER'i de dahil
--   (17 Tem 2026'da eklendi; oncesinde eksikti — detay asagida).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1) TEMEL TABLO: companies  (multi-tenant kok tablosu)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  subscription_status TEXT DEFAULT 'incomplete',
  iyzico_subscription_reference TEXT,
  trial_ends_at TIMESTAMPTZ,
  billing_info JSONB,
  ai_document_limit INTEGER NOT NULL DEFAULT 50,
  ai_usage_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT companies_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- 2) ihracat_dosyalari  (ana operasyon tablosu)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ihracat_dosyalari (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  dosya_no TEXT NOT NULL UNIQUE,
  durum TEXT DEFAULT 'Açık',
  olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  satici_firma TEXT,
  alici_firma TEXT,
  urun_tanimi TEXT,
  toplam_tutar NUMERIC,
  para_birimi TEXT,
  proforma_no TEXT,
  proforma_tarihi DATE,
  yuklenme_limani TEXT,
  varis_limani TEXT,
  teslim_sekli TEXT,
  odeme_sekli TEXT,
  ham_veri JSONB,
  gecerlilik_tarihi DATE,
  miktar TEXT,
  miktar_birimi TEXT,
  ambalaj TEXT,
  lot_no TEXT,
  sevkiyat_evraklari JSONB,
  urun_detaylari JSONB,
  toplam_konteyner INTEGER,
  created_by UUID DEFAULT auth.uid(),
  marka TEXT,
  beyanname_no TEXT,
  fatura_no TEXT,
  fatura_tarihi DATE,
  bl_no TEXT,
  diib_no TEXT,
  diib_tarihi DATE,
  uretim_tarihi DATE,
  son_kullanim_tarihi DATE,
  navlun_tutari NUMERIC,
  fatura_talimati_gonderildi BOOLEAN DEFAULT FALSE,
  konsimento_dosya_url TEXT,
  konsimento_dosya_adi TEXT,
  konsimento_yukleme_tarihi TIMESTAMPTZ,
  konsimento_kontrol_sonucu JSONB,
  vgm_gonderildi BOOLEAN DEFAULT FALSE,
  ana_siparis_id UUID,
  fatura_dosya_url TEXT,
  fatura_dosya_adi TEXT,
  fatura_yukleme_tarihi TIMESTAMPTZ,
  fatura_kontrol_sonucu JSONB,
  consignee TEXT,
  alici_adresi TEXT,
  detayli_ambalaj TEXT,
  hesap_adi TEXT,
  banka TEXT,
  swift TEXT,
  iban TEXT,
  hesap_numarasi TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ,
  fatura_talimati_metni TEXT,
  lokal_masraf_tutari NUMERIC,
  company_id UUID,
  CONSTRAINT ihracat_dosyalari_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- 3) ana_siparisler
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ana_siparisler (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  proforma_no TEXT NOT NULL UNIQUE,
  alici_firma TEXT,
  urun_tanimi TEXT,
  toplam_mts NUMERIC,
  para_birimi TEXT DEFAULT 'USD',
  birim_fiyat NUMERIC,
  olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID DEFAULT auth.uid(),
  urun_detaylari_master JSONB,
  company_id UUID,
  CONSTRAINT ana_siparisler_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- 4) sevkiyatlar
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sevkiyatlar (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  dosya_id UUID,
  sevkiyat_no TEXT NOT NULL,
  konteyner_adedi INTEGER NOT NULL DEFAULT 1,
  durum TEXT DEFAULT 'planlandı',
  notlar TEXT,
  olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID DEFAULT auth.uid(),
  company_id UUID,
  CONSTRAINT sevkiyatlar_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- 5) rezervasyonlar
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rezervasyonlar (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  dosya_id UUID NOT NULL,
  booking_no TEXT,
  gemi_kalkis_tarihi DATE,
  talimat_cutoff TIMESTAMPTZ,
  beyanname_cutoff TIMESTAMPTZ,
  ardiyesiz_giris DATE,
  ekipman_alim_yeri TEXT,
  ekipman_alim_tarihi DATE,
  olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  yuklenme_limani TEXT,
  sevkiyat_id UUID,
  konteyner_adedi INTEGER DEFAULT 1,
  net_agirlik NUMERIC,
  brut_agirlik NUMERIC,
  created_by UUID DEFAULT auth.uid(),
  gemi_adi TEXT,
  acente_ismi TEXT,
  sefer_no TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ,
  eta DATE,
  eta_guncelleme_tarihi TIMESTAMPTZ,
  company_id UUID,
  CONSTRAINT rezervasyonlar_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- 6) konteynerler
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.konteynerler (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  dosya_id UUID NOT NULL,
  rezervasyon_id UUID,
  konteyner_no TEXT NOT NULL,
  muhur_no TEXT,
  tip TEXT,
  olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  sevkiyat_id UUID,
  urun_adi TEXT,
  miktar_mts NUMERIC,
  created_by UUID DEFAULT auth.uid(),
  plaka TEXT,
  tare_kg NUMERIC,
  net_agirlik_kg NUMERIC,
  vgm_kg NUMERIC,
  dba_dosya_url TEXT,
  dba_dosya_adi TEXT,
  dba_yukleme_tarihi TIMESTAMPTZ,
  dba_kontrol_sonucu JSONB,
  dba_belge_no TEXT,
  pieces INTEGER,
  brut_agirlik_kg NUMERIC,
  updated_by UUID,
  updated_at TIMESTAMPTZ,
  company_id UUID,
  CONSTRAINT konteynerler_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- 7) acenteler
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.acenteler (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  isim TEXT NOT NULL,
  email TEXT NOT NULL,
  telefon TEXT,
  notlar TEXT,
  created_by UUID DEFAULT auth.uid(),
  olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  cc_emails TEXT,
  company_id UUID,
  CONSTRAINT acenteler_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- 8) acente_teklifleri
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.acente_teklifleri (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  dosya_id UUID NOT NULL,
  acente_id UUID NOT NULL,
  mail_metni TEXT,
  mail_konusu TEXT,
  son_gonderim_tarihi TIMESTAMPTZ,
  teklif_fiyat TEXT,
  teklif_gecerlilik TEXT,
  teklif_notu TEXT,
  teklif_tarihi TIMESTAMPTZ,
  olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID DEFAULT auth.uid(),
  company_id UUID,
  CONSTRAINT acente_teklifleri_pkey PRIMARY KEY (id),
  CONSTRAINT acente_teklifleri_dosya_id_acente_id_key UNIQUE (dosya_id, acente_id)
);

-- ============================================================================
-- 9) plakalar
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.plakalar (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  plaka TEXT NOT NULL UNIQUE,
  created_by UUID DEFAULT auth.uid(),
  olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  company_id UUID,
  CONSTRAINT plakalar_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- 10) dosya_evraklari
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.dosya_evraklari (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  dosya_id UUID NOT NULL,
  evrak_tipi TEXT NOT NULL,
  dosya_url TEXT NOT NULL,
  dosya_adi TEXT,
  yukleme_tarihi TIMESTAMPTZ DEFAULT NOW(),
  kontrol_sonucu JSONB,
  created_by UUID DEFAULT auth.uid(),
  company_id UUID,
  CONSTRAINT dosya_evraklari_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- 11) fumigation_ayarlari
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fumigation_ayarlari (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  alici_firma TEXT,
  fumigant TEXT,
  fumigasyon_dozu TEXT,
  sicaklik TEXT,
  baslangic_saati TEXT,
  bitis_saati TEXT,
  min_exp_period TEXT,
  aeration_period TEXT,
  created_by UUID DEFAULT auth.uid(),
  updated_at TIMESTAMP WITHOUT TIME ZONE,
  company_id UUID,
  CONSTRAINT fumigation_ayarlari_pkey PRIMARY KEY (id),
  CONSTRAINT fumigation_ayarlari_company_alici_uk UNIQUE (company_id, alici_firma)
);

-- ============================================================================
-- 12) kullanici_rolleri  (user-bazli; company_id iceriyor)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.kullanici_rolleri (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() UNIQUE,
  rol TEXT NOT NULL CHECK (rol = ANY (ARRAY['admin'::text, 'ihracat'::text, 'sevkiyat'::text, 'muhasebe'::text, 'kantar'::text, 'uretim'::text])),
  olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  company_id UUID,
  CONSTRAINT kullanici_rolleri_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- 13) kullanici_yetkileri  (user-bazli; company_id iceriyor)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.kullanici_yetkileri (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() UNIQUE,
  sayfa_yetkileri JSONB NOT NULL DEFAULT '{"panel": true, "analiz": true, "kantar": true, "ayarlar": false, "dashboard": true, "ihracatlar": true, "yeni_dosya": true}'::jsonb,
  sekme_yetkileri JSONB NOT NULL DEFAULT '{"evraklar": true, "proforma": true, "rezervasyon": true, "konteynerler": true}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT,
  company_id UUID,
  CONSTRAINT kullanici_yetkileri_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- 14) ai_usage_logs  (AI kota/maliyet loglari)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  user_id UUID,
  fonksiyon TEXT NOT NULL,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- FOREIGN KEY'LER  (idempotent — sadece yoksa eklenir)
-- Not: "ADD CONSTRAINT IF NOT EXISTS" Postgres'te yok; pg_constraint kontrolu
-- ile guvenli sekilde ekliyoruz.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ihracat_dosyalari_company_id_fkey') THEN
    ALTER TABLE public.ihracat_dosyalari ADD CONSTRAINT ihracat_dosyalari_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ihracat_dosyalari_ana_siparis_id_fkey') THEN
    ALTER TABLE public.ihracat_dosyalari ADD CONSTRAINT ihracat_dosyalari_ana_siparis_id_fkey FOREIGN KEY (ana_siparis_id) REFERENCES public.ana_siparisler(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ihracat_dosyalari_created_by_fkey') THEN
    ALTER TABLE public.ihracat_dosyalari ADD CONSTRAINT ihracat_dosyalari_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ihracat_dosyalari_updated_by_fkey') THEN
    ALTER TABLE public.ihracat_dosyalari ADD CONSTRAINT ihracat_dosyalari_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ana_siparisler_company_id_fkey') THEN
    ALTER TABLE public.ana_siparisler ADD CONSTRAINT ana_siparisler_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ana_siparisler_created_by_fkey') THEN
    ALTER TABLE public.ana_siparisler ADD CONSTRAINT ana_siparisler_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sevkiyatlar_company_id_fkey') THEN
    ALTER TABLE public.sevkiyatlar ADD CONSTRAINT sevkiyatlar_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sevkiyatlar_dosya_id_fkey') THEN
    ALTER TABLE public.sevkiyatlar ADD CONSTRAINT sevkiyatlar_dosya_id_fkey FOREIGN KEY (dosya_id) REFERENCES public.ihracat_dosyalari(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sevkiyatlar_created_by_fkey') THEN
    ALTER TABLE public.sevkiyatlar ADD CONSTRAINT sevkiyatlar_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rezervasyonlar_company_id_fkey') THEN
    ALTER TABLE public.rezervasyonlar ADD CONSTRAINT rezervasyonlar_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rezervasyonlar_dosya_id_fkey') THEN
    ALTER TABLE public.rezervasyonlar ADD CONSTRAINT rezervasyonlar_dosya_id_fkey FOREIGN KEY (dosya_id) REFERENCES public.ihracat_dosyalari(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rezervasyonlar_sevkiyat_id_fkey') THEN
    ALTER TABLE public.rezervasyonlar ADD CONSTRAINT rezervasyonlar_sevkiyat_id_fkey FOREIGN KEY (sevkiyat_id) REFERENCES public.sevkiyatlar(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rezervasyonlar_created_by_fkey') THEN
    ALTER TABLE public.rezervasyonlar ADD CONSTRAINT rezervasyonlar_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rezervasyonlar_updated_by_fkey') THEN
    ALTER TABLE public.rezervasyonlar ADD CONSTRAINT rezervasyonlar_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'konteynerler_company_id_fkey') THEN
    ALTER TABLE public.konteynerler ADD CONSTRAINT konteynerler_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'konteynerler_dosya_id_fkey') THEN
    ALTER TABLE public.konteynerler ADD CONSTRAINT konteynerler_dosya_id_fkey FOREIGN KEY (dosya_id) REFERENCES public.ihracat_dosyalari(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'konteynerler_rezervasyon_id_fkey') THEN
    ALTER TABLE public.konteynerler ADD CONSTRAINT konteynerler_rezervasyon_id_fkey FOREIGN KEY (rezervasyon_id) REFERENCES public.rezervasyonlar(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'konteynerler_sevkiyat_id_fkey') THEN
    ALTER TABLE public.konteynerler ADD CONSTRAINT konteynerler_sevkiyat_id_fkey FOREIGN KEY (sevkiyat_id) REFERENCES public.sevkiyatlar(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'konteynerler_created_by_fkey') THEN
    ALTER TABLE public.konteynerler ADD CONSTRAINT konteynerler_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'konteynerler_updated_by_fkey') THEN
    ALTER TABLE public.konteynerler ADD CONSTRAINT konteynerler_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acenteler_company_id_fkey') THEN
    ALTER TABLE public.acenteler ADD CONSTRAINT acenteler_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acenteler_created_by_fkey') THEN
    ALTER TABLE public.acenteler ADD CONSTRAINT acenteler_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acente_teklifleri_company_id_fkey') THEN
    ALTER TABLE public.acente_teklifleri ADD CONSTRAINT acente_teklifleri_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acente_teklifleri_dosya_id_fkey') THEN
    ALTER TABLE public.acente_teklifleri ADD CONSTRAINT acente_teklifleri_dosya_id_fkey FOREIGN KEY (dosya_id) REFERENCES public.ihracat_dosyalari(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acente_teklifleri_acente_id_fkey') THEN
    ALTER TABLE public.acente_teklifleri ADD CONSTRAINT acente_teklifleri_acente_id_fkey FOREIGN KEY (acente_id) REFERENCES public.acenteler(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acente_teklifleri_created_by_fkey') THEN
    ALTER TABLE public.acente_teklifleri ADD CONSTRAINT acente_teklifleri_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plakalar_company_id_fkey') THEN
    ALTER TABLE public.plakalar ADD CONSTRAINT plakalar_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plakalar_created_by_fkey') THEN
    ALTER TABLE public.plakalar ADD CONSTRAINT plakalar_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dosya_evraklari_company_id_fkey') THEN
    ALTER TABLE public.dosya_evraklari ADD CONSTRAINT dosya_evraklari_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dosya_evraklari_dosya_id_fkey') THEN
    ALTER TABLE public.dosya_evraklari ADD CONSTRAINT dosya_evraklari_dosya_id_fkey FOREIGN KEY (dosya_id) REFERENCES public.ihracat_dosyalari(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dosya_evraklari_created_by_fkey') THEN
    ALTER TABLE public.dosya_evraklari ADD CONSTRAINT dosya_evraklari_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fumigation_ayarlari_company_id_fkey') THEN
    ALTER TABLE public.fumigation_ayarlari ADD CONSTRAINT fumigation_ayarlari_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kullanici_rolleri_company_id_fkey') THEN
    ALTER TABLE public.kullanici_rolleri ADD CONSTRAINT kullanici_rolleri_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kullanici_rolleri_user_id_fkey') THEN
    ALTER TABLE public.kullanici_rolleri ADD CONSTRAINT kullanici_rolleri_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kullanici_yetkileri_company_id_fkey') THEN
    ALTER TABLE public.kullanici_yetkileri ADD CONSTRAINT kullanici_yetkileri_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kullanici_yetkileri_user_id_fkey') THEN
    ALTER TABLE public.kullanici_yetkileri ADD CONSTRAINT kullanici_yetkileri_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_logs_company_id_fkey') THEN
    ALTER TABLE public.ai_usage_logs ADD CONSTRAINT ai_usage_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_logs_user_id_fkey') THEN
    ALTER TABLE public.ai_usage_logs ADD CONSTRAINT ai_usage_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
  END IF;
END $$;

-- ============================================================================
-- HELPER FONKSIYONLAR  (RLS politikalari bunlari kullanir)
-- Ikisi de canlida MEVCUT ve KULLANIMDA. get_auth_company_id (plpgsql) cogu
-- politikada; auth_company_id (sql) ise companies + dosya_evraklari +
-- fumigation_ayarlari politikalarinda kullaniliyor.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auth_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select company_id from public.kullanici_rolleri where user_id = auth.uid() limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_auth_company_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    RETURN (
        SELECT company_id
        FROM public.kullanici_rolleri
        WHERE user_id = auth.uid()
        LIMIT 1
    );
END;
$function$;

-- ============================================================================
-- handle_new_user()  — yeni kullaniciya otomatik sirket + rol + yetki acar
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  yeni_company_id uuid;
begin
  insert into public.companies (company_name)
  values (new.email)
  returning id into yeni_company_id;

  insert into public.kullanici_rolleri (user_id, rol, company_id)
  values (new.id, 'admin', yeni_company_id)
  on conflict (user_id) do nothing;

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
    raise warning 'handle_new_user hata: %', sqlerrm;
    return new;
end;
$function$;

-- ----------------------------------------------------------------------------
-- TRIGGER: on_auth_user_created — auth.users uzerinde
-- ----------------------------------------------------------------------------
-- Yukaridaki handle_new_user() FONKSIYONU tek basina yeterli DEGILDIR; onu
-- auth.users tablosuna baglayan bu TRIGGER olmadan yeni kullaniciya sirket/rol/
-- yetki ACILMAZ.
--
-- TARIHCE (onemli): Bu trigger canlida uzun sure HIC YOKTU. Fonksiyon vardi ama
-- tetikleyici olmadigi icin kaydolan kullanicilar company_id'siz kaliyor ve
-- uygulamada sonsuz "Yukleniyor" ekraninda takiliyordu. 17 Tem 2026'da canliya
-- kuruldu ve dogrulandi (tgenabled = 'O'). Bu satirlar o kurulumun birebir
-- kaydidir; boylece sifirdan bir ortam kurulumunda ayni hata tekrarlanmaz.
--
-- Idempotent: drop-if-exists + create ile tekrar tekrar calistirilabilir.
-- NOT: 'auth' semasi Supabase korumasi altindadir. Bazi ortamlarda bu iki satir
-- yetki hatasi verebilir; o durumda Supabase Dashboard uzerinden ayni trigger
-- elle olusturulmalidir.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- INDEKSLER  (hepsi idempotent)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_acente_teklifleri_company_id ON public.acente_teklifleri USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_acente_teklifleri_dosya_id ON public.acente_teklifleri USING btree (dosya_id);
CREATE INDEX IF NOT EXISTS idx_acenteler_company_id ON public.acenteler USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_company_period ON public.ai_usage_logs USING btree (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ana_siparisler_company_id ON public.ana_siparisler USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_dosya_evraklari_company_id ON public.dosya_evraklari USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_dosya_evraklari_dosya_id ON public.dosya_evraklari USING btree (dosya_id);
CREATE INDEX IF NOT EXISTS idx_dosya_evraklari_evrak_tipi ON public.dosya_evraklari USING btree (evrak_tipi);
CREATE INDEX IF NOT EXISTS idx_dosya_evraklari_kontrol_sonucu ON public.dosya_evraklari USING gin (kontrol_sonucu);
CREATE INDEX IF NOT EXISTS idx_ihracat_dosyalari_ana_siparis_id ON public.ihracat_dosyalari USING btree (ana_siparis_id);
CREATE INDEX IF NOT EXISTS idx_ihracat_dosyalari_company_id ON public.ihracat_dosyalari USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_ihracat_dosyalari_durum ON public.ihracat_dosyalari USING btree (durum);
CREATE INDEX IF NOT EXISTS idx_ihracat_dosyalari_ham_veri ON public.ihracat_dosyalari USING gin (ham_veri);
CREATE INDEX IF NOT EXISTS idx_ihracat_dosyalari_olusturma_tarihi ON public.ihracat_dosyalari USING btree (olusturma_tarihi DESC);
CREATE INDEX IF NOT EXISTS idx_ihracat_dosyalari_proforma_no ON public.ihracat_dosyalari USING btree (proforma_no);
CREATE INDEX IF NOT EXISTS idx_konteynerler_company_id ON public.konteynerler USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_konteynerler_dosya_id ON public.konteynerler USING btree (dosya_id);
CREATE INDEX IF NOT EXISTS idx_konteynerler_olusturma_tarihi ON public.konteynerler USING btree (olusturma_tarihi);
CREATE INDEX IF NOT EXISTS idx_konteynerler_rezervasyon_id ON public.konteynerler USING btree (rezervasyon_id);
CREATE INDEX IF NOT EXISTS idx_kullanici_rolleri_company_id ON public.kullanici_rolleri USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_kullanici_yetkileri_company_id ON public.kullanici_yetkileri USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_plakalar_company_id ON public.plakalar USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_rezervasyonlar_company_id ON public.rezervasyonlar USING btree (company_id);
CREATE INDEX IF NOT EXISTS idx_rezervasyonlar_dosya_id ON public.rezervasyonlar USING btree (dosya_id);
CREATE INDEX IF NOT EXISTS idx_rezervasyonlar_gemi_kalkis ON public.rezervasyonlar USING btree (gemi_kalkis_tarihi);
CREATE INDEX IF NOT EXISTS idx_sevkiyatlar_company_id ON public.sevkiyatlar USING btree (company_id);

-- ============================================================================
-- ROW LEVEL SECURITY — once ENABLE, sonra politikalar (idempotent)
-- Canlidaki gercek tanimlarla birebir ayni.
-- ============================================================================
ALTER TABLE public.companies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ihracat_dosyalari    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ana_siparisler       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sevkiyatlar          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rezervasyonlar       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.konteynerler         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acenteler            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acente_teklifleri    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plakalar             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dosya_evraklari      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fumigation_ayarlari  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kullanici_rolleri    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kullanici_yetkileri  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs        ENABLE ROW LEVEL SECURITY;

-- ihracat_dosyalari (ALL, authenticated)
DROP POLICY IF EXISTS "Sirket Yonetsin - Ihracat Dosyalari" ON public.ihracat_dosyalari;
CREATE POLICY "Sirket Yonetsin - Ihracat Dosyalari" ON public.ihracat_dosyalari
  FOR ALL TO authenticated
  USING (company_id = get_auth_company_id())
  WITH CHECK (company_id = get_auth_company_id());

-- ana_siparisler (ALL, authenticated)
DROP POLICY IF EXISTS "Sirket Yonetsin - Ana Siparisler" ON public.ana_siparisler;
CREATE POLICY "Sirket Yonetsin - Ana Siparisler" ON public.ana_siparisler
  FOR ALL TO authenticated
  USING (company_id = get_auth_company_id())
  WITH CHECK (company_id = get_auth_company_id());

-- sevkiyatlar (ALL, authenticated)
DROP POLICY IF EXISTS "Sirket Yonetsin - Sevkiyatlar" ON public.sevkiyatlar;
CREATE POLICY "Sirket Yonetsin - Sevkiyatlar" ON public.sevkiyatlar
  FOR ALL TO authenticated
  USING (company_id = get_auth_company_id())
  WITH CHECK (company_id = get_auth_company_id());

-- rezervasyonlar (ALL, authenticated)
DROP POLICY IF EXISTS "Sirket Yonetsin - Rezervasyonlar" ON public.rezervasyonlar;
CREATE POLICY "Sirket Yonetsin - Rezervasyonlar" ON public.rezervasyonlar
  FOR ALL TO authenticated
  USING (company_id = get_auth_company_id())
  WITH CHECK (company_id = get_auth_company_id());

-- konteynerler (ALL, authenticated)
DROP POLICY IF EXISTS "Sirket Yonetsin - Konteynerler" ON public.konteynerler;
CREATE POLICY "Sirket Yonetsin - Konteynerler" ON public.konteynerler
  FOR ALL TO authenticated
  USING (company_id = get_auth_company_id())
  WITH CHECK (company_id = get_auth_company_id());

-- acenteler (ALL, public)
DROP POLICY IF EXISTS "Sirket Yonetsin - Acenteler" ON public.acenteler;
CREATE POLICY "Sirket Yonetsin - Acenteler" ON public.acenteler
  FOR ALL TO public
  USING (company_id = get_auth_company_id())
  WITH CHECK (company_id = get_auth_company_id());

-- acente_teklifleri (ALL, public)
DROP POLICY IF EXISTS "Sirket Yonetsin - Acente Teklifleri" ON public.acente_teklifleri;
CREATE POLICY "Sirket Yonetsin - Acente Teklifleri" ON public.acente_teklifleri
  FOR ALL TO public
  USING (company_id = get_auth_company_id())
  WITH CHECK (company_id = get_auth_company_id());

-- plakalar (ALL, public)
DROP POLICY IF EXISTS "Sirket Yonetsin - Plakalar" ON public.plakalar;
CREATE POLICY "Sirket Yonetsin - Plakalar" ON public.plakalar
  FOR ALL TO public
  USING (company_id = get_auth_company_id())
  WITH CHECK (company_id = get_auth_company_id());

-- kullanici_yetkileri (ALL, public)
DROP POLICY IF EXISTS "Sirket Yonetsin - Kullanici Yetkileri" ON public.kullanici_yetkileri;
CREATE POLICY "Sirket Yonetsin - Kullanici Yetkileri" ON public.kullanici_yetkileri
  FOR ALL TO public
  USING (company_id = get_auth_company_id())
  WITH CHECK (company_id = get_auth_company_id());

-- kullanici_rolleri (ALL, public) — USER bazli (bilincli istisna)
DROP POLICY IF EXISTS "Sahibi Yonetsin" ON public.kullanici_rolleri;
CREATE POLICY "Sahibi Yonetsin" ON public.kullanici_rolleri
  FOR ALL TO public
  USING (auth.uid() = user_id);

-- companies (SELECT + UPDATE, public) — auth_company_id() kullanir
DROP POLICY IF EXISTS "companies_select_own" ON public.companies;
CREATE POLICY "companies_select_own" ON public.companies
  FOR SELECT TO public
  USING (id = auth_company_id());

DROP POLICY IF EXISTS "companies_update_own" ON public.companies;
CREATE POLICY "companies_update_own" ON public.companies
  FOR UPDATE TO public
  USING (id = auth_company_id())
  WITH CHECK (id = auth_company_id());

-- ai_usage_logs (yalniz SELECT) — INSERT service_role tarafindan yapilir
DROP POLICY IF EXISTS "ai_usage_select_own_company" ON public.ai_usage_logs;
CREATE POLICY "ai_usage_select_own_company" ON public.ai_usage_logs
  FOR SELECT TO public
  USING (company_id = get_auth_company_id());

-- dosya_evraklari (ayri ayri; auth_company_id kullanir)
DROP POLICY IF EXISTS "dosya_evraklari_select_own_company" ON public.dosya_evraklari;
CREATE POLICY "dosya_evraklari_select_own_company" ON public.dosya_evraklari
  FOR SELECT TO public
  USING (company_id = auth_company_id());

DROP POLICY IF EXISTS "dosya_evraklari_insert_own_company" ON public.dosya_evraklari;
CREATE POLICY "dosya_evraklari_insert_own_company" ON public.dosya_evraklari
  FOR INSERT TO public
  WITH CHECK (company_id = auth_company_id());

DROP POLICY IF EXISTS "dosya_evraklari_update_own_company" ON public.dosya_evraklari;
CREATE POLICY "dosya_evraklari_update_own_company" ON public.dosya_evraklari
  FOR UPDATE TO public
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

DROP POLICY IF EXISTS "dosya_evraklari_delete_own_company" ON public.dosya_evraklari;
CREATE POLICY "dosya_evraklari_delete_own_company" ON public.dosya_evraklari
  FOR DELETE TO public
  USING (company_id = auth_company_id());

-- fumigation_ayarlari (ayri ayri; auth_company_id kullanir)
DROP POLICY IF EXISTS "fumigation_select_own_company" ON public.fumigation_ayarlari;
CREATE POLICY "fumigation_select_own_company" ON public.fumigation_ayarlari
  FOR SELECT TO public
  USING (company_id = auth_company_id());

DROP POLICY IF EXISTS "fumigation_insert_own_company" ON public.fumigation_ayarlari;
CREATE POLICY "fumigation_insert_own_company" ON public.fumigation_ayarlari
  FOR INSERT TO public
  WITH CHECK (company_id = auth_company_id());

DROP POLICY IF EXISTS "fumigation_update_own_company" ON public.fumigation_ayarlari;
CREATE POLICY "fumigation_update_own_company" ON public.fumigation_ayarlari
  FOR UPDATE TO public
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

DROP POLICY IF EXISTS "fumigation_delete_own_company" ON public.fumigation_ayarlari;
CREATE POLICY "fumigation_delete_own_company" ON public.fumigation_ayarlari
  FOR DELETE TO public
  USING (company_id = auth_company_id());

-- ============================================================================
-- BASELINE SONU
-- ============================================================================