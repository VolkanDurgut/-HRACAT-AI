-- ============================================================================
-- 25.11.2026 (kullanici)
--  1) Draft Evrak Seti maili canliya: alici Ayarlar > Rapor Alicilari 'draft_evrak' satirindan (edge draft-evrak-mail).
--     Rapor turu kisitina, kaydetme izin listesine ve Ayarlar listesine 'draft_evrak' eklenir (diger turler AYNEN).
--  2) "Ihracat Evraklari'nda musteri onayladi isaretlenenler otomatik kapatilsin" (kullanici karari: onay + yukleme evraklari
--     4/4 olunca). Yukleme evraklari 4/4 = Ana Panel "Evraklar" KT · FT · BL · BY (lib/yukleme-evrak-tamam.ts ile AYNI kural):
--       KT: konsimento talimati ya da Draft BL (Draft BL varsa talimat gecilmis sayilir)
--       FT: fatura; DIIB'e bolunmus yuklemede (>= 2 parca) butun parcalarin faturasi
--       BL: Draft BL      BY: beyanname
--     Kapanis veritabaninda olur (her yol ayni: kart, dosya sayfasi, evrak yukleme). Denetim tetikleyicisi kaydi tutar.
--     Elle yeniden ACILAN dosya yeniden kapanmaz (yalniz onay ya da evrak alani degisen guncellemede, durum degismiyorsa).
-- Geriye uyumlu: mevcut uygulama ayni kalir; yalniz yeni davranis eklenir. Canli veride su an onayli acik dosya YOK (0).
-- ============================================================================

-- 1) draft_evrak rapor turu --------------------------------------------------------------------------------------------
alter table public.rapor_alicilari drop constraint if exists rapor_alicilari_rapor_check;
alter table public.rapor_alicilari add constraint rapor_alicilari_rapor_check check (rapor in (
  'siparis', 'navlun', 'navlun_haftalik', 'fatura_onay', 'fatura_dagitim', 'musteri_durum', 'gunluk_ihracat', 'diib', 'vgm',
  'konsimento_hatirlatma', 'pazar_gorev', 'satin_alma', 'siparis_formu', 'siparissiz', 'siparis_formu_lojistik', 'siparis_formu_spek',
  'draft_evrak'));

