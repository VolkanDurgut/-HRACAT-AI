-- NAVLUN FORMU (Dalga 4.2) - 10.11.2026
-- Kullanici: "Navlun formu olustur. Alici bbt- execution- export- export2- operation. Ilk etapta test maili sensei
-- adresine gonderilecek." + "Bugune kadar uygulanan stratejiyi cozmeye calis" (hat bazinda navlun analizi).
-- Gecmis (Ocak-Kasim) bookinglerin konteyner basi navlun / lokal masrafi GIRISSIZ formdan (/navlun/<token>) girilir.
-- Formdaki oneri: ayni TASIYICI + LIMAN icin zamanca en yakin bilinen fiyat; yoksa ayni limanin fiyati.
-- Dosyadan gelen tutarlar (navlun_kaynak = 'dosya') formda GOSTERILMEZ ve EZILMEZ (kaynak dosyadir).
-- Erisim: yalniz servis (edge "navlun-formu"); istemciye tablo / fonksiyon KAPALI.

create table if not exists public.navlun_formlari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  test boolean not null default false,
  durum text not null default 'olusturuldu' check (durum in ('olusturuldu', 'gonderildi', 'hata')),
  alicilar text[],
  mesaj_id text,
  hata text,
  son_gecerlilik timestamptz not null default now() + interval '30 days',
  olusturma timestamptz not null default now()
);
alter table public.navlun_formlari enable row level security;
revoke all on public.navlun_formlari from anon, authenticated;

-- Hat anahtarlari (yalniz eslestirme icin; kayit degismez)
create or replace function public.navlun_liman_anahtar(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(split_part(btrim(regexp_replace(upper(translate(coalesce(p, ''), 'İıŞşĞğÜüÖöÇç', 'IISSGGUUOOCC')), '[^A-Z ]+', ' ', 'g')), ' ', 1), '')
$$;
create or replace function public.navlun_tasiyici_anahtar(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(replace(split_part(btrim(regexp_replace(upper(translate(
    regexp_replace(coalesce(p, ''), '^.*/', ''), 'İıŞşĞğÜüÖöÇç', 'IISSGGUUOOCC')), '[^A-Z ]+', ' ', 'g')), ' ', 1), 'MAAERSK', 'MAERSK'), '')
$$;

create or replace function public.navlun_form_bilgi(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  f public.navlun_formlari%rowtype;
begin
  select * into f from public.navlun_formlari where token = p_token and son_gecerlilik > now();
  if not found then return null; end if;
  return jsonb_build_object(
    'form', jsonb_build_object('olusturma', f.olusturma, 'son_gecerlilik', f.son_gecerlilik, 'test', f.test),
    'satirlar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'hafta', s.hafta, 'etd', s.etd, 'musteri', s.musteri, 'liman', s.varis_limani, 'acente', s.acente,
        'konteyner', s.konteyner, 'booking', s.booking_no, 'gemi', s.gemi,
        'navlun', s.navlun_kont, 'lokal', s.lokal_kont, 'giren', s.navlun_giren, 'tarih', s.navlun_tarihi,
        'oneri', o.oneri) order by s.etd nulls last, s.hafta, s.musteri)
      from public.sevkiyat_plani s
      left join lateral (
        select jsonb_build_object('navlun', k.navlun_kont, 'lokal', k.lokal_kont, 'acente', k.acente, 'etd', k.etd,
                                  'tur', case when public.navlun_tasiyici_anahtar(k.acente) = public.navlun_tasiyici_anahtar(s.acente) then 'hat' else 'liman' end) oneri
        from public.sevkiyat_plani k
        where k.company_id = s.company_id and k.id <> s.id and k.navlun_kont is not null
          and public.navlun_liman_anahtar(k.varis_limani) = public.navlun_liman_anahtar(s.varis_limani)
        order by (public.navlun_tasiyici_anahtar(k.acente) = public.navlun_tasiyici_anahtar(s.acente)) desc,
                 abs(coalesce(k.etd, current_date) - coalesce(s.etd, current_date))
        limit 1
      ) o on true
      where s.company_id = f.company_id
        and coalesce(s.navlun_kaynak, 'form') <> 'dosya'
        and (s.etd is null or s.etd <= current_date)
    ), '[]'::jsonb)
  );
end; $$;

create or replace function public.navlun_form_kaydet(p_token text, p_id uuid, p_navlun numeric, p_lokal numeric, p_giren text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f public.navlun_formlari%rowtype;
  s public.sevkiyat_plani%rowtype;
begin
  select * into f from public.navlun_formlari where token = p_token and son_gecerlilik > now();
  if not found then raise exception 'Bu bağlantı geçersiz ya da süresi doldu.' using errcode = 'P0002'; end if;
  select * into s from public.sevkiyat_plani where id = p_id and company_id = f.company_id for update;
  if not found then raise exception 'Satır bulunamadı.' using errcode = 'P0002'; end if;
  if s.navlun_kaynak = 'dosya' then raise exception 'Bu sevkiyatın navlunu dosyadan gelir; dosyada değiştirin.' using errcode = '22023'; end if;
  if (p_navlun is not null and (p_navlun < 0 or p_navlun > 50000)) or (p_lokal is not null and (p_lokal < 0 or p_lokal > 50000)) then
    raise exception 'Tutar 0 ile 50.000 USD arasında olmalı.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_giren, ''))) < 2 then raise exception 'Adınızı yazın.' using errcode = '22023'; end if;
  update public.sevkiyat_plani set
    navlun_kont = p_navlun, lokal_kont = p_lokal,
    navlun_kaynak = case when p_navlun is null and p_lokal is null then null else 'form' end,
    navlun_giren = left(btrim(p_giren), 80), navlun_tarihi = now(), updated_at = now()
  where id = s.id;
  return jsonb_build_object('id', s.id, 'navlun', p_navlun, 'lokal', p_lokal);
end; $$;

revoke all on function public.navlun_form_bilgi(text) from public, anon, authenticated;
revoke all on function public.navlun_form_kaydet(text, uuid, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.navlun_form_bilgi(text) to service_role;
grant execute on function public.navlun_form_kaydet(text, uuid, numeric, numeric, text) to service_role;
