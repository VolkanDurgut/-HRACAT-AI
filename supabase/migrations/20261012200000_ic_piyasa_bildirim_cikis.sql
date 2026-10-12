-- ============================================================================
-- IC PIYASA PARCA 2 - BILDIRIMLER, MUSTERI TAKIP, LOJISTIK CIKIS ONAYI (12.10.2026)
-- ============================================================================
-- Ihracat tablolarina DOKUNMAZ. Onceki migration: 20261012100000.
--
-- 1) ic_piyasa_ayarlari : sirket basina lojistik + yetkili iletisim.
-- 2) ic_is_emirleri.takip_token  : musteri takip sayfasi baglantisi (tahmin edilemez).
--    ic_sevkler.cikis_*          : lojistik cikis onayi (bekliyor / planlandi /
--                                  cikti / bugun_degil) + tek kullanimlik baglanti.
-- 3) ic_bildirimler     : GONDERILECEK MESAJ KUTUSU. Tetikleyiciler yazar:
--      - is emri acilinca   -> siparis_alindi      (musteri, WhatsApp, elle)
--      - is emri tamamlaninca -> siparis_tamamlandi (musteri, WhatsApp, elle)
--      - sevk girilince     -> cikis_onayi_talebi  (lojistik, e-posta, OTOMATIK)
--      - cikis onaylaninca  -> arac_yola_cikti     (musteri, WhatsApp, elle)
--      - saat verilince     -> arac_cikis_saati    (musteri, WhatsApp, istege bagli)
--      - hatirlatma / cevap yok / bugun cikmayacak -> lojistik / yetkili e-posta
--    Mesaj METNI burada tutulmaz: sablon adi + degerler saklanir, metin tek
--    kaynaktan (supabase/functions/_shared/mesaj-sablonlari.ts) uretilir.
--    E-postalari "ic-piyasa" edge function'i gonderir (pg_cron, 2 dk).
-- 4) Fiyat tablosu ve formlar SADECE ic_piyasa yetkilisine (kantarci okuyamaz).
-- 5) Is emri tamamen silme (iptal edilmis, sevkli) - tek islem.
--
-- Musteriye e-posta YOK (askida kurali). WhatsApp: Meta onayina kadar elle.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Bicim yardimcilari (bildirim degerleri, Turkce)
-- ---------------------------------------------------------------------------
-- 26220 -> '26.220 kg', 25500.5 -> '25.500,5 kg'
create or replace function public.ic_kg_yazi(p_kg numeric)
 returns text language sql immutable set search_path to 'public'
as $function$
  select case when p_kg is null then '-' else
    replace(to_char(trunc(p_kg), 'FM999,999,999,990'), ',', '.')
    || case when p_kg <> trunc(p_kg)
            then ',' || rtrim(split_part(to_char(p_kg - trunc(p_kg), 'FM0.99'), '.', 2), '0')
            else '' end
    || ' kg' end;
$function$;

-- 75000 -> '75 ton', 25500 -> '25,5 ton'
create or replace function public.ic_ton_yazi(p_kg numeric)
 returns text language sql immutable set search_path to 'public'
as $function$
  select case when p_kg is null then '-' else
    replace(rtrim(rtrim(to_char(p_kg / 1000.0, 'FM999999990.999'), '0'), '.'), '.', ',') || ' ton' end;
$function$;

create or replace function public.ic_urun_yazi(p_urun text, p_ambalaj text)
 returns text language sql immutable set search_path to 'public'
as $function$
  select btrim(coalesce(p_urun, '-')) || case when nullif(btrim(coalesce(p_ambalaj, '')), '') is null then '' else ' (' || btrim(p_ambalaj) || ')' end;
$function$;

