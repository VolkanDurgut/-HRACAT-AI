-- SIPARIS LISTESI + YUKLEME PLANI: OTOMATIK (Dalga 4, Adim 2) - 10.11.2026
--
-- Kullanici: "Siparis formu ile yukleme planinin otomatik ve hatasiz bir sekilde hazirlanabilmeli. Ve daha
-- sonrasinda raporlayabilmeliyiz." On odeme: "Siparis listesinde on odeme girilebilsin" (elle girilen TEK alan).
--
-- Ilke: bilgi tek yerde. Liste ve plan KOPYALANMAZ, her okumada canli hesaplanir:
--   - Gecmis (Ocak-Kasim Excel aktarimi, 20261110120000): siparis_defteri / sevkiyat_plani satirlari.
--   - Yeni: proformalar (Proforma Olustur), ihracat_dosyalari (Proforma Yukle), rezervasyonlar (operasyon).
--   - Ayni siparis iki kez gorunmez: proforma no (bosluksuz, buyuk harf) / dosya / booking no ile eslesir.
--   - Durum her okumada hesaplanir: rezervasyon -> rezervasyonlu; ETD gecti + BL/draft var -> sevk_edildi;
--     ETD gecti + BL yok -> bl_eksik; aksi halde on odeme isaretine gore on_odeme_alindi / onay_bekliyor.
--     Excel'de "iptal" yazan satir iptal kalir.
--   - Yukleme planinda rezervasyona bagli satirin gemi / ETD / cut-off / konteyner bilgisi REZERVASYONDAN gelir
--     (operasyon degistirince plan da degisir); Excel'deki eski deger yalniz bossa kullanilir.
-- Erisim: hesap fonksiyonlari yalniz servis (17:00 raporu); kullanici sarmalayicilari "proformalar" veya "analiz"
-- yetkisi ister. On odeme isareti: "proformalar" yetkisi (export / muhasebe bu yetkiyle).

create or replace function public.siparis_anahtar(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '\s', '', 'g')), '')
$$;

-- 1) On odeme isareti (proforma basina)
create table if not exists public.siparis_on_odemeler (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  proforma_anahtar text not null,
  alindi boolean not null,
  tarih date,
  isaretleyen text,
  updated_at timestamptz not null default now(),
  unique (company_id, proforma_anahtar)
);
alter table public.siparis_on_odemeler enable row level security;
drop policy if exists siparis_on_odemeler_oku on public.siparis_on_odemeler;
create policy siparis_on_odemeler_oku on public.siparis_on_odemeler for select to authenticated
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')));
revoke all on public.siparis_on_odemeler from anon;
revoke insert, update, delete on public.siparis_on_odemeler from authenticated;

