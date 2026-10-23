-- =============================================================================
-- Ic Piyasa: MUSTERIYE E-POSTA KANALI (irsaliye ekli) - 23.10.2026
-- =============================================================================
-- Kullanici karari (23.10.2026): WhatsApp'i olmayan musteriye (Trakya Birlik,
-- Tarim Kredi) mesajlar e-postayla gitsin; "Araciniz yola cikti" e-postasinda
-- irsaliye PDF'i EKLI. Gonderen lojistik@unex.com.tr (Resend'de dogrulanmis
-- unex.com.tr alan adi - kendi alan adi, spam riski dusuk), CC bbt@, execution@,
-- lojistik@. 01.10.2026 "askida" kurali bu SART ile kalkiyor: otomatik gonderim
-- ayardan ACIKCA acilmadikca HICBIR musteri e-postasi sistemden gitmez.
--
-- 1) ic_piyasa_ayarlari: musteri_eposta_aktif (varsayilan false),
--    musteri_eposta_aktif_zaman (acildigi an - tetikleyici yazar),
--    musteri_eposta_gonderen, musteri_eposta_cc.
-- 2) ic_bildirim_ekle: alici = 'musteri' icin kanal kurali - musterinin WhatsApp'i
--    (telefon + izin) varsa WhatsApp (DEGISMEDI); yoksa kartta gecerli e-posta
--    varsa kanal = 'eposta', hedef = e-posta. Ikisi de yoksa eskisi gibi WhatsApp
--    (ekranda "telefon yok" uyarisi).
-- 3) ic_bildirim_eposta_al: musteri e-postalari SADECE otomatik gonderim acikken
--    ve SADECE acildigi andan SONRA olusanlar alinir (acmadan once biriken eski
--    mesajlar asla toplu gonderilmez; ekranda elle gonderilir/atlanir).
--    Musteri e-postasinin CC'si musteri_eposta_cc'den.
-- 4) ic_musteri_eposta_bilgi(p_id): edge function icin (SADECE service_role)
--    gonderen, yanit adresi, iletisim satiri ve irsaliye yolu.
-- 5) ic_musteri_eposta_deneme(): Ayarlar'daki "Deneme e-postasi" icin (ic_piyasa
--    yetkisi); ayarlari + son irsaliyeyi dondurur. Deneme SADECE cagiranin kendi
--    e-postasina gider (edge function garanti eder).
--
-- Mevcut kayitlar DEGISMEZ (bekleyen WhatsApp mesajlari WhatsApp kalir).
-- Iki kez calistirilabilir. Kod push'undan ONCE SQL Editor'de calistirilir.
-- =============================================================================

begin;

-- 1) Ayarlar ------------------------------------------------------------------
alter table public.ic_piyasa_ayarlari add column if not exists musteri_eposta_aktif boolean not null default false;
alter table public.ic_piyasa_ayarlari add column if not exists musteri_eposta_aktif_zaman timestamptz;
alter table public.ic_piyasa_ayarlari add column if not exists musteri_eposta_gonderen text;
alter table public.ic_piyasa_ayarlari add column if not exists musteri_eposta_cc text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ic_piyasa_ayarlari_musteri_eposta_gonderen_bicim') then
    alter table public.ic_piyasa_ayarlari add constraint ic_piyasa_ayarlari_musteri_eposta_gonderen_bicim
      check (musteri_eposta_gonderen is null or musteri_eposta_gonderen ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ic_piyasa_ayarlari_musteri_eposta_cc_bicim') then
    alter table public.ic_piyasa_ayarlari add constraint ic_piyasa_ayarlari_musteri_eposta_cc_bicim
      check (musteri_eposta_cc is null or (
        musteri_eposta_cc ~ '^[^\s@,]+@[^\s@,]+\.[^\s@,]+(,[^\s@,]+@[^\s@,]+\.[^\s@,]+)*$'
        and array_length(string_to_array(musteri_eposta_cc, ','), 1) <= 5));
  end if;
  -- Gonderen adresi olmadan otomatik gonderim acilamaz
  if not exists (select 1 from pg_constraint where conname = 'ic_piyasa_ayarlari_musteri_eposta_aktif_gonderen') then
    alter table public.ic_piyasa_ayarlari add constraint ic_piyasa_ayarlari_musteri_eposta_aktif_gonderen
      check (not musteri_eposta_aktif or musteri_eposta_gonderen is not null);
  end if;
end $$;

-- Acildigi an: false -> true gecisinde now(); kapatilinca temizlenir. Istemci yazamaz.
create or replace function public.ic_musteri_eposta_aktif_zaman()
 returns trigger
 language plpgsql
 set search_path = public
as $function$
begin
  if new.musteri_eposta_aktif then
    if tg_op = 'INSERT' or not coalesce(old.musteri_eposta_aktif, false) then
      new.musteri_eposta_aktif_zaman := now();
    else
      new.musteri_eposta_aktif_zaman := old.musteri_eposta_aktif_zaman;
    end if;
  else
    new.musteri_eposta_aktif_zaman := null;
  end if;
  return new;
end; $function$;

drop trigger if exists ic_musteri_eposta_aktif_zaman on public.ic_piyasa_ayarlari;
create trigger ic_musteri_eposta_aktif_zaman before insert or update on public.ic_piyasa_ayarlari
  for each row execute function public.ic_musteri_eposta_aktif_zaman();

-- 2) Kanal kurali -------------------------------------------------------------
create or replace function public.ic_bildirim_ekle(p_company uuid, p_is_emri uuid, p_sevk uuid, p_sablon text, p_alici text, p_kanal text, p_hedef text, p_alici_ad text, p_degerler jsonb, p_dugme_eki text, p_hata text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_id uuid;
  v_kanal text := p_kanal;
  v_hedef text := nullif(btrim(coalesce(p_hedef, '')), '');
  m public.ic_musteriler%rowtype;
begin
  -- Musteri mesaji: WhatsApp yoksa (telefon + izin) ve gecerli e-posta varsa e-posta kanali
  if p_alici = 'musteri' and p_is_emri is not null then
    select mm.* into m from public.ic_is_emirleri e join public.ic_musteriler mm on mm.id = e.musteri_id where e.id = p_is_emri;
    if found
       and not (coalesce(m.whatsapp_izin, false) and nullif(btrim(coalesce(m.telefon, '')), '') is not null)
       and lower(btrim(coalesce(m.eposta, ''))) ~ '^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$' then
      v_kanal := 'eposta';
      v_hedef := lower(btrim(m.eposta));
    end if;
  end if;

  insert into public.ic_bildirimler (company_id, is_emri_id, sevk_id, sablon, alici, kanal, hedef, alici_ad, degerler, dugme_eki, durum, hata)
  values (p_company, p_is_emri, p_sevk, p_sablon, p_alici, v_kanal, v_hedef, p_alici_ad,
          p_degerler, p_dugme_eki,
          case when p_hata is null then 'bekliyor' else 'hata' end, p_hata)
  returning id into v_id;
  return v_id;
end; $function$;

-- 3) E-posta kuyrugu ----------------------------------------------------------
create or replace function public.ic_bildirim_eposta_al(p_limit integer default 20)
 returns setof public.ic_bildirimler
 language plpgsql
 security definer
 set search_path = public
