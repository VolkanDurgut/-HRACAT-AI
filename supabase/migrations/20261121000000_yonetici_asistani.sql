-- ============================================================================
-- YONETICI ASISTANI (21.11.2026, Faz 2). Kullanici: "Yalniz benim gorebilecegim bir panel ve onumde surekli
-- aktif bir gorev listesi olacak. Draft B/L uyusmazliginda operasyondaki ilgili kisiye hazir mail; Harun Bey icin
-- girilmemis odemeler ve bekleyen on odemeler. Ben kopyalayip kendi saglayicimdan gonderecegim."
--
-- Gorevler TABLODA TUTULMAZ: her okumada kaynaktan hesaplanir (draft duzelince / odeme girilince kendiliginden kapanir).
-- Tabloda yalniz yoneticinin "Gonderdim" isaretleri ve sabah ozet mailinin gonderim kaydi durur.
-- Yalniz yonetici: oturum e-postasi execution@unex.com.tr (lib/asistan/gorunum.ts YONETICI_EPOSTASI ile ayni).
-- Sadece EKLEME: mevcut hicbir tablo / fonksiyon degismez.
-- ============================================================================

create table if not exists public.asistan_isaretleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  anahtar text not null check (char_length(anahtar) between 3 and 200),
  tur text not null check (tur in ('draft_bl', 'odeme')),
  ozet text check (ozet is null or char_length(ozet) <= 500),
  isleyen text not null,
  zaman timestamptz not null default now(),
  geri_alindi timestamptz
);
create unique index if not exists asistan_isaretleri_aktif on public.asistan_isaretleri (company_id, anahtar) where geri_alindi is null;
alter table public.asistan_isaretleri enable row level security;
revoke all on public.asistan_isaretleri from anon, authenticated;

create table if not exists public.asistan_ozet_gonderimleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tarih date not null,
  durum text not null check (durum in ('gonderildi', 'test', 'bos', 'hata')),
  alicilar text,
  gorev_sayisi integer not null default 0,
  mesaj_id text,
  hata text,
  olusturma timestamptz not null default now()
);
create unique index if not exists asistan_ozet_gunde_bir on public.asistan_ozet_gonderimleri (company_id, tarih) where durum in ('gonderildi', 'bos');
alter table public.asistan_ozet_gonderimleri enable row level security;
revoke all on public.asistan_ozet_gonderimleri from anon, authenticated;

-- Oturumdaki kullanici yonetici mi
create or replace function public.yonetici_asistani_mi()
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select auth.uid() is not null
     and lower(coalesce(auth.jwt() ->> 'email', '')) = 'execution@unex.com.tr'
     and public.auth_company_id() is not null;
$function$;

-- Yoneticinin sirketi (sabah ozet maili; yalniz service_role)
create or replace function public.yonetici_asistani_sirketi()
 returns uuid
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select k.company_id from public.kullanici_rolleri k join auth.users u on u.id = k.user_id
  where lower(u.email) = 'execution@unex.com.tr' and k.company_id is not null
  order by k.olusturma_tarihi limit 1;
$function$;

