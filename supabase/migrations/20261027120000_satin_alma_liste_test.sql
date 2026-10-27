-- ============================================================================
-- SATIN ALMA: TEST BAYRAGI FORMA YAZILIR (27.10.2026)
-- ============================================================================
-- Sorun: test bilgisi departmandan okunuyordu; departman "Gercek"e donunce test
-- formu gercek gorunuyor, "fis e-postasini yeniden gonder" gercek alicilara
-- gidiyordu. Cozum: satin_alma_listeleri.test gonderim aninda departmandan
-- kopyalanir ve bir daha degismez. Taslakta (henuz gonderilmemis) departmanin
-- bayragi gecerli. Mevcut kayitlar false baslar (canlidaki test formu ayrica
-- kullanici onayiyla isaretlendi).
-- ============================================================================

alter table public.satin_alma_listeleri add column if not exists test boolean not null default false;

-- Liste verisi: gonderilmis formda FORMUN test bayragi, taslakta departmaninki
create or replace function public.sa_liste_json(p_liste_id uuid)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', l.id, 'liste_no', l.liste_no, 'durum', l.durum,
    'departman', d.ad, 'departman_id', d.id, 'sirket', c.company_name, 'test', case when l.durum = 'taslak' then d.test else l.test end,
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


-- Taslagi gonderir: numara verir, durum 'bekliyor', departmanin O ANKI test bayragi forma yazilir. Donus = mail verisi.
create or replace function public.sa_token_liste_gonder(p_token text, p_gonderen text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d public.satin_alma_departmanlari;
  v_liste uuid;
  v_ad text := btrim(coalesce(p_gonderen, ''));
  v_yil text;
begin
  d := public.sa_token_departman(p_token);
  if d.id is null then
    raise exception 'Bağlantı geçersiz veya departman pasif.' using errcode = 'P0002';
  end if;
  if char_length(v_ad) not between 2 and 80 then
    raise exception 'Gönderen olarak adınızı ve soyadınızı yazın.' using errcode = '23514';
  end if;
  select l.id into v_liste from public.satin_alma_listeleri l where l.departman_id = d.id and l.durum = 'taslak' for update;
  if v_liste is null or not exists (select 1 from public.satin_alma_kalemleri k where k.liste_id = v_liste) then
    raise exception 'Gönderilecek kalem yok. Önce listeye kalem ekleyin.' using errcode = '23514';
  end if;
  -- Kotuye kullanim: departman basina 24 saatte en fazla 10 gonderim (her biri mail atar)
  if (select count(*) from public.satin_alma_listeleri l
      where l.departman_id = d.id and l.gonderim_zamani > now() - interval '24 hours') >= 10 then
    raise exception 'Bu departmandan son 24 saatte 10 liste gönderildi. Lütfen daha sonra tekrar deneyin.' using errcode = '23514';
  end if;
  v_yil := extract(year from (now() at time zone 'Europe/Istanbul'))::text;
  update public.satin_alma_listeleri
     set durum = 'bekliyor', gonderen_ad = v_ad, gonderim_zamani = now(), test = d.test,
         liste_no = 'SA-' || v_yil || '-' || lpad(pg_catalog.nextval('public.satin_alma_liste_sira'::regclass)::text, 4, '0')
   where id = v_liste;
  return public.sa_liste_json(v_liste);
end; $function$;

