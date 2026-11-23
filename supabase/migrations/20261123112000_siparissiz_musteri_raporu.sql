-- 23.11.2026 SIPARISSIZ MUSTERI RAPORU (haftalik). Kullanici: "Mevcut pazar icin siparisi olmayan musterilerimizin ihracattaki
-- export arkadasimiza mail olarak iletilmesi gerekiyor." + "Haftalik ozet maili, Harun Bey (export@)".
--  1) rapor_alicilari: 'siparissiz' (alici export@, CC bbt@ + execution@, CANLI KAPALI: onaya kadar yalniz test adresine "[TEST]").
--  2) siparissiz_rapor_gonderimleri: gonderim kaydi; zamanlanmis gonderim sirket + hafta (pazartesi) icin tek.
--  3) pazar_siparissiz_ozet(sirket, bugun): edge icin veri. Siparissiz = kendi musterimiz (pazar_firmalar.durum = 'musteri'),
--     acik dosyasi / acik ana siparisi yok (pazar_firma_aktif), Siparis Listesi'nde acik siparisi yok
--     (pazar_acik_siparis_anahtarlari) ve yolda / yuklemede mali yok (pazar_siparis_ritmi). Pazar sekmesindeki "Siparissiz" ile ayni.
--     Her musteri: ritim (durum, fark, ritim, son ETD, ort. konteyner, beklenen siparis), son siparis, toplam konteyner, son varis
--     limani, iletisim (e-posta / telefon var mi), CRM asamasi, bekleme, son gorev (kime, ne zaman, durumu).
--  4) pg_cron 'siparissiz-musteri-rapor': her pazartesi 06:00 UTC = 09:00 TR (edge yalniz pencere icinde gonderir).
-- Hicbir mevcut kayit degismez.

-- 1) Rapor alicilari ------------------------------------------------------------------------------------------------------
alter table public.rapor_alicilari drop constraint if exists rapor_alicilari_rapor_check;
alter table public.rapor_alicilari add constraint rapor_alicilari_rapor_check check (rapor in (
  'siparis', 'navlun', 'navlun_haftalik', 'fatura_onay', 'fatura_dagitim', 'musteri_durum',
  'gunluk_ihracat', 'diib', 'vgm', 'konsimento_hatirlatma', 'pazar_gorev', 'satin_alma', 'siparis_formu', 'siparissiz'));

create or replace function public.rapor_alicilari_liste()
returns table (rapor text, alicilar text[], cc text[], canli boolean, kayitli boolean, guncelleyen text, guncelleme timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
begin
  return query
    select r.rapor, coalesce(a.alicilar, '{}'::text[]), coalesce(a.cc, '{}'::text[]), coalesce(a.canli, false), a.rapor is not null,
           a.guncelleyen, a.guncelleme
    from unnest(array['gunluk_ihracat', 'siparis', 'navlun', 'navlun_haftalik', 'diib', 'vgm', 'konsimento_hatirlatma', 'fatura_onay',
                      'fatura_dagitim', 'siparis_formu', 'pazar_gorev', 'siparissiz', 'musteri_durum', 'satin_alma']) with ordinality as r(rapor, sira)
    left join public.rapor_alicilari a on a.company_id = v_sirket and a.rapor = r.rapor
    order by r.sira;
end;
$$;

create or replace function public.rapor_alicilari_kaydet(p_rapor text, p_alicilar text[], p_cc text[], p_canli boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
  v_liste text[];
  v_cc text[];
begin
  if p_rapor not in ('siparis', 'navlun', 'navlun_haftalik', 'fatura_onay', 'fatura_dagitim', 'musteri_durum',
                     'gunluk_ihracat', 'diib', 'vgm', 'konsimento_hatirlatma', 'pazar_gorev', 'satin_alma', 'siparis_formu', 'siparissiz') then
    raise exception 'Bilinmeyen rapor.';
  end if;
  v_liste := public.rapor_adres_temizle(p_alicilar, 'Alıcı');
  v_cc := array(select x from unnest(public.rapor_adres_temizle(p_cc, 'CC')) x where not (x = any (v_liste)));
  -- Alicisi raporun kendisinden gelenler: musteri_durum (musteri), pazar_gorev (ekip)
  if p_rapor not in ('musteri_durum', 'pazar_gorev') and coalesce(array_length(v_liste, 1), 0) = 0
     and (p_canli or p_rapor in ('gunluk_ihracat', 'diib', 'vgm', 'konsimento_hatirlatma', 'satin_alma')) then
    raise exception 'En az bir alıcı gerekli.';
  end if;
  insert into public.rapor_alicilari (company_id, rapor, alicilar, cc, canli, guncelleyen, guncelleme)
  values (v_sirket, p_rapor, v_liste, v_cc, coalesce(p_canli, false), lower(coalesce(auth.jwt() ->> 'email', '')), now())
  on conflict (company_id, rapor) do update
    set alicilar = excluded.alicilar, cc = excluded.cc, canli = excluded.canli, guncelleyen = excluded.guncelleyen, guncelleme = now();
end;
$$;

-- Baslangic: alici export@ (Harun Bey), CC bbt@ + execution@ (gorev maili gibi), CANLI KAPALI. Yalniz Pazar ekibi olan sirketler.
insert into public.rapor_alicilari (company_id, rapor, alicilar, cc, canli, guncelleyen, guncelleme)
select distinct e.company_id, 'siparissiz', array['export@unex.com.tr'], array['bbt@unex.com.tr', 'execution@unex.com.tr'], false, 'kurulum (23.11.2026)', now()
from public.pazar_ekip e
where e.kod = 'export' and e.aktif
on conflict (company_id, rapor) do nothing;

-- 2) Gonderim kaydi -------------------------------------------------------------------------------------------------------
create table if not exists public.siparissiz_rapor_gonderimleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  hafta date not null,
  durum text not null check (durum in ('gonderiliyor', 'gonderildi')),
  test boolean not null default false,
  elle boolean not null default false,
  alicilar text,
  ozet jsonb,
  olusturma timestamptz not null default now(),
  gonderim_zamani timestamptz
);
alter table public.siparissiz_rapor_gonderimleri enable row level security;
create unique index if not exists siparissiz_rapor_gonderimleri_hafta_tek
  on public.siparissiz_rapor_gonderimleri (company_id, hafta) where not elle;
