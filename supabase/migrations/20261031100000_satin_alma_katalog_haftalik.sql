-- ============================================================================
-- SATIN ALMA: URUN KATALOGU (secerek ilerleme) + TEDARIKCI + YENI BIRIMLER +
-- TOPLU EKLEME (Excel / gecen hafta) + HAFTALIK LISTE HATIRLATMASI (31.10.2026)
-- ============================================================================
-- Kullanici (30.10.2026): "Her hafta persembe gunu siparis veriliyor (mutfak alisveris
-- listesi, Excel). Burak Bey'den onay alinmasi gerekiyor." Onerilen 5 ek kabul edildi +
-- "URUNLER HER SEFERINDE KENDINI OTOMATIK KAYIT ETSIN. KULLANA KULLANA BIZE KOLAYLIK
-- SAGLAYACAKTIR. Bir sure sonra secerek ilerleyebilmeliyiz."
--
-- SADECE EKLEME / GENISLETME. Mevcut liste / kalem verisine DOKUNMAZ (yeni kolonlar bos).
--  1) Birim listesi genisler: + kova, bidon, gr (CHECK yeniden; eski degerlerin hepsi gecerli).
--  2) satin_alma_kalemleri.tedarikci (ops., <=80): fiste tedarikci bazinda gruplama.
--  3) satin_alma_urunleri (urun gecmisi = katalog) + tedarikci, son_miktar; tetikleyici
--     bunlari da gunceller (form GONDERILINCE; test formu haric - kural ayni).
--  4) sa_token_urunler: + tedarikci, son_miktar ve DEPARTMANA OZEL kullanim / son miktar /
--     son birim / son tarih (katalogdan "secerek ilerleme").
--  5) sa_token_kalemler_ekle: toplu ekleme (Excel / gecen haftanin listesi / katalog secimi).
--     Her satir mevcut sa_token_kalem_ekle kurallariyla eklenir (tek kural yeri); formda
--     zaten olan urun ATLANIR ve raporlanir; gecersiz satir TUM islemi geri alir.
--  6) Departman haftalik liste: haftalik_gun (1=Pzt..7=Paz), hatirlatma_eposta (<=3),
--     son_hatirlatma. sa_departman_haftalik (yetkili) ve sa_haftalik_hatirlatma_al /
--     _sonuc (yalniz service_role; pg_cron -> edge "satin-alma" islem "haftalik_hatirlatma").
--  7) sa_liste_json + 'tedarikci', 'haftalik'; sa_token_bilgi + 'haftalik_gun', onaylananlarda
--     'tedarikci'. Govdeler 20261027120000 / 20261027100000 ile AYNEN + yeni alanlar.
-- ============================================================================

-- 1) Birimler
alter table public.satin_alma_kalemleri drop constraint if exists satin_alma_kalemleri_birim_check;
alter table public.satin_alma_kalemleri add constraint satin_alma_kalemleri_birim_check
  check (birim = any (array['adet', 'paket', 'koli', 'kutu', 'top', 'kg', 'gr', 'litre', 'metre', 'takim', 'kova', 'bidon', 'diger']::text[]));

-- 2) Tedarikci
alter table public.satin_alma_kalemleri add column if not exists tedarikci text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'satin_alma_kalemleri_tedarikci_check') then
    alter table public.satin_alma_kalemleri add constraint satin_alma_kalemleri_tedarikci_check
      check (tedarikci is null or char_length(tedarikci) between 1 and 80);
  end if;
end $$;
comment on column public.satin_alma_kalemleri.tedarikci is 'Nereden alinacak (ops., ör. CEM MARKET). Onayli fiste gruplama (31.10.2026).';

-- 3) Katalog alanlari
alter table public.satin_alma_urunleri add column if not exists tedarikci text;
alter table public.satin_alma_urunleri add column if not exists son_miktar numeric;

