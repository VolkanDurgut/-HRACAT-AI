-- Gece yedegi cron cagrisi (talep: 05.10.2026, log incelemesi).
--
-- net.http_post varsayilan 5 sn bekliyordu; yedekleme-gonder ~10 sn suruyor.
-- Yedek basariyla bitse de net._http_response'a her gece "Timeout of 5000 ms"
-- yaziliyordu ve fonksiyonun gercek cevabi kayboluyordu (bir gece gercekten
-- hata olursa veritabanindan gorulemezdi). Sadece bekleme suresi 60 sn yapildi;
-- url, baslik ve govde AYNI. Anahtar anon anahtaridir (zaten herkese acik).
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
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuemJpaHNmYmhxemtjbGlpY2RrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTAwNzYsImV4cCI6MjA5NjU2NjA3Nn0.Oh6jrOS86zUpEu0FiPrmF7tXslgXj3w047e1Ld92KIA'
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
