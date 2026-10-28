-- ============================================================================
-- SATIN ALMA: MUKERRER KONTROLU + "DAHA ONCE SIPARIS VERILEN URUNLER" (28.10.2026)
-- ============================================================================
-- Kullanici: "farkli departmanlarda ayni urunler geliyor"; "Her manuel olarak yazilan
-- urun daha onceden siparis verilen urunler olarak otomatik kayit altina alinsin."
--  1) sa_urun_norm: karsilastirma anahtari (Turkce harf katlama, kucuk harf, harf/rakam
--     disi bosluk). Uygulamadaki urunNorm (_shared/satin-alma.ts) ile BIREBIR ayni.
--  2) satin_alma_urunleri: sirket basina urun gecmisi. Form GONDERILINCE (taslak ->
--     bekliyor) kalemleri tetikleyiciyle eklenir / kullanim sayisi artar. Test formlari
--     eklenmez. Mevcut gonderilmis (test olmayan) formlar ice aktarilir.
--  3) sa_token_urunler: talep formundaki oneri listesi (girissiz, token).
--  4) sa_token_kalem_ekle: ayni formda ayni urun (anahtar ayni) ikinci kez eklenemez.
--  5) sa_token_kalem_miktar: taslaktaki kalemin miktarini guncelle ("miktari artir").
-- Mevcut kalem / liste verisine DOKUNMAZ (yalniz okuma + yeni tablo).
-- ============================================================================

create or replace function public.sa_urun_norm(p text)
 returns text
 language sql
 immutable
 parallel safe
 set search_path to 'public'
as $function$
  select btrim(regexp_replace(
    lower(translate(coalesce(p, ''), 'ÇĞİIÖŞÜÂÎÛçğıöşüâîû', 'cgiiosuaiucgiosuaiu')),
    '[^a-z0-9]+', ' ', 'g'));
$function$;

-- ---------------------------------------------------------------------------
-- Urun gecmisi
-- ---------------------------------------------------------------------------
create table if not exists public.satin_alma_urunleri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ad text not null,
  ad_norm text not null check (ad_norm <> ''),
  kategori text not null,
  birim text not null,
  kullanim integer not null default 1,
  ilk_kullanim timestamptz not null default now(),
  son_kullanim timestamptz not null default now(),
  unique (company_id, ad_norm)
);
comment on table public.satin_alma_urunleri is
  'Daha once siparis verilen urunler: gonderilen satin alma formlarindan otomatik (28.10.2026). Talep formunda oneri.';

alter table public.satin_alma_urunleri enable row level security;
drop policy if exists "Satin alma yetkilisi okur" on public.satin_alma_urunleri;
create policy "Satin alma yetkilisi okur" on public.satin_alma_urunleri for select to authenticated
  using (company_id = get_auth_company_id() and ic_sayfa_yetkisi('satin_alma'));
revoke all on table public.satin_alma_urunleri from anon, authenticated, public;
grant select on table public.satin_alma_urunleri to authenticated;
grant all on table public.satin_alma_urunleri to service_role;

-- Form gonderilince kalemleri gecmise yaz (ayni formda ayni anahtar birden fazla ise tek satir)
create or replace function public.sa_urun_gecmisi_kaydet()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if old.durum = 'taslak' and new.durum = 'bekliyor' and not coalesce(new.test, false) then
    insert into public.satin_alma_urunleri as u (company_id, ad, ad_norm, kategori, birim, kullanim, ilk_kullanim, son_kullanim)
    select new.company_id,
           (array_agg(k.urun order by k.olusturma, k.id))[1],
           x.n,
           (array_agg(k.kategori order by k.olusturma desc, k.id))[1],
           (array_agg(k.birim order by k.olusturma desc, k.id))[1],
           count(*), now(), now()
      from public.satin_alma_kalemleri k
      cross join lateral (select public.sa_urun_norm(k.urun) as n) x
     where k.liste_id = new.id and x.n <> ''
     group by x.n
    on conflict (company_id, ad_norm) do update
      set kullanim = u.kullanim + excluded.kullanim,
          kategori = excluded.kategori,
          birim = excluded.birim,
          son_kullanim = now();
  end if;
  return null;
end; $function$;

drop trigger if exists satin_alma_urun_gecmisi on public.satin_alma_listeleri;
create trigger satin_alma_urun_gecmisi after update of durum on public.satin_alma_listeleri
  for each row execute function public.sa_urun_gecmisi_kaydet();

