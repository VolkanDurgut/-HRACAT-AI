-- Siparis eslestirme adaylari: yalniz miktar ya da yalniz tutar tutan satir aday sayilmaz (esik 3; canlida ayri uygulandi, 16.11.2026).
create or replace function public.siparis_eslesme_adaylari(p_proforma_no text)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_sirket uuid := auth_company_id();
  p record;
  v_f text;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('proformalar') then raise exception 'Yetkiniz yok.'; end if;
  select * into p from proformalar x where x.company_id = v_sirket and siparis_anahtar(x.proforma_no) = siparis_anahtar(p_proforma_no) limit 1;
  if not found then return; end if;
  v_f := ad_esi(v_sirket, 'firma', siparis_firma_anahtar(p.alici_unvan));
  return query
  select jsonb_build_object('anahtar', 'excel:' || s.id, 'proforma_no', s.proforma_no, 'proforma_tarihi', s.proforma_tarihi, 'firma', s.firma,
           'miktar_mt', s.miktar_mt, 'tutar', s.tutar, 'para_birimi', s.para_birimi, 'konteyner', s.konteyner, 'liman', s.liman,
           'durum', s.durum, 'bl_no', s.bl_no, 'puan', z.puan)
  from siparis_defteri s
  cross join lateral (select ad_esi(v_sirket, 'firma', siparis_firma_anahtar(s.firma)) f) ff
  cross join lateral (select
      (case when ff.f = v_f then 3 when least(char_length(ff.f), char_length(v_f)) >= 6 and (ff.f like v_f || '%' or v_f like ff.f || '%') then 2 else 0 end)
    + (case when p.toplam_mts > 0 and abs(coalesce(s.miktar_mt, -1) - p.toplam_mts) < 0.5 then 2 else 0 end)
    + (case when p.toplam > 0 and abs(coalesce(s.tutar, -1) - p.toplam) < 1 then 2 else 0 end) puan) z
  where s.company_id = v_sirket and coalesce(s.durum, '') <> 'iptal'
    and siparis_anahtar(s.proforma_no) <> siparis_anahtar(p.proforma_no)
    and not exists (select 1 from siparis_eslesmeleri e where e.defter_id = s.id)
    and z.puan >= 3                                            -- yalniz miktar ya da yalniz tutar tutmasi aday sayilmaz
  order by z.puan desc, s.proforma_tarihi desc nulls last
  limit 10;
end;
$$;
