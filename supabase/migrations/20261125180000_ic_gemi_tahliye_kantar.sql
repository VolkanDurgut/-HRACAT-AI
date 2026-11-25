-- ============================================================================
-- GEMI TAHLIYE - 2. ADIM: beklemede gemi, iki asamali arac, kantar eslestirme (25.11.2026)
-- ============================================================================
-- Kullanici: "Ikinci gemi simdilik pasif olsun, arac eklenemesin. ... Soforler WhatsApp'tan kantar fisi (liman) paylasacak;
-- onlar onden girilecek, arac fabrikaya geldiginde bizim tartimimiz da otomatik gelecek."
--   1) ic_gemi_tahliyeleri.durum + 'beklemede': kantarda gorunmez, arac girilemez (fonksiyonlar zaten durum = 'acik' ister).
--   2) UNEX araci iki asamali: liman kg ile "yolda" (teslim_kg NULL) -> teslim kg kantardan (BAYKON, kantar_tartimlari)
--      OTOMATIK ya da elle. Satis aracinda teslim yine YOK.
--   3) ic_gemi_kantar_esle_calistir(): yoldaki UNEX araci <-> kantar tartimi 1'e 1. Kosullar: plaka (cekici VEYA dorse,
--      bosluksuz) ayni; tartim cikisi kayittan 12 sa once .. 36 sa sonra; |net - liman| <= 1.500 kg; tartim baska gemi aracina
--      bagli degil; DBA belgesi (ihracat) yok; irsaliye no'su ic satis / alis kaydinda YOK (TMO yuku gemiye baglanmaz).
--      Siralama: firma alaninda gemi adi gecen once, sonra en yakin kg, sonra en erken. Her 2 dk (pg_cron, yalniz SQL) +
--      arac eklenince + ekranlar yenilenince.
--   4) Fisi gelmemis tartim: firma alaninda gemi adi gecen, eslesmemis tartimlar listelenir; liman kg girilince araca baglanir.
-- Kantar kayitlarina (kantar_tartimlari) YAZILMAZ; yalniz okunur. Evrak kg'lari degismez.
-- ============================================================================

-- 1) Beklemede durumu
alter table public.ic_gemi_tahliyeleri drop constraint if exists ic_gemi_tahliyeleri_durum_check;
alter table public.ic_gemi_tahliyeleri add constraint ic_gemi_tahliyeleri_durum_check check (durum in ('acik', 'beklemede', 'tamamlandi'));

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
  elsif new.durum <> 'tamamlandi' then
    new.kapanis_zamani := null;
  end if;
  new.guncelleme := now();
  return new;
end; $function$;

-- 2) Iki asamali arac + kantar baglantisi
alter table public.ic_gemi_araclari drop constraint if exists ic_gemi_arac_teslim;
alter table public.ic_gemi_araclari add constraint ic_gemi_arac_teslim check (alici_id is null or teslim_kg is null);
alter table public.ic_gemi_araclari add column if not exists kantar_tartim_id uuid references public.kantar_tartimlari(id) on delete set null;
alter table public.ic_gemi_araclari add column if not exists teslim_kaynak text check (teslim_kaynak is null or teslim_kaynak in ('kantar', 'elle'));
alter table public.ic_gemi_araclari add column if not exists teslim_zamani timestamptz;
-- Ofis yanlis eslesmeyi kaldirdiysa otomatik eslestirme bu araca bir daha bakmaz (elle girilebilir)
alter table public.ic_gemi_araclari add column if not exists esleme_kapali boolean not null default false;
create unique index if not exists uq_ic_gemi_arac_kantar on public.ic_gemi_araclari (kantar_tartim_id) where kantar_tartim_id is not null;
create index if not exists idx_ic_gemi_arac_yolda on public.ic_gemi_araclari (company_id, olusturma) where alici_id is null and teslim_kg is null;

