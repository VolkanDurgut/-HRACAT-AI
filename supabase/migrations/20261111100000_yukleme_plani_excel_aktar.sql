-- ============================================================================
-- YUKLEME PLANI: Excel'den icerI aktarma (11.11.2026)
-- ============================================================================
-- Kullanici: "Yukleme planini excel ile iceri aktar yapilsin. ETD raporundaki gibi. Basliklar birebir ayni."
--
-- 1) sevkiyat_plani'na:
--      kalemler      jsonb  : bir booking'in urun kalemleri [{cinsi, konteyner, cuval_markasi, ambalaj}]
--                             (Excel'de booking satirinin altindaki ikinci urun satiri; KON.AD. = toplam)
--      hafta_baslik  text   : Excel'deki hafta basligi aynen ("46.HAFTA (08 KASIM - 14 KASIM)")
--      sira          int    : Excel'deki sira (plan dosyadaki sirayla gosterilir)
-- 2) sevkiyat_plani_aktarimlari: her aktarimin kaydi (kim, ne zaman, dosya, sayilar).
-- 3) yukleme_plani_aktar(dosya_adi, satirlar): onizlemede onaylanan satirlari yazar (tek islem).
--      - Eslesme booking no ile (bosluksuz, buyuk harf). Yeni booking -> eklenir (kaynak 'excel').
--      - Excel'de BOS hucre sistemdeki degeri SILMEZ. Hicbir kayit silinmez.
--      - rezervasyon_id / dosya_id / siparis_id / navlun_* alanlarina dokunulmaz; rezervasyon baglantisi
--        yoksa ayni booking'li rezervasyona baglanir.
--      - Yetki: "proformalar".
-- 4) yukleme_plani_veri: kalemler / hafta_baslik / sira dondurur; Excel satirinda HAFTA Excel'deki haftadir
--    (operasyonun koydugu hafta; ETD'den yeniden hesaplanmaz).
-- Not: Bu dosya gercek musteri verisi icermez.
-- ============================================================================

alter table public.sevkiyat_plani add column if not exists kalemler jsonb;
alter table public.sevkiyat_plani add column if not exists hafta_baslik text;
alter table public.sevkiyat_plani add column if not exists sira integer;

do $$ begin
  alter table public.sevkiyat_plani add constraint sevkiyat_plani_kalemler_check
    check (kalemler is null or (jsonb_typeof(kalemler) = 'array' and jsonb_array_length(kalemler) <= 20));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.sevkiyat_plani add constraint sevkiyat_plani_hafta_baslik_check
    check (hafta_baslik is null or char_length(hafta_baslik) <= 120);
exception when duplicate_object then null; end $$;

create table if not exists public.sevkiyat_plani_aktarimlari (
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
create index if not exists sevkiyat_plani_aktarimlari_sirket on public.sevkiyat_plani_aktarimlari (company_id, tarih desc);
alter table public.sevkiyat_plani_aktarimlari enable row level security;
drop policy if exists sevkiyat_plani_aktarimlari_oku on public.sevkiyat_plani_aktarimlari;
create policy sevkiyat_plani_aktarimlari_oku on public.sevkiyat_plani_aktarimlari for select to authenticated
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')));
revoke insert, update, delete on public.sevkiyat_plani_aktarimlari from anon, authenticated;

-- Booking esleme anahtari: bosluksuz, buyuk harf
create or replace function public.booking_anahtar(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '\s', '', 'g')), '')
$$;

