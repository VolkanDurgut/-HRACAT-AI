-- ============================================================================
-- SIPARIS BILDIRIM FORMU v4 (19.11.2026)
-- ============================================================================
-- Kullanici: "Siparis bildirim formunda gorseli yuklenmemisse mail gitmemeli." (gonderim kapisi edge + ortak modelde:
--   girisler tamam degilse form gitmez). "Proforma no = lot no; cuvalin ustunde yazan lot ile eslesmeli." Dosyadaki adres
--   karismis alici adi icin: "Yalniz formda duzelt".
--  1) siparis_formlari: lot_no (cuvaldaki lot) ve firma_adi (formdaki firma adi). Bossa form dosyadakini yazar.
--     Dosya / sevk evraklari DEGISMEZ.
--  2) siparis_formu_veri: form nesnesine lot_no / firma_adi (canli tanimdan replace ile; baska satir degismez).
--  3) siparis_formu_kaydet yeni imza (12 parametre, VARSAYILANSIZ: eski 10 parametreli cagri belirsizlesmesin). Eski imzalar
--     yayindaki sayfa yeni surume gecene kadar yerinde birakildi.
-- Canliya 19.11.2026 Supabase MCP ile uygulandi (bu dosya repo senkronudur). Idempotent.
-- ============================================================================

alter table public.siparis_formlari add column if not exists lot_no text;
alter table public.siparis_formlari add column if not exists firma_adi text;

do $$
declare
  v_tanim text := pg_get_functiondef('public.siparis_formu_veri(uuid, date, date)'::regprocedure);
  v_eski text := '''gorsel_yolu'', f.gorsel_yolu,';
  v_yeni text := '''gorsel_yolu'', f.gorsel_yolu, ''lot_no'', f.lot_no, ''firma_adi'', f.firma_adi,';
begin
  if position('''lot_no'', f.lot_no' in v_tanim) > 0 then
    return; -- zaten uygulanmis
  end if;
  if (length(v_tanim) - length(replace(v_tanim, v_eski, ''))) / length(v_eski) <> 1 then
    raise exception 'siparis_formu_veri beklenen bicimde degil; elle inceleyin.';
  end if;
  execute replace(v_tanim, v_eski, v_yeni);
end;
$$;
revoke all on function public.siparis_formu_veri(uuid, date, date) from public, anon, authenticated;
grant execute on function public.siparis_formu_veri(uuid, date, date) to service_role;

create or replace function public.siparis_formu_kaydet(
  p_booking text, p_spekler text, p_uretim_metin text, p_skt_metin text, p_uretim date, p_skt date,
  p_gorsel_yolu text, p_gorsel_adi text, p_gorsel_sil boolean, p_tarih_kaynagi text, p_lot_no text, p_firma_adi text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := auth_company_id();
  v_ba text := public.booking_anahtar(p_booking);
  v_yol text := nullif(trim(coalesce(p_gorsel_yolu, '')), '');
  v_lot text := nullif(left(upper(regexp_replace(coalesce(p_lot_no, ''), '\s+', '', 'g')), 60), '');
  v_firma text := nullif(left(regexp_replace(trim(coalesce(p_firma_adi, '')), '\s+', ' ', 'g'), 120), '');
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
                                       tarih_kaynagi, gorsel_yolu, gorsel_adi, lot_no, firma_adi, guncelleyen, guncelleme)
  values (v_sirket, v_ba, trim(p_booking), p_uretim, p_skt, nullif(left(trim(coalesce(p_uretim_metin, '')), 40), ''),
          nullif(left(trim(coalesce(p_skt_metin, '')), 40), ''), nullif(left(trim(coalesce(p_spekler, '')), 600), ''),
          p_tarih_kaynagi, v_yol, case when v_yol is null then null else left(p_gorsel_adi, 200) end, v_lot, v_firma,
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
    lot_no = excluded.lot_no,
    firma_adi = excluded.firma_adi,
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
revoke all on function public.siparis_formu_kaydet(text, text, text, text, date, date, text, text, boolean, text, text, text) from public, anon;
grant execute on function public.siparis_formu_kaydet(text, text, text, text, date, date, text, text, boolean, text, text, text) to authenticated;
