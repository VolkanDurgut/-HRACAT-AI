-- ============================================================================
-- IC PIYASA - ALIS SIPARISLERI + GELEN ARAC (KANTAR) + DOGRUDAN SEVK (30.10.2026)
-- ============================================================================
-- Kullanici: "Ic piyasa kismini artik bizimle esitlemek istiyorum. Hem satis
-- hem alis var." Lojistigin Excel'i (SATIS + ALIS SIPARIS RAPORU) esas alindi.
-- Kararlar (30.10.2026):
--  - Teslim alinan araci KANTARCI girer (Kantar Paneli > Gelen Arac).
--  - TMO'dan cekilip dogrudan musteriye giden arac TEK kayitla iki tarafa
--    sayilir: alis teslimi + satis sevki (ic_sevkler) birbirine baglanir.
--  - Alis fiyati / tedarikci bilgisi AYRI sayfa yetkisi: "ic_alis".
--
-- SADECE EKLEME. Ihracat tablolarina ve satis tablolarina (ic_musteriler,
-- ic_is_emirleri, ic_sevkler) DOKUNMAZ. Mevcut fonksiyonlardan sadece
-- ic_belge_silinebilir genisletilir (eski kosullar AYNEN korunur) ve depo
-- politikalari "alis/" klasorunu kapsayacak sekilde yeniden olusturulur
-- (eski kosullar AYNEN korunur).
--
-- Yeni: ic_tedarikciler, ic_alis_siparisleri (AS-YYYY-NNNN), ic_alis_teslimler,
-- sayac ic_alis_sira, kantar fonksiyonlari kantar_ic_alis_siparisleri /
-- kantar_ic_alis_son_teslimler / kantar_ic_alis_teslim_ekle, yetkili
-- fonksiyonlari ic_alis_gecmis_teslim_ekle / ic_alis_teslim_sil.
-- ============================================================================

create sequence if not exists public.ic_alis_sira;

-- ---------------------------------------------------------------------------
-- 1) Tedarikciler
-- ---------------------------------------------------------------------------
create table if not exists public.ic_tedarikciler (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  unvan text not null check (btrim(unvan) <> '' and char_length(unvan) <= 200),
  kisa_ad text check (kisa_ad is null or char_length(kisa_ad) <= 60),
  vergi_dairesi text,
  vergi_no text check (vergi_no is null or vergi_no ~ '^[0-9]{10,11}$'),
  adres text,
  yetkili_ad text,
  telefon text check (telefon is null or telefon ~ '^[0-9]{10,15}$'),
  eposta text,
  notlar text,
  aktif boolean not null default true,
  olusturan uuid default auth.uid(),
  olusturma timestamptz not null default now(),
  guncelleme timestamptz not null default now()
);
create unique index if not exists uq_ic_tedarikciler_unvan on public.ic_tedarikciler (company_id, upper(btrim(unvan)));
create unique index if not exists uq_ic_tedarikciler_vergi_no on public.ic_tedarikciler (company_id, vergi_no) where vergi_no is not null;
alter table public.ic_tedarikciler enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Alis siparisleri
-- ---------------------------------------------------------------------------
create table if not exists public.ic_alis_siparisleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  alis_no text unique,
  tedarikci_id uuid not null references public.ic_tedarikciler(id) on delete restrict,
  siparis_tarihi date not null default ((now() at time zone 'Europe/Istanbul')::date),
  urun text not null check (btrim(urun) <> '' and char_length(urun) <= 80),
  urun_kodu text check (urun_kodu is null or char_length(urun_kodu) <= 20),
  depo text check (depo is null or char_length(depo) <= 80),
  tedarikci_siparis_no text check (tedarikci_siparis_no is null or char_length(tedarikci_siparis_no) <= 60),
  miktar_kg numeric(14, 2) not null check (miktar_kg > 0 and miktar_kg <= 100000000),
  birim_fiyat numeric(14, 4) check (birim_fiyat is null or birim_fiyat >= 0),
  para_birimi text not null default 'TRY' check (para_birimi in ('TRY', 'USD', 'EUR')),
  kdv_dahil boolean not null default false,
  vade_gun integer check (vade_gun is null or (vade_gun >= 0 and vade_gun <= 365)),
  termin date,
  teslim text not null default 'adresten' check (teslim in ('adresten', 'fabrika')),
  notlar text,
  durum text not null default 'acik' check (durum in ('acik', 'tamamlandi', 'iptal')),
  kapanis_zamani timestamptz,
  olusturan uuid default auth.uid(),
  olusturan_email text,
  olusturma timestamptz not null default now(),
  guncelleme timestamptz not null default now()
);
create index if not exists idx_ic_alis_company on public.ic_alis_siparisleri (company_id, durum, siparis_tarihi desc);
create index if not exists idx_ic_alis_tedarikci on public.ic_alis_siparisleri (tedarikci_id);
alter table public.ic_alis_siparisleri enable row level security;

