-- ============================================================================
-- SATIN ALMA: ON ONAY + HAFTALIK TOPLU LISTE (21.11.2026)
-- ============================================================================
-- Kullanici: "departmanlar her siparis verdiginde sadece bana gelsin. Ben onay verince
-- Burak Beye onaya gonderilsin. Cumartesiden cumartesiye satin alma gunu belirlendi.
-- Personeller hafta ici de siparis verir, cumartesi gunune kadar birikecek. (Acil
-- durumda hemen de onaya gonderebilecegim.) Daha sonra toplu alisveris listesi
-- olusacak. Butun departmanlar icin ve onaya sunacagiz."
--
-- Akis:  taslak -> on_onay (Volkan Bey) -> bekliyor (Burak Bey) -> sonuclandi
--  - Departman "gonder": sa_token_liste_on_onaya_gonder -> durum 'on_onay'
--    (mail YALNIZ execution@). Eski sa_token_liste_gonder (dogrudan 'bekliyor')
--    edge deploy edilene kadar eski kod calissin diye DURUYOR; yeni edge cagirmaz.
--  - Acil: sa_onaya_sun(liste) -> tek form hemen 'bekliyor' (Burak Bey'e mail).
--  - Haftalik: sa_toplu_olustur(listeler[]) -> TSA-YYYY-NNNN toplu liste; secilen
--    formlarin hepsi ayni anda 'bekliyor' + toplu_id (Burak Bey'e TEK mail).
--  - Burak Bey toplu listeye TEK ekranda karar verir: sa_toplu_karar_ver ->
--    her form icin mevcut sa_karar_ver (cek listesi / sonuc maili form bazinda AYNI).
-- Ayrica Excel'deki "Limon suyu 2 şişe", "Acı biber turşusu 2 kavanoz" icin
-- birim listesine sise + kavanoz eklenir.
-- Tablolar istemciye SADECE okunur; yazmalar RPC / edge function ile (degismedi).
-- ============================================================================

-- 1) Birimler: + sise, kavanoz ------------------------------------------------
alter table public.satin_alma_kalemleri drop constraint satin_alma_kalemleri_birim_check;
alter table public.satin_alma_kalemleri add constraint satin_alma_kalemleri_birim_check
  check (birim = any (array['adet', 'paket', 'koli', 'kutu', 'top', 'kg', 'gr', 'litre', 'metre', 'takim', 'kova', 'bidon', 'sise', 'kavanoz', 'diger']::text[]));

do $yama$
declare
  v_def text := pg_get_functiondef('public.sa_token_kalem_ekle(text,jsonb)'::regprocedure);
  v_eski1 text := $e$'kova', 'bidon', 'diger') then$e$;
  v_yeni1 text := $e$'kova', 'bidon', 'sise', 'kavanoz', 'diger') then$e$;
  v_eski2 text := $e$when 'bidon' then 'Bidon' else 'Diğer' end,$e$;
  v_yeni2 text := $e$when 'bidon' then 'Bidon' when 'sise' then 'Şişe' when 'kavanoz' then 'Kavanoz' else 'Diğer' end,$e$;
begin
  if (length(v_def) - length(replace(v_def, v_eski1, ''))) / length(v_eski1) <> 1
     or (length(v_def) - length(replace(v_def, v_eski2, ''))) / length(v_eski2) <> 1 then
    raise exception 'sa_token_kalem_ekle beklenen metni icermiyor; yama uygulanmadi.';
  end if;
  execute replace(replace(v_def, v_eski1, v_yeni1), v_eski2, v_yeni2);
end $yama$;

-- 2) Durum: + on_onay; toplu liste tablosu --------------------------------------
alter table public.satin_alma_listeleri drop constraint satin_alma_listeleri_durum_check;
alter table public.satin_alma_listeleri add constraint satin_alma_listeleri_durum_check
  check (durum = any (array['taslak', 'on_onay', 'bekliyor', 'sonuclandi']::text[]));

create sequence if not exists public.satin_alma_toplu_sira;

create table public.satin_alma_toplu (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  toplu_no text not null check (toplu_no ~ '^TSA-[0-9]{4}-[0-9]{4,}$'),
  test boolean not null default false,
  olusturan_email text,
  olusturma timestamptz not null default now(),
  onay_maili text check (onay_maili is null or onay_maili = any (array['gonderildi', 'hata']::text[])),
  onay_maili_hata text check (onay_maili_hata is null or char_length(onay_maili_hata) <= 500),
  unique (company_id, toplu_no)
);
alter table public.satin_alma_toplu enable row level security;
create policy "Satin alma yetkilisi okur" on public.satin_alma_toplu for select to authenticated
  using (company_id = get_auth_company_id() and ic_sayfa_yetkisi('satin_alma'::text));
