-- ============================================================================
-- IC PIYASA - GEMI TAHLIYE (25.11.2026)
-- ============================================================================
-- Kullanici: "Bu gemi su an yanasta ... araclar kantarda tartilacak fakat gemiden satista olabilir. Araclar tartildikca
-- paylastigim sablonun (gemi raporu: TARIH / PLAKA / LIMAN / TESLIM / FARK / GITTIGI YER) otomatik olusmasini istiyorum.
-- Satis ekleme kismi: firma ismi ve tonaji yazilir." Kararlar (AskUserQuestion 25.11.2026):
--   - Yer: Ic Piyasa > Gemi Tahliye (ayri sekme). Mevcut alis / is emri tablolarina DOKUNULMAZ, stok raporlarina yansimaz.
--   - Bize (UNEX depo) gelen araci KANTARCI girer: liman fisindeki kg + kendi tartimimiz (teslim kg) -> fark.
--   - Gemiden satis araclari (alici firmaya gider, bize gelmez): yalniz liman kg; ofis liman listesini toplu yapistirir
--     (kantarci da tek tek girebilir).
--   - Rapor ekranda canli + Excel; mail yok.
-- Yazma: gemi ve alicilar RLS (ic_piyasa); araclar YALNIZ fonksiyonlarla (security definer).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Gemiler
-- ---------------------------------------------------------------------------
create table if not exists public.ic_gemi_tahliyeleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  gemi_adi text not null check (char_length(btrim(gemi_adi)) between 2 and 80),
  satici text check (satici is null or char_length(satici) <= 200),
  tahliye_limani text check (tahliye_limani is null or char_length(tahliye_limani) <= 80),
  urun text not null default 'Buğday' check (btrim(urun) <> '' and char_length(urun) <= 80),
  kalite text check (kalite is null or char_length(kalite) <= 80),
  -- Raporun "SIPARIS MIKTARI" (anlasma / B/L tonaji)
  bl_kg numeric(14, 2) not null check (bl_kg > 0 and bl_kg <= 200000000),
  baslangic date,
  durum text not null default 'acik' check (durum in ('acik', 'tamamlandi')),
  kapanis_zamani timestamptz,
  notlar text check (notlar is null or char_length(notlar) <= 500),
  olusturan uuid default auth.uid(),
  olusturan_email text,
  olusturma timestamptz not null default now(),
  guncelleme timestamptz not null default now()
);
create unique index if not exists uq_ic_gemi_acik_ad on public.ic_gemi_tahliyeleri (company_id, upper(gemi_adi)) where durum = 'acik';
create index if not exists idx_ic_gemi_sirket on public.ic_gemi_tahliyeleri (company_id, durum, olusturma desc);
alter table public.ic_gemi_tahliyeleri enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Gemiden satislar (alici firma + tonaj)
-- ---------------------------------------------------------------------------
create table if not exists public.ic_gemi_alicilari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  gemi_id uuid not null references public.ic_gemi_tahliyeleri(id) on delete cascade,
  firma text not null check (char_length(btrim(firma)) between 2 and 120),
  miktar_kg numeric(14, 2) not null check (miktar_kg > 0 and miktar_kg <= 200000000),
  notlar text check (notlar is null or char_length(notlar) <= 300),
  olusturan_email text,
  olusturma timestamptz not null default now(),
  guncelleme timestamptz not null default now()
);
create unique index if not exists uq_ic_gemi_alici_firma on public.ic_gemi_alicilari (gemi_id, upper(btrim(firma)));
create index if not exists idx_ic_gemi_alici_gemi on public.ic_gemi_alicilari (gemi_id);
alter table public.ic_gemi_alicilari enable row level security;

