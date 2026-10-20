-- ============================================================================
-- DBA OTOMATIK YUKLEME (20.10.2026)
-- ============================================================================
-- Kantar bilgisayarindaki Solas, DBA belgesini C:\Truck Scale\DBA klasorune
-- "<12 haneli belge no>_<yukleten>.pdf" adiyla kaydeder. Kantar bilgisayarindaki
-- kucuk bir gorev yeni PDF'i edge function "dba-otomatik"e gonderir; fonksiyon
-- PDF'i METIN olarak okur (yapay zeka yok) ve asagidaki fonksiyonlarla eslestirir.
--
-- SADECE EKLEME yapar; mevcut tablo / politika / fonksiyon DEGISMEZ. Tek istisna:
-- konteynerler'e (company_id, dba_belge_no) TEKIL indeks eklenir - ayni DBA belgesi
-- iki konteynere yazilamasin (bugune kadar sadece tarayicida kontrol ediliyordu;
-- 20.10.2026 itibariyla canlida mukerrer YOK). Elle yukleme akisi etkilenmez.
--
--  1) kantar_cihazlari         : DBA gonderebilen cihaz. Kisisel sifre DEGIL; yalnizca
--                                bu ise yetkili, tek tikla iptal edilebilen ANAHTAR
--                                (veritabaninda sadece SHA-256 ozeti saklanir).
--                                canli = false -> DENEME MODU: okur, eslestirir,
--                                kaydeder ama konteynere HICBIR SEY YAZMAZ.
--  2) dba_otomatik_kayitlari   : her belge icin tek satir (son durum + deneme sayisi).
--  3) dba_otomatik_esles       : eslestirme kurali (tek yer).
--  4) dba_otomatik_degerlendir : (service_role) okunan belge -> karar + kayit.
--  5) dba_otomatik_uygula      : (service_role) konteyner satiri KILITLENIR, kosullar
--                                yeniden kontrol edilir, DBA yazilir - tek islem.
--  6) dba_otomatik_sinyal      : (service_role) cihaz son sinyal.
--  7) kantar_dba_otomasyon_durumu / dba_otomatik_yoksay : Kantar Paneli (kantar yetkisi).
--
-- Kurallar (otomatik yukleme SADECE su durumda yapilir):
--   - belge cihazin kantarindan (kantar no + vergi no, fonksiyonda kontrol edilir)
--   - konteyner no ACIK bir dosyada TAM OLARAK BIR konteynerde var
--   - o konteynerin DBA'si BOS ve belge no baska konteynerde yok
-- Aksi her durumda konteynere DOKUNULMAZ; belge Kantar Paneli'nde listelenir.
-- ASLA UZERINE YAZMAZ (yeniden tartim vb. -> "cakisma", karar personelin).
-- ============================================================================

-- Tek islem: ya tamami uygulanir ya hicbiri.
begin;

-- ---------------------------------------------------------------------------
-- 0) Ayni DBA belgesi iki konteynere yazilamaz (veritabani guvencesi)
-- ---------------------------------------------------------------------------
create unique index if not exists konteynerler_dba_belge_no_tekil
  on public.konteynerler (company_id, dba_belge_no)
  where dba_belge_no is not null and dba_belge_no <> '';