-- Ice aktarma: bugune kadar gonderilmis (test olmayan) formlarin kalemleri
insert into public.satin_alma_urunleri as u (company_id, ad, ad_norm, kategori, birim, kullanim, ilk_kullanim, son_kullanim)
select l.company_id,
       (array_agg(k.urun order by k.olusturma, k.id))[1],
       x.n,
       (array_agg(k.kategori order by k.olusturma desc, k.id))[1],
       (array_agg(k.birim order by k.olusturma desc, k.id))[1],
       count(*), min(coalesce(l.gonderim_zamani, k.olusturma)), max(coalesce(l.gonderim_zamani, k.olusturma))
  from public.satin_alma_kalemleri k
  join public.satin_alma_listeleri l on l.id = k.liste_id
  cross join lateral (select public.sa_urun_norm(k.urun) as n) x
 where l.durum <> 'taslak' and not coalesce(l.test, false) and x.n <> ''
 group by l.company_id, x.n
on conflict (company_id, ad_norm) do nothing;

-- Talep formu onerileri (en cok / en son kullanilan once)
create or replace function public.sa_token_urunler(p_token text)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  d public.satin_alma_departmanlari;
begin
  d := public.sa_token_departman(p_token);
  if d.id is null then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('ad', x.ad, 'kategori', x.kategori, 'birim', x.birim, 'kullanim', x.kullanim)
                     order by x.kullanim desc, x.son_kullanim desc)
      from (select u.ad, u.kategori, u.birim, u.kullanim, u.son_kullanim
              from public.satin_alma_urunleri u
             where u.company_id = d.company_id
             order by u.kullanim desc, u.son_kullanim desc
             limit 1000) x), '[]'::jsonb);
end; $function$;

-- ---------------------------------------------------------------------------
-- Kalem ekle: 20261027180000 ile ayni + AYNI FORMDA MUKERRER URUN ENGELI
-- ---------------------------------------------------------------------------
create or replace function public.sa_token_kalem_ekle(p_token text, p_kalem jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d public.satin_alma_departmanlari;
  v_liste uuid;
  v_id uuid;
  v_miktar numeric;
  v_var public.satin_alma_kalemleri;
begin
  d := public.sa_token_departman(p_token);
  if d.id is null then
    raise exception 'Bağlantı geçersiz veya departman pasif.' using errcode = 'P0002';
  end if;
  -- Departmanin acik taslagi (yoksa acilir). Ayni anda iki ekleme -> tekil indeks; tekrar okunur.
  select l.id into v_liste from public.satin_alma_listeleri l where l.departman_id = d.id and l.durum = 'taslak' for update;
  if v_liste is null then
    begin
      insert into public.satin_alma_listeleri (company_id, departman_id) values (d.company_id, d.id) returning id into v_liste;
    exception when unique_violation then
      select l.id into v_liste from public.satin_alma_listeleri l where l.departman_id = d.id and l.durum = 'taslak' for update;
    end;
  end if;
  if (select count(*) from public.satin_alma_kalemleri k where k.liste_id = v_liste) >= 100 then
    raise exception 'Bir listede en fazla 100 kalem olabilir. Listeyi gönderip yenisine devam edin.' using errcode = '23514';
  end if;
  begin
    v_miktar := round((p_kalem ->> 'miktar')::numeric, 2);
  exception when others then
    raise exception 'Miktar geçersiz.' using errcode = '23514';
  end;
  if v_miktar is null or v_miktar <= 0 or v_miktar > 1000000 then
    raise exception 'Miktar 0''dan büyük olmalı.' using errcode = '23514';
  end if;
  if coalesce(p_kalem ->> 'kategori', '') not in ('kirtasiye', 'temizlik', 'mutfak', 'elektronik', 'is_guvenligi', 'diger') then
    raise exception 'Kategori seçin.' using errcode = '23514';
  end if;
  if coalesce(p_kalem ->> 'birim', '') not in ('adet', 'paket', 'koli', 'kutu', 'top', 'kg', 'litre', 'metre', 'takim', 'diger') then
    raise exception 'Birim seçin.' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(p_kalem ->> 'urun', ''))) not between 2 and 200 then
    raise exception 'Ürün adını yazın (2–200 karakter).' using errcode = '23514';
  end if;
  if not public.sa_ad_soyad_gecerli(p_kalem ->> 'talep_eden') then
    raise exception 'Talep eden kişinin adını ve soyadını yazın (ör. Ayşe Yılmaz).' using errcode = '23514';
  end if;
  if char_length(coalesce(p_kalem ->> 'aciklama', '')) > 500 then
    raise exception 'Not en fazla 500 karakter olabilir.' using errcode = '23514';
  end if;
  -- 28.10.2026: ayni formda ayni urun ikinci satir olarak eklenmez (miktar artirilir)
  select k.* into v_var from public.satin_alma_kalemleri k
   where k.liste_id = v_liste and public.sa_urun_norm(k.urun) = public.sa_urun_norm(p_kalem ->> 'urun')
   order by k.olusturma limit 1;
  if v_var.id is not null then
    raise exception 'Bu ürün formda zaten var: % · % % (%). Yeni satır yerine mevcut kalemin miktarını artırın.',
      v_var.urun, replace(trim_scale(v_var.miktar)::text, '.', ','),
      case v_var.birim when 'adet' then 'Adet' when 'paket' then 'Paket' when 'koli' then 'Koli' when 'kutu' then 'Kutu'
        when 'top' then 'Top' when 'kg' then 'Kg' when 'litre' then 'Litre' when 'metre' then 'Metre'
        when 'takim' then 'Takım' else 'Diğer' end,
      v_var.talep_eden
      using errcode = '23505';
  end if;
  insert into public.satin_alma_kalemleri (company_id, liste_id, kategori, urun, miktar, birim, aciliyet, aciklama, talep_eden)
  values (
    d.company_id, v_liste, p_kalem ->> 'kategori', btrim(p_kalem ->> 'urun'), v_miktar, p_kalem ->> 'birim',
    case when p_kalem ->> 'aciliyet' = 'acil' then 'acil' else 'normal' end,
    nullif(btrim(coalesce(p_kalem ->> 'aciklama', '')), ''),
    public.sa_ad_soyad_duzelt(p_kalem ->> 'talep_eden'))
  returning id into v_id;
  update public.satin_alma_listeleri set guncelleme = now() where id = v_liste;
  return v_id;