-- ---------------------------------------------------------------------------
-- 3) Araclar (alici_id NULL = UNEX depo: liman + teslim; dolu = gemiden satis: yalniz liman)
-- ---------------------------------------------------------------------------
create table if not exists public.ic_gemi_araclari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  gemi_id uuid not null references public.ic_gemi_tahliyeleri(id) on delete restrict,
  alici_id uuid references public.ic_gemi_alicilari(id) on delete restrict,
  tarih date not null,
  plaka text not null check (plaka ~ '^[A-Z0-9 ]{4,14}$'),
  liman_kg numeric(12, 2) not null check (liman_kg > 0 and liman_kg <= 60000),
  teslim_kg numeric(12, 2) check (teslim_kg is null or (teslim_kg > 0 and teslim_kg <= 60000)),
  kaynak text not null default 'kantar' check (kaynak in ('kantar', 'ofis')),
  uyarilar text[] not null default '{}',
  notlar text check (notlar is null or char_length(notlar) <= 300),
  girilen uuid default auth.uid(),
  girilen_email text,
  olusturma timestamptz not null default now(),
  -- UNEX'e gelen aracta teslim (kendi kantarimiz) ZORUNLU; satis aracinda teslim YOK
  constraint ic_gemi_arac_teslim check ((alici_id is null) = (teslim_kg is not null))
);
create index if not exists idx_ic_gemi_arac_gemi on public.ic_gemi_araclari (gemi_id, tarih, olusturma);
create index if not exists idx_ic_gemi_arac_alici on public.ic_gemi_araclari (alici_id);
alter table public.ic_gemi_araclari enable row level security;

-- ---------------------------------------------------------------------------
-- 4) Tetikleyiciler
-- ---------------------------------------------------------------------------
create or replace function public.ic_gemi_hazirla()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  new.gemi_adi := upper(regexp_replace(btrim(new.gemi_adi), '\s+', ' ', 'g'));
  new.satici := nullif(btrim(coalesce(new.satici, '')), '');
  new.tahliye_limani := nullif(btrim(coalesce(new.tahliye_limani, '')), '');
  new.kalite := nullif(btrim(coalesce(new.kalite, '')), '');
  new.urun := btrim(new.urun);
  if tg_op = 'INSERT' then
    new.olusturan_email := lower(nullif(auth.jwt() ->> 'email', ''));
  end if;
  if new.durum = 'tamamlandi' and (tg_op = 'INSERT' or old.durum is distinct from 'tamamlandi') then
    new.kapanis_zamani := now();
  elsif new.durum = 'acik' then
    new.kapanis_zamani := null;
  end if;
  new.guncelleme := now();
  return new;
end; $function$;

create or replace function public.ic_gemi_alici_hazirla()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  new.firma := upper(regexp_replace(btrim(new.firma), '\s+', ' ', 'g'));
  if tg_op = 'INSERT' then
    new.olusturan_email := lower(nullif(auth.jwt() ->> 'email', ''));
  elsif new.gemi_id <> old.gemi_id then
    raise exception 'Satış başka gemiye taşınamaz.' using errcode = '23514';
  end if;
  -- Gemi ayni sirketten olmali
  if not exists (select 1 from public.ic_gemi_tahliyeleri g where g.id = new.gemi_id and g.company_id = new.company_id) then
    raise exception 'Gemi bulunamadı.' using errcode = 'P0002';
  end if;
  new.guncelleme := now();
  return new;
end; $function$;

drop trigger if exists ic_gemi_hazirla on public.ic_gemi_tahliyeleri;
create trigger ic_gemi_hazirla before insert or update on public.ic_gemi_tahliyeleri
  for each row execute function public.ic_gemi_hazirla();
drop trigger if exists ic_gemi_alici_hazirla on public.ic_gemi_alicilari;
create trigger ic_gemi_alici_hazirla before insert or update on public.ic_gemi_alicilari
  for each row execute function public.ic_gemi_alici_hazirla();

drop trigger if exists denetim_ic_gemi_tahliyeleri on public.ic_gemi_tahliyeleri;
create trigger denetim_ic_gemi_tahliyeleri after insert or update or delete on public.ic_gemi_tahliyeleri
  for each row execute function denetim_tetikleyici();
drop trigger if exists denetim_ic_gemi_alicilari on public.ic_gemi_alicilari;
create trigger denetim_ic_gemi_alicilari after insert or update or delete on public.ic_gemi_alicilari
  for each row execute function denetim_tetikleyici();
