-- ============================================================================
-- HESAP E-POSTA DEGISIMI (27.10.2026)
-- ============================================================================
-- Kullanici: "volkandurgut.tr@gmail.com -> execution@unex.com.tr olmasini istiyorum.
-- ihracat@unex.com.tr -> export@unex.com.tr olmasini istiyorum."
--
-- Ayni kullanici (ayni id, sifre, rol, yetkiler, gecmis kayitlar) - SADECE giris
-- e-postasi degisir. Tek islem (transaction):
--  1) auth.users.email + auth.identities.identity_data.email + kullanici_yetkileri.email
--  2) Super admin listesi (volkandurgut.tr@gmail.com -> execution@unex.com.tr):
--     - RLS: kullanici_yetkileri "Sadece super admin yetkileri yonetsin",
--            ihracat_dosyalari / denetim_kayitlari "... - Okuma (rol bazli)"
--     - fonksiyon: yetki_super_admin_sirketi, kh_elle_iste
--     (ayni liste kodda: lib/auth-context.tsx SUPER_ADMIN_EMAILS,
--      supabase/functions/gunluk-rapor-gonder/yetki.ts SUPER_ADMIN_EPOSTALARI)
--  3) Dogrulama: eski adres veritabani yetki tanimlarinda KALMAMALI.
-- Gecmis kayitlardaki e-posta metinleri (karar_veren_email vb.) DEGISMEZ (tarihce).
-- Oturum: kullanici cikis yapip YENI e-postayla (ayni sifre) girer.
-- Tekrar calistirilirsa zararsiz: eski adres yoksa auth adimlari atlanir.
-- ============================================================================

do $$
declare
  v_volkan uuid;
  v_harun uuid;
begin
  select id into v_volkan from auth.users where lower(email) = 'volkandurgut.tr@gmail.com';
  select id into v_harun from auth.users where lower(email) = 'ihracat@unex.com.tr';

  if v_volkan is not null then
    if exists (select 1 from auth.users where lower(email) = 'execution@unex.com.tr') then
      raise exception 'execution@unex.com.tr adresiyle zaten bir hesap var; degisiklik yapilmadi.';
    end if;
    update auth.users set email = 'execution@unex.com.tr', email_change = '', updated_at = now() where id = v_volkan;
    update auth.identities set identity_data = jsonb_set(identity_data, '{email}', '"execution@unex.com.tr"'), updated_at = now()
     where user_id = v_volkan and provider = 'email';
    update public.kullanici_yetkileri set email = 'execution@unex.com.tr' where user_id = v_volkan;
  end if;

  if v_harun is not null then
    if exists (select 1 from auth.users where lower(email) = 'export@unex.com.tr') then
      raise exception 'export@unex.com.tr adresiyle zaten bir hesap var; degisiklik yapilmadi.';
    end if;
    update auth.users set email = 'export@unex.com.tr', email_change = '', updated_at = now() where id = v_harun;
    update auth.identities set identity_data = jsonb_set(identity_data, '{email}', '"export@unex.com.tr"'), updated_at = now()
     where user_id = v_harun and provider = 'email';
    update public.kullanici_yetkileri set email = 'export@unex.com.tr' where user_id = v_harun;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS politikalari (tanimlar canli ile birebir; yalniz e-posta listesi degisti)
-- ---------------------------------------------------------------------------
drop policy if exists "Sadece super admin yetkileri yonetsin" on public.kullanici_yetkileri;
create policy "Sadece super admin yetkileri yonetsin" on public.kullanici_yetkileri
  for all
  using ((company_id = get_auth_company_id()) and (lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = any (array['execution@unex.com.tr'::text, 'bbt@unex.com.tr'::text])))
  with check ((company_id = get_auth_company_id()) and (lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = any (array['execution@unex.com.tr'::text, 'bbt@unex.com.tr'::text])));

drop policy if exists "Ihracat Dosyalari - Okuma (rol bazli)" on public.ihracat_dosyalari;
create policy "Ihracat Dosyalari - Okuma (rol bazli)" on public.ihracat_dosyalari
  for select
  using (((company_id = get_auth_company_id()) and ((exists ( select 1
   from kullanici_rolleri kr
  where ((kr.user_id = auth.uid()) and (kr.rol = any (array['admin'::text, 'ihracat'::text, 'muhasebe'::text]))))) or (lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = any (array['execution@unex.com.tr'::text, 'bbt@unex.com.tr'::text])))));

drop policy if exists "Denetim Kayitlari - Okuma (rol bazli)" on public.denetim_kayitlari;
create policy "Denetim Kayitlari - Okuma (rol bazli)" on public.denetim_kayitlari
  for select
  using (((company_id = get_auth_company_id()) and ((exists ( select 1
   from kullanici_rolleri kr
  where ((kr.user_id = auth.uid()) and (kr.rol = any (array['admin'::text, 'ihracat'::text, 'muhasebe'::text]))))) or (lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = any (array['execution@unex.com.tr'::text, 'bbt@unex.com.tr'::text])))));

-- ---------------------------------------------------------------------------
-- Fonksiyonlar: canli tanim alinir, YALNIZ e-posta degistirilir (govde ayni kalir;
-- CREATE OR REPLACE izinleri korur).
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  v_tanim text;
begin
  for f in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('yetki_super_admin_sirketi', 'kh_elle_iste')
  loop
    v_tanim := pg_get_functiondef(f.oid);
    if position('volkandurgut.tr@gmail.com' in v_tanim) > 0 then
      execute replace(v_tanim, 'volkandurgut.tr@gmail.com', 'execution@unex.com.tr');
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Dogrulama: eski super admin adresi hicbir politika / public fonksiyonda kalmamali
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_policy
              where coalesce(pg_get_expr(polqual, polrelid), '') || coalesce(pg_get_expr(polwithcheck, polrelid), '') ilike '%volkandurgut.tr@gmail.com%') then
    raise exception 'Eski adres bir RLS politikasinda kaldi.';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosrc ilike '%volkandurgut.tr@gmail.com%') then
    raise exception 'Eski adres bir fonksiyonda kaldi.';
  end if;
end $$;
