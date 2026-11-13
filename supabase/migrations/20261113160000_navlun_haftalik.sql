-- ============================================================================
-- HAFTALIK TOPLU NAVLUN TABLOSU (13.11.2026)
-- ============================================================================
-- Kullanici: "Toplu navlun Excel cumartesi gunleri gonderilecek 09.00 (navlun satin alma degil; butun navlunlarin oldugu,
-- Navlun Bildirimi sayfasindaki Excel indir kismi). Ilk once test gonder, onaylarsam canliya gecirecegiz."
--  1) rapor_alicilari: yeni rapor turu "navlun_haftalik" (Ayarlar > Rapor Alicilari). Alicilar gunluk navlun raporununkilerin
--     KOPYASI, canli = KAPALI: onay gelene kadar zamanlanmis gonderim de YALNIZ test adresine "[TEST]" gider.
--  2) navlun_tablosu_gonderimleri.oturum: "haftalik" (tekrar korumasi: sirket + gun + oturum).
--  3) pg_cron 'navlun-tablosu-haftalik': Cumartesi 06:00 UTC = 09:00 TR, govde {"haftalik": true}. Anahtar repoya YAZILMAZ:
--     komut mevcut 'navlun-tablosu-aksam' isinden turetilir (yalniz govde degisir).
-- Canliya 13.11.2026 Supabase MCP ile uygulandi (bu dosya repo senkronudur). Idempotent.
-- ============================================================================

alter table public.rapor_alicilari drop constraint if exists rapor_alicilari_rapor_check;
alter table public.rapor_alicilari add constraint rapor_alicilari_rapor_check check (rapor in (
  'siparis', 'navlun', 'navlun_haftalik', 'fatura_onay', 'fatura_dagitim', 'musteri_durum',
  'gunluk_ihracat', 'diib', 'vgm', 'konsimento_hatirlatma', 'pazar_gorev', 'satin_alma'));

alter table public.navlun_tablosu_gonderimleri drop constraint if exists navlun_tablosu_gonderimleri_oturum_check;
alter table public.navlun_tablosu_gonderimleri add constraint navlun_tablosu_gonderimleri_oturum_check
  check (oturum in ('sabah', 'aksam', 'haftalik'));

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
                      'fatura_dagitim', 'pazar_gorev', 'musteri_durum', 'satin_alma']) with ordinality as r(rapor, sira)
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
                     'gunluk_ihracat', 'diib', 'vgm', 'konsimento_hatirlatma', 'pazar_gorev', 'satin_alma') then
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

-- Baslangic: gunluk navlun raporunun alicilari, CANLI KAPALI (onaya kadar yalniz test adresi)
insert into public.rapor_alicilari (company_id, rapor, alicilar, cc, canli, guncelleyen, guncelleme)
select a.company_id, 'navlun_haftalik', a.alicilar, a.cc, false, 'kurulum (13.11.2026)', now()
from public.rapor_alicilari a
where a.rapor = 'navlun'
on conflict (company_id, rapor) do nothing;

do $$
declare v_komut text;
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron yok; zamanlanmadi.';
    return;
  end if;
  select command into v_komut from cron.job where jobname = 'navlun-tablosu-aksam' limit 1;
  if v_komut is null then
    raise notice 'navlun-tablosu-aksam bulunamadi; haftalik rapor zamanlanmadi.';
    return;
  end if;
  v_komut := regexp_replace(v_komut, 'body\s*:=\s*''[^'']*''(::jsonb)?', 'body:=''{"haftalik": true}''::jsonb');
  if position('"haftalik"' in v_komut) = 0 then
    raise exception 'navlun-tablosu-haftalik komutu turetilemedi (govde bulunamadi).';
  end if;
  perform cron.unschedule(j.jobname) from cron.job j where j.jobname = 'navlun-tablosu-haftalik';
  perform cron.schedule('navlun-tablosu-haftalik', '0 6 * * 6', v_komut);
end $$;
