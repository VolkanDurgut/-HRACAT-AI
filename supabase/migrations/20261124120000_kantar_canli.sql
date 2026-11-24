-- 24.11.2026: KANTAR PANELI - CANLI KANTAR BILGISI (Asama 0 ekranlari; SALT OKUNUR, hicbir is kaydi degismez).
-- Kullanici: "Butun acik ihracat ve ic piyasa is emirlerinin takibini artik otomatik kantar tonajina gore yapabiliriz
-- degil mi? Su an arac tartildikca sistem kendini guncelleyecek mi?" + kurallar: evrak kg'ina dokunulmaz; ic piyasada
-- kantar irsaliyenin yerine GECMEZ (irsaliye resmi, kantar canli bilgi + karsilastirma).
--
-- kantar_canli() doner:
--   son_sinyal   : kantar bilgisayarindan son veri (ajan her dakika)
--   iceride      : ilk tartimi yapilmis, ikinci tartimi bekleyen araclar (+ eslestigi dosya / is emri / alis)
--   konteynerler : ACIK dosyalarin DBA'si henuz gelmemis konteynerleri icin kantar durumu
--                  (dolduruluyor = kantarda bekliyor; tartildi = ikinci tartim bitti, DBA bekleniyor)
--   is_emirleri  : acik ic satis is emirleri icin "kantarda tartildi, irsaliyesi sisteme girilmedi" kg / arac
--   alislar      : acik alislar icin ayni (gelen arac)
--   eslesmeyen   : son 3 gunde tartilan, 5 ton ustu, hicbir kayitla / acik isle eslesmeyen araclar
-- Eslestirme: konteyner no (ihracat); irsaliye no (ic satis / alis, kayitli ise "bekleyen" sayilmaz); irsaliye yoksa
-- firma adi + urun jetonlari (kantar_ad_jetonlari) ile acik is emri / alis; ayni gun ayni iste +-150 kg kayitli
-- sevk / teslim varsa zaten girilmis sayilir. Fiyat DONMEZ (kantarci fiyat gormez kurali).

create or replace function public.kantar_ad_jetonlari(p text)
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct j), '{}')
  from regexp_split_to_table(
         regexp_replace(upper(translate(coalesce(p, ''), 'çğıöşüâîûÇĞİÖŞÜÂÎÛ', 'CGIOSUAIUCGIOSUAIU')), '[^A-Z0-9]+', ' ', 'g'),
         ' ') j
  where length(j) >= 3
    and j not in ('SAN', 'SANAYI', 'TIC', 'TICARET', 'LTD', 'STI', 'LIMITED', 'COMPANY', 'AJANS', 'TMO', 'URUNLERI', 'TARIM',
                  'VE', 'AS', 'KOOP', 'BIRLIGI', 'SIRKETI', 'INS', 'ENJ', 'ZAH', 'GIDA', 'TICARETI', 'SANAYII', 'DOKME', 'CUVAL')
$$;

