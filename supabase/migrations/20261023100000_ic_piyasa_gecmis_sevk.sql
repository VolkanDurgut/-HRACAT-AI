-- =============================================================================
-- Ic Piyasa: SISTEM ONCESI (gecmis) arac kaydi - 23.10.2026
-- =============================================================================
-- Kullanici karari: sistem kurulmadan once yuklenmis araclar (Trakya Birlik,
-- Tarim Kredi, Arti Grup) is emrine "bildirimsiz gecmis arac" olarak girilir.
--
--  - ic_sevkler.gecmis (varsayilan false). Sadece ic_gecmis_sevk_ekle yazar;
--    kantar RPC'si bu kolonu hic gondermez (her zaman false). Sonradan degismez.
--  - Gecmis sevk: cikis_durumu = 'cikti' (cikis zamani = girilen yukleme gunu),
--    lojistige cikis e-postasi (cikis_onayi_talebi) URETILMEZ, musteriye
--    "araciniz yola cikti" mesaji URETILMEZ. Hatirlatma/uyari isleri zaten
--    sadece bekliyor/planlandi araclara bakar.
--  - Ilerleme ve toplamlar (kantar, siparis tamamlandi, sonraki mesajlar) gecmis
--    araclari DA sayar (amac: sistemin gercek duruma esitlenmesi).
--  - Irsaliye PDF'i ve irsaliye no ZORUNLU; ayni irsaliye no / ETTN ikinci kez
--    girilemez (kantarla ayni kural).
--
-- SADECE ekleme + iki tetikleyici fonksiyonunun gecmis icin erken cikisi.
-- Mevcut kayitlarda gecmis = false -> davranis DEGISMEZ. Iki kez calistirilabilir.
-- Kod push'undan ONCE SQL Editor'de calistirilir.
-- =============================================================================

begin;

alter table public.ic_sevkler add column if not exists gecmis boolean not null default false;

comment on column public.ic_sevkler.gecmis is
  'Sistem oncesi (gecmis) arac kaydi: bildirim uretmez, cikmis sayilir. Sadece ic_gecmis_sevk_ekle yazar.';

-- 1) Koruma tetikleyicisi: normal sevk eskisi gibi "bekliyor" baslar; gecmis
--    sevk "cikti" baslar. gecmis bayragi sonradan degistirilemez.
create or replace function public.ic_sevk_koru()
 returns trigger
 language plpgsql
 set search_path = public
as $function$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.gecmis, false) then
      new.gecmis := true;
      new.cikis_durumu := 'cikti';
      new.cikis_zamani := coalesce(new.cikis_zamani, new.olusturma, now());
      new.cikis_isleyen := 'Sistem öncesi kayıt';
    else
      new.gecmis := false;
      new.cikis_durumu := 'bekliyor';
      new.cikis_zamani := null;
      new.cikis_isleyen := null;
    end if;
    new.cikis_planlanan := null;
    new.cikis_hatirlatma := null; new.cikis_uyari := null;
    new.cikis_token := replace(gen_random_uuid()::text, '-', '');
  else
    new.cikis_token := old.cikis_token;
    new.gecmis := old.gecmis;
  end if;
  return new;
end; $function$;

-- 2) Sevk bildirimi: gecmis arac icin lojistige cikis e-postasi YOK.
create or replace function public.ic_bildirim_sevk()
 returns trigger
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  e public.ic_is_emirleri%rowtype;
  m public.ic_musteriler%rowtype;
  a public.ic_piyasa_ayarlari%rowtype;
begin
  if new.gecmis then
    return new;
  end if;
  select * into e from public.ic_is_emirleri where id = new.is_emri_id;
  select * into m from public.ic_musteriler where id = e.musteri_id;
  select * into a from public.ic_piyasa_ayarlari where company_id = new.company_id;
  perform public.ic_bildirim_ekle(new.company_id, e.id, new.id, 'cikis_onayi_talebi', 'lojistik', 'eposta',
    a.lojistik_eposta, coalesce(a.lojistik_ad, 'Lojistik'),
    jsonb_build_array(new.plaka, e.is_emri_no || ' · ' || coalesce(nullif(m.kisa_ad, ''), m.unvan),
      public.ic_urun_yazi(e.urun, e.ambalaj), public.ic_kg_yazi(new.net_kg)),
    new.cikis_token,
    case when a.lojistik_eposta is null then 'Lojistik e-posta adresi tanımlı değil (İç Piyasa › Bildirimler › Ayarlar).' end);
  return new;
end; $function$;