-- ---------------------------------------------------------------------------
-- 1) Cihazlar
-- ---------------------------------------------------------------------------
create table if not exists public.kantar_cihazlari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ad text not null check (char_length(btrim(ad)) between 2 and 60),
  anahtar_ozeti text not null unique check (anahtar_ozeti ~ '^[0-9a-f]{64}$'),
  kantar_no text not null default '2587' check (kantar_no ~ '^[0-9]{3,6}$'),
  kantar_vergi_no text not null default '8920645297' check (kantar_vergi_no ~ '^[0-9]{10,11}$'),
  canli boolean not null default false,
  aktif boolean not null default true,
  son_sinyal timestamptz,
  son_surum text,
  olusturma_tarihi timestamptz not null default now()
);
alter table public.kantar_cihazlari enable row level security;
revoke all on table public.kantar_cihazlari from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Belge kayitlari (her belge icin tek satir)
-- ---------------------------------------------------------------------------
create table if not exists public.dba_otomatik_kayitlari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  cihaz_id uuid references public.kantar_cihazlari(id) on delete set null,
  dba_belge_no text not null check (dba_belge_no ~ '^[0-9]{12}$'),
  dosya_adi text not null check (char_length(dosya_adi) between 1 and 255),
  -- yuklendi    : otomatik yuklendi (canli)
  -- eslesti     : DENEME MODU - yuklenecekti, yazilmadi
  -- zaten_yuklu : belge zaten dogru konteynerde (elle yuklenmis)
  -- beklemede   : konteyner henuz sistemde yok, tekrar denenir (72 saat)
  -- eslesmedi   : 72 saatte eslesmedi / konteyner sadece kapali dosyada
  -- cakisma     : konteynerde baska DBA var / konteyner birden fazla acik dosyada /
  --               belge baska konteynerde
  -- okunamadi   : PDF okunamadi / dogrulanamadi
  -- yoksayildi  : personel listeden kaldirdi
  durum text not null check (durum in ('yuklendi','eslesti','zaten_yuklu','beklemede','eslesmedi','cakisma','okunamadi','yoksayildi')),
  mod text not null check (mod in ('deneme','canli')),
  konteyner_no text,
  konteyner_id uuid references public.konteynerler(id) on delete set null,
  dosya_no text,
  mesaj text,
  okunan jsonb,
  deneme_sayisi integer not null default 1,
  ilk_gorulme timestamptz not null default now(),
  son_deneme timestamptz not null default now(),
  yukleme_tarihi timestamptz,
  isleyen text,
  unique (company_id, dba_belge_no)
);
create index if not exists dba_otomatik_kayitlari_sirket_zaman
  on public.dba_otomatik_kayitlari (company_id, son_deneme desc);
alter table public.dba_otomatik_kayitlari enable row level security;
revoke all on table public.dba_otomatik_kayitlari from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Eslestirme kurali (TEK YER)
-- ---------------------------------------------------------------------------
create or replace function public.dba_otomatik_esles(p_company uuid, p_belge text, p_konteyner text, p_ilk_gorulme timestamptz)
 returns table (karar text, konteyner_id uuid, dosya_id uuid, dosya_no text, mesaj text)
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_kn text := upper(replace(coalesce(p_konteyner, ''), ' ', ''));
  v_bel record;
  v_say integer;
  v_k record;
begin
  -- a) Belge no zaten bir konteynerde mi?
  select k.id, upper(replace(k.konteyner_no, ' ', '')) as kno, k.dosya_id, d.dosya_no
    into v_bel
    from konteynerler k join ihracat_dosyalari d on d.id = k.dosya_id
   where k.company_id = p_company and k.dba_belge_no = p_belge
   limit 1;
  if found then
    if v_bel.kno = v_kn then
      return query select 'zaten_yuklu'::text, v_bel.id, v_bel.dosya_id, v_bel.dosya_no,
        format('Bu DBA %s dosyasındaki %s konteynerine zaten yüklü.', v_bel.dosya_no, v_bel.kno);
    else
      return query select 'cakisma'::text, v_bel.id, v_bel.dosya_id, v_bel.dosya_no,
        format('Bu belge no %s dosyasındaki %s konteynerine yüklü; belgedeki konteyner %s.', v_bel.dosya_no, v_bel.kno, v_kn);
    end if;
    return;
  end if;

  -- b) Acik dosyalardaki eslesen konteynerler
  select count(*) into v_say
    from konteynerler k join ihracat_dosyalari d on d.id = k.dosya_id
   where k.company_id = p_company and d.durum in ('Açık', 'Acik')
     and upper(replace(k.konteyner_no, ' ', '')) = v_kn;

  if v_say > 1 then
    return query select 'cakisma'::text, null::uuid, null::uuid, null::text,
      format('%s konteyneri birden fazla açık dosyada var; elle yükleyin.', v_kn);
    return;
  end if;

  if v_say = 0 then
    if exists (select 1 from konteynerler k where k.company_id = p_company and upper(replace(k.konteyner_no, ' ', '')) = v_kn) then
      return query select 'eslesmedi'::text, null::uuid, null::uuid, null::text,
        format('%s konteyneri yalnızca kapalı dosyada var.', v_kn);
    elsif coalesce(p_ilk_gorulme, now()) < now() - interval '72 hours' then
      return query select 'eslesmedi'::text, null::uuid, null::uuid, null::text,
        format('%s konteyneri 72 saat içinde sisteme eklenmedi.', v_kn);
    else
      return query select 'beklemede'::text, null::uuid, null::uuid, null::text,
        format('%s konteyneri henüz açık bir dosyaya eklenmemiş; eklenince otomatik yüklenecek.', v_kn);
    end if;
    return;
  end if;

  select k.id, k.dosya_id, d.dosya_no, k.dba_dosya_url, k.dba_belge_no
    into v_k
    from konteynerler k join ihracat_dosyalari d on d.id = k.dosya_id
   where k.company_id = p_company and d.durum in ('Açık', 'Acik')
     and upper(replace(k.konteyner_no, ' ', '')) = v_kn;

  if v_k.dba_dosya_url is not null then
    return query select 'cakisma'::text, v_k.id, v_k.dosya_id, v_k.dosya_no,
      format('%s konteynerinde başka bir DBA (%s) yüklü; yeniden tartımsa elle değiştirin.', v_kn, coalesce(v_k.dba_belge_no, 'belge no yok'));
    return;
  end if;

  return query select 'eslesti'::text, v_k.id, v_k.dosya_id, v_k.dosya_no,
    format('%s dosyasındaki %s konteyneri.', v_k.dosya_no, v_kn);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Kayit yazma yardimcisi: her belge icin tek satir; "yuklendi" / "eslesti"