-- ---------------------------------------------------------------------------
-- 3) Teslim alinan araclar (her arac / parti bir satir)
-- ---------------------------------------------------------------------------
-- sevk_id: dogrudan musteriye giden arac -> ayni aracin satis sevki (ic_sevkler).
-- Satis kaydi Is Emirleri'nden silinirse baglanti kopar (SET NULL), alis
-- teslimi durur (arac fiilen teslim alinmistir).
-- gecmis: sistem oncesi (Excel'den esitleme) kayit = PARTI; plaka bos olabilir ve
-- tek arac sinirina (60 ton) tabi degildir (Excel'de bir gunun toplami tek kalemdir,
-- ornek 27.10: =51800+105740).
create table if not exists public.ic_alis_teslimler (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  alis_id uuid not null references public.ic_alis_siparisleri(id) on delete restrict,
  plaka text check (plaka is null or plaka ~ '^[A-Z0-9 ]{4,14}$'),
  dorse_plaka text,
  net_kg numeric(12, 2) not null check (net_kg > 0 and net_kg <= 5000000),
  teslim_zamani timestamptz not null default now(),
  irsaliye_no text,
  irsaliye_tarihi timestamptz,
  ettn text,
  irsaliye_dosya_yolu text,
  irsaliye_dosya_adi text,
  okunan jsonb,
  sevk_id uuid unique references public.ic_sevkler(id) on delete set null,
  gecmis boolean not null default false,
  elle_duzeltildi boolean not null default false,
  uyarilar text[] not null default '{}',
  notlar text check (notlar is null or char_length(notlar) <= 300),
  girilen uuid default auth.uid(),
  girilen_email text,
  olusturma timestamptz not null default now(),
  constraint ic_alis_teslim_plaka check (gecmis or plaka is not null),
  constraint ic_alis_teslim_arac_net check (gecmis or net_kg <= 60000)
);
create index if not exists idx_ic_alis_teslim_alis on public.ic_alis_teslimler (alis_id, teslim_zamani);
create index if not exists idx_ic_alis_teslim_company on public.ic_alis_teslimler (company_id, olusturma desc);
create unique index if not exists uq_ic_alis_teslim_irsaliye_no on public.ic_alis_teslimler (company_id, irsaliye_no) where irsaliye_no is not null;
create unique index if not exists uq_ic_alis_teslim_ettn on public.ic_alis_teslimler (company_id, ettn) where ettn is not null;
alter table public.ic_alis_teslimler enable row level security;

-- ---------------------------------------------------------------------------
-- 4) Tetikleyiciler
-- ---------------------------------------------------------------------------
drop trigger if exists ic_tedarikciler_guncelleme on public.ic_tedarikciler;
create trigger ic_tedarikciler_guncelleme before update on public.ic_tedarikciler
  for each row execute function public.ic_guncelleme_zamani();

-- Alis siparisi: numara SUNUCUDA; dogrulama numaradan ONCE (sayac bosluk birakmasin).
create or replace function public.ic_alis_hazirla()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  tr_gun date;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and (new.company_id is distinct from auth_company_id() or not ic_sayfa_yetkisi('ic_alis')) then
      raise exception 'Bu şirket için alış siparişi açma yetkiniz yok.' using errcode = '42501';
    end if;
    if new.urun is null or btrim(new.urun) = '' then
      raise exception 'Ürün boş olamaz.' using errcode = '23514';
    end if;
    if new.miktar_kg is null or new.miktar_kg <= 0 or new.miktar_kg > 100000000 then
      raise exception 'Sipariş miktarı geçersiz.' using errcode = '23514';
    end if;
    if new.birim_fiyat is not null and new.birim_fiyat < 0 then
      raise exception 'Birim fiyat geçersiz.' using errcode = '23514';
    end if;
    if new.vade_gun is not null and (new.vade_gun < 0 or new.vade_gun > 365) then
      raise exception 'Vade geçersiz.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.ic_tedarikciler t where t.id = new.tedarikci_id and t.company_id = new.company_id) then
      raise exception 'Tedarikçi bulunamadı.' using errcode = '23503';
    end if;
    new.durum := 'acik';
    new.kapanis_zamani := null;
    new.olusturma := now();
    new.guncelleme := now();
    new.olusturan := auth.uid();
    new.olusturan_email := lower(nullif(auth.jwt() ->> 'email', ''));
    tr_gun := (now() at time zone 'Europe/Istanbul')::date;
    new.alis_no := 'AS-' || extract(year from tr_gun)::text || '-'
      || lpad(pg_catalog.nextval('public.ic_alis_sira'::regclass)::text, 4, '0');
  else
    new.id := old.id;
    new.company_id := old.company_id;
    new.alis_no := old.alis_no;
    new.olusturan := old.olusturan;
    new.olusturan_email := old.olusturan_email;
    new.olusturma := old.olusturma;
    new.guncelleme := now();
    if new.tedarikci_id is distinct from old.tedarikci_id then
      if exists (select 1 from public.ic_alis_teslimler s where s.alis_id = old.id) then
        raise exception 'Teslim alınmış siparişin tedarikçisi değiştirilemez.' using errcode = '23514';
      end if;
      if not exists (select 1 from public.ic_tedarikciler t where t.id = new.tedarikci_id and t.company_id = new.company_id) then
        raise exception 'Tedarikçi bulunamadı.' using errcode = '23503';
      end if;
    end if;
    if new.durum is distinct from old.durum then
      new.kapanis_zamani := case when new.durum = 'acik' then null else now() end;
    end if;
  end if;
  return new;