-- 3) Gecmis arac ekleme (yalniz ic_piyasa yetkilisi, kendi sirketi, ACIK is emri)
create or replace function public.ic_gecmis_sevk_ekle(p_veri jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_sirket uuid := auth_company_id();
  v_emir public.ic_is_emirleri%rowtype;
  v_plaka text;
  v_dorse text;
  v_net numeric;
  v_yol text;
  v_irs_no text;
  v_ettn text;
  v_gun date;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_zaman timestamptz;
  v_id uuid;
  v_toplam_kg numeric;
  v_toplam_arac integer;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('ic_piyasa') then
    raise exception 'Bu işlem için İç Piyasa yetkisi gerekir.' using errcode = '42501';
  end if;

  select * into v_emir from public.ic_is_emirleri where id = (p_veri ->> 'is_emri_id')::uuid and company_id = v_sirket;
  if not found then
    raise exception 'İş emri bulunamadı.' using errcode = 'P0002';
  end if;
  if v_emir.durum <> 'acik' then
    raise exception 'Bu iş emri kapalı (%). Araç eklenemez.', v_emir.durum using errcode = '23514';
  end if;

  v_plaka := upper(regexp_replace(btrim(coalesce(p_veri ->> 'plaka', '')), '\s+', ' ', 'g'));
  if v_plaka !~ '^[A-Z0-9 ]{4,14}$' then
    raise exception 'Plaka geçersiz: "%". Örnek: 59 AGD 284', coalesce(p_veri ->> 'plaka', '') using errcode = '22023';
  end if;
  v_dorse := nullif(upper(regexp_replace(btrim(coalesce(p_veri ->> 'dorse_plaka', '')), '\s+', ' ', 'g')), '');
  if v_dorse is not null and v_dorse !~ '^[A-Z0-9 ]{4,14}$' then
    raise exception 'Dorse plakası geçersiz: "%".', p_veri ->> 'dorse_plaka' using errcode = '22023';
  end if;

  begin
    v_net := round((p_veri ->> 'net_kg')::numeric, 2);
  exception when others then
    v_net := null;
  end;
  if v_net is null or v_net <= 0 or v_net > 60000 then
    raise exception 'Net ağırlık geçersiz. 1 ile 60.000 kg arasında olmalı.' using errcode = '22023';
  end if;

  v_irs_no := nullif(upper(btrim(coalesce(p_veri ->> 'irsaliye_no', ''))), '');
  if v_irs_no is null or v_irs_no !~ '^[A-Z0-9]{3,20}$' then
    raise exception 'İrsaliye no zorunlu (harf ve rakam, 3-20 karakter).' using errcode = '22023';
  end if;
  v_ettn := nullif(upper(btrim(coalesce(p_veri ->> 'ettn', ''))), '');
  if v_ettn is not null and v_ettn !~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$' then
    v_ettn := null;
  end if;

  begin
    v_gun := (p_veri ->> 'tarih')::date;
  exception when others then
    v_gun := null;
  end;
  if v_gun is null or v_gun > v_bugun or v_gun < v_bugun - 365 then
    raise exception 'Yükleme tarihi geçersiz (bugün veya geçmiş bir gün olmalı).' using errcode = '22023';
  end if;
  -- Saat bilinmiyor: gunun ortasi (TR) -> her saat diliminde ayni gun gorunur
  v_zaman := (v_gun::text || ' 12:00:00')::timestamp at time zone 'Europe/Istanbul';

  v_yol := coalesce(p_veri ->> 'irsaliye_dosya_yolu', '');
  if v_yol not like v_sirket::text || '/irsaliye/' || v_emir.id::text || '/%' or v_yol like '%..%' then
    raise exception 'İrsaliye dosyası bu iş emrine ait değil.' using errcode = '22023';
  end if;

  if exists (select 1 from public.ic_sevkler where company_id = v_sirket and irsaliye_no = v_irs_no) then
    raise exception 'Bu irsaliye (%) daha önce girilmiş.', v_irs_no using errcode = '23505';
  end if;
  if v_ettn is not null and exists (select 1 from public.ic_sevkler where company_id = v_sirket and ettn = v_ettn) then
    raise exception 'Bu irsaliye (ETTN) daha önce girilmiş.' using errcode = '23505';
  end if;

  insert into public.ic_sevkler (
    company_id, is_emri_id, plaka, dorse_plaka, net_kg, irsaliye_no, irsaliye_tarihi, ettn,
    sofor_ad, irsaliye_urun, irsaliye_dosya_yolu, irsaliye_dosya_adi, okunan, elle_duzeltildi,
    uyarilar, girilen, girilen_email, olusturma, cikis_zamani, gecmis
  ) values (
    v_sirket, v_emir.id, v_plaka, v_dorse, v_net, v_irs_no, v_zaman, v_ettn,
    nullif(left(btrim(coalesce(p_veri ->> 'sofor_ad', '')), 80), ''),
    nullif(left(btrim(coalesce(p_veri ->> 'irsaliye_urun', '')), 120), ''),
    v_yol, nullif(left(coalesce(p_veri ->> 'irsaliye_dosya_adi', ''), 255), ''),
    null, false,
    '{}', auth.uid(), lower(nullif(auth.jwt() ->> 'email', '')), v_zaman, v_zaman, true
  ) returning id into v_id;

  select coalesce(sum(net_kg), 0), count(*) into v_toplam_kg, v_toplam_arac
    from public.ic_sevkler where is_emri_id = v_emir.id;

  return jsonb_build_object('kaydedildi', true, 'sevk_id', v_id, 'plaka', v_plaka, 'net_kg', v_net,
    'yuklenen_kg', v_toplam_kg, 'yuklenen_arac', v_toplam_arac);
end; $function$;

revoke all on function public.ic_gecmis_sevk_ekle(jsonb) from public, anon;
grant execute on function public.ic_gecmis_sevk_ekle(jsonb) to authenticated;

commit;