-- sonradan "zaten_yuklu"ya DUSURULMEZ (gecmis kaybolmasin).
-- ---------------------------------------------------------------------------
create or replace function public.dba_otomatik_kaydet(
  p_company uuid, p_cihaz uuid, p_belge text, p_dosya_adi text, p_durum text, p_mod text,
  p_konteyner_no text, p_konteyner_id uuid, p_dosya_no text, p_mesaj text, p_okunan jsonb)
 returns public.dba_otomatik_kayitlari
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_satir public.dba_otomatik_kayitlari;
begin
  insert into dba_otomatik_kayitlari as t
    (company_id, cihaz_id, dba_belge_no, dosya_adi, durum, mod, konteyner_no, konteyner_id, dosya_no, mesaj, okunan, yukleme_tarihi)
  values
    (p_company, p_cihaz, p_belge, left(p_dosya_adi, 255), p_durum, p_mod, p_konteyner_no, p_konteyner_id, p_dosya_no, p_mesaj, p_okunan,
     case when p_durum = 'yuklendi' then now() end)
  on conflict (company_id, dba_belge_no) do update set
    cihaz_id = excluded.cihaz_id,
    dosya_adi = excluded.dosya_adi,
    durum = case when t.durum in ('yuklendi', 'eslesti') and excluded.durum = 'zaten_yuklu' then t.durum else excluded.durum end,
    mod = excluded.mod,
    konteyner_no = coalesce(excluded.konteyner_no, t.konteyner_no),
    konteyner_id = coalesce(excluded.konteyner_id, t.konteyner_id),
    dosya_no = coalesce(excluded.dosya_no, t.dosya_no),
    mesaj = case when t.durum in ('yuklendi', 'eslesti') and excluded.durum = 'zaten_yuklu' then t.mesaj else excluded.mesaj end,
    okunan = coalesce(excluded.okunan, t.okunan),
    deneme_sayisi = t.deneme_sayisi + 1,
    son_deneme = now(),
    yukleme_tarihi = coalesce(t.yukleme_tarihi, excluded.yukleme_tarihi)
  returning * into v_satir;
  return v_satir;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4) Degerlendir: okunan belge -> karar. Konteynere YAZMAZ.
--    Donen tekrar_dk: kantar gorevinin ayni belgeyi kac dk sonra yeniden
--    gondermesi gerektigi (null = bir daha gonderme).
-- ---------------------------------------------------------------------------
create or replace function public.dba_otomatik_degerlendir(
  p_cihaz_id uuid, p_belge_no text, p_dosya_adi text, p_okunan jsonb, p_okuma_hatasi text)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_cihaz record;
  v_onceki record;
  v_e record;
  v_durum text;
  v_mesaj text;
  v_tekrar integer;
  v_satir public.dba_otomatik_kayitlari;
  v_kn text := nullif(upper(coalesce(p_okunan ->> 'konteyner_no', '')), '');
