-- ============================================================================
-- DIIB TAKIBI (Dahilde Isleme Izin Belgesi) - IHRACAT KISMI (04.11.2026)
-- ============================================================================
-- Kullanici: "Exceli Burak Bey bugune kadar manuel tutmus ... yeni yil icin
-- Sistemimizde takip edilmesini istiyorum. Ithalat kismini dikkate alma.
-- FATURA NO - BEYANNAME NO - FATURA TARIHI - CARI ISMI - STOK ADI - MIKTAR (KG)
-- - BIRIM FIYAT - TUTAR". Ayrica: DIIB'in kalani bir yuklemeye yetmezse
-- "tam bir sekilde kapatabilmek icin 2 ayri fatura olusturuluyor".
--
--   diib_belgeleri         : belge no / tarih / ithalat izni (kg bugday) /
--                            ihracat taahhudu (kg un = izin x 0,97 x 0,74,
--                            Excel'deki formul; elle duzeltilebilir) / kullanim sirasi.
--                            devir_kg / devir_tutar: sistem ONCESI (IHR-2026-0065'ten
--                            once) bu DIIB'e yazilmis ihracat - bir kez girilir.
--   diib_ihracatlari       : YALNIZ elle eklenen ya da duzeltilen satirlar. Kullanici:
--                            "Excelden iceriye alinmamali. Sistem bunu kendi takip etmeli."
--                            Faturasi kesilmis dosyalar KAYDA GEREK KALMADAN ekranda
--                            otomatik satir olur (lib/diib/hesap.ts); bu tabloda ayni
--                            fatura no / dosya varsa tablodaki satir esas alinir.
--   diib_dosya_bolunmeleri : bir yuklemenin iki DIIB'e (iki faturaya) bolunmesi
--                            (orn. 79.100 kg 04219 + 170.900 kg 02576).
-- Yetki: sirket + "ihracatlar" sayfa yetkisi (ic_sayfa_yetkisi). Yeni sayfa yetkisi YOK.
-- Sadece EKLEME: mevcut tablo / veri degismez. depositors / contact_messages
-- tablolarina dokunmaz. Tekrar calistirilabilir.
-- ============================================================================

create table if not exists public.diib_belgeleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  belge_no text not null,                 -- "2026/D2-04219" (kullanicinin yazdigi gibi)
  anahtar text not null,                  -- "2026-04219": yil + 5 hane sira (eslestirme)
  belge_tarihi date,
  ithalat_izin_kg numeric(14, 2) not null,
  ihracat_taahhut_kg numeric(14, 2) not null,
  devir_kg numeric(14, 2) not null default 0,
  devir_tutar numeric(16, 2) not null default 0,
  kullanim_sirasi integer not null default 100,
  durum text not null default 'aktif',
  aciklama text,
  olusturan_email text,
  guncelleyen_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint diib_belge_no_check check (char_length(btrim(belge_no)) between 4 and 40),
  constraint diib_anahtar_check check (anahtar ~ '^[0-9]{4}-[0-9]{5}$'),
  constraint diib_miktar_check check (ithalat_izin_kg > 0 and ithalat_izin_kg <= 1000000000
    and ihracat_taahhut_kg > 0 and ihracat_taahhut_kg <= 1000000000),
  constraint diib_devir_check check (devir_kg >= 0 and devir_kg <= 1000000000 and devir_tutar >= 0),
  constraint diib_sira_check check (kullanim_sirasi between 0 and 10000),
  constraint diib_durum_check check (durum in ('aktif', 'tamamlandi')),
  constraint diib_aciklama_check check (aciklama is null or char_length(aciklama) <= 500)
);
create unique index if not exists diib_belgeleri_anahtar_tekil on public.diib_belgeleri (company_id, anahtar);
-- Alt tablolar ayni sirketin DIIB'ine baglanabilsin diye (id, company_id) bilesik anahtari
create unique index if not exists diib_belgeleri_id_sirket on public.diib_belgeleri (id, company_id);

