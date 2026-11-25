-- ============================================================================
-- GEMI TAHLIYE - liman portali Excel'i + agirlik/saat eslestirmesi (25.11.2026 aksam)
-- ============================================================================
-- Kullanici (gemi geldi): "Liman tonajlarini excel ile yukleyecegiz." Liman portali "Gemi Tartim Bilgileri" Excel'i:
-- plaka, bos / dolu / net agirlik, cikis saati, fis kodu, gemi/sefer, alici firma. Ilk gercek araclarda gorulen:
-- limandaki plaka (cekici) ile kantarimiza yazilan plaka (dorse) FARKLI; ama ayni aracin BOS agirligi iki kantarda
-- ~60 kg, DOLU ~120 kg icinde tutuyor ve arac limandan cikistan ~20 dk sonra kantarimiza giriyor.
--   1) ic_gemi_araclari + liman_fis_kodu (tekil; ayni Excel tekrar yuklenince atlanir), liman_bos_kg, liman_dolu_kg,
--      liman_cikis, liman_alici; kaynak + 'liman'.
--   2) ic_gemi_liman_excel_yukle(p_gemi, p_satirlar, p_kaydet): kantar VEYA ic_piyasa; alici "UNEX" ise UNEX deposu,
--      degilse gemiden satis firmasi (kantar_ad_jetonlari kesisimi; bulunamazsa hata - once Satis Ekle). Gemi/Sefer
--      secili gemiye uymazsa hata. Hepsi ya da hicbiri (yeni satirlar icin).
--   3) ic_gemi_kantar_esle_calistir: liman cikisi bilinen arac -> kantar girisi cikistan 15 dk once .. 8 sa sonra,
--      |net farki| <= 800 kg, bos farki <= 500 kg; sira: plaka ayni > firma alaninda gemi adi > en kucuk (bos + dolu)
--      farki > en erken giris. Plaka sart DEGIL. Liman cikisi olmayan (elle / WhatsApp) araclar eski kuralla (plaka).
-- Kantar kayitlarina yazilmaz. Evrak kg'lari degismez.
-- ============================================================================

alter table public.ic_gemi_araclari add column if not exists liman_fis_kodu text check (liman_fis_kodu is null or char_length(liman_fis_kodu) <= 80);
alter table public.ic_gemi_araclari add column if not exists liman_bos_kg numeric(12, 2) check (liman_bos_kg is null or (liman_bos_kg >= 0 and liman_bos_kg <= 60000));
alter table public.ic_gemi_araclari add column if not exists liman_dolu_kg numeric(12, 2) check (liman_dolu_kg is null or (liman_dolu_kg >= 0 and liman_dolu_kg <= 80000));
alter table public.ic_gemi_araclari add column if not exists liman_cikis timestamptz;
alter table public.ic_gemi_araclari add column if not exists liman_alici text check (liman_alici is null or char_length(liman_alici) <= 200);
create unique index if not exists uq_ic_gemi_arac_liman_fis on public.ic_gemi_araclari (company_id, liman_fis_kodu) where liman_fis_kodu is not null;
alter table public.ic_gemi_araclari drop constraint if exists ic_gemi_araclari_kaynak_check;
alter table public.ic_gemi_araclari add constraint ic_gemi_araclari_kaynak_check check (kaynak in ('kantar', 'ofis', 'liman'));

