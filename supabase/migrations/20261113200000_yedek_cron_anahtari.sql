-- YEDEK CRON ANAHTARI (13.11.2026, guvenlik incelemesi).
--
-- Sorun: yedekleme-gonder herkese acik anon anahtarla cagrilabiliyordu. Gercek calisma 20 saat kilidiyle, test maili
-- 24 saatte 3 ile sinirliydi; ama {"deneme": true} SINIRSIZDI ve her cagri butun tablolari + storage envanterini okuyup
-- geri yukleme testini calistiriyordu (Free plan kotasi / egress harcatilabilirdi).
-- Cozum: cron cagrisi Vault'taki gizli anahtari "x-cron-anahtar" basligiyla gonderir; edge her cagrida
-- public.yedek_cron_anahtari_dogrula() ile dogrular, gecersizse HICBIR SEY okumadan 401 doner.
-- Anahtarin DEGERI repoda YOK: burada rastgele uretilir, yalniz Vault'ta durur (pg_cron ve dogrulama fonksiyonu okur).
-- Cron komutundaki Authorization (anon) mevcut isten okunur; JWT bu dosyaya yazilmaz.

-- 1) Anahtar (yoksa olustur; varsa dokunma)
do $anahtar$
begin
  if not exists (select 1 from vault.secrets where name = 'yedek_cron_anahtari') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'yedek_cron_anahtari',
      'yedekleme-gonder cagri anahtari (x-cron-anahtar basligi). Yalniz pg_cron ve yedek_cron_anahtari_dogrula okur.'
    );
  end if;
end
$anahtar$;

-- 2) Dogrulama (yalniz service_role; anahtarin kendisini DONDURMEZ)
create or replace function public.yedek_cron_anahtari_dogrula(p_anahtar text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    length(p_anahtar) >= 32
    and p_anahtar = (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'yedek_cron_anahtari' limit 1),
    false
  );
$$;
revoke all on function public.yedek_cron_anahtari_dogrula(text) from public, anon, authenticated;
grant execute on function public.yedek_cron_anahtari_dogrula(text) to service_role;
comment on function public.yedek_cron_anahtari_dogrula(text) is
  'yedekleme-gonder: x-cron-anahtar basligi Vault''taki yedek_cron_anahtari ile ayni mi (13.11.2026). Yalniz service_role.';

-- 3) Gece cron'u basligi gondersin (is varsa; yeni projede docs/felaket-kurtarma.md adim 6)
do $cron$
declare
  v_id bigint;
  v_url text;
  v_bearer text;
begin
  select jobid,
         substring(command from 'url := ''([^'']+)'''),
         substring(command from 'Bearer ([A-Za-z0-9._-]+)')
    into v_id, v_url, v_bearer
    from cron.job where jobname = 'gunluk-yedek-maili';
  if v_id is null then
    return;
  end if;
  if v_url is null or v_bearer is null then
    raise exception 'gunluk-yedek-maili komutu beklenen bicimde degil (url / Bearer okunamadi); elle bakilmali';
  end if;
  perform cron.alter_job(v_id, command := format($cmd$
  SELECT net.http_post(
    url := %L,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', %L,
      'x-cron-anahtar', (select decrypted_secret from vault.decrypted_secrets where name = 'yedek_cron_anahtari' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cmd$, v_url, 'Bearer ' || v_bearer));
end
$cron$;
