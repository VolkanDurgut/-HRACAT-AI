-- 19.11.2026 (kullanici): DIIB raporu her CUMARTESI 08:00 TR (05:00 UTC). Edge penceresi 07:55-09:00 olan surum
-- deploy edildikten SONRA uygulanir (eski surum 16:55-18:00 disindaki cagriyi reddeder).
select cron.alter_job((select jobid from cron.job where jobname = 'diib-gunluk-rapor'), schedule := '0 5 * * 6');
