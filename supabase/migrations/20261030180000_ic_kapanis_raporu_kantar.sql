-- ============================================================================
-- IC PIYASA - SIPARIS KAPANIS RAPORU (e-posta) + KANTAR'DA MUSTERI ADI (30.10.2026)
-- ============================================================================
-- Kullanici (lojistik ile gorusme sonrasi, 30.10.2026):
--  - "Siparis tamamlandiginda otomatik olarak mail gitmeli. Test olarak
--    mesensei282@gmail.com; canlida execution@, bbt@, lojistik@."
--  - "Eksik veya az kapanabilme durumu oluyor. Kalan veya fazla giden takibi."
--  - "Ic piyasa kisminda musteriler sifreli gozukmesin."
--
-- SADECE EKLEME / GOVDE DEGISIKLIGI. Tablo silme, veri silme YOK.
--  1) ic_piyasa_ayarlari.kapanis_eposta: kapanis raporu alicilari (virgulle, <=5).
--     Unex icin baslangic degeri mesensei282@gmail.com (test).
--  2) ic_bildirimler.alici'ya 'ekip' eklenir (sirket ici rapor; CC satirdaki
--     degerle gider - ic_bildirim_eposta_al'in "else b.cc" dali).
--  3) ic_bildirim_is_emri: is emri 'tamamlandi' olunca (her kapanista) bir
--     "siparis_kapanis" e-postasi kuyruga girer. Degerler (sirali dizi):
--       [0] is_emri_no  [1] musteri unvani  [2] urun (ambalajli)
--       [3] hedef_tur ('kg'|'arac')  [4] hedef (kg ya da arac sayisi)
--       [5] gerceklesen kg  [6] arac sayisi  [7] kapatan e-posta
--       [8] kapanis zamani (ISO)  [9] siparis tarihi (YYYY-MM-DD ya da '')
--     Fark / eksik-fazla-tam hesabi TEK YERDE: _shared/mesaj-sablonlari.ts
--     (kapanisOzeti). Musteri mesaji (siparis_tamamlandi) kurali DEGISMEDI.
--  4) kantar_ic_is_emirleri / kantar_ic_son_sevkler: "musteri_maskeli" kolonu
--     artik GERCEK adi (kisa ad, yoksa unvan) dondurur. Imza ayni (DROP yok);
--     kolon adi geriye uyum icin korundu. Fiyat kantara yine GELMEZ.
-- ============================================================================

-- 1) Kapanis raporu alicilari
alter table public.ic_piyasa_ayarlari add column if not exists kapanis_eposta text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ic_piyasa_ayarlari_kapanis_eposta_bicim') then
    alter table public.ic_piyasa_ayarlari add constraint ic_piyasa_ayarlari_kapanis_eposta_bicim check (
      kapanis_eposta is null or (
        kapanis_eposta ~ '^[^\s@,]+@[^\s@,]+\.[^\s@,]+(,[^\s@,]+@[^\s@,]+\.[^\s@,]+)*$'
        and array_length(string_to_array(kapanis_eposta, ','), 1) <= 5));
  end if;
end $$;

update public.ic_piyasa_ayarlari set kapanis_eposta = 'mesensei282@gmail.com'
 where company_id = '387edff1-3aa6-41a4-a370-e42135017043' and kapanis_eposta is null;

-- 2) Alici turu: ekip (sirket ici rapor)
alter table public.ic_bildirimler drop constraint if exists ic_bildirimler_alici_check;
alter table public.ic_bildirimler add constraint ic_bildirimler_alici_check
  check (alici = any (array['musteri'::text, 'lojistik'::text, 'yetkili'::text, 'ekip'::text]));

-- 3) Kapanis raporu (mevcut govde AYNEN + kapanis raporu blogu)
create or replace function public.ic_bildirim_is_emri()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  m public.ic_musteriler%rowtype;
  v_adet integer;
  v_kg numeric;
  v_alicilar text[];
  v_id uuid;