end; $function$;

drop trigger if exists ic_alis_hazirla on public.ic_alis_siparisleri;
create trigger ic_alis_hazirla before insert or update on public.ic_alis_siparisleri
  for each row execute function public.ic_alis_hazirla();

-- Teslim kaydi sonradan DEGISMEZ (duzeltme = sil + yeniden gir); sadece
-- sevk_id'nin FK ile NULL'a dusmesine izin verilir.
create or replace function public.ic_alis_teslim_koru()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.sevk_id is null and old.sevk_id is not null
     and (to_jsonb(new) - 'sevk_id') = (to_jsonb(old) - 'sevk_id') then
    return new;
  end if;
  raise exception 'Teslim kaydı değiştirilemez; hatalıysa silip yeniden girin.' using errcode = '42501';
end; $function$;

drop trigger if exists ic_alis_teslim_koru on public.ic_alis_teslimler;
create trigger ic_alis_teslim_koru before update on public.ic_alis_teslimler
  for each row execute function public.ic_alis_teslim_koru();

drop trigger if exists denetim_ic_tedarikciler on public.ic_tedarikciler;
create trigger denetim_ic_tedarikciler after insert or update or delete on public.ic_tedarikciler
  for each row execute function public.denetim_tetikleyici();
drop trigger if exists denetim_ic_alis_siparisleri on public.ic_alis_siparisleri;
create trigger denetim_ic_alis_siparisleri after insert or update or delete on public.ic_alis_siparisleri
  for each row execute function public.denetim_tetikleyici();
drop trigger if exists denetim_ic_alis_teslimler on public.ic_alis_teslimler;
create trigger denetim_ic_alis_teslimler after insert or update or delete on public.ic_alis_teslimler
  for each row execute function public.denetim_tetikleyici();

-- ---------------------------------------------------------------------------
-- 5) RLS: sadece ic_alis yetkilisi, kendi sirketi
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['ic_tedarikciler', 'ic_alis_siparisleri'] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_select') then
      execute format('create policy %I on public.%I for select using (company_id = auth_company_id() and ic_sayfa_yetkisi(''ic_alis''))', t || '_select', t);
    end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_insert') then
      execute format('create policy %I on public.%I for insert with check (company_id = auth_company_id() and ic_sayfa_yetkisi(''ic_alis''))', t || '_insert', t);
    end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_update') then
      execute format('create policy %I on public.%I for update using (company_id = auth_company_id() and ic_sayfa_yetkisi(''ic_alis'')) with check (company_id = auth_company_id() and ic_sayfa_yetkisi(''ic_alis''))', t || '_update', t);
    end if;
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_delete') then
      execute format('create policy %I on public.%I for delete using (company_id = auth_company_id() and ic_sayfa_yetkisi(''ic_alis''))', t || '_delete', t);
    end if;
  end loop;
  -- Teslimler: okuma yetkilide; ekleme/silme SADECE fonksiyonlarla.
  if not exists (select 1 from pg_policies where tablename = 'ic_alis_teslimler' and policyname = 'ic_alis_teslimler_select') then
    create policy ic_alis_teslimler_select on public.ic_alis_teslimler for select
      using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_alis'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) Kantar Paneli fonksiyonlari (SECURITY DEFINER, FIYATSIZ)
