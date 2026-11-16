-- ============================================================================
-- OPERASYON BAGLANTILARI (16.11.2026, kullanici onayi)
-- ============================================================================
-- 1) Fatura -> talimat isareti: faturasi kesilmis / yuklenmis dosyada "fatura talimati gonderildi" kendiliginden isaretlenir
--    (saglik taramasinda yanlis alarm: IHR-2026-0112). Yalniz fatura alanlari DOLDUGU anda; elle kaldirilan isarete
--    dokunulmaz. Gecis: faturasi olup isareti bos ACIK dosyalar isaretlenir (otomatik fatura talimati maili artik gitmez;
--    fatura zaten kesilmis).
-- 2) Rezervasyon formu onerisi: booking no yukleme planinda varsa gemi / sefer / kesimler / acente / ekipman bos alanlara
--    onerilir; navlun icin plan navlunu ve navlun mailindeki anlasma (kabul) rakamlari onerilir. Hicbir kayit yazilmaz.
-- 3) Proforma (CFR / CIF): limanin guncel teklifleri (son 60 gun, acente basina son 20'DC USD) ve son anlasma.
-- 4) ETD degisimi: yukleme plani aktariminda booking'in ETD'si degisirse bagli rezervasyonun ETD'si plana esitlenir, ETA'si
--    planin kaydigi gun kadar kaydirilir, olay etd_degisimleri'ne yazilir; Kontrol Merkezi tutarsizlik kartinda 7 gun gorunur.
-- Not: Bu dosya gercek musteri verisi icermez.
-- ============================================================================

-- 1) FATURA -> TALIMAT ISARETI -----------------------------------------------------------------------------------
create or replace function public.fatura_talimat_isaretle_tetik()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(new.fatura_talimati_gonderildi, false) then return new; end if;
  if (nullif(btrim(coalesce(new.fatura_no, '')), '') is not null or new.fatura_dosya_url is not null)
     and (tg_op = 'INSERT' or (nullif(btrim(coalesce(old.fatura_no, '')), '') is null and old.fatura_dosya_url is null)) then
    new.fatura_talimati_gonderildi := true;
  end if;
  return new;
end;
$$;
revoke all on function public.fatura_talimat_isaretle_tetik() from public, anon, authenticated;
drop trigger if exists trg_fatura_talimat_isaretle on public.ihracat_dosyalari;
create trigger trg_fatura_talimat_isaretle
  before insert or update of fatura_no, fatura_dosya_url on public.ihracat_dosyalari
  for each row execute function public.fatura_talimat_isaretle_tetik();

update public.ihracat_dosyalari
set fatura_talimati_gonderildi = true
where durum in ('Açık', 'Acik') and not coalesce(fatura_talimati_gonderildi, false)
  and (nullif(btrim(coalesce(fatura_no, '')), '') is not null or fatura_dosya_url is not null);

