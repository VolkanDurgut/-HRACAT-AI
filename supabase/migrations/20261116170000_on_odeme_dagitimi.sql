-- ÖN ÖDEME DAĞITIMI (16.11.2026, kullanıcı isteği).
-- "Ön ödeme tutarı proformadaki ön ödeme yüzdesine göre evraklara-sevkiyatlara bölünmeli; sipariş takibi yapılan
-- dosyalarda geçerli. Toplam bedel yüklenen konteynere ve anlaşmadaki yüzdeye göre hesaplanmalı. Euro da gelebilir."
--
-- Kural (yalnız SİPARİŞ TAKİBİ: proformanın en az bir dosyası ana_siparisler'e bağlı; tek seferlik dosyaya dokunulmaz):
--   havuz  = siparis_on_odemeler.tutar (sipariş dövizinde) ya da farklı dövizle geldiyse karsilik_tutar
--   oran   = siparis_on_odemeler.oran; boşsa dosyanın ödeme şartından ("%30 ADVANCE ...")
--   pay    = dosya toplam_tutar (yüklenen malın bedeli) x oran, en fazla havuzda kalan; dosyalar açılış sırasıyla
--   kilitli dosya (Kapalı / fatura talimatı gönderildi / avans elle girildi) mevcut avansını korur, havuzdan düşer
--   sonuç ham_veri.avans_tutari'na yazılır (fatura ÖDENECEK TUTAR buradan) + ham_veri.avans_dagitim (iz)
-- Tetik: ön ödeme kaydı değişince ve dosya açılınca / tutarı, proformesi, siparişi, durumu değişince.

alter table public.siparis_on_odemeler
  add column if not exists oran numeric,
  add column if not exists karsilik_tutar numeric;

do $$ begin
  alter table public.siparis_on_odemeler add constraint siparis_on_odemeler_oran_ck check (oran is null or (oran > 0 and oran <= 100));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.siparis_on_odemeler add constraint siparis_on_odemeler_karsilik_ck check (karsilik_tutar is null or (karsilik_tutar > 0 and karsilik_tutar < 100000000));
exception when duplicate_object then null; end $$;

-- "%30 ADVANCE", "30% ADVANCE", "% 20 ADVANCE PAYMENT", "%50 PREPAYMENT", "%25 DEPOSIT" -> 30 / 30 / 20 / 50 / 25; yoksa null.
-- lib/on-odeme.ts onOdemeOrani ile AYNI kural.
create or replace function public.on_odeme_orani_oku(p text)
returns numeric
language sql
immutable
set search_path to 'public'
as $$
  select case when x.v > 0 and x.v <= 100 then x.v end
  from (
    select replace(coalesce(
      (regexp_match(upper(coalesce(p, '')), '%\s*([0-9]{1,3}(?:[.,][0-9]{1,2})?)\s*(?:ADVANCE|PRE-?PAYMENT|DEPOSIT|PREPAID|DOWN\s*PAYMENT)'))[1],
      (regexp_match(upper(coalesce(p, '')), '([0-9]{1,3}(?:[.,][0-9]{1,2})?)\s*%\s*(?:ADVANCE|PRE-?PAYMENT|DEPOSIT|PREPAID|DOWN\s*PAYMENT)'))[1]
    ), ',', '.')::numeric as v
  ) x
$$;

-- Hesap (yazmaz). Dönüş: { durum, anahtar, havuz, havuz_para, para, oran, oran_kaynak, dagitilan, kalan, dosyalar[] }
-- durum: tamam | havuz_yok | takip_degil | oran_yok | kur_yok | para_karisik
create or replace function public.on_odeme_dagitim(p_sirket uuid, p_anahtar text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  o public.siparis_on_odemeler%rowtype;
  d record;
  v_para text;
  v_havuz numeric;
  v_oran numeric;
  v_oran_kaynak text;
  v_kalan numeric;
  v_pay numeric;
  v_mevcut numeric;
  v_kilit text;
  v_satirlar jsonb := '[]'::jsonb;
  v_takip boolean := false;
  v_dosya_sayisi int := 0;
  v_para_sayisi int := 0;
  v_durum text := 'tamam';
begin
  if p_sirket is null or p_anahtar is null then return jsonb_build_object('durum', 'havuz_yok'); end if;
  select * into o from public.siparis_on_odemeler where company_id = p_sirket and proforma_anahtar = p_anahtar;

  select count(*), bool_or(d2.ana_siparis_id is not null), min(coalesce(d2.para_birimi, 'USD')), count(distinct coalesce(d2.para_birimi, 'USD'))
    into v_dosya_sayisi, v_takip, v_para, v_para_sayisi
  from public.ihracat_dosyalari d2
  left join public.ana_siparisler a on a.id = d2.ana_siparis_id
  where d2.company_id = p_sirket
    and (public.siparis_anahtar(d2.proforma_no) = p_anahtar or public.siparis_anahtar(a.proforma_no) = p_anahtar);

  if not coalesce(v_takip, false) then v_durum := 'takip_degil';
  elsif o.id is null or not coalesce(o.alindi, false) or coalesce(o.tutar, 0) <= 0 then v_durum := 'havuz_yok';
  elsif v_para_sayisi > 1 then v_durum := 'para_karisik';
  end if;

  if v_durum = 'tamam' then
    v_havuz := case when coalesce(o.para_birimi, 'USD') = v_para then o.tutar else o.karsilik_tutar end;
    if v_havuz is null then v_durum := 'kur_yok'; end if;
  end if;

  v_oran := o.oran;
  v_oran_kaynak := case when o.oran is not null then 'elle' end;
  if v_oran is null then
    select public.on_odeme_orani_oku(d2.odeme_sekli) into v_oran
    from public.ihracat_dosyalari d2
    left join public.ana_siparisler a on a.id = d2.ana_siparis_id
    where d2.company_id = p_sirket
      and (public.siparis_anahtar(d2.proforma_no) = p_anahtar or public.siparis_anahtar(a.proforma_no) = p_anahtar)
      and public.on_odeme_orani_oku(d2.odeme_sekli) is not null
    order by d2.olusturma_tarihi, d2.dosya_no
    limit 1;
    if v_oran is not null then v_oran_kaynak := 'odeme_sekli'; end if;
  end if;
  if v_durum = 'tamam' and v_oran is null then v_durum := 'oran_yok'; end if;

  v_kalan := coalesce(v_havuz, 0);
  for d in
    select d2.id, d2.dosya_no, d2.durum, d2.toplam_tutar, d2.fatura_talimati_gonderildi, d2.ham_veri
    from public.ihracat_dosyalari d2
    left join public.ana_siparisler a on a.id = d2.ana_siparis_id
    where d2.company_id = p_sirket
      and (public.siparis_anahtar(d2.proforma_no) = p_anahtar or public.siparis_anahtar(a.proforma_no) = p_anahtar)
    order by d2.olusturma_tarihi, d2.dosya_no
  loop
    v_mevcut := case when jsonb_typeof(d.ham_veri -> 'avans_tutari') = 'number' then (d.ham_veri ->> 'avans_tutari')::numeric end;
    v_kilit := case
      when coalesce(d.ham_veri ->> 'avans_elle', 'false') = 'true' then 'elle'
      when coalesce(d.fatura_talimati_gonderildi, false) then 'fatura_talimati'
      when d.durum ilike 'kapal%' then 'kapali'
    end;
    if v_durum <> 'tamam' then
      v_pay := null;
    elsif v_kilit is not null then
      v_pay := coalesce(v_mevcut, 0);
      v_kalan := v_kalan - v_pay;
    else
      v_pay := least(round(coalesce(d.toplam_tutar, 0) * v_oran / 100, 2), greatest(round(v_kalan, 2), 0));
      v_kalan := v_kalan - v_pay;
    end if;
    v_satirlar := v_satirlar || jsonb_build_object(
      'id', d.id, 'dosya_no', d.dosya_no, 'durum', d.durum, 'tutar', d.toplam_tutar,
      'mevcut', v_mevcut, 'pay', v_pay, 'kilit', v_kilit, 'dagitimli', coalesce(d.ham_veri ? 'avans_dagitim', false));
  end loop;

  return jsonb_build_object(
    'durum', v_durum, 'anahtar', p_anahtar, 'para', v_para,
    'havuz', v_havuz, 'havuz_tutar', o.tutar, 'havuz_para', o.para_birimi, 'karsilik', o.karsilik_tutar,
    'oran', v_oran, 'oran_kaynak', v_oran_kaynak,
    'dagitilan', case when v_durum = 'tamam' then round(v_havuz - v_kalan, 2) end,
    'kalan', case when v_durum = 'tamam' then round(v_kalan, 2) end,
    'dosyalar', v_satirlar);
end;
$$;

-- Yazar: kilitsiz dosyalarin avansini hesaba esitler. Havuz kalkarsa (geri alindi) dagitimla yazilmis avans temizlenir.
create or replace function public.on_odeme_dagit(p_sirket uuid, p_anahtar text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v jsonb := public.on_odeme_dagitim(p_sirket, p_anahtar);
  r jsonb;
begin
  for r in select * from jsonb_array_elements(coalesce(v -> 'dosyalar', '[]'::jsonb)) loop
    continue when r ->> 'kilit' is not null;
    if v ->> 'durum' = 'tamam' then
      if (r ->> 'pay')::numeric is distinct from (r ->> 'mevcut')::numeric or not (r ->> 'dagitimli')::boolean then
        update public.ihracat_dosyalari
        set ham_veri = coalesce(ham_veri, '{}'::jsonb)
          || jsonb_build_object('avans_tutari', (r ->> 'pay')::numeric,
                                'avans_dagitim', jsonb_build_object('proforma', p_anahtar, 'oran', (v ->> 'oran')::numeric,
                                  'havuz', (v ->> 'havuz')::numeric, 'para', v ->> 'para', 'tarih', now()))
        where id = (r ->> 'id')::uuid and company_id = p_sirket;
      end if;
    elsif v ->> 'durum' = 'havuz_yok' and (r ->> 'dagitimli')::boolean then
      update public.ihracat_dosyalari
      set ham_veri = (coalesce(ham_veri, '{}'::jsonb) - 'avans_dagitim') || jsonb_build_object('avans_tutari', null)
      where id = (r ->> 'id')::uuid and company_id = p_sirket;
    end if;
  end loop;
  return v;
end;
$$;

revoke all on function public.on_odeme_dagitim(uuid, text) from public, anon, authenticated;
revoke all on function public.on_odeme_dagit(uuid, text) from public, anon, authenticated;
grant execute on function public.on_odeme_dagitim(uuid, text) to service_role;
grant execute on function public.on_odeme_dagit(uuid, text) to service_role;
grant execute on function public.on_odeme_orani_oku(text) to authenticated, service_role;

-- Tetikler -------------------------------------------------------------------------------------------------------
create or replace function public.on_odeme_kaydi_tetik()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.on_odeme_dagit(new.company_id, new.proforma_anahtar);
  return null;
end;
$$;

drop trigger if exists trg_on_odeme_dagit on public.siparis_on_odemeler;
create trigger trg_on_odeme_dagit
  after insert or update of alindi, tutar, para_birimi, oran, karsilik_tutar on public.siparis_on_odemeler
  for each row execute function public.on_odeme_kaydi_tetik();

create or replace function public.on_odeme_dosya_tetik()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  k text;
begin
  if pg_trigger_depth() > 1 then return null; end if;   -- dagitimin kendi yazmasi tekrar tetiklemesin
  for k in
    select distinct x from unnest(array[
      public.siparis_anahtar(new.proforma_no),
      (select public.siparis_anahtar(a.proforma_no) from public.ana_siparisler a where a.id = new.ana_siparis_id),
      case when tg_op = 'UPDATE' then public.siparis_anahtar(old.proforma_no) end,
      case when tg_op = 'UPDATE' then (select public.siparis_anahtar(a.proforma_no) from public.ana_siparisler a where a.id = old.ana_siparis_id) end
    ]) x where x is not null
  loop
    if exists (select 1 from public.siparis_on_odemeler o where o.company_id = new.company_id and o.proforma_anahtar = k) then
      perform public.on_odeme_dagit(new.company_id, k);
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_on_odeme_dosya on public.ihracat_dosyalari;
create trigger trg_on_odeme_dosya
  after insert or update of toplam_tutar, proforma_no, ana_siparis_id, durum, fatura_talimati_gonderildi on public.ihracat_dosyalari
  for each row execute function public.on_odeme_dosya_tetik();

-- RPC'ler (istemci) ----------------------------------------------------------------------------------------------
-- Kayit: eski imza kaldirilir (ayni adla iki surum PostgREST'te belirsizlik yaratir); yeni parametreler opsiyonel.
drop function if exists public.siparis_on_odeme_kaydet(text, boolean, numeric, text, date);
create or replace function public.siparis_on_odeme_kaydet(
  p_proforma_no text, p_alindi boolean, p_tutar numeric default null, p_para_birimi text default 'USD', p_tarih date default null,
  p_oran numeric default null, p_karsilik numeric default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := auth_company_id();
  v_anahtar text := siparis_anahtar(p_proforma_no);
  v_kim text;
  v_bugun date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if auth.uid() is null or v_sirket is null or not ic_sayfa_yetkisi('proformalar') then
    raise exception 'Yetkiniz yok.';
  end if;
  if v_anahtar is null or p_alindi is null then raise exception 'Proforma no gerekli.'; end if;
  if p_alindi then
    if p_tutar is null or p_tutar <= 0 or p_tutar >= 100000000 then raise exception 'Ön ödeme tutarını girin.'; end if;
    if coalesce(p_para_birimi, 'USD') not in ('USD', 'EUR', 'TRY') then raise exception 'Geçersiz para birimi.'; end if;
    if p_tarih is not null and (p_tarih > v_bugun or p_tarih < v_bugun - 730) then raise exception 'Geçersiz ödeme tarihi.'; end if;
    if p_oran is not null and (p_oran <= 0 or p_oran > 100) then raise exception 'Ön ödeme yüzdesi 0 ile 100 arasında olmalı.'; end if;
    if p_karsilik is not null and (p_karsilik <= 0 or p_karsilik >= 100000000) then raise exception 'Geçersiz karşılık tutarı.'; end if;
  end if;
  begin v_kim := lower(coalesce(auth.jwt() ->> 'email', '')); exception when others then v_kim := null; end;
  insert into siparis_on_odemeler (company_id, proforma_anahtar, alindi, tarih, tutar, para_birimi, oran, karsilik_tutar, isaretleyen, updated_at)
  values (v_sirket, v_anahtar, p_alindi, case when p_alindi then coalesce(p_tarih, v_bugun) end,
          case when p_alindi then round(p_tutar, 2) end, case when p_alindi then coalesce(p_para_birimi, 'USD') end,
          case when p_alindi then round(p_oran, 2) end, case when p_alindi then round(p_karsilik, 2) end, left(v_kim, 120), now())
  on conflict (company_id, proforma_anahtar) do update set
    alindi = excluded.alindi, tarih = excluded.tarih, tutar = excluded.tutar, para_birimi = excluded.para_birimi,
    oran = excluded.oran, karsilik_tutar = excluded.karsilik_tutar,
    isaretleyen = excluded.isaretleyen, updated_at = now();
  return jsonb_build_object('ok', true, 'alindi', p_alindi, 'dagitim', public.on_odeme_dagitim(v_sirket, v_anahtar));
end;
$$;
revoke all on function public.siparis_on_odeme_kaydet(text, boolean, numeric, text, date, numeric, numeric) from public, anon;
grant execute on function public.siparis_on_odeme_kaydet(text, boolean, numeric, text, date, numeric, numeric) to authenticated;

-- Okuma: sipariş ekranı (önizleme) ve dosyanın Ödeme kartı. Yalnız kendi şirketi; ham tutar bilgisi dosyada zaten görünür.
create or replace function public.siparis_on_odeme_dagilimi(p_proforma_no text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_sirket uuid := auth_company_id();
begin
  if auth.uid() is null or v_sirket is null then raise exception 'Yetkiniz yok.'; end if;
  return public.on_odeme_dagitim(v_sirket, siparis_anahtar(p_proforma_no));
end;
$$;
revoke all on function public.siparis_on_odeme_dagilimi(text) from public, anon;
grant execute on function public.siparis_on_odeme_dagilimi(text) to authenticated;
