-- ============================================================================
-- PROFORMA OLUSTURUCU - 1. ASAMA: VERI TEMELI (17.10.2026)
-- ============================================================================
-- Proforma sihirbazinin (2. asama) hizli ve hatasiz doldurulmasi icin:
--   ihracat_musterileri : ihracat alici kartlari (alici kodu, unvan/adres,
--                         ilgili kisi blogu, varsayilan teslim / liman / banka /
--                         odeme / sevkiyat ifadesi, evrak listesi)
--   ihracat_urunleri    : urun kutuphanesi ("DESCRIPTION OF GOODS"; marka ayri girilir)
--   proforma_ayarlari   : sirket bazli sablon metinleri (ozel sartlar, varsayilan
--                         evrak listesi, ust / alt bilgi). NULL = uygulamadaki
--                         varsayilan (taslak sablondaki metin, kesin yazim
--                         hatalari duzeltilmis).
-- Yetki: sayfa_yetkileri.proformalar (sayfa) ve sayfa_yetkileri.proforma_imza
-- (2. asamada "Onayla ve Imzala"; SADECE ihracat@unex.com.tr - Harun Bey).
--
-- Sadece EKLEME: mevcut tablo / veri degismez (yalnizca kullanici_yetkileri'ne
-- iki yeni anahtar eklenir; mevcut anahtarlara dokunulmaz). depositors /
-- contact_messages tablolarina dokunmaz. Tekrar calistirilabilir.
-- ============================================================================

-- ---- Yardimci: jsonb metin dizisi dogrulama (1-40 eleman, her biri 1-1000 karakter)
create or replace function public.proforma_metin_dizisi_gecerli(v jsonb, enaz int default 1, encok int default 40)
 returns boolean
 language sql
 immutable
 set search_path to 'public'
as $function$
  select v is null or (
    jsonb_typeof(v) = 'array'
    and jsonb_array_length(v) between enaz and encok
    and not exists (
      select 1 from jsonb_array_elements(v) e
      where jsonb_typeof(e) <> 'string' or char_length(btrim(e #>> '{}')) not between 1 and 1000
    )
  );
$function$;

-- ---- 1) Ihracat musteri kartlari ------------------------------------------
create table if not exists public.ihracat_musterileri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kod text not null,                       -- proforma no'daki alici kodu: UNEX + KOD + GGAAYY
  unvan text not null,
  adres text,                              -- cok satirli; proformada BUYER altinda
  ilgili_kisi text,                        -- cok satirli ATTENTION TO blogu (ad, TEL, EMAIL, POC)
  eposta text,                             -- alici e-postalari (virgulle); draft maili icin
  teslim_sekli text,                       -- CIF / CFR / FOB ...
  varis_limani text,                       -- "DJIBOUTI PORT"
  teslim_ifadesi text,                     -- proformada aynen: "CIF DJIBOUTI PORT BASIS"
  banka text,                              -- denizbank / vakifbank / ziraat
  para_birimi text not null default 'USD',
  odeme_sekli text,                        -- PAYMENT TERMS (son kullanilan)
  sevkiyat_metni text,                     -- SHIPMENT METHOD (son kullanilan)
  evraklar jsonb,                          -- evrak listesi; NULL = varsayilan liste
  notlar text,
  aktif boolean not null default true,
  olusturan uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ihracat_musterileri_kod_check check (kod ~ '^[A-Z]{2,6}$'),
  constraint ihracat_musterileri_unvan_check check (char_length(btrim(unvan)) between 2 and 200),
  constraint ihracat_musterileri_banka_check check (banka is null or banka in ('denizbank', 'vakifbank', 'ziraat')),
  constraint ihracat_musterileri_para_check check (para_birimi in ('USD', 'EUR')),
  constraint ihracat_musterileri_evraklar_check check (public.proforma_metin_dizisi_gecerli(evraklar, 1, 30))
);

create unique index if not exists ihracat_musterileri_kod_tekil on public.ihracat_musterileri (company_id, kod);
create unique index if not exists ihracat_musterileri_unvan_tekil on public.ihracat_musterileri (company_id, lower(btrim(unvan)));

-- ---- 2) Urun kutuphanesi ----------------------------------------------------
create table if not exists public.ihracat_urunleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ad text not null,                        -- "PREMIUM QUALITY WHEAT FLOUR" (marka HARIC)
  varsayilan_ambalaj_kg numeric not null default 25,
  sira int not null default 0,
  aktif boolean not null default true,
  olusturan uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ihracat_urunleri_ad_check check (char_length(btrim(ad)) between 2 and 300),
  constraint ihracat_urunleri_ambalaj_check check (varsayilan_ambalaj_kg > 0 and varsayilan_ambalaj_kg <= 1000)
);

create unique index if not exists ihracat_urunleri_ad_tekil on public.ihracat_urunleri (company_id, lower(btrim(ad)));

