-- 21.11.2026 IS AKISI REVIZELERI (kullanici: "Resmen bir is akisi olusturmaya basliyoruz")
--
--  5) ETD-ETA Excel'i ETA'yi da yazar: odeme_excel_yukleme_kaydet'e p_etalar (istege bagli) eklendi. Eskiden aktarim
--     YALNIZ konsimento durumunu yaziyordu; ETA'lar hep elle girilmisti (sistemde ETA yazan bir surum hic olmadi).
--     Kural: ETA, rezervasyonun ETD'sinden once olamaz ve ETD'den en fazla 180 gun sonra olabilir (hatali yil yazimi).
--  1) Silinen proformalar: proformalar tablosunun denetim kaydi (denetim_kayitlari, DELETE) silinen satiri taslagiyla
--     saklar. proforma_silinenler() musteri bazinda listeler; proforma_geri_yukle() ayni numarayla geri acar.
--  3) Kalan odeme: siparis_defteri.bakiye_odendi / bakiye_tutar (Harun Bey'in Excel'indeki "Bakiye" sutunu: DOGRU =
--     bakiye alindi, tutar = kalan). siparis_listesi_aktar bu iki alani yazar (bos hucre mevcut degeri silmez).
--     siparis_bakiye_durumu(): Excel bakiyesi + sistem dosyalarinin konsimento durumlari (odeme alindi mi).
--  4) Yukleme plani: plan_bekleyen_aksiyonlari(proforma no listesi) - rezervasyon bekleyen siparis icin sistem
--     proformasi, rezervasyonsuz acik dosya, devam eden ana siparis (Excel satiri eslestirilmisse eslesen proforma).
-- Hicbir mevcut kayit silinmez / degismez (yalniz yeni sutunlar ve fonksiyonlar).

