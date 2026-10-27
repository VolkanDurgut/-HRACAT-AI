-- ============================================================================
-- SATIN ALMA TALEPLERI (26.10.2026)
-- ============================================================================
-- Kullanici: departmanlardaki yetkili arkadaslar ihtiyac listesi hazirlar,
-- "gonder" deyince execution@ + bbt@'ye mail gider; Burak Bey listeden kalem
-- bazinda onaylar / reddeder, sonuc execution@'ye gider.
--
-- Ihracat ve ic piyasa tablolarina DOKUNMAZ. Yeni: 3 tablo, 1 sayac.
--
-- satin_alma_departmanlari : departman + GIRISSIZ talep linkinin token'i (32 hex).
-- satin_alma_listeleri     : departman basina tek ACIK TASLAK (ortak liste);
--                            gonderilince SA-YYYY-NNNN numarasi alir.
--                            durum: taslak -> bekliyor -> sonuclandi
-- satin_alma_kalemleri     : listedeki kalemler; karar kalem bazinda.
--
-- CEK LISTESI (kullanici 26.10.2026): onaylanan kalem varsa karar aninda listede
-- AKTIF bir Unex cek listesi olusur (cek_token, cek_durumu='aktif'); execution@'ye
-- departman etiketli mail gider. Maildeki girissiz /cek/[token] sayfasinda kalemler
-- "alindi" isaretlenir; onaylananlarin hepsi alininca cek_durumu='tamamlandi'.
-- Onayli alimlar departmanin altinda birikir (departman gecmisi).
--
-- YETKI MODELI
--  - Girissiz departman sayfasi (/talep/[token]) veritabanina DOGRUDAN erismez:
--    edge function "satin-alma" service_role ile SADECE sa_token_* fonksiyonlarini
--    cagirir (anon / authenticated'a KAPALI).
--  - Uygulama ici "Satin Alma" sayfasi: "satin_alma" sayfa yetkisi + ayni sirket.
--    Tablolar SADECE OKUNUR; tum yazmalar SECURITY DEFINER fonksiyonlarla
--    (dogrulama tek yerde).
--  - Ilk yetki: super adminler (volkandurgut.tr@gmail.com, bbt@unex.com.tr).
-- ============================================================================

create sequence if not exists public.satin_alma_liste_sira;

-- ---------------------------------------------------------------------------
-- 1) Tablolar
-- ---------------------------------------------------------------------------
create table if not exists public.satin_alma_departmanlari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ad text not null check (char_length(btrim(ad)) between 2 and 60),
  token text not null default replace(gen_random_uuid()::text, '-', '') check (token ~ '^[0-9a-f]{32}$'),
  aktif boolean not null default true,
  sira integer not null default 0,
  olusturma timestamptz not null default now(),
  guncelleme timestamptz not null default now()
);
create unique index if not exists uq_satin_alma_departman_token on public.satin_alma_departmanlari (token);
create unique index if not exists uq_satin_alma_departman_ad on public.satin_alma_departmanlari (company_id, lower(btrim(ad)));

create table if not exists public.satin_alma_listeleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  departman_id uuid not null references public.satin_alma_departmanlari(id) on delete restrict,
  liste_no text,
  durum text not null default 'taslak' check (durum in ('taslak', 'bekliyor', 'sonuclandi')),
  gonderen_ad text check (gonderen_ad is null or char_length(gonderen_ad) <= 80),
  gonderim_zamani timestamptz,
  karar_veren_email text,
  karar_zamani timestamptz,
  karar_notu text check (karar_notu is null or char_length(karar_notu) <= 500),
  -- Mail durumlari: null = henuz yok, 'gonderildi', 'hata'
  gonderim_maili text check (gonderim_maili is null or gonderim_maili in ('gonderildi', 'hata')),
  gonderim_maili_hata text,
  sonuc_maili text check (sonuc_maili is null or sonuc_maili in ('gonderildi', 'hata')),
  sonuc_maili_hata text,
  -- Cek listesi (onaylanan kalemler): girissiz isaretleme baglantisi
  cek_token text check (cek_token is null or cek_token ~ '^[0-9a-f]{32}$'),
  cek_durumu text check (cek_durumu is null or cek_durumu in ('aktif', 'tamamlandi')),
  cek_tamamlanma timestamptz,
  olusturma timestamptz not null default now(),
  guncelleme timestamptz not null default now(),
  constraint satin_alma_liste_tutarli check (
    (durum = 'taslak' and liste_no is null and gonderim_zamani is null)
    or (durum <> 'taslak' and liste_no is not null and gonderim_zamani is not null)
  )
);
create unique index if not exists uq_satin_alma_liste_no on public.satin_alma_listeleri (liste_no) where liste_no is not null;
-- Departman basina TEK acik taslak (ortak liste)
create unique index if not exists uq_satin_alma_tek_taslak on public.satin_alma_listeleri (departman_id) where durum = 'taslak';
create unique index if not exists uq_satin_alma_cek_token on public.satin_alma_listeleri (cek_token) where cek_token is not null;
create index if not exists ix_satin_alma_liste_durum on public.satin_alma_listeleri (company_id, durum, gonderim_zamani desc);

