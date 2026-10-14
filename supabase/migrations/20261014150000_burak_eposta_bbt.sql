-- ============================================================================
-- BURAK TUNCAY GIRIS E-POSTASI: buraktuncay@unex.com.tr -> bbt@unex.com.tr
-- (14.10.2026, kullanici istegi: "gercek mailiyle kayitli olsun")
-- ============================================================================
-- Ayni kullanici (id 3a9ff910-093c-4a98-95f8-dfb3817f14ee), ayni sifre, ayni
-- rol / yetkiler / sirket. Sadece giris e-postasi degisir.
--  0) ON TEMIZLIK: 14.10.2026 14:23'te Supabase panelinden elle acilan BOS
--     bbt@unex.com.tr hesabi (id 7c41b472-..., hic giris yapilmadi) ve
--     handle_new_user tetikleyicisinin onun icin actigi BOS sirket
--     (32a8d2cc-..., adi "bbt@unex.com.tr") silinir. Koruma: hesap giris
--     yapmissa, baska bir kayit bu hesaba / sirkete bagliysa islem DURUR.
--  1) Super admin e-postasini iceren 3 RLS politikasi yeni adrese gecer
--     (kullanici_yetkileri yonetimi, ihracat_dosyalari okuma, denetim okuma).
--  2) auth.users + auth.identities (email saglayicisi) e-postasi.
--  3) kullanici_yetkileri.email (Yetkilendirme ekranindaki gorunen ad).
-- Uygulama tarafi: lib/auth-context.tsx SUPER_ADMIN_EMAILS ayni commit'te.
-- Tek islem (transaction): bir adim basarisiz olursa hicbiri uygulanmaz.
-- ============================================================================
begin;

-- 0) On temizlik (sadece beklenen bos kopya hesap ise)
do $$
declare
  kopya constant uuid := '7c41b472-e3a2-4218-8ee4-5f1017c7ed35';
  kopya_sirket constant uuid := '32a8d2cc-b839-42e9-804f-165702772e49';
  burak constant uuid := '3a9ff910-093c-4a98-95f8-dfb3817f14ee';
  t record;
  n bigint;
begin
  if not exists (select 1 from auth.users where id = burak and lower(email) = 'buraktuncay@unex.com.tr') then
    raise exception 'Beklenen kullanici (buraktuncay@unex.com.tr) bulunamadi; islem durduruldu.';
  end if;

  if exists (select 1 from auth.users where lower(email) = 'bbt@unex.com.tr' and id <> kopya) then
    raise exception 'bbt@unex.com.tr beklenmeyen bir hesapta kayitli; islem durduruldu.';
  end if;

  if exists (select 1 from auth.users where id = kopya) then
    if exists (select 1 from auth.users where id = kopya and (lower(email) <> 'bbt@unex.com.tr' or last_sign_in_at is not null)) then
      raise exception 'Kopya hesap beklenen durumda degil (giris yapilmis olabilir); islem durduruldu.';
    end if;
    if not exists (select 1 from public.companies where id = kopya_sirket and company_name = 'bbt@unex.com.tr') then
      raise exception 'Kopya hesabin sirketi beklenen durumda degil; islem durduruldu.';
    end if;
    -- Kopya sirkete bagli HICBIR is kaydi olmamali (kullanici_rolleri / yetkileri haric)
    for t in
      select c.table_name from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name = 'company_id'
        and c.table_name not in ('kullanici_rolleri', 'kullanici_yetkileri')
    loop
      execute format('select count(*) from public.%I where company_id = $1', t.table_name) into n using kopya_sirket;
      if n > 0 then
        raise exception 'Kopya sirkette % tablosunda % kayit var; islem durduruldu.', t.table_name, n;
      end if;
    end loop;
    -- Kopya hesap baska sirkette de rol/yetki sahibi olmamali
    if exists (select 1 from public.kullanici_rolleri where user_id = kopya and company_id <> kopya_sirket)
       or exists (select 1 from public.kullanici_yetkileri where user_id = kopya and company_id <> kopya_sirket) then
      raise exception 'Kopya hesabin baska sirkette yetkisi var; islem durduruldu.';
    end if;

    delete from public.kullanici_yetkileri where user_id = kopya;
    delete from public.kullanici_rolleri where user_id = kopya;
    delete from auth.users where id = kopya;           -- identities / sessions zincirleme silinir
    delete from public.companies where id = kopya_sirket;
  end if;
end $$;

-- 1) Politikalar
alter policy "Sadece super admin yetkileri yonetsin" on public.kullanici_yetkileri
  using ((company_id = get_auth_company_id()) and (lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = any (array['volkandurgut.tr@gmail.com'::text, 'bbt@unex.com.tr'::text])))
  with check ((company_id = get_auth_company_id()) and (lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = any (array['volkandurgut.tr@gmail.com'::text, 'bbt@unex.com.tr'::text])));

alter policy "Ihracat Dosyalari - Okuma (rol bazli)" on public.ihracat_dosyalari
  using ((company_id = get_auth_company_id()) and ((exists (select 1 from kullanici_rolleri kr
    where ((kr.user_id = auth.uid()) and (kr.rol = any (array['admin'::text, 'ihracat'::text, 'muhasebe'::text])))))
    or (lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = any (array['volkandurgut.tr@gmail.com'::text, 'bbt@unex.com.tr'::text]))));

alter policy "Denetim Kayitlari - Okuma (rol bazli)" on public.denetim_kayitlari
  using ((company_id = get_auth_company_id()) and ((exists (select 1 from kullanici_rolleri kr
    where ((kr.user_id = auth.uid()) and (kr.rol = any (array['admin'::text, 'ihracat'::text, 'muhasebe'::text])))))
    or (lower(coalesce((auth.jwt() ->> 'email'::text), ''::text)) = any (array['volkandurgut.tr@gmail.com'::text, 'bbt@unex.com.tr'::text]))));

-- 2) Giris e-postasi
update auth.users
   set email = 'bbt@unex.com.tr', updated_at = now()
 where id = '3a9ff910-093c-4a98-95f8-dfb3817f14ee';

update auth.identities
   set identity_data = identity_data || jsonb_build_object('email', 'bbt@unex.com.tr'), updated_at = now()
 where user_id = '3a9ff910-093c-4a98-95f8-dfb3817f14ee' and provider = 'email';

-- 3) Yetkilendirme ekranindaki e-posta
update public.kullanici_yetkileri
   set email = 'bbt@unex.com.tr', updated_at = now()
 where user_id = '3a9ff910-093c-4a98-95f8-dfb3817f14ee';

commit;
