-- RAPOR TEST ANAHTARI (13.11.2026, guvenlik incelemesi 2. tur).
--
-- Sorun: ic-gunluk-rapor herkese acik anon anahtarla {"test_adresine": true} (sabit test adresine) ve {"test": true}
-- (AYARLI GERCEK ALICILARA "[TEST]" rapor) kabul ediyordu; 24 saatte 3 sinirli ama kimlik dogrulamasizdi.
-- Cozum: anon cagrida test modlari "x-test-anahtar" basligi ister; deger Vault'ta (yalniz veritabani erisimi olan,
-- SQL'den okuyabilir). Uygulamada bu modlari cagiran ekran YOK (yalniz SQL'den elle test). Zamanlanmis rapor etkilenmez.
-- Anahtarin DEGERI repoda YOK: burada rastgele uretilir.

do $anahtar$
begin
  if not exists (select 1 from vault.secrets where name = 'rapor_test_anahtari') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'rapor_test_anahtari',
      'Rapor edge''lerinde anon test modlari icin x-test-anahtar basligi. Yalniz rapor_test_anahtari_dogrula okur.'
    );
  end if;
end
$anahtar$;

create or replace function public.rapor_test_anahtari_dogrula(p_anahtar text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    length(p_anahtar) >= 32
    and p_anahtar = (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'rapor_test_anahtari' limit 1),
    false
  );
$$;
revoke all on function public.rapor_test_anahtari_dogrula(text) from public, anon, authenticated;
grant execute on function public.rapor_test_anahtari_dogrula(text) to service_role;
comment on function public.rapor_test_anahtari_dogrula(text) is
  'Rapor edge''leri: x-test-anahtar basligi Vault''taki rapor_test_anahtari ile ayni mi (13.11.2026). Yalniz service_role.';
