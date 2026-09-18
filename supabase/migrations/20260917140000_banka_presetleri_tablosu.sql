-- Kullanicinin kendi kaydettigi banka hesap presetlerini (Hizli Doldur
-- kartlari) saklar. Sirket bazli izole edilmistir (company_id + RLS),
-- fumigation_ayarlari tablosuyla BIREBIR AYNI guvenlik modeli kullanilir.

create table if not exists public.banka_presetleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  goruntulenen_ad text not null,
  hesap_adi text,
  banka text,
  swift text,
  hesap_numarasi text,
  iban text,
  created_by uuid default auth.uid(),
  created_at timestamp without time zone default now()
);

alter table public.banka_presetleri enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'banka_presetleri' and policyname = 'banka_presetleri_select_own_company') then
    create policy banka_presetleri_select_own_company
      on public.banka_presetleri for select
      using (company_id = auth_company_id());
  end if;

  if not exists (select 1 from pg_policies where tablename = 'banka_presetleri' and policyname = 'banka_presetleri_insert_own_company') then
    create policy banka_presetleri_insert_own_company
      on public.banka_presetleri for insert
      with check (company_id = auth_company_id());
  end if;

  if not exists (select 1 from pg_policies where tablename = 'banka_presetleri' and policyname = 'banka_presetleri_update_own_company') then
    create policy banka_presetleri_update_own_company
      on public.banka_presetleri for update
      using (company_id = auth_company_id())
      with check (company_id = auth_company_id());
  end if;

  if not exists (select 1 from pg_policies where tablename = 'banka_presetleri' and policyname = 'banka_presetleri_delete_own_company') then
    create policy banka_presetleri_delete_own_company
      on public.banka_presetleri for delete
      using (company_id = auth_company_id());
  end if;
end $$;

create index if not exists idx_banka_presetleri_company_id on public.banka_presetleri (company_id);
