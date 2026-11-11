-- ============================================================================
-- SIPARIS AKISI: on odeme TUTARI + plan "rezervasyon alinmadi" + bolunmus proforma eslesme duzeltmesi (11.11.2026)
-- ============================================================================
-- Kullanici: "Export proforma olusturuyor; durumu bos. On odeme geldiginde TUTAR yazarak 'on odeme alindi' diye
-- isaretleyecek; bu kayit yukleme planina ve siparis listesine otomatik dahil edilecek. Henuz rezervasyonu
-- olmadigi icin 'rezervasyonu alinmadi' seklinde ilerlenecek."
--
-- 1) siparis_on_odemeler: + tutar, para_birimi. Yeni RPC siparis_on_odeme_kaydet(proforma, alindi, tutar, para, tarih)
--    ("proformalar"; alindi=true icin tutar > 0 ZORUNLU). Eski siparis_on_odeme_isaretle aynen kalir (geri uyum).
-- 2) siparis_listesi_veri: + on_odeme_tutar / on_odeme_para. Excel satirini dosyaya "tek eslesen proforma" ile
--    baglama YALNIZ o proformanin Excel'de tek satiri varsa (bolunmus sevkiyatta yanlis dosyaya baglaniyordu).
-- 3) yukleme_plani_veri: on odemesi alinmis, rezervasyonu olmayan siparisler kaynak 'siparis' satiri olarak eklenir
--    (plan ekraninda "REZERVASYON ALINMADI" blogu).
-- Not: Bu dosya gercek musteri verisi icermez.
-- ============================================================================

alter table public.siparis_on_odemeler add column if not exists tutar numeric;
alter table public.siparis_on_odemeler add column if not exists para_birimi text;
do $$ begin
  alter table public.siparis_on_odemeler add constraint siparis_on_odemeler_tutar_check check (tutar is null or (tutar > 0 and tutar < 100000000));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.siparis_on_odemeler add constraint siparis_on_odemeler_para_check check (para_birimi is null or para_birimi in ('USD', 'EUR', 'TRY'));
exception when duplicate_object then null; end $$;

create or replace function public.siparis_on_odeme_kaydet(p_proforma_no text, p_alindi boolean, p_tutar numeric default null,
  p_para_birimi text default 'USD', p_tarih date default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sirket uuid := auth_company_id();
  v_anahtar text := siparis_anahtar(p_proforma_no);
  v_kim text;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('proformalar') then
    raise exception 'Yetkiniz yok.';
  end if;
  if v_anahtar is null or p_alindi is null then raise exception 'Proforma no gerekli.'; end if;
  if p_alindi then
    if p_tutar is null or p_tutar <= 0 or p_tutar >= 100000000 then raise exception 'Ön ödeme tutarını girin.'; end if;
    if coalesce(p_para_birimi, 'USD') not in ('USD', 'EUR', 'TRY') then raise exception 'Geçersiz para birimi.'; end if;
    if p_tarih is not null and (p_tarih > v_bugun or p_tarih < v_bugun - 730) then raise exception 'Geçersiz ödeme tarihi.'; end if;
  end if;
  begin v_kim := lower(coalesce(auth.jwt() ->> 'email', '')); exception when others then v_kim := null; end;
  insert into siparis_on_odemeler (company_id, proforma_anahtar, alindi, tarih, tutar, para_birimi, isaretleyen, updated_at)
  values (v_sirket, v_anahtar, p_alindi, case when p_alindi then coalesce(p_tarih, v_bugun) end,
          case when p_alindi then round(p_tutar, 2) end, case when p_alindi then coalesce(p_para_birimi, 'USD') end, left(v_kim, 120), now())
  on conflict (company_id, proforma_anahtar) do update set
    alindi = excluded.alindi, tarih = excluded.tarih, tutar = excluded.tutar, para_birimi = excluded.para_birimi,
    isaretleyen = excluded.isaretleyen, updated_at = now();
  return jsonb_build_object('ok', true, 'alindi', p_alindi);
end;
$$;
revoke all on function public.siparis_on_odeme_kaydet(text, boolean, numeric, text, date) from public, anon;
grant execute on function public.siparis_on_odeme_kaydet(text, boolean, numeric, text, date) to authenticated;

-- 2) Siparis listesi verisi (donus tipi degisti: drop + create; siparis_listesi() sarmalayicisi to_jsonb ile aynen calisir)
drop function if exists public.yukleme_plani_veri(uuid);
drop function if exists public.siparis_listesi_veri(uuid);
create function public.siparis_listesi_veri(p_company uuid)
returns table(anahtar text, kaynak text, sira integer, proforma_no text, proforma_tarihi date, firma text, urun text, birim_fiyat numeric,
  miktar_mt numeric, tutar numeric, para_birimi text, konteyner integer, liman text, bl_no text, marka text, paketleme text, durum text,
  on_odeme boolean, on_odeme_tarihi date, dosya_no text, booking_no text, etd date, benzer text, on_odeme_tutar numeric, on_odeme_para text)
