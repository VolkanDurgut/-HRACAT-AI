-- ============================================================================
-- YONETICI ASISTANI: FATURA VE BEYANNAME GOREVLERI (21.11.2026). Kullanici: "Ayni sekilde fatura, draft BL ve
-- beyanname uzerindeki evraklar icin de ilgili revize metinleri olusturulmali (gorevleri yani)."
--
-- Kaynak: dosyadaki fatura_kontrol_sonucu / beyanname_kontrol_sonucu (evrak yuklenince sistemin yaptigi kontrol;
-- draft_bl_kontrol_sonucu ile ayni bicim: uyumlu + kontroller[alan, durum, sistem, belge, not]).
-- Beyanname kurali (yanlis gorev cikmasin):
--  * Birlesik fatura grubundaki dosyalar (ayni fatura no birden fazla dosyada) ATLANIR: beyanname kontrolu bugun dosya
--    bazinda, grubun toplamini (bedel, konteyner, agirlik) tek dosyayla karsilastirdigi icin yanlis uyusmazlik verir.
--  * Belgeden okunamayan alan ("-" / bos) ve biri digerini iceren deger ("PAOLO" / "PAOLO BSM") uyusmazlik sayilmaz.
--  * Kalan alan yoksa gorev acilmaz.
-- Sadece yonetici_asistan_veri genisler (eski alanlar AYNEN); isaret turleri fatura / beyanname eklenir.
-- ============================================================================

alter table public.asistan_isaretleri drop constraint if exists asistan_isaretleri_tur_check;
alter table public.asistan_isaretleri add constraint asistan_isaretleri_tur_check check (tur in ('draft_bl', 'odeme', 'fatura', 'beyanname'));

-- Kontrol sonucundan uyusmayan alanlar (yalniz sunucu ici)
create or replace function public.asistan_kontrol_alanlari(p_kontrol jsonb, p_gevsek boolean)
 returns jsonb
 language sql
 immutable
 set search_path to 'public'
as $function$
  select coalesce(
    (select jsonb_agg(jsonb_build_object('alan', c ->> 'alan', 'sistem', c ->> 'sistem', 'belge', c ->> 'belge', 'not', c ->> 'not'))
     from jsonb_array_elements(case when jsonb_typeof(p_kontrol -> 'kontroller') = 'array' then p_kontrol -> 'kontroller' else '[]'::jsonb end) c
     where c ->> 'durum' = 'uyusmuyor'
       and (not p_gevsek or (
         coalesce(nullif(btrim(c ->> 'belge'), ''), '-') <> '-'
         and coalesce(nullif(btrim(c ->> 'sistem'), ''), '-') <> '-'
         and strpos(upper(c ->> 'belge'), upper(c ->> 'sistem')) = 0
         and strpos(upper(c ->> 'sistem'), upper(c ->> 'belge')) = 0))),
    (select jsonb_agg(jsonb_build_object('alan', u ->> 'alan', 'sistem', u ->> 'sistemde', 'belge', u ->> 'dosyada', 'not', null))
     from jsonb_array_elements(case when jsonb_typeof(p_kontrol -> 'uyusmazliklar') = 'array' then p_kontrol -> 'uyusmazliklar' else '[]'::jsonb end) u
     where jsonb_typeof(p_kontrol -> 'kontroller') is distinct from 'array'),
    '[]'::jsonb);
