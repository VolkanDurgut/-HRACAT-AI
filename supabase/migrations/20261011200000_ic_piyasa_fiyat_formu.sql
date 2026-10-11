-- ============================================================================
-- IC PIYASA - YAN MAMUL FIYAT BILGILENDIRME FORMU (11.10.2026)
-- ============================================================================
-- Ihracat tablolarina DOKUNMAZ. Sadece iki yeni tablo + bir sayac ekler.
--
-- ic_fiyat_kalemleri : Yonetim panelindeki GUNCEL fiyat tablosu (Urun, Ambalaj,
--                      Birim Fiyat, Vade, Odeme, Teslim). Satir eklenir,
--                      duzenlenir, silinir.
-- ic_fiyat_formlari  : "Formu Onayla ve Olustur" anindaki DONDURULMUS kopya.
--                      Numara FBF-YYYY-NNNN (ihracattaki IHR-YYYY-NNNN gibi),
--                      gecerlilik = onay tarihi + 3 gun. Onaylanan form
--                      DEGISTIRILEMEZ / SILINEMEZ (UPDATE/DELETE politikasi yok);
--                      degisiklik = yeni form.
-- Guvenlik: banka_presetleri ile ayni model (company_id + auth_company_id()).
-- ============================================================================

create sequence if not exists public.ic_fiyat_formu_sira;

-- ---------------------------------------------------------------------------
-- 1) Guncel fiyat tablosu
-- ---------------------------------------------------------------------------
create table if not exists public.ic_fiyat_kalemleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  sira integer not null default 0,
  urun text not null,
  ambalaj text,
  birim_fiyat numeric(12, 2) check (birim_fiyat is null or birim_fiyat >= 0),
  vade_gun integer check (vade_gun is null or (vade_gun >= 0 and vade_gun <= 365)),
  odeme text,
  teslim text,
  guncelleyen uuid default auth.uid(),
  guncelleme timestamptz not null default now(),
  olusturma timestamptz not null default now()
);

create index if not exists idx_ic_fiyat_kalemleri_company on public.ic_fiyat_kalemleri (company_id, sira);

alter table public.ic_fiyat_kalemleri enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Onaylanmis formlar (arsiv)
-- ---------------------------------------------------------------------------
create table if not exists public.ic_fiyat_formlari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  form_no text unique,
  alici text,
  onay_zamani timestamptz not null default now(),
  gecerlilik_bitis date,
  kalemler jsonb not null check (jsonb_typeof(kalemler) = 'array' and jsonb_array_length(kalemler) > 0),
  olusturan uuid default auth.uid(),
  olusturan_email text,
  olusturma timestamptz not null default now()
);

create index if not exists idx_ic_fiyat_formlari_company on public.ic_fiyat_formlari (company_id, onay_zamani desc);

alter table public.ic_fiyat_formlari enable row level security;

