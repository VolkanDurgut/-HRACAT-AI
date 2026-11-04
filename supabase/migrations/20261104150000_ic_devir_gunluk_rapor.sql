-- ============================================================================
-- IC PIYASA - SIPARISLER ARASI TONAJ DEVRI + GUNLUK IC PIYASA RAPORU (04.11.2026)
-- ============================================================================
-- Kullanici (04.11.2026):
--  1) "IE-2026-0007 ... 318.940 / 300.000 kg · Fazla 18,94 ton. Buradaki fazlalik olan
--     18.940 bu dosyaya aktarilmali: IE-2026-0008 ... 55.020 / 320.000 kg."
--     Bir aracin irsaliyesi bolunemez -> arac TASINMAZ; "devir" (tonaj aktarimi) kaydi:
--     kaynak siparisin yuklenen miktarindan duser, hedefe eklenir. Araclar / irsaliyeler
--     AYNEN kalir. Yuklenen = sum(ic_sevkler.net_kg) + ic_is_emirleri.devir_kg.
--  2) "Gunluk ihracat raporu gibi gunluk ic piyasa raporu (bugun yuklenenler, bugun
--     gelenler). Ilk test mesensei282@gmail.com." + "Ic piyasadan gelen fazlalik maili
--     kotu, onu kaldirabiliriz" -> siparis kapanis e-postasi KAPATILIR (ayar bosaltilir;
--     tetikleyici ayar bossa rapor uretmez - mevcut kural). Bilgisi gunluk raporda.
--
-- SADECE EKLEME + iki fonksiyon govdesinde tek satirlik ek (yukaridaki toplama devir eklenir).
-- Tablo / veri SILME YOK. Ihracat tablolarina DOKUNULMAZ.
-- KOD PUSH'UNDAN ONCE uygulanir (arayuz devir_kg / gunluk_rapor_eposta okur).
-- ============================================================================

-- 1) Devir alani (net: + gelen, - giden). Yalniz devir fonksiyonlari degistirir.
alter table public.ic_is_emirleri add column if not exists devir_kg numeric(12,2) not null default 0;
comment on column public.ic_is_emirleri.devir_kg is
  'Siparisler arasi tonaj devri (net kg; + gelen, - giden). Yuklenen = arac toplami + devir_kg. Yalniz ic_is_emri_devir_* fonksiyonlari yazar (04.11.2026).';

create table if not exists public.ic_is_emri_devirleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  kaynak_id uuid not null references public.ic_is_emirleri(id) on delete restrict,
  hedef_id uuid not null references public.ic_is_emirleri(id) on delete restrict,
  miktar_kg numeric(12,2) not null check (miktar_kg > 0 and miktar_kg <= 5000000),
  aciklama text check (aciklama is null or length(aciklama) <= 500),
  olusturan_email text,
  olusturma timestamptz not null default now(),
  geri_alindi timestamptz,
  geri_alan_email text,
  check (kaynak_id <> hedef_id)
);
create index if not exists ic_is_emri_devirleri_kaynak on public.ic_is_emri_devirleri (kaynak_id);
create index if not exists ic_is_emri_devirleri_hedef on public.ic_is_emri_devirleri (hedef_id);
alter table public.ic_is_emri_devirleri enable row level security;
revoke all on table public.ic_is_emri_devirleri from anon;
grant select on table public.ic_is_emri_devirleri to authenticated;
drop policy if exists ic_is_emri_devirleri_select on public.ic_is_emri_devirleri;
create policy ic_is_emri_devirleri_select on public.ic_is_emri_devirleri
  for select to authenticated using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
-- INSERT / UPDATE / DELETE politikasi YOK: yalniz fonksiyonlar (security definer).
drop trigger if exists denetim_ic_is_emri_devirleri on public.ic_is_emri_devirleri;
create trigger denetim_ic_is_emri_devirleri after insert or update or delete on public.ic_is_emri_devirleri
  for each row execute function public.denetim_tetikleyici();

-- devir_kg'yi dogrudan (form / PostgREST) degistirmek engellenir
create or replace function public.ic_devir_koru()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if coalesce(current_setting('ic.devir_izin', true), '') = 'evet' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.devir_kg := 0;
  elsif new.devir_kg is distinct from old.devir_kg then
    raise exception 'Devir miktarı doğrudan değiştirilemez; "Fazlayı aktar" kullanın.' using errcode = '42501';
  end if;
  return new;
