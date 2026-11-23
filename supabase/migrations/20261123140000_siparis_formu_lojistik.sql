-- 23.11.2026 SIPARIS BILDIRIM FORMU - LOJISTIK SECIMI. Kullanici: "Harun Bey simdiye kadar gonderdiklerini manuel olarak Excel
-- indirip gonderdigi icin takibi saglanamadi. Onayi ve rezervasyonu alinmis yuklemeler Suleyman Bey'e mail gitse; Suleyman Bey
-- oradan siparis bildirim formu gonderilmesi gerekenleri secse. Guncel yukleme planindan; su an yuklenenleri dahil etme."
-- Secimler: hafta ici her sabah; ilk konteyner tartilinca (DBA) listeden cikar; ilk etapta yalniz sensei test adresi; canlida
-- secilen formlar uretim@ + CC (Rapor Alicilari > Siparis Bildirim Formu) adreslerine gider.
--  1) rapor_alicilari: 'siparis_formu_lojistik' (alici lojistik@, CANLI KAPALI: liste maili ve secilen formlar yalniz test adresine).
--  2) siparis_formu_secimleri: maildeki girissiz secim sayfasinin token'i (3 gun). Istemciye kapali (yalniz edge / service_role).
--  3) siparis_formu_tartilanlar(sirket): en az bir konteyneri tartilmis (DBA kaydi olan) booking anahtarlari.
--  4) pg_cron 'siparis-formu-lojistik': hafta ici 05:27 UTC = 08:27 TR. Edge yalniz CANLI iken gonderir (test elle istenir).
-- Mevcut kayitlar degismez.

-- 1) Rapor alicilari ------------------------------------------------------------------------------------------------------
alter table public.rapor_alicilari drop constraint if exists rapor_alicilari_rapor_check;
alter table public.rapor_alicilari add constraint rapor_alicilari_rapor_check check (rapor in (
  'siparis', 'navlun', 'navlun_haftalik', 'fatura_onay', 'fatura_dagitim', 'musteri_durum',
  'gunluk_ihracat', 'diib', 'vgm', 'konsimento_hatirlatma', 'pazar_gorev', 'satin_alma', 'siparis_formu', 'siparissiz',
  'siparis_formu_lojistik'));

