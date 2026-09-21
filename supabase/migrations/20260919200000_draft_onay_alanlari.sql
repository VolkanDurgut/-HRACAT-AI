-- ============================================================================
-- Draft Onay Gönderim akışı için ihracat_dosyalari'na yeni alanlar
--
-- "Draft Onay" sekmesinde: ihracat@unex.com.tr taslak evrakları inceleyip
-- onayladığında bu alanlar doldurulur; mail gonderimi manuel yapılır
-- (mailto: ile TO/CC/Konu/Metin hazır açılır, ekler sürükle-bırakla eklenir).
-- ============================================================================

ALTER TABLE public.ihracat_dosyalari
  ADD COLUMN IF NOT EXISTS draft_onaylandi boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_onaylayan text,
  ADD COLUMN IF NOT EXISTS draft_onay_tarihi timestamptz,
  ADD COLUMN IF NOT EXISTS draft_mail_gonderildi boolean NOT NULL DEFAULT false;
