-- ============================================================================
-- PROFORMA OLUSTURUCU - KAYITLI PROFORMALAR (03.11.2026)
-- ============================================================================
-- Kullanici: "Hazirlanan proformalar kayitli kalmali ve duzenlenebilmeli."
--   proformalar : Proforma Olustur ekraninin TAMAMI (taslak jsonb = ProformaTaslak,
--                 lib/proforma/belge.ts) + listede gosterilen ozet kolonlar.
--                 Proforma no sirket icinde TEKIL. PDF her zaman taslaktan yeniden
--                 uretilir (dosya saklanmaz). Her degisiklik denetim kaydina duser.
-- Yetki: ihracat_musterileri / ihracat_urunleri ile AYNI (sirket +
-- ic_sayfa_yetkisi('proformalar')).
--
-- Sadece EKLEME: mevcut tablo / veri degismez. depositors / contact_messages
-- tablolarina dokunmaz. Tekrar calistirilabilir.
-- ============================================================================

create table if not exists public.proformalar (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  proforma_no text not null,
  alici_unvan text not null,
  tarih date not null,
  para_birimi text not null default 'USD',
  toplam numeric(14, 2) not null default 0,
  toplam_mts numeric(12, 3) not null default 0,
  taslak jsonb not null,                    -- ProformaTaslak (ekranin tamami)
  olusturan uuid default auth.uid(),
  olusturan_email text,
  guncelleyen_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proformalar_no_check check (char_length(btrim(proforma_no)) between 4 and 40 and proforma_no = upper(btrim(proforma_no))),
  constraint proformalar_unvan_check check (char_length(btrim(alici_unvan)) between 2 and 200),
  constraint proformalar_para_check check (para_birimi in ('USD', 'EUR')),
  constraint proformalar_tutar_check check (toplam >= 0 and toplam_mts >= 0),
  constraint proformalar_taslak_check check (jsonb_typeof(taslak) = 'object' and pg_column_size(taslak) <= 200000),
  constraint proformalar_eposta_check check (
    (olusturan_email is null or char_length(olusturan_email) <= 200)
    and (guncelleyen_email is null or char_length(guncelleyen_email) <= 200))
);

create unique index if not exists proformalar_no_tekil on public.proformalar (company_id, proforma_no);
create index if not exists proformalar_guncelleme_idx on public.proformalar (company_id, updated_at desc);

comment on table public.proformalar is 'Proforma Olustur kayitlari (03.11.2026). taslak = ekranin tamami; PDF taslaktan uretilir.';

-- ---- updated_at + denetim ----------------------------------------------------
drop trigger if exists trg_proformalar_updated_at on public.proformalar;
create trigger trg_proformalar_updated_at before update on public.proformalar
  for each row execute function public.set_updated_at();
drop trigger if exists denetim_proformalar on public.proformalar;
create trigger denetim_proformalar after insert or update or delete on public.proformalar
  for each row execute function public.denetim_tetikleyici();

-- ---- RLS: sirket + "proformalar" sayfa yetkisi --------------------------------
alter table public.proformalar enable row level security;

do $$
declare k text;
begin
  foreach k in array array['select', 'insert', 'update', 'delete'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'proformalar' and policyname = 'proformalar_' || k) then
      if k = 'select' or k = 'delete' then
        execute format('create policy %I on public.proformalar for %s using ((company_id = auth_company_id()) and ic_sayfa_yetkisi(''proformalar''))', 'proformalar_' || k, k);
      elsif k = 'insert' then
        execute 'create policy proformalar_insert on public.proformalar for insert with check ((company_id = auth_company_id()) and ic_sayfa_yetkisi(''proformalar''))';
      else
        execute 'create policy proformalar_update on public.proformalar for update using ((company_id = auth_company_id()) and ic_sayfa_yetkisi(''proformalar'')) with check ((company_id = auth_company_id()) and ic_sayfa_yetkisi(''proformalar''))';
      end if;
    end if;
  end loop;
end $$;

revoke all on table public.proformalar from anon;
grant select, insert, update, delete on table public.proformalar to authenticated;