as $function$
begin
  -- 10 dakikadan uzun "gonderiliyor"da kalan (yarida kesilen) tekrar denenebilir
  update public.ic_bildirimler set durum = 'bekliyor'
   where kanal = 'eposta' and durum = 'gonderiliyor' and islem_zamani < now() - interval '10 minutes';
  return query
    update public.ic_bildirimler b set durum = 'gonderiliyor', islem_zamani = now(), deneme = b.deneme + 1,
           cc = case
                  when b.alici = 'yetkili' then
                    (select string_to_array(a.yetkili_cc, ',') from public.ic_piyasa_ayarlari a
                      where a.company_id = b.company_id and a.yetkili_cc is not null)
                  when b.alici = 'musteri' then
                    (select string_to_array(a.musteri_eposta_cc, ',') from public.ic_piyasa_ayarlari a
                      where a.company_id = b.company_id and a.musteri_eposta_cc is not null)
                  else b.cc end
     where b.id in (select x.id from public.ic_bildirimler x
                     where x.kanal = 'eposta' and x.durum = 'bekliyor' and x.hedef is not null
                       and (x.alici <> 'musteri' or exists (
                             select 1 from public.ic_piyasa_ayarlari a
                              where a.company_id = x.company_id and a.musteri_eposta_aktif
                                and a.musteri_eposta_gonderen is not null
                                and a.musteri_eposta_aktif_zaman is not null
                                and x.olusturma >= a.musteri_eposta_aktif_zaman))
                     order by x.olusturma limit greatest(1, least(coalesce(p_limit, 20), 50))
                     for update skip locked)
    returning b.*;
end; $function$;

-- 4) Edge function icin musteri e-postasi bilgisi (SADECE service_role) --------
create or replace function public.ic_musteri_eposta_bilgi(p_id uuid)
 returns jsonb
 language sql
 stable
 security definer
 set search_path = public
as $function$
  select jsonb_build_object(
    'gonderen', a.musteri_eposta_gonderen,
    'yanit', coalesce(a.lojistik_eposta, a.musteri_eposta_gonderen),
    'iletisim_ad', a.lojistik_ad,
    'iletisim_telefon', a.lojistik_telefon,
    'irsaliye_yolu', s.irsaliye_dosya_yolu,
    'irsaliye_no', s.irsaliye_no)
  from public.ic_bildirimler b
  left join public.ic_piyasa_ayarlari a on a.company_id = b.company_id
  left join public.ic_sevkler s on s.id = b.sevk_id
  where b.id = p_id and b.alici = 'musteri';
$function$;

revoke all on function public.ic_musteri_eposta_bilgi(uuid) from public, anon, authenticated;
grant execute on function public.ic_musteri_eposta_bilgi(uuid) to service_role;

-- 5) Deneme e-postasi icin (cagiranin kendi sirketi, ic_piyasa yetkisi) --------
create or replace function public.ic_musteri_eposta_deneme()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path = public
as $function$
declare
  v_sirket uuid := auth_company_id();
  a public.ic_piyasa_ayarlari%rowtype;
  v_yol text;
  v_no text;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('ic_piyasa') then
    raise exception 'Bu işlem için İç Piyasa yetkisi gerekir.' using errcode = '42501';
  end if;
  select * into a from public.ic_piyasa_ayarlari where company_id = v_sirket;
  if not found or a.musteri_eposta_gonderen is null then
    raise exception 'Önce gönderen e-posta adresini kaydedin.' using errcode = '22023';
  end if;
  select irsaliye_dosya_yolu, irsaliye_no into v_yol, v_no
    from public.ic_sevkler where company_id = v_sirket order by olusturma desc limit 1;
  return jsonb_build_object(
    'gonderen', a.musteri_eposta_gonderen,
    'yanit', coalesce(a.lojistik_eposta, a.musteri_eposta_gonderen),
    'iletisim_ad', a.lojistik_ad,
    'iletisim_telefon', a.lojistik_telefon,
    'irsaliye_yolu', v_yol,
    'irsaliye_no', v_no);
end; $function$;

revoke all on function public.ic_musteri_eposta_deneme() from public, anon;
grant execute on function public.ic_musteri_eposta_deneme() to authenticated;

commit;
