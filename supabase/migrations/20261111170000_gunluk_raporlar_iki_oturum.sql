-- 11.11.2026: SIPARIS RAPORU + NAVLUN TABLOSU her gun 08:00 ve 17:00 (Istanbul).
-- Kullanici: "Guncel navlun excelinin ve siparis raporunun excelinin her gun sabah 08.00 ve 17.00 raporlanmasini
-- saglayalim." Tekrar korumasi artik sirket + gun + OTURUM (sabah / aksam) icin tek zamanlanmis kayit.
-- Alicilar edge secret'larinda (SIPARIS_RAPOR_ALICI / NAVLUN_TABLOSU_ALICI); repoya yazilmaz.

alter table public.siparis_rapor_gonderimleri add column if not exists oturum text not null default 'aksam'
  check (oturum in ('sabah', 'aksam'));
drop index if exists public.siparis_rapor_gonderimleri_gun_uniq;
create unique index if not exists siparis_rapor_gonderimleri_oturum_uniq
  on public.siparis_rapor_gonderimleri (company_id, rapor_tarihi, oturum) where not elle;

alter table public.navlun_tablosu_gonderimleri add column if not exists oturum text not null default 'aksam'
  check (oturum in ('sabah', 'aksam'));
create unique index if not exists navlun_tablosu_gonderimleri_oturum_uniq
  on public.navlun_tablosu_gonderimleri (company_id, rapor_tarihi, oturum) where not elle and not test;

-- Zamanlama: 05:00 ve 14:00 UTC = 08:00 ve 17:00 TR, her gun. Anahtar repoya YAZILMAZ: komut mevcut
-- 'ic-gunluk-rapor-aksam' isinden turetilir (yalniz fonksiyon adi degisir).
do $$
declare v_komut text;
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron yok; zamanlanmadi.';
    return;
  end if;
  select command into v_komut from cron.job where jobname = 'ic-gunluk-rapor-aksam' limit 1;
  if v_komut is null then
    raise notice 'ic-gunluk-rapor-aksam bulunamadi; raporlar zamanlanmadi.';
    return;
  end if;
  perform cron.unschedule(j.jobname) from cron.job j
    where j.jobname in ('siparis-rapor', 'siparis-rapor-sabah', 'siparis-rapor-aksam', 'navlun-tablosu-sabah', 'navlun-tablosu-aksam');
  perform cron.schedule('siparis-rapor-sabah', '0 5 * * *', replace(v_komut, '/functions/v1/ic-gunluk-rapor''', '/functions/v1/siparis-rapor'''));
  perform cron.schedule('siparis-rapor-aksam', '0 14 * * *', replace(v_komut, '/functions/v1/ic-gunluk-rapor''', '/functions/v1/siparis-rapor'''));
  perform cron.schedule('navlun-tablosu-sabah', '0 5 * * *', replace(v_komut, '/functions/v1/ic-gunluk-rapor''', '/functions/v1/navlun-tablosu'''));
  perform cron.schedule('navlun-tablosu-aksam', '0 14 * * *', replace(v_komut, '/functions/v1/ic-gunluk-rapor''', '/functions/v1/navlun-tablosu'''));
end $$;