revoke all on public.siparissiz_rapor_gonderimleri from anon, authenticated;

-- 3) Veri -----------------------------------------------------------------------------------------------------------------
create or replace function public.pazar_siparissiz_ozet(p_company uuid, p_bugun date default (now() at time zone 'Europe/Istanbul')::date)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_acik text[];
  v_sevk jsonb;
  v_sonuc jsonb;
begin
  if p_company is null then return null; end if;
  v_acik := public.pazar_acik_siparis_anahtarlari(p_company);
  v_sevk := coalesce(public.pazar_musteri_sevkiyatlari_sirket(p_company)->'sevkiyatlar', '[]'::jsonb);
  with rt as (
    select * from public.pazar_siparis_ritmi(p_company, p_bugun)
  ), m as (
    select f.*, rt.durum rdurum, rt.fark, rt.ritim_gun, rt.dalga, rt.son_etd, rt.ort_konteyner, rt.beklenen_siparis,
           (coalesce(rt.yolda_konteyner, 0) + coalesce(rt.yuklemede_konteyner, 0)) > 0 sevkte,
           public.pazar_firma_aktif(f.id) dosyali,
           public.pazar_anahtar_eslesir(array_append(f.ek_anahtarlar, f.anahtar), v_acik) listede
      from public.pazar_firmalar f
      left join rt on rt.firma_id = f.id
     where f.company_id = p_company and f.durum = 'musteri'
  ), s as (
    select m.* from m where not m.sevkte and not m.dosyali and not m.listede
  )
  select jsonb_build_object(
    'bugun', p_bugun,
    'toplam', (select count(*) from m),
    'aktif', (select count(*) from m where m.sevkte or m.dosyali or m.listede),
    'musteriler', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'ad', s.ad, 'ulke', s.ulke, 'durum', coalesce(s.rdurum, 'veri_az'), 'fark', s.fark, 'ritim_gun', s.ritim_gun,
        'dalga', coalesce(s.dalga, 0), 'son_etd', s.son_etd, 'ort_konteyner', s.ort_konteyner, 'beklenen_siparis', s.beklenen_siparis,
        'son_siparis', public.pazar_firma_son_siparis(s.id),
        'liman', (select x->>'varis' from jsonb_array_elements(v_sevk) x
                   where x->>'firma_id' = s.id::text and nullif(x->>'varis', '') is not null order by x->>'etd' desc limit 1),
        'toplam_konteyner', coalesce((select sum((x->>'konteyner')::numeric)::int from jsonb_array_elements(v_sevk) x
                   where x->>'firma_id' = s.id::text), 0),
        'eposta', exists (select 1 from public.pazar_kisiler k where k.firma_id = s.id and k.eposta is not null and k.eposta_gecerli),
        'telefon', exists (select 1 from public.pazar_kisiler k where k.firma_id = s.id and (k.whatsapp is not null or cardinality(k.telefonlar) > 0)),
        'crm_asama', s.crm_asama, 'bekleme_bitis', s.bekleme_bitis,
        'son_temas', (select max(t.olusturma)::date from public.pazar_temaslar t where t.firma_id = s.id),
        'gorev', (select jsonb_build_object('tarih', g.tarih, 'durum', g.durum, 'neden', g.neden, 'atanan', g.atanan,
                         'hitap', (select e.hitap from public.pazar_ekip e where e.company_id = p_company and e.kod = g.atanan limit 1))
                    from public.pazar_gorevler g where g.firma_id = s.id order by g.tarih desc, g.sira limit 1)
      ) order by s.ad) from s), '[]'::jsonb)
  ) into v_sonuc;
  return v_sonuc;
end; $function$;

revoke all on function public.pazar_siparissiz_ozet(uuid, date) from public, anon, authenticated;
grant execute on function public.pazar_siparissiz_ozet(uuid, date) to service_role;

-- 4) Zamanlama: siparis raporunun komutundan turetilir (ayni anon cagri), her pazartesi 06:00 UTC ------------------------
do $$
declare v_komut text;
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron yok; zamanlanmadi.';
    return;
  end if;
  select command into v_komut from cron.job where jobname = 'siparis-rapor-sabah' limit 1;
  if v_komut is null or position('/functions/v1/siparis-rapor''' in v_komut) = 0 then
    raise notice 'siparis-rapor-sabah bulunamadi; siparissiz musteri raporu zamanlanmadi.';
    return;
  end if;
  v_komut := replace(v_komut, '/functions/v1/siparis-rapor''', '/functions/v1/siparissiz-musteri-rapor''');
  perform cron.unschedule(j.jobname) from cron.job j where j.jobname = 'siparissiz-musteri-rapor';
  perform cron.schedule('siparissiz-musteri-rapor', '0 6 * * 1', v_komut);
end $$;
