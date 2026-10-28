-- Odeme takibi + odeme hatirlatma maili kaydi (28.10.2026).
--
-- Kullanici: "ETD-ETA excelinde Vesaik / Seawaybill / Telex tikleri kaldirildiginda odemesi
-- alinmamislar ortaya cikiyor. Bu musteriler icin hatirlatma mail butonu eklemeliyiz ...
-- Mail gonderdigimizin takibini yapabilmeliyiz."
--
-- Bu migration TABLO EKLER ve rezervasyonlar'a BOS (null) kolon ekler; mevcut hicbir veri
-- DEGISMEZ. Durumlar kullanicinin kendisi tarafindan ETD/ETA sayfasindan (elle veya
-- "Excel'den guncelle" onizleme + onay) yazilir.
--
--   rezervasyonlar.konsimento_durumu : Excel "KONSIMENTO" sutunuyla AYNI secenekler
--       x | alindi | telex | seawaybill | vesaik | kargo | kuehne | acente   (null = girilmedi)
--       Odeme ALINDI = telex, seawaybill, vesaik (kullanici kurali). Digerleri / bos = bekliyor.
--   odeme_hatirlatmalari : gonderilen (Outlook ile acilip "gonderildi" onaylanan) her
--       hatirlatmanin degismez kaydi: kim, ne zaman, hangi sablon, kime, hangi metin.
--
-- Yazmalar SADECE fonksiyonlarla (etd_eta sayfa yetkisi + kendi sirketi kontrol edilir).

-- ---------------------------------------------------------------------------
-- 1) rezervasyonlar: konsimento / odeme durumu
-- ---------------------------------------------------------------------------
alter table public.rezervasyonlar
  add column if not exists konsimento_durumu text,
  add column if not exists konsimento_durumu_tarihi timestamptz,
  add column if not exists konsimento_durumu_kaynak text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rezervasyonlar_konsimento_durumu_kontrol') then
    alter table public.rezervasyonlar add constraint rezervasyonlar_konsimento_durumu_kontrol
      check (konsimento_durumu is null or konsimento_durumu in ('x', 'alindi', 'telex', 'seawaybill', 'vesaik', 'kargo', 'kuehne', 'acente'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rezervasyonlar_konsimento_kaynak_kontrol') then
    alter table public.rezervasyonlar add constraint rezervasyonlar_konsimento_kaynak_kontrol
      check (konsimento_durumu_kaynak is null or konsimento_durumu_kaynak in ('elle', 'excel'));
  end if;
end $$;

comment on column public.rezervasyonlar.konsimento_durumu is
  'ETD-ETA Excel KONSIMENTO sutunu. telex/seawaybill/vesaik = odeme alindi; diger/bos = odeme bekliyor (28.10.2026).';

-- ---------------------------------------------------------------------------
-- 2) Hatirlatma kaydi
-- ---------------------------------------------------------------------------
create table if not exists public.odeme_hatirlatmalari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rezervasyon_id uuid references public.rezervasyonlar(id) on delete set null,
  dosya_id uuid references public.ihracat_dosyalari(id) on delete set null,
  -- Kayit aninin fotografi (rezervasyon sonradan degisse / silinse de gecmis okunur)
  booking_no text check (booking_no is null or char_length(booking_no) <= 60),
  alici_firma text check (alici_firma is null or char_length(alici_firma) <= 300),
  sablon smallint not null check (sablon between 1 and 3),
  alici text not null check (char_length(btrim(alici)) between 3 and 500),
  cc text check (cc is null or char_length(cc) <= 1000),
  konu text not null check (char_length(btrim(konu)) between 3 and 300),
  govde text not null check (char_length(btrim(govde)) between 10 and 5000),
  gonderen_id uuid not null,
  gonderen_eposta text,
  gonderim_zamani timestamptz not null default now()
);
create index if not exists ix_odeme_hatirlatma_rez on public.odeme_hatirlatmalari (company_id, rezervasyon_id, gonderim_zamani desc);

comment on table public.odeme_hatirlatmalari is
  'Odeme hatirlatma mailleri (Outlook ile acilip gonderildigi onaylananlar). Degismez kayit (28.10.2026).';

drop trigger if exists denetim_odeme_hatirlatmalari on public.odeme_hatirlatmalari;
create trigger denetim_odeme_hatirlatmalari after insert or update or delete on public.odeme_hatirlatmalari
  for each row execute function public.denetim_tetikleyici();

alter table public.odeme_hatirlatmalari enable row level security;
drop policy if exists "ETD yetkilisi okur" on public.odeme_hatirlatmalari;
create policy "ETD yetkilisi okur" on public.odeme_hatirlatmalari for select to authenticated
  using (company_id = get_auth_company_id() and ic_sayfa_yetkisi('etd_eta'));
