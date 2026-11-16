-- ============================================================================
-- NAVLUN RAPORU KONTROLU (16.11.2026): liman yazimi + sistem proformasinda konteyner
-- ============================================================================
-- Kullanici: "Navlun raporunun dogrulugunu kontrol et; eksik kisimlar var."
-- 1) Sistem proformasi "DAR SALAAM", plan Excel'i "DAR ES SELAM" yaziyor: musteri + liman eslesmesi tutmadi, booking'i
--    planda olan siparis "rezervasyon bekleyen"de kaldi (raporda 0 konteyner, "teklif yok"). Liman anahtari DAR ES SALAAM
--    yazimlarini birlestirir (navlun-tablosu.ts LIMAN_ESLER ile ayni).
-- 2) Sistem proformalarinda konteyner bos geliyordu (rapor / sayfa toplamlari eksik). Gosterimde MT'den turetilir
--    (25 MT / konteyner); plan eslesmesindeki birikimli kural ESKISI GIBI bilinen adetle calisir (davranis degismez).
-- Not: Bu dosya gercek musteri verisi icermez.
-- ============================================================================

create or replace function public.siparis_liman_anahtar(p text)
returns text language sql immutable set search_path = public as $$
  with a as (
    select upper(btrim(split_part(regexp_replace(translate(coalesce(p, ''), 'çğıöşüÇĞİÖŞÜ', 'cgiosuCGIOSU'), '\s+(PORT|LIMANI)\b.*$', '', 'i'), ',', 1))) k
  )
  select nullif(case
    when k ~ '^DAR\s*(ES\s*)?S[AE]LA+M$' then 'DAR ES SALAAM'
    when k = 'SINGAPUR' then 'SINGAPORE' when k = 'CIBUTI' then 'DJIBOUTI' when k = 'MALDIVES' then 'MALE' else k end, '') from a
$$;