-- Numara + gecerlilik SUNUCUDA verilir (istemci ne gonderirse gondersin).
-- Onay zamani her zaman sunucu saati; gecerlilik Turkiye takvimine gore
-- onay gunu + 3 gun (orn. 12.10.2026 onay -> 15.10.2026'ya kadar gecerli).
create or replace function public.ic_fiyat_formu_hazirla()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  tr_gun date;
begin
  -- Numara verilmeden ONCE dogrula: kontrol kisiti ve RLS, BEFORE
  -- tetikleyiciden SONRA calistigi icin reddedilecek bir kayit sayaci
  -- bosuna ilerletip numarada bosluk birakirdi (FBF-...-0003 hic olmazdi).
  if new.kalemler is null or jsonb_typeof(new.kalemler) <> 'array' or jsonb_array_length(new.kalemler) = 0 then
    raise exception 'Form en az bir urun satiri icermeli.' using errcode = '23514';
  end if;
  if auth.uid() is not null and new.company_id is distinct from auth_company_id() then
    raise exception 'Bu sirket icin form olusturma yetkiniz yok.' using errcode = '42501';
  end if;
  new.onay_zamani := now();
  new.olusturma := now();
  new.olusturan := auth.uid();
  tr_gun := (now() at time zone 'Europe/Istanbul')::date;
  new.gecerlilik_bitis := tr_gun + 3;
  new.form_no := 'FBF-' || extract(year from tr_gun)::text || '-'
    || lpad(pg_catalog.nextval('public.ic_fiyat_formu_sira'::regclass)::text, 4, '0');
  return new;
end; $function$;

drop trigger if exists ic_fiyat_formu_hazirla on public.ic_fiyat_formlari;
create trigger ic_fiyat_formu_hazirla
  before insert on public.ic_fiyat_formlari
  for each row execute function public.ic_fiyat_formu_hazirla();

-- Guncelleme zamani
create or replace function public.ic_fiyat_kalemi_guncellendi()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  new.guncelleme := now();
  new.guncelleyen := auth.uid();
  return new;
end; $function$;

drop trigger if exists ic_fiyat_kalemi_guncellendi on public.ic_fiyat_kalemleri;
create trigger ic_fiyat_kalemi_guncellendi
  before update on public.ic_fiyat_kalemleri
  for each row execute function public.ic_fiyat_kalemi_guncellendi();

-- ---------------------------------------------------------------------------
-- 3) RLS politikalari
-- ---------------------------------------------------------------------------
do $$
begin
  -- Guncel fiyat tablosu: kendi sirketi icin okuma/ekleme/guncelleme/silme
  if not exists (select 1 from pg_policies where tablename = 'ic_fiyat_kalemleri' and policyname = 'ic_fiyat_kalemleri_select_own_company') then
    create policy ic_fiyat_kalemleri_select_own_company on public.ic_fiyat_kalemleri
      for select using (company_id = auth_company_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ic_fiyat_kalemleri' and policyname = 'ic_fiyat_kalemleri_insert_own_company') then
    create policy ic_fiyat_kalemleri_insert_own_company on public.ic_fiyat_kalemleri
      for insert with check (company_id = auth_company_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ic_fiyat_kalemleri' and policyname = 'ic_fiyat_kalemleri_update_own_company') then
    create policy ic_fiyat_kalemleri_update_own_company on public.ic_fiyat_kalemleri
      for update using (company_id = auth_company_id()) with check (company_id = auth_company_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ic_fiyat_kalemleri' and policyname = 'ic_fiyat_kalemleri_delete_own_company') then
    create policy ic_fiyat_kalemleri_delete_own_company on public.ic_fiyat_kalemleri
      for delete using (company_id = auth_company_id());
  end if;

  -- Onayli formlar: sadece okuma + ekleme (degistirme/silme YOK)
  if not exists (select 1 from pg_policies where tablename = 'ic_fiyat_formlari' and policyname = 'ic_fiyat_formlari_select_own_company') then
    create policy ic_fiyat_formlari_select_own_company on public.ic_fiyat_formlari
      for select using (company_id = auth_company_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ic_fiyat_formlari' and policyname = 'ic_fiyat_formlari_insert_own_company') then
    create policy ic_fiyat_formlari_insert_own_company on public.ic_fiyat_formlari
      for insert with check (company_id = auth_company_id());
  end if;
end $$;

-- Supabase yeni tablolara varsayilan olarak anon/authenticated'a TUM yetkileri
-- (TRUNCATE dahil - TRUNCATE RLS'i ATLAR) verir. Once hepsi kaldirilir, sonra
-- sadece gerekenler verilir; boylece onayli formlar gercekten silinemez.
revoke all on table public.ic_fiyat_kalemleri from anon, authenticated, public;
revoke all on table public.ic_fiyat_formlari from anon, authenticated, public;
revoke all on sequence public.ic_fiyat_formu_sira from anon, authenticated, public;
grant select, insert, update, delete on table public.ic_fiyat_kalemleri to authenticated;
grant select, insert on table public.ic_fiyat_formlari to authenticated;
grant usage on sequence public.ic_fiyat_formu_sira to authenticated;
grant all on table public.ic_fiyat_kalemleri to service_role;
grant all on table public.ic_fiyat_formlari to service_role;

comment on table public.ic_fiyat_kalemleri is 'Ic piyasa yan mamul fiyat formu - yonetim panelindeki guncel fiyat tablosu (11.10.2026).';
comment on table public.ic_fiyat_formlari is 'Ic piyasa onaylanmis fiyat bilgilendirme formlari (FBF-YYYY-NNNN, gecerlilik onay+3 gun). Degistirilemez.';