-- ---------------------------------------------------------------------------
-- 1) Ayarlar
-- ---------------------------------------------------------------------------
create table if not exists public.ic_piyasa_ayarlari (
  company_id uuid primary key references public.companies(id) on delete cascade,
  lojistik_ad text,
  lojistik_eposta text check (lojistik_eposta is null or lojistik_eposta ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  lojistik_telefon text check (lojistik_telefon is null or lojistik_telefon ~ '^[0-9]{10,15}$'),
  yetkili_eposta text check (yetkili_eposta is null or yetkili_eposta ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  guncelleme timestamptz not null default now()
);
alter table public.ic_piyasa_ayarlari enable row level security;

drop trigger if exists ic_piyasa_ayarlari_guncelleme on public.ic_piyasa_ayarlari;
create trigger ic_piyasa_ayarlari_guncelleme before update on public.ic_piyasa_ayarlari
  for each row execute function public.ic_guncelleme_zamani();

-- ---------------------------------------------------------------------------
-- 2) Takip ve cikis alanlari
-- ---------------------------------------------------------------------------
alter table public.ic_is_emirleri add column if not exists takip_token text;
update public.ic_is_emirleri set takip_token = replace(gen_random_uuid()::text, '-', '') where takip_token is null;
alter table public.ic_is_emirleri alter column takip_token set default replace(gen_random_uuid()::text, '-', '');
alter table public.ic_is_emirleri alter column takip_token set not null;
create unique index if not exists uq_ic_is_emirleri_takip_token on public.ic_is_emirleri (takip_token);

alter table public.ic_sevkler add column if not exists cikis_durumu text not null default 'bekliyor';
alter table public.ic_sevkler add column if not exists cikis_planlanan timestamptz;
alter table public.ic_sevkler add column if not exists cikis_zamani timestamptz;
alter table public.ic_sevkler add column if not exists cikis_isleyen text;
alter table public.ic_sevkler add column if not exists cikis_hatirlatma timestamptz;
alter table public.ic_sevkler add column if not exists cikis_uyari timestamptz;
alter table public.ic_sevkler add column if not exists cikis_token text;
update public.ic_sevkler set cikis_token = replace(gen_random_uuid()::text, '-', '') where cikis_token is null;
alter table public.ic_sevkler alter column cikis_token set default replace(gen_random_uuid()::text, '-', '');
alter table public.ic_sevkler alter column cikis_token set not null;
create unique index if not exists uq_ic_sevkler_cikis_token on public.ic_sevkler (cikis_token);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ic_sevkler_cikis_durumu_check') then
    alter table public.ic_sevkler add constraint ic_sevkler_cikis_durumu_check
      check (cikis_durumu in ('bekliyor', 'planlandi', 'cikti', 'bugun_degil'));
  end if;
end $$;

-- Is emri tetikleyicisi: takip_token da degistirilemez (onceki surum + 1 satir).
create or replace function public.ic_is_emri_hazirla()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  tr_gun date;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and (new.company_id is distinct from auth_company_id() or not ic_sayfa_yetkisi('ic_piyasa')) then
      raise exception 'Bu şirket için iş emri açma yetkiniz yok.' using errcode = '42501';
    end if;
    if new.urun is null or btrim(new.urun) = '' then
      raise exception 'Ürün boş olamaz.' using errcode = '23514';
    end if;
    if new.hedef_tur is null or new.hedef_tur not in ('kg', 'arac')
       or (new.hedef_tur = 'kg' and (new.hedef_kg is null or new.hedef_kg <= 0))
       or (new.hedef_tur = 'arac' and (new.hedef_arac is null or new.hedef_arac <= 0 or new.hedef_arac > 500)) then
      raise exception 'Hedef tonaj veya araç sayısı geçersiz.' using errcode = '23514';
    end if;
    if new.birim_fiyat is not null and new.birim_fiyat < 0 then
      raise exception 'Birim fiyat geçersiz.' using errcode = '23514';
    end if;
    if new.vade_gun is not null and (new.vade_gun < 0 or new.vade_gun > 365) then
      raise exception 'Vade geçersiz.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.ic_musteriler m where m.id = new.musteri_id and m.company_id = new.company_id) then
      raise exception 'Müşteri bulunamadı.' using errcode = '23503';
    end if;
    new.durum := 'acik';
    new.kapanis_zamani := null;
    new.olusturma := now();
    new.guncelleme := now();
    new.olusturan := auth.uid();
    new.takip_token := replace(gen_random_uuid()::text, '-', '');
    tr_gun := (now() at time zone 'Europe/Istanbul')::date;
    new.is_emri_no := 'IE-' || extract(year from tr_gun)::text || '-'
      || lpad(pg_catalog.nextval('public.ic_is_emri_sira'::regclass)::text, 4, '0');
  else
    new.id := old.id;
    new.company_id := old.company_id;
    new.is_emri_no := old.is_emri_no;
    new.takip_token := old.takip_token;
    new.olusturan := old.olusturan;
    new.olusturan_email := old.olusturan_email;
    new.olusturma := old.olusturma;
    new.guncelleme := now();
    if new.musteri_id is distinct from old.musteri_id then
      if exists (select 1 from public.ic_sevkler s where s.is_emri_id = old.id) then
        raise exception 'Sevk girilmiş iş emrinin müşterisi değiştirilemez.' using errcode = '23514';
      end if;
      if not exists (select 1 from public.ic_musteriler m where m.id = new.musteri_id and m.company_id = new.company_id) then
        raise exception 'Müşteri bulunamadı.' using errcode = '23503';
      end if;
    end if;
    if new.durum is distinct from old.durum then
      new.kapanis_zamani := case when new.durum = 'acik' then null else now() end;
    end if;
  end if;
  return new;
end; $function$;

-- Sevk: cikis alanlarini sadece cikis fonksiyonlari degistirir; token sabit.
create or replace function public.ic_sevk_koru()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    new.cikis_durumu := 'bekliyor';
    new.cikis_planlanan := null; new.cikis_zamani := null; new.cikis_isleyen := null;
    new.cikis_hatirlatma := null; new.cikis_uyari := null;
    new.cikis_token := replace(gen_random_uuid()::text, '-', '');
  else
    new.cikis_token := old.cikis_token;
  end if;
  return new;
end; $function$;

drop trigger if exists ic_sevk_koru on public.ic_sevkler;
create trigger ic_sevk_koru before insert or update on public.ic_sevkler
  for each row execute function public.ic_sevk_koru();

-- ---------------------------------------------------------------------------
-- 3) Bildirim kutusu
-- ---------------------------------------------------------------------------
create table if not exists public.ic_bildirimler (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  is_emri_id uuid references public.ic_is_emirleri(id) on delete cascade,
  sevk_id uuid references public.ic_sevkler(id) on delete set null,
  sablon text not null,
  alici text not null check (alici in ('musteri', 'lojistik', 'yetkili')),
  kanal text not null check (kanal in ('whatsapp', 'eposta')),
  hedef text,
  alici_ad text,
  degerler jsonb not null default '[]'::jsonb check (jsonb_typeof(degerler) = 'array'),
  dugme_eki text,
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'gonderiliyor', 'gonderildi', 'atlandi', 'hata')),
  hata text,
  deneme integer not null default 0,
  olusturma timestamptz not null default now(),
  islem_zamani timestamptz,
  isleyen text
);
create index if not exists idx_ic_bildirimler_kutu on public.ic_bildirimler (company_id, durum, olusturma desc);
create index if not exists idx_ic_bildirimler_is_emri on public.ic_bildirimler (is_emri_id);
create index if not exists idx_ic_bildirimler_sevk on public.ic_bildirimler (sevk_id);
alter table public.ic_bildirimler enable row level security;

