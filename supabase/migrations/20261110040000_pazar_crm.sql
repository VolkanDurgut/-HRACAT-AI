-- PAZAR (UNEX Satis) CRM - Dalga 3.1: veri altyapisi + fuar listesi ice aktarma (10.11.2026)
--
-- Kullanici kararlari:
--  - "POTANSIYEL MUSTERILERI AYRI TUTMALISIN. ONLARIN DA SIPARISLERINE GORE CRM OLMALI."
--    -> pazar_firmalar.durum: 'potansiyel' | 'musteri'. Ihracat dosyasi / ana siparis acilan alici
--       otomatik 'musteri' (siparis = musteriye donusum). Siparis verisi KOPYALANMAZ; alici_adi ile okunur.
--  - Fuar Excel'i (Gulfood; sayfa = yil/donem) uygulamadaki "Fuar listesi yukle" ekranindan aktarilir.
--    Ulke Excel'den, yoksa telefon kodundan (istemcide, ucretsiz; yapay zeka yok).
--  - Gercek musteri verisi repoda / kodda DURMAZ: yalniz bu tablolarda.
--
-- Erisim: "pazar" sayfa yetkisi + ayni sirket. Tablolar istemciye SADECE OKUNUR;
-- yazma yalniz RPC'lerle (pazar_fuar_aktar) ve tetikleyicilerle.

-- 1) Firma adi anahtari: birlestirme / musteri eslesmesi icin TEK kaynak (istemci de bunu kullanir)
create or replace function public.pazar_anahtar(p_ad text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  s text;
  k text;
begin
  s := upper(translate(coalesce(p_ad, ''),
    'İıŞşĞğÜüÖöÇçÂâÎîÛûÉéÈèÊêËëÁáÀàÄäÅåÓóÒòÔôÕõÚúÙùÑñ',
    'IISSGGUUOOCCAAIIUUEEEEEEEEAAAAAAAAOOOOOOOOUUUUNN'));
  s := regexp_replace(s, '[^A-Z0-9]+', ' ', 'g');
  k := regexp_replace(s,
    '\m(LTD|LIMITED|LLC|LLP|PLC|INC|CORP|CO|COMPANY|SA|SAL|SARL|SARLU|SAS|SL|SRL|SPA|EURL|PTE|PVT|GMBH|BV|CV|DE|FZE|FZCO|FZC|FZ|EST|ETS|STE|GEN|GENERAL|TRADING|TRD|IMPORT|EXPORT|IMP|EXP|AND|THE|FOR|OF)\M',
    ' ', 'g');
  k := regexp_replace(k, '\s+', '', 'g');
  if k = '' then k := regexp_replace(s, '\s+', '', 'g'); end if;
  return k;
end;
$$;

-- 2) Tablolar
create table if not exists public.pazar_firmalar (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  ad text not null,
  anahtar text not null,
  ulke text,
  ulke_kaynagi text check (ulke_kaynagi in ('excel', 'telefon', 'eposta', 'elle')),
  ulke_ham text,
  durum text not null default 'potansiyel' check (durum in ('potansiyel', 'musteri')),
  kaynak text not null default 'fuar' check (kaynak in ('fuar', 'siparis', 'elle')),
  alici_adi text,
  musteri_olma_tarihi timestamptz,
  notlar text,
  olusturan uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, anahtar)
);

create table if not exists public.pazar_kisiler (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  firma_id uuid not null references public.pazar_firmalar(id) on delete cascade,
  ad text,
  eposta text,
  eposta_gecerli boolean not null default true,
  telefonlar text[] not null default '{}',
  whatsapp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pazar_kisiler_firma_idx on public.pazar_kisiler (firma_id);
create index if not exists pazar_kisiler_eposta_idx on public.pazar_kisiler (company_id, lower(eposta));

create table if not exists public.pazar_fuar_katilimlari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  firma_id uuid not null references public.pazar_firmalar(id) on delete cascade,
  fuar text not null,
  yil integer,
  donem text,
  etiket text not null,
  sayfa text,
  satir integer,
  created_at timestamptz not null default now(),
  unique (firma_id, etiket)
);