create table if not exists public.satin_alma_kalemleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  liste_id uuid not null references public.satin_alma_listeleri(id) on delete cascade,
  kategori text not null check (kategori in ('kirtasiye', 'temizlik', 'mutfak', 'elektronik', 'is_guvenligi', 'diger')),
  urun text not null check (char_length(btrim(urun)) between 2 and 200),
  miktar numeric(12, 2) not null check (miktar > 0 and miktar <= 1000000),
  birim text not null check (birim in ('adet', 'paket', 'koli', 'kutu', 'top', 'kg', 'litre', 'metre', 'takim', 'diger')),
  aciliyet text not null default 'normal' check (aciliyet in ('normal', 'acil')),
  aciklama text check (aciklama is null or char_length(aciklama) <= 500),
  talep_eden text not null check (char_length(btrim(talep_eden)) between 2 and 80),
  karar text not null default 'bekliyor' check (karar in ('bekliyor', 'onaylandi', 'reddedildi')),
  red_nedeni text check (red_nedeni is null or char_length(red_nedeni) <= 300),
  -- Cek listesi: onaylanan kalem alindi mi
  alindi boolean not null default false,
  alinma_zamani timestamptz,
  alan_ad text check (alan_ad is null or char_length(alan_ad) <= 80),
  olusturma timestamptz not null default now(),
  constraint satin_alma_alindi_onayli check (not alindi or karar = 'onaylandi')
);
create index if not exists ix_satin_alma_kalem_liste on public.satin_alma_kalemleri (liste_id, olusturma);

comment on table public.satin_alma_departmanlari is 'Satin alma talebi: departmanlar + girissiz talep linki token''i (26.10.2026).';
comment on table public.satin_alma_listeleri is 'Satin alma ihtiyac listeleri: taslak -> bekliyor -> sonuclandi (26.10.2026).';
comment on table public.satin_alma_kalemleri is 'Satin alma listesi kalemleri; onay/red kalem bazinda (26.10.2026).';

-- guncelleme zamani
create or replace function public.satin_alma_guncelleme_zamani()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  new.guncelleme := now();
  return new;
end; $function$;

drop trigger if exists satin_alma_departman_guncelleme on public.satin_alma_departmanlari;
create trigger satin_alma_departman_guncelleme before update on public.satin_alma_departmanlari
  for each row execute function public.satin_alma_guncelleme_zamani();
drop trigger if exists satin_alma_liste_guncelleme on public.satin_alma_listeleri;
create trigger satin_alma_liste_guncelleme before update on public.satin_alma_listeleri
  for each row execute function public.satin_alma_guncelleme_zamani();

-- Denetim kayitlari (diger tablolarla ayni mekanizma)
drop trigger if exists denetim_satin_alma_departmanlari on public.satin_alma_departmanlari;
create trigger denetim_satin_alma_departmanlari after insert or update or delete on public.satin_alma_departmanlari
  for each row execute function public.denetim_tetikleyici();
drop trigger if exists denetim_satin_alma_listeleri on public.satin_alma_listeleri;
create trigger denetim_satin_alma_listeleri after insert or update or delete on public.satin_alma_listeleri
  for each row execute function public.denetim_tetikleyici();
