-- ============================================================================
-- VERI TUTARLILIGI (16.11.2026): liman / firma es sozlugu, siparis eslestirme, tutarsizliklar,
-- navlun teklif adaylari ve "yeniden oku" istegi
-- ============================================================================
-- Kullanici onayi (16.11.2026): "Liman ve firma yazimlari icin tek sozluk", "Kontrol Merkezi'ne Tutarsizliklar karti",
--   "Excel siparisini sistem proformasiyla tek tikla eslestirmek", "Navlunda okunamayan mailler listesi",
--   "Yeniden oku dugmesi (mevcut durumu bozmayacaksa)".
-- Ilkeler: hicbir mevcut kayit degismez; sozluk okunamazsa koddaki sabit esler (SINGAPUR, CIBUTI, MALDIVES, DAR ES ...)
--   aynen calisir; evrak kontrolleri (fatura / konsimento / beyanname) sozluge BAGLANMAZ (birebir yazim arar).
-- Not: Bu dosya gercek musteri verisi icermez (tohum kayitlar yalniz liman adlari).
-- ============================================================================

-- 1) LIMAN / FIRMA ES SOZLUGU ------------------------------------------------------------------------------------
create table if not exists public.ad_esleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  tur text not null check (tur in ('liman', 'firma')),
  kaynak text not null check (char_length(kaynak) between 2 and 120),      -- eslesme anahtari (sadelestirilmis yazim)
  hedef text not null check (char_length(hedef) between 2 and 120),        -- dogru anahtar
  kaynak_ad text not null check (char_length(kaynak_ad) between 1 and 160), -- ekranda girilen yazim
  hedef_ad text not null check (char_length(hedef_ad) between 1 and 160),   -- ekranda girilen dogru ad
  ekleyen text,
  created_at timestamptz not null default now(),
  unique (company_id, tur, kaynak),
  check (kaynak <> hedef)
);
alter table public.ad_esleri enable row level security;
drop policy if exists ad_esleri_oku on public.ad_esleri;
create policy ad_esleri_oku on public.ad_esleri for select to authenticated
  using (company_id = auth_company_id());
revoke insert, update, delete on public.ad_esleri from anon, authenticated;

-- Tohum: koddaki sabit esler ekranda gorunsun (kod yine yedek olarak calisir). Tek sirket varsayilmaz: her sirkete.
insert into public.ad_esleri (company_id, tur, kaynak, hedef, kaynak_ad, hedef_ad, ekleyen)
select c.id, 'liman', x.k, x.h, x.k, x.h, 'sistem'
from public.companies c
cross join (values ('SINGAPUR', 'SINGAPORE'), ('CIBUTI', 'DJIBOUTI'), ('MALDIVES', 'MALE'),
                   ('DAR ES SELAM', 'DAR ES SALAAM'), ('DAR SALAAM', 'DAR ES SALAAM'), ('DAR ES SALAM', 'DAR ES SALAAM'),
                   ('DARESSALAAM', 'DAR ES SALAAM')) as x(k, h)
where exists (select 1 from public.sevkiyat_plani p where p.company_id = c.id)
on conflict (company_id, tur, kaynak) do nothing;

-- Es cozumleme: anahtar sozlukte varsa dogru anahtar, yoksa kendisi.
create or replace function public.ad_esi(p_company uuid, p_tur text, p_anahtar text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select e.hedef from ad_esleri e where e.company_id = p_company and e.tur = p_tur and e.kaynak = p_anahtar limit 1), p_anahtar)
$$;
revoke all on function public.ad_esi(uuid, text, text) from public, anon;
grant execute on function public.ad_esi(uuid, text, text) to authenticated, service_role;

create or replace function public.ad_esi_kaydet(p_tur text, p_yazim text, p_dogru text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sirket uuid := auth_company_id();
  v_k text; v_h text; v_kim text;
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('analiz') or ic_sayfa_yetkisi('proformalar')) then
    raise exception 'Yetkiniz yok.';
  end if;
  if p_tur not in ('liman', 'firma') then raise exception 'Tür liman ya da firma olmalı.'; end if;
  if coalesce(btrim(p_yazim), '') = '' or coalesce(btrim(p_dogru), '') = '' then raise exception 'İki adı da girin.'; end if;
  if p_tur = 'liman' then v_k := siparis_liman_anahtar(p_yazim); v_h := siparis_liman_anahtar(p_dogru);
  else v_k := siparis_firma_anahtar(p_yazim); v_h := siparis_firma_anahtar(p_dogru); end if;
  if v_k is null or v_h is null or char_length(v_k) < 2 or char_length(v_h) < 2 then raise exception 'Ad çok kısa.'; end if;
  v_h := ad_esi(v_sirket, p_tur, v_h);                       -- zincir olmasin: dogru ad baska bir esin yazimiysa onun hedefi
  if v_k = v_h then raise exception 'Bu iki yazım zaten aynı sayılıyor.'; end if;
  if exists (select 1 from ad_esleri where company_id = v_sirket and tur = p_tur and hedef = v_k) then
    raise exception 'Bu yazım başka eşlerin doğru adı; önce onları değiştirin.';
  end if;
  begin v_kim := lower(coalesce(auth.jwt() ->> 'email', '')); exception when others then v_kim := null; end;
  insert into ad_esleri (company_id, tur, kaynak, hedef, kaynak_ad, hedef_ad, ekleyen)
  values (v_sirket, p_tur, v_k, v_h, left(btrim(p_yazim), 160), left(btrim(p_dogru), 160), left(v_kim, 120))
  on conflict (company_id, tur, kaynak) do update set hedef = excluded.hedef, hedef_ad = excluded.hedef_ad, kaynak_ad = excluded.kaynak_ad, ekleyen = excluded.ekleyen;
  return jsonb_build_object('ok', true, 'kaynak', v_k, 'hedef', v_h);
