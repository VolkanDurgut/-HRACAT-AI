-- PAZAR (UNEX Satis) CRM - Dalga 3.2: Musterilerimiz karti + firma karti (10.11.2026)
--
-- Kullanici kararlari (10.11.2026):
--  - "Bizim kendi musterilerimiz farkli bir kartta olmali ... yaninda su an siparisleri var mi yok mu gorebilmeliyiz."
--  - "Proforma kesilen firmayi musteri sayayim mi?" -> "Hayir, REZERVASYON girildikten sonra musteri sayabilirsin."
--    -> musteriye donusum artik REZERVASYON ile (dosya / ana siparis acilmasi tek basina yetmez).
--  - Ad farkli yazilmis musteri / potansiyel elle BIRLESTIRILEBILIR (kart). Birlesen adin anahtari
--    hedefin ek_anahtarlar'ina eklenir: sonraki fuar yuklemesi / dosya ayni firmaya gelir.
--
-- Erisim: tum RPC'ler "pazar" yetkisi + ayni sirket. Tablolar istemciye yine SADECE OKUNUR.

-- 1) Ek anahtarlar (birlestirilmis adlar)
alter table public.pazar_firmalar add column if not exists ek_anahtarlar text[] not null default '{}';
create index if not exists pazar_firmalar_ek_anahtar_idx on public.pazar_firmalar using gin (ek_anahtarlar);

-- Bir ad anahtarinin sirketteki firmasi (ana anahtar ya da ek anahtar)
create or replace function public.pazar_firma_bul(p_company uuid, p_anahtar text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.pazar_firmalar
   where company_id = p_company and (anahtar = p_anahtar or p_anahtar = any(ek_anahtarlar))
   order by (anahtar = p_anahtar) desc
   limit 1;
$$;

-- 2) Musteriye donusum: ek anahtari da tanir
create or replace function public.pazar_musteri_isaretle(p_company uuid, p_alici text, p_tarih timestamptz default now())
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad text := trim(coalesce(p_alici, ''));
  v_anahtar text;
  v_firma uuid;
begin
  if p_company is null or v_ad = '' then return; end if;
  v_anahtar := public.pazar_anahtar(v_ad);
  if v_anahtar = '' then return; end if;
  v_firma := public.pazar_firma_bul(p_company, v_anahtar);
  if v_firma is not null then
    update public.pazar_firmalar
       set durum = 'musteri',
           alici_adi = coalesce(alici_adi, v_ad),
           musteri_olma_tarihi = least(coalesce(musteri_olma_tarihi, coalesce(p_tarih, now())), coalesce(p_tarih, now())),
           updated_at = now()
     where id = v_firma
       and (durum <> 'musteri' or alici_adi is null or musteri_olma_tarihi is null or musteri_olma_tarihi > coalesce(p_tarih, now()));
    return;
  end if;
  insert into public.pazar_firmalar (company_id, ad, anahtar, durum, kaynak, alici_adi, musteri_olma_tarihi)
  values (p_company, v_ad, v_anahtar, 'musteri', 'siparis', v_ad, coalesce(p_tarih, now()))
  on conflict (company_id, anahtar) do nothing;
end;
$$;

-- 3) Tetikleyiciler: REZERVASYON girilince musteri (dosya / ana siparis acilisi artik musteri yapmaz)
drop trigger if exists trg_pazar_dosya on public.ihracat_dosyalari;
drop trigger if exists trg_pazar_ana_siparis on public.ana_siparisler;

create or replace function public.pazar_rezervasyon_tetik()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_alici text;
begin
  select company_id, alici_firma into v_company, v_alici from public.ihracat_dosyalari where id = new.dosya_id;
  perform public.pazar_musteri_isaretle(v_company, v_alici, now());
  return null;
exception when others then
  -- CRM hicbir kosulda rezervasyon kaydini bozmaz
  raise warning 'pazar_rezervasyon_tetik: %', sqlerrm;
  return null;
end;
$$;

create or replace function public.pazar_dosya_alici_tetik()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.rezervasyonlar where dosya_id = new.id) then
    perform public.pazar_musteri_isaretle(new.company_id, new.alici_firma, now());
  end if;
  return null;
exception when others then
  raise warning 'pazar_dosya_alici_tetik: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists trg_pazar_rezervasyon on public.rezervasyonlar;
create trigger trg_pazar_rezervasyon after insert or update of dosya_id on public.rezervasyonlar
  for each row when (new.dosya_id is not null) execute function public.pazar_rezervasyon_tetik();
