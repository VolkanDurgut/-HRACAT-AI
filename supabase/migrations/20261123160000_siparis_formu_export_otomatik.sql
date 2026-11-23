-- 23.11.2026 Siparis bildirim formu: export girisi + otomatik gonderim.
-- Kullanici: "Harun Bey spek ve urun gorseli eklediginde siparis bildirim formu otomatik olarak gitsin. Bu daha iyi olacak.
-- Her gun Harun Bey'e spek ve girilmesi gereken urun gorselleri mail olarak gider; ekraninda bildirim olarak da gorunur."
-- -> Lojistik secim adimi (Suleyman Bey sabah listesi) KALDIRILDI: pg_cron 'siparis-formu-lojistik' kapatilir ve rapor
--    'siparis_formu_lojistik' canli KAPALI tutulur (satir / tablo / kod yedek olarak kalir, veri silinmez).
-- Export sabah maili (cron 'siparis-formu-spek', 08:17) ve 'siparis_formu_spek' rapor satiri AYNEN kalir; ayni satirin canli
-- anahtari otomatik form gonderiminin canli / test secimidir (edge siparis-formu {"islem": "otomatik"}).

do $$
begin
  if exists (select 1 from cron.job where jobname = 'siparis-formu-lojistik') then
    perform cron.unschedule('siparis-formu-lojistik');
  end if;
end $$;

update public.rapor_alicilari set canli = false where rapor = 'siparis_formu_lojistik' and canli;
