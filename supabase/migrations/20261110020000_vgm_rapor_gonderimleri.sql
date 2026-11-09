-- ============================================================================
-- VGM RAPORU MAILI: gonderim kaydi (10.11.2026)
-- ============================================================================
-- Kullanici: "VGM raporunda toplam butun konteynerlerin VGM'i hazir oldugunda operation mailine VGM raporu
-- gonderilsin. Mailde VGM indir butonu olsun." Edge fonksiyonu vgm-rapor (pg_cron) dosya basina BIR KEZ gonderir.
--   durum: gonderildi | onceden (canliya gecerken zaten tamam olan dosya, mail atilmaz) | test | hata
-- Ayni dosya icin 'gonderildi'/'onceden' tek satir (kismi benzersiz index) -> cift mail olmaz.
-- Yalniz service_role yazar/okur (RLS acik, politika yok).
-- ============================================================================

create table if not exists public.vgm_rapor_gonderimleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dosya_id uuid not null references public.ihracat_dosyalari(id) on delete cascade,
  durum text not null check (durum in ('gonderildi', 'onceden', 'test', 'hata')),
  alicilar text[] not null default '{}',
  konteyner_sayisi integer,
  pdf_yolu text,
  mesaj_id text,
  hata text,
  olusturma timestamptz not null default now()
);
comment on table public.vgm_rapor_gonderimleri is 'VGM raporu maili gonderim kaydi (edge vgm-rapor). 10.11.2026';

create unique index if not exists vgm_rapor_gonderimleri_tek
  on public.vgm_rapor_gonderimleri (dosya_id) where durum in ('gonderildi', 'onceden');
create index if not exists vgm_rapor_gonderimleri_dosya on public.vgm_rapor_gonderimleri (dosya_id, olusturma desc);

alter table public.vgm_rapor_gonderimleri enable row level security;
revoke all on public.vgm_rapor_gonderimleri from anon, authenticated;