drop trigger if exists denetim_satin_alma_kalemleri on public.satin_alma_kalemleri;
create trigger denetim_satin_alma_kalemleri after insert or update or delete on public.satin_alma_kalemleri
  for each row execute function public.denetim_tetikleyici();

-- ---------------------------------------------------------------------------
-- 2) RLS: yetkili kullanici SADECE OKUR (yazmalar fonksiyonlarla)
-- ---------------------------------------------------------------------------
alter table public.satin_alma_departmanlari enable row level security;
alter table public.satin_alma_listeleri enable row level security;
alter table public.satin_alma_kalemleri enable row level security;

drop policy if exists "Satin alma yetkilisi okur" on public.satin_alma_departmanlari;
create policy "Satin alma yetkilisi okur" on public.satin_alma_departmanlari for select to authenticated
  using (company_id = get_auth_company_id() and ic_sayfa_yetkisi('satin_alma'));
drop policy if exists "Satin alma yetkilisi okur" on public.satin_alma_listeleri;
create policy "Satin alma yetkilisi okur" on public.satin_alma_listeleri for select to authenticated
  using (company_id = get_auth_company_id() and ic_sayfa_yetkisi('satin_alma'));
drop policy if exists "Satin alma yetkilisi okur" on public.satin_alma_kalemleri;
create policy "Satin alma yetkilisi okur" on public.satin_alma_kalemleri for select to authenticated
  using (company_id = get_auth_company_id() and ic_sayfa_yetkisi('satin_alma'));

revoke all on table public.satin_alma_departmanlari, public.satin_alma_listeleri, public.satin_alma_kalemleri from anon, authenticated, public;
grant select on table public.satin_alma_departmanlari, public.satin_alma_listeleri, public.satin_alma_kalemleri to authenticated;
grant all on table public.satin_alma_departmanlari, public.satin_alma_listeleri, public.satin_alma_kalemleri to service_role;
revoke all on sequence public.satin_alma_liste_sira from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 3) Ortak yardimcilar
-- ---------------------------------------------------------------------------
-- Bir listenin mail / ekran verisi (kalemlerle)
create or replace function public.sa_liste_json(p_liste_id uuid)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', l.id, 'liste_no', l.liste_no, 'durum', l.durum,
    'departman', d.ad, 'departman_id', d.id, 'sirket', c.company_name,
    'gonderen_ad', l.gonderen_ad, 'gonderim_zamani', l.gonderim_zamani,
    'karar_veren_email', l.karar_veren_email, 'karar_zamani', l.karar_zamani, 'karar_notu', l.karar_notu,
    'gonderim_maili', l.gonderim_maili, 'sonuc_maili', l.sonuc_maili,
    'cek_durumu', l.cek_durumu, 'cek_tamamlanma', l.cek_tamamlanma,
    'kalemler', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'kategori', k.kategori, 'urun', k.urun, 'miktar', k.miktar, 'birim', k.birim,
        'aciliyet', k.aciliyet, 'aciklama', k.aciklama, 'talep_eden', k.talep_eden,
        'karar', k.karar, 'red_nedeni', k.red_nedeni, 'olusturma', k.olusturma,
        'alindi', k.alindi, 'alinma_zamani', k.alinma_zamani, 'alan_ad', k.alan_ad)
        order by k.olusturma, k.id)
      from public.satin_alma_kalemleri k where k.liste_id = l.id), '[]'::jsonb))
  from public.satin_alma_listeleri l
  join public.satin_alma_departmanlari d on d.id = l.departman_id
  join public.companies c on c.id = l.company_id
  where l.id = p_liste_id;
$function$;

-- Token -> aktif departman (gecersiz / pasif ise null)
create or replace function public.sa_token_departman(p_token text)
 returns public.satin_alma_departmanlari
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select d.* from public.satin_alma_departmanlari d
  where p_token ~ '^[0-9a-f]{32}$' and d.token = p_token and d.aktif
  limit 1;
$function$;

-- ---------------------------------------------------------------------------
-- 4) Girissiz departman sayfasi (SADECE service_role / edge function)
-- ---------------------------------------------------------------------------
create or replace function public.sa_token_bilgi(p_token text)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  d public.satin_alma_departmanlari;
  v_taslak uuid;
