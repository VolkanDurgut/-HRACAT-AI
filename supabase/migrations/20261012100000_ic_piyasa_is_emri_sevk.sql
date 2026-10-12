-- ============================================================================
-- IC PIYASA - MUSTERI KARTLARI + IS EMRI + SEVK (KANTAR) (12.10.2026)
-- ============================================================================
-- Ihracat tablolarina DOKUNMAZ. Yeni: 3 tablo, 1 sayac, 1 depo (bucket),
-- yetki yardimcisi ve Kantar Paneli icin 3 fonksiyon.
--
-- ic_musteriler   : Yurt ici musteri kartlari (unvan, vergi no, iletisim,
--                   WhatsApp izni, pazartesi fiyat listesi).
-- ic_is_emirleri  : Yetkilinin (Volkan) Burak Bey talimatiyla actigi is emri.
--                   Numara IE-YYYY-NNNN sunucuda verilir. Hedef TONAJ (kg) ya da
--                   ARAC SAYISI. Fiyat/vade/odeme/teslim fiyat formundan gelir,
--                   is emrine ozel degistirilebilir.
-- ic_sevkler      : Kantarcinin her arac icin girdigi kayit: irsaliye PDF'i +
--                   plaka + net kg (irsaliyeden okunur, kantarci onaylar).
--
-- YETKI MODELI
--  - Musteri / is emri / sevk tablolarini SADECE "ic_piyasa" sayfa yetkisi
--    olan kullanici okur/yazar (fiyat ve musteri bilgisi icerir).
--  - Kantarci (sadece "kantar" yetkisi) tablolara DOGRUDAN erisemez; Kantar
--    Paneli SECURITY DEFINER fonksiyonlarla calisir: acik is emirlerini
--    musteri adi MASKELI ve FIYATSIZ gorur, sevk ekler.
--  - Sevk ekleme TEK yoldan: kantar_ic_sevk_ekle() (dogrulama burada).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Yetki yardimcisi: oturumdaki kullanicinin sayfa yetkisi var mi?
-- ---------------------------------------------------------------------------
create or replace function public.ic_sayfa_yetkisi(p_anahtar text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((
    select (y.sayfa_yetkileri ->> p_anahtar) = 'true'
    from public.kullanici_yetkileri y
    where y.user_id = auth.uid()
    limit 1
  ), false);
$function$;

-- Musteri unvanini maskeler (Kantar Paneli ile ayni kural): her kelimenin ilk
-- harfi gorunur, gerisi yildiz.
create or replace function public.ic_maskele(p_metin text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select coalesce((
    select string_agg(case when char_length(w) <= 1 then w else left(w, 1) || repeat('*', char_length(w) - 1) end, ' ' order by o)
    from unnest(regexp_split_to_array(btrim(coalesce(p_metin, '')), '\s+')) with ordinality as t(w, o)
    where w <> ''
  ), '-');
$function$;

create sequence if not exists public.ic_is_emri_sira;

-- ---------------------------------------------------------------------------
-- 1) Musteri kartlari
-- ---------------------------------------------------------------------------
create table if not exists public.ic_musteriler (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  unvan text not null check (btrim(unvan) <> ''),
  kisa_ad text,
  vergi_dairesi text,
  vergi_no text check (vergi_no is null or vergi_no ~ '^[0-9]{10,11}$'),
  adres text,
  yetkili_ad text,
  telefon text check (telefon is null or telefon ~ '^[0-9]{10,15}$'),
  eposta text,
  whatsapp_izin boolean not null default false,
  haftalik_fiyat_listesi boolean not null default false,
  notlar text,
  aktif boolean not null default true,
  olusturan uuid default auth.uid(),
  olusturma timestamptz not null default now(),
  guncelleme timestamptz not null default now()
);
create index if not exists idx_ic_musteriler_company on public.ic_musteriler (company_id, unvan);
create unique index if not exists uq_ic_musteriler_vergi_no on public.ic_musteriler (company_id, vergi_no) where vergi_no is not null;
alter table public.ic_musteriler enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Is emirleri
-- ---------------------------------------------------------------------------
create table if not exists public.ic_is_emirleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  is_emri_no text unique,
  musteri_id uuid not null references public.ic_musteriler(id) on delete restrict,
  urun text not null check (btrim(urun) <> ''),
  ambalaj text,
  hedef_tur text not null check (hedef_tur in ('kg', 'arac')),
  hedef_kg numeric(12, 2) check (hedef_kg is null or hedef_kg > 0),
  hedef_arac integer check (hedef_arac is null or (hedef_arac > 0 and hedef_arac <= 500)),
  birim_fiyat numeric(12, 2) check (birim_fiyat is null or birim_fiyat >= 0),
  kdv_dahil boolean not null default false,
  vade_gun integer check (vade_gun is null or (vade_gun >= 0 and vade_gun <= 365)),
  odeme text,
  teslim text,
  teslim_adresi text,
  fiyat_formu_id uuid references public.ic_fiyat_formlari(id) on delete set null,
  fiyat_formu_no text,
  talimat_veren text,
  musteri_siparis_no text,
  notlar text,
  durum text not null default 'acik' check (durum in ('acik', 'tamamlandi', 'iptal')),
  kapanis_zamani timestamptz,
  olusturan uuid default auth.uid(),
  olusturan_email text,
  olusturma timestamptz not null default now(),
  guncelleme timestamptz not null default now(),
  constraint ic_is_emri_hedef_dolu check (
    (hedef_tur = 'kg' and hedef_kg is not null) or (hedef_tur = 'arac' and hedef_arac is not null)
  )
);
create index if not exists idx_ic_is_emirleri_company on public.ic_is_emirleri (company_id, durum, olusturma desc);
create index if not exists idx_ic_is_emirleri_musteri on public.ic_is_emirleri (musteri_id);
alter table public.ic_is_emirleri enable row level security;

