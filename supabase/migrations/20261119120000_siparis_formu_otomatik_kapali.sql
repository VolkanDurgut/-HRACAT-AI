-- ============================================================================
-- SIPARIS BILDIRIM FORMU: OTOMATIK GONDERIM KAPALI (19.11.2026)
-- Kullanici: "Siparis bildirim formu icin oto mail gonderimi olmasin. Gonder butonu ile gonderilebilsin. Ve gonderildi
-- olarak isaretlensin ve listede daha once gonderilenler olarak dussun."
-- pg_cron 'siparis-formu' isi kaldirilir (edge de anon cagrida artik hicbir sey gondermez). Elle "Gonder" kaydi
-- siparis_formu_gonderimleri'ne 'gonderildi' olarak yazilir (booking basina bir kez).
-- Canliya 19.11.2026 Supabase MCP ile uygulandi (bu dosya repo senkronudur). Idempotent.
-- ============================================================================
do $$
begin
  if exists (select 1 from cron.job where jobname = 'siparis-formu') then
    perform cron.unschedule('siparis-formu');
  end if;
end;
$$;