create or replace function public.siparis_on_odeme_isaretle(p_proforma_no text, p_alindi boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sirket uuid := auth_company_id();
  v_anahtar text := siparis_anahtar(p_proforma_no);
  v_kim text;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('proformalar') then
    raise exception 'Yetkiniz yok.';
  end if;
  if v_anahtar is null or p_alindi is null then raise exception 'Proforma no gerekli.'; end if;
  begin v_kim := lower(coalesce(auth.jwt() ->> 'email', '')); exception when others then v_kim := null; end;
  insert into siparis_on_odemeler (company_id, proforma_anahtar, alindi, tarih, isaretleyen, updated_at)
  values (v_sirket, v_anahtar, p_alindi, case when p_alindi then (now() at time zone 'Europe/Istanbul')::date end, left(v_kim, 120), now())
  on conflict (company_id, proforma_anahtar) do update set
    alindi = excluded.alindi, tarih = excluded.tarih, isaretleyen = excluded.isaretleyen, updated_at = now();
  return jsonb_build_object('ok', true, 'alindi', p_alindi);
end;
$$;
revoke all on function public.siparis_on_odeme_isaretle(text, boolean) from public, anon;
grant execute on function public.siparis_on_odeme_isaretle(text, boolean) to authenticated;

-- Dosya basina canli durum ozeti (iki fonksiyon da kullanir)
create or replace function public.siparis_dosya_ozeti(p_company uuid)
returns table (
  dosya_id uuid, dosya_no text, pk text, proforma_no text, proforma_tarihi date, alici text, urun text,
  miktar_mt numeric, tutar numeric, para_birimi text, liman text, marka text, ambalaj text, bl_no text,
  konteyner integer, etd date, booking text, durum text, olusturma timestamptz
)
language sql stable security definer set search_path = public as $$
  select d.id, d.dosya_no, coalesce(siparis_anahtar(d.proforma_no), siparis_anahtar(d.dosya_no)), d.proforma_no,
    d.proforma_tarihi, d.alici_firma, d.urun_tanimi,
    nullif(regexp_replace(coalesce(d.miktar, ''), '[^0-9.]', '', 'g'), '')::numeric,
    d.toplam_tutar, coalesce(d.para_birimi, 'USD'), d.varis_limani, d.marka, d.ambalaj, d.bl_no,
    coalesce(r.kont, d.toplam_konteyner), r.etd, r.booking,
    case
      when r.etd is not null and r.etd < (now() at time zone 'Europe/Istanbul')::date then
        case when nullif(btrim(coalesce(d.bl_no, '')), '') is not null or d.draft_bl_dosya_url is not null then 'sevk_edildi' else 'bl_eksik' end
      when r.adet > 0 then 'rezervasyonlu'
    end,
    d.olusturma_tarihi
  from ihracat_dosyalari d
  left join lateral (
    select count(*) adet, sum(x.konteyner_adedi)::int kont, min(x.gemi_kalkis_tarihi) etd,
           string_agg(x.booking_no, ', ' order by x.gemi_kalkis_tarihi) booking
    from rezervasyonlar x where x.dosya_id = d.id
  ) r on true
  where d.company_id = p_company
$$;
revoke all on function public.siparis_dosya_ozeti(uuid) from public, anon, authenticated;
grant execute on function public.siparis_dosya_ozeti(uuid) to service_role;

-- 2) Siparis listesi (canli)
create or replace function public.siparis_listesi_veri(p_company uuid)
returns table (
  anahtar text, kaynak text, sira integer, proforma_no text, proforma_tarihi date, firma text, urun text,
  birim_fiyat numeric, miktar_mt numeric, tutar numeric, para_birimi text, konteyner integer, liman text,
  bl_no text, marka text, paketleme text, durum text, on_odeme boolean, on_odeme_tarihi date,
  dosya_no text, booking_no text, etd date
)
language sql stable security definer set search_path = public as $$
  with dos as (select * from siparis_dosya_ozeti(p_company)),
  oo as (select proforma_anahtar, alindi, tarih from siparis_on_odemeler where company_id = p_company),
  sd as (
    select s.*, siparis_anahtar(s.proforma_no) pk,
      coalesce(
        (select d.dosya_id from dos d where d.dosya_id = s.dosya_id),
        (select d.dosya_id from dos d where s.bl_no is not null and siparis_anahtar(d.bl_no) = siparis_anahtar(s.bl_no) limit 1),
        (select min(d.dosya_id::text)::uuid from dos d where d.pk = siparis_anahtar(s.proforma_no)
           having count(*) = 1)
      ) bagli
    from siparis_defteri s where s.company_id = p_company
  ),
  gecmis as (
    select 'excel:' || sd.id anahtar, 'excel'::text kaynak, sd.sira, sd.proforma_no, sd.proforma_tarihi, sd.firma, sd.urun,
      sd.birim_fiyat, sd.miktar_mt, sd.tutar, sd.para_birimi, coalesce(d.konteyner, sd.konteyner) konteyner, sd.liman,
      coalesce(sd.bl_no, nullif(d.bl_no, '')) bl_no, sd.marka, sd.paketleme,
      case
        when sd.durum = 'iptal' then 'iptal'
        when d.durum is not null then d.durum
        when d.dosya_id is null and sd.durum in ('rezervasyonlu', 'sevk_edildi', 'bl_eksik') then sd.durum
        when oo.alindi is not null then case when oo.alindi then 'on_odeme_alindi' else 'onay_bekliyor' end
        else sd.durum
      end durum,
      coalesce(oo.alindi, sd.durum in ('on_odeme_alindi', 'rezervasyonlu', 'sevk_edildi', 'bl_eksik')) on_odeme, oo.tarih on_odeme_tarihi,
      d.dosya_no, d.booking booking_no, d.etd
    from sd left join dos d on d.dosya_id = sd.bagli left join oo on oo.proforma_anahtar = sd.pk
  ),
  -- Excel'de olmayan dosyalar (Proforma Yukle ile acilmis)
  dosyadan as (
    select 'dosya:' || d.dosya_id, 'sistem'::text, null::int, d.proforma_no, d.proforma_tarihi, d.alici, d.urun,
      case when d.miktar_mt > 0 then round(d.tutar / d.miktar_mt, 2) end, d.miktar_mt, d.tutar, d.para_birimi, d.konteyner,
      d.liman, nullif(d.bl_no, ''), d.marka, d.ambalaj,
      coalesce(d.durum, case when oo.alindi then 'on_odeme_alindi' else 'onay_bekliyor' end),
      coalesce(oo.alindi, d.durum is not null), oo.tarih, d.dosya_no, d.booking, d.etd
    from dos d left join oo on oo.proforma_anahtar = d.pk
    where not exists (select 1 from sd where sd.bagli = d.dosya_id or sd.pk = d.pk)
  ),
  -- Henuz dosyasi acilmamis proformalar (Proforma Olustur)
  proformadan as (
    select 'proforma:' || p.id, 'sistem'::text, null::int, p.proforma_no, p.tarih, p.alici_unvan,
      (select string_agg(k->>'urun', ' + ') from jsonb_array_elements(coalesce(p.taslak->'kalemler', '[]'::jsonb)) k),
      case when p.toplam_mts > 0 then round(p.toplam / p.toplam_mts, 2) end, p.toplam_mts, p.toplam, coalesce(p.para_birimi, 'USD'),
      null::int,
      nullif(btrim(split_part(regexp_replace(regexp_replace(coalesce(p.taslak->>'teslimIfadesi', ''),
        '^\s*(CFR|CIF|FOB|CPT|CIP|DAP|DDP|EXW|FCA|FAS|CNF|C&F)\s+', '', 'i'), '\s+BASIS\s*$', '', 'i'), ' PORT', 1)), ''),
      null::text,
      (select string_agg(distinct k->>'marka', ' / ') from jsonb_array_elements(coalesce(p.taslak->'kalemler', '[]'::jsonb)) k),
      nullif(p.taslak->>'paketleme', ''),
      case when oo.alindi then 'on_odeme_alindi' else 'onay_bekliyor' end,
      coalesce(oo.alindi, false), oo.tarih, null::text, null::text, null::date
    from proformalar p left join oo on oo.proforma_anahtar = siparis_anahtar(p.proforma_no)
    where p.company_id = p_company
      and not exists (select 1 from sd where sd.pk = siparis_anahtar(p.proforma_no))
      and not exists (select 1 from dos d where d.pk = siparis_anahtar(p.proforma_no))
  )
  select * from gecmis union all select * from dosyadan union all select * from proformadan