-- Plaka / firma karsilastirma yardimcilari (Turkce harf -> ASCII, bosluksuz)
create or replace function public.ic_gemi_duz(p text)
 returns text
 language sql
 immutable
as $function$
  select regexp_replace(translate(upper(translate(coalesce(p, ''), 'ıi', 'Iİ')), 'İĞÜŞÖÇ', 'IGUSOC'), '[^A-Z0-9]', '', 'g');
$function$;

-- Gemi adinin anlamli kismi ("MV KURGU YILDIZ" -> "KURGUYILDIZ", "M/V KURGU" -> "KURGU")
create or replace function public.ic_gemi_jeton(p_gemi_adi text)
 returns text
 language sql
 immutable
as $function$
  select nullif(ic_gemi_duz(regexp_replace(upper(coalesce(p_gemi_adi, '')), '^\s*(M\s*/\s*V|MV|M\.V\.)\.?\s+', '')), '');
$function$;

-- Tartim gemiye baglanabilir mi (ihracat DBA'si ya da ic piyasa irsaliyesi olan tartim baglanmaz)
create or replace function public.ic_gemi_tartim_uygun(t public.kantar_tartimlari)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(t.net_kg, 0) > 0 and t.cikis is not null and t.dba_belge_no is null
     and not exists (select 1 from public.ic_gemi_araclari x where x.kantar_tartim_id = t.id)
     and (nullif(btrim(coalesce(t.irsaliye_no, '')), '') is null or not (
           exists (select 1 from public.ic_alis_teslimler s where s.company_id = t.company_id and ic_gemi_duz(s.irsaliye_no) <> ''
                   and position(ic_gemi_duz(s.irsaliye_no) in ic_gemi_duz(t.irsaliye_no)) > 0)
        or exists (select 1 from public.ic_sevkler v where v.company_id = t.company_id and ic_gemi_duz(v.irsaliye_no) <> ''
                   and position(ic_gemi_duz(v.irsaliye_no) in ic_gemi_duz(t.irsaliye_no)) > 0)));
$function$;

-- 3) Otomatik eslestirme (tum sirketler; pg_cron ve diger fonksiyonlar cagirir). Dondurur: eslesen arac sayisi.
create or replace function public.ic_gemi_kantar_esle_calistir()
 returns integer
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  r record;
  t public.kantar_tartimlari%rowtype;
  v_sayi integer := 0;
  v_fark numeric;
  v_uyari text[];
begin
  for r in
    select a.*, g.gemi_adi
    from public.ic_gemi_araclari a
    join public.ic_gemi_tahliyeleri g on g.id = a.gemi_id
    where g.durum = 'acik' and a.alici_id is null and a.teslim_kg is null and not a.esleme_kapali
      and a.olusturma > now() - interval '30 days'
    order by a.olusturma
  loop
    select k.* into t
    from public.kantar_tartimlari k
    where k.company_id = r.company_id
      and (ic_gemi_duz(k.plaka) = ic_gemi_duz(r.plaka) or (k.dorse is not null and ic_gemi_duz(k.dorse) = ic_gemi_duz(r.plaka)))
      and k.cikis between r.olusturma - interval '12 hours' and r.olusturma + interval '36 hours'
      and abs(k.net_kg - r.liman_kg) <= 1500
      and ic_gemi_tartim_uygun(k)
    order by (ic_gemi_jeton(r.gemi_adi) is not null and position(ic_gemi_jeton(r.gemi_adi) in ic_gemi_duz(k.firma)) > 0) desc,
             abs(k.net_kg - r.liman_kg), k.cikis
    limit 1;
    if t.id is null then continue; end if;
    v_fark := round(t.net_kg, 2) - r.liman_kg;
    v_uyari := r.uyarilar;
    if abs(v_fark) > greatest(300, r.liman_kg * 0.01) then
      v_uyari := array_append(v_uyari, format('Kantar tartımı (#%s) liman fişinden %s farklı.', t.kayit_no, ic_kg_yazi(v_fark)));
    end if;
    update public.ic_gemi_araclari
       set teslim_kg = round(t.net_kg, 2), kantar_tartim_id = t.id, teslim_kaynak = 'kantar', teslim_zamani = t.cikis, uyarilar = v_uyari
     where id = r.id and teslim_kg is null;
    v_sayi := v_sayi + 1;
    t := null;
  end loop;
  return v_sayi;