create or replace function public.rapor_alicilari_liste()
returns table (rapor text, alicilar text[], cc text[], canli boolean, kayitli boolean, guncelleyen text, guncelleme timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
begin
  return query
    select r.rapor, coalesce(a.alicilar, '{}'::text[]), coalesce(a.cc, '{}'::text[]), coalesce(a.canli, false), a.rapor is not null,
           a.guncelleyen, a.guncelleme
    from unnest(array['gunluk_ihracat', 'siparis', 'navlun', 'navlun_haftalik', 'diib', 'vgm', 'konsimento_hatirlatma', 'fatura_onay',
                      'fatura_dagitim', 'siparis_formu', 'siparis_formu_lojistik', 'pazar_gorev', 'siparissiz', 'musteri_durum', 'satin_alma'])
         with ordinality as r(rapor, sira)
    left join public.rapor_alicilari a on a.company_id = v_sirket and a.rapor = r.rapor
    order by r.sira;
end;
$$;

create or replace function public.rapor_alicilari_kaydet(p_rapor text, p_alicilar text[], p_cc text[], p_canli boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
  v_liste text[];
  v_cc text[];
begin
  if p_rapor not in ('siparis', 'navlun', 'navlun_haftalik', 'fatura_onay', 'fatura_dagitim', 'musteri_durum',
                     'gunluk_ihracat', 'diib', 'vgm', 'konsimento_hatirlatma', 'pazar_gorev', 'satin_alma', 'siparis_formu', 'siparissiz',
                     'siparis_formu_lojistik') then
    raise exception 'Bilinmeyen rapor.';
  end if;
  v_liste := public.rapor_adres_temizle(p_alicilar, 'Alıcı');
  v_cc := array(select x from unnest(public.rapor_adres_temizle(p_cc, 'CC')) x where not (x = any (v_liste)));
  -- Alicisi raporun kendisinden gelenler: musteri_durum (musteri), pazar_gorev (ekip)
  if p_rapor not in ('musteri_durum', 'pazar_gorev') and coalesce(array_length(v_liste, 1), 0) = 0
     and (p_canli or p_rapor in ('gunluk_ihracat', 'diib', 'vgm', 'konsimento_hatirlatma', 'satin_alma')) then
    raise exception 'En az bir alıcı gerekli.';
  end if;
  insert into public.rapor_alicilari (company_id, rapor, alicilar, cc, canli, guncelleyen, guncelleme)
  values (v_sirket, p_rapor, v_liste, v_cc, coalesce(p_canli, false), lower(coalesce(auth.jwt() ->> 'email', '')), now())
  on conflict (company_id, rapor) do update
    set alicilar = excluded.alicilar, cc = excluded.cc, canli = excluded.canli, guncelleyen = excluded.guncelleyen, guncelleme = now();
end;
$$;

-- Baslangic: alici lojistik@ (Suleyman Bey), CC yok, CANLI KAPALI. Siparis formu ayari olan sirketler.
insert into public.rapor_alicilari (company_id, rapor, alicilar, cc, canli, guncelleyen, guncelleme)
select a.company_id, 'siparis_formu_lojistik', array['lojistik@unex.com.tr'], '{}'::text[], false, 'kurulum (23.11.2026)', now()
from public.rapor_alicilari a
where a.rapor = 'siparis_formu'
on conflict (company_id, rapor) do nothing;

-- 2) Secim sayfasi token'lari ---------------------------------------------------------------------------------------------
create table if not exists public.siparis_formu_secimleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{32}$'),
  tarih date not null,
  test boolean not null default false,
  alici text,
  booking_sayisi integer not null default 0,
  gecerlilik timestamptz not null,
  olusturma timestamptz not null default now()
);
alter table public.siparis_formu_secimleri enable row level security;
revoke all on public.siparis_formu_secimleri from anon, authenticated;
-- zamanlanmis (canli) liste sirket + gun icin tek
create unique index if not exists siparis_formu_secimleri_gun_tek on public.siparis_formu_secimleri (company_id, tarih) where not test;

-- 3) Yuklemesi baslamis (ilk konteyneri tartilmis) bookingler --------------------------------------------------------------
create or replace function public.siparis_formu_tartilanlar(p_company uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(distinct public.booking_anahtar(r.booking_no)), '{}'::text[])
    from public.konteynerler k
    join public.rezervasyonlar r on r.id = k.rezervasyon_id
    join public.ihracat_dosyalari d on d.id = r.dosya_id
   where d.company_id = p_company
     and nullif(btrim(r.booking_no), '') is not null
     and (nullif(btrim(k.dba_belge_no), '') is not null or k.dba_yukleme_tarihi is not null);
$$;
revoke all on function public.siparis_formu_tartilanlar(uuid) from public, anon, authenticated;
grant execute on function public.siparis_formu_tartilanlar(uuid) to service_role;

-- 4) Zamanlama: siparis raporunun komutundan turetilir (ayni anon cagri), hafta ici 05:27 UTC -------------------------------
do $$
declare v_komut text;
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron yok; zamanlanmadi.';
    return;
  end if;
  select command into v_komut from cron.job where jobname = 'siparis-rapor-sabah' limit 1;
  if v_komut is null or position('/functions/v1/siparis-rapor''' in v_komut) = 0 or position('''{}''::jsonb' in v_komut) = 0 then
    raise notice 'siparis-rapor-sabah beklenen bicimde degil; lojistik listesi zamanlanmadi.';
    return;
  end if;
  v_komut := replace(v_komut, '/functions/v1/siparis-rapor''', '/functions/v1/siparis-formu''');
  v_komut := replace(v_komut, '''{}''::jsonb', '''{"islem": "lojistik_ozet"}''::jsonb');
  perform cron.unschedule(j.jobname) from cron.job j where j.jobname = 'siparis-formu-lojistik';
  perform cron.schedule('siparis-formu-lojistik', '27 5 * * 1-5', v_komut);
end $$;
