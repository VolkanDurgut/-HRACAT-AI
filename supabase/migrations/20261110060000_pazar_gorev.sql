-- PAZAR (UNEX Satis) CRM - Dalga 3.3 + 3.4: gunluk "Bugunku musteriniz" gorevleri + gorusme sureci (10.11.2026)
--
-- Kullanici kararlari:
--  - Gunluk mail export@ + export2@ (CC bbt@ + execution@; test: yalniz test adresi). "Basla" -> girissiz gorev
--    sayfasi (/gorev/[token]); export@ / export2@ Pazar sayfasina GIRMEZ (yetki yalniz execution@ + bbt@).
--  - Siralama: 1) hatirlatma zamani gelenler 2) SIPARISSIZ kendi musterilerimiz (en uzun suredir siparissiz once)
--    3) fuar potansiyelleri (son fuar yili, gecerli e-posta, WhatsApp). Aktif siparisi olan secilmez.
--  - Surec: Siparis sorgulama (0. gun) -> Hatirlatma 1 (+4 is gunu) -> Hatirlatma 2 (+6 is gunu, toplam 10)
--    -> 10 gun sonra Sessiz; musteri 30, potansiyel 60 gun sonra yeniden siraya girer.
--    Sonuc: Cevap verdi / Teklif istedi / Siparis verdi (30 gun beklemede) / Ilgilenmiyor (180 gun) / Bugun atla (7 gun).
--  - Mailler Outlook'tan (export@) gider; sistem "Gonderdim" ile kaydeder (arsivden otomatik tespit 3.5).
--  - Gunde 1 ana musteri + "Yeni musteriyle devam et" ile en fazla 5 daha (toplam 6).
--
-- Erisim: tablolar "pazar" yetkisine SADECE OKUNUR. Gorev sayfasi / gunluk mail edge "pazar-gorev" (service_role)
-- uzerinden; asagidaki fonksiyonlar anon / authenticated'a KAPALI.

-- 1) Firma surec alanlari
alter table public.pazar_firmalar add column if not exists crm_asama text not null default 'yeni';
alter table public.pazar_firmalar add column if not exists sonraki_adim date;
alter table public.pazar_firmalar add column if not exists bekleme_bitis date;
alter table public.pazar_firmalar add column if not exists son_temas timestamptz;
do $$ begin
  alter table public.pazar_firmalar add constraint pazar_firmalar_crm_asama_kontrol
    check (crm_asama in ('yeni', 'sorgulandi', 'hatirlatma1', 'hatirlatma2', 'sessiz', 'cevap', 'teklif', 'siparis', 'ilgilenmiyor'));
exception when duplicate_object then null; end $$;

-- 2) Gorusme kayitlari
create table if not exists public.pazar_temaslar (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  firma_id uuid not null references public.pazar_firmalar(id) on delete cascade,
  gorev_id uuid,
  adim text not null check (adim in ('sorgulama', 'hatirlatma1', 'hatirlatma2', 'sonuc', 'atla')),
  kanal text check (kanal in ('eposta', 'whatsapp')),
  sablon text,
  sonuc text check (sonuc in ('cevap', 'teklif', 'siparis', 'ilgilenmiyor')),
  alici text,
  konu text,
  govde text,
  isleyen text,
  olusturma timestamptz not null default now()
);
create index if not exists pazar_temaslar_firma_idx on public.pazar_temaslar (firma_id, olusturma desc);

-- 3) Gunluk gorevler
create table if not exists public.pazar_gorevler (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  tarih date not null,
  firma_id uuid not null references public.pazar_firmalar(id) on delete cascade,
  sira integer not null,
  neden text not null check (neden in ('hatirlatma1', 'hatirlatma2', 'siparissiz', 'potansiyel')),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'yapildi', 'atlandi')),
  isleyen text,
  olusturma timestamptz not null default now(),
  tamamlanma timestamptz,
  unique (company_id, tarih, firma_id)
);
create index if not exists pazar_gorevler_tarih_idx on public.pazar_gorevler (company_id, tarih, sira);