-- Gorev kaynaklari (tek yer; sayfa ve sabah ozet maili ayni veriyi kullanir). Yalniz service_role / sarmalayici.
create or replace function public.yonetici_asistan_veri(p_company uuid)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
with bugun as (select (now() at time zone 'Europe/Istanbul')::date as g),
draft as (
  select d.id, d.dosya_no, d.alici_firma, d.varis_limani, d.draft_bl_yukleme_tarihi, d.draft_revize_istendi,
         d.draft_bl_kontrol_sonucu as k, d.bl_no
  from public.ihracat_dosyalari d
  where d.company_id = p_company and d.durum = 'Açık'
    and d.draft_bl_dosya_url is not null
    and jsonb_typeof(d.draft_bl_kontrol_sonucu::jsonb) = 'object'
    and (d.draft_bl_kontrol_sonucu ->> 'uyumlu') = 'false'
    and not coalesce(d.draft_onaylandi, false)
)
select jsonb_build_object(
  'tarih', (select g from bugun),
  'draft', coalesce((
    select jsonb_agg(jsonb_build_object(
      'dosya_id', x.id, 'dosya_no', x.dosya_no, 'alici_firma', x.alici_firma, 'varis_limani', x.varis_limani,
      'bl_no', coalesce(nullif(x.k ->> 'bl_no', ''), x.bl_no),
      'yukleme', x.draft_bl_yukleme_tarihi,
      'kontrol_tarihi', coalesce(nullif(x.k ->> 'tarih', ''), x.draft_bl_yukleme_tarihi::text),
      'ozet', x.k ->> 'ozet',
      'revize_istendi', coalesce(x.draft_revize_istendi, false),
      'gemi', (select concat_ws(' ', r.gemi_adi, r.sefer_no) from public.rezervasyonlar r where r.dosya_id = x.id order by r.olusturma_tarihi limit 1),
      'acente', (select r.acente_ismi from public.rezervasyonlar r where r.dosya_id = x.id order by r.olusturma_tarihi limit 1),
      'alanlar', coalesce(
        (select jsonb_agg(jsonb_build_object('alan', c ->> 'alan', 'sistem', c ->> 'sistem', 'belge', c ->> 'belge', 'not', c ->> 'not'))
         from jsonb_array_elements(case when jsonb_typeof(x.k -> 'kontroller') = 'array' then x.k -> 'kontroller' else '[]'::jsonb end) c
         where c ->> 'durum' = 'uyusmuyor'),
        (select jsonb_agg(jsonb_build_object('alan', u ->> 'alan', 'sistem', u ->> 'sistemde', 'belge', u ->> 'dosyada', 'not', null))
         from jsonb_array_elements(case when jsonb_typeof(x.k -> 'uyusmazliklar') = 'array' then x.k -> 'uyusmazliklar' else '[]'::jsonb end) u),
        '[]'::jsonb)
    ) order by x.draft_bl_yukleme_tarihi desc)
    from draft x), '[]'::jsonb),
  'odeme', coalesce((
    select jsonb_agg(jsonb_build_object(
      'rezervasyon_id', r.id, 'dosya_id', d.id, 'dosya_no', d.dosya_no, 'alici_firma', d.alici_firma,
      'proforma_no', d.proforma_no, 'varis_limani', d.varis_limani, 'gemi', concat_ws(' ', r.gemi_adi, r.sefer_no),
      'etd', r.gemi_kalkis_tarihi, 'gun', (select g from bugun) - r.gemi_kalkis_tarihi, 'konteyner', r.konteyner_adedi,
      'konsimento_durumu', r.konsimento_durumu
    ) order by r.gemi_kalkis_tarihi, d.dosya_no)
    from public.rezervasyonlar r join public.ihracat_dosyalari d on d.id = r.dosya_id and d.company_id = p_company
    where r.company_id = p_company and r.gemi_kalkis_tarihi <= (select g from bugun)
      and coalesce(r.konsimento_durumu, '') not in ('telex', 'seawaybill', 'vesaik')), '[]'::jsonb),
  'on_odeme', coalesce((
    select jsonb_agg(jsonb_build_object(
      'anahtar', s.anahtar, 'kaynak', s.kaynak, 'proforma_no', s.proforma_no, 'proforma_tarihi', s.proforma_tarihi,
      'firma', s.firma, 'miktar_mt', s.miktar_mt, 'konteyner', s.konteyner, 'tutar', s.tutar, 'para_birimi', s.para_birimi,
      'liman', s.liman, 'gun', (select g from bugun) - s.proforma_tarihi
    ) order by s.proforma_tarihi nulls last, s.proforma_no)
    from public.siparis_listesi_veri(p_company) s where s.durum = 'onay_bekliyor'), '[]'::jsonb),
  'kapananlar', coalesce((
    select jsonb_agg(z order by z ->> 'zaman' desc) from (
      select jsonb_build_object('tur', 'odeme', 'baslik', concat_ws(' · ', d.dosya_no, d.alici_firma), 'ayrinti', r.konsimento_durumu,
                                'zaman', r.konsimento_durumu_tarihi) z
      from public.rezervasyonlar r join public.ihracat_dosyalari d on d.id = r.dosya_id
      where r.company_id = p_company and r.konsimento_durumu in ('telex', 'seawaybill', 'vesaik')
        and r.konsimento_durumu_tarihi > now() - interval '7 days'
      union all
      select jsonb_build_object('tur', 'on_odeme', 'baslik', o.proforma_anahtar,
                                'ayrinti', case when o.tutar is not null then concat(o.tutar::text, ' ', coalesce(o.para_birimi, '')) else o.onay_turu end,
                                'zaman', o.updated_at)
      from public.siparis_on_odemeler o
      where o.company_id = p_company and o.alindi and o.updated_at > now() - interval '7 days'
      union all
      select jsonb_build_object('tur', 'draft_bl', 'baslik', concat_ws(' · ', d.dosya_no, d.alici_firma), 'ayrinti', 'Draft B/L uyumlu',
                                'zaman', coalesce(nullif(d.draft_bl_kontrol_sonucu ->> 'tarih', ''), d.draft_bl_yukleme_tarihi::text))
      from public.ihracat_dosyalari d
      where d.company_id = p_company and d.durum = 'Açık' and (d.draft_bl_kontrol_sonucu ->> 'uyumlu') = 'true'
        and d.draft_bl_yukleme_tarihi > now() - interval '7 days'
    ) q), '[]'::jsonb),
  'isaretler', coalesce((
    select jsonb_agg(jsonb_build_object('anahtar', i.anahtar, 'tur', i.tur, 'ozet', i.ozet, 'isleyen', i.isleyen, 'zaman', i.zaman) order by i.zaman desc)
    from public.asistan_isaretleri i
    where i.company_id = p_company and i.geri_alindi is null and i.zaman > now() - interval '60 days'), '[]'::jsonb)
);
$function$;