-- ---------------------------------------------------------------------------
-- 3) Sevkler (her arac bir satir)
-- ---------------------------------------------------------------------------
create table if not exists public.ic_sevkler (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  is_emri_id uuid not null references public.ic_is_emirleri(id) on delete restrict,
  plaka text not null check (plaka ~ '^[A-Z0-9 ]{4,14}$'),
  dorse_plaka text,
  net_kg numeric(12, 2) not null check (net_kg > 0 and net_kg <= 60000),
  irsaliye_no text,
  irsaliye_tarihi timestamptz,
  ettn text,
  sofor_ad text,
  irsaliye_urun text,
  irsaliye_dosya_yolu text not null,
  irsaliye_dosya_adi text,
  okunan jsonb,
  elle_duzeltildi boolean not null default false,
  uyarilar text[] not null default '{}',
  girilen uuid default auth.uid(),
  girilen_email text,
  olusturma timestamptz not null default now()
);
create index if not exists idx_ic_sevkler_is_emri on public.ic_sevkler (is_emri_id, olusturma);
create index if not exists idx_ic_sevkler_company on public.ic_sevkler (company_id, olusturma desc);
create unique index if not exists uq_ic_sevkler_irsaliye_no on public.ic_sevkler (company_id, irsaliye_no) where irsaliye_no is not null;
create unique index if not exists uq_ic_sevkler_ettn on public.ic_sevkler (company_id, ettn) where ettn is not null;
alter table public.ic_sevkler enable row level security;

-- ---------------------------------------------------------------------------
-- 4) Tetikleyiciler
-- ---------------------------------------------------------------------------
create or replace function public.ic_guncelleme_zamani()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  new.guncelleme := now();
  return new;
end; $function$;

drop trigger if exists ic_musteriler_guncelleme on public.ic_musteriler;
create trigger ic_musteriler_guncelleme before update on public.ic_musteriler
  for each row execute function public.ic_guncelleme_zamani();

