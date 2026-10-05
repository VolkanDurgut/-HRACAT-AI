-- ============================================================================
-- public.nextval(text) sarmalayicisi (geri yukleme provasi, 05.10.2026)
-- ============================================================================
-- Canlida bu fonksiyon vardi ama repoda HIC tanimli degildi; bu yuzden temiz
-- bir veritabaninda 20261001005150 ve 20261003150000 migration'lari "function
-- public.nextval(text) does not exist" hatasiyla duruyordu (05.10.2026 prova).
-- Tanim canlidan birebir alinmistir (pg_get_functiondef). Yetkileri sonraki
-- migration'lar (20261003150000) kisitlar: sadece postgres + service_role.
-- CANLIDA ZATEN MEVCUT; canliya uygulanmasi gerekmez (CREATE OR REPLACE, zararsiz).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.nextval(seqname text)
 RETURNS bigint
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT nextval(seqname::regclass);
$function$;
