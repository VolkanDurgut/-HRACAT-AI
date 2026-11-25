-- ============================================================================
-- IC PIYASA ALIS - BAKIYE BIRLESTIR (25.11.2026)
-- ============================================================================
-- Kullanici: "Ic piyasa kismi icin alis birlestirilmesi gerekiyor" (TMO dilekcesi: dort alis sozlesmesinin kalan
-- bakiyeleri tek depodan cekilecek). Onceki elle aktarimlar (AS-2026-0008, AS-2026-0011) notla yapilmisti; bu islem ayni
-- sonucu KAYITLI ve GERI ALINABILIR yapar:
--   - Kaynaklar: ACIK alislar, ayni urun, kalan (miktar - teslim alinan) > 0. Teslim alinmis olan "tamamlandi" (miktar =
--     teslim alinan), hic teslim almamis olan "iptal" (aktarildi) olur; notlarina "-> AS-yeni" yazilir.
--   - Hedef: yeni ACIK alis (secilen tedarikci / urun / kod / depo / termin), miktar = kalanlarin toplami.
--   - Kayit: ic_alis_birlestirmeleri (kaynaklarin onceki miktar / durum / notu). Geri al: yeni alisa arac alinmadiysa
--     kaynaklar aynen geri doner, yeni alis silinir.
-- Yazma YALNIZ bu iki fonksiyonla (security definer, ic_alis yetkisi). Mevcut tablo ve fonksiyonlara DOKUNULMAZ.
-- ============================================================================

create table if not exists public.ic_alis_birlestirmeleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  hedef_id uuid references public.ic_alis_siparisleri(id) on delete set null,
  hedef_no text not null,
  kaynaklar jsonb not null,
  toplam_kg numeric(14, 2) not null check (toplam_kg > 0),
  aciklama text check (aciklama is null or char_length(aciklama) <= 300),
  olusturan_email text,
  olusturma timestamptz not null default now(),
  geri_alindi timestamptz,
  geri_alan_email text
);
comment on table public.ic_alis_birlestirmeleri is
  'Ic piyasa alis bakiye birlestirme kaydi (25.11.2026). kaynaklar: [{alis_id, alis_no, onceki_miktar_kg, onceki_durum, onceki_notlar, aktarilan_kg}]. Yazma yalniz ic_alis_bakiye_birlestir / ic_alis_birlestirme_geri_al.';
create index if not exists ic_alis_birlestirmeleri_hedef on public.ic_alis_birlestirmeleri (hedef_id);
create index if not exists ic_alis_birlestirmeleri_sirket on public.ic_alis_birlestirmeleri (company_id, olusturma desc);
alter table public.ic_alis_birlestirmeleri enable row level security;
revoke all on table public.ic_alis_birlestirmeleri from anon;
revoke insert, update, delete on table public.ic_alis_birlestirmeleri from authenticated;
grant select on table public.ic_alis_birlestirmeleri to authenticated;
drop policy if exists ic_alis_birlestirmeleri_select on public.ic_alis_birlestirmeleri;
create policy ic_alis_birlestirmeleri_select on public.ic_alis_birlestirmeleri
  for select using (company_id = auth_company_id() and ic_sayfa_yetkisi('ic_alis'));
drop trigger if exists denetim_ic_alis_birlestirmeleri on public.ic_alis_birlestirmeleri;
create trigger denetim_ic_alis_birlestirmeleri after insert or update or delete on public.ic_alis_birlestirmeleri
  for each row execute function denetim_tetikleyici();

