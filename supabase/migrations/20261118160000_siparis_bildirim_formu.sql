-- ============================================================================
-- SIPARIS BILDIRIM FORMU (18.11.2026)
-- ============================================================================
-- Kullanici: "Siparis formunun otomatik olarak hazirlanmasi ve uretim@ adresine mail gonderilmesini istiyorum. On odemesi
-- alinmis ve rezervasyonu alinmis kisimdaki yuklemelerden olusmali. Her yukleme icin ayri olusmali. Ilk olarak test adresine
-- gonderilmeli. Bu liste olusurken sadece cuval gorseli ekleme alani ve uretim-tuketim tarihi yazma alani olmali. Uretim ve
-- tuketim tarihleri ilgili dosyanin Ek Bilgiler kartindaki uretim ve tuketim tarihi icin gecerli olarak gelmeli. Ekipman
-- alim tarihi - 1 gun olarak mail gitmeli."
-- Kararlar (18.11.2026, kullanici): kaynak = YUKLEME PLANI (booking'i olan her satir = 1 form; dosya acilmissa bilgiler
--   dosyadan tamamlanir); Planlanan Yukleme Tarihi = bos ekipman alim tarihi; Musteri Temsilcisi = proformayi kesen kisi
--   (pazar_ekip.ad_soyad); gonderim gunu cuval gorseli / tarih eksikse form YINE gider, eksik alan isaretlenir + temsilciye uyari.
--  1) pazar_ekip.ad_soyad (formdaki temsilci adi).
--  2) siparis_formlari: booking basina girilen cuval gorseli (depo yolu) + uretim / SKT. Anahtar booking_anahtar (Excel plani
--     yeniden yuklenince satir kimlikleri degisir; booking degismez).
--  3) siparis_formu_gonderimleri: gonderim kaydi; booking basina bir 'gonderildi' ve bir otomatik 'test' (kismi benzersiz).
--  4) siparis_formu_veri(sirket, bas, bit): edge + liste icin ham veri (yukleme_plani_veri + dosya + siparis + proforma +
--     temsilci + kalite spekleri + giris + gonderim). Yalniz service_role.
--  5) siparis_formu_listesi() / siparis_formu_kaydet(...): Siparisler > Siparis Formlari sekmesi (yukleme_plani ile ayni yetki).
--     Kaydet, tarihleri ayni booking'li dosya(lar)in Ek Bilgiler tarihine YAZAR; dosya sonradan acilirsa tetikleyici bos tarihi doldurur.
--  6) rapor_alicilari: 'siparis_formu' (alici uretim@, CANLI KAPALI: onaya kadar yalniz test adresine "[TEST]").
--  7) Depo: 'siparis-formlari' kovasi (yalniz JPEG / PNG, 5 MB; yol: <sirket>/<booking>/<dosya>).
--  8) pg_cron 'siparis-formu': her 30 dk 05:00-15:30 UTC (08:00-18:30 TR). Komut 'vgm-rapor' isinden turetilir (anahtar repoya yazilmaz).
-- Canliya 18.11.2026 Supabase MCP ile uygulandi (bu dosya repo senkronudur). Idempotent.
-- ============================================================================

-- 1) Temsilci tam adi --------------------------------------------------------------------------------------------
alter table public.pazar_ekip add column if not exists ad_soyad text;
-- Degerler (temsilcilerin tam adi) repoya YAZILMAZ; canlida 18.11.2026 MCP ile girildi.

-- 2) Girisler ------------------------------------------------------------------------------------------------------
create table if not exists public.siparis_formlari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_anahtar text not null,
  booking_no text,
  uretim_tarihi date,
  skt date,
  gorsel_yolu text,
  gorsel_adi text,
  guncelleyen text,
  guncelleme timestamptz not null default now(),
  olusturma timestamptz not null default now(),
  unique (company_id, booking_anahtar),
  constraint siparis_formlari_skt_check check (skt is null or uretim_tarihi is null or skt > uretim_tarihi)
);
alter table public.siparis_formlari enable row level security;

