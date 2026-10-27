-- ============================================================================
-- SATIN ALMA: TEST DEPARTMANI + DEPARTMAN SILME (27.10.2026)
-- ============================================================================
-- Kullanici: "Test mailleri mesensei282@gmail.com adresine gitsin." ve
-- "departman ekleyebiliyorum fakat silebilmeliyim."
--
-- 1) satin_alma_departmanlari.test: test departmanindan gonderilen listelerin
--    talep ve sonuc mailleri edge function'da SADECE test adresine gider
--    (execution@ / bbt@'ye hicbir sey gitmez), konu "[TEST] " ile baslar.
--    sa_liste_json ve sa_token_bilgi 'test' alanini doner.
-- 2) sa_departman_kaydet(p_id, p_ad, p_aktif, p_test): 4. parametre eklendi
--    (null = degistirme). Eski 3 parametreli surum kaldirildi; 3 adli
--    parametreyle cagiran eski arayuz yeni surume dusmeye devam eder.
-- 3) sa_departman_sil(p_id): departmani, listelerini ve kalemlerini kalici
--    olarak siler (FK RESTRICT oldugu icin once listeler). Sayilari doner.
--    Denetim tetikleyicileri silinen satirlari kaydeder.
-- Mevcut veriye DOKUNMAZ (yeni kolon varsayilan false).
-- ============================================================================

alter table public.satin_alma_departmanlari add column if not exists test boolean not null default false;

-- Liste verisine departmanin test bayragi
create or replace function public.sa_liste_json(p_liste_id uuid)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', l.id, 'liste_no', l.liste_no, 'durum', l.durum,
    'departman', d.ad, 'departman_id', d.id, 'sirket', c.company_name, 'test', d.test,
    'gonderen_ad', l.gonderen_ad, 'gonderim_zamani', l.gonderim_zamani,
    'karar_veren_email', l.karar_veren_email, 'karar_zamani', l.karar_zamani, 'karar_notu', l.karar_notu,
    'gonderim_maili', l.gonderim_maili, 'sonuc_maili', l.sonuc_maili,
    'cek_durumu', l.cek_durumu, 'cek_tamamlanma', l.cek_tamamlanma,
    'kalemler', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', k.id, 'kategori', k.kategori, 'urun', k.urun, 'miktar', k.miktar, 'birim', k.birim,
        'aciliyet', k.aciliyet, 'aciklama', k.aciklama, 'talep_eden', k.talep_eden,
        'karar', k.karar, 'red_nedeni', k.red_nedeni, 'olusturma', k.olusturma,
        'alindi', k.alindi, 'alinma_zamani', k.alinma_zamani, 'alan_ad', k.alan_ad)
        order by k.olusturma, k.id)
      from public.satin_alma_kalemleri k where k.liste_id = l.id), '[]'::jsonb))
  from public.satin_alma_listeleri l
  join public.satin_alma_departmanlari d on d.id = l.departman_id
  join public.companies c on c.id = l.company_id
  where l.id = p_liste_id;
$function$;

-- Girissiz departman sayfasi: test bayragi eklendi (geri kalan ayni)
create or replace function public.sa_token_bilgi(p_token text)
 returns jsonb
 language plpgsql
 stable
 security definer
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
                     'alindi', k.alindi, 'alinma_zamani', k.alinma_zamani) as j, l.karar_zamani, k.olusturma
            from public.satin_alma_kalemleri k
            join public.satin_alma_listeleri l on l.id = k.liste_id
            where l.departman_id = d.id and l.durum = 'sonuclandi' and k.karar = 'onaylandi'
            order by l.karar_zamani desc, k.olusturma limit 300) y), '[]'::jsonb)
  );
end; $function$;

-- Departman ekle / guncelle: test bayragi (null = degistirme; yeni kayitta false)
drop function if exists public.sa_departman_kaydet(uuid, text, boolean);
create or replace function public.sa_departman_kaydet(p_id uuid, p_ad text, p_aktif boolean default true, p_test boolean default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.sa_yetki_kontrol();
  v_ad text := regexp_replace(btrim(coalesce(p_ad, '')), '\s+', ' ', 'g');
  v_id uuid;
begin
  if char_length(v_ad) not between 2 and 60 then
    raise exception 'Departman adı 2–60 karakter olmalı.' using errcode = '23514';
  end if;
  if exists (select 1 from public.satin_alma_departmanlari d
             where d.company_id = v_sirket and lower(d.ad) = lower(v_ad) and d.id is distinct from p_id) then
    raise exception 'Bu adla bir departman zaten var.' using errcode = '23505';
  end if;
  if p_id is null then
    insert into public.satin_alma_departmanlari (company_id, ad, aktif, test, sira)
    values (v_sirket, v_ad, coalesce(p_aktif, true), coalesce(p_test, false),
            coalesce((select max(sira) + 1 from public.satin_alma_departmanlari where company_id = v_sirket), 0))
    returning id into v_id;
  else
    update public.satin_alma_departmanlari
       set ad = v_ad, aktif = coalesce(p_aktif, aktif), test = coalesce(p_test, test)
     where id = p_id and company_id = v_sirket returning id into v_id;
    if v_id is null then
      raise exception 'Departman bulunamadı.' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end; $function$;

-- Departmani KALICI siler: once listeler (kalemler cascade), sonra departman.
create or replace function public.sa_departman_sil(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.sa_yetki_kontrol();
  v_ad text;
  v_liste int;
  v_kalem int;
begin
  select d.ad into v_ad from public.satin_alma_departmanlari d
   where d.id = p_id and d.company_id = v_sirket for update;
  if v_ad is null then
    raise exception 'Departman bulunamadı.' using errcode = 'P0002';
  end if;
  select count(*) into v_kalem from public.satin_alma_kalemleri k
    join public.satin_alma_listeleri l on l.id = k.liste_id where l.departman_id = p_id;
  delete from public.satin_alma_listeleri l where l.departman_id = p_id and l.company_id = v_sirket;
  get diagnostics v_liste = row_count;
  delete from public.satin_alma_departmanlari d where d.id = p_id and d.company_id = v_sirket;
  return jsonb_build_object('departman', v_ad, 'liste', v_liste, 'kalem', v_kalem);
end; $function$;

revoke all on function public.sa_departman_kaydet(uuid, text, boolean, boolean) from public, anon;
revoke all on function public.sa_departman_sil(uuid) from public, anon;
grant execute on function public.sa_departman_kaydet(uuid, text, boolean, boolean), public.sa_departman_sil(uuid) to authenticated;