end; $function$;
drop trigger if exists ic_devir_koru on public.ic_is_emirleri;
create trigger ic_devir_koru before insert or update on public.ic_is_emirleri
  for each row execute function public.ic_devir_koru();

-- Devir: kaynagin FAZLASINDAN hedefe (ayni sirket, ayni musteri, ayni urun, tonaj hedefli, hedef acik)
create or replace function public.ic_is_emri_devir_ekle(p_kaynak uuid, p_hedef uuid, p_kg numeric, p_aciklama text default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
  k public.ic_is_emirleri%rowtype;
  h public.ic_is_emirleri%rowtype;
  v_kg numeric := round(coalesce(p_kg, 0), 2);
  v_yuklenen numeric;
  v_fazla numeric;
  v_id uuid;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('ic_piyasa') then
    raise exception 'İç piyasa yetkiniz yok.' using errcode = '42501';
  end if;
  select * into k from public.ic_is_emirleri where id = p_kaynak and company_id = v_sirket for update;
  if not found then raise exception 'Kaynak sipariş bulunamadı.' using errcode = 'P0002'; end if;
  select * into h from public.ic_is_emirleri where id = p_hedef and company_id = v_sirket for update;
  if not found then raise exception 'Hedef sipariş bulunamadı.' using errcode = 'P0002'; end if;
  if k.id = h.id then raise exception 'Kaynak ve hedef aynı sipariş olamaz.' using errcode = '22023'; end if;
  if k.musteri_id <> h.musteri_id then raise exception 'Devir yalnız aynı müşterinin siparişleri arasında yapılabilir.' using errcode = '22023'; end if;
  if lower(btrim(k.urun)) <> lower(btrim(h.urun)) then raise exception 'Ürünler farklı (% / %).', k.urun, h.urun using errcode = '22023'; end if;
  if k.hedef_tur <> 'kg' or h.hedef_tur <> 'kg' then raise exception 'Devir yalnız tonaj hedefli siparişlerde yapılabilir.' using errcode = '22023'; end if;
  if h.durum <> 'acik' then raise exception 'Hedef sipariş açık değil (%).', h.durum using errcode = '23514'; end if;
  if k.durum = 'iptal' then raise exception 'İptal edilmiş siparişten devir yapılamaz.' using errcode = '23514'; end if;
  if v_kg <= 0 then raise exception 'Devir miktarı 0''dan büyük olmalı.' using errcode = '22023'; end if;
  select coalesce(sum(net_kg), 0) + k.devir_kg into v_yuklenen from public.ic_sevkler where is_emri_id = k.id;
  v_fazla := v_yuklenen - coalesce(k.hedef_kg, 0);
  if v_kg > v_fazla + 0.005 then
    raise exception 'Kaynak siparişin fazlası % kg; en fazla bu kadar aktarılabilir.', greatest(v_fazla, 0) using errcode = '22023';
  end if;

  perform set_config('ic.devir_izin', 'evet', true);
  update public.ic_is_emirleri set devir_kg = devir_kg - v_kg where id = k.id;
  update public.ic_is_emirleri set devir_kg = devir_kg + v_kg where id = h.id;
  perform set_config('ic.devir_izin', '', true);
  insert into public.ic_is_emri_devirleri (company_id, kaynak_id, hedef_id, miktar_kg, aciklama, olusturan_email)
    values (v_sirket, k.id, h.id, v_kg, nullif(btrim(coalesce(p_aciklama, '')), ''), lower(nullif(auth.jwt() ->> 'email', '')))
    returning id into v_id;
  return jsonb_build_object('id', v_id, 'kaynak', k.is_emri_no, 'hedef', h.is_emri_no, 'miktar_kg', v_kg);
end; $function$;

create or replace function public.ic_is_emri_devir_geri_al(p_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
  d public.ic_is_emri_devirleri%rowtype;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('ic_piyasa') then
    raise exception 'İç piyasa yetkiniz yok.' using errcode = '42501';
  end if;
  select * into d from public.ic_is_emri_devirleri where id = p_id and company_id = v_sirket for update;
  if not found then raise exception 'Devir kaydı bulunamadı.' using errcode = 'P0002'; end if;
  if d.geri_alindi is not null then raise exception 'Bu devir zaten geri alınmış.' using errcode = '23514'; end if;
  perform 1 from public.ic_is_emirleri where id in (d.kaynak_id, d.hedef_id) for update;
  perform set_config('ic.devir_izin', 'evet', true);
  update public.ic_is_emirleri set devir_kg = devir_kg + d.miktar_kg where id = d.kaynak_id;
  update public.ic_is_emirleri set devir_kg = devir_kg - d.miktar_kg where id = d.hedef_id;
  perform set_config('ic.devir_izin', '', true);
  update public.ic_is_emri_devirleri set geri_alindi = now(), geri_alan_email = lower(nullif(auth.jwt() ->> 'email', '')) where id = d.id;
  return jsonb_build_object('id', d.id, 'miktar_kg', d.miktar_kg);
end; $function$;

revoke all on function public.ic_is_emri_devir_ekle(uuid, uuid, numeric, text) from public, anon;
revoke all on function public.ic_is_emri_devir_geri_al(uuid) from public, anon;
grant execute on function public.ic_is_emri_devir_ekle(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.ic_is_emri_devir_geri_al(uuid) to authenticated;

-- 2) Kantar: yuklenen = arac toplami + devir (imza ayni)
create or replace function public.kantar_ic_is_emirleri()
 returns table(id uuid, is_emri_no text, musteri_maskeli text, urun text, ambalaj text, teslim text, hedef_tur text, hedef_kg numeric, hedef_arac integer, yuklenen_kg numeric, yuklenen_arac integer, olusturma timestamp with time zone)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  return query
    select e.id, e.is_emri_no, coalesce(nullif(btrim(m.kisa_ad), ''), m.unvan), e.urun, e.ambalaj, e.teslim,
           e.hedef_tur, e.hedef_kg, e.hedef_arac,
           (coalesce(sum(s.net_kg), 0) + e.devir_kg)::numeric, count(s.id)::integer, e.olusturma
    from public.ic_is_emirleri e
    join public.ic_musteriler m on m.id = e.musteri_id
    left join public.ic_sevkler s on s.is_emri_id = e.id
    where e.company_id = auth_company_id() and e.durum = 'acik'
    group by e.id, m.unvan, m.kisa_ad
    order by e.olusturma;
end; $function$;

-- 3) Kantar arac girisi: %5 asim uyarisi devri de sayar. Govde canlidaki haliyle AYNEN;
--    yalniz toplam satirinin arkasina "v_toplam_kg := v_toplam_kg + devir" eklenir.
--    Desen tam bir kez bulunmazsa migration HATA verir (yanlis yere yama yapilmaz).
do $$
declare
  v_eski text := pg_get_functiondef('public.kantar_ic_sevk_ekle(jsonb, boolean)'::regprocedure);
  v_yeni text;
begin
  if position('v_emir.devir_kg' in v_eski) > 0 then
    return; -- zaten uygulanmis (migration 2. kez)
  end if;
  v_yeni := regexp_replace(v_eski,
    '(into v_toplam_kg, v_toplam_arac\s+from public\.ic_sevkler where is_emri_id = v_emir\.id;)',
    E'\\1\n  v_toplam_kg := v_toplam_kg + coalesce(v_emir.devir_kg, 0); -- 04.11.2026 devir');
  if v_yeni = v_eski or (length(v_yeni) - length(replace(v_yeni, 'v_emir.devir_kg', ''))) <> length('v_emir.devir_kg') then
    raise exception 'kantar_ic_sevk_ekle: beklenen toplam satiri bulunamadi; yama uygulanmadi.';
  end if;
  execute v_yeni;
end $$;

-- 4) Kapanis raporu degerlerinde gerceklesen = arac toplami + devir (musteri mesaji AYNEN arac toplami)
do $$
declare
  v_eski text := pg_get_functiondef('public.ic_bildirim_is_emri()'::regprocedure);
  v_yeni text;