-- ============================================================================ 5) ETA
drop function if exists public.odeme_excel_yukleme_kaydet(text, jsonb, jsonb);
create or replace function public.odeme_excel_yukleme_kaydet(p_dosya_adi text, p_satirlar jsonb, p_ozet jsonb, p_etalar jsonb default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := get_auth_company_id();
  v_say integer := 0;
  v_eta_say integer := 0;
  v_kayit public.odeme_excel_yuklemeleri;
  v_e jsonb;
  v_id uuid;
  v_eta date;
  v_etd date;
  v_eski date;
begin
  if auth.uid() is null or v_sirket is null then raise exception 'Oturum bulunamadı.'; end if;
  if not ic_sayfa_yetkisi('etd_eta') then raise exception 'ETD/ETA yetkiniz yok.'; end if;
  if p_ozet is null or jsonb_typeof(p_ozet) <> 'object' then raise exception 'Geçersiz özet.'; end if;

  -- Durum guncellemesi: odeme_konsimento_toplu ile ayni dogrulama (gecersiz deger -> hepsi geri alinir)
  if p_satirlar is not null and jsonb_typeof(p_satirlar) = 'array' and jsonb_array_length(p_satirlar) > 0 then
    v_say := public.odeme_konsimento_toplu(p_satirlar);
  elsif p_satirlar is not null and jsonb_typeof(p_satirlar) <> 'array' then
    raise exception 'Geçersiz veri.';
  end if;

  -- 21.11.2026 ETA: [{id: rezervasyon_id, eta: 'YYYY-MM-DD'}]. Gecersiz satir -> tum islem geri alinir.
  if p_etalar is not null then
    if jsonb_typeof(p_etalar) <> 'array' then raise exception 'Geçersiz ETA verisi.'; end if;
    if jsonb_array_length(p_etalar) > 2000 then raise exception 'Bir seferde en fazla 2000 ETA güncellenebilir.'; end if;
    for v_e in select * from jsonb_array_elements(p_etalar) loop
      begin
        v_id := (v_e->>'id')::uuid;
        v_eta := (v_e->>'eta')::date;
      exception when others then
        raise exception 'Geçersiz ETA satırı.';
      end;
      if v_id is null or v_eta is null then raise exception 'Geçersiz ETA satırı.'; end if;
      select r.gemi_kalkis_tarihi, r.eta into v_etd, v_eski from rezervasyonlar r where r.id = v_id and r.company_id = v_sirket for update;
      if not found then raise exception 'Sevkiyat bulunamadı. Sayfayı yenileyip tekrar deneyin.'; end if;
      if v_etd is not null and (v_eta < v_etd or v_eta > v_etd + 180) then
        raise exception 'ETA (%) ETD (%) ile uyumsuz.', to_char(v_eta, 'DD.MM.YYYY'), to_char(v_etd, 'DD.MM.YYYY');
      end if;
      if v_eski is distinct from v_eta then
        update rezervasyonlar set eta = v_eta, eta_guncelleme_tarihi = now() where id = v_id;
        v_eta_say := v_eta_say + 1;
      end if;
    end loop;
  end if;

  insert into public.odeme_excel_yuklemeleri (company_id, dosya_adi, guncellenen, ozet, yukleyen_id, yukleyen_eposta)
  values (v_sirket, nullif(left(btrim(coalesce(p_dosya_adi, '')), 255), ''), v_say, p_ozet || jsonb_build_object('eta_guncellenen', v_eta_say),
          auth.uid(), (select u.email from auth.users u where u.id = auth.uid()))
  returning * into v_kayit;
  return to_jsonb(v_kayit) || jsonb_build_object('eta_guncellenen', v_eta_say);
end; $function$;

revoke all on function public.odeme_excel_yukleme_kaydet(text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.odeme_excel_yukleme_kaydet(text, jsonb, jsonb, jsonb) to authenticated;

-- ============================================================================ 1) Silinen proformalar
-- Ayni numarayla yeniden olusturulmus / geri yuklenmis proforma listede gorunmez; numara basina en son silme.
create or replace function public.proforma_silinenler(p_limit integer default 200)
 returns table(denetim_id uuid, proforma_no text, alici_unvan text, tarih date, para_birimi text, toplam numeric, toplam_mts numeric,
               silinme timestamptz, silen text, urunler text)
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('proformalar') then
    raise exception 'Yetkiniz yok.';
  end if;
  return query
  select x.id, x.no, x.alici, x.tarih, x.para, x.toplam, x.mts, x.silinme, x.silen, x.urunler
  from (
    select distinct on (d.eski_veri->>'proforma_no')
      d.id, d.eski_veri->>'proforma_no' as no, d.eski_veri->>'alici_unvan' as alici,
      nullif(d.eski_veri->>'tarih', '')::date as tarih, coalesce(d.eski_veri->>'para_birimi', 'USD') as para,
      nullif(d.eski_veri->>'toplam', '')::numeric as toplam, nullif(d.eski_veri->>'toplam_mts', '')::numeric as mts,
      d.olusturma_tarihi as silinme, d.degistiren_email as silen,
      (select string_agg(distinct btrim(k->>'urun'), ' · ') from jsonb_array_elements(
         case when jsonb_typeof(d.eski_veri->'taslak'->'kalemler') = 'array' then d.eski_veri->'taslak'->'kalemler' else '[]'::jsonb end) k
       where nullif(btrim(k->>'urun'), '') is not null) as urunler
    from denetim_kayitlari d
    where d.company_id = v_sirket and d.tablo_adi = 'proformalar' and d.islem = 'DELETE'
      and nullif(d.eski_veri->>'proforma_no', '') is not null
      and jsonb_typeof(d.eski_veri->'taslak') = 'object'
      and not exists (select 1 from proformalar p where p.company_id = v_sirket and p.proforma_no = d.eski_veri->>'proforma_no')
    order by d.eski_veri->>'proforma_no', d.olusturma_tarihi desc
  ) x
  order by x.silinme desc
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
end; $function$;

revoke all on function public.proforma_silinenler(integer) from public, anon;
grant execute on function public.proforma_silinenler(integer) to authenticated;

-- Geri yukleme: silinen satir AYNEN (taslak, tarih, olusturan) geri yazilir; Siparis Listesi'nde "Onay bekleyen" olur.
create or replace function public.proforma_geri_yukle(p_denetim uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
  v_eposta text := lower(coalesce(auth.jwt()->>'email', ''));
  v_e jsonb;
  v_no text;
  v_id uuid;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('proformalar') then
    raise exception 'Yetkiniz yok.';
  end if;
  select d.eski_veri into v_e from denetim_kayitlari d
  where d.id = p_denetim and d.company_id = v_sirket and d.tablo_adi = 'proformalar' and d.islem = 'DELETE';
  if v_e is null or jsonb_typeof(v_e->'taslak') <> 'object' then
    raise exception 'Silinen proforma kaydı bulunamadı.';
  end if;
  v_no := v_e->>'proforma_no';
  perform pg_advisory_xact_lock(hashtext('proforma_geri_yukle:' || v_sirket::text || ':' || v_no));
  if exists (select 1 from proformalar p where p.company_id = v_sirket and p.proforma_no = v_no) then
    raise exception '% numaralı proforma zaten kayıtlı; Kayıtlı Proformalar''dan açın.', v_no;
  end if;
  begin
    v_id := (v_e->>'id')::uuid;
  exception when others then
    v_id := null;
  end;
  if v_id is null or exists (select 1 from proformalar p where p.id = v_id) then
    v_id := gen_random_uuid();
  end if;
  insert into proformalar (id, company_id, proforma_no, alici_unvan, tarih, para_birimi, toplam, toplam_mts, taslak,
                           olusturan, olusturan_email, guncelleyen_email, created_at)
  values (v_id, v_sirket, v_no, v_e->>'alici_unvan', (v_e->>'tarih')::date, coalesce(v_e->>'para_birimi', 'USD'),
          coalesce(nullif(v_e->>'toplam', '')::numeric, 0), coalesce(nullif(v_e->>'toplam_mts', '')::numeric, 0), v_e->'taslak',
          nullif(v_e->>'olusturan', '')::uuid, v_e->>'olusturan_email', nullif(v_eposta, ''),
          coalesce(nullif(v_e->>'created_at', '')::timestamptz, now()));
  return jsonb_build_object('id', v_id, 'proforma_no', v_no);
end; $function$;

revoke all on function public.proforma_geri_yukle(uuid) from public, anon;
grant execute on function public.proforma_geri_yukle(uuid) to authenticated;

-- ============================================================================ 3) Kalan odeme (Excel "Bakiye")
alter table public.siparis_defteri add column if not exists bakiye_odendi boolean;
alter table public.siparis_defteri add column if not exists bakiye_tutar numeric;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'siparis_defteri_bakiye_tutar_check') then
    alter table public.siparis_defteri add constraint siparis_defteri_bakiye_tutar_check check (bakiye_tutar is null or bakiye_tutar >= 0);
  end if;
