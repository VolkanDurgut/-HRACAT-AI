-- ============================================================================
-- SIPARIS LISTESI: Excel'den iceri aktarma (11.11.2026)
-- ============================================================================
-- Kullanici: "Siparis listesi icinde ayni seyi yapmaliyiz. Excel yukleyebilmeliyiz." (yukleme plani aktarimi gibi)
--
-- siparis_listesi_aktar(dosya_adi, satirlar): tarayicida okunan ve onizlemede onaylanan satirlari yazar (tek islem).
--   - Eslesme ISTEMCIDE yapilir (onizlemede gorulen = yazilan): satirda "id" varsa o siparis_defteri kaydi guncellenir
--     (ayni sirkete ait olmali), yoksa yeni kayit eklenir (kaynak 'excel').
--   - Excel'de BOS hucre sistemdeki degeri SILMEZ. Hicbir kayit silinmez. "iptal" durumundaki kaydin durumu degismez.
--   - dosya_id / on odeme isaretleri (siparis_on_odemeler) DOKUNULMAZ; canli durum kurallari aynen gecerli.
--   - Yetki: "proformalar".
-- siparis_defteri_aktarimlari: her aktarimin kaydi (kim, ne zaman, dosya, sayilar).
-- Not: Bu dosya gercek musteri verisi icermez.
-- ============================================================================

create table if not exists public.siparis_defteri_aktarimlari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  dosya_adi text check (dosya_adi is null or char_length(dosya_adi) <= 200),
  yukleyen text,
  yukleyen_id uuid,
  tarih timestamptz not null default now(),
  eklenen integer not null default 0,
  guncellenen integer not null default 0,
  ayni integer not null default 0,
  ozet jsonb
);
create index if not exists siparis_defteri_aktarimlari_sirket on public.siparis_defteri_aktarimlari (company_id, tarih desc);
alter table public.siparis_defteri_aktarimlari enable row level security;
drop policy if exists siparis_defteri_aktarimlari_oku on public.siparis_defteri_aktarimlari;
create policy siparis_defteri_aktarimlari_oku on public.siparis_defteri_aktarimlari for select to authenticated
  using (company_id = auth_company_id() and ic_sayfa_yetkisi('proformalar'));
revoke insert, update, delete on public.siparis_defteri_aktarimlari from anon, authenticated;

