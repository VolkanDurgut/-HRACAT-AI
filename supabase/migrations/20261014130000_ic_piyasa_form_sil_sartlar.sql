-- ============================================================================
-- IC PIYASA - FORM SILME + DUZENLENEBILIR SARTLAR (14.10.2026)
-- ============================================================================
-- Kullanici istekleri:
--  1) "Olusturulan Formlar" listesinden form SILINEBILMELI.
--     Kural (kullanici karari): bir is emri bu forma bagliysa silinemez.
--     Silinen formun tam kopyasi denetim_kayitlari'na yazilir (geri
--     getirilebilir). Form numarasi tekrar kullanilmaz (sayac ilerlemeye
--     devam eder; FBF-...-0003 silinirse bir sonraki 0004 olur).
--  2) "Bilgilendirme ve Sevkiyat Sartlari" panelden revize edilebilmeli.
--     ic_piyasa_ayarlari.form_sartlari : GUNCEL madde listesi (text[] olarak
--       jsonb dizi). NULL = uygulamadaki varsayilan 4 madde. "{KDV}" yazilan
--       yere urunlerin KDV durumuna gore cumle gelir.
--     ic_fiyat_formlari.sartlar : onay anindaki maddelerin DONDURULMUS hali
--       ({KDV} cozulmus). NULL = eski form (varsayilan maddelerle gonderildi).
--
-- Sadece EKLEME; hicbir veri silinmez / degismez. Ihracat tablolarina ve
-- depositors / contact_messages tablolarina dokunmaz.
-- ============================================================================

-- ---- 2) Sartlar -------------------------------------------------------------
alter table public.ic_piyasa_ayarlari add column if not exists form_sartlari jsonb;
alter table public.ic_fiyat_formlari add column if not exists sartlar jsonb;

-- 1-8 madde, her madde 5-500 karakter metin
create or replace function public.ic_sartlar_gecerli(v jsonb)
 returns boolean
 language sql
 immutable
 set search_path to 'public'
as $function$
  select v is null or (
    jsonb_typeof(v) = 'array'
    and jsonb_array_length(v) between 1 and 8
    and not exists (
      select 1 from jsonb_array_elements(v) e
      where jsonb_typeof(e) <> 'string' or char_length(btrim(e #>> '{}')) not between 5 and 500
    )
  );
$function$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ic_piyasa_ayarlari_form_sartlari_check') then
    alter table public.ic_piyasa_ayarlari add constraint ic_piyasa_ayarlari_form_sartlari_check
      check (public.ic_sartlar_gecerli(form_sartlari));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ic_fiyat_formlari_sartlar_check') then
    alter table public.ic_fiyat_formlari add constraint ic_fiyat_formlari_sartlar_check
      check (public.ic_sartlar_gecerli(sartlar));
  end if;
end $$;

comment on column public.ic_piyasa_ayarlari.form_sartlari is 'Fiyat formundaki Bilgilendirme ve Sevkiyat Sartlari (jsonb metin dizisi, 1-8 madde). NULL = varsayilan. {KDV} = urunlerin KDV durumuna gore cumle.';
comment on column public.ic_fiyat_formlari.sartlar is 'Onay anindaki sartlar ({KDV} cozulmus, DONDURULMUS). NULL = 14.10.2026 oncesi form (varsayilan maddeler).';

-- ---- 1) Form silme ----------------------------------------------------------
-- Is emrine bagli form silinemez (FK ON DELETE SET NULL baglantiyi sessizce
-- koparirdi; bunun yerine acik hata).
create or replace function public.ic_fiyat_formu_silinebilir_mi()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  bagli text;
begin
  select string_agg(is_emri_no, ', ' order by is_emri_no) into bagli
    from public.ic_is_emirleri where fiyat_formu_id = old.id;
  if bagli is not null then
    raise exception 'Bu form iş emrinde kullanılıyor (%); silinemez.', bagli using errcode = '23503';
  end if;
  return old;
end; $function$;

drop trigger if exists ic_fiyat_formu_silinebilir_mi on public.ic_fiyat_formlari;
create trigger ic_fiyat_formu_silinebilir_mi
  before delete on public.ic_fiyat_formlari
  for each row execute function public.ic_fiyat_formu_silinebilir_mi();

-- Silinen formun tam kopyasi denetim kaydina (diger ic_ tablolari gibi)
drop trigger if exists denetim_ic_fiyat_formlari on public.ic_fiyat_formlari;
create trigger denetim_ic_fiyat_formlari
  after insert or delete or update on public.ic_fiyat_formlari
  for each row execute function public.denetim_tetikleyici();

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ic_fiyat_formlari' and policyname = 'ic_fiyat_formlari_delete_own_company') then
    create policy ic_fiyat_formlari_delete_own_company on public.ic_fiyat_formlari
      for delete using ((company_id = auth_company_id()) and ic_sayfa_yetkisi('ic_piyasa'::text));
  end if;
end $$;

-- Sadece DELETE eklenir; UPDATE yine YOK (onayli form degistirilemez).
grant delete on table public.ic_fiyat_formlari to authenticated;
