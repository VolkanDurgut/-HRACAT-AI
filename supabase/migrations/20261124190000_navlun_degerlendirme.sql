-- 24.11.2026 NAVLUN ASAMA 1: TEK HESAP YERI
-- Sayfa, Excel ve 17:00 maili ayni karsilastirmayi ayri ayri (farkli pencerelerle) yapiyordu. Her teklifin degerlendirmesi
-- artik TEK tabloda: edge navlun-bildirimi ("degerlendir": her kayitta + 15 dakikada bir) hesaplar ve yazar
-- (supabase/functions/_shared/navlun-degerlendirme.ts). Yalniz turetilmis tablolar: is kayitlarina (teklif, dosya, yukleme
-- plani) YAZILMAZ. Okuma yetkisi navlun tablolariyla ayni (proformalar / analiz / navlun sayfa yetkisi).

-- 1) Gunluk kur (TCMB doviz satis; EUR/USD ve TRY/USD). Gecmis karsilastirma o gunun kuruyla tekrar uretilebilir.
create table if not exists public.doviz_kurlari (
  tarih date primary key,
  eur_usd numeric not null check (eur_usd > 0.5 and eur_usd < 3),
  try_usd numeric not null check (try_usd > 0 and try_usd < 1),
  kaynak text not null default 'TCMB',
  created_at timestamptz not null default now()
);
alter table public.doviz_kurlari enable row level security;
drop policy if exists doviz_kurlari_oku on public.doviz_kurlari;
create policy doviz_kurlari_oku on public.doviz_kurlari for select to authenticated using (true);

-- 2) Teklif degerlendirmesi (teklif basina tek satir)
create table if not exists public.navlun_teklif_degerlendirme (
  teklif_id uuid primary key references public.navlun_teklifleri(id) on delete cascade,
  company_id uuid not null,
  liman_anahtar text,
  acente text,
  ekipman text,
  tutar numeric not null,
  para text not null default 'USD',
  toplam_usd numeric not null,
  lokal numeric,
  ek numeric not null default 0,
  lokal_durum text not null check (lokal_durum in ('dahil', 'haric', 'bilinmiyor')),
  metin text,
  dayanak text,
  celiski text,
  yaklasik boolean not null default false,
  kalem jsonb,
  gecerlilik_bitis date not null,
  gecerlilik_kaynagi text not null check (gecerlilik_kaynagi in ('teklif', 'acente', 'varsayilan')),
  durum text not null check (durum in ('kesin', 'kontrol', 'eksik', 'suresi_doldu')),
  en_iyi boolean not null default false,
  kur_tarihi text,
  hesap_zamani timestamptz not null default now()
);
create index if not exists navlun_teklif_degerlendirme_liman on public.navlun_teklif_degerlendirme (company_id, liman_anahtar);
alter table public.navlun_teklif_degerlendirme enable row level security;
drop policy if exists navlun_teklif_degerlendirme_oku on public.navlun_teklif_degerlendirme;
create policy navlun_teklif_degerlendirme_oku on public.navlun_teklif_degerlendirme for select to authenticated
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz') or ic_sayfa_yetkisi('navlun')));

-- 3) Gerceklesen navlun kontrolu (yukleme plani satiri basina): teklif ile dosyaya giren navlun tutuyor mu
create table if not exists public.navlun_gerceklesen_kontrol (
  sevkiyat_id uuid primary key references public.sevkiyat_plani(id) on delete cascade,
  company_id uuid not null,
  booking_no text,
  acente text,
  liman_anahtar text,
  etd date,
  referans_tarih date,
  gercek numeric not null,
  para text not null default 'USD',
  teklif_id uuid,
  teklif_tutar numeric,
  teklif_para text,
  teklif_tarih timestamptz,
  fark numeric,
  durum text not null check (durum in ('tutuyor', 'eski_teklifle_tutuyor', 'tutmuyor', 'teklif_yok', 'fob', 'eksik')),
  kur_tarihi text,
  aciklama text,
  hesap_zamani timestamptz not null default now()
);
create index if not exists navlun_gerceklesen_kontrol_durum on public.navlun_gerceklesen_kontrol (company_id, durum);
alter table public.navlun_gerceklesen_kontrol enable row level security;
drop policy if exists navlun_gerceklesen_kontrol_oku on public.navlun_gerceklesen_kontrol;
create policy navlun_gerceklesen_kontrol_oku on public.navlun_gerceklesen_kontrol for select to authenticated
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz') or ic_sayfa_yetkisi('navlun')));

-- 4) Kontrol islemleri izi (Asama 2'deki Duzelt / Onayla / Yoksay / Kural olarak ogret aksiyonlari buraya yazar)
create table if not exists public.navlun_kontrol_islemleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  hedef_tur text not null check (hedef_tur in ('teklif', 'mesaj', 'gerceklesen')),
  hedef_id text not null check (char_length(hedef_id) between 1 and 300),
  islem text not null check (islem in ('duzelt', 'onayla', 'yoksay', 'ogret')),
  onceki jsonb,
  sonraki jsonb,
  gerekce text check (gerekce is null or char_length(gerekce) <= 500),
  kullanici uuid default auth.uid(),
  zaman timestamptz not null default now()
);
create index if not exists navlun_kontrol_islemleri_hedef on public.navlun_kontrol_islemleri (company_id, hedef_tur, hedef_id);
alter table public.navlun_kontrol_islemleri enable row level security;
drop policy if exists navlun_kontrol_islemleri_oku on public.navlun_kontrol_islemleri;
create policy navlun_kontrol_islemleri_oku on public.navlun_kontrol_islemleri for select to authenticated
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz') or ic_sayfa_yetkisi('navlun')));

-- Yazma yalniz sunucu (service_role); istemciye yazma yetkisi verilmez
revoke insert, update, delete on public.doviz_kurlari, public.navlun_teklif_degerlendirme, public.navlun_gerceklesen_kontrol, public.navlun_kontrol_islemleri from anon, authenticated;