-- insert / update / delete politikasi YOK: yazma yalniz odeme_hatirlatma_kaydet() ile.
revoke all on table public.odeme_hatirlatmalari from anon;
revoke insert, update, delete on table public.odeme_hatirlatmalari from authenticated;
grant select on table public.odeme_hatirlatmalari to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Yazma fonksiyonlari
-- ---------------------------------------------------------------------------
-- Tek rezervasyon (elle secim). p_durum null -> "girilmedi".
create or replace function public.odeme_konsimento_guncelle(p_rezervasyon uuid, p_durum text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := get_auth_company_id();
  v_durum text := nullif(lower(btrim(coalesce(p_durum, ''))), '');
  v_sonuc jsonb;
begin
  if auth.uid() is null or v_sirket is null then raise exception 'Oturum bulunamadı.'; end if;
  if not ic_sayfa_yetkisi('etd_eta') then raise exception 'ETD/ETA yetkiniz yok.'; end if;
  if v_durum is not null and v_durum not in ('x', 'alindi', 'telex', 'seawaybill', 'vesaik', 'kargo', 'kuehne', 'acente') then
    raise exception 'Geçersiz konşimento durumu: %', p_durum;
  end if;

  update public.rezervasyonlar
     set konsimento_durumu = v_durum,
         konsimento_durumu_tarihi = case when v_durum is null then null else now() end,
         konsimento_durumu_kaynak = case when v_durum is null then null else 'elle' end
   where id = p_rezervasyon and company_id = v_sirket
  returning jsonb_build_object('id', id, 'konsimento_durumu', konsimento_durumu,
            'konsimento_durumu_tarihi', konsimento_durumu_tarihi, 'konsimento_durumu_kaynak', konsimento_durumu_kaynak)
    into v_sonuc;
  if v_sonuc is null then raise exception 'Rezervasyon bulunamadı.'; end if;
  return v_sonuc;
end; $function$;

-- Excel'den toplu (onizlemede kullanicinin onayladigi satirlar).
-- p_satirlar: [{"id": "<rezervasyon uuid>", "durum": "telex"}, ...]  (en fazla 500)
-- Tek islem: bir satir hataliysa HICBIRI yazilmaz.
create or replace function public.odeme_konsimento_toplu(p_satirlar jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := get_auth_company_id();
  v_satir jsonb;
  v_durum text;
  v_say integer := 0;
  v_n integer;
begin
  if auth.uid() is null or v_sirket is null then raise exception 'Oturum bulunamadı.'; end if;
  if not ic_sayfa_yetkisi('etd_eta') then raise exception 'ETD/ETA yetkiniz yok.'; end if;
  if jsonb_typeof(p_satirlar) <> 'array' then raise exception 'Geçersiz veri.'; end if;
  if jsonb_array_length(p_satirlar) > 500 then raise exception 'Tek seferde en fazla 500 satır.'; end if;

  for v_satir in select * from jsonb_array_elements(p_satirlar) loop
    v_durum := lower(btrim(coalesce(v_satir ->> 'durum', '')));
    if v_durum not in ('x', 'alindi', 'telex', 'seawaybill', 'vesaik', 'kargo', 'kuehne', 'acente') then
      raise exception 'Geçersiz konşimento durumu: %', v_satir ->> 'durum';
    end if;
    update public.rezervasyonlar
       set konsimento_durumu = v_durum, konsimento_durumu_tarihi = now(), konsimento_durumu_kaynak = 'excel'
     where id = (v_satir ->> 'id')::uuid and company_id = v_sirket
       and konsimento_durumu is distinct from v_durum;
    get diagnostics v_n = row_count;
    v_say := v_say + v_n;
  end loop;
  return v_say;
end; $function$;

-- Hatirlatma kaydi: gonderen / sirket / zaman SUNUCUDA belirlenir.
create or replace function public.odeme_hatirlatma_kaydet(
  p_rezervasyon uuid, p_sablon smallint, p_alici text, p_cc text, p_konu text, p_govde text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := get_auth_company_id();
  v_rez record;
  v_kayit public.odeme_hatirlatmalari;
begin
  if auth.uid() is null or v_sirket is null then raise exception 'Oturum bulunamadı.'; end if;
  if not ic_sayfa_yetkisi('etd_eta') then raise exception 'ETD/ETA yetkiniz yok.'; end if;

  select r.id, r.dosya_id, r.booking_no, d.alici_firma
    into v_rez
    from public.rezervasyonlar r
    left join public.ihracat_dosyalari d on d.id = r.dosya_id
   where r.id = p_rezervasyon and r.company_id = v_sirket;
  if v_rez.id is null then raise exception 'Rezervasyon bulunamadı.'; end if;

  insert into public.odeme_hatirlatmalari
    (company_id, rezervasyon_id, dosya_id, booking_no, alici_firma, sablon, alici, cc, konu, govde, gonderen_id, gonderen_eposta)
  values
    (v_sirket, v_rez.id, v_rez.dosya_id, v_rez.booking_no, v_rez.alici_firma, p_sablon,
     btrim(p_alici), nullif(btrim(coalesce(p_cc, '')), ''), btrim(p_konu), p_govde,
     auth.uid(), (select u.email from auth.users u where u.id = auth.uid()))
  returning * into v_kayit;
  return to_jsonb(v_kayit);
end; $function$;

revoke all on function public.odeme_konsimento_guncelle(uuid, text) from public, anon;
revoke all on function public.odeme_konsimento_toplu(jsonb) from public, anon;
revoke all on function public.odeme_hatirlatma_kaydet(uuid, smallint, text, text, text, text) from public, anon;
grant execute on function public.odeme_konsimento_guncelle(uuid, text) to authenticated;
grant execute on function public.odeme_konsimento_toplu(jsonb) to authenticated;
grant execute on function public.odeme_hatirlatma_kaydet(uuid, smallint, text, text, text, text) to authenticated;