end; $function$;

-- Ekranlardan (kantar / ic piyasa) cagrilir
create or replace function public.ic_gemi_kantar_esle()
 returns integer
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  return ic_gemi_kantar_esle_calistir();
end; $function$;

-- 4) Arac ekle: UNEX'te teslim ISTEGE BAGLI (yoksa "yolda"); kantar_tartim_id verilirse teslim o tartimdan.
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
  v_tartim public.kantar_tartimlari%rowtype;
  v_tartim_id uuid;
  v_uyarilar text[];
  v_id uuid;
  v_eslesti boolean := false;
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
  if v_gemi.durum = 'beklemede' then
    raise exception '% beklemede (henüz tahliyeye açılmadı). Araç girilemez.', v_gemi.gemi_adi using errcode = '23514';
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
  begin v_tartim_id := nullif(p_veri ->> 'kantar_tartim_id', '')::uuid; exception when invalid_text_representation then v_tartim_id := null; end;
  if v_alici is not null then
    v_teslim := null; -- gemiden satista teslim tartimi yok
    v_tartim_id := null;
  elsif v_tartim_id is not null then
    select * into v_tartim from public.kantar_tartimlari where id = v_tartim_id and company_id = v_sirket;
    if v_tartim.id is null or not ic_gemi_tartim_uygun(v_tartim) then
      raise exception 'Kantar tartımı bulunamadı ya da başka bir kayda bağlı.' using errcode = 'P0002';
    end if;
    v_teslim := round(v_tartim.net_kg, 2);
  elsif v_teslim is not null and (v_teslim <= 0 or v_teslim > 60000) then
    raise exception 'Teslim (kantar) ağırlığı 1 ile 60.000 kg arasında olmalı.' using errcode = '22023';
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

  insert into public.ic_gemi_araclari (company_id, gemi_id, alici_id, tarih, plaka, liman_kg, teslim_kg, kaynak, uyarilar, notlar, girilen_email,
                                       kantar_tartim_id, teslim_kaynak, teslim_zamani)
  values (v_sirket, v_gemi.id, v_alici, v_tarih, v_plaka, v_liman, v_teslim,
          case when ic_sayfa_yetkisi('kantar') and not v_ofis then 'kantar' else coalesce(nullif(p_veri ->> 'kaynak', ''), 'kantar') end,
          v_uyarilar, v_notlar, lower(nullif(auth.jwt() ->> 'email', '')),
          v_tartim_id,
          case when v_teslim is null then null when v_tartim_id is not null then 'kantar' else 'elle' end,
          case when v_tartim_id is not null then v_tartim.cikis when v_teslim is not null then now() end)
  returning id into v_id;
  -- Yolda ise hemen kantarda ara (arac fis gelmeden tartilmis olabilir)
  if v_alici is null and v_teslim is null then
    perform ic_gemi_kantar_esle_calistir();
    select teslim_kg is not null into v_eslesti from public.ic_gemi_araclari where id = v_id;
  end if;
  return jsonb_build_object('kaydedildi', true, 'id', v_id, 'uyarilar', to_jsonb(v_uyarilar), 'kantar_eslesti', coalesce(v_eslesti, false),
                            'yolda', v_alici is null and v_teslim is null and not coalesce(v_eslesti, false));
end; $function$;

