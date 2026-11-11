-- 11.11.2026: NAVLUN TABLOSU test maili gonderim kaydi. Kullanici: "Navlun raporu icin ayni sablonda mevcut
-- bilgilerimiz ile doldurmamiz mumkun mudur? Excel indir ile boyle bir sablon olusturabilmeliyiz ve test maili ile
-- gonderebilmeliyiz." Edge function: navlun-tablosu (service_role yazar). Zamanlanmis gonderim YOK (cron yok);
-- kayit yalniz gunluk test siniri (sirket basina 24 saatte 5) ve denetim icin.
create table if not exists public.navlun_tablosu_gonderimleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rapor_tarihi date not null,
  durum text not null default 'gonderiliyor' check (durum in ('gonderiliyor', 'gonderildi')),
  test boolean not null default true,
  elle boolean not null default false,
  alicilar text check (alicilar is null or char_length(alicilar) <= 1000),
  ozet jsonb,
  olusturma timestamptz not null default now(),
  gonderim_zamani timestamptz
);
create index if not exists navlun_tablosu_gonderimleri_sirket_idx on public.navlun_tablosu_gonderimleri (company_id, olusturma desc);

-- Yalniz service_role (edge function) erisir; uygulama okumaz.
alter table public.navlun_tablosu_gonderimleri enable row level security;
revoke all on public.navlun_tablosu_gonderimleri from anon, authenticated;
