-- ============================================================================
-- SIPARIS LISTESI: Excel satiri <-> dosya baglantisi booking ile de (18.11.2026)
-- ============================================================================
-- Sorun: Excel siparis satirinin "BL NO"su cogunlukla booking no'dur; dosyaya baglanma yalniz dosyanin BL'i (konsimento) ya da
-- proforma anahtariyla yapiliyordu. Proforma no "...-1R" gibi tireli revizyonsa (siparis_anahtar yalniz 6 hane + R'yi atar)
-- ve dosyada BL henuz yoksa ayni siparis listede IKI kez gorunuyordu (Excel satiri + dosya satiri).
-- Duzeltme: siparis_listesi_veri 'bagli' sirasina, Excel BL NO'su dosyanin bir rezervasyonunun booking'iyle ayniysa baglama eklendi
-- (mevcut kurallardan SONRA; onlarin sonucu degismez). siparis_anahtar DEGISMEDI (kayitli on odeme anahtarlari bozulmaz).
-- Uygulanmadan once etki listelendi: yalniz ilgili 5 satir yeni baglandi. Canliya 18.11.2026 MCP ile uygulandi. Idempotent.
-- ============================================================================
do $$
declare
  f text;
  eski text := '(select d.dosya_id from dos d where s.bl_no is not null and siparis_anahtar(d.bl_no) = siparis_anahtar(s.bl_no) limit 1),';
  yeni text := '(select d.dosya_id from dos d where s.bl_no is not null and siparis_anahtar(d.bl_no) = siparis_anahtar(s.bl_no) limit 1),
        -- 18.11.2026: Excel BL NO = dosyanin rezervasyon booking''i
        (select d.dosya_id from dos d where booking_anahtar(s.bl_no) is not null and exists (select 1 from rezervasyonlar x
           where x.dosya_id = d.dosya_id and x.company_id = p_company and booking_anahtar(x.booking_no) = booking_anahtar(s.bl_no)) limit 1),';
begin
  f := pg_get_functiondef('public.siparis_listesi_veri(uuid)'::regprocedure);
  if position('Excel BL NO = dosyanin rezervasyon booking' in f) > 0 then
    raise notice 'zaten uygulanmis';
    return;
  end if;
  if position(eski in f) = 0 then
    raise exception 'siparis_listesi_veri beklenen bicimde degil; degistirilmedi.';
  end if;
  execute replace(f, eski, yeni);
end $$;