-- 2) REZERVASYON FORMU ONERISI ------------------------------------------------------------------------------------
create or replace function public.rezervasyon_onerisi(p_booking text, p_varis_limani text default null, p_etd date default null, p_konteyner int default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c uuid := auth_company_id();
  v_bk text := booking_anahtar(p_booking);
  p record;
  v_plan jsonb;
  v_p_liman text;
  v_p_etd date;
  v_liman text;
  v_etd date;
  v_navlun jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or c is null then raise exception 'Yetkiniz yok.'; end if;
  if v_bk is not null then
    select * into p from sevkiyat_plani s where s.company_id = c and booking_anahtar(s.booking_no) = v_bk order by s.etd desc nulls last limit 1;
    if found then
      v_plan := jsonb_build_object('booking_no', p.booking_no, 'gemi_adi', p.gemi, 'sefer_no', p.sefer, 'acente_ismi', p.acente,
        'gemi_kalkis_tarihi', p.etd, 'talimat_cutoff', p.talimat_cutoff, 'beyanname_cutoff', p.beyan_cutoff,
        'ekipman_alim_tarihi', p.bos_ekipman_tarihi, 'ardiyesiz_giris', p.ardiyesiz_giris, 'yuklenme_limani', p.liman,
        'varis_limani', p.varis_limani, 'konteyner_adedi', p.konteyner, 'musteri', p.musteri,
        'navlun_tutari', p.navlun_kont, 'lokal_masraf_tutari', p.lokal_kont, 'navlun_para', p.navlun_para);
      v_p_liman := p.varis_limani; v_p_etd := p.etd;
    end if;
  end if;
  v_liman := ad_esi(c, 'liman', siparis_liman_anahtar(coalesce(nullif(btrim(p_varis_limani), ''), v_p_liman)));
  v_etd := coalesce(p_etd, v_p_etd, (now() at time zone 'Europe/Istanbul')::date);
  if v_liman is not null then
    select coalesce(jsonb_agg(x order by x.sira, x.tarih desc), '[]'::jsonb) into v_navlun from (
      select t.tutar, coalesce(t.para_birimi, 'USD') para, t.tarih, t.armator, coalesce(t.acente, m.acente) acente, m.konu,
        case when v_bk is not null and position(v_bk in upper(regexp_replace(coalesce(m.konu, ''), '\s', '', 'g'))) > 0 then 'booking'
             when coalesce(m.konu, '') ~* 'REZERVASYON\s*TALEB' and p_konteyner is not null and (regexp_match(upper(m.konu), '(\d{1,3})\s*[*X×]\s*(20|40|45)'))[1]::int = p_konteyner then 'rezervasyon'
             else 'liman' end eslesme,
        case when v_bk is not null and position(v_bk in upper(regexp_replace(coalesce(m.konu, ''), '\s', '', 'g'))) > 0 then 1
             when coalesce(m.konu, '') ~* 'REZERVASYON\s*TALEB' then 2 else 3 end sira
      from navlun_teklifleri t left join navlun_mesajlari m on m.company_id = t.company_id and m.mesaj_id = t.mesaj_id
      where t.company_id = c and t.tur = 'kabul' and t.tutar > 0
        and ad_esi(c, 'liman', siparis_liman_anahtar(t.liman_anahtar)) = v_liman
        and t.tarih::date between v_etd - 90 and v_etd
      order by sira, t.tarih desc
      limit 3) x;
  end if;
  return jsonb_build_object('plan', v_plan, 'navlun', v_navlun);
end;
$$;
revoke all on function public.rezervasyon_onerisi(text, text, date, int) from public, anon;
grant execute on function public.rezervasyon_onerisi(text, text, date, int) to authenticated;

-- 3) PROFORMA: LIMANIN GUNCEL NAVLUN REFERANSI -------------------------------------------------------------------
create or replace function public.navlun_liman_referansi(p_liman text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c uuid := auth_company_id();
  v_l text;
begin
  if auth.uid() is null or c is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('navlun') or ic_sayfa_yetkisi('analiz')) then
    raise exception 'Yetkiniz yok.';
  end if;
  v_l := ad_esi(c, 'liman', siparis_liman_anahtar(p_liman));
  if v_l is null then return jsonb_build_object('liman', null, 'teklifler', '[]'::jsonb, 'anlasma', null); end if;
  return jsonb_build_object('liman', v_l,
    'teklifler', coalesce((
      select jsonb_agg(jsonb_build_object('acente', x.acente, 'armator', x.armator, 'tutar', x.tutar, 'tarih', x.tarih, 'lokal_dahil', x.lokal_dahil,
        'free_time_gun', x.free_time_gun) order by x.tutar)
      from (select distinct on (coalesce(t.acente, '?'), coalesce(t.armator, '?')) t.acente, t.armator, t.tutar, t.tarih, t.lokal_dahil, t.free_time_gun
            from navlun_teklifleri t
            where t.company_id = c and t.tur in ('teklif', 'karsi_teklif') and t.tutar > 0 and coalesce(t.ekipman, '20DC') = '20DC'
              and coalesce(t.para_birimi, 'USD') = 'USD' and t.tarih > now() - interval '60 days'
              and ad_esi(c, 'liman', siparis_liman_anahtar(t.liman_anahtar)) = v_l
            order by coalesce(t.acente, '?'), coalesce(t.armator, '?'), t.tarih desc) x), '[]'::jsonb),
    'anlasma', (select jsonb_build_object('tutar', t.tutar, 'tarih', t.tarih, 'armator', t.armator, 'acente', coalesce(t.acente, m.acente))
      from navlun_teklifleri t left join navlun_mesajlari m on m.company_id = t.company_id and m.mesaj_id = t.mesaj_id where t.company_id = c and t.tur = 'kabul' and t.tutar > 0 and coalesce(t.para_birimi, 'USD') = 'USD'
        and ad_esi(c, 'liman', siparis_liman_anahtar(t.liman_anahtar)) = v_l order by t.tarih desc limit 1));