-- Bildirim ekleyen ortak yardimci (tetikleyiciler ve cikis fonksiyonlari)
create or replace function public.ic_bildirim_ekle(
  p_company uuid, p_is_emri uuid, p_sevk uuid, p_sablon text, p_alici text, p_kanal text,
  p_hedef text, p_alici_ad text, p_degerler jsonb, p_dugme_eki text, p_hata text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid;
begin
  insert into public.ic_bildirimler (company_id, is_emri_id, sevk_id, sablon, alici, kanal, hedef, alici_ad, degerler, dugme_eki, durum, hata)
  values (p_company, p_is_emri, p_sevk, p_sablon, p_alici, p_kanal, nullif(btrim(coalesce(p_hedef, '')), ''), p_alici_ad,
          p_degerler, p_dugme_eki,
          case when p_hata is null then 'bekliyor' else 'hata' end, p_hata)
  returning id into v_id;
  return v_id;
end; $function$;

-- Is emri: acildi -> siparis_alindi; tamamlandi -> siparis_tamamlandi; iptal -> bekleyen musteri mesajlari atlanir
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
    if new.durum = 'tamamlandi' then
      select count(*), coalesce(sum(net_kg), 0) into v_adet, v_kg from public.ic_sevkler where is_emri_id = new.id;
      if v_adet > 0 then
        perform public.ic_bildirim_ekle(new.company_id, new.id, null, 'siparis_tamamlandi', 'musteri', 'whatsapp',
          m.telefon, m.unvan,
          jsonb_build_array(m.unvan, new.is_emri_no, public.ic_urun_yazi(new.urun, new.ambalaj), v_adet::text, public.ic_kg_yazi(v_kg)),
          new.takip_token);
      end if;
    elsif new.durum = 'iptal' then
      update public.ic_bildirimler set durum = 'atlandi', hata = 'İş emri iptal edildi.', islem_zamani = now(), isleyen = 'sistem'
       where is_emri_id = new.id and alici = 'musteri' and durum = 'bekliyor';
    end if;
  end if;
  return new;
end; $function$;

drop trigger if exists ic_bildirim_is_emri on public.ic_is_emirleri;
create trigger ic_bildirim_is_emri after insert or update of durum on public.ic_is_emirleri
  for each row execute function public.ic_bildirim_is_emri();

-- Sevk girildi -> lojistige otomatik e-posta (cikis onayi talebi)
create or replace function public.ic_bildirim_sevk()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  e public.ic_is_emirleri%rowtype;
  m public.ic_musteriler%rowtype;
  a public.ic_piyasa_ayarlari%rowtype;
begin
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

drop trigger if exists ic_bildirim_sevk on public.ic_sevkler;
create trigger ic_bildirim_sevk after insert on public.ic_sevkler
  for each row execute function public.ic_bildirim_sevk();

-- ---------------------------------------------------------------------------
-- 4) Cikis onayi (cekirdek + iki giris: yetkili ekrani, lojistik baglantisi)
-- ---------------------------------------------------------------------------
create or replace function public.ic_cikis_uygula(p_sevk uuid, p_islem text, p_saat timestamptz, p_isleyen text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s public.ic_sevkler%rowtype;
  e public.ic_is_emirleri%rowtype;
  m public.ic_musteriler%rowtype;
  a public.ic_piyasa_ayarlari%rowtype;
  v_sira integer;
  v_kg numeric;
  v_adet integer;
  v_ilerleme text;
  v_plaka text;
begin
  select * into s from public.ic_sevkler where id = p_sevk for update;
  if not found then raise exception 'Sevk bulunamadı.' using errcode = 'P0002'; end if;
  if s.cikis_durumu = 'cikti' then
    return jsonb_build_object('durum', 'cikti', 'zaten', true, 'cikis_zamani', s.cikis_zamani);
  end if;
  select * into e from public.ic_is_emirleri where id = s.is_emri_id;
  if e.durum = 'iptal' then
    raise exception 'Bu iş emri iptal edildi; çıkış işlenemez.' using errcode = '23514';
  end if;
  select * into m from public.ic_musteriler where id = e.musteri_id;
  select * into a from public.ic_piyasa_ayarlari where company_id = s.company_id;
  v_plaka := s.plaka || case when s.dorse_plaka is not null then ' (Dorse: ' || s.dorse_plaka || ')' else '' end;

  if p_islem = 'cikti' then
    update public.ic_sevkler set cikis_durumu = 'cikti', cikis_zamani = now(), cikis_isleyen = p_isleyen where id = s.id;
    -- Musteriye gitmemis "cikis saati" mesaji artik gereksiz
    update public.ic_bildirimler set durum = 'atlandi', hata = 'Araç yola çıktı; yerine "yola çıktı" mesajı hazırlandı.', islem_zamani = now(), isleyen = 'sistem'
     where sevk_id = s.id and sablon = 'arac_cikis_saati' and durum = 'bekliyor';
    select count(*) filter (where olusturma <= s.olusturma), count(*), coalesce(sum(net_kg), 0)
      into v_sira, v_adet, v_kg from public.ic_sevkler where is_emri_id = e.id;
    v_ilerleme := case when e.hedef_tur = 'kg'
      then replace(public.ic_kg_yazi(v_kg), ' kg', '') || ' / ' || public.ic_kg_yazi(e.hedef_kg) || ' (' || v_sira || '. araç)'
      else v_adet || ' / ' || e.hedef_arac || ' araç (' || public.ic_kg_yazi(v_kg) || ')' end;
    perform public.ic_bildirim_ekle(s.company_id, e.id, s.id, 'arac_yola_cikti', 'musteri', 'whatsapp',
      m.telefon, m.unvan,
      jsonb_build_array(m.unvan, e.is_emri_no, v_plaka, public.ic_urun_yazi(e.urun, e.ambalaj),
        public.ic_kg_yazi(s.net_kg), coalesce(s.irsaliye_no, '-'), v_ilerleme),
      e.takip_token);
    return jsonb_build_object('durum', 'cikti', 'cikis_zamani', now());

  elsif p_islem = 'planla' then
    if p_saat is null or p_saat < now() - interval '5 minutes' or p_saat > now() + interval '36 hours' then
      raise exception 'Çıkış saati geçersiz (şimdiden sonraki 36 saat içinde olmalı).' using errcode = '22023';
    end if;
    update public.ic_sevkler set cikis_durumu = 'planlandi', cikis_planlanan = p_saat, cikis_isleyen = p_isleyen,
           cikis_hatirlatma = null, cikis_uyari = null where id = s.id;
    update public.ic_bildirimler set durum = 'atlandi', hata = 'Yeni çıkış saati verildi.', islem_zamani = now(), isleyen = 'sistem'
     where sevk_id = s.id and sablon = 'arac_cikis_saati' and durum = 'bekliyor';
    perform public.ic_bildirim_ekle(s.company_id, e.id, s.id, 'arac_cikis_saati', 'musteri', 'whatsapp',
      m.telefon, m.unvan,
      jsonb_build_array(m.unvan, e.is_emri_no, s.plaka, to_char(p_saat at time zone 'Europe/Istanbul', 'HH24:MI')),
      e.takip_token);
    return jsonb_build_object('durum', 'planlandi', 'cikis_planlanan', p_saat);

  elsif p_islem = 'bugun_degil' then
    update public.ic_sevkler set cikis_durumu = 'bugun_degil', cikis_isleyen = p_isleyen, cikis_planlanan = null where id = s.id;
    update public.ic_bildirimler set durum = 'atlandi', hata = 'Araç bugün çıkmayacak.', islem_zamani = now(), isleyen = 'sistem'
     where sevk_id = s.id and sablon = 'arac_cikis_saati' and durum = 'bekliyor';
    perform public.ic_bildirim_ekle(s.company_id, e.id, s.id, 'cikis_bugun_degil', 'yetkili', 'eposta',
      a.yetkili_eposta, 'İç piyasa yetkilisi',
      jsonb_build_array(s.plaka, e.is_emri_no || ' · ' || coalesce(nullif(m.kisa_ad, ''), m.unvan), public.ic_urun_yazi(e.urun, e.ambalaj), public.ic_kg_yazi(s.net_kg), coalesce(p_isleyen, '-')),
      s.cikis_token,
      case when a.yetkili_eposta is null then 'Yetkili e-posta adresi tanımlı değil.' end);
    return jsonb_build_object('durum', 'bugun_degil');
  end if;
  raise exception 'Geçersiz işlem.' using errcode = '22023';
end; $function$;

-- Yetkili ekranindan (Is Emirleri) elle cikis isleme
create or replace function public.ic_cikis_isle_yetkili(p_sevk uuid, p_islem text, p_saat timestamptz default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null or not ic_sayfa_yetkisi('ic_piyasa')
     or not exists (select 1 from public.ic_sevkler where id = p_sevk and company_id = auth_company_id()) then
    raise exception 'Bu işlem için yetkiniz yok.' using errcode = '42501';
  end if;
  return public.ic_cikis_uygula(p_sevk, p_islem, p_saat, coalesce(lower(nullif(auth.jwt() ->> 'email', '')), 'yetkili'));
end; $function$;

-- Lojistik baglantisi (sadece edge function / service_role)
create or replace function public.ic_cikis_token_bilgi(p_token text)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'plaka', s.plaka, 'dorse_plaka', s.dorse_plaka, 'net_kg', s.net_kg, 'irsaliye_no', s.irsaliye_no,
    'yukleme', s.olusturma, 'cikis_durumu', s.cikis_durumu, 'cikis_planlanan', s.cikis_planlanan,
    'cikis_zamani', s.cikis_zamani, 'cikis_isleyen', s.cikis_isleyen,
    'is_emri_no', e.is_emri_no, 'is_emri_durum', e.durum, 'urun', e.urun, 'ambalaj', e.ambalaj, 'teslim', e.teslim,
    'teslim_adresi', e.teslim_adresi, 'musteri', coalesce(nullif(m.kisa_ad, ''), m.unvan))
  from public.ic_sevkler s
  join public.ic_is_emirleri e on e.id = s.is_emri_id
  join public.ic_musteriler m on m.id = e.musteri_id
  where s.cikis_token = p_token and length(p_token) = 32;
$function$;

create or replace function public.ic_cikis_token_isle(p_token text, p_islem text, p_saat timestamptz default null, p_isleyen text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid;
begin
  select id into v_id from public.ic_sevkler where cikis_token = p_token and length(p_token) = 32;
  if v_id is null then raise exception 'Bağlantı geçersiz.' using errcode = 'P0002'; end if;
  return public.ic_cikis_uygula(v_id, p_islem, p_saat, coalesce(nullif(btrim(coalesce(p_isleyen, '')), ''), 'Lojistik (bağlantı)'));
end; $function$;

-- Musteri takip sayfasi verisi (sadece edge function / service_role)
create or replace function public.ic_takip_bilgi(p_token text)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'is_emri_no', e.is_emri_no, 'durum', e.durum, 'urun', e.urun, 'ambalaj', e.ambalaj,
    'hedef_tur', e.hedef_tur, 'hedef_kg', e.hedef_kg, 'hedef_arac', e.hedef_arac,
    'birim_fiyat', e.birim_fiyat, 'kdv_dahil', e.kdv_dahil, 'vade_gun', e.vade_gun, 'odeme', e.odeme,
    'teslim', e.teslim, 'teslim_adresi', e.teslim_adresi, 'musteri_siparis_no', e.musteri_siparis_no,
    'olusturma', e.olusturma, 'kapanis_zamani', e.kapanis_zamani,
    'musteri', m.unvan, 'sirket', c.company_name,
    'sevkler', coalesce((
      select jsonb_agg(jsonb_build_object(
        'plaka', s.plaka, 'dorse_plaka', s.dorse_plaka, 'net_kg', s.net_kg, 'irsaliye_no', s.irsaliye_no,
        'irsaliye_tarihi', s.irsaliye_tarihi, 'yukleme', s.olusturma, 'cikis_durumu', s.cikis_durumu,
        'cikis_planlanan', s.cikis_planlanan, 'cikis_zamani', s.cikis_zamani, 'dosya', s.irsaliye_dosya_yolu)
        order by s.olusturma)
      from public.ic_sevkler s where s.is_emri_id = e.id), '[]'::jsonb))
  from public.ic_is_emirleri e
  join public.ic_musteriler m on m.id = e.musteri_id
  join public.companies c on c.id = e.company_id
  where e.takip_token = p_token and length(p_token) = 32;
$function$;

-- Zamanlanmis kontroller (edge function her calismada cagirir):
--  * planlanan saat geldi, cevap yok   -> lojistige "cikti mi?" hatirlatmasi
--  * planlanan saatten 30 dk sonra hala yok -> yetkiliye uyari
--  * planlanmamis, yukleme +60 dk hala bekliyor -> lojistige hatirlatma
--  * yukleme +120 dk hala bekliyor -> yetkiliye uyari
-- Sadece son 3 gunun sevkleri; her adim bir kez (cikis_hatirlatma / cikis_uyari).
create or replace function public.ic_bildirim_zamanla()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  v_say integer := 0;
begin
  for r in
    select s.*, e.is_emri_no, e.urun, e.ambalaj, e.durum as emir_durum,
           coalesce(nullif(m.kisa_ad, ''), m.unvan) as musteri_ad,
           a.lojistik_eposta, a.lojistik_ad, a.yetkili_eposta
    from public.ic_sevkler s
    join public.ic_is_emirleri e on e.id = s.is_emri_id
    join public.ic_musteriler m on m.id = e.musteri_id
    left join public.ic_piyasa_ayarlari a on a.company_id = s.company_id
    where s.cikis_durumu in ('bekliyor', 'planlandi')
      and s.olusturma > now() - interval '3 days'
      and e.durum <> 'iptal'
    for update of s skip locked
  loop
    if r.cikis_hatirlatma is null and (
         (r.cikis_durumu = 'planlandi' and r.cikis_planlanan <= now())
      or (r.cikis_durumu = 'bekliyor' and r.olusturma <= now() - interval '60 minutes')) then
      perform public.ic_bildirim_ekle(r.company_id, r.is_emri_id, r.id, 'cikis_hatirlatma', 'lojistik', 'eposta',
        r.lojistik_eposta, coalesce(r.lojistik_ad, 'Lojistik'),
        jsonb_build_array(r.plaka, r.is_emri_no || ' · ' || r.musteri_ad, public.ic_urun_yazi(r.urun, r.ambalaj), public.ic_kg_yazi(r.net_kg),
          case when r.cikis_durumu = 'planlandi' then to_char(r.cikis_planlanan at time zone 'Europe/Istanbul', 'HH24:MI') else '-' end),
        r.cikis_token,
        case when r.lojistik_eposta is null then 'Lojistik e-posta adresi tanımlı değil.' end);
      update public.ic_sevkler set cikis_hatirlatma = now() where id = r.id;
      v_say := v_say + 1;
    elsif r.cikis_uyari is null and (
         (r.cikis_durumu = 'planlandi' and r.cikis_planlanan <= now() - interval '30 minutes')
      or (r.cikis_durumu = 'bekliyor' and r.olusturma <= now() - interval '120 minutes')) then
      perform public.ic_bildirim_ekle(r.company_id, r.is_emri_id, r.id, 'cikis_cevap_yok', 'yetkili', 'eposta',
        r.yetkili_eposta, 'İç piyasa yetkilisi',
        jsonb_build_array(r.plaka, r.is_emri_no || ' · ' || r.musteri_ad, public.ic_urun_yazi(r.urun, r.ambalaj), public.ic_kg_yazi(r.net_kg),
          case when r.cikis_durumu = 'planlandi' then to_char(r.cikis_planlanan at time zone 'Europe/Istanbul', 'HH24:MI') else '-' end),
        r.cikis_token,
        case when r.yetkili_eposta is null then 'Yetkili e-posta adresi tanımlı değil.' end);
      update public.ic_sevkler set cikis_uyari = now() where id = r.id;
      v_say := v_say + 1;
    end if;
  end loop;
  return v_say;
end; $function$;

-- E-posta kuyrugundan is al (es zamanli iki calisma ayni postayi iki kez gondermesin)
create or replace function public.ic_bildirim_eposta_al(p_limit integer default 20)
 returns setof public.ic_bildirimler
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- 10 dakikadan uzun "gonderiliyor"da kalan (yarida kesilen) tekrar denenebilir
  update public.ic_bildirimler set durum = 'bekliyor'
   where kanal = 'eposta' and durum = 'gonderiliyor' and islem_zamani < now() - interval '10 minutes';
  return query
    update public.ic_bildirimler b set durum = 'gonderiliyor', islem_zamani = now(), deneme = b.deneme + 1
     where b.id in (select id from public.ic_bildirimler
                     where kanal = 'eposta' and durum = 'bekliyor' and hedef is not null
                     order by olusturma limit greatest(1, least(coalesce(p_limit, 20), 50))
                     for update skip locked)
    returning b.*;
end; $function$;

create or replace function public.ic_bildirim_eposta_sonuc(p_id uuid, p_basarili boolean, p_hata text default null)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  update public.ic_bildirimler
     set durum = case when p_basarili then 'gonderildi' when deneme >= 3 then 'hata' else 'bekliyor' end,
         hata = case when p_basarili then null else left(p_hata, 500) end,
         islem_zamani = now(), isleyen = 'e-posta'
   where id = p_id and durum = 'gonderiliyor';
$function$;

-- ---------------------------------------------------------------------------
-- 5) Is emri tamamen silme: iptal edilmis (ya da sevksiz) is emri, sevkleri
--    ve bildirimleriyle. Donus: depodan silinecek irsaliye dosya yollari.
--    Dogru sira (CLAUDE.md): once kayit, SADECE basariliysa dosyalar (istemci).
-- ---------------------------------------------------------------------------
create or replace function public.ic_is_emri_tamamen_sil(p_id uuid)
 returns text[]
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  e public.ic_is_emirleri%rowtype;
  v_yollar text[];