create table if not exists public.diib_ihracatlari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  diib_id uuid not null,
  dosya_id uuid references public.ihracat_dosyalari(id) on delete set null,
  fatura_no text,
  beyanname_no text,
  fatura_tarihi date,
  cari text not null,
  stok_adi text not null default 'BUĞDAY UNU',
  miktar_kg numeric(14, 2) not null,
  birim_fiyat numeric(14, 6),
  tutar numeric(16, 2) not null default 0,
  para_birimi text not null default 'USD',
  kaynak text not null default 'elle',
  aciklama text,
  olusturan_email text,
  guncelleyen_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint diib_ihr_fatura_check check (fatura_no is null or char_length(btrim(fatura_no)) between 3 and 40),
  constraint diib_ihr_beyan_check check (beyanname_no is null or char_length(btrim(beyanname_no)) between 3 and 40),
  constraint diib_ihr_cari_check check (char_length(btrim(cari)) between 1 and 200),
  constraint diib_ihr_stok_check check (char_length(btrim(stok_adi)) between 1 and 120),
  constraint diib_ihr_miktar_check check (miktar_kg > 0 and miktar_kg <= 100000000),
  constraint diib_ihr_tutar_check check (tutar >= 0 and (birim_fiyat is null or birim_fiyat >= 0)),
  constraint diib_ihr_para_check check (para_birimi in ('USD', 'EUR')),
  constraint diib_ihr_kaynak_check check (kaynak in ('sistem', 'elle')),
  constraint diib_ihr_aciklama_check check (aciklama is null or char_length(aciklama) <= 500),
  constraint diib_ihr_diib_fk foreign key (diib_id, company_id) references public.diib_belgeleri (id, company_id) on delete cascade
);
-- Bir fatura TEK satir (bolunen yuklemede iki fatura = iki farkli fatura no)
create unique index if not exists diib_ihracatlari_fatura_tekil on public.diib_ihracatlari (company_id, upper(btrim(fatura_no))) where fatura_no is not null;
create unique index if not exists diib_ihracatlari_dosya_tekil on public.diib_ihracatlari (dosya_id, diib_id) where dosya_id is not null;
create index if not exists diib_ihracatlari_diib_idx on public.diib_ihracatlari (diib_id, fatura_tarihi);

create table if not exists public.diib_dosya_bolunmeleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dosya_id uuid not null references public.ihracat_dosyalari(id) on delete cascade,
  diib_id uuid not null,
  sira integer not null,
  miktar_kg numeric(14, 2) not null,
  fatura_no text,
  olusturan_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint diib_bol_sira_check check (sira between 1 and 5),
  constraint diib_bol_miktar_check check (miktar_kg > 0 and miktar_kg <= 100000000),
  constraint diib_bol_fatura_check check (fatura_no is null or char_length(btrim(fatura_no)) between 3 and 40),
  constraint diib_bol_diib_fk foreign key (diib_id, company_id) references public.diib_belgeleri (id, company_id) on delete cascade
);
create unique index if not exists diib_dosya_bolunmeleri_tekil on public.diib_dosya_bolunmeleri (dosya_id, diib_id);
create unique index if not exists diib_dosya_bolunmeleri_sira on public.diib_dosya_bolunmeleri (dosya_id, sira);

comment on table public.diib_belgeleri is 'DIIB belgeleri - ihracat taahhudu takibi (04.11.2026).';
comment on table public.diib_ihracatlari is 'DIIB ihracat satirlari: yalniz elle eklenen / duzeltilen. Faturali dosyalar ekranda otomatik satir olur (04.11.2026).';
comment on table public.diib_dosya_bolunmeleri is 'Yuklemenin DIIB''lere bolunmesi = ayri faturalar (04.11.2026).';

-- ---- updated_at + denetim ----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['diib_belgeleri', 'diib_ihracatlari', 'diib_dosya_bolunmeleri'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'trg_' || t || '_updated_at', t);
    execute format('drop trigger if exists %I on public.%I', 'denetim_' || t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.denetim_tetikleyici()', 'denetim_' || t, t);
  end loop;
end $$;

-- ---- RLS: sirket + "ihracatlar" sayfa yetkisi --------------------------------
do $$
declare t text; k text;
begin
  foreach t in array array['diib_belgeleri', 'diib_ihracatlari', 'diib_dosya_bolunmeleri'] loop
    execute format('alter table public.%I enable row level security', t);
    foreach k in array array['select', 'insert', 'update', 'delete'] loop
      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_' || k) then
        if k = 'select' or k = 'delete' then
          execute format('create policy %I on public.%I for %s using ((company_id = auth_company_id()) and ic_sayfa_yetkisi(''ihracatlar''))', t || '_' || k, t, k);
        elsif k = 'insert' then
          execute format('create policy %I on public.%I for insert with check ((company_id = auth_company_id()) and ic_sayfa_yetkisi(''ihracatlar''))', t || '_' || k, t);
        else
          execute format('create policy %I on public.%I for update using ((company_id = auth_company_id()) and ic_sayfa_yetkisi(''ihracatlar'')) with check ((company_id = auth_company_id()) and ic_sayfa_yetkisi(''ihracatlar''))', t || '_' || k, t);
        end if;
      end if;
    end loop;
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;