end;
$$;
revoke all on function public.navlun_liman_referansi(text) from public, anon;
grant execute on function public.navlun_liman_referansi(text) to authenticated;

-- 4) ETD DEGISIMI -------------------------------------------------------------------------------------------------
create table if not exists public.etd_degisimleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  booking_no text,
  musteri text,
  eski_etd date,
  yeni_etd date,
  rezervasyon_id uuid,
  dosya_id uuid,
  rezervasyon_guncellendi boolean not null default false,
  olusturma timestamptz not null default now()
);
create index if not exists etd_degisimleri_sirket_tarih on public.etd_degisimleri (company_id, olusturma desc);
alter table public.etd_degisimleri enable row level security;
drop policy if exists etd_degisimleri_oku on public.etd_degisimleri;
create policy etd_degisimleri_oku on public.etd_degisimleri for select to authenticated
  using (company_id = auth_company_id() and (ic_sayfa_yetkisi('analiz') or ic_sayfa_yetkisi('etd_eta')));
revoke insert, update, delete on public.etd_degisimleri from anon, authenticated;

create or replace function public.plan_etd_tetik()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rid uuid; v_did uuid; v_rez_etd date; v_eta date;
  v_guncel boolean := false;
begin
  -- Hata asla aktarimi durdurmaz
  begin
    select x.id, x.dosya_id, x.gemi_kalkis_tarihi, x.eta into v_rid, v_did, v_rez_etd, v_eta from rezervasyonlar x
    where x.company_id = new.company_id
      and (x.id = new.rezervasyon_id or (booking_anahtar(new.booking_no) is not null and booking_anahtar(x.booking_no) = booking_anahtar(new.booking_no)))
    order by (x.id = new.rezervasyon_id) desc nulls last limit 1;
    if v_rid is not null and v_rez_etd is distinct from new.etd then
      -- ETD plana esitlenir; ETA, planin kaydigi gun kadar kayar
      update rezervasyonlar set gemi_kalkis_tarihi = new.etd,
        eta = case when v_eta is not null then v_eta + (new.etd - old.etd) else null end
      where id = v_rid;
      v_guncel := true;
    end if;
    insert into etd_degisimleri (company_id, booking_no, musteri, eski_etd, yeni_etd, rezervasyon_id, dosya_id, rezervasyon_guncellendi)
    values (new.company_id, new.booking_no, new.musteri, old.etd, new.etd, v_rid, v_did, v_guncel);
  exception when others then
    raise warning 'plan_etd_tetik: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.plan_etd_tetik() from public, anon, authenticated;
drop trigger if exists trg_plan_etd on public.sevkiyat_plani;
create trigger trg_plan_etd
  after update of etd on public.sevkiyat_plani
  for each row when (old.etd is not null and new.etd is not null and old.etd is distinct from new.etd)
  execute function public.plan_etd_tetik();

-- Kontrol Merkezi: ETD degisimleri de listelenir (f)
create or replace function public.veri_tutarsizliklari()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c uuid := auth_company_id();
  v_sip jsonb;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
  v_kalem jsonb := '[]'::jsonb;
  v_plan_son timestamptz; v_sip_son timestamptz; v_nav_son timestamptz;
