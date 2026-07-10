-- BASELINE MIGRATION
-- Bu dosya, projenin gercek/canli Supabase veritabaninin 18.06.2026 tarihli
-- guncel halini yansitir. Onceki uc migration dosyasi (create_ihracat_tables,
-- redesign_ihracat_schema, fix_dosya_sequence) eski bir tasarima aitti ve
-- gercek semayla uyumsuzdu (orn. tablo adi "dosyalar" yerine "ihracat_dosyalari"),
-- bu yuzden kaldirilip bu tek dosyada birlestirildi.
--
-- NOT: sevkiyatlar tablosu mevcut ama uygulama kodunda su an aktif olarak
-- kullanilmiyor (konteynerler.sevkiyat_id ve surec_takibi.sevkiyat_id ona
-- referans veriyor ama kod tarafinda doldurulmuyor). Ileride kullanilmaya
-- baslanirsa burasi guncellenmeli.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ihracat_dosyalari
-- ============================================================
CREATE TABLE IF NOT EXISTS ihracat_dosyalari (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dosya_no TEXT NOT NULL UNIQUE,
  durum TEXT DEFAULT 'Acik',
  olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  satici_firma TEXT,
  alici_firma TEXT,
  urun_tanimi TEXT,
  toplam_tutar NUMERIC,
  para_birimi TEXT DEFAULT 'USD',
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
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Ek Bilgiler / Fatura Talimati alanlari
  marka TEXT,
  beyanname_no TEXT,
  fatura_no TEXT,
  fatura_tarihi DATE,
  bl_no TEXT,
  diib_no TEXT,
  diib_tarihi DATE,
  uretim_tarihi DATE,
  son_kullanim_tarihi DATE,
  navlun_tutari NUMERIC
);

-- ============================================================
-- rezervasyonlar
-- ============================================================
CREATE TABLE IF NOT EXISTS rezervasyonlar (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dosya_id UUID REFERENCES ihracat_dosyalari(id) ON DELETE CASCADE,
  booking_no TEXT,
  gemi_kalkis_tarihi DATE,
  talimat_cutoff TIMESTAMPTZ,
  beyanname_cutoff TIMESTAMPTZ,
  ardiyesiz_giris DATE,
  ekipman_alim_yeri TEXT,
  ekipman_alim_tarihi DATE,
  yuklenme_limani TEXT,
  konteyner_adedi INTEGER,
  net_agirlik NUMERIC,
  brut_agirlik NUMERIC,
  olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  sevkiyat_id UUID,
  created_by UUID REFERENCES auth.users(id),
  gemi_adi TEXT,
  acente_ismi TEXT
);

-- ============================================================
-- konteynerler
-- ============================================================
CREATE TABLE IF NOT EXISTS konteynerler (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dosya_id UUID REFERENCES ihracat_dosyalari(id) ON DELETE CASCADE,
  rezervasyon_id UUID REFERENCES rezervasyonlar(id) ON DELETE SET NULL,
  konteyner_no TEXT NOT NULL,
  muhur_no TEXT,
  tip TEXT DEFAULT '20DC',
  olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  sevkiyat_id UUID,
  urun_adi TEXT,
  miktar_mts NUMERIC,
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================================
-- surec_takibi
-- ============================================================
CREATE TABLE IF NOT EXISTS surec_takibi (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dosya_id UUID REFERENCES ihracat_dosyalari(id) ON DELETE CASCADE,
  adim_kodu TEXT NOT NULL,
  tamamlandi BOOLEAN DEFAULT FALSE,
  tamamlanma_tarihi TIMESTAMPTZ,
  not_metni TEXT,
  olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  sevkiyat_id UUID,
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================================
-- acenteler (freight teklif sistemi)
-- ============================================================
CREATE TABLE IF NOT EXISTS acenteler (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  isim TEXT NOT NULL,
  email TEXT NOT NULL,
  telefon TEXT,
  notlar TEXT,
  created_by UUID REFERENCES auth.users(id),
  olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  cc_emails TEXT,
  mail_metni TEXT,
  son_gonderim_tarihi TIMESTAMPTZ,
  mail_konusu TEXT,
  teklif_fiyat TEXT,
  teklif_konteyner TEXT,
  teklif_gecerlilik TEXT,
  teklif_notu TEXT,
  teklif_tarihi TIMESTAMPTZ
);

-- ============================================================
-- sevkiyatlar (mevcut ama uygulamada henuz aktif kullanilmiyor)
-- ============================================================
CREATE TABLE IF NOT EXISTS sevkiyatlar (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dosya_id UUID REFERENCES ihracat_dosyalari(id) ON DELETE CASCADE,
  sevkiyat_no TEXT NOT NULL,
  konteyner_adedi INTEGER NOT NULL DEFAULT 1,
  durum TEXT DEFAULT 'planlandi',
  notlar TEXT,
  olusturma_tarihi TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE ihracat_dosyalari ENABLE ROW LEVEL SECURITY;
ALTER TABLE rezervasyonlar ENABLE ROW LEVEL SECURITY;
ALTER TABLE konteynerler ENABLE ROW LEVEL SECURITY;
ALTER TABLE surec_takibi ENABLE ROW LEVEL SECURITY;
ALTER TABLE acenteler ENABLE ROW LEVEL SECURITY;
ALTER TABLE sevkiyatlar ENABLE ROW LEVEL SECURITY;

-- Not: Bu projede tum authenticated kullanicilar ortak calistigi icin
-- (tek firma, paylasimli kullanim) politikalar kisitlayici degil; tum
-- authenticated kullanicilara tam erisim taniniyor. Coklu firma/musteri
-- yapisina gecilirse buradaki politikalar user_id bazli kisitlanmalidir.

CREATE POLICY "authenticated_all_ihracat_dosyalari" ON ihracat_dosyalari
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_rezervasyonlar" ON rezervasyonlar
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_konteynerler" ON konteynerler
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_surec_takibi" ON surec_takibi
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_acenteler" ON acenteler
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_sevkiyatlar" ON sevkiyatlar
  FOR ALL TO authenticated USING (true) WITH CHECK (true);