begin
  if p_belge_no is null or p_belge_no !~ '^[0-9]{12}$' then
    raise exception 'Geçersiz belge no';
  end if;
  select id, company_id, canli into v_cihaz from kantar_cihazlari where id = p_cihaz_id and aktif;
  if not found then raise exception 'Cihaz bulunamadı veya iptal edilmiş'; end if;

  select durum, ilk_gorulme into v_onceki from dba_otomatik_kayitlari
   where company_id = v_cihaz.company_id and dba_belge_no = p_belge_no;

  if found and v_onceki.durum = 'yoksayildi' then
    update dba_otomatik_kayitlari set deneme_sayisi = deneme_sayisi + 1, son_deneme = now()
     where company_id = v_cihaz.company_id and dba_belge_no = p_belge_no;
    return jsonb_build_object('karar', 'yoksayildi', 'mod', case when v_cihaz.canli then 'canli' else 'deneme' end,
      'mesaj', 'Personel bu belgeyi listeden kaldırmış.', 'tekrar_dk', null);
  end if;

  if p_okuma_hatasi is not null or v_kn is null then
    v_satir := dba_otomatik_kaydet(v_cihaz.company_id, v_cihaz.id, p_belge_no, p_dosya_adi, 'okunamadi',
      case when v_cihaz.canli then 'canli' else 'deneme' end, null, null, null,
      coalesce(p_okuma_hatasi, 'Konteyner no okunamadı.'), null);
    return jsonb_build_object('karar', 'okunamadi', 'mod', v_satir.mod, 'mesaj', v_satir.mesaj, 'tekrar_dk', null, 'kayit_id', v_satir.id);
  end if;

  select * into v_e from dba_otomatik_esles(v_cihaz.company_id, p_belge_no, v_kn, coalesce(v_onceki.ilk_gorulme, now()));

  v_durum := v_e.karar;
  v_mesaj := v_e.mesaj;
  v_tekrar := null;

  if v_durum = 'eslesti' then
    if v_cihaz.canli then
      -- Canli: kayit dba_otomatik_uygula'da yazilir (once PDF depoya yuklenir).
      return jsonb_build_object('karar', 'eslesti', 'mod', 'canli', 'konteyner_id', v_e.konteyner_id,
        'dosya_id', v_e.dosya_id, 'dosya_no', v_e.dosya_no, 'konteyner_no', v_kn, 'mesaj', v_mesaj, 'tekrar_dk', null);
    end if;
    v_mesaj := 'Deneme modu: ' || v_mesaj || ' konteynerine yüklenecekti (yazılmadı).';
  elsif v_durum = 'beklemede' then
    v_tekrar := 10;
  elsif v_durum = 'cakisma' and coalesce(v_onceki.ilk_gorulme, now()) > now() - interval '72 hours' then
    -- Personel duzeltirse (yanlis DBA'yi kaldirirsa) belge kendiliginden yuklenebilsin
    v_tekrar := 30;
  end if;

  v_satir := dba_otomatik_kaydet(v_cihaz.company_id, v_cihaz.id, p_belge_no, p_dosya_adi, v_durum,
    case when v_cihaz.canli then 'canli' else 'deneme' end, v_kn, v_e.konteyner_id, v_e.dosya_no, v_mesaj, p_okunan);

  return jsonb_build_object('karar', v_satir.durum, 'mod', v_satir.mod, 'konteyner_id', v_e.konteyner_id,
    'dosya_no', v_e.dosya_no, 'konteyner_no', v_kn, 'mesaj', v_satir.mesaj, 'tekrar_dk', v_tekrar, 'kayit_id', v_satir.id);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5) Uygula (sadece CANLI cihaz): konteyner satiri kilitlenir, butun kosullar