-- ---------------------------------------------------------------------------
-- Liman Excel'i yukle. p_satirlar: [{fis_kodu, plaka, bos_kg, dolu_kg, net_kg, cikis (ISO), gemi_sefer, alici}] (<= 1000)
-- ---------------------------------------------------------------------------
create or replace function public.ic_gemi_liman_excel_yukle(p_gemi uuid, p_satirlar jsonb, p_kaydet boolean default false)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
  v_gemi public.ic_gemi_tahliyeleri%rowtype;
  v_jeton text;
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_s jsonb;
  v_i integer := 0;
  v_fis text; v_plaka text; v_net numeric; v_bos numeric; v_dolu numeric; v_cikis timestamptz; v_alici_ad text; v_sefer text;
  v_alici uuid;
  v_eklenen integer := 0;
  v_atlanan integer := 0;
  v_toplam numeric := 0;
  v_hatalar text[] := '{}';
  v_uyarilar text[] := '{}';
  v_satis_toplam jsonb := '{}';
  v_es integer := 0;
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  select x.* into v_gemi from public.ic_gemi_tahliyeleri x where x.id = p_gemi and x.company_id = v_sirket;
  if v_gemi.id is null then raise exception 'Gemi bulunamadı.' using errcode = 'P0002'; end if;
  if v_gemi.durum <> 'acik' then raise exception '% tahliyeye açık değil.', v_gemi.gemi_adi using errcode = '23514'; end if;
  if jsonb_typeof(p_satirlar) <> 'array' or jsonb_array_length(p_satirlar) = 0 then
    raise exception 'Excel''de araç satırı yok.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_satirlar) > 1000 then
    raise exception 'Tek seferde en fazla 1.000 satır yüklenebilir.' using errcode = '22023';
  end if;
  v_jeton := ic_gemi_jeton(v_gemi.gemi_adi);

  for v_s in select * from jsonb_array_elements(p_satirlar) loop
    v_i := v_i + 1;
    v_fis := nullif(btrim(coalesce(v_s ->> 'fis_kodu', '')), '');
    v_plaka := upper(regexp_replace(btrim(coalesce(v_s ->> 'plaka', '')), '\s+', ' ', 'g'));
    v_sefer := nullif(btrim(coalesce(v_s ->> 'gemi_sefer', '')), '');
    v_alici_ad := nullif(btrim(coalesce(v_s ->> 'alici', '')), '');
    begin v_net := round((v_s ->> 'net_kg')::numeric, 2); exception when others then v_net := null; end;
    begin v_bos := round(nullif(v_s ->> 'bos_kg', '')::numeric, 2); exception when others then v_bos := null; end;
    begin v_dolu := round(nullif(v_s ->> 'dolu_kg', '')::numeric, 2); exception when others then v_dolu := null; end;
    begin v_cikis := (v_s ->> 'cikis')::timestamptz; exception when others then v_cikis := null; end;

    if v_fis is null or char_length(v_fis) > 80 then v_hatalar := array_append(v_hatalar, format('%s. satır: fiş kodu yok.', v_i)); continue; end if;
    if v_plaka !~ '^[A-Z0-9 ]{4,14}$' then v_hatalar := array_append(v_hatalar, format('%s. satır: plaka geçersiz (%s).', v_i, coalesce(v_s ->> 'plaka', ''))); continue; end if;
    if v_net is null or v_net <= 0 or v_net > 60000 then v_hatalar := array_append(v_hatalar, format('%s (%s): net ağırlık geçersiz.', v_plaka, v_fis)); continue; end if;
    if v_cikis is null or v_cikis > now() + interval '1 hour' or v_cikis < now() - interval '30 days' then
      v_hatalar := array_append(v_hatalar, format('%s (%s): çıkış tarihi geçersiz ya da 30 günden eski.', v_plaka, v_fis)); continue;
    end if;
    if v_sefer is not null and v_jeton is not null and position(v_jeton in ic_gemi_duz(v_sefer)) = 0 then
      v_hatalar := array_append(v_hatalar, format('%s (%s): Excel''deki gemi "%s", seçili gemi %s.', v_plaka, v_fis, v_sefer, v_gemi.gemi_adi)); continue;
    end if;
    if exists (select 1 from public.ic_gemi_araclari a where a.company_id = v_sirket and a.liman_fis_kodu = v_fis) then
      v_atlanan := v_atlanan + 1; continue;
    end if;
    -- Alici: UNEX -> depo; degilse gemiden satis firmasi
    v_alici := null;
    if v_alici_ad is not null and not ('UNEX' = any (kantar_ad_jetonlari(v_alici_ad))) then
      select l.id into v_alici from public.ic_gemi_alicilari l
       where l.gemi_id = v_gemi.id and kantar_ad_jetonlari(l.firma) && kantar_ad_jetonlari(v_alici_ad)
       order by cardinality(array(select unnest(kantar_ad_jetonlari(l.firma)) intersect select unnest(kantar_ad_jetonlari(v_alici_ad)))) desc
       limit 1;
      if v_alici is null then
        v_hatalar := array_append(v_hatalar, format('%s (%s): alıcı "%s" bu geminin satışlarında yok; önce Gemi Tahliye › Satış Ekle.', v_plaka, v_fis, v_alici_ad));
        continue;
      end if;
    end if;
    v_toplam := v_toplam + v_net;
    if coalesce(p_kaydet, false) then
      insert into public.ic_gemi_araclari (company_id, gemi_id, alici_id, tarih, plaka, liman_kg, teslim_kg, kaynak, uyarilar, girilen_email,
                                           liman_fis_kodu, liman_bos_kg, liman_dolu_kg, liman_cikis, liman_alici)
      values (v_sirket, v_gemi.id, v_alici, (v_cikis at time zone 'Europe/Istanbul')::date, v_plaka, v_net, null, 'liman',
              case when v_net > 35000 then array['Liman ağırlığı 35.000 kg üzerinde; kontrol edin.'] else '{}'::text[] end,
              v_email, v_fis, v_bos, v_dolu, v_cikis, left(v_alici_ad, 200));
    end if;
    v_eklenen := v_eklenen + 1;
  end loop;

  if array_length(v_hatalar, 1) > 0 and coalesce(p_kaydet, false) then
    -- Hepsi ya da hicbiri: hatali satir varken kayit yok
    raise exception 'Excel''de % hatalı satır var: %', array_length(v_hatalar, 1), array_to_string(v_hatalar[1:5], ' | ') using errcode = '22023';
  end if;
  if v_eklenen > 0 then
    v_uyarilar := ic_gemi_uyarilari(v_gemi, null, null, 0, null, case when coalesce(p_kaydet, false) then 0 else v_toplam end);
  end if;
  if coalesce(p_kaydet, false) and v_eklenen > 0 then
    v_es := ic_gemi_kantar_esle_calistir();
  end if;
  return jsonb_build_object('kaydedildi', coalesce(p_kaydet, false), 'eklenen', v_eklenen, 'atlanan', v_atlanan, 'toplam_kg', v_toplam,
                            'hatalar', to_jsonb(v_hatalar), 'uyarilar', to_jsonb(v_uyarilar), 'eslesen', v_es);
