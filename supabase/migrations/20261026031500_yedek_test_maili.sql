-- Gunluk yedek: TEST MAILI kaydi (26.10.2026, kullanici: "bir test maili gormek istiyorum").
-- yedekleme-gonder {"test_maili": true} -> tekrar korumasi (20 saat) ATLANIR, mail "[TEST]"
-- konusuyla ayni aliciya gider ve yedek_kayitlari'na durum='test' yazilir. 'test' kayitlari
-- gece yedeginin tekrar korumasina SAYILMAZ (sadece basarili/uyarili sayilir) -> test maili
-- gercek 03:00 yedegini engellemez. Kotuye kullanim: son 24 saatte en fazla 3 test (fonksiyonda).
-- SADECE kisit genisletme; mevcut satirlar degismez. Tekrar calistirilabilir.
alter table public.yedek_kayitlari drop constraint if exists yedek_kayitlari_durum_check;
alter table public.yedek_kayitlari add constraint yedek_kayitlari_durum_check
  check (durum = any (array['basarili'::text, 'uyarili'::text, 'hatali'::text, 'test'::text]));
