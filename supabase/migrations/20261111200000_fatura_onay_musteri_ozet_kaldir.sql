-- 11.11.2026 (aksam)
-- 1) FATURA TALIMATI ONAYI. Kullanici: "Butun konteynerler yuklendiginde fatura talimati operation / execution /
--    export / export2 / bbt adresine onaya gonderilmeli. Onay veya revize butonlari olmali. Onaylanirsa onaylanmis
--    fatura talimati muhasebe dahil dagitim listesine mail gitmeli."
--    - fatura_talimati_onaylari: her onaya gonderim bir satir (durum bekliyor -> onaylandi | revize). Yazma YALNIZ edge
--      fatura-onay (service_role); sirket kullanicilari okur (dosya sayfasi + /fatura-onay).
--    - fatura_onay_adaylari(): acik, fatura talimati gonderilmemis, rezervasyondaki konteynerlerin HEPSI girilmis
--      dosyalar (lib/fatura-talimati-durum.ts "tam" kurali). YALNIZ service_role.
--    - Alicilar: rapor_alicilari'na iki liste: fatura_onay (onaylayanlar) ve fatura_dagitim (onaylaninca). Liste
--      basina en fazla 10 adres.
--    - pg_cron 'fatura-onay-tara' her 10 dakikada edge fatura-onay'i cagirir.
-- 2) MUSTERI OZETI RAPORU KALDIRILDI. Kullanici: "Musteri raporunu komple kaldiralim." (cron, RPC, gonderim tablosu)
-- 3) NAVLUN POL: yalniz Ambarli / Asyaport (kullanici: "Biz sadece Ambarli ve Asyaport ile calisiyoruz"). Okuyucu
--    eskiden POL'e yanlis deger yaziyordu (ornegin varis limani); duzeltilir.

-- ---------------------------------------------------------------------------------------------------------------
-- 1) Fatura talimati onayi
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.fatura_talimati_onaylari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dosya_id uuid not null references public.ihracat_dosyalari(id) on delete cascade,
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'onaylandi', 'revize')),
  -- test: Ayarlar > Rapor Alicilari'nda liste canli degilken mailler yalniz test adresine gider
  test boolean not null default true,
  kaynak text not null default 'otomatik' check (kaynak in ('otomatik', 'elle')),
  gonderen text,
  -- onaylayabilecekler (ayardaki liste) ve onay mailinin gercekten gittigi adresler (testte test adresi)
  onay_alicilari text[] not null default '{}',
  gonderilen text[] not null default '{}',
  karar_veren text,
  karar_zamani timestamptz,
  revize_notu text check (revize_notu is null or char_length(revize_notu) <= 1000),
  dagitim_konusu text,
  dagitim_alicilari text[],
  olusturma timestamptz not null default now()
);
create index if not exists fatura_talimati_onaylari_dosya_idx on public.fatura_talimati_onaylari (dosya_id, olusturma desc);
-- Bir dosyanin ayni modda (test / canli) tek bekleyen onayi olur (cron yarisi ve cift tik korumasi)
create unique index if not exists fatura_talimati_onaylari_bekleyen_uniq
  on public.fatura_talimati_onaylari (dosya_id, test) where durum = 'bekliyor';

alter table public.fatura_talimati_onaylari enable row level security;
revoke all on public.fatura_talimati_onaylari from anon, authenticated;
grant select on public.fatura_talimati_onaylari to authenticated;
drop policy if exists fatura_talimati_onaylari_oku on public.fatura_talimati_onaylari;
create policy fatura_talimati_onaylari_oku on public.fatura_talimati_onaylari
  for select to authenticated using (company_id = public.get_auth_company_id());