end $$;
comment on column public.siparis_defteri.bakiye_odendi is 'Excel "Bakiye" sutunu: DOGRU = bakiye alindi (21.11.2026)';
comment on column public.siparis_defteri.bakiye_tutar is 'Excel "Bakiye" sutununa yazilan kalan tutar (21.11.2026)';

-- siparis_listesi_aktar: bakiye alanlari (yama; fonksiyonun geri kalani aynen)
do $$
declare
  v_f text := pg_get_functiondef('public.siparis_listesi_aktar(text,jsonb)'::regprocedure);
  v_d text[][] := array[
    array[$a$marka, paketleme, durum, kaynak, guncelleyen)$a$,
          $a$marka, paketleme, durum, kaynak, guncelleyen, bakiye_odendi, bakiye_tutar)$a$],
    array[$a$nullif(btrim(v_satir->>'paketleme'), ''), v_durum, 'excel', v_eposta);$a$,
          $a$nullif(btrim(v_satir->>'paketleme'), ''), v_durum, 'excel', v_eposta,
        (v_satir->>'bakiye_odendi')::boolean, case when (v_satir->>'bakiye_odendi')::boolean then null else (v_satir->>'bakiye_tutar')::numeric end);$a$],
    array[$a$v_y.durum := case when v_m.durum = 'iptal' then 'iptal' else v_durum end;$a$,
          $a$v_y.durum := case when v_m.durum = 'iptal' then 'iptal' else v_durum end;
    -- 21.11.2026 Excel "Bakiye": bos hucre mevcut degeri silmez; DOGRU (alindi) kalan tutari temizler
    v_y.bakiye_odendi := coalesce((v_satir->>'bakiye_odendi')::boolean, v_m.bakiye_odendi);
    v_y.bakiye_tutar := case when v_y.bakiye_odendi then null else coalesce((v_satir->>'bakiye_tutar')::numeric, v_m.bakiye_tutar) end;$a$],
    array[$a$v_y.liman, v_y.bl_no, v_y.marka, v_y.paketleme, v_y.durum)$a$,
          $a$v_y.liman, v_y.bl_no, v_y.marka, v_y.paketleme, v_y.durum, v_y.bakiye_odendi, v_y.bakiye_tutar)$a$],
    array[$a$v_m.liman, v_m.bl_no, v_m.marka, v_m.paketleme, v_m.durum) then$a$,
          $a$v_m.liman, v_m.bl_no, v_m.marka, v_m.paketleme, v_m.durum, v_m.bakiye_odendi, v_m.bakiye_tutar) then$a$],
    array[$a$durum = v_y.durum,
        guncelleyen = v_eposta$a$,
          $a$durum = v_y.durum,
        bakiye_odendi = v_y.bakiye_odendi, bakiye_tutar = v_y.bakiye_tutar, guncelleyen = v_eposta$a$]
  ];
  i int;