end;
$$;
revoke all on function public.ad_esi_kaydet(text, text, text) from public, anon;
grant execute on function public.ad_esi_kaydet(text, text, text) to authenticated;

create or replace function public.ad_esi_sil(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth_company_id() is null or not (ic_sayfa_yetkisi('analiz') or ic_sayfa_yetkisi('proformalar')) then
    raise exception 'Yetkiniz yok.';
  end if;
  delete from ad_esleri where id = p_id and company_id = auth_company_id();
  if not found then raise exception 'Kayıt bulunamadı.'; end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.ad_esi_sil(uuid) from public, anon;
grant execute on function public.ad_esi_sil(uuid) to authenticated;

-- 2) EXCEL SIPARISI <-> SISTEM PROFORMASI ESLESTIRME ---------------------------------------------------------------
create table if not exists public.siparis_eslesmeleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  proforma_anahtar text not null,                                            -- siparis_anahtar(proformalar.proforma_no)
  defter_id uuid not null references public.siparis_defteri(id) on delete cascade,
  eslestiren text,
  created_at timestamptz not null default now(),
  unique (company_id, proforma_anahtar),
  unique (defter_id)
);
alter table public.siparis_eslesmeleri enable row level security;
drop policy if exists siparis_eslesmeleri_oku on public.siparis_eslesmeleri;
create policy siparis_eslesmeleri_oku on public.siparis_eslesmeleri for select to authenticated
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')));
revoke insert, update, delete on public.siparis_eslesmeleri from anon, authenticated;

