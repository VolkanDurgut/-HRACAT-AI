-- 12.11.2026: SIPARIS LISTESINDEN SILME. Kullanici: "Bu musteriden 2 kayit var; siparisler sayfasinda silme islemi
-- yapabilmeliyiz."
-- siparis_satiri_sil(p_anahtar): siparis_listesi_veri() anahtariyla tek satiri siler.
--   'excel:<id>'    -> siparis_defteri satiri (Excel'den aktarilan kayit). Proforma / dosya etkilenmez.
--   'proforma:<id>' -> henuz ihracat dosyasi acilmamis proforma (proformalar). Ayni proforma anahtariyla baska satir
--                      kalmazsa on odeme isareti de silinir.
--   'dosya:<id>'    -> SILINMEZ (ihracat dosyasi acilmis; dosya Ana Panel'den yonetilir).
-- Yetki: on odeme isaretlemeyle ayni (proformalar sayfa yetkisi), yalniz kendi sirketi.

create or replace function public.siparis_satiri_sil(p_anahtar text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := auth_company_id();
  v_tur text := split_part(coalesce(p_anahtar, ''), ':', 1);
  v_id uuid;
  v_pk text;
  v_no text;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('proformalar') then
    raise exception 'Yetkiniz yok.';
  end if;
  begin
    v_id := split_part(p_anahtar, ':', 2)::uuid;
  exception when others then
    raise exception 'Geçersiz kayıt.';
  end;

  if v_tur = 'excel' then
    delete from siparis_defteri where id = v_id and company_id = v_sirket returning proforma_no into v_no;
    if not found then raise exception 'Kayıt bulunamadı.'; end if;
  elsif v_tur = 'proforma' then
    select proforma_no into v_no from proformalar where id = v_id and company_id = v_sirket;
    if not found then raise exception 'Proforma bulunamadı.'; end if;
    v_pk := siparis_anahtar(v_no);
    if exists (select 1 from ihracat_dosyalari d where d.company_id = v_sirket and siparis_anahtar(d.proforma_no) = v_pk) then
      raise exception 'Bu proformanın ihracat dosyası açılmış; dosyayı Ana Panel''den yönetin.';
    end if;
    delete from proformalar where id = v_id and company_id = v_sirket;
  elsif v_tur = 'dosya' then
    raise exception 'İhracat dosyası açılmış siparişler buradan silinmez; dosyayı Ana Panel''den yönetin.';
  else
    raise exception 'Geçersiz kayıt.';
  end if;

  -- Ayni proformaya ait baska satir kalmadiysa on odeme isareti de temizlenir
  v_pk := siparis_anahtar(v_no);
  if v_pk is not null
     and not exists (select 1 from siparis_defteri s where s.company_id = v_sirket and siparis_anahtar(s.proforma_no) = v_pk)
     and not exists (select 1 from proformalar p where p.company_id = v_sirket and siparis_anahtar(p.proforma_no) = v_pk)
     and not exists (select 1 from ihracat_dosyalari d where d.company_id = v_sirket and siparis_anahtar(d.proforma_no) = v_pk) then
    delete from siparis_on_odemeler where company_id = v_sirket and proforma_anahtar = v_pk;
  end if;
  return jsonb_build_object('ok', true, 'proforma_no', v_no);
end;
$$;
revoke all on function public.siparis_satiri_sil(text) from public, anon;
grant execute on function public.siparis_satiri_sil(text) to authenticated;
