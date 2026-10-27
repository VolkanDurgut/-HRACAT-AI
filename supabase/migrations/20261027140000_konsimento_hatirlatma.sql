-- ============================================================================
-- KONSIMENTO TALIMATI HATIRLATMASI (27.10.2026)
-- ============================================================================
-- Kullanici: "Butun konteyner girildiginde konsimento talimati gonderilebilir
-- anlamina geliyor. Alici operation@unex.com.tr, CC bbt@ / execution@ /
-- export@. Hatirlatma maili; talimatta istenen dosya bilgileri de (fatura
-- talimatindaki gibi) paylasilsin, personel excelden bilgi toplamasin."
-- Kararlar (AskUserQuestion 27.10.2026): OTOMATIK + elle tekrar gonderim;
-- canliya ilk geciste mailler TEST adresine (edge function secret ile gercege gecilir).
--
-- AKIS
--  1. konteynerler INSERT (ya da rezervasyonun konteyner adedi degisince)
--     -> kh_tamamlanma_kontrol(dosya): rezervasyon adedi > 0 ve eklenen konteyner
--     = rezervasyon adedi ve konsimento talimati HENUZ YUKLENMEMIS ve BL no yoksa
--     kuyruga 1 satir (dosya basina TEK satir; ikinci kez otomatik gitmez).
--     Konteyner DUZENLEMEK (muhur, agirlik) tetiklemez -> eski dosyalara mail gitmez.
--     Tetikleyici HATA FIRLATMAZ: kuyruk yazilamazsa konteyner kaydi yine yapilir.
--  2. pg_cron 'konsimento-hatirlatma' (2 dk) SADECE kuyrukta is varsa
--     (kh_bekleyen_var) edge function "konsimento-hatirlatma" {"islem":"isle"} cagirir.
--  3. Edge function kh_kuyruk_al ile satiri kilitler + mail verisini alir, Resend ile
--     gonderir, kh_sonuc ile sonucu yazar (hata -> 10 dk sonra en fazla 3 deneme).
--  4. Uygulamada "Hatirlatmayi gonder / tekrar gonder": kh_elle_iste (oturum).
--
-- ihracat_dosyalari / konteynerler / rezervasyonlar KOLONLARINA DOKUNMAZ; sadece
-- AFTER tetikleyicisi eklenir. Yeni tablo istemciye SADECE OKUNUR.
-- ============================================================================

create table if not exists public.konsimento_hatirlatmalari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dosya_id uuid not null references public.ihracat_dosyalari(id) on delete cascade,
  durum text not null default 'bekliyor'
    check (durum in ('bekliyor', 'gonderiliyor', 'gonderildi', 'hata', 'atlandi')),
  tetik text not null default 'otomatik' check (tetik in ('otomatik', 'elle')),
  isteyen_email text,
  deneme integer not null default 0,
  kilit timestamptz,
  son_hata text check (son_hata is null or char_length(son_hata) <= 500),
  -- Son gonderimin bilgisi (test modunda alicilar = test adresi)
  test boolean,
  alicilar text,
  cc text,
  gonderim_sayisi integer not null default 0,
  ilk_gonderim timestamptz,
  son_gonderim timestamptz,
  olusturma timestamptz not null default now(),
  guncelleme timestamptz not null default now()
);
create unique index if not exists uq_konsimento_hatirlatma_dosya on public.konsimento_hatirlatmalari (dosya_id);
create index if not exists ix_konsimento_hatirlatma_durum on public.konsimento_hatirlatmalari (durum, guncelleme);

comment on table public.konsimento_hatirlatmalari is
  'Konsimento talimati hatirlatma maili kuyrugu/kaydi: tum konteynerler girilince operation@ + CC (27.10.2026).';

drop trigger if exists konsimento_hatirlatma_guncelleme on public.konsimento_hatirlatmalari;
create trigger konsimento_hatirlatma_guncelleme before update on public.konsimento_hatirlatmalari
  for each row execute function public.satin_alma_guncelleme_zamani();
drop trigger if exists denetim_konsimento_hatirlatmalari on public.konsimento_hatirlatmalari;
create trigger denetim_konsimento_hatirlatmalari after insert or update or delete on public.konsimento_hatirlatmalari
  for each row execute function public.denetim_tetikleyici();

