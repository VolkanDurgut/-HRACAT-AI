-- ============================================================================
-- YEDEK: GIRIS KULLANICILARI LISTESI (05.10.2026)
-- ============================================================================
-- Geri yukleme provasi: kullanici_rolleri / kullanici_yetkileri / created_by
-- alanlari auth.users kimliklerine (UUID) baglidir. Yeni bir projede
-- kullanicilar AYNI kimlikle yeniden olusturulmazsa kimse kendi sirketini
-- goremez. Bu fonksiyon gece yedegine sadece kimlik + e-posta + tarihleri
-- ekler; SIFRE / SIFRE OZETI / TOKEN HICBIR SEKILDE okunmaz.
-- Sadece service_role (yedekleme-gonder) cagirabilir.
-- ============================================================================
create or replace function public.yedek_kullanici_listesi()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id,
           'email', u.email,
           'olusturma', u.created_at,
           'email_onay', u.email_confirmed_at,
           'son_giris', u.last_sign_in_at
         ) order by u.created_at), '[]'::jsonb)
  from auth.users u;
$$;

revoke all on function public.yedek_kullanici_listesi() from public, anon, authenticated;
grant execute on function public.yedek_kullanici_listesi() to service_role;
