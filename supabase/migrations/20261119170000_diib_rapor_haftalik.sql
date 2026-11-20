-- 19-20.11.2026 (kullanici): DIIB raporu ve siparis raporu her CUMARTESI 09:00 TR (06:00 UTC). Edge pencereleri 08:55-10:00
-- olan surumler deploy edildikten SONRA uygulanir (eski surumler bu saatteki cagriyi reddeder).
select cron.alter_job((select jobid from cron.job where jobname = 'diib-gunluk-rapor'), schedule := '0 6 * * 6');
select cron.alter_job((select jobid from cron.job where jobname = 'siparis-rapor-sabah'), schedule := '0 6 * * 6');