create or replace function public.siparis_listesi_aktar(p_dosya_adi text, p_satirlar jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sirket uuid := auth_company_id();
  v_eposta text := auth.jwt()->>'email';
  v_satir jsonb;
  v_id uuid;
  v_m public.siparis_defteri%rowtype;
  v_y public.siparis_defteri%rowtype;
  v_pf text;
  v_firma text;
  v_durum text;
  v_eklenen int := 0;
  v_guncellenen int := 0;
  v_ayni int := 0;
  v_gorulen uuid[] := '{}';
  v_sayi numeric;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('proformalar') then
    raise exception 'Yetkiniz yok.';
  end if;
  if p_satirlar is null or jsonb_typeof(p_satirlar) <> 'array' then
    raise exception 'Geçersiz veri.';
  end if;
  if jsonb_array_length(p_satirlar) = 0 then
    raise exception 'Aktarılacak satır yok.';
  end if;
  if jsonb_array_length(p_satirlar) > 3000 then
    raise exception 'Bir seferde en fazla 3000 satır aktarılabilir.';
  end if;

  for v_satir in select * from jsonb_array_elements(p_satirlar) loop
    v_pf := btrim(coalesce(v_satir->>'proforma_no', ''));
    v_firma := btrim(coalesce(v_satir->>'firma', ''));
    v_durum := v_satir->>'durum';
    if char_length(v_pf) < 3 or char_length(v_pf) > 80 then
      raise exception 'Geçersiz proforma no: %', left(v_pf, 80);
    end if;
    if v_durum is null or v_durum not in ('onay_bekliyor', 'on_odeme_alindi', 'rezervasyonlu', 'sevk_edildi', 'bl_eksik') then
      raise exception 'Geçersiz durum (%): %', v_pf, coalesce(v_durum, '-');
    end if;
    foreach v_sayi in array array[(v_satir->>'birim_fiyat')::numeric, (v_satir->>'miktar_mt')::numeric, (v_satir->>'tutar')::numeric] loop
      if v_sayi is not null and v_sayi < 0 then raise exception 'Eksi değer (%)', v_pf; end if;
    end loop;
    if (v_satir->>'konteyner') is not null and ((v_satir->>'konteyner')::int < 0 or (v_satir->>'konteyner')::int > 1000) then
      raise exception 'Geçersiz konteyner adedi (%)', v_pf;
    end if;

    v_id := nullif(v_satir->>'id', '')::uuid;
    if v_id is null then
      if char_length(v_firma) < 1 or char_length(v_firma) > 200 then
        raise exception 'Firma adı gerekli (%)', v_pf;
      end if;
      insert into siparis_defteri (company_id, kaynak_anahtar, sira, proforma_no, proforma_tarihi, firma, firma_anahtar, urun,
        birim_fiyat, miktar_mt, tutar, konteyner, liman, bl_no, marka, paketleme, durum, kaynak, guncelleyen)
      values (v_sirket, 'aktarim:' || gen_random_uuid(), (v_satir->>'sira')::int, v_pf, (v_satir->>'proforma_tarihi')::date,
        v_firma, pazar_anahtar(v_firma), nullif(btrim(v_satir->>'urun'), ''),
        (v_satir->>'birim_fiyat')::numeric, (v_satir->>'miktar_mt')::numeric, (v_satir->>'tutar')::numeric, (v_satir->>'konteyner')::int,
        nullif(btrim(v_satir->>'liman'), ''), nullif(btrim(v_satir->>'bl_no'), ''), nullif(btrim(v_satir->>'marka'), ''),
        nullif(btrim(v_satir->>'paketleme'), ''), v_durum, 'excel', v_eposta);
      v_eklenen := v_eklenen + 1;
      continue;
    end if;

    if v_id = any(v_gorulen) then
      raise exception 'Aynı kayıt iki kez gönderildi (%)', v_pf;
    end if;
    v_gorulen := v_gorulen || v_id;
    select * into v_m from siparis_defteri where id = v_id and company_id = v_sirket for update;
    if not found then
      raise exception 'Sipariş kaydı bulunamadı (%). Sayfayı yenileyip tekrar deneyin.', v_pf;
    end if;

    v_y := v_m;
    -- Excel'de bos hucre sistemdeki degeri silmez
    v_y.sira := coalesce((v_satir->>'sira')::int, v_m.sira);
    v_y.proforma_no := v_pf;
    v_y.proforma_tarihi := coalesce((v_satir->>'proforma_tarihi')::date, v_m.proforma_tarihi);
    v_y.firma := coalesce(nullif(left(v_firma, 200), ''), v_m.firma);
    v_y.firma_anahtar := pazar_anahtar(v_y.firma);
    v_y.urun := coalesce(nullif(btrim(v_satir->>'urun'), ''), v_m.urun);
    v_y.birim_fiyat := coalesce((v_satir->>'birim_fiyat')::numeric, v_m.birim_fiyat);
    v_y.miktar_mt := coalesce((v_satir->>'miktar_mt')::numeric, v_m.miktar_mt);
    v_y.tutar := coalesce((v_satir->>'tutar')::numeric, v_m.tutar);
    v_y.konteyner := coalesce((v_satir->>'konteyner')::int, v_m.konteyner);
    v_y.liman := coalesce(nullif(btrim(v_satir->>'liman'), ''), v_m.liman);
    v_y.bl_no := coalesce(nullif(btrim(v_satir->>'bl_no'), ''), v_m.bl_no);
    v_y.marka := coalesce(nullif(btrim(v_satir->>'marka'), ''), v_m.marka);
    v_y.paketleme := coalesce(nullif(btrim(v_satir->>'paketleme'), ''), v_m.paketleme);
    v_y.durum := case when v_m.durum = 'iptal' then 'iptal' else v_durum end;

    if row(v_y.sira, v_y.proforma_no, v_y.proforma_tarihi, v_y.firma, v_y.urun, v_y.birim_fiyat, v_y.miktar_mt, v_y.tutar, v_y.konteyner,
           v_y.liman, v_y.bl_no, v_y.marka, v_y.paketleme, v_y.durum)
       is not distinct from
       row(v_m.sira, v_m.proforma_no, v_m.proforma_tarihi, v_m.firma, v_m.urun, v_m.birim_fiyat, v_m.miktar_mt, v_m.tutar, v_m.konteyner,
           v_m.liman, v_m.bl_no, v_m.marka, v_m.paketleme, v_m.durum) then
      v_ayni := v_ayni + 1;
    else
      update siparis_defteri set sira = v_y.sira, proforma_no = v_y.proforma_no, proforma_tarihi = v_y.proforma_tarihi, firma = v_y.firma,
        firma_anahtar = v_y.firma_anahtar, urun = v_y.urun, birim_fiyat = v_y.birim_fiyat, miktar_mt = v_y.miktar_mt, tutar = v_y.tutar,
        konteyner = v_y.konteyner, liman = v_y.liman, bl_no = v_y.bl_no, marka = v_y.marka, paketleme = v_y.paketleme, durum = v_y.durum,
        guncelleyen = v_eposta, updated_at = now()
      where id = v_m.id;
      v_guncellenen := v_guncellenen + 1;
    end if;
  end loop;

  insert into siparis_defteri_aktarimlari (company_id, dosya_adi, yukleyen, yukleyen_id, eklenen, guncellenen, ayni, ozet)
  values (v_sirket, left(p_dosya_adi, 200), v_eposta, auth.uid(), v_eklenen, v_guncellenen, v_ayni,
          jsonb_build_object('satir', jsonb_array_length(p_satirlar)));

  return jsonb_build_object('eklenen', v_eklenen, 'guncellenen', v_guncellenen, 'ayni', v_ayni);
end;
$$;
revoke all on function public.siparis_listesi_aktar(text, jsonb) from public, anon;
grant execute on function public.siparis_listesi_aktar(text, jsonb) to authenticated;
