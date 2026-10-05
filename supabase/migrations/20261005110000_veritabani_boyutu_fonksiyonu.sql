-- Kapasite izleme (05.10.2026): gece yedek mailine DB doluluk satiri eklemek
-- icin veritabani boyutunu bayt olarak dondurur. SADECE service_role
-- (yedekleme-gonder edge function) cagirabilir; anon/authenticated cagiramaz.
-- Ad cozumlemesi icin pg_catalog acikca yazilir (bkz. CLAUDE.md, nextval dersi).
create or replace function public.veritabani_boyutu_bayt()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select pg_catalog.pg_database_size(pg_catalog.current_database());
$$;

revoke all on function public.veritabani_boyutu_bayt() from public, anon, authenticated;
grant execute on function public.veritabani_boyutu_bayt() to service_role;
