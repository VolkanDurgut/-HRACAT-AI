-- Draft evrak surecinde musteri onayini ayri bir asama olarak takip etmek icin
-- yeni alanlar ekler. "draft_onaylandi" (mevcut) sadece IC EKIP'in draft'i
-- gondermeye hazir oldugunu isaretler; "draft_musteri_onayi_alindi" ise
-- MUSTERIDEN fiilen onay geldigini isaretler. Bu iki kavram birbirinden
-- baglayimlidir ama farklidir ve UI'da karistirilmamalidir.
ALTER TABLE public.ihracat_dosyalari
  ADD COLUMN IF NOT EXISTS draft_musteri_onayi_alindi boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_musteri_onayi_tarihi timestamptz,
  ADD COLUMN IF NOT EXISTS draft_musteri_onayi_isaretleyen text,
  ADD COLUMN IF NOT EXISTS draft_mail_gonderildi_tarihi timestamptz;