create or replace function public.siparis_listesi_veri(p_company uuid)
 returns table(anahtar text, kaynak text, sira integer, proforma_no text, proforma_tarihi date, firma text, urun text, birim_fiyat numeric, miktar_mt numeric, tutar numeric, para_birimi text, konteyner integer, liman text, bl_no text, marka text, paketleme text, durum text, on_odeme boolean, on_odeme_tarihi date, dosya_no text, booking_no text, etd date, benzer text, on_odeme_tutar numeric, on_odeme_para text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with dos as (select * from siparis_dosya_ozeti(p_company)),
  oo as (select proforma_anahtar, alindi, tarih, tutar, para_birimi from siparis_on_odemeler where company_id = p_company),
  sd as (
    select s.*, siparis_anahtar(s.proforma_no) pk,
      coalesce(
        (select d.dosya_id from dos d where d.dosya_id = s.dosya_id),
        (select d.dosya_id from dos d where s.bl_no is not null and siparis_anahtar(d.bl_no) = siparis_anahtar(s.bl_no) limit 1),
        -- yalniz proforma ile baglama: proformanin Excel'de TEK satiri ve sistemde TEK dosyasi varsa (bolunmus sevkiyat degil)
        (select min(d.dosya_id::text)::uuid from dos d where d.pk = siparis_anahtar(s.proforma_no)
           and (select count(*) from siparis_defteri s2 where s2.company_id = p_company and siparis_anahtar(s2.proforma_no) = siparis_anahtar(s.proforma_no)) = 1
           having count(*) = 1)
      ) bagli
    from siparis_defteri s where s.company_id = p_company
  ),
  gecmis as (
    select 'excel:' || sd.id anahtar, 'excel'::text kaynak, sd.sira, sd.proforma_no, sd.proforma_tarihi, sd.firma, coalesce(sd.urun, d.urun) urun,
      coalesce(sd.birim_fiyat, case when d.miktar_mt > 0 then round(d.tutar / d.miktar_mt, 2) end) birim_fiyat, sd.miktar_mt,
      coalesce(sd.tutar, round(sd.miktar_mt * case when d.miktar_mt > 0 then d.tutar / d.miktar_mt end, 2)) tutar,
      sd.para_birimi, coalesce(sd.konteyner, d.konteyner) konteyner, sd.liman,
      coalesce(sd.bl_no, nullif(d.bl_no, '')) bl_no, sd.marka, sd.paketleme,
      case
        when sd.durum = 'iptal' then 'iptal'
        when d.durum is not null then d.durum
        when d.dosya_id is null and sd.durum in ('rezervasyonlu', 'sevk_edildi', 'bl_eksik') then sd.durum
        when oo.alindi is not null then case when oo.alindi then 'on_odeme_alindi' else 'onay_bekliyor' end
        else sd.durum
      end durum,
      coalesce(oo.alindi, sd.durum in ('on_odeme_alindi', 'rezervasyonlu', 'sevk_edildi', 'bl_eksik')) on_odeme, oo.tarih on_odeme_tarihi,
      d.dosya_no, d.booking booking_no, d.etd, sd.pk, case when oo.alindi then oo.tutar end on_odeme_tutar, case when oo.alindi then oo.para_birimi end on_odeme_para
    from sd left join dos d on d.dosya_id = sd.bagli left join oo on oo.proforma_anahtar = sd.pk
  ),
  dosyadan as (
    select 'dosya:' || d.dosya_id, 'sistem'::text, null::int, d.proforma_no, d.proforma_tarihi, d.alici, d.urun,
      case when d.miktar_mt > 0 then round(d.tutar / d.miktar_mt, 2) end, d.miktar_mt, d.tutar, d.para_birimi, d.konteyner,
      d.liman, nullif(d.bl_no, ''), d.marka, d.ambalaj,
      coalesce(d.durum, case when oo.alindi then 'on_odeme_alindi' else 'onay_bekliyor' end),
      coalesce(oo.alindi, d.durum is not null), oo.tarih, d.dosya_no, d.booking, d.etd, d.pk,
      case when oo.alindi then oo.tutar end, case when oo.alindi then oo.para_birimi end
    from dos d left join oo on oo.proforma_anahtar = d.pk
    where not exists (select 1 from sd where sd.bagli = d.dosya_id or sd.pk = d.pk)
  ),
  proformadan as (
    select 'proforma:' || p.id, 'sistem'::text, null::int, p.proforma_no, p.tarih, p.alici_unvan,
      (select string_agg(k->>'urun', ' + ') from jsonb_array_elements(coalesce(p.taslak->'kalemler', '[]'::jsonb)) k),
      case when p.toplam_mts > 0 then round(p.toplam / p.toplam_mts, 2) end, p.toplam_mts, p.toplam, coalesce(p.para_birimi, 'USD'),
      null::int,
      nullif(btrim(split_part(regexp_replace(regexp_replace(coalesce(p.taslak->>'teslimIfadesi', ''),
        '^\s*(CFR|CIF|FOB|CPT|CIP|DAP|DDP|EXW|FCA|FAS|CNF|C&F)\s+', '', 'i'), '\s+BASIS\s*$', '', 'i'), ' PORT', 1)), ''),
      null::text,
      (select string_agg(distinct k->>'marka', ' / ') from jsonb_array_elements(coalesce(p.taslak->'kalemler', '[]'::jsonb)) k),
      nullif(p.taslak->>'paketleme', ''),
      case when oo.alindi then 'on_odeme_alindi' else 'onay_bekliyor' end,
      coalesce(oo.alindi, false), oo.tarih, null::text, null::text, null::date, siparis_anahtar(p.proforma_no),
      case when oo.alindi then oo.tutar end, case when oo.alindi then oo.para_birimi end
    from proformalar p left join oo on oo.proforma_anahtar = siparis_anahtar(p.proforma_no)
    where p.company_id = p_company
      and not exists (select 1 from sd where sd.pk = siparis_anahtar(p.proforma_no))
      and not exists (select 1 from dos d where d.pk = siparis_anahtar(p.proforma_no))
  ),
  tum0 as (select * from gecmis union all select * from dosyadan union all select * from proformadan),
  -- 13.11.2026 (1) plana BAGLI siparis: booking'i varsa rezervasyonlu
  bagli_plan as (
    select 'excel:' || p.siparis_id anahtar, string_agg(p.booking_no, ', ' order by p.etd nulls last, p.booking_no) bk, min(p.etd) etd
    from sevkiyat_plani p
    where p.company_id = p_company and p.siparis_id is not null and booking_anahtar(p.booking_no) is not null
    group by p.siparis_id
  ),
  -- 13.11.2026 (2) baglantisiz guncel booking'ler: musteri + varis limani basina konteyner toplami
  plan_aday as (
    select siparis_firma_anahtar(p.musteri) fkey, siparis_liman_anahtar(p.varis_limani) lkey,
      sum(coalesce(p.konteyner, 0)) k, min(p.etd) etd, count(*) n, min(p.booking_no) bk
    from sevkiyat_plani p
    where p.company_id = p_company and booking_anahtar(p.booking_no) is not null
      and p.siparis_id is null and p.dosya_id is null and p.rezervasyon_id is null
      and (p.etd >= (now() at time zone 'Europe/Istanbul')::date
           or (p.etd is null and p.yil * 100 + p.hafta >= extract(isoyear from (now() at time zone 'Europe/Istanbul')::date) * 100
                                                         + extract(week from (now() at time zone 'Europe/Istanbul')::date)))
    group by 1, 2
  ),
  aday as (
    select t.anahtar, siparis_firma_anahtar(t.firma) fkey, siparis_liman_anahtar(t.liman) lkey,
      sum(coalesce(t.konteyner, 0)) over (partition by siparis_firma_anahtar(t.firma), siparis_liman_anahtar(t.liman)
        order by t.on_odeme_tarihi nulls last, t.proforma_no, t.anahtar) cum
    from tum0 t
    where t.durum = 'on_odeme_alindi' and not exists (select 1 from bagli_plan b where b.anahtar = t.anahtar)
  ),
  eslesen as (
    select a.anahtar, case when pa.n = 1 then pa.bk end bk, pa.etd
    from aday a join plan_aday pa on pa.fkey = a.fkey and pa.lkey = a.lkey
    where pa.k > 0 and a.cum <= pa.k
  ),
  tum as (
    select t.anahtar, t.kaynak, t.sira, t.proforma_no, t.proforma_tarihi, t.firma, t.urun, t.birim_fiyat, t.miktar_mt, t.tutar,
      t.para_birimi, t.konteyner, t.liman, t.bl_no, t.marka, t.paketleme,
      case when t.durum = 'on_odeme_alindi' and (b.anahtar is not null or e.anahtar is not null) then 'rezervasyonlu' else t.durum end durum,
      t.on_odeme, t.on_odeme_tarihi, t.dosya_no,
      coalesce(t.booking_no, b.bk, case when t.durum = 'on_odeme_alindi' then e.bk end) booking_no,
      coalesce(t.etd, b.etd, case when t.durum = 'on_odeme_alindi' then e.etd end) etd,
      t.pk, t.on_odeme_tutar, t.on_odeme_para
    from tum0 t left join bagli_plan b on b.anahtar = t.anahtar left join eslesen e on e.anahtar = t.anahtar
  )
  select t.anahtar, t.kaynak, t.sira, t.proforma_no, t.proforma_tarihi, t.firma, t.urun, t.birim_fiyat, t.miktar_mt, t.tutar,
    t.para_birimi,
    -- 16.11.2026: sistem proformasinda konteyner yok -> MT'den (25 MT / konteyner; 48 MT -> 2). Eslesme (cum) bilinen adetle kalir.
    coalesce(t.konteyner, case when t.kaynak = 'sistem' and t.miktar_mt > 0 then greatest(1, round(t.miktar_mt / 25))::int end) konteyner,
    t.liman, t.bl_no, t.marka, t.paketleme, t.durum, t.on_odeme, t.on_odeme_tarihi,
    t.dosya_no, t.booking_no, t.etd,
    (select string_agg(distinct u.proforma_no, ', ') from tum u
      where u.pk <> t.pk and u.kaynak <> t.kaynak and t.durum in ('onay_bekliyor', 'on_odeme_alindi') and u.durum in ('onay_bekliyor', 'on_odeme_alindi')
        and substring(u.pk from '^UNEX([A-Z]{3})') = substring(t.pk from '^UNEX([A-Z]{3})')
        and u.miktar_mt is not null and abs(u.miktar_mt - t.miktar_mt) < 0.5) benzer,
    t.on_odeme_tutar, t.on_odeme_para
  from tum t
$function$;
