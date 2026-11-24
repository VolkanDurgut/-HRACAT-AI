-- 24.11.2026: KANTAR BAGLANTISI - ASAMA 0 (DENEME MODU). Kantar programi (BAYKON Truck Scale) tartimlarini
-- SQL Server Express'teki TruckSolas veritabanina yaziyor (dbo.RECORDS: tamamlanan, dbo.FIRST: ilk tartimi
-- yapilmis / ikinci tartimi bekleyen). Kantar bilgisayarindaki DBA ajani (>= 1.2.0) bu kayitlari SALT OKUNUR okur
-- ve dba-otomatik fonksiyonuna (x-islem: tartim) gonderir.
--
-- KURALLAR (kullanici, 24.11.2026):
--  - Evraklardaki kg'a DOKUNULMAZ (belgelerde 25.000 / 25.050 gibi degerler aynen kalir); kantar kg'i yalniz kontrol / bilgi.
--  - Ic piyasada kantar irsaliyenin yerine GECMEZ; irsaliyedeki kg kantar kg'i ile KARSILASTIRILIR.
--  - Deneme modu: bu tablolar hicbir is kaydini (konteyner, sevk, alis teslimi) degistirmez. Eslestirme yalniz rapordur
--    (kantar_karsilastirma).
-- Kisisel veri: sofor adi ve TC no ALINMAZ (ajan gondermez). Kamera / fotograf alanlari alinmaz.

create table if not exists public.kantar_tartimlari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  cihaz_id uuid not null references public.kantar_cihazlari(id) on delete cascade,
  kayit_no bigint not null,                 -- RECORDS.ID
  ilk_kayit_no bigint,                      -- RECORDS.EXTRA_3 (FIRST tablosundaki ilk tartim kaydi)
  plaka text,
  firma text,
  urun text,
  rezervasyon text,                         -- kantar sorusu "Gel yer / Rezerv. No"
  irsaliye_no text,                         -- kantar sorusu "Git yer / Irsaliye No"
  konteyner_muhur text,                     -- kantar sorusu "Kontey No/Muhur No" (ham)
  dorse text,
  liman text,
  giris timestamptz,
  cikis timestamptz,
  tartim1_kg numeric,
  tartim2_kg numeric,
  net_kg numeric generated always as (abs(coalesce(tartim2_kg, 0) - coalesce(tartim1_kg, 0))) stored,
  fis1 text,
  fis2 text,
  dba_belge_no text,                        -- SOLAS_02
  dba_konteyner text,                       -- SOLAS_03
  dba_durum smallint,                       -- SolasStatu (2 = DBA gonderildi)
  degisti boolean,                          -- RECORDS.CHANGE
  ilk_gorulme timestamptz not null default now(),
  son_gorulme timestamptz not null default now(),
  unique (cihaz_id, kayit_no)
);
create index if not exists kantar_tartimlari_sirket_cikis on public.kantar_tartimlari (company_id, cikis desc);
create index if not exists kantar_tartimlari_irsaliye on public.kantar_tartimlari (company_id, irsaliye_no);

-- Ilk tartimi yapilmis, ikinci tartimi bekleyen araclar (FIRST tablosunun anlik kopyasi; her gonderimde yenilenir)
create table if not exists public.kantar_bekleyenler (
  cihaz_id uuid not null references public.kantar_cihazlari(id) on delete cascade,
  kayit_no bigint not null,
  company_id uuid not null,
  plaka text,
  firma text,
  urun text,
  rezervasyon text,
  irsaliye_no text,
  konteyner_muhur text,
  liman text,
  giris timestamptz,
  tartim1_kg numeric,
  guncelleme timestamptz not null default now(),
  primary key (cihaz_id, kayit_no)
);