-- Gunluk mail gonderim kaydi (gunde bir; test ayri)
create table if not exists public.pazar_gorev_gonderimleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  tarih date not null,
  durum text not null check (durum in ('gonderildi', 'test', 'hata', 'bos')),
  alicilar text[] not null default '{}',
  gorev_sayisi integer not null default 0,
  mesaj_id text,
  hata text,
  olusturma timestamptz not null default now()
);
create unique index if not exists pazar_gorev_gonderim_gunluk on public.pazar_gorev_gonderimleri (company_id, tarih) where durum = 'gonderildi';

comment on table public.pazar_temaslar is 'PAZAR CRM gorusmeleri: siparis sorgulama / hatirlatma / sonuc (10.11.2026).';
comment on table public.pazar_gorevler is 'PAZAR CRM gunluk "Bugunku musteriniz" gorevleri; token = girissiz gorev sayfasi (10.11.2026).';
comment on table public.pazar_gorev_gonderimleri is 'PAZAR gunluk gorev maili gonderim kaydi (edge pazar-gorev). 10.11.2026';

alter table public.pazar_temaslar enable row level security;
alter table public.pazar_gorevler enable row level security;
alter table public.pazar_gorev_gonderimleri enable row level security;
revoke all on public.pazar_temaslar from anon, authenticated;
revoke all on public.pazar_gorevler from anon, authenticated;
revoke all on public.pazar_gorev_gonderimleri from anon, authenticated;
grant select on public.pazar_temaslar to authenticated;
drop policy if exists pazar_temaslar_select on public.pazar_temaslar;
create policy pazar_temaslar_select on public.pazar_temaslar for select to authenticated
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('pazar'));
-- pazar_gorevler: token tasir -> istemciye HIC acilmaz (yalniz service_role / edge).

drop trigger if exists denetim_pazar_temaslar on public.pazar_temaslar;
create trigger denetim_pazar_temaslar after insert or delete or update on public.pazar_temaslar
  for each row execute function public.denetim_tetikleyici();

-- 4) Yardimcilar
create or replace function public.pazar_is_gunu_ekle(p_tarih date, p_gun integer)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  d date := p_tarih;
  n integer := 0;
begin
  while n < p_gun loop
    d := d + 1;
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end;
$$;