revoke all on table public.satin_alma_toplu from anon, authenticated;
grant select on table public.satin_alma_toplu to authenticated;
grant all on table public.satin_alma_toplu to service_role;
revoke all on sequence public.satin_alma_toplu_sira from anon, authenticated;
create trigger denetim_satin_alma_toplu after insert or delete or update on public.satin_alma_toplu
  for each row execute function denetim_tetikleyici();

alter table public.satin_alma_listeleri
  add column toplu_id uuid references public.satin_alma_toplu(id) on delete set null,
  add column on_onay_email text,
  add column onaya_sunma_zamani timestamptz;
create index satin_alma_listeleri_toplu_idx on public.satin_alma_listeleri (toplu_id) where toplu_id is not null;

-- 3) Mevcut fonksiyon yamalari ---------------------------------------------------
-- 3a) Urun katalogu: form taslaktan cikinca (artik 'on_onay') kaydolur; on_onay -> bekliyor
--     gecisinde old.durum taslak olmadigindan IKINCI KEZ sayilmaz.
do $yama$
declare
  v_def text := pg_get_functiondef('public.sa_urun_gecmisi_kaydet()'::regprocedure);
  v_eski text := $e$new.durum = 'bekliyor'$e$;
begin
  if (length(v_def) - length(replace(v_def, v_eski, ''))) / length(v_eski) <> 1 then
    raise exception 'sa_urun_gecmisi_kaydet beklenen metni icermiyor; yama uygulanmadi.';
  end if;
  execute replace(v_def, v_eski, $e$new.durum in ('on_onay', 'bekliyor')$e$);
end $yama$;

-- 3b) Liste JSON: toplu bilgisi
do $yama$
declare
  v_def text := pg_get_functiondef('public.sa_liste_json(uuid)'::regprocedure);
  v_eski text := $e$'cek_durumu', l.cek_durumu, 'cek_tamamlanma', l.cek_tamamlanma,$e$;
begin
  if (length(v_def) - length(replace(v_def, v_eski, ''))) / length(v_eski) <> 1 then
    raise exception 'sa_liste_json beklenen metni icermiyor; yama uygulanmadi.';
  end if;
  execute replace(v_def, v_eski, v_eski || $e$
    'toplu_id', l.toplu_id, 'onaya_sunma_zamani', l.onaya_sunma_zamani,$e$);
end $yama$;

