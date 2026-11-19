-- ============================================================================
-- 19.11.2026
-- 1) Siparis formu: gecersiz (6 karakterden kisa, ornegin "1") booking'li plan satirlari form uretmez.
-- 2) Kullanici: "Eger bir yuklemeye ait draft BL eklenmisse konsimento talimati gecilmis sayilmali."
--    Konsimento hatirlatma kuyrugu: talimat dosyasi YA DA Draft BL yuklenmisse hatirlatma acilmaz / otomatik satir atlanir.
-- Canli tanimlardan replace ile (baska satir degismez). Canliya 19.11.2026 Supabase MCP ile uygulandi. Idempotent.
-- ============================================================================

do $$
declare
  v_tanim text;
  v_eski text;
  v_yeni text;
begin
  -- 1) siparis_formu_veri
  v_tanim := pg_get_functiondef('public.siparis_formu_veri(uuid, date, date)'::regprocedure);
  v_eski := 'and public.booking_anahtar(v.booking_no) is not null';
  v_yeni := 'and length(coalesce(public.booking_anahtar(v.booking_no), '''')) >= 6';
  if position(v_yeni in v_tanim) = 0 then
    if (length(v_tanim) - length(replace(v_tanim, v_eski, ''))) / length(v_eski) <> 1 then
      raise exception 'siparis_formu_veri beklenen bicimde degil.';
    end if;
    execute replace(v_tanim, v_eski, v_yeni);
  end if;

  -- 2a) kh_tamamlanma_kontrol: Draft BL varsa hatirlatma acilmaz
  v_tanim := pg_get_functiondef('public.kh_tamamlanma_kontrol(uuid)'::regprocedure);
  v_eski := 'select d.company_id, d.konsimento_dosya_url';
  v_yeni := 'select d.company_id, coalesce(d.konsimento_dosya_url, d.draft_bl_dosya_url)';
  if position(v_yeni in v_tanim) = 0 then
    if (length(v_tanim) - length(replace(v_tanim, v_eski, ''))) / length(v_eski) <> 1 then
      raise exception 'kh_tamamlanma_kontrol beklenen bicimde degil.';
    end if;
    execute replace(v_tanim, v_eski, v_yeni);
  end if;

  -- 2b) kh_kuyruk_al: otomatik satir Draft BL varsa da atlanir
  v_tanim := pg_get_functiondef('public.kh_kuyruk_al(integer, uuid)'::regprocedure);
  v_eski := 'if r.tetik = ''otomatik'' and coalesce((v_veri ->> ''konsimento_yuklendi'')::boolean, false) then';
  v_yeni := 'if r.tetik = ''otomatik'' and (coalesce((v_veri ->> ''konsimento_yuklendi'')::boolean, false)'
         || ' or exists (select 1 from public.ihracat_dosyalari dx where dx.id = r.dosya_id and dx.draft_bl_dosya_url is not null)) then';
  if position('dx.draft_bl_dosya_url' in v_tanim) = 0 then
    if (length(v_tanim) - length(replace(v_tanim, v_eski, ''))) / length(v_eski) <> 1 then
      raise exception 'kh_kuyruk_al beklenen bicimde degil.';
    end if;
    v_tanim := replace(v_tanim, v_eski, v_yeni);
    v_tanim := replace(v_tanim, 'Konşimento talimatı zaten yüklenmiş.', 'Konşimento talimatı / Draft BL zaten yüklenmiş.');
    execute v_tanim;
  end if;
end;
$$;