begin
  d := public.sa_token_departman(p_token);
  if d.id is null then return null; end if;
  select l.id into v_taslak from public.satin_alma_listeleri l where l.departman_id = d.id and l.durum = 'taslak';
  return jsonb_build_object(
    'departman', d.ad,
    'sirket', (select c.company_name from public.companies c where c.id = d.company_id),
    'taslak', case when v_taslak is null then null else public.sa_liste_json(v_taslak) end,
    'gecmis', coalesce((
      select jsonb_agg(public.sa_liste_json(x.id) order by x.gonderim_zamani desc)
      from (select l.id, l.gonderim_zamani from public.satin_alma_listeleri l
            where l.departman_id = d.id and l.durum <> 'taslak'
            order by l.gonderim_zamani desc limit 10) x), '[]'::jsonb),
    -- Departman gecmisi: onaylanan TUM alimlar (en yeni 300 kalem)
    'onaylananlar', coalesce((
      select jsonb_agg(y.j order by y.karar_zamani desc, y.olusturma)
      from (select jsonb_build_object('id', k.id, 'liste_no', l.liste_no, 'karar_zamani', l.karar_zamani,
                     'kategori', k.kategori, 'urun', k.urun, 'miktar', k.miktar, 'birim', k.birim, 'talep_eden', k.talep_eden,
                     'alindi', k.alindi, 'alinma_zamani', k.alinma_zamani) as j, l.karar_zamani, k.olusturma
            from public.satin_alma_kalemleri k
            join public.satin_alma_listeleri l on l.id = k.liste_id
            where l.departman_id = d.id and l.durum = 'sonuclandi' and k.karar = 'onaylandi'
            order by l.karar_zamani desc, k.olusturma limit 300) y), '[]'::jsonb)
  );
end; $function$;

create or replace function public.sa_token_kalem_ekle(p_token text, p_kalem jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d public.satin_alma_departmanlari;
  v_liste uuid;
  v_id uuid;
  v_miktar numeric;
begin
  d := public.sa_token_departman(p_token);
  if d.id is null then
    raise exception 'Bağlantı geçersiz veya departman pasif.' using errcode = 'P0002';
  end if;
  -- Departmanin acik taslagi (yoksa acilir). Ayni anda iki ekleme -> tekil indeks; tekrar okunur.
  select l.id into v_liste from public.satin_alma_listeleri l where l.departman_id = d.id and l.durum = 'taslak' for update;
  if v_liste is null then
    begin
      insert into public.satin_alma_listeleri (company_id, departman_id) values (d.company_id, d.id) returning id into v_liste;
    exception when unique_violation then
      select l.id into v_liste from public.satin_alma_listeleri l where l.departman_id = d.id and l.durum = 'taslak' for update;
    end;
  end if;
  if (select count(*) from public.satin_alma_kalemleri k where k.liste_id = v_liste) >= 100 then
    raise exception 'Bir listede en fazla 100 kalem olabilir. Listeyi gönderip yenisine devam edin.' using errcode = '23514';
  end if;
  begin
    v_miktar := round((p_kalem ->> 'miktar')::numeric, 2);
  exception when others then
    raise exception 'Miktar geçersiz.' using errcode = '23514';
  end;
  if v_miktar is null or v_miktar <= 0 or v_miktar > 1000000 then
    raise exception 'Miktar 0''dan büyük olmalı.' using errcode = '23514';
  end if;
  if coalesce(p_kalem ->> 'kategori', '') not in ('kirtasiye', 'temizlik', 'mutfak', 'elektronik', 'is_guvenligi', 'diger') then
    raise exception 'Kategori seçin.' using errcode = '23514';
  end if;
  if coalesce(p_kalem ->> 'birim', '') not in ('adet', 'paket', 'koli', 'kutu', 'top', 'kg', 'litre', 'metre', 'takim', 'diger') then
    raise exception 'Birim seçin.' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_kalem ->> 'urun', ''))) not between 2 and 200 then
    raise exception 'Ürün adını yazın (2–200 karakter).' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_kalem ->> 'talep_eden', ''))) not between 2 and 80 then
    raise exception 'Adınızı ve soyadınızı yazın.' using errcode = '23514';
  end if;
  if char_length(coalesce(p_kalem ->> 'aciklama', '')) > 500 then
    raise exception 'Not en fazla 500 karakter olabilir.' using errcode = '23514';
  end if;
  insert into public.satin_alma_kalemleri (company_id, liste_id, kategori, urun, miktar, birim, aciliyet, aciklama, talep_eden)
  values (
    d.company_id, v_liste, p_kalem ->> 'kategori', btrim(p_kalem ->> 'urun'), v_miktar, p_kalem ->> 'birim',
    case when p_kalem ->> 'aciliyet' = 'acil' then 'acil' else 'normal' end,
    nullif(btrim(coalesce(p_kalem ->> 'aciklama', '')), ''),
    btrim(p_kalem ->> 'talep_eden'))
  returning id into v_id;
  update public.satin_alma_listeleri set guncelleme = now() where id = v_liste;
  return v_id;