-- Is emri: numara SUNUCUDA verilir; musteri ayni sirketten olmali. Dogrulama
-- numaradan ONCE yapilir (reddedilen kayit sayacta bosluk birakmasin).
create or replace function public.ic_is_emri_hazirla()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  tr_gun date;
begin
  if tg_op = 'INSERT' then
    -- Kontrol kisitlari ve RLS bu tetikleyiciden SONRA calisir; reddedilecek
    -- kayit sayaci bosuna ilerletmesin diye hepsi burada once denetlenir.
    if auth.uid() is not null and (new.company_id is distinct from auth_company_id() or not ic_sayfa_yetkisi('ic_piyasa')) then
      raise exception 'Bu şirket için iş emri açma yetkiniz yok.' using errcode = '42501';
    end if;
    if new.urun is null or btrim(new.urun) = '' then
      raise exception 'Ürün boş olamaz.' using errcode = '23514';
    end if;
    if new.hedef_tur is null or new.hedef_tur not in ('kg', 'arac')
       or (new.hedef_tur = 'kg' and (new.hedef_kg is null or new.hedef_kg <= 0))
       or (new.hedef_tur = 'arac' and (new.hedef_arac is null or new.hedef_arac <= 0 or new.hedef_arac > 500)) then
      raise exception 'Hedef tonaj veya araç sayısı geçersiz.' using errcode = '23514';
    end if;
    if new.birim_fiyat is not null and new.birim_fiyat < 0 then
      raise exception 'Birim fiyat geçersiz.' using errcode = '23514';
    end if;
    if new.vade_gun is not null and (new.vade_gun < 0 or new.vade_gun > 365) then
      raise exception 'Vade geçersiz.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.ic_musteriler m where m.id = new.musteri_id and m.company_id = new.company_id) then
      raise exception 'Müşteri bulunamadı.' using errcode = '23503';
    end if;
    new.durum := 'acik';
    new.kapanis_zamani := null;
    new.olusturma := now();
    new.guncelleme := now();
    new.olusturan := auth.uid();
    tr_gun := (now() at time zone 'Europe/Istanbul')::date;
    new.is_emri_no := 'IE-' || extract(year from tr_gun)::text || '-'
      || lpad(pg_catalog.nextval('public.ic_is_emri_sira'::regclass)::text, 4, '0');
  else
    -- Degismez alanlar
    new.id := old.id;
    new.company_id := old.company_id;
    new.is_emri_no := old.is_emri_no;
    new.olusturan := old.olusturan;
    new.olusturan_email := old.olusturan_email;
    new.olusturma := old.olusturma;
    new.guncelleme := now();
    if new.musteri_id is distinct from old.musteri_id then
      if exists (select 1 from public.ic_sevkler s where s.is_emri_id = old.id) then
        raise exception 'Sevk girilmiş iş emrinin müşterisi değiştirilemez.' using errcode = '23514';
      end if;
      if not exists (select 1 from public.ic_musteriler m where m.id = new.musteri_id and m.company_id = new.company_id) then
        raise exception 'Müşteri bulunamadı.' using errcode = '23503';
      end if;
    end if;
    if new.durum is distinct from old.durum then
      new.kapanis_zamani := case when new.durum = 'acik' then null else now() end;
    end if;
  end if;
  return new;
end; $function$;

drop trigger if exists ic_is_emri_hazirla on public.ic_is_emirleri;
create trigger ic_is_emri_hazirla before insert or update on public.ic_is_emirleri
  for each row execute function public.ic_is_emri_hazirla();

-- Denetim kayitlari (ihracat tablolariyla ayni mekanizma)
drop trigger if exists denetim_ic_musteriler on public.ic_musteriler;
create trigger denetim_ic_musteriler after insert or update or delete on public.ic_musteriler
  for each row execute function public.denetim_tetikleyici();
drop trigger if exists denetim_ic_is_emirleri on public.ic_is_emirleri;
create trigger denetim_ic_is_emirleri after insert or update or delete on public.ic_is_emirleri
  for each row execute function public.denetim_tetikleyici();
drop trigger if exists denetim_ic_sevkler on public.ic_sevkler;
create trigger denetim_ic_sevkler after insert or update or delete on public.ic_sevkler
  for each row execute function public.denetim_tetikleyici();