begin
  if position('bakiye_odendi' in v_f) > 0 then
    raise notice 'siparis_listesi_aktar zaten yamali';
    return;
  end if;
  for i in 1 .. array_length(v_d, 1) loop
    if (length(v_f) - length(replace(v_f, v_d[i][1], ''))) / length(v_d[i][1]) <> 1 then
      raise exception 'siparis_listesi_aktar yamasi: parca % tam bir kez bulunmali', i;
    end if;
    v_f := replace(v_f, v_d[i][1], v_d[i][2]);
  end loop;
  execute v_f;
end $$;

create or replace function public.siparis_bakiye_durumu()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')) then
    raise exception 'Yetkiniz yok.';
  end if;
  return jsonb_build_object(
    'defter', coalesce((select jsonb_agg(jsonb_build_object('anahtar', 'excel:' || s.id, 'odendi', s.bakiye_odendi, 'tutar', s.bakiye_tutar))
                        from siparis_defteri s
                        where s.company_id = v_sirket and (s.bakiye_odendi is not null or s.bakiye_tutar is not null)), '[]'::jsonb),
    'dosyalar', coalesce((select jsonb_agg(jsonb_build_object('dosya_no', d.dosya_no,
                            'konsimento', (select jsonb_agg(r.konsimento_durumu) from rezervasyonlar r where r.dosya_id = d.id)))
                          from ihracat_dosyalari d
                          where d.company_id = v_sirket
                            and exists (select 1 from rezervasyonlar r where r.dosya_id = d.id and r.konsimento_durumu is not null)), '[]'::jsonb));
end; $function$;

revoke all on function public.siparis_bakiye_durumu() from public, anon;
grant execute on function public.siparis_bakiye_durumu() to authenticated;

-- ============================================================================ 4) Yukleme plani: rezervasyon bekleyenler
create or replace function public.plan_bekleyen_aksiyonlari(p_proformalar text[])
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := auth_company_id();
begin
  if auth.uid() is null or v_sirket is null or not (ic_sayfa_yetkisi('proformalar') or ic_sayfa_yetkisi('analiz')) then
    raise exception 'Yetkiniz yok.';
  end if;
  if coalesce(array_length(p_proformalar, 1), 0) > 500 then raise exception 'En fazla 500 proforma.'; end if;
  -- Excel satiri sistem proformasiyla eslestirilmisse (siparis_eslesmeleri; or. UNEXSIM061126 -> UNEXBSC061126) o proforma
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'proforma_no', x.no,
      'proforma_id', (select p.id from proformalar p where p.company_id = v_sirket and siparis_anahtar(p.proforma_no) in (x.k, x.ek)
                      order by (siparis_anahtar(p.proforma_no) = x.ek) desc nulls last, p.updated_at desc limit 1),
      'dosya', (select jsonb_build_object('id', d.id, 'dosya_no', d.dosya_no) from ihracat_dosyalari d
                where d.company_id = v_sirket and d.durum = 'Açık' and siparis_anahtar(d.proforma_no) in (x.k, x.ek)
                  and not exists (select 1 from rezervasyonlar r where r.dosya_id = d.id and nullif(btrim(r.booking_no), '') is not null)
                order by d.olusturma_tarihi desc limit 1),
      'ana_siparis', (select jsonb_build_object('id', a.id, 'proforma_no', a.proforma_no) from ana_siparisler a
                      where a.company_id = v_sirket and not coalesce(a.tamamlandi, false) and siparis_anahtar(a.proforma_no) in (x.k, x.ek)
                      order by a.olusturma_tarihi desc limit 1)))
    from (
      select y.no, siparis_anahtar(y.no) as k,
        (select siparis_anahtar(e.proforma_anahtar) from siparis_eslesmeleri e join siparis_defteri s on s.id = e.defter_id
         where e.company_id = v_sirket and s.company_id = v_sirket and siparis_anahtar(s.proforma_no) = siparis_anahtar(y.no)
         order by e.created_at desc limit 1) as ek
      from (select distinct btrim(u) as no from unnest(p_proformalar) u where nullif(btrim(u), '') is not null) y
    ) x), '[]'::jsonb);
end; $function$;

revoke all on function public.plan_bekleyen_aksiyonlari(text[]) from public, anon;
grant execute on function public.plan_bekleyen_aksiyonlari(text[]) to authenticated;