drop trigger if exists denetim_ic_gemi_araclari on public.ic_gemi_araclari;
create trigger denetim_ic_gemi_araclari after insert or update or delete on public.ic_gemi_araclari
  for each row execute function denetim_tetikleyici();

-- ---------------------------------------------------------------------------
-- 5) Yetkiler / RLS
-- ---------------------------------------------------------------------------
revoke all on table public.ic_gemi_tahliyeleri from anon;
revoke all on table public.ic_gemi_alicilari from anon;
revoke all on table public.ic_gemi_araclari from anon;
revoke truncate, references, trigger on table public.ic_gemi_tahliyeleri from authenticated;
revoke truncate, references, trigger on table public.ic_gemi_alicilari from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.ic_gemi_araclari from authenticated;
grant select, insert, update, delete on table public.ic_gemi_tahliyeleri to authenticated;
grant select, insert, update, delete on table public.ic_gemi_alicilari to authenticated;
grant select on table public.ic_gemi_araclari to authenticated;

drop policy if exists ic_gemi_select on public.ic_gemi_tahliyeleri;
create policy ic_gemi_select on public.ic_gemi_tahliyeleri for select
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
drop policy if exists ic_gemi_insert on public.ic_gemi_tahliyeleri;
create policy ic_gemi_insert on public.ic_gemi_tahliyeleri for insert
  with check (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
drop policy if exists ic_gemi_update on public.ic_gemi_tahliyeleri;
create policy ic_gemi_update on public.ic_gemi_tahliyeleri for update
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'))
  with check (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
-- Araci olan gemi silinemez (FK restrict); alicilar gemiyle birlikte silinir.
drop policy if exists ic_gemi_delete on public.ic_gemi_tahliyeleri;
create policy ic_gemi_delete on public.ic_gemi_tahliyeleri for delete
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));

drop policy if exists ic_gemi_alici_select on public.ic_gemi_alicilari;
create policy ic_gemi_alici_select on public.ic_gemi_alicilari for select
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
drop policy if exists ic_gemi_alici_insert on public.ic_gemi_alicilari;
create policy ic_gemi_alici_insert on public.ic_gemi_alicilari for insert
  with check (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
drop policy if exists ic_gemi_alici_update on public.ic_gemi_alicilari;
create policy ic_gemi_alici_update on public.ic_gemi_alicilari for update
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'))
  with check (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
drop policy if exists ic_gemi_alici_delete on public.ic_gemi_alicilari;
create policy ic_gemi_alici_delete on public.ic_gemi_alicilari for delete
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));

drop policy if exists ic_gemi_arac_select on public.ic_gemi_araclari;
create policy ic_gemi_arac_select on public.ic_gemi_araclari for select
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));

-- ---------------------------------------------------------------------------
-- 6) Kantar Paneli: acik gemiler (alicilar + toplamlar). Fiyat yok (tabloda da yok).
-- ---------------------------------------------------------------------------
create or replace function public.kantar_gemi_tahliyeleri()
 returns table (
   id uuid, gemi_adi text, urun text, tahliye_limani text, bl_kg numeric,
   gelen_kg numeric, gelen_arac integer, unex_liman_kg numeric, unex_teslim_kg numeric, unex_arac integer,
   bugun_arac integer, alicilar jsonb
 )
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  return query
    select g.id, g.gemi_adi, g.urun, g.tahliye_limani, g.bl_kg,
      coalesce((select sum(a.liman_kg) from public.ic_gemi_araclari a where a.gemi_id = g.id), 0)::numeric,
      (select count(*) from public.ic_gemi_araclari a where a.gemi_id = g.id)::integer,
      coalesce((select sum(a.liman_kg) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null), 0)::numeric,
      coalesce((select sum(a.teslim_kg) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null), 0)::numeric,
      (select count(*) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null)::integer,
      (select count(*) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.tarih = v_bugun)::integer,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', l.id, 'firma', l.firma, 'miktar_kg', l.miktar_kg,
          'gelen_kg', coalesce((select sum(a.liman_kg) from public.ic_gemi_araclari a where a.alici_id = l.id), 0),
          'arac', (select count(*) from public.ic_gemi_araclari a where a.alici_id = l.id)
        ) order by l.olusturma)
        from public.ic_gemi_alicilari l where l.gemi_id = g.id
      ), '[]'::jsonb)
    from public.ic_gemi_tahliyeleri g
    where g.company_id = auth_company_id() and g.durum = 'acik'
    order by g.olusturma;
