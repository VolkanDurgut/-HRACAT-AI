-- 25.11.2026 (kullanici): "Ic piyasa rapor saati 18.00 olarak revize edilsin."
-- Gunluk ic piyasa raporu (edge ic-gunluk-rapor) aksam oturumu 17:00 -> 18:00 TR (15:00 UTC). Edge'in gonderim penceresi
-- _shared/ic-gunluk-rapor.ts IC_RAPOR_SAATI.aksam ile ayni anda guncellendi (once edge, sonra bu is; ters sirada rapor gitmez).
-- Sabah / ogle isleri 19.11.2026'dan beri kapali (active = false); dokunulmadi.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'ic-gunluk-rapor-aksam'),
  schedule := '0 15 * * *'
);