-- Firmanin su an siparisi var mi (rezervasyonlu acik dosya ya da tamamlanmamis ana siparis)
create or replace function public.pazar_firma_aktif(p_firma uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with f as (select company_id, array_append(ek_anahtarlar, anahtar) a from public.pazar_firmalar where id = p_firma)
  select exists (
      select 1 from public.ihracat_dosyalari d, f
       where d.company_id = f.company_id and d.durum = 'Açık' and public.pazar_anahtar(d.alici_firma) = any(f.a)
         and exists (select 1 from public.rezervasyonlar r where r.dosya_id = d.id))
    or exists (
      select 1 from public.ana_siparisler s, f
       where s.company_id = f.company_id and not coalesce(s.tamamlandi, false) and public.pazar_anahtar(s.alici_firma) = any(f.a));
$$;

-- Firmanin son siparis (dosya) tarihi
create or replace function public.pazar_firma_son_siparis(p_firma uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  with f as (select company_id, array_append(ek_anahtarlar, anahtar) a from public.pazar_firmalar where id = p_firma)
  select max(d.olusturma_tarihi) from public.ihracat_dosyalari d, f
   where d.company_id = f.company_id and public.pazar_anahtar(d.alici_firma) = any(f.a)
     and exists (select 1 from public.rezervasyonlar r where r.dosya_id = d.id);
$$;

-- 5) Gunun gorevleri: once suresi dolan hatirlatmalar, sonra siparissiz musteriler, sonra potansiyeller.
--    Ayni gun ikinci cagri mevcut gorevleri dondurur (idempotent).
create or replace function public.pazar_gorev_olustur(p_company uuid, p_tarih date, p_adet integer default 6)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sira integer;
  v_kalan integer;
  r record;
begin
  if p_company is null or p_tarih is null then return 0; end if;
  p_adet := least(greatest(coalesce(p_adet, 6), 1), 20);

  -- Hatirlatma 2'den sonra suresi dolanlar -> Sessiz (musteri 30, potansiyel 60 gun bekler)
  update public.pazar_firmalar
     set crm_asama = 'sessiz', sonraki_adim = null,
         bekleme_bitis = p_tarih + case when durum = 'musteri' then 30 else 60 end, updated_at = now()
   where company_id = p_company and crm_asama = 'hatirlatma2' and sonraki_adim is not null and sonraki_adim <= p_tarih;

  select coalesce(max(sira), 0) into v_sira from public.pazar_gorevler where company_id = p_company and tarih = p_tarih;
  if v_sira >= p_adet then return v_sira; end if;
  v_kalan := p_adet - v_sira;

  for r in
    with uygun as (
      select f.*,
             exists (select 1 from public.pazar_kisiler k where k.firma_id = f.id and k.eposta is not null and k.eposta_gecerli) as epostali,
             exists (select 1 from public.pazar_kisiler k where k.firma_id = f.id and (k.whatsapp is not null or cardinality(k.telefonlar) > 0)) as telefonlu
        from public.pazar_firmalar f
       where f.company_id = p_company
         and not exists (select 1 from public.pazar_gorevler g where g.firma_id = f.id and g.tarih = p_tarih)
         -- Son 3 gunde gorev verilip islenmemis firma tekrar verilmez
         and not exists (select 1 from public.pazar_gorevler g where g.firma_id = f.id and g.durum = 'bekliyor' and g.tarih >= p_tarih - 3)
    ), aday as (
      select u.id, 1 as grup,
             case when u.crm_asama = 'sorgulandi' then 'hatirlatma1' else 'hatirlatma2' end as neden,
             u.sonraki_adim::text as anahtar1, ''::text as anahtar2
        from uygun u
       where u.crm_asama in ('sorgulandi', 'hatirlatma1') and u.sonraki_adim is not null and u.sonraki_adim <= p_tarih
      union all
      select u.id, 2, 'siparissiz',
             coalesce(to_char(public.pazar_firma_son_siparis(u.id), 'YYYYMMDD'), '00000000'), u.ad
        from uygun u
       where u.durum = 'musteri'
         and u.crm_asama in ('yeni', 'sessiz', 'cevap', 'teklif', 'siparis', 'ilgilenmiyor')
         and (u.bekleme_bitis is null or u.bekleme_bitis <= p_tarih)
         and (u.epostali or u.telefonlu)
         and not public.pazar_firma_aktif(u.id)
      union all
      select u.id, 3, 'potansiyel',
             to_char(99999 - coalesce((select max(c.yil) from public.pazar_fuar_katilimlari c where c.firma_id = u.id), 0), 'FM00000')
               || case when u.epostali then '0' else '1' end
               || case when u.telefonlu then '0' else '1' end
               || case when u.ulke is not null and exists (select 1 from public.pazar_firmalar m where m.company_id = p_company and m.durum = 'musteri' and m.ulke = u.ulke) then '0' else '1' end,
             u.ad
        from uygun u
       where u.durum = 'potansiyel'
         and u.crm_asama in ('yeni', 'sessiz', 'cevap', 'teklif', 'ilgilenmiyor')
         and (u.bekleme_bitis is null or u.bekleme_bitis <= p_tarih)
         and u.epostali
    )
    select a.id, a.neden from aday a order by a.grup, a.anahtar1, a.anahtar2 limit v_kalan
  loop
    v_sira := v_sira + 1;
    insert into public.pazar_gorevler (company_id, tarih, firma_id, sira, neden)
    values (p_company, p_tarih, r.id, v_sira, r.neden)
    on conflict (company_id, tarih, firma_id) do nothing;
  end loop;
  return v_sira;
end;
$$;

-- 6) Gorev sayfasi verisi (token). Suresi: gorev tarihinden 3 gun sonra biter.
create or replace function public.pazar_gorev_bilgi(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g public.pazar_gorevler;
  f public.pazar_firmalar;
  v_adim text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return null; end if;
  select * into g from public.pazar_gorevler where token = p_token;
  if g.id is null or g.tarih < (now() at time zone 'Europe/Istanbul')::date - 3 then return null; end if;
  select * into f from public.pazar_firmalar where id = g.firma_id;
  v_adim := case f.crm_asama when 'sorgulandi' then 'hatirlatma1' when 'hatirlatma1' then 'hatirlatma2' else 'sorgulama' end;

  return jsonb_build_object(
    'gorev', jsonb_build_object('tarih', g.tarih, 'sira', g.sira, 'neden', g.neden, 'durum', g.durum, 'isleyen', g.isleyen, 'tamamlanma', g.tamamlanma),
    'adim', v_adim,
    'firma', jsonb_build_object('ad', f.ad, 'ulke', f.ulke, 'durum', f.durum, 'crm_asama', f.crm_asama, 'alici_adi', f.alici_adi,
      'son_siparis', public.pazar_firma_son_siparis(f.id), 'aktif', public.pazar_firma_aktif(f.id)),
    'kisiler', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'ad', k.ad, 'eposta', k.eposta, 'eposta_gecerli', k.eposta_gecerli,
        'telefonlar', k.telefonlar, 'whatsapp', k.whatsapp) order by (k.eposta is not null and k.eposta_gecerli) desc, k.created_at)
      from public.pazar_kisiler k where k.firma_id = f.id), '[]'::jsonb),
    'fuarlar', coalesce((select jsonb_agg(c.etiket order by c.yil desc nulls last) from public.pazar_fuar_katilimlari c where c.firma_id = f.id), '[]'::jsonb),
    'son_urun', (select d.urun_tanimi from public.ihracat_dosyalari d
                  where d.company_id = f.company_id and public.pazar_anahtar(d.alici_firma) = any(array_append(f.ek_anahtarlar, f.anahtar))
                  order by d.olusturma_tarihi desc limit 1),
    'gecmis', coalesce((select jsonb_agg(x order by x->>'olusturma' desc) from (
        select jsonb_build_object('adim', t.adim, 'kanal', t.kanal, 'sonuc', t.sonuc, 'alici', t.alici, 'konu', t.konu, 'isleyen', t.isleyen, 'olusturma', t.olusturma) x
          from public.pazar_temaslar t where t.firma_id = f.id order by t.olusturma desc limit 10) y), '[]'::jsonb),
    'gunun_gorevleri', coalesce((select jsonb_agg(jsonb_build_object('sira', o.sira, 'durum', o.durum, 'token', o.token, 'ad', fo.ad, 'neden', o.neden) order by o.sira)
      from public.pazar_gorevler o join public.pazar_firmalar fo on fo.id = o.firma_id
      where o.company_id = g.company_id and o.tarih = g.tarih), '[]'::jsonb)
  );
