-- HAT TAKIP CAGRI ANAHTARI (27.11.2026, Hapag-Lloyd API entegrasyonu - asama 0: baglanti denemesi).
--
-- hat-takip edge fonksiyonu Hapag-Lloyd API'sini (Track & Trace v2, Commercial Schedule v3) cagirir. Herkese acik anon
-- anahtarla cagrilip Tryout kotamiz (T&T 100/gun) tuketilmesin diye her cagri "x-cron-anahtar" basligi ister; deger yalniz
-- Vault'ta durur (operasyon_imap_anahtari ile ayni desen, migration 20261117160000). Degeri repoda YOK, burada uretilir.
-- Hapag anahtarlari ayri: Edge Function secret HAPAG_CLIENT_ID / HAPAG_CLIENT_SECRET (kullanici Supabase panelinden girer).

do $anahtar$
begin
  if not exists (select 1 from vault.secrets where name = 'hat_takip_anahtari') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'hat_takip_anahtari',
      'hat-takip cagri anahtari (x-cron-anahtar basligi). Yalniz pg_cron / SQL ve hat_takip_anahtari_dogrula okur.'
    );
  end if;
end
$anahtar$;

create or replace function public.hat_takip_anahtari_dogrula(p_anahtar text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    length(p_anahtar) >= 32
    and p_anahtar = (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'hat_takip_anahtari' limit 1),
    false
  );
$$;
revoke all on function public.hat_takip_anahtari_dogrula(text) from public, anon, authenticated;
grant execute on function public.hat_takip_anahtari_dogrula(text) to service_role;
comment on function public.hat_takip_anahtari_dogrula(text) is
  'hat-takip: x-cron-anahtar basligi Vault''taki hat_takip_anahtari ile ayni mi (27.11.2026). Yalniz service_role.';
