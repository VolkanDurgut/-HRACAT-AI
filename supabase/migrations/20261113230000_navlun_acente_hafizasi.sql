-- NAVLUN ACENTE HAFIZASI + LIMAN KURALLARI (13.11.2026).
--
-- Kullanici: "Beyrut navlununun yanlis gozukmesi ... Bunu kokten cozmeliyiz. Mailleri oku, acenteleri gruplara ayir,
-- ilettigi mesajlari hafizaya al. Kendi kendini gelistiren bir sistem olmali."
-- Karsilastirma hesabi: supabase/functions/_shared/navlun-karsilastirma.ts (uygulama + edge navlun-tablosu ayni kod).
--
-- navlun_acente_hafizasi: acentenin fiyati cikis lokalini iceriyor mu (dahil / haric / bilinmiyor), lokal haricse konteyner
--   basi lokal tutari (KDV haric; ekipmana gore), lokal dahil olsa da ayrica yazilan konteyner basi kucuk kalemler
--   (VGM, muhur), guven ve kanit (hangi mail / rezervasyonla dogrulandi). Teklif metni lokali yaziyorsa o gecerlidir;
--   hafiza yalniz metinde bilgi yoksa uygulanir. Hafizada olmayan acente rezervasyonlardan kendiliginden ogrenilir
--   (yukleme plani; kod tarafinda, tabloya yazilmaz).
-- navlun_liman_kurallari: karsilastirma temeli istisnasi (bir pazarda teklifler ve hedef yalniz deniz navlunuysa "navlun").
--
-- Okuma: navlun_teklifleri ile ayni yetki (sirket + "proformalar" ya da "analiz"). Yazma: yalniz service_role / SQL
-- (elle duzeltme ekrani sonraki adim). Veri bu dosyada YOK (repo herkese acik): canliya SQL ile girilir.

create table if not exists public.navlun_acente_hafizasi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  acente_anahtar text not null check (acente_anahtar ~ '^[A-Z0-9+& .-]{1,60}$'),
  acente_ad text not null,
  lokal text not null default 'bilinmiyor' check (lokal in ('dahil', 'haric', 'bilinmiyor')),
  lokal_20 numeric check (lokal_20 is null or (lokal_20 >= 0 and lokal_20 < 10000)),
  lokal_40 numeric check (lokal_40 is null or (lokal_40 >= 0 and lokal_40 < 10000)),
  ek_kont numeric not null default 0 check (ek_kont >= 0 and ek_kont < 2000),
  guven text not null default 'tahmini' check (guven in ('kesin', 'yuksek', 'tahmini')),
  kanit text not null default '',
  kaynak text not null default 'arastirma' check (kaynak in ('arastirma', 'elle', 'mail')),
  kaynak_mesaj_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, acente_anahtar)
);

create table if not exists public.navlun_liman_kurallari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  liman_anahtar text not null,
  temel text not null default 'toplam' check (temel in ('toplam', 'navlun')),
  aciklama text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, liman_anahtar)
);

alter table public.navlun_acente_hafizasi enable row level security;
alter table public.navlun_liman_kurallari enable row level security;

drop policy if exists navlun_acente_hafizasi_oku on public.navlun_acente_hafizasi;
create policy navlun_acente_hafizasi_oku on public.navlun_acente_hafizasi for select to authenticated
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')));

drop policy if exists navlun_liman_kurallari_oku on public.navlun_liman_kurallari;
create policy navlun_liman_kurallari_oku on public.navlun_liman_kurallari for select to authenticated
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')));

revoke all on public.navlun_acente_hafizasi from anon;
revoke all on public.navlun_liman_kurallari from anon;
grant select on public.navlun_acente_hafizasi to authenticated;
grant select on public.navlun_liman_kurallari to authenticated;
revoke insert, update, delete on public.navlun_acente_hafizasi from authenticated;
revoke insert, update, delete on public.navlun_liman_kurallari from authenticated;

comment on table public.navlun_acente_hafizasi is
  'Navlun acente hafizasi (13.11.2026): fiyat lokal dahil mi, lokal tarifesi, ek kalemler, kanit. Hesap: _shared/navlun-karsilastirma.ts';
comment on table public.navlun_liman_kurallari is
  'Navlun karsilastirma temeli istisnalari (13.11.2026): temel = toplam (navlun + lokal) ya da navlun (yalniz deniz navlunu).';