-- ---------------------------------------------------------------------------
-- Tedarikci adi kantarciya ACIK gosterilir (TMO deposu / uretici; arac hangi
-- depodan geliyor bilinmeli). Fiyat, vade, tutar GOSTERILMEZ.
create or replace function public.kantar_ic_alis_siparisleri()
 returns table (
   id uuid, alis_no text, tedarikci text, depo text, urun text, urun_kodu text, teslim text,
   miktar_kg numeric, alinan_kg numeric, alinan_arac integer, termin date, siparis_tarihi date
 )
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_alis')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  return query
    select a.id, a.alis_no, coalesce(nullif(t.kisa_ad, ''), t.unvan), a.depo, a.urun, a.urun_kodu, a.teslim,
           a.miktar_kg, coalesce(sum(s.net_kg), 0)::numeric, (count(s.id) filter (where not s.gecmis))::integer, a.termin, a.siparis_tarihi
    from public.ic_alis_siparisleri a
    join public.ic_tedarikciler t on t.id = a.tedarikci_id
    left join public.ic_alis_teslimler s on s.alis_id = a.id
    where a.company_id = auth_company_id() and a.durum = 'acik'
    group by a.id, t.kisa_ad, t.unvan
    order by a.siparis_tarihi, a.olusturma;
end; $function$;

create or replace function public.kantar_ic_alis_son_teslimler(p_gun integer default 3)
 returns table (
   id uuid, alis_no text, tedarikci text, urun text, plaka text, dorse_plaka text, net_kg numeric,
   irsaliye_no text, irsaliye_dosya_yolu text, dogrudan_is_emri_no text, uyari_var boolean,
   gecmis boolean, girilen_email text, teslim_zamani timestamptz, olusturma timestamptz
 )
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_alis')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  return query
    select s.id, a.alis_no, coalesce(nullif(t.kisa_ad, ''), t.unvan), a.urun, s.plaka, s.dorse_plaka, s.net_kg,
           s.irsaliye_no, s.irsaliye_dosya_yolu, e.is_emri_no, cardinality(s.uyarilar) > 0,
           s.gecmis, s.girilen_email, s.teslim_zamani, s.olusturma
    from public.ic_alis_teslimler s
    join public.ic_alis_siparisleri a on a.id = s.alis_id
    join public.ic_tedarikciler t on t.id = a.tedarikci_id
    left join public.ic_sevkler v on v.id = s.sevk_id
    left join public.ic_is_emirleri e on e.id = v.is_emri_id
    where s.company_id = auth_company_id() and not s.gecmis
      and s.olusturma >= now() - make_interval(days => greatest(1, least(coalesce(p_gun, 3), 31)))
    order by s.olusturma desc;
end; $function$;

