-- Odeme takibi: Excel yukleme kaydi = hatirlatma "turu" (28.10.2026).
--
-- Kullanici: "Excel her eklendiginde odeme alinmasi gerekenler tespit edilmeli. Gonderilen
-- mailler gozukmeli. Bir dahaki cumartesi excel yuklendiginde sayfa kendini hatasiz ve eksiksiz
-- guncellemeli. Ayni musteri tekrar listedeyse 2. mesaj taslagi gonderilmeli; sira ile."
--
-- Bu migration YALNIZ tablo + fonksiyon EKLER; mevcut veri DEGISMEZ.
--   odeme_excel_yuklemeleri : her onaylanan Excel yuklemesi (kim, ne zaman, dosya adi, kac satir
--     guncellendi, ozet). En son kayit = guncel hatirlatma TURUNUN baslangici (istemci, son
--     yuklemeden sonra hatirlatma gonderilmemis bekleyenleri "bu tur hatirlatilacak" sayar).
--   odeme_excel_yukleme_kaydet() : konsimento durumlarini (odeme_konsimento_toplu ile AYNI kural)
--     gunceller + yuklemeyi kaydeder; TEK islem. Degisiklik olmasa da kayit yapilabilir (yeni tur).

create table if not exists public.odeme_excel_yuklemeleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  dosya_adi text check (dosya_adi is null or char_length(dosya_adi) <= 255),
  guncellenen integer not null default 0 check (guncellenen >= 0),
  ozet jsonb not null default '{}'::jsonb check (jsonb_typeof(ozet) = 'object' and pg_column_size(ozet) <= 60000),
  yukleyen_id uuid not null,
  yukleyen_eposta text,
  yukleme_zamani timestamptz not null default now()
);
create index if not exists ix_odeme_excel_yukleme on public.odeme_excel_yuklemeleri (company_id, yukleme_zamani desc);

comment on table public.odeme_excel_yuklemeleri is
  'ETD-ETA Excel yuklemeleri; en son kayit hatirlatma turunun baslangici (28.10.2026).';

drop trigger if exists denetim_odeme_excel_yuklemeleri on public.odeme_excel_yuklemeleri;
create trigger denetim_odeme_excel_yuklemeleri after insert or update or delete on public.odeme_excel_yuklemeleri
  for each row execute function public.denetim_tetikleyici();

alter table public.odeme_excel_yuklemeleri enable row level security;
drop policy if exists "ETD yetkilisi okur" on public.odeme_excel_yuklemeleri;
create policy "ETD yetkilisi okur" on public.odeme_excel_yuklemeleri for select to authenticated
  using (company_id = get_auth_company_id() and ic_sayfa_yetkisi('etd_eta'));
revoke all on table public.odeme_excel_yuklemeleri from anon;
revoke insert, update, delete on table public.odeme_excel_yuklemeleri from authenticated;
grant select on table public.odeme_excel_yuklemeleri to authenticated;

create or replace function public.odeme_excel_yukleme_kaydet(p_dosya_adi text, p_satirlar jsonb, p_ozet jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sirket uuid := get_auth_company_id();
  v_say integer := 0;
  v_kayit public.odeme_excel_yuklemeleri;
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

  insert into public.odeme_excel_yuklemeleri (company_id, dosya_adi, guncellenen, ozet, yukleyen_id, yukleyen_eposta)
  values (v_sirket, nullif(left(btrim(coalesce(p_dosya_adi, '')), 255), ''), v_say, p_ozet,
          auth.uid(), (select u.email from auth.users u where u.id = auth.uid()))
  returning * into v_kayit;
  return to_jsonb(v_kayit);
end; $function$;

revoke all on function public.odeme_excel_yukleme_kaydet(text, jsonb, jsonb) from public, anon;
grant execute on function public.odeme_excel_yukleme_kaydet(text, jsonb, jsonb) to authenticated;
