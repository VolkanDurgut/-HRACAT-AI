-- ============================================================================
-- SATIN ALMA: AD SOYAD ZORUNLU (27.10.2026)
-- ============================================================================
-- Kullanici: "Her departman satin alma olustururken isim belirtmeli. Volkan Durgut
-- olarak gelmemeli." Talep formu adi tarayicida hatirliyordu (localStorage) -> ayni
-- bilgisayardan acan herkes onceki kisinin adiyla geliyordu. Arayuz artik adi
-- HATIRLAMAZ; burada da ad + soyad (en az iki kelime, her biri en az 2 karakter,
-- rakam / @ yok) sunucu tarafinda zorunlu:
--  - sa_token_kalem_ekle  : talep_eden
--  - sa_token_liste_gonder: gonderen (test bayragi davranisi 20261027120000 ile ayni)
--  - sa_cek_token_isaretle: teslim alan (sadece "alindi" isaretlerken)
-- Kayitli veriye DOKUNMAZ. Bosluklar tek bosluga indirilir.
-- ============================================================================

create or replace function public.sa_ad_soyad_duzelt(p text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select nullif(left(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), 80), '');
$function$;

create or replace function public.sa_ad_soyad_gecerli(p text)
 returns boolean
 language sql
 immutable
 set search_path to 'public'
as $function$
  select coalesce(public.sa_ad_soyad_duzelt(p), '') ~ '^[^ ]{2,}( [^ ]{2,})+$'
     and coalesce(public.sa_ad_soyad_duzelt(p), '') !~ '[0-9@]';
$function$;

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
  if not public.sa_ad_soyad_gecerli(p_kalem ->> 'talep_eden') then
    raise exception 'Talep eden kişinin adını ve soyadını yazın (ör. Ayşe Yılmaz).' using errcode = '23514';
  end if;
  if char_length(coalesce(p_kalem ->> 'aciklama', '')) > 500 then
    raise exception 'Not en fazla 500 karakter olabilir.' using errcode = '23514';
  end if;
  insert into public.satin_alma_kalemleri (company_id, liste_id, kategori, urun, miktar, birim, aciliyet, aciklama, talep_eden)
  values (
    d.company_id, v_liste, p_kalem ->> 'kategori', btrim(p_kalem ->> 'urun'), v_miktar, p_kalem ->> 'birim',
    case when p_kalem ->> 'aciliyet' = 'acil' then 'acil' else 'normal' end,
    nullif(btrim(coalesce(p_kalem ->> 'aciklama', '')), ''),
    public.sa_ad_soyad_duzelt(p_kalem ->> 'talep_eden'))
  returning id into v_id;
  update public.satin_alma_listeleri set guncelleme = now() where id = v_liste;
  return v_id;
end; $function$;


create or replace function public.sa_token_liste_gonder(p_token text, p_gonderen text)
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
  -- Kotuye kullanim: departman basina 24 saatte en fazla 10 gonderim (her biri mail atar)
  if (select count(*) from public.satin_alma_listeleri l
      where l.departman_id = d.id and l.gonderim_zamani > now() - interval '24 hours') >= 10 then
    raise exception 'Bu departmandan son 24 saatte 10 liste gönderildi. Lütfen daha sonra tekrar deneyin.' using errcode = '23514';
  end if;
  v_yil := extract(year from (now() at time zone 'Europe/Istanbul'))::text;
  update public.satin_alma_listeleri
     set durum = 'bekliyor', gonderen_ad = v_ad, gonderim_zamani = now(), test = d.test,
         liste_no = 'SA-' || v_yil || '-' || lpad(pg_catalog.nextval('public.satin_alma_liste_sira'::regclass)::text, 4, '0')
   where id = v_liste;
  return public.sa_liste_json(v_liste);
end; $function$;

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
  -- Teslim alindi isaretlerken teslim alanin adi soyadi zorunlu (geri alirken degil)
  if coalesce(p_alindi, false) and not public.sa_ad_soyad_gecerli(p_ad) then
    raise exception 'Teslim alan kişinin adını ve soyadını yazın.' using errcode = '23514';
  end if;
  return public.sa_cek_uygula(v_liste, p_kalem_id, p_alindi, public.sa_ad_soyad_duzelt(p_ad));
end; $function$;


revoke all on function public.sa_ad_soyad_duzelt(text) from public, anon, authenticated;
revoke all on function public.sa_ad_soyad_gecerli(text) from public, anon, authenticated;
