-- 14.11.2026 Satin alma: "Degistirerek onayla" (kismi onay).
-- SA-2026-0009'da Burak Bey 3 kalemi "Sadece Cay onaylidir", "Miktar cok" diye REDDETMEK zorunda kaldi;
-- aslinda kismi onaydi. Artik onaylanan kalemde:
--   onay_miktar : onaylanan miktar (null = talep edilen miktar aynen onaylandi)
--   onay_notu   : onay notu ("Yalniz cay alinsin")
-- Yalniz karar = 'onaylandi' iken dolu olabilir. Eski istemci bu alanlari gondermez -> null (davranis ayni).
-- sa_liste_json / sa_token_bilgi alanlari dondurur; fis, mail ve talep ekranlari onaylanan miktari gosterir.

alter table public.satin_alma_kalemleri
  add column if not exists onay_miktar numeric(12, 2),
  add column if not exists onay_notu text;

alter table public.satin_alma_kalemleri
  drop constraint if exists satin_alma_kalemleri_onay_miktar_chk,
  add constraint satin_alma_kalemleri_onay_miktar_chk check (onay_miktar is null or (onay_miktar > 0 and onay_miktar <= 1000000)),
  drop constraint if exists satin_alma_kalemleri_onay_notu_chk,
  add constraint satin_alma_kalemleri_onay_notu_chk check (onay_notu is null or char_length(onay_notu) <= 300);

create or replace function public.sa_karar_ver(p_liste_id uuid, p_kararlar jsonb, p_not text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.sa_yetki_kontrol();
  v_durum text;
  v_toplam int;
  v_eslesen int;
  r jsonb;
  v_miktar numeric;
  v_onay_miktar numeric;
begin
  select l.durum into v_durum from public.satin_alma_listeleri l
   where l.id = p_liste_id and l.company_id = v_sirket for update;
  if v_durum is null then
    raise exception 'Liste bulunamadı.' using errcode = 'P0002';
  end if;
  if v_durum <> 'bekliyor' then
    raise exception 'Bu liste için karar zaten verilmiş.' using errcode = '23514';
  end if;
  if jsonb_typeof(p_kararlar) is distinct from 'array' then
    raise exception 'Karar listesi geçersiz.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_not, '')) > 500 then
    raise exception 'Not en fazla 500 karakter olabilir.' using errcode = '23514';
  end if;
  select count(*) into v_toplam from public.satin_alma_kalemleri k where k.liste_id = p_liste_id;
  select count(distinct k.id) into v_eslesen
    from jsonb_array_elements(p_kararlar) e
    join public.satin_alma_kalemleri k on k.id = (e ->> 'id')::uuid and k.liste_id = p_liste_id
   where e ->> 'karar' in ('onaylandi', 'reddedildi');
  if v_eslesen <> v_toplam or jsonb_array_length(p_kararlar) <> v_toplam then
    raise exception 'Listedeki her kalem için onay ya da red seçin.' using errcode = '23514';
  end if;
  for r in select * from jsonb_array_elements(p_kararlar) loop
    if char_length(coalesce(r ->> 'red_nedeni', '')) > 300 then
      raise exception 'Red nedeni en fazla 300 karakter olabilir.' using errcode = '23514';
    end if;
    if char_length(coalesce(r ->> 'onay_notu', '')) > 300 then
      raise exception 'Onay notu en fazla 300 karakter olabilir.' using errcode = '23514';
    end if;
    v_onay_miktar := null;
    if r ->> 'karar' = 'onaylandi' and nullif(btrim(coalesce(r ->> 'onay_miktar', '')), '') is not null then
      begin
        v_onay_miktar := round((r ->> 'onay_miktar')::numeric, 2);
      exception when others then
        raise exception 'Onaylanan miktar geçersiz.' using errcode = '23514';
      end;
      if v_onay_miktar <= 0 or v_onay_miktar > 1000000 then
        raise exception 'Onaylanan miktar 0''dan büyük olmalı.' using errcode = '23514';
      end if;
      select k.miktar into v_miktar from public.satin_alma_kalemleri k where k.id = (r ->> 'id')::uuid and k.liste_id = p_liste_id;
      if v_onay_miktar = v_miktar then v_onay_miktar := null; end if;
    end if;
    update public.satin_alma_kalemleri
       set karar = r ->> 'karar',
           red_nedeni = case when r ->> 'karar' = 'reddedildi' then nullif(btrim(coalesce(r ->> 'red_nedeni', '')), '') else null end,
           onay_miktar = v_onay_miktar,
           onay_notu = case when r ->> 'karar' = 'onaylandi' then nullif(btrim(coalesce(r ->> 'onay_notu', '')), '') else null end
     where id = (r ->> 'id')::uuid and liste_id = p_liste_id;
  end loop;
  -- Onaylanan kalem varsa AKTIF cek listesi (execution@ girissiz baglantiyla isaretler)
  update public.satin_alma_listeleri
     set durum = 'sonuclandi', karar_zamani = now(),
         karar_veren_email = lower(nullif(coalesce(auth.jwt() ->> 'email', ''), '')),
         karar_notu = nullif(btrim(coalesce(p_not, '')), ''),
         cek_token = case when exists (select 1 from public.satin_alma_kalemleri k where k.liste_id = p_liste_id and k.karar = 'onaylandi')
                          then replace(gen_random_uuid()::text, '-', '') end,
         cek_durumu = case when exists (select 1 from public.satin_alma_kalemleri k where k.liste_id = p_liste_id and k.karar = 'onaylandi')
                           then 'aktif' end
   where id = p_liste_id;
  return public.sa_liste_json(p_liste_id)
    || jsonb_build_object('cek_token', (select l.cek_token from public.satin_alma_listeleri l where l.id = p_liste_id));
end; $function$;

create or replace function public.sa_liste_json(p_liste_id uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', l.id, 'liste_no', l.liste_no, 'durum', l.durum,
    'departman', d.ad, 'departman_id', d.id, 'sirket', c.company_name, 'test', case when l.durum = 'taslak' then d.test else l.test end,
    'haftalik', d.haftalik_gun is not null,
    'gonderen_ad', l.gonderen_ad, 'gonderim_zamani', l.gonderim_zamani,
    'karar_veren_email', l.karar_veren_email, 'karar_zamani', l.karar_zamani, 'karar_notu', l.karar_notu,
    'gonderim_maili', l.gonderim_maili, 'sonuc_maili', l.sonuc_maili,
    'cek_durumu', l.cek_durumu, 'cek_tamamlanma', l.cek_tamamlanma,
    'kalemler', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'kategori', k.kategori, 'urun', k.urun, 'miktar', k.miktar, 'birim', k.birim,
        'aciliyet', k.aciliyet, 'aciklama', k.aciklama, 'talep_eden', k.talep_eden,
        'karar', k.karar, 'red_nedeni', k.red_nedeni, 'olusturma', k.olusturma,
        'alindi', k.alindi, 'alinma_zamani', k.alinma_zamani, 'alan_ad', k.alan_ad,
        'tedarikci', k.tedarikci, 'onay_miktar', k.onay_miktar, 'onay_notu', k.onay_notu)
        order by k.olusturma, k.id)
      from public.satin_alma_kalemleri k where k.liste_id = l.id), '[]'::jsonb))
  from public.satin_alma_listeleri l
  join public.satin_alma_departmanlari d on d.id = l.departman_id
  join public.companies c on c.id = l.company_id
  where l.id = p_liste_id;
