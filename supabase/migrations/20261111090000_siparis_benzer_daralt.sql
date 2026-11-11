-- SIPARIS LISTESI: "olasi tekrar" uyarisi daraltildi (11.11.2026)
-- Ilk canli kontrolde ayni musterinin bolunmus proformalari (UNEXCMP031126-1..-12) ve tekrar eden siparisleri
-- birbirine "benzer" gorunuyordu (gurultu). Uyari artik yalniz SISTEMDE yeni kesilmis bir proforma ile Excel
-- listesindeki sevk edilmemis bir siparis arasinda (ayni musteri kodu + ayni miktar) verilir.

create or replace function public.siparis_listesi_veri(p_company uuid)
returns table (
  anahtar text, kaynak text, sira integer, proforma_no text, proforma_tarihi date, firma text, urun text,
  birim_fiyat numeric, miktar_mt numeric, tutar numeric, para_birimi text, konteyner integer, liman text,
  bl_no text, marka text, paketleme text, durum text, on_odeme boolean, on_odeme_tarihi date,
  dosya_no text, booking_no text, etd date, benzer text
)
language sql stable security definer set search_path = public as $$
  with dos as (select * from siparis_dosya_ozeti(p_company)),
  oo as (select proforma_anahtar, alindi, tarih from siparis_on_odemeler where company_id = p_company),
  sd as (
    select s.*, siparis_anahtar(s.proforma_no) pk,
      coalesce(
        (select d.dosya_id from dos d where d.dosya_id = s.dosya_id),
        (select d.dosya_id from dos d where s.bl_no is not null and siparis_anahtar(d.bl_no) = siparis_anahtar(s.bl_no) limit 1),
        (select min(d.dosya_id::text)::uuid from dos d where d.pk = siparis_anahtar(s.proforma_no)
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
      d.dosya_no, d.booking booking_no, d.etd, sd.pk
    from sd left join dos d on d.dosya_id = sd.bagli left join oo on oo.proforma_anahtar = sd.pk
  ),
  -- Excel'de olmayan dosyalar (Proforma Yukle ile acilmis)
  dosyadan as (
    select 'dosya:' || d.dosya_id, 'sistem'::text, null::int, d.proforma_no, d.proforma_tarihi, d.alici, d.urun,
      case when d.miktar_mt > 0 then round(d.tutar / d.miktar_mt, 2) end, d.miktar_mt, d.tutar, d.para_birimi, d.konteyner,
      d.liman, nullif(d.bl_no, ''), d.marka, d.ambalaj,
      coalesce(d.durum, case when oo.alindi then 'on_odeme_alindi' else 'onay_bekliyor' end),
      coalesce(oo.alindi, d.durum is not null), oo.tarih, d.dosya_no, d.booking, d.etd, d.pk
    from dos d left join oo on oo.proforma_anahtar = d.pk
    where not exists (select 1 from sd where sd.bagli = d.dosya_id or sd.pk = d.pk)
  ),
  -- Henuz dosyasi acilmamis proformalar (Proforma Olustur)
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
      coalesce(oo.alindi, false), oo.tarih, null::text, null::text, null::date, siparis_anahtar(p.proforma_no)
    from proformalar p left join oo on oo.proforma_anahtar = siparis_anahtar(p.proforma_no)
    where p.company_id = p_company
      and not exists (select 1 from sd where sd.pk = siparis_anahtar(p.proforma_no))
      and not exists (select 1 from dos d where d.pk = siparis_anahtar(p.proforma_no))
  ),
  tum as (select * from gecmis union all select * from dosyadan union all select * from proformadan)
  -- Olasi tekrar: ayni musteri kodlu (UNEX + 3 harf), ayni miktarli, sevk edilmemis BASKA proforma
  -- (yeniden kesilmis proforma olabilir; sistem birlestirmez, kullaniciya gosterir)
  select t.anahtar, t.kaynak, t.sira, t.proforma_no, t.proforma_tarihi, t.firma, t.urun, t.birim_fiyat, t.miktar_mt, t.tutar,
    t.para_birimi, t.konteyner, t.liman, t.bl_no, t.marka, t.paketleme, t.durum, t.on_odeme, t.on_odeme_tarihi,
    t.dosya_no, t.booking_no, t.etd,
    (select string_agg(distinct u.proforma_no, ', ') from tum u
      where u.pk <> t.pk and u.kaynak <> t.kaynak and t.durum in ('onay_bekliyor', 'on_odeme_alindi') and u.durum in ('onay_bekliyor', 'on_odeme_alindi')
        and substring(u.pk from '^UNEX([A-Z]{3})') = substring(t.pk from '^UNEX([A-Z]{3})')
        and u.miktar_mt is not null and abs(u.miktar_mt - t.miktar_mt) < 0.5) benzer
  from tum t
$$;
revoke all on function public.siparis_listesi_veri(uuid) from public, anon, authenticated;
grant execute on function public.siparis_listesi_veri(uuid) to service_role;