$$;
revoke all on function public.siparis_listesi_veri(uuid) from public, anon, authenticated;
grant execute on function public.siparis_listesi_veri(uuid) to service_role;

-- 3) Yukleme plani (canli)
create or replace function public.yukleme_plani_veri(p_company uuid)
returns table (
  anahtar text, kaynak text, hafta integer, yil integer, etd date, booking_no text, musteri text, cinsi text,
  konteyner integer, varis_limani text, cuval_markasi text, ambalaj text, acente text, liman text, ekipman text,
  bos_ekipman_tarihi date, ekipman_alim_yeri text, ardiyesiz_giris date, talimat_cutoff timestamptz, beyan_cutoff timestamptz,
  gemi text, sefer text, navlun numeric, lokal numeric, navlun_para text, dosya_no text, proforma_no text
)
language sql stable security definer set search_path = public as $$
  with rez as (
    select r.*, d.dosya_no, d.alici_firma, d.urun_tanimi, d.varis_limani, d.marka, d.ambalaj, d.navlun_tutari,
           d.lokal_masraf_tutari, d.para_birimi, d.proforma_no
    from rezervasyonlar r left join ihracat_dosyalari d on d.id = r.dosya_id
    where r.company_id = p_company
  ),
  gecmis as (
    select 'excel:' || p.id anahtar, 'excel'::text kaynak,
      coalesce(extract(week from r.gemi_kalkis_tarihi)::int, p.hafta) hafta,
      coalesce(extract(isoyear from r.gemi_kalkis_tarihi)::int, p.yil) yil,
      coalesce(r.gemi_kalkis_tarihi, p.etd) etd, coalesce(r.booking_no, p.booking_no) booking_no,
      p.musteri, p.cinsi, coalesce(r.konteyner_adedi, p.konteyner) konteyner, coalesce(p.varis_limani, r.varis_limani) varis_limani,
      coalesce(p.cuval_markasi, r.marka) cuval_markasi, coalesce(p.ambalaj, r.ambalaj) ambalaj,
      coalesce(nullif(r.acente_ismi, ''), p.acente) acente, coalesce(nullif(r.yuklenme_limani, ''), p.liman) liman, p.ekipman,
      coalesce(r.ekipman_alim_tarihi, p.bos_ekipman_tarihi) bos_ekipman_tarihi, r.ekipman_alim_yeri,
      coalesce(r.ardiyesiz_giris, p.ardiyesiz_giris) ardiyesiz_giris, coalesce(r.talimat_cutoff, p.talimat_cutoff) talimat_cutoff,
      coalesce(r.beyanname_cutoff, p.beyan_cutoff) beyan_cutoff, coalesce(nullif(r.gemi_adi, ''), p.gemi) gemi,
      coalesce(nullif(r.sefer_no, ''), p.sefer) sefer,
      coalesce(r.navlun_tutari, p.navlun_kont) navlun, coalesce(r.lokal_masraf_tutari, p.lokal_kont) lokal,
      coalesce(p.navlun_para, r.para_birimi, 'USD') navlun_para, r.dosya_no, r.proforma_no
    from sevkiyat_plani p left join rez r on r.id = p.rezervasyon_id
    where p.company_id = p_company
  ),
  -- Plana Excel'den gelmemis (yeni) rezervasyonlar
  yeni as (
    select 'rez:' || r.id, 'sistem'::text, extract(week from r.gemi_kalkis_tarihi)::int, extract(isoyear from r.gemi_kalkis_tarihi)::int,
      r.gemi_kalkis_tarihi, r.booking_no, r.alici_firma, r.urun_tanimi, r.konteyner_adedi, r.varis_limani, r.marka, r.ambalaj,
      r.acente_ismi, r.yuklenme_limani, null::text, r.ekipman_alim_tarihi, r.ekipman_alim_yeri, r.ardiyesiz_giris,
      r.talimat_cutoff, r.beyanname_cutoff, r.gemi_adi, r.sefer_no, r.navlun_tutari, r.lokal_masraf_tutari,
      coalesce(r.para_birimi, 'USD'), r.dosya_no, r.proforma_no
    from rez r
    where not exists (select 1 from sevkiyat_plani p where p.company_id = p_company
                      and (p.rezervasyon_id = r.id or siparis_anahtar(p.booking_no) = siparis_anahtar(r.booking_no)))
  )
  select * from gecmis union all select * from yeni
$$;
revoke all on function public.yukleme_plani_veri(uuid) from public, anon, authenticated;
grant execute on function public.yukleme_plani_veri(uuid) to service_role;

-- 4) Kullanici sarmalayicilari (yetki kontrollu)
create or replace function public.siparis_listesi()
returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or auth_company_id() is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')) then
    raise exception 'Yetkiniz yok.';
  end if;
  return query select to_jsonb(v) from siparis_listesi_veri(auth_company_id()) v;
end;
$$;
revoke all on function public.siparis_listesi() from public, anon;
grant execute on function public.siparis_listesi() to authenticated;

create or replace function public.yukleme_plani()
returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or auth_company_id() is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')) then
    raise exception 'Yetkiniz yok.';
  end if;
  return query select to_jsonb(v) from yukleme_plani_veri(auth_company_id()) v;
end;
$$;
revoke all on function public.yukleme_plani() from public, anon;
grant execute on function public.yukleme_plani() to authenticated;
