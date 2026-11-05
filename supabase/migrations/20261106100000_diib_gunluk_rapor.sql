-- 06.11.2026: DIIB gunluk raporu (17:00) gonderim kaydi. Kullanici: "DIIB takibi icin ihracat ve ic piyasa
-- raporu gibi bir rapor; her gun aksam 17:00." Edge function: diib-gunluk-rapor (service_role yazar).
-- Zamanlanmis gonderim (elle = false) sirket + gun icin TEK kayit; elle / test gonderimleri sinirsiz kayit.
create table if not exists public.diib_rapor_gonderimleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rapor_tarihi date not null,
  durum text not null default 'gonderiliyor' check (durum in ('gonderiliyor', 'gonderildi')),
  test boolean not null default false,
  elle boolean not null default false,
  alicilar text check (alicilar is null or char_length(alicilar) <= 1000),
  ozet jsonb,
  olusturma timestamptz not null default now(),
  gonderim_zamani timestamptz
);
create unique index if not exists diib_rapor_gonderimleri_gun_uniq
  on public.diib_rapor_gonderimleri (company_id, rapor_tarihi) where not elle;
create index if not exists diib_rapor_gonderimleri_sirket_idx on public.diib_rapor_gonderimleri (company_id, olusturma desc);

-- Yalniz service_role (edge function) erisir; uygulama okumaz.
alter table public.diib_rapor_gonderimleri enable row level security;
revoke all on public.diib_rapor_gonderimleri from anon, authenticated;

-- Zamanlama: her gun 14:00 UTC = 17:00 TR ('diib-gunluk-rapor'). Anahtar repoya YAZILMAZ: komut mevcut
-- 'ic-gunluk-rapor-aksam' isinden turetilir (yalniz fonksiyon adi degisir). Canliya 06.11.2026'da uygulandi.
do $$
declare v_komut text;
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron yok; zamanlanmadi.';
    return;
  end if;
  select command into v_komut from cron.job where jobname = 'ic-gunluk-rapor-aksam' limit 1;
  if v_komut is null then
    raise notice 'ic-gunluk-rapor-aksam bulunamadi; diib-gunluk-rapor zamanlanmadi.';
    return;
  end if;
  v_komut := replace(v_komut, '/functions/v1/ic-gunluk-rapor''', '/functions/v1/diib-gunluk-rapor''');
  perform cron.unschedule(j.jobname) from cron.job j where j.jobname = 'diib-gunluk-rapor';
  perform cron.schedule('diib-gunluk-rapor', '0 14 * * *', v_komut);
end $$;
