-- ============================================================================
-- YENI KULLANICI -> YETKILENDIRME (27.10.2026)
-- ============================================================================
-- Kullanici: "Yeni kullanici ekledigi gibi Yetkilendirme sayfasinda eklenen
-- kullanicinin gozukmesini ve yetki ayarlarinin yapilip kaydedilebilir sekilde
-- hazir halde olmasini istiyorum."
-- Sorun: handle_new_user her yeni kullaniciya KENDI bos sirketini aciyordu
-- (01.10.2026 karari: yabanci biri Unex'e dusmesin). 26.10'da eklenen
-- operation@unex.com.tr bu yuzden Yetkilendirme'de gorunmuyordu.
-- Karar (AskUserQuestion 27.10.2026):
--  - @unex.com.tr adresleri eklendigi an Unex'e baglanir, rol 'uretim' (ihracat
--    dosyasi verisi GORMEZ), TUM sayfa / sekme yetkileri KAPALI; super admin
--    Yetkilendirme'de rol + yetkileri acip kaydeder.
--  - Diger adresler eskisi gibi kendi bos sirketine duser ve Yetkilendirme'de
--    "Onay bekleyen kullanicilar" listesinde cikar; super admin "Unex'e ekle"
--    demeden hicbir veriye erisemez.
-- Yeni RPC'ler SADECE super admin (sabit e-posta listesi, RLS ile ayni) ve
-- kendi sirketi icin calisir.
-- ============================================================================

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  yeni_company_id uuid;
  v_unex constant uuid := '387edff1-3aa6-41a4-a370-e42135017043';
begin
  -- 27.10.2026: @unex.com.tr -> Unex sirketi, yetkiler KAPALI (super admin acar)
  if lower(coalesce(new.email, '')) like '%@unex.com.tr' and exists (select 1 from public.companies where id = v_unex) then
    insert into public.kullanici_rolleri (user_id, rol, company_id)
    values (new.id, 'uretim', v_unex)
    on conflict (user_id) do nothing;
    insert into public.kullanici_yetkileri (user_id, email, company_id, sayfa_yetkileri, sekme_yetkileri)
    values (new.id, new.email, v_unex, '{}'::jsonb, '{}'::jsonb)
    on conflict (user_id) do nothing;
    return new;
  end if;

  -- Diger adresler: kullaniciya ait yeni tek-kisilik sirket (01.10.2026 karari, aynen)
  insert into public.companies (company_name)
  values (new.email)
  returning id into yeni_company_id;

  insert into public.kullanici_rolleri (user_id, rol, company_id)
  values (new.id, 'admin', yeni_company_id)
  on conflict (user_id) do nothing;

  insert into public.kullanici_yetkileri (user_id, email, company_id, sayfa_yetkileri, sekme_yetkileri)
  values (
    new.id,
    new.email,
    yeni_company_id,
    '{"panel":true,"analiz":true,"kantar":true,"ayarlar":true,"dashboard":true,"ihracatlar":true,"yeni_dosya":true,"etd_eta":true}'::jsonb,
    '{"evraklar":true,"proforma":true,"rezervasyon":true,"konteynerler":true}'::jsonb
  )
  on conflict (user_id) do nothing;

  return new;
exception
  when others then
    -- Trigger hatasi kayit akisini ASLA kirmasin; sadece logla, kullanici yine olussun.
    raise warning 'handle_new_user hata: %', sqlerrm;
    return new;
end;
$function$;

