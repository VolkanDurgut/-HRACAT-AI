-- 19.11.2026 (kullanici: "Gun icerisinde cok rapor gidiyor"): gunluk ihracat ve ic piyasa raporlari YALNIZ 17:00 TR.
-- Sabah / ogle isleri SILINMEZ, kapatilir (geri acmak: cron.alter_job(jobid, active := true)).
-- Siparis raporu yalniz CUMARTESI 08:00 TR: sabah isi haftalik, aksam isi kapali. Edge penceresi (07:55-09:00) degismedi.
-- DIIB raporu cumartesi 08:00: AYRI migration (20261119170000), yeni edge (07:55-09:00 penceresi) deploy EDILDIKTEN sonra.
select cron.alter_job((select jobid from cron.job where jobname = 'gunluk-rapor-sabah'), active := false);
select cron.alter_job((select jobid from cron.job where jobname = 'gunluk-rapor-ogle'), active := false);
select cron.alter_job((select jobid from cron.job where jobname = 'ic-gunluk-rapor-sabah'), active := false);
select cron.alter_job((select jobid from cron.job where jobname = 'ic-gunluk-rapor-ogle'), active := false);
select cron.alter_job((select jobid from cron.job where jobname = 'siparis-rapor-sabah'), schedule := '0 5 * * 6');
select cron.alter_job((select jobid from cron.job where jobname = 'siparis-rapor-aksam'), active := false);
