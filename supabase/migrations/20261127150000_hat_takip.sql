-- ============================================================================
-- HAT TAKIP - ASAMA 1: DENEME MODU (27.11.2026, kullanici onayi: "Proje onaylidir")
-- ============================================================================
-- Hapag-Lloyd Track & Trace v2 (DCSA) olaylari AYRI tablolarda tutulur; mevcut tablolara (rezervasyonlar, dosyalar)
-- HICBIR YAZMA YOK, mail YOK. Sayfa: /hat-takip (yetki "etd_eta", salt okuma).
--  - hat_takip_kayitlari : takip edilen booking basina bir satir (ozet: hat ETD / ETA, gemi, sefer, son sorgu, hata)
--  - hat_olaylari        : DCSA olaylari (EQUIPMENT / TRANSPORT / SHIPMENT; PLN / EST / ACT), olay_anahtari ile tekil;
--                          ayni olay zamani / sinifi degisirse satir guncellenir (Hapag plani revize eder)
--  - hat_takip_cagrilari : her API cagrisinin izi (kota: Tryout 100 / gun - 5 pay)
-- Yazma yalniz edge hat-takip (service_role) uzerinden: hat_takip_sira() + hat_takip_kaydet().
-- Hangi booking: acente_ismi HAPAG gecen, booking_no 8-10 rakam, ETA bos ya da son 21 gun icinde / ileride.
-- Kapatma: edge secret HAT_TAKIP_KAPALI = "evet" ya da cron 'hat-takip-yenile' kaldirilir. Musteri verisi icermez.
-- ============================================================================

create table if not exists public.hat_takip_kayitlari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  rezervasyon_id uuid not null references public.rezervasyonlar(id) on delete cascade,
  hat text not null default 'HLCU',
  booking_no text not null,
  aktif boolean not null default true,
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'tamam', 'bulunamadi', 'hata')),
  son_sorgu timestamptz,
  son_basari timestamptz,
  son_hata text,
  olay_sayisi integer not null default 0,
  konteyner_sayisi integer not null default 0,
  hat_etd timestamptz,
  hat_etd_sinif text,
  hat_eta timestamptz,
  hat_eta_sinif text,
  pol text,
  pod text,
  gemi text,
  sefer text,
  olusturma timestamptz not null default now(),
  guncelleme timestamptz not null default now(),
  unique (rezervasyon_id, hat)
);
create index if not exists hat_takip_kayitlari_sira_idx on public.hat_takip_kayitlari (aktif, son_sorgu nulls first);
create index if not exists hat_takip_kayitlari_sirket_idx on public.hat_takip_kayitlari (company_id);

create table if not exists public.hat_olaylari (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id),
  takip_id uuid not null references public.hat_takip_kayitlari(id) on delete cascade,
  olay_anahtari text not null,
  olay_turu text not null,
  olay_kodu text,
  sinif text,
  olay_zamani timestamptz,
  olusma_zamani timestamptz,
  konteyner text,
  bos_dolu text,
  yer_kodu text,
  yer_adi text,
  gemi text,
  imo text,
  sefer text,
  ham jsonb,
  alinma timestamptz not null default now(),
  unique (takip_id, olay_anahtari)
);
create index if not exists hat_olaylari_takip_idx on public.hat_olaylari (takip_id, olay_zamani);

create table if not exists public.hat_takip_cagrilari (
  id bigint generated always as identity primary key,
  zaman timestamptz not null default now(),
  api text not null,
  takip_id uuid references public.hat_takip_kayitlari(id) on delete set null,
  durum_kodu integer,
  sure_ms integer
);
create index if not exists hat_takip_cagrilari_zaman_idx on public.hat_takip_cagrilari (api, zaman);

alter table public.hat_takip_kayitlari enable row level security;
alter table public.hat_olaylari enable row level security;
alter table public.hat_takip_cagrilari enable row level security;

drop policy if exists hat_takip_kayitlari_oku on public.hat_takip_kayitlari;
create policy hat_takip_kayitlari_oku on public.hat_takip_kayitlari for select to authenticated
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('etd_eta'));
drop policy if exists hat_olaylari_oku on public.hat_olaylari;
create policy hat_olaylari_oku on public.hat_olaylari for select to authenticated
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('etd_eta'));
-- hat_takip_cagrilari: politika yok (yalniz service_role)

revoke insert, update, delete on public.hat_takip_kayitlari, public.hat_olaylari from anon, authenticated;
revoke all on public.hat_takip_cagrilari from anon, authenticated;

comment on table public.hat_takip_kayitlari is 'Hat Takip Asama 1 (27.11.2026): takip edilen booking ozeti (Hapag T&T). Yazma yalniz edge hat-takip.';
comment on table public.hat_olaylari is 'Hat Takip Asama 1 (27.11.2026): DCSA T&T olaylari. Yazma yalniz edge hat-takip.';
comment on table public.hat_takip_cagrilari is 'Hat Takip (27.11.2026): API cagri izi / kota. Yalniz service_role.';

