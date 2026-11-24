-- 24.11.2026: panel_filo_durumu'na "kantarda" eklendi: kantarda su an ikinci tartimi bekleyen (son 24 saatte ilk tartimi
-- yapilmis) plakalar. Ana Panel filo dagiliminda bu araclar "bosta" degil "kantarda" sayilir. Geri kalan her sey 20261123200000 ile ayni.
-- Salt okunur; fiyat yok.
create or replace function public.panel_filo_durumu()
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
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('panel') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Yetkiniz yok.';
  end if;

  with kont as (
    select upper(regexp_replace(k.dba_kontrol_sonucu->>'arac_plaka', '\s', '', 'g')) as plaka,
      case when (k.dba_kontrol_sonucu->>'tartim_tarih_saat') ~ '^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}'
        then to_timestamp(left(k.dba_kontrol_sonucu->>'tartim_tarih_saat', 16), 'DD.MM.YYYY HH24:MI')::timestamp
        else (k.dba_yukleme_tarihi at time zone 'Europe/Istanbul') end as zaman
    from konteynerler k
    where k.company_id = v_sirket and k.dba_dosya_url is not null and k.dba_yukleme_tarihi > now() - interval '75 days'
      and nullif(btrim(k.dba_kontrol_sonucu->>'arac_plaka'), '') is not null
  ), alis as (
    select upper(regexp_replace(t.plaka, '\s', '', 'g')) as plaka, (coalesce(t.teslim_zamani, t.olusturma) at time zone 'Europe/Istanbul') as zaman, t.net_kg
    from ic_alis_teslimler t
    where t.company_id = v_sirket and not coalesce(t.gecmis, false) and coalesce(t.teslim_zamani, t.olusturma) > now() - interval '75 days'
  ), sevk as (
    select upper(regexp_replace(s.plaka, '\s', '', 'g')) as plaka, (coalesce(s.irsaliye_tarihi, s.olusturma) at time zone 'Europe/Istanbul') as zaman
    from ic_sevkler s
    where s.company_id = v_sirket and not coalesce(s.gecmis, false) and coalesce(s.irsaliye_tarihi, s.olusturma) > now() - interval '75 days'
  ), filo as (
    select k.plaka from (select distinct plaka from kont) k
    where (select count(*) from kont x where x.plaka = k.plaka)
        + (select count(*) from alis x where x.plaka = k.plaka)
        + (select count(*) from sevk x where x.plaka = k.plaka) >= 3
  ), olay as (
    select plaka, zaman::date as gun, 'konteyner' as tur from kont where zaman > now() - interval '21 days'
    union all select plaka, zaman::date, 'alis' from alis where zaman > now() - interval '21 days'
    union all select plaka, zaman::date, 'sevk' from sevk where zaman > now() - interval '21 days'
  ), gunluk as (
    select o.gun, o.plaka,
      count(*) filter (where o.tur = 'konteyner') as konteyner,
      count(*) filter (where o.tur = 'alis') as alis,
      count(*) filter (where o.tur = 'sevk') as sevk
    from olay o join filo f using (plaka)
    group by o.gun, o.plaka
  ), verim as (
    select count(*) as sefer, count(distinct (a.plaka, a.zaman::date)) as arac_gun, avg(a.net_kg) as ort_kg
    from alis a join filo f using (plaka)
  )
  select jsonb_build_object(
    'bugun', to_char(now() at time zone 'Europe/Istanbul', 'YYYY-MM-DD'),
    'kantarda', coalesce((select jsonb_agg(distinct upper(regexp_replace(kb.plaka, '\s', '', 'g')))
                          from kantar_bekleyenler kb where kb.company_id = v_sirket and nullif(btrim(kb.plaka), '') is not null
                            and kb.giris > now() - interval '24 hours'), '[]'::jsonb),
    'filo', coalesce((select jsonb_agg(plaka order by plaka) from filo), '[]'::jsonb),
    'gunler', coalesce((select jsonb_agg(jsonb_build_object('gun', to_char(gun, 'YYYY-MM-DD'), 'plaka', plaka, 'konteyner', konteyner, 'alis', alis, 'sevk', sevk) order by gun, plaka) from gunluk), '[]'::jsonb),
    'alislar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'no', a.alis_no, 'tedarikci', coalesce(nullif(btrim(t.kisa_ad), ''), t.unvan), 'urun', a.urun, 'hedef_kg', a.miktar_kg,
        'gelen_kg', coalesce((select sum(x.net_kg) from ic_alis_teslimler x where x.alis_id = a.id), 0),
        'sefer', (select count(*) from ic_alis_teslimler x where x.alis_id = a.id),
        'son_teslim', (select to_char(max(x.teslim_zamani) at time zone 'Europe/Istanbul', 'YYYY-MM-DD') from ic_alis_teslimler x where x.alis_id = a.id),
        'termin', to_char(a.termin, 'YYYY-MM-DD'), 'teslim', a.teslim) order by a.termin nulls last, a.alis_no)
      from ic_alis_siparisleri a left join ic_tedarikciler t on t.id = a.tedarikci_id
      where a.company_id = v_sirket and a.durum = 'acik'), '[]'::jsonb),
    'satislar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'no', e.is_emri_no, 'musteri', coalesce(nullif(btrim(m.kisa_ad), ''), m.unvan), 'urun', e.urun, 'hedef_tur', e.hedef_tur,
        'hedef_kg', e.hedef_kg, 'hedef_arac', e.hedef_arac,
        'giden_kg', coalesce((select sum(s.net_kg) from ic_sevkler s where s.is_emri_id = e.id), 0),
        'sefer', (select count(*) from ic_sevkler s where s.is_emri_id = e.id)) order by e.is_emri_no)
      from ic_is_emirleri e left join ic_musteriler m on m.id = e.musteri_id
      where e.company_id = v_sirket and e.durum = 'acik' and e.nakliye = 'satici'), '[]'::jsonb),
    'verim', (select jsonb_build_object('sefer', sefer, 'arac_gun', arac_gun, 'ort_kg', round(coalesce(ort_kg, 0))) from verim)
  ) into v_sonuc;
  return v_sonuc;
end;
$$;

revoke all on function public.panel_filo_durumu() from public, anon;
grant execute on function public.panel_filo_durumu() to authenticated;
