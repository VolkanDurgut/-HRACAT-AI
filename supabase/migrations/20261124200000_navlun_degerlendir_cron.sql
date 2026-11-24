-- 24.11.2026 NAVLUN ASAMA 1: degerlendirme zamanlamasi (kullanici onayi). Edge navlun-bildirimi {"islem":"degerlendir"}
-- 15 dakikada bir calisir: teklif degerlendirmesi (konteyner basi toplam, gecerlilik, durum, en iyi) ve gerceklesen kontrolu
-- yenilenir (navlun_teklif_degerlendirme / navlun_gerceklesen_kontrol, 20261124190000). Is kayitlarina yazmaz.
-- Yetki: x-rapor-anahtar basligi HER CALISMADA vault'tan okunur ('navlun_rapor_anahtari', 20261124180000); anahtar cron
-- komutunda acik yazmaz. Authorization (anon) navlun-tablosu-sabah gorevinin komutundan turetilir; repoya anahtar girmez.
-- Mevcut kayitlar degismez.
do $$
declare
  v_kaynak text;
  v_yetki text;
  v_komut text;
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron yok; zamanlanmadi.';
    return;
  end if;
  select command into v_kaynak from cron.job where jobname = 'navlun-tablosu-sabah' limit 1;
  v_yetki := substring(v_kaynak from '''Authorization'',\s*''(Bearer [A-Za-z0-9._-]+)''');
  if v_yetki is null then
    raise notice 'navlun-tablosu-sabah beklenen bicimde degil; degerlendirme zamanlanmadi.';
    return;
  end if;
  v_komut := format($c$
  SELECT net.http_post(
    url := 'https://tnzbihsfbhqzkcliicdk.supabase.co/functions/v1/navlun-bildirimi',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L,
      'x-rapor-anahtar', (select decrypted_secret from vault.decrypted_secrets where name = 'navlun_rapor_anahtari')),
    body := '{"islem": "degerlendir"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $c$, v_yetki);
  perform cron.unschedule(j.jobname) from cron.job j where j.jobname = 'navlun-degerlendir';
  perform cron.schedule('navlun-degerlendir', '7,22,37,52 * * * *', v_komut);
end $$;