-- 3) Gonderimler ---------------------------------------------------------------------------------------------------
create table if not exists public.siparis_formu_gonderimleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_anahtar text not null,
  booking_no text,
  durum text not null check (durum in ('gonderiliyor', 'gonderildi', 'test')),
  elle boolean not null default false,
  alicilar text,
  eksikler text[],
  ozet jsonb,
  olusturma timestamptz not null default now()
);
alter table public.siparis_formu_gonderimleri enable row level security;
create unique index if not exists siparis_formu_gonderimleri_canli_tek
  on public.siparis_formu_gonderimleri (company_id, booking_anahtar) where durum in ('gonderiliyor', 'gonderildi') and not elle;
create unique index if not exists siparis_formu_gonderimleri_test_tek
  on public.siparis_formu_gonderimleri (company_id, booking_anahtar) where durum = 'test' and not elle;
create index if not exists siparis_formu_gonderimleri_sirket on public.siparis_formu_gonderimleri (company_id, olusturma desc);

-- 4) Ham veri -------------------------------------------------------------------------------------------------------
create or replace function public.siparis_formu_veri(p_company uuid, p_bas date, p_bit date)
returns setof jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with plan as (
    select v.*, public.booking_anahtar(v.booking_no) as ba
    from public.yukleme_plani_veri(p_company) v
    where v.kaynak in ('excel', 'sistem')
      and public.booking_anahtar(v.booking_no) is not null
      and v.bos_ekipman_tarihi between p_bas and p_bit
  ), tekil as (
    select distinct on (ba) * from plan order by ba, (kaynak = 'excel') desc, sira nulls last
  )
  select jsonb_build_object(
    'anahtar', t.ba,
    'plan', jsonb_build_object(
      'kaynak', t.kaynak, 'booking_no', t.booking_no, 'musteri', t.musteri, 'cinsi', t.cinsi, 'konteyner', t.konteyner,
      'varis_limani', t.varis_limani, 'cuval_markasi', t.cuval_markasi, 'ambalaj', t.ambalaj, 'acente', t.acente, 'liman', t.liman,
      'ekipman', t.ekipman, 'ekipman_alim_yeri', t.ekipman_alim_yeri, 'bos_ekipman_tarihi', t.bos_ekipman_tarihi, 'etd', t.etd,
      'gemi', t.gemi, 'sefer', t.sefer, 'dosya_no', t.dosya_no, 'proforma_no', t.proforma_no, 'kalemler', t.kalemler),
    'siparis', case when s.id is null then null else jsonb_build_object(
      'proforma_no', s.proforma_no, 'proforma_tarihi', s.proforma_tarihi, 'firma', s.firma, 'urun', s.urun,
      'paketleme', s.paketleme, 'marka', s.marka) end,
    'dosya', case when d.id is null then null else jsonb_build_object(
      'id', d.id, 'dosya_no', d.dosya_no, 'alici_firma', d.alici_firma, 'alici_adresi', d.alici_adresi, 'varis_limani', d.varis_limani,
      'lot_no', d.lot_no, 'proforma_no', d.proforma_no, 'proforma_tarihi', d.proforma_tarihi, 'urun_detaylari', d.urun_detaylari,
      'detayli_ambalaj', d.detayli_ambalaj, 'ambalaj', d.ambalaj, 'marka', d.marka, 'marka_listesi', d.ham_veri -> 'marka_listesi',
      'uretim_tarihi', d.uretim_tarihi, 'son_kullanim_tarihi', d.son_kullanim_tarihi) end,
    'adres', a.alici_adresi,
    'temsilci', case when e.id is null then null else jsonb_build_object('ad_soyad', e.ad_soyad, 'hitap', e.hitap, 'eposta', e.eposta) end,
    'kalite', k.parametreler,
    'form', case when f.id is null then null else jsonb_build_object(
      'uretim_tarihi', f.uretim_tarihi, 'skt', f.skt, 'gorsel_yolu', f.gorsel_yolu, 'gorsel_adi', f.gorsel_adi,
      'guncelleyen', f.guncelleyen, 'guncelleme', f.guncelleme) end,
    'gonderim', g.bilgi,
    'test', gt.bilgi
  )
  from tekil t
  left join lateral (
    select dd.* from public.rezervasyonlar r join public.ihracat_dosyalari dd on dd.id = r.dosya_id
    where r.company_id = p_company and public.booking_anahtar(r.booking_no) = t.ba
    order by dd.olusturma_tarihi desc limit 1
  ) d on true
  left join lateral (
    select sd.* from public.sevkiyat_plani sp join public.siparis_defteri sd on sd.id = sp.siparis_id
    where sp.company_id = p_company and t.anahtar = 'excel:' || sp.id::text limit 1
  ) s on true
  left join lateral (
    -- Musteri adi: dosya > siparis listesi > plan (planda kisa ad olabilir)
    select upper(trim(coalesce(d.alici_firma, s.firma, t.musteri))) as tam, upper(trim(t.musteri)) as kisa
  ) m on true
  left join lateral (
    -- Ulke icin alici adresi: bu yuklemenin dosyasi, yoksa ayni musterinin (tam ad ya da plandaki kisa adla baslayan) en son dosyasi
    select x.alici_adresi from public.ihracat_dosyalari x
    where x.company_id = p_company and nullif(trim(x.alici_adresi), '') is not null
      and (x.id = d.id or upper(trim(x.alici_firma)) = m.tam
           or (length(m.kisa) >= 4 and upper(trim(x.alici_firma)) like m.kisa || '%'))
    order by (x.id = d.id) is true desc, (upper(trim(x.alici_firma)) = m.tam) desc, x.olusturma_tarihi desc limit 1
  ) a on true
  left join lateral (
    -- Temsilci: bu yuklemenin proformasini kesen; sistemde yoksa ayni musteriye en son proforma kesen
    select pf.olusturan_email from public.proformalar pf
    where pf.company_id = p_company and pf.olusturan_email is not null
      and (upper(trim(pf.proforma_no)) = upper(trim(coalesce(d.proforma_no, s.proforma_no, t.proforma_no)))
           or upper(trim(pf.alici_unvan)) = m.tam
           or (length(m.kisa) >= 4 and upper(trim(pf.alici_unvan)) like m.kisa || '%'))
    order by (upper(trim(pf.proforma_no)) = upper(trim(coalesce(d.proforma_no, s.proforma_no, t.proforma_no)))) is true desc, pf.created_at desc limit 1
  ) p on true
  left join lateral (
    select ek.* from public.pazar_ekip ek
    where ek.company_id = p_company and p.olusturan_email is not null
      and (lower(ek.eposta) = lower(p.olusturan_email) or ek.kod = split_part(lower(p.olusturan_email), '@', 1))
    order by (lower(ek.eposta) = lower(p.olusturan_email)) desc limit 1
  ) e on true
  left join lateral (
    select ka.parametreler from public.kalite_sertifikasi_ayarlari ka
    where ka.company_id = p_company and (upper(trim(ka.alici_firma)) = m.tam or (length(m.kisa) >= 4 and upper(trim(ka.alici_firma)) like m.kisa || '%'))
    order by (upper(trim(ka.alici_firma)) = m.tam) desc limit 1
  ) k on true
  left join public.siparis_formlari f on f.company_id = p_company and f.booking_anahtar = t.ba
  left join lateral (
    select jsonb_build_object('zaman', go.olusturma, 'alicilar', go.alicilar, 'eksikler', go.eksikler) as bilgi
    from public.siparis_formu_gonderimleri go
    where go.company_id = p_company and go.booking_anahtar = t.ba and go.durum = 'gonderildi' and not go.elle
    order by go.olusturma desc limit 1
  ) g on true
  left join lateral (
    select jsonb_build_object('zaman', gx.olusturma, 'alicilar', gx.alicilar) as bilgi
    from public.siparis_formu_gonderimleri gx
    where gx.company_id = p_company and gx.booking_anahtar = t.ba and gx.durum = 'test'
    order by gx.olusturma desc limit 1
  ) gt on true
  order by t.bos_ekipman_tarihi, t.ba