-- 5) Teslim kg'i elle gir / duzelt / eslesmeyi kaldir (p_teslim NULL = kaldir; bu araca otomatik eslestirme bir daha bakmaz)
create or replace function public.ic_gemi_teslim_gir(p_id uuid, p_teslim numeric)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  a public.ic_gemi_araclari%rowtype;
  v_teslim numeric := round(p_teslim, 2);
  v_uyari text[];
  v_fark numeric;
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  select x.* into a from public.ic_gemi_araclari x join public.ic_gemi_tahliyeleri g on g.id = x.gemi_id
   where x.id = p_id and x.company_id = auth_company_id() and g.durum = 'acik';
  if a.id is null then raise exception 'Araç bulunamadı ya da tahliye açık değil.' using errcode = 'P0002'; end if;
  if a.alici_id is not null then raise exception 'Gemiden satış aracında teslim tartımı yoktur.' using errcode = '23514'; end if;
  if v_teslim is null then
    if not ic_sayfa_yetkisi('ic_piyasa') then
      raise exception 'Eşleşmeyi kaldırmak için İç Piyasa yetkisi gerekir.' using errcode = '42501';
    end if;
    update public.ic_gemi_araclari set teslim_kg = null, kantar_tartim_id = null, teslim_kaynak = null, teslim_zamani = null, esleme_kapali = true
     where id = a.id;
    return jsonb_build_object('teslim_kg', null);
  end if;
  if v_teslim <= 0 or v_teslim > 60000 then
    raise exception 'Teslim ağırlığı 1 ile 60.000 kg arasında olmalı.' using errcode = '22023';
  end if;
  if a.teslim_kaynak = 'kantar' and not ic_sayfa_yetkisi('ic_piyasa') then
    raise exception 'Kantardan gelen tartımı değiştirmek için İç Piyasa yetkisi gerekir.' using errcode = '42501';
  end if;
  v_fark := v_teslim - a.liman_kg;
  v_uyari := a.uyarilar;
  if abs(v_fark) > greatest(300, a.liman_kg * 0.01) then
    v_uyari := array_append(v_uyari, format('Elle girilen teslim liman fişinden %s farklı.', ic_kg_yazi(v_fark)));
  end if;
  update public.ic_gemi_araclari
     set teslim_kg = v_teslim, kantar_tartim_id = null, teslim_kaynak = 'elle', teslim_zamani = now(), uyarilar = v_uyari
   where id = a.id;
  return jsonb_build_object('teslim_kg', v_teslim, 'fark', v_fark);
end; $function$;

-- 6) Kantar Paneli ozeti: yolda sayisi eklendi (donus tipi degistigi icin DROP + CREATE)
drop function if exists public.kantar_gemi_tahliyeleri();
create function public.kantar_gemi_tahliyeleri()
 returns table (
   id uuid, gemi_adi text, urun text, tahliye_limani text, bl_kg numeric,
   gelen_kg numeric, gelen_arac integer, unex_liman_kg numeric, unex_teslim_kg numeric, unex_arac integer,
   bugun_arac integer, alicilar jsonb, yolda_arac integer, yolda_kg numeric
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
      ), '[]'::jsonb),
      (select count(*) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null and a.teslim_kg is null)::integer,
      coalesce((select sum(a.liman_kg) from public.ic_gemi_araclari a where a.gemi_id = g.id and a.alici_id is null and a.teslim_kg is null), 0)::numeric
    from public.ic_gemi_tahliyeleri g
    where g.company_id = auth_company_id() and g.durum = 'acik'
    order by g.olusturma;
end; $function$;

