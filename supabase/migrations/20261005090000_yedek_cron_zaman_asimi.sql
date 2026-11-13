-- Gece yedegi cron cagrisi (talep: 05.10.2026, log incelemesi).
--
-- net.http_post varsayilan 5 sn bekliyordu; yedekleme-gonder ~10 sn suruyor.
-- Yedek basariyla bitse de net._http_response'a her gece "Timeout of 5000 ms"
-- yaziliyordu ve fonksiyonun gercek cevabi kayboluyordu (bir gece gercekten
-- hata olursa veritabanindan gorulemezdi). Sadece bekleme suresi 60 sn yapildi;
-- url, baslik ve govde AYNI. Anahtar anon anahtaridir (zaten herkese acik).
-- 13.11.2026: anahtar bu dosyada <ANON_ANAHTARI> ile gizlendi (repo herkese acik; kural: JWT repoya yazilmaz). Canli
-- is 20261113200000_yedek_cron_anahtari.sql ile mevcut isten okunarak yeniden kuruldu. Yeni projede bu blok calismaz
-- (is yoktur); is docs/felaket-kurtarma.md adim 6 ile kurulur.
--
-- Geri yukleme provasi (05.10.2026): yeni / bos bir projede bu is henuz yoktur;
-- o durumda alter_job(NULL) kurulumu durdurmasin diye sadece IS VARSA
-- guncellenir. Yeni projede is docs/felaket-kurtarma.md adim 6 ile, YENI
-- projenin adresi ve anahtariyla kurulur. Canlida davranis ayni.
do $guard$
begin
  if exists (select 1 from cron.job where jobname = 'gunluk-yedek-maili') then
perform cron.alter_job(
  (select jobid from cron.job where jobname = 'gunluk-yedek-maili'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://tnzbihsfbhqzkcliicdk.supabase.co/functions/v1/yedekleme-gonder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_ANAHTARI>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cmd$
);
  end if;
end
$guard$;

-- Hic istatistigi toplanmamis / eski kucuk tablolar (veriye dokunmaz).
analyze public.kullanici_yetkileri;
analyze public.destek_mesajlari;
analyze public.ihracat_dosyalari;
analyze public.konteynerler;