$$;
revoke all on function public.siparis_formu_veri(uuid, date, date) from public, anon, authenticated;
grant execute on function public.siparis_formu_veri(uuid, date, date) to service_role;

-- 5) Uygulama RPC'leri ----------------------------------------------------------------------------------------------
create or replace function public.siparis_formu_listesi()
returns setof jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if auth.uid() is null or auth_company_id() is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')) then
    raise exception 'Yetkiniz yok.';
  end if;
  return query select x from public.siparis_formu_veri(auth_company_id(), v_bugun - 10, v_bugun + 45) x;
end;
$$;
revoke all on function public.siparis_formu_listesi() from public, anon;
grant execute on function public.siparis_formu_listesi() to authenticated;

create or replace function public.siparis_formu_kaydet(
  p_booking text, p_uretim date, p_skt date, p_gorsel_yolu text, p_gorsel_adi text, p_gorsel_sil boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := auth_company_id();
  v_ba text := public.booking_anahtar(p_booking);
  v_yol text := nullif(trim(coalesce(p_gorsel_yolu, '')), '');
  v_dosya int := 0;
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')) then
    raise exception 'Yetkiniz yok.';
  end if;
  if v_ba is null then raise exception 'Booking numarası gerekli.'; end if;
  if p_uretim is not null and p_skt is not null and p_skt <= p_uretim then
    raise exception 'Son kullanma tarihi üretim tarihinden sonra olmalı.';
  end if;
  if v_yol is not null and split_part(v_yol, '/', 1) <> v_sirket::text then
    raise exception 'Geçersiz görsel yolu.';
  end if;
  insert into public.siparis_formlari (company_id, booking_anahtar, booking_no, uretim_tarihi, skt, gorsel_yolu, gorsel_adi, guncelleyen, guncelleme)
  values (v_sirket, v_ba, trim(p_booking), p_uretim, p_skt, v_yol, case when v_yol is null then null else left(p_gorsel_adi, 200) end,
          lower(coalesce(auth.jwt() ->> 'email', '')), now())
  on conflict (company_id, booking_anahtar) do update set
    booking_no = excluded.booking_no,
    uretim_tarihi = excluded.uretim_tarihi,
    skt = excluded.skt,
    gorsel_yolu = case when p_gorsel_sil then null else coalesce(excluded.gorsel_yolu, siparis_formlari.gorsel_yolu) end,
    gorsel_adi = case when p_gorsel_sil then null when excluded.gorsel_yolu is not null then excluded.gorsel_adi else siparis_formlari.gorsel_adi end,
    guncelleyen = excluded.guncelleyen,
    guncelleme = now();
  -- Ek Bilgiler: ayni booking'li ACIK dosya(lar)in uretim / SKT'si formdakine esitlenir (bos birakilan tarih dokunulmaz)
  if p_uretim is not null or p_skt is not null then
    update public.ihracat_dosyalari d
       set uretim_tarihi = coalesce(p_uretim, d.uretim_tarihi),
           son_kullanim_tarihi = coalesce(p_skt, d.son_kullanim_tarihi)
     where d.company_id = v_sirket
       and d.durum in ('Açık', 'Acik')
       and exists (select 1 from public.rezervasyonlar r where r.dosya_id = d.id and public.booking_anahtar(r.booking_no) = v_ba)
       and (d.uretim_tarihi is distinct from coalesce(p_uretim, d.uretim_tarihi)
            or d.son_kullanim_tarihi is distinct from coalesce(p_skt, d.son_kullanim_tarihi));
    get diagnostics v_dosya = row_count;
  end if;
  return jsonb_build_object('ok', true, 'dosya', v_dosya);
end;
$$;
revoke all on function public.siparis_formu_kaydet(text, date, date, text, text, boolean) from public, anon;
grant execute on function public.siparis_formu_kaydet(text, date, date, text, text, boolean) to authenticated;

-- Dosya formdan SONRA acilirsa: rezervasyon girilince bos uretim / SKT formdakiyle doldurulur
create or replace function public.siparis_formu_tarih_tetik()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  f record;
begin
  if new.dosya_id is null or public.booking_anahtar(new.booking_no) is null then return null; end if;
  select uretim_tarihi, skt into f from public.siparis_formlari
   where company_id = new.company_id and booking_anahtar = public.booking_anahtar(new.booking_no);
  if not found or (f.uretim_tarihi is null and f.skt is null) then return null; end if;
  update public.ihracat_dosyalari d
     set uretim_tarihi = coalesce(d.uretim_tarihi, f.uretim_tarihi),
         son_kullanim_tarihi = coalesce(d.son_kullanim_tarihi, f.skt)
   where d.id = new.dosya_id
     and ((d.uretim_tarihi is null and f.uretim_tarihi is not null) or (d.son_kullanim_tarihi is null and f.skt is not null));
  return null;
end;
$$;
drop trigger if exists trg_siparis_formu_tarih on public.rezervasyonlar;
create trigger trg_siparis_formu_tarih
  after insert or update of booking_no, dosya_id on public.rezervasyonlar
  for each row execute function public.siparis_formu_tarih_tetik();

-- 6) Rapor alicilari -------------------------------------------------------------------------------------------------
alter table public.rapor_alicilari drop constraint if exists rapor_alicilari_rapor_check;
alter table public.rapor_alicilari add constraint rapor_alicilari_rapor_check check (rapor in (
  'siparis', 'navlun', 'navlun_haftalik', 'fatura_onay', 'fatura_dagitim', 'musteri_durum',
  'gunluk_ihracat', 'diib', 'vgm', 'konsimento_hatirlatma', 'pazar_gorev', 'satin_alma', 'siparis_formu'));