-- kg yazimi: mevcut public.ic_kg_yazi ("1.652.360 kg"; ic piyasa raporlari ile ayni)
create or replace function public.ic_alis_bakiye_birlestir(
  p_kaynaklar uuid[], p_tedarikci uuid, p_urun text, p_urun_kodu text default null, p_depo text default null,
  p_termin date default null, p_aciklama text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := auth_company_id();
  v_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  v_gun text := to_char((now() at time zone 'Europe/Istanbul')::date, 'DD.MM.YYYY');
  v_urun text := btrim(coalesce(p_urun, ''));
  v_aciklama text := nullif(left(btrim(coalesce(p_aciklama, '')), 300), '');
  v_kaynak record;
  v_liste jsonb := '[]'::jsonb;
  v_ozet text := '';
  v_toplam numeric := 0;
  v_ilk public.ic_alis_siparisleri%rowtype;
  v_hedef public.ic_alis_siparisleri%rowtype;
  v_k jsonb;
  v_id uuid;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('ic_alis') then
    raise exception 'Alış yetkiniz yok.' using errcode = '42501';
  end if;
  if p_kaynaklar is null or cardinality(p_kaynaklar) < 1 or cardinality(p_kaynaklar) > 20 then
    raise exception 'En az 1, en fazla 20 kaynak sipariş seçin.' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_kaynaklar) x) <> cardinality(p_kaynaklar) then
    raise exception 'Aynı sipariş iki kez seçilmiş.' using errcode = '22023';
  end if;
  if v_urun = '' or char_length(v_urun) > 80 then raise exception 'Ürün boş olamaz.' using errcode = '23514'; end if;
  if not exists (select 1 from public.ic_tedarikciler t where t.id = p_tedarikci and t.company_id = v_sirket) then
    raise exception 'Tedarikçi bulunamadı.' using errcode = '23503';
  end if;

  -- Kaynaklari kilitle ve kalanlarini hesapla (alis_no sirasiyla)
  for v_kaynak in
    select a.*, coalesce((select sum(x.net_kg) from public.ic_alis_teslimler x where x.alis_id = a.id), 0) as alinan
      from public.ic_alis_siparisleri a
     where a.id = any (p_kaynaklar) and a.company_id = v_sirket
     order by a.alis_no
       for update of a
  loop
    if v_kaynak.durum <> 'acik' then raise exception '% açık değil (%).', v_kaynak.alis_no, v_kaynak.durum using errcode = '23514'; end if;
    if lower(btrim(v_kaynak.urun)) <> lower(v_urun) then
      raise exception '% ürünü farklı (% / %).', v_kaynak.alis_no, v_kaynak.urun, v_urun using errcode = '22023';
    end if;
    if v_kaynak.miktar_kg - v_kaynak.alinan <= 0 then
      raise exception '% siparişinde kalan yok.', v_kaynak.alis_no using errcode = '23514';
    end if;
    v_toplam := v_toplam + (v_kaynak.miktar_kg - v_kaynak.alinan);
    v_liste := v_liste || jsonb_build_array(jsonb_build_object(
      'alis_id', v_kaynak.id, 'alis_no', v_kaynak.alis_no, 'onceki_miktar_kg', v_kaynak.miktar_kg, 'onceki_durum', v_kaynak.durum,
      'onceki_notlar', v_kaynak.notlar, 'alinan_kg', v_kaynak.alinan, 'aktarilan_kg', v_kaynak.miktar_kg - v_kaynak.alinan));
    v_ozet := v_ozet || case when v_ozet = '' then '' else ' + ' end || v_kaynak.alis_no || ' ' || ic_kg_yazi(v_kaynak.miktar_kg - v_kaynak.alinan);
  end loop;
  if jsonb_array_length(v_liste) <> cardinality(p_kaynaklar) then
    raise exception 'Kaynak siparişlerden biri bulunamadı.' using errcode = 'P0002';
  end if;
  select * into v_ilk from public.ic_alis_siparisleri where id = (v_liste -> 0 ->> 'alis_id')::uuid;

  -- Hedef: yeni acik alis (numara / olusturan ic_alis_hazirla tetikleyicisinden)
  insert into public.ic_alis_siparisleri (company_id, tedarikci_id, siparis_tarihi, urun, urun_kodu, depo, miktar_kg, birim_fiyat,
                                          para_birimi, kdv_dahil, vade_gun, termin, teslim, notlar)
  values (v_sirket, p_tedarikci, (now() at time zone 'Europe/Istanbul')::date, v_urun,
          nullif(left(btrim(coalesce(p_urun_kodu, '')), 20), ''), nullif(left(btrim(coalesce(p_depo, '')), 80), ''),
          round(v_toplam, 2), null, v_ilk.para_birimi, v_ilk.kdv_dahil, null, p_termin, v_ilk.teslim,
          'Bakiye birleştirme (' || v_gun || '): ' || v_ozet || ' = ' || ic_kg_yazi(v_toplam) || coalesce(' · ' || v_aciklama, ''))
  returning * into v_hedef;

  -- Kaynaklari kapat
  for v_k in select * from jsonb_array_elements(v_liste) loop
    if (v_k ->> 'alinan_kg')::numeric > 0 then
      update public.ic_alis_siparisleri
         set miktar_kg = (v_k ->> 'alinan_kg')::numeric, durum = 'tamamlandi',
             notlar = coalesce(nullif(notlar, '') || ' · ', '') || v_gun || ': kalan ' || ic_kg_yazi((v_k ->> 'aktarilan_kg')::numeric)
               || ' bakiye birleştirme ile ' || v_hedef.alis_no || ' siparişine aktarıldı'
       where id = (v_k ->> 'alis_id')::uuid;
    else
      update public.ic_alis_siparisleri
         set durum = 'iptal',
             notlar = coalesce(nullif(notlar, '') || ' · ', '') || v_gun || ': tamamı (' || ic_kg_yazi((v_k ->> 'aktarilan_kg')::numeric)
               || ') bakiye birleştirme ile ' || v_hedef.alis_no || ' siparişine aktarıldı'
       where id = (v_k ->> 'alis_id')::uuid;
    end if;
  end loop;

  insert into public.ic_alis_birlestirmeleri (company_id, hedef_id, hedef_no, kaynaklar, toplam_kg, aciklama, olusturan_email)
  values (v_sirket, v_hedef.id, v_hedef.alis_no, v_liste, round(v_toplam, 2), v_aciklama, v_email)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'hedef_id', v_hedef.id, 'hedef_no', v_hedef.alis_no, 'toplam_kg', round(v_toplam, 2),
                            'kaynak_sayisi', jsonb_array_length(v_liste));