end;
$$;

-- 7) Gorev isleme. p_islem: gonderildi (p_kanal eposta|whatsapp) | cevap | teklif | siparis | ilgilenmiyor | atla
create or replace function public.pazar_gorev_isle(p_token text, p_islem text, p_kanal text, p_sablon text,
  p_alici text, p_konu text, p_govde text, p_isleyen text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.pazar_gorevler;
  f public.pazar_firmalar;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_adim text;
  v_isleyen text := nullif(left(trim(coalesce(p_isleyen, '')), 80), '');
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then raise exception 'Geçersiz bağlantı.'; end if;
  select * into g from public.pazar_gorevler where token = p_token for update;
  if g.id is null or g.tarih < v_bugun - 3 then raise exception 'Bu görevin süresi doldu.'; end if;
  select * into f from public.pazar_firmalar where id = g.firma_id for update;

  if p_islem = 'gonderildi' then
    if p_kanal not in ('eposta', 'whatsapp') then raise exception 'Geçersiz kanal.'; end if;
    v_adim := case f.crm_asama when 'sorgulandi' then 'hatirlatma1' when 'hatirlatma1' then 'hatirlatma2' else 'sorgulama' end;
    -- Ayni gun ayni adim ikinci kez (ornek: e-posta + WhatsApp) asamayi ilerletmez, yalniz kayit
    if exists (select 1 from public.pazar_temaslar t where t.gorev_id = g.id and t.adim in ('sorgulama', 'hatirlatma1', 'hatirlatma2')) then
      select t.adim into v_adim from public.pazar_temaslar t where t.gorev_id = g.id and t.adim in ('sorgulama', 'hatirlatma1', 'hatirlatma2') order by t.olusturma limit 1;
    else
      update public.pazar_firmalar
         set crm_asama = case v_adim when 'sorgulama' then 'sorgulandi' when 'hatirlatma1' then 'hatirlatma1' else 'hatirlatma2' end,
             sonraki_adim = case v_adim when 'sorgulama' then public.pazar_is_gunu_ekle(v_bugun, 4)
                                        when 'hatirlatma1' then public.pazar_is_gunu_ekle(v_bugun, 6)
                                        else v_bugun + 10 end,
             bekleme_bitis = null, son_temas = now(), updated_at = now()
       where id = f.id;
    end if;
    insert into public.pazar_temaslar (company_id, firma_id, gorev_id, adim, kanal, sablon, alici, konu, govde, isleyen)
    values (g.company_id, f.id, g.id, v_adim, p_kanal, left(p_sablon, 40), left(p_alici, 300), left(p_konu, 300), left(p_govde, 6000), v_isleyen);
    update public.pazar_gorevler set durum = 'yapildi', isleyen = coalesce(isleyen, v_isleyen), tamamlanma = coalesce(tamamlanma, now()) where id = g.id;

  elsif p_islem in ('cevap', 'teklif', 'siparis', 'ilgilenmiyor') then
    update public.pazar_firmalar
       set crm_asama = p_islem, sonraki_adim = null,
           bekleme_bitis = v_bugun + case p_islem when 'ilgilenmiyor' then 180 else 30 end,
           son_temas = now(), updated_at = now()
     where id = f.id;
    insert into public.pazar_temaslar (company_id, firma_id, gorev_id, adim, sonuc, isleyen)
    values (g.company_id, f.id, g.id, 'sonuc', p_islem, v_isleyen);
    update public.pazar_gorevler set durum = 'yapildi', isleyen = coalesce(isleyen, v_isleyen), tamamlanma = coalesce(tamamlanma, now()) where id = g.id;

  elsif p_islem = 'atla' then
    if g.durum = 'yapildi' then raise exception 'Bu görev zaten işlendi.'; end if;
    update public.pazar_firmalar set bekleme_bitis = greatest(coalesce(bekleme_bitis, v_bugun), v_bugun + 7), updated_at = now()
     where id = f.id and crm_asama not in ('sorgulandi', 'hatirlatma1');
    -- Hatirlatmasi atlanan firma: hatirlatma 2 is gunu ertelenir
    update public.pazar_firmalar set sonraki_adim = public.pazar_is_gunu_ekle(v_bugun, 2), updated_at = now()
     where id = f.id and crm_asama in ('sorgulandi', 'hatirlatma1');
    insert into public.pazar_temaslar (company_id, firma_id, gorev_id, adim, isleyen) values (g.company_id, f.id, g.id, 'atla', v_isleyen);
    update public.pazar_gorevler set durum = 'atlandi', isleyen = coalesce(isleyen, v_isleyen), tamamlanma = now() where id = g.id;
  else
    raise exception 'Geçersiz işlem.';
  end if;

  return public.pazar_gorev_bilgi(p_token);
end;
$$;

-- 8) Gunluk mail ozeti (edge): gunun gorevleri + firma ozeti
create or replace function public.pazar_gorev_ozeti(p_company uuid, p_tarih date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'sira', g.sira, 'neden', g.neden, 'token', g.token, 'durum', g.durum,
      'ad', f.ad, 'ulke', f.ulke, 'firma_durum', f.durum, 'crm_asama', f.crm_asama,
      'son_siparis', public.pazar_firma_son_siparis(f.id),
      'yetkili', (select coalesce(k.ad, k.eposta) from public.pazar_kisiler k where k.firma_id = f.id
                   order by (k.eposta is not null and k.eposta_gecerli) desc, k.created_at limit 1),
      'son_temas', f.son_temas,
      'fuar', (select c.etiket from public.pazar_fuar_katilimlari c where c.firma_id = f.id order by c.yil desc nulls last limit 1)
    ) order by g.sira), '[]'::jsonb)
  from public.pazar_gorevler g join public.pazar_firmalar f on f.id = g.firma_id
  where g.company_id = p_company and g.tarih = p_tarih;
$$;

revoke all on function public.pazar_is_gunu_ekle(date, integer) from public, anon, authenticated;
revoke all on function public.pazar_firma_aktif(uuid) from public, anon, authenticated;
revoke all on function public.pazar_firma_son_siparis(uuid) from public, anon, authenticated;
revoke all on function public.pazar_gorev_olustur(uuid, date, integer) from public, anon, authenticated;
revoke all on function public.pazar_gorev_bilgi(text) from public, anon, authenticated;
revoke all on function public.pazar_gorev_isle(text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.pazar_gorev_ozeti(uuid, date) from public, anon, authenticated;