alter table public.kantar_tartimlari enable row level security;
alter table public.kantar_bekleyenler enable row level security;
revoke all on public.kantar_tartimlari from anon, authenticated;
revoke all on public.kantar_bekleyenler from anon, authenticated;
-- Politika YOK: yalniz service_role (dba-otomatik) yazar; okuma asagidaki SECURITY DEFINER fonksiyonla.

-- ---------------------------------------------------------------- kaydet (yalniz dba-otomatik / service_role)
-- p_kayitlar / p_bekleyenler: ajanin gonderdigi alanlar (zamanlar "YYYY-MM-DDTHH:MI:SS", Turkiye yerel saati).
-- p_bekleyenler null ise bekleyenler degismez (ajan FIRST'u okuyamadiysa eski liste silinmesin).
create or replace function public.kantar_tartim_kaydet(p_cihaz_id uuid, p_kayitlar jsonb, p_bekleyenler jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid;
  v_adet int := 0;
  v_son bigint;
begin
  select company_id into v_sirket from kantar_cihazlari where id = p_cihaz_id and aktif;
  if v_sirket is null then raise exception 'Cihaz bulunamadi.'; end if;
  if jsonb_typeof(coalesce(p_kayitlar, '[]'::jsonb)) <> 'array' then raise exception 'kayitlar dizi olmali.'; end if;
  if jsonb_array_length(coalesce(p_kayitlar, '[]'::jsonb)) > 300 then raise exception 'Bir istekte en fazla 300 kayit.'; end if;

  with g as (
    select
      (k->>'kayit_no')::bigint as kayit_no,
      nullif(k->>'ilk_kayit_no', '')::bigint as ilk_kayit_no,
      left(nullif(btrim(k->>'plaka'), ''), 30) as plaka,
      left(nullif(btrim(k->>'firma'), ''), 200) as firma,
      left(nullif(btrim(k->>'urun'), ''), 120) as urun,
      left(nullif(btrim(k->>'rezervasyon'), ''), 60) as rezervasyon,
      left(nullif(btrim(k->>'irsaliye_no'), ''), 60) as irsaliye_no,
      left(nullif(btrim(k->>'konteyner_muhur'), ''), 120) as konteyner_muhur,
      left(nullif(btrim(k->>'dorse'), ''), 30) as dorse,
      left(nullif(btrim(k->>'liman'), ''), 60) as liman,
      case when k->>'giris' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$' then ((k->>'giris') || '+03:00')::timestamptz end as giris,
      case when k->>'cikis' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$' then ((k->>'cikis') || '+03:00')::timestamptz end as cikis,
      nullif(k->>'tartim1_kg', '')::numeric as tartim1_kg,
      nullif(k->>'tartim2_kg', '')::numeric as tartim2_kg,
      left(nullif(btrim(k->>'fis1'), ''), 20) as fis1,
      left(nullif(btrim(k->>'fis2'), ''), 20) as fis2,
      left(nullif(btrim(k->>'dba_belge_no'), ''), 20) as dba_belge_no,
      left(nullif(btrim(k->>'dba_konteyner'), ''), 30) as dba_konteyner,
      nullif(k->>'dba_durum', '')::smallint as dba_durum,
      case when k->>'degisti' in ('true', '1', 'True') then true when k->>'degisti' in ('false', '0', 'False') then false end as degisti
    from jsonb_array_elements(coalesce(p_kayitlar, '[]'::jsonb)) k
    where (k->>'kayit_no') ~ '^\d{1,15}$'
  ), ekle as (
    insert into kantar_tartimlari as t (company_id, cihaz_id, kayit_no, ilk_kayit_no, plaka, firma, urun, rezervasyon, irsaliye_no,
      konteyner_muhur, dorse, liman, giris, cikis, tartim1_kg, tartim2_kg, fis1, fis2, dba_belge_no, dba_konteyner, dba_durum, degisti)
    select v_sirket, p_cihaz_id, kayit_no, ilk_kayit_no, plaka, firma, urun, rezervasyon, irsaliye_no,
      konteyner_muhur, dorse, liman, giris, cikis, tartim1_kg, tartim2_kg, fis1, fis2, dba_belge_no, dba_konteyner, dba_durum, degisti
    from g
    on conflict (cihaz_id, kayit_no) do update set
      ilk_kayit_no = excluded.ilk_kayit_no, plaka = excluded.plaka, firma = excluded.firma, urun = excluded.urun,
      rezervasyon = excluded.rezervasyon, irsaliye_no = excluded.irsaliye_no, konteyner_muhur = excluded.konteyner_muhur,
      dorse = excluded.dorse, liman = excluded.liman, giris = excluded.giris, cikis = excluded.cikis,
      tartim1_kg = excluded.tartim1_kg, tartim2_kg = excluded.tartim2_kg, fis1 = excluded.fis1, fis2 = excluded.fis2,
      dba_belge_no = excluded.dba_belge_no, dba_konteyner = excluded.dba_konteyner, dba_durum = excluded.dba_durum,
      degisti = excluded.degisti, son_gorulme = now()
    returning 1
  )
  select count(*) into v_adet from ekle;

  if p_bekleyenler is not null and jsonb_typeof(p_bekleyenler) = 'array' and jsonb_array_length(p_bekleyenler) <= 100 then
    delete from kantar_bekleyenler where cihaz_id = p_cihaz_id;
    insert into kantar_bekleyenler (cihaz_id, kayit_no, company_id, plaka, firma, urun, rezervasyon, irsaliye_no, konteyner_muhur, liman, giris, tartim1_kg)
    select p_cihaz_id, (k->>'kayit_no')::bigint, v_sirket,
      left(nullif(btrim(k->>'plaka'), ''), 30), left(nullif(btrim(k->>'firma'), ''), 200), left(nullif(btrim(k->>'urun'), ''), 120),
      left(nullif(btrim(k->>'rezervasyon'), ''), 60), left(nullif(btrim(k->>'irsaliye_no'), ''), 60),
      left(nullif(btrim(k->>'konteyner_muhur'), ''), 120), left(nullif(btrim(k->>'liman'), ''), 60),
      case when k->>'giris' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$' then ((k->>'giris') || '+03:00')::timestamptz end,
      nullif(k->>'tartim1_kg', '')::numeric
    from jsonb_array_elements(p_bekleyenler) k
    where (k->>'kayit_no') ~ '^\d{1,15}$'
    on conflict (cihaz_id, kayit_no) do nothing;
  end if;

  select max(kayit_no) into v_son from kantar_tartimlari where cihaz_id = p_cihaz_id;
  return jsonb_build_object('kaydedilen', v_adet, 'son_kayit_no', v_son);
end;
$$;
revoke all on function public.kantar_tartim_kaydet(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.kantar_tartim_kaydet(uuid, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------- karsilastirma (DENEME raporu, salt okunur)
-- Her tamamlanan tartim icin sistemdeki karsiligi:
--  ihracat   : konteyner no (DBA konteyneri ya da "konteyner-muhur" alaninin ilk 11 karakteri) -> konteynerler
--              (dosya, muhur kantar / sistem, booking kantardaki rezervasyon no ile bitiyor mu). kg YALNIZ bilgi.
--  ic_satis  : irsaliye no -> ic_sevkler; irsaliye kg - kantar net = fark
--  ic_alis   : irsaliye no -> ic_alis_teslimler; fark
--  plaka     : irsaliye tutmadiysa ayni gun ayni plaka ic sevk / alis teslimi (olasi eslesme)
--  eslesmedi : sistemde karsiligi yok
create or replace function public.kantar_karsilastirma(p_bas date default (now() at time zone 'Europe/Istanbul')::date - 1, p_bit date default (now() at time zone 'Europe/Istanbul')::date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := auth_company_id();
  v_sonuc jsonb;
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('panel') or ic_sayfa_yetkisi('kantar')) then
    raise exception 'Yetkiniz yok.';
  end if;
  if p_bit < p_bas or p_bit - p_bas > 31 then raise exception 'Tarih araligi en fazla 31 gun.'; end if;

  with t as (
    select k.*,
      upper(regexp_replace(coalesce(k.plaka, ''), '[^0-9A-Za-z]', '', 'g')) as plaka_n,
      coalesce(
        substring(upper(regexp_replace(coalesce(k.dba_konteyner, ''), '[^0-9A-Za-z]', '', 'g')) from '^[A-Z]{4}[0-9]{7}'),
        substring(upper(regexp_replace(coalesce(k.konteyner_muhur, ''), '\s', '', 'g')) from '^[A-Z]{4}[0-9]{7}')
      ) as konteyner_n,
      nullif(btrim(substring(coalesce(k.konteyner_muhur, '') from '-\s*(.+)$')), '') as muhur_kantar,
      upper(regexp_replace(coalesce(k.irsaliye_no, ''), '\s', '', 'g')) as irsaliye_n
    from kantar_tartimlari k
    where k.company_id = v_sirket and k.cikis is not null
      and (k.cikis at time zone 'Europe/Istanbul')::date between p_bas and p_bit
  ), e as (
    select t.*,
      (select jsonb_build_object('dosya_no', d.dosya_no, 'konteyner', c.konteyner_no, 'muhur_sistem', c.muhur_no,
          'booking', r.booking_no, 'dolu', c.dba_dosya_url is not null, 'net_sistem', c.net_agirlik_kg)
         from konteynerler c left join ihracat_dosyalari d on d.id = c.dosya_id left join rezervasyonlar r on r.id = c.rezervasyon_id
        where c.company_id = v_sirket and t.konteyner_n is not null
          and upper(regexp_replace(coalesce(c.konteyner_no, ''), '\s', '', 'g')) = t.konteyner_n
        order by c.olusturma_tarihi desc limit 1) as ihracat,
      (select jsonb_build_object('no', i.is_emri_no, 'plaka', s.plaka, 'net_irsaliye', s.net_kg)
         from ic_sevkler s left join ic_is_emirleri i on i.id = s.is_emri_id
        where s.company_id = v_sirket and t.irsaliye_n <> '' and upper(regexp_replace(coalesce(s.irsaliye_no, ''), '\s', '', 'g')) = t.irsaliye_n
        limit 1) as satis,
      (select jsonb_build_object('no', a.alis_no, 'plaka', x.plaka, 'net_irsaliye', x.net_kg)
         from ic_alis_teslimler x left join ic_alis_siparisleri a on a.id = x.alis_id
        where x.company_id = v_sirket and t.irsaliye_n <> '' and upper(regexp_replace(coalesce(x.irsaliye_no, ''), '\s', '', 'g')) = t.irsaliye_n
        limit 1) as alis,
      (select jsonb_build_object('tur', z.tur, 'no', z.no, 'irsaliye', z.irsaliye_no, 'net_irsaliye', z.net_kg)
         from (
           select 'ic_satis' as tur, i.is_emri_no as no, s.irsaliye_no, s.net_kg, upper(regexp_replace(coalesce(s.plaka, ''), '[^0-9A-Za-z]', '', 'g')) as p,
                  (coalesce(s.irsaliye_tarihi, s.olusturma) at time zone 'Europe/Istanbul')::date as g
             from ic_sevkler s left join ic_is_emirleri i on i.id = s.is_emri_id where s.company_id = v_sirket
           union all
           select 'ic_alis', a.alis_no, x.irsaliye_no, x.net_kg, upper(regexp_replace(coalesce(x.plaka, ''), '[^0-9A-Za-z]', '', 'g')),
                  (coalesce(x.teslim_zamani, x.olusturma) at time zone 'Europe/Istanbul')::date
             from ic_alis_teslimler x left join ic_alis_siparisleri a on a.id = x.alis_id where x.company_id = v_sirket
         ) z
        where z.p = t.plaka_n and z.g = (t.cikis at time zone 'Europe/Istanbul')::date
        order by abs(coalesce(z.net_kg, 0) - t.net_kg) limit 1) as plaka_esi
    from t
  )
  select jsonb_build_object(
    'bas', p_bas, 'bit', p_bit,
    'bekleyenler', coalesce((select jsonb_agg(jsonb_build_object('plaka', b.plaka, 'firma', b.firma, 'urun', b.urun, 'konteyner_muhur', b.konteyner_muhur,
        'giris', to_char(b.giris at time zone 'Europe/Istanbul', 'DD.MM HH24:MI'), 'tartim1_kg', b.tartim1_kg) order by b.giris)
      from kantar_bekleyenler b where b.company_id = v_sirket), '[]'::jsonb),
    'satirlar', coalesce((select jsonb_agg(jsonb_build_object(
        'kayit_no', e.kayit_no, 'plaka', e.plaka, 'firma', e.firma, 'urun', e.urun, 'irsaliye_no', e.irsaliye_no,
        'konteyner', e.konteyner_n, 'muhur_kantar', e.muhur_kantar, 'rezervasyon', e.rezervasyon, 'dba_belge_no', e.dba_belge_no,
        'giris', to_char(e.giris at time zone 'Europe/Istanbul', 'DD.MM HH24:MI'), 'cikis', to_char(e.cikis at time zone 'Europe/Istanbul', 'DD.MM HH24:MI'),
        'dakika', round(extract(epoch from (e.cikis - e.giris)) / 60),
        'tartim1_kg', e.tartim1_kg, 'tartim2_kg', e.tartim2_kg, 'net_kg', e.net_kg,
        'tur', case when e.ihracat is not null then 'ihracat' when e.satis is not null then 'ic_satis' when e.alis is not null then 'ic_alis'
                    when e.plaka_esi is not null then 'plaka' else 'eslesmedi' end,
        'karsilik', coalesce(e.ihracat, e.satis, e.alis, e.plaka_esi),
        'kg_farki', case when e.ihracat is null and coalesce(e.satis, e.alis, e.plaka_esi) is not null
                         then (coalesce(e.satis, e.alis, e.plaka_esi)->>'net_irsaliye')::numeric - e.net_kg end,
        'muhur_tutuyor', case when e.ihracat is not null and e.muhur_kantar is not null and nullif(e.ihracat->>'muhur_sistem', '') is not null
                              -- sistemde muhur cogu zaman yalniz rakam ("123456"), kantarda onekli ("ABCDE123456"): rakamlar karsilastirilir
                              then case when regexp_replace(e.ihracat->>'muhur_sistem', '[^0-9]', '', 'g') <> ''
                                        then regexp_replace(e.muhur_kantar, '[^0-9]', '', 'g') = regexp_replace(e.ihracat->>'muhur_sistem', '[^0-9]', '', 'g')
                                        else upper(regexp_replace(e.muhur_kantar, '[^0-9A-Za-z]', '', 'g')) = upper(regexp_replace(e.ihracat->>'muhur_sistem', '[^0-9A-Za-z]', '', 'g')) end end,
        'booking_tutuyor', case when e.ihracat is not null and nullif(btrim(e.rezervasyon), '') is not null and nullif(e.ihracat->>'booking', '') is not null
                                then upper(regexp_replace(e.ihracat->>'booking', '\s', '', 'g')) like '%' || upper(regexp_replace(e.rezervasyon, '\s', '', 'g')) end
      ) order by e.cikis) from e), '[]'::jsonb)
  ) into v_sonuc;
  return v_sonuc;
end;
$$;
revoke all on function public.kantar_karsilastirma(date, date) from public, anon;
grant execute on function public.kantar_karsilastirma(date, date) to authenticated;