-- RLS: dosyayi gorebilen (ihracat_dosyalari okuma politikasi) okur; yazmalar fonksiyonla.
alter table public.konsimento_hatirlatmalari enable row level security;
drop policy if exists "Konsimento hatirlatma - okuma" on public.konsimento_hatirlatmalari;
create policy "Konsimento hatirlatma - okuma" on public.konsimento_hatirlatmalari for select to authenticated
  using (company_id = get_auth_company_id()
         and exists (select 1 from public.ihracat_dosyalari d where d.id = dosya_id));
revoke all on table public.konsimento_hatirlatmalari from anon, authenticated, public;
grant select on table public.konsimento_hatirlatmalari to authenticated;
grant all on table public.konsimento_hatirlatmalari to service_role;

-- ---------------------------------------------------------------------------
-- Tamamlanma kontrolu (tetikleyicilerden cagrilir)
-- ---------------------------------------------------------------------------
create or replace function public.kh_tamamlanma_kontrol(p_dosya_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid;
  v_kt text;
  v_bl text;
  v_rez integer;
  v_kont integer;
  v_cutoff timestamptz;
  v_kalkis date;
begin
  if p_dosya_id is null then return; end if;
  select d.company_id, d.konsimento_dosya_url, nullif(btrim(coalesce(d.bl_no, '')), '')
    into v_sirket, v_kt, v_bl
    from public.ihracat_dosyalari d where d.id = p_dosya_id;
  -- Talimat zaten yuklendiyse / BL no varsa hatirlatmanin anlami yok
  if v_sirket is null or v_kt is not null or v_bl is not null then return; end if;
  select coalesce(sum(r.konteyner_adedi), 0), max(r.talimat_cutoff), max(r.gemi_kalkis_tarihi)
    into v_rez, v_cutoff, v_kalkis from public.rezervasyonlar r where r.dosya_id = p_dosya_id;
  -- Eski / gecmis sevkiyat (talimat cut-off'u 3 gunden eski ya da gemi 3 gunden once
  -- kalkmis): hatirlatma anlamsiz. Yedekten geri yuklemede konteynerler yeniden
  -- eklendiginde eski dosyalara toplu mail gitmesini de bu engeller.
  if (v_cutoff is not null and v_cutoff < now() - interval '3 days')
     or (v_kalkis is not null and v_kalkis < current_date - 3) then
    return;
  end if;
  select count(*) into v_kont from public.konteynerler k where k.dosya_id = p_dosya_id;
  if v_rez > 0 and v_kont = v_rez then
    insert into public.konsimento_hatirlatmalari (company_id, dosya_id) values (v_sirket, p_dosya_id)
    on conflict (dosya_id) do nothing;
  end if;
exception when others then
  -- Konteyner / rezervasyon kaydi ASLA bu yuzden basarisiz olmasin
  raise warning 'kh_tamamlanma_kontrol(%): %', p_dosya_id, sqlerrm;
end; $function$;

create or replace function public.kh_konteyner_tetik()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.kh_tamamlanma_kontrol(new.dosya_id);
  return null;
exception when others then
  raise warning 'kh_konteyner_tetik: %', sqlerrm;
  return null;
end; $function$;

drop trigger if exists kh_konteyner_eklendi on public.konteynerler;
create trigger kh_konteyner_eklendi after insert on public.konteynerler
  for each row execute function public.kh_konteyner_tetik();
drop trigger if exists kh_konteyner_tasindi on public.konteynerler;
create trigger kh_konteyner_tasindi after update of dosya_id on public.konteynerler
  for each row when (old.dosya_id is distinct from new.dosya_id)
  execute function public.kh_konteyner_tetik();
drop trigger if exists kh_rezervasyon_adet on public.rezervasyonlar;
create trigger kh_rezervasyon_adet after update of konteyner_adedi on public.rezervasyonlar
  for each row when (old.konteyner_adedi is distinct from new.konteyner_adedi)
  execute function public.kh_konteyner_tetik();

-- ---------------------------------------------------------------------------
-- Kuyruk (SADECE service_role / edge function)
-- ---------------------------------------------------------------------------
-- Islenebilir: bekliyor | 10 dk once hata almis (deneme < 3) | 10 dk'dir 'gonderiliyor'da takili
create or replace function public.kh_bekleyen_var()
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.konsimento_hatirlatmalari h
    where h.durum = 'bekliyor'
       or (h.durum = 'hata' and h.deneme < 3 and h.guncelleme < now() - interval '10 minutes')
       or (h.durum = 'gonderiliyor' and h.kilit < now() - interval '10 minutes'));
