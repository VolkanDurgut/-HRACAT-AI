-- PAZAR - Rehber listesi (Safak Bey listesi) + gunluk gorevde karisik oncelik (16.11.2026)
--
-- Kullanici: "Elimizde bir musteri listesi var (Safak Bey'in listesi). Mukerrer kayit olmayacak sekilde sisteme
-- entegre etmeliyiz." Kararlar (16.11.2026):
--  - Ulke sayfali rehber Excel'i (Firma | Kisi | Mail | Telefon | Fax | Adres | Not) tarayicida okunur
--    (lib/pazar/liste.ts), onizlemeden sonra pazar_liste_aktar ile TEK islemde yazilir. Dosya sunucuya gitmez.
--  - Kaynak 'liste' + kaynak_etiket ("Şafak Bey listesi"): fuar listesinden ayri gorunur, gerekirse tek seferde
--    geri alinabilir (kaynak_etiket ile).
--  - Mukerrer: ad anahtari / birlestirilmis adlar (pazar_firma_bul), yoksa ayni e-posta adresi -> mevcut firmaya
--    eklenir (yeni kayit acilmaz). Adres / faks / not firma notuna bir kez yazilir.
--  - Turkiye sayfasi ve hizmet bolumleri onizlemede varsayilan HARIC (kullanici karari).
--  - Gunluk gorevde liste potansiyelleri fuar potansiyelleriyle KARISIK (sirayla birer) gelir (kullanici karari).
--  - Gorev sayfasi firma notunu ve kaynagi gosterir (temsilci "Erişlerin müşterisi" gibi bilgiyi gorsun).

-- 1) Kaynak
alter table public.pazar_firmalar drop constraint if exists pazar_firmalar_kaynak_check;
alter table public.pazar_firmalar add constraint pazar_firmalar_kaynak_check check (kaynak in ('fuar', 'siparis', 'elle', 'liste'));
alter table public.pazar_firmalar add column if not exists kaynak_etiket text;
alter table public.pazar_ice_aktarimlari add column if not exists tur text not null default 'fuar';
alter table public.pazar_ice_aktarimlari drop constraint if exists pazar_ice_aktarimlari_tur_check;
alter table public.pazar_ice_aktarimlari add constraint pazar_ice_aktarimlari_tur_check check (tur in ('fuar', 'liste'));
alter table public.pazar_ice_aktarimlari add column if not exists kaynak_etiket text;

