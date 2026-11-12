-- 12.11.2026: RAPOR ALICILARI - CC + TUM MAIL TURLERI + ADRES DEFTERI.
-- Kullanici: "Rapor alicilari sayfamizi kolay okunabilir ve ayarlanabilir hale getir. Butun raporlar orada gozuksun ve
-- tiklandiginda ALICI - CC ayarlanabilsin. Bizim maillerimiz hizli tiklanabilir olarak orada kayitli olmali."
--  - rapor_alicilari.cc (en fazla 10). Yeni turler: musteri_durum (alici = musterinin kendisi; burada yalniz CC + canli),
--    gunluk_ihracat, diib, vgm, konsimento_hatirlatma, pazar_gorev (alici = ekip; burada yalniz CC), satin_alma.
--    Bu turlerde satir yoksa edge eski secret'larla calisir (davranis degismez).
--  - rapor_adres_defteri: sayfadaki hizli adresler (sirket basina; adresler repoya YAZILMAZ, sayfadan eklenir).
--  - Okuma / yazma yalniz super admin RPC'leriyle (yetki_super_admin_sirketi); tablolara dogrudan erisim yok.

alter table public.rapor_alicilari add column if not exists cc text[] not null default '{}';
alter table public.rapor_alicilari drop constraint if exists rapor_alicilari_cc_check;
alter table public.rapor_alicilari add constraint rapor_alicilari_cc_check check (coalesce(array_length(cc, 1), 0) <= 10);
alter table public.rapor_alicilari drop constraint if exists rapor_alicilari_rapor_check;
alter table public.rapor_alicilari add constraint rapor_alicilari_rapor_check check (rapor in (
  'siparis', 'navlun', 'fatura_onay', 'fatura_dagitim', 'musteri_durum',
  'gunluk_ihracat', 'diib', 'vgm', 'konsimento_hatirlatma', 'pazar_gorev', 'satin_alma'));

create table if not exists public.rapor_adres_defteri (
  company_id uuid not null references public.companies(id) on delete cascade,
  eposta text not null check (eposta ~ '^[^\s@,;<>A-Z]+@[^\s@,;<>A-Z]+\.[^\s@,;<>A-Z]+$'),
  sira integer not null default 100,
  olusturma timestamptz not null default now(),
  primary key (company_id, eposta)
);
alter table public.rapor_adres_defteri enable row level security;
revoke all on public.rapor_adres_defteri from anon, authenticated;