-- 4) Departman gonderimi -> on_onay ---------------------------------------------
create or replace function public.sa_token_liste_on_onaya_gonder(p_token text, p_gonderen text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  d public.satin_alma_departmanlari;
  v_liste uuid;
  v_ad text := public.sa_ad_soyad_duzelt(p_gonderen);
  v_yil text;
begin
  d := public.sa_token_departman(p_token);
  if d.id is null then
    raise exception 'Bağlantı geçersiz veya departman pasif.' using errcode = 'P0002';
  end if;
  if not public.sa_ad_soyad_gecerli(v_ad) then
    raise exception 'Gönderen olarak adınızı ve soyadınızı yazın (ör. Ayşe Yılmaz).' using errcode = '23514';
  end if;
  select l.id into v_liste from public.satin_alma_listeleri l where l.departman_id = d.id and l.durum = 'taslak' for update;
  if v_liste is null or not exists (select 1 from public.satin_alma_kalemleri k where k.liste_id = v_liste) then
    raise exception 'Gönderilecek kalem yok. Önce listeye kalem ekleyin.' using errcode = '23514';
  end if;
  if (select count(*) from public.satin_alma_listeleri l
      where l.departman_id = d.id and l.gonderim_zamani > now() - interval '24 hours') >= 10 then
    raise exception 'Bu departmandan son 24 saatte 10 liste gönderildi. Lütfen daha sonra tekrar deneyin.' using errcode = '23514';
  end if;
  v_yil := extract(year from (now() at time zone 'Europe/Istanbul'))::text;
  update public.satin_alma_listeleri
     set durum = 'on_onay', gonderen_ad = v_ad, gonderim_zamani = now(), test = d.test,
         liste_no = 'SA-' || v_yil || '-' || lpad(pg_catalog.nextval('public.satin_alma_liste_sira'::regclass)::text, 4, '0')
   where id = v_liste;
  return public.sa_liste_json(v_liste);
end; $function$;

-- 5) Acil: tek formu hemen Burak Bey'e sun ---------------------------------------
create or replace function public.sa_onaya_sun(p_liste_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.sa_yetki_kontrol();
  v_durum text;
begin
  select l.durum into v_durum from public.satin_alma_listeleri l
   where l.id = p_liste_id and l.company_id = v_sirket for update;
  if v_durum is null then
    raise exception 'Liste bulunamadı.' using errcode = 'P0002';
  end if;
  if v_durum <> 'on_onay' then
    raise exception 'Bu form ön onayda değil (zaten onaya sunulmuş olabilir). Sayfayı yenileyin.' using errcode = '23514';
  end if;
  update public.satin_alma_listeleri
     set durum = 'bekliyor', toplu_id = null,
         on_onay_email = lower(nullif(coalesce(auth.jwt() ->> 'email', ''), '')),
         onaya_sunma_zamani = now(), gonderim_maili = null, gonderim_maili_hata = null
   where id = p_liste_id;
  return public.sa_liste_json(p_liste_id);
end; $function$;

-- 6) Haftalik toplu liste ---------------------------------------------------------
create or replace function public.sa_toplu_json(p_toplu_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', t.id, 'toplu_no', t.toplu_no, 'test', t.test, 'olusturma', t.olusturma,
    'olusturan_email', t.olusturan_email, 'onay_maili', t.onay_maili,
    'listeler', coalesce((
      select jsonb_agg(public.sa_liste_json(l.id) order by l.gonderim_zamani, l.id)
      from public.satin_alma_listeleri l where l.toplu_id = t.id), '[]'::jsonb))
  from public.satin_alma_toplu t
  where t.id = p_toplu_id;
$function$;