-- 2) Rehber listesi aktarimi (pazar_fuar_aktar ile ayni kisi birlestirme kurallari; fuar katilimi yok)
create or replace function public.pazar_liste_aktar(p_dosya_adi text, p_etiket text, p_firmalar jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sirket uuid := auth_company_id();
  v_email text;
  f jsonb; k jsonb; c jsonb;
  v_ad text; v_anahtar text; v_ulke text; v_kaynak text;
  v_firma uuid; v_yeni boolean; v_durum text;
  v_kisi uuid; v_eposta text; v_tel text[];
  n_yeni int := 0; n_guncel int := 0; n_musteri int := 0; n_kisi int := 0; n_katilim int := 0; n_firma int := 0;
  v_etiket text := nullif(left(trim(coalesce(p_etiket, '')), 80), '');
  v_not text;
  v_epostalar text[];
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('pazar') then raise exception 'Yetkisiz.'; end if;
  if jsonb_typeof(p_firmalar) <> 'array' then raise exception 'Gecersiz veri.'; end if;
  if v_etiket is null then raise exception 'Liste adi gerekli.'; end if;
  if jsonb_array_length(p_firmalar) > 5000 then raise exception 'En fazla 5000 firma.'; end if;
  begin v_email := lower(coalesce(auth.jwt() ->> 'email', '')); exception when others then v_email := null; end;

  for f in select * from jsonb_array_elements(p_firmalar) loop
    v_ad := left(trim(coalesce(f ->> 'ad', '')), 300);
    if v_ad = '' then continue; end if;
    v_anahtar := public.pazar_anahtar(v_ad);
    if v_anahtar = '' then continue; end if;
    n_firma := n_firma + 1;
    v_ulke := nullif(left(trim(coalesce(f ->> 'ulke', '')), 80), '');
    v_kaynak := case when v_ulke is null then null when f ->> 'ulke_kaynagi' in ('excel', 'telefon', 'eposta') then f ->> 'ulke_kaynagi' else 'excel' end;

    v_not := nullif(left(trim(coalesce(f ->> 'notlar', '')), 4000), '');
    select coalesce(array_agg(distinct lower(trim(x ->> 'eposta'))), '{}') into v_epostalar
      from jsonb_array_elements(coalesce(f -> 'kisiler', '[]'::jsonb)) x
     where coalesce((x ->> 'eposta_gecerli')::boolean, true) and coalesce(trim(x ->> 'eposta'), '') like '%_@_%';

    -- Mukerrer kontrolu: 1) ad anahtari / birlestirilmis adlar 2) ayni e-posta adresi baska adla kayitli firmada
    v_firma := public.pazar_firma_bul(v_sirket, v_anahtar);
    if v_firma is null and cardinality(v_epostalar) > 0 then
      select k.firma_id into v_firma from public.pazar_kisiler k
       where k.company_id = v_sirket and lower(k.eposta) = any(v_epostalar)
       order by k.created_at limit 1;
    end if;
    if v_firma is not null then
      update public.pazar_firmalar
         set ulke = coalesce(ulke, v_ulke),
             ulke_kaynagi = case when ulke is null then v_kaynak else ulke_kaynagi end,
             ulke_ham = coalesce(ulke_ham, nullif(left(trim(coalesce(f ->> 'ulke_ham', '')), 200), '')),
             -- Liste notu bir kez eklenir (ayni dosya tekrar yuklenirse cogalmaz)
             notlar = case when v_not is null then notlar
                           when notlar is null or notlar = '' then v_not
                           when position(v_not in notlar) > 0 then notlar
                           else left(notlar || E'\n\n' || v_not, 8000) end,
             updated_at = now()
       where id = v_firma
      returning durum into v_durum;
      v_yeni := false;
    else
      insert into public.pazar_firmalar (company_id, ad, anahtar, ulke, ulke_kaynagi, ulke_ham, durum, kaynak, kaynak_etiket, notlar, olusturan)
      values (v_sirket, v_ad, v_anahtar, v_ulke, v_kaynak, nullif(left(trim(coalesce(f ->> 'ulke_ham', '')), 200), ''), 'potansiyel', 'liste', v_etiket, v_not, auth.uid())
      returning id, durum into v_firma, v_durum;
      v_yeni := true;
    end if;

    if v_yeni then n_yeni := n_yeni + 1; else n_guncel := n_guncel + 1; end if;
    if v_durum = 'musteri' then n_musteri := n_musteri + 1; end if;

    for k in select * from jsonb_array_elements(coalesce(f -> 'kisiler', '[]'::jsonb)) loop
      v_eposta := nullif(lower(left(trim(coalesce(k ->> 'eposta', '')), 200)), '');
      select coalesce(array_agg(distinct left(x, 20)) filter (where x ~ '^[0-9]{6,20}$'), '{}') into v_tel
        from jsonb_array_elements_text(coalesce(k -> 'telefonlar', '[]'::jsonb)) as t(x);
      if v_eposta is null and cardinality(v_tel) = 0 and nullif(trim(coalesce(k ->> 'ad', '')), '') is null then continue; end if;

      v_kisi := null;
      if v_eposta is not null then
        select id into v_kisi from public.pazar_kisiler where firma_id = v_firma and lower(eposta) = v_eposta limit 1;
      elsif cardinality(v_tel) > 0 then
        select id into v_kisi from public.pazar_kisiler where firma_id = v_firma and telefonlar && v_tel limit 1;
      else
        select id into v_kisi from public.pazar_kisiler
         where firma_id = v_firma and eposta is null and cardinality(telefonlar) = 0
           and lower(ad) = lower(trim(k ->> 'ad')) limit 1;
      end if;

      if v_kisi is null then
        insert into public.pazar_kisiler (company_id, firma_id, ad, eposta, eposta_gecerli, telefonlar, whatsapp)
        values (v_sirket, v_firma, nullif(left(trim(coalesce(k ->> 'ad', '')), 200), ''), v_eposta,
                coalesce((k ->> 'eposta_gecerli')::boolean, true), v_tel,
                nullif(left(regexp_replace(coalesce(k ->> 'whatsapp', ''), '[^0-9]', '', 'g'), 20), ''));
        n_kisi := n_kisi + 1;
      else
        update public.pazar_kisiler
           set ad = coalesce(ad, nullif(left(trim(coalesce(k ->> 'ad', '')), 200), '')),
               telefonlar = (select coalesce(array_agg(distinct x), '{}') from unnest(telefonlar || v_tel) as u(x)),
               whatsapp = coalesce(whatsapp, nullif(left(regexp_replace(coalesce(k ->> 'whatsapp', ''), '[^0-9]', '', 'g'), 20), '')),
               updated_at = now()
         where id = v_kisi
           and (ad is null or not (telefonlar @> v_tel) or (whatsapp is null and coalesce(k ->> 'whatsapp', '') <> ''));
      end if;
    end loop;

  end loop;

  insert into public.pazar_ice_aktarimlari (company_id, dosya_adi, tur, kaynak_etiket, firma_sayisi, yeni_firma, guncellenen_firma, musteri_eslesen, yeni_kisi, yeni_katilim, olusturan, olusturan_email)
  values (v_sirket, left(coalesce(p_dosya_adi, ''), 200), 'liste', v_etiket, n_firma, n_yeni, n_guncel, n_musteri, n_kisi, 0, auth.uid(), v_email);

  return jsonb_build_object('firma', n_firma, 'yeni_firma', n_yeni, 'guncellenen_firma', n_guncel,
    'musteri_eslesen', n_musteri, 'yeni_kisi', n_kisi, 'yeni_katilim', 0);
