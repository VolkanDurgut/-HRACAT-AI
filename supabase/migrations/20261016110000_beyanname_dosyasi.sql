-- ============================================================================
-- BEYANNAME DOSYASI (16.10.2026, kullanici istegi)
-- ============================================================================
-- Gumruk beyannamesi Sevkiyat Evraklari sekmesinden sisteme yuklenir.
-- Yuklendiginde beyanname cut-off geri sayimi durur ("Beyanname yüklendi"),
-- cut-off tarihi yine gorunur. (Talimat cut-off icin ayni kural konsimento
-- talimati / Draft BL ile calisir; o taraf veritabani degisikligi istemez.)
--
-- Dosya mevcut ozel "konsimento-talimatlari" deposuna, Draft BL gibi
-- "<dosya_id>/beyanname/..." yoluna yazilir: mevcut depo politikalari
-- (sirket bazli, storage_path_company_id) aynen gecerlidir, yeni depo /
-- politika gerekmez.
--
-- Sadece EKLEME; hicbir veri silinmez / degismez. Tablo yetkileri tablo
-- duzeyinde verildigi icin yeni sutunlar ek yetki istemez. depositors /
-- contact_messages tablolarina dokunmaz.
-- ============================================================================

alter table public.ihracat_dosyalari add column if not exists beyanname_dosya_url text;
alter table public.ihracat_dosyalari add column if not exists beyanname_dosya_adi text;
alter table public.ihracat_dosyalari add column if not exists beyanname_yukleme_tarihi timestamptz;

comment on column public.ihracat_dosyalari.beyanname_dosya_url is 'Yuklenen gumruk beyannamesi (imzali URL, konsimento-talimatlari/<dosya_id>/beyanname/...). Doluysa beyanname cut-off sayaci durur (16.10.2026).';
comment on column public.ihracat_dosyalari.beyanname_dosya_adi is 'Yuklenen beyanname dosyasinin orijinal adi.';
comment on column public.ihracat_dosyalari.beyanname_yukleme_tarihi is 'Beyannamenin yuklendigi an.';
