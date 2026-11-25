-- 25.11.2026 (kullanici): "Ihracat raporunu da 18.00 olarak dikkate alalim."
-- Gunluk ihracat raporu (edge gunluk-rapor-gonder) aksam slotu 17:00 -> 18:00 TR (15:00 UTC). Edge'in gonderim penceresi
-- gunluk-rapor-gonder/yetki.ts SLOT_TR_SAATI.aksam ile ayni anda guncellendi (once edge, sonra bu is; ters sirada rapor gitmez).
-- Sabah / ogle isleri 19.11.2026'dan beri kapali (active = false); dokunulmadi.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'gunluk-rapor-aksam'),
  schedule := '0 15 * * *'
);