end; $function$;

create or replace function public.kantar_gemi_son_araclar(p_gun integer default 2)
 returns table (
   id uuid, gemi_id uuid, gemi_adi text, alici_id uuid, firma text, tarih date, plaka text,
   liman_kg numeric, teslim_kg numeric, kaynak text, uyari_var boolean, girilen_email text, olusturma timestamptz
 )
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  return query
    select a.id, a.gemi_id, g.gemi_adi, a.alici_id, l.firma, a.tarih, a.plaka, a.liman_kg, a.teslim_kg, a.kaynak,
           cardinality(a.uyarilar) > 0, a.girilen_email, a.olusturma
    from public.ic_gemi_araclari a
    join public.ic_gemi_tahliyeleri g on g.id = a.gemi_id
    left join public.ic_gemi_alicilari l on l.id = a.alici_id
    where a.company_id = auth_company_id() and g.durum = 'acik'
      and a.olusturma >= now() - make_interval(days => greatest(1, least(coalesce(p_gun, 2), 14)))
    order by a.olusturma desc
    limit 300;
end; $function$;

-- ---------------------------------------------------------------------------
-- 7) Tek arac ekle (kantarci veya ofis). p_kaydet=false -> kuru kontrol (uyarilar), kayit yok.
--    p_veri: {gemi_id, alici_id?, plaka, liman_kg, teslim_kg?, tarih? (YYYY-MM-DD), notlar?}
-- ---------------------------------------------------------------------------
create or replace function public.ic_gemi_uyarilari(
  p_gemi public.ic_gemi_tahliyeleri, p_alici uuid, p_plaka text, p_liman numeric, p_teslim numeric, p_ek_kg numeric default 0)
 returns text[]
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v text[] := '{}';
  v_gelen numeric;
  v_alici public.ic_gemi_alicilari%rowtype;
  v_alici_gelen numeric;
  v_fark numeric;
begin
  if p_teslim is not null then
    v_fark := p_teslim - p_liman;
    if abs(v_fark) > greatest(300, p_liman * 0.01) then
      v := array_append(v, format('Liman ile teslim arasında %s fark var; fişleri kontrol edin.', ic_kg_yazi(v_fark)));
    end if;
  end if;
  if p_liman > 35000 then
    v := array_append(v, 'Liman ağırlığı 35.000 kg üzerinde; kontrol edin.');
  end if;
  if p_plaka is not null and exists (
    select 1 from public.ic_gemi_araclari a
    where a.gemi_id = p_gemi.id and replace(a.plaka, ' ', '') = replace(p_plaka, ' ', '') and a.olusturma > now() - interval '30 minutes'
  ) then
    v := array_append(v, 'Bu plaka son 30 dakikada bu gemiye girildi; çift kayıt olmasın.');
  end if;
  select coalesce(sum(liman_kg), 0) into v_gelen from public.ic_gemi_araclari where gemi_id = p_gemi.id;
  if v_gelen + p_liman + coalesce(p_ek_kg, 0) > p_gemi.bl_kg then
    v := array_append(v, format('Geminin tonajı (%s) aşılıyor.', ic_kg_yazi(p_gemi.bl_kg)));
  end if;
  if p_alici is not null then
    select * into v_alici from public.ic_gemi_alicilari where id = p_alici;
    select coalesce(sum(liman_kg), 0) into v_alici_gelen from public.ic_gemi_araclari where alici_id = p_alici;
    if v_alici_gelen + p_liman + coalesce(p_ek_kg, 0) > v_alici.miktar_kg then
      v := array_append(v, format('%s satış tonajı (%s) aşılıyor.', v_alici.firma, ic_kg_yazi(v_alici.miktar_kg)));
    end if;
  end if;
  return v;