end;
$$;

-- 3) Gunluk gorev: fuar + liste potansiyelleri karisik
create or replace function public.pazar_gorev_olustur(p_company uuid, p_tarih date, p_adet integer default 6, p_atanan text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sira integer;
  v_kalan integer;
  r record;
begin
  if p_company is null or p_tarih is null then return 0; end if;
  p_adet := least(greatest(coalesce(p_adet, 6), 1), 20);

  -- Hatirlatma 2'den sonra suresi dolanlar -> Sessiz (musteri 30, potansiyel 60 gun bekler)
  update public.pazar_firmalar
     set crm_asama = 'sessiz', sonraki_adim = null,
         bekleme_bitis = p_tarih + case when durum = 'musteri' then 30 else 60 end, updated_at = now()
   where company_id = p_company and crm_asama = 'hatirlatma2' and sonraki_adim is not null and sonraki_adim <= p_tarih;

  select coalesce(max(sira), 0) into v_sira from public.pazar_gorevler
   where company_id = p_company and tarih = p_tarih and atanan is not distinct from p_atanan;
  if v_sira >= p_adet then return v_sira; end if;
  v_kalan := p_adet - v_sira;

  for r in
    with uygun as (
      select f.*,
             exists (select 1 from public.pazar_kisiler k where k.firma_id = f.id and k.eposta is not null and k.eposta_gecerli) as epostali,
             exists (select 1 from public.pazar_kisiler k where k.firma_id = f.id and (k.whatsapp is not null or cardinality(k.telefonlar) > 0)) as telefonlu
        from public.pazar_firmalar f
       where f.company_id = p_company
         and not exists (select 1 from public.pazar_gorevler g where g.firma_id = f.id and g.tarih = p_tarih)
         -- Son 3 gunde gorev verilip islenmemis firma tekrar verilmez
         and not exists (select 1 from public.pazar_gorevler g where g.firma_id = f.id and g.durum = 'bekliyor' and g.tarih >= p_tarih - 3)
    ), aday as (
      select u.id, 1 as grup,
             case when u.crm_asama = 'sorgulandi' then 'hatirlatma1' else 'hatirlatma2' end as neden,
             u.sonraki_adim::text as anahtar1, ''::text as anahtar2
        from uygun u
       where u.crm_asama in ('sorgulandi', 'hatirlatma1') and u.sonraki_adim is not null and u.sonraki_adim <= p_tarih
      union all
      select u.id, 2, 'siparissiz',
             coalesce(to_char(public.pazar_firma_son_siparis(u.id), 'YYYYMMDD'), '00000000'), u.ad
        from uygun u
       where u.durum = 'musteri'
         and u.crm_asama in ('yeni', 'sessiz', 'cevap', 'teklif', 'siparis', 'ilgilenmiyor')
         and (u.bekleme_bitis is null or u.bekleme_bitis <= p_tarih)
         and (u.epostali or u.telefonlu)
         and not public.pazar_firma_aktif(u.id)
      union all
      -- 16.11.2026: fuar ve rehber listesi (kaynak='liste') potansiyelleri KARISIK (sirayla birer): her kaynak kendi
      -- icinde eski siralamayla (son fuar yili, e-posta, telefon, ulkede musterimiz var mi, ad) dizilir.
      select p.id, 3, 'potansiyel',
             to_char(p.kaynak_sira, 'FM000000') || case when p.liste then '1' else '0' end,
             p.ad
        from (
          select q.*, row_number() over (partition by q.liste order by q.sira_anahtari, q.ad) as kaynak_sira
            from (
              select u.id, u.ad, (u.kaynak = 'liste') as liste,
                             to_char(99999 - coalesce((select max(c.yil) from public.pazar_fuar_katilimlari c where c.firma_id = u.id), 0), 'FM00000')
               || case when u.epostali then '0' else '1' end
               || case when u.telefonlu then '0' else '1' end
               || case when u.ulke is not null and exists (select 1 from public.pazar_firmalar m where m.company_id = p_company and m.durum = 'musteri' and m.ulke = u.ulke) then '0' else '1' end as sira_anahtari
                from uygun u
               where u.durum = 'potansiyel'
                 and u.crm_asama in ('yeni', 'sessiz', 'cevap', 'teklif', 'ilgilenmiyor')
                 and (u.bekleme_bitis is null or u.bekleme_bitis <= p_tarih)
                 and u.epostali
            ) q
        ) p
    )
    select a.id, a.neden from aday a order by a.grup, a.anahtar1, a.anahtar2 limit v_kalan
  loop
    v_sira := v_sira + 1;
    insert into public.pazar_gorevler (company_id, tarih, firma_id, sira, neden, atanan)
    values (p_company, p_tarih, r.id, v_sira, r.neden, p_atanan)
    on conflict (company_id, tarih, firma_id) do nothing;
  end loop;
  return v_sira;
end;
$$;

-- 4) Gorev sayfasi: firma notu + kaynak
create or replace function public.pazar_gorev_bilgi(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g public.pazar_gorevler;
  f public.pazar_firmalar;
  v_adim text;
  e public.pazar_ekip;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then return null; end if;
  select * into g from public.pazar_gorevler where token = p_token;
  if g.id is null or g.tarih < (now() at time zone 'Europe/Istanbul')::date - 3 then return null; end if;
  select * into f from public.pazar_firmalar where id = g.firma_id;
  select * into e from public.pazar_ekip where company_id = g.company_id and kod = g.atanan;
  v_adim := case f.crm_asama when 'sorgulandi' then 'hatirlatma1' when 'hatirlatma1' then 'hatirlatma2' else 'sorgulama' end;

  return jsonb_build_object(
    'gorev', jsonb_build_object('tarih', g.tarih, 'sira', g.sira, 'neden', g.neden, 'durum', g.durum, 'isleyen', g.isleyen, 'tamamlanma', g.tamamlanma, 'atanan', g.atanan,
      'temas_var', exists (select 1 from public.pazar_temaslar t where t.gorev_id = g.id and t.adim in ('sorgulama', 'hatirlatma1', 'hatirlatma2', 'sonuc', 'atla'))),
    'ekip', case when e.id is null then null else jsonb_build_object('kod', e.kod, 'eposta', e.eposta, 'hitap', e.hitap) end,
    'adim', v_adim,
    'firma', jsonb_build_object('ad', f.ad, 'ulke', f.ulke, 'durum', f.durum, 'crm_asama', f.crm_asama, 'alici_adi', f.alici_adi,
      'kaynak', f.kaynak, 'kaynak_etiket', f.kaynak_etiket, 'notlar', left(f.notlar, 800),
      'son_siparis', public.pazar_firma_son_siparis(f.id), 'aktif', public.pazar_firma_aktif(f.id)),
    'kisiler', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'ad', k.ad, 'eposta', k.eposta, 'eposta_gecerli', k.eposta_gecerli,
        'telefonlar', k.telefonlar, 'whatsapp', k.whatsapp) order by (k.eposta is not null and k.eposta_gecerli) desc, k.created_at)
      from public.pazar_kisiler k where k.firma_id = f.id), '[]'::jsonb),
    'fuarlar', coalesce((select jsonb_agg(c.etiket order by c.yil desc nulls last) from public.pazar_fuar_katilimlari c where c.firma_id = f.id), '[]'::jsonb),
    'son_urun', (select d.urun_tanimi from public.ihracat_dosyalari d
                  where d.company_id = f.company_id and public.pazar_anahtar(d.alici_firma) = any(array_append(f.ek_anahtarlar, f.anahtar))
                  order by d.olusturma_tarihi desc limit 1),
    'gecmis', coalesce((select jsonb_agg(x order by x->>'olusturma' desc) from (
        select jsonb_build_object('adim', t.adim, 'kanal', t.kanal, 'sonuc', t.sonuc, 'alici', t.alici, 'konu', t.konu, 'isleyen', t.isleyen, 'olusturma', t.olusturma) x
          from public.pazar_temaslar t where t.firma_id = f.id order by t.olusturma desc limit 10) y), '[]'::jsonb),
    'gelenler', coalesce((select jsonb_agg(jsonb_build_object('tarih', x.tarih, 'gonderen', x.gonderen, 'konu', x.konu, 'ozet', left(x.ozet, 400), 'tur', x.tur, 'oneri', x.oneri) order by x.tarih desc)
      from (select * from public.pazar_gelenler n where n.firma_id = f.id and n.tarih > now() - interval '30 days' order by n.tarih desc limit 3) x), '[]'::jsonb),
    -- Daha once yazilan atlama nedenleri (en sik / en yeni 8): bir sonraki atlamada secenek
    'atlama_nedenleri', coalesce((select jsonb_agg(x.konu order by x.adet desc, x.son desc) from (
        select t.konu, count(*) adet, max(t.olusturma) son from public.pazar_temaslar t
         where t.company_id = g.company_id and t.adim = 'atla' and t.konu is not null and t.konu <> ''
         group by t.konu order by count(*) desc, max(t.olusturma) desc limit 8) x), '[]'::jsonb),
    'gunun_gorevleri', coalesce((select jsonb_agg(jsonb_build_object('sira', o.sira, 'durum', o.durum, 'token', o.token, 'ad', fo.ad, 'neden', o.neden) order by o.sira)
      from public.pazar_gorevler o join public.pazar_firmalar fo on fo.id = o.firma_id
      where o.company_id = g.company_id and o.tarih = g.tarih and o.atanan is not distinct from g.atanan), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.pazar_liste_aktar(text, text, jsonb) from public, anon;
grant execute on function public.pazar_liste_aktar(text, text, jsonb) to authenticated;
revoke all on function public.pazar_gorev_olustur(uuid, date, integer, text) from public, anon, authenticated;
revoke all on function public.pazar_gorev_bilgi(text) from public, anon, authenticated;