$function$;

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
),
evrak as (
  select 'fatura'::text tur, d.id, d.dosya_no, d.alici_firma, d.varis_limani, d.fatura_no belge_no,
         d.fatura_yukleme_tarihi yukleme, d.fatura_kontrol_sonucu k,
         public.asistan_kontrol_alanlari(d.fatura_kontrol_sonucu, false) alanlar
  from public.ihracat_dosyalari d
  where d.company_id = p_company and d.durum = 'Açık' and d.fatura_dosya_url is not null
    and jsonb_typeof(d.fatura_kontrol_sonucu) = 'object' and (d.fatura_kontrol_sonucu ->> 'uyumlu') = 'false'
  union all
  select 'beyanname', d.id, d.dosya_no, d.alici_firma, d.varis_limani, coalesce(nullif(d.beyanname_kontrol_sonucu ->> 'beyanname_no', ''), d.beyanname_no),
         d.beyanname_yukleme_tarihi, d.beyanname_kontrol_sonucu,
         public.asistan_kontrol_alanlari(d.beyanname_kontrol_sonucu, true)
  from public.ihracat_dosyalari d
  where d.company_id = p_company and d.durum = 'Açık' and d.beyanname_dosya_url is not null
    and jsonb_typeof(d.beyanname_kontrol_sonucu) = 'object' and (d.beyanname_kontrol_sonucu ->> 'uyumlu') = 'false'
    and not exists (select 1 from public.ihracat_dosyalari g where g.company_id = p_company and g.id <> d.id
                    and nullif(btrim(d.fatura_no), '') is not null and g.fatura_no = d.fatura_no)
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
      'alanlar', public.asistan_kontrol_alanlari(x.k, false)
    ) order by x.draft_bl_yukleme_tarihi desc)
    from draft x), '[]'::jsonb),
  'evrak', coalesce((
    select jsonb_agg(jsonb_build_object(
      'tur', e.tur, 'dosya_id', e.id, 'dosya_no', e.dosya_no, 'alici_firma', e.alici_firma, 'varis_limani', e.varis_limani,
      'belge_no', e.belge_no, 'yukleme', e.yukleme,
      'kontrol_tarihi', coalesce(nullif(e.k ->> 'tarih', ''), e.yukleme::text),
      'ozet', e.k ->> 'ozet',
      'gemi', (select concat_ws(' ', r.gemi_adi, r.sefer_no) from public.rezervasyonlar r where r.dosya_id = e.id order by r.olusturma_tarihi limit 1),
      'alanlar', e.alanlar
    ) order by e.yukleme desc nulls last)
    from evrak e where jsonb_array_length(e.alanlar) > 0), '[]'::jsonb),
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
      union all
      select jsonb_build_object('tur', 'fatura', 'baslik', concat_ws(' · ', d.dosya_no, d.alici_firma), 'ayrinti', 'Fatura uyumlu',
                                'zaman', d.fatura_yukleme_tarihi)
      from public.ihracat_dosyalari d
      where d.company_id = p_company and d.durum = 'Açık' and (d.fatura_kontrol_sonucu ->> 'uyumlu') = 'true'
        and d.fatura_yukleme_tarihi > now() - interval '7 days'
      union all
      select jsonb_build_object('tur', 'beyanname', 'baslik', concat_ws(' · ', d.dosya_no, d.alici_firma), 'ayrinti', 'Beyanname uyumlu',
                                'zaman', coalesce(nullif(d.beyanname_kontrol_sonucu ->> 'tarih', ''), d.beyanname_yukleme_tarihi::text))
      from public.ihracat_dosyalari d
      where d.company_id = p_company and d.durum = 'Açık' and (d.beyanname_kontrol_sonucu ->> 'uyumlu') = 'true'
        and d.beyanname_yukleme_tarihi > now() - interval '7 days'
    ) q), '[]'::jsonb),
  'isaretler', coalesce((
    select jsonb_agg(jsonb_build_object('anahtar', i.anahtar, 'tur', i.tur, 'ozet', i.ozet, 'isleyen', i.isleyen, 'zaman', i.zaman) order by i.zaman desc)
    from public.asistan_isaretleri i
    where i.company_id = p_company and i.geri_alindi is null and i.zaman > now() - interval '60 days'), '[]'::jsonb)
);
$function$;

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
  if p_tur not in ('draft_bl', 'odeme', 'fatura', 'beyanname') then raise exception 'Bilinmeyen görev türü.'; end if;
  insert into public.asistan_isaretleri (company_id, anahtar, tur, ozet, isleyen)
  values (v_sirket, left(trim(p_anahtar), 200), p_tur, left(p_ozet, 500), lower(coalesce(auth.jwt() ->> 'email', '')))
  on conflict (company_id, anahtar) where geri_alindi is null do nothing;
  select * into v_satir from public.asistan_isaretleri
  where company_id = v_sirket and anahtar = left(trim(p_anahtar), 200) and geri_alindi is null;
  return jsonb_build_object('anahtar', v_satir.anahtar, 'zaman', v_satir.zaman, 'isleyen', v_satir.isleyen);
end;
$function$;

revoke all on function public.asistan_kontrol_alanlari(jsonb, boolean) from public, anon, authenticated;
revoke all on function public.yonetici_asistan_veri(uuid) from public, anon, authenticated;
grant execute on function public.yonetici_asistan_veri(uuid) to service_role;
revoke all on function public.asistan_isaretle(text, text, text) from public, anon;
grant execute on function public.asistan_isaretle(text, text, text) to authenticated;