--    YENIDEN kontrol edilir, DBA yazilir. Kosul bozulduysa hicbir sey yazilmaz,
--    uygulandi=false doner (fonksiyon az once yukledigi PDF'i depodan siler).
--    Yazilan alanlar elle yuklemeyle (lib/hooks/use-dba-upload.ts) AYNI.
-- ---------------------------------------------------------------------------
create or replace function public.dba_otomatik_uygula(
  p_cihaz_id uuid, p_konteyner_id uuid, p_belge_no text, p_dosya_adi text, p_dosya_url text, p_okunan jsonb)
 returns jsonb
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_cihaz record;
  v_k record;
  v_kn text := upper(coalesce(p_okunan ->> 'konteyner_no', ''));
  v_e record;
  v_satir public.dba_otomatik_kayitlari;
  v_sonuc jsonb;
begin
  select id, company_id, canli into v_cihaz from kantar_cihazlari where id = p_cihaz_id and aktif;
  if not found then raise exception 'Cihaz bulunamadı veya iptal edilmiş'; end if;
  if not v_cihaz.canli then raise exception 'Cihaz deneme modunda; yazma yapılamaz'; end if;
  if p_belge_no is null or p_belge_no !~ '^[0-9]{12}$' or coalesce(p_okunan ->> 'dba_belge_no', '') <> p_belge_no then
    raise exception 'Belge no tutarsız';
  end if;
  if coalesce(p_dosya_url, '') !~ '^https://[^ ]+/storage/v1/object/sign/konsimento-talimatlari/dba/' then
    raise exception 'Geçersiz dosya adresi';
  end if;

  -- Satir kilidi: ayni anda elle yukleme / ikinci istek beklesin
  select k.id, k.company_id, upper(replace(k.konteyner_no, ' ', '')) as kno, k.dosya_id, k.dba_dosya_url, d.durum, d.dosya_no
    into v_k
    from konteynerler k join ihracat_dosyalari d on d.id = k.dosya_id
   where k.id = p_konteyner_id
   for update of k;

  -- Kosullari yeniden degerlendir (kilit altinda)
  select * into v_e from dba_otomatik_esles(v_cihaz.company_id, p_belge_no, v_kn, now());

  if not found or v_k.id is null or v_k.company_id <> v_cihaz.company_id or v_k.kno <> v_kn
     or v_k.durum not in ('Açık', 'Acik') or v_k.dba_dosya_url is not null
     or v_e.karar <> 'eslesti' or v_e.konteyner_id is distinct from p_konteyner_id then
    v_satir := dba_otomatik_kaydet(v_cihaz.company_id, v_cihaz.id, p_belge_no, p_dosya_adi,
      case when v_e.karar = 'eslesti' then 'cakisma' else v_e.karar end, 'canli', v_kn, v_e.konteyner_id, v_e.dosya_no,
      case when v_e.karar = 'eslesti' then 'Eşleşme yükleme sırasında değişti; tekrar denenecek.' else v_e.mesaj end, p_okunan);
    return jsonb_build_object('uygulandi', false, 'karar', v_satir.durum, 'mesaj', v_satir.mesaj,
      'tekrar_dk', case when v_satir.durum in ('beklemede', 'cakisma') then 10 end);
  end if;

  -- Denetim kaydinda kaynak gorunsun (degistiren_email)
  perform set_config('request.jwt.claims', json_build_object('email', 'dba-otomatik', 'role', 'service_role')::text, true);

  update konteynerler set
    plaka = nullif(p_okunan ->> 'arac_plaka', ''),
    tare_kg = nullif(p_okunan ->> 'konteyner_dara_kg', '')::numeric,
    vgm_kg = nullif(p_okunan ->> 'dogrulanmis_brut_agirlik_kg', '')::numeric,
    dba_dosya_url = p_dosya_url,
    dba_dosya_adi = left(p_dosya_adi, 255),
    dba_yukleme_tarihi = now(),
    dba_belge_no = p_belge_no,
    dba_kontrol_sonucu = (p_okunan - 'kantar_firma_vergi_no') || jsonb_build_object('uyusmazliklar', '[]'::jsonb, 'kaynak', 'otomatik', 'okuma', 'metin')
  where id = p_konteyner_id and dba_dosya_url is null;

  if not found then
    raise exception 'Konteyner güncellenemedi';
  end if;

  v_satir := dba_otomatik_kaydet(v_cihaz.company_id, v_cihaz.id, p_belge_no, p_dosya_adi, 'yuklendi', 'canli',
    v_kn, p_konteyner_id, v_k.dosya_no, format('%s dosyasındaki %s konteynerine otomatik yüklendi.', v_k.dosya_no, v_kn), p_okunan);

  return jsonb_build_object('uygulandi', true, 'karar', 'yuklendi', 'mesaj', v_satir.mesaj, 'tekrar_dk', null,
    'dosya_no', v_k.dosya_no, 'konteyner_no', v_kn);
exception when unique_violation then
  -- Ayni belge no baska konteynere (ayni anda elle) yazildi: hicbir sey yazilmadi
  v_satir := dba_otomatik_kaydet(v_cihaz.company_id, v_cihaz.id, p_belge_no, p_dosya_adi, 'cakisma', 'canli',
    v_kn, null, null, 'Bu belge no aynı anda başka bir konteynere yüklendi.', p_okunan);
  return jsonb_build_object('uygulandi', false, 'karar', 'cakisma', 'mesaj', v_satir.mesaj, 'tekrar_dk', 10);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6) Cihaz sinyali