drop trigger if exists trg_pazar_dosya_alici on public.ihracat_dosyalari;
create trigger trg_pazar_dosya_alici after update of alici_firma on public.ihracat_dosyalari
  for each row when (new.alici_firma is distinct from old.alici_firma) execute function public.pazar_dosya_alici_tetik();

drop function if exists public.pazar_siparis_tetik();

-- 4) Fuar aktarma: birlestirilmis adlari (ek anahtar) tanir. Diger her sey 20261110040000 ile ayni.
create or replace function public.pazar_fuar_aktar(p_dosya_adi text, p_firmalar jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sirket uuid := auth_company_id();
  v_email text;
  f jsonb; k jsonb; c jsonb;
  v_ad text; v_anahtar text; v_ulke text; v_kaynak text;
  v_firma uuid; v_yeni boolean; v_durum text;
  v_kisi uuid; v_eposta text; v_tel text[];
  n_yeni int := 0; n_guncel int := 0; n_musteri int := 0; n_kisi int := 0; n_katilim int := 0; n_firma int := 0;
  v_sayi int;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('pazar') then raise exception 'Yetkisiz.'; end if;
  if jsonb_typeof(p_firmalar) <> 'array' then raise exception 'Gecersiz veri.'; end if;
  if jsonb_array_length(p_firmalar) > 5000 then raise exception 'En fazla 5000 firma.'; end if;
  begin v_email := lower(coalesce(auth.jwt() ->> 'email', '')); exception when others then v_email := null; end;

  for f in select * from jsonb_array_elements(p_firmalar) loop
    v_ad := left(trim(coalesce(f ->> 'ad', '')), 300);
    if v_ad = '' then continue; end if;
    v_anahtar := public.pazar_anahtar(v_ad);
    if v_anahtar = '' then continue; end if;
    n_firma := n_firma + 1;
    v_ulke := nullif(left(trim(coalesce(f ->> 'ulke', '')), 80), '');
    v_kaynak := case when v_ulke is null then null when f ->> 'ulke_kaynagi' in ('excel', 'telefon', 'eposta') then f ->> 'ulke_kaynagi' else 'excel' end;

    v_firma := public.pazar_firma_bul(v_sirket, v_anahtar);
    if v_firma is not null then
      update public.pazar_firmalar
         set ulke = coalesce(ulke, v_ulke),
             ulke_kaynagi = case when ulke is null then v_kaynak else ulke_kaynagi end,
             ulke_ham = coalesce(ulke_ham, nullif(left(trim(coalesce(f ->> 'ulke_ham', '')), 200), '')),
             updated_at = now()
       where id = v_firma
      returning durum into v_durum;
      v_yeni := false;
    else
      insert into public.pazar_firmalar (company_id, ad, anahtar, ulke, ulke_kaynagi, ulke_ham, durum, kaynak, olusturan)
      values (v_sirket, v_ad, v_anahtar, v_ulke, v_kaynak, nullif(left(trim(coalesce(f ->> 'ulke_ham', '')), 200), ''), 'potansiyel', 'fuar', auth.uid())
      returning id, durum into v_firma, v_durum;
      v_yeni := true;
    end if;

    if v_yeni then n_yeni := n_yeni + 1; else n_guncel := n_guncel + 1; end if;
    if v_durum = 'musteri' then n_musteri := n_musteri + 1; end if;

    for k in select * from jsonb_array_elements(coalesce(f -> 'kisiler', '[]'::jsonb)) loop
      v_eposta := nullif(lower(left(trim(coalesce(k ->> 'eposta', '')), 200)), '');
      select coalesce(array_agg(distinct left(x, 20)) filter (where x ~ '^[0-9]{6,20}$'), '{}') into v_tel
        from jsonb_array_elements_text(coalesce(k -> 'telefonlar', '[]'::jsonb)) as t(x);
      if v_eposta is null and cardinality(v_tel) = 0 and nullif(trim(coalesce(k ->> 'ad', '')), '') is null then continue; end if;

      v_kisi := null;
      if v_eposta is not null then
        select id into v_kisi from public.pazar_kisiler where firma_id = v_firma and lower(eposta) = v_eposta limit 1;
      elsif cardinality(v_tel) > 0 then
        select id into v_kisi from public.pazar_kisiler where firma_id = v_firma and telefonlar && v_tel limit 1;
      else
        select id into v_kisi from public.pazar_kisiler
         where firma_id = v_firma and eposta is null and cardinality(telefonlar) = 0
           and lower(ad) = lower(trim(k ->> 'ad')) limit 1;
      end if;

      if v_kisi is null then
        insert into public.pazar_kisiler (company_id, firma_id, ad, eposta, eposta_gecerli, telefonlar, whatsapp)
        values (v_sirket, v_firma, nullif(left(trim(coalesce(k ->> 'ad', '')), 200), ''), v_eposta,
                coalesce((k ->> 'eposta_gecerli')::boolean, true), v_tel,
                nullif(left(regexp_replace(coalesce(k ->> 'whatsapp', ''), '[^0-9]', '', 'g'), 20), ''));
        n_kisi := n_kisi + 1;
      else
        update public.pazar_kisiler
           set ad = coalesce(ad, nullif(left(trim(coalesce(k ->> 'ad', '')), 200), '')),
               telefonlar = (select coalesce(array_agg(distinct x), '{}') from unnest(telefonlar || v_tel) as u(x)),
               whatsapp = coalesce(whatsapp, nullif(left(regexp_replace(coalesce(k ->> 'whatsapp', ''), '[^0-9]', '', 'g'), 20), '')),
               updated_at = now()
         where id = v_kisi
           and (ad is null or not (telefonlar @> v_tel) or (whatsapp is null and coalesce(k ->> 'whatsapp', '') <> ''));
      end if;
    end loop;

    for c in select * from jsonb_array_elements(coalesce(f -> 'katilimlar', '[]'::jsonb)) loop
      if nullif(trim(coalesce(c ->> 'etiket', '')), '') is null then continue; end if;
      insert into public.pazar_fuar_katilimlari (company_id, firma_id, fuar, yil, donem, etiket, sayfa, satir)
      values (v_sirket, v_firma, left(coalesce(nullif(trim(c ->> 'fuar'), ''), 'Fuar'), 80),
              case when (c ->> 'yil') ~ '^[0-9]{4}$' then (c ->> 'yil')::int end,
              nullif(left(trim(coalesce(c ->> 'donem', '')), 40), ''),
              left(trim(c ->> 'etiket'), 120), nullif(left(trim(coalesce(c ->> 'sayfa', '')), 80), ''),
              case when (c ->> 'satir') ~ '^[0-9]{1,6}$' then (c ->> 'satir')::int end)
      on conflict (firma_id, etiket) do nothing;
      get diagnostics v_sayi = row_count;
      n_katilim := n_katilim + v_sayi;
    end loop;
  end loop;

  insert into public.pazar_ice_aktarimlari (company_id, dosya_adi, firma_sayisi, yeni_firma, guncellenen_firma, musteri_eslesen, yeni_kisi, yeni_katilim, olusturan, olusturan_email)
  values (v_sirket, left(coalesce(p_dosya_adi, ''), 200), n_firma, n_yeni, n_guncel, n_musteri, n_kisi, n_katilim, auth.uid(), v_email);

  return jsonb_build_object('firma', n_firma, 'yeni_firma', n_yeni, 'guncellenen_firma', n_guncel,
    'musteri_eslesen', n_musteri, 'yeni_kisi', n_kisi, 'yeni_katilim', n_katilim);
end;
$$;

-- 5) Musterilerin siparis verisi (Musterilerimiz karti): yalniz okunur, kopyalanmaz.
--    Her satirda "anahtar" = pazar_anahtar(alici_firma); istemci firmaya (anahtar + ek_anahtarlar) eslestirir.
create or replace function public.pazar_musteri_siparisleri()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sirket uuid := auth_company_id();
  v_anahtarlar text[];
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('pazar') then raise exception 'Yetkisiz.'; end if;
  select coalesce(array_agg(distinct a), '{}') into v_anahtarlar
    from (select anahtar a from public.pazar_firmalar where company_id = v_sirket and durum = 'musteri'
          union all
          select unnest(ek_anahtarlar) from public.pazar_firmalar where company_id = v_sirket and durum = 'musteri') x;

  return jsonb_build_object(
    'dosyalar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'anahtar', public.pazar_anahtar(d.alici_firma), 'dosya_no', d.dosya_no, 'durum', d.durum,
        'olusturma_tarihi', d.olusturma_tarihi, 'varis_limani', d.varis_limani, 'alici_adresi', d.alici_adresi,
        'ana_siparis_id', d.ana_siparis_id, 'urun_detaylari', d.urun_detaylari, 'toplam_konteyner', d.toplam_konteyner,
        'proforma_no', d.proforma_no) order by d.olusturma_tarihi desc)
      from public.ihracat_dosyalari d
      where d.company_id = v_sirket and public.pazar_anahtar(d.alici_firma) = any(v_anahtarlar)), '[]'::jsonb),
    'rezervasyonlar', coalesce((
      select jsonb_agg(jsonb_build_object('dosya_id', r.dosya_id, 'konteyner_adedi', r.konteyner_adedi))
      from public.rezervasyonlar r join public.ihracat_dosyalari d on d.id = r.dosya_id
      where d.company_id = v_sirket and public.pazar_anahtar(d.alici_firma) = any(v_anahtarlar)), '[]'::jsonb),
    'konteynerler', coalesce((
      select jsonb_agg(jsonb_build_object('dosya_id', k.dosya_id, 'dba_dosya_url', case when k.dba_dosya_url is null then null else 'var' end))
      from public.konteynerler k join public.ihracat_dosyalari d on d.id = k.dosya_id
      where d.company_id = v_sirket and d.durum = 'Açık' and public.pazar_anahtar(d.alici_firma) = any(v_anahtarlar)), '[]'::jsonb),
    'ana_siparisler', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'anahtar', public.pazar_anahtar(s.alici_firma), 'proforma_no', s.proforma_no, 'urun_tanimi', s.urun_tanimi,
        'toplam_mts', s.toplam_mts, 'urun_detaylari_master', s.urun_detaylari_master, 'tamamlandi', s.tamamlandi,
        'olusturma_tarihi', s.olusturma_tarihi))
      from public.ana_siparisler s
      where s.company_id = v_sirket and not coalesce(s.tamamlandi, false) and public.pazar_anahtar(s.alici_firma) = any(v_anahtarlar)), '[]'::jsonb)
  );