-- ---- 3) Proforma sablon ayarlari (sirket basina tek satir) ------------------
create table if not exists public.proforma_ayarlari (
  company_id uuid primary key references public.companies(id) on delete cascade,
  ozel_sartlar jsonb,                      -- SPECIAL CONDITIONS maddeleri; NULL = varsayilan
  evraklar jsonb,                          -- varsayilan SHIPPING DOCUMENTS; NULL = varsayilan
  alt_bilgi jsonb,                         -- 1. sayfa alt bilgi satirlari; NULL = varsayilan
  ust_bilgi_tarih text,                    -- 2-3. sayfa sag ust "Date: 28/09/26"; NULL = varsayilan
  ust_bilgi_revizyon text,                 -- "Revision n°: 01"; NULL = varsayilan
  updated_at timestamptz not null default now(),
  guncelleyen uuid default auth.uid(),
  constraint proforma_ayarlari_ozel_check check (public.proforma_metin_dizisi_gecerli(ozel_sartlar, 1, 30)),
  constraint proforma_ayarlari_evrak_check check (public.proforma_metin_dizisi_gecerli(evraklar, 1, 30)),
  constraint proforma_ayarlari_alt_check check (public.proforma_metin_dizisi_gecerli(alt_bilgi, 1, 6)),
  constraint proforma_ayarlari_tarih_check check (ust_bilgi_tarih is null or char_length(btrim(ust_bilgi_tarih)) between 1 and 20),
  constraint proforma_ayarlari_rev_check check (ust_bilgi_revizyon is null or char_length(btrim(ust_bilgi_revizyon)) between 1 and 10)
);

-- ---- updated_at + denetim tetikleyicileri ----------------------------------
do $$
declare t text;
begin
  foreach t in array array['ihracat_musterileri', 'ihracat_urunleri', 'proforma_ayarlari'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'trg_' || t || '_updated_at', t);
  end loop;
  -- Denetim (id'li tablolar; proforma_ayarlari'nda id yok -> denetim_tetikleyici id ister)
  foreach t in array array['ihracat_musterileri', 'ihracat_urunleri'] loop
    execute format('drop trigger if exists %I on public.%I', 'denetim_' || t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.denetim_tetikleyici()', 'denetim_' || t, t);
  end loop;
end $$;

-- ---- RLS: sirket + "proformalar" sayfa yetkisi ------------------------------
alter table public.ihracat_musterileri enable row level security;
alter table public.ihracat_urunleri enable row level security;
alter table public.proforma_ayarlari enable row level security;

do $$
declare t text; k text;
begin
  foreach t in array array['ihracat_musterileri', 'ihracat_urunleri', 'proforma_ayarlari'] loop
    foreach k in array array['select', 'insert', 'update', 'delete'] loop
      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_' || k) then
        if k = 'select' or k = 'delete' then
          execute format('create policy %I on public.%I for %s using ((company_id = auth_company_id()) and ic_sayfa_yetkisi(''proformalar''))', t || '_' || k, t, k);
        elsif k = 'insert' then
          execute format('create policy %I on public.%I for insert with check ((company_id = auth_company_id()) and ic_sayfa_yetkisi(''proformalar''))', t || '_' || k, t);
        else
          execute format('create policy %I on public.%I for update using ((company_id = auth_company_id()) and ic_sayfa_yetkisi(''proformalar'')) with check ((company_id = auth_company_id()) and ic_sayfa_yetkisi(''proformalar''))', t || '_' || k, t);
        end if;
      end if;
    end loop;
  end loop;
end $$;

grant select, insert, update, delete on table public.ihracat_musterileri to authenticated;
grant select, insert, update, delete on table public.ihracat_urunleri to authenticated;
grant select, insert, update, delete on table public.proforma_ayarlari to authenticated;

-- ---- Yetkiler ---------------------------------------------------------------
-- "proformalar" sayfasi: bugun "Yeni Dosya Ac" yetkisi olanlara (bbt@, ihracat@,
-- volkandurgut.tr@). "proforma_imza": SADECE ihracat@unex.com.tr (Harun Bey).
-- Anahtar zaten varsa (yetkilendirme ekranindan degistirilmisse) DOKUNULMAZ.
update public.kullanici_yetkileri
   set sayfa_yetkileri = sayfa_yetkileri || jsonb_build_object('proformalar', coalesce((sayfa_yetkileri ->> 'yeni_dosya') = 'true', false)),
       updated_at = now()
 where not (sayfa_yetkileri ? 'proformalar');

update public.kullanici_yetkileri
   set sayfa_yetkileri = sayfa_yetkileri || jsonb_build_object('proforma_imza', lower(coalesce(email, '')) = 'ihracat@unex.com.tr'),
       updated_at = now()
 where not (sayfa_yetkileri ? 'proforma_imza');

comment on table public.ihracat_musterileri is 'Ihracat alici kartlari - proforma sihirbazi (17.10.2026).';
comment on table public.ihracat_urunleri is 'Proforma urun kutuphanesi (DESCRIPTION OF GOODS, marka haric) - 17.10.2026.';
comment on table public.proforma_ayarlari is 'Proforma sablon metinleri (sirket basina). NULL alan = uygulamadaki varsayilan.';