create or replace function public.rapor_alicilari_liste()
returns table (rapor text, alicilar text[], cc text[], canli boolean, kayitli boolean, guncelleyen text, guncelleme timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := public.yetki_super_admin_sirketi();
begin
  return query
    select r.rapor, coalesce(a.alicilar, '{}'::text[]), coalesce(a.cc, '{}'::text[]), coalesce(a.canli, false), a.rapor is not null,
           a.guncelleyen, a.guncelleme
    from unnest(array['gunluk_ihracat', 'siparis', 'navlun', 'navlun_haftalik', 'diib', 'vgm', 'konsimento_hatirlatma', 'fatura_onay',
                      'fatura_dagitim', 'siparis_formu', 'pazar_gorev', 'musteri_durum', 'satin_alma']) with ordinality as r(rapor, sira)
    left join public.rapor_alicilari a on a.company_id = v_sirket and a.rapor = r.rapor
    order by r.sira;
end;
$$;

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
                     'gunluk_ihracat', 'diib', 'vgm', 'konsimento_hatirlatma', 'pazar_gorev', 'satin_alma', 'siparis_formu') then
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

-- Baslangic: alici uretim@, CANLI KAPALI (onaya kadar yalniz test adresi). Yalniz siparis raporu ayari olan sirketler.
insert into public.rapor_alicilari (company_id, rapor, alicilar, cc, canli, guncelleyen, guncelleme)
select a.company_id, 'siparis_formu', array['uretim@unex.com.tr'], '{}'::text[], false, 'kurulum (18.11.2026)', now()
from public.rapor_alicilari a
where a.rapor = 'siparis'
on conflict (company_id, rapor) do nothing;