-- Sayfa: yalniz yonetici
create or replace function public.yonetici_asistani()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.yonetici_asistani_mi() then
    raise exception 'Bu sayfa yalnız yönetici içindir.' using errcode = '42501';
  end if;
  return public.yonetici_asistan_veri(public.auth_company_id());
end;
$function$;

-- "Gonderdim" isareti (ayni gorev icin tek aktif isaret)
create or replace function public.asistan_isaretle(p_anahtar text, p_tur text, p_ozet text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.auth_company_id();
  v_satir public.asistan_isaretleri;
begin
  if not public.yonetici_asistani_mi() then
    raise exception 'Bu işlem yalnız yönetici içindir.' using errcode = '42501';
  end if;
  if p_tur not in ('draft_bl', 'odeme') then raise exception 'Bilinmeyen görev türü.'; end if;
  insert into public.asistan_isaretleri (company_id, anahtar, tur, ozet, isleyen)
  values (v_sirket, left(trim(p_anahtar), 200), p_tur, left(p_ozet, 500), lower(coalesce(auth.jwt() ->> 'email', '')))
  on conflict (company_id, anahtar) where geri_alindi is null do nothing;
  select * into v_satir from public.asistan_isaretleri
  where company_id = v_sirket and anahtar = left(trim(p_anahtar), 200) and geri_alindi is null;
  return jsonb_build_object('anahtar', v_satir.anahtar, 'zaman', v_satir.zaman, 'isleyen', v_satir.isleyen);
end;
$function$;

-- Yanlislikla "Gonderdim": geri al (kayit silinmez, geri_alindi yazilir)
create or replace function public.asistan_isaret_geri_al(p_anahtar text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.yonetici_asistani_mi() then
    raise exception 'Bu işlem yalnız yönetici içindir.' using errcode = '42501';
  end if;
  update public.asistan_isaretleri set geri_alindi = now()
  where company_id = public.auth_company_id() and anahtar = trim(p_anahtar) and geri_alindi is null;
end;
$function$;

revoke all on function public.yonetici_asistani_mi() from public, anon;
revoke all on function public.yonetici_asistani_sirketi() from public, anon, authenticated;
revoke all on function public.yonetici_asistan_veri(uuid) from public, anon, authenticated;
revoke all on function public.yonetici_asistani() from public, anon;
revoke all on function public.asistan_isaretle(text, text, text) from public, anon;
revoke all on function public.asistan_isaret_geri_al(text) from public, anon;
grant execute on function public.yonetici_asistani_mi() to authenticated;
grant execute on function public.yonetici_asistani() to authenticated;
grant execute on function public.asistan_isaretle(text, text, text) to authenticated;
grant execute on function public.asistan_isaret_geri_al(text) to authenticated;
grant execute on function public.yonetici_asistani_sirketi() to service_role;
grant execute on function public.yonetici_asistan_veri(uuid) to service_role;