-- ---------------------------------------------------------------------------
create or replace function public.dba_otomatik_sinyal(p_cihaz_id uuid, p_surum text)
 returns void
 language sql security definer set search_path to 'public'
as $function$
  update kantar_cihazlari set son_sinyal = now(), son_surum = left(p_surum, 40)
   where id = p_cihaz_id and aktif;
$function$;

-- ---------------------------------------------------------------------------
-- 7) Kantar Paneli: durum ve listeden kaldirma (kantar sayfa yetkisi + kendi sirketi)
-- ---------------------------------------------------------------------------
create or replace function public.kantar_dba_otomasyon_durumu()
 returns jsonb
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_sirket uuid := get_auth_company_id();
begin
  if v_sirket is null or not ic_sayfa_yetkisi('kantar') then
    raise exception 'Yetkiniz yok' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'cihazlar', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'ad', c.ad, 'canli', c.canli, 'son_sinyal', c.son_sinyal, 'son_surum', c.son_surum) order by c.olusturma_tarihi)
        from kantar_cihazlari c where c.company_id = v_sirket and c.aktif), '[]'::jsonb),
    'bugun', (
      select jsonb_build_object(
        'yuklendi', count(*) filter (where durum = 'yuklendi'),
        'eslesti', count(*) filter (where durum = 'eslesti'),
        'zaten_yuklu', count(*) filter (where durum = 'zaten_yuklu'))
        from dba_otomatik_kayitlari
       where company_id = v_sirket
         and ilk_gorulme >= (date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul')),
    'sorunlar', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'dba_belge_no', r.dba_belge_no, 'dosya_adi', r.dosya_adi, 'durum', r.durum,
               'konteyner_no', r.konteyner_no, 'dosya_no', r.dosya_no, 'mesaj', r.mesaj, 'ilk_gorulme', r.ilk_gorulme,
               'son_deneme', r.son_deneme, 'tartim', r.okunan ->> 'tartim_tarih_saat', 'plaka', r.okunan ->> 'arac_plaka')
               order by r.ilk_gorulme desc)
        from (select * from dba_otomatik_kayitlari
               where company_id = v_sirket
                 and durum in ('beklemede', 'eslesmedi', 'cakisma', 'okunamadi')
                 and son_deneme > now() - interval '7 days'
               order by ilk_gorulme desc limit 50) r), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.dba_otomatik_yoksay(p_kayit_id uuid)
 returns void
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_sirket uuid := get_auth_company_id();
  v_eposta text;
begin
  if v_sirket is null or not ic_sayfa_yetkisi('kantar') then
    raise exception 'Yetkiniz yok' using errcode = '42501';
  end if;
  begin v_eposta := lower(coalesce(auth.jwt() ->> 'email', '')); exception when others then v_eposta := null; end;
  update dba_otomatik_kayitlari
     set durum = 'yoksayildi', isleyen = v_eposta, son_deneme = now()
   where id = p_kayit_id and company_id = v_sirket
     and durum in ('beklemede', 'eslesmedi', 'cakisma', 'okunamadi');
  if not found then
    raise exception 'Kayıt bulunamadı veya zaten işlenmiş';
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Yetkiler: tablolar istemciye KAPALI; yazan fonksiyonlar sadece service_role
-- (edge function), panel fonksiyonlari sadece oturum acmis kullanici.
-- ---------------------------------------------------------------------------
revoke all on function public.dba_otomatik_esles(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.dba_otomatik_kaydet(uuid, uuid, text, text, text, text, text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.dba_otomatik_degerlendir(uuid, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.dba_otomatik_uygula(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.dba_otomatik_sinyal(uuid, text) from public, anon, authenticated;
revoke all on function public.kantar_dba_otomasyon_durumu() from public, anon;
revoke all on function public.dba_otomatik_yoksay(uuid) from public, anon;

grant execute on function public.dba_otomatik_degerlendir(uuid, text, text, jsonb, text) to service_role;
grant execute on function public.dba_otomatik_uygula(uuid, uuid, text, text, text, jsonb) to service_role;
grant execute on function public.dba_otomatik_sinyal(uuid, text) to service_role;
grant execute on function public.dba_otomatik_esles(uuid, text, text, timestamptz) to service_role;
grant execute on function public.kantar_dba_otomasyon_durumu() to authenticated;
grant execute on function public.dba_otomatik_yoksay(uuid) to authenticated;
grant select, insert, update, delete on table public.kantar_cihazlari, public.dba_otomatik_kayitlari to service_role;

commit;