create or replace function public.kantar_canli()
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
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('panel') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Yetkiniz yok.';
  end if;

  with
  emir as (
    select e.id, e.is_emri_no, e.olusturma, kantar_ad_jetonlari(coalesce(m.unvan, '') || ' ' || coalesce(m.kisa_ad, '')) as fj, kantar_ad_jetonlari(e.urun) as uj
    from ic_is_emirleri e left join ic_musteriler m on m.id = e.musteri_id
    where e.company_id = v_sirket and e.durum = 'acik'
  ),
  alis as (
    select a.id, a.alis_no, a.olusturma, a.termin, kantar_ad_jetonlari(coalesce(t.unvan, '') || ' ' || coalesce(t.kisa_ad, '')) as fj, kantar_ad_jetonlari(a.urun) as uj
    from ic_alis_siparisleri a left join ic_tedarikciler t on t.id = a.tedarikci_id
    where a.company_id = v_sirket and a.durum = 'acik'
  ),
  -- son 7 gunun tamamlanan tartimlari (+ normallestirilmis alanlar)
  t as (
    select k.*,
      coalesce(
        substring(upper(regexp_replace(coalesce(k.dba_konteyner, ''), '[^0-9A-Za-z]', '', 'g')) from '^[A-Z]{4}[0-9]{7}'),
        substring(upper(regexp_replace(coalesce(k.konteyner_muhur, ''), '\s', '', 'g')) from '^[A-Z]{4}[0-9]{7}')) as konteyner_n,
      upper(regexp_replace(coalesce(k.irsaliye_no, ''), '\s', '', 'g')) as irsaliye_n,
      kantar_ad_jetonlari(k.firma) as fj, kantar_ad_jetonlari(k.urun) as uj
    from kantar_tartimlari k
    where k.company_id = v_sirket and k.cikis is not null and k.cikis > now() - interval '7 days'
  ),
  t2 as (
    select t.*,
      exists (select 1 from konteynerler c where c.company_id = v_sirket and t.konteyner_n is not null
                and upper(regexp_replace(coalesce(c.konteyner_no, ''), '\s', '', 'g')) = t.konteyner_n) as ihracat_var,
      exists (select 1 from ic_sevkler s where s.company_id = v_sirket and t.irsaliye_n <> ''
                and upper(regexp_replace(coalesce(s.irsaliye_no, ''), '\s', '', 'g')) = t.irsaliye_n) as sevk_var,
      exists (select 1 from ic_alis_teslimler x where x.company_id = v_sirket and t.irsaliye_n <> ''
                and upper(regexp_replace(coalesce(x.irsaliye_no, ''), '\s', '', 'g')) = t.irsaliye_n) as teslim_var,
      (select e.id from emir e
        where cardinality(t.uj) > 0 and e.uj && t.uj and e.fj && t.fj and t.cikis >= e.olusturma - interval '1 day'
        order by cardinality(array(select unnest(e.fj) intersect select unnest(t.fj))) desc, e.olusturma limit 1) as emir_id,
      (select a.id from alis a
        where cardinality(t.uj) > 0 and a.uj && t.uj and a.fj && t.fj and t.cikis >= a.olusturma - interval '1 day'
        order by cardinality(array(select unnest(a.fj) intersect select unnest(t.fj))) desc, a.termin nulls last, a.olusturma limit 1) as alis_id
    from t
  ),
  t3 as (
    select t2.*,
      -- irsaliye no yok / yanlis ama ayni gun ayni iste ayni kg (+-150) kayit var: zaten girilmis
      (t2.emir_id is not null and exists (select 1 from ic_sevkler s where s.is_emri_id = t2.emir_id
          and (coalesce(s.irsaliye_tarihi, s.olusturma) at time zone 'Europe/Istanbul')::date = (t2.cikis at time zone 'Europe/Istanbul')::date
          and abs(coalesce(s.net_kg, 0) - t2.net_kg) <= 150)) as emir_kayitli,
      (t2.alis_id is not null and exists (select 1 from ic_alis_teslimler x where x.alis_id = t2.alis_id
          and (coalesce(x.teslim_zamani, x.olusturma) at time zone 'Europe/Istanbul')::date = (t2.cikis at time zone 'Europe/Istanbul')::date
          and abs(coalesce(x.net_kg, 0) - t2.net_kg) <= 150)) as alis_kayitli
    from t2
  ),
  bekleyen_ic as (
    select * from t3
    where not ihracat_var and not sevk_var and not teslim_var
      and ((emir_id is not null and not emir_kayitli) or (emir_id is null and alis_id is not null and not alis_kayitli))
  ),
  -- kantarda bekleyenler (FIRST)
  b as (
    select kb.*,
      substring(upper(regexp_replace(coalesce(kb.konteyner_muhur, ''), '\s', '', 'g')) from '^[A-Z]{4}[0-9]{7}') as konteyner_n,
      kantar_ad_jetonlari(kb.firma) as fj, kantar_ad_jetonlari(kb.urun) as uj
    from kantar_bekleyenler kb where kb.company_id = v_sirket
  )
  select jsonb_build_object(
    'son_sinyal', (select max(son_sinyal) from kantar_cihazlari where company_id = v_sirket and aktif),
    'iceride', coalesce((select jsonb_agg(jsonb_build_object(
        'kayit_no', b.kayit_no, 'plaka', b.plaka, 'firma', b.firma, 'urun', b.urun, 'konteyner', b.konteyner_n,
        'giris', b.giris, 'bekleme_dk', round(extract(epoch from (now() - b.giris)) / 60), 'tartim1_kg', b.tartim1_kg,
        'dosya_no', (select d.dosya_no from konteynerler c join ihracat_dosyalari d on d.id = c.dosya_id
                      where c.company_id = v_sirket and b.konteyner_n is not null
                        and upper(regexp_replace(coalesce(c.konteyner_no, ''), '\s', '', 'g')) = b.konteyner_n
                      order by c.olusturma_tarihi desc limit 1),
        'is_emri_no', (select e.is_emri_no from emir e where cardinality(b.uj) > 0 and e.uj && b.uj and e.fj && b.fj
                        order by cardinality(array(select unnest(e.fj) intersect select unnest(b.fj))) desc, e.olusturma limit 1),
        'alis_no', (select a.alis_no from alis a where cardinality(b.uj) > 0 and a.uj && b.uj and a.fj && b.fj
                     order by cardinality(array(select unnest(a.fj) intersect select unnest(b.fj))) desc, a.termin nulls last, a.olusturma limit 1)
      ) order by b.giris) from b), '[]'::jsonb),
    'konteynerler', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('konteyner_id', c.id, 'durum',
                 case when exists (select 1 from b where b.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g'))) then 'dolduruluyor' else 'tartildi' end,
                 'giris', coalesce((select b.giris from b where b.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g')) limit 1),
                                   (select k.giris from t k where k.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g')) order by k.cikis desc limit 1)),
                 'cikis', (select k.cikis from t k where k.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g')) order by k.cikis desc limit 1),
                 'plaka', coalesce((select b.plaka from b where b.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g')) limit 1),
                                   (select k.plaka from t k where k.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g')) order by k.cikis desc limit 1))) as x
        from konteynerler c join ihracat_dosyalari d on d.id = c.dosya_id
        where c.company_id = v_sirket and d.durum in ('Açık', 'Acik') and c.dba_dosya_url is null
          and (exists (select 1 from b where b.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g')))
               or exists (select 1 from t k where k.konteyner_n = upper(regexp_replace(c.konteyner_no, '\s', '', 'g'))))
      ) z), '[]'::jsonb),
    'is_emirleri', coalesce((select jsonb_agg(jsonb_build_object('is_emri_id', bi.emir_id, 'kg', bi.kg, 'arac', bi.arac, 'son_cikis', bi.son,
          'plakalar', bi.plakalar)) from (
        select emir_id, sum(net_kg) as kg, count(*) as arac, max(cikis) as son, jsonb_agg(plaka order by cikis) as plakalar
        from bekleyen_ic where emir_id is not null group by emir_id) bi), '[]'::jsonb),
    'alislar', coalesce((select jsonb_agg(jsonb_build_object('alis_id', ba.alis_id, 'kg', ba.kg, 'arac', ba.arac, 'son_cikis', ba.son,
          'plakalar', ba.plakalar)) from (
        select alis_id, sum(net_kg) as kg, count(*) as arac, max(cikis) as son, jsonb_agg(plaka order by cikis) as plakalar
        from bekleyen_ic where emir_id is null and alis_id is not null group by alis_id) ba), '[]'::jsonb),
    'eslesmeyen', coalesce((select jsonb_agg(jsonb_build_object('kayit_no', u.kayit_no, 'plaka', u.plaka, 'firma', u.firma, 'urun', u.urun,
          'irsaliye_no', u.irsaliye_no, 'cikis', u.cikis, 'net_kg', u.net_kg) order by u.cikis desc)
        from t3 u
        where u.cikis > now() - interval '3 days' and u.net_kg >= 5000
          and not u.ihracat_var and not u.sevk_var and not u.teslim_var and u.emir_id is null and u.alis_id is null), '[]'::jsonb)
  ) into v_sonuc;
  return v_sonuc;
end;
$$;
revoke all on function public.kantar_canli() from public, anon;
grant execute on function public.kantar_canli() to authenticated;
revoke all on function public.kantar_ad_jetonlari(text) from public, anon;
grant execute on function public.kantar_ad_jetonlari(text) to authenticated;