$function$;

-- Mail verisi (dosya + rezervasyonlar + konteynerler). Fiyat bilgisi YOK.
create or replace function public.kh_mail_verisi(p_dosya_id uuid)
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'dosya_id', d.id, 'dosya_no', d.dosya_no, 'proforma_no', d.proforma_no, 'lot_no', d.lot_no,
    'marka', d.marka, 'alici_firma', d.alici_firma, 'alici_adresi', d.alici_adresi,
    'consignee', d.consignee,
    'notify', case when jsonb_typeof(d.ham_veri -> 'notify') = 'array' then d.ham_veri -> 'notify' else '[]'::jsonb end,
    'detayli_ambalaj', d.detayli_ambalaj, 'ambalaj', d.ambalaj, 'teslim_sekli', d.teslim_sekli,
    'varis_limani', d.varis_limani, 'yuklenme_limani', d.yuklenme_limani, 'beyanname_no', d.beyanname_no,
    'konsimento_yuklendi', d.konsimento_dosya_url is not null, 'bl_no', d.bl_no,
    'sirket', (select c.company_name from public.companies c where c.id = d.company_id),
    'rezervasyonlar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'booking_no', r.booking_no, 'acente_ismi', r.acente_ismi, 'gemi_adi', r.gemi_adi, 'sefer_no', r.sefer_no,
        'yuklenme_limani', r.yuklenme_limani, 'talimat_cutoff', r.talimat_cutoff,
        'gemi_kalkis_tarihi', r.gemi_kalkis_tarihi, 'konteyner_adedi', r.konteyner_adedi)
        order by r.olusturma_tarihi nulls last, r.id)
      from public.rezervasyonlar r where r.dosya_id = d.id), '[]'::jsonb),
    'konteynerler', coalesce((
      select jsonb_agg(jsonb_build_object(
        'konteyner_no', k.konteyner_no, 'tip', k.tip, 'muhur_no', k.muhur_no, 'pieces', k.pieces,
        'net_agirlik_kg', k.net_agirlik_kg, 'brut_agirlik_kg', k.brut_agirlik_kg)
        order by k.olusturma_tarihi nulls last, k.konteyner_no)
      from public.konteynerler k where k.dosya_id = d.id), '[]'::jsonb))
  from public.ihracat_dosyalari d
  where d.id = p_dosya_id;
$function$;