-- Sira: uygun booking'leri takibe al / cikar, en eski sorgulananlari dondur + kalan gunluk kota
create or replace function public.hat_takip_sira(p_adet integer default 1, p_gunluk_kota integer default 95)
returns table (takip_id uuid, booking_no text, kota_kalan integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_kalan integer;
begin
  insert into public.hat_takip_kayitlari (company_id, rezervasyon_id, hat, booking_no)
  select r.company_id, r.id, 'HLCU', btrim(r.booking_no)
  from public.rezervasyonlar r
  where upper(coalesce(r.acente_ismi, '')) like '%HAPAG%'
    and btrim(coalesce(r.booking_no, '')) ~ '^[0-9]{8,10}$'
    and (r.eta is null or r.eta >= current_date - 21)
  on conflict (rezervasyon_id, hat) do nothing;

  -- Booking no degismisse izle; ETA'si 21 gunden eski / Hapag'dan cikmis olan takipten duser (olaylar durur)
  update public.hat_takip_kayitlari k
     set booking_no = btrim(r.booking_no),
         aktif = (upper(coalesce(r.acente_ismi, '')) like '%HAPAG%'
                  and btrim(coalesce(r.booking_no, '')) ~ '^[0-9]{8,10}$'
                  and (r.eta is null or r.eta >= current_date - 21)),
         guncelleme = now()
    from public.rezervasyonlar r
   where r.id = k.rezervasyon_id
     and (k.booking_no is distinct from btrim(r.booking_no)
          or k.aktif is distinct from (upper(coalesce(r.acente_ismi, '')) like '%HAPAG%'
                                       and btrim(coalesce(r.booking_no, '')) ~ '^[0-9]{8,10}$'
                                       and (r.eta is null or r.eta >= current_date - 21)));

  select greatest(0, p_gunluk_kota - count(*))::integer into v_kalan
    from public.hat_takip_cagrilari c where c.api = 'tt' and c.zaman > now() - interval '24 hours';

  return query
    select k.id, k.booking_no, v_kalan
      from public.hat_takip_kayitlari k
     where k.aktif and v_kalan > 0
     order by k.son_sorgu nulls first, k.olusturma
     limit least(greatest(coalesce(p_adet, 1), 0), v_kalan);
end;
$$;

-- Kaydet: cagri izi + olaylar (tekil anahtar) + ozet. p_olaylar: normallestirilmis dizi (_shared/hat-takip.ts)
create or replace function public.hat_takip_kaydet(
  p_takip uuid, p_durum_kodu integer, p_sure_ms integer, p_olaylar jsonb, p_ozet jsonb, p_hata text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  k public.hat_takip_kayitlari%rowtype;
  v_eklenen integer := 0;
begin
  select * into k from public.hat_takip_kayitlari where id = p_takip;
  if k.id is null then return 0; end if;
  insert into public.hat_takip_cagrilari (api, takip_id, durum_kodu, sure_ms) values ('tt', p_takip, p_durum_kodu, p_sure_ms);

  if p_hata is not null then
    update public.hat_takip_kayitlari
       set son_sorgu = now(), son_hata = left(p_hata, 500), guncelleme = now(),
           durum = case when p_durum_kodu = 404 then 'bulunamadi' else 'hata' end
     where id = p_takip;
    return 0;
  end if;

  insert into public.hat_olaylari (company_id, takip_id, olay_anahtari, olay_turu, olay_kodu, sinif, olay_zamani, olusma_zamani,
                                   konteyner, bos_dolu, yer_kodu, yer_adi, gemi, imo, sefer, ham)
  select k.company_id, p_takip, o ->> 'anahtar', coalesce(o ->> 'tur', '?'), o ->> 'kod', o ->> 'sinif',
         nullif(o ->> 'zaman', '')::timestamptz, nullif(o ->> 'olusma', '')::timestamptz,
         o ->> 'konteyner', o ->> 'bos_dolu', o ->> 'yer', o ->> 'yer_adi', o ->> 'gemi', o ->> 'imo', o ->> 'sefer', o -> 'ham'
    from jsonb_array_elements(coalesce(p_olaylar, '[]'::jsonb)) o
   where coalesce(o ->> 'anahtar', '') <> ''
  on conflict (takip_id, olay_anahtari) do update
     set olay_zamani = excluded.olay_zamani, olusma_zamani = excluded.olusma_zamani, sinif = excluded.sinif,
         yer_kodu = excluded.yer_kodu, yer_adi = excluded.yer_adi, gemi = excluded.gemi, imo = excluded.imo,
         sefer = excluded.sefer, ham = excluded.ham, alinma = now()
   where (public.hat_olaylari.olay_zamani, public.hat_olaylari.sinif, public.hat_olaylari.olusma_zamani)
         is distinct from (excluded.olay_zamani, excluded.sinif, excluded.olusma_zamani);
  get diagnostics v_eklenen = row_count;

  update public.hat_takip_kayitlari
     set son_sorgu = now(), son_basari = now(), son_hata = null, guncelleme = now(),
         durum = case when coalesce((p_ozet ->> 'olay_sayisi')::integer, 0) > 0 then 'tamam' else 'bulunamadi' end,
         olay_sayisi = (select count(*) from public.hat_olaylari h where h.takip_id = p_takip),
         konteyner_sayisi = coalesce((p_ozet ->> 'konteyner_sayisi')::integer, 0),
         hat_etd = nullif(p_ozet ->> 'etd', '')::timestamptz, hat_etd_sinif = p_ozet ->> 'etd_sinif',
         hat_eta = nullif(p_ozet ->> 'eta', '')::timestamptz, hat_eta_sinif = p_ozet ->> 'eta_sinif',
         pol = p_ozet ->> 'pol', pod = p_ozet ->> 'pod', gemi = p_ozet ->> 'gemi', sefer = p_ozet ->> 'sefer'
   where id = p_takip;
  return v_eklenen;
end;
$$;

revoke all on function public.hat_takip_sira(integer, integer) from public, anon, authenticated;
revoke all on function public.hat_takip_kaydet(uuid, integer, integer, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.hat_takip_sira(integer, integer) to service_role;
grant execute on function public.hat_takip_kaydet(uuid, integer, integer, jsonb, jsonb, text) to service_role;