create or replace function public.sa_urun_gecmisi_kaydet()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if old.durum = 'taslak' and new.durum = 'bekliyor' and not coalesce(new.test, false) then
    insert into public.satin_alma_urunleri as u (company_id, ad, ad_norm, kategori, birim, kullanim, ilk_kullanim, son_kullanim, tedarikci, son_miktar)
    select new.company_id,
           (array_agg(k.urun order by k.olusturma, k.id))[1],
           x.n,
           (array_agg(k.kategori order by k.olusturma desc, k.id))[1],
           (array_agg(k.birim order by k.olusturma desc, k.id))[1],
           count(*), now(), now(),
           (array_agg(k.tedarikci order by k.olusturma desc, k.id) filter (where k.tedarikci is not null))[1],
           (array_agg(k.miktar order by k.olusturma desc, k.id))[1]
      from public.satin_alma_kalemleri k
      cross join lateral (select public.sa_urun_norm(k.urun) as n) x
     where k.liste_id = new.id and x.n <> ''
     group by x.n
    on conflict (company_id, ad_norm) do update
      set kullanim = u.kullanim + excluded.kullanim,
          kategori = excluded.kategori,
          birim = excluded.birim,
          tedarikci = coalesce(excluded.tedarikci, u.tedarikci),
          son_miktar = excluded.son_miktar,
          son_kullanim = now();
  end if;
  return null;
end; $function$;

-- 4) Talep formu katalogu / onerileri (departmana ozel ozet ile)
create or replace function public.sa_token_urunler(p_token text)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  d public.satin_alma_departmanlari;
begin
  d := public.sa_token_departman(p_token);
  if d.id is null then return null; end if;
  return coalesce((
    with dep as (
      select public.sa_urun_norm(k.urun) as n,
             count(*)::int as dep_kullanim,
             (array_agg(k.miktar order by l.gonderim_zamani desc, k.olusturma desc))[1] as dep_son_miktar,
             (array_agg(k.birim order by l.gonderim_zamani desc, k.olusturma desc))[1] as dep_son_birim,
             max(l.gonderim_zamani) as dep_son
        from public.satin_alma_kalemleri k
        join public.satin_alma_listeleri l on l.id = k.liste_id
       where l.departman_id = d.id and l.durum <> 'taslak' and not coalesce(l.test, false)
       group by 1)
    select jsonb_agg(jsonb_build_object(
             'ad', x.ad, 'kategori', x.kategori, 'birim', x.birim, 'kullanim', x.kullanim,
             'tedarikci', x.tedarikci, 'son_miktar', x.son_miktar,
             'dep_kullanim', coalesce(x.dep_kullanim, 0), 'dep_son_miktar', x.dep_son_miktar,
             'dep_son_birim', x.dep_son_birim, 'dep_son', x.dep_son)
           order by coalesce(x.dep_kullanim, 0) desc, x.kullanim desc, x.son_kullanim desc)
      from (select u.ad, u.kategori, u.birim, u.kullanim, u.son_kullanim, u.tedarikci, u.son_miktar,
                   dep.dep_kullanim, dep.dep_son_miktar, dep.dep_son_birim, dep.dep_son
              from public.satin_alma_urunleri u
              left join dep on dep.n = u.ad_norm
             where u.company_id = d.company_id
             order by coalesce(dep.dep_kullanim, 0) desc, u.kullanim desc, u.son_kullanim desc
             limit 1000) x), '[]'::jsonb);
end; $function$;