begin
  if position('new.devir_kg' in v_eski) > 0 then
    return;
  end if;
  v_yeni := regexp_replace(v_eski, '(\s)v_kg::text, v_adet::text,', '\1(v_kg + coalesce(new.devir_kg, 0))::text, v_adet::text,');
  if v_yeni = v_eski or (length(v_yeni) - length(replace(v_yeni, 'new.devir_kg', ''))) <> length('new.devir_kg') then
    raise exception 'ic_bildirim_is_emri: kapanis degerleri satiri bulunamadi; yama uygulanmadi.';
  end if;
  execute v_yeni;
end $$;

-- 5) Gunluk ic piyasa raporu: alicilar (virgulle <= 5) + tekrar korumasi
alter table public.ic_piyasa_ayarlari add column if not exists gunluk_rapor_eposta text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ic_piyasa_ayarlari_gunluk_rapor_eposta_bicim') then
    alter table public.ic_piyasa_ayarlari add constraint ic_piyasa_ayarlari_gunluk_rapor_eposta_bicim check (
      gunluk_rapor_eposta is null or (
        gunluk_rapor_eposta ~ '^[^\s@,]+@[^\s@,]+\.[^\s@,]+(,[^\s@,]+@[^\s@,]+\.[^\s@,]+)*$'
        and array_length(string_to_array(gunluk_rapor_eposta, ','), 1) <= 5));
  end if;