create or replace function public.fatura_onay_adaylari()
returns table (dosya_id uuid, company_id uuid, test_kaydi boolean, canli_kaydi boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select d.id, d.company_id,
    exists (select 1 from public.fatura_talimati_onaylari o where o.dosya_id = d.id and o.test),
    exists (select 1 from public.fatura_talimati_onaylari o where o.dosya_id = d.id and not o.test)
  from public.ihracat_dosyalari d
  join (select r.dosya_id, sum(coalesce(r.konteyner_adedi, 0)) as rk from public.rezervasyonlar r group by r.dosya_id) r on r.dosya_id = d.id
  join (select k.dosya_id, count(*) as kk from public.konteynerler k group by k.dosya_id) k on k.dosya_id = d.id
  where d.durum in ('Açık', 'Acik')
    and coalesce(d.fatura_talimati_gonderildi, false) = false
    and r.rk > 0 and k.kk = r.rk
  order by d.id;
$$;
revoke all on function public.fatura_onay_adaylari() from public, anon, authenticated;
grant execute on function public.fatura_onay_adaylari() to service_role;

-- rapor_alicilari: iki yeni liste, liste basina 10 adres; musteri_ozet cikar
delete from public.rapor_alicilari where rapor = 'musteri_ozet';
alter table public.rapor_alicilari drop constraint if exists rapor_alicilari_rapor_check;
alter table public.rapor_alicilari drop constraint if exists rapor_alicilari_alicilar_check;
alter table public.rapor_alicilari add constraint rapor_alicilari_rapor_check
  check (rapor in ('siparis', 'navlun', 'fatura_onay', 'fatura_dagitim'));
alter table public.rapor_alicilari add constraint rapor_alicilari_alicilar_check
  check (coalesce(array_length(alicilar, 1), 0) <= 10);

create or replace function public.rapor_alicilari_liste()
returns table (rapor text, alicilar text[], canli boolean, guncelleyen text, guncelleme timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
begin
  return query
    select r.rapor, coalesce(a.alicilar, '{}'::text[]), coalesce(a.canli, false), a.guncelleyen, a.guncelleme
    from unnest(array['siparis', 'navlun', 'fatura_onay', 'fatura_dagitim']) with ordinality as r(rapor, sira)
    left join public.rapor_alicilari a on a.company_id = v_sirket and a.rapor = r.rapor
    order by r.sira;
end;
$$;

create or replace function public.rapor_alicilari_kaydet(p_rapor text, p_alicilar text[], p_canli boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
  v_liste text[];
  v_gecersiz text;
begin
  if p_rapor not in ('siparis', 'navlun', 'fatura_onay', 'fatura_dagitim') then raise exception 'Bilinmeyen rapor.'; end if;
  select array_agg(distinct lower(btrim(x))) filter (where btrim(x) <> '') into v_liste from unnest(coalesce(p_alicilar, '{}')) x;
  v_liste := coalesce(v_liste, '{}');
  select x into v_gecersiz from unnest(v_liste) x where x !~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$' limit 1;
  if v_gecersiz is not null then raise exception 'Geçersiz e-posta: %', v_gecersiz; end if;
  if coalesce(array_length(v_liste, 1), 0) > 10 then raise exception 'En fazla 10 alıcı.'; end if;
  if p_canli and coalesce(array_length(v_liste, 1), 0) = 0 then raise exception 'Canlı için en az bir alıcı gerekli.'; end if;
  insert into public.rapor_alicilari (company_id, rapor, alicilar, canli, guncelleyen, guncelleme)
  values (v_sirket, p_rapor, v_liste, coalesce(p_canli, false), lower(coalesce(auth.jwt() ->> 'email', '')), now())
  on conflict (company_id, rapor) do update
    set alicilar = excluded.alicilar, canli = excluded.canli, guncelleyen = excluded.guncelleyen, guncelleme = now();
end;
$$;
revoke all on function public.rapor_alicilari_liste() from public, anon;
revoke all on function public.rapor_alicilari_kaydet(text, text[], boolean) from public, anon;
grant execute on function public.rapor_alicilari_liste() to authenticated;
grant execute on function public.rapor_alicilari_kaydet(text, text[], boolean) to authenticated;

-- pg_cron: her 10 dakikada aday tarama (komut, mevcut bir isin komutundan turetilir; anahtar repoya yazilmaz)
do $$
declare
  v_komut text;
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron yok; zamanlanmadi.';
    return;
  end if;
  select command into v_komut from cron.job where jobname = 'vgm-rapor' limit 1;
  if v_komut is null or position('/functions/v1/vgm-rapor''' in v_komut) = 0 then
    raise notice 'vgm-rapor komutu bulunamadi; fatura-onay-tara zamanlanmadi.';
    return;
  end if;
  perform cron.unschedule(j.jobname) from cron.job j where j.jobname = 'fatura-onay-tara';
  perform cron.schedule('fatura-onay-tara', '*/10 * * * *', replace(v_komut, '/functions/v1/vgm-rapor''', '/functions/v1/fatura-onay'''));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2) Musteri ozeti raporu kaldirildi
-- ---------------------------------------------------------------------------------------------------------------
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.unschedule(j.jobname) from cron.job j where j.jobname = 'musteri-ozet-rapor';
  end if;
end;
$$;
drop function if exists public.musteri_ozet_veri(uuid);
drop table if exists public.musteri_ozet_gonderimleri;

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Navlun POL: yalniz AMBARLI / ASYAPORT
-- ---------------------------------------------------------------------------------------------------------------
update public.navlun_teklifleri
set pol = case
  when upper(pol) ~ 'ASYA ?PORT|TEKIRDA' then 'ASYAPORT'
  when upper(pol) ~ 'AMBARL' then 'AMBARLI'
  else null end
where pol is not null and pol not in ('AMBARLI', 'ASYAPORT');