-- Super admin + sirket kontrolu (RLS'teki sabit liste ile ayni)
create or replace function public.yetki_super_admin_sirketi()
 returns uuid
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := get_auth_company_id();
begin
  if auth.uid() is null or v_sirket is null
     or lower(coalesce(auth.jwt() ->> 'email', '')) not in ('volkandurgut.tr@gmail.com', 'bbt@unex.com.tr') then
    raise exception 'Bu işlem için yetkiniz yok.' using errcode = '42501';
  end if;
  return v_sirket;
end; $function$;

-- Sirketin kullanicilari: rol + kayit / son giris tarihi (Yetkilendirme listesi)
create or replace function public.yetki_kullanici_listesi()
 returns table (user_id uuid, email text, rol text, olusturma timestamptz, son_giris timestamptz,
                sayfa_yetkileri jsonb, sekme_yetkileri jsonb)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
begin
  return query
    select kr.user_id, coalesce(ky.email, u.email)::text, kr.rol, u.created_at, u.last_sign_in_at,
           coalesce(ky.sayfa_yetkileri, '{}'::jsonb), coalesce(ky.sekme_yetkileri, '{}'::jsonb)
    from public.kullanici_rolleri kr
    join auth.users u on u.id = kr.user_id
    left join public.kullanici_yetkileri ky on ky.user_id = kr.user_id
    where kr.company_id = v_sirket
    order by u.created_at;
end; $function$;

-- Onay bekleyen: kendi bos (tek kisilik, dosyasiz) sirketindeki kullanicilar
create or replace function public.yetki_bekleyen_kullanicilar()
 returns table (user_id uuid, email text, olusturma timestamptz, son_giris timestamptz)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
begin
  return query
    select u.id, u.email::text, u.created_at, u.last_sign_in_at
    from auth.users u
    join public.kullanici_rolleri kr on kr.user_id = u.id
    join public.companies c on c.id = kr.company_id
    where kr.company_id <> v_sirket
      and c.company_name = u.email
      and (select count(*) from public.kullanici_rolleri x where x.company_id = c.id) = 1
      and not exists (select 1 from public.ihracat_dosyalari d where d.company_id = c.id)
    order by u.created_at desc;
end; $function$;

-- Bekleyen kullaniciyi sirkete al (yetkiler KAPALI baslar)
create or replace function public.yetki_kullanici_ekle(p_user_id uuid, p_rol text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
  v_email text;
begin
  if p_rol not in ('admin', 'ihracat', 'muhasebe', 'sevkiyat', 'kantar', 'uretim') then
    raise exception 'Geçersiz rol.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.yetki_bekleyen_kullanicilar() b where b.user_id = p_user_id) then
    raise exception 'Kullanıcı onay bekleyenler arasında değil.' using errcode = 'P0002';
  end if;
  select u.email into v_email from auth.users u where u.id = p_user_id;
  update public.kullanici_rolleri set company_id = v_sirket, rol = p_rol where user_id = p_user_id;
  insert into public.kullanici_yetkileri (user_id, email, company_id, sayfa_yetkileri, sekme_yetkileri)
  values (p_user_id, v_email, v_sirket, '{}'::jsonb, '{}'::jsonb)
  on conflict (user_id) do update
    set company_id = v_sirket, email = coalesce(public.kullanici_yetkileri.email, excluded.email),
        sayfa_yetkileri = '{}'::jsonb, sekme_yetkileri = '{}'::jsonb, updated_at = now();
end; $function$;

-- Rol degistir (ayni sirket). Kendi rolunu degistiremez (kazara kilitlenmesin).
create or replace function public.yetki_rol_ata(p_user_id uuid, p_rol text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
begin
  if p_rol not in ('admin', 'ihracat', 'muhasebe', 'sevkiyat', 'kantar', 'uretim') then
    raise exception 'Geçersiz rol.' using errcode = '22023';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Kendi rolünüzü değiştiremezsiniz.' using errcode = '23514';
  end if;
  update public.kullanici_rolleri set rol = p_rol where user_id = p_user_id and company_id = v_sirket;
  if not found then
    raise exception 'Kullanıcı bulunamadı.' using errcode = 'P0002';
  end if;
end; $function$;

revoke all on function public.yetki_super_admin_sirketi() from public, anon, authenticated;
revoke all on function public.yetki_kullanici_listesi() from public, anon;
revoke all on function public.yetki_bekleyen_kullanicilar() from public, anon;
revoke all on function public.yetki_kullanici_ekle(uuid, text) from public, anon;
revoke all on function public.yetki_rol_ata(uuid, text) from public, anon;
grant execute on function public.yetki_kullanici_listesi(), public.yetki_bekleyen_kullanicilar(),
  public.yetki_kullanici_ekle(uuid, text), public.yetki_rol_ata(uuid, text) to authenticated;