language sql stable security definer set search_path = public as $$
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
  tum as (select * from gecmis union all select * from dosyadan union all select * from proformadan)
  select t.anahtar, t.kaynak, t.sira, t.proforma_no, t.proforma_tarihi, t.firma, t.urun, t.birim_fiyat, t.miktar_mt, t.tutar,
    t.para_birimi, t.konteyner, t.liman, t.bl_no, t.marka, t.paketleme, t.durum, t.on_odeme, t.on_odeme_tarihi,
    t.dosya_no, t.booking_no, t.etd,
    (select string_agg(distinct u.proforma_no, ', ') from tum u
      where u.pk <> t.pk and u.kaynak <> t.kaynak and t.durum in ('onay_bekliyor', 'on_odeme_alindi') and u.durum in ('onay_bekliyor', 'on_odeme_alindi')
        and substring(u.pk from '^UNEX([A-Z]{3})') = substring(t.pk from '^UNEX([A-Z]{3})')
        and u.miktar_mt is not null and abs(u.miktar_mt - t.miktar_mt) < 0.5) benzer,
    t.on_odeme_tutar, t.on_odeme_para
  from tum t
$$;
revoke all on function public.siparis_listesi_veri(uuid) from public, anon, authenticated;
grant execute on function public.siparis_listesi_veri(uuid) to service_role;

-- 3) Yukleme plani: + on odemesi alinmis, rezervasyonu olmayan siparisler (kaynak 'siparis')
create function public.yukleme_plani_veri(p_company uuid)
returns table(anahtar text, kaynak text, hafta integer, yil integer, etd date, booking_no text, musteri text, cinsi text,
  konteyner integer, varis_limani text, cuval_markasi text, ambalaj text, acente text, liman text, ekipman text,
  bos_ekipman_tarihi date, ekipman_alim_yeri text, ardiyesiz_giris date, talimat_cutoff timestamptz, beyan_cutoff timestamptz,
  gemi text, sefer text, navlun numeric, lokal numeric, navlun_para text, dosya_no text, proforma_no text,
  kalemler jsonb, hafta_baslik text, sira integer)
