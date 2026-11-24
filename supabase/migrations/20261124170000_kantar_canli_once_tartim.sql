-- 24.11.2026 aksam: IS EMRI / ALIS ACILMADAN ONCE TARTILAN ARAC (kullanici: "Aktif is emri yokken kantarda arac
-- tartilirsa is emri acildiginda DBA'daki gibi otomatik eslesmeli").
-- kantar_canli canli hesaplanir: is emri acildigi anda onceki tartimlar yeniden degerlendirilir. Degisenler:
--   * eslesme penceresi "is emri olusturma - 1 gun" -> "min(olusturma, siparis tarihi) - 7 gun",
--   * tartim aninda ayni musteri + urunun BASKA (simdi tamamlanmis) is emri aciktiysa tartim o ise aittir, yenisine sayilmaz,
--   * irsaliye no'su kantarda olmayan tartimin "girilmis" kontrolu ayni musterinin TUM (kapali dahil) is emri
--     sevkleriyle yapilir (eski isin araci yeni ise cift sayilmaz). Alis tarafinda ayni kurallar.
-- Is kaydi YAZILMAZ (yalniz gosterim). Onceki surum: 20261124160000_kantar_canli_dusum.sql.

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
  -- Son 60 gunun TUM is emirleri / alislari (kapali dahil): acik olan eslesir; kapali olan "o donemin isi" bilgisi verir
  emir_tum as (
    select e.id, e.is_emri_no, e.durum, e.olusturma, e.kapanis_zamani,
      least(e.olusturma, coalesce((e.siparis_tarihi::timestamp at time zone 'Europe/Istanbul'), e.olusturma)) as baslangic,
      kantar_ad_jetonlari(coalesce(m.unvan, '') || ' ' || coalesce(m.kisa_ad, '')) as fj, kantar_ad_jetonlari(e.urun) as uj
    from ic_is_emirleri e left join ic_musteriler m on m.id = e.musteri_id
    where e.company_id = v_sirket and (e.durum = 'acik' or e.kapanis_zamani > now() - interval '60 days' or e.olusturma > now() - interval '60 days')
  ),
  emir as (select * from emir_tum where durum = 'acik'),
  alis_tum as (
    select a.id, a.alis_no, a.durum, a.olusturma, a.termin, a.kapanis_zamani,
      least(a.olusturma, coalesce((a.siparis_tarihi::timestamp at time zone 'Europe/Istanbul'), a.olusturma)) as baslangic,
      kantar_ad_jetonlari(coalesce(t.unvan, '') || ' ' || coalesce(t.kisa_ad, '')) as fj, kantar_ad_jetonlari(a.urun) as uj
    from ic_alis_siparisleri a left join ic_tedarikciler t on t.id = a.tedarikci_id
    where a.company_id = v_sirket and (a.durum = 'acik' or a.kapanis_zamani > now() - interval '60 days' or a.olusturma > now() - interval '60 days')
  ),
  alis as (select * from alis_tum where durum = 'acik'),
  -- son 30 gunun tamamlanan tartimlari (24.11.2026 ogleden sonra: 7 -> 30; irsaliyesi gec girilen arac tonajdan dusmesin) (+ normallestirilmis alanlar)
  t as (
    select k.*,
      coalesce(
        substring(upper(regexp_replace(coalesce(k.dba_konteyner, ''), '[^0-9A-Za-z]', '', 'g')) from '^[A-Z]{4}[0-9]{7}'),
        substring(upper(regexp_replace(coalesce(k.konteyner_muhur, ''), '\s', '', 'g')) from '^[A-Z]{4}[0-9]{7}')) as konteyner_n,
      upper(regexp_replace(coalesce(k.irsaliye_no, ''), '\s', '', 'g')) as irsaliye_n,
      kantar_irsaliye_parcalari(k.irsaliye_no) as irsaliye_p,
      kantar_ad_jetonlari(k.firma) as fj, kantar_ad_jetonlari(k.urun) as uj
    from kantar_tartimlari k
    where k.company_id = v_sirket and k.cikis is not null and k.cikis > now() - interval '30 days'
  ),
  t2 as (
    select t.*,
      exists (select 1 from konteynerler c where c.company_id = v_sirket and t.konteyner_n is not null
                and upper(regexp_replace(coalesce(c.konteyner_no, ''), '\s', '', 'g')) = t.konteyner_n) as ihracat_var,
      exists (select 1 from ic_sevkler s where s.company_id = v_sirket and cardinality(t.irsaliye_p) > 0
                and upper(regexp_replace(coalesce(s.irsaliye_no, ''), '\s', '', 'g')) = any(t.irsaliye_p)) as sevk_var,
      exists (select 1 from ic_alis_teslimler x where x.company_id = v_sirket and cardinality(t.irsaliye_p) > 0
                and upper(regexp_replace(coalesce(x.irsaliye_no, ''), '\s', '', 'g')) = any(t.irsaliye_p)) as teslim_var,
      (select e.id from emir e
        where cardinality(t.uj) > 0 and e.uj && t.uj and e.fj && t.fj and t.cikis >= e.baslangic - interval '7 days'
          and not exists (select 1 from emir_tum k where k.durum = 'tamamlandi' and k.kapanis_zamani is not null
                            and k.uj && t.uj and k.fj && t.fj and k.kapanis_zamani >= t.cikis and k.baslangic - interval '1 day' <= t.cikis)
        order by cardinality(array(select unnest(e.fj) intersect select unnest(t.fj))) desc, e.olusturma limit 1) as emir_id,
      (select a.id from alis a
        where cardinality(t.uj) > 0 and a.uj && t.uj and a.fj && t.fj and t.cikis >= a.baslangic - interval '7 days'
          and not exists (select 1 from alis_tum k where k.durum = 'tamamlandi' and k.kapanis_zamani is not null
                            and k.uj && t.uj and k.fj && t.fj and k.kapanis_zamani >= t.cikis and k.baslangic - interval '1 day' <= t.cikis)
        order by cardinality(array(select unnest(a.fj) intersect select unnest(t.fj))) desc, a.termin nulls last, a.olusturma limit 1) as alis_id
    from t
  ),
  -- Irsaliye no'su kantarda yok / farkli girilmis tartimlar icin 1'e 1 esleme (24.11.2026): ayni is (emir / alis),
  -- +-2 gun, +-150 kg; bir irsaliye kaydi en fazla BIR tartimi karsilar (en yakin ciftten baslayarak, kantar_bire_bir_es). Kantardaki
  -- irsaliye no'suyla zaten bir tartima bagli kayit bu eslemeye girmez (ornek: 18.11 ve 20.11'de ayni 26.220 kg).
  sevk_aday as (
    select t2.id as tartim_id, s.id as kayit_id,
      abs((coalesce(s.irsaliye_tarihi, s.olusturma) at time zone 'Europe/Istanbul')::date - (t2.cikis at time zone 'Europe/Istanbul')::date) * 1000
        + abs(coalesce(s.net_kg, 0) - t2.net_kg) as puan
    from t2 join emir_tum ea on ea.uj && t2.uj and ea.fj && t2.fj join ic_sevkler s on s.is_emri_id = ea.id
    where t2.emir_id is not null and not t2.ihracat_var and not t2.sevk_var
      and abs((coalesce(s.irsaliye_tarihi, s.olusturma) at time zone 'Europe/Istanbul')::date - (t2.cikis at time zone 'Europe/Istanbul')::date) <= 2
      and abs(coalesce(s.net_kg, 0) - t2.net_kg) <= 150
      and not exists (select 1 from t tt where upper(regexp_replace(coalesce(s.irsaliye_no, ''), '\s', '', 'g')) = any(tt.irsaliye_p))
  ),
  sevk_es as (
    select unnest(kantar_bire_bir_es((select jsonb_agg(jsonb_build_object('t', tartim_id, 'k', kayit_id, 'p', puan)) from sevk_aday))) as tartim_id
  ),
  teslim_aday as (
    select t2.id as tartim_id, x.id as kayit_id,
      abs((coalesce(x.teslim_zamani, x.olusturma) at time zone 'Europe/Istanbul')::date - (t2.cikis at time zone 'Europe/Istanbul')::date) * 1000
        + abs(coalesce(x.net_kg, 0) - t2.net_kg) as puan
    from t2 join alis_tum aa on aa.uj && t2.uj and aa.fj && t2.fj join ic_alis_teslimler x on x.alis_id = aa.id
    where t2.emir_id is null and t2.alis_id is not null and not t2.ihracat_var and not t2.teslim_var
      and abs((coalesce(x.teslim_zamani, x.olusturma) at time zone 'Europe/Istanbul')::date - (t2.cikis at time zone 'Europe/Istanbul')::date) <= 2
      and abs(coalesce(x.net_kg, 0) - t2.net_kg) <= 150
      and not exists (select 1 from t tt where upper(regexp_replace(coalesce(x.irsaliye_no, ''), '\s', '', 'g')) = any(tt.irsaliye_p))
  ),
  teslim_es as (
    select unnest(kantar_bire_bir_es((select jsonb_agg(jsonb_build_object('t', tartim_id, 'k', kayit_id, 'p', puan)) from teslim_aday))) as tartim_id
  ),
  t3 as (
    select t2.*,
      exists (select 1 from sevk_es e where e.tartim_id = t2.id) as emir_kayitli,
      exists (select 1 from teslim_es e where e.tartim_id = t2.id) as alis_kayitli
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