-- Gelen arac kaydi. p_kaydet=false -> sadece kontrol (uyarilar), true -> kayit.
-- p_veri: alis_id, plaka, dorse_plaka, net_kg, irsaliye_no, irsaliye_tarihi, ettn,
--         irsaliye_dosya_yolu, irsaliye_dosya_adi, elle_duzeltildi, okunan,
--         is_emri_id (DOGRUDAN SEVK: ayni arac bu satis is emrine de sevk sayilir),
--         alici_vkn, sofor_ad, irsaliye_urun, urun_uyusmuyor (satis kontrolune gider).
-- Dogrudan sevkte irsaliye PDF'i ZORUNLU ve satis klasorundedir
-- ({sirket}/irsaliye/{is_emri_id}/...); satis kaydi kantar_ic_sevk_ekle() ile
-- (ayni kurallar, ayni bildirim akisi) ACILIR, iki kayit ayni islemde baglanir.
create or replace function public.kantar_ic_alis_teslim_ekle(p_veri jsonb, p_kaydet boolean default false)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
  v_alis public.ic_alis_siparisleri%rowtype;
  v_plaka text;
  v_dorse text;
  v_net numeric;
  v_yol text;
  v_irs_no text;
  v_ettn text;
  v_tarih timestamptz;
  v_emir_id uuid;
  v_sevk jsonb;
  v_sevk_id uuid;
  v_uyarilar text[] := '{}';
  v_toplam_kg numeric;
  v_toplam_arac integer;
  v_id uuid;
  u text;
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_alis')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;

  begin
    select * into v_alis from public.ic_alis_siparisleri
      where id = (p_veri ->> 'alis_id')::uuid and company_id = v_sirket;
  exception when invalid_text_representation then
    v_alis := null;
  end;
  if v_alis.id is null then
    raise exception 'Alış siparişi bulunamadı.' using errcode = 'P0002';
  end if;
  if v_alis.durum <> 'acik' then
    raise exception 'Bu alış siparişi kapalı (%). Teslim girilemez.', v_alis.durum using errcode = '23514';
  end if;

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

  v_irs_no := nullif(upper(btrim(coalesce(p_veri ->> 'irsaliye_no', ''))), '');
  if v_irs_no is not null and v_irs_no !~ '^[A-Z0-9]{3,20}$' then
    raise exception 'İrsaliye no geçersiz: harf ve rakamlardan oluşan 3-20 karakter olmalı.' using errcode = '22023';
  end if;
  v_ettn := nullif(upper(btrim(coalesce(p_veri ->> 'ettn', ''))), '');
  begin
    v_tarih := nullif(p_veri ->> 'irsaliye_tarihi', '')::timestamptz;
  exception when others then
    v_tarih := null;
  end;

  begin
    v_emir_id := nullif(p_veri ->> 'is_emri_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Satış iş emri bulunamadı.' using errcode = 'P0002';
  end;

  v_yol := nullif(p_veri ->> 'irsaliye_dosya_yolu', '');
  if v_emir_id is not null then
    if v_yol is null then
      raise exception 'Doğrudan müşteriye giden araçta irsaliye PDF''i zorunlu.' using errcode = '22023';
    end if;
    -- Yol kontrolu satis fonksiyonunda (bu is emrinin irsaliye klasoru) yapilir.
  elsif v_yol is not null and v_yol not like v_sirket::text || '/alis/' || v_alis.id::text || '/%' then
    raise exception 'İrsaliye dosyası bu alış siparişine ait değil.' using errcode = '22023';
  end if;

  if v_irs_no is not null and exists (select 1 from public.ic_alis_teslimler where company_id = v_sirket and irsaliye_no = v_irs_no) then
    raise exception 'Bu irsaliye (%) daha önce teslim alınan araçlara girilmiş.', v_irs_no using errcode = '23505';
  end if;
  if v_ettn is not null and exists (select 1 from public.ic_alis_teslimler where company_id = v_sirket and ettn = v_ettn) then
    raise exception 'Bu irsaliye (ETTN) daha önce teslim alınan araçlara girilmiş.' using errcode = '23505';
  end if;

  -- Uyarilar (kaydi engellemez)
  if v_yol is null then
    v_uyarilar := array_append(v_uyarilar, 'İrsaliye eklenmedi.');
  elsif v_irs_no is null then
    v_uyarilar := array_append(v_uyarilar, 'İrsaliye numarası okunamadı.');
  end if;
  if coalesce((p_veri ->> 'elle_duzeltildi')::boolean, false) then
    v_uyarilar := array_append(v_uyarilar, 'Plaka veya net ağırlık irsaliyeden farklı girildi.');
  end if;
  if v_net > 35000 then
    v_uyarilar := array_append(v_uyarilar, 'Net ağırlık 35.000 kg üzerinde; kontrol edin.');
  end if;
  select coalesce(sum(net_kg), 0), count(*) filter (where not gecmis) into v_toplam_kg, v_toplam_arac
    from public.ic_alis_teslimler where alis_id = v_alis.id;
  -- Plaka bosluk farki gozetmeden ("22AB123" = "22 AB 123")
  if exists (select 1 from public.ic_alis_teslimler where alis_id = v_alis.id
             and replace(plaka, ' ', '') = replace(v_plaka, ' ', '')
             and olusturma >= now() - interval '12 hours') then
    v_uyarilar := array_append(v_uyarilar, 'Bu plaka son 12 saatte bu alış siparişine zaten girilmiş.');
  end if;
  if v_toplam_kg + v_net > v_alis.miktar_kg * 1.05 then
    v_uyarilar := array_append(v_uyarilar, 'Bu araçla alış siparişindeki miktar %5''ten fazla aşılıyor.');
  end if;

  -- Dogrudan sevk: satis tarafinin kontrolleri (kuru) / kaydi
  if v_emir_id is not null then
    v_sevk := public.kantar_ic_sevk_ekle(
      jsonb_build_object(
        'is_emri_id', v_emir_id, 'plaka', v_plaka, 'dorse_plaka', v_dorse, 'net_kg', v_net,
        'irsaliye_no', v_irs_no, 'irsaliye_tarihi', p_veri ->> 'irsaliye_tarihi', 'ettn', v_ettn,
        'sofor_ad', p_veri ->> 'sofor_ad', 'alici_vkn', p_veri ->> 'alici_vkn',
        'irsaliye_urun', p_veri ->> 'irsaliye_urun', 'irsaliye_dosya_yolu', v_yol,
        'irsaliye_dosya_adi', p_veri ->> 'irsaliye_dosya_adi',
        'elle_duzeltildi', coalesce((p_veri ->> 'elle_duzeltildi')::boolean, false),
        'urun_uyusmuyor', coalesce((p_veri ->> 'urun_uyusmuyor')::boolean, false),
        'okunan', p_veri -> 'okunan'
      ),
      coalesce(p_kaydet, false)
    );
    for u in select jsonb_array_elements_text(coalesce(v_sevk -> 'uyarilar', '[]'::jsonb)) loop
      if not (u = any(v_uyarilar)) then
        v_uyarilar := array_append(v_uyarilar, 'Satış: ' || u);
      end if;
    end loop;
  end if;

  if not coalesce(p_kaydet, false) then
    return jsonb_build_object('kaydedildi', false, 'uyarilar', to_jsonb(v_uyarilar), 'plaka', v_plaka, 'net_kg', v_net);
  end if;

  v_sevk_id := nullif(v_sevk ->> 'sevk_id', '')::uuid;
  if v_emir_id is not null and v_sevk_id is null then
    raise exception 'Satış kaydı açılamadı.' using errcode = 'P0001';
  end if;

  insert into public.ic_alis_teslimler (
    company_id, alis_id, plaka, dorse_plaka, net_kg, teslim_zamani, irsaliye_no, irsaliye_tarihi, ettn,
    irsaliye_dosya_yolu, irsaliye_dosya_adi, okunan, sevk_id, gecmis, elle_duzeltildi, uyarilar,
    girilen, girilen_email
  ) values (
    v_sirket, v_alis.id, v_plaka, v_dorse, v_net, now(), v_irs_no, v_tarih, v_ettn,
    v_yol, nullif(p_veri ->> 'irsaliye_dosya_adi', ''),
    case when jsonb_typeof(p_veri -> 'okunan') = 'object' then (p_veri -> 'okunan') - 'tckn' else null end,
    v_sevk_id, false, coalesce((p_veri ->> 'elle_duzeltildi')::boolean, false), v_uyarilar,
    auth.uid(), lower(nullif(auth.jwt() ->> 'email', ''))
  ) returning id into v_id;

  return jsonb_build_object(
    'kaydedildi', true, 'teslim_id', v_id, 'sevk_id', v_sevk_id, 'uyarilar', to_jsonb(v_uyarilar),
    'plaka', v_plaka, 'net_kg', v_net,
    'alinan_kg', v_toplam_kg + v_net, 'alinan_arac', v_toplam_arac + 1
  );
end; $function$;

-- ---------------------------------------------------------------------------
-- 7) Yetkili fonksiyonlari
-- ---------------------------------------------------------------------------
-- Sistem oncesi teslim (Excel'den esitleme / kantardan gecmemis parti).
-- Plaka ve irsaliye istege bagli; tarih bugun veya gecmis (<= 365 gun);
-- net en fazla 5.000 ton (parti; tek arac sinirina tabi degil).
create or replace function public.ic_alis_gecmis_teslim_ekle(p_veri jsonb)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
  v_alis public.ic_alis_siparisleri%rowtype;
  v_plaka text;
  v_net numeric;
  v_gun date;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_yol text;
  v_irs_no text;
  v_ettn text;
  v_id uuid;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('ic_alis') then
    raise exception 'Alış yetkiniz yok.' using errcode = '42501';
  end if;
  begin
    select * into v_alis from public.ic_alis_siparisleri
      where id = (p_veri ->> 'alis_id')::uuid and company_id = v_sirket;
  exception when invalid_text_representation then
    v_alis := null;
  end;
  if v_alis.id is null then
    raise exception 'Alış siparişi bulunamadı.' using errcode = 'P0002';
  end if;
  if v_alis.durum = 'iptal' then
    raise exception 'İptal edilmiş siparişe teslim girilemez.' using errcode = '23514';
  end if;

  v_plaka := nullif(upper(regexp_replace(btrim(coalesce(p_veri ->> 'plaka', '')), '\s+', ' ', 'g')), '');
  if v_plaka is not null and v_plaka !~ '^[A-Z0-9 ]{4,14}$' then
    raise exception 'Plaka geçersiz: "%".', p_veri ->> 'plaka' using errcode = '22023';
  end if;
  begin
    v_net := round((p_veri ->> 'net_kg')::numeric, 2);
  exception when others then
    v_net := null;
  end;
  if v_net is null or v_net <= 0 or v_net > 5000000 then
    raise exception 'Miktar geçersiz. 1 kg ile 5.000 ton arasında olmalı.' using errcode = '22023';
  end if;
  begin
    v_gun := (p_veri ->> 'tarih')::date;
  exception when others then
    v_gun := null;
  end;
  if v_gun is null or v_gun > v_bugun or v_gun < v_bugun - 365 then
    raise exception 'Teslim tarihi geçersiz (bugün veya son 365 gün).' using errcode = '22023';
  end if;
  v_yol := nullif(p_veri ->> 'irsaliye_dosya_yolu', '');
  if v_yol is not null and v_yol not like v_sirket::text || '/alis/' || v_alis.id::text || '/%' then
    raise exception 'İrsaliye dosyası bu alış siparişine ait değil.' using errcode = '22023';
  end if;
  v_irs_no := nullif(upper(btrim(coalesce(p_veri ->> 'irsaliye_no', ''))), '');
  if v_irs_no is not null and v_irs_no !~ '^[A-Z0-9]{3,20}$' then
    raise exception 'İrsaliye no geçersiz.' using errcode = '22023';
  end if;
  v_ettn := nullif(upper(btrim(coalesce(p_veri ->> 'ettn', ''))), '');
  if v_irs_no is not null and exists (select 1 from public.ic_alis_teslimler where company_id = v_sirket and irsaliye_no = v_irs_no) then
    raise exception 'Bu irsaliye (%) daha önce girilmiş.', v_irs_no using errcode = '23505';
  end if;
  if v_ettn is not null and exists (select 1 from public.ic_alis_teslimler where company_id = v_sirket and ettn = v_ettn) then
    raise exception 'Bu irsaliye (ETTN) daha önce girilmiş.' using errcode = '23505';
  end if;

  insert into public.ic_alis_teslimler (
    company_id, alis_id, plaka, net_kg, teslim_zamani, irsaliye_no, ettn, irsaliye_dosya_yolu,
    irsaliye_dosya_adi, gecmis, notlar, girilen, girilen_email
  ) values (
    v_sirket, v_alis.id, v_plaka, v_net, (v_gun::timestamp + time '12:00') at time zone 'Europe/Istanbul',
    v_irs_no, v_ettn, v_yol, nullif(p_veri ->> 'irsaliye_dosya_adi', ''), true,
    nullif(left(btrim(coalesce(p_veri ->> 'notlar', '')), 300), ''),
    auth.uid(), lower(nullif(auth.jwt() ->> 'email', ''))
  ) returning id into v_id;
  return jsonb_build_object('kaydedildi', true, 'teslim_id', v_id);
end; $function$;

-- Teslim silme (hatali giris). Donus: depodan SONRA silinecek PDF yolu (yoksa null).
-- Dogrudan sevkte PDF satis kaydina aittir -> SILINMEZ (null doner); satis kaydi
-- Is Emirleri'nden ayrica silinir.
create or replace function public.ic_alis_teslim_sil(p_id uuid)
 returns text
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  s public.ic_alis_teslimler%rowtype;
begin
  select * into s from public.ic_alis_teslimler where id = p_id for update;
  if not found or auth.uid() is null or s.company_id is distinct from auth_company_id() or not ic_sayfa_yetkisi('ic_alis') then
    raise exception 'Teslim kaydı bulunamadı veya yetkiniz yok.' using errcode = '42501';
  end if;
  delete from public.ic_alis_teslimler where id = p_id;
  if s.irsaliye_dosya_yolu is not null and split_part(s.irsaliye_dosya_yolu, '/', 2) = 'alis'
     and not exists (select 1 from public.ic_alis_teslimler where irsaliye_dosya_yolu = s.irsaliye_dosya_yolu) then
    return s.irsaliye_dosya_yolu;
  end if;
  return null;
end; $function$;

-- Alis yetkilisi, alis teslimine bagli SATIS irsaliyesini (dogrudan sevk) de
-- okuyabilsin (yalniz baglantili dosya; satis klasorunun tamami degil).
create or replace function public.ic_alis_belge_okunabilir(p_yol text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select public.ic_sayfa_yetkisi('ic_alis')
     and exists (select 1 from public.ic_alis_teslimler s
                 where s.irsaliye_dosya_yolu = p_yol and s.company_id = public.auth_company_id());
$function$;

-- Mevcut silme kurali AYNEN + alis klasoru: alis yetkilisi kendi klasorunu
-- silebilir; kantarci kendi yukledigi ve HICBIR kayda (satis sevki veya alis
-- teslimi) baglanmamis dosyayi geri silebilir.
create or replace function public.ic_belge_silinebilir(p_yol text, p_sahip text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select public.ic_sayfa_yetkisi('ic_piyasa')
      or (public.ic_sayfa_yetkisi('ic_alis') and split_part(p_yol, '/', 2) = 'alis'
          and not exists (select 1 from public.ic_sevkler s where s.irsaliye_dosya_yolu = p_yol))
      or (public.ic_sayfa_yetkisi('kantar')
          and p_sahip = auth.uid()::text
          and not exists (select 1 from public.ic_sevkler s where s.irsaliye_dosya_yolu = p_yol)
          and not exists (select 1 from public.ic_alis_teslimler a where a.irsaliye_dosya_yolu = p_yol));
$function$;

-- ---------------------------------------------------------------------------
-- 8) Depo politikalari: "alis/" klasoru (mevcut kosullar AYNEN korunur)
-- ---------------------------------------------------------------------------
drop policy if exists ic_belge_insert on storage.objects;
create policy ic_belge_insert on storage.objects for insert
  with check (bucket_id = 'ic-piyasa-belgeler'
              and split_part(name, '/', 1) = public.auth_company_id()::text
              and (
                (split_part(name, '/', 2) = 'irsaliye' and (public.ic_sayfa_yetkisi('ic_piyasa') or public.ic_sayfa_yetkisi('kantar')))
                or (split_part(name, '/', 2) = 'siparis' and public.ic_sayfa_yetkisi('ic_piyasa'))
                or (split_part(name, '/', 2) = 'alis' and (public.ic_sayfa_yetkisi('ic_alis') or public.ic_sayfa_yetkisi('kantar')))
              ));

drop policy if exists ic_belge_select on storage.objects;
create policy ic_belge_select on storage.objects for select
  using (bucket_id = 'ic-piyasa-belgeler'
         and split_part(name, '/', 1) = public.auth_company_id()::text
         and (
           public.ic_sayfa_yetkisi('ic_piyasa')
           or (public.ic_sayfa_yetkisi('kantar') and split_part(name, '/', 2) in ('irsaliye', 'alis'))
           or (public.ic_sayfa_yetkisi('ic_alis') and split_part(name, '/', 2) = 'alis')
           or (split_part(name, '/', 2) = 'irsaliye' and public.ic_alis_belge_okunabilir(name))
         ));

-- ---------------------------------------------------------------------------
-- 9) Yetkiler
-- ---------------------------------------------------------------------------
revoke all on table public.ic_tedarikciler from anon, authenticated, public;
revoke all on table public.ic_alis_siparisleri from anon, authenticated, public;
revoke all on table public.ic_alis_teslimler from anon, authenticated, public;
revoke all on sequence public.ic_alis_sira from anon, authenticated, public;
grant select, insert, update, delete on table public.ic_tedarikciler to authenticated;
grant select, insert, update, delete on table public.ic_alis_siparisleri to authenticated;
grant select on table public.ic_alis_teslimler to authenticated;
grant usage on sequence public.ic_alis_sira to authenticated;
grant all on table public.ic_tedarikciler to service_role;
grant all on table public.ic_alis_siparisleri to service_role;
grant all on table public.ic_alis_teslimler to service_role;

revoke all on function public.ic_alis_hazirla() from public, anon, authenticated;
revoke all on function public.ic_alis_teslim_koru() from public, anon, authenticated;
revoke all on function public.kantar_ic_alis_siparisleri() from public, anon;
revoke all on function public.kantar_ic_alis_son_teslimler(integer) from public, anon;
revoke all on function public.kantar_ic_alis_teslim_ekle(jsonb, boolean) from public, anon;
revoke all on function public.ic_alis_gecmis_teslim_ekle(jsonb) from public, anon;
revoke all on function public.ic_alis_teslim_sil(uuid) from public, anon;
revoke all on function public.ic_alis_belge_okunabilir(text) from public, anon;
revoke all on function public.ic_belge_silinebilir(text, text) from public, anon;
grant execute on function public.kantar_ic_alis_siparisleri() to authenticated;
grant execute on function public.kantar_ic_alis_son_teslimler(integer) to authenticated;
grant execute on function public.kantar_ic_alis_teslim_ekle(jsonb, boolean) to authenticated;
grant execute on function public.ic_alis_gecmis_teslim_ekle(jsonb) to authenticated;
grant execute on function public.ic_alis_teslim_sil(uuid) to authenticated;
grant execute on function public.ic_alis_belge_okunabilir(text) to authenticated;
grant execute on function public.ic_belge_silinebilir(text, text) to authenticated;

-- Sayfa yetkisi: super adminlere (Volkan Bey, Burak Bey). Digerleri Yetkilendirme'den.
update public.kullanici_yetkileri
   set sayfa_yetkileri = coalesce(sayfa_yetkileri, '{}'::jsonb) || '{"ic_alis": true}'::jsonb
 where lower(email) in ('execution@unex.com.tr', 'bbt@unex.com.tr');

comment on table public.ic_tedarikciler is 'Ic piyasa tedarikci kartlari (TMO depolari, ureticiler) (30.10.2026).';
comment on table public.ic_alis_siparisleri is 'Ic piyasa alis siparisleri AS-YYYY-NNNN (30.10.2026).';
comment on table public.ic_alis_teslimler is 'Teslim alinan araclar; ekleme kantar_ic_alis_teslim_ekle / ic_alis_gecmis_teslim_ekle; sevk_id = dogrudan musteriye sevk (30.10.2026).';