begin
  select * into m from public.ic_musteriler where id = new.musteri_id;
  if tg_op = 'INSERT' then
    perform public.ic_bildirim_ekle(new.company_id, new.id, null, 'siparis_alindi', 'musteri', 'whatsapp',
      m.telefon, m.unvan,
      jsonb_build_array(m.unvan, new.is_emri_no, public.ic_urun_yazi(new.urun, new.ambalaj),
        case when new.hedef_tur = 'kg' then public.ic_ton_yazi(new.hedef_kg) else new.hedef_arac::text || ' araç' end,
        coalesce(nullif(btrim(coalesce(new.teslim, '')), ''), '-')),
      new.takip_token);
  elsif new.durum is distinct from old.durum then
    -- Durum degisince bekleyen (gonderilmemis) eski "tamamlandi" mesaji gecersiz olur
    if old.durum = 'tamamlandi' or new.durum = 'tamamlandi' then
      update public.ic_bildirimler
         set durum = 'atlandi',
             hata = case when new.durum = 'tamamlandi' then 'Güncel kapanış mesajıyla değiştirildi.' else 'İş emri yeniden açıldı.' end,
             islem_zamani = now(), isleyen = 'sistem'
       where is_emri_id = new.id and sablon = 'siparis_tamamlandi' and durum = 'bekliyor';
    end if;
    if new.durum = 'tamamlandi' then
      select count(*), coalesce(sum(net_kg), 0) into v_adet, v_kg from public.ic_sevkler where is_emri_id = new.id;
      if v_adet > 0 then
        perform public.ic_bildirim_ekle(new.company_id, new.id, null, 'siparis_tamamlandi', 'musteri', 'whatsapp',
          m.telefon, m.unvan,
          jsonb_build_array(m.unvan, new.is_emri_no, public.ic_urun_yazi(new.urun, new.ambalaj), v_adet::text, public.ic_kg_yazi(v_kg)),
          new.takip_token);
      end if;

      -- Kapanis raporu (30.10.2026): sirket ici, her kapanista bir kez
      select string_to_array(a.kapanis_eposta, ',') into v_alicilar
        from public.ic_piyasa_ayarlari a where a.company_id = new.company_id;
      if coalesce(array_length(v_alicilar, 1), 0) > 0 then
        v_id := public.ic_bildirim_ekle(new.company_id, new.id, null, 'siparis_kapanis', 'ekip', 'eposta',
          v_alicilar[1], 'Sipariş kapanış raporu',
          jsonb_build_array(
            new.is_emri_no, m.unvan, public.ic_urun_yazi(new.urun, new.ambalaj),
            new.hedef_tur,
            case when new.hedef_tur = 'kg' then coalesce(new.hedef_kg, 0)::text else coalesce(new.hedef_arac, 0)::text end,
            v_kg::text, v_adet::text,
            coalesce(lower(nullif(auth.jwt() ->> 'email', '')), ''),
            to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            coalesce(new.siparis_tarihi::text, '')),
          null);
        if array_length(v_alicilar, 1) > 1 then
          update public.ic_bildirimler set cc = v_alicilar[2:] where id = v_id;
        end if;
      end if;
    elsif new.durum = 'iptal' then
      update public.ic_bildirimler set durum = 'atlandi', hata = 'İş emri iptal edildi.', islem_zamani = now(), isleyen = 'sistem'
       where is_emri_id = new.id and alici = 'musteri' and durum = 'bekliyor';
    end if;
  end if;
  return new;
end; $function$;

-- 4) Kantar: gercek musteri adi (imza ayni)
create or replace function public.kantar_ic_is_emirleri()
 returns table(id uuid, is_emri_no text, musteri_maskeli text, urun text, ambalaj text, teslim text, hedef_tur text, hedef_kg numeric, hedef_arac integer, yuklenen_kg numeric, yuklenen_arac integer, olusturma timestamp with time zone)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  return query
    select e.id, e.is_emri_no, coalesce(nullif(btrim(m.kisa_ad), ''), m.unvan), e.urun, e.ambalaj, e.teslim,
           e.hedef_tur, e.hedef_kg, e.hedef_arac,
           coalesce(sum(s.net_kg), 0)::numeric, count(s.id)::integer, e.olusturma
    from public.ic_is_emirleri e
    join public.ic_musteriler m on m.id = e.musteri_id
    left join public.ic_sevkler s on s.is_emri_id = e.id
    where e.company_id = auth_company_id() and e.durum = 'acik'
    group by e.id, m.unvan, m.kisa_ad
    order by e.olusturma;
end; $function$;

create or replace function public.kantar_ic_son_sevkler(p_gun integer default 3)
 returns table(id uuid, is_emri_no text, musteri_maskeli text, urun text, plaka text, dorse_plaka text, net_kg numeric, irsaliye_no text, irsaliye_dosya_yolu text, uyari_var boolean, girilen_email text, olusturma timestamp with time zone, cikis_durumu text, cikis_planlanan timestamp with time zone, cikis_zamani timestamp with time zone)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  return query
    select s.id, e.is_emri_no, coalesce(nullif(btrim(m.kisa_ad), ''), m.unvan), e.urun, s.plaka, s.dorse_plaka,
           s.net_kg, s.irsaliye_no, s.irsaliye_dosya_yolu, cardinality(s.uyarilar) > 0,
           s.girilen_email, s.olusturma, s.cikis_durumu, s.cikis_planlanan, s.cikis_zamani
    from public.ic_sevkler s
    join public.ic_is_emirleri e on e.id = s.is_emri_id
    join public.ic_musteriler m on m.id = e.musteri_id
    where s.company_id = auth_company_id()
      and s.olusturma >= now() - make_interval(days => greatest(1, least(coalesce(p_gun, 3), 31)))
    order by s.olusturma desc;
end; $function$;

comment on column public.ic_piyasa_ayarlari.kapanis_eposta is 'Siparis kapanis raporu alicilari (virgulle, en fazla 5). Bos = rapor gonderilmez (30.10.2026).';