end; $function$;

create or replace function public.sa_token_kalem_sil(p_token text, p_kalem_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d public.satin_alma_departmanlari;
  v_silinen int;
begin
  d := public.sa_token_departman(p_token);
  if d.id is null then
    raise exception 'Bağlantı geçersiz veya departman pasif.' using errcode = 'P0002';
  end if;
  -- SADECE bu departmanin ACIK TASLAGINDAKI kalem silinebilir
  delete from public.satin_alma_kalemleri k
  using public.satin_alma_listeleri l
  where k.id = p_kalem_id and k.liste_id = l.id and l.departman_id = d.id and l.durum = 'taslak';
  get diagnostics v_silinen = row_count;
  if v_silinen = 0 then
    raise exception 'Kalem bulunamadı ya da liste zaten gönderilmiş.' using errcode = 'P0002';
  end if;
  return true;
end; $function$;

-- Taslagi gonderir: numara verir, durum 'bekliyor'. Donus = mail verisi.
create or replace function public.sa_token_liste_gonder(p_token text, p_gonderen text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d public.satin_alma_departmanlari;
  v_liste uuid;
  v_ad text := btrim(coalesce(p_gonderen, ''));
  v_yil text;
begin
  d := public.sa_token_departman(p_token);
  if d.id is null then
    raise exception 'Bağlantı geçersiz veya departman pasif.' using errcode = 'P0002';
  end if;
  if char_length(v_ad) not between 2 and 80 then
    raise exception 'Gönderen olarak adınızı ve soyadınızı yazın.' using errcode = '23514';
  end if;
  select l.id into v_liste from public.satin_alma_listeleri l where l.departman_id = d.id and l.durum = 'taslak' for update;
  if v_liste is null or not exists (select 1 from public.satin_alma_kalemleri k where k.liste_id = v_liste) then
    raise exception 'Gönderilecek kalem yok. Önce listeye kalem ekleyin.' using errcode = '23514';
  end if;
  -- Kotuye kullanim: departman basina 24 saatte en fazla 10 gonderim (her biri mail atar)
  if (select count(*) from public.satin_alma_listeleri l
      where l.departman_id = d.id and l.gonderim_zamani > now() - interval '24 hours') >= 10 then
    raise exception 'Bu departmandan son 24 saatte 10 liste gönderildi. Lütfen daha sonra tekrar deneyin.' using errcode = '23514';
  end if;
  v_yil := extract(year from (now() at time zone 'Europe/Istanbul'))::text;
  update public.satin_alma_listeleri
     set durum = 'bekliyor', gonderen_ad = v_ad, gonderim_zamani = now(),
         liste_no = 'SA-' || v_yil || '-' || lpad(pg_catalog.nextval('public.satin_alma_liste_sira'::regclass)::text, 4, '0')
   where id = v_liste;
  return public.sa_liste_json(v_liste);
end; $function$;

-- Mail sonucu (edge function yazar)
create or replace function public.sa_mail_sonuc(p_liste_id uuid, p_tur text, p_basarili boolean, p_hata text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if p_tur = 'gonderim' then
    update public.satin_alma_listeleri
       set gonderim_maili = case when p_basarili then 'gonderildi' else 'hata' end,
           gonderim_maili_hata = case when p_basarili then null else left(p_hata, 500) end
     where id = p_liste_id;
  elsif p_tur = 'sonuc' then
    update public.satin_alma_listeleri
       set sonuc_maili = case when p_basarili then 'gonderildi' else 'hata' end,
           sonuc_maili_hata = case when p_basarili then null else left(p_hata, 500) end
     where id = p_liste_id;
  else
    raise exception 'Geçersiz mail türü.' using errcode = '22023';
  end if;
end; $function$;

-- ---------------------------------------------------------------------------
-- 5) Uygulama ici (authenticated + "satin_alma" yetkisi)
-- ---------------------------------------------------------------------------
create or replace function public.sa_yetki_kontrol()
 returns uuid
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := get_auth_company_id();
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('satin_alma') then
    raise exception 'Satın alma işlemleri için yetkiniz yok.' using errcode = '42501';
  end if;
  return v_sirket;
end; $function$;

-- Burak Bey'in karari: p_kararlar = [{"id": kalem, "karar": "onaylandi"|"reddedildi", "red_nedeni": "..."}]
-- Listedeki HER kalem icin karar zorunlu; liste 'sonuclandi' olur. Donus = mail verisi.
create or replace function public.sa_karar_ver(p_liste_id uuid, p_kararlar jsonb, p_not text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.sa_yetki_kontrol();
  v_durum text;
  v_toplam int;
  v_eslesen int;
  r jsonb;
begin
  select l.durum into v_durum from public.satin_alma_listeleri l
   where l.id = p_liste_id and l.company_id = v_sirket for update;
  if v_durum is null then
    raise exception 'Liste bulunamadı.' using errcode = 'P0002';
  end if;
  if v_durum <> 'bekliyor' then
    raise exception 'Bu liste için karar zaten verilmiş.' using errcode = '23514';
  end if;
  if jsonb_typeof(p_kararlar) is distinct from 'array' then
    raise exception 'Karar listesi geçersiz.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_not, '')) > 500 then
    raise exception 'Not en fazla 500 karakter olabilir.' using errcode = '23514';
  end if;
  select count(*) into v_toplam from public.satin_alma_kalemleri k where k.liste_id = p_liste_id;
  select count(distinct k.id) into v_eslesen
    from jsonb_array_elements(p_kararlar) e
    join public.satin_alma_kalemleri k on k.id = (e ->> 'id')::uuid and k.liste_id = p_liste_id
   where e ->> 'karar' in ('onaylandi', 'reddedildi');
  if v_eslesen <> v_toplam or jsonb_array_length(p_kararlar) <> v_toplam then
    raise exception 'Listedeki her kalem için onay ya da red seçin.' using errcode = '23514';
  end if;
  for r in select * from jsonb_array_elements(p_kararlar) loop
    if char_length(coalesce(r ->> 'red_nedeni', '')) > 300 then
      raise exception 'Red nedeni en fazla 300 karakter olabilir.' using errcode = '23514';
    end if;
    update public.satin_alma_kalemleri
       set karar = r ->> 'karar',
           red_nedeni = case when r ->> 'karar' = 'reddedildi' then nullif(btrim(coalesce(r ->> 'red_nedeni', '')), '') else null end
     where id = (r ->> 'id')::uuid and liste_id = p_liste_id;
  end loop;
  -- Onaylanan kalem varsa AKTIF cek listesi (execution@ girissiz baglantiyla isaretler)
  update public.satin_alma_listeleri
     set durum = 'sonuclandi', karar_zamani = now(),
         karar_veren_email = lower(nullif(coalesce(auth.jwt() ->> 'email', ''), '')),
         karar_notu = nullif(btrim(coalesce(p_not, '')), ''),
         cek_token = case when exists (select 1 from public.satin_alma_kalemleri k where k.liste_id = p_liste_id and k.karar = 'onaylandi')
                          then replace(gen_random_uuid()::text, '-', '') end,
         cek_durumu = case when exists (select 1 from public.satin_alma_kalemleri k where k.liste_id = p_liste_id and k.karar = 'onaylandi')
                           then 'aktif' end
   where id = p_liste_id;
  return public.sa_liste_json(p_liste_id)
    || jsonb_build_object('cek_token', (select l.cek_token from public.satin_alma_listeleri l where l.id = p_liste_id));
end; $function$;

-- Maili tekrar gondermek icin liste verisi (yetki kontrollu)
create or replace function public.sa_liste_mail_verisi(p_liste_id uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.sa_yetki_kontrol();
begin
  if not exists (select 1 from public.satin_alma_listeleri l where l.id = p_liste_id and l.company_id = v_sirket and l.durum <> 'taslak') then
    raise exception 'Liste bulunamadı.' using errcode = 'P0002';
  end if;
  return public.sa_liste_json(p_liste_id)
    || jsonb_build_object('cek_token', (select l.cek_token from public.satin_alma_listeleri l where l.id = p_liste_id));
end; $function$;

-- Cek listesi kalemini isaretler (ortak kural). Liste durumu kendiliginden guncellenir.
create or replace function public.sa_cek_uygula(p_liste_id uuid, p_kalem_id uuid, p_alindi boolean, p_ad text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cek text;
  v_kalan int;
begin
  select l.cek_durumu into v_cek from public.satin_alma_listeleri l where l.id = p_liste_id for update;
  if v_cek is null then
    raise exception 'Bu liste için çek listesi yok.' using errcode = 'P0002';
  end if;
  update public.satin_alma_kalemleri
     set alindi = coalesce(p_alindi, false),
         alinma_zamani = case when coalesce(p_alindi, false) then now() end,
         alan_ad = case when coalesce(p_alindi, false) then nullif(left(btrim(coalesce(p_ad, '')), 80), '') end
   where id = p_kalem_id and liste_id = p_liste_id and karar = 'onaylandi';
  if not found then
    raise exception 'Kalem bulunamadı ya da onaylanmamış.' using errcode = 'P0002';
  end if;
  select count(*) into v_kalan from public.satin_alma_kalemleri k
   where k.liste_id = p_liste_id and k.karar = 'onaylandi' and not k.alindi;
  update public.satin_alma_listeleri
     set cek_durumu = case when v_kalan = 0 then 'tamamlandi' else 'aktif' end,
         cek_tamamlanma = case when v_kalan = 0 then coalesce(cek_tamamlanma, now()) end
   where id = p_liste_id;
  return public.sa_liste_json(p_liste_id);
end; $function$;

-- Girissiz cek listesi sayfasi (/cek/[token]) - SADECE service_role
create or replace function public.sa_cek_bilgi(p_token text)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select public.sa_liste_json(l.id)
  from public.satin_alma_listeleri l
  where p_token ~ '^[0-9a-f]{32}$' and l.cek_token = p_token and l.cek_durumu is not null
  limit 1;
$function$;

create or replace function public.sa_cek_token_isaretle(p_token text, p_kalem_id uuid, p_alindi boolean, p_ad text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_liste uuid;
begin
  select l.id into v_liste from public.satin_alma_listeleri l
   where p_token ~ '^[0-9a-f]{32}$' and l.cek_token = p_token and l.cek_durumu is not null;
  if v_liste is null then
    raise exception 'Bağlantı geçersiz.' using errcode = 'P0002';
  end if;
  return public.sa_cek_uygula(v_liste, p_kalem_id, p_alindi, p_ad);
end; $function$;

-- Uygulama icinden (yetkili) isaretleme
create or replace function public.sa_cek_isaretle(p_kalem_id uuid, p_alindi boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.sa_yetki_kontrol();
  v_liste uuid;
begin
  select k.liste_id into v_liste from public.satin_alma_kalemleri k
   where k.id = p_kalem_id and k.company_id = v_sirket;
  if v_liste is null then
    raise exception 'Kalem bulunamadı.' using errcode = 'P0002';
  end if;
  return public.sa_cek_uygula(v_liste, p_kalem_id, p_alindi, lower(nullif(coalesce(auth.jwt() ->> 'email', ''), '')));
end; $function$;

-- Departman ekle / guncelle (p_id null -> yeni)
create or replace function public.sa_departman_kaydet(p_id uuid, p_ad text, p_aktif boolean default true)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.sa_yetki_kontrol();
  v_ad text := regexp_replace(btrim(coalesce(p_ad, '')), '\s+', ' ', 'g');
  v_id uuid;
begin
  if char_length(v_ad) not between 2 and 60 then
    raise exception 'Departman adı 2–60 karakter olmalı.' using errcode = '23514';
  end if;
  if exists (select 1 from public.satin_alma_departmanlari d
             where d.company_id = v_sirket and lower(d.ad) = lower(v_ad) and d.id is distinct from p_id) then
    raise exception 'Bu adla bir departman zaten var.' using errcode = '23505';
  end if;
  if p_id is null then
    insert into public.satin_alma_departmanlari (company_id, ad, aktif, sira)
    values (v_sirket, v_ad, coalesce(p_aktif, true),
            coalesce((select max(sira) + 1 from public.satin_alma_departmanlari where company_id = v_sirket), 0))
    returning id into v_id;
  else
    update public.satin_alma_departmanlari set ad = v_ad, aktif = coalesce(p_aktif, aktif)
     where id = p_id and company_id = v_sirket returning id into v_id;
    if v_id is null then
      raise exception 'Departman bulunamadı.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end; $function$;

-- Link sizdiysa: yeni token (eski link hemen gecersiz olur)
create or replace function public.sa_departman_token_yenile(p_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.sa_yetki_kontrol();
  v_token text;
begin
  update public.satin_alma_departmanlari set token = replace(gen_random_uuid()::text, '-', '')
   where id = p_id and company_id = v_sirket returning token into v_token;
  if v_token is null then
    raise exception 'Departman bulunamadı.' using errcode = 'P0002';
  end if;
  return v_token;
end; $function$;

-- ---------------------------------------------------------------------------
-- 6) Fonksiyon erisimleri
-- ---------------------------------------------------------------------------
revoke all on function public.sa_liste_json(uuid) from public, anon, authenticated;
revoke all on function public.sa_token_departman(text) from public, anon, authenticated;
revoke all on function public.sa_token_bilgi(text) from public, anon, authenticated;
revoke all on function public.sa_token_kalem_ekle(text, jsonb) from public, anon, authenticated;
revoke all on function public.sa_token_kalem_sil(text, uuid) from public, anon, authenticated;
revoke all on function public.sa_token_liste_gonder(text, text) from public, anon, authenticated;
revoke all on function public.sa_mail_sonuc(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.sa_yetki_kontrol() from public, anon, authenticated;
revoke all on function public.sa_karar_ver(uuid, jsonb, text) from public, anon;
revoke all on function public.sa_liste_mail_verisi(uuid) from public, anon;
revoke all on function public.sa_departman_kaydet(uuid, text, boolean) from public, anon;
revoke all on function public.sa_departman_token_yenile(uuid) from public, anon;
revoke all on function public.satin_alma_guncelleme_zamani() from public, anon, authenticated;
revoke all on function public.sa_cek_uygula(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.sa_cek_bilgi(text) from public, anon, authenticated;
revoke all on function public.sa_cek_token_isaretle(text, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.sa_cek_isaretle(uuid, boolean) from public, anon;

grant execute on function public.sa_token_bilgi(text), public.sa_token_kalem_ekle(text, jsonb),
  public.sa_token_kalem_sil(text, uuid), public.sa_token_liste_gonder(text, text),
  public.sa_mail_sonuc(uuid, text, boolean, text), public.sa_cek_bilgi(text),
  public.sa_cek_token_isaretle(text, uuid, boolean, text) to service_role;
grant execute on function public.sa_karar_ver(uuid, jsonb, text), public.sa_liste_mail_verisi(uuid),
  public.sa_departman_kaydet(uuid, text, boolean), public.sa_departman_token_yenile(uuid),
  public.sa_cek_isaretle(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Baslangic verisi (Unex): ekteki formdaki 5 departman + super admin yetkisi
-- ---------------------------------------------------------------------------
insert into public.satin_alma_departmanlari (company_id, ad, sira)
select c.id, v.ad, v.sira
from public.companies c
cross join (values ('İhracat Operasyon', 1), ('Muhasebe / Finans', 2), ('İnsan Kaynakları', 3),
                   ('Üretim / Depo', 4), ('Satış / Pazarlama', 5)) v(ad, sira)
where c.id = '387edff1-3aa6-41a4-a370-e42135017043'
on conflict do nothing;

update public.kullanici_yetkileri
   set sayfa_yetkileri = coalesce(sayfa_yetkileri, '{}'::jsonb) || '{"satin_alma": true}'::jsonb
 where lower(email) in ('volkandurgut.tr@gmail.com', 'bbt@unex.com.tr');
