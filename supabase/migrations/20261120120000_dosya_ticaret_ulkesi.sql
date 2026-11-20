-- 20.11.2026 (kullanici: "ticaret yapilan ulke bilgisini manuel olarak da revize edebilmeliyiz"):
-- elle girilen ticaret yapilan ulke. Bos = alici adresinden bulunur (lib/ulke-bul dosyaTicaretUlkesi).
-- Mevcut RLS (sirket kullanicilari kendi dosyalarini gunceller) yeterli; yeni politika yok.
alter table public.ihracat_dosyalari add column if not exists ticaret_ulkesi text;
alter table public.ihracat_dosyalari drop constraint if exists ihracat_dosyalari_ticaret_ulkesi_uzunluk;
alter table public.ihracat_dosyalari add constraint ihracat_dosyalari_ticaret_ulkesi_uzunluk
  check (ticaret_ulkesi is null or char_length(ticaret_ulkesi) between 2 and 60);
comment on column public.ihracat_dosyalari.ticaret_ulkesi is 'Elle girilen ticaret yapilan ulke (bos: alici adresinden bulunur)';
