-- ============================================================================
-- GUNLUK SEVKIYAT RAPORU: GONDERIM KAYDI (07.10.2026)
-- ============================================================================
-- gunluk-rapor-gonder edge function'i her (rapor_tarihi, slot, sirket) icin
-- burada tek satir acar. Benzersiz anahtar sayesinde ayni rapor ikinci kez
-- gonderilmez (cron anon anahtarla cagirir; tekrar/istismar korumasi).
-- Gonderim basarisiz olursa satir silinir, sonraki deneme gonderebilir.
-- slot: 'sabah' (08:00, dunun raporu) | 'aksam' (17:00, bugunun raporu)
-- RLS acik, POLITIKA YOK -> sadece service_role (edge function) erisir.
-- Gecici/iz kaydi oldugu icin gece yedegine dahil edilmez.
-- ============================================================================
create table if not exists public.rapor_gonderimleri (
  id uuid primary key default gen_random_uuid(),
  rapor_tarihi date not null,
  slot text not null check (slot in ('sabah', 'aksam')),
  company_id uuid not null references public.companies(id) on delete cascade,
  durum text not null default 'gonderiliyor' check (durum in ('gonderiliyor', 'gonderildi')),
  alicilar text,
  ozet jsonb,
  gonderim_zamani timestamptz,
  olusturma timestamptz not null default now(),
  constraint rapor_gonderimleri_benzersiz unique (rapor_tarihi, slot, company_id)
);

create index if not exists rapor_gonderimleri_company_idx on public.rapor_gonderimleri (company_id);

alter table public.rapor_gonderimleri enable row level security;

revoke all on table public.rapor_gonderimleri from anon, authenticated;
grant all on table public.rapor_gonderimleri to service_role;