end; $function$;

-- ---------------------------------------------------------------------------
-- Eslestirme: liman cikisi bilinen arac agirlik + saatle; bilinmeyen eski kuralla (plaka)
-- ---------------------------------------------------------------------------
create or replace function public.ic_gemi_kantar_esle_calistir()
 returns integer
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  r record;
  t public.kantar_tartimlari%rowtype;
  v_sayi integer := 0;
  v_fark numeric;
  v_uyari text[];
  v_jeton text;
begin
  for r in
    select a.*, g.gemi_adi
    from public.ic_gemi_araclari a
    join public.ic_gemi_tahliyeleri g on g.id = a.gemi_id
    where g.durum = 'acik' and a.alici_id is null and a.teslim_kg is null and not a.esleme_kapali
      and a.olusturma > now() - interval '30 days'
    order by coalesce(a.liman_cikis, a.olusturma), a.olusturma
  loop
    v_jeton := ic_gemi_jeton(r.gemi_adi);
    t := null;
    if r.liman_cikis is not null then
      select k.* into t
      from public.kantar_tartimlari k
      where k.company_id = r.company_id
        and coalesce(k.giris, k.cikis) between r.liman_cikis - interval '15 minutes' and r.liman_cikis + interval '8 hours'
        and abs(k.net_kg - r.liman_kg) <= 800
        and (r.liman_bos_kg is null or k.tartim1_kg is null or k.tartim2_kg is null
             or abs(least(k.tartim1_kg, k.tartim2_kg) - r.liman_bos_kg) <= 500)
        and ic_gemi_tartim_uygun(k)
        and ((v_jeton is not null and position(v_jeton in ic_gemi_duz(k.firma)) > 0)
             or ic_gemi_duz(k.plaka) = ic_gemi_duz(r.plaka) or ic_gemi_duz(k.dorse) = ic_gemi_duz(r.plaka)
             or not ic_gemi_tartim_baska_ise_ait(k))
      order by (ic_gemi_duz(k.plaka) = ic_gemi_duz(r.plaka) or ic_gemi_duz(k.dorse) = ic_gemi_duz(r.plaka)) desc,
               (v_jeton is not null and position(v_jeton in ic_gemi_duz(k.firma)) > 0) desc,
               coalesce(abs(least(k.tartim1_kg, k.tartim2_kg) - r.liman_bos_kg), 0)
                 + coalesce(abs(greatest(k.tartim1_kg, k.tartim2_kg) - r.liman_dolu_kg), abs(k.net_kg - r.liman_kg)),
               coalesce(k.giris, k.cikis)
      limit 1;
    else
      select k.* into t
      from public.kantar_tartimlari k
      where k.company_id = r.company_id
        and (ic_gemi_duz(k.plaka) = ic_gemi_duz(r.plaka) or (k.dorse is not null and ic_gemi_duz(k.dorse) = ic_gemi_duz(r.plaka)))
        and k.cikis between r.olusturma - interval '12 hours' and r.olusturma + interval '36 hours'
        and abs(k.net_kg - r.liman_kg) <= 1500
        and ic_gemi_tartim_uygun(k)
        and ((v_jeton is not null and position(v_jeton in ic_gemi_duz(k.firma)) > 0) or not ic_gemi_tartim_baska_ise_ait(k))
      order by (v_jeton is not null and position(v_jeton in ic_gemi_duz(k.firma)) > 0) desc,
               abs(k.net_kg - r.liman_kg), k.cikis
      limit 1;
    end if;
    if t.id is null then continue; end if;
    v_fark := round(t.net_kg, 2) - r.liman_kg;
    v_uyari := r.uyarilar;
    if abs(v_fark) > greatest(300, r.liman_kg * 0.01) then
      v_uyari := array_append(v_uyari, format('Kantar tartımı (#%s) liman fişinden %s farklı.', t.kayit_no, ic_kg_yazi(v_fark)));
    end if;
    update public.ic_gemi_araclari
       set teslim_kg = round(t.net_kg, 2), kantar_tartim_id = t.id, teslim_kaynak = 'kantar', teslim_zamani = t.cikis, uyarilar = v_uyari
     where id = r.id and teslim_kg is null;
    v_sayi := v_sayi + 1;
  end loop;
  return v_sayi;