create table if not exists public.pazar_ice_aktarimlari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  dosya_adi text,
  firma_sayisi integer not null default 0,
  yeni_firma integer not null default 0,
  guncellenen_firma integer not null default 0,
  musteri_eslesen integer not null default 0,
  yeni_kisi integer not null default 0,
  yeni_katilim integer not null default 0,
  olusturan uuid,
  olusturan_email text,
  created_at timestamptz not null default now()
);

comment on table public.pazar_firmalar is 'PAZAR CRM firmalari: potansiyel (fuar) / musteri (siparis acilan alici). 10.11.2026';
comment on table public.pazar_kisiler is 'PAZAR CRM firma yetkilileri (e-posta, telefon, WhatsApp). 10.11.2026';
comment on table public.pazar_fuar_katilimlari is 'PAZAR CRM: firmanin geldigi fuar / yil / donem (Excel sayfasi). 10.11.2026';
comment on table public.pazar_ice_aktarimlari is 'PAZAR CRM fuar listesi ice aktarma kaydi. 10.11.2026';

-- 3) RLS: yalniz okuma (pazar yetkisi + ayni sirket)
alter table public.pazar_firmalar enable row level security;
alter table public.pazar_kisiler enable row level security;
alter table public.pazar_fuar_katilimlari enable row level security;
alter table public.pazar_ice_aktarimlari enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pazar_firmalar', 'pazar_kisiler', 'pazar_fuar_katilimlari', 'pazar_ice_aktarimlari'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (company_id = auth_company_id() and ic_sayfa_yetkisi(''pazar''))', t || '_select', t);
  end loop;
end $$;

drop trigger if exists denetim_pazar_firmalar on public.pazar_firmalar;
create trigger denetim_pazar_firmalar after insert or delete or update on public.pazar_firmalar
  for each row execute function public.denetim_tetikleyici();
drop trigger if exists denetim_pazar_kisiler on public.pazar_kisiler;
create trigger denetim_pazar_kisiler after insert or delete or update on public.pazar_kisiler
  for each row execute function public.denetim_tetikleyici();

-- 4) Siparis -> musteri donusumu
create or replace function public.pazar_musteri_isaretle(p_company uuid, p_alici text, p_tarih timestamptz default now())
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad text := trim(coalesce(p_alici, ''));
  v_anahtar text;
begin
  if p_company is null or v_ad = '' then return; end if;
  v_anahtar := public.pazar_anahtar(v_ad);
  if v_anahtar = '' then return; end if;
  insert into public.pazar_firmalar (company_id, ad, anahtar, durum, kaynak, alici_adi, musteri_olma_tarihi)
  values (p_company, v_ad, v_anahtar, 'musteri', 'siparis', v_ad, coalesce(p_tarih, now()))
  on conflict (company_id, anahtar) do update
     set durum = 'musteri',
         alici_adi = coalesce(pazar_firmalar.alici_adi, excluded.alici_adi),
         musteri_olma_tarihi = least(coalesce(pazar_firmalar.musteri_olma_tarihi, excluded.musteri_olma_tarihi), excluded.musteri_olma_tarihi),
         updated_at = now()
   where pazar_firmalar.durum <> 'musteri'
      or pazar_firmalar.alici_adi is null
      or pazar_firmalar.musteri_olma_tarihi is null
      or pazar_firmalar.musteri_olma_tarihi > excluded.musteri_olma_tarihi;
end;
$$;

create or replace function public.pazar_siparis_tetik()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.pazar_musteri_isaretle(new.company_id, new.alici_firma, coalesce(new.olusturma_tarihi, now()));
  return null;
exception when others then
  -- CRM hicbir kosulda dosya / siparis kaydini bozmaz
  raise warning 'pazar_siparis_tetik: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists trg_pazar_dosya on public.ihracat_dosyalari;
create trigger trg_pazar_dosya after insert or update of alici_firma on public.ihracat_dosyalari
  for each row execute function public.pazar_siparis_tetik();