create or replace function public.siparis_eslestir(p_proforma_no text, p_defter_anahtar text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sirket uuid := auth_company_id();
  v_pk text := siparis_anahtar(p_proforma_no);
  v_defter uuid;
  v_kim text;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('proformalar') then raise exception 'Yetkiniz yok.'; end if;
  if v_pk is null or p_defter_anahtar !~ '^excel:[0-9a-f-]{36}$' then raise exception 'Geçersiz seçim.'; end if;
  v_defter := substring(p_defter_anahtar from 7)::uuid;
  if not exists (select 1 from proformalar p where p.company_id = v_sirket and siparis_anahtar(p.proforma_no) = v_pk) then
    raise exception 'Sistem proforması bulunamadı.';
  end if;
  if not exists (select 1 from siparis_defteri s where s.id = v_defter and s.company_id = v_sirket) then raise exception 'Excel satırı bulunamadı.'; end if;
  if exists (select 1 from siparis_defteri s where s.id = v_defter and siparis_anahtar(s.proforma_no) = v_pk) then
    raise exception 'Bu satır zaten aynı proforma numarasıyla.';
  end if;
  if exists (select 1 from siparis_eslesmeleri e where e.company_id = v_sirket and (e.proforma_anahtar = v_pk or e.defter_id = v_defter)) then
    raise exception 'Proforma ya da Excel satırı zaten eşleştirilmiş.';
  end if;
  begin v_kim := lower(coalesce(auth.jwt() ->> 'email', '')); exception when others then v_kim := null; end;
  insert into siparis_eslesmeleri (company_id, proforma_anahtar, defter_id, eslestiren) values (v_sirket, v_pk, v_defter, left(v_kim, 120));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.siparis_eslestir(text, text) from public, anon;
grant execute on function public.siparis_eslestir(text, text) to authenticated;

create or replace function public.siparis_eslesme_kaldir(p_proforma_no text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth_company_id() is null or not ic_sayfa_yetkisi('proformalar') then raise exception 'Yetkiniz yok.'; end if;
  delete from siparis_eslesmeleri where company_id = auth_company_id() and proforma_anahtar = siparis_anahtar(p_proforma_no);
  if not found then raise exception 'Eşleştirme bulunamadı.'; end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.siparis_eslesme_kaldir(text) from public, anon;
grant execute on function public.siparis_eslesme_kaldir(text) to authenticated;

-- Eslestirme adaylari: ayni firma (kisa / uzun yazim, sozluk) ya da ayni miktar; eslesmemis, iptal olmayan Excel satirlari.
create or replace function public.siparis_eslesme_adaylari(p_proforma_no text)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_sirket uuid := auth_company_id();
  p record;
  v_f text;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('proformalar') then raise exception 'Yetkiniz yok.'; end if;
  select * into p from proformalar x where x.company_id = v_sirket and siparis_anahtar(x.proforma_no) = siparis_anahtar(p_proforma_no) limit 1;
  if not found then return; end if;
  v_f := ad_esi(v_sirket, 'firma', siparis_firma_anahtar(p.alici_unvan));
  return query
  select jsonb_build_object('anahtar', 'excel:' || s.id, 'proforma_no', s.proforma_no, 'proforma_tarihi', s.proforma_tarihi, 'firma', s.firma,
           'miktar_mt', s.miktar_mt, 'tutar', s.tutar, 'para_birimi', s.para_birimi, 'konteyner', s.konteyner, 'liman', s.liman,
           'durum', s.durum, 'bl_no', s.bl_no, 'puan', z.puan)
  from siparis_defteri s
  cross join lateral (select ad_esi(v_sirket, 'firma', siparis_firma_anahtar(s.firma)) f) ff
  cross join lateral (select
      (case when ff.f = v_f then 3 when least(char_length(ff.f), char_length(v_f)) >= 6 and (ff.f like v_f || '%' or v_f like ff.f || '%') then 2 else 0 end)
    + (case when p.toplam_mts > 0 and abs(coalesce(s.miktar_mt, -1) - p.toplam_mts) < 0.5 then 2 else 0 end)
    + (case when p.toplam > 0 and abs(coalesce(s.tutar, -1) - p.toplam) < 1 then 2 else 0 end) puan) z
  where s.company_id = v_sirket and coalesce(s.durum, '') <> 'iptal'
    and siparis_anahtar(s.proforma_no) <> siparis_anahtar(p.proforma_no)
    and not exists (select 1 from siparis_eslesmeleri e where e.defter_id = s.id)
    and z.puan >= 3                                            -- yalniz miktar ya da yalniz tutar tutmasi aday sayilmaz
  order by z.puan desc, s.proforma_tarihi desc nulls last
  limit 10;
end;
$$;
revoke all on function public.siparis_eslesme_adaylari(text) from public, anon;
grant execute on function public.siparis_eslesme_adaylari(text) to authenticated;
-- 2b) siparis_listesi_veri: eslestirme + sozluk (yalniz eslesme anahtarlari; gosterilen yazim degismez)
drop function if exists public.siparis_listesi_veri(uuid);
create function public.siparis_listesi_veri(p_company uuid)
 returns table(anahtar text, kaynak text, sira integer, proforma_no text, proforma_tarihi date, firma text, urun text, birim_fiyat numeric, miktar_mt numeric, tutar numeric, para_birimi text, konteyner integer, liman text, bl_no text, marka text, paketleme text, durum text, on_odeme boolean, on_odeme_tarihi date, dosya_no text, booking_no text, etd date, benzer text, on_odeme_tutar numeric, on_odeme_para text, bekleyen_konteyner integer, eslesik_proforma text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with dos as (select * from siparis_dosya_ozeti(p_company)),
  oo as (select proforma_anahtar, alindi, tarih, tutar, para_birimi from siparis_on_odemeler where company_id = p_company),
  sd as (
    select s.*, siparis_anahtar(s.proforma_no) pk,
      -- 16.11.2026: "ayni siparis" diye baglanan sistem proformasi (on odemesi bu satira gecer, proforma satiri gizlenir)
      (select e.proforma_anahtar from siparis_eslesmeleri e where e.company_id = p_company and e.defter_id = s.id) epk,
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
      d.dosya_no, d.booking booking_no, d.etd, sd.pk, case when oo.alindi then oo.tutar end on_odeme_tutar, case when oo.alindi then oo.para_birimi end on_odeme_para,
      sd.epk
    from sd left join dos d on d.dosya_id = sd.bagli
      left join oo on oo.proforma_anahtar = coalesce((select o2.proforma_anahtar from oo o2 where o2.proforma_anahtar = sd.pk), sd.epk)
  ),
  dosyadan as (
    select 'dosya:' || d.dosya_id, 'sistem'::text, null::int, d.proforma_no, d.proforma_tarihi, d.alici, d.urun,
      case when d.miktar_mt > 0 then round(d.tutar / d.miktar_mt, 2) end, d.miktar_mt, d.tutar, d.para_birimi, d.konteyner,
      d.liman, nullif(d.bl_no, ''), d.marka, d.ambalaj,
      coalesce(d.durum, case when oo.alindi then 'on_odeme_alindi' else 'onay_bekliyor' end),
      coalesce(oo.alindi, d.durum is not null), oo.tarih, d.dosya_no, d.booking, d.etd, d.pk,
      case when oo.alindi then oo.tutar end, case when oo.alindi then oo.para_birimi end, null::text
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
      case when oo.alindi then oo.tutar end, case when oo.alindi then oo.para_birimi end, null::text
    from proformalar p left join oo on oo.proforma_anahtar = siparis_anahtar(p.proforma_no)
    where p.company_id = p_company
      and not exists (select 1 from sd where sd.pk = siparis_anahtar(p.proforma_no))
      and not exists (select 1 from dos d where d.pk = siparis_anahtar(p.proforma_no))
      and not exists (select 1 from siparis_eslesmeleri e where e.company_id = p_company and e.proforma_anahtar = siparis_anahtar(p.proforma_no))
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
    select ad_esi(p_company, 'firma', siparis_firma_anahtar(p.musteri)) fkey, ad_esi(p_company, 'liman', siparis_liman_anahtar(p.varis_limani)) lkey,
      sum(coalesce(p.konteyner, 0)) k, min(p.etd) etd, count(*) n, min(p.booking_no) bk
    from sevkiyat_plani p
    where p.company_id = p_company and booking_anahtar(p.booking_no) is not null
      and p.siparis_id is null and p.dosya_id is null and p.rezervasyon_id is null
      and (p.etd >= (now() at time zone 'Europe/Istanbul')::date
           or (p.etd is null and p.yil * 100 + p.hafta >= extract(isoyear from (now() at time zone 'Europe/Istanbul')::date) * 100
                                                         + extract(week from (now() at time zone 'Europe/Istanbul')::date)))
    group by 1, 2
  ),
  -- 16.11.2026: konteyner adedi bos sistem proformasi MT'den (25 MT / konteyner) sayilir; booking siparisin bir kismini
  -- karsiliyorsa (ornek: 5 konteynerlik siparise 2 konteyner booking) siparis "on odeme alindi" kalir, kalan adet bekler.
  aday0 as (
    select t.anahtar, ad_esi(p_company, 'firma', siparis_firma_anahtar(t.firma)) fkey, ad_esi(p_company, 'liman', siparis_liman_anahtar(t.liman)) lkey, t.on_odeme_tarihi, t.proforma_no,
      coalesce(t.konteyner, case when t.kaynak = 'sistem' and t.miktar_mt > 0 then greatest(1, round(t.miktar_mt / 25))::int end, 0) keff
    from tum0 t
    where t.durum = 'on_odeme_alindi' and not exists (select 1 from bagli_plan b where b.anahtar = t.anahtar)
  ),
  aday as (
    select a.*, sum(a.keff) over (partition by a.fkey, a.lkey order by a.on_odeme_tarihi nulls last, a.proforma_no, a.anahtar) cum
    from aday0 a
  ),
  eslesen as (
    select a.anahtar, case when pa.n = 1 then pa.bk end bk, pa.etd, a.cum <= pa.k tam,
      greatest(a.cum - pa.k, 0)::int kalan
    from aday a join plan_aday pa on pa.fkey = a.fkey and pa.lkey = a.lkey
    where pa.k > 0 and a.cum - a.keff < pa.k
  ),
  tum as (
    select t.anahtar, t.kaynak, t.sira, t.proforma_no, t.proforma_tarihi, t.firma, t.urun, t.birim_fiyat, t.miktar_mt, t.tutar,
      t.para_birimi, t.konteyner, t.liman, t.bl_no, t.marka, t.paketleme,
      case when t.durum = 'on_odeme_alindi' and (b.anahtar is not null or e.tam) then 'rezervasyonlu' else t.durum end durum,
      t.on_odeme, t.on_odeme_tarihi, t.dosya_no,
      coalesce(t.booking_no, b.bk, case when t.durum = 'on_odeme_alindi' then e.bk end) booking_no,
      coalesce(t.etd, b.etd, case when t.durum = 'on_odeme_alindi' then e.etd end) etd,
      t.pk, t.on_odeme_tutar, t.on_odeme_para, t.epk,
      case when t.durum = 'on_odeme_alindi' and b.anahtar is null and e.anahtar is not null and not e.tam then e.kalan end kismi_kalan
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
    t.on_odeme_tutar, t.on_odeme_para,
    -- Rezervasyon bekleyen adet: kismi booking'de kalan, yoksa siparisin tamami (yalniz "on odeme alindi")
    case when t.durum = 'on_odeme_alindi' then coalesce(t.kismi_kalan,
      coalesce(t.konteyner, case when t.kaynak = 'sistem' and t.miktar_mt > 0 then greatest(1, round(t.miktar_mt / 25))::int end)) end bekleyen_konteyner,
    (select p.proforma_no from proformalar p where p.company_id = p_company and siparis_anahtar(p.proforma_no) = t.epk limit 1) eslesik_proforma
  from tum t
$function$;

revoke all on function public.siparis_listesi_veri(uuid) from public, anon, authenticated;
grant execute on function public.siparis_listesi_veri(uuid) to service_role;


-- 3) VERI TUTARSIZLIKLARI (Kontrol Merkezi karti; salt okunur) ----------------------------------------------------
-- Donus: { tarih, plan_son, siparis_son, navlun_son, kalemler: [{ tur, onem, baslik, ayrinti, baglanti }] }
create or replace function public.veri_tutarsizliklari()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c uuid := auth_company_id();
  v_sip jsonb;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_kalem jsonb := '[]'::jsonb;
  v_plan_son timestamptz; v_sip_son timestamptz; v_nav_son timestamptz;
begin
  if auth.uid() is null or c is null or not ic_sayfa_yetkisi('analiz') then raise exception 'Yetkiniz yok.'; end if;

  -- Siparis listesi bir kez okunur (iki kontrol kullanir)
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_sip from siparis_listesi_veri(c) x
  where x.durum in ('onay_bekliyor', 'on_odeme_alindi', 'rezervasyonlu');

  -- a) Plan ile rezervasyon ETD farki (yaklasan / acik)
  v_kalem := v_kalem || coalesce((
    select jsonb_agg(jsonb_build_object('tur', 'etd_farki', 'onem', 'orta',
      'baslik', coalesce(p.musteri, '—') || ' · ' || coalesce(p.booking_no, ''),
      'ayrinti', 'Yükleme planı ETD ' || to_char(p.etd, 'DD.MM.YYYY') || ' · rezervasyon ' || to_char(r.gemi_kalkis_tarihi, 'DD.MM.YYYY')
                 || coalesce(' · ' || d.dosya_no, ''),
      'baglanti', case when d.id is not null then '/dosya/' || d.id end) order by p.etd)
    from sevkiyat_plani p join rezervasyonlar r on r.id = p.rezervasyon_id left join ihracat_dosyalari d on d.id = r.dosya_id
    where p.company_id = c and p.etd is not null and r.gemi_kalkis_tarihi is not null and p.etd <> r.gemi_kalkis_tarihi
      and greatest(p.etd, r.gemi_kalkis_tarihi) >= v_bugun and coalesce(d.durum, '') not ilike 'kapal%'), '[]'::jsonb);

  -- b) Ayni siparis iki numarayla: sistem proformasi ~ Excel satiri (ayni firma, ayni miktar), eslestirilmemis
  v_kalem := v_kalem || coalesce((
    select jsonb_agg(jsonb_build_object('tur', 'cift_siparis', 'onem', 'orta',
      'baslik', s1.firma, 'ayrinti', 'Sistem ' || s1.proforma_no || ' ↔ Excel ' || s2.proforma_no || ' · ' || trim(to_char(s1.miktar_mt, 'FM999G990D00')) || ' MT'
        || ' — aynı siparişse Siparişler''de eşleştirin', 'baglanti', '/siparisler'))
    from jsonb_to_recordset(v_sip) s1(anahtar text, kaynak text, proforma_no text, proforma_tarihi date, firma text, miktar_mt numeric, durum text, eslesik_proforma text)
    join jsonb_to_recordset(v_sip) s2(anahtar text, kaynak text, proforma_no text, proforma_tarihi date, firma text, miktar_mt numeric, durum text, eslesik_proforma text) on s2.kaynak = 'excel' and s1.kaynak = 'sistem' and s1.anahtar like 'proforma:%'
      and siparis_anahtar(s2.proforma_no) <> siparis_anahtar(s1.proforma_no) and s2.eslesik_proforma is null
      and s1.durum in ('onay_bekliyor', 'on_odeme_alindi', 'rezervasyonlu') and s2.durum in ('onay_bekliyor', 'on_odeme_alindi', 'rezervasyonlu')
      and s1.miktar_mt is not null and abs(coalesce(s2.miktar_mt, -1) - s1.miktar_mt) < 0.5
      and (ad_esi(c, 'firma', siparis_firma_anahtar(s1.firma)) = ad_esi(c, 'firma', siparis_firma_anahtar(s2.firma))
           or (least(char_length(siparis_firma_anahtar(s1.firma)), char_length(siparis_firma_anahtar(s2.firma))) >= 6
               and (siparis_firma_anahtar(s1.firma) like siparis_firma_anahtar(s2.firma) || '%' or siparis_firma_anahtar(s2.firma) like siparis_firma_anahtar(s1.firma) || '%')))
      and (s1.proforma_tarihi is null or s2.proforma_tarihi is null or abs(s1.proforma_tarihi - s2.proforma_tarihi) <= 45)), '[]'::jsonb);

  -- c) Yaklasan booking (30 gun), navlunu ne dosyada ne planda ne anlasma mailinde (ayni liman, ETD'den 90 gun once)
  v_kalem := v_kalem || coalesce((
    select jsonb_agg(jsonb_build_object('tur', 'navlunsuz_booking', 'onem', 'orta',
      'baslik', coalesce(y.musteri, '—') || ' · ' || coalesce(y.varis_limani, '—'),
      'ayrinti', 'ETD ' || to_char(y.etd, 'DD.MM.YYYY') || ' · ' || coalesce(y.konteyner::text, '?') || ' kont. · ' || coalesce(y.acente, 'acente ?') || ' — navlun bilgisi yok',
      'baglanti', '/navlun') order by y.etd)
    from yukleme_plani_veri(c) y
    where y.kaynak in ('excel', 'sistem') and y.booking_no is not null and y.etd between v_bugun and v_bugun + 30
      and coalesce(y.navlun, 0) = 0
      and not exists (select 1 from navlun_teklifleri t where t.company_id = c and t.tur = 'kabul' and t.tutar > 0
        and ad_esi(c, 'liman', siparis_liman_anahtar(t.liman_anahtar)) = ad_esi(c, 'liman', siparis_liman_anahtar(y.varis_limani))
        and t.tarih::date between y.etd - 90 and y.etd)), '[]'::jsonb);

  -- d) On odemesi alinmis, 7 gunden uzun suredir booking'i yok
  v_kalem := v_kalem || coalesce((
    select jsonb_agg(jsonb_build_object('tur', 'bekleyen_siparis', 'onem', case when v_bugun - s.on_odeme_tarihi > 14 then 'yuksek' else 'orta' end,
      'baslik', coalesce(s.firma, '—') || ' · ' || coalesce(s.proforma_no, ''),
      'ayrinti', (v_bugun - s.on_odeme_tarihi) || ' gündür booking yok · ' || coalesce(s.bekleyen_konteyner, s.konteyner, 0) || ' kont. · ' || coalesce(s.liman, '—'),
      'baglanti', '/siparisler') order by s.on_odeme_tarihi)
    from jsonb_to_recordset(v_sip) s(firma text, proforma_no text, durum text, on_odeme_tarihi date, bekleyen_konteyner int, konteyner int, liman text)
    where s.durum = 'on_odeme_alindi' and s.on_odeme_tarihi is not null and s.on_odeme_tarihi <= v_bugun - 7), '[]'::jsonb);

  -- e) Kaynaklarin tazeligi
  select max(tarih) into v_plan_son from sevkiyat_plani_aktarimlari where company_id = c;
  select max(tarih) into v_sip_son from siparis_defteri_aktarimlari where company_id = c;
  select max(created_at) into v_nav_son from navlun_mesajlari where company_id = c;
  if v_plan_son is null or v_plan_son < now() - interval '3 days' then
    v_kalem := v_kalem || jsonb_build_array(jsonb_build_object('tur', 'kaynak_eski', 'onem', 'yuksek', 'baslik', 'Yükleme planı güncel değil',
      'ayrinti', coalesce('Son yükleme ' || to_char(v_plan_son at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'), 'Hiç yüklenmemiş') || ' — raporlar eski planla hesaplanıyor', 'baglanti', '/siparisler'));
  end if;
  if v_sip_son is null or v_sip_son < now() - interval '3 days' then
    v_kalem := v_kalem || jsonb_build_array(jsonb_build_object('tur', 'kaynak_eski', 'onem', 'orta', 'baslik', 'Sipariş listesi güncel değil',
      'ayrinti', coalesce('Son yükleme ' || to_char(v_sip_son at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'), 'Hiç yüklenmemiş'), 'baglanti', '/siparisler'));
  end if;
  if v_nav_son is not null and v_nav_son < now() - interval '1 day' then
    v_kalem := v_kalem || jsonb_build_array(jsonb_build_object('tur', 'kaynak_eski', 'onem', 'orta', 'baslik', 'Navlun mailleri okunmuyor',
      'ayrinti', 'Son kayıt ' || to_char(v_nav_son at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') || ' — Apps Script tetikleyicisini kontrol edin', 'baglanti', '/navlun'));
  end if;

  return jsonb_build_object('tarih', now(), 'plan_son', v_plan_son, 'siparis_son', v_sip_son, 'navlun_son', v_nav_son, 'kalemler', v_kalem);
end;
$$;
revoke all on function public.veri_tutarsizliklari() from public, anon;
grant execute on function public.veri_tutarsizliklari() to authenticated;

-- 4) NAVLUN: TEKLIF OLABILECEK MAILLER ----------------------------------------------------------------------------
-- Fiyat okunamamis ("bilgi") acente cevaplari: metninde tutar geciyor ya da tanimadigimiz bir alan adindan (acente bos).
create or replace function public.navlun_teklif_adaylari()
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or auth_company_id() is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz') or ic_sayfa_yetkisi('navlun')) then
    raise exception 'Yetkiniz yok.';
  end if;
  return query
  select jsonb_build_object('id', m.id, 'konu', m.konu, 'acente', m.acente, 'alan', split_part(m.gonderen, '@', 2), 'liman', m.liman,
           'tarih', m.tarih, 'metin', left(coalesce(m.govde, m.ozet, ''), 1500))
  from navlun_mesajlari m
  where m.company_id = auth_company_id() and m.durum = 'bilgi' and coalesce(m.olay_sayisi, 0) = 0
    and m.tarih > now() - interval '45 days' and m.mesaj_id not like 'alinti:%'
    and m.gonderen !~* '@(unex\.com\.tr|ihracatasistanim\.com)$'
    and (m.acente is null or m.govde ~* '(usd|\$|eur|€)\s*[0-9]{3,5}|[0-9]{3,5}\s*(usd|\$|eur|€)')
  order by m.tarih desc
  limit 100;
end;
$$;
revoke all on function public.navlun_teklif_adaylari() from public, anon;
grant execute on function public.navlun_teklif_adaylari() to authenticated;

-- navlun_hata_coz: "bilgi" kayitlari da cozulur; acentesi bilinmeyen mailde acente adi istenir ve alan adi ogrenilir.
drop function if exists public.navlun_hata_coz(uuid, text, numeric, text, text);
create or replace function public.navlun_hata_coz(p_id uuid, p_islem text, p_tutar numeric default null, p_ekipman text default '20DC',
  p_armator text default null, p_acente text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r navlun_mesajlari;
  v_kim text;
  v_acente text;
  v_alan text;
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz') or ic_sayfa_yetkisi('navlun')) then
    raise exception 'Yetkiniz yok.';
  end if;
  select * into r from navlun_mesajlari where id = p_id and company_id = auth_company_id() for update;
  if not found then raise exception 'Kayıt bulunamadı.'; end if;
  if r.durum not in ('okunamadi', 'bilgi') then raise exception 'Bu kayıt hata kuyruğunda değil.'; end if;
  begin v_kim := lower(coalesce(auth.jwt() ->> 'email', '')); exception when others then v_kim := null; end;
  if p_islem = 'yoksay' then
    update navlun_mesajlari set durum = 'yoksayildi', cozen = left(v_kim, 120), cozum_tarihi = now(), updated_at = now() where id = p_id;
    return jsonb_build_object('ok', true);
  elsif p_islem = 'duzelt' then
    if p_tutar is null or p_tutar <= 0 or p_tutar >= 100000 then raise exception 'Geçerli bir tutar girin.'; end if;
    if coalesce(p_ekipman, '20DC') not in ('20DC', '40DC', '40HC') then raise exception 'Ekipman geçersiz.'; end if;
    v_acente := coalesce(r.acente, nullif(left(btrim(p_acente), 60), ''));
    if v_acente is null then raise exception 'Acente adını girin.'; end if;
    if r.liman is null then raise exception 'Mailin konusunda liman yok; bu kayıt teklif olarak eklenemez.'; end if;
    if r.acente is null then
      -- Taninmayan alan adi: acente olarak ogrenilir (sonraki mailleri otomatik okunur). Pasif kayit varsa dokunulmaz.
      v_alan := lower(split_part(r.gonderen, '@', 2));
      if v_alan ~ '^[a-z0-9.-]+\.[a-z]{2,}$' then
        insert into navlun_acenteler (company_id, alan_adi, ad, aktif) values (r.company_id, v_alan, v_acente, true)
        on conflict (company_id, alan_adi) do nothing;
      end if;
      update navlun_mesajlari set acente = v_acente where id = p_id;
    end if;
    insert into navlun_teklifleri (company_id, mesaj_id, sira, tur, liman, liman_anahtar, acente, armator, tutar, ekipman, kaynak, tarih)
    values (r.company_id, r.mesaj_id,
            coalesce((select max(sira) from navlun_teklifleri where company_id = r.company_id and mesaj_id = r.mesaj_id), 0) + 1,
            'teklif', r.liman, r.liman_anahtar, v_acente, nullif(left(btrim(p_armator), 40), ''), p_tutar,
            coalesce(p_ekipman, '20DC'), 'elle', r.tarih);
    update navlun_mesajlari set durum = 'duzeltildi', cozen = left(v_kim, 120), cozum_tarihi = now(), updated_at = now() where id = p_id;
    return jsonb_build_object('ok', true);
  end if;
  raise exception 'Bilinmeyen işlem.';
end;
$$;
revoke all on function public.navlun_hata_coz(uuid, text, numeric, text, text, text) from public, anon;
grant execute on function public.navlun_hata_coz(uuid, text, numeric, text, text, text) to authenticated;

-- 5) NAVLUN "YENIDEN OKU" ISTEGI ----------------------------------------------------------------------------------
-- Uygulama tarih secer; Apps Script her 15 dk'lik calismada (normal okumadan SONRA, kalan surede) o tarihten
-- itibaren yazismalari sayfa sayfa yeniden gonderir. NAVLUN_SON'a dokunulmaz; kayitlar Message-ID ile tekrar etmez.
create table if not exists public.navlun_yeniden_okuma (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  baslangic date not null,
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'isleniyor', 'tamam', 'iptal')),
  konum integer not null default 0 check (konum >= 0),          -- islenen yazisma (Gmail arama sirasi)
  gonderilen integer not null default 0,
  yeni integer not null default 0,
  isteyen text,
  istek_zamani timestamptz not null default now(),
  son_ilerleme timestamptz
);
create unique index if not exists navlun_yeniden_okuma_tek_aktif on public.navlun_yeniden_okuma (company_id) where durum in ('bekliyor', 'isleniyor');
alter table public.navlun_yeniden_okuma enable row level security;
drop policy if exists navlun_yeniden_okuma_oku on public.navlun_yeniden_okuma;
create policy navlun_yeniden_okuma_oku on public.navlun_yeniden_okuma for select to authenticated
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz') or ic_sayfa_yetkisi('navlun')));
revoke insert, update, delete on public.navlun_yeniden_okuma from anon, authenticated;

create or replace function public.navlun_yeniden_oku_iste(p_tarih date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sirket uuid := auth_company_id();
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_kim text;
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz') or ic_sayfa_yetkisi('navlun')) then
    raise exception 'Yetkiniz yok.';
  end if;
  if p_tarih is null or p_tarih > v_bugun or p_tarih < v_bugun - 60 then raise exception 'Tarih son 60 gün içinde olmalı.'; end if;
  begin v_kim := lower(coalesce(auth.jwt() ->> 'email', '')); exception when others then v_kim := null; end;
  update navlun_yeniden_okuma set durum = 'iptal', son_ilerleme = now() where company_id = v_sirket and durum in ('bekliyor', 'isleniyor');
  insert into navlun_yeniden_okuma (company_id, baslangic, isteyen) values (v_sirket, p_tarih, left(v_kim, 120));
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.navlun_yeniden_oku_iste(date) from public, anon;
grant execute on function public.navlun_yeniden_oku_iste(date) to authenticated;

create or replace function public.navlun_yeniden_oku_iptal()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth_company_id() is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz') or ic_sayfa_yetkisi('navlun')) then
    raise exception 'Yetkiniz yok.';
  end if;
  update navlun_yeniden_okuma set durum = 'iptal', son_ilerleme = now() where company_id = auth_company_id() and durum in ('bekliyor', 'isleniyor');
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.navlun_yeniden_oku_iptal() from public, anon;
grant execute on function public.navlun_yeniden_oku_iptal() to authenticated;

-- Edge (service role) icin: aktif istek ve ilerleme
create or replace function public.navlun_yeniden_oku_al(p_company uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('id', id, 'baslangic', baslangic, 'konum', konum)
    from navlun_yeniden_okuma where company_id = p_company and durum in ('bekliyor', 'isleniyor') order by istek_zamani desc limit 1), '{}'::jsonb)
$$;
create or replace function public.navlun_yeniden_oku_ilerle(p_company uuid, p_id uuid, p_islenen integer, p_gonderilen integer, p_yeni integer, p_bitti boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update navlun_yeniden_okuma
  set konum = konum + greatest(coalesce(p_islenen, 0), 0), gonderilen = gonderilen + greatest(coalesce(p_gonderilen, 0), 0),
      yeni = yeni + greatest(coalesce(p_yeni, 0), 0), durum = case when p_bitti then 'tamam' else 'isleniyor' end, son_ilerleme = now()
  where id = p_id and company_id = p_company and durum in ('bekliyor', 'isleniyor');
  return jsonb_build_object('ok', found);
end;
$$;
revoke all on function public.navlun_yeniden_oku_al(uuid) from public, anon, authenticated;
revoke all on function public.navlun_yeniden_oku_ilerle(uuid, uuid, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.navlun_yeniden_oku_al(uuid) to service_role;
grant execute on function public.navlun_yeniden_oku_ilerle(uuid, uuid, integer, integer, integer, boolean) to service_role;