-- ---------------------------------------------------------------------------
-- Kalem ekle: 20261028100000 ile AYNI + yeni birimler + tedarikci
-- ---------------------------------------------------------------------------
create or replace function public.sa_token_kalem_ekle(p_token text, p_kalem jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d public.satin_alma_departmanlari;
  v_liste uuid;
  v_id uuid;
  v_miktar numeric;
  v_var public.satin_alma_kalemleri;
  v_tedarikci text := nullif(regexp_replace(btrim(coalesce(p_kalem ->> 'tedarikci', '')), '\s+', ' ', 'g'), '');
begin
  d := public.sa_token_departman(p_token);
  if d.id is null then
    raise exception 'Bağlantı geçersiz veya departman pasif.' using errcode = 'P0002';
  end if;
  select l.id into v_liste from public.satin_alma_listeleri l where l.departman_id = d.id and l.durum = 'taslak' for update;
  if v_liste is null then
    begin
      insert into public.satin_alma_listeleri (company_id, departman_id) values (d.company_id, d.id) returning id into v_liste;
    exception when unique_violation then
      select l.id into v_liste from public.satin_alma_listeleri l where l.departman_id = d.id and l.durum = 'taslak' for update;
    end;
  end if;
  if (select count(*) from public.satin_alma_kalemleri k where k.liste_id = v_liste) >= 100 then
    raise exception 'Bir listede en fazla 100 kalem olabilir. Listeyi gönderip yenisine devam edin.' using errcode = '23514';
  end if;
  begin
    v_miktar := round((p_kalem ->> 'miktar')::numeric, 2);
  exception when others then
    raise exception 'Miktar geçersiz.' using errcode = '23514';
  end;
  if v_miktar is null or v_miktar <= 0 or v_miktar > 1000000 then
    raise exception 'Miktar 0''dan büyük olmalı.' using errcode = '23514';
  end if;
  if coalesce(p_kalem ->> 'kategori', '') not in ('kirtasiye', 'temizlik', 'mutfak', 'elektronik', 'is_guvenligi', 'diger') then
    raise exception 'Kategori seçin.' using errcode = '23514';
  end if;
  if coalesce(p_kalem ->> 'birim', '') not in ('adet', 'paket', 'koli', 'kutu', 'top', 'kg', 'gr', 'litre', 'metre', 'takim', 'kova', 'bidon', 'diger') then
    raise exception 'Birim seçin.' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_kalem ->> 'urun', ''))) not between 2 and 200 then
    raise exception 'Ürün adını yazın (2–200 karakter).' using errcode = '23514';
  end if;
  if not public.sa_ad_soyad_gecerli(p_kalem ->> 'talep_eden') then
    raise exception 'Talep eden kişinin adını ve soyadını yazın (ör. Ayşe Yılmaz).' using errcode = '23514';
  end if;
  if char_length(coalesce(p_kalem ->> 'aciklama', '')) > 500 then
    raise exception 'Not en fazla 500 karakter olabilir.' using errcode = '23514';
  end if;
  if char_length(coalesce(v_tedarikci, '')) > 80 then
    raise exception 'Tedarikçi en fazla 80 karakter olabilir.' using errcode = '23514';
  end if;
  -- 28.10.2026: ayni formda ayni urun ikinci satir olarak eklenmez (miktar artirilir)
  select k.* into v_var from public.satin_alma_kalemleri k
   where k.liste_id = v_liste and public.sa_urun_norm(k.urun) = public.sa_urun_norm(p_kalem ->> 'urun')
   order by k.olusturma limit 1;
  if v_var.id is not null then
    raise exception 'Bu ürün formda zaten var: % · % % (%). Yeni satır yerine mevcut kalemin miktarını artırın.',
      v_var.urun, replace(trim_scale(v_var.miktar)::text, '.', ','),
      case v_var.birim when 'adet' then 'Adet' when 'paket' then 'Paket' when 'koli' then 'Koli' when 'kutu' then 'Kutu'
        when 'top' then 'Top' when 'kg' then 'Kg' when 'gr' then 'Gr' when 'litre' then 'Litre' when 'metre' then 'Metre'
        when 'takim' then 'Takım' when 'kova' then 'Kova' when 'bidon' then 'Bidon' else 'Diğer' end,
      v_var.talep_eden
      using errcode = '23505';
  end if;
  -- olusturma = clock_timestamp(): toplu eklemede (ayni islem) liste sirasi korunur
  insert into public.satin_alma_kalemleri (company_id, liste_id, kategori, urun, miktar, birim, aciliyet, aciklama, talep_eden, tedarikci, olusturma)
  values (
    d.company_id, v_liste, p_kalem ->> 'kategori', btrim(p_kalem ->> 'urun'), v_miktar, p_kalem ->> 'birim',
    case when p_kalem ->> 'aciliyet' = 'acil' then 'acil' else 'normal' end,
    nullif(btrim(coalesce(p_kalem ->> 'aciklama', '')), ''),
    public.sa_ad_soyad_duzelt(p_kalem ->> 'talep_eden'),
    v_tedarikci, clock_timestamp())
  returning id into v_id;
  update public.satin_alma_listeleri set guncelleme = now() where id = v_liste;
  return v_id;
end; $function$;

