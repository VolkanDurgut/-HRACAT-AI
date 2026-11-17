-- OPERASYON IMAP CAGRI ANAHTARI (17.11.2026, Operasyon Ajani - arsiv acigi).
--
-- operasyon-imap edge fonksiyonu sirket posta kutusunu SALT OKUNUR okur. Herkese acik anon anahtarla
-- cagrilamasin diye her cagri "x-cron-anahtar" basligi ister; deger yalniz Vault'ta durur
-- (yedek_cron_anahtari ile ayni desen, migration 20261113200000). Degeri repoda YOK, burada rastgele uretilir.

do $anahtar$
begin
  if not exists (select 1 from vault.secrets where name = 'operasyon_imap_anahtari') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'operasyon_imap_anahtari',
      'operasyon-imap cagri anahtari (x-cron-anahtar basligi). Yalniz pg_cron / SQL ve operasyon_imap_anahtari_dogrula okur.'
    );
  end if;
end
$anahtar$;

create or replace function public.operasyon_imap_anahtari_dogrula(p_anahtar text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    length(p_anahtar) >= 32
    and p_anahtar = (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'operasyon_imap_anahtari' limit 1),
    false
  );
$$;
revoke all on function public.operasyon_imap_anahtari_dogrula(text) from public, anon, authenticated;
grant execute on function public.operasyon_imap_anahtari_dogrula(text) to service_role;
comment on function public.operasyon_imap_anahtari_dogrula(text) is
  'operasyon-imap: x-cron-anahtar basligi Vault''taki operasyon_imap_anahtari ile ayni mi (17.11.2026). Yalniz service_role.';