drop trigger if exists trg_pazar_ana_siparis on public.ana_siparisler;
create trigger trg_pazar_ana_siparis after insert or update of alici_firma on public.ana_siparisler
  for each row execute function public.pazar_siparis_tetik();

-- 5) Istemci RPC'leri
-- Ad listesi -> anahtar listesi (ayni sira). Onizlemede birlestirme sunucuyla birebir ayni olsun diye.
create or replace function public.pazar_anahtarlar(p_adlar text[])
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not ic_sayfa_yetkisi('pazar') then raise exception 'Yetkisiz.'; end if;
  if coalesce(array_length(p_adlar, 1), 0) > 5000 then raise exception 'En fazla 5000 ad.'; end if;
  return coalesce((select array_agg(public.pazar_anahtar(x) order by o) from unnest(p_adlar) with ordinality as t(x, o)), '{}');
end;
$$;

-- Fuar listesi aktarma: tek islem (hepsi ya da hicbiri). Tekrar yuklemek guvenli (birlestirir, kopya olusturmaz).
-- p_firmalar: [{ad, ulke, ulke_kaynagi, ulke_ham, kisiler:[{ad, eposta, eposta_gecerli, telefonlar[], whatsapp}],
--               katilimlar:[{fuar, yil, donem, etiket, sayfa, satir}]}]
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

    insert into public.pazar_firmalar (company_id, ad, anahtar, ulke, ulke_kaynagi, ulke_ham, durum, kaynak, olusturan)
    values (v_sirket, v_ad, v_anahtar, v_ulke, v_kaynak, nullif(left(trim(coalesce(f ->> 'ulke_ham', '')), 200), ''), 'potansiyel', 'fuar', auth.uid())
    on conflict (company_id, anahtar) do update
       set ulke = coalesce(pazar_firmalar.ulke, excluded.ulke),
           ulke_kaynagi = case when pazar_firmalar.ulke is null then excluded.ulke_kaynagi else pazar_firmalar.ulke_kaynagi end,
           ulke_ham = coalesce(pazar_firmalar.ulke_ham, excluded.ulke_ham),
           updated_at = now()
    returning id, (xmax = 0), durum into v_firma, v_yeni, v_durum;

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
        -- Yalniz adi olan yetkili: tekrar yuklemede kopya olusmasin
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

revoke all on function public.pazar_anahtar(text) from public, anon;
revoke all on function public.pazar_musteri_isaretle(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.pazar_siparis_tetik() from public, anon, authenticated;
revoke all on function public.pazar_anahtarlar(text[]) from public, anon;
revoke all on function public.pazar_fuar_aktar(text, jsonb) from public, anon;
grant execute on function public.pazar_anahtar(text) to authenticated;
grant execute on function public.pazar_anahtarlar(text[]) to authenticated;
grant execute on function public.pazar_fuar_aktar(text, jsonb) to authenticated;

-- 6) Mevcut alicilar -> musteri (ilk dosya / siparis tarihiyle)
do $$
declare r record;
begin
  for r in
    select company_id, trim(alici_firma) as alici, min(tarih) as tarih
    from (
      select company_id, alici_firma, olusturma_tarihi as tarih from public.ihracat_dosyalari
      union all
      select company_id, alici_firma, olusturma_tarihi from public.ana_siparisler
    ) x
    where company_id is not null and nullif(trim(alici_firma), '') is not null
    group by company_id, trim(alici_firma)
  loop
    perform public.pazar_musteri_isaretle(r.company_id, r.alici, r.tarih);
  end loop;
end $$;

-- 7) Sayfa yetkisi: super adminler (Volkan Bey, Burak Bey) + satis (Harun Bey export@, export2@).
--    Digerleri Ayarlar > Yetkilendirme'den.
update public.kullanici_yetkileri
   set sayfa_yetkileri = coalesce(sayfa_yetkileri, '{}'::jsonb) || '{"pazar": true}'::jsonb
 where lower(email) in ('execution@unex.com.tr', 'bbt@unex.com.tr', 'export@unex.com.tr', 'export2@unex.com.tr');