-- ---------------------------------------------------------------------------
-- 5) Toplu ekleme. p_kalemler = [{kategori, urun, miktar, birim, aciliyet?, aciklama?, tedarikci?}]
-- talep_eden tum satirlar icin ayni (p_talep_eden). Formda zaten olan urun atlanir.
-- Donus: {"eklenen": n, "atlanan": [{"sira": i, "urun": "...", "neden": "..."}]}
-- ---------------------------------------------------------------------------
create or replace function public.sa_token_kalemler_ekle(p_token text, p_kalemler jsonb, p_talep_eden text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_eklenen integer := 0;
  v_atlanan jsonb := '[]'::jsonb;
  v_x jsonb;
  v_i integer := 0;
  v_id uuid;
begin
  if public.sa_token_departman(p_token) is null or (public.sa_token_departman(p_token)).id is null then
    raise exception 'Bağlantı geçersiz veya departman pasif.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_kalemler) is distinct from 'array' or jsonb_array_length(p_kalemler) = 0 then
    raise exception 'Eklenecek kalem yok.' using errcode = '23514';
  end if;
  if jsonb_array_length(p_kalemler) > 100 then
    raise exception 'Tek seferde en fazla 100 kalem eklenebilir.' using errcode = '23514';
  end if;
  if not public.sa_ad_soyad_gecerli(p_talep_eden) then
    raise exception 'Talep eden kişinin adını ve soyadını yazın (ör. Ayşe Yılmaz).' using errcode = '23514';
  end if;
  for v_x in select value from jsonb_array_elements(p_kalemler) loop
    v_i := v_i + 1;
    if jsonb_typeof(v_x) is distinct from 'object' then
      raise exception 'Satır %: geçersiz kalem.', v_i using errcode = '23514';
    end if;
    begin
      v_id := public.sa_token_kalem_ekle(p_token, (v_x - 'talep_eden') || jsonb_build_object('talep_eden', p_talep_eden));
      v_eklenen := v_eklenen + 1;
    exception
      when unique_violation then
        v_atlanan := v_atlanan || jsonb_build_array(jsonb_build_object('sira', v_i, 'urun', btrim(coalesce(v_x ->> 'urun', '')), 'neden', 'Formda zaten var'));
      when others then
        raise exception 'Satır % (%): %', v_i, left(btrim(coalesce(v_x ->> 'urun', '')), 60), sqlerrm using errcode = sqlstate;
    end;
  end loop;
  return jsonb_build_object('eklenen', v_eklenen, 'atlanan', v_atlanan);
end; $function$;

-- ---------------------------------------------------------------------------
-- 6) Haftalik liste + hatirlatma
-- ---------------------------------------------------------------------------
alter table public.satin_alma_departmanlari add column if not exists haftalik_gun smallint;
alter table public.satin_alma_departmanlari add column if not exists hatirlatma_eposta text;
alter table public.satin_alma_departmanlari add column if not exists son_hatirlatma date;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'satin_alma_departmanlari_haftalik_gun_check') then
    alter table public.satin_alma_departmanlari add constraint satin_alma_departmanlari_haftalik_gun_check
      check (haftalik_gun is null or haftalik_gun between 1 and 7);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'satin_alma_departmanlari_hatirlatma_eposta_check') then
    alter table public.satin_alma_departmanlari add constraint satin_alma_departmanlari_hatirlatma_eposta_check
      check (hatirlatma_eposta is null or (
        hatirlatma_eposta ~ '^[^\s@,]+@[^\s@,]+\.[^\s@,]+(,[^\s@,]+@[^\s@,]+\.[^\s@,]+)*$'
        and array_length(string_to_array(hatirlatma_eposta, ','), 1) <= 3));
  end if;
end $$;
comment on column public.satin_alma_departmanlari.haftalik_gun is 'Haftalik liste gunu (ISO: 1=Pazartesi..7=Pazar). O gun 09:00 TR liste gonderilmediyse hatirlatma (31.10.2026).';

