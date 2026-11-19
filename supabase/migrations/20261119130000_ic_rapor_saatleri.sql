-- ============================================================================
-- IC PIYASA RAPORU SAATLERI (19.11.2026)
-- Kullanici: "Ic piyasa raporu gunde 3 defa gidecek: sabah 09.00, ogle 12.00, aksam 17.00."
-- pg_cron ic-gunluk-rapor-sabah / -ogle / -aksam: 06:15 / 09:15 / 14:15 UTC -> 06:00 / 09:00 / 14:00 UTC (TR = UTC+3).
-- Edge penceresi (IC_RAPOR_SAATI, -5 / +60 dk) ayni gun guncellendi; yeni edge eski :15 saatini de kabul eder, bu yuzden
-- once edge yayinlandi, sonra bu degisiklik uygulandi. Komutlar (anahtar) DEGISMEZ, yalniz zamanlama.
-- Canliya 19.11.2026 Supabase MCP ile uygulandi (bu dosya repo senkronudur). Idempotent.
-- ============================================================================
do $$
declare j record;
begin
  for j in select jobid, jobname from cron.job where jobname in ('ic-gunluk-rapor-sabah', 'ic-gunluk-rapor-ogle', 'ic-gunluk-rapor-aksam') loop
    perform cron.alter_job(j.jobid, schedule := case j.jobname
      when 'ic-gunluk-rapor-sabah' then '0 6 * * *'
      when 'ic-gunluk-rapor-ogle' then '0 9 * * *'
      else '0 14 * * *' end);
  end loop;
end;
$$;
