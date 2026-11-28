-- ============================================================================
-- HAT TAKIP Asama 4 (28.11.2026): Sefer Ara - Hapag-Lloyd Commercial Schedules onbellegi
-- ============================================================================
-- Kullanici: "Gemi listeleri ile beraber gelecek ... png olarak kopyalanabilip musteriye gorsel olarak iletilebilmeli."
-- hat_sefer_aramalari: her basarili / basarisiz Hapag sorgusunun sade sonucu (rotalar = _shared/hat-sefer.ts Sefer[]).
--   Ayni rota + ayni baslangic gunu 6 saat icinde tekrar sorulmaz (edge hat-takip "sefer_ara"); kota: Tryout 50 / saat,
--   1 / sn (cagri izi hat_takip_cagrilari, api = 'cs').
-- Yazma YALNIZ edge (service_role). Okuma: kendi sirketi + "etd_eta" sayfa yetkisi. Musteri verisi icermez
-- (yalniz liman kodlari, gemi / sefer / tarih). Mevcut tablolara dokunmaz.
-- ============================================================================

create table if not exists public.hat_sefer_aramalari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  hat text not null default 'HLCU',
  pol text not null check (pol ~ '^[A-Z]{2}[A-Z0-9]{3}$'),
  pod text not null check (pod ~ '^[A-Z]{2}[A-Z0-9]{3}$'),
  bas_gun date not null,
  bit_gun date not null check (bit_gun >= bas_gun and bit_gun <= bas_gun + 60),
  sorgu_zamani timestamptz not null default now(),
  durum_kodu integer,
  sure_ms integer,
  rota_sayisi integer not null default 0,
  rotalar jsonb not null default '[]'::jsonb check (jsonb_typeof(rotalar) = 'array'),
  hata text check (hata is null or char_length(hata) <= 500),
  sorgulayan uuid
);

create index if not exists hat_sefer_aramalari_rota_idx
  on public.hat_sefer_aramalari (company_id, pol, pod, bas_gun, sorgu_zamani desc);

alter table public.hat_sefer_aramalari enable row level security;

drop policy if exists hat_sefer_aramalari_okuma on public.hat_sefer_aramalari;
create policy hat_sefer_aramalari_okuma on public.hat_sefer_aramalari
  for select to authenticated
  using (company_id = public.auth_company_id() and public.ic_sayfa_yetkisi('etd_eta'));

revoke insert, update, delete on public.hat_sefer_aramalari from anon, authenticated;
grant select on public.hat_sefer_aramalari to authenticated;

comment on table public.hat_sefer_aramalari is
  'Hat Takip Asama 4 (28.11.2026): Hapag-Lloyd sefer programi onbellegi. Yazma yalniz edge hat-takip (service_role).';
