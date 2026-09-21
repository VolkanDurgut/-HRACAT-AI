ALTER TABLE public.ihracat_dosyalari
  ADD COLUMN IF NOT EXISTS draft_musteri_onayi_alindi boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_musteri_onayi_tarihi timestamptz,
  ADD COLUMN IF NOT EXISTS draft_musteri_onayi_isaretleyen text,
  ADD COLUMN IF NOT EXISTS draft_mail_gonderildi_tarihi timestamptz;