end $$;
comment on column public.ic_piyasa_ayarlari.gunluk_rapor_eposta is 'Gunluk ic piyasa raporu alicilari (virgulle, en fazla 5). Bos = gonderilmez (04.11.2026).';

update public.ic_piyasa_ayarlari set gunluk_rapor_eposta = 'mesensei282@gmail.com'
 where company_id = '387edff1-3aa6-41a4-a370-e42135017043' and gunluk_rapor_eposta is null;
-- Kullanici: kapanis e-postasi "kotu bir mail, kaldirabiliriz" -> kapatilir (tetikleyici ayar bossa uretmez)
update public.ic_piyasa_ayarlari set kapanis_eposta = null
 where company_id = '387edff1-3aa6-41a4-a370-e42135017043';

create table if not exists public.ic_gunluk_rapor_gonderimleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rapor_tarihi date not null,
  durum text not null check (durum in ('gonderiliyor', 'gonderildi')),
  alicilar text,
  ozet jsonb,
  gonderim_zamani timestamptz,
  -- TEST gonderimi (elle istenen): 19:00 otomatik raporu engellemez; gunde en fazla 3
  test boolean not null default false,
  olusturma timestamptz not null default now()
);
create unique index if not exists ic_gunluk_rapor_gonderimleri_tek on public.ic_gunluk_rapor_gonderimleri (company_id, rapor_tarihi) where not test;
alter table public.ic_gunluk_rapor_gonderimleri enable row level security;
revoke all on table public.ic_gunluk_rapor_gonderimleri from anon, authenticated;
-- Politika YOK: yalniz service_role (edge function).

-- 6) Zamanlama: her gun 16:00 UTC = 19:00 TR. Komut, mevcut "gunluk-rapor-aksam" isinden turetilir
--    (ayni proje adresi + ayni herkese acik anahtar; anahtar repoya YAZILMAZ). pg_cron yoksa atlanir.
do $$
declare
  v_komut text;
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron yok; ic-gunluk-rapor zamanlanmadi.';
    return;
  end if;
  select command into v_komut from cron.job where jobname = 'gunluk-rapor-aksam';
  if v_komut is null then
    raise notice 'gunluk-rapor-aksam isi yok; ic-gunluk-rapor zamanlanmadi.';
    return;
  end if;
  v_komut := replace(replace(v_komut, '/functions/v1/gunluk-rapor-gonder', '/functions/v1/ic-gunluk-rapor'), '{"slot":"aksam"}', '{}');
  if position('/functions/v1/ic-gunluk-rapor' in v_komut) = 0 or position('"slot"' in v_komut) > 0 then
    raise exception 'ic-gunluk-rapor komutu turetilemedi.';
  end if;
  perform cron.unschedule('ic-gunluk-rapor') where exists (select 1 from cron.job where jobname = 'ic-gunluk-rapor');
  perform cron.schedule('ic-gunluk-rapor', '0 16 * * *', v_komut);
end $$;