begin
  select * into e from public.ic_is_emirleri where id = p_id for update;
  if not found or auth.uid() is null or e.company_id is distinct from auth_company_id() or not ic_sayfa_yetkisi('ic_piyasa') then
    raise exception 'İş emri bulunamadı veya yetkiniz yok.' using errcode = '42501';
  end if;
  if e.durum <> 'iptal' and exists (select 1 from public.ic_sevkler where is_emri_id = p_id) then
    raise exception 'Araç girilmiş iş emri ancak iptal edildikten sonra tamamen silinebilir.' using errcode = '23514';
  end if;
  select coalesce(array_agg(irsaliye_dosya_yolu), '{}') into v_yollar from public.ic_sevkler where is_emri_id = p_id;
  delete from public.ic_sevkler where is_emri_id = p_id;
  delete from public.ic_is_emirleri where id = p_id;
  return v_yollar;
end; $function$;

-- ---------------------------------------------------------------------------
-- 6) Kantar son sevkler: cikis durumu da donsun (donus tipi degisti)
-- ---------------------------------------------------------------------------
drop function if exists public.kantar_ic_son_sevkler(integer);
create or replace function public.kantar_ic_son_sevkler(p_gun integer default 3)
 returns table (
   id uuid, is_emri_no text, musteri_maskeli text, urun text, plaka text, dorse_plaka text,
   net_kg numeric, irsaliye_no text, irsaliye_dosya_yolu text, uyari_var boolean,
   girilen_email text, olusturma timestamptz, cikis_durumu text, cikis_planlanan timestamptz, cikis_zamani timestamptz
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
    select s.id, e.is_emri_no, ic_maskele(m.unvan), e.urun, s.plaka, s.dorse_plaka,
           s.net_kg, s.irsaliye_no, s.irsaliye_dosya_yolu, cardinality(s.uyarilar) > 0,
           s.girilen_email, s.olusturma, s.cikis_durumu, s.cikis_planlanan, s.cikis_zamani
    from public.ic_sevkler s
    join public.ic_is_emirleri e on e.id = s.is_emri_id
    join public.ic_musteriler m on m.id = e.musteri_id
    where s.company_id = auth_company_id()
      and s.olusturma >= now() - make_interval(days => greatest(1, least(coalesce(p_gun, 3), 31)))
    order by s.olusturma desc;
end; $function$;

-- ---------------------------------------------------------------------------
-- 7) RLS
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ic_piyasa_ayarlari' and policyname = 'ic_piyasa_ayarlari_select') then
    create policy ic_piyasa_ayarlari_select on public.ic_piyasa_ayarlari for select
      using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ic_piyasa_ayarlari' and policyname = 'ic_piyasa_ayarlari_insert') then
    create policy ic_piyasa_ayarlari_insert on public.ic_piyasa_ayarlari for insert
      with check (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ic_piyasa_ayarlari' and policyname = 'ic_piyasa_ayarlari_update') then
    create policy ic_piyasa_ayarlari_update on public.ic_piyasa_ayarlari for update
      using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'))
      with check (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
  end if;
  -- Bildirimler: yetkili okur ve "gonderildi / atla" isaretler; ekleme/silme yok
  if not exists (select 1 from pg_policies where tablename = 'ic_bildirimler' and policyname = 'ic_bildirimler_select') then
    create policy ic_bildirimler_select on public.ic_bildirimler for select
      using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ic_bildirimler' and policyname = 'ic_bildirimler_update') then
    create policy ic_bildirimler_update on public.ic_bildirimler for update
      using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'))
      with check (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
  end if;
end $$;

-- Fiyat tablosu ve formlar: SADECE ic_piyasa yetkilisi (once tum sirket okuyabiliyordu)
drop policy if exists ic_fiyat_kalemleri_select_own_company on public.ic_fiyat_kalemleri;
drop policy if exists ic_fiyat_kalemleri_insert_own_company on public.ic_fiyat_kalemleri;
drop policy if exists ic_fiyat_kalemleri_update_own_company on public.ic_fiyat_kalemleri;
drop policy if exists ic_fiyat_kalemleri_delete_own_company on public.ic_fiyat_kalemleri;
drop policy if exists ic_fiyat_formlari_select_own_company on public.ic_fiyat_formlari;
drop policy if exists ic_fiyat_formlari_insert_own_company on public.ic_fiyat_formlari;
create policy ic_fiyat_kalemleri_select_own_company on public.ic_fiyat_kalemleri for select
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
create policy ic_fiyat_kalemleri_insert_own_company on public.ic_fiyat_kalemleri for insert
  with check (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
create policy ic_fiyat_kalemleri_update_own_company on public.ic_fiyat_kalemleri for update
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'))
  with check (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
create policy ic_fiyat_kalemleri_delete_own_company on public.ic_fiyat_kalemleri for delete
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
create policy ic_fiyat_formlari_select_own_company on public.ic_fiyat_formlari for select
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));
create policy ic_fiyat_formlari_insert_own_company on public.ic_fiyat_formlari for insert
  with check (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_piyasa'));

-- Fiyat formu numarasi: yetki kontrolu de numaradan ONCE (RLS sonra calisir; sayac bosluk birakmasin)
create or replace function public.ic_fiyat_formu_hazirla()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  tr_gun date;
begin
  if new.kalemler is null or jsonb_typeof(new.kalemler) <> 'array' or jsonb_array_length(new.kalemler) = 0 then
    raise exception 'Form en az bir urun satiri icermeli.' using errcode = '23514';
  end if;
  if auth.uid() is not null and (new.company_id is distinct from auth_company_id() or not ic_sayfa_yetkisi('ic_piyasa')) then
    raise exception 'Bu sirket icin form olusturma yetkiniz yok.' using errcode = '42501';
  end if;
  new.onay_zamani := now();
  new.olusturma := now();
  new.olusturan := auth.uid();
  tr_gun := (now() at time zone 'Europe/Istanbul')::date;
  new.gecerlilik_bitis := tr_gun + 3;
  new.form_no := 'FBF-' || extract(year from tr_gun)::text || '-'
    || lpad(pg_catalog.nextval('public.ic_fiyat_formu_sira'::regclass)::text, 4, '0');
  return new;
end; $function$;

-- Denetim kayitlari
drop trigger if exists denetim_ic_piyasa_ayarlari on public.ic_piyasa_ayarlari;
create trigger denetim_ic_piyasa_ayarlari after insert or update or delete on public.ic_piyasa_ayarlari
  for each row execute function public.denetim_tetikleyici();

-- ---------------------------------------------------------------------------
-- 8) Yetkiler
-- ---------------------------------------------------------------------------
revoke all on table public.ic_piyasa_ayarlari from anon, authenticated, public;
revoke all on table public.ic_bildirimler from anon, authenticated, public;
grant select, insert, update on table public.ic_piyasa_ayarlari to authenticated;
grant select on table public.ic_bildirimler to authenticated;
grant update (durum, islem_zamani, isleyen, hata) on table public.ic_bildirimler to authenticated;
grant all on table public.ic_piyasa_ayarlari to service_role;
grant all on table public.ic_bildirimler to service_role;

revoke all on function public.ic_bildirim_ekle(uuid, uuid, uuid, text, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.ic_bildirim_is_emri() from public, anon, authenticated;
revoke all on function public.ic_bildirim_sevk() from public, anon, authenticated;
revoke all on function public.ic_sevk_koru() from public, anon, authenticated;
revoke all on function public.ic_cikis_uygula(uuid, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.ic_cikis_token_bilgi(text) from public, anon, authenticated;
revoke all on function public.ic_cikis_token_isle(text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.ic_takip_bilgi(text) from public, anon, authenticated;
revoke all on function public.ic_bildirim_zamanla() from public, anon, authenticated;
revoke all on function public.ic_bildirim_eposta_al(integer) from public, anon, authenticated;
revoke all on function public.ic_bildirim_eposta_sonuc(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.ic_cikis_isle_yetkili(uuid, text, timestamptz) from public, anon;
revoke all on function public.ic_is_emri_tamamen_sil(uuid) from public, anon;
revoke all on function public.kantar_ic_son_sevkler(integer) from public, anon;
revoke all on function public.ic_kg_yazi(numeric) from public, anon;
revoke all on function public.ic_ton_yazi(numeric) from public, anon;
revoke all on function public.ic_urun_yazi(text, text) from public, anon;
grant execute on function public.ic_cikis_isle_yetkili(uuid, text, timestamptz) to authenticated;
grant execute on function public.ic_is_emri_tamamen_sil(uuid) to authenticated;
grant execute on function public.kantar_ic_son_sevkler(integer) to authenticated;
grant execute on function public.ic_kg_yazi(numeric), public.ic_ton_yazi(numeric), public.ic_urun_yazi(text, text) to authenticated;
grant execute on function public.ic_cikis_token_bilgi(text), public.ic_cikis_token_isle(text, text, timestamptz, text),
  public.ic_takip_bilgi(text), public.ic_bildirim_zamanla(), public.ic_bildirim_eposta_al(integer),
  public.ic_bildirim_eposta_sonuc(uuid, boolean, text) to service_role;

comment on table public.ic_piyasa_ayarlari is 'Ic piyasa: lojistik ve yetkili iletisim (cikis onayi e-postalari) (12.10.2026).';
comment on table public.ic_bildirimler is 'Ic piyasa gonderilecek mesaj kutusu: sablon + degerler; musteri WhatsApp elle, lojistik/yetkili e-posta otomatik (12.10.2026).';