-- 7) Depo -----------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('siparis-formlari', 'siparis-formlari', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png'];

drop policy if exists siparis_formu_gorsel_select on storage.objects;
create policy siparis_formu_gorsel_select on storage.objects for select to authenticated
  using (bucket_id = 'siparis-formlari' and split_part(name, '/', 1) = (public.auth_company_id())::text
         and (public.ic_sayfa_yetkisi('proformalar') or public.ic_sayfa_yetkisi('analiz')));
drop policy if exists siparis_formu_gorsel_insert on storage.objects;
create policy siparis_formu_gorsel_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'siparis-formlari' and split_part(name, '/', 1) = (public.auth_company_id())::text
              and (public.ic_sayfa_yetkisi('proformalar') or public.ic_sayfa_yetkisi('analiz')));
drop policy if exists siparis_formu_gorsel_delete on storage.objects;
create policy siparis_formu_gorsel_delete on storage.objects for delete to authenticated
  using (bucket_id = 'siparis-formlari' and split_part(name, '/', 1) = (public.auth_company_id())::text
         and (public.ic_sayfa_yetkisi('proformalar') or public.ic_sayfa_yetkisi('analiz')));

-- 8) Zamanlama ------------------------------------------------------------------------------------------------------
do $$
declare v_komut text;
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron yok; zamanlanmadi.';
    return;
  end if;
  select command into v_komut from cron.job where jobname = 'vgm-rapor' limit 1;
  if v_komut is null then
    raise notice 'vgm-rapor bulunamadi; siparis formu zamanlanmadi.';
    return;
  end if;
  v_komut := replace(v_komut, '/functions/v1/vgm-rapor', '/functions/v1/siparis-formu');
  if position('/functions/v1/siparis-formu' in v_komut) = 0 then
    raise exception 'siparis-formu komutu turetilemedi (adres bulunamadi).';
  end if;
  perform cron.unschedule(j.jobname) from cron.job j where j.jobname = 'siparis-formu';
  perform cron.schedule('siparis-formu', '*/30 5-15 * * *', v_komut);
end $$;