-- Yetkili: haftalik gun + hatirlatma adresleri (bos = kapali)
create or replace function public.sa_departman_haftalik(p_id uuid, p_gun smallint, p_eposta text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := public.sa_yetki_kontrol();
  v_eposta text;
begin
  if p_gun is not null and p_gun not between 1 and 7 then
    raise exception 'Geçersiz gün.' using errcode = '23514';
  end if;
  select string_agg(distinct a, ',' order by a) into v_eposta
    from (select lower(btrim(x)) a from unnest(string_to_array(coalesce(p_eposta, ''), ',')) x) y
   where a <> '';
  if v_eposta is not null and (v_eposta !~ '^[^\s@,]+@[^\s@,]+\.[^\s@,]+(,[^\s@,]+@[^\s@,]+\.[^\s@,]+)*$'
      or array_length(string_to_array(v_eposta, ','), 1) > 3) then
    raise exception 'Hatırlatma için en fazla 3 geçerli e-posta adresi yazın (virgülle).' using errcode = '23514';
  end if;
  update public.satin_alma_departmanlari
     set haftalik_gun = p_gun, hatirlatma_eposta = v_eposta
   where id = p_id and company_id = v_sirket;
  if not found then
    raise exception 'Departman bulunamadı.' using errcode = 'P0002';
  end if;
end; $function$;

-- Servis (pg_cron -> edge): bugun (TR) haftalik gunu olan, aktif, hatirlatma adresi olan ve
-- son 6 gunde (bu hafta) form GONDERMEMIS departmanlari doner ve bugun icin isaretler
-- (ayni gun ikinci kez donmez). Mail gonderilemezse _sonuc(false) isareti geri alir.
create or replace function public.sa_haftalik_hatirlatma_al()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_gun integer := extract(isodow from (now() at time zone 'Europe/Istanbul'))::integer;
  v_sonuc jsonb;
begin
  with s as (
      update public.satin_alma_departmanlari d
         set son_hatirlatma = v_bugun
       where d.aktif and d.haftalik_gun = v_gun and d.hatirlatma_eposta is not null
         and d.son_hatirlatma is distinct from v_bugun
         and not exists (select 1 from public.satin_alma_listeleri l
                          where l.departman_id = d.id and l.durum <> 'taslak' and l.gonderim_zamani >= now() - interval '6 days')
      returning d.id, d.ad, d.token, d.hatirlatma_eposta, d.test, d.company_id)
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'departman', s.ad, 'token', s.token, 'test', s.test,
             'alicilar', to_jsonb(string_to_array(s.hatirlatma_eposta, ',')),
             'sirket', (select c.company_name from public.companies c where c.id = s.company_id),
             'taslak_kalem', (select count(*) from public.satin_alma_kalemleri k join public.satin_alma_listeleri l on l.id = k.liste_id
                               where l.departman_id = s.id and l.durum = 'taslak'),
             'son_liste', (select jsonb_build_object('liste_no', l.liste_no, 'gonderim_zamani', l.gonderim_zamani,
                                                      'kalem', (select count(*) from public.satin_alma_kalemleri k where k.liste_id = l.id))
                             from public.satin_alma_listeleri l where l.departman_id = s.id and l.durum <> 'taslak'
                            order by l.gonderim_zamani desc limit 1)))
      into v_sonuc
      from s;
  return coalesce(v_sonuc, '[]'::jsonb);
end; $function$;

create or replace function public.sa_haftalik_hatirlatma_sonuc(p_id uuid, p_basarili boolean)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  update public.satin_alma_departmanlari set son_hatirlatma = null
   where id = p_id and not coalesce(p_basarili, false)
     and son_hatirlatma = (now() at time zone 'Europe/Istanbul')::date;
$function$;

-- ---------------------------------------------------------------------------
-- 7) JSON ciktilari (govdeler AYNEN + yeni alanlar)
-- ---------------------------------------------------------------------------
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
        'tedarikci', k.tedarikci)
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
                     'alindi', k.alindi, 'alinma_zamani', k.alinma_zamani, 'tedarikci', k.tedarikci) as j, l.karar_zamani, k.olusturma
            from public.satin_alma_kalemleri k
            join public.satin_alma_listeleri l on l.id = k.liste_id
            where l.departman_id = d.id and l.durum = 'sonuclandi' and k.karar = 'onaylandi'
            order by l.karar_zamani desc, k.olusturma limit 300) y), '[]'::jsonb)
  );
end; $function$;

-- Yetkiler: token / servis fonksiyonlari yalniz service_role; haftalik ayar oturumla
revoke all on function public.sa_token_urunler(text) from public, anon, authenticated;
revoke all on function public.sa_token_kalem_ekle(text, jsonb) from public, anon, authenticated;
revoke all on function public.sa_token_kalemler_ekle(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.sa_haftalik_hatirlatma_al() from public, anon, authenticated;
revoke all on function public.sa_haftalik_hatirlatma_sonuc(uuid, boolean) from public, anon, authenticated;
revoke all on function public.sa_urun_gecmisi_kaydet() from public, anon, authenticated;
revoke all on function public.sa_token_bilgi(text) from public, anon, authenticated;
revoke all on function public.sa_liste_json(uuid) from public, anon, authenticated;
grant execute on function public.sa_token_urunler(text), public.sa_token_kalem_ekle(text, jsonb),
  public.sa_token_kalemler_ekle(text, jsonb, text), public.sa_haftalik_hatirlatma_al(),
  public.sa_haftalik_hatirlatma_sonuc(uuid, boolean), public.sa_token_bilgi(text), public.sa_liste_json(uuid) to service_role;
revoke all on function public.sa_departman_haftalik(uuid, smallint, text) from public, anon;
grant execute on function public.sa_departman_haftalik(uuid, smallint, text) to authenticated, service_role;