begin
  if auth.uid() is null or c is null or not ic_sayfa_yetkisi('analiz') then raise exception 'Yetkiniz yok.'; end if;

  -- Siparis listesi bir kez okunur (iki kontrol kullanir)
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_sip from siparis_listesi_veri(c) x
  where x.durum in ('onay_bekliyor', 'on_odeme_alindi', 'rezervasyonlu');

  -- a) Plan ile rezervasyon ETD farki (yaklasan / acik)
  v_kalem := v_kalem || coalesce((
    select jsonb_agg(jsonb_build_object('tur', 'etd_farki', 'onem', 'orta',
      'baslik', coalesce(p.musteri, '—') || ' · ' || coalesce(p.booking_no, ''),
      'ayrinti', 'Yükleme planı ETD ' || to_char(p.etd, 'DD.MM.YYYY') || ' · rezervasyon ' || to_char(r.gemi_kalkis_tarihi, 'DD.MM.YYYY')
                 || coalesce(' · ' || d.dosya_no, ''),
      'baglanti', case when d.id is not null then '/dosya/' || d.id end) order by p.etd)
    from sevkiyat_plani p join rezervasyonlar r on r.id = p.rezervasyon_id left join ihracat_dosyalari d on d.id = r.dosya_id
    where p.company_id = c and p.etd is not null and r.gemi_kalkis_tarihi is not null and p.etd <> r.gemi_kalkis_tarihi
      and greatest(p.etd, r.gemi_kalkis_tarihi) >= v_bugun and coalesce(d.durum, '') not ilike 'kapal%'), '[]'::jsonb);

  -- b) Ayni siparis iki numarayla: sistem proformasi ~ Excel satiri (ayni firma, ayni miktar), eslestirilmemis
  v_kalem := v_kalem || coalesce((
    select jsonb_agg(jsonb_build_object('tur', 'cift_siparis', 'onem', 'orta',
      'baslik', s1.firma, 'ayrinti', 'Sistem ' || s1.proforma_no || ' ↔ Excel ' || s2.proforma_no || ' · ' || trim(to_char(s1.miktar_mt, 'FM999G990D00')) || ' MT'
        || ' — aynı siparişse Siparişler''de eşleştirin', 'baglanti', '/siparisler'))
    from jsonb_to_recordset(v_sip) s1(anahtar text, kaynak text, proforma_no text, proforma_tarihi date, firma text, miktar_mt numeric, durum text, eslesik_proforma text)
    join jsonb_to_recordset(v_sip) s2(anahtar text, kaynak text, proforma_no text, proforma_tarihi date, firma text, miktar_mt numeric, durum text, eslesik_proforma text) on s2.kaynak = 'excel' and s1.kaynak = 'sistem' and s1.anahtar like 'proforma:%'
      and siparis_anahtar(s2.proforma_no) <> siparis_anahtar(s1.proforma_no) and s2.eslesik_proforma is null
      and s1.durum in ('onay_bekliyor', 'on_odeme_alindi', 'rezervasyonlu') and s2.durum in ('onay_bekliyor', 'on_odeme_alindi', 'rezervasyonlu')
      and s1.miktar_mt is not null and abs(coalesce(s2.miktar_mt, -1) - s1.miktar_mt) < 0.5
      and (ad_esi(c, 'firma', siparis_firma_anahtar(s1.firma)) = ad_esi(c, 'firma', siparis_firma_anahtar(s2.firma))
           or (least(char_length(siparis_firma_anahtar(s1.firma)), char_length(siparis_firma_anahtar(s2.firma))) >= 6
               and (siparis_firma_anahtar(s1.firma) like siparis_firma_anahtar(s2.firma) || '%' or siparis_firma_anahtar(s2.firma) like siparis_firma_anahtar(s1.firma) || '%')))
      and (s1.proforma_tarihi is null or s2.proforma_tarihi is null or abs(s1.proforma_tarihi - s2.proforma_tarihi) <= 45)), '[]'::jsonb);

  -- c) Yaklasan booking (30 gun), navlunu ne dosyada ne planda ne anlasma mailinde (ayni liman, ETD'den 90 gun once)
  v_kalem := v_kalem || coalesce((
    select jsonb_agg(jsonb_build_object('tur', 'navlunsuz_booking', 'onem', 'orta',
      'baslik', coalesce(y.musteri, '—') || ' · ' || coalesce(y.varis_limani, '—'),
      'ayrinti', 'ETD ' || to_char(y.etd, 'DD.MM.YYYY') || ' · ' || coalesce(y.konteyner::text, '?') || ' kont. · ' || coalesce(y.acente, 'acente ?') || ' — navlun bilgisi yok',
      'baglanti', '/navlun') order by y.etd)
    from yukleme_plani_veri(c) y
    where y.kaynak in ('excel', 'sistem') and y.booking_no is not null and y.etd between v_bugun and v_bugun + 30
      and coalesce(y.navlun, 0) = 0
      and not exists (select 1 from navlun_teklifleri t where t.company_id = c and t.tur = 'kabul' and t.tutar > 0
        and ad_esi(c, 'liman', siparis_liman_anahtar(t.liman_anahtar)) = ad_esi(c, 'liman', siparis_liman_anahtar(y.varis_limani))
        and t.tarih::date between y.etd - 90 and y.etd)), '[]'::jsonb);

  -- d) On odemesi alinmis, 7 gunden uzun suredir booking'i yok
  v_kalem := v_kalem || coalesce((
    select jsonb_agg(jsonb_build_object('tur', 'bekleyen_siparis', 'onem', case when v_bugun - s.on_odeme_tarihi > 14 then 'yuksek' else 'orta' end,
      'baslik', coalesce(s.firma, '—') || ' · ' || coalesce(s.proforma_no, ''),
      'ayrinti', (v_bugun - s.on_odeme_tarihi) || ' gündür booking yok · ' || coalesce(s.bekleyen_konteyner, s.konteyner, 0) || ' kont. · ' || coalesce(s.liman, '—'),
      'baglanti', '/siparisler') order by s.on_odeme_tarihi)
    from jsonb_to_recordset(v_sip) s(firma text, proforma_no text, durum text, on_odeme_tarihi date, bekleyen_konteyner int, konteyner int, liman text)
    where s.durum = 'on_odeme_alindi' and s.on_odeme_tarihi is not null and s.on_odeme_tarihi <= v_bugun - 7), '[]'::jsonb);

  -- f) 16.11.2026: son 7 gunde yukleme planinda ETD'si degisen booking'ler (rezervasyon tarihi otomatik kaydirildi)
  v_kalem := v_kalem || coalesce((
    select jsonb_agg(jsonb_build_object('tur', 'etd_degisti', 'onem', 'bilgi',
      'baslik', coalesce(e.musteri, '—') || ' · ' || coalesce(e.booking_no, ''),
      'ayrinti', 'ETD ' || to_char(e.eski_etd, 'DD.MM.YYYY') || ' → ' || to_char(e.yeni_etd, 'DD.MM.YYYY')
        || case when e.rezervasyon_guncellendi then ' · rezervasyon ve hatırlatma tarihleri kaydırıldı' when e.rezervasyon_id is null then ' · sistemde rezervasyonu yok' else ' · rezervasyon zaten bu tarihte' end
        || coalesce(' · ' || d.dosya_no, '') || ' · ' || to_char(e.olusturma at time zone 'Europe/Istanbul', 'DD.MM HH24:MI'),
      'baglanti', case when d.id is not null then '/dosya/' || d.id end) order by e.olusturma desc)
    from etd_degisimleri e left join ihracat_dosyalari d on d.id = e.dosya_id
    where e.company_id = c and e.olusturma > now() - interval '7 days'), '[]'::jsonb);

  -- e) Kaynaklarin tazeligi
  select max(tarih) into v_plan_son from sevkiyat_plani_aktarimlari where company_id = c;
  select max(tarih) into v_sip_son from siparis_defteri_aktarimlari where company_id = c;
  select max(created_at) into v_nav_son from navlun_mesajlari where company_id = c;
  if v_plan_son is null or v_plan_son < now() - interval '3 days' then
    v_kalem := v_kalem || jsonb_build_array(jsonb_build_object('tur', 'kaynak_eski', 'onem', 'yuksek', 'baslik', 'Yükleme planı güncel değil',
      'ayrinti', coalesce('Son yükleme ' || to_char(v_plan_son at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'), 'Hiç yüklenmemiş') || ' — raporlar eski planla hesaplanıyor', 'baglanti', '/siparisler'));
  end if;
  if v_sip_son is null or v_sip_son < now() - interval '3 days' then
    v_kalem := v_kalem || jsonb_build_array(jsonb_build_object('tur', 'kaynak_eski', 'onem', 'orta', 'baslik', 'Sipariş listesi güncel değil',
      'ayrinti', coalesce('Son yükleme ' || to_char(v_sip_son at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI'), 'Hiç yüklenmemiş'), 'baglanti', '/siparisler'));
  end if;
  if v_nav_son is not null and v_nav_son < now() - interval '1 day' then
    v_kalem := v_kalem || jsonb_build_array(jsonb_build_object('tur', 'kaynak_eski', 'onem', 'orta', 'baslik', 'Navlun mailleri okunmuyor',
      'ayrinti', 'Son kayıt ' || to_char(v_nav_son at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') || ' — Apps Script tetikleyicisini kontrol edin', 'baglanti', '/navlun'));
  end if;

  return jsonb_build_object('tarih', now(), 'plan_son', v_plan_son, 'siparis_son', v_sip_son, 'navlun_son', v_nav_son, 'kalemler', v_kalem);
end;
$$;
revoke all on function public.veri_tutarsizliklari() from public, anon;
grant execute on function public.veri_tutarsizliklari() to authenticated;
