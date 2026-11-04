-- ============================================================================
-- GUNLUK IC PIYASA RAPORU: GUNDE 3 OTURUM + ALICILAR (04.11.2026 aksam)
-- Kullanici: "Ic piyasa bilgilendirme mailleri alicilar execution@ / bbt@ / lojistik@ olarak gitmeli.
-- Bugun 17.15'te gitsin. Bundan sonraki gunlerde sabah ogle aksam olarak gonderilsin."
-- Ihracat raporuyla ayni duzen, 15 dk sonra: SABAH 09:15 (DUNUN raporu), OGLE 12:15, AKSAM 17:15 (TR).
-- KOD (edge function ic-gunluk-rapor, oturum kolonunu yazar) DEPLOY EDILMEDEN ONCE uygulanir.
-- Anahtar repoya YAZILMAZ: cron komutu mevcut "ic-gunluk-rapor" isinden turetilir.
-- ============================================================================

-- 1) Oturum kolonu (mevcut kayitlar = aksam) + tekrar korumasi (sirket, gun, oturum)
alter table public.ic_gunluk_rapor_gonderimleri add column if not exists oturum text not null default 'aksam';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ic_gunluk_rapor_gonderimleri_oturum_kontrol') then
    alter table public.ic_gunluk_rapor_gonderimleri add constraint ic_gunluk_rapor_gonderimleri_oturum_kontrol
      check (oturum in ('sabah', 'ogle', 'aksam'));
  end if;
end $$;
drop index if exists public.ic_gunluk_rapor_gonderimleri_tek;
create unique index if not exists ic_gunluk_rapor_gonderimleri_oturum_tek
  on public.ic_gunluk_rapor_gonderimleri (company_id, rapor_tarihi, oturum) where not test;

-- 2) Alicilar (sirket ici adresler; Bildirimler > Ayarlar'dan degistirilebilir)
update public.ic_piyasa_ayarlari
   set gunluk_rapor_eposta = 'execution@unex.com.tr,bbt@unex.com.tr,lojistik@unex.com.tr'
 where company_id = '387edff1-3aa6-41a4-a370-e42135017043';

-- 3) Zamanlama: 06:15 / 09:15 / 14:15 UTC = 09:15 / 12:15 / 17:15 TR. Eski tek is (16:00 UTC) kaldirilir.
do $$
declare
  v_komut text;
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron yok; zamanlanmadi.';
    return;
  end if;
  select command into v_komut from cron.job where jobname in ('ic-gunluk-rapor', 'ic-gunluk-rapor-aksam') order by jobname limit 1;
  if v_komut is null or position('/functions/v1/ic-gunluk-rapor' in v_komut) = 0 or position('''{}''::jsonb' in v_komut) = 0 then
    raise exception 'ic-gunluk-rapor komutu bulunamadi / beklenen bicimde degil.';
  end if;
  perform cron.unschedule(j.jobname) from cron.job j where j.jobname in ('ic-gunluk-rapor', 'ic-gunluk-rapor-sabah', 'ic-gunluk-rapor-ogle', 'ic-gunluk-rapor-aksam');
  perform cron.schedule('ic-gunluk-rapor-sabah', '15 6 * * *', v_komut);
  perform cron.schedule('ic-gunluk-rapor-ogle', '15 9 * * *', v_komut);
  perform cron.schedule('ic-gunluk-rapor-aksam', '15 14 * * *', v_komut);
end $$;