create or replace function public.rapor_alicilari_kaydet(p_rapor text, p_alicilar text[], p_cc text[], p_canli boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
  v_liste text[];
  v_cc text[];
begin
  if p_rapor not in ('siparis', 'navlun', 'navlun_haftalik', 'fatura_onay', 'fatura_dagitim', 'musteri_durum',
                     'gunluk_ihracat', 'diib', 'vgm', 'konsimento_hatirlatma', 'pazar_gorev', 'satin_alma', 'siparis_formu', 'siparissiz',
                     'siparis_formu_lojistik', 'siparis_formu_spek', 'draft_evrak') then
    raise exception 'Bilinmeyen rapor.';
  end if;
  v_liste := public.rapor_adres_temizle(p_alicilar, 'Alıcı');
  v_cc := array(select x from unnest(public.rapor_adres_temizle(p_cc, 'CC')) x where not (x = any (v_liste)));
  -- Alicisi raporun kendisinden gelenler: musteri_durum (musteri), pazar_gorev (ekip)
  if p_rapor not in ('musteri_durum', 'pazar_gorev') and coalesce(array_length(v_liste, 1), 0) = 0
     and (p_canli or p_rapor in ('gunluk_ihracat', 'diib', 'vgm', 'konsimento_hatirlatma', 'satin_alma')) then
    raise exception 'En az bir alıcı gerekli.';
  end if;
  insert into public.rapor_alicilari (company_id, rapor, alicilar, cc, canli, guncelleyen, guncelleme)
  values (v_sirket, p_rapor, v_liste, v_cc, coalesce(p_canli, false), lower(coalesce(auth.jwt() ->> 'email', '')), now())
  on conflict (company_id, rapor) do update
    set alicilar = excluded.alicilar, cc = excluded.cc, canli = excluded.canli, guncelleyen = excluded.guncelleyen, guncelleme = now();
end;
$$;

create or replace function public.rapor_alicilari_liste()
returns table(rapor text, alicilar text[], cc text[], canli boolean, kayitli boolean, guncelleyen text, guncelleme timestamp with time zone)
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
begin
  return query
    select r.rapor, coalesce(a.alicilar, '{}'::text[]), coalesce(a.cc, '{}'::text[]), coalesce(a.canli, false), a.rapor is not null,
           a.guncelleyen, a.guncelleme
    from unnest(array['gunluk_ihracat', 'siparis', 'navlun', 'navlun_haftalik', 'diib', 'vgm', 'draft_evrak', 'konsimento_hatirlatma', 'fatura_onay',
                      'fatura_dagitim', 'siparis_formu', 'siparis_formu_spek', 'siparis_formu_lojistik', 'pazar_gorev', 'siparissiz', 'musteri_durum', 'satin_alma'])
         with ordinality as r(rapor, sira)
    left join public.rapor_alicilari a on a.company_id = v_sirket and a.rapor = r.rapor
    order by r.sira;
end;
$$;

-- 2) Yukleme evraklari 4/4 + musteri onayi -> otomatik kapanis -----------------------------------------------------------
create or replace function public.dosya_yukleme_evraklari_tamam(p_dosya uuid, p_konsimento text, p_draft_bl text, p_fatura text, p_beyanname text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select (nullif(p_konsimento, '') is not null or nullif(p_draft_bl, '') is not null)
     and nullif(p_draft_bl, '') is not null
     and nullif(p_beyanname, '') is not null
     and case when (select count(*) from public.diib_dosya_bolunmeleri b where b.dosya_id = p_dosya) >= 2
              then not exists (select 1 from public.diib_dosya_bolunmeleri b where b.dosya_id = p_dosya and nullif(b.fatura_dosya_url, '') is null)
              else nullif(p_fatura, '') is not null end;
$$;
revoke all on function public.dosya_yukleme_evraklari_tamam(uuid, text, text, text, text) from public, anon;
grant execute on function public.dosya_yukleme_evraklari_tamam(uuid, text, text, text, text) to authenticated, service_role;

create or replace function public.dosya_onayli_tamam_kapat_tetik()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.durum in ('Açık', 'Acik')
     and new.durum is not distinct from old.durum
     and coalesce(new.draft_musteri_onayi_alindi, false)
     and (old.draft_musteri_onayi_alindi is distinct from new.draft_musteri_onayi_alindi
          or old.konsimento_dosya_url is distinct from new.konsimento_dosya_url
          or old.draft_bl_dosya_url is distinct from new.draft_bl_dosya_url
          or old.fatura_dosya_url is distinct from new.fatura_dosya_url
          or old.beyanname_dosya_url is distinct from new.beyanname_dosya_url)
     and public.dosya_yukleme_evraklari_tamam(new.id, new.konsimento_dosya_url, new.draft_bl_dosya_url, new.fatura_dosya_url, new.beyanname_dosya_url)
  then
    new.durum := 'Kapalı';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_onayli_tamam_kapat on public.ihracat_dosyalari;
create trigger trg_onayli_tamam_kapat
  before update on public.ihracat_dosyalari
  for each row execute function public.dosya_onayli_tamam_kapat_tetik();

-- DIIB parcasinin faturasi en son yuklenirse (dosya satiri degismez): parca uzerinden ayni kontrol
create or replace function public.diib_parca_onayli_kapat_tetik()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.ihracat_dosyalari d
     set durum = 'Kapalı'
   where d.id = new.dosya_id
     and d.company_id = new.company_id
     and d.durum in ('Açık', 'Acik')
     and coalesce(d.draft_musteri_onayi_alindi, false)
     and public.dosya_yukleme_evraklari_tamam(d.id, d.konsimento_dosya_url, d.draft_bl_dosya_url, d.fatura_dosya_url, d.beyanname_dosya_url);
  return null;
end;
$$;
revoke all on function public.diib_parca_onayli_kapat_tetik() from public, anon, authenticated;

drop trigger if exists trg_diib_parca_onayli_kapat on public.diib_dosya_bolunmeleri;
create trigger trg_diib_parca_onayli_kapat
  after insert or update of fatura_dosya_url on public.diib_dosya_bolunmeleri
  for each row execute function public.diib_parca_onayli_kapat_tetik();