end; $function$;

-- ---------------------------------------------------------------------------
-- Taslaktaki kalemin miktarini guncelle ("Mevcut kalemi 6 Adet yap")
-- p_acil true ise kalem acil olur (normal'e cevirmez).
-- ---------------------------------------------------------------------------
create or replace function public.sa_token_kalem_miktar(p_token text, p_kalem_id uuid, p_miktar numeric, p_acil boolean default false)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d public.satin_alma_departmanlari;
  v_liste uuid;
  v_miktar numeric := round(p_miktar, 2);
begin
  d := public.sa_token_departman(p_token);
  if d.id is null then
    raise exception 'Bağlantı geçersiz veya departman pasif.' using errcode = 'P0002';
  end if;
  if v_miktar is null or v_miktar <= 0 or v_miktar > 1000000 then
    raise exception 'Miktar 0''dan büyük olmalı.' using errcode = '23514';
  end if;
  select l.id into v_liste from public.satin_alma_listeleri l where l.departman_id = d.id and l.durum = 'taslak' for update;
  if v_liste is null or not exists (select 1 from public.satin_alma_kalemleri k where k.id = p_kalem_id and k.liste_id = v_liste) then
    raise exception 'Kalem bulunamadı ya da form gönderilmiş.' using errcode = 'P0002';
  end if;
  update public.satin_alma_kalemleri
     set miktar = v_miktar,
         aciliyet = case when coalesce(p_acil, false) then 'acil' else aciliyet end
   where id = p_kalem_id;
  update public.satin_alma_listeleri set guncelleme = now() where id = v_liste;
  return p_kalem_id;
end; $function$;

revoke all on function public.sa_urun_norm(text) from public, anon;
grant execute on function public.sa_urun_norm(text) to authenticated, service_role;
revoke all on function public.sa_urun_gecmisi_kaydet() from public, anon, authenticated;
revoke all on function public.sa_token_urunler(text) from public, anon, authenticated;
revoke all on function public.sa_token_kalem_ekle(text, jsonb) from public, anon, authenticated;
revoke all on function public.sa_token_kalem_miktar(text, uuid, numeric, boolean) from public, anon, authenticated;
grant execute on function public.sa_token_urunler(text), public.sa_token_kalem_ekle(text, jsonb),
  public.sa_token_kalem_miktar(text, uuid, numeric, boolean) to service_role;