end; $function$;

-- Kantar son araclar: kantardaki plaka + liman cikisi eklendi (donus tipi degisti -> DROP + CREATE)
drop function if exists public.kantar_gemi_son_araclar(integer);
create function public.kantar_gemi_son_araclar(p_gun integer default 2)
 returns table (
   id uuid, gemi_id uuid, gemi_adi text, alici_id uuid, firma text, tarih date, plaka text,
   liman_kg numeric, teslim_kg numeric, kaynak text, uyari_var boolean, girilen_email text, olusturma timestamptz,
   teslim_kaynak text, kantar_kayit_no bigint, teslim_zamani timestamptz, kantar_plaka text, liman_cikis timestamptz
 )
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not (ic_sayfa_yetkisi('kantar') or ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Kantar yetkiniz yok.' using errcode = '42501';
  end if;
  return query
    select a.id, a.gemi_id, g.gemi_adi, a.alici_id, l.firma, a.tarih, a.plaka, a.liman_kg, a.teslim_kg, a.kaynak,
           cardinality(a.uyarilar) > 0, a.girilen_email, a.olusturma, a.teslim_kaynak, k.kayit_no, a.teslim_zamani,
           k.plaka, a.liman_cikis
    from public.ic_gemi_araclari a
    join public.ic_gemi_tahliyeleri g on g.id = a.gemi_id
    left join public.ic_gemi_alicilari l on l.id = a.alici_id
    left join public.kantar_tartimlari k on k.id = a.kantar_tartim_id
    where a.company_id = auth_company_id() and g.durum = 'acik'
      and (a.olusturma >= now() - make_interval(days => greatest(1, least(coalesce(p_gun, 2), 14)))
           or coalesce(a.teslim_zamani, a.liman_cikis) >= now() - make_interval(days => greatest(1, least(coalesce(p_gun, 2), 14)))
           or (a.alici_id is null and a.teslim_kg is null))
    order by coalesce(a.teslim_zamani, a.liman_cikis, a.olusturma) desc
    limit 500;
end; $function$;

revoke all on function public.ic_gemi_kantar_esle_calistir() from public, anon, authenticated;
revoke all on function public.ic_gemi_liman_excel_yukle(uuid, jsonb, boolean) from public, anon;
revoke all on function public.kantar_gemi_son_araclar(integer) from public, anon;
grant execute on function public.ic_gemi_liman_excel_yukle(uuid, jsonb, boolean) to authenticated;
grant execute on function public.kantar_gemi_son_araclar(integer) to authenticated;
