-- HAT TAKIP ZAMANLAYICI (27.11.2026, Asama 1). 15 dakikada bir edge hat-takip {"islem":"yenile"}: en eski sorgulanan
-- Hapag booking'i (Tryout T&T: 1 / dk, 100 / gun -> gunde en fazla 96 cagri; hat_takip_sira() 95'te durur).
-- Yalniz hat_* tablolarina yazar, mail yok. Kapatmak icin: select cron.unschedule('hat-takip-yenile');
-- ya da edge secret HAT_TAKIP_KAPALI = "evet". Authorization mevcut bir isten okunur; x-cron-anahtar Vault'tan (repoda yok).
do $cron$
declare
  v_url text;
  v_bearer text;
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron yok; zamanlanmadi.';
    return;
  end if;
  select substring(command from 'url := ''([^'']+)/functions/v1/'),
         substring(command from 'Bearer ([A-Za-z0-9._-]+)')
    into v_url, v_bearer
    from cron.job where jobname = 'gunluk-rapor-sabah';
  if v_url is null or v_bearer is null then
    raise notice 'gunluk-rapor-sabah komutu okunamadi; hat-takip-yenile zamanlanmadi.';
    return;
  end if;
  perform cron.unschedule(j.jobname) from cron.job j where j.jobname = 'hat-takip-yenile';
  perform cron.schedule('hat-takip-yenile', '*/15 * * * *', format($cmd$
  SELECT net.http_post(
    url := %L,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', %L,
      'x-cron-anahtar', (select decrypted_secret from vault.decrypted_secrets where name = 'hat_takip_anahtari' limit 1)
    ),
    body := '{"islem":"yenile"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cmd$, v_url || '/functions/v1/hat-takip', 'Bearer ' || v_bearer));
end
$cron$;