-- ---------------------------------------------------------------------------
-- 5) RLS: sadece ic_piyasa yetkilisi, kendi sirketi
-- ---------------------------------------------------------------------------
do $$
begin
  -- Musteriler
  if not exists (select 1 from pg_policies where tablename = 'ic_musteriler' and policyname = 'ic_musteriler_select') then
    create policy ic_musteriler_select on public.ic_musteriler for select
      using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ic_musteriler' and policyname = 'ic_musteriler_insert') then
    create policy ic_musteriler_insert on public.ic_musteriler for insert
      with check (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ic_musteriler' and policyname = 'ic_musteriler_update') then
    create policy ic_musteriler_update on public.ic_musteriler for update
      using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'))
      with check (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ic_musteriler' and policyname = 'ic_musteriler_delete') then
    create policy ic_musteriler_delete on public.ic_musteriler for delete
      using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
  end if;

  -- Is emirleri (silme: sadece sevki olmayan; FK RESTRICT ayrica korur)
  if not exists (select 1 from pg_policies where tablename = 'ic_is_emirleri' and policyname = 'ic_is_emirleri_select') then
    create policy ic_is_emirleri_select on public.ic_is_emirleri for select
      using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ic_is_emirleri' and policyname = 'ic_is_emirleri_insert') then
    create policy ic_is_emirleri_insert on public.ic_is_emirleri for insert
      with check (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ic_is_emirleri' and policyname = 'ic_is_emirleri_update') then
    create policy ic_is_emirleri_update on public.ic_is_emirleri for update
      using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'))
      with check (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ic_is_emirleri' and policyname = 'ic_is_emirleri_delete') then
    create policy ic_is_emirleri_delete on public.ic_is_emirleri for delete
      using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
  end if;

  -- Sevkler: okuma + silme (hatali kaydi duzeltmek icin) yetkilide;
  -- EKLEME sadece kantar_ic_sevk_ekle() ile (INSERT politikasi yok).
  if not exists (select 1 from pg_policies where tablename = 'ic_sevkler' and policyname = 'ic_sevkler_select') then
    create policy ic_sevkler_select on public.ic_sevkler for select
      using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ic_sevkler' and policyname = 'ic_sevkler_delete') then
    create policy ic_sevkler_delete on public.ic_sevkler for delete
      using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) Kantar Paneli fonksiyonlari (SECURITY DEFINER, fiyatsiz + maskeli)
-- ---------------------------------------------------------------------------
create or replace function public.kantar_ic_is_emirleri()
 returns table (
   id uuid, is_emri_no text, musteri_maskeli text, urun text, ambalaj text, teslim text,
   hedef_tur text, hedef_kg numeric, hedef_arac integer,
   yuklenen_kg numeric, yuklenen_arac integer, olusturma timestamptz
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
    select e.id, e.is_emri_no, ic_maskele(m.unvan), e.urun, e.ambalaj, e.teslim,
           e.hedef_tur, e.hedef_kg, e.hedef_arac,
           coalesce(sum(s.net_kg), 0)::numeric, count(s.id)::integer, e.olusturma
    from public.ic_is_emirleri e
    join public.ic_musteriler m on m.id = e.musteri_id
    left join public.ic_sevkler s on s.is_emri_id = e.id
    where e.company_id = auth_company_id() and e.durum = 'acik'
    group by e.id, m.unvan
    order by e.olusturma;
end; $function$;

create or replace function public.kantar_ic_son_sevkler(p_gun integer default 3)
 returns table (
   id uuid, is_emri_no text, musteri_maskeli text, urun text, plaka text, dorse_plaka text,
   net_kg numeric, irsaliye_no text, irsaliye_dosya_yolu text, uyari_var boolean,
   girilen_email text, olusturma timestamptz
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
    select s.id, e.is_emri_no, ic_maskele(m.unvan), e.urun, s.plaka, s.dorse_plaka,
           s.net_kg, s.irsaliye_no, s.irsaliye_dosya_yolu, cardinality(s.uyarilar) > 0,
           s.girilen_email, s.olusturma
    from public.ic_sevkler s
    join public.ic_is_emirleri e on e.id = s.is_emri_id
    join public.ic_musteriler m on m.id = e.musteri_id
    where s.company_id = auth_company_id()
      and s.olusturma >= now() - make_interval(days => greatest(1, least(coalesce(p_gun, 3), 31)))
    order by s.olusturma desc;
end; $function$;

-- Sevk ekleme: p_kaydet = false -> sadece kontrol eder, uyarilari dondurur
-- (kantarci onaylamadan once gorur); true -> kaydeder.
-- Musteri VKN'si kantarciya GOSTERILMEZ; sadece "uyusmuyor" uyarisi doner.
create or replace function public.kantar_ic_sevk_ekle(p_veri jsonb, p_kaydet boolean default false)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
  v_emir public.ic_is_emirleri%rowtype;
  v_musteri public.ic_musteriler%rowtype;
  v_plaka text;
  v_dorse text;
  v_net numeric;
  v_yol text;
  v_irs_no text;
  v_ettn text;
  v_alici_vkn text;
  v_uyarilar text[] := '{}';
  v_toplam_kg numeric;
  v_toplam_arac integer;
  v_id uuid;
  v_tarih timestamptz;
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;

  select * into v_emir from public.ic_is_emirleri where id = (p_veri ->> 'is_emri_id')::uuid and company_id = v_sirket;
  if not found then
    raise exception 'İş emri bulunamadı.' using errcode = 'P0002';
  end if;
  if v_emir.durum <> 'acik' then
    raise exception 'Bu iş emri kapalı (%). Sevk girilemez.', v_emir.durum using errcode = '23514';
  end if;
  select * into v_musteri from public.ic_musteriler where id = v_emir.musteri_id;

  -- Plaka: buyuk harf, sadece harf/rakam/bosluk, Turkce harf YOK (plakada olmaz)
  v_plaka := upper(regexp_replace(btrim(coalesce(p_veri ->> 'plaka', '')), '\s+', ' ', 'g'));
  if v_plaka !~ '^[A-Z0-9 ]{4,14}$' then
    raise exception 'Plaka geçersiz: "%". Örnek: 59 AGD 284', coalesce(p_veri ->> 'plaka', '') using errcode = '22023';
  end if;
  v_dorse := nullif(upper(regexp_replace(btrim(coalesce(p_veri ->> 'dorse_plaka', '')), '\s+', ' ', 'g')), '');
  if v_dorse is not null and v_dorse !~ '^[A-Z0-9 ]{4,14}$' then
    v_dorse := null;
  end if;

  begin
    v_net := round((p_veri ->> 'net_kg')::numeric, 2);
  exception when others then
    v_net := null;
  end;
  if v_net is null or v_net <= 0 or v_net > 60000 then
    raise exception 'Net ağırlık geçersiz. 1 ile 60.000 kg arasında olmalı.' using errcode = '22023';
  end if;

  v_yol := coalesce(p_veri ->> 'irsaliye_dosya_yolu', '');
  if v_yol not like v_sirket::text || '/irsaliye/' || v_emir.id::text || '/%' then
    raise exception 'İrsaliye dosyası bu iş emrine ait değil.' using errcode = '22023';
  end if;

  v_irs_no := nullif(upper(btrim(coalesce(p_veri ->> 'irsaliye_no', ''))), '');
  v_ettn := nullif(upper(btrim(coalesce(p_veri ->> 'ettn', ''))), '');
  v_alici_vkn := nullif(regexp_replace(coalesce(p_veri ->> 'alici_vkn', ''), '\D', '', 'g'), '');
  begin
    v_tarih := nullif(p_veri ->> 'irsaliye_tarihi', '')::timestamptz;
  exception when others then
    v_tarih := null;
  end;

  if v_irs_no is not null and exists (select 1 from public.ic_sevkler where company_id = v_sirket and irsaliye_no = v_irs_no) then
    raise exception 'Bu irsaliye (%) daha önce girilmiş.', v_irs_no using errcode = '23505';
  end if;
  if v_ettn is not null and exists (select 1 from public.ic_sevkler where company_id = v_sirket and ettn = v_ettn) then
    raise exception 'Bu irsaliye (ETTN) daha önce girilmiş.' using errcode = '23505';
  end if;

  -- Uyarilar (kaydi engellemez; kantarci gorur, yetkili listede gorur)
  if v_alici_vkn is not null and v_musteri.vergi_no is not null and v_alici_vkn <> v_musteri.vergi_no then
    v_uyarilar := array_append(v_uyarilar, 'İrsaliyedeki alıcı bu iş emrinin müşterisi değil (vergi no farklı).');
  end if;
  if v_irs_no is null then
    v_uyarilar := array_append(v_uyarilar, 'İrsaliye numarası okunamadı.');
  end if;
  if coalesce((p_veri ->> 'elle_duzeltildi')::boolean, false) then
    v_uyarilar := array_append(v_uyarilar, 'Plaka veya net ağırlık irsaliyeden farklı girildi.');
  end if;
  if coalesce((p_veri ->> 'urun_uyusmuyor')::boolean, false) then
    v_uyarilar := array_append(v_uyarilar, 'İrsaliyedeki ürün iş emrindeki üründen farklı görünüyor.');
  end if;
  if v_net > 35000 then
    v_uyarilar := array_append(v_uyarilar, 'Net ağırlık 35.000 kg üzerinde; kontrol edin.');
  end if;
  select coalesce(sum(net_kg), 0), count(*) into v_toplam_kg, v_toplam_arac
    from public.ic_sevkler where is_emri_id = v_emir.id;
  if exists (select 1 from public.ic_sevkler where is_emri_id = v_emir.id and plaka = v_plaka
             and olusturma >= now() - interval '12 hours') then
    v_uyarilar := array_append(v_uyarilar, 'Bu plaka son 12 saatte bu iş emrine zaten girilmiş.');
  end if;
  if v_emir.hedef_tur = 'kg' and v_toplam_kg + v_net > v_emir.hedef_kg * 1.05 then
    v_uyarilar := array_append(v_uyarilar, 'Bu araçla iş emrindeki hedef tonaj %5''ten fazla aşılıyor.');
  end if;
  if v_emir.hedef_tur = 'arac' and v_toplam_arac + 1 > v_emir.hedef_arac then
    v_uyarilar := array_append(v_uyarilar, 'İş emrindeki araç sayısı aşılıyor.');
  end if;

  if not coalesce(p_kaydet, false) then
    return jsonb_build_object('kaydedildi', false, 'uyarilar', to_jsonb(v_uyarilar), 'plaka', v_plaka, 'net_kg', v_net);
  end if;

  insert into public.ic_sevkler (
    company_id, is_emri_id, plaka, dorse_plaka, net_kg, irsaliye_no, irsaliye_tarihi, ettn,
    sofor_ad, irsaliye_urun, irsaliye_dosya_yolu, irsaliye_dosya_adi, okunan, elle_duzeltildi,
    uyarilar, girilen, girilen_email
  ) values (
    v_sirket, v_emir.id, v_plaka, v_dorse, v_net, v_irs_no, v_tarih, v_ettn,
    nullif(btrim(coalesce(p_veri ->> 'sofor_ad', '')), ''),
    nullif(btrim(coalesce(p_veri ->> 'irsaliye_urun', '')), ''),
    v_yol, nullif(p_veri ->> 'irsaliye_dosya_adi', ''),
    case when jsonb_typeof(p_veri -> 'okunan') = 'object' then (p_veri -> 'okunan') - 'tckn' else null end,
    coalesce((p_veri ->> 'elle_duzeltildi')::boolean, false),
    v_uyarilar, auth.uid(), lower(nullif(auth.jwt() ->> 'email', ''))
  ) returning id into v_id;

  return jsonb_build_object(
    'kaydedildi', true, 'sevk_id', v_id, 'uyarilar', to_jsonb(v_uyarilar),
    'plaka', v_plaka, 'net_kg', v_net,
    'yuklenen_kg', v_toplam_kg + v_net, 'yuklenen_arac', v_toplam_arac + 1
  );
end; $function$;

-- ---------------------------------------------------------------------------
-- 7) Belge deposu (irsaliye PDF'leri): {company_id}/irsaliye/{is_emri_id}/...
-- ---------------------------------------------------------------------------
-- Silme kurali: yetkili hepsini silebilir. Kantarci SADECE kendi yukledigi ve
-- hicbir sevk kaydina baglanmamis dosyayi (yarim kalan yukleme) geri silebilir.
-- (Sevk tablosu kantarciya kapali oldugu icin kontrol SECURITY DEFINER.)
create or replace function public.ic_belge_silinebilir(p_yol text, p_sahip text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select public.ic_sayfa_yetkisi('ic_piyasa')
      or (public.ic_sayfa_yetkisi('kantar')
          and p_sahip = auth.uid()::text
          and not exists (select 1 from public.ic_sevkler s where s.irsaliye_dosya_yolu = p_yol));
$function$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ic-piyasa-belgeler', 'ic-piyasa-belgeler', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'ic_belge_select') then
    create policy ic_belge_select on storage.objects for select
      using (bucket_id = 'ic-piyasa-belgeler'
             and split_part(name, '/', 1) = public.auth_company_id()::text
             and (public.ic_sayfa_yetkisi('ic_piyasa') or public.ic_sayfa_yetkisi('kantar')));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'ic_belge_insert') then
    create policy ic_belge_insert on storage.objects for insert
      with check (bucket_id = 'ic-piyasa-belgeler'
                  and split_part(name, '/', 1) = public.auth_company_id()::text
                  and split_part(name, '/', 2) = 'irsaliye'
                  and (public.ic_sayfa_yetkisi('ic_piyasa') or public.ic_sayfa_yetkisi('kantar')));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'ic_belge_delete') then
    create policy ic_belge_delete on storage.objects for delete
      using (bucket_id = 'ic-piyasa-belgeler'
             and split_part(name, '/', 1) = public.auth_company_id()::text
             and public.ic_belge_silinebilir(name, owner_id));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8) Yetkiler (Supabase varsayilanlari TRUNCATE dahil her seyi verir)
-- ---------------------------------------------------------------------------
revoke all on table public.ic_musteriler from anon, authenticated, public;
revoke all on table public.ic_is_emirleri from anon, authenticated, public;
revoke all on table public.ic_sevkler from anon, authenticated, public;
revoke all on sequence public.ic_is_emri_sira from anon, authenticated, public;
grant select, insert, update, delete on table public.ic_musteriler to authenticated;
grant select, insert, update, delete on table public.ic_is_emirleri to authenticated;
grant select, delete on table public.ic_sevkler to authenticated;
grant usage on sequence public.ic_is_emri_sira to authenticated;
grant all on table public.ic_musteriler to service_role;
grant all on table public.ic_is_emirleri to service_role;
grant all on table public.ic_sevkler to service_role;

revoke all on function public.ic_sayfa_yetkisi(text) from public, anon;
revoke all on function public.ic_maskele(text) from public, anon;
revoke all on function public.ic_belge_silinebilir(text, text) from public, anon;
grant execute on function public.ic_belge_silinebilir(text, text) to authenticated;
revoke all on function public.kantar_ic_is_emirleri() from public, anon;
revoke all on function public.kantar_ic_son_sevkler(integer) from public, anon;
revoke all on function public.kantar_ic_sevk_ekle(jsonb, boolean) from public, anon;
revoke all on function public.ic_is_emri_hazirla() from public, anon, authenticated;
revoke all on function public.ic_guncelleme_zamani() from public, anon, authenticated;
grant execute on function public.ic_sayfa_yetkisi(text) to authenticated;
grant execute on function public.ic_maskele(text) to authenticated;
grant execute on function public.kantar_ic_is_emirleri() to authenticated;
grant execute on function public.kantar_ic_son_sevkler(integer) to authenticated;
grant execute on function public.kantar_ic_sevk_ekle(jsonb, boolean) to authenticated;

comment on table public.ic_musteriler is 'Ic piyasa musteri kartlari (12.10.2026).';
comment on table public.ic_is_emirleri is 'Ic piyasa is emirleri IE-YYYY-NNNN; hedef kg veya arac sayisi (12.10.2026).';
comment on table public.ic_sevkler is 'Ic piyasa sevkleri: arac basina irsaliye + plaka + net kg; ekleme sadece kantar_ic_sevk_ekle() (12.10.2026).';