language sql stable security definer set search_path = public as $$
  with rez as (
    select r.*, d.dosya_no, d.alici_firma, d.urun_tanimi, d.varis_limani, d.marka, d.ambalaj, d.navlun_tutari,
           d.lokal_masraf_tutari, d.para_birimi, d.proforma_no
    from rezervasyonlar r left join ihracat_dosyalari d on d.id = r.dosya_id
    where r.company_id = p_company
  ),
  gecmis as (
    select 'excel:' || p.id anahtar, 'excel'::text kaynak,
      coalesce(p.hafta, extract(week from r.gemi_kalkis_tarihi)::int) hafta,
      coalesce(p.yil, extract(isoyear from r.gemi_kalkis_tarihi)::int) yil,
      coalesce(r.gemi_kalkis_tarihi, p.etd) etd, coalesce(r.booking_no, p.booking_no) booking_no,
      p.musteri, p.cinsi, coalesce(r.konteyner_adedi, p.konteyner) konteyner, coalesce(p.varis_limani, r.varis_limani) varis_limani,
      coalesce(p.cuval_markasi, r.marka) cuval_markasi, coalesce(p.ambalaj, r.ambalaj) ambalaj,
      coalesce(nullif(r.acente_ismi, ''), p.acente) acente, coalesce(nullif(r.yuklenme_limani, ''), p.liman) liman, p.ekipman,
      coalesce(r.ekipman_alim_tarihi, p.bos_ekipman_tarihi) bos_ekipman_tarihi, r.ekipman_alim_yeri,
      coalesce(r.ardiyesiz_giris, p.ardiyesiz_giris) ardiyesiz_giris, coalesce(r.talimat_cutoff, p.talimat_cutoff) talimat_cutoff,
      coalesce(r.beyanname_cutoff, p.beyan_cutoff) beyan_cutoff, coalesce(nullif(r.gemi_adi, ''), p.gemi) gemi,
      coalesce(nullif(r.sefer_no, ''), p.sefer) sefer,
      coalesce(r.navlun_tutari, p.navlun_kont) navlun, coalesce(r.lokal_masraf_tutari, p.lokal_kont) lokal,
      coalesce(p.navlun_para, r.para_birimi, 'USD') navlun_para, r.dosya_no, r.proforma_no,
      p.kalemler, p.hafta_baslik, p.sira
    from sevkiyat_plani p left join rez r on r.id = p.rezervasyon_id
    where p.company_id = p_company
  ),
  yeni as (
    select 'rez:' || r.id, 'sistem'::text, null::int, extract(year from r.gemi_kalkis_tarihi)::int,
      r.gemi_kalkis_tarihi, r.booking_no, r.alici_firma, r.urun_tanimi, r.konteyner_adedi, r.varis_limani, r.marka, r.ambalaj,
      r.acente_ismi, r.yuklenme_limani, null::text, r.ekipman_alim_tarihi, r.ekipman_alim_yeri, r.ardiyesiz_giris,
      r.talimat_cutoff, r.beyanname_cutoff, r.gemi_adi, r.sefer_no, r.navlun_tutari, r.lokal_masraf_tutari,
      coalesce(r.para_birimi, 'USD'), r.dosya_no, r.proforma_no, null::jsonb, null::text, null::int
    from rez r
    where not exists (select 1 from sevkiyat_plani p where p.company_id = p_company
                      and (p.rezervasyon_id = r.id or booking_anahtar(p.booking_no) = booking_anahtar(r.booking_no)))
  ),
  bekleyen as (
    -- on odemesi alinmis, henuz rezervasyonu olmayan siparis: planda "rezervasyon alinmadi"
    select 'siparis:' || s.anahtar, 'siparis'::text, null::int, extract(year from coalesce(s.on_odeme_tarihi, s.proforma_tarihi))::int,
      null::date, null::text, s.firma, s.urun, s.konteyner, s.liman, s.marka, s.paketleme,
      null::text, null::text, null::text, null::date, null::text, null::date, null::timestamptz, null::timestamptz,
      null::text, null::text, null::numeric, null::numeric, s.para_birimi, s.dosya_no, s.proforma_no, null::jsonb, null::text, s.sira
    from siparis_listesi_veri(p_company) s
    where s.durum = 'on_odeme_alindi'
  )
  select * from gecmis union all select * from yeni union all select * from bekleyen
$$;
revoke all on function public.yukleme_plani_veri(uuid) from public, anon, authenticated;
grant execute on function public.yukleme_plani_veri(uuid) to service_role;
