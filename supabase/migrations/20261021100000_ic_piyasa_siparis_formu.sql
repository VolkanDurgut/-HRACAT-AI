-- ============================================================================
-- IC PIYASA - SIPARIS FORMUNDAN IS EMRI (21.10.2026)
-- ============================================================================
-- Musteriyle imzalanan "SIPARIS FORMU" PDF'i (butun sureci baslatan belge)
-- sisteme yuklenir; okunan bilgilerle (kullanici onayiyla) is emri acilir ve
-- form is emrine eklenir.
--
-- SADECE EKLEME + izin daraltma (mevcut veri degismez):
--  1) ic_is_emirleri: siparis_tarihi, nakliye, teslim_suresi_gun,
--     urun_ozellikleri, siparis_formu_yolu / _adi.
--  2) Depo (ic-piyasa-belgeler):
--     - <sirket>/siparis/... yalnizca ic_piyasa yetkisiyle yuklenir.
--     - KANTARCI artik SADECE <sirket>/irsaliye/... okuyabilir (sipariş formunda
--       fiyat var; "kantarci fiyati gormez" kurali depoda da gecerli olsun).
--  3) ic_is_emri_tamamen_sil: silinen is emrinin sipariş formu yolunu da dondurur
--     (istemci kayit silindikten SONRA depodan siler).
-- Kod push edilmeden ONCE uygulanmalidir (sayfalar yeni kolonlari okur).
-- Tekrar calistirilabilir.
-- ============================================================================
begin;

-- 1) Is emri alanlari ---------------------------------------------------------
alter table public.ic_is_emirleri
  add column if not exists siparis_tarihi date,
  add column if not exists nakliye text check (nakliye is null or nakliye in ('alici', 'satici')),
  add column if not exists teslim_suresi_gun integer check (teslim_suresi_gun is null or (teslim_suresi_gun >= 0 and teslim_suresi_gun <= 365)),
  add column if not exists urun_ozellikleri jsonb check (
    urun_ozellikleri is null
    or (jsonb_typeof(urun_ozellikleri) = 'array' and jsonb_array_length(urun_ozellikleri) <= 20)
  ),
  add column if not exists siparis_formu_yolu text,
  add column if not exists siparis_formu_adi text check (siparis_formu_adi is null or char_length(siparis_formu_adi) <= 255);

-- Form yolu kendi sirketinin siparis klasorunde olmali
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ic_is_emri_siparis_formu_yolu_gecerli') then
    alter table public.ic_is_emirleri add constraint ic_is_emri_siparis_formu_yolu_gecerli check (
      siparis_formu_yolu is null
      or (split_part(siparis_formu_yolu, '/', 1) = company_id::text
          and split_part(siparis_formu_yolu, '/', 2) = 'siparis'
          and siparis_formu_yolu ~ '\.pdf$'
          and position('..' in siparis_formu_yolu) = 0)
    );
  end if;
end $$;

comment on column public.ic_is_emirleri.siparis_tarihi is 'Sipariş formundaki tarih (21.10.2026).';
comment on column public.ic_is_emirleri.nakliye is 'Ürün nakliyesi: alici (alıcıya) / satici (satıcıya).';
comment on column public.ic_is_emirleri.teslim_suresi_gun is 'Sipariş formundaki teslim süresi (gün).';
comment on column public.ic_is_emirleri.urun_ozellikleri is 'Sipariş formundaki ürün özellikleri: [{ad, deger}] (rutubet, protein ...).';
comment on column public.ic_is_emirleri.siparis_formu_yolu is 'ic-piyasa-belgeler deposunda <sirket>/siparis/<uuid>.pdf';

-- 2) Depo izinleri ------------------------------------------------------------
drop policy if exists ic_belge_select on storage.objects;
create policy ic_belge_select on storage.objects for select
  using (bucket_id = 'ic-piyasa-belgeler'
         and split_part(name, '/', 1) = public.auth_company_id()::text
         and (public.ic_sayfa_yetkisi('ic_piyasa')
              or (public.ic_sayfa_yetkisi('kantar') and split_part(name, '/', 2) = 'irsaliye')));

drop policy if exists ic_belge_insert on storage.objects;
create policy ic_belge_insert on storage.objects for insert
  with check (bucket_id = 'ic-piyasa-belgeler'
              and split_part(name, '/', 1) = public.auth_company_id()::text
              and ((split_part(name, '/', 2) = 'irsaliye'
                    and (public.ic_sayfa_yetkisi('ic_piyasa') or public.ic_sayfa_yetkisi('kantar')))
                   or (split_part(name, '/', 2) = 'siparis' and public.ic_sayfa_yetkisi('ic_piyasa'))));

-- 3) Tamamen sil: sipariş formunun yolu da donsun ----------------------------
create or replace function public.ic_is_emri_tamamen_sil(p_id uuid)
 returns text[]
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  e public.ic_is_emirleri%rowtype;
  v_yollar text[];
begin
  select * into e from public.ic_is_emirleri where id = p_id for update;
  if not found or auth.uid() is null or e.company_id is distinct from auth_company_id() or not ic_sayfa_yetkisi('ic_piyasa') then
    raise exception 'İş emri bulunamadı veya yetkiniz yok.' using errcode = '42501';
  end if;
  if e.durum <> 'iptal' and exists (select 1 from public.ic_sevkler where is_emri_id = p_id) then
    raise exception 'Araç girilmiş iş emri ancak iptal edildikten sonra tamamen silinebilir.' using errcode = '23514';
  end if;
  select coalesce(array_agg(irsaliye_dosya_yolu), '{}') into v_yollar from public.ic_sevkler where is_emri_id = p_id;
  if e.siparis_formu_yolu is not null then
    v_yollar := array_append(v_yollar, e.siparis_formu_yolu);
  end if;
  delete from public.ic_sevkler where is_emri_id = p_id;
  delete from public.ic_is_emirleri where id = p_id;
  return v_yollar;
end; $function$;

revoke all on function public.ic_is_emri_tamamen_sil(uuid) from public, anon;
grant execute on function public.ic_is_emri_tamamen_sil(uuid) to authenticated;

commit;
