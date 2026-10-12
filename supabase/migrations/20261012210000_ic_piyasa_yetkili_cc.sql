-- ============================================================================
-- IC PIYASA - UYARI E-POSTALARINA CC (12.10.2026)
-- ============================================================================
-- Kullanici karari: uyari e-postalari (lojistikten cevap yok / bugun
-- cikmayacak) Alici: execution@unex.com.tr, CC: bbt@unex.com.tr.
--  - ic_piyasa_ayarlari.yetkili_cc : virgulle ayrilmis adresler (bosluksuz,
--    uygulama normallestirir), en fazla 5.
--  - ic_bildirimler.cc             : gonderim aninda doldurulur (yalnizca
--    alici = 'yetkili'); edge function "ic-piyasa" Resend'e cc olarak verir.
-- Onceki migration: 20261012200000. Ihracat tablolarina DOKUNMAZ.
-- ============================================================================

alter table public.ic_piyasa_ayarlari add column if not exists yetkili_cc text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ic_piyasa_ayarlari_yetkili_cc_bicim') then
    alter table public.ic_piyasa_ayarlari add constraint ic_piyasa_ayarlari_yetkili_cc_bicim check (
      yetkili_cc is null
      or (yetkili_cc ~ '^[^\s@,]+@[^\s@,]+\.[^\s@,]+(,[^\s@,]+@[^\s@,]+\.[^\s@,]+)*$'
          and array_length(string_to_array(yetkili_cc, ','), 1) <= 5)
    );
  end if;
end $$;

alter table public.ic_bildirimler add column if not exists cc text[];

-- E-posta kuyrugu: yetkili e-postalarina gonderim aninda CC eklenir.
create or replace function public.ic_bildirim_eposta_al(p_limit integer default 20)
 returns setof public.ic_bildirimler
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- 10 dakikadan uzun "gonderiliyor"da kalan (yarida kesilen) tekrar denenebilir
  update public.ic_bildirimler set durum = 'bekliyor'
   where kanal = 'eposta' and durum = 'gonderiliyor' and islem_zamani < now() - interval '10 minutes';
  return query
    update public.ic_bildirimler b set durum = 'gonderiliyor', islem_zamani = now(), deneme = b.deneme + 1,
           cc = case when b.alici = 'yetkili'
                     then (select string_to_array(a.yetkili_cc, ',') from public.ic_piyasa_ayarlari a
                            where a.company_id = b.company_id and a.yetkili_cc is not null)
                     else b.cc end
     where b.id in (select id from public.ic_bildirimler
                     where kanal = 'eposta' and durum = 'bekliyor' and hedef is not null
                     order by olusturma limit greatest(1, least(coalesce(p_limit, 20), 50))
                     for update skip locked)
    returning b.*;
end; $function$;

revoke all on function public.ic_bildirim_eposta_al(integer) from public, anon, authenticated;
grant execute on function public.ic_bildirim_eposta_al(integer) to service_role;

comment on column public.ic_piyasa_ayarlari.yetkili_cc is 'Uyari e-postalarinda CC (virgulle, en fazla 5) (12.10.2026).';
