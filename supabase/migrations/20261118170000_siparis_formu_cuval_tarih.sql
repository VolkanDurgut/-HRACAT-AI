-- ============================================================================
-- SIPARIS BILDIRIM FORMU v2 (18.11.2026)
-- ============================================================================
-- Kullanici: "Musteri temsilcisi bilgisi sabit olmali. Uretim ve tuketim tarihini gorselden okuyamaz miyiz? Ucretsiz olacak
-- sekilde. Sadece Urun Spekleri kismi manuel doldurulacak. Kisacasi urun gorseli eklenecek ve urun spekleri girilecek, kaydet
-- denilecek. Cuvallarda NOVEMBER seklinde belirtiliyor bazen; cuval ustunde NOVEMBER gibi yaziliyorsa evraklardaki uretim
-- tuketim tarihi eski hali ile calismali. Gercek tarih mevcutsa guncel tarih olarak yansimali."
--  1) siparis_formlari: uretim_metin / skt_metin (cuvaldaki yazim: "NOVEMBER 2026" ya da "12.11.2026"), spekler (elle),
--     tarih_kaynagi ('gorsel' = tarayicida ucretsiz OCR / 'elle' = okunamadiginda elle). uretim_tarihi / skt YALNIZ cuvalda tam
--     tarih varsa dolar ve yalniz o zaman dosyanin Ek Bilgiler tarihleri guncellenir (ay-yil: dosya eskisi gibi).
--  2) siparis_formu_kaydet yeni imza (eski 6 parametreli imza gecis icin yerinde birakildi; sayfa artik cagirmaz).
--  3) siparis_formu_veri: form alanlari + SABIT temsilci (ekipte tam adi girilmis ilk aktif uye).
-- Canliya 18.11.2026 Supabase MCP ile uygulandi (bu dosya repo senkronudur). Idempotent.
-- ============================================================================

alter table public.siparis_formlari add column if not exists uretim_metin text;
alter table public.siparis_formlari add column if not exists skt_metin text;
alter table public.siparis_formlari add column if not exists spekler text;
alter table public.siparis_formlari add column if not exists tarih_kaynagi text;
alter table public.siparis_formlari drop constraint if exists siparis_formlari_tarih_kaynagi_check;
alter table public.siparis_formlari add constraint siparis_formlari_tarih_kaynagi_check check (tarih_kaynagi is null or tarih_kaynagi in ('gorsel', 'elle'));

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
      'uretim_tarihi', f.uretim_tarihi, 'skt', f.skt, 'uretim_metin', f.uretim_metin, 'skt_metin', f.skt_metin, 'spekler', f.spekler,
      'tarih_kaynagi', f.tarih_kaynagi, 'gorsel_yolu', f.gorsel_yolu, 'gorsel_adi', f.gorsel_adi,
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
    -- Temsilci SABIT (18.11.2026, kullanici): ekipte tam adi girilmis ilk aktif uye (pazar_ekip.ad_soyad, sira)
    select ek.* from public.pazar_ekip ek
    where ek.company_id = p_company and ek.aktif and nullif(trim(ek.ad_soyad), '') is not null
    order by ek.sira nulls last, ek.olusturma limit 1
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

-- Eski 6 parametreli imza (yayindaki sayfa yeni surume gecene kadar) SILINMEZ; yeni sayfa yalniz bu imzayi cagirir.
create or replace function public.siparis_formu_kaydet(
  p_booking text, p_spekler text, p_uretim_metin text, p_skt_metin text, p_uretim date, p_skt date,
  p_gorsel_yolu text, p_gorsel_adi text, p_gorsel_sil boolean default false, p_tarih_kaynagi text default 'gorsel')
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
  if p_tarih_kaynagi is not null and p_tarih_kaynagi not in ('gorsel', 'elle') then
    raise exception 'Geçersiz tarih kaynağı.';
  end if;
  insert into public.siparis_formlari (company_id, booking_anahtar, booking_no, uretim_tarihi, skt, uretim_metin, skt_metin, spekler,
                                       tarih_kaynagi, gorsel_yolu, gorsel_adi, guncelleyen, guncelleme)
  values (v_sirket, v_ba, trim(p_booking), p_uretim, p_skt, nullif(left(trim(coalesce(p_uretim_metin, '')), 40), ''),
          nullif(left(trim(coalesce(p_skt_metin, '')), 40), ''), nullif(left(trim(coalesce(p_spekler, '')), 600), ''),
          p_tarih_kaynagi, v_yol, case when v_yol is null then null else left(p_gorsel_adi, 200) end,
          lower(coalesce(auth.jwt() ->> 'email', '')), now())
  on conflict (company_id, booking_anahtar) do update set
    booking_no = excluded.booking_no,
    uretim_tarihi = excluded.uretim_tarihi,
    skt = excluded.skt,
    uretim_metin = excluded.uretim_metin,
    skt_metin = excluded.skt_metin,
    spekler = excluded.spekler,
    tarih_kaynagi = excluded.tarih_kaynagi,
    gorsel_yolu = case when p_gorsel_sil then null else coalesce(excluded.gorsel_yolu, siparis_formlari.gorsel_yolu) end,
    gorsel_adi = case when p_gorsel_sil then null when excluded.gorsel_yolu is not null then excluded.gorsel_adi else siparis_formlari.gorsel_adi end,
    guncelleyen = excluded.guncelleyen,
    guncelleme = now();
  -- Ek Bilgiler: YALNIZ cuvalda tam tarih varsa (p_uretim / p_skt dolu) ayni booking'li ACIK dosyalar guncellenir
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
revoke all on function public.siparis_formu_kaydet(text, text, text, text, date, date, text, text, boolean, text) from public, anon;
grant execute on function public.siparis_formu_kaydet(text, text, text, text, date, date, text, text, boolean, text) to authenticated;
