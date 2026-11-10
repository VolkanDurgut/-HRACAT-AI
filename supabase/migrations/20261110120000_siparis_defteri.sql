-- SIPARIS DEFTERI + SEVKIYAT PLANI (Dalga 4.1) - 10.11.2026
--
-- Kullanici kararlari (10.11.2026):
--  - "Siparis listesi her halukarda sisteme eklenmeli ve DIIB gibi otomatik mail gonderilmeli. Rapor olarak."
--  - Yontem C: once Excel'den TEK SEFERLIK aktarim (export'un siparis listesi + operasyonun yukleme plani),
--    sonra sistem ana kaynak. "Sadece kontrol merkezindeki raporu 1 yillik guncel tutalim."
--  - Belge yuklenmez: gecmis (Ocak-Agustos) sevkiyatlar yalniz VERI olarak tutulur.
--  - Navlun formu: gecmis sevkiyatlarin navlun / lokal masrafi sonradan tamamlanir.
--  - GERCEK VERI REPODA DURMAZ (repo herkese acik): yalniz bu tablolarda; aktarim yerelden SQL ile.
--
-- Erisim: istemciye SADECE OKUNUR. Siparis defteri "proformalar" yetkisi (siparis = proforma), sevkiyat plani
-- "proformalar" veya "analiz" yetkisi (Kontrol Merkezi gecmisi). Yazma yalniz servis / SECURITY DEFINER RPC.

-- 1) Siparis defteri: proforma bazinda siparis satiri (bir proforma birden fazla sevkiyata bolunebilir)
create table if not exists public.siparis_defteri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  kaynak_anahtar text not null,                  -- aktarimi tekrar calistirilabilir yapar (proforma|bl|sira)
  sira integer,                                  -- Excel'deki satir sirasi (rapor / Excel cikti sirasi)
  proforma_no text not null check (char_length(btrim(proforma_no)) between 3 and 80),
  proforma_tarihi date,                          -- proforma numarasindaki GGAAYY'den
  firma text not null check (char_length(btrim(firma)) between 1 and 200),
  firma_anahtar text,                            -- pazar_anahtar(firma): musteri eslesmesi
  urun text,
  birim_fiyat numeric check (birim_fiyat is null or birim_fiyat >= 0),
  miktar_mt numeric check (miktar_mt is null or miktar_mt >= 0),
  tutar numeric check (tutar is null or tutar >= 0),
  para_birimi text not null default 'USD',
  konteyner integer check (konteyner is null or konteyner between 0 and 1000),
  liman text,
  bl_no text,                                    -- Excel'deki "BL NO" (cogunlukla booking no)
  marka text,
  paketleme text,
  durum text not null check (durum in ('onay_bekliyor', 'on_odeme_alindi', 'rezervasyonlu', 'sevk_edildi', 'bl_eksik', 'iptal')),
  kaynak text not null default 'excel' check (kaynak in ('excel', 'sistem', 'elle')),
  dosya_id uuid references public.ihracat_dosyalari(id) on delete set null,
  aciklama text check (aciklama is null or char_length(aciklama) <= 500),
  guncelleyen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, kaynak_anahtar)
);
create index if not exists siparis_defteri_sirket_durum on public.siparis_defteri (company_id, durum);
create index if not exists siparis_defteri_bl on public.siparis_defteri (company_id, upper(bl_no));

-- 2) Sevkiyat plani: booking bazinda yukleme plani (operasyonun haftalik plani)
create table if not exists public.sevkiyat_plani (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  booking_no text not null check (char_length(btrim(booking_no)) between 3 and 60),
  hafta integer check (hafta is null or hafta between 1 and 53),
  yil integer not null default 2026,
  musteri text,
  cinsi text,
  konteyner integer check (konteyner is null or konteyner between 0 and 1000),
  varis_limani text,
  cuval_markasi text,
  ambalaj text,
  acente text,
  liman text,                                    -- yukleme limani (KUMPORT, MARPORT...)
  ekipman text,                                  -- bos ekipman alim yeri
  bos_ekipman_tarihi date,
  ardiyesiz_giris date,
  talimat_cutoff timestamptz,                    -- YEREL saat, UTC etiketiyle (rezervasyonlar ile ayni kural)
  beyan_cutoff timestamptz,
  etd date,
  gemi text,
  sefer text,
  siparis_id uuid references public.siparis_defteri(id) on delete set null,
  rezervasyon_id uuid references public.rezervasyonlar(id) on delete set null,
  dosya_id uuid references public.ihracat_dosyalari(id) on delete set null,
  navlun_kont numeric check (navlun_kont is null or navlun_kont >= 0),   -- konteyner basi
  lokal_kont numeric check (lokal_kont is null or lokal_kont >= 0),
  navlun_para text not null default 'USD',
  navlun_kaynak text check (navlun_kaynak is null or navlun_kaynak in ('dosya', 'form', 'elle')),
  navlun_giren text,
  navlun_tarihi timestamptz,
  kaynak text not null default 'excel' check (kaynak in ('excel', 'sistem', 'elle')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, booking_no)
);
create index if not exists sevkiyat_plani_etd on public.sevkiyat_plani (company_id, etd);

-- 3) RLS: istemciye salt okunur
alter table public.siparis_defteri enable row level security;
alter table public.sevkiyat_plani enable row level security;

drop policy if exists siparis_defteri_oku on public.siparis_defteri;
create policy siparis_defteri_oku on public.siparis_defteri for select to authenticated
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')));

drop policy if exists sevkiyat_plani_oku on public.sevkiyat_plani;
create policy sevkiyat_plani_oku on public.sevkiyat_plani for select to authenticated
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')));

revoke insert, update, delete on public.siparis_defteri from anon, authenticated;
revoke insert, update, delete on public.sevkiyat_plani from anon, authenticated;
revoke all on public.siparis_defteri from anon;
revoke all on public.sevkiyat_plani from anon;
