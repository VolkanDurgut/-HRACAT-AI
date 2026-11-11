-- 11.11.2026: RAPOR ALICILARI (Ayarlar > Rapor Alicilari). Kullanici: "Rapor alicilari ve canli / test secimi
-- Ayarlar'da bir sayfadan yonetilsin." Bugune kadar edge secret'lari (SIPARIS_RAPOR_ALICI, NAVLUN_TABLOSU_ALICI,
-- MUSTERI_OZET_ALICI + *_CANLI) kullaniliyordu; satir varsa edge'ler bu tabloyu okur, yoksa secret'a duser.
-- Okuma / yazma YALNIZ super admin (yetki_super_admin_sirketi) RPC'leriyle; tabloya dogrudan erisim yok.

create table if not exists public.rapor_alicilari (
  company_id uuid not null references public.companies(id) on delete cascade,
  rapor text not null check (rapor in ('siparis', 'navlun', 'musteri_ozet')),
  alicilar text[] not null default '{}' check (coalesce(array_length(alicilar, 1), 0) <= 6),
  canli boolean not null default false,
  guncelleyen text,
  guncelleme timestamptz not null default now(),
  primary key (company_id, rapor)
);
alter table public.rapor_alicilari enable row level security;
revoke all on public.rapor_alicilari from anon, authenticated;

-- Liste: uc rapor her zaman doner (kayit yoksa bos alici, canli = false)
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
    from unnest(array['siparis', 'navlun', 'musteri_ozet']) with ordinality as r(rapor, sira)
    left join public.rapor_alicilari a on a.company_id = v_sirket and a.rapor = r.rapor
    order by r.sira;
end;
$$;

-- Kaydet: adresler kucuk harf + gecerli + tekil, en fazla 6; canli icin en az bir alici sart
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
  if p_rapor not in ('siparis', 'navlun', 'musteri_ozet') then raise exception 'Bilinmeyen rapor.'; end if;
  select array_agg(distinct lower(btrim(x))) filter (where btrim(x) <> '') into v_liste from unnest(coalesce(p_alicilar, '{}')) x;
  v_liste := coalesce(v_liste, '{}');
  select x into v_gecersiz from unnest(v_liste) x where x !~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$' limit 1;
  if v_gecersiz is not null then raise exception 'Geçersiz e-posta: %', v_gecersiz; end if;
  if coalesce(array_length(v_liste, 1), 0) > 6 then raise exception 'En fazla 6 alıcı.'; end if;
  if p_canli and coalesce(array_length(v_liste, 1), 0) = 0 then raise exception 'Canlı rapor için en az bir alıcı gerekli.'; end if;
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