drop function if exists public.kantar_gemi_son_araclar(integer);
create function public.kantar_gemi_son_araclar(p_gun integer default 2)
 returns table (
   id uuid, gemi_id uuid, gemi_adi text, alici_id uuid, firma text, tarih date, plaka text,
   liman_kg numeric, teslim_kg numeric, kaynak text, uyari_var boolean, girilen_email text, olusturma timestamptz,
   teslim_kaynak text, kantar_kayit_no bigint, teslim_zamani timestamptz
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
           cardinality(a.uyarilar) > 0, a.girilen_email, a.olusturma, a.teslim_kaynak, k.kayit_no, a.teslim_zamani
    from public.ic_gemi_araclari a
    join public.ic_gemi_tahliyeleri g on g.id = a.gemi_id
    left join public.ic_gemi_alicilari l on l.id = a.alici_id
    left join public.kantar_tartimlari k on k.id = a.kantar_tartim_id
    where a.company_id = auth_company_id() and g.durum = 'acik'
      and (a.olusturma >= now() - make_interval(days => greatest(1, least(coalesce(p_gun, 2), 14)))
           or (a.alici_id is null and a.teslim_kg is null))
    order by a.olusturma desc
    limit 300;
end; $function$;

-- 7) Fisi gelmemis tartimlar: firma alaninda gemi adi gecen, hicbir gemi aracina / ic piyasa irsaliyesine bagli olmayan
create or replace function public.kantar_gemi_fissiz_tartimlar(p_gemi uuid)
 returns table (id uuid, kayit_no bigint, plaka text, dorse text, firma text, cikis timestamptz, net_kg numeric)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  g public.ic_gemi_tahliyeleri%rowtype;
  v_jeton text;
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  select x.* into g from public.ic_gemi_tahliyeleri x where x.id = p_gemi and x.company_id = auth_company_id() and x.durum = 'acik';
  v_jeton := ic_gemi_jeton(g.gemi_adi);
  if g.id is null or v_jeton is null or char_length(v_jeton) < 4 then return; end if;
  return query
    select k.id, k.kayit_no, k.plaka, k.dorse, k.firma, k.cikis, k.net_kg
    from public.kantar_tartimlari k
    where k.company_id = g.company_id
      and k.cikis >= (coalesce(g.baslangic, (g.olusturma at time zone 'Europe/Istanbul')::date) - 1)::timestamp at time zone 'Europe/Istanbul'
      and position(v_jeton in ic_gemi_duz(k.firma)) > 0
      and ic_gemi_tartim_uygun(k)
    order by k.cikis desc
    limit 100;
end; $function$;

-- 8) pg_cron: her 2 dakikada eslestirme (HTTP yok; yalniz SQL). Ayni adla varsa once kaldirilir.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'gemi-kantar-esle') then
    perform cron.unschedule('gemi-kantar-esle');
  end if;
  perform cron.schedule('gemi-kantar-esle', '*/2 * * * *', 'select public.ic_gemi_kantar_esle_calistir()');
end $$;

-- 9) Yetkiler
revoke all on function public.ic_gemi_hazirla() from public, anon, authenticated;
revoke all on function public.ic_gemi_tartim_uygun(public.kantar_tartimlari) from public, anon, authenticated;
revoke all on function public.ic_gemi_kantar_esle_calistir() from public, anon, authenticated;
revoke all on function public.ic_gemi_kantar_esle() from public, anon;
revoke all on function public.ic_gemi_arac_ekle(jsonb, boolean) from public, anon;
revoke all on function public.ic_gemi_teslim_gir(uuid, numeric) from public, anon;
revoke all on function public.kantar_gemi_tahliyeleri() from public, anon;
revoke all on function public.kantar_gemi_son_araclar(integer) from public, anon;
revoke all on function public.kantar_gemi_fissiz_tartimlar(uuid) from public, anon;
grant execute on function public.ic_gemi_kantar_esle() to authenticated;
grant execute on function public.ic_gemi_arac_ekle(jsonb, boolean) to authenticated;
grant execute on function public.ic_gemi_teslim_gir(uuid, numeric) to authenticated;
grant execute on function public.kantar_gemi_tahliyeleri() to authenticated;
grant execute on function public.kantar_gemi_son_araclar(integer) to authenticated;
grant execute on function public.kantar_gemi_fissiz_tartimlar(uuid) to authenticated;

comment on column public.ic_gemi_araclari.kantar_tartim_id is 'UNEX araci: eslesen BAYKON tartimi (otomatik ic_gemi_kantar_esle_calistir ya da fisi gelmemis tartimdan). NULL + teslim NULL = yolda.';