end;
$$;

create or replace function public.ic_alis_birlestirme_geri_al(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := auth_company_id();
  b public.ic_alis_birlestirmeleri%rowtype;
  v_k jsonb;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('ic_alis') then
    raise exception 'Alış yetkiniz yok.' using errcode = '42501';
  end if;
  select * into b from public.ic_alis_birlestirmeleri where id = p_id and company_id = v_sirket for update;
  if not found then raise exception 'Birleştirme kaydı bulunamadı.' using errcode = 'P0002'; end if;
  if b.geri_alindi is not null then raise exception 'Bu birleştirme zaten geri alınmış.' using errcode = '23514'; end if;
  if b.hedef_id is not null then
    perform 1 from public.ic_alis_siparisleri where id = b.hedef_id for update;
    if exists (select 1 from public.ic_alis_teslimler x where x.alis_id = b.hedef_id) then
      raise exception '% siparişine araç alındı; birleştirme geri alınamaz.', b.hedef_no using errcode = '23514';
    end if;
  end if;
  for v_k in select * from jsonb_array_elements(b.kaynaklar) loop
    update public.ic_alis_siparisleri
       set miktar_kg = (v_k ->> 'onceki_miktar_kg')::numeric, durum = v_k ->> 'onceki_durum', notlar = v_k ->> 'onceki_notlar'
     where id = (v_k ->> 'alis_id')::uuid and company_id = v_sirket;
  end loop;
  if b.hedef_id is not null then
    delete from public.ic_alis_siparisleri where id = b.hedef_id and company_id = v_sirket;
  end if;
  update public.ic_alis_birlestirmeleri set geri_alindi = now(), geri_alan_email = lower(nullif(auth.jwt() ->> 'email', '')) where id = b.id;
  return jsonb_build_object('id', b.id, 'hedef_no', b.hedef_no, 'kaynak_sayisi', jsonb_array_length(b.kaynaklar));
end;
$$;

revoke all on function public.ic_alis_bakiye_birlestir(uuid[], uuid, text, text, text, date, text) from public, anon;
revoke all on function public.ic_alis_birlestirme_geri_al(uuid) from public, anon;
grant execute on function public.ic_alis_bakiye_birlestir(uuid[], uuid, text, text, text, date, text) to authenticated;
grant execute on function public.ic_alis_birlestirme_geri_al(uuid) to authenticated;