-- Liste: donus tipi degisti (cc + kayitli) -> once dusur
drop function if exists public.rapor_alicilari_liste();
create function public.rapor_alicilari_liste()
returns table (rapor text, alicilar text[], cc text[], canli boolean, kayitli boolean, guncelleyen text, guncelleme timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
begin
  return query
    select r.rapor, coalesce(a.alicilar, '{}'::text[]), coalesce(a.cc, '{}'::text[]), coalesce(a.canli, false), a.rapor is not null,
           a.guncelleyen, a.guncelleme
    from unnest(array['gunluk_ihracat', 'siparis', 'navlun', 'diib', 'vgm', 'konsimento_hatirlatma', 'fatura_onay', 'fatura_dagitim',
                      'pazar_gorev', 'musteri_durum', 'satin_alma']) with ordinality as r(rapor, sira)
    left join public.rapor_alicilari a on a.company_id = v_sirket and a.rapor = r.rapor
    order by r.sira;
end;
$$;

/** Adres listesi temizligi: kucuk harf, bosluksuz, tekil, gecerli. */
create or replace function public.rapor_adres_temizle(p text[], p_ad text)
returns text[]
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v text[];
  v_gecersiz text;
begin
  select array_agg(x order by ilk) into v from (
    select lower(btrim(x)) x, min(o) ilk from unnest(coalesce(p, '{}')) with ordinality u(x, o) where btrim(x) <> '' group by lower(btrim(x))
  ) t;
  v := coalesce(v, '{}');
  select x into v_gecersiz from unnest(v) x where x !~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$' limit 1;
  if v_gecersiz is not null then raise exception 'Geçersiz e-posta (%): %', p_ad, v_gecersiz; end if;
  if coalesce(array_length(v, 1), 0) > 10 then raise exception 'En fazla 10 adres (%).', p_ad; end if;
  return v;
end;
$$;

create or replace function public.rapor_alicilari_kaydet(p_rapor text, p_alicilar text[], p_cc text[], p_canli boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
  v_liste text[];
  v_cc text[];
begin
  if p_rapor not in ('siparis', 'navlun', 'fatura_onay', 'fatura_dagitim', 'musteri_durum',
                     'gunluk_ihracat', 'diib', 'vgm', 'konsimento_hatirlatma', 'pazar_gorev', 'satin_alma') then
    raise exception 'Bilinmeyen rapor.';
  end if;
  v_liste := public.rapor_adres_temizle(p_alicilar, 'Alıcı');
  v_cc := array(select x from unnest(public.rapor_adres_temizle(p_cc, 'CC')) x where not (x = any (v_liste)));
  -- Alicisi raporun kendisinden gelenler: musteri_durum (musteri), pazar_gorev (ekip)
  if p_rapor not in ('musteri_durum', 'pazar_gorev') and coalesce(array_length(v_liste, 1), 0) = 0
     and (p_canli or p_rapor in ('gunluk_ihracat', 'diib', 'vgm', 'konsimento_hatirlatma', 'satin_alma')) then
    raise exception 'En az bir alıcı gerekli.';
  end if;
  insert into public.rapor_alicilari (company_id, rapor, alicilar, cc, canli, guncelleyen, guncelleme)
  values (v_sirket, p_rapor, v_liste, v_cc, coalesce(p_canli, false), lower(coalesce(auth.jwt() ->> 'email', '')), now())
  on conflict (company_id, rapor) do update
    set alicilar = excluded.alicilar, cc = excluded.cc, canli = excluded.canli, guncelleyen = excluded.guncelleyen, guncelleme = now();
end;
$$;

-- Eski 3 parametreli kaydet (yayindaki onceki istemci): CC'ye dokunmaz
create or replace function public.rapor_alicilari_kaydet(p_rapor text, p_alicilar text[], p_canli boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
  v_cc text[];
begin
  select a.cc into v_cc from public.rapor_alicilari a where a.company_id = v_sirket and a.rapor = p_rapor;
  perform public.rapor_alicilari_kaydet(p_rapor, p_alicilar, coalesce(v_cc, '{}'), p_canli);
end;
$$;

-- Adres defteri
create or replace function public.rapor_adres_defteri_liste()
returns table (eposta text)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
begin
  return query select d.eposta from public.rapor_adres_defteri d where d.company_id = v_sirket order by d.sira, d.eposta;
end;
$$;

create or replace function public.rapor_adres_defteri_ekle(p_eposta text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
  v text := lower(btrim(coalesce(p_eposta, '')));
begin
  if v !~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$' then raise exception 'Geçersiz e-posta: %', v; end if;
  if (select count(*) from public.rapor_adres_defteri where company_id = v_sirket) >= 30 then raise exception 'Adres defteri en fazla 30 adres.'; end if;
  insert into public.rapor_adres_defteri (company_id, eposta, sira)
  values (v_sirket, v, coalesce((select max(sira) + 1 from public.rapor_adres_defteri where company_id = v_sirket), 1))
  on conflict (company_id, eposta) do nothing;
end;
$$;

create or replace function public.rapor_adres_defteri_sil(p_eposta text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
begin
  delete from public.rapor_adres_defteri where company_id = v_sirket and eposta = lower(btrim(coalesce(p_eposta, '')));
end;
$$;

revoke all on function public.rapor_alicilari_liste() from public, anon;
revoke all on function public.rapor_alicilari_kaydet(text, text[], text[], boolean) from public, anon;
revoke all on function public.rapor_alicilari_kaydet(text, text[], boolean) from public, anon;
revoke all on function public.rapor_adres_temizle(text[], text) from public, anon;
revoke all on function public.rapor_adres_defteri_liste() from public, anon;
revoke all on function public.rapor_adres_defteri_ekle(text) from public, anon;
revoke all on function public.rapor_adres_defteri_sil(text) from public, anon;
grant execute on function public.rapor_alicilari_liste() to authenticated;
grant execute on function public.rapor_alicilari_kaydet(text, text[], text[], boolean) to authenticated;
grant execute on function public.rapor_alicilari_kaydet(text, text[], boolean) to authenticated;
grant execute on function public.rapor_adres_defteri_liste() to authenticated;
grant execute on function public.rapor_adres_defteri_ekle(text) to authenticated;
grant execute on function public.rapor_adres_defteri_sil(text) to authenticated;