end; $function$;

create or replace function public.ic_gemi_arac_ekle(p_veri jsonb, p_kaydet boolean default false)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
  v_ofis boolean := ic_sayfa_yetkisi('ic_piyasa');
  v_gemi public.ic_gemi_tahliyeleri%rowtype;
  v_alici uuid;
  v_plaka text;
  v_liman numeric;
  v_teslim numeric;
  v_tarih date;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_notlar text := nullif(left(btrim(coalesce(p_veri ->> 'notlar', '')), 300), '');
  v_uyarilar text[];
  v_id uuid;
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('kantar') or v_ofis) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  begin
    select * into v_gemi from public.ic_gemi_tahliyeleri where id = (p_veri ->> 'gemi_id')::uuid and company_id = v_sirket;
  exception when invalid_text_representation then v_gemi := null;
  end;
  if v_gemi.id is null then
    raise exception 'Gemi bulunamadı.' using errcode = 'P0002';
  end if;
  if v_gemi.durum <> 'acik' then
    raise exception 'Bu geminin tahliyesi kapatılmış. Araç girilemez.' using errcode = '23514';
  end if;
  begin
    v_alici := nullif(p_veri ->> 'alici_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Alıcı firma bulunamadı.' using errcode = 'P0002';
  end;
  if v_alici is not null and not exists (select 1 from public.ic_gemi_alicilari where id = v_alici and gemi_id = v_gemi.id) then
    raise exception 'Alıcı firma bu gemiye ait değil.' using errcode = 'P0002';
  end if;

  v_plaka := upper(regexp_replace(btrim(coalesce(p_veri ->> 'plaka', '')), '\s+', ' ', 'g'));
  if v_plaka !~ '^[A-Z0-9 ]{4,14}$' then
    raise exception 'Plaka geçersiz: "%". Örnek: 59 AGD 284', coalesce(p_veri ->> 'plaka', '') using errcode = '22023';
  end if;
  begin v_liman := round((p_veri ->> 'liman_kg')::numeric, 2); exception when others then v_liman := null; end;
  if v_liman is null or v_liman <= 0 or v_liman > 60000 then
    raise exception 'Liman ağırlığı geçersiz. 1 ile 60.000 kg arasında olmalı.' using errcode = '22023';
  end if;
  begin v_teslim := round(nullif(p_veri ->> 'teslim_kg', '')::numeric, 2); exception when others then v_teslim := -1; end;
  if v_alici is null then
    if v_teslim is null or v_teslim <= 0 or v_teslim > 60000 then
      raise exception 'UNEX''e gelen araçta teslim (kantar) ağırlığı zorunlu: 1 ile 60.000 kg arasında olmalı.' using errcode = '22023';
    end if;
  else
    v_teslim := null; -- gemiden satista teslim tartimi yok
  end if;
  begin v_tarih := coalesce(nullif(p_veri ->> 'tarih', '')::date, v_bugun); exception when others then
    raise exception 'Tarih geçersiz.' using errcode = '22023';
  end;
  if v_tarih > v_bugun or v_tarih < v_bugun - 30 then
    raise exception 'Tarih bugün veya son 30 gün içinde olmalı.' using errcode = '22023';
  end if;

  v_uyarilar := ic_gemi_uyarilari(v_gemi, v_alici, v_plaka, v_liman, v_teslim);
  if v_tarih < v_bugun then
    v_uyarilar := array_append(v_uyarilar, format('Geçmiş tarihli kayıt (%s).', to_char(v_tarih, 'DD.MM.YYYY')));
  end if;
  if not coalesce(p_kaydet, false) then
    return jsonb_build_object('kaydedildi', false, 'uyarilar', to_jsonb(v_uyarilar));
  end if;

  insert into public.ic_gemi_araclari (company_id, gemi_id, alici_id, tarih, plaka, liman_kg, teslim_kg, kaynak, uyarilar, notlar, girilen_email)
  values (v_sirket, v_gemi.id, v_alici, v_tarih, v_plaka, v_liman, v_teslim,
          case when ic_sayfa_yetkisi('kantar') and not v_ofis then 'kantar' else coalesce(nullif(p_veri ->> 'kaynak', ''), 'kantar') end,
          v_uyarilar, v_notlar, lower(nullif(auth.jwt() ->> 'email', '')))
  returning id into v_id;
  return jsonb_build_object('kaydedildi', true, 'id', v_id, 'uyarilar', to_jsonb(v_uyarilar));
end; $function$;

-- ---------------------------------------------------------------------------
-- 8) Ofis: liman listesi toplu (gemiden satis araclari). Hepsi ya da hicbiri.
--    p_satirlar: [{tarih, plaka, liman_kg}] (en fazla 300)
-- ---------------------------------------------------------------------------
create or replace function public.ic_gemi_liman_listesi_ekle(p_gemi uuid, p_alici uuid, p_satirlar jsonb, p_kaydet boolean default false)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
  v_gemi public.ic_gemi_tahliyeleri%rowtype;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_s jsonb;
  v_i integer := 0;
  v_plaka text;
  v_liman numeric;
  v_tarih date;
  v_toplam numeric := 0;
  v_uyarilar text[] := '{}';
  v_mukerrer integer := 0;
  v_agir integer := 0;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('ic_piyasa') then
    raise exception 'Bu işlem için İç Piyasa yetkisi gerekir.' using errcode = '42501';
  end if;
  select * into v_gemi from public.ic_gemi_tahliyeleri where id = p_gemi and company_id = v_sirket;
  if v_gemi.id is null then raise exception 'Gemi bulunamadı.' using errcode = 'P0002'; end if;
  if v_gemi.durum <> 'acik' then raise exception 'Bu geminin tahliyesi kapatılmış.' using errcode = '23514'; end if;
  if p_alici is null or not exists (select 1 from public.ic_gemi_alicilari where id = p_alici and gemi_id = p_gemi) then
    raise exception 'Alıcı firma bu gemiye ait değil.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_satirlar) <> 'array' or jsonb_array_length(p_satirlar) = 0 then
    raise exception 'Liste boş.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_satirlar) > 300 then
    raise exception 'Tek seferde en fazla 300 araç eklenebilir.' using errcode = '22023';
  end if;

  for v_s in select * from jsonb_array_elements(p_satirlar) loop
    v_i := v_i + 1;
    v_plaka := upper(regexp_replace(btrim(coalesce(v_s ->> 'plaka', '')), '\s+', ' ', 'g'));
    if v_plaka !~ '^[A-Z0-9 ]{4,14}$' then
      raise exception '%. satır: plaka geçersiz ("%").', v_i, coalesce(v_s ->> 'plaka', '') using errcode = '22023';
    end if;
    begin v_liman := round((v_s ->> 'liman_kg')::numeric, 2); exception when others then v_liman := null; end;
    if v_liman is null or v_liman <= 0 or v_liman > 60000 then
      raise exception '%. satır (%): liman ağırlığı 1 ile 60.000 kg arasında olmalı.', v_i, v_plaka using errcode = '22023';
    end if;
    begin v_tarih := nullif(v_s ->> 'tarih', '')::date; exception when others then v_tarih := null; end;
    if v_tarih is null or v_tarih > v_bugun or v_tarih < v_bugun - 30 then
      raise exception '%. satır (%): tarih bugün veya son 30 gün içinde olmalı.', v_i, v_plaka using errcode = '22023';
    end if;
    if exists (select 1 from public.ic_gemi_araclari a where a.gemi_id = p_gemi and a.tarih = v_tarih
               and replace(a.plaka, ' ', '') = replace(v_plaka, ' ', '') and a.liman_kg = v_liman) then
      v_mukerrer := v_mukerrer + 1;
    end if;
    if v_liman > 35000 then v_agir := v_agir + 1; end if;
    v_toplam := v_toplam + v_liman;
    if coalesce(p_kaydet, false) then
      insert into public.ic_gemi_araclari (company_id, gemi_id, alici_id, tarih, plaka, liman_kg, teslim_kg, kaynak, uyarilar, girilen_email)
      values (v_sirket, p_gemi, p_alici, v_tarih, v_plaka, v_liman, null, 'ofis', '{}', v_email);
    end if;
  end loop;

  if v_mukerrer > 0 then
    v_uyarilar := array_append(v_uyarilar, format('%s satır daha önce girilmiş görünüyor (aynı gün, plaka ve kg).', v_mukerrer));
  end if;
  if v_agir > 0 then
    v_uyarilar := array_append(v_uyarilar, format('%s satırda liman ağırlığı 35.000 kg üzerinde; kontrol edin.', v_agir));
  end if;
  -- Tonaj uyarilari (kayittan once hesaplanir: kaydedilmisse eklenenleri dusmeden)
  v_uyarilar := v_uyarilar || ic_gemi_uyarilari(v_gemi, p_alici, null, 0,
    null, case when coalesce(p_kaydet, false) then 0 else v_toplam end);
  return jsonb_build_object('kaydedildi', coalesce(p_kaydet, false), 'adet', v_i, 'toplam_kg', v_toplam, 'uyarilar', to_jsonb(v_uyarilar));