create or replace function public.yukleme_plani_aktar(p_dosya_adi text, p_satirlar jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sirket uuid := auth_company_id();
  v_satir jsonb;
  v_bk text;
  v_mevcut public.sevkiyat_plani%rowtype;
  v_eklenen int := 0;
  v_guncellenen int := 0;
  v_ayni int := 0;
  v_gorulen text[] := '{}';
  v_kalem jsonb;
  v_rez uuid;
  v_dosya uuid;
  v_yeni public.sevkiyat_plani%rowtype;
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
  if jsonb_array_length(p_satirlar) > 2000 then
    raise exception 'Bir seferde en fazla 2000 satır aktarılabilir.';
  end if;

  for v_satir in select * from jsonb_array_elements(p_satirlar) loop
    v_bk := btrim(coalesce(v_satir->>'booking_no', ''));
    if char_length(v_bk) < 3 or char_length(v_bk) > 60 then
      raise exception 'Geçersiz booking no: %', left(v_bk, 60);
    end if;
    if booking_anahtar(v_bk) = any(v_gorulen) then
      raise exception 'Aynı booking iki kez gönderildi: %', v_bk;
    end if;
    v_gorulen := v_gorulen || booking_anahtar(v_bk);
    if (v_satir ? 'hafta') and v_satir->>'hafta' is not null and ((v_satir->>'hafta')::int < 1 or (v_satir->>'hafta')::int > 53) then
      raise exception 'Geçersiz hafta: % (%)', v_satir->>'hafta', v_bk;
    end if;
    if (v_satir->>'konteyner') is not null and ((v_satir->>'konteyner')::int < 0 or (v_satir->>'konteyner')::int > 1000) then
      raise exception 'Geçersiz konteyner adedi (%)', v_bk;
    end if;
    v_kalem := case when jsonb_typeof(v_satir->'kalemler') = 'array' and jsonb_array_length(v_satir->'kalemler') between 1 and 20
                    then v_satir->'kalemler' else null end;

    select * into v_mevcut from sevkiyat_plani
      where company_id = v_sirket and booking_anahtar(booking_no) = booking_anahtar(v_bk)
      order by created_at limit 1 for update;

    if not found then
      -- ayni booking'li rezervasyon varsa bagla
      select r.id, r.dosya_id into v_rez, v_dosya from rezervasyonlar r
        where r.company_id = v_sirket and booking_anahtar(r.booking_no) = booking_anahtar(v_bk)
        order by r.olusturma_tarihi desc nulls last limit 1;
      insert into sevkiyat_plani (company_id, booking_no, hafta, hafta_baslik, yil, sira, musteri, cinsi, konteyner, varis_limani,
        cuval_markasi, ambalaj, acente, liman, ekipman, bos_ekipman_tarihi, ardiyesiz_giris, talimat_cutoff, beyan_cutoff,
        etd, gemi, sefer, kalemler, rezervasyon_id, dosya_id, kaynak)
      values (v_sirket, v_bk, (v_satir->>'hafta')::int, nullif(btrim(v_satir->>'hafta_baslik'), ''),
        coalesce((v_satir->>'yil')::int, extract(year from now())::int), (v_satir->>'sira')::int,
        nullif(btrim(v_satir->>'musteri'), ''), nullif(btrim(v_satir->>'cinsi'), ''), (v_satir->>'konteyner')::int,
        nullif(btrim(v_satir->>'varis_limani'), ''), nullif(btrim(v_satir->>'cuval_markasi'), ''), nullif(btrim(v_satir->>'ambalaj'), ''),
        nullif(btrim(v_satir->>'acente'), ''), nullif(btrim(v_satir->>'liman'), ''), nullif(btrim(v_satir->>'ekipman'), ''),
        (v_satir->>'bos_ekipman_tarihi')::date, (v_satir->>'ardiyesiz_giris')::date,
        (v_satir->>'talimat_cutoff')::timestamptz, (v_satir->>'beyan_cutoff')::timestamptz, (v_satir->>'etd')::date,
        nullif(btrim(v_satir->>'gemi'), ''), nullif(btrim(v_satir->>'sefer'), ''), v_kalem, v_rez, v_dosya, 'excel');
      v_eklenen := v_eklenen + 1;
      v_rez := null; v_dosya := null;
    else
      v_yeni := v_mevcut;
      -- Excel'de bos hucre sistemdeki degeri silmez
      v_yeni.hafta := coalesce((v_satir->>'hafta')::int, v_mevcut.hafta);
      v_yeni.hafta_baslik := coalesce(nullif(btrim(v_satir->>'hafta_baslik'), ''), v_mevcut.hafta_baslik);
      v_yeni.yil := coalesce((v_satir->>'yil')::int, v_mevcut.yil);
      v_yeni.sira := coalesce((v_satir->>'sira')::int, v_mevcut.sira);
      v_yeni.musteri := coalesce(nullif(btrim(v_satir->>'musteri'), ''), v_mevcut.musteri);
      v_yeni.cinsi := coalesce(nullif(btrim(v_satir->>'cinsi'), ''), v_mevcut.cinsi);
      v_yeni.konteyner := coalesce((v_satir->>'konteyner')::int, v_mevcut.konteyner);
      v_yeni.varis_limani := coalesce(nullif(btrim(v_satir->>'varis_limani'), ''), v_mevcut.varis_limani);
      v_yeni.cuval_markasi := coalesce(nullif(btrim(v_satir->>'cuval_markasi'), ''), v_mevcut.cuval_markasi);
      v_yeni.ambalaj := coalesce(nullif(btrim(v_satir->>'ambalaj'), ''), v_mevcut.ambalaj);
      v_yeni.acente := coalesce(nullif(btrim(v_satir->>'acente'), ''), v_mevcut.acente);
      v_yeni.liman := coalesce(nullif(btrim(v_satir->>'liman'), ''), v_mevcut.liman);
      v_yeni.ekipman := coalesce(nullif(btrim(v_satir->>'ekipman'), ''), v_mevcut.ekipman);
      v_yeni.bos_ekipman_tarihi := coalesce((v_satir->>'bos_ekipman_tarihi')::date, v_mevcut.bos_ekipman_tarihi);
      v_yeni.ardiyesiz_giris := coalesce((v_satir->>'ardiyesiz_giris')::date, v_mevcut.ardiyesiz_giris);
      v_yeni.talimat_cutoff := coalesce((v_satir->>'talimat_cutoff')::timestamptz, v_mevcut.talimat_cutoff);
      v_yeni.beyan_cutoff := coalesce((v_satir->>'beyan_cutoff')::timestamptz, v_mevcut.beyan_cutoff);
      v_yeni.etd := coalesce((v_satir->>'etd')::date, v_mevcut.etd);
      v_yeni.gemi := coalesce(nullif(btrim(v_satir->>'gemi'), ''), v_mevcut.gemi);
      v_yeni.sefer := coalesce(nullif(btrim(v_satir->>'sefer'), ''), v_mevcut.sefer);
      v_yeni.kalemler := coalesce(v_kalem, v_mevcut.kalemler);
      if v_mevcut.rezervasyon_id is null then
        select r.id, r.dosya_id into v_rez, v_dosya from rezervasyonlar r
          where r.company_id = v_sirket and booking_anahtar(r.booking_no) = booking_anahtar(v_bk)
          order by r.olusturma_tarihi desc nulls last limit 1;
        v_yeni.rezervasyon_id := v_rez;
        v_yeni.dosya_id := coalesce(v_mevcut.dosya_id, v_dosya);
        v_rez := null; v_dosya := null;
      end if;

      if row(v_yeni.hafta, v_yeni.hafta_baslik, v_yeni.yil, v_yeni.sira, v_yeni.musteri, v_yeni.cinsi, v_yeni.konteyner, v_yeni.varis_limani,
             v_yeni.cuval_markasi, v_yeni.ambalaj, v_yeni.acente, v_yeni.liman, v_yeni.ekipman, v_yeni.bos_ekipman_tarihi, v_yeni.ardiyesiz_giris,
             v_yeni.talimat_cutoff, v_yeni.beyan_cutoff, v_yeni.etd, v_yeni.gemi, v_yeni.sefer, v_yeni.kalemler, v_yeni.rezervasyon_id, v_yeni.dosya_id)
         is not distinct from
         row(v_mevcut.hafta, v_mevcut.hafta_baslik, v_mevcut.yil, v_mevcut.sira, v_mevcut.musteri, v_mevcut.cinsi, v_mevcut.konteyner, v_mevcut.varis_limani,
             v_mevcut.cuval_markasi, v_mevcut.ambalaj, v_mevcut.acente, v_mevcut.liman, v_mevcut.ekipman, v_mevcut.bos_ekipman_tarihi, v_mevcut.ardiyesiz_giris,
             v_mevcut.talimat_cutoff, v_mevcut.beyan_cutoff, v_mevcut.etd, v_mevcut.gemi, v_mevcut.sefer, v_mevcut.kalemler, v_mevcut.rezervasyon_id, v_mevcut.dosya_id) then
        v_ayni := v_ayni + 1;
      else
        update sevkiyat_plani set
          hafta = v_yeni.hafta, hafta_baslik = v_yeni.hafta_baslik, yil = v_yeni.yil, sira = v_yeni.sira, musteri = v_yeni.musteri,
          cinsi = v_yeni.cinsi, konteyner = v_yeni.konteyner, varis_limani = v_yeni.varis_limani, cuval_markasi = v_yeni.cuval_markasi,
          ambalaj = v_yeni.ambalaj, acente = v_yeni.acente, liman = v_yeni.liman, ekipman = v_yeni.ekipman,
          bos_ekipman_tarihi = v_yeni.bos_ekipman_tarihi, ardiyesiz_giris = v_yeni.ardiyesiz_giris, talimat_cutoff = v_yeni.talimat_cutoff,
          beyan_cutoff = v_yeni.beyan_cutoff, etd = v_yeni.etd, gemi = v_yeni.gemi, sefer = v_yeni.sefer, kalemler = v_yeni.kalemler,
          rezervasyon_id = v_yeni.rezervasyon_id, dosya_id = v_yeni.dosya_id, updated_at = now()
        where id = v_mevcut.id;
        v_guncellenen := v_guncellenen + 1;
      end if;
    end if;
  end loop;

  insert into sevkiyat_plani_aktarimlari (company_id, dosya_adi, yukleyen, yukleyen_id, eklenen, guncellenen, ayni, ozet)
  values (v_sirket, left(p_dosya_adi, 200), auth.jwt()->>'email', auth.uid(), v_eklenen, v_guncellenen, v_ayni,
          jsonb_build_object('satir', jsonb_array_length(p_satirlar)));

  return jsonb_build_object('eklenen', v_eklenen, 'guncellenen', v_guncellenen, 'ayni', v_ayni);
end;
$$;
revoke all on function public.yukleme_plani_aktar(text, jsonb) from public, anon;
grant execute on function public.yukleme_plani_aktar(text, jsonb) to authenticated;

-- Plan verisi: kalemler / hafta_baslik / sira eklendi; Excel satirinda hafta Excel'deki haftadir.
drop function if exists public.yukleme_plani_veri(uuid);
create function public.yukleme_plani_veri(p_company uuid)
returns table(anahtar text, kaynak text, hafta integer, yil integer, etd date, booking_no text, musteri text, cinsi text,
  konteyner integer, varis_limani text, cuval_markasi text, ambalaj text, acente text, liman text, ekipman text,
  bos_ekipman_tarihi date, ekipman_alim_yeri text, ardiyesiz_giris date, talimat_cutoff timestamptz, beyan_cutoff timestamptz,
  gemi text, sefer text, navlun numeric, lokal numeric, navlun_para text, dosya_no text, proforma_no text,
  kalemler jsonb, hafta_baslik text, sira integer)
language sql stable security definer set search_path = public as $$
  with rez as (
    select r.*, d.dosya_no, d.alici_firma, d.urun_tanimi, d.varis_limani, d.marka, d.ambalaj, d.navlun_tutari,
           d.lokal_masraf_tutari, d.para_birimi, d.proforma_no
    from rezervasyonlar r left join ihracat_dosyalari d on d.id = r.dosya_id
    where r.company_id = p_company
  ),
  gecmis as (
    select 'excel:' || p.id anahtar, 'excel'::text kaynak,
      coalesce(p.hafta, extract(week from r.gemi_kalkis_tarihi)::int) hafta,
      coalesce(p.yil, extract(isoyear from r.gemi_kalkis_tarihi)::int) yil,
      coalesce(r.gemi_kalkis_tarihi, p.etd) etd, coalesce(r.booking_no, p.booking_no) booking_no,
      p.musteri, p.cinsi, coalesce(r.konteyner_adedi, p.konteyner) konteyner, coalesce(p.varis_limani, r.varis_limani) varis_limani,
      coalesce(p.cuval_markasi, r.marka) cuval_markasi, coalesce(p.ambalaj, r.ambalaj) ambalaj,
      coalesce(nullif(r.acente_ismi, ''), p.acente) acente, coalesce(nullif(r.yuklenme_limani, ''), p.liman) liman, p.ekipman,
      coalesce(r.ekipman_alim_tarihi, p.bos_ekipman_tarihi) bos_ekipman_tarihi, r.ekipman_alim_yeri,
      coalesce(r.ardiyesiz_giris, p.ardiyesiz_giris) ardiyesiz_giris, coalesce(r.talimat_cutoff, p.talimat_cutoff) talimat_cutoff,
      coalesce(r.beyanname_cutoff, p.beyan_cutoff) beyan_cutoff, coalesce(nullif(r.gemi_adi, ''), p.gemi) gemi,
      coalesce(nullif(r.sefer_no, ''), p.sefer) sefer,
      coalesce(r.navlun_tutari, p.navlun_kont) navlun, coalesce(r.lokal_masraf_tutari, p.lokal_kont) lokal,
      coalesce(p.navlun_para, r.para_birimi, 'USD') navlun_para, r.dosya_no, r.proforma_no,
      p.kalemler, p.hafta_baslik, p.sira
    from sevkiyat_plani p left join rez r on r.id = p.rezervasyon_id
    where p.company_id = p_company
  ),
  yeni as (
    select 'rez:' || r.id, 'sistem'::text, null::int, extract(year from r.gemi_kalkis_tarihi)::int,
      r.gemi_kalkis_tarihi, r.booking_no, r.alici_firma, r.urun_tanimi, r.konteyner_adedi, r.varis_limani, r.marka, r.ambalaj,
      r.acente_ismi, r.yuklenme_limani, null::text, r.ekipman_alim_tarihi, r.ekipman_alim_yeri, r.ardiyesiz_giris,
      r.talimat_cutoff, r.beyanname_cutoff, r.gemi_adi, r.sefer_no, r.navlun_tutari, r.lokal_masraf_tutari,
      coalesce(r.para_birimi, 'USD'), r.dosya_no, r.proforma_no, null::jsonb, null::text, null::int
    from rez r
    where not exists (select 1 from sevkiyat_plani p where p.company_id = p_company
                      and (p.rezervasyon_id = r.id or booking_anahtar(p.booking_no) = booking_anahtar(r.booking_no)))
  )
  select * from gecmis union all select * from yeni
$$;
revoke all on function public.yukleme_plani_veri(uuid) from public, anon, authenticated;
grant execute on function public.yukleme_plani_veri(uuid) to service_role;