-- Islenecek satirlari kilitler (p_id verilirse sadece o). Talimat bu arada yuklendiyse
-- otomatik satir 'atlandi' olur (elle istenen yine gider).
create or replace function public.kh_kuyruk_al(p_limit integer default 10, p_id uuid default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  v_sonuc jsonb := '[]'::jsonb;
  v_veri jsonb;
begin
  for r in
    select h.* from public.konsimento_hatirlatmalari h
    where (p_id is null or h.id = p_id)
      and (h.durum = 'bekliyor'
           or (h.durum = 'hata' and h.deneme < 3 and (p_id is not null or h.guncelleme < now() - interval '10 minutes'))
           or (h.durum = 'gonderiliyor' and h.kilit < now() - interval '10 minutes'))
    order by h.olusturma
    limit greatest(1, least(coalesce(p_limit, 10), 20))
    for update skip locked
  loop
    v_veri := public.kh_mail_verisi(r.dosya_id);
    if v_veri is null then
      update public.konsimento_hatirlatmalari set durum = 'atlandi', son_hata = 'Dosya bulunamadı.' where id = r.id;
      continue;
    end if;
    if r.tetik = 'otomatik' and ((v_veri ->> 'konsimento_yuklendi')::boolean or nullif(btrim(coalesce(v_veri ->> 'bl_no', '')), '') is not null) then
      update public.konsimento_hatirlatmalari set durum = 'atlandi', son_hata = 'Konşimento talimatı / BL zaten girilmiş.' where id = r.id;
      continue;
    end if;
    update public.konsimento_hatirlatmalari
       set durum = 'gonderiliyor', kilit = now(), deneme = deneme + 1
     where id = r.id;
    v_sonuc := v_sonuc || jsonb_build_array(jsonb_build_object(
      'id', r.id, 'tetik', r.tetik, 'isteyen_email', r.isteyen_email,
      'gonderim_sayisi', r.gonderim_sayisi, 'veri', v_veri));
  end loop;
  return v_sonuc;
end; $function$;

create or replace function public.kh_sonuc(p_id uuid, p_basarili boolean, p_hata text default null,
  p_test boolean default null, p_alicilar text default null, p_cc text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if p_basarili then
    update public.konsimento_hatirlatmalari
       set durum = 'gonderildi', kilit = null, son_hata = null, deneme = 0,
           test = p_test, alicilar = left(p_alicilar, 500), cc = left(p_cc, 500),
           gonderim_sayisi = gonderim_sayisi + 1,
           ilk_gonderim = coalesce(ilk_gonderim, now()), son_gonderim = now()
     where id = p_id;
  else
    update public.konsimento_hatirlatmalari
       set durum = 'hata', kilit = null, son_hata = left(coalesce(p_hata, 'Bilinmeyen hata'), 500)
     where id = p_id;
  end if;
end; $function$;

-- ---------------------------------------------------------------------------
-- Uygulama ici: elle gonder / tekrar gonder (oturum; dosya okuma yetkisiyle ayni kural)
-- ---------------------------------------------------------------------------
create or replace function public.kh_elle_iste(p_dosya_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := get_auth_company_id();
  v_email text := lower(nullif(coalesce(auth.jwt() ->> 'email', ''), ''));
  v_rez integer;
  v_kont integer;
  v_son timestamptz;
  v_durum text;
  v_id uuid;
begin
  if auth.uid() is null or v_sirket is null
     or not (exists (select 1 from public.kullanici_rolleri kr where kr.user_id = auth.uid() and kr.rol in ('admin', 'ihracat', 'muhasebe'))
             or coalesce(v_email, '') in ('volkandurgut.tr@gmail.com', 'bbt@unex.com.tr')) then
    raise exception 'Bu işlem için yetkiniz yok.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.ihracat_dosyalari d where d.id = p_dosya_id and d.company_id = v_sirket) then
    raise exception 'Dosya bulunamadı.' using errcode = 'P0002';
  end if;
  select coalesce(sum(r.konteyner_adedi), 0) into v_rez from public.rezervasyonlar r where r.dosya_id = p_dosya_id;
  select count(*) into v_kont from public.konteynerler k where k.dosya_id = p_dosya_id;
  if v_rez = 0 or v_kont <> v_rez then
    raise exception 'Önce tüm konteynerler girilmeli (%/% eklendi).', v_kont, v_rez using errcode = '23514';
  end if;
  select h.son_gonderim, h.durum into v_son, v_durum from public.konsimento_hatirlatmalari h where h.dosya_id = p_dosya_id for update;
  if v_durum = 'gonderiliyor' then
    raise exception 'Hatırlatma şu an gönderiliyor; birazdan sayfayı yenileyin.' using errcode = '23514';
  end if;
  if v_son is not null and v_son > now() - interval '2 minutes' then
    raise exception 'Hatırlatma az önce gönderildi. 2 dakika sonra tekrar deneyin.' using errcode = '23514';
  end if;
  insert into public.konsimento_hatirlatmalari (company_id, dosya_id, durum, tetik, isteyen_email)
  values (v_sirket, p_dosya_id, 'bekliyor', 'elle', v_email)
  on conflict (dosya_id) do update
    set durum = 'bekliyor', tetik = 'elle', isteyen_email = excluded.isteyen_email, deneme = 0, son_hata = null, kilit = null
  returning id into v_id;
  return v_id;
end; $function$;

-- ---------------------------------------------------------------------------
-- Fonksiyon erisimleri
-- ---------------------------------------------------------------------------
revoke all on function public.kh_tamamlanma_kontrol(uuid) from public, anon, authenticated;
revoke all on function public.kh_konteyner_tetik() from public, anon, authenticated;
revoke all on function public.kh_bekleyen_var() from public, anon, authenticated;
revoke all on function public.kh_mail_verisi(uuid) from public, anon, authenticated;
revoke all on function public.kh_kuyruk_al(integer, uuid) from public, anon, authenticated;
revoke all on function public.kh_sonuc(uuid, boolean, text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.kh_elle_iste(uuid) from public, anon;
grant execute on function public.kh_bekleyen_var(), public.kh_kuyruk_al(integer, uuid),
  public.kh_sonuc(uuid, boolean, text, boolean, text, text) to service_role;
grant execute on function public.kh_elle_iste(uuid) to authenticated;