$function$;

create or replace function public.sa_token_bilgi(p_token text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  d public.satin_alma_departmanlari;
  v_taslak uuid;
begin
  d := public.sa_token_departman(p_token);
  if d.id is null then return null; end if;
  select l.id into v_taslak from public.satin_alma_listeleri l where l.departman_id = d.id and l.durum = 'taslak';
  return jsonb_build_object(
    'departman', d.ad,
    'test', d.test,
    'haftalik_gun', d.haftalik_gun,
    'sirket', (select c.company_name from public.companies c where c.id = d.company_id),
    'taslak', case when v_taslak is null then null else public.sa_liste_json(v_taslak) end,
    'gecmis', coalesce((
      select jsonb_agg(public.sa_liste_json(x.id) order by x.gonderim_zamani desc)
      from (select l.id, l.gonderim_zamani from public.satin_alma_listeleri l
            where l.departman_id = d.id and l.durum <> 'taslak'
            order by l.gonderim_zamani desc limit 10) x), '[]'::jsonb),
    'onaylananlar', coalesce((
      select jsonb_agg(y.j order by y.karar_zamani desc, y.olusturma)
      from (select jsonb_build_object('id', k.id, 'liste_no', l.liste_no, 'karar_zamani', l.karar_zamani,
                     'kategori', k.kategori, 'urun', k.urun, 'miktar', k.miktar, 'birim', k.birim, 'talep_eden', k.talep_eden,
                     'alindi', k.alindi, 'alinma_zamani', k.alinma_zamani, 'tedarikci', k.tedarikci,
                     'onay_miktar', k.onay_miktar, 'onay_notu', k.onay_notu) as j, l.karar_zamani, k.olusturma
            from public.satin_alma_kalemleri k
            join public.satin_alma_listeleri l on l.id = k.liste_id
            where l.departman_id = d.id and l.durum = 'sonuclandi' and k.karar = 'onaylandi'
            order by l.karar_zamani desc, k.olusturma limit 300) y), '[]'::jsonb)
  );
end; $function$;