end;
$$;

-- 6) Firma karti duzenleme
create or replace function public.pazar_firma_guncelle(p_firma uuid, p_ulke text, p_notlar text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sirket uuid := auth_company_id();
  v_ulke text := nullif(left(trim(coalesce(p_ulke, '')), 80), '');
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('pazar') then raise exception 'Yetkisiz.'; end if;
  update public.pazar_firmalar
     set ulke = v_ulke,
         ulke_kaynagi = case when v_ulke is null then null when v_ulke is distinct from ulke then 'elle' else ulke_kaynagi end,
         notlar = nullif(left(trim(coalesce(p_notlar, '')), 2000), ''),
         updated_at = now()
   where id = p_firma and company_id = v_sirket;
  if not found then raise exception 'Firma bulunamadı.'; end if;
end;
$$;

-- Yetkili ekle / duzenle (p_kisi null = yeni). Silme yok: yanlis bilgi duzeltilir.
create or replace function public.pazar_kisi_kaydet(p_firma uuid, p_kisi uuid, p_ad text, p_eposta text, p_telefon text, p_whatsapp text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sirket uuid := auth_company_id();
  v_eposta text := nullif(lower(left(trim(coalesce(p_eposta, '')), 200)), '');
  v_tel text[];
  v_wa text := nullif(left(regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g'), 20), '');
  v_id uuid;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('pazar') then raise exception 'Yetkisiz.'; end if;
  if not exists (select 1 from public.pazar_firmalar where id = p_firma and company_id = v_sirket) then raise exception 'Firma bulunamadı.'; end if;
  if v_eposta is not null and v_eposta !~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$' then
    raise exception 'E-posta adresi geçersiz.';
  end if;
  select coalesce(array_agg(distinct left(n, 20)) filter (where length(n) between 7 and 20), '{}') into v_tel
    from (select regexp_replace(x, '[^0-9]', '', 'g') n from regexp_split_to_table(coalesce(p_telefon, ''), '[,;/]+') x) t;
  if v_eposta is null and cardinality(v_tel) = 0 and v_wa is null and nullif(trim(coalesce(p_ad, '')), '') is null then
    raise exception 'En az bir bilgi girin.';
  end if;
  if v_eposta is not null and exists (select 1 from public.pazar_kisiler where firma_id = p_firma and lower(eposta) = v_eposta and id is distinct from p_kisi) then
    raise exception 'Bu e-posta bu firmada zaten kayıtlı.';
  end if;

  if p_kisi is null then
    insert into public.pazar_kisiler (company_id, firma_id, ad, eposta, eposta_gecerli, telefonlar, whatsapp)
    values (v_sirket, p_firma, nullif(left(trim(coalesce(p_ad, '')), 200), ''), v_eposta, true, v_tel, v_wa)
    returning id into v_id;
  else
    update public.pazar_kisiler
       set ad = nullif(left(trim(coalesce(p_ad, '')), 200), ''), eposta = v_eposta, eposta_gecerli = true,
           telefonlar = v_tel, whatsapp = v_wa, updated_at = now()
     where id = p_kisi and firma_id = p_firma and company_id = v_sirket
    returning id into v_id;
    if v_id is null then raise exception 'Yetkili bulunamadı.'; end if;
  end if;
  return v_id;
end;
$$;

-- Iki kaydi birlestir (ayni firma, farkli yazilmis ad): kaynak -> hedef. Kaynagin yetkilileri ve fuar
-- katilimlari hedefe tasinir (ayni e-posta / ayni fuar tekrar edilmez), kaynagin anahtarlari hedefin
-- ek_anahtarlar'ina eklenir, kaynak kaydi silinir. Hedef musteri ise musteri kalir.
create or replace function public.pazar_firma_birlestir(p_kaynak uuid, p_hedef uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sirket uuid := auth_company_id();
  k public.pazar_firmalar;
  h public.pazar_firmalar;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('pazar') then raise exception 'Yetkisiz.'; end if;
  if p_kaynak = p_hedef then raise exception 'Aynı kayıt seçildi.'; end if;
  select * into k from public.pazar_firmalar where id = p_kaynak and company_id = v_sirket for update;
  select * into h from public.pazar_firmalar where id = p_hedef and company_id = v_sirket for update;
  if k.id is null or h.id is null then raise exception 'Firma bulunamadı.'; end if;

  -- Yetkililer: ayni e-posta hedefte varsa tasima (kaynaktaki kopya firma ile birlikte silinir)
  update public.pazar_kisiler s set firma_id = h.id, updated_at = now()
   where s.firma_id = k.id
     and (s.eposta is null or not exists (select 1 from public.pazar_kisiler t where t.firma_id = h.id and lower(t.eposta) = lower(s.eposta)));
  update public.pazar_fuar_katilimlari s set firma_id = h.id
   where s.firma_id = k.id
     and not exists (select 1 from public.pazar_fuar_katilimlari t where t.firma_id = h.id and t.etiket = s.etiket);

  update public.pazar_firmalar
     set ek_anahtarlar = (select coalesce(array_agg(distinct a), '{}') from unnest(h.ek_anahtarlar || k.ek_anahtarlar || array[k.anahtar]) as u(a) where a <> h.anahtar),
         ulke = coalesce(h.ulke, k.ulke),
         ulke_kaynagi = case when h.ulke is null then k.ulke_kaynagi else h.ulke_kaynagi end,
         ulke_ham = coalesce(h.ulke_ham, k.ulke_ham),
         durum = case when h.durum = 'musteri' or k.durum = 'musteri' then 'musteri' else 'potansiyel' end,
         alici_adi = coalesce(h.alici_adi, k.alici_adi),
         musteri_olma_tarihi = case when h.musteri_olma_tarihi is null then k.musteri_olma_tarihi
                                    when k.musteri_olma_tarihi is null then h.musteri_olma_tarihi
                                    else least(h.musteri_olma_tarihi, k.musteri_olma_tarihi) end,
         notlar = nullif(concat_ws(E'\n', h.notlar, k.notlar), ''),
         updated_at = now()
   where id = h.id;

  delete from public.pazar_firmalar where id = k.id;
end;
$$;

revoke all on function public.pazar_firma_bul(uuid, text) from public, anon, authenticated;
revoke all on function public.pazar_musteri_isaretle(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.pazar_rezervasyon_tetik() from public, anon, authenticated;
revoke all on function public.pazar_dosya_alici_tetik() from public, anon, authenticated;
revoke all on function public.pazar_fuar_aktar(text, jsonb) from public, anon;
revoke all on function public.pazar_musteri_siparisleri() from public, anon;
revoke all on function public.pazar_firma_guncelle(uuid, text, text) from public, anon;
revoke all on function public.pazar_kisi_kaydet(uuid, uuid, text, text, text, text) from public, anon;
revoke all on function public.pazar_firma_birlestir(uuid, uuid) from public, anon;
grant execute on function public.pazar_fuar_aktar(text, jsonb) to authenticated;
grant execute on function public.pazar_musteri_siparisleri() to authenticated;
grant execute on function public.pazar_firma_guncelle(uuid, text, text) to authenticated;
grant execute on function public.pazar_kisi_kaydet(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.pazar_firma_birlestir(uuid, uuid) to authenticated;