end; $function$;

-- ---------------------------------------------------------------------------
-- 9) Hatali araci sil (yalniz ic_piyasa; denetim kaydinda tam kopya kalir)
-- ---------------------------------------------------------------------------
create or replace function public.ic_gemi_arac_sil(p_id uuid)
 returns void
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not ic_sayfa_yetkisi('ic_piyasa') then
    raise exception 'Bu işlem için İç Piyasa yetkisi gerekir.' using errcode = '42501';
  end if;
  delete from public.ic_gemi_araclari a
   using public.ic_gemi_tahliyeleri g
   where a.id = p_id and g.id = a.gemi_id and a.company_id = auth_company_id() and g.durum = 'acik';
  if not found then
    raise exception 'Araç bulunamadı ya da tahliye kapatılmış.' using errcode = 'P0002';
  end if;
end; $function$;

revoke all on function public.ic_gemi_hazirla() from public, anon, authenticated;
revoke all on function public.ic_gemi_alici_hazirla() from public, anon, authenticated;
revoke all on function public.ic_gemi_uyarilari(public.ic_gemi_tahliyeleri, uuid, text, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function public.kantar_gemi_tahliyeleri() from public, anon;
revoke all on function public.kantar_gemi_son_araclar(integer) from public, anon;
revoke all on function public.ic_gemi_arac_ekle(jsonb, boolean) from public, anon;
revoke all on function public.ic_gemi_liman_listesi_ekle(uuid, uuid, jsonb, boolean) from public, anon;
revoke all on function public.ic_gemi_arac_sil(uuid) from public, anon;
grant execute on function public.kantar_gemi_tahliyeleri() to authenticated;
grant execute on function public.kantar_gemi_son_araclar(integer) to authenticated;
grant execute on function public.ic_gemi_arac_ekle(jsonb, boolean) to authenticated;
grant execute on function public.ic_gemi_liman_listesi_ekle(uuid, uuid, jsonb, boolean) to authenticated;
grant execute on function public.ic_gemi_arac_sil(uuid) to authenticated;

comment on table public.ic_gemi_tahliyeleri is 'Gemi tahliye takibi (25.11.2026): gemi + anlasma (B/L) tonaji. Rapor: TARIH/PLAKA/LIMAN/TESLIM/FARK/GITTIGI YER.';
comment on table public.ic_gemi_alicilari is 'Gemiden satis: alici firma + tonaj (25.11.2026).';
comment on table public.ic_gemi_araclari is 'Gemi tahliye araclari (25.11.2026). alici_id NULL = UNEX depo (liman + teslim kg), dolu = gemiden satis (yalniz liman kg). Yazma yalniz ic_gemi_arac_ekle / ic_gemi_liman_listesi_ekle / ic_gemi_arac_sil.';