create or replace function public.sa_toplu_olustur(p_liste_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.sa_yetki_kontrol();
  v_istenen int;
  v_adet int;
  v_test_cesit int;
  v_test boolean;
  v_id uuid;
  v_yil text;
  v_eposta text := lower(nullif(coalesce(auth.jwt() ->> 'email', ''), ''));
begin
  select count(distinct x) into v_istenen from unnest(coalesce(p_liste_ids, '{}'::uuid[])) x where x is not null;
  if v_istenen = 0 then
    raise exception 'Toplu listeye eklenecek formu seçin.' using errcode = '23514';
  end if;
  if v_istenen > 100 then
    raise exception 'Bir toplu listeye en fazla 100 form eklenebilir.' using errcode = '23514';
  end if;
  perform 1 from public.satin_alma_listeleri l
   where l.id = any (p_liste_ids) and l.company_id = v_sirket for update;
  select count(*), count(distinct coalesce(l.test, false)), bool_or(coalesce(l.test, false))
    into v_adet, v_test_cesit, v_test
    from public.satin_alma_listeleri l
   where l.id = any (p_liste_ids) and l.company_id = v_sirket and l.durum = 'on_onay';
  if v_adet <> v_istenen then
    raise exception 'Seçilen formlardan biri artık ön onayda değil (onaya sunulmuş olabilir). Sayfayı yenileyip tekrar deneyin.' using errcode = '23514';
  end if;
  if v_test_cesit > 1 then
    raise exception 'Test departmanının formları gerçek formlarla aynı toplu listeye eklenemez.' using errcode = '23514';
  end if;
  v_yil := extract(year from (now() at time zone 'Europe/Istanbul'))::text;
  insert into public.satin_alma_toplu (company_id, toplu_no, test, olusturan_email)
  values (v_sirket, 'TSA-' || v_yil || '-' || lpad(pg_catalog.nextval('public.satin_alma_toplu_sira'::regclass)::text, 4, '0'),
          coalesce(v_test, false), v_eposta)
  returning id into v_id;
  update public.satin_alma_listeleri
     set durum = 'bekliyor', toplu_id = v_id, on_onay_email = v_eposta,
         onaya_sunma_zamani = now(), gonderim_maili = null, gonderim_maili_hata = null
   where id = any (p_liste_ids) and company_id = v_sirket;
  return public.sa_toplu_json(v_id);
end; $function$;

create or replace function public.sa_toplu_mail_verisi(p_toplu_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.sa_yetki_kontrol();
begin
  if not exists (select 1 from public.satin_alma_toplu t where t.id = p_toplu_id and t.company_id = v_sirket) then
    raise exception 'Toplu liste bulunamadı.' using errcode = 'P0002';
  end if;
  return public.sa_toplu_json(p_toplu_id);
end; $function$;

create or replace function public.sa_toplu_mail_sonuc(p_toplu_id uuid, p_basarili boolean, p_hata text default null)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.satin_alma_toplu
     set onay_maili = case when p_basarili then 'gonderildi' else 'hata' end,
         onay_maili_hata = case when p_basarili then null else left(p_hata, 500) end
   where id = p_toplu_id;
$function$;

-- Burak Bey toplu listeye TEK seferde karar verir. Her form icin mevcut sa_karar_ver
-- (dogrulama, cek token'i, karar_veren AYNI). Tek islem: biri hata verirse hicbiri kaydolmaz.
create or replace function public.sa_toplu_karar_ver(p_toplu_id uuid, p_kararlar jsonb, p_not text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.sa_yetki_kontrol();
  v_toplam int;
  v_sonuc jsonb := '[]'::jsonb;
  l record;
begin
  if not exists (select 1 from public.satin_alma_toplu t where t.id = p_toplu_id and t.company_id = v_sirket) then
    raise exception 'Toplu liste bulunamadı.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_kararlar) is distinct from 'array' then
    raise exception 'Karar listesi geçersiz.' using errcode = '22023';
  end if;
  perform 1 from public.satin_alma_listeleri x where x.toplu_id = p_toplu_id for update;
  select count(*) into v_toplam
    from public.satin_alma_kalemleri k
    join public.satin_alma_listeleri x on x.id = k.liste_id
   where x.toplu_id = p_toplu_id and x.durum = 'bekliyor';
  if v_toplam = 0 then
    raise exception 'Bu toplu liste için karar zaten verilmiş.' using errcode = '23514';
  end if;
  if jsonb_array_length(p_kararlar) <> v_toplam
     or exists (
       select 1 from jsonb_array_elements(p_kararlar) e
        where coalesce(e ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or not exists (
             select 1 from public.satin_alma_kalemleri k
               join public.satin_alma_listeleri x on x.id = k.liste_id
              where k.id = (e ->> 'id')::uuid and x.toplu_id = p_toplu_id and x.durum = 'bekliyor')) then
    raise exception 'Listedeki her kalem için onay ya da red seçin.' using errcode = '23514';
  end if;
  for l in select x.id from public.satin_alma_listeleri x
            where x.toplu_id = p_toplu_id and x.durum = 'bekliyor'
            order by x.gonderim_zamani, x.id loop
    v_sonuc := v_sonuc || jsonb_build_array(public.sa_karar_ver(
      l.id,
      (select coalesce(jsonb_agg(e), '[]'::jsonb)
         from jsonb_array_elements(p_kararlar) e
         join public.satin_alma_kalemleri k on k.id = (e ->> 'id')::uuid and k.liste_id = l.id),
      p_not));
  end loop;
  return v_sonuc;
end; $function$;

-- 7) Yetkiler ----------------------------------------------------------------------
revoke all on function public.sa_token_liste_on_onaya_gonder(text, text) from public, anon, authenticated;
revoke all on function public.sa_toplu_json(uuid) from public, anon, authenticated;
revoke all on function public.sa_toplu_mail_sonuc(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.sa_onaya_sun(uuid) from public, anon;
revoke all on function public.sa_toplu_olustur(uuid[]) from public, anon;
revoke all on function public.sa_toplu_mail_verisi(uuid) from public, anon;
revoke all on function public.sa_toplu_karar_ver(uuid, jsonb, text) from public, anon;
grant execute on function public.sa_token_liste_on_onaya_gonder(text, text) to service_role;
grant execute on function public.sa_toplu_json(uuid) to service_role;
grant execute on function public.sa_toplu_mail_sonuc(uuid, boolean, text) to service_role;
grant execute on function public.sa_onaya_sun(uuid) to authenticated, service_role;
grant execute on function public.sa_toplu_olustur(uuid[]) to authenticated, service_role;
grant execute on function public.sa_toplu_mail_verisi(uuid) to authenticated, service_role;
grant execute on function public.sa_toplu_karar_ver(uuid, jsonb, text) to authenticated, service_role